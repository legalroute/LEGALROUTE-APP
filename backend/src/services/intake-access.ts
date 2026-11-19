import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, activities, intakeAccess, intakeSessions, intakeResponses, lawFirms, voiceConversations, voiceMessages } from "../db/index.ts";
import type { CurrentUser } from "./auth.ts";
export const INTAKE_LINK_DAYS = 7;
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
export class IntakeAccessError extends Error {}
export const tokenFormat = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export function resumePath(slug: string, token: string) { return `/intake/${encodeURIComponent(slug)}/resume#${token}`; }
export async function issueIntakeToken(writer: Pick<typeof db, "insert">, lawFirmId: string, sessionId: string) {
  const token = randomBytes(32).toString("base64url"), expiresAt = new Date(Date.now() + INTAKE_LINK_DAYS * 86400000);
  await writer.insert(intakeAccess).values({ sessionId, lawFirmId, tokenHash: digest(token), expiresAt }).onConflictDoUpdate({ target: intakeAccess.sessionId, set: { tokenHash: digest(token), expiresAt, revokedAt: null, createdAt: new Date() } });
  return { token, expiresAt };
}
export function createIntakeAccessService(database = db) {
  async function authorize(slug: string, token: string, conversationId?: string) {
    if (!tokenFormat.safeParse(token).success || (conversationId !== undefined && !z.uuid().safeParse(conversationId).success)) throw new IntakeAccessError("This intake link is invalid, expired or no longer available. Ask the firm for a new link.");
    const [row] = await database.select({ access: intakeAccess, session: intakeSessions, conversation: voiceConversations, firm: lawFirms }).from(intakeAccess)
      .innerJoin(intakeSessions, and(eq(intakeSessions.id, intakeAccess.sessionId), eq(intakeSessions.lawFirmId, intakeAccess.lawFirmId)))
      .innerJoin(lawFirms, eq(lawFirms.id, intakeAccess.lawFirmId))
      .innerJoin(voiceConversations, eq(voiceConversations.id, intakeSessions.voiceConversationId))
      .where(and(eq(intakeAccess.tokenHash, digest(token)), eq(lawFirms.slug, slug), isNull(intakeAccess.revokedAt), gt(intakeAccess.expiresAt, new Date()), conversationId ? eq(voiceConversations.id, conversationId) : undefined));
    if (!row || !row.session.config) throw new IntakeAccessError("This intake link is invalid, expired or no longer available. Ask the firm for a new link.");
    if (row.conversation.completedAt || row.session.clientId || row.session.status !== "in_progress") throw new IntakeAccessError("This intake is closed. Contact the firm if you need to provide more information.");
    return row;
  }
  async function resume(slug: string, token: string) {
    const row = await authorize(slug, token);
    const messages = await database.select().from(voiceMessages).where(eq(voiceMessages.conversationId, row.conversation.id)).orderBy(asc(voiceMessages.createdAt), asc(voiceMessages.id));
    const answers = await database.select({ id: intakeResponses.questionId }).from(intakeResponses).where(eq(intakeResponses.sessionId, row.session.id));
    return { ...row, messages, answeredIds: answers.map((a) => a.id) };
  }
  async function manage(user: CurrentUser, id: string, operation: "rotate" | "revoke") {
    if (!["attorney", "admin"].includes(user.role)) throw new IntakeAccessError("An attorney or administrator must manage intake links.");
    z.string().uuid().parse(id);
    return database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`intake-access:${id}`},0))`);
      const [session] = await tx.select().from(intakeSessions).where(and(eq(intakeSessions.id, id), eq(intakeSessions.lawFirmId, user.firm.id)));
      if (!session) throw new IntakeAccessError("Intake unavailable.");
      if (operation === "revoke") { await tx.update(intakeAccess).set({ revokedAt: new Date() }).where(and(eq(intakeAccess.sessionId, id), eq(intakeAccess.lawFirmId, user.firm.id))); await tx.insert(activities).values({ lawFirmId: user.firm.id, clientId: session.clientId, kind: "intake", summary: "Private intake link revoked" }); return null; }
      if (session.status !== "in_progress" || session.clientId || !session.voiceConversationId || !session.config) throw new IntakeAccessError("Only an in-progress intake can receive a resume link.");
      const replacement = await issueIntakeToken(tx, user.firm.id, id);
      await tx.insert(activities).values({ lawFirmId: user.firm.id, clientId: session.clientId, kind: "intake", summary: "Private intake link replaced" });
      return replacement;
    });
  }
  return { authorize, resume, manage };
}
export const intakeAccessService = createIntakeAccessService();
