import { describe, expect, it } from 'vitest';
import {
  computeEstimate,
  DEFAULT_HARDWARE,
  DEFAULT_MATERIALS,
  DEFAULT_MODULES,
  generateDesign,
  newProject,
  parts,
  type PricingContext,
  type ProjectData,
  projectDataSchema,
  tvSize,
  validateProject,
  zr,
} from '../src/core';

const by = <T extends { code: string }>(a: T[]) => Object.fromEntries(a.map((x) => [x.code, x]));
const ctx: PricingContext = {
  settings: { baseCurrency: 'DOP', exchangeRateDopPerUsd: 60, taxName: 'ITBIS', taxRate: 0.18, pricesIncludeTax: false, wasteRate: 0.15, marginRate: 0, rounding: 'ninguno' },
  modules: by(DEFAULT_MODULES),
  materials: by(DEFAULT_MATERIALS),
  hardware: by(DEFAULT_HARDWARE),
};
const gen = (tweak: (p: ProjectData) => void = () => {}) => {
  const p = projectDataSchema.parse(newProject('tv'));
  tweak(p);
  const g = generateDesign(p, ctx.modules);
  const q = projectDataSchema.parse({ ...p, mods: g.mods, mats: g.mats });
  return { p: q, g, errs: validateProject(q, ctx).filter((i) => i.st === 'err') };
};
const zoc = 5;

describe('mueble de TV', () => {
  it('un proyecto nuevo de TV es válido y trae su plantilla', () => {
    const p = projectDataSchema.parse(newProject('tv'));
    expect(p).toMatchObject({ ptype: 'tv', pname: 'Nuevo mueble de TV', layout: 'lineal' });
    expect(p.mods.map((m) => m.code)).toEqual(expect.arrayContaining(['TV-CON', 'TV-TOR', 'TV-PAN', 'TV-REP', 'TV-ALT']));
    expect(validateProject(p, ctx).filter((i) => i.st === 'err')).toEqual([]);
    // The standard catalogue carries the TV family.
    expect(ctx.modules['TV-CON']).toMatchObject({ projectType: 'tv', type: 'base' });
  });

  it('genera torres, consola, panel detrás de la TV, repisas y alacena sin errores', () => {
    const { p, g, errs } = gen();
    expect(errs).toEqual([]);
    const codes = g.mods.map((m) => m.code);
    expect(codes.filter((c) => c === 'TV-TOR')).toHaveLength(2);
    expect(codes).toContain('TV-CON');
    const con = g.mods.find((m) => m.code === 'TV-CON')!;
    const panel = g.mods.find((m) => m.code === 'TV-PAN')!;
    const alt = g.mods.find((m) => m.code === 'TV-ALT')!;
    const screen = tvSize(65);
    // Panel centred on the console, wider than the screen, standing on the console.
    expect(panel.pos! + panel.w / 2).toBeCloseTo(con.pos! + con.w / 2, 0);
    expect(panel.w).toBeGreaterThanOrEqual(screen.w);
    expect(panel.z).toBe(zoc + con.h + 3);
    // Upper cabinet above the panel and under the ceiling.
    expect(alt.z!).toBeGreaterThanOrEqual(panel.z! + panel.h);
    expect(zr(alt, zoc)[1]).toBeLessThanOrEqual(p.room.H);
    // Shelves beside the panel, not over it.
    const shelves = g.mods.filter((m) => m.code === 'TV-REP');
    expect(shelves).toHaveLength(2);
    for (const s of shelves) expect(s.pos! + s.w <= panel.pos! || s.pos! >= panel.pos! + panel.w).toBe(true);
    // Everything fits on the wall.
    for (const m of g.mods) expect(m.pos! + m.w).toBeLessThanOrEqual(p.room.A);
  });

  it('el panel y las repisas salen en la lista de corte como un tablero, no como una caja', () => {
    const { g } = gen();
    const panel = g.mods.find((m) => m.code === 'TV-PAN')!;
    const ps = parts(panel, g.mats, ctx.materials);
    expect(ps).toHaveLength(1);
    expect(ps[0]).toMatchObject({ pieza: 'Panel para TV', cant: 1, L: Math.max(panel.w, panel.h) * 10 });
    const shelf = parts(g.mods.find((m) => m.code === 'TV-REP')!, g.mats, ctx.materials);
    expect(shelf).toHaveLength(1);
    expect(shelf[0]!.esp).toBe(36);
  });

  it('sin torres ni alacena; TV grande en muro corto avisa', () => {
    const { g, errs } = gen((p) => {
      p.tv = { pulgadas: 85, centro: 110, torres: 2, repisas: 4, panel: true, alacena: false };
      p.room = { ...p.room, A: 230 };
    });
    expect(errs).toEqual([]);
    expect(g.mods.some((m) => m.code === 'TV-ALT')).toBe(false);
    expect(g.notes.join(' ')).toMatch(/torre|repisas|más ancha/);
    const none = gen((p) => {
      p.tv = { pulgadas: 55, centro: 105, torres: 0, repisas: 0, panel: false, alacena: false };
    });
    expect(none.g.mods.map((m) => m.code)).toEqual(['TV-CON']);
  });

  it('el presupuesto se calcula', () => {
    const { p } = gen();
    expect(computeEstimate(p, ctx, 'DOP').total).toBeGreaterThan(0);
  });
});
