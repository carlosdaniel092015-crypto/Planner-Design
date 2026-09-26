import { describe, expect, it } from 'vitest';
import { corte, DEFAULT_KITCHEN, frontsFromPanels, frontsOf, usesBoards, DEFAULT_MATERIALS, type MaterialDefinition, type ModuleInstance, parts, projectDataSchema, ranges, setDim, validateProject } from '../src/core';
import { DEFAULT_HARDWARE, DEFAULT_MODULES } from '../src/core';

const by = <T extends { code: string }>(a: T[]) => Object.fromEntries(a.map((x) => [x.code, x]));
// A texture uploaded by the organisation, applied to the front of the uploaded module.
const texture = { ...DEFAULT_MATERIALS.find((m) => m.groups.includes('frentes'))!, code: 'TEX-NOGAL', name: 'Nogal de mi taller', source: 'subido' } as MaterialDefinition;
const materials = { ...by(DEFAULT_MATERIALS), [texture.code]: texture };
const glbModule = (patch: Partial<ModuleInstance> = {}) =>
  ({ id: 99, code: 'GLB-AB12', name: 'Mueble GLB', cat: 'Mis módulos', type: 'base', wall: 'A', pos: 0, w: 60, h: 76, d: 60, fr: [], rw: [60, 60], glb: 'https://x/mueble.glb', fre: texture.code, ...patch }) as ModuleInstance;

