import { withSandbox } from '@/lib/sandbox';
import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/store';
import { authorizeAndExecute } from '@/lib/services/payments';

export const dynamic = 'force-dynamic';

async function handlePOST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));
  const user = currentUser();
  const res = await authorizeAndExecute(id, user, String(body.pin ?? ''));
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
  return NextResponse.json({
    ok: true,
    payment_id: res.payment.id,
    status: res.payment.status,
    transaction_id: res.transaction_id,
    provider_reference: res.provider_reference,
  });
}

export const POST = withSandbox(handlePOST);
