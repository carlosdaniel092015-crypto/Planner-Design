import { createRoute, z } from '@hono/zod-openapi';
import { and, count, eq, gt, isNull, ne, notLike } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOrTx } from '../db/client';
import { organizations, orgJoinRequests, projectShares, projects, users } from '../db/schema';
import { audit } from '../lib/audit';
import type { AuthContext } from '../lib/context';
import { conflict, gone, notFound } from '../lib/errors';
import { authErrors, IdParam, json, pick, router, security } from '../lib/openapi';
import { requireOrgRoom } from '../lib/plans';
import { requireAuth } from '../services/auth';
import { MeSchema, RoleSchema, toMe } from './auth';

const tags = ['Usuarios'];
const DELETED = 'eliminada+%@planner.invalid';

const RequestSchema = z
  .object({
    id: z.uuid(),
    organizationName: z.string(),
    invitedBy: z.string().nullable(),
    role: RoleSchema,
    expiresAt: z.iso.datetime(),
    /** Accepting leaves the current organisation; its projects stay there. */
    current: z.object({ name: z.string(), projects: z.number(), otherMembers: z.number() }),
    canAccept: z.boolean(),
    reason: z.string().nullable(),
  })
  .openapi('SolicitudUnion');

/** Why the caller cannot move out of their organisation right now (null = they can). */
async function blocker(db: DbOrTx, a: AuthContext) {
  const [m] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.organizationId, a.org.id), ne(users.id, a.user.id), notLike(users.email, DELETED)));
  const otherMembers = m?.n ?? 0;
  if (otherMembers > 0)
    return { otherMembers, reason: `Ya formas parte de ${a.org.name} con otras personas. Pide a su administrador que te dé de baja o usa otro correo para unirte.` };
  if (a.org.stripeSubscriptionId && ['active', 'trialing', 'past_due'].includes(a.org.planStatus ?? ''))
    return { otherMembers, reason: `${a.org.name} tiene un plan de pago activo. Cancélalo en Administración → Plan antes de unirte a otra organización.` };
  return { otherMembers, reason: null };
}

export function joinRoutes() {
  const r = router();
  const inviter = alias(users, 'inviter');

  r.openapi(
    createRoute({
      method: 'get',
      path: '/me/join-requests',
      tags,
      summary: 'Invitaciones pendientes para unirte a otra organización',
      description: 'Llegan cuando un administrador invita a tu correo y ya tenías cuenta. Solo se puede pertenecer a una organización a la vez.',
      security,
      responses: { 200: json(z.object({ items: z.array(RequestSchema) })), ...authErrors },
    }),
    async (c) => {
      const a = requireAuth(c);
      const { db } = c.var.deps;
      const rows = await db
        .select({ r: orgJoinRequests, orgName: organizations.name, inviterName: inviter.name })
        .from(orgJoinRequests)
        .innerJoin(organizations, eq(organizations.id, orgJoinRequests.organizationId))
        .leftJoin(inviter, eq(inviter.id, orgJoinRequests.invitedBy))
        .where(and(eq(orgJoinRequests.userId, a.user.id), isNull(orgJoinRequests.acceptedAt), gt(orgJoinRequests.expiresAt, new Date()), ne(orgJoinRequests.organizationId, a.org.id)));
      if (!rows.length) return c.json({ items: [] }, 200);
      const b = await blocker(db, a);
      const [p] = await db
        .select({ n: count() })
        .from(projects)
        .where(and(eq(projects.organizationId, a.org.id), isNull(projects.deletedAt)));
      return c.json(
        {
          items: rows.map((x) => ({
            id: x.r.id,
            organizationName: x.orgName,
            invitedBy: x.inviterName,
            role: x.r.role,
            expiresAt: x.r.expiresAt.toISOString(),
            current: { name: a.org.name, projects: p?.n ?? 0, otherMembers: b.otherMembers },
            canAccept: !b.reason,
            reason: b.reason,
          })),
        },
        200,
      );
    },
  );

  r.openapi(
    createRoute({
      method: 'post',
      path: '/me/join-requests/{id}/accept',
      tags,
      summary: 'Aceptar: pasas a la otra organización con el rol que te dieron',
      description:
        'Solo si eres la única persona de tu organización actual (409 si hay más). Sus proyectos se quedan allí; los proyectos que te habían compartido dejan de verse.',
      security,
      request: { params: IdParam },
      responses: { 200: json(MeSchema), ...authErrors, ...pick(409, 410) },
    }),
    async (c) => {
      const a = requireAuth(c);
      const { db } = c.var.deps;
      const { id } = c.req.valid('param');
      const out = await db.transaction(async (tx) => {
        const [req] = await tx
          .select()
          .from(orgJoinRequests)
          .where(and(eq(orgJoinRequests.id, id), eq(orgJoinRequests.userId, a.user.id)))
          .limit(1)
          .for('update');
        if (!req) throw notFound('La invitación');
        if (req.acceptedAt || req.expiresAt < new Date()) throw gone('INVITACION_CADUCADA', 'La invitación caducó o ya se usó. Pide una nueva.');
        if (req.organizationId === a.org.id) throw conflict('YA_ES_MIEMBRO', 'Ya perteneces a esa organización.');
        const b = await blocker(tx, a);
        if (b.reason) throw conflict('NO_PUEDE_CAMBIAR', b.reason);
        const [target] = await tx.select().from(organizations).where(eq(organizations.id, req.organizationId)).limit(1);
        if (!target) throw notFound('La organización');
        await requireOrgRoom(tx, target, 'users');
        const [u] = await tx.update(users).set({ organizationId: target.id, role: req.role, updatedAt: new Date() }).where(eq(users.id, a.user.id)).returning();
        await tx.update(orgJoinRequests).set({ acceptedAt: new Date() }).where(eq(orgJoinRequests.id, req.id));
        // Shares belong to the organisation being left.
        await tx.delete(projectShares).where(eq(projectShares.userId, a.user.id));
        await audit(tx, { organizationId: a.org.id, userId: null }, 'actualizar', 'user', a.user.id, { salio: true, email: a.user.email });
        await audit(tx, { organizationId: target.id, userId: a.user.id }, 'actualizar', 'user', a.user.id, { unido: true, role: req.role });
        return toMe(u!, target);
      });
      return c.json(out, 200);
    },
  );

  r.openapi(
    createRoute({
      method: 'post',
      path: '/me/join-requests/{id}/decline',
      tags,
      summary: 'Rechazar la invitación',
      security,
      request: { params: IdParam },
      responses: { 200: json(z.object({ ok: z.literal(true) })), ...authErrors },
    }),
    async (c) => {
      const a = requireAuth(c);
      const { id } = c.req.valid('param');
      const [gone_] = await c.var.deps.db
        .delete(orgJoinRequests)
        .where(and(eq(orgJoinRequests.id, id), eq(orgJoinRequests.userId, a.user.id), isNull(orgJoinRequests.acceptedAt)))
        .returning({ id: orgJoinRequests.id });
      if (!gone_) throw notFound('La invitación');
      return c.json({ ok: true as const }, 200);
    },
  );

  return r;
}
