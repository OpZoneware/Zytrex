// Payment service — the ONLY place that moves a payment through its state machine.
// AI can call prepare; only this service + the authorization gate can advance funds.

import { getGateway } from '../gateway';
import { scenarioNow } from '../clock';
import { canApprove, canAuthorize, requiredApprovals, riskFor, outstandingRoles } from '../policies';
import { audit } from './audit';
import { db, newId, userById } from '../store';
import type { PaymentRequest, PaymentStatus, User } from '../types';

function event(paymentId: string, status: PaymentStatus, note: string) {
  const d = db();
  d.payment_events.push({
    id: newId('evt'),
    payment_request_id: paymentId,
    status,
    note,
    at: new Date().toISOString(),
  });
}

export function paymentById(id: string): PaymentRequest | undefined {
  return db().payment_requests.find((p) => p.id === id);
}

export function nextRef(): string {
  const d = db();
  const ref = `PAY-${d.counters.payment++}`;
  return ref;
}

// ---------------- prepare ----------------

export function preparePayment(input: {
  beneficiary_id: string;
  amount: number;
  purpose: string;
  requested_by: string;
  source: 'ai' | 'manual';
}): { ok: true; payment: PaymentRequest } | { ok: false; error: string } {
  const d = db();
  const beneficiary = d.beneficiaries.find((b) => b.id === input.beneficiary_id);
  if (!beneficiary) return { ok: false, error: 'Beneficiary not found.' };
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, error: 'Amount must be greater than zero.' };
  if (input.amount > 100_000_000) return { ok: false, error: 'Amount exceeds the sandbox transaction ceiling (₦100,000,000).' };

  const requester = userById(input.requested_by);
  if (!requester) return { ok: false, error: 'Unknown requester.' };
  if (requester.role === 'auditor') return { ok: false, error: 'Auditor accounts are read-only and cannot prepare payments.' };

  if (typeof input.purpose !== 'string' || input.purpose.length > 240 || Math.abs(input.amount * 100 - Math.round(input.amount * 100)) > 0.000001) return { ok: false, error: 'Use a purpose up to 240 characters and at most two decimal places.' };
  const required = requiredApprovals(d.policies, input.amount, beneficiary);
  const risk = riskFor(input.amount, beneficiary);

  const payment: PaymentRequest = {
    id: newId('pay'),
    ref: nextRef(),
    organization_id: d.org.id,
    beneficiary_id: beneficiary.id,
    amount: input.amount,
    currency: 'NGN',
    purpose: input.purpose || 'Business payment',
    requested_by: input.requested_by,
    status: 'AWAITING_APPROVAL',
    required_approvals: required,
    approvals: [],
    risk,
    fee: PAYMENT_FEE,
    source: input.source,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
  };
  d.payment_requests.unshift(payment);
  event(payment.id, 'AWAITING_APPROVAL', `Prepared by ${requester.first_name} ${requester.last_name} — awaiting ${required.join(' + ')} approval`);

  audit({
    actor: input.source === 'ai' ? 'Zytrex AI' : `${requester.first_name} ${requester.last_name}`,
    actor_role: input.source === 'ai' ? 'AI' : requester.role,
    action: input.source === 'ai' ? 'ai.prepare_transfer' : 'payment.prepare',
    details: `Prepared ${payment.ref} — ₦${input.amount.toLocaleString()} to ${beneficiary.name}${input.purpose ? ` (${input.purpose})` : ''}`,
    payment_id: payment.id,
    severity: risk === 'HIGH' ? 'warn' : 'info',
  });

  return { ok: true, payment };
}

// ---------------- approvals ----------------

