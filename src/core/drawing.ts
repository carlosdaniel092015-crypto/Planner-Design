// Vector drawings as JSON draw lists (plan and wall elevations) — ported from the prototype's
// plan()/elev()/front2D() without the click handlers. The frontend renders `items` into an <svg viewBox={vb}>.
import { geo, shade, wallPt, zocaloCm, zr } from './geometry';
import type { ModuleInstance, ProjectData } from './schema';
import type { MaterialDefinition, WallId } from './types';

export interface DrawItem {
  d?: string;
  t?: 'text' | 'c';
  fill?: string;
  stroke?: string;
  sw?: number;
  dash?: string;
  x?: number;
  y?: number;
  s?: string;
  fs?: number;
  fw?: number;
  rot?: number;
  anchor?: string;
  halo?: string;
  cx?: number;
  cy?: number;
  r?: number;
  /** Module id this shape belongs to (click to select). */
  mid?: number;
}

export interface Drawing {
  items: DrawItem[];
  vb: number[];
}

const ACC = '#ec3013';
const INK = '#201e1d';
const P = (x: number, y: number) => `${x.toFixed(1)} ${y.toFixed(1)}`;

export type Colors = { f: string; b: string; c: string; hd: string };
const colorOf = (materials: Record<string, MaterialDefinition>, code: string, fallback: string) => materials[code]?.color ?? fallback;
export function cols(m: Pick<ModuleInstance, 'cue' | 'fre'>, mats: ProjectData['mats'], materials: Record<string, MaterialDefinition>): Colors {
  return {
    f: colorOf(materials, m.fre || mats.frentes, '#c49a6c'),
    b: colorOf(materials, m.cue || mats.cuerpo, '#eeebe6'),
    c: colorOf(materials, mats.encimera, '#e9e7e2'),
    hd: colorOf(materials, mats.jaladeras, '#2a2928'),
  };
}
const handleOf = (a?: string) => (a === 'Gola' ? 'gola' : a === 'Push' ? 'none' : 'bar');

