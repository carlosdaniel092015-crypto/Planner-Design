import { createRoute, z } from '@hono/zod-openapi';
import { and, asc, eq } from 'drizzle-orm';
import { bodyLimit } from 'hono/body-limit';
import { materials, moduleDefinitions } from '../db/schema';
import { AppError, notFound, unprocessable } from '../lib/errors';
import { authErrors, body, IdParam, json, pick, router, security } from '../lib/openapi';
import { assertCan } from '../lib/permissions';
import { requireAuth } from '../services/auth';
import { serialize, updateMaterial, updateModule } from '../services/catalog-admin';
import { getFile, KIND_RULES } from '../services/files';
import { createLibraryModule, createTexture, LibraryModuleInput, TextureInput, updateLibraryModule, updateTexture } from '../services/library';
import { type ExportItem, exportLibrary, importLibrary } from '../services/library-zip';
import { inspectModel } from '../services/media';
import { materialsWithMaps } from './catalog';

const tags = ['Biblioteca'];
const Any = z.record(z.string(), z.unknown());
const Inspection = z
  .object({
    format: z.enum(['glb', 'gltf']),
    bbox: z.object({ w: z.number(), h: z.number(), d: z.number() }).openapi({ description: 'Tamaño en cm' }),
    unitsGuess: z.enum(['m', 'mm']),
    materials: z.array(z.string()),
    triangles: z.number(),
    textures: z.array(z.object({ name: z.string(), width: z.number().nullable(), height: z.number().nullable(), mimeType: z.string() })),
    warnings: z.array(z.string()),
  })
  .openapi('InspeccionModelo', { example: { format: 'glb', bbox: { w: 70, h: 185, d: 65 }, unitsGuess: 'm', materials: ['Acero', 'Vidrio'], triangles: 48210, textures: [], warnings: [] } });

/**
 * Zod fills `.default()` values for keys the client left out, which in a PATCH would silently reset them
 * (e.g. renaming a texture would also reset its uses and tile size). Keep only the keys actually sent.
 */
// biome-ignore lint/suspicious/noExplicitAny: works with any route context
async function sentOnly<T extends Record<string, unknown>>(c: any, parsed: T): Promise<Partial<T>> {
  const raw = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(parsed).filter(([k]) => k in raw)) as Partial<T>;
}

