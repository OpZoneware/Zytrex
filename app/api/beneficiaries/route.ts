import { withSandbox } from '@/lib/sandbox';
import { NextResponse } from 'next/server';
import { db, newId, currentUser } from '@/lib/store';
import { audit } from '@/lib/services/audit';
import { searchTransactions } from '@/lib/services/queries';

export const dynamic = 'force-dynamic';

async function handleGET() {
  const d = db();
  const rows = d.beneficiaries.map((b) => {
    const txns = searchTransactions({ direction: 'OUT', beneficiary_id: b.id, status: 'SUCCESSFUL', limit: 1000 });
    const creator = d.users.find((u) => u.id === b.created_by);
    return {
      ...b,
      created_by_name: creator ? `${creator.first_name} ${creator.last_name}` : '—',
      total_paid: txns.reduce((a, t) => a + t.amount, 0),
      txn_count: txns.length,
      pending_payments: d.payment_requests.filter(
        (p) => p.beneficiary_id === b.id && ['AWAITING_APPROVAL', 'AWAITING_AUTHORIZATION', 'DRAFT'].includes(p.status)
      ).length,
    };
  });
  return NextResponse.json({ ok: true, beneficiaries: rows });
}

const BANKS: Record<string, string> = {
  GTBank: 'GTB',
  'Access Bank': 'ACC',
  'Zenith Bank': 'ZEN',
  UBA: 'UBA',
  'First Bank': 'FST',
  'Union Bank': 'UNI',
  Fidelity: 'FID',
  Kuda: 'KUD',
};

async function handlePOST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });

  const user = currentUser();
  if (user.role === 'auditor') return NextResponse.json({ ok: false, error: 'Auditor accounts are read-only.' }, { status: 403 });

  const name = String(body.name ?? '').trim();
  const bank = String(body.bank_name ?? '').trim();
  const account = String(body.account_number ?? '').trim();
  if (!name || !bank || !/^\d{10}$/.test(account)) {
    return NextResponse.json({ ok: false, error: 'Provide a name, bank and a 10-digit account number.' }, { status: 400 });
  }

  const d = db();
  if (d.beneficiaries.some((b) => b.name.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ ok: false, error: 'That beneficiary already exists.' }, { status: 400 });
  }

  const b = {
    id: newId('ben'),
    organization_id: d.org.id,
    name,
    bank_name: bank,
    bank_code: BANKS[bank] ?? 'OTH',
    account_mask: account.slice(-4),
    account_name: name.toUpperCase(),
    verification_status: 'UNVERIFIED' as const,
    risk_level: 'HIGH' as const,
    created_by: user.id,
    created_at: new Date().toISOString(),
    note: 'Added via dashboard — account verification pending',
  };
  d.beneficiaries.push(b);

  audit({
    actor: `${user.first_name} ${user.last_name}`,
    actor_role: user.role,
    action: 'beneficiary.create',
    details: `Added beneficiary ${name} (${bank} ••••${account.slice(-4)}) — status UNVERIFIED, extra approval policy applies`,
    severity: 'warn',
  });

  return NextResponse.json({ ok: true, beneficiary: b });
}

export const GET = withSandbox(handleGET);
export const POST = withSandbox(handlePOST);
