// Materiales tab, below the furniture: gap between fronts, the finish of each wall (paint colour or a board /
// texture of the library) and the panels (planchas) fixed on a wall zone.
import { fromLeft, type ProjectData } from '@core';
import { useEffect, useState } from 'react';
import type { CatalogMaterial } from '../api';
import { Icon, MUTED } from '../ui';

type WallId = 'A' | 'B' | 'C' | 'D';
type Panel = NonNullable<ProjectData['panels']>[number];
const WALLS: WallId[] = ['A', 'B', 'C', 'D'];
const PAINT = '#e8e6e2';

function Cm({ label, value, onCommit, disabled, min = 0, max = 1000 }: { label: string; value: number; onCommit: (v: number) => void; disabled?: boolean; min?: number; max?: number }) {
  const [t, setT] = useState(String(value));
  useEffect(() => setT(String(value)), [value]);
  const done = () => {
    const v = Number(t.replace(',', '.'));
    if (Number.isFinite(v)) onCommit(Math.max(min, Math.min(max, Math.round(v))));
    else setT(String(value));
  };
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: MUTED }}>
      {label}
      <input className="input" inputMode="decimal" aria-label={`${label} (cm)`} value={t} disabled={disabled} onChange={(e) => setT(e.target.value)} onBlur={done} onKeyDown={(e) => e.key === 'Enter' && done()} style={{ width: '100%', padding: '4px 6px', fontSize: 13 }} />
    </label>
  );
}