export function plan(p: ProjectData, opts: { altos?: boolean; cotas?: boolean; nums?: boolean; sel?: number | null } = {}): Drawing {
  const it: DrawItem[] = [];
  const T = 12;
  const { A, B } = p.room;
  const rect = (x: number, y: number, w: number, h: number, fill: string, stroke?: string, sw?: number, ex: Partial<DrawItem> = {}) =>
    it.push({ d: `M${P(x, y)}L${P(x + w, y)}L${P(x + w, y + h)}L${P(x, y + h)}Z`, fill, stroke, sw, ...ex });
  const ln = (x1: number, y1: number, x2: number, y2: number, stroke: string, sw: number, ex: Partial<DrawItem> = {}) =>
    it.push({ d: `M${P(x1, y1)}L${P(x2, y2)}`, stroke, sw, ...ex });
  const tx = (x: number, y: number, s: string, ex: Partial<DrawItem> = {}) => it.push({ t: 'text', x, y, s, fs: 9, ...ex });
  rect(0, 0, A, B, '#faf9f7', 'none', 0);
  for (let x = 50; x < A; x += 50) ln(x, 0, x, B, '#ebe7e1', 0.5);
  for (let y = 50; y < B; y += 50) ln(0, y, A, y, '#ebe7e1', 0.5);
  rect(-T, -T, A + 2 * T, T, INK);
  rect(-T, 0, T, B, INK);
  rect(A, 0, T, B, INK);
  rect(-T, B, A + 2 * T, T, INK);
  const lab: Record<string, [number, number, number]> = { A: [A / 2, -T / 2, 0], B: [-T / 2, B / 2, -90], C: [A + T / 2, B / 2, 90], D: [A / 2, B + T / 2, 0] };
  for (const k of Object.keys(lab)) tx(lab[k]![0], lab[k]![1], `MURO ${k}`, { fill: '#ffffff', fs: 6.5, rot: lab[k]![2], fw: 800 });
  for (const op of p.ops) {
    const W = (t: number, n: number) => wallPt(op.wall, t, n, A, B);
    const a = W(op.pos, -T);
    const b = W(op.pos + op.w, 0);
    const x = Math.min(a[0], b[0]);
    const y = Math.min(a[1], b[1]);
    const w = Math.abs(a[0] - b[0]);
    const h = Math.abs(a[1] - b[1]);
    if (op.t === 'ventana') {
      rect(x, y, w, h, '#ffffff', INK, 0.8);
      const m1 = W(op.pos, -T / 2);
      const m2 = W(op.pos + op.w, -T / 2);
      ln(m1[0], m1[1], m2[0], m2[1], INK, 0.8);
    } else {
      rect(x, y, w, h, '#faf9f7');
      const h0 = W(op.pos, 0);
      const h1 = W(op.pos, op.w);
      ln(h0[0], h0[1], h1[0], h1[1], INK, 1.4);
      const pts: [number, number][] = [];
      for (let i = 0; i <= 12; i++) {
        const th = (i / 12) * (Math.PI / 2);
        pts.push(W(op.pos + op.w * Math.sin(th), op.w * Math.cos(th)));
      }
      it.push({ d: `M${pts.map((q) => P(q[0], q[1])).join('L')}`, stroke: INK, sw: 0.6, dash: '3 3' });
    }
  }
  const floorM = p.mods.filter((m) => m.type !== 'upper' && m.type !== 'hood');
  const upM = opts.altos === false ? [] : p.mods.filter((m) => m.type === 'upper' || m.type === 'hood');
  for (const m of [...floorM, ...upM]) {
    const g = geo(m, p.room);
    const w = g.x1 - g.x0;
    const h = g.y1 - g.y0;
    const up = m.type === 'upper' || m.type === 'hood';
    const sel = opts.sel === m.id;
    if (up) rect(g.x0, g.y0, w, h, 'none', sel ? ACC : '#6d6a68', sel ? 1.8 : 0.8, { dash: '4 3', mid: m.id });
    else rect(g.x0, g.y0, w, h, sel ? '#fff2ef' : '#ffffff', sel ? ACC : INK, sel ? 1.8 : 1, { mid: m.id });
    if (!up) {
      if (m.type === 'fridge' || m.type === 'tall') {
        ln(g.x0, g.y0, g.x1, g.y1, '#9b9797', 0.6);
        ln(g.x1, g.y0, g.x0, g.y1, '#9b9797', 0.6);
      }
      if (m.sink) rect(g.x0 + w * 0.15, g.y0 + h * 0.15, w * 0.7, h * 0.6, 'none', INK, 0.7);
      if (m.cook)
        for (const q of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]] as const)
          it.push({ t: 'c', cx: g.x0 + w * q[0], cy: g.y0 + h * q[1], r: Math.min(w, h) * 0.12, fill: 'none', stroke: INK, sw: 0.7 });
    }
    if (opts.nums !== false && !up) {
      const cx = (g.x0 + g.x1) / 2;
      const cy = (g.y0 + g.y1) / 2;
      it.push({ t: 'c', cx, cy, r: 8, fill: sel ? ACC : INK, mid: m.id });
      tx(cx, cy + 0.5, String(m.id), { fill: '#ffffff', fs: 8.5, fw: 800 });
    }
  }
  const PTS: Record<string, string> = { agua: 'AG', desague: 'DS', elec: 'EL', gas: 'GS', campana: 'CP' };
  for (const q of p.pts) {
    const [x, y] = wallPt(q.wall, q.pos, 9, A, B);
    const col = ACC;
    if (q.t === 'agua') it.push({ t: 'c', cx: x, cy: y, r: 7, fill: col });
    else if (q.t === 'desague') it.push({ t: 'c', cx: x, cy: y, r: 7, fill: '#ffffff', stroke: col, sw: 1.6 });
    else if (q.t === 'elec') rect(x - 7, y - 7, 14, 14, col);
    else if (q.t === 'gas') it.push({ d: `M${P(x, y - 8)}L${P(x + 8, y + 6)}L${P(x - 8, y + 6)}Z`, fill: col });
    else it.push({ d: `M${P(x, y - 8)}L${P(x + 8, y)}L${P(x, y + 8)}L${P(x - 8, y)}Z`, fill: col });
    tx(x, y + (q.t === 'gas' ? 1.5 : 0.5), PTS[q.t]!, { fill: q.t === 'desague' ? col : '#ffffff', fs: 5.5, fw: 800 });
  }
  const ext = [-T - 20, -T - 20, A + 2 * T + 40, B + 2 * T + 40];
  if (opts.cotas !== false) {
    const chain = (wall: WallId, ms: ModuleInstance[], len: number) => {
      const off = -T - 18;
      const off2 = -T - 38;
      const seg = (t0: number, t1: number, o: number, lbl: string) => {
        const a = wallPt(wall, t0, o, A, B);
        const b = wallPt(wall, t1, o, A, B);
        ln(a[0], a[1], b[0], b[1], INK, 0.6);
        [a, b].forEach((_, i) => {
          const q = wallPt(wall, i ? t1 : t0, o - 4, A, B);
          const r = wallPt(wall, i ? t1 : t0, o + 4, A, B);
          ln(q[0], q[1], r[0], r[1], INK, 0.6);
        });
        const mid = wallPt(wall, (t0 + t1) / 2, o - 6, A, B);
        tx(mid[0], mid[1], lbl, { fs: 7.5, rot: wall === 'B' ? -90 : 0, halo: '#f3f2f2' });
      };
      for (const m of ms) seg(m.pos!, m.pos! + m.w, off, String(m.w * 10));
      seg(0, len, off2, `${len * 10} mm`);
    };
    chain('A', floorM.filter((m) => m.wall === 'A'), A);
    chain('B', floorM.filter((m) => m.wall === 'B'), B);
    ln(A + T + 18, 0, A + T + 18, B, INK, 0.6);
    tx(A + T + 26, B / 2, `${B * 10} mm`, { fs: 7.5, rot: 90 });
    ln(0, B + T + 18, A, B + T + 18, INK, 0.6);
    tx(A / 2, B + T + 26, `${A * 10} mm`, { fs: 7.5 });
    ext.splice(0, 4, -T - 52, -T - 52, A + 2 * T + 92, B + 2 * T + 92);
  }
  return { items: it, vb: ext };
}

