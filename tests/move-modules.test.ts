import { describe, expect, it } from 'vitest';
import { DEFAULT_KITCHEN, type ModuleInstance, moveModule, placeOf, projectDataSchema } from '../src/core';

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
