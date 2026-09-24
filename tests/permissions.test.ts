import { describe, expect, it } from 'vitest';
import { type Action, can, type Role } from '../src/lib/permissions';

const me = 'u1';
const other = 'u2';
const actor = (role: Role) => ({ id: me, role });

describe('can(user, action, resource)', () => {
  it('admin: todo lo de la organización, pero los proyectos solo si son suyos o se los compartieron', () => {
    for (const a of ['user:manage', 'pricing:write', 'catalog:admin', 'library:write', 'org:manage', 'audit:read'] as Action[]) expect(can(actor('admin'), a, { ownerId: other })).toBe(true);
    expect(can(actor('admin'), 'project:read', { access: null })).toBe(false);
    expect(can(actor('admin'), 'project:delete', { access: 'editar' })).toBe(false);
    expect(can(actor('admin'), 'project:delete', { access: 'propietario' })).toBe(true);
  });

  it('proyectos privados: sin acceso no se ve; ver = leer y exportar; editar = modificar y enviar; dueño = borrar y compartir', () => {
    const d = actor('disenador');
    expect(can(d, 'project:create')).toBe(true);
    expect(can(d, 'project:read', { access: null })).toBe(false);
    expect(can(d, 'project:read', {})).toBe(false);
    for (const a of ['project:read', 'project:export'] as Action[]) expect(can(d, a, { access: 'ver' })).toBe(true);
    for (const a of ['project:update', 'project:send', 'project:approve', 'project:delete', 'project:share'] as Action[]) expect(can(d, a, { access: 'ver' })).toBe(false);
    for (const a of ['project:update', 'project:send', 'project:approve'] as Action[]) expect(can(d, a, { access: 'editar' })).toBe(true);
    for (const a of ['project:delete', 'project:share'] as Action[]) {
      expect(can(d, a, { access: 'editar' })).toBe(false);
      expect(can(d, a, { access: 'propietario' })).toBe(true);
    }
  });

  it('diseñador: clientes propios, biblioteca, sin precios ni usuarios', () => {
    const d = actor('disenador');
    expect(can(d, 'client:update', { ownerId: other })).toBe(false);
    expect(can(d, 'client:update', { ownerId: me })).toBe(true);
    expect(can(d, 'library:write')).toBe(true);
    expect(can(d, 'pricing:write')).toBe(false);
    expect(can(d, 'catalog:admin')).toBe(false);
    expect(can(d, 'user:manage')).toBe(false);
    expect(can(d, 'org:manage')).toBe(false);
    expect(can(d, 'audit:read')).toBe(false);
  });

  it('taller: solo lo que le compartan, descarga planos y listas de corte, nunca edita', () => {
    const w = actor('taller');
    expect(can(w, 'project:read', { access: 'ver', status: 'diseno' })).toBe(true);
    expect(can(w, 'project:export', { access: 'ver' })).toBe(true);
    expect(can(w, 'project:read', { access: null, status: 'aprobado' })).toBe(false);
    expect(can(w, 'project:update', { access: 'editar' })).toBe(false);
    expect(can(w, 'project:create')).toBe(false);
    expect(can(w, 'client:read')).toBe(false);
    expect(can(w, 'library:write')).toBe(false);
  });

  it('lectura: solo lectura', () => {
    const r = actor('lectura');
    expect(can(r, 'project:read', { access: 'ver' })).toBe(true);
    expect(can(r, 'client:read')).toBe(true);
    for (const a of ['project:create', 'project:update', 'project:share', 'client:create', 'library:write', 'file:write', 'pricing:write'] as Action[])
      expect(can(r, a, { ownerId: me, access: 'propietario' })).toBe(false);
  });
});
