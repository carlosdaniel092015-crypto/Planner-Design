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
];

export const LAYOUTS_C: LayoutOption[] = [
  { k: 'lineal', name: 'Lineal', desc: 'Un muro con puertas abatibles o corredizas.', r: [[10, 10, 80, 16]] },
  { k: 'L', name: 'En L', desc: 'Aprovecha la esquina con colgado.', r: [[10, 10, 80, 16], [10, 26, 16, 44]] },
  { k: 'U', name: 'En U', desc: 'Tres muros, ideal para vestidor.', r: [[10, 10, 80, 16], [10, 26, 16, 44], [74, 26, 16, 44]] },
  { k: 'abierto', name: 'Vestidor abierto', desc: 'Sin puertas, con isla cajonera.', r: [[10, 10, 80, 12], [10, 22, 12, 48], [40, 44, 30, 14]] },
];

export const layoutsFor = (ptype: ProjectKind) => (ptype === 'cocina' ? LAYOUTS_K : LAYOUTS_C);

export interface Appliance {
  on: boolean;
  inst: string;
  w: number;
  h: number;
  d: number;
}

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
  for (const [k, v] of Object.entries(appl ?? {})) if (base[k] && v && typeof v === 'object') base[k] = { ...base[k], ...(v as Partial<Appliance>) };
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
