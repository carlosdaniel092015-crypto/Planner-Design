import { describe, expect, it } from 'vitest';
import { assertDatabaseUrl } from '../src/db/client';

describe('DATABASE_URL', () => {
  it('acepta URLs de Postgres válidas', () => {
    expect(() => assertDatabaseUrl('postgres://planner:Clave123@db:5432/planner')).not.toThrow();
    expect(() => assertDatabaseUrl('postgresql://u:p%40ss@1.2.3.4:5433/db?sslmode=disable')).not.toThrow();
  });
  it('explica el problema sin mostrar la contraseña', () => {
    for (const bad of ['postgres://u:a#b@db:5432/x', '"postgres://u:p@db/x"', ' postgres://u:p@db/x', 'mysql://u:p@db/x', 'postgres://u:p/x']) {
      let msg = '';
      try {
        assertDatabaseUrl(bad);
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).toMatch(/DATABASE_URL/);
      expect(msg).not.toContain('a#b');
    }
  });
});
