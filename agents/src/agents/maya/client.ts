import { z } from "zod";
import type { ChatTurn } from "../../llm/types.ts";
import { generateStructured } from "../../llm/structured.ts";
import type { ResolvedSettings } from "@legalroute/backend/contracts/ai";

const clientTurnSchema = z.object({
  reply: z.string().describe("Your reply to the attorney. Plain text; short bullet lines starting with '- ' are fine."),
  create_tasks: z.array(z.string()).describe("Tasks to add to this client's task list, only when the attorney asks you to."),
  request_documents: z
    .array(z.string())
    .describe("Documents to mark as requested from the client (e.g. 'Repair estimate'), only when the attorney asks you to."),
});

// Everything Maya knows about one client, as plain text for the prompt.
export async function clientTurn(opts: { context: string; firmName: string; attorneyName: string; history: ChatTurn[]; settings: ResolvedSettings }) {
  const system = `You are Maya, the assistant inside LegalRoute for the law firm ${opts.firmName}. You are helping ${opts.attorneyName} with one client.

${opts.context}

How to help:
- Answer questions about this client from the information above. If something isn't on file, say so plainly; never invent facts, dates or amounts.
- For a personal injury matter, documents usually needed include: medical records and bills, the police or incident report, photos of the scene and injuries, wage loss verification, insurance information, and repair estimates. Point out which are missing when asked.
- When asked to draft an email or letter, write the full draft in your reply, addressed to the client, signed from the firm. Don't claim you sent it.
- Only add tasks or document requests when the attorney asks for them (for example "add a task to call her Friday" or "request the police report"). Then confirm what you added.
- When asked to schedule a consultation, explain they can use the Schedule consultation button or the Calendar page; you can add a follow-up task if they want.
- Keep replies concise and practical. You assist attorneys; do not give the client legal advice.`;

  return generateStructured({ system, messages: opts.history, schema: clientTurnSchema, name: "client_turn", settings: opts.settings });
}
