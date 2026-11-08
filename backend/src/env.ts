import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Source and dist are siblings, so configuration paths stay stable after builds.
// Next.js has already loaded its environment; dotenv never overrides it.
if (!process.env.DATABASE_URL) config({
  path: ["../.env.local", "../.env", "../../legal_route_ai/.env.local", "../../legal_route_ai/.env"].map((p) => fileURLToPath(new URL(p, import.meta.url).href)),
  quiet: true,
});