export function WallsPanel({ data, materials, readOnly, onPatch }: { data: ProjectData; materials: CatalogMaterial[]; readOnly: boolean; onPatch: (patch: Partial<ProjectData>) => void }) {
  const [wall, setWall] = useState<WallId>('A');
  const fin = data.walls?.[wall] ?? {};
  const len = wall === 'A' || wall === 'D' ? data.room.A : data.room.B;
  const panels = data.panels ?? [];
  const setFin = (f: { mat?: string; color?: string }) => onPatch({ walls: { ...data.walls, [wall]: f } });
  const setPanels = (next: Panel[]) => onPatch({ panels: next });
  const updPanel = (p: Panel, patch: Partial<Panel>) => {
    const n = { ...p, ...patch };
    const L = n.wall === 'A' || n.wall === 'D' ? data.room.A : data.room.B;
    n.w = Math.max(1, Math.min(L, n.w));
    n.pos = Math.max(0, Math.min(L - n.w, n.pos));
    n.h = Math.max(1, Math.min(data.room.H, n.h));
    n.z = Math.max(0, Math.min(data.room.H - n.h, n.z));
    setPanels(panels.map((x) => (x.id === p.id ? n : x)));
  };
  const addPanel = () => {
    const w = Math.min(120, len);
    const id = panels.reduce((a, p) => Math.max(a, p.id), 0) + 1;
    // Placed from the left as seen facing the wall.
    setPanels([...panels, { id, wall, pos: fromLeft(wall, 0, w, data.room), w, z: 90, h: Math.min(60, data.room.H - 90), mat: data.mats.frentes }]);
  };
  const junta = data.prefs.junta ?? 4;
  const swatch = (m: CatalogMaterial) => (m.maps.baseColor?.thumb ? `center/cover url("${m.maps.baseColor.thumb}") ${m.color}` : m.color);
  const onWall = panels.filter((p) => p.wall === wall);

  return (
    <>
      <div>
        <div style={{ paddingBottom: 6, borderBottom: '2px solid var(--color-divider)', marginBottom: 10 }}>
          <h6 style={{ margin: 0 }}>Separación entre puertas</h6>
        </div>
        <div className="seg" style={{ display: 'flex' }}>
          {[2, 3, 4, 5].map((v) => (
            <label key={v} className="seg-opt" style={{ flex: 1 }}>
              <input type="radio" name="junta" checked={junta === v} disabled={readOnly} onChange={() => onPatch({ prefs: { ...data.prefs, junta: v } })} />
              {v} mm
            </label>
          ))}
        </div>
        <p style={{ fontSize: 12, margin: '6px 0 0', color: MUTED }}>Despegue entre frentes vecinos; se descuenta del corte de puertas y cajones.</p>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 6, borderBottom: '2px solid var(--color-divider)', marginBottom: 10 }}>
          <h6 style={{ margin: 0 }}>Paredes</h6>
          <div className="seg" role="tablist" aria-label="Muro">
            {WALLS.map((w) => (
              <label key={w} className="seg-opt" style={{ padding: '2px 8px' }}>
                <input type="radio" name="wall-fin" checked={wall === w} onChange={() => setWall(w)} />
                {w}
              </label>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="color" aria-label={`Color del muro ${wall}`} value={fin.color ?? PAINT} disabled={readOnly} onChange={(e) => setFin({ color: e.target.value })} style={{ width: 36, height: 30, padding: 0, border: '1px solid var(--color-divider)' }} />
            Pintura
          </label>
          {(fin.mat || fin.color) && (
            <button type="button" className="btn btn-ghost" disabled={readOnly} onClick={() => setFin({})} style={{ fontSize: 12, height: 28, marginLeft: 'auto' }}>
              Restablecer
            </button>
          )}
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>o una textura de la biblioteca:</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {materials.map((m) => (
            <button
              type="button"
              key={m.code}
              aria-label={`Muro ${wall}: ${m.name}`}
              aria-pressed={fin.mat === m.code}
              title={m.name}
              disabled={readOnly}
              onClick={() => setFin({ mat: m.code })}
              style={{ width: 34, height: 34, padding: 0, border: 0, cursor: 'pointer', background: swatch(m), boxShadow: fin.mat === m.code ? '0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-accent)' : 'inset 0 0 0 1px rgba(0,0,0,.15)' }}
            />
          ))}
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 6, borderBottom: '2px solid var(--color-divider)', marginBottom: 10 }}>
          <h6 style={{ margin: 0 }}>Planchas en el muro {wall}</h6>
          <span style={{ fontSize: 12, color: MUTED }}>{onWall.length}</span>
        </div>
        {onWall.length === 0 && <p style={{ fontSize: 12, color: MUTED, margin: '0 0 8px' }}>Cubre una zona del muro con un tablero (salpicadero, panel decorativo, respaldo de TV…).</p>}
        {onWall.map((p) => (
          <div key={p.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 6, padding: '8px 0', borderBottom: '1px solid var(--color-divider)' }}>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 6, alignItems: 'center' }}>
              <select className="input" aria-label={`Material de la plancha ${p.id}`} value={p.mat} disabled={readOnly} onChange={(e) => updPanel(p, { mat: e.target.value })} style={{ flex: 1, minWidth: 0, fontSize: 13, padding: '4px 6px' }}>
                {!materials.some((m) => m.code === p.mat) && <option value={p.mat}>{p.mat}</option>}
                {materials.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-icon" aria-label={`Quitar plancha ${p.id}`} title="Quitar" disabled={readOnly} onClick={() => setPanels(panels.filter((x) => x.id !== p.id))} style={{ width: 30, height: 30 }}>
                <Icon name="trash-2" size={14} />
              </button>
            </div>
            <Cm label="Desde la izquierda" value={fromLeft(p.wall, p.pos, p.w, data.room)} disabled={readOnly} onCommit={(v) => updPanel(p, { pos: fromLeft(p.wall, v, p.w, data.room) })} />
            <Cm label="Ancho" value={p.w} min={1} disabled={readOnly} onCommit={(v) => updPanel(p, { w: v, pos: p.wall === 'B' || p.wall === 'D' ? p.pos + p.w - v : p.pos })} />
            <Cm label="Desde el piso" value={p.z} disabled={readOnly} onCommit={(v) => updPanel(p, { z: v })} />
            <Cm label="Alto" value={p.h} min={1} disabled={readOnly} onCommit={(v) => updPanel(p, { h: v })} />
          </div>
        ))}
        {!readOnly && (
          <button type="button" className="btn btn-secondary" onClick={addPanel} disabled={panels.length >= 40} style={{ marginTop: 8, width: '100%', justifyContent: 'center', height: 34 }}>
            <Icon name="plus" size={14} />
            Agregar plancha
          </button>
        )}
        <p style={{ fontSize: 12, margin: '6px 0 0', color: MUTED }}>Medidas en cm, mirando el muro de frente. Las planchas salen en el despiece y en la optimización de corte.</p>
      </div>
    </>
  );
}
