import { z } from "zod";
import type { CurrentUser } from "@legalroute/backend/services/auth";
import type { ChatTurn } from "../../llm/types.ts";
import { generateStructured } from "../../llm/structured.ts";
import type { ResolvedSettings } from "@legalroute/backend/contracts/ai";

const homeTurnSchema = z.object({
  reply: z.string().describe("Your reply to the attorney. Plain text; short bullet lines starting with '- ' are fine."),
});

export async function homeTurn(opts: { user: CurrentUser; snapshot: string; history: ChatTurn[]; settings: ResolvedSettings }) {
  const system = `You are Maya, the assistant inside LegalRoute for the law firm ${opts.user.firm.name}. You are talking with ${opts.user.name ?? opts.user.email}, an attorney at the firm. Today is ${new Date().toDateString()}.

What's happening at the firm right now:
${opts.snapshot}

How to help:
- Answer questions about the firm's intakes, clients, tasks and activity from the information above. If something isn't there, say so; never invent clients, dates or numbers.
- Point the attorney to the right place in LegalRoute: Intakes (review submissions), Clients (each client has a workspace where you can help with that client's documents and emails), Intake Builder (edit intake questions), Calendar (connect calendars and schedule consultations), Settings (firm profile, intake link, client experience).
- When asked to draft an email, write the full draft. Don't claim you sent anything.
- Keep replies short and practical. You assist attorneys; you don't give legal advice to clients.`;
  return generateStructured({ system, messages: opts.history, schema: homeTurnSchema, name: "home_turn", settings: opts.settings });
}
