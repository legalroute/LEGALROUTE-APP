"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { db, lawFirms, type FirmSettings } from "@/db";
import { requireUser } from "@/lib/auth";
import { isTheme, THEME_COOKIE } from "@/lib/theme";

export type SettingsState = { error?: string; ok?: boolean };

const RESERVED_SLUGS = new Set(["admin", "api", "login", "intake", "settings", "voice", "home", "new"]);
const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Use at least 3 characters")
  .max(60, "Use at most 60 characters")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens");

function done() {
  revalidatePath("/firm-settings");
  revalidatePath("/", "layout");
  return { ok: true };
}

async function mergeSettings(firmId: string, current: FirmSettings, patch: Partial<FirmSettings>) {
  await db.update(lawFirms).set({ settings: { ...current, ...patch } }).where(eq(lawFirms.id, firmId));
}

export async function saveFirmProfile(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Enter your firm's name").max(200),
      email: z.union([z.literal(""), z.email("Enter a valid email")]),
      phone: z.string().trim().max(50),
      website: z.union([z.literal(""), z.url("Enter a full URL, e.g. https://yourfirm.com")]),
      practiceAreas: z.array(z.string().trim().min(1).max(80)).max(30),
    })
    .safeParse({
      name: formData.get("name"),
      email: String(formData.get("email") ?? "").trim(),
      phone: formData.get("phone") ?? "",
      website: String(formData.get("website") ?? "").trim(),
      practiceAreas: String(formData.get("practiceAreas") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  await db
    .update(lawFirms)
    .set({ name: d.name, email: d.email || null, phone: d.phone || null, website: d.website || null, practiceAreas: [...new Set(d.practiceAreas)] })
    .where(eq(lawFirms.id, user.firm.id));
  return done();
}

export async function checkSlug(raw: string): Promise<{ available: boolean; message: string }> {
  const user = await requireUser();
  const parsed = slugSchema.safeParse(raw);
  if (!parsed.success) return { available: false, message: parsed.error.issues[0]?.message ?? "Invalid link" };
  if (RESERVED_SLUGS.has(parsed.data)) return { available: false, message: "That link is reserved" };
  const [taken] = await db.select({ id: lawFirms.id }).from(lawFirms).where(and(eq(lawFirms.slug, parsed.data), ne(lawFirms.id, user.firm.id)));
  return taken ? { available: false, message: "Already taken" } : { available: true, message: "Available" };
}

export async function saveIntakeLink(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "");
  const check = await checkSlug(slug);
  if (!check.available) return { error: check.message };
  await db.update(lawFirms).set({ slug: slugSchema.parse(slug) }).where(eq(lawFirms.id, user.firm.id));
  return done();
}

export async function saveClientExperience(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireUser();
  await mergeSettings(user.firm.id, user.firm.settings, {
    showProgress: formData.get("showProgress") === "on",
    collectEmailAtStart: formData.get("collectEmailAtStart") === "on",
    requireESignature: formData.get("requireESignature") === "on",
    showThankYou: formData.get("showThankYou") === "on",
  });
  return done();
}

export async function saveAppearance(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const welcome = String(formData.get("welcomeMessage") ?? "").trim().slice(0, 600);
  const thankYou = String(formData.get("thankYouMessage") ?? "").trim().slice(0, 600);
  const theme = formData.get("theme");
  if (!isTheme(theme)) return { error: "Choose a theme" };
  await mergeSettings(user.firm.id, user.firm.settings, { theme, welcomeMessage: welcome || undefined, thankYouMessage: thankYou || undefined });
  // Remember it in this browser too, so the sign-in pages (which have no firm yet) match.
  (await cookies()).set(THEME_COOKIE, theme, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return done();
}

export async function saveNotifications(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const email = String(formData.get("notificationEmail") ?? "").trim();
  if (email && !z.email().safeParse(email).success) return { error: "Enter a valid email" };
  await mergeSettings(user.firm.id, user.firm.settings, { notifyOnIntake: formData.get("notifyOnIntake") === "on", notificationEmail: email || undefined });
  return done();
}
