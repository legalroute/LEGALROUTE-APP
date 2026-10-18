"use client";

import { useActionState } from "react";
import { Field, buttonClass, inputClass } from "@/components/ui";
import { updateClient, type ClientFormState } from "../actions";

type ClientDto = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  matterType: string | null;
  status: string;
  notes: string | null;
};

export function OverviewForm({ client }: { client: ClientDto }) {
  const [state, action, pending] = useActionState<ClientFormState, FormData>(updateClient.bind(null, client.id), {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Full name">
        <input name="name" required defaultValue={client.name} className={inputClass} />
      </Field>
      <Field label="Status">
        <select name="status" defaultValue={client.status} className={inputClass}>
          <option value="lead">Lead</option>
          <option value="qualified">Qualified</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
        </select>
      </Field>
      <Field label="Email">
        <input name="email" type="email" defaultValue={client.email ?? ""} className={inputClass} />
      </Field>
      <Field label="Phone">
        <input name="phone" type="tel" defaultValue={client.phone ?? ""} className={inputClass} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Matter type">
          <input name="matterType" defaultValue={client.matterType ?? ""} className={inputClass} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Notes">
          <textarea name="notes" rows={5} defaultValue={client.notes ?? ""} className={inputClass} />
        </Field>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={buttonClass.dark}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state.ok && !pending && <p className="text-sm text-green-700">Saved.</p>}
      </div>
    </form>
  );
}
