import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addCover,
  computeEstimate,
  DEFAULT_HARDWARE,
  DEFAULT_KITCHEN,
  DEFAULT_MATERIALS,
  DEFAULT_MODULES,
  elev,
  fitCover,
  freeSpot,
  isAppliance,
  type ModuleInstance,
  moduleChoicesFor,
  type PricingContext,
  parts,
  projectDataSchema,
  setDim,
  setElevation,
  templateOf,
  uploadedKind,
  validateProject,
} from '../src/core';
import { moduleDefToRow, moduleRowToDef } from '../src/services/catalog';
import { setup, type Ctx } from './helpers';

const by = <T extends { code: string }>(a: T[]) => Object.fromEntries(a.map((x) => [x.code, x]));
const def = (code: string) => DEFAULT_MODULES.find((d) => d.code === code)!;
const place = (code: string, id: number, pos: number, extra: Partial<ModuleInstance> = {}) => ({ ...templateOf(def(code)), id, wall: 'A', pos, ...extra }) as unknown as ModuleInstance;
const ctx = { settings: { baseCurrency: 'USD', exchangeRateDopPerUsd: 60, taxName: 'ITBIS', taxRate: 0.18, pricesIncludeTax: false, wasteRate: 0.15, marginRate: 0, rounding: 'ninguno' }, modules: by(DEFAULT_MODULES), materials: by(DEFAULT_MATERIALS), hardware: by(DEFAULT_HARDWARE) } as unknown as PricingContext;
const kitchen = (mods: ModuleInstance[]) => projectDataSchema.parse({ ...DEFAULT_KITCHEN, room: { A: 360, B: 300, H: 260 }, ops: [], mods });

describe('cubre falta superior', () => {
  it('está en el catálogo como alto y no se ofrece en lugar de una alacena', () => {
    expect(def('CF-SUP')).toMatchObject({ name: 'Cubre falta superior', cat: 'Altos', type: 'upper', cover: 1, fr: [] });
    expect(moduleChoicesFor('A-1P', by(DEFAULT_MODULES)).map((m) => m.code)).not.toContain('CF-SUP');
  });

  it('se coloca sobre la alacena seleccionada, desde su techo hasta el del cuarto, con su fondo', () => {
    const p = kitchen([place('A-1P', 1, 60, { w: 60, d: 35 }), place('A-2P', 2, 120, { w: 80, d: 32 })]);
    const r = addCover(p, templateOf(def('CF-SUP')), 2)!;
    const m = r.project.mods.find((x) => x.id === r.id)!;
    expect(m).toMatchObject({ wall: 'A', pos: 120, w: 80, z: 220, h: 40, d: 32 });
    // Without a selection it goes over the first upper.
    const first = addCover(p, templateOf(def('CF-SUP')))!;
    expect(first.project.mods.find((x) => x.id === first.id)).toMatchObject({ pos: 60, w: 60, h: 40 });
    // Nothing on the walls to cover.
    expect(addCover(kitchen([]), templateOf(def('CF-SUP')))).toBeNull();
    expect(validateProject(r.project).filter((i) => i.code === 'EXCEDE_ALTURA')).toEqual([]);
  });

  it('sobre una columna arranca de su techo, y se vuelve a ajustar si la alacena sube', () => {
    const p = kitchen([place('C-DE', 1, 0), place('CF-SUP', 2, 0, { w: 50 })]);
    expect(fitCover(p, 2).mods[1]).toMatchObject({ z: 220, h: 40 });
    const q = kitchen([place('A-1P', 1, 0, { w: 60 }), place('CF-SUP', 2, 0, { w: 60 })]);
    const raised = setElevation(q, 1, 165);
    expect(fitCover(raised, 2).mods[1]).toMatchObject({ z: 235, h: 25 });
  });

  it('no estorba: las alacenas nuevas caben debajo y ensancharlo no empuja a nadie', () => {
    const p = kitchen([place('A-1P', 1, 0, { w: 60 }), place('CF-SUP', 2, 60, { w: 120, z: 220, h: 40 })]);
    expect(freeSpot(p, { type: 'upper', w: 60 })).toEqual({ wall: 'A', pos: 60 });
    const wide = setDim(kitchen([place('CF-SUP', 1, 0, { w: 60 }), place('A-1P', 2, 60)]), 1, 'w', 100);
    expect(wide.mods[1]!.pos).toBe(60);
  });

  it('se despieza como un solo tablero de frentes y se cotiza', () => {
    const m = place('CF-SUP', 1, 0, { w: 90, h: 38, z: 222 });
    const ps = parts(m, DEFAULT_KITCHEN.mats, ctx.materials, 4);
    expect(ps).toHaveLength(1);
    expect(ps[0]).toMatchObject({ pieza: 'Cubre falta superior', cant: 1, L: 900, A: 380, slot: 'frentes' });
    const est = computeEstimate(kitchen([m]), ctx);
    expect(est.lines[0]!.materials).toBeGreaterThan(0);
    expect(est.lines[0]!.hardware).toBe(0);
    expect(() => elev(kitchen([m]), 'A', ctx.materials)).not.toThrow();
  });
});

