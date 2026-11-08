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
      } finally {
        if (server.exitCode === null) { server.kill("SIGTERM"); await once(server, "exit"); }
      }
    }
    await auth.revokeSession(session.token);
    assert.equal(await auth.currentUserForToken(session.token), null);
  } finally {
    if (close) await close();
    process.env.DATABASE_URL = original;
    if (created) await admin.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  }
});
