import {
  addModule,
  applyMaterial,
  computeEstimate,
  type Currency,
  duplicateModule,
  elev,
  generateDesign,
  iso,
  type ModuleDefinition,
  type ModuleInstance,
  plan,
  type ProjectData,
  removeModule,
  replaceModule,
  setDim,
  setFrontCount,
  templateOf,
  updateModule,
  validateProject,
} from '@core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, type Catalog, type CatalogMaterial, type ProjectDetail } from '../api';
import { canCreate, canEdit, FullScreenLoader, useAuth } from '../auth';
import { ShareDialog } from '../ShareDialog';
import { BottomBar } from '../editor/BottomBar';
import { installEngine, sceneCfg, snapshot, type Viewer } from '../editor/engine';
import { uploadFile } from '../library/upload';
import { LeftPanel, type LeftTab } from '../editor/LeftPanel';
import { RightPanel } from '../editor/RightPanel';
import { Viewer3D } from '../editor/Viewer3D';
import { ApprovalView } from '../approval/ApprovalView';
import { LibraryDialog } from '../library/LibraryDialog';
import { SpecWizard } from '../spec/SpecWizard';
import { SyncBadge, useSyncStatus } from '../offline/SyncBadge';
import { clearDraft, flushProject, getCatalog, getProject, type LocalSave, onSyncEvent, type SyncEvent, saveProject, stashDraft } from '../offline/sync';
import { UserMenu } from '../UserMenu';
import { Brand, Dialog, fmtMoney, Icon, MUTED, relativeTime, Svg, useToast } from '../ui';

type View = '3d' | 'planta' | 'alzado';
type Wall = 'A' | 'B' | 'C' | 'D';
const GEN_STEPS = ['Analizando medidas y aberturas', 'Ubicando fregadero junto a la toma de agua', 'Colocando electrodomésticos', 'Optimizando triángulo de trabajo y rellenos'];
type SaveState = { kind: 'saved'; at: string } | { kind: 'dirty' } | { kind: 'saving' } | { kind: 'error'; message: string };

