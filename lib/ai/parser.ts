// Rule-based intent classification + entity extraction.
// Deterministic: the same message always yields the same intent and arguments.
// (Swap in an LLM classifier later without changing the tool layer below it.)

import { findAmount, parsePeriod } from './numbers';

export type Intent =
  | 'greeting'
  | 'help'
  | 'get_balance'
  | 'spending_summary'
  | 'compare_spending'
  | 'search_transactions'
  | 'beneficiary_history'
  | 'pending_approvals'
  | 'prepare_transfer'
  | 'top_vendors'
  | 'category_spend'
  | 'unknown';

export interface Parsed {
  intent: Intent;
  amount?: number;
  min_amount?: number;
  max_amount?: number;
  beneficiary_query?: string;
  purpose?: string;
  category?: string;
  period?: { start: Date; end: Date; label: string };
  compare?: { a: { start: Date; end: Date; label: string }; b: { start: Date; end: Date; label: string } };
  direction?: 'IN' | 'OUT';
  status?: 'FAILED' | 'SUCCESSFUL';
  top_n?: number;
}

const CATEGORIES = ['vendor payments', 'operations', 'payroll', 'other', 'revenue'];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Find a beneficiary mentioned in free text (fuzzy, token-based). */
export function matchBeneficiary<T extends { name: string }>(text: string, list: T[]): { match: T; score: number } | null {
  const t = norm(text);
  let best: { match: T; score: number } | null = null;
  for (const b of list) {
    const name = norm(b.name);
    if (t.includes(name)) {
      const score = 100 + name.length;
      if (!best || score > best.score) best = { match: b, score };
      continue;
    }
    const tokens = name.replace(/\b(ltd|limited|ng|plc|company|co)\b/g, ' ').split(' ').filter((x) => x.length > 2);
    if (!tokens.length) continue;
    const hits = tokens.filter((tok) => t.includes(tok)).length;
    const score = hits / tokens.length;
    if (score >= 0.6 && (!best || score > best.score)) best = { match: b, score };
  }
  return best;
}

