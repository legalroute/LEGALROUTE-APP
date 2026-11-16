"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { conflictService, ConflictError } from "@legalroute/backend/services/conflicts/service";
export type ConflictState = { error?: string; done?: string };
const message = (e: unknown) => e instanceof ConflictError ? e.message : "Check the required fields, column mapping and input limits.";
export async function runConflict(_prev: ConflictState, form: FormData): Promise<ConflictState> {
  const user = await requireUser(); let id: string;
  try {
    const opponents = String(form.get("opponents") || "").split("\n").map((s) => s.trim()).filter(Boolean);
    id = await conflictService.run(user, { intakeId: form.get("intakeId") || undefined, subjects: [{ name: String(form.get("client") || ""), role: "client", email: String(form.get("email") || "") }, ...opponents.map((name) => ({ name, role: "opposing" }))], opposingComplete: form.get("complete") === "on" });
  } catch (e) { return { error: message(e) }; }
  revalidatePath("/conflicts"); redirect(`/conflicts?check=${id}`);
}
export async function configureConflict(_prev: ConflictState, form: FormData): Promise<ConflictState> {
  const user = await requireUser();
  try {
    const mapping = Object.fromEntries(["name", "role", "aliases", "matter", "attorney", "status", "email"].map((k) => [k, String(form.get(k) || "")]).filter(([, v]) => v));
    await conflictService.configure(user, String(form.get("dataset") || ""), mapping);
  } catch (e) { return { error: message(e) }; }
  revalidatePath("/conflicts"); return { done: "Source mapping saved. Existing clearances must be rechecked if source content or mapping changes." };
}
export async function reviewConflict(id: string, _prev: ConflictState, form: FormData): Promise<ConflictState> {
  const user = await requireUser();
  try { await conflictService.review(user, id, { decision: form.get("decision"), notes: form.get("notes") }); }
  catch (e) { return { error: message(e) }; }
  revalidatePath("/conflicts"); revalidatePath("/intakes"); return { done: "Attorney decision recorded. Intake approval revalidates sources and intake details." };
}
