// Specification wizard constants — ported from the prototype (LAYOUTS_K/C, APPL_K/C, PT_T, ESTILOS, STEP_K/C).
import type { ProjectKind } from './types';

export interface LayoutOption {
  k: string;
  name: string;
  desc: string;
  /** Icon rectangles [x, y, w, h] in a 100×80 box. */
  r: [number, number, number, number][];
}

export const LAYOUTS_K: LayoutOption[] = [
  { k: 'lineal', name: 'Lineal', desc: 'Un solo muro. Ideal para espacios angostos.', r: [[10, 10, 80, 14]] },
  { k: 'L', name: 'En L', desc: 'Dos muros en esquina. Buen triángulo de trabajo.', r: [[10, 10, 80, 14], [10, 24, 14, 46]] },
  { k: 'U', name: 'En U', desc: 'Tres muros. Máximo almacenamiento.', r: [[10, 10, 80, 14], [10, 24, 14, 46], [76, 24, 14, 46]] },
  { k: 'paralela', name: 'Paralela', desc: 'Dos frentes enfrentados, pasillo al centro.', r: [[10, 10, 80, 14], [10, 56, 80, 14]] },
  { k: 'isla', name: 'Con isla', desc: 'L o lineal con isla central independiente.', r: [[10, 10, 80, 14], [10, 24, 14, 46], [42, 44, 34, 14]] },
  { k: 'peninsula', name: 'Con península', desc: 'Barra unida a un extremo del mueble.', r: [[10, 10, 80, 14], [10, 24, 14, 46], [62, 24, 14, 30]] },
  { k: 'personalizada', name: 'Personalizada', desc: 'Tú eliges los muros con muebles, los fondos y la isla.', r: [] },
];

export const LAYOUTS_C: LayoutOption[] = [
  { k: 'lineal', name: 'Lineal', desc: 'Un muro con puertas abatibles o corredizas.', r: [[10, 10, 80, 16]] },
  { k: 'L', name: 'En L', desc: 'Aprovecha la esquina con colgado.', r: [[10, 10, 80, 16], [10, 26, 16, 44]] },
  { k: 'U', name: 'En U', desc: 'Tres muros, ideal para vestidor.', r: [[10, 10, 80, 16], [10, 26, 16, 44], [74, 26, 16, 44]] },
  { k: 'abierto', name: 'Vestidor abierto', desc: 'Sin puertas, con isla cajonera.', r: [[10, 10, 80, 12], [10, 22, 12, 48], [40, 44, 30, 14]] },
  { k: 'personalizada', name: 'Personalizada', desc: 'Tú eliges los muros con módulos y el fondo.', r: [] },
];

export const layoutsFor = (ptype: ProjectKind) => (ptype === 'cocina' ? LAYOUTS_K : LAYOUTS_C);

export interface Appliance {
  on: boolean;
  inst: string;
  w: number;
  h: number;
  d: number;
  /** Custom items only (keys starting with "x"): the name the designer gave it. */
  name?: string;
}

/** Installation options for custom items; the generator maps each to a kind of module. */
export const CUSTOM_INSTS = ['Bajo encimera', 'Empotrado', 'En columna', 'Libre', 'Colgado'] as const;
export const isCustomAppl = (k: string) => /^x\d+$/.test(k);

export interface ApplianceOption {
  k: string;
  name: string;
  icon: string;
  insts: string[];
  d: Appliance;
}

