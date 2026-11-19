import type { Metadata } from "next";
import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, ChevronLeft, Download, FileText, Trash2 } from "lucide-react";
import { activities, clients, db, documents, intakeResponses, intakeSessions, tasks } from "@/db";
import { Avatar, CLIENT_STATUS, Card, CardHeader, EmptyState, INTAKE_STATUS, Pill, buttonClass, inputClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatBytes, formatDate, formatDateTime, initials, timeAgo } from "@/lib/format";
import { loadChat, toChatDto } from "@/lib/maya/history";
import { addTask, deleteDocument, deleteTask, requestDocument, toggleTask } from "../actions";
import { ClientChat } from "./client-chat";
import { OverviewForm } from "./overview-form";
import { DocumentUploadButton } from "./document-upload-button";
import { PaymentPanel } from "../../firm-settings/billing/payment-panel";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = { title: "Client — LegalRoute" };

const TABS = ["chat", "overview", "documents", "activity", "tasks", "payments"] as const;
type Tab = (typeof TABS)[number];

export default async function ClientWorkspacePage({ params, searchParams }: PageProps<"/clients/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "chat";
  const user = await requireUser();
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.lawFirmId, user.firm.id)))
    .catch(() => []);
  if (!client) notFound();
  const status = CLIENT_STATUS[client.status];
  const [docCount, openTaskCount] = await Promise.all([
    db.$count(documents, eq(documents.clientId, client.id)),
    db.$count(tasks, and(eq(tasks.clientId, client.id), eq(tasks.status, "open"))),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/clients" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ChevronLeft className="size-4" aria-hidden /> Clients
      </Link>
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <Avatar text={initials(client.name)} size="lg" />
        <div className="flex-1">
          <h1 className="font-serif text-3xl font-semibold">{client.name}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            {client.matterType ?? "No matter type"}
            <Pill tone={status.tone}>{status.label}</Pill>
          </p>
        </div>
        <Link href={`/calendar?client=${client.id}`} className={buttonClass.secondary}>
          <CalendarClock className="size-4" aria-hidden /> Schedule consultation
        </Link>
      </div>

      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Client sections">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/clients/${client.id}${t === "chat" ? "" : `?tab=${t}`}`}
            aria-current={tab === t ? "page" : undefined}
            className={`border-b-2 px-3 pb-2.5 text-sm font-medium whitespace-nowrap capitalize ${
              tab === t ? "border-orange-600 text-orange-700" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t}
            {t === "documents" && docCount > 0 && <span className="ml-1 text-xs text-slate-400">({docCount})</span>}
            {t === "tasks" && openTaskCount > 0 && <span className="ml-1 text-xs text-slate-400">({openTaskCount})</span>}
          </Link>
        ))}
      </nav>

      {tab === "chat" && (
        <ClientChat
          clientId={client.id}
          clientName={client.name}
          initialMessages={(await loadChat(user.firm.id, "client", client.id)).map(toChatDto)}
          userInitials={initials(user.name ?? user.email)}
        />
      )}
      {tab === "overview" && <OverviewTab clientId={client.id} />}
      {tab === "documents" && <DocumentsTab clientId={client.id} />}
      {tab === "activity" && <ActivityTab clientId={client.id} />}
      {tab === "tasks" && <TasksTab clientId={client.id} />}
      {tab === "payments" && <PaymentPanel user={user} clientId={client.id} />}
    </div>
  );
}

async function OverviewTab({ clientId }: { clientId: string }) {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  const sessions = await db.select().from(intakeSessions).where(eq(intakeSessions.clientId, clientId)).orderBy(desc(intakeSessions.createdAt));
  const responses = sessions.length ? await db.select().from(intakeResponses).where(inArray(intakeResponses.sessionId, sessions.map((s) => s.id))) : [];
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="p-5">
        <h2 className="mb-4 font-semibold">Client details</h2>
        <OverviewForm client={{ id: client.id, name: client.name, email: client.email, phone: client.phone, matterType: client.matterType, status: client.status, notes: client.notes }} />
      </Card>
      <Card>
        <CardHeader title="Intake" />
        {sessions.length === 0 ? (
          <EmptyState>This client didn&apos;t come through an intake.</EmptyState>
        ) : (
          sessions.map((s) => {
            const answers = responses.filter((r) => r.sessionId === s.id);
            return (
              <div key={s.id} className="border-b border-slate-100 px-5 py-4 last:border-0">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm text-slate-500">{s.submittedAt ? `Submitted ${formatDate(s.submittedAt)}` : `Started ${formatDate(s.createdAt)}`}</p>
                  <Link href={`/intakes/${s.id}`} className="text-sm font-medium text-orange-700 hover:underline">
                    View intake
                  </Link>
                </div>
                {answers.length === 0 ? (
                  <p className="text-sm text-slate-400">No individual answers recorded. <Pill tone={INTAKE_STATUS[s.status].tone}>{INTAKE_STATUS[s.status].label}</Pill></p>
                ) : (
                  <dl className="grid gap-2">
                    {answers.map((a) => (
                      <div key={a.id}>
                        <dt className="text-xs text-slate-400">{a.questionText}</dt>
                        <dd className="text-sm">{a.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}

async function DocumentsTab({ clientId }: { clientId: string }) {
  const docs = await db.select().from(documents).where(eq(documents.clientId, clientId)).orderBy(desc(documents.createdAt));
  const requested = docs.filter((d) => d.status === "requested");
  const received = docs.filter((d) => d.status === "received");
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title={`Stored documents (${received.length})`} actions={<DocumentUploadButton clientId={clientId} requests={requested.map((d) => ({ id: d.id, name: d.name }))} />} />
          {received.length === 0 ? (
            <EmptyState>No documents yet.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {received.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                  <FileText className="size-5 shrink-0 text-orange-600" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.name}</p>
                    <p className="text-xs text-slate-400">
                      {[formatBytes(d.sizeBytes), `Added ${timeAgo(d.createdAt)}`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <a href={`/api/documents/${d.id}`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Download">
                    <Download className="size-4" aria-hidden />
                    <span className="sr-only">Download {d.name}</span>
                  </a>
                  <form action={deleteDocument.bind(null, clientId, d.id)}>
                    <button type="submit" className="rounded-lg p-2 text-slate-300 hover:bg-red-50 hover:text-red-600" title="Remove">
                      <Trash2 className="size-4" aria-hidden />
                      <span className="sr-only">Remove {d.name}</span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title={`Requested, not yet received (${requested.length})`} />
          {requested.length === 0 ? (
            <EmptyState>Nothing outstanding.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {requested.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="size-2 rounded-full bg-orange-400" aria-hidden />
                  <p className="flex-1 text-sm">{d.name}</p>
                  <span className="text-xs text-slate-400">Requested {timeAgo(d.createdAt)}</span>
                  <form action={deleteDocument.bind(null, clientId, d.id)}>
                    <button type="submit" className="rounded-lg p-1.5 text-slate-300 hover:text-red-600" title="Cancel request">
                      <Trash2 className="size-4" aria-hidden />
                      <span className="sr-only">Cancel request for {d.name}</span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="flex flex-col gap-4">
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Upload a document</h2>
          <UploadForm clientId={clientId} requests={requested.map((d) => ({ id: d.id, name: d.name }))} />
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Request a document</h2>
          <form action={requestDocument.bind(null, clientId)} className="flex gap-2">
            <input name="name" required placeholder="e.g. Police report" aria-label="Document to request" className={inputClass} />
            <button type="submit" className={buttonClass.secondary}>
              Add
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}

async function ActivityTab({ clientId }: { clientId: string }) {
  const rows = await db.select().from(activities).where(eq(activities.clientId, clientId)).orderBy(desc(activities.createdAt)).limit(100);
  return (
    <Card>
      {rows.length === 0 ? (
        <EmptyState>No activity yet.</EmptyState>
      ) : (
        <ol className="divide-y divide-slate-100">
          {rows.map((a) => (
            <li key={a.id} className="flex items-start gap-3 px-5 py-3">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-orange-400" aria-hidden />
              <p className="flex-1 text-sm">{a.summary}</p>
              <time className="text-xs whitespace-nowrap text-slate-400" dateTime={a.createdAt.toISOString()}>
                {formatDateTime(a.createdAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

async function TasksTab({ clientId }: { clientId: string }) {
  const rows = await db.select().from(tasks).where(eq(tasks.clientId, clientId)).orderBy(tasks.status, desc(tasks.createdAt));
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card>
        {rows.length === 0 ? (
          <EmptyState>No tasks yet. Add one, or ask Maya to.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                <form action={toggleTask.bind(null, clientId, t.id)}>
                  <button
                    type="submit"
                    aria-label={t.status === "done" ? `Mark “${t.title}” as not done` : `Mark “${t.title}” as done`}
                    className={`grid size-5 place-items-center rounded-md border ${t.status === "done" ? "border-green-500 bg-green-500 text-white" : "border-slate-300 hover:border-orange-400"}`}
                  >
                    {t.status === "done" && "✓"}
                  </button>
                </form>
                <p className={`flex-1 text-sm ${t.status === "done" ? "text-slate-400 line-through" : ""}`}>{t.title}</p>
                {t.dueDate && <span className="text-xs text-slate-400">Due {formatDate(`${t.dueDate}T12:00:00`)}</span>}
                <form action={deleteTask.bind(null, clientId, t.id)}>
                  <button type="submit" className="rounded p-1 text-slate-300 hover:text-red-600" title="Delete task">
                    <Trash2 className="size-4" aria-hidden />
                    <span className="sr-only">Delete task</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="h-fit p-5">
        <h2 className="mb-3 font-semibold">Add a task</h2>
        <form action={addTask.bind(null, clientId)} className="flex flex-col gap-3">
          <input name="title" required placeholder="e.g. Call about medical records" aria-label="Task" className={inputClass} />
          <input name="dueDate" type="date" aria-label="Due date" className={inputClass} />
          <button type="submit" className={buttonClass.dark}>
            Add task
          </button>
        </form>
      </Card>
    </div>
  );
}
