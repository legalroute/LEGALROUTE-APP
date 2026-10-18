"use client";

import { useActionState, useState, useTransition, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import type { FirmSettings } from "@/db/schema";
import { DEFAULT_THEME, isTheme, THEMES, type Theme } from "@/lib/theme";
import { Field, buttonClass, inputClass } from "@/components/ui";
import {
  checkSlug,
  saveAppearance,
  saveClientExperience,
  saveFirmProfile,
  saveIntakeLink,
  saveNotifications,
  type SettingsState,
} from "./actions";

type Action = (prev: SettingsState, fd: FormData) => Promise<SettingsState>;

function SettingsForm({ action, children, submitLabel = "Save changes" }: { action: Action; children: ReactNode; submitLabel?: string }) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {children}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass.dark}>
          {pending ? "Saving…" : submitLabel}
        </button>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state.ok && !pending && <p className="text-sm text-green-700">Saved.</p>}
      </div>
    </form>
  );
}

export function FirmProfileForm({ firm }: { firm: { name: string; email: string | null; phone: string | null; website: string | null; practiceAreas: string[] } }) {
  return (
    <SettingsForm action={saveFirmProfile}>
      <Field label="Firm name">
        <input name="name" required defaultValue={firm.name} className={inputClass} />
      </Field>
      <Field label="Email">
        <input name="email" type="email" defaultValue={firm.email ?? ""} className={inputClass} />
      </Field>
      <Field label="Phone">
        <input name="phone" type="tel" defaultValue={firm.phone ?? ""} className={inputClass} />
      </Field>
      <Field label="Website">
        <input name="website" type="url" placeholder="https://" defaultValue={firm.website ?? ""} className={inputClass} />
      </Field>
      <Field label="Practice areas" hint="Separate with commas, e.g. Personal Injury, Employment">
        <input name="practiceAreas" defaultValue={firm.practiceAreas.join(", ")} className={inputClass} />
      </Field>
    </SettingsForm>
  );
}

