import { describe, expect, it } from 'vitest';
import { DEFAULT_HARDWARE, DEFAULT_MATERIALS, DEFAULT_MODULES, generateDesign, type ModuleDefinition, moduleChoicesFor, moduleRolesFor, newProject, placedFor, placesFor, projectDataSchema, validateProject } from '../src/core';

const by = <T extends { code: string }>(a: T[]) => Object.fromEntries(a.map((x) => [x.code, x]));
const std = by(DEFAULT_MODULES);
const own = (code: string, from: string, patch: Partial<ModuleDefinition> = {}): ModuleDefinition => ({ ...std[from]!, code, name: `Mi ${std[from]!.name}`, ...patch });

describe('mis módulos en la distribución propuesta', () => {
  const catalog: Record<string, ModuleDefinition> = {
    ...std,
    'MI-B1': own('MI-B1', 'B-1P', { rw: [30, 60] }),
    'MI-B2': own('MI-B2', 'B-2P', { rw: [61, 120] }),
    'MI-A2': own('MI-A2', 'A-2P'),
    'MI-FIJO': own('MI-FIJO', 'B-2P', { w: 80, rw: [80, 80] }),
  };

  it('usa el módulo elegido en lugar del estándar, con su ancho', () => {
    const p = projectDataSchema.parse(newProject('cocina'));
    const plain = generateDesign(p, catalog);
    p.prefs = { ...p.prefs, mods: { 'B-1P': 'MI-B1', 'B-2P': 'MI-B2', 'A-2P': '' } };
    const g = generateDesign(p, catalog);
    const codes = g.mods.map((m) => m.code);
    expect(codes).not.toContain('B-2P');
    expect(codes).toContain('MI-B2');
    // '' keeps the standard module.
    expect(codes).toContain('A-2P');
    for (const m of g.mods.filter((m) => m.code === 'MI-B2')) expect(m.w).toBeGreaterThanOrEqual(61);
    // Same room, same number of floor pieces: only which module fills each gap changes.
    expect(g.mods.length).toBe(plain.mods.length);
  });

  it('si tu módulo no admite el ancho del hueco usa el estándar y lo avisa', () => {
    const p = projectDataSchema.parse(newProject('cocina'));
    p.prefs = { ...p.prefs, mods: { 'B-2P': 'MI-FIJO' } };
    const g = generateDesign(p, catalog);
    const two = g.mods.filter((m) => m.code === 'MI-FIJO' || m.code === 'B-2P');
    for (const m of two.filter((m) => m.code === 'MI-FIJO')) expect(m.w).toBe(80);
    if (two.some((m) => m.code === 'B-2P')) expect(g.notes.some((n) => n.includes('«Mi') && n.includes('estándar'))).toBe(true);
  });

  it('un módulo inactivo o que no existe se ignora', () => {
    const p = projectDataSchema.parse(newProject('cocina'));
    p.prefs = { ...p.prefs, mods: { 'B-2P': 'NO-EXISTE', 'A-2P': 'MI-A2' } };
    const g = generateDesign(p, { ...catalog, 'MI-A2': { ...catalog['MI-A2']!, active: false } });
    expect(g.mods.map((m) => m.code)).toContain('B-2P');
    expect(g.mods.map((m) => m.code)).toContain('A-2P');
  });

  it('solo ofrece módulos del mismo tipo y proyecto', () => {
    const choices = moduleChoicesFor('A-2P', catalog).map((m) => m.code);
    expect(choices).toContain('MI-A2');
    expect(choices).not.toContain('MI-B1');
    expect(choices).not.toContain('A-2P');
    expect(moduleRolesFor({ ptype: 'cocina' }).map((r) => r.code)).toContain('BF');
    expect(moduleRolesFor({ ptype: 'closet', layout: 'lineal' }).map((r) => r.code)).toContain('CL-100');
    expect(moduleRolesFor({ ptype: 'vestidor' }).map((r) => r.code)).toContain('VL-100');
  });

  it('closet: el colgado largo elegido se usa en la propuesta', () => {
    const cat = { ...catalog, 'MI-CL': own('MI-CL', 'CL-100', { rw: [60, 120] }) };
    const p = projectDataSchema.parse(newProject('closet'));
    p.prefs = { ...p.prefs, mods: { 'CL-100': 'MI-CL' } };
    const g = generateDesign(p, cat);
    expect(g.mods.map((m) => m.code)).toContain('MI-CL');
    expect(g.mods.map((m) => m.code)).not.toContain('CL-100');
  });
});

