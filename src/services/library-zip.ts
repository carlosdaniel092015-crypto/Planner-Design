import { and, eq } from 'drizzle-orm';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { Db } from '../db/client';
import { files, materials, moduleDefinitions } from '../db/schema';
import { audit } from '../lib/audit';
import type { AuthContext } from '../lib/context';
import { unprocessable } from '../lib/errors';
import { createMaterial, createModule, MaterialInput, ModuleInput, updateMaterial, updateModule } from './catalog-admin';
import { type FileKind, saveBytes } from './files';
import type { Storage } from './storage';

export const LIBRARY_FORMAT = 'planner-library';
export type ExportItem = 'textures' | 'modules';

const MAP_KEYS = ['baseColor', 'normal', 'roughness', 'ao', 'metalness'] as const;
type MapKey = (typeof MAP_KEYS)[number];
const mapColumn = (k: MapKey) => `${k}FileId` as const;

interface ManifestFile {
  path: string;
  name: string;
  kind: FileKind;
}
interface TextureEntry {
  material: Record<string, unknown>;
  maps: Partial<Record<MapKey, ManifestFile>>;
}
interface ModuleEntry {
  module: Record<string, unknown>;
  model?: ManifestFile;
}
interface Manifest {
  format: typeof LIBRARY_FORMAT;
  version: 1;
  exportedAt: string;
  textures: TextureEntry[];
  modules: ModuleEntry[];
}

const MATERIAL_FIELDS = ['code', 'name', 'category', 'typeLabel', 'color', 'kind', 'uses', 'thumbnailUrl', 'sizeWcm', 'sizeHcm', 'grain', 'rotation', 'thickness', 'roughness', 'clearcoat', 'priceM2', 'priceCurrency', 'supplierCode', 'active', 'sort'] as const;
const MODULE_FIELDS = ['code', 'name', 'projectType', 'source', 'row', 'category', 'kind', 'minW', 'maxW', 'defW', 'fixedH', 'fixedD', 'recipe', 'footprint', 'anchor', 'materialSlots', 'unitPrice', 'priceCurrency', 'useInAutolayout', 'description', 'sort', 'active'] as const;

const pickFields = (row: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, row[k] ?? null]));

