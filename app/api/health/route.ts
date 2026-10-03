import { databasePool } from '@/lib/persistence';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    if (process.env.PAYMENT_MODE && process.env.PAYMENT_MODE !== 'sandbox') throw new Error('Sandbox only');
    await databasePool().query('SELECT schema_version FROM zytrex_sandbox_sessions LIMIT 0');
    return Response.json({ ok: true, mode: 'sandbox', storage: 'postgres' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ ok: false, error: 'Sandbox storage is not ready.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
