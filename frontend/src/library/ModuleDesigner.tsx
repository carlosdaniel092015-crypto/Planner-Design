// Module designer (Bibliotecas → Módulos), after Polyboard: every parameter of a parametric module on the left,
// its front, side and top views with their measures in the middle and the live despiece on the right.
import { DEFAULT_MATERIALS, DEFAULT_MODULES, ESTILOS, type FrontSegment, frontCounts, isAppliance, type ModuleInstance, parts, placesFor } from '@core';
import { useMemo, useState } from 'react';
import { frontThumb } from '../editor/engine';
import { Icon, MUTED, Svg } from '../ui';
import { FrontsEditor } from './FrontsEditor';
import type { LibModule } from './upload';

export type Montaje = 'base' | 'upper' | 'tall' | 'cover';

export interface ModuleDraft {
  name: string;
  category: string;
  projectType: 'cocina' | 'closet' | 'tv';
  montaje: Montaje;
  defW: number;
  minW: number;
  maxW: number;
  fixedH: number;
  fixedD: number;
  unitPrice: number;
  place: string;
  fr: FrontSegment[];
  /** null = the usual count for its fronts. */
  shelves: number | null;
  div: number;
  back: boolean;
  sink: 0 | 1 | 2;
  cook: 0 | 4 | 6;
  oven: boolean;
  /** Recipe keys the designer doesn't edit (appliance flags, uploaded boards…), kept as they were. */
  keep?: Record<string, unknown>;
}

/** Starting point of a new module, per mounting. */
export const NEW_DEFAULTS: Record<Montaje, Pick<ModuleDraft, 'defW' | 'minW' | 'maxW' | 'fixedH' | 'fixedD' | 'category' | 'fr'>> = {
  base: { defW: 60, minW: 30, maxW: 120, fixedH: 76, fixedD: 60, category: 'Bajos', fr: [{ t: 'door', n: 1, f: 1 }] },
  upper: { defW: 60, minW: 30, maxW: 120, fixedH: 70, fixedD: 35, category: 'Altos', fr: [{ t: 'door', n: 1, f: 1 }] },
  tall: { defW: 60, minW: 40, maxW: 90, fixedH: 210, fixedD: 60, category: 'Columnas', fr: [{ t: 'door', n: 1, f: 0.6 }, { t: 'door', n: 1, f: 0.4 }] },
  cover: { defW: 60, minW: 15, maxW: 400, fixedH: 30, fixedD: 35, category: 'Altos', fr: [] },
};

export const emptyDraft = (montaje: Montaje = 'base'): ModuleDraft => ({
  name: '',
  projectType: 'cocina',
  montaje,
  unitPrice: 0,
  place: '',
  shelves: null,
  div: 0,
  back: true,
  sink: 0,
  cook: 0,
  oven: false,
  ...structuredClone(NEW_DEFAULTS[montaje]),
});

/** A library module (parametric) as a draft. */
export function draftOf(m: LibModule): ModuleDraft {
  const r = (m.recipe ?? {}) as { fr?: FrontSegment[]; shelves?: number; div?: number; back?: number; sink?: number; cook?: number; oven?: number; cover?: number };
  const type = m.type === 'upper' || m.type === 'tall' ? m.type : 'base';
  const { fr: _fr, shelves: _s, div: _d, back: _b, sink: _k, cook: _c, oven: _o, cover: _v, ...keep } = r as Record<string, unknown>;
  return {
    name: m.name,
    category: m.category,
    projectType: m.projectType ?? 'cocina',
    montaje: r.cover ? 'cover' : type,
    defW: m.defW,
    minW: m.minW,
    maxW: m.maxW,
    fixedH: m.fixedH,
    fixedD: m.fixedD,
    unitPrice: m.unitPrice,
    place: m.anchor?.place ?? '',
    fr: r.fr ?? [],
    shelves: r.shelves ?? null,
    div: r.div ?? 0,
    back: r.back !== 0,
    sink: r.sink === 2 ? 2 : r.sink ? 1 : 0,
    cook: r.cook === 6 ? 6 : r.cook ? 4 : 0,
    oven: !!r.oven,
    keep,
  };
}

const typeOf = (d: Pick<ModuleDraft, 'montaje'>) => (d.montaje === 'cover' ? 'upper' : d.montaje);

