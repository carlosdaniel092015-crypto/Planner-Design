// Shared core (pure logic, no I/O). Ported from the Stephanny Planner prototype (planner-engine.js).
// Units: centimetres for layout, millimetres for parts/cut list. Money: plain numbers.

export type ProjectKind = 'cocina' | 'closet' | 'vestidor' | 'tv';
/** Catalogue family of a module (vestidores use the closet modules). */
export type ModuleFamily = 'cocina' | 'closet' | 'tv';
export type Currency = 'USD' | 'DOP';
/** A–D are room walls (A top, B left, C right, D bottom); F is free-standing (island). */
export type WallId = 'A' | 'B' | 'C' | 'D' | 'F';
export type ModuleType = 'base' | 'upper' | 'tall' | 'fridge' | 'hood';
export type FrontKind = 'door' | 'drawer' | 'oven' | 'open' | 'niche';
/** Appliance a niche (hueco) is made for. */
export type NicheAppliance = 'nevera' | 'lavadora' | 'micro' | 'extractor';
export type MaterialGroup = 'cuerpo' | 'frentes' | 'encimera' | 'jaladeras';
export type MaterialKind = 'madera' | 'solido' | 'piedra' | 'metal' | 'vidrio';
export type Rounding = 'ninguno' | 'unidad' | 'decena' | 'centena';
export type Apertura = 'Jaladera' | 'Gola' | 'Push';

/** One horizontal band of a module front; `f` fractions of a module add up to 1. */
export interface FrontSegment {
  t: FrontKind;
  f: number;
  /** Number of doors side by side (door segments). */
  n?: number;
  /** Hanging rod (open segments). */
  rod?: number | boolean;
  /** Appliance housed in a niche segment. */
  ap?: NicheAppliance;
}

/** Everything the part builder needs about a module, shared by catalogue entries and placed modules. */
export interface ModuleShape {
  code: string;
  name: string;
  cat: string;
  type: ModuleType;
  w: number;
  h: number;
  d: number;
  fr: FrontSegment[];
  rw?: [number, number];
  sink?: number;
  cook?: number;
  appl?: number;
  oven?: number;
  /** Freestanding range: steel body with its own top (the worktop stops at its sides); priced as an appliance. */
  range?: number;
  /** Fridge doors: 2 = side by side. */
  fd?: number;
  /** URL of the GLB model for modelo3d modules (drawn instead of the parametric box). */
  glb?: string;
  /** Boards read from the uploaded model (mm) and the model size they were measured at (cm). */
  panels?: import('./schema').ModelPanel[];
  pdim?: [number, number, number];
  /** Uploaded model drawn as a native module ('nativo', default when built from boards) or as-is ('modelo'). */
  draw?: 'nativo' | 'modelo';
  /** Cubre falta superior: one board closing the gap between the uppers (or columns) and the ceiling. */
  cover?: number;
  /** Shelves (entrepaños) inside the box, instead of the usual count for its fronts. */
  shelves?: number;
  /** Vertical dividers (divisiones) splitting the box into equal compartments. */
  div?: number;
  /** Back panel: 0 = none (open back); anything else has the usual 6 mm back. */
  back?: number;
  /** Panel by panel construction (module designer, like Polyboard); omitted = the usual box. */
  build?: ModuleBuild;
}

/**
 * Which carcass panels a module has and how they meet, like Polyboard's "Paneles". Each field omitted = the usual:
 * full top (rails on a base), bottom, both sides, 6 mm back; top and bottom between the sides.
 */
