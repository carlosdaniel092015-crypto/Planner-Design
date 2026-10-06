import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setup, type Ctx, type TestUser } from './helpers';

let t: Ctx;
let dis: TestUser;
beforeAll(async () => {
  t = await setup();
  dis = await t.makeUser(t.orgA.id, 'disenador', 'dis-tv@a.test');
});
afterAll(() => t.close());

describe('mueble de TV en la API', () => {
  it('se crea un proyecto de TV y aparece con su tipo en la lista', async () => {
    const r = await t.req('POST', '/projects', { user: dis, body: { ptype: 'tv' } });
    expect(r.status).toBe(201);
    expect(r.data).toMatchObject({ type: 'tv', name: 'Nuevo mueble de TV' });
    expect(r.data.data.mods.some((m: any) => m.code === 'TV-CON')).toBe(true);
    const list = await t.req('GET', '/projects?type=tv', { user: dis });
    expect(list.data.items.map((p: any) => p.id)).toContain(r.data.id);
  });

  it('el catálogo de la organización trae los módulos de TV y un módulo propio puede ser de TV', async () => {
    const cat = (await t.req('GET', '/catalog', { user: dis })).data;
    expect(cat.context.modules['TV-PAN']).toMatchObject({ projectType: 'tv', type: 'upper' });
    const mine = { code: 'MI-CON', name: 'Mi consola', type: 'base', category: 'Mueble TV', minW: 100, maxW: 300, defW: 200, fixedH: 50, fixedD: 45, recipe: { fr: [{ t: 'door', n: 2, f: 1 }] }, unitPrice: 100 };
    const ok = await t.req('POST', '/admin/modules', { user: t.adminA, body: mine });
    expect(ok.status).toBe(201);
    const up = await t.req('PATCH', `/library/modules/${ok.data.id}`, { user: t.adminA, body: { projectType: 'tv', anchor: { place: 'consola-tv' } } });
    expect(up.status).toBe(200);
    expect((await t.req('GET', '/catalog', { user: dis })).data.context.modules['MI-CON']).toMatchObject({ projectType: 'tv', place: 'consola-tv' });
  });
});
