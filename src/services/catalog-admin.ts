import { z } from '@hono/zod-openapi';
import { and, eq, sql } from 'drizzle-orm';
import { recipeSchema } from '../core';
import type { DbOrTx } from '../db/client';
import { files, hardwarePrices, materials, moduleDefinitions } from '../db/schema';
import { audit } from '../lib/audit';
import type { AuthContext } from '../lib/context';
import { conflict, notFound, unprocessable } from '../lib/errors';

const Currency = z.enum(['USD', 'DOP']);
const code = z.string().regex(/^[A-Za-z0-9_.-]{1,40}$/, 'El código solo admite letras, números, punto, guion y guion bajo (máx. 40).');

export const ModuleInput = z
  .object({
    code,
    name: z.string().min(1).max(120),
    projectType: z.enum(['cocina', 'closet']).default('cocina'),
    source: z.enum(['parametrico', 'modelo3d']).default('parametrico'),
    type: z.enum(['base', 'upper', 'tall', 'fridge', 'hood']),
    category: z.string().min(1).max(60).default('Mis módulos'),
    kind: z.string().max(40).optional(),
    minW: z.number().positive().max(1000),
    maxW: z.number().positive().max(1000),
    defW: z.number().positive().max(1000),
    fixedH: z.number().positive().max(1000),
    fixedD: z.number().positive().max(1000),
    recipe: z.record(z.string(), z.unknown()).default({ fr: [] }).openapi({ example: { fr: [{ t: 'door', n: 2, f: 1 }], sink: 1 } }),
    modelFileId: z.uuid().nullable().optional(),
    footprint: z.record(z.string(), z.unknown()).nullable().optional(),
    anchor: z.record(z.string(), z.unknown()).nullable().optional(),
    materialSlots: z.record(z.string(), z.string()).nullable().optional().openapi({ description: 'Nombre del material del GLB → "fijo", "frente", "cuerpo" o código de material.' }),
    unitPrice: z.number().min(0).default(0),
    priceCurrency: Currency.default('USD'),
    useInAutolayout: z.boolean().default(true),
    thumbnailUrl: z.string().max(2000).nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    sort: z.number().int().default(0),
    active: z.boolean().default(true),
  })
  .openapi('ModuloEntrada', {
    example: { code: 'BF-100', name: 'Bajo fregadero 100', type: 'base', category: 'Bajos', minW: 80, maxW: 120, defW: 100, fixedH: 76, fixedD: 60, recipe: { fr: [{ t: 'door', n: 2, f: 1 }], sink: 1 }, unitPrice: 110, priceCurrency: 'USD' },
  });

export const MaterialInput = z
  .object({
    code,
    name: z.string().min(1).max(120),
    category: z.string().max(60).optional(),
    type: z.string().min(1).max(60).openapi({ description: 'Tipo mostrado en el editor, p. ej. "Melamina texturizada".' }),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#b0a898'),
    kind: z.enum(['madera', 'solido', 'piedra', 'metal', 'vidrio']),
    uses: z.array(z.enum(['cuerpo', 'frentes', 'encimera', 'jaladeras'])).default([]),
    baseColorFileId: z.uuid().nullable().optional(),
    normalFileId: z.uuid().nullable().optional(),
    roughnessFileId: z.uuid().nullable().optional(),
    aoFileId: z.uuid().nullable().optional(),
    metalnessFileId: z.uuid().nullable().optional(),
    thumbnailUrl: z.string().max(2000).nullable().optional(),
    sizeWcm: z.number().positive().max(1000).nullable().optional(),
    sizeHcm: z.number().positive().max(1000).nullable().optional(),
    grain: z.enum(['v', 'h', 'ninguna']).default('ninguna'),
    rotation: z.number().min(-360).max(360).default(0),
    thickness: z.number().positive().max(20).default(1.8),
    roughness: z.number().min(0).max(1).nullable().optional(),
    clearcoat: z.number().min(0).max(1).nullable().optional(),
    priceM2: z.number().min(0).default(0),
    priceCurrency: Currency.default('USD'),
    supplierCode: z.string().max(60).nullable().optional(),
    active: z.boolean().default(true),
    sort: z.number().int().default(0),
  })
  .openapi('MaterialEntrada', { example: { code: 'marmol-carrara', name: 'Mármol Carrara', type: 'Cuarzo 20 mm', kind: 'piedra', uses: ['encimera'], color: '#e7e5e0', priceM2: 210, sizeWcm: 80 } });

