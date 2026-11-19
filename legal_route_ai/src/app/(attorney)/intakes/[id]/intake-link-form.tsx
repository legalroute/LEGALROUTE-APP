"use client";
import { useActionState, useState } from "react";
import { buttonClass } from "@/components/ui";
import { manageIntakeLink } from "./link-actions";
export function IntakeLinkForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(manageIntakeLink.bind(null, id), {});
  const [copied, setCopied] = useState(false);
  return <form action={action} className="space-y-3"><h2 className="font-semibold">Private session link</h2><p className="text-xs text-slate-500">Replace or revoke the client&apos;s 7-day resume link. Replacing invalidates previous links. Open sessions will be blocked on their next request.</p><div className="flex flex-wrap gap-2"><button disabled={pending} name="operation" value="rotate" className={buttonClass.secondary}>Create replacement link</button><button disabled={pending} name="operation" value="revoke" className={buttonClass.secondary}>Revoke link</button></div>{state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}{state.done && <p role="status" className="text-sm text-slate-600">{state.done}</p>}{state.path && <div><a href={state.path} target="_blank" rel="noreferrer" className="mr-3 text-sm text-orange-700 underline">Open private intake</a><button type="button" className="text-sm font-semibold text-orange-700" onClick={async () => { try { await navigator.clipboard.writeText(new URL(state.path!, window.location.origin).href); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Copied" : "Copy new link"}</button></div>}</form>;
}
