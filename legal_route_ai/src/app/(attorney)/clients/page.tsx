import type { Metadata } from "next";
import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import Link from "next/link";
import { Search } from "lucide-react";
import { clients, db } from "@/db";
import { Avatar, CLIENT_STATUS, Card, EmptyState, PageHeader, Pill } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDate, initials } from "@/lib/format";
import { NewClientForm } from "./new-client-form";

export const metadata: Metadata = { title: "Clients — LegalRoute" };

export default async function ClientsPage({ searchParams }: PageProps<"/clients">) {
  const user = await requireUser();
  const { q: rawQ } = await searchParams;
  const q = typeof rawQ === "string" ? rawQ.trim() : "";
  const filters: SQL[] = [eq(clients.lawFirmId, user.firm.id)];
  if (q) filters.push(or(ilike(clients.name, `%${q}%`), ilike(clients.email, `%${q}%`), ilike(clients.matterType, `%${q}%`), ilike(clients.phone, `%${q}%`))!);
  const rows = await db.select().from(clients).where(and(...filters)).orderBy(desc(clients.createdAt)).limit(300);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Clients" subtitle="Everyone your firm is working with." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <div className="border-b border-slate-100 p-3">
            <form className="relative" role="search">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                name="q"
                defaultValue={q}
                type="search"
                placeholder="Search clients by name, email, phone or matter…"
                aria-label="Search clients"
                className="w-full rounded-xl border border-slate-200 py-2 pr-3 pl-9 text-sm outline-none focus:border-orange-400"
              />
            </form>
          </div>
          {rows.length === 0 ? (
            <EmptyState>{q ? `No clients match “${q}”.` : "No clients yet. Accept an intake or add one here."}</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((c) => {
                const status = CLIENT_STATUS[c.status];
                return (
                  <li key={c.id}>
                    <Link href={`/clients/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/70">
                      <Avatar text={initials(c.name)} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{c.name}</p>
                        <p className="truncate text-sm text-slate-500">{[c.matterType, c.email, c.phone].filter(Boolean).join(" · ") || "No details yet"}</p>
                      </div>
                      <Pill tone={status.tone}>{status.label}</Pill>
                      <span className="hidden w-28 text-right text-sm text-slate-400 sm:block">{formatDate(c.createdAt)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card className="h-fit p-5">
          <h2 className="mb-3 font-semibold">Add a client</h2>
          <NewClientForm />
        </Card>
      </div>
    </div>
  );
}
