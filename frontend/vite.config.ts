import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** Public files the planner needs offline (the original prototype and docs stay online-only). */
const OFFLINE_PUBLIC = /^(manifest\.webmanifest|icons\/.*|screenshots\/.*|vendor\/.*\.js|vendor\/lucide\/.*\.(css|woff2)|_ds\/[^/]+\/styles\.css)$/;
/** Cross-origin stylesheets the pages link to (the fonts they pull in are cached at runtime). */
const EXTERNAL = ['https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;800&display=swap'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/**
 * The 3D engine is plain JS in public/, loaded at runtime. It is published under a name that changes with its
 * contents: while a new service worker waits, the old one still answers unchanged URLs from its cache, and the
 * new pages would run the old engine.
 */
const RENDERER_SRC = readFileSync(here('public/planner-3d.js'));
const RENDERER_FILE = `planner-3d.${createHash('sha256').update(RENDERER_SRC).digest('hex').slice(0, 10)}.js`;
function renderer(): Plugin {
  return {
    name: 'planner-renderer',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: RENDERER_FILE, source: RENDERER_SRC });
    },
  };
}

/** Emits sw.js with the list of files to precache baked in (see frontend/sw.js). */
function serviceWorker(): Plugin {
  return {
    name: 'planner-sw',
    apply: 'build',
    enforce: 'post',
    generateBundle(_opts, bundle) {
      const hash = createHash('sha256');
      const files = ['/', '/index.html'];
      for (const [name, chunk] of Object.entries(bundle)) {
        if (name.endsWith('.map') || name === 'index.html') continue;
        files.push(`/${name}`);
        hash.update(name);
        hash.update(chunk.type === 'chunk' ? chunk.code : chunk.source);
      }
      const pub = here('public');
      for (const p of walk(pub)) {
        const rel = relative(pub, p).split('\\').join('/');
        if (!OFFLINE_PUBLIC.test(rel)) continue;
        files.push(`/${rel}`);
        hash.update(rel);
        hash.update(readFileSync(p));
      }
      const html = bundle['index.html'];
      if (html?.type === 'asset') hash.update(html.source);
      const precache = { version: hash.digest('hex').slice(0, 16), files, external: EXTERNAL };
      const src = readFileSync(here('sw.js'), 'utf8').replace('self.__PRECACHE__', JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: src });
    },
  };
}

const pkg = JSON.parse(readFileSync(here('../package.json'), 'utf8')) as { version: string };

export default defineConfig(({ command }) => ({
  root: here('.'),
  // Shown in the account menu ("Planner v1.0.0") and compared with /api/v1/version.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILT_AT__: JSON.stringify(new Date().toISOString()),
    __RENDERER_URL__: JSON.stringify(command === 'build' ? `/${RENDERER_FILE}` : '/planner-3d.js'),
  },
  plugins: [react(), renderer(), serviceWorker()],
  resolve: { alias: { '@core': here('../src/core') } },
  build: { outDir: here('../dist/web'), emptyOutDir: true, sourcemap: true },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
}));
