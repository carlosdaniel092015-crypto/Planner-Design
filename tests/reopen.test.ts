import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_KITCHEN } from '../src/core';
import { withDisplayName } from '../src/services/mailer';
import { setup, type Ctx, type TestUser } from './helpers';

let t: Ctx;
let dis: TestUser;
const APPROVABLE = { ...DEFAULT_KITCHEN, pts: DEFAULT_KITCHEN.pts.map((p) => (p.t === 'agua' ? { ...p, pos: 135 } : p)) };
beforeAll(async () => {
  t = await setup();
  dis = await t.makeUser(t.orgA.id, 'disenador', 'dis-reopen@a.test');
});
afterAll(() => t.close());

describe('reabrir un proyecto aprobado', () => {
  it('vuelve a diseño, se puede editar y reenviar; la aprobación queda en el historial', async () => {
    const p = (await t.req('POST', '/projects', { user: dis, body: { data: APPROVABLE } })).data;
    expect((await t.req('POST', `/projects/${p.id}/approve-internal`, { user: dis, body: { signerName: 'En tienda' } })).status).toBe(200);
    const locked = (await t.req('GET', `/projects/${p.id}`, { user: dis })).data;
    expect((await t.req('PUT', `/projects/${p.id}`, { user: dis, body: { data: APPROVABLE, version: locked.version } })).status).toBe(409);

    // A share with "ver" cannot reopen; another organisation gets 404.
    const lec = await t.makeUser(t.orgA.id, 'disenador', 'ver-reopen@a.test');
    await t.req('PUT', `/projects/${p.id}/shares/${lec.id}`, { user: dis, body: { access: 'ver' } });
    expect((await t.req('POST', `/projects/${p.id}/reopen`, { user: lec, body: {} })).status).toBe(403);
    expect((await t.req('POST', `/projects/${p.id}/reopen`, { user: t.adminB, body: {} })).status).toBe(404);

    const r = await t.req('POST', `/projects/${p.id}/reopen`, { user: dis, body: { reason: 'El cliente quiere otra encimera' } });
    expect(r.status).toBe(200);
    expect(r.data.status).toBe('diseno');
    expect((await t.req('POST', `/projects/${p.id}/reopen`, { user: dis, body: {} })).status).toBe(409);
    const open = (await t.req('GET', `/projects/${p.id}`, { user: dis })).data;
    expect(open).toMatchObject({ status: 'diseno', pricesFrozen: false });
    expect((await t.req('PUT', `/projects/${p.id}`, { user: dis, body: { data: APPROVABLE, version: open.version } })).status).toBe(200);
    const hist = (await t.req('GET', `/projects/${p.id}/approval-links`, { user: dis })).data;
    expect(hist.approvals.some((a: any) => a.decision === 'aprobado')).toBe(true);

    // Sending again works.
    const before = t.mailer.outbox.length;
    const send = await t.req('POST', `/projects/${p.id}/approval-links`, { user: dis, body: { recipient: 'Familia Ortega · 809 555 0101' } });
    expect(send.status).toBe(201);
    expect(send.data.link.recipient).toBe('Familia Ortega · 809 555 0101');
    expect(t.mailer.outbox.length).toBe(before);
    const bare = await t.req('POST', `/projects/${p.id}/approval-links`, { user: dis, body: {} });
    expect(bare.data.link.recipient).toBe('Cliente');
  });

  it('el nombre del remitente cambia, la dirección verificada no', () => {
    expect(withDisplayName('Planner <no-reply@acentosdeco.lat>', 'Acentos Deco')).toBe('"Acentos Deco" <no-reply@acentosdeco.lat>');
    expect(withDisplayName('no-reply@acentosdeco.lat', 'Taller "X" <mal>')).toBe('"Taller X mal" <no-reply@acentosdeco.lat>');
    expect(withDisplayName('Planner <a@b.c>')).toBe('Planner <a@b.c>');
  });
});
