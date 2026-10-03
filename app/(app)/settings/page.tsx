'use client';

// Settings: company, team, approval policies (live-editable), security, AI policy.

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Building2, Check, Command, Cpu, KeyRound, RefreshCcw, Shield, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/components/shell/session';
import { Badge } from '@/components/ui/badge';
import { ROLE_LABELS, type Role } from '@/lib/types';

const TABS = [
  { id: 'company', label: 'Company', icon: Building2 },
  { id: 'team', label: 'Team & Roles', icon: Users },
  { id: 'policies', label: 'Approval Policies', icon: Shield },
  { id: 'security', label: 'Security', icon: KeyRound },
  { id: 'ai', label: 'Agent & API', icon: Command },
];

interface Policies {
  tiers: { id: string; label: string; roles: Role[] }[];
  new_beneficiary_requires: Role[];
  outside_hours_extra: boolean;
}

const ALL_ROLES: Role[] = ['operations', 'finance', 'owner', 'director'];

function SettingsInner() {
  const params = useSearchParams();
  const { toast } = useToast();
  const { user, refresh } = useSession();
  const [tab, setTab] = useState('company');
  const [policies, setPolicies] = useState<Policies | null>(null);
  const [org, setOrg] = useState<{ legal_name: string; display_name: string; country: string; base_currency: string; kyc_status: string } | null>(null);
  const [team, setTeam] = useState<{ id: string; first_name: string; last_name: string; email: string; role: Role; title: string; two_factor_enabled: boolean }[]>([]);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch('/api/policies').then((x) => x.json());
    if (r.ok) {
      setPolicies(r.policies);
      setOrg(r.org);
      setTeam(r.users);
      setSystemPrompt(r.system_prompt);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = params.get('tab');
    if (t && TABS.some((x) => x.id === t)) setTab(t);
  }, [params]);

  const isOwner = user?.role === 'owner';

  function toggleRole(tierIdx: number, role: Role) {
    if (!policies) return;
    const next = structuredClone(policies) as Policies;
    const roles = next.tiers[tierIdx].roles;
    const i = roles.indexOf(role);
    if (i >= 0) {
      if (roles.length === 1) return; // never allow an empty requirement
      roles.splice(i, 1);
    } else roles.push(role);
    setPolicies(next);
  }

  async function savePolicies() {
    if (!policies) return;
    setSaving(true);
    try {
      const r = await fetch('/api/policies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policies),
      });
      const d = await r.json();
      if (d.ok) {
        toast('success', 'Policies saved', 'The approval engine now enforces the new matrix — audit entry written.');
        await refresh();
      } else toast('error', 'Save failed', d.error);
    } finally {
      setSaving(false);
    }
  }

  async function resetSandbox() {
    if (!confirm('Reset all sandbox data back to the seed state?')) return;
    const r = await fetch('/api/policies', { method: 'DELETE' });
    const d = await r.json();
    if (d.ok) {
      toast('success', 'Sandbox reset', 'Data restored to seed state.');
      await load();
      await refresh();
    } else toast('error', 'Reset failed', d.error);
  }

  return (
    <div className="max-w-4xl space-y-5 anim-fade-in">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Settings</h2>
        <p className="text-ink3 text-[13px] mt-1">Company configuration, roles, approval policy and the AI system contract.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={cn('chip', tab === t.id && 'border-accent/60 text-accent bg-accent/10')}>
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* company */}
      {tab === 'company' && org && (
        <div className="card p-6 space-y-4">
          <h3 className="text-[15px] font-semibold flex items-center gap-2">
            <Building2 size={16} className="text-accent" /> Company profile
          </h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Legal name" value={org.legal_name} />
            <Field label="Display name" value={org.display_name} />
            <Field label="Country" value={org.country} />
            <Field label="Base currency" value={org.base_currency} />
            <Field label="KYC status" value={org.kyc_status} />
            <Field label="Payments provider" value="Zytrex Payments (Sandbox)" />
          </div>
        </div>
      )}

      {/* team */}
      {tab === 'team' && (
        <div className="card overflow-hidden">
          <div className="p-5 border-b border-line">
            <h3 className="text-[15px] font-semibold flex items-center gap-2">
              <Users size={16} className="text-accent" /> Team & roles
            </h3>
            <p className="text-[12.5px] text-ink3 mt-1">Permissions are enforced server-side on every action — not in the UI.</p>
          </div>
          <div className="divide-y divide-line">
            {team.map((m) => (
              <div key={m.id} className="px-5 py-3.5 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold">
                    {m.first_name} {m.last_name}
                    {m.id === user?.id && <span className="ml-2 text-[10px] font-bold text-accent border border-accent/40 rounded px-1.5 py-px">YOU</span>}
                  </div>
                  <div className="text-[12px] text-ink3">
                    {m.title} · {m.email}
                  </div>
                </div>
                <Badge tone={m.role === 'owner' ? 'green' : m.role === 'auditor' ? 'slate' : m.role === 'director' ? 'violet' : m.role === 'finance' ? 'blue' : 'amber'}>
                  {ROLE_LABELS[m.role]}
                </Badge>
                <Badge tone={m.two_factor_enabled ? 'green' : 'amber'}>{m.two_factor_enabled ? '2FA ON' : '2FA OFF'}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* policies */}
      {tab === 'policies' && policies && (
        <div className="space-y-4">
          <div className="card p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-[15px] font-semibold flex items-center gap-2">
                  <Shield size={16} className="text-accent" /> Approval matrix
                </h3>
                <p className="text-[12.5px] text-ink3 mt-1">Checked deterministically by the policy engine on every prepare / approve.</p>
              </div>
              {!isOwner && (
                <Badge tone="amber">READ-ONLY · CEO ONLY</Badge>
              )}
            </div>

            <div className="space-y-3">
              {policies.tiers.map((t, ti) => (
                <div key={t.id} className="rounded-xl border border-line bg-panel2 p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <span className="mono text-[13.5px] font-semibold">{t.label}</span>
                    <span className="text-[11.5px] text-ink3">requires</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ALL_ROLES.map((r) => {
                      const active = t.roles.includes(r);
                      return (
                        <button
                          key={r}
                          disabled={!isOwner}
                          onClick={() => toggleRole(ti, r)}
                          className={cn(
                            'inline-flex items-center gap-1.5 text-[12.5px] font-semibold rounded-lg border px-3 py-1.5 transition disabled:cursor-not-allowed disabled:opacity-70',
                            active ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line2 bg-bg text-ink3 hover:border-line2'
                          )}
                        >
                          {active ? <Check size={12} /> : null} {ROLE_LABELS[r]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-warn/30 bg-warn/[0.05] p-4 mt-4">
              <div className="text-[13px] font-semibold text-warn mb-1">New / unverified beneficiary rule</div>
              <div className="flex flex-wrap gap-2 mt-2">
                {ALL_ROLES.map((r) => {
                  const active = policies.new_beneficiary_requires.includes(r);
                  return (
                    <button
                      key={r}
                      disabled={!isOwner}
                      onClick={() => {
                        const next = structuredClone(policies) as Policies;
                        const i = next.new_beneficiary_requires.indexOf(r);
                        if (i >= 0) {
                          if (next.new_beneficiary_requires.length === 1) return;
                          next.new_beneficiary_requires.splice(i, 1);
                        } else next.new_beneficiary_requires.push(r);
                        setPolicies(next);
                      }}
                      className={cn(
                        'inline-flex items-center gap-1.5 text-[12.5px] font-semibold rounded-lg border px-3 py-1.5 transition disabled:cursor-not-allowed disabled:opacity-70',
                        active ? 'border-warn/50 bg-warn/10 text-warn' : 'border-line2 bg-bg text-ink3'
                      )}
                    >
                      {active ? <Check size={12} /> : null} {ROLE_LABELS[r]}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11.5px] text-ink3 mt-2.5 leading-relaxed">
                Applied on top of the amount tier whenever a beneficiary is not VERIFIED — regardless of amount.
              </p>
            </div>

            {isOwner && (
              <div className="flex items-center gap-3 mt-5 pt-4 border-t border-line">
                <button className="btn btn-primary" onClick={savePolicies} disabled={saving}>
                  {saving ? 'Saving…' : 'Save policies'}
                </button>
                <button className="btn btn-ghost text-danger" onClick={resetSandbox}>
                  <RefreshCcw size={14} /> Reset sandbox data
                </button>
              </div>
            )}
            {!isOwner && (
              <div className="text-[12.5px] text-ink3 mt-4 pt-4 border-t border-line">
                Switch to Daniel Okonkwo (CEO / Owner) to edit approval policies. Changes are audited as critical events.
              </div>
            )}
          </div>
        </div>
      )}

      {/* security */}
      {tab === 'security' && (
        <div className="space-y-4">
          <div className="card p-6 space-y-3.5">
            <h3 className="text-[15px] font-semibold flex items-center gap-2">
              <KeyRound size={16} className="text-accent" /> Authentication
            </h3>
            <SecRow label="Demo authorization PIN" value="123456 (sandbox only)" ok />
            <SecRow label="Production mechanisms" value="Passkey · biometrics · PIN · authenticator OTP · hardware key" ok />
            <SecRow label="Voice as authorization" value="Never — voice only prepares; authorization is a separate gated step" ok />
            <SecRow label="Maker-checker" value="Requesters cannot approve their own payment requests" ok />
            <SecRow label="Session" value="Sandbox demo session — pick any user from the avatar menu" ok />
          </div>
          <div className="card p-6">
            <h3 className="text-[15px] font-semibold flex items-center gap-2 mb-3">
              <Shield size={16} className="text-info" /> Data protection (production plan)
            </h3>
            <ul className="text-[13px] text-ink2 space-y-1.5 leading-relaxed">
              <li>• Beneficiary account numbers encrypted at rest (AES-256) with KMS-managed keys</li>
              <li>• Payment credentials live only in the server-side secrets manager — never in prompts</li>
              <li>• Audit table append-only; AI has no tool that can write to it</li>
              <li>• Rate limits + anomaly rules on prepare/authorize endpoints</li>
            </ul>
          </div>
        </div>
      )}

      {/* AI & API */}
      {tab === 'ai' && (
        <div className="space-y-4">
          <div className="card p-6">
            <h3 className="text-[15px] font-semibold flex items-center gap-2 mb-1">
              <Command size={16} className="text-accent" /> Future AI policy reference
            </h3>
            <p className="text-[12.5px] text-ink3 mb-4">This sandbox uses deterministic commands. This policy documents the intended future model boundary.</p>
            <pre className="text-[12px] font-mono text-ink2 bg-bg border border-line rounded-xl p-4 overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {systemPrompt}
            </pre>
          </div>

          <div className="card p-6">
            <h3 className="text-[15px] font-semibold flex items-center gap-2 mb-3">
              <Cpu size={16} className="text-info" /> Approved tool registry
            </h3>
            <div className="grid sm:grid-cols-2 gap-2">
              {[
                ['get_balance', 'LOW'],
                ['get_spending_summary', 'LOW'],
                ['compare_spending', 'LOW'],
                ['search_transactions', 'LOW'],
                ['find_beneficiary', 'LOW'],
                ['get_beneficiary_history', 'LOW'],
                ['get_pending_approvals', 'LOW'],
                ['get_top_vendors', 'LOW'],
                ['prepare_transfer', 'HIGH'],
                ['prepare_bulk_payment', 'HIGH (V1)'],
                ['get_fx_rate', 'LOW (V1)'],
                ['forecast_cashflow', 'MEDIUM (V1)'],
              ].map(([name, risk]) => (
                <div key={name} className="rounded-lg border border-line bg-panel2 px-3 py-2.5 flex items-center justify-between gap-2">
                  <span className="mono text-[12.5px]">{name}()</span>
                  <span
                    className={cn(
                      'text-[10px] font-bold rounded px-1.5 py-0.5 border',
                      risk.startsWith('HIGH') ? 'text-danger border-danger/40 bg-danger/10' : risk.includes('V1') ? 'text-ink3 border-line2' : 'text-accent border-accent/40 bg-accent/10'
                    )}
                  >
                    {risk}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[12.5px] text-ink3 mt-4 leading-relaxed">
              Commands use server-side services and deterministic risk checks. A production model integration will need
              a validated tool boundary and durable audit records.
            </p>
          </div>

          <div className="card p-6">
            <h3 className="text-[15px] font-semibold flex items-center gap-2 mb-3">
              <KeyRound size={16} className="text-warn" /> API & webhooks
            </h3>
            <div className="space-y-2.5">
              <div className="rounded-lg border border-line bg-panel2 px-3.5 py-3 flex items-center justify-between gap-3">
                <span className="text-[13px] text-ink2">Secret key</span>
                <span className="mono text-[12.5px] text-ink3">No credentials configured</span>
              </div>
              <div className="rounded-lg border border-line bg-panel2 px-3.5 py-3 flex items-center justify-between gap-3">
                <span className="text-[13px] text-ink2">Webhook: payment.settled</span>
                <Badge tone="green">NOT CONNECTED</Badge>
              </div>
              <div className="rounded-lg border border-line bg-panel2 px-3.5 py-3 flex items-center justify-between gap-3">
                <span className="text-[13px] text-ink2">Webhook: approval.required</span>
                <Badge tone="green">NOT CONNECTED</Badge>
              </div>
            </div>
            <p className="text-[12.5px] text-ink3 mt-3.5">
              No live provider or webhook is connected. The gateway abstraction (<span className="mono">SandboxZytrexGateway</span>) is a starting point for
              <span className="mono"> ProductionZytrexGateway</span> without touching the AI layer.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel2 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-ink3 font-semibold">{label}</div>
      <div className="text-[14px] font-medium mt-1">{value}</div>
    </div>
  );
}

function SecRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 pb-3 border-b border-line last:border-0 last:pb-0">
      <span className="text-[13.5px] text-ink2">{label}</span>
      <span className={cn('text-[13.5px] text-right font-medium', ok ? 'text-accent' : 'text-ink')}>
        {ok && <Check size={13} className="inline mr-1 -mt-0.5" />}
        {value}
      </span>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="text-ink3 text-sm">Loading…</div>}>
      <SettingsInner />
    </Suspense>
  );
}
