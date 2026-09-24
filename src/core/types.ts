// Shared core (pure logic, no I/O). Ported from the Stephanny Planner prototype (planner-engine.js).
// Units: centimetres for layout, millimetres for parts/cut list. Money: plain numbers.

export type ProjectKind = 'cocina' | 'closet' | 'vestidor';
export type Currency = 'USD' | 'DOP';
/** A–D are room walls (A top, B left, C right, D bottom); F is free-standing (island). */
export type WallId = 'A' | 'B' | 'C' | 'D' | 'F';
export type ModuleType = 'base' | 'upper' | 'tall' | 'fridge' | 'hood';
export type FrontKind = 'door' | 'drawer' | 'oven' | 'open';
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
  /** URL of the GLB model for modelo3d modules (drawn instead of the parametric box). */
  glb?: string;
}

export interface MaterialDefinition {
  code: string;
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
  projectType: 'cocina' | 'closet';
  source: 'parametrico' | 'modelo3d';
  /** Labour/assembly per unit; for fridge/hood/modelo3d modules it is the whole price. */
  unitPrice: number;
  priceCurrency: Currency;
  version: number;
  active: boolean;
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
