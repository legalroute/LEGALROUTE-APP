import { createHash } from "node:crypto";
import type { DatasetCell, DatasetColumn } from "../db/schema.ts";

export class ConnectorError extends Error {}
export const LIMITS = { rows: 10000, columns: 100, cells: 200000, bytes: 5 * 1024 * 1024 };
export function spreadsheetId(input: string) {
  let id = input.trim();
  if (id.startsWith("https://")) {
    const url = new URL(id);
    if (url.hostname !== "docs.google.com") throw new ConnectorError("Use a Google Sheets URL or spreadsheet ID.");
    id = url.pathname.match(/^\/spreadsheets\/d\/([\w-]+)/)?.[1] ?? "";
  }
  if (!/^[\w-]{20,200}$/.test(id)) throw new ConnectorError("Enter a valid spreadsheet URL or ID.");
  return id;
}
export const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function date(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function numeric(value: string) { return /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= Number.MAX_SAFE_INTEGER; }
export function normalize(value: string, type: DatasetColumn["type"]): DatasetCell | undefined {
  if (value === "") return null;
  if (type === "text") return value;
  if (type === "number") return numeric(value) ? Number(value) : undefined;
  if (type === "boolean") return /^(true|false)$/i.test(value) ? value.toLowerCase() === "true" : undefined;
  return date(value) ? value : undefined;
}
export function prepare(values: string[][]) {
  const width = Math.max(0, ...values.map((row) => row.length));
  if (values.length > LIMITS.rows + 1 || width > LIMITS.columns) throw new ConnectorError("Sheet exceeds the supported row or column limit.");
  if (!width) throw new ConnectorError("This tab is empty. Add a header row and try again.");
  const columns: DatasetColumn[] = Array.from({ length: width }, (_, i) => {
    const cells = values.slice(1).map((row) => row[i] ?? "").filter(Boolean);
    const type = (["boolean", "number", "date"] as const).find((t) => cells.length && cells.every((v) => normalize(v, t) !== undefined)) ?? "text";
    const header = values[0]?.[i] ?? "";
    return { id: `c${i}`, header, label: header.trim() || `Column ${i + 1}`, type };
  });
  return { columns, schemaHash: hash(columns.map((c) => c.header)), contentHash: hash(values), rowCount: Math.max(0, values.length - 1) };
}
export function convertRows(values: string[][], columns: DatasetColumn[]) {
  return values.slice(1).map((row, index) => {
    const raw: Record<string, string> = {}, normalized: Record<string, DatasetCell> = {}, errors: string[] = [];
    for (const [i, col] of columns.entries()) {
      raw[col.id] = row[i] ?? "";
      const value = normalize(raw[col.id], col.type);
      normalized[col.id] = value === undefined ? raw[col.id] : value;
      if (value === undefined) errors.push(col.id);
    }
    return { position: index + 1, raw, values: normalized, errors };
  });
}