export function front2D(m: ModuleInstance, X: number, Y: number, W: number, H: number, C: Colors, hstyle: string, it: DrawItem[], mid?: number) {
  const rect = (x: number, y: number, w: number, h: number, fill: string, stroke?: string, sw?: number) =>
    it.push({ d: `M${P(x, y)}L${P(x + w, y)}L${P(x + w, y + h)}L${P(x, y + h)}Z`, fill, stroke: stroke || shade(fill, -0.35), sw: sw == null ? 0.6 : sw, mid });
  const ln = (x1: number, y1: number, x2: number, y2: number, stroke: string, sw: number) => it.push({ d: `M${P(x1, y1)}L${P(x2, y2)}`, stroke, sw });
  const g = 0.3;
  if (m.type === 'fridge') {
    rect(X, Y, W, H, '#c5c8c9', '#8f9394');
    ln(X, Y + H * 0.38, X + W, Y + H * 0.38, '#8f9394', 0.8);
    ln(X + W * 0.1, Y + H * 0.2, X + W * 0.1, Y + H * 0.34, '#6f7374', 1.6);
    ln(X + W * 0.1, Y + H * 0.42, X + W * 0.1, Y + H * 0.55, '#6f7374', 1.6);
    return;
  }
  if (m.type === 'hood') {
    it.push({ d: `M${P(X, Y + H)}L${P(X + W, Y + H)}L${P(X + W * 0.7, Y)}L${P(X + W * 0.3, Y)}Z`, fill: '#c5c8c9', stroke: '#8f9394', sw: 0.6 });
    return;
  }
  rect(X, Y, W, H, C.b);
  let v = 0;
  for (const seg of m.fr) {
    const y1 = Y + H - v * H;
    const y0 = Y + H - (v + seg.f) * H;
    v += seg.f;
    const sh = y1 - y0;
    if (seg.t === 'door') {
      const n = seg.n || 1;
      for (let i = 0; i < n; i++) rect(X + (W * i) / n + g, y0 + g, W / n - 2 * g, sh - 2 * g, C.f);
      if (hstyle === 'bar') {
        const up = m.type === 'upper';
        const b0 = up ? y1 - 17 : y0 + 3;
        const b1 = up ? y1 - 3 : y0 + 17;
        if (n === 2) {
          ln(X + W / 2 - 3, b0, X + W / 2 - 3, b1, C.hd, 1.4);
          ln(X + W / 2 + 3, b0, X + W / 2 + 3, b1, C.hd, 1.4);
        } else {
          const x = m.open === 'izq' ? X + W - 4 : X + 4;
          ln(x, b0, x, b1, C.hd, 1.4);
        }
      }
      if (n === 1) {
        const hx = m.open === 'izq' ? X + g : X + W - g;
        it.push({ d: `M${P(hx, y0 + g)}L${P(m.open === 'izq' ? X + W - g : X + g, y0 + sh / 2)}L${P(hx, y1 - g)}`, stroke: shade(C.f, -0.4), sw: 0.4, dash: '3 2' });
      }
    } else if (seg.t === 'drawer') {
      rect(X + g, y0 + g, W - 2 * g, sh - 2 * g, C.f);
      if (hstyle === 'bar') ln(X + W * 0.36, y0 + 4, X + W * 0.64, y0 + 4, C.hd, 1.4);
    } else if (seg.t === 'oven') {
      rect(X + g, y0 + g, W - 2 * g, sh - 2 * g, '#2d2c2b');
      rect(X + W * 0.08, y0 + sh * 0.3, W * 0.84, sh * 0.58, '#4a4f52');
      rect(X + W * 0.06, y0 + sh * 0.07, W * 0.88, sh * 0.13, '#9ea2a3');
    } else if (seg.t === 'open') {
      rect(X + 1.8, y0 + 0.5, W - 3.6, sh - 1, shade(C.b, -0.3));
      const k = seg.rod ? 2 : 4;
      for (let i = 1; i < k; i++) ln(X + 1.8, y0 + (sh * i) / k, X + W - 1.8, y0 + (sh * i) / k, shade(C.b, -0.05), 1.6);
      if (seg.rod) ln(X + 4, y0 + 7, X + W - 4, y0 + 7, '#9ea2a3', 1.6);
    }
    if (hstyle === 'gola' && (seg.t === 'door' || seg.t === 'drawer') && m.type !== 'upper') ln(X, y0 + 0.6, X + W, y0 + 0.6, '#2a2928', 1.2);
  }
}

