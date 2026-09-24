import { Document, NodeIO } from '@gltf-transform/core';
import { unzipSync } from 'fflate';
import { unprocessable } from '../lib/errors';
import { sniff } from './media';

/**
 * Converts the 3D formats designers actually have (SketchUp .skp, 3ds Max .3ds) into an embedded GLB,
 * so the rest of the pipeline (inspection, Draco, the three.js viewer) only ever sees glTF.
 * A .3ds references its textures by file name, so it can also arrive as a ZIP with the images next to it.
 */
export type ModelSource = 'skp' | '3ds';
export interface ConvertedModel {
  glb: Uint8Array;
  source: ModelSource;
  sourceName: string;
  warnings: string[];
}

const MB = 1024 * 1024;
const MAX_UNZIPPED = 300 * MB;

const baseName = (p: string) => p.replace(/\\/g, '/').split('/').pop()!.toLowerCase();

/** Returns null when the bytes are already glTF/GLB. */
export async function convertModel(bytes: Uint8Array, name: string): Promise<ConvertedModel | null> {
  const kind = sniff(bytes);
  if (kind === 'glb' || kind === 'gltf') return null;
  if (kind === 'skp') return { ...(await fromSkp(bytes)), source: 'skp', sourceName: name };
  if (kind === '3ds') return { ...(await from3ds(bytes, new Map())), source: '3ds', sourceName: name };
  if (kind === 'zip') return fromZip(bytes);
  throw unprocessable('MODELO_INVALIDO', 'Formato de modelo no reconocido. Se aceptan SketchUp (.skp), 3ds Max (.3ds), GLB/glTF o un ZIP con el .3ds y sus texturas.');
}

async function fromZip(bytes: Uint8Array): Promise<ConvertedModel> {
  let total = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize;
        if (total > MAX_UNZIPPED) throw unprocessable('ZIP_DEMASIADO_GRANDE', 'El ZIP descomprimido supera 300 MB.');
        return !f.name.endsWith('/') && !/(^|\/)(__MACOSX|\.)/.test(f.name);
      },
    });
  } catch (e) {
    if ((e as { status?: number }).status === 422) throw e;
    throw unprocessable('ZIP_INVALIDO', 'No se pudo abrir el ZIP.');
  }
  const models = Object.entries(entries).filter(([, b]) => {
    const k = sniff(b);
    return k === 'skp' || k === '3ds' || k === 'glb';
  });
  if (models.length !== 1)
    throw unprocessable('MODELO_INVALIDO', models.length ? 'El ZIP trae más de un modelo; sube uno a la vez.' : 'El ZIP no contiene ningún archivo .skp, .3ds o .glb.');
  const [path, model] = models[0]!;
  const kind = sniff(model);
  if (kind === 'glb') throw unprocessable('MODELO_INVALIDO', 'Los GLB se suben directamente, sin ZIP.');
  if (kind === 'skp') return { ...(await fromSkp(model)), source: 'skp', sourceName: baseName(path) };
  const images = new Map<string, Uint8Array>();
  for (const [p, b] of Object.entries(entries)) if (p !== path) images.set(baseName(p), b);
  return { ...(await from3ds(model, images)), source: '3ds', sourceName: baseName(path) };
}

// ---------- SketchUp ----------
async function fromSkp(bytes: Uint8Array): Promise<{ glb: Uint8Array; warnings: string[] }> {
  const { buildInstancedScene, parseSkp, toInstancedGLB } = await import('openskp');
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  let glb: Uint8Array;
  let names: { name: string; rgb: [number, number, number] }[];
  try {
    const scene = buildInstancedScene(buf, { respectEdgeVisibility: true });
    if (!scene.bounds) throw unprocessable('MODELO_INVALIDO', 'El archivo de SketchUp no tiene geometría visible.');
    glb = toInstancedGLB(scene, { textures: true });
    names = parseSkp(buf).materials.map((m) => ({ name: m.name, rgb: [m.color.r, m.color.g, m.color.b] }));
  } catch (e) {
    if ((e as { status?: number }).status === 422) throw e;
    throw unprocessable(
      'MODELO_INVALIDO',
      `No se pudo leer el archivo de SketchUp (${(e as Error).message}). En SketchUp usa Archivo → Exportar → Modelo 3D como COLLADA (.dae) o 3DS (.3ds) y súbelo.`,
    );
  }
  // openskp's GLB has unnamed materials; name them after the SketchUp material with the same colour
  // so they can be mapped to the planner's material slots.
  const io = new NodeIO();
  const doc = await io.readBinary(glb);
  doc
    .getRoot()
    .listMaterials()
    .forEach((m, i) => {
      if (m.getName()) return;
      const c = m.getBaseColorFactor().map((v) => Math.round(v * 255));
      m.setName(names.find((n) => n.rgb.every((v, k) => Math.abs(v - c[k]!) <= 1))?.name || `material_${i + 1}`);
    });
  return { glb: await io.writeBinary(doc), warnings: [] };
}