export function libraryRoutes() {
  const r = router();

  // ---------- textures ----------
  r.openapi(createRoute({ method: 'get', path: '/textures', tags, summary: 'Texturas subidas por la organización', security, responses: { 200: json(z.object({ items: z.array(Any) })), ...authErrors } }), async (c) => {
    const a = requireAuth(c);
    assertCan(a.user, 'library:read');
    const all = await materialsWithMaps(c.var.deps.db, a.org.id, false);
    return c.json({ items: all.filter((m) => m.source === 'subido') }, 200);
  });
  r.openapi(
    createRoute({
      method: 'post',
      path: '/textures',
      tags,
      summary: 'Crear textura con los file_id ya subidos',
      description: 'Valida las imágenes con sharp, genera la miniatura de 256 px y la variante de 2K, calcula el color promedio y crea el material (`source: subido`). Aparece en `GET /catalog`.',
      security,
      request: body(TextureInput),
      responses: { 201: json(Any, 'Creada'), ...authErrors, ...pick(409, 422) },
    }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'library:write');
      const { db, storage } = c.var.deps;
      const row = await db.transaction((tx) => createTexture(tx, storage, a, c.req.valid('json')));
      const [withMaps] = (await materialsWithMaps(db, a.org.id, false)).filter((m) => m.id === row.id);
      return c.json(withMaps ?? serialize(row), 201);
    },
  );
  r.openapi(
    createRoute({ method: 'patch', path: '/textures/{id}', tags, summary: 'Editar textura (incrementa version)', security, request: { params: IdParam, ...body(TextureInput.partial()) }, responses: { 200: json(Any), ...authErrors, ...pick(422) } }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'library:write');
      const { db, storage } = c.var.deps;
      const patch = await sentOnly(c, c.req.valid('json'));
      const row = await db.transaction((tx) => updateTexture(tx, storage, a, c.req.valid('param').id, patch));
      return c.json(serialize(row), 200);
    },
  );
  r.openapi(
    createRoute({ method: 'delete', path: '/textures/{id}', tags, summary: 'Descontinuar textura', security, request: { params: IdParam }, responses: { 204: { description: 'Descontinuada' }, ...authErrors } }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'library:write');
      const { db } = c.var.deps;
      const id = c.req.valid('param').id;
      const [cur] = await db.select({ id: materials.id, source: materials.source }).from(materials).where(and(eq(materials.id, id), eq(materials.organizationId, a.org.id)));
      if (!cur || cur.source !== 'subido') throw notFound('La textura');
      await db.transaction((tx) => updateMaterial(tx, a, id, { active: false }));
      return c.body(null, 204);
    },
  );

  // ---------- modules ----------
  r.openapi(createRoute({ method: 'get', path: '/modules', tags, summary: 'Módulos de la biblioteca (incluye inactivos)', security, responses: { 200: json(z.object({ items: z.array(Any) })), ...authErrors } }), async (c) => {
    const a = requireAuth(c);
    assertCan(a.user, 'library:read');
    const rows = await c.var.deps.db.select().from(moduleDefinitions).where(eq(moduleDefinitions.organizationId, a.org.id)).orderBy(asc(moduleDefinitions.sort), asc(moduleDefinitions.code));
    return c.json({ items: rows.map(serialize) }, 200);
  });
  r.openapi(
    createRoute({
      method: 'post',
      path: '/modules',
      tags,
      summary: 'Crear módulo paramétrico o desde un modelo 3D',
      description:
        'Paramétrico: valida la receta (`recipe.fr`) con el esquema de src/core. Modelo 3D: valida el GLB con gltf-transform, toma sus medidas del bounding box y devuelve los nombres de sus materiales para mapear las ranuras (`materialSlots`).',
      security,
      request: body(LibraryModuleInput),
      responses: { 201: json(z.object({ module: Any, model: Inspection.nullable() }), 'Creado'), ...authErrors, ...pick(409, 422) },
    }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'library:write');
      const { db, storage } = c.var.deps;
      const out = await db.transaction((tx) => createLibraryModule(tx, storage, a, c.req.valid('json')));
      return c.json({ module: serialize(out.module), model: out.model }, 201);
    },
  );
  r.openapi(
    createRoute({ method: 'patch', path: '/modules/{id}', tags, summary: 'Editar módulo (incrementa version)', security, request: { params: IdParam, ...body(LibraryModuleInput.partial()) }, responses: { 200: json(z.object({ module: Any, model: Inspection.nullable() })), ...authErrors, ...pick(409, 422) } }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'library:write');
      const { db, storage } = c.var.deps;
      const patch = await sentOnly(c, c.req.valid('json'));
      const out = await db.transaction((tx) => updateLibraryModule(tx, storage, a, c.req.valid('param').id, patch));
      return c.json({ module: serialize(out.module), model: out.model }, 200);
    },
  );
  r.openapi(
    createRoute({ method: 'delete', path: '/modules/{id}', tags, summary: 'Descontinuar módulo', security, request: { params: IdParam }, responses: { 204: { description: 'Descontinuado' }, ...authErrors } }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'library:write');
      await c.var.deps.db.transaction((tx) => updateModule(tx, a, c.req.valid('param').id, { active: false }));
      return c.body(null, 204);
    },
  );

  // ---------- model inspection ----------
  r.openapi(
    createRoute({
      method: 'post',
      path: '/models/inspect',
      tags,
      summary: 'Inspeccionar un GLB/glTF subido',
      description: 'Bounding box en cm, nombres de materiales, triángulos y advertencias (más de 300 mil triángulos o texturas de más de 4K). Un archivo no válido responde 422.',
      security,
      request: body(z.object({ fileId: z.uuid() })),
      responses: { 200: json(Inspection), ...authErrors, ...pick(422) },
    }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'library:read');
      const { db, storage } = c.var.deps;
      const f = await getFile(db, a.org.id, c.req.valid('json').fileId);
      if (f.kind !== 'modelo3d') throw unprocessable('ARCHIVO_NO_ES_MODELO', 'El archivo no se subió como modelo 3D.');
      return c.json(await inspectModel(await storage.get(f.blobUrl)), 200);
    },
  );

  // ---------- import / export ----------
  r.use(
    '/import',
    bodyLimit({
      maxSize: KIND_RULES.otro.maxBytes,
      onError: () => {
        throw new AppError(413, 'ARCHIVO_DEMASIADO_GRANDE', `El ZIP supera el máximo de ${KIND_RULES.otro.maxBytes / 1048576} MB.`);
      },
    }),
  );
  r.openapi(
    createRoute({
      method: 'post',
      path: '/import',
      tags,
      summary: 'Importar biblioteca desde un ZIP con manifest.json',
      description: 'Envía el ZIP como `multipart/form-data` (campo `file`) o como JSON `{ fileId }` de un archivo `otro` ya subido. Devuelve el informe de creados, actualizados y con error.',
      security,
      request: {
        body: {
          content: {
            'multipart/form-data': { schema: z.object({ file: z.any().openapi({ type: 'string', format: 'binary' }) }) },
            'application/json': { schema: z.object({ fileId: z.uuid() }) },
          },
        },
      },
      responses: {
        200: json(
          z.object({
            created: z.array(z.object({ type: z.string(), code: z.string() })),
            updated: z.array(z.object({ type: z.string(), code: z.string() })),
            errors: z.array(z.object({ type: z.string(), code: z.string(), message: z.string() })),
          }),
        ),
        ...authErrors,
        ...pick(413, 422),
      },
    }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'library:write');
      const { db, storage } = c.var.deps;
      let zip: Uint8Array;
      if ((c.req.header('content-type') ?? '').includes('multipart/form-data')) {
        const form = await c.req.formData();
        const file = form.get('file');
        if (!file || typeof file === 'string') throw unprocessable('FALTA_ARCHIVO', 'Envía el ZIP en el campo "file".');
        zip = new Uint8Array(await file.arrayBuffer());
      } else {
        const { fileId } = z.object({ fileId: z.uuid() }).parse(await c.req.json());
        zip = await storage.get((await getFile(db, a.org.id, fileId)).blobUrl);
      }
      return c.json(await importLibrary(db, storage, a, zip), 200);
    },
  );

  r.openapi(
    createRoute({
      method: 'get',
      path: '/export',
      tags,
      summary: 'Exportar biblioteca a ZIP',
      description: '`items` = `textures`, `modules` o ambos separados por coma (por defecto ambos). El ZIP incluye manifest.json y los archivos originales.',
      security,
      request: { query: z.object({ items: z.string().optional().openapi({ example: 'textures,modules' }) }) },
      responses: { 200: { description: 'ZIP', content: { 'application/zip': { schema: z.any().openapi({ type: 'string', format: 'binary' }) } } }, ...authErrors },
    }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'library:read');
      const raw = (c.req.valid('query').items ?? 'textures,modules').split(',').map((s) => s.trim());
      const items = raw.filter((x): x is ExportItem => x === 'textures' || x === 'modules');
      if (!items.length) throw unprocessable('ITEMS_INVALIDOS', 'items debe incluir "textures" y/o "modules".');
      const zip = await exportLibrary(c.var.deps.db, c.var.deps.storage, a.org.id, items);
      const date = new Date().toISOString().slice(0, 10);
      return c.body(zip as Uint8Array<ArrayBuffer>, 200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="biblioteca-${a.org.slug}-${date}.zip"`,
      });
    },
  );

  return r;
}
