// New-project defaults — the prototype's initial state and startProject()/generate().
import { TEMPLATES } from './catalog';
import type { ModuleInstance, ProjectData } from './schema';
import type { ProjectKind } from './types';

export const ESTILOS = [
  { name: 'Contemporáneo', m: { cuerpo: 'blanco', frentes: 'roble', encimera: 'cuarzo', jaladeras: 'negro' } },
  { name: 'Nórdico', m: { cuerpo: 'blanco', frentes: 'fresno', encimera: 'macizo', jaladeras: 'inox' } },
  { name: 'Industrial', m: { cuerpo: 'grafito', frentes: 'grafito', encimera: 'granito', jaladeras: 'negro' } },
  { name: 'Natural', m: { cuerpo: 'arena', frentes: 'salvia', encimera: 'cuarzo', jaladeras: 'laton' } },
] as const;

const KITCHEN_OPS: ProjectData['ops'] = [
  { id: 1, t: 'ventana', wall: 'A', pos: 100, w: 70, h: 100, z: 110 },
  { id: 2, t: 'puerta', wall: 'D', pos: 230, w: 90, h: 210 },
];
const KITCHEN_PTS: ProjectData['pts'] = [
  { id: 1, t: 'agua', wall: 'A', pos: 255, z: 55 },
  { id: 2, t: 'desague', wall: 'A', pos: 150, z: 45 },
  { id: 3, t: 'elec', wall: 'A', pos: 330, z: 110 },
  { id: 4, t: 'elec', wall: 'B', pos: 170, z: 110 },
  { id: 5, t: 'gas', wall: 'B', pos: 90, z: 60 },
  { id: 6, t: 'campana', wall: 'B', pos: 100, z: 210 },
];

/** Same shape the prototype builds in startProject(); kitchens start from the KITCHEN template. */
export function newProject(ptype: ProjectKind, name?: string): ProjectData {
  const closet = ptype !== 'cocina';
  return {
    schemaVersion: 1,
    ptype,
    pname: name ?? (ptype === 'cocina' ? 'Nueva cocina' : ptype === 'closet' ? 'Nuevo closet' : 'Nuevo vestidor'),
    layout: closet ? (ptype === 'vestidor' ? 'abierto' : 'lineal') : 'L',
    room: closet ? { A: 360, B: 240, H: 250 } : { A: 360, B: 300, H: 250 },
    ops: closet ? [{ id: 1, t: 'puerta', wall: 'D', pos: 250, w: 80, h: 210 }] : structuredClone(KITCHEN_OPS),
    pts: closet ? [{ id: 1, t: 'elec', wall: 'B', pos: 200, z: 110 }] : structuredClone(KITCHEN_PTS),
    prefs: { estilo: 'Contemporáneo', alacena: '70 cm', apertura: 'Jaladera', zocalo: '10 cm', presupuesto: 400000 },
    mods: closet ? (ptype === 'vestidor' ? TEMPLATES.VESTIDOR() : TEMPLATES.CLOSET()) : TEMPLATES.KITCHEN(),
    mats: { ...ESTILOS[0].m },
    priceAdj: { inst: 8, desc: 0, final: null, counter: null, taxRate: null },
  };
}

/** The prototype's generate(): template by layout, upper height from prefs, materials from style. */
export function generateLayout(p: ProjectData): Pick<ProjectData, 'mods' | 'mats'> {
  let mods: ModuleInstance[];
  if (p.ptype === 'cocina') mods = p.layout === 'isla' ? TEMPLATES.ISLAND() : p.layout === 'lineal' ? TEMPLATES.LINEAL() : TEMPLATES.KITCHEN();
  else mods = p.layout === 'abierto' || p.ptype === 'vestidor' ? TEMPLATES.VESTIDOR() : TEMPLATES.CLOSET();
  const uh = p.prefs.alacena === '90 cm' ? 90 : 70;
  mods = mods.map((m) => (m.type === 'upper' ? { ...m, h: uh } : m));
  const est = ESTILOS.find((e) => e.name === p.prefs.estilo);
  return { mods, mats: est ? { ...est.m } : p.mats };
}

/** "Cocina por defecto" used by the acceptance tests: the prototype's initial kitchen. */
export const DEFAULT_KITCHEN: ProjectData = { ...newProject('cocina', 'Cocina Familia Ortega'), client: { nombre: 'Familia Ortega' } };

/** Project type column value (the database only distinguishes cocina / closet). */
export const projectTypeOf = (ptype: ProjectKind): 'cocina' | 'closet' => (ptype === 'cocina' ? 'cocina' : 'closet');