// ---------- 3ds Max (.3ds) ----------
interface Mat3ds {
  name: string;
  diffuse: [number, number, number];
  shininess: number;
  transparency: number;
  map?: { file: string; uScale: number; vScale: number; uOff: number; vOff: number };
}
interface Mesh3ds {
  name: string;
  verts: Float32Array;
  uvs: Float32Array | null;
  faces: Uint16Array;
  smooth: Uint32Array | null;
  groups: { mat: string; faces: Uint16Array }[];
}

class Reader {
  dv: DataView;
  constructor(
    public b: Uint8Array,
    public p = 0,
  ) {
    this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  u8() {
    return this.dv.getUint8(this.p++);
  }
  u16() {
    const v = this.dv.getUint16(this.p, true);
    this.p += 2;
    return v;
  }
  u32() {
    const v = this.dv.getUint32(this.p, true);
    this.p += 4;
    return v;
  }
  f32() {
    const v = this.dv.getFloat32(this.p, true);
    this.p += 4;
    return v;
  }
  str() {
    const s = this.p;
    while (this.p < this.b.length && this.b[this.p] !== 0) this.p++;
    const out = new TextDecoder('latin1').decode(this.b.subarray(s, this.p));
    this.p++;
    return out;
  }
  /** Iterates the sub-chunks between the current position and `end`. */
  *chunks(end: number): Generator<{ id: number; end: number }> {
    while (this.p + 6 <= end) {
      const start = this.p;
      const id = this.u16();
      const len = this.u32();
      if (len < 6 || start + len > end) throw new Error(`bloque 0x${id.toString(16)} con longitud inválida`);
      yield { id, end: start + len };
      this.p = start + len;
    }
  }
}

function readColor(r: Reader, end: number): [number, number, number] | null {
  let out: [number, number, number] | null = null;
  for (const c of r.chunks(end)) {
    if (c.id === 0x0010 || c.id === 0x0013) out = [r.f32(), r.f32(), r.f32()];
    else if ((c.id === 0x0011 || c.id === 0x0012) && !out) out = [r.u8() / 255, r.u8() / 255, r.u8() / 255];
  }
  return out;
}
function readPercent(r: Reader, end: number): number {
  let v = 0;
  for (const c of r.chunks(end)) {
    if (c.id === 0x0030) v = r.u16() / 100;
    else if (c.id === 0x0031) v = r.f32() / 100;
  }
  return Math.max(0, Math.min(1, v));
}

function parse3ds(bytes: Uint8Array) {
  const r = new Reader(bytes);
  const mats: Mat3ds[] = [];
  const meshes: Mesh3ds[] = [];
  const main = r.chunks(bytes.length).next().value;
  if (main?.id !== 0x4d4d) throw new Error('falta el bloque principal');
  for (const ed of r.chunks(main.end)) {
    if (ed.id !== 0x3d3d) continue;
    for (const c of r.chunks(ed.end)) {
      if (c.id === 0xafff) {
        const m: Mat3ds = { name: `material_${mats.length + 1}`, diffuse: [0.8, 0.8, 0.8], shininess: 0, transparency: 0 };
        for (const s of r.chunks(c.end)) {
          if (s.id === 0xa000) m.name = r.str();
          else if (s.id === 0xa020) m.diffuse = readColor(r, s.end) ?? m.diffuse;
          else if (s.id === 0xa040) m.shininess = readPercent(r, s.end);
          else if (s.id === 0xa050) m.transparency = readPercent(r, s.end);
          else if (s.id === 0xa200) {
            const map = { file: '', uScale: 1, vScale: 1, uOff: 0, vOff: 0 };
            for (const t of r.chunks(s.end)) {
              if (t.id === 0xa300) map.file = r.str();
              else if (t.id === 0xa354) map.uScale = r.f32() || 1;
              else if (t.id === 0xa356) map.vScale = r.f32() || 1;
              else if (t.id === 0xa358) map.uOff = r.f32();
              else if (t.id === 0xa35a) map.vOff = r.f32();
            }
            if (map.file) m.map = map;
          }
        }
        mats.push(m);
      } else if (c.id === 0x4000) {
        const name = r.str();
        for (const s of r.chunks(c.end)) {
          if (s.id !== 0x4100) continue;
          const mesh: Mesh3ds = { name, verts: new Float32Array(), uvs: null, faces: new Uint16Array(), smooth: null, groups: [] };
          for (const t of r.chunks(s.end)) {
            if (t.id === 0x4110) {
              const n = r.u16();
              mesh.verts = new Float32Array(n * 3);
              for (let i = 0; i < n * 3; i++) mesh.verts[i] = r.f32();
            } else if (t.id === 0x4140) {
              const n = r.u16();
              mesh.uvs = new Float32Array(n * 2);
              for (let i = 0; i < n * 2; i++) mesh.uvs[i] = r.f32();
            } else if (t.id === 0x4120) {
              const n = r.u16();
              mesh.faces = new Uint16Array(n * 3);
              for (let i = 0; i < n; i++) {
                mesh.faces[i * 3] = r.u16();
                mesh.faces[i * 3 + 1] = r.u16();
                mesh.faces[i * 3 + 2] = r.u16();
                r.u16(); // edge flags
              }
              for (const f of r.chunks(t.end)) {
                if (f.id === 0x4130) {
                  const mat = r.str();
                  const k = r.u16();
                  const list = new Uint16Array(k);
                  for (let i = 0; i < k; i++) list[i] = r.u16();
                  mesh.groups.push({ mat, faces: list });
                } else if (f.id === 0x4150) {
                  mesh.smooth = new Uint32Array(n);
                  for (let i = 0; i < n; i++) mesh.smooth[i] = r.u32();
                }
              }
            }
          }
          if (mesh.faces.length && mesh.verts.length) meshes.push(mesh);
        }
      }
    }
  }
  return { mats, meshes };
}

async function from3ds(bytes: Uint8Array, images: Map<string, Uint8Array>): Promise<{ glb: Uint8Array; warnings: string[] }> {
  let parsed: ReturnType<typeof parse3ds>;
  try {
    parsed = parse3ds(bytes);
  } catch (e) {
    throw unprocessable('MODELO_INVALIDO', `No se pudo leer el archivo .3ds: ${(e as Error).message}`);
  }
  const { mats, meshes } = parsed;
  if (!meshes.length) throw unprocessable('MODELO_INVALIDO', 'El archivo .3ds no tiene mallas.');
  const warnings: string[] = [];

  // Units: .3ds carries none that exporters fill reliably. Guess from the size of a piece of furniture.
  let max = 0;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes)
    for (let i = 0; i < m.verts.length; i++) {
      const a = i % 3;
      lo[a] = Math.min(lo[a]!, m.verts[i]!);
      hi[a] = Math.max(hi[a]!, m.verts[i]!);
    }
  for (let a = 0; a < 3; a++) max = Math.max(max, hi[a]! - lo[a]!);
  const [k, unit] = max <= 20 ? [1, 'metros'] : max <= 600 ? [0.01, 'centímetros'] : [0.001, 'milímetros'];
  if (k !== 1) warnings.push(`El .3ds parece estar en ${unit}; se convirtió a metros (revisa las medidas del módulo).`);

