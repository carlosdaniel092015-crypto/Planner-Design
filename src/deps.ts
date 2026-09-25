import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app';
import { connect } from './db/client';
import { loadConfig } from './lib/config';
import { consoleMailer, resendMailer, smtpMailer } from './services/mailer';
import { blobStorage, diskStorage } from './services/storage';

/** Builds the production/development app from environment variables. */
export async function buildFromEnv(env: Record<string, string | undefined> = process.env) {
  const config = loadConfig(env);
  if (!env.DATABASE_URL) throw new Error('Falta DATABASE_URL.');
  const handle = await connect(env.DATABASE_URL);
  const storage = env.BLOB_READ_WRITE_TOKEN
    ? blobStorage(env.BLOB_READ_WRITE_TOKEN)
    : diskStorage(config.apiUrl, config.authSecret, resolve(config.uploadsDir));
  // SMTP (e.g. Gmail) first, then Resend; without either, emails are printed to the console.
  const mailer =
    env.SMTP_USER && env.SMTP_PASS
      ? smtpMailer({ host: env.SMTP_HOST || 'smtp.gmail.com', port: Number(env.SMTP_PORT || 465), user: env.SMTP_USER.trim(), pass: env.SMTP_PASS.replace(/\s+/g, '') }, env.MAIL_FROM || `Planner <${env.SMTP_USER.trim()}>`)
      : env.RESEND_API_KEY
        ? resendMailer(env.RESEND_API_KEY, config.mailFrom)
        : consoleMailer();
  const webRoot = env.WEB_ROOT ?? 'dist/web';
  const app = createApp({ db: handle.db, storage, mailer, config, webRoot: existsSync(webRoot) ? webRoot : undefined });
  return { app, handle, config };
}
