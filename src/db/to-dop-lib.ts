import { and, eq, ne } from 'drizzle-orm';
import type { ModuleInstance, ProjectData } from '../core';
import { loadPricingContext } from '../services/catalog';
import { parseProjectData, rowValuesFrom } from '../services/projects';
import type { Db } from './client';
import { hardwarePrices, materials, moduleDefinitions, organizations, projects } from './schema';

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Switches an organisation from USD to DOP as its base currency:
 * catalogue prices in USD are converted at the organisation's current rate, and the manual amounts stored
 * in non-approved projects (price overrides, countertop, final price, budget) are converted too.
 * Approved projects keep their frozen snapshot. Idempotent: an organisation already in DOP is left alone.
 */
export async function convertOrgToDop(db: Db, orgId: string) {
  return db.transaction(async (tx) => {
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId));
    if (!org) throw new Error(`No existe la organización ${orgId}`);
    if (org.baseCurrency === 'DOP') return { changed: false, projects: 0 };
    const rate = org.exchangeRateDopPerUsd;

    for (const m of await tx.select().from(materials).where(and(eq(materials.organizationId, orgId), eq(materials.priceCurrency, 'USD'))))
      await tx.update(materials).set({ priceM2: r2(m.priceM2 * rate), priceCurrency: 'DOP' }).where(eq(materials.id, m.id));
    for (const h of await tx.select().from(hardwarePrices).where(and(eq(hardwarePrices.organizationId, orgId), eq(hardwarePrices.priceCurrency, 'USD'))))
      await tx.update(hardwarePrices).set({ unitPrice: r2(h.unitPrice * rate), priceCurrency: 'DOP' }).where(eq(hardwarePrices.id, h.id));
    for (const d of await tx.select().from(moduleDefinitions).where(and(eq(moduleDefinitions.organizationId, orgId), eq(moduleDefinitions.priceCurrency, 'USD'))))
      await tx.update(moduleDefinitions).set({ unitPrice: r2(d.unitPrice * rate), priceCurrency: 'DOP' }).where(eq(moduleDefinitions.id, d.id));

    const [updatedOrg] = await tx.update(organizations).set({ baseCurrency: 'DOP' }).where(eq(organizations.id, orgId)).returning();
    const ctx = await loadPricingContext(tx, updatedOrg!);

    const rows = await tx.select().from(projects).where(and(eq(projects.organizationId, orgId), ne(projects.status, 'aprobado')));
    for (const row of rows) {
      const data: ProjectData = parseProjectData(row.data);
      const conv = (v: number | null | undefined) => (v == null ? v : r2(v * rate));
      data.mods = data.mods.map((m) => ({ ...m, ...(m.pOv != null ? { pOv: conv(m.pOv)! } : {}), ...(m.pBase != null ? { pBase: conv(m.pBase)! } : {}) }) as ModuleInstance);
      data.priceAdj = { ...data.priceAdj, counter: conv(data.priceAdj.counter) ?? null, final: conv(data.priceAdj.final) ?? null };
      // The prototype stored the target budget as US$×18; in the app it is now RD$.
      if (data.prefs.presupuesto) data.prefs.presupuesto = Math.round((data.prefs.presupuesto / 18) * rate);
      await tx
        .update(projects)
        .set({ data: data as Record<string, unknown>, currency: 'DOP', ...rowValuesFrom(data, ctx) })
        .where(eq(projects.id, row.id));
    }
    return { changed: true, projects: rows.length, rate };
  });
}
