// Thin client for /api/v1. Session travels in the httpOnly cookie (same origin).
import type { PricingContext, ProjectData } from '@core';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** status 0 = the request never got an answer (offline, DNS, timeout). */
export const isNetworkError = (e: unknown) => e instanceof ApiError && e.status === 0;
/** Worth retrying later: no answer, rate limit or server trouble. */
export const isTransient = (e: unknown) => e instanceof ApiError && (e.status === 0 || e.status === 429 || e.status >= 500);

export async function request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}, timeoutMs = 20_000): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctl.signal,
    });
  } catch {
    throw new ApiError(0, 'SIN_CONEXION', 'Sin conexión con el servidor.');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return undefined as T;
  const data = res.headers.get('content-type')?.includes('json') ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(res.status, e.code ?? 'ERROR', e.message ?? 'No se pudo completar la operación. Inténtalo de nuevo.', e.details);
  }
  return data as T;
}

export type Role = 'admin' | 'disenador' | 'taller' | 'lectura';
export type Currency = 'USD' | 'DOP';
export type Status = 'borrador' | 'diseno' | 'enviado' | 'cambios_solicitados' | 'aprobado';

export interface Me {
  user: { id: string; name: string; email: string; role: Role };
  organization: { id: string; name: string; slug: string; logoUrl: string | null; brandColor: string | null; baseCurrency: Currency };
}

export interface Money {
  amount: number;
  currency: Currency;
  rate: number;
}

export type Access = 'propietario' | 'editar' | 'ver';

export interface Share {
  userId: string;
  name: string;
  email: string;
  role: Role;
  access: 'ver' | 'editar';
  createdAt: string;
}

export interface ProjectVersion {
  id: string;
  version: number;
  note: string | null;
  estimate: Money;
  createdBy: string | null;
  createdByName?: string | null;
  createdAt: string;
}

