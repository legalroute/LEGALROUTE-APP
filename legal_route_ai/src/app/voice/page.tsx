import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Feather, Settings } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { VoiceIntake } from "./voice-intake";

export const metadata: Metadata = { title: "Personal Injury Intake — LegalRoute" };

export default async function VoicePage() {
  // Settings live in the database, so render per request.
  await connection();
  const settings = await getSettings();
  const providerLabel =
    settings.provider === "openai" ? `ChatGPT (${settings.openaiModel})` : "Claude (claude-opus-5-5)";

  const missingKeys = [
    !process.env.DEEPGRAM_API_KEY && "DEEPGRAM_API_KEY",
    settings.provider === "anthropic" && !process.env.ANTHROPIC_API_KEY && "ANTHROPIC_API_KEY",
    settings.provider === "openai" && !process.env.OPENAI_API_KEY && "OPENAI_API_KEY",
  ].filter((k): k is string => Boolean(k));

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fbf7f4] text-slate-900">
      {/* Soft peach glow in the corners, as in the design. */}
      <div aria-hidden className="pointer-events-none absolute -top-40 -left-40 size-[36rem] rounded-full bg-orange-200/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-40 -bottom-40 size-[36rem] rounded-full bg-rose-200/40 blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-8 sm:py-10">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <Feather className="size-12 -rotate-12 fill-orange-500 text-orange-600" aria-hidden />
            <span className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">LegalRoute</span>
          </Link>
          <div className="text-right">
            <h1 className="font-serif text-2xl font-semibold sm:text-3xl">Personal Injury Intake</h1>
            {settings.firmName && <p className="text-lg text-slate-500">{settings.firmName}</p>}
          </div>
        </header>

        {missingKeys.length > 0 && (
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Missing {missingKeys.join(", ")} in <code>.env.local</code>. The intake won&apos;t work until{" "}
            {missingKeys.length === 1 ? "it is" : "they are"} set.
          </p>
        )}

        <VoiceIntake silenceMs={settings.silenceMs} allowInterrupt={settings.allowInterrupt} />

        <footer className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
          <span>Answering with {providerLabel}</span>
          <Link href="/settings" className="flex items-center gap-1.5 hover:text-orange-600">
            <Settings className="size-4" aria-hidden />
            Settings
          </Link>
        </footer>
      </div>
    </div>
  );
}
