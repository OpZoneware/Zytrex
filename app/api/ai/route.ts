import { withSandbox } from '@/lib/sandbox';
import { NextResponse } from 'next/server';
import { getMessages, gotoForMessage, runAction, runMessage, type AiAction } from '@/lib/ai/agent';
import { currentUser } from '@/lib/store';

export const dynamic = 'force-dynamic';

async function handleGET() {
  const user = currentUser();
  return NextResponse.json({ ok: true, messages: getMessages(user.id), user });
}

async function handlePOST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });

  const user = currentUser();

  if (body.type === 'action') {
    if (!['prepare_payment', 'request_approval', 'cancel_payment'].includes(body.action) || !body.payload || typeof body.payload !== 'object') return NextResponse.json({ ok: false, error: 'Invalid command action.' }, { status: 400 });
    const payload = body.payload;
    if (body.action === 'prepare_payment' ? (typeof payload.beneficiary_id !== 'string' || typeof payload.amount !== 'number' || typeof payload.purpose !== 'string' || payload.purpose.length > 240) : typeof payload.payment_id !== 'string') return NextResponse.json({ ok: false, error: 'Invalid action details.' }, { status: 400 });
    const action = body as AiAction;
    if (!action.action) return NextResponse.json({ ok: false, error: 'Missing action' }, { status: 400 });
    const msg = runAction(user.id, action);
    return NextResponse.json({ ok: true, message: msg, messages: getMessages(user.id) });
  }

  const text = String(body.text ?? '').trim();
  if (!text) return NextResponse.json({ ok: false, error: 'Empty message' }, { status: 400 });
  if (text.length > 2000) return NextResponse.json({ ok: false, error: 'Message too long' }, { status: 400 });

  const msg = runMessage(user.id, text);
  return NextResponse.json({ ok: true, message: msg, messages: getMessages(user.id), goto: gotoForMessage(msg) });
}

export const GET = withSandbox(handleGET);
export const POST = withSandbox(handlePOST);
