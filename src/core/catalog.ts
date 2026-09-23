// Default module catalogue and layout templates — ported from the prototype (planner-engine.js).
import type { FrontSegment, HardwareDefinition, ModuleDefinition, ModuleShape, ModuleType, WallId } from './types';
import type { ModuleInstance } from './schema';

const D1: FrontSegment[] = [{ t: 'door', n: 1, f: 1 }];
const D2: FrontSegment[] = [{ t: 'door', n: 2, f: 1 }];
const OPEN_ROD: FrontSegment[] = [{ t: 'open', f: 1, rod: 1 }];
const OPEN_SH: FrontSegment[] = [{ t: 'open', f: 1 }];
const OVEN_COL: FrontSegment[] = [{ t: 'drawer', f: 0.17 }, { t: 'drawer', f: 0.17 }, { t: 'oven', f: 0.28 }, { t: 'door', n: 1, f: 0.38 }];
const DR3: FrontSegment[] = [{ t: 'drawer', f: 0.4 }, { t: 'drawer', f: 0.32 }, { t: 'drawer', f: 0.28 }];
const DR2: FrontSegment[] = [{ t: 'drawer', f: 0.5 }, { t: 'drawer', f: 0.5 }];

type Placed = ModuleShape & { id: number; wall: WallId; pos?: number; x?: number; y?: number; open?: 'der' | 'izq' };
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

