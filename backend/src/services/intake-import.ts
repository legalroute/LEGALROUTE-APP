import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { z } from "zod";
import type { IntakeConfig, IntakeFieldType } from "../db/schema.ts";
import { editableConfigSchema, fieldTypes, normalizeConfig, slugify } from "./intake-config.ts";

export const MAX_IMPORT_BYTES = 512 * 1024;
export const importMode = z.enum(["questions", "headers"]);
export class IntakeImportError extends Error {}
const fail = (message: string): never => { throw new IntakeImportError(message); };

// Reject oversized archives before ExcelJS inflates XML, including ZIP64 archives.
function checkArchive(data: Buffer) {
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--)
    if (data.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) fail("Invalid Excel file. Upload an unencrypted .xlsx workbook.");
  const count = data.readUInt16LE(end + 10), start = data.readUInt32LE(end + 16);
  if (count > 500 || start >= end || data.readUInt16LE(end + 4) !== 0) fail("Workbook archive is too large or unsupported.");
  let offset = start, expanded = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || data.readUInt32LE(offset) !== 0x02014b50) fail("Invalid workbook archive.");
    expanded += data.readUInt32LE(offset + 24);
    if (expanded > 10 * 1024 * 1024) fail("Workbook expands beyond the 10 MB limit. Export a smaller sheet as CSV.");
    offset += 46 + data.readUInt16LE(offset + 28) + data.readUInt16LE(offset + 30) + data.readUInt16LE(offset + 32);
  }
}
export async function readIntakeFile(name: string, data: Buffer, sheet?: string) {
  if (!data.length || data.length > MAX_IMPORT_BYTES) fail("Upload a nonempty file of at most 512 KB.");
  let sheets: string[], grid: string[][];
  if (/\.csv$/i.test(name)) {
    sheets = ["CSV"];
    try { grid = parse(data, { bom: true, skip_empty_lines: true, max_record_size: 20000, relax_column_count: true, to: 10002 }) as string[][]; }
    catch { return fail("Could not read CSV. Use UTF-8, comma-separated values with quoted multiline cells."); }
  } else if (/\.xlsx$/i.test(name)) {
    checkArchive(data);
    const book = new ExcelJS.Workbook();
    try { await book.xlsx.load(data as unknown as ExcelJS.Buffer); }
    catch { return fail("Could not read workbook. Use an unencrypted .xlsx file, or export CSV."); }
    sheets = book.worksheets.map((s) => s.name);
    if (!sheets.length || sheets.length > 20) fail("Use a workbook with 1–20 worksheets.");
    const tab = sheet ? book.getWorksheet(sheet) : book.worksheets[0];
    if (!tab) return fail("Choose a worksheet in this workbook.");
    if (tab.rowCount > 10001 || tab.columnCount > 100) fail("Use at most 10,000 data rows and 100 columns.");
    grid = [];
    for (let r = 1; r <= tab.rowCount; r++) {
      const row: string[] = [];
      for (let c = 1; c <= tab.columnCount; c++) {
        const cell = tab.getRow(r).getCell(c);
        // Do not evaluate formulas or import cached formula values/links.
        row.push(cell.type === ExcelJS.ValueType.Formula ? "" : cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : cell.text);
      }
      grid.push(row);
    }
  } else return fail("Upload .csv or .xlsx. Save older .xls files as .xlsx first.");
  if (grid.length > 10001 || grid.some((r) => r.length > 100)) fail("Use at most 10,000 data rows and 100 columns.");
  if (grid.some((r) => r.some((v) => v.length > 10000))) fail("A cell exceeds the 10,000 character limit.");
  return { sheets, selectedSheet: sheet || sheets[0], grid };
}

export function generateIntake(grid: string[][], mode: z.infer<typeof importMode>): IntakeConfig {
  const header = grid[0]?.map((h) => h.trim()) ?? [];
  if (!header.some(Boolean)) return fail("The first row must contain column headings.");
  if (header.length > 100 || grid.length > 10001) return fail("Source is too large.");
  if (mode === "headers") {
    // Intentionally never examine client records or infer choices from their answers.
    return normalizeConfig({ sections: [{ id: "intake", title: "Client information", questions: header.filter(Boolean).map((h) => ({
      id: slugify(h), text: h.replace(/[_-]+/g, " "), type: /email/i.test(h) ? "email" : /phone|mobile/i.test(h) ? "phone" : /date|dob/i.test(h) ? "date" : "text", required: false,
    })) }] });
  }
  for (const name of ["question", "section", "type", "required", "choices"])
    if (header.filter((h) => h.toLowerCase() === name).length > 1) fail(`Use only one "${name}" column.`);
  const index = (name: string) => header.findIndex((h) => h.toLowerCase() === name);
  const question = index("question"), section = index("section"), type = index("type"), required = index("required"), choices = index("choices");
  if (question < 0) return fail('Question mode needs a "question" column. Optional columns: section, type, required, choices.');
  const config: IntakeConfig = { sections: [] };
  for (let i = 1; i < grid.length; i++) {
    const row = grid[i], text = row[question]?.trim();
    if (!text) continue;
    if (config.sections.reduce((n, s) => n + s.questions.length, 0) >= 200) fail("Use at most 200 question rows.");
    const title = row[section]?.trim() || "Intake", fieldType = row[type]?.trim().toLowerCase() || "text", flag = row[required]?.trim().toLowerCase() || "false";
    if (!fieldTypes.includes(fieldType as IntakeFieldType)) fail(`Row ${i + 1}: unsupported type "${fieldType}".`);
    if (!["true", "false", "yes", "no", "1", "0"].includes(flag)) fail(`Row ${i + 1}: required must be true/false or yes/no.`);
    let group = config.sections.find((s) => s.title === title);
    if (!group) { group = { id: slugify(title), title, questions: [] }; config.sections.push(group); }
    group.questions.push({ id: slugify(text), text, type: fieldType as IntakeFieldType, required: ["true", "yes", "1"].includes(flag), choices: row[choices]?.split("|").map((v) => v.trim()).filter(Boolean) ?? [] });
  }
  const checked = editableConfigSchema.safeParse(config);
  if (!checked.success) fail(checked.error.issues[0]?.message ?? "Check the question definitions.");
  if (!config.sections.length) fail("No question rows found.");
  return normalizeConfig(config);
}
