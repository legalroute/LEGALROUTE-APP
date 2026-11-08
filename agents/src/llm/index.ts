import type { ResolvedSettings } from "@legalroute/backend/contracts/ai";
import { anthropicReply } from "./anthropic.ts";
import { openaiReply } from "./openai.ts";
import type { ChatTurn, LlmResult } from "./types.ts";

export { LlmError, type ChatTurn, type LlmResult } from "./types.ts";

// Single entry point: picks Claude or ChatGPT from the saved settings.
export function generateReply(history: ChatTurn[], settings: ResolvedSettings): Promise<LlmResult> {
  return settings.provider === "openai" ? openaiReply(history, settings.openaiModel) : anthropicReply(history);
}
