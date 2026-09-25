import { createRoute, z } from '@hono/zod-openapi';
import { eq, sql } from 'drizzle-orm';
import { organizations, sessions, userCredentials, users } from '../db/schema';
import { audit } from '../lib/audit';
import { AppError, unauthorized } from '../lib/errors';
import { body, json, pick, router, security } from '../lib/openapi';
import { clientIp, rateLimit } from '../lib/rate-limit';
import {
  clearSessionCookie,
  consumeVerificationToken,
  createSession,
  dummyVerify,
  hashPassword,
  issueVerificationToken,
  readSessionToken,
  requireAuth,
  setSessionCookie,
  verifyPassword,
} from '../services/auth';
import { templates } from '../services/mailer';
import { sha256 } from '../lib/crypto';
import { brandingAllowed } from '../lib/plans';

export const RoleSchema = z.enum(['admin', 'disenador', 'taller', 'lectura']).openapi('Rol');

export const MeSchema = z
  .object({
    user: z.object({
      id: z.uuid(),
      name: z.string(),
      email: z.email(),
      role: RoleSchema,
      /** false for people who only sign in with Google / Microsoft (they can create one in Mi cuenta). */
      hasPassword: z.boolean().optional(),
    }),
    organization: z.object({
      id: z.uuid(),
      name: z.string(),
      slug: z.string(),
      logoUrl: z.string().nullable(),
      brandColor: z.string().nullable(),
      baseCurrency: z.enum(['USD', 'DOP']),
    }),
  })
  .openapi('Me', {
    example: {
      user: { id: '5f0c…', name: 'Ana Pérez', email: 'ana@ejemplo.com', role: 'disenador' },
      organization: { id: '1a2b…', name: 'Muebles Ejemplo', slug: 'muebles-ejemplo', logoUrl: null, brandColor: '#ec3013', baseCurrency: 'USD' },
    },
  });

const Password = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.').max(200);
const Ok = z.object({ ok: z.literal(true) });

const signIn = createRoute({
  method: 'post',
  path: '/sign-in',
  tags: ['Autenticación'],
  summary: 'Iniciar sesión con correo y contraseña',
  description: 'Crea una sesión y la guarda en la cookie `pd_session` (httpOnly, Secure, SameSite=Lax). También devuelve el token para clientes que no usan cookies.',
  request: body(z.object({ email: z.email().openapi({ example: 'admin@example.com' }), password: z.string().min(1).max(200).openapi({ example: 'una-clave-segura' }) })),
  responses: { 200: json(MeSchema.extend({ token: z.string(), expiresAt: z.iso.datetime() })), ...pick(400, 401, 429) },
});

const signOut = createRoute({
  method: 'post',
  path: '/sign-out',
  tags: ['Autenticación'],
  summary: 'Cerrar sesión',
  security,
  responses: { 200: json(Ok) },
});

const forgot = createRoute({
  method: 'post',
  path: '/forgot-password',
  tags: ['Autenticación'],
  summary: 'Solicitar correo de recuperación',
  description: 'Siempre responde 200 para no revelar qué correos existen.',
  request: body(z.object({ email: z.email() })),
  responses: { 200: json(Ok), ...pick(400, 429) },
});

const reset = createRoute({
  method: 'post',
  path: '/reset-password',
  tags: ['Autenticación'],
  summary: 'Restablecer la contraseña con el token del correo',
  description: 'Cierra todas las sesiones abiertas del usuario.',
  request: body(z.object({ token: z.string().min(20), password: Password })),
  responses: { 200: json(Ok), ...pick(400, 410, 429) },
});

const acceptInvite = createRoute({
  method: 'post',
  path: '/accept-invite',
  tags: ['Autenticación'],
  summary: 'Aceptar invitación y crear contraseña',
  request: body(z.object({ token: z.string().min(20), password: Password, name: z.string().min(1).max(120).optional() })),
  responses: { 200: json(MeSchema.extend({ token: z.string(), expiresAt: z.iso.datetime() })), ...pick(400, 410, 429) },
});

export const meRoute = createRoute({
  method: 'get',
  path: '/me',
  tags: ['Autenticación'],
  summary: 'Usuario, rol y organización de la sesión',
  security,
  responses: { 200: json(MeSchema), ...pick(401) },
});

export const toMe = (u: { id: string; name: string; email: string; role: z.infer<typeof RoleSchema> }, o: typeof organizations.$inferSelect) => ({
  user: { id: u.id, name: u.name, email: u.email, role: u.role },
  organization: { id: o.id, name: o.name, slug: o.slug, logoUrl: o.logoUrl, brandColor: o.brandColor, baseCurrency: o.baseCurrency },
});

const FIFTEEN_MIN = 15 * 60_000;

