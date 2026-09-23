import { eq } from 'drizzle-orm';
import { DEFAULT_HARDWARE, DEFAULT_MATERIALS, DEFAULT_MODULES } from '../core';
import { materialDefToRow, moduleDefToRow } from '../services/catalog';
import { hashPassword } from '../services/auth';
import type { Db } from './client';
import { exchangeRates, hardwarePrices, materials, moduleDefinitions, organizations, userCredentials, users } from './schema';

export interface SeedOptions {
  orgName: string;
  slug: string;
  admin: { name: string; email: string; password: string };
  rate?: number;
}

/**
 * Creates (or completes) an organisation with an admin user and the default catalogue from src/core.
 * Idempotent: existing rows (matched by slug / email / code) are left untouched.
 */
export async function seedOrganization(db: Db, o: SeedOptions) {
  const rate = o.rate ?? 60;
  return db.transaction(async (tx) => {
    let [org] = await tx.select().from(organizations).where(eq(organizations.slug, o.slug)).limit(1);
    if (!org) {
      [org] = await tx
        .insert(organizations)
        .values({
          name: o.orgName,
          slug: o.slug,
          brandColor: '#ec3013',
          baseCurrency: 'USD',
          exchangeRateDopPerUsd: rate,
          rateUpdatedAt: new Date(),
          taxName: 'ITBIS',
          taxRate: 0.18,
          wasteRate: 0.15,
          marginRate: 0,
          settings: {
            pdf: { titulo: 'Proyecto a medida', pie: 'Precios sujetos a cambio sin previo aviso.' },
            aprobacion: { terminos: 'Acepto la distribución, materiales, medidas y el presupuesto estimado.' },
          },
        })
        .returning();
      await tx.insert(exchangeRates).values({ organizationId: org!.id, dopPerUsd: rate });
    }
    const orgId = org!.id;

    const email = o.admin.email.trim().toLowerCase();
    let [admin] = await tx.select().from(users).where(eq(users.email, email)).limit(1);
    if (!admin) {
      [admin] = await tx.insert(users).values({ organizationId: orgId, name: o.admin.name, email, role: 'admin', active: true }).returning();
      await tx.insert(userCredentials).values({ userId: admin!.id, passwordHash: await hashPassword(o.admin.password) });
    }

    await tx
      .insert(moduleDefinitions)
      .values(DEFAULT_MODULES.map((d, i) => ({ ...moduleDefToRow(d), organizationId: orgId, sort: i })))
      .onConflictDoNothing();
    await tx
      .insert(materials)
      .values(DEFAULT_MATERIALS.map((d, i) => ({ ...materialDefToRow(d), organizationId: orgId, sort: i, source: 'estandar' as const })))
      .onConflictDoNothing();
    await tx
      .insert(hardwarePrices)
      .values(DEFAULT_HARDWARE.map((d) => ({ organizationId: orgId, code: d.code, name: d.name, unitPrice: d.unitPrice, priceCurrency: d.priceCurrency, active: d.active })))
      .onConflictDoNothing();

    return { org: org!, admin: admin! };
  });
}
