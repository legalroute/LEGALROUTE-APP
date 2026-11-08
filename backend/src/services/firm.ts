import { eq, like, sql } from "drizzle-orm";
import { activities, db, intakeSessions, intakeTemplates, lawFirms, voiceConversations, type LawFirm } from "../db/index.ts";
import { STARTER_PERSONAL_INJURY, slugify } from "./intake-config.ts";

export async function uniqueFirmSlug(name: string, exceptFirmId?: string) {
  const base = slugify(name).replace(/_/g, "-");
  const rows = await db.select({ id: lawFirms.id, slug: lawFirms.slug }).from(lawFirms).where(like(lawFirms.slug, `${base}%`));
  const taken = new Set(rows.filter((r) => r.id !== exceptFirmId).map((r) => r.slug));
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  return slug;
}

export async function logActivity(firmId: string, kind: string, summary: string, clientId?: string | null) {
  await db.insert(activities).values({ lawFirmId: firmId, kind, summary, clientId: clientId ?? null });
}

// A firm with no templates gets the starter personal-injury intake, published, as its intake link default.
export async function ensureStarterTemplate(firm: LawFirm) {
  const [existing] = await db.select({ id: intakeTemplates.id }).from(intakeTemplates).where(eq(intakeTemplates.lawFirmId, firm.id)).limit(1);
  if (existing) return;
  const [template] = await db
    .insert(intakeTemplates)
    .values({
      lawFirmId: firm.id,
      name: "Personal Injury Intake",
      practiceArea: "Personal Injury",
      config: STARTER_PERSONAL_INJURY,
      publishedConfig: STARTER_PERSONAL_INJURY,
      publishedAt: new Date(),
    })
    .returning();
  if (!firm.defaultTemplateId) await db.update(lawFirms).set({ defaultTemplateId: template.id }).where(eq(lawFirms.id, firm.id));
}

// The original /voice page writes only voice_conversations. Mirror new ones into intake_sessions for the
// firm that owns them, and keep their status in step, without changing /voice itself.
export async function syncLegacyVoiceIntakes(firm: LawFirm) {
  if (!firm.ownsLegacyVoice) return;
  await db.execute(sql`
    insert into ${intakeSessions} (law_firm_id, voice_conversation_id, client_name, matter_type, status, ended_early, submitted_at, created_at)
    select ${firm.id}, v.id, v.client_name, 'Personal Injury',
      (case when v.completed_at is not null then 'pending_review' else 'in_progress' end)::intake_status,
      coalesce(v.end_reason = 'client_ended', false), v.completed_at, v.created_at
    from ${voiceConversations} v
    where not exists (select 1 from ${intakeSessions} s where s.voice_conversation_id = v.id)
  `);
  // Conversations that finished after they were mirrored: move them to review.
  await db.execute(sql`
    update ${intakeSessions} s
    set status = 'pending_review', submitted_at = v.completed_at, client_name = coalesce(s.client_name, v.client_name),
        ended_early = coalesce(v.end_reason = 'client_ended', false)
    from ${voiceConversations} v
    where s.voice_conversation_id = v.id and s.law_firm_id = ${firm.id}
      and s.status = 'in_progress' and s.template_id is null and v.completed_at is not null
  `);
}

// Runs on every attorney page load; both steps are cheap no-ops once done.
export async function prepareFirm(firm: LawFirm) {
  await ensureStarterTemplate(firm);
  await syncLegacyVoiceIntakes(firm);
}
