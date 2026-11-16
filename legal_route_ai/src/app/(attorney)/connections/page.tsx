import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { connectorConnections, datasets, db } from "@/db";
import { requireUser } from "@/lib/auth";
import { configured } from "@legalroute/backend/connectors/service";
import { Card, PageHeader, buttonClass } from "@/components/ui";
import { DatasetBuilder, DisconnectButton } from "./builder";

const connectionErrors: Record<string, string> = {
  configuration: "Google Sheets is not configured. Ask your server administrator to complete the setup guide.",
  oauth_state: "The Google connection request expired or the browser session did not match. Open LegalRoute at http://localhost:3000 for local testing, sign in, and start Connect Google account again in the same browser tab.",
  google_denied: "Google access was declined. Connect again and approve read access to Google Sheets.",
  sheets_scope: "Google Sheets read access was not granted. Connect again and select the permission to read your Google Sheets spreadsheets on Google's consent screen.",
  offline_access: "Google did not return offline access. Remove LegalRoute's existing access from your Google account's third-party connections, then connect again.",
  google_unreachable: "The server could not reach Google. Check the server's internet connection and try again.",
  google_exchange: "Google rejected the authorization exchange. Check that GOOGLE_SHEETS_CLIENT_ID and GOOGLE_SHEETS_CLIENT_SECRET belong to the same Web application OAuth client and that its callback URI exactly matches APP_URL plus /api/connectors/google-sheets/callback. Restart the server after changes and begin a new connection.",
};

export const metadata = { title: "Connections — LegalRoute" };
export default async function ConnectionsPage({ searchParams }: PageProps<"/connections">) {
  const user = await requireUser(), params = await searchParams;
  const manage = ["attorney", "admin"].includes(user.role);
  const accounts = await db.select({ id: connectorConnections.id, accountEmail: connectorConnections.accountEmail, ownerId: connectorConnections.connectedByUserId, status: connectorConnections.status }).from(connectorConnections).where(eq(connectorConnections.lawFirmId, user.firm.id));
  const tables = await db.select().from(datasets).where(eq(datasets.lawFirmId, user.firm.id)).orderBy(desc(datasets.updatedAt));
  const usable = accounts.filter((a) => a.status === "connected" && manage && (a.ownerId === user.id || user.role === "admin"));
  const existing = typeof params.dataset === "string" ? tables.find((d) => d.id === params.dataset && usable.some((a) => a.id === d.connectionId)) : undefined;
  return <div className="mx-auto max-w-6xl">
    <PageHeader title="Connections" subtitle="Connect Google Sheets, upload Excel/CSV, and generate customizable intake forms." />
    {manage && <Card className="mb-6 p-5"><h2 className="text-xl font-semibold">Intake forms from your data</h2><p className="my-3 text-sm text-slate-500">Generate questions from a connected table or upload an Excel/CSV file. Review and customize a draft before publishing.</p><Link href="/connections/intake" className={buttonClass.primary}>Upload file / Generate intake</Link></Card>}
    {params.error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{(typeof params.error === "string" && connectionErrors[params.error]) || "Google authorization could not be completed. Try connecting again and grant read access."}</p>}
    {params.connected && <p role="status" className="mb-4 rounded-xl bg-green-50 p-4 text-sm text-green-800">Google Sheets connected. Choose a spreadsheet below.</p>}
    <Card className="p-5"><h2 className="text-xl font-semibold">Google Sheets</h2><p className="my-3 text-sm text-slate-500">Read access only. Selected spreadsheet content is cached for members of your firm. LegalRoute does not edit the sheet.</p>
      {manage && (configured() ? <a href="/api/connectors/google-sheets/connect" className={buttonClass.primary}>Connect Google account</a> : <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Google Sheets setup is required: OAuth credentials, APP_URL and an encryption key. See the connector setup guide in the repository.</p>)}
      <div className="mt-4 space-y-4">{accounts.map((a) => <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3"><div className="text-sm">{a.accountEmail}<span className="ml-2 text-slate-500">{a.status}</span></div>{manage && (a.ownerId === user.id || user.role === "admin") && a.status === "connected" && <DisconnectButton id={a.id} />}</div>)}</div>
    </Card>
    {usable.length > 0 && <DatasetBuilder accounts={usable} existing={existing} />}
    <Card className="mt-6 p-5"><h2 className="mb-3 text-xl font-semibold">Firm tables</h2>{tables.length === 0 ? <p className="text-sm text-slate-500">No connected tables yet. Connect an account, preview a tab and save it here.</p> : <div className="divide-y divide-slate-100">{tables.map((d) => <Link key={d.id} href={`/datasets/${d.id}`} className="block py-3"><span className="font-semibold text-orange-700">{d.name}</span><span className="mt-1 block text-sm text-slate-500">{d.sourceTitle} · {d.sheetTitle}</span></Link>)}</div>}</Card>
  </div>;
}
