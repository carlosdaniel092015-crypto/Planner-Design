import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app';
import { connect } from './db/client';
import { loadConfig } from './lib/config';
import { consoleMailer, resendMailer } from './services/mailer';
import { blobStorage, diskStorage } from './services/storage';

/** Builds the production/development app from environment variables. */
export async function buildFromEnv(env: Record<string, string | undefined> = process.env) {
  const config = loadConfig(env);
  if (!env.DATABASE_URL) throw new Error('Falta DATABASE_URL.');
  const handle = await connect(env.DATABASE_URL);
  const storage = env.BLOB_READ_WRITE_TOKEN
    ? blobStorage(env.BLOB_READ_WRITE_TOKEN)
    : diskStorage(config.apiUrl, config.authSecret, resolve(config.uploadsDir));
  const mailer = env.RESEND_API_KEY ? resendMailer(env.RESEND_API_KEY, config.mailFrom) : consoleMailer();
  const webRoot = env.WEB_ROOT ?? 'dist/web';
  const app = createApp({ db: handle.db, storage, mailer, config, webRoot: existsSync(webRoot) ? webRoot : undefined });
  return { app, handle, config };
}
