"use client";

import { useActionState, useState } from "react";
import { Field, buttonClass, inputClass } from "@/components/ui";
import { scheduleConsultation, type ScheduleState } from "./actions";

export function ScheduleForm({
  clients,
  defaultClientId,
  methods,
}: {
  clients: { id: string; name: string }[];
  defaultClientId?: string;
  methods: ("google" | "calendly")[];
}) {
  const [state, action, pending] = useActionState<ScheduleState, FormData>(scheduleConsultation, {});
  const [method, setMethod] = useState(methods[0]);

  if (clients.length === 0) return <p className="text-sm text-slate-500">Add a client first.</p>;

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {/* Filled in the browser, so the server render doesn't guess the attorney's time zone. */}
      <input
        type="hidden"
        name="timeZone"
        ref={(el) => {
          if (el) el.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
        }}
      />
      <Field label="Client">
        <select name="clientId" defaultValue={clients.some((c) => c.id === defaultClientId) ? defaultClientId : ""} required className={inputClass}>
          <option value="" disabled>
            Choose a client…
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="How">
        <select name="method" value={method} onChange={(e) => setMethod(e.target.value as "google" | "calendly")} className={inputClass}>
          {methods.includes("google") && <option value="google">Book in Google Calendar</option>}
          {methods.includes("calendly") && <option value="calendly">Email my Calendly link</option>}
        </select>
      </Field>
      {method === "google" && (
        <>
          <Field label="Date and time" hint="In your computer's time zone">
            <input name="start" type="datetime-local" required className={inputClass} />
          </Field>
          <Field label="Length">
            <select name="minutes" defaultValue="30" className={inputClass}>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">1 hour</option>
            </select>
          </Field>
        </>
      )}
      <div className="sm:col-span-2">
        <Field label={method === "google" ? "Notes for the invite (optional)" : "Message (optional)"}>
          <textarea name="note" rows={3} className={inputClass} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={buttonClass.primary}>
          {pending ? "Scheduling…" : method === "google" ? "Book consultation" : "Send booking link"}
        </button>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state.done && (
          <p className="text-sm text-green-700">
            {state.done}{" "}
            {state.link && (
              <a href={state.link} target="_blank" rel="noreferrer" className="underline">
                Open
              </a>
            )}
          </p>
        )}
      </div>
    </form>
  );
}
