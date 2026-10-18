"use client";

import { useActionState } from "react";
import { buttonClass, inputClass } from "@/components/ui";
import { requestMoreInfo, type RequestInfoState } from "../actions";

export function RequestInfoForm({ sessionId, clientName, firmName }: { sessionId: string; clientName: string | null; firmName: string }) {
  const [state, action, pending] = useActionState<RequestInfoState, FormData>(requestMoreInfo.bind(null, sessionId), {});
  const first = clientName?.split(" ")[0];
  return (
    <form action={action} className="flex flex-col gap-3">
      <textarea
        name="message"
        rows={6}
        aria-label="Message to the client"
        defaultValue={`Hi${first ? ` ${first}` : ""},\n\nThank you for completing our intake. To review your case, could you send us:\n- \n\nThank you,\n${firmName}`}
        className={inputClass}
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.sent && <p className="text-sm text-green-700">{state.sent}</p>}
      <button type="submit" disabled={pending} className={buttonClass.dark}>
        {pending ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}
