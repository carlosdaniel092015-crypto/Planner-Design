// Sign in with Google / Microsoft: OpenID Connect authorization-code flow with PKCE, verified server side.
// The browser only ever sees the provider's login page and our session cookie; tokens never reach the frontend.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from 'jose';
import type { Db } from '../db/client';
import { userIdentities, users, verificationTokens } from '../db/schema';
import { audit } from '../lib/audit';
import type { AppConfig, OAuthClient } from '../lib/config';
import { createOwnOrganization } from './signup';

export type Provider = 'google' | 'microsoft';
export const PROVIDERS: readonly Provider[] = ['google', 'microsoft'];
export const PROVIDER_NAME: Record<Provider, string> = { google: 'Google', microsoft: 'Microsoft' };

/** Microsoft personal accounts (outlook.com, hotmail…): their e-mail is verified by Microsoft. */
const MS_CONSUMERS_TID = '9188040d-6c67-4c5b-b112-36a304b66dad';
const FLOW_TTL_MS = 10 * 60_000;

/** Network access for the flow; tests replace it with a fake provider. */
export interface OAuthRuntime {
  fetch: typeof fetch;
  jwks: (p: Provider) => JWTVerifyGetKey;
}
const remoteKeys: Partial<Record<Provider, JWTVerifyGetKey>> = {};
export const defaultOAuthRuntime: OAuthRuntime = {
  fetch: (input, init) => fetch(input, init),
  jwks: (p) =>
    (remoteKeys[p] ??= createRemoteJWKSet(new URL(p === 'google' ? 'https://www.googleapis.com/oauth2/v3/certs' : 'https://login.microsoftonline.com/common/discovery/v2.0/keys'))),
};

/** Error shown on the login page as ?error=<code> (codes are mapped to Spanish messages in the frontend). */
export class OAuthError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export function clientOf(config: AppConfig, p: Provider): (OAuthClient & { tenant?: string }) | null {
  return config.oauth[p];
}
export const enabledProviders = (config: AppConfig) => PROVIDERS.filter((p) => !!config.oauth[p]);
export const redirectUri = (config: AppConfig, p: Provider) => `${config.apiUrl}/api/v1/auth/oauth/${p}/callback`;

function endpoints(p: Provider, client: OAuthClient & { tenant?: string }) {
  if (p === 'google') return { auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token' };
  const t = encodeURIComponent(client.tenant || 'common');
  return { auth: `https://login.microsoftonline.com/${t}/oauth2/v2.0/authorize`, token: `https://login.microsoftonline.com/${t}/oauth2/v2.0/token` };
}

// ---------- the short-lived flow cookie (state, nonce, PKCE verifier, where to go back) ----------
export interface Flow {
  p: Provider;
  state: string;
  nonce: string;
  verifier: string;
  redirect: string;
  exp: number;
}
const b64u = (b: Buffer) => b.toString('base64url');

/** Only same-site paths ("/proyectos/…"); anything else ("//evil.com", "https://…") goes home. */
export const safeRedirect = (v: string | undefined | null) => (v && /^\/(?![/\\])/.test(v) && v.length <= 500 ? v : '/');

export function newFlow(p: Provider, redirect: string): Flow {
  return { p, state: b64u(randomBytes(24)), nonce: b64u(randomBytes(24)), verifier: b64u(randomBytes(32)), redirect: safeRedirect(redirect), exp: Date.now() + FLOW_TTL_MS };
}
const sign = (body: string, secret: string) => b64u(createHmac('sha256', secret).update(`oauth-flow:${body}`).digest());
export const sealFlow = (flow: Flow, secret: string) => {
  const body = b64u(Buffer.from(JSON.stringify(flow)));
  return `${body}.${sign(body, secret)}`;
};
export function openFlow(value: string | undefined, secret: string): Flow | null {
  if (!value) return null;
  const [body, sig] = value.split('.');
  if (!body || !sig) return null;
  const want = Buffer.from(sign(body, secret));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const f = JSON.parse(Buffer.from(body, 'base64url').toString()) as Flow;
    return f.exp > Date.now() && PROVIDERS.includes(f.p) ? f : null;
  } catch {
    return null;
  }
}

export function authorizeUrl(config: AppConfig, p: Provider, flow: Flow) {
  const client = clientOf(config, p)!;
  const q = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri(config, p),
    response_type: 'code',
    scope: 'openid email profile',
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: b64u(createHash('sha256').update(flow.verifier).digest()),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return `${endpoints(p, client).auth}?${q}`;
}

export interface OAuthProfile {
  provider: Provider;
  subject: string;
  email: string | null;
  /** Only a provider-verified address may link to or create an account (prevents "nOAuth" impersonation). */
  emailVerified: boolean;
  name: string;
}

