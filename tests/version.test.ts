import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_KITCHEN } from '../src/core';
import { setup, type Ctx, type TestUser } from './helpers';

let t: Ctx;
let dis: TestUser;
beforeAll(async () => {
  t = await setup();
  dis = await t.makeUser(t.orgA.id, 'disenador', 'dis-ver@a.test');
});
afterAll(() => t.close());

describe('control de versiones', () => {
  it('GET /version responde la versión de package.json sin sesión', async () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const r = await t.req('GET', '/version');
    expect(r.status).toBe(200);
    expect(r.data.version).toBe(pkg.version);
    expect(r.data.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('el historial del proyecto trae quién creó cada versión y se puede restaurar', async () => {
    const p = (await t.req('POST', '/projects', { user: dis, body: { name: 'Con historial', data: DEFAULT_KITCHEN } })).data;
    const v = await t.req('POST', `/projects/${p.id}/versions`, { user: dis, body: { note: 'Antes de cambiar la encimera' } });
    expect(v.status).toBe(201);
    const changed = await t.req('PUT', `/projects/${p.id}`, { user: dis, body: { version: p.version, name: 'Cambiado', data: { ...DEFAULT_KITCHEN, mods: DEFAULT_KITCHEN.mods.slice(0, 3) } } });
    expect(changed.data.moduleCount).toBe(3);
    const list = await t.req('GET', `/projects/${p.id}/versions`, { user: dis });
    expect(list.data.items[0]).toMatchObject({ note: 'Antes de cambiar la encimera', createdByName: expect.any(String) });
    const back = await t.req('POST', `/projects/${p.id}/versions/${v.data.id}/restore`, { user: dis });
    expect(back.status).toBe(200);
    expect(back.data.moduleCount).toBe(DEFAULT_KITCHEN.mods.length);
  });
});
