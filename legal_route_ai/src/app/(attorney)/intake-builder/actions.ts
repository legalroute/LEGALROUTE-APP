"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, intakeTemplates, lawFirms, type IntakeConfig } from "@/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/firm";
import { normalizeConfig, editableConfigSchema, STARTER_PERSONAL_INJURY } from "@/lib/intake-config";
import { LlmError } from "@/lib/llm/types";
import { builderTurn } from "@/lib/maya/builder";
import { loadChat, saveChatMessage, toChatDto, toTurns, type ChatMessageDto } from "@/lib/maya/history";
import { getSettings } from "@/lib/settings";

async function loadTemplate(user: CurrentUser, templateId: string) {
  const [template] = await db
    .select()
    .from(intakeTemplates)
    .where(and(eq(intakeTemplates.id, templateId), eq(intakeTemplates.lawFirmId, user.firm.id)));
  return template ?? null;
}

const BLANK: IntakeConfig = {
  sections: [
    {
      id: "client_information",
      title: "Client Information",
      questions: [
        { id: "full_name", text: "What is your full name?" },
        { id: "phone", text: "What is the best phone number to reach you?" },
        { id: "email", text: "What is your email address?" },
      ],
    },
  ],
};

export type NewTemplateState = { error?: string };

export async function createTemplate(_prev: NewTemplateState, formData: FormData): Promise<NewTemplateState> {
  const user = await requireUser();
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Give the intake a name").max(120),
      practiceArea: z.string().trim().max(120),
      start: z.enum(["starter", "blank"]),
    })
    .safeParse({ name: formData.get("name"), practiceArea: formData.get("practiceArea") ?? "", start: formData.get("start") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const config = parsed.data.start === "starter" ? STARTER_PERSONAL_INJURY : BLANK;
  const [template] = await db
    .insert(intakeTemplates)
    .values({ lawFirmId: user.firm.id, name: parsed.data.name, practiceArea: parsed.data.practiceArea || null, config })
    .returning();
  await logActivity(user.firm.id, "template", `Intake template created — ${template.name}`);
  redirect(`/intake-builder/${template.id}`);
}

export type BuilderSendResult = {
  reply?: ChatMessageDto;
  userMessage?: ChatMessageDto;
  error?: string;
  config?: IntakeConfig;
  changed?: boolean;
};

export async function sendBuilderMessage(templateId: string, text: string): Promise<BuilderSendResult> {
  const user = await requireUser();
  const template = await loadTemplate(user, templateId);
  if (!template) return { error: "This intake template no longer exists." };
  const message = text.trim().slice(0, 4000);
  if (!message) return { error: "Type a message for Maya." };

  const userMessage = await saveChatMessage({ firmId: user.firm.id, userId: user.id, scope: "template", scopeId: template.id, role: "user", text: message });
  const history = toTurns(await loadChat(user.firm.id, "template", template.id, 20));

  try {
    const result = await builderTurn({
      templateName: template.name,
      practiceArea: template.practiceArea,
      config: template.config,
      history,
      settings: await getSettings(),
    });
    if (result.changed) await db.update(intakeTemplates).set({ config: result.config }).where(eq(intakeTemplates.id, template.id));
    const reply = await saveChatMessage({ firmId: user.firm.id, userId: null, scope: "template", scopeId: template.id, role: "assistant", text: result.reply });
    revalidatePath(`/intake-builder/${template.id}`);
    return { userMessage: toChatDto(userMessage), reply: toChatDto(reply), config: result.config, changed: result.changed };
  } catch (e) {
    console.error("[builder] Maya error", e);
    return { userMessage: toChatDto(userMessage), error: e instanceof LlmError ? e.message : "Maya couldn't update the intake. Please try again." };
  }
}

// Direct edits from the preview panel (rename, add, remove, reorder).
export async function saveTemplateConfig(templateId: string, config: IntakeConfig): Promise<{ error?: string; config?: IntakeConfig }> {
  const user = await requireUser();
  const template = await loadTemplate(user, templateId);
  if (!template) return { error: "This intake template no longer exists." };
  const parsed = editableConfigSchema.safeParse(config);
  if (!parsed.success) return { error: "That change couldn't be saved." };
  const normalized = normalizeConfig(parsed.data);
  await db.update(intakeTemplates).set({ config: normalized }).where(eq(intakeTemplates.id, template.id));
  revalidatePath(`/intake-builder/${template.id}`);
  return { config: normalized };
}

export async function renameTemplate(templateId: string, formData: FormData) {
  const user = await requireUser();
  const template = await loadTemplate(user, templateId);
  if (!template) return;
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const practiceArea = String(formData.get("practiceArea") ?? "").trim().slice(0, 120);
  if (!name) return;
  await db.update(intakeTemplates).set({ name, practiceArea: practiceArea || null }).where(eq(intakeTemplates.id, template.id));
  revalidatePath(`/intake-builder/${template.id}`);
  revalidatePath("/intake-builder");
}

export async function publishTemplate(templateId: string) {
  const user = await requireUser();
  const template = await loadTemplate(user, templateId);
  if (!template) return { error: "This intake template no longer exists." };
  const checked = editableConfigSchema.safeParse(template.config);
  if (!checked.success) return { error: checked.error.issues[0]?.message ?? "Check your questions." };
  if (!template.config.sections.some((s) => s.questions.length)) return { error: "Add at least one question before publishing." };
  await db.update(intakeTemplates).set({ publishedConfig: template.config, publishedAt: new Date() }).where(eq(intakeTemplates.id, template.id));
  if (!user.firm.defaultTemplateId) await db.update(lawFirms).set({ defaultTemplateId: template.id }).where(eq(lawFirms.id, user.firm.id));
  await logActivity(user.firm.id, "template", `Intake published — ${template.name}`);
  revalidatePath(`/intake-builder/${template.id}`);
  revalidatePath("/intake-builder");
  return {};
}

export async function setDefaultTemplate(templateId: string) {
  const user = await requireUser();
  const template = await loadTemplate(user, templateId);
  if (!template?.publishedConfig) return;
  await db.update(lawFirms).set({ defaultTemplateId: template.id }).where(eq(lawFirms.id, user.firm.id));
  await logActivity(user.firm.id, "template", `Intake link now uses ${template.name}`);
  revalidatePath("/intake-builder");
}

export async function deleteTemplate(templateId: string) {
  const user = await requireUser();
  const template = await loadTemplate(user, templateId);
  if (!template) redirect("/intake-builder");
  if (user.firm.defaultTemplateId === template.id) {
    await db.update(lawFirms).set({ defaultTemplateId: null }).where(eq(lawFirms.id, user.firm.id));
  }
  await db.delete(intakeTemplates).where(eq(intakeTemplates.id, template.id));
  await logActivity(user.firm.id, "template", `Intake template deleted — ${template.name}`);
  redirect("/intake-builder");
}
