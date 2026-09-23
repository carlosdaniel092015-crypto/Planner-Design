import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { setup, type Ctx } from './helpers';

let t: Ctx;
beforeAll(async () => {
  t = await setup();
});
afterAll(() => t.close());

describe('documentación', () => {
  it('/openapi.json describe toda la API con resumen y ejemplos', async () => {
    const r = await t.req('GET', '/openapi.json');
    expect(r.status).toBe(200);
    const doc = r.data;
    expect(doc.openapi).toBe('3.1.0');
    const ops = Object.entries(doc.paths as Record<string, Record<string, any>>).flatMap(([path, methods]) => Object.entries(methods).map(([m, op]) => ({ path, m, op })));
    expect(ops.length).toBeGreaterThanOrEqual(55);
    for (const { path, m, op } of ops) expect(op.summary, `${m} ${path}`).toBeTruthy();
    const paths = Object.keys(doc.paths);
    for (const p of [
      '/api/v1/health',
      '/api/v1/auth/sign-in',
      '/api/v1/me',
      '/api/v1/users',
      '/api/v1/clients',
      '/api/v1/projects',
      '/api/v1/projects/{id}',
      '/api/v1/projects/{id}/validate',
      '/api/v1/projects/{id}/versions/{vid}/restore',
      '/api/v1/catalog',
      '/api/v1/admin/modules',
      '/api/v1/admin/prices/bulk',
      '/api/v1/settings/pricing',
      '/api/v1/exchange-rates',
      '/api/v1/files/upload-token',
      '/api/v1/library/textures',
      '/api/v1/library/models/inspect',
      '/api/v1/library/import',
      '/api/v1/library/export',
      '/api/v1/projects/{id}/approval-links',
      '/api/v1/approval-links/{id}/revoke',
      '/api/v1/projects/{id}/approve-internal',
      '/api/v1/public/approvals/{token}',
      '/api/v1/projects/{id}/cutlist.csv',
      '/api/v1/projects/{id}/pieces.dxf',
    ])
      expect(paths, p).toContain(p);
    const text = JSON.stringify(doc);
    expect(text).toContain('"example"');
    expect(doc.components.securitySchemes.cookieAuth).toMatchObject({ type: 'apiKey', in: 'cookie', name: 'pd_session' });
  });

  it('/docs sirve la interfaz de Scalar', async () => {
    const r = await t.app.request('/api/v1/docs');
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('/api/v1/openapi.json');
  });

  it('encabezados de seguridad y CORS solo para FRONTEND_URL', async () => {
    const ok = await t.app.request('/api/v1/health', { headers: { origin: 'http://localhost:5173' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(ok.headers.get('access-control-allow-credentials')).toBe('true');
    expect(ok.headers.get('x-content-type-options')).toBe('nosniff');
    const bad = await t.app.request('/api/v1/health', { headers: { origin: 'https://otro.example.com' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('límite global de 5 MB por petición', async () => {
    const r = await t.req('POST', '/clients', { user: t.adminA, body: { name: 'x', notes: 'x'.repeat(6 * 1024 * 1024) } });
    expect(r.status).toBe(413);
    expect(r.data.error.code).toBe('DEMASIADO_GRANDE');
  });

  it('sirve el frontend en / sin tapar los 404 de la API', async () => {
    const web = createApp({ db: t.db, storage: t.storage, mailer: t.mailer, config: t.config, webRoot: 'web' });
    const home = await web.request('/');
    expect(home.status).toBe(200);
    expect(await home.text()).toContain('<x-dc>');
    expect(home.headers.get('content-security-policy')).toContain('unpkg.com');
    const js = await web.request('/planner-engine.js');
    expect(js.status).toBe(200);
    expect((await web.request('/proyectos/123')).status).toBe(200);
    const api404 = await web.request('/api/v1/no-existe');
    expect(api404.status).toBe(404);
    expect(((await api404.json()) as any).error.code).toBe('RUTA_NO_ENCONTRADA');
    expect((await web.request('/api/v1/health')).headers.get('content-security-policy')).not.toContain('unpkg.com');
  });

  it('errores con la forma { error: { code, message } }', async () => {
    const r = await t.req('GET', '/no-existe');
    expect(r.status).toBe(404);
    expect(r.data).toEqual({ error: { code: 'RUTA_NO_ENCONTRADA', message: 'La ruta solicitada no existe.' } });
    const bad = await t.app.request('/api/v1/auth/sign-in', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{malo' });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as any).error.code).toBeTruthy();
  });
});
