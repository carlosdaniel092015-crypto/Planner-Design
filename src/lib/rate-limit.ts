import type { Context, MiddlewareHandler } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { AppError } from './errors';
import type { AppEnv } from './context';

/**
 * Fixed-window counter kept in memory. On Vercel each function instance has its own
 * memory, so this limits per instance (good enough against brute force from one client;
 * swap for Upstash/Redis behind the same interface if stricter limits are needed).
 */
export interface RateLimiter {
  hit(key: string, max: number, windowMs: number): { allowed: boolean; retryAfterSec: number };
  reset(): void;
}

export function memoryRateLimiter(now: () => number = Date.now): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    hit(key, max, windowMs) {
      const t = now();
      let b = buckets.get(key);
      if (!b || b.resetAt <= t) {
        b = { count: 0, resetAt: t + windowMs };
        buckets.set(key, b);
        if (buckets.size > 50_000) for (const [k, v] of buckets) if (v.resetAt <= t) buckets.delete(k);
      }
      b.count++;
      return { allowed: b.count <= max, retryAfterSec: Math.ceil((b.resetAt - t) / 1000) };
    },
    reset: () => buckets.clear(),
  };
}

export function clientIp(c: Context): string {
  // The reverse proxy (Traefik on Easypanel) appends the address it saw; earlier entries are client-controlled.
  const fwd = c.req.header('x-forwarded-for')?.split(',').pop()?.trim();
  if (fwd) return fwd;
  const real = c.req.header('x-real-ip');
  if (real) return real;
  try {
    return getConnInfo(c).remote.address ?? 'desconocida';
  } catch {
    return 'desconocida';
  }
}

export function rateLimit(opts: {
  name: string;
  max: number;
  windowMs: number;
  key?: (c: Context<AppEnv>) => string;
}): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const key = `${opts.name}:${opts.key ? opts.key(c) : clientIp(c)}`;
    const r = c.var.deps.rateLimiter.hit(key, opts.max, opts.windowMs);
    if (!r.allowed) {
      c.header('Retry-After', String(r.retryAfterSec));
      throw new AppError(429, 'DEMASIADAS_SOLICITUDES', `Demasiados intentos. Vuelve a intentarlo en ${r.retryAfterSec} s.`);
    }
    await next();
  };
}
