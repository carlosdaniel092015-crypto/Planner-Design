import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_KITCHEN } from '../src/core';
import { approvalLinks } from '../src/db/schema';
import { setup, type Ctx, type TestUser } from './helpers';

let t: Ctx;
let dis: TestUser;
let taller: TestUser;
beforeAll(async () => {
  t = await setup();
  dis = await t.makeUser(t.orgA.id, 'disenador', 'dis-apr@a.test');
  taller = await t.makeUser(t.orgA.id, 'taller', 'taller-apr@a.test');
});
afterAll(() => t.close());

/** The prototype's kitchen with the water point moved under the sink, so it has no validation errors. */
const APPROVABLE = { ...DEFAULT_KITCHEN, pts: DEFAULT_KITCHEN.pts.map((p) => (p.t === 'agua' ? { ...p, pos: 135 } : p)) };

const create = async (data: unknown = APPROVABLE) => (await t.req('POST', '/projects', { user: dis, body: { data } })).data;
const send = async (id: string, days = 14) => t.req('POST', `/projects/${id}/approval-links`, { user: dis, body: { recipientEmail: 'cliente@ejemplo.com', expiresInDays: days } });
const accept = { signerName: 'María Ortega', accepted: true };
const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('aprobación pública', () => {
  it('en un enlace ya enviado se puede ocultar y volver a mostrar el presupuesto, sin reenviar', async () => {
    const p = await create();
    const s = await send(p.id);
    const id = s.data.link.id;
    const off = await t.req('PATCH', `/approval-links/${id}`, { user: dis, body: { showPrices: false } });
    expect(off.status).toBe(200);
    expect(off.data.showPrices).toBe(false);
    expect((await t.req('GET', `/public/approvals/${s.data.token}`)).data).toMatchObject({ showPrices: false, estimate: null });
    expect((await t.req('PATCH', `/approval-links/${id}`, { user: dis, body: { showPrices: true } })).data.showPrices).toBe(true);
    expect((await t.req('GET', `/public/approvals/${s.data.token}`)).data.estimate.amount).toBeGreaterThan(0);
    // Other organisations don't see the link; the shop can't send; an answered link can't change.
    expect((await t.req('PATCH', `/approval-links/${id}`, { user: t.adminB, body: { showPrices: false } })).status).toBe(404);
    expect((await t.req('PATCH', `/approval-links/${id}`, { user: taller, body: { showPrices: false } })).status).not.toBe(200);
    await t.req('POST', `/public/approvals/${s.data.token}`, { body: { ...accept, decision: 'aprobado' } });
    const used = await t.req('PATCH', `/approval-links/${id}`, { user: dis, body: { showPrices: false } });
    expect(used.status).toBe(409);
    expect(used.data.error.code).toBe('ENLACE_USADO');
  });

  it('se puede enviar sin presupuesto: la página del cliente no trae precios, totales ni ajustes', async () => {
    const data = { ...APPROVABLE, priceAdj: { inst: 10, desc: 5, final: 250000, counter: null, taxRate: null }, prefs: { ...APPROVABLE.prefs, presupuesto: 500000 } };
    const p = await create(data);
    const s = await t.req('POST', `/projects/${p.id}/approval-links`, { user: dis, body: { recipient: 'Familia Ortega', showPrices: false } });
    expect(s.status).toBe(201);
    expect(s.data.link.showPrices).toBe(false);
    const view = await t.req('GET', `/public/approvals/${s.data.token}`);
    expect(view.status).toBe(200);
    expect(view.data).toMatchObject({ showPrices: false, estimate: null, estimateDetail: null, pdfUrl: null });
    expect(view.data.data.priceAdj).toBeUndefined();
    expect(view.data.data.prefs.presupuesto).toBeUndefined();
    expect(view.data.data.mods.length).toBe(APPROVABLE.mods.length);
    expect(view.data.organization.terms).not.toContain('presupuesto');
    expect(JSON.stringify(view.data)).not.toContain('250000');
    // The client can still approve it; the approved version keeps its pricing snapshot for the shop.
    expect((await t.req('POST', `/public/approvals/${s.data.token}`, { body: { ...accept, decision: 'aprobado' } })).status).toBe(200);
    const after = await t.req('GET', `/projects/${p.id}`, { user: dis });
    expect(after.data.status).toBe('aprobado');
    expect(after.data.estimate.amount).toBeGreaterThan(0);
    // By default the budget is included.
    const p2 = await create();
    const s2 = await send(p2.id);
    expect(s2.data.link.showPrices).toBe(true);
    const v2 = await t.req('GET', `/public/approvals/${s2.data.token}`);
    expect(v2.data.showPrices).toBe(true);
    expect(v2.data.estimate.amount).toBeGreaterThan(0);
  });

  it('flujo completo: enviar, abrir, aprobar; correo al cliente y al dueño', async () => {
    const p = await create();
    const s = await send(p.id);
    expect(s.status).toBe(201);
    expect(s.data.url).toBe(`http://localhost:5173/p/${s.data.token}`);
    expect(s.data.token).toHaveLength(43);
    const [row] = await t.db.select().from(approvalLinks).where(eq(approvalLinks.id, s.data.link.id));
    expect(row!.tokenHash).not.toContain(s.data.token);
    // The link is shared by WhatsApp or copied: no email goes to the client.
    expect(t.mailer.outbox.some((m) => m.to === 'cliente@ejemplo.com')).toBe(false);
    expect(s.data.link).toMatchObject({ recipient: 'cliente@ejemplo.com' });
    expect((await t.req('GET', `/projects/${p.id}`, { user: dis })).data.status).toBe('enviado');

    const view = await t.req('GET', `/public/approvals/${s.data.token}`);
    expect(view.status).toBe(200);
    expect(view.data.project).toMatchObject({ name: 'Cocina Familia Ortega', client: 'Familia Ortega' });
    expect(view.data.plan.items.length).toBeGreaterThan(50);
    expect(view.data.elevations.A.vb).toHaveLength(4);
    expect(view.data.materials.map((m: any) => m.code)).toEqual(expect.arrayContaining(['blanco', 'roble', 'cuarzo', 'negro']));
    expect(view.data.canApprove).toBe(true);
    expect(view.data.estimate.amount).toBe(p.estimate.amount);
    const [opened] = await t.db.select().from(approvalLinks).where(eq(approvalLinks.id, s.data.link.id));
    expect(opened!.openedAt).not.toBeNull();

    const noAccept = await t.req('POST', `/public/approvals/${s.data.token}`, { body: { decision: 'aprobado', signerName: 'X' } });
    expect(noAccept.status).toBe(400);
    const ok = await t.req('POST', `/public/approvals/${s.data.token}`, { body: { decision: 'aprobado', ...accept, signature: SIG }, headers: { 'user-agent': 'Prueba/1.0', 'x-forwarded-for': '203.0.113.9' } });
    expect(ok.status).toBe(200);
    const detail = await t.req('GET', `/projects/${p.id}`, { user: dis });
    expect(detail.data).toMatchObject({ status: 'aprobado', pricesFrozen: true });
    expect(t.mailer.outbox.some((m) => m.to === 'dis-apr@a.test' && /Proyecto aprobado/.test(m.subject))).toBe(true);
    const hist = await t.req('GET', `/projects/${p.id}/approval-links`, { user: dis });
    expect(hist.data.approvals[0]).toMatchObject({ decision: 'aprobado', signerName: 'María Ortega', linkId: s.data.link.id });
    expect(hist.data.approvals[0].snapshotSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(hist.data.approvals[0].signature).toBe(SIG);
    const badSig = await t.req('POST', `/projects/${p.id}/approve-internal`, { user: dis, body: { signerName: 'Yo', signature: 'javascript:alert(1)' } });
    expect(badSig.status).toBe(400);

    // The workshop sees it once the designer shares it, and downloads the cut list.
    expect((await t.req('GET', `/projects/${p.id}`, { user: taller })).status).toBe(404);
    expect((await t.req('PUT', `/projects/${p.id}/shares/${taller.id}`, { user: dis, body: { access: 'ver' } })).status).toBe(200);
    expect((await t.req('GET', `/projects/${p.id}`, { user: taller })).status).toBe(200);
    const csv = await t.req('GET', `/projects/${p.id}/cutlist.csv`, { user: taller });
    expect(csv.status).toBe(200);
    expect(csv.data.startsWith('"Material","Espesor (mm)"')).toBe(true);
    const raw = new Uint8Array(await (await t.app.request(`/api/v1/projects/${p.id}/cutlist.csv`, { headers: { authorization: `Bearer ${taller.token}` } })).arrayBuffer());
    expect([...raw.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const dxf = await t.req('GET', `/projects/${p.id}/pieces.dxf`, { user: taller });
    expect(dxf.status).toBe(200);
    const dxfText = new TextDecoder().decode(dxf.data);
    expect(dxfText).toContain('AC1009');
    expect(dxfText).toContain('POLYLINE');
    expect(dxfText.trimEnd().endsWith('EOF')).toBe(true);
    // Editing an approved project is refused.
    expect((await t.req('PUT', `/projects/${p.id}`, { user: dis, body: { version: detail.data.version, data: APPROVABLE } })).status).toBe(409);
  });

  it('el enlace ya usado, revocado o caducado responde 410 con mensaje claro', async () => {
    const p1 = await create();
    const used = (await send(p1.id)).data.token;
    await t.req('POST', `/public/approvals/${used}`, { body: { decision: 'cambios', comment: 'Quiero la isla', ...accept } });
    const r1 = await t.req('GET', `/public/approvals/${used}`);
    expect(r1.status).toBe(410);
    expect(r1.data.error).toMatchObject({ code: 'ENLACE_USADO' });
    expect((await t.req('GET', `/projects/${p1.id}`, { user: dis })).data.status).toBe('cambios_solicitados');
    expect(t.mailer.outbox.some((m) => /Cambios solicitados/.test(m.subject) && m.text.includes('Quiero la isla'))).toBe(true);

    const p2 = await create();
    const s2 = (await send(p2.id)).data;
    expect((await t.req('POST', `/approval-links/${s2.link.id}/revoke`, { user: dis })).status).toBe(200);
    const r2 = await t.req('POST', `/public/approvals/${s2.token}`, { body: { decision: 'aprobado', ...accept } });
    expect(r2.status).toBe(410);
    expect(r2.data.error.code).toBe('ENLACE_REVOCADO');
    expect(r2.data.error.message).toMatch(/revocado/);
    expect((await t.req('GET', `/projects/${p2.id}`, { user: dis })).data.status).toBe('diseno');

    const p3 = await create();
    const s3 = (await send(p3.id)).data;
    await t.db.update(approvalLinks).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(approvalLinks.id, s3.link.id));
    const r3 = await t.req('GET', `/public/approvals/${s3.token}`);
    expect(r3.status).toBe(410);
    expect(r3.data.error.code).toBe('ENLACE_CADUCADO');

    expect((await t.req('GET', `/public/approvals/${'x'.repeat(43)}`)).status).toBe(404);
  });

  it('un enlace nuevo revoca el anterior', async () => {
    const p = await create();
    const first = (await send(p.id)).data.token;
    await send(p.id);
    expect((await t.req('GET', `/public/approvals/${first}`)).data.error.code).toBe('ENLACE_REVOCADO');
  });
});

describe('proyectos con errores no se aprueban', () => {
  it('ni al enviar, ni de forma interna', async () => {
    const p = await create(DEFAULT_KITCHEN); // sink 120 cm from the water point → err
    const s = await send(p.id);
    expect(s.status).toBe(422);
    expect(s.data.error.code).toBe('PROYECTO_CON_ERRORES');
    expect(s.data.error.details[0].code).toBe('AGUA_LEJOS');
    const i = await t.req('POST', `/projects/${p.id}/approve-internal`, { user: dis, body: { signerName: 'Yo' } });
    expect(i.status).toBe(422);
  });

  it('ni de forma pública si la versión congelada tiene errores (p. ej. material descontinuado borrado del snapshot)', async () => {
    const p = await create();
    const s = (await send(p.id)).data;
    // Corrupt the frozen snapshot so validation fails for the public decision.
    const { projectVersions } = await import('../src/db/schema');
    const [v] = await t.db.select().from(projectVersions).where(eq(projectVersions.id, s.versionId));
    const snap = v!.pricingSnapshot as any;
    delete snap.materials.roble;
    await t.db.update(projectVersions).set({ pricingSnapshot: snap }).where(eq(projectVersions.id, s.versionId));
    const r = await t.req('POST', `/public/approvals/${s.token}`, { body: { decision: 'aprobado', ...accept } });
    expect(r.status).toBe(422);
    expect(r.data.error.code).toBe('PROYECTO_CON_ERRORES');
    // Requesting changes is still allowed.
    expect((await t.req('POST', `/public/approvals/${s.token}`, { body: { decision: 'cambios', ...accept } })).status).toBe(200);
  });
});

describe('aprobación interna y precios congelados', () => {
  it('cambiar la tasa no altera el importe de un proyecto aprobado', async () => {
    const p = await create();
    const before = (await t.req('GET', `/projects/${p.id}?currency=DOP`, { user: dis })).data.estimate;
    const ok = await t.req('POST', `/projects/${p.id}/approve-internal`, { user: dis, body: { signerName: 'Familia Ortega (en tienda)' } });
    expect(ok.status).toBe(200);
    expect(ok.data.approval.linkId).toBeNull();

    const draft = await create();
    const draftBefore = (await t.req('GET', `/projects/${draft.id}?currency=DOP`, { user: dis })).data.estimate;

    await t.req('POST', '/exchange-rates', { user: t.adminA, body: { dopPerUsd: 65 } });
    await t.req('POST', '/admin/prices/bulk', { user: t.adminA, body: { scope: 'materials', percent: 20 } });

    const after = (await t.req('GET', `/projects/${p.id}?currency=DOP`, { user: dis })).data.estimate;
    expect(after).toEqual(before);
    const listed = (await t.req('GET', '/projects?currency=DOP', { user: dis })).data.items.find((x: any) => x.id === p.id);
    expect(listed.estimate.amount).toBeCloseTo(before.amount, 0);
    expect(listed.estimate.rate).toBe(60);

    const draftAfter = (await t.req('GET', `/projects/${draft.id}?currency=DOP`, { user: dis })).data.estimate;
    expect(draftAfter.rate).toBe(65);
    expect(draftAfter.amount).toBeGreaterThan(draftBefore.amount);

    const again = await t.req('POST', `/projects/${p.id}/approve-internal`, { user: dis, body: { signerName: 'Otra vez' } });
    expect(again.status).toBe(409);
  });

  it('otro diseñador no puede enviar ni aprobar un proyecto ajeno (ni compartido para ver); otra organización recibe 404', async () => {
    const p = await create();
    const d2 = await t.makeUser(t.orgA.id, 'disenador', 'dis2-apr@a.test');
    expect((await t.req('POST', `/projects/${p.id}/approval-links`, { user: d2, body: { recipientEmail: 'x@y.com' } })).status).toBe(404);
    await t.req('PUT', `/projects/${p.id}/shares/${d2.id}`, { user: dis, body: { access: 'ver' } });
    expect((await t.req('POST', `/projects/${p.id}/approval-links`, { user: d2, body: { recipientEmail: 'x@y.com' } })).status).toBe(403);
    expect((await t.req('POST', `/projects/${p.id}/approve-internal`, { user: d2, body: { signerName: 'x' } })).status).toBe(403);
    expect((await t.req('POST', `/projects/${p.id}/approve-internal`, { user: t.adminB, body: { signerName: 'x' } })).status).toBe(404);
    expect((await t.req('GET', `/projects/${p.id}/cutlist.csv`, { user: t.adminB })).status).toBe(404);
  });

  it('approvals es de solo inserción', async () => {
    await expect(t.db.execute('update approvals set comment = \'x\'')).rejects.toThrow();
  });
});
