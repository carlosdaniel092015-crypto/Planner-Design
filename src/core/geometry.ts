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
}

export interface RoomSize {
  A: number;
  B: number;
}

/**
 * Footprint in plan coordinates (cm): wall A runs along x at y=0, wall B along y at x=0,
 * wall C along y at x=A, wall D along x at y=B (C and D need the room size); F is free-standing.
 */
export function geo(m: Placeable, room?: RoomSize) {
  if (m.wall === 'A') return { x0: m.pos!, x1: m.pos! + m.w, y0: 0, y1: m.d };
  if (m.wall === 'B') return { x0: 0, x1: m.d, y0: m.pos!, y1: m.pos! + m.w };
  if (m.wall === 'C') return { x0: (room?.A ?? 0) - m.d, x1: room?.A ?? 0, y0: m.pos!, y1: m.pos! + m.w };
  if (m.wall === 'D') return { x0: m.pos!, x1: m.pos! + m.w, y0: (room?.B ?? 0) - m.d, y1: room?.B ?? 0 };
  return { x0: m.x!, x1: m.x! + m.w, y0: m.y!, y1: m.y! + m.d };
}

/** Length of a wall (A and D run along x, B and C along y). */
export const wallLength = (wall: 'A' | 'B' | 'C' | 'D', room: RoomSize) => (wall === 'A' || wall === 'D' ? room.A : room.B);

/** Vertical range [z0, z1] in cm; `zoc` is the plinth height. */
export function zr(m: Pick<Placeable, 'type' | 'h'>, zoc: number): [number, number] {
  if (m.type === 'upper') return [150, 150 + m.h];
  if (m.type === 'fridge') return [0, m.h];
  if (m.type === 'hood') return [150, 150 + m.h];
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
