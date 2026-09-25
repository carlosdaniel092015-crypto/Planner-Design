import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { moduleDefinitions, organizations, userCredentials, userIdentities, users, verificationTokens } from '../src/db/schema';
import { issueVerificationToken } from '../src/services/auth';
import type { OAuthRuntime } from '../src/services/oauth';
import { API, type Ctx, FRONT, setup } from './helpers';

// ---------- a fake Google / Microsoft: real RS256 tokens verified against its own JWKS ----------
const GOOGLE_ID = 'google-client.apps.googleusercontent.com';
const MS_ID = '00000000-aaaa-bbbb-cccc-000000000001';
const MS_PERSONAL_TID = '9188040d-6c67-4c5b-b112-36a304b66dad';
let t: Ctx;
let signer: CryptoKey;
let claims: Record<string, unknown> = {};
let lastTokenBody: URLSearchParams | null = null;
let tokenStatus = 200;
const flows = new Map<string, string>(); // state -> nonce

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  signer = privateKey;
  const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }] });
  const rt: OAuthRuntime = {
    jwks: () => jwks,
    fetch: async (url, init) => {
      lastTokenBody = new URLSearchParams(String(init?.body));
      if (tokenStatus !== 200) return new Response('{"error":"invalid_grant"}', { status: tokenStatus });
      const isGoogle = String(url).includes('googleapis');
      const { nonce: n, iss, aud, sub, ...rest } = claims;
      const tid = (rest.tid as string | undefined) ?? MS_PERSONAL_TID;
      const token = await new SignJWT({ nonce: n ?? flows.get(lastState) ?? 'x', ...rest, ...(isGoogle ? {} : { tid }) })
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuedAt()
        .setExpirationTime('5m')
        .setAudience((aud as string) ?? (isGoogle ? GOOGLE_ID : MS_ID))
        .setIssuer((iss as string) ?? (isGoogle ? 'https://accounts.google.com' : `https://login.microsoftonline.com/${tid}/v2.0`))
        .setSubject((sub as string) ?? 'sub-1')
        .sign(signer);
      return new Response(JSON.stringify({ id_token: token }), { headers: { 'content-type': 'application/json' } });
    },
  };
  t = await setup({ env: { GOOGLE_CLIENT_ID: GOOGLE_ID, GOOGLE_CLIENT_SECRET: 'g-secret', MICROSOFT_CLIENT_ID: MS_ID, MICROSOFT_CLIENT_SECRET: 'm-secret' }, oauth: rt });
});
afterAll(() => t.close());

let lastState = '';
let ipSeq = 0;
/** Runs start → provider → callback like a browser and returns where it ended plus the session cookie. */
async function login(provider: 'google' | 'microsoft', c: Record<string, unknown>, o: { redirect?: string; tamperState?: boolean; noCookie?: boolean; error?: string } = {}) {
  claims = c;
  // Each simulated browser comes from its own IP (the endpoints are rate limited per IP).
  const ip = { 'cf-connecting-ip': `198.51.100.${++ipSeq}` };
  const start = await t.app.request(`/api/v1/auth/oauth/${provider}/start${o.redirect ? `?redirect=${encodeURIComponent(o.redirect)}` : ''}`, { headers: ip });
  expect(start.status).toBe(302);
  const to = new URL(start.headers.get('location')!);
  lastState = to.searchParams.get('state')!;
  flows.set(lastState, to.searchParams.get('nonce')!);
  const flowCookie = start.headers.getSetCookie().find((x) => x.startsWith('pd_oauth='))!.split(';')[0]!;
  const q = new URLSearchParams(o.error ? { error: o.error, state: lastState } : { code: 'code-123', state: o.tamperState ? `${lastState}x` : lastState });
  const back = await t.app.request(`/api/v1/auth/oauth/${provider}/callback?${q}`, { headers: o.noCookie ? ip : { ...ip, cookie: flowCookie } });
  expect(back.status).toBe(302);
  const session = back.headers.getSetCookie().find((x) => x.startsWith('pd_session='))?.split(';')[0];
  return { authorize: to, location: back.headers.get('location')!, session };
}
const me = async (cookie: string) => (await t.app.request('/api/v1/me', { headers: { cookie } })).json() as Promise<any>;

