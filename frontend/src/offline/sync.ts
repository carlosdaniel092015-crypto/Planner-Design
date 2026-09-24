// Offline-first project store. Every edit is written to this device first (IndexedDB, one database per
// user) and queued in an outbox; the sync loop pushes the queue to the API whenever there is a connection.
//
// Rules:
// - One outbox entry per project, coalesced: create+save → create, save+save → save (same base version),
//   create+delete → nothing, save+delete → delete.
// - Creates carry `clientRef` (the local id) so a retry after a lost response never duplicates the project.
// - A save rejected because someone else saved first (or the project was approved, or access was lost)
//   is never discarded: it becomes a new project "… (copia sin conexión)" and the user is told.
// - Bookkeeping runs under a lock so edits made while a request is in flight are never lost.
import { computeEstimate, newProject, type ProjectData, type ProjectKind } from '@core';
import { ApiError, api, type Catalog, type Currency, type ProjectDetail, type ProjectSummary, isTransient } from '../api';
import { UserDb } from './idb';

interface OutboxEntry {
  projectId: string;
  kind: 'create' | 'save' | 'delete';
  baseVersion: number;
  name: string;
  currency: Currency;
  data: ProjectData | null;
  /** Editor phase (1 especificaciones, 2 diseño, 3 aprobación). */
  phase?: number;
  /** New cover photo uploaded for Mis proyectos (sent once, then kept by the server). */
  coverUrl?: string;
  seq: number;
  at: string;
  /** clientRef of the conflict copy, stored before the request so a retry reuses it. */
  copyRef?: string;
  /** The server refused it for the plan (402): kept on the device, retried once per app start. */
  blocked?: string;
}

export interface SyncStatus {
  online: boolean;
  syncing: boolean;
  /** Project ids with changes not yet on the server. */
  pending: string[];
  needsLogin: boolean;
  lastSync: string | null;
}

export type SyncEvent =
  | { type: 'remap'; from: string; to: string }
  | { type: 'synced'; projectId: string; project: ProjectDetail }
  | { type: 'conflict'; projectId: string; copyId: string; copyName: string; reason: string }
  | { type: 'dropped'; projectId: string; message: string };

const NO_DATA = (what: string) => new ApiError(0, 'SIN_DATOS', what);
const QUICK = 8000;

let db: Promise<UserDb> | null = null;
let userId: string | null = null;
let status: SyncStatus = { online: typeof navigator === 'undefined' ? true : navigator.onLine, syncing: false, pending: [], needsLogin: false, lastSync: null };
const statusListeners = new Set<(s: SyncStatus) => void>();
const eventListeners = new Set<(e: SyncEvent) => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let interval: ReturnType<typeof setInterval> | null = null;
let running = false;
let rerun = false;
let backoff = 0;

// ---------- lifecycle ----------
const onOnline = () => {
  setStatus({ online: true });
  backoff = 0;
  schedule(200);
};
const onOffline = () => setStatus({ online: false });

export function startSync(uid: string) {
  if (userId === uid && db) return;
  stopSync();
  userId = uid;
  db = UserDb.open(uid);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  interval = setInterval(() => schedule(0), 30_000);
  void unblock()
    .then(() => recoverDrafts(uid))
    .then(refreshPending)
    .then(() => schedule(300));
}

/** Entries refused for the plan get another chance on each app start (the plan may have been upgraded). */
async function unblock() {
  await locked(async (d) => {
    for (const e of await d.all<OutboxEntry>('outbox')) if (e.blocked) await d.put('outbox', e.projectId, { ...e, blocked: undefined });
  });
}

