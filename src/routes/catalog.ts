import { createRoute, z } from '@hono/zod-openapi';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { GROUPS, round2 } from '../core';
import { files, hardwarePrices, materials, moduleDefinitions } from '../db/schema';
import { audit } from '../lib/audit';
import type { Organization } from '../lib/context';
import { sha256 } from '../lib/crypto';
import { notFound } from '../lib/errors';
import { money } from '../lib/money';
import { authErrors, body, CurrencyQuery, IdParam, json, pick, router, security } from '../lib/openapi';
import { assertCan } from '../lib/permissions';
import { requireAuth } from '../services/auth';
import {
  createHardware,
  createMaterial,
  createModule,
  HardwareInput,
  MaterialInput,
  ModuleInput,
  serialize,
  updateHardware,
  updateMaterial,
  updateModule,
} from '../services/catalog-admin';
import { loadPricingContext, settingsOf } from '../services/catalog';
import type { Db } from '../db/client';
import { requireFeature } from '../lib/plans';

const Any = z.record(z.string(), z.unknown());
const Items = z.object({ items: z.array(Any) });

export const pricingJson = (org: Organization) => ({ ...settingsOf(org), rateUpdatedAt: org.rateUpdatedAt?.toISOString() ?? null });

type Cur = 'USD' | 'DOP' | undefined;

/** Materials with the URLs of their texture maps and thumbnails. */
export async function materialsWithMaps(db: Db, orgId: string, onlyActive: boolean) {
  const rows = await db
    .select()
    .from(materials)
    .where(and(eq(materials.organizationId, orgId), onlyActive ? eq(materials.active, true) : undefined))
    .orderBy(asc(materials.sort), asc(materials.name));
  const ids = rows.flatMap((r) => [r.baseColorFileId, r.normalFileId, r.roughnessFileId, r.aoFileId, r.metalnessFileId]).filter((x): x is string => !!x);
  const fileRows = ids.length ? await db.select().from(files).where(inArray(files.id, ids)) : [];
  const byId = new Map(fileRows.map((f) => [f.id, f]));
  const mapOf = (id: string | null) => {
    const f = id ? byId.get(id) : undefined;
    return f ? { fileId: f.id, url: f.variants.view2k ?? f.blobUrl, original: f.variants.original ?? f.blobUrl, thumb: f.variants.thumb ?? null, width: f.width, height: f.height } : null;
  };
  return rows.map((r) => ({
    ...serialize(r),
    id: r.id,
    source: r.source,
    maps: { baseColor: mapOf(r.baseColorFileId), normal: mapOf(r.normalFileId), roughness: mapOf(r.roughnessFileId), ao: mapOf(r.aoFileId), metalness: mapOf(r.metalnessFileId) },
  }));
}

const withPrice = (row: Record<string, unknown>, amountKey: string, org: Organization, currency: Cur) => ({
  ...row,
  price: money(row[amountKey] as number, row.priceCurrency as 'USD' | 'DOP', currency, org.exchangeRateDopPerUsd),
});

