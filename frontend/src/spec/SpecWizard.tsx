import {
  type Appliance,
  applOf,
  appliancesFor,
  blankProject,
  BUDGET_RANGE,
  closetOf,
  cmOf,
  CUSTOM_INSTS,
  distOf,
  type Drawing,
  ESTILOS,
  type FurnitureWall,
  isCustomAppl,
  layoutsFor,
  plan,
  PT_T,
  PT_Z,
  type PointType,
  type ProjectData,
  STEP_C,
  STEP_K,
} from '@core';
import { type CSSProperties, useEffect, useState } from 'react';
import type { CatalogMaterial } from '../api';
import { Dialog, fmtMoney, Icon, MUTED, Svg } from '../ui';

type Currency = 'USD' | 'DOP';
const SOFT = 'color-mix(in srgb,var(--color-text) 68%,transparent)';

/** Number input committing on blur/Enter (typing "3" on the way to "360" must not clamp). */
function Num({ value, onCommit, label, style, disabled }: { value: number; onCommit: (v: number) => void; label: string; style?: CSSProperties; disabled?: boolean }) {
  const [t, setT] = useState(String(value));
  useEffect(() => setT(String(value)), [value]);
  const commit = () => {
    const n = parseFloat(t);
    if (Number.isFinite(n)) onCommit(n);
    else setT(String(value));
  };
  return (
    <input
      className="input"
      type="number"
      aria-label={label}
      value={t}
      disabled={disabled}
      onChange={(e) => setT(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      style={style}
    />
  );
}

function CmField({ label, value, onCommit, disabled }: { label: string; value: number; onCommit: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ position: 'relative' }}>
        <Num label={label} value={value} onCommit={onCommit} disabled={disabled} style={{ paddingRight: 40, width: '100%' }} />
        <span style={{ position: 'absolute', right: 10, top: 9, fontSize: 12, opacity: 0.6 }}>cm</span>
      </div>
    </div>
  );
}

/** Plan drawing that reports clicks in plan coordinates (the prototype's planClick()). */
function ClickablePlan({ drawing, onWallClick }: { drawing: Drawing; onWallClick?: (x: number, y: number) => void }) {
  return (
    <div
      style={{ width: '100%', height: '100%' }}
      onClick={(e) => {
        if (!onWallClick) return;
        const svg = (e.currentTarget as HTMLElement).querySelector('svg');
        const ctm = svg?.getScreenCTM();
        if (!svg || !ctm) return;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const q = pt.matrixTransform(ctm.inverse());
        onWallClick(q.x, q.y);
      }}
    >
      <Svg drawing={drawing} title="Planta del espacio" />
    </div>
  );
}

