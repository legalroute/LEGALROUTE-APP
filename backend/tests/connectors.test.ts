import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../src/db/schema.ts";
import type { CurrentUser } from "../src/services/auth.ts";
import { decrypt, encrypt } from "../src/connectors/secrets.ts";
import { normalize, prepare, spreadsheetId } from "../src/connectors/values.ts";

process.env.CONNECTOR_ENCRYPTION_KEY = randomBytes(32).toString("hex");
const sourceId = "example_sheet_1234567890";
test("column inference preserves identifiers, detects invalid conversions, and restricts source URLs", () => {
  const p = prepare([["ID", "", "ID", "Date"], ["001", "TRUE", "12.5", "2026-11-08"]]);
  assert.deepEqual(p.columns.map((c) => c.type), ["text", "boolean", "number", "date"]);
  assert.equal(p.columns[1].label, "Column 2");
  assert.notEqual(p.columns[0].id, p.columns[2].id);
  assert.equal(normalize("2026-02-30", "date"), undefined);
  assert.equal(normalize("12345678901234567890", "number"), undefined);
  assert.equal(spreadsheetId(`https://docs.google.com/spreadsheets/d/${sourceId}/edit`), sourceId);
  assert.throws(() => spreadsheetId(`https://attacker.test/spreadsheets/d/${sourceId}`));
});
test("connector secrets are authenticated and bound to account context", () => {
  const secret = encrypt({ refreshToken: "test-refresh-secret" }, "firm-a");
  assert.ok(!secret.includes("test-refresh-secret"));
  assert.deepEqual(decrypt(secret, "firm-a"), { refreshToken: "test-refresh-secret" });
  assert.throws(() => decrypt(secret, "firm-b"));
  assert.throws(() => decrypt(secret.slice(0, -8) + "XXXXXXXX", "firm-a"));
});