/** What the API stores for a draft (POST / PATCH /library/modules). */
export function draftToBody(d: ModuleDraft) {
  const cover = d.montaje === 'cover';
  return {
    name: d.name.trim(),
    category: d.category,
    projectType: d.projectType,
    type: typeOf(d),
    defW: d.defW,
    minW: d.minW,
    maxW: d.maxW,
    fixedH: d.fixedH,
    fixedD: d.fixedD,
    unitPrice: d.unitPrice,
    anchor: d.place && !cover ? { place: d.place } : null,
    recipe: cover
      ? { ...d.keep, fr: [], cover: 1 }
      : {
          ...d.keep,
          fr: d.fr,
          ...(d.shelves != null ? { shelves: d.shelves } : {}),
          ...(d.div ? { div: d.div } : {}),
          ...(d.back ? {} : { back: 0 }),
          ...(d.montaje === 'base' && d.sink ? { sink: d.sink } : {}),
          ...(d.montaje === 'base' && d.cook ? { cook: d.cook } : {}),
          ...(d.montaje !== 'upper' && d.oven ? { oven: 1 } : {}),
        },
  };
}

/** Problems that keep a draft from being saved (empty = fine). */
export function draftErrors(d: ModuleDraft): string[] {
  const out: string[] = [];
  if (!d.name.trim()) out.push('Ponle un nombre al módulo.');
  if (d.minW > d.defW || d.defW > d.maxW) out.push('El ancho debe estar entre el ancho mínimo y el máximo.');
  if (d.montaje !== 'cover' && d.fr.some((f) => f.t === 'oven') && d.montaje === 'upper') out.push('Un hueco de horno no va en una alacena.');
  return out;
}

/** Catalogue furniture a new module can start from ("Partir de"). */
const STARTERS = DEFAULT_MODULES.filter((m) => !isAppliance(m) && !m.panels?.length && (m.type === 'base' || m.type === 'upper' || m.type === 'tall')).sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));

const PREVIEW_MATS = ESTILOS[0]!.m;
const PREVIEW_MATERIALS = Object.fromEntries(DEFAULT_MATERIALS.map((m) => [m.code, m]));
const PREVIEW_BY_CODE = Object.fromEntries(DEFAULT_MATERIALS.map((m) => [m.code, { color: m.color }]));

function NumField({ id, label, unit = 'cm', value, min, max, step = 1, onChange, disabled }: { id: string; label: string; unit?: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          className="input"
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
          style={{ width: '100%', paddingRight: unit ? 36 : undefined }}
        />
        {unit && <span style={{ position: 'absolute', right: 10, top: 9, fontSize: 12, opacity: 0.6 }}>{unit}</span>}
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 16, borderBottom: '1px solid var(--color-divider)' }}>
      <h6 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={15} />
        {title}
      </h6>
      {children}
    </section>
  );
}

