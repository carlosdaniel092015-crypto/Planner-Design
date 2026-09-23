import { useEffect, useRef, useState } from 'react';
import { loadRenderer, type Viewer } from './engine';

/** Hosts the prototype's three.js viewer. Falls back to `fallback` if WebGL/three cannot load. */
export function Viewer3D({ cfg, onSelect, onViewer, fallback }: { cfg: unknown; onSelect: (id: number | null) => void; onViewer: (v: Viewer | null) => void; fallback: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const cfgRef = useRef(cfg);
  const selectRef = useRef(onSelect);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [pct, setPct] = useState(12);
  cfgRef.current = cfg;
  selectRef.current = onSelect;

  useEffect(() => {
    let dead = false;
    const iv = setInterval(() => setPct((p) => Math.min(92, p + 9)), 180);
    loadRenderer()
      .then((R) => R.createViewer(host.current!, { onSelect: (id) => selectRef.current(id), onReady: () => !dead && setState('ready') }))
      .then((v) => {
        if (dead) return v.dispose();
        viewer.current = v;
        onViewer(v);
        return v.update(cfgRef.current);
      })
      .catch((e) => {
        console.warn('Visor 3D no disponible', e);
        if (!dead) setState('failed');
      })
      .finally(() => clearInterval(iv));
    return () => {
      dead = true;
      clearInterval(iv);
      viewer.current?.dispose();
      viewer.current = null;
      onViewer(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    viewer.current?.update(cfg).catch((e) => console.warn('update 3D', e));
  }, [cfg]);

  return (
    <>
      <div ref={host} style={{ position: 'absolute', inset: 0, display: state === 'failed' ? 'none' : 'block' }} />
      {state === 'failed' && <div style={{ position: 'absolute', inset: '56px 64px 24px 24px' }}>{fallback}</div>}
      {state === 'loading' && (
        <div style={{ position: 'absolute', inset: 0, background: 'var(--sp-canvas)', display: 'grid', placeItems: 'center', zIndex: 6 }}>
          <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, height: 56 }}>
              {[0, 0.15, 0.3, 0.45].map((d) => (
                <span key={d} style={{ background: 'var(--color-neutral-300)', animation: `sppulse 1.2s ${d}s infinite` }} />
              ))}
            </div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Cargando escena 3D</div>
            <div style={{ height: 4, background: 'var(--color-neutral-300)' }}>
              <div style={{ height: 4, background: 'var(--color-accent)', width: `${pct}%`, transition: 'width .2s' }} />
            </div>
            <div style={{ fontSize: 12, color: 'color-mix(in srgb,var(--color-text) 62%,transparent)' }}>Texturas de madera y sombras · {pct}%</div>
          </div>
        </div>
      )}
    </>
  );
}