export function IntakeLinkForm({ slug, origin }: { slug: string; origin: string }) {
  const [value, setValue] = useState(slug);
  const [status, setStatus] = useState<{ available: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [checking, startCheck] = useTransition();
  const url = `${origin}/intake/${slug}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-1.5 text-sm font-medium text-slate-700">Your permanent intake link</p>
        <div className="flex gap-2">
          <input readOnly value={url} aria-label="Intake link" className={`${inputClass} bg-slate-50`} />
          <button
            type="button"
            className={buttonClass.secondary}
            onClick={async () => {
              await navigator.clipboard.writeText(url).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-slate-400">Put it in your email signature, on your website, or text it to clients.</p>
      </div>
      <SettingsForm action={saveIntakeLink} submitLabel="Update link">
        <Field label="Customize link" hint="Changing it stops the old link from working.">
          <div className="flex items-center gap-2">
            <span className="text-sm whitespace-nowrap text-slate-400">/intake/</span>
            <input
              name="slug"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setStatus(null);
              }}
              className={inputClass}
            />
            <button type="button" className={buttonClass.secondary} disabled={checking || value === slug} onClick={() => startCheck(async () => setStatus(await checkSlug(value)))}>
              {checking ? "Checking…" : "Check"}
            </button>
          </div>
        </Field>
        {status && <p className={`text-sm ${status.available ? "text-green-700" : "text-red-600"}`}>{status.message}</p>}
      </SettingsForm>
    </div>
  );
}

export function ClientExperienceForm({ settings }: { settings: FirmSettings }) {
  return (
    <SettingsForm action={saveClientExperience}>
      <Toggle name="showProgress" label="Show progress bar" defaultChecked={settings.showProgress !== false} />
      <Toggle name="collectEmailAtStart" label="Collect client email at start" defaultChecked={Boolean(settings.collectEmailAtStart)} />
      <Toggle name="requireESignature" label="Require e-signature at end" note="Coming soon" defaultChecked={Boolean(settings.requireESignature)} disabled />
      <Toggle name="showThankYou" label="Show custom thank-you message" note="Set the message under Appearance" defaultChecked={settings.showThankYou !== false} />
    </SettingsForm>
  );
}

const THEME_PREVIEW: Record<Theme, { page: string; card: string; text: string; accent: string; muted: string }> = {
  original: { page: "#fbf7f4", card: "#ffffff", text: "#0f172a", accent: "#ea580c", muted: "#fed7aa" },
  mono: { page: "#fafafa", card: "#ffffff", text: "#171717", accent: "#0a0a0a", muted: "#d4d4d4" },
  dark: { page: "#000000", card: "#0a0a0a", text: "#fafafa", accent: "#fafafa", muted: "#333333" },
};

export function AppearanceForm({ settings }: { settings: FirmSettings }) {
  const current = isTheme(settings.theme) ? settings.theme : DEFAULT_THEME;
  return (
    <SettingsForm action={saveAppearance}>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-slate-700">Theme</legend>
        <p className="mb-3 text-xs text-slate-400">Applies to your firm&apos;s screens and to the client intake link.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {THEMES.map((t) => {
            const c = THEME_PREVIEW[t.id];
            return (
              <label
                key={t.id}
                className="cursor-pointer rounded-xl border border-slate-200 p-3 transition hover:border-slate-400 has-[:checked]:border-orange-600 has-[:checked]:ring-2 has-[:checked]:ring-orange-200"
              >
                <input type="radio" name="theme" value={t.id} defaultChecked={current === t.id} className="sr-only" />
                {/* Fixed colors, so each preview shows its own theme whatever theme is active. */}
                <span aria-hidden className="mb-2 flex h-16 overflow-hidden rounded-lg border border-black/10" style={{ background: c.page }}>
                  <span className="w-1/4" style={{ background: c.card, borderRight: `1px solid ${c.muted}` }} />
                  <span className="flex flex-1 flex-col gap-1.5 p-2">
                    <span className="h-1.5 w-2/3 rounded-full" style={{ background: c.text }} />
                    <span className="h-1.5 w-1/2 rounded-full" style={{ background: c.muted }} />
                    <span className="mt-auto h-3 w-10 rounded" style={{ background: c.accent }} />
                  </span>
                </span>
                <span className="block text-sm font-semibold">{t.label}</span>
                <span className="block text-xs text-slate-500">{t.description}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <Field label="Welcome message" hint="What Maya says first. Leave blank for the default greeting, which asks the first question.">
        <textarea name="welcomeMessage" rows={3} defaultValue={settings.welcomeMessage ?? ""} className={inputClass} />
      </Field>
      <Field label="Thank-you message" hint="Shown when the client finishes. Requires “Show custom thank-you message”.">
        <textarea name="thankYouMessage" rows={3} defaultValue={settings.thankYouMessage ?? ""} className={inputClass} />
      </Field>
    </SettingsForm>
  );
}

export function NotificationsForm({ settings, fallbackEmail }: { settings: FirmSettings; fallbackEmail: string }) {
  return (
    <SettingsForm action={saveNotifications}>
      <Toggle name="notifyOnIntake" label="Email me when a client finishes an intake" defaultChecked={settings.notifyOnIntake !== false} />
      <Field label="Send notifications to" hint={`Leave blank to use ${fallbackEmail || "the firm email"}.`}>
        <input name="notificationEmail" type="email" defaultValue={settings.notificationEmail ?? ""} className={inputClass} />
      </Field>
    </SettingsForm>
  );
}

function Toggle({ name, label, note, defaultChecked, disabled }: { name: string; label: string; note?: string; defaultChecked: boolean; disabled?: boolean }) {
  return (
    <label className={`flex items-center justify-between gap-4 ${disabled ? "opacity-60" : ""}`}>
      <span>
        <span className="block text-sm font-medium text-slate-700">{label}</span>
        {note && <span className="block text-xs text-slate-400">{note}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} disabled={disabled} className="peer sr-only" />
        <span className="h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-green-500 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-300" />
        <span className="toggle-knob absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}
