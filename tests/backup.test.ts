import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_KITCHEN } from '../src/core';
import { dumpDatabase, readBackup, restoreDatabase, writeBackup } from '../src/db/backup-lib';
import { connect } from '../src/db/client';
import { setup, type Ctx } from './helpers';

let t: Ctx;
beforeAll(async () => {
  t = await setup();
  const dis = await t.makeUser(t.orgA.id, 'disenador', 'dis-bak@a.test');
  // An approvable kitchen (water point next to the sink), so the backup carries a signed approval.
  const data = { ...DEFAULT_KITCHEN, pts: DEFAULT_KITCHEN.pts.map((x) => (x.t === 'agua' ? { ...x, pos: 135 } : x)) };
  const p = (await t.req('POST', '/projects', { user: dis, body: { name: 'Para respaldar', data } })).data;
  await t.req('POST', `/projects/${p.id}/versions`, { user: dis, body: { note: 'v' } });
  await t.req('POST', `/projects/${p.id}/approve-internal`, { user: dis, body: { signerName: 'Cliente' } });
  await t.req('PUT', `/projects/${p.id}/shares/${t.adminA.id}`, { user: dis, body: { access: 'ver' } });
});
afterAll(() => t.close());

describe('respaldos', () => {
  it('respalda y restaura la base completa en una base nueva, con proyectos aprobados y firmas', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'planner-bak-'));
    const { file } = await writeBackup(t.db, dir, 2);
    const backup = await readBackup(file);
    expect(backup.format).toBe('planner-backup');
    const fresh = await connect('pglite://memory');
    await fresh.migrate(resolve('drizzle'));
    const counts = await restoreDatabase(fresh.db, backup);
    expect(counts.projects).toBeGreaterThan(0);
    expect(counts.approvals).toBe(1);
    const again = await dumpDatabase(fresh.db);
    for (const [name, rows] of Object.entries(backup.tables)) expect(again.tables[name]?.length, name).toBe(rows.length);
    const before = backup.tables.projects!.find((r) => r.name === 'Para respaldar')!;
    const after = again.tables.projects!.find((r) => r.id === before.id)!;
    expect(after.approvedVersionId).toBe(before.approvedVersionId);
    expect(after.status).toBe('aprobado');
    expect(JSON.stringify(after.data)).toBe(JSON.stringify(before.data));
    await fresh.close();
  });

  it('conserva solo los últimos N respaldos', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'planner-bak-'));
    for (let i = 0; i < 3; i++) {
      await writeBackup(t.db, dir, 2);
      await new Promise((r) => setTimeout(r, 1100));
    }
    expect((await readdir(dir)).filter((f) => f.endsWith('.json.gz'))).toHaveLength(2);
  });
});