describe('mover hacia arriba o abajo', () => {
  it('sube y baja alacenas y campanas sin pasar del piso ni del techo; los de piso no cambian', () => {
    const p = kitchen([place('A-1P', 1, 0), place('CM-80', 2, 100), place('B-1P', 3, 200)]);
    expect(setElevation(p, 1, 160).mods[0]!.z).toBe(160);
    expect(setElevation(p, 1, 500).mods[0]!.z).toBe(260 - 70);
    expect(setElevation(p, 1, -20).mods[0]!.z).toBe(0);
    expect(setElevation(p, 2, 180).mods[1]!.z).toBe(180);
    expect(setElevation(p, 3, 50)).toBe(p);
  });
});

describe('muebles para electrodomésticos', () => {
  it('un mueble con hueco es mueble aunque esté en «Electro»', () => {
    expect(isAppliance(def('MN-95'))).toBe(false);
    expect(isAppliance({ ...def('ML-65'), cat: 'Electro' })).toBe(false);
    expect(isAppliance(def('RF-75'))).toBe(true);
    expect(isAppliance(def('LV-60'))).toBe(true);
  });

  it('un modelo alto subido es columna; solo es electrodoméstico si el nombre lo dice', () => {
    expect(uploadedKind('Mueble para nevera.glb', 230)).toEqual({ type: 'tall', cat: 'Columnas' });
    expect(uploadedKind('mueble_refrigerador_polyboard.3ds', 220)).toEqual({ type: 'tall', cat: 'Columnas' });
    expect(uploadedKind('Torre horno.dae', 210)).toEqual({ type: 'tall', cat: 'Columnas' });
    expect(uploadedKind('Gabinete', 200)).toEqual({ type: 'tall', cat: 'Columnas' });
    expect(uploadedKind('Nevera Samsung', 180)).toEqual({ type: 'fridge', cat: 'Electro' });
    expect(uploadedKind('Campana inox', 60)).toEqual({ type: 'hood', cat: 'Electro' });
    expect(uploadedKind('Bajo 2 puertas', 76)).toEqual({ type: 'base', cat: 'Mis módulos' });
  });
});

describe('construcción del diseñador de módulos', () => {
  it('entrepaños por compartimento, divisiones verticales y sin trasera', () => {
    const base = place('B-2P', 1, 0, { w: 80 });
    const std = parts(base, DEFAULT_KITCHEN.mats, ctx.materials);
    expect(std.find((p) => p.pieza === 'Trasera')).toBeTruthy();
    const custom = parts({ ...base, shelves: 2, div: 1, back: 0 }, DEFAULT_KITCHEN.mats, ctx.materials);
    expect(custom.find((p) => p.pieza === 'Trasera')).toBeUndefined();
    expect(custom.find((p) => p.pieza === 'División')).toMatchObject({ cant: 1, L: 760 - 36 });
    // 2 shelves in each of the 2 compartments, each one half the inside width.
    expect(custom.find((p) => p.pieza === 'Entrepaño')).toMatchObject({ cant: 4, L: Math.round((800 - 36 - 18) / 2 - 2) });
    expect(parts({ ...base, shelves: 0 }, DEFAULT_KITCHEN.mats, ctx.materials).find((p) => p.pieza === 'Entrepaño')).toBeUndefined();
  });

  it('la receta guarda los parámetros y vuelven en el catálogo', () => {
    const d = { ...def('B-2P'), code: 'MIO-1', shelves: 3, div: 2, back: 0 };
    const row = moduleDefToRow(d);
    expect(row.recipe).toMatchObject({ shelves: 3, div: 2, back: 0 });
    const back = moduleRowToDef({ ...row, id: 'x', organizationId: 'o', row: row.row, category: row.category, recipe: row.recipe } as never);
    expect(back).toMatchObject({ shelves: 3, div: 2, back: 0 });
    expect(templateOf(back)).toMatchObject({ shelves: 3, div: 2, back: 0 });
    const cover = moduleRowToDef({ ...moduleDefToRow(def('CF-SUP')), id: 'y', organizationId: 'o' } as never);
    expect(cover.cover).toBe(1);
  });
});

describe('API de la biblioteca', () => {
  let t: Ctx;
  beforeAll(async () => {
    t = await setup();
  });
  afterAll(() => t.close());

  it('crea y edita un módulo con todos los parámetros del diseñador', async () => {
    const body = { name: 'Librero 3 cuerpos', type: 'tall', category: 'Columnas', projectType: 'cocina', minW: 60, maxW: 150, defW: 120, fixedH: 210, fixedD: 40, unitPrice: 50, recipe: { fr: [{ t: 'open', f: 1 }], shelves: 4, div: 2, back: 0 } };
    const created = await t.req('POST', '/library/modules', { user: t.adminA, body });
    expect(created.status).toBe(201);
    expect(created.data.module.recipe).toMatchObject({ shelves: 4, div: 2, back: 0 });
    const upd = await t.req('PATCH', `/library/modules/${created.data.module.id}`, { user: t.adminA, body: { fixedD: 45, recipe: { fr: [{ t: 'door', n: 2, f: 1 }], shelves: 2 } } });
    expect(upd.status).toBe(200);
    const cat = await t.req('GET', '/catalog', { user: t.adminA });
    expect(cat.data.context.modules[created.data.module.code]).toMatchObject({ d: 45, shelves: 2 });
    expect(cat.data.context.modules[created.data.module.code].div).toBeUndefined();
    // The filler reaches existing organisations with the catalogue.
    expect(cat.data.context.modules['CF-SUP']).toMatchObject({ cover: 1, type: 'upper' });
    const bad = await t.req('POST', '/library/modules', { user: t.adminA, body: { ...body, recipe: { fr: [], div: 9 } } });
    expect(bad.status).toBe(422);
  });
});
