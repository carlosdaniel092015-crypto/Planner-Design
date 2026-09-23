import { createRoute, z } from '@hono/zod-openapi';
import { and, desc, eq } from 'drizzle-orm';
import { files } from '../db/schema';
import { audit } from '../lib/audit';
import type { AuthContext } from '../lib/context';
import { authErrors, body, IdParam, json, pick, router, security } from '../lib/openapi';
import { assertCan } from '../lib/permissions';
import { requireAuth } from '../services/auth';
import { checkDeclared, type FileKind, fileJson, getFile, KIND_RULES, pathFor, registerFile } from '../services/files';
import { getProject } from '../services/projects';
import type { DbOrTx } from '../db/client';

const Kind = z.enum(['render', 'pdf', 'dxf', 'csv', 'textura', 'modelo3d', 'hdri', 'miniatura', 'otro']).openapi('TipoArchivo');
const FileSchema = z
  .object({
    id: z.uuid(),
    projectId: z.uuid().nullable(),
    kind: Kind,
    name: z.string(),
    url: z.string(),
    variants: z.object({ thumb: z.string().optional(), view2k: z.string().optional(), original: z.string().optional() }),
    width: z.number().nullable(),
    height: z.number().nullable(),
    contentType: z.string(),
    size: z.number(),
    meta: z.record(z.string(), z.unknown()),
    createdBy: z.uuid().nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi('Archivo');

const tags = ['Archivos'];

/** Files attached to a project follow the project's edit permission; library files need library:write. */
async function assertCanWrite(db: DbOrTx, a: AuthContext, projectId: string | null | undefined, kind: FileKind) {
  if (projectId) {
    const p = await getProject(db, a, projectId);
    assertCan(a.user, 'project:update', { ownerId: p.ownerId, status: p.status === 'aprobado' ? 'diseno' : p.status });
  } else if (kind === 'textura' || kind === 'modelo3d' || kind === 'hdri' || kind === 'miniatura' || kind === 'otro') assertCan(a.user, 'library:write');
  else assertCan(a.user, 'file:write');
}

export function fileRoutes() {
  const r = router();

  r.openapi(
    createRoute({
      method: 'post',
      path: '/files/upload-token',
      tags,
      summary: 'Autorización de subida directa desde el navegador',
      description:
        'Devuelve una autorización firmada de 15 minutos. Con `mode: "local"` (Easypanel) sube los bytes con `PUT uploadUrl` y el `Content-Type` declarado; ' +
        'con `mode: "blob"` usa `put(pathname, file, { token })` de `@vercel/blob/client`. Después registra el archivo con `POST /files`. ' +
        `Límites: ${Object.entries(KIND_RULES)
          .map(([k, v]) => `${k} ${v.maxBytes / 1048576} MB`)
          .join(', ')}.`,
      security,
      request: body(
        z
          .object({ projectId: z.uuid().nullable().optional(), kind: Kind, contentType: z.string().min(3).max(100), size: z.number().int().positive(), name: z.string().max(200).default('archivo') })
          .openapi({ example: { kind: 'textura', contentType: 'image/jpeg', size: 2_400_000, name: 'roble.jpg' } }),
      ),
      responses: {
        200: json(z.object({ mode: z.enum(['blob', 'local']), pathname: z.string(), token: z.string().optional(), uploadUrl: z.string().optional(), expiresAt: z.iso.datetime(), maxBytes: z.number() })),
        ...authErrors,
        ...pick(413, 422),
      },
    }),
    async (c) => {
      const a = requireAuth(c);
      const { db, storage } = c.var.deps;
      const input = c.req.valid('json');
      await assertCanWrite(db, a, input.projectId, input.kind);
      checkDeclared(input.kind, input.contentType, input.size);
      const rule = KIND_RULES[input.kind];
      const grant = await storage.createUploadGrant({
        pathname: pathFor(a.org.id, input.kind, input.name),
        allowedContentTypes: rule.types,
        maximumSizeInBytes: rule.maxBytes,
        validUntil: Date.now() + 15 * 60_000,
      });
      return c.json({ ...grant, maxBytes: rule.maxBytes }, 200);
    },
  );

  r.openapi(
    createRoute({
      method: 'post',
      path: '/files',
      tags,
      summary: 'Registrar un archivo subido',
      description: 'Descarga el archivo, valida su contenido real (encabezado de imagen, GLB, PDF…) y, si es imagen, genera la miniatura de 256 px y el visor de 2K.',
      security,
      request: body(
        z
          .object({ projectId: z.uuid().nullable().optional(), kind: Kind, blobUrl: z.url(), name: z.string().min(1).max(200), size: z.number().int().positive().optional() })
          .openapi({ example: { kind: 'render', projectId: null, blobUrl: 'https://api.tudominio.com/api/v1/storage/…/render.png', name: 'render.png' } }),
      ),
      responses: { 201: json(FileSchema, 'Registrado'), ...authErrors, ...pick(413, 422) },
    }),
    async (c) => {
      const a = requireAuth(c);
      const { db, storage } = c.var.deps;
      const input = c.req.valid('json');
      await assertCanWrite(db, a, input.projectId, input.kind);
      const row = await registerFile(db, storage, a, input);
      await audit(db, a, 'crear', 'file', row.id, { kind: row.kind, size: row.size });
      return c.json(fileJson(row), 201);
    },
  );

  r.openapi(
    createRoute({ method: 'get', path: '/projects/{id}/files', tags, summary: 'Archivos de un proyecto', security, request: { params: IdParam }, responses: { 200: json(z.object({ items: z.array(FileSchema) })), ...authErrors } }),
    async (c) => {
      const a = requireAuth(c);
      const { db } = c.var.deps;
      const p = await getProject(db, a, c.req.valid('param').id);
      const rows = await db.select().from(files).where(and(eq(files.projectId, p.id), eq(files.organizationId, a.org.id))).orderBy(desc(files.createdAt));
      return c.json({ items: rows.map(fileJson) }, 200);
    },
  );

  r.openapi(
    createRoute({ method: 'delete', path: '/files/{id}', tags, summary: 'Eliminar archivo', security, request: { params: IdParam }, responses: { 204: { description: 'Eliminado' }, ...authErrors } }),
    async (c) => {
      const a = requireAuth(c);
      const { db, storage } = c.var.deps;
      const f = await getFile(db, a.org.id, c.req.valid('param').id);
      assertCan(a.user, 'file:delete', { ownerId: f.createdBy });
      await db.transaction(async (tx) => {
        await tx.delete(files).where(eq(files.id, f.id));
        await audit(tx, a, 'eliminar', 'file', f.id, { name: f.name });
      });
      for (const url of new Set([f.blobUrl, ...Object.values(f.variants)])) if (url) await storage.delete(url).catch(() => {});
      return c.body(null, 204);
    },
  );

  return r;
}
