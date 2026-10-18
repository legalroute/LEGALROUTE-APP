"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveSettings } from "@/lib/settings";
import { SILENCE_MS_RANGE } from "@/lib/voice-types";

const settingsSchema = z.object({
  provider: z.enum(["anthropic", "openai"]),
  openaiModel: z.string().trim().max(100),
  firmName: z.string().trim().max(200),
  silenceMs: z.coerce
    .number()
    .int()
    .min(SILENCE_MS_RANGE.min, `Pause must be at least ${SILENCE_MS_RANGE.min} ms`)
    .max(SILENCE_MS_RANGE.max, `Pause must be at most ${SILENCE_MS_RANGE.max} ms`),
  allowInterrupt: z.boolean(),
});

export type SaveSettingsState = { error?: string; ok?: boolean };

// TODO: restrict to staff once auth is added. Server Actions are reachable by direct POST requests.
export async function updateSettings(_prev: SaveSettingsState, formData: FormData): Promise<SaveSettingsState> {
  const parsed = settingsSchema.safeParse({
    provider: formData.get("provider"),
    openaiModel: formData.get("openaiModel") ?? "",
    firmName: formData.get("firmName") ?? "",
    silenceMs: formData.get("silenceMs"),
    allowInterrupt: formData.get("allowInterrupt") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid settings" };

  await saveSettings({
    provider: parsed.data.provider,
    openaiModel: parsed.data.openaiModel || null,
    firmName: parsed.data.firmName || null,
    silenceMs: parsed.data.silenceMs,
    allowInterrupt: parsed.data.allowInterrupt,
  });
  revalidatePath("/settings");
  revalidatePath("/voice");
  return { ok: true };
}
