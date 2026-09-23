// Cut list — ported from the prototype's allParts()/corte()/exportCsv().
import { parts } from './parts';
import type { ProjectData } from './schema';
import type { MaterialDefinition } from './types';

export interface CutRow {
  pieza: string;
  L: number;
  A: number;
  veta: string;
  cantos: string;
  cant: number;
  mods: number[];
}

export interface CutGroup {
  mat: string;
  matCode: string;
  esp: number;
  rows: CutRow[];
  pieces: number;
  /** m² */
  area: number;
  /** Boards of 2440 × 1830 mm (4.47 m²) with 15 % waste. */
  boards: number;
}

export const BOARD = { L: 2440, A: 1830, areaM2: 4.47, waste: 0.15 } as const;

export function allParts(project: ProjectData, materials: Record<string, MaterialDefinition>) {
  return project.mods.flatMap((m) => parts(m, project.mats, materials).map((p) => ({ mod: m.id, ...p })));
}

export function corte(project: ProjectData, materials: Record<string, MaterialDefinition>): CutGroup[] {
  const groups = new Map<string, { mat: string; matCode: string; esp: number; rows: Map<string, CutRow>; pieces: number; area: number }>();
  for (const p of allParts(project, materials)) {
    const key = `${p.mat}|${p.esp}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { mat: p.mat, matCode: p.matCode, esp: p.esp, rows: new Map(), pieces: 0, area: 0 }));
    const rk = `${p.pieza}|${p.L}|${p.A}`;
    let r = g.rows.get(rk);
    if (!r) g.rows.set(rk, (r = { pieza: p.pieza, L: p.L, A: p.A, veta: p.veta, cantos: p.cantos, cant: 0, mods: [] }));
    r.cant += p.cant;
    if (!r.mods.includes(p.mod)) r.mods.push(p.mod);
    g.pieces += p.cant;
    g.area += (p.cant * p.L * p.A) / 1e6;
  }
  return [...groups.values()]
    .map((g) => ({
      mat: g.mat,
      matCode: g.matCode,
      esp: g.esp,
      rows: [...g.rows.values()],
      pieces: g.pieces,
      area: g.area,
      boards: Math.ceil((g.area * (1 + BOARD.waste)) / BOARD.areaM2),
    }))
    .sort((a, b) => b.area - a.area);
}

/** CSV exactly like the prototype's "Exportar CSV" (UTF-8 BOM, all fields quoted). */
export function cutlistCsv(groups: CutGroup[]): string {
  const lines: (string | number)[][] = [['Material', 'Espesor (mm)', 'Pieza', 'Módulos', 'Cantidad', 'Largo (mm)', 'Ancho (mm)', 'Veta', 'Cantos']];
  for (const g of groups) for (const r of g.rows) lines.push([g.mat, g.esp, r.pieza, r.mods.join(' '), r.cant, r.L, r.A, r.veta, r.cantos]);
  return `﻿${lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')}`;
}
