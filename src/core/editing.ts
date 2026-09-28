// Editor actions — ported 1:1 from the prototype (setDim, ranges, freeSpot, addFromLib, remove, applyMat, fronts).
// Pure functions: they take the project and return a new one (the caller keeps undo history).
import { footprint, geo } from './geometry';
import type { ModuleInstance, ProjectData } from './schema';
import type { MaterialGroup, ModuleDefinition, ModuleShape, WallId } from './types';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const isFloor = (x: { type: string }) => x.type !== 'upper' && x.type !== 'hood';

export type Dim = 'w' | 'h' | 'd';

/** Width range for a module uploaded as a 3D model: the model is stretched to fit, from half to double its width. */
export const modelWidthRange = (w: number): [number, number] => [Math.max(10, Math.round(w / 2)), Math.min(1000, Math.max(Math.round(w * 2), 30))];

export function ranges(m: Pick<ModuleInstance, 'type' | 'rw'> & { glb?: string; w?: number }): Record<Dim, [number, number]> {
  const t = m.type;
  // Models uploaded before 1.15.1 were saved with a single width (min = max); they can be resized too.
  const fixedModel = m.glb && (!m.rw || m.rw[0] === m.rw[1]);
  return {
    w: fixedModel ? modelWidthRange(m.rw?.[0] ?? m.w ?? 60) : (m.rw ?? [30, 120]),
    h: t === 'tall' ? [180, 240] : t === 'upper' ? [35, 100] : t === 'fridge' ? [170, 200] : t === 'hood' ? [25, 25] : [60, 80],
    d: t === 'upper' ? [25, 40] : t === 'hood' ? [50, 50] : [45, 65],
  };
}

/** Changes one dimension; widening pushes the following modules on the same wall and level. */
export function setDim(p: ProjectData, id: number, key: Dim, value: number): ProjectData {
  const m = p.mods.find((x) => x.id === id);
  if (!m) return p;
  const r = ranges(m)[key];
  const val = Math.max(r[0], Math.min(r[1], Math.round(value || 0)));
  const delta = key === 'w' ? val - m.w : 0;
  const mods = p.mods.map((x) => {
    if (x.id === m.id) return { ...x, [key]: val };
    if (delta && x.wall === m.wall && m.wall !== 'F' && isFloor(x) === isFloor(m) && (x.pos ?? 0) >= (m.pos ?? 0) + m.w - 0.5) return { ...x, pos: (x.pos ?? 0) + delta };
    return x;
  });
  return { ...p, mods };
}

export type Spot = { wall: WallId; pos: number } | { wall: 'F'; x: number; y: number };

export function freeSpot(p: ProjectData, tpl: Pick<ModuleShape, 'type' | 'w'>): Spot | null {
  const up = tpl.type === 'upper';
  const lvl = (x: ModuleInstance) => (up ? x.type === 'upper' || x.type === 'hood' || x.type === 'tall' || x.type === 'fridge' : isFloor(x));
  const walls: [WallId, number, number][] = [
    ['A', p.room.A, 0],
    ['B', p.room.B, p.mods.some((x) => x.wall === 'A' && lvl(x) && x.pos === 0) ? (up ? 35 : 60) : 0],
  ];
  for (const [w, len, start] of walls) {
    const occ = p.mods.filter((x) => x.wall === w && lvl(x)).map((x) => [x.pos ?? 0, (x.pos ?? 0) + x.w] as [number, number]);
    if (up) for (const o of p.ops) if (o.wall === w && o.t === 'ventana') occ.push([o.pos, o.pos + o.w]);
    occ.sort((a, b) => a[0] - b[0]);
    let cur = start;
    for (const [a, b] of occ) {
      if (a - cur >= tpl.w) return { wall: w, pos: cur };
      cur = Math.max(cur, b);
    }
    if (len - cur >= tpl.w) return { wall: w, pos: cur };
  }
  if (up) return null;
  const isl = p.mods.filter((x) => x.wall === 'F');
  const x0 = isl.length ? Math.max(...isl.map((x) => (x.x ?? 0) + x.w)) : 130;
  return { wall: 'F', x: x0, y: p.room.B - 125 };
}

