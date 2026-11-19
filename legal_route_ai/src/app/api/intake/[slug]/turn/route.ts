import { asc, eq, sql } from "drizzle-orm";
import { db, intakeResponses, intakeSessions, lawFirms, voiceConversations, voiceMessages } from "@/db";
import { DeepgramError, transcribe } from "@/lib/deepgram";
import { sendEmail } from "@/lib/email";
import { logActivity } from "@/lib/firm";
import { allQuestions } from "@/lib/intake-config";
import { LlmError, type ChatTurn } from "@/lib/llm/types";
import { getSettings } from "@/lib/settings";
import { answeredPercent, templateIntakeTurn } from "@/lib/template-intake";
import type { TurnEvent, VoiceErrorResponse } from "@/lib/voice-types";
import { intakeAccessService, IntakeAccessError } from "@legalroute/backend/services/intake-access";
import { saveAudio, toDto, trySynthesize } from "../../../voice/shared";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function fail(status: number, error: string) {
  return Response.json({ error } satisfies VoiceErrorResponse, { status });
}

// One spoken turn of a firm intake: transcribe, ask Maya, save answers, speak the reply.
// Same streaming protocol as /api/voice/turn (transcript → reply → audio, or error).
export async function POST(request: Request, ctx: RouteContext<"/api/intake/[slug]/turn">) {
  const { slug } = await ctx.params;
  const form = await request.formData();
  const conversationId = form.get("conversationId");
  const audio = form.get("audio");
  if (typeof conversationId !== "string" || !(audio instanceof File) || audio.size === 0) {
    return fail(400, "Missing conversation or audio.");
  }
  if (audio.size > MAX_AUDIO_BYTES) return fail(413, "That recording is too long. Please keep messages shorter.");

  let authorized;
  try { authorized = await intakeAccessService.authorize(slug, request.headers.get("authorization")?.replace(/^Bearer /i, "") || "", conversationId); }
  catch (error) { if (error instanceof IntakeAccessError) return fail(403, error.message); throw error; }
  const { session, conversation, firm } = authorized;
  const config = session.config!;
  if (conversation.completedAt) return fail(409, "This intake is already complete.");

  let transcript: string;
  try {
    transcript = await transcribe(audio);
  } catch (e) {
    return fail(502, e instanceof DeepgramError ? e.message : "Transcription failed.");
  }
  if (!transcript) return fail(422, "I didn't catch that. Please try again a little closer to the microphone.");

  const [clientMessage] = await db.insert(voiceMessages).values({ conversationId, role: "client", text: transcript }).returning();
  const ext = audio.type.includes("ogg") ? "ogg" : audio.type.includes("mp4") ? "m4a" : audio.type.includes("mpeg") ? "mp3" : audio.type.includes("wav") ? "wav" : "webm";
  const clientAudioPath = await saveAudio(conversationId, `${clientMessage.id}.${ext}`, Buffer.from(await audio.arrayBuffer()));
  await db.update(voiceMessages).set({ audioPath: clientAudioPath }).where(eq(voiceMessages.id, clientMessage.id));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: TurnEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        send({ type: "transcript", clientMessage: toDto(clientMessage) });

        const rows = await db.select().from(voiceMessages).where(eq(voiceMessages.conversationId, conversationId)).orderBy(asc(voiceMessages.createdAt));
        const greeting = rows.find((m) => m.role === "scribe")?.text ?? "";
        const history: ChatTurn[] = rows
          .slice(rows.findIndex((m) => m.role === "client"))
          .map((m) => ({ role: m.role === "client" ? "user" : "assistant", text: m.text }));
        const existing = await db.select().from(intakeResponses).where(eq(intakeResponses.sessionId, session.id));
        const answered = new Map(existing.map((r) => [r.questionId, r.value]));

        const settings = await getSettings();
        const started = Date.now();
        let result;
        try {
          result = await templateIntakeTurn({ firmName: firm.name, config, answered, greeting, history, settings });
        } catch (e) {
          console.error("[intake] LLM error", e);
          send({ type: "error", error: e instanceof LlmError ? e.message : "Maya couldn't respond. Please try again." });
          return;
        }
        const latencyMs = Date.now() - started;

        // Save answers, keyed by question; a later answer to the same question replaces the earlier one.
        const questionText = new Map(allQuestions(config).map((q) => [q.id, q.text]));
        const answers = result.answers.filter((a) => questionText.has(a.question_id) && a.answer.trim());
        if (answers.length) {
          await db
            .insert(intakeResponses)
            .values(answers.map((a) => ({ sessionId: session.id, questionId: a.question_id, questionText: questionText.get(a.question_id)!, value: a.answer.trim() })))
            .onConflictDoUpdate({
              target: [intakeResponses.sessionId, intakeResponses.questionId],
              set: { value: sql`excluded.value`, updatedAt: new Date() },
            });
          for (const a of answers) answered.set(a.question_id, a.answer.trim());
        }

        const clientName = result.client_name?.trim() || session.clientName;
        const clientEmail = result.client_email?.trim() || session.clientEmail;
        const endReason = result.intake_complete ? "completed" : result.client_ended ? "client_ended" : null;
        const now = new Date();
        await db
          .update(voiceConversations)
          .set({ clientName, completedAt: endReason ? now : null, endReason, coveredTopics: [...answered.keys()] })
          .where(eq(voiceConversations.id, conversationId));
        await db
          .update(intakeSessions)
          .set({
            clientName,
            clientEmail,
            ...(endReason ? { status: "pending_review" as const, submittedAt: now, endedEarly: endReason === "client_ended" } : {}),
          })
          .where(eq(intakeSessions.id, session.id));

        const [scribeMessage] = await db
          .insert(voiceMessages)
          .values({ conversationId, role: "scribe", text: result.reply, provider: settings.provider, model: result.model, latencyMs })
          .returning();
        const percent = endReason === "completed" ? 100 : answeredPercent(config, answered.keys());
        send({ type: "reply", scribeMessage: toDto(scribeMessage), percent, clientName, complete: endReason !== null, endedEarly: endReason === "client_ended" });

        if (endReason) await notifyFirm(firm, session.id, clientName, endReason === "client_ended", request);

        const speech = await trySynthesize(result.reply);
        if (speech.bytes) {
          const audioPath = await saveAudio(conversationId, `${scribeMessage.id}.mp3`, speech.bytes);
          await db.update(voiceMessages).set({ audioPath }).where(eq(voiceMessages.id, scribeMessage.id));
        }
        send({ type: "audio", audio: speech.bytes?.toString("base64") ?? null, warning: speech.warning });
      } catch (e) {
        console.error("[intake] turn error", e);
        send({ type: "error", error: "Something went wrong processing that message." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}

async function notifyFirm(
  firm: typeof lawFirms.$inferSelect,
  sessionId: string,
  clientName: string | null,
  endedEarly: boolean,
  request: Request,
) {
  const who = clientName ?? "A new client";
  await logActivity(firm.id, "intake", `New intake from ${who}${endedEarly ? " (ended early)" : ""}`);
  const to = firm.settings.notificationEmail || firm.email;
  if (firm.settings.notifyOnIntake === false || !to) return;
  const origin = process.env.APP_URL?.replace(/\/$/, "") ?? new URL(request.url).origin;
  await sendEmail({
    to,
    subject: `New intake: ${who}`,
    text: `${who} just finished an intake${endedEarly ? " (they stopped before every question was answered)" : ""}.\n\nReview it: ${origin}/intakes/${sessionId}`,
  });
}
