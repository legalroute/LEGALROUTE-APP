"use client";
import { useState } from "react";
import { IntakeGate } from "../intake-gate";
export function ResumeGate({ slug, firmName, silenceMs, allowInterrupt }: { slug: string; firmName: string; silenceMs: number; allowInterrupt: boolean }) {
  const [token, setToken] = useState<string>(), [error, setError] = useState<string>();
  if (!token) return <div className="mx-auto max-w-lg space-y-4 rounded-2xl bg-white p-7 shadow-sm"><h1 className="font-serif text-2xl">Resume your intake</h1><p>Your private link opens only the saved intake for {firmName}. Recording begins after you consent and allow microphone access.</p><button type="button" className="rounded-xl bg-orange-600 px-4 py-3 font-semibold text-white" onClick={() => { const raw = window.location.hash.slice(1); if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) setError("The private part of this link is missing or invalid. Open the complete link from your email or ask the firm for a replacement."); else setToken(raw); }}>Open saved intake</button>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</div>;
  return <IntakeGate slug={slug} sessionToken={token} collectEmail={false} silenceMs={silenceMs} allowInterrupt={allowInterrupt} showProgress reviewerName={firmName} description={`Continue your saved intake with ${firmName}.`} completeDetail={`Thank you. ${firmName} will review your information.`} />;
}
