// npm run db:restore -- archivo.json.gz — restores a backup into an EMPTY database (migrations are applied first).
import { resolve } from 'node:path';
import { count } from 'drizzle-orm';
import { connect } from './client';
import { readBackup, restoreDatabase } from './backup-lib';
import { organizations } from './schema';

const url = process.env.DATABASE_URL;
const file = process.argv[2];
if (!url || !file) {
  console.error('Uso: DATABASE_URL=… npm run db:restore -- respaldo.json.gz');
  process.exit(1);
}
const handle = await connect(url);
try {
  await handle.migrate(resolve(process.env.MIGRATIONS_DIR ?? 'drizzle'));
  const [n] = await handle.db.select({ n: count() }).from(organizations);
  if ((n?.n ?? 0) > 0) throw new Error('La base de datos no está vacía. Restaura en una base nueva para no mezclar datos.');
  const counts = await restoreDatabase(handle.db, await readBackup(file));
  console.info('Restaurado:', Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · '));
} finally {
  await handle.close();
}
