import pg from 'pg';
import { env } from './config.js';

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  statement_timeout: 5000,
});
pool.on('error', (error) => console.error('Unexpected database connection error:', error.message));
