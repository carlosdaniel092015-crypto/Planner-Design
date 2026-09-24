import { describe, expect, it } from 'vitest';
import { DEFAULT_MATERIALS, DEFAULT_MODULES, type ModuleInstance, parts, partsTable } from '../src/core';

const materials = Object.fromEntries(DEFAULT_MATERIALS.map((m) => [m.code, m]));
const mats = { cuerpo: DEFAULT_MATERIALS[0]!.code, frentes: DEFAULT_MATERIALS[0]!.code, encimera: '' } as never;

describe('despiece por módulo para el PDF', () => {
  it('la tabla trae cada pieza con su número, cantidad y medidas de corte en mm', () => {
    const tpl = DEFAULT_MODULES.find((m) => m.type === 'base')!;
    const m = { ...structuredClone(tpl), id: 1, wall: 'A', pos: 0, w: 90, h: 76, d: 60 } as unknown as ModuleInstance;
    const list = parts(m, mats, materials);
    expect(list.length).toBeGreaterThan(3);
    const texts = partsTable(list).items.filter((i) => i.t === 'text').map((i) => i.s);
    for (const p of list) {
      expect(texts).toContain(String(p.ref));
      expect(texts).toContain(String(p.L));
      expect(texts).toContain(String(p.A));
    }
    // Laterals of a 76 × 60 cm cabinet are cut at 760 × 600 mm.
    expect(list.find((p) => p.grp === 'lat')).toMatchObject({ cant: 2, L: 760, A: 600, esp: 18 });
    expect(texts).toContain(`${list.reduce((a, p) => a + p.cant, 0)} piezas · largo × ancho × espesor en mm`);
  });
});
