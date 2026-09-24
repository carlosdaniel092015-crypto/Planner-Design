import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_KITCHEN } from '../src/core';
import { setup, type Ctx, type TestUser } from './helpers';

let t: Ctx;
let owner: TestUser;
let viewer: TestUser;
let editor: TestUser;
let taller: TestUser;
let outsider: TestUser;
beforeAll(async () => {
  t = await setup();
  owner = await t.makeUser(t.orgA.id, 'disenador', 'dueno@a.test');
  viewer = await t.makeUser(t.orgA.id, 'disenador', 've@a.test');
  editor = await t.makeUser(t.orgA.id, 'disenador', 'edita@a.test');
  taller = await t.makeUser(t.orgA.id, 'taller', 'taller-sh@a.test');
  outsider = await t.makeUser(t.orgB.id, 'disenador', 'otra-org@b.test');
});
afterAll(() => t.close());

describe('compartir proyectos', () => {
  let id: string;

  it('el dueño comparte para ver y para editar; quien lo recibe ve el mismo proyecto', async () => {
    const p = await t.req('POST', '/projects', { user: owner, body: { name: 'Cocina compartida', data: DEFAULT_KITCHEN } });
    id = p.data.id;
    expect((await t.req('PUT', `/projects/${id}/shares/${viewer.id}`, { user: owner, body: { access: 'ver' } })).status).toBe(200);
    const e = await t.req('PUT', `/projects/${id}/shares/${editor.id}`, { user: owner, body: { access: 'editar' } });
    expect(e.data).toMatchObject({ userId: editor.id, access: 'editar' });

    const seen = await t.req('GET', `/projects/${id}`, { user: viewer });
    expect(seen.status).toBe(200);
    expect(seen.data).toMatchObject({ access: 'ver', ownerName: expect.any(String), shareCount: 0 });
    const mine = await t.req('GET', `/projects/${id}`, { user: owner });
    expect(mine.data).toMatchObject({ access: 'propietario', shareCount: 2 });

    const shared = await t.req('GET', '/projects?scope=compartidos', { user: viewer });
    expect(shared.data.items.map((x: any) => x.id)).toEqual([id]);
    expect((await t.req('GET', '/projects?scope=mios', { user: viewer })).data.items).toHaveLength(0);

    const list = await t.req('GET', `/projects/${id}/shares`, { user: viewer });
    expect(list.data.owner.userId).toBe(owner.id);
    expect(list.data.items.map((x: any) => [x.userId, x.access])).toEqual(expect.arrayContaining([[viewer.id, 'ver'], [editor.id, 'editar']]));
  });

  it('ver no edita; editar sí, y el dueño ve los cambios', async () => {
    const cur = (await t.req('GET', `/projects/${id}`, { user: owner })).data;
    expect((await t.req('PUT', `/projects/${id}`, { user: viewer, body: { version: cur.version, name: 'No', data: cur.data } })).status).toBe(403);
    const ok = await t.req('PUT', `/projects/${id}`, { user: editor, body: { version: cur.version, name: 'Editada por la colega', data: cur.data } });
    expect(ok.status).toBe(200);
    expect((await t.req('GET', `/projects/${id}`, { user: owner })).data.name).toBe('Editada por la colega');
    expect((await t.req('GET', `/projects/${id}`, { user: viewer })).data.name).toBe('Editada por la colega');
  });

  it('solo el dueño borra y comparte', async () => {
    expect((await t.req('DELETE', `/projects/${id}`, { user: editor })).status).toBe(403);
    expect((await t.req('PUT', `/projects/${id}/shares/${taller.id}`, { user: editor, body: { access: 'ver' } })).status).toBe(403);
    expect((await t.req('DELETE', `/projects/${id}/shares/${viewer.id}`, { user: editor })).status).toBe(403);
  });

  it('taller: solo con acceso ver; otra organización no existe', async () => {
    const bad = await t.req('PUT', `/projects/${id}/shares/${taller.id}`, { user: owner, body: { access: 'editar' } });
    expect(bad.status).toBe(422);
    expect(bad.data.error.code).toBe('ROL_SOLO_LECTURA');
    expect((await t.req('PUT', `/projects/${id}/shares/${taller.id}`, { user: owner, body: { access: 'ver' } })).status).toBe(200);
    expect((await t.req('GET', `/projects/${id}/cutlist.csv`, { user: taller })).status).toBe(200);
    expect((await t.req('PUT', `/projects/${id}/shares/${outsider.id}`, { user: owner, body: { access: 'ver' } })).status).toBe(404);
    expect((await t.req('GET', `/projects/${id}`, { user: outsider })).status).toBe(404);
    expect((await t.req('PUT', `/projects/${id}/shares/${owner.id}`, { user: owner, body: { access: 'ver' } })).data.error.code).toBe('ES_EL_DUENO');
  });

  it('quitar acceso (el dueño, o la persona misma) lo vuelve invisible y queda en la auditoría', async () => {
    expect((await t.req('DELETE', `/projects/${id}/shares/${viewer.id}`, { user: owner })).status).toBe(204);
    expect((await t.req('GET', `/projects/${id}`, { user: viewer })).status).toBe(404);
    expect((await t.req('DELETE', `/projects/${id}/shares/${editor.id}`, { user: editor })).status).toBe(204);
    expect((await t.req('GET', `/projects/${id}`, { user: editor })).status).toBe(404);
    const dir = await t.req('GET', '/users/directory', { user: owner });
    expect(dir.data.items.some((u: any) => u.id === owner.id)).toBe(false);
    expect(dir.data.items.some((u: any) => u.id === outsider.id)).toBe(false);
    expect(dir.data.items.some((u: any) => u.id === viewer.id)).toBe(true);
  });
});
