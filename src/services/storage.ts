import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { hmac, randomToken, safeEqual } from '../lib/crypto';

export interface UploadGrant {
  /** 'blob': upload with @vercel/blob/client `put(pathname, file, { token })`. 'local': HTTP PUT the raw bytes to uploadUrl. */
  mode: 'blob' | 'local';
  pathname: string;
  token?: string;
  uploadUrl?: string;
  expiresAt: string;
}

export interface UploadConstraints {
  pathname: string;
  allowedContentTypes: string[];
  maximumSizeInBytes: number;
  validUntil: number;
}

export interface Storage {
  kind: 'blob' | 'local' | 'memory';
  put(pathname: string, data: Uint8Array, contentType: string): Promise<{ url: string }>;
  get(url: string): Promise<Uint8Array>;
  delete(url: string): Promise<void>;
  /** True if the URL points into this store (never register foreign URLs). */
  owns(url: string): boolean;
  /** Normalized path inside the store (`<orgId>/<kind>/<name>`), or null if the URL is not ours. */
  keyOf(url: string): string | null;
  createUploadGrant(c: UploadConstraints): Promise<UploadGrant>;
}

// ---------- Vercel Blob ----------
export function blobStorage(token: string): Storage {
  return {
    kind: 'blob',
    async put(pathname, data, contentType) {
      const { put } = await import('@vercel/blob');
      const res = await put(pathname, Buffer.from(data), { access: 'public', contentType, token, addRandomSuffix: true });
      return { url: res.url };
    },
    async get(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Blob GET ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },
    async delete(url) {
      const { del } = await import('@vercel/blob');
      await del(url, { token });
    },
    owns(url) {
      try {
        const u = new URL(url);
        return u.protocol === 'https:' && u.hostname.endsWith('.public.blob.vercel-storage.com');
      } catch {
        return false;
      }
    },
    keyOf(url) {
      if (!this.owns(url)) return null;
      const key = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, '');
      return key.split('/').some((seg) => seg === '..' || seg === '.' || seg === '') ? null : key;
    },
    async createUploadGrant(c) {
      const { generateClientTokenFromReadWriteToken } = await import('@vercel/blob/client');
      const clientToken = await generateClientTokenFromReadWriteToken({
        token,
        pathname: c.pathname,
        allowedContentTypes: c.allowedContentTypes,
        maximumSizeInBytes: c.maximumSizeInBytes,
        validUntil: c.validUntil,
        addRandomSuffix: true,
      });
      return { mode: 'blob', pathname: c.pathname, token: clientToken, expiresAt: new Date(c.validUntil).toISOString() };
    },
  };
}

// ---------- disk (Easypanel volume / local dev) and memory (tests) ----------
export interface DevStorage extends Storage {
  /** Checks signature, expiry, type and declared size before the body is read. */
  checkGrant(pathname: string, query: URLSearchParams, contentType: string, contentLength: number): string | null;
  /** Verifies a signed upload URL and stores the bytes. Used by PUT /api/v1/storage/*. */
  acceptUpload(pathname: string, query: URLSearchParams, data: Uint8Array, contentType: string): Promise<{ url: string } | { error: string }>;
  read(pathname: string): Promise<{ data: Uint8Array; contentType: string } | null>;
}

const DEV_PREFIX = '/api/v1/storage/';

