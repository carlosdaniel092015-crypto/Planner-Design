// Board parts per module — ported 1:1 from the prototype's parts() (millimetres).
import { BACK_PANEL_MATERIAL, materialLabel } from './materials';
import type { ModelPanel, ModuleInstance, ProjectData } from './schema';
import type { MaterialDefinition } from './types';

export type PartGroup = 'lat' | 'base' | 'trav' | 'top' | 'back' | 'shelf' | 'door' | 'drawer';
export type PartSlot = 'cuerpo' | 'frentes' | 'trasera';

export interface Part {
  ref: number;
  pieza: string;
  cant: number;
  /** Length (mm) */
  L: number;
  /** Width (mm) */
  A: number;
  /** Thickness (mm) */
  esp: number;
  /** Display label, e.g. "Melamina Blanco mate" */
  mat: string;
  matCode: string;
  slot: PartSlot;
  veta: string;
  cantos: string;
  grp: PartGroup;
}

type Mats = ProjectData['mats'];
type ModuleLike = Pick<ModuleInstance, 'w' | 'h' | 'd' | 'type' | 'fr' | 'cue' | 'fre' | 'glb' | 'appl' | 'panels' | 'pdim'>;

// ---------- boards read from an uploaded 3D model ----------
/** Thickest a mesh can be to count as a board (mm); both other sides must be at least BOARD_MIN_SIDE. */
export const BOARD_MAX_THICK = 40;
export const BOARD_MIN_SIDE = 50;
const WORDS: [RegExp, string][] = [
  [/\bfixed shelf\b/gi, 'Entrepaño fijo'],
  [/\bshelf\b/gi, 'Entrepaño'],
  [/\bdoor\b/gi, 'Puerta'],
  [/\bdrawer front\b/gi, 'Frente de cajón'],
  [/\bdrawer\b/gi, 'Cajón'],
  [/\bdivision\b/gi, 'División'],
  [/\bback\b/gi, 'Trasera'],
  [/\btop\b/gi, 'Techo'],
  [/\bbottom\b/gi, 'Base'],
  [/\bside\b/gi, 'Lateral'],
  [/\bleft\b/gi, 'izquierdo'],
  [/\bright\b/gi, 'derecho'],
  [/\bstd\b/gi, ''],
];
/** "Door Std (unica) [1] 6" → "Puerta (unica)": drops exporter indexes and translates common English names. */
export function panelName(raw: string): string {
  let n = raw.replace(/\s*\[\d+\]/g, '').replace(/[\s_]+\d+$/, '').replace(/_/g, ' ');
  for (const [re, to] of WORDS) n = n.replace(re, to);
  n = n.replace(/\s{2,}/g, ' ').trim();
  return (n.charAt(0).toUpperCase() + n.slice(1)).slice(0, 80) || 'Pieza';
}
/** Pieces of a drawer box (its sides, back, bottom) are body, not fronts, even when named after the drawer. */
const BOX_PIECE = /lateral|costado|trasera|fondo|base|suelo|piso|\bback\b|\bside\b|\bbottom\b/i;
const isDrawerName = (n: string) => /caj[oó]n|gaveta|drawer/i.test(n) && (/frente|front/i.test(n) || !BOX_PIECE.test(n));
/** Material slot a board takes from its name and thickness. */
export function panelSlot(name: string, thick: number): PartSlot {
  if (/puerta|door|frente|front/i.test(name) || isDrawerName(name)) return 'frentes';
  if (/trasera|back|fondo/i.test(name) && thick <= 10) return 'trasera';
  return 'cuerpo';
}

export interface PlacedPanel {
  panel: ModelPanel;
  /** [x0, x1, y0, y1, z0, z1] in mm at the module's current size (y = depth from the back, z = height). */
  box: [number, number, number, number, number, number];
  size: [number, number, number];
  /** Axis of the thickness (0 x, 1 y, 2 z). */
  thin: number;
  slot: PartSlot;
}

/**
 * Boards of an uploaded model at the module's current size: the thickness never changes and boards touching
 * a side stay on it; boards spanning side to side grow by what the module grew, the rest stretch in proportion.
 */
