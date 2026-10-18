"use server";

import { requireUser } from "@/lib/auth";
import { LlmError } from "@/lib/llm/types";
import { clearChat, loadChat, saveChatMessage, toChatDto, toTurns, type ChatMessageDto } from "@/lib/maya/history";
import { homeTurn } from "@/lib/maya/home";
import { getSettings } from "@/lib/settings";
import { revalidatePath } from "next/cache";

export type HomeSendResult = { reply?: ChatMessageDto; userMessage?: ChatMessageDto; error?: string };

// Home chats are per attorney's firm; history is shared by the firm's attorneys.
export async function sendHomeMessage(text: string): Promise<HomeSendResult> {
  const user = await requireUser();
  const message = text.trim().slice(0, 4000);
  if (!message) return { error: "Type a message for Maya." };
  const userMessage = await saveChatMessage({ firmId: user.firm.id, userId: user.id, scope: "home", scopeId: null, role: "user", text: message });
  try {
    const result = await homeTurn({ user, history: toTurns(await loadChat(user.firm.id, "home", null, 20)), settings: await getSettings() });
    const reply = await saveChatMessage({ firmId: user.firm.id, userId: null, scope: "home", scopeId: null, role: "assistant", text: result.reply });
    return { userMessage: toChatDto(userMessage), reply: toChatDto(reply) };
  } catch (e) {
    console.error("[home] Maya error", e);
    return { userMessage: toChatDto(userMessage), error: e instanceof LlmError ? e.message : "Maya couldn't respond. Please try again." };
  }
}

export async function clearHomeChat() {
  const user = await requireUser();
  await clearChat(user.firm.id, "home", null);
  revalidatePath("/home");
}
