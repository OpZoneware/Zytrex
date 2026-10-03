import { withSandbox } from '@/lib/sandbox';
import { NextResponse } from 'next/server';
import { db } from '@/lib/store';
import { paymentById } from '@/lib/services/payments';
import { canApprove, canAuthorize, outstandingRoles } from '@/lib/policies';
import { currentUser } from '@/lib/store';

export const dynamic = 'force-dynamic';

async function handleGET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const d = db();
  const p = paymentById(id);
  if (!p) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

  const ben = d.beneficiaries.find((b) => b.id === p.beneficiary_id);
  const req = d.users.find((u) => u.id === p.requested_by);
  const auth = d.users.find((u) => u.id === p.authorized_by);
  const txn = p.transaction_id ? d.transactions.find((t) => t.id === p.transaction_id) : undefined;
  const events = d.payment_events.filter((e) => e.payment_request_id === p.id);
  const approvals = p.approvals.map((a) => {
    const u = d.users.find((x) => x.id === a.approver_id);
    return { ...a, approver_name: u ? `${u.first_name} ${u.last_name}` : a.approver_id };
  });
  const user = currentUser();

  return NextResponse.json({
    ok: true,
    payment: {
      ...p,
      beneficiary_name: ben?.name ?? '—',
      beneficiary_account_name: ben?.account_name ?? '',
      bank_name: ben?.bank_name ?? '',
      account_mask: ben?.account_mask ?? '',
      verification_status: ben?.verification_status ?? 'UNVERIFIED',
      requested_by_name: req ? `${req.first_name} ${req.last_name}` : '—',
      authorized_by_name: auth ? `${auth.first_name} ${auth.last_name}` : undefined,
      approvals,
      events,
      transaction: txn ?? null,
      outstanding: outstandingRoles(p),
      viewer_can_approve: canApprove(user, p),
      viewer_can_authorize: canAuthorize(user, p),
      viewer_is_requester: user.id === p.requested_by,
    },
    users: d.users.map((u) => ({ id: u.id, name: `${u.first_name} ${u.last_name}`, role: u.role, initials: u.initials, color: u.color })),
  });
}

export const GET = withSandbox(handleGET);
