import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import type { ResolvedSettings } from "@/lib/settings";
import { LlmError, type ChatTurn } from "./types";

// General-purpose structured call for Maya (Intake Builder, Home, client workspace, template intakes).
// Uses the same provider and model as the voice intake settings.

const ANTHROPIC_MODEL = "claude-opus-5-5";

let anthropic: Anthropic | undefined;
let openai: OpenAI | undefined;

export async function generateStructured<T extends z.ZodType>(opts: {
  system: string;
  messages: ChatTurn[];
  schema: T;
  name: string;
  settings: ResolvedSettings;
}): Promise<z.infer<T> & { model: string }> {
  // Both APIs expect the conversation to open with the user.
  const first = opts.messages.findIndex((m) => m.role === "user");
  const messages = first > 0 ? opts.messages.slice(first) : opts.messages;
  if (!messages.length) throw new LlmError("Nothing to respond to.");
  return opts.settings.provider === "openai"
    ? openaiStructured({ ...opts, messages }, opts.settings.openaiModel)
    : anthropicStructured({ ...opts, messages });
}

async function anthropicStructured<T extends z.ZodType>(opts: { system: string; messages: ChatTurn[]; schema: T }) {
  try {
    anthropic ??= new Anthropic();
  } catch {
    throw new LlmError("No Anthropic credentials found. Set ANTHROPIC_API_KEY in .env.local.");
  }
  const response = await anthropic.beta.messages
    .parse({
      model: ANTHROPIC_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(opts.schema) },
      system: [{ type: "text", text: opts.system }],
      messages: opts.messages.map((m) => ({ role: m.role, content: m.text })),
    })
    .catch((e: unknown) => {
      if (e instanceof Anthropic.AuthenticationError) throw new LlmError("Claude rejected the API key. Check ANTHROPIC_API_KEY.");
      if (e instanceof Anthropic.RateLimitError) throw new LlmError("Claude is rate limited right now. Please try again shortly.");
      if (e instanceof Anthropic.APIError) throw new LlmError(`Claude request failed (${e.status ?? "network"}): ${e.message}`);
      throw e;
    });
  if (response.stop_reason === "refusal") throw new LlmError("Claude declined to respond to this message.");
  if (!response.parsed_output) throw new LlmError(`Claude returned no usable reply (stop reason: ${response.stop_reason}).`);
  return Object.assign({}, response.parsed_output as z.infer<T>, { model: response.model });
}

async function openaiStructured<T extends z.ZodType>(opts: { system: string; messages: ChatTurn[]; schema: T; name: string }, model: string) {
  if (!process.env.OPENAI_API_KEY) throw new LlmError("OPENAI_API_KEY is not set in .env.local.");
  openai ??= new OpenAI();
  const response = await openai.responses
    .parse({
      model,
      instructions: opts.system,
      input: opts.messages.map((m) => ({ role: m.role, content: m.text })),
      // Low effort keeps chat replies quick; these tasks don't need deep reasoning.
      reasoning: { effort: "low" },
      text: { format: zodTextFormat(opts.schema, opts.name) },
    })
    .catch((e: unknown) => {
      if (e instanceof OpenAI.AuthenticationError) throw new LlmError("ChatGPT rejected the API key. Check OPENAI_API_KEY.");
      if (e instanceof OpenAI.NotFoundError) throw new LlmError(`ChatGPT model "${model}" was not found. Change it on /settings.`);
      if (e instanceof OpenAI.APIError) throw new LlmError(`ChatGPT request failed (${e.status ?? "network"}): ${e.message}`);
      throw e;
    });
  if (!response.output_parsed) throw new LlmError("ChatGPT returned no usable reply.");
  return Object.assign({}, response.output_parsed as z.infer<T>, { model: response.model });
}
