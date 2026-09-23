import { getBounds, type Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { unprocessable } from '../lib/errors';

// ---------- content sniffing (real bytes, not the extension) ----------
export type Sniffed = 'jpeg' | 'png' | 'webp' | 'glb' | 'gltf' | 'pdf' | 'zip' | 'hdr' | 'exr' | 'text' | 'unknown';

export function sniff(b: Uint8Array): Sniffed {
  const s = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && s(1, 3) === 'PNG') return 'png';
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP') return 'webp';
  if (s(0, 4) === 'glTF') return 'glb';
  if (s(0, 5) === '%PDF-') return 'pdf';
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 'zip';
  if (s(0, 2) === '#?') return 'hdr';
  if (b[0] === 0x76 && b[1] === 0x2f && b[2] === 0x31 && b[3] === 0x01) return 'exr';
  const head = s(0, Math.min(64, b.length)).trimStart();
  if (head.startsWith('{') && /"asset"/.test(new TextDecoder().decode(b.subarray(0, Math.min(b.length, 4096))))) return 'gltf';
  if (b.length && [...b.subarray(0, Math.min(512, b.length))].every((c) => c === 9 || c === 10 || c === 13 || (c >= 32 && c !== 127) || c >= 128)) return 'text';
  return 'unknown';
}

export const MIME: Record<Sniffed, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  pdf: 'application/pdf',
  zip: 'application/zip',
  hdr: 'image/vnd.radiance',
  exr: 'image/x-exr',
  text: 'text/plain',
  unknown: 'application/octet-stream',
};

// ---------- images ----------
export interface ImageVariants {
  width: number;
  height: number;
  format: string;
  thumb: Uint8Array;
  view2k: Uint8Array;
  /** Average colour, #rrggbb (the prototype derives the material swatch colour this way). */
  color: string;
}

export async function processImage(bytes: Uint8Array): Promise<ImageVariants> {
  const kind = sniff(bytes);
  if (kind !== 'jpeg' && kind !== 'png' && kind !== 'webp') throw unprocessable('IMAGEN_INVALIDA', 'El archivo no es una imagen JPG, PNG o WebP válida.');
  const sharp = (await import('sharp')).default;
  let meta: import('sharp').Metadata;
  try {
    meta = await sharp(bytes).metadata();
  } catch {
    throw unprocessable('IMAGEN_INVALIDA', 'No se pudo leer la imagen; puede estar dañada.');
  }
  if (!meta.width || !meta.height) throw unprocessable('IMAGEN_INVALIDA', 'La imagen no tiene dimensiones válidas.');
  if (meta.width * meta.height > 100_000_000) throw unprocessable('IMAGEN_DEMASIADO_GRANDE', 'La imagen supera los 100 megapíxeles.');
  const base = () => sharp(bytes, { limitInputPixels: 100_000_000 }).rotate();
  const [thumb, view2k, stats] = await Promise.all([
    base().resize(256, 256, { fit: 'cover' }).webp({ quality: 82 }).toBuffer(),
    base().resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer(),
    base().resize(16, 16, { fit: 'fill' }).stats(),
  ]);
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  const [r, g, b] = stats.channels;
  return {
    width: meta.width,
    height: meta.height,
    format: kind,
    thumb: new Uint8Array(thumb),
    view2k: new Uint8Array(view2k),
    color: `#${hex(r?.mean ?? 176)}${hex(g?.mean ?? 168)}${hex(b?.mean ?? 152)}`,
  };
}

// ---------- 3D models ----------
export interface ModelInspection {
  format: 'glb' | 'gltf';
  /** Bounding box size in cm (glTF metres ×100; files authored in mm are detected like the prototype does). */
  bbox: { w: number; h: number; d: number };
  unitsGuess: 'm' | 'mm';
  materials: string[];
  triangles: number;
  textures: { name: string; width: number | null; height: number | null; mimeType: string }[];
  warnings: string[];
}

let ioPromise: Promise<NodeIO> | null = null;
async function io() {
  ioPromise ??= (async () => {
    const draco3d = (await import('draco3dgltf')).default;
    return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
    });
  })();
  return ioPromise;
}

