import { type Currency, type Dim, type Estimate, frontInfo, type ModuleInstance, type Place, placeOf, type ProjectData, ranges, usesBoards } from '@core';
import { useEffect, useRef, useState } from 'react';
import type { CatalogMaterial } from '../api';
import { fmtMoney, Icon, MUTED, Svg } from '../ui';
import { frontThumb } from './engine';

const HERRAJES = ['Bisagra cierre suave 110°', 'Bisagra push-to-open', 'Corredera oculta cierre suave', 'Carrusel esquinero 3/4'];

/** Number input that only commits on blur/Enter (so typing "7" on the way to "75" doesn't clamp). */
function NumberField({ value, min, max, disabled, onCommit, label, style }: { value: number; min?: number; max?: number; disabled?: boolean; onCommit: (v: number) => void; label: string; style?: React.CSSProperties }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text);
    if (Number.isFinite(n) && text.trim() !== '') onCommit(n);
    else setText(String(value));
  };
  return (
    <input
      className="input"
      type="number"
      value={text}
      min={min}
      max={max}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      style={style}
    />
  );
}

export function RightPanel(props: {
  data: ProjectData;
  sel: ModuleInstance | null;
  materials: CatalogMaterial[];
  materialsByCode: Record<string, CatalogMaterial>;
  estimate: Estimate;
  currency: Currency;
  rate: number;
  readOnly: boolean;
  onClose: () => void;
  onDeselect: () => void;
  onDim: (key: Dim, v: number) => void;
  onFronts: (n: number) => void;
  onPatch: (patch: Partial<ModuleInstance>) => void;
  onHerraje: (v: string) => void;
  onPrice: (value: number | null) => void;
  onDuplicate: () => void;
  onReplace: () => void;
  onRemove: () => void;
  onMove: (to: Place) => void;
}) {
  const { data, sel, currency, rate, readOnly } = props;
  const line = sel ? props.estimate.lines.find((l) => l.id === sel.id) : undefined;
  const label = currency === 'USD' ? 'US$' : 'RD$';

  const head = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 10px 10px 16px', borderBottom: '2px solid var(--color-divider)' }}>
      <span style={{ flex: 1, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600 }}>Propiedades</span>
      <button type="button" className="btn btn-icon" onClick={props.onClose} title="Contraer panel" aria-label="Contraer panel">
        <Icon name="panel-right-close" size={17} />
      </button>
    </div>
  );

  if (!sel) {
    const floor = data.mods.filter((m) => m.type !== 'upper' && m.type !== 'hood');
    const stats = [
      { k: 'Módulos', v: String(data.mods.length) },
      { k: 'Metros lineales', v: `${(floor.reduce((a, m) => a + m.w, 0) / 100).toFixed(1).replace('.', ',')} m` },
      { k: 'Encimera', v: props.materialsByCode[data.mats.encimera]?.name ?? data.mats.encimera },
      { k: 'Frentes', v: props.materialsByCode[data.mats.frentes]?.name ?? data.mats.frentes },
      ...(data.prefs.presupuesto ? [{ k: 'Presupuesto objetivo', v: fmtMoney(data.prefs.presupuesto, currency) }] : []),
      { k: 'Precio estimado', v: fmtMoney(props.estimate.total, currency) },
    ];
    return (
      <aside className="ed-right" style={{ width: 320, flex: 'none', borderLeft: '2px solid var(--color-divider)', display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--color-bg)' }}>
        {head}
        <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: 16, border: '2px dashed var(--color-divider)', fontSize: 14, color: 'color-mix(in srgb,var(--color-text) 70%,transparent)', display: 'flex', gap: 10 }}>
            <Icon name="mouse-pointer-click" size={18} />
            Selecciona un módulo en el visor para editar sus propiedades.
          </div>
          <div>
            <h6 style={{ margin: '0 0 6px' }}>Proyecto</h6>
            {stats.map((s) => (
              <div key={s.k} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--color-divider)', fontSize: 14 }}>
                <span style={{ color: 'color-mix(in srgb,var(--color-text) 65%,transparent)' }}>{s.k}</span>
                <strong>{s.v}</strong>
              </div>
            ))}
          </div>
        </div>
      </aside>
    );
  }

  const r = ranges(sel);
  const dims: { key: Dim; label: string }[] = [
    { key: 'w', label: 'Ancho' },
    { key: 'h', label: 'Alto' },
    { key: 'd', label: 'Fondo' },
  ];
  const fi = frontInfo(sel);
  const singleDoor = fi?.kind === 'Puertas' && fi.count === 1 && !sel.fr.some((f) => f.t === 'drawer');
  const buildable = sel.type !== 'fridge' && sel.type !== 'hood';
  const cuerpoOpts = props.materials.filter((m) => m.uses.includes('cuerpo'));
  const frenteOpts = props.materials.filter((m) => m.uses.includes('frentes'));

  return (
    <aside className="ed-right" style={{ width: 320, flex: 'none', borderLeft: '2px solid var(--color-divider)', display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--color-bg)' }}>
      {head}
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'start' }}>
          <div style={{ width: 72, height: 84, background: 'var(--sp-canvas)', padding: 6, flex: 'none' }}>
            <Svg drawing={frontThumb(sel, data.mats, props.materialsByCode, data.prefs.apertura)} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--color-accent-700)', fontWeight: 600 }}>Módulo {sel.id}</div>
            <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.15 }}>{sel.name}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <span className="tag tag-accent">{sel.code}</span>
              <span className="tag tag-neutral">{sel.cat}</span>
            </div>
          </div>
          <button type="button" className="btn btn-icon" onClick={props.onDeselect} aria-label="Deseleccionar" title="Deseleccionar" style={{ width: 30, height: 30 }}>
            <Icon name="x" size={15} />
          </button>
        </div>

        <Ubicacion sel={sel} room={data.room} readOnly={readOnly} onMove={props.onMove} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 14, borderTop: '2px solid var(--color-divider)' }}>
          <h6 style={{ margin: 0 }}>Medidas</h6>
          {dims.map((d) => {
            const [min, max] = r[d.key];
            const fixed = min === max || readOnly;
            const val = sel[d.key];
            return (
              <div key={d.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>
                    {d.label} <span style={{ fontWeight: 400, color: MUTED }}>{min === max ? `${min} cm fijo` : `${min}–${max} cm`}</span>
                  </label>
                  <div style={{ position: 'relative', width: 86 }}>
                    <NumberField value={val} min={min} max={max} disabled={fixed} label={d.label} onCommit={(v) => props.onDim(d.key, v)} style={{ padding: '4px 28px 4px 8px', minHeight: 32, width: '100%' }} />
                    <span style={{ position: 'absolute', right: 8, top: 7, fontSize: 12, opacity: 0.6 }}>cm</span>
                  </div>
                </div>
                <input type="range" min={min} max={max} step={1} value={val} onChange={(e) => props.onDim(d.key, +e.target.value)} disabled={fixed} aria-label={d.label} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
              </div>
            );
          })}
        </div>

        {fi && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, paddingTop: 14, borderTop: '2px solid var(--color-divider)' }}>
            <div>
              <div style={{ fontSize: 12, marginBottom: 5, color: 'color-mix(in srgb,var(--color-text) 70%,transparent)' }}>{fi.kind}</div>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--color-divider)', width: 'max-content' }}>
                <button type="button" className="btn btn-icon" onClick={() => props.onFronts(fi.count - 1)} disabled={readOnly || fi.count <= fi.min} aria-label="Menos" style={{ width: 34, height: 34 }}>
                  <Icon name="minus" size={15} />
                </button>
                <span style={{ width: 34, textAlign: 'center', fontWeight: 800 }}>{fi.count}</span>
                <button type="button" className="btn btn-icon" onClick={() => props.onFronts(fi.count + 1)} disabled={readOnly || fi.count >= fi.max} aria-label="Más" style={{ width: 34, height: 34 }}>
                  <Icon name="plus" size={15} />
                </button>
              </div>
            </div>
            {singleDoor && (
              <div>
                <div style={{ fontSize: 12, marginBottom: 5, color: 'color-mix(in srgb,var(--color-text) 70%,transparent)' }}>Apertura</div>
                <div className="seg">
                  {(
                    [
                      ['der', 'Derecha'],
                      ['izq', 'Izquierda'],
                    ] as const
                  ).map(([k, l]) => (
                    <label key={k} className="seg-opt" style={{ padding: '7px 9px' }}>
                      <input type="radio" name="apertura-mod" checked={(sel.open ?? 'der') === k} onChange={() => props.onPatch({ open: k === 'der' ? undefined : 'izq' })} disabled={readOnly} />
                      {l}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {buildable && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 14, borderTop: '2px solid var(--color-divider)' }}>
            <h6 style={{ margin: 0 }}>Materiales y herrajes</h6>
            {sel.glb && (
              <p style={{ margin: 0, fontSize: 12, color: MUTED }}>
                {sel.panels?.length
                  ? usesBoards(sel)
                    ? `Módulo subido convertido a nativo: sus puertas y cajones funcionan como los del catálogo y sus ${sel.panels.length} piezas reales van al despiece.`
                    : 'Módulo subido convertido a nativo. Cambiaste sus frentes, así que se despieza como un módulo estándar.'
                  : 'Módulo subido en 3D: se dibuja con su forma; el material que elijas se le aplica y va a la lista de corte y al despiece.'}
              </p>
            )}
            <div className="field">
              <label>Cuerpo</label>
              <select className="input" value={sel.cue ?? ''} onChange={(e) => props.onPatch({ cue: e.target.value || undefined })} disabled={readOnly}>
                <option value="">Según proyecto</option>
                {cuerpoOpts.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.name} · {m.type.split(' ')[0]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Frente</label>
              <select className="input" value={sel.fre ?? ''} onChange={(e) => props.onPatch({ fre: e.target.value || undefined })} disabled={readOnly}>
                <option value="">Según proyecto</option>
                {frenteOpts.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.name} · {m.type.split(' ')[0]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Herrajes</label>
              <select className="input" value={data.herr?.[String(sel.id)] ?? HERRAJES[0]} onChange={(e) => props.onHerraje(e.target.value)} disabled={readOnly}>
                {HERRAJES.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 14, borderTop: '2px solid var(--color-divider)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 13 }}>Precio del módulo</span>
            {sel.pOv != null && (
              <span className="tag tag-accent" style={{ fontSize: 10 }}>
                Manual
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <span style={{ position: 'absolute', left: 10, top: 9, fontSize: 13, fontWeight: 700, opacity: 0.65 }}>{label}</span>
              <NumberField value={Math.round(line?.total ?? 0)} min={0} disabled={readOnly} label="Precio del módulo" onCommit={(v) => props.onPrice(v)} style={{ paddingLeft: 44, fontWeight: 800, fontSize: 16, width: '100%' }} />
            </div>
            {sel.pOv != null && !readOnly && (
              <button type="button" className="btn btn-icon" onClick={() => props.onPrice(null)} title="Volver al precio calculado" aria-label="Volver al precio calculado">
                <Icon name="rotate-ccw" size={16} />
              </button>
            )}
          </div>
          {line && line.basis === 'catalogo' && (
            <span style={{ fontSize: 12, color: MUTED }}>
              Tableros {fmtMoney(line.materials, currency)} · herrajes {fmtMoney(line.hardware, currency)} · mano de obra {fmtMoney(line.labor, currency)}
            </span>
          )}
        </div>
      </div>
      {!readOnly && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, padding: '12px 16px', borderTop: '2px solid var(--color-divider)' }}>
          <button type="button" className="btn btn-secondary" onClick={props.onDuplicate} style={{ flexDirection: 'column', gap: 4, padding: '8px 4px', fontSize: 12 }}>
            <Icon name="copy" />
            Duplicar
          </button>
          <button type="button" className="btn btn-secondary" onClick={props.onReplace} style={{ flexDirection: 'column', gap: 4, padding: '8px 4px', fontSize: 12 }}>
            <Icon name="replace" />
            Reemplazar
          </button>
          <button type="button" className="btn btn-secondary" onClick={props.onRemove} style={{ flexDirection: 'column', gap: 4, padding: '8px 4px', fontSize: 12, color: 'var(--color-accent-700)' }}>
            <Icon name="trash-2" />
            Eliminar
          </button>
        </div>
      )}
    </aside>
  );
}

/** Big button that repeats while held (touch or mouse), for nudging a module a few cm at a time. */
function Nudge({ label, icon, onStep, disabled }: { label: string; icon: string; onStep: () => void; disabled?: boolean }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const step = useRef(onStep);
  step.current = onStep;
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  const start = () => {
    stop();
    step.current();
    const again = (delay: number) => {
      timer.current = setTimeout(() => {
        step.current();
        again(90);
      }, delay);
    };
    again(400);
  };
  return (
    <button
      type="button"
      className="btn btn-secondary"
      aria-label={label}
      title={label}
      disabled={disabled}
      onPointerDown={(e) => {
        e.preventDefault();
        start();
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onStep())}
      style={{ minWidth: 44, height: 40, padding: 0, justifyContent: 'center', touchAction: 'none' }}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

const WALLS = [
  ['A', 'Muro A'],
  ['B', 'Muro B'],
  ['C', 'Muro C'],
  ['D', 'Muro D'],
  ['F', 'Isla (libre)'],
] as const;

/** Where the module stands: wall, distance from its corner and nudge buttons (islands: X and Y). Works with a finger. */
function Ubicacion({ sel, room, readOnly, onMove }: { sel: ModuleInstance; room: ProjectData['room']; readOnly: boolean; onMove: (to: Place) => void }) {
  const at = placeOf(sel);
  const upper = sel.type === 'upper' || sel.type === 'hood';
  const setWall = (w: string) => {
    if (w === at.wall) return;
    if (w === 'F') onMove({ wall: 'F', x: Math.round((room.A - sel.w) / 2), y: Math.round((room.B - sel.d) / 2) });
    else onMove({ wall: w as 'A', pos: at.wall === 'F' ? 0 : at.pos });
  };
  const by = (dx: number, dy = 0) => (at.wall === 'F' ? onMove({ wall: 'F', x: at.x + dx, y: at.y + dy }) : onMove({ wall: at.wall, pos: at.pos + dx }));
  const lenW = at.wall === 'A' || at.wall === 'D' ? room.A : room.B;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 14, borderTop: '2px solid var(--color-divider)' }}>
      <h6 style={{ margin: 0 }}>Ubicación</h6>
      <div className="field">
        <label>Muro</label>
        <select className="input" aria-label="Muro del módulo" value={at.wall} onChange={(e) => setWall(e.target.value)} disabled={readOnly}>
          {WALLS.filter(([k]) => !(upper && k === 'F')).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>
      {at.wall !== 'F' ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>
              Desde la esquina <span style={{ fontWeight: 400, color: MUTED }}>0–{Math.max(0, lenW - sel.w)} cm</span>
            </label>
            <div style={{ position: 'relative', width: 86 }}>
              <NumberField value={at.pos} min={0} disabled={readOnly} label="Distancia desde la esquina" onCommit={(v) => onMove({ wall: at.wall, pos: v })} style={{ padding: '4px 28px 4px 8px', minHeight: 32, width: '100%' }} />
              <span style={{ position: 'absolute', right: 8, top: 7, fontSize: 12, opacity: 0.6 }}>cm</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
            <Nudge label="Mover 5 cm hacia la esquina" icon="chevrons-left" onStep={() => by(-5)} disabled={readOnly} />
            <Nudge label="Mover 1 cm hacia la esquina" icon="chevron-left" onStep={() => by(-1)} disabled={readOnly} />
            <Nudge label="Mover 1 cm" icon="chevron-right" onStep={() => by(1)} disabled={readOnly} />
            <Nudge label="Mover 5 cm" icon="chevrons-right" onStep={() => by(5)} disabled={readOnly} />
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(['x', 'y'] as const).map((k) => (
              <div key={k} className="field">
                <label>{k === 'x' ? 'X (desde muro B)' : 'Y (desde muro A)'}</label>
                <NumberField value={at[k]} min={0} disabled={readOnly} label={k === 'x' ? 'Posición X' : 'Posición Y'} onCommit={(v) => onMove({ ...at, [k]: v })} style={{ padding: '4px 8px', minHeight: 32, width: '100%' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            <Nudge label="Mover 5 cm a la izquierda" icon="arrow-left" onStep={() => by(-5, 0)} disabled={readOnly} />
            <Nudge label="Mover 5 cm hacia arriba" icon="arrow-up" onStep={() => by(0, -5)} disabled={readOnly} />
            <Nudge label="Mover 5 cm hacia abajo" icon="arrow-down" onStep={() => by(0, 5)} disabled={readOnly} />
            <Nudge label="Mover 5 cm a la derecha" icon="arrow-right" onStep={() => by(5, 0)} disabled={readOnly} />
          </div>
        </>
      )}
      <p style={{ margin: 0, fontSize: 12, color: MUTED }}>También puedes arrastrarlo en la vista Planta. Se alinea solo con las esquinas y los módulos vecinos.</p>
    </div>
  );
}
