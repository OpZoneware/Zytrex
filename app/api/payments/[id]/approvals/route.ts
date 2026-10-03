import { withSandbox } from '@/lib/sandbox';
import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/store';
import { decidePayment } from '@/lib/services/payments';

export const dynamic = 'force-dynamic';

async function handlePOST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));
  if (!['APPROVED', 'REJECTED'].includes(body.decision) || (body.reason != null && (typeof body.reason !== 'string' || body.reason.length > 500))) return NextResponse.json({ ok: false, error: 'Choose an explicit approval decision.' }, { status: 400 });
  const decision = body.decision as 'APPROVED' | 'REJECTED';
  const user = currentUser();
  const res = decidePayment(id, user, decision, body.reason);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true, payment_id: res.payment.id, status: res.payment.status });
}

export const POST = withSandbox(handlePOST);
