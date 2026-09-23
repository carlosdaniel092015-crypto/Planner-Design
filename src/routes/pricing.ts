import { createRoute, z } from '@hono/zod-openapi';
import { desc, eq } from 'drizzle-orm';
import { exchangeRates, organizations } from '../db/schema';
import { audit } from '../lib/audit';
import { authErrors, body, json, router, security } from '../lib/openapi';
import { assertCan } from '../lib/permissions';
import { requireAuth } from '../services/auth';
import { pricingJson } from './catalog';

const Pricing = z
  .object({
    baseCurrency: z.enum(['USD', 'DOP']),
    exchangeRateDopPerUsd: z.number(),
    rateUpdatedAt: z.iso.datetime().nullable(),
    taxName: z.string(),
    taxRate: z.number(),
    pricesIncludeTax: z.boolean(),
    wasteRate: z.number(),
    marginRate: z.number(),
    rounding: z.enum(['ninguno', 'unidad', 'decena', 'centena']),
  })
  .openapi('ConfiguracionPrecios', {
    example: { baseCurrency: 'USD', exchangeRateDopPerUsd: 60, rateUpdatedAt: '2026-09-23T12:00:00.000Z', taxName: 'ITBIS', taxRate: 0.18, pricesIncludeTax: false, wasteRate: 0.15, marginRate: 0, rounding: 'ninguno' },
  });

const PricingPatch = z
  .object({
    baseCurrency: z.enum(['USD', 'DOP']),
    exchangeRateDopPerUsd: z.number().positive().max(10_000),
    taxName: z.string().min(1).max(20),
    taxRate: z.number().min(0).max(1),
    pricesIncludeTax: z.boolean(),
    wasteRate: z.number().min(0).max(1),
    marginRate: z.number().min(0).max(5),
    rounding: z.enum(['ninguno', 'unidad', 'decena', 'centena']),
  })
  .partial()
  .openapi('ConfiguracionPreciosCambios', { example: { taxRate: 0.18, wasteRate: 0.12, marginRate: 0.1 } });

const Rate = z.object({ id: z.uuid(), dopPerUsd: z.number(), validFrom: z.iso.datetime(), createdBy: z.uuid().nullable() }).openapi('Tasa');

export function pricingRoutes() {
  const r = router();

  r.openapi(
    createRoute({ method: 'get', path: '/settings/pricing', tags: ['Precios'], summary: 'Configuración de precios', security, responses: { 200: json(Pricing), ...authErrors } }),
    (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'pricing:read');
      return c.json(pricingJson(a.org), 200);
    },
  );

  r.openapi(
    createRoute({
      method: 'put',
      path: '/settings/pricing',
      tags: ['Precios'],
      summary: 'Cambiar moneda base, tasa, impuesto, merma, margen o redondeo (solo admin)',
      description: 'Si cambia la tasa se registra también en el historial. Los proyectos aprobados no cambian: usan su snapshot.',
      security,
      request: body(PricingPatch),
      responses: { 200: json(Pricing), ...authErrors },
    }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'pricing:write');
      const patch = c.req.valid('json');
      const { db } = c.var.deps;
      const org = await db.transaction(async (tx) => {
        const rateChanged = patch.exchangeRateDopPerUsd !== undefined && patch.exchangeRateDopPerUsd !== a.org.exchangeRateDopPerUsd;
        const [org] = await tx
          .update(organizations)
          .set({ ...patch, ...(rateChanged ? { rateUpdatedAt: new Date() } : {}) })
          .where(eq(organizations.id, a.org.id))
          .returning();
        if (rateChanged) {
          await tx.insert(exchangeRates).values({ organizationId: a.org.id, dopPerUsd: patch.exchangeRateDopPerUsd!, createdBy: a.user.id });
          await audit(tx, a, 'cambiar_tasa', 'organization', a.org.id, { from: a.org.exchangeRateDopPerUsd, to: patch.exchangeRateDopPerUsd });
        }
        await audit(tx, a, 'cambiar_precios', 'organization', a.org.id, patch);
        return org!;
      });
      return c.json(pricingJson(org), 200);
    },
  );

  r.openapi(
    createRoute({ method: 'get', path: '/exchange-rates', tags: ['Precios'], summary: 'Historial de tasas RD$/US$', security, responses: { 200: json(z.object({ current: z.number(), items: z.array(Rate) })), ...authErrors } }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'pricing:read');
      const rows = await c.var.deps.db.select().from(exchangeRates).where(eq(exchangeRates.organizationId, a.org.id)).orderBy(desc(exchangeRates.validFrom)).limit(200);
      return c.json(
        { current: a.org.exchangeRateDopPerUsd, items: rows.map((x) => ({ id: x.id, dopPerUsd: x.dopPerUsd, validFrom: x.validFrom.toISOString(), createdBy: x.createdBy })) },
        200,
      );
    },
  );

  r.openapi(
    createRoute({
      method: 'post',
      path: '/exchange-rates',
      tags: ['Precios'],
      summary: 'Registrar una tasa nueva y volverla vigente (solo admin)',
      security,
      request: body(z.object({ dopPerUsd: z.number().positive().max(10_000) }).openapi({ example: { dopPerUsd: 63.5 } })),
      responses: { 201: json(Rate, 'Creada'), ...authErrors },
    }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'pricing:write');
      const { dopPerUsd } = c.req.valid('json');
      const row = await c.var.deps.db.transaction(async (tx) => {
        const [row] = await tx.insert(exchangeRates).values({ organizationId: a.org.id, dopPerUsd, createdBy: a.user.id }).returning();
        await tx.update(organizations).set({ exchangeRateDopPerUsd: dopPerUsd, rateUpdatedAt: new Date() }).where(eq(organizations.id, a.org.id));
        await audit(tx, a, 'cambiar_tasa', 'organization', a.org.id, { from: a.org.exchangeRateDopPerUsd, to: dopPerUsd });
        return row!;
      });
      return c.json({ id: row.id, dopPerUsd: row.dopPerUsd, validFrom: row.validFrom.toISOString(), createdBy: row.createdBy }, 201);
    },
  );

  return r;
}
