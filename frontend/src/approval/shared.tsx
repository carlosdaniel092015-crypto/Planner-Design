// Pieces shared by the approval screen and the client's public page.
import type { Drawing } from '@core';
import { useEffect, useRef, useState } from 'react';
import { type SnapOptions, snapshot } from '../editor/engine';
import { Icon, Svg } from '../ui';

/** Photo-real render of a scene; shows the vector drawing while it renders or when WebGL is missing. */
export function Photo({ cfg, opts, fallback, title }: { cfg: unknown; opts: SnapOptions; fallback: Drawing | null; title: string }) {
  const [shot, setShot] = useState<{ key: string; url: string | null } | null>(null);
  const key = JSON.stringify([cfg, opts]);
  useEffect(() => {
    let live = true;
    snapshot(cfg, opts).then((url) => live && setShot({ key, url }));
    return () => {
      live = false;
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: key captures cfg + opts
  }, [key]);
  const done = shot?.key === key;
  if (done && shot.url) return <img src={shot.url} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />;
  return (
    <div data-pending={done ? undefined : ''} style={{ width: '100%', height: '100%' }}>
      <Svg drawing={fallback} title={title} />
    </div>
  );
}

/** Handwritten signature pad; reports a PNG data URL (or null when empty). */
export function SignaturePad({ onChange }: { onChange: (png: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  // A ref, not state: pointerup can fire before React re-renders after the first stroke.
  const inked = useRef(false);
  const [has, setHas] = useState(false);
  const pos = (e: React.PointerEvent) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return [((e.clientX - r.left) * c.width) / r.width, ((e.clientY - r.top) * c.height) / r.height] as const;
  };
  const clear = () => {
    const c = ref.current;
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    inked.current = false;
    setHas(false);
    onChange(null);
  };
  return (
    <div className="field">
      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Firma</span>
        <button type="button" className="btn btn-ghost" onClick={clear} style={{ fontSize: 12, padding: '0 4px' }} disabled={!has}>
          <Icon name="eraser" size={13} />
          Borrar
        </button>
      </label>
      <canvas
        ref={ref}
        width={940}
        height={260}
        aria-label="Área de firma: dibuja tu firma con el dedo o el ratón"
        onPointerDown={(e) => {
          const c = ref.current!;
          drawing.current = true;
          c.setPointerCapture?.(e.pointerId);
          const ctx = c.getContext('2d')!;
          const [x, y] = pos(e);
          ctx.lineWidth = 4.4;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.strokeStyle = '#201e1d';
          ctx.beginPath();
          ctx.moveTo(x, y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = ref.current!.getContext('2d')!;
          const [x, y] = pos(e);
          ctx.lineTo(x, y);
          ctx.stroke();
          inked.current = true;
          if (!has) setHas(true);
        }}
        onPointerUp={() => {
          if (!drawing.current) return;
          drawing.current = false;
          if (inked.current) onChange(ref.current!.toDataURL('image/png'));
        }}
        onPointerLeave={() => {
          if (!drawing.current) return;
          drawing.current = false;
          if (inked.current) onChange(ref.current!.toDataURL('image/png'));
        }}
        style={{ width: '100%', height: 130, background: '#fff', border: '1px solid var(--color-divider)', touchAction: 'none', cursor: 'crosshair', display: 'block' }}
      />
    </div>
  );
}

/** Rasterises every `[data-pdf-page]` inside `root` into an A4 landscape PDF and downloads it. */
export async function exportPdf(root: HTMLElement, fileName: string, onProgress: (pct: number, step: string) => void) {
  onProgress(5, 'Cargando generador de PDF…');
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
  const pages = [...root.querySelectorAll<HTMLElement>('[data-pdf-page]')];
  if (!pages.length) throw new Error('No hay páginas para exportar.');
  // Give pending 3D photos a moment to arrive.
  const t0 = Date.now();
  while (Date.now() - t0 < 12_000 && root.querySelector('[data-pdf-page] [data-pending]')) await new Promise((r) => setTimeout(r, 300));
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  for (let i = 0; i < pages.length; i++) {
    onProgress(Math.round(10 + (85 * i) / pages.length), `Página ${i + 1} de ${pages.length}…`);
    const el = pages[i]!;
    const canvas = await html2canvas(el, {
      scale: Math.max(3, 1400 / el.offsetWidth),
      backgroundColor: '#ffffff',
      logging: false,
      onclone: (d) => {
        for (const p of d.querySelectorAll<HTMLElement>('[data-pdf-page]')) p.style.boxShadow = 'none';
      },
    });
    if (i) doc.addPage();
    doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 297, 210);
  }
  onProgress(100, 'Descargando…');
  const name = `${fileName.replace(/[\\/:*?"<>|]+/g, '-') || 'proyecto'}.pdf`;
  doc.save(name);
  return name;
}

/** Triggers a browser download of a same-origin API file (session cookie travels along). */
export async function downloadApi(path: string, fallbackName: string) {
  const res = await fetch(`/api/v1${path}`, { credentials: 'include' });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? 'No se pudo descargar el archivo.');
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await res.blob());
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return name;
}
