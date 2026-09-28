// Cut optimisation: lays the pieces of the cut list out on the boards (sheets) of each material, MaxRects
// "best short side fit", with the saw kerf and the edge trim. Pieces with grain on a wood board keep it along
// the board length; the rest may turn 90°.
import { type CutGroup, sheetOf } from './cutlist';
import type { MaterialDefinition } from './types';

export interface NestOptions {
  /** Saw blade width (mm). */
  kerf?: number;
  /** Trim on every edge of the board (mm). */
  trim?: number;
}

export interface Placement {
  /** Position on the board from its top-left corner (mm), trim included. */
  x: number;
  y: number;
  /** Size as laid out: w along the board length, h along its width (mm). */
  w: number;
  h: number;
  /** Turned 90° (its length runs along the board width). */
  rot: boolean;
  pieza: string;
  L: number;
  A: number;
  mods: number[];
}

export interface NestSheet {
  placements: Placement[];
  /** Area of the pieces (m²). */
  used: number;
  /** Share of the board used (0–1). */
  usage: number;
}

export interface NestGroup {
  mat: string;
  matCode: string;
  esp: number;
  sheet: [number, number];
  supplier: string | null;
  sheets: NestSheet[];
  pieces: number;
  /** Share of all the boards used (0–1). */
  usage: number;
  /** Pieces larger than the board: listed apart, never placed. */
  oversize: { pieza: string; L: number; A: number; cant: number }[];
}

type Rect = { x: number; y: number; w: number; h: number };

class Bin {
  free: Rect[];
  placed: Placement[] = [];
  constructor(w: number, h: number) {
    this.free = [{ x: 0, y: 0, w, h }];
  }
  /** Best spot for a w × h rectangle: [score, rect]; lower score is better (short side left over). */
  find(w: number, h: number): { score: number; long: number; r: Rect } | null {
    let best: { score: number; long: number; r: Rect } | null = null;
    for (const f of this.free) {
      if (w > f.w || h > f.h) continue;
      const score = Math.min(f.w - w, f.h - h);
      const long = Math.max(f.w - w, f.h - h);
      if (!best || score < best.score || (score === best.score && long < best.long)) best = { score, long, r: { x: f.x, y: f.y, w, h } };
    }
    return best;
  }
  place(r: Rect) {
    const next: Rect[] = [];
    for (const f of this.free) {
      if (r.x >= f.x + f.w || r.x + r.w <= f.x || r.y >= f.y + f.h || r.y + r.h <= f.y) {
        next.push(f);
        continue;
      }
      if (r.x > f.x) next.push({ x: f.x, y: f.y, w: r.x - f.x, h: f.h });
      if (r.x + r.w < f.x + f.w) next.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - r.x - r.w, h: f.h });
      if (r.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: r.y - f.y });
      if (r.y + r.h < f.y + f.h) next.push({ x: f.x, y: r.y + r.h, w: f.w, h: f.y + f.h - r.y - r.h });
    }
    // Drop free rectangles contained in another one.
    this.free = next.filter((a, i) => !next.some((b, j) => j !== i && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (j < i || a.w !== b.w || a.h !== b.h || a.x !== b.x || a.y !== b.y)));
  }
}

