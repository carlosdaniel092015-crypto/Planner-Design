import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeEstimate, DEFAULT_HARDWARE, DEFAULT_KITCHEN, DEFAULT_MATERIALS, DEFAULT_MODULES, type PricingContext, projectDataSchema } from '../src/core';
import { setup, type Ctx, type TestUser } from './helpers';

let t: Ctx;
let d1: TestUser;
let d2: TestUser;
let taller: TestUser;
beforeAll(async () => {
  t = await setup();
  d1 = await t.makeUser(t.orgA.id, 'disenador', 'd1@a.test');
  d2 = await t.makeUser(t.orgA.id, 'disenador', 'd2@a.test');
  taller = await t.makeUser(t.orgA.id, 'taller', 'taller@a.test');
});
afterAll(() => t.close());

const by = <T extends { code: string }>(a: T[]) => Object.fromEntries(a.map((x) => [x.code, x]));
/** What the frontend computes with the same core and the seeded prices (rate 60, ITBIS 18 %). */
const frontendCtx: PricingContext = {
  settings: { baseCurrency: 'USD', exchangeRateDopPerUsd: 60, taxName: 'ITBIS', taxRate: 0.18, pricesIncludeTax: false, wasteRate: 0.15, marginRate: 0, rounding: 'ninguno' },
  modules: by(DEFAULT_MODULES),
  materials: by(DEFAULT_MATERIALS),
  hardware: by(DEFAULT_HARDWARE),
};

