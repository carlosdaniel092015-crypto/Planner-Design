import { describe, expect, it } from 'vitest';
import { corte, DEFAULT_KITCHEN, DEFAULT_MATERIALS, DEFAULT_MODULES, elev, fromLeft, iso, type ModuleInstance, optimizeCut, parts, projectDataSchema, templateOf } from '../src/core';
import { exploded } from '../src/core/assembly';

const by = <T extends { code: string }>(a: T[]) => Object.fromEntries(a.map((x) => [x.code, x]));
const mats = by(DEFAULT_MATERIALS);
const def = (code: string) => DEFAULT_MODULES.find((d) => d.code === code)!;
const place = (code: string, id: number, pos: number, wall: 'A' | 'B' | 'C' | 'D' = 'A') => ({ ...templateOf(def(code)), id, wall, pos }) as unknown as ModuleInstance;
const texts = (d: { items: { t?: string; s?: string }[] }) => d.items.filter((i) => i.t === 'text').map((i) => i.s ?? '');

describe('medidas desde la izquierda', () => {
  const room = { A: 400, B: 300, H: 250 };
  it('en los muros B y D la distancia guardada se mide desde la otra esquina', () => {
    expect(fromLeft('A', 50, 60, room)).toBe(50);
    expect(fromLeft('C', 50, 60, room)).toBe(50);
    expect(fromLeft('B', 50, 60, room)).toBe(190);
    expect(fromLeft('D', 0, 0, room)).toBe(400);
    // Converting twice gives back the stored value.
    expect(fromLeft('B', fromLeft('B', 37, 20, room), 20, room)).toBe(37);
  });

  it('el alzado del muro B dibuja el módulo como se ve de frente (espejo)', () => {
    const p = projectDataSchema.parse({ ...DEFAULT_KITCHEN, room: { A: 400, B: 300, H: 250 }, ops: [], pts: [], mods: [place('B-1P', 1, 0, 'B')] });
    const marker = elev(p, 'B', mats, { cotas: false }).items.find((i) => i.t === 'c' && i.mid === 1)!;
    // Stored at 0 from the right corner, 45 wide: centred at 300 - 22.5 from the left.
    expect(marker.cx).toBeCloseTo(277.5, 1);
  });
});

describe('plano de instalaciones', () => {
  it('marca cada punto con su distancia desde la izquierda y su altura (mm)', () => {
    const p = projectDataSchema.parse({ ...DEFAULT_KITCHEN, room: { A: 400, B: 300, H: 250 }, mods: [], pts: [{ id: 1, t: 'agua', wall: 'A', pos: 120 }, { id: 2, t: 'elec', wall: 'B', pos: 100, z: 110 }] });
    expect(texts(elev(p, 'A', mats, { inst: true })).some((s) => s.includes('1200 · h 550'))).toBe(true);
    expect(texts(elev(p, 'B', mats, { inst: true })).some((s) => s.includes('2000 · h 1100'))).toBe(true);
    // Without the plan the measures are not written.
    expect(texts(elev(p, 'A', mats, {})).some((s) => s.includes('· h'))).toBe(false);
  });

  it('el alzado acota el ancho de los altos también', () => {
    const p = projectDataSchema.parse({ ...DEFAULT_KITCHEN, mods: [place('B-2P', 1, 0), place('AL-60', 2, 0)] });
    const t = texts(elev(p, 'A', mats, { cotas: true }));
    expect(t.filter((s) => s === '600').length).toBeGreaterThanOrEqual(1);
    expect(t.filter((s) => s === '800').length).toBeGreaterThanOrEqual(1);
  });
});

