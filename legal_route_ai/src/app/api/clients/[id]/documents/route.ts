import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { clients, db, documents } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/firm";
import { MAX_UPLOAD_BYTES, safeFileName, uploadPath } from "@/lib/uploads";

// Upload a document to a client's workspace. Optionally fulfils a pending request (`requestId`).
export async function POST(request: Request, ctx: RouteContext<"/api/clients/[id]/documents">) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host") || new URL(request.url).host;
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || new URL(request.url).protocol.slice(0, -1);
  if (origin && origin !== `${protocol}://${host}`) return Response.json({ error: "Upload must come from this application." }, { status: 403 });
  const { id } = await ctx.params;
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.lawFirmId, user.firm.id)))
    .catch(() => []);
  if (!client) return Response.json({ error: "Client not found." }, { status: 404 });

  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Choose a file to upload." }, { status: 400 });
  const chunks: Uint8Array[] = []; let bodyBytes = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; bodyBytes += part.value.length; if (bodyBytes > MAX_UPLOAD_BYTES + 65536) { await reader.cancel(); return Response.json({ error: "Files can be up to 20 MB." }, { status: 413 }); } chunks.push(part.value); }
  } catch { return Response.json({ error: "Upload was interrupted. Try again." }, { status: 400 }); }
  let form: FormData;
  try { form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData(); }
  catch { return Response.json({ error: "Invalid upload form." }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Choose a file to upload." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: "Files can be up to 20 MB." }, { status: 413 });
  const label = String(form.get("name") ?? "").trim().slice(0, 200);
  const requestId = String(form.get("requestId") ?? "");

  const [pending] = requestId
    ? await db
        .select()
        .from(documents)
        .where(and(eq(documents.id, requestId), eq(documents.lawFirmId, user.firm.id), eq(documents.clientId, client.id), eq(documents.status, "requested")))
        .catch(() => [])
    : [];
  if (requestId && !pending) return Response.json({ error: "This document request is unavailable. Refresh and try again." }, { status: 409 });
  const fileName = safeFileName(file.name);
  const relative = path.posix.join(user.firm.id, client.id, `${randomUUID()}-${fileName}`);
  const full = uploadPath(relative);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, Buffer.from(await file.arrayBuffer()));

  const values = { filePath: relative, mimeType: file.type || "application/octet-stream", sizeBytes: file.size, status: "received" as const };
  const name = label || pending?.name || fileName;
  try {
    if (pending) {
      const updated = await db.update(documents).set({ ...values, name }).where(and(eq(documents.id, pending.id), eq(documents.lawFirmId, user.firm.id), eq(documents.clientId, client.id), eq(documents.status, "requested"))).returning({ id: documents.id });
      if (!updated.length) { await unlink(full).catch(() => {}); return Response.json({ error: "This request was already fulfilled. Refresh and try again." }, { status: 409 }); }
    } else await db.insert(documents).values({ ...values, name, lawFirmId: user.firm.id, clientId: client.id });
  } catch (error) { await unlink(full).catch(() => {}); throw error; }

  await logActivity(user.firm.id, "document", `Document uploaded — ${name}`, client.id);
  revalidatePath(`/clients/${client.id}`);
  return Response.json({ ok: true });
}
