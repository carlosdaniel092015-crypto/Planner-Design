import { beforeEach, describe, expect, it } from 'vitest';
import { clipboardModules, copyModules, pasteModules, removeModules } from '../frontend/src/editor/clipboard';
import { DEFAULT_MATERIALS, DEFAULT_MODULES, elev, generateDesign, newProject, plan, projectDataSchema, validateProject } from '../src/core';

const by = <T extends { code: string }>(a: T[]) => Object.fromEntries(a.map((x) => [x.code, x]));
const kitchen = () => {
  const p = projectDataSchema.parse(newProject('cocina'));
  return projectDataSchema.parse({ ...p, mods: generateDesign(p, by(DEFAULT_MODULES)).mods });
};
// In-memory localStorage for the clipboard (the tests run in Node).
beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
});

describe('selección múltiple y portapapeles', () => {
  it('la planta y el alzado resaltan todos los seleccionados', () => {
    const p = kitchen();
    const [a, b] = p.mods.filter((m) => m.wall === 'A' && m.type === 'base');
    const count = (d: ReturnType<typeof plan>) => d.items.filter((it) => it.stroke === '#ec3013' && it.sw === 1.8).length;
    expect(count(plan(p, { sel: a!.id }))).toBe(1);
    expect(count(plan(p, { sel: a!.id, sels: [a!.id, b!.id] }))).toBe(2);
    const e = elev(p, 'A', by(DEFAULT_MATERIALS), { sel: a!.id, sels: [a!.id, b!.id] });
    expect(e.items.filter((it) => it.fill === 'rgba(236,48,19,.08)').length).toBe(2);
  });

  it('copiar, cortar y pegar módulos sin traslapes', () => {
    let p = kitchen();
    p = { ...p, room: { ...p.room, A: 600 } };
    const picked = p.mods.filter((m) => m.type === 'upper').slice(0, 2);
    copyModules(picked);
    const cut = removeModules(p, picked.map((m) => m.id));
    expect(cut.mods).toHaveLength(p.mods.length - 2);
    const r = pasteModules(cut, clipboardModules());
    expect(r.ids).toHaveLength(2);
    expect(r.failed).toBe(0);
    const pasted = r.project.mods.filter((m) => r.ids.includes(m.id));
    expect(pasted.map((m) => [m.code, m.w])).toEqual(picked.map((m) => [m.code, m.w]));
    const issues = validateProject(projectDataSchema.parse(r.project));
    expect(issues.find((i) => i.code === 'TRASLAPE')?.st ?? 'ok').toBe('ok');
  });

  it('el portapapeles guardado se valida (datos ajenos no entran)', () => {
    localStorage.setItem('planner.clipboard.v1', JSON.stringify([{ nada: 1 }, 'x']));
    copyModules([]);
    expect(clipboardModules()).toEqual([]);
  });

  it('cámaras guardadas: válidas se aceptan, fuera de rango se rechazan', () => {
    const base = newProject('cocina');
    const cam = { az: 0.8, polar: 1.1, dist: 6.5, target: [1.8, 1, 1.5] };
    expect(projectDataSchema.safeParse({ ...base, cams: { persp: cam, det: { mod: 3, cam } } }).success).toBe(true);
    expect(projectDataSchema.safeParse({ ...base, cams: { persp: { ...cam, dist: 500 } } }).success).toBe(false);
    expect(projectDataSchema.safeParse({ ...base, cams: { persp: { ...cam, target: [1, 2] } } }).success).toBe(false);
  });
});
