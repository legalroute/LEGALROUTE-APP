"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { Card, Field, buttonClass, inputClass } from "@/components/ui";
import { cancelAppointmentAction, saveAppointmentAction } from "./appointment-actions";

export type CalendarAppointment = {
  id: string; version: number; title: string; clientId: string | null; clientName: string | null;
  startsAt: string; endsAt: string; timeZone: string; location: string; notes: string;
  status: "scheduled" | "cancelled"; attendees: string[];
};
function localValue(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function dayKey(d: Date) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }

const subscribe = () => () => {};

export function AppointmentCalendar({ appointments, clients, defaultClientId }: {
  appointments: CalendarAppointment[]; clients: { id: string; name: string }[]; defaultClientId?: string;
}) {
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const [draftKey, setDraftKey] = useState(0);
  const [date, setDate] = useState(() => new Date());
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [editing, setEditing] = useState<CalendarAppointment | null>(null);
  const currentEditing = editing ? appointments.find((a) => a.id === editing.id) ?? null : null;
  const [showCancelled, setShowCancelled] = useState(false);
  if (!ready) return <Card className="mb-6 p-5">Loading your calendar…</Card>;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (view === "month") start.setDate(1);
  if (view === "week") start.setDate(start.getDate() - start.getDay());
  const count = view === "day" ? 1 : view === "week" ? 7 : new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: count }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  function move(direction: number) {
    const next = new Date(date);
    if (view === "month") { next.setDate(1); next.setMonth(next.getMonth() + direction); }
    else next.setDate(next.getDate() + direction * (view === "week" ? 7 : 1));
    setDate(next);
  }
  return <>
    <Card className="mb-6 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-semibold">Your appointments</h2><p className="text-sm text-slate-500">All times shown in {zone}. Attendees are recorded here; email invitations are not sent.</p></div>
        <button type="button" className={buttonClass.primary} onClick={() => { setEditing(null); setDraftKey((key) => key + 1); document.getElementById("appointment-editor")?.scrollIntoView({ behavior: "smooth" }); }}>New appointment</button>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button type="button" aria-label="Previous period" className={buttonClass.secondary} onClick={() => move(-1)}>←</button>
        <button type="button" className={buttonClass.secondary} onClick={() => setDate(new Date())}>Today</button>
        <button type="button" aria-label="Next period" className={buttonClass.secondary} onClick={() => move(1)}>→</button>
        <span className="mr-auto font-medium">{date.toLocaleDateString(undefined, { month: "long", year: "numeric", ...(view !== "month" ? { day: "numeric" } : {}) })}</span>
        <label className="sr-only" htmlFor="calendar-view">Calendar view</label>
        <select id="calendar-view" value={view} onChange={(e) => setView(e.target.value as typeof view)} className="rounded-lg border border-slate-200 p-2 text-sm"><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select>
        <label className="text-sm"><input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> Show cancelled</label>
      </div>
      <div className={`grid gap-2 ${view === "day" ? "" : "sm:grid-cols-7"}`}>
        {view === "month" && Array.from({ length: start.getDay() }, (_, i) => <div key={`blank-${i}`} className="hidden sm:block" />)}
        {days.map((day) => {
          const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
          const events = appointments.filter((a) => (showCancelled || a.status === "scheduled") && new Date(a.startsAt) < end && new Date(a.endsAt) > day);
          return <div key={dayKey(day)} className={`min-h-28 rounded-xl border p-2 ${dayKey(day) === dayKey(new Date()) ? "border-orange-300 bg-orange-50/30" : "border-slate-200"}`}>
            <h3 className="mb-2 text-sm font-medium">{day.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</h3>
            {events.length === 0 && <p className="text-xs text-slate-400">No appointments</p>}
            {events.map((a) => <button type="button" key={a.id} onClick={() => { setEditing(a); document.getElementById("appointment-editor")?.scrollIntoView({ behavior: "smooth" }); }} className={`mb-2 block w-full break-words rounded-lg p-2 text-left text-xs ${a.status === "cancelled" ? "bg-slate-100 text-slate-500 line-through" : "bg-orange-100 text-orange-950"}`}>
              <span className="block font-semibold">{a.title}</span>
              <span className="block">{new Date(a.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}–{new Date(a.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
              {a.clientName && <span className="block">{a.clientName}</span>}
              {a.status === "cancelled" && <span className="block">Cancelled</span>}
            </button>)}
          </div>;
        })}
      </div>
    </Card>
    <Card id="appointment-editor" className="mb-6 scroll-mt-6 p-5">
      <AppointmentEditor key={currentEditing ? `${currentEditing.id}-${currentEditing.version}` : `new-${draftKey}`} appointment={currentEditing} clients={clients} defaultClientId={defaultClientId} zone={zone} />
    </Card>
  </>;
}

function AppointmentEditor({ appointment: a, clients, defaultClientId, zone }: {
  appointment: CalendarAppointment | null; clients: { id: string; name: string }[]; defaultClientId?: string; zone: string;
}) {
  const [state, action, pending] = useActionState(saveAppointmentAction, {});
  const [cancelState, cancelAction, cancelling] = useActionState(cancelAppointmentAction, {});
  const [localError, setLocalError] = useState("");
  const cancelled = a?.status === "cancelled" || Boolean(cancelState.done);
  return <>
    <h2 className="mb-1 text-lg font-semibold">{a ? "Appointment details" : "New appointment"}</h2>
    <p className="mb-4 text-sm text-slate-500">Enter dates in {zone}.{a && a.timeZone !== zone ? ` Originally scheduled in ${a.timeZone}.` : ""}</p>
    <form action={action} onSubmit={(event) => {
      setLocalError("");
      const form = event.currentTarget;
      for (const name of ["startsAt", "endsAt"]) {
        const input = form.elements.namedItem(`${name}Local`) as HTMLInputElement;
        const parsed = new Date(input.value);
        if (!Number.isFinite(parsed.getTime()) || localValue(parsed.toISOString()) !== input.value) {
          event.preventDefault(); setLocalError("Choose a valid local time. That time may fall in a daylight-saving transition."); return;
        }
        (form.elements.namedItem(name) as HTMLInputElement).value = parsed.toISOString();
      }
    }} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="id" value={a?.id ?? ""} /><input type="hidden" name="version" value={a?.version ?? ""} />
      <input type="hidden" name="timeZone" value={zone} /><input type="hidden" name="startsAt" /><input type="hidden" name="endsAt" />
      <Field label="Title"><input name="title" required maxLength={200} defaultValue={a?.title ?? ""} className={inputClass} disabled={cancelled} /></Field>
      <Field label="Client (optional)"><select name="clientId" defaultValue={a?.clientId ?? (clients.some((c) => c.id === defaultClientId) ? defaultClientId : "")} className={inputClass} disabled={cancelled}><option value="">No client</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Starts" hint="If clocks repeat an hour, the first occurrence is used."><input name="startsAtLocal" type="datetime-local" required defaultValue={a ? localValue(a.startsAt) : ""} className={inputClass} disabled={cancelled} /></Field>
      <Field label="Ends"><input name="endsAtLocal" type="datetime-local" required defaultValue={a ? localValue(a.endsAt) : ""} className={inputClass} disabled={cancelled} /></Field>
      <Field label="Location or meeting link"><input name="location" maxLength={500} defaultValue={a?.location ?? ""} className={inputClass} disabled={cancelled} /></Field>
      <Field label="Attendee emails" hint="Separate emails with commas. No invitations are sent."><input name="attendees" defaultValue={a?.attendees.join(", ") ?? ""} className={inputClass} disabled={cancelled} /></Field>
      <div className="sm:col-span-2"><Field label="Notes"><textarea name="notes" maxLength={5000} defaultValue={a?.notes ?? ""} className={inputClass} disabled={cancelled} /></Field></div>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
        {!cancelled && <button className={buttonClass.primary} disabled={pending || cancelling}>{pending ? "Saving…" : a ? "Save changes" : "Schedule appointment"}</button>}
        <p role="status" className={state.error || localError ? "text-sm text-red-700" : "text-sm text-green-700"}>{localError || state.error || state.done}</p>
      </div>
    </form>
    {a && !cancelled && <form action={cancelAction} className="mt-4" onSubmit={(event) => { if (!window.confirm("Cancel this appointment?")) event.preventDefault(); }}>
      <input type="hidden" name="id" value={a.id} /><input type="hidden" name="version" value={a.version} />
      <button disabled={cancelling || pending} className={buttonClass.secondary}>{cancelling ? "Cancelling…" : "Cancel appointment"}</button>
    </form>}
    <p role="status" className={cancelState.error ? "mt-2 text-sm text-red-700" : "mt-2 text-sm text-green-700"}>{cancelState.error || cancelState.done || (cancelled ? "This appointment is cancelled." : "")}</p>
  </>;
}
