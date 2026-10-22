// Board parts per module — ported 1:1 from the prototype's parts() (millimetres).
import { standOf } from './geometry';
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
type ModuleLike = Pick<ModuleInstance, 'w' | 'h' | 'd' | 'type' | 'fr' | 'cue' | 'fre' | 'glb' | 'appl' | 'range' | 'panels' | 'pdim' | 'cover' | 'shelves' | 'div' | 'back' | 'build'>;

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

/** A loose board cut from the fronts' board (TV panel, floating shelf): drawn in the fronts' finish. */
export const isLooseFrontBoard = (m: Partial<Pick<ModuleInstance, 'fr' | 'panels' | 'glb' | 'cover'>>) =>
  !!m.cover || (!m.fr?.length && !m.glb && !!m.panels?.length && m.panels.every((b) => b.slot === 'frentes'));

/** Material code of a module's body (carcass) as drawn. */
export const bodyMaterialOf = (m: Pick<ModuleInstance, 'cue' | 'fre'> & Partial<Pick<ModuleInstance, 'fr' | 'panels' | 'glb' | 'cover'>>, mats: { cuerpo: string; frentes: string }) =>
  m.cue || (isLooseFrontBoard(m) ? m.fre || mats.frentes : mats.cuerpo);

/** An uploaded model drawn as a native module: built from boards unless set otherwise, or converted by hand. */
export function drawsNative(m: Pick<ModuleInstance, 'glb' | 'panels' | 'draw'>): boolean {
  return (m.draw ?? (m.panels?.length ? 'nativo' : 'modelo')) === 'nativo';
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

/** Thickness (mm) of the pieces cut from a material: the board's own, else the usual 18 mm. */
export const boardThick = (mat?: Pick<MaterialDefinition, 'thick'>) => (mat?.thick && mat.thick >= 3 && mat.thick <= 60 ? mat.thick : 18);

/**
 * `junta`: gap between doors and drawers (mm), what each front is cut short of its opening (4 mm unless set).
 * `zoc`: the project's plinth (cm), for exterior side panels that go down to the floor (10 cm unless given).
 */
export function parts(m: ModuleLike, mats: Mats, materials: Record<string, MaterialDefinition>, junta?: number, zoc = 10): Part[] {
  const J = junta != null && junta >= 0 && junta <= 10 ? junta : 4;
  const W = m.w * 10;
  const H = m.h * 10;
  const D = m.d * 10;
  const cuCode = m.cue || mats.cuerpo;
  const frCode = m.fre || mats.frentes;
  // Thickness of the boards in the library (18 mm unless the board says otherwise).
  const t = boardThick(materials[cuCode]);
  const tf = boardThick(materials[frCode]);
  const cuN = materialLabel(materials[cuCode], cuCode);
  const frN = materialLabel(materials[frCode], frCode);
  const backN = materialLabel(materials[BACK_PANEL_MATERIAL], 'HDF Blanco 6 mm');
  const P: Omit<Part, 'ref'>[] = [];
  const add = (pieza: string, cant: number, L: number, A: number, esp: number, slot: PartSlot, veta: string, cantos: string, grp: PartGroup) => {
    const [mat, matCode] = slot === 'cuerpo' ? [cuN, cuCode] : slot === 'frentes' ? [frN, frCode] : [backN, BACK_PANEL_MATERIAL];
    P.push({ pieza, cant, L: Math.round(L), A: Math.round(A), esp, mat, matCode, slot, veta, cantos, grp });
  };
  // Appliances (fridge, hood, freestanding range) are bought, not cut.
  if (m.type === 'fridge' || m.type === 'hood' || m.range) return [];
  // Cubre falta superior: one board in the fronts' finish, as wide and tall as the gap.
  if (m.cover) {
    add('Cubre falta superior', 1, W, H, tf, 'frentes', 'Horizontal', '4L', 'door');
    return mergeParts(P);
  }
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
    add('Panel frontal', 1, H - J, W - J, tf, 'frentes', 'Vertical', '4L', 'door');
    return P.map((p, i) => ({ ...p, ref: i + 1 }));
  }
  for (const b of moduleBoards(m, t, tf, J, standOf(m, zoc).h * 10)) add(b.n, 1, b.L, b.A, b.esp, b.slot, b.veta, b.cantos, b.grp);
  return mergeParts(P);
}

/** Which panel of the module a board is (the designer selects and edits them by this). */
export type BoardRole = 'techo' | 'travesano' | 'suelo' | 'lat-izq' | 'lat-der' | 'trasera' | 'frontal' | 'division' | 'entrepano' | 'divisor' | 'puerta' | 'cajon' | 'horno' | 'ext-izq' | 'ext-der' | 'cornisa' | 'zocalo';

