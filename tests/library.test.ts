import { Document, NodeIO } from '@gltf-transform/core';
import { create } from 'openskp';
import { strToU8, zipSync } from 'fflate';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { DEFAULT_KITCHEN, type ModuleInstance, parts, templateOf } from '../src/core';
import { moduleDefinitions } from '../src/db/schema';
import { API, setup, type Ctx, type TestUser } from './helpers';

let t: Ctx;
let dis: TestUser;
beforeAll(async () => {
  t = await setup();
  dis = await t.makeUser(t.orgA.id, 'disenador', 'dis-lib@a.test');
});
afterAll(() => t.close());

async function upload(user: TestUser, kind: string, name: string, bytes: Uint8Array, contentType: string, projectId?: string) {
  const tok = await t.req('POST', '/files/upload-token', { user, body: { kind, contentType, size: bytes.byteLength, name, projectId } });
  expect(tok.status, JSON.stringify(tok.data)).toBe(200);
  expect(tok.data.mode).toBe('local');
  const put = await t.app.request(tok.data.uploadUrl.replace(API, ''), { method: 'PUT', headers: { 'content-type': contentType }, body: bytes });
  expect(put.status).toBe(201);
  const { url } = (await put.json()) as { url: string };
  return t.req('POST', '/files', { user, body: { kind, blobUrl: url, name, projectId } });
}

/** Minimal .3ds: one 60 × 60 × 76 cm box (Z-up, centimetres) with a textured material. */
function tds(texture?: string) {
  const chunk = (id: number, ...parts: Uint8Array[]) => {
    const len = 6 + parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(len);
    const dv = new DataView(out.buffer);
    dv.setUint16(0, id, true);
    dv.setUint32(2, len, true);
    let o = 6;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  };
  const cstr = (s: string) => new Uint8Array([...new TextEncoder().encode(s), 0]);
  const nums = (kind: 'u16' | 'u32' | 'f32', xs: number[]) => {
    const size = kind === 'u16' ? 2 : 4;
    const out = new Uint8Array(xs.length * size);
    const dv = new DataView(out.buffer);
    xs.forEach((x, i) => {
      if (kind === 'u16') dv.setUint16(i * 2, x, true);
      else if (kind === 'u32') dv.setUint32(i * 4, x, true);
      else dv.setFloat32(i * 4, x, true);
    });
    return out;
  };
  const [x, y, z] = [60, 60, 76];
  const v = [0, 0, 0, x, 0, 0, x, y, 0, 0, y, 0, 0, 0, z, x, 0, z, x, y, z, 0, y, z];
  const tris = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5];
  const faces: number[] = [];
  for (let i = 0; i < tris.length; i += 3) faces.push(tris[i]!, tris[i + 1]!, tris[i + 2]!, 0);
  const mat = chunk(
    0xafff,
    chunk(0xa000, cstr('Frente')),
    chunk(0xa020, chunk(0x0011, new Uint8Array([200, 30, 20]))),
    ...(texture ? [chunk(0xa200, chunk(0xa300, cstr(texture)))] : []),
  );
  const mesh = chunk(
    0x4100,
    chunk(0x4110, nums('u16', [8]), nums('f32', v)),
    chunk(0x4140, nums('u16', [8]), nums('f32', [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1])),
    chunk(0x4120, nums('u16', [12]), nums('u16', faces), chunk(0x4130, cstr('Frente'), nums('u16', [12, ...Array.from({ length: 12 }, (_, i) => i)]))),
  );
  return chunk(0x4d4d, chunk(0x0002, nums('u32', [3])), chunk(0x3d3d, mat, chunk(0x4000, cstr('caja'), mesh)));
}

/** SketchUp file (inches, Z-up) with a 60 × 60 × 76 cm box painted "Frente". */
function skp() {
  const b = create();
  const red = b.addMaterial('Frente', [200, 30, 20]);
  const [x, y, z] = [60 / 2.54, 60 / 2.54, 76 / 2.54];
  const f = (pts: number[][]) => b.addFace(pts as never, { material: red });
  f([[0, 0, 0], [0, y, 0], [x, y, 0], [x, 0, 0]]);
  f([[0, 0, z], [x, 0, z], [x, y, z], [0, y, z]]);
  f([[0, 0, 0], [x, 0, 0], [x, 0, z], [0, 0, z]]);
  f([[0, y, 0], [0, y, z], [x, y, z], [x, y, 0]]);
  f([[0, 0, 0], [0, 0, z], [0, y, z], [0, y, 0]]);
  f([[x, 0, 0], [x, y, 0], [x, y, z], [x, 0, z]]);
  return b.toBytes();
}