  const doc = new Document();
  const buffer = doc.createBuffer();
  const matByName = new Map<string, ReturnType<Document['createMaterial']>>();
  const texByFile = new Map<string, ReturnType<Document['createTexture']> | null>();
  const matFor = (name: string) => {
    const found = matByName.get(name);
    if (found) return found;
    const src = mats.find((m) => m.name === name);
    const m = doc.createMaterial(name || 'material');
    const alpha = 1 - (src?.transparency ?? 0);
    m.setBaseColorFactor([...(src?.diffuse ?? [0.8, 0.8, 0.8]), alpha])
      .setRoughnessFactor(Math.max(0.08, 1 - (src?.shininess ?? 0) * 0.9))
      .setMetallicFactor(0);
    if (alpha < 0.99) m.setAlphaMode('BLEND');
    if (src?.map) {
      const file = baseName(src.map.file);
      if (!texByFile.has(file)) {
        const img = images.get(file);
        const kind = img && sniff(img);
        if (kind === 'png' || kind === 'jpeg') texByFile.set(file, doc.createTexture(file).setImage(img!).setMimeType(`image/${kind}`).setURI(file));
        else {
          texByFile.set(file, null);
          warnings.push(
            img ? `La textura "${file}" no es PNG ni JPG; se usó el color del material.` : `Falta la textura "${file}"; sube un ZIP con el .3ds y sus imágenes para verla.`,
          );
        }
      }
      const tex = texByFile.get(file);
      if (tex) m.setBaseColorTexture(tex).setBaseColorFactor([1, 1, 1, alpha]);
    }
    matByName.set(name, m);
    return m;
  };

