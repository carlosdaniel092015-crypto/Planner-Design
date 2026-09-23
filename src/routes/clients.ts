import { createRoute, z } from '@hono/zod-openapi';
import { and, desc, eq, ilike, isNull, or } from 'drizzle-orm';
import { clients } from '../db/schema';
import { audit } from '../lib/audit';
import { notFound } from '../lib/errors';
import { authErrors, body, IdParam, json, router, security } from '../lib/openapi';
import { afterCursor, page, paginationQuery } from '../lib/pagination';
import { assertCan } from '../lib/permissions';
import { requireAuth } from '../services/auth';

const ClientSchema = z
  .object({
    id: z.uuid(),
    ownerId: z.uuid().nullable(),
    name: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    address: z.string().nullable(),
    notes: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi('Cliente');

const ClientInput = z
  .object({
    name: z.string().min(1).max(160),
    email: z.email().nullable().optional(),
    phone: z.string().max(40).nullable().optional(),
    address: z.string().max(400).nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
  })
  .openapi('ClienteEntrada', { example: { name: 'Familia Ortega', email: 'ortega@ejemplo.com', phone: '809 555 0101', address: 'Av. Winston Churchill 1020, Santo Domingo' } });

const toClient = (r: typeof clients.$inferSelect) => ({
  id: r.id,
  ownerId: r.ownerId,
  name: r.name,
  email: r.email,
  phone: r.phone,
  address: r.address,
  notes: r.notes,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

const tags = ['Clientes'];

export function clientRoutes() {
  const r = router();

  const getOwned = async (orgId: string, id: string, db: import('../db/client').DbOrTx) => {
    const [row] = await db
      .select()
      .from(clients)
      .where(and(eq(clients.id, id), eq(clients.organizationId, orgId), isNull(clients.deletedAt)))
      .limit(1);
    if (!row) throw notFound('El cliente');
    return row;
  };

  r.openapi(
    createRoute({
      method: 'get',
      path: '/',
      tags,
      summary: 'Buscar clientes',
      security,
      request: { query: z.object({ q: z.string().max(100).optional(), ...paginationQuery }) },
      responses: { 200: json(z.object({ items: z.array(ClientSchema), nextCursor: z.string().nullable() })), ...authErrors },
    }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'client:read');
      const { q, cursor, limit } = c.req.valid('query');
      const like = q ? `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : undefined;
      const rows = await c.var.deps.db
        .select()
        .from(clients)
        .where(
          and(
            eq(clients.organizationId, a.org.id),
            isNull(clients.deletedAt),
            like ? or(ilike(clients.name, like), ilike(clients.email, like), ilike(clients.phone, like)) : undefined,
            afterCursor(clients.updatedAt, clients.id, cursor),
          ),
        )
        .orderBy(desc(clients.updatedAt), desc(clients.id))
        .limit(limit + 1);
      const p = page(rows, limit, (x) => ({ t: x.updatedAt, id: x.id }));
      return c.json({ items: p.items.map(toClient), nextCursor: p.nextCursor }, 200);
    },
  );

  r.openapi(
    createRoute({ method: 'post', path: '/', tags, summary: 'Crear cliente', security, request: body(ClientInput), responses: { 201: json(ClientSchema, 'Creado'), ...authErrors } }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'client:create');
      const input = c.req.valid('json');
      const row = await c.var.deps.db.transaction(async (tx) => {
        const [row] = await tx.insert(clients).values({ ...input, organizationId: a.org.id, ownerId: a.user.id }).returning();
        await audit(tx, a, 'crear', 'client', row!.id);
        return row!;
      });
      return c.json(toClient(row), 201);
    },
  );

  r.openapi(
    createRoute({ method: 'get', path: '/{id}', tags, summary: 'Obtener cliente', security, request: { params: IdParam }, responses: { 200: json(ClientSchema), ...authErrors } }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'client:read');
      return c.json(toClient(await getOwned(a.org.id, c.req.valid('param').id, c.var.deps.db)), 200);
    },
  );

  r.openapi(
    createRoute({
      method: 'patch',
      path: '/{id}',
      tags,
      summary: 'Actualizar cliente',
      security,
      request: { params: IdParam, ...body(ClientInput.partial()) },
      responses: { 200: json(ClientSchema), ...authErrors },
    }),
    async (c) => {
      const a = requireAuth(c);
      const { id } = c.req.valid('param');
      const input = c.req.valid('json');
      const row = await c.var.deps.db.transaction(async (tx) => {
        const cur = await getOwned(a.org.id, id, tx);
        assertCan(a.user, 'client:update', { ownerId: cur.ownerId });
        const [row] = await tx.update(clients).set(input).where(eq(clients.id, id)).returning();
        await audit(tx, a, 'actualizar', 'client', id, { fields: Object.keys(input) });
        return row!;
      });
      return c.json(toClient(row), 200);
    },
  );

  r.openapi(
    createRoute({
      method: 'delete',
      path: '/{id}',
      tags,
      summary: 'Eliminar cliente (borrado lógico)',
      security,
      request: { params: IdParam },
      responses: { 204: { description: 'Eliminado' }, ...authErrors },
    }),
    async (c) => {
      const a = requireAuth(c);
      const { id } = c.req.valid('param');
      await c.var.deps.db.transaction(async (tx) => {
        const cur = await getOwned(a.org.id, id, tx);
        assertCan(a.user, 'client:delete', { ownerId: cur.ownerId });
        await tx.update(clients).set({ deletedAt: new Date() }).where(eq(clients.id, id));
        await audit(tx, a, 'eliminar', 'client', id);
      });
      return c.body(null, 204);
    },
  );

  return r;
}