// ---------- unload safety net ----------
// IndexedDB writes started while a page is being closed can be cut off. localStorage is synchronous,
// so the editor stashes its unsaved state there on pagehide and it is replayed on the next start.
const draftPrefix = (uid: string) => `planner:draft:${uid}:`;
export function stashDraft(projectId: string, s: LocalSave) {
  if (!userId) return;
  try {
    localStorage.setItem(draftPrefix(userId) + projectId, JSON.stringify(s));
  } catch {}
}
export function clearDraft(projectId: string) {
  if (!userId) return;
  try {
    localStorage.removeItem(draftPrefix(userId) + projectId);
  } catch {}
}
function draftKeys(uid: string) {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith(draftPrefix(uid)));
  } catch {
    return [];
  }
}
async function recoverDrafts(uid: string) {
  for (const k of draftKeys(uid)) {
    try {
      const draft = JSON.parse(localStorage.getItem(k) ?? 'null') as LocalSave | null;
      if (draft) await saveProject(k.slice(draftPrefix(uid).length), draft);
    } catch (e) {
      console.warn('borrador', e);
    }
    localStorage.removeItem(k);
  }
}

export function stopSync() {
  window.removeEventListener('online', onOnline);
  window.removeEventListener('offline', onOffline);
  if (interval) clearInterval(interval);
  if (timer) clearTimeout(timer);
  interval = timer = null;
  void db?.then((d) => d.close()).catch(() => {});
  db = null;
  userId = null;
  status = { ...status, pending: [], syncing: false, needsLogin: false };
  emitStatus();
}

/** Signs this user's data off the device: local database and cached media files. */
export async function wipeUser(uid: string) {
  if (userId === uid) stopSync();
  for (const k of draftKeys(uid)) localStorage.removeItem(k);
  await UserDb.destroy(uid);
  if ('caches' in window) for (const k of await caches.keys()) if (k.startsWith('media')) await caches.delete(k);
}

export function pendingCount() {
  return status.pending.length;
}

const D = () => {
  if (!db) throw NO_DATA('No hay sesión activa.');
  return db;
};

// ---------- status & events ----------
function setStatus(p: Partial<SyncStatus>) {
  status = { ...status, ...p };
  emitStatus();
}
function emitStatus() {
  for (const l of statusListeners) l(status);
}
export function onStatus(l: (s: SyncStatus) => void) {
  statusListeners.add(l);
  l(status);
  return () => void statusListeners.delete(l);
}
export function onSyncEvent(l: (e: SyncEvent) => void) {
  eventListeners.add(l);
  return () => void eventListeners.delete(l);
}
const emit = (e: SyncEvent) => {
  for (const l of eventListeners) l(e);
};
async function refreshPending() {
  const d = await D();
  setStatus({ pending: (await d.all<OutboxEntry>('outbox')).map((e) => e.projectId) });
}
/** Lets the server know we are logged in again after a 401 stopped the queue. */
export function resumeAfterLogin() {
  setStatus({ needsLogin: false });
  schedule(0);
}

// ---------- lock ----------
let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: (d: UserDb) => Promise<T>): Promise<T> {
  const run = chain.then(async () => fn(await D()));
  chain = run.catch(() => {});
  return run;
}

const newLocalId = () => `local-${crypto.randomUUID().replace(/-/g, '')}`;
export const isLocalId = (id: string) => id.startsWith('local-');
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function resolveId(d: UserDb, id: string): Promise<string> {
  let cur = id;
  for (let i = 0; i < 4; i++) {
    const next = await d.get<string>('kv', `remap:${cur}`);
    if (!next) return cur;
    cur = next;
  }
  return cur;
}
export async function resolveProjectId(id: string) {
  return resolveId(await D(), id);
}

// ---------- catalog ----------
export async function getCatalog(): Promise<Catalog> {
  const d = await D();
  try {
    const c = await api.catalog(QUICK);
    await d.put('kv', 'catalog', c);
    return c;
  } catch (e) {
    if (!isTransient(e)) throw e;
    const c = await d.get<Catalog>('kv', 'catalog');
    if (c) return c;
    throw NO_DATA('El catálogo todavía no está en este dispositivo. Conéctate a internet una vez para descargarlo.');
  }
}

// ---------- reads ----------
const summaryOf = (p: ProjectDetail): ProjectSummary => {
  const { data: _d, discontinued: _x, pricesFrozen: _f, ...s } = p;
  return s;
};

