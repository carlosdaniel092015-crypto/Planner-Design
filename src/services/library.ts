import { z } from '@hono/zod-openapi';
import { and, eq } from 'drizzle-orm';
import { kindOfType, modelWidthRange } from '../core';
import type { DbOrTx } from '../db/client';
import { files, materials, type moduleDefinitions } from '../db/schema';
import type { AuthContext } from '../lib/context';
import { randomToken } from '../lib/crypto';
import { notFound, unprocessable } from '../lib/errors';
import { createMaterial, createModule, ModuleInput, updateMaterial, updateModule } from './catalog-admin';
import { type FileRow, getFile, saveBytes } from './files';
import { compressDraco, inspectModel, type ModelInspection, processImage } from './media';
import type { Storage } from './storage';

const ROUGH = { Mate: 0.72, Satinado: 0.45, Brillante: 0.14 } as const;

export const TextureInput = z
  .object({
    code: z.string().regex(/^[A-Za-z0-9_.-]{1,40}$/).optional(),
    name: z.string().min(1).max(120),
    type: z.string().min(1).max(60).default('Melamina').openapi({ description: 'Melamina, Melamina texturizada, Chapa natural, Lacado, Cuarzo, Granito, Madera maciza, Metal…' }),
    kind: z.enum(['madera', 'solido', 'piedra', 'metal', 'vidrio']).optional(),
    uses: z.array(z.enum(['cuerpo', 'frentes', 'encimera', 'jaladeras'])).default(['frentes', 'cuerpo']),
    tileCm: z.number().min(5).max(400).default(60).openapi({ description: 'Medida real de la muestra (cm).' }),
    finish: z.enum(['Mate', 'Satinado', 'Brillante']).default('Mate'),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().openapi({ description: 'Si no se envía se calcula el color promedio de la imagen.' }),
    grain: z.enum(['v', 'h', 'ninguna']).optional(),
    rotation: z.number().min(-360).max(360).optional(),
    baseColorFileId: z.uuid(),
    normalFileId: z.uuid().nullable().optional(),
    roughnessFileId: z.uuid().nullable().optional(),
    aoFileId: z.uuid().nullable().optional(),
    metalnessFileId: z.uuid().nullable().optional(),
    priceM2: z.number().min(0).optional().openapi({ description: 'Solo admin; para otros roles se ignora.' }),
    priceCurrency: z.enum(['USD', 'DOP']).optional(),
    active: z.boolean().optional(),
  })
  .openapi('TexturaEntrada', { example: { name: 'Roble ahumado', type: 'Chapa natural', uses: ['frentes'], tileCm: 60, finish: 'Mate', baseColorFileId: '6c1f…' } });

export const LibraryModuleInput = ModuleInput.partial({ code: true, minW: true, maxW: true, defW: true, fixedH: true, fixedD: true, type: true })
  .extend({ compressDraco: z.boolean().optional().openapi({ description: 'Comprime la malla del GLB con Draco antes de guardarlo.' }) })
  .openapi('ModuloBibliotecaEntrada', {
    example: { name: 'Refrigerador Samsung 70', source: 'modelo3d', modelFileId: '2d4e…', category: 'Mis módulos', unitPrice: 1450 },
  });

/** Makes sure an image file has its 256 px thumbnail and 2K variant (re-validating the bytes with sharp). */
export async function ensureImageVariants(db: DbOrTx, storage: Storage, a: AuthContext, f: FileRow): Promise<FileRow> {
  if (f.kind !== 'textura') throw unprocessable('ARCHIVO_NO_ES_TEXTURA', `El archivo "${f.name}" no se subió como textura.`);
  if (f.variants.thumb && f.variants.view2k && f.width) return f;
  const img = await processImage(await storage.get(f.blobUrl));
  const base = f.name.replace(/\.[^.]+$/, '');
  const thumb = (await storage.put(`${a.org.id}/miniatura/${randomToken(8)}-${base}-256.webp`, img.thumb, 'image/webp')).url;
  const view2k = (await storage.put(`${a.org.id}/textura/${randomToken(8)}-${base}-2k.webp`, img.view2k, 'image/webp')).url;
  const [row] = await db
    .update(files)
    .set({ variants: { ...f.variants, original: f.blobUrl, thumb, view2k }, width: img.width, height: img.height, meta: { ...f.meta, color: img.color } })
    .where(eq(files.id, f.id))
    .returning();
  return row!;
}

const noPriceUnlessAdmin = <T extends { priceM2?: number; unitPrice?: number; priceCurrency?: string }>(a: AuthContext, x: T): T => {
  if (a.user.role === 'admin') return x;
  const { priceM2: _p, unitPrice: _u, priceCurrency: _c, ...rest } = x;
  return rest as T;
};

