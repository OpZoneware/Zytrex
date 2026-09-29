'use client';

// Beneficiary directory with verification status and payment history.

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Building2, Plus, Search, ShieldCheck, ShieldAlert, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/components/shell/session';
import { fmtDateShort, naira0 } from '@/lib/format';
import { cn } from '@/lib/utils';

interface B {
  id: string;
  name: string;
  bank_name: string;
  account_mask: string;
  account_name: string;
  verification_status: string;
  risk_level: string;
  created_by_name: string;
  created_at: string;
  note?: string;
  total_paid: number;
  txn_count: number;
  pending_payments: number;
}

const BANKS = ['GTBank', 'Access Bank', 'Zenith Bank', 'UBA', 'First Bank', 'Union Bank', 'Fidelity', 'Kuda'];

export default function BeneficiariesPage() {
  const { user } = useSession();
  const { toast } = useToast();
  const [rows, setRows] = useState<B[]>([]);
  const [q, setQ] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', bank_name: 'GTBank', account_number: '' });
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/beneficiaries').then((x) => x.json());
    if (r.ok) setRows(r.beneficiaries);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addBeneficiary() {
    setSaving(true);
    try {
      const r = await fetch('/api/beneficiaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!d.ok) {
        toast('error', 'Could not add beneficiary', d.error);
        return;
      }
      toast('success', 'Beneficiary added', 'Status: UNVERIFIED — extra approval policy applies until the account is verified.');
      setAddOpen(false);
      setForm({ name: '', bank_name: 'GTBank', account_number: '' });
      await load();
    } finally {
      setSaving(false);
    }
  }

  const filtered = rows.filter((b) => b.name.toLowerCase().includes(q.toLowerCase()) || b.bank_name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-5 anim-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Beneficiaries</h2>
          <p className="text-ink3 text-[13px] mt-1">
            Company directory — unverified beneficiaries carry enhanced approval requirements.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink3" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="input pl-9 w-48 py-2 text-[13px]" />
          </div>
          <button className="btn btn-primary" onClick={() => setAddOpen(true)} disabled={user?.role === 'auditor'}>
            <Plus size={15} /> Add beneficiary
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((b) => {
          const verified = b.verification_status === 'VERIFIED';
          const open = expanded === b.id;
          return (
            <div
              key={b.id}
              className={cn('card card-hover p-4 cursor-pointer', !verified && 'border-warn/30')}
              onClick={() => setExpanded(open ? null : b.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={cn('w-10 h-10 rounded-xl grid place-items-center shrink-0 border', verified ? 'bg-accent/10 border-accent/30 text-accent' : 'bg-warn/10 border-warn/30 text-warn')}>
                    <Building2 size={17} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-[14.5px] truncate">{b.name}</div>
                    <div className="text-[12.5px] text-ink3">
                      {b.bank_name} ••••{b.account_mask}
                    </div>
                  </div>
                </div>
                <Badge tone={verified ? 'green' : 'amber'}>{b.verification_status}</Badge>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-4 pt-3.5 border-t border-line">
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider text-ink3">Total paid</div>
                  <div className="mono text-[14.5px] font-bold mt-0.5">{naira0(b.total_paid)}</div>
                </div>
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider text-ink3">Payments</div>
                  <div className="mono text-[14.5px] font-bold mt-0.5">{b.txn_count}</div>
                </div>
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider text-ink3">In flight</div>
                  <div className="mono text-[14.5px] font-bold mt-0.5">{b.pending_payments}</div>
                </div>
              </div>

              {open && (
                <div className="mt-3.5 pt-3.5 border-t border-line space-y-1.5 text-[12.5px] anim-fade-in" onClick={(e) => e.stopPropagation()}>
                  <Line label="Account name" value={b.account_name} />
                  <Line label="Verification" value={b.verification_status} />
                  <Line label="Risk level" value={b.risk_level} />
                  <Line label="Added by" value={`${b.created_by_name} · ${fmtDateShort(b.created_at)}`} />
                  {b.note && <Line label="Note" value={b.note} />}
                  {!verified && (
                    <div className="flex gap-2 text-[12px] text-warn bg-warn/10 border border-warn/30 rounded-lg p-2.5 mt-2 leading-relaxed">
                      <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                      Paying this beneficiary requires <b>Finance + CEO</b> approval until bank-account verification completes.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 text-[12.5px] text-ink3">
        <ShieldCheck size={14} className="text-accent" />
        Account numbers are stored masked in the sandbox; production encrypts them at rest and verifies via the bank rail before first payment.
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} width="max-w-md">
        <div className="p-6">
          <h3 className="text-[16px] font-bold flex items-center gap-2">
            <Users size={17} className="text-accent" /> Add beneficiary
          </h3>
          <p className="text-[12.5px] text-ink3 mt-1">New beneficiaries start as UNVERIFIED with enhanced approval policy.</p>

          <div className="space-y-3.5 mt-5">
            <div>
              <label className="text-[11.5px] text-ink2 font-semibold block mb-1.5">Account name / company</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Delta Steel Works" />
            </div>
            <div>
              <label className="text-[11.5px] text-ink2 font-semibold block mb-1.5">Bank</label>
              <select className="input" value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })}>
                {BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11.5px] text-ink2 font-semibold block mb-1.5">Account number (10 digits)</label>
              <input
                className="input mono"
                inputMode="numeric"
                maxLength={10}
                value={form.account_number}
                onChange={(e) => setForm({ ...form, account_number: e.target.value.replace(/\D/g, '') })}
                placeholder="0123456789"
              />
            </div>
            <div className="flex items-start gap-2 text-[12px] text-ink3 bg-panel2 border border-line rounded-lg p-3">
              <AlertTriangle size={14} className="text-warn shrink-0 mt-0.5" />
              In production the bank rail confirms the account name before verification. This is a sandbox stub.
            </div>
            <div className="flex gap-2 pt-1">
              <button className="btn btn-primary flex-1" disabled={saving || !form.name || form.account_number.length !== 10} onClick={addBeneficiary}>
                {saving ? 'Adding…' : 'Add as unverified'}
              </button>
              <button className="btn btn-ghost" onClick={() => setAddOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-ink3">{label}</span>
      <span className="text-ink2 text-right truncate">{value}</span>
    </div>
  );
}