export function authRoutes() {
  const r = router();

  r.use('/sign-in', rateLimit({ name: 'login-ip', max: 20, windowMs: FIFTEEN_MIN }));
  r.use('/forgot-password', rateLimit({ name: 'forgot-ip', max: 5, windowMs: FIFTEEN_MIN }));
  r.use('/reset-password', rateLimit({ name: 'reset-ip', max: 10, windowMs: FIFTEEN_MIN }));
  r.use('/accept-invite', rateLimit({ name: 'invite-ip', max: 10, windowMs: FIFTEEN_MIN }));

  r.openapi(signIn, async (c) => {
    const { db, config, rateLimiter } = c.var.deps;
    const { email, password } = c.req.valid('json');
    const normalized = email.trim().toLowerCase();
    const perEmail = rateLimiter.hit(`login-email:${normalized}`, 8, FIFTEEN_MIN);
    if (!perEmail.allowed) throw new AppError(429, 'DEMASIADAS_SOLICITUDES', `Demasiados intentos para esta cuenta. Espera ${perEmail.retryAfterSec} s.`);

    const [row] = await db
      .select({ user: users, hash: userCredentials.passwordHash, org: organizations })
      .from(users)
      .innerJoin(organizations, eq(organizations.id, users.organizationId))
      .leftJoin(userCredentials, eq(userCredentials.userId, users.id))
      .where(eq(sql`lower(${users.email})`, normalized))
      .limit(1);
    if (!row?.hash) {
      await dummyVerify(password);
      throw unauthorized('Correo o contraseña incorrectos.');
    }
    if (!(await verifyPassword(row.hash, password)) || !row.user.active) throw unauthorized('Correo o contraseña incorrectos.');

    const s = await createSession(db, row.user.id, config.sessionTtlDays, { ip: clientIp(c), userAgent: c.req.header('user-agent') });
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, row.user.id));
    await audit(db, { organizationId: row.org.id, userId: row.user.id }, 'iniciar_sesion', 'user', row.user.id);
    setSessionCookie(c, s.token, s.expiresAt);
    return c.json({ ...toMe(row.user, row.org), token: s.token, expiresAt: s.expiresAt.toISOString() }, 200);
  });

  r.openapi(signOut, async (c) => {
    const token = readSessionToken(c);
    if (token) await c.var.deps.db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
    clearSessionCookie(c);
    return c.json({ ok: true as const }, 200);
  });

  r.openapi(forgot, async (c) => {
    const { db, mailer, config } = c.var.deps;
    const email = c.req.valid('json').email.trim().toLowerCase();
    const [u] = await db.select().from(users).where(eq(sql`lower(${users.email})`, email)).limit(1);
    if (u?.active) {
      const token = await issueVerificationToken(db, u.id, 'reset', 60 * 60_000);
      const url = `${config.frontendUrl}/restablecer?token=${encodeURIComponent(token)}`;
      await mailer.send({ to: u.email, ...templates.passwordReset({ name: u.name, url }) });
    }
    return c.json({ ok: true as const }, 200);
  });

  r.openapi(reset, async (c) => {
    const { db } = c.var.deps;
    const { token, password } = c.req.valid('json');
    const passwordHash = await hashPassword(password);
    await db.transaction(async (tx) => {
      const userId = await consumeVerificationToken(tx, token, 'reset');
      if (!userId) throw new AppError(410, 'TOKEN_INVALIDO', 'El enlace para restablecer la contraseña caducó o ya se usó.');
      await tx.insert(userCredentials).values({ userId, passwordHash }).onConflictDoUpdate({ target: userCredentials.userId, set: { passwordHash, updatedAt: new Date() } });
      await tx.delete(sessions).where(eq(sessions.userId, userId));
    });
    return c.json({ ok: true as const }, 200);
  });

  r.openapi(acceptInvite, async (c) => {
    const { db, config } = c.var.deps;
    const { token, password, name } = c.req.valid('json');
    const passwordHash = await hashPassword(password);
    const out = await db.transaction(async (tx) => {
      const userId = await consumeVerificationToken(tx, token, 'invite');
      if (!userId) throw new AppError(410, 'TOKEN_INVALIDO', 'La invitación caducó o ya se usó.');
      await tx.insert(userCredentials).values({ userId, passwordHash }).onConflictDoUpdate({ target: userCredentials.userId, set: { passwordHash, updatedAt: new Date() } });
      const [u] = await tx.update(users).set({ active: true, ...(name ? { name } : {}), lastLoginAt: new Date() }).where(eq(users.id, userId)).returning();
      const [o] = await tx.select().from(organizations).where(eq(organizations.id, u!.organizationId));
      const s = await createSession(tx, userId, config.sessionTtlDays, { ip: clientIp(c), userAgent: c.req.header('user-agent') });
      return { u: u!, o: o!, s };
    });
    setSessionCookie(c, out.s.token, out.s.expiresAt);
    return c.json({ ...toMe(out.u, out.o), token: out.s.token, expiresAt: out.s.expiresAt.toISOString() }, 200);
  });

  return r;
}

export function meRoutes() {
  const r = router();
  r.openapi(meRoute, async (c) => {
    const a = requireAuth(c);
    const [cred] = await c.var.deps.db.select({ id: userCredentials.userId }).from(userCredentials).where(eq(userCredentials.userId, a.user.id)).limit(1);
    const me = toMe(a.user, a.org);
    const withPwd = { ...me, user: { ...me.user, hasPassword: !!cred } };
    // PDFs use these; without the branding feature they fall back to Planner's look.
    if (!brandingAllowed(c.var.deps.config, a.org)) withPwd.organization = { ...withPwd.organization, logoUrl: null, brandColor: null };
    return c.json(withPwd, 200);
  });
  return r;
}
