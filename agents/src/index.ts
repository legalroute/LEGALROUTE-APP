import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { starterAgent } from './agents/starter/index.ts';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

try {
  const result = await starterAgent.run(undefined, { logger: console });
  console.info(JSON.stringify({ agent: starterAgent.name, ...result }));
} catch (error) {
  console.error('Agent run failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
}
