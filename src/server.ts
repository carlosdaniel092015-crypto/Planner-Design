import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { writeBackup } from './db/backup-lib';
import { buildFromEnv } from './deps';

const { app, handle, config } = await buildFromEnv();

if (process.env.RUN_MIGRATIONS === 'true') {
  console.info('[migraciones] aplicando…');
  await handle.migrate(resolve(process.env.MIGRATIONS_DIR ?? 'drizzle'));
  console.info('[migraciones] listas');
}

const server = serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, (info) => {
  console.info(`API escuchando en http://localhost:${info.port} (documentación: ${config.apiUrl}/api/v1/docs)`);
});

// Daily logical backup into the persistent volume (Easypanel: /data/backups). Off unless BACKUP_DIR is set.
let backupTimer: ReturnType<typeof setInterval> | undefined;
if (process.env.BACKUP_DIR) {
  const dir = process.env.BACKUP_DIR;
  const keep = Number(process.env.BACKUP_KEEP ?? 14);
  const hours = Math.max(1, Number(process.env.BACKUP_INTERVAL_HOURS ?? 24));
  const run = () =>
    writeBackup(handle.db, dir, keep)
      .then(({ file, bytes }) => console.info(`[respaldo] ${file} (${(bytes / 1048576).toFixed(1)} MB)`))
      .catch((e) => console.error('[respaldo] falló', e));
  setTimeout(run, 5 * 60_000).unref();
  backupTimer = setInterval(run, hours * 3_600_000);
  backupTimer.unref();
}

const shutdown = async () => {
  if (backupTimer) clearInterval(backupTimer);
  server.close();
  await handle.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
