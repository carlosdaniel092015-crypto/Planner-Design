import { createRoute, z } from '@hono/zod-openapi';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { computeEstimate, corte, cutlistCsv, elev, hasErrors, plan, validateProject } from '../core';
import { approvalLinks, approvals, files, organizations } from '../db/schema';
import { MoneySchema } from '../lib/money';
import { authErrors, body, CurrencyQuery, IdParam, json, pick, router, security } from '../lib/openapi';
import { assertCan } from '../lib/permissions';
import { clientIp, rateLimit } from '../lib/rate-limit';
import { approveInternal, createApprovalLink, decidePublic, reopenProject, resolveLink, revokeLink } from '../services/approvals';
import { requireAuth } from '../services/auth';
import { cutlistDxf, slug } from '../services/exports';
import { getProject, parseProjectData, pricingFor, snapshotOf } from '../services/projects';
import { brandingAllowed, requireFeature } from '../lib/plans';

const Link = z
  .object({
    id: z.uuid(),
    projectId: z.uuid(),
    versionId: z.uuid(),
    /** Who it was shared with, as typed (name, phone or email). */
    recipient: z.string(),
    /** @deprecated same as `recipient`. */
    recipientEmail: z.string(),
    expiresAt: z.iso.datetime(),
    revokedAt: z.iso.datetime().nullable(),
    openedAt: z.iso.datetime().nullable(),
    usedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi('EnlaceAprobacion');

/** PNG data URL from the signature pad (≈ 20–80 KB at 470×130). */
const Signature = z.string().max(400_000).regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, 'La firma debe ser una imagen PNG.');

const iso = (d: Date | null) => d?.toISOString() ?? null;
const linkJson = (l: typeof approvalLinks.$inferSelect) => ({
  id: l.id,
  projectId: l.projectId,
  versionId: l.versionId,
  recipient: l.recipientEmail,
  recipientEmail: l.recipientEmail,
  expiresAt: l.expiresAt.toISOString(),
  revokedAt: iso(l.revokedAt),
  openedAt: iso(l.openedAt),
  usedAt: iso(l.usedAt),
  createdAt: l.createdAt.toISOString(),
});

const Approval = z
  .object({
    id: z.uuid(),
    projectId: z.uuid(),
    versionId: z.uuid(),
    linkId: z.uuid().nullable(),
    decision: z.enum(['aprobado', 'cambios']),
    signerName: z.string(),
    signerEmail: z.string().nullable(),
    comment: z.string().nullable(),
    snapshotSha256: z.string(),
    signature: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi('Aprobacion');
const approvalJson = (a: typeof approvals.$inferSelect) => ({
  id: a.id,
  projectId: a.projectId,
  versionId: a.versionId,
  linkId: a.linkId,
  decision: a.decision,
  signerName: a.signerName,
  signerEmail: a.signerEmail,
  comment: a.comment,
  snapshotSha256: a.snapshotSha256,
  signature: a.signaturePng,
  createdAt: a.createdAt.toISOString(),
});

// biome-ignore lint/suspicious/noExplicitAny: works with any route context
const meta = (c: any) => {
  const ip = clientIp(c);
  return { ip: /^[0-9a-f:.]+$/i.test(ip) ? ip : null, userAgent: c.req.header('user-agent') ?? null };
};

const TokenParam = z.object({ token: z.string().min(20).max(100).openapi({ param: { name: 'token', in: 'path' } }) });

export function approvalRoutes() {
  const r = router();
  const tags = ['Aprobación'];

  r.openapi(
    createRoute({
      method: 'post',
      path: '/projects/{id}/approval-links',
      tags,
      summary: 'Enviar al cliente: congela una versión y crea el enlace público para compartir',
      description:
        'Rechaza (422) un proyecto con errores de validación. Crea una versión con snapshot de precios, revoca enlaces anteriores, deja el proyecto en `enviado`, ' +
        'y devuelve la URL pública `/p/:token` para compartirla (WhatsApp o copiar); **no se envía correo**. `recipient` es solo una etiqueta para el historial. **El token en claro solo se devuelve aquí**; en la base se guarda su SHA-256.',
      security,
      request: {
        params: IdParam,
        ...body(
          z
            .object({
              recipient: z.string().trim().max(160).optional(),
              /** @deprecated kept for older app versions; stored as the label, no email is sent. */
              recipientEmail: z.string().trim().max(254).optional(),
              expiresInDays: z.number().int().min(1).max(90).default(14),
            })
            .openapi({ example: { recipient: 'Familia Ortega · 809 555 0101', expiresInDays: 14 } }),
        ),
      },
      responses: {
        201: json(z.object({ link: Link, url: z.string(), token: z.string(), versionId: z.uuid() }), 'Creado'),
        ...authErrors,
        ...pick(409, 422),
      },
    }),
    async (c) => {
      const a = requireAuth(c);
      requireFeature(c.var.deps.config, a, 'clientLinks');
      const { id } = c.req.valid('param');
      const p = await getProject(c.var.deps.db, a, id);
      assertCan(a.user, 'project:send', { access: p.access });
      const input = c.req.valid('json');
      const out = await createApprovalLink(c.var.deps, a, id, input.recipient || input.recipientEmail || 'Cliente', input.expiresInDays);
      return c.json({ link: linkJson(out.link), url: out.url, token: out.token, versionId: out.version.id }, 201);
    },
  );

  r.openapi(
    createRoute({ method: 'get', path: '/projects/{id}/approval-links', tags, summary: 'Enlaces enviados y aprobaciones registradas', security, request: { params: IdParam }, responses: { 200: json(z.object({ links: z.array(Link), approvals: z.array(Approval) })), ...authErrors } }),
    async (c) => {
      const a = requireAuth(c);
      const { db } = c.var.deps;
      const p = await getProject(db, a, c.req.valid('param').id);
      const [links, apps] = await Promise.all([
        db.select().from(approvalLinks).where(eq(approvalLinks.projectId, p.id)).orderBy(desc(approvalLinks.createdAt)),
        db.select().from(approvals).where(eq(approvals.projectId, p.id)).orderBy(desc(approvals.createdAt)),
      ]);
      return c.json({ links: links.map(linkJson), approvals: apps.map(approvalJson) }, 200);
    },
  );

  r.openapi(
    createRoute({ method: 'post', path: '/approval-links/{id}/revoke', tags, summary: 'Revocar un enlace de aprobación', security, request: { params: IdParam }, responses: { 200: json(Link), ...authErrors, ...pick(409) } }),
    async (c) => {
      const a = requireAuth(c);
      const { db } = c.var.deps;
      const [l] = await db.select({ projectId: approvalLinks.projectId }).from(approvalLinks).where(eq(approvalLinks.id, c.req.valid('param').id));
      if (l) {
        const p = await getProject(db, a, l.projectId);
        assertCan(a.user, 'project:send', { access: p.access });
      }
      const { link } = await revokeLink(db, a, c.req.valid('param').id);
      return c.json(linkJson(link), 200);
    },
  );

  r.openapi(
    createRoute({
      method: 'post',
      path: '/projects/{id}/approve-internal',
      tags,
      summary: 'Aprobar internamente (usuario autenticado)',
      description: 'Rechaza (422) si hay errores de validación. Congela versión y precios; el importe ya no cambia con la tasa.',
      security,
      request: { params: IdParam, ...body(z.object({ signerName: z.string().min(1).max(160), signature: Signature.optional() }).openapi({ example: { signerName: 'Familia Ortega (firma en tienda)' } })) },
      responses: { 200: json(z.object({ approval: Approval, versionId: z.uuid() })), ...authErrors, ...pick(409, 422) },
    }),
    async (c) => {
      const a = requireAuth(c);
      const { id } = c.req.valid('param');
      const p = await getProject(c.var.deps.db, a, id);
      assertCan(a.user, 'project:approve', { access: p.access });
      const input = c.req.valid('json');
      const out = await approveInternal(c.var.deps, a, id, input.signerName, meta(c), input.signature);
      return c.json({ approval: approvalJson(out.approval), versionId: out.version.id }, 200);
    },
  );

  r.openapi(
    createRoute({
      method: 'post',
      path: '/projects/{id}/reopen',
      tags,
      summary: 'Reabrir un proyecto aprobado para hacer cambios',
      description:
        'Vuelve a `diseno` con precios vigentes para editarlo y reenviarlo. La aprobación, la firma y la versión congelada quedan en el historial. ' +
        'Pueden hacerlo quienes pueden aprobarlo. 409 si no está aprobado.',
      security,
      request: { params: IdParam, ...body(z.object({ reason: z.string().max(500).optional() })) },
      responses: { 200: json(z.object({ status: z.literal('diseno'), version: z.number() })), ...authErrors, ...pick(409) },
    }),
    async (c) => {
      const a = requireAuth(c);
      const { id } = c.req.valid('param');
      const p = await getProject(c.var.deps.db, a, id);
      assertCan(a.user, 'project:reopen', { access: p.access });
      const row = await reopenProject(c.var.deps.db, a, id, c.req.valid('json').reason);
      return c.json({ status: 'diseno' as const, version: row.version }, 200);
    },
  );

  // ---------- exports ----------
  const exportRoute = (path: string, summary: string, type: string) =>
    createRoute({ method: 'get', path, tags: ['Exportaciones'], summary, security, request: { params: IdParam }, responses: { 200: { description: summary, content: { [type]: { schema: z.string() } } }, ...authErrors } });

  r.openapi(exportRoute('/projects/{id}/cutlist.csv', 'Lista de corte en CSV (compatible con Excel)', 'text/csv'), async (c) => {
    const a = requireAuth(c);
    const { db } = c.var.deps;
    const row = await getProject(db, a, c.req.valid('param').id);
    assertCan(a.user, 'project:export', { access: row.access, status: row.status });
    requireFeature(c.var.deps.config, a, 'exports');
    const { ctx } = await pricingFor(db, a, row);
    const csv = cutlistCsv(corte(parseProjectData(row.data), ctx.materials));
    return c.body(csv, 200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="lista-de-corte-${slug(row.name)}.csv"` });
  });

  r.openapi(exportRoute('/projects/{id}/pieces.dxf', 'Piezas de la lista de corte en DXF (mm)', 'application/dxf'), async (c) => {
    const a = requireAuth(c);
    const { db } = c.var.deps;
    const row = await getProject(db, a, c.req.valid('param').id);
    assertCan(a.user, 'project:export', { access: row.access, status: row.status });
    requireFeature(c.var.deps.config, a, 'exports');
    const { ctx } = await pricingFor(db, a, row);
    const dxf = cutlistDxf(corte(parseProjectData(row.data), ctx.materials), row.name);
    return c.body(dxf, 200, { 'Content-Type': 'application/dxf', 'Content-Disposition': `attachment; filename="piezas-${slug(row.name)}.dxf"` });
  });

  return r;
}

/** Routes without session, keyed by the approval token. */
export function publicRoutes() {
  const r = router();
  const tags = ['Público (sin sesión)'];
  r.use('/approvals/:token', rateLimit({ name: 'public-ip', max: 60, windowMs: 60_000 }));
  r.use('/approvals/:token', rateLimit({ name: 'public-token', max: 30, windowMs: 60_000, key: (c) => c.req.param('token') ?? '' }));

  r.openapi(
    createRoute({
      method: 'get',
      path: '/approvals/{token}',
      tags,
      summary: 'Ver la versión congelada que se envió al cliente',
      description: 'Solo lectura: nombre, cliente, vistas (renders), planta y alzados (JSON para dibujar en SVG), materiales, estimado y PDF. Marca `opened_at`. Enlace caducado, revocado o usado → 410.',
      request: { params: TokenParam, query: CurrencyQuery },
      responses: {
        200: json(
          z.object({
            organization: z.object({ name: z.string(), logoUrl: z.string().nullable(), brandColor: z.string().nullable(), terms: z.string() }),
            project: z.object({ name: z.string(), type: z.string(), client: z.string().nullable(), version: z.number() }),
            views: z.array(z.object({ name: z.string(), url: z.string(), thumb: z.string().nullable() })),
            plan: z.record(z.string(), z.unknown()),
            elevations: z.record(z.string(), z.unknown()),
            materials: z.array(z.record(z.string(), z.unknown())),
            estimate: MoneySchema,
            estimateDetail: z.record(z.string(), z.unknown()),
            pdfUrl: z.string().nullable(),
            canApprove: z.boolean(),
            expiresAt: z.iso.datetime(),
            data: z.record(z.string(), z.unknown()),
          }),
        ),
        ...pick(404, 410, 429),
      },
    }),
    async (c) => {
      const { db } = c.var.deps;
      const { token } = c.req.valid('param');
      const { link, row, version } = await resolveLink(db, token);
      if (!link.openedAt) await db.update(approvalLinks).set({ openedAt: new Date() }).where(and(eq(approvalLinks.id, link.id), isNull(approvalLinks.openedAt)));
      const [org] = await db.select().from(organizations).where(eq(organizations.id, row.organizationId));
      const ctx = snapshotOf(version);
      const data = parseProjectData(version.data);
      const est = computeEstimate(data, ctx, c.req.valid('query').currency);
      const projectFiles = await db.select().from(files).where(eq(files.projectId, row.id)).orderBy(desc(files.createdAt));
      const pdf = projectFiles.find((f) => f.kind === 'pdf');
      const used = new Set([...Object.values(data.mats), ...data.mods.flatMap((m) => [m.cue, m.fre]).filter((x): x is string => !!x)]);
      const settings = (org!.settings ?? {}) as { aprobacion?: { terminos?: string } };
      return c.json(
        {
          organization: {
            name: org!.name,
            // The client page only carries the organisation's branding on plans that include it.
            ...(brandingAllowed(c.var.deps.config, org!) ? { logoUrl: org!.logoUrl, brandColor: org!.brandColor } : { logoUrl: null, brandColor: null }), terms: settings.aprobacion?.terminos ?? 'Acepto la distribución, materiales, medidas y el presupuesto estimado.' },
          project: { name: row.name, type: data.ptype, client: data.client?.nombre ?? null, version: version.version },
          views: projectFiles.filter((f) => f.kind === 'render').map((f) => ({ name: f.name, url: f.variants.view2k ?? f.blobUrl, thumb: f.variants.thumb ?? null })),
          plan: plan(data) as unknown as Record<string, unknown>,
          elevations: Object.fromEntries((['A', 'B', 'C', 'D'] as const).filter((w) => w === 'A' || w === 'B' || data.mods.some((m) => m.wall === w)).map((w) => [w, elev(data, w, ctx.materials)])) as Record<string, unknown>,
          materials: [...used].map((code) => {
            const m = ctx.materials[code];
            return { code, name: m?.name ?? code, type: m?.type ?? '', color: m?.color ?? null, groups: m?.groups ?? [] };
          }),
          estimate: { amount: est.total, currency: est.currency, rate: est.rate },
          estimateDetail: est as unknown as Record<string, unknown>,
          pdfUrl: pdf?.blobUrl ?? null,
          canApprove: !hasErrors(validateProject(data, ctx)),
          expiresAt: link.expiresAt.toISOString(),
          data: version.data,
        },
        200,
      );
    },
  );

  r.openapi(
    createRoute({
      method: 'post',
      path: '/approvals/{token}',
      tags,
      summary: 'Responder: aprobar o solicitar cambios',
      description:
        'Requiere `accepted: true`. Inserta el registro en `approvals` (con IP, navegador y SHA-256 del JSON aprobado), cambia el estado del proyecto y avisa al dueño por correo. ' +
        'El enlace queda usado. Un proyecto con errores de validación no se puede aprobar (422).',
      request: {
        params: TokenParam,
        ...body(
          z
            .object({
              decision: z.enum(['aprobado', 'cambios']),
              signerName: z.string().min(1).max(160),
              signerEmail: z.email().optional(),
              comment: z.string().max(4000).optional(),
              signature: Signature.optional(),
              accepted: z.literal(true, { error: 'Debes aceptar los términos para continuar.' }),
            })
            .openapi({ example: { decision: 'aprobado', signerName: 'María Ortega', signerEmail: 'maria@ejemplo.com', accepted: true } }),
        ),
      },
      responses: { 200: json(z.object({ ok: z.literal(true), decision: z.enum(['aprobado', 'cambios']), approvalId: z.uuid() })), ...pick(400, 404, 410, 422, 429) },
    }),
    async (c) => {
      const { token } = c.req.valid('param');
      const { accepted: _a, ...input } = c.req.valid('json');
      const out = await decidePublic(c.var.deps, token, input, meta(c));
      return c.json({ ok: true as const, decision: out.approval.decision, approvalId: out.approval.id }, 200);
    },
  );

  return r;
}
