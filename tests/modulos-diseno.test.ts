import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addCover,
  hardwareFor,
  standOf,
  moduleBoards,
  addCovers,
  generateDesign,
  newProject,
  computeEstimate,
  DEFAULT_HARDWARE,
  DEFAULT_KITCHEN,
  DEFAULT_MATERIALS,
  DEFAULT_MODULES,
  elev,
  fitCover,
  iso,
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
  zr,
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
  it('sube y baja alacenas y campanas sin pasar del piso ni del techo', () => {
    const p = kitchen([place('A-1P', 1, 0), place('CM-80', 2, 100)]);
    expect(setElevation(p, 1, 160).mods[0]!.z).toBe(160);
    expect(setElevation(p, 1, 500).mods[0]!.z).toBe(260 - 70);
    expect(setElevation(p, 1, -20).mods[0]!.z).toBe(0);
    expect(setElevation(p, 2, 180).mods[1]!.z).toBe(180);
  });

  it('los muebles de piso también suben y bajan: flotan sin zócalo y vuelven a él', () => {
    const p = kitchen([place('B-1P', 1, 0, { w: 45 }), place('C-DE', 2, 45), place('RF-75', 3, 100), place('ET-76', 4, 200)]);
    const up = setElevation(p, 1, 40);
    expect(up.mods[0]!.z).toBe(40);
    expect(zr(up.mods[0]!, 10)).toEqual([40, 116]);
    expect(zr(p.mods[0]!, 10)).toEqual([10, 86]);
    expect(setElevation(p, 2, 0).mods[1]!.z).toBe(0);
    expect(setElevation(p, 2, 100).mods[1]!.z).toBe(260 - 210);
    // Back on the plinth.
    expect(setElevation(up, 1, null).mods[0]).not.toHaveProperty('z');
    // Fridges and freestanding ranges stand on the floor.
    expect(setElevation(p, 3, 30)).toBe(p);
    expect(setElevation(p, 4, 30)).toBe(p);
    // Raised: no plinth in the elevation; still under the ceiling for validation.
    const d = elev(up, 'A', ctx.materials);
    const plinths = (q: typeof d) => q.items.filter((i) => i.fill === '#3b3936').length;
    expect(plinths(d)).toBe(plinths(elev(p, 'A', ctx.materials)) - 1);
    expect(setElevation(p, 1, 500).mods[0]!.z).toBe(260 - 76 - 4);
    expect(validateProject(setElevation(p, 1, 500)).filter((i) => i.code === 'EXCEDE_ALTURA')).toEqual([]);
    expect(() => iso(up, ctx.materials)).not.toThrow();
  });

  it('un mueble levantado sobre otro no cuenta como traslape', () => {
    const p = kitchen([place('B-1P', 1, 0, { w: 45 }), place('B-1P', 2, 20, { w: 45 })]);
    expect(validateProject(p).some((i) => i.code === 'TRASLAPE')).toBe(true);
    const stacked = setElevation(p, 2, 120);
    expect(validateProject(stacked).some((i) => i.code === 'TRASLAPE')).toBe(false);
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

  it('guarda qué es el mueble y su construcción por paneles', async () => {
    const body = { name: 'MB 2 puertas', kind: 'fregadero', type: 'base', category: 'Bajos', minW: 30, maxW: 120, defW: 95, fixedH: 77, fixedD: 64, recipe: { fr: [{ t: 'door', n: 2, f: 1 }], sink: 1, build: { top: 'travesanos', bottomPos: 'total', backPos: 'total', backT: 18 } } };
    const created = await t.req('POST', '/library/modules', { user: t.adminA, body });
    expect(created.status).toBe(201);
    expect(created.data.module).toMatchObject({ kind: 'fregadero', recipe: { build: { top: 'travesanos', bottomPos: 'total', backPos: 'total', backT: 18 } } });
    const cat = await t.req('GET', '/catalog', { user: t.adminA });
    expect(cat.data.context.modules[created.data.module.code].build).toMatchObject({ bottomPos: 'total', backT: 18 });
    const bad = await t.req('POST', '/library/modules', { user: t.adminA, body: { ...body, recipe: { fr: [], build: { top: 'tal vez' } } } });
    expect(bad.status).toBe(422);
  });
});

