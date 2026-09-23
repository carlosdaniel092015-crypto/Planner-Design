// Shared core — public surface. Keep identical to the frontend's src/core (npm run sync-core).
export * from './types';
export * from './schema';
export * from './materials';
export * from './catalog';
export * from './geometry';
export * from './parts';
export * from './rules';
export * from './cutlist';
export * from './budget';
export * from './drawing';
export * from './iso';
export * from './editing';
export * from './defaults';
export * from './spec';
export * from './autolayout';

/** Bump when the core's public contract changes. */
export const CORE_VERSION = '1.0.0';
