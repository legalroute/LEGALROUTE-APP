import { and, count, desc, eq, inArray } from "drizzle-orm";
import { activities, clients, db, intakeSessions, tasks } from "../../db/index.ts";

export async function firmSnapshot(firmId: string) {
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