/** Side (section) and top views of the box, with its measures: back, shelves, dividers, plinth and fronts. */
function SideTop({ d, plinth }: { d: ModuleDraft; plinth: number }) {
  const W = d.defW;
  const H = d.fixedH;
  const D = d.fixedD;
  const t = 1.8;
  const ink = 'var(--color-text)';
  const body = '#eeebe6';
  const front = '#c49a6c';
  const shelves = d.montaje === 'cover' ? 0 : (d.shelves ?? (d.montaje === 'tall' ? 3 : d.fr.every((f) => f.t === 'drawer') ? 0 : 1));
  const pad = Math.max(16, Math.max(W, H, D) * 0.08);
  const sideVB = `${-pad} ${-pad} ${D + pad * 2} ${H + plinth + pad * 2}`;
  const topVB = `${-pad} ${-pad} ${W + pad * 2} ${D + pad * 2}`;
  // Text scaled to each view (the side view is as tall as the module, the top view as wide).
  const label = (x: number, y: number, s: string, fs: number, rot = 0) => (
    <text x={x} y={y} fontSize={fs} textAnchor="middle" fill={ink} transform={rot ? `rotate(${rot} ${x} ${y})` : undefined}>
      {s}
    </text>
  );
  const cover = d.montaje === 'cover';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <figure style={{ margin: 0 }}>
        <svg viewBox={sideVB} style={{ width: '100%', height: 220, background: 'var(--sp-canvas)' }} role="img" aria-label="Vista lateral">
          {cover ? (
            <rect x={D - t} y={0} width={t} height={H} fill={front} stroke={ink} strokeWidth={0.3} />
          ) : (
            <>
              <rect x={0} y={0} width={D - t} height={H} fill={body} stroke={ink} strokeWidth={0.3} />
              {d.back && <rect x={0.6} y={t} width={0.6} height={H - 2 * t} fill="#9b9797" />}
              {Array.from({ length: shelves }, (_, i) => (
                <rect key={i} x={1.2} y={t + ((H - 2 * t) * (i + 1)) / (shelves + 1)} width={D - t - 3} height={t} fill="#d6d1c8" stroke={ink} strokeWidth={0.2} />
              ))}
              {d.fr.length > 0 && <rect x={D - t} y={0} width={t} height={H} fill={front} stroke={ink} strokeWidth={0.3} />}
              {plinth > 0 && <rect x={6} y={H} width={D - t - 6} height={plinth} fill="#3b3936" />}
            </>
          )}
          {label(D / 2, -4, `Fondo ${D} cm`, Math.max(H + plinth, D) * 0.045)}
          {label(-5, H / 2, `Alto ${H} cm`, Math.max(H + plinth, D) * 0.045, -90)}
        </svg>
        <figcaption style={{ fontSize: 12, color: MUTED, textAlign: 'center' }}>Lateral (corte)</figcaption>
      </figure>
      <figure style={{ margin: 0 }}>
        <svg viewBox={topVB} style={{ width: '100%', height: 220, background: 'var(--sp-canvas)' }} role="img" aria-label="Vista superior">
          {cover ? (
            <rect x={0} y={D - t} width={W} height={t} fill={front} stroke={ink} strokeWidth={0.3} />
          ) : (
            <>
              <rect x={0} y={0} width={W} height={D - t} fill={body} stroke={ink} strokeWidth={0.3} />
              {d.back && <rect x={t} y={0.6} width={W - 2 * t} height={0.6} fill="#9b9797" />}
              {Array.from({ length: d.div }, (_, i) => {
                const cw = (W - 2 * t - d.div * t) / (d.div + 1);
                return <rect key={i} x={t + (i + 1) * cw + i * t} y={1.2} width={t} height={D - t - 3} fill="#d6d1c8" stroke={ink} strokeWidth={0.2} />;
              })}
              {d.fr.length > 0 && <rect x={0} y={D - t} width={W} height={t} fill={front} stroke={ink} strokeWidth={0.3} />}
              {d.sink > 0 && <rect x={W * 0.15} y={D * 0.15} width={W * 0.7} height={D * 0.55} fill="none" stroke={ink} strokeWidth={0.4} />}
              {d.cook > 0 &&
                Array.from({ length: d.cook }, (_, i) => {
                  const cols = d.cook === 6 ? 3 : 2;
                  return <circle key={i} cx={(W * ((i % cols) + 0.5)) / cols} cy={(D - t) * (i < cols ? 0.3 : 0.7)} r={Math.min(W, D) * 0.1} fill="none" stroke={ink} strokeWidth={0.4} />;
                })}
            </>
          )}
          {label(W / 2, -4, `Ancho ${W} cm`, Math.max(W, D) * 0.06)}
        </svg>
        <figcaption style={{ fontSize: 12, color: MUTED, textAlign: 'center' }}>Planta (desde arriba){d.div ? ` · ${d.div + 1} compartimentos` : ''}</figcaption>
      </figure>
    </div>
  );
}

