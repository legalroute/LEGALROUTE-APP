import "server-only";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { activities, clients, db, intakeSessions, tasks } from "@/db";
import type { CurrentUser } from "@/lib/auth";
import type { ChatTurn } from "@/lib/llm/types";
import { generateStructured } from "@/lib/llm/structured";
import type { ResolvedSettings } from "@/lib/settings";

const homeTurnSchema = z.object({
  reply: z.string().describe("Your reply to the attorney. Plain text; short bullet lines starting with '- ' are fine."),
});

async function firmSnapshot(firmId: string) {
  const [pending, recentClients, openTasks, recent, [{ value: clientCount }]] = await Promise.all([
    db
      .select()
      .from(intakeSessions)
      .where(and(eq(intakeSessions.lawFirmId, firmId), inArray(intakeSessions.status, ["pending_review", "info_requested"])))
      .orderBy(desc(intakeSessions.submittedAt))
      .limit(15),
    db.select().from(clients).where(eq(clients.lawFirmId, firmId)).orderBy(desc(clients.createdAt)).limit(25),
    db
      .select({ title: tasks.title, dueDate: tasks.dueDate, client: clients.name })
      .from(tasks)
      .leftJoin(clients, eq(clients.id, tasks.clientId))
      .where(and(eq(tasks.lawFirmId, firmId), eq(tasks.status, "open")))
      .orderBy(tasks.dueDate)
      .limit(20),
    db.select().from(activities).where(eq(activities.lawFirmId, firmId)).orderBy(desc(activities.createdAt)).limit(15),
    db.select({ value: count() }).from(clients).where(eq(clients.lawFirmId, firmId)),
  ]);
  return [
    `Intakes waiting for review (${pending.length}):\n${pending.map((s) => `- ${s.clientName ?? "Unnamed"} — ${s.matterType ?? "unknown matter"}, ${s.status === "info_requested" ? "info requested" : "pending review"}${s.endedEarly ? ", ended early" : ""}`).join("\n") || "- none"}`,
    `Clients (${clientCount} total, newest first):\n${recentClients.map((c) => `- ${c.name} — ${c.matterType ?? "unknown matter"}, ${c.status}`).join("\n") || "- none"}`,
    `Open tasks:\n${openTasks.map((t) => `- ${t.title}${t.client ? ` (${t.client})` : ""}${t.dueDate ? `, due ${t.dueDate}` : ""}`).join("\n") || "- none"}`,
    `Recent activity:\n${recent.map((a) => `- ${a.createdAt.toISOString().slice(0, 16).replace("T", " ")} ${a.summary}`).join("\n") || "- none"}`,
  ].join("\n\n");
}

export async function homeTurn(opts: { user: CurrentUser; history: ChatTurn[]; settings: ResolvedSettings }) {
  const system = `You are Maya, the assistant inside LegalRoute for the law firm ${opts.user.firm.name}. You are talking with ${opts.user.name ?? opts.user.email}, an attorney at the firm. Today is ${new Date().toDateString()}.

What's happening at the firm right now:
${await firmSnapshot(opts.user.firm.id)}

How to help:
- Answer questions about the firm's intakes, clients, tasks and activity from the information above. If something isn't there, say so; never invent clients, dates or numbers.
- Point the attorney to the right place in LegalRoute: Intakes (review submissions), Clients (each client has a workspace where you can help with that client's documents and emails), Intake Builder (edit intake questions), Calendar (connect calendars and schedule consultations), Settings (firm profile, intake link, client experience).
- When asked to draft an email, write the full draft. Don't claim you sent anything.
- Keep replies short and practical. You assist attorneys; you don't give legal advice to clients.`;
  return generateStructured({ system, messages: opts.history, schema: homeTurnSchema, name: "home_turn", settings: opts.settings });
}
