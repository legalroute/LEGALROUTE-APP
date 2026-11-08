import "../env.ts";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
}

// Reuse one connection pool across hot reloads in development.
const globalForDb = globalThis as unknown as { pgClient?: postgres.Sql };
const client = globalForDb.pgClient ?? postgres(connectionString, { max: 10, connect_timeout: 5, idle_timeout: 30 });
if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
export * from "./schema.ts";

// Explicit lifecycle hook for workers, CLI tools and isolated integration tests.
export async function closeDatabase() {
  await client.end();
  if (globalForDb.pgClient === client) delete globalForDb.pgClient;
}
