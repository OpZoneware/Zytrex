import { withSandbox } from '@/lib/sandbox';
import { NextResponse } from 'next/server';
import { db, currentUser, setCurrentUser } from '@/lib/store';
import { audit } from '@/lib/services/audit';

export const dynamic = 'force-dynamic';

async function handleGET() {
  const d = db();
  const user = currentUser();
  return NextResponse.json({
    ok: true,
    current: user,
    users: d.users.map((u) => ({
      id: u.id,
      name: `${u.first_name} ${u.last_name}`,
      role: u.role,
      title: u.title,
      initials: u.initials,
      color: u.color,
    })),
    org: { name: d.org.display_name, legal_name: d.org.legal_name, currency: d.org.base_currency },
  });
}

async function handlePOST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const user = setCurrentUser(String(body.user_id ?? ''));
  if (!user) return NextResponse.json({ ok: false, error: 'Unknown user' }, { status: 400 });
  audit({ actor: user.id, actor_role: user.role, action: 'sandbox.role_switch', details: `Simulated role selected: ${user.role}` });
  return NextResponse.json({ ok: true, current: user });
}

export const GET = withSandbox(handleGET);
export const POST = withSandbox(handlePOST);
