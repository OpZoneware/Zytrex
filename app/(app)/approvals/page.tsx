'use client';

// Approvals queue — approve / reject / authorize, with maker-checker and
// role substitution made visible (and switchable, for the sandbox demo).

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Clock, ShieldCheck, UserCog } from 'lucide-react';
import { useSession } from '@/components/shell/session';
import { useToast } from '@/components/ui/toast';
import { Badge, RiskBadge, StatusBadge } from '@/components/ui/badge';
import { fmtDateTime, naira0 } from '@/lib/format';
import { ROLE_LABELS, type Role } from '@/lib/types';
import { useCommand } from '@/components/command/CommandContext';

interface Row {
  payment_id: string;
  ref: string;
  amount: number;
  purpose: string;
  status: string;
  risk: string;
  created_at: string;
  required_approvals: Role[];
  outstanding: Role[];
  beneficiary_name: string;
  requested_by: string;
  approvals: { role: Role; decision: string; at: string }[];
  actionable: boolean;
}

const SNIFF: Record<Role, Role[]> = {
  operations: ['operations'],
  finance: ['operations', 'finance'],
  owner: ['operations', 'finance', 'owner'],
  director: ['director'],
  auditor: [],
};

export default function ApprovalsPage() {
  const { user, users, switchUser, refresh } = useSession();
  const { openFlow, openBar } = useCommand();
  const { toast } = useToast();
  const [pending, setPending] = useState<Row[]>([]);
  const [ready, setReady] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [policies, setPolicies] = useState<{ tiers: { label: string; roles: Role[] }[] } | null>(null);

  const load = useCallback(async () => {
    try {
      const [aRes, pRes] = await Promise.all([fetch('/api/approvals'), fetch('/api/policies')]);
      const a = await aRes.json();
      if (a.ok) {
        setPending(a.pending);
        setReady(a.ready_to_authorize);
      }
      const p = await pRes.json();
      if (p.ok) setPolicies(p.policies);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function decide(row: Row, decision: 'APPROVED' | 'REJECTED', asUserId?: string) {
    setBusy(row.payment_id + decision);
    try {
      if (asUserId && asUserId !== user?.id) await switchUser(asUserId);
      const r = await fetch(`/api/payments/${row.payment_id}/approvals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const d = await r.json();
      if (d.ok) toast(decision === 'APPROVED' ? 'success' : 'info', decision === 'APPROVED' ? `${row.ref} approved` : `${row.ref} rejected`);
      else toast('error', 'Cannot proceed', d.error);
      await load();
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  function openAuthorize(row: Row) {
    openFlow({ paymentId: row.payment_id, initial: 'confirm', onClosed: () => void load() });
  }

  const substituteFor = (roles: Role[], excludeId?: string) => {
    const need = roles[0];
    return users.find((u) => u.id !== user?.id && u.id !== excludeId && (SNIFF[u.role] ?? []).includes(need));
  };

  const mine = pending.filter((r) => r.actionable);
  const others = pending.filter((r) => !r.actionable);

  return (
    <div className="space-y-6 anim-fade-in max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Approvals</h2>
          <p className="text-ink3 text-[13px] mt-1">
            Viewing as <span className="text-ink2 font-medium">{user?.name}</span> ·{' '}
            {user ? ROLE_LABELS[user.role] : ''} — maker-checker enforced, roles cannot approve their own requests.
          </p>
        </div>
        <div className="flex gap-2 text-[12px]">
          <span className="chip cursor-default">
            <Clock size={12} className="text-warn" /> {pending.length} pending
          </span>
          <span className="chip cursor-default">
            <ShieldCheck size={12} className="text-violet" /> {ready.length} to authorize
          </span>
        </div>
      </div>

      {/* ready to authorize */}
      {ready.length > 0 && (
        <div>
          <SectionTitle icon={<ShieldCheck size={15} className="text-violet" />} title="Ready for authorization" subtitle="Fully approved — final PIN / hold step" />
          <div className="space-y-3">
            {ready.map((r) => (
              <div key={r.payment_id} className="card p-4 border-violet/30" style={{ borderColor: 'rgba(180,138,247,.3)' }}>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="mono text-[12px] text-ink3">{r.ref}</span>
                      <StatusBadge status={r.status} />
                      <RiskBadge risk={r.risk} />
                    </div>
                    <div className="text-[15px] font-semibold mt-1.5">{r.beneficiary_name}</div>
                    <div className="text-[12.5px] text-ink3">{r.purpose} · requested by {r.requested_by} · {fmtDateTime(r.created_at)}</div>
                  </div>
                  <div className="text-[22px] font-bold mono">{naira0(r.amount)}</div>
                  <div>
                    {r.actionable ? (
                      <button className="btn btn-primary glow-accent" onClick={() => openAuthorize(r)}>
                        <ShieldCheck size={15} /> Authorize
                      </button>
                    ) : (
                      <SwitchButton
                        user={users.find((u) => u.role === 'owner' || u.role === 'finance' || u.role === 'director')}
                        currentRole={user?.role}
                        onSwitch={async (id) => {
                          await switchUser(id);
                          toast('info', 'Account switched', 'You can now authorize this payment.');
                          await load();
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* pending approvals */}
      <div>
        <SectionTitle
          icon={<Clock size={15} className="text-warn" />}
          title="Awaiting approval"
          subtitle={`${pending.length} payment${pending.length === 1 ? '' : 's'} in the approval queue`}
        />
        {pending.length === 0 ? (
          <div className="card p-8 text-center">
            <CheckCircle2 size={28} className="text-success mx-auto mb-3" />
            <div className="text-[15px] font-semibold">Queue is clear</div>
            <div className="text-[13px] text-ink3 mt-1">No payments are waiting for approval.</div>
            <button className="btn btn-secondary btn-sm mt-4" onClick={() => openBar('Show my payments to ')}>
              Open the command bar <ArrowRight size={13} />
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {[...mine, ...others].map((r) => (
              <div key={r.payment_id} className="card p-4 card-hover">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="mono text-[12px] text-ink3">{r.ref}</span>
                      <StatusBadge status={r.status} />
                      <RiskBadge risk={r.risk} />
                    </div>
                    <div className="text-[15px] font-semibold mt-1.5">{r.beneficiary_name}</div>
                    <div className="text-[12.5px] text-ink3">
                      {r.purpose} · by {r.requested_by} · {fmtDateTime(r.created_at)}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {r.required_approvals.map((role) => {
                        const granted = !r.outstanding.includes(role);
                        return (
                          <span
                            key={role}
                            className={`inline-flex items-center gap-1 text-[11.5px] font-semibold rounded-md border px-2 py-1 ${
                              granted ? 'border-accent/40 bg-accent/10 text-accent' : 'border-warn/40 bg-warn/10 text-warn'
                            }`}
                          >
                            {granted ? <Check size={11} /> : <Clock size={11} />} {ROLE_LABELS[role]}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[22px] font-bold mono">{naira0(r.amount)}</div>
                    <div className="text-[11px] text-ink3 mt-0.5">{r.outstanding.length > 0 ? `needs ${r.outstanding.map((o) => ROLE_LABELS[o]).join(' + ')}` : ''}</div>
                  </div>
                  <div className="flex flex-col gap-2 min-w-[170px]">
                    {r.actionable ? (
                      <>
                        <button className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => decide(r, 'APPROVED')}>
                          {busy === r.payment_id + 'APPROVED' ? 'Approving…' : 'Approve'}
                        </button>
                        <button className="btn btn-danger btn-sm" disabled={busy !== null} onClick={() => decide(r, 'REJECTED')}>
                          Reject
                        </button>
                      </>
                    ) : (
                      <SwitchApproveButton
                        row={r}
                        substitute={substituteFor(r.outstanding, r.requested_by)}
                        isRequester={user?.name === r.requested_by}
                        onSwitchApprove={(id) => decide(r, 'APPROVED', id)}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* policy panel */}
      {policies && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[12px] uppercase tracking-wider text-ink3 font-semibold">Company approval policy</div>
            <Link href="/settings?tab=policies" className="text-[12px] text-accent hover:underline inline-flex items-center gap-1">
              Edit <ArrowRight size={12} />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {policies.tiers.map((t) => (
              <div key={t.label} className="rounded-lg border border-line bg-panel2 p-3">
                <div className="text-[12px] font-semibold text-ink2 mono">{t.label}</div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {t.roles.map((r) => (
                    <Badge key={r} tone="blue">
                      {ROLE_LABELS[r]}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="text-[11.5px] text-ink3 mt-3 flex items-start gap-1.5">
            <AlertTriangle size={13} className="text-warn shrink-0 mt-0.5" />
            Unverified beneficiaries always require Finance + CEO approval regardless of amount. Final authorization (PIN/passkey) is
            separate from approval.
          </div>
        </div>
      )}

    </div>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      {icon}
      <div>
        <h3 className="text-[15px] font-semibold leading-tight">{title}</h3>
        <p className="text-[12px] text-ink3">{subtitle}</p>
      </div>
    </div>
  );
}

function SwitchApproveButton({
  row,
  substitute,
  isRequester,
  onSwitchApprove,
}: {
  row: Row;
  substitute?: { id: string; name: string; role: Role };
  isRequester: boolean;
  onSwitchApprove: (id: string) => void;
}) {
  if (substitute) {
    return (
      <button className="btn btn-secondary btn-sm" onClick={() => onSwitchApprove(substitute.id)} title="Sandbox convenience: switch accounts to satisfy the policy">
        <UserCog size={13} /> Approve as {substitute.name.split(' ')[0]}
      </button>
    );
  }
  return (
    <div className="text-[12px] text-ink3 leading-snug px-1">
      {isRequester ? 'Maker-checker: you requested this —' : 'Not required from your role —'}
      <br />
      needs {row.outstanding.map((o) => ROLE_LABELS[o]).join(' + ')}.
    </div>
  );
}

function SwitchButton({
  user,
  currentRole,
  onSwitch,
}: {
  user?: { id: string; name: string };
  currentRole?: Role;
  onSwitch: (id: string) => void;
}) {
  if (!user) return null;
  if (currentRole === 'owner' || currentRole === 'finance' || currentRole === 'director') {
    return <div className="text-[12px] text-ink3 px-1">Ready — open the payment to authorize.</div>;
  }
  return (
    <button className="btn btn-secondary btn-sm" onClick={() => onSwitch(user.id)}>
      <UserCog size={13} /> Switch to {user.name.split(' ')[0]}
    </button>
  );
}
