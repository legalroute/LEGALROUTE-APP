"use server";

import { unlink } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clients, db, documents, tasks } from "@/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/firm";
import { LlmError } from "@/lib/llm/types";
import { clientTurn } from "@/lib/maya/client";
import { loadChat, saveChatMessage, toChatDto, toTurns, type ChatMessageDto } from "@/lib/maya/history";
import { getSettings } from "@/lib/settings";
import { uploadPath } from "@/lib/uploads";

async function loadClient(user: CurrentUser, clientId: string) {
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.lawFirmId, user.firm.id)))
    .catch(() => []);
  return client ?? null;
}

const refresh = (clientId: string) => {
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
};

const clientFields = z.object({
  name: z.string().trim().min(1, "Enter the client's name").max(200),
  email: z.union([z.literal(""), z.email("Enter a valid email")]),
  phone: z.string().trim().max(50),
  matterType: z.string().trim().max(120),
});

export type ClientFormState = { error?: string; ok?: boolean };

export async function createClient(_prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const user = await requireUser();
  const parsed = clientFields.safeParse({
    name: formData.get("name"),
    email: String(formData.get("email") ?? "").trim(),
    phone: formData.get("phone") ?? "",
    matterType: formData.get("matterType") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const [client] = await db
    .insert(clients)
    .values({
      lawFirmId: user.firm.id,
      name: parsed.data.name,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      matterType: parsed.data.matterType || null,
      status: "lead",
    })
    .returning();
  await logActivity(user.firm.id, "client", `Client added — ${client.name}`, client.id);
  redirect(`/clients/${client.id}`);
}

export async function updateClient(clientId: string, _prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const user = await requireUser();
  const client = await loadClient(user, clientId);
  if (!client) return { error: "This client no longer exists." };
  const parsed = clientFields
    .extend({ status: z.enum(["lead", "qualified", "active", "closed"]), notes: z.string().max(10000) })
    .safeParse({
      name: formData.get("name"),
      email: String(formData.get("email") ?? "").trim(),
      phone: formData.get("phone") ?? "",
      matterType: formData.get("matterType") ?? "",
      status: formData.get("status"),
      notes: formData.get("notes") ?? "",
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  await db
    .update(clients)
    .set({ name: d.name, email: d.email || null, phone: d.phone || null, matterType: d.matterType || null, status: d.status, notes: d.notes || null })
    .where(eq(clients.id, client.id));
  if (d.status !== client.status) await logActivity(user.firm.id, "client", `Status changed to ${d.status}`, client.id);
  refresh(client.id);
  return { ok: true };
}

export type ClientSendResult = { reply?: ChatMessageDto; userMessage?: ChatMessageDto; error?: string };

export async function sendClientMessage(clientId: string, text: string): Promise<ClientSendResult> {
  const user = await requireUser();
  const client = await loadClient(user, clientId);
  if (!client) return { error: "This client no longer exists." };
  const message = text.trim().slice(0, 4000);
  if (!message) return { error: "Type a message for Maya." };

  const userMessage = await saveChatMessage({ firmId: user.firm.id, userId: user.id, scope: "client", scopeId: client.id, role: "user", text: message });
  try {
    const result = await clientTurn({
      client,
      firmName: user.firm.name,
      attorneyName: user.name ?? user.email,
      history: toTurns(await loadChat(user.firm.id, "client", client.id, 20)),
      settings: await getSettings(),
    });
    const newTasks = result.create_tasks.map((t) => t.trim()).filter(Boolean).slice(0, 10);
    const newDocs = result.request_documents.map((d) => d.trim()).filter(Boolean).slice(0, 10);
    if (newTasks.length) {
      await db.insert(tasks).values(newTasks.map((title) => ({ lawFirmId: user.firm.id, clientId: client.id, title })));
      await logActivity(user.firm.id, "task", `Maya added ${newTasks.length} task${newTasks.length > 1 ? "s" : ""}: ${newTasks.join("; ")}`, client.id);
    }
    if (newDocs.length) {
      await db.insert(documents).values(newDocs.map((name) => ({ lawFirmId: user.firm.id, clientId: client.id, name, status: "requested" as const })));
      await logActivity(user.firm.id, "document", `Documents requested: ${newDocs.join(", ")}`, client.id);
    }
    const reply = await saveChatMessage({ firmId: user.firm.id, userId: null, scope: "client", scopeId: client.id, role: "assistant", text: result.reply });
    if (newTasks.length || newDocs.length) refresh(client.id);
    return { userMessage: toChatDto(userMessage), reply: toChatDto(reply) };
  } catch (e) {
    console.error("[client] Maya error", e);
    return { userMessage: toChatDto(userMessage), error: e instanceof LlmError ? e.message : "Maya couldn't respond. Please try again." };
  }
}

export async function addTask(clientId: string, formData: FormData) {
  const user = await requireUser();
  const client = await loadClient(user, clientId);
  if (!client) return;
  const title = String(formData.get("title") ?? "").trim().slice(0, 300);
  const due = String(formData.get("dueDate") ?? "");
  if (!title) return;
  await db.insert(tasks).values({ lawFirmId: user.firm.id, clientId: client.id, title, dueDate: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null });
  await logActivity(user.firm.id, "task", `Task added — ${title}`, client.id);
  refresh(client.id);
}

export async function toggleTask(clientId: string, taskId: string) {
  const user = await requireUser();
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.lawFirmId, user.firm.id)));
  if (!task) return;
  const status = task.status === "open" ? "done" : "open";
  await db.update(tasks).set({ status }).where(eq(tasks.id, task.id));
  if (status === "done") await logActivity(user.firm.id, "task", `Task completed — ${task.title}`, task.clientId);
  refresh(clientId);
}

export async function deleteTask(clientId: string, taskId: string) {
  const user = await requireUser();
  await db.delete(tasks).where(and(eq(tasks.id, taskId), eq(tasks.lawFirmId, user.firm.id)));
  refresh(clientId);
}

export async function requestDocument(clientId: string, formData: FormData) {
  const user = await requireUser();
  const client = await loadClient(user, clientId);
  if (!client) return;
  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  if (!name) return;
  await db.insert(documents).values({ lawFirmId: user.firm.id, clientId: client.id, name, status: "requested" });
  await logActivity(user.firm.id, "document", `Document requested — ${name}`, client.id);
  refresh(client.id);
}

export async function deleteDocument(clientId: string, documentId: string) {
  const user = await requireUser();
  const [doc] = await db.select().from(documents).where(and(eq(documents.id, documentId), eq(documents.lawFirmId, user.firm.id)));
  if (!doc) return;
  await db.delete(documents).where(eq(documents.id, doc.id));
  if (doc.filePath) await unlink(uploadPath(doc.filePath)).catch(() => {});
  await logActivity(user.firm.id, "document", `Document removed — ${doc.name}`, doc.clientId);
  refresh(clientId);
}
