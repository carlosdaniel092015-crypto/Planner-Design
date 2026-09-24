import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** Public files the planner needs offline (the original prototype and docs stay online-only). */
const OFFLINE_PUBLIC = /^(planner-3d\.js|manifest\.webmanifest|icons\/.*|vendor\/.*\.js|vendor\/lucide\/.*\.(css|woff2)|_ds\/[^/]+\/styles\.css)$/;
/** Cross-origin stylesheets the pages link to (the fonts they pull in are cached at runtime). */
const EXTERNAL = ['https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;800&display=swap'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
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

export default defineConfig({
  root: here('.'),
  plugins: [react(), serviceWorker()],
  resolve: { alias: { '@core': here('../src/core') } },
  build: { outDir: here('../dist/web'), emptyOutDir: true, sourcemap: true },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
});
