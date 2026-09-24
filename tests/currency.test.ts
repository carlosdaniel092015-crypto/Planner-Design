import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_KITCHEN } from '../src/core';
import { materials, organizations } from '../src/db/schema';
import { seedOrganization } from '../src/db/seed-lib';
import { convertOrgToDop } from '../src/db/to-dop-lib';
import { setup, type Ctx } from './helpers';

let t: Ctx;
beforeAll(async () => {
  t = await setup();
});
afterAll(() => t.close());

const APPROVABLE = { ...DEFAULT_KITCHEN, pts: DEFAULT_KITCHEN.pts.map((p) => (p.t === 'agua' ? { ...p, pos: 135 } : p)) };

describe('solo pesos dominicanos', () => {
  it('una organización nueva se siembra en RD$ con el catálogo convertido', async () => {
    const { org } = await seedOrganization(t.db, { orgName: 'Org DOP', slug: 'org-dop', admin: { name: 'A', email: 'a@dop.test', password: 'clave-segura' }, currency: 'DOP', rate: 60 });
    expect(org.baseCurrency).toBe('DOP');
    const blanco = (await t.db.select().from(materials).where(eq(materials.organizationId, org.id))).find((m) => m.code === 'blanco');
    expect(blanco!.priceCurrency).toBe('DOP');
    expect(blanco!.priceM2).toBe(18 * 60);
  });

  it('el ITBIS se puede cambiar o quitar en cada proyecto', async () => {
    const p = (await t.req('POST', '/projects', { user: t.adminA, body: { data: DEFAULT_KITCHEN } })).data;
    const base = p.estimateDetail;
    expect(base.taxRate).toBe(0.18);
    const none = await t.req('PUT', `/projects/${p.id}`, { user: t.adminA, body: { version: 1, data: { ...DEFAULT_KITCHEN, priceAdj: { ...DEFAULT_KITCHEN.priceAdj, taxRate: 0 } } } });
    expect(none.data.estimateDetail).toMatchObject({ taxRate: 0, tax: 0 });
    expect(none.data.estimate.amount).toBeCloseTo(base.taxBase, 1);
    const ten = await t.req('PUT', `/projects/${p.id}`, { user: t.adminA, body: { version: 2, data: { ...DEFAULT_KITCHEN, priceAdj: { ...DEFAULT_KITCHEN.priceAdj, taxRate: 0.1 } } } });
    expect(ten.data.estimateDetail.taxRate).toBe(0.1);
    expect(ten.data.estimateDetail.tax).toBeCloseTo(base.taxBase * 0.1, 1);
  });

  it('convierte una organización de US$ a RD$ sin tocar los aprobados', async () => {
    const withOverride = { ...APPROVABLE, mods: APPROVABLE.mods.map((m) => (m.id === 1 ? { ...m, pOv: 100 } : m)), priceAdj: { ...APPROVABLE.priceAdj, counter: 500 } };
    const draft = (await t.req('POST', '/projects', { user: t.adminB, body: { data: withOverride } })).data;
    const approved = (await t.req('POST', '/projects', { user: t.adminB, body: { data: APPROVABLE } })).data;
    await t.req('POST', `/projects/${approved.id}/approve-internal`, { user: t.adminB, body: { signerName: 'Cliente' } });
    const approvedBefore = (await t.req('GET', `/projects/${approved.id}?currency=DOP`, { user: t.adminB })).data.estimate;
    const draftUsd = (await t.req('GET', `/projects/${draft.id}`, { user: t.adminB })).data.estimate.amount;

    const r = await convertOrgToDop(t.db, t.orgB.id);
    expect(r).toMatchObject({ changed: true, rate: 60 });
    const [org] = await t.db.select().from(organizations).where(eq(organizations.id, t.orgB.id));
    expect(org!.baseCurrency).toBe('DOP');

    const d = (await t.req('GET', `/projects/${draft.id}`, { user: t.adminB })).data;
    expect(d.currency).toBe('DOP');
    expect(d.data.mods.find((m: any) => m.id === 1).pOv).toBe(6000);
    expect(d.data.priceAdj.counter).toBe(30000);
    expect(d.estimate.amount).toBeCloseTo(draftUsd * 60, -1);

    const a = (await t.req('GET', `/projects/${approved.id}?currency=DOP`, { user: t.adminB })).data.estimate;
    expect(a).toEqual(approvedBefore);
    expect(await convertOrgToDop(t.db, t.orgB.id)).toMatchObject({ changed: false });
  });
});
