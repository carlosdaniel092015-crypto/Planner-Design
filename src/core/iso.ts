// Isometric scene as a JSON draw list — ported 1:1 from the prototype's iso() (planner-engine.js).
// Used for thumbnails and as a lightweight fallback when WebGL is not available.
import type { DrawItem, Drawing } from './drawing';
import { geo, shade, zocaloCm, zr } from './geometry';
import type { ModuleInstance, ProjectData } from './schema';
import type { MaterialDefinition } from './types';

const ACC = '#ec3013';
const INK = '#201e1d';

export interface IsoOptions {
  ang?: number;
  zoc?: number;
  altos?: boolean;
  sel?: number | null;
  cotas?: boolean;
  pad?: number;
  zoom?: number;
  /** [x, y, z, width] in scene cm to frame a detail. */
  focus?: [number, number, number, number];
}

export function iso(p: ProjectData, materials: Record<string, MaterialDefinition>, o: IsoOptions = {}): Drawing {
  const mods = p.mods;
  const a = ((o.ang || 45) * Math.PI) / 180;
  const s = Math.sin(a);
  const c = Math.cos(a);
  const P = (x: number, y: number, z: number): [number, number] => [x * c - y * s, (x * s + y * c) * 0.55 - z * 0.83];
  const it: DrawItem[] = [];
  const bx = [1e9, 1e9, -1e9, -1e9];
  const pt = (q3: [number, number, number]) => {
    const q = P(q3[0], q3[1], q3[2]);
    bx[0] = Math.min(bx[0]!, q[0]);
    bx[1] = Math.min(bx[1]!, q[1]);
    bx[2] = Math.max(bx[2]!, q[0]);
    bx[3] = Math.max(bx[3]!, q[1]);
    return `${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
  };
  type V3 = [number, number, number];
  const poly = (ps: V3[], fill: string, stroke?: string, sw?: number, ex: Partial<DrawItem> = {}) => it.push({ d: `M${ps.map(pt).join('L')}Z`, fill, stroke, sw, ...ex });
  const line = (ps: V3[], stroke: string, sw: number, ex: Partial<DrawItem> = {}) => it.push({ d: `M${ps.map(pt).join('L')}`, stroke, sw, ...ex });
  const text = (q3: V3, str: string, ex: Partial<DrawItem> = {}) => {
    const q = P(q3[0], q3[1], q3[2]);
    it.push({ t: 'text', x: q[0], y: q[1], s: str, fs: 10, halo: '#ffffff', ...ex });
  };
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, col: string, ex: Partial<DrawItem> = {}) => {
    const e = shade(col, -0.3);
    poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], shade(col, 0.12), e, 0.35, ex);
    poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], col, e, 0.35, ex);
    poly([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], shade(col, -0.16), e, 0.35, ex);
  };
  const { A, B, H } = p.room;
  const T = 12;
  const zoc = o.zoc ?? zocaloCm(p.prefs.zocalo);
  poly([[0, 0, 0], [A, 0, 0], [A, B, 0], [0, B, 0]], '#dcd5ca', '#c9c0b3', 0.4);
  for (let x = 50; x < A; x += 50) line([[x, 0, 0], [x, B, 0]], '#cfc6b8', 0.4);
  for (let y = 50; y < B; y += 50) line([[0, y, 0], [A, y, 0]], '#cfc6b8', 0.4);
  poly([[0, 0, 0], [A, 0, 0], [A, 0, H], [0, 0, H]], '#f2efea', '#d3cdc4', 0.4);
  poly([[0, 0, 0], [0, B, 0], [0, B, H], [0, 0, H]], '#e5e0d9', '#d3cdc4', 0.4);
  poly([[-T, -T, H], [A, -T, H], [A, 0, H], [0, 0, H]], '#bdb6ac');
  poly([[-T, -T, H], [0, 0, H], [0, B, H], [-T, B, H]], '#bdb6ac');
  poly([[A, -T, 0], [A, 0, 0], [A, 0, H], [A, -T, H]], '#cbc4ba');
  poly([[-T, B, 0], [0, B, 0], [0, B, H], [-T, B, H]], '#d6d0c7');
  for (const op of p.ops) {
    if (op.wall !== 'A' && op.wall !== 'B') continue;
    const z0 = op.t === 'ventana' ? (op.z ?? 110) : 0;
    const z1 = z0 + op.h;
    const Q = (t: number, z: number): V3 => (op.wall === 'A' ? [t, 0.3, z] : [0.3, t, z]);
    const t0 = op.pos;
    const t1 = op.pos + op.w;
    const tm = (t0 + t1) / 2;
    if (op.t === 'ventana') {
      poly([Q(t0, z0), Q(t1, z0), Q(t1, z1), Q(t0, z1)], '#d3dcde', '#ffffff', 2.2);
      line([Q(tm, z0), Q(tm, z1)], '#ffffff', 1.6);
      poly([Q(t0 + 4, z0 + 4), Q(tm - 4, z0 + 4), Q(tm - 4, z0 + op.h * 0.45)], 'rgba(255,255,255,.35)');
    } else poly([Q(t0, z0), Q(t1, z0), Q(t1, z1), Q(t0, z1)], '#cfc6b8', '#ffffff', 2);
  }
  const key = (m: ModuleInstance) => {
    const g = geo(m);
    return ((g.x0 + g.x1) / 2) * s + ((g.y0 + g.y1) / 2) * c - (m.type === 'upper' || m.type === 'hood' ? 1 : 0);
  };
  const list = mods.filter((m) => o.altos !== false || (m.type !== 'upper' && m.type !== 'hood')).slice().sort((x, y) => key(x) - key(y));
  const hstyle = p.prefs.apertura === 'Gola' ? 'gola' : p.prefs.apertura === 'Push' ? 'none' : 'bar';
  const col = (code: string, fb: string) => materials[code]?.color ?? fb;
  let selM: ModuleInstance | null = null;
  for (const m of list) {
    const g = geo(m);
    const [z0, z1] = zr(m, zoc);
    const C = { f: col(m.fre || p.mats.frentes, '#c49a6c'), b: col(m.cue || p.mats.cuerpo, '#eeebe6'), c: col(p.mats.encimera, '#e9e7e2'), hd: col(p.mats.jaladeras, '#2a2928') };
    const isB = m.wall === 'B';
    const ex: Partial<DrawItem> = { mid: m.id };
    if (o.sel === m.id) selM = m;
    if (m.type !== 'upper' && m.type !== 'hood') poly([[g.x0, g.y0, 0], [g.x1 + 5, g.y0, 0], [g.x1 + 5, g.y1 + 6, 0], [g.x0, g.y1 + 6, 0]], 'rgba(70,50,30,.16)');
    const FP = (u: number, v: number): V3 => (isB ? [g.x1 + 0.3, g.y0 + u * m.w, z0 + v * (z1 - z0)] : [g.x0 + u * m.w, g.y1 + 0.3, z0 + v * (z1 - z0)]);
    const R = (u0: number, u1: number, a0: number, a1: number, fill: string, st?: string, sw?: number) => poly([FP(u0, a0), FP(u1, a0), FP(u1, a1), FP(u0, a1)], fill, st || shade(fill, -0.3), sw || 0.4, ex);
    const L = (u0: number, a0: number, u1: number, a1: number, st: string, sw: number) => line([FP(u0, a0), FP(u1, a1)], st, sw, ex);
    if (m.type === 'hood') {
      const cx = isB ? (g.y0 + g.y1) / 2 : (g.x0 + g.x1) / 2;
      if (isB) {
        box(0, 50, g.y0, g.y1, z0, z0 + 14, '#b9bcbd', ex);
        box(0, 28, cx - 15, cx + 15, z0 + 14, H, '#c6c9ca', ex);
      } else {
        box(g.x0, g.x1, 0, 50, z0, z0 + 14, '#b9bcbd', ex);
        box(cx - 15, cx + 15, 0, 28, z0 + 14, H, '#c6c9ca', ex);
      }
      continue;
    }
    if (m.type === 'fridge') {
      box(g.x0, g.x1, g.y0, g.y1, 0, m.h, '#c5c8c9', ex);
      R(0.01, 0.99, 0.005, 0.615, '#c5c8c9', '#8f9394');
      R(0.01, 0.99, 0.625, 0.995, '#c5c8c9', '#8f9394');
      L(0.1, 0.45, 0.1, 0.58, '#6f7374', 2.2);
      L(0.1, 0.66, 0.1, 0.8, '#6f7374', 2.2);
      continue;
    }
    if (m.type !== 'upper' && zoc > 0) {
      if (isB) box(g.x0, g.x1 - 5, g.y0, g.y1, 0, zoc, '#3b3936');
      else box(g.x0, g.x1, g.y0 + (m.wall === 'F' ? 5 : 0), g.y1 - 5, 0, zoc, '#3b3936');
    }
    box(g.x0, g.x1, g.y0, g.y1, z0, z1, C.b, ex);
    const fh = z1 - z0;
    const gu = 0.25 / m.w;
    const gv = 0.25 / fh;
    let v = 0;
    for (const seg of m.fr) {
      const v0 = v;
      const v1 = v + seg.f;
      v = v1;
      if (seg.t === 'door') {
        const n = seg.n || 1;
        for (let i = 0; i < n; i++) R(i / n + gu, (i + 1) / n - gu, v0 + gv, v1 - gv, C.f);
        if (hstyle === 'bar') {
          const up = m.type === 'upper';
          const b0 = up ? v0 + 3 / fh : v1 - 17 / fh;
          const b1 = up ? v0 + 17 / fh : v1 - 3 / fh;
          if (n === 2) {
            L(0.5 - 3 / m.w, b0, 0.5 - 3 / m.w, b1, C.hd, 1.6);
            L(0.5 + 3 / m.w, b0, 0.5 + 3 / m.w, b1, C.hd, 1.6);
          } else {
            const u = m.open === 'izq' ? 1 - 4 / m.w : 4 / m.w;
            L(u, b0, u, b1, C.hd, 1.6);
          }
        }
      } else if (seg.t === 'drawer') {
        R(gu, 1 - gu, v0 + gv, v1 - gv, C.f);
        if (hstyle === 'bar') L(0.36, v1 - 4 / fh, 0.64, v1 - 4 / fh, C.hd, 1.6);
      } else if (seg.t === 'oven') {
        R(gu, 1 - gu, v0 + gv, v1 - gv, '#2d2c2b');
        R(0.08, 0.92, v0 + seg.f * 0.12, v1 - seg.f * 0.3, '#4a4f52');
        R(0.06, 0.94, v1 - seg.f * 0.2, v1 - seg.f * 0.07, '#9ea2a3');
      } else if (seg.t === 'open') {
        R(0.03, 0.97, v0 + 0.005, v1 - 0.005, shade(C.b, -0.38), shade(C.b, -0.45));
        const k = seg.rod ? 2 : 4;
        for (let i = 1; i < k; i++) L(0.03, v0 + (seg.f * i) / k, 0.97, v0 + (seg.f * i) / k, shade(C.b, -0.05), 1.4);
        if (seg.rod) L(0.06, v1 - 0.08, 0.94, v1 - 0.08, '#9ea2a3', 1.6);
      }
      if (hstyle === 'gola' && (seg.t === 'door' || seg.t === 'drawer') && m.type !== 'upper') L(0, v1 - gv, 1, v1 - gv, '#2a2928', 1.3);
    }
    if (m.type === 'base') {
      const zt = z1 + 4;
      if (isB) box(g.x0, g.x1 + 2, g.y0, g.y1, z1, zt, C.c);
      else if (m.wall === 'F') box(g.x0 - 2, g.x1 + 2, g.y0 - 2, g.y1 + 2, z1, zt, C.c);
      else box(g.x0, g.x1, g.y0, g.y1 + 2, z1, zt, C.c);
      const TP = (u: number, w: number): V3 => (isB ? [g.x0 + w * m.d, g.y0 + u * m.w, zt + 0.1] : [g.x0 + u * m.w, g.y0 + w * m.d, zt + 0.1]);
      const TR = (u0: number, u1: number, w0: number, w1: number, fill: string, st: string) => poly([TP(u0, w0), TP(u1, w0), TP(u1, w1), TP(u0, w1)], fill, st, 0.5, ex);
      if (m.sink) {
        TR(0.14, 0.86, 0.14, 0.8, '#c9cccd', '#8f9394');
        TR(0.19, 0.81, 0.2, 0.74, '#a7abac', '#8f9394');
        const f0 = TP(0.5, 0.06);
        const f1 = TP(0.5, 0.3);
        line([f0, [f0[0], f0[1], zt + 28], [f1[0], f1[1], zt + 28], [f1[0], f1[1], zt + 22]], '#7f8384', 2);
      }
      if (m.cook) {
        TR(0.08, 0.92, 0.15, 0.85, '#232221', '#111');
        for (const q of [[0.28, 0.32], [0.72, 0.32], [0.28, 0.68], [0.72, 0.68]] as const) TR(q[0] - 0.1, q[0] + 0.1, q[1] - 0.1, q[1] + 0.1, 'none', '#5d5e5f');
      }
    }
  }
  if (selM) {
    const m = selM as ModuleInstance;
    const g = geo(m);
    const [z0, z1b] = zr(m, zoc);
    const zt = m.type === 'base' ? z1b + 4 : z1b;
    const zb = m.type === 'upper' || m.type === 'hood' ? z0 : 0;
    const f = 'rgba(236,48,19,.1)';
    poly([[g.x0, g.y0, zt], [g.x1, g.y0, zt], [g.x1, g.y1, zt], [g.x0, g.y1, zt]], f, ACC, 1.6);
    poly([[g.x0, g.y1, zb], [g.x1, g.y1, zb], [g.x1, g.y1, zt], [g.x0, g.y1, zt]], f, ACC, 1.6);
    poly([[g.x1, g.y0, zb], [g.x1, g.y1, zb], [g.x1, g.y1, zt], [g.x1, g.y0, zt]], f, ACC, 1.6);
    if (o.cotas) {
      const isB = m.wall === 'B';
      const zc = zt + 16;
      const E = (u: number, z: number): V3 => (isB ? [g.x1, g.y0 + u, z] : [g.x0 + u, g.y1, z]);
      line([E(0, zc), E(m.w, zc)], ACC, 1.2);
      line([E(0, zc - 5), E(0, zc + 5)], ACC, 1.2);
      line([E(m.w, zc - 5), E(m.w, zc + 5)], ACC, 1.2);
      text(E(m.w / 2, zc + 9), `${m.w * 10} mm`, { fill: ACC, fs: 10.5, fw: 800 });
      const hx: [number, number] = isB ? [g.x1 + 12, g.y0] : [g.x1 + 12, g.y1];
      line([[hx[0], hx[1], zb], [hx[0], hx[1], zt]], ACC, 1.2);
      text([hx[0] + 6, hx[1], (zb + zt) / 2], `${(zt - zb) * 10} mm`, { fill: ACC, fs: 10.5, fw: 800, anchor: 'start' });
    }
  }
  if (o.cotas) {
    const z = H + 22;
    line([[0, -T, z], [A, -T, z]], INK, 0.8);
    line([[0, -T, z - 5], [0, -T, z + 5]], INK, 0.8);
    line([[A, -T, z - 5], [A, -T, z + 5]], INK, 0.8);
    text([A / 2, -T, z + 9], `${A * 10} mm · Muro A`, { fs: 10 });
    line([[-T, 0, z], [-T, B, z]], INK, 0.8);
    line([[-T, B, z - 5], [-T, B, z + 5]], INK, 0.8);
    text([-T, B / 2, z + 9], `${B * 10} mm · Muro B`, { fs: 10 });
  }
  const pad = o.pad ?? 24;
  let vb = [bx[0]! - pad, bx[1]! - pad, bx[2]! - bx[0]! + pad * 2, bx[3]! - bx[1]! + pad * 2];
  if (o.focus) {
    const q = P(o.focus[0], o.focus[1], o.focus[2]);
    vb = [q[0] - o.focus[3] / 2, q[1] - o.focus[3] * 0.33, o.focus[3], o.focus[3] * 0.66];
  }
  if (o.zoom && o.zoom !== 1) {
    const cx = vb[0]! + vb[2]! / 2;
    const cy = vb[1]! + vb[3]! / 2;
    const w = vb[2]! / o.zoom;
    const hh = vb[3]! / o.zoom;
    vb = [cx - w / 2, cy - hh / 2, w, hh];
  }
  return { items: it, vb };
}
