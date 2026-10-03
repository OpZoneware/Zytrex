import { withSandbox } from '@/lib/sandbox';
import { NextResponse } from 'next/server';
import { db, currentUser, resetDB } from '@/lib/store';
import { audit } from '@/lib/services/audit';
import type { Role } from '@/lib/types';
import { SYSTEM_PROMPT } from '@/lib/ai/prompts';

export const dynamic = 'force-dynamic';

const VALID_ROLES: Role[] = ['owner', 'finance', 'operations', 'director', 'auditor'];

async function handleGET() {
  const d = db();
  return NextResponse.json({
    ok: true,
    policies: d.policies,
    org: d.org,
    users: d.users,
    system_prompt: SYSTEM_PROMPT,
  });
}

async function handlePUT(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
  const user = currentUser();
  if (user.role !== 'owner') {
    return NextResponse.json({ ok: false, error: 'Only the CEO / Owner can change approval policies.' }, { status: 403 });
  }
  const d = db();

  if (Array.isArray(body.tiers)) {
    for (const tier of body.tiers) {
      const target = d.policies.tiers.find((t) => t.id === tier.id);
      if (!target) continue;
      const roles = Array.isArray(tier.roles) ? tier.roles.filter((r: string) => VALID_ROLES.includes(r as Role)) : null;
      if (roles && roles.length) target.roles = roles as Role[];
      if (typeof tier.label === 'string' && tier.label.length < 60) target.label = tier.label;
    }
  }
  if (Array.isArray(body.new_beneficiary_requires)) {
    const roles = body.new_beneficiary_requires.filter((r: string) => VALID_ROLES.includes(r as Role));
    if (roles.length) d.policies.new_beneficiary_requires = roles as Role[];
  }
  if (typeof body.outside_hours_extra === 'boolean') d.policies.outside_hours_extra = body.outside_hours_extra;

  audit({
    actor: `${user.first_name} ${user.last_name}`,
    actor_role: user.role,
    action: 'policy.update',
    details: `Updated approval policies: ${d.policies.tiers.map((t) => `${t.label} → ${t.roles.join('+')}`).join(' | ')}`,
    severity: 'critical',
  });

  return NextResponse.json({ ok: true, policies: d.policies });
}

async function handleDELETE() {
  const user = currentUser();
  if (user.role !== 'owner') {
    return NextResponse.json({ ok: false, error: 'Only the CEO / Owner can reset the sandbox.' }, { status: 403 });
  }
  const d = resetDB();
  audit({ actor: `${user.first_name} ${user.last_name}`, actor_role: user.role, action: 'sandbox.reset', details: 'Sandbox data reset to seed state', severity: 'critical' });
  return NextResponse.json({ ok: true, policies: d.policies });
}

export const GET = withSandbox(handleGET);
export const PUT = withSandbox(handlePUT);
export const DELETE = withSandbox(handleDELETE);
