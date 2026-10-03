import { withSandbox } from '@/lib/sandbox';
import { NextResponse } from 'next/server';
import { searchTransactions } from '@/lib/services/queries';
import { db } from '@/lib/store';

export const dynamic = 'force-dynamic';

async function handleGET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams;
  const rows = searchTransactions({
    direction: (q.get('direction') as 'IN' | 'OUT') || undefined,
    status: q.get('status') || undefined,
    category: q.get('category') || undefined,
    beneficiary_id: q.get('beneficiary_id') || undefined,
    counterparty_q: q.get('q') || undefined,
    min_amount: q.get('min_amount') ? Number(q.get('min_amount')) : undefined,
    max_amount: q.get('max_amount') ? Number(q.get('max_amount')) : undefined,
    start: q.get('start') || undefined,
    end: q.get('end') || undefined,
    limit: Math.min(Number(q.get('limit') ?? 200), 500),
  });
  const d = db();
  const enriched = rows.map((t) => {
    const ben = t.beneficiary_id ? d.beneficiaries.find((b) => b.id === t.beneficiary_id) : undefined;
    return {
      ...t,
      bank_name: ben?.bank_name,
      account_mask: ben?.account_mask,
      beneficiary_status: ben?.verification_status,
    };
  });
  const total = enriched.filter((t) => t.status === 'SUCCESSFUL').reduce((a, b) => a + b.amount, 0);
  return NextResponse.json({ ok: true, transactions: enriched, count: enriched.length, total });
}

export const GET = withSandbox(handleGET);
