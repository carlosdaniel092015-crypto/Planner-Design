// Fronts of a library module (doors, drawers, open shelves, oven gap) with a live front view. Rows are shown top
// to bottom; the recipe stores them bottom to top like the catalogue.
import type { FrontSegment, ModuleInstance } from '@core';
import { useEffect, useState } from 'react';
import { frontThumb } from '../editor/engine';
import { Icon, MUTED, Svg } from '../ui';

type Row = { t: FrontSegment['t']; n: number; cm: number };
const KINDS: [FrontSegment['t'], string][] = [
  ['door', 'Puerta'],
  ['drawer', 'Gaveta'],
  ['open', 'Abierto (repisas)'],
  ['oven', 'Hueco de horno'],
];
const PREVIEW_COLORS = { frentes: 'PREVIEW-F', cuerpo: 'PREVIEW-C', encimera: 'PREVIEW-E', jaladeras: 'PREVIEW-J' };
const PREVIEW_BY_CODE = { 'PREVIEW-F': { color: '#c49a6c' }, 'PREVIEW-C': { color: '#eeebe6' }, 'PREVIEW-E': { color: '#e9e7e2' }, 'PREVIEW-J': { color: '#2a2928' } };

const toRows = (fr: FrontSegment[], h: number): Row[] => [...fr].reverse().map((f) => ({ t: f.t, n: f.n ?? 1, cm: Math.max(1, Math.round(f.f * h)) }));
/** Rows (top first, heights in cm) → recipe (bottom first, fractions adding up to exactly 1). */
export function rowsToFronts(rows: Row[]): FrontSegment[] {
  const total = rows.reduce((a, r) => a + Math.max(1, r.cm), 0);
  const out = [...rows].reverse().map((r) => ({ t: r.t, f: Math.round((Math.max(1, r.cm) / total) * 1000) / 1000, ...(r.t === 'door' ? { n: r.n } : {}) }) as FrontSegment);
  if (out.length) out[out.length - 1]!.f = Math.round((1 - out.slice(0, -1).reduce((a, x) => a + x.f, 0)) * 1000) / 1000;
  return out;
}

/** Keeps the fronts at the module height: what a changed row gains or loses comes from the tallest other row. */
function fit(rows: Row[], h: number, keep: number): Row[] {
  const diff = rows.reduce((a, r) => a + r.cm, 0) - h;
  const others = rows.map((r, i) => ({ r, i })).filter((x) => x.i !== keep);
  if (!diff || !others.length) return rows;
  const big = others.reduce((a, b) => (b.r.cm > a.r.cm ? b : a));
  return rows.map((r, i) => (i === big.i ? { ...r, cm: Math.max(5, r.cm - diff) } : r));
}

export function FrontsEditor({ w, h, type, fr, onChange, disabled }: { w: number; h: number; type: ModuleInstance['type']; fr: FrontSegment[]; onChange: (fr: FrontSegment[]) => void; disabled?: boolean }) {
  const [rows, setRows] = useState<Row[]>(() => toRows(fr, h));
  // A new recipe from outside (another module, or saved and reloaded).
  // biome-ignore lint/correctness/useExhaustiveDependencies: compare by value
  useEffect(() => setRows(toRows(fr, h)), [JSON.stringify(fr), h]);
  const commit = (next: Row[]) => {
    setRows(next);
    onChange(rowsToFronts(next));
  };
  const set = (i: number, patch: Partial<Row>) => {
    const next = rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
    commit(patch.cm == null ? next : fit(next, h, i));
  };
  const move = (i: number, d: -1 | 1) => {
    const next = [...rows];
    [next[i], next[i + d]] = [next[i + d]!, next[i]!];
    commit(next);
  };
  const add = (t: FrontSegment['t']) => {
    const free = h - rows.reduce((a, r) => a + r.cm, 0);
    const cm = free >= 10 ? free : t === 'drawer' ? 20 : Math.round(h / (rows.length + 1));
    const next = [...rows, { t, n: t === 'door' ? (w > 60 ? 2 : 1) : 1, cm }];
    commit(fit(next, h, next.length - 1));
  };
  const preview = { id: 0, code: 'PREVIEW', name: '', cat: '', type, wall: 'A', pos: 0, w, h, d: 60, fr: rowsToFronts(rows), rw: [w, w] } as unknown as ModuleInstance;
  const sum = rows.reduce((a, r) => a + r.cm, 0);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0,1fr)', gap: 12, alignItems: 'start' }}>
      <div style={{ width: 96, height: 120, background: 'var(--sp-canvas)', padding: 4 }}>
        <Svg drawing={frontThumb(preview, PREVIEW_COLORS as never, PREVIEW_BY_CODE)} title="Vista del frente" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.length === 0 && <span style={{ fontSize: 12, color: MUTED }}>Sin frentes: caja abierta.</span>}
        {rows.map((r, i) => (
          <div key={`${i}-${r.t}`} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="input" aria-label={`Frente ${i + 1}`} value={r.t} disabled={disabled} onChange={(e) => set(i, { t: e.target.value as Row['t'] })} style={{ width: 150 }}>
              {KINDS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            {r.t === 'door' && (
              <select className="input" aria-label={`Puertas del frente ${i + 1}`} value={r.n} disabled={disabled} onChange={(e) => set(i, { n: Number(e.target.value) })} style={{ width: 110 }}>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? '1 puerta' : `${n} puertas`}
                  </option>
                ))}
              </select>
            )}
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                type="number"
                min={1}
                max={400}
                aria-label={`Alto del frente ${i + 1}`}
                defaultValue={r.cm}
                key={r.cm}
                disabled={disabled}
                onBlur={(e) => {
                  const cm = Math.max(1, Math.min(400, Math.round(Number(e.target.value) || r.cm)));
                  if (cm !== r.cm) set(i, { cm });
                }}
                style={{ width: 86, paddingRight: 30 }}
              />
              <span style={{ position: 'absolute', right: 8, top: 9, fontSize: 12, opacity: 0.6 }}>cm</span>
            </div>
            <button type="button" className="btn btn-icon" aria-label="Subir frente" disabled={disabled || i === 0} onClick={() => move(i, -1)} style={{ width: 32, height: 32 }}>
              <Icon name="arrow-up" size={14} />
            </button>
            <button type="button" className="btn btn-icon" aria-label="Bajar frente" disabled={disabled || i === rows.length - 1} onClick={() => move(i, 1)} style={{ width: 32, height: 32 }}>
              <Icon name="arrow-down" size={14} />
            </button>
            <button type="button" className="btn btn-icon" aria-label="Quitar frente" disabled={disabled} onClick={() => commit(fit(rows.filter((_, j) => j !== i), h, -1))} style={{ width: 32, height: 32 }}>
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
        {!disabled && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
            <button type="button" className="btn btn-secondary" onClick={() => add('door')} style={{ fontSize: 12, height: 30 }}>
              <Icon name="plus" size={13} />
              Puerta
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => add('drawer')} style={{ fontSize: 12, height: 30 }}>
              <Icon name="plus" size={13} />
              Gaveta
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => add('open')} style={{ fontSize: 12, height: 30 }}>
              <Icon name="plus" size={13} />
              Abierto
            </button>
          </div>
        )}
        {rows.length > 0 && (
          <span style={{ fontSize: 12, color: MUTED }}>
            De arriba hacia abajo. {sum === h ? `Ocupan los ${h} cm de alto.` : `Suman ${sum} cm; se reparten en los ${h} cm del módulo en esa proporción.`}
          </span>
        )}
      </div>
    </div>
  );
}
