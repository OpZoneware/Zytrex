import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { seed } from './seed';
import type { DB } from './types';

type Session = { data: DB; touched: number };
const g = globalThis as unknown as { zytrexSessions?: Map<string, Session>; zytrexContext?: AsyncLocalStorage<Session> };
export const sessions = g.zytrexSessions ??= new Map<string, Session>();
export const sandboxContext = g.zytrexContext ??= new AsyncLocalStorage<Session>();
const TTL = 8 * 60 * 60 * 1000;

// Browser-local demo identity, NOT production authentication. No live adapter is enabled.
export function withSandbox<T extends unknown[]>(handler: (req: Request, ...args: T) => Promise<Response>) {
  return async (req: Request, ...args: T): Promise<Response> => {
    if (process.env.PAYMENT_MODE && process.env.PAYMENT_MODE !== 'sandbox') {
      return Response.json({ ok: false, error: 'This build only supports sandbox payments.' }, { status: 503 });
    }
    const origin = req.headers.get('origin');
    // Next may normalize req.url to an internal hostname. Host is the browser's
    // actual request authority; do not trust arbitrary forwarded-host headers.
    const target = new URL(req.url);
    if (req.headers.get('host')) target.host = req.headers.get('host')!;
    if (!['GET', 'HEAD'].includes(req.method) && origin && origin !== target.origin) {
      return Response.json({ ok: false, error: 'Cross-origin changes are not allowed.' }, { status: 403 });
    }
    for (const [key, session] of sessions) if (Date.now() - session.touched > TTL) sessions.delete(key);
    const token = req.headers.get('cookie')?.match(/(?:^|;\s*)zytrex_demo=([a-f0-9-]{36})(?:;|$)/)?.[1];
    let id = token;
    let session = id ? sessions.get(id) : undefined;
    if (!session) {
      if (sessions.size >= 500) return Response.json({ ok: false, error: 'Sandbox is busy. Please try later.' }, { status: 503 });
      id = randomUUID();
      session = { data: seed(), touched: Date.now() };
      sessions.set(id, session);
    }
    session.touched = Date.now();
    const response = await sandboxContext.run(session, async () => {
      try { return await handler(req, ...args); }
      catch { return Response.json({ ok: false, error: 'Unable to complete this request. Refresh the payment status before retrying.' }, { status: 500 }); }
    });
    response.headers.set('Cache-Control', 'no-store');
    response.headers.append('Set-Cookie', `zytrex_demo=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${TTL / 1000}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`);
    return response;
  };
}