test("dataset lifecycle: firm isolation, atomic refresh, schema review, stale edits and disconnect races", { timeout: 15000 }, async () => {
  process.env.DATABASE_URL ??= "postgres://localhost/unused_connector_test";
  const { createDatasetService } = await import("../src/connectors/service.ts");
  const pg = await PGlite.create();
  try {
    const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
    for (const entry of journal.entries as { tag: string }[]) await pg.exec(await readFile(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
    const firm = randomUUID(), otherFirm = randomUUID(), ownerId = randomUUID(), colleagueId = randomUUID(), staffId = randomUUID();
    await pg.query("INSERT INTO law_firms (id,name,slug) VALUES ($1,'A','a'),($2,'B','b')", [firm, otherFirm]);
    await pg.query("INSERT INTO users (id,email,law_firm_id) VALUES ($1,'owner@test.example',$2),($3,'colleague@test.example',$2),($4,'staff@test.example',$2)", [ownerId, firm, colleagueId, staffId]);
    const actor = { id: ownerId, role: "attorney", firm: { id: firm } } as CurrentUser;
    const colleague = { ...actor, id: colleagueId } as CurrentUser;
    const staff = { ...actor, id: staffId, role: "staff" } as CurrentUser;
    const foreign = { ...actor, firm: { id: otherFirm } } as CurrentUser;
    const id = randomUUID();
    const encrypted = encrypt({ accessToken: "test-access", refreshToken: "test-refresh", expiresAt: Date.now() + 3600000 }, `google-sheets:${firm}:${ownerId}:google-1`);
    await pg.query("INSERT INTO connector_connections (id,law_firm_id,connected_by_user_id,provider_account_id,account_email,scopes,encrypted_credentials) VALUES ($1,$2,$3,'google-1','owner@test.example',ARRAY['readonly'],$4)", [id, firm, ownerId, encrypted]);
    let sheet = [["ID", "Amount", "Active"], ["001", "10", "TRUE"], ["002", "20", "FALSE"]];
    let fail = false, block = false;
    let release: (() => void) | undefined, reading: (() => void) | undefined;
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/values/")) {
        if (block) { reading?.(); await new Promise<void>((resolve) => { release = resolve; }); }
        if (fail) return new Response("denied", { status: 403 });
        return Response.json({ values: sheet });
      }
      return Response.json({ spreadsheetId: sourceId, properties: { title: "Test source" }, sheets: [{ properties: { sheetId: 0, title: "Data", gridProperties: { rowCount: 100, columnCount: 5 } } }] });
    };
    const service = createDatasetService(drizzle(pg, { schema }) as unknown as Parameters<typeof createDatasetService>[0], fetcher);
    const preview = await service.inspect(actor, id, sourceId, 0);
    assert.ok(preview.preview);
    const input = { connectionId: id, spreadsheet: sourceId, sheetId: 0, name: "Office inventory", contentHash: preview.preview.contentHash, types: preview.preview.columns.map((c) => c.type) };
    const datasetId = await service.save(actor, input);
    let table = await service.table(staff, datasetId);
    assert.equal(table.snapshot?.rowCount, 2);
    assert.equal(table.rows[0].values.c0, "001");
    assert.equal(table.rows[0].values.c1, 10);
    assert.equal(table.rows[0].values.c2, true);
    await assert.rejects(service.table(foreign, datasetId), /unavailable/);
    await assert.rejects(service.inspect(foreign, id, sourceId, 0), /unavailable/);
    await assert.rejects(service.refresh(staff, datasetId), /attorney/);
    await assert.rejects(service.refresh(colleague, datasetId), /owner/);
    const previous = table.snapshot?.id;
    fail = true;
    await assert.rejects(service.refresh(actor, datasetId), /access was denied/);
    assert.equal((await service.table(actor, datasetId)).snapshot?.id, previous);
    fail = false;
    sheet = [sheet[0], sheet[2], sheet[1]];
    await service.refresh(actor, datasetId);
    table = await service.table(actor, datasetId);
    assert.equal(table.rows[0].values.c0, "002");
    assert.notEqual(table.snapshot?.id, previous);
    sheet[0][1] = "Price";
    await assert.rejects(service.refresh(actor, datasetId), /Columns changed/);
    const review = await service.inspect(actor, id, sourceId, 0);
    assert.ok(review.preview);
    const revision = table.dataset.version;
    await assert.rejects(service.save(actor, { ...input, datasetId, version: revision - 1, contentHash: review.preview.contentHash }), /changed/);
    await service.save(actor, { ...input, datasetId, version: revision, contentHash: review.preview.contentHash });
    sheet[1][1] = "not numeric";
    await service.refresh(actor, datasetId);
    table = await service.table(actor, datasetId);
    assert.equal(table.rows[0].values.c1, "not numeric");
    assert.deepEqual(table.rows[0].errors, ["c1"]);
    block = true;
    const started = new Promise<void>((resolve) => { reading = resolve; });
    const refresh = service.refresh(actor, datasetId);
    await started;
    await service.disconnect(actor, id);
    release?.();
    await assert.rejects(refresh, /disconnected/);
    table = await service.table(actor, datasetId);
    assert.equal(table.snapshot, undefined);
    assert.equal(table.rows.length, 0);
    assert.equal((await pg.query("SELECT * FROM dataset_rows")).rows.length, 0);
    const { rows: connection } = await pg.query<{ encrypted_credentials: string | null }>("SELECT encrypted_credentials FROM connector_connections WHERE id=$1", [id]);
    assert.equal(connection[0].encrypted_credentials, null);
  } finally { await pg.close(); }
});

test("Google adapter refreshes expired tokens and bounds spreadsheet reads", async () => {
  const { usableTokens, readTab, googleJson } = await import("../src/connectors/google-sheets.ts");
  const old = { accessToken: "expired-token", refreshToken: "retained-refresh", expiresAt: 0 };
  let called = 0;
  const next = await usableTokens(old, async (_url, init) => {
    called++;
    assert.ok(String(init?.body).includes("grant_type=refresh_token"));
    return Response.json({ access_token: "new-token", expires_in: 3600 });
  });
  assert.equal(next.accessToken, "new-token");
  assert.equal(next.refreshToken, old.refreshToken);
  await usableTokens(next, async () => { throw new Error("Must not refresh a current token"); });
  assert.equal(called, 1);
  await assert.rejects(readTab("test", sourceId, 0, async () => Response.json({ spreadsheetId: sourceId, properties: { title: "Large" }, sheets: [{ properties: { sheetId: 0, title: "Data", gridProperties: { rowCount: 99999, columnCount: 5 } } }] })), /Resize/);
  await assert.rejects(googleJson("https://sheets.googleapis.com/test", {}, async () => new Response("x".repeat(5 * 1024 * 1024 + 1))), /5 MB/);
});
