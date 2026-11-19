"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { intakeAccessService, IntakeAccessError, resumePath } from "@legalroute/backend/services/intake-access";
export type LinkState = { error?: string; path?: string; done?: string };
export async function manageIntakeLink(id: string, _prev: LinkState, form: FormData): Promise<LinkState> {
  const user = await requireUser(), operation = form.get("operation");
  if (operation !== "rotate" && operation !== "revoke") return { error: "Choose a link action." };
  try {
    const result = await intakeAccessService.manage(user, id, operation);
    revalidatePath(`/intakes/${id}`);
    return result ? { path: resumePath(user.firm.slug, result.token), done: "New private link created. All previous links for this intake are now invalid." } : { done: "All existing links for this intake have been revoked." };
  } catch (error) { return { error: error instanceof IntakeAccessError ? error.message : "The link could not be updated. Try again." }; }
}
