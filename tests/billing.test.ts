import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { DEFAULT_KITCHEN } from '../src/core';
import { organizations } from '../src/db/schema';
import { formEncode, verifyWebhook } from '../src/services/stripe';
import { setup, type Ctx, type TestUser } from './helpers';

let t: Ctx;
let app: ReturnType<typeof createApp>;
let dis: TestUser;
const SECRET = 'whsec_prueba';
const billing = { secretKey: 'sk_test_x', webhookSecret: SECRET, prices: { profesional: 'price_pro', empresa: 'price_emp' } };

beforeAll(async () => {
  t = await setup();
  app = createApp({ db: t.db, storage: t.storage, mailer: t.mailer, config: { ...t.config, billing } });
  await t.db.update(organizations).set({ plan: 'gratis', planStatus: null }).where(eq(organizations.id, t.orgA.id));
  dis = await t.makeUser(t.orgA.id, 'disenador', 'dis-plan@a.test');
});
afterAll(() => t.close());
afterEach(() => vi.unstubAllGlobals());

const req = async (method: string, path: string, user?: TestUser, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await app.request(`/api/v1${path}`, {
    method,
    headers: { ...(user ? { authorization: `Bearer ${user.token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: typeof body === 'string' ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data: any = (res.headers.get('content-type') ?? '').includes('json') ? await res.json() : await res.text();
  return { status: res.status, data };
};
const signed = (payload: string, secret = SECRET, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;
const webhook = (event: unknown, secret?: string) => {
  const payload = JSON.stringify(event);
  return req('POST', '/billing/webhook', undefined, payload, { 'stripe-signature': signed(payload, secret), 'content-type': 'application/json' });
};

describe('planes y pagos', () => {
  it('sin Stripe los límites del plan se aplican igual', async () => {
    // orgB keeps the plan the platform assigned (seed: Empresa, manual); orgA is on Gratis.
    expect((await t.req('GET', '/billing', { user: t.adminB })).data).toMatchObject({ enabled: false, plan: 'empresa', effectivePlan: 'empresa', status: 'manual' });
    expect((await t.req('GET', '/billing', { user: t.adminA })).data).toMatchObject({ enabled: false, plan: 'gratis', effectivePlan: 'gratis' });
    expect((await t.req('GET', '/audit', { user: t.adminA })).status).toBe(402);
  });

  it('plan gratis: 2 usuarios, 5 proyectos activos y sin enlace al cliente, exportaciones, marca ni auditoría', async () => {
    const b = await req('GET', '/billing', t.adminA);
    expect(b.data).toMatchObject({ enabled: true, plan: 'gratis', effectivePlan: 'gratis', usage: { users: 2 } });
    const inv = await req('POST', '/users', t.adminA, { name: 'Tercero', email: 'tercero@a.test', role: 'disenador' });
    expect(inv.status).toBe(402);
    expect(inv.data.error.code).toBe('PLAN_REQUERIDO');
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await req('POST', '/projects', dis, { data: DEFAULT_KITCHEN })).data.id);
    expect((await req('POST', '/projects', dis, { data: DEFAULT_KITCHEN })).status).toBe(402);
    expect((await req('POST', `/projects/${ids[0]}/duplicate`, dis)).status).toBe(402);
    expect((await req('POST', `/projects/${ids[0]}/approval-links`, dis, { recipientEmail: 'c@x.com' })).status).toBe(402);
    expect((await req('GET', `/projects/${ids[0]}/cutlist.csv`, dis)).status).toBe(402);
    expect((await req('PATCH', '/organization', t.adminA, { brandColor: '#112233' })).status).toBe(402);
    expect((await req('PATCH', '/organization', t.adminA, { name: 'Sigue pudiendo' })).status).toBe(200);
    expect((await req('GET', '/audit', t.adminA)).status).toBe(402);
    expect((await req('POST', '/admin/prices/bulk?dryRun=true', t.adminA, { scope: 'materials', percent: 5 })).status).toBe(402);
    expect((await req('POST', '/billing/checkout', dis, { plan: 'profesional' })).status).toBe(403);
  });

  it('los avisos de Stripe exigen firma válida y cambian el plan', async () => {
    const sub = { id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { organizationId: t.orgA.id }, items: { data: [{ price: { id: 'price_emp' }, current_period_end: 1893456000 }] } };
    // The server re-reads the subscription from Stripe; this stub answers with the state the event carries.
    let current: Record<string, unknown> = sub;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(current), { status: 200, headers: { 'content-type': 'application/json' } })));
    expect((await webhook({ type: 'customer.subscription.updated', data: { object: sub } }, 'otra')).status).toBe(400);
    expect(verifyWebhook('{}', signed('{}', SECRET, 1000), SECRET)).toBe(false); // too old
    expect((await webhook({ type: 'customer.subscription.updated', data: { object: sub } })).status).toBe(200);
    const b = (await req('GET', '/billing', t.adminA)).data;
    expect(b).toMatchObject({ plan: 'empresa', effectivePlan: 'empresa', status: 'active', renewsAt: '2030-01-01T00:00:00.000Z' });
    expect((await req('POST', '/users', t.adminA, { name: 'Tercero', email: 'tercero@a.test', role: 'disenador' })).status).toBe(201);
    expect((await req('GET', '/audit', t.adminA)).data.items.some((x: any) => x.action === 'cambiar_plan')).toBe(true);
    // A failed payment falls back to the free limits; cancelling returns to Gratis.
    current = { ...sub, status: 'past_due' };
    await webhook({ type: 'customer.subscription.updated', data: { object: current } });
    expect((await req('GET', '/billing', t.adminA)).data.effectivePlan).toBe('gratis');
    await webhook({ type: 'customer.subscription.deleted', data: { object: sub } });
    expect((await req('GET', '/billing', t.adminA)).data).toMatchObject({ plan: 'gratis', status: 'canceled' });
    // A late "updated: active" for the cancelled subscription does not bring the plan back (Stripe says it is canceled now).
    current = { ...sub, status: 'canceled' };
    await webhook({ type: 'customer.subscription.updated', data: { object: { ...sub, status: 'active' } } });
    expect((await req('GET', '/billing', t.adminA)).data).toMatchObject({ plan: 'gratis', status: 'canceled' });
    // New subscription sub_2; the old sub_1 ending afterwards leaves it alone.
    current = { ...sub, id: 'sub_2', items: { data: [{ price: { id: 'price_pro' }, current_period_end: 1893456000 }] } };
    await webhook({ type: 'customer.subscription.created', data: { object: current } });
    await webhook({ type: 'customer.subscription.deleted', data: { object: { ...sub, status: 'unpaid' } } });
    expect((await req('GET', '/billing', t.adminA)).data).toMatchObject({ plan: 'profesional', status: 'active' });
  });

  it('el pago abre Stripe Checkout con el precio del plan y crea el cliente una vez', async () => {
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: String(init.body ?? '') });
        const out = url.endsWith('/customers') ? { id: 'cus_nuevo' } : url.includes('/checkout/sessions') ? { url: 'https://checkout.stripe.com/c/pay_123' } : { unit_amount: 199000, currency: 'dop', recurring: { interval: 'month' } };
        return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
      }),
    );
    await t.db.update(organizations).set({ stripeCustomerId: null, stripeSubscriptionId: null }).where(eq(organizations.id, t.orgA.id));
    const r = await req('POST', '/billing/checkout', t.adminA, { plan: 'profesional' });
    expect(r.data).toEqual({ url: 'https://checkout.stripe.com/c/pay_123' });
    const checkout = new URLSearchParams(calls.find((c) => c.url.includes('/checkout/sessions'))!.body);
    expect(checkout.get('line_items[0][price]')).toBe('price_pro');
    expect(checkout.get('mode')).toBe('subscription');
    expect(checkout.get('client_reference_id')).toBe(t.orgA.id);
    const b = (await req('GET', '/billing', t.adminA)).data;
    expect(b.plans.find((p: any) => p.key === 'profesional').price).toMatch(/1,990|1\.990/);
  });

  it('formEncode aplana objetos y listas como Stripe espera', () => {
    expect(formEncode({ a: 1, b: { c: 'x' }, d: [{ e: 2 }] }).toString()).toBe('a=1&b%5Bc%5D=x&d%5B0%5D%5Be%5D=2');
  });
});
