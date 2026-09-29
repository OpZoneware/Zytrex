// The Zytrex AI agent: intent → policy-checked tools → structured response.
// No SQL, no secrets, no direct DB access — only approved tools.

import { compact, fmtDateShort, naira, naira0, pct } from '../format';
import { canPrepare, policyNotes, requiredApprovals, riskFor } from '../policies';
import { audit } from '../services/audit';
import {
  approvalQueue,
  beneficiaryHistory,
  changePct,
  dashboardStats,
  rangeThisMonth,
  searchTransactions,
  spendingSummary,
  topVendors,
} from '../services/queries';
import { preparePayment, cancelPayment } from '../services/payments';
import { db, newId, userById } from '../store';
import type { ChatCard, ChatMessage, RiskLevel, Role, ToolCallRecord, User } from '../types';
import { matchBeneficiary, parse, type Parsed } from './parser';
import { FALLBACK_SUGGESTIONS } from './prompts';

const DEMO_NOW = new Date('2026-09-29T12:00:00');

function getConversation(userId: string) {
  const d = db();
  // One shared conversation per (sandbox) organization: approvers get switched
  // mid-chat during the demo, and the thread must survive those switches.
  let conv = d.conversations.find((c) => c.user_id === userId);
  if (!conv) {
    conv = { id: newId('conv'), user_id: userId, messages: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    d.conversations.push(conv);
  }
  return conv;
}

export function getMessages(userId: string): ChatMessage[] {
  return getConversation(userId).messages;
}

function push(conv: ReturnType<typeof getConversation>, msg: ChatMessage) {
  conv.messages.push(msg);
  conv.updated_at = new Date().toISOString();
  if (conv.messages.filter((m) => m.role === 'user').length === 1 && msg.role === 'user') {
    audit({ actor: 'Zytrex AI', actor_role: 'AI', action: 'ai.conversation_start', details: 'AI Finance conversation started' });
  }
}

// ---------------- tool runner ----------------

interface ToolResult {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  risk: RiskLevel;
  text: string;
  cards: ChatCard[];
}

function runTool(fn: () => ToolResult): { result: ToolResult; record: ToolCallRecord } {
  const t0 = performance.now();
  const result = fn();
  const ms = Math.max(1, Math.round(performance.now() - t0));
  return {
    result,
    record: { name: result.tool, args: result.args, summary: result.summary, ms, risk: result.risk, ok: true },
  };
}

function periodLabel(period?: { label: string }): string {
  return period?.label ?? 'this month';
}

function rangeOf(parsed: Parsed) {
  return parsed.period ?? rangeThisMonth(DEMO_NOW);
}

// ---------------- intent handlers ----------------

function toolBalance(): ToolResult {
  const stats = dashboardStats();
  return {
    tool: 'get_balance',
    args: {},
    summary: `available ${stats.available_balance.toLocaleString()} NGN`,
    risk: 'LOW',
    text: `Your available operating balance is ${naira(stats.available_balance)}.\nLedger balance: ${naira(stats.ledger_balance)} · ${stats.accounts.length} account connected via Zytrex Payments.`,
    cards: [
      {
        kind: 'balance',
        available: stats.available_balance,
        ledger: stats.ledger_balance,
        currency: stats.currency,
        accounts: stats.accounts.map((a) => ({ label: a.label, mask: a.mask, balance: a.balance })),
      },
    ],
  };
}

function toolSpending(parsed: Parsed): ToolResult {
  const range = rangeOf(parsed);
  const s = spendingSummary(range);
  const change = changePct();
  const label = periodLabel(parsed.period);
  const showChange = parsed.period?.label === 'this month' || !parsed.period;
  const text =
    s.count === 0
      ? `No outgoing transactions found for ${label}.`
      : `Your company has spent ${naira(s.total)} across ${s.count} transactions ${label}.\n\nLargest categories:\n${s.categories
          .slice(0, 4)
          .map((c) => `${c.name}  ${compact(c.total)}`)
          .join('\n')}${showChange ? `\n\nCompared with last month: ${pct(change.pct)}` : ''}`;

  return {
    tool: 'get_spending_summary',
    args: { period: label },
    summary: `${naira0(s.total)} across ${s.count} txns`,
    risk: 'LOW',
    text,
    cards: [
      {
        kind: 'spending',
        period: label,
        total: s.total,
        count: s.count,
        categories: s.categories.map((c) => ({ name: c.name, total: c.total })),
        change_pct: showChange ? change.pct : undefined,
        change_label: 'vs last month',
      },
    ],
  };
}

function toolCompare(parsed: Parsed): ToolResult {
  const a = parsed.compare!.a;
  const b = parsed.compare!.b;
  const sa = spendingSummary({ start: a.start, end: a.end });
  const sb = spendingSummary({ start: b.start, end: b.end });
  const pctChange = sa.total ? ((sb.total - sa.total) / sa.total) * 100 : 0;
  const direction = pctChange >= 0 ? 'up' : 'down';
  return {
    tool: 'compare_spending',
    args: { periods: [a.label, b.label] },
    summary: `${a.label} ${naira0(sa.total)} vs ${b.label} ${naira0(sb.total)}`,
    risk: 'LOW',
    text: `${a.label}: ${naira(sa.total)} across ${sa.count} transactions.\n${b.label}: ${naira(sb.total)} across ${sb.count} transactions.\n\nSpend is ${direction} ${Math.abs(pctChange).toFixed(1)}% from ${a.label} to ${b.label}.`,
    cards: [{ kind: 'compare', a: { label: a.label, total: sa.total }, b: { label: b.label, total: sb.total }, change_pct: pctChange }],
  };
}

function toolSearch(parsed: Parsed): ToolResult {
  const range = rangeOf(parsed);
  const rows = searchTransactions({
    direction: parsed.direction,
    status: parsed.status,
    min_amount: parsed.min_amount,
    max_amount: parsed.max_amount,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
    limit: 50,
  });
  const total = rows.reduce((a, b) => a + b.amount, 0);
  const label = periodLabel(parsed.period);
  const conds: string[] = [];
  if (parsed.min_amount != null) conds.push(`above ${naira0(parsed.min_amount)}`);
  if (parsed.max_amount != null) conds.push(`below ${naira0(parsed.max_amount)}`);
  if (parsed.status === 'FAILED') conds.push('failed');
  if (parsed.direction === 'IN') conds.push('received');
  const condText = conds.length ? ` ${conds.join(', ')}` : '';
  const title = parsed.status === 'FAILED' ? 'Failed transactions' : parsed.direction === 'IN' ? 'Incoming transactions' : 'Transactions';

  return {
    tool: 'search_transactions',
    args: {
      min_amount: parsed.min_amount,
      max_amount: parsed.max_amount,
      direction: parsed.direction,
      status: parsed.status,
      start: range.start.toISOString().slice(0, 10),
      end: range.end.toISOString().slice(0, 10),
    },
    summary: `${rows.length} results, ${naira0(total)}`,
    risk: 'LOW',
    text:
      rows.length === 0
        ? `I couldn't find any transactions${condText} for ${label}.`
        : `Found ${rows.length} transaction${rows.length === 1 ? '' : 's'}${condText} for ${label}, totalling ${naira(total)}.`,
    cards: [
      {
        kind: 'transactions',
        title: `${title}${conds.length ? ` · ${conds.join(', ')}` : ''} · ${label}`,
        total,
        count: rows.length,
        link: '/transactions',
        rows: rows.slice(0, 8).map((t) => ({
          id: t.id,
          ref: t.ref,
          counterparty: t.counterparty,
          amount: t.amount,
          direction: t.direction,
          status: t.status,
          category: t.category,
          date: t.initiated_at,
          description: t.description,
        })),
      },
    ],
  };
}

function toolApprovals(user: User): ToolResult {
  const q = approvalQueue(user);
  const rows = [...q.pending, ...q.ready_to_authorize].map((r) => ({
    payment_id: r.payment.id,
    ref: r.payment.ref,
    beneficiary_name: r.beneficiary_name,
    amount: r.payment.amount,
    purpose: r.payment.purpose,
    status: r.payment.status,
    requested_by: r.requested_by_name,
    outstanding: r.outstanding,
  }));
  const mine = rows.filter((r) =>
    q.pending.some((p) => p.payment.id === r.payment_id && p.actionable) || q.ready_to_authorize.some((p) => p.payment.id === r.payment_id && p.actionable)
  ).length;
  const text =
    rows.length === 0
      ? 'Nothing is waiting for approval right now. The queue is clear.'
      : `There are ${q.pending.length} payment${q.pending.length === 1 ? '' : 's'} awaiting approval and ${q.ready_to_authorize.length} ready for authorization.${mine ? ` ${mine} of them need your action.` : ' None of them currently need your action.'}`;
  return {
    tool: 'get_pending_approvals',
    args: { user: user.id },
    summary: `${q.pending.length} pending, ${q.ready_to_authorize.length} to authorize`,
    risk: 'LOW',
    text,
    cards: [{ kind: 'approvals', rows }],
  };
}

function toolVendors(parsed: Parsed): ToolResult {
  const range = rangeOf(parsed);
  const label = periodLabel(parsed.period);
  const { rows, total } = topVendors(range, parsed.top_n ?? 10);
  const text = `Top vendors ${label} by spend:\n${rows
    .slice(0, 6)
    .map((r, i) => `${i + 1}. ${r.name} — ${compact(r.total)} (${r.count} txns)`)
    .join('\n')}\n\nTotal: ${naira(total)}`;
  return {
    tool: 'get_top_vendors',
    args: { period: label, limit: parsed.top_n ?? 10 },
    summary: `${rows.length} vendors, ${naira0(total)}`,
    risk: 'LOW',
    text,
    cards: [{ kind: 'vendors', period: label, rows, total }],
  };
}

function toolCategory(parsed: Parsed): ToolResult {
  const range = rangeOf(parsed);
  const label = periodLabel(parsed.period);
  const cat = parsed.category!;
  const rows = searchTransactions({
    direction: 'OUT',
    status: 'SUCCESSFUL',
    category: cat,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
    limit: 1000,
  });
  const total = rows.reduce((a, b) => a + b.amount, 0);
  const s = spendingSummary(range);
  const share = s.total ? (total / s.total) * 100 : 0;
  const text =
    rows.length === 0
      ? `No ${cat} transactions found for ${label}.`
      : `${cat} spent ${naira(total)} across ${rows.length} transactions ${label} — ${share.toFixed(0)}% of total spend.`;
  return {
    tool: 'get_spending_summary',
    args: { category: cat, period: label },
    summary: `${cat}: ${naira0(total)}`,
    risk: 'LOW',
    text,
    cards: [
      {
        kind: 'spending',
        period: `${cat} · ${label}`,
        total,
        count: rows.length,
        categories: [{ name: cat, total }],
      },
    ],
  };
}

function toolBeneficiaryHistory(query?: string): ToolResult {
  const d = db();
  const names = d.beneficiaries.map((b) => ({ name: b.name }));
  const m = query ? matchBeneficiary(query, names) : null;
  if (!m) {
    return {
      tool: 'find_beneficiary',
      args: { query },
      summary: 'no match',
      risk: 'LOW',
      text: `I couldn't find a beneficiary matching "${query ?? ''}" in your directory.\n\nKnown beneficiaries: ${d.beneficiaries.map((b) => b.name).join(', ')}.`,
      cards: [],
    };
  }
  const ben = d.beneficiaries.find((b) => b.name === m.match.name)!;
  const hist = beneficiaryHistory(ben.id)!;
  const text = `You've paid ${ben.name} ${naira(hist.total)} across ${hist.count} successful transaction${hist.count === 1 ? '' : 's'}.\n\nRecent payments:\n${hist.rows
    .slice(0, 5)
    .map((r) => `${fmtDateShort(r.initiated_at)} — ${naira0(r.amount)} — ${r.description}`)
    .join('\n')}`;
  return {
    tool: 'get_beneficiary_history',
    args: { beneficiary: ben.name },
    summary: `${naira0(hist.total)} across ${hist.count} txns`,
    risk: 'LOW',
    text,
    cards: [
      {
        kind: 'beneficiary_history',
        beneficiary_name: ben.name,
        total: hist.total,
        count: hist.count,
        verified: ben.verification_status,
        bank_name: ben.bank_name,
        account_mask: ben.account_mask,
        rows: hist.rows.slice(0, 6).map((r) => ({
          id: r.id,
          ref: r.ref,
          amount: r.amount,
          date: r.initiated_at,
          description: r.description,
        })),
      },
    ],
  };
}

function toolTransferPreview(parsed: Parsed, user: User): ToolResult {
  const d = db();
  const names = d.beneficiaries.map((b) => ({ name: b.name }));

  if (!canPrepare(user)) {
    return {
      tool: 'prepare_transfer',
      args: { blocked: true },
      summary: 'blocked — auditor read-only',
      risk: 'HIGH',
      text: 'Auditor accounts have read-only access, so I can\'t prepare payments with this login. Switch to Daniel, Amara or Tunde to prepare a transfer.',
      cards: [],
    };
  }

  if (parsed.amount == null) {
    return {
      tool: 'prepare_transfer',
      args: { step: 'missing_amount' },
      summary: 'clarification needed',
      risk: 'MEDIUM',
      text: `How much should I prepare${parsed.beneficiary_query ? ` to ${parsed.beneficiary_query}` : ''}? Say something like "Pay Godwin Engineering ₦520k for LASCON".`,
      cards: [],
    };
  }

  if (!parsed.beneficiary_query) {
    return {
      tool: 'prepare_transfer',
      args: { step: 'missing_beneficiary', amount: parsed.amount },
      summary: 'clarification needed',
      risk: 'MEDIUM',
      text: `Who should receive ${naira0(parsed.amount)}? Name a beneficiary from your directory — for example Godwin Engineering, Rashtaw Water Solutions, ABC Construction, Prime Logistics or Delta Steel Works.`,
      cards: [],
    };
  }

  const m = matchBeneficiary(parsed.beneficiary_query, names);
  if (!m) {
    return {
      tool: 'find_beneficiary',
      args: { query: parsed.beneficiary_query },
      summary: 'no match',
      risk: 'MEDIUM',
      text: `I couldn't find "${parsed.beneficiary_query}" in your beneficiary directory. Add the beneficiary under Beneficiaries first — new beneficiaries go through account verification before they can be paid.`,
      cards: [{ kind: 'info', title: 'Beneficiary not found', lines: [`Searched: "${parsed.beneficiary_query}"`, `Directory: ${d.beneficiaries.map((b) => b.name).join(' · ')}`] }],
    };
  }

  const ben = d.beneficiaries.find((b) => b.name === m.match.name)!;
  const required = requiredApprovals(d.policies, parsed.amount, ben);
  const risk = riskFor(parsed.amount, ben);
  const notes = policyNotes(d.policies, parsed.amount, ben);
  const purpose = parsed.purpose || 'Business payment';

  audit({
    actor: 'Zytrex AI',
    actor_role: 'AI',
    action: 'ai.intent',
    details: `Classified intent prepare_transfer — ${naira0(parsed.amount)} to ${ben.name}${parsed.purpose ? ` (${parsed.purpose})` : ''} — risk ${risk}`,
    severity: risk === 'HIGH' ? 'warn' : 'info',
  });

  return {
    tool: 'find_beneficiary',
    args: { query: parsed.beneficiary_query, matched: ben.name, amount: parsed.amount },
    summary: `${ben.name} matched — ${risk} risk`,
    risk,
    text: `I found ${ben.account_name} at ${ben.bank_name} ••••${ben.account_mask.slice(-4)} — ${ben.verification_status.toLowerCase()}.\n\nReview the payment below. Nothing moves until it's approved, then explicitly authorized by you.`,
    cards: [
      {
        kind: 'transfer_preview',
        beneficiary: {
          id: ben.id,
          name: ben.name,
          bank_name: ben.bank_name,
          account_mask: ben.account_mask,
          verification_status: ben.verification_status,
        },
        amount: parsed.amount,
        currency: 'NGN',
        purpose,
        risk,
        required_approvals: required,
        policy_notes: notes,
      },
    ],
  };
}

// ---------------- main entry points ----------------

// Natural language becomes navigation: some intents should MOVE the product
// (navigate + pre-applied filters) instead of rendering an AI answer.
export function gotoForMessage(msg: ChatMessage): string | null {
  const call = msg.tool_calls?.[0];
  if (!call) return null;
  if (call.name === 'get_pending_approvals') return '/approvals';
  if (call.name === 'search_transactions') {
    const a = call.args as Record<string, unknown>;
    const qs = new URLSearchParams();
    if (a.status) qs.set('status', String(a.status));
    if (a.direction) qs.set('direction', String(a.direction));
    if (a.min_amount != null && a.min_amount !== undefined) qs.set('min_amount', String(a.min_amount));
    if (a.max_amount != null && a.max_amount !== undefined) qs.set('max_amount', String(a.max_amount));
    if (a.start) qs.set('start', String(a.start));
    if (a.end) qs.set('end', String(a.end));
    const q = qs.toString();
    return q ? `/transactions?${q}` : '/transactions';
  }
  return null;
}

export function runMessage(userId: string, text: string): ChatMessage {
  const user = userById(userId)!;
  const conv = getConversation(userId);
  const d = db();

  const userMsg: ChatMessage = { id: newId('msg'), role: 'user', text, at: new Date().toISOString() };
  push(conv, userMsg);

  const parsed = parse(
    text,
    d.beneficiaries.map((b) => b.name)
  );

  const { result, record } = ((): { result: ToolResult; record: ToolCallRecord } => {
    switch (parsed.intent) {
      case 'get_balance':
        return runTool(() => toolBalance());
      case 'spending_summary':
        return runTool(() => toolSpending(parsed));
      case 'compare_spending':
        return runTool(() => toolCompare(parsed));
      case 'search_transactions':
        return runTool(() => toolSearch(parsed));
      case 'pending_approvals':
        return runTool(() => toolApprovals(user));
      case 'top_vendors':
        return runTool(() => toolVendors(parsed));
      case 'category_spend':
        return runTool(() => toolCategory(parsed));
      case 'beneficiary_history':
        return runTool(() => toolBeneficiaryHistory(parsed.beneficiary_query));
      case 'prepare_transfer':
        return runTool(() => toolTransferPreview(parsed, user));
      case 'greeting':
        return {
          result: {
            tool: 'conversation',
            args: {},
            summary: 'greeting',
            risk: 'LOW',
            text: `Hello ${user.first_name} — ask me about balances, spending, approvals, or prepare a payment. I can also run voice commands from the microphone button.`,
            cards: [],
          },
          record: { name: 'conversation', args: {}, summary: 'greeting', ms: 1, risk: 'LOW', ok: true },
        };
      case 'help':
      case 'unknown':
      default:
        return {
          result: {
            tool: 'conversation',
            args: { intent: parsed.intent },
            summary: 'fallback',
            risk: 'LOW',
            text:
              parsed.intent === 'help'
                ? 'Here is what I can do:\n• Balances — "What is our balance?"\n• Spending — "How much did we spend this month?"\n• Compare — "Compare August and September expenses"\n• Search — "Show transactions above ₦1m this month"\n• Approvals — "Which payments need my approval?"\n• Vendors — "Who are our top 10 vendors?"\n• Payments — "Pay Godwin Engineering ₦520k for LASCON"\n\nI prepare payments — authorization always stays with you.'
                : 'I\'m not sure how to map that to a financial action yet. Try one of these:',
            cards: parsed.intent === 'help' ? [] : [{ kind: 'info', title: 'Try asking', lines: FALLBACK_SUGGESTIONS }],
          },
          record: { name: 'conversation', args: { intent: parsed.intent }, summary: 'fallback', ms: 1, risk: 'LOW', ok: true },
        };
    }
  })();

  const aiMsg: ChatMessage = {
    id: newId('msg'),
    role: 'assistant',
    text: result.text,
    cards: result.cards.length ? result.cards : undefined,
    tool_calls: [record],
    at: new Date().toISOString(),
  };
  push(conv, aiMsg);
  return aiMsg;
}

export type AiAction =
  | { action: 'prepare_payment'; payload: { beneficiary_id: string; amount: number; purpose: string } }
  | { action: 'request_approval'; payload: { payment_id: string } }
  | { action: 'cancel_payment'; payload: { payment_id: string } };

export function runAction(userId: string, req: AiAction): ChatMessage {
  const user = userById(userId)!;
  const conv = getConversation(userId);
  let msg: ChatMessage;

  if (req.action === 'prepare_payment') {
    const t0 = performance.now();
    const res = preparePayment({
      beneficiary_id: req.payload.beneficiary_id,
      amount: req.payload.amount,
      purpose: req.payload.purpose,
      requested_by: userId,
      source: 'ai',
    });
    const ms = Math.max(1, Math.round(performance.now() - t0));
    if (!res.ok) {
      msg = {
        id: newId('msg'),
        role: 'assistant',
        text: `I couldn't prepare that payment: ${res.error}`,
        tool_calls: [{ name: 'prepare_transfer', args: req.payload, summary: 'failed', ms, risk: 'HIGH', ok: false }],
        at: new Date().toISOString(),
        action: true,
      };
    } else {
      const d = db();
      const ben = d.beneficiaries.find((b) => b.id === res.payment.beneficiary_id)!;
      const outstanding = res.payment.required_approvals;
      msg = {
        id: newId('msg'),
        role: 'assistant',
        text: `I've prepared the payment.\n\n${res.payment.ref} — ${naira(res.payment.amount)} to ${ben.name}\n\nStatus: awaiting ${outstanding.join(' + ')} approval. Request approval below, or switch to an approver account to clear it instantly in this sandbox.`,
        cards: [paymentCard(res.payment.id)],
        tool_calls: [
          {
            name: 'prepare_transfer',
            args: { beneficiary: ben.name, amount: res.payment.amount, purpose: res.payment.purpose },
            summary: `${res.payment.ref} created`,
            ms,
            risk: res.payment.risk,
            ok: true,
          },
        ],
        at: new Date().toISOString(),
        action: true,
      };
    }
  } else if (req.action === 'request_approval') {
    const payment = db().payment_requests.find((p) => p.id === req.payload.payment_id);
    if (payment) {
      audit({
        actor: `${user.first_name} ${user.last_name}`,
        actor_role: user.role,
        action: 'approval.request',
        details: `Approval requested for ${payment.ref} — ${payment.required_approvals.join(' + ')}`,
        payment_id: payment.id,
      });
    }
    msg = {
      id: newId('msg'),
      role: 'assistant',
      text: payment
        ? `Approval request sent for ${payment.ref}. Required approvers: ${payment.required_approvals
            .map((r) => roleName(r))
            .join(', ')}. In this sandbox you can switch approver accounts from the avatar menu to approve it immediately.`
        : 'Payment not found.',
      at: new Date().toISOString(),
      action: true,
    };
  } else if (req.action === 'cancel_payment') {
    const result = cancelPayment(req.payload.payment_id, user);
    msg = { id: newId('msg'), role: 'assistant', text: result.ok ? 'Payment request cancelled.' : result.error ?? 'Cancellation denied.', at: new Date().toISOString(), action: true };
  } else {
    throw new Error('Unknown action');
  }

  push(conv, msg);
  return msg;
}

export function paymentCard(paymentId: string): ChatCard {
  const d = db();
  const p = d.payment_requests.find((x) => x.id === paymentId)!;
  const ben = d.beneficiaries.find((b) => b.id === p.beneficiary_id)!;
  return {
    kind: 'payment',
    payment_id: p.id,
    ref: p.ref,
    amount: p.amount,
    currency: p.currency,
    beneficiary_name: ben.name,
    bank_name: ben.bank_name,
    account_mask: ben.account_mask,
    purpose: p.purpose,
    status: p.status,
    required_approvals: p.required_approvals,
    risk: p.risk,
    created_at: p.created_at,
  };
}

function roleName(r: Role): string {
  return { owner: 'CEO', finance: 'Finance', operations: 'Operations', director: 'Director', auditor: 'Auditor' }[r] ?? r;
}
