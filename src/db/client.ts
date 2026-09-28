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
/**
 * Fails fast with a readable message (never printing the URL, it holds the password) instead of a TypeError deep inside pg.
 * The usual cause is a password with @ : / # ? that is not percent-encoded, or quotes/spaces pasted around the value.
 */
export function assertDatabaseUrl(url: string) {
  const u = url.trim();
  const hint =
    'Revisa DATABASE_URL (o POSTGRES_PASSWORD en Dokploy): formato postgres://usuario:clave@host:5432/base, sin comillas ni espacios. ' +
    'Si la contraseña tiene @ : / # ? % codifícala (%40 %3A %2F %23 %3F %25) o usa una solo con letras y números.';
  if (u !== url || /^["']|["']$/.test(u)) throw new Error(`DATABASE_URL tiene espacios o comillas alrededor. ${hint}`);
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    throw new Error(`DATABASE_URL no es una URL válida. ${hint}`);
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) throw new Error(`DATABASE_URL debe empezar con postgres:// (empieza con ${parsed.protocol}//). ${hint}`);
  if (!parsed.hostname) throw new Error(`DATABASE_URL no tiene servidor (host). ${hint}`);
}

export async function connect(url: string): Promise<DbHandle> {
  if (!url.startsWith('pglite:')) assertDatabaseUrl(url);
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
