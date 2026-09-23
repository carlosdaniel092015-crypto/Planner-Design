// Bundles the server and CLI entry points into dist/ (dependencies stay external in node_modules).
import { rm } from 'node:fs/promises';
import { build } from 'esbuild';
import { build as viteBuild } from 'vite';

await rm('dist', { recursive: true, force: true });
await build({
  entryPoints: { server: 'src/server.ts', migrate: 'src/db/migrate.ts', seed: 'src/db/seed.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
});

// Frontend (React) → dist/web, served by the API at /
await viteBuild({ configFile: 'frontend/vite.config.ts', logLevel: 'warn' });
