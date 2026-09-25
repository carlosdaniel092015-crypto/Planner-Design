import { randomBytes, randomInt } from 'node:crypto';
import type { Db } from '../db/client';
import { seedOrganization } from '../db/seed-lib';
import { hmac, safeEqual } from '../lib/crypto';

const slugBase = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30) || 'org';

/**
 * Open sign-up (email code or Google / Microsoft): a new organisation on the free plan, default catalogue in RD$,
 * with this person as its admin. A paid plan is assigned by paying (Stripe) or by a platform admin.
 */
export function createOwnOrganization(db: Db, p: { name: string; email: string; orgName?: string | null; passwordHash?: string }) {
  const first = p.name.split(/\s+/)[0] || 'Mi taller';
  return seedOrganization(db, {
    orgName: (p.orgName?.trim() || `Taller de ${first}`).slice(0, 120),
    slug: `${slugBase(p.email.split('@')[0]!)}-${randomBytes(3).toString('hex')}`,
    admin: { name: p.name, email: p.email, passwordHash: p.passwordHash },
    currency: 'DOP',
    rate: 60,
    plan: 'gratis',
  });
}

export const SIGNUP_CODE_TTL_MS = 15 * 60_000;
export const SIGNUP_MAX_ATTEMPTS = 5;

/** Six digits, uniformly random. */
export const newSignupCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
export const hashSignupCode = (secret: string, email: string, code: string) => hmac(secret, `signup:${email}:${code}`);
export const signupCodeMatches = (secret: string, email: string, code: string, hash: string) => safeEqual(hashSignupCode(secret, email, code), hash);
