import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import { db, lawFirms, loginTokens, sessions, users, type LawFirm, type User } from "../db/index.ts";
import { uniqueFirmSlug } from "./firm.ts";

export const SESSION_COOKIE = "lr_session";
const SESSION_DAYS = 30;
const LINK_MINUTES = 15;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export type CurrentUser = User & { firm: LawFirm };

export async function issueLoginToken(email: string) {
  const token = newToken();
  await db.insert(loginTokens).values({ email: normalizeEmail(email), tokenHash: hash(token), expiresAt: new Date(Date.now() + LINK_MINUTES * 60_000) });
  return token;
}
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


export async function createSession(userId: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ tokenHash: hash(token), userId, expiresAt });
  return { token, expiresAt };
}
export async function revokeSession(token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, hash(token)));
}
export async function currentUserForToken(token: string): Promise<CurrentUser | null> {
  const [row] = await db.select({ user: users, firm: lawFirms }).from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId)).innerJoin(lawFirms, eq(lawFirms.id, users.lawFirmId))
    .where(and(eq(sessions.tokenHash, hash(token)), gt(sessions.expiresAt, new Date())));
  return row ? { ...row.user, firm: row.firm } : null;
}