export function decidePayment(
  paymentId: string,
  user: User,
  decision: 'APPROVED' | 'REJECTED',
  reason?: string
): { ok: true; payment: PaymentRequest } | { ok: false; error: string } {
  const payment = paymentById(paymentId);
  if (!payment) return { ok: false, error: 'Payment request not found.' };
  if (payment.expires_at && Date.parse(payment.expires_at) <= Date.now()) return { ok: false, error: 'This payment request has expired.' };
  if (payment.status !== 'AWAITING_APPROVAL') return { ok: false, error: `Payment is ${payment.status.replace('_', ' ').toLowerCase()} — no approval needed.` };

  const eligible = canApprove(user, payment);
  if (!eligible) {
    if (payment.requested_by === user.id) return { ok: false, error: 'Maker-checker rule: you cannot approve your own payment request.' };
    if (user.role === 'auditor') return { ok: false, error: 'Auditor accounts are read-only.' };
    return { ok: false, error: 'Your role is not required for this approval.' };
  }

  payment.approvals.push({
    approver_id: user.id,
    role: user.role,
    decision,
    reason,
    at: new Date().toISOString(),
  });

  if (decision === 'REJECTED') {
    payment.status = 'CANCELLED';
    event(payment.id, 'CANCELLED', `Rejected by ${user.first_name} ${user.last_name}${reason ? ` — ${reason}` : ''}`);
    audit({
      actor: `${user.first_name} ${user.last_name}`,
      actor_role: user.role,
      action: 'payment.reject',
      details: `Rejected ${payment.ref} — ₦${payment.amount.toLocaleString()} to beneficiary`,
      payment_id: payment.id,
      severity: 'warn',
    });
    return { ok: true, payment };
  }

  const outstanding = outstandingRoles(payment);

  audit({
    actor: `${user.first_name} ${user.last_name}`,
    actor_role: user.role,
    action: 'payment.approve',
    details: `Approved ${payment.ref} — ₦${payment.amount.toLocaleString()}${outstanding.length ? ` (still needs ${outstanding.join(' + ')})` : ' — fully approved'}`,
    payment_id: payment.id,
  });

  if (outstanding.length === 0) {
    payment.status = 'AWAITING_AUTHORIZATION';
    event(payment.id, 'AWAITING_AUTHORIZATION', `Fully approved — waiting for final authorization`);
  } else {
    event(payment.id, 'AWAITING_APPROVAL', `Approved by ${user.first_name} ${user.last_name} (${user.role}) — still needs ${outstanding.join(' + ')}`);
  }
  return { ok: true, payment };
}

// ---------------- authorization + execution ----------------

export const DEMO_PIN = '123456';
export const PAYMENT_FEE = 50; // flat sandbox transfer fee — shown on the confirmation screen

export async function authorizeAndExecute(
  paymentId: string,
  user: User,
  pin: string
): Promise<
  | { ok: true; payment: PaymentRequest; transaction_id: string; provider_reference: string }
  | { ok: false; error: string }
