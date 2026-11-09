"use client";
import { useActionState, useState } from "react";
import { Card, Field, buttonClass, inputClass } from "@/components/ui";
import { disconnectSource, loadTabs, previewTab, saveDataset, refreshDataset } from "./actions";

type Account = { id: string; accountEmail: string };
type Existing = { id: string; connectionId: string; spreadsheetId: string; name: string; version: number };
export function DatasetBuilder({ accounts, existing }: { accounts: Account[]; existing?: Existing }) {
  const [state, action, pending] = useActionState(loadTabs, {});
  const [connectionId, setConnectionId] = useState(existing?.connectionId ?? accounts[0]?.id ?? "");
  const [source, setSource] = useState(existing?.spreadsheetId ?? "");
  return <Card className="mt-6 p-5">
    <h2 className="text-xl font-semibold">{existing ? "Review source" : "Add a table"}</h2>
    <p className="mb-4 text-sm text-slate-500">Paste a spreadsheet link, then choose a tab. Google Sheets remains the source of truth.</p>
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Google account"><select name="connectionId" value={connectionId} onChange={(e) => setConnectionId(e.target.value)} required className={inputClass}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.accountEmail}</option>)}</select></Field>
      <Field label="Spreadsheet URL or ID"><input name="source" value={source} onChange={(e) => setSource(e.target.value)} required maxLength={500} className={inputClass} /></Field>
      <button disabled={pending} className={buttonClass.primary}>{pending ? "Reading…" : "Load tabs"}</button>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
    </form>
    {state.metadata && state.connectionId === connectionId && state.source === source && <TabPreview key={`${state.connectionId}:${state.source}`} connectionId={state.connectionId} source={state.source} metadata={state.metadata} existing={existing} />}
  </Card>;
}
function TabPreview({ connectionId, source, metadata, existing }: { connectionId: string; source: string; metadata: { title: string; tabs: { sheetId: number; title: string }[] }; existing?: Existing }) {
  const [state, action, pending] = useActionState(previewTab, {});
  const [sheetId, setSheetId] = useState(metadata.tabs[0]?.sheetId ?? -1);
  const [saved, saveAction, saving] = useActionState(saveDataset, {});
  return <div className="mt-6 border-t border-slate-200 pt-5">
    <h3 className="mb-3 font-semibold">{metadata.title}</h3>
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="connectionId" value={connectionId} /><input type="hidden" name="source" value={source} />
      <Field label="Tab"><select name="sheetId" value={sheetId} onChange={(e) => setSheetId(Number(e.target.value))} className={inputClass}>{metadata.tabs.map((t) => <option key={t.sheetId} value={t.sheetId}>{t.title}</option>)}</select></Field>
      <button disabled={pending} className={buttonClass.secondary}>{pending ? "Loading…" : "Preview tab"}</button>
    </form>
    {state.error && <p role="alert" className="mt-3 text-sm text-red-700">{state.error}</p>}
    {state.columns && state.sheetId === sheetId && <form key={`${state.contentHash}:${state.sheetId}`} action={saveAction} className="mt-5 space-y-4">
      <input type="hidden" name="datasetId" value={existing?.id ?? ""} /><input type="hidden" name="version" value={existing?.version ?? ""} />
      <input type="hidden" name="connectionId" value={connectionId} /><input type="hidden" name="source" value={source} />
      <input type="hidden" name="sheetId" value={state.sheetId} /><input type="hidden" name="contentHash" value={state.contentHash} />
      <Field label="Table name"><input name="name" required maxLength={150} defaultValue={existing?.name ?? `${state.title} · ${state.sheetTitle}`} className={inputClass} /></Field>
      <p className="text-sm text-slate-500">{state.rowCount} rows. Confirm column types below; original text is preserved if conversion fails. Dates use YYYY-MM-DD.</p>
      <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full text-left text-sm"><thead><tr>{state.columns.map((col) => <th key={col.id} className="min-w-40 p-3 align-top"><div>{col.label}</div><div className="my-1 text-xs font-normal text-slate-400">Column {Number(col.id.slice(1)) + 1}</div><select aria-label={`Type for column ${Number(col.id.slice(1)) + 1}`} name="columnType" defaultValue={col.type} className={inputClass}><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="boolean">Checkbox / boolean</option></select></th>)}</tr></thead><tbody>{state.sample?.map((row, i) => <tr key={i} className="border-t border-slate-100">{state.columns!.map((col, c) => <td key={col.id} className="max-w-64 truncate p-3">{row[c] ?? ""}</td>)}</tr>)}</tbody></table></div>
      <button disabled={saving} className={buttonClass.primary}>{saving ? "Saving…" : existing ? "Save reviewed table" : "Save table"}</button>
      {saved?.error && <p role="alert" className="text-sm text-red-700">{saved.error}</p>}
    </form>}
  </div>;
}
export function DisconnectButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(disconnectSource, {});
  return <form action={action} onSubmit={(e) => { if (!window.confirm("Disconnect this account and remove cached data for ALL its tables? This does not revoke the Google grant; you can remove it in your Google account.")) e.preventDefault(); }}>
    <input type="hidden" name="id" value={id} /><button disabled={pending} className={buttonClass.secondary}>{pending ? "Disconnecting…" : "Disconnect"}</button>
    <p role="status" className="mt-2 text-sm">{state.error || state.done}</p>
  </form>;
}
export function RefreshButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(refreshDataset, {});
  return <form action={action}><input type="hidden" name="id" value={id} /><button disabled={pending} className={buttonClass.primary}>{pending ? "Refreshing…" : "Refresh"}</button><p role="status" className="mt-2 text-sm">{state.error || state.done}</p></form>;
}
