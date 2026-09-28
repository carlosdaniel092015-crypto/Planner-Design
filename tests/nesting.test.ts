import { describe, expect, it } from 'vitest';
import { corte, type CutGroup, DEFAULT_KITCHEN, DEFAULT_MATERIALS, type MaterialDefinition, nestingCsv, optimizeCut, projectDataSchema } from '../src/core';

const by = <T extends { code: string }>(a: T[]) => Object.fromEntries(a.map((x) => [x.code, x]));
const group = (rows: CutGroup['rows'], sheet: [number, number] = [2440, 1830]): CutGroup => ({ mat: 'Melamina Blanco', matCode: 'MB', esp: 18, rows, pieces: rows.reduce((a, r) => a + r.cant, 0), area: 0, boards: 0, sheet, supplier: 'Tableros RD' });
const row = (pieza: string, L: number, A: number, cant: number, veta = 'Vertical') => ({ pieza, L, A, cant, veta, cantos: '1L', mods: [1] });
const plain = { MB: { code: 'MB', name: 'Blanco', type: 'Melamina', color: '#fff', kind: 'solido', groups: ['cuerpo'], wood: false, priceM2: 0, priceCurrency: 'USD', version: 1, active: true } as MaterialDefinition };
const wood = { MB: { ...plain.MB, wood: true } };

function assertValid(g: ReturnType<typeof optimizeCut>[number], kerf = 4, trim = 10) {
  const [SL, SA] = g.sheet;
  for (const s of g.sheets) {
    for (const p of s.placements) {
      expect(p.x).toBeGreaterThanOrEqual(trim - 0.01);
      expect(p.y).toBeGreaterThanOrEqual(trim - 0.01);
      expect(p.x + p.w).toBeLessThanOrEqual(SL - trim + 0.01);
      expect(p.y + p.h).toBeLessThanOrEqual(SA - trim + 0.01);
      expect([p.w, p.h].sort()).toEqual([p.L, p.A].sort());
    }
    // No two pieces closer than the saw blade.
    for (let i = 0; i < s.placements.length; i++)
      for (let j = i + 1; j < s.placements.length; j++) {
        const a = s.placements[i]!;
        const b = s.placements[j]!;
        const apart = a.x + a.w + kerf <= b.x + 0.01 || b.x + b.w + kerf <= a.x + 0.01 || a.y + a.h + kerf <= b.y + 0.01 || b.y + b.h + kerf <= a.y + 0.01;
        expect(apart, `${a.pieza} y ${b.pieza} se enciman`).toBe(true);
      }
  }
}

describe('optimización de corte', () => {
  it('acomoda todas las piezas sin encimarse, dentro del refilado y con el ancho de sierra', () => {
    const [g] = optimizeCut([group([row('Lateral', 760, 580, 10), row('Base', 564, 580, 5), row('Entrepaño', 562, 560, 5), row('Puerta', 756, 296, 8)])], plain);
    expect(g!.pieces).toBe(28);
    expect(g!.oversize).toEqual([]);
    assertValid(g!);
    // Close to the area needed: 28 pieces ≈ 9.6 m² on boards of 4.47 m² → 3 boards.
    expect(g!.sheets.length).toBe(3);
    expect(g!.usage).toBeGreaterThan(0.65);
  });

  it('con veta en tablero de madera no gira las piezas; sin veta sí puede', () => {
    const rows = [row('Costado', 1800, 300, 6)];
    const [w] = optimizeCut([group(rows)], wood);
    expect(w!.sheets.flatMap((s) => s.placements).every((p) => !p.rot)).toBe(true);
    assertValid(w!);
    const [n] = optimizeCut([group([row('Costado', 1800, 300, 6, '—')], [1830, 2440])], wood);
    // On a board 1830 long, a 1800 piece fits both ways; the "—" piece may turn.
    assertValid(n!);
    expect(n!.pieces).toBe(6);
  });

  it('una pieza más grande que la plancha se lista aparte', () => {
    const [g] = optimizeCut([group([row('Encimera', 3000, 600, 2), row('Lateral', 760, 580, 1)])], plain);
    expect(g!.oversize).toEqual([{ pieza: 'Encimera', L: 3000, A: 600, cant: 2 }]);
    expect(g!.pieces).toBe(1);
  });

  it('usa el tamaño de plancha del tablero y exporta CSV con posición de cada pieza', () => {
    const [g] = optimizeCut([group([row('Lateral', 760, 580, 4)], [1220, 2440])], plain, { kerf: 3, trim: 5 });
    expect(g!.sheet).toEqual([1220, 2440]);
    assertValid(g!, 3, 5);
    const csv = nestingCsv([g!]);
    expect(csv.split('\n')[0]).toContain('"Tablero n.º","Pieza","Módulos","Largo (mm)","Ancho (mm)","X (mm)","Y (mm)","Girada"');
    expect(csv.split('\n')).toHaveLength(5);
    expect(csv).toContain('"Tableros RD"');
  });

  it('funciona con la cocina de ejemplo completa', () => {
    const p = projectDataSchema.parse(DEFAULT_KITCHEN);
    const mats = by(DEFAULT_MATERIALS);
    const groups = corte(p, mats);
    const out = optimizeCut(groups, mats);
    expect(out.reduce((a, g) => a + g.pieces + g.oversize.reduce((b, o) => b + o.cant, 0), 0)).toBe(groups.reduce((a, g) => a + g.pieces, 0));
    for (const g of out) assertValid(g);
  });
});

describe('galería: vistas agregadas', () => {
  const cam = { az: 0.8, polar: 1.1, dist: 6, target: [1.5, 0.8, 1.2] as [number, number, number] };
  it('el proyecto guarda hasta 12 vistas con nombre y cámara válida', () => {
    const p = projectDataSchema.parse({ ...DEFAULT_KITCHEN, cams: { views: [{ id: 'a1', name: ' Desde la entrada ', cam }] } });
    expect(p.cams?.views).toEqual([{ id: 'a1', name: 'Desde la entrada', cam }]);
    expect(projectDataSchema.safeParse({ ...DEFAULT_KITCHEN, cams: { views: [{ id: 'a1', name: '', cam }] } }).success).toBe(false);
    expect(projectDataSchema.safeParse({ ...DEFAULT_KITCHEN, cams: { views: [{ id: 'a1', name: 'x', cam: { ...cam, dist: Number.NaN } }] } }).success).toBe(false);
    expect(projectDataSchema.safeParse({ ...DEFAULT_KITCHEN, cams: { views: Array.from({ length: 13 }, (_, i) => ({ id: `v${i}`, name: `V${i}`, cam })) } }).success).toBe(false);
  });
});
