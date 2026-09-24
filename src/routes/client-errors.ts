import { createRoute, z } from '@hono/zod-openapi';
import { body, json, router } from '../lib/openapi';
import { clientIp } from '../lib/rate-limit';

/**
 * Browser errors land in the server log (Easypanel → Logs) as one JSON line each, so problems on users' devices are visible.
 * No session needed (it can fail before login); 20 per minute per IP.
 */
export function clientErrorRoutes() {
  const r = router();
  r.openapi(
    createRoute({
      method: 'post',
      path: '/client-errors',
      tags: ['Sistema'],
      summary: 'Reportar un error del navegador',
      request: body(
        z.object({
          message: z.string().max(1000),
          stack: z.string().max(8000).optional(),
          url: z.string().max(1000).optional(),
          version: z.string().max(40).optional(),
          userAgent: z.string().max(400).optional(),
        }),
      ),
      responses: { 200: json(z.object({ ok: z.literal(true) })) },
    }),
    (c) => {
      const ip = clientIp(c);
      if (c.var.deps.rateLimiter.hit(`client-error:${ip}`, 20, 60_000).allowed) {
        const a = c.get('auth');
        const e = c.req.valid('json');
        console.error(JSON.stringify({ level: 'error', source: 'navegador', at: new Date().toISOString(), org: a?.org.id ?? null, user: a?.user.id ?? null, ...e }));
      }
      return c.json({ ok: true as const }, 200);
    },
  );
  return r;
}
