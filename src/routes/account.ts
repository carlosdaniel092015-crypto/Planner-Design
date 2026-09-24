import { createRoute, z } from '@hono/zod-openapi';
import { and, eq, isNull, ne } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { projectShares, projects, sessions, userCredentials, users, verificationTokens } from '../db/schema';
import { audit } from '../lib/audit';
import { sha256 } from '../lib/crypto';
import { AppError, conflict } from '../lib/errors';
import { authErrors, body, json, pick, router, security } from '../lib/openapi';
import { clearSessionCookie, hashPassword, readSessionToken, requireAuth, verifyPassword } from '../services/auth';

const tags = ['Mi cuenta'];
const Password = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.').max(200);
const wrongPassword = () => new AppError(403, 'CONTRASENA_INCORRECTA', 'La contraseña actual no es correcta.');

async function checkPassword(db: DbOrTx, userId: string, password: string) {
  const [cred] = await db.select().from(userCredentials).where(eq(userCredentials.userId, userId)).limit(1);
  if (!cred || !(await verifyPassword(cred.passwordHash, password))) throw wrongPassword();
}

export function accountRoutes() {
  const r = router();

  r.openapi(
    createRoute({
      method: 'patch',
      path: '/me',
      tags,
      summary: 'Cambiar mi nombre',
      security,
      request: body(z.object({ name: z.string().trim().min(1).max(120) })),
      responses: { 200: json(z.object({ ok: z.literal(true), name: z.string() })), ...authErrors },
    }),
    async (c) => {
      const a = requireAuth(c);
      const { name } = c.req.valid('json');
      await c.var.deps.db.transaction(async (tx) => {
        await tx.update(users).set({ name, updatedAt: new Date() }).where(eq(users.id, a.user.id));
        await audit(tx, a, 'actualizar', 'user', a.user.id, { name });
      });
      return c.json({ ok: true as const, name }, 200);
    },
  );

  r.openapi(
    createRoute({
      method: 'post',
      path: '/me/password',
      tags,
      summary: 'Cambiar mi contraseña',
      description: 'Pide la contraseña actual. Cierra las demás sesiones abiertas (otros dispositivos); esta sigue activa.',
      security,
      request: body(z.object({ currentPassword: z.string().min(1).max(200), newPassword: Password })),
      responses: { 200: json(z.object({ ok: z.literal(true) })), ...authErrors },
    }),
    async (c) => {
      const a = requireAuth(c);
      const { currentPassword, newPassword } = c.req.valid('json');
      const { db } = c.var.deps;
      await checkPassword(db, a.user.id, currentPassword);
      const token = readSessionToken(c);
      await db.transaction(async (tx) => {
        await tx.update(userCredentials).set({ passwordHash: await hashPassword(newPassword) }).where(eq(userCredentials.userId, a.user.id));
        await tx.delete(sessions).where(and(eq(sessions.userId, a.user.id), token ? ne(sessions.tokenHash, sha256(token)) : undefined));
        await audit(tx, a, 'actualizar', 'user', a.user.id, { password: 'cambiada' });
      });
      return c.json({ ok: true as const }, 200);
    },
  );

  r.openapi(
    createRoute({
      method: 'delete',
      path: '/me',
      tags,
      summary: 'Borrar mi cuenta',
      description:
        'Pide la contraseña. Elimina los proyectos de la persona, los accesos que tenía compartidos, sus sesiones y su contraseña, y anonimiza su nombre y correo. ' +
        'El registro de auditoría y las aprobaciones firmadas por clientes se conservan sin sus datos personales. El último administrador activo no puede borrarse: primero debe nombrar a otro.',
      security,
      request: body(z.object({ password: z.string().min(1).max(200), confirm: z.literal('ELIMINAR').openapi({ description: 'Escribe ELIMINAR para confirmar.' }) })),
      responses: { 204: { description: 'Cuenta borrada' }, ...authErrors, ...pick(409) },
    }),
    async (c) => {
      const a = requireAuth(c);
      const { password } = c.req.valid('json');
      const { db } = c.var.deps;
      await checkPassword(db, a.user.id, password);
      if (a.user.role === 'admin') {
        const others = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.organizationId, a.org.id), eq(users.role, 'admin'), eq(users.active, true), ne(users.id, a.user.id)))
          .limit(1);
        if (!others.length) throw conflict('ULTIMO_ADMIN', 'Eres el único administrador. Nombra a otro administrador en Administración → Usuarios antes de borrar tu cuenta.');
      }
      await db.transaction(async (tx) => {
        const now = new Date();
        const owned = await tx
          .update(projects)
          .set({ deletedAt: now })
          .where(and(eq(projects.ownerId, a.user.id), isNull(projects.deletedAt)))
          .returning({ id: projects.id });
        await tx.delete(projectShares).where(eq(projectShares.userId, a.user.id));
        await tx.delete(sessions).where(eq(sessions.userId, a.user.id));
        await tx.delete(verificationTokens).where(eq(verificationTokens.userId, a.user.id));
        await tx.delete(userCredentials).where(eq(userCredentials.userId, a.user.id));
        await tx
          .update(users)
          .set({ name: 'Cuenta eliminada', email: `eliminada+${a.user.id}@planner.invalid`, active: false, updatedAt: now })
          .where(eq(users.id, a.user.id));
        await audit(tx, a, 'eliminar', 'user', a.user.id, { cuenta: 'borrada por su titular', proyectos: owned.length });
      });
      clearSessionCookie(c);
      return c.body(null, 204);
    },
  );

  return r;
}
