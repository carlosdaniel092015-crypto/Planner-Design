import {
  addModule,
  applyMaterial,
  computeEstimate,
  type Currency,
  duplicateModule,
  elev,
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
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api, type Catalog, type CatalogMaterial, type ProjectDetail } from '../api';
import { canEdit, FullScreenLoader, useAuth } from '../auth';
import { BottomBar } from '../editor/BottomBar';
import { installEngine, sceneCfg, type Viewer } from '../editor/engine';
import { LeftPanel, type LeftTab } from '../editor/LeftPanel';
import { RightPanel } from '../editor/RightPanel';
import { Viewer3D } from '../editor/Viewer3D';
import { UserMenu } from '../UserMenu';
import { Brand, Dialog, fmtMoney, Icon, MUTED, relativeTime, Svg, toUsd, useToast } from '../ui';

type View = '3d' | 'planta' | 'alzado';
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
  const [wall, setWall] = useState<'A' | 'B'>('A');
  const [cotas, setCotas] = useState(true);
  const [altos, setAltos] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [dark, setDark] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftTab, setLeftTab] = useState<LeftTab>('modulos');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('Todos');
  const [applyTo, setApplyTo] = useState<'todo' | 'modulo'>('todo');
  const [replaceMode, setReplaceMode] = useState(false);
  const [curOpen, setCurOpen] = useState(false);
  const [tip, setTip] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: 'saved', at: new Date().toISOString() });
  const [conflict, setConflict] = useState<number | null>(null);
  const viewer = useRef<Viewer | null>(null);
  const version = useRef(0);
  const dirty = useRef(false);
  const saving = useRef(false);

  // ---------- load ----------
  useEffect(() => {
    let dead = false;
    Promise.all([api.getProject(id), api.catalog()])
      .then(([p, c]) => {
        if (dead) return;
        installEngine(c.materials);
        setCatalog(c);
        setProject(p);
        setData(p.data);
        setName(p.name);
        setCurrency(p.currency);
        version.current = p.version;
        setSave({ kind: 'saved', at: p.updatedAt });
      })
      .catch((e) => !dead && setLoadError(e instanceof ApiError ? e.message : 'No se pudo abrir el proyecto.'));
    return () => {
      dead = true;
    };
  }, [id]);

  const readOnly = !project || project.status === 'aprobado' || !canEdit(me, project.ownerId);
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

  // ---------- save ----------
  const doSave = useCallback(
    async (overrideVersion?: number) => {
      if (!project || !data || readOnly || saving.current) return;
      saving.current = true;
      dirty.current = false;
      setSave({ kind: 'saving' });
      try {
        const res = await api.saveProject(project.id, { version: overrideVersion ?? version.current, name: name.trim() || data.pname, currency, data: { ...data, pname: name.trim() || data.pname } });
        version.current = res.version;
        setProject((p) => (p ? { ...p, ...res, data: p.data } : res));
        setSave(dirty.current ? { kind: 'dirty' } : { kind: 'saved', at: res.updatedAt });
      } catch (e) {
        dirty.current = true;
        if (e instanceof ApiError && e.code === 'VERSION_DESACTUALIZADA') {
          setConflict((e.details as { currentVersion?: number })?.currentVersion ?? null);
          setSave({ kind: 'error', message: 'Conflicto de versión' });
        } else if (e instanceof ApiError && e.code === 'PROYECTO_APROBADO') {
          setProject((p) => (p ? { ...p, status: 'aprobado' } : p));
          setSave({ kind: 'error', message: 'El proyecto ya está aprobado' });
        } else setSave({ kind: 'error', message: e instanceof ApiError ? e.message : 'Sin conexión; se reintentará.' });
      } finally {
        saving.current = false;
      }
    },
    [project, data, name, currency, readOnly],
  );

  // Autosave 2 s after the last change.
  useEffect(() => {
    if (save.kind !== 'dirty' || readOnly || conflict != null) return;
    const t = setTimeout(() => doSave(), 2000);
    return () => clearTimeout(t);
  }, [save, doSave, readOnly, conflict]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty.current && currentLocation.pathname !== nextLocation.pathname);

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
      <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: 'var(--color-bg)' }}>
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
  const is3d = view === '3d';
  const phases = [
    { n: 1, label: 'Especificaciones' },
    { n: 2, label: 'Diseño' },
    { n: 3, label: 'Aprobación' },
  ];
  const controls: { k: string; icon: string; tip: string; key: string; on?: boolean; act: () => void }[] = [
    { k: 'zin', icon: 'zoom-in', tip: 'Acercar', key: '+', act: () => (is3d && viewer.current ? viewer.current.zoomBy(1.25) : setZoom((z) => Math.min(2.6, +(z * 1.25).toFixed(2)))) },
    { k: 'zout', icon: 'zoom-out', tip: 'Alejar', key: '−', act: () => (is3d && viewer.current ? viewer.current.zoomBy(1 / 1.25) : setZoom((z) => Math.max(0.6, +(z / 1.25).toFixed(2)))) },
    { k: 'fit', icon: 'scan', tip: 'Centrar vista', key: 'F', act: () => (is3d && viewer.current ? viewer.current.fit(false, Math.PI / 4) : setZoom(1)) },
    { k: 'rot', icon: 'rotate-cw', tip: 'Rotar cámara', key: 'R', act: () => (setView('3d'), viewer.current?.setAngle(25)) },
    { k: 'cotas', icon: 'ruler', tip: 'Cotas', key: 'C', on: cotas, act: () => setCotas(!cotas) },
    { k: 'altos', icon: 'layers', tip: 'Mostrar altos', key: 'A', on: altos, act: () => setAltos(!altos) },
  ];
  const saveLabel = save.kind === 'saving' ? 'Guardando…' : save.kind === 'dirty' ? 'Cambios sin guardar' : save.kind === 'error' ? save.message : `Guardado ${relativeTime(save.at).toLowerCase()}`;
  const flatView = view === 'planta' ? planDrawing : view === 'alzado' ? elevDrawing : null;

  return (
    <div data-theme={dark ? 'dark' : 'light'} style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)', overflow: 'hidden', position: 'relative' }}>
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
            const cur = p.n === 2;
            const done = p.n === 1 || (p.n === 3 && project.status === 'aprobado');
            return (
              <div key={p.n} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button type="button" onClick={() => !cur && flash(`${p.label}: disponible en la siguiente etapa del frontend.`)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 0, padding: 8, cursor: 'pointer', color: cur ? 'var(--color-text)' : MUTED, font: 'inherit', fontSize: 13, fontWeight: cur ? 800 : 600 }}>
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
            <Icon name={save.kind === 'saved' ? 'cloud-check' : save.kind === 'error' ? 'cloud-alert' : 'cloud-upload'} size={14} />
            {readOnly ? 'Solo lectura' : saveLabel}
          </span>
          <div style={{ position: 'relative' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setCurOpen(!curOpen)} title="Moneda y tipo de cambio" aria-expanded={curOpen} style={{ height: 38, padding: '0 10px' }}>
              <Icon name="banknote" />
              {currency === 'USD' ? 'US$' : 'RD$'}
              <Icon name="chevron-down" size={14} />
            </button>
            {curOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 89 }} onClick={() => setCurOpen(false)} />
                <div style={{ position: 'absolute', right: 0, top: 46, width: 280, background: 'var(--color-surface)', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--color-divider)', padding: 14, zIndex: 90, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <h6 style={{ margin: 0 }}>Moneda</h6>
                  <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--color-divider)' }}>
                    {(
                      [
                        ['USD', 'Dólar estadounidense', 'US$'],
                        ['DOP', 'Peso dominicano', 'RD$'],
                      ] as const
                    ).map(([c, l, sym]) => (
                      <label key={c} className="radio" style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-divider)' }}>
                        <input
                          type="radio"
                          name="moneda"
                          checked={currency === c}
                          onChange={() => {
                            setCurrency(c);
                            if (!readOnly) {
                              dirty.current = true;
                              setSave({ kind: 'dirty' });
                            }
                            flash(c === 'USD' ? 'Precios en dólares estadounidenses (US$)' : 'Precios en pesos dominicanos (RD$)');
                          }}
                        />
                        <span className="dot" />
                        <span style={{ flex: 1 }}>{l}</span>
                        <strong>{sym}</strong>
                      </label>
                    ))}
                  </div>
                  <span style={{ fontSize: 12, color: MUTED }}>
                    1 US$ = RD${rate.toFixed(2)} · {project.pricesFrozen ? 'tasa congelada al aprobar.' : 'la tasa la define un administrador para toda la organización.'}
                  </span>
                </div>
              </>
            )}
          </div>
          <button type="button" className="btn btn-icon" title="Deshacer (Ctrl+Z)" aria-label="Deshacer" onClick={undo} disabled={readOnly || !hist.current.length}>
            <Icon name="undo-2" size={18} />
          </button>
          <button type="button" className="btn btn-icon" title="Rehacer (Ctrl+Y)" aria-label="Rehacer" onClick={redo} disabled={readOnly || !fut.current.length}>
            <Icon name="redo-2" size={18} />
          </button>
          <button type="button" className="btn btn-icon" title="Modo oscuro del editor" aria-label="Modo oscuro" onClick={() => setDark(!dark)}>
            <Icon name={dark ? 'sun' : 'moon'} size={17} />
          </button>
          <div style={{ width: 2, height: 28, background: 'var(--color-divider)', margin: '0 4px' }} />
          <button type="button" className="btn btn-primary" onClick={() => doSave()} disabled={readOnly || save.kind === 'saving'} title="Guardar (Ctrl+S)" style={{ height: 38 }}>
            <Icon name="save" />
            <span className="phase-label">Guardar</span>
          </button>
          <UserMenu />
        </div>
      </header>

      {readOnly && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: project.status === 'aprobado' ? 'var(--color-accent-100)' : 'var(--color-neutral-200)', color: project.status === 'aprobado' ? 'var(--color-accent-800)' : 'var(--color-text)', fontSize: 13, borderBottom: '1px solid var(--color-divider)' }}>
          <Icon name={project.status === 'aprobado' ? 'lock' : 'eye'} size={15} />
          {project.status === 'aprobado' ? 'Proyecto aprobado: el diseño está bloqueado para producción. Duplícalo desde Mis proyectos para hacer cambios.' : 'Solo lectura: este proyecto es de otro diseñador o tu rol no permite editar.'}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
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
            />
          ) : (
            <div style={{ width: 48, flex: 'none', borderRight: '2px solid var(--color-divider)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 8 }}>
              <button type="button" className="btn btn-icon" onClick={() => setLeftOpen(true)} title="Mostrar panel" aria-label="Mostrar panel">
                <Icon name="panel-left-open" size={18} />
              </button>
              {(
                [
                  ['modulos', 'layout-grid', 'Módulos'],
                  ['materiales', 'palette', 'Materiales'],
                ] as const
              ).map(([k, ic, l]) => (
                <button type="button" key={k} className="btn btn-icon" onClick={() => (setLeftTab(k), setLeftOpen(true))} title={l} aria-label={l}>
                  <Icon name={ic} size={17} />
                </button>
              ))}
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0, position: 'relative', background: 'var(--sp-canvas)', overflow: 'hidden' }}>
            {cfg && <div style={{ position: 'absolute', inset: 0, visibility: is3d ? 'visible' : 'hidden' }}><Viewer3D cfg={cfg} onSelect={(i) => { setSel(i); if (i) setRightOpen(true); setReplaceMode(false); }} onViewer={(v) => (viewer.current = v)} fallback={<Svg drawing={isoDrawing} onPick={setSel} />} /></div>}
            {flatView && (
              <div style={{ position: 'absolute', inset: '64px 72px 24px 32px', transform: `scale(${zoom})`, transformOrigin: 'center' }}>
                <Svg drawing={flatView} onPick={(i) => (setSel(i), i && setRightOpen(true))} />
              </div>
            )}

            <div style={{ position: 'absolute', top: 12, left: 12, right: 64, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', zIndex: 3 }}>
              <div style={{ display: 'flex', background: 'var(--color-bg)', border: '1px solid var(--color-divider)', boxShadow: 'var(--shadow-sm)' }}>
                {(
                  [
                    ['3d', '3D Perspectiva', 'box'],
                    ['planta', 'Planta', 'square-dashed'],
                    ['alzado', 'Alzado', 'panels-top-left'],
                  ] as const
                ).map(([k, l, ic]) => (
                  <button type="button" key={k} onClick={() => setView(k)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', font: 'inherit', fontSize: 13, fontWeight: 600, border: 0, cursor: 'pointer', background: view === k ? 'var(--color-text)' : 'transparent', color: view === k ? 'var(--color-bg)' : 'var(--color-text)' }}>
                    <Icon name={ic} size={15} />
                    {l}
                  </button>
                ))}
              </div>
              {view === 'alzado' && (
                <div style={{ display: 'flex', background: 'var(--color-bg)', border: '1px solid var(--color-divider)', boxShadow: 'var(--shadow-sm)' }}>
                  {(['A', 'B'] as const).map((w) => (
                    <button type="button" key={w} onClick={() => setWall(w)} style={{ padding: '8px 12px', font: 'inherit', fontSize: 13, fontWeight: 800, border: 0, cursor: 'pointer', background: wall === w ? 'var(--color-text)' : 'transparent', color: wall === w ? 'var(--color-bg)' : 'var(--color-text)' }}>
                      Muro {w}
                    </button>
                  ))}
                </div>
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
              onPrice={(v) => patchSel({ pOv: v == null ? undefined : Math.max(0, toUsd(v, currency, rate)) })}
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
            <div style={{ width: 48, flex: 'none', borderLeft: '2px solid var(--color-divider)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 8 }}>
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
          onPick={(i) => (setSel(i), setRightOpen(true))}
          onPriceAdj={(patch) => commit({ ...data, priceAdj: { ...data.priceAdj, ...patch } })}
          onResetPrices={() => commit({ ...data, priceAdj: { inst: 8, desc: 0, final: null, counter: null }, mods: data.mods.map(({ pOv: _p, ...m }) => m as ModuleInstance) })}
          onApproval={() => flash('La pantalla de aprobación y el envío al cliente llegan en la etapa 3.')}
        />
      </div>

      {conflict != null && (
        <Dialog
          title="Alguien más guardó cambios"
          onClose={() => setConflict(null)}
          actions={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>
                Recargar (descartar mis cambios)
              </button>
              <button type="button"
                className="btn btn-primary"
                onClick={() => {
                  const v = conflict;
                  setConflict(null);
                  doSave(v);
                }}
              >
                Guardar mi versión encima
              </button>
            </>
          }
        >
          Este proyecto se guardó desde otra pestaña o por otra persona (versión {conflict}). Puedes recargar para ver esa versión o reemplazarla con tus cambios.
        </Dialog>
      )}
      {blocker.state === 'blocked' && (
        <Dialog
          title="Tienes cambios sin guardar"
          onClose={() => blocker.reset()}
          actions={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => blocker.proceed()}>
                Salir sin guardar
              </button>
              <button type="button"
                className="btn btn-primary"
                onClick={async () => {
                  await doSave();
                  blocker.proceed();
                }}
              >
                Guardar y salir
              </button>
            </>
          }
        >
          Si sales ahora perderás los cambios que aún no se guardaron.
        </Dialog>
      )}
      {toast}
      <style>{`
        .pname:hover{border-color:var(--color-divider)!important}
        .pname:focus{border-color:var(--color-accent)!important;outline:none;background:var(--color-surface)!important}
        .lib-card:hover{border-color:var(--color-accent)!important}
        .tab-btn:hover,.val-btn:hover{background:color-mix(in srgb,var(--color-text) 5%,transparent)!important}
        @media (max-width: 1200px){.phase-label,.save-state{display:none!important}}
        @media (max-width: 900px){.phases,.minimap{display:none!important}}
      `}</style>
      <span hidden>{fmtMoney(0, currency)}</span>
    </div>
  );
}
