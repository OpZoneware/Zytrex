'use client';

// Session context: current demo user, user switching, live approval counts.

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export interface SessionUser {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  role: 'owner' | 'finance' | 'operations' | 'director' | 'auditor';
  title: string;
  initials: string;
  color: string;
}

interface SessionCtx {
  user: SessionUser | null;
  users: { id: string; name: string; role: SessionUser['role']; title: string; initials: string; color: string }[];
  org: { name: string; legal_name: string; currency: string } | null;
  pendingCount: number;
  readyCount: number;
  switchUser: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<SessionCtx>({
  user: null,
  users: [],
  org: null,
  pendingCount: 0,
  readyCount: 0,
  switchUser: async () => {},
  refresh: async () => {},
});

export function useSession() {
  return useContext(Ctx);
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<SessionCtx['users']>([]);
  const [org, setOrg] = useState<SessionCtx['org']>(null);
  const [pendingCount, setPending] = useState(0);
  const [readyCount, setReady] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const sRes = await fetch('/api/session');
      const aRes = await fetch('/api/approvals');
      const s = await sRes.json();
      if (s.ok) {
        const c = s.current;
        setUser({
          id: c.id,
          name: `${c.first_name} ${c.last_name}`,
          first_name: c.first_name,
          last_name: c.last_name,
          role: c.role,
          title: c.title,
          initials: c.initials,
          color: c.color,
        });
        setUsers(s.users);
        setOrg(s.org);
      }
      const a = await aRes.json();
      if (a.ok) {
        setPending(a.pending.length);
        setReady(a.ready_to_authorize.length);
      }
    } catch {
      /* sandbox offline — keep last state */
    }
  }, []);

  const switchUser = useCallback(
    async (id: string) => {
      await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: id }),
      });
      await refresh();
    },
    [refresh]
  );

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <Ctx.Provider value={{ user, users, org, pendingCount, readyCount, switchUser, refresh }}>
      {user ? children : <div className="min-h-screen grid place-items-center bg-app text-ink2 text-sm" role="status">Opening your sandbox workspace…</div>}
    </Ctx.Provider>
  );
}
