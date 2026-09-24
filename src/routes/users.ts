import { createRoute, z } from '@hono/zod-openapi';
import { and, asc, count, eq, ne, sql } from 'drizzle-orm';
import { users } from '../db/schema';
import { audit } from '../lib/audit';
import { conflict, notFound } from '../lib/errors';
import { authErrors, body, IdParam, json, pick, router, security } from '../lib/openapi';
import { assertCan } from '../lib/permissions';
import { issueVerificationToken, requireAuth } from '../services/auth';
import { templates } from '../services/mailer';
import { RoleSchema } from './auth';
import { requireRoom } from '../lib/plans';

const UserSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    email: z.email(),
    role: RoleSchema,
    active: z.boolean(),
    lastLoginAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi('Usuario');

const toUser = (u: typeof users.$inferSelect) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  active: u.active,
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  createdAt: u.createdAt.toISOString(),
});

const list = createRoute({
  method: 'get',
  path: '/',
  tags: ['Usuarios'],
  summary: 'Listar usuarios de la organización (solo admin)',
  security,
  responses: { 200: json(z.object({ items: z.array(UserSchema) })), ...authErrors },
});

const invite = createRoute({
  method: 'post',
  path: '/',
  tags: ['Usuarios'],
  summary: 'Invitar a un usuario (solo admin)',
  description: 'Crea el usuario inactivo y le envía un correo para crear su contraseña (vence en 7 días).',
  security,
  request: body(z.object({ name: z.string().min(1).max(120), email: z.email(), role: RoleSchema.default('disenador') }).openapi({ example: { name: 'Luis Gómez', email: 'luis@ejemplo.com', role: 'disenador' } })),
  responses: { 201: json(UserSchema, 'Creado'), ...authErrors, ...pick(409) },
});

const patch = createRoute({
  method: 'patch',
  path: '/{id}',
  tags: ['Usuarios'],
  summary: 'Cambiar rol, nombre o estado activo (solo admin)',
  security,
  request: { params: IdParam, ...body(z.object({ role: RoleSchema.optional(), active: z.boolean().optional(), name: z.string().min(1).max(120).optional() })) },
  responses: { 200: json(UserSchema), ...authErrors, ...pick(409) },
});

const directory = createRoute({
  method: 'get',
  path: '/directory',
  tags: ['Usuarios'],
  summary: 'Personas activas de la organización, para compartir proyectos',
  description: 'Cualquier usuario con sesión. Solo nombre, correo y rol; no incluye a quien llama.',
  security,
  responses: {
    200: json(z.object({ items: z.array(z.object({ id: z.uuid(), name: z.string(), email: z.email(), role: RoleSchema })) })),
    ...authErrors,
  },
});

export function userRoutes() {
  const r = router();

  r.openapi(directory, async (c) => {
    const a = requireAuth(c);
    const rows = await c.var.deps.db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(and(eq(users.organizationId, a.org.id), eq(users.active, true), ne(users.id, a.user.id)))
      .orderBy(asc(users.name));
    return c.json({ items: rows }, 200);
  });

  r.openapi(list, async (c) => {
    const a = requireAuth(c);
    assertCan(a.user, 'user:manage');
    const rows = await c.var.deps.db.select().from(users).where(eq(users.organizationId, a.org.id)).orderBy(asc(users.name));
    return c.json({ items: rows.map(toUser) }, 200);
  });

  r.openapi(invite, async (c) => {
    const a = requireAuth(c);
    assertCan(a.user, 'user:manage');
    const { db, mailer, config } = c.var.deps;
    await requireRoom(db, config, a, 'users');
    const input = c.req.valid('json');
    const email = input.email.trim().toLowerCase();
    const [dup] = await db.select({ id: users.id }).from(users).where(eq(sql`lower(${users.email})`, email)).limit(1);
    if (dup) throw conflict('CORREO_EN_USO', 'Ya existe un usuario con ese correo.');
    const { user, token } = await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({ organizationId: a.org.id, name: input.name, email, role: input.role, active: false }).returning();
      const token = await issueVerificationToken(tx, user!.id, 'invite', 7 * 86_400_000);
      await audit(tx, a, 'invitar', 'user', user!.id, { email, role: input.role });
      return { user: user!, token };
    });
    const url = `${config.frontendUrl}/invitacion?token=${encodeURIComponent(token)}`;
    await mailer.send({ to: email, ...templates.invite({ name: user.name, orgName: a.org.name, url }) });
    return c.json(toUser(user), 201);
  });

  r.openapi(patch, async (c) => {
    const a = requireAuth(c);
    assertCan(a.user, 'user:manage');
    const { db } = c.var.deps;
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');
    const updated = await db.transaction(async (tx) => {
      const [cur] = await tx.select().from(users).where(and(eq(users.id, id), eq(users.organizationId, a.org.id))).limit(1);
      if (!cur) throw notFound('El usuario');
      const losesAdmin = cur.role === 'admin' && ((input.role && input.role !== 'admin') || input.active === false);
      if (losesAdmin) {
        const [{ n }] = (await tx
          .select({ n: count() })
          .from(users)
          .where(and(eq(users.organizationId, a.org.id), eq(users.role, 'admin'), eq(users.active, true), ne(users.id, id)))) as [{ n: number }];
        if (Number(n) === 0) throw conflict('ULTIMO_ADMIN', 'La organización debe conservar al menos un administrador activo.');
      }
      const [u] = await tx.update(users).set(input).where(eq(users.id, id)).returning();
      if (input.role && input.role !== cur.role) await audit(tx, a, 'cambiar_rol', 'user', id, { from: cur.role, to: input.role });
      else await audit(tx, a, 'actualizar', 'user', id, input);
      return u!;
    });
    return c.json(toUser(updated), 200);
  });

  return r;
}