export function optimizeCut(groups: CutGroup[], materials: Record<string, MaterialDefinition>, opts: NestOptions = {}): NestGroup[] {
  const kerf = Math.max(0, Math.min(10, opts.kerf ?? 4));
  const trim = Math.max(0, Math.min(50, opts.trim ?? 10));
  return groups.map((g) => {
    const mat = materials[g.matCode];
    const sheet = g.sheet ?? sheetOf(mat);
    const [SL, SA] = sheet;
    // Usable area grown by one kerf so the last piece on each side needs no cut after it.
    const UW = SL - 2 * trim + kerf;
    const UH = SA - 2 * trim + kerf;
    const wood = !!mat?.wood;
    const items = g.rows
      .flatMap((r) => Array.from({ length: r.cant }, () => r))
      .map((r) => ({ r, canTurn: !wood || r.veta === '—' }))
      .sort((a, b) => Math.max(b.r.L, b.r.A) - Math.max(a.r.L, a.r.A) || b.r.L * b.r.A - a.r.L * a.r.A);
    const bins: Bin[] = [];
    const over = new Map<string, { pieza: string; L: number; A: number; cant: number }>();
    for (const { r, canTurn } of items) {
      const opts2: [number, number, boolean][] = [[r.L + kerf, r.A + kerf, false]];
      if (canTurn && r.L !== r.A) opts2.push([r.A + kerf, r.L + kerf, true]);
      const fits = (b: Bin) => {
        let best: { score: number; long: number; r: Rect; rot: boolean } | null = null;
        for (const [w, h, rot] of opts2) {
          const f = b.find(w, h);
          if (f && (!best || f.score < best.score || (f.score === best.score && f.long < best.long))) best = { ...f, rot };
        }
        return best;
      };
      let target: { bin: Bin; spot: NonNullable<ReturnType<typeof fits>> } | null = null;
      for (const bin of bins) {
        const spot = fits(bin);
        if (spot && (!target || spot.score < target.spot.score)) target = { bin, spot };
      }
      if (!target) {
        const bin = new Bin(UW, UH);
        const spot = fits(bin);
        if (!spot) {
          const k = `${r.pieza}|${r.L}|${r.A}`;
          const o = over.get(k) ?? { pieza: r.pieza, L: r.L, A: r.A, cant: 0 };
          o.cant++;
          over.set(k, o);
          continue;
        }
        bins.push(bin);
        target = { bin, spot };
      }
      const { bin, spot } = target;
      bin.place(spot.r);
      bin.placed.push({ x: spot.r.x + trim, y: spot.r.y + trim, w: spot.r.w - kerf, h: spot.r.h - kerf, rot: spot.rot, pieza: r.pieza, L: r.L, A: r.A, mods: r.mods });
    }
    const area = (SL * SA) / 1e6;
    const sheets = bins.map((b) => {
      const used = b.placed.reduce((a, p) => a + (p.w * p.h) / 1e6, 0);
      return { placements: b.placed, used, usage: used / area };
    });
    const used = sheets.reduce((a, s) => a + s.used, 0);
    return {
      mat: g.mat,
      matCode: g.matCode,
      esp: g.esp,
      sheet,
      supplier: g.supplier ?? mat?.supplier ?? null,
      sheets,
      pieces: sheets.reduce((a, s) => a + s.placements.length, 0),
      usage: sheets.length ? used / (sheets.length * area) : 0,
      oversize: [...over.values()],
    };
  });
}

/** CSV of the layout (one row per piece) for the saw: board, position and size in mm. */
export function nestingCsv(groups: NestGroup[]): string {
  const lines: (string | number)[][] = [['Material', 'Espesor (mm)', 'Distribuidor', 'Plancha (mm)', 'Tablero n.º', 'Pieza', 'Módulos', 'Largo (mm)', 'Ancho (mm)', 'X (mm)', 'Y (mm)', 'Girada']];
  for (const g of groups) {
    g.sheets.forEach((s, i) => {
      for (const p of s.placements) lines.push([g.mat, g.esp, g.supplier ?? '', `${g.sheet[0]} × ${g.sheet[1]}`, i + 1, p.pieza, p.mods.join(' '), p.L, p.A, Math.round(p.x), Math.round(p.y), p.rot ? 'Sí' : 'No']);
    });
    for (const o of g.oversize) lines.push([g.mat, g.esp, g.supplier ?? '', `${g.sheet[0]} × ${g.sheet[1]}`, 'No cabe', o.pieza, '', o.L, o.A, '', '', `×${o.cant}`]);
  }
  return `﻿${lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')}`;
}
