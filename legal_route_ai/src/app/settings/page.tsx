import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getSettings } from "@/lib/settings";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings — LegalRoute" };

export default async function SettingsPage() {
  await connection();
  const settings = await getSettings();
  const keys = {
    ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
    OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
    DEEPGRAM_API_KEY: Boolean(process.env.DEEPGRAM_API_KEY),
  };

  return (
    <main className="min-h-screen bg-[#fbf7f4] text-slate-900">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12 sm:px-6">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="font-serif text-4xl font-semibold">Settings</h1>
          <Link href="/voice" className="text-sm text-orange-700 hover:underline">
            Back to intake
          </Link>
        </div>
        {!keys.DEEPGRAM_API_KEY && (
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            DEEPGRAM_API_KEY is missing in <code>.env.local</code>. Speech recognition and voice replies need it.
          </p>
        )}
        <SettingsForm settings={settings} keys={keys} />
      </div>
    </main>
  );
}
