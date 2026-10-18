"use client";

import { useActionState } from "react";
import type { ResolvedSettings } from "@/lib/settings";
import { SILENCE_MS_RANGE } from "@/lib/voice-types";
import { updateSettings, type SaveSettingsState } from "./actions";

const initialState: SaveSettingsState = {};

export function SettingsForm({ settings, keys }: { settings: ResolvedSettings; keys: Record<string, boolean> }) {
  const [state, formAction, pending] = useActionState(updateSettings, initialState);

  const providers = [
    { value: "anthropic", label: "Claude", detail: "claude-opus-5-5", keyName: "ANTHROPIC_API_KEY" },
    { value: "openai", label: "ChatGPT", detail: "model below", keyName: "OPENAI_API_KEY" },
  ] as const;

  return (
    <form action={formAction} className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold">Voice intake LLM</legend>
        {providers.map((p) => (
          <label
            key={p.value}
            className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3 has-checked:border-orange-400 has-checked:bg-orange-50"
          >
            <span className="flex items-center gap-3">
              <input type="radio" name="provider" value={p.value} defaultChecked={settings.provider === p.value} className="accent-orange-600" />
              <span>
                <span className="font-medium">{p.label}</span> <span className="text-sm text-slate-500">({p.detail})</span>
              </span>
            </span>
            <span className={`text-xs ${keys[p.keyName] ? "text-green-700" : "text-amber-700"}`}>
              {keys[p.keyName] ? "API key set" : `${p.keyName} missing`}
            </span>
          </label>
        ))}
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="font-medium">ChatGPT model</span>
        <input
          name="openaiModel"
          defaultValue={settings.openaiModel}
          className="rounded-lg border border-slate-300 px-3 py-2"
          placeholder="gpt-5.5"
        />
        <span className="text-sm text-slate-500">Used only when ChatGPT is selected. Must support structured outputs.</span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-medium">Firm name</span>
        <input
          name="firmName"
          defaultValue={settings.firmName ?? ""}
          className="rounded-lg border border-slate-300 px-3 py-2"
          placeholder="Davis Law Group"
        />
        <span className="text-sm text-slate-500">Shown under the intake title.</span>
      </label>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 font-semibold">Live conversation</legend>
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">Pause before Scribe replies (ms)</span>
          <input
            type="number"
            name="silenceMs"
            min={SILENCE_MS_RANGE.min}
            max={SILENCE_MS_RANGE.max}
            step={100}
            defaultValue={settings.silenceMs}
            className="w-40 rounded-lg border border-slate-300 px-3 py-2"
          />
          <span className="text-sm text-slate-500">
            How long the client must stay quiet before their turn is sent. Raise it if Scribe cuts people off mid-thought.
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="allowInterrupt" defaultChecked={settings.allowInterrupt} className="mt-1 accent-orange-600" />
          <span>
            <span className="font-medium">Let the client interrupt Scribe</span>
            <span className="block text-sm text-slate-500">
              Speaking while Scribe talks stops it and starts listening. Turn off if Scribe&apos;s own voice through laptop
              speakers keeps interrupting it.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-orange-600 px-5 py-2.5 font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save settings"}
        </button>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state.ok && <p className="text-sm text-green-700">Saved. New turns use these settings.</p>}
      </div>
    </form>
  );
}
