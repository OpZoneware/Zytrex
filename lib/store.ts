// Modular-monolith store: single in-memory database instance on globalThis
// so it survives Next.js dev-server HMR reloads. Swappable for PostgreSQL later.

import { seed } from './seed';
import type { DB, User } from './types';
import { sandboxContext } from './sandbox';

const g = globalThis as unknown as { __zytrexDB?: DB };

export function db(): DB {
  const session = sandboxContext.getStore();
  if (session) return session.data;
  if (!g.__zytrexDB) g.__zytrexDB = seed();
  return g.__zytrexDB;
}

export function resetDB(): DB {
  const previous = db();
  if (previous.payment_requests.some((p) => p.status === 'PROCESSING')) throw new Error('Cannot reset while a payment is processing.');
  const session = sandboxContext.getStore();
  if (session) {
    session.data = seed();
    session.data.audit = previous.audit;
    return session.data;
  }
  g.__zytrexDB = seed();
  return g.__zytrexDB;
}

export function currentUser(): User {
  const d = db();
  return d.users.find((u) => u.id === d.current_user_id) ?? d.users[0];
}

export function userById(id: string): User | undefined {
  return db().users.find((u) => u.id === id);
}

export function setCurrentUser(id: string): User | undefined {
  const d = db();
  const u = d.users.find((x) => x.id === id);
  if (u) d.current_user_id = id;
  return u;
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
