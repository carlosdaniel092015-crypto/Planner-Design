import { forbidden } from './errors';

export type Role = 'admin' | 'disenador' | 'taller' | 'lectura';

export type Action =
  | 'project:read'
  | 'project:create'
  | 'project:update'
  | 'project:delete'
  | 'project:send'
  | 'project:approve'
  | 'project:export'
  | 'client:read'
  | 'client:create'
  | 'client:update'
  | 'client:delete'
  | 'user:manage'
  | 'catalog:read'
  | 'catalog:admin'
  | 'library:read'
  | 'library:write'
  | 'pricing:read'
  | 'pricing:write'
  | 'file:read'
  | 'file:write'
  | 'file:delete'
  | 'audit:read';

export interface Actor {
  id: string;
  role: Role;
}

/** Optional resource attributes used by ownership / status rules. */
export interface Resource {
  ownerId?: string | null;
  status?: string;
}

const READ_ONLY: Action[] = ['project:read', 'project:export', 'client:read', 'catalog:read', 'library:read', 'pricing:read', 'file:read'];

const OWN_ONLY = new Set<Action>(['project:update', 'project:delete', 'project:send', 'project:approve', 'client:update', 'client:delete', 'file:delete']);

const MATRIX: Record<Role, Set<Action>> = {
  admin: new Set<Action>(), // everything, handled below
  disenador: new Set<Action>([
    ...READ_ONLY,
    'project:create',
    'project:update',
    'project:delete',
    'project:send',
    'project:approve',
    'client:create',
    'client:update',
    'client:delete',
    'library:write',
    'file:write',
    'file:delete',
  ]),
  taller: new Set<Action>(['project:read', 'project:export', 'catalog:read', 'library:read', 'pricing:read', 'file:read']),
  lectura: new Set<Action>(READ_ONLY),
};

/**
 * - admin: everything inside their organisation.
 * - disenador: creates and edits their own projects and clients, reads everyone's; library uploads; no pricing changes.
 * - taller: reads only approved projects and downloads cut lists / drawings.
 * - lectura: read only.
 */
export function can(actor: Actor, action: Action, resource?: Resource): boolean {
  if (actor.role === 'admin') return true;
  if (!MATRIX[actor.role].has(action)) return false;
  if (actor.role === 'disenador' && OWN_ONLY.has(action) && resource && resource.ownerId !== actor.id) return false;
  if (actor.role === 'taller' && action.startsWith('project:') && resource?.status !== undefined && resource.status !== 'aprobado') return false;
  return true;
}

export function assertCan(actor: Actor, action: Action, resource?: Resource) {
  if (!can(actor, action, resource)) throw forbidden();
}