export function SpecWizard(props: {
  data: ProjectData;
  step: number;
  setStep: (n: number) => void;
  commit: (next: ProjectData) => void;
  onGenerate: () => void;
  currency: Currency;
  readOnly: boolean;
  flash: (m: string) => void;
  /** Catalogue materials (standard + uploaded textures) for the custom style. */
  materials: CatalogMaterial[];
}) {
  const { data: s, step: st, setStep, commit, readOnly } = props;
  const kit = s.ptype === 'cocina';
  const names = kit ? STEP_K : STEP_C;
  const appl = applOf(s.ptype, s.appl);
  const closet = closetOf(s.closet);
  const [tool, setTool] = useState<PointType>('agua');
  const [ptSel, setPtSel] = useState<number | null>(null);
  const [askBlank, setAskBlank] = useState(false);
  const dist = distOf(s);
  /** Point being relocated: the next click on a wall moves it instead of adding a new one. */
  const [moving, setMoving] = useState<number | null>(null);
  const layouts = layoutsFor(s.ptype);
  const lay = layouts.find((l) => l.k === s.layout);
  const set = (patch: Partial<ProjectData>) => !readOnly && commit({ ...s, ...patch });

  const Q: Record<number, [string, string]> = {
    1: ['¿Qué distribución tiene tu espacio?', kit ? 'Elige la forma general. Podrás ajustar cada módulo en el editor.' : 'Elige cómo se reparten los módulos en la habitación.'],
    2: ['Medidas del espacio', 'Captura el largo de cada muro y la altura del techo en centímetros. Agrega puertas y ventanas para evitar interferencias.'],
    3: ['¿Dónde están las instalaciones?', 'Elige un tipo y haz clic sobre un muro en la planta para ubicarlo. Luego puedes cambiar el muro, la distancia y la altura, o moverlo con el botón de mover.'],
    4: [kit ? '¿Qué electrodomésticos llevará?' : '¿Qué accesorios quieres incluir?', kit ? 'Define el tipo de instalación y las medidas de cada equipo para reservar su hueco.' : 'Selecciona los accesorios y su forma de integración.'],
    5: ['Preferencias de diseño', kit ? 'Estas elecciones definen materiales, alturas y herrajes de la propuesta.' : 'Indica cuánto espacio necesitas para cada tipo de prenda.'],
    6: ['Revisa tus respuestas', 'Confirma que todo esté correcto antes de generar la distribución propuesta.'],
  };

  const cnt = (t: PointType) => s.pts.filter((p) => p.t === t).length;
  const applOn = [...appliancesFor(s.ptype).map((a) => ({ k: a.k, name: a.name })), ...Object.keys(appl).filter(isCustomAppl).map((k) => ({ k, name: appl[k]!.name ?? 'Accesorio' }))].filter((a) => appl[a.k]?.on);
  const prefTxt = kit ? `${s.prefs.estilo ?? 'Contemporáneo'} · ${s.prefs.apertura}` : `Colgado ${String(closet.largo).replace('.', ',')} m + ${String(closet.corto).replace('.', ',')} m`;
  const summary: [string, string, string, number][] = [
    ['shapes', 'Tipo de proyecto', s.ptype === 'cocina' ? 'Cocina' : s.ptype === 'closet' ? 'Closet' : 'Vestidor', 0],
    ['layout-grid', 'Distribución', `${lay?.name ?? '—'} · muros ${dist.walls.join(', ')}${dist.island.on ? ' + isla' : ''}`, 1],
    ['ruler', 'Medidas', `${s.room.A} × ${s.room.B} cm · techo ${s.room.H} cm`, 2],
    ['door-open', 'Puertas y ventanas', `${s.ops.filter((o) => o.t === 'puerta').length} puerta(s) · ${s.ops.filter((o) => o.t === 'ventana').length} ventana(s)`, 2],
    ['plug', 'Instalaciones', `${cnt('agua')} agua · ${cnt('desague')} desagüe · ${cnt('elec')} eléctrico · ${cnt('gas')} gas`, 3],
    ['refrigerator', kit ? 'Electrodomésticos' : 'Accesorios', applOn.map((a) => a.name).join(', ') || 'Ninguno', 4],
    ['palette', 'Preferencias', prefTxt, 5],
  ];

  const setAppl = (k: string, patch: Partial<Appliance>) => set({ appl: { ...appl, [k]: { ...appl[k]!, ...patch } } });
  const setPrefs = (patch: Partial<ProjectData['prefs']>) => set({ prefs: { ...s.prefs, ...patch } });
  const setCloset = (patch: Partial<typeof closet>) => set({ closet: { ...closet, ...patch } });
  const nid = (xs: { id: number }[]) => xs.reduce((a, x) => Math.max(a, x.id), 0) + 1;
  const clampRoom = (v: number) => Math.max(100, Math.min(1200, Math.round(v)));

  const wallLen = (w: 'A' | 'B' | 'C' | 'D') => (w === 'A' || w === 'D' ? s.room.A : s.room.B);
  /** Edits a point's wall/distance/height, keeping it on the wall (0 … wall length). */
  const updPt = (p: (typeof s.pts)[number], patch: Partial<(typeof s.pts)[number]>) => {
    const next = { ...p, ...patch };
    next.pos = Math.max(0, Math.min(wallLen(next.wall), Math.round(next.pos)));
    set({ pts: s.pts.map((x) => (x.id === p.id ? next : x)) });
  };
  const movingPt = moving != null ? s.pts.find((p) => p.id === moving) : undefined;
  const planDrawing = (withPts: boolean) => plan({ ...s, mods: [], pts: withPts ? s.pts : [] }, { cotas: true });
  const onWallClick = (x: number, y: number) => {
    if (readOnly) return;
    const { A, B } = s.room;
    const d = (
      [
        ['A', y, x],
        ['B', x, y],
        ['C', A - x, y],
        ['D', B - y, x],
      ] as const
    )
      .slice()
      .sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]))[0]!;
    const len = d[0] === 'A' || d[0] === 'D' ? A : B;
    const pos = Math.max(0, Math.min(len, Math.round(d[2])));
    const mv = moving != null ? s.pts.find((p) => p.id === moving) : undefined;
    if (mv) {
      set({ pts: s.pts.map((p) => (p.id === mv.id ? { ...p, wall: d[0], pos } : p)) });
      setMoving(null);
      setPtSel(mv.id);
      props.flash(`${PT_T[mv.t][1]} movida al muro ${d[0]} a ${pos} cm`);
      return;
    }
    const id = nid(s.pts);
    set({ pts: [...s.pts, { id, t: tool, wall: d[0], pos, z: PT_Z[tool] }] });
    setPtSel(id);
    props.flash(`${PT_T[tool][1]} ubicada en muro ${d[0]} a ${pos} cm`);
  };

  // ---------- distribution measurements ----------
  const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
  const setDist = (patch: NonNullable<ProjectData['dist']>) => set({ dist: { ...s.dist, ...patch } });
  /** Any structural change turns the layout into "Personalizada", keeping what the preset had. */
  const toCustom = (patch: NonNullable<ProjectData['dist']>) =>
    set({ layout: 'personalizada', dist: { ...s.dist, walls: dist.walls, island: { on: dist.island.on, ...(dist.island.w ? { w: dist.island.w } : {}), d: dist.island.d }, ...patch } });
  const wallLenOf = (w: FurnitureWall) => (w === 'A' || w === 'D' ? s.room.A : s.room.B);
  const toggleWall = (w: FurnitureWall) => {
    const next = dist.walls.includes(w) ? dist.walls.filter((x) => x !== w) : [...dist.walls, w];
    if (!next.length) return props.flash('Deja al menos un muro con muebles.');
    toCustom({ walls: next });
  };
  const WALL_R: Record<FurnitureWall, [number, number, number, number]> = { A: [10, 10, 80, 14], B: [10, 24, 14, 32], C: [76, 24, 14, 32], D: [10, 56, 80, 14] };
  const rectsFor = (walls: FurnitureWall[], island: boolean): [number, number, number, number][] => [...walls.map((w) => WALL_R[w]), ...(island ? [[40, 38, 24, 10] as [number, number, number, number]] : [])];
  const islandLabel = kit ? 'Isla o península' : 'Isla cajonera';
  const distPanel = (
    <div style={{ marginTop: 28, paddingTop: 24, borderTop: '2px solid var(--color-divider)', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h6 style={{ margin: '0 0 4px' }}>Medidas de la distribución</h6>
        <p style={{ margin: 0, fontSize: 13, color: MUTED }}>Ajusta cualquier forma. Si cambias los muros o la isla, la distribución pasa a «Personalizada».</p>
      </div>
      <div>
        <div style={{ fontSize: 12, marginBottom: 6, color: SOFT }}>Muros con {kit ? 'muebles' : 'módulos'}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['A', 'B', 'C', 'D'] as const).map((w) => {
            const on = dist.walls.includes(w);
            return (
              <button type="button" key={w} onClick={() => toggleWall(w)} disabled={readOnly} aria-pressed={on} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: on ? 'var(--color-text)' : 'transparent', color: on ? 'var(--color-bg)' : 'var(--color-text)', border: `1px solid ${on ? 'var(--color-text)' : 'var(--color-divider)'}` }}>
                <Icon name={on ? 'check' : 'plus'} size={14} />
                Muro {w} · {wallLenOf(w)} cm
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 12 }}>
        <CmField label={kit ? 'Fondo de bajos' : 'Fondo de módulos'} value={dist.baseD} onCommit={(v) => setDist({ baseD: clampN(v, 30, 80) })} disabled={readOnly} />
        {kit && <CmField label="Altura de bajos (sin zócalo)" value={dist.baseH} onCommit={(v) => setDist({ baseH: clampN(v, 50, 100) })} disabled={readOnly} />}
        {kit && <CmField label="Fondo de alacenas" value={dist.upperD} onCommit={(v) => setDist({ upperD: clampN(v, 20, 50) })} disabled={readOnly} />}
        {kit && <CmField label="Pasillo mínimo" value={dist.aisle} onCommit={(v) => setDist({ aisle: clampN(v, 60, 200) })} disabled={readOnly} />}
      </div>
      {kit && <p style={{ margin: '-8px 0 0', fontSize: 12, color: MUTED }}>Altura de encimera ≈ {cmOf(s.prefs.zocalo, 10) + dist.baseH + 3} cm (zócalo + bajo + encimera).</p>}
      <div style={{ display: 'flex', gap: 16, alignItems: 'end', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', paddingBottom: 10 }}>
          <input type="checkbox" checked={dist.island.on} disabled={readOnly} onChange={() => toCustom({ island: { ...s.dist?.island, on: !dist.island.on, d: dist.island.d } })} style={{ width: 18, height: 18, accentColor: 'var(--color-accent)', margin: 0 }} />
          {islandLabel}
        </label>
        {dist.island.on && (
          <>
            <div style={{ width: 170 }}>
              <CmField label="Ancho (0 = automático)" value={dist.island.w ?? 0} onCommit={(v) => setDist({ island: { ...s.dist?.island, on: dist.island.on, d: dist.island.d, ...(v > 0 ? { w: clampN(v, 60, 400) } : { w: undefined }) } })} disabled={readOnly} />
            </div>
            <div style={{ width: 170 }}>
              <CmField label="Fondo" value={dist.island.d} onCommit={(v) => setDist({ island: { ...s.dist?.island, on: dist.island.on, d: clampN(v, 40, 150) } })} disabled={readOnly} />
            </div>
          </>
        )}
      </div>
    </div>
  );

  // ---------- custom appliances / accessories ----------
  const customKeys = Object.keys(appl).filter(isCustomAppl);
  const addCustom = () => {
    const n = customKeys.reduce((a, k) => Math.max(a, Number(k.slice(1))), 0) + 1;
    set({ appl: { ...appl, [`x${n}`]: { on: true, name: kit ? 'Nuevo electrodoméstico' : 'Nuevo accesorio', inst: kit ? 'Bajo encimera' : 'Integrado', w: 60, h: kit ? 85 : 40, d: kit ? 60 : 45 } } });
  };
  const removeCustom = (k: string) => {
    const { [k]: _gone, ...rest } = appl;
    set({ appl: rest });
  };
  const applCards = [
    ...appliancesFor(s.ptype).map((a) => ({ k: a.k, name: a.name, icon: a.icon, insts: a.insts as readonly string[], custom: false })),
    ...customKeys.map((k) => ({ k, name: appl[k]!.name ?? 'Accesorio', icon: 'package', insts: (kit ? CUSTOM_INSTS : ['Integrado', 'Libre']) as readonly string[], custom: true })),
  ];

  // ---------- design preferences ----------
  const CUSTOM_STYLE = 'Personalizado';
  const ownMats = (s.prefs as { mats?: Partial<ProjectData['mats']> }).mats ?? {};
  const matGroups = [
    ['cuerpo', 'Cuerpo'],
    ['frentes', 'Frentes'],
    ['encimera', kit ? 'Encimera' : 'Cubierta de isla'],
    ['jaladeras', 'Jaladeras'],
  ] as const;
  const pickMat = (g: (typeof matGroups)[number][0], code: string) => set({ prefs: { ...s.prefs, estilo: CUSTOM_STYLE, mats: { ...s.mats, ...ownMats, [g]: code } }, mats: { ...s.mats, [g]: code } });
  const colorOf = (code: string) => props.materials.find((m) => m.code === code)?.color ?? '#ccc';
  const styleBlock = (
    <div>
      <h6 style={{ margin: '0 0 10px' }}>Estilo</h6>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
        {ESTILOS.map((e) => (
          <button type="button" key={e.name} onClick={() => setPrefs({ estilo: e.name })} disabled={readOnly} style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', padding: 12, background: 'var(--color-surface)', border: `2px solid ${s.prefs.estilo === e.name ? 'var(--color-accent)' : 'transparent'}`, cursor: 'pointer', font: 'inherit', color: 'var(--color-text)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', height: 56 }}>
              {e.c.map((col) => (
                <span key={col} style={{ background: col }} />
              ))}
            </div>
            <span style={{ fontWeight: 800, fontSize: 15 }}>{e.name}</span>
            <span style={{ fontSize: 12, color: 'color-mix(in srgb,var(--color-text) 65%,transparent)' }}>{e.desc}</span>
          </button>
        ))}
        <button type="button" onClick={() => set({ prefs: { ...s.prefs, estilo: CUSTOM_STYLE, mats: { ...s.mats, ...ownMats } } })} disabled={readOnly} style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', padding: 12, background: 'var(--color-surface)', border: `2px solid ${s.prefs.estilo === CUSTOM_STYLE ? 'var(--color-accent)' : 'transparent'}`, cursor: 'pointer', font: 'inherit', color: 'var(--color-text)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', height: 56 }}>
            {(['frentes', 'cuerpo', 'encimera'] as const).map((g) => (
              <span key={g} style={{ background: colorOf(ownMats[g] ?? s.mats[g]) }} />
            ))}
          </div>
          <span style={{ fontWeight: 800, fontSize: 15 }}>{CUSTOM_STYLE}</span>
          <span style={{ fontSize: 12, color: 'color-mix(in srgb,var(--color-text) 65%,transparent)' }}>Elige tú cada material (incluye tus texturas).</span>
        </button>
      </div>
      {s.prefs.estilo === CUSTOM_STYLE && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12, marginTop: 14 }}>
          {matGroups.map(([g, label]) => {
            const opts = props.materials.filter((m) => m.uses.includes(g));
            const cur = ownMats[g] ?? s.mats[g];
            return (
              <div key={g} className="field">
                <label htmlFor={`mat-${g}`}>{label}</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ width: 32, height: 32, flex: 'none', background: colorOf(cur), boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.15)' }} />
                  <select id={`mat-${g}`} className="input" value={cur} disabled={readOnly} onChange={(e) => pickMat(g, e.target.value)} style={{ flex: 1, minWidth: 0 }}>
                    {!opts.some((m) => m.code === cur) && <option value={cur}>{cur}</option>}
                    {opts.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.name}
                        {m.source === 'subido' ? ' (tu textura)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
  const seg = (title: string, value: string | undefined, opts: string[], note: string, pick: (v: string) => void, name: string) => (
    <div key={name}>
      <h6 style={{ margin: '0 0 10px' }}>{title}</h6>
      <div className="seg">
        {opts.map((l) => (
          <label key={l} className="seg-opt">
            <input type="radio" name={name} checked={value === l} onChange={() => pick(l)} disabled={readOnly} />
            {l}
          </label>
        ))}
      </div>
      <p style={{ fontSize: 12, margin: '8px 0 0', color: MUTED }}>{note}</p>
    </div>
  );
  /** Preset buttons plus a field to type any other measure in cm (stored as "80 cm", like the presets). */
  const segCm = (title: string, value: string | undefined, opts: string[], note: string, pick: (v: string) => void, name: string, min: number, max: number, fallback: number) => {
    const cur = parseFloat(value ?? '') || fallback;
    const custom = !opts.includes(value ?? '');
    return (
      <div key={name}>
        <h6 style={{ margin: '0 0 10px' }}>{title}</h6>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div className="seg">
            {opts.map((l) => (
              <label key={l} className="seg-opt">
                <input type="radio" name={name} checked={value === l} onChange={() => pick(l)} disabled={readOnly} />
                {l}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <span style={{ color: MUTED }}>u otra:</span>
            <div style={{ position: 'relative' }}>
              <Num
                label={`${title} en cm`}
                value={cur}
                onCommit={(v) => pick(`${Math.max(min, Math.min(max, Math.round(v)))} cm`)}
                disabled={readOnly}
                style={{ width: 84, paddingRight: 30, borderColor: custom ? 'var(--color-accent)' : undefined }}
              />
              <span style={{ position: 'absolute', right: 8, top: 9, fontSize: 12, opacity: 0.6 }}>cm</span>
            </div>
          </div>
        </div>
        <p style={{ fontSize: 12, margin: '8px 0 0', color: MUTED }}>
          {note} Entre {min} y {max} cm.
        </p>
      </div>
    );
  };

  return (
    <div className="spec-grid" style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px' }}>
      <section style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
        <div style={{ padding: '18px 40px 16px', borderBottom: '2px solid var(--color-divider)', flex: 'none' }} className="spec-pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <span style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600, color: 'var(--color-accent-700)' }}>Fase 1 · Especificaciones</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {!readOnly && (
                <button type="button" className="btn btn-ghost" onClick={() => setAskBlank(true)} style={{ fontSize: 13 }} title="Quita puertas, ventanas, instalaciones, electrodomésticos y muebles">
                  <Icon name="eraser" size={14} />
                  Empezar en blanco
                </button>
              )}
              <span style={{ fontSize: 13, fontWeight: 600 }}>Paso {st} de 6</span>
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,minmax(0,1fr))', gap: 4 }}>
            {names.map((label, i) => (
              <button type="button" key={label} onClick={() => setStep(i + 1)} style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit', color: i + 1 <= st ? 'var(--color-text)' : MUTED }}>
                <span style={{ height: 4, width: '100%', background: i + 1 < st ? 'var(--color-text)' : i + 1 === st ? 'var(--color-accent)' : 'var(--color-neutral-300)' }} />
                <span className="step-name" style={{ fontSize: 12, fontWeight: i + 1 === st ? 800 : 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                  {i + 1}. {label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '32px 40px 40px' }} className="spec-pad">
          <div style={{ maxWidth: 1040 }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 32 }}>{Q[st]![0]}</h2>
            <p style={{ margin: '0 0 28px', fontSize: 15, color: SOFT, maxWidth: 640, textWrap: 'pretty' }}>{Q[st]![1]}</p>

            {st === 1 && (
              <>
              <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 16 }}>
                {layouts.map((l) => {
                  const sel = s.layout === l.k;
                  const art: Drawing = {
                    vb: [0, 0, 100, 80],
                    items: [{ d: 'M4 4H96V76H4Z', fill: 'none', stroke: '#201e1d', sw: 2 }, { d: 'M62 76H84', stroke: '#f3f2f2', sw: 3 }, ...(l.r.length ? l.r : rectsFor(sel ? dist.walls : ['A', 'B', 'C'], sel && dist.island.on)).map((r) => ({ d: `M${r[0]} ${r[1]}h${r[2]}v${r[3]}h${-r[2]}Z`, fill: sel ? '#ec3013' : '#7d7979' }))],
                  };
                  return (
                    <button type="button" key={l.k} className="spec-card" onClick={() => (l.k === 'personalizada' ? toCustom({}) : set({ layout: l.k, dist: { ...s.dist, walls: undefined, island: undefined } }))} disabled={readOnly} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left', padding: 16, background: 'var(--color-surface)', border: `2px solid ${sel ? 'var(--color-accent)' : 'transparent'}`, cursor: 'pointer', font: 'inherit', color: 'var(--color-text)' }}>
                      <div style={{ height: 120, background: 'var(--color-bg)', padding: 10 }}>
                        <Svg drawing={art} title={l.name} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 18 }}>{l.name}</div>
                        <div style={{ fontSize: 13, color: 'color-mix(in srgb,var(--color-text) 65%,transparent)' }}>{l.desc}</div>
                      </div>
                      {sel && (
                        <span style={{ position: 'absolute', top: 10, right: 10, width: 24, height: 24, background: 'var(--color-accent)', color: '#fff', display: 'grid', placeItems: 'center' }}>
                          <Icon name="check" size={14} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {distPanel}
              </>
            )}

            {st === 2 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(380px,1fr))', gap: 28, alignItems: 'start' }}>
                <div style={{ background: 'var(--sp-canvas)', height: 460, padding: 12, position: 'relative' }}>
                  <ClickablePlan drawing={planDrawing(false)} />
                  <span style={{ position: 'absolute', left: 12, bottom: 10, fontSize: 12, color: MUTED }}>Planta · cotas en mm</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  <div>
                    <h6 style={{ margin: '0 0 10px' }}>Muros</h6>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <CmField label="Muro A" value={s.room.A} onCommit={(v) => set({ room: { ...s.room, A: clampRoom(v) } })} disabled={readOnly} />
                      <CmField label="Muro B" value={s.room.B} onCommit={(v) => set({ room: { ...s.room, B: clampRoom(v) } })} disabled={readOnly} />
                      <CmField label="Muro C (= B)" value={s.room.B} onCommit={() => {}} disabled />
                      <CmField label="Muro D (= A)" value={s.room.A} onCommit={() => {}} disabled />
                      <div style={{ gridColumn: 'span 2' }}>
                        <CmField label="Altura de techo" value={s.room.H} onCommit={(v) => set({ room: { ...s.room, H: Math.max(150, Math.min(600, Math.round(v))) } })} disabled={readOnly} />
                      </div>
                    </div>
                    <p style={{ fontSize: 12, margin: '8px 0 0', color: MUTED, display: 'flex', gap: 6, alignItems: 'center' }}>
                      <Icon name="lock" size={12} />
                      Habitación rectangular: C y D siguen a B y A.
                    </p>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <h6 style={{ margin: 0 }}>Puertas y ventanas</h6>
                      {!readOnly && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button type="button" className="btn btn-secondary" onClick={() => set({ ops: [...s.ops, { id: nid(s.ops), t: 'puerta', wall: 'C', pos: 40, w: 80, h: 210 }] })} style={{ padding: '6px 10px', fontSize: 13 }}>
                            <Icon name="plus" size={14} />
                            Puerta
                          </button>
                          <button type="button" className="btn btn-secondary" onClick={() => set({ ops: [...s.ops, { id: nid(s.ops), t: 'ventana', wall: 'D', pos: 60, w: 100, h: 100, z: 110 }] })} style={{ padding: '6px 10px', fontSize: 13 }}>
                            <Icon name="plus" size={14} />
                            Ventana
                          </button>
                          {s.ops.length > 0 && (
                            <button type="button" className="btn btn-ghost" onClick={() => set({ ops: [] })} style={{ padding: '6px 10px', fontSize: 13 }}>
                              Quitar todas
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="ops-row ops-head" style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: MUTED, paddingBottom: 6, borderBottom: '2px solid var(--color-divider)' }}>
                      <span>Tipo</span>
                      <span>Muro</span>
                      <span>Posición</span>
                      <span>Ancho</span>
                      <span>Alto</span>
                      <span title="Altura desde el piso hasta la parte de abajo de la ventana">Del piso</span>
                      <span />
                    </div>
                    {s.ops.length === 0 && <p style={{ fontSize: 13, color: MUTED }}>Sin puertas ni ventanas. Agrégalas con los botones de arriba.</p>}
                    {s.ops.map((o) => {
                      const upd = (patch: Partial<typeof o>) => set({ ops: s.ops.map((x) => (x.id === o.id ? { ...x, ...patch } : x)) });
                      return (
                        <div key={o.id} className="ops-row" style={{ alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-divider)' }}>
                          <select className="input" aria-label="Tipo de abertura" value={o.t} onChange={(e) => upd(e.target.value === 'ventana' ? { t: 'ventana', z: o.z ?? 110, h: Math.min(o.h, 120) } : { t: 'puerta', z: undefined, h: Math.max(o.h, 200) })} disabled={readOnly} style={{ padding: 6 }}>
                            <option value="puerta">Puerta</option>
                            <option value="ventana">Ventana</option>
                          </select>
                          <label className="ops-cell">
                            <span className="ops-lbl">Muro</span>
                            <select className="input" value={o.wall} onChange={(e) => upd({ wall: e.target.value as typeof o.wall })} disabled={readOnly} style={{ padding: 6 }}>
                              {['A', 'B', 'C', 'D'].map((w) => (
                                <option key={w}>{w}</option>
                              ))}
                            </select>
                          </label>
                          <label className="ops-cell">
                            <span className="ops-lbl">Posición</span>
                            <Num label="Posición en cm" value={o.pos} onCommit={(v) => upd({ pos: Math.max(0, Math.round(v)) })} disabled={readOnly} />
                          </label>
                          <label className="ops-cell">
                            <span className="ops-lbl">Ancho</span>
                            <Num label="Ancho en cm" value={o.w} onCommit={(v) => upd({ w: Math.max(20, Math.round(v)) })} disabled={readOnly} />
                          </label>
                          <label className="ops-cell">
                            <span className="ops-lbl">Alto</span>
                            <Num label="Alto en cm" value={o.h} onCommit={(v) => upd({ h: Math.max(20, Math.round(v)) })} disabled={readOnly} />
                          </label>
                          <label className="ops-cell">
                            <span className="ops-lbl">Del piso</span>
                            {o.t === 'ventana' ? (
                              <Num
                                label="Altura de la ventana desde el piso en cm"
                                value={o.z ?? 110}
                                onCommit={(v) => upd({ z: Math.max(0, Math.min(s.room.H - o.h, Math.round(v))) })}
                                disabled={readOnly}
                              />
                            ) : (
                              <input className="input" value="0" disabled aria-label="Las puertas llegan al piso" title="Las puertas llegan al piso" readOnly />
                            )}
                          </label>
                          <button type="button" className="btn btn-icon" onClick={() => set({ ops: s.ops.filter((x) => x.id !== o.id) })} aria-label="Eliminar" title="Eliminar" disabled={readOnly}>
                            <Icon name="trash-2" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {st === 3 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(380px,1fr))', gap: 28, alignItems: 'start' }}>
                <div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    {(Object.keys(PT_T) as PointType[]).map((k) => {
                      const on = tool === k;
                      return (
                        <button type="button" key={k} onClick={() => setTool(k)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: on ? 'var(--color-accent)' : 'var(--color-bg)', color: on ? '#fff' : 'var(--color-text)', border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-divider)'}` }}>
                          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.04em', padding: '2px 4px', border: '1.5px solid currentColor' }}>{PT_T[k][0]}</span>
                          {PT_T[k][1]}
                        </button>
                      );
                    })}
                  </div>
                  {!readOnly && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                      <button type="button" className="btn btn-secondary" onClick={() => { const id = nid(s.pts); set({ pts: [...s.pts, { id, t: tool, wall: 'A', pos: Math.round(s.room.A / 2), z: PT_Z[tool] }] }); setPtSel(id); }} style={{ fontSize: 13 }}>
                        <Icon name="plus" size={14} />
                        Agregar {PT_T[tool][1].toLowerCase()} sin clic
                      </button>
                      {s.pts.length > 0 && (
                        <button type="button" className="btn btn-ghost" onClick={() => set({ pts: [] })} style={{ fontSize: 13 }}>
                          Quitar todas
                        </button>
                      )}
                    </div>
                  )}
                  <div style={{ background: 'var(--sp-canvas)', height: 440, padding: 12, position: 'relative', cursor: readOnly ? 'default' : 'crosshair' }}>
                    <ClickablePlan drawing={planDrawing(true)} onWallClick={onWallClick} />
                    <span style={{ position: 'absolute', left: 12, bottom: 10, fontSize: 12, color: 'color-mix(in srgb,var(--color-text) 65%,transparent)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'default' }}>
                      <Icon name={moving != null ? 'move' : 'mouse-pointer-click'} size={14} />
                      {movingPt ? `Toca un muro para mover: ${PT_T[movingPt.t][1].toLowerCase()}` : `Clic sobre un muro para ubicar: ${PT_T[tool][1].toLowerCase()}`}
                      {movingPt && (
                        <button type="button" className="btn btn-ghost" onClick={() => setMoving(null)} style={{ padding: '2px 8px', fontSize: 12, minHeight: 0 }}>
                          Cancelar
                        </button>
                      )}
                    </span>
                  </div>
                </div>
                <div>
                  <h6 style={{ margin: '0 0 10px' }}>Puntos ubicados</h6>
                  <div className="pt-row" style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: MUTED, paddingBottom: 6, borderBottom: '2px solid var(--color-divider)' }}>
                    <span>Instalación</span>
                    <span>Altura del piso</span>
                    <span />
                  </div>
                  {s.pts.length === 0 && <p style={{ fontSize: 13, color: MUTED }}>Aún no hay puntos. Haz clic sobre un muro en la planta.</p>}
                  {s.pts.map((p) => (
                    <div key={p.id} className="pt-row" onClick={() => setPtSel(p.id)} style={{ alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-divider)', background: ptSel === p.id ? 'var(--color-accent-100)' : 'transparent', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', background: 'var(--color-accent)', color: '#fff', fontSize: 10, fontWeight: 800, flex: 'none' }}>{PT_T[p.t][0]}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{PT_T[p.t][1]}</div>

                        </div>
                      </div>
                      <div style={{ position: 'relative' }}>
                        <Num label="Altura desde el piso" value={p.z ?? PT_Z[p.t]} onCommit={(v) => updPt(p, { z: Math.max(0, Math.min(s.room.H, Math.round(v))) })} disabled={readOnly} style={{ paddingRight: 34, width: '100%' }} />
                        <span style={{ position: 'absolute', right: 8, top: 9, fontSize: 12, opacity: 0.6 }}>cm</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (moving === p.id) setMoving(null);
                          set({ pts: s.pts.filter((x) => x.id !== p.id) });
                        }}
                        aria-label="Eliminar punto"
                        title="Eliminar"
                        disabled={readOnly}
                      >
                        <Icon name="trash-2" />
                      </button>
                      <div className="pt-loc" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: MUTED }} onClick={(e) => e.stopPropagation()}>
                        Muro
                        <select className="input" aria-label="Muro" value={p.wall} onChange={(e) => updPt(p, { wall: e.target.value as typeof p.wall })} disabled={readOnly} style={{ padding: '3px 4px', width: 48, fontSize: 13 }}>
                          {(['A', 'B', 'C', 'D'] as const).map((w) => (
                            <option key={w}>{w}</option>
                          ))}
                        </select>
                        a
                        <Num label="Distancia desde la esquina en cm" value={p.pos} onCommit={(v) => updPt(p, { pos: v })} disabled={readOnly} style={{ padding: '3px 4px', width: 60, fontSize: 13 }} />
                        cm
                        {!readOnly && (
                          <button
                            type="button"
                            className="btn btn-icon"
                            onClick={() => {
                              setMoving(moving === p.id ? null : p.id);
                              setPtSel(p.id);
                            }}
                            aria-label="Mover en la planta"
                            title="Mover en la planta"
                            style={{ width: 28, height: 28, minHeight: 0, background: moving === p.id ? 'var(--color-accent)' : undefined, color: moving === p.id ? '#fff' : undefined }}
                          >
                            <Icon name="move" size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {st === 4 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 16 }}>
                {applCards.map((a) => {
                  const c = appl[a.k]!;
                  return (
                    <div key={a.k} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: 'var(--color-surface)', border: `2px solid ${c.on ? 'var(--color-text)' : 'transparent'}` }}>
                      <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <Icon name={a.icon} size={26} style={{ opacity: c.on ? 1 : 0.45 }} />
                          {a.custom ? (
                            <input className="input" aria-label="Nombre" defaultValue={a.name} maxLength={60} disabled={readOnly} onBlur={(e) => e.target.value.trim() && setAppl(a.k, { name: e.target.value.trim() })} style={{ fontWeight: 800, fontSize: 15, padding: '4px 6px' }} />
                          ) : (
                            <span style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.2 }}>{a.name}</span>
                          )}
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                          <input type="checkbox" checked={c.on} onChange={() => setAppl(a.k, { on: !c.on })} disabled={readOnly} style={{ width: 18, height: 18, accentColor: 'var(--color-accent)', margin: 0 }} />
                          Incluir
                        </label>
                        {a.custom && !readOnly && (
                          <button type="button" className="btn btn-icon" onClick={() => removeCustom(a.k)} aria-label={`Quitar ${a.name}`} title="Quitar">
                            <Icon name="trash-2" size={15} />
                          </button>
                        )}
                      </div>
                      <div style={{ opacity: c.on ? 1 : 0.45, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 12, marginBottom: 5, color: 'color-mix(in srgb,var(--color-text) 70%,transparent)' }}>Instalación</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {a.insts.map((l) => {
                              const on = c.inst === l;
                              return (
                                <button type="button" key={l} onClick={() => setAppl(a.k, { inst: l, on: true })} disabled={readOnly} style={{ font: 'inherit', fontSize: 12, padding: '5px 8px', cursor: 'pointer', background: on ? 'var(--color-text)' : 'transparent', color: on ? 'var(--color-bg)' : 'var(--color-text)', border: `1px solid ${on ? 'var(--color-text)' : 'var(--color-divider)'}` }}>
                                  {l}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 6 }}>
                          {(
                            [
                              ['w', 'Ancho'],
                              ['h', 'Alto'],
                              ['d', 'Fondo'],
                            ] as const
                          ).map(([k, l]) => (
                            <div key={k} className="field">
                              <label>{l}</label>
                              <Num label={`${l} de ${a.name}`} value={c[k]} onCommit={(v) => setAppl(a.k, { [k]: Math.max(1, Math.round(v)) })} disabled={readOnly} style={{ padding: 6, width: '100%' }} />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!readOnly && (
                  <button type="button" onClick={addCustom} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 200, padding: 16, background: 'transparent', border: '2px dashed var(--color-divider)', cursor: 'pointer', font: 'inherit', color: 'var(--color-text)' }}>
                    <Icon name="plus" size={26} />
                    <span style={{ fontWeight: 800 }}>{kit ? 'Agregar electrodoméstico' : 'Agregar accesorio'}</span>
                    <span style={{ fontSize: 12, color: MUTED, textAlign: 'center' }}>Con tu nombre, instalación y medidas.</span>
                  </button>
                )}
              </div>
            )}

            {st === 5 && kit && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                {styleBlock}
                <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 24, paddingTop: 24, borderTop: '2px solid var(--color-divider)' }}>
                  {segCm('Altura de alacenas', s.prefs.alacena, ['70 cm', '90 cm'], 'Alacenas de 90 cm llegan casi al techo.', (v) => setPrefs({ alacena: v }), 'alacena', 30, 120, 70)}
                  {seg('Tipo de apertura', s.prefs.apertura, ['Jaladera', 'Gola', 'Push'], 'Se refleja en todos los frentes del 3D.', (v) => setPrefs({ apertura: v as 'Jaladera' }), 'apertura')}
                  {segCm('Zócalo', s.prefs.zocalo, ['10 cm', '15 cm'], 'Altura del rodapié bajo los módulos.', (v) => setPrefs({ zocalo: v }), 'zocalo', 5, 30, 10)}
                </div>
                <Budget value={s.prefs.presupuesto ?? 400000} currency={props.currency} onChange={(v) => setPrefs({ presupuesto: v })} disabled={readOnly} />
              </div>
            )}

            {st === 5 && !kit && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                {styleBlock}
                <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '24px 40px', maxWidth: 900 }}>
                  {(
                    [
                      ['Colgado largo', 'largo', 0, 5, 0.1, ' m', 'Vestidos, abrigos (altura libre 150 cm).'],
                      ['Colgado corto', 'corto', 0, 5, 0.1, ' m', 'Camisas, sacos (altura libre 100 cm).'],
                      ['Zapateras', 'zapatos', 0, 80, 2, ' pares', 'Repisas extraíbles inclinadas.'],
                    ] as const
                  ).map(([title, key, min, max, step, unit, note]) => (
                    <div key={key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <h6 style={{ margin: 0 }}>{title}</h6>
                        <span style={{ fontSize: 20, fontWeight: 800 }}>
                          {String(closet[key]).replace('.', ',')}
                          {unit}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                        <input type="range" min={min} max={max} step={step} value={closet[key]} onChange={(e) => setCloset({ [key]: +e.target.value })} disabled={readOnly} aria-label={title} style={{ flex: 1, minWidth: 0, accentColor: 'var(--color-accent)' }} />
                        <Num label={`${title}${unit}`} value={closet[key]} onCommit={(v) => setCloset({ [key]: Math.max(min, Math.min(max, key === 'zapatos' ? Math.round(v) : Math.round(v * 10) / 10)) })} disabled={readOnly} style={{ width: 76 }} />
                      </div>
                      <p style={{ fontSize: 12, margin: '4px 0 0', color: MUTED }}>{note}</p>
                    </div>
                  ))}
                  <div>
                    <h6 style={{ margin: '0 0 10px' }}>Cajoneras</h6>
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--color-divider)', width: 'max-content' }}>
                      <button type="button" className="btn btn-icon" onClick={() => setCloset({ cajoneras: Math.max(0, closet.cajoneras - 1) })} aria-label="Menos" disabled={readOnly}>
                        <Icon name="minus" />
                      </button>
                      <span style={{ width: 48, textAlign: 'center', fontWeight: 800, fontSize: 18 }}>{closet.cajoneras}</span>
                      <button type="button" className="btn btn-icon" onClick={() => setCloset({ cajoneras: Math.min(20, closet.cajoneras + 1) })} aria-label="Más" disabled={readOnly}>
                        <Icon name="plus" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <h6 style={{ margin: '0 0 10px' }}>Iluminación</h6>
                    <div className="seg">
                      {(['Sin iluminación', 'Tira LED', 'Tira LED con sensor'] as const).map((l) => (
                        <label key={l} className="seg-opt">
                          <input type="radio" name="luz" checked={closet.luz === l} onChange={() => setCloset({ luz: l })} disabled={readOnly} />
                          {l}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <Budget value={s.prefs.presupuesto ?? 400000} currency={props.currency} onChange={(v) => setPrefs({ presupuesto: v })} disabled={readOnly} />
              </div>
            )}

            {st === 6 && (
              <>
                <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 16 }}>
                  {[
                    {
                      n: 1,
                      title: 'Distribución',
                      rows: [
                        ['Tipo', summary[0]![2]],
                        ['Forma', lay?.name ?? '—'],
                        ['Muros', dist.walls.join(', ')],
                        [kit ? 'Fondo / alto bajos' : 'Fondo', kit ? `${dist.baseD} / ${dist.baseH} cm` : `${dist.baseD} cm`],
                        ...(dist.island.on ? [['Isla', `${dist.island.w ?? 'auto'} × ${dist.island.d} cm`]] : []),
                      ],
                      edit: 1,
                    },
                    { n: 2, title: 'Medidas', rows: [['Muro A', `${s.room.A} cm`], ['Muro B', `${s.room.B} cm`], ['Techo', `${s.room.H} cm`], ['Aberturas', String(s.ops.length)]], edit: 2 },
                    {
                      n: 3,
                      title: 'Instalaciones',
                      rows: (Object.keys(PT_T) as PointType[])
                        .filter((t) => cnt(t))
                        .map((t) => [
                          PT_T[t][1],
                          s.pts
                            .filter((p) => p.t === t)
                            .map((p) => `${p.wall} ${p.pos}`)
                            .join(' · '),
                        ]),
                      edit: 3,
                    },
                    { n: 4, title: kit ? 'Electrodomésticos' : 'Accesorios', rows: applOn.map((a) => [a.name, appl[a.k]!.inst + (kit ? ` · ${appl[a.k]!.w} cm` : '')]), edit: 4 },
                    {
                      n: 5,
                      title: 'Preferencias',
                      rows: kit
                        ? [
                            ['Estilo', s.prefs.estilo ?? '—'],
                            ['Alacenas', s.prefs.alacena ?? '—'],
                            ['Apertura', s.prefs.apertura],
                            ['Zócalo', s.prefs.zocalo ?? '—'],
                          ]
                        : [
                            ['Colgado largo', `${closet.largo} m`],
                            ['Colgado corto', `${closet.corto} m`],
                            ['Cajoneras', String(closet.cajoneras)],
                            ['Iluminación', closet.luz],
                          ],
                      edit: 5,
                    },
                    { n: 6, title: 'Presupuesto', rows: [['Aproximado', fmtMoney(s.prefs.presupuesto ?? 0, props.currency)], ['Entrega estimada', '5–6 semanas']], edit: 5 },
                  ].map((r) => (
                    <div key={r.n} style={{ background: 'var(--color-surface)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '2px solid var(--color-divider)' }}>
                        <span style={{ fontWeight: 800, fontSize: 15 }}>
                          {r.n}. {r.title}
                        </span>
                        <button type="button" className="btn btn-ghost" onClick={() => setStep(r.edit)} style={{ fontSize: 13 }}>
                          Editar
                        </button>
                      </div>
                      {r.rows.length === 0 && <span style={{ fontSize: 13, color: MUTED }}>Ninguno</span>}
                      {r.rows.map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                          <span style={{ color: MUTED }}>{k}</span>
                          <span style={{ fontWeight: 600, textAlign: 'right' }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 28, display: 'flex', alignItems: 'center', gap: 24, padding: 24, background: 'var(--color-accent)', color: '#fff', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1 }}>Todo listo para diseñar</div>
                    <div style={{ fontSize: 14, marginTop: 4 }}>Generaremos una distribución respetando tus instalaciones, electrodomésticos y presupuesto.</div>
                  </div>
                  <button type="button" className="gen-btn" onClick={props.onGenerate} disabled={readOnly} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', background: '#fff', color: 'var(--color-accent-700)', border: 0, font: 'inherit', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
                    Generar distribución propuesta
                    <Icon name="arrow-right" size={18} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 40px', borderTop: '2px solid var(--color-divider)', flex: 'none' }} className="spec-pad">
          <button type="button" className="btn btn-secondary" onClick={() => setStep(Math.max(1, st - 1))} disabled={st === 1} style={{ height: 44, padding: '0 18px' }}>
            <Icon name="arrow-left" />
            Anterior
          </button>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 13, color: MUTED, whiteSpace: 'nowrap' }} className="spec-count">
            {st} / 6
          </span>
          <button type="button" className="btn btn-primary spec-next" onClick={() => (st < 6 ? setStep(st + 1) : props.onGenerate())} disabled={st === 6 && readOnly} style={{ height: 44, padding: '0 18px', minWidth: 160, justifyContent: 'space-between', whiteSpace: 'nowrap' }}>
            {st < 6 ? 'Siguiente' : 'Generar'}
            <Icon name="arrow-right" />
          </button>
        </div>
      </section>

      <aside className="spec-aside" style={{ borderLeft: '2px solid var(--color-divider)', display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--color-surface)' }}>
        <div style={{ padding: '20px 20px 12px', borderBottom: '2px solid var(--color-divider)' }}>
          <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600, color: 'var(--color-accent-700)' }}>Resumen</div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{s.pname}</div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '4px 20px 20px' }}>
          {summary.map(([icon, label, value, at]) => {
            const done = st > at;
            return (
              <div key={label} style={{ padding: '12px 0', borderBottom: '1px solid var(--color-divider)', display: 'flex', gap: 10, alignItems: 'start' }}>
                <Icon name={done ? 'circle-check' : icon} size={15} style={{ marginTop: 2, color: done ? 'var(--color-accent)' : MUTED }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: MUTED }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: done ? 'var(--color-text)' : MUTED }}>{done ? value : 'Pendiente'}</div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
      {askBlank && (
        <Dialog
          title="¿Empezar en blanco?"
          onClose={() => setAskBlank(false)}
          actions={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setAskBlank(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  commit(blankProject(s));
                  setAskBlank(false);
                  setStep(1);
                  props.flash('Proyecto en blanco · Ctrl+Z para deshacer');
                }}
              >
                Empezar en blanco
              </button>
            </>
          }
        >
          Se quitan las puertas, ventanas, instalaciones, electrodomésticos y muebles. Se conservan el nombre, las medidas de la habitación y el estilo. Puedes deshacerlo con Ctrl+Z.
        </Dialog>
      )}
      <style>{`
        .spec-card:hover{border-color:var(--color-accent-400)!important}
        .gen-btn:hover{background:var(--color-accent-100)!important}
        .ops-row{display:grid;grid-template-columns:minmax(0,1.3fr) 64px repeat(4,minmax(0,1fr)) 36px;gap:8px}
        .ops-cell{display:block;min-width:0}.ops-cell .input{width:100%}.ops-lbl{display:none}
        @media (max-width: 640px){.ops-row{grid-template-columns:repeat(5,minmax(0,1fr));row-gap:6px}.ops-row>:first-child{grid-column:1/5}.ops-row>:last-child{grid-column:5;grid-row:1;justify-self:end}.ops-head{display:none!important}.ops-lbl{display:block;font-size:11px;color:var(--color-text);opacity:.6;margin-bottom:3px}.ops-cell .input{padding:6px 4px!important;font-size:14px}}
        .pt-row{display:grid;grid-template-columns:minmax(0,1fr) 110px 36px;gap:8px}.pt-loc{grid-column:1/-1;padding-left:40px}
        @media (max-width: 1100px){.spec-grid{grid-template-columns:minmax(0,1fr)!important}.spec-aside{display:none!important}}
        @media (max-width: 560px){.spec-next{min-width:0!important;flex:1;max-width:220px}.spec-pad .btn-secondary{padding:0 12px!important}}
        @media (max-width: 760px){.spec-pad{padding-left:16px!important;padding-right:16px!important}.grid-3,.grid-2{grid-template-columns:minmax(0,1fr)!important}.step-name{display:none}}
      `}</style>
    </div>
  );
}

function Budget({ value, currency, onChange, disabled }: { value: number; currency: Currency; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div style={{ paddingTop: 24, borderTop: '2px solid var(--color-divider)', maxWidth: 560 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h6 style={{ margin: 0 }}>Presupuesto aproximado</h6>
        <span style={{ fontSize: 22, fontWeight: 800 }}>{fmtMoney(value, currency)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13 }}>
        <span style={{ color: MUTED }}>Escribe el monto:</span>
        <Num label="Presupuesto aproximado" value={value} onCommit={(v) => onChange(Math.max(0, Math.round(v)))} disabled={disabled} style={{ width: 150 }} />
      </div>
      <input type="range" min={BUDGET_RANGE.min} max={BUDGET_RANGE.max} step={BUDGET_RANGE.step} value={value} onChange={(e) => onChange(+e.target.value)} disabled={disabled} aria-label="Presupuesto" style={{ width: '100%', accentColor: 'var(--color-accent)', marginTop: 10 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: MUTED }}>
        <span>{fmtMoney(BUDGET_RANGE.min, currency)}</span>
        <span>{fmtMoney(BUDGET_RANGE.max, currency)}</span>
      </div>
    </div>
  );
}