export function placedPanels(m: Pick<ModuleInstance, 'w' | 'h' | 'd' | 'panels' | 'pdim'>): PlacedPanel[] {
  if (!m.panels?.length) return [];
  const [w0, h0, d0] = m.pdim ?? [m.w, m.h, m.d];
  const T0 = [w0 * 10, d0 * 10, h0 * 10];
  const T = [m.w * 10, m.d * 10, m.h * 10];
  return m.panels.map((panel) => {
    const thin = panel.s.indexOf(Math.min(...panel.s));
    const pos = [0, 0, 0];
    const size = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
      const k = T[a]! / T0[a]!;
      const p = panel.p[a]!;
      const sz = panel.s[a]!;
      if (a === thin) {
        size[a] = sz;
        pos[a] = Math.abs(p + sz - T0[a]!) < 2 ? T[a]! - sz : p < 2 ? p : (p + sz / 2) * k - sz / 2;
      } else if (p <= BOARD_MAX_THICK + 2 && T0[a]! - (p + sz) <= BOARD_MAX_THICK + 2) {
        // Spans from side to side (floor, back, door…): grows by exactly what the module grew.
        size[a] = Math.max(1, sz + T[a]! - T0[a]!);
        pos[a] = p;
      } else {
        size[a] = sz * k;
        pos[a] = p * k;
      }
    }
    return {
      panel,
      box: [pos[0]!, pos[0]! + size[0]!, pos[1]!, pos[1]! + size[1]!, pos[2]!, pos[2]! + size[2]!],
      size: size as [number, number, number],
      thin,
      slot: panelSlot(panel.n, panel.s[thin]!),
    };
  });
}

/**
 * The uploaded boards are the module's despiece while its fronts are the ones the boards have. Once the doors or
 * drawers are changed in the editor it is broken down like any catalogue module.
 */
export function usesBoards(m: Pick<ModuleInstance, 'w' | 'h' | 'fr' | 'panels' | 'pdim'>): boolean {
  if (!m.panels?.length) return false;
  if (!m.fr.length) return true;
  const own = frontsFromPanels(m);
  return own.length === m.fr.length && own.every((f, i) => f.t === m.fr[i]!.t && (f.n ?? 1) === (m.fr[i]!.n ?? 1) && Math.abs(f.f - m.fr[i]!.f) < 0.02);
}

/** Cut size of a placed board: length, width (the two long sides) and thickness, in whole mm. */
export function panelDims(pp: Pick<PlacedPanel, 'size' | 'thin'>) {
  const sides = [0, 1, 2].filter((a) => a !== pp.thin).map((a) => pp.size[a]!);
  return { L: Math.round(Math.max(...sides)), A: Math.round(Math.min(...sides)), esp: Math.round(pp.size[pp.thin]!) };
}

function panelGroup(name: string, slot: PartSlot): PartGroup {
  if (slot === 'frentes') return isDrawerName(name) ? 'drawer' : 'door';
  if (slot === 'trasera' || /trasera/i.test(name)) return 'back';
  if (/lateral/i.test(name)) return 'lat';
  if (/suelo|base|piso/i.test(name)) return 'base';
  if (/techo/i.test(name)) return 'top';
  return 'shelf';
}

/**
 * Fronts used for the despiece. A module uploaded as a 3D model usually comes without a recipe: it is broken
 * down as a standard box with doors (one up to 60 cm wide, two above), so it still reaches the cut list.
 */
export function frontsOf(m: Pick<ModuleInstance, 'fr' | 'glb' | 'w' | 'h' | 'panels' | 'pdim'>): ModuleInstance['fr'] {
  if (m.fr.length) return m.fr;
  const fromBoards = frontsFromPanels(m);
  if (fromBoards.length) return fromBoards;
  if (m.glb) return [{ t: 'door', n: m.w > 60 ? 2 : 1, f: 1 }];
  return m.fr;
}


/**
 * Native fronts (bottom to top, like the catalogue recipes) of a model built from boards: its front-facing
 * doors and drawers grouped in rows by height. Drawers are the boards named so, or full-width fronts that are
 * wider than tall; side-by-side fronts are doors (n per row).
 */