export interface ModuleBuild {
  /** Top: a full board, two rails (travesaños, front and back) or none. */
  top?: 'completo' | 'travesanos' | 'no';
  /** 'total' = the top runs over the sides (they are shorter); 'entre' = between them. */
  topPos?: 'entre' | 'total';
  bottom?: 0 | 1;
  bottomPos?: 'entre' | 'total';
  left?: 0 | 1;
  right?: 0 | 1;
  /** Back thickness: 6 mm (HDF) or 18 mm (a body board). */
  backT?: 6 | 18;
  /**
   * Where the back goes: 'ranura' set in a groove inside the box (the usual), 'total' screwed over the whole back
   * (the other panels are shallower) or 'entre' between the sides, top and bottom.
   */
  backPos?: 'ranura' | 'total' | 'entre';
  /** Frontal: a fixed board closing the whole front (no doors or drawers). */
  front?: 0 | 1;
  /** Width of the top rails (mm). */
  rail?: number;
  /** Exterior zones (Polyboard's «Zonas exteriores»): what goes around the box. */
  ext?: ModuleExt;
}

/**
 * Exterior zones, in mm. The side panels and the cornice are inside the module's width and height (the box gets
 * narrower / lower); the plinth or legs go under it like the project's plinth.
 */
export interface ModuleExt {
  /** Under the module: the project's plinth (default), its own plinth board, legs, or nothing (on the floor). */
  bottom?: { t: 'proyecto' | 'zocalo' | 'patas' | 'ninguno'; h?: number; set?: number };
  /** On top: a cornice / top board, overhanging `over` mm at the front and sides. */
  top?: { t: 'ninguno' | 'cornisa'; h?: number; over?: number };
  /** Exterior side panels (costado visto): thickness, and down to the floor over the plinth. */
  left?: { t: 'ninguno' | 'panel'; esp?: number; floor?: 0 | 1 };
  right?: { t: 'ninguno' | 'panel'; esp?: number; floor?: 0 | 1 };
}

export interface MaterialDefinition {
  code: string;
  /** Another user's personal texture: kept for pricing, not offered. */
  hidden?: boolean;
  name: string;
  /** Display type, e.g. "Melamina", "Chapa natural", "Cuarzo 20 mm". Part labels use its first word. */
  type: string;
  color: string;
  kind: MaterialKind;
  groups: MaterialGroup[];
  wood: boolean;
  priceM2: number;
  priceCurrency: Currency;
  /** Real size of the texture sample (cm). */
  tileCm?: number | null;
  roughness?: number | null;
  /** Board thickness (mm); the despiece uses it for the pieces cut from this material. */
  thick?: number;
  /** Board (sheet) size in mm [length, width]; the cut optimisation lays the pieces out on it. */
  sheet?: [number, number];
  /** Distributor the board is bought from. */
  supplier?: string | null;
  version: number;
  active: boolean;
}

export interface HardwareDefinition {
  code: string;
  name: string;
  unitPrice: number;
  priceCurrency: Currency;
  active: boolean;
}

export interface ModuleDefinition extends ModuleShape {
  projectType: ModuleFamily;
  source: 'parametrico' | 'modelo3d';
  /** Labour/assembly per unit; for fridge/hood/modelo3d modules it is the whole price. */
  unitPrice: number;
  priceCurrency: Currency;
  version: number;
  active: boolean;
  /** Default location in the generated layout (MODULE_PLACES key), set in Bibliotecas → Módulos. */
  place?: string;
  /** Another user's personal module: kept for pricing, never offered or placed automatically. */
  hidden?: boolean;
}

export interface PricingSettings {
  baseCurrency: Currency;
  exchangeRateDopPerUsd: number;
  taxName: string;
  taxRate: number;
  pricesIncludeTax: boolean;
  wasteRate: number;
  marginRate: number;
  rounding: Rounding;
}

/** Everything the estimate depends on. A frozen copy is a pricing snapshot. */
export interface PricingContext {
  settings: PricingSettings;
  modules: Record<string, ModuleDefinition>;
  materials: Record<string, MaterialDefinition>;
  hardware: Record<string, HardwareDefinition>;
}

/** Same three states the prototype's validator uses; `err` blocks approval. */
export type IssueState = 'ok' | 'warn' | 'err';

export interface ValidationIssue {
  st: IssueState;
  code: string;
  text: string;
  /** Module id the issue points at. */
  id?: number;
}
