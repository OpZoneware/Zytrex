// Zytrex AI Finance — core domain types
// Shared by server (services, AI tools) and client (cards, pages)

export type Role = 'owner' | 'finance' | 'operations' | 'director' | 'auditor';

export type PaymentStatus =
  | 'DRAFT'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'AWAITING_AUTHORIZATION'
  | 'AUTHORIZED'
  | 'PROCESSING'
  | 'SUCCESSFUL'
  | 'FAILED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'REVERSED'
  | 'EXPIRED';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type VerificationStatus = 'VERIFIED' | 'UNVERIFIED' | 'PENDING';

export interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: Role;
  title: string;
  status: 'ACTIVE' | 'SUSPENDED';
  two_factor_enabled: boolean;
  initials: string;
  color: string;
}

export interface Organization {
  id: string;
  legal_name: string;
  display_name: string;
  country: string;
  base_currency: string;
  kyc_status: string;
  status: string;
  created_at: string;
}

export interface Account {
  id: string;
  organization_id: string;
  label: string;
  provider: string;
  provider_account_id: string;
  currency: string;
  available_balance: number;
  ledger_balance: number;
  status: 'ACTIVE' | 'FROZEN';
}

export interface Beneficiary {
  id: string;
  organization_id: string;
  name: string;
  bank_name: string;
  bank_code: string;
  account_mask: string;
  account_name: string;
  verification_status: VerificationStatus;
  risk_level: RiskLevel;
  created_by: string;
  created_at: string;
  note?: string;
}

export interface ApprovalRecord {
  approver_id: string;
  role: Role;
  decision: 'APPROVED' | 'REJECTED';
  reason?: string;
  at: string;
}

export interface PaymentRequest {
  id: string;
  ref: string;
  organization_id: string;
  beneficiary_id: string;
  amount: number;
  currency: string;
  purpose: string;
  requested_by: string;
  status: PaymentStatus;
  required_approvals: Role[];
  approvals: ApprovalRecord[];
  risk: RiskLevel;
  fee?: number;
  source: 'ai' | 'manual';
  created_at: string;
  scheduled_at?: string;
  expires_at?: string;
  authorized_by?: string;
  transaction_id?: string;
}

export interface Transaction {
  id: string;
  ref: string;
  payment_request_id?: string;
  organization_id: string;
  beneficiary_id?: string;
  counterparty: string;
  direction: 'OUT' | 'IN';
  amount: number;
  currency: string;
  category: string;
  description: string;
  provider: string;
  provider_reference?: string;
  internal_reference: string;
  status: 'SUCCESSFUL' | 'FAILED' | 'PROCESSING' | 'REVERSED';
  failure_reason?: string;
  initiated_at: string;
  completed_at?: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  actor_role?: Role | 'SYSTEM' | 'AI';
  action: string;
  details: string;
  payment_id?: string;
  severity: 'info' | 'warn' | 'critical';
}

export interface PaymentEvent {
  id: string;
  payment_request_id: string;
  status: PaymentStatus;
  note: string;
  at: string;
}

export interface ApprovalTier {
  id: string;
  label: string;
  max_amount: number; // upper bound in NGN
  roles: Role[];
}

export interface PolicyConfig {
  tiers: ApprovalTier[];
  new_beneficiary_requires: Role[];
  outside_hours_extra: boolean;
  block_auditor_actions: boolean;
}

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  summary: string;
  ms: number;
  risk: RiskLevel;
  ok: boolean;
}

// ---------- Chat cards (rendered by the AI Finance screen) ----------

export type ChatCard =
  | {
      kind: 'balance';
      available: number;
      ledger: number;
      currency: string;
      accounts: { label: string; mask: string; balance: number }[];
    }
  | {
      kind: 'spending';
      period: string;
      total: number;
      count: number;
      categories: { name: string; total: number }[];
      change_pct?: number;
      change_label?: string;
    }
  | {
      kind: 'compare';
      a: { label: string; total: number };
      b: { label: string; total: number };
      change_pct: number;
    }
  | {
      kind: 'transactions';
      title: string;
      total: number;
      count: number;
      rows: {
        id: string;
        ref: string;
        counterparty: string;
        amount: number;
        direction: 'IN' | 'OUT';
        status: string;
        category: string;
        date: string;
        description: string;
      }[];
      link?: string;
    }
  | {
      kind: 'transfer_preview';
      beneficiary: {
        id: string;
        name: string;
        bank_name: string;
        account_mask: string;
        verification_status: VerificationStatus;
      };
      amount: number;
      currency: string;
      purpose: string;
      risk: RiskLevel;
      required_approvals: Role[];
      policy_notes: string[];
    }
  | {
      kind: 'payment';
      payment_id: string;
      ref: string;
      amount: number;
      currency: string;
      beneficiary_name: string;
      bank_name: string;
      account_mask: string;
      purpose: string;
      status: PaymentStatus;
      required_approvals: Role[];
      risk: RiskLevel;
      created_at: string;
    }
  | {
      kind: 'approvals';
      rows: {
        payment_id: string;
        ref: string;
        beneficiary_name: string;
        amount: number;
        purpose: string;
        status: PaymentStatus;
        requested_by: string;
        outstanding: Role[];
      }[];
    }
  | {
      kind: 'vendors';
      period: string;
      rows: { name: string; total: number; count: number }[];
      total: number;
    }
  | {
      kind: 'beneficiary_history';
      beneficiary_name: string;
      total: number;
      count: number;
      verified: VerificationStatus;
      bank_name: string;
      account_mask: string;
      rows: { id: string; ref: string; amount: number; date: string; description: string }[];
    }
  | {
      kind: 'info';
      title: string;
      lines: string[];
    };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  cards?: ChatCard[];
  tool_calls?: ToolCallRecord[];
  at: string;
  action?: boolean; // rendered from a UI action rather than a typed message
}

export interface Conversation {
  id: string;
  user_id: string;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
}

export interface DB {
  org: Organization;
  users: User[];
  accounts: Account[];
  beneficiaries: Beneficiary[];
  payment_requests: PaymentRequest[];
  transactions: Transaction[];
  payment_events: PaymentEvent[];
  audit: AuditEntry[];
  conversations: Conversation[];
  policies: PolicyConfig;
  current_user_id: string;
  counters: { payment: number; seq: number };
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'CEO / Owner',
  finance: 'Finance',
  operations: 'Operations',
  director: 'Director',
  auditor: 'Auditor',
};
