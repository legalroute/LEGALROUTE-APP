"use client";
import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { UploadForm } from "./upload-form";
export function DocumentUploadButton({ clientId, requests }: { clientId: string; requests: { id: string; name: string }[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [uploaded, setUploaded] = useState(false), [attempt, setAttempt] = useState(0);
  return <div>
    <button type="button" className={buttonClass.secondary} onClick={() => { setUploaded(false); setAttempt((n) => n + 1); dialog.current?.showModal(); }}><Upload className="size-4" aria-hidden />Upload document</button>
    {uploaded && <p role="status" className="mt-1 text-xs text-green-700">Document uploaded.</p>}
    <dialog ref={dialog} aria-labelledby="document-upload-heading" className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-900/40">
      <div className="mb-5 flex items-center justify-between gap-4"><h2 id="document-upload-heading" className="text-xl font-semibold">Upload a document</h2><button type="button" onClick={() => dialog.current?.close()} aria-label="Close upload" className="rounded-lg p-2 hover:bg-slate-100"><X className="size-5" aria-hidden /></button></div>
      <UploadForm key={attempt} clientId={clientId} requests={requests} onUploaded={() => { setUploaded(true); dialog.current?.close(); }} />
    </dialog>
  </div>;
}
