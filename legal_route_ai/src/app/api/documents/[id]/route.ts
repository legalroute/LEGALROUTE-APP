import { readFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { db, documents } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { uploadPath } from "@/lib/uploads";

// Download a client document. Only members of the owning firm can read it.
export async function GET(_request: Request, ctx: RouteContext<"/api/documents/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Please sign in again.", { status: 401 });
  const { id } = await ctx.params;
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.lawFirmId, user.firm.id)))
    .catch(() => []);
  if (!doc?.filePath) return new Response("Document not found.", { status: 404 });

  const bytes = await readFile(uploadPath(doc.filePath)).catch(() => null);
  if (!bytes) return new Response("The file is missing from storage.", { status: 404 });
  const ext = doc.filePath.split(".").pop();
  const fileName = doc.name.includes(".") || !ext ? doc.name : `${doc.name}.${ext}`;
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.mimeType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
