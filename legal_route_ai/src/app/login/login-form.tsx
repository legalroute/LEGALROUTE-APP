"use client";

import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import { requestMagicLink, type LoginState } from "./actions";

export function LoginForm({ next, expired }: { next?: string; expired: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(requestMagicLink, {});

  if (state.sentTo) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-orange-100 text-orange-600">
          <MailCheck className="size-7" aria-hidden />
        </span>
        <h2 className="font-serif text-2xl font-semibold">Check your email</h2>
        <p className="text-sm text-slate-500">
          We sent a sign-in link to <span className="font-medium text-slate-800">{state.sentTo}</span>. It works once and
          expires in 15 minutes.
        </p>
        {state.devLink && (
          <div className="w-full rounded-xl border border-amber-300 bg-amber-50 p-3 text-left text-xs text-amber-900">
            <p className="font-semibold">Development mode: email isn&apos;t configured.</p>
            <p className="mt-1">Set RESEND_API_KEY and EMAIL_FROM to send real emails. Until then, use this link:</p>
            <a href={state.devLink} className="mt-2 block font-medium break-all text-orange-700 underline">
              Open sign-in link
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      {expired && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
          That sign-in link has expired or was already used. Request a new one.
        </p>
      )}
      <input type="hidden" name="next" value={next ?? ""} />
      <label htmlFor="email" className="sr-only">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@yourfirm.com"
        className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
      />
      {state.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send Magic Link"}
      </button>
      <p className="text-center text-sm text-slate-500">We&apos;ll email you a secure, one-time sign-in link.</p>
    </form>
  );
}
