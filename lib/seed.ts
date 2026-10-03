// Deterministic seed data for the Zytrex AI Finance sandbox.
// Figures are calibrated to the demo script:
//   Available balance      ₦28,450,250
//   September spend        ₦8,742,350 across 42 transactions (↑12.4% vs August)
//   Received this month    ₦12,400,000
//   Godwin Engineering     ₦4,720,000 across 8 transactions
//   Pending approvals      4   •   Scheduled payments 7   •   Failed today 1   •   Payments today 23

import type {
  AuditEntry,
  Beneficiary,
  Conversation,
  DB,
  PaymentRequest,
  PolicyConfig,
  Transaction,
  User,
} from './types';

// ---------- deterministic PRNG ----------
function mulberry32(seed: number) {
  let a = seed;
  return function rnd() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20260929);

/** Split `total` into `n` amounts (multiples of `step`) that sum exactly to `total`. */
function splitTotal(total: number, n: number, step = 100): number[] {
  const weights = Array.from({ length: n }, () => 0.55 + rnd());
  const sumW = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((w) => Math.max(step, Math.round((total * w) / sumW / step) * step));
  let diff = total - parts.reduce((a, b) => a + b, 0);
  // absorb rounding into the largest chunks, in `step` increments
  let guard = 0;
  while (diff !== 0 && guard++ < 10000) {
    let idx = 0;
    for (let i = 1; i < parts.length; i++) if (parts[i] > parts[idx]) idx = i;
    if (diff > 0) {
      parts[idx] += diff;
      diff = 0;
    } else {
      const room = parts[idx] - step;
      const take = Math.min(room, -diff);
      if (take <= 0) {
        // spread across all
        parts[idx] = Math.max(step, parts[idx] + diff);
        diff = total - parts.reduce((a, b) => a + b, 0);
      } else {
        parts[idx] -= take;
        diff += take;
      }
    }
  }
  return parts;
}