const png = async (w: number, h: number, rgb: [number, number, number]) =>
  new Uint8Array(await sharp({ create: { width: w, height: h, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).png().toBuffer());

async function glb(opts: { external?: boolean } = {}) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  // 0.6 × 0.76 × 0.6 m box (two triangles per face ×6 = 12 triangles)
  const [x, y, z] = [0.6, 0.76, 0.6];
  const pos = new Float32Array([0, 0, 0, x, 0, 0, x, y, 0, 0, y, 0, 0, 0, z, x, 0, z, x, y, z, 0, y, z]);
  const idx = new Uint16Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 2, 6, 1, 6, 5]);
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(idx).setBuffer(buffer))
    .setMaterial(doc.createMaterial('Frente'));
  const prim2 = doc.createPrimitive().setAttribute('POSITION', prim.getAttribute('POSITION')!).setIndices(prim.getIndices()!).setMaterial(doc.createMaterial('Cuerpo'));
  const mesh = doc.createMesh('caja').addPrimitive(prim).addPrimitive(prim2);
  doc.createScene('escena').addChild(doc.createNode('modulo').setMesh(mesh));
  const bytes = await new NodeIO().writeBinary(doc);
  if (!opts.external) return bytes;
  // Rewrite the JSON chunk so the buffer points to an external file.
  const dv = new DataView(bytes.buffer, bytes.byteOffset);
  const len = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len)));
  json.buffers[0].uri = 'https://ejemplo.com/malla.bin';
  let text = JSON.stringify(json);
  while (text.length % 4) text += ' ';
  const jb = new TextEncoder().encode(text);
  const out = new Uint8Array(20 + jb.length);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, 0x46546c67, true);
  odv.setUint32(4, 2, true);
  odv.setUint32(8, out.length, true);
  odv.setUint32(12, jb.length, true);
  odv.setUint32(16, 0x4e4f534a, true);
  out.set(jb, 20);
  return out;
}

describe('archivos', () => {
  it('rechaza tamaño y tipo no permitidos al pedir el token', async () => {
    const big = await t.req('POST', '/files/upload-token', { user: dis, body: { kind: 'textura', contentType: 'image/png', size: 21 * 1024 * 1024 } });
    expect(big.status).toBe(413);
    const type = await t.req('POST', '/files/upload-token', { user: dis, body: { kind: 'pdf', contentType: 'image/png', size: 100 } });
    expect(type.status).toBe(422);
    expect(type.data.error.code).toBe('TIPO_NO_PERMITIDO');
  });

  it('valida el contenido real, no la extensión', async () => {
    const fake = new TextEncoder().encode('esto no es una imagen');
    const r = await upload(dis, 'textura', 'falsa.png', fake, 'image/png');
    expect(r.status).toBe(422);
    expect(r.data.error.code).toBe('CONTENIDO_INVALIDO');
  });

  it('el PUT de subida exige firma válida y respeta el tamaño declarado', async () => {
    const tok = await t.req('POST', '/files/upload-token', { user: dis, body: { kind: 'render', contentType: 'image/png', size: 1000, name: 'x.png' } });
    const url = new URL(tok.data.uploadUrl);
    const forged = url.pathname + url.search.replace(/sig=[^&]+/, 'sig=falsa');
    const bad = await t.app.request(forged, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: new Uint8Array(10) });
    expect(bad.status).toBe(400);
    const big = await t.app.request(url.pathname + url.search, { method: 'PUT', headers: { 'content-type': 'image/png', 'content-length': String(16 * 1024 * 1024) }, body: new Uint8Array(10) });
    expect(big.status).toBe(413);
    const wrongType = await t.app.request(url.pathname + url.search, { method: 'PUT', headers: { 'content-type': 'text/html' }, body: new Uint8Array(10) });
    expect(wrongType.status).toBe(400);
  });

  it('no registra URLs ajenas', async () => {
    const r = await t.req('POST', '/files', { user: dis, body: { kind: 'render', blobUrl: 'https://evil.example.com/x.png', name: 'x.png' } });
    expect(r.status).toBe(422);
    expect(r.data.error.code).toBe('URL_NO_PERMITIDA');
  });

  it('render de proyecto: miniatura, listado y borrado', async () => {
    const p = (await t.req('POST', '/projects', { user: dis, body: {} })).data;
    const f = await upload(dis, 'render', 'render.png', await png(1200, 800, [200, 180, 160]), 'image/png', p.id);
    expect(f.status).toBe(201);
    expect(f.data).toMatchObject({ width: 1200, height: 800, contentType: 'image/png' });
    expect(f.data.variants.thumb).toBeTruthy();
    const list = await t.req('GET', `/projects/${p.id}/files`, { user: dis });
    expect(list.data.items).toHaveLength(1);
    expect((await t.req('GET', `/projects/${p.id}/files`, { user: t.adminB })).status).toBe(404);
    expect((await t.req('DELETE', `/files/${f.data.id}`, { user: dis })).status).toBe(204);
  });
});