export function catalogRoutes() {
  const r = router();

  r.openapi(
    createRoute({
      method: 'get',
      path: '/catalog',
      tags: ['Catálogo'],
      summary: 'Catálogo de la organización para el editor',
      description:
        'Módulos, materiales (con URLs de mapas y miniaturas), herrajes y configuración de precios. Responde con `ETag` y `Cache-Control`; con `If-None-Match` igual devuelve 304. ' +
        'Cada precio incluye `price` convertido a `?currency`.',
      security,
      request: { query: CurrencyQuery },
      responses: {
        200: json(z.object({ modules: z.array(Any), materials: z.array(Any), hardware: z.array(Any), groups: z.array(Any), pricing: Any, context: Any.openapi({ description: 'PricingContext de src/core (incluye inactivos para marcar descontinuados).' }) })),
        304: { description: 'Sin cambios' },
        ...authErrors,
      },
    }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'catalog:read');
      const { db } = c.var.deps;
      const cur = c.req.valid('query').currency;
      const [mods, mats, hw, context] = await Promise.all([
        db.select().from(moduleDefinitions).where(and(eq(moduleDefinitions.organizationId, a.org.id), eq(moduleDefinitions.active, true))).orderBy(asc(moduleDefinitions.sort), asc(moduleDefinitions.name)),
        materialsWithMaps(db, a.org.id, true),
        db.select().from(hardwarePrices).where(and(eq(hardwarePrices.organizationId, a.org.id), eq(hardwarePrices.active, true))).orderBy(asc(hardwarePrices.code)),
        loadPricingContext(db, a.org),
      ]);
      const payload = {
        modules: mods.map((m) => withPrice(serialize(m), 'unitPrice', a.org, cur)),
        materials: mats.map((m) => withPrice(m, 'priceM2', a.org, cur)),
        hardware: hw.map((h) => withPrice(serialize(h), 'unitPrice', a.org, cur)),
        groups: GROUPS.map((g) => ({ k: g.k, label: g.label })),
        pricing: pricingJson(a.org),
        // Exactly what the server feeds to src/core (computeEstimate / validateProject), so the editor matches it.
        context,
      };
      const text = JSON.stringify(payload);
      const etag = `"${sha256(text).slice(0, 32)}"`;
      c.header('ETag', etag);
      c.header('Cache-Control', 'private, max-age=60, must-revalidate');
      c.header('Vary', 'Cookie, Authorization');
      if (c.req.header('if-none-match') === etag) return c.body(null, 304);
      return c.json(payload, 200);
    },
  );

  // ---------- admin CRUD ----------
  const admin = (tag: string) => ({ tags: [tag], security });

  r.openapi(createRoute({ method: 'get', path: '/admin/modules', ...admin('Catálogo (admin)'), summary: 'Listar módulos (incluye inactivos)', responses: { 200: json(Items), ...authErrors } }), async (c) => {
    const a = requireAuth(c);
    assertCan(a.user, 'catalog:admin');
    const rows = await c.var.deps.db.select().from(moduleDefinitions).where(eq(moduleDefinitions.organizationId, a.org.id)).orderBy(asc(moduleDefinitions.sort), asc(moduleDefinitions.code));
    return c.json({ items: rows.map(serialize) }, 200);
  });
  r.openapi(
    createRoute({ method: 'post', path: '/admin/modules', ...admin('Catálogo (admin)'), summary: 'Crear módulo (valida min_w ≤ def_w ≤ max_w)', request: body(ModuleInput), responses: { 201: json(Any, 'Creado'), ...authErrors, ...pick(409, 422) } }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'catalog:admin');
      const row = await c.var.deps.db.transaction((tx) => createModule(tx, a, c.req.valid('json')));
      return c.json(serialize(row), 201);
    },
  );
  r.openapi(
    createRoute({ method: 'patch', path: '/admin/modules/{id}', ...admin('Catálogo (admin)'), summary: 'Editar módulo (incrementa version)', request: { params: IdParam, ...body(ModuleInput.partial()) }, responses: { 200: json(Any), ...authErrors, ...pick(409, 422) } }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'catalog:admin');
      const row = await c.var.deps.db.transaction((tx) => updateModule(tx, a, c.req.valid('param').id, c.req.valid('json')));
      return c.json(serialize(row), 200);
    },
  );
  r.openapi(
    createRoute({ method: 'delete', path: '/admin/modules/{id}', ...admin('Catálogo (admin)'), summary: 'Descontinuar módulo (active=false)', description: 'No se borra: los proyectos que lo usan lo muestran como "Descontinuado".', request: { params: IdParam }, responses: { 204: { description: 'Descontinuado' }, ...authErrors } }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'catalog:admin');
      await c.var.deps.db.transaction((tx) => updateModule(tx, a, c.req.valid('param').id, { active: false }));
      return c.body(null, 204);
    },
  );

  r.openapi(createRoute({ method: 'get', path: '/admin/materials', ...admin('Catálogo (admin)'), summary: 'Listar materiales (incluye inactivos)', responses: { 200: json(Items), ...authErrors } }), async (c) => {
    const a = requireAuth(c);
    assertCan(a.user, 'catalog:admin');
    return c.json({ items: await materialsWithMaps(c.var.deps.db, a.org.id, false) }, 200);
  });
  r.openapi(
    createRoute({ method: 'post', path: '/admin/materials', ...admin('Catálogo (admin)'), summary: 'Crear material', request: body(MaterialInput), responses: { 201: json(Any, 'Creado'), ...authErrors, ...pick(409) } }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'catalog:admin');
      const row = await c.var.deps.db.transaction((tx) => createMaterial(tx, a, c.req.valid('json')));
      return c.json(serialize(row), 201);
    },
  );
  r.openapi(
    createRoute({ method: 'patch', path: '/admin/materials/{id}', ...admin('Catálogo (admin)'), summary: 'Editar material (incrementa version)', request: { params: IdParam, ...body(MaterialInput.partial()) }, responses: { 200: json(Any), ...authErrors, ...pick(409) } }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'catalog:admin');
      const row = await c.var.deps.db.transaction((tx) => updateMaterial(tx, a, c.req.valid('param').id, c.req.valid('json')));
      return c.json(serialize(row), 200);
    },
  );
  r.openapi(
    createRoute({ method: 'delete', path: '/admin/materials/{id}', ...admin('Catálogo (admin)'), summary: 'Descontinuar material (active=false)', request: { params: IdParam }, responses: { 204: { description: 'Descontinuado' }, ...authErrors } }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'catalog:admin');
      await c.var.deps.db.transaction((tx) => updateMaterial(tx, a, c.req.valid('param').id, { active: false }));
      return c.body(null, 204);
    },
  );

  r.openapi(createRoute({ method: 'get', path: '/admin/hardware', ...admin('Catálogo (admin)'), summary: 'Listar herrajes', responses: { 200: json(Items), ...authErrors } }), async (c) => {
    const a = requireAuth(c);
    assertCan(a.user, 'catalog:admin');
    const rows = await c.var.deps.db.select().from(hardwarePrices).where(eq(hardwarePrices.organizationId, a.org.id)).orderBy(asc(hardwarePrices.code));
    return c.json({ items: rows.map(serialize) }, 200);
  });
  r.openapi(
    createRoute({ method: 'post', path: '/admin/hardware', ...admin('Catálogo (admin)'), summary: 'Crear herraje', request: body(HardwareInput), responses: { 201: json(Any, 'Creado'), ...authErrors, ...pick(409) } }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'catalog:admin');
      const row = await c.var.deps.db.transaction((tx) => createHardware(tx, a, c.req.valid('json')));
      return c.json(serialize(row), 201);
    },
  );
  r.openapi(
    createRoute({ method: 'patch', path: '/admin/hardware/{id}', ...admin('Catálogo (admin)'), summary: 'Editar herraje', request: { params: IdParam, ...body(HardwareInput.partial()) }, responses: { 200: json(Any), ...authErrors, ...pick(409) } }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'catalog:admin');
      const row = await c.var.deps.db.transaction((tx) => updateHardware(tx, a, c.req.valid('param').id, c.req.valid('json')));
      return c.json(serialize(row), 200);
    },
  );
  r.openapi(
    createRoute({ method: 'delete', path: '/admin/hardware/{id}', ...admin('Catálogo (admin)'), summary: 'Desactivar herraje', request: { params: IdParam }, responses: { 204: { description: 'Desactivado' }, ...authErrors } }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'catalog:admin');
      await c.var.deps.db.transaction((tx) => updateHardware(tx, a, c.req.valid('param').id, { active: false }));
      return c.body(null, 204);
    },
  );

  // ---------- bulk price adjustment ----------
  r.openapi(
    createRoute({
      method: 'post',
      path: '/admin/prices/bulk',
      tags: ['Precios'],
      summary: 'Ajuste masivo de precios',
      description: 'Sube o baja un porcentaje los precios de materiales, herrajes o módulos (opcionalmente de una categoría). Con `?dryRun=true` solo devuelve la vista previa.',
      security,
      request: {
        query: z.object({ dryRun: z.enum(['true', 'false']).optional() }),
        ...body(
          z
            .object({ scope: z.enum(['materials', 'hardware', 'modules']), category: z.string().max(60).optional(), percent: z.number().min(-90).max(500) })
            .openapi({ example: { scope: 'materials', category: 'Melamina', percent: 5 } }),
        ),
      },
      responses: {
        200: json(z.object({ dryRun: z.boolean(), count: z.number(), items: z.array(z.object({ id: z.uuid(), code: z.string(), name: z.string(), from: z.number(), to: z.number(), currency: z.string() })) })),
        ...authErrors,
      },
    }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'pricing:write');
      requireFeature(c.var.deps.config, a, 'bulkPrices');
      const { db } = c.var.deps;
      const dryRun = c.req.valid('query').dryRun === 'true';
      const { scope, category, percent } = c.req.valid('json');
      const factor = 1 + percent / 100;
      const out = await db.transaction(async (tx) => {
        const table = scope === 'materials' ? materials : scope === 'modules' ? moduleDefinitions : hardwarePrices;
        const priceCol = scope === 'materials' ? materials.priceM2 : scope === 'modules' ? moduleDefinitions.unitPrice : hardwarePrices.unitPrice;
        const catCond = category && scope !== 'hardware' ? eq(scope === 'materials' ? materials.category : moduleDefinitions.category, category) : undefined;
        const rows = (await tx
          .select()
          .from(table)
          .where(and(eq(table.organizationId, a.org.id), catCond))) as { id: string; code: string; name: string; priceCurrency: string; priceM2?: number; unitPrice?: number }[];
        const items = rows.map((r0) => {
          const from = (scope === 'materials' ? r0.priceM2 : r0.unitPrice) ?? 0;
          return { id: r0.id, code: r0.code, name: r0.name, from, to: round2(from * factor), currency: r0.priceCurrency };
        });
        if (!dryRun && items.length) {
          const versioned = scope !== 'hardware' ? { version: sql`version + 1` } : {};
          await tx
            .update(table)
            .set({ [scope === 'materials' ? 'priceM2' : 'unitPrice']: sql`round(${priceCol} * ${factor}::numeric, 2)`, ...versioned } as never)
            .where(inArray(table.id, items.map((i) => i.id)));
          await audit(tx, a, 'cambiar_precios', scope, null, { percent, category: category ?? null, count: items.length });
        }
        return items;
      });
      return c.json({ dryRun, count: out.length, items: out }, 200);
    },
  );

  void notFound;
  return r;
}
