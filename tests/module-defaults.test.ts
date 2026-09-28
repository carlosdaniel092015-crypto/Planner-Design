import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setup, type Ctx, type TestUser } from './helpers';

let t: Ctx;
let dis: TestUser;
beforeAll(async () => {
  t = await setup();
  dis = await t.makeUser(t.orgA.id, 'disenador', 'dis-mods@a.test');
  const mine = { code: 'MI-B2', name: 'Mi base 2 puertas', type: 'base', category: 'Bajos', minW: 61, maxW: 120, defW: 80, fixedH: 76, fixedD: 60, recipe: { fr: [{ t: 'door', n: 2, f: 1 }] }, unitPrice: 90 };
  expect((await t.req('POST', '/admin/modules', { user: t.adminA, body: mine })).status).toBe(201);
});
afterAll(() => t.close());

describe('módulos propios por defecto de la organización', () => {
  it('el admin los guarda; se descartan códigos que no existen; llegan en el catálogo', async () => {
    const r = await t.req('PATCH', '/organization', { user: t.adminA, body: { moduleDefaults: { 'B-2P': 'MI-B2', 'A-2P': 'NO-EXISTE', 'B-1P': '' } } });
    expect(r.status).toBe(200);
    expect(r.data.moduleDefaults).toEqual({ 'B-2P': 'MI-B2' });
    expect((await t.req('GET', '/organization', { user: dis })).data.moduleDefaults).toEqual({ 'B-2P': 'MI-B2' });
    expect((await t.req('GET', '/catalog', { user: dis })).data.moduleDefaults).toEqual({ 'B-2P': 'MI-B2' });
    // Other organisations are not affected, and their codes cannot be used.
    expect((await t.req('GET', '/catalog', { user: t.adminB })).data.moduleDefaults).toEqual({});
    expect((await t.req('PATCH', '/organization', { user: t.adminB, body: { moduleDefaults: { 'B-2P': 'MI-B2' } } })).data.moduleDefaults).toEqual({});
  });

  it('un diseñador no puede cambiarlos (solo admin) y las otras opciones de la organización se conservan', async () => {
    expect((await t.req('PATCH', '/organization', { user: dis, body: { moduleDefaults: {} } })).status).toBe(403);
    await t.req('PATCH', '/organization', { user: t.adminA, body: { approvalTerms: 'Acepto el diseño.' } });
    const o = (await t.req('GET', '/organization', { user: t.adminA })).data;
    expect(o).toMatchObject({ approvalTerms: 'Acepto el diseño.', moduleDefaults: { 'B-2P': 'MI-B2' } });
    // A project saved with its own choice keeps it in prefs.mods.
    const p = await t.req('POST', '/projects', { user: dis, body: { ptype: 'cocina' } });
    const detail = (await t.req('GET', `/projects/${p.data.id}`, { user: dis })).data;
    const data = { ...detail.data, prefs: { ...detail.data.prefs, mods: { 'B-2P': 'MI-B2', 'A-2P': '' } } };
    const saved = await t.req('PUT', `/projects/${p.data.id}`, { user: dis, body: { data, version: detail.version } });
    expect(saved.status).toBe(200);
    expect((await t.req('GET', `/projects/${p.data.id}`, { user: dis })).data.data.prefs.mods).toEqual({ 'B-2P': 'MI-B2', 'A-2P': '' });
  });
});

describe('ubicación predeterminada del módulo', () => {
  it('se guarda en anchor.place, solo con valores conocidos, y llega al catálogo del editor', async () => {
    const base = { code: 'MI-NEV', name: 'Alto sobre nevera', type: 'upper', category: 'Altos', minW: 60, maxW: 90, defW: 75, fixedH: 40, fixedD: 60, recipe: { fr: [{ t: 'door', n: 2, f: 1 }] }, unitPrice: 50 };
    expect((await t.req('POST', '/admin/modules', { user: t.adminA, body: { ...base, anchor: { place: 'en-el-techo' } } })).status).toBe(400);
    const ok = await t.req('POST', '/admin/modules', { user: t.adminA, body: { ...base, anchor: { place: 'sobre-nevera' } } });
    expect(ok.status).toBe(201);
    const ctx = (await t.req('GET', '/catalog', { user: dis })).data.context;
    expect(ctx.modules['MI-NEV'].place).toBe('sobre-nevera');
    // Quitarla desde la biblioteca.
    expect((await t.req('PATCH', `/library/modules/${ok.data.id}`, { user: t.adminA, body: { anchor: null } })).status).toBe(200);
    expect((await t.req('GET', '/catalog', { user: dis })).data.context.modules['MI-NEV'].place).toBeUndefined();
  });
});
