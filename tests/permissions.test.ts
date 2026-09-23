import { describe, expect, it } from 'vitest';
import { type Action, can, type Role } from '../src/lib/permissions';

const me = 'u1';
const other = 'u2';
const actor = (role: Role) => ({ id: me, role });

describe('can(user, action, resource)', () => {
  it('admin puede todo', () => {
    for (const a of ['user:manage', 'pricing:write', 'catalog:admin', 'project:delete'] as Action[]) expect(can(actor('admin'), a, { ownerId: other })).toBe(true);
  });

  it('diseñador: crea y edita lo suyo, lee lo del resto, no toca precios', () => {
    const d = actor('disenador');
    expect(can(d, 'project:create')).toBe(true);
    expect(can(d, 'project:update', { ownerId: me })).toBe(true);
    expect(can(d, 'project:update', { ownerId: other })).toBe(false);
    expect(can(d, 'project:read', { ownerId: other })).toBe(true);
    expect(can(d, 'project:send', { ownerId: me })).toBe(true);
    expect(can(d, 'client:update', { ownerId: other })).toBe(false);
    expect(can(d, 'library:write')).toBe(true);
    expect(can(d, 'pricing:write')).toBe(false);
    expect(can(d, 'catalog:admin')).toBe(false);
    expect(can(d, 'user:manage')).toBe(false);
  });

  it('taller: solo proyectos aprobados, descarga planos y listas de corte, no edita', () => {
    const w = actor('taller');
    expect(can(w, 'project:read', { status: 'aprobado' })).toBe(true);
    expect(can(w, 'project:read', { status: 'diseno' })).toBe(false);
    expect(can(w, 'project:export', { status: 'aprobado' })).toBe(true);
    expect(can(w, 'project:export', { status: 'enviado' })).toBe(false);
    expect(can(w, 'project:update', { status: 'aprobado', ownerId: me })).toBe(false);
    expect(can(w, 'client:read')).toBe(false);
    expect(can(w, 'library:write')).toBe(false);
  });

  it('lectura: solo lectura', () => {
    const r = actor('lectura');
    expect(can(r, 'project:read', { status: 'diseno' })).toBe(true);
    expect(can(r, 'client:read')).toBe(true);
    for (const a of ['project:create', 'project:update', 'client:create', 'library:write', 'file:write', 'pricing:write'] as Action[]) expect(can(r, a, { ownerId: me })).toBe(false);
  });
});
