import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Mic } from "lucide-react";
import { Card, PageHeader, buttonClass } from "@/components/ui";
import { appOrigin, requireUser } from "@/lib/auth";
import { PaymentPanel } from "./billing/payment-panel";
import { AppearanceForm, ClientExperienceForm, FirmProfileForm, IntakeLinkForm, NotificationsForm } from "./forms";

export const metadata: Metadata = { title: "Settings — LegalRoute" };

const TABS = [
  { key: "profile", label: "Firm Profile" },
  { key: "intake-link", label: "Intake Link" },
  { key: "calendar", label: "Calendar" },
  { key: "billing", label: "Billing" },
  { key: "appearance", label: "Appearance" },
  { key: "notifications", label: "Notifications" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function FirmSettingsPage({ searchParams }: PageProps<"/firm-settings">) {
  const user = await requireUser();
  const { tab: rawTab } = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === rawTab) ? (rawTab as TabKey) : "profile";
  const firm = user.firm;
  const origin = await appOrigin();

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Settings" subtitle="Manage your firm, intake link and preferences." />
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Settings sections">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "profile" ? "/firm-settings" : `/firm-settings?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={`border-b-2 px-3 pb-2.5 text-sm font-medium whitespace-nowrap ${
              tab === t.key ? "border-orange-600 text-orange-700" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "billing" ? <PaymentPanel user={user} /> : <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="p-6">
          {tab === "profile" && (
            <>
              <h2 className="mb-4 font-semibold">Firm information</h2>
              <FirmProfileForm firm={{ name: firm.name, email: firm.email, phone: firm.phone, website: firm.website, practiceAreas: firm.practiceAreas }} />
            </>
          )}
          {tab === "intake-link" && (
            <>
              <h2 className="mb-4 font-semibold">Intake link</h2>
              <IntakeLinkForm slug={firm.slug} origin={origin} />
            </>
          )}
          {tab === "calendar" && (
            <div className="flex flex-col items-start gap-3">
              <h2 className="font-semibold">Calendar connections</h2>
              <p className="text-sm text-slate-500">Connect Google Calendar or Calendly to schedule consultations from LegalRoute.</p>
              <Link href="/calendar" className={buttonClass.secondary}>
                Manage calendars
              </Link>
            </div>
          )}
          {tab === "appearance" && (
            <>
              <h2 className="mb-4 font-semibold">What clients see</h2>
              <AppearanceForm settings={firm.settings} />
            </>
          )}
          {tab === "notifications" && (
            <>
              <h2 className="mb-4 font-semibold">Notifications</h2>
              <NotificationsForm settings={firm.settings} fallbackEmail={firm.email ?? ""} />
            </>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Your permanent intake link</h2>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {origin.replace(/^https?:\/\//, "")}/intake/{firm.slug}
              </code>
              <Link href="/firm-settings?tab=intake-link" className={buttonClass.secondary}>
                Edit
              </Link>
            </div>
            <a href={`/intake/${firm.slug}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-orange-700 hover:underline">
              <ExternalLink className="size-3.5" aria-hidden /> Preview as a client
            </a>
          </Card>
          <Card className="p-5">
            <h2 className="mb-4 font-semibold">Client experience</h2>
            <ClientExperienceForm settings={firm.settings} />
          </Card>
          <Card className="p-5">
            <h2 className="mb-1 flex items-center gap-2 font-semibold">
              <Mic className="size-4 text-orange-600" aria-hidden /> Voice assistant
            </h2>
            <p className="mb-3 text-sm text-slate-500">AI provider, pause length and interruptions for voice intakes.</p>
            <Link href="/settings" className={buttonClass.secondary}>
              Voice settings
            </Link>
          </Card>
        </div>
      </div>}
    </div>
  );
}
