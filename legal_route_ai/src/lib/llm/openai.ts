import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { SYSTEM_PROMPT, intakeTurnSchema } from "@/lib/intake";
import { LlmError, type ChatTurn, type LlmResult } from "./types";

export const DEFAULT_OPENAI_MODEL = "gpt-5.5";

let client: OpenAI | undefined;

export async function openaiReply(history: ChatTurn[], model: string): Promise<LlmResult> {
  if (!process.env.OPENAI_API_KEY) throw new LlmError("OPENAI_API_KEY is not set in .env.local.");
  client ??= new OpenAI();

  const response = await client.responses
    .parse({
      model,
      instructions: SYSTEM_PROMPT,
      input: history.map((m) => ({ role: m.role, content: m.text })),
      text: { format: zodTextFormat(intakeTurnSchema, "intake_turn") },
    })
    .catch((e: unknown) => {
      if (e instanceof OpenAI.AuthenticationError) throw new LlmError("ChatGPT rejected the API key. Check OPENAI_API_KEY.");
      if (e instanceof OpenAI.NotFoundError) throw new LlmError(`ChatGPT model "${model}" was not found. Change it on /settings.`);
      if (e instanceof OpenAI.APIError) throw new LlmError(`ChatGPT request failed (${e.status ?? "network"}): ${e.message}`);
      throw e;
    });

  if (!response.output_parsed) throw new LlmError("ChatGPT returned no usable reply.");
  return { ...response.output_parsed, model: response.model };
}
