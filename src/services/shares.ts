import { and, asc, eq } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { projectShares, users } from '../db/schema';
import { audit } from '../lib/audit';
import type { AuthContext } from '../lib/context';
import { forbidden, notFound, unprocessable } from '../lib/errors';
import { assertCan, canEditProjects } from '../lib/permissions';
import { getProject } from './projects';

export type ShareAccess = 'ver' | 'editar';

/** People who can see a project (visible to anyone who has access to it). */
export async function listShares(db: DbOrTx, a: AuthContext, projectId: string) {
  const p = await getProject(db, a, projectId);
  const [owner] = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).where(eq(users.id, p.ownerId)).limit(1);
  const rows = await db
    .select({ userId: projectShares.userId, access: projectShares.access, createdAt: projectShares.createdAt, name: users.name, email: users.email, role: users.role })
    .from(projectShares)
    .innerJoin(users, eq(users.id, projectShares.userId))
    .where(eq(projectShares.projectId, p.id))
    .orderBy(asc(users.name));
  return {
    owner: owner ? { userId: owner.id, name: owner.name, email: owner.email, role: owner.role } : null,
    myAccess: p.access,
    items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  };
}

/** Shares (or changes the access of) a project with another user of the organisation. Owner only. */
export async function setShare(db: DbOrTx, a: AuthContext, projectId: string, userId: string, access: ShareAccess) {
  const p = await getProject(db, a, projectId);
  assertCan(a.user, 'project:share', { access: p.access });
  const [target] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.organizationId, a.org.id)))
    .limit(1);
  if (!target) throw notFound('El usuario');
  if (target.id === p.ownerId) throw unprocessable('ES_EL_DUENO', 'Esa persona ya es la dueña del proyecto.');
  if (!target.active) throw unprocessable('USUARIO_INACTIVO', `${target.name} no tiene la cuenta activa; actívala antes de compartirle proyectos.`);
  if (access === 'editar' && !canEditProjects(target.role))
    throw unprocessable('ROL_SOLO_LECTURA', `El rol de ${target.name} no permite editar proyectos; compártelo con acceso "ver".`);
  const [row] = await db
    .insert(projectShares)
    .values({ organizationId: a.org.id, projectId: p.id, userId: target.id, access, createdBy: a.user.id })
    .onConflictDoUpdate({ target: [projectShares.projectId, projectShares.userId], set: { access, updatedAt: new Date() } })
    .returning();
  await audit(db, a, 'compartir', 'project', p.id, { userId: target.id, access });
  return { userId: target.id, name: target.name, email: target.email, role: target.role, access: row!.access, createdAt: row!.createdAt.toISOString() };
}

/** The owner removes someone, or a recipient leaves a project shared with them. */
export async function removeShare(db: DbOrTx, a: AuthContext, projectId: string, userId: string) {
  const p = await getProject(db, a, projectId);
  const leaving = userId === a.user.id && p.access !== 'propietario';
  if (!leaving && p.access !== 'propietario') throw forbidden();
  const del = await db
    .delete(projectShares)
    .where(and(eq(projectShares.projectId, p.id), eq(projectShares.userId, userId)))
    .returning({ id: projectShares.id });
  if (!del.length) throw notFound('El acceso compartido');
  await audit(db, a, 'dejar_de_compartir', 'project', p.id, { userId, leaving });
}
