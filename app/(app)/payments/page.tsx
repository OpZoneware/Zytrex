'use client';

// Payment requests — every state in the machine, one table.

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight, Plus, Terminal } from 'lucide-react';
import { RiskBadge, StatusBadge } from '@/components/ui/badge';
import { useCommand } from '@/components/command/CommandContext';
import { cn } from '@/lib/utils';
import { fmtDateShort, naira0 } from '@/lib/format';
import type { PaymentStatus } from '@/lib/types';

interface P {
  id: string;
  ref: string;
  amount: number;
  purpose: string;
  status: PaymentStatus;
  risk: string;
  created_at: string;
  scheduled_at?: string;
  beneficiary_name: string;
  bank_name: string;
  account_mask: string;
  requested_by_name: string;
  source: string;
  required_approvals: string[];
}

const TABS: { id: string; label: string; test: (p: P) => boolean }[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'approval', label: 'Awaiting approval', test: (p) => p.status === 'AWAITING_APPROVAL' },
  { id: 'auth', label: 'Awaiting authorization', test: (p) => p.status === 'AWAITING_AUTHORIZATION' || p.status === 'AUTHORIZED' || p.status === 'PROCESSING' },
  { id: 'DRAFT', label: 'Scheduled', test: (p) => p.status === 'DRAFT' },
  { id: 'done', label: 'Completed', test: (p) => p.status === 'SUCCESSFUL' },
  { id: 'closed', label: 'Failed / cancelled', test: (p) => ['FAILED', 'CANCELLED', 'DECLINED', 'EXPIRED', 'REVERSED'].includes(p.status) },
];

function PaymentsInner() {
  const { openBar } = useCommand();
  const params = useSearchParams();
  const router = useRouter();
  const [payments, setPayments] = useState<P[]>([]);
  const [tab, setTab] = useState('all');

  useEffect(() => {
    const s = params.get('status');
    if (s === 'DRAFT') setTab('DRAFT');
    else if (s === 'FAILED') setTab('closed');
  }, [params]);

  const load = useCallback(async () => {
    const r = await fetch('/api/payments').then((x) => x.json());
    if (r.ok) setPayments(r.payments);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [load]);

  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  const rows = payments.filter(active.test);

  const counts = TABS.slice(1).map((t) => ({ id: t.id, n: payments.filter(t.test).length }));

  return (
    <div className="space-y-5 anim-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Payments</h2>
          <p className="text-ink3 text-[13px] mt-1">
            All payment requests and their state machine — draft → approval → authorization → settlement.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => openBar('Pay ')}>
          <Plus size={15} /> New payment
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const n = t.id === 'all' ? payments.length : counts.find((c) => c.id === t.id)?.n ?? 0;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={cn('chip', tab === t.id && 'border-accent/60 text-accent bg-accent/10')}>
              {t.label}
              <span className="text-[10.5px] mono text-ink3">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wider text-ink3 border-b border-line">
                <th className="px-4 py-3 font-semibold">Reference</th>
                <th className="px-4 py-3 font-semibold">Beneficiary</th>
                <th className="px-4 py-3 font-semibold text-right">Amount</th>
                <th className="px-4 py-3 font-semibold">Purpose</th>
                <th className="px-4 py-3 font-semibold">Requested by</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Risk</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-panel2 transition cursor-pointer" onClick={() => router.push(`/payments/${p.id}`)}>
                  <td className="px-4 py-3 mono text-[12.5px]">
                    {p.ref}
                    {p.source === 'ai' && <span className="ml-1.5 text-[9.5px] font-bold text-accent bg-accent/10 border border-accent/30 rounded px-1 py-px">AI</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.beneficiary_name}</div>
                    <div className="text-[11.5px] text-ink3">
                      {p.bank_name} ••••{p.account_mask}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right mono font-semibold">{naira0(p.amount)}</td>
                  <td className="px-4 py-3 text-ink2 max-w-[200px] truncate" title={p.purpose}>
                    {p.purpose}
                    {p.status === 'DRAFT' && p.scheduled_at && <div className="text-[11px] text-ink3">scheduled {fmtDateShort(p.scheduled_at)}</div>}
                  </td>
                  <td className="px-4 py-3 text-ink2">{p.requested_by_name}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3">
                    <RiskBadge risk={p.risk} />
                  </td>
                  <td className="px-4 py-3 text-ink3 text-[12px]">{fmtDateShort(p.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight size={15} className="text-ink3 inline" />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-ink3">
                    No payment requests in this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-[12px] text-ink3 flex items-center gap-2">
        <Terminal size={14} className="text-accent" />
        <span>
          Prepare new payments from the command bar — the agent only ever <em>prepares</em>, never executes.
        </span>
      </div>
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense fallback={<div className="text-ink3 text-sm">Loading…</div>}>
      <PaymentsInner />
    </Suspense>
  );
}
