import assert from "node:assert/strict";
import { test } from "node:test";
import { answeredPercent, greetingFor, templateIntakeTurn } from "../src/agents/intake/template.js";
import { intakeTurnSchema } from "../src/agents/intake/legacy.js";
import { generateReply } from "../src/llm/index.js";
import type { ResolvedSettings } from "@legalroute/backend/contracts/ai";

const config = { sections: [{ id: "intro", title: "Intro", questions: [{ id: "name", text: "What is your name?" }, { id: "incident", text: "What happened?" }] }] };
const settings: ResolvedSettings = { provider: "openai", openaiModel: "test-model", firmName: null, silenceMs: 1200, allowInterrupt: true };

test("agents import without a database and preserve intake progress/greetings", () => {
  assert.match(greetingFor("Example Firm", config), /What is your name\?/);
  assert.equal(greetingFor("Example Firm", config, "Welcome."), "Welcome.");
  assert.equal(answeredPercent(config, ["name", "unknown"]), 50);
  assert.equal(answeredPercent({ sections: [] }, []), 0);
  assert.equal(intakeTurnSchema.safeParse({ reply: "Thanks", covered_topics: ["invented_topic"], client_name: null, intake_complete: false, client_ended: false }).success, false);
});

test("empty intake fails before making a provider request", async () => {
  await assert.rejects(templateIntakeTurn({ firmName: "Example", config: { sections: [] }, answered: new Map(), greeting: "Hello", history: [], settings }), /no questions/);
});

test("OpenAI routing reports missing credentials without database or network access", async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try { await assert.rejects(generateReply([], settings), /OPENAI_API_KEY is not set/); }
  finally { if (previous !== undefined) process.env.OPENAI_API_KEY = previous; }
});
