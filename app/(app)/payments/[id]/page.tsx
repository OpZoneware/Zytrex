'use client';

// Payment detail: policy, approvals, lifecycle timeline, audit trail, receipt.

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, Clock, ShieldCheck, UserCog } from 'lucide-react';
import { RiskBadge, StatusBadge } from '@/components/ui/badge';
import { fmtDateTime, naira } from '@/lib/format';
import { ROLE_LABELS, type Role } from '@/lib/types';
import { useSession } from '@/components/shell/session';
import { useToast } from '@/components/ui/toast';
import { useCommand } from '@/components/command/CommandContext';
import { Receipt, receiptText, type ReceiptData } from '@/components/payments/Receipt';

interface Detail {
  id: string;
  ref: string;
  status: string;
  amount: number;
  purpose: string;
  beneficiary_name: string;
  bank_name: string;
  account_mask: string;
  verification_status: string;
  requested_by_name: string;
  authorized_by_name?: string;
  required_approvals: Role[];
  outstanding: Role[];
  risk: string;
  created_at: string;
  approvals: { approver_name: string; role: Role; decision: string; at: string }[];
  events: { status: string; note: string; at: string }[];
  viewer_can_approve: boolean;
  viewer_can_authorize: boolean;
  viewer_is_requester: boolean;
  transaction: { ref: string; provider_reference?: string; completed_at?: string } | null;
}

