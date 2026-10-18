import type { Metadata } from "next";
import { and, count, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import Link from "next/link";
import { Search } from "lucide-react";
import { db, intakeSessions } from "@/db";
import { Avatar, Card, EmptyState, PageHeader, Pill, intakeStatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDate, initials } from "@/lib/format";

export const metadata: Metadata = { title: "Intakes — LegalRoute" };

const TABS = {
  all: { label: "All", statuses: null },
  pending: { label: "Pending Review", statuses: ["pending_review", "info_requested"] as const },
  in_progress: { label: "Unfinished", statuses: ["in_progress"] as const },
  completed: { label: "Completed", statuses: ["reviewed", "completed", "declined"] as const },
} as const;
type TabKey = keyof typeof TABS;

export default async function IntakesPage({ searchParams }: PageProps<"/intakes">) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab: TabKey = typeof sp.tab === "string" && sp.tab in TABS ? (sp.tab as TabKey) : "all";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const firmFilter = eq(intakeSessions.lawFirmId, user.firm.id);
  const counts = Object.fromEntries(
    await Promise.all(
      (Object.keys(TABS) as TabKey[]).map(async (key) => {
        const statuses = TABS[key].statuses;
        const [{ value }] = await db
          .select({ value: count() })
          .from(intakeSessions)
          .where(statuses ? and(firmFilter, inArray(intakeSessions.status, [...statuses])) : firmFilter);
        return [key, value] as const;
      }),
    ),
  ) as Record<TabKey, number>;

  const filters: SQL[] = [firmFilter];
  const statuses = TABS[tab].statuses;
  if (statuses) filters.push(inArray(intakeSessions.status, [...statuses]));
  if (q) filters.push(or(ilike(intakeSessions.clientName, `%${q}%`), ilike(intakeSessions.matterType, `%${q}%`), ilike(intakeSessions.clientEmail, `%${q}%`))!);
  const rows = await db
    .select()
    .from(intakeSessions)
    .where(and(...filters))
    .orderBy(desc(intakeSessions.submittedAt), desc(intakeSessions.createdAt))
    .limit(200);

  const tabHref = (key: TabKey) => `/intakes?${new URLSearchParams({ ...(key !== "all" && { tab: key }), ...(q && { q }) })}`;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Intake Review" subtitle="Review submissions and take next steps." />
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 pt-3">
          <nav className="flex gap-1 overflow-x-auto" aria-label="Intake status">
            {(Object.keys(TABS) as TabKey[]).map((key) => (
              <Link
                key={key}
                href={tabHref(key)}
                aria-current={tab === key ? "page" : undefined}
                className={`border-b-2 px-3 pb-2.5 text-sm font-medium whitespace-nowrap ${
                  tab === key ? "border-orange-600 text-orange-700" : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {TABS[key].label} ({counts[key]})
              </Link>
            ))}
          </nav>
          <form className="relative mb-2 w-full sm:w-64" role="search">
            {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              name="q"
              defaultValue={q}
              type="search"
              placeholder="Search intakes…"
              aria-label="Search intakes"
              className="w-full rounded-xl border border-slate-200 py-1.5 pr-3 pl-9 text-sm outline-none focus:border-orange-400"
            />
          </form>
        </div>

        {rows.length === 0 ? (
          <EmptyState>{q ? `No intakes match “${q}”.` : "No intakes here yet. Share your intake link to start receiving them."}</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs tracking-wide text-slate-400 uppercase">
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 font-medium">Matter type</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Submitted</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const status = intakeStatusBadge(r.status, r.createdAt);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar text={initials(r.clientName, "?")} size="sm" tone="slate" />
                          <div>
                            <p className="font-medium">{r.clientName ?? "Unnamed client"}</p>
                            {r.endedEarly && <p className="text-xs text-slate-400">Ended early</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{r.matterType ?? "—"}</td>
                      <td className="px-5 py-3">
                        <Pill tone={status.tone}>{status.label}</Pill>
                      </td>
                      <td className="px-5 py-3 text-slate-500">{r.submittedAt ? formatDate(r.submittedAt) : `Started ${formatDate(r.createdAt)}`}</td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/intakes/${r.id}`}
                          className={r.status === "pending_review" ? "font-semibold text-orange-700 hover:underline" : "text-slate-600 hover:underline"}
                        >
                          {r.status === "pending_review" ? "Review" : "View"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
