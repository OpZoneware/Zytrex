import { readFile } from 'node:fs/promises';
import pg from 'pg';
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before running migrations.');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  await client.query(await readFile(new URL('../migrations/001_sandbox_sessions.sql', import.meta.url), 'utf8'));
  console.log('Sandbox session schema is ready.');
} catch {
  console.error('Migration failed. Check database connectivity and migration permissions.');
  process.exitCode = 1;
} finally { await client.end(); }
