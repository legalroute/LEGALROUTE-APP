"use client";

import { useActionState } from "react";
import { Field, buttonClass, inputClass } from "@/components/ui";
import { createTemplate, type NewTemplateState } from "./actions";

export function NewTemplateForm() {
  const [state, action, pending] = useActionState<NewTemplateState, FormData>(createTemplate, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label="Name">
        <input name="name" required placeholder="e.g. Employment Intake" className={inputClass} />
      </Field>
      <Field label="Practice area">
        <input name="practiceArea" placeholder="e.g. Employment" className={inputClass} />
      </Field>
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 font-medium text-slate-700">Start from</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="start" value="starter" defaultChecked className="accent-orange-600" /> Personal injury starter
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="start" value="blank" className="accent-orange-600" /> Blank (contact details only)
        </label>
      </fieldset>
      {state.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClass.dark}>
        {pending ? "Creating…" : "Create intake"}
      </button>
    </form>
  );
}
