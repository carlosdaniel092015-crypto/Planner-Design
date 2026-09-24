import { createRoute, z } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { sql } from 'drizzle-orm';
import { bodyLimit } from 'hono/body-limit';
import { serveStatic } from '@hono/node-server/serve-static';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import type { Db } from './db/client';
import type { AppConfig } from './lib/config';
import type { AppEnv, Deps } from './lib/context';
import { AppError, errorBody } from './lib/errors';
import { json, pick, router } from './lib/openapi';
import { memoryRateLimiter, type RateLimiter } from './lib/rate-limit';
import { authRoutes, meRoutes } from './routes/auth';
import { accountRoutes } from './routes/account';
import { organizationRoutes } from './routes/organization';
import { versionRoutes } from './routes/version';
import { clientRoutes } from './routes/clients';
import { storageFileRoutes } from './routes/storage-files';
import { userRoutes } from './routes/users';
import { readSessionToken, resolveSession } from './services/auth';
import type { Mailer } from './services/mailer';
import { isDevStorage, type Storage } from './services/storage';
import { registerProjectRoutes } from './routes/register';

export interface CreateAppOptions {
  /** Folder with the static frontend served at / (optional). */
  webRoot?: string;
  db: Db;
  storage: Storage;
  mailer: Mailer;
  config: AppConfig;
  rateLimiter?: RateLimiter;
}

export function createApp(opts: CreateAppOptions) {
  const deps: Deps = { ...opts, rateLimiter: opts.rateLimiter ?? memoryRateLimiter() };
  const app = router();

  app.onError((err, c) => {
    if (err instanceof AppError) return c.json(errorBody(err.code, err.message, err.details), err.status);
    if (err instanceof HTTPException) {
      const status = err.status;
      const code = status === 413 ? 'DEMASIADO_GRANDE' : 'SOLICITUD_INVALIDA';
      const message = status === 413 ? 'El contenido supera el tamaño permitido.' : err.message || 'Solicitud no válida.';
      return c.json(errorBody(code, message), status as 400);
    }
    if (err instanceof SyntaxError) return c.json(errorBody('JSON_INVALIDO', 'El cuerpo no es JSON válido.'), 400);
    console.error('[error no controlado]', err);
    return c.json(errorBody('ERROR_INTERNO', 'Ocurrió un error inesperado. Inténtalo de nuevo.'), 500);
  });
  app.notFound((c) => c.json(errorBody('RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.'), 404));

  app.use('*', async (c, next) => {
    c.set('deps', deps);
    c.set('auth', null);
    await next();
  });
  app.use(
    '/api/*',
    secureHeaders({
      // The API serves JSON; /docs needs the Scalar CDN script.
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net', 'data:'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
      crossOriginResourcePolicy: 'cross-origin',
    }),
  );
  app.use(
    '/api/*',
    cors({
      origin: (origin) => (origin === deps.config.frontendUrl ? origin : null),
      credentials: true,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'If-Match', 'If-None-Match', 'Authorization'],
      exposeHeaders: ['ETag', 'Retry-After'],
      maxAge: 600,
    }),
  );
  // Default 5 MB request body; uploads and library import have their own (larger) limits.
  const defaultLimit = bodyLimit({
    maxSize: 5 * 1024 * 1024,
    onError: () => {
      throw new AppError(413, 'DEMASIADO_GRANDE', 'El contenido supera el tamaño permitido (5 MB).');
    },
  });
  app.use('/api/v1/*', (c, next) => (c.req.path.startsWith('/api/v1/storage/') || c.req.path === '/api/v1/library/import' ? next() : defaultLimit(c, next)));
  app.use('/api/v1/*', async (c, next) => {
    const token = readSessionToken(c);
    if (token) c.set('auth', await resolveSession(deps.db, token));
    await next();
  });

  const v1 = router();

  v1.openapi(
    createRoute({
      method: 'get',
      path: '/health',
      tags: ['Salud'],
      summary: 'Estado del servicio y de la base de datos',
      responses: {
        200: json(z.object({ status: z.literal('ok'), db: z.literal('ok'), time: z.iso.datetime() })),
        503: json(z.object({ status: z.literal('error'), db: z.literal('error') }), 'Base de datos no disponible'),
      },
    }),
    async (c) => {
      try {
        await deps.db.execute(sql`select 1`);
        return c.json({ status: 'ok' as const, db: 'ok' as const, time: new Date().toISOString() }, 200);
      } catch {
        return c.json({ status: 'error' as const, db: 'error' as const }, 503);
      }
    },
  );

  v1.route('/auth', authRoutes());
  v1.route('/', meRoutes());
  v1.route('/', accountRoutes());
  v1.route('/', versionRoutes());
  v1.route('/', organizationRoutes());
  v1.route('/users', userRoutes());
  v1.route('/clients', clientRoutes());
  registerProjectRoutes(v1);
  if (isDevStorage(deps.storage)) v1.route('/storage', storageFileRoutes());

  app.route('/api/v1', v1);

  app.openAPIRegistry.registerComponent('securitySchemes', 'cookieAuth', { type: 'apiKey', in: 'cookie', name: 'pd_session' });
  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', { type: 'http', scheme: 'bearer' });
  app.doc31('/api/v1/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'Planeador 3D de cocinas y closets — API',
      version: '1.0.0',
      description:
        'API REST del planeador. Todas las rutas autenticadas usan la cookie `pd_session` (o `Authorization: Bearer <token>`). ' +
        'Los errores tienen la forma `{ error: { code, message, details? } }`. Los importes aceptan `?currency=USD|DOP`.',
    },
    servers: [{ url: deps.config.apiUrl }],
  });
  app.get('/api/v1/docs', Scalar({ url: '/api/v1/openapi.json', pageTitle: 'Planeador API' }));
  // Frontend (Claude Design prototype) served from web/. It loads React, Babel and icons from unpkg and
  // compiles its template in the browser, so it gets a looser CSP than the API.
  // Digital Asset Links: lets the Play Store app (Trusted Web Activity) open this site full screen, without a browser bar.
  app.get('/.well-known/assetlinks.json', (c) => {
    const android = deps.config.android;
    if (!android?.sha256.length) return c.json([], 200);
    return c.json(
      [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: android.packageName, sha256_cert_fingerprints: android.sha256 } }],
      200,
    );
  });

  if (opts.webRoot) {
    const root = opts.webRoot;
    const isApi = (path: string) => path === '/api' || path.startsWith('/api/');
    const webHeaders = secureHeaders({
        contentSecurityPolicy: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'blob:', 'https://unpkg.com', 'https://cdn.jsdelivr.net'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'data:', 'https://unpkg.com', 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          // The service worker (offline PWA) fetches fonts and uploaded media under this policy too.
          connectSrc: ["'self'", 'blob:', 'data:', 'https://unpkg.com', 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://*.public.blob.vercel-storage.com'],
          workerSrc: ["'self'", 'blob:'],
          manifestSrc: ["'self'"],
        },
    });
    const files = serveStatic({ root });
    const spa = serveStatic({ root, path: 'index.html' });
    // Unknown /api paths must keep answering the JSON 404, never the HTML page.
    app.get('*', (c, next) => (isApi(c.req.path) ? next() : webHeaders(c, next)));
    app.get('*', (c, next) => (isApi(c.req.path) ? next() : files(c, next)));
    app.get('*', (c, next) => (isApi(c.req.path) ? next() : spa(c, next)));
  } else app.get('/', (c) => c.redirect('/api/v1/docs'));

  void pick;
  return app;
}

export type App = ReturnType<typeof createApp>;
export type { AppEnv };
