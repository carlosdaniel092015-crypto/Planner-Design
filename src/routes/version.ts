import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRoute, z } from '@hono/zod-openapi';
import { json, router } from '../lib/openapi';

// package.json sits in the working directory both locally and in the Docker image (/app).
const pkg = (() => {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version?: string };
  } catch {
    return {};
  }
})();
const startedAt = new Date().toISOString();

export const appVersion = () => ({
  version: pkg.version ?? '0.0.0',
  // Easypanel / CI can pass the deployed commit; locally it stays unknown.
  commit: (process.env.GIT_SHA ?? process.env.SOURCE_COMMIT ?? process.env.GITHUB_SHA ?? '').slice(0, 7) || null,
  startedAt,
});

export function versionRoutes() {
  const r = router();
  r.openapi(
    createRoute({
      method: 'get',
      path: '/version',
      tags: ['Sistema'],
      summary: 'Versión desplegada de la app',
      description: 'Sin sesión. Número de versión (semver, el de package.json), commit si el despliegue lo informa (GIT_SHA) y cuándo arrancó el servidor.',
      responses: { 200: json(z.object({ version: z.string(), commit: z.string().nullable(), startedAt: z.iso.datetime() }).openapi('VersionApp')) },
    }),
    (c) => c.json(appVersion(), 200),
  );
  return r;
}