export function frontsFromPanels(m: Pick<ModuleInstance, 'w' | 'h' | 'panels' | 'pdim'>): ModuleInstance['fr'] {
  const [w0, h0] = m.pdim ?? [m.w, m.h];
  // Fronts are on the front face (the drawer box behind a drawer front is not).
  const face = Math.max(0, ...(m.panels ?? []).map((p) => p.p[1] + p.s[1]));
  const fronts = (m.panels ?? [])
    .map((panel) => ({ panel, thin: panel.s.indexOf(Math.min(...panel.s)) }))
    .filter(({ panel, thin }) => thin === 1 && panel.p[1] + panel.s[1] >= face - 40 && panelSlot(panel.n, panel.s[1]) === 'frentes' && panel.s[0] > 0 && panel.s[2] > 0)
    .map(({ panel }) => ({ n: panel.n, x0: panel.p[0], x1: panel.p[0] + panel.s[0], z0: panel.p[2], z1: panel.p[2] + panel.s[2] }))
    .sort((a, b) => a.z0 - b.z0);
  if (!fronts.length) return [];
  // Rows: fronts overlapping most of their height with the row's first front.
  const rows: (typeof fronts)[] = [];
  for (const f of fronts) {
    const row = rows.find((r) => {
      const ov = Math.min(r[0]!.z1, f.z1) - Math.max(r[0]!.z0, f.z0);
      return ov > 0.5 * Math.min(r[0]!.z1 - r[0]!.z0, f.z1 - f.z0);
    });
    if (row) row.push(f);
    else rows.push([f]);
  }
  const W = w0 * 10;
  const spans = rows.map((r) => {
    const z0 = Math.min(...r.map((f) => f.z0));
    const z1 = Math.max(...r.map((f) => f.z1));
    const wide = r.length === 1 && r[0]!.x1 - r[0]!.x0 > 0.8 * W && r[0]!.x1 - r[0]!.x0 > z1 - z0;
    const drawer = r.every((f) => isDrawerName(f.n)) || (wide && !/puerta|door/i.test(r[0]!.n));
    return { z0, z1, drawer, n: r.length };
  });
  // Fractions of the fronts' height, closing gaps between rows; they add up to 1.
  const bottom = spans[0]!.z0;
  const top = Math.max(spans[spans.length - 1]!.z1, h0 * 10 * 0.5);
  const total = Math.max(1, top - bottom);
  const cuts = spans.map((s, i) => (i === 0 ? bottom : (spans[i - 1]!.z1 + s.z0) / 2));
  cuts.push(top);
  const out: ModuleInstance['fr'] = [];
  spans.forEach((s, i) => {
    const f = Math.max(0.01, (cuts[i + 1]! - cuts[i]!) / total);
    if (s.drawer) for (let k = 0; k < s.n; k++) out.push({ t: 'drawer', f: f / s.n });
    else out.push({ t: 'door', n: Math.min(6, s.n), f });
  });
  const sum = out.reduce((a, x) => a + x.f, 0);
  return out.map((x) => ({ ...x, f: Math.round((x.f / sum) * 1000) / 1000 })).map((x, i, arr) =>
    i === arr.length - 1 ? { ...x, f: Math.round((1 - arr.slice(0, -1).reduce((a, y) => a + y.f, 0)) * 1000) / 1000 } : x,
  );
}

