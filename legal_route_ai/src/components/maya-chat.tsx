"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import type { ChatMessageDto } from "@/lib/maya/history";

export type MayaSendResult = { reply?: ChatMessageDto; userMessage?: ChatMessageDto; error?: string };

// Chat with Maya. `send` is a Server Action bound to the right scope (home, a client, a template).
export function MayaChat({
  initialMessages,
  send,
  placeholder = "Ask Maya anything…",
  suggestions = [],
  emptyText,
  userInitials,
  onReply,
  prefill,
  className = "",
}: {
  initialMessages: ChatMessageDto[];
  send: (text: string) => Promise<MayaSendResult>;
  placeholder?: string;
  suggestions?: string[];
  emptyText?: string;
  userInitials: string;
  onReply?: () => void;
  prefill?: { text: string; nonce: number } | null;
  className?: string;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, pending]);

  // Quick-action buttons elsewhere on the page can drop a prompt into the box.
  const [prefillNonce, setPrefillNonce] = useState(prefill?.nonce);
  if (prefill && prefill.nonce !== prefillNonce) {
    setPrefillNonce(prefill.nonce);
    setDraft(prefill.text);
  }
  useEffect(() => {
    if (prefill) inputRef.current?.focus();
  }, [prefill]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setError(undefined);
    setDraft("");
    const tempId = `pending-${++seq.current}`;
    setMessages((m) => [...m, { id: tempId, role: "user", text: trimmed, createdAt: new Date().toISOString() }]);
    startTransition(async () => {
      const result = await send(trimmed).catch(() => ({ error: "Couldn't reach Maya. Please try again." }) as MayaSendResult);
      setMessages((m) => {
        const withoutTemp = m.filter((x) => x.id !== tempId);
        const confirmed = result.userMessage ?? { id: tempId, role: "user" as const, text: trimmed, createdAt: new Date().toISOString() };
        return result.reply ? [...withoutTemp, confirmed, result.reply] : [...withoutTemp, confirmed];
      });
      if (result.error) setError(result.error);
      else onReply?.();
    });
  }

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-5">
        {messages.length === 0 && (
          <div className="m-auto flex max-w-sm flex-col items-center gap-3 text-center text-sm text-slate-500">
            <span className="grid size-11 place-items-center rounded-full bg-orange-100 text-orange-600">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <p>{emptyText ?? "Ask Maya a question to get started."}</p>
          </div>
        )}
        {messages.map((m) => (
          <ChatBubble key={m.id} message={m} userInitials={userInitials} />
        ))}
        {pending && (
          <div className="flex items-center gap-3 text-sm text-slate-400" aria-live="polite">
            <MayaAvatar />
            <span className="flex gap-1" aria-label="Maya is typing">
              <span className="size-1.5 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.3s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.15s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-slate-300" />
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <p className="mx-4 mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {/* Starter prompts only until the conversation begins. */}
      {suggestions.length > 0 && messages.length === 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending}
              onClick={() => submit(s)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-orange-300 hover:text-orange-700 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="m-3 mt-1 flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 focus-within:border-orange-300 focus-within:ring-2 focus-within:ring-orange-100"
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
      >
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(draft);
            }
          }}
          rows={1}
          placeholder={placeholder}
          aria-label={placeholder}
          className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-orange-600 text-white transition hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-400"
        >
          <ArrowUp className="size-4" aria-hidden />
          <span className="sr-only">Send</span>
        </button>
      </form>
    </div>
  );
}

export function MayaAvatar() {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-linear-to-br from-orange-400 to-rose-400 text-xs font-semibold text-white">
      M
    </span>
  );
}

function ChatBubble({ message, userInitials }: { message: ChatMessageDto; userInitials: string }) {
  const maya = message.role === "assistant";
  return (
    <div className={`flex gap-3 ${maya ? "" : "flex-row-reverse"}`}>
      {maya ? (
        <MayaAvatar />
      ) : (
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
          {userInitials}
        </span>
      )}
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          maya ? "rounded-tl-sm border border-orange-100 bg-orange-50/50 text-slate-800" : "rounded-tr-sm bg-slate-100 text-slate-800"
        }`}
      >
        {maya && <p className="mb-0.5 text-xs font-semibold text-orange-700">Maya</p>}
        {message.text}
      </div>
    </div>
  );
}
