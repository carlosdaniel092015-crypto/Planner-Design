import { and, desc, eq, isNull, max } from 'drizzle-orm';
import {
  computeEstimate,
  type Currency,
  type Estimate,
  hasErrors,
  type PricingContext,
  type ProjectData,
  projectDataSchema,
  projectTypeOf,
  validateProject,
  type ValidationIssue,
} from '../core';
import type { DbOrTx } from '../db/client';
import { projects, projectVersions } from '../db/schema';
import type { AuthContext } from '../lib/context';
import { AppError, notFound } from '../lib/errors';
import { can } from '../lib/permissions';
import { isSnapshot, loadPricingContext, type PricingSnapshot, snapshotFor } from './catalog';

export type ProjectRow = typeof projects.$inferSelect;
export type VersionRow = typeof projectVersions.$inferSelect;

export function parseProjectData(raw: unknown): ProjectData {
  const r = projectDataSchema.safeParse(raw);
  if (!r.success)
    throw new AppError(
      400,
      'PROYECTO_INVALIDO',
      'El JSON del proyecto no cumple el esquema.',
      r.error.issues.slice(0, 50).map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  return r.data;
}

/** Loads a project of the caller's organisation. Other orgs, deleted rows and (for taller) non-approved projects → 404. */
export async function getProject(db: DbOrTx, a: AuthContext, id: string): Promise<ProjectRow> {
  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.organizationId, a.org.id), isNull(projects.deletedAt)))
    .limit(1);
  if (!row || !can(a.user, 'project:read', { ownerId: row.ownerId, status: row.status })) throw notFound('El proyecto');
  return row;
}

export async function getVersion(db: DbOrTx, projectId: string, versionId: string): Promise<VersionRow> {
  const [v] = await db
    .select()
    .from(projectVersions)
    .where(and(eq(projectVersions.id, versionId), eq(projectVersions.projectId, projectId)))
    .limit(1);
  if (!v) throw notFound('La versión');
  return v;
}

export const snapshotOf = (v: VersionRow): PricingSnapshot => {
  if (!isSnapshot(v.pricingSnapshot)) throw new Error(`Snapshot de precios dañado en la versión ${v.id}`);
  return v.pricingSnapshot;
};

export interface Derived {
  estimate: Estimate;
  issues: ValidationIssue[];
}

export function derive(data: ProjectData, ctx: PricingContext, currency?: Currency): Derived {
  return { estimate: computeEstimate(data, ctx, currency), issues: validateProject(data, ctx) };
}

/** Pricing context that governs a project: the approved snapshot if approved, else current prices. */
export async function pricingFor(db: DbOrTx, a: AuthContext, row: ProjectRow): Promise<{ ctx: PricingContext; frozen: boolean }> {
  if (row.status === 'aprobado' && row.approvedVersionId) {
    const v = await getVersion(db, row.id, row.approvedVersionId);
    return { ctx: snapshotOf(v), frozen: true };
  }
  return { ctx: await loadPricingContext(db, a.org), frozen: false };
}

/** Values written to the projects row whenever data changes. */
export function rowValuesFrom(data: ProjectData, ctx: PricingContext) {
  const est = computeEstimate(data, ctx);
  return { type: projectTypeOf(data.ptype), estimate: est.total, estimateCurrency: est.currency, moduleCount: data.mods.length };
}

export async function nextVersionNumber(db: DbOrTx, projectId: string) {
  const [r] = await db.select({ n: max(projectVersions.version) }).from(projectVersions).where(eq(projectVersions.projectId, projectId));
  return (r?.n ?? 0) + 1;
}

/** Freezes the project's current data and prices into a new version. */
export async function createVersion(db: DbOrTx, row: ProjectRow, data: ProjectData, ctx: PricingContext, note: string | null, userId: string | null) {
  const est = computeEstimate(data, ctx);
  const [v] = await db
    .insert(projectVersions)
    .values({
      projectId: row.id,
      version: await nextVersionNumber(db, row.id),
      data: data as Record<string, unknown>,
      estimate: est.total,
      estimateCurrency: est.currency,
      pricingSnapshot: snapshotFor(data, ctx) as unknown as Record<string, unknown>,
      createdBy: userId,
      note,
    })
    .returning();
  return v!;
}

export async function listVersions(db: DbOrTx, projectId: string) {
  return db.select().from(projectVersions).where(eq(projectVersions.projectId, projectId)).orderBy(desc(projectVersions.version));
}

export function assertApprovable(issues: ValidationIssue[]) {
  if (hasErrors(issues))
    throw new AppError(
      422,
      'PROYECTO_CON_ERRORES',
      'El proyecto tiene errores de validación y no se puede aprobar.',
      issues.filter((i) => i.st === 'err'),
    );
}
