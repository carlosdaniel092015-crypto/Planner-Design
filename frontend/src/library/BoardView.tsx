// 3D view of a module's boards for the module designer, like Polyboard / SketchUp: drag to orbit, wheel to zoom,
// click a board to select its panel. Plain SVG (painter's algorithm), so it works without WebGL and offline.
import type { Board, BoardRole } from '@core';
import { useRef, useState } from 'react';
import { Icon, MUTED } from '../ui';

type V3 = [number, number, number];
export type ViewPreset = 'iso' | 'frente' | 'lado' | 'arriba';
const PRESETS: Record<ViewPreset, [number, number]> = { iso: [-35, 24], frente: [0, 0], lado: [-90, 0], arriba: [0, 90] };
const LABELS: [ViewPreset, string][] = [
  ['iso', 'Isométrica'],
  ['frente', 'Frente'],
  ['lado', 'Lateral'],
  ['arriba', 'Planta'],
];

/**
 * Boards as faces seen from azimuth `az` and elevation `el` (degrees). World: x = width, y = height, z = depth with
 * the front towards the viewer at az 0.
 */
function project(boards: Board[], W: number, H: number, D: number, az: number, el: number) {
  const a = (az * Math.PI) / 180;
  const e = (el * Math.PI) / 180;
  const P = (x: number, y: number, z: number) => {
    const px = x - W / 2;
    const py = y - H / 2;
    const pz = z - D / 2;
    const u = px * Math.cos(a) + pz * Math.sin(a);
    const w = -px * Math.sin(a) + pz * Math.cos(a);
    return { sx: u, sy: -(py * Math.cos(e) - w * Math.sin(e)), depth: w * Math.cos(e) + py * Math.sin(e) };
  };
  const faces: { pts: { sx: number; sy: number }[]; depth: number; i: number; shade: number }[] = [];
  boards.forEach((b, i) => {
    // Board box: x0..x1 width, y0..y1 depth from the back, z0..z1 height → world (x, height, depth).
    const [x0, x1, y0, y1, z0, z1] = b.box;
    const c = (x: number, y: number, z: number): V3 => [x, z, y];
    const quads: [V3, V3, V3, V3, number][] = [
      [c(x0, y1, z0), c(x1, y1, z0), c(x1, y1, z1), c(x0, y1, z1), 0], // front
      [c(x0, y0, z0), c(x1, y0, z0), c(x1, y0, z1), c(x0, y0, z1), 0.1], // back
      [c(x0, y0, z1), c(x1, y0, z1), c(x1, y1, z1), c(x0, y1, z1), -0.06], // top
      [c(x0, y0, z0), c(x1, y0, z0), c(x1, y1, z0), c(x0, y1, z0), 0.14], // bottom
      [c(x0, y0, z0), c(x0, y1, z0), c(x0, y1, z1), c(x0, y0, z1), 0.08], // left
      [c(x1, y0, z0), c(x1, y1, z0), c(x1, y1, z1), c(x1, y0, z1), 0.08], // right
    ];
    for (const [p, q, r, s, shade] of quads) {
      const pts = [p, q, r, s].map((v) => P(v[0], v[1], v[2]));
      faces.push({ pts, depth: pts.reduce((acc, x) => acc + x.depth, 0) / 4, i, shade });
    }
  });
  faces.sort((f, g) => f.depth - g.depth);
  return { faces, P };
}

const shadeOf = (hex: string, k: number) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).map((v) => Math.max(0, Math.min(255, Math.round(v * (1 - k)))));
  return `rgb(${c.join(',')})`;
};

