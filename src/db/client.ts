import type { PgDatabase } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export { schema };
export type Db = PgDatabase<any, typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

export interface DbHandle {
  db: Db;
  driver: 'neon' | 'pg' | 'pglite';
  migrate: (migrationsFolder: string) => Promise<void>;
  close: () => Promise<void>;
}

/**
 * Picks the driver from the URL:
 * - `pglite://<dir>` or `pglite://memory` → embedded PGlite (tests, local without Docker)
 * - Neon host (or DATABASE_DRIVER=neon) → Neon serverless driver over WebSockets (production)
 * - anything else → node-postgres
 */
export async function connect(url: string): Promise<DbHandle> {
  if (url.startsWith('pglite:')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    const dir = url.slice('pglite://'.length);
    if (dir && dir !== 'memory') await (await import('node:fs/promises')).mkdir(dir, { recursive: true });
    const client = dir && dir !== 'memory' ? new PGlite(dir) : new PGlite();
    const db = drizzle(client, { schema });
    return {
      db: db as unknown as Db,
      driver: 'pglite',
      migrate: (migrationsFolder) => migrate(db, { migrationsFolder }),
      close: () => client.close(),
    };
  }

  const isNeon = process.env.DATABASE_DRIVER === 'neon' || /\.neon\.tech/.test(url);
  if (isNeon) {
    const { Pool, neonConfig } = await import('@neondatabase/serverless');
    const { drizzle } = await import('drizzle-orm/neon-serverless');
    const { migrate } = await import('drizzle-orm/neon-serverless/migrator');
    if (typeof WebSocket === 'undefined') neonConfig.webSocketConstructor = (await import('ws')).default;
    const pool = new Pool({ connectionString: url });
    const db = drizzle(pool, { schema });
    return {
      db: db as unknown as Db,
      driver: 'neon',
      migrate: (migrationsFolder) => migrate(db, { migrationsFolder }),
      close: () => pool.end(),
    };
  }

  const pg = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  const pool = new pg.default.Pool({ connectionString: url, max: 10 });
  const db = drizzle(pool, { schema });
  return {
    db: db as unknown as Db,
    driver: 'pg',
    migrate: (migrationsFolder) => migrate(db, { migrationsFolder }),
    close: () => pool.end(),
  };
}