/** Exchanges the code for an ID token and verifies it (signature, issuer, audience, expiry, nonce). */
export async function exchangeCode(config: AppConfig, rt: OAuthRuntime, flow: Flow, code: string): Promise<OAuthProfile> {
  const p = flow.p;
  const client = clientOf(config, p);
  if (!client) throw new OAuthError('proveedor_no_disponible');
  let idToken: unknown;
  try {
    const res = await rt.fetch(endpoints(p, client).token, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(config, p), client_id: client.clientId, client_secret: client.clientSecret, code_verifier: flow.verifier }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new OAuthError('intercambio_fallido');
    idToken = ((await res.json()) as { id_token?: unknown }).id_token;
  } catch (e) {
    throw e instanceof OAuthError ? e : new OAuthError('intercambio_fallido');
  }
  if (typeof idToken !== 'string') throw new OAuthError('intercambio_fallido');
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(idToken, rt.jwks(p), {
      audience: client.clientId,
      ...(p === 'google' ? { issuer: ['https://accounts.google.com', 'accounts.google.com'] } : {}),
      clockTolerance: 60,
    }));
  } catch {
    throw new OAuthError('token_invalido');
  }
  if (payload.nonce !== flow.nonce || typeof payload.sub !== 'string' || !payload.sub) throw new OAuthError('token_invalido');
  const tid = typeof payload.tid === 'string' ? payload.tid : '';
  // Microsoft's multi-tenant keys are shared by every tenant: the issuer must match the token's own tenant.
  if (p === 'microsoft' && (!tid || payload.iss !== `https://login.microsoftonline.com/${tid}/v2.0`)) throw new OAuthError('token_invalido');
  const email = typeof payload.email === 'string' && payload.email.includes('@') ? payload.email.trim().toLowerCase() : null;
  const emailVerified = !!email && (p === 'google' ? payload.email_verified === true : tid === MS_CONSUMERS_TID || payload.xms_edov === true);
  const name = (typeof payload.name === 'string' && payload.name.trim()) || email?.split('@')[0] || 'Usuario';
  return { provider: p, subject: payload.sub, email, emailVerified, name: name.slice(0, 120) };
}

/**
 * Finds or creates the user for a verified provider profile:
 * 1. a linked identity → that user;
 * 2. an existing account with the same (verified) e-mail → link it (an invited, not yet active user is activated);
 * 3. nobody → open sign-up: a new organisation on the free plan, with this person as its admin.
 */
export async function resolveOAuthUser(db: Db, profile: OAuthProfile): Promise<{ userId: string; created: boolean }> {
  const [linked] = await db
    .select({ id: users.id, active: users.active, identityId: userIdentities.id })
    .from(userIdentities)
    .innerJoin(users, eq(users.id, userIdentities.userId))
    .where(and(eq(userIdentities.provider, profile.provider), eq(userIdentities.subject, profile.subject)))
    .limit(1);
  if (linked) {
    if (!linked.active) throw new OAuthError('cuenta_desactivada');
    await db.update(userIdentities).set({ lastLoginAt: new Date(), ...(profile.email ? { email: profile.email } : {}) }).where(eq(userIdentities.id, linked.identityId));
    return { userId: linked.id, created: false };
  }
  if (!profile.email) throw new OAuthError('sin_correo');
  if (!profile.emailVerified) throw new OAuthError('correo_no_verificado');
  const email = profile.email;

  const [existing] = await db.select().from(users).where(eq(sql`lower(${users.email})`, email)).limit(1);
  if (existing) {
    return db.transaction(async (tx) => {
      if (!existing.active) {
        // An invitation that was never accepted: signing in with the invited address accepts it.
        const [invite] = await tx
          .update(verificationTokens)
          .set({ usedAt: new Date() })
          .where(and(eq(verificationTokens.userId, existing.id), eq(verificationTokens.purpose, 'invite'), isNull(verificationTokens.usedAt), gt(verificationTokens.expiresAt, new Date())))
          .returning({ id: verificationTokens.id });
        if (!invite) throw new OAuthError('cuenta_desactivada');
        await tx.update(users).set({ active: true }).where(eq(users.id, existing.id));
      }
      await tx.insert(userIdentities).values({ userId: existing.id, provider: profile.provider, subject: profile.subject, email, lastLoginAt: new Date() });
      await audit(tx, { organizationId: existing.organizationId, userId: existing.id }, 'actualizar', 'user', existing.id, { vinculado: profile.provider });
      return { userId: existing.id, created: false };
    });
  }

  // Open sign-up: own organisation, free plan, default catalogue in RD$.
  const { org, admin } = await createOwnOrganization(db, { name: profile.name, email });
  await db.insert(userIdentities).values({ userId: admin.id, provider: profile.provider, subject: profile.subject, email, lastLoginAt: new Date() });
  await audit(db, { organizationId: org.id, userId: admin.id }, 'crear', 'organization', org.id, { registro: profile.provider });
  return { userId: admin.id, created: true };
}

