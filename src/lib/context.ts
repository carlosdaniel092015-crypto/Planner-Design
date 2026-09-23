import type { Db } from '../db/client';
import type { organizations } from '../db/schema';
import type { Mailer } from '../services/mailer';
import type { Storage } from '../services/storage';
import type { AppConfig } from './config';
import type { Role } from './permissions';
import type { RateLimiter } from './rate-limit';

export interface Deps {
  db: Db;
  storage: Storage;
  mailer: Mailer;
  config: AppConfig;
  rateLimiter: RateLimiter;
}

export type Organization = typeof organizations.$inferSelect;

export interface AuthContext {
  user: { id: string; name: string; email: string; role: Role; organizationId: string };
  org: Organization;
  sessionId: string;
}

export type AppEnv = {
  Variables: {
    deps: Deps;
    auth: AuthContext | null;
  };
};
