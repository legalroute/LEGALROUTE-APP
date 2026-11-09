import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key() {
  const value = process.env.CONNECTOR_ENCRYPTION_KEY ?? "";
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error("Configure CONNECTOR_ENCRYPTION_KEY with 32 random bytes encoded as hex.");
  return Buffer.from(value, "hex");
}
export function encrypt(value: unknown, context: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(context));
  const bytes = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), bytes.toString("base64url")].join(".");
}
export function decrypt(value: string, context: string): unknown {
  const [version, nonce, tag, bytes] = value.split(".");
  if (version !== "v1" || !nonce || !tag || !bytes) throw new Error("Invalid connector secret.");
  const cipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(nonce, "base64url"));
  cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(bytes, "base64url")), cipher.final()]).toString("utf8"));
}
export function configured() {
  return Boolean(process.env.GOOGLE_SHEETS_CLIENT_ID && process.env.GOOGLE_SHEETS_CLIENT_SECRET && /^[0-9a-f]{64}$/i.test(process.env.CONNECTOR_ENCRYPTION_KEY ?? "") && process.env.APP_URL);
}
