import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { files } from '../db/schema';
import type { AuthContext } from '../lib/context';
import { AppError, notFound, unprocessable } from '../lib/errors';
import { inspectModel, MIME, processImage, type Sniffed, sniff } from './media';
import { convertModel } from './model-import';
import type { Storage } from './storage';

export type FileKind = 'render' | 'pdf' | 'dxf' | 'csv' | 'textura' | 'modelo3d' | 'hdri' | 'miniatura' | 'otro';
export type FileRow = typeof files.$inferSelect;

const MB = 1024 * 1024;

/** Size limit, accepted declared content types and accepted real formats per kind. */
export const KIND_RULES: Record<FileKind, { maxBytes: number; types: string[]; formats: Sniffed[] }> = {
  textura: { maxBytes: 20 * MB, types: ['image/jpeg', 'image/png', 'image/webp'], formats: ['jpeg', 'png', 'webp'] },
  modelo3d: {
    maxBytes: 80 * MB,
    types: ['model/gltf-binary', 'model/gltf+json', 'application/vnd.sketchup.skp', 'application/x-3ds', 'image/x-3ds', 'application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
    formats: ['glb', 'gltf', 'skp', '3ds', 'zip'],
  },
  hdri: { maxBytes: 30 * MB, types: ['image/vnd.radiance', 'image/x-exr', 'application/octet-stream'], formats: ['hdr', 'exr'] },
  pdf: { maxBytes: 30 * MB, types: ['application/pdf'], formats: ['pdf'] },
  render: { maxBytes: 15 * MB, types: ['image/jpeg', 'image/png', 'image/webp'], formats: ['jpeg', 'png', 'webp'] },
  miniatura: { maxBytes: 5 * MB, types: ['image/jpeg', 'image/png', 'image/webp'], formats: ['jpeg', 'png', 'webp'] },
  dxf: { maxBytes: 20 * MB, types: ['application/dxf', 'image/vnd.dxf', 'text/plain', 'application/octet-stream'], formats: ['text'] },
  csv: { maxBytes: 10 * MB, types: ['text/csv', 'text/plain'], formats: ['text'] },
  otro: { maxBytes: 100 * MB, types: ['application/zip', 'application/x-zip-compressed', 'application/json', 'application/octet-stream'], formats: ['zip', 'text'] },
};

export function checkDeclared(kind: FileKind, contentType: string, size: number) {
  const rule = KIND_RULES[kind];
  if (size > rule.maxBytes) throw new AppError(413, 'ARCHIVO_DEMASIADO_GRANDE', `El archivo supera el máximo de ${rule.maxBytes / MB} MB para ${kind}.`);
  const ct = contentType.split(';')[0]!.trim().toLowerCase();
  if (!rule.types.includes(ct)) throw unprocessable('TIPO_NO_PERMITIDO', `Tipo de archivo no permitido para ${kind}. Tipos aceptados: ${rule.types.join(', ')}.`);
}

const safeName = (n: string) =>
  n
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(-80) || 'archivo';

export const pathFor = (orgId: string, kind: FileKind, name: string) => `${orgId}/${kind}/${randomUUID()}-${safeName(name)}`;

/** True if the URL is a file of this store inside the organization's folder (path resolved by the store, so `%2F..` can't escape it). */
export function urlBelongsToOrg(storage: Storage, url: string, orgId: string) {
  try {
    return storage.keyOf(url)?.startsWith(`${orgId}/`) ?? false;
  } catch {
    return false;
  }
}

/** Validates the real bytes of an uploaded file and stores its row (+ image variants). */
export async function registerFile(
  db: DbOrTx,
  storage: Storage,
  a: AuthContext,
  input: { projectId?: string | null; kind: FileKind; blobUrl: string; name: string },
): Promise<FileRow> {
  if (!urlBelongsToOrg(storage, input.blobUrl, a.org.id))
    throw unprocessable('URL_NO_PERMITIDA', 'La URL no corresponde a un archivo subido con un token de esta organización.');
  let bytes: Uint8Array;
  try {
    bytes = await storage.get(input.blobUrl);
  } catch {
    throw unprocessable('ARCHIVO_NO_ENCONTRADO', 'No se encontró el archivo subido; vuelve a subirlo.');
  }
  return storeFileRow(db, storage, a, { ...input, bytes, url: input.blobUrl });
}

/** Stores bytes the server already has (imports, generated files) and registers them. */
export async function saveBytes(db: DbOrTx, storage: Storage, a: AuthContext, input: { projectId?: string | null; kind: FileKind; name: string; bytes: Uint8Array }) {
  const format = sniff(input.bytes);
  const { url } = await storage.put(pathFor(a.org.id, input.kind, input.name), input.bytes, MIME[format]);
  return storeFileRow(db, storage, a, { ...input, url });
}

async function storeFileRow(
  db: DbOrTx,
  storage: Storage,
  a: AuthContext,
  input: { projectId?: string | null; kind: FileKind; name: string; bytes: Uint8Array; url: string },
): Promise<FileRow> {
  const rule = KIND_RULES[input.kind];
  const { bytes } = input;
  if (bytes.byteLength > rule.maxBytes) {
    await storage.delete(input.url).catch(() => {});
    throw new AppError(413, 'ARCHIVO_DEMASIADO_GRANDE', `El archivo supera el máximo de ${rule.maxBytes / MB} MB para ${input.kind}.`);
  }
  let format = sniff(bytes);
  if (!rule.formats.includes(format)) {
    await storage.delete(input.url).catch(() => {});
    throw unprocessable('CONTENIDO_INVALIDO', `El contenido del archivo no corresponde a ${input.kind} (se detectó: ${format === 'unknown' ? 'desconocido' : format}).`);
  }
  let width: number | null = null;
  let height: number | null = null;
  let url = input.url;
  let size = bytes.byteLength;
  const variants: FileRow['variants'] = { original: input.url };
  const meta: Record<string, unknown> = { format };
  if (input.kind === 'modelo3d' && (format === 'skp' || format === '3ds' || format === 'zip')) {
    // SketchUp / 3ds Max → embedded GLB; the row points at the GLB and keeps the original upload in variants.original.
    let converted: Awaited<ReturnType<typeof convertModel>>;
    try {
      converted = await convertModel(bytes, input.name);
      if (converted) await inspectModel(converted.glb);
    } catch (e) {
      await storage.delete(input.url).catch(() => {});
      throw e;
    }
    if (converted) {
      const base = input.name.replace(/\.[^.]+$/, '');
      url = (await storage.put(pathFor(a.org.id, 'modelo3d', `${base}.glb`), converted.glb, MIME.glb)).url;
      format = 'glb';
      size = converted.glb.byteLength;
      Object.assign(meta, { format, source: converted.source, sourceName: converted.sourceName, warnings: converted.warnings });
    }
  }
  if (format === 'jpeg' || format === 'png' || format === 'webp') {
    const img = await processImage(bytes);
    width = img.width;
    height = img.height;
    meta.color = img.color;
    const base = input.name.replace(/\.[^.]+$/, '');
    variants.thumb = (await storage.put(pathFor(a.org.id, 'miniatura', `${base}-256.webp`), img.thumb, 'image/webp')).url;
    if (input.kind === 'textura' || input.kind === 'render') variants.view2k = (await storage.put(pathFor(a.org.id, input.kind, `${base}-2k.webp`), img.view2k, 'image/webp')).url;
  }
  const [row] = await db
    .insert(files)
    .values({
      organizationId: a.org.id,
      projectId: input.projectId ?? null,
      kind: input.kind,
      variants,
      width,
      height,
      name: input.name.slice(0, 200),
      blobUrl: url,
      contentType: MIME[format],
      size,
      meta,
      createdBy: a.user.id,
    })
    .returning();
  return row!;
}

export async function getFile(db: DbOrTx, orgId: string, id: string) {
  const [f] = await db.select().from(files).where(and(eq(files.id, id), eq(files.organizationId, orgId))).limit(1);
  if (!f) throw notFound('El archivo');
  return f;
}

export const fileJson = (f: FileRow) => ({
  id: f.id,
  projectId: f.projectId,
  kind: f.kind,
  name: f.name,
  url: f.blobUrl,
  variants: f.variants,
  width: f.width,
  height: f.height,
  contentType: f.contentType,
  size: f.size,
  meta: f.meta,
  createdBy: f.createdBy,
  createdAt: f.createdAt.toISOString(),
});
