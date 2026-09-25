// Module clipboard for Ctrl+C / Ctrl+X / Ctrl+V in Diseño. Lives in memory and in localStorage, so modules can be copied
// from one project and pasted into another (materials travel by code, like the catalogue).
import { addModule, type ModuleInstance, type ModuleShape, moduleSchema, type ProjectData, removeModule } from '@core';

const KEY = 'planner.clipboard.v1';
let mem: ModuleInstance[] = [];

export function copyModules(mods: ModuleInstance[]) {
  mem = structuredClone(mods);
  try {
    localStorage.setItem(KEY, JSON.stringify(mem));
  } catch {
    // Private mode / quota: the in-memory copy still works in this tab.
  }
}

export function clipboardModules(): ModuleInstance[] {
  if (mem.length) return mem;
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    // Stored data is untrusted: keep only valid modules.
    return Array.isArray(raw) ? raw.flatMap((m) => (moduleSchema.safeParse(m).success ? [m as ModuleInstance] : [])) : [];
  } catch {
    return [];
  }
}

/** Pastes each module in the first free spot (like "Duplicar"); returns the new ids and how many did not fit. */
export function pasteModules(p: ProjectData, mods: ModuleInstance[]) {
  let cur = p;
  const ids: number[] = [];
  let failed = 0;
  for (const m of mods) {
    const { wall: _w, pos: _p, x: _x, y: _y, id: _i, ...rest } = m;
    const r = addModule(cur, { ...(rest as unknown as ModuleShape), rw: m.rw ?? [m.w, m.w] });
    if (!r) {
      failed++;
      continue;
    }
    cur = r.project;
    ids.push(r.id);
  }
  return { project: cur, ids, failed };
}

export const removeModules = (p: ProjectData, ids: number[]) => ids.reduce((acc, id) => removeModule(acc, id), p);
