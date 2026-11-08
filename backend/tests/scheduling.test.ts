import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../src/db/schema";
import type { CurrentUser } from "../src/services/auth";
import { PGlite } from "@electric-sql/pglite";
import { appointmentInput } from "../src/services/scheduling/validation";

const valid = {
  title: "Consultation", startsAt: "2026-11-09T09:00:00-08:00", endsAt: "2026-11-09T09:30:00-08:00",
  timeZone: "America/Los_Angeles", location: "Office", notes: "", attendees: ["CLIENT@example.com"],
};

test("validates absolute times, IANA zones, and attendee addresses", () => {
  const parsed = appointmentInput.parse(valid);
  assert.equal(parsed.attendees[0], "client@example.com");
  assert.equal(new Date(parsed.startsAt).toISOString(), "2026-11-09T17:00:00.000Z");
  for (const invalid of [
    { endsAt: valid.startsAt }, { endsAt: "2026-11-09T08:00:00-08:00" },
    { startsAt: "2026-11-09T09:00" }, { timeZone: "Not/AZone" }, { timeZone: "" },
    { title: "   " }, { attendees: ["bad-address"] }, { attendees: Array(51).fill("a@example.com") },
    { clientId: "not-a-uuid" }, { id: randomUUID() },
  ]) assert.equal(appointmentInput.safeParse({ ...valid, ...invalid }).success, false, JSON.stringify(invalid));
});

test("migration preserves existing clients and enforces appointment ownership and time constraints", async () => {
  const db = await PGlite.create();
  try {
    const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
    const entries = journal.entries as { idx: number; tag: string }[];
    for (const entry of entries.filter((e) => e.idx < 6)) {
      await db.exec(await readFile(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
    }
    const firm = randomUUID(), otherFirm = randomUUID(), user = randomUUID(), otherUser = randomUUID(), client = randomUUID(), otherClient = randomUUID();
    await db.query("INSERT INTO law_firms (id,name,slug) VALUES ($1,'Firm A','firm-a'),($2,'Firm B','firm-b')", [firm, otherFirm]);
    await db.query("INSERT INTO users (id,email,law_firm_id) VALUES ($1,'a@example.com',$2),($3,'b@example.com',$4)", [user, firm, otherUser, otherFirm]);
    await db.query("INSERT INTO clients (id,name,law_firm_id) VALUES ($1,'Client A',$2),($3,'Client B',$4)", [client, firm, otherClient, otherFirm]);
    await db.exec(await readFile(new URL("../drizzle/0006_native_appointments.sql", import.meta.url), "utf8"));
    const existing = await db.query("SELECT id FROM clients WHERE id = $1", [client]);
    assert.equal(existing.rows.length, 1);
    const insert = (owner: string, linkedClient: string | null, start = valid.startsAt, end = valid.endsAt) => db.query<{ id: string }>(
      "INSERT INTO appointments (law_firm_id,organizer_id,client_id,title,starts_at,ends_at,time_zone) VALUES ($1,$2,$3,'Consultation',$4,$5,$6) RETURNING id",
      [firm, owner, linkedClient, start, end, valid.timeZone],
    );
    await assert.rejects(insert(otherUser, client), /foreign key/);
    await assert.rejects(insert(user, otherClient), /foreign key/);
    await assert.rejects(insert(user, client, valid.startsAt, valid.startsAt), /check constraint/);
    const { rows: [appointment] } = await insert(user, client);
    await insert(user, null, "2026-11-09T09:30:00-08:00", "2026-11-09T10:00:00-08:00");
    const conflicts = async (start: string, end: string) => (await db.query(
      "SELECT id FROM appointments WHERE organizer_id=$1 AND status='scheduled' AND starts_at < $3::timestamptz AND ends_at > $2::timestamptz", [user, start, end],
    )).rows;
    assert.equal((await conflicts("2026-11-09T09:15:00-08:00", "2026-11-09T09:20:00-08:00")).length, 1);
    assert.equal((await conflicts("2026-11-09T08:30:00-08:00", valid.startsAt)).length, 0);
    assert.equal((await conflicts("2026-11-09T09:00:00-08:00", "2026-11-09T10:00:00-08:00")).length, 2);
    await db.query("UPDATE appointments SET status='cancelled' WHERE id=$1", [appointment.id]);
    assert.equal((await conflicts(valid.startsAt, valid.endsAt)).length, 0);
    await db.query("INSERT INTO appointment_attendees (appointment_id,email) VALUES ($1,'client@example.com')", [appointment.id]);
    await assert.rejects(db.query("INSERT INTO appointment_attendees (appointment_id,email) VALUES ($1,'client@example.com')", [appointment.id]), /unique constraint/);
    await db.query("DELETE FROM appointments WHERE id=$1", [appointment.id]);
    assert.equal((await db.query("SELECT * FROM appointment_attendees")).rows.length, 0);
  } finally { await db.close(); }
});


test("scheduling service rejects conflicts, stale edits, and cross-firm/other-owner mutations", async () => {
  // Import server-only modules under the react-server condition; no app DB is contacted.
  process.env.DATABASE_URL ??= "postgres://localhost/unused_scheduling_test";
  const { saveAppointment, cancelAppointment } = await import("../src/services/scheduling/service");
  const pg = await PGlite.create();
  try {
    const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
    for (const entry of journal.entries as { tag: string }[]) {
      await pg.exec(await readFile(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
    }
    const firm = randomUUID(), otherFirm = randomUUID(), userId = randomUUID(), colleagueId = randomUUID(), otherClient = randomUUID();
    await pg.query("INSERT INTO law_firms (id,name,slug) VALUES ($1,'A','a'),($2,'B','b')", [firm, otherFirm]);
    await pg.query("INSERT INTO users (id,email,law_firm_id) VALUES ($1,'owner@example.com',$2),($3,'colleague@example.com',$2)", [userId, firm, colleagueId]);
    await pg.query("INSERT INTO clients (id,name,law_firm_id) VALUES ($1,'Foreign client',$2)", [otherClient, otherFirm]);
    const database = drizzle(pg, { schema }) as unknown as Parameters<typeof saveAppointment>[2];
    const user = { id: userId, firm: { id: firm } } as CurrentUser;
    const colleague = { id: colleagueId, firm: { id: firm } } as CurrentUser;
    const id = await saveAppointment(user, valid, database);
    await assert.rejects(saveAppointment(user, valid, database), /overlaps/);
    await assert.rejects(saveAppointment(colleague, { ...valid, id, version: 1 }, database), /unavailable/);
    await assert.rejects(saveAppointment(user, { ...valid, clientId: otherClient }, database), /your firm/);
    await saveAppointment(user, { ...valid, id, version: 1, title: "Rescheduled consultation" }, database);
    await assert.rejects(saveAppointment(user, { ...valid, id, version: 1 }, database), /changed/);
    await assert.rejects(cancelAppointment(colleague, id, 2, database), /unavailable/);
    await assert.rejects(cancelAppointment(user, id, 1, database), /changed/);
    await cancelAppointment(user, id, 2, database);
    await saveAppointment(user, valid, database); // Cancelled slot is available again.
    const { rows: attendees } = await pg.query("SELECT * FROM appointment_attendees");
    assert.equal(attendees.length, 2); // Cancelled appointment retains its attendee.
    const { rows: activity } = await pg.query("SELECT * FROM activities WHERE kind='appointment'");
    assert.equal(activity.length, 4); // Failed writes do not log successful changes.
  } finally { await pg.close(); }
});
