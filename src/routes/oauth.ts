import { createRoute, z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { users } from '../db/schema';
import { audit } from '../lib/audit';
import { json, router } from '../lib/openapi';
import { clientIp, rateLimit } from '../lib/rate-limit';
import { createSession, setSessionCookie } from '../services/auth';
import {
  authorizeUrl,
  defaultOAuthRuntime,
  enabledProviders,
  exchangeCode,
  newFlow,
  OAuthError,
  openFlow,
  PROVIDER_NAME,
  PROVIDERS,
  type Provider,
  resolveOAuthUser,
  sealFlow,
} from '../services/oauth';

const FLOW_COOKIE = 'pd_oauth';
const FLOW_PATH = '/api/v1/auth/oauth';
const tags = ['Autenticación'];
const ProviderParam = z.object({ provider: z.enum(PROVIDERS as [Provider, ...Provider[]]).openapi({ param: { name: 'provider', in: 'path' }, example: 'google' }) });

export function oauthRoutes() {
  const r = router();
  r.use('/oauth/*', rateLimit({ name: 'oauth-ip', max: 30, windowMs: 15 * 60_000 }));

  r.openapi(
    createRoute({
      method: 'get',
      path: '/providers',
      tags,
      summary: 'Proveedores para iniciar sesión (Google, Microsoft)',
      description: 'Solo aparecen los que tienen credenciales configuradas (GOOGLE_CLIENT_ID/SECRET, MICROSOFT_CLIENT_ID/SECRET).',
      responses: { 200: json(z.object({ providers: z.array(z.object({ id: z.enum(PROVIDERS as [Provider, ...Provider[]]), name: z.string() })) })) },
    }),
    (c) => c.json({ providers: enabledProviders(c.var.deps.config).map((id) => ({ id, name: PROVIDER_NAME[id] })) }, 200),
  );

  r.openapi(
    createRoute({
      method: 'get',
      path: '/oauth/{provider}/start',
      tags,
      summary: 'Iniciar sesión con Google o Microsoft (redirige al proveedor)',
      description:
        'Guarda state, nonce y el verificador PKCE en una cookie firmada de 10 minutos y redirige a la página de acceso del proveedor. ' +
        '`redirect` es la ruta de la app a la que volver (solo rutas propias, p. ej. `/proyectos/…`).',
      request: { params: ProviderParam, query: z.object({ redirect: z.string().max(500).optional() }) },
      responses: { 302: { description: 'Redirección al proveedor, o a /login?error=… si no está disponible' } },
    }),
    (c) => {
      const { config } = c.var.deps;
      const { provider } = c.req.valid('param');
      if (!config.oauth[provider]) return c.redirect(`${config.frontendUrl}/login?error=proveedor_no_disponible`, 302);
      const flow = newFlow(provider, c.req.valid('query').redirect ?? '/');
      setCookie(c, FLOW_COOKIE, sealFlow(flow, config.authSecret), { httpOnly: true, secure: config.cookieSecure, sameSite: 'Lax', path: FLOW_PATH, maxAge: 600 });
      return c.redirect(authorizeUrl(config, provider, flow), 302);
    },
  );

  r.openapi(
    createRoute({
      method: 'get',
      path: '/oauth/{provider}/callback',
      tags,
      summary: 'Regreso del proveedor: verifica, inicia sesión o crea la cuenta',
      description:
        'Verifica state y el token de identidad (firma, emisor, audiencia, caducidad y nonce). Si la persona no tiene cuenta y el proveedor confirma su correo, ' +
        'se crea una organización nueva en plan Gratis con ella como administradora. Un correo que ya existe se vincula solo si el proveedor lo marca como verificado. ' +
        'Termina en la app con la cookie de sesión, o en /login?error=<código>.',
      request: { params: ProviderParam, query: z.object({ code: z.string().max(4000).optional(), state: z.string().max(200).optional(), error: z.string().max(200).optional() }) },
      responses: { 302: { description: 'A la app (con sesión) o a /login?error=…' } },
    }),
    async (c) => {
      const { db, config } = c.var.deps;
      const rt = c.var.deps.oauth ?? defaultOAuthRuntime;
      const { provider } = c.req.valid('param');
      const q = c.req.valid('query');
      const flow = openFlow(getCookie(c, FLOW_COOKIE), config.authSecret);
      deleteCookie(c, FLOW_COOKIE, { path: FLOW_PATH });
      const fail = (code: string) => c.redirect(`${config.frontendUrl}/login?error=${encodeURIComponent(code)}`, 302);
      if (q.error) return fail(q.error === 'access_denied' ? 'cancelado' : 'proveedor_error');
      if (!flow || flow.p !== provider || !q.state || q.state !== flow.state || !q.code) return fail('estado_invalido');
      try {
        const profile = await exchangeCode(config, rt, flow, q.code);
        // Two tabs finishing at the same instant can race on the unique identity index; the second attempt finds it.
        const who = await resolveOAuthUser(db, profile).catch(() => resolveOAuthUser(db, profile));
        const [u] = await db.select().from(users).where(eq(users.id, who.userId)).limit(1);
        if (!u?.active) return fail('cuenta_desactivada');
        const s = await createSession(db, u.id, config.sessionTtlDays, { ip: clientIp(c), userAgent: c.req.header('user-agent') });
        await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
        await audit(db, { organizationId: u.organizationId, userId: u.id }, 'iniciar_sesion', 'user', u.id, { via: provider, ...(who.created ? { cuentaNueva: true } : {}) });
        setSessionCookie(c, s.token, s.expiresAt);
        return c.redirect(`${config.frontendUrl}${flow.redirect}${who.created ? `${flow.redirect.includes('?') ? '&' : '?'}bienvenida=1` : ''}`, 302);
      } catch (e) {
        if (e instanceof OAuthError) return fail(e.code);
        console.warn('oauth', provider, e);
        return fail('proveedor_error');
      }
    },
  );

  return r;
}
