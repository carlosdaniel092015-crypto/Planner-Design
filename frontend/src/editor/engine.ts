// Bridges the React editor with the prototype's 3D renderer (public/planner-3d.js) and builds
// small drawings (module front thumbnails) from the shared core.
import { type Drawing, type DrawItem, front2D, geo, type ModuleInstance, type ProjectData, zocaloCm, zr } from '@core';
import type { CatalogMaterial } from '../api';

/** three.js files vendored in public/vendor (the renderer loads unpkg otherwise). */
const THREE_FILES = [
  'build/three.module.js',
  'build/three.core.js',
  'examples/jsm/controls/OrbitControls.js',
  'examples/jsm/environments/RoomEnvironment.js',
  'examples/jsm/loaders/GLTFLoader.js',
  'examples/jsm/geometries/RoundedBoxGeometry.js',
  'examples/jsm/utils/BufferGeometryUtils.js',
  'examples/jsm/utils/SkeletonUtils.js',
];

interface ProtoMat {
  name: string;
  type: string;
  c: string;
  wood?: number;
  img?: string;
  tile?: number;
  rough?: number;
  user?: number;
}

declare global {
  interface Window {
    SPEngine?: { MATS: Record<string, ProtoMat>; geo: (m: Parameters<typeof geo>[0]) => ReturnType<typeof geo>; zr: typeof zr; room: { A: number; B: number } };
    __resources?: Record<string, string>;
  }
}

/** Keeps window.SPEngine.MATS in sync with the organisation's catalogue (the renderer reads it). */
export function installEngine(materials: CatalogMaterial[]) {
  const MATS: Record<string, ProtoMat> = {};
  for (const m of materials) {
    MATS[m.code] = {
      name: m.name,
      type: m.type,
      c: m.color,
      wood: m.grain !== 'ninguna' ? 1 : undefined,
      ...(m.source === 'subido' && m.maps.baseColor ? { img: m.maps.baseColor.url, tile: m.sizeWcm ?? 60, rough: m.roughness ?? 0.5, user: 1 } : {}),
    };
  }
  if (!MATS.blanco) MATS.blanco = { name: 'Blanco', type: 'Melamina', c: '#eeebe6' };
  const room = window.SPEngine?.room ?? { A: 360, B: 300 };
  // geo() needs the room size for walls C and D; sceneCfg() keeps it current.
  window.SPEngine = { MATS, geo: (m) => geo(m, window.SPEngine?.room), zr, room };
  window.__resources = Object.fromEntries(THREE_FILES.map((p) => [`th_${p.replace(/[^a-z0-9]/gi, '_')}`, `/vendor/three/${p}`]));
}

export interface Viewer {
  update(cfg: unknown): Promise<void>;
  dispose(): void;
  zoomBy(f: number): void;
  /** az: radians, or 'auto' for the angle that faces the most fronts. */
  fit(instant?: boolean, az?: number | 'auto'): void;
  setAngle(deg: number): void;
  /** Opens (true) or closes all doors and drawers, animated. */
  setOpen(open: boolean): void;
}
interface Renderer {
  init(): Promise<void>;
  createViewer(host: HTMLElement, opts: { onSelect?: (id: number | null) => void; onReady?: () => void }): Promise<Viewer>;
  snapshot(cfg: unknown, o: SnapOptions): Promise<string | null>;
}

export interface SnapOptions {
  w: number;
  h: number;
  /** Camera azimuth in degrees (45 = corner view). */
  ang?: number;
  /** Frame one module (detail view). */
  focusId?: number;
  /** Render with doors and drawers open. */
  open?: boolean;
}

const snapCache = new Map<string, Promise<string | null>>();
/** Offscreen photo-real render (JPEG data URL), cached by scene + options; null when WebGL is unavailable. */
export function snapshot(cfg: unknown, o: SnapOptions): Promise<string | null> {
  const key = JSON.stringify([cfg, o]);
  let p = snapCache.get(key);
  if (!p) {
    p = loadRenderer()
      .then((r) => r.snapshot(cfg, o))
      .catch(() => null);
    snapCache.set(key, p);
    if (snapCache.size > 40) snapCache.delete(snapCache.keys().next().value!);
  }
  return p;
}

let rendererP: Promise<Renderer> | null = null;
export function loadRenderer(): Promise<Renderer> {
  rendererP ??= import(/* @vite-ignore */ new URL('/planner-3d.js', window.location.origin).href) as Promise<Renderer>;
  return rendererP;
}

export const handleOf = (a?: string) => (a === 'Gola' ? 'gola' : a === 'Push' ? 'none' : 'bar');

/** Scene config the renderer expects (prototype sceneCfg()). */
export function sceneCfg(p: ProjectData, extra: { sel: number | null; cotas: boolean; altos: boolean; dark: boolean }) {
  if (window.SPEngine) window.SPEngine.room = { A: p.room.A, B: p.room.B };
  return {
    mods: p.mods,
    mats: p.mats,
    room: p.room,
    ops: p.ops,
    handle: handleOf(p.prefs.apertura),
    zoc: zocaloCm(p.prefs.zocalo),
    kitchen: p.ptype === 'cocina',
    sel: extra.sel,
    cotas: extra.cotas,
    altos: extra.altos,
    bg: extra.dark ? '#131211' : '#d3cec6',
  };
}

type Colors = { f: string; b: string; c: string; hd: string };
export function colorsFor(m: Pick<ModuleInstance, 'cue' | 'fre'>, mats: ProjectData['mats'], byCode: Record<string, { color: string }>): Colors {
  const col = (code: string, fb: string) => byCode[code]?.color ?? fb;
  return { f: col(m.fre || mats.frentes, '#c49a6c'), b: col(m.cue || mats.cuerpo, '#eeebe6'), c: col(mats.encimera, '#e9e7e2'), hd: col(mats.jaladeras, '#2a2928') };
}

/** Prototype frontThumb(): the module's front elevation with some padding. */
export function frontThumb(m: ModuleInstance, mats: ProjectData['mats'], byCode: Record<string, { color: string }>, apertura?: string): Drawing {
  const items: DrawItem[] = [];
  front2D(m, 0, 0, m.w, m.h, colorsFor(m, mats, byCode), handleOf(apertura), items);
  const pad = Math.max(m.w, m.h) * 0.08;
  return { items, vb: [-pad, -pad, m.w + pad * 2, m.h + pad * 2] };
}
