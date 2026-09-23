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

async function request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'include',
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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
  me: () => request<Me>('GET', '/me'),
  signIn: (email: string, password: string) => request<Me>('POST', '/auth/sign-in', { email, password }),
  signOut: () => request<{ ok: true }>('POST', '/auth/sign-out'),
  forgot: (email: string) => request<{ ok: true }>('POST', '/auth/forgot-password', { email }),
  reset: (token: string, password: string) => request<{ ok: true }>('POST', '/auth/reset-password', { token, password }),
  acceptInvite: (token: string, password: string, name?: string) => request<Me>('POST', '/auth/accept-invite', { token, password, name }),

  listProjects: () => request<{ items: ProjectSummary[]; nextCursor: string | null }>('GET', '/projects?limit=100'),
  createProject: (body: { ptype?: 'cocina' | 'closet' | 'vestidor'; name?: string; data?: ProjectData }) => request<ProjectDetail>('POST', '/projects', body),
  getProject: (id: string) => request<ProjectDetail>('GET', `/projects/${id}`),
  saveProject: (id: string, body: { version: number; name?: string; currency?: Currency; phase?: number; data: ProjectData }) => request<ProjectDetail>('PUT', `/projects/${id}`, body),
  duplicateProject: (id: string) => request<ProjectDetail>('POST', `/projects/${id}/duplicate`),
  deleteProject: (id: string) => request<void>('DELETE', `/projects/${id}`),

  catalog: () => request<Catalog>('GET', '/catalog'),
};
