"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clients, db, intakeResponses, intakeSessions } from "@/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { logActivity } from "@/lib/firm";

async function loadSession(user: CurrentUser, sessionId: string) {
  const [session] = await db
    .select()
    .from(intakeSessions)
    .where(and(eq(intakeSessions.id, sessionId), eq(intakeSessions.lawFirmId, user.firm.id)));
  return session ?? null;
}

function refresh(sessionId: string) {
  revalidatePath("/intakes");
  revalidatePath(`/intakes/${sessionId}`);
  revalidatePath("/home");
}

// Contact details the client gave during the intake, matched by common question ids.
function pickAnswer(responses: { questionId: string; value: string }[], ...needles: string[]) {
  return responses.find((r) => needles.some((n) => r.questionId.includes(n)))?.value ?? null;
}

export async function acceptIntake(sessionId: string) {
  const user = await requireUser();
  const session = await loadSession(user, sessionId);
  if (!session) redirect("/intakes");
  if (session.clientId) redirect(`/clients/${session.clientId}`);

  const responses = await db.select().from(intakeResponses).where(eq(intakeResponses.sessionId, session.id));
  const email = session.clientEmail ?? pickAnswer(responses, "email");
  const [client] = await db
    .insert(clients)
    .values({
      lawFirmId: user.firm.id,
      name: session.clientName ?? pickAnswer(responses, "full_name", "name") ?? "Unnamed client",
      email: email && /\S+@\S+/.test(email) ? email : null,
      phone: pickAnswer(responses, "phone"),
      matterType: session.matterType,
      status: "qualified",
    })
    .returning();
  await db
    .update(intakeSessions)
    .set({ clientId: client.id, status: "completed", reviewedAt: new Date() })
    .where(eq(intakeSessions.id, session.id));
  await logActivity(user.firm.id, "client", `${client.name} converted to a client from intake`, client.id);
  refresh(session.id);
  revalidatePath("/clients");
  redirect(`/clients/${client.id}`);
}

export async function markReviewed(sessionId: string) {
  const user = await requireUser();
  const session = await loadSession(user, sessionId);
  if (!session) return;
  await db.update(intakeSessions).set({ status: "reviewed", reviewedAt: new Date() }).where(eq(intakeSessions.id, session.id));
  await logActivity(user.firm.id, "intake", `Intake reviewed — ${session.clientName ?? "Unnamed client"}`, session.clientId);
  refresh(session.id);
}

export async function declineIntake(sessionId: string) {
  const user = await requireUser();
  const session = await loadSession(user, sessionId);
  if (!session) return;
  await db.update(intakeSessions).set({ status: "declined", reviewedAt: new Date() }).where(eq(intakeSessions.id, session.id));
  await logActivity(user.firm.id, "intake", `Intake declined — ${session.clientName ?? "Unnamed client"}`, session.clientId);
  refresh(session.id);
}

export type RequestInfoState = { error?: string; sent?: string };

export async function requestMoreInfo(sessionId: string, _prev: RequestInfoState, formData: FormData): Promise<RequestInfoState> {
  const user = await requireUser();
  const session = await loadSession(user, sessionId);
  if (!session) return { error: "This intake no longer exists." };
  const message = String(formData.get("message") ?? "").trim().slice(0, 5000);
  if (!message) return { error: "Write what you'd like the client to send or explain." };

  const responses = await db.select().from(intakeResponses).where(eq(intakeResponses.sessionId, session.id));
  const to = session.clientEmail ?? pickAnswer(responses, "email");
  let sent: string;
  if (to && /\S+@\S+/.test(to)) {
    const result = await sendEmail({ to, subject: `${user.firm.name}: a few more details about your case`, text: message });
    sent = result.delivered ? `Emailed ${to}.` : `Email isn't configured, so it was logged on the server instead of sent to ${to}.`;
  } else {
    sent = "No email on file for this client, so the request was saved but not sent. Follow up by phone.";
  }
  await db.update(intakeSessions).set({ status: "info_requested" }).where(eq(intakeSessions.id, session.id));
  await logActivity(user.firm.id, "intake", `More information requested from ${session.clientName ?? "client"}`, session.clientId);
  refresh(session.id);
  return { sent };
}
