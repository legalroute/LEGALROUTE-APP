import path from "node:path";

// Client documents are kept on local disk (gitignored): uploads/<firmId>/<clientId>/<file>.
export const UPLOADS_DIR = path.join(process.cwd(), "uploads");
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// Resolves a stored relative path, refusing anything that escapes the uploads folder.
export function uploadPath(relative: string) {
  const full = path.resolve(UPLOADS_DIR, relative);
  if (!full.startsWith(UPLOADS_DIR + path.sep)) throw new Error("Invalid document path");
  return full;
}

export function safeFileName(name: string) {
  const base = path.basename(name).replace(/[^\w.\- ]+/g, "_").trim();
  return base.slice(-120) || "document";
}
