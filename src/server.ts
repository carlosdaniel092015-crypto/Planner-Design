import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
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

const shutdown = async () => {
  server.close();
  await handle.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