/** Catalogue entry → the template the editor places (prototype LIB shape). */
export function templateOf(def: ModuleDefinition): ModuleShape & { moduleVersion: number } {
  return {
    code: def.code,
    name: def.name,
    cat: def.cat,
    type: def.type,
    w: def.w,
    h: def.h,
    d: def.d,
    fr: clone(def.fr),
    rw: def.rw ?? [def.w, def.w],
    ...(def.sink ? { sink: def.sink } : {}),
    ...(def.cook ? { cook: def.cook } : {}),
    ...(def.range ? { range: 1 } : {}),
    ...(def.fd ? { fd: def.fd } : {}),
    ...(def.appl ? { appl: 1 } : {}),
    ...(def.oven ? { oven: 1 } : {}),
    ...(def.glb ? { glb: def.glb } : {}),
    ...(def.panels?.length ? { panels: clone(def.panels), pdim: def.pdim } : {}),
    ...(def.draw ? { draw: def.draw } : {}),
    moduleVersion: def.version,
  };
}

export const nextId = (p: ProjectData) => p.mods.reduce((a, x) => Math.max(a, x.id), 0) + 1;

/** Adds a module in the first free spot. Returns null when there is no room (uppers never go to the island). */
export function addModule(p: ProjectData, tpl: ModuleShape): { project: ProjectData; id: number; spot: Spot } | null {
  const spot = freeSpot(p, tpl);
  if (!spot) return null;
  const id = nextId(p);
  const nm = { ...clone(tpl), ...spot, id } as ModuleInstance;
  return { project: { ...p, mods: [...p.mods, nm] }, id, spot };
}

/** Replaces a module keeping its id and position; width is clamped to the new template's range. */
export function replaceModule(p: ProjectData, id: number, tpl: ModuleShape): ProjectData {
  const old = p.mods.find((x) => x.id === id);
  if (!old) return p;
  const rw = tpl.rw ?? [tpl.w, tpl.w];
  const w = Math.max(rw[0], Math.min(rw[1], old.w));
  const nm = { ...clone(tpl), id: old.id, wall: old.wall, pos: old.pos, x: old.x, y: old.y, w } as ModuleInstance;
  return { ...p, mods: p.mods.map((x) => (x.id === id ? nm : x)) };
}

export function duplicateModule(p: ProjectData, id: number) {
  const m = p.mods.find((x) => x.id === id);
  if (!m) return null;
  const { wall: _w, pos: _p, x: _x, y: _y, id: _i, ...rest } = m;
  return addModule(p, { ...(rest as unknown as ModuleShape), rw: m.rw ?? [m.w, m.w] });
}

export const removeModule = (p: ProjectData, id: number): ProjectData => ({ ...p, mods: p.mods.filter((x) => x.id !== id) });

/** Applies a material to the whole project or (cuerpo/frentes only) to one module. */
export function applyMaterial(p: ProjectData, group: MaterialGroup, code: string, moduleId?: number | null): ProjectData {
  if (moduleId && (group === 'cuerpo' || group === 'frentes')) {
    const key = group === 'cuerpo' ? 'cue' : 'fre';
    return { ...p, mods: p.mods.map((x) => (x.id === moduleId ? { ...x, [key]: code } : x)) };
  }
  return { ...p, mats: { ...p.mats, [group]: code } };
}

/** Front count control of the properties panel: drawer stacks 1–5, doors 1–2. */
export function frontInfo(m: ModuleInstance) {
  const allDrawers = m.fr.length > 0 && m.fr.every((f) => f.t === 'drawer');
  const door = m.fr.find((f) => f.t === 'door');
  if (allDrawers) return { kind: 'Cajones' as const, count: m.fr.length, min: 1, max: 5 };
  if (door) return { kind: 'Puertas' as const, count: door.n || 1, min: 1, max: 2 };
  return null;
}

