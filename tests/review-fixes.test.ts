// Regressions found in the full code review (1.5.1).
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_KITCHEN } from '../src/core';
import { users } from '../src/db/schema';
import { setup, type Ctx, type TestUser } from './helpers';

let t: Ctx;
let dis: TestUser;
beforeAll(async () => {
  t = await setup();
  dis = await t.makeUser(t.orgA.id, 'disenador', 'dis-rev@a.test');
});
afterAll(() => t.close());
const APPROVABLE = { ...DEFAULT_KITCHEN, pts: DEFAULT_KITCHEN.pts.map((p) => (p.t === 'agua' ? { ...p, pos: 135 } : p)) };

describe('correcciones de la revisión', () => {
  it('editar un módulo, material o herraje del catálogo no reinicia sus precios ni otros campos', async () => {
    const mod = await t.req('POST', '/admin/modules', {
      user: t.adminA,
      body: { code: 'RV-1', name: 'M', type: 'base', category: 'Bajos', minW: 80, maxW: 120, defW: 100, fixedH: 76, fixedD: 60, recipe: { fr: [{ t: 'door', n: 2, f: 1 }], sink: 1 }, unitPrice: 110, priceCurrency: 'DOP', sort: 7 },
    });
    expect(mod.status).toBe(201);
    const m = await t.req('PATCH', `/admin/modules/${mod.data.id}`, { user: t.adminA, body: { name: 'Renombrado' } });
    expect(m.data).toMatchObject({ name: 'Renombrado', unitPrice: 110, priceCurrency: 'DOP', category: 'Bajos', sort: 7, recipe: { sink: 1 } });
    const mat = await t.req('POST', '/admin/materials', { user: t.adminA, body: { code: 'rv-mat', name: 'X', type: 'Cuarzo 20 mm', kind: 'piedra', uses: ['encimera'], priceM2: 210, priceCurrency: 'DOP', color: '#112233', thickness: 2 } });
    const mu = await t.req('PATCH', `/admin/materials/${mat.data.id}`, { user: t.adminA, body: { name: 'Y' } });
    expect(mu.data).toMatchObject({ name: 'Y', priceM2: 210, priceCurrency: 'DOP', color: '#112233', uses: ['encimera'], thickness: 2 });
    const h = await t.req('POST', '/admin/hardware', { user: t.adminA, body: { code: 'RV-H', name: 'H', unitPrice: 3, priceCurrency: 'DOP', active: false } });
    const hu = await t.req('PATCH', `/admin/hardware/${h.data.id}`, { user: t.adminA, body: { name: 'H2' } });
    expect(hu.data).toMatchObject({ name: 'H2', priceCurrency: 'DOP', active: false });
  });

  it('tras aprobar internamente, el enlace que ya tenía el cliente deja de funcionar', async () => {
    const p = (await t.req('POST', '/projects', { user: dis, body: { data: APPROVABLE } })).data;
    const s = await t.req('POST', `/projects/${p.id}/approval-links`, { user: dis, body: { recipientEmail: 'c@e.com' } });
    expect(s.status).toBe(201);
    expect((await t.req('POST', `/projects/${p.id}/approve-internal`, { user: dis, body: { signerName: 'Yo' } })).status).toBe(200);
    const pub = await t.req('POST', `/public/approvals/${s.data.token}`, { body: { decision: 'cambios', signerName: 'Cliente', accepted: true } });
    expect(pub.status).toBe(410);
    expect((await t.req('GET', `/projects/${p.id}`, { user: dis })).data.status).toBe('aprobado');
  });

  it('la portada solo acepta archivos del almacenamiento propio', async () => {
    const p = (await t.req('POST', '/projects', { user: dis, body: {} })).data;
    const put = await t.req('PUT', `/projects/${p.id}`, { user: dis, body: { version: p.version, data: p.data, coverUrl: `https://evil.example/${t.orgA.id}/x.png` } });
    expect(put.status).toBe(422);
  });

  it('otra organización no puede registrar (ni luego borrar) un archivo ajeno con %2F..%2F', async () => {
    const { url } = await t.storage.put(`${t.orgA.id}/pdf/victim.pdf`, new TextEncoder().encode('%PDF-1.4\n%test\n'), 'application/pdf');
    const base = 'http://localhost:3000/api/v1/storage/';
    const crafted = `${base}${t.orgB.id}%2F..%2F${url.slice(base.length)}`;
    const reg = await t.req('POST', '/files', { user: t.adminB, body: { kind: 'pdf', blobUrl: crafted, name: 'x.pdf' } });
    expect(reg.status).toBe(422);
    expect(await t.storage.get(url)).toBeTruthy();
  });

  it('un usuario desactivado no se reactiva con la invitación pendiente', async () => {
    const inv = await t.req('POST', '/users', { user: t.adminA, body: { name: 'Luis', email: 'luis-rev@a.test', role: 'disenador' } });
    const mail = t.mailer.outbox.find((m) => m.to === 'luis-rev@a.test')!;
    const token = decodeURIComponent(/token=([^\s"&]+)/.exec(mail.text)![1]!);
    expect((await t.req('PATCH', `/users/${inv.data.id}`, { user: t.adminA, body: { active: false } })).status).toBe(200);
    expect((await t.req('POST', '/auth/accept-invite', { body: { token, password: 'clave-segura-123' } })).status).toBe(410);
    const [u] = await t.db.select().from(users).where(eq(users.id, inv.data.id));
    expect(u!.active).toBe(false);
  });

  it('desactivar a un usuario cierra sus sesiones', async () => {
    const u = await t.makeUser(t.orgA.id, 'disenador', 'dis-off@a.test');
    expect((await t.req('GET', '/me', { user: u })).status).toBe(200);
    await t.req('PATCH', `/users/${u.id}`, { user: t.adminA, body: { active: false } });
    expect((await t.req('GET', '/me', { user: u })).status).toBe(401);
  });
});
