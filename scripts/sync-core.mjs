// Copies src/core from the frontend repository into this one, byte for byte.
// Usage: npm run sync-core [-- <path-to-frontend-repo>]   (or set FRONTEND_REPO_PATH)
//        npm run sync-core -- --check   → exits 1 if both copies differ (for CI).
import { createHash } from 'node:crypto';
import { cp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
const check = args.includes('--check');
const repo = resolve(args.find((a) => !a.startsWith('--')) ?? process.env.FRONTEND_REPO_PATH ?? '../planner-frontend');
const from = join(repo, 'src', 'core');
const to = resolve('src', 'core');

async function files(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await files(p)));
    else out.push(p);
  }
  return out;
}
async function digest(dir) {
  const h = createHash('sha256');
  for (const f of (await files(dir)).sort()) h.update(relative(dir, f).replace(/\\/g, '/')).update(await readFile(f));
  return h.digest('hex');
}

try {
  if (!(await stat(from)).isDirectory()) throw new Error();
} catch {
  console.error(`No se encontró ${from}. Pasa la ruta del repo del frontend o define FRONTEND_REPO_PATH.`);
  process.exit(1);
}

const [a, b] = await Promise.all([digest(from), digest(to).catch(() => '')]);
if (check) {
  if (a !== b) {
    console.error(`src/core difiere del frontend (${from}). Ejecuta: npm run sync-core`);
    process.exit(1);
  }
  console.info('src/core idéntico al del frontend.');
  process.exit(0);
}
if (a === b) {
  console.info('src/core ya estaba sincronizado.');
  process.exit(0);
}
await rm(to, { recursive: true, force: true });
await cp(from, to, { recursive: true });
console.info(`src/core copiado desde ${from} (sha256 ${a.slice(0, 12)}). Corre npm run typecheck && npm test.`);