export function ModuleDesigner({ initial, title, cats, busy, onCancel, onSave }: { initial: ModuleDraft; title: string; cats: string[]; busy?: boolean; onCancel: () => void; onSave: (d: ModuleDraft) => void }) {
  const [d, setD] = useState<ModuleDraft>(initial);
  const [errs, setErrs] = useState<string[]>([]);
  const set = (patch: Partial<ModuleDraft>) => setD((x) => ({ ...x, ...patch }));
  const cover = d.montaje === 'cover';
  const type = typeOf(d);
  const plinth = type === 'upper' ? 0 : 10;

  const inst = useMemo(
    () =>
      ({
        id: 1,
        code: 'NUEVO',
        name: d.name || 'Nuevo módulo',
        cat: d.category,
        type,
        wall: 'A',
        pos: 0,
        w: d.defW,
        h: d.fixedH,
        d: d.fixedD,
        fr: cover ? [] : d.fr,
        rw: [d.minW, d.maxW],
        ...(cover ? { cover: 1 } : {}),
        ...(d.shelves != null && !cover ? { shelves: d.shelves } : {}),
        ...(d.div && !cover ? { div: d.div } : {}),
        ...(!d.back && !cover ? { back: 0 } : {}),
        ...(d.montaje === 'base' && d.sink ? { sink: d.sink } : {}),
        ...(d.montaje === 'base' && d.cook ? { cook: d.cook } : {}),
        ...(d.montaje !== 'upper' && !cover && d.oven ? { oven: 1 } : {}),
      }) as unknown as ModuleInstance,
    [d, type, cover],
  );
  const pieces = useMemo(() => parts(inst, PREVIEW_MATS, PREVIEW_MATERIALS), [inst]);
  const area = pieces.reduce((a, p) => a + (p.cant * p.L * p.A) / 1e6, 0);
  const counts = frontCounts(inst);
  const hinges = counts.doors * 2 + counts.tallDoors;
  const places = placesFor({ projectType: d.projectType, type });

  const changeMontaje = (montaje: Montaje) => setD((x) => ({ ...x, montaje, ...structuredClone(NEW_DEFAULTS[montaje]), ...(montaje === 'cover' ? { shelves: null, div: 0 } : {}), place: '' }));
  const startFrom = (code: string) => {
    const m = DEFAULT_MODULES.find((x) => x.code === code);
    if (!m) return;
    const montaje = m.type === 'upper' || m.type === 'tall' ? m.type : 'base';
    setD((x) => ({
      ...x,
      name: x.name || `${m.name} (propio)`,
      category: m.cat,
      projectType: m.projectType,
      montaje,
      defW: m.w,
      minW: m.rw?.[0] ?? m.w,
      maxW: m.rw?.[1] ?? m.w,
      fixedH: m.h,
      fixedD: m.d,
      fr: structuredClone(m.fr),
      sink: m.sink === 2 ? 2 : m.sink ? 1 : 0,
      cook: m.cook === 6 ? 6 : m.cook ? 4 : 0,
      oven: !!m.oven,
      shelves: null,
      div: 0,
      back: true,
      place: '',
    }));
  };
  const save = () => {
    const e = draftErrors(d);
    setErrs(e);
    if (!e.length) onSave(d);
  };

  return (
    <div className="dialog-backdrop" style={{ zIndex: 80, position: 'fixed' }} onClick={onCancel}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} style={{ width: 'min(1320px,100%)', height: 'min(860px,100%)', gap: 0, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <style>{'@media (max-width: 1000px){.designer-body{grid-template-columns:minmax(0,1fr)!important}.designer-body>div{overflow:visible!important;border:0!important}}'}</style>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '2px solid var(--color-divider)' }}>
          <Icon name="ruler" size={20} />
          <div style={{ flex: 1 }}>
            <div className="dialog-title" style={{ margin: 0 }}>{title}</div>
            <div style={{ fontSize: 13, color: MUTED }}>Cambia cualquier medida o parámetro y mira al momento las vistas y el despiece.</div>
          </div>
          <button type="button" className="btn btn-icon" onClick={onCancel} aria-label="Cerrar">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="designer-body" style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(280px,340px) minmax(0,1fr) minmax(260px,340px)', overflow: 'auto' }}>
          {/* ---------- parameters ---------- */}
          <div style={{ overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16, borderRight: '1px solid var(--color-divider)' }}>
            <Section title="General" icon="file-text">
              <div className="field">
                <label htmlFor="md-name">Nombre</label>
                <input id="md-name" className="input" value={d.name} maxLength={120} placeholder="Bajo 2 puertas con gaveta" onChange={(e) => set({ name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="md-from">Partir de un módulo del catálogo</label>
                <select id="md-from" className="input" value="" onChange={(e) => startFrom(e.target.value)}>
                  <option value="">Elige uno para copiar sus medidas y frentes…</option>
                  {STARTERS.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.cat} · {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field">
                  <label htmlFor="md-type">Montaje</label>
                  <select id="md-type" className="input" value={d.montaje} onChange={(e) => changeMontaje(e.target.value as Montaje)}>
                    <option value="base">Bajo (con encimera)</option>
                    <option value="upper">Alto (a 150 cm)</option>
                    <option value="tall">Columna</option>
                    <option value="cover">Cubre falta superior</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="md-cat">Categoría</label>
                  <select id="md-cat" className="input" value={d.category} onChange={(e) => set({ category: e.target.value })}>
                    {[...new Set([...cats, d.category])].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="md-pt">Proyecto</label>
                  <select id="md-pt" className="input" value={d.projectType} onChange={(e) => set({ projectType: e.target.value as ModuleDraft['projectType'], place: '' })}>
                    <option value="cocina">Cocina</option>
                    <option value="closet">Closet y vestidor</option>
                    <option value="tv">Mueble de TV</option>
                  </select>
                </div>
                <NumField id="md-price" label="Precio (mano de obra)" unit="" value={d.unitPrice} min={0} max={10_000_000} onChange={(unitPrice) => set({ unitPrice })} />
              </div>
              {!cover && (
                <div className="field">
                  <label htmlFor="md-place" title="Dónde lo coloca «Generar distribución» sin elegirlo en el asistente">Ubicación predeterminada</label>
                  <select id="md-place" className="input" value={places.some((p) => p.key === d.place) ? d.place : ''} onChange={(e) => set({ place: e.target.value })}>
                    <option value="">Ninguna (elígelo en el asistente)</option>
                    {places.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </Section>

            <Section title="Medidas" icon="ruler">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <NumField id="md-w" label="Ancho" value={d.defW} min={10} max={400} onChange={(defW) => set({ defW, minW: Math.min(d.minW, defW), maxW: Math.max(d.maxW, defW) })} />
                <NumField id="md-h" label="Alto" value={d.fixedH} min={3} max={300} onChange={(fixedH) => set({ fixedH })} />
                <NumField id="md-d" label="Fondo" value={d.fixedD} min={10} max={120} onChange={(fixedD) => set({ fixedD })} />
                <NumField id="md-minw" label="Ancho mín." value={d.minW} min={10} max={400} onChange={(minW) => set({ minW })} />
                <NumField id="md-maxw" label="Ancho máx." value={d.maxW} min={10} max={400} onChange={(maxW) => set({ maxW })} />
              </div>
              <span style={{ fontSize: 12, color: MUTED }}>
                {cover ? 'En el proyecto se ajusta solo: del techo de las alacenas o columnas hasta el techo del cuarto.' : 'En el proyecto puedes estirarlo entre el ancho mínimo y el máximo; el despiece se recalcula.'}
              </span>
            </Section>

            {!cover && (
              <>
                <Section title="Construcción" icon="layers">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="field">
                      <label htmlFor="md-sh">Entrepaños</label>
                      <select id="md-sh" className="input" value={d.shelves ?? 'auto'} onChange={(e) => set({ shelves: e.target.value === 'auto' ? null : Number(e.target.value) })}>
                        <option value="auto">Automático</option>
                        {Array.from({ length: 13 }, (_, i) => (
                          <option key={i} value={i}>
                            {i === 0 ? 'Ninguno' : `${i} por compartimento`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="md-div">Divisiones verticales</label>
                      <select id="md-div" className="input" value={d.div} onChange={(e) => set({ div: Number(e.target.value) })}>
                        {Array.from({ length: 7 }, (_, i) => (
                          <option key={i} value={i}>
                            {i === 0 ? 'Ninguna' : `${i} (${i + 1} compartimentos)`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <input type="checkbox" checked={d.back} onChange={(e) => set({ back: e.target.checked })} />
                    Trasera de 6 mm
                  </label>
                </Section>

                {d.montaje !== 'upper' && (
                  <Section title="Equipamiento" icon="wand-sparkles">
                    {d.montaje === 'base' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div className="field">
                          <label htmlFor="md-sink">Fregadero</label>
                          <select id="md-sink" className="input" value={d.sink} onChange={(e) => set({ sink: Number(e.target.value) as ModuleDraft['sink'] })}>
                            <option value={0}>No</option>
                            <option value={1}>1 bocal</option>
                            <option value={2}>2 bocales</option>
                          </select>
                        </div>
                        <div className="field">
                          <label htmlFor="md-cook">Parrilla empotrada</label>
                          <select id="md-cook" className="input" value={d.cook} onChange={(e) => set({ cook: Number(e.target.value) as ModuleDraft['cook'] })}>
                            <option value={0}>No</option>
                            <option value={4}>4 hornillas</option>
                            <option value={6}>6 hornillas</option>
                          </select>
                        </div>
                      </div>
                    )}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <input type="checkbox" checked={d.oven} onChange={(e) => set({ oven: e.target.checked })} />
                      Lleva horno empotrado (agrega su costo de instalación)
                    </label>
                    <span style={{ fontSize: 12, color: MUTED }}>Para un hueco de nevera, lavadora, microondas o extractor usa los frentes «Hueco para…»: el módulo sigue siendo un mueble, con su despiece.</span>
                  </Section>
                )}
              </>
            )}
          </div>

          {/* ---------- views ---------- */}
          <div style={{ overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16, background: 'var(--color-bg)' }}>
            <figure style={{ margin: 0 }}>
              <div style={{ height: 300, background: 'var(--sp-canvas)', padding: 12, position: 'relative' }}>
                <Svg drawing={frontThumb(inst, PREVIEW_MATS, PREVIEW_BY_CODE)} title="Vista frontal" />
              </div>
              <figcaption style={{ fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 4 }}>
                Frente · {d.defW} × {d.fixedH} × {d.fixedD} cm{plinth ? ' (más el zócalo del proyecto)' : ''}
              </figcaption>
            </figure>
            <SideTop d={d} plinth={plinth} />
            {!cover && (
              <Section title="Frentes" icon="door-closed">
                <FrontsEditor w={d.defW} h={d.fixedH} type={type} fr={d.fr} onChange={(fr) => set({ fr })} />
              </Section>
            )}
          </div>

          {/* ---------- despiece ---------- */}
          <div style={{ overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, borderLeft: '1px solid var(--color-divider)' }}>
            <h6 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="list" size={15} />
              Despiece
            </h6>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="tag tag-neutral">{pieces.reduce((a, p) => a + p.cant, 0)} piezas</span>
              <span className="tag tag-neutral">{area.toFixed(2).replace('.', ',')} m² de tablero</span>
              {hinges > 0 && <span className="tag tag-neutral">{hinges} bisagras</span>}
              {counts.drawers > 0 && <span className="tag tag-neutral">{counts.drawers} pares de correderas</span>}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: MUTED }}>
                  <th style={{ padding: '4px 4px 4px 0' }}>Pieza</th>
                  <th style={{ padding: 4, textAlign: 'right' }}>Cant.</th>
                  <th style={{ padding: 4, textAlign: 'right' }}>Largo × ancho (mm)</th>
                  <th style={{ padding: '4px 0 4px 4px', textAlign: 'right' }}>Esp.</th>
                </tr>
              </thead>
              <tbody>
                {pieces.map((p) => (
                  <tr key={p.ref} style={{ borderTop: '1px solid var(--color-divider)' }}>
                    <td style={{ padding: '5px 4px 5px 0' }}>
                      {p.pieza}
                      <div style={{ color: MUTED }}>{p.slot === 'frentes' ? 'Frentes' : p.slot === 'trasera' ? 'Trasera' : 'Cuerpo'}</div>
                    </td>
                    <td style={{ padding: 4, textAlign: 'right', fontWeight: 700 }}>{p.cant}</td>
                    <td style={{ padding: 4, textAlign: 'right' }}>
                      {p.L} × {p.A}
                    </td>
                    <td style={{ padding: '5px 0 5px 4px', textAlign: 'right' }}>{p.esp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <span style={{ fontSize: 12, color: MUTED }}>Con tableros de 18 mm y juntas de 4 mm. En cada proyecto se usan sus materiales, espesores y separación entre puertas.</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderTop: '2px solid var(--color-divider)', flexWrap: 'wrap' }}>
          <span role={errs.length ? 'alert' : undefined} style={{ flex: '1 1 260px', fontSize: 13, color: errs.length ? 'var(--color-accent-700)' : MUTED }}>
            {errs.length ? errs.join(' ') : 'Se guarda en la biblioteca y aparece en la pestaña Módulos del editor, en su categoría.'}
          </span>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            <Icon name="check" size={15} />
            {busy ? 'Guardando…' : 'Guardar módulo'}
          </button>
        </div>
      </div>
    </div>
  );
}