const TODAY = '2026-09-29';
function isoOn(day: string, hour: number, minute: number): string {
  return `${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

function weekdayDays(year: number, month: string, maxDay: number): string[] {
  const days: string[] = [];
  for (let d = 1; d <= maxDay; d++) {
    const dt = new Date(Date.UTC(year, month === '08' ? 7 : 8, d));
    const wd = dt.getUTCDay();
    if (wd !== 0 && wd !== 6) days.push(`${year}-${month}-${String(d).padStart(2, '0')}`);
  }
  return days;
}

let refSeq = 1000;
function txRef(day: string): string {
  refSeq += 1;
  const suffix = (0xa82000 + refSeq * 37).toString(36).toUpperCase().slice(-6);
  return `ZYT-${day.replace(/-/g, '')}-${suffix}`;
}

export function seed(): DB {
  // ---------------- org / users ----------------
  const org = {
    id: 'org_1',
    legal_name: 'Meridian Industries Limited',
    display_name: 'Meridian Industries',
    country: 'NG',
    base_currency: 'NGN',
    kyc_status: 'APPROVED',
    status: 'ACTIVE',
    created_at: '2025-04-14T09:00:00Z',
  };

  const users: User[] = [
    {
      id: 'usr_daniel',
      first_name: 'Daniel',
      last_name: 'Okonkwo',
      email: 'daniel@meridian.ng',
      role: 'owner',
      title: 'Chief Executive Officer',
      status: 'ACTIVE',
      two_factor_enabled: true,
      initials: 'DO',
      color: '#1E40AF',
    },
    {
      id: 'usr_amara',
      first_name: 'Amara',
      last_name: 'Bello',
      email: 'amara@meridian.ng',
      role: 'finance',
      title: 'Head of Finance',
      status: 'ACTIVE',
      two_factor_enabled: true,
      initials: 'AB',
      color: '#6E8BFF',
    },
    {
      id: 'usr_tunde',
      first_name: 'Tunde',
      last_name: 'Adeyemi',
      email: 'tunde@meridian.ng',
      role: 'operations',
      title: 'Operations Manager',
      status: 'ACTIVE',
      two_factor_enabled: true,
      initials: 'TA',
      color: '#F2A93B',
    },
    {
      id: 'usr_ngozi',
      first_name: 'Ngozi',
      last_name: 'Eze',
      email: 'ngozi@meridian.ng',
      role: 'director',
      title: 'Executive Director',
      status: 'ACTIVE',
      two_factor_enabled: true,
      initials: 'NE',
      color: '#C084FC',
    },
    {
      id: 'usr_chidi',
      first_name: 'Chidi',
      last_name: 'Nwosu',
      email: 'chidi@meridian.ng',
      role: 'auditor',
      title: 'External Auditor',
      status: 'ACTIVE',
      two_factor_enabled: false,
      initials: 'CN',
      color: '#94A3B8',
    },
  ];

  const accounts: DB['accounts'] = [
    {
      id: 'acc_operating',
      organization_id: org.id,
      label: 'Operating Account',
      provider: 'zytrex',
      provider_account_id: 'ZYX-OPS-0001',
      currency: 'NGN',
      available_balance: 28_450_250,
      ledger_balance: 28_450_250,
      status: 'ACTIVE',
    },
  ];

  // ---------------- beneficiaries ----------------
  const beneficiaries: Beneficiary[] = [
    {
      id: 'ben_godwin',
      organization_id: org.id,
      name: 'Godwin Engineering Ltd',
      bank_name: 'GTBank',
      bank_code: 'GTB',
      account_mask: '88210042',
      account_name: 'GODWIN ENGINEERING LTD',
      verification_status: 'VERIFIED',
      risk_level: 'LOW',
      created_by: 'usr_daniel',
      created_at: '2026-09-12T10:14:00Z',
      note: 'LASCON water treatment contractor',
    },
    {
      id: 'ben_rashtaw',
      organization_id: org.id,
      name: 'Rashtaw Water Solutions',
      bank_name: 'Access Bank',
      bank_code: 'ACC',
      account_mask: '77317318',
      account_name: 'RASHTAW WATER SOLUTIONS LTD',
      verification_status: 'VERIFIED',
      risk_level: 'LOW',
      created_by: 'usr_amara',
      created_at: '2026-03-03T09:00:00Z',
      note: 'Water treatment chemicals',
    },
    {
      id: 'ben_abc',
      organization_id: org.id,
      name: 'ABC Construction Ltd',
      bank_name: 'Zenith Bank',
      bank_code: 'ZEN',
      account_mask: '55202291',
      account_name: 'ABC CONSTRUCTION LIMITED',
      verification_status: 'VERIFIED',
      risk_level: 'LOW',
      created_by: 'usr_daniel',
      created_at: '2025-11-21T09:00:00Z',
      note: 'Lekki Phase 2 site contractor',
    },
    {
      id: 'ben_prime',
      organization_id: org.id,
      name: 'Prime Logistics',
      bank_name: 'UBA',
      bank_code: 'UBA',
      account_mask: '33908742',
      account_name: 'PRIME LOGISTICS NG',
      verification_status: 'VERIFIED',
      risk_level: 'LOW',
      created_by: 'usr_tunde',
      created_at: '2026-01-16T09:00:00Z',
      note: 'National dispatch partner',
    },
    {
      id: 'ben_delta',
      organization_id: org.id,
      name: 'Delta Steel Works',
      bank_name: 'Zenith Bank',
      bank_code: 'ZEN',
      account_mask: '66140917',
      account_name: 'DELTA STEEL WORKS',
      verification_status: 'UNVERIFIED',
      risk_level: 'HIGH',
      created_by: 'usr_amara',
      created_at: '2026-09-28T16:40:00Z',
      note: 'New beneficiary — bank account verification pending',
    },
  ];

  // ---------------- policies ----------------
  const policies: PolicyConfig = {
    tiers: [
      { id: 'tier1', label: '≤ ₦100,000', max_amount: 100_000, roles: ['operations'] },
      { id: 'tier2', label: '₦100,001 – ₦1,000,000', max_amount: 1_000_000, roles: ['finance'] },
      { id: 'tier3', label: '₦1,000,001 – ₦5,000,000', max_amount: 5_000_000, roles: ['finance', 'owner'] },
      { id: 'tier4', label: '> ₦5,000,000', max_amount: Infinity, roles: ['finance', 'owner', 'director'] },
    ],
    new_beneficiary_requires: ['finance', 'owner'],
    outside_hours_extra: true,
    block_auditor_actions: true,
  };

  // ---------------- transactions ----------------
  const transactions: Transaction[] = [];
  const outTx = (partial: Partial<Transaction> & { amount: number; day: string }): void => {
    const { day, ...rest } = partial;
    const hour = 8 + Math.floor(rnd() * 9);
    const minute = Math.floor(rnd() * 60);
    const initiated = isoOn(day, hour, minute);
    transactions.push({
      id: `txn_${transactions.length + 1}`,
      ref: txRef(day),
      organization_id: org.id,
      counterparty: rest.counterparty ?? 'Unknown',
      direction: 'OUT',
      amount: rest.amount,
      currency: 'NGN',
      category: rest.category ?? 'Other',
      description: rest.description ?? '',
      provider: 'zytrex',
      provider_reference: `ZXP${Math.floor(rnd() * 9e8 + 1e8)}`,
      internal_reference: '',
      status: 'SUCCESSFUL',
      beneficiary_id: rest.beneficiary_id,
      payment_request_id: rest.payment_request_id,
      initiated_at: initiated,
      completed_at: initiated,
    });
  };

  const vendorVendors = ['Rashtaw Water Solutions', 'ABC Construction Ltd', 'Kalob Chemicals', 'Metropolis Papers Ltd', 'Broadgate Systems'];
  const opsVendors = ['Prime Logistics', 'Eko Electricity', 'Lagos Water Corporation', 'Facilite Facilities Ltd', 'HiGas Energy', 'Lagos Waste Services'];

  // --- September: 42 outgoing, total 8,742,350 ---
  const sepSepDays = weekdayDays(2026, '09', 28); // business days 1..28

  const godwinSep: number[] = [1_200_000, 820_000, 520_000, 360_000]; // 2,900,000
  const vendorRest = splitTotal(4_100_000 - 2_900_000, 10); // 1,200,000
  const opsBig = 1_150_000;
  const opsAmounts = splitTotal(2_300_000 - opsBig, 13);
  const payrollAmounts = [1_600_000]; // one clean monthly payroll batch
  const otherAmounts = splitTotal(742_350, 13, 50); // 4,100,000 + 2,300,000 + 1,600,000 + 742,350 = 8,742,350

  type SepItem = { category: string; amount: number; vendor: string; description: string };
  const sepItems: SepItem[] = [];

  const godwinDescs = [
    'Godwin Engineering — LASCON phase 1 payment',
    'Godwin Engineering — equipment mobilisation',
    'Godwin Engineering — water treatment tanks',
    'Godwin Engineering — spares & consumables',
  ];
  godwinSep.forEach((amount, i) =>
    sepItems.push({ category: 'Vendor payments', amount, vendor: 'Godwin Engineering Ltd', description: godwinDescs[i] })
  );

  const restMeta = [
    ['Rashtaw Water Solutions', 'Rashtaw — treatment chemicals'],
    ['ABC Construction Ltd', 'ABC — site materials'],
    ['Kalob Chemicals', 'Kalob — process chemicals'],
    ['Broadgate Systems', 'Broadgate — network upgrade'],
    ['Metropolis Papers Ltd', 'Metropolis — stationery restock'],
    ['Rashtaw Water Solutions', 'Rashtaw — filtration media'],
    ['ABC Construction Ltd', 'ABC — civil works milestone'],
    ['Kalob Chemicals', 'Kalob — lab reagents'],
    ['Broadgate Systems', 'Broadgate — licence renewal'],
    ['Rashtaw Water Solutions', 'Rashtaw — emergency callout'],
  ] as const;
  vendorRest.forEach((amount, i) =>
    sepItems.push({ category: 'Vendor payments', amount, vendor: restMeta[i][0], description: restMeta[i][1] })
  );

  sepItems.push({
    category: 'Operations',
    amount: opsBig,
    vendor: 'Facilite Facilities Ltd',
    description: 'Facilite — annual facility settlement',
  });
  opsAmounts.forEach((amount, i) => {
    const vendor = opsVendors[i % opsVendors.length];
    sepItems.push({ category: 'Operations', amount, vendor, description: `${vendor} — September services` });
  });

  sepItems.push({
    category: 'Payroll',
    amount: payrollAmounts[0],
    vendor: 'Meridian Staff Payroll',
    description: 'September payroll — staff & contractors',
  });

  const otherMeta = [
    ['Microsoft 365', 'Microsoft 365 — business licences'],
    ['Amazon Web Services', 'AWS — cloud infrastructure'],
    ['Google Workspace', 'Google Workspace — seats'],
    ['Zenith Bank', 'Bank charges — September'],
    ['GTBank', 'Bank charges — transfers'],
    ['Ibom Air', 'Lagos–Uyo travel — operations'],
    ['Uber for Business', 'Staff transport — operations'],
    ['Slack', 'Slack — Business+ plan'],
    ['Zoom', 'Zoom — annual renewal'],
    ['Figma', 'Figma — design team seats'],
    ['DHL Express', 'DHL — document dispatch'],
    ['Notion', 'Notion — company workspace'],
    ['Dropbox', 'Dropbox — archive storage'],
  ] as const;
  otherAmounts.forEach((amount, i) =>
    sepItems.push({ category: 'Other', amount, vendor: otherMeta[i][0], description: otherMeta[i][1] })
  );

  // sanity: 42 items, exact totals
  if (sepItems.length !== 42) throw new Error(`Sep item count ${sepItems.length} != 42`);
  const sepSum = sepItems.reduce((a, b) => a + b.amount, 0);
  if (sepSum !== 8_742_350) throw new Error(`Sep sum ${sepSum} != 8742350`);

  // dates: payroll both today; 21 more today; remaining 19 on business days 1..28
  const todayPool: number[] = []; // indexes into sepItems
  sepItems.forEach((it, i) => {
    if (it.category === 'Payroll') todayPool.push(i);
  });
  const others = sepItems.map((_, i) => i).filter((i) => !todayPool.includes(i));
  // deterministic shuffle
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  while (todayPool.length < 23) todayPool.push(others.pop()!);
  const todaySet = new Set(todayPool);

  sepItems.forEach((item, idx) => {
    let day: string;
    if (todaySet.has(idx)) day = TODAY;
    else day = sepSepDays[Math.floor(rnd() * sepSepDays.length)] ?? TODAY;
    outTx({
      amount: item.amount,
      day,
      beneficiary_id:
        item.vendor === 'Godwin Engineering Ltd'
          ? 'ben_godwin'
          : item.vendor === 'Rashtaw Water Solutions'
            ? 'ben_rashtaw'
            : item.vendor === 'ABC Construction Ltd'
              ? 'ben_abc'
              : item.vendor === 'Prime Logistics'
                ? 'ben_prime'
                : undefined,
      counterparty: item.vendor,
      category: item.category,
      description: item.description,
      internal_reference: '',
    } as Partial<Transaction> & { amount: number; day: string });
  });

  // Fix Godwin dates: 3, 11, 18, 25 Sep (none today, so the live demo payment stands out)
  const godwinTxns = transactions.filter((t) => t.counterparty === 'Godwin Engineering Ltd');
  const godwinDays = ['2026-09-03', '2026-09-11', '2026-09-18', '2026-09-25'];
  godwinTxns.forEach((t, i) => {
    if (godwinDays[i]) {
      const nt = isoOn(godwinDays[i], 10 + i, 15 + i * 7);
      t.initiated_at = nt;
      t.completed_at = nt;
      t.ref = txRef(godwinDays[i]);
    }
  });

  // If earlier-date assignment duplicated days, that's fine — dates only need to look plausible.
  // Rebalance: ensure exactly 23 successful OUT txns dated today
  let todayCount = transactions.filter((t) => t.direction === 'OUT' && t.initiated_at.startsWith(TODAY)).length;
  if (todayCount > 23) {
    const extra = transactions.filter((t) => t.direction === 'OUT' && t.initiated_at.startsWith(TODAY) && t.category !== 'Payroll');
    let k = 0;
    while (todayCount > 23 && k < extra.length) {
      const t = extra[k++];
      if (godwinTxns.includes(t)) continue;
      const day = sepSepDays[Math.floor(rnd() * sepSepDays.length)];
      const nt = isoOn(day, 9 + Math.floor(rnd() * 8), Math.floor(rnd() * 60));
      t.initiated_at = nt;
      t.completed_at = nt;
      todayCount--;
    }
  } else if (todayCount < 23) {
    const notToday = transactions.filter((t) => t.direction === 'OUT' && !t.initiated_at.startsWith(TODAY) && t.category !== 'Payroll');
    let k = 0;
    while (todayCount < 23 && k < notToday.length) {
      const t = notToday[k++];
      if (godwinTxns.includes(t)) continue;
      const nt = isoOn(TODAY, 8 + Math.floor(rnd() * 9), Math.floor(rnd() * 60));
      t.initiated_at = nt;
      t.completed_at = nt;
      todayCount++;
    }
  }

  // --- August: 40 outgoing, total 7,777,800 (→ +12.4% MoM) ---
  const augGodwin: number[] = [450_000, 610_000, 380_000, 380_000]; // 1,820,000
  const augRest = splitTotal(7_777_800 - 1_820_000, 36);
  const augDays = weekdayDays(2026, '08', 31);
  const augVendorPool = [...vendorVendors, ...opsVendors, 'Kalob Chemicals', 'Ibom Air', 'TotalEnergies Fleet'];
  const augCategories: Record<string, string> = {};
  augVendorPool.forEach((v) => {
    augCategories[v] = ['Eko Electricity', 'Lagos Water Corporation', 'Facilite Facilities Ltd', 'HiGas Energy', 'Lagos Waste Services', 'Ibom Air'].includes(v)
      ? 'Operations'
      : 'Vendor payments';
  });

  augGodwin.forEach((amount, i) => {
    const day = augDays[2 + i * 5];
    outTx({
      amount,
      day,
      beneficiary_id: 'ben_godwin',
      counterparty: 'Godwin Engineering Ltd',
      category: 'Vendor payments',
      description: ['Godwin Engineering — site survey', 'Godwin Engineering — pump station works', 'Godwin Engineering — piping works', 'Godwin Engineering — installation support'][i],
    } as Partial<Transaction> & { amount: number; day: string });
  });
  augRest.forEach((amount, i) => {
    const day = augDays[Math.floor(rnd() * augDays.length)];
    const vendor = augVendorPool[i % augVendorPool.length];
    outTx({
      amount,
      day,
      beneficiary_id:
        vendor === 'Rashtaw Water Solutions'
          ? 'ben_rashtaw'
          : vendor === 'ABC Construction Ltd'
            ? 'ben_abc'
            : vendor === 'Prime Logistics'
              ? 'ben_prime'
              : undefined,
      counterparty: vendor,
      category: i % 9 === 0 ? 'Payroll' : i % 5 === 0 ? 'Other' : augCategories[vendor] ?? 'Vendor payments',
      description: `${vendor} — August services`,
    } as Partial<Transaction> & { amount: number; day: string });
  });

  const augSum = transactions.filter((t) => t.direction === 'OUT' && t.initiated_at.startsWith('2026-08')).reduce((a, b) => a + b.amount, 0);
  if (augSum !== 7_777_800) throw new Error(`Aug sum ${augSum} != 7777800`);

  // --- inflows this month: ₦12,400,000 ---
  const inflows = [4_500_000, 3_200_000, 2_100_000, 1_150_000, 850_000, 600_000];
  const inflowFrom = [
    'Bluecrest Energy Ltd',
    'Harcourt Retail Group',
    'Lakefield Foods NG',
    'Ternary Software Ltd',
    'Osborn Medical Services',
    'Cornerstone Micro-Finance',
  ];
  const inflowDays = ['2026-09-29', '2026-09-24', '2026-09-17', '2026-09-10', '2026-09-04', '2026-09-02'];
  inflows.forEach((amount, i) => {
    const day = inflowDays[i];
    const initiated = isoOn(day, 9 + Math.floor(rnd() * 8), Math.floor(rnd() * 60));
    transactions.push({
      id: `txn_${transactions.length + 1}`,
      ref: txRef(day),
      organization_id: org.id,
      direction: 'IN',
      amount,
      currency: 'NGN',
      counterparty: inflowFrom[i],
      category: 'Revenue',
      description: `Customer settlement — ${inflowFrom[i]}`,
      provider: 'zytrex',
      provider_reference: `ZXP${Math.floor(rnd() * 9e8 + 1e8)}`,
      internal_reference: '',
      status: 'SUCCESSFUL',
      initiated_at: initiated,
      completed_at: initiated,
    });
  });

  // --- one failed transaction today ---
  const failDay = TODAY;
  const failAt = isoOn(failDay, 11, 26);
  transactions.push({
    id: `txn_${transactions.length + 1}`,
    ref: txRef(failDay),
    organization_id: org.id,
    beneficiary_id: 'ben_rashtaw',
    counterparty: 'Rashtaw Water Solutions',
    direction: 'OUT',
    amount: 340_000,
    currency: 'NGN',
    category: 'Vendor payments',
    description: 'Rashtaw — auto-debit replenishment',
    provider: 'zytrex',
    provider_reference: `ZXP${Math.floor(rnd() * 9e8 + 1e8)}`,
    internal_reference: '',
    status: 'FAILED',
    failure_reason: 'Beneficiary bank rail timed out after 3 retries',
    initiated_at: failAt,
  });

  // sort by date desc for stable listing
  transactions.sort((a, b) => (a.initiated_at < b.initiated_at ? 1 : -1));

  // ---------------- payment requests ----------------
  const payment_requests: PaymentRequest[] = [];
  const payment_events: DB['payment_events'] = [];

  const mkPayment = (
    n: number,
    fields: Partial<PaymentRequest> & { beneficiary_id: string; amount: number; purpose: string; requested_by: string }
  ): PaymentRequest => {
    const p: PaymentRequest = {
      id: `pay_${n}`,
      ref: `PAY-${284000 + n}`,
      organization_id: org.id,
      currency: 'NGN',
      status: 'AWAITING_APPROVAL',
      required_approvals: [],
      approvals: [],
      risk: 'MEDIUM',
      source: 'manual',
      created_at: '2026-09-29T09:00:00',
      ...fields,
    } as PaymentRequest;
    payment_requests.push(p);
    payment_events.push({
      id: `evt_${payment_events.length + 1}`,
      payment_request_id: p.id,
      status: 'AWAITING_APPROVAL',
      note: 'Payment prepared and submitted for approval',
      at: p.created_at,
    });
    return p;
  };

  // 4 pending approvals (pending = AWAITING_APPROVAL)
  mkPayment(91, {
    beneficiary_id: 'ben_abc',
    amount: 1_250_000,
    purpose: 'Site materials — Lekki Phase 2',
    requested_by: 'usr_tunde',
    status: 'AWAITING_APPROVAL',
    required_approvals: ['finance', 'owner'],
    risk: 'HIGH',
    source: 'manual',
    created_at: '2026-09-29T08:47:00',
  });
  mkPayment(92, {
    beneficiary_id: 'ben_rashtaw',
    amount: 850_000,
    purpose: 'Water treatment chemicals — September',
    requested_by: 'usr_tunde',
    status: 'AWAITING_APPROVAL',
    required_approvals: ['finance'],
    risk: 'MEDIUM',
    source: 'ai',
    created_at: '2026-09-29T09:12:00',
  });
  mkPayment(93, {
    beneficiary_id: 'ben_prime',
    amount: 65_000,
    purpose: 'Dispatch settlement — Q3 balance',
    requested_by: 'usr_amara',
    status: 'AWAITING_APPROVAL',
    required_approvals: ['operations'],
    risk: 'LOW',
    source: 'manual',
    created_at: '2026-09-29T10:03:00',
  });
  mkPayment(94, {
    beneficiary_id: 'ben_delta',
    amount: 2_100_000,
    purpose: 'Structural steel supply — new vendor trial',
    requested_by: 'usr_tunde',
    status: 'AWAITING_APPROVAL',
    required_approvals: ['finance', 'owner'],
    risk: 'HIGH',
    source: 'ai',
    created_at: '2026-09-29T10:31:00',
  });

  // 1 fully approved, waiting for authorization
  const readyRef = mkPayment(90, {
    beneficiary_id: 'ben_prime',
    amount: 340_000,
    purpose: 'Emergency delivery — Port Harcourt branch',
    requested_by: 'usr_tunde',
    status: 'AWAITING_AUTHORIZATION',
    required_approvals: ['finance'],
    approvals: [
      { approver_id: 'usr_amara', role: 'finance', decision: 'APPROVED', at: '2026-09-29T11:44:00' },
    ],
    risk: 'MEDIUM',
    source: 'manual',
    created_at: '2026-09-29T11:20:00',
  });
  payment_events.push({
    id: `evt_${payment_events.length + 1}`,
    payment_request_id: readyRef.id,
    status: 'AWAITING_AUTHORIZATION',
    note: 'Approved by Amara Bello — ready for authorization',
    at: '2026-09-29T11:44:00',
  });

  // 7 scheduled drafts
  const scheduled: [string, number, string, string][] = [
    ['ben_abc', 2_400_000, 'Site materials — milestone 3', '2026-10-02'],
    ['ben_rashtaw', 420_000, 'October chemical dosing', '2026-10-03'],
    ['ben_prime', 185_000, 'Fleet fuelling — October', '2026-10-05'],
    ['ben_godwin', 950_000, 'LASCON phase 2 mobilisation', '2026-10-06'],
    ['ben_abc', 310_000, 'Scaffolding rental', '2026-10-08'],
    ['ben_prime', 64_000, 'Dispatch retainer', '2026-10-09'],
    ['ben_rashtaw', 150_000, 'Laboratory testing fees', '2026-10-12'],
  ];
  scheduled.forEach(([ben, amount, purpose, when], i) => {
    mkPayment(95 + i, {
      beneficiary_id: ben,
      amount,
      purpose,
      requested_by: 'usr_amara',
      status: 'DRAFT',
      required_approvals: amount <= 100_000 ? ['operations'] : amount <= 1_000_000 ? ['finance'] : ['finance', 'owner'],
      risk: amount <= 100_000 ? 'LOW' : amount <= 1_000_000 ? 'MEDIUM' : 'HIGH',
      scheduled_at: `${when}T09:00:00`,
      created_at: '2026-09-28T16:10:00',
    });
  });

  // ---------------- audit ----------------
  const audit: AuditEntry[] = [
    { id: 'aud_1', at: '2026-09-29T08:41:00', actor: 'Tunde Adeyemi', actor_role: 'operations', action: 'auth.login', details: 'Signed in from Lagos, NG • Chrome / macOS', severity: 'info' },
    { id: 'aud_2', at: '2026-09-29T08:47:00', actor: 'Tunde Adeyemi', actor_role: 'operations', action: 'payment.prepare', details: 'Prepared PAY-284091 — ₦1,250,000 to ABC Construction Ltd', payment_id: 'pay_91', severity: 'info' },
    { id: 'aud_3', at: '2026-09-29T09:12:00', actor: 'Zytrex AI', actor_role: 'AI', action: 'ai.tool_call', details: 'prepare_transfer → PAY-284092 (₦850,000 to Rashtaw Water Solutions)', payment_id: 'pay_92', severity: 'info' },
    { id: 'aud_4', at: '2026-09-29T10:31:00', actor: 'Tunde Adeyemi', actor_role: 'operations', action: 'payment.prepare', details: 'Prepared PAY-284094 — ₦2,100,000 to Delta Steel Works (unverified beneficiary)', payment_id: 'pay_94', severity: 'warn' },
    { id: 'aud_5', at: '2026-09-29T11:20:00', actor: 'Tunde Adeyemi', actor_role: 'operations', action: 'payment.prepare', details: 'Prepared PAY-284090 — ₦340,000 to Prime Logistics', payment_id: 'pay_90', severity: 'info' },
    { id: 'aud_6', at: '2026-09-29T11:44:00', actor: 'Amara Bello', actor_role: 'finance', action: 'payment.approve', details: 'Approved PAY-284090 — ready for authorization', payment_id: 'pay_90', severity: 'info' },
    { id: 'aud_7', at: '2026-09-29T11:26:00', actor: 'Zytrex Payments', actor_role: 'SYSTEM', action: 'payment.failed', details: 'Transaction to Rashtaw Water Solutions failed — rail timeout', severity: 'warn' },
    { id: 'aud_8', at: '2026-09-29T08:35:00', actor: 'Daniel Okonkwo', actor_role: 'owner', action: 'auth.login', details: 'Signed in from Lagos, NG • Safari / iPhone (passkey)', severity: 'info' },
  ];
  audit.sort((a, b) => (a.at < b.at ? 1 : -1));

  const conversations: Conversation[] = [];

  return {
    org,
    users,
    accounts,
    beneficiaries,
    payment_requests,
    transactions,
    payment_events,
    audit,
    conversations,
    policies,
    current_user_id: 'usr_daniel',
    counters: { payment: 284101, seq: 5000 },
  };
}
