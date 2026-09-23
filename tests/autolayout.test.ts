import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HARDWARE,
  DEFAULT_MATERIALS,
  DEFAULT_MODULES,
  generateDesign,
  newProject,
  type PricingContext,
  type ProjectData,
  type ProjectKind,
  projectDataSchema,
  validateProject,
} from '../src/core';

const by = <T extends { code: string }>(a: T[]) => Object.fromEntries(a.map((x) => [x.code, x]));
const ctx: PricingContext = {
  settings: { baseCurrency: 'DOP', exchangeRateDopPerUsd: 60, taxName: 'ITBIS', taxRate: 0.18, pricesIncludeTax: false, wasteRate: 0.15, marginRate: 0, rounding: 'ninguno' },
  modules: by(DEFAULT_MODULES),
  materials: by(DEFAULT_MATERIALS),
  hardware: by(DEFAULT_HARDWARE),
};

function design(ptype: ProjectKind, layout: string, tweak: (p: ProjectData) => void = () => {}) {
  const p = projectDataSchema.parse(newProject(ptype));
  p.layout = layout;
  tweak(p);
  const g = generateDesign(p, ctx.modules);
  const q: ProjectData = projectDataSchema.parse({ ...p, mods: g.mods, mats: g.mats });
  return { p: q, g, issues: validateProject(q, ctx) };
}

describe('distribución automática', () => {
  const cases: [ProjectKind, string][] = [
    ['cocina', 'lineal'],
    ['cocina', 'L'],
    ['cocina', 'U'],
    ['cocina', 'paralela'],
    ['cocina', 'isla'],
    ['cocina', 'peninsula'],
    ['closet', 'lineal'],
    ['closet', 'L'],
    ['closet', 'U'],
    ['vestidor', 'abierto'],
  ];
  for (const [ptype, layout] of cases)
    it(`${ptype} ${layout}: sin errores, anchos en rango y todo dentro de los muros`, () => {
      const { p, issues } = design(ptype, layout);
      expect(p.mods.length).toBeGreaterThan(3);
      expect(issues.filter((i) => i.st === 'err')).toEqual([]);
      for (const m of p.mods) {
        if (m.rw) expect(m.w, `${m.code} ${m.w}`).toBeGreaterThanOrEqual(m.rw[0]);
        if (m.rw) expect(m.w, `${m.code} ${m.w}`).toBeLessThanOrEqual(m.rw[1]);
        expect(Number.isInteger(m.w)).toBe(true);
      }
      expect(new Set(p.mods.map((m) => m.id)).size).toBe(p.mods.length);
    });

  it('usa los muros que corresponden a cada forma', () => {
    const walls = (layout: string) => [...new Set(design('cocina', layout).p.mods.map((m) => m.wall))].sort();
    expect(walls('lineal')).toEqual(['A']);
    expect(walls('L')).toEqual(['A', 'B']);
    expect(walls('U')).toEqual(['A', 'B', 'C']);
    expect(walls('paralela')).toEqual(['A', 'D']);
    expect(walls('isla')).toContain('F');
  });

  it('coloca el fregadero sobre la toma de agua y la parrilla en la toma de gas, con la campana encima', () => {
    const { p, issues } = design('cocina', 'L');
    const sink = p.mods.find((m) => m.sink)!;
    const agua = p.pts.find((x) => x.t === 'agua')!;
    expect(sink.wall).toBe(agua.wall);
    expect(Math.abs(sink.pos! + sink.w / 2 - agua.pos)).toBeLessThanOrEqual(60);
    expect(issues.find((i) => i.code === 'AGUA_LEJOS')?.st).toBe('ok');
    const cook = p.mods.find((m) => m.cook)!;
    const gas = p.pts.find((x) => x.t === 'gas')!;
    expect(cook.wall).toBe(gas.wall);
    const hood = p.mods.find((m) => m.type === 'hood')!;
    expect(hood.wall).toBe(cook.wall);
    expect(Math.abs(hood.pos! + hood.w / 2 - (cook.pos! + cook.w / 2))).toBeLessThanOrEqual(5);
    expect(issues.find((i) => i.code === 'LAVAVAJILLAS')?.st).toBe('ok');
  });

  it('las alacenas no tapan ventanas ni quedan sobre columnas', () => {
    const { p } = design('cocina', 'L');
    const win = p.ops.find((o) => o.t === 'ventana')!;
    for (const u of p.mods.filter((m) => m.type === 'upper' && m.wall === win.wall)) expect(u.pos! + u.w <= win.pos || u.pos! >= win.pos + win.w).toBe(true);
    for (const t of p.mods.filter((m) => m.type === 'tall' || m.type === 'fridge'))
      for (const u of p.mods.filter((m) => m.type === 'upper' && m.wall === t.wall)) expect(u.pos! + u.w <= t.pos! || u.pos! >= t.pos! + t.w).toBe(true);
  });

  it('respeta los electrodomésticos elegidos y la altura de alacenas', () => {
    const { p } = design('cocina', 'L', (q) => {
      q.appl = { ...(q.appl as object), lava: { on: false, inst: 'Empotrado', w: 60, h: 82, d: 57 }, horno: { on: false, inst: 'En columna', w: 60, h: 60, d: 56 } };
      q.prefs.alacena = '90 cm';
    });
    expect(p.mods.some((m) => m.code === 'LV-60')).toBe(false);
    expect(p.mods.some((m) => m.oven)).toBe(false);
    expect(p.mods.filter((m) => m.type === 'upper').every((m) => m.h === 90)).toBe(true);
  });

  it('funciona en espacios chicos, techos bajos y sin instalaciones', () => {
    const small = design('cocina', 'L', (q) => {
      q.room = { A: 200, B: 180, H: 230 };
      q.pts = [];
    });
    expect(small.issues.filter((i) => i.st === 'err' && i.code !== 'SIN_TOMA_AGUA')).toEqual([]);
    expect(small.g.notes.length).toBeGreaterThan(0);
    const low = design('cocina', 'lineal', (q) => {
      q.room = { ...q.room, H: 215 };
    });
    expect(low.issues.filter((i) => i.code === 'EXCEDE_ALTURA')).toEqual([]);
  });

  it('closet: arma lo pedido y rellena con entrepaños', () => {
    const { p } = design('closet', 'L', (q) => {
      q.closet = { largo: 1, corto: 1, cajoneras: 1, zapatos: 24, luz: 'Tira LED' };
    });
    const codes = p.mods.map((m) => m.code);
    expect(codes).toContain('CL-100');
    expect(codes).toContain('CJ-100');
    expect(codes).toContain('ZP-60');
    expect(codes).toContain('CL-E');
  });

  it('es determinista', () => {
    expect(design('cocina', 'U').p.mods).toEqual(design('cocina', 'U').p.mods);
  });
});
