import type { DbOrTx } from '../db/client';
import { auditLog } from '../db/schema';
import type { AuthContext } from './context';

export type AuditAction =
  | 'crear'
  | 'actualizar'
  | 'eliminar'
  | 'enviar'
  | 'revocar'
  | 'aprobar'
  | 'solicitar_cambios'
  | 'restaurar'
  | 'cambiar_precios'
  | 'cambiar_tasa'
  | 'cambiar_rol'
  | 'invitar'
  | 'importar'
  | 'iniciar_sesion'
  | 'compartir'
  | 'dejar_de_compartir'
  | 'cambiar_plan'
  | 'reabrir';

export async function audit(
  db: DbOrTx,
  who: { organizationId: string; userId: string | null } | AuthContext,
  action: AuditAction,
  entity: string,
  entityId: string | null,
  meta: Record<string, unknown> = {},
) {
  const organizationId = 'org' in who ? who.org.id : who.organizationId;
  const userId = 'org' in who ? who.user.id : who.userId;
  await db.insert(auditLog).values({ organizationId, userId, action, entity, entityId, meta });
}
