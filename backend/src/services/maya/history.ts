import { and, desc, eq, isNull } from "drizzle-orm";
import { db, mayaMessages, type MayaMessage } from "../../db/index.ts";
type ChatTurn = { role: "user" | "assistant"; text: string };

export type MayaScope = "home" | "client" | "template";

export type ChatMessageDto = { id: string; role: "user" | "assistant"; text: string; createdAt: string };

export const toChatDto = (m: MayaMessage): ChatMessageDto => ({
  id: m.id,
  role: m.role,
  text: m.text,
  createdAt: m.createdAt.toISOString(),
});

function scopeFilter(firmId: string, scope: MayaScope, scopeId: string | null) {
  return and(
    eq(mayaMessages.lawFirmId, firmId),
    eq(mayaMessages.scope, scope),
    scopeId ? eq(mayaMessages.scopeId, scopeId) : isNull(mayaMessages.scopeId),
  );
}

// Most recent messages, oldest first.
export async function loadChat(firmId: string, scope: MayaScope, scopeId: string | null, limit = 40) {
  const rows = await db
    .select()
    .from(mayaMessages)
    .where(scopeFilter(firmId, scope, scopeId))
    .orderBy(desc(mayaMessages.createdAt))
    .limit(limit);
  return rows.reverse();
}

export function toTurns(messages: MayaMessage[]): ChatTurn[] {
  return messages.map((m) => ({ role: m.role, text: m.text }));
}

export async function saveChatMessage(values: {
  firmId: string;
  userId: string | null;
  scope: MayaScope;
  scopeId: string | null;
  role: "user" | "assistant";
  text: string;
}) {
  const [row] = await db
    .insert(mayaMessages)
    .values({ lawFirmId: values.firmId, userId: values.userId, scope: values.scope, scopeId: values.scopeId, role: values.role, text: values.text })
    .returning();
  return row;
}

export async function clearChat(firmId: string, scope: MayaScope, scopeId: string | null) {
  await db.delete(mayaMessages).where(scopeFilter(firmId, scope, scopeId));
}
