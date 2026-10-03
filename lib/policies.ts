// Approval policy engine — deterministic backend rules.
// The AI never decides risk on its own; everything flows through here.

import type { Beneficiary, PaymentRequest, PolicyConfig, RiskLevel, Role, User } from './types';
import { scenarioNow } from './clock';

export function tierFor(policies: PolicyConfig, amount: number) {
  return policies.tiers.find((t) => amount <= t.max_amount) ?? policies.tiers[policies.tiers.length - 1];
}

/** Which roles must approve this payment? */
export function requiredApprovals(policies: PolicyConfig, amount: number, beneficiary: Beneficiary): Role[] {
  const tier = policies.tiers.find((t) => amount <= t.max_amount) ?? policies.tiers[policies.tiers.length - 1];
  const roles = new Set<Role>(tier.roles);
  if (beneficiary && beneficiary.verification_status !== 'VERIFIED') {
    for (const r of policies.new_beneficiary_requires) roles.add(r);
  }
  return Array.from(roles);
}

export function riskFor(amount: number, beneficiary?: Pick<Beneficiary, 'verification_status'>): RiskLevel {
  const unverified = beneficiary && beneficiary.verification_status !== 'VERIFIED';
  if (unverified || amount > 5_000_000) return 'HIGH';
  if (amount > 1_000_000) return 'HIGH';
  if (amount > 100_000) return 'MEDIUM';
  return 'LOW';
}

/** Role seniority for substitution: finance can cover operations, owner can cover finance + operations. */
export function canSatisfy(approverRole: Role, requiredRole: Role): boolean {
  return approverRole === requiredRole;
}

export function outstandingRoles(payment: PaymentRequest): Role[] {
  const approvals = payment.approvals.filter((a) => a.decision === 'APPROVED');
  return payment.required_approvals.filter((r) => !approvals.some((a) => canSatisfy(a.role, r)));
}

export function rolesSatisfiedBy(payment: PaymentRequest, user: User): Role[] {
  const outstanding = outstandingRoles(payment);
  return outstanding.filter((r) => canSatisfy(user.role, r));
}

export function canApprove(user: User, payment: PaymentRequest): boolean {
  if (user.status !== 'ACTIVE') return false;
  if (payment.requested_by === user.id) return false; // maker-checker
  if (user.role === 'auditor') return false;
  if (payment.status !== 'AWAITING_APPROVAL') return false;
  return rolesSatisfiedBy(payment, user).length > 0;
}

export function canAuthorize(user: User, payment: PaymentRequest): boolean {
  if (user.role === 'auditor' || user.status !== 'ACTIVE') return false;
  if (payment.status !== 'AWAITING_AUTHORIZATION') return false;
  return user.role === 'owner' || user.role === 'director' || user.role === 'finance';
}

export function canPrepare(user: User): boolean {
  return user.role !== 'auditor';
}

export function policyNotes(policies: PolicyConfig, amount: number, beneficiary: Beneficiary): string[] {
  const notes: string[] = [];
  const tier = policies.tiers.find((t) => amount <= t.max_amount) ?? policies.tiers[policies.tiers.length - 1];
  notes.push(`Amount band: ${tier.label} → ${tier.roles.join(' + ')} approval`);
  if (beneficiary.verification_status !== 'VERIFIED') {
    notes.push('Unverified beneficiary → extra Finance + CEO approval and account verification required');
  }
  if (amount > 5_000_000) notes.push('Large transfer → Director sign-off required');
  const hour = scenarioNow().getUTCHours() + 1;
  if (policies.outside_hours_extra && (hour < 8 || hour > 18)) {
    notes.push('Outside business hours → additional authorization flagged');
  }
  notes.push('Final authorization happens outside the AI, with PIN / passkey');
  return notes;
}
