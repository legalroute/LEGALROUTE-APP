import "server-only";
import { z } from "zod";
import type { IntakeConfig } from "@/db/schema";
import type { ChatTurn } from "@/lib/llm/types";
import { generateStructured } from "@/lib/llm/structured";
import { allQuestions } from "@/lib/intake-config";
import type { ResolvedSettings } from "@/lib/settings";
import { ASSISTANT_NAME } from "@/lib/assistant";

// Voice intake driven by a firm's published template (the /intake/<slug> link). Same turn protocol as /voice.

export { ASSISTANT_NAME };

export function greetingFor(firmName: string, config: IntakeConfig, welcome?: string | null) {
  if (welcome?.trim()) return welcome.trim();
  const first = allQuestions(config)[0]?.text ?? "Tell me what happened.";
  return `Hi, I'm ${ASSISTANT_NAME}, ${firmName}'s intake assistant. I'll ask a few questions so an attorney can review your case. ${first}`;
}

function turnSchema(questionIds: [string, ...string[]]) {
  return z.object({
    reply: z.string().describe(`What ${ASSISTANT_NAME} says next, spoken aloud to the client.`),
    answers: z
      .array(
        z.object({
          question_id: z.enum(questionIds),
          answer: z.string().describe("The client's answer, summarized in a short phrase or sentence in their own terms."),
        }),
      )
      .describe("Answers the client gave or corrected in their latest message only. Empty if none."),
    client_name: z.string().nullable().describe("The client's full name if they have given it, else null."),
    client_email: z.string().nullable().describe("The client's email if they have given it, else null."),
    intake_complete: z.boolean().describe("True once every question is answered and you have closed the conversation."),
    client_ended: z.boolean().describe("True if the client said they want to stop or are done before every question was answered."),
  });
}

function systemPrompt(opts: { firmName: string; config: IntakeConfig; answered: Map<string, string>; greeting: string }) {
  const lines = opts.config.sections.map(
    (s) =>
      `${s.title}:\n` +
      s.questions
        .map((q) => {
          const a = opts.answered.get(q.id);
          return `- ${q.id}: ${q.text}${a ? `  [ANSWERED: ${a}]` : ""}`;
        })
        .join("\n"),
  );
  return `You are ${ASSISTANT_NAME}, the voice intake assistant for ${opts.firmName}, a law firm. You are talking with a prospective client by voice: they speak, their words are transcribed, and your reply is read aloud by text-to-speech.

You have already greeted them with: "${opts.greeting}"

Work through this intake form. Questions marked ANSWERED are done; ask about the rest:
${lines.join("\n\n")}

How to talk:
- Keep each reply to one to three short sentences. It will be spoken, so use plain conversational language with no lists, markdown, headings or emoji.
- Ask one question at a time, roughly in the order above, but follow the client's lead. If they answer several questions at once, record all of them and skip ahead.
- You can reword a question to fit the conversation, but keep its meaning.
- Be warm and briefly acknowledge what they share, especially injuries or distress, without being effusive.
- If the client doesn't know or doesn't want to answer a question, record that as the answer and move on.
- Transcription can contain errors. If something is unclear or sounds misheard, ask them to confirm it.
- Do not give legal advice, predict outcomes, or quote case values. If asked, say an attorney will review their case and follow up.
- If they describe an emergency or immediate danger, tell them to call 911 first.
- When every question is answered, thank them, say an attorney will review their information and contact them, and set intake_complete to true.
- If the client says they are done or want to stop (for example "I'm done", "that's all", "stop recording", "I don't want to continue"), end right away with one short, warm goodbye saying an attorney will review what they shared, and set client_ended to true. Judge intent from context: "I'm done with physical therapy" is an answer, not a request to stop.

In answers, include only what the client said in their latest message, keyed by question id.`;
}

export async function templateIntakeTurn(opts: {
  firmName: string;
  config: IntakeConfig;
  answered: Map<string, string>;
  greeting: string;
  history: ChatTurn[];
  settings: ResolvedSettings;
}) {
  const ids = allQuestions(opts.config).map((q) => q.id);
  if (!ids.length) throw new Error("This intake has no questions.");
  return generateStructured({
    system: systemPrompt(opts),
    messages: opts.history,
    schema: turnSchema(ids as [string, ...string[]]),
    name: "template_intake_turn",
    settings: opts.settings,
  });
}

export function answeredPercent(config: IntakeConfig, answeredIds: Iterable<string>) {
  const ids = new Set(allQuestions(config).map((q) => q.id));
  if (!ids.size) return 0;
  let n = 0;
  for (const id of answeredIds) if (ids.has(id)) n++;
  return Math.round((n / ids.size) * 100);
}
