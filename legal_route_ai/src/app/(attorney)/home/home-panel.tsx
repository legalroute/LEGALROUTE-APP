"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { CalendarPlus, FilePenLine, Inbox, Mail, MoreHorizontal, Search, Trash2 } from "lucide-react";
import { MayaChat } from "@/components/maya-chat";
import type { ChatMessageDto } from "@/lib/maya/history";
import { clearHomeChat, sendHomeMessage } from "./actions";

const tile =
  "flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 text-left text-sm font-medium shadow-sm transition hover:border-orange-300 hover:shadow";

export function HomePanel({
  pendingCount,
  builderHref,
  initialMessages,
  userInitials,
  activity,
}: {
  pendingCount: number;
  builderHref: string;
  initialMessages: ChatMessageDto[];
  userInitials: string;
  activity: ReactNode;
}) {
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null);
  const icon = (Icon: typeof Search) => (
    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600">
      <Icon className="size-4.5" aria-hidden />
    </span>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Link href="/clients" className={tile}>
            {icon(Search)} Find a client
          </Link>
          <Link href="/intakes?tab=pending" className={tile}>
            {icon(Inbox)}
            <span>
              Review new intakes
              {pendingCount > 0 && <span className="ml-1.5 rounded-full bg-orange-600 px-1.5 py-0.5 text-xs text-white">{pendingCount}</span>}
            </span>
          </Link>
          <button type="button" className={tile} onClick={() => setPrefill({ text: "Draft an email to ", nonce: Date.now() })}>
            {icon(Mail)} Draft an email
          </button>
          <Link href={builderHref} className={tile}>
            {icon(FilePenLine)} Update my intake
          </Link>
          <Link href="/calendar" className={tile}>
            {icon(CalendarPlus)} Schedule a consultation
          </Link>
          <Link href="/firm-settings" className={tile}>
            {icon(MoreHorizontal)} More
          </Link>
        </div>
        {activity}
      </div>

      <section className="flex h-[34rem] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm lg:sticky lg:top-6">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div>
            <h2 className="font-semibold">Ask Maya</h2>
            <p className="text-xs text-slate-500">Questions about your intakes, clients and tasks.</p>
          </div>
          {initialMessages.length > 0 && (
            <form action={clearHomeChat}>
              <button type="submit" title="Clear conversation" className="rounded-lg p-2 text-slate-300 hover:bg-slate-100 hover:text-slate-600">
                <Trash2 className="size-4" aria-hidden />
                <span className="sr-only">Clear conversation</span>
              </button>
            </form>
          )}
        </div>
        <MayaChat
          key={initialMessages.length === 0 ? "empty" : "chat"}
          className="flex-1"
          initialMessages={initialMessages}
          send={sendHomeMessage}
          placeholder="Ask Maya anything…"
          suggestions={initialMessages.length === 0 ? ["Which intakes need my attention?", "What tasks are due this week?"] : []}
          emptyText="Ask about new intakes, a client, or what needs your attention today."
          userInitials={userInitials}
          prefill={prefill}
        />
      </section>
    </div>
  );
}
