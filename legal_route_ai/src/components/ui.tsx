import type { ComponentProps, ReactNode } from "react";

// Small shared building blocks for the attorney screens.

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ className = "", ...props }: ComponentProps<"section">) {
  return <section className={`rounded-2xl border border-slate-200/80 bg-white shadow-sm ${className}`} {...props} />;
}

export function CardHeader({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
      <h2 className="font-semibold">{title}</h2>
      {actions}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-slate-400">{children}</p>;
}

const PILL_TONES = {
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
  green: "bg-green-50 text-green-700 ring-green-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
} as const;

export type PillTone = keyof typeof PILL_TONES;

export function Pill({ tone = "slate", children }: { tone?: PillTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${PILL_TONES[tone]}`}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export const INTAKE_STATUS: Record<string, { label: string; tone: PillTone }> = {
  in_progress: { label: "In progress", tone: "slate" },
  pending_review: { label: "Pending review", tone: "orange" },
  info_requested: { label: "Info requested", tone: "violet" },
  reviewed: { label: "Reviewed", tone: "green" },
  completed: { label: "Completed", tone: "blue" },
  declined: { label: "Declined", tone: "red" },
};

// An unfinished intake with no progress for 2 hours is shown as abandoned (display only).
const ABANDONED_AFTER_MS = 2 * 60 * 60 * 1000;
export function intakeStatusBadge(status: string, createdAt: Date) {
  if (status === "in_progress" && Date.now() - createdAt.getTime() > ABANDONED_AFTER_MS) return { label: "Abandoned", tone: "slate" as PillTone };
  return INTAKE_STATUS[status];
}

export const CLIENT_STATUS: Record<string, { label: string; tone: PillTone }> = {
  lead: { label: "Lead", tone: "slate" },
  qualified: { label: "Qualified", tone: "green" },
  active: { label: "Active", tone: "blue" },
  closed: { label: "Closed", tone: "red" },
};

export function Avatar({ text, tone = "orange", size = "md" }: { text: string; tone?: "orange" | "slate"; size?: "sm" | "md" | "lg" }) {
  const dims = size === "lg" ? "size-14 text-lg" : size === "sm" ? "size-8 text-xs" : "size-10 text-sm";
  const colors = tone === "orange" ? "bg-orange-100 text-orange-800" : "bg-slate-100 text-slate-700";
  return <span className={`grid shrink-0 place-items-center rounded-full font-semibold ${dims} ${colors}`}>{text}</span>;
}

export const buttonClass = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50",
  dark: "inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50",
  ghost: "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-orange-700 hover:bg-orange-50",
};

export const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 disabled:bg-slate-50 disabled:text-slate-500";

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </label>
  );
}