export const APPL_K: ApplianceOption[] = [
  { k: 'refri', name: 'Refrigerador', icon: 'refrigerator', insts: ['Libre', 'Empotrado', 'En columna'], d: { on: true, inst: 'Libre', w: 75, h: 185, d: 65 } },
  { k: 'estufa', name: 'Estufa / parrilla', icon: 'flame', insts: ['Bajo encimera', 'Libre'], d: { on: true, inst: 'Bajo encimera', w: 76, h: 5, d: 52 } },
  { k: 'horno', name: 'Horno', icon: 'cooking-pot', insts: ['En columna', 'Bajo encimera'], d: { on: true, inst: 'En columna', w: 60, h: 60, d: 56 } },
  { k: 'campana', name: 'Campana', icon: 'wind', insts: ['Empotrado', 'Libre'], d: { on: true, inst: 'Libre', w: 80, h: 25, d: 50 } },
  { k: 'micro', name: 'Microondas', icon: 'microwave', insts: ['En columna', 'Empotrado', 'Libre'], d: { on: false, inst: 'En columna', w: 60, h: 38, d: 40 } },
  { k: 'lava', name: 'Lavavajillas', icon: 'washing-machine', insts: ['Empotrado', 'Libre'], d: { on: true, inst: 'Empotrado', w: 60, h: 82, d: 57 } },
  { k: 'freg', name: 'Fregadero', icon: 'droplets', insts: ['Bajo encimera', 'Empotrado'], d: { on: true, inst: 'Bajo encimera', w: 76, h: 20, d: 44 } },
  { k: 'cava', name: 'Cava de vinos', icon: 'wine', insts: ['Empotrado', 'Libre', 'En columna'], d: { on: false, inst: 'Empotrado', w: 30, h: 82, d: 57 } },
];

export const APPL_C: ApplianceOption[] = [
  { k: 'espejo', name: 'Espejo abatible', icon: 'rectangle-vertical', insts: ['Integrado', 'Libre'], d: { on: true, inst: 'Integrado', w: 40, h: 150, d: 3 } },
  { k: 'plancha', name: 'Planchador extraíble', icon: 'shirt', insts: ['Integrado', 'Libre'], d: { on: false, inst: 'Integrado', w: 30, h: 10, d: 50 } },
  { k: 'cesto', name: 'Cesto de ropa', icon: 'shopping-basket', insts: ['Integrado', 'Libre'], d: { on: true, inst: 'Integrado', w: 45, h: 60, d: 45 } },
  { k: 'caja', name: 'Caja fuerte', icon: 'lock', insts: ['Integrado', 'Libre'], d: { on: false, inst: 'Integrado', w: 40, h: 30, d: 35 } },
  { k: 'pant', name: 'Pantalonero', icon: 'align-justify', insts: ['Integrado', 'Libre'], d: { on: true, inst: 'Integrado', w: 60, h: 10, d: 50 } },
  { k: 'led', name: 'Iluminación LED', icon: 'lightbulb', insts: ['Integrado', 'Libre'], d: { on: true, inst: 'Integrado', w: 300, h: 1, d: 1 } },
];

export const appliancesFor = (ptype: ProjectKind) => (ptype === 'cocina' ? APPL_K : APPL_C);

export function defaultAppl(ptype: ProjectKind): Record<string, Appliance> {
  return Object.fromEntries(appliancesFor(ptype).map((a) => [a.k, { ...a.d }]));
}

/** Reads a project's appliance map with defaults for anything missing. */
export function applOf(ptype: ProjectKind, appl: Record<string, unknown> | null | undefined): Record<string, Appliance> {
  const base = defaultAppl(ptype);
  for (const [k, v] of Object.entries(appl ?? {})) {
    if (!v || typeof v !== 'object') continue;
    if (base[k]) base[k] = { ...base[k], ...(v as Partial<Appliance>) };
    else if (isCustomAppl(k)) base[k] = { on: true, inst: 'Libre', w: 60, h: 85, d: 60, name: 'Accesorio', ...(v as Partial<Appliance>) };
  }
  return base;
}

export type PointType = 'agua' | 'desague' | 'elec' | 'gas' | 'campana';
export const PT_T: Record<PointType, [string, string]> = {
  agua: ['AG', 'Toma de agua'],
  desague: ['DS', 'Desagüe'],
  elec: ['EL', 'Contacto eléctrico'],
  gas: ['GS', 'Toma de gas'],
  campana: ['CP', 'Salida de campana'],
};
/** Default height from the floor when a point is placed on the plan (cm). */
export const PT_Z: Record<PointType, number> = { agua: 55, desague: 45, elec: 110, gas: 60, campana: 210 };

