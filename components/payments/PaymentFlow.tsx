'use client';

// The task becomes the UI. A focused, full-screen surface for one payment:
// preview → approval (maker-checker) → deliberate confirmation (fee math)
// → VERIFY IT'S YOU keypad → processing → payment sent.
// No chat bubbles anywhere in this flow.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDialog } from '@/components/ui/useDialog';
import { canSatisfy } from '@/lib/policies';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Delete, ShieldCheck, X } from 'lucide-react';
import type { ChatCard, PaymentStatus, Role } from '@/lib/types';
import { ROLE_LABELS } from '@/lib/types';
import { naira } from '@/lib/format';
import { cn } from '@/lib/utils';
import { RiskBadge } from '@/components/ui/badge';
import { useSession } from '@/components/shell/session';
import { useToast } from '@/components/ui/toast';

export type FlowStage = 'preview' | 'approval' | 'confirm' | 'pin' | 'processing' | 'success' | 'failed';

export interface FlowData {
  paymentId?: string;
  preview?: Extract<ChatCard, { kind: 'transfer_preview' }>;
  initial?: FlowStage;
  onClosed?: () => void;
}

interface PaymentDetail {
  id: string;
  ref: string;
  amount: number;
  fee?: number;
  purpose: string;
  status: PaymentStatus;
  required_approvals: Role[];
  outstanding: Role[];
  approvals: { approver_id: string; role: Role; decision: string; at: string }[];
  beneficiary_name: string;
  beneficiary_account_name: string;
  bank_name: string;
  account_mask: string;
  verification_status: string;
  requested_by: string;
  requested_by_name: string;
  authorized_by_name?: string;
  viewer_can_approve: boolean;
  viewer_can_authorize: boolean;
  viewer_is_requester: boolean;
  transaction?: { provider_reference?: string; completed_at?: string } | null;
}

interface AppUser {
  id: string;
  name: string;
  role: Role;
  initials: string;
  color: string;
}

