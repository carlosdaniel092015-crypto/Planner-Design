import { resolve } from 'node:path';
import { connect } from './client';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL.');
  process.exit(1);
}
const handle = await connect(url);
try {
  await handle.migrate(resolve(process.env.MIGRATIONS_DIR ?? 'drizzle'));
  console.info(`Migraciones aplicadas (${handle.driver}).`);
} finally {
  await handle.close();
}
