import { BOARD, type CutGroup } from '../core';

/**
 * DXF (R12, millimetres) with every piece of the cut list drawn as a closed rectangle,
 * one layer per material/thickness, grouped in rows no wider than a board, with a label per piece.
 */
export function cutlistDxf(groups: CutGroup[], title: string): string {
  const out: string[] = [];
  const push = (...pairs: (string | number)[]) => out.push(...pairs.map(String));
  const layerName = (g: CutGroup) =>
    `${g.mat}_${g.esp}MM`
      .normalize('NFKD')
      .replace(/[^\w-]+/g, '_')
      .toUpperCase()
      .slice(0, 60);

  push(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC');
  push(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, groups.length + 1);
  push(0, 'LAYER', 2, 'ROTULOS', 70, 0, 62, 7, 6, 'CONTINUOUS');
  groups.forEach((g, i) => {
    push(0, 'LAYER', 2, layerName(g), 70, 0, 62, (i % 6) + 1, 6, 'CONTINUOUS');
  });
  push(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');

  const text = (x: number, y: number, h: number, s: string, layer = 'ROTULOS') => push(0, 'TEXT', 8, layer, 10, x.toFixed(1), 20, y.toFixed(1), 30, 0, 40, h, 1, s.replace(/[\r\n]+/g, ' '));
  const rect = (x: number, y: number, w: number, h: number, layer: string) => {
    const pts: [number, number][] = [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ];
    push(0, 'POLYLINE', 8, layer, 66, 1, 70, 1, 10, 0, 20, 0, 30, 0);
    for (const [px, py] of pts) push(0, 'VERTEX', 8, layer, 10, px.toFixed(1), 20, py.toFixed(1), 30, 0);
    push(0, 'SEQEND', 8, layer);
  };

  const GAP = 20;
  let y = 0;
  text(0, y + 60, 40, title);
  y -= 40;
  for (const g of groups) {
    const layer = layerName(g);
    text(0, y, 30, `${g.mat} · ${g.esp} mm · ${g.pieces} piezas · ${g.area.toFixed(2)} m2 · ${g.boards} tablero(s) de ${BOARD.L}x${BOARD.A}`, layer);
    y -= 50;
    let x = 0;
    let rowH = 0;
    const rows = [...g.rows].sort((a, b) => b.L * b.A - a.L * a.A);
    for (const r of rows)
      for (let i = 0; i < r.cant; i++) {
        if (x > 0 && x + r.L > BOARD.L) {
          x = 0;
          y -= rowH + GAP;
          rowH = 0;
        }
        rect(x, y - r.A, r.L, r.A, layer);
        const h = Math.max(8, Math.min(30, r.A / 6));
        text(x + 10, y - h - 10, h, `${r.pieza} ${r.L}x${r.A}`);
        text(x + 10, y - 2 * h - 20, h * 0.8, `M${r.mods.join(',M')} · veta ${r.veta} · cantos ${r.cantos}`);
        x += r.L + GAP;
        rowH = Math.max(rowH, r.A);
      }
    y -= rowH + GAP * 4;
  }
  push(0, 'ENDSEC', 0, 'EOF');
  return `${out.join('\r\n')}\r\n`;
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'proyecto';
