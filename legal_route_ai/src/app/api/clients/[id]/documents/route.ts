import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
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
  const { id } = await ctx.params;
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.lawFirmId, user.firm.id)))
    .catch(() => []);
  if (!client) return Response.json({ error: "Client not found." }, { status: 404 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Choose a file to upload." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: "Files can be up to 20 MB." }, { status: 413 });
  const label = String(form.get("name") ?? "").trim().slice(0, 200);
  const requestId = String(form.get("requestId") ?? "");

  const fileName = safeFileName(file.name);
  const relative = path.posix.join(user.firm.id, client.id, `${randomUUID()}-${fileName}`);
  const full = uploadPath(relative);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, Buffer.from(await file.arrayBuffer()));

  const values = { filePath: relative, mimeType: file.type || "application/octet-stream", sizeBytes: file.size, status: "received" as const };
  const [pending] = requestId
    ? await db
        .select()
        .from(documents)
        .where(and(eq(documents.id, requestId), eq(documents.clientId, client.id), eq(documents.status, "requested")))
        .catch(() => [])
    : [];
  const name = label || pending?.name || fileName;
  if (pending) await db.update(documents).set({ ...values, name }).where(eq(documents.id, pending.id));
  else await db.insert(documents).values({ ...values, name, lawFirmId: user.firm.id, clientId: client.id });

  await logActivity(user.firm.id, "document", `Document uploaded — ${name}`, client.id);
  revalidatePath(`/clients/${client.id}`);
  return Response.json({ ok: true });
}
