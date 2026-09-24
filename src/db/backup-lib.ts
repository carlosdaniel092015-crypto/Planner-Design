// Logical backups: every table as JSON (gzip), portable across Postgres versions and PGlite, no pg_dump needed.
// Restore goes into an empty, migrated database, parents before children.
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { eq, getTableName, is } from 'drizzle-orm';
import { getTableConfig, PgTable, PgTimestamp } from 'drizzle-orm/pg-core';
import type { Db } from './client';
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

/** Reads every table inside one snapshot, so rows written during the dump never leave a child without its parent. */
export async function dumpDatabase(db: Db): Promise<BackupFile> {
  const out: BackupFile = { format: 'planner-backup', version: 1, createdAt: new Date().toISOString(), tables: {} };
  await db.transaction(
    async (tx) => {
      for (const t of ordered()) out.tables[getTableName(t)] = (await tx.select().from(t)) as Record<string, unknown>[];
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
  return out;
}

/** Inserts a backup into an empty database that already has the migrations applied (all or nothing). */
export async function restoreDatabase(db: Db, backup: BackupFile) {
  if (backup.format !== 'planner-backup') throw new Error('El archivo no es un respaldo de Planner.');
  return db.transaction(async (tx) => {
  const counts: Record<string, number> = {};
  const deferred: { id: unknown; approvedVersionId: unknown; updatedAt: unknown }[] = [];
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
      for (const r of rows) if (r.approvedVersionId) deferred.push({ id: r.id, approvedVersionId: r.approvedVersionId, updatedAt: r.updatedAt });
      rows = rows.map((r) => ({ ...r, approvedVersionId: null }));
    }
    for (let i = 0; i < rows.length; i += 500) await tx.insert(t).values(rows.slice(i, i + 500) as never);
    counts[name] = rows.length;
  }
  // updatedAt is set explicitly: otherwise its $onUpdate would stamp every approved project with the restore time.
  for (const d of deferred)
    await tx
      .update(schema.projects)
      .set({ approvedVersionId: d.approvedVersionId as string, updatedAt: d.updatedAt as Date })
      .where(eq(schema.projects.id, d.id as string));
  return counts;
  });
}

export const encodeBackup = (b: BackupFile) => gzipSync(Buffer.from(JSON.stringify(b)));
export const decodeBackup = (bytes: Uint8Array) => JSON.parse(gunzipSync(bytes).toString('utf8')) as BackupFile;

/** Positive integer from the environment, or the fallback when missing or invalid (e.g. BACKUP_KEEP=abc). */
export function envInt(value: string | undefined, fallback: number, min = 1) {
  const n = Number(value);
  return value?.trim() && Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
}

/** Writes planner-YYYYMMDD-HHMMSS.json.gz into dir and keeps the newest `keep` files (at least 1). */
export async function writeBackup(db: Db, dir: string, keep = 14) {
  keep = Math.max(1, Math.floor(keep) || 14);
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const file = join(dir, `planner-${stamp}.json.gz`);
  const bytes = encodeBackup(await dumpDatabase(db));
  // Written under a temporary name and renamed, so an interrupted backup never looks like the newest one.
  await writeFile(`${file}.tmp`, bytes);
  await rename(`${file}.tmp`, file);
  const old = (await readdir(dir)).filter((f) => /^planner-\d{8}-\d{6}\.json\.gz$/.test(f)).sort().reverse().slice(keep);
  for (const f of old) await rm(join(dir, f), { force: true });
  return { file, bytes: bytes.byteLength };
}

export const readBackup = async (file: string) => decodeBackup(await readFile(file));