describe('módulos y texturas subidos', () => {
  it('un módulo subido en 3D aparece en el despiece con la textura que se le aplicó', () => {
    const list = parts(glbModule(), { cuerpo: DEFAULT_KITCHEN.mats.cuerpo, frentes: DEFAULT_KITCHEN.mats.frentes, encimera: '' } as never, materials);
    expect(list.map((p) => p.pieza)).toEqual(expect.arrayContaining(['Lateral', 'Base', 'Trasera', 'Puerta']));
    expect(list.find((p) => p.pieza === 'Puerta')).toMatchObject({ mat: expect.stringContaining('Nogal de mi taller'), matCode: 'TEX-NOGAL', cant: 1 });
    // Wider than 60 cm: two doors.
    expect(parts(glbModule({ w: 100 }), DEFAULT_KITCHEN.mats as never, materials).find((p) => p.pieza === 'Puerta')!.cant).toBe(2);
  });

  it('entra en la lista de corte del proyecto', () => {
    const p = projectDataSchema.parse({ ...DEFAULT_KITCHEN, mods: [...DEFAULT_KITCHEN.mods, glbModule({ pos: 400 })] });
    const groups = corte(p, materials);
    expect(groups.some((g) => g.mat.includes('Nogal de mi taller'))).toBe(true);
  });

  it('su ancho se puede cambiar (antes quedaba fijo) sin marcar error de rango', () => {
    const m = glbModule();
    expect(ranges(m).w).toEqual([30, 120]);
    const p = projectDataSchema.parse({ ...DEFAULT_KITCHEN, mods: [glbModule({ pos: 0 })] });
    const wider = setDim(p, 99, 'w', 90);
    expect(wider.mods[0]!.w).toBe(90);
    const ctx = { settings: { baseCurrency: 'DOP', exchangeRateDopPerUsd: 60, taxName: 'ITBIS', taxRate: 0.18, pricesIncludeTax: false, wasteRate: 0.15, marginRate: 0, rounding: 'ninguno' }, modules: by(DEFAULT_MODULES), materials, hardware: by(DEFAULT_HARDWARE) } as never;
    expect(validateProject(wider, ctx).some((i) => i.code === 'ANCHO_FUERA_DE_RANGO')).toBe(false);
    // Parametric modules keep their catalogue range.
    expect(ranges({ type: 'tall', rw: [60, 60] }).w).toEqual([60, 60]);
  });

  // Boards as an exporter gives them: [x, depth, height] in mm, the front ones 18 mm thick in depth.
  const board = (n: string, x: number, z: number, w: number, h: number) => ({ n, p: [x, 582, z] as [number, number, number], s: [w, 18, h] as [number, number, number] });
  const body = [
    { n: 'Lateral Izquierdo', p: [0, 0, 0] as [number, number, number], s: [18, 600, 740] as [number, number, number] },
    { n: 'Lateral Derecho', p: [582, 0, 0] as [number, number, number], s: [18, 600, 740] as [number, number, number] },
    { n: 'Suelo', p: [18, 0, 0] as [number, number, number], s: [564, 582, 18] as [number, number, number] },
  ];

  it('un modelo por tablas se convierte en módulo nativo: tres gavetas', () => {
    // Each drawer also has its box: sides, back and bottom named after it, behind the front.
    const box = (i: number, z: number) => [
      { n: `Trasera gaveta ${i}`, p: [40, 60, z] as [number, number, number], s: [520, 15, 150] as [number, number, number] },
      { n: `Lateral gaveta ${i}`, p: [30, 60, z] as [number, number, number], s: [15, 500, 150] as [number, number, number] },
      { n: `Fondo gaveta ${i}`, p: [40, 60, z] as [number, number, number], s: [520, 500, 6] as [number, number, number] },
    ];
    const panels = [...body, board('Frente gaveta 1', 2, 2, 596, 242), board('Frente gaveta 2', 2, 248, 596, 242), board('Frente gaveta 3', 2, 494, 596, 244), ...box(1, 30), ...box(2, 280), ...box(3, 520)];
    const m = { w: 60, h: 74, panels, pdim: [60, 74, 60] as [number, number, number] };
    const fr = frontsFromPanels(m);
    expect(fr.map((f) => f.t)).toEqual(['drawer', 'drawer', 'drawer']);
    expect(fr.reduce((a, f) => a + f.f, 0)).toBeCloseTo(1, 3);
    // In the despiece the fronts take the front material.
    const list = parts(glbModule({ ...m, fr }), DEFAULT_KITCHEN.mats as never, materials);
    expect(list.filter((p) => p.slot === 'frentes').reduce((a, p) => a + p.cant, 0)).toBe(3);
    expect(list.find((p) => p.pieza.startsWith('Lateral gaveta'))!.slot).toBe('cuerpo');
  });

  it('puertas lado a lado y una gaveta arriba (de abajo hacia arriba, como las recetas del catálogo)', () => {
    const panels = [...body, board('Puerta izquierda', 2, 2, 296, 560), board('Puerta derecha', 302, 2, 296, 560), board('Frente superior', 2, 566, 596, 172)];
    const fr = frontsFromPanels({ w: 60, h: 74, panels, pdim: [60, 74, 60] });
    expect(fr.map((f) => [f.t, f.n ?? 1])).toEqual([['door', 2], ['drawer', 1]]);
    expect(fr[0]!.f).toBeGreaterThan(0.7);
  });

  it('sin tablas de frente no inventa frentes; un GLB sólido sigue con puertas estándar', () => {
    expect(frontsFromPanels({ w: 60, h: 74, panels: body, pdim: [60, 74, 60] })).toEqual([]);
    expect(frontsOf(glbModule())).toEqual([{ t: 'door', n: 1, f: 1 }]);
  });

  it('si cambias sus frentes en el editor se despieza como un módulo estándar', () => {
    const panels = [...body, board('Puerta (unica)', 2, 2, 596, 736)];
    const m = glbModule({ panels, pdim: [60, 74, 60], h: 74, fr: [{ t: 'door', n: 1, f: 1 }] });
    expect(usesBoards(m)).toBe(true);
    expect(parts(m, DEFAULT_KITCHEN.mats as never, materials).some((p) => p.pieza === 'Puerta (unica)')).toBe(true);
    const two = { ...m, fr: [{ t: 'door' as const, n: 2, f: 1 }] };
    expect(usesBoards(two)).toBe(false);
    expect(parts(two, DEFAULT_KITCHEN.mats as never, materials).find((p) => p.pieza === 'Puerta')!.cant).toBe(2);
  });
});
