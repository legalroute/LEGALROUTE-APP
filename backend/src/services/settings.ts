import { eq } from "drizzle-orm";
import { appSettings, db } from "../db/index.ts";
import { DEFAULT_OPENAI_MODEL, type Provider, type ResolvedSettings } from "../contracts/ai.ts";
export { DEFAULT_OPENAI_MODEL, type Provider, type ResolvedSettings } from "../contracts/ai.ts";
import { SILENCE_MS_RANGE } from "./voice-types.ts";

// DB row wins; .env.local supplies defaults until settings are saved.
export async function getSettings(): Promise<ResolvedSettings> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1));
  // Without LLM_PROVIDER, pick the provider whose key is set, so a fresh install with only an OpenAI key works.
  const envProvider: Provider =
    process.env.LLM_PROVIDER === "openai" || process.env.LLM_PROVIDER === "anthropic"
      ? process.env.LLM_PROVIDER
      : process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY
        ? "openai"
        : "anthropic";
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
