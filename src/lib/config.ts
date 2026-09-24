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
