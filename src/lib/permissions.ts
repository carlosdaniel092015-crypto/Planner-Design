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
  | 'project:share'
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
  | 'audit:read'
  | 'org:manage'
  | 'billing:manage';

export interface Actor {
  id: string;
  role: Role;
}

/** How the caller reaches a project: they own it, or it was shared with them to view or to edit. */
export type ProjectAccess = 'propietario' | 'editar' | 'ver';

/** Optional resource attributes used by ownership / status rules. */
export interface Resource {
  ownerId?: string | null;
  status?: string;
  /** Required for project:* checks on a specific project (see services/projects accessOf). */
  access?: ProjectAccess | null;
}

const READ_ONLY: Action[] = ['project:read', 'project:export', 'client:read', 'catalog:read', 'library:read', 'pricing:read', 'file:read'];

const OWN_ONLY = new Set<Action>(['client:update', 'client:delete', 'file:delete']);
/** Project actions a share with access "editar" allows. */
const PROJECT_EDIT = new Set<Action>(['project:update', 'project:send', 'project:approve']);
/** Project actions only the owner can do. */
const PROJECT_OWNER = new Set<Action>(['project:delete', 'project:share']);

const MATRIX: Record<Role, Set<Action>> = {
  admin: new Set<Action>(), // everything, handled below
  disenador: new Set<Action>([
    ...READ_ONLY,
    'project:create',
    'project:update',
    'project:delete',
    'project:send',
    'project:approve',
    'project:share',
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
 * Projects are private: every role, admin included, only reaches the projects it owns or that were shared
 * with it. On those, the role still caps what can be done:
 * - admin: everything else inside their organisation (users, prices, catalogue).
 * - disenador: creates projects and clients, edits their own (and those shared with "editar"); library uploads.
 * - taller: reads the projects shared with it and downloads cut lists / drawings.
 * - lectura: read only.
 */
export function can(actor: Actor, action: Action, resource?: Resource): boolean {
  const roleAllows = actor.role === 'admin' || MATRIX[actor.role].has(action);
  if (!roleAllows) return false;
  if (action.startsWith('project:') && action !== 'project:create' && resource) {
    const acc = resource.access;
    if (!acc) return false;
    if (PROJECT_OWNER.has(action)) return acc === 'propietario';
    if (PROJECT_EDIT.has(action)) return acc === 'propietario' || acc === 'editar';
    return true; // read / export
  }
  if (actor.role === 'admin') return true;
  if (actor.role === 'disenador' && OWN_ONLY.has(action) && resource && resource.ownerId !== actor.id) return false;
  return true;
}

/** Roles that can receive a project shared with "editar". */
export const canEditProjects = (role: Role) => role === 'admin' || role === 'disenador';

export function assertCan(actor: Actor, action: Action, resource?: Resource) {
  if (!can(actor, action, resource)) throw forbidden();
}
