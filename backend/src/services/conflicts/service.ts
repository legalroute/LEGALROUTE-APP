import { createHash } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, clients, intakeSessions, intakeResponses, datasets, connectorConnections, datasetSnapshots, datasetRows, conflictSources, conflictChecks, conflictReviews, type ConflictCandidate } from "../../db/index.ts";
import type { CurrentUser } from "../auth.ts";
import { checkInput, ConflictError, findMatches, mappingSchema, normalizeName } from "./matching.ts";
export { ConflictError } from "./matching.ts";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const attorney = (user: CurrentUser) => { if (user.role !== "attorney") throw new ConflictError("An attorney must review conflicts and approve client conversion."); };
const manager = (user: CurrentUser) => { if (!["attorney", "admin"].includes(user.role)) throw new ConflictError("An attorney or administrator must configure sources."); };
// All source changes, reviews, and intake conversions through this service share a firm lock.
export function createConflictService(database = db) {
  type Tx = Parameters<Parameters<typeof database.transaction>[0]>[0];
  const lock = (tx: Tx, user: CurrentUser) => tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`conflict:${user.firm.id}`},0))`);
  async function sessionContext(tx: Tx, user: CurrentUser, id: string) {
    const [session] = await tx.select().from(intakeSessions).where(and(eq(intakeSessions.id, id), eq(intakeSessions.lawFirmId, user.firm.id)));
    if (!session) throw new ConflictError("Intake unavailable.");
    const answers = await tx.select({ questionId: intakeResponses.questionId, value: intakeResponses.value }).from(intakeResponses).where(eq(intakeResponses.sessionId, id)).orderBy(asc(intakeResponses.questionId));
    const answer = (...keys: string[]) => answers.find((r) => keys.includes(r.questionId))?.value ?? null;
    return { session, answers, name: session.clientName ?? answer("full_name", "client_name", "name"), email: session.clientEmail ?? answer("email", "client_email"), phone: answer("phone", "client_phone", "phone_number") };
  }
  const intakeHash = (context: Awaited<ReturnType<typeof sessionContext>>) => hash({ name: context.name, email: context.email, matter: context.session.matterType, answers: context.answers });
  async function sourceData(tx: Tx, user: CurrentUser) {
    const candidates: ConflictCandidate[] = [], issues: string[] = [], versions: unknown[] = [];
    const local = await tx.select().from(clients).where(eq(clients.lawFirmId, user.firm.id)).orderBy(asc(clients.id)).limit(10001);
    if (local.length > 10000) issues.push("Firm client registry exceeds this version's 10,000-client limit.");
    for (const c of local.slice(0, 10000)) candidates.push({ id: `client:${c.id}`, name: c.name, role: "client", aliases: [], email: c.email ?? "", matter: c.matterType ?? "", attorney: "", status: c.status, source: "LegalRoute clients" });
    const sources = await tx.select().from(conflictSources).where(eq(conflictSources.lawFirmId, user.firm.id)).orderBy(asc(conflictSources.id));
    if (!sources.length) issues.push("Map at least one firm party registry table before completing a check.");
    for (const source of sources) {
      const [record] = await tx.select({ name: datasets.name, status: connectorConnections.status }).from(datasets).innerJoin(connectorConnections, and(eq(datasets.connectionId, connectorConnections.id), eq(connectorConnections.lawFirmId, user.firm.id))).where(and(eq(datasets.id, source.datasetId), eq(datasets.lawFirmId, user.firm.id)));
      const [snapshot] = await tx.select().from(datasetSnapshots).where(and(eq(datasetSnapshots.datasetId, source.datasetId), eq(datasetSnapshots.lawFirmId, user.firm.id), eq(datasetSnapshots.active, true)));
      versions.push([source.id, source.mapping, snapshot?.id ?? null, record?.status ?? "missing"]);
      if (!record || record.status !== "connected" || !snapshot) { issues.push("A mapped source is unavailable. Reconnect and refresh it."); continue; }
      if (Date.now() - snapshot.createdAt.getTime() > 86400000) issues.push(`${record.name}: cached source is over 24 hours old; refresh it.`);
      const { sourceSchemaHash, ...columnMapping } = source.mapping;
      if (sourceSchemaHash !== snapshot.schemaHash) { issues.push(`${record.name}: source headings changed; confirm the column mapping again.`); continue; }
      if (Object.values(columnMapping).some((id) => id && !snapshot.columns.some((c) => c.id === id))) { issues.push(`${record.name}: columns changed; remap this source.`); continue; }
      const rows = await tx.select().from(datasetRows).where(and(eq(datasetRows.snapshotId, snapshot.id), eq(datasetRows.lawFirmId, user.firm.id))).orderBy(asc(datasetRows.position)).limit(10001);
      if (rows.length > 10000 || candidates.length + rows.length > 20000) { issues.push("Party registry exceeds the 20,000-record total limit."); continue; }
      for (const row of rows) {
        const value = (key: keyof typeof source.mapping) => (row.raw[source.mapping[key] ?? ""] ?? "").trim();
        const name = value("name"), role = value("role");
        if (!name || !role) { issues.push(`${record.name}: row ${row.position} needs a party name and role.`); continue; }
        if (name.length > 200 || !normalizeName(name) || value("aliases").length > 4000 || value("aliases").split("|").filter((a) => a.trim()).length > 20 || value("aliases").split("|").some((a) => a.trim().length > 200)) { issues.push(`${record.name}: row ${row.position} has oversized name data.`); continue; }
        candidates.push({ id: `${source.id}:${row.position}`, name, role, aliases: value("aliases").split("|").map((a) => a.trim()).filter(Boolean).slice(0, 20), email: value("email"), matter: value("matter"), attorney: value("attorney"), status: value("status"), source: record.name });
      }
    }
    return { candidates, issues: [...new Set(issues)].slice(0, 100), fingerprint: hash({ versions, candidates }) };
  }
  async function configure(user: CurrentUser, datasetId: string, input: unknown) {
    manager(user); z.string().uuid().parse(datasetId); const mapping = mappingSchema.parse(input);
    if (mapping.name === mapping.role) throw new ConflictError("Map name and role to separate columns.");
    await database.transaction(async (tx) => {
      await lock(tx, user);
      const [dataset] = await tx.select().from(datasets).where(and(eq(datasets.id, datasetId), eq(datasets.lawFirmId, user.firm.id)));
      const [snapshot] = await tx.select().from(datasetSnapshots).where(and(eq(datasetSnapshots.datasetId, datasetId), eq(datasetSnapshots.lawFirmId, user.firm.id), eq(datasetSnapshots.active, true)));
      if (!dataset || !snapshot || Object.values(mapping).some((id) => id && !snapshot.columns.some((c) => c.id === id))) throw new ConflictError("Table or mapped columns unavailable.");
      const storedMapping = { ...mapping, sourceSchemaHash: snapshot.schemaHash };
      await tx.insert(conflictSources).values({ lawFirmId: user.firm.id, datasetId, mapping: storedMapping }).onConflictDoUpdate({ target: [conflictSources.lawFirmId, conflictSources.datasetId], set: { mapping: storedMapping, updatedAt: new Date() } });
    });
  }
  async function run(user: CurrentUser, input: unknown) {
    const data = checkInput.parse(input);
    return database.transaction(async (tx) => {
      await lock(tx, user);
      const issues: string[] = [];
      if (!data.opposingComplete || !data.subjects.some((p) => p.role === "opposing")) issues.push("Known opposing parties must be entered and completeness confirmed.");
      if (!data.subjects.some((p) => p.role === "client")) issues.push("Enter a prospective client.");
      let intakeFingerprint: string | null = null;
      if (data.intakeId) {
        const context = await sessionContext(tx, user, data.intakeId);
        if (context.session.clientId) throw new ConflictError("This intake has already been converted.");
        if (!context.name || !data.subjects.some((s) => s.role === "client" && normalizeName(s.name) === normalizeName(context.name!))) issues.push("The prospective client must match the intake client name. Update the intake or check input first.");
        intakeFingerprint = intakeHash(context);
      }
      const source = await sourceData(tx, user), result = findMatches(data.subjects, source.candidates);
      issues.push(...source.issues);
      if (result.truncated) issues.push("More than 200 matches; narrow the parties or inspect sources before rerunning.");
      const [record] = await tx.insert(conflictChecks).values({ lawFirmId: user.firm.id, intakeId: data.intakeId, createdBy: user.id, createdAt: sql`clock_timestamp()`, subjects: data.subjects, opposingComplete: data.opposingComplete, fingerprint: source.fingerprint, intakeFingerprint, status: issues.length ? "incomplete" : result.matches.length ? "matches" : "no_matches", issues, matches: result.matches }).returning();
      return record.id;
    });
  }
  async function validateCurrent(tx: Tx, user: CurrentUser, record: typeof conflictChecks.$inferSelect) {
    if (record.status === "incomplete") throw new ConflictError("This check is incomplete. Resolve the listed issues and run it again.");
    if (Date.now() - record.createdAt.getTime() > 86400000) throw new ConflictError("This check is over 24 hours old. Run a new check.");
    const current = await sourceData(tx, user);
    if (current.issues.length || current.fingerprint !== record.fingerprint) throw new ConflictError("Conflict sources changed or need refresh. Run a new check before approval.");
    if (record.intakeId) {
      const context = await sessionContext(tx, user, record.intakeId);
      if (intakeHash(context) !== record.intakeFingerprint) throw new ConflictError("Intake details changed. Run a new conflict check.");
    }
  }
  async function review(user: CurrentUser, id: string, input: unknown) {
    attorney(user); z.string().uuid().parse(id);
    const data = z.object({ decision: z.enum(["clear", "hold"]), notes: z.string().trim().min(10).max(4000) }).parse(input);
    await database.transaction(async (tx) => {
      await lock(tx, user);
      const [record] = await tx.select().from(conflictChecks).where(and(eq(conflictChecks.id, id), eq(conflictChecks.lawFirmId, user.firm.id)));
      if (!record) throw new ConflictError("Check unavailable.");
      if (data.decision === "clear") await validateCurrent(tx, user, record);
      await tx.insert(conflictReviews).values({ lawFirmId: user.firm.id, checkId: id, reviewerId: user.id, createdAt: sql`clock_timestamp()`, ...data });
    });
  }
  async function accept(user: CurrentUser, intakeId: string) {
    attorney(user); z.string().uuid().parse(intakeId);
    return database.transaction(async (tx) => {
      await lock(tx, user);
      // Serialize conversion even against other callers updating this intake.
      await tx.select().from(intakeSessions).where(and(eq(intakeSessions.id, intakeId), eq(intakeSessions.lawFirmId, user.firm.id))).for("update");
      const context = await sessionContext(tx, user, intakeId);
      if (context.session.clientId) return context.session.clientId;
      if (["in_progress", "declined"].includes(context.session.status)) throw new ConflictError("Only a submitted, non-declined intake can be accepted.");
      const [record] = await tx.select().from(conflictChecks).where(and(eq(conflictChecks.intakeId, intakeId), eq(conflictChecks.lawFirmId, user.firm.id))).orderBy(desc(conflictChecks.createdAt), desc(conflictChecks.id)).limit(1);
      if (!record) throw new ConflictError("Run an intake-linked conflict check and obtain attorney clearance first.");
      await validateCurrent(tx, user, record);
      const [decision] = await tx.select().from(conflictReviews).where(and(eq(conflictReviews.checkId, record.id), eq(conflictReviews.lawFirmId, user.firm.id))).orderBy(desc(conflictReviews.createdAt), desc(conflictReviews.id)).limit(1);
      if (decision?.decision !== "clear") throw new ConflictError("Attorney conflict clearance is required before client creation.");
      const [client] = await tx.insert(clients).values({ lawFirmId: user.firm.id, name: context.name!, email: context.email && z.email().safeParse(context.email).success ? context.email : null, phone: context.phone, matterType: context.session.matterType, status: "qualified" }).returning();
      await tx.update(intakeSessions).set({ clientId: client.id, status: "completed", reviewedAt: new Date() }).where(and(eq(intakeSessions.id, intakeId), eq(intakeSessions.lawFirmId, user.firm.id)));
      return client.id;
    });
  }
  return { configure, run, review, accept };
}
export const conflictService = createConflictService();
