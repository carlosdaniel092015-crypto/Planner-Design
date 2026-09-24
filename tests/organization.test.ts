import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, setup, type Ctx, type TestUser } from './helpers';

let t: Ctx;
let dis: TestUser;
beforeAll(async () => {
  t = await setup();
  dis = await t.makeUser(t.orgA.id, 'disenador', 'dis-org@a.test');
});
afterAll(() => t.close());

async function uploadImage(user: TestUser) {
  const bytes = new Uint8Array(await sharp({ create: { width: 64, height: 32, channels: 3, background: { r: 20, g: 110, b: 90 } } }).png().toBuffer());
  const tok = await t.req('POST', '/files/upload-token', { user, body: { kind: 'miniatura', contentType: 'image/png', size: bytes.byteLength, name: 'logo.png' } });
  const put = await t.app.request(tok.data.uploadUrl.replace(API, ''), { method: 'PUT', headers: { 'content-type': 'image/png' }, body: bytes });
  const { url } = (await put.json()) as { url: string };
  return t.req('POST', '/files', { user, body: { kind: 'miniatura', blobUrl: url, name: 'logo.png' } });
}

describe('organización y auditoría', () => {
  it('el admin cambia nombre, color, logo y términos; se ven en /me y quedan en la auditoría', async () => {
    const f = await uploadImage(t.adminA);
    expect(f.status, JSON.stringify(f.data)).toBe(201);
    const r = await t.req('PATCH', '/organization', { user: t.adminA, body: { name: 'Muebles Ortega', brandColor: '#1f6f5c', logoFileId: f.data.id, approvalTerms: 'Acepto el diseño.' } });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    expect(r.data).toMatchObject({ name: 'Muebles Ortega', brandColor: '#1f6f5c', approvalTerms: 'Acepto el diseño.' });
    expect(r.data.logoUrl).toBeTruthy();
    const me = await t.req('GET', '/me', { user: dis });
    expect(me.data.organization).toMatchObject({ name: 'Muebles Ortega', brandColor: '#1f6f5c', logoUrl: r.data.logoUrl });
    const log = await t.req('GET', '/audit?limit=5', { user: t.adminA });
    expect(log.data.items[0]).toMatchObject({ action: 'actualizar', entity: 'organization', userName: expect.any(String) });
    const off = await t.req('PATCH', '/organization', { user: t.adminA, body: { logoFileId: null } });
    expect(off.data.logoUrl).toBeNull();
  });

  it('un diseñador no cambia la organización ni ve la auditoría; valida el color', async () => {
    expect((await t.req('PATCH', '/organization', { user: dis, body: { name: 'X' } })).status).toBe(403);
    expect((await t.req('GET', '/audit', { user: dis })).status).toBe(403);
    expect((await t.req('PATCH', '/organization', { user: t.adminA, body: { brandColor: 'rojo' } })).status).toBe(400);
    expect((await t.req('GET', '/organization', { user: dis })).status).toBe(200);
  });

  it('la auditoría de otra organización no se mezcla', async () => {
    const b = await t.req('GET', '/audit?limit=100', { user: t.adminB });
    expect(b.data.items.every((x: any) => x.entityId !== t.orgA.id)).toBe(true);
  });
});