export async function exportLibrary(db: Db, storage: Storage, orgId: string, items: ExportItem[]): Promise<Uint8Array> {
  const zipFiles: Record<string, Uint8Array> = {};
  const fileCache = new Map<string, ManifestFile>();
  const addFile = async (id: string | null): Promise<ManifestFile | undefined> => {
    if (!id) return undefined;
    const hit = fileCache.get(id);
    if (hit) return hit;
    const [f] = await db.select().from(files).where(and(eq(files.id, id), eq(files.organizationId, orgId)));
    if (!f) return undefined;
    const path = `files/${f.id}/${f.name.replace(/[^\w.-]+/g, '-')}`;
    zipFiles[path] = await storage.get(f.blobUrl);
    const mf = { path, name: f.name, kind: f.kind };
    fileCache.set(id, mf);
    return mf;
  };

  const manifest: Manifest = { format: LIBRARY_FORMAT, version: 1, exportedAt: new Date().toISOString(), textures: [], modules: [] };
  if (items.includes('textures')) {
    const rows = await db.select().from(materials).where(and(eq(materials.organizationId, orgId), eq(materials.source, 'subido')));
    for (const m of rows) {
      const maps: TextureEntry['maps'] = {};
      for (const k of MAP_KEYS) {
        const mf = await addFile(m[mapColumn(k)]);
        if (mf) maps[k] = mf;
      }
      manifest.textures.push({ material: pickFields(m, MATERIAL_FIELDS), maps });
    }
  }
  if (items.includes('modules')) {
    const rows = await db.select().from(moduleDefinitions).where(eq(moduleDefinitions.organizationId, orgId));
    for (const m of rows) manifest.modules.push({ module: pickFields(m, MODULE_FIELDS), model: await addFile(m.modelFileId) });
  }
  zipFiles['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  return zipSync(zipFiles, { level: 6 });
}

export interface ImportReport {
  created: { type: 'textura' | 'modulo'; code: string }[];
  updated: { type: 'textura' | 'modulo'; code: string }[];
  errors: { type: 'textura' | 'modulo' | 'archivo'; code: string; message: string }[];
}

export async function importLibrary(db: Db, storage: Storage, a: AuthContext, zip: Uint8Array): Promise<ImportReport> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip);
  } catch {
    throw unprocessable('ZIP_INVALIDO', 'El archivo no es un ZIP válido.');
  }
  const raw = entries['manifest.json'];
  if (!raw) throw unprocessable('ZIP_SIN_MANIFIESTO', 'El ZIP no contiene manifest.json.');
  let manifest: Manifest;
  try {
    manifest = JSON.parse(strFromU8(raw));
  } catch {
    throw unprocessable('MANIFIESTO_INVALIDO', 'manifest.json no es JSON válido.');
  }
  if (manifest.format !== LIBRARY_FORMAT || manifest.version !== 1) throw unprocessable('MANIFIESTO_INVALIDO', `manifest.json debe tener format "${LIBRARY_FORMAT}" y version 1.`);

  const report: ImportReport = { created: [], updated: [], errors: [] };
  const uploaded = new Map<string, string>();
  const upload = async (mf: ManifestFile | undefined, kind: FileKind) => {
    if (!mf) return null;
    const hit = uploaded.get(mf.path);
    if (hit) return hit;
    const bytes = entries[mf.path];
    if (!bytes) throw new Error(`Falta el archivo ${mf.path} en el ZIP.`);
    const row = await saveBytes(db, storage, a, { kind, name: mf.name, bytes });
    uploaded.set(mf.path, row.id);
    return row.id;
  };
  const message = (e: unknown) => {
    const err = e as { message?: string; details?: unknown };
    return err.details ? `${err.message} ${JSON.stringify(err.details)}` : (err.message ?? 'Error desconocido');
  };

  for (const t of manifest.textures ?? []) {
    const code = String(t.material?.code ?? '?');
    try {
      const fileIds: Record<string, string | null> = {};
      for (const k of MAP_KEYS) if (t.maps?.[k]) fileIds[mapColumn(k)] = await upload(t.maps[k], 'textura');
      const baseThumb = fileIds.baseColorFileId ? (await db.select().from(files).where(eq(files.id, fileIds.baseColorFileId)))[0]?.variants.thumb : undefined;
      const { typeLabel, ...m } = t.material as Record<string, unknown>;
      const input = MaterialInput.parse({ ...m, type: typeLabel || m.category || 'Melamina', ...fileIds, thumbnailUrl: baseThumb ?? m.thumbnailUrl ?? null });
      if (a.user.role !== 'admin') delete (input as { priceM2?: number }).priceM2;
      await db.transaction(async (tx) => {
        const [cur] = await tx.select({ id: materials.id }).from(materials).where(and(eq(materials.organizationId, a.org.id), eq(materials.code, input.code)));
        if (cur) {
          await updateMaterial(tx, a, cur.id, input);
          report.updated.push({ type: 'textura', code });
        } else {
          await createMaterial(tx, a, input, 'subido');
          report.created.push({ type: 'textura', code });
        }
      });
    } catch (e) {
      report.errors.push({ type: 'textura', code, message: message(e) });
    }
  }

  for (const mEntry of manifest.modules ?? []) {
    const code = String(mEntry.module?.code ?? '?');
    try {
      const modelFileId = await upload(mEntry.model, 'modelo3d');
      const { row, ...m } = mEntry.module as Record<string, unknown>;
      const input = ModuleInput.parse({ ...m, type: row, modelFileId });
      if (a.user.role !== 'admin') delete (input as { unitPrice?: number }).unitPrice;
      await db.transaction(async (tx) => {
        const [cur] = await tx.select({ id: moduleDefinitions.id }).from(moduleDefinitions).where(and(eq(moduleDefinitions.organizationId, a.org.id), eq(moduleDefinitions.code, input.code)));
        if (cur) {
          await updateModule(tx, a, cur.id, input);
          report.updated.push({ type: 'modulo', code });
        } else {
          await createModule(tx, a, input);
          report.created.push({ type: 'modulo', code });
        }
      });
    } catch (e) {
      report.errors.push({ type: 'modulo', code, message: message(e) });
    }
  }

  await audit(db, a, 'importar', 'library', null, { created: report.created.length, updated: report.updated.length, errors: report.errors.length });
  return report;
}
