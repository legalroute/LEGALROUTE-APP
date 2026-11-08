"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { cancelAppointment, saveAppointment, SchedulingError } from "@/lib/scheduling/service";

export type AppointmentState = { error?: string; done?: string };
export async function saveAppointmentAction(_previous: AppointmentState, form: FormData): Promise<AppointmentState> {
  const user = await requireUser();
  try {
    await saveAppointment(user, {
      id: form.get("id") || undefined, version: form.get("version") || undefined,
      title: form.get("title"), clientId: form.get("clientId") || undefined,
      startsAt: form.get("startsAt"), endsAt: form.get("endsAt"), timeZone: form.get("timeZone"),
      location: form.get("location"), notes: form.get("notes"),
      attendees: String(form.get("attendees") ?? "").split(/[,\n]/).map((v) => v.trim()).filter(Boolean),
    });
    revalidatePath("/calendar");
    return { done: "Appointment saved." };
  } catch (error) {
    if (error instanceof SchedulingError) return { error: error.message };
    console.error("[scheduling] Save failed", error);
    return { error: "Couldn't save the appointment. Please try again." };
  }
}
export async function cancelAppointmentAction(_previous: AppointmentState, form: FormData): Promise<AppointmentState> {
  const user = await requireUser();
  const parsed = z.object({ id: z.string().uuid(), version: z.coerce.number().int().positive() }).safeParse({ id: form.get("id"), version: form.get("version") });
  if (!parsed.success) return { error: "Invalid appointment." };
  try {
    await cancelAppointment(user, parsed.data.id, parsed.data.version);
    revalidatePath("/calendar");
    return { done: "Appointment cancelled." };
  } catch (error) {
    if (error instanceof SchedulingError) return { error: error.message };
    console.error("[scheduling] Cancellation failed", error);
    return { error: "Couldn't cancel the appointment. Please try again." };
  }
}