export function parse(input: string, beneficiaryNames: string[]): Parsed {
  const text = input.trim();
  const lower = text.toLowerCase();
  if (/\b(do not|don't|dont|never|not|cancel|stop)\b.*\b(pay|send|transfer|disburse)\b/.test(lower)) return { intent: 'unknown' };

  const period = parsePeriod(text) ?? undefined;

  // ---- compare ----
  if (/\bcompare\b|\bversus\b|\bvs\.?\b|\bagainst\b/.test(lower)) {
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const found: { start: Date; end: Date; label: string }[] = [];
    for (const m of months) {
      if (new RegExp(`\\b${m}\\b`).test(lower)) {
        const idx = months.indexOf(m);
        found.push({ start: new Date(2026, idx, 1), end: new Date(2026, idx + 1, 1), label: m[0].toUpperCase() + m.slice(1) });
      }
    }
    let a = found[0];
    let b = found[1];
    if (!a && /\blast month\b/.test(lower)) {
      a = { start: new Date(2026, 7, 1), end: new Date(2026, 8, 1), label: 'August' };
      b = { start: new Date(2026, 8, 1), end: new Date(2026, 9, 1), label: 'September' };
    }
    if (a && b) return { intent: 'compare_spending', compare: { a, b }, period };
    if (/\blast month\b|\bthis month\b/.test(lower)) {
      return {
        intent: 'compare_spending',
        compare: {
          a: { start: new Date(2026, 7, 1), end: new Date(2026, 8, 1), label: 'August' },
          b: { start: new Date(2026, 8, 1), end: new Date(2026, 9, 1), label: 'September' },
        },
        period,
      };
    }
  }

  // ---- transfer ----
  const transferVerb = /\b(send|pay|transfer|disburse)\b/.test(lower);
  if (transferVerb) {
    const amount = findAmount(text);
    if (amount && amount.value >= 100) {
      // beneficiary: between verb and amount, or after "to"
      const verbMatch = /\b(send|pay|transfer|disburse)\b/i.exec(text)!;
      const afterVerb = text.slice(verbMatch.index + verbMatch[0].length, amount.start);
      const afterTo = new RegExp(`\\bto\\b(.+)`, 'i').exec(text.slice(amount.end));
      const purposeMatch = /\b(?:for|towards?|regarding|to cover|on)\s+(.+)$/i.exec(text.slice(amount.end + (afterTo?.[0].length ?? 0)));
      const purposeAlt = /\b(?:for|towards?|regarding|to cover)\s+(.+)$/i.exec(text.slice(amount.end));

      let benQuery = '';
      if (afterVerb && /\bto\b/i.test(afterVerb) === false && afterVerb.trim().length > 1) {
        benQuery = afterVerb.replace(/^(?:the\s+)?/i, '').trim();
      }
      if (!benQuery && afterTo?.[1]) benQuery = afterTo[1].trim();
      // if purpose words trail the beneficiary in afterVerb (e.g. "Godwin Engineering for LASCON" before amount) — rare

      let purpose = (purposeMatch?.[1] ?? purposeAlt?.[1] ?? '').trim();
      // strip purpose out of benQuery if embedded
      if (purpose && benQuery.toLowerCase().endsWith(` for ${purpose.toLowerCase()}`)) {
        benQuery = benQuery.slice(0, benQuery.length - (` for ${purpose}`).length);
      }
      benQuery = benQuery.replace(/\b(?:for|with|of|to|a|an|the|naira)\b\s*$/i, '').trim();
      // remove trailing amount words remnants
      benQuery = benQuery.replace(/\s{2,}/g, ' ');
      if (purpose) purpose = purpose.replace(/\b(?:naira|ngn)\.?$/i, '').trim();

      return {
        intent: 'prepare_transfer',
        amount: amount.value,
        beneficiary_query: benQuery || undefined,
        purpose: purpose || undefined,
        period,
      };
    }
    // "pay Godwin" without amount → ask for amount via unknown-path? treat as transfer w/o amount
    const benNamesList = beneficiaryNames.map((n) => ({ name: n }));
    const m = matchBeneficiary(text, benNamesList);
    if (m) {
      return { intent: 'prepare_transfer', beneficiary_query: m.match.name, period };
    }
  }

  // ---- approvals ----
  if (/(need(s)? my approval|needs? approval|pending approvals?|awaiting approval|approvals? queue|what.*approve|which.*approve|ready to authorize|awaiting authorization|approve now)/.test(lower)) {
    return { intent: 'pending_approvals', period };
  }

  // ---- balance ----
  if (/\b(balance|how much (?:do|does) we have|available funds|money do we have|funds do we have|in (?:our|the) account)\b/.test(lower)) {
    return { intent: 'get_balance', period };
  }

  // ---- beneficiary payment history ----
  if (/\b(have we|how much (?:have|did) we|total|paid|sent to|payments to|spent on|paid to)\b/.test(lower)) {
    const names = beneficiaryNames.map((n) => ({ name: n }));
    const m = matchBeneficiary(text, names);
    if (m && /\b(paid|payments?|sent|spend|spent|transfer|transfers|total)\b/.test(lower)) {
      return { intent: 'beneficiary_history', beneficiary_query: m.match.name, period };
    }
  }

  // ---- top vendors ----
  if (/(top\s*\d*|biggest|largest|highest|major)\s+(vendors?|suppliers?|beneficiaries|spenders?|customers?|payers?)|who (are|were) our (top|biggest|largest)|biggest expenses/.test(lower)) {
    const nMatch = /top\s*(\d+)/.exec(lower);
    return { intent: 'top_vendors', period, top_n: nMatch ? parseInt(nMatch[1], 10) : 10 };
  }

  // ---- category spend ----
  const catHit = CATEGORIES.find((c) => new RegExp(`\\b${c}\\b`).test(lower));
  if (catHit && /\b(spend|spent|spending|cost|expenses?)\b/.test(lower)) {
    return { intent: 'category_spend', category: catHit.replace(/\b\w/g, (ch) => ch.toUpperCase()), period };
  }
  // "How much did Operations spend?" — department names (never pronouns: we/they/…)
  const DEPT_SKIP = new Set(['we', 'they', 'you', 'i', 'it', 'he', 'she', 'us', 'our', 'my']);
  const depM = /\bhow much did\s+(\w+)\s+spend\b/.exec(lower);
  if (depM && !DEPT_SKIP.has(depM[1])) {
    const dep = depM[1];
    return { intent: 'category_spend', category: dep[0].toUpperCase() + dep.slice(1), period };
  }

  // ---- search transactions ----
  const mentionsTxns = /\b(transactions?|transfers?|payments?|payouts?)\b/.test(lower);
  const minAmount = /\b(above|over|more than|greater than|at least|>|exceeding)\b/.test(lower) ? findAmount(text)?.value : undefined;
  const maxAmount = /\b(below|under|less than|up to|<)\b/.test(lower) ? findAmount(text)?.value : undefined;
  const wantsList = /\b(show|list|find|search|display|get|give me|view)\b/.test(lower);
  const failedQ = /\bfailed\b|\bdeclined\b|\bunsuccessful\b|\berrors?\b/.test(lower);
  const receivedQ = /\b(received|incoming|inflow|money in|came in|credits?)\b/.test(lower);

  if (failedQ && (mentionsTxns || wantsList)) {
    return { intent: 'search_transactions', status: 'FAILED', period, direction: 'OUT' };
  }
  if (mentionsTxns && (wantsList || minAmount != null || maxAmount != null || receivedQ)) {
    const amountInfo = findAmount(text);
    let mn = minAmount;
    let mx = maxAmount;
    if (mn == null && mx == null && amountInfo && !/\bbalance\b/.test(lower)) {
      if (/\b(above|over|more than|greater than|at least|exceeding)\b/.test(lower)) mn = amountInfo.value;
      if (/\b(below|under|less than|up to)\b/.test(lower)) mx = amountInfo.value;
    }
    return {
      intent: 'search_transactions',
      min_amount: mn,
      max_amount: mx,
      direction: receivedQ ? 'IN' : 'OUT',
      period,
    };
  }

  // ---- spending summary ----
  if (/\b(spend|spent|spending|expenses?|costs?|burn)\b/.test(lower)) {
    return { intent: 'spending_summary', period };
  }

  // ---- greeting / help ----
  if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(lower)) return { intent: 'greeting' };
  if (/\b(help|what can you do|capabilities|commands)\b/.test(lower)) return { intent: 'help' };

  return { intent: 'unknown' };
}

export const SUGGESTIONS = [
  'What is our balance?',
  'How much did we spend this month?',
  'Pay Godwin Engineering ₦520k for LASCON',
  'Which payments need my approval?',
  'Compare August and September expenses',
  'Show transactions above ₦1m this month',
];
