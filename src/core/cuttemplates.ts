// Cut list templates ("Lista de corte adaptable"): each company's optimiser or order form wants its own columns, column
// names, units and CSV dialect. A template describes that; cutTemplateCsv() fills it from the consolidated cut list.
import { z } from 'zod';
import type { CutGroup } from './cutlist';

/** Fields a column can show (key → default header). */
export const CUT_FIELDS = {
  n: 'N.º',
  material: 'Material',
  espesor: 'Espesor (mm)',
  pieza: 'Pieza',
  modulos: 'Módulos',
  cantidad: 'Cantidad',
  largo: 'Largo',
  ancho: 'Ancho',
  veta: 'Veta',
  cantos: 'Cantos',
  cantoL1: 'Canto largo 1',
  cantoL2: 'Canto largo 2',
  cantoA1: 'Canto ancho 1',
  cantoA2: 'Canto ancho 2',
  proyecto: 'Proyecto',
  cliente: 'Cliente',
  fijo: 'Texto fijo',
  vacio: '(columna vacía)',
} as const;
export type CutField = keyof typeof CUT_FIELDS;
const FIELD_KEYS = Object.keys(CUT_FIELDS) as [CutField, ...CutField[]];

export const cutTemplateSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/, 'El identificador usa minúsculas, números y guiones.')
    .max(40),
  name: z.string().trim().min(1).max(60),
  /** Columns in order: field, header shown in the file and, for "fijo", its value. */
  cols: z
    .array(z.object({ k: z.enum(FIELD_KEYS), label: z.string().max(40), v: z.string().max(60).optional() }))
    .min(1)
    .max(30),
  /** Unit of length and width (thickness always in mm). */
  unit: z.enum(['mm', 'cm', 'm', 'in']).default('mm'),
  decimal: z.enum(['.', ',']).default('.'),
  sep: z.enum([',', ';', 'tab']).default(','),
  header: z.boolean().default(true),
  /** One row per piece (quantity 1) instead of one row per size. */
  perPiece: z.boolean().default(false),
  quote: z.boolean().default(true),
  /** UTF-8 BOM so Excel opens accents correctly. */
  bom: z.boolean().default(true),
  /** Grain column: text (Vertical/Horizontal/—), Sí/No, or 1/0 (1 = respect the grain). */
  grain: z.enum(['texto', 'si-no', '0-1']).default('texto'),
  /** Per-side edge columns: 1/0, Sí/No, or the edge name. */
  edge: z.enum(['0-1', 'si-no', 'texto']).default('0-1'),
});
export type CutTemplate = z.infer<typeof cutTemplateSchema>;

const col = (k: CutField, label?: string) => ({ k, label: label ?? CUT_FIELDS[k] });
const base = { unit: 'mm', decimal: '.', sep: ',', header: true, perPiece: false, quote: true, bom: true, grain: 'texto', edge: '0-1' } as const;

/** Ready-made templates (read-only; duplicate one to adapt it). */
export const PRESET_CUT_TEMPLATES: CutTemplate[] = [
  {
    ...base,
    id: 'estandar',
    name: 'Estándar Planner',
    cols: [col('material'), col('espesor'), col('pieza'), col('modulos'), col('cantidad'), col('largo', 'Largo (mm)'), col('ancho', 'Ancho (mm)'), col('veta'), col('cantos')],
  },
  {
    ...base,
    id: 'optimizador',
    name: 'Optimizador (largo, ancho, cantidad)',
    cols: [col('largo', 'Largo'), col('ancho', 'Ancho'), col('cantidad', 'Cantidad'), col('material', 'Material'), col('pieza', 'Etiqueta'), col('veta', 'Veta')],
    quote: false,
    bom: false,
    grain: '0-1',
  },
  {
    ...base,
    id: 'cantos-por-lado',
    name: 'Con cantos por lado',
    cols: [col('n'), col('pieza'), col('material'), col('espesor'), col('largo', 'Largo (mm)'), col('ancho', 'Ancho (mm)'), col('cantidad'), col('cantoL1', 'L1'), col('cantoL2', 'L2'), col('cantoA1', 'A1'), col('cantoA2', 'A2'), col('veta')],
  },
  {
    ...base,
    id: 'excel-cm',
    name: 'Excel en centímetros',
    cols: [col('material'), col('pieza'), col('cantidad'), col('largo', 'Largo (cm)'), col('ancho', 'Ancho (cm)'), col('espesor'), col('veta'), col('cantos')],
    unit: 'cm',
    decimal: ',',
    sep: ';',
  },
];
export const isPresetCutTemplate = (id: string) => PRESET_CUT_TEMPLATES.some((t) => t.id === id);

