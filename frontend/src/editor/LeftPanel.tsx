import { type ModuleDefinition, type ModuleInstance, type ProjectData, templateOf } from '@core';
import { useMemo } from 'react';
import type { Catalog, CatalogMaterial } from '../api';
import { Icon, MUTED, Svg } from '../ui';
import { frontThumb } from './engine';

export type LeftTab = 'modulos' | 'materiales';

export function LeftPanel(props: {
  tab: LeftTab;
  setTab: (t: LeftTab) => void;
  onClose: () => void;
  data: ProjectData;
  catalog: Catalog;
  materialsByCode: Record<string, CatalogMaterial>;
  q: string;
  setQ: (q: string) => void;
  cat: string;
  setCat: (c: string) => void;
  onAdd: (def: ModuleDefinition) => void;
  replaceMode: boolean;
  onCancelReplace: () => void;
  sel: ModuleInstance | null;
  applyTo: 'todo' | 'modulo';
  setApplyTo: (a: 'todo' | 'modulo') => void;
  onMaterial: (group: 'cuerpo' | 'frentes' | 'encimera' | 'jaladeras', code: string) => void;
  readOnly: boolean;
}) {
  const { data, catalog, materialsByCode } = props;
  const defs = useMemo(() => {
    const wanted = data.ptype === 'cocina' ? 'cocina' : 'closet';
    return Object.values(catalog.context.modules)
      .filter((d) => d.active)
      .sort((a, b) => Number(b.projectType === wanted) - Number(a.projectType === wanted) || a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));
  }, [catalog, data.ptype]);
  const cats = useMemo(() => ['Todos', ...new Set(defs.map((d) => d.cat))], [defs]);
  const q = props.q.trim().toLowerCase();
  const lib = defs.filter((d) => (props.cat === 'Todos' || d.cat === props.cat) && (!q || `${d.name} ${d.code}`.toLowerCase().includes(q)));

  const tabs: { k: LeftTab; label: string; icon: string }[] = [
    { k: 'modulos', label: 'Módulos', icon: 'layout-grid' },
    { k: 'materiales', label: 'Materiales', icon: 'palette' },
  ];

  return (
    <aside style={{ width: 300, flex: 'none', borderRight: '2px solid var(--color-divider)', display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--color-bg)' }}>
      <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '2px solid var(--color-divider)' }}>
        {tabs.map((t) => (
          <button type="button"
            key={t.k}
            onClick={() => props.setTab(t.k)}
            title={t.label}
            className="tab-btn"
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 4px', background: 'none', border: 0, borderBottom: `3px solid ${props.tab === t.k ? 'var(--color-accent)' : 'transparent'}`, marginBottom: -2, font: 'inherit', fontSize: 13, fontWeight: props.tab === t.k ? 800 : 600, color: 'var(--color-text)', cursor: 'pointer' }}
          >
            <Icon name={t.icon} size={15} />
            {t.label}
          </button>
        ))}
        <button type="button" className="btn btn-icon" onClick={props.onClose} title="Contraer panel" aria-label="Contraer panel" style={{ height: 'auto', width: 40 }}>
          <Icon name="panel-left-close" size={17} />
        </button>
      </div>

      {props.tab === 'modulos' && (
        <>
          <div style={{ padding: '12px 14px 8px', display: 'flex', flexDirection: 'column', gap: 10, borderBottom: '1px solid var(--color-divider)' }}>
            {props.replaceMode && props.sel && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--color-accent-100)', color: 'var(--color-accent-800)', fontSize: 13 }}>
                <Icon name="replace" size={15} />
                <span style={{ flex: 1 }}>Elige el módulo que reemplazará al {props.sel.id}</span>
                <button type="button" className="btn btn-ghost" onClick={props.onCancelReplace} style={{ fontSize: 12 }}>
                  Cancelar
                </button>
              </div>
            )}
            <div style={{ position: 'relative' }}>
              <Icon name="search" size={15} style={{ position: 'absolute', left: 10, top: 10, opacity: 0.55 }} />
              <input className="input" placeholder="Buscar módulo o código" value={props.q} onChange={(e) => props.setQ(e.target.value)} style={{ paddingLeft: 32, width: '100%' }} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {cats.map((c) => {
                const on = props.cat === c;
                return (
                  <button type="button" key={c} onClick={() => props.setCat(c)} style={{ font: 'inherit', fontSize: 12, padding: '5px 9px', cursor: 'pointer', background: on ? 'var(--color-text)' : 'transparent', color: on ? 'var(--color-bg)' : 'var(--color-text)', border: `1px solid ${on ? 'var(--color-text)' : 'var(--color-divider)'}` }}>
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignContent: 'start' }}>
            {lib.map((d) => {
              const tpl = { ...templateOf(d), id: 0, wall: 'A', pos: 0 } as unknown as ModuleInstance;
              const tall = d.h > 150;
              return (
                <button type="button"
                  key={d.code}
                  className="lib-card"
                  onClick={() => props.onAdd(d)}
                  disabled={props.readOnly}
                  title={props.readOnly ? 'Solo lectura' : 'Haz clic para agregar'}
                  style={{ display: 'flex', flexDirection: 'column', background: 'var(--color-surface)', cursor: props.readOnly ? 'default' : 'pointer', border: '2px solid transparent', padding: 0, font: 'inherit', color: 'var(--color-text)', textAlign: 'left' }}
                >
                  <div style={{ height: 88, width: '100%', padding: tall ? '4px 30px' : '8px 14px', background: 'var(--sp-canvas)', position: 'relative', overflow: 'hidden' }}>
                    <Svg drawing={frontThumb(tpl, data.mats, materialsByCode, data.prefs.apertura)} />
                  </div>
                  <div style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.2 }}>{d.name}</span>
                    <span style={{ fontSize: 11, color: MUTED }}>
                      {d.code} · {d.rw ? (d.rw[0] === d.rw[1] ? `${d.rw[0]} cm` : `${d.rw[0]}–${d.rw[1]} cm`) : `${d.w} cm`}
                    </span>
                  </div>
                </button>
              );
            })}
            {lib.length === 0 && <p style={{ gridColumn: 'span 2', fontSize: 13, color: MUTED }}>Sin resultados para esa búsqueda.</p>}
          </div>
        </>
      )}

      {props.tab === 'materiales' && (
        <div style={{ flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div style={{ fontSize: 12, marginBottom: 6, color: 'color-mix(in srgb,var(--color-text) 70%,transparent)' }}>Aplicar a</div>
            <div className="seg" style={{ display: 'flex' }}>
              <label className="seg-opt" style={{ flex: 1 }}>
                <input type="radio" name="apply" checked={props.applyTo === 'todo'} onChange={() => props.setApplyTo('todo')} />
                Todo el proyecto
              </label>
              <label className="seg-opt" style={{ flex: 1, opacity: props.sel ? 1 : 0.45 }}>
                <input type="radio" name="apply" checked={props.applyTo === 'modulo'} onChange={() => props.setApplyTo('modulo')} disabled={!props.sel} />
                Módulo {props.sel?.id ?? ''}
              </label>
            </div>
          </div>
          {catalog.groups.map((g) => {
            const items = catalog.materials.filter((m) => m.uses.includes(g.k));
            const perModule = props.applyTo === 'modulo' && props.sel && (g.k === 'cuerpo' || g.k === 'frentes');
            const currentCode = perModule ? (g.k === 'cuerpo' ? props.sel!.cue : props.sel!.fre) || data.mats[g.k] : data.mats[g.k];
            return (
              <div key={g.k}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 6, borderBottom: '2px solid var(--color-divider)', marginBottom: 10 }}>
                  <h6 style={{ margin: 0 }}>{g.label}</h6>
                  <span style={{ fontSize: 12, color: MUTED }}>{materialsByCode[currentCode]?.name ?? currentCode}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
                  {items.map((m) => {
                    const on = m.code === currentCode;
                    const thumb = m.maps.baseColor?.thumb;
                    return (
                      <button type="button"
                        key={m.code}
                        onClick={() => props.onMaterial(g.k, m.code)}
                        disabled={props.readOnly}
                        title={`${m.name} · ${m.type}`}
                        style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 0, background: 'none', border: 0, cursor: props.readOnly ? 'default' : 'pointer', textAlign: 'left', font: 'inherit', color: 'var(--color-text)' }}
                      >
                        <span style={{ height: 52, width: '100%', background: thumb ? `url(${thumb}) center/cover` : m.color, outline: on ? '2px solid var(--color-accent)' : 'none', outlineOffset: 2, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.12)' }} />
                        <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.2 }}>{m.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
