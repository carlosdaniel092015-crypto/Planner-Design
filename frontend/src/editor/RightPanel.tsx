import { type Currency, type Dim, type Estimate, frontInfo, type ModuleInstance, type ProjectData, ranges } from '@core';
import { useEffect, useState } from 'react';
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
            {sel.glb && <p style={{ margin: 0, fontSize: 12, color: MUTED }}>Módulo subido en 3D: el material elegido va a la lista de corte y al despiece; el modelo conserva sus colores en la vista 3D.</p>}
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
