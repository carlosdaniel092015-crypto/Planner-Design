import { and, count, eq, isNull, ne, notLike } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { projects, users } from '../db/schema';
import type { AppConfig } from './config';
import type { AuthContext } from './context';
import { AppError } from './errors';

export type Plan = 'gratis' | 'profesional' | 'empresa';
export type Feature = 'clientLinks' | 'branding' | 'exports' | 'audit' | 'bulkPrices';

export interface PlanDef {
  name: string;
  /** null = unlimited */
  users: number | null;
  activeProjects: number | null;
  features: Feature[];
  highlights: string[];
}

export const PLANS: Record<Plan, PlanDef> = {
  gratis: {
    name: 'Gratis',
    users: 2,
    activeProjects: 5,
    features: [],
    highlights: ['2 usuarios', '5 proyectos activos', 'Editor 3D, asistente y presupuesto', 'Aprobación interna y PDF', 'Funciona sin conexión'],
  },
  profesional: {
    name: 'Profesional',
    users: 10,
    activeProjects: null,
    features: ['clientLinks', 'branding', 'exports'],
    highlights: ['10 usuarios', 'Proyectos ilimitados', 'Aprobación del cliente por enlace con firma', 'Tu logo y color en el PDF y la página del cliente', 'Lista de corte CSV y piezas DXF'],
  },
  empresa: {
    name: 'Empresa',
    users: null,
    activeProjects: null,
    features: ['clientLinks', 'branding', 'exports', 'audit', 'bulkPrices'],
    highlights: ['Usuarios ilimitados', 'Todo lo de Profesional', 'Auditoría completa', 'Ajuste masivo de precios', 'Soporte prioritario'],
  },
};

const FEATURE: Record<Feature, string> = {
  clientLinks: 'Enviar al cliente por enlace',
  branding: 'Usar tu logo y color',
  exports: 'Exportar lista de corte y piezas',
  audit: 'La auditoría',
  bulkPrices: 'El ajuste masivo de precios',
};

/** Plan limits only apply when billing is configured; a self-hosted install without Stripe has everything. */
export const billingOn = (config: AppConfig) => !!config.billing;
/** A lapsed subscription (past due, canceled…) falls back to the free plan's limits. */
export function effectivePlan(org: { plan: Plan; planStatus: string | null }): Plan {
  if (org.plan === 'gratis') return 'gratis';
  if (org.planStatus && !['active', 'trialing'].includes(org.planStatus) && org.planStatus !== 'manual') return 'gratis';
  return org.plan;
}

const planError = (message: string) => new AppError(402, 'PLAN_REQUERIDO', `${message} Mejora el plan en Administración → Plan.`);

export function requireFeature(config: AppConfig, a: AuthContext, feature: Feature) {
  if (!billingOn(config)) return;
  const plan = effectivePlan(a.org);
  if (!PLANS[plan].features.includes(feature)) throw planError(`${FEATURE[feature]} no está incluido en el plan ${PLANS[plan].name}.`);
}

export const brandingAllowed = (config: AppConfig, org: { plan: Plan; planStatus: string | null }) =>
  !billingOn(config) || PLANS[effectivePlan(org)].features.includes('branding');

export async function usage(db: DbOrTx, orgId: string) {
  const [u] = await db.select({ n: count() }).from(users).where(and(eq(users.organizationId, orgId), notLike(users.email, 'eliminada+%@planner.invalid')));
  const [p] = await db
    .select({ n: count() })
    .from(projects)
    .where(and(eq(projects.organizationId, orgId), isNull(projects.deletedAt), ne(projects.status, 'aprobado')));
  return { users: u?.n ?? 0, activeProjects: p?.n ?? 0 };
}

/** Throws 402 before creating a user or a project past the plan's limit. */
export async function requireRoom(db: DbOrTx, config: AppConfig, a: AuthContext, what: 'users' | 'activeProjects') {
  if (!billingOn(config)) return;
  const def = PLANS[effectivePlan(a.org)];
  const limit = def[what];
  if (limit == null) return;
  const used = (await usage(db, a.org.id))[what];
  if (used >= limit)
    throw planError(what === 'users' ? `El plan ${def.name} permite ${limit} usuarios.` : `El plan ${def.name} permite ${limit} proyectos activos (los aprobados no cuentan).`);
}