export async function listProjects(): Promise<{ items: ProjectSummary[]; fromDevice: boolean }> {
  const d = await D();
  let items: ProjectSummary[];
  let fromDevice = false;
  try {
    items = (await api.listProjects(QUICK)).items;
    await d.put('kv', 'list', items);
    void prefetch(items);
  } catch (e) {
    if (!isTransient(e)) throw e;
    items = (await d.get<ProjectSummary[]>('kv', 'list')) ?? [];
    fromDevice = true;
  }
  // Overlay what this device has not pushed yet.
  const outbox = await d.all<OutboxEntry>('outbox');
  for (const e of outbox) {
    if (e.kind === 'delete') {
      items = items.filter((p) => p.id !== e.projectId);
      continue;
    }
    const rec = await d.get<ProjectDetail>('projects', e.projectId);
    if (!rec) continue;
    const s = summaryOf(rec);
    const i = items.findIndex((p) => p.id === e.projectId);
    if (i >= 0) items[i] = { ...items[i]!, ...s };
    else items.unshift(s);
  }
  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { items, fromDevice };
}

let prefetching = false;
/** Downloads recent projects in the background so they can be opened without a connection. */
async function prefetch(items: ProjectSummary[]) {
  if (prefetching) return;
  prefetching = true;
  try {
    const d = await D();
    for (const s of items.slice(0, 40)) {
      if (await d.get('outbox', s.id)) continue;
      const rec = await d.get<ProjectDetail>('projects', s.id);
      if (rec && rec.version >= s.version) continue;
      const p = await api.getProject(s.id, QUICK).catch(() => null);
      if (!p) break;
      await locked(async (dd) => {
        if (!(await dd.get('outbox', s.id))) await dd.put('projects', s.id, p);
      });
    }
  } finally {
    prefetching = false;
  }
}

/** Opens a project: this device's copy if it has unsent changes, else the server's, else the cached one. */
export async function getProject(requested: string): Promise<{ project: ProjectDetail; redirect?: string; fromDevice: boolean }> {
  const d = await D();
  const id = await resolveId(d, requested);
  const redirect = id !== requested ? id : undefined;
  const entry = await d.get<OutboxEntry>('outbox', id);
  const rec = await d.get<ProjectDetail>('projects', id);
  if (entry?.kind === 'delete') throw new ApiError(404, 'NO_ENCONTRADO', 'El proyecto fue eliminado.');
  if (entry && rec) return { project: rec, redirect, fromDevice: true };
  try {
    const p = await api.getProject(id, QUICK);
    await locked(async (dd) => {
      if (!(await dd.get('outbox', id))) await dd.put('projects', id, p);
    });
    return { project: (await d.get<ProjectDetail>('projects', id)) ?? p, redirect, fromDevice: false };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) await d.del('projects', id);
    if (!isTransient(e)) throw e;
    if (rec) return { project: rec, redirect, fromDevice: true };
    throw NO_DATA('Este proyecto no se ha abierto antes en este dispositivo. Conéctate a internet para abrirlo la primera vez.');
  }
}

// ---------- writes ----------
export interface LocalSave {
  name: string;
  currency: Currency;
  phase?: number;
  coverUrl?: string;
  data: ProjectData;
  estimate?: ProjectDetail['estimate'];
  moduleCount?: number;
}

/** Saves on this device and queues the change. Returns the (possibly remapped) project id. */
export async function saveProject(requested: string, s: LocalSave): Promise<string> {
  const id = await locked(async (d) => {
    const id = await resolveId(d, requested);
    const rec = await d.get<ProjectDetail>('projects', id);
    if (!rec) throw NO_DATA('El proyecto no está en este dispositivo.');
    const now = new Date().toISOString();
    await d.put('projects', id, {
      ...rec,
      name: s.name,
      currency: s.currency,
      data: s.data,
      updatedAt: now,
      ...(s.phase != null ? { phase: s.phase } : {}),
      ...(s.coverUrl ? { coverUrl: s.coverUrl } : {}), ...(s.estimate ? { estimate: s.estimate } : {}), ...(s.moduleCount != null ? { moduleCount: s.moduleCount } : {}) });
    const prev = await d.get<OutboxEntry>('outbox', id);
    const entry: OutboxEntry = prev
      ? { ...prev, kind: prev.kind === 'create' ? 'create' : 'save', name: s.name, currency: s.currency, data: s.data, phase: s.phase ?? prev.phase, coverUrl: s.coverUrl ?? prev.coverUrl, seq: prev.seq + 1, at: now }
      : { projectId: id, kind: 'save', baseVersion: rec.version, name: s.name, currency: s.currency, data: s.data, phase: s.phase, coverUrl: s.coverUrl, seq: 1, at: now };
    await d.put('outbox', id, entry);
    return id;
  });
  await refreshPending();
  schedule(300);
  return id;
}

