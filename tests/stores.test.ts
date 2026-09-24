import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/lib/config';
import { setup, type Ctx } from './helpers';

let t: Ctx;
beforeAll(async () => {
  t = await setup();
});
afterAll(() => t.close());

describe('tiendas de apps', () => {
  it('sin configurar, assetlinks.json responde una lista vacía', async () => {
    const r = await t.app.request('/.well-known/assetlinks.json');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual([]);
  });

  it('con ANDROID_PACKAGE_NAME y ANDROID_CERT_SHA256 publica el vínculo de la app de Play Store', async () => {
    const env = { NODE_ENV: 'test', ANDROID_PACKAGE_NAME: 'com.ejemplo.planner', ANDROID_CERT_SHA256: 'aa:bb:cc, DD:EE:FF' };
    expect(loadConfig(env).android).toEqual({ packageName: 'com.ejemplo.planner', sha256: ['AA:BB:CC', 'DD:EE:FF'] });
    const app = createApp({ db: t.db, storage: t.storage, mailer: t.mailer, config: { ...t.config, android: loadConfig(env).android } });
    const body = (await (await app.request('/.well-known/assetlinks.json')).json()) as { relation: string[]; target: Record<string, unknown> }[];
    expect(body[0]).toMatchObject({ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'com.ejemplo.planner', sha256_cert_fingerprints: ['AA:BB:CC', 'DD:EE:FF'] } });
  });
});
