import { describe, expect, it } from 'vitest';
import { corte, DEFAULT_KITCHEN, DEFAULT_MATERIALS, type MaterialDefinition, type ModuleInstance, parts, projectDataSchema, ranges, setDim, validateProject } from '../src/core';
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
});
