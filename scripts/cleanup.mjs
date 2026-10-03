import pg from 'pg';
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL first.');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  const result = await client.query('DELETE FROM zytrex_sandbox_sessions WHERE expires_at < clock_timestamp()');
  console.log(`Removed ${result.rowCount} expired sandbox sessions.`);
} finally { await client.end(); }