describe('ubicación predeterminada de mis módulos', () => {
  const ctxOf = (modules: Record<string, ModuleDefinition>) => ({
    settings: { baseCurrency: 'DOP' as const, exchangeRateDopPerUsd: 60, taxName: 'ITBIS', taxRate: 0.18, pricesIncludeTax: false, wasteRate: 0.15, marginRate: 0, rounding: 'ninguno' as const },
    modules,
    materials: Object.fromEntries(DEFAULT_MATERIALS.map((m) => [m.code, m])),
    hardware: Object.fromEntries(DEFAULT_HARDWARE.map((m) => [m.code, m])),
  });
  const cat: Record<string, ModuleDefinition> = {
    ...std,
    'MI-BAJO': own('MI-BAJO', 'B-2P', { rw: [35, 120], place: 'bajo' }),
    'MI-ESQ-ALTA': own('MI-ESQ-ALTA', 'A-2P', { w: 60, rw: [55, 70], place: 'esquina-alta' }),
    'MI-NEVERA': own('MI-NEVERA', 'A-2P', { w: 75, h: 40, d: 60, rw: [60, 90], place: 'sobre-nevera' }),
  };

  it('sin elegir nada en el asistente, cada módulo va a su ubicación', () => {
    const p = projectDataSchema.parse(newProject('cocina'));
    const g = generateDesign(p, cat);
    const codes = g.mods.map((m) => m.code);
    expect(codes).toContain('MI-BAJO');
    for (const m of g.mods.filter((m) => m.code === 'MI-BAJO')) expect(m.w).toBeGreaterThanOrEqual(35);
    // Corner upper at the start of wall A (A meets B in an L).
    const corner = g.mods.find((m) => m.code === 'MI-ESQ-ALTA');
    expect(corner).toMatchObject({ wall: 'A', pos: 0, type: 'upper' });
    // Over the fridge: same wall and width, just above it, own depth.
    const fridge = g.mods.find((m) => m.type === 'fridge')!;
    const over = g.mods.find((m) => m.code === 'MI-NEVERA')!;
    expect(over).toMatchObject({ wall: fridge.wall, pos: fridge.pos, w: fridge.w, d: 60 });
    expect(over.z).toBeGreaterThan(fridge.h);
    expect(over.z! + over.h).toBeLessThanOrEqual(p.room.H);
    // The result is a valid project with no blocking errors from the new pieces.
    const q = projectDataSchema.parse({ ...p, mods: g.mods, mats: g.mats });
    const errs = validateProject(q, ctxOf(cat)).filter((i) => i.st === 'err');
    expect(errs.filter((e) => e.id === over.id || e.id === corner!.id)).toEqual([]);
  });

  it("'-' en el asistente fuerza el estándar aunque haya un módulo con esa ubicación", () => {
    const p = projectDataSchema.parse(newProject('cocina'));
    p.prefs = { ...p.prefs, mods: { 'B-2P': '-', 'B-1P': '-' } };
    const codes = generateDesign(p, cat).mods.map((m) => m.code);
    expect(codes).not.toContain('MI-BAJO');
  });

  it('las ubicaciones se ofrecen según el montaje del módulo', () => {
    expect(placesFor({ projectType: 'cocina', type: 'upper' }).map((x) => x.key)).toEqual(['alto', 'esquina-alta', 'sobre-nevera']);
    expect(placesFor({ projectType: 'cocina', type: 'base' }).map((x) => x.key)).toContain('esquina-baja');
    expect(placedFor('B-1P', cat).map((m) => m.code)).toEqual(['MI-BAJO']);
  });
});