export default function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, users, switchUser, refresh } = useSession();
  const { toast } = useToast();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [auditRows, setAuditRows] = useState<{ id: string; at: string; actor: string; action: string; details: string; severity: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const { openFlow } = useCommand();

  const load = useCallback(async () => {
    const r = await fetch(`/api/payments/${id}`).then((x) => x.json());
    if (r.ok) setDetail(r.payment);
    const a = await fetch(`/api/audit?payment_id=${id}`).then((x) => x.json());
    if (a.ok) setAuditRows(a.entries);
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  async function decide(decision: 'APPROVED' | 'REJECTED', asUserId?: string) {
    setBusy(true);
    try {
      if (asUserId && asUserId !== user?.id) await switchUser(asUserId);
      const r = await fetch(`/api/payments/${id}/approvals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const d = await r.json();
      if (d.ok) toast('success', decision === 'APPROVED' ? 'Approved' : 'Rejected', `${detail?.ref} updated`);
      else toast('error', 'Cannot proceed', d.error);
      await load();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!detail) return <div className="text-ink3 text-sm">Loading payment…</div>;

  const receiptData: ReceiptData | null =
    detail.status === 'SUCCESSFUL' && detail.transaction
      ? {
          ref: detail.ref,
          amount: detail.amount,
          beneficiary_name: detail.beneficiary_name,
          bank_name: detail.bank_name,
          account_mask: detail.account_mask,
          purpose: detail.purpose,
          provider_reference: detail.transaction.provider_reference,
          initiated_by: detail.requested_by_name,
          authorized_by: detail.authorized_by_name ?? '—',
          completed_at: detail.transaction.completed_at ?? detail.created_at,
        }
      : null;

  const substitute = users.find(
    (u) => u.id !== user?.id && detail.outstanding.length > 0 && u.role !== 'auditor' && u.role !== detail.requested_by_name
  );

  return (
    <div className="max-w-4xl mx-auto space-y-5 anim-fade-in">
      <Link href="/payments" className="inline-flex items-center gap-1.5 text-[13px] text-ink3 hover:text-ink transition">
        <ArrowLeft size={14} /> All payments
      </Link>

      <div className="card p-6 relative overflow-hidden">
        <div
          className="absolute -right-20 -top-20 w-64 h-64 rounded-full pointer-events-none"
          style={{
            background:
              detail.status === 'SUCCESSFUL'
                ? 'radial-gradient(circle, rgba(4,120,87,.10), transparent 65%)'
                : detail.status === 'CANCELLED' || detail.status === 'FAILED'
                  ? 'radial-gradient(circle, rgba(244,91,105,.1), transparent 65%)'
                  : 'radial-gradient(circle, rgba(180,138,247,.1), transparent 65%)',
          }}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="mono text-[13px] text-ink2">{detail.ref}</span>
              <StatusBadge status={detail.status} />
              <RiskBadge risk={detail.risk} />
            </div>
            <div className="text-[36px] font-bold mono tracking-tight mt-3 leading-none">{naira(detail.amount)}</div>
            <div className="text-[16px] font-semibold mt-2.5">{detail.beneficiary_name}</div>
            <div className="text-[13px] text-ink3">
              {detail.bank_name} ••••{detail.account_mask} · {detail.verification_status}
            </div>
            <div className="text-[13px] text-ink2 mt-3">
              <span className="text-ink3">Purpose: </span>
              {detail.purpose}
            </div>
          </div>
          <div className="text-right text-[12.5px] text-ink3 space-y-1">
            <div>Created {fmtDateTime(detail.created_at)}</div>
            <div>By {detail.requested_by_name}</div>
            {detail.authorized_by_name && <div className="text-accent">Authorized by {detail.authorized_by_name}</div>}
          </div>
        </div>

        {/* actions */}
        {detail.status === 'AWAITING_APPROVAL' && (
          <div className="relative mt-5 pt-5 border-t border-line">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1.5 mr-2 flex-wrap">
                {detail.required_approvals.map((r) => {
                  const done = !detail.outstanding.includes(r);
                  return (
                    <span key={r} className={`text-[11.5px] font-semibold rounded-md border px-2 py-1 inline-flex items-center gap-1 ${done ? 'border-accent/40 bg-accent/10 text-accent' : 'border-warn/40 bg-warn/10 text-warn'}`}>
                      {done ? <Check size={11} /> : <Clock size={11} />} {ROLE_LABELS[r]}
                    </span>
                  );
                })}
              </div>
              {detail.viewer_can_approve && (
                <>
                  <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => decide('APPROVED')}>
                    Approve
                  </button>
                  <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => decide('REJECTED')}>
                    Reject
                  </button>
                </>
              )}
              {!detail.viewer_can_approve && substitute && (
                <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => decide('APPROVED', substitute.id)}>
                  <UserCog size={13} /> Approve as {substitute.name.split(' ')[0]}
                </button>
              )}
              {!detail.viewer_can_approve && !substitute && (
                <span className="text-[12.5px] text-ink3">
                  {detail.viewer_is_requester ? 'Maker-checker: you requested this payment.' : `Waiting on ${detail.outstanding.map((o) => ROLE_LABELS[o]).join(' + ')}.`}
                </span>
              )}
            </div>
          </div>
        )}

        {detail.status === 'AWAITING_AUTHORIZATION' && (
          <div className="relative mt-5 pt-5 border-t border-line flex items-center gap-3">
            <div className="text-[13px] text-ink2 flex-1">
              Fully approved — ready for final authorization (6-digit PIN, outside the AI).
            </div>
            {detail.viewer_can_authorize ? (
              <button className="btn btn-primary glow-accent" onClick={() => openFlow({ paymentId: id, initial: 'confirm', onClosed: () => void load() })}>
                <ShieldCheck size={15} /> Authorize
              </button>
            ) : (
              <span className="text-[12.5px] text-ink3">Requires CEO / Finance / Director login.</span>
            )}
          </div>
        )}

        {(detail.status === 'AUTHORIZED' || detail.status === 'PROCESSING') && (
          <div className="relative mt-5 pt-5 border-t border-line text-[13px] text-info">Processing via Zytrex Payments…</div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* lifecycle */}
        <div className="card p-5">
          <div className="text-[12px] uppercase tracking-wider text-ink3 font-semibold mb-4">State machine</div>
          <div className="space-y-0">
            {detail.events.map((e, i) => (
              <div key={i} className="flex gap-3.5">
                <div className="flex flex-col items-center">
                  <span
                    className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                      e.status === 'FAILED' || e.status === 'CANCELLED' ? 'bg-danger' : e.status === 'SUCCESSFUL' ? 'bg-accent' : 'bg-info'
                    }`}
                  />
                  {i < detail.events.length - 1 && <span className="w-px flex-1 bg-line my-1" />}
                </div>
                <div className="pb-5 min-w-0">
                  <div className="text-[12.5px] font-semibold">
                    {e.status.replace(/_/g, ' ')} <span className="text-ink3 font-normal mono text-[11px] ml-1.5">{fmtDateTime(e.at)}</span>
                  </div>
                  <div className="text-[12.5px] text-ink2 mt-0.5">{e.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* audit + receipt */}
        <div className="space-y-5">
          {receiptData && (
            <div>
              <div className="text-[12px] uppercase tracking-wider text-ink3 font-semibold mb-3">Receipt</div>
              <Receipt
                data={receiptData}
                onDownload={() => {
                  const blob = new Blob([receiptText(receiptData)], { type: 'text/plain' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `${receiptData.ref}-receipt.txt`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
                onShare={() => {
                  const blob = new Blob([receiptText(receiptData)], { type: 'text/plain' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `${receiptData.ref}-receipt.txt`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
              />
            </div>
          )}

          <div className="card p-5">
            <div className="text-[12px] uppercase tracking-wider text-ink3 font-semibold mb-3">Audit trail (sandbox session)</div>
            <div className="space-y-2.5">
              {auditRows.map((a) => (
                <div key={a.id} className="text-[12.5px] flex gap-3">
                  <span className="mono text-ink3 shrink-0">{fmtDateTime(a.at)}</span>
                  <span className="text-ink2 min-w-0">
                    <span className="text-ink font-medium">{a.actor}</span> — {a.details}
                  </span>
                </div>
              ))}
              {auditRows.length === 0 && <div className="text-[12.5px] text-ink3">No audit entries.</div>}
            </div>
            <Link href={`/audit?payment=${id}`} className="text-[12px] text-accent hover:underline inline-flex items-center gap-1 mt-3">
              Open in Audit Log
            </Link>
          </div>
        </div>
      </div>

    </div>
  );
}
