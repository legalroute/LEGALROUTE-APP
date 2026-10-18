"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarClock, FileSearch, Mail } from "lucide-react";
import { MayaChat } from "@/components/maya-chat";
import type { ChatMessageDto } from "@/lib/maya/history";
import { sendClientMessage } from "../actions";

export function ClientChat({
  clientId,
  clientName,
  initialMessages,
  userInitials,
}: {
  clientId: string;
  clientName: string;
  initialMessages: ChatMessageDto[];
  userInitials: string;
}) {
  const router = useRouter();
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null);
  const first = clientName.split(" ")[0];
  const quick = (text: string) => setPrefill({ text, nonce: Date.now() });

  return (
    <section className="flex h-[36rem] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-3.5">
        <h2 className="font-semibold">Chat with Maya about {first}</h2>
        <p className="text-xs text-slate-500">Maya knows this client&apos;s intake, documents, tasks and activity.</p>
      </div>
      <MayaChat
        className="flex-1"
        initialMessages={initialMessages}
        send={(text) => sendClientMessage(clientId, text)}
        placeholder="Ask Maya about this client…"
        suggestions={initialMessages.length === 0 ? [`What documents are we missing for ${first}?`, `Summarize ${first}'s case`] : []}
        emptyText={`Ask about ${first}'s case, missing documents, or have Maya draft an email.`}
        userInitials={userInitials}
        onReply={() => router.refresh()}
        prefill={prefill}
      />
      <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3">
        <button
          type="button"
          onClick={() => quick(`Draft an email to ${first} asking for the documents we're still missing.`)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          <Mail className="size-4" aria-hidden /> Draft email
        </button>
        <button
          type="button"
          onClick={() => quick(`Request the missing documents from ${first}.`)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          <FileSearch className="size-4" aria-hidden /> Request documents
        </button>
        <Link
          href={`/calendar?client=${clientId}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          <CalendarClock className="size-4" aria-hidden /> Schedule consultation
        </Link>
      </div>
    </section>
  );
}
