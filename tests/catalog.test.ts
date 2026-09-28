import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setup, type Ctx, type TestUser } from './helpers';

let t: Ctx;
let dis: TestUser;
beforeAll(async () => {
  t = await setup();
  dis = await t.makeUser(t.orgA.id, 'disenador', 'dis-cat@a.test');
});
afterAll(() => t.close());

describe('catálogo', () => {
  it('GET /catalog con ETag, Cache-Control y 304', async () => {
    const r = await t.req('GET', '/catalog', { user: dis });
    expect(r.status).toBe(200);
    expect(r.data.modules.length).toBeGreaterThan(30);
    expect(r.data.materials.find((m: any) => m.code === 'roble')).toMatchObject({ type: 'Melamina texturizada', uses: ['cuerpo', 'frentes'], color: '#c49a6c' });
    expect(r.data.pricing).toMatchObject({ taxName: 'ITBIS', taxRate: 0.18, exchangeRateDopPerUsd: 60 });
    const etag = r.headers.get('etag')!;
    expect(r.headers.get('cache-control')).toMatch(/no-cache/); // always revalidated: new library items show up at once
    const again = await t.req('GET', '/catalog', { user: dis, headers: { 'if-none-match': etag } });
    expect(again.status).toBe(304);
  });

  it('?currency=DOP convierte precios con la tasa', async () => {
    const r = await t.req('GET', '/catalog?currency=DOP', { user: dis });
    const rf = r.data.modules.find((m: any) => m.code === 'RF-75');
    expect(rf.price).toEqual({ amount: 1828 * 60, currency: 'DOP', rate: 60 });
  });

  it('admin crea módulo; valida min_w ≤ def_w ≤ max_w y la receta', async () => {
    const base = { code: 'BF-100', name: 'Bajo fregadero 100', type: 'base', category: 'Bajos', minW: 80, maxW: 120, defW: 100, fixedH: 76, fixedD: 60, recipe: { fr: [{ t: 'door', n: 2, f: 1 }], sink: 1 }, unitPrice: 110 };
    const ok = await t.req('POST', '/admin/modules', { user: t.adminA, body: base });
    expect(ok.status).toBe(201);
    expect(ok.data).toMatchObject({ code: 'BF-100', type: 'base', doors: 2, version: 1 });
    const bad = await t.req('POST', '/admin/modules', { user: t.adminA, body: { ...base, code: 'X1', defW: 130 } });
    expect(bad.status).toBe(422);
    expect(bad.data.error.code).toBe('RANGO_DE_ANCHO');
    const badRecipe = await t.req('POST', '/admin/modules', { user: t.adminA, body: { ...base, code: 'X2', recipe: { fr: [{ t: 'door', f: 0.5 }] } } });
    expect(badRecipe.status).toBe(422);
    expect(badRecipe.data.error.code).toBe('RECETA_INVALIDA');
    const dup = await t.req('POST', '/admin/modules', { user: t.adminA, body: base });
    expect(dup.status).toBe(409);
    const upd = await t.req('PATCH', `/admin/modules/${ok.data.id}`, { user: t.adminA, body: { unitPrice: 120 } });
    expect(upd.data.version).toBe(2);
    expect((await t.req('DELETE', `/admin/modules/${ok.data.id}`, { user: t.adminA })).status).toBe(204);
    const cat = await t.req('GET', '/catalog', { user: dis });
    expect(cat.data.modules.find((m: any) => m.code === 'BF-100')).toBeUndefined();
  });

  it('solo admin usa /admin/*', async () => {
    expect((await t.req('GET', '/admin/materials', { user: dis })).status).toBe(403);
    expect((await t.req('POST', '/admin/hardware', { user: dis, body: { code: 'X', name: 'X', unitPrice: 1 } })).status).toBe(403);
  });

  it('herrajes y materiales: crear y editar', async () => {
    const h = await t.req('POST', '/admin/hardware', { user: t.adminA, body: { code: 'RIEL-LED', name: 'Riel LED', unitPrice: 15 } });
    expect(h.status).toBe(201);
    const m = await t.req('POST', '/admin/materials', { user: t.adminA, body: { code: 'marmol', name: 'Mármol Carrara', type: 'Cuarzo 20 mm', kind: 'piedra', uses: ['encimera'], priceM2: 210 } });
    expect(m.status).toBe(201);
    const u = await t.req('PATCH', `/admin/materials/${m.data.id}`, { user: t.adminA, body: { priceM2: 220 } });
    expect(u.data).toMatchObject({ priceM2: 220, version: 2 });
  });
});

describe('precios y tasas', () => {
  it('GET/PUT /settings/pricing (solo admin cambia)', async () => {
    expect((await t.req('GET', '/settings/pricing', { user: dis })).status).toBe(200);
    expect((await t.req('PUT', '/settings/pricing', { user: dis, body: { taxRate: 0.1 } })).status).toBe(403);
    const r = await t.req('PUT', '/settings/pricing', { user: t.adminB, body: { marginRate: 0.1, rounding: 'unidad' } });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ marginRate: 0.1, rounding: 'unidad', taxRate: 0.18 });
  });

  it('POST /exchange-rates registra la tasa y la vuelve vigente', async () => {
    const r = await t.req('POST', '/exchange-rates', { user: t.adminB, body: { dopPerUsd: 63.5 } });
    expect(r.status).toBe(201);
    const list = await t.req('GET', '/exchange-rates', { user: t.adminB });
    expect(list.data.current).toBe(63.5);
    expect(list.data.items[0].dopPerUsd).toBe(63.5);
    expect(list.data.items.length).toBe(2);
    expect((await t.req('GET', '/settings/pricing', { user: t.adminB })).data.exchangeRateDopPerUsd).toBe(63.5);
  });

  it('ajuste masivo con vista previa y aplicación', async () => {
    const before = (await t.req('GET', '/admin/materials', { user: t.adminB })).data.items.find((m: any) => m.code === 'blanco');
    const preview = await t.req('POST', '/admin/prices/bulk?dryRun=true', { user: t.adminB, body: { scope: 'materials', category: 'Melamina', percent: 10 } });
    expect(preview.data.dryRun).toBe(true);
    expect(preview.data.items.find((i: any) => i.code === 'blanco')).toMatchObject({ from: 18, to: 19.8 });
    const same = (await t.req('GET', '/admin/materials', { user: t.adminB })).data.items.find((m: any) => m.code === 'blanco');
    expect(same.priceM2).toBe(before.priceM2);
    const applied = await t.req('POST', '/admin/prices/bulk', { user: t.adminB, body: { scope: 'materials', category: 'Melamina', percent: 10 } });
    expect(applied.data.count).toBe(preview.data.count);
    const after = (await t.req('GET', '/admin/materials', { user: t.adminB })).data.items.find((m: any) => m.code === 'blanco');
    expect(after).toMatchObject({ priceM2: 19.8, version: 2 });
    const hw = await t.req('POST', '/admin/prices/bulk', { user: t.adminB, body: { scope: 'hardware', percent: -10 } });
    expect(hw.data.items.find((i: any) => i.code === 'BISAGRA').to).toBe(2.25);
    expect((await t.req('POST', '/admin/prices/bulk', { user: dis, body: { scope: 'hardware', percent: 5 } })).status).toBe(403);
  });
});
