import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_KITCHEN } from '../src/core';
import { setup, type Ctx, type TestUser } from './helpers';

let t: Ctx;
beforeAll(async () => {
  t = await setup();
});
afterAll(() => t.close());

describe('mi cuenta', () => {
  it('cambia el nombre y la contraseña (pide la actual y cierra las demás sesiones)', async () => {
    const u = await t.makeUser(t.orgA.id, 'disenador', 'cuenta1@a.test');
    const other = { ...u, token: (await t.req('POST', '/auth/sign-in', { body: { email: u.email, password: 'clave-segura-123' } })).headers.get('set-cookie')!.match(/pd_session=([^;]+)/)![1]! };
    expect((await t.req('PATCH', '/me', { user: u, body: { name: 'Nombre Nuevo' } })).status).toBe(200);
    expect((await t.req('GET', '/me', { user: u })).data.user.name).toBe('Nombre Nuevo');
    const bad = await t.req('POST', '/me/password', { user: u, body: { currentPassword: 'no-es', newPassword: 'otra-clave-123' } });
    expect(bad.status).toBe(403);
    expect(bad.data.error.code).toBe('CONTRASENA_INCORRECTA');
    expect((await t.req('POST', '/me/password', { user: u, body: { currentPassword: 'clave-segura-123', newPassword: 'corta' } })).status).toBe(400);
    expect((await t.req('POST', '/me/password', { user: u, body: { currentPassword: 'clave-segura-123', newPassword: 'otra-clave-123' } })).status).toBe(200);
    expect((await t.req('GET', '/me', { user: u })).status).toBe(200); // this session stays
    expect((await t.req('GET', '/me', { user: other })).status).toBe(401); // the other device is signed out
    expect((await t.req('POST', '/auth/sign-in', { body: { email: u.email, password: 'otra-clave-123' } })).status).toBe(200);
  });

  it('borrar la cuenta elimina sus proyectos y accesos, anonimiza y no deja entrar', async () => {
    const u = await t.makeUser(t.orgA.id, 'disenador', 'borrar@a.test');
    const friend = await t.makeUser(t.orgA.id, 'disenador', 'amiga@a.test');
    const mine = (await t.req('POST', '/projects', { user: u, body: { data: DEFAULT_KITCHEN } })).data;
    const theirs = (await t.req('POST', '/projects', { user: friend, body: { data: DEFAULT_KITCHEN } })).data;
    await t.req('PUT', `/projects/${theirs.id}/shares/${u.id}`, { user: friend, body: { access: 'ver' } });
    await t.req('PUT', `/projects/${mine.id}/shares/${friend.id}`, { user: u, body: { access: 'ver' } });
    expect((await t.req('DELETE', '/me', { user: u, body: { password: 'mala', confirm: 'ELIMINAR' } })).status).toBe(403);
    expect((await t.req('DELETE', '/me', { user: u, body: { password: 'clave-segura-123', confirm: 'no' } })).status).toBe(400);
    expect((await t.req('DELETE', '/me', { user: u, body: { password: 'clave-segura-123', confirm: 'ELIMINAR' } })).status).toBe(204);
    expect((await t.req('GET', '/me', { user: u })).status).toBe(401);
    expect((await t.req('POST', '/auth/sign-in', { body: { email: 'borrar@a.test', password: 'clave-segura-123' } })).status).toBe(401);
    expect((await t.req('GET', `/projects/${mine.id}`, { user: friend })).status).toBe(404);
    expect((await t.req('GET', `/projects/${theirs.id}/shares`, { user: friend })).data.items).toHaveLength(0);
    const users = (await t.req('GET', '/users', { user: t.adminA })).data.items;
    expect(users.find((x: any) => x.id === u.id)).toMatchObject({ name: 'Cuenta eliminada', active: false });
    expect(users.some((x: any) => x.email === 'borrar@a.test')).toBe(false);
  });

  it('el único administrador no puede borrarse', async () => {
    const r = await t.req('DELETE', '/me', { user: t.adminB, body: { password: 'clave-segura-123', confirm: 'ELIMINAR' } });
    expect(r.status).toBe(409);
    expect(r.data.error.code).toBe('ULTIMO_ADMIN');
  });
});
