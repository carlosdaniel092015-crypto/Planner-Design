import { describe, expect, it } from 'vitest';
import {
  blankProject,
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

  it('acepta una altura de alacenas escrita a mano', () => {
    const { p } = design('cocina', 'L', (q) => {
      q.prefs.alacena = '80 cm';
    });
    const uppers = p.mods.filter((m) => m.type === 'upper');
    expect(uppers.length).toBeGreaterThan(0);
    expect(uppers.every((m) => m.h === 80)).toBe(true);
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

  describe('fase 1 totalmente editable', () => {
    const errs = <T extends { st: string }>(i: T[]) => i.filter((x) => x.st === 'err');

    it('distribución personalizada: solo los muros elegidos, con las esquinas B-D bien resueltas', () => {
      const { p, issues } = design('cocina', 'personalizada', (q) => {
        q.dist = { walls: ['B', 'D'] };
        q.pts = q.pts.map((x) => (x.t === 'agua' || x.t === 'desague' ? { ...x, wall: 'B', pos: 150 } : x));
      });
      expect([...new Set(p.mods.map((m) => m.wall))].sort()).toEqual(['B', 'D']);
      expect(errs(issues)).toEqual([]);
      for (const m of p.mods.filter((x) => x.wall === 'D' && x.type !== 'upper' && x.type !== 'hood')) expect(m.pos!).toBeGreaterThanOrEqual(60);
      expect(issues.find((i) => i.code === 'TRASLAPE')?.st ?? 'ok').toBe('ok');
    });

    it('respeta fondo y altura de bajos, fondo y altura de alacenas', () => {
      const { p, issues } = design('cocina', 'L', (q) => {
        q.dist = { baseD: 50, baseH: 80, upperD: 30 };
        q.prefs.alacena = '80 cm';
      });
      expect(errs(issues)).toEqual([]);
      const bases = p.mods.filter((m) => m.type === 'base' && m.wall !== 'F');
      expect(bases.length).toBeGreaterThan(3);
      for (const m of bases) expect([m.d, m.h], m.code).toEqual([50, 80]);
      for (const m of p.mods.filter((x) => x.type === 'upper')) expect([m.d, m.h], m.code).toEqual([30, 80]);
    });

    it('isla con medidas propias en una distribución personalizada', () => {
      const { p, issues } = design('cocina', 'personalizada', (q) => {
        q.room = { A: 480, B: 420, H: 260 };
        q.dist = { walls: ['A'], island: { on: true, w: 150, d: 90 } };
      });
      const isl = p.mods.find((m) => m.wall === 'F')!;
      expect([isl.w, isl.d]).toEqual([150, 90]);
      expect(errs(issues)).toEqual([]);
    });

    it('electrodomésticos propios según su instalación', () => {
      const { p, g } = design('cocina', 'L', (q) => {
        q.appl = {
          ...(q.appl as object),
          x1: { on: true, name: 'Horno de vapor', inst: 'En columna', w: 60, h: 45, d: 55 },
          x2: { on: true, name: 'Microondas de pared', inst: 'Colgado', w: 60, h: 40, d: 35 },
          x3: { on: true, name: 'Congelador', inst: 'Libre', w: 60, h: 170, d: 65 },
          x4: { on: false, name: 'Apagado', inst: 'Libre', w: 60, h: 85, d: 60 },
        };
      });
      const named = (n: string) => p.mods.find((m) => m.name === n);
      expect(named('Horno de vapor')?.type).toBe('tall');
      expect(named('Microondas de pared')).toMatchObject({ type: 'upper', w: 60, h: 40 });
      expect(named('Congelador')).toMatchObject({ type: 'fridge', w: 60, h: 170, d: 65 });
      expect(named('Apagado')).toBeUndefined();
      expect(g.notes.join(' ')).not.toContain('Microondas de pared');
    });

    it('estilo personalizado usa los materiales elegidos', () => {
      const { p } = design('cocina', 'L', (q) => {
        q.prefs.estilo = 'Personalizado';
        (q.prefs as Record<string, unknown>).mats = { cuerpo: 'grafito', frentes: 'nogal', encimera: 'granito', jaladeras: 'laton' };
      });
      expect(p.mats).toEqual({ cuerpo: 'grafito', frentes: 'nogal', encimera: 'granito', jaladeras: 'laton' });
    });

    it('empezar en blanco deja todo vacío y aun así genera sin errores', () => {
      const b = projectDataSchema.parse(blankProject(projectDataSchema.parse(newProject('cocina'))));
      expect([b.ops.length, b.pts.length, b.mods.length]).toEqual([0, 0, 0]);
      expect(Object.values(b.appl as Record<string, { on: boolean }>).every((a) => !a.on)).toBe(true);
      const g = generateDesign(b, ctx.modules);
      expect(g.mods.every((m) => m.wall === 'A')).toBe(true);
      expect(errs(validateProject(projectDataSchema.parse({ ...b, mods: g.mods }), ctx)).filter((i) => !/AGUA|TOMA/.test(i.code))).toEqual([]);
    });

    it('rechaza medidas fuera de rango', () => {
      expect(projectDataSchema.safeParse({ ...newProject('cocina'), dist: { baseD: 10 } }).success).toBe(false);
      expect(projectDataSchema.safeParse({ ...newProject('cocina'), dist: { walls: ['E'] } }).success).toBe(false);
    });
  });
});
