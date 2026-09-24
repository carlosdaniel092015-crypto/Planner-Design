// Logical backups: every table as JSON (gzip), portable across Postgres versions and PGlite, no pg_dump needed.
// Restore goes into an empty, migrated database, parents before children.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { eq, getTableName, is } from 'drizzle-orm';
import { getTableConfig, PgTable, PgTimestamp } from 'drizzle-orm/pg-core';
import type { DbOrTx } from './client';
import * as schema from './schema';

export interface BackupFile {
  format: 'planner-backup';
  version: 1;
  createdAt: string;
  tables: Record<string, Record<string, unknown>[]>;
}

const tables = (Object.values(schema) as unknown[]).filter((t): t is PgTable => is(t, PgTable));

/** Parents first (topological order over foreign keys), so a restore never violates a reference. */
function ordered(): PgTable[] {
  const byName = new Map(tables.map((t) => [getTableName(t), t]));
  const deps = new Map(tables.map((t) => [getTableName(t), new Set(getTableConfig(t).foreignKeys.map((fk) => getTableName(fk.reference().foreignTable)).filter((n) => n !== getTableName(t)))]));
  const out: PgTable[] = [];
  const seen = new Set<string>();
  const visit = (n: string) => {
    if (seen.has(n)) return;
    seen.add(n);
    for (const d of deps.get(n) ?? []) visit(d);
    out.push(byName.get(n)!);
  };
  for (const n of byName.keys()) visit(n);
  return out;
}

export async function dumpDatabase(db: DbOrTx): Promise<BackupFile> {
  const out: BackupFile = { format: 'planner-backup', version: 1, createdAt: new Date().toISOString(), tables: {} };
  for (const t of ordered()) out.tables[getTableName(t)] = (await db.select().from(t)) as Record<string, unknown>[];
  return out;
}

/** Inserts a backup into an empty database that already has the migrations applied. */
export async function restoreDatabase(db: DbOrTx, backup: BackupFile) {
  if (backup.format !== 'planner-backup') throw new Error('El archivo no es un respaldo de Planner.');
  const counts: Record<string, number> = {};
  const deferred: { id: unknown; approvedVersionId: unknown }[] = [];
  for (const t of ordered()) {
    const name = getTableName(t);
    const cols = getTableConfig(t).columns;
    const dates = Object.entries(t).filter(([, c]) => cols.includes(c as never) && is(c, PgTimestamp)).map(([k]) => k);
    let rows = (backup.tables[name] ?? []).map((r) => {
      const row = { ...r };
      for (const k of dates) if (typeof row[k] === 'string') row[k] = new Date(row[k] as string);
      return row;
    });
    // projects ↔ project_versions reference each other: insert projects without the approved version, then set it.
    if (name === 'projects') {
      for (const r of rows) if (r.approvedVersionId) deferred.push({ id: r.id, approvedVersionId: r.approvedVersionId });
      rows = rows.map((r) => ({ ...r, approvedVersionId: null }));
    }
    for (let i = 0; i < rows.length; i += 500) await db.insert(t).values(rows.slice(i, i + 500) as never);
    counts[name] = rows.length;
  }
  for (const d of deferred) await db.update(schema.projects).set({ approvedVersionId: d.approvedVersionId as string }).where(eq(schema.projects.id, d.id as string));
  return counts;
}

export const encodeBackup = (b: BackupFile) => gzipSync(Buffer.from(JSON.stringify(b)));
export const decodeBackup = (bytes: Uint8Array) => JSON.parse(gunzipSync(bytes).toString('utf8')) as BackupFile;

/** Writes planner-YYYYMMDD-HHMMSS.json.gz into dir and keeps the newest `keep` files. */
export async function writeBackup(db: DbOrTx, dir: string, keep = 14) {
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const file = join(dir, `planner-${stamp}.json.gz`);
  const bytes = encodeBackup(await dumpDatabase(db));
  await writeFile(file, bytes);
  const old = (await readdir(dir)).filter((f) => /^planner-\d{8}-\d{6}\.json\.gz$/.test(f)).sort().reverse().slice(keep);
  for (const f of old) await rm(join(dir, f), { force: true });
  return { file, bytes: bytes.byteLength };
}

export const readBackup = async (file: string) => decodeBackup(await readFile(file));
