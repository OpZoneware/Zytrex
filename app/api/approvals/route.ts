import { withSandbox } from '@/lib/sandbox';
import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/store';
import { approvalQueue } from '@/lib/services/queries';

export const dynamic = 'force-dynamic';

async function handleGET() {
  const user = currentUser();
  const q = approvalQueue(user);
  const map = (r: Awaited<ReturnType<typeof approvalQueue>>['pending'][number]) => ({
    payment_id: r.payment.id,
    ref: r.payment.ref,
    amount: r.payment.amount,
    currency: r.payment.currency,
    purpose: r.payment.purpose,
    status: r.payment.status,
    risk: r.payment.risk,
    created_at: r.payment.created_at,
    required_approvals: r.payment.required_approvals,
    outstanding: r.outstanding,
    beneficiary_name: r.beneficiary_name,
    requested_by: r.requested_by_name,
    approvals: r.payment.approvals.map((a) => ({ role: a.role, decision: a.decision, at: a.at })),
    actionable: r.actionable,
  });
  return NextResponse.json({
    ok: true,
    user,
    pending: q.pending.map(map),
    ready_to_authorize: q.ready_to_authorize.map(map),
  });
}

export const GET = withSandbox(handleGET);
