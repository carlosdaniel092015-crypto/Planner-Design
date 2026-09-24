// Minimal Stripe client over its REST API (form-encoded), so no SDK dependency is needed.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../lib/errors';

const API = 'https://api.stripe.com/v1';

type Params = Record<string, unknown>;
/** Stripe's form encoding: nested objects and arrays become a[b][0]=… keys. */
export function formEncode(obj: Params, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? formEncode(item as Params, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))));
    else if (typeof v === 'object') formEncode(v as Params, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export async function stripeRequest<T>(secretKey: string, method: 'GET' | 'POST', path: string, params?: Params): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${secretKey}`, 'content-type': 'application/x-www-form-urlencoded', 'stripe-version': '2024-06-20' },
    body: method === 'POST' && params ? formEncode(params).toString() : undefined,
  }).catch(() => null);
  if (!res) throw new AppError(502, 'PAGOS_NO_DISPONIBLES', 'No se pudo contactar al procesador de pagos. Inténtalo de nuevo.');
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new AppError(502, 'PAGOS_ERROR', `El procesador de pagos respondió: ${data.error?.message ?? res.status}`);
  return data;
}

/** Verifies the Stripe-Signature header (HMAC-SHA256 of "timestamp.payload"), rejecting stale timestamps. */
export function verifyWebhook(payload: string, header: string | undefined, secret: string, now = Date.now(), toleranceSec = 300): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=', 2) as [string, string]));
  const t = Number(parts.t);
  const sigs = header
    .split(',')
    .filter((kv) => kv.startsWith('v1='))
    .map((kv) => kv.slice(3));
  if (!Number.isFinite(t) || !sigs.length || Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex'));
  return sigs.some((s) => {
    const got = Buffer.from(s);
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

export interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  metadata?: Record<string, string>;
  current_period_end?: number;
  items: { data: { price: { id: string }; current_period_end?: number }[] };
}
