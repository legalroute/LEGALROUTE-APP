import "server-only";
import { and, eq } from "drizzle-orm";
import { db, intakeTemplates, lawFirms } from "@/db";

// Resolves which published intake a public link serves: ?t=<templateId>, else the firm's default.
export async function resolvePublicIntake(slug: string, templateId?: string | null) {
  const [firm] = await db.select().from(lawFirms).where(eq(lawFirms.slug, slug));
  if (!firm) return null;
  const id = templateId || firm.defaultTemplateId;
  if (!id) return { firm, template: null };
  const [template] = await db
    .select()
    .from(intakeTemplates)
    .where(and(eq(intakeTemplates.id, id), eq(intakeTemplates.lawFirmId, firm.id)));
  if (!template?.publishedConfig) return { firm, template: null };
  return { firm, template: { ...template, publishedConfig: template.publishedConfig } };
}
