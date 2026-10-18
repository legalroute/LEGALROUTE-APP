"use client";

import { useActionState } from "react";
import { Field, buttonClass, inputClass } from "@/components/ui";
import { createClient, type ClientFormState } from "./actions";

export function NewClientForm() {
  const [state, action, pending] = useActionState<ClientFormState, FormData>(createClient, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label="Full name">
        <input name="name" required className={inputClass} />
      </Field>
      <Field label="Email">
        <input name="email" type="email" className={inputClass} />
      </Field>
      <Field label="Phone">
        <input name="phone" type="tel" className={inputClass} />
      </Field>
      <Field label="Matter type">
        <input name="matterType" placeholder="e.g. Personal Injury" className={inputClass} />
      </Field>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className={buttonClass.dark}>
        {pending ? "Adding…" : "Add client"}
      </button>
    </form>
  );
}