> {
  const d = db();
  const payment = paymentById(paymentId);
  if (!payment) return { ok: false, error: 'Payment request not found.' };

  if (!canAuthorize(user, payment)) {
    if (user.role === 'auditor') return { ok: false, error: 'Auditor accounts are read-only.' };
    if (payment.status !== 'AWAITING_AUTHORIZATION')
      return { ok: false, error: `Payment is ${payment.status.replace('_', ' ').toLowerCase()} — not ready for authorization.` };
    return { ok: false, error: 'Your role cannot authorize payments.' };
  }

  if (pin !== DEMO_PIN) {
    audit({ actor: user.id, actor_role: user.role, action: 'authorization.denied', details: 'Incorrect sandbox PIN', payment_id: payment.id, severity: 'warn' });
    return { ok: false, error: 'Incorrect demo PIN.' };
  }

  const beneficiary = d.beneficiaries.find((b) => b.id === payment.beneficiary_id);
  if (!beneficiary || beneficiary.verification_status !== 'VERIFIED') return { ok: false, error: 'The beneficiary must be verified before payment.' };
  if (payment.expires_at && Date.parse(payment.expires_at) <= Date.now()) return { ok: false, error: 'This payment request has expired.' };
  const required = requiredApprovals(d.policies, payment.amount, beneficiary);
  if (outstandingRoles({ ...payment, required_approvals: [...new Set([...payment.required_approvals, ...required])] }).length) return { ok: false, error: 'Additional approval is required under the current policy.' };
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', hourCycle: 'h23' }).format(scenarioNow()));
  if (d.policies.outside_hours_extra && (hour < 8 || hour >= 18)) return { ok: false, error: 'Outside business hours. Authorize between 08:00 and 18:00 Lagos time, or update the sandbox policy.' };
  const account = d.accounts[0];
  const debitKobo = Math.round(payment.amount * 100) + Math.round((payment.fee ?? 0) * 100);
  if (!account || account.status !== 'ACTIVE' || Math.round(account.available_balance * 100) < debitKobo) return { ok: false, error: 'Insufficient available funds for the payment and fee.' };
  // Reserve synchronously before the gateway await so competing requests cannot overspend.
  account.available_balance = (Math.round(account.available_balance * 100) - debitKobo) / 100;

  // AUTHORIZED → PROCESSING → SUCCESSFUL/FAILED
  payment.status = 'AUTHORIZED';
  payment.authorized_by = user.id;
  event(payment.id, 'AUTHORIZED', `Authorized by ${user.first_name} ${user.last_name} (PIN verified)`);
  audit({
    actor: `${user.first_name} ${user.last_name}`,
    actor_role: user.role,
    action: 'payment.authorize',
    details: `Authorized ${payment.ref} — ₦${payment.amount.toLocaleString()} to ${beneficiary.name}`,
    payment_id: payment.id,
    severity: 'critical',
  });

  payment.status = 'PROCESSING';
  event(payment.id, 'PROCESSING', 'Sent to Zytrex Payments gateway');
  audit({
    actor: 'Zytrex Payments',
    actor_role: 'SYSTEM',
    action: 'gateway.create_transfer',
    details: `${payment.ref} submitted to Zytrex Sandbox gateway (${payment.amount.toLocaleString()} NGN)`,
    payment_id: payment.id,
  });

  const gateway = getGateway();
  let result;
  try {
  result = await gateway.createTransfer({
    amount: payment.amount,
    currency: payment.currency,
    beneficiary: {
      name: beneficiary.account_name,
      bank_code: beneficiary.bank_code,
      bank_name: beneficiary.bank_name,
      account_mask: beneficiary.account_mask,
    },
    purpose: payment.purpose,
    reference: payment.ref,
  });

  } catch {
    event(payment.id, 'PROCESSING', 'Gateway outcome unknown; funds remain reserved. Do not retry.');
    audit({ actor: 'Zytrex Payments', actor_role: 'SYSTEM', action: 'gateway.unknown', details: 'Outcome requires reconciliation; reservation retained.', payment_id: payment.id, severity: 'critical' });
    return { ok: false, error: 'Payment outcome is pending confirmation. Funds are reserved; do not send another payment.' };
  }
  const completedAt = new Date().toISOString();

  if (!result.ok) {
    account.available_balance = (Math.round(account.available_balance * 100) + debitKobo) / 100;
    payment.status = 'FAILED';
    event(payment.id, 'FAILED', result.failure_reason ?? 'Transfer failed');
    audit({
      actor: 'Zytrex Payments',
      actor_role: 'SYSTEM',
      action: 'payment.failed',
      details: `${payment.ref} failed — ${result.failure_reason ?? 'unknown error'}`,
      payment_id: payment.id,
      severity: 'warn',
    });
    return { ok: false, error: result.failure_reason ?? 'Payment failed at the gateway.' };
  }

  const txnId = newId('txn');
  d.transactions.unshift({
    id: txnId,
    ref: `ZYT-${completedAt.slice(0, 10).replace(/-/g, '')}-${payment.ref.slice(-6)}`,
    payment_request_id: payment.id,
    organization_id: d.org.id,
    beneficiary_id: beneficiary.id,
    counterparty: beneficiary.name,
    direction: 'OUT',
    amount: payment.amount,
    currency: payment.currency,
    category: payment.purpose.toLowerCase().includes('payroll') ? 'Payroll' : 'Vendor payments',
    description: payment.purpose,
    provider: 'zytrex',
    provider_reference: result.provider_reference,
    internal_reference: payment.ref,
    status: 'SUCCESSFUL',
    initiated_at: completedAt,
    completed_at: completedAt,
  });

  account.ledger_balance = (Math.round(account.ledger_balance * 100) - debitKobo) / 100;

  payment.status = 'SUCCESSFUL';
  payment.transaction_id = txnId;
  event(payment.id, 'SUCCESSFUL', `Payment confirmed — reference ${result.provider_reference}`);
  audit({
    actor: 'Zytrex Payments',
    actor_role: 'SYSTEM',
    action: 'payment.successful',
    details: `${payment.ref} settled — ₦${payment.amount.toLocaleString()} to ${beneficiary.name} (${result.provider_reference})`,
    payment_id: payment.id,
    severity: 'info',
  });

  return { ok: true, payment, transaction_id: txnId, provider_reference: result.provider_reference };
}

export function cancelPayment(paymentId: string, user: User): { ok: boolean; error?: string } {
  const payment = paymentById(paymentId);
  if (!payment) return { ok: false, error: 'Not found.' };
  if (!['AWAITING_APPROVAL', 'DRAFT'].includes(payment.status)) return { ok: false, error: 'Only pending payments can be cancelled.' };
  if (user.role === 'auditor' || user.status !== 'ACTIVE') return { ok: false, error: 'This account cannot cancel payments.' };
  if (payment.requested_by !== user.id && user.role !== 'owner') return { ok: false, error: 'Only the requester or the CEO can cancel this payment.' };
  payment.status = 'CANCELLED';
  event(payment.id, 'CANCELLED', `Cancelled by ${user.first_name} ${user.last_name}`);
  audit({
    actor: `${user.first_name} ${user.last_name}`,
    actor_role: user.role,
    action: 'payment.cancel',
    details: `Cancelled ${payment.ref}`,
    payment_id: payment.id,
    severity: 'warn',
  });
  return { ok: true };
}
