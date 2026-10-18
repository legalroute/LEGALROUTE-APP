import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { activities, db, documents, intakeResponses, intakeSessions, tasks, type Client } from "@/db";
import type { ChatTurn } from "@/lib/llm/types";
import { generateStructured } from "@/lib/llm/structured";
import type { ResolvedSettings } from "@/lib/settings";

const clientTurnSchema = z.object({
  reply: z.string().describe("Your reply to the attorney. Plain text; short bullet lines starting with '- ' are fine."),
  create_tasks: z.array(z.string()).describe("Tasks to add to this client's task list, only when the attorney asks you to."),
  request_documents: z
    .array(z.string())
    .describe("Documents to mark as requested from the client (e.g. 'Repair estimate'), only when the attorney asks you to."),
});

// Everything Maya knows about one client, as plain text for the prompt.
export async function clientContext(client: Client) {
  const [sessions, docs, openTasks, recent] = await Promise.all([
    db.select().from(intakeSessions).where(eq(intakeSessions.clientId, client.id)),
    db.select().from(documents).where(eq(documents.clientId, client.id)),
    db.select().from(tasks).where(and(eq(tasks.clientId, client.id), eq(tasks.status, "open"))),
    db.select().from(activities).where(eq(activities.clientId, client.id)).orderBy(desc(activities.createdAt)).limit(10),
  ]);
  const responses = sessions.length
    ? await db.select().from(intakeResponses).where(inArray(intakeResponses.sessionId, sessions.map((s) => s.id)))
    : [];

  return [
    `Client: ${client.name}`,
    `Status: ${client.status}. Matter type: ${client.matterType ?? "unknown"}.`,
    `Contact: ${[client.email, client.phone].filter(Boolean).join(", ") || "none on file"}.`,
    client.notes ? `Attorney notes: ${client.notes}` : "",
    responses.length ? `Intake answers:\n${responses.map((r) => `- ${r.questionText} ${r.value}`).join("\n")}` : "No intake answers on file.",
    `Documents received: ${docs.filter((d) => d.status === "received").map((d) => d.name).join(", ") || "none"}.`,
    `Documents requested but not received: ${docs.filter((d) => d.status === "requested").map((d) => d.name).join(", ") || "none"}.`,
    `Open tasks: ${openTasks.map((t) => t.title + (t.dueDate ? ` (due ${t.dueDate})` : "")).join("; ") || "none"}.`,
    recent.length ? `Recent activity:\n${recent.map((a) => `- ${a.createdAt.toISOString().slice(0, 10)} ${a.summary}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function clientTurn(opts: { client: Client; firmName: string; attorneyName: string; history: ChatTurn[]; settings: ResolvedSettings }) {
  const system = `You are Maya, the assistant inside LegalRoute for the law firm ${opts.firmName}. You are helping ${opts.attorneyName} with one client.

${await clientContext(opts.client)}

How to help:
- Answer questions about this client from the information above. If something isn't on file, say so plainly; never invent facts, dates or amounts.
- For a personal injury matter, documents usually needed include: medical records and bills, the police or incident report, photos of the scene and injuries, wage loss verification, insurance information, and repair estimates. Point out which are missing when asked.
- When asked to draft an email or letter, write the full draft in your reply, addressed to the client, signed from the firm. Don't claim you sent it.
- Only add tasks or document requests when the attorney asks for them (for example "add a task to call her Friday" or "request the police report"). Then confirm what you added.
- When asked to schedule a consultation, explain they can use the Schedule consultation button or the Calendar page; you can add a follow-up task if they want.
- Keep replies concise and practical. You assist attorneys; do not give the client legal advice.`;

  return generateStructured({ system, messages: opts.history, schema: clientTurnSchema, name: "client_turn", settings: opts.settings });
}
