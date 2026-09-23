import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AppEnv } from '../lib/context';
import { AppError } from '../lib/errors';
import { isDevStorage } from '../services/storage';

/**
 * Disk/memory storage endpoints (used when Vercel Blob is not configured, e.g. on Easypanel):
 * signed PUT uploads straight from the browser, and public GETs of stored files.
 */
export function storageFileRoutes() {
  const r = new Hono<AppEnv>();
  const hardCap = bodyLimit({
    maxSize: 100 * 1024 * 1024,
    onError: () => {
      throw new AppError(413, 'SUBIDA_RECHAZADA', 'El archivo supera el tamaño permitido.');
    },
  });
  r.put('/*', hardCap, async (c) => {
    const storage = c.var.deps.storage;
    if (!isDevStorage(storage)) throw new AppError(404, 'RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.');
    const pathname = decodeURIComponent(c.req.path.split('/storage/')[1] ?? '');
    const query = new URL(c.req.url).searchParams;
    const contentType = c.req.header('content-type') ?? 'application/octet-stream';
    const declared = Number(c.req.header('content-length'));
    // Reject before reading the body: bad signature, expired grant, wrong type or too large.
    const pre = storage.checkGrant(pathname, query, contentType, Number.isFinite(declared) ? declared : 0);
    if (pre) throw new AppError(pre.includes('tamaño') ? 413 : 400, 'SUBIDA_RECHAZADA', pre);
    const data = new Uint8Array(await c.req.arrayBuffer());
    const res = await storage.acceptUpload(pathname, query, data, contentType);
    if ('error' in res) throw new AppError(400, 'SUBIDA_RECHAZADA', res.error);
    return c.json({ url: res.url, pathname, size: data.byteLength }, 201);
  });
  r.get('/*', async (c) => {
    const storage = c.var.deps.storage;
    if (!isDevStorage(storage)) throw new AppError(404, 'RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.');
    const pathname = decodeURIComponent(c.req.path.split('/storage/')[1] ?? '');
    const f = await storage.read(pathname);
    if (!f) throw new AppError(404, 'NO_ENCONTRADO', 'El archivo no existe.');
    return c.body(f.data as Uint8Array<ArrayBuffer>, 200, { 'Content-Type': f.contentType, 'Cache-Control': 'public, max-age=31536000, immutable' });
  });
  return r;
}