export const HardwareInput = z
  .object({ code, name: z.string().min(1).max(120), unitPrice: z.number().min(0), priceCurrency: Currency.default('USD'), active: z.boolean().default(true) })
  .openapi('HerrajeEntrada', { example: { code: 'BISAGRA', name: 'Bisagra cierre suave', unitPrice: 2.5, priceCurrency: 'USD' } });

type ModuleIn = z.infer<typeof ModuleInput>;
type MaterialIn = z.infer<typeof MaterialInput>;

function checkWidths(m: Pick<ModuleIn, 'minW' | 'maxW' | 'defW'>) {
  if (!(m.minW <= m.defW && m.defW <= m.maxW))
    throw unprocessable('RANGO_DE_ANCHO', `El ancho debe cumplir mínimo ≤ por defecto ≤ máximo (${m.minW} ≤ ${m.defW} ≤ ${m.maxW}).`);
}

function checkRecipe(recipe: unknown) {
  const r = recipeSchema.safeParse(recipe);
  if (!r.success)
    throw unprocessable('RECETA_INVALIDA', 'La receta del módulo no es válida.', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  return r.data;
}

async function assertOwnFiles(db: DbOrTx, orgId: string, ids: (string | null | undefined)[]) {
  for (const id of ids) {
    if (!id) continue;
    const [f] = await db.select({ id: files.id }).from(files).where(and(eq(files.id, id), eq(files.organizationId, orgId)));
    if (!f) throw notFound('El archivo');
  }
}

const moduleRow = (m: ModuleIn) => {
  const recipe = checkRecipe(m.recipe);
  const doors = recipe.fr.filter((f) => f.t === 'door').reduce((a, f) => a + (f.n ?? 1), 0);
  const drawers = recipe.fr.filter((f) => f.t === 'drawer').length;
  const { type, ...rest } = m;
  return { ...rest, row: type, kind: m.kind ?? (drawers && !doors ? 'cajones' : 'puertas'), recipe, doors, drawers };
};

const materialRow = (m: MaterialIn) => {
  const { type, ...rest } = m;
  return { ...rest, typeLabel: type, category: m.category ?? type.split(' ')[0]! };
};

const uniqueViolation = (e: unknown) => {
  const msg = String((e as { message?: string; cause?: { message?: string } })?.cause?.message ?? (e as Error)?.message ?? '');
  return /unique|duplicate/i.test(msg) || (e as { code?: string })?.code === '23505' || (e as { cause?: { code?: string } })?.cause?.code === '23505';
};

async function guardUnique<T>(fn: () => Promise<T>, what: string) {
  try {
    return await fn();
  } catch (e) {
    if (uniqueViolation(e)) throw conflict('CODIGO_EN_USO', `Ya existe ${what} con ese código.`);
    throw e;
  }
}

// ---------- modules ----------
export async function createModule(db: DbOrTx, a: AuthContext, input: ModuleIn) {
  checkWidths(input);
  await assertOwnFiles(db, a.org.id, [input.modelFileId]);
  const [row] = await guardUnique(() => db.insert(moduleDefinitions).values({ ...moduleRow(input), organizationId: a.org.id }).returning(), 'un módulo');
  await audit(db, a, 'crear', 'module', row!.id, { code: row!.code });
  return row!;
}

export async function updateModule(db: DbOrTx, a: AuthContext, id: string, patch: Partial<ModuleIn>) {
  const [cur] = await db.select().from(moduleDefinitions).where(and(eq(moduleDefinitions.id, id), eq(moduleDefinitions.organizationId, a.org.id)));
  if (!cur) throw notFound('El módulo');
  const merged: ModuleIn = {
    code: cur.code,
    name: cur.name,
    projectType: cur.projectType,
    source: cur.source,
    type: cur.row,
    category: cur.category,
    kind: cur.kind,
    minW: cur.minW,
    maxW: cur.maxW,
    defW: cur.defW,
    fixedH: cur.fixedH,
    fixedD: cur.fixedD,
    recipe: (cur.recipe ?? { fr: [] }) as Record<string, unknown>,
    modelFileId: cur.modelFileId,
    footprint: cur.footprint,
    anchor: cur.anchor,
    materialSlots: cur.materialSlots,
    unitPrice: cur.unitPrice,
    priceCurrency: cur.priceCurrency,
    useInAutolayout: cur.useInAutolayout,
    thumbnailUrl: cur.thumbnailUrl,
    description: cur.description,
    sort: cur.sort,
    active: cur.active,
    ...patch,
  };
  checkWidths(merged);
  await assertOwnFiles(db, a.org.id, [patch.modelFileId]);
  const [row] = await guardUnique(
    () =>
      db
        .update(moduleDefinitions)
        .set({ ...moduleRow(merged), version: sql`${moduleDefinitions.version} + 1` })
        .where(eq(moduleDefinitions.id, id))
        .returning(),
    'un módulo',
  );
  const priceChanged = patch.unitPrice !== undefined && patch.unitPrice !== cur.unitPrice;
  await audit(db, a, priceChanged ? 'cambiar_precios' : 'actualizar', 'module', id, { code: row!.code, ...(priceChanged ? { from: cur.unitPrice, to: patch.unitPrice } : {}) });
  return row!;
}

// ---------- materials ----------
export async function createMaterial(db: DbOrTx, a: AuthContext, input: MaterialIn, source: 'estandar' | 'subido' = 'estandar') {
  await assertOwnFiles(db, a.org.id, [input.baseColorFileId, input.normalFileId, input.roughnessFileId, input.aoFileId, input.metalnessFileId]);
  const [row] = await guardUnique(() => db.insert(materials).values({ ...materialRow(input), source, organizationId: a.org.id }).returning(), 'un material');
  await audit(db, a, 'crear', 'material', row!.id, { code: row!.code });
  return row!;
}

export async function updateMaterial(db: DbOrTx, a: AuthContext, id: string, patch: Partial<MaterialIn>) {
  const [cur] = await db.select().from(materials).where(and(eq(materials.id, id), eq(materials.organizationId, a.org.id)));
  if (!cur) throw notFound('El material');
  await assertOwnFiles(db, a.org.id, [patch.baseColorFileId, patch.normalFileId, patch.roughnessFileId, patch.aoFileId, patch.metalnessFileId]);
  const { type, ...rest } = patch;
  const [row] = await guardUnique(
    () =>
      db
        .update(materials)
        .set({ ...rest, ...(type ? { typeLabel: type } : {}), version: sql`${materials.version} + 1` })
        .where(eq(materials.id, id))
        .returning(),
    'un material',
  );
  const priceChanged = patch.priceM2 !== undefined && patch.priceM2 !== cur.priceM2;
  await audit(db, a, priceChanged ? 'cambiar_precios' : 'actualizar', 'material', id, { code: row!.code, ...(priceChanged ? { from: cur.priceM2, to: patch.priceM2 } : {}) });
  return row!;
}

// ---------- hardware ----------
export async function createHardware(db: DbOrTx, a: AuthContext, input: z.infer<typeof HardwareInput>) {
  const [row] = await guardUnique(() => db.insert(hardwarePrices).values({ ...input, organizationId: a.org.id }).returning(), 'un herraje');
  await audit(db, a, 'crear', 'hardware', row!.id, { code: row!.code });
  return row!;
}

export async function updateHardware(db: DbOrTx, a: AuthContext, id: string, patch: Partial<z.infer<typeof HardwareInput>>) {
  const [cur] = await db.select().from(hardwarePrices).where(and(eq(hardwarePrices.id, id), eq(hardwarePrices.organizationId, a.org.id)));
  if (!cur) throw notFound('El herraje');
  const [row] = await guardUnique(() => db.update(hardwarePrices).set(patch).where(eq(hardwarePrices.id, id)).returning(), 'un herraje');
  const priceChanged = patch.unitPrice !== undefined && patch.unitPrice !== cur.unitPrice;
  await audit(db, a, priceChanged ? 'cambiar_precios' : 'actualizar', 'hardware', id, { code: row!.code });
  return row!;
}

/** JSON-friendly row: Dates → ISO strings; exposes `type` instead of the column names row/typeLabel. */
export function serialize<T extends Record<string, unknown>>(row: T) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = v instanceof Date ? v.toISOString() : v;
  if ('row' in out) {
    out.type = out.row;
    delete out.row;
  }
  if ('typeLabel' in out) {
    out.type = out.typeLabel;
    delete out.typeLabel;
  }
  delete out.organizationId;
  return out;
}