describe('cubre falta en Especificaciones → Preferencias', () => {
  const gen = (cubre?: object, H = 250) => {
    const p = projectDataSchema.parse({ ...newProject('cocina'), room: { A: 360, B: 300, H }, prefs: { ...newProject('cocina').prefs, alacena: '70 cm', ...(cubre ? { cubre } : {}) } });
    return { p, g: generateDesign(p, by(DEFAULT_MODULES)) };
  };

  it('sin marcar no se agrega', () => {
    expect(gen().g.mods.some((m) => m.cover)).toBe(false);
    expect(gen({ on: false }).g.mods.some((m) => m.cover)).toBe(false);
  });

  it('marcado: uno por tramo de alacenas y columnas, del ancho del tramo y hasta el techo', () => {
    const { g } = gen({ on: true });
    const covers = g.mods.filter((m) => m.cover);
    expect(covers.length).toBeGreaterThan(0);
    for (const c of covers) {
      expect(c).toMatchObject({ type: 'upper', code: 'CF-SUP' });
      // Over units of its wall, flush with their top, reaching the ceiling.
      expect(c.z! + c.h).toBe(250);
      const under = g.mods.filter((m) => !m.cover && m.wall === c.wall && (m.type === 'upper' || m.type === 'tall') && m.pos! < c.pos! + c.w && m.pos! + m.w > c.pos!);
      expect(under.length).toBeGreaterThan(0);
      expect(under.reduce((a, m) => a + m.w, 0)).toBeGreaterThanOrEqual(c.w);
    }
    // Uppers at 150 + 70: 30 cm up to a 250 cm ceiling. Ids stay unique.
    expect(covers.some((c) => c.z === 220 && c.h === 30)).toBe(true);
    expect(new Set(g.mods.map((m) => m.id)).size).toBe(g.mods.length);
  });

  it('respeta alto fijo, holgura con el techo y fondo', () => {
    const fixed = gen({ on: true, h: 20 }).g.mods.find((m) => m.cover && m.z === 220)!;
    expect(fixed.h).toBe(20);
    const gap = gen({ on: true, gap: 2, d: 40 }).g.mods.find((m) => m.cover && m.z === 220)!;
    expect(gap).toMatchObject({ h: 28, d: 40 });
    // A fixed height never goes past the ceiling.
    expect(gen({ on: true, h: 100 }).g.mods.find((m) => m.cover && m.z === 220)!.h).toBe(30);
  });

  it('donde no queda espacio no se agrega (sí sobre una columna más baja)', () => {
    // With a low ceiling the uppers leave 5 cm above them; a 5 cm gap under the ceiling takes it all.
    const { g } = gen({ on: true, gap: 5 }, 220);
    const covers = g.mods.filter((m) => m.cover);
    expect(covers.some((c) => c.wall === 'A')).toBe(false);
    // The oven column tops out at 205 cm: 10 cm left under the gap.
    expect(covers).toEqual([expect.objectContaining({ wall: 'B', z: 205, h: 10 })]);
  });

  it('si no cabe en ningún lado, lo avisa', () => {
    const { g } = gen({ on: true, gap: 10 }, 200);
    expect(g.mods.some((m) => m.cover)).toBe(false);
    expect(g.notes.join(' ')).toMatch(/cubre falta/);
  });

  it('addCovers reemplaza los que ya había y parte los tramos de más de 400 cm', () => {
    const p = kitchen([place('A-2P', 1, 0, { w: 120 }), place('A-2P', 2, 120, { w: 120 }), place('A-2P', 3, 240, { w: 120 }), place('A-2P', 4, 360, { w: 100 })]);
    const once = addCovers({ ...p, room: { ...p.room, A: 500 } });
    const covers = once.mods.filter((m) => m.cover);
    expect(covers.map((c) => [c.pos, c.w])).toEqual([[0, 400], [400, 60]]);
    expect(addCovers(once).mods.filter((m) => m.cover)).toHaveLength(2);
  });
});