export function EditorPage() {
  const { id = '' } = useParams();
  const { me } = useAuth();
  const nav = useNavigate();
  const { flash, toast } = useToast();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [data, setData] = useState<ProjectData | null>(null);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const hist = useRef<ProjectData[]>([]);
  const fut = useRef<ProjectData[]>([]);
  const [, force] = useState(0);

  const [sel, setSel] = useState<number | null>(null);
  const [view, setView] = useState<View>('3d');
  const [wall, setWall] = useState<Wall>('A');
  // 1 = Especificaciones, 2 = Diseño (stored in projects.phase).
  const [phase, setPhase] = useState(2);
  const [specStep, setSpecStep] = useState(1);
  const [genStep, setGenStep] = useState<number | null>(null);
  const [suggest, setSuggest] = useState(false);
  const [libTab, setLibTab] = useState<'tex' | 'mod' | null>(null);
  const [cotas, setCotas] = useState(true);
  const [altos, setAltos] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState(false);
  // Phones and small tablets start with the 3D view clear; the panels slide over it.
  const narrow = typeof window !== 'undefined' && window.innerWidth <= 900;
  const [leftOpen, setLeftOpen] = useState(!narrow);
  const [rightOpen, setRightOpen] = useState(!narrow);
  const [leftTab, setLeftTab] = useState<LeftTab>('modulos');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('Todos');
  const [applyTo, setApplyTo] = useState<'todo' | 'modulo'>('todo');
  const [replaceMode, setReplaceMode] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [tip, setTip] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: 'saved', at: new Date().toISOString() });
  const [conflict, setConflict] = useState<Extract<SyncEvent, { type: 'conflict' }> | null>(null);
  const viewer = useRef<Viewer | null>(null);
  const dirty = useRef(false);
  const saving = useRef(false);
  /** Current id: a project created offline gets its server id when it syncs. */
  const pid = useRef(id);
  /** Route change caused by that id swap (not a real navigation). */
  const remapTarget = useRef<string | null>(null);
  const sync = useSyncStatus();
  const pending = !!sync?.pending.includes(pid.current);
  // Cover photo for Mis proyectos: regenerated after saves when the design changed.
  const coverUrl = useRef<string | null>(null);
  const coverSig = useRef('');
  const coverBusy = useRef(false);

  const applyProject = useCallback((p: ProjectDetail) => {
    pid.current = p.id;
    setProject(p);
    setData(p.data);
    setName(p.name);
    setCurrency(p.currency);
    setPhase(p.status === 'aprobado' || p.phase >= 3 ? 3 : p.phase <= 1 ? 1 : 2);
    if (p.coverUrl) coverSig.current = JSON.stringify([p.data.mods, p.data.mats, p.data.room, p.data.ops]);
    hist.current = [];
    fut.current = [];
    dirty.current = false;
    setSave({ kind: 'saved', at: p.updatedAt });
  }, []);
  const followRemap = useCallback(
    (to: string) => {
      pid.current = to;
      remapTarget.current = to;
      setProject((p) => (p ? { ...p, id: to } : p));
      nav(`/proyectos/${to}`, { replace: true });
    },
    [nav],
  );

  // ---------- load (this device first when it has unsent work; works offline) ----------
  useEffect(() => {
    if (remapTarget.current === id) {
      remapTarget.current = null;
      return;
    }
    let dead = false;
    Promise.all([getProject(id), getCatalog()])
      .then(([{ project: p, redirect }, c]) => {
        if (dead) return;
        installEngine(c.materials);
        setCatalog(c);
        applyProject(p);
        // Everything is shown in the organisation's base currency (RD$).
        setCurrency(c.pricing.baseCurrency);
        if (redirect) followRemap(redirect);
      })
      .catch((e) => !dead && setLoadError(e instanceof ApiError ? e.message : 'No se pudo abrir el proyecto.'));
    return () => {
      dead = true;
    };
  }, [id, applyProject, followRemap]);

  const readOnly = !project || project.status === 'aprobado' || !canEdit(me, project.access) || conflict != null;
  const materialsByCode = useMemo<Record<string, CatalogMaterial>>(() => Object.fromEntries((catalog?.materials ?? []).map((m) => [m.code, m])), [catalog]);
  const rate = project?.pricesFrozen ? project.estimate.rate : (catalog?.pricing.exchangeRateDopPerUsd ?? 60);
  const ctx = catalog?.context;
  const estimate = useMemo(() => (data && ctx ? computeEstimate(data, ctx, currency) : null), [data, ctx, currency]);
  const issues = useMemo(() => (data && ctx ? validateProject(data, ctx) : []), [data, ctx]);
  const selMod = data?.mods.find((m) => m.id === sel) ?? null;

  // ---------- edits (undo/redo like the prototype's commit) ----------
  const commit = useCallback(
    (next: ProjectData) => {
      if (readOnly || !data) return;
      hist.current = [...hist.current.slice(-40), data];
      fut.current = [];
      dirty.current = true;
      setData(next);
      setSave({ kind: 'dirty' });
    },
    [data, readOnly],
  );
  const undo = useCallback(() => {
    if (!data || !hist.current.length) return;
    fut.current = [data, ...fut.current];
    const prev = hist.current[hist.current.length - 1]!;
    hist.current = hist.current.slice(0, -1);
    dirty.current = true;
    setData(prev);
    setSave({ kind: 'dirty' });
    force((n) => n + 1);
  }, [data]);
  const redo = useCallback(() => {
    if (!data || !fut.current.length) return;
    hist.current = [...hist.current, data];
    const next = fut.current[0]!;
    fut.current = fut.current.slice(1);
    dirty.current = true;
    setData(next);
    setSave({ kind: 'dirty' });
    force((n) => n + 1);
  }, [data]);

  // ---------- save: always to this device first; the sync queue uploads it ----------
  const localSnapshot = (): LocalSave | null => {
    if (!data) return null;
    const nm = name.trim() || data.pname;
    const est = ctx ? computeEstimate(data, ctx, currency) : null;
    return {
      name: nm,
      currency,
      phase,
      ...(coverUrl.current ? { coverUrl: coverUrl.current } : {}),
      data: { ...data, pname: nm },
      estimate: est ? { amount: est.total, currency, rate } : undefined,
      moduleCount: data.mods.length,
    };
  };
  const snapshotRef = useRef(localSnapshot);
  snapshotRef.current = localSnapshot;
  /** Saves on this device (instant, works offline). Resolves true when nothing is left unsaved locally. */
  const doSave = useCallback(async (): Promise<boolean> => {
    if (!project || !data || readOnly) return !dirty.current;
    while (saving.current) await new Promise((r) => setTimeout(r, 50));
    if (!dirty.current && save.kind !== 'dirty') return true;
    saving.current = true;
    dirty.current = false;
    setSave({ kind: 'saving' });
    try {
      const payload = snapshotRef.current();
      if (!payload) return false;
      const newId = await saveProject(pid.current, payload);
      coverUrl.current = null;
      clearDraft(pid.current);
      if (newId !== pid.current) followRemap(newId);
      setSave(dirty.current ? { kind: 'dirty' } : { kind: 'saved', at: new Date().toISOString() });
      return true;
    } catch (e) {
      dirty.current = true;
      setSave({ kind: 'error', message: e instanceof ApiError ? e.message : 'No se pudo guardar en este dispositivo.' });
      return false;
    } finally {
      saving.current = false;
    }
  }, [project, data, readOnly, followRemap, save.kind]);

  /** Sending to the client or approving needs the latest version on the server, not just on this device. */
  const ensureOnServer = useCallback(async () => {
    if (!(await doSave())) return false;
    if (await flushProject(pid.current)) return true;
    flash('Sin conexión: tus cambios están guardados en este dispositivo. Conéctate a internet para enviar o aprobar.');
    return false;
  }, [doSave, flash]);

  // Autosave shortly after the last change (it is a local write).
  useEffect(() => {
    if (save.kind !== 'dirty' || readOnly) return;
    const t = setTimeout(() => doSave(), 800);
    return () => clearTimeout(t);
  }, [save, doSave, readOnly]);

  // Sync results for this project.
  useEffect(
    () =>
      onSyncEvent((e) => {
        if (e.type === 'remap') {
          if (e.from === pid.current) followRemap(e.to);
        } else if (e.projectId !== pid.current) return;
        else if (e.type === 'synced') setProject((p) => (p ? { ...p, ...e.project, data: p.data, name: p.name, currency: p.currency } : p));
        else if (e.type === 'conflict') setConflict(e);
        else if (e.type === 'dropped') flash(e.message);
      }),
    [followRemap, flash],
  );

  // Crash-proof draft: a synchronous copy of every unsaved change, replayed on the next start if the tab
  // is killed before the IndexedDB write finishes (phones do this to background apps).
  useEffect(() => {
    if (!dirty.current) return;
    const snap = snapshotRef.current();
    if (snap) stashDraft(pid.current, snap);
  }, [data, name, currency]);

  // After a save, refresh the cover if the design changed (small offscreen 3D photo, uploaded as a miniatura).
  useEffect(() => {
    if (save.kind !== 'saved' || readOnly || !project || !data?.mods.length || coverBusy.current) return;
    const sig = JSON.stringify([data.mods, data.mats, data.room, data.ops]);
    if (sig === coverSig.current) return;
    const t = setTimeout(async () => {
      coverBusy.current = true;
      coverSig.current = sig;
      try {
        const url = await snapshot(sceneCfg(data, { sel: null, cotas: false, altos: true, dark: false }), { w: 480, h: 300 });
        if (!url) return;
        const bin = atob(url.slice(url.indexOf(',') + 1));
        const blob = new Blob([Uint8Array.from(bin, (ch) => ch.charCodeAt(0))], { type: 'image/jpeg' });
        const up = await uploadFile('miniatura', blob, 'portada.jpg', project.id);
        coverUrl.current = up.url;
        dirty.current = true;
        setSave({ kind: 'dirty' });
      } catch {
        // A missing cover is cosmetic: Mis proyectos falls back to the drawing.
      } finally {
        coverBusy.current = false;
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [save, readOnly, project, data]);

  // Saving is a local write, so flush it whenever the page may go away (tab hidden, app closed on a
  // phone, leaving the editor) instead of waiting for the autosave timer.
  const saveRef = useRef(doSave);
  saveRef.current = doSave;
  useEffect(() => {
    const flush = () => {
      if (!dirty.current) return;
      const s = snapshotRef.current();
      if (s) stashDraft(pid.current, s);
      void saveRef.current();
    };
    const onHide = () => document.visibilityState === 'hidden' && flush();
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      flush();
      e.preventDefault();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      flush();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, []);

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement)?.tagName ?? '')) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if ((e.ctrlKey || e.metaKey) && k === 'y') {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && k === 's') {
        e.preventDefault();
        doSave();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel && data && !readOnly) {
        commit(removeModule(data, sel));
        flash(`Módulo ${sel} eliminado · Ctrl+Z para deshacer`);
        setSel(null);
      } else if (e.key === 'Escape') {
        setSel(null);
        setReplaceMode(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, doSave, sel, data, readOnly, commit, flash]);

  // ---------- derived drawings ----------
  const cfg = useMemo(() => (data ? sceneCfg(data, { sel, cotas, altos, dark }) : null), [data, sel, cotas, altos, dark]);
  const isoDrawing = useMemo(() => (data ? iso(data, materialsByCode as never, { sel, cotas, altos, zoom }) : null), [data, materialsByCode, sel, cotas, altos, zoom]);
  const planDrawing = useMemo(() => (data && view === 'planta' ? plan(data, { sel, altos, cotas }) : null), [data, view, sel, altos, cotas]);
  const elevDrawing = useMemo(() => (data && view === 'alzado' ? elev(data, wall, materialsByCode as never, { sel, altos, cotas }) : null), [data, view, wall, materialsByCode, sel, altos, cotas]);

  if (loadError)
    return (
      <div style={{ height: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--color-bg)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}>
          <h2 style={{ margin: 0 }}>No se pudo abrir el proyecto</h2>
          <p style={{ margin: 0 }}>{loadError}</p>
          <button type="button" className="btn btn-primary" onClick={() => nav('/')}>
            Volver a mis proyectos
          </button>
        </div>
      </div>
    );
  if (!project || !data || !catalog || !estimate) return <FullScreenLoader label="Abriendo proyecto" />;

  // ---------- actions ----------
  const onAdd = (def: ModuleDefinition) => {
    const tpl = templateOf(def);
    if (replaceMode && sel) {
      commit(replaceModule(data, sel, tpl));
      setReplaceMode(false);
      flash(`Módulo ${sel} reemplazado por ${def.name}`);
      return;
    }
    const r = addModule(data, tpl);
    if (!r) return flash(`No hay espacio libre en los muros para ${def.name}`);
    commit(r.project);
    setSel(r.id);
    setRightOpen(true);
    flash(r.spot.wall === 'F' ? `${def.name} colocado como isla (sin espacio en muros)` : `${def.name} agregado en el muro ${r.spot.wall}`);
  };
  const onMaterial = (group: 'cuerpo' | 'frentes' | 'encimera' | 'jaladeras', code: string) => commit(applyMaterial(data, group, code, applyTo === 'modulo' ? sel : null));
  const patchSel = (patch: Partial<ModuleInstance>) => sel && commit(updateModule(data, sel, patch));
  const markDirty = () => {
    if (readOnly) return;
    dirty.current = true;
    setSave({ kind: 'dirty' });
  };
  const goPhase = (n: number) => {
    if (n === phase) return;
    if (project.status === 'aprobado' && n < 3) return flash('El proyecto está aprobado; duplícalo desde Mis proyectos para cambiar el diseño.');
    setPhase(n);
    setSel(null);
    markDirty();
  };
  const onStatus = (status: ProjectDetail['status']) => {
    setProject((p) => (p ? { ...p, status } : p));
    // Refresh this device's copy too, so it carries the new status and version.
    getProject(pid.current)
      .then((r) => setProject((cur) => (cur ? { ...cur, ...r.project, data: cur.data, name: cur.name } : r.project)))
      .catch(() => {});
  };
  const generate = () => {
    if (readOnly || genStep != null) return;
    const base = data;
    const tick = 450;
    setGenStep(0);
    for (let i = 0; i < GEN_STEPS.length; i++) setTimeout(() => setGenStep(i + 1), tick * (i + 1));
    setTimeout(() => {
      const g = generateDesign(base, catalog.context.modules);
      commit({ ...base, mods: g.mods, mats: g.mats });
      setPhase(2);
      setGenStep(null);
      setSel(null);
      setView('3d');
      flash(g.notes.length ? `Distribución generada con ${g.mods.length} módulos · ${g.notes[0]}` : `Distribución generada con ${g.mods.length} módulos · Ctrl+Z para deshacer`);
    }, tick * GEN_STEPS.length + 350);
  };
  const sig = (mods: ModuleInstance[]) => mods.map((m) => `${m.code}${m.wall}${m.pos ?? m.x}${m.w}`).join();
  const alts = suggest
    ? (data.ptype === 'cocina'
        ? ([
            ['En L optimizada', 'L'],
            ['En L con isla', 'isla'],
            ['Lineal con columnas', 'lineal'],
          ] as const)
        : ([
            ['Puertas abatibles', 'lineal'],
            ['Vestidor abierto', 'abierto'],
            ['Mixto', 'U'],
          ] as const)
      ).map(([label, layout]) => {
        const g = generateDesign({ ...data, layout }, catalog.context.modules);
        const next: ProjectData = { ...data, layout, mods: g.mods, mats: g.mats };
        const ml = g.mods.filter((m) => m.type !== 'upper' && m.type !== 'hood').reduce((a, m) => a + m.w, 0) / 100;
        return { label, next, current: sig(g.mods) === sig(data.mods), ml, total: computeEstimate(next, catalog.context, currency).total, art: iso(next, materialsByCode as never, { cotas: false, altos: true }) };
      })
    : [];
  const usedWalls: Wall[] = ['A', 'B', ...(['C', 'D'] as const).filter((w) => data.mods.some((m) => m.wall === w))];
  const is3d = view === '3d';
  const phases = [
    { n: 1, label: 'Especificaciones', short: 'Datos' },
    { n: 2, label: 'Diseño', short: 'Diseño' },
    { n: 3, label: 'Aprobación', short: 'Aprobar' },
  ];
  const controls: { k: string; icon: string; tip: string; key: string; on?: boolean; act: () => void }[] = [
    { k: 'zin', icon: 'zoom-in', tip: 'Acercar', key: '+', act: () => (is3d && viewer.current ? viewer.current.zoomBy(1.25) : setZoom((z) => Math.min(2.6, +(z * 1.25).toFixed(2)))) },
    { k: 'zout', icon: 'zoom-out', tip: 'Alejar', key: '−', act: () => (is3d && viewer.current ? viewer.current.zoomBy(1 / 1.25) : setZoom((z) => Math.max(0.6, +(z / 1.25).toFixed(2)))) },
    { k: 'fit', icon: 'scan', tip: 'Centrar vista', key: 'F', act: () => (is3d && viewer.current ? viewer.current.fit(false, 'auto') : setZoom(1)) },
    { k: 'rot', icon: 'rotate-cw', tip: 'Rotar cámara', key: 'R', act: () => (setView('3d'), viewer.current?.setAngle(25)) },
    { k: 'cotas', icon: 'ruler', tip: 'Cotas', key: 'C', on: cotas, act: () => setCotas(!cotas) },
    { k: 'altos', icon: 'layers', tip: 'Mostrar altos', key: 'A', on: altos, act: () => setAltos(!altos) },
    { k: 'open', icon: 'door-open', tip: open ? 'Cerrar puertas y cajones' : 'Abrir puertas y cajones', key: 'P', on: open, act: () => (setView('3d'), setOpen(!open), viewer.current?.setOpen(!open)) },
  ];
  const saveLabel =
    save.kind === 'saving'
      ? 'Guardando…'
      : save.kind === 'dirty'
        ? 'Cambios sin guardar'
        : save.kind === 'error'
          ? save.message
          : pending
            ? sync?.online
              ? 'Guardado · subiendo…'
              : 'Guardado en este dispositivo'
            : `Guardado ${relativeTime(save.at).toLowerCase()}`;
  const flatView = view === 'planta' ? planDrawing : view === 'alzado' ? elevDrawing : null;

  return (
    <div data-theme={dark ? 'dark' : 'light'} style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)', overflow: 'hidden', position: 'relative' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 14, height: 60, padding: '0 16px', borderBottom: '2px solid var(--color-divider)', background: 'var(--color-bg)', flex: 'none', minWidth: 0 }}>
        <Brand />
        <div style={{ width: 2, height: 28, background: 'var(--color-divider)', flex: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: '0 1 230px' }}>
          <input
            className="pname"
            value={name}
            disabled={readOnly}
            onChange={(e) => {
              setName(e.target.value);
              dirty.current = true;
              setSave({ kind: 'dirty' });
            }}
            aria-label="Nombre del proyecto"
            style={{ font: 'inherit', fontWeight: 600, fontSize: 14, color: 'var(--color-text)', background: 'transparent', border: '1px solid transparent', padding: '6px 8px', minWidth: 0, width: '100%' }}
          />
          <Icon name="pencil" size={13} style={{ opacity: 0.5 }} />
        </div>
        <nav className="phases" style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '0 auto', flex: 'none' }}>
          {phases.map((p, i) => {
            const cur = p.n === phase;
            const done = p.n < phase || (p.n === 3 && project.status === 'aprobado');
            return (
              <div key={p.n} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button type="button" onClick={() => goPhase(p.n)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 0, padding: 8, cursor: 'pointer', color: cur ? 'var(--color-text)' : MUTED, font: 'inherit', fontSize: 13, fontWeight: cur ? 800 : 600 }}>
                  <span style={{ width: 24, height: 24, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, background: cur ? 'var(--color-accent)' : done ? 'var(--color-text)' : 'transparent', color: cur || done ? '#fff' : 'var(--color-text)', border: `2px solid ${cur ? 'var(--color-accent)' : done ? 'var(--color-text)' : 'var(--color-divider)'}` }}>
                    {done && !cur ? <Icon name="check" size={13} /> : p.n}
                  </span>
                  <span className="phase-label" style={{ whiteSpace: 'nowrap' }}>
                    {p.label}
                  </span>
                </button>
                {i < phases.length - 1 && <span style={{ width: 28, height: 2, background: 'var(--color-divider)' }} />}
              </div>
            );
          })}
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
          <span className="save-state" style={{ fontSize: 12, color: save.kind === 'error' ? 'var(--color-accent-700)' : MUTED, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6, marginRight: 6 }}>
            <Icon name={save.kind === 'error' ? 'cloud-alert' : save.kind === 'saved' && !pending ? 'cloud-check' : save.kind === 'saved' && !sync?.online ? 'hard-drive' : 'cloud-upload'} size={14} />
            {readOnly && !conflict ? 'Solo lectura' : saveLabel}
          </span>
          <SyncBadge compact />
          <button type="button" className="btn btn-icon ed-hide-xs" title="Deshacer (Ctrl+Z)" aria-label="Deshacer" onClick={undo} disabled={readOnly || !hist.current.length}>
            <Icon name="undo-2" size={18} />
          </button>
          <button type="button" className="btn btn-icon ed-hide-xs" title="Rehacer (Ctrl+Y)" aria-label="Rehacer" onClick={redo} disabled={readOnly || !fut.current.length}>
            <Icon name="redo-2" size={18} />
          </button>
          <button type="button" className="btn btn-icon ed-hide-xs" title="Bibliotecas de texturas y módulos" aria-label="Bibliotecas" onClick={() => setLibTab('tex')}>
            <Icon name="library" size={17} />
          </button>
          <button type="button" className="btn btn-icon ed-hide-xs" title="Modo oscuro del editor" aria-label="Modo oscuro" onClick={() => setDark(!dark)}>
            <Icon name={dark ? 'sun' : 'moon'} size={17} />
          </button>
          <div style={{ width: 2, height: 28, background: 'var(--color-divider)', margin: '0 4px' }} />
          <button type="button" className="btn btn-primary" onClick={() => doSave()} disabled={readOnly || save.kind === 'saving'} title="Guardar (Ctrl+S)" style={{ height: 38 }}>
            <Icon name="save" />
            <span className="phase-label">Guardar</span>
          </button>
          <button type="button" className="btn btn-icon" title={project.access === 'propietario' ? 'Compartir' : 'Personas con acceso'} aria-label="Compartir" onClick={() => setShareOpen(true)}>
            <Icon name={project.shareCount > 0 || project.access !== 'propietario' ? 'users' : 'share-2'} size={18} />
          </button>
          <UserMenu />
        </div>
      </header>

      {/* Phones and tablets: the phase stepper and edit tools that do not fit in the header. */}
      <div className="ed-mbar" role="navigation" aria-label="Fases del proyecto">
        {phases.map((p) => {
          const cur = p.n === phase;
          const done = p.n < phase || (p.n === 3 && project.status === 'aprobado');
          return (
            <button key={p.n} type="button" onClick={() => goPhase(p.n)} aria-current={cur ? 'step' : undefined} className={cur ? 'ed-mstep on' : 'ed-mstep'}>
              <span className="ed-mnum">{done && !cur ? <Icon name="check" size={12} /> : p.n}</span>
              <span className="ed-mlabel">{p.short}</span>
            </button>
          );
        })}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-icon ed-mtool" title="Deshacer" aria-label="Deshacer" onClick={undo} disabled={readOnly || !hist.current.length}>
          <Icon name="undo-2" size={18} />
        </button>
        <button type="button" className="btn btn-icon ed-mtool" title="Rehacer" aria-label="Rehacer" onClick={redo} disabled={readOnly || !fut.current.length}>
          <Icon name="redo-2" size={18} />
        </button>
        <button type="button" className="btn btn-icon ed-mtool" title="Bibliotecas" aria-label="Bibliotecas" onClick={() => setLibTab('tex')}>
          <Icon name="library" size={17} />
        </button>
      </div>

      {readOnly && !conflict && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: project.status === 'aprobado' ? 'var(--color-accent-100)' : 'var(--color-neutral-200)', color: project.status === 'aprobado' ? 'var(--color-accent-800)' : 'var(--color-text)', fontSize: 13, borderBottom: '1px solid var(--color-divider)' }}>
          <Icon name={project.status === 'aprobado' ? 'lock' : 'eye'} size={15} />
          {project.status === 'aprobado' ? 'Proyecto aprobado: el diseño está bloqueado para producción. Duplícalo desde Mis proyectos para hacer cambios.' : project.access === 'ver'
              ? `Solo lectura: ${project.ownerName ?? 'otra persona'} te compartió este proyecto para verlo. Puedes duplicarlo desde Mis proyectos para trabajar sobre una copia.`
              : 'Solo lectura: tu rol no permite editar proyectos.'}
        </div>
      )}

      {phase === 3 ? (
        <ApprovalView
          project={project}
          data={data}
          catalog={catalog}
          materialsByCode={materialsByCode}
          estimate={estimate}
          currency={currency}
          issues={issues}
          canManage={!readOnly}
          orgName={me?.organization.name ?? 'Planner'}
          commit={commit}
          ensureSaved={ensureOnServer}
          onStatus={onStatus}
          flash={flash}
        />
      ) : phase === 1 ? (
        <SpecWizard data={data} step={specStep} setStep={setSpecStep} commit={commit} onGenerate={generate} currency={currency} readOnly={readOnly} flash={flash} />
      ) : (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="ed-body" style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative' }}>
          {(leftOpen || rightOpen) && <div className="ed-scrim" onClick={() => (setLeftOpen(false), setRightOpen(false))} />}
          {leftOpen ? (
            <LeftPanel
              tab={leftTab}
              setTab={setLeftTab}
              onClose={() => setLeftOpen(false)}
              data={data}
              catalog={catalog}
              materialsByCode={materialsByCode}
              q={q}
              setQ={setQ}
              cat={cat}
              setCat={setCat}
              onAdd={onAdd}
              replaceMode={replaceMode}
              onCancelReplace={() => setReplaceMode(false)}
              sel={selMod}
              applyTo={applyTo}
              setApplyTo={setApplyTo}
              onMaterial={onMaterial}
              readOnly={readOnly}
              onPick={(i) => (setSel(i), setRightOpen(true))}
              onLibrary={canCreate(me) ? setLibTab : undefined}
            />
          ) : (
            <div className="ed-rail ed-rail-left" style={{ width: 48, flex: 'none', borderRight: '2px solid var(--color-divider)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 8 }}>
              <button type="button" className="btn btn-icon" onClick={() => setLeftOpen(true)} title="Mostrar panel" aria-label="Mostrar panel">
                <Icon name="panel-left-open" size={18} />
              </button>
              {(
                [
                  ['modulos', 'layout-grid', 'Módulos'],
                  ['materiales', 'palette', 'Materiales'],
                  ['electro', 'refrigerator', 'Electro'],
                ] as const
              ).map(([k, ic, l]) => (
                <button type="button" key={k} className="btn btn-icon" onClick={() => (setLeftTab(k), setLeftOpen(true))} title={l} aria-label={l}>
                  <Icon name={ic} size={17} />
                </button>
              ))}
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0, position: 'relative', background: 'var(--sp-canvas)', overflow: 'hidden' }}>
            {cfg && <div style={{ position: 'absolute', inset: 0, visibility: is3d ? 'visible' : 'hidden' }}><Viewer3D cfg={cfg} onSelect={(i) => { setSel(i); if (i) setRightOpen(true); setReplaceMode(false); }} onViewer={(v) => { viewer.current = v; v?.setOpen(open); }} fallback={<Svg drawing={isoDrawing} onPick={setSel} />} /></div>}
            {flatView && (
              <div style={{ position: 'absolute', inset: '64px 72px 24px 32px', transform: `scale(${zoom})`, transformOrigin: 'center' }}>
                <Svg drawing={flatView} onPick={(i) => (setSel(i), i && setRightOpen(true))} />
              </div>
            )}

            <div style={{ position: 'absolute', top: 12, left: 12, right: 64, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', zIndex: 3 }}>
              <div style={{ display: 'flex', background: 'var(--color-bg)', border: '1px solid var(--color-divider)', boxShadow: 'var(--shadow-sm)' }}>
                {(
                  [
                    ['3d', '3D', 'box'],
                    ['planta', 'Planta', 'square-dashed'],
                    ['alzado', 'Alzado', 'panels-top-left'],
                  ] as const
                ).map(([k, l, ic]) => (
                  <button type="button" key={k} onClick={() => setView(k)} title={k === '3d' ? '3D Perspectiva' : l} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', font: 'inherit', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', border: 0, cursor: 'pointer', background: view === k ? 'var(--color-text)' : 'transparent', color: view === k ? 'var(--color-bg)' : 'var(--color-text)' }}>
                    <Icon name={ic} size={15} />
                    {l}
                  </button>
                ))}
              </div>
              {view === 'alzado' && (
                <div style={{ display: 'flex', background: 'var(--color-bg)', border: '1px solid var(--color-divider)', boxShadow: 'var(--shadow-sm)' }}>
                  {usedWalls.map((w) => (
                    <button type="button" key={w} onClick={() => setWall(w)} style={{ padding: '8px 12px', font: 'inherit', fontSize: 13, fontWeight: 800, border: 0, cursor: 'pointer', background: wall === w ? 'var(--color-text)' : 'transparent', color: wall === w ? 'var(--color-bg)' : 'var(--color-text)' }}>
                      Muro {w}
                    </button>
                  ))}
                </div>
              )}
              {!readOnly && (
                <button type="button" className="btn btn-primary" onClick={() => setSuggest(true)} style={{ height: 38, boxShadow: 'var(--shadow-md)' }}>
                  <Icon name="layout-dashboard" size={16} />
                  <span className="phase-label">Sugerir distribución automática</span>
                </button>
              )}
            </div>

            <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', border: '1px solid var(--color-divider)', boxShadow: 'var(--shadow-sm)', zIndex: 3 }}>
              {controls.map((c, i) => (
                <div key={c.k} style={{ position: 'relative' }}>
                  <button type="button"
                    onClick={c.act}
                    onMouseEnter={() => setTip(c.k)}
                    onMouseLeave={() => setTip(null)}
                    onFocus={() => setTip(c.k)}
                    onBlur={() => setTip(null)}
                    aria-label={c.tip}
                    style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', border: 0, cursor: 'pointer', background: c.on ? 'var(--color-text)' : 'transparent', color: c.on ? 'var(--color-bg)' : 'var(--color-text)', borderTop: i && i === 4 ? '2px solid var(--color-divider)' : undefined }}
                  >
                    <Icon name={c.icon} size={17} />
                  </button>
                  {tip === c.k && (
                    <span role="tooltip" style={{ position: 'absolute', right: 48, top: 8, whiteSpace: 'nowrap', background: 'var(--color-text)', color: 'var(--color-bg)', fontSize: 12, padding: '5px 9px', pointerEvents: 'none', zIndex: 5 }}>
                      {c.tip}
                      <span style={{ opacity: 0.6, marginLeft: 8 }}>{c.key}</span>
                    </span>
                  )}
                </div>
              ))}
            </div>

            {view !== 'planta' && data.mods.length > 0 && (
              <div className="minimap" style={{ position: 'absolute', left: 12, bottom: 12, width: 190, height: 160, background: 'var(--color-bg)', border: '1px solid var(--color-divider)', boxShadow: 'var(--shadow-sm)', padding: 6, display: 'flex', flexDirection: 'column', zIndex: 3 }}>
                <span style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: MUTED }}>Planta</span>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <Svg drawing={plan(data, { sel, cotas: false, nums: false })} onPick={setSel} />
                </div>
              </div>
            )}
            {selMod && (
              <div style={{ position: 'absolute', left: '50%', bottom: 14, transform: 'translateX(-50%)', background: 'var(--color-bg)', border: '1px solid var(--color-divider)', boxShadow: 'var(--shadow-sm)', padding: '7px 12px', fontSize: 13, display: 'flex', gap: 10, alignItems: 'center', whiteSpace: 'nowrap', zIndex: 3 }}>
                <span style={{ width: 20, height: 20, background: 'var(--color-accent)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800 }}>{selMod.id}</span>
                <strong>{selMod.name}</strong>
                <span style={{ opacity: 0.7 }}>
                  {selMod.w * 10} × {selMod.h * 10} × {selMod.d * 10} mm
                </span>
              </div>
            )}
            {data.mods.length === 0 && (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', zIndex: 4 }}>
                <div style={{ width: 'min(440px,80%)', border: '2px dashed var(--color-divider)', padding: 32, background: 'color-mix(in srgb,var(--color-bg) 85%,transparent)', pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Icon name="mouse-pointer-2" size={28} style={{ color: 'var(--color-accent)' }} />
                  <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}>Agrega tu primer módulo</div>
                  <div style={{ fontSize: 14, color: 'color-mix(in srgb,var(--color-text) 68%,transparent)' }}>Elige un módulo en el panel izquierdo; se coloca en el primer espacio libre del muro.</div>
                  <button type="button" className="btn btn-secondary" onClick={() => (setLeftOpen(true), setLeftTab('modulos'))} style={{ width: 'max-content' }}>
                    Ver módulos
                  </button>
                </div>
              </div>
            )}
          </div>

          {rightOpen ? (
            <RightPanel
              data={data}
              sel={selMod}
              materials={catalog.materials}
              materialsByCode={materialsByCode}
              estimate={estimate}
              currency={currency}
              rate={rate}
              readOnly={readOnly}
              onClose={() => setRightOpen(false)}
              onDeselect={() => setSel(null)}
              onDim={(k, v) => sel && commit(setDim(data, sel, k, v))}
              onFronts={(n) => sel && commit(setFrontCount(data, sel, n))}
              onPatch={patchSel}
              onHerraje={(v) => sel && commit({ ...data, herr: { ...(data.herr ?? {}), [String(sel)]: v } })}
              onPrice={(v) => patchSel({ pOv: v == null ? undefined : Math.max(0, v) })}
              onDuplicate={() => {
                if (!sel) return;
                const r = duplicateModule(data, sel);
                if (!r) return flash('No hay espacio libre para duplicarlo');
                commit(r.project);
                setSel(r.id);
                flash(`Módulo ${sel} duplicado como ${r.id}`);
              }}
              onReplace={() => {
                setReplaceMode(true);
                setLeftOpen(true);
                setLeftTab('modulos');
              }}
              onRemove={() => {
                if (!sel) return;
                commit(removeModule(data, sel));
                flash(`Módulo ${sel} eliminado · Ctrl+Z para deshacer`);
                setSel(null);
              }}
            />
          ) : (
            <div className="ed-rail ed-rail-right" style={{ width: 48, flex: 'none', borderLeft: '2px solid var(--color-divider)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 8 }}>
              <button type="button" className="btn btn-icon" onClick={() => setRightOpen(true)} title="Mostrar propiedades" aria-label="Mostrar propiedades">
                <Icon name="panel-right-open" size={18} />
              </button>
            </div>
          )}
        </div>

        <BottomBar
          issues={issues}
          estimate={estimate}
          data={data}
          currency={currency}
          rate={rate}
          readOnly={readOnly}
          orgTaxRate={catalog.pricing.taxRate}
          onPick={(i) => (setSel(i), setRightOpen(true))}
          onPriceAdj={(patch) => commit({ ...data, priceAdj: { ...data.priceAdj, ...patch } })}
          onResetPrices={() => commit({ ...data, priceAdj: { ...data.priceAdj, inst: 8, desc: 0, final: null, counter: null }, mods: data.mods.map(({ pOv: _p, ...m }) => m as ModuleInstance) })}
          onApproval={() => goPhase(3)}
        />
      </div>
      )}

      {conflict != null && (
        <Dialog
          title="Tus cambios se guardaron como copia"
          onClose={() => {}}
          actions={
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  const r = await getProject(pid.current).catch(() => null);
                  setConflict(null);
                  if (r) applyProject(r.project);
                }}
              >
                Ver la versión actual
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  dirty.current = false;
                  setConflict(null);
                  nav(`/proyectos/${conflict.copyId}`);
                }}
              >
                Abrir mi copia
              </button>
            </>
          }
        >
          {conflict.reason} Para que no se pierda nada, tu versión quedó guardada en el proyecto «{conflict.copyName}». Este proyecto conserva la versión del servidor.
        </Dialog>
      )}
      {shareOpen && me && (
        <ShareDialog
          projectId={pid.current}
          projectName={name || project.name}
          myAccess={project.access}
          meId={me.user.id}
          onClose={() => setShareOpen(false)}
          onChange={(n) => setProject((p) => (p ? { ...p, shareCount: n } : p))}
        />
      )}
      {genStep != null && (
        <div style={{ position: 'absolute', inset: 0, background: 'color-mix(in srgb,var(--color-bg) 92%,transparent)', display: 'grid', placeItems: 'center', zIndex: 40 }}>
          <div style={{ width: 'min(440px,90%)', display: 'flex', flexDirection: 'column', gap: 16 }} role="status" aria-live="polite">
            <span style={{ width: 40, height: 40, border: '3px solid var(--color-neutral-300)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spspin .9s linear infinite' }} />
            <div style={{ fontSize: 26, fontWeight: 800 }}>Generando distribución…</div>
            <div style={{ height: 4, background: 'var(--color-neutral-300)' }}>
              <div style={{ height: 4, background: 'var(--color-accent)', width: `${(genStep / GEN_STEPS.length) * 100}%`, transition: 'width .5s' }} />
            </div>
            {GEN_STEPS.map((label, i) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: i <= genStep ? 'var(--color-text)' : MUTED }}>
                <Icon name={i < genStep ? 'circle-check' : i === genStep ? 'loader' : 'circle'} size={16} />
                {label}
              </div>
            ))}
          </div>
        </div>
      )}
      {suggest && (
        <Dialog title="Distribuciones sugeridas" onClose={() => setSuggest(false)} width={960}>
          <p style={{ margin: '0 0 16px' }}>Calculadas con tus medidas, instalaciones y electrodomésticos. Elige una para reemplazar la escena actual (puedes deshacer).</p>
          <div className="alts" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 14 }}>
            {alts.map((a) => (
              <div key={a.label} style={{ display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', border: `2px solid ${a.current ? 'var(--color-accent)' : 'var(--color-divider)'}` }}>
                <div style={{ height: 190, background: 'var(--sp-canvas)', padding: 8 }}>
                  <Svg drawing={a.art} title={a.label} />
                </div>
                <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8, color: 'var(--color-text)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, fontSize: 16 }}>{a.label}</span>
                    {a.current && <span className="tag tag-accent">Actual</span>}
                  </div>
                  {(
                    [
                      ['Módulos', String(a.next.mods.length)],
                      ['Metros lineales', `${a.ml.toFixed(1).replace('.', ',')} m`],
                      ['Precio estimado', fmtMoney(a.total, currency)],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: MUTED }}>{k}</span>
                      <strong>{v}</strong>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      commit(a.next);
                      setSuggest(false);
                      setSel(null);
                      flash(`Distribución "${a.label}" aplicada · Ctrl+Z para deshacer`);
                    }}
                    style={{ justifyContent: 'space-between', marginTop: 4 }}
                  >
                    Usar esta distribución
                    <Icon name="arrow-right" size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Dialog>
      )}
      {libTab && (
        <LibraryDialog
          initialTab={libTab}
          canWrite={canCreate(me)}
          onClose={() => setLibTab(null)}
          onChanged={() =>
            getCatalog()
              .then((c) => {
                installEngine(c.materials);
                setCatalog(c);
                flash('Biblioteca actualizada');
              })
              .catch(() => flash('Recarga la página para ver los cambios de la biblioteca.'))
          }
        />
      )}
      {toast}
      <style>{`
        .pname:hover{border-color:var(--color-divider)!important}
        .pname:focus{border-color:var(--color-accent)!important;outline:none;background:var(--color-surface)!important}
        .lib-card:hover{border-color:var(--color-accent)!important}
        .tab-btn:hover,.val-btn:hover{background:color-mix(in srgb,var(--color-text) 5%,transparent)!important}
        @media (max-width: 1440px){.phase-label{display:none!important}}
        @media (max-width: 1100px){.save-state{display:none!important}}
        @media (max-width: 700px){.brand-name{display:none!important}}
        @media (max-width: 900px){
          .phases,.minimap{display:none!important}
          .alts{grid-template-columns:minmax(0,1fr)!important}
          .ed-body>aside{position:absolute;top:0;bottom:0;z-index:30;width:min(88vw,340px)!important;box-shadow:var(--shadow-lg)}
          .ed-body .ed-left{left:0}
          .ed-body .ed-right{right:0}
          .ed-scrim{position:absolute;inset:0;z-index:29;background:rgba(0,0,0,.25)}
        }
        @media (min-width: 901px){.ed-scrim{display:none}.ed-mbar{display:none!important}}
        .ed-mbar{display:flex;align-items:center;gap:2px;padding:4px 8px;border-bottom:1px solid var(--color-divider);background:var(--color-bg);flex:none;min-height:44px}
        .ed-mstep{display:flex;align-items:center;gap:6px;background:none;border:0;padding:6px 8px;font:inherit;font-size:13px;font-weight:600;color:${MUTED};cursor:pointer;white-space:nowrap;min-height:40px}
        .ed-mstep.on{color:var(--color-text);font-weight:800}
        .ed-mnum{width:22px;height:22px;display:grid;place-items:center;font-size:12px;font-weight:800;border:2px solid var(--color-divider)}
        .ed-mstep.on .ed-mnum{background:var(--color-accent);border-color:var(--color-accent);color:#fff}
        @media (min-width: 561px){.ed-mtool{display:none!important}}
        @media (max-width: 360px){.ed-mstep:not(.on) .ed-mlabel{display:none}}
        @media (max-width: 700px){.bb-issues{grid-template-columns:minmax(0,1fr)!important;max-height:45dvh!important}}
        @media (max-width: 560px){
          .ed-hide-xs,.bb-hide-xs,.bb-first{display:none!important}
          .bb-row{gap:8px!important;padding:6px 10px!important;justify-content:space-between}
          header{gap:6px!important;padding:0 8px!important}
          /* the collapsed side rails float over the 3D view instead of taking width */
          .ed-rail{position:absolute;z-index:20;width:auto!important;border:0!important;background:var(--color-bg);box-shadow:var(--shadow-sm);padding:4px!important}
          .ed-rail-left{left:8px;bottom:8px}
          .ed-rail-right{right:8px;bottom:8px}
        }
        @keyframes spspin{to{transform:rotate(360deg)}}
      `}</style>
      <span hidden>{fmtMoney(0, currency)}</span>
    </div>
  );
}
