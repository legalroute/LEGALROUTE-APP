"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { buttonClass, inputClass } from "@/components/ui";

export function UploadForm({ clientId, requests }: { clientId: string; requests: { id: string; name: string }[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);
    setPending(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/documents`, { method: "POST", body: new FormData(e.currentTarget) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);
      formRef.current?.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3">
      <input name="file" type="file" required aria-label="File" className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-orange-50 file:px-3 file:py-1.5 file:text-orange-700" />
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
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={pending} className={buttonClass.dark}>
        <Upload className="size-4" aria-hidden /> {pending ? "Uploading…" : "Upload"}
      </button>
      <p className="text-xs text-slate-400">Up to 20 MB. Stored privately for your firm.</p>
    </form>
  );
}
