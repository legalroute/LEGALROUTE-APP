import { config } from "dotenv";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

// Existing web-local configuration remains supported; explicit environment wins.
config({ path: [".env.local", ".env", "../legal_route_ai/.env.local", "../legal_route_ai/.env"].map((p) => fileURLToPath(new URL(p, import.meta.url))), quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set. Configure backend/.env or legal_route_ai/.env.local.");
export default defineConfig({
  schema: relative(process.cwd(), fileURLToPath(new URL("src/db/schema.ts", import.meta.url))),
  out: relative(process.cwd(), fileURLToPath(new URL("drizzle", import.meta.url))),
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
  strict: true,
  verbose: true,
});