function devStorage(kind: 'local' | 'memory', apiUrl: string, secret: string, dir?: string): DevStorage {
  const mem = new Map<string, { data: Uint8Array; contentType: string }>();
  const base = apiUrl.replace(/\/$/, '') + DEV_PREFIX;
  const safePath = (p: string) => {
    const n = normalize(p).replace(/\\/g, '/');
    if (n.startsWith('..') || n.startsWith('/') || n.includes('/../')) throw new Error('Ruta no válida');
    return n;
  };
  const pathOf = (url: string) => {
    if (!url.startsWith(base)) throw new Error('URL ajena al almacenamiento');
    return safePath(decodeURIComponent(url.slice(base.length).split('?')[0]!));
  };
  const write = async (pathname: string, data: Uint8Array, contentType: string) => {
    if (kind === 'memory') mem.set(pathname, { data, contentType });
    else {
      const f = join(dir!, pathname);
      await mkdir(dirname(f), { recursive: true });
      await writeFile(f, data);
      await writeFile(`${f}.type`, contentType);
    }
    return { url: base + pathname.split('/').map(encodeURIComponent).join('/') };
  };
  const read = async (pathname: string) => {
    if (kind === 'memory') return mem.get(pathname) ?? null;
    try {
      const f = join(dir!, pathname);
      return { data: new Uint8Array(await readFile(f)), contentType: await readFile(`${f}.type`, 'utf8') };
    } catch {
      return null;
    }
  };
  const withSuffix = (pathname: string) => {
    const dot = pathname.lastIndexOf('.');
    const suffix = randomToken(6);
    return dot > pathname.lastIndexOf('/') ? `${pathname.slice(0, dot)}-${suffix}${pathname.slice(dot)}` : `${pathname}-${suffix}`;
  };
  const sign = (p: string, max: number, types: string, exp: number) => hmac(secret, `${p}|${max}|${types}|${exp}`);

  return {
    kind,
    put: (pathname, data, contentType) => write(withSuffix(safePath(pathname)), data, contentType),
    async get(url) {
      const r = await read(pathOf(url));
      if (!r) throw new Error('Archivo no encontrado');
      return r.data;
    },
    async delete(url) {
      const p = pathOf(url);
      if (kind === 'memory') mem.delete(p);
      else {
        await rm(join(dir!, p), { force: true });
        await rm(join(dir!, `${p}.type`), { force: true });
      }
    },
    owns(url) {
      try {
        pathOf(url);
        return true;
      } catch {
        return false;
      }
    },
    keyOf(url) {
      try {
        return pathOf(url);
      } catch {
        return null;
      }
    },
    async createUploadGrant(c) {
      const pathname = withSuffix(safePath(c.pathname));
      const types = c.allowedContentTypes.join(',');
      const sig = sign(pathname, c.maximumSizeInBytes, types, c.validUntil);
      const q = new URLSearchParams({ max: String(c.maximumSizeInBytes), types, exp: String(c.validUntil), sig });
      return {
        mode: 'local',
        pathname,
        uploadUrl: `${base}${pathname.split('/').map(encodeURIComponent).join('/')}?${q}`,
        expiresAt: new Date(c.validUntil).toISOString(),
      };
    },
    checkGrant(pathname, query, contentType, contentLength) {
      let p: string;
      try {
        p = safePath(pathname);
      } catch {
        return 'Ruta no válida.';
      }
      const max = Number(query.get('max'));
      const types = query.get('types') ?? '';
      const exp = Number(query.get('exp'));
      const sig = query.get('sig') ?? '';
      if (!safeEqual(sig, sign(p, max, types, exp))) return 'Firma de subida no válida.';
      if (Date.now() > exp) return 'La autorización de subida caducó.';
      if (!Number.isFinite(contentLength) || contentLength > max) return 'El archivo supera el tamaño permitido.';
      if (!types.split(',').includes(contentType.split(';')[0]!.trim())) return 'Tipo de archivo no permitido.';
      return null;
    },
    async acceptUpload(pathname, query, data, contentType) {
      const err = this.checkGrant(pathname, query, contentType, data.byteLength);
      if (err) return { error: err };
      return write(safePath(pathname), data, contentType);
    },
    read,
  };
}

export const diskStorage = (apiUrl: string, secret: string, dir: string) => devStorage('local', apiUrl, secret, dir);
export const memoryStorage = (apiUrl: string, secret: string) => devStorage('memory', apiUrl, secret);

export const isDevStorage = (s: Storage): s is DevStorage => s.kind !== 'blob';
