// Ctrl+P in Diseño: a print-ready sheet (3D photo, plan, elevations, module list and total) outside the app layout,
// then the browser's print dialog. The app itself is hidden while printing.
import { elev, type Estimate, iso, type MaterialDefinition, plan, type ProjectData } from '@core';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Currency } from '../api';
import { fmtMoney, Svg } from '../ui';
import { sceneCfg, snapshot } from './engine';

export function PrintSheet(props: { data: ProjectData; name: string; orgName: string; materials: Record<string, MaterialDefinition>; estimate: Estimate; currency: Currency; onDone: () => void }) {
  const { data, materials, estimate, currency } = props;
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const walls = (['A', 'B', 'C', 'D'] as const).filter((w) => w === 'A' || w === 'B' || data.mods.some((m) => m.wall === w));

  useEffect(() => {
    let live = true;
    const cam = data.cams?.persp;
    snapshot(sceneCfg(data, { sel: null, cotas: false, altos: true, dark: false }), cam ? { w: 1400, h: 820, cam } : { w: 1400, h: 820 }).then((u) => live && setPhoto(u));
    return () => {
      live = false;
    };
  }, [data]);

  useEffect(() => {
    if (photo === undefined) return;
    const done = () => props.onDone();
    window.addEventListener('afterprint', done, { once: true });
    // A short delay so the photo and drawings are laid out before the dialog opens (a timer, not rAF: rAF pauses in
    // background tabs and the print would never start).
    const t = setTimeout(() => window.print(), 150);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', done);
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: print once per photo
  }, [photo]);

  const lineOf = new Map(estimate.lines.map((l) => [l.id, l.total]));
  const today = new Date().toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });
  const head = (title: string) => (
    <div className="ps-head">
      <span>
        {props.orgName} · {props.name}
      </span>
      <span>
        {title} · {today}
      </span>
    </div>
  );

  return createPortal(
    <div id="print-sheet" aria-hidden="true">
      <section className="ps-page">
        {head('Vista en perspectiva')}
        <div className="ps-art">{photo ? <img src={photo} alt="" /> : <Svg drawing={iso(data, materials, { cotas: false, altos: true })} />}</div>
      </section>
      <section className="ps-page">
        {head('Planta acotada')}
        <div className="ps-art">
          <Svg drawing={plan(data, { cotas: true })} />
        </div>
      </section>
      {walls.map((w) => (
        <section key={w} className="ps-page">
          {head(`Alzado muro ${w}`)}
          <div className="ps-art">
            <Svg drawing={elev(data, w, materials, { cotas: true })} />
          </div>
        </section>
      ))}
      <section className="ps-page">
        {head('Módulos')}
        <table className="ps-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Código</th>
              <th>Módulo</th>
              <th>Muro</th>
              <th>Ancho × alto × fondo (mm)</th>
              <th style={{ textAlign: 'right' }}>Importe</th>
            </tr>
          </thead>
          <tbody>
            {data.mods.map((m) => (
              <tr key={m.id}>
                <td>{m.id}</td>
                <td>{m.code}</td>
                <td>{m.name}</td>
                <td>{m.wall === 'F' ? 'Isla' : m.wall}</td>
                <td>
                  {m.w * 10} × {m.h * 10} × {m.d * 10}
                </td>
                <td style={{ textAlign: 'right' }}>{lineOf.has(m.id) ? fmtMoney(lineOf.get(m.id)!, currency) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>Total estimado{estimate.tax ? ` (con ${estimate.taxName})` : ''}</td>
              <td style={{ textAlign: 'right' }}>{fmtMoney(estimate.total, currency)}</td>
            </tr>
          </tfoot>
        </table>
      </section>
      <style>{`
        @media screen { #print-sheet { position: fixed; left: -100000px; top: 0; width: 277mm; } }
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body > *:not(#print-sheet) { display: none !important; }
          #print-sheet { position: static; color: #201e1d; font-family: Archivo, system-ui, sans-serif; }
        }
        #print-sheet .ps-page { break-after: page; height: 188mm; display: flex; flex-direction: column; gap: 4mm; }
        #print-sheet .ps-page:last-child { break-after: auto; height: auto; }
        #print-sheet .ps-head { display: flex; justify-content: space-between; font-size: 10pt; font-weight: 700; border-bottom: 1.5pt solid #201e1d; padding-bottom: 2mm; }
        #print-sheet .ps-art { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
        #print-sheet .ps-art img, #print-sheet .ps-art svg { max-width: 100%; max-height: 100%; object-fit: contain; }
        #print-sheet .ps-table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
        #print-sheet .ps-table th { text-align: left; border-bottom: 1.2pt solid #201e1d; padding: 1.5mm 2mm; }
        #print-sheet .ps-table td { border-bottom: .5pt solid #bab6b6; padding: 1.3mm 2mm; }
        #print-sheet .ps-table tfoot td { font-weight: 800; border-top: 1.2pt solid #201e1d; border-bottom: 0; }
      `}</style>
    </div>,
    document.body,
  );
}