let ownerName: string | null = null;
/** Name shown as owner on projects created offline. */
export function setOwnerName(name: string) {
  ownerName = name;
}

async function createLocal(uid: string, data: ProjectData, currency: Currency | null, id = newLocalId()): Promise<ProjectDetail> {
  const d = await D();
  const cat = await d.get<Catalog>('kv', 'catalog');
  const cur = currency ?? cat?.pricing.baseCurrency ?? 'USD';
  const est = cat ? computeEstimate(data, cat.context, cur) : null;
  const now = new Date().toISOString();
  const rec: ProjectDetail = {
    id,
    name: data.pname,
    type: data.ptype === 'cocina' ? 'cocina' : 'closet',
    status: 'borrador',
    phase: 1,
    ownerId: uid,
    clientId: null,
    currency: cur,
    estimate: { amount: est?.total ?? 0, currency: cur, rate: cat?.pricing.exchangeRateDopPerUsd ?? 60 },
    moduleCount: data.mods.length,
    version: 0,
    coverUrl: null,
    access: 'propietario',
    ownerName: ownerName,
    shareCount: 0,
    createdAt: now,
    updatedAt: now,
    data,
    discontinued: [],
    pricesFrozen: false,
  };
  await locked(async (dd) => {
    await dd.put('projects', id, rec);
    await dd.put('outbox', id, { projectId: id, kind: 'create', baseVersion: 0, name: rec.name, currency: cur, data, seq: 1, at: now } satisfies OutboxEntry);
  });
  await refreshPending();
  schedule(300);
  return rec;
}

export async function createProject(ptype: ProjectKind): Promise<ProjectDetail> {
  const d = await D();
  const localId = newLocalId();
  try {
    const p = await api.createProject({ ptype, clientRef: localId }, QUICK);
    await d.put('projects', p.id, p);
    return p;
  } catch (e) {
    if (!isTransient(e)) throw e;
    // Same id as the clientRef: if the request did reach the server, the sync gets that project back.
    return createLocal(userId!, newProject(ptype), null, localId);
  }
}

export async function duplicateProject(requested: string): Promise<ProjectDetail> {
  const d = await D();
  const id = await resolveId(d, requested);
  if (!isLocalId(id) && !(await d.get('outbox', id)))
    try {
      const p = await api.duplicateProject(id);
      await d.put('projects', p.id, p);
      return p;
    } catch (e) {
      if (!isTransient(e)) throw e;
    }
  const src = await d.get<ProjectDetail>('projects', id);
  if (!src) throw NO_DATA('Para duplicar sin conexión, abre el proyecto una vez con internet.');
  const data = structuredClone(src.data);
  data.pname = `${src.name} (copia)`;
  return createLocal(userId!, data, src.currency);
}

export async function deleteProject(requested: string): Promise<void> {
  const d = await D();
  const id = await resolveId(d, requested);
  const entry = await d.get<OutboxEntry>('outbox', id);
  if (entry?.kind === 'create') {
    await locked(async (dd) => {
      await dd.del('outbox', id);
      await dd.del('projects', id);
    });
    return refreshPending();
  }
  try {
    if (entry) throw new ApiError(0, 'EN_COLA', 'hay cambios en cola'); // keep order: queue the delete after them
    await api.deleteProject(id);
    await d.del('projects', id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return void (await d.del('projects', id));
    if (!isTransient(e)) throw e;
    await locked(async (dd) => {
      const prev = await dd.get<OutboxEntry>('outbox', id);
      const rec = await dd.get<ProjectDetail>('projects', id);
      await dd.put('outbox', id, {
        projectId: id,
        kind: 'delete',
        baseVersion: prev?.baseVersion ?? rec?.version ?? 0,
        name: rec?.name ?? '',
        currency: rec?.currency ?? 'USD',
        data: null,
        seq: (prev?.seq ?? 0) + 1,
        at: new Date().toISOString(),
      } satisfies OutboxEntry);
      await dd.del('projects', id);
    });
    await refreshPending();
    schedule(300);
  }
}

// ---------- sync loop ----------
export function schedule(ms: number) {
  if (!db) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), ms);
}

