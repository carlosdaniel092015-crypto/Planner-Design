// Cut optimisation: every board of each material with its pieces laid out (from @core optimizeCut), the saw
// settings, and the PDF / CSV exports.
import type { MaterialDefinition, NestGroup, NestOptions } from '@core';
import { Icon } from '../ui';

const SOFT = 'color-mix(in srgb,var(--color-text) 62%,transparent)';
const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Light version of a colour for the pieces (keeps the labels readable). */
export function tint(hex: string | undefined, k = 0.55) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return '#e9e2d6';
  const n = Number.parseInt(m[1]!, 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * k));
  return `rgb(${c.join(',')})`;
}

export function SheetSvg({ g, i, color }: { g: NestGroup; i: number; color?: string }) {
  const [SL, SA] = g.sheet;
  const s = g.sheets[i]!;
  const fs = Math.max(26, Math.min(SL, SA) / 38);
  return (
    <svg viewBox={`-4 -4 ${SL + 8} ${SA + 8}`} width="100%" role="img" aria-label={`Tablero ${i + 1} de ${g.sheets.length} · ${g.mat}`} style={{ display: 'block', background: '#fff' }}>
      <title>{`Tablero ${i + 1} · ${g.mat} ${g.esp} mm`}</title>
      <rect x={0} y={0} width={SL} height={SA} fill="#f4f1ec" stroke="#2a2928" strokeWidth={4} />
      {s.placements.map((p, k) => {
        const big = p.w > fs * 4 && p.h > fs * 2.2;
        return (
          <g key={`${k}${p.pieza}`}>
            <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={tint(color)} stroke="#2a2928" strokeWidth={2.5} />
            {big && (
              <>
                <text x={p.x + p.w / 2} y={p.y + p.h / 2 - fs * 0.15} fontSize={fs} textAnchor="middle" fontFamily="Archivo, sans-serif" fontWeight={700} fill="#2a2928">
                  {p.pieza.length > 22 ? `${p.pieza.slice(0, 21)}…` : p.pieza}
                </text>
                <text x={p.x + p.w / 2} y={p.y + p.h / 2 + fs * 1.05} fontSize={fs * 0.85} textAnchor="middle" fontFamily="Archivo, sans-serif" fill="#2a2928">
                  {p.L} × {p.A}
                  {p.rot ? ' ↻' : ''}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function NestingSection(props: { groups: NestGroup[]; mats: Record<string, MaterialDefinition>; opts: Required<NestOptions>; onOpts: (o: Required<NestOptions>) => void; onPdf: () => void; onCsv: () => void }) {
  const { groups, mats, opts } = props;
  const boards = groups.reduce((a, g) => a + g.sheets.length, 0);
  const num = (k: keyof NestOptions, label: string, max: number) => (
    <label className="field" style={{ width: 130 }}>
      <span style={{ fontSize: 12, color: SOFT }}>{label}</span>
      <div style={{ position: 'relative' }}>
        <input className="input" type="number" min={0} max={max} step={0.5} value={opts[k]} aria-label={label} onChange={(e) => props.onOpts({ ...opts, [k]: Math.max(0, Math.min(max, Number(e.target.value) || 0)) })} style={{ width: '100%', paddingRight: 34 }} />
        <span style={{ position: 'absolute', right: 10, top: 9, fontSize: 12, opacity: 0.6 }}>mm</span>
      </div>
    </label>
  );
  return (
    <section aria-label="Optimización de corte" style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'end', gap: 16, paddingBottom: 14, borderBottom: '2px solid var(--color-divider)', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h2 style={{ margin: 0, fontSize: 28 }}>Optimización de corte</h2>
          <div style={{ fontSize: 14, color: SOFT }}>
            {boards} {boards === 1 ? 'tablero' : 'tableros'} · piezas acomodadas en la plancha de cada tablero, con la veta a lo largo en maderas
          </div>
        </div>
        {num('kerf', 'Ancho de sierra', 10)}
        {num('trim', 'Refilado de orilla', 50)}
        <button type="button" className="btn btn-secondary" onClick={props.onCsv}>
          <Icon name="file-spreadsheet" size={15} />
          CSV
        </button>
        <button type="button" className="btn btn-primary" onClick={props.onPdf}>
          <Icon name="file-text" size={15} />
          Exportar PDF
        </button>
      </div>
      {groups.map((g) => (
        <div key={`${g.matCode}${g.esp}`} style={{ margin: '18px 0 26px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', alignItems: 'baseline', paddingBottom: 8 }}>
            <h4 style={{ margin: 0 }}>
              {g.mat} · {g.esp} mm
            </h4>
            <span style={{ fontSize: 13, color: SOFT }}>
              Plancha {g.sheet[0]} × {g.sheet[1]} mm{g.supplier ? ` · ${g.supplier}` : ''} · {g.sheets.length} {g.sheets.length === 1 ? 'tablero' : 'tableros'} · {g.pieces} piezas · aprovechamiento {pct(g.usage)}
            </span>
          </div>
          {g.oversize.length > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'start', padding: '8px 10px', background: 'var(--color-accent-100)', color: 'var(--color-accent-800)', fontSize: 13, marginBottom: 8 }}>
              <Icon name="triangle-alert" size={15} style={{ flex: 'none', marginTop: 1 }} />
              <span>
                No caben en la plancha: {g.oversize.map((o) => `${o.cant} × ${o.pieza} (${o.L} × ${o.A})`).join(', ')}. Usa una plancha más grande o divide la pieza.
              </span>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
            {g.sheets.map((s, i) => (
              <figure key={i} style={{ margin: 0, background: 'var(--color-surface)', padding: 8 }}>
                <SheetSvg g={g} i={i} color={mats[g.matCode]?.color} />
                <figcaption style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: SOFT, paddingTop: 6 }}>
                  <span>
                    Tablero {i + 1} de {g.sheets.length}
                  </span>
                  <span>
                    {s.placements.length} piezas · {pct(s.usage)}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/** A4 landscape PDF, vector: one page per board with its pieces, dimensions and a legend. */
export async function exportNestingPdf(groups: NestGroup[], mats: Record<string, MaterialDefinition>, title: string, opts: Required<NestOptions>) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const total = groups.reduce((a, g) => a + g.sheets.length, 0);
  let page = 0;
  const rgb = (css: string) => (/rgb\((\d+),(\d+),(\d+)\)/.exec(css)?.slice(1).map(Number) ?? [233, 226, 214]) as [number, number, number];
  if (!total) {
    doc.setFontSize(16);
    doc.text('Optimización de corte: no hay piezas que cortar.', 14, 20);
  }
  for (const g of groups) {
    const [SL, SA] = g.sheet;
    g.sheets.forEach((s, i) => {
      if (page++) doc.addPage();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(`${title} · Optimización de corte`, 12, 13);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`${g.mat} · ${g.esp} mm · plancha ${SL} × ${SA} mm${g.supplier ? ` · ${g.supplier}` : ''}`, 12, 19.5);
      doc.text(`Tablero ${i + 1} de ${g.sheets.length} · ${s.placements.length} piezas · aprovechamiento ${pct(s.usage)} · sierra ${opts.kerf} mm · refilado ${opts.trim} mm · página ${page} de ${total}`, 12, 25);
      // Board scaled into the page (x along its length).
      const k = Math.min(273 / SL, 170 / SA);
      const ox = 12;
      const oy = 30;
      doc.setDrawColor(42, 41, 40);
      doc.setLineWidth(0.5);
      doc.setFillColor(244, 241, 236);
      doc.rect(ox, oy, SL * k, SA * k, 'FD');
      const [r, gg, b] = rgb(tint(mats[g.matCode]?.color));
      doc.setLineWidth(0.25);
      s.placements.forEach((p, n) => {
        doc.setFillColor(r, gg, b);
        doc.rect(ox + p.x * k, oy + p.y * k, p.w * k, p.h * k, 'FD');
        const w = p.w * k;
        const h = p.h * k;
        doc.setTextColor(42, 41, 40);
        if (w > 16 && h > 7) {
          doc.setFontSize(Math.min(8, Math.max(5, h / 3)));
          doc.text(`${n + 1}. ${p.pieza}`, ox + p.x * k + w / 2, oy + p.y * k + h / 2 - 0.6, { align: 'center', maxWidth: w - 2 });
          doc.text(`${p.L} × ${p.A}${p.rot ? ' (girada)' : ''}`, ox + p.x * k + w / 2, oy + p.y * k + h / 2 + 3, { align: 'center', maxWidth: w - 2 });
        } else if (w > 4 && h > 3) {
          doc.setFontSize(5);
          doc.text(String(n + 1), ox + p.x * k + w / 2, oy + p.y * k + h / 2 + 1, { align: 'center' });
        }
      });
      // Legend: number, piece, size, modules.
      doc.setFontSize(7);
      const legend = s.placements.map((p, n) => `${n + 1}. ${p.pieza} ${p.L}×${p.A}${p.mods.length ? ` · M${p.mods.join(', M')}` : ''}`);
      const top = oy + SA * k + 5;
      const perCol = Math.max(1, Math.floor((205 - top) / 3.2));
      legend.forEach((l, n) => {
        doc.text(l, 12 + Math.floor(n / perCol) * 70, top + (n % perCol) * 3.2, { maxWidth: 68 });
      });
    });
  }
  const over = groups.flatMap((g) => g.oversize.map((o) => `${g.mat} ${g.esp} mm: ${o.cant} × ${o.pieza} (${o.L} × ${o.A})`));
  if (over.length) {
    doc.addPage();
    doc.setFontSize(13);
    doc.text('Piezas que no caben en su plancha', 12, 15);
    doc.setFontSize(10);
    over.forEach((l, n) => {
      doc.text(l, 12, 24 + n * 6);
    });
  }
  const name = `optimizacion-de-corte-${title.replace(/[\\/:*?"<>|]+/g, '-') || 'proyecto'}.pdf`;
  doc.save(name);
  return name;
}

/** Saves a text file (the CSV) from the browser. */
export function downloadText(text: string, name: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Layout from the server (the export needs the plan with exports; the error message comes from the API). */
export async function fetchNesting(projectId: string, opts: Required<NestOptions>): Promise<NestGroup[]> {
  const res = await fetch(`/api/v1/projects/${projectId}/optimizacion?kerf=${opts.kerf}&trim=${opts.trim}`, { credentials: 'include' });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? 'No se pudo calcular la optimización de corte.');
  return body.groups as NestGroup[];
}
