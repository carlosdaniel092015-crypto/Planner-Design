// zod schemas for the project JSON (mirrors the prototype's editor state) and module recipes.
import { z } from 'zod';

const frontSegmentSchema = z.object({
  t: z.enum(['door', 'drawer', 'oven', 'open']),
  f: z.number().positive().max(1),
  n: z.number().int().min(1).max(6).optional(),
  rod: z.union([z.number(), z.boolean()]).optional(),
});

const flag = z.union([z.literal(0), z.literal(1), z.boolean()]).optional();

/**
 * One board of a module uploaded as a 3D model (read from its meshes): name, lowest corner and size in mm
 * (x = width, y = depth from the back, z = height) and the material slot it takes.
 */
export const panelSchema = z.object({
  n: z.string().max(80),
  p: z.tuple([z.number(), z.number(), z.number()]),
  s: z.tuple([z.number().nonnegative(), z.number().nonnegative(), z.number().nonnegative()]),
  slot: z.enum(['cuerpo', 'frentes', 'trasera']).optional(),
});
/** How an uploaded model is drawn: as a native module (fronts that open) or as its own 3D model. */
const drawField = z.enum(['nativo', 'modelo']).optional();
const panelsFields = {
  /** Boards read from the uploaded 3D model; when present the despiece uses them instead of the standard box. */
  panels: z.array(panelSchema).max(300).optional(),
  /** Model size in cm (w, h, d) the panels were measured at; resizing the module scales them from it. */
  pdim: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]).optional(),
};

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
    ...panelsFields,
    draw: drawField,
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

/** Orbit camera: azimuth and polar angle (radians), distance (m) and target point (m). */
export const camSchema = z.object({
  az: z.number().min(-20).max(20),
  polar: z.number().min(0.05).max(3.1),
  dist: z.number().min(0.2).max(60),
  target: z.tuple([z.number().min(-50).max(50), z.number().min(-50).max(50), z.number().min(-50).max(50)]),
});
export type CameraState = z.infer<typeof camSchema>;

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
    /** Cameras chosen by hand in the approval gallery (also used by the PDF and the client page). */
    cams: z
      .object({
        persp: camSchema.optional(),
        /** Detail view: which module (id) and, optionally, a hand-made camera. */
        det: z.object({ mod: z.number().int().optional(), cam: camSchema.optional() }).optional(),
      })
      .optional(),
    /** Distribution measurements chosen in Especificaciones (walls with furniture, depths, heights, island). */
    dist: z
      .object({
        walls: z.array(z.enum(['A', 'B', 'C', 'D'])).min(1).max(4).optional(),
        baseD: z.number().min(30).max(80).optional(),
        baseH: z.number().min(50).max(100).optional(),
        upperD: z.number().min(20).max(50).optional(),
        aisle: z.number().min(60).max(200).optional(),
        island: z.object({ on: z.boolean().optional(), w: z.number().min(60).max(400).optional(), d: z.number().min(40).max(150).optional() }).optional(),
      })
      .optional(),
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
  ...panelsFields,
  /** Set once the stored model was read for boards (models uploaded before boards were saved). */
  pscan: flag,
  draw: drawField,
}).refine((r) => r.fr.length === 0 || Math.abs(r.fr.reduce((a, s) => a + s.f, 0) - 1) < 0.02, {
  message: 'Las fracciones de los frentes (f) deben sumar 1.',
  path: ['fr'],
});

export type ProjectData = z.infer<typeof projectDataSchema>;
export type ModuleInstance = z.infer<typeof moduleSchema>;
export type ModelPanel = z.infer<typeof panelSchema>;
export type Opening = z.infer<typeof openingSchema>;
export type InstallPoint = z.infer<typeof pointSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
