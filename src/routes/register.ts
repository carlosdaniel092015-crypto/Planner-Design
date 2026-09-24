import type { OpenAPIHono } from '@hono/zod-openapi';
import type { AppEnv } from '../lib/context';
import { approvalRoutes, publicRoutes } from './approvals';
import { catalogRoutes } from './catalog';
import { fileRoutes } from './files';
import { libraryRoutes } from './library';
import { pricingRoutes } from './pricing';
import { projectRoutes } from './projects';
import { shareRoutes } from './shares';

/** Mounts the domain routes (projects, catalogue, pricing, files, approvals…). */
export function registerProjectRoutes(v1: OpenAPIHono<AppEnv>) {
  v1.route('/projects', projectRoutes());
  v1.route('/projects', shareRoutes());
  v1.route('/', catalogRoutes());
  v1.route('/', pricingRoutes());
  v1.route('/', fileRoutes());
  v1.route('/library', libraryRoutes());
  v1.route('/', approvalRoutes());
  v1.route('/public', publicRoutes());
}
