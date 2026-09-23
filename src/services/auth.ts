import { hash, verify } from '@node-rs/argon2';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Db, DbOrTx } from '../db/client';
import { organizations, sessions, users, verificationTokens } from '../db/schema';
import type { AppEnv, AuthContext } from '../lib/context';
import { randomToken, sha256 } from '../lib/crypto';
import { unauthorized } from '../lib/errors';

export const SESSION_COOKIE = 'pd_session';

// argon2id with OWASP-recommended parameters (19 MiB, t=2, p=1).
const ARGON = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => hash(password, ARGON);
export const verifyPassword = async (hashed: string, password: string) => {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
};

/** Used to spend comparable time when the email does not exist (no user enumeration by timing). */
let dummyHash: Promise<string> | null = null;
export const dummyVerify = async (password: string) => {
  dummyHash ??= hashPassword('contraseña-ficticia-para-igualar-tiempos');
  await verifyPassword(await dummyHash, password);
};

export async function createSession(db: DbOrTx, userId: string, ttlDays: number, meta: { ip?: string; userAgent?: string }) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);
  const [row] = await db
    .insert(sessions)
    .values({ userId, tokenHash: sha256(token), expiresAt, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) })
    .returning({ id: sessions.id });
  return { token, expiresAt, sessionId: row!.id };
}

export async function resolveSession(db: Db, token: string): Promise<AuthContext | null> {
  const rows = await db
    .select({ session: sessions, user: users, org: organizations })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(organizations, eq(organizations.id, users.organizationId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const r = rows[0];
  if (!r || !r.user.active) return null;
  return {
    sessionId: r.session.id,
    user: { id: r.user.id, name: r.user.name, email: r.user.email, role: r.user.role, organizationId: r.user.organizationId },
    org: r.org,
  };
}

export function readSessionToken(c: Context<AppEnv>): string | undefined {
  const auth = c.req.header('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  return getCookie(c, SESSION_COOKIE);
}

export function setSessionCookie(c: Context<AppEnv>, token: string, expiresAt: Date) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: c.var.deps.config.cookieSecure,
    sameSite: 'Lax',
    path: '/',
    expires: expiresAt,
  });
}

export const clearSessionCookie = (c: Context<AppEnv>) => deleteCookie(c, SESSION_COOKIE, { path: '/' });

export function requireAuth(c: Context<AppEnv>): AuthContext {
  const a = c.var.auth;
  if (!a) throw unauthorized();
  return a;
}

export async function issueVerificationToken(db: DbOrTx, userId: string, purpose: 'reset' | 'invite', ttlMs: number) {
  const token = randomToken(32);
  await db.insert(verificationTokens).values({ userId, purpose, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) });
  return token;
}

export async function consumeVerificationToken(db: DbOrTx, token: string, purpose: 'reset' | 'invite') {
  const [row] = await db
    .update(verificationTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(verificationTokens.tokenHash, sha256(token)),
        eq(verificationTokens.purpose, purpose),
        isNull(verificationTokens.usedAt),
        gt(verificationTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: verificationTokens.userId });
  return row?.userId ?? null;
}