export async function createTexture(db: DbOrTx, storage: Storage, a: AuthContext, input: z.infer<typeof TextureInput>) {
  const base = await ensureImageVariants(db, storage, a, await getFile(db, a.org.id, input.baseColorFileId));
  for (const id of [input.normalFileId, input.roughnessFileId, input.aoFileId, input.metalnessFileId]) if (id) await ensureImageVariants(db, storage, a, await getFile(db, a.org.id, id));
  const clean = noPriceUnlessAdmin(a, input);
  const kind = input.kind ?? kindOfType(input.type);
  return createMaterial(
    db,
    a,
    {
      code: input.code ?? `u_${randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`,
      name: input.name,
      type: input.type,
      kind,
      uses: input.uses,
      color: input.color ?? (base.meta.color as string | undefined) ?? '#b0a898',
      baseColorFileId: input.baseColorFileId,
      normalFileId: input.normalFileId ?? null,
      roughnessFileId: input.roughnessFileId ?? null,
      aoFileId: input.aoFileId ?? null,
      metalnessFileId: input.metalnessFileId ?? null,
      thumbnailUrl: base.variants.thumb ?? null,
      sizeWcm: input.tileCm,
      sizeHcm: input.tileCm,
      grain: input.grain ?? (/madera|chapa|roble|nogal|fresno|encino/i.test(`${input.type} ${input.name}`) ? 'v' : 'ninguna'),
      rotation: input.rotation ?? 0,
      thickness: 1.8,
      roughness: ROUGH[input.finish],
      priceM2: clean.priceM2 ?? 0,
      priceCurrency: clean.priceCurrency ?? 'USD',
      active: input.active ?? true,
      sort: 1000,
    },
    'subido',
  );
}

export async function updateTexture(db: DbOrTx, storage: Storage, a: AuthContext, id: string, patch: Partial<z.infer<typeof TextureInput>>) {
  const [cur] = await db.select().from(materials).where(and(eq(materials.id, id), eq(materials.organizationId, a.org.id)));
  if (!cur || cur.source !== 'subido') throw notFound('La textura');
  let thumbnailUrl: string | undefined;
  if (patch.baseColorFileId) thumbnailUrl = (await ensureImageVariants(db, storage, a, await getFile(db, a.org.id, patch.baseColorFileId))).variants.thumb;
  const { tileCm, finish, code: _code, ...rest } = noPriceUnlessAdmin(a, patch);
  return updateMaterial(db, a, id, {
    ...rest,
    ...(tileCm ? { sizeWcm: tileCm, sizeHcm: tileCm } : {}),
    ...(finish ? { roughness: ROUGH[finish] } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
  });
}

export interface LibraryModuleResult {
  module: typeof moduleDefinitions.$inferSelect;
  model: ModelInspection | null;
}

export async function createLibraryModule(db: DbOrTx, storage: Storage, a: AuthContext, input: z.infer<typeof LibraryModuleInput>): Promise<LibraryModuleResult> {
  const clean = noPriceUnlessAdmin(a, input);
  let model: ModelInspection | null = null;
  let modelFileId = input.modelFileId ?? null;
  const source = input.source ?? (modelFileId ? 'modelo3d' : 'parametrico');
  if (source === 'modelo3d') {
    if (!modelFileId) throw unprocessable('FALTA_MODELO', 'Los módulos de tipo modelo3d necesitan modelFileId.');
    const f = await getFile(db, a.org.id, modelFileId);
    if (f.kind !== 'modelo3d') throw unprocessable('ARCHIVO_NO_ES_MODELO', 'El archivo no se subió como modelo 3D.');
    let bytes = await storage.get(f.blobUrl);
    model = await inspectModel(bytes);
    if (input.compressDraco) {
      bytes = await compressDraco(bytes);
      modelFileId = (await saveBytes(db, storage, a, { kind: 'modelo3d', name: f.name.replace(/\.(glb|gltf)$/i, '') + '-draco.glb', bytes })).id;
    }
  }
  const w = input.defW ?? model?.bbox.w ?? 60;
  const h = input.fixedH ?? model?.bbox.h ?? 76;
  const code = input.code ?? `${source === 'modelo3d' ? 'GLB' : 'MOD'}-${randomToken(4).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`;
  const { compressDraco: _c, ...rest } = clean;
  const row = await createModule(db, a, {
    ...ModuleInput.parse({
      ...rest,
      code,
      source,
      type: input.type ?? (source === 'modelo3d' ? (h > 150 ? 'fridge' : 'base') : 'base'),
      // 3D models stretch to the width you give them (half to double); parametric modules keep one width unless set.
      minW: input.minW ?? (source === 'modelo3d' ? modelWidthRange(w)[0] : w),
      maxW: input.maxW ?? (source === 'modelo3d' ? modelWidthRange(w)[1] : w),
      defW: w,
      fixedH: h,
      fixedD: input.fixedD ?? model?.bbox.d ?? 60,
      recipe: input.recipe ?? { fr: [] },
      modelFileId,
      materialSlots: input.materialSlots ?? (model ? Object.fromEntries(model.materials.map((m) => [m, 'fijo'])) : null),
      unitPrice: clean.unitPrice ?? 0,
    }),
  });
  return { module: row, model };
}

export async function updateLibraryModule(db: DbOrTx, storage: Storage, a: AuthContext, id: string, patch: Partial<z.infer<typeof LibraryModuleInput>>) {
  let model: ModelInspection | null = null;
  if (patch.modelFileId) {
    const f = await getFile(db, a.org.id, patch.modelFileId);
    if (f.kind !== 'modelo3d') throw unprocessable('ARCHIVO_NO_ES_MODELO', 'El archivo no se subió como modelo 3D.');
    model = await inspectModel(await storage.get(f.blobUrl));
  }
  const { compressDraco: _c, code: _code, ...rest } = noPriceUnlessAdmin(a, patch);
  return { module: await updateModule(db, a, id, rest), model };
}
