import { withSandbox } from '@/lib/sandbox';
import { NextResponse } from 'next/server';
import { db } from '@/lib/store';

export const dynamic = 'force-dynamic';

async function handleGET() {
  const d = db();
  const rows = d.payment_requests.map((p) => {
    const ben = d.beneficiaries.find((b) => b.id === p.beneficiary_id);
    const req = d.users.find((u) => u.id === p.requested_by);
    return {
      ...p,
      beneficiary_name: ben?.name ?? '—',
      bank_name: ben?.bank_name ?? '',
      account_mask: ben?.account_mask ?? '',
      requested_by_name: req ? `${req.first_name} ${req.last_name}` : '—',
    };
  });
  return NextResponse.json({ ok: true, payments: rows });
}

export const GET = withSandbox(handleGET);
