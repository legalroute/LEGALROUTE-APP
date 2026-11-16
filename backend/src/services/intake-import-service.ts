import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, datasets, datasetSnapshots, datasetRows, connectorConnections, intakeTemplates } from "../db/index.ts";
import type { CurrentUser } from "./auth.ts";
import { editableConfigSchema, normalizeConfig } from "./intake-config.ts";
import { generateIntake, importMode, IntakeImportError } from "./intake-import.ts";

function manager(user: CurrentUser) {
  if (!["admin", "attorney"].includes(user.role)) throw new IntakeImportError("An attorney or administrator must create intake forms.");
}
export function createIntakeImportService(database = db) {
  async function previewDataset(user: CurrentUser, datasetId: string, interpretation: unknown) {
    manager(user);
    const id = z.string().uuid().parse(datasetId), mode = importMode.parse(interpretation);
    const grid = await database.transaction(async (tx) => {
      await tx.execute(sql`set transaction isolation level repeatable read`);
      const [source] = await tx.select({ snapshot: datasetSnapshots }).from(datasets)
        .innerJoin(connectorConnections, and(eq(connectorConnections.id, datasets.connectionId), eq(connectorConnections.lawFirmId, user.firm.id), eq(connectorConnections.status, "connected")))
        .innerJoin(datasetSnapshots, and(eq(datasetSnapshots.datasetId, datasets.id), eq(datasetSnapshots.lawFirmId, user.firm.id), eq(datasetSnapshots.active, true)))
        .where(and(eq(datasets.id, id), eq(datasets.lawFirmId, user.firm.id)));
      if (!source) throw new IntakeImportError("Connected table unavailable. Reconnect or refresh the table first.");
      const columns = source.snapshot.columns;
      const header = columns.map((c) => c.header);
      // Header mode does not fetch client rows at all.
      if (mode === "headers") return [header];
      if (source.snapshot.rowCount > 200) throw new IntakeImportError("Use a question table with at most 200 rows.");
      const records = await tx.select({ raw: datasetRows.raw }).from(datasetRows).where(and(eq(datasetRows.snapshotId, source.snapshot.id), eq(datasetRows.lawFirmId, user.firm.id))).orderBy(asc(datasetRows.position)).limit(201);
      return [header, ...records.map((r) => columns.map((c) => r.raw[c.id] ?? ""))];
    });
    return generateIntake(grid, mode);
  }
  async function createDraft(user: CurrentUser, name: string, input: unknown) {
    manager(user);
    const title = z.string().trim().min(1).max(120).parse(name);
    const normalized = normalizeConfig(editableConfigSchema.parse(input));
    if (!normalized.sections.some((s) => s.questions.length)) throw new IntakeImportError("The form needs at least one question.");
    const [template] = await database.insert(intakeTemplates).values({ lawFirmId: user.firm.id, name: title, config: normalized }).returning({ id: intakeTemplates.id });
    return template.id;
  }
  return { previewDataset, createDraft };
}
export const intakeImportService = createIntakeImportService();
