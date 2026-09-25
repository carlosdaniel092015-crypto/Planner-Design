import { createRoute, z } from '@hono/zod-openapi';
import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, notLike, or } from 'drizzle-orm';
import type { Context } from 'hono';
import { organizations, projects, userCredentials, userIdentities, users } from '../db/schema';
import { audit } from '../lib/audit';
import type { AppEnv } from '../lib/context';
import { conflict, forbidden, notFound } from '../lib/errors';
import { authErrors, body, IdParam, json, pick, router, security } from '../lib/openapi';
import { effectivePlan, type Plan } from '../lib/plans';
import { requireAuth } from '../services/auth';

const tags = ['Plataforma'];
const PlanName = z.enum(['gratis', 'profesional', 'empresa']);
const DELETED = 'eliminada+%@planner.invalid';

/** The platform owners (PLATFORM_ADMIN_EMAILS) see every organisation; anyone else gets 403. */
export const isPlatformAdmin = (config: { platformAdmins: string[] }, email: string) => config.platformAdmins.includes(email.trim().toLowerCase());

function requirePlatformAdmin(c: Context<AppEnv>) {
  const a = requireAuth(c);
  if (!isPlatformAdmin(c.var.deps.config, a.user.email)) throw forbidden('Solo los administradores de la plataforma pueden ver esto.');
  return a;
}

const OrgSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    plan: PlanName,
    effectivePlan: PlanName,
    planStatus: z.string().nullable(),
    stripeSubscription: z.boolean(),
    users: z.number(),
    activeProjects: z.number(),
    admins: z.array(z.string()),
    lastLoginAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi('OrganizacionPlataforma');

async function describeOrgs(db: AppEnv['Variables']['deps']['db'], rows: (typeof organizations.$inferSelect)[]) {
  if (!rows.length) return [];
  const ids = rows.map((o) => o.id);
  const people = await db
    .select({ org: users.organizationId, email: users.email, role: users.role, active: users.active, lastLoginAt: users.lastLoginAt })
    .from(users)
    .where(and(inArray(users.organizationId, ids), notLike(users.email, DELETED)));
  const active = await db
    .select({ org: projects.organizationId, n: count() })
    .from(projects)
    .where(and(inArray(projects.organizationId, ids), isNull(projects.deletedAt), ne(projects.status, 'aprobado')))
    .groupBy(projects.organizationId);
  return rows.map((o) => {
    const mine = people.filter((p) => p.org === o.id);
    const last = mine.reduce<Date | null>((m, p) => (p.lastLoginAt && (!m || p.lastLoginAt > m) ? p.lastLoginAt : m), null);
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      plan: o.plan,
      effectivePlan: effectivePlan(o),
      planStatus: o.planStatus,
      stripeSubscription: !!o.stripeSubscriptionId,
      users: mine.length,
      activeProjects: active.find((x) => x.org === o.id)?.n ?? 0,
      admins: mine.filter((p) => p.role === 'admin' && p.active).map((p) => p.email),
      lastLoginAt: last?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
    };
  });
}

