"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { IntakeConfig } from "@/db";
import { intakeImportService } from "@legalroute/backend/services/intake-import-service";
import { requireUser } from "@/lib/auth";
import { generateIntake, importMode, IntakeImportError, MAX_IMPORT_BYTES, readIntakeFile } from "@legalroute/backend/services/intake-import";

export async function previewIntakeImport(form: FormData): Promise<{ error?: string; config?: IntakeConfig; sheets?: string[]; selectedSheet?: string }> {
  const user = await requireUser();
  if (!["admin", "attorney"].includes(user.role)) return { error: "An attorney or administrator must create intake forms." };
  try {
    const mode = importMode.parse(form.get("mode"));
    const datasetId = form.get("dataset");
    if (datasetId) {
      const id = z.string().uuid().parse(datasetId);
      return { config: await intakeImportService.previewDataset(user, id, mode) };
    }
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > MAX_IMPORT_BYTES) throw new IntakeImportError("Choose a CSV or .xlsx file of at most 512 KB.");
    const sheet = String(form.get("sheet") || "");
    const result = await readIntakeFile(file.name, Buffer.from(await file.arrayBuffer()), sheet || undefined);
    try { return { config: generateIntake(result.grid, mode), sheets: result.sheets, selectedSheet: result.selectedSheet }; }
    catch (error) { return { error: error instanceof IntakeImportError ? error.message : "Check the question definitions.", sheets: result.sheets, selectedSheet: result.selectedSheet }; }
  } catch (error) {
    return { error: error instanceof IntakeImportError ? error.message : "Could not preview the source. Check the file and import mode." };
  }
}

export async function createImportedIntake(name: string, config: IntakeConfig): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!["admin", "attorney"].includes(user.role)) return { error: "An attorney or administrator must create intake forms." };
  let id: string;
  try { id = await intakeImportService.createDraft(user, name, config); }
  catch (error) { return { error: error instanceof IntakeImportError ? error.message : "Check the form name, question definitions and options." }; }
  redirect(`/intake-builder/${id}`);
}