// ---------- layout templates (prototype KITCHEN, ISLAND, LINEAL, CLOSET, VESTIDOR) ----------
const KITCHEN_T: Placed[] = [
  { id: 1, code: 'BE-90', name: 'Bajo esquinero', cat: 'Esquinas', wall: 'A', pos: 0, w: 90, h: 76, d: 60, type: 'base', fr: D1, rw: [80, 110] },
  { id: 2, code: 'BF-90', name: 'Bajo fregadero', cat: 'Bajos', wall: 'A', pos: 90, w: 90, h: 76, d: 60, type: 'base', sink: 1, fr: D2, rw: [60, 120] },
  { id: 3, code: 'LV-60', name: 'Lavavajillas panelable', cat: 'Electro', wall: 'A', pos: 180, w: 60, h: 76, d: 60, type: 'base', appl: 1, fr: D1, rw: [45, 60] },
  { id: 4, code: 'BC-60', name: 'Cajonera 3 cajones', cat: 'Cajoneras', wall: 'A', pos: 240, w: 60, h: 76, d: 60, type: 'base', fr: DR3, rw: [40, 90] },
  { id: 5, code: 'CH-60', name: 'Columna horno', cat: 'Columnas', wall: 'A', pos: 300, w: 60, h: 210, d: 60, type: 'tall', oven: 1, fr: OVEN_COL, rw: [60, 60] },
  { id: 6, code: 'BP-80', name: 'Bajo parrilla', cat: 'Cajoneras', wall: 'B', pos: 60, w: 80, h: 76, d: 60, type: 'base', cook: 1, fr: DR2, rw: [60, 90] },
  { id: 7, code: 'B2-60', name: 'Bajo 2 puertas', cat: 'Bajos', wall: 'B', pos: 140, w: 60, h: 76, d: 60, type: 'base', fr: D2, rw: [60, 120] },
  { id: 8, code: 'RF-75', name: 'Refrigerador', cat: 'Electro', wall: 'B', pos: 200, w: 75, h: 185, d: 65, type: 'fridge', appl: 1, fr: [], rw: [60, 90] },
  { id: 9, code: 'BB-22', name: 'Botellero', cat: 'Bajos', wall: 'B', pos: 275, w: 22, h: 76, d: 60, type: 'base', fr: D1, rw: [15, 30] },
  { id: 10, code: 'AL-60', name: 'Alacena 1 puerta', cat: 'Altos', wall: 'A', pos: 180, w: 60, h: 70, d: 35, type: 'upper', fr: D1, rw: [30, 60] },
  { id: 11, code: 'AL-60', name: 'Alacena 1 puerta', cat: 'Altos', wall: 'A', pos: 240, w: 60, h: 70, d: 35, type: 'upper', fr: D1, rw: [30, 60], open: 'izq' },
  { id: 12, code: 'CM-80', name: 'Campana decorativa', cat: 'Electro', wall: 'B', pos: 60, w: 80, h: 25, d: 50, type: 'hood', appl: 1, fr: [], rw: [60, 90] },
  { id: 13, code: 'A2-60', name: 'Alacena 2 puertas', cat: 'Altos', wall: 'B', pos: 140, w: 60, h: 70, d: 35, type: 'upper', fr: D2, rw: [60, 120] },
];
const ISLAND_EXTRA: Placed[] = [
  { id: 14, code: 'IS-120', name: 'Isla cajonera', cat: 'Cajoneras', wall: 'F', x: 150, y: 175, w: 120, h: 76, d: 70, type: 'base', fr: DR2, rw: [90, 180] },
];
const LINEAL_T: Placed[] = [
  { id: 1, code: 'CH-60', name: 'Columna horno', cat: 'Columnas', wall: 'A', pos: 0, w: 60, h: 210, d: 60, type: 'tall', oven: 1, fr: OVEN_COL, rw: [60, 60] },
  { id: 2, code: 'RF-70', name: 'Refrigerador', cat: 'Electro', wall: 'A', pos: 60, w: 70, h: 185, d: 65, type: 'fridge', appl: 1, fr: [], rw: [60, 90] },
  { id: 3, code: 'BF-90', name: 'Bajo fregadero', cat: 'Bajos', wall: 'A', pos: 130, w: 90, h: 76, d: 60, type: 'base', sink: 1, fr: D2, rw: [60, 120] },
  { id: 4, code: 'LV-60', name: 'Lavavajillas panelable', cat: 'Electro', wall: 'A', pos: 220, w: 60, h: 76, d: 60, type: 'base', appl: 1, fr: D1, rw: [45, 60] },
  { id: 5, code: 'BP-80', name: 'Bajo parrilla', cat: 'Cajoneras', wall: 'A', pos: 280, w: 80, h: 76, d: 60, type: 'base', cook: 1, fr: DR2, rw: [60, 90] },
  { id: 6, code: 'CM-80', name: 'Campana decorativa', cat: 'Electro', wall: 'A', pos: 280, w: 80, h: 25, d: 50, type: 'hood', appl: 1, fr: [], rw: [60, 90] },
  { id: 7, code: 'AL-60', name: 'Alacena 1 puerta', cat: 'Altos', wall: 'A', pos: 220, w: 60, h: 70, d: 35, type: 'upper', fr: D1, rw: [30, 60] },
];
const CLOSET_T: Placed[] = [
  { id: 1, code: 'CL-100', name: 'Colgado largo', cat: 'Closet', wall: 'A', pos: 0, w: 100, h: 230, d: 60, type: 'tall', fr: D2, rw: [60, 120] },
  { id: 2, code: 'CJ-100', name: 'Cajonera + colgado corto', cat: 'Closet', wall: 'A', pos: 100, w: 100, h: 230, d: 60, type: 'tall', fr: [{ t: 'drawer', f: 0.12 }, { t: 'drawer', f: 0.12 }, { t: 'drawer', f: 0.12 }, { t: 'door', n: 2, f: 0.64 }], rw: [60, 120] },
  { id: 3, code: 'CC-100', name: 'Colgado corto doble', cat: 'Closet', wall: 'A', pos: 200, w: 100, h: 230, d: 60, type: 'tall', fr: D2, rw: [60, 120] },
  { id: 4, code: 'ZP-60', name: 'Zapatera extraíble', cat: 'Closet', wall: 'A', pos: 300, w: 60, h: 230, d: 60, type: 'tall', fr: D1, rw: [40, 80] },
];
const VESTIDOR_T: Placed[] = [
  { id: 1, code: 'VL-100', name: 'Colgado largo abierto', cat: 'Closet', wall: 'A', pos: 0, w: 100, h: 230, d: 55, type: 'tall', fr: OPEN_ROD, rw: [60, 120] },
  { id: 2, code: 'VE-80', name: 'Entrepaños abiertos', cat: 'Closet', wall: 'A', pos: 100, w: 80, h: 230, d: 55, type: 'tall', fr: OPEN_SH, rw: [40, 100] },
  { id: 3, code: 'VC-100', name: 'Colgado corto abierto', cat: 'Closet', wall: 'A', pos: 180, w: 100, h: 230, d: 55, type: 'tall', fr: [{ t: 'drawer', f: 0.14 }, { t: 'drawer', f: 0.14 }, { t: 'open', f: 0.72, rod: 1 }], rw: [60, 120] },
  { id: 4, code: 'VZ-80', name: 'Zapatera abierta', cat: 'Closet', wall: 'A', pos: 280, w: 80, h: 230, d: 55, type: 'tall', fr: OPEN_SH, rw: [40, 100] },
  { id: 5, code: 'VE-90', name: 'Entrepaños abiertos', cat: 'Closet', wall: 'B', pos: 55, w: 90, h: 230, d: 55, type: 'tall', fr: OPEN_SH, rw: [40, 100] },
  { id: 6, code: 'VL-90', name: 'Colgado largo abierto', cat: 'Closet', wall: 'B', pos: 145, w: 90, h: 230, d: 55, type: 'tall', fr: OPEN_ROD, rw: [60, 120] },
  { id: 7, code: 'IC-100', name: 'Isla cajonera', cat: 'Closet', wall: 'F', x: 150, y: 130, w: 100, h: 80, d: 55, type: 'base', fr: [{ t: 'drawer', f: 0.34 }, { t: 'drawer', f: 0.33 }, { t: 'drawer', f: 0.33 }], rw: [80, 140] },
];

