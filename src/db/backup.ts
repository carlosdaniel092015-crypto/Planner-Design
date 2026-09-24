// npm run db:backup — writes a backup now into BACKUP_DIR (default ./.data/backups).
import { connect } from './client';
import { envInt, writeBackup } from './backup-lib';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL.');
  process.exit(1);
}
const handle = await connect(url);
try {
  const { file, bytes } = await writeBackup(handle.db, process.env.BACKUP_DIR ?? './.data/backups', envInt(process.env.BACKUP_KEEP, 14));
  console.info(`Respaldo listo: ${file} (${(bytes / 1048576).toFixed(1)} MB).`);
} finally {
  await handle.close();
}