/** One board of a parametric module where it stands: box in mm (x from the left, y from the back, z from its bottom). */
export interface Board {
  n: string;
  role: BoardRole;
  box: [number, number, number, number, number, number];
  /** Cut size: length, width and thickness (mm). */
  L: number;
  A: number;
  esp: number;
  slot: PartSlot;
  veta: string;
  cantos: string;
  grp: PartGroup;
}

/** The usual number of shelves for a module's fronts (when the designer doesn't set it). */
export function usualShelves(m: Pick<ModuleInstance, 'type'>, fr: ModuleInstance['fr']): number {
  const niches = fr.filter((f) => f.t === 'niche').length;
  return niches ? (fr.some((f) => f.t === 'door') ? 1 : 0) : fr.some((f) => f.t === 'open') ? (fr.some((f) => f.rod) ? 2 : 4) : m.type === 'tall' ? 3 : fr.every((f) => f.t === 'drawer') ? 0 : 1;
}

/** The construction with every default filled in (the usual box: rails on top of a base, full top elsewhere). */
export function buildOf(m: Pick<ModuleInstance, 'type' | 'back' | 'build'>) {
  const b = m.build ?? {};
  return {
    top: b.top ?? (m.type === 'base' ? 'travesanos' : 'completo'),
    topPos: b.topPos ?? 'entre',
    bottom: b.bottom ?? 1,
    bottomPos: b.bottomPos ?? 'entre',
    left: b.left ?? 1,
    right: b.right ?? 1,
    back: m.back === 0 ? 0 : 1,
    backT: b.backT ?? 6,
    backPos: b.backPos ?? ((b.backT ?? 6) === 6 ? 'ranura' : 'entre'),
    front: b.front ?? 0,
    rail: b.rail ?? 100,
  } as const;
}

/** Exterior zones of a module in mm: side panels and cornice (inside its width and height), its own plinth board. */
export function extOf(m: Pick<ModuleInstance, 'type' | 'build'>) {
  const e = m.build?.ext ?? {};
  const side = (s?: { t: string; esp?: number }) => (s?.t === 'panel' ? (s.esp ?? 18) : 0);
  const floor = m.type === 'base' || m.type === 'tall';
  return {
    left: side(e.left),
    right: side(e.right),
    leftFloor: !!e.left?.floor && floor,
    rightFloor: !!e.right?.floor && floor,
    top: e.top?.t === 'cornisa' ? (e.top.h ?? 30) : 0,
    over: e.top?.t === 'cornisa' ? (e.top.over ?? 0) : 0,
    plinth: floor && e.bottom?.t === 'zocalo' ? { h: e.bottom.h ?? 100, set: e.bottom.set ?? 50 } : null,
  };
}

type BoardsOf = Pick<ModuleInstance, 'w' | 'h' | 'd' | 'type' | 'fr' | 'glb' | 'panels' | 'pdim' | 'shelves' | 'div' | 'back' | 'build'>;

/**
 * The boards of a parametric module where they stand (mm), with its exterior zones (Polyboard's «Zonas exteriores»):
 * side panels and a cornice take their room inside the module's width and height and the box (with its fronts) fits
 * in what is left; its own plinth board goes under it, `standH` mm high when it reaches the floor.
 */
