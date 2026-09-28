import { describe, expect, it } from 'vitest';
import { corners, DEFAULT_KITCHEN, footprint, geo, iso, type ModuleInstance, moveModule, placeAt, placeOf, plan, projectDataSchema, rotateModule, setRotation } from '../src/core';

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

  it('un mueble de piso en un muro gira en su lugar (queda libre, como península) y vuelve a su muro al girar 4 veces… o al arrimarlo', () => {
    let p = project([base(1, 40)]);
    const g0 = geo(get(p, 1), p.room);
    const c0 = [(g0.x0 + g0.x1) / 2, (g0.y0 + g0.y1) / 2];
    p = rotateModule(p, 1);
    const m = get(p, 1);
    expect([m.wall, m.rot]).toEqual(['F', 90]);
    const g1 = geo(m, p.room);
    expect([(g1.x0 + g1.x1) / 2, (g1.y0 + g1.y1) / 2]).toEqual(c0);
    // Turned back to face the room from wall A (rot 0) and pushed against it: it stands on wall A again.
    for (let i = 0; i < 3; i++) p = rotateModule(p, 1);
    expect(get(p, 1).rot ?? 0).toBe(0);
    const at = placeAt(p, 1, 70, 32)!;
    expect(at).toEqual({ wall: 'A', pos: 40 });
    const back = get(moveModule(p, 1, at), 1);
    expect([back.wall, back.pos, 'rot' in back]).toEqual(['A', 40, false]);
  });

  it('un alto gira al siguiente muro (no puede quedar libre)', () => {
    let p = project([base(1, 40, 60, { type: 'upper', h: 70, d: 35 })]);
    for (const w of ['C', 'D', 'B', 'A']) {
      p = rotateModule(p, 1);
      expect(get(p, 1).wall).toBe(w);
    }
    expect(get(p, 1).pos).toBe(40);
  });

  it('al arrastrar, un mueble de muro pasa al muro más cercano al dedo', () => {
    const p = project([base(1, 100)]);
    expect(placeAt(p, 1, 160, 30)).toEqual({ wall: 'A', pos: 130 });
    // Near the left wall (B): goes onto it.
    expect(placeAt(p, 1, 25, 200)).toEqual({ wall: 'B', pos: 170 });
    // In the corner zone it stays on its wall until another is clearly closer.
    expect(placeAt(p, 1, 40, 45)?.wall).toBe('A');
    expect(placeAt(p, 1, 340, 200)?.wall).toBe('C');
    const moved = get(moveModule(p, 1, placeAt(p, 1, 25, 200)!), 1);
    expect([moved.wall, moved.pos]).toEqual(['B', 170]);
    expect(placeOf(get(rotateModule(project([island()]), 9), 9))).toEqual({ wall: 'F', x: 140, y: 100, rot: 90 });
  });

  it('gira a cualquier ángulo sobre su centro; la huella es la caja que ocupa', () => {
    let p = project([island()]);
    const g0 = geo(get(p, 9), p.room);
    const c0 = [(g0.x0 + g0.x1) / 2, (g0.y0 + g0.y1) / 2];
    p = setRotation(p, 9, 30);
    const m = get(p, 9);
    expect(m.rot).toBe(30);
    const [bw, bh] = footprint(120, 80, 30);
    expect([bw, bh]).toEqual([143.92, 129.28]);
    const g = geo(m, p.room);
    expect((g.x0 + g.x1) / 2).toBeCloseTo(c0[0]!, 0);
    expect((g.y0 + g.y1) / 2).toBeCloseTo(c0[1]!, 0);
    // Corners stay inside its box, the front edge is the first two.
    for (const [x, y] of corners(m)) {
      expect(x).toBeGreaterThanOrEqual(g.x0 - 0.01);
      expect(x).toBeLessThanOrEqual(g.x1 + 0.01);
      expect(y).toBeGreaterThanOrEqual(g.y0 - 0.01);
      expect(y).toBeLessThanOrEqual(g.y1 + 0.01);
    }
    expect(get(rotateModule(p, 9, -45), 9).rot).toBe(345);
    expect(get(rotateModule(p, 9, 15), 9).rot).toBe(45);
    // Drawn turned in plan (a real outline, not a box) and the iso falls back to its box.
    const d = plan(p, { cotas: false });
    expect(d.items.some((i) => i.mid === 9 && typeof i.d === 'string' && i.d.split('L').length === 4)).toBe(true);
    expect(iso(p, {} as never, { ang: 45, cotas: false, altos: true }).items.length).toBeGreaterThan(5);
    expect(projectDataSchema.safeParse({ ...DEFAULT_KITCHEN, mods: [{ ...m, rot: 400 }] }).success).toBe(false);
  });

  it('con «Mover muebles» un mueble de piso sale de su muro al llevarlo al centro, y vuelve al arrimarlo de espaldas', () => {
    const p = project([base(1, 100)]);
    const out = placeAt(p, 1, 180, 150)!;
    expect(out).toEqual({ wall: 'F', x: 150, y: 120 });
    const freeP = moveModule(p, 1, out);
    expect(get(freeP, 1)).toMatchObject({ wall: 'F', x: 150, y: 120 });
    // Still close to its wall it keeps sliding along it.
    expect(placeAt(p, 1, 180, 50)).toEqual({ wall: 'A', pos: 150 });
    // Back against wall A (facing the room) it stands on it again.
    expect(placeAt(freeP, 1, 200, 35)).toEqual({ wall: 'A', pos: 170 });
    // Turned askew it stays free anywhere.
    const askew = setRotation(freeP, 1, 20);
    expect(placeAt(askew, 1, 200, 35)?.wall).toBe('F');
  });
});