describe('construcción por paneles (como Polyboard)', () => {
  const base = () => place('B-2P', 1, 0, { w: 95, h: 77, d: 64 });
  const cut = (m: ModuleInstance) => Object.fromEntries(parts(m, DEFAULT_KITCHEN.mats, ctx.materials).map((p) => [p.pieza, p]));

  it('sin cambios es la caja de siempre', () => {
    const c = cut(base());
    expect(c.Lateral).toMatchObject({ cant: 2, L: 770, A: 640 });
    expect(c.Base).toMatchObject({ L: 950 - 36, A: 640 });
    expect(c['Travesaño']).toMatchObject({ cant: 2, L: 950 - 36, A: 100 });
    expect(c.Trasera).toMatchObject({ L: 946, A: 766, esp: 6 });
  });

  it('techo y suelo «Total» sobre los laterales: laterales más cortos, techo y suelo de lado a lado', () => {
    const c = cut({ ...base(), build: { top: 'completo', topPos: 'total', bottomPos: 'total' } });
    expect(c.Lateral).toMatchObject({ cant: 2, L: 770 - 36 });
    expect(c.Techo).toMatchObject({ L: 950, A: 640 });
    expect(c.Base).toMatchObject({ L: 950 });
    expect(c['Travesaño']).toBeUndefined();
  });

  it('sin techo, sin lateral derecho, trasera de 18 mm entre laterales y frontal fijo', () => {
    const m = { ...base(), build: { top: 'no' as const, right: 0 as const, backT: 18 as const, backPos: 'entre' as const, front: 1 as const } };
    const c = cut(m);
    expect(c.Techo).toBeUndefined();
    expect(c['Travesaño']).toBeUndefined();
    expect(c.Lateral).toMatchObject({ cant: 1 });
    expect(c.Trasera).toMatchObject({ esp: 18, slot: 'cuerpo', L: 950 - 18, A: 770 - 18 });
    // The bottom sits in front of the back.
    expect(c.Base).toMatchObject({ L: 950 - 18, A: 640 - 18 });
    expect(c.Frontal).toMatchObject({ cant: 1, L: 770 - 4, A: 950 - 4, slot: 'frentes' });
    expect(c.Puerta).toBeUndefined();
  });

  it('trasera «Total» atornillada atrás: cubre todo y los demás paneles quedan menos profundos', () => {
    const c = cut({ ...base(), build: { backPos: 'total', backT: 18 } });
    expect(c.Trasera).toMatchObject({ L: 950, A: 770, esp: 18 });
    expect(c.Lateral).toMatchObject({ A: 640 - 18 });
  });

  it('cada tablero sabe dónde va (para el 3D y el diseñador)', () => {
    const bs = moduleBoards({ ...base(), build: { topPos: 'total', top: 'completo' } });
    const left = bs.find((b) => b.role === 'lat-izq')!;
    const top = bs.find((b) => b.role === 'techo')!;
    expect(left.box).toEqual([0, 18, 0, 640, 0, 770 - 18]);
    expect(top.box).toEqual([0, 950, 0, 640, 752, 770]);
    expect(bs.filter((b) => b.role === 'puerta')).toHaveLength(2);
    expect(projectDataSchema.parse({ ...DEFAULT_KITCHEN, mods: [{ ...base(), build: { top: 'no', backPos: 'total' } }] }).mods[0]!.build).toEqual({ top: 'no', backPos: 'total' });
  });
});