describe('separación entre puertas', () => {
  const m = place('B-2P', 1, 0);
  const door = (j?: number) => parts(m, DEFAULT_KITCHEN.mats, mats, j).find((p) => p.pieza === 'Puerta')!;
  it('descuenta la junta del tamaño de las puertas (4 mm por defecto)', () => {
    expect(door().L).toBe(760 - 4);
    expect(door(2).L).toBe(760 - 2);
    expect(door(2).A).toBe(400 - 2);
  });
  it('se guarda en las preferencias del proyecto (0–10 mm)', () => {
    expect(projectDataSchema.parse({ ...DEFAULT_KITCHEN, prefs: { ...DEFAULT_KITCHEN.prefs, junta: 3 } }).prefs.junta).toBe(3);
    expect(projectDataSchema.safeParse({ ...DEFAULT_KITCHEN, prefs: { ...DEFAULT_KITCHEN.prefs, junta: 12 } }).success).toBe(false);
  });
});

describe('muebles para electrodomésticos', () => {
  it('están en el catálogo: nevera, lavadora, extractor y microondas', () => {
    expect(def('MN-95')).toMatchObject({ name: 'Mueble para nevera', type: 'tall' });
    expect(def('ML-65').fr).toEqual([{ t: 'niche', ap: 'lavadora', f: 1 }]);
    expect(def('AE-60').fr[0]).toMatchObject({ t: 'niche', ap: 'extractor' });
    expect(def('AM-60').fr[0]).toMatchObject({ t: 'niche', ap: 'micro' });
  });

  it('el hueco no lleva frente: solo las puertas de arriba y el divisor', () => {
    const ps = parts(place('MN-95', 1, 0), DEFAULT_KITCHEN.mats, mats);
    expect(ps.find((p) => p.pieza === 'Puerta')).toMatchObject({ cant: 2 });
    expect(ps.find((p) => p.pieza === 'Divisor de hueco')).toMatchObject({ cant: 1 });
    expect(parts(place('ML-65', 1, 0), DEFAULT_KITCHEN.mats, mats).some((p) => p.pieza === 'Puerta' || p.pieza === 'Entrepaño')).toBe(false);
  });

  it('alzado, isométrico y armado los dibujan sin errores', () => {
    const p = projectDataSchema.parse({ ...DEFAULT_KITCHEN, mods: [place('MN-95', 1, 0), place('ML-65', 2, 95), place('AM-60', 3, 160), place('AE-60', 4, 220)] });
    expect(texts(elev(p, 'A', mats, {}))).toEqual(expect.arrayContaining(['Nevera', 'Lavadora', 'Microondas', 'Extractor']));
    expect(iso(p, mats, { ang: 45, cotas: false, altos: true }).items.length).toBeGreaterThan(30);
    expect(exploded(p.mods[0]!, p.mats, mats).items.length).toBeGreaterThan(5);
  });
});

describe('paredes y planchas', () => {
  const base = { ...DEFAULT_KITCHEN, room: { A: 400, B: 300, H: 250 } };
  it('cada muro puede llevar color o textura; las planchas validan sus medidas', () => {
    const p = projectDataSchema.parse({ ...base, walls: { A: { color: '#aabbcc' }, B: { mat: 'MB' } }, panels: [{ id: 1, wall: 'A', pos: 0, w: 120, z: 90, h: 60, mat: 'MB' }] });
    expect(p.walls?.A).toEqual({ color: '#aabbcc' });
    expect(projectDataSchema.safeParse({ ...base, walls: { A: { color: 'rojo' } } }).success).toBe(false);
    expect(projectDataSchema.safeParse({ ...base, panels: [{ id: 1, wall: 'A', pos: 0, w: 0, z: 0, h: 60, mat: 'MB' }] }).success).toBe(false);
  });

  it('las planchas aparecen en el alzado y en el corte con su material', () => {
    const code = DEFAULT_MATERIALS[0]!.code;
    const p = projectDataSchema.parse({ ...base, mods: [], panels: [{ id: 1, wall: 'A', pos: 10, w: 120, z: 90, h: 60, mat: code }] });
    expect(texts(elev(p, 'A', mats, {}))).toContain('Plancha 1200 × 600');
    const groups = corte(p, mats);
    const row = groups.flatMap((g) => g.rows).find((r) => r.pieza === 'Plancha muro A')!;
    expect(row).toMatchObject({ L: 1200, A: 600, cant: 1, mods: [] });
    expect(optimizeCut(groups, mats)[0]!.pieces).toBe(1);
  });
});
