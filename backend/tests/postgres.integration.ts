import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";

config({ path: ["../.env", "../../legal_route_ai/.env.local"].map((p) => fileURLToPath(new URL(p, import.meta.url))), quiet: true });

test("PostgreSQL: migrations, magic-link/session lifecycle, and simultaneous scheduling", async () => {
  assert.ok(process.env.DATABASE_URL, "Set DATABASE_URL to a local PostgreSQL role allowed to create a temporary database.");
  const original = process.env.DATABASE_URL;
  const fixtureEnv = ["GOOGLE_SHEETS_CLIENT_ID", "GOOGLE_SHEETS_CLIENT_SECRET", "CONNECTOR_ENCRYPTION_KEY", "APP_URL"];
  const savedEnv = new Map(fixtureEnv.map((key) => [key, process.env[key]]));
  process.env.GOOGLE_SHEETS_CLIENT_ID = "test-client";
  process.env.GOOGLE_SHEETS_CLIENT_SECRET = "test-secret";
  process.env.CONNECTOR_ENCRYPTION_KEY = "ab".repeat(32);
  process.env.APP_URL = "http://localhost:3000";
  const admin = postgres(original, { max: 1 });
  const name = `legalroute_test_${randomUUID().replaceAll("-", "")}`;
  let close: (() => Promise<void>) | undefined;
  let created = false;
  try {
    await admin.unsafe(`CREATE DATABASE "${name}"`);
    created = true;
    const url = new URL(original);
    url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    const data = await import("../src/db/index.js");
    close = data.closeDatabase;
    await migrate(data.db, { migrationsFolder: fileURLToPath(new URL("../drizzle/", import.meta.url)) });
    const auth = await import("../src/services/auth.js");
    const scheduling = await import("../src/services/scheduling/service.js");
    const token = await auth.issueLoginToken(" Attorney@Example.test ");
    const peek = await auth.peekLoginToken(token);
    assert.equal(peek?.email, "attorney@example.test");
    assert.notEqual(peek?.tokenHash, token);
    assert.equal(await auth.consumeLoginToken(token), "attorney@example.test");
    assert.equal(await auth.consumeLoginToken(token), null);
    assert.equal(await auth.peekLoginToken(token), null);
    const user = await auth.findOrCreateUser("attorney@example.test");
    const session = await auth.createSession(user.id);
    const actor = await auth.currentUserForToken(session.token);
    assert.ok(actor);
    const input = { title: "Concurrent consultation", startsAt: "2026-12-01T09:00:00-08:00", endsAt: "2026-12-01T09:30:00-08:00", timeZone: "America/Los_Angeles", location: "", notes: "", attendees: [] };
    const results = await Promise.allSettled([scheduling.saveAppointment(actor, input), scheduling.saveAppointment(actor, input)]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const failed = results.find((r) => r.status === "rejected");
    assert.ok(failed?.status === "rejected");
    assert.match(String(failed.reason), /overlaps/);
    const id = results.find((r) => r.status === "fulfilled");
    assert.ok(id?.status === "fulfilled");
    await scheduling.cancelAppointment(actor, id.value, 1);
    await scheduling.saveAppointment(actor, input);
    const connector = await import("../src/connectors/service.ts");
    const begun = await connector.beginConnection(actor);
    const consent = new URL(begun.url);
    assert.equal(consent.searchParams.get("code_challenge_method"), "S256");
    assert.equal(consent.searchParams.get("state"), begun.state);
    const fakeGoogle: typeof fetch = async (url) => String(url).includes("/token")
      ? Response.json({ access_token: "mock-access", refresh_token: "mock-refresh", scope: "openid email https://www.googleapis.com/auth/spreadsheets.readonly", expires_in: 3600 })
      : Response.json({ sub: "google-account", email: "owner@example.test", email_verified: true });
    await connector.finishConnection(actor, begun.state, "mock-code", fakeGoogle);
    await assert.rejects(connector.finishConnection(actor, begun.state, "mock-code", fakeGoogle), /expired/);
    const savedConnections = await data.db.select().from(data.connectorConnections);
    assert.equal(savedConnections.length, 1);
    assert.ok(!savedConnections[0].encryptedCredentials?.includes("mock-access"));
    let pause = false;
    let releaseRead: (() => void) | undefined;
    let reachedRead: (() => void) | undefined;
    const fakeSheets: typeof fetch = async (url) => {
      if (String(url).includes("/values/")) {
        if (pause) { reachedRead?.(); await new Promise<void>((resolve) => { releaseRead = resolve; }); }
        return Response.json({ values: [["Referral", "Count"], ["Example source", "3"]] });
      }
      return Response.json({ spreadsheetId: "example_sheet_1234567890", properties: { title: "Test spreadsheet" }, sheets: [{ properties: { sheetId: 0, title: "Data", gridProperties: { rowCount: 100, columnCount: 5 } } }] });
    };
    const datasetService = connector.createDatasetService(data.db, fakeSheets);
    const preview = await datasetService.inspect(actor, savedConnections[0].id, "example_sheet_1234567890", 0);
    assert.ok(preview.preview);
    const datasetId = await datasetService.save(actor, { connectionId: savedConnections[0].id, spreadsheet: "example_sheet_1234567890", sheetId: 0, name: "Referrals test dataset", contentHash: preview.preview.contentHash, types: ["text", "number"] });
    pause = true;
    const reading = new Promise<void>((resolve) => { reachedRead = resolve; });
    const firstRefresh = datasetService.refresh(actor, datasetId);
    await reading;
    await assert.rejects(datasetService.refresh(actor, datasetId), /already running/);
    releaseRead?.(); await firstRefresh;
    pause = false;
    assert.equal((await datasetService.table(actor, datasetId)).rows[0].values.c1, 3);
    const { intakeImportService } = await import("../src/services/intake-import-service.ts");
    const generatedIntake = await intakeImportService.previewDataset(actor, datasetId, "headers");
    const importedTemplateId = await intakeImportService.createDraft(actor, "Imported intake HTTP test", generatedIntake);
    assert.equal(generatedIntake.sections[0].questions[0].required, false);
    const { conflictService } = await import("../src/services/conflicts/service.ts");
    const { eq } = await import("drizzle-orm");
    // A dedicated cached registry fixture avoids calling any real Google account.
    const [registry] = await data.db.insert(data.datasets).values({ lawFirmId: actor.firm.id, connectionId: savedConnections[0].id, name: "Conflict party registry", spreadsheetId: "mock_registry", sheetId: 0, sourceTitle: "Mock", sheetTitle: "Parties" }).returning();
    const [registrySnapshot] = await data.db.insert(data.datasetSnapshots).values({ lawFirmId: actor.firm.id, datasetId: registry.id, schemaHash: "test", rowCount: 1, columns: [{ id: "name", header: "Name", label: "Name", type: "text" }, { id: "role", header: "Role", label: "Role", type: "text" }] }).returning();
    await data.db.insert(data.datasetRows).values({ lawFirmId: actor.firm.id, snapshotId: registrySnapshot.id, position: 1, raw: { name: "Existing Defendant", role: "defendant" }, values: { name: "Existing Defendant", role: "defendant" } });
    await conflictService.configure(actor, registry.id, { name: "name", role: "role" });
    const [conflictIntake] = await data.db.insert(data.intakeSessions).values({ lawFirmId: actor.firm.id, clientName: "Prospective Conflict Client", status: "pending_review" }).returning();
    await assert.rejects(conflictService.accept(actor, conflictIntake.id), /conflict check/);
    const conflictCheckId = await conflictService.run(actor, { intakeId: conflictIntake.id, subjects: [{ name: "Prospective Conflict Client", role: "client" }, { name: "Existing Defendant", role: "opposing" }], opposingComplete: true });
    await conflictService.review(actor, conflictCheckId, { decision: "clear", notes: "Test attorney reviewed the identities and recorded a decision." });
    const convertedIds = await Promise.all([conflictService.accept(actor, conflictIntake.id), conflictService.accept(actor, conflictIntake.id)]);
    assert.equal(convertedIds[0], convertedIds[1], "Concurrent approval must create only one client");
    assert.equal((await data.db.select().from(data.clients).where(eq(data.clients.id, convertedIds[0]))).length, 1);
    if (process.env.TEST_WEB === "1") {
      // Smoke-test the built Next.js adapter against this same isolated database.
      const portFinder = createServer();
      portFinder.listen(0, "127.0.0.1");
      await once(portFinder, "listening");
      const address = portFinder.address();
      assert.ok(address && typeof address !== "string");
      const port = address.port;
      await new Promise<void>((resolve) => portFinder.close(() => resolve()));
      const dev = process.env.TEST_WEB_MODE === "development";
      const server = spawn(process.execPath, [fileURLToPath(new URL("../../node_modules/next/dist/bin/next", import.meta.url)), dev ? "dev" : "start", "--hostname", "127.0.0.1", "--port", String(port)], {
        cwd: fileURLToPath(new URL("../../legal_route_ai/", import.meta.url)),
        env: { ...process.env, NODE_ENV: dev ? "development" : "production", NEXT_TELEMETRY_DISABLED: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let logs = "";
      server.stdout.on("data", (chunk) => { logs += String(chunk); });
      server.stderr.on("data", (chunk) => { logs += String(chunk); });
      try {
        const base = `http://127.0.0.1:${port}`;
        let ready = false;
        for (let attempt = 0; attempt < 60; attempt++) {
          try { const response = await fetch(`${base}/login`, { signal: AbortSignal.timeout(15000) }); if (response.ok) { ready = true; break; } if (response.status === 500) break; } catch { /* waiting for startup */ }
          if (server.exitCode !== null) break;
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        assert.ok(ready, `Test web server did not start: ${logs.slice(-6000)}`);
        const anonymous = await fetch(`${base}/calendar`, { redirect: "manual" });
        assert.equal(anonymous.status, 307);
        assert.match(anonymous.headers.get("location") ?? "", /\/login/);
        const calendar = await fetch(`${base}/calendar`, { headers: { cookie: `lr_session=${session.token}` } });
        assert.equal(calendar.status, 200, logs);
        const page = await calendar.text();
        assert.ok(page.includes("Schedule and manage your appointments in LegalRoute."), "Calendar server page should render");
        assert.ok(page.includes("Concurrent consultation"), "Calendar should serialize the test appointment for hydration");
        assert.ok(!page.includes("Application error"), "Calendar must not render an application error");
        const connectionsPage = await fetch(`${base}/connections`, { headers: { cookie: `lr_session=${session.token}` } });
        assert.equal(connectionsPage.status, 200);
        assert.ok((await connectionsPage.text()).includes("Add a table"), "Connections page should show the connected account builder");
        const conflictsPage = await fetch(`${base}/conflicts?check=${conflictCheckId}`, { headers: { cookie: `lr_session=${session.token}` } });
        assert.equal(conflictsPage.status, 200, logs);
        const conflictsHtml = await conflictsPage.text();
        assert.ok(conflictsHtml.includes("Conflict Checks"));
        assert.ok(conflictsHtml.includes("Existing Defendant"));
        assert.ok(conflictsHtml.includes("Review history"));
        const linkedCheckPage = await fetch(`${base}/conflicts?intake=${conflictIntake.id}`, { headers: { cookie: `lr_session=${session.token}` } });
        assert.equal(linkedCheckPage.status, 200, logs);
        const importPage = await fetch(`${base}/connections/intake`, { headers: { cookie: `lr_session=${session.token}` } });
        assert.equal(importPage.status, 200, logs);
        const importHtml = await importPage.text();
        assert.ok(importHtml.includes("Generate an intake form"));
        assert.ok(importHtml.includes("Referrals test dataset"));
        assert.ok(importHtml.includes("Preview questions"));
        const draftPage = await fetch(`${base}/intake-builder/${importedTemplateId}`, { headers: { cookie: `lr_session=${session.token}` } });
        assert.equal(draftPage.status, 200, logs);
        const draftHtml = await draftPage.text();
        assert.ok(draftHtml.includes("Imported intake HTTP test"));
        assert.ok(draftHtml.includes("Move up"));
        assert.ok(draftHtml.includes("Required"));
        const datasetPage = await fetch(`${base}/datasets/${datasetId}`, { headers: { cookie: `lr_session=${session.token}` } });
        assert.equal(datasetPage.status, 200);
        const datasetHtml = await datasetPage.text();
        assert.ok(datasetHtml.includes("Referrals test dataset"));
        assert.ok(datasetHtml.includes("Example source"));
        const oauth = await fetch(`${base}/api/connectors/google-sheets/connect`, { headers: { cookie: `lr_session=${session.token}` }, redirect: "manual" });
        assert.equal(oauth.status, 307);
        assert.equal(new URL(oauth.headers.get("location")!).hostname, "accounts.google.com");
        const rejected = await fetch(`${base}/api/connectors/google-sheets/callback?code=fake&state=wrong`, { headers: { cookie: `lr_session=${session.token}; lr_sheets_oauth=different` }, redirect: "manual" });
        assert.match(rejected.headers.get("location") ?? "", /error=oauth_state/);
      } finally {
        if (server.exitCode === null) { server.kill("SIGTERM"); await once(server, "exit"); }
      }
    }
    await auth.revokeSession(session.token);
    assert.equal(await auth.currentUserForToken(session.token), null);
  } finally {
    if (close) await close();
    process.env.DATABASE_URL = original;
    for (const [key, value] of savedEnv) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    if (created) await admin.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  }
});
