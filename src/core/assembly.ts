// Assembly drawings per module (millimetres) — ported from the prototype's exploded()/ortho().
import { cols, type Drawing, type DrawItem, front2D } from './drawing';
import { shade } from './geometry';
import { parts } from './parts';
import type { ModuleInstance, ProjectData } from './schema';
import type { MaterialDefinition } from './types';

const ACC = '#ec3013';
const INK = '#201e1d';
const f1 = (n: number) => n.toFixed(1);

/** Exploded isometric view with the despiece reference numbers. */
export function exploded(m: ModuleInstance, mats: ProjectData['mats'], materials: Record<string, MaterialDefinition>): Drawing {
  const W = m.w * 10;
  const H = m.h * 10;
  const D = m.d * 10;
  const t = 18;
  const e = Math.max(W, H) * 0.16;
  const C = cols(m, mats, materials);
  const a = (40 * Math.PI) / 180;
  const s = Math.sin(a);
  const c = Math.cos(a);
  const Pj = (x: number, y: number, z: number) => [x * c - y * s, (x * s + y * c) * 0.55 - z * 0.83] as const;
  const bx = [1e9, 1e9, -1e9, -1e9];
  const it: DrawItem[] = [];
  const pt = (p: readonly [number, number, number]) => {
    const q = Pj(p[0], p[1], p[2]);
    bx[0] = Math.min(bx[0]!, q[0]);
    bx[1] = Math.min(bx[1]!, q[1]);
    bx[2] = Math.max(bx[2]!, q[0]);
    bx[3] = Math.max(bx[3]!, q[1]);
    return `${f1(q[0])} ${f1(q[1])}`;
  };
  type Box = [number, number, number, number, number, number, string, number | undefined];
  const boxes: Box[] = [];
  const pr = parts(m, mats, materials);
  const ref = (g: string) => pr.find((p) => p.grp === g)?.ref;
  boxes.push([-e, t - e, 0, D, 0, H, C.b, ref('lat')]);
  boxes.push([W - t + e, W + e, 0, D, 0, H, C.b, ref('lat')]);
  boxes.push([t, W - t, 0, D, -e, t - e, C.b, ref('base')]);
  if (m.type === 'base') {
    boxes.push([t, W - t, D - 100, D, H - t + e, H + e, C.b, ref('trav')]);
    boxes.push([t, W - t, 0, 100, H - t + e, H + e, C.b, ref('trav')]);
  } else boxes.push([t, W - t, 0, D, H - t + e, H + e, C.b, ref('top')]);
  boxes.push([0, W, -6 - e, -e, 0, H, '#e8e4dc', ref('back')]);
  if (ref('shelf')) boxes.push([t, W - t, 0, D - 20, H / 2, H / 2 + t, shade(C.b, -0.04), ref('shelf')]);
  let v = 0;
  for (const seg of m.fr) {
    const z0 = v * H;
    const z1 = (v + seg.f) * H;
    v += seg.f;
    if (seg.t === 'open') continue;
    const n = seg.t === 'door' ? seg.n || 1 : 1;
    for (let i = 0; i < n; i++) boxes.push([(W * i) / n + 2, (W * (i + 1)) / n - 2, D + e * 1.3, D + e * 1.3 + 18, z0 + 2, z1 - 2, seg.t === 'oven' ? '#2d2c2b' : C.f, ref(seg.t === 'door' ? 'door' : 'drawer')]);
  }
  boxes.sort((p, q) => (p[0] + p[1]) * s + (p[2] + p[3]) * c - ((q[0] + q[1]) * s + (q[2] + q[3]) * c));
  const labels: [readonly [number, number], number][] = [];
  for (const [x0, x1, y0, y1, z0, z1, col, r] of boxes) {
    const ed = shade(col, -0.35);
    const poly = (ps: [number, number, number][]) => `M${ps.map(pt).join('L')}Z`;
    it.push({ d: poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]), fill: shade(col, 0.12), stroke: ed, sw: 1.5 });
    it.push({ d: poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]), fill: col, stroke: ed, sw: 1.5 });
    it.push({ d: poly([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]), fill: shade(col, -0.16), stroke: ed, sw: 1.5 });
    if (r) labels.push([Pj((x0 + x1) / 2, y1, (z0 + z1) / 2), r]);
  }
  const R = Math.max(W, H) * 0.028;
  for (const [q, r] of labels) {
    it.push({ t: 'c', cx: q[0], cy: q[1], r: R, fill: ACC, stroke: '#fff', sw: R * 0.15 });
    it.push({ t: 'text', x: q[0], y: q[1], s: String(r), fs: R * 1.1, fill: '#fff', fw: 800 });
  }
  const pad = Math.max(W, H) * 0.06;
  return { items: it, vb: [bx[0]! - pad, bx[1]! - pad, bx[2]! - bx[0]! + 2 * pad, bx[3]! - bx[1]! + 2 * pad] };
}