describe('inicio de sesión con Google y Microsoft', () => {
  it('lista solo los proveedores configurados', async () => {
    const r = await t.app.request('/api/v1/auth/providers');
    expect(((await r.json()) as { providers: { id: string }[] }).providers.map((p) => p.id)).toEqual(['google', 'microsoft']);
    const bare = await setup();
    try {
      expect(((await (await bare.app.request('/api/v1/auth/providers')).json()) as { providers: unknown[] }).providers).toEqual([]);
      const off = await bare.app.request('/api/v1/auth/oauth/google/start');
      expect(off.headers.get('location')).toBe(`${FRONT}/login?error=proveedor_no_disponible`);
    } finally {
      await bare.close();
    }
  });

  it('la redirección lleva PKCE, state y nonce; el intercambio envía el verificador correcto', async () => {
    const r = await login('google', { email: 'nueva@gmail.com', email_verified: true, name: 'Nueva Persona', sub: 'g-nueva' });
    expect(r.authorize.origin + r.authorize.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(r.authorize.searchParams.get('redirect_uri')).toBe(`${API}/api/v1/auth/oauth/google/callback`);
    expect(r.authorize.searchParams.get('code_challenge_method')).toBe('S256');
    const verifier = lastTokenBody!.get('code_verifier')!;
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(r.authorize.searchParams.get('code_challenge'));
    expect(lastTokenBody!.get('client_secret')).toBe('g-secret');
  });

  it('primera vez: crea su organización (plan Gratis, catálogo, RD$) como administradora, sin contraseña', async () => {
    const r = await login('google', { email: 'Carla@Gmail.com', email_verified: true, name: 'Carla Rosario', sub: 'g-carla' }, { redirect: '/proyectos/abc' });
    expect(r.location).toBe(`${FRONT}/proyectos/abc?bienvenida=1`);
    const m = await me(r.session!);
    expect(m.user).toMatchObject({ email: 'carla@gmail.com', name: 'Carla Rosario', role: 'admin', hasPassword: false });
    const [org] = await t.db.select().from(organizations).where(eq(organizations.id, m.organization.id));
    expect(org).toMatchObject({ name: 'Taller de Carla', plan: 'gratis', baseCurrency: 'DOP' });
    expect((await t.db.select().from(moduleDefinitions).where(eq(moduleDefinitions.organizationId, org!.id))).length).toBeGreaterThan(10);
    expect(await t.db.select().from(userCredentials).where(eq(userCredentials.userId, m.user.id))).toEqual([]);
    // Second sign-in: same person, no new organisation, no welcome.
    const again = await login('google', { email: 'carla@gmail.com', email_verified: true, name: 'Carla Rosario', sub: 'g-carla' });
    expect(again.location).toBe(`${FRONT}/`);
    expect((await me(again.session!)).organization.id).toBe(org!.id);
  });

  it('vincula una cuenta existente cuando el proveedor verifica el correo', async () => {
    const r = await login('microsoft', { email: 'admin@a.test', sub: 'ms-admin-a' });
    const m = await me(r.session!);
    expect(m.user.email).toBe('admin@a.test');
    expect(m.organization.id).toBe(t.orgA.id);
    expect(m.user.hasPassword).toBe(true);
    const ids = await t.db.select().from(userIdentities).where(and(eq(userIdentities.provider, 'microsoft'), eq(userIdentities.subject, 'ms-admin-a')));
    expect(ids).toHaveLength(1);
  });

  it('no vincula ni crea cuentas con un correo que el proveedor no verifica ("nOAuth")', async () => {
    const workTenant = '11111111-2222-3333-4444-555555555555';
    const hijack = await login('microsoft', { email: 'admin@b.test', tid: workTenant, sub: 'ms-attacker' });
    expect(hijack.location).toBe(`${FRONT}/login?error=correo_no_verificado`);
    expect(hijack.session).toBeUndefined();
    const g = await login('google', { email: 'admin@b.test', email_verified: false, sub: 'g-attacker' });
    expect(g.location).toBe(`${FRONT}/login?error=correo_no_verificado`);
    // Verified by the tenant (xms_edov) is accepted.
    const ok = await login('microsoft', { email: 'empleado@empresa.test', tid: workTenant, xms_edov: true, name: 'Empleado', sub: 'ms-emp' });
    expect((await me(ok.session!)).user.email).toBe('empleado@empresa.test');
  });

  it('una invitación pendiente se acepta entrando con el correo invitado', async () => {
    const [u] = await t.db.insert(users).values({ organizationId: t.orgA.id, name: 'Invitada', email: 'invitada@gmail.com', role: 'disenador', active: false }).returning();
    await issueVerificationToken(t.db, u!.id, 'invite', 3600_000);
    const r = await login('google', { email: 'invitada@gmail.com', email_verified: true, name: 'Invitada', sub: 'g-inv' });
    const m = await me(r.session!);
    expect(m.organization.id).toBe(t.orgA.id);
    expect(m.user.role).toBe('disenador');
    const [tok] = await t.db.select().from(verificationTokens).where(eq(verificationTokens.userId, u!.id));
    expect(tok!.usedAt).not.toBeNull();
  });

  it('una cuenta desactivada no entra', async () => {
    const [u] = await t.db.insert(users).values({ organizationId: t.orgA.id, name: 'Baja', email: 'baja@gmail.com', role: 'disenador', active: false }).returning();
    expect(u).toBeTruthy();
    const r = await login('google', { email: 'baja@gmail.com', email_verified: true, sub: 'g-baja' });
    expect(r.location).toBe(`${FRONT}/login?error=cuenta_desactivada`);
  });

  it('rechaza state alterado, cookie faltante, nonce, audiencia o emisor incorrectos, y cancelación', async () => {
    const base = { email: 'x@gmail.com', email_verified: true, sub: 'g-x' };
    expect((await login('google', base, { tamperState: true })).location).toBe(`${FRONT}/login?error=estado_invalido`);
    expect((await login('google', base, { noCookie: true })).location).toBe(`${FRONT}/login?error=estado_invalido`);
    expect((await login('google', { ...base, nonce: 'otro' })).location).toBe(`${FRONT}/login?error=token_invalido`);
    expect((await login('google', { ...base, aud: 'otra-app' })).location).toBe(`${FRONT}/login?error=token_invalido`);
    expect((await login('google', { ...base, iss: 'https://evil.example.com' })).location).toBe(`${FRONT}/login?error=token_invalido`);
    // Microsoft: the issuer must be the token's own tenant.
    expect((await login('microsoft', { email: 'y@outlook.com', iss: 'https://login.microsoftonline.com/otro-tenant/v2.0', sub: 'ms-y' })).location).toBe(`${FRONT}/login?error=token_invalido`);
    expect((await login('google', base, { error: 'access_denied' })).location).toBe(`${FRONT}/login?error=cancelado`);
    tokenStatus = 400;
    try {
      expect((await login('google', base)).location).toBe(`${FRONT}/login?error=intercambio_fallido`);
    } finally {
      tokenStatus = 200;
    }
  });

  it('limita los intentos por IP', async () => {
    const ip = { 'cf-connecting-ip': '203.0.113.77' };
    const codes: number[] = [];
    for (let i = 0; i < 32; i++) codes.push((await t.app.request('/api/v1/auth/oauth/google/start', { headers: ip })).status);
    expect(codes.slice(0, 30).every((c) => c === 302)).toBe(true);
    expect(codes.at(-1)).toBe(429);
  });

  it('solo vuelve a rutas propias (sin redirecciones abiertas)', async () => {
    for (const evil of ['//evil.com', 'https://evil.com', '/\\evil.com'])
      expect((await login('google', { email: 'ruta@gmail.com', email_verified: true, sub: 'g-ruta' }, { redirect: evil })).location).toMatch(new RegExp(`^${FRONT}/(\\?|$)`));
  });

  it('sin contraseña: la crea sin pedir la actual y puede borrar su cuenta; al borrarla se quitan sus identidades', async () => {
    const r = await login('google', { email: 'sinclave@gmail.com', email_verified: true, name: 'Sin Clave', sub: 'g-sinclave' });
    const cookie = r.session!;
    const create = await t.app.request('/api/v1/me/password', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ newPassword: 'nueva-clave-1' }) });
    expect(create.status).toBe(200);
    expect((await me(cookie)).user.hasPassword).toBe(true);
    // Now a password exists: changing it again requires the current one.
    const noCur = await t.app.request('/api/v1/me/password', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ newPassword: 'otra-clave-22' }) });
    expect(noCur.status).toBeGreaterThanOrEqual(400);
    const r2 = await login('google', { email: 'borrar@gmail.com', email_verified: true, name: 'Borrar', sub: 'g-borrar' });
    const del = await t.app.request('/api/v1/me', { method: 'DELETE', headers: { cookie: r2.session!, 'content-type': 'application/json' }, body: JSON.stringify({ confirm: 'ELIMINAR' }) });
    expect(del.status).toBe(409); // único administrador de su propia organización
    const [u] = await t.db.select().from(users).where(eq(users.email, 'borrar@gmail.com'));
    await t.db.insert(users).values({ organizationId: u!.organizationId, name: 'Otro admin', email: 'otro-admin@x.test', role: 'admin', active: true });
    const del2 = await t.app.request('/api/v1/me', { method: 'DELETE', headers: { cookie: r2.session!, 'content-type': 'application/json' }, body: JSON.stringify({ confirm: 'ELIMINAR' }) });
    expect(del2.status).toBe(204);
    expect(await t.db.select().from(userIdentities).where(eq(userIdentities.userId, u!.id))).toEqual([]);
  });
});