export function elev(p: ProjectData, wall: 'A' | 'B' | 'C' | 'D', materials: Record<string, MaterialDefinition>, opts: { altos?: boolean; cotas?: boolean; sel?: number | null } = {}): Drawing {
  const it: DrawItem[] = [];
  const len = wall === 'A' || wall === 'D' ? p.room.A : p.room.B;
  const H = p.room.H;
  const zoc = zocaloCm(p.prefs.zocalo);
  const hstyle = handleOf(p.prefs.apertura);
  const Y = (z: number) => H - z;
  const rect = (x: number, y: number, w: number, h: number, fill: string, stroke?: string, sw?: number) =>
    it.push({ d: `M${P(x, y)}L${P(x + w, y)}L${P(x + w, y + h)}L${P(x, y + h)}Z`, fill, stroke, sw });
  const ln = (x1: number, y1: number, x2: number, y2: number, stroke: string, sw: number) => it.push({ d: `M${P(x1, y1)}L${P(x2, y2)}`, stroke, sw });
  const tx = (x: number, y: number, s: string, ex: Partial<DrawItem> = {}) => it.push({ t: 'text', x, y, s, fs: 8, ...ex });
  rect(0, 0, len, H, '#f2efea', 'none', 0);
  rect(-10, -10, 10, H + 10, INK);
  rect(len, -10, 10, H + 10, INK);
  rect(-10, -10, len + 20, 10, INK);
  ln(-30, H, len + 30, H, INK, 2);
  for (const op of p.ops.filter((o) => o.wall === wall)) {
    const z0 = op.t === 'ventana' ? (op.z ?? 110) : 0;
    rect(op.pos, Y(z0 + op.h), op.w, op.h, op.t === 'ventana' ? '#dfe6e8' : '#e3ddd4', INK, 0.8);
    if (op.t === 'ventana') ln(op.pos + op.w / 2, Y(z0 + op.h), op.pos + op.w / 2, Y(z0), INK, 0.6);
  }
  const ms = p.mods.filter((m) => m.wall === wall && (opts.altos !== false || (m.type !== 'upper' && m.type !== 'hood')));
  for (const m of ms) {
    const C = cols(m, p.mats, materials);
    const [z0, z1] = zr(m, zoc);
    if ((m.type === 'base' || m.type === 'tall') && zoc > 0) rect(m.pos!, Y(zoc), m.w, zoc, '#3b3936', 'none', 0);
    front2D(m, m.pos!, Y(z1), m.w, z1 - z0, C, hstyle, it, m.id);
    if (m.type === 'hood') rect(m.pos! + m.w / 2 - 15, 0, 30, Y(z1), '#d0d3d4', '#8f9394', 0.6);
    if (m.type === 'base') rect(m.pos!, Y(z1 + 4), m.w, 4, C.c, shade(C.c, -0.3), 0.6);
    const top = m.type === 'base' ? z1 + 4 : z1;
    const bot = m.type === 'upper' || m.type === 'hood' ? z0 : 0;
    if (opts.sel === m.id) rect(m.pos!, Y(top), m.w, top - bot, 'rgba(236,48,19,.08)', ACC, 1.8);
    if (m.type !== 'hood') {
      it.push({ t: 'c', cx: m.pos! + m.w / 2, cy: Y(top) - 11, r: 7, fill: opts.sel === m.id ? ACC : INK, mid: m.id });
      tx(m.pos! + m.w / 2, Y(top) - 10.5, String(m.id), { fill: '#fff', fs: 7.5, fw: 800 });
    }
  }
  if (opts.cotas !== false) {
    const fl = ms.filter((m) => m.type !== 'upper' && m.type !== 'hood').sort((a, b) => a.pos! - b.pos!);
    const seg = (t0: number, t1: number, y: number, lbl: string) => {
      ln(t0, y, t1, y, INK, 0.6);
      ln(t0, y - 4, t0, y + 4, INK, 0.6);
      ln(t1, y - 4, t1, y + 4, INK, 0.6);
      tx((t0 + t1) / 2, y + 8, lbl, { fs: 7.5 });
    };
    for (const m of fl) seg(m.pos!, m.pos! + m.w, H + 16, String(m.w * 10));
    seg(0, len, H + 38, `${len * 10} mm`);
    const x = len + 24;
    const marks = [0, zoc, zoc + 80, 150, 220, H].filter((v, i, a) => a.indexOf(v) === i);
    ln(x, Y(0), x, Y(H), INK, 0.6);
    for (const z of marks) {
      ln(x - 4, Y(z), x + 4, Y(z), INK, 0.6);
      tx(x + 8, Y(z), String(z * 10), { fs: 7.5, anchor: 'start' });
    }
  }
  return { items: it, vb: [-40, -30, len + 110, H + 90] };
}
