import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { computeEstimate, type PricingContext, DEFAULT_HARDWARE, DEFAULT_KITCHEN, DEFAULT_MATERIALS, DEFAULT_MODULES, elev, iso, type ModuleInstance, parts, plan, projectDataSchema, templateOf, validateProject } from '../src/core';
import { moduleDefinitions } from '../src/db/schema';
import { setup, type Ctx } from './helpers';

const by = <T extends { code: string }>(a: T[]) => Object.fromEntries(a.map((x) => [x.code, x]));
const def = (code: string) => DEFAULT_MODULES.find((d) => d.code === code)!;
const place = (code: string, id: number, pos: number, wall: 'A' | 'B' = 'A') => ({ ...templateOf(def(code)), id, wall, pos }) as unknown as ModuleInstance;
const ctx = { settings: { baseCurrency: 'USD', exchangeRateDopPerUsd: 60, taxName: 'ITBIS', taxRate: 0.18, pricesIncludeTax: false, wasteRate: 0.15, marginRate: 0, rounding: 'ninguno' }, modules: by(DEFAULT_MODULES), materials: by(DEFAULT_MATERIALS), hardware: by(DEFAULT_HARDWARE) } as unknown as PricingContext;

describe('electrodomésticos nuevos', () => {
  it('están en el catálogo: estufas tradicionales de 4 y 6 hornillas, nevera 2 puertas, fregadero 2 bocas, estufa empotrable 6', () => {
    expect(def('ET-76')).toMatchObject({ name: 'Estufa tradicional 4 hornillas', cat: 'Electro', type: 'base', cook: 4, range: 1 });
    expect(def('ET-90')).toMatchObject({ name: 'Estufa tradicional 6 hornillas', cook: 6, range: 1 });
    expect(def('RF-2P')).toMatchObject({ name: 'Nevera 2 puertas', type: 'fridge', fd: 2 });
    expect(def('BF-2B')).toMatchObject({ name: 'Bajo fregadero 2 bocas', sink: 2 });
    expect(def('BP-6H')).toMatchObject({ name: 'Estufa empotrable 6 hornillas', cook: 6 });
    // The instance keeps the counts (not just "has a sink").
    expect(place('BF-2B', 1, 0)).toMatchObject({ sink: 2 });
    expect(place('ET-90', 1, 0)).toMatchObject({ cook: 6, range: 1 });
    expect(place('RF-2P', 1, 0)).toMatchObject({ fd: 2 });
  });

  it('la estufa tradicional se compra (no se despieza) y se cotiza a su precio; la empotrable y el fregadero doble sí se despiezan', () => {
    expect(parts(place('ET-76', 1, 0), DEFAULT_KITCHEN.mats, ctx.materials)).toEqual([]);
    expect(parts(place('BP-6H', 1, 0), DEFAULT_KITCHEN.mats, ctx.materials).length).toBeGreaterThan(3);
    const p = projectDataSchema.parse({ ...DEFAULT_KITCHEN, mods: [place('ET-90', 1, 0), place('BF-2B', 2, 100), place('RF-2P', 3, 250)] });
    const est = computeEstimate(p, ctx);
    const line = (id: number) => est.lines.find((l) => l.id === id)!;
    expect(line(1)).toMatchObject({ basis: 'catalogo', materials: 0, hardware: 0 });
    expect(line(1).total).toBeCloseTo(980, 2);
    expect(line(3).total).toBeCloseTo(2450, 2);
    expect(line(2).materials).toBeGreaterThan(0);
  });

  it('planta: 6 hornillas, 2 bocas y la división de la nevera; alzado e isométrico sin errores', () => {
    const p = projectDataSchema.parse({ ...DEFAULT_KITCHEN, mods: [place('ET-90', 1, 0), place('BF-2B', 2, 100), place('RF-2P', 3, 250), place('BP-6H', 4, 0, 'B')] });
    const d = plan(p, { cotas: false });
    const circles = d.items.filter((i) => i.t === 'c' && i.fill === 'none');
    expect(circles.length).toBe(12);
    const e = elev(p, 'A', ctx.materials, { cotas: false });
    expect(e.items.length).toBeGreaterThan(20);
    // The range stands on the floor (no plinth under it): only the double sink has one on wall A.
    expect(e.items.filter((i) => i.fill === '#3b3936').length).toBe(1);
    expect(e.items.some((i) => i.mid === 1)).toBe(true);
    expect(iso(p, {} as never, { ang: 45, cotas: false, altos: true }).items.length).toBeGreaterThan(30);
  });

  it('el fregadero doble cuenta como fregadero y la estufa tradicional como parrilla para las reglas', () => {
    const p = projectDataSchema.parse({ ...DEFAULT_KITCHEN, ops: [], mods: [place('ET-76', 1, 0), place('BF-2B', 2, 100)] });
    const codes = validateProject(p, ctx).map((i) => i.code);
    expect(codes.some((c) => c === 'SIN_TOMA_AGUA' || c === 'AGUA_LEJOS')).toBe(true);
  });
});

describe('catálogo de organizaciones existentes', () => {
  let t: Ctx;
  beforeAll(async () => {
    t = await setup();
  });
  afterAll(() => t.close());

  it('recibe los módulos nuevos del catálogo estándar; los descontinuados no vuelven', async () => {
    const admin = t.adminA;
    // As if the organisation had been created before these appliances existed.
    await t.db.delete(moduleDefinitions).where(and(eq(moduleDefinitions.organizationId, t.orgA.id), eq(moduleDefinitions.code, 'ET-90')));
    await t.db.update(moduleDefinitions).set({ active: false }).where(and(eq(moduleDefinitions.organizationId, t.orgA.id), eq(moduleDefinitions.code, 'RF-2P')));
    const cat = (await t.req('GET', '/catalog', { user: admin })).data;
    expect(cat.context.modules['ET-90']).toMatchObject({ cook: 6, range: 1, active: true });
    expect(cat.modules.some((m: { code: string }) => m.code === 'RF-2P')).toBe(false);
    const rows = await t.db.select().from(moduleDefinitions).where(and(eq(moduleDefinitions.organizationId, t.orgA.id), eq(moduleDefinitions.code, 'RF-2P')));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.active).toBe(false);
  });
});
