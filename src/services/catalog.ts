import { and, eq, inArray } from 'drizzle-orm';
import {
  BACK_PANEL_MATERIAL,
  frontCounts,
  type HardwareDefinition,
  type MaterialDefinition,
  type MaterialGroup,
  type ModuleDefinition,
  type PricingContext,
  type PricingSettings,
  type ProjectData,
  type Recipe,
} from '../core';
import type { DbOrTx } from '../db/client';
import { files, hardwarePrices, materials, moduleDefinitions } from '../db/schema';
import type { Organization } from '../lib/context';

type ModuleRow = typeof moduleDefinitions.$inferSelect;
type MaterialRow = typeof materials.$inferSelect;
type HardwareRow = typeof hardwarePrices.$inferSelect;

export function settingsOf(org: Organization): PricingSettings {
  return {
    baseCurrency: org.baseCurrency,
    exchangeRateDopPerUsd: org.exchangeRateDopPerUsd,
    taxName: org.taxName,
    taxRate: org.taxRate,
    pricesIncludeTax: org.pricesIncludeTax,
    wasteRate: org.wasteRate,
    marginRate: org.marginRate,
    rounding: org.rounding,
  };
}

export function moduleRowToDef(r: ModuleRow, modelUrl?: string | null): ModuleDefinition {
  const recipe = (r.recipe ?? { fr: [] }) as Recipe;
  const flag = (v: unknown) => (v ? 1 : undefined);
  return {
    code: r.code,
    name: r.name,
    cat: r.category,
    type: r.row,
    w: r.defW,
    h: r.fixedH,
    d: r.fixedD,
    rw: [r.minW, r.maxW],
    fr: recipe.fr ?? [],
    sink: flag(recipe.sink),
    cook: flag(recipe.cook),
    appl: flag(recipe.appl),
    oven: flag(recipe.oven),
    ...(modelUrl ? { glb: modelUrl } : {}),
    ...(recipe.panels?.length ? { panels: recipe.panels, pdim: recipe.pdim } : {}),
    projectType: r.projectType,
    source: r.source,
    unitPrice: r.unitPrice,
    priceCurrency: r.priceCurrency,
    version: r.version,
    active: r.active,
  };
}

export function moduleDefToRow(d: ModuleDefinition) {
  const counts = frontCounts({ fr: d.fr, h: d.h });
  const kind = d.type === 'fridge' || d.type === 'hood' || d.appl ? 'electro' : counts.drawers && !counts.doors ? 'cajones' : d.fr.some((f) => f.t === 'open') ? 'abierto' : 'puertas';
  return {
    code: d.code,
    name: d.name,
    projectType: d.projectType,
    source: d.source,
    row: d.type,
    category: d.cat,
    kind,
    minW: d.rw?.[0] ?? d.w,
    maxW: d.rw?.[1] ?? d.w,
    defW: d.w,
    fixedH: d.h,
    fixedD: d.d,
    doors: counts.doors,
    drawers: counts.drawers,
    recipe: { fr: d.fr, ...(d.sink ? { sink: 1 } : {}), ...(d.cook ? { cook: 1 } : {}), ...(d.appl ? { appl: 1 } : {}), ...(d.oven ? { oven: 1 } : {}), ...(d.panels?.length ? { panels: d.panels, pdim: d.pdim } : {}) },
    unitPrice: d.unitPrice,
    priceCurrency: d.priceCurrency,
    version: d.version,
    active: d.active,
  };
}

export function materialRowToDef(r: MaterialRow): MaterialDefinition {
  return {
    code: r.code,
    name: r.name,
    type: r.typeLabel || r.category,
    color: r.color,
    kind: r.kind,
    groups: r.uses as MaterialGroup[],
    wood: r.grain !== 'ninguna',
    priceM2: r.priceM2,
    priceCurrency: r.priceCurrency,
    tileCm: r.sizeWcm,
    roughness: r.roughness,
    version: r.version,
    active: r.active,
  };
}

export function materialDefToRow(d: MaterialDefinition) {
  return {
    code: d.code,
    name: d.name,
    category: d.type.split(' ')[0]!,
    typeLabel: d.type,
    color: d.color,
    kind: d.kind,
    uses: d.groups,
    grain: d.wood ? ('v' as const) : ('ninguna' as const),
    sizeWcm: d.tileCm ?? null,
    sizeHcm: d.tileCm ?? null,
    roughness: d.roughness ?? null,
    thickness: /6 mm/.test(d.name) ? 0.6 : 1.8,
    priceM2: d.priceM2,
    priceCurrency: d.priceCurrency,
    version: d.version,
    active: d.active,
  };
}

export const hardwareRowToDef = (r: HardwareRow): HardwareDefinition => ({
  code: r.code,
  name: r.name,
  unitPrice: r.unitPrice,
  priceCurrency: r.priceCurrency,
  active: r.active,
});

/** Current prices of the organisation (inactive items included so validation can flag them). */
export async function loadPricingContext(db: DbOrTx, org: Organization): Promise<PricingContext> {
  const [mods, mats, hw] = await Promise.all([
    db.select().from(moduleDefinitions).where(eq(moduleDefinitions.organizationId, org.id)),
    db.select().from(materials).where(eq(materials.organizationId, org.id)),
    db.select().from(hardwarePrices).where(eq(hardwarePrices.organizationId, org.id)),
  ]);
  const modelIds = [...new Set(mods.map((r) => r.modelFileId).filter((x): x is string => !!x))];
  const models = modelIds.length ? await db.select({ id: files.id, url: files.blobUrl }).from(files).where(and(eq(files.organizationId, org.id), inArray(files.id, modelIds))) : [];
  const urlOf = new Map(models.map((f) => [f.id, f.url]));
  return {
    settings: settingsOf(org),
    modules: Object.fromEntries(mods.map((r) => [r.code, moduleRowToDef(r, r.modelFileId ? urlOf.get(r.modelFileId) : null)])),
    materials: Object.fromEntries(mats.map((r) => [r.code, materialRowToDef(r)])),
    hardware: Object.fromEntries(hw.map((r) => [r.code, hardwareRowToDef(r)])),
  };
}

export interface PricingSnapshot extends PricingContext {
  capturedAt: string;
}

/** Freezes only what the project uses: settings, its modules and materials, and every hardware price. */
export function snapshotFor(project: ProjectData, ctx: PricingContext): PricingSnapshot {
  const matCodes = new Set<string>([...Object.values(project.mats), BACK_PANEL_MATERIAL]);
  for (const m of project.mods) {
    if (m.cue) matCodes.add(m.cue);
    if (m.fre) matCodes.add(m.fre);
  }
  const pickFrom = <T>(rec: Record<string, T>, keys: Iterable<string>) =>
    Object.fromEntries([...keys].filter((k) => k in rec).map((k) => [k, rec[k]!]));
  return {
    capturedAt: new Date().toISOString(),
    settings: { ...ctx.settings },
    modules: pickFrom(ctx.modules, new Set(project.mods.map((m) => m.code))),
    materials: pickFrom(ctx.materials, matCodes),
    hardware: { ...ctx.hardware },
  };
}

export const isSnapshot = (x: unknown): x is PricingSnapshot =>
  !!x && typeof x === 'object' && 'settings' in x && 'modules' in x && 'materials' in x && 'hardware' in x;
