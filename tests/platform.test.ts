import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_KITCHEN } from '../src/core';
import { auditLog, organizations, users } from '../src/db/schema';
import { seedOrganization } from '../src/db/seed-lib';
import { createSession } from '../src/services/auth';
import { setup, type Ctx, type TestUser } from './helpers';

let t: Ctx;
let owner: TestUser;
let solo: TestUser;
let soloOrg: string;
beforeAll(async () => {
  t = await setup({ env: { PLATFORM_ADMIN_EMAILS: 'Dueno@Plataforma.test, otra@plataforma.test' } });
  owner = await t.makeUser(t.orgB.id, 'lectura', 'dueno@plataforma.test');
  // Someone who signed up alone (own organisation on Gratis), later invited by Org A.
  const s = await seedOrganization(t.db, { orgName: 'Taller de Sol', slug: 'taller-sol', admin: { name: 'Sol', email: 'sol@x.test', password: 'clave-segura-123' }, plan: 'gratis' });
  soloOrg = s.org.id;
  solo = { id: s.admin.id, email: s.admin.email, role: 'admin', orgId: s.org.id, token: (await createSession(t.db, s.admin.id, 1, {})).token };
});
afterAll(() => t.close());

describe('administración de la plataforma', () => {
  it('solo los correos de PLATFORM_ADMIN_EMAILS ven /platform y /me lo indica', async () => {
    expect((await t.req('GET', '/platform/organizations', { user: t.adminA })).status).toBe(403);
    expect((await t.req('GET', '/me', { user: t.adminA })).data.user.platformAdmin).toBeUndefined();
    expect((await t.req('GET', '/me', { user: owner })).data.user.platformAdmin).toBe(true);
    const r = await t.req('GET', '/platform/organizations', { user: owner });
    expect(r.status).toBe(200);
    const sol = r.data.items.find((o: any) => o.id === soloOrg);
    expect(sol).toMatchObject({ name: 'Taller de Sol', plan: 'gratis', effectivePlan: 'gratis', users: 1, admins: ['sol@x.test'] });
    expect((await t.req('GET', '/platform/organizations?q=sol@x', { user: owner })).data.items.map((o: any) => o.id)).toEqual([soloOrg]);
    const people = await t.req('GET', `/platform/organizations/${soloOrg}/users`, { user: owner });
    expect(people.data.items[0]).toMatchObject({ email: 'sol@x.test', hasPassword: true, providers: [] });
  });

  it('una organización Gratis tiene límites aunque no haya Stripe, hasta que la plataforma le asigna un plan', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await t.req('POST', '/projects', { user: solo, body: { data: DEFAULT_KITCHEN } })).data.id);
    const over = await t.req('POST', '/projects', { user: solo, body: { data: DEFAULT_KITCHEN } });
    expect(over.status).toBe(402);
    expect((await t.req('GET', '/billing', { user: solo })).data).toMatchObject({ enabled: false, effectivePlan: 'gratis', usage: { activeProjects: 5 }, contactEmail: 'dueno@plataforma.test' });

    expect((await t.req('PATCH', `/platform/organizations/${soloOrg}`, { user: t.adminA, body: { plan: 'profesional' } })).status).toBe(403);
    const up = await t.req('PATCH', `/platform/organizations/${soloOrg}`, { user: owner, body: { plan: 'profesional' } });
    expect(up.data).toMatchObject({ plan: 'profesional', effectivePlan: 'profesional', planStatus: 'manual' });
    expect((await t.req('POST', '/projects', { user: solo, body: { data: DEFAULT_KITCHEN } })).status).toBe(201);
    const log = await t.db.select().from(auditLog).where(eq(auditLog.organizationId, soloOrg));
    expect(log.some((x) => x.action === 'cambiar_plan' && x.userId === null)).toBe(true);
    // Back to Gratis for the next test.
    await t.req('PATCH', `/platform/organizations/${soloOrg}`, { user: owner, body: { plan: 'gratis' } });
    const [o] = await t.db.select().from(organizations).where(eq(organizations.id, soloOrg));
    expect(o).toMatchObject({ plan: 'gratis', planStatus: null });
  });
});

