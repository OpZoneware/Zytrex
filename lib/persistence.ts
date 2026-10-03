import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { attachDatabasePool } from '@vercel/functions';
import { seed } from './seed';
import type { DB } from './types';

export type SandboxSession = { data: DB; touched: number };
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
export class SessionExpired extends Error {}

const globalPool = globalThis as unknown as { zytrexPool?: Pool };
export function databasePool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!globalPool.zytrexPool) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 5000,
      allowExitOnIdle: true,
    });
    // Never log the connection URL, credentials or the provider error body.
    pool.on('error', () => console.error('Sandbox database connection interrupted.'));
    if (process.env.VERCEL) attachDatabasePool(pool);
    globalPool.zytrexPool = pool;
  }
  return globalPool.zytrexPool;
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// The entire simulated operation is committed atomically. Row locks serialize
// requests for one browser across every Vercel instance. This is intentionally
// a sandbox snapshot store, not a production ledger or live-payment outbox.
export async function persistSession(
  token: string,
  fresh: boolean,
  run: (session: SandboxSession) => Promise<Response>,
): Promise<Response> {
  const client = await databasePool().connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '8s'");
    await client.query("SET LOCAL statement_timeout = '12s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '20s'");
    const hash = tokenHash(token);
    if (fresh) {
      await client.query(
        'INSERT INTO zytrex_sandbox_sessions (token_hash, state, expires_at) VALUES ($1, $2::jsonb, clock_timestamp() + $3 * interval \'1 second\')',
        [hash, JSON.stringify(seed()), SESSION_TTL_SECONDS],
      );
    }
    const result = await client.query(
      'SELECT state, schema_version FROM zytrex_sandbox_sessions WHERE token_hash = $1 AND expires_at > clock_timestamp() FOR UPDATE',
      [hash],
    );
    if (!result.rows.length) throw new SessionExpired();
    if (result.rows[0].schema_version !== 1) throw new Error('Unsupported sandbox schema');
    const session = { data: result.rows[0].state as DB, touched: Date.now() };
    const response = await run(session);
    if (response.status >= 500) {
      await client.query('ROLLBACK');
      return response;
    }
    await client.query(
      'UPDATE zytrex_sandbox_sessions SET state = $2::jsonb, updated_at = clock_timestamp(), expires_at = clock_timestamp() + $3 * interval \'1 second\' WHERE token_hash = $1',
      [hash, JSON.stringify(session.data), SESSION_TTL_SECONDS],
    );
    await client.query('COMMIT');
    return response;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { discard = true; }
    throw error;
  } finally {
    client.release(discard);
  }
}
