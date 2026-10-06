// Company vs personal library ("Toda la empresa" / "Solo yo"): a module or texture with owner_user_id is seen and edited
// only by that user. Pricing still loads the whole catalogue, so a shared project costs the same for everyone.
import { and, eq, isNull, ne, or } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { materials, moduleDefinitions } from '../db/schema';
import type { AuthContext } from '../lib/context';
import { forbidden, notFound } from '../lib/errors';

type Owned = typeof moduleDefinitions | typeof materials;

/** Rows the caller may see: the organisation's plus their own personal ones. */
export const visibleTo = (t: Owned, a: AuthContext) => and(eq(t.organizationId, a.org.id), or(isNull(t.ownerUserId), eq(t.ownerUserId, a.user.id)));

/** Another user's personal item does not exist for the caller (404, like another organisation's). */
export function assertVisible(row: { ownerUserId: string | null } | undefined, a: AuthContext, what: string) {
  if (!row || (row.ownerUserId && row.ownerUserId !== a.user.id)) throw notFound(what);
}

/**
 * "Visible para": personal → the caller's own; company → shared with everyone. Making a company item personal takes it
 * away from the others, so only an admin may do that.
 */
export function ownerFor(personal: boolean, cur: { ownerUserId: string | null } | null, a: AuthContext): string | null {
  if (!personal) return null;
  if (cur && !cur.ownerUserId && a.user.role !== 'admin') throw forbidden('Solo un administrador puede pasar a «Solo yo» algo de la biblioteca de la empresa.');
  return a.user.id;
}

/** Codes of other users' personal modules / materials (shown in nobody's palette but kept for pricing). */
export async function hiddenCodes(db: DbOrTx, a: AuthContext) {
  const [mods, mats] = await Promise.all([
    db
      .select({ code: moduleDefinitions.code })
      .from(moduleDefinitions)
      .where(and(eq(moduleDefinitions.organizationId, a.org.id), ne(moduleDefinitions.ownerUserId, a.user.id))),
    db
      .select({ code: materials.code })
      .from(materials)
      .where(and(eq(materials.organizationId, a.org.id), ne(materials.ownerUserId, a.user.id))),
  ]);
  return { modules: new Set(mods.map((r) => r.code)), materials: new Set(mats.map((r) => r.code)) };
}

/** A user leaving the organisation (account deleted, joined another one) leaves their personal items to the company. */
export async function releasePersonalLibrary(db: DbOrTx, orgId: string, userId: string) {
  await db
    .update(moduleDefinitions)
    .set({ ownerUserId: null })
    .where(and(eq(moduleDefinitions.organizationId, orgId), eq(moduleDefinitions.ownerUserId, userId)));
  await db
    .update(materials)
    .set({ ownerUserId: null })
    .where(and(eq(materials.organizationId, orgId), eq(materials.ownerUserId, userId)));
}
