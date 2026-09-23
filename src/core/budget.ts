// Estimate (presupuesto). Structure follows the prototype's totals() — modules + countertop,
// installation %, discount %, manual overrides — with catalogue-driven prices (USD/m² boards,
// hardware, labour) plus waste, margin and tax (ITBIS) from the organisation's settings.
// Manual amounts stored in the project (pOv, pBase, priceAdj.counter/final) are in USD, as in the prototype.
import { frontCounts, parts } from './parts';
import type { ModuleInstance, ProjectData } from './schema';
import type { Currency, PricingContext, Rounding } from './types';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function convert(amount: number, from: Currency, to: Currency, dopPerUsd: number): number {
  if (from === to) return amount;
  return from === 'USD' ? amount * dopPerUsd : amount / dopPerUsd;
}

const ROUNDING_STEP: Record<Rounding, number> = { ninguno: 0, unidad: 1, decena: 10, centena: 100 };

export function applyRounding(amount: number, rounding: Rounding): number {
  const step = ROUNDING_STEP[rounding];
  return step ? Math.round(amount / step) * step : round2(amount);
}

export interface HardwareUse {
  code: string;
  qty: number;
}

/** Hardware a placed module consumes. */
export function hardwareFor(m: ModuleInstance, project: ProjectData): HardwareUse[] {
  if (m.type === 'fridge' || m.type === 'hood' || m.glb) return [];
  const { doors, tallDoors, drawers, rods } = frontCounts(m);
  const out: HardwareUse[] = [];
  const add = (code: string, qty: number) => qty > 0 && out.push({ code, qty: Math.round(qty * 100) / 100 });
  add('BISAGRA', (doors - tallDoors) * 2 + tallDoors * 3);
  add('CORREDERA', drawers);
  const fronts = doors + drawers;
  const apertura = project.prefs.apertura ?? 'Jaladera';
  if (apertura === 'Jaladera') add(`JALADERA-${project.mats.jaladeras.toUpperCase()}`, fronts);
  else if (apertura === 'Push') add('PUSH', fronts);
  else add('PERFIL-GOLA', (m.w / 100) * m.fr.filter((f) => f.t === 'door' || f.t === 'drawer').length);
  if ((m.type === 'base' || m.type === 'tall') && !m.appl) add('PATA', 4);
  add('TUBO-COLGADOR', rods);
  return out;
}

export interface EstimateLine {
  id: number;
  code: string;
  name: string;
  w: number;
  /** How the price was obtained. */
  basis: 'catalogo' | 'precio_base' | 'manual' | 'sin_precio';
  materials: number;
  hardware: number;
  labor: number;
  total: number;
}

export interface Estimate {
  currency: Currency;
  rate: number;
  lines: EstimateLine[];
  counter: { lengthCm: number; areaM2: number; total: number; manual: boolean };
  /** Modules + countertop. */
  subtotal: number;
  margin: number;
  installPct: number;
  install: number;
  discountPct: number;
  discount: number;
  /** Amount before tax. */
  taxBase: number;
  taxName: string;
  taxRate: number;
  tax: number;
  pricesIncludeTax: boolean;
  roundingAdjustment: number;
  total: number;
  /** True when priceAdj.final fixed the total by hand. */
  manual: boolean;
  moduleCount: number;
  missingPrices: string[];
}

