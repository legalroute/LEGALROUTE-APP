import express from 'express';
import { env } from './config.ts';
import { sql } from 'drizzle-orm';
import { db, closeDatabase } from './db/index.ts';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_request, response) => {
  try {
    await db.execute(sql`SELECT 1`);
    response.json({ status: 'ok', database: 'connected' });
  } catch {
    response.status(503).json({ status: 'unavailable', database: 'disconnected' });
  }
});
app.use((_request, response) => { response.status(404).json({ error: 'Not found' }); });
const handleError: express.ErrorRequestHandler = (error, _request, response, _next) => {
  const status = error.status === 400 ? 400 : 500;
  response.status(status).json({ error: status === 400 ? 'Invalid request' : 'Internal server error' });
};
app.use(handleError);

const server = app.listen(env.port, env.host, () => {
  console.log(`LegalRoute API listening on http://${env.host}:${env.port}`);
});
server.on('error', (error) => { console.error('Server failed to start:', error.message); process.exitCode = 1; });
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  server.close(() => {
    void closeDatabase().then(() => { clearTimeout(timeout); }).catch(() => { process.exitCode = 1; });
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