export type OrthoView = 'front' | 'side' | 'top';

/** Orthographic view with dimension lines (mm). */
export function ortho(m: ModuleInstance, mats: ProjectData['mats'], materials: Record<string, MaterialDefinition>, view: OrthoView, hstyle: string): Drawing {
  const it: DrawItem[] = [];
  const W = m.w * 10;
  const H = m.h * 10;
  const D = m.d * 10;
  const C = cols(m, mats, materials);
  const P = (x: number, y: number) => `${f1(x)} ${f1(y)}`;
  const rect = (x: number, y: number, w: number, h: number, fill: string, stroke: string, sw: number) => it.push({ d: `M${P(x, y)}L${P(x + w, y)}L${P(x + w, y + h)}L${P(x, y + h)}Z`, fill, stroke, sw });
  const ln = (x1: number, y1: number, x2: number, y2: number, stroke: string, sw: number, dash?: string) => it.push({ d: `M${P(x1, y1)}L${P(x2, y2)}`, stroke, sw, dash });
  const k = Math.max(W, H, D) / 100;
  const fs = 4.2 * k;
  const sw = 0.35 * k;
  const dimH = (x0: number, x1: number, y: number, lbl: string) => {
    ln(x0, y, x1, y, INK, sw);
    ln(x0, y - 3 * k, x0, y + 3 * k, INK, sw);
    ln(x1, y - 3 * k, x1, y + 3 * k, INK, sw);
    it.push({ t: 'text', x: (x0 + x1) / 2, y: y + 5 * k, s: lbl, fs });
  };
  const dimV = (y0: number, y1: number, x: number, lbl: string) => {
    ln(x, y0, x, y1, INK, sw);
    ln(x - 3 * k, y0, x + 3 * k, y0, INK, sw);
    ln(x - 3 * k, y1, x + 3 * k, y1, INK, sw);
    it.push({ t: 'text', x: x + 5 * k, y: (y0 + y1) / 2, s: lbl, fs, rot: 90 });
  };
  let w: number;
  let h: number;
  if (view === 'front') {
    front2D({ ...m, w: W, h: H }, 0, 0, W, H, C, hstyle, it);
    for (const p of it) if (p.sw) p.sw *= k * 0.8;
    w = W;
    h = H;
    dimH(0, W, H + 8 * k, String(W));
    dimV(0, H, W + 8 * k, String(H));
  } else if (view === 'side') {
    rect(0, 0, D, H, C.b, INK, sw * 1.5);
    rect(D - 18, 0, 18, H, C.f, INK, sw);
    ln(0, 0, 0, H, INK, sw * 3);
    if (m.type !== 'fridge') ln(0, H / 2, D - 38, H / 2, INK, sw, `${2 * k} ${2 * k}`);
    w = D;
    h = H;
    dimH(0, D, H + 8 * k, String(D));
    dimV(0, H, D + 8 * k, String(H));
  } else {
    rect(0, 0, W, D, C.b, INK, sw * 1.5);
    rect(0, D - 18, W, 18, C.f, INK, sw);
    rect(0, 0, W, 6, '#e8e4dc', INK, sw);
    ln(18, 6, 18, D - 18, INK, sw, `${2 * k} ${2 * k}`);
    ln(W - 18, 6, W - 18, D - 18, INK, sw, `${2 * k} ${2 * k}`);
    w = W;
    h = D;
    dimH(0, W, D + 8 * k, String(W));
    dimV(0, D, W + 8 * k, String(D));
  }
  const pad = 6 * k;
  return { items: it, vb: [-pad, -pad, w + 20 * k, h + 18 * k] };
}
