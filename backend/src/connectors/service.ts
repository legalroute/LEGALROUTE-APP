import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { connectorConnections as connections, connectorOAuthStates as states, connectorRuns as runs, datasets, datasetSnapshots as snapshots, datasetRows as rows, db, type DatasetColumn } from "../db/index.ts";
import type { CurrentUser } from "../services/auth.ts";
import { configured, decrypt, encrypt } from "./secrets.ts";
import * as google from "./google-sheets.ts";
import { ConnectorError, convertRows, prepare, spreadsheetId } from "./values.ts";
export { ConnectorError } from "./values.ts";
export { configured } from "./secrets.ts";

type Database = Pick<typeof db, "transaction">;
type Connection = typeof connections.$inferSelect;
const scope = (user: CurrentUser, id: string) => and(eq(connections.id, id), eq(connections.lawFirmId, user.firm.id));
const context = (c: Connection) => `google-sheets:${c.lawFirmId}:${c.connectedByUserId}:${c.providerAccountId}`;
const secretSchema = z.object({ accessToken: z.string(), refreshToken: z.string(), expiresAt: z.number() });
function manager(user: CurrentUser) { if (!["attorney", "admin"].includes(user.role)) throw new ConnectorError("An attorney or firm administrator must manage connections."); }
function owner(user: CurrentUser, connection: Connection) { manager(user); if (connection.connectedByUserId !== user.id && user.role !== "admin") throw new ConnectorError("Only the connection owner or firm administrator can manage this source."); }
const digest = (s: string) => createHash("sha256").update(s).digest("hex");

