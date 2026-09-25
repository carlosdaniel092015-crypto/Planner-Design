import { createRoute, z } from '@hono/zod-openapi';
import { and, asc, count, eq, isNull, ne, sql } from 'drizzle-orm';
import { orgJoinRequests, sessions, users, verificationTokens } from '../db/schema';
import { randomToken, sha256 } from '../lib/crypto';
import { audit } from '../lib/audit';
import { conflict, notFound } from '../lib/errors';
import { authErrors, body, IdParam, json, pick, router, security } from '../lib/openapi';
import { assertCan } from '../lib/permissions';
import { issueVerificationToken, requireAuth } from '../services/auth';
import { templates, trySend } from '../services/mailer';
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
  description:
    'Crea el usuario inactivo y le envía un correo para crear su contraseña (vence en 7 días). ' +
    'Si el correo ya tiene cuenta en otra organización, le envía una solicitud para unirse (202); al aceptarla pasa a esta organización con el rol elegido.',
  security,
  request: body(z.object({ name: z.string().min(1).max(120), email: z.email(), role: RoleSchema.default('disenador') }).openapi({ example: { name: 'Luis Gómez', email: 'luis@ejemplo.com', role: 'disenador' } })),
  responses: {
    201: json(UserSchema.extend({ emailSent: z.boolean() }), 'Creado'),
    202: json(z.object({ joinRequest: z.literal(true), name: z.string(), email: z.email(), emailSent: z.boolean() }), 'Ya tenía cuenta: se le envió la solicitud para unirse'),
    ...authErrors,
    ...pick(409),
  },
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
    const [dup] = await db.select().from(users).where(eq(sql`lower(${users.email})`, email)).limit(1);
    if (dup?.organizationId === a.org.id) throw conflict('CORREO_EN_USO', 'Esa persona ya está en tu organización.');
    if (dup && !dup.active) throw conflict('CORREO_EN_USO', 'Ese correo tiene una invitación pendiente de otra organización.');
    if (dup) {
      // Already has an account elsewhere: ask them to join instead of creating a second user.
      const token = randomToken(32);
      await db.transaction(async (tx) => {
        await tx.delete(orgJoinRequests).where(and(eq(orgJoinRequests.organizationId, a.org.id), eq(orgJoinRequests.userId, dup.id), isNull(orgJoinRequests.acceptedAt)));
        await tx.insert(orgJoinRequests).values({ organizationId: a.org.id, userId: dup.id, role: input.role, invitedBy: a.user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 7 * 86_400_000) });
        await audit(tx, a, 'invitar', 'user', dup.id, { email, role: input.role, union: true });
      });
      const url = `${config.frontendUrl}/unirse?token=${encodeURIComponent(token)}`;
      const emailSent = await trySend(mailer, { to: dup.email, fromName: a.org.name, replyTo: a.user.email, ...templates.joinRequest({ name: dup.name, orgName: a.org.name, inviterName: a.user.name, url }) });
      return c.json({ joinRequest: true as const, name: dup.name, email: dup.email, emailSent }, 202);
    }
    const { user, token } = await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({ organizationId: a.org.id, name: input.name, email, role: input.role, active: false }).returning();
      const token = await issueVerificationToken(tx, user!.id, 'invite', 7 * 86_400_000);
      await audit(tx, a, 'invitar', 'user', user!.id, { email, role: input.role });
      return { user: user!, token };
    });
    const url = `${config.frontendUrl}/invitacion?token=${encodeURIComponent(token)}`;
    const emailSent = await trySend(mailer, { to: email, fromName: a.org.name, replyTo: a.user.email, ...templates.invite({ name: user.name, orgName: a.org.name, url }) });
    return c.json({ ...toUser(user), emailSent }, 201);
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
      // A deactivated user loses their sessions and any pending invitation or reset link (otherwise accepting it reactivates them).
      if (input.active === false) {
        await tx.delete(sessions).where(eq(sessions.userId, id));
        await tx.delete(verificationTokens).where(and(eq(verificationTokens.userId, id), isNull(verificationTokens.usedAt)));
      }
      if (input.role && input.role !== cur.role) await audit(tx, a, 'cambiar_rol', 'user', id, { from: cur.role, to: input.role });
      else await audit(tx, a, 'actualizar', 'user', id, input);
      return u!;
    });
    return c.json(toUser(updated), 200);
  });

  return r;
}
