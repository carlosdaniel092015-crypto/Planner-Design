// zod schemas for the project JSON (mirrors the prototype's editor state) and module recipes.
import { z } from 'zod';

const frontSegmentSchema = z.object({
  t: z.enum(['door', 'drawer', 'oven', 'open']),
  f: z.number().positive().max(1),
  n: z.number().int().min(1).max(6).optional(),
  rod: z.union([z.number(), z.boolean()]).optional(),
});

const flag = z.union([z.literal(0), z.literal(1), z.boolean()]).optional();

export const moduleSchema = z
  .object({
    id: z.number().int().positive(),
    code: z.string().min(1).max(40),
    name: z.string().min(1).max(120),
    cat: z.string().max(60).default('Mis módulos'),
    wall: z.enum(['A', 'B', 'C', 'D', 'F']),
    pos: z.number().min(0).max(5000).optional(),
    x: z.number().min(-1000).max(5000).optional(),
    y: z.number().min(-1000).max(5000).optional(),
    w: z.number().positive().max(1000),
    h: z.number().positive().max(1000),
    d: z.number().positive().max(1000),
    type: z.enum(['base', 'upper', 'tall', 'fridge', 'hood']),
    fr: z.array(frontSegmentSchema).max(12).default([]),
    rw: z.tuple([z.number().positive(), z.number().positive()]).optional(),
    sink: flag,
    cook: flag,
    appl: flag,
    oven: flag,
    open: z.enum(['der', 'izq']).optional(),
    /** Per-module material overrides (material codes). */
    cue: z.string().max(60).optional(),
    fre: z.string().max(60).optional(),
    /** GLB url (library modules made from a 3D model). */
    glb: z.string().max(2000).optional(),
    /** Library module base price (base currency) and the width it refers to. */
    pBase: z.number().min(0).optional(),
    w0: z.number().positive().optional(),
    /** Manual price override (base currency). */
    pOv: z.number().min(0).optional(),
    libId: z.string().max(80).optional(),
    moduleVersion: z.number().int().positive().optional(),
  })
  .loose()
  .refine((m) => (m.wall === 'F' ? m.x !== undefined && m.y !== undefined : m.pos !== undefined), {
    message: 'Los módulos en muro necesitan "pos"; los de isla (F) necesitan "x" y "y".',
  });

const openingSchema = z
  .object({
    id: z.number().int(),
    t: z.enum(['ventana', 'puerta']),
    wall: z.enum(['A', 'B', 'C', 'D']),
    pos: z.number().min(0),
    w: z.number().positive(),
    h: z.number().positive(),
    z: z.number().min(0).optional(),
  })
  .loose();

const pointSchema = z
  .object({
    id: z.number().int(),
    t: z.enum(['agua', 'desague', 'elec', 'gas', 'campana']),
    wall: z.enum(['A', 'B', 'C', 'D']),
    pos: z.number().min(0),
    z: z.number().min(0).optional(),
  })
  .loose();

export const priceAdjSchema = z.object({
  /** Installation % over the subtotal. */
  inst: z.number().min(0).max(100).default(8),
  /** Discount %. */
  desc: z.number().min(0).max(100).default(0),
  /** Manual final price (base currency, tax included). */
  final: z.number().min(0).nullable().default(null),
  /** Manual countertop price (base currency). */
  counter: z.number().min(0).nullable().default(null),
  /** Tax rate for this project only (0 = sin impuesto); null uses the organisation's rate. */
  taxRate: z.number().min(0).max(1).nullable().default(null),
});

export const projectDataSchema = z
  .object({
    schemaVersion: z.literal(1),
    ptype: z.enum(['cocina', 'closet', 'vestidor']),
    pname: z.string().min(1).max(160),
    layout: z.string().max(40).optional(),
    room: z.object({ A: z.number().min(50).max(2000), B: z.number().min(50).max(2000), H: z.number().min(150).max(600) }),
    ops: z.array(openingSchema).max(40).default([]),
    pts: z.array(pointSchema).max(80).default([]),
    appl: z.record(z.string(), z.unknown()).nullable().optional(),
    prefs: z
      .object({
        estilo: z.string().optional(),
        alacena: z.string().optional(),
        apertura: z.enum(['Jaladera', 'Gola', 'Push']).default('Jaladera'),
        zocalo: z.string().optional(),
        presupuesto: z.number().optional(),
      })
      .loose()
      .default({ apertura: 'Jaladera' }),
    closet: z.record(z.string(), z.unknown()).optional(),
    mods: z.array(moduleSchema).max(400),
    mats: z.object({
      cuerpo: z.string().min(1),
      frentes: z.string().min(1),
      encimera: z.string().min(1),
      jaladeras: z.string().min(1),
    }),
    client: z.object({ nombre: z.string().optional(), tel: z.string().optional(), dir: z.string().optional() }).loose().optional(),
    priceAdj: priceAdjSchema.default({ inst: 8, desc: 0, final: null, counter: null, taxRate: null }),
    /** Hardware labels per module id (display only). */
    herr: z.record(z.string(), z.string()).optional(),
    pdfOpts: z.record(z.string(), z.boolean()).optional(),
  })
  .loose();

/** Recipe stored in module_definitions.recipe: fronts layout + feature flags consumed by parts(). */
export const recipeSchema = z.object({
  fr: z.array(frontSegmentSchema).max(12),
  sink: flag,
  cook: flag,
  appl: flag,
  oven: flag,
}).refine((r) => r.fr.length === 0 || Math.abs(r.fr.reduce((a, s) => a + s.f, 0) - 1) < 0.02, {
  message: 'Las fracciones de los frentes (f) deben sumar 1.',
  path: ['fr'],
});

export type ProjectData = z.infer<typeof projectDataSchema>;
export type ModuleInstance = z.infer<typeof moduleSchema>;
export type Opening = z.infer<typeof openingSchema>;
export type InstallPoint = z.infer<typeof pointSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