export function parts(m: ModuleLike, mats: Mats, materials: Record<string, MaterialDefinition>): Part[] {
  const W = m.w * 10;
  const H = m.h * 10;
  const D = m.d * 10;
  const t = 18;
  const cuCode = m.cue || mats.cuerpo;
  const frCode = m.fre || mats.frentes;
  const cuN = materialLabel(materials[cuCode], cuCode);
  const frN = materialLabel(materials[frCode], frCode);
  const backN = materialLabel(materials[BACK_PANEL_MATERIAL], 'HDF Blanco 6 mm');
  const P: Omit<Part, 'ref'>[] = [];
  const add = (pieza: string, cant: number, L: number, A: number, esp: number, slot: PartSlot, veta: string, cantos: string, grp: PartGroup) => {
    const [mat, matCode] = slot === 'cuerpo' ? [cuN, cuCode] : slot === 'frentes' ? [frN, frCode] : [backN, BACK_PANEL_MATERIAL];
    P.push({ pieza, cant, L: Math.round(L), A: Math.round(A), esp, mat, matCode, slot, veta, cantos, grp });
  };
  if (m.type === 'fridge' || m.type === 'hood') return [];
  const placed = usesBoards(m) ? placedPanels(m) : [];
  if (placed.length) {
    for (const pp of placed) {
      const { L, A, esp } = panelDims(pp);
      // Grain runs along the longest side: vertical when that side is the height.
      const longAxis = [0, 1, 2].filter((a) => a !== pp.thin).sort((a, b) => pp.size[b]! - pp.size[a]!)[0];
      const veta = pp.slot === 'trasera' ? '—' : longAxis === 2 ? 'Vertical' : 'Horizontal';
      add(pp.panel.n, 1, L, A, esp, pp.slot, veta, pp.slot === 'frentes' ? '4L' : pp.slot === 'trasera' ? '—' : '1L', panelGroup(pp.panel.n, pp.slot));
    }
    return mergeParts(P);
  }
  if (m.appl) {
    add('Panel frontal', 1, H - 4, W - 4, 18, 'frentes', 'Vertical', '4L', 'door');
    return P.map((p, i) => ({ ...p, ref: i + 1 }));
  }
  add('Lateral', 2, H, D, t, 'cuerpo', 'Vertical', '1L', 'lat');
  add('Base', 1, W - 2 * t, D, t, 'cuerpo', 'Horizontal', '1L', 'base');
  if (m.type === 'base') add('Travesaño', 2, W - 2 * t, 100, t, 'cuerpo', 'Horizontal', '1L', 'trav');
  else add('Techo', 1, W - 2 * t, D, t, 'cuerpo', 'Horizontal', '1L', 'top');
  add('Trasera', 1, W - 4, H - 4, 6, 'trasera', '—', '—', 'back');
  const fr = frontsOf(m);
  const nSh = fr.some((f) => f.t === 'open') ? (fr.some((f) => f.rod) ? 2 : 4) : m.type === 'tall' ? 3 : fr.every((f) => f.t === 'drawer') ? 0 : 1;
  if (nSh) add('Entrepaño', nSh, W - 2 * t - 2, D - 20, t, 'cuerpo', 'Horizontal', '1L', 'shelf');
  for (const seg of fr) {
    const sh = seg.f * H;
    if (seg.t === 'door') add('Puerta', seg.n || 1, sh - 4, W / (seg.n || 1) - 4, 18, 'frentes', 'Vertical', '4L', 'door');
    if (seg.t === 'drawer') add('Frente de cajón', 1, W - 4, sh - 4, 18, 'frentes', 'Horizontal', '4L', 'drawer');
    if (seg.t === 'oven') add('Remate de horno', 1, W - 4, 60, 18, 'frentes', 'Horizontal', '4L', 'drawer');
  }
  return mergeParts(P);
}

/** Same piece, size and material → one row with the quantities added. */
export const partKey = (p: Pick<Part, 'pieza' | 'L' | 'A' | 'mat'>) => `${p.pieza}|${p.L}|${p.A}|${p.mat}`;
function mergeParts(P: Omit<Part, 'ref'>[]): Part[] {
  const merged: Omit<Part, 'ref'>[] = [];
  for (const p of P) {
    const e = merged.find((q) => partKey(q) === partKey(p));
    if (e) e.cant += p.cant;
    else merged.push({ ...p });
  }
  return merged.map((p, i) => ({ ...p, ref: i + 1 }));
}

/** Front counts used for hardware. */
export function frontCounts(m: Pick<ModuleInstance, 'fr' | 'h'>) {
  let doors = 0;
  let tallDoors = 0;
  let drawers = 0;
  let rods = 0;
  for (const s of m.fr) {
    if (s.t === 'door') {
      const n = s.n || 1;
      doors += n;
      if (s.f * m.h > 100) tallDoors += n;
    } else if (s.t === 'drawer') drawers++;
    else if (s.t === 'open' && s.rod) rods++;
  }
  return { doors, tallDoors, drawers, rods };
}
