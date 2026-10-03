// Append-only within a sandbox session; production requires durable event storage.

import { db, newId } from '../store';
import type { AuditEntry, Role } from '../types';


export function audit(input: {
  actor: string;
  actor_role?: Role | 'SYSTEM' | 'AI';
  action: string;
  details: string;
  payment_id?: string;
  severity?: 'info' | 'warn' | 'critical';
}): AuditEntry {
  const d = db();
  const entry: AuditEntry = {
    id: newId('audit'),
    at: new Date().toISOString(),
    actor: input.actor,
    actor_role: input.actor_role,
    action: input.action,
    details: input.details,
    payment_id: input.payment_id,
    severity: input.severity ?? 'info',
  };
  d.audit.unshift(entry);
  return entry;
}

export function listAudit(limit = 100, paymentId?: string): AuditEntry[] {
  const d = db();
  const rows = paymentId ? d.audit.filter((a) => a.payment_id === paymentId) : d.audit;
  return rows.slice(0, limit);
}