/** Pushes the queue now and tells whether this project has nothing left to upload. */
export async function flushProject(requested: string): Promise<boolean> {
  if (!db) return false;
  const id = await resolveProjectId(requested);
  for (let i = 0; i < 3; i++) {
    while (running) await new Promise((r) => setTimeout(r, 100));
    await syncNow();
    while (running) await new Promise((r) => setTimeout(r, 100));
    const left = await (await D()).get<OutboxEntry>('outbox', await resolveProjectId(id));
    if (!left) return true;
    if (!status.online || status.needsLogin) return false;
  }
  return false;
}

export async function syncNow(): Promise<void> {
  if (!db || status.needsLogin) return;
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  setStatus({ syncing: true });
  try {
    const d = await D();
    const entries = (await d.all<OutboxEntry>('outbox')).sort((a, b) => a.at.localeCompare(b.at));
    for (const e of entries) {
      if (e.blocked) continue;
      try {
        await push(e);
        backoff = 0;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setStatus({ needsLogin: true });
          break;
        }
        if (isTransient(err)) {
          setStatus({ online: !(err instanceof ApiError && err.status === 0) && navigator.onLine });
          backoff = Math.min(backoff ? backoff * 2 : 5000, 120_000);
          schedule(backoff);
          break;
        }
        if (err instanceof ApiError && err.status === 402) {
          // Plan limit: keep the work on this device, stop retrying until the app restarts (or the plan changes).
          await locked(async (dd) => {
            const cur = await dd.get<OutboxEntry>('outbox', e.projectId);
            if (cur) await dd.put('outbox', e.projectId, { ...cur, blocked: err.message });
          });
          emit({ type: 'dropped', projectId: e.projectId, message: `${err.message} Tu trabajo sigue guardado en este dispositivo.` });
          continue;
        }
        console.warn('sync', err);
      }
    }
    if (!(await d.all('outbox')).length) setStatus({ lastSync: new Date().toISOString(), online: true });
  } finally {
    running = false;
    await refreshPending().catch(() => {});
    setStatus({ syncing: false });
    if (rerun) {
      rerun = false;
      schedule(0);
    }
  }
}

async function push(snap: OutboxEntry) {
  if (snap.kind === 'create') return pushCreate(snap);
  if (snap.kind === 'delete') return pushDelete(snap);
  return pushSave(snap);
}

async function pushCreate(snap: OutboxEntry) {
  const res = await api.createProject({ name: snap.name, currency: snap.currency, data: snap.data!, clientRef: snap.projectId });
  await locked(async (d) => {
    const cur = await d.get<OutboxEntry>('outbox', snap.projectId);
    await d.del('outbox', snap.projectId);
    await d.del('projects', snap.projectId);
    await d.put('kv', `remap:${snap.projectId}`, res.id);
    const latest = cur ?? snap;
    if (latest.kind === 'delete') await d.put('outbox', res.id, { ...latest, projectId: res.id, baseVersion: res.version });
    else if (!same(res.data, latest.data) || (latest.phase != null && latest.phase !== res.phase) || latest.coverUrl) {
      // Edits made while offline after the create (or a retried create that returned the first attempt).
      await d.put('outbox', res.id, { ...latest, kind: 'save', projectId: res.id, baseVersion: res.version, copyRef: undefined });
      await d.put('projects', res.id, { ...res, name: latest.name, currency: latest.currency, data: latest.data! });
    } else await d.put('projects', res.id, res);
  });
  emit({ type: 'remap', from: snap.projectId, to: res.id });
}

