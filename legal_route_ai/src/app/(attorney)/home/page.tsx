import type { Metadata } from "next";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import Link from "next/link";
import { FileText, Inbox, Users } from "lucide-react";
import { activities, clients, db, documents, intakeSessions } from "@/db";
import { Card, CardHeader, EmptyState, INTAKE_STATUS, Pill } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { greeting, initials, timeAgo } from "@/lib/format";
import { loadChat, toChatDto } from "@/lib/maya/history";
import { HomePanel } from "./home-panel";

export const metadata: Metadata = { title: "Home — LegalRoute" };

export default async function HomePage({ searchParams }: PageProps<"/home">) {
  const user = await requireUser();
  const { q: rawQ } = await searchParams;
  const q = typeof rawQ === "string" ? rawQ.trim() : "";
  const firmId = user.firm.id;
  const firstName = (user.name ?? user.email).split(" ")[0];

  const [recent, [{ value: pendingCount }], messages] = await Promise.all([
    db.select().from(activities).where(eq(activities.lawFirmId, firmId)).orderBy(desc(activities.createdAt)).limit(8),
    db
      .select({ value: count() })
      .from(intakeSessions)
      .where(and(eq(intakeSessions.lawFirmId, firmId), eq(intakeSessions.status, "pending_review"))),
    loadChat(firmId, "home", null),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="font-serif text-4xl font-semibold tracking-tight">
          {greeting()}, {firstName}.
        </h1>
        <p className="mt-1 text-slate-500">How can I help you today?</p>
      </div>

      {q && <SearchResults firmId={firmId} q={q} />}

      <HomePanel
        pendingCount={pendingCount}
        builderHref={user.firm.defaultTemplateId ? `/intake-builder/${user.firm.defaultTemplateId}` : "/intake-builder"}
        initialMessages={messages.map(toChatDto)}
        userInitials={initials(user.name ?? user.email)}
        activity={
          <Card>
            <CardHeader title="Recent Activity" />
            {recent.length === 0 ? (
              <EmptyState>Nothing yet. New intakes, documents and consultations will show up here.</EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recent.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                    <ActivityIcon kind={a.kind} />
                    {a.clientId ? (
                      <Link href={`/clients/${a.clientId}`} className="flex-1 text-sm hover:text-orange-700">
                        {a.summary}
                      </Link>
                    ) : (
                      <p className="flex-1 text-sm">{a.summary}</p>
                    )}
                    <span className="text-xs whitespace-nowrap text-slate-400">{timeAgo(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        }
      />
    </div>
  );
}

function ActivityIcon({ kind }: { kind: string }) {
  const Icon = kind === "document" ? FileText : kind === "intake" ? Inbox : Users;
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
      <Icon className="size-4" aria-hidden />
    </span>
  );
}

async function SearchResults({ firmId, q }: { firmId: string; q: string }) {
  const like = `%${q}%`;
  const [clientRows, intakeRows, docRows] = await Promise.all([
    db
      .select()
      .from(clients)
      .where(and(eq(clients.lawFirmId, firmId), or(ilike(clients.name, like), ilike(clients.email, like), ilike(clients.phone, like), ilike(clients.matterType, like))))
      .limit(8),
    db
      .select()
      .from(intakeSessions)
      .where(and(eq(intakeSessions.lawFirmId, firmId), or(ilike(intakeSessions.clientName, like), ilike(intakeSessions.matterType, like), ilike(intakeSessions.clientEmail, like))))
      .orderBy(desc(intakeSessions.createdAt))
      .limit(8),
    db
      .select({ id: documents.id, name: documents.name, status: documents.status, clientId: documents.clientId, clientName: clients.name })
      .from(documents)
      .leftJoin(clients, eq(clients.id, documents.clientId))
      .where(and(eq(documents.lawFirmId, firmId), ilike(documents.name, like)))
      .limit(8),
  ]);
  const none = !clientRows.length && !intakeRows.length && !docRows.length;

  return (
    <Card className="mb-6">
      <CardHeader
        title={`Search results for “${q}”`}
        actions={
          <Link href="/home" className="text-sm text-slate-500 hover:text-slate-800">
            Clear
          </Link>
        }
      />
      {none ? (
        <EmptyState>No clients, intakes or documents match.</EmptyState>
      ) : (
        <div className="grid gap-4 p-5 md:grid-cols-3">
          <ResultGroup title="Clients">
            {clientRows.map((c) => (
              <Link key={c.id} href={`/clients/${c.id}`} className="block rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                <span className="font-medium">{c.name}</span>
                <span className="block text-xs text-slate-400">{c.matterType ?? c.email ?? ""}</span>
              </Link>
            ))}
          </ResultGroup>
          <ResultGroup title="Intakes">
            {intakeRows.map((s) => (
              <Link key={s.id} href={`/intakes/${s.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                <span className="font-medium">{s.clientName ?? "Unnamed client"}</span>
                <Pill tone={INTAKE_STATUS[s.status].tone}>{INTAKE_STATUS[s.status].label}</Pill>
              </Link>
            ))}
          </ResultGroup>
          <ResultGroup title="Documents">
            {docRows.map((d) => (
              <Link
                key={d.id}
                href={d.clientId ? `/clients/${d.clientId}?tab=documents` : "/clients"}
                className="block rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
              >
                <span className="font-medium">{d.name}</span>
                <span className="block text-xs text-slate-400">
                  {[d.clientName, d.status === "requested" ? "Requested" : null].filter(Boolean).join(" · ")}
                </span>
              </Link>
            ))}
          </ResultGroup>
        </div>
      )}
    </Card>
  );
}

function ResultGroup({ title, children }: { title: string; children: React.ReactNode[] }) {
  return (
    <div>
      <h3 className="mb-1 px-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">{title}</h3>
      {children.length ? children : <p className="px-2 text-sm text-slate-300">None</p>}
    </div>
  );
}
