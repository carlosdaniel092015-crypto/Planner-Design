import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setup, type Ctx, type TestUser } from './helpers';

let t: Ctx;
let ana: TestUser;
let luis: TestUser;
beforeAll(async () => {
  t = await setup();
  ana = await t.makeUser(t.orgA.id, 'disenador', 'ana-lib@a.test');
  luis = await t.makeUser(t.orgA.id, 'disenador', 'luis-lib@a.test');
});
afterAll(() => t.close());

const mod = (code: string, extra: object = {}) => ({ code, name: `Módulo ${code}`, type: 'base', category: 'Mis módulos', minW: 40, maxW: 120, defW: 80, fixedH: 76, fixedD: 60, recipe: { fr: [{ t: 'door', n: 2, f: 1 }] }, ...extra });

describe('biblioteca de la empresa e individual', () => {
  it('un módulo «Solo yo» lo ve y lo edita solo quien lo creó', async () => {
    const mine = await t.req('POST', '/library/modules', { user: ana, body: mod('ANA-1', { personal: true }) });
    expect(mine.status).toBe(201);
    expect(mine.data.module.ownerUserId).toBe(ana.id);
    const shared = await t.req('POST', '/library/modules', { user: ana, body: mod('EMP-1') });
    expect(shared.data.module.ownerUserId).toBeNull();

    const codes = async (u: TestUser) => (await t.req('GET', '/library/modules', { user: u })).data.items.map((m: any) => m.code);
    expect(await codes(ana)).toEqual(expect.arrayContaining(['ANA-1', 'EMP-1']));
    expect(await codes(luis)).toContain('EMP-1');
    expect(await codes(luis)).not.toContain('ANA-1');
    // Not even the admin sees it (like private projects).
    expect(await codes(t.adminA)).not.toContain('ANA-1');

    expect((await t.req('PATCH', `/library/modules/${mine.data.module.id}`, { user: luis, body: { name: 'Robado' } })).status).toBe(404);
    expect((await t.req('DELETE', `/library/modules/${mine.data.module.id}`, { user: luis })).status).toBe(404);
    expect((await t.req('PATCH', `/library/modules/${mine.data.module.id}`, { user: ana, body: { name: 'Mi base' } })).status).toBe(200);

    // Editor catalogue: out of Luis's list, kept (hidden) in the pricing context.
    const cat = (await t.req('GET', '/catalog', { user: luis })).data;
    expect(cat.modules.map((m: any) => m.code)).not.toContain('ANA-1');
    expect(cat.context.modules['ANA-1'].hidden).toBe(true);
    expect(cat.context.modules['EMP-1'].hidden).toBeUndefined();
    const catAna = (await t.req('GET', '/catalog', { user: ana })).data;
    expect(catAna.modules.map((m: any) => m.code)).toContain('ANA-1');
    expect(catAna.context.modules['ANA-1'].hidden).toBeUndefined();
  });

  it('compartir con la empresa: el dueño lo pasa a «Toda la empresa»; quitarlo a la empresa solo lo hace un admin', async () => {
    const own = await t.req('POST', '/library/modules', { user: ana, body: mod('ANA-2', { personal: true }) });
    const up = await t.req('PATCH', `/library/modules/${own.data.module.id}`, { user: ana, body: { personal: false } });
    expect(up.data.module.ownerUserId).toBeNull();
    expect((await t.req('GET', '/library/modules', { user: luis })).data.items.map((m: any) => m.code)).toContain('ANA-2');
    expect((await t.req('PATCH', `/library/modules/${own.data.module.id}`, { user: luis, body: { personal: true } })).status).toBe(403);
    const back = await t.req('PATCH', `/library/modules/${own.data.module.id}`, { user: t.adminA, body: { personal: true } });
    expect(back.data.module.ownerUserId).toBe(t.adminA.id);
  });

  it('la exportación ZIP no incluye lo personal de otros', async () => {
    const zip = await t.req('GET', '/library/export?items=modules', { user: luis });
    expect(zip.status).toBe(200);
    const { unzipSync, strFromU8 } = await import('fflate');
    const manifest = JSON.parse(strFromU8(unzipSync(zip.data)['manifest.json']!));
    const codes = manifest.modules.map((m: any) => m.module.code);
    expect(codes).toContain('EMP-1');
    expect(codes).not.toContain('ANA-1');
  });

  it('al borrar su cuenta, lo personal pasa a la empresa', async () => {
    const tmp = await t.makeUser(t.orgA.id, 'disenador', 'tmp-lib@a.test');
    await t.req('POST', '/library/modules', { user: tmp, body: mod('TMP-1', { personal: true }) });
    expect((await t.req('GET', '/library/modules', { user: luis })).data.items.map((m: any) => m.code)).not.toContain('TMP-1');
    const del = await t.req('DELETE', '/me', { user: tmp, body: { password: 'clave-segura-123', confirm: 'ELIMINAR' } });
    expect(del.status).toBe(204);
    expect((await t.req('GET', '/library/modules', { user: luis })).data.items.map((m: any) => m.code)).toContain('TMP-1');
  });
});
