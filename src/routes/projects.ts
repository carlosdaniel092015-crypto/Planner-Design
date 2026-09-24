import { createRoute, z } from '@hono/zod-openapi';
import { and, desc, eq, ilike, isNull, sql } from 'drizzle-orm';
import { bodyLimit } from 'hono/body-limit';
import { DEFAULT_KITCHEN, hasErrors, newProject, type ProjectData } from '../core';
import type { DbOrTx } from '../db/client';
import { clients, projects, projectVersions } from '../db/schema';
import { audit } from '../lib/audit';
import type { AuthContext } from '../lib/context';
import { AppError, conflict, notFound } from '../lib/errors';
import { money, MoneySchema } from '../lib/money';
import { authErrors, body, CurrencyQuery, IdParam, json, pick, router, security } from '../lib/openapi';
import { afterCursor, page, paginationQuery } from '../lib/pagination';
import { assertCan } from '../lib/permissions';
import { requireAuth } from '../services/auth';
import { loadPricingContext } from '../services/catalog';
import {
  createVersion,
  derive,
  getProject,
  getVersion,
  listVersions,
  parseProjectData,
  pricingFor,
  type ProjectRow,
  rowValuesFrom,
  type VersionRow,
} from '../services/projects';

const tags = ['Proyectos'];
const Status = z.enum(['borrador', 'diseno', 'enviado', 'cambios_solicitados', 'aprobado']).openapi('EstadoProyecto');
const Currency = z.enum(['USD', 'DOP']);

