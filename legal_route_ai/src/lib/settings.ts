import "server-only";
import { eq } from "drizzle-orm";
import { appSettings, db } from "@/db";
import { DEFAULT_OPENAI_MODEL } from "@/lib/llm/openai";
import { SILENCE_MS_RANGE } from "@/lib/voice-types";

export type Provider = "anthropic" | "openai";

export type ResolvedSettings = {
  provider: Provider;
  openaiModel: string;
  firmName: string | null;
  silenceMs: number;
  allowInterrupt: boolean;
};


// DB row wins; .env.local supplies defaults until settings are saved.
export async function getSettings(): Promise<ResolvedSettings> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1));
  const envProvider = process.env.LLM_PROVIDER === "openai" ? "openai" : "anthropic";
  return {
    provider: row?.llmProvider ?? envProvider,
    openaiModel: row?.openaiModel || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
    firmName: row?.firmName || process.env.FIRM_NAME || null,
    silenceMs: row?.silenceMs ?? SILENCE_MS_RANGE.default,
    allowInterrupt: row?.allowInterrupt ?? true,
  };
}

export async function saveSettings(values: {
  provider: Provider;
  openaiModel: string | null;
  firmName: string | null;
  silenceMs: number;
  allowInterrupt: boolean;
}) {
  const row = {
    llmProvider: values.provider,
    openaiModel: values.openaiModel,
    firmName: values.firmName,
    silenceMs: values.silenceMs,
    allowInterrupt: values.allowInterrupt,
  };
  await db
    .insert(appSettings)
    .values({ id: 1, ...row })
    .onConflictDoUpdate({ target: appSettings.id, set: row });
}
