import { describe, expect, it } from 'vitest';
import { DEFAULT_KITCHEN, geo, iso, type ModuleInstance, moveModule, placeOf, plan, projectDataSchema, rotateModule } from '../src/core';

const base = (id: number, pos: number, w = 60, patch: Partial<ModuleInstance> = {}) =>
  ({ id, code: 'B2-60', name: 'Bajo', cat: 'Bajos', type: 'base', wall: 'A', pos, w, h: 76, d: 60, fr: [], ...patch }) as ModuleInstance;
const project = (mods: ModuleInstance[]) => projectDataSchema.parse({ ...DEFAULT_KITCHEN, room: { A: 360, B: 300, H: 250 }, mods });
const get = (p: ReturnType<typeof project>, id: number) => p.mods.find((m) => m.id === id)!;

describe('mover módulos', () => {
  it('se mueve a lo largo de su muro sin salirse', () => {
    const p = project([base(1, 0)]);
    expect(get(moveModule(p, 1, { wall: 'A', pos: 150 }), 1).pos).toBe(150);
    expect(get(moveModule(p, 1, { wall: 'A', pos: -40 }), 1).pos).toBe(0);
    expect(get(moveModule(p, 1, { wall: 'A', pos: 900 }), 1).pos).toBe(300); // 360 − 60
  });

  it('se pega a la esquina y a los vecinos del mismo nivel cuando queda cerca', () => {
    const p = project([base(1, 0), base(2, 200), base(3, 100, 60, { type: 'upper', h: 70, d: 35 })]);
    expect(get(moveModule(p, 2, { wall: 'A', pos: 63 }), 2).pos).toBe(60); // right after module 1
    expect(get(moveModule(p, 2, { wall: 'A', pos: 297 }), 2).pos).toBe(300); // corner (360 − 60)
    expect(get(moveModule(p, 2, { wall: 'A', pos: 101 }), 2).pos).toBe(101); // the upper at 100 doesn't count
    expect(get(moveModule(p, 2, { wall: 'A', pos: 63 }, 0), 2).pos).toBe(63); // snapping off
  });

  it('cambia de muro y pasa a isla y de vuelta', () => {
    const p = project([base(1, 0)]);
    const onB = moveModule(p, 1, { wall: 'B', pos: 280 });
    expect(get(onB, 1)).toMatchObject({ wall: 'B', pos: 240 }); // wall B is 300 long
    const island = moveModule(onB, 1, { wall: 'F', x: 150, y: 120 });
    expect(get(island, 1)).toMatchObject({ wall: 'F', x: 150, y: 120 });
    expect(get(island, 1).pos).toBeUndefined();
    expect(placeOf(get(island, 1))).toEqual({ wall: 'F', x: 150, y: 120 });
    const back = moveModule(island, 1, { wall: 'D', pos: 10 });
    expect(get(back, 1)).toMatchObject({ wall: 'D', pos: 10 });
    expect(get(back, 1).x).toBeUndefined();
    expect(projectDataSchema.safeParse(back).success).toBe(true);
  });
});

describe('girar módulos', () => {
  const island = (patch: Partial<ModuleInstance> = {}) => base(9, 0, 120, { wall: 'F', pos: undefined, x: 120, y: 120, d: 80, ...patch });
  it('una isla gira sobre su centro: 0 → 90 → 180 → 270 → 0, con su huella girada', () => {
    let p = project([island()]);
    const c0 = geo(get(p, 9), p.room);
    const center = [(c0.x0 + c0.x1) / 2, (c0.y0 + c0.y1) / 2];
    for (const rot of [90, 180, 270, 0]) {
      p = rotateModule(p, 9);
      const m = get(p, 9);
      expect(m.rot ?? 0).toBe(rot);
      const g = geo(m, p.room);
      expect([g.x1 - g.x0, g.y1 - g.y0]).toEqual(rot === 90 || rot === 270 ? [80, 120] : [120, 80]);
      expect([(g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2]).toEqual(center);
    }
    expect('rot' in get(p, 9)).toBe(false);
    // Plan and iso draw the turned island without errors.
    const q = rotateModule(project([island()]), 9);
    expect(plan(q, { cotas: false }).items.length).toBeGreaterThan(5);
    expect(iso(q, {} as never, { ang: 45, cotas: false, altos: true }).items.length).toBeGreaterThan(5);
  });

  it('girada, la isla no se sale de la habitación al moverla', () => {
    const p = rotateModule(project([island()]), 9);
    const m = get(moveModule(p, 9, { wall: 'F', x: 1000, y: 1000 }), 9);
    expect([m.x, m.y, m.rot]).toEqual([360 - 80, 300 - 120, 90]);
  });

  it('un mueble de muro gira al siguiente muro (siempre mira a la habitación) y pierde el giro de isla', () => {
    let p = project([base(1, 40)]);
    for (const w of ['C', 'D', 'B', 'A']) {
      p = rotateModule(p, 1);
      expect(get(p, 1).wall).toBe(w);
    }
    expect(get(p, 1).pos).toBe(40);
    const back = moveModule(rotateModule(project([island()]), 9), 9, { wall: 'A', pos: 0 });
    expect(get(back, 9)).not.toHaveProperty('rot');
    expect(placeOf(get(rotateModule(project([island()]), 9), 9))).toEqual({ wall: 'F', x: 140, y: 100, rot: 90 });
  });
});