describe('invitar a alguien que ya tiene cuenta', () => {
  it('le envía una solicitud; al aceptarla pasa a la organización con el rol elegido', async () => {
    const inv = await t.req('POST', '/users', { user: t.adminA, body: { name: 'Sol', email: 'SOL@x.test', role: 'disenador' } });
    expect(inv.status).toBe(202);
    expect(inv.data).toMatchObject({ joinRequest: true, email: 'sol@x.test', emailSent: true });
    const mail = t.mailer.outbox.at(-1)!;
    expect(mail.to).toBe('sol@x.test');
    expect(mail.text).toContain('/unirse?token=');
    // Nothing changes until they accept.
    expect((await t.req('GET', '/me', { user: solo })).data.organization.id).toBe(soloOrg);

    const list = await t.req('GET', '/me/join-requests', { user: solo });
    expect(list.data.items).toHaveLength(1);
    expect(list.data.items[0]).toMatchObject({ organizationName: 'Org A', role: 'disenador', canAccept: true, current: { name: 'Taller de Sol', otherMembers: 0 } });
    expect(list.data.items[0].current.projects).toBeGreaterThan(0);
    // Somebody else cannot accept it.
    expect((await t.req('POST', `/me/join-requests/${list.data.items[0].id}/accept`, { user: t.adminB })).status).toBe(404);

    const ok = await t.req('POST', `/me/join-requests/${list.data.items[0].id}/accept`, { user: solo });
    expect(ok.status).toBe(200);
    expect(ok.data).toMatchObject({ user: { role: 'disenador' }, organization: { id: t.orgA.id } });
    expect((await t.req('GET', '/me', { user: solo })).data.organization.id).toBe(t.orgA.id);
    expect((await t.req('GET', '/users/directory', { user: t.adminA })).data.items.some((p: any) => p.email === 'sol@x.test')).toBe(true);
    expect((await t.req('POST', `/me/join-requests/${list.data.items[0].id}/accept`, { user: solo })).status).toBe(410);
    // Already a member now.
    expect((await t.req('POST', '/users', { user: t.adminA, body: { name: 'Sol', email: 'sol@x.test', role: 'disenador' } })).status).toBe(409);
  });

  it('no puede irse de una organización donde hay más personas', async () => {
    await t.req('POST', '/users', { user: t.adminB, body: { name: 'Sol', email: 'sol@x.test', role: 'lectura' } });
    const [req] = (await t.req('GET', '/me/join-requests', { user: solo })).data.items;
    expect(req).toMatchObject({ organizationName: 'Org B', canAccept: false });
    const r = await t.req('POST', `/me/join-requests/${req.id}/accept`, { user: solo });
    expect(r.status).toBe(409);
    expect(r.data.error.code).toBe('NO_PUEDE_CAMBIAR');
    expect((await t.req('POST', `/me/join-requests/${req.id}/decline`, { user: solo })).status).toBe(200);
    expect((await t.req('GET', '/me/join-requests', { user: solo })).data.items).toHaveLength(0);
    const [u] = await t.db.select().from(users).where(eq(users.id, solo.id));
    expect(u!.organizationId).toBe(t.orgA.id);
  });
});

describe('correo que no sale', () => {
  it('enviar al cliente y aprobar no fallan con 500 si el proveedor de correo rechaza el envío', async () => {
    const send = t.mailer.send;
    t.mailer.send = async () => {
      throw new Error('Resend respondió 403: domain not verified');
    };
    try {
      // The prototype's kitchen with the water point under the sink (no validation errors).
      const data = { ...DEFAULT_KITCHEN, pts: DEFAULT_KITCHEN.pts.map((x) => (x.t === 'agua' ? { ...x, pos: 135 } : x)) };
      const p = (await t.req('POST', '/projects', { user: t.adminA, body: { data } })).data;
      const link = await t.req('POST', `/projects/${p.id}/approval-links`, { user: t.adminA, body: { recipientEmail: 'cliente@x.test' } });
      expect(link.status).toBe(201);
      expect(link.data.emailSent).toBe(false);
      expect(link.data.url).toContain('/p/');
      const ok = await t.req('POST', `/projects/${p.id}/approve-internal`, { user: t.adminA, body: { signerName: 'En tienda' } });
      expect(ok.status).toBe(200);
      const inv = await t.req('POST', '/users', { user: t.adminA, body: { name: 'Nuevo', email: 'nuevo@a.test', role: 'lectura' } });
      expect(inv.status).toBe(201);
      expect(inv.data.emailSent).toBe(false);
    } finally {
      t.mailer.send = send;
    }
  });
});