describe('biblioteca', () => {
  let textureCode = '';
  let glbModuleCode = '';

  it('subir una textura genera miniatura y 2K, y aparece en /catalog', async () => {
    const f = await upload(dis, 'textura', 'roble ahumado.png', await png(3000, 1500, [122, 82, 54]), 'image/png');
    expect(f.status).toBe(201);
    const tex = await t.req('POST', '/library/textures', { user: dis, body: { name: 'Roble ahumado', type: 'Chapa natural', uses: ['frentes'], tileCm: 60, baseColorFileId: f.data.id, priceM2: 999 } });
    expect(tex.status).toBe(201);
    textureCode = tex.data.code;
    expect(tex.data).toMatchObject({ source: 'subido', color: '#7a5236', kind: 'madera', grain: 'v', priceM2: 0 });
    expect(tex.data.maps.baseColor.thumb).toBeTruthy();
    const thumb = await t.storage.get(tex.data.maps.baseColor.thumb);
    const view = await t.storage.get(tex.data.maps.baseColor.url);
    expect(await sharp(thumb).metadata()).toMatchObject({ width: 256, height: 256, format: 'webp' });
    expect(await sharp(view).metadata()).toMatchObject({ width: 2048, height: 1024, format: 'webp' });
    const cat = await t.req('GET', '/catalog', { user: dis });
    expect(cat.data.materials.find((m: any) => m.code === textureCode)).toMatchObject({ name: 'Roble ahumado', uses: ['frentes'] });
  });

  it('un GLB devuelve bounding box y nombres de materiales', async () => {
    const f = await upload(dis, 'modelo3d', 'mueble.glb', await glb(), 'model/gltf-binary');
    expect(f.status).toBe(201);
    const ins = await t.req('POST', '/library/models/inspect', { user: dis, body: { fileId: f.data.id } });
    expect(ins.status).toBe(200);
    expect(ins.data).toMatchObject({ format: 'glb', bbox: { w: 60, h: 76, d: 60 }, materials: ['Frente', 'Cuerpo'], triangles: 24, unitsGuess: 'm' });
    const mod = await t.req('POST', '/library/modules', { user: dis, body: { name: 'Mueble GLB', source: 'modelo3d', modelFileId: f.data.id, compressDraco: true } });
    expect(mod.status, JSON.stringify(mod.data)).toBe(201);
    glbModuleCode = mod.data.module.code;
    expect(mod.data.module).toMatchObject({ source: 'modelo3d', defW: 60, fixedH: 76, fixedD: 60, materialSlots: { Frente: 'fijo', Cuerpo: 'fijo' } });
    // The model stretches to the width you give it: half to double its own width.
    expect(mod.data.module).toMatchObject({ minW: 30, maxW: 120 });
    expect(mod.data.module.modelFileId).not.toBe(f.data.id); // Draco-compressed copy
    const again = await t.req('POST', '/library/models/inspect', { user: dis, body: { fileId: mod.data.module.modelFileId } });
    expect(again.data.materials).toEqual(['Frente', 'Cuerpo']);
  });

  it('un .skp de SketchUp se convierte a GLB con medidas y materiales', async () => {
    const f = await upload(dis, 'modelo3d', 'mueble.skp', skp(), 'application/octet-stream');
    expect(f.status, JSON.stringify(f.data)).toBe(201);
    expect(f.data).toMatchObject({ contentType: 'model/gltf-binary', meta: { format: 'glb', source: 'skp', sourceName: 'mueble.skp' } });
    expect(f.data.variants.original).not.toBe(f.data.url);
    const ins = await t.req('POST', '/library/models/inspect', { user: dis, body: { fileId: f.data.id } });
    expect(ins.status).toBe(200);
    expect(ins.data.bbox).toEqual({ w: 60, h: 76, d: 60 });
    expect(ins.data.materials).toContain('Frente');
  });

  it('un mueble hecho por tablas (MB 1 puerta del usuario) trae su despiece real y se ajusta al ancho', async () => {
    const bytes = new Uint8Array(readFileSync(new URL('./fixtures/mb_1_puerta.3ds', import.meta.url)));
    const f = await upload(dis, 'modelo3d', 'MB_1_PUERTA.3ds', bytes, 'application/octet-stream');
    expect(f.status, JSON.stringify(f.data)).toBe(201);
    const mod = await t.req('POST', '/library/modules', { user: dis, body: { name: 'MB 1 puerta', source: 'modelo3d', modelFileId: f.data.id } });
    expect(mod.status, JSON.stringify(mod.data)).toBe(201);
    expect(mod.data.module).toMatchObject({ defW: 30, fixedH: 78, fixedD: 60, minW: 15, maxW: 60 });
    const panels = mod.data.module.recipe.panels as { n: string; s: number[] }[];
    expect(panels.map((p) => p.n).sort()).toEqual(['División Libre 1', 'Entrepaño fijo', 'Entrepaño fijo', 'Lateral Derecho', 'Lateral Izquierdo', 'Puerta (unica)', 'Suelo', 'Trasera'].sort());
    // It becomes a native module: one door read from its front board.
    expect(mod.data.module.recipe.fr).toEqual([{ t: 'door', n: 1, f: 1 }]);
    // The project instance gets the boards; the despiece uses the real sizes (the back is 18 mm here, not HDF).
    const cat = (await t.req('GET', '/catalog', { user: dis })).data;
    const def = cat.context.modules[mod.data.module.code];
    const inst = { ...templateOf(def), id: 1, wall: 'A', pos: 0 } as unknown as ModuleInstance;
    const list = parts(inst, DEFAULT_KITCHEN.mats, cat.context.materials);
    const byName = Object.fromEntries(list.map((p) => [p.pieza, p]));
    expect(byName['Lateral Derecho']).toMatchObject({ cant: 1, L: 780, A: 582, esp: 18, slot: 'cuerpo' });
    expect(byName['Puerta (unica)']).toMatchObject({ L: 755, A: 297, esp: 18, slot: 'frentes', cantos: '4L' });
    expect(byName.Trasera).toMatchObject({ L: 762, A: 264, esp: 18, slot: 'cuerpo' });
    expect(byName['Entrepaño fijo']!.cant).toBe(1); // two shelves of different depth stay as two rows
    expect(list.reduce((a, p) => a + p.cant, 0)).toBe(8);
    // Stretched to 60 cm: floor, back and door grow by the 300 mm added; the sides stay 18 mm and on the edges.
    const wide = parts({ ...inst, w: 60 }, DEFAULT_KITCHEN.mats, cat.context.materials);
    expect(wide.find((p) => p.pieza === 'Suelo')).toMatchObject({ L: 582, A: 564 });
    expect(wide.find((p) => p.pieza === 'Lateral Derecho')).toMatchObject({ L: 780, A: 582, esp: 18 });
    expect(wide.find((p) => p.pieza === 'Puerta (unica)')).toMatchObject({ L: 755, A: 597 });
  });

  it('un modelo subido antes (sin piezas guardadas) recibe su despiece solo al cargar el catálogo, una vez', async () => {
    const bytes = new Uint8Array(readFileSync(new URL('./fixtures/mb_1_puerta.3ds', import.meta.url)));
    const f = await upload(dis, 'modelo3d', 'MB_VIEJO.3ds', bytes, 'application/octet-stream');
    const mod = await t.req('POST', '/library/modules', { user: dis, body: { name: 'MB viejo', source: 'modelo3d', modelFileId: f.data.id } });
    // As it was saved before boards were read: no panels, fixed width.
    await t.db.update(moduleDefinitions).set({ recipe: { fr: [] }, minW: 30, maxW: 30 }).where(eq(moduleDefinitions.id, mod.data.module.id));
    const cat = (await t.req('GET', '/catalog', { user: dis })).data;
    const def = cat.context.modules[mod.data.module.code];
    expect(def.panels).toHaveLength(8);
    expect(def.pdim).toEqual([30, 78, 60]);
    expect(def.rw).toEqual([15, 60]);
    const [row] = await t.db.select().from(moduleDefinitions).where(eq(moduleDefinitions.id, mod.data.module.id));
    expect((row!.recipe as { pscan?: number }).pscan).toBe(1);
    expect(def.fr).toEqual([{ t: 'door', n: 1, f: 1 }]);

    // Read before it became native (boards saved, no fronts): it gets its door on the next load.
    const { fr: _fr, ...boards } = row!.recipe as Record<string, unknown>;
    await t.db.update(moduleDefinitions).set({ recipe: { ...boards, fr: [] } }).where(eq(moduleDefinitions.id, mod.data.module.id));
    const again = (await t.req('GET', '/catalog', { user: dis })).data.context.modules[mod.data.module.code];
    expect(again.fr).toEqual([{ t: 'door', n: 1, f: 1 }]);
    expect(again.panels).toHaveLength(8);
  });

  it('se crea un módulo dentro de la app y un modelo subido se puede dejar como modelo 3D o volver a nativo', async () => {
    const created = await t.req('POST', '/library/modules', { user: dis, body: { source: 'parametrico', name: 'Bajo gaveta y 2 puertas', type: 'base', category: 'Bajos', defW: 80, minW: 40, maxW: 120, fixedH: 76, fixedD: 60, unitPrice: 0, recipe: { fr: [{ t: 'door', n: 2, f: 0.75 }, { t: 'drawer', f: 0.25 }] } } });
    expect(created.status, JSON.stringify(created.data)).toBe(201);
    let cat = (await t.req('GET', '/catalog', { user: dis })).data;
    expect(cat.context.modules[created.data.module.code]).toMatchObject({ w: 80, rw: [40, 120], fr: [{ t: 'door', n: 2, f: 0.75 }, { t: 'drawer', f: 0.25 }] });

    const bytes = new Uint8Array(readFileSync(new URL('./fixtures/mb_1_puerta.3ds', import.meta.url)));
    const f = await upload(dis, 'modelo3d', 'MB_POLY.3ds', bytes, 'application/octet-stream');
    const mod = (await t.req('POST', '/library/modules', { user: dis, body: { name: 'MB poly', source: 'modelo3d', modelFileId: f.data.id } })).data.module;
    const asModel = await t.req('PATCH', `/library/modules/${mod.id}`, { user: dis, body: { recipe: { ...mod.recipe, draw: 'modelo' } } });
    expect(asModel.status, JSON.stringify(asModel.data)).toBe(200);
    cat = (await t.req('GET', '/catalog', { user: dis })).data;
    expect(cat.context.modules[mod.code].draw).toBe('modelo');
    // Back to native with two doors set by hand: the despiece switches to the standard box (fronts changed).
    await t.req('PATCH', `/library/modules/${mod.id}`, { user: dis, body: { recipe: { ...mod.recipe, draw: 'nativo', fr: [{ t: 'door', n: 2, f: 1 }] } } });
    cat = (await t.req('GET', '/catalog', { user: dis })).data;
    const def = cat.context.modules[mod.code];
    expect(def).toMatchObject({ draw: 'nativo', fr: [{ t: 'door', n: 2, f: 1 }] });
    const inst = { ...templateOf(def), id: 1, wall: 'A', pos: 0 } as unknown as ModuleInstance;
    expect(inst.draw).toBe('nativo');
    expect(parts(inst, DEFAULT_KITCHEN.mats, cat.context.materials).find((p) => p.pieza === 'Puerta')!.cant).toBe(2);
  });

  it('un .3ds (suelto o en ZIP con su textura) se convierte a GLB', async () => {
    const f = await upload(dis, 'modelo3d', 'mueble.3ds', tds('roble.png'), 'application/octet-stream');
    expect(f.status, JSON.stringify(f.data)).toBe(201);
    expect(f.data.meta).toMatchObject({ format: 'glb', source: '3ds' });
    expect(f.data.meta.warnings.join(' ')).toMatch(/centímetros.*|Falta la textura "roble.png"/);
    const ins = await t.req('POST', '/library/models/inspect', { user: dis, body: { fileId: f.data.id } });
    expect(ins.data).toMatchObject({ bbox: { w: 60, h: 76, d: 60 }, materials: ['Frente'], triangles: 12, textures: [] });

    const zip = zipSync({ 'modelo/mueble.3ds': tds('ROBLE.PNG'), 'modelo/texturas/roble.png': await png(8, 8, [150, 110, 70]), 'modelo/leeme.txt': strToU8('hola') });
    const z = await upload(dis, 'modelo3d', 'mueble.zip', zip, 'application/zip');
    expect(z.status, JSON.stringify(z.data)).toBe(201);
    const insZ = await t.req('POST', '/library/models/inspect', { user: dis, body: { fileId: z.data.id } });
    expect(insZ.data.textures).toHaveLength(1);
    expect(z.data.meta.warnings.join(' ')).not.toMatch(/Falta la textura/);
  });

  it('un .3ds dañado responde 422 al subirlo', async () => {
    const bad = tds().slice(0, 40);
    new DataView(bad.buffer).setUint32(2, 40, true);
    const f = await upload(dis, 'modelo3d', 'roto.3ds', bad, 'application/octet-stream');
    expect(f.status).toBe(422);
    expect(f.data.error.code).toBe('MODELO_INVALIDO');
  });

  it('editar solo un campo no resetea los demás; el catálogo trae la URL del GLB', async () => {
    const tex = (await t.req('GET', '/library/textures', { user: dis })).data.items.find((m: any) => m.code === textureCode);
    const r1 = await t.req('PATCH', `/library/textures/${tex.id}`, { user: dis, body: { name: 'Roble ahumado claro' } });
    expect(r1.status, JSON.stringify(r1.data)).toBe(200);
    const tex2 = (await t.req('GET', '/library/textures', { user: dis })).data.items.find((m: any) => m.code === textureCode);
    expect(tex2).toMatchObject({ name: 'Roble ahumado claro', uses: ['frentes'], type: 'Chapa natural' });
    const mod = (await t.req('GET', '/library/modules', { user: dis })).data.items.find((m: any) => m.code === glbModuleCode);
    const r2 = await t.req('PATCH', `/library/modules/${mod.id}`, { user: dis, body: { category: 'Electro' } });
    expect(r2.status, JSON.stringify(r2.data)).toBe(200);
    expect(r2.data.module).toMatchObject({ category: 'Electro', source: 'modelo3d', name: 'Mueble GLB', modelFileId: mod.modelFileId });
    const cat = await t.req('GET', '/catalog', { user: dis });
    expect(cat.data.context.modules[glbModuleCode].glb).toMatch(/.glb$/);
  });

  it('un modelo no válido responde 422 con mensaje claro', async () => {
    const broken = new Uint8Array(64);
    broken.set(new TextEncoder().encode('glTF'), 0);
    const f = await upload(dis, 'modelo3d', 'roto.glb', broken, 'model/gltf-binary');
    expect(f.status).toBe(201); // header matches, deep validation happens on inspect
    const ins = await t.req('POST', '/library/models/inspect', { user: dis, body: { fileId: f.data.id } });
    expect(ins.status).toBe(422);
    expect(ins.data.error.code).toBe('MODELO_INVALIDO');
    const ext = await upload(dis, 'modelo3d', 'externo.glb', await glb({ external: true }), 'model/gltf-binary');
    const insExt = await t.req('POST', '/library/models/inspect', { user: dis, body: { fileId: ext.data.id } });
    expect(insExt.status).toBe(422);
    expect(insExt.data.error.code).toBe('MODELO_CON_RECURSOS_EXTERNOS');
  });

  it('módulo paramétrico: valida la receta', async () => {
    const bad = await t.req('POST', '/library/modules', { user: dis, body: { name: 'Malo', type: 'base', recipe: { fr: [{ t: 'door', f: 0.3 }] } } });
    expect(bad.status).toBe(422);
    const ok = await t.req('POST', '/library/modules', { user: dis, body: { code: 'MI-CAJ', name: 'Mi cajonera', type: 'base', minW: 40, maxW: 90, defW: 60, fixedH: 76, fixedD: 60, recipe: { fr: [{ t: 'drawer', f: 0.5 }, { t: 'drawer', f: 0.5 }] } } });
    expect(ok.status).toBe(201);
    expect(ok.data.module).toMatchObject({ drawers: 2, doors: 0, kind: 'cajones' });
  });

  it('exportar e importar en ZIP conserva datos y archivos', async () => {
    const res = await t.app.request('/api/v1/library/export?items=textures,modules', { headers: { authorization: `Bearer ${dis.token}` } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
    const zip = new Uint8Array(await res.arrayBuffer());

    const form = new FormData();
    form.append('file', new Blob([zip], { type: 'application/zip' }), 'biblioteca.zip');
    const imp = await t.app.request('/api/v1/library/import', { method: 'POST', headers: { authorization: `Bearer ${t.adminB.token}` }, body: form });
    const report = (await imp.json()) as any;
    expect(imp.status).toBe(200);
    expect(report.errors).toEqual([]);
    expect(report.created.map((x: any) => x.code)).toEqual(expect.arrayContaining([textureCode, glbModuleCode, 'MI-CAJ']));

    const srcTex = (await t.req('GET', '/library/textures', { user: dis })).data.items.find((m: any) => m.code === textureCode);
    const dstTex = (await t.req('GET', '/library/textures', { user: t.adminB })).data.items.find((m: any) => m.code === textureCode);
    for (const k of ['name', 'type', 'color', 'kind', 'uses', 'sizeWcm', 'grain', 'roughness', 'priceM2', 'source']) expect(dstTex[k], k).toEqual(srcTex[k]);
    expect(Buffer.from(await t.storage.get(dstTex.maps.baseColor.original)).equals(Buffer.from(await t.storage.get(srcTex.maps.baseColor.original)))).toBe(true);
    expect(dstTex.maps.baseColor.thumb).toBeTruthy();

    const srcMods = (await t.req('GET', '/library/modules', { user: dis })).data.items;
    const dstMods = (await t.req('GET', '/library/modules', { user: t.adminB })).data.items;
    const sm = srcMods.find((m: any) => m.code === glbModuleCode);
    const dm = dstMods.find((m: any) => m.code === glbModuleCode);
    for (const k of ['name', 'type', 'source', 'defW', 'fixedH', 'fixedD', 'materialSlots', 'recipe', 'unitPrice']) expect(dm[k], k).toEqual(sm[k]);
    const srcModel = (await t.db.query.files.findFirst({ where: (f, { eq }) => eq(f.id, sm.modelFileId) }))!;
    const dstModel = (await t.db.query.files.findFirst({ where: (f, { eq }) => eq(f.id, dm.modelFileId) }))!;
    expect(dstModel.organizationId).toBe(t.orgB.id);
    expect(Buffer.from(await t.storage.get(dstModel.blobUrl)).equals(Buffer.from(await t.storage.get(srcModel.blobUrl)))).toBe(true);

    // Importing again updates instead of duplicating.
    const form2 = new FormData();
    form2.append('file', new Blob([zip], { type: 'application/zip' }), 'biblioteca.zip');
    const again = (await (await t.app.request('/api/v1/library/import', { method: 'POST', headers: { authorization: `Bearer ${t.adminB.token}` }, body: form2 })).json()) as any;
    expect(again.created).toEqual([]);
    expect(again.updated.length).toBe(report.created.length + report.updated.length);
  });

  it('lectura no puede escribir en la biblioteca; ZIP inválido responde 422', async () => {
    const lec = await t.makeUser(t.orgA.id, 'lectura', 'lec-lib@a.test');
    expect((await t.req('POST', '/library/modules', { user: lec, body: { name: 'x', type: 'base' } })).status).toBe(403);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array([1, 2, 3])]), 'x.zip');
    const r = await t.app.request('/api/v1/library/import', { method: 'POST', headers: { authorization: `Bearer ${dis.token}` }, body: form });
    expect(r.status).toBe(422);
  });
});
