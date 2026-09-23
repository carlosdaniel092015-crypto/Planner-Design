// Default material library — the prototype's MATS/GROUPS plus the 6 mm back panel used by parts().
import type { MaterialDefinition, MaterialGroup, MaterialKind } from './types';

interface ProtoMat {
  name: string;
  type: string;
  c: string;
  wood?: number;
  priceM2: number;
}

/** Prototype MATS (planner-engine.js) with a USD/m² price added. */
export const MATS: Record<string, ProtoMat> = {
  blanco: { name: 'Blanco mate', type: 'Melamina', c: '#eeebe6', priceM2: 18 },
  arena: { name: 'Arena', type: 'Melamina', c: '#d9cdb8', priceM2: 20 },
  roble: { name: 'Roble natural', type: 'Melamina texturizada', c: '#c49a6c', wood: 1, priceM2: 24 },
  nogal: { name: 'Nogal americano', type: 'Chapa natural', c: '#7a5236', wood: 1, priceM2: 55 },
  fresno: { name: 'Fresno claro', type: 'Chapa natural', c: '#d8bf98', wood: 1, priceM2: 50 },
  grafito: { name: 'Gris grafito', type: 'Lacado mate', c: '#4a4845', priceM2: 42 },
  salvia: { name: 'Verde salvia', type: 'Lacado mate', c: '#8e9c86', priceM2: 42 },
  cuarzo: { name: 'Cuarzo blanco', type: 'Cuarzo 20 mm', c: '#e9e7e2', priceM2: 180 },
  granito: { name: 'Granito negro', type: 'Granito 30 mm', c: '#34322f', priceM2: 150 },
  macizo: { name: 'Encino macizo', type: 'Madera maciza 40 mm', c: '#b3804f', wood: 1, priceM2: 120 },
  negro: { name: 'Negro mate', type: 'Aluminio', c: '#2a2928', priceM2: 0 },
  inox: { name: 'Acero inoxidable', type: 'Acero', c: '#9ea2a3', priceM2: 0 },
  laton: { name: 'Latón cepillado', type: 'Latón', c: '#b8995a', priceM2: 0 },
  hdf: { name: 'Blanco 6 mm', type: 'HDF', c: '#e8e4dc', priceM2: 7 },
};

export const GROUPS: { k: MaterialGroup; label: string; ids: string[] }[] = [
  { k: 'cuerpo', label: 'Cuerpo', ids: ['blanco', 'arena', 'roble', 'grafito'] },
  { k: 'frentes', label: 'Frentes', ids: ['roble', 'nogal', 'fresno', 'blanco', 'grafito', 'salvia'] },
  { k: 'encimera', label: 'Encimera', ids: ['cuarzo', 'granito', 'macizo'] },
  { k: 'jaladeras', label: 'Jaladeras', ids: ['negro', 'inox', 'laton'] },
];

/** Code of the back panel material used by parts() ("Trasera"). */
export const BACK_PANEL_MATERIAL = 'hdf';

export function kindOfType(type: string): MaterialKind {
  const t = type.toLowerCase();
  if (/cuarzo|granito|piedra|mármol|marmol/.test(t)) return 'piedra';
  if (/acero|latón|laton|aluminio|metal/.test(t)) return 'metal';
  if (/vidrio|cristal/.test(t)) return 'vidrio';
  if (/lacado|sólido|solido/.test(t)) return 'solido';
  return 'madera';
}

const ROUGH: Record<MaterialKind, number> = { madera: 0.72, solido: 0.6, piedra: 0.45, metal: 0.35, vidrio: 0.1 };

export const DEFAULT_MATERIALS: MaterialDefinition[] = Object.entries(MATS).map(([code, m]) => {
  const kind = kindOfType(m.type);
  return {
    code,
    name: m.name,
    type: m.type,
    color: m.c,
    kind,
    groups: GROUPS.filter((g) => g.ids.includes(code)).map((g) => g.k),
    wood: !!m.wood,
    priceM2: m.priceM2,
    priceCurrency: 'USD',
    tileCm: kind === 'piedra' ? 80 : 60,
    roughness: ROUGH[kind],
    version: 1,
    active: true,
  };
});

/** Label used in parts/cut list, e.g. "Melamina Blanco mate" (prototype: type's first word + name). */
export const materialLabel = (m: Pick<MaterialDefinition, 'type' | 'name'> | undefined, fallback: string) =>
  m ? `${m.type.split(' ')[0]} ${m.name}` : fallback;
