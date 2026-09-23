// Board parts per module — ported 1:1 from the prototype's parts() (millimetres).
import { BACK_PANEL_MATERIAL, materialLabel } from './materials';
import type { ModuleInstance, ProjectData } from './schema';
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
type ModuleLike = Pick<ModuleInstance, 'w' | 'h' | 'd' | 'type' | 'fr' | 'cue' | 'fre' | 'glb' | 'appl'>;

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
  if (m.type === 'fridge' || m.type === 'hood' || m.glb) return [];
  if (m.appl) {
    add('Panel frontal', 1, H - 4, W - 4, 18, 'frentes', 'Vertical', '4L', 'door');
    return P.map((p, i) => ({ ...p, ref: i + 1 }));
  }
  add('Lateral', 2, H, D, t, 'cuerpo', 'Vertical', '1L', 'lat');
  add('Base', 1, W - 2 * t, D, t, 'cuerpo', 'Horizontal', '1L', 'base');
  if (m.type === 'base') add('Travesaño', 2, W - 2 * t, 100, t, 'cuerpo', 'Horizontal', '1L', 'trav');
  else add('Techo', 1, W - 2 * t, D, t, 'cuerpo', 'Horizontal', '1L', 'top');
  add('Trasera', 1, W - 4, H - 4, 6, 'trasera', '—', '—', 'back');
  const fr = m.fr;
  const nSh = fr.some((f) => f.t === 'open') ? (fr.some((f) => f.rod) ? 2 : 4) : m.type === 'tall' ? 3 : fr.every((f) => f.t === 'drawer') ? 0 : 1;
  if (nSh) add('Entrepaño', nSh, W - 2 * t - 2, D - 20, t, 'cuerpo', 'Horizontal', '1L', 'shelf');
  for (const seg of fr) {
    const sh = seg.f * H;
    if (seg.t === 'door') add('Puerta', seg.n || 1, sh - 4, W / (seg.n || 1) - 4, 18, 'frentes', 'Vertical', '4L', 'door');
    if (seg.t === 'drawer') add('Frente de cajón', 1, W - 4, sh - 4, 18, 'frentes', 'Horizontal', '4L', 'drawer');
    if (seg.t === 'oven') add('Remate de horno', 1, W - 4, 60, 18, 'frentes', 'Horizontal', '4L', 'drawer');
  }
  const merged: Omit<Part, 'ref'>[] = [];
  for (const p of P) {
    const e = merged.find((q) => q.pieza === p.pieza && q.L === p.L && q.A === p.A && q.mat === p.mat);
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
