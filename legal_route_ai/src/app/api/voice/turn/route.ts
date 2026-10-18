import { asc, eq } from "drizzle-orm";
import { db, voiceConversations, voiceMessages } from "@/db";
import { DeepgramError, transcribe } from "@/lib/deepgram";
import { generateReply, LlmError, type ChatTurn } from "@/lib/llm";
import { getSettings } from "@/lib/settings";
import type { TurnEvent, VoiceErrorResponse } from "@/lib/voice-types";
import { progressPercent, saveAudio, toDto, trySynthesize } from "../shared";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function fail(status: number, error: string) {
  return Response.json({ error } satisfies VoiceErrorResponse, { status });
}

// One spoken turn: transcribe the client, ask the LLM, speak the reply.
// Failures before the transcript is saved return a JSON error; after that, progress
// streams as newline-delimited TurnEvents (transcript → reply → audio, or error).
export async function POST(request: Request) {
  const form = await request.formData();
  const conversationId = form.get("conversationId");
  const audio = form.get("audio");
  if (typeof conversationId !== "string" || !(audio instanceof File) || audio.size === 0) {
    return fail(400, "Missing conversation or audio.");
  }
  if (audio.size > MAX_AUDIO_BYTES) return fail(413, "That recording is too long. Please keep messages shorter.");

  const [conversation] = await db.select().from(voiceConversations).where(eq(voiceConversations.id, conversationId));
  if (!conversation) return fail(404, "Conversation not found. Start a new intake.");
  if (conversation.completedAt) return fail(409, "This intake is already complete.");

  let transcript: string;
  try {
    transcript = await transcribe(audio);
  } catch (e) {
    return fail(502, e instanceof DeepgramError ? e.message : "Transcription failed.");
  }
  if (!transcript) return fail(422, "I didn't catch that. Please try again a little closer to the microphone.");

  const [clientMessage] = await db
    .insert(voiceMessages)
    .values({ conversationId, role: "client", text: transcript })
    .returning();
  const ext = audio.type.includes("ogg") ? "ogg" : audio.type.includes("mp4") ? "m4a" : audio.type.includes("mpeg") ? "mp3" : audio.type.includes("wav") ? "wav" : "webm";
  const clientAudioPath = await saveAudio(conversationId, `${clientMessage.id}.${ext}`, Buffer.from(await audio.arrayBuffer()));
  await db.update(voiceMessages).set({ audioPath: clientAudioPath }).where(eq(voiceMessages.id, clientMessage.id));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: TurnEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        send({ type: "transcript", clientMessage: toDto(clientMessage) });

        const rows = await db
          .select()
          .from(voiceMessages)
          .where(eq(voiceMessages.conversationId, conversationId))
          .orderBy(asc(voiceMessages.createdAt));
        // The greeting lives in the system prompt; the API history must start with the client.
        const firstClient = rows.findIndex((m) => m.role === "client");
        const history: ChatTurn[] = rows
          .slice(firstClient)
          .map((m) => ({ role: m.role === "client" ? "user" : "assistant", text: m.text }));

        const settings = await getSettings();
        const started = Date.now();
        let result;
        try {
          result = await generateReply(history, settings);
        } catch (e) {
          console.error("[voice] LLM error", e);
          const name = settings.provider === "openai" ? "ChatGPT" : "Claude";
          send({ type: "error", error: e instanceof LlmError ? e.message : `The ${name} request failed.` });
          return;
        }
        const latencyMs = Date.now() - started;

        // Progress only moves forward, even if the model omits a topic it listed before.
        const covered = [...new Set([...conversation.coveredTopics, ...result.covered_topics])];
        const clientName = result.client_name?.trim() || conversation.clientName;
        // A client asking to stop ends the intake just like finishing it, but is recorded separately.
        const endReason = result.intake_complete ? "completed" : result.client_ended ? "client_ended" : null;
        await db
          .update(voiceConversations)
          .set({ coveredTopics: covered, clientName, completedAt: endReason ? new Date() : null, endReason })
          .where(eq(voiceConversations.id, conversationId));

        const [scribeMessage] = await db
          .insert(voiceMessages)
          .values({ conversationId, role: "scribe", text: result.reply, provider: settings.provider, model: result.model, latencyMs })
          .returning();
        send({
          type: "reply",
          scribeMessage: toDto(scribeMessage),
          percent: progressPercent(covered),
          clientName,
          complete: endReason !== null,
          endedEarly: endReason === "client_ended",
        });

        const speech = await trySynthesize(result.reply);
        if (speech.bytes) {
          const audioPath = await saveAudio(conversationId, `${scribeMessage.id}.mp3`, speech.bytes);
          await db.update(voiceMessages).set({ audioPath }).where(eq(voiceMessages.id, scribeMessage.id));
        }
        send({ type: "audio", audio: speech.bytes?.toString("base64") ?? null, warning: speech.warning });
      } catch (e) {
        console.error("[voice] turn error", e);
        send({ type: "error", error: "Something went wrong processing that message." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