export async function beginConnection(user: CurrentUser) {
  manager(user); if (!configured()) throw new ConnectorError("Google Sheets is not configured on this server.");
  const state = randomBytes(32).toString("base64url"), verifier = randomBytes(32).toString("base64url");
  await db.delete(states).where(and(eq(states.userId, user.id), lt(states.expiresAt, new Date())));
  await db.insert(states).values({ tokenHash: digest(state), userId: user.id, encryptedVerifier: encrypt(verifier, `oauth:${user.id}`), redirectUri: google.callbackUri(), expiresAt: new Date(Date.now() + 600000) });
  return { state, url: google.consentUrl(state, createHash("sha256").update(verifier).digest("base64url")) };
}
export async function finishConnection(user: CurrentUser, state: string, code: string, fetcher: typeof fetch = fetch) {
  manager(user);
  const [attempt] = await db.delete(states).where(and(eq(states.tokenHash, digest(state)), eq(states.userId, user.id), gt(states.expiresAt, new Date()))).returning();
  if (!attempt) throw new ConnectorError("The connection request expired. Please reconnect.");
  const verifier = z.string().parse(decrypt(attempt.encryptedVerifier, `oauth:${user.id}`));
  const result = await google.exchange(code, verifier, attempt.redirectUri, fetcher);
  const values = { lawFirmId: user.firm.id, connectedByUserId: user.id, provider: "google_sheets", providerAccountId: result.accountId, accountEmail: result.email, scopes: result.scopes, status: "connected", updatedAt: new Date() };
  const encryptedCredentials = encrypt(result.tokens, context({ ...values } as Connection));
  await db.insert(connections).values({ ...values, encryptedCredentials }).onConflictDoUpdate({ target: [connections.lawFirmId, connections.connectedByUserId, connections.provider, connections.providerAccountId], set: { ...values, encryptedCredentials, version: sql`${connections.version} + 1` } });
}
export function createDatasetService(database: Database = db, fetcher: typeof fetch = fetch) {
  async function withConnection<T>(user: CurrentUser, id: string, operation: (c: Connection, token: string) => Promise<T>) {
    const connection = await database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`connector:${id}`}, 0))`);
      const [c] = await tx.select().from(connections).where(scope(user, id));
      if (!c || c.provider !== "google_sheets" || c.status !== "connected" || !c.encryptedCredentials) throw new ConnectorError("Connection unavailable. Reconnect Google.");
      owner(user, c);
      const old = secretSchema.parse(decrypt(c.encryptedCredentials, context(c)));
      const next = await google.usableTokens(old, fetcher);
      if (next !== old) await tx.update(connections).set({ encryptedCredentials: encrypt(next, context(c)), updatedAt: new Date() }).where(scope(user, id));
      return { c, token: next.accessToken };
    });
    return operation(connection.c, connection.token);
  }
  async function inspect(user: CurrentUser, connectionId: string, source: string, sheetId?: number) {
    const id = spreadsheetId(source);
    return withConnection(user, z.string().uuid().parse(connectionId), async (_c, token) => {
      if (sheetId === undefined) return { metadata: await google.metadata(token, id, fetcher) };
      const tab = await google.readTab(token, id, sheetId, fetcher);
      return { source: tab, preview: prepare(tab.values) };
    });
  }
  async function publish(user: CurrentUser, c: Connection, source: google.Source, name: string, columns: DatasetColumn[], datasetId?: string, expectedVersion?: number, refreshRunId?: string) {
    const prepared = prepare(source.values), converted = convertRows(source.values, columns);
    return database.transaction(async (tx) => {
      // Same connection lock as disconnect and token refresh; disconnected reads cannot publish.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`connector:${c.id}`}, 0))`);
      const [active] = await tx.select().from(connections).where(scope(user, c.id));
      if (!active || active.status !== "connected" || active.version !== c.version) throw new ConnectorError("Connection was disconnected while reading. Reconnect first.");
      owner(user, active);
      if (refreshRunId) {
        const [run] = await tx.select().from(runs).where(and(eq(runs.id, refreshRunId), eq(runs.status, "running"), eq(runs.lawFirmId, user.firm.id)));
        if (!run) throw new ConnectorError("This refresh was cancelled or expired. Please retry.");
      }
      let id = datasetId;
      if (id) {
        const [existing] = await tx.select().from(datasets).where(and(eq(datasets.id, id), eq(datasets.lawFirmId, user.firm.id), eq(datasets.connectionId, c.id)));
        if (!existing) throw new ConnectorError("Dataset unavailable.");
        if (existing.version !== expectedVersion) throw new ConnectorError("Dataset changed during this operation. Reload and preview again.");
        await tx.update(datasets).set({ version: sql`${datasets.version} + 1`, name, spreadsheetId: source.spreadsheetId, sheetId: source.sheetId, sourceTitle: source.title, sheetTitle: source.sheetTitle, updatedAt: new Date() }).where(eq(datasets.id, id));
      } else {
        id = randomUUID();
        await tx.insert(datasets).values({ id, lawFirmId: user.firm.id, connectionId: c.id, name, spreadsheetId: source.spreadsheetId, sheetId: source.sheetId, sourceTitle: source.title, sheetTitle: source.sheetTitle });
      }
      await tx.update(snapshots).set({ active: false }).where(and(eq(snapshots.datasetId, id), eq(snapshots.lawFirmId, user.firm.id)));
      const [snapshot] = await tx.insert(snapshots).values({ lawFirmId: user.firm.id, datasetId: id, schemaHash: prepared.schemaHash, columns, rowCount: converted.length }).returning();
      for (let offset = 0; offset < converted.length; offset += 250) await tx.insert(rows).values(converted.slice(offset, offset + 250).map((r) => ({ ...r, lawFirmId: user.firm.id, snapshotId: snapshot.id })));
      // Retain only the active snapshot: bounded storage, no unadvertised history retention.
      await tx.delete(snapshots).where(and(eq(snapshots.datasetId, id), eq(snapshots.active, false)));
      if (refreshRunId) await tx.update(runs).set({ status: "succeeded", rowCount: converted.length, finishedAt: new Date() }).where(eq(runs.id, refreshRunId));
      if (!refreshRunId) await tx.insert(runs).values({ lawFirmId: user.firm.id, datasetId: id, status: "succeeded", rowCount: converted.length, finishedAt: new Date() });
      return id;
    });
  }
  async function save(user: CurrentUser, input: unknown) {
    const d = z.object({ datasetId: z.string().uuid().optional(), version: z.number().int().positive().optional(), connectionId: z.string().uuid(), spreadsheet: z.string(), sheetId: z.number().int().nonnegative(), name: z.string().trim().min(1).max(150), contentHash: z.string().length(64), types: z.array(z.enum(["text", "number", "date", "boolean"])).min(1).max(100) }).parse(input);
    return withConnection(user, d.connectionId, async (c, token) => {
      const source = await google.readTab(token, spreadsheetId(d.spreadsheet), d.sheetId, fetcher), p = prepare(source.values);
      if (p.contentHash !== d.contentHash || d.types.length !== p.columns.length) throw new ConnectorError("The sheet changed since preview. Preview it again before saving.");
      return publish(user, c, source, d.name, p.columns.map((col, i) => ({ ...col, type: d.types[i] })), d.datasetId, d.version);
    });
  }
  async function refresh(user: CurrentUser, id: string) {
    manager(user); z.string().uuid().parse(id);
    const runId = randomUUID();
    const record = await database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`refresh:${id}`}, 0))`);
      const [d] = await tx.select().from(datasets).where(and(eq(datasets.id, id), eq(datasets.lawFirmId, user.firm.id)));
      if (!d) throw new ConnectorError("Dataset unavailable.");
      const [c] = await tx.select().from(connections).where(scope(user, d.connectionId));
      if (!c || c.status !== "connected") throw new ConnectorError("Connection unavailable."); owner(user, c);
      const [running] = await tx.select().from(runs).where(and(eq(runs.datasetId, id), eq(runs.status, "running")));
      if (running && Date.now() - running.startedAt.getTime() < 600000) throw new ConnectorError("A refresh is already running.");
      if (running) await tx.update(runs).set({ status: "failed", error: "Previous refresh timed out.", finishedAt: new Date() }).where(eq(runs.id, running.id));
      await tx.insert(runs).values({ id: runId, lawFirmId: user.firm.id, datasetId: id });
      return d;
    });
    try {
      await withConnection(user, record.connectionId, async (c, token) => {
        const source = await google.readTab(token, record.spreadsheetId, record.sheetId, fetcher), p = prepare(source.values);
        const [previous] = await database.transaction((tx) => tx.select().from(snapshots).where(and(eq(snapshots.datasetId, id), eq(snapshots.lawFirmId, user.firm.id), eq(snapshots.active, true))));
        if (!previous) throw new ConnectorError("Cached data unavailable. The connection may have been disconnected. Reconnect and review the source.");
        if (previous.schemaHash !== p.schemaHash) throw new ConnectorError("Columns changed. Use Review source to preview and confirm the new columns.");
        await publish(user, c, source, record.name, previous.columns, id, record.version, runId);
        return p.rowCount;
      });
    } catch (error) {
      await database.transaction((tx) => tx.update(runs).set({ status: "failed", error: error instanceof ConnectorError ? error.message : "Refresh failed. Please retry.", finishedAt: new Date() }).where(and(eq(runs.id, runId), eq(runs.status, "running"))));
      throw error;
    }
  }
  async function disconnect(user: CurrentUser, id: string) {
    z.string().uuid().parse(id);
    await database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`connector:${id}`}, 0))`);
      const [c] = await tx.select().from(connections).where(scope(user, id));
      if (!c) throw new ConnectorError("Connection unavailable."); owner(user, c);
      await tx.update(connections).set({ status: "disconnected", encryptedCredentials: null, version: sql`${connections.version} + 1`, updatedAt: new Date() }).where(scope(user, id));
      const records = await tx.select({ id: datasets.id }).from(datasets).where(and(eq(datasets.connectionId, id), eq(datasets.lawFirmId, user.firm.id)));
      for (const d of records) {
        await tx.delete(snapshots).where(eq(snapshots.datasetId, d.id));
        await tx.update(runs).set({ status: "failed", error: "Connection disconnected.", finishedAt: new Date() }).where(and(eq(runs.datasetId, d.id), eq(runs.status, "running")));
      }
    });
  }
  async function table(user: CurrentUser, id: string, page = 1) {
    z.string().uuid().parse(id); page = z.number().int().min(1).max(10000).parse(page);
    return database.transaction(async (tx) => {
      await tx.execute(sql`set transaction isolation level repeatable read`);
      const [record] = await tx.select({ dataset: datasets, status: connections.status, connectionOwner: connections.connectedByUserId }).from(datasets).innerJoin(connections, and(eq(connections.id, datasets.connectionId), eq(connections.lawFirmId, user.firm.id))).where(and(eq(datasets.id, id), eq(datasets.lawFirmId, user.firm.id)));
      if (!record) throw new ConnectorError("Dataset unavailable.");
      const [snapshot] = await tx.select().from(snapshots).where(and(eq(snapshots.datasetId, id), eq(snapshots.lawFirmId, user.firm.id), eq(snapshots.active, true)));
      const data = record.status === "connected" && snapshot ? await tx.select().from(rows).where(and(eq(rows.snapshotId, snapshot.id), eq(rows.lawFirmId, user.firm.id))).orderBy(asc(rows.position)).limit(50).offset((page - 1) * 50) : [];
      const history = await tx.select().from(runs).where(and(eq(runs.datasetId, id), eq(runs.lawFirmId, user.firm.id))).orderBy(desc(runs.startedAt)).limit(5);
      return { ...record, snapshot: record.status === "connected" ? snapshot : undefined, rows: data, history, page };
    });
  }
  return { inspect, save, refresh, disconnect, table };
}
export const datasetService = createDatasetService();