export function platformRoutes() {
  const r = router();

  r.openapi(
    createRoute({
      method: 'get',
      path: '/organizations',
      tags,
      summary: 'Todas las organizaciones con su plan y uso (solo administradores de la plataforma)',
      description: 'Los administradores se definen con PLATFORM_ADMIN_EMAILS. `q` busca por nombre, slug o correo de un usuario.',
      security,
      request: { query: z.object({ q: z.string().max(120).optional() }) },
      responses: { 200: json(z.object({ items: z.array(OrgSchema) })), ...authErrors },
    }),
    async (c) => {
      requirePlatformAdmin(c);
      const { db } = c.var.deps;
      const q = c.req.valid('query').q?.trim();
      const like = q ? `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;
      const match = like
        ? or(ilike(organizations.name, like), ilike(organizations.slug, like), inArray(organizations.id, db.select({ id: users.organizationId }).from(users).where(ilike(users.email, like))))
        : undefined;
      const rows = await db.select().from(organizations).where(match).orderBy(desc(organizations.createdAt)).limit(500);
      return c.json({ items: await describeOrgs(db, rows) }, 200);
    },
  );

  r.openapi(
    createRoute({
      method: 'get',
      path: '/organizations/{id}/users',
      tags,
      summary: 'Usuarios de una organización (solo administradores de la plataforma)',
      security,
      request: { params: IdParam },
      responses: {
        200: json(
          z.object({
            items: z.array(
              z.object({
                id: z.uuid(),
                name: z.string(),
                email: z.string(),
                role: z.string(),
                active: z.boolean(),
                hasPassword: z.boolean(),
                providers: z.array(z.string()),
                lastLoginAt: z.iso.datetime().nullable(),
                createdAt: z.iso.datetime(),
              }),
            ),
          }),
        ),
        ...authErrors,
      },
    }),
    async (c) => {
      requirePlatformAdmin(c);
      const { db } = c.var.deps;
      const { id } = c.req.valid('param');
      const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, id)).limit(1);
      if (!org) throw notFound('La organización');
      const rows = await db
        .select()
        .from(users)
        .where(and(eq(users.organizationId, id), notLike(users.email, DELETED)))
        .orderBy(asc(users.name));
      const ids = rows.map((u) => u.id);
      const creds = ids.length ? await db.select({ id: userCredentials.userId }).from(userCredentials).where(inArray(userCredentials.userId, ids)) : [];
      const idents = ids.length ? await db.select({ id: userIdentities.userId, provider: userIdentities.provider }).from(userIdentities).where(inArray(userIdentities.userId, ids)) : [];
      return c.json(
        {
          items: rows.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            active: u.active,
            hasPassword: creds.some((x) => x.id === u.id),
            providers: idents.filter((x) => x.id === u.id).map((x) => x.provider),
            lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
            createdAt: u.createdAt.toISOString(),
          })),
        },
        200,
      );
    },
  );

  r.openapi(
    createRoute({
      method: 'patch',
      path: '/organizations/{id}',
      tags,
      summary: 'Asignar el plan de una organización (solo administradores de la plataforma)',
      description:
        'Queda como plan asignado por la plataforma (`planStatus: manual`), sin pago en línea. Una organización con suscripción de Stripe activa ' +
        'cambia de plan desde su portal de pagos (409 `SUSCRIPCION_ACTIVA`).',
      security,
      request: { params: IdParam, ...body(z.object({ plan: PlanName })) },
      responses: { 200: json(OrgSchema), ...authErrors, ...pick(409) },
    }),
    async (c) => {
      const a = requirePlatformAdmin(c);
      const { db } = c.var.deps;
      const { id } = c.req.valid('param');
      const { plan } = c.req.valid('json');
      const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
      if (!org) throw notFound('La organización');
      if (org.stripeSubscriptionId && ['active', 'trialing', 'past_due'].includes(org.planStatus ?? ''))
        throw conflict('SUSCRIPCION_ACTIVA', 'Esta organización paga con Stripe: el plan se cambia desde su portal de pagos.');
      const updated = await db.transaction(async (tx) => {
        const [o] = await tx
          .update(organizations)
          .set({ plan, planStatus: plan === 'gratis' ? null : 'manual', planRenewsAt: null, updatedAt: new Date() })
          .where(eq(organizations.id, id))
          .returning();
        // Logged in the organisation's own audit without exposing who at the platform did it (userId null).
        await audit(tx, { organizationId: id, userId: null }, 'cambiar_plan', 'organization', id, { from: org.plan, to: plan as Plan, por: 'plataforma', adminId: a.user.id });
        return o!;
      });
      const [out] = await describeOrgs(db, [updated]);
      return c.json(out!, 200);
    },
  );

  return r;
}
