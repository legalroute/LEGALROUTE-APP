import { and, desc, eq, inArray } from "drizzle-orm";
import { activities, db, documents, intakeResponses, intakeSessions, tasks, type Client } from "../../db/index.ts";

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
