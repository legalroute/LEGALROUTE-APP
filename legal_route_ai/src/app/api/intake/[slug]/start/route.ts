import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, intakeSessions, voiceConversations, voiceMessages } from "@/db";
import { logActivity } from "@/lib/firm";
import { resolvePublicIntake } from "@/lib/public-intake";
import { greetingFor } from "@/lib/template-intake";
import type { StartResponse, VoiceErrorResponse } from "@/lib/voice-types";
import { saveAudio, toDto, trySynthesize } from "../../../voice/shared";

const bodySchema = z.object({
  consent: z.literal(true),
  templateId: z.string().uuid().optional(),
  name: z.string().trim().max(200).optional(),
  email: z.string().trim().max(320).optional(),
});

function fail(status: number, error: string) {
  return Response.json({ error } satisfies VoiceErrorResponse, { status });
}

// Starts a firm intake once the client has consented to recording; Maya speaks first.
export async function POST(request: Request, ctx: RouteContext<"/api/intake/[slug]/start">) {
  const { slug } = await ctx.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Consent to record is required.");

  const resolved = await resolvePublicIntake(slug, parsed.data.templateId);
  if (!resolved) return fail(404, "This intake link doesn't exist.");
  const { firm, template } = resolved;
  if (!template) return fail(404, "This firm hasn't published an intake yet.");
  if (firm.settings.collectEmailAtStart && !parsed.data.email) return fail(400, "Please enter your email to begin.");

  const greeting = greetingFor(firm.name, template.publishedConfig, firm.settings.welcomeMessage);
  const clientName = parsed.data.name || null;
  const clientEmail = parsed.data.email || null;

  // One transaction, so the /voice mirror never sees this conversation without its session.
  const { conversation, message } = await db.transaction(async (tx) => {
    const [conversation] = await tx.insert(voiceConversations).values({ consentedAt: new Date(), clientName }).returning();
    await tx.insert(intakeSessions).values({
      lawFirmId: firm.id,
      templateId: template.id,
      voiceConversationId: conversation.id,
      config: template.publishedConfig,
      clientName,
      clientEmail,
      matterType: template.practiceArea,
    });
    const [message] = await tx.insert(voiceMessages).values({ conversationId: conversation.id, role: "scribe", text: greeting }).returning();
    return { conversation, message };
  });
  await logActivity(firm.id, "intake", `Intake started${clientName ? ` — ${clientName}` : ""} (${template.name})`);

  const speech = await trySynthesize(greeting);
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
    clientName,
    complete: false,
    endedEarly: false,
  } satisfies StartResponse);
}
