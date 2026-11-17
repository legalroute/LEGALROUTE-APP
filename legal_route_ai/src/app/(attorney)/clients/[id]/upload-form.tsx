"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { buttonClass, inputClass } from "@/components/ui";

export function UploadForm({ clientId, requests, onUploaded }: { clientId: string; requests: { id: string; name: string }[]; onUploaded?: () => void }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string>();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);
    setSuccess(false);
    const selected = new FormData(e.currentTarget).get("file");
    if (selected instanceof File && selected.size > 20 * 1024 * 1024) { setError("Files can be up to 20 MB."); return; }
    setPending(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/documents`, { method: "POST", body: new FormData(e.currentTarget) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);
      formRef.current?.reset();
      setSuccess(true);
      router.refresh();
      onUploaded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3">
      <input disabled={pending} name="file" type="file" required aria-label="File" className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-orange-50 file:px-3 file:py-1.5 file:text-orange-700" />
      {requests.length > 0 && (
        <select name="requestId" defaultValue="" aria-label="Fulfils request" className={inputClass}>
          <option value="">Not for a specific request</option>
          {requests.map((r) => (
            <option key={r.id} value={r.id}>
              Fulfils: {r.name}
            </option>
          ))}
        </select>
      )}
      <input name="name" placeholder="Display name (optional)" aria-label="Display name" className={inputClass} />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {success && <p role="status" className="text-sm text-green-700">Document uploaded successfully.</p>}
      <button type="submit" disabled={pending} className={buttonClass.dark}>
        <Upload className="size-4" aria-hidden /> {pending ? "Uploading…" : "Upload"}
      </button>
      <p className="text-xs text-slate-400">Up to 20 MB. Stored privately for your firm.</p>
    </form>
  );
}
