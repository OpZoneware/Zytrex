import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { seed } from './seed';
import { persistSession, SessionExpired, SESSION_TTL_SECONDS, type SandboxSession } from './persistence';

const g = globalThis as unknown as { zytrexSessions?: Map<string, SandboxSession>; zytrexContext?: AsyncLocalStorage<SandboxSession> };
export const sessions = g.zytrexSessions ??= new Map<string, SandboxSession>();
export const sandboxContext = g.zytrexContext ??= new AsyncLocalStorage<SandboxSession>();

function failure(error: string, status: number) {
  return Response.json({ ok: false, error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

// Opaque browser identity is demo authorization only, never a live-money login.
export function withSandbox<T extends unknown[]>(handler: (req: Request, ...args: T) => Promise<Response>) {
  return async (req: Request, ...args: T): Promise<Response> => {
    if (process.env.PAYMENT_MODE && process.env.PAYMENT_MODE !== 'sandbox') return failure('This build only supports sandbox payments.', 503);
    const target = new URL(req.url);
    if (req.headers.get('host')) target.host = req.headers.get('host')!;
    if (process.env.VERCEL) target.protocol = 'https:';
    let expectedOrigin = target.origin;
    try { if (process.env.APP_ORIGIN) expectedOrigin = new URL(process.env.APP_ORIGIN).origin; }
    catch { return failure('Sandbox origin configuration is invalid.', 503); }
    const origin = req.headers.get('origin');
    if (!['GET', 'HEAD'].includes(req.method) && ((origin && origin !== expectedOrigin) || req.headers.get('sec-fetch-site') === 'cross-site')) {
      return failure('Cross-origin changes are not allowed.', 403);
    }
    const persistent = Boolean(process.env.DATABASE_URL);
    // Never silently switch a deployed application to per-instance memory.
    if (!persistent && (process.env.VERCEL || process.env.NODE_ENV === 'production')) return failure('Sandbox storage is not configured. Connect PostgreSQL before deployment.', 503);
    const rawCookie = req.headers.get('cookie')?.match(/(?:^|;\s*)zytrex_demo=([^;]*)(?:;|$)/)?.[1];
    const token = rawCookie && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(rawCookie) ? rawCookie : undefined;
    const id = token ?? randomUUID();
    const secure = Boolean(process.env.VERCEL) || target.protocol === 'https:';
    try {
      if (rawCookie && !token) throw new SessionExpired();
      const run = (session: SandboxSession) => sandboxContext.run(session, () => handler(req, ...args));
      let response: Response;
      if (persistent) {
        response = await persistSession(id, !token, run);
      } else {
        for (const [key, value] of sessions) if (Date.now() - value.touched > SESSION_TTL_SECONDS * 1000) sessions.delete(key);
        let session = sessions.get(id);
        if (token && !session) throw new SessionExpired();
        if (!session) {
          if (sessions.size >= 500) return failure('Sandbox is busy. Please try later.', 503);
          session = { data: seed(), touched: Date.now() };
          sessions.set(id, session);
        }
        session.touched = Date.now();
        response = await run(session);
      }
      response.headers.set('Cache-Control', 'no-store');
      if (response.status < 500) response.headers.append('Set-Cookie', `zytrex_demo=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure ? '; Secure' : ''}`);
      return response;
    } catch (error) {
      if (error instanceof SessionExpired) {
        const response = failure('Your sandbox session has expired. Open a new sandbox from the sign-in page.', 401);
        response.headers.set('Set-Cookie', `zytrex_demo=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`);
        return response;
      }
      // No mutation response is sent until its database commit succeeds.
      return failure('Unable to save sandbox state. Refresh the payment status before retrying.', 503);
    }
  };
}
