import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, intakeSessions, voiceConversations, voiceMessages } from "@/db";
import { issueIntakeToken, intakeAccessService, IntakeAccessError, resumePath } from "@legalroute/backend/services/intake-access";
import { emailConfigured, sendEmail } from "@/lib/email";
import { allQuestions } from "@/lib/intake-config";
import { answeredPercent } from "@/lib/template-intake";
import { logActivity } from "@/lib/firm";
import { resolvePublicIntake } from "@/lib/public-intake";
import { greetingFor } from "@/lib/template-intake";
import type { StartResponse, VoiceErrorResponse } from "@/lib/voice-types";
import { saveAudio, toDto, trySynthesize } from "../../../voice/shared";

const bodySchema = z.object({
  consent: z.literal(true),
  sessionToken: z.string().max(100).optional(),
  emailResume: z.enum(["true", "false"]).optional(),
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

  if (parsed.data.sessionToken) {
    try {
      const resumed = await intakeAccessService.resume(slug, parsed.data.sessionToken);
      const answered = new Set(resumed.answeredIds);
      const next = allQuestions(resumed.session.config!).find((q) => !answered.has(q.id));
      const greeting = next ? `Welcome back. ${next.text}` : "Welcome back. Is there anything else you would like the firm to know?";
      const [message] = await db.insert(voiceMessages).values({ conversationId: resumed.conversation.id, role: "scribe", text: greeting }).returning();
      const speech = await trySynthesize(greeting);
      if (speech.bytes) { const audioPath = await saveAudio(resumed.conversation.id, `${message.id}.mp3`, speech.bytes); await db.update(voiceMessages).set({ audioPath }).where(eq(voiceMessages.id, message.id)); }
      return Response.json({ conversationId: resumed.conversation.id, accessToken: parsed.data.sessionToken, resumeUrl: resumePath(slug, parsed.data.sessionToken), messages: [...resumed.messages.map(toDto), toDto(message)], message: toDto(message), audio: speech.bytes?.toString("base64") ?? null, warning: speech.warning, percent: answeredPercent(resumed.session.config!, resumed.answeredIds), clientName: resumed.session.clientName, complete: false, endedEarly: false } satisfies StartResponse, { headers: { "Cache-Control": "no-store" } });
    } catch (error) { if (error instanceof IntakeAccessError) return fail(403, error.message); throw error; }
  }
  if (parsed.data.emailResume === "true" && !z.email().safeParse(parsed.data.email).success) return fail(400, "Enter a valid email to receive your resume link.");
  const resolved = await resolvePublicIntake(slug, parsed.data.templateId);
  if (!resolved) return fail(404, "This intake link doesn't exist.");
  const { firm, template } = resolved;
  if (!template) return fail(404, "This firm hasn't published an intake yet.");
  if (firm.settings.collectEmailAtStart && !parsed.data.email) return fail(400, "Please enter your email to begin.");

  const greeting = greetingFor(firm.name, template.publishedConfig, firm.settings.welcomeMessage);
  const clientName = parsed.data.name || null;
  const clientEmail = parsed.data.email || null;

  // One transaction, so the /voice mirror never sees this conversation without its session.
  const { conversation, message, access } = await db.transaction(async (tx) => {
    const [conversation] = await tx.insert(voiceConversations).values({ consentedAt: new Date(), clientName }).returning();
    const [session] = await tx.insert(intakeSessions).values({
      lawFirmId: firm.id,
      templateId: template.id,
      voiceConversationId: conversation.id,
      config: template.publishedConfig,
      clientName,
      clientEmail,
      matterType: template.practiceArea,
    }).returning();
    const access = await issueIntakeToken(tx, firm.id, session.id);
    const [message] = await tx.insert(voiceMessages).values({ conversationId: conversation.id, role: "scribe", text: greeting }).returning();
    return { conversation, message, access };
  });
  await logActivity(firm.id, "intake", `Intake started${clientName ? ` — ${clientName}` : ""} (${template.name})`);

  const speech = await trySynthesize(greeting);
  if (speech.bytes) {
    const audioPath = await saveAudio(conversation.id, `${message.id}.mp3`, speech.bytes);
    await db.update(voiceMessages).set({ audioPath }).where(eq(voiceMessages.id, message.id));
  }

  const resumeUrl = resumePath(slug, access.token);
  let emailWarning: string | undefined;
  if (parsed.data.emailResume === "true" && clientEmail) {
    let origin: string | undefined;
    try { const url = new URL(process.env.APP_URL || ""); if (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) origin = url.origin; } catch { /* no usable configured origin */ }
    if (!emailConfigured() || !origin) emailWarning = "Email delivery is not configured. Copy your private resume link below.";
    else {
      const result = await sendEmail({ to: clientEmail, subject: `${firm.name}: your private intake link`, text: `You can return to your intake here:\n${origin}${resumeUrl}\n\nThis private link expires in 7 days. Anyone with it can access this intake; keep it private. Contact ${firm.name} if you need a replacement.` });
      if (!result.delivered) emailWarning = "Your resume email could not be delivered. Copy your private link below.";
    }
  }
  return Response.json({
    accessToken: access.token,
    resumeUrl,
    conversationId: conversation.id,
    message: toDto(message),
    audio: speech.bytes?.toString("base64") ?? null,
    warning: [speech.warning, emailWarning].filter(Boolean).join(" ") || undefined,
    percent: 0,
    clientName,
    complete: false,
    endedEarly: false,
  } satisfies StartResponse, { headers: { "Cache-Control": "no-store" } });
}
