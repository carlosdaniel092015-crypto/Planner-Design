import { createRoute, z } from '@hono/zod-openapi';
import { and, desc, eq } from 'drizzle-orm';
import { auditLog, organizations, users } from '../db/schema';
import { audit } from '../lib/audit';
import { unprocessable } from '../lib/errors';
import { authErrors, body, json, router, security } from '../lib/openapi';
import { afterCursor, page, paginationQuery } from '../lib/pagination';
import { assertCan } from '../lib/permissions';
import { requireAuth } from '../services/auth';
import { getFile } from '../services/files';
import { requireFeature } from '../lib/plans';

const DEFAULT_TERMS = 'Acepto la distribución, materiales, medidas y el presupuesto estimado.';

const Org = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    logoUrl: z.string().nullable(),
    brandColor: z.string().nullable(),
    approvalTerms: z.string().openapi({ description: 'Texto que el cliente acepta al aprobar (página pública y PDF).' }),
  })
  .openapi('Organizacion');

const OrgPatch = z
  .object({
    name: z.string().trim().min(1).max(120),
    brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
    logoFileId: z.uuid().nullable().openapi({ description: 'Imagen subida (kind miniatura o render); null quita el logo.' }),
    approvalTerms: z.string().trim().min(1).max(2000),
  })
  .partial()
  .openapi('OrganizacionCambios', { example: { name: 'Muebles Ortega', brandColor: '#1f6f5c' } });

type OrgRow = typeof organizations.$inferSelect;
const orgJson = (o: OrgRow) => ({
  id: o.id,
  name: o.name,
  slug: o.slug,
  logoUrl: o.logoUrl,
  brandColor: o.brandColor,
  approvalTerms: ((o.settings as { aprobacion?: { terminos?: string } }).aprobacion?.terminos ?? DEFAULT_TERMS) as string,
});

export function organizationRoutes() {
  const r = router();
  const tags = ['Organización'];

  r.openapi(createRoute({ method: 'get', path: '/organization', tags, summary: 'Datos de la organización', security, responses: { 200: json(Org), ...authErrors } }), (c) => {
    const a = requireAuth(c);
    return c.json(orgJson(a.org), 200);
  });

  r.openapi(
    createRoute({
      method: 'patch',
      path: '/organization',
      tags,
      summary: 'Nombre, logo, color y términos de aprobación (solo admin)',
      description: 'El logo y el color aparecen en la página de aprobación del cliente y en el PDF.',
      security,
      request: body(OrgPatch),
      responses: { 200: json(Org), ...authErrors },
    }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'org:manage');
      const { db } = c.var.deps;
      const input = c.req.valid('json');
      if (input.logoFileId || input.brandColor) requireFeature(c.var.deps.config, a, 'branding');
      let logoUrl: string | null | undefined;
      if (input.logoFileId === null) logoUrl = null;
      else if (input.logoFileId) {
        const f = await getFile(db, a.org.id, input.logoFileId);
        if (!f.contentType.startsWith('image/')) throw unprocessable('LOGO_INVALIDO', 'El logo debe ser una imagen JPG, PNG o WebP.');
        logoUrl = f.variants.view2k ?? f.blobUrl;
      }
      const settings = input.approvalTerms
        ? { ...a.org.settings, aprobacion: { ...((a.org.settings as { aprobacion?: object }).aprobacion ?? {}), terminos: input.approvalTerms } }
        : undefined;
      const row = await db.transaction(async (tx) => {
        const [o] = await tx
          .update(organizations)
          .set({
            ...(input.name ? { name: input.name } : {}),
            ...(input.brandColor !== undefined ? { brandColor: input.brandColor } : {}),
            ...(logoUrl !== undefined ? { logoUrl } : {}),
            ...(settings ? { settings } : {}),
            updatedAt: new Date(),
          })
          .where(eq(organizations.id, a.org.id))
          .returning();
        const { logoFileId: _l, ...meta } = input;
        await audit(tx, a, 'actualizar', 'organization', a.org.id, { ...meta, ...(logoUrl !== undefined ? { logo: logoUrl ? 'nuevo' : 'quitado' } : {}) });
        return o!;
      });
      return c.json(orgJson(row), 200);
    },
  );

  r.openapi(
    createRoute({
      method: 'get',
      path: '/audit',
      tags,
      summary: 'Registro de auditoría (solo admin)',
      description: 'Quién creó, cambió, envió, aprobó, compartió o cambió precios, del más reciente al más antiguo.',
      security,
      request: { query: z.object({ ...paginationQuery, entity: z.string().max(40).optional() }) },
      responses: {
        200: json(
          z.object({
            items: z.array(
              z.object({ id: z.uuid(), action: z.string(), entity: z.string(), entityId: z.string().nullable(), meta: z.record(z.string(), z.unknown()), userName: z.string().nullable(), createdAt: z.iso.datetime() }),
            ),
            nextCursor: z.string().nullable(),
          }),
        ),
        ...authErrors,
      },
    }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'audit:read');
      requireFeature(c.var.deps.config, a, 'audit');
      const { cursor, limit, entity } = c.req.valid('query');
      const rows = await c.var.deps.db
        .select({ l: auditLog, userName: users.name })
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.userId))
        .where(and(eq(auditLog.organizationId, a.org.id), entity ? eq(auditLog.entity, entity) : undefined, afterCursor(auditLog.createdAt, auditLog.id, cursor)))
        .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
        .limit(limit + 1);
      const p = page(rows, limit, (x) => ({ t: x.l.createdAt, id: x.l.id }));
      return c.json(
        {
          items: p.items.map((x) => ({ id: x.l.id, action: x.l.action, entity: x.l.entity, entityId: x.l.entityId, meta: x.l.meta, userName: x.userName, createdAt: x.l.createdAt.toISOString() })),
          nextCursor: p.nextCursor,
        },
        200,
      );
    },
  );

  return r;
}
