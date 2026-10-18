import "server-only";
import type { ResolvedSettings } from "@/lib/settings";
import { anthropicReply } from "./anthropic";
import { openaiReply } from "./openai";
import type { ChatTurn, LlmResult } from "./types";

export { LlmError, type ChatTurn, type LlmResult } from "./types";

// Single entry point: picks Claude or ChatGPT from the saved settings.
export function generateReply(history: ChatTurn[], settings: ResolvedSettings): Promise<LlmResult> {
  return settings.provider === "openai" ? openaiReply(history, settings.openaiModel) : anthropicReply(history);
}
