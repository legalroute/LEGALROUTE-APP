"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ConnectorError, datasetService } from "@legalroute/backend/connectors/service";

import type { DatasetColumn } from "@legalroute/backend/db/schema";
type MessageState = { error?: string; done?: string };
type TabsState = MessageState & { connectionId?: string; source?: string; metadata?: { spreadsheetId: string; title: string; tabs: { sheetId: number; title: string }[] } };
type PreviewState = MessageState & { connectionId?: string; source?: string; sheetId?: number; title?: string; sheetTitle?: string; columns?: DatasetColumn[]; schemaHash?: string; contentHash?: string; rowCount?: number; sample?: string[][] };
const message = (e: unknown) => e instanceof ConnectorError ? e.message : "Operation failed. Check the source and try again.";
export async function loadTabs(_previous: TabsState, form: FormData): Promise<TabsState> {
  const user = await requireUser();
  try {
    const connectionId = String(form.get("connectionId")), source = String(form.get("source"));
    const result = await datasetService.inspect(user, connectionId, source);
    return { connectionId, source, metadata: result.metadata };
  } catch (e) { return { error: message(e) }; }
}
export async function previewTab(_previous: PreviewState, form: FormData): Promise<PreviewState> {
  const user = await requireUser();
  try {
    const connectionId = String(form.get("connectionId")), source = String(form.get("source")), sheetId = Number(form.get("sheetId"));
    if (!Number.isInteger(sheetId) || sheetId < 0) return { error: "Choose a tab." };
    const result = await datasetService.inspect(user, connectionId, source, sheetId);
    if (!result.source || !result.preview) return { error: "Unable to preview this tab." };
    return { connectionId, source, sheetId, title: result.source.title, sheetTitle: result.source.sheetTitle, ...result.preview, sample: result.source.values.slice(1, 6) };
  } catch (e) { return { error: message(e) }; }
}
export async function saveDataset(_previous: MessageState, form: FormData): Promise<MessageState> {
  const user = await requireUser(); let id: string;
  try {
    id = await datasetService.save(user, { datasetId: form.get("datasetId") || undefined, version: form.get("version") ? Number(form.get("version")) : undefined, connectionId: form.get("connectionId"), spreadsheet: form.get("source"), sheetId: Number(form.get("sheetId")), name: form.get("name"), contentHash: form.get("contentHash"), types: form.getAll("columnType") });
  } catch (e) { return { error: message(e) }; }
  revalidatePath("/connections"); revalidatePath(`/datasets/${id}`); redirect(`/datasets/${id}`);
}
export async function refreshDataset(_previous: MessageState, form: FormData): Promise<MessageState> {
  const user = await requireUser(); const id = String(form.get("id"));
  try { await datasetService.refresh(user, id); revalidatePath(`/datasets/${id}`); return { done: "Table refreshed." }; }
  catch (e) { revalidatePath(`/datasets/${id}`); return { error: message(e) }; }
}
export async function disconnectSource(_previous: MessageState, form: FormData): Promise<MessageState> {
  const user = await requireUser();
  try { await datasetService.disconnect(user, String(form.get("id"))); revalidatePath("/connections"); return { done: "Disconnected. Cached table data was removed. You can also remove the app's grant in your Google account." }; }
  catch (e) { return { error: message(e) }; }
}
