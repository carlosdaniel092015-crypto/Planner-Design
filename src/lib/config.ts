export interface AppConfig {
  env: 'production' | 'development' | 'test';
  /** Secret for HMAC-signed upload URLs and other internal tokens. */
  authSecret: string;
  /** Public URL of this API (used to build file and email links). */
  apiUrl: string;
  frontendUrl: string;
  mailFrom: string;
  sessionTtlDays: number;
  cookieSecure: boolean;
  /** Maximum project JSON size in bytes. */
  maxProjectBytes: number;
  /** Directory for uploaded files when Vercel Blob is not configured (Easypanel volume). */
  uploadsDir: string;
  port: number;
  /** Android app (Play Store, TWA) linked to this domain via /.well-known/assetlinks.json. */
  android: { packageName: string; sha256: string[] } | null;
  /** Sign-in with Google / Microsoft; a provider is offered only when its credentials are set. */
  oauth: { google: OAuthClient | null; microsoft: (OAuthClient & { tenant: string }) | null };
  /** Stripe billing; null = self-hosted mode without plan limits. */
  billing: { secretKey: string; webhookSecret: string; prices: { profesional?: string; empresa?: string } } | null;
}

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const mode = env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development';
  const authSecret = env.AUTH_SECRET ?? env.BETTER_AUTH_SECRET ?? '';
  if (mode === 'production' && authSecret.length < 32) throw new Error('AUTH_SECRET debe tener al menos 32 caracteres en producción.');
  const apiUrl = (env.API_URL ?? env.BETTER_AUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return {
    env: mode,
    authSecret: authSecret || 'dev-secret-not-for-production-use-000000',
    apiUrl,
    frontendUrl: (env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
    mailFrom: env.MAIL_FROM ?? 'Planeador <no-reply@example.com>',
    sessionTtlDays: 30,
    cookieSecure: apiUrl.startsWith('https://'),
    maxProjectBytes: 2 * 1024 * 1024,
    uploadsDir: env.UPLOADS_DIR ?? './.data/uploads',
    port: Number(env.PORT ?? 3000),
    oauth: {
      google: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { clientId: env.GOOGLE_CLIENT_ID.trim(), clientSecret: env.GOOGLE_CLIENT_SECRET.trim() } : null,
      microsoft:
        env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET
          ? { clientId: env.MICROSOFT_CLIENT_ID.trim(), clientSecret: env.MICROSOFT_CLIENT_SECRET.trim(), tenant: (env.MICROSOFT_TENANT || 'common').trim() }
          : null,
    },
    billing:
      env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET
        ? { secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET, prices: { profesional: env.STRIPE_PRICE_PROFESIONAL || undefined, empresa: env.STRIPE_PRICE_EMPRESA || undefined } }
        : null,
    android: env.ANDROID_PACKAGE_NAME
      ? {
          packageName: env.ANDROID_PACKAGE_NAME.trim(),
          sha256: (env.ANDROID_CERT_SHA256 ?? '')
            .split(',')
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean),
        }
      : null,
  };
}
