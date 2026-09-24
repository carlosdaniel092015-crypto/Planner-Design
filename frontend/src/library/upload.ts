// Direct upload: ask for a grant, send the bytes to storage (disk on Easypanel or Vercel Blob), then register the file.
import { ApiError } from '../api';

export type UploadKind = 'textura' | 'modelo3d' | 'otro' | 'render' | 'pdf' | 'miniatura';

export interface UploadedFile {
  id: string;
  url: string;
  name: string;
  variants: { thumb?: string; view2k?: string };
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/v1${path}`, { method, credentials: 'include', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json().catch(() => null) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? 'No se pudo subir el archivo.', data?.error?.details);
  return data as T;
}

const typeOf = (kind: UploadKind, blob: Blob, name: string) => {
  if (blob.type) return blob.type;
  const ext = name.toLowerCase().split('.').pop();
  if (kind === 'modelo3d') return ext === 'gltf' ? 'model/gltf+json' : 'model/gltf-binary';
  if (ext === 'zip') return 'application/zip';
  if (ext === 'json') return 'application/json';
  return 'application/octet-stream';
};

export async function uploadFile(kind: UploadKind, blob: Blob, name: string, projectId?: string | null): Promise<UploadedFile> {
  const contentType = typeOf(kind, blob, name);
  const grant = await call<{ mode: 'blob' | 'local'; pathname: string; token?: string; uploadUrl?: string }>('POST', '/files/upload-token', { kind, contentType, size: blob.size, name, projectId: projectId ?? null });
  let url: string;
  if (grant.mode === 'local') {
    const put = await fetch(grant.uploadUrl!, { method: 'PUT', credentials: 'include', headers: { 'content-type': contentType }, body: blob });
    if (!put.ok) {
      const e = await put.json().catch(() => null);
      throw new ApiError(put.status, e?.error?.code ?? 'SUBIDA_FALLIDA', e?.error?.message ?? 'No se pudo subir el archivo.');
    }
    url = ((await put.json()) as { url: string }).url;
  } else {
    const { put } = await import('@vercel/blob/client');
    url = (await put(grant.pathname, blob, { access: 'public', token: grant.token!, contentType })).url;
  }
  return call<UploadedFile>('POST', '/files', { kind, blobUrl: url, name, size: blob.size, projectId: projectId ?? null });
}

export const lib = {
  textures: () => call<{ items: LibTexture[] }>('GET', '/library/textures'),
  createTexture: (b: Record<string, unknown>) => call<LibTexture>('POST', '/library/textures', b),
  updateTexture: (id: string, b: Record<string, unknown>) => call<LibTexture>('PATCH', `/library/textures/${id}`, b),
  deleteTexture: (id: string) => call<void>('DELETE', `/library/textures/${id}`),
  modules: () => call<{ items: LibModule[] }>('GET', '/library/modules'),
  createModule: (b: Record<string, unknown>) => call<{ module: LibModule; model: unknown }>('POST', '/library/modules', b),
  updateModule: (id: string, b: Record<string, unknown>) => call<{ module: LibModule }>('PATCH', `/library/modules/${id}`, b),
  deleteModule: (id: string) => call<void>('DELETE', `/library/modules/${id}`),
  inspect: (fileId: string) => call<{ bbox: { w: number; h: number; d: number }; triangles: number; warnings: string[]; materials: string[] }>('POST', '/library/models/inspect', { fileId }),
  importZip: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/v1/library/import', { method: 'POST', credentials: 'include', body: form });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? 'No se pudo importar el ZIP.');
    return data as { created: { type: string; code: string }[]; updated: { type: string; code: string }[]; errors: { type: string; code: string; message: string }[] };
  },
};

export interface LibTexture {
  id: string;
  code: string;
  name: string;
  type: string;
  color: string;
  uses: string[];
  sizeWcm: number | null;
  finish?: string;
  maps: { baseColor: { url: string; thumb: string | null } | null };
  active: boolean;
}

export interface LibModule {
  id: string;
  code: string;
  name: string;
  source: 'parametrico' | 'modelo3d';
  type: 'base' | 'upper' | 'tall' | 'fridge' | 'hood';
  category: string;
  minW: number;
  maxW: number;
  defW: number;
  fixedH: number;
  fixedD: number;
  unitPrice: number;
  priceCurrency: 'USD' | 'DOP';
  thumbnailUrl: string | null;
  modelFileId: string | null;
  recipe: Record<string, unknown> | null;
  active: boolean;
}
