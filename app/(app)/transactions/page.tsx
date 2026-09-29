'use client';

// Transactions — clean, grouped by day, with a slide-out detail panel.
// Filters arrive from natural-language commands via the URL (status, direction,
// amount range, dates, search), so "Show failed transactions this month"
// lands here already filtered.

import { Suspense, useCallback, useEffect, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Download, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtDateShort, fmtDateTime, naira, naira0 } from '@/lib/format';
import { StatusBadge } from '@/components/ui/badge';

interface Txn {
  id: string;
  ref: string;
  payment_request_id?: string;
  counterparty: string;
  description: string;
  category: string;
  amount: number;
  direction: 'IN' | 'OUT';
  status: string;
  failure_reason?: string;
  provider_reference?: string;
  internal_reference?: string;
  bank_name?: string;
  account_mask?: string;
  initiated_at: string;
  completed_at?: string;
}

type Tab = 'ALL' | 'IN' | 'OUT' | 'FAILED';

function useTransactions(params: URLSearchParams) {
  const [rows, setRows] = useState<Txn[] | null>(null);
  const [count, setCount] = useState(0);
  const key = params.toString();

  useEffect(() => {
    let alive = true;
    const qs = new URLSearchParams(key);
    if (!qs.get('limit')) qs.set('limit', '300');
    setRows(null);
    fetch(`/api/transactions?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setRows(d.transactions ?? []);
        setCount(d.count ?? 0);
      })
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [key]);

  return { rows, count };
}

function groupLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, yest)) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-ink3 text-sm">Loading…</div>}>
      <TransactionsInner />
    </Suspense>
  );
}

function TransactionsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const updateParams = useCallback(
    (mut: (p: URLSearchParams) => void) => {
      const p = new URLSearchParams(searchParams.toString());
      mut(p);
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname]
  );
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [minAmount, setMinAmount] = useState(searchParams.get('min_amount') ?? '');
  const [panel, setPanel] = useState<Txn | null>(null);

  // sync local inputs when URL changes (natural-language navigation)
  useEffect(() => {
    setQ(searchParams.get('q') ?? '');
    setMinAmount(searchParams.get('min_amount') ?? '');
  }, [searchParams]);

  const tab: Tab = searchParams.get('status') === 'FAILED' ? 'FAILED'
    : searchParams.get('direction') === 'IN' ? 'IN'
    : searchParams.get('direction') === 'OUT' ? 'OUT'
    : 'ALL';

  const query = useMemo(() => {
    const p = new URLSearchParams(searchParams.toString());
    // tab controls direction/status
    if (tab === 'ALL') { p.delete('direction'); p.delete('status'); }
    if (tab === 'FAILED') { p.set('status', 'FAILED'); p.delete('direction'); }
    if (tab === 'IN') { p.set('direction', 'IN'); p.delete('status'); }
    if (tab === 'OUT') { p.set('direction', 'OUT'); p.delete('status'); }
    if (q) p.set('q', q);
    else p.delete('q');
    if (minAmount) p.set('min_amount', minAmount);
    else p.delete('min_amount');
    return p;
  }, [searchParams, tab, q, minAmount]);

  const { rows, count } = useTransactions(query);
  const totalOut = (rows ?? []).filter((t) => t.status === 'SUCCESSFUL' && t.direction === 'OUT').reduce((a, t) => a + t.amount, 0);
  const totalIn = (rows ?? []).filter((t) => t.status === 'SUCCESSFUL' && t.direction === 'IN').reduce((a, t) => a + t.amount, 0);

  // active filter chips (from NL commands + inputs)
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (searchParams.get('min_amount') && !minAmount)
    chips.push({ key: 'nm0', label: `Amount ≥ ${naira0(Number(searchParams.get('min_amount')))}`, clear: () => setMinAmount(String(searchParams.get('min_amount'))) });
  if (minAmount && Number(minAmount) > 0)
    chips.push({ key: 'nm', label: `Amount ≥ ${naira0(Number(minAmount))}`, clear: () => setMinAmount('') });
  if (searchParams.get('start') || searchParams.get('end')) {
    const s = searchParams.get('start')?.slice(0, 10);
    const e = searchParams.get('end')?.slice(0, 10);
    chips.push({
      key: 'dates',
      label: `${s ? fmtDateShort(s) : '…'} → ${e ? fmtDateShort(e) : '…'}`,
      clear: () => removeParam('start', 'end'),
    });
  }
  if (searchParams.get('max_amount'))
    chips.push({ key: 'mx', label: `≤ ${naira0(Number(searchParams.get('max_amount')))}`, clear: () => removeParam('max_amount') });

  function removeParam(...keys: string[]) {
    updateParams((p) => keys.forEach((k) => p.delete(k)));
  }

  function setParam(key: string, value: string | null) {
    updateParams((p) => {
      if (value) p.set(key, value);
      else p.delete(key);
    });
  }

  const grouped = useMemo(() => {
    const list = rows ?? [];
    const out: { label: string; items: Txn[] }[] = [];
    for (const t of list) {
      const label = groupLabel(t.initiated_at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(t);
      else out.push({ label, items: [t] });
    }
    return out;
  }, [rows]);

  function exportCsv() {
    const cols = ['ref', 'date', 'counterparty', 'description', 'category', 'direction', 'amount', 'status', 'provider_reference'];
    const lines = [cols.join(',')];
    for (const t of rows ?? []) {
      lines.push(
        [t.ref, t.initiated_at, t.counterparty, t.description, t.category, t.direction, t.amount, t.status, t.provider_reference ?? '']
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'zytrex-transactions.csv';
    a.click();
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'ALL', label: 'All' },
    { id: 'IN', label: 'Money In' },
    { id: 'OUT', label: 'Money Out' },
    { id: 'FAILED', label: 'Failed' },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-9 pt-7 max-w-[1140px]">
      <div className="flex flex-wrap items-center justify-between gap-3 anim-fade-up">
        <div>
          <h2 className="text-[24px] font-bold tracking-tight">Transactions</h2>
          <p className="text-[13px] text-ink2 mt-0.5">
            {count} result{count === 1 ? '' : 's'}
            {rows != null && (
              <span className="mono"> · in {naira0(totalIn)} · out {naira0(totalOut)}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink3" />
            <input
              className="input !pl-8 !w-[190px]"
              placeholder="Search payee, ref…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setParam('q', e.target.value || null);
              }}
            />
          </div>
          <button className="btn btn-secondary btn-sm" onClick={exportCsv}>
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      {/* tabs */}
      <div className="flex items-center gap-1.5 mt-5 anim-fade-up" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={cn(
              'px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition',
              tab === t.id ? 'bg-ink text-white' : 'text-ink2 hover:bg-panel2 border border-line bg-panel'
            )}
            onClick={() =>
              updateParams((p) => {
                p.delete('status');
                p.delete('direction');
                if (t.id === 'FAILED') p.set('status', 'FAILED');
                if (t.id === 'IN') p.set('direction', 'IN');
                if (t.id === 'OUT') p.set('direction', 'OUT');
              })
            }
          >
            {t.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <label className="hidden sm:flex items-center gap-1.5 text-[12px] text-ink3">
            Min amount
            <input
              className="input !w-[110px] !py-1.5 !text-[12.5px] mono"
              placeholder="1000000"
              value={minAmount}
              onChange={(e) => {
                setMinAmount(e.target.value.replace(/[^\d]/g, ''));
                setParam('min_amount', e.target.value.replace(/[^\d]/g, '') || null);
              }}
            />
          </label>
        </div>
      </div>

      {/* active NL filter chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mt-3 anim-fade-in">
          <span className="text-[11.5px] text-ink3 uppercase tracking-wider font-semibold">Filters</span>
          {chips.map((c) => (
            <button key={c.key} className="chip !py-1 !text-[12px]" onClick={c.clear}>
              {c.label} <X size={12} />
            </button>
          ))}
        </div>
      )}

      {/* grouped list */}
      <div className="card mt-4 overflow-hidden anim-fade-up" style={{ animationDelay: '60ms' }}>
        {grouped.map((g) => (
          <div key={g.label}>
            <div className="px-5 py-2 bg-panel2 border-y border-line first:border-t-0">
              <span className="kicker">{g.label}</span>
            </div>
            <div className="divide-y divide-line">
              {g.items.map((t) => (
                <button
                  key={t.id}
                  className="w-full flex items-center gap-3.5 px-5 py-3 hover:bg-panel2 transition text-left"
                  onClick={() => setPanel(t)}
                >
                  <span
                    className={cn(
                      'w-9 h-9 rounded-lg grid place-items-center text-[11.5px] font-bold shrink-0 border',
                      t.status === 'FAILED' ? 'bg-danger/10 text-danger border-danger/30' : 'bg-panel2 text-ink2 border-line'
                    )}
                  >
                    {initials(t.counterparty)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium text-ink truncate">{t.counterparty}</span>
                    <span className="block text-[11.5px] text-ink3 truncate">
                      {t.category} · {t.description}
                    </span>
                  </span>
                  <span className="hidden sm:block text-[11.5px] text-ink3 mono shrink-0 w-[74px] text-right">
                    {new Date(t.initiated_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-right shrink-0">
                    <span className={cn('block mono text-[14px] font-semibold', t.direction === 'IN' ? 'text-success' : t.status === 'FAILED' ? 'text-danger' : 'text-ink')}>
                      {t.direction === 'IN' ? '+' : '−'}{naira(t.amount)}
                    </span>
                    <span className={cn('block text-[10.5px]', t.status === 'FAILED' ? 'text-danger' : 'text-ink3')}>
                      {t.status === 'FAILED' ? 'Failed' : t.status === 'PROCESSING' ? 'Processing' : 'Successful'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {rows != null && rows.length === 0 && (
          <div className="px-5 py-12 text-center">
            <div className="text-[14.5px] font-medium">No transactions match</div>
            <div className="text-[13px] text-ink3 mt-1">Try clearing a filter or ask the command bar.</div>
          </div>
        )}
        {rows == null && <div className="px-5 py-10 text-center text-[13px] text-ink3">Loading…</div>}
      </div>

      {/* side panel */}
      {panel && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 anim-fade-in" onClick={() => setPanel(null)} />
          <aside className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[420px] sheet anim-sheet-in flex flex-col">
            <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-line">
              <div>
                <div className="kicker">Transaction</div>
                <div className="mono text-[13px] text-ink2 mt-0.5">{panel.ref}</div>
              </div>
              <button className="btn btn-ghost btn-sm !px-2" onClick={() => setPanel(null)} aria-label="Close">
                <X size={16} />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="text-center">
                <div className={cn('mono text-[32px] font-bold tracking-tight', panel.direction === 'IN' ? 'text-success' : panel.status === 'FAILED' ? 'text-danger' : '')}>
                  {panel.direction === 'IN' ? '+' : '−'}{naira(panel.amount)}
                </div>
                <div className="mt-2"><StatusBadge status={panel.status} /></div>
              </div>

              <div className="card mt-5 divide-y divide-line">
                <PRow label="Counterparty" value={panel.counterparty} />
                <PRow label="Description" value={panel.description} />
                <PRow label="Category" value={panel.category} />
                <PRow label="Direction" value={panel.direction === 'IN' ? 'Money in' : 'Money out'} />
                <PRow label="Bank" value={panel.bank_name ? `${panel.bank_name} ••••${panel.account_mask ?? ''}` : '—'} />
                <PRow label="Reference" value={panel.provider_reference || panel.internal_reference || panel.ref} mono />
                <PRow label="Date" value={fmtDateTime(panel.initiated_at)} />
                {panel.completed_at && <PRow label="Settled" value={fmtDateTime(panel.completed_at)} />}
                {panel.failure_reason && <PRow label="Failure reason" value={panel.failure_reason} danger />}
              </div>

              {panel.payment_request_id && (
                <a href={`/payments/${panel.payment_request_id}`} className="btn btn-secondary w-full mt-4">
                  Open linked payment
                </a>
              )}
            </div>
            <footer className="border-t border-line px-5 py-3 text-[10.5px] text-ink3 text-center tracking-wide">
              SANDBOX · transaction detail
            </footer>
          </aside>
        </>
      )}
    </div>
  );
}

function PRow({ label, value, mono, danger }: { label: string; value: string; mono?: boolean; danger?: boolean }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-2.5 text-[13px]">
      <span className="text-ink3 shrink-0">{label}</span>
      <span className={cn('text-right truncate', mono && 'mono', danger ? 'text-danger' : 'text-ink')}>{value}</span>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}