async function pushDelete(snap: OutboxEntry) {
  try {
    await api.deleteProject(snap.projectId);
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) {
      if (isTransient(e) || (e instanceof ApiError && e.status === 401)) throw e;
      emit({ type: 'dropped', projectId: snap.projectId, message: e instanceof ApiError ? e.message : 'No se pudo eliminar el proyecto.' });
    }
  }
  await locked(async (d) => {
    const cur = await d.get<OutboxEntry>('outbox', snap.projectId);
    if (cur?.seq === snap.seq) await d.del('outbox', snap.projectId);
  });
}

async function settleSaved(snap: OutboxEntry, res: ProjectDetail) {
  await locked(async (d) => {
    const cur = await d.get<OutboxEntry>('outbox', snap.projectId);
    if (!cur || cur.seq === snap.seq) {
      await d.del('outbox', snap.projectId);
      await d.put('projects', snap.projectId, { ...res, data: snap.data! });
    } else {
      await d.put('outbox', snap.projectId, { ...cur, baseVersion: res.version });
      await d.put('projects', snap.projectId, { ...res, name: cur.name, currency: cur.currency, data: cur.data! });
    }
  });
  emit({ type: 'synced', projectId: snap.projectId, project: res });
}

async function pushSave(snap: OutboxEntry) {
  let reason: string;
  try {
    const res = await api.saveProject(snap.projectId, {
      version: snap.baseVersion,
      name: snap.name,
      currency: snap.currency,
      data: snap.data!,
      ...(snap.phase != null ? { phase: snap.phase } : {}),
      ...(snap.coverUrl ? { coverUrl: snap.coverUrl } : {}),
    });
    return settleSaved(snap, res);
  } catch (e) {
    if (!(e instanceof ApiError) || isTransient(e) || e.status === 401) throw e;
    if (e.code === 'VERSION_DESACTUALIZADA') {
      // A save whose answer was lost looks like a conflict on retry: same data on the server = done.
      const server = await api.getProject(snap.projectId);
      if (same(server.data, snap.data) && server.name === snap.name) return settleSaved(snap, server);
      reason = 'Otra persona (u otro dispositivo) guardó cambios en este proyecto mientras trabajabas.';
    } else if (e.code === 'PROYECTO_APROBADO') reason = 'El proyecto se aprobó mientras trabajabas sin conexión.';
    else if (e.status === 403 || e.status === 404) reason = 'Ya no tienes acceso para editar este proyecto.';
    else {
      await locked(async (d) => {
        const cur = await d.get<OutboxEntry>('outbox', snap.projectId);
        if (cur?.seq === snap.seq) await d.del('outbox', snap.projectId);
      });
      emit({ type: 'dropped', projectId: snap.projectId, message: e.message });
      return;
    }
  }
  // Keep the work: save it as a new project owned by this user.
  const ref = await locked(async (d) => {
    const cur = (await d.get<OutboxEntry>('outbox', snap.projectId)) ?? snap;
    const copyRef = cur.copyRef ?? `copy-${crypto.randomUUID().replace(/-/g, '')}`;
    await d.put('outbox', snap.projectId, { ...cur, copyRef });
    return { copyRef, cur: { ...cur, copyRef } };
  });
  const copyName = `${ref.cur.name} (copia sin conexión)`.slice(0, 160);
  const copy = await api.createProject({ name: copyName, currency: ref.cur.currency, data: { ...ref.cur.data!, pname: copyName }, clientRef: ref.copyRef });
  const server = await api.getProject(snap.projectId).catch(() => null);
  await locked(async (d) => {
    const cur = await d.get<OutboxEntry>('outbox', snap.projectId);
    await d.del('outbox', snap.projectId);
    if (server) await d.put('projects', snap.projectId, server);
    else await d.del('projects', snap.projectId);
    await d.put('projects', copy.id, copy);
    // Edits made while the copy was being created go on top of the copy.
    if (cur && cur.seq !== ref.cur.seq)
      await d.put('outbox', copy.id, { ...cur, kind: 'save', projectId: copy.id, baseVersion: copy.version, copyRef: undefined, data: { ...cur.data!, pname: copyName }, name: copyName });
  });
  emit({ type: 'conflict', projectId: snap.projectId, copyId: copy.id, copyName, reason });
}
