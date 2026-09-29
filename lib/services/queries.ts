// Read-model queries used by dashboards, pages and AI tools.

import { scenarioNow } from '../clock';
import { canApprove, canAuthorize, outstandingRoles } from '../policies';
import { db } from '../store';
import type { PaymentRequest, Transaction, User } from '../types';

export interface DateRange {
  start: Date;
  end: Date;
}

export function rangeThisMonth(now = scenarioNow()): DateRange {
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
  };
}

export function rangeLastMonth(now = scenarioNow()): DateRange {
  return {
    start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    end: new Date(now.getFullYear(), now.getMonth(), 1),
  };
}

export function rangeYesterday(now = scenarioNow()): DateRange {
  const start = new Date(now);
  start.setDate(start.getDate() - 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function rangeToday(now = scenarioNow()): DateRange {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function inRange(txn: Transaction, range?: DateRange): boolean {
  if (!range) return true;
  const t = new Date(txn.initiated_at).getTime();
  return t >= range.start.getTime() && t < range.end.getTime();
}

// ---------------- transactions ----------------

export interface TxnFilters {
  direction?: 'IN' | 'OUT';
  status?: string;
  category?: string;
  beneficiary_id?: string;
  counterparty_q?: string;
  description_q?: string;
  min_amount?: number;
  max_amount?: number;
  start?: string; // ISO date
  end?: string;
  limit?: number;
}

export function searchTransactions(f: TxnFilters): Transaction[] {
  const d = db();
  const start = f.start ? new Date(f.start).getTime() : -Infinity;
  const end = f.end ? new Date(f.end).getTime() : Infinity;
  const qBenef = f.counterparty_q?.toLowerCase();
  const qDesc = f.description_q?.toLowerCase();

  const rows = d.transactions.filter((t) => {
    if (f.direction && t.direction !== f.direction) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.category && t.category !== f.category) return false;
    if (f.beneficiary_id && t.beneficiary_id !== f.beneficiary_id) return false;
    if (f.min_amount != null && t.amount < f.min_amount) return false;
    if (f.max_amount != null && t.amount > f.max_amount) return false;
    const ts = new Date(t.initiated_at).getTime();
    if (ts < start || ts >= end) return false;
    if (qBenef && !t.counterparty.toLowerCase().includes(qBenef)) return false;
    if (qDesc && !t.description.toLowerCase().includes(qDesc)) return false;
    return true;
  });
  return rows.slice(0, f.limit ?? 200);
}

// ---------------- spending ----------------

export interface SpendingSummary {
  total: number;
  count: number;
  categories: { name: string; total: number; count: number }[];
}

export function spendingSummary(range?: DateRange): SpendingSummary {
  const txns = searchTransactions({ direction: 'OUT', status: 'SUCCESSFUL', limit: 10000 }).filter((t) => inRange(t, range));
  const catMap = new Map<string, { total: number; count: number }>();
  for (const t of txns) {
    const cur = catMap.get(t.category) ?? { total: 0, count: 0 };
    cur.total += t.amount;
    cur.count += 1;
    catMap.set(t.category, cur);
  }
  const categories = Array.from(catMap.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.total - a.total);
  return { total: txns.reduce((a, b) => a + b.amount, 0), count: txns.length, categories };
}

export function receivedSummary(range?: DateRange): { total: number; count: number } {
  const txns = searchTransactions({ direction: 'IN', status: 'SUCCESSFUL', limit: 10000 }).filter((t) => inRange(t, range));
  return { total: txns.reduce((a, b) => a + b.amount, 0), count: txns.length };
}

export function topVendors(range?: DateRange, limit = 10) {
  const txns = searchTransactions({ direction: 'OUT', status: 'SUCCESSFUL', limit: 10000 }).filter((t) => inRange(t, range));
  const map = new Map<string, { total: number; count: number }>();
  for (const t of txns) {
    const cur = map.get(t.counterparty) ?? { total: 0, count: 0 };
    cur.total += t.amount;
    cur.count += 1;
    map.set(t.counterparty, cur);
  }
  const rows = Array.from(map.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
  const total = rows.reduce((a, b) => a + b.total, 0);
  return { rows, total };
}

export function beneficiaryHistory(beneficiaryId: string, range?: DateRange) {
  const d = db();
  const ben = d.beneficiaries.find((b) => b.id === beneficiaryId);
  if (!ben) return null;
  const rows = searchTransactions({ direction: 'OUT', beneficiary_id: beneficiaryId, limit: 10000 }).filter(t => inRange(t, range));
  const total = rows.filter((r) => r.status === 'SUCCESSFUL').reduce((a, b) => a + b.amount, 0);
  const count = rows.filter((r) => r.status === 'SUCCESSFUL').length;
  return { beneficiary: ben, rows, total, count };
}

// ---------------- approvals ----------------

export interface ApprovalRow {
  payment: PaymentRequest;
  outstanding: RoleTuple;
  beneficiary_name: string;
  requested_by_name: string;
  actionable: boolean;
}
type RoleTuple = PaymentRequest['required_approvals'];

export function pendingApprovalPayments(): PaymentRequest[] {
  return db().payment_requests.filter((p) => p.status === 'AWAITING_APPROVAL');
}

export function readyToAuthorizePayments(): PaymentRequest[] {
  return db().payment_requests.filter((p) => p.status === 'AWAITING_AUTHORIZATION');
}

export function approvalQueue(user?: User): {
  pending: ApprovalRow[];
  ready_to_authorize: ApprovalRow[];
} {
  const d = db();
  const nameOf = (id: string) => {
    const u = d.users.find((x) => x.id === id);
    return u ? `${u.first_name} ${u.last_name}` : id;
  };
  const benName = (id: string) => d.beneficiaries.find((b) => b.id === id)?.name ?? '—';

  const pending = pendingApprovalPayments().map((payment) => ({
    payment,
    outstanding: outstandingRoles(payment),
    beneficiary_name: benName(payment.beneficiary_id),
    requested_by_name: nameOf(payment.requested_by),
    actionable: user ? canApprove(user, payment) : false,
  }));

  const ready_to_authorize = readyToAuthorizePayments().map((payment) => ({
    payment,
    outstanding: [] as RoleTuple,
    beneficiary_name: benName(payment.beneficiary_id),
    requested_by_name: nameOf(payment.requested_by),
    actionable: user ? canAuthorize(user, payment) : false,
  }));

  return { pending, ready_to_authorize };
}

// ---------------- dashboard ----------------

export function dashboardStats() {
  const d = db();
  const month = rangeThisMonth();
  const spent = spendingSummary(month);
  const received = receivedSummary(month);
  const todayTxns = d.transactions.filter(
    (t) => t.direction === 'OUT' && t.status === 'SUCCESSFUL' && t.initiated_at.startsWith(new Date().toISOString().slice(0, 10))
  );
  // demo clock: the sandbox is pinned to 29 Sep 2026
  const todayCount = d.transactions.filter((t) => t.direction === 'OUT' && t.status === 'SUCCESSFUL' && t.initiated_at.startsWith('2026-09-29')).length;
  const failedCount = d.transactions.filter((t) => t.status === 'FAILED' && t.initiated_at.startsWith('2026-09-29')).length;
  const pendingList = pendingApprovalPayments();
  const pending = pendingList.length;
  const pending_amount = pendingList.reduce((sum, p) => sum + p.amount, 0);
  const scheduled = d.payment_requests.filter((p) => p.status === 'DRAFT' && p.scheduled_at).length;
  const awaitingAuth = readyToAuthorizePayments().length;

  const monthLabel = scenarioNow().toLocaleDateString('en-GB', { month: 'long' });

  return {
    available_balance: d.accounts.reduce((a, b) => a + b.available_balance, 0),
    ledger_balance: d.accounts.reduce((a, b) => a + b.ledger_balance, 0),
    currency: d.org.base_currency,
    received_month: received.total,
    spent_month: spent.total,
    transactions_count: spent.count,
    payments_today: todayCount || todayTxns.length,
    failed_today: failedCount,
    pending_approvals: pending,
    pending_amount,
    scheduled_payments: scheduled,
    awaiting_authorization: awaitingAuth,
    month_label: monthLabel,
    accounts: d.accounts.map((a) => ({
      label: a.label,
      mask: a.provider_account_id.slice(-4),
      balance: a.available_balance,
    })),
  };
}

export function changePct(): { thisMonth: number; lastMonth: number; pct: number } {
  const now = new Date('2026-09-29T12:00:00');
  const thisMonth = spendingSummary(rangeThisMonth(now)).total;
  const lastMonth = spendingSummary(rangeLastMonth(now)).total;
  const pct = lastMonth ? ((thisMonth - lastMonth) / lastMonth) * 100 : 0;
  return { thisMonth, lastMonth, pct };
}
