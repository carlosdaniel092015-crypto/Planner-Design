import type { Currency, Estimate, ProjectData, ValidationIssue } from '@core';
import { useEffect, useState } from 'react';
import { fmtMoney, Icon, MUTED, toUsd } from '../ui';

const ICON = { ok: ['circle-check', '#2f7d4f'], warn: ['triangle-alert', '#a86a00'], err: ['circle-x', 'var(--color-accent-700)'] } as const;
const ORD = { err: 0, warn: 1, ok: 2 } as const;

function Num({ value, onCommit, label, step = 1, max, style }: { value: number | ''; onCommit: (v: number | null) => void; label: string; step?: number; max?: number; style?: React.CSSProperties }) {
  const [t, setT] = useState(String(value));
  useEffect(() => setT(String(value)), [value]);
  return (
    <input
      className="input"
      type="number"
      min={0}
      max={max}
      step={step}
      aria-label={label}
      value={t}
      onChange={(e) => setT(e.target.value)}
      onBlur={() => onCommit(t.trim() === '' ? null : Number(t))}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      style={style}
    />
  );
}

export function BottomBar(props: {
  issues: ValidationIssue[];
  estimate: Estimate;
  data: ProjectData;
  currency: Currency;
  rate: number;
  readOnly: boolean;
  onPick: (id: number) => void;
  onPriceAdj: (patch: Partial<ProjectData['priceAdj']>) => void;
  onResetPrices: () => void;
  onApproval: () => void;
}) {
  const [valOpen, setValOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const { estimate: e, currency, rate, data } = props;
  const sorted = props.issues.slice().sort((a, b) => ORD[a.st] - ORD[b.st]);
  const count = (st: 'ok' | 'warn' | 'err') => props.issues.filter((i) => i.st === st).length;
  const first = sorted[0];
  const label = currency === 'USD' ? 'US$' : 'RD$';
  const modulesTotal = e.lines.reduce((a, l) => a + l.total, 0);
  const rows = [
    { k: `Módulos (${data.mods.length})`, v: fmtMoney(modulesTotal, currency) },
    { k: `Encimera${e.counter.manual ? ' (manual)' : ''}`, v: fmtMoney(e.counter.total, currency) },
    ...(e.margin ? [{ k: 'Margen', v: fmtMoney(e.margin, currency) }] : []),
    { k: `Instalación (${e.installPct}%)`, v: fmtMoney(e.install, currency) },
    ...(e.discount ? [{ k: `Descuento (${e.discountPct}%)`, v: `−${fmtMoney(e.discount, currency)}` }] : []),
    { k: `${e.taxName} (${Math.round(e.taxRate * 100)}%)${e.pricesIncludeTax || e.manual ? ' incluido' : ''}`, v: fmtMoney(e.tax, currency) },
    { k: 'Total', v: fmtMoney(e.total, currency) },
  ];

  return (
    <div style={{ borderTop: '2px solid var(--color-divider)', background: 'var(--color-bg)', flex: 'none' }}>
      {valOpen && (
        <div style={{ maxHeight: 200, overflow: 'auto', padding: '8px 16px', display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '0 24px', borderBottom: '1px solid var(--color-divider)' }}>
          {sorted.map((v, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid color-mix(in srgb,var(--color-divider) 50%,transparent)', fontSize: 13 }}>
              <Icon name={ICON[v.st][0]} size={17} style={{ color: ICON[v.st][1], flex: 'none' }} />
              <span style={{ flex: 1, minWidth: 0 }}>{v.text}</span>
              {v.id != null && (
                <button type="button" className="btn btn-ghost" onClick={() => props.onPick(v.id!)} style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                  Ver módulo {v.id}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="bb-row" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 16px', minHeight: 56 }}>
        <button type="button"
          onClick={() => setValOpen(!valOpen)}
          aria-expanded={valOpen}
          className="val-btn"
          style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: '1px solid var(--color-divider)', padding: '7px 12px', font: 'inherit', fontSize: 13, color: 'var(--color-text)', cursor: 'pointer' }}
        >
          <strong className="bb-hide-xs">Validación</strong>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name="circle-check" size={15} style={{ color: '#2f7d4f' }} />
            {count('ok')}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name="triangle-alert" size={15} style={{ color: '#a86a00' }} />
            {count('warn')}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name="circle-x" size={15} style={{ color: 'var(--color-accent-700)' }} />
            {count('err')}
          </span>
          <Icon name={valOpen ? 'chevron-down' : 'chevron-up'} size={15} />
        </button>
        <span className="bb-first" style={{ flex: 1, minWidth: 0, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: first ? ICON[first.st][1] : MUTED }}>{first ? first.text : 'Sin módulos en la escena'}</span>
        <div style={{ position: 'relative' }}>
          <button type="button" onClick={() => setPriceOpen(!priceOpen)} title="Editar precio" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 0, padding: '4px 6px', font: 'inherit', color: 'var(--color-text)', cursor: 'pointer' }}>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.15 }}>
              <span style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', whiteSpace: 'nowrap', color: MUTED }}>{e.manual ? 'Precio final' : 'Precio estimado'}</span>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{fmtMoney(e.total, currency)}</span>
            </span>
            <Icon name="pencil" size={15} style={{ opacity: 0.7 }} />
          </button>
          {priceOpen && (
            <>
              <div onClick={() => setPriceOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
              <div style={{ position: 'absolute', right: 0, bottom: 'calc(100% + 10px)', zIndex: 41, width: 320, maxHeight: 'calc(100vh - 90px)', overflow: 'auto', background: 'var(--color-bg)', color: 'var(--color-text)', border: '2px solid var(--color-text)', boxShadow: '0 12px 32px rgba(0,0,0,.18)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Precio del proyecto</div>
                {rows.map((r) => (
                  <div key={r.k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{r.k}</span>
                    <span style={{ fontWeight: 700 }}>{r.v}</span>
                  </div>
                ))}
                {!props.readOnly && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div className="field">
                        <label>Instalación %</label>
                        <Num label="Instalación" step={0.5} max={100} value={data.priceAdj.inst} onCommit={(v) => props.onPriceAdj({ inst: Math.max(0, Math.min(100, v ?? 0)) })} />
                      </div>
                      <div className="field">
                        <label>Descuento %</label>
                        <Num label="Descuento" step={0.5} max={100} value={data.priceAdj.desc} onCommit={(v) => props.onPriceAdj({ desc: Math.max(0, Math.min(100, v ?? 0)) })} />
                      </div>
                    </div>
                    <div className="field">
                      <label>Encimera ({label})</label>
                      <Num label="Encimera" value={Math.round(e.counter.total)} onCommit={(v) => props.onPriceAdj({ counter: v == null ? null : toUsd(v, currency, rate) })} />
                    </div>
                    <div className="field">
                      <label>Precio final ({label})</label>
                      <Num
                        label="Precio final"
                        value={Math.round(e.total)}
                        onCommit={(v) => {
                          if (v == null) return props.onPriceAdj({ final: null });
                          // Same rule as the prototype: typing the computed total back clears the manual price.
                          const calc = data.priceAdj.final != null ? null : e.total;
                          props.onPriceAdj({ final: calc != null && Math.abs(v - calc) < 1 ? null : toUsd(v, currency, rate) });
                        }}
                        style={{ fontWeight: 800, fontSize: 16 }}
                      />
                    </div>
                    <span style={{ fontSize: 12, color: MUTED }}>
                      {e.manual ? 'Precio final fijado a mano; no cambia al editar módulos.' : 'Haz clic en un módulo para editar su precio. El total se recalcula solo.'}
                    </span>
                    <button type="button" className="btn btn-secondary" onClick={props.onResetPrices}>
                      <Icon name="rotate-ccw" size={15} />
                      Volver a precios calculados
                    </button>
                  </>
                )}
                <span style={{ fontSize: 11, color: MUTED }}>Tasa: 1 US$ = RD${rate.toFixed(2)} · precios del catálogo de tu organización.</span>
              </div>
            </>
          )}
        </div>
        <button type="button" className="btn btn-primary" onClick={props.onApproval} style={{ height: 40 }} title="Continuar a aprobación" aria-label="Continuar a aprobación">
          <span className="bb-hide-xs">Continuar a aprobación</span>
          <Icon name="arrow-right" />
        </button>
      </div>
    </div>
  );
}
