"use client";

import { useState } from "react";
import { VoiceIntake } from "@/app/voice/voice-intake";
import { ASSISTANT_NAME } from "@/lib/assistant";

// Optionally asks for name and email (a firm setting) before the voice conversation starts.
export function IntakeGate({
  slug,
  templateId,
  collectEmail,
  ...voice
}: {
  slug: string;
  templateId?: string;
  collectEmail: boolean;
  silenceMs: number;
  allowInterrupt: boolean;
  showProgress: boolean;
  description: string;
  completeDetail: string;
  reviewerName: string;
}) {
  const [details, setDetails] = useState<{ name: string; email: string } | null>(collectEmail ? null : { name: "", email: "" });

  if (!details) {
    return (
      <form
        className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-3xl border border-white bg-white/80 p-8 shadow-[0_20px_60px_-20px_var(--card-glow)] backdrop-blur-xl"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setDetails({ name: String(fd.get("name") ?? "").trim(), email: String(fd.get("email") ?? "").trim() });
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
          <input name="email" type="email" required autoComplete="email" className="rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-orange-500" />
        </label>
        <button type="submit" className="rounded-xl bg-orange-600 px-4 py-3 font-semibold text-white hover:bg-orange-700">
          Continue
        </button>
      </form>
    );
  }

  const startBody: Record<string, string> = {};
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
    />
  );
}
