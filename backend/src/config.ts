import "./env.ts";

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Copy backend/.env.example to backend/.env');
export const env = { host: process.env.HOST ?? '127.0.0.1', port, databaseUrl: process.env.DATABASE_URL };
