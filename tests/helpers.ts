import { resolve } from 'node:path';
import { createApp } from '../src/app';
import { connect, type DbHandle } from '../src/db/client';
import { users } from '../src/db/schema';
import { seedOrganization } from '../src/db/seed-lib';
import { loadConfig } from '../src/lib/config';
import type { Role } from '../src/lib/permissions';
import { createSession, hashPassword } from '../src/services/auth';
import { memoryMailer } from '../src/services/mailer';
import { memoryStorage } from '../src/services/storage';
import type { OAuthRuntime } from '../src/services/oauth';
import { userCredentials } from '../src/db/schema';

export const API = 'http://localhost:3000';
export const FRONT = 'http://localhost:5173';

export interface TestUser {
  id: string;
  email: string;
  token: string;
  role: Role;
  orgId: string;
}

export async function setup(opts: { env?: Record<string, string>; oauth?: OAuthRuntime } = {}) {
  const handle: DbHandle = await connect('pglite://memory');
  await handle.migrate(resolve('drizzle'));
  const config = { ...loadConfig({ NODE_ENV: 'test', API_URL: API, FRONTEND_URL: FRONT, ...opts.env }) };
  const storage = memoryStorage(API, config.authSecret);
  const mailer = memoryMailer();
  const app = createApp({ db: handle.db, storage, mailer, config, oauth: opts.oauth });

  const a = await seedOrganization(handle.db, { orgName: 'Org A', slug: 'org-a', admin: { name: 'Admin A', email: 'admin@a.test', password: 'clave-segura-123' } });
  const b = await seedOrganization(handle.db, { orgName: 'Org B', slug: 'org-b', admin: { name: 'Admin B', email: 'admin@b.test', password: 'clave-segura-123' } });

  const login = async (userId: string) => (await createSession(handle.db, userId, 1, {})).token;

  const makeUser = async (orgId: string, role: Role, email: string): Promise<TestUser> => {
    const [u] = await handle.db.insert(users).values({ organizationId: orgId, name: `${role} ${email}`, email, role }).returning();
    await handle.db.insert(userCredentials).values({ userId: u!.id, passwordHash: await hashPassword('clave-segura-123') });
    return { id: u!.id, email, role, orgId, token: await login(u!.id) };
  };

  const adminA: TestUser = { id: a.admin.id, email: a.admin.email, role: 'admin', orgId: a.org.id, token: await login(a.admin.id) };
  const adminB: TestUser = { id: b.admin.id, email: b.admin.email, role: 'admin', orgId: b.org.id, token: await login(b.admin.id) };

  /** Minimal fetch wrapper: JSON in/out, bearer auth. */
  const req = async (method: string, path: string, opts: { user?: TestUser; body?: unknown; headers?: Record<string, string>; raw?: Uint8Array | string } = {}) => {
    const headers: Record<string, string> = { ...opts.headers };
    if (opts.user) headers.authorization = `Bearer ${opts.user.token}`;
    let body: Uint8Array | string | undefined = opts.raw;
    if (opts.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    const res = await app.request(path.startsWith('http') ? path : `/api/v1${path}`, { method, headers, body });
    const type = res.headers.get('content-type') ?? '';
    const data: any = type.includes('json') ? await res.json() : type.startsWith('text/') ? await res.text() : new Uint8Array(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  };

  return { app, handle, db: handle.db, storage, mailer, config, orgA: a.org, orgB: b.org, adminA, adminB, makeUser, req, close: () => handle.close() };
}

export type Ctx = Awaited<ReturnType<typeof setup>>;
