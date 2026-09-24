// Shared UI pieces that mirror the prototype markup (Modernist design system classes).
import type { Currency, Drawing, DrawItem } from '@core';
import { convert } from '@core';
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export const MUTED = 'color-mix(in srgb, var(--color-text) 62%, transparent)';

export const Icon = ({ name, size = 16, style }: { name: string; size?: number; style?: CSSProperties }) => <i className={`icon-${name}`} style={{ fontSize: size, ...style }} aria-hidden />;

/** Renders a core draw list — same mapping as the prototype's svg() helper. */
export function Svg({ drawing, onPick, style, title = 'Dibujo del proyecto' }: { drawing: Drawing | null; onPick?: (id: number | null) => void; style?: CSSProperties; title?: string }) {
  if (!drawing) return null;
  const pick = (it: DrawItem) => (onPick && it.mid ? () => onPick(it.mid!) : undefined);
  return (
    <svg
      viewBox={drawing.vb.map((v) => +(+v).toFixed(1)).join(' ')}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', ...style }}
      onClick={onPick ? (e) => e.target === e.currentTarget && onPick(null) : undefined}
      role="img"
    >
      <title>{title}</title>
      {drawing.items.map((p, i) => {
        const oc = pick(p);
        if (p.t === 'text')
          return (
            <text
              key={i}
              x={p.x}
              y={p.y}
              fontSize={p.fs || 9}
              fill={p.fill || '#201e1d'}
              textAnchor={(p.anchor as 'start') || 'middle'}
              dominantBaseline="central"
              fontWeight={p.fw || 600}
              fontFamily="Archivo, system-ui, sans-serif"
              transform={p.rot ? `rotate(${p.rot} ${p.x} ${p.y})` : undefined}
              style={{ pointerEvents: 'none', ...(p.halo ? { paintOrder: 'stroke', stroke: p.halo, strokeWidth: 3, strokeLinejoin: 'round' } : {}) }}
            >
              {p.s}
            </text>
          );
        if (p.t === 'c')
          return <circle key={i} data-mid={p.mid} cx={p.cx} cy={p.cy} r={p.r} fill={p.fill || 'none'} stroke={p.stroke || 'none'} strokeWidth={p.sw || 0} onClick={oc} style={oc ? { cursor: 'pointer' } : { pointerEvents: 'none' }} />;
        const filled = p.fill && p.fill !== 'none';
        return (
          <path
            key={i}
            data-mid={p.mid}
            d={p.d}
            fill={p.fill || 'none'}
            stroke={p.stroke || 'none'}
            strokeWidth={p.sw || 0}
            strokeDasharray={p.dash}
            strokeLinejoin="round"
            onClick={oc}
            style={oc ? { cursor: 'pointer' } : filled ? undefined : { pointerEvents: 'none' }}
          />
        );
      })}
    </svg>
  );
}

/** Prototype money format: US$6,826 / RD$409,536 (no decimals). */
export function fmtMoney(amount: number, currency: Currency) {
  return (currency === 'USD' ? 'US$' : 'RD$') + Math.round(amount).toLocaleString('en-US');
}
export const fromUsd = (usd: number, cur: Currency, rate: number) => convert(usd, 'USD', cur, rate);
export const toUsd = (v: number, cur: Currency, rate: number) => convert(v, cur, 'USD', rate);

export const STATUS: Record<string, { label: string; tag: string }> = {
  borrador: { label: 'Borrador', tag: 'tag tag-neutral' },
  diseno: { label: 'En diseño', tag: 'tag tag-outline' },
  enviado: { label: 'Enviado', tag: 'tag tag-accent-2' },
  cambios_solicitados: { label: 'Cambios solicitados', tag: 'tag tag-accent' },
  aprobado: { label: 'Aprobado', tag: 'tag tag-accent' },
};

export function relativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'Hace un momento';
  if (diff < 3600) return `Hace ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.round(diff / 3600)} h`;
  if (diff < 172800) return 'Ayer';
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function Brand() {
  return (
    <Link to="/" title="Inicio" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--color-text)', flex: 'none' }}>
      <span style={{ width: 30, height: 30, background: 'var(--color-accent)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 16 }}>S</span>
      <span className="brand-name" style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
        Stephanny Planner
      </span>
    </Link>
  );
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

/** Toast at the bottom center, like the prototype's flash(). */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2800);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? (
    <div role="status" style={{ position: 'fixed', left: '50%', bottom: 64, transform: 'translateX(-50%)', background: 'var(--color-text)', color: 'var(--color-bg)', padding: '12px 18px', fontSize: 14, display: 'flex', alignItems: 'center', gap: 10, boxShadow: 'var(--shadow-lg)', zIndex: 80, maxWidth: 520 }}>
      <Icon name="circle-check" size={17} style={{ color: 'var(--color-accent-400)' }} />
      {msg}
    </div>
  ) : null;
  return { flash: setMsg, toast: node };
}

export function Dialog({ title, children, onClose, actions, width = 440 }: { title: string; children: ReactNode; onClose: () => void; actions?: ReactNode; width?: number }) {
  return (
    <div className="dialog-backdrop" style={{ zIndex: 70, position: 'fixed' }} onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ width: `min(${width}px, 100%)` }} role="dialog" aria-modal="true" aria-label={title}>
        <div style={{ display: 'flex', alignItems: 'start', gap: 12 }}>
          <div className="dialog-title" style={{ flex: 1 }}>
            {title}
          </div>
          <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Cerrar">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {actions && <div className="dialog-actions">{actions}</div>}
      </div>
    </div>
  );
}
