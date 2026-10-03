import { withSandbox } from '@/lib/sandbox';
import { NextResponse } from 'next/server';
import { listAudit } from '@/lib/services/audit';

export const dynamic = 'force-dynamic';

async function handleGET(req: Request) {
  const url = new URL(req.url);
  const paymentId = url.searchParams.get('payment_id') ?? undefined;
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 200), 500);
  return NextResponse.json({ ok: true, entries: listAudit(limit, paymentId) });
}

export const GET = withSandbox(handleGET);
