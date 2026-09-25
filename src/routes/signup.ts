import { createRoute, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import type { AppEnv } from '../lib/context';
import { and, eq, sql } from 'drizzle-orm';
import { organizations, pendingSignups, users } from '../db/schema';
import { audit } from '../lib/audit';
import { AppError, conflict, gone, unprocessable } from '../lib/errors';
import { body, json, pick, router } from '../lib/openapi';
import { clientIp, rateLimit } from '../lib/rate-limit';
import { createSession, hashPassword, setSessionCookie } from '../services/auth';
import { templates, trySend } from '../services/mailer';
import { createOwnOrganization, hashSignupCode, newSignupCode, SIGNUP_CODE_TTL_MS, SIGNUP_MAX_ATTEMPTS, signupCodeMatches } from '../services/signup';
import { MeSchema, toMe } from './auth';

const tags = ['Autenticación'];
const FIFTEEN_MIN = 15 * 60_000;
const Email = z.email().max(254).openapi({ example: 'ana@ejemplo.com' });
/** Without the email the code never arrives: say so instead of pretending it was sent. */
const mailDown = () => new AppError(503, 'CORREO_NO_DISPONIBLE', 'No pudimos enviar el correo con el código. Inténtalo más tarde o entra con Google o Microsoft.');
const Sent = z.object({ ok: z.literal(true), expiresInSec: z.number() });

/**
 * Self-service sign-up with email and password, confirmed with a 6-digit code sent by email.
 * The account (own organisation on plan Gratis) only exists after the code is confirmed.
 */
export function signupRoutes() {
  const r = router();
  r.use('/sign-up', rateLimit({ name: 'signup-ip', max: 10, windowMs: FIFTEEN_MIN }));
  r.use('/sign-up/*', rateLimit({ name: 'signup-verify-ip', max: 30, windowMs: FIFTEEN_MIN }));

  const perEmail = (c: Context<AppEnv>, email: string) => {
    const hit = c.var.deps.rateLimiter.hit(`signup-email:${email}`, 5, FIFTEEN_MIN);
    if (!hit.allowed) throw new AppError(429, 'DEMASIADAS_SOLICITUDES', `Ya enviamos varios códigos a este correo. Espera ${hit.retryAfterSec} s.`);
  };

  r.openapi(
    createRoute({
      method: 'post',
      path: '/sign-up',
      tags,
      summary: 'Crear cuenta: envía un código de 6 dígitos al correo',
      description:
        'Guarda el registro pendiente y envía el código (vence en 15 minutos). La cuenta se crea al confirmarlo en `/auth/sign-up/verify`. ' +
        'Si el correo ya tiene cuenta responde igual (para no revelar qué correos existen) y le envía un aviso con el enlace para entrar.',
      request: body(
        z.object({
          name: z.string().trim().min(1).max(120),
          email: Email,
          password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.').max(200),
          orgName: z.string().trim().max(120).optional(),
        }),
      ),
      responses: { 200: json(Sent), ...pick(400, 429) },
    }),
    async (c) => {
      const { db, mailer, config } = c.var.deps;
      const input = c.req.valid('json');
      const email = input.email.trim().toLowerCase();
      perEmail(c, email);
      const [existing] = await db.select({ name: users.name }).from(users).where(eq(sql`lower(${users.email})`, email)).limit(1);
      if (existing) {
        await trySend(mailer, { to: email, ...templates.signupExisting({ name: existing.name, loginUrl: `${config.frontendUrl}/login`, forgotUrl: `${config.frontendUrl}/olvide` }) });
        return c.json({ ok: true as const, expiresInSec: SIGNUP_CODE_TTL_MS / 1000 }, 200);
      }
      const code = newSignupCode();
      const row = {
        name: input.name,
        orgName: input.orgName || null,
        passwordHash: await hashPassword(input.password),
        codeHash: hashSignupCode(config.authSecret, email, code),
        attempts: 0,
        expiresAt: new Date(Date.now() + SIGNUP_CODE_TTL_MS),
        updatedAt: new Date(),
      };
      await db
        .insert(pendingSignups)
        .values({ email, ...row })
        .onConflictDoUpdate({ target: pendingSignups.email, set: row });
      if (!(await trySend(mailer, { to: email, ...templates.signupCode({ name: input.name, code }) }))) throw mailDown();
      return c.json({ ok: true as const, expiresInSec: SIGNUP_CODE_TTL_MS / 1000 }, 200);
    },
  );

  r.openapi(
    createRoute({
      method: 'post',
      path: '/sign-up/resend',
      tags,
      summary: 'Reenviar el código de registro',
      description: 'Genera un código nuevo (el anterior deja de servir). Siempre responde 200.',
      request: body(z.object({ email: Email })),
      responses: { 200: json(Sent), ...pick(400, 429) },
    }),
    async (c) => {
      const { db, mailer, config } = c.var.deps;
      const email = c.req.valid('json').email.trim().toLowerCase();
      perEmail(c, email);
      const code = newSignupCode();
      const [p] = await db
        .update(pendingSignups)
        .set({ codeHash: hashSignupCode(config.authSecret, email, code), attempts: 0, expiresAt: new Date(Date.now() + SIGNUP_CODE_TTL_MS), updatedAt: new Date() })
        .where(eq(pendingSignups.email, email))
        .returning({ name: pendingSignups.name });
      if (p && !(await trySend(mailer, { to: email, ...templates.signupCode({ name: p.name, code }) }))) throw mailDown();
      return c.json({ ok: true as const, expiresInSec: SIGNUP_CODE_TTL_MS / 1000 }, 200);
    },
  );

  r.openapi(
    createRoute({
      method: 'post',
      path: '/sign-up/verify',
      tags,
      summary: 'Confirmar el código: crea la cuenta y abre la sesión',
      description: `Crea la organización (plan Gratis) con la persona como administradora. ${SIGNUP_MAX_ATTEMPTS} intentos por código.`,
      request: body(z.object({ email: Email, code: z.string().trim().regex(/^\d{6}$/, 'El código tiene 6 dígitos.') })),
      responses: { 200: json(MeSchema.extend({ token: z.string(), expiresAt: z.iso.datetime() })), ...pick(400, 409, 410, 422, 429) },
    }),
    async (c) => {
      const { db, config } = c.var.deps;
      const { code } = c.req.valid('json');
      const email = c.req.valid('json').email.trim().toLowerCase();
      const [p] = await db.select().from(pendingSignups).where(eq(pendingSignups.email, email)).limit(1);
      if (!p || p.expiresAt < new Date()) throw gone('CODIGO_CADUCADO', 'El código caducó o ya se usó. Pide uno nuevo.');
      if (p.attempts >= SIGNUP_MAX_ATTEMPTS) throw gone('CODIGO_BLOQUEADO', 'Demasiados intentos con este código. Pide uno nuevo.');
      if (!signupCodeMatches(config.authSecret, email, code, p.codeHash)) {
        await db.update(pendingSignups).set({ attempts: sql`${pendingSignups.attempts} + 1` }).where(eq(pendingSignups.id, p.id));
        const left = SIGNUP_MAX_ATTEMPTS - p.attempts - 1;
        throw unprocessable('CODIGO_INCORRECTO', left > 0 ? `El código no es correcto. Te quedan ${left} ${left === 1 ? 'intento' : 'intentos'}.` : 'El código no es correcto. Pide uno nuevo.');
      }
      // Claim the pending sign-up once: two tabs confirming at the same time create a single account.
      const [claimed] = await db
        .delete(pendingSignups)
        .where(and(eq(pendingSignups.id, p.id), eq(pendingSignups.codeHash, p.codeHash)))
        .returning({ id: pendingSignups.id });
      if (!claimed) throw gone('CODIGO_CADUCADO', 'El código caducó o ya se usó. Pide uno nuevo.');
      const [taken] = await db.select({ id: users.id }).from(users).where(eq(sql`lower(${users.email})`, email)).limit(1);
      if (taken) throw conflict('CORREO_REGISTRADO', 'Este correo ya tiene una cuenta. Inicia sesión.');

      const { org, admin } = await createOwnOrganization(db, { name: p.name, email, orgName: p.orgName, passwordHash: p.passwordHash });
      const s = await createSession(db, admin.id, config.sessionTtlDays, { ip: clientIp(c), userAgent: c.req.header('user-agent') });
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, admin.id));
      await audit(db, { organizationId: org.id, userId: admin.id }, 'crear', 'organization', org.id, { registro: 'correo' });
      setSessionCookie(c, s.token, s.expiresAt);
      const [o] = await db.select().from(organizations).where(eq(organizations.id, org.id)).limit(1);
      return c.json({ ...toMe(admin, o!), token: s.token, expiresAt: s.expiresAt.toISOString() }, 200);
    },
  );

  return r;
}
