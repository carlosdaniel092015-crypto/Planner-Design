import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** 32 random bytes, base64url (43 chars). */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');

export const hmac = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest('base64url');

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Deterministic JSON (sorted keys) so the same project always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}