const DIV: Record<CutTemplate['unit'], [number, number]> = { mm: [1, 0], cm: [10, 1], m: [1000, 3], in: [25.4, 2] };

/** Edge sides of a piece from the cut list's "nL" code: L1, L2 (long sides) then A1, A2. */
export function edgeSides(cantos: string): [boolean, boolean, boolean, boolean] {
  const n = Number.parseInt(cantos, 10);
  const k = Number.isFinite(n) ? Math.max(0, Math.min(4, n)) : 0;
  return [k >= 1, k >= 2, k >= 3, k >= 4];
}

/** The cut list as a CSV in the template's shape. */
export function cutTemplateCsv(groups: CutGroup[], tpl: CutTemplate, meta: { proyecto?: string; cliente?: string } = {}): string {
  const sep = tpl.sep === 'tab' ? '\t' : tpl.sep;
  const [div, dec] = DIV[tpl.unit];
  const num = (mm: number) => {
    const v = Number((mm / div).toFixed(dec));
    const s = String(v);
    return tpl.decimal === ',' ? s.replace('.', ',') : s;
  };
  const yes = (on: boolean, style: 'si-no' | '0-1' | 'texto', word: string) => (style === '0-1' ? (on ? '1' : '0') : style === 'si-no' ? (on ? 'Sí' : 'No') : on ? word : '');
  const cell = (v: string | number) => {
    const s = String(v);
    if (!tpl.quote && !s.includes(sep) && !s.includes('"') && !s.includes('\n')) return s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines: string[] = [];
  if (tpl.header) lines.push(tpl.cols.map((c) => cell(c.label)).join(sep));
  let n = 0;
  for (const g of groups)
    for (const r of g.rows) {
      const copies = tpl.perPiece ? r.cant : 1;
      const sides = edgeSides(r.cantos);
      for (let i = 0; i < copies; i++) {
        n++;
        const value = (c: CutTemplate['cols'][number]): string | number => {
          switch (c.k) {
            case 'n':
              return n;
            case 'material':
              return g.mat;
            case 'espesor':
              return g.esp;
            case 'pieza':
              return r.pieza;
            case 'modulos':
              return r.mods.join(' ');
            case 'cantidad':
              return tpl.perPiece ? 1 : r.cant;
            case 'largo':
              return num(r.L);
            case 'ancho':
              return num(r.A);
            case 'veta':
              return tpl.grain === 'texto' ? r.veta : yes(r.veta === 'Vertical' || r.veta === 'Horizontal', tpl.grain, r.veta);
            case 'cantos':
              return r.cantos;
            case 'cantoL1':
            case 'cantoL2':
            case 'cantoA1':
            case 'cantoA2':
              return yes(sides[['cantoL1', 'cantoL2', 'cantoA1', 'cantoA2'].indexOf(c.k)]!, tpl.edge, 'Canto');
            case 'proyecto':
              return meta.proyecto ?? '';
            case 'cliente':
              return meta.cliente ?? '';
            case 'fijo':
              return c.v ?? '';
            default:
              return '';
          }
        };
        lines.push(tpl.cols.map((c) => cell(value(c))).join(sep));
      }
    }
  return `${tpl.bom ? '﻿' : ''}${lines.join('\r\n')}`;
}
