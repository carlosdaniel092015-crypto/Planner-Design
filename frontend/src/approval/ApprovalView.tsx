// Phase 3 — Aprobación: gallery, assembly drawings, cut list, PDF preview, send to client and sign-off.
import {
  camSchema,
  corte,
  type Drawing,
  type Estimate,
  elev,
  exploded,
  geo,
  iso,
  type ModuleInstance,
  ortho,
  type Part,
  parts,
  partsTable,
  plan,
  type ProjectData,
  type ValidationIssue,
} from '@core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, type Approval, type ApprovalLink, api, type Catalog, type CatalogMaterial, type Currency, type ProjectDetail } from '../api';
import { handleOf, sceneCfg } from '../editor/engine';
import { Dialog, fmtMoney, Icon, MUTED, relativeTime, Svg } from '../ui';
import { CameraDialog } from './CameraDialog';
import { downloadApi, exportPdf, Photo, SignaturePad } from './shared';

type Tab = 'galeria' | 'planos' | 'corte' | 'pdf';
type Wall = 'A' | 'B' | 'C' | 'D';
const SOFT = 'color-mix(in srgb,var(--color-text) 62%,transparent)';
const PDF_SECTIONS = [
  ['portada', 'Portada con datos del cliente'],
  ['vistas', 'Vistas 3D'],
  ['planta', 'Planta acotada'],
  ['alzados', 'Alzados por muro'],
  ['planos', 'Planos por módulo'],
  ['corte', 'Lista de corte'],
  ['presupuesto', 'Presupuesto'],
] as const;
type PdfKey = (typeof PDF_SECTIONS)[number][0];

const dateEs = (iso: string) => new Date(iso).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' });