const ProjectSummary = z
  .object({
    id: z.uuid(),
    name: z.string(),
    type: z.enum(['cocina', 'closet']),
    status: Status,
    phase: z.number().int(),
    ownerId: z.uuid(),
    clientId: z.uuid().nullable(),
    currency: Currency,
    estimate: MoneySchema,
    moduleCount: z.number().int(),
    version: z.number().int(),
    coverUrl: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi('ProyectoResumen');

const Issue = z.object({ st: z.enum(['ok', 'warn', 'err']), code: z.string(), text: z.string(), id: z.number().optional() }).openapi('Aviso');

const ProjectDetail = ProjectSummary.extend({
  data: z.record(z.string(), z.unknown()),
  estimateDetail: z.record(z.string(), z.unknown()).openapi({ description: 'Desglose del presupuesto (core computeEstimate).' }),
  discontinued: z.array(z.string()).openapi({ description: 'Códigos de módulos o materiales descontinuados que usa el proyecto.' }),
  pricesFrozen: z.boolean().openapi({ description: 'true si los importes vienen del snapshot de la versión aprobada.' }),
}).openapi('Proyecto');

const DataField = z.record(z.string(), z.unknown()).openapi({ description: 'JSON completo del proyecto (esquema de src/core).', example: DEFAULT_KITCHEN });

const CreateBody = z
  .object({
    name: z.string().min(1).max(160).optional(),
    clientId: z.uuid().nullable().optional(),
    ptype: z.enum(['cocina', 'closet', 'vestidor']).optional().openapi({ description: 'Si no envías data, se crea con la plantilla del tipo.' }),
    currency: Currency.optional(),
    data: DataField.optional(),
    clientRef: z
      .string()
      .regex(/^[A-Za-z0-9_-]{8,64}$/)
      .optional()
      .openapi({ description: 'Id local de un proyecto creado sin conexión. Si ya existe un proyecto tuyo con esa referencia se devuelve ese (200) en vez de crear otro.' }),
  })
  .openapi('ProyectoNuevo');

const UpdateBody = z
  .object({
    version: z.number().int().positive().optional().openapi({ description: 'Versión que editaste. También puede ir en If-Match.' }),
    name: z.string().min(1).max(160).optional(),
    clientId: z.uuid().nullable().optional(),
    phase: z.number().int().min(1).max(6).optional(),
    status: z.enum(['borrador', 'diseno']).optional(),
    currency: Currency.optional(),
    coverUrl: z.string().max(2000).nullable().optional(),
    data: DataField,
  })
  .openapi('ProyectoCambios');

const VersionSummary = z
  .object({
    id: z.uuid(),
    version: z.number().int(),
    note: z.string().nullable(),
    estimate: MoneySchema,
    createdBy: z.uuid().nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi('VersionResumen');
const VersionDetail = VersionSummary.extend({ data: z.record(z.string(), z.unknown()), pricingSnapshot: z.record(z.string(), z.unknown()) }).openapi('Version');

const VidParam = IdParam.extend({ vid: z.uuid().openapi({ param: { name: 'vid', in: 'path' } }) });

function summary(row: ProjectRow, rate: number, currency?: 'USD' | 'DOP') {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    phase: row.phase,
    ownerId: row.ownerId,
    clientId: row.clientId,
    currency: row.currency,
    estimate: money(row.estimate, row.estimateCurrency, currency ?? row.currency, rate),
    moduleCount: row.moduleCount,
    version: row.version,
    coverUrl: row.coverUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function detail(db: DbOrTx, a: AuthContext, row: ProjectRow, currency?: 'USD' | 'DOP') {
  const { ctx, frozen } = await pricingFor(db, a, row);
  const data = parseProjectData(row.data);
  const cur = currency ?? row.currency;
  const { estimate, issues } = derive(data, ctx, cur);
  const discontinued = [...new Set(issues.filter((i) => i.code === 'DESCONTINUADO').map((i) => i.text))];
  return {
    ...summary(row, ctx.settings.exchangeRateDopPerUsd, cur),
    // Detail uses the exact recomputation in the requested currency (not a converted total).
    estimate: { amount: estimate.total, currency: estimate.currency, rate: estimate.rate },
    data: row.data,
    estimateDetail: estimate as unknown as Record<string, unknown>,
    discontinued,
    pricesFrozen: frozen,
  };
}

function versionSummary(v: VersionRow, currency?: 'USD' | 'DOP') {
  const rate = (v.pricingSnapshot as { settings?: { exchangeRateDopPerUsd?: number } }).settings?.exchangeRateDopPerUsd ?? 1;
  return {
    id: v.id,
    version: v.version,
    note: v.note,
    estimate: money(v.estimate, v.estimateCurrency, currency, rate),
    createdBy: v.createdBy,
    createdAt: v.createdAt.toISOString(),
  };
}

async function assertClient(db: DbOrTx, orgId: string, clientId: string | null | undefined) {
  if (!clientId) return;
  const [c] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, orgId), isNull(clients.deletedAt)));
  if (!c) throw notFound('El cliente');
}

export function projectRoutes() {
  const r = router();
  const limit = bodyLimit({
    maxSize: 2 * 1024 * 1024,
    onError: () => {
      throw new AppError(413, 'PROYECTO_DEMASIADO_GRANDE', 'El JSON del proyecto supera el máximo de 2 MB.');
    },
  });
  r.post('/', limit);
  r.put('/:id', limit);

  // ----- list -----
  r.openapi(
    createRoute({
      method: 'get',
      path: '/',
      tags,
      summary: 'Listar proyectos (sin el campo data)',
      security,
      request: {
        query: z.object({
          status: Status.optional(),
          type: z.enum(['cocina', 'closet']).optional(),
          q: z.string().max(100).optional(),
          ...paginationQuery,
          ...CurrencyQuery.shape,
        }),
      },
      responses: { 200: json(z.object({ items: z.array(ProjectSummary), nextCursor: z.string().nullable() })), ...authErrors },
    }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'project:read');
      const { db } = c.var.deps;
      const { status, type, q, cursor, limit: lim, currency } = c.req.valid('query');
      const like = q ? `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : undefined;
      const onlyApproved = a.user.role === 'taller';
      const rows = await db
        .select({
          p: projects,
          frozenRate: sql<string | null>`(${projectVersions.pricingSnapshot} -> 'settings' ->> 'exchangeRateDopPerUsd')`,
        })
        .from(projects)
        .leftJoin(projectVersions, eq(projectVersions.id, projects.approvedVersionId))
        .where(
          and(
            eq(projects.organizationId, a.org.id),
            isNull(projects.deletedAt),
            onlyApproved ? eq(projects.status, 'aprobado') : status ? eq(projects.status, status) : undefined,
            type ? eq(projects.type, type) : undefined,
            like ? ilike(projects.name, like) : undefined,
            afterCursor(projects.updatedAt, projects.id, cursor),
          ),
        )
        .orderBy(desc(projects.updatedAt), desc(projects.id))
        .limit(lim + 1);
      const p = page(rows, lim, (x) => ({ t: x.p.updatedAt, id: x.p.id }));
      const orgRate = a.org.exchangeRateDopPerUsd;
      return c.json(
        {
          items: p.items.map((x) => summary(x.p, x.p.status === 'aprobado' && x.frozenRate ? Number(x.frozenRate) : orgRate, currency)),
          nextCursor: p.nextCursor,
        },
        200,
      );
    },
  );

  // ----- create -----
  r.openapi(
    createRoute({
      method: 'post',
      path: '/',
      tags,
      summary: 'Crear proyecto',
      description: 'Valida `data` con el esquema de src/core y calcula en el servidor el estimado y el número de módulos. Sin `data`, usa la plantilla del prototipo.',
      security,
      request: body(CreateBody),
      responses: { 201: json(ProjectDetail, 'Creado'), 200: json(ProjectDetail, 'Ya existía (misma clientRef)'), ...authErrors, ...pick(409, 413) },
    }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'project:create');
      const { db } = c.var.deps;
      const input = c.req.valid('json');
      if (input.clientRef) {
        const [prev] = await db.select().from(projects).where(and(eq(projects.organizationId, a.org.id), eq(projects.clientRef, input.clientRef))).limit(1);
        if (prev) {
          if (prev.ownerId !== a.user.id) throw new AppError(409, 'REFERENCIA_EN_USO', 'La referencia del proyecto ya está en uso.');
          if (prev.deletedAt) throw notFound('El proyecto');
          return c.json(await detail(db, a, prev), 200);
        }
      }
      const data: ProjectData = input.data ? parseProjectData(input.data) : parseProjectData(newProject(input.ptype ?? 'cocina', input.name));
      if (input.name) data.pname = input.name;
      await assertClient(db, a.org.id, input.clientId);
      const row = await db.transaction(async (tx) => {
        const ctx = await loadPricingContext(tx, a.org);
        const [row] = await tx
          .insert(projects)
          .values({
            organizationId: a.org.id,
            ownerId: a.user.id,
            clientId: input.clientId ?? null,
            name: data.pname,
            data: data as Record<string, unknown>,
            currency: input.currency ?? a.org.baseCurrency,
            clientRef: input.clientRef ?? null,
            ...rowValuesFrom(data, ctx),
          })
          .returning();
        await audit(tx, a, 'crear', 'project', row!.id, { name: row!.name });
        return row!;
      });
      return c.json(await detail(db, a, row), 201);
    },
  );

  // ----- get -----
  r.openapi(
    createRoute({
      method: 'get',
      path: '/{id}',
      tags,
      summary: 'Obtener proyecto con data, desglose del estimado y descontinuados',
      security,
      request: { params: IdParam, query: CurrencyQuery },
      responses: { 200: json(ProjectDetail), ...authErrors },
    }),
    async (c) => {
      const a = requireAuth(c);
      const { db } = c.var.deps;
      const row = await getProject(db, a, c.req.valid('param').id);
      return c.json(await detail(db, a, row, c.req.valid('query').currency), 200);
    },
  );

  // ----- update (optimistic concurrency) -----
  r.openapi(
    createRoute({
      method: 'put',
      path: '/{id}',
      tags,
      summary: 'Guardar proyecto (control optimista de versión)',
      description:
        'Exige `version` en el cuerpo o en `If-Match`. Si no coincide con la actual responde **409** con `details.currentVersion`. ' +
        'Al pasar a fase 3 se crea una versión automáticamente. Un proyecto aprobado no se edita: duplícalo.',
      security,
      request: { params: IdParam, ...body(UpdateBody) },
      responses: { 200: json(ProjectDetail), ...authErrors, ...pick(409, 413) },
    }),
    async (c) => {
      const a = requireAuth(c);
      const { db } = c.var.deps;
      const { id } = c.req.valid('param');
      const input = c.req.valid('json');
      const ifMatch = c.req.header('if-match')?.replace(/^W\//, '').replace(/"/g, '');
      const expected = input.version ?? (ifMatch ? Number(ifMatch) : undefined);
      if (!expected || !Number.isInteger(expected)) throw new AppError(428, 'VERSION_REQUERIDA', 'Envía la versión que editaste en "version" o en el encabezado If-Match.');
      const data = parseProjectData(input.data);
      await assertClient(db, a.org.id, input.clientId);
      const row = await db.transaction(async (tx) => {
        const cur = await getProject(tx, a, id);
        assertCan(a.user, 'project:update', { ownerId: cur.ownerId, status: cur.status });
        if (cur.status === 'aprobado') throw conflict('PROYECTO_APROBADO', 'El proyecto ya está aprobado y no se puede editar. Duplícalo para hacer cambios.');
        const ctx = await loadPricingContext(tx, a.org);
        const [row] = await tx
          .update(projects)
          .set({
            name: input.name ?? data.pname,
            ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
            ...(input.phase !== undefined ? { phase: input.phase } : {}),
            ...(input.status ? { status: input.status } : {}),
            ...(input.currency ? { currency: input.currency } : {}),
            ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl } : {}),
            data: data as Record<string, unknown>,
            ...rowValuesFrom(data, ctx),
            version: sql`${projects.version} + 1`,
          })
          .where(and(eq(projects.id, id), eq(projects.version, expected)))
          .returning();
        if (!row) throw conflict('VERSION_DESACTUALIZADA', 'Alguien más guardó cambios. Recarga el proyecto antes de guardar.', { currentVersion: cur.version });
        if (input.phase !== undefined && input.phase >= 3 && cur.phase < 3) await createVersion(tx, row, data, ctx, 'Paso a fase 3', a.user.id);
        await audit(tx, a, 'actualizar', 'project', id, { version: row.version });
        return row;
      });
      c.header('ETag', `"${row.version}"`);
      return c.json(await detail(db, a, row), 200);
    },
  );

  // ----- duplicate -----
  r.openapi(
    createRoute({
      method: 'post',
      path: '/{id}/duplicate',
      tags,
      summary: 'Duplicar proyecto',
      security,
      request: { params: IdParam },
      responses: { 201: json(ProjectDetail, 'Creado'), ...authErrors },
    }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'project:create');
      const { db } = c.var.deps;
      const row = await db.transaction(async (tx) => {
        const src = await getProject(tx, a, c.req.valid('param').id);
        const data = parseProjectData(src.data);
        data.pname = `${src.name} (copia)`;
        const ctx = await loadPricingContext(tx, a.org);
        const [row] = await tx
          .insert(projects)
          .values({
            organizationId: a.org.id,
            ownerId: a.user.id,
            clientId: src.clientId,
            name: data.pname,
            phase: Math.min(src.phase, 2),
            data: data as Record<string, unknown>,
            currency: src.currency,
            coverUrl: src.coverUrl,
            ...rowValuesFrom(data, ctx),
          })
          .returning();
        await audit(tx, a, 'crear', 'project', row!.id, { duplicatedFrom: src.id });
        return row!;
      });
      return c.json(await detail(db, a, row), 201);
    },
  );

  // ----- delete -----
  r.openapi(
    createRoute({
      method: 'delete',
      path: '/{id}',
      tags,
      summary: 'Eliminar proyecto (borrado lógico)',
      security,
      request: { params: IdParam },
      responses: { 204: { description: 'Eliminado' }, ...authErrors },
    }),
    async (c) => {
      const a = requireAuth(c);
      const { db } = c.var.deps;
      await db.transaction(async (tx) => {
        const cur = await getProject(tx, a, c.req.valid('param').id);
        assertCan(a.user, 'project:delete', { ownerId: cur.ownerId });
        await tx.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, cur.id));
        await audit(tx, a, 'eliminar', 'project', cur.id);
      });
      return c.body(null, 204);
    },
  );

  // ----- validate -----
  r.openapi(
    createRoute({
      method: 'get',
      path: '/{id}/validate',
      tags,
      summary: 'Ejecutar las reglas de src/core',
      description: 'Devuelve los mismos avisos que el editor (`ok`, `warn`, `err`). Con errores (`err`) no se puede aprobar.',
      security,
      request: { params: IdParam },
      responses: {
        200: json(z.object({ issues: z.array(Issue), errors: z.number(), warnings: z.number(), canApprove: z.boolean() })),
        ...authErrors,
      },
    }),
    async (c) => {
      const a = requireAuth(c);
      const { db } = c.var.deps;
      const row = await getProject(db, a, c.req.valid('param').id);
      const { ctx } = await pricingFor(db, a, row);
      const { issues } = derive(parseProjectData(row.data), ctx);
      const ord = { err: 0, warn: 1, ok: 2 } as const;
      issues.sort((x, y) => ord[x.st] - ord[y.st]);
      return c.json(
        { issues, errors: issues.filter((i) => i.st === 'err').length, warnings: issues.filter((i) => i.st === 'warn').length, canApprove: !hasErrors(issues) },
        200,
      );
    },
  );

  // ----- versions -----
  const vtags = ['Versiones'];
  r.openapi(
    createRoute({
      method: 'get',
      path: '/{id}/versions',
      tags: vtags,
      summary: 'Historial de versiones',
      security,
      request: { params: IdParam, query: CurrencyQuery },
      responses: { 200: json(z.object({ items: z.array(VersionSummary) })), ...authErrors },
    }),
    async (c) => {
      const a = requireAuth(c);
      const { db } = c.var.deps;
      const row = await getProject(db, a, c.req.valid('param').id);
      const cur = c.req.valid('query').currency;
      return c.json({ items: (await listVersions(db, row.id)).map((v) => versionSummary(v, cur)) }, 200);
    },
  );

  r.openapi(
    createRoute({
      method: 'post',
      path: '/{id}/versions',
      tags: vtags,
      summary: 'Crear versión manual (congela datos y precios)',
      security,
      request: { params: IdParam, ...body(z.object({ note: z.string().max(500).optional() }).openapi({ example: { note: 'Antes de cambiar la encimera' } })) },
      responses: { 201: json(VersionSummary, 'Creada'), ...authErrors },
    }),
    async (c) => {
      const a = requireAuth(c);
      const { db } = c.var.deps;
      const v = await db.transaction(async (tx) => {
        const row = await getProject(tx, a, c.req.valid('param').id);
        assertCan(a.user, 'project:update', { ownerId: row.ownerId });
        const { ctx } = await pricingFor(tx, a, row);
        const v = await createVersion(tx, row, parseProjectData(row.data), ctx, c.req.valid('json').note ?? null, a.user.id);
        await audit(tx, a, 'crear', 'project_version', v.id, { projectId: row.id, version: v.version });
        return v;
      });
      return c.json(versionSummary(v), 201);
    },
  );

  r.openapi(
    createRoute({
      method: 'get',
      path: '/{id}/versions/{vid}',
      tags: vtags,
      summary: 'Obtener versión con su data y snapshot de precios',
      security,
      request: { params: VidParam, query: CurrencyQuery },
      responses: { 200: json(VersionDetail), ...authErrors },
    }),
    async (c) => {
      const a = requireAuth(c);
      const { db } = c.var.deps;
      const { id, vid } = c.req.valid('param');
      const row = await getProject(db, a, id);
      const v = await getVersion(db, row.id, vid);
      return c.json({ ...versionSummary(v, c.req.valid('query').currency), data: v.data, pricingSnapshot: v.pricingSnapshot }, 200);
    },
  );

  r.openapi(
    createRoute({
      method: 'post',
      path: '/{id}/versions/{vid}/restore',
      tags: vtags,
      summary: 'Restaurar una versión',
      description: 'Copia la data de la versión al proyecto (incrementa `version`) y recalcula el estimado con los precios vigentes.',
      security,
      request: { params: VidParam },
      responses: { 200: json(ProjectDetail), ...authErrors, ...pick(409) },
    }),
    async (c) => {
      const a = requireAuth(c);
      const { db } = c.var.deps;
      const { id, vid } = c.req.valid('param');
      const row = await db.transaction(async (tx) => {
        const cur = await getProject(tx, a, id);
        assertCan(a.user, 'project:update', { ownerId: cur.ownerId });
        if (cur.status === 'aprobado') throw conflict('PROYECTO_APROBADO', 'El proyecto ya está aprobado y no se puede editar. Duplícalo para hacer cambios.');
        const v = await getVersion(tx, cur.id, vid);
        const data = parseProjectData(v.data);
        const ctx = await loadPricingContext(tx, a.org);
        const [row] = await tx
          .update(projects)
          .set({ data: data as Record<string, unknown>, name: data.pname, ...rowValuesFrom(data, ctx), version: sql`${projects.version} + 1` })
          .where(eq(projects.id, cur.id))
          .returning();
        await audit(tx, a, 'restaurar', 'project', cur.id, { versionId: v.id, version: v.version });
        return row!;
      });
      return c.json(await detail(db, a, row), 200);
    },
  );

  return r;
}
