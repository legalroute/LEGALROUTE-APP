import { eq } from "drizzle-orm";
import { db, voiceConversations, voiceMessages } from "@/db";
import { GREETING } from "@/lib/intake";
import type { StartResponse, VoiceErrorResponse } from "@/lib/voice-types";
import { saveAudio, toDto, trySynthesize } from "../shared";

// Starts an intake once the client has consented to recording; Scribe speaks first.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (body?.consent !== true) {
    return Response.json({ error: "Consent to record is required." } satisfies VoiceErrorResponse, { status: 400 });
  }

  const [conversation] = await db.insert(voiceConversations).values({ consentedAt: new Date() }).returning();
  const [message] = await db
    .insert(voiceMessages)
    .values({ conversationId: conversation.id, role: "scribe", text: GREETING })
    .returning();

  const speech = await trySynthesize(GREETING);
  if (speech.bytes) {
    const audioPath = await saveAudio(conversation.id, `${message.id}.mp3`, speech.bytes);
    await db.update(voiceMessages).set({ audioPath }).where(eq(voiceMessages.id, message.id));
  }

  return Response.json({
    conversationId: conversation.id,
    message: toDto(message),
    audio: speech.bytes?.toString("base64") ?? null,
    warning: speech.warning,
    percent: 0,
    clientName: null,
    complete: false,
    endedEarly: false,
  } satisfies StartResponse);
}
