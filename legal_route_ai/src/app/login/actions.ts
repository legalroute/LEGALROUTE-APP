"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { consumeLoginToken, createLoginLink, endSession, findOrCreateUser, normalizeEmail, startSession } from "@/lib/auth";
import { sendEmail } from "@/lib/email";

export type LoginState = { error?: string; sentTo?: string; devLink?: string };

const emailSchema = z.email("Enter a valid email address");

// Only same-site paths, so a crafted ?next= can't send someone to another site after login.
function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/home";
}

export async function requestMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const email = normalizeEmail(parsed.data);

  const next = safeNext(formData.get("next"));
  const link = await createLoginLink(email);
  const url = next === "/home" ? link : `${link}&next=${encodeURIComponent(next)}`;
  const result = await sendEmail({
    to: email,
    subject: "Your LegalRoute sign-in link",
    text: `Click to sign in to LegalRoute:\n\n${url}\n\nThis link works once and expires in 15 minutes. If you didn't ask for it, you can ignore this email.`,
  });
  // Without an email provider in development, show the link on screen so sign-in still works.
  const devLink = !result.delivered && process.env.NODE_ENV === "development" ? url : undefined;
  if (!result.delivered && !devLink) return { error: result.error ?? "We couldn't send the email. Please try again." };
  return { sentTo: email, devLink };
}

export async function confirmLogin(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const email = token ? await consumeLoginToken(token) : null;
  if (!email) redirect("/login?error=expired");
  const user = await findOrCreateUser(email);
  await startSession(user.id);
  redirect(safeNext(formData.get("next")));
}

export async function signOut() {
  await endSession();
  redirect("/login");
}
