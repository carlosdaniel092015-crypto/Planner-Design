import { and, eq, gt, isNull } from 'drizzle-orm';
import { validateProject } from '../core';
import type { Db, DbOrTx } from '../db/client';
import { approvalLinks, approvals, projects, users } from '../db/schema';
import { audit } from '../lib/audit';
import type { AuthContext, Deps } from '../lib/context';
import { canonicalJson, randomToken, sha256 } from '../lib/crypto';
import { conflict, gone, notFound } from '../lib/errors';
import { loadPricingContext } from './catalog';
import { templates, trySend } from './mailer';
import { assertApprovable, createVersion, getProject, getVersion, parseProjectData, type ProjectRow, snapshotOf, type VersionRow } from './projects';

export type LinkRow = typeof approvalLinks.$inferSelect;

export const snapshotHash = (data: unknown) => sha256(canonicalJson(data));

export async function createApprovalLink(deps: Deps, a: AuthContext, projectId: string, recipientEmail: string, expiresInDays: number) {
  const { db, mailer, config } = deps;
  const out = await db.transaction(async (tx) => {
    const row = await getProject(tx, a, projectId);
    if (row.status === 'aprobado') throw conflict('PROYECTO_APROBADO', 'El proyecto ya está aprobado.');
    const data = parseProjectData(row.data);
    const ctx = await loadPricingContext(tx, a.org);
    assertApprovable(validateProject(data, ctx));
    const version = await createVersion(tx, row, data, ctx, `Enviado a ${recipientEmail}`, a.user.id);
    // Only one live offer per project: older links stop working.
    await tx
      .update(approvalLinks)
      .set({ revokedAt: new Date() })
      .where(and(eq(approvalLinks.projectId, row.id), isNull(approvalLinks.revokedAt), isNull(approvalLinks.usedAt)));
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000);
    const [link] = await tx
      .insert(approvalLinks)
      .values({ projectId: row.id, versionId: version.id, tokenHash: sha256(token), recipientEmail, expiresAt, createdBy: a.user.id })
      .returning();
    await tx.update(projects).set({ status: 'enviado' }).where(eq(projects.id, row.id));
    await audit(tx, a, 'enviar', 'project', row.id, { linkId: link!.id, versionId: version.id, recipientEmail });
    return { row, link: link!, version, token };
  });
  const url = `${config.frontendUrl}/p/${out.token}`;
  const emailSent = await trySend(mailer, { to: recipientEmail, fromName: a.org.name, replyTo: a.user.email, ...templates.approvalRequest({ orgName: a.org.name, projectName: out.row.name, url, expiresAt: out.link.expiresAt }) });
  return { link: out.link, version: out.version, token: out.token, url, emailSent };
}

export async function revokeLink(db: Db, a: AuthContext, linkId: string) {
  return db.transaction(async (tx) => {
    const [link] = await tx.select().from(approvalLinks).where(eq(approvalLinks.id, linkId)).limit(1);
    if (!link) throw notFound('El enlace');
    const row = await getProject(tx, a, link.projectId); // 404 for other orgs
    if (link.usedAt) throw conflict('ENLACE_USADO', 'El enlace ya se usó; no se puede revocar.');
    const [upd] = await tx.update(approvalLinks).set({ revokedAt: link.revokedAt ?? new Date() }).where(eq(approvalLinks.id, link.id)).returning();
    const live = await tx
      .select({ id: approvalLinks.id })
      .from(approvalLinks)
      .where(and(eq(approvalLinks.projectId, row.id), isNull(approvalLinks.revokedAt), isNull(approvalLinks.usedAt), gt(approvalLinks.expiresAt, new Date())));
    if (!live.length && row.status === 'enviado') await tx.update(projects).set({ status: 'diseno' }).where(eq(projects.id, row.id));
    await audit(tx, a, 'revocar', 'approval_link', link.id, { projectId: row.id });
    return { row, link: upd! };
  });
}

async function markApproved(tx: DbOrTx, row: ProjectRow, version: VersionRow) {
  await tx
    .update(projects)
    .set({ status: 'aprobado', approvedVersionId: version.id, data: version.data, estimate: version.estimate, estimateCurrency: version.estimateCurrency, version: row.version + 1 })
    .where(eq(projects.id, row.id));
}

async function notifyOwner(deps: Deps, row: ProjectRow, p: { decision: 'aprobado' | 'cambios'; signerName: string; comment?: string | null }) {
  const [owner] = await deps.db.select({ email: users.email }).from(users).where(eq(users.id, row.ownerId));
  if (!owner) return;
  await trySend(deps.mailer, {
    to: owner.email,
    ...templates.approvalResult({ projectName: row.name, decision: p.decision, signerName: p.signerName, comment: p.comment, url: `${deps.config.frontendUrl}/proyectos/${row.id}` }),
  });
}

