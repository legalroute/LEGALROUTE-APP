import { and, eq, gt, lt, ne, sql } from "drizzle-orm";
import { activities, appointmentAttendees, appointments, clients, db } from "../../db/index.ts";
import type { CurrentUser } from "../auth.ts";
import { appointmentInput } from "./validation.ts";

export class SchedulingError extends Error {}

// Serializes all scheduling writes for an organizer, including concurrent bookings.
// External sync jobs must use this same service/lock when introduced.
export async function saveAppointment(user: CurrentUser, input: unknown, database: Pick<typeof db, "transaction"> = db) {
  const parsed = appointmentInput.safeParse(input);
  if (!parsed.success) throw new SchedulingError(parsed.error.issues[0]?.message ?? "Check appointment details.");
  const d = parsed.data;
  return database.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${user.id}, 0))`);
    if (d.clientId) {
      const [client] = await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.id, d.clientId), eq(clients.lawFirmId, user.firm.id)));
      if (!client) throw new SchedulingError("Choose a client from your firm.");
    }
    if (d.id) {
      const [existing] = await tx.select().from(appointments).where(and(eq(appointments.id, d.id), eq(appointments.organizerId, user.id), eq(appointments.lawFirmId, user.firm.id)));
      if (!existing || existing.status !== "scheduled") throw new SchedulingError("This appointment is unavailable.");
      if (existing.version !== d.version) throw new SchedulingError("This appointment changed. Reload before editing.");
    }
    const startsAt = new Date(d.startsAt), endsAt = new Date(d.endsAt);
    const [conflict] = await tx.select({ id: appointments.id }).from(appointments).where(and(
      eq(appointments.organizerId, user.id), eq(appointments.lawFirmId, user.firm.id),
      eq(appointments.status, "scheduled"), lt(appointments.startsAt, endsAt), gt(appointments.endsAt, startsAt),
      d.id ? ne(appointments.id, d.id) : undefined,
    )).limit(1);
    if (conflict) throw new SchedulingError("This time overlaps another appointment. Choose a different time.");
    const values = { title: d.title, clientId: d.clientId ?? null, startsAt, endsAt, timeZone: d.timeZone, location: d.location, notes: d.notes, updatedAt: new Date() };
    const [appointment] = d.id
      ? await tx.update(appointments).set({ ...values, version: sql`${appointments.version} + 1` }).where(and(eq(appointments.id, d.id), eq(appointments.organizerId, user.id), eq(appointments.lawFirmId, user.firm.id))).returning()
      : await tx.insert(appointments).values({ ...values, organizerId: user.id, lawFirmId: user.firm.id }).returning();
    await tx.delete(appointmentAttendees).where(eq(appointmentAttendees.appointmentId, appointment.id));
    const emails = [...new Set(d.attendees)];
    if (emails.length) await tx.insert(appointmentAttendees).values(emails.map((email) => ({ appointmentId: appointment.id, email })));
    await tx.insert(activities).values({ lawFirmId: user.firm.id, clientId: d.clientId ?? null, kind: "appointment", summary: `${d.id ? "Updated" : "Scheduled"} appointment — ${d.title}` });
    return appointment.id;
  });
}

export async function cancelAppointment(user: CurrentUser, id: string, version: number, database: Pick<typeof db, "transaction"> = db) {
  return database.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${user.id}, 0))`);
    const [row] = await tx.update(appointments).set({ status: "cancelled", updatedAt: new Date(), version: sql`${appointments.version} + 1` })
      .where(and(eq(appointments.id, id), eq(appointments.organizerId, user.id), eq(appointments.lawFirmId, user.firm.id), eq(appointments.status, "scheduled"), eq(appointments.version, version))).returning();
    if (!row) throw new SchedulingError("This appointment changed or is unavailable. Reload the calendar.");
    await tx.insert(activities).values({ lawFirmId: user.firm.id, clientId: row.clientId, kind: "appointment", summary: `Cancelled appointment — ${row.title}` });
  });
}