export function setFrontCount(p: ProjectData, id: number, count: number): ProjectData {
  const mods = p.mods.map((m) => {
    if (m.id !== id) return m;
    const info = frontInfo(m);
    if (!info) return m;
    const n = Math.max(info.min, Math.min(info.max, count));
    if (info.kind === 'Cajones') return { ...m, fr: Array.from({ length: n }, () => ({ t: 'drawer' as const, f: 1 / n })) };
    let done = false;
    return { ...m, fr: m.fr.map((f) => (f.t === 'door' && !done ? ((done = true), { ...f, n }) : f)) };
  });
  return { ...p, mods };
}

export function updateModule(p: ProjectData, id: number, patch: Partial<ModuleInstance>): ProjectData {
  return {
    ...p,
    mods: p.mods.map((m) => {
      if (m.id !== id) return m;
      const next = { ...m, ...patch } as ModuleInstance;
      for (const k of Object.keys(patch) as (keyof ModuleInstance)[]) if (patch[k] === undefined) delete (next as Record<string, unknown>)[k as string];
      return next;
    }),
  };
}

// ---------- moving ----------
export type Place = { wall: 'A' | 'B' | 'C' | 'D'; pos: number } | { wall: 'F'; x: number; y: number; rot?: number };

/** Distance (cm) within which a moved module snaps to a corner or to the edge of a neighbour. */
export const SNAP_CM = 4;

/**
 * Moves a module along a wall (kept inside it and snapped to corners and neighbours on the same level) or to
 * a free-standing spot (inside the room). Widths never change; overlaps are left to validation to flag.
 */
export function moveModule(p: ProjectData, id: number, to: Place, snap = SNAP_CM): ProjectData {
  const m = p.mods.find((x) => x.id === id);
  if (!m) return p;
  const { A, B } = p.room;
  const snapTo = (v: number, targets: number[], lo: number, hi: number) => {
    const c = Math.max(lo, Math.min(hi, v));
    let best = c;
    let dist = snap + 1e-9;
    for (const t of targets) {
      if (t < lo - 1e-9 || t > hi + 1e-9) continue;
      const d = Math.abs(c - t);
      if (d <= dist) {
        best = t;
        dist = d;
      }
    }
    return Math.round(best);
  };
  let patch: Partial<ModuleInstance>;
  if (to.wall === 'F') {
    const rot = to.rot ?? (m.wall === 'F' ? m.rot : undefined);
    const side = footprint(m.w, m.d, rot);
    const hiX = Math.max(0, A - side[0]!);
    const hiY = Math.max(0, B - side[1]!);
    patch = { wall: 'F', pos: undefined, x: snapTo(to.x, [0, hiX], 0, hiX), y: snapTo(to.y, [0, hiY], 0, hiY), rot: rot || undefined };
  } else {
    const len = to.wall === 'A' || to.wall === 'D' ? A : B;
    const hi = Math.max(0, len - m.w);
    const neighbours = p.mods.filter((x) => x.id !== id && x.wall === to.wall && isFloor(x) === isFloor(m) && x.pos != null);
    const targets = [0, hi, ...neighbours.flatMap((x) => [x.pos! - m.w, x.pos! + x.w])];
    patch = { wall: to.wall, pos: snapTo(to.pos, targets, 0, hi), x: undefined, y: undefined, rot: undefined };
  }
  return {
    ...p,
    mods: p.mods.map((x) => {
      if (x.id !== id) return x;
      const next = { ...x, ...patch };
      for (const k of ['pos', 'x', 'y', 'rot'] as const) if (next[k] === undefined) delete next[k];
      return next;
    }),
  };
}

/** Walls in turning order (clockwise seen from above): a wall module turned 90° goes to the next one. */
const NEXT_WALL = { A: 'C', C: 'D', D: 'B', B: 'A' } as const;

/** Orientation (as a free module's rot) of a module standing on each wall: its front faces into the room. */
const WALL_ROT = { A: 0, B: 90, D: 180, C: 270 } as const;
/** Degrees in [0, 360), rounded to tenths. */
export const normDeg = (deg: number) => {
  const v = Math.round((((deg % 360) + 360) % 360) * 10) / 10;
  return v >= 360 ? 0 : v;
};

/**
 * Turns a module on itself, around its centre, by `deg` degrees (any angle). A floor module on a wall comes off it
 * (free standing, like a peninsula) already turned; wall-hung units (uppers, hoods) can't stand free, so a turn
 * sends them to the next wall.
 */