export function BoardView({ boards, W, H, D, selected, onSelect, height = 420, preset: initial = 'iso', compact }: { boards: Board[]; W: number; H: number; D: number; selected?: BoardRole | null; onSelect?: (r: BoardRole | null) => void; height?: number; preset?: ViewPreset; compact?: boolean }) {
  const [[az, el], setView] = useState<[number, number]>(PRESETS[initial]);
  const [zoom, setZoom] = useState(1);
  const [wire, setWire] = useState(false);
  const [cotas, setCotas] = useState(true);
  const drag = useRef<{ x: number; y: number; az: number; el: number; moved: boolean } | null>(null);
  const { faces, P } = project(boards, W, H, D, az, el);
  const all = faces.flatMap((f) => f.pts);
  const minX = Math.min(...all.map((p) => p.sx));
  const maxX = Math.max(...all.map((p) => p.sx));
  const minY = Math.min(...all.map((p) => p.sy));
  const maxY = Math.max(...all.map((p) => p.sy));
  const size = Math.max(maxX - minX, maxY - minY, 1);
  const pad = size * 0.16;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const half = (size / 2 + pad) / zoom;
  const vb = `${cx - half} ${cy - half} ${half * 2} ${half * 2}`;
  const sw = (half * 2) / 600;
  const fs = (half * 2) / 32;
  // Measures along the module's outer edges (mm), like Polyboard's cotas.
  const line = (key: string, a: V3, b: V3, text: string) => {
    const p = P(a[0], a[1], a[2]);
    const q = P(b[0], b[1], b[2]);
    if (Math.hypot(q.sx - p.sx, q.sy - p.sy) < size * 0.08) return null;
    return (
      <g key={key}>
        <line x1={p.sx} y1={p.sy} x2={q.sx} y2={q.sy} stroke="var(--color-accent)" strokeWidth={sw * 1.4} />
        <text x={(p.sx + q.sx) / 2} y={(p.sy + q.sy) / 2 - fs * 0.35} fontSize={fs} textAnchor="middle" fill="var(--color-accent-700)" stroke="var(--sp-canvas)" strokeWidth={fs * 0.2} paintOrder="stroke" fontWeight={700}>
          {text}
        </text>
      </g>
    );
  };
  const off = size * 0.06;
  const front = Math.max(...boards.map((b) => b.box[3]), D);
  return (
    <div style={{ position: 'relative', background: 'var(--sp-canvas)', height, userSelect: 'none' }}>
      <svg
        viewBox={vb}
        role="img"
        aria-label="Vista 3D del módulo: arrastra para girar, rueda para acercar, clic en una pieza para elegirla"
        style={{ width: '100%', height: '100%', cursor: drag.current ? 'grabbing' : 'grab', touchAction: 'none', display: 'block' }}
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, az, el, moved: false };
        }}
        onPointerMove={(e) => {
          const g = drag.current;
          if (!g) return;
          const dx = e.clientX - g.x;
          const dy = e.clientY - g.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) g.moved = true;
          if (g.moved) setView([g.az - dx * 0.5, Math.max(-10, Math.min(90, g.el + dy * 0.4))]);
        }}
        onPointerUp={(e) => {
          const g = drag.current;
          drag.current = null;
          if (g && !g.moved && onSelect) {
            const hit = document.elementsFromPoint(e.clientX, e.clientY).find((n) => (n as HTMLElement).dataset?.role);
            onSelect(((hit as HTMLElement | undefined)?.dataset.role as BoardRole | undefined) ?? null);
          }
        }}
        onWheel={(e) => setZoom((z) => Math.max(0.5, Math.min(4, z * (e.deltaY > 0 ? 0.9 : 1.1))))}
      >
        {faces.map((f, k) => {
          const b = boards[f.i]!;
          const on = selected != null && b.role === selected;
          const base = b.slot === 'frentes' ? '#c49a6c' : b.slot === 'trasera' ? '#d9d4cb' : '#f1eee8';
          return (
            <path
              key={k}
              data-role={b.role}
              d={`M${f.pts.map((p) => `${p.sx},${p.sy}`).join('L')}Z`}
              fill={wire ? 'transparent' : on ? 'rgba(236,48,19,.35)' : shadeOf(base, f.shade)}
              fillOpacity={wire ? 1 : b.slot === 'frentes' ? 0.82 : 0.94}
              stroke={on ? 'var(--color-accent)' : '#3b3936'}
              strokeWidth={on ? sw * 2.2 : sw}
              strokeLinejoin="round"
            >
              <title>{b.n}</title>
            </path>
          );
        })}
        {cotas && (
          <>
            {line('w', [0, -off, front], [W, -off, front], `${Math.round(W)} mm`)}
            {line('h', [-off, 0, front], [-off, H, front], `${Math.round(H)} mm`)}
            {line('d', [W + off, -off, 0], [W + off, -off, front], `${Math.round(D)} mm`)}
          </>
        )}
      </svg>
      {!compact && <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {LABELS.map(([k, l]) => (
          <button key={k} type="button" className="btn btn-secondary" onClick={() => {
              setView(PRESETS[k]);
              setZoom(1);
            }} style={{ height: 28, padding: '0 8px', fontSize: 12, background: 'var(--color-bg)' }}>
            {l}
          </button>
        ))}
        <button type="button" className="btn btn-secondary" aria-pressed={wire} onClick={() => setWire(!wire)} title="Ver solo las aristas" style={{ height: 28, padding: '0 8px', fontSize: 12, background: wire ? 'var(--color-text)' : 'var(--color-bg)', color: wire ? 'var(--color-bg)' : undefined }}>
          Alambre
        </button>
        <button type="button" className="btn btn-secondary" aria-pressed={cotas} onClick={() => setCotas(!cotas)} style={{ height: 28, padding: '0 8px', fontSize: 12, background: cotas ? 'var(--color-text)' : 'var(--color-bg)', color: cotas ? 'var(--color-bg)' : undefined }}>
          Cotas
        </button>
      </div>}
      {!compact && (
        <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: MUTED, pointerEvents: 'none' }}>
          <Icon name="rotate-3d" size={14} />
          Arrastra para girar · rueda para acercar · clic en una pieza para editarla
        </div>
      )}
    </div>
  );
}
