"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { calendarConnections, clients, db, tasks } from "@/db";
import { requireUser } from "@/lib/auth";
import { createGoogleEvent, getConnections } from "@/lib/calendar";
import { sendEmail } from "@/lib/email";
import { logActivity } from "@/lib/firm";

export async function disconnectCalendar(provider: "google" | "calendly") {
  const user = await requireUser();
  await db.delete(calendarConnections).where(and(eq(calendarConnections.userId, user.id), eq(calendarConnections.provider, provider)));
  await logActivity(user.firm.id, "calendar", `${provider === "google" ? "Google Calendar" : "Calendly"} disconnected`);
  revalidatePath("/calendar");
}

export type ScheduleState = { error?: string; done?: string; link?: string };

const scheduleSchema = z.object({
  clientId: z.string().uuid("Choose a client"),
  method: z.enum(["google", "calendly"]),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional(),
  minutes: z.coerce.number().int().min(15).max(240).default(30),
  timeZone: z.string().max(80).default("UTC"),
  note: z.string().max(2000).default(""),
});

// Books a consultation in the attorney's own calendar (Google) or emails their Calendly link.
export async function scheduleConsultation(_prev: ScheduleState, formData: FormData): Promise<ScheduleState> {
  const user = await requireUser();
  const parsed = scheduleSchema.safeParse({
    clientId: formData.get("clientId"),
    method: formData.get("method"),
    start: formData.get("start") || undefined,
    minutes: formData.get("minutes") || undefined,
    timeZone: formData.get("timeZone") || undefined,
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details and try again." };
  const d = parsed.data;
  const [client] = await db.select().from(clients).where(and(eq(clients.id, d.clientId), eq(clients.lawFirmId, user.firm.id)));
  if (!client) return { error: "Choose a client." };
  const conn = (await getConnections(user.id)).find((c) => c.provider === d.method);
  if (!conn) return { error: `Connect ${d.method === "google" ? "Google Calendar" : "Calendly"} first.` };

  if (d.method === "google") {
    if (!d.start) return { error: "Pick a date and time." };
    const end = addMinutes(d.start, d.minutes);
    try {
      const event = await createGoogleEvent(conn, {
        summary: `Consultation: ${client.name} — ${user.firm.name}`,
        description: [client.matterType && `Matter: ${client.matterType}`, d.note].filter(Boolean).join("\n\n"),
        start: `${d.start}:00`,
        end: `${end}:00`,
        timeZone: d.timeZone,
        attendeeEmail: client.email,
      });
      const when = new Date(`${d.start}:00`).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
      await logActivity(user.firm.id, "consultation", `Consultation scheduled — ${client.name}, ${when}`, client.id);
      revalidatePath(`/clients/${client.id}`);
      return {
        done: `Added to your Google Calendar${client.email ? ` and invited ${client.email}` : ""}.`,
        link: event.htmlLink,
      };
    } catch (e) {
      console.error("[calendar] Google event failed", e);
      return { error: e instanceof Error ? e.message : "Google Calendar couldn't create the event." };
    }
  }

  if (!conn.schedulingUrl) return { error: "Your Calendly account has no booking page. Reconnect Calendly." };
  if (!client.email) {
    await db.insert(tasks).values({ lawFirmId: user.firm.id, clientId: client.id, title: `Send Calendly link: ${conn.schedulingUrl}` });
    revalidatePath(`/clients/${client.id}`);
    return { done: `${client.name} has no email on file, so a task was added to send your booking link.`, link: conn.schedulingUrl };
  }
  const result = await sendEmail({
    to: client.email,
    subject: `Schedule your consultation with ${user.firm.name}`,
    text: `Hi ${client.name.split(" ")[0]},\n\nPlease choose a time for your consultation here:\n${conn.schedulingUrl}\n\n${d.note ? `${d.note}\n\n` : ""}Thank you,\n${user.name ?? user.firm.name}\n${user.firm.name}`,
  });
  await logActivity(user.firm.id, "consultation", `Booking link sent to ${client.name}`, client.id);
  revalidatePath(`/clients/${client.id}`);
  return {
    done: result.delivered ? `Booking link emailed to ${client.email}.` : `Email isn't configured, so the booking link was logged on the server instead of sent.`,
    link: conn.schedulingUrl,
  };
}

function addMinutes(localDateTime: string, minutes: number) {
  // Works on the wall-clock value; the time zone travels separately to Google.
  const [date, time] = localDateTime.split("T");
  const [y, m, day] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  const t = new Date(Date.UTC(y, m - 1, day, h, min + minutes));
  return t.toISOString().slice(0, 16);
}