export async function approveInternal(deps: Deps, a: AuthContext, projectId: string, signerName: string, meta: { ip: string | null; userAgent: string | null }, signaturePng?: string) {
  const out = await deps.db.transaction(async (tx) => {
    const row = await getProject(tx, a, projectId);
    if (row.status === 'aprobado') throw conflict('PROYECTO_APROBADO', 'El proyecto ya está aprobado.');
    const data = parseProjectData(row.data);
    const ctx = await loadPricingContext(tx, a.org);
    assertApprovable(validateProject(data, ctx));
    const version = await createVersion(tx, row, data, ctx, `Aprobado internamente por ${signerName}`, a.user.id);
    const [approval] = await tx
      .insert(approvals)
      .values({
        projectId: row.id,
        versionId: version.id,
        linkId: null,
        decision: 'aprobado',
        signerName,
        signerEmail: a.user.email,
        signaturePng: signaturePng ?? null,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 300),
        snapshotSha256: snapshotHash(version.data),
      })
      .returning();
    await markApproved(tx, row, version);
    // Links already sent to the client can no longer change the decision.
    await tx
      .update(approvalLinks)
      .set({ revokedAt: new Date() })
      .where(and(eq(approvalLinks.projectId, row.id), isNull(approvalLinks.revokedAt), isNull(approvalLinks.usedAt)));
    await audit(tx, a, 'aprobar', 'project', row.id, { approvalId: approval!.id, versionId: version.id, internal: true });
    return { row, version, approval: approval! };
  });
  await notifyOwner(deps, out.row, { decision: 'aprobado', signerName });
  return out;
}

/**
 * Reopens an approved project for changes: back to `diseno` with live prices. The approval, its signature and the
 * frozen version stay in the history (approvals are append-only); sending or approving again creates a new version.
 */
export async function reopenProject(db: Db, a: AuthContext, projectId: string, reason?: string) {
  return db.transaction(async (tx) => {
    const row = await getProject(tx, a, projectId);
    if (row.status !== 'aprobado') throw conflict('PROYECTO_NO_APROBADO', 'El proyecto no está aprobado.');
    const [upd] = await tx
      .update(projects)
      .set({ status: 'diseno', approvedVersionId: null, version: row.version + 1 })
      .where(eq(projects.id, row.id))
      .returning();
    await audit(tx, a, 'reabrir', 'project', row.id, { versionAprobada: row.approvedVersionId, ...(reason ? { motivo: reason } : {}) });
    return upd!;
  });
}

// ---------- public (token) ----------
export async function resolveLink(db: DbOrTx, token: string) {
  const [link] = await db.select().from(approvalLinks).where(eq(approvalLinks.tokenHash, sha256(token))).limit(1);
  if (!link) throw notFound('El enlace de aprobación');
  if (link.revokedAt) throw gone('ENLACE_REVOCADO', 'Este enlace fue revocado. Pide a tu diseñador un enlace nuevo.');
  if (link.usedAt) throw gone('ENLACE_USADO', 'Este enlace ya se usó para responder. Si necesitas hacer otro cambio, contacta a tu diseñador.');
  if (link.expiresAt.getTime() <= Date.now()) throw gone('ENLACE_CADUCADO', 'Este enlace caducó. Pide a tu diseñador un enlace nuevo.');
  const [row] = await db.select().from(projects).where(and(eq(projects.id, link.projectId), isNull(projects.deletedAt))).limit(1);
  if (!row) throw gone('PROYECTO_NO_DISPONIBLE', 'El proyecto ya no está disponible.');
  if (row.status === 'aprobado') throw gone('PROYECTO_APROBADO', 'Este proyecto ya fue aprobado. Si necesitas otro cambio, contacta a tu diseñador.');
  const version = await getVersion(db, row.id, link.versionId);
  return { link, row, version };
}

export async function decidePublic(
  deps: Deps,
  token: string,
  input: { decision: 'aprobado' | 'cambios'; signerName: string; signerEmail?: string; comment?: string; signature?: string },
  meta: { ip: string | null; userAgent: string | null },
) {
  const out = await deps.db.transaction(async (tx) => {
    const { link, row, version } = await resolveLink(tx, token);
    const data = parseProjectData(version.data);
    if (input.decision === 'aprobado') assertApprovable(validateProject(data, snapshotOf(version)));
    // Claim the link atomically so two submissions can't both succeed.
    const [claimed] = await tx
      .update(approvalLinks)
      .set({ usedAt: new Date(), openedAt: link.openedAt ?? new Date() })
      .where(and(eq(approvalLinks.id, link.id), isNull(approvalLinks.usedAt), isNull(approvalLinks.revokedAt)))
      .returning();
    if (!claimed) throw gone('ENLACE_USADO', 'Este enlace ya se usó para responder.');
    const [approval] = await tx
      .insert(approvals)
      .values({
        projectId: row.id,
        versionId: version.id,
        linkId: link.id,
        decision: input.decision,
        signerName: input.signerName,
        signerEmail: input.signerEmail ?? link.recipientEmail,
        comment: input.comment ?? null,
        signaturePng: input.signature ?? null,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 300),
        snapshotSha256: snapshotHash(version.data),
      })
      .returning();
    if (input.decision === 'aprobado') await markApproved(tx, row, version);
    else await tx.update(projects).set({ status: 'cambios_solicitados' }).where(eq(projects.id, row.id));
    await audit(tx, { organizationId: row.organizationId, userId: null }, input.decision === 'aprobado' ? 'aprobar' : 'solicitar_cambios', 'project', row.id, {
      approvalId: approval!.id,
      linkId: link.id,
      signerName: input.signerName,
    });
    return { row, approval: approval! };
  });
  await notifyOwner(deps, out.row, { decision: input.decision, signerName: input.signerName, comment: input.comment });
  return out;
}