export function PaymentFlow({ data, onClose: rawClose }: { data: FlowData; onClose: () => void }) {
  const onClose = () => {
    data.onClosed?.();
    rawClose();
  };
  const router = useRouter();
  const { user, switchUser, refresh: refreshSession } = useSession();
  const { toast } = useToast();

  const [stage, setStage] = useState<FlowStage>(data.initial ?? (data.preview ? 'preview' : 'confirm'));
  const preview = data.preview ?? null;
  const [detail, setDetail] = useState<PaymentDetail | null>(null);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [pinErr, setPinErr] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const loaded = useRef(false);

  const dialogRef = useDialog(true, () => { if (!busy) onClose(); });
  const fee = detail?.fee ?? 50;

  const load = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/payments/${id}`).then((x) => x.json());
      if (r.ok) {
        setDetail(r.payment);
        setAppUsers(r.users ?? []);
        return r.payment as PaymentDetail;
      }
    } catch {
      /* keep previous */
    }
    return null;
  }, []);

  // initial load
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    if (data.paymentId) {
      void load(data.paymentId).then((p) => {
        if (!p) {
          setError('Payment not found.');
          return;
        }
        if (!data.initial) {
          if (p.status === 'AWAITING_APPROVAL') setStage('approval');
          else if (p.status === 'AWAITING_AUTHORIZATION') setStage('confirm');
          else if (p.status === 'SUCCESSFUL') setStage('success');
          else if (p.status === 'FAILED' || p.status === 'DECLINED') setStage('failed');
        }
      });
    }
    fetch('/api/stats')
      .then((x) => x.json())
      .then((s) => { if (s?.stats) setBalance(s.stats.available_balance); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // poll while waiting on approval (approver may act in another tab / the approvals page)
  useEffect(() => {
    if (!['approval', 'processing'].includes(stage) || !(detail?.id ?? data.paymentId)) return;
    const t = setInterval(async () => {
      const p = await load((detail?.id ?? data.paymentId)!);
      if (p?.status === 'SUCCESSFUL') setStage('success');
      if (p && p.status === 'AWAITING_AUTHORIZATION') setStage('confirm');
      if (p && (p.status === 'FAILED' || p.status === 'CANCELLED')) setStage('failed');
    }, 2500);
    return () => clearInterval(t);
  }, [stage, data.paymentId, detail?.id, load]);

  // ---------- stage: preview ----------
  async function prepare() {
    if (!preview || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'action',
          action: 'prepare_payment',
          payload: { beneficiary_id: preview.beneficiary.id, amount: preview.amount, purpose: preview.purpose },
        }),
      }).then((x) => x.json());
      if (!r.ok) {
        setError(r.error ?? 'Could not prepare the payment.');
        return;
      }
      const payCard = (r.message?.cards ?? []).find((c: ChatCard) => c.kind === 'payment');
      const id = payCard && payCard.kind === 'payment' ? payCard.payment_id : null;
      if (!id) {
        setError(r.message?.text ?? 'Could not prepare the payment.');
        return;
      }
      await load(id);
      setStage('approval');
    } catch {
      setError('Network error — try again.');
    } finally {
      setBusy(false);
    }
  }

  // ---------- stage: approval ----------
  function candidateApprover(): AppUser | null {
    if (!detail) return null;
    const outstanding = detail.outstanding?.length ? detail.outstanding : detail.required_approvals;
    const sat = (role: Role, req: Role) =>
      canSatisfy(role, req);
    return (
      appUsers.find(
        (u) => u.id !== detail.requested_by && u.role !== 'auditor' && outstanding.some((req) => sat(u.role, req))
      ) ?? null
    );
  }

  async function approve() {
    if (!detail || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!detail.viewer_can_approve) {
        const c = candidateApprover();
        if (!c) {
          setError('No eligible approver available in this sandbox.');
          return;
        }
        if (user?.id !== c.id) await switchUser(c.id);
        await load(detail.id);
        return; // A role switch never also approves the payment.
      }
      const r = await fetch(`/api/payments/${detail.id}/approvals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'APPROVED' }),
      }).then((x) => x.json());
      if (!r.ok) {
        setError(r.error ?? 'Approval failed.');
        return;
      }
      const p = await load(detail.id);
      await refreshSession();
      if (p?.status === 'AWAITING_AUTHORIZATION') setStage('confirm');
    } catch {
      setError('Network error — try again.');
    } finally {
      setBusy(false);
    }
  }

  async function cancelRequest() {
    if (!detail || busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'action', action: 'cancel_payment', payload: { payment_id: detail.id } }),
      });
      const result = await response.json();
      await load(detail.id);
      if (!result.ok || !result.message?.text?.startsWith('Payment request cancelled')) { setError(result.error ?? result.message?.text ?? 'Cancellation failed.'); return; }
      toast('info', 'Payment cancelled', `${detail.ref} was cancelled`);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  // ---------- stage: confirm → pin ----------
  function candidateAuthorizer(): AppUser | null {
    if (!detail) return null;
    return appUsers.find((u) => ['owner', 'director', 'finance'].includes(u.role)) ?? null;
  }

  async function goAuthorize() {
    if (!detail) return;
    if (!detail.viewer_can_authorize) {
      const c = candidateAuthorizer();
      if (c && user?.id !== c.id) {
        await switchUser(c.id);
        await load(detail.id);
        return;
      }
      setError('This account cannot authorize payments.');
      return;
    }
    setError(null);
    setPin('');
    setPinErr(null);
    setStage('pin');
  }

  function press(d: string) {
    if (pin.length >= 6) return;
    const next = pin + d;
    setPin(next);
    setPinErr(null);
    if (next.length === 6) {
      setTimeout(() => {
        void submitPinValue(next);
      }, 140);
    }
  }

  async function submitPinValue(p: string) {
    if (!detail) return;
    setBusy(true);
    setPinErr(null);
    setStage('processing');
    try {
      const r = await fetch(`/api/payments/${detail.id}/authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: p }),
      }).then((x) => x.json());
      if (!r.ok) {
        const latest = await load(detail.id);
        if (latest?.status === 'PROCESSING') { setError(r.error); setBusy(false); return; }
        setStage('pin');
        setPinErr(r.error ?? 'Authorization could not complete.');
        setPin('');
        setShake(true);
        setTimeout(() => setShake(false), 400);
        setBusy(false);
        return;
      }
      setStage('processing');
      const minDelay = new Promise((r2) => setTimeout(r2, 1100));
      const [pd] = await Promise.all([load(detail.id), minDelay]);
      await refreshSession();
      if (pd?.status === 'SUCCESSFUL') {
        setStage('success');
        toast('success', 'Payment confirmed', `${pd.ref} settled via Zytrex Payments (sandbox)`);
      } else {
        setStage('failed');
        setError('Payment failed at the gateway.');
      }
    } catch {
      setStage('processing');
      setError('Awaiting confirmation. Check payment status before making another payment.');
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  // ---------- render helpers ----------
  const amount = preview?.amount ?? detail?.amount ?? 0;
  const balanceAfter = balance != null ? balance - amount - fee : null;

  return (
    <div ref={dialogRef} tabIndex={-1} aria-label="Payment authorization" className="fixed inset-0 z-[90] flex items-center justify-center p-4 anim-fade-in" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-[#0b0d12]/60 backdrop-blur-[3px]" onClick={() => !busy && onClose()} />
      <div className={cn('relative w-full max-w-[430px] max-h-[calc(100dvh-32px)] overflow-y-auto focus-panel anim-zoom-in', shake && 'anim-shake')}>
        {/* sandbox strip */}
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="badge bg-panel2 text-ink2 border border-line2">Sandbox</span>
          <button
            className="w-7 h-7 rounded-lg grid place-items-center text-ink3 hover:text-ink hover:bg-panel2 transition"
            onClick={() => !busy && onClose()}
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        {/* ---------------- PREVIEW ---------------- */}
        {stage === 'preview' && preview && (
          <div className="px-6 pb-6 pt-3 text-center">
            <div className="kicker">Payment</div>
            <div className="mono text-[40px] font-bold tracking-tight mt-1 num">{naira(preview.amount)}</div>
            <div className="text-[16px] font-semibold mt-3">{preview.beneficiary.name}</div>
            <div className="text-[13px] text-ink3 mt-0.5">
              {preview.beneficiary.bank_name} •••• {preview.beneficiary.account_mask}
            </div>
            <div className="text-[13.5px] text-ink2 mt-3">{preview.purpose}</div>

            <div className="flex items-center justify-center gap-2 mt-3">
              {preview.beneficiary.verification_status === 'VERIFIED' ? (
                <span className="badge bg-success/10 text-success border border-success/30">✓ Verified beneficiary</span>
              ) : (
                <span className="badge bg-warn/10 text-warn border border-warn/30">Unverified beneficiary</span>
              )}
              <RiskBadge risk={preview.risk} />
            </div>

            {preview.policy_notes.length > 0 && (
              <div className="mt-4 rounded-xl bg-panel2 border border-line px-4 py-3 text-left space-y-1.5">
                {preview.policy_notes.slice(0, 3).map((n, i) => (
                  <div key={i} className="flex gap-2 text-[12px] text-ink2 leading-snug">
                    <ShieldCheck size={13} className="text-accent shrink-0 mt-0.5" />
                    <span>{n}</span>
                  </div>
                ))}
              </div>
            )}

            {error && <div className="mt-3 text-[12.5px] text-danger">{error}</div>}

            <button className="btn btn-primary btn-lg w-full mt-5" onClick={prepare} disabled={busy}>
              {busy ? 'Preparing…' : 'Continue'} <ArrowRight size={16} />
            </button>
            <button className="btn btn-ghost w-full mt-1.5" onClick={onClose}>
              Cancel
            </button>
          </div>
        )}

        {/* ---------------- APPROVAL ---------------- */}
        {stage === 'approval' && detail && (
          <div className="px-6 pb-6 pt-3">
            <div className="text-center">
              <div className="kicker text-warn">Awaiting approval</div>
              <div className="mono text-[34px] font-bold tracking-tight mt-1 num">{naira(detail.amount)}</div>
              <div className="text-[15px] font-semibold">{detail.beneficiary_name}</div>
              <div className="text-[12.5px] text-ink3">{detail.bank_name} ••••{detail.account_mask} · {detail.purpose}</div>
              <div className="flex justify-center gap-1.5 mt-3 flex-wrap">
                {detail.required_approvals.map((r) => (
                  <span key={r} className="badge bg-warn/10 text-warn border border-warn/30">{ROLE_LABELS[r]} approval</span>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-line divide-y divide-line">
              {detail.approvals.filter((a) => a.decision === 'APPROVED').map((a, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                  <span className="text-success font-medium">✓ {ROLE_LABELS[a.role]} approved</span>
                  <span className="text-ink3 text-[11.5px] mono">{new Date(a.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
              {detail.outstanding.map((r) => (
                <div key={r} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                  <span className="text-warn font-medium">● {ROLE_LABELS[r]} approval pending</span>
                  <span className="text-ink3 text-[11.5px]">waiting</span>
                </div>
              ))}
            </div>

            <p className="text-[12px] text-ink3 text-center mt-3 leading-relaxed">
              The AI prepared this payment — approvals stay with people. Maker-checker rules apply.
            </p>

            {error && <div className="mt-2 text-[12.5px] text-danger text-center">{error}</div>}

            <button className="btn btn-primary btn-lg w-full mt-4" onClick={approve} disabled={busy}>
              {busy
                ? 'Approving…'
                : detail.viewer_can_approve
                ? 'Approve payment'
                : `Switch demo role to ${candidateApprover()?.name ?? 'approver'}`}
            </button>
            {(detail.viewer_is_requester || user?.role === 'owner') && (
              <button className="btn btn-ghost w-full mt-1.5" onClick={cancelRequest} disabled={busy}>
                Cancel request
              </button>
            )}
            <div className="text-center text-[11px] text-ink3 mt-2">
              {detail.ref} · session: {user?.name}
            </div>
          </div>
        )}

        {/* ---------------- CONFIRM (spec §6) ---------------- */}
        {stage === 'confirm' && detail && (
          <div className="px-6 pb-6 pt-3 text-center">
            <div className="kicker">Authorize payment</div>
            <div className="mono text-[40px] font-bold tracking-tight mt-2 num">{naira(detail.amount)}</div>
            <div className="text-[16px] font-semibold mt-3">{detail.beneficiary_name}</div>
            <div className="text-[13.5px] text-ink3 mt-0.5">{detail.bank_name}</div>
            <div className="text-[13.5px] text-ink3 mono tracking-[0.3em]">••••{detail.account_mask}</div>
            <div className="text-[13.5px] text-ink2 mt-3">{detail.purpose}</div>

            <div className="mt-5 pt-4 border-t border-line space-y-2.5 text-[13.5px]">
              <Line label="Available balance" value={balance != null ? naira(balance) : '—'} />
              <Line label="Fee" value={naira(fee)} />
              <div className="h-px bg-line" />
              <Line label="Balance after" value={balanceAfter != null ? naira(balanceAfter) : '—'} strong />
            </div>

            {error && <div className="mt-3 text-[12.5px] text-danger">{error}</div>}

            <button className="btn btn-primary btn-lg w-full mt-5" onClick={goAuthorize} disabled={busy}>
              Authorize payment
            </button>
            {!detail.viewer_can_authorize && (
              <p className="text-[11.5px] text-ink3 mt-2">
                Requires a Finance/CEO account — demo will switch to {candidateAuthorizer()?.name ?? 'an authorizer'}.
              </p>
            )}
            <button className="btn btn-ghost w-full mt-1.5" onClick={onClose}>
              Cancel
            </button>
          </div>
        )}

        {/* ---------------- PIN KEYPAD (spec §7) ---------------- */}
        {stage === 'pin' && detail && (
          <div className="px-6 pb-6 pt-3 text-center">
            <div className="kicker">Verify it&apos;s you</div>
            <div className="mono text-[28px] font-bold mt-2">{naira(detail.amount)}</div>
            <div className="text-[13px] text-ink3 mt-1">{detail.beneficiary_name}</div>

            <div className="flex justify-center gap-3 mt-5" role="group" aria-label="PIN">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span key={i} className={cn('pin-dot', i < pin.length && 'pin-dot-on')} />
              ))}
            </div>
            {pinErr && <div className="text-[12.5px] text-danger mt-2 anim-fade-in">{pinErr}</div>}
            {!pinErr && <div className="text-[11.5px] text-ink3 mt-2">Enter your 6-digit PIN · demo PIN 123456</div>}

            <div className="grid grid-cols-3 gap-2.5 mt-5">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
                <button key={k} className="keypad-key" onClick={() => press(k)} disabled={busy}>
                  {k}
                </button>
              ))}
              <button className="keypad-key" onClick={() => { setPin((p) => p.slice(0, -1)); setPinErr(null); }} disabled={busy || !pin} aria-label="Delete">
                <Delete size={19} />
              </button>
              <button className="keypad-key" onClick={() => press('0')} disabled={busy}>0</button>
              <span className="keypad-key !border-transparent !bg-transparent !cursor-default" aria-hidden />
            </div>

            <button className="btn btn-ghost w-full mt-4" onClick={() => setStage('confirm')} disabled={busy}>
              <ArrowLeft size={14} /> Back
            </button>
          </div>
        )}

        {/* ---------------- PROCESSING (spec §8) ---------------- */}
        {stage === 'processing' && detail && (
          <div className="px-6 pb-8 pt-6 text-center">
            <div className="mono text-[30px] font-bold tracking-tight num">{naira(detail.amount)}</div>
            <div className="relative w-16 h-16 mx-auto mt-6">
              <span className="absolute inset-0 rounded-full border-[3px] border-line" />
              <span className="absolute inset-0 rounded-full border-[3px] border-accent border-t-transparent anim-spin-slow" />
              <span className="absolute inset-0 grid place-items-center text-[16px] font-bold text-accent">Z</span>
            </div>
            <div className="text-[15px] font-semibold mt-5">Processing payment</div>
            <div className="text-[12.5px] text-ink3 mt-1">Simulated by Zytrex Payments</div>{error && <p role="status" className="text-xs text-warn mt-3">{error}</p>}
          </div>
        )}

        {/* ---------------- SUCCESS (spec §8) ---------------- */}
        {stage === 'success' && detail && (
          <div className="px-6 pb-6 pt-4 text-center">
            <div className="check-circle anim-zoom-in">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <div className="kicker text-success mt-4">Payment sent</div>
            <div className="mono text-[36px] font-bold tracking-tight mt-1 num">{naira(detail.amount)}</div>
            <div className="text-[15px] font-semibold mt-2">{detail.beneficiary_name}</div>
            <div className="text-[13px] text-ink3">{detail.bank_name} ••••{detail.account_mask}</div>
            {detail.transaction?.provider_reference && (
              <div className="text-[11.5px] text-ink3 mono mt-2">ref {detail.transaction.provider_reference}</div>
            )}

            <button
              className="btn btn-primary btn-lg w-full mt-6"
              onClick={() => { onClose(); router.push(`/payments/${detail.id}`); }}
            >
              View receipt <ArrowRight size={16} />
            </button>
            <button className="btn btn-ghost w-full mt-1.5" onClick={onClose}>
              Done
            </button>
          </div>
        )}

        {/* ---------------- FAILED ---------------- */}
        {stage === 'failed' && (
          <div className="px-6 pb-6 pt-4 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-danger/10 text-danger grid place-items-center">
              <X size={32} />
            </div>
            <div className="kicker text-danger mt-4">Payment failed</div>
            <p className="text-[13.5px] text-ink2 mt-2 px-2">{error ?? 'The gateway declined this transfer.'}</p>
            <button className="btn btn-secondary w-full mt-6" onClick={onClose}>
              Close
            </button>
          </div>
        )}

        {/* footer strip */}
        <div className="border-t border-line px-5 py-2.5 text-center text-[10.5px] text-ink3 tracking-wide">
          SANDBOX TRANSACTION — no real money moves · Demo PIN 123456 · simulated authorization
        </div>
      </div>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-ink3">{label}</span>
      <span className={cn('mono', strong ? 'font-bold text-[15px]' : 'font-medium')}>{value}</span>
    </div>
  );
}