export function moduleBoards(m: BoardsOf, t = 18, tf = 18, J = 4, standH = 0): Board[] {
  const x = extOf(m);
  if (!x.left && !x.right && !x.top && !x.plinth) return boxBoards(m, t, tf, J);
  const W = m.w * 10;
  const H = m.h * 10;
  const D = m.d * 10;
  const inner = { ...m, w: Math.max(1, W - x.left - x.right) / 10, h: Math.max(1, H - x.top) / 10 };
  const out = boxBoards(inner, t, tf, J).map((b) => ({ ...b, box: [b.box[0] + x.left, b.box[1] + x.left, b.box[2], b.box[3], b.box[4], b.box[5]] as Board['box'] }));
  const bd = (n: string, role: BoardRole, box: Board['box'], L: number, A: number, esp: number, slot: PartSlot, veta: string, cantos: string, grp: PartGroup): Board => ({ n, role, box, L: Math.round(L), A: Math.round(A), esp, slot, veta, cantos, grp });
  const plinthH = x.plinth ? x.plinth.h : standH;
  // Exterior side panels in the fronts' finish, flush with the doors; down to the floor if asked.
  if (x.left) {
    const z0 = x.leftFloor ? -plinthH : 0;
    out.push(bd('Costado exterior', 'ext-izq', [0, x.left, 0, D + tf, z0, H], H - z0, D + tf, x.left, 'frentes', 'Vertical', '4L', 'lat'));
  }
  if (x.right) {
    const z0 = x.rightFloor ? -plinthH : 0;
    out.push(bd('Costado exterior', 'ext-der', [W - x.right, W, 0, D + tf, z0, H], H - z0, D + tf, x.right, 'frentes', 'Vertical', '4L', 'lat'));
  }
  if (x.top) out.push(bd('Cornisa', 'cornisa', [-x.over, W + x.over, 0, D + tf + x.over, H - x.top, H], W + 2 * x.over, D + tf + x.over, x.top, 'frentes', 'Horizontal', '4L', 'top'));
  if (x.plinth) {
    // Plinth board set back under the box, between the side panels that go down to the floor.
    const x0 = x.leftFloor ? x.left : 0;
    const x1 = W - (x.rightFloor ? x.right : 0);
    const y1 = D - x.plinth.set;
    out.push(bd('Zócalo', 'zocalo', [x0, x1, y1 - t, y1, -x.plinth.h, 0], x1 - x0, x.plinth.h, t, 'cuerpo', 'Horizontal', '1L', 'base'));
  }
  return out;
}

/**
 * The boards of a parametric box, panel by panel, where they stand (mm). Built like Polyboard: each panel present
 * or not, top and bottom over the sides ('total') or between them ('entre'), the back in a groove, over the whole back
 * or between the sides, and an optional fixed front. `t` body thickness, `tf` fronts thickness, `J` gap between fronts.
 * The despiece, the 3D and the designer's views all come from here.
 */