export function computeEstimate(project: ProjectData, ctx: PricingContext, currency?: Currency): Estimate {
  const s = ctx.settings;
  const cur = currency ?? s.baseCurrency;
  const rate = s.exchangeRateDopPerUsd;
  const conv = (amount: number, from: Currency) => convert(amount, from, cur, rate);
  const usd = (amount: number) => conv(amount, 'USD');
  const waste = 1 + s.wasteRate;
  const missing = new Set<string>();

  const lines: EstimateLine[] = project.mods.map((m) => {
    const def = ctx.modules[m.code];
    const base = { id: m.id, code: m.code, name: m.name, w: m.w };
    if (m.pOv != null) return { ...base, basis: 'manual', materials: 0, hardware: 0, labor: 0, total: usd(m.pOv) };
    if (m.pBase != null) {
      const total = usd(m.pBase * (m.w / (m.w0 || m.w)));
      return { ...base, basis: 'precio_base', materials: 0, hardware: 0, labor: total, total };
    }
    if (m.type === 'fridge' || m.type === 'hood' || m.glb) {
      if (!def) missing.add(m.code);
      const labor = def ? conv(def.unitPrice, def.priceCurrency) * (def.source === 'modelo3d' ? m.w / def.w : 1) : 0;
      return { ...base, basis: def ? 'catalogo' : 'sin_precio', materials: 0, hardware: 0, labor, total: labor };
    }
    let materials = 0;
    for (const p of parts(m, project.mats, ctx.materials)) {
      const mat = ctx.materials[p.matCode];
      if (!mat) continue;
      materials += ((p.cant * p.L * p.A) / 1e6) * waste * conv(mat.priceM2, mat.priceCurrency);
    }
    let hardware = 0;
    for (const h of hardwareFor(m, project)) {
      const item = ctx.hardware[h.code] ?? (h.code.startsWith('JALADERA-') ? ctx.hardware.JALADERA : undefined);
      if (item) hardware += h.qty * conv(item.unitPrice, item.priceCurrency);
      else missing.add(h.code);
    }
    const labor = def ? conv(def.unitPrice, def.priceCurrency) : 0;
    if (!def) missing.add(m.code);
    return { ...base, basis: def ? 'catalogo' : 'sin_precio', materials, hardware, labor, total: materials + hardware + labor };
  });

  const bases = project.mods.filter((m) => m.type === 'base');
  const lengthCm = bases.reduce((a, m) => a + m.w, 0);
  const areaM2 = bases.reduce((a, m) => a + m.w * m.d, 0) / 10_000;
  const top = ctx.materials[project.mats.encimera];
  const manualCounter = project.priceAdj.counter != null;
  const counterTotal = manualCounter ? usd(project.priceAdj.counter!) : top ? areaM2 * waste * conv(top.priceM2, top.priceCurrency) : 0;

  const subtotal = lines.reduce((a, l) => a + l.total, 0) + counterTotal;
  const margin = subtotal * s.marginRate;
  const install = ((subtotal + margin) * project.priceAdj.inst) / 100;
  const discount = ((subtotal + margin + install) * project.priceAdj.desc) / 100;
  const net = subtotal + margin + install - discount;

  const manual = project.priceAdj.final != null;
  let gross: number;
  let taxBase: number;
  let total: number;
  if (manual) {
    gross = usd(project.priceAdj.final!);
    taxBase = gross / (1 + s.taxRate);
    total = round2(gross);
  } else {
    if (s.pricesIncludeTax) {
      gross = net;
      taxBase = net / (1 + s.taxRate);
    } else {
      taxBase = net;
      gross = net * (1 + s.taxRate);
    }
    total = applyRounding(gross, s.rounding);
  }

  return {
    currency: cur,
    rate,
    lines: lines.map((l) => ({ ...l, materials: round2(l.materials), hardware: round2(l.hardware), labor: round2(l.labor), total: round2(l.total) })),
    counter: { lengthCm, areaM2: round2(areaM2), total: round2(counterTotal), manual: manualCounter },
    subtotal: round2(subtotal),
    margin: round2(margin),
    installPct: project.priceAdj.inst,
    install: round2(install),
    discountPct: project.priceAdj.desc,
    discount: round2(discount),
    taxBase: round2(taxBase),
    taxName: s.taxName,
    taxRate: s.taxRate,
    tax: round2(gross - taxBase),
    pricesIncludeTax: s.pricesIncludeTax,
    roundingAdjustment: round2(total - gross),
    total,
    manual,
    moduleCount: project.mods.length,
    missingPrices: [...missing],
  };
}