/** Rejects any buffer/image that is not embedded (external files or remote URLs). */
function assertNoExternal(json: { buffers?: { uri?: string }[]; images?: { uri?: string }[] }) {
  const refs = [...(json.buffers ?? []), ...(json.images ?? [])].map((x) => x.uri).filter((u): u is string => !!u && !u.startsWith('data:'));
  if (refs.length)
    throw unprocessable('MODELO_CON_RECURSOS_EXTERNOS', `El modelo hace referencia a archivos externos (${refs.slice(0, 3).join(', ')}). Exporta un GLB con todo incrustado.`);
}

function glbJson(bytes: Uint8Array) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) throw unprocessable('MODELO_INVALIDO', 'El archivo no es un GLB válido.');
  if (dv.getUint32(4, true) !== 2) throw unprocessable('MODELO_INVALIDO', 'Solo se admite glTF 2.0.');
  const len = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== 0x4e4f534a || 20 + len > bytes.byteLength) throw unprocessable('MODELO_INVALIDO', 'El GLB está dañado (falta el bloque JSON).');
  try {
    return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len)));
  } catch {
    throw unprocessable('MODELO_INVALIDO', 'El GLB está dañado (JSON ilegible).');
  }
}

export async function readModel(bytes: Uint8Array): Promise<{ doc: Document; format: 'glb' | 'gltf' }> {
  const kind = sniff(bytes);
  if (kind !== 'glb' && kind !== 'gltf') throw unprocessable('MODELO_INVALIDO', 'El archivo no es un modelo GLB o glTF válido.');
  const nio = await io();
  try {
    if (kind === 'glb') {
      assertNoExternal(glbJson(bytes));
      return { doc: await nio.readBinary(bytes), format: 'glb' };
    }
    const json = JSON.parse(new TextDecoder().decode(bytes));
    assertNoExternal(json);
    return { doc: await nio.readJSON({ json, resources: {} }), format: 'gltf' };
  } catch (e) {
    if ((e as { status?: number }).status === 422) throw e;
    throw unprocessable('MODELO_INVALIDO', `No se pudo leer el modelo: ${(e as Error).message}`);
  }
}

export async function inspectModel(bytes: Uint8Array): Promise<ModelInspection> {
  const { doc, format } = await readModel(bytes);
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) throw unprocessable('MODELO_INVALIDO', 'El modelo no tiene escenas.');
  const { min, max } = getBounds(scene);
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  if (!size.every((v) => Number.isFinite(v) && v > 0)) throw unprocessable('MODELO_INVALIDO', 'El modelo no tiene geometría medible.');
  const mm = Math.max(...size) > 20;
  const k = mm ? 0.1 : 100;
  let triangles = 0;
  for (const mesh of root.listMeshes())
    for (const p of mesh.listPrimitives()) {
      const mode = p.getMode();
      if (mode !== 4 && mode !== 5 && mode !== 6) continue;
      const n = p.getIndices()?.getCount() ?? p.getAttribute('POSITION')?.getCount() ?? 0;
      triangles += mode === 4 ? Math.floor(n / 3) : Math.max(0, n - 2);
    }
  const textures = root.listTextures().map((tx) => {
    const s = tx.getSize();
    return { name: tx.getName() || tx.getURI() || 'textura', width: s?.[0] ?? null, height: s?.[1] ?? null, mimeType: tx.getMimeType() };
  });
  const warnings: string[] = [];
  if (triangles > 300_000) warnings.push(`El modelo tiene ${triangles.toLocaleString('es-MX')} triángulos (recomendado ≤ 300 000).`);
  for (const tx of textures)
    if ((tx.width ?? 0) > 4096 || (tx.height ?? 0) > 4096) warnings.push(`La textura "${tx.name}" mide ${tx.width}×${tx.height} (recomendado ≤ 4096 px).`);
  if (mm) warnings.push('El modelo parece estar en milímetros; se convirtió a centímetros.');
  return {
    format,
    bbox: { w: Math.round(size[0]! * k * 10) / 10, h: Math.round(size[1]! * k * 10) / 10, d: Math.round(size[2]! * k * 10) / 10 },
    unitsGuess: mm ? 'mm' : 'm',
    materials: root.listMaterials().map((m, i) => m.getName() || `material_${i + 1}`),
    triangles,
    textures,
    warnings,
  };
}

/** Optional Draco mesh compression; returns a GLB. */
export async function compressDraco(bytes: Uint8Array): Promise<Uint8Array> {
  const { doc } = await readModel(bytes);
  const { draco } = await import('@gltf-transform/functions');
  await doc.transform(draco());
  return (await io()).writeBinary(doc);
}