describe('proyectos', () => {
  it('crea la cocina por defecto y el estimado coincide con el del frontend en USD y DOP', async () => {
    const r = await t.req('POST', '/projects', { user: d1, body: { data: DEFAULT_KITCHEN } });
    expect(r.status).toBe(201);
    const data = projectDataSchema.parse(DEFAULT_KITCHEN);
    const usd = computeEstimate(data, frontendCtx, 'USD');
    const dop = computeEstimate(data, frontendCtx, 'DOP');
    expect(r.data.estimate).toEqual({ amount: usd.total, currency: 'USD', rate: 60 });
    expect(r.data.moduleCount).toBe(13);
    expect(r.data.estimateDetail.taxName).toBe('ITBIS');
    expect(r.data.estimateDetail.taxRate).toBe(0.18);
    const g = await t.req('GET', `/projects/${r.data.id}?currency=DOP`, { user: d1 });
    expect(g.data.estimate).toEqual({ amount: dop.total, currency: 'DOP', rate: 60 });
    expect(Math.abs(dop.total - usd.total * 60)).toBeLessThan(1);
    const list = await t.req('GET', '/projects?currency=DOP', { user: d1 });
    const item = list.data.items.find((x: any) => x.id === r.data.id);
    expect(item.data).toBeUndefined();
    expect(item.estimate.currency).toBe('DOP');
  });

  it('sin data usa la plantilla del prototipo', async () => {
    const r = await t.req('POST', '/projects', { user: d1, body: { ptype: 'vestidor', name: 'Vestidor principal' } });
    expect(r.status).toBe(201);
    expect(r.data.type).toBe('closet');
    expect(r.data.data.ptype).toBe('vestidor');
    expect(r.data.name).toBe('Vestidor principal');
  });

  it('rechaza un JSON que no cumple el esquema (400) y uno de más de 2 MB (413)', async () => {
    const bad = await t.req('POST', '/projects', { user: d1, body: { data: { ...DEFAULT_KITCHEN, room: { A: -1 } } } });
    expect(bad.status).toBe(400);
    expect(bad.data.error.code).toBe('PROYECTO_INVALIDO');
    const big = await t.req('POST', '/projects', { user: d1, body: { data: { ...DEFAULT_KITCHEN, views: { blob: 'x'.repeat(2.2 * 1024 * 1024) } } } });
    expect(big.status).toBe(413);
  });

  it('PUT con una versión vieja responde 409 con la versión actual', async () => {
    const p = (await t.req('POST', '/projects', { user: d1, body: { data: DEFAULT_KITCHEN } })).data;
    const ok = await t.req('PUT', `/projects/${p.id}`, { user: d1, body: { version: 1, data: { ...DEFAULT_KITCHEN, pname: 'Renombrada' } } });
    expect(ok.status).toBe(200);
    expect(ok.data.version).toBe(2);
    expect(ok.data.name).toBe('Renombrada');
    const stale = await t.req('PUT', `/projects/${p.id}`, { user: d1, body: { version: 1, data: DEFAULT_KITCHEN } });
    expect(stale.status).toBe(409);
    expect(stale.data.error.code).toBe('VERSION_DESACTUALIZADA');
    expect(stale.data.error.details.currentVersion).toBe(2);
    const viaHeader = await t.req('PUT', `/projects/${p.id}`, { user: d1, headers: { 'if-match': '"2"' }, body: { data: DEFAULT_KITCHEN } });
    expect(viaHeader.status).toBe(200);
    const missing = await t.req('PUT', `/projects/${p.id}`, { user: d1, body: { data: DEFAULT_KITCHEN } });
    expect(missing.status).toBe(428);
  });

  it('la portada solo acepta archivos de la organización', async () => {
    const p = (await t.req('POST', '/projects', { user: d1, body: {} })).data;
    const bad = await t.req('PUT', `/projects/${p.id}`, { user: d1, body: { version: p.version, data: p.data, coverUrl: 'https://tracker.example.com/pixel.jpg' } });
    expect(bad.status).toBe(422);
    expect(bad.data.error.code).toBe('PORTADA_NO_VALIDA');
    const own = `http://localhost:3000/api/v1/storage/${t.orgA.id}/miniatura/abc-portada.jpg`;
    const ok = await t.req('PUT', `/projects/${p.id}`, { user: d1, body: { version: p.version, data: p.data, coverUrl: own } });
    expect(ok.status, JSON.stringify(ok.data)).toBe(200);
    expect(ok.data.coverUrl).toBe(own);
  });

  it('pasar a fase 3 crea una versión con snapshot de precios', async () => {
    const p = (await t.req('POST', '/projects', { user: d1, body: { data: DEFAULT_KITCHEN } })).data;
    await t.req('PUT', `/projects/${p.id}`, { user: d1, body: { version: 1, phase: 3, data: DEFAULT_KITCHEN } });
    const vs = await t.req('GET', `/projects/${p.id}/versions`, { user: d1 });
    expect(vs.data.items).toHaveLength(1);
    expect(vs.data.items[0].note).toBe('Paso a fase 3');
    const v = await t.req('GET', `/projects/${p.id}/versions/${vs.data.items[0].id}`, { user: d1 });
    expect(v.data.pricingSnapshot.settings.exchangeRateDopPerUsd).toBe(60);
    expect(Object.keys(v.data.pricingSnapshot.materials)).toEqual(expect.arrayContaining(['blanco', 'roble', 'cuarzo', 'hdf']));
    expect(v.data.pricingSnapshot.modules['RF-75'].unitPrice).toBe(1828);
  });

  it('versiones manuales y restaurar', async () => {
    const p = (await t.req('POST', '/projects', { user: d1, body: { data: DEFAULT_KITCHEN } })).data;
    const v = await t.req('POST', `/projects/${p.id}/versions`, { user: d1, body: { note: 'Antes de quitar el refri' } });
    expect(v.status).toBe(201);
    const noFridge = { ...DEFAULT_KITCHEN, mods: DEFAULT_KITCHEN.mods.filter((m) => m.type !== 'fridge') };
    const u = await t.req('PUT', `/projects/${p.id}`, { user: d1, body: { version: 1, data: noFridge } });
    expect(u.data.moduleCount).toBe(12);
    const r = await t.req('POST', `/projects/${p.id}/versions/${v.data.id}/restore`, { user: d1 });
    expect(r.status).toBe(200);
    expect(r.data.moduleCount).toBe(13);
    expect(r.data.version).toBe(3);
  });

  it('permisos: otro diseñador lee pero no edita; lectura no crea; taller solo ve aprobados', async () => {
    const p = (await t.req('POST', '/projects', { user: d1, body: { data: DEFAULT_KITCHEN } })).data;
    expect((await t.req('GET', `/projects/${p.id}`, { user: d2 })).status).toBe(200);
    expect((await t.req('PUT', `/projects/${p.id}`, { user: d2, body: { version: 1, data: DEFAULT_KITCHEN } })).status).toBe(403);
    expect((await t.req('DELETE', `/projects/${p.id}`, { user: d2 })).status).toBe(403);
    const lectura = await t.makeUser(t.orgA.id, 'lectura', 'lec@a.test');
    expect((await t.req('POST', '/projects', { user: lectura, body: {} })).status).toBe(403);
    expect((await t.req('GET', `/projects/${p.id}`, { user: taller })).status).toBe(404);
    const list = await t.req('GET', '/projects', { user: taller });
    expect(list.data.items.every((x: any) => x.status === 'aprobado')).toBe(true);
  });

  it('un usuario de otra organización recibe 404', async () => {
    const p = (await t.req('POST', '/projects', { user: d1, body: { data: DEFAULT_KITCHEN } })).data;
    for (const [m, path] of [
      ['GET', `/projects/${p.id}`],
      ['GET', `/projects/${p.id}/validate`],
      ['GET', `/projects/${p.id}/versions`],
      ['POST', `/projects/${p.id}/duplicate`],
      ['DELETE', `/projects/${p.id}`],
    ] as const)
      expect((await t.req(m, path, { user: t.adminB })).status, `${m} ${path}`).toBe(404);
    const other = await t.req('GET', '/projects', { user: t.adminB });
    expect(other.data.items.find((x: any) => x.id === p.id)).toBeUndefined();
  });

  it('validate devuelve los avisos del editor', async () => {
    const p = (await t.req('POST', '/projects', { user: d1, body: { data: DEFAULT_KITCHEN } })).data;
    const v = await t.req('GET', `/projects/${p.id}/validate`, { user: d1 });
    expect(v.status).toBe(200);
    expect(v.data.canApprove).toBe(false);
    expect(v.data.issues[0]).toMatchObject({ st: 'err', code: 'AGUA_LEJOS' });
    expect(v.data.issues.map((i: any) => i.code)).toContain('TRIANGULO');
  });

  it('duplicar y borrar (lógico)', async () => {
    const p = (await t.req('POST', '/projects', { user: d1, body: { data: DEFAULT_KITCHEN } })).data;
    const dup = await t.req('POST', `/projects/${p.id}/duplicate`, { user: d2 });
    expect(dup.status).toBe(201);
    expect(dup.data.name).toMatch(/\(copia\)$/);
    expect(dup.data.ownerId).toBe(d2.id);
    expect((await t.req('DELETE', `/projects/${p.id}`, { user: d1 })).status).toBe(204);
    expect((await t.req('GET', `/projects/${p.id}`, { user: d1 })).status).toBe(404);
  });
});
