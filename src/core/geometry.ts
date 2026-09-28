// Plan/elevation geometry — ported 1:1 from the prototype (planner-engine.js geo, zr, wallPt, shade).
import type { ModuleType, WallId } from './types';

interface Placeable {
  wall: WallId;
  pos?: number;
  x?: number;
  y?: number;
  w: number;
  d: number;
  h: number;
  type: ModuleType;
  /** Bottom height (cm) of a wall-hung unit placed off the usual 150 cm line, e.g. over the fridge. */
  z?: number;
  /** Free module turned (degrees, any angle): 0 faces wall D, 90 wall C, 180 wall A, 270 wall B. x/y = corner of the box it takes. */
  rot?: number;
}

/** An island turned 90° or 270° takes its depth along x and its width along y. */
export const turned = (m: Pick<Placeable, 'wall' | 'rot'>) => m.wall === 'F' && (m.rot === 90 || m.rot === 270);

export interface RoomSize {
  A: number;
  B: number;
}

/** Size [along x, along y] of the box a free module takes on the floor, turned any angle (degrees). */
export function footprint(w: number, d: number, rot = 0): [number, number] {
  const r = (rot * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  const k = (v: number) => Math.round(v * 100) / 100;
  return [k(w * c + d * s), k(w * s + d * c)];
}

/** Corners (plan cm) of a free module turned any angle: its front edge first (left, right), then the back. */
export function corners(m: Pick<Placeable, 'x' | 'y' | 'w' | 'd' | 'rot'>): [number, number][] {
  const [bw, bh] = footprint(m.w, m.d, m.rot);
  const cx = m.x! + bw / 2;
  const cy = m.y! + bh / 2;
  const r = ((m.rot ?? 0) * Math.PI) / 180;
  // Same turn as the 3D view: the front (local +y, towards wall D at 0°) turns towards wall C at 90°.
  const P = (lx: number, ly: number): [number, number] => [cx + lx * Math.cos(r) + ly * Math.sin(r), cy - lx * Math.sin(r) + ly * Math.cos(r)];
  const hw = m.w / 2;
  const hd = m.d / 2;
  return [P(-hw, hd), P(hw, hd), P(hw, -hd), P(-hw, -hd)];
}

export function geo(m: Placeable, room?: RoomSize) {
  if (m.wall === 'A') return { x0: m.pos!, x1: m.pos! + m.w, y0: 0, y1: m.d };
  if (m.wall === 'B') return { x0: 0, x1: m.d, y0: m.pos!, y1: m.pos! + m.w };
  if (m.wall === 'C') return { x0: (room?.A ?? 0) - m.d, x1: room?.A ?? 0, y0: m.pos!, y1: m.pos! + m.w };
  if (m.wall === 'D') return { x0: m.pos!, x1: m.pos! + m.w, y0: (room?.B ?? 0) - m.d, y1: room?.B ?? 0 };
  if (m.rot) {
    const [bw, bh] = footprint(m.w, m.d, m.rot);
    return { x0: m.x!, x1: m.x! + bw, y0: m.y!, y1: m.y! + bh };
  }
  return { x0: m.x!, x1: m.x! + m.w, y0: m.y!, y1: m.y! + m.d };
}

/** Length of a wall (A and D run along x, B and C along y). */
export const wallLength = (wall: 'A' | 'B' | 'C' | 'D', room: RoomSize) => (wall === 'A' || wall === 'D' ? room.A : room.B);

/** Vertical range [z0, z1] in cm; `zoc` is the plinth height. */
export function zr(m: Pick<Placeable, 'type' | 'h' | 'z'>, zoc: number): [number, number] {
  if (m.type === 'upper') return [m.z ?? 150, (m.z ?? 150) + m.h];
  if (m.type === 'fridge') return [0, m.h];
  if (m.type === 'hood') return [m.z ?? 150, (m.z ?? 150) + m.h];
  return [zoc, zoc + m.h];
}

/** Point along a wall at distance t, n cm into the room. */
export function wallPt(wall: WallId, t: number, n: number, A: number, B: number): [number, number] {
  if (wall === 'A') return [t, n];
  if (wall === 'B') return [n, t];
  if (wall === 'C') return [A - n, t];
  return [t, B - n];
}

export function shade(h: string, k: number) {
  if (h[0] !== '#') return h;
  const c = [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16)).map((v) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)));
  return `#${c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
}

/** Plinth height in cm from prefs.zocalo ("10 cm"). */
export const zocaloCm = (zocalo?: string) => {
  const n = zocalo ? parseFloat(zocalo) : NaN;
  return Number.isFinite(n) ? n : 10;
};

export const isFloor = (m: { type: ModuleType }) => m.type !== 'upper' && m.type !== 'hood';
