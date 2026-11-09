import Link from "next/link";
import { z } from "zod";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ConnectorError, datasetService } from "@legalroute/backend/connectors/service";
import { Card, PageHeader, buttonClass } from "@/components/ui";
import { RefreshButton } from "../../connections/builder";

export const metadata = { title: "Connected table — LegalRoute" };
export default async function DatasetPage({ params, searchParams }: PageProps<"/datasets/[id]">) {
  const user = await requireUser(), { id } = await params, query = await searchParams;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const page = Math.max(1, Math.min(10000, Number(query.page) || 1));
  let result;
  try { result = await datasetService.table(user, id, Math.floor(page)); }
  catch (error) { if (error instanceof ConnectorError || !/^[a-f0-9-]{36}$/i.test(id)) notFound(); throw error; }
  const { dataset, snapshot, rows, history, status } = result;
  const manage = ["attorney", "admin"].includes(user.role) && (result.connectionOwner === user.id || user.role === "admin");
  return <div className="mx-auto max-w-7xl">
    <PageHeader title={dataset.name} subtitle={`${dataset.sourceTitle} · ${dataset.sheetTitle}`} actions={<Link href="/connections" className={buttonClass.secondary}>All connections</Link>} />
    <Card className="mb-5 p-5"><p className="text-sm text-slate-500">Read-only · Google Sheets is the source of truth. Row identities apply only to this refresh.</p><div className="mt-3 flex flex-wrap items-start gap-3">{manage && status === "connected" && <><RefreshButton id={id} /><Link href={`/connections?dataset=${id}`} className={buttonClass.secondary}>Review source</Link></>}<a href={`https://docs.google.com/spreadsheets/d/${dataset.spreadsheetId}/edit#gid=${dataset.sheetId}`} target="_blank" rel="noreferrer" className={buttonClass.secondary}>Open source</a><p className="text-sm text-slate-600">{snapshot ? `Last refreshed ${snapshot.createdAt.toISOString()} · ${snapshot.rowCount} rows` : "No cached data. Reconnect and review the source to load this table."}</p></div></Card>
    {snapshot && <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-3">Row</th>{snapshot.columns.map((c, i) => <th key={c.id} className="min-w-40 p-3">{c.label}<span className="block text-xs font-normal text-slate-500">Column {i + 1} · {c.type}</span></th>)}</tr></thead><tbody>{rows.map((r) => <tr key={r.id} className="border-t border-slate-100"><td className="p-3 text-slate-400">{r.position + 1}</td>{snapshot.columns.map((c) => <td key={c.id} className="max-w-96 break-words p-3 align-top">{String(r.values[c.id] ?? "")}{r.errors.includes(c.id) && <span className="mt-1 block text-xs text-amber-700">Kept as text: not a valid {c.type}</span>}</td>)}</tr>)}</tbody></table></div>{snapshot.rowCount === 0 && <p className="p-5 text-slate-500">This table has headers but no data rows.</p>}<div className="flex items-center justify-between border-t border-slate-100 p-4">{page > 1 ? <Link href={`?page=${page - 1}`} className={buttonClass.secondary}>Previous</Link> : <span />}<span className="text-sm">Page {page}</span>{page * 50 < snapshot.rowCount ? <Link href={`?page=${page + 1}`} className={buttonClass.secondary}>Next</Link> : <span />}</div></Card>}
    <Card className="mt-5 p-5"><h2 className="mb-3 font-semibold">Recent refreshes</h2>{history.map((run) => <p key={run.id} className="border-t border-slate-100 py-2 text-sm">{run.startedAt.toISOString()} · {run.status}{run.rowCount !== null ? ` · ${run.rowCount} rows` : ""}{run.error ? ` · ${run.error}` : ""}</p>)}</Card>
  </div>;
}