  const scene = doc.createScene('escena');
  for (const mesh of meshes) {
    const nFaces = mesh.faces.length / 3;
    const faceMat = new Array<string>(nFaces).fill('');
    for (const g of mesh.groups) for (const f of g.faces) if (f < nFaces) faceMat[f] = g.mat;
    // Face normals (in the source's Z-up frame).
    const fn = new Float32Array(nFaces * 3);
    const nv = mesh.verts.length / 3;
    const v = (i: number, a: number) => mesh.verts[Math.min(i, nv - 1) * 3 + a]!;
    for (let f = 0; f < nFaces; f++) {
      const [a, b, c] = [mesh.faces[f * 3]!, mesh.faces[f * 3 + 1]!, mesh.faces[f * 3 + 2]!];
      const e1 = [v(b, 0) - v(a, 0), v(b, 1) - v(a, 1), v(b, 2) - v(a, 2)];
      const e2 = [v(c, 0) - v(a, 0), v(c, 1) - v(a, 1), v(c, 2) - v(a, 2)];
      const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
      const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
      fn.set([n[0]! / l, n[1]! / l, n[2]! / l], f * 3);
    }
    // Smoothing groups: a corner averages the normals of the faces around its vertex that share a group bit.
    const around: number[][] = Array.from({ length: nv }, () => []);
    for (let f = 0; f < nFaces; f++) for (let j = 0; j < 3; j++) around[mesh.faces[f * 3 + j]!]?.push(f);

    const node = doc.createNode(mesh.name || 'objeto');
    const gmesh = doc.createMesh(mesh.name || 'objeto');
    for (const matName of [...new Set(faceMat)]) {
      const fs = [...faceMat.keys()].filter((f) => faceMat[f] === matName);
      const pos = new Float32Array(fs.length * 9);
      const nor = new Float32Array(fs.length * 9);
      const uv = mesh.uvs ? new Float32Array(fs.length * 6) : null;
      const map = mats.find((m) => m.name === matName)?.map;
      fs.forEach((f, t) => {
        for (let j = 0; j < 3; j++) {
          const vi = Math.min(mesh.faces[f * 3 + j]!, nv - 1);
          const o = (t * 3 + j) * 3;
          // Z-up → glTF Y-up: (x, y, z) → (x, z, -y)
          pos[o] = (v(vi, 0) - lo[0]!) * k;
          pos[o + 1] = (v(vi, 2) - lo[2]!) * k;
          pos[o + 2] = -(v(vi, 1) - lo[1]!) * k;
          let n = [fn[f * 3]!, fn[f * 3 + 1]!, fn[f * 3 + 2]!];
          const sg = mesh.smooth?.[f] ?? 0;
          if (sg) {
            n = [0, 0, 0];
            for (const g of around[vi] ?? [])
              if ((mesh.smooth![g]! & sg) !== 0) for (let a = 0; a < 3; a++) n[a]! += fn[g * 3 + a]!;
            const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
            n = n.map((x) => x / l);
          }
          nor.set([n[0]!, n[2]!, -n[1]!], o);
          if (uv && mesh.uvs) {
            const u = mesh.uvs[vi * 2] ?? 0;
            const w = mesh.uvs[vi * 2 + 1] ?? 0;
            uv[(t * 3 + j) * 2] = u * (map?.uScale ?? 1) + (map?.uOff ?? 0);
            uv[(t * 3 + j) * 2 + 1] = 1 - (w * (map?.vScale ?? 1) + (map?.vOff ?? 0));
          }
        }
      });
      const prim = doc
        .createPrimitive()
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer))
        .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(nor).setBuffer(buffer))
        .setMaterial(matFor(matName));
      if (uv) prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uv).setBuffer(buffer));
      gmesh.addPrimitive(prim);
    }
    scene.addChild(node.setMesh(gmesh));
  }
  const { weld } = await import('@gltf-transform/functions');
  await doc.transform(weld());
  return { glb: await new NodeIO().writeBinary(doc), warnings };
}
