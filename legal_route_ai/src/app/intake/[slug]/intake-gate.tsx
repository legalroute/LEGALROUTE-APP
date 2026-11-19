"use client";

import { useState } from "react";
import { VoiceIntake } from "@/app/voice/voice-intake";
import { ASSISTANT_NAME } from "@/lib/assistant";

// Collects optional contact details and opt-in email delivery before a new recording starts.
export function IntakeGate({
  slug,
  templateId,
  collectEmail,
  sessionToken,
  ...voice
}: {
  slug: string;
  templateId?: string;
  collectEmail: boolean;
  sessionToken?: string;
  silenceMs: number;
  allowInterrupt: boolean;
  showProgress: boolean;
  description: string;
  completeDetail: string;
  reviewerName: string;
}) {
  const [detailsError, setDetailsError] = useState<string>();
  const [details, setDetails] = useState<{ name: string; email: string; emailResume: boolean } | null>(sessionToken ? { name: "", email: "", emailResume: false } : null);

  if (!details) {
    return (
      <form
        className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-3xl border border-white bg-white/80 p-8 shadow-[0_20px_60px_-20px_var(--card-glow)] backdrop-blur-xl"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          if (fd.get("emailResume") === "on" && !String(fd.get("email") || "").trim()) { setDetailsError("Enter your email address to receive the link, or uncheck email delivery."); return; }
          setDetailsError(undefined);
          setDetails({ name: String(fd.get("name") ?? "").trim(), email: String(fd.get("email") ?? "").trim(), emailResume: fd.get("emailResume") === "on" });
        }}
      >
        <h1 className="font-serif text-2xl font-semibold">Before we begin</h1>
        <p className="text-sm text-slate-500">So the firm can follow up with you after your conversation with {ASSISTANT_NAME}.</p>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Full name
          <input name="name" autoComplete="name" className="rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-orange-500" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Email
          <input name="email" type="email" required={collectEmail} autoComplete="email" className="rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-orange-500" />
        </label>
        <label className="flex items-start gap-2 text-sm text-slate-600"><input type="checkbox" name="emailResume" className="mt-1" />Email me my private intake link when I begin recording. An email address is needed if selected.</label>
        {detailsError && <p role="alert" className="text-sm text-red-700">{detailsError}</p>}
        <button type="submit" className="rounded-xl bg-orange-600 px-4 py-3 font-semibold text-white hover:bg-orange-700">
          Continue
        </button>
      </form>
    );
  }

  const startBody: Record<string, string> = {};
  if (sessionToken) startBody.sessionToken = sessionToken;
  if (details.emailResume) startBody.emailResume = "true";
  if (templateId) startBody.templateId = templateId;
  if (details.name) startBody.name = details.name;
  if (details.email) startBody.email = details.email;

  return (
    <VoiceIntake
      {...voice}
      assistantName={ASSISTANT_NAME}
      startUrl={`/api/intake/${slug}/start`}
      turnUrl={`/api/intake/${slug}/turn`}
      startBody={startBody}
      newIntakeUrl={sessionToken ? `/intake/${slug}` : undefined}
    />
  );
}
