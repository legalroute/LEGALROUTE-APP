import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { SYSTEM_PROMPT, intakeTurnSchema } from "../agents/intake/legacy.ts";
import { LlmError, type ChatTurn, type LlmResult } from "./types.ts";

const MODEL = "claude-opus-5-5";

let client: Anthropic | undefined;

export async function anthropicReply(history: ChatTurn[]): Promise<LlmResult> {
  // The SDK resolves credentials itself (ANTHROPIC_API_KEY or an `ant auth login` profile).
  try {
    client ??= new Anthropic();
  } catch {
    throw new LlmError("No Anthropic credentials found. Set ANTHROPIC_API_KEY in .env.local.");
  }

  const response = await client.beta.messages
    .parse({
      model: MODEL,
      max_tokens: 16000,
      // If a request is declined by a safety classifier, the API retries it on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // Low effort keeps spoken replies fast; intake questions don't need deep reasoning.
      output_config: { effort: "low", format: betaZodOutputFormat(intakeTurnSchema) },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: history.map((m) => ({ role: m.role, content: m.text })),
    })
    .catch((e: unknown) => {
      if (e instanceof Anthropic.AuthenticationError) throw new LlmError("Claude rejected the API key. Check ANTHROPIC_API_KEY.");
      if (e instanceof Anthropic.RateLimitError) throw new LlmError("Claude is rate limited right now. Please try again shortly.");
      if (e instanceof Anthropic.APIError) throw new LlmError(`Claude request failed (${e.status ?? "network"}): ${e.message}`);
      throw e;
    });

  if (response.stop_reason === "refusal") throw new LlmError("Claude declined to respond to this message.");
  if (!response.parsed_output) throw new LlmError(`Claude returned no usable reply (stop reason: ${response.stop_reason}).`);
  return { ...response.parsed_output, model: response.model };
}