export interface Person {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface ProjectSummary {
  id: string;
  name: string;
  type: 'cocina' | 'closet';
  status: Status;
  phase: number;
  ownerId: string;
  clientId: string | null;
  currency: Currency;
  estimate: Money;
  moduleCount: number;
  version: number;
  coverUrl: string | null;
  access: Access;
  ownerName: string | null;
  shareCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDetail extends ProjectSummary {
  data: ProjectData;
  discontinued: string[];
  pricesFrozen: boolean;
}

export interface CatalogMaterial {
  id: string;
  code: string;
  name: string;
  type: string;
  color: string;
  kind: string;
  uses: string[];
  grain: string;
  sizeWcm: number | null;
  roughness: number | null;
  source: 'estandar' | 'subido';
  maps: { baseColor: { url: string; thumb: string | null } | null };
}

export interface Catalog {
  modules: Record<string, unknown>[];
  materials: CatalogMaterial[];
  groups: { k: 'cuerpo' | 'frentes' | 'encimera' | 'jaladeras'; label: string }[];
  pricing: { baseCurrency: Currency; exchangeRateDopPerUsd: number; taxName: string; taxRate: number };
  context: PricingContext;
}

export const api = {
  me: (timeoutMs?: number) => request<Me>('GET', '/me', undefined, {}, timeoutMs),
  signIn: (email: string, password: string) => request<Me>('POST', '/auth/sign-in', { email, password }),
  signOut: () => request<{ ok: true }>('POST', '/auth/sign-out'),
  forgot: (email: string) => request<{ ok: true }>('POST', '/auth/forgot-password', { email }),
  reset: (token: string, password: string) => request<{ ok: true }>('POST', '/auth/reset-password', { token, password }),
  acceptInvite: (token: string, password: string, name?: string) => request<Me>('POST', '/auth/accept-invite', { token, password, name }),

  listProjects: (timeoutMs?: number) => request<{ items: ProjectSummary[]; nextCursor: string | null }>('GET', '/projects?limit=100', undefined, {}, timeoutMs),
  createProject: (body: { ptype?: 'cocina' | 'closet' | 'vestidor'; name?: string; data?: ProjectData; currency?: Currency; clientRef?: string }, timeoutMs?: number) =>
    request<ProjectDetail>('POST', '/projects', body, {}, timeoutMs),
  getProject: (id: string, timeoutMs?: number) => request<ProjectDetail>('GET', `/projects/${id}`, undefined, {}, timeoutMs),
  saveProject: (id: string, body: { version: number; name?: string; currency?: Currency; phase?: number; coverUrl?: string | null; data: ProjectData }) =>
    request<ProjectDetail>('PUT', `/projects/${id}`, body),
  duplicateProject: (id: string) => request<ProjectDetail>('POST', `/projects/${id}/duplicate`),
  deleteProject: (id: string) => request<void>('DELETE', `/projects/${id}`),

  versions: (id: string) => request<{ items: ProjectVersion[] }>('GET', `/projects/${id}/versions`),
  createVersion: (id: string, note?: string) => request<ProjectVersion>('POST', `/projects/${id}/versions`, { note }),
  restoreVersion: (id: string, vid: string) => request<ProjectDetail>('POST', `/projects/${id}/versions/${vid}/restore`),

  shares: (id: string) => request<{ owner: { userId: string; name: string; email: string; role: Role } | null; myAccess: Access; items: Share[] }>('GET', `/projects/${id}/shares`),
  share: (id: string, userId: string, access: 'ver' | 'editar') => request<Share>('PUT', `/projects/${id}/shares/${userId}`, { access }),
  unshare: (id: string, userId: string) => request<void>('DELETE', `/projects/${id}/shares/${userId}`),
  directory: () => request<{ items: Person[] }>('GET', '/users/directory'),

  catalog: (timeoutMs?: number) => request<Catalog>('GET', '/catalog', undefined, {}, timeoutMs),

  approvalLinks: (id: string) => request<{ links: ApprovalLink[]; approvals: Approval[] }>('GET', `/projects/${id}/approval-links`),
  sendToClient: (id: string, body: { recipientEmail: string; expiresInDays: number }) => request<{ link: ApprovalLink; url: string; token: string; versionId: string }>('POST', `/projects/${id}/approval-links`, body),
  revokeLink: (linkId: string) => request<ApprovalLink>('POST', `/approval-links/${linkId}/revoke`),
  approveInternal: (id: string, body: { signerName: string; signature?: string }) => request<{ approval: Approval; versionId: string }>('POST', `/projects/${id}/approve-internal`, body),
  publicView: (token: string) => request<PublicView>('GET', `/public/approvals/${token}`),
  publicDecide: (token: string, body: { decision: 'aprobado' | 'cambios'; signerName: string; signerEmail?: string; comment?: string; signature?: string; accepted: true }) =>
    request<{ ok: true; decision: string; approvalId: string }>('POST', `/public/approvals/${token}`, body),
};

export interface ApprovalLink {
  id: string;
  projectId: string;
  versionId: string;
  recipientEmail: string;
  expiresAt: string;
  revokedAt: string | null;
  openedAt: string | null;
  usedAt: string | null;
  createdAt: string;
}

export interface Approval {
  id: string;
  projectId: string;
  versionId: string;
  linkId: string | null;
  decision: 'aprobado' | 'cambios';
  signerName: string;
  signerEmail: string | null;
  comment: string | null;
  snapshotSha256: string;
  signature: string | null;
  createdAt: string;
}

export interface PublicView {
  organization: { name: string; logoUrl: string | null; brandColor: string | null; terms: string };
  project: { name: string; type: string; client: string | null; version: number };
  views: { name: string; url: string; thumb: string | null }[];
  plan: import('@core').Drawing;
  elevations: Record<string, import('@core').Drawing>;
  materials: { code: string; name: string; type: string; color: string | null; groups: string[] }[];
  estimate: Money;
  estimateDetail: import('@core').Estimate;
  pdfUrl: string | null;
  canApprove: boolean;
  expiresAt: string;
  data: ProjectData;
}
