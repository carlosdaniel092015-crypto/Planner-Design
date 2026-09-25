import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { organizations, pendingSignups, users } from '../src/db/schema';
import { setup, type Ctx } from './helpers';

let t: Ctx;
beforeAll(async () => {
  t = await setup();
});
afterAll(() => t.close());

let ip = 0;
const post = (path: string, body: unknown) => t.req('POST', path, { body, headers: { 'cf-connecting-ip': `10.9.0.${++ip}` } });
const codeFrom = (to: string) => {
  const mail = [...t.mailer.outbox].reverse().find((m) => m.to === to);
  return mail?.text.match(/\b(\d{6})\b/)?.[1];
};

describe('registro con código por correo', () => {
  it('envía un código y solo crea la cuenta al confirmarlo (plan Gratis)', async () => {
    const r = await post('/auth/sign-up', { name: 'Rosa Díaz', email: 'Rosa@Taller.test', password: 'clave-segura-123', orgName: 'Muebles Rosa' });
    expect(r.status).toBe(200);
    expect((await t.db.select().from(users).where(eq(users.email, 'rosa@taller.test'))).length).toBe(0);
    const code = codeFrom('rosa@taller.test');
    expect(code).toMatch(/^\d{6}$/);
    const [pending] = await t.db.select().from(pendingSignups).where(eq(pendingSignups.email, 'rosa@taller.test'));
    expect(pending!.codeHash).not.toContain(code!);

    const wrong = code === '000000' ? '111111' : '000000';
    const bad = await post('/auth/sign-up/verify', { email: 'rosa@taller.test', code: wrong });
    expect(bad.status).toBe(422);
    expect(bad.data.error.code).toBe('CODIGO_INCORRECTO');

    const ok = await post('/auth/sign-up/verify', { email: 'rosa@taller.test', code });
    expect(ok.status).toBe(200);
    expect(ok.data.user).toMatchObject({ email: 'rosa@taller.test', role: 'admin' });
    expect(ok.data.organization.name).toBe('Muebles Rosa');
    expect(ok.headers.get('set-cookie')).toContain('pd_session=');
    const [org] = await t.db.select().from(organizations).where(eq(organizations.id, ok.data.organization.id));
    expect(org).toMatchObject({ plan: 'gratis', baseCurrency: 'DOP' });
    // The code works once, and the password signs in.
    expect((await post('/auth/sign-up/verify', { email: 'rosa@taller.test', code })).status).toBe(410);
    expect((await post('/auth/sign-in', { email: 'rosa@taller.test', password: 'clave-segura-123' })).status).toBe(200);
  });

  it('bloquea el código tras 5 intentos y reenviar da uno nuevo', async () => {
    await post('/auth/sign-up', { name: 'Leo', email: 'leo@taller.test', password: 'clave-segura-123' });
    const first = codeFrom('leo@taller.test')!;
    const wrong = first === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await post('/auth/sign-up/verify', { email: 'leo@taller.test', code: wrong })).status).toBe(422);
    const locked = await post('/auth/sign-up/verify', { email: 'leo@taller.test', code: first });
    expect(locked.status).toBe(410);
    expect(locked.data.error.code).toBe('CODIGO_BLOQUEADO');
    expect((await post('/auth/sign-up/resend', { email: 'leo@taller.test' })).status).toBe(200);
    const second = codeFrom('leo@taller.test')!;
    expect((await post('/auth/sign-up/verify', { email: 'leo@taller.test', code: second })).status).toBe(200);
  });

  it('un correo ya registrado responde igual y recibe un aviso, no un código', async () => {
    const before = t.mailer.outbox.length;
    const r = await post('/auth/sign-up', { name: 'Intruso', email: 'admin@a.test', password: 'otra-clave-123' });
    expect(r.status).toBe(200);
    const mail = t.mailer.outbox.slice(before).find((m) => m.to === 'admin@a.test');
    expect(mail?.subject).toContain('Ya tienes una cuenta');
    expect(mail?.text).not.toMatch(/\b\d{6}\b/);
    expect((await post('/auth/sign-up/verify', { email: 'admin@a.test', code: '123456' })).status).toBe(410);
  });

  it('si el correo no sale lo dice (503) en lugar de fingir que se envió', async () => {
    const send = t.mailer.send;
    t.mailer.send = async () => {
      throw new Error('Resend respondió 403');
    };
    try {
      const r = await post('/auth/sign-up', { name: 'Sin correo', email: 'nomail@taller.test', password: 'clave-segura-123' });
      expect(r.status).toBe(503);
      expect(r.data.error.code).toBe('CORREO_NO_DISPONIBLE');
    } finally {
      t.mailer.send = send;
    }
  });
});
