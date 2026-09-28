import { describe, expect, it } from 'vitest';
import { DEFAULT_MODULES, generateDesign, type ModuleDefinition, moduleChoicesFor, moduleRolesFor, newProject, projectDataSchema } from '../src/core';

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