describe('zonas exteriores (como Polyboard)', () => {
  const base = (build: ModuleInstance['build']) => ({ ...place('B-2P', 1, 0, { w: 95, h: 77, d: 64 }), build }) as ModuleInstance;
  const cut = (m: ModuleInstance) => Object.fromEntries(parts(m, DEFAULT_KITCHEN.mats, ctx.materials).map((p) => [p.pieza, p]));

  it('costados exteriores: dentro del ancho, al ras de las puertas; la caja y los frentes quedan más angostos', () => {
    const c = cut(base({ ext: { left: { t: 'panel', esp: 18 }, right: { t: 'panel', esp: 18 } } }));
    expect(c['Costado exterior']).toMatchObject({ cant: 2, L: 770, A: 640 + 18, slot: 'frentes' });
    expect(c.Base).toMatchObject({ L: 950 - 36 - 36 });
    expect(c.Puerta).toMatchObject({ cant: 2, A: Math.round((950 - 36) / 2 - 4) });
  });

  it('un costado hasta el piso tapa el zócalo', () => {
    const bs = moduleBoards(base({ ext: { left: { t: 'panel', floor: 1 } } }), 18, 18, 4, 100);
    expect(bs.find((b) => b.role === 'ext-izq')).toMatchObject({ L: 870, box: [0, 18, 0, 658, -100, 770] });
    // The cut list knows the project's plinth (and the module's own legs).
    expect(parts(base({ ext: { left: { t: 'panel', floor: 1 } } }), DEFAULT_KITCHEN.mats, ctx.materials, 4, 15).find((p) => p.pieza === 'Costado exterior')).toMatchObject({ L: 920 });
    expect(parts(base({ ext: { left: { t: 'panel', floor: 1 }, bottom: { t: 'patas', h: 120 } } }), DEFAULT_KITCHEN.mats, ctx.materials).find((p) => p.pieza === 'Costado exterior')).toMatchObject({ L: 890 });
  });

  it('cornisa con vuelo: más ancha que el mueble y la caja más baja', () => {
    const c = cut(base({ ext: { top: { t: 'cornisa', h: 30, over: 20 } } }));
    expect(c.Cornisa).toMatchObject({ L: 950 + 40, A: 640 + 18 + 20, esp: 30 });
    expect(c.Lateral).toMatchObject({ L: 770 - 30 });
  });

  it('zona inferior: zócalo propio (con su pieza), patas o nada', () => {
    const own = base({ ext: { bottom: { t: 'zocalo', h: 150, set: 50 } } });
    expect(zr(own, 10)).toEqual([15, 92]);
    expect(cut(own)['Zócalo']).toMatchObject({ L: 950, A: 150 });
    const legs = base({ ext: { bottom: { t: 'patas', h: 120 } } });
    expect(standOf(legs, 10)).toEqual({ h: 12, kind: 'patas' });
    expect(hardwareFor(legs, DEFAULT_KITCHEN).find((h) => h.code === 'PATA')).toBeTruthy();
    const floor = base({ ext: { bottom: { t: 'ninguno' } } });
    expect(zr(floor, 10)).toEqual([0, 77]);
    expect(hardwareFor(floor, DEFAULT_KITCHEN).find((h) => h.code === 'PATA')).toBeUndefined();
    // No plinth in the elevation for legs or nothing.
    const plinths = (m: ModuleInstance) => elev(kitchen([m]), 'A', ctx.materials).items.filter((i) => i.fill === '#3b3936').length;
    expect(plinths(legs)).toBe(plinths(base(undefined)) - 1);
    expect(plinths(floor)).toBe(plinths(base(undefined)) - 1);
    expect(projectDataSchema.parse({ ...DEFAULT_KITCHEN, mods: [own] }).mods[0]!.build?.ext?.bottom).toEqual({ t: 'zocalo', h: 150, set: 50 });
  });
});
