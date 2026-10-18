import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, lawFirms, loginTokens, sessions, users, type LawFirm, type User } from "@/db";
import { uniqueFirmSlug } from "@/lib/firm";

export const SESSION_COOKIE = "lr_session";
const SESSION_DAYS = 30;
const LINK_MINUTES = 15;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

// Absolute base URL for links in emails. Honors tunnels (ngrok) via forwarded headers.
export async function appOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function createLoginLink(email: string) {
  const token = newToken();
  await db.insert(loginTokens).values({
    email: normalizeEmail(email),
    tokenHash: hash(token),
    expiresAt: new Date(Date.now() + LINK_MINUTES * 60_000),
  });
  return `${await appOrigin()}/login/verify?token=${encodeURIComponent(token)}`;
}

// Looks a token up without using it, so the confirm page can show who is signing in.
export async function peekLoginToken(token: string) {
  const [row] = await db
    .select()
    .from(loginTokens)
    .where(and(eq(loginTokens.tokenHash, hash(token)), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, new Date())));
  return row ?? null;
}

// Marks the token used and returns the email it was issued for, or null if invalid or expired.
export async function consumeLoginToken(token: string) {
  const [row] = await db
    .update(loginTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(loginTokens.tokenHash, hash(token)), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, new Date())))
    .returning();
  return row?.email ?? null;
}

// The very first attorney joins the firm that holds the migrated data; anyone after that gets a new firm.
export async function findOrCreateUser(email: string): Promise<User> {
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) return existing;

  const [{ value: userCount }] = await db.select({ value: count() }).from(users);
  const [legacyFirm] = await db.select().from(lawFirms).where(eq(lawFirms.ownsLegacyVoice, true));
  let firmId = userCount === 0 ? legacyFirm?.id : undefined;
  if (!firmId) {
    const domain = email.split("@")[1]?.split(".")[0] ?? "firm";
    const name = `${domain.charAt(0).toUpperCase()}${domain.slice(1)} Law`;
    const [firm] = await db
      .insert(lawFirms)
      .values({ name, slug: await uniqueFirmSlug(name), email, settings: { showProgress: true, showThankYou: true } })
      .returning();
    firmId = firm.id;
  }

  const local = email.split("@")[0].replace(/[._-]+/g, " ");
  const name = local.replace(/\b\w/g, (c) => c.toUpperCase());
  const [user] = await db.insert(users).values({ email, name, lawFirmId: firmId }).returning();
  return user;
}

export async function startSession(userId: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ tokenHash: hash(token), userId, expiresAt });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hash(token)));
  jar.delete(SESSION_COOKIE);
}

export type CurrentUser = User & { firm: LawFirm };

// One lookup per request, shared by the layout, pages and actions.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({ user: users, firm: lawFirms })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(lawFirms, eq(lawFirms.id, users.lawFirmId))
    .where(and(eq(sessions.tokenHash, hash(token)), gt(sessions.expiresAt, new Date())));
  return row ? { ...row.user, firm: row.firm } : null;
});

// Every attorney page, Server Action and private route handler calls this.
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
