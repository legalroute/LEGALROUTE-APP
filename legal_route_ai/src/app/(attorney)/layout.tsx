import { and, count, eq } from "drizzle-orm";
import Link from "next/link";
import { LogOut, Search } from "lucide-react";
import { db, intakeSessions } from "@/db";
import { Logo } from "@/components/logo";
import { SidebarNav } from "@/components/sidebar-nav";
import { requireUser } from "@/lib/auth";
import { prepareFirm } from "@/lib/firm";
import { initials } from "@/lib/format";
import { themeClass } from "@/lib/theme";
import { signOut } from "../login/actions";

export default async function AttorneyLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  await prepareFirm(user.firm);
  const [{ value: pending }] = await db
    .select({ value: count() })
    .from(intakeSessions)
    .where(and(eq(intakeSessions.lawFirmId, user.firm.id), eq(intakeSessions.status, "pending_review")));

  return (
    <div className={`${themeClass(user.firm.settings.theme)} min-h-screen bg-[var(--app-bg)] text-slate-900 lg:flex`}>
      <aside className="flex flex-col gap-4 border-b border-slate-200/80 bg-white/80 px-4 py-4 backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:gap-8 lg:border-r lg:border-b-0 lg:py-6">
        <Link href="/home" className="px-2">
          <Logo />
        </Link>
        <SidebarNav pendingIntakes={pending} />
        <div className="mt-auto hidden items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 lg:flex">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-orange-100 text-sm font-semibold text-orange-800">
            {initials(user.name ?? user.email)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user.name ?? user.email}</p>
            <p className="truncate text-xs text-slate-500 capitalize">{user.role}</p>
          </div>
          <form action={signOut}>
            <button type="submit" title="Sign out" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <LogOut className="size-4" aria-hidden />
              <span className="sr-only">Sign out</span>
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-[var(--app-main-bg)]">
        <header className="flex items-center gap-3 border-b border-slate-200/80 bg-white/60 px-4 py-3 backdrop-blur sm:px-8">
          <form action="/home" className="relative max-w-xl flex-1" role="search">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              name="q"
              type="search"
              placeholder="Search clients, intakes, documents…"
              aria-label="Search clients, intakes, documents"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
          </form>
          <span className="ml-auto hidden text-sm text-slate-500 sm:block">{user.firm.name}</span>
          <span
            className="grid size-9 place-items-center rounded-full bg-orange-100 text-xs font-semibold text-orange-800 lg:hidden"
            title={user.email}
          >
            {initials(user.name ?? user.email)}
          </span>
          <form action={signOut} className="lg:hidden">
            <button type="submit" className="text-sm text-slate-500 hover:text-slate-800">
              Sign out
            </button>
          </form>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