export const ESTILOS = [
  { name: 'Contemporáneo', desc: 'Roble, blanco y cuarzo.', c: ['#c49a6c', '#eeebe6', '#e9e7e2'], m: { cuerpo: 'blanco', frentes: 'roble', encimera: 'cuarzo', jaladeras: 'negro' } },
  { name: 'Nórdico', desc: 'Fresno claro y blanco.', c: ['#d8bf98', '#eeebe6', '#b3804f'], m: { cuerpo: 'blanco', frentes: 'fresno', encimera: 'macizo', jaladeras: 'inox' } },
  { name: 'Industrial', desc: 'Grafito, nogal y granito.', c: ['#4a4845', '#7a5236', '#34322f'], m: { cuerpo: 'grafito', frentes: 'grafito', encimera: 'granito', jaladeras: 'negro' } },
  { name: 'Natural', desc: 'Salvia, arena y latón.', c: ['#8e9c86', '#d9cdb8', '#b8995a'], m: { cuerpo: 'arena', frentes: 'salvia', encimera: 'cuarzo', jaladeras: 'laton' } },
] as const;

export const STEP_K = ['Distribución', 'Medidas', 'Instalaciones', 'Electrodomésticos', 'Preferencias', 'Resumen'] as const;
export const STEP_C = ['Distribución', 'Medidas', 'Instalaciones', 'Accesorios', 'Preferencias', 'Resumen'] as const;

export interface ClosetPrefs {
  /** Metres of long hanging. */
  largo: number;
  /** Metres of short hanging. */
  corto: number;
  cajoneras: number;
  /** Pairs of shoes. */
  zapatos: number;
  luz: 'Sin iluminación' | 'Tira LED' | 'Tira LED con sensor';
}
export const DEFAULT_CLOSET: ClosetPrefs = { largo: 2.4, corto: 1.8, cajoneras: 2, zapatos: 24, luz: 'Tira LED con sensor' };

export function closetOf(closet: Record<string, unknown> | null | undefined): ClosetPrefs {
  return { ...DEFAULT_CLOSET, ...(closet as Partial<ClosetPrefs> | undefined) };
}

/** Budget slider range in RD$ (prototype: MXN 80k–400k). */
export const BUDGET_RANGE = { min: 100_000, max: 3_000_000, step: 25_000 } as const;

// ---------- distribution measurements (Especificaciones paso 1) ----------
export type FurnitureWall = 'A' | 'B' | 'C' | 'D';

/** Walls that carry furniture for each preset layout. */
export function wallsFor(layout: string | undefined, ptype: ProjectKind): FurnitureWall[] {
  if (layout === 'lineal') return ['A'];
  if (layout === 'U') return ['A', 'B', 'C'];
  if (layout === 'paralela') return ['A', 'D'];
  if (ptype !== 'cocina' && layout === 'abierto') return ['A', 'B'];
  return ['A', 'B'];
}

export interface DistPrefs {
  walls: FurnitureWall[];
  /** Depth of base units / closet modules (cm). */
  baseD: number;
  /** Height of the base carcass without plinth (cm); the countertop sits on top. */
  baseH: number;
  upperD: number;
  /** Minimum free aisle in front of the furniture (cm). */
  aisle: number;
  island: { on: boolean; w: number | null; d: number };
}

/** Distribution measurements with defaults filled in (custom layouts keep their own walls). */
export function distOf(p: { ptype: ProjectKind; layout?: string; dist?: Partial<Omit<DistPrefs, 'island'>> & { island?: Partial<DistPrefs['island']> } }): DistPrefs {
  const d = p.dist ?? {};
  const kit = p.ptype === 'cocina';
  const custom = p.layout === 'personalizada';
  const presetIsland = kit ? p.layout === 'isla' || p.layout === 'peninsula' : p.layout === 'abierto' || p.ptype === 'vestidor';
  return {
    walls: custom && d.walls?.length ? [...new Set(d.walls)].sort() as FurnitureWall[] : custom ? ['A', 'B'] : wallsFor(p.layout, p.ptype),
    baseD: d.baseD ?? (kit ? 60 : p.ptype === 'vestidor' || p.layout === 'abierto' ? 55 : 60),
    baseH: d.baseH ?? 76,
    upperD: d.upperD ?? 35,
    aisle: d.aisle ?? 90,
    island: { on: custom ? !!d.island?.on : presetIsland, w: d.island?.w ?? null, d: d.island?.d ?? (kit ? 70 : 55) },
  };
}

/** Height (cm) from a preference like "70 cm", "90 cm" or a plain number. */
export const cmOf = (v: string | number | undefined, fallback: number) => {
  const n = typeof v === 'number' ? v : v ? parseFloat(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