export const TEMPLATES = {
  KITCHEN: () => clone(KITCHEN_T) as unknown as ModuleInstance[],
  ISLAND: () => clone([...KITCHEN_T, ...ISLAND_EXTRA]) as unknown as ModuleInstance[],
  LINEAL: () => clone(LINEAL_T) as unknown as ModuleInstance[],
  CLOSET: () => clone(CLOSET_T) as unknown as ModuleInstance[],
  VESTIDOR: () => clone(VESTIDOR_T) as unknown as ModuleInstance[],
};

// ---------- library (prototype LIB) ----------
const LIB: ModuleShape[] = [
  { code: 'B-1P', name: 'Bajo 1 puerta', cat: 'Bajos', rw: [30, 60], w: 45, h: 76, d: 60, type: 'base', fr: D1 },
  { code: 'B-2P', name: 'Bajo 2 puertas', cat: 'Bajos', rw: [60, 120], w: 80, h: 76, d: 60, type: 'base', fr: D2 },
  { code: 'BF', name: 'Bajo fregadero', cat: 'Bajos', rw: [60, 120], w: 90, h: 76, d: 60, type: 'base', fr: D2, sink: 1 },
  { code: 'BC-3', name: 'Cajonera 3 cajones', cat: 'Cajoneras', rw: [40, 90], w: 60, h: 76, d: 60, type: 'base', fr: DR3 },
  { code: 'BC-2', name: 'Cajonera 2 cajones', cat: 'Cajoneras', rw: [40, 120], w: 80, h: 76, d: 60, type: 'base', fr: DR2 },
  { code: 'A-1P', name: 'Alacena 1 puerta', cat: 'Altos', rw: [30, 60], w: 45, h: 70, d: 35, type: 'upper', fr: D1 },
  { code: 'A-2P', name: 'Alacena 2 puertas', cat: 'Altos', rw: [60, 120], w: 80, h: 70, d: 35, type: 'upper', fr: D2 },
  { code: 'A-AB', name: 'Alacena abatible', cat: 'Altos', rw: [60, 120], w: 90, h: 40, d: 35, type: 'upper', fr: D1 },
  { code: 'C-HO', name: 'Columna horno', cat: 'Columnas', rw: [60, 60], w: 60, h: 210, d: 60, type: 'tall', oven: 1, fr: OVEN_COL },
  { code: 'C-DE', name: 'Columna despensa', cat: 'Columnas', rw: [40, 60], w: 50, h: 210, d: 60, type: 'tall', fr: [{ t: 'door', n: 1, f: 0.45 }, { t: 'door', n: 1, f: 0.55 }] },
  { code: 'E-L', name: 'Esquinero en L', cat: 'Esquinas', rw: [80, 110], w: 90, h: 76, d: 60, type: 'base', fr: D1 },
  { code: 'E-AL', name: 'Alacena esquinera', cat: 'Esquinas', rw: [60, 80], w: 65, h: 70, d: 35, type: 'upper', fr: D1 },
  { code: 'CL-L', name: 'Colgado largo', cat: 'Closet', rw: [60, 120], w: 90, h: 230, d: 55, type: 'tall', fr: OPEN_ROD },
  { code: 'CL-E', name: 'Entrepaños abiertos', cat: 'Closet', rw: [40, 100], w: 60, h: 230, d: 55, type: 'tall', fr: OPEN_SH },
  { code: 'CL-Z', name: 'Zapatera extraíble', cat: 'Closet', rw: [40, 80], w: 60, h: 230, d: 55, type: 'tall', fr: D1 },
];

