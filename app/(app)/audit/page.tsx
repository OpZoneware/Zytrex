'use client';

// Session history audit log — every login, tool call, approval and settlement.

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Lock, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtDateTime } from '@/lib/format';

interface E {
  id: string;
  at: string;
  actor: string;
  actor_role?: string;
  action: string;
  details: string;
  severity: 'info' | 'warn' | 'critical';
  payment_id?: string;
}

const FILTERS = [
  { id: 'all', label: 'All events' },
  { id: 'ai', label: 'AI', match: (e: E) => e.action.startsWith('ai.') },
  { id: 'payment', label: 'Payments', match: (e: E) => e.action.startsWith('payment.') || e.action.startsWith('gateway.') },
  { id: 'approval', label: 'Approvals', match: (e: E) => e.action.startsWith('approval.') },
  { id: 'auth', label: 'Auth & policy', match: (e: E) => e.action.startsWith('auth.') || e.action.startsWith('policy.') || e.action.startsWith('beneficiary.') },
];

function AuditInner() {
  const params = useSearchParams();
  const [rows, setRows] = useState<E[]>([]);
  const [filter, setFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = paymentFilter ? `?payment_id=${paymentFilter}` : '';
    const r = await fetch(`/api/audit${qs}`).then((x) => x.json());
    if (r.ok) setRows(r.entries);
  }, [paymentFilter]);

  useEffect(() => {
    const p = params.get('payment');
    if (p) setPaymentFilter(p);
  }, [params]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const f = FILTERS.find((x) => x.id === filter);
  const shown = f?.match ? rows.filter(f.match) : rows;

  return (
    <div className="max-w-4xl space-y-5 anim-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2.5">
            Audit Log <span className="text-[10px] font-bold text-accent border border-accent/40 bg-accent/10 rounded px-1.5 py-0.5 uppercase tracking-wider">Session history</span>
          </h2>
          <p className="text-ink3 text-[13px] mt-1">
            Append-only trail of every session, AI tool call, approval, authorization and settlement.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((x) => (
            <button key={x.id} className={cn('chip', filter === x.id && 'border-accent/60 text-accent bg-accent/10')} onClick={() => setFilter(x.id)}>
              {x.label}
            </button>
          ))}
          {paymentFilter && (
            <button className="chip border-info/60 text-info" onClick={() => setPaymentFilter(null)}>
              {paymentFilter} ✕
            </button>
          )}
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2 text-[12px] text-ink3 mb-4 pb-4 border-b border-line">
          <Lock size={13} className="text-accent" />
          Entries are append-only. Nothing in the product — including the AI — can edit or delete history.
        </div>

        <div className="space-y-0">
          {shown.map((e, i) => (
            <div key={e.id} className="flex gap-3.5 group">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    'w-2.5 h-2.5 rounded-full mt-[7px] shrink-0',
                    e.severity === 'critical' ? 'bg-violet' : e.severity === 'warn' ? 'bg-warn' : 'bg-accent/70'
                  )}
                />
                {i < shown.length - 1 && <span className="w-px flex-1 bg-line group-hover:bg-line2 transition" />}
              </div>
              <div className={cn('pb-5 min-w-0 flex-1', e.severity === 'critical' && 'relative')}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mono text-[11.5px] text-ink3">{fmtDateTime(e.at)}</span>
                  <span
                    className={cn(
                      'text-[9.5px] font-bold uppercase tracking-wider rounded px-1.5 py-px border',
                      e.action.startsWith('ai.') ? 'text-accent border-accent/30 bg-accent/10' : e.severity === 'warn' ? 'text-warn border-warn/30 bg-warn/10' : 'text-ink3 border-line2 bg-panel2'
                    )}
                  >
                    {e.action}
                  </span>
                  {e.action.startsWith('ai.') && (
                    <span className="w-4 h-4 rounded bg-accent text-white grid place-items-center text-[9px] font-bold leading-none">Z</span>
                  )}
                  {e.severity === 'critical' && <ShieldAlert size={11} className="text-violet" />}
                </div>
                <div className="text-[13.5px] text-ink mt-1 leading-relaxed">
                  <span className="font-semibold">{e.actor}</span>
                  {e.actor_role && e.actor_role !== 'AI' && e.actor_role !== 'SYSTEM' && (
                    <span className="text-ink3 font-normal"> ({e.actor_role})</span>
                  )}
                </div>
                <div className="text-[13px] text-ink2 mt-0.5 break-words">{e.details}</div>
              </div>
            </div>
          ))}
          {shown.length === 0 && <div className="text-ink3 text-sm py-6 text-center">No events in this filter.</div>}
        </div>
      </div>
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense fallback={<div className="text-ink3 text-sm">Loading…</div>}>
      <AuditInner />
    </Suspense>
  );
}
