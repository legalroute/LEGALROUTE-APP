import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { Info } from "lucide-react";
import { clients, db } from "@/db";
import { Card, PageHeader, Pill, buttonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getConnections, providerConfigured } from "@/lib/calendar";
import { disconnectCalendar } from "./actions";
import { ScheduleForm } from "./schedule-form";

export const metadata: Metadata = { title: "Calendar — LegalRoute" };

const ERRORS: Record<string, string> = {
  not_configured: "That calendar isn't set up on this server yet. Add its OAuth client id and secret to .env.local.",
  denied: "Connection was cancelled.",
  state: "The connection expired or didn't match. Please try again.",
  exchange: "We couldn't finish connecting. Please try again.",
};

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const user = await requireUser();
  const sp = await searchParams;
  const connections = await getConnections(user.id);
  const google = connections.find((c) => c.provider === "google");
  const calendly = connections.find((c) => c.provider === "calendly");
  const clientRows = await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.lawFirmId, user.firm.id)).orderBy(asc(clients.name));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Calendar" subtitle="Connect your existing calendar apps. There's no separate calendar to maintain." />
      {typeof sp.error === "string" && ERRORS[sp.error] && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{ERRORS[sp.error]}</p>}
      {typeof sp.connected === "string" && (
        <p className="mb-4 rounded-lg bg-green-50 px-4 py-2.5 text-sm text-green-800">{sp.connected === "google" ? "Google Calendar" : "Calendly"} connected.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <ProviderCard
          name="Google Calendar"
          description="View and manage events in your Google Calendar."
          logo={<GoogleLogo />}
          configured={providerConfigured("google")}
          account={google?.accountEmail ?? (google ? "Connected" : null)}
          connectHref="/api/calendar/google/connect"
          disconnect={disconnectCalendar.bind(null, "google")}
        />
        <ProviderCard
          name="Calendly"
          description="Let clients schedule with you via Calendly."
          logo={<span className="grid size-12 place-items-center rounded-full bg-[#006BFF] text-xl font-bold text-white">C</span>}
          configured={providerConfigured("calendly")}
          account={calendly?.accountEmail ?? (calendly ? "Connected" : null)}
          connectHref="/api/calendar/calendly/connect"
          disconnect={disconnectCalendar.bind(null, "calendly")}
        />
        <ProviderCard
          name="Apple Calendar"
          description="Sync availability from your Apple Calendar."
          logo={<AppleCalendarLogo />}
          configured={false}
          comingSoon
          account={null}
        />
      </div>

      <p className="mt-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        LegalRoute opens your connected calendar to view and create events. All scheduling changes happen directly in your calendar app.
      </p>

      <Card className="mt-6 p-5">
        <h2 className="mb-1 font-semibold">Schedule a consultation</h2>
        <p className="mb-4 text-sm text-slate-500">Book it in Google Calendar, or send the client your Calendly link.</p>
        {google || calendly ? (
          <ScheduleForm
            clients={clientRows}
            defaultClientId={typeof sp.client === "string" ? sp.client : undefined}
            methods={[...(google ? (["google"] as const) : []), ...(calendly ? (["calendly"] as const) : [])]}
          />
        ) : (
          <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Connect Google Calendar or Calendly above to schedule consultations.</p>
        )}
      </Card>
    </div>
  );
}

function ProviderCard({
  name,
  description,
  logo,
  configured,
  account,
  connectHref,
  disconnect,
  comingSoon,
}: {
  name: string;
  description: string;
  logo: React.ReactNode;
  configured: boolean;
  account: string | null;
  connectHref?: string;
  disconnect?: () => Promise<void>;
  comingSoon?: boolean;
}) {
  return (
    <Card className="flex flex-col items-center gap-3 p-5 text-center">
      {logo}
      <div>
        <h3 className="font-semibold">{name}</h3>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      <div className="mt-auto flex flex-col items-center gap-2">
        {account ? (
          <>
            <Pill tone="green">{account}</Pill>
            {disconnect && (
              <form action={disconnect}>
                <button type="submit" className="text-sm text-slate-400 hover:text-red-600">
                  Disconnect
                </button>
              </form>
            )}
          </>
        ) : comingSoon ? (
          <>
            <button type="button" disabled className={buttonClass.secondary}>
              Connect
            </button>
            <span className="text-xs text-slate-400">Coming soon</span>
          </>
        ) : configured && connectHref ? (
          <a href={connectHref} className={buttonClass.secondary}>
            Connect
          </a>
        ) : (
          <>
            <button type="button" disabled className={buttonClass.secondary}>
              Connect
            </button>
            <span className="text-xs text-slate-400">Not configured on this server</span>
          </>
        )}
      </div>
    </Card>
  );
}

function GoogleLogo() {
  return (
    <span className="grid size-12 place-items-center rounded-xl border border-slate-200 bg-white">
      <svg viewBox="0 0 24 24" className="size-7" aria-hidden>
        <rect x="3" y="4" width="18" height="17" rx="2" fill="#fff" stroke="#4285F4" strokeWidth="1.5" />
        <rect x="3" y="4" width="18" height="4.5" rx="2" fill="#4285F4" />
        <text x="12" y="18.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#34A853">31</text>
      </svg>
    </span>
  );
}

function AppleCalendarLogo() {
  return (
    <span className="flex size-12 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-center">
      <span className="bg-red-500 text-[9px] leading-4 font-semibold text-white uppercase">Today</span>
      <span className="flex-1 text-xl leading-7 font-semibold text-slate-800">17</span>
    </span>
  );
}
