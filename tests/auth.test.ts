import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setup, type Ctx } from './helpers';

let t: Ctx;
beforeAll(async () => {
  t = await setup();
});
afterAll(() => t.close());

describe('salud y base de datos', () => {
  it('GET /health verifica la base de datos', async () => {
    const r = await t.req('GET', '/health');
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ status: 'ok', db: 'ok' });
  });

  it('las migraciones y la semilla crean el catálogo desde cero', async () => {
    const r = await t.req('GET', '/me', { user: t.adminA });
    expect(r.status).toBe(200);
    expect(r.data.user.role).toBe('admin');
    expect(r.data.organization.slug).toBe('org-a');
  });

});

describe('autenticación', () => {
  it('inicia sesión con cookie httpOnly y SameSite=Lax', async () => {
    const res = await t.app.request('/api/v1/auth/sign-in', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ADMIN@a.test', password: 'clave-segura-123' }),
    });
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/pd_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const token = /pd_session=([^;]+)/.exec(cookie)![1]!;
    const me = await t.app.request('/api/v1/me', { headers: { cookie: `pd_session=${token}` } });
    expect(me.status).toBe(200);
  });

  it('rechaza contraseña incorrecta con 401 y mensaje en español', async () => {
    const r = await t.req('POST', '/auth/sign-in', { body: { email: 'admin@a.test', password: 'mala' } });
    expect(r.status).toBe(401);
    expect(r.data.error).toEqual({ code: 'NO_AUTENTICADO', message: 'Correo o contraseña incorrectos.' });
  });

  it('limita intentos de inicio de sesión por cuenta (429)', async () => {
    let last = 0;
    for (let i = 0; i < 10; i++) last = (await t.req('POST', '/auth/sign-in', { body: { email: 'limite@a.test', password: 'x' } })).status;
    expect(last).toBe(429);
  });

  it('sin sesión responde 401', async () => {
    const r = await t.req('GET', '/me');
    expect(r.status).toBe(401);
    expect(r.data.error.code).toBe('NO_AUTENTICADO');
  });

  it('recuperación de contraseña: correo, token de un solo uso y cierre de sesiones', async () => {
    const u = await t.makeUser(t.orgA.id, 'disenador', 'olvido@a.test');
    const r1 = await t.req('POST', '/auth/forgot-password', { body: { email: 'olvido@a.test' } });
    expect(r1.status).toBe(200);
    const mail = t.mailer.outbox.find((m) => m.to === 'olvido@a.test')!;
    expect(mail.subject).toMatch(/Restablece/);
    const token = decodeURIComponent(/token=([^\s"&]+)/.exec(mail.text)![1]!);
    const r2 = await t.req('POST', '/auth/reset-password', { body: { token, password: 'nueva-clave-larga' } });
    expect(r2.status).toBe(200);
    expect((await t.req('GET', '/me', { user: u })).status).toBe(401);
    const again = await t.req('POST', '/auth/reset-password', { body: { token, password: 'otra-clave-larga' } });
    expect(again.status).toBe(410);
    const ok = await t.req('POST', '/auth/sign-in', { body: { email: 'olvido@a.test', password: 'nueva-clave-larga' } });
    expect(ok.status).toBe(200);
  });

  it('forgot-password no revela si el correo existe', async () => {
    const r = await t.req('POST', '/auth/forgot-password', { body: { email: 'nadie@a.test' } });
    expect(r.status).toBe(200);
  });
});

describe('usuarios (solo admin)', () => {
  it('invita, acepta invitación y cambia rol', async () => {
    const inv = await t.req('POST', '/users', { user: t.adminA, body: { name: 'Taller Uno', email: 'taller1@a.test', role: 'taller' } });
    expect(inv.status).toBe(201);
    expect(inv.data.active).toBe(false);
    const mail = t.mailer.outbox.find((m) => m.to === 'taller1@a.test')!;
    const token = decodeURIComponent(/token=([^\s"&]+)/.exec(mail.text)![1]!);
    const acc = await t.req('POST', '/auth/accept-invite', { body: { token, password: 'clave-del-taller' } });
    expect(acc.status).toBe(200);
    expect(acc.data.user.role).toBe('taller');
    const patch = await t.req('PATCH', `/users/${inv.data.id}`, { user: t.adminA, body: { role: 'lectura' } });
    expect(patch.status).toBe(200);
    expect(patch.data.role).toBe('lectura');
  });

  it('un diseñador no puede listar usuarios (403)', async () => {
    const d = await t.makeUser(t.orgA.id, 'disenador', 'dis-users@a.test');
    expect((await t.req('GET', '/users', { user: d })).status).toBe(403);
  });

  it('no permite quitar al último admin', async () => {
    const r = await t.req('PATCH', `/users/${t.adminB.id}`, { user: t.adminB, body: { role: 'lectura' } });
    expect(r.status).toBe(409);
    expect(r.data.error.code).toBe('ULTIMO_ADMIN');
  });

  it('un admin no puede editar usuarios de otra organización (404)', async () => {
    const r = await t.req('PATCH', `/users/${t.adminB.id}`, { user: t.adminA, body: { active: false } });
    expect(r.status).toBe(404);
  });
});

describe('clientes', () => {
  it('CRUD con borrado lógico, búsqueda y dueño', async () => {
    const d1 = await t.makeUser(t.orgA.id, 'disenador', 'd1-cli@a.test');
    const d2 = await t.makeUser(t.orgA.id, 'disenador', 'd2-cli@a.test');
    const c = await t.req('POST', '/clients', { user: d1, body: { name: 'Familia Ortega', phone: '809 555 0101' } });
    expect(c.status).toBe(201);
    const list = await t.req('GET', '/clients?q=ortega', { user: d2 });
    expect(list.data.items.map((x: any) => x.id)).toContain(c.data.id);
    expect((await t.req('PATCH', `/clients/${c.data.id}`, { user: d2, body: { notes: 'x' } })).status).toBe(403);
    expect((await t.req('PATCH', `/clients/${c.data.id}`, { user: d1, body: { notes: 'Llamar tarde' } })).data.notes).toBe('Llamar tarde');
    expect((await t.req('GET', `/clients/${c.data.id}`, { user: t.adminB })).status).toBe(404);
    expect((await t.req('DELETE', `/clients/${c.data.id}`, { user: d1 })).status).toBe(204);
    expect((await t.req('GET', `/clients/${c.data.id}`, { user: d1 })).status).toBe(404);
  });

  it('paginación por cursor', async () => {
    for (let i = 0; i < 5; i++) await t.req('POST', '/clients', { user: t.adminB, body: { name: `Cliente ${i}` } });
    const p1 = await t.req('GET', '/clients?limit=2', { user: t.adminB });
    expect(p1.data.items).toHaveLength(2);
    const p2 = await t.req('GET', `/clients?limit=2&cursor=${p1.data.nextCursor}`, { user: t.adminB });
    expect(p2.data.items).toHaveLength(2);
    expect(p2.data.items[0].id).not.toBe(p1.data.items[0].id);
    expect((await t.req('GET', '/clients?limit=500', { user: t.adminB })).status).toBe(400);
  });
});
