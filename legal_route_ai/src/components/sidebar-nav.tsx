"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, FilePenLine, Home, Inbox, Plug, Settings, Users } from "lucide-react";

const NAV = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/intakes", label: "Intakes", icon: Inbox },
  { href: "/intake-builder", label: "Intake Builder", icon: FilePenLine },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/conflicts", label: "Conflict Checks", icon: Users },
  { href: "/connections", label: "Connections", icon: Plug },
  { href: "/firm-settings", label: "Settings", icon: Settings },
] as const;

export function SidebarNav({ pendingIntakes }: { pendingIntakes: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="grid grid-cols-3 gap-1 sm:flex sm:flex-wrap lg:flex-col">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors sm:gap-3 sm:px-3 ${
              active ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Icon className="size-4.5 shrink-0" aria-hidden />
            <span>{label}</span>
            {href === "/intakes" && pendingIntakes > 0 && (
              <span className="ml-auto rounded-full bg-orange-600 px-2 py-0.5 text-xs font-semibold text-white">{pendingIntakes}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