export function ApprovalView(props: {
  project: ProjectDetail;
  data: ProjectData;
  catalog: Catalog;
  materialsByCode: Record<string, CatalogMaterial>;
  estimate: Estimate;
  currency: Currency;
  issues: ValidationIssue[];
  /** Can edit, send and approve (owner designer or admin, project not approved). */
  canManage: boolean;
  orgName: string;
  /** Organisation logo and brand colour for the PDF (Administración → Organización). */
  orgLogo?: string | null;
  orgColor?: string | null;
  commit: (next: ProjectData) => void;
  /** Saves pending edits; resolves false when the save failed. */
  ensureSaved: () => Promise<boolean>;
  onStatus: (status: ProjectDetail['status']) => void;
  flash: (m: string) => void;
}) {
  const { project, data, catalog, currency, estimate, flash } = props;
  const mats = catalog.context.materials;
  const approved = project.status === 'aprobado';
  const errors = props.issues.filter((i) => i.st === 'err');
  const [tab, setTab] = useState<Tab>('galeria');
  const [expOpen, setExpOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  /** null = automatic angle (faces the most fronts). */
  /** Which gallery photo is being framed by hand. */
  const [camEdit, setCamEdit] = useState<'persp' | 'det' | null>(null);
  const [regen, setRegen] = useState(0);
  const [planMod, setPlanMod] = useState<number | null>(null);
  const [pdf, setPdf] = useState<{ pct: number; step: string } | null>(null);
  const [history, setHistory] = useState<{ links: ApprovalLink[]; approvals: Approval[] } | null>(null);
  const pdfRoot = useRef<HTMLDivElement>(null);

  const loadHistory = () =>
    api
      .approvalLinks(project.id)
      .then(setHistory)
      .catch(() => setHistory({ links: [], approvals: [] }));
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload when the status changes (sent / approved)
  useEffect(() => {
    loadHistory();
  }, [project.id, project.status]);
  const lastApproval = history?.approvals.find((a) => a.decision === 'aprobado');
  const lastChanges = !approved && project.status === 'cambios_solicitados' ? history?.approvals.find((a) => a.decision === 'cambios') : undefined;

  const hstyle = handleOf(data.prefs.apertura);
  const cfg = useMemo(() => ({ ...sceneCfg(data, { sel: null, cotas: false, altos: true, dark: false }), regen }), [data, regen]);
  const walls: Wall[] = ['A', 'B', ...(['C', 'D'] as const).filter((w) => data.mods.some((m) => m.wall === w))];
  const buildable = useMemo(() => data.mods.filter((m) => parts(m, data.mats, mats).length), [data, mats]);
  const cut = useMemo(() => (tab === 'corte' || tab === 'pdf' ? corte(data, mats) : []), [tab, data, mats]);
  // Detail view: the module chosen in the gallery, else the sink/cooktop (kitchens) or the long hanging (closets).
  const cams = data.cams ?? {};
  const detMod =
    data.mods.find((m) => m.id === cams.det?.mod) ??
    (data.ptype === 'cocina' ? (data.mods.find((m) => m.sink) ?? data.mods.find((m) => m.cook)) : data.mods.find((m) => /colgado largo/i.test(m.name) || m.code === 'CL-100' || m.code === 'VL-100')) ??
    data.mods[0];
  const detCam = cams.det?.cam && (cams.det.mod == null || cams.det.mod === detMod?.id) ? cams.det.cam : undefined;
  const setCams = (next: NonNullable<ProjectData['cams']>) => props.commit({ ...data, cams: next });
  const detFocus = (m?: ModuleInstance): [number, number, number, number] | undefined => {
    if (!m) return undefined;
    const g = geo(m, data.room);
    return [(g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2, 80, 340];
  };
  const isoOf = (ang: number, focus?: [number, number, number, number]) => iso(data, props.materialsByCode as never, { ang, cotas: false, altos: true, focus });
  const planD = () => plan(data, { cotas: true });
  const elevD = (w: Wall) => elev(data, w, mats, { cotas: true });
  const persp = (w: number, h: number) => <Photo cfg={cfg} opts={cams.persp ? { w, h, cam: cams.persp } : { w, h }} fallback={isoOf(45)} title="Render en perspectiva" />;
  const detail = (w: number, h: number) =>
    detMod ? <Photo cfg={cfg} opts={detCam ? { w, h, cam: detCam } : { w, h, ang: 35, focusId: detMod.id }} fallback={isoOf(35, detFocus(detMod))} title={`Detalle · ${detMod.name}`} /> : null;
  const detLabel = detMod?.sink ? 'fregadero' : detMod?.cook ? 'parrilla' : (detMod?.name.toLowerCase() ?? '');
  const camCfg = useMemo(() => sceneCfg(data, { sel: null, cotas: false, altos: true, dark: false }), [data]);

  const guard = async () => {
    if (!(await props.ensureSaved())) {
      flash('Guarda los cambios pendientes antes de continuar.');
      return false;
    }
    return true;
  };
  const doExport = async (kind: 'pdf' | 'csv' | 'dxf') => {
    setExpOpen(false);
    try {
      if (kind === 'pdf') {
        setTab('pdf');
        await new Promise((r) => setTimeout(r, 400));
        if (!pdfRoot.current) return;
        setPdf({ pct: 3, step: 'Preparando páginas…' });
        const name = await exportPdf(pdfRoot.current, project.name, (pct, step) => setPdf({ pct, step }));
        flash(`PDF descargado: ${name}`);
      } else {
        if (!(await guard())) return;
        const name = kind === 'csv' ? await downloadApi(`/projects/${project.id}/cutlist.csv`, 'lista-de-corte.csv') : await downloadApi(`/projects/${project.id}/pieces.dxf`, 'piezas.dxf');
        flash(kind === 'csv' ? `Lista de corte descargada (${name}, compatible con Excel)` : `Piezas en DXF descargadas (${name}, en mm)`);
      }
    } catch (e) {
      flash(`No se pudo exportar: ${e instanceof Error ? e.message : 'error'}`);
    } finally {
      setPdf(null);
    }
  };

  const tabs: [Tab, string, string][] = [
    ['galeria', 'Galería de vistas', 'images'],
    ['planos', 'Planos de ensamblaje', 'drafting-compass'],
    ['corte', 'Lista de corte', 'scissors'],
    ['pdf', 'Vista previa PDF', 'file-text'],
  ];

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 12, padding: '0 16px', borderBottom: '2px solid var(--color-divider)', flex: 'none', minWidth: 0 }}>
        <div style={{ display: 'flex', minWidth: 0, overflowX: 'auto' }}>
          {tabs.map(([k, label, icon]) => (
            <button type="button" key={k} className="tab-btn" onClick={() => setTab(k)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 14px 12px', background: 'none', border: 0, borderBottom: `3px solid ${tab === k ? 'var(--color-accent)' : 'transparent'}`, marginBottom: -2, font: 'inherit', fontSize: 14, fontWeight: tab === k ? 800 : 600, color: 'var(--color-text)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <Icon name={icon} size={16} />
              <span className="ap-label">{label}</span>
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0', flex: 'none', whiteSpace: 'nowrap' }}>
          <div style={{ position: 'relative' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setExpOpen(!expOpen)} aria-expanded={expOpen} style={{ height: 38 }}>
              <Icon name="download" size={15} />
              Exportar
              <Icon name="chevron-down" size={14} />
            </button>
            {expOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 89 }} onClick={() => setExpOpen(false)} />
                <div role="menu" style={{ position: 'absolute', right: 0, top: 44, width: 270, background: 'var(--color-surface)', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--color-divider)', zIndex: 90, display: 'flex', flexDirection: 'column' }}>
                  {(
                    [
                      ['file-text', 'Exportar PDF', 'PDF', 'pdf'],
                      ['file-spreadsheet', 'Lista de corte', 'CSV / Excel', 'csv'],
                      ['pen-tool', 'Piezas para CNC', 'DXF', 'dxf'],
                    ] as const
                  ).map(([icon, l, ext, k]) => (
                    <button type="button" role="menuitem" key={k} className="val-btn" onClick={() => doExport(k)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'none', border: 0, borderBottom: '1px solid var(--color-divider)', font: 'inherit', fontSize: 14, color: 'var(--color-text)', cursor: 'pointer', textAlign: 'left' }}>
                      <Icon name={icon} size={16} />
                      <span style={{ flex: 1 }}>{l}</span>
                      <span style={{ fontSize: 11, opacity: 0.6 }}>{ext}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {props.canManage && !approved && (
            <button type="button" className="btn btn-secondary" onClick={() => setSendOpen(true)} title="Enviar al cliente" style={{ height: 38 }}>
              <Icon name="send" size={15} />
              <span className="ap-label">Enviar al cliente</span>
            </button>
          )}
          {!approved && props.canManage && (
            <button type="button" className="btn btn-primary" onClick={() => setApproveOpen(true)} style={{ height: 38 }}>
              <Icon name="badge-check" size={16} />
              Aprobar proyecto
            </button>
          )}
          {approved && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38, padding: '0 12px', background: 'var(--color-text)', color: 'var(--color-bg)', fontWeight: 800, fontSize: 14 }}>
              <Icon name="badge-check" size={16} />
              Aprobado
            </span>
          )}
        </div>
      </div>

      {approved && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'var(--color-accent-100)', color: 'var(--color-accent-800)', fontSize: 14, borderBottom: '1px solid var(--color-divider)' }}>
          <Icon name="badge-check" size={17} />
          {lastApproval ? `Aprobado por ${lastApproval.signerName} · ${dateEs(lastApproval.createdAt)}` : 'Proyecto aprobado'} · El diseño está bloqueado para producción.
          {lastApproval?.signature && <img src={lastApproval.signature} alt={`Firma de ${lastApproval.signerName}`} style={{ height: 28, marginLeft: 'auto', background: '#fff', padding: 2 }} />}
        </div>
      )}
      {lastChanges && (
        <div style={{ display: 'flex', alignItems: 'start', gap: 10, padding: '10px 16px', background: 'var(--color-neutral-200)', fontSize: 14, borderBottom: '1px solid var(--color-divider)' }}>
          <Icon name="message-square-warning" size={17} />
          <span>
            <strong>{lastChanges.signerName} pidió cambios</strong> ({relativeTime(lastChanges.createdAt).toLowerCase()}){lastChanges.comment ? `: “${lastChanges.comment}”` : '.'} Ajusta el diseño y vuelve a enviarlo.
          </span>
        </div>
      )}
      {!approved && errors.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'var(--color-accent-100)', color: 'var(--color-accent-800)', fontSize: 14, borderBottom: '1px solid var(--color-divider)' }}>
          <Icon name="circle-x" size={17} />
          {errors.length === 1 ? `Hay 1 error por resolver antes de enviar o aprobar: ${errors[0]!.text}` : `Hay ${errors.length} errores por resolver antes de enviar o aprobar. Revísalos en la barra de validación del diseño.`}
        </div>
      )}

      {tab === 'galeria' && (
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          <div className="gal-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gridAutoRows: 300, gap: 16 }}>
            <Tile title="Render perspectiva" scale={cams.persp ? 'Cámara manual' : 'Cámara automática'} col="1 / span 2" row="1 / span 2" onRegen={() => setRegen((n) => n + 1)} onAdjust={props.canManage && !approved ? () => setCamEdit('persp') : undefined}>
              {persp(1100, 1000)}
            </Tile>
            <Tile title="Planta acotada" scale="1:25">
              <Svg drawing={planD()} title="Planta acotada" />
            </Tile>
            {walls.map((w) => (
              <Tile key={w} title={`Alzado muro ${w}`} scale="1:20">
                <Svg drawing={elevD(w)} title={`Alzado muro ${w}`} />
              </Tile>
            ))}
            {detMod && (
              <Tile
                title={`Vista de detalle · ${detLabel}`}
                scale={detCam ? 'Cámara manual' : 'Detalle'}
                col="span 2"
                onRegen={() => setRegen((n) => n + 1)}
                onAdjust={props.canManage && !approved ? () => setCamEdit('det') : undefined}
                extra={
                  props.canManage && !approved ? (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginLeft: 'auto', minWidth: 0 }}>
                      <span style={{ color: SOFT }}>Módulo</span>
                      <select className="input" aria-label="Módulo de la vista de detalle" value={detMod.id} onChange={(e) => setCams({ ...cams, det: { mod: Number(e.target.value) } })} style={{ padding: '4px 6px', fontSize: 13, maxWidth: 260 }}>
                        {data.mods.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.id} · {m.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : undefined
                }
              >
                {detail(1200, 480)}
              </Tile>
            )}
          </div>
        </div>
      )}

      {tab === 'planos' && <Planos buildable={buildable} sel={planMod} setSel={setPlanMod} data={data} mats={mats} hstyle={hstyle} onDxf={() => doExport('dxf')} />}

      {tab === 'corte' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'end', gap: 16, paddingBottom: 14, borderBottom: '2px solid var(--color-divider)', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <h2 style={{ margin: 0, fontSize: 28 }}>Lista de corte consolidada</h2>
              <div style={{ fontSize: 14, color: SOFT }}>
                {cut.reduce((a, g) => a + g.pieces, 0)} piezas · {cut.reduce((a, g) => a + g.area, 0).toFixed(1).replace('.', ',')} m² · {cut.length} materiales · agrupado por material y espesor
              </div>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => doExport('csv')}>
              <Icon name="file-spreadsheet" size={15} />
              Descargar CSV
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12, margin: '16px 0 24px' }}>
            {cut.map((g) => (
              <div key={`${g.mat}${g.esp}`} style={{ background: 'var(--color-surface)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ width: 28, height: 28, background: mats[g.matCode]?.color ?? '#ebe7e0', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.15)', flex: 'none' }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.2 }}>{g.mat}</div>
                    <div style={{ fontSize: 12, color: SOFT }}>{g.esp} mm</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4, paddingTop: 8, borderTop: '1px solid var(--color-divider)' }}>
                  {(
                    [
                      [g.pieces, 'piezas'],
                      [g.area.toFixed(2).replace('.', ','), 'm²'],
                      [g.boards, 'tableros'],
                    ] as const
                  ).map(([v, l]) => (
                    <div key={l}>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>{v}</div>
                      <div style={{ fontSize: 11, color: SOFT }}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {cut.map((g) => (
            <div key={`t${g.mat}${g.esp}`} style={{ marginBottom: 24, overflowX: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 6, minWidth: 620 }}>
                <h4 style={{ margin: 0 }}>
                  {g.mat} · {g.esp} mm
                </h4>
                <span style={{ fontSize: 13, color: SOFT }}>{g.pieces} piezas · tablero 2440 × 1830 mm</span>
              </div>
              <div className="cut-row" style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: SOFT, padding: '8px 0', borderBottom: '2px solid var(--color-divider)' }}>
                <span>Pieza</span>
                <span>Módulos</span>
                <span>Cant.</span>
                <span>Largo</span>
                <span>Ancho</span>
                <span>Veta</span>
                <span>Cantos</span>
              </div>
              {[...g.rows]
                .sort((a, b) => b.L * b.A - a.L * a.A)
                .map((r) => (
                  <div key={`${r.pieza}${r.L}${r.A}`} className="cut-row" style={{ fontSize: 13, padding: '7px 0', borderBottom: '1px solid var(--color-divider)', fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ fontWeight: 600 }}>{r.pieza}</span>
                    <span>{r.mods.map((n) => `M${n}`).join(', ')}</span>
                    <span>{r.cant}</span>
                    <span>{r.L}</span>
                    <span>{r.A}</span>
                    <span>{r.veta}</span>
                    <span>{r.cantos}</span>
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}

      {tab === 'pdf' && (
        <PdfTab
          data={data}
          readOnly={!props.canManage || approved}
          commit={props.commit}
          buildable={buildable}
          pageRoot={pdfRoot}
          onExport={() => doExport('pdf')}
          busy={!!pdf}
          render={(k) => {
            const pages: PdfPage[] = [];
            if (k.portada) pages.push({ label: 'Portada', cover: true });
            if (k.vistas) {
              pages.push({ label: 'Render perspectiva', title: 'Vista en perspectiva', art: persp(1100, 760) });
              if (detMod) pages.push({ label: 'Vista de detalle', title: `Detalle · ${detLabel}`, art: detail(1200, 700) });
            }
            if (k.planta) pages.push({ label: 'Planta acotada', title: 'Planta acotada · instalaciones', art: <Svg drawing={planD()} /> });
            if (k.alzados) for (const w of walls) pages.push({ label: `Alzado muro ${w}`, title: `Alzado muro ${w}`, art: <Svg drawing={elevD(w)} /> });
            if (k.planos)
              for (const m of buildable)
                pages.push({ label: `Plano módulo ${m.id}`, title: `Módulo ${m.id} · ${m.name} · ${m.w * 10}×${m.h * 10}×${m.d * 10} mm`, art: <Svg drawing={exploded(m, data.mats, mats)} />, parts: parts(m, data.mats, mats) });
            if (k.corte) pages.push({ label: 'Lista de corte', title: 'Lista de corte', rows: cut.map((g) => [`${g.mat} ${g.esp} mm`, `${g.pieces} pzas · ${g.area.toFixed(2)} m² · ${g.boards} tableros`]) });
            if (k.presupuesto) pages.push({ label: 'Presupuesto', title: 'Presupuesto', rows: budgetRows(estimate, currency) });
            return pages;
          }}
          header={props.orgName}
          logo={props.orgLogo ?? null}
          color={props.orgColor ?? null}
          pname={project.name}
        />
      )}

      {pdf && (
        <div style={{ position: 'absolute', inset: 0, background: 'color-mix(in srgb,var(--color-bg) 92%,transparent)', display: 'grid', placeItems: 'center', zIndex: 40 }}>
          <div role="status" aria-live="polite" style={{ width: 'min(420px,90%)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span style={{ width: 40, height: 40, border: '3px solid var(--color-neutral-300)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spspin .9s linear infinite' }} />
            <div style={{ fontSize: 24, fontWeight: 800 }}>Generando PDF…</div>
            <div style={{ height: 4, background: 'var(--color-neutral-300)' }}>
              <div style={{ height: 4, background: 'var(--color-accent)', width: `${pdf.pct}%`, transition: 'width .3s' }} />
            </div>
            <div style={{ fontSize: 14 }}>{pdf.step}</div>
          </div>
        </div>
      )}

      {camEdit && (
        <CameraDialog
          title={camEdit === 'persp' ? 'Ajustar cámara · render en perspectiva' : `Ajustar cámara · detalle de ${detMod?.name ?? 'módulo'}`}
          cfg={camCfg}
          initial={camEdit === 'persp' ? cams.persp : detCam}
          focusId={camEdit === 'det' ? detMod?.id : undefined}
          onSave={(cam) => {
            // A camera read from a collapsed or broken viewer (NaN) must never reach the project: the server would reject every save.
            if (!camSchema.safeParse(cam).success) return flash('No se pudo leer la cámara. Agranda la ventana e inténtalo de nuevo.');
            setCams(camEdit === 'persp' ? { ...cams, persp: cam } : { ...cams, det: { mod: detMod?.id, cam } });
            flash('Vista guardada: se usa en la galería, el PDF y la página del cliente.');
          }}
          onReset={() => setCams(camEdit === 'persp' ? { ...cams, persp: undefined } : { ...cams, det: { mod: cams.det?.mod } })}
          onClose={() => setCamEdit(null)}
        />
      )}
      {sendOpen && (
        <SendDialog
          project={project}
          history={history}
          blocked={errors.length > 0}
          onClose={() => setSendOpen(false)}
          guard={guard}
          onSent={() => {
            props.onStatus('enviado');
            loadHistory();
          }}
          onRevoked={loadHistory}
          flash={flash}
        />
      )}
      {approveOpen && (
        <ApproveDialog
          project={project}
          data={data}
          total={fmtMoney(estimate.total, currency)}
          blocked={errors.length > 0}
          onClose={() => setApproveOpen(false)}
          guard={guard}
          onApproved={() => {
            setApproveOpen(false);
            props.onStatus('aprobado');
            flash('Proyecto aprobado: el diseño queda bloqueado para producción.');
          }}
        />
      )}
      <style>{`
        .cut-row{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1.4fr) 56px 90px 90px 80px 60px;gap:8px;min-width:620px}
        .part-row{display:grid;grid-template-columns:28px minmax(0,1.3fr) 40px 100px 52px minmax(0,1.5fr) 72px 48px;gap:8px;min-width:600px}
        @media (max-width: 1000px){.gal-grid{grid-template-columns:minmax(0,1fr)!important}.gal-grid>*{grid-column:auto!important;grid-row:auto!important}.ap-label{display:none}.ap-2col{grid-template-columns:minmax(0,1fr)!important}}
      `}</style>
    </div>
  );
}

export function budgetRows(e: Estimate, cur: Currency): [string, string][] {
  const f = (n: number) => fmtMoney(n, cur);
  const rows: [string, string][] = e.lines.map((l) => [`${l.id}. ${l.name} ${l.w} cm`, f(l.total)]);
  if (e.counter.total) rows.push([`Encimera (${(e.counter.lengthCm / 100).toFixed(1)} m)`, f(e.counter.total)]);
  if (e.install) rows.push([`Instalación (${e.installPct}%)`, f(e.install)]);
  if (e.discount) rows.push([`Descuento (${e.discountPct}%)`, `−${f(e.discount)}`]);
  if (e.tax) rows.push([`${e.taxName} (${Math.round(e.taxRate * 100)}%)`, f(e.tax)]);
  rows.push(['Total', f(e.total)]);
  return rows;
}

function Tile({ title, scale, col, row, children, onRegen, onAdjust, extra }: { title: string; scale: string; col?: string; row?: string; children: React.ReactNode; onRegen?: () => void; onAdjust?: () => void; extra?: React.ReactNode }) {
  return (
    <div style={{ gridColumn: col, gridRow: row, display: 'flex', flexDirection: 'column', background: 'var(--color-surface)', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '2px solid var(--color-divider)' }}>
        <span style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>{title}</span>
        <span className="tag tag-neutral" style={{ whiteSpace: 'nowrap' }}>
          {scale}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative', background: 'var(--sp-canvas)', padding: onRegen ? 0 : 10, overflow: 'hidden' }}>{children}</div>
      {(onRegen || onAdjust || extra) && (
        <div style={{ display: 'flex', gap: 4, padding: '6px 8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {onRegen && (
            <button type="button" className="btn btn-ghost" onClick={onRegen} style={{ fontSize: 13 }}>
              <Icon name="refresh-cw" size={14} />
              Regenerar
            </button>
          )}
          {onAdjust && (
            <button type="button" className="btn btn-ghost" onClick={onAdjust} style={{ fontSize: 13 }}>
              <Icon name="camera" size={14} />
              Ajustar cámara
            </button>
          )}
          {extra}
        </div>
      )}
    </div>
  );
}

function Planos(props: { buildable: ModuleInstance[]; sel: number | null; setSel: (id: number) => void; data: ProjectData; mats: Catalog['context']['materials']; hstyle: string; onDxf: () => void }) {
  const { buildable, data, mats } = props;
  const pm = buildable.find((m) => m.id === props.sel) ?? buildable[0];
  if (!pm)
    return (
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: SOFT }}>
        <p>El proyecto aún no tiene módulos con despiece.</p>
      </div>
    );
  const pr = parts(pm, data.mats, mats);
  const views: [string, Drawing][] = [
    ['Vista frontal', ortho(pm, data.mats, mats, 'front', props.hstyle)],
    ['Vista lateral', ortho(pm, data.mats, mats, 'side', props.hstyle)],
    ['Vista superior', ortho(pm, data.mats, mats, 'top', props.hstyle)],
  ];
  const card = (title: string, body: React.ReactNode, h: number) => (
    <div style={{ background: 'var(--color-surface)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 12px', fontSize: 12, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', borderBottom: '2px solid var(--color-divider)' }}>{title}</div>
      <div style={{ height: h, padding: 12, background: 'var(--color-neutral-100)' }}>{body}</div>
    </div>
  );
  return (
    <div className="ap-2col" style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '260px minmax(0,1fr)' }}>
      <div style={{ borderRight: '2px solid var(--color-divider)', overflow: 'auto', maxHeight: '100%' }}>
        <div style={{ padding: '14px 16px 10px', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600, borderBottom: '2px solid var(--color-divider)' }}>Módulos · {buildable.length}</div>
        {buildable.map((m) => {
          const on = m.id === pm.id;
          return (
            <button type="button" key={m.id} className="val-btn" onClick={() => props.setSel(m.id)} style={{ width: '100%', display: 'flex', gap: 10, alignItems: 'center', padding: '10px 16px', background: on ? 'var(--color-accent-100)' : 'transparent', border: 0, borderLeft: `3px solid ${on ? 'var(--color-accent)' : 'transparent'}`, borderBottom: '1px solid var(--color-divider)', textAlign: 'left', font: 'inherit', color: 'var(--color-text)', cursor: 'pointer' }}>
              <span style={{ width: 24, height: 24, display: 'grid', placeItems: 'center', background: 'var(--color-text)', color: 'var(--color-bg)', fontSize: 11, fontWeight: 800, flex: 'none' }}>{m.id}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{m.name}</span>
                <span style={{ display: 'block', fontSize: 12, color: SOFT }}>
                  {m.code} · {m.w * 10}×{m.h * 10}×{m.d * 10}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ overflow: 'auto', padding: '20px 24px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'end', gap: 16, paddingBottom: 14, borderBottom: '2px solid var(--color-divider)', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--color-accent-700)', fontWeight: 600 }}>Plano de ensamblaje · Módulo {pm.id}</div>
            <h2 style={{ margin: '4px 0 0', fontSize: 28 }}>{pm.name}</h2>
          </div>
          <span className="tag tag-accent">{pm.code}</span>
          <span style={{ fontSize: 14 }}>
            {pm.w * 10} × {pm.h * 10} × {pm.d * 10} mm
          </span>
          <button type="button" className="btn btn-secondary" onClick={props.onDxf}>
            <Icon name="download" size={15} />
            Piezas DXF
          </button>
        </div>
        <div className="gal-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 16, marginTop: 16 }}>
          {views.map(([t, d]) => (
            <div key={t}>{card(t, <Svg drawing={d} title={t} />, 240)}</div>
          ))}
        </div>
        <div className="ap-2col" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.5fr)', gap: 16, marginTop: 16, alignItems: 'start' }}>
          {card('Vista explosionada', <Svg drawing={exploded(pm, data.mats, mats)} title="Vista explosionada" />, 380)}
          <div style={{ background: 'var(--color-surface)', padding: '0 12px 8px', overflow: 'auto' }}>
            <div style={{ padding: '8px 0', fontSize: 12, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}>Despiece · {pr.reduce((a, p) => a + p.cant, 0)} piezas</div>
            <div className="part-row" style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: SOFT, padding: '8px 0', borderBottom: '2px solid var(--color-divider)' }}>
              <span>#</span>
              <span>Pieza</span>
              <span>Cant.</span>
              <span>Largo × ancho</span>
              <span>Esp.</span>
              <span>Material</span>
              <span>Veta</span>
              <span>Cantos</span>
            </div>
            {pr.map((p) => (
              <div key={p.ref} className="part-row" style={{ fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--color-divider)', alignItems: 'center' }}>
                <span style={{ width: 20, height: 20, display: 'grid', placeItems: 'center', background: 'var(--color-accent)', color: '#fff', fontSize: 11, fontWeight: 800 }}>{p.ref}</span>
                <span style={{ fontWeight: 600 }}>{p.pieza}</span>
                <span>{p.cant}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.L} × {p.A}
                </span>
                <span>{p.esp} mm</span>
                <span>{p.mat}</span>
                <span>{p.veta}</span>
                <span>{p.cantos}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

type PdfPage = { label: string; title?: string; art?: React.ReactNode; rows?: [string, string][]; cover?: boolean; parts?: Part[] };
function PdfTab(props: {
  data: ProjectData;
  readOnly: boolean;
  commit: (next: ProjectData) => void;
  buildable: ModuleInstance[];
  pageRoot: React.RefObject<HTMLDivElement | null>;
  onExport: () => void;
  busy: boolean;
  render: (k: Record<PdfKey, boolean>) => PdfPage[];
  header: string;
  logo: string | null;
  color: string | null;
  pname: string;
}) {
  const { data } = props;
  const opts = Object.fromEntries(PDF_SECTIONS.map(([k]) => [k, data.pdfOpts?.[k] ?? true])) as Record<PdfKey, boolean>;
  const client = data.client ?? {};
  const pages = props.render(opts);
  const walls = 2 + (['C', 'D'] as const).filter((w) => data.mods.some((m) => m.wall === w)).length;
  const count: Record<PdfKey, number> = { portada: 1, vistas: 2, planta: 1, alzados: walls, planos: props.buildable.length, corte: 1, presupuesto: 1 };
  const setClient = (k: 'nombre' | 'tel' | 'dir', v: string) => props.commit({ ...data, client: { ...client, [k]: v } });
  const kind = data.ptype === 'cocina' ? 'cocina' : data.ptype === 'closet' ? 'closet' : 'vestidor';
  return (
    <div className="ap-2col" style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '300px minmax(0,1fr)' }}>
      <div style={{ borderRight: '2px solid var(--color-divider)', overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <h6 style={{ margin: '0 0 8px' }}>Contenido del PDF</h6>
          {PDF_SECTIONS.map(([k, label]) => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--color-divider)', fontSize: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={opts[k]} disabled={props.readOnly} onChange={() => props.commit({ ...data, pdfOpts: { ...opts, [k]: !opts[k] } })} style={{ width: 18, height: 18, accentColor: 'var(--color-accent)', margin: 0 }} />
              <span style={{ flex: 1 }}>{label}</span>
              <span style={{ fontSize: 12, color: SOFT }}>{count[k]} pág.</span>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h6 style={{ margin: 0 }}>Datos del cliente (portada)</h6>
          {(
            [
              ['nombre', 'Nombre'],
              ['tel', 'Teléfono'],
              ['dir', 'Dirección de instalación'],
            ] as const
          ).map(([k, l]) => (
            <div key={k} className="field">
              <label htmlFor={`cl-${k}`}>{l}</label>
              <input id={`cl-${k}`} className="input" value={client[k] ?? ''} disabled={props.readOnly} maxLength={200} onChange={(e) => setClient(k, e.target.value)} />
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-primary" onClick={props.onExport} disabled={props.busy || !pages.length} style={{ height: 44, justifyContent: 'flex-start' }}>
          <Icon name="file-text" size={16} />
          Exportar PDF · {pages.length} págs.
        </button>
      </div>
      <div style={{ overflow: 'auto', padding: '20px 24px', background: 'var(--sp-canvas)' }}>
        <div ref={props.pageRoot} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 20 }}>
          {pages.map((pg, i) => {
            const num = String(i + 1).padStart(2, '0');
            return (
              <div key={`${pg.label}${i}`} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div data-pdf-page="1" style={{ aspectRatio: '297/210', background: '#ffffff', color: '#201e1d', boxShadow: 'var(--shadow-md)', padding: 10, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden', fontFamily: 'var(--font-body)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 7, letterSpacing: '.08em', textTransform: 'uppercase', borderBottom: '1.5px solid #201e1d', paddingBottom: 3 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {props.logo ? <img src={props.logo} alt="" style={{ height: 10, maxWidth: 60, objectFit: 'contain' }} /> : <span style={{ width: 8, height: 8, background: props.color ?? '#ec3013' }} />}
                      {props.header}
                    </span>
                    <span>{num}</span>
                  </div>
                  {pg.cover && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'end', gap: 3 }}>
                      <div style={{ fontSize: 6, letterSpacing: '.1em', textTransform: 'uppercase', color: props.color ?? '#ae1800' }}>Proyecto de {kind} a medida</div>
                      <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1 }}>{props.pname}</div>
                      <div style={{ fontSize: 7 }}>{[client.nombre, client.tel].filter(Boolean).join(' · ') || 'Cliente por definir'}</div>
                      <div style={{ fontSize: 7 }}>{client.dir}</div>
                      <div style={{ fontSize: 6, color: '#6b6767' }}>{new Date().toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                      <div style={{ height: 3, background: '#ec3013', width: '40%', marginTop: 4 }} />
                    </div>
                  )}
                  {pg.art && (
                    <>
                      <div style={{ fontSize: 8, fontWeight: 800 }}>{pg.title}</div>
                      {pg.parts?.length ? (
                        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0,0.8fr) minmax(0,1.2fr)', gap: 6 }}>
                          <div style={{ minHeight: 0 }}>{pg.art}</div>
                          <div style={{ minHeight: 0 }}>
                            <Svg drawing={partsTable(pg.parts)} title="Despiece del módulo" />
                          </div>
                        </div>
                      ) : (
                        <div style={{ flex: 1, minHeight: 0 }}>{pg.art}</div>
                      )}
                    </>
                  )}
                  {pg.rows && (
                    <>
                      <div style={{ fontSize: 8, fontWeight: 800 }}>{pg.title}</div>
                      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {pg.rows.map(([k, v], j) => (
                          <div key={`${k}${j}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: pg.rows!.length > 18 ? 4.5 : 6, padding: '1.5px 0', borderBottom: '.5px solid #bab6b6', fontWeight: k === 'Total' ? 800 : 400 }}>
                            <span>{k}</span>
                            <span>{v}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600 }}>
                  {num} · {pg.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SendDialog(props: {
  project: ProjectDetail;
  history: { links: ApprovalLink[]; approvals: Approval[] } | null;
  blocked: boolean;
  onClose: () => void;
  guard: () => Promise<boolean>;
  onSent: () => void;
  onRevoked: () => void;
  flash: (m: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [days, setDays] = useState(14);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const send = async () => {
    setErr(null);
    setBusy(true);
    try {
      if (!(await props.guard())) return;
      const r = await api.sendToClient(props.project.id, { recipientEmail: email.trim(), expiresInDays: days });
      setSent(r.url);
      props.onSent();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo enviar. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };
  const stateOf = (l: ApprovalLink) =>
    l.usedAt ? 'Respondido' : l.revokedAt ? 'Revocado' : new Date(l.expiresAt).getTime() < Date.now() ? 'Caducado' : l.openedAt ? 'Abierto por el cliente' : 'Enviado, sin abrir';
  const live = (l: ApprovalLink) => !l.usedAt && !l.revokedAt && new Date(l.expiresAt).getTime() > Date.now();
  return (
    <Dialog
      title="Enviar al cliente"
      onClose={props.onClose}
      width={560}
      actions={
        sent ? (
          <button type="button" className="btn btn-primary" onClick={props.onClose}>
            Listo
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-secondary" onClick={props.onClose}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={send} disabled={!valid || busy || props.blocked}>
              <Icon name="send" size={15} />
              {busy ? 'Enviando…' : 'Enviar propuesta'}
            </button>
          </>
        )
      }
    >
      {sent ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0 }}>
            Enviamos la propuesta a <strong>{email.trim()}</strong>. El cliente puede revisarla, firmarla o pedir cambios desde este enlace (vence en {days} días):
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="input" readOnly value={sent} onFocus={(e) => e.currentTarget.select()} aria-label="Enlace de aprobación" style={{ flex: 1 }} />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigator.clipboard?.writeText(sent).then(() => props.flash('Enlace copiado'), () => props.flash('Copia el enlace manualmente'))}
            >
              <Icon name="copy" size={15} />
              Copiar
            </button>
          </div>
          <a className="btn btn-ghost" href={`https://wa.me/?text=${encodeURIComponent(`Tu propuesta de ${props.project.name}: ${sent}`)}`} target="_blank" rel="noreferrer" style={{ width: 'max-content' }}>
            <Icon name="message-circle" size={15} />
            Compartir por WhatsApp
          </a>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0 }}>Congelamos esta versión con sus precios y le enviamos un enlace al cliente para revisarla y firmarla. Un envío nuevo anula el enlace anterior.</p>
          {props.blocked && <p style={{ margin: 0, color: 'var(--color-accent-700)' }}>Resuelve los errores de validación antes de enviar.</p>}
          <div className="field">
            <label htmlFor="send-email">Correo del cliente</label>
            <input id="send-email" className="input" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@correo.com" />
          </div>
          <div className="field">
            <label htmlFor="send-days">Vigencia del enlace</label>
            <select id="send-days" className="input" value={days} onChange={(e) => setDays(+e.target.value)}>
              {[7, 14, 30, 60].map((d) => (
                <option key={d} value={d}>
                  {d} días
                </option>
              ))}
            </select>
          </div>
          {err && <p style={{ margin: 0, color: 'var(--color-accent-700)' }}>{err}</p>}
        </div>
      )}
      {!!props.history?.links.length && (
        <div style={{ marginTop: 16 }}>
          <h6 style={{ margin: '0 0 6px' }}>Envíos anteriores</h6>
          {props.history.links.slice(0, 5).map((l) => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--color-divider)', fontSize: 13 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong>{l.recipientEmail}</strong>
                <span style={{ display: 'block', color: SOFT }}>
                  {dateEs(l.createdAt)} · {stateOf(l)}
                </span>
              </span>
              {live(l) && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={() =>
                    api
                      .revokeLink(l.id)
                      .then(() => {
                        props.flash('Enlace revocado');
                        props.onRevoked();
                      })
                      .catch((e) => props.flash(e instanceof ApiError ? e.message : 'No se pudo revocar'))
                  }
                >
                  Revocar
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

function ApproveDialog(props: { project: ProjectDetail; data: ProjectData; total: string; blocked: boolean; onClose: () => void; guard: () => Promise<boolean>; onApproved: () => void }) {
  const [signer, setSigner] = useState(props.data.client?.nombre ?? '');
  const [sig, setSig] = useState<string | null>(null);
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const confirm = async () => {
    setErr(null);
    setBusy(true);
    try {
      if (!(await props.guard())) return;
      await api.approveInternal(props.project.id, { signerName: signer.trim(), signature: sig ?? undefined });
      props.onApproved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo aprobar. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="Aprobar proyecto"
      onClose={props.onClose}
      width={540}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={props.onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={confirm} disabled={!(signer.trim() && sig && accept) || busy || props.blocked}>
            <Icon name="badge-check" size={16} />
            {busy ? 'Aprobando…' : 'Aprobar proyecto'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ margin: 0 }}>Al aprobar, el diseño y los precios quedan congelados y pasa a producción con la lista de corte y los planos de ensamblaje.</p>
        {props.blocked && <p style={{ margin: 0, color: 'var(--color-accent-700)' }}>Resuelve los errores de validación antes de aprobar.</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid var(--color-divider)', borderBottom: '1px solid var(--color-divider)', fontSize: 14, color: 'var(--color-text)' }}>
          <span>
            {props.project.name} · {props.data.mods.length} módulos
          </span>
          <strong>{props.total}</strong>
        </div>
        <div className="field">
          <label htmlFor="signer">Nombre completo del cliente</label>
          <input id="signer" className="input" value={signer} onChange={(e) => setSigner(e.target.value)} placeholder="Nombre y apellidos" maxLength={160} />
        </div>
        <SignaturePad onChange={setSig} />
        <label style={{ display: 'flex', gap: 10, alignItems: 'start', fontSize: 13, cursor: 'pointer', color: 'var(--color-text)' }}>
          <input type="checkbox" checked={accept} onChange={() => setAccept(!accept)} style={{ width: 18, height: 18, accentColor: 'var(--color-accent)', margin: 0, flex: 'none' }} />
          Acepto la distribución, materiales, medidas y el presupuesto estimado.
        </label>
        {err && <p style={{ margin: 0, color: 'var(--color-accent-700)' }}>{err}</p>}
      </div>
    </Dialog>
  );
}