function boxBoards(m: BoardsOf, t: number, tf: number, J: number): Board[] {
  const W = m.w * 10;
  const H = m.h * 10;
  const D = m.d * 10;
  const b = buildOf(m);
  const out: Board[] = [];
  const add = (n: string, role: BoardRole, box: Board['box'], L: number, A: number, esp: number, slot: PartSlot, veta: string, cantos: string, grp: PartGroup) =>
    out.push({ n, role, box, L: Math.round(L), A: Math.round(A), esp, slot, veta, cantos, grp });
  const hasTop = b.top !== 'no';
  // Over-the-sides top/bottom shorten the sides; a back over the whole back or between the sides takes depth.
  const topOver = hasTop && b.topPos === 'total';
  const botOver = !!b.bottom && b.bottomPos === 'total';
  const bt = b.back ? (b.backPos === 'ranura' ? 0 : b.backT) : 0;
  const yB = b.backPos === 'total' ? bt : 0;
  const sideZ0 = botOver ? t : 0;
  const sideZ1 = topOver ? H - t : H;
  const xi0 = b.left ? t : 0;
  const xi1 = W - (b.right ? t : 0);
  if (b.left) add('Lateral', 'lat-izq', [0, t, yB, D, sideZ0, sideZ1], sideZ1 - sideZ0, D - yB, t, 'cuerpo', 'Vertical', '1L', 'lat');
  if (b.right) add('Lateral', 'lat-der', [W - t, W, yB, D, sideZ0, sideZ1], sideZ1 - sideZ0, D - yB, t, 'cuerpo', 'Vertical', '1L', 'lat');
  // Top and bottom: the whole width over the sides, or between them; behind them a back between the sides.
  const yIn = bt && b.backPos !== 'ranura' ? bt : 0;
  const span = (over: boolean): [number, number] => (over ? [0, W] : [xi0, xi1]);
  if (b.bottom) {
    const [x0, x1] = span(botOver);
    add('Base', 'suelo', [x0, x1, yIn, D, 0, t], x1 - x0, D - yIn, t, 'cuerpo', 'Horizontal', '1L', 'base');
  }
  if (b.top === 'travesanos') {
    const [x0, x1] = span(topOver);
    add('Travesaño', 'travesano', [x0, x1, yIn, yIn + b.rail, H - t, H], x1 - x0, b.rail, t, 'cuerpo', 'Horizontal', '1L', 'trav');
    add('Travesaño', 'travesano', [x0, x1, D - b.rail, D, H - t, H], x1 - x0, b.rail, t, 'cuerpo', 'Horizontal', '1L', 'trav');
  } else if (b.top === 'completo') {
    const [x0, x1] = span(topOver);
    add('Techo', 'techo', [x0, x1, yIn, D, H - t, H], x1 - x0, D - yIn, t, 'cuerpo', 'Horizontal', '1L', 'top');
  }
  const z0 = b.bottom ? t : 0;
  const z1 = b.top === 'completo' ? H - t : H;
  if (b.back) {
    if (b.backPos === 'ranura') add('Trasera', 'trasera', [2, W - 2, 8, 8 + b.backT, 2, H - 2], W - 4, H - 4, b.backT, b.backT === 6 ? 'trasera' : 'cuerpo', '—', '—', 'back');
    else if (b.backPos === 'total') add('Trasera', 'trasera', [0, W, 0, bt, 0, H], W, H, bt, bt === 6 ? 'trasera' : 'cuerpo', bt === 6 ? '—' : 'Vertical', bt === 6 ? '—' : '1L', 'back');
    else add('Trasera', 'trasera', [xi0, xi1, 0, bt, z0, z1], xi1 - xi0, z1 - z0, bt, bt === 6 ? 'trasera' : 'cuerpo', bt === 6 ? '—' : 'Vertical', bt === 6 ? '—' : '1L', 'back');
  }
  const fr = b.front ? [] : frontsOf(m);
  // A housing gets one divider per niche (the board between the appliance and the rest).
  const niches = fr.filter((f) => f.t === 'niche').length;
  if (niches) {
    let v = 0;
    const cuts: number[] = [];
    for (const seg of fr) {
      v += seg.f;
      if (seg.t === 'niche' && v < 0.999) cuts.push(v);
      else if (seg.t !== 'niche' && fr[fr.indexOf(seg) + 1]?.t === 'niche') cuts.push(v);
    }
    const n = Math.min(niches, Math.max(1, fr.length - 1));
    for (let i = 0; i < n; i++) {
      const z = (cuts[i] ?? 0.5) * H;
      add('Divisor de hueco', 'divisor', [xi0, xi1, yIn, D, z - t / 2, z + t / 2], W - 2 * t, D, t, 'cuerpo', 'Horizontal', '1L', 'shelf');
    }
  }
  // Vertical dividers split the inside into equal compartments; each one gets its own shelves.
  const div = Math.max(0, Math.min(6, m.div ?? 0));
  const cw = (xi1 - xi0 - div * t) / (div + 1);
  for (let i = 1; i <= div; i++) {
    const x = xi0 + i * cw + (i - 1) * t;
    add('División', 'division', [x, x + t, Math.max(yIn, 20), D - 20 + Math.max(yIn, 20) - yIn, z0, z1], H - 2 * t, D - 20, t, 'cuerpo', 'Vertical', '1L', 'lat');
  }
  const nSh = m.shelves ?? usualShelves(m, frontsOf(m));
  for (let c = 0; c <= div; c++)
    for (let i = 1; i <= nSh; i++) {
      const z = z0 + ((z1 - z0) * i) / (nSh + 1);
      const x = xi0 + c * (cw + t) + 1;
      add('Entrepaño', 'entrepano', [x, x + cw - 2, Math.max(yIn, 20), D, z - t / 2, z + t / 2], cw - 2, D - 20, t, 'cuerpo', 'Horizontal', '1L', 'shelf');
    }
  // Fronts in front of the box: a fixed frontal, or the doors and drawers.
  if (b.front) add('Frontal', 'frontal', [J / 2, W - J / 2, D, D + tf, J / 2, H - J / 2], H - J, W - J, tf, 'frentes', 'Vertical', '4L', 'door');
  let v = 0;
  for (const seg of fr) {
    const s0 = v * H;
    const sh = seg.f * H;
    v += seg.f;
    if (seg.t === 'door') {
      const n = seg.n || 1;
      for (let i = 0; i < n; i++) add('Puerta', 'puerta', [(i * W) / n + J / 2, ((i + 1) * W) / n - J / 2, D, D + tf, s0 + J / 2, s0 + sh - J / 2], sh - J, W / n - J, tf, 'frentes', 'Vertical', '4L', 'door');
    }
    if (seg.t === 'drawer') add('Frente de cajón', 'cajon', [J / 2, W - J / 2, D, D + tf, s0 + J / 2, s0 + sh - J / 2], W - J, sh - J, tf, 'frentes', 'Horizontal', '4L', 'drawer');
    if (seg.t === 'oven') add('Remate de horno', 'horno', [J / 2, W - J / 2, D, D + tf, s0 + sh - 60, s0 + sh], W - J, 60, tf, 'frentes', 'Horizontal', '4L', 'drawer');
  }
  return out;
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