/** Labour/assembly price (USD) by module type; appliances carry their full price. */
const LABOR: Record<ModuleType, number> = { base: 45, upper: 32, tall: 80, fridge: 0, hood: 0 };
const APPLIANCE_PRICE: Record<string, number> = { 'RF-75': 1828, 'RF-70': 1780, 'CM-80': 656, 'LV-60': 870 };
const EXTRA: (m: ModuleShape) => number = (m) => (m.sink ? 60 : 0) + (m.cook ? 40 : 0) + (m.oven ? 70 : 0);

function toDefinition(m: ModuleShape): ModuleDefinition {
  const unitPrice = APPLIANCE_PRICE[m.code] ?? LABOR[m.type] + EXTRA(m);
  return {
    ...clone(m),
    rw: m.rw ?? [m.w, m.w],
    projectType: m.cat === 'Closet' ? 'closet' : 'cocina',
    source: 'parametrico',
    unitPrice,
    priceCurrency: 'USD',
    version: 1,
    active: true,
  };
}

/** Library entries plus every distinct module used by the templates. */
export const DEFAULT_MODULES: ModuleDefinition[] = (() => {
  const byCode = new Map<string, ModuleShape>();
  for (const m of LIB) byCode.set(m.code, m);
  for (const m of [...KITCHEN_T, ...ISLAND_EXTRA, ...LINEAL_T, ...CLOSET_T, ...VESTIDOR_T]) {
    if (byCode.has(m.code)) continue;
    const shape: ModuleShape = { code: m.code, name: m.name, cat: m.cat, type: m.type, w: m.w, h: m.h, d: m.d, fr: m.fr, rw: m.rw };
    for (const k of ['sink', 'cook', 'appl', 'oven'] as const) if (m[k]) shape[k] = 1;
    byCode.set(m.code, shape);
  }
  return [...byCode.values()].map(toDefinition);
})();

export const DEFAULT_HARDWARE: HardwareDefinition[] = [
  { code: 'BISAGRA', name: 'Bisagra cierre suave', unitPrice: 2.5, priceCurrency: 'USD', active: true },
  { code: 'CORREDERA', name: 'Corredera telescópica (par)', unitPrice: 12, priceCurrency: 'USD', active: true },
  { code: 'JALADERA-NEGRO', name: 'Jaladera aluminio negro mate', unitPrice: 4, priceCurrency: 'USD', active: true },
  { code: 'JALADERA-INOX', name: 'Jaladera acero inoxidable', unitPrice: 5, priceCurrency: 'USD', active: true },
  { code: 'JALADERA-LATON', name: 'Jaladera latón cepillado', unitPrice: 7, priceCurrency: 'USD', active: true },
  { code: 'JALADERA', name: 'Jaladera genérica', unitPrice: 4, priceCurrency: 'USD', active: true },
  { code: 'PERFIL-GOLA', name: 'Perfil gola (metro lineal)', unitPrice: 9, priceCurrency: 'USD', active: true },
  { code: 'PUSH', name: 'Expulsor push', unitPrice: 3.5, priceCurrency: 'USD', active: true },
  { code: 'PATA', name: 'Pata niveladora', unitPrice: 1.2, priceCurrency: 'USD', active: true },
  { code: 'TUBO-COLGADOR', name: 'Tubo colgador con soportes', unitPrice: 6, priceCurrency: 'USD', active: true },
  { code: 'SOPORTE-ENTREPANO', name: 'Soporte de entrepaño', unitPrice: 0.2, priceCurrency: 'USD', active: true },
];