export function rotateModule(p: ProjectData, id: number, deg = 90, snap = SNAP_CM): ProjectData {
  const m = p.mods.find((x) => x.id === id);
  if (!m) return p;
  if (m.wall !== 'F' && !isFloor(m)) return moveModule(p, id, { wall: NEXT_WALL[m.wall], pos: m.pos ?? 0 }, snap);
  return setRotation(p, id, (m.wall === 'F' ? (m.rot ?? 0) : WALL_ROT[m.wall]) + deg, snap);
}

/** Sets a floor module's turn to `deg` (absolute), keeping its centre where it is; it becomes free standing. */
export function setRotation(p: ProjectData, id: number, deg: number, snap = SNAP_CM): ProjectData {
  const m = p.mods.find((x) => x.id === id);
  if (!m || (m.wall !== 'F' && !isFloor(m))) return p;
  const g = geo(m, p.room);
  const rot = normDeg(deg);
  const [fw, fh] = footprint(m.w, m.d, rot);
  return moveModule(p, id, { wall: 'F', x: (g.x0 + g.x1) / 2 - fw / 2, y: (g.y0 + g.y1) / 2 - fh / 2, rot }, snap);
}

/** How close (cm) the back of a free module must come to a wall to stand on it again. */
export const WALL_STICK_CM = 12;
/** How far (cm) from its wall a floor module must be dragged to come off it and stand free. */
export const WALL_LEAVE_CM = 30;

/**
 * Where a module goes when dragged so its centre is at (cx, cy) cm in the room. Floor modules go anywhere: off their
 * wall into the room once dragged away from it, and back onto a wall when their back comes close to it (facing the
 * room). Wall-hung units follow the pointer along the nearest wall.
 */
export function placeAt(p: ProjectData, id: number, cx: number, cy: number): Place | null {
  const m = p.mods.find((x) => x.id === id);
  if (!m) return null;
  const { A, B } = p.room;
  const free = (rot: number): Place => {
    const [fw, fh] = footprint(m.w, m.d, rot);
    return { wall: 'F', x: cx - fw / 2, y: cy - fh / 2, ...(rot ? { rot } : {}) };
  };
  if (m.wall === 'F') {
    const rot = m.rot ?? 0;
    const [fw, fh] = footprint(m.w, m.d, rot);
    const x = cx - fw / 2;
    const y = cy - fh / 2;
    // Back against a wall (its front facing the room): it stands on that wall again.
    if (rot === 0 && y <= WALL_STICK_CM) return { wall: 'A', pos: x };
    if (rot === 90 && x <= WALL_STICK_CM) return { wall: 'B', pos: y };
    if (rot === 180 && B - (y + fh) <= WALL_STICK_CM) return { wall: 'D', pos: x };
    if (rot === 270 && A - (x + fw) <= WALL_STICK_CM) return { wall: 'C', pos: y };
    return free(rot);
  }
  const dist = { A: cy, B: cx, C: A - cx, D: B - cy } as const;
  // Another wall takes it only when clearly closer (no flicker at the corners).
  const wall = (['A', 'B', 'C', 'D'] as const).reduce((best, w) => (dist[w] + 20 < dist[best] ? w : best), m.wall as 'A' | 'B' | 'C' | 'D');
  // A floor module dragged away from every wall stands free, still facing the same way.
  if (isFloor(m) && dist[wall] - m.d / 2 > WALL_LEAVE_CM) return free(WALL_ROT[m.wall as 'A']);
  return { wall, pos: (wall === 'A' || wall === 'D' ? cx : cy) - m.w / 2 };
}

/** Where a module stands, as a Place (islands have x/y, the rest a wall and a distance from its corner). */
export const placeOf = (m: Pick<ModuleInstance, 'wall' | 'pos' | 'x' | 'y' | 'rot'>): Place =>
  m.wall === 'F' ? { wall: 'F', x: m.x ?? 0, y: m.y ?? 0, ...(m.rot ? { rot: m.rot } : {}) } : { wall: m.wall, pos: m.pos ?? 0 };
