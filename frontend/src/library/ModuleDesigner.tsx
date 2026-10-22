// Module designer, after Polyboard and SketchUp: a "Propiedades" grid on the left (what the module is, dimensions in
// mm, panel by panel construction, interior, equipment), the module's boards in 3D in the middle (drag to orbit, click
// a board to edit its panel) with the fronts editor, and the live despiece on the right. Used for library modules
// (Bibliotecas → Módulos) and for a module already placed in a project (only that copy changes).
import { type BoardRole, buildOf, DEFAULT_MATERIALS, DEFAULT_MODULES, ESTILOS, type FrontSegment, frontCounts, isAppliance, type ModuleBuild, moduleBoards, type ModuleInstance, parts, placesFor } from '@core';
import { useMemo, useState } from 'react';
import { Icon, MUTED } from '../ui';
import { BoardView } from './BoardView';
import { FrontsEditor } from './FrontsEditor';
import type { LibModule } from './upload';

export type Montaje = 'base' | 'upper' | 'tall' | 'cover';

export interface ModuleDraft {
  name: string;
  /** What the module is (KINDS key), «¿Qué es?». */
  kind: string;
  category: string;
  projectType: 'cocina' | 'closet' | 'tv';
  montaje: Montaje;
  defW: number;
  minW: number;
  maxW: number;
  fixedH: number;
  fixedD: number;
  unitPrice: number;
  place: string;
  fr: FrontSegment[];
  /** null = the usual count for its fronts. */
  shelves: number | null;
  div: number;
  back: boolean;
  build: ModuleBuild;
  sink: 0 | 1 | 2;
  cook: 0 | 4 | 6;
  oven: boolean;
  /** Recipe keys the designer doesn't edit (appliance flags, uploaded boards…), kept as they were. */
  keep?: Record<string, unknown>;
}

const D1: FrontSegment[] = [{ t: 'door', n: 1, f: 1 }];
const D2: FrontSegment[] = [{ t: 'door', n: 2, f: 1 }];

/** Starting point of a new module, per mounting. */
export const NEW_DEFAULTS: Record<Montaje, Pick<ModuleDraft, 'defW' | 'minW' | 'maxW' | 'fixedH' | 'fixedD' | 'category' | 'fr'>> = {
  base: { defW: 60, minW: 30, maxW: 120, fixedH: 76, fixedD: 60, category: 'Bajos', fr: D1 },
  upper: { defW: 60, minW: 30, maxW: 120, fixedH: 70, fixedD: 35, category: 'Altos', fr: D1 },
  tall: { defW: 60, minW: 40, maxW: 90, fixedH: 210, fixedD: 60, category: 'Columnas', fr: [{ t: 'door', n: 1, f: 0.6 }, { t: 'door', n: 1, f: 0.4 }] },
  cover: { defW: 60, minW: 15, maxW: 400, fixedH: 30, fixedD: 35, category: 'Altos', fr: [] },
};

type Kind = { k: string; label: string; montaje: Montaje; cat: string; pt?: ModuleDraft['projectType']; place?: string; set?: Partial<ModuleDraft> };
/** «¿Qué es?»: choosing one sets its mounting, category, default location and a starting recipe. */
export const KINDS: { group: string; items: Kind[] }[] = [
  {
    group: 'Cocina · bajos',
    items: [
      { k: 'bajo', label: 'Bajo de puertas', montaje: 'base', cat: 'Bajos', place: 'bajo', set: { fr: D2, defW: 80 } },
      { k: 'cajonera', label: 'Cajonera', montaje: 'base', cat: 'Cajoneras', place: 'cajonera', set: { fr: [{ t: 'drawer', f: 0.4 }, { t: 'drawer', f: 0.32 }, { t: 'drawer', f: 0.28 }] } },
      { k: 'fregadero', label: 'Bajo fregadero', montaje: 'base', cat: 'Bajos', place: 'fregadero', set: { fr: D2, defW: 90, sink: 1, shelves: 0 } },
      { k: 'parrilla', label: 'Bajo parrilla', montaje: 'base', cat: 'Cajoneras', place: 'parrilla', set: { fr: [{ t: 'drawer', f: 0.5 }, { t: 'drawer', f: 0.5 }], defW: 80, cook: 4 } },
      { k: 'esquinero', label: 'Esquinero bajo', montaje: 'base', cat: 'Esquinas', place: 'esquina-baja', set: { fr: D1, defW: 90 } },
      { k: 'mueble-lavadora', label: 'Mueble para lavadora', montaje: 'base', cat: 'Bajos', set: { fr: [{ t: 'niche', ap: 'lavadora', f: 1 }], defW: 65, fixedH: 86, fixedD: 65 } },
    ],
  },
  {
    group: 'Cocina · altos',
    items: [
      { k: 'alacena', label: 'Alacena', montaje: 'upper', cat: 'Altos', place: 'alto', set: { fr: D2, defW: 80 } },
      { k: 'alacena-esquina', label: 'Alacena esquinera', montaje: 'upper', cat: 'Esquinas', place: 'esquina-alta', set: { fr: D1, defW: 65 } },
      { k: 'sobre-nevera', label: 'Alacena sobre nevera', montaje: 'upper', cat: 'Altos', place: 'sobre-nevera', set: { fr: D2, defW: 80, fixedH: 40, fixedD: 60 } },
      { k: 'mueble-micro', label: 'Mueble para microondas', montaje: 'upper', cat: 'Altos', set: { fr: [{ t: 'niche', ap: 'micro', f: 0.55 }, { t: 'door', n: 1, f: 0.45 }], fixedD: 40 } },
      { k: 'mueble-extractor', label: 'Mueble para extractor', montaje: 'upper', cat: 'Altos', set: { fr: [{ t: 'niche', ap: 'extractor', f: 0.3 }, { t: 'door', n: 1, f: 0.7 }] } },
      { k: 'cubre-falta', label: 'Cubre falta superior', montaje: 'cover', cat: 'Altos' },
    ],
  },
  {
    group: 'Cocina · columnas',
    items: [
      { k: 'columna-horno', label: 'Columna horno', montaje: 'tall', cat: 'Columnas', place: 'columna-horno', set: { fr: [{ t: 'drawer', f: 0.17 }, { t: 'drawer', f: 0.17 }, { t: 'oven', f: 0.28 }, { t: 'door', n: 1, f: 0.38 }], oven: true } },
      { k: 'despensa', label: 'Columna despensa', montaje: 'tall', cat: 'Columnas', place: 'despensa', set: { fr: [{ t: 'door', n: 1, f: 0.45 }, { t: 'door', n: 1, f: 0.55 }], defW: 50 } },
      { k: 'mueble-nevera', label: 'Mueble para nevera', montaje: 'tall', cat: 'Columnas', set: { fr: [{ t: 'niche', ap: 'nevera', f: 0.82 }, { t: 'door', n: 2, f: 0.18 }], defW: 95, fixedH: 230, fixedD: 65, maxW: 110 } },
    ],
  },
  {
    group: 'Closet y vestidor',
    items: [
      { k: 'colgado-largo', label: 'Colgado largo', montaje: 'tall', cat: 'Closet', pt: 'closet', place: 'colgado-largo', set: { fr: [{ t: 'open', f: 1, rod: 1 }], defW: 90, fixedH: 230, fixedD: 55, maxW: 120 } },
      { k: 'colgado-corto', label: 'Colgado corto', montaje: 'tall', cat: 'Closet', pt: 'closet', place: 'colgado-corto', set: { fr: [{ t: 'drawer', f: 0.14 }, { t: 'drawer', f: 0.14 }, { t: 'open', f: 0.72, rod: 1 }], defW: 100, fixedH: 230, fixedD: 55, maxW: 120 } },
      { k: 'cajonera-closet', label: 'Cajonera de closet', montaje: 'tall', cat: 'Closet', pt: 'closet', place: 'cajonera-closet', set: { fr: [{ t: 'drawer', f: 0.12 }, { t: 'drawer', f: 0.12 }, { t: 'drawer', f: 0.12 }, { t: 'door', n: 2, f: 0.64 }], defW: 100, fixedH: 230, fixedD: 55, maxW: 120 } },
      { k: 'zapatero', label: 'Zapatero', montaje: 'tall', cat: 'Closet', pt: 'closet', place: 'zapatero', set: { fr: D1, defW: 60, fixedH: 230, fixedD: 55, shelves: 8 } },
      { k: 'entrepanos', label: 'Entrepaños', montaje: 'tall', cat: 'Closet', pt: 'closet', place: 'entrepanos', set: { fr: [{ t: 'open', f: 1 }], defW: 60, fixedH: 230, fixedD: 55 } },
    ],
  },
  {
    group: 'Mueble de TV',
    items: [
      { k: 'consola-tv', label: 'Consola TV', montaje: 'base', cat: 'Mueble TV', pt: 'tv', place: 'consola-tv', set: { fr: [{ t: 'open', f: 0.4 }, { t: 'door', n: 2, f: 0.6 }], defW: 180, maxW: 320, fixedH: 45, fixedD: 45 } },
      { k: 'torre-tv', label: 'Torre lateral', montaje: 'tall', cat: 'Mueble TV', pt: 'tv', place: 'torre-tv', set: { fr: [{ t: 'open', f: 0.55 }, { t: 'door', n: 1, f: 0.45 }], defW: 40, fixedH: 200, fixedD: 35 } },
      { k: 'alto-tv', label: 'Alacena sobre TV', montaje: 'upper', cat: 'Mueble TV', pt: 'tv', place: 'alto-tv', set: { fr: [{ t: 'door', n: 4, f: 1 }], defW: 180, maxW: 320, fixedH: 35 } },
    ],
  },
  { group: 'Otro', items: [{ k: 'otro', label: 'Otro mueble', montaje: 'base', cat: 'Mis módulos' }] },
];
const KIND = new Map(KINDS.flatMap((g) => g.items).map((k) => [k.k, k]));

export const emptyDraft = (montaje: Montaje = 'base'): ModuleDraft => ({
  name: '',
  kind: '',
  projectType: 'cocina',
  montaje,
  unitPrice: 0,
  place: '',
  shelves: null,
  div: 0,
  back: true,
  build: {},
  sink: 0,
  cook: 0,
  oven: false,
  ...structuredClone(NEW_DEFAULTS[montaje]),
});

type RecipeLike = { fr?: FrontSegment[]; shelves?: number; div?: number; back?: number; sink?: number | boolean; cook?: number | boolean; oven?: number | boolean; cover?: number | boolean; build?: ModuleBuild };
const fromRecipe = (r: RecipeLike) => ({
  fr: r.fr ?? [],
  shelves: r.shelves ?? null,
  div: r.div ?? 0,
  back: r.back !== 0,
  build: r.build ?? {},
  sink: (r.sink === 2 ? 2 : r.sink ? 1 : 0) as ModuleDraft['sink'],
  cook: (r.cook === 6 ? 6 : r.cook ? 4 : 0) as ModuleDraft['cook'],
  oven: !!r.oven,
});

/** A library module (parametric) as a draft. */
export function draftOf(m: LibModule & { kind?: string | null }): ModuleDraft {
  const r = (m.recipe ?? {}) as RecipeLike;
  const type = m.type === 'upper' || m.type === 'tall' ? m.type : 'base';
  const { fr: _fr, shelves: _s, div: _d, back: _b, sink: _k, cook: _c, oven: _o, cover: _v, build: _bu, ...keep } = r as Record<string, unknown>;
  return {
    name: m.name,
    kind: m.kind && KIND.has(m.kind) ? m.kind : '',
    category: m.category,
    projectType: m.projectType ?? 'cocina',
    montaje: r.cover ? 'cover' : type,
    defW: m.defW,
    minW: m.minW,
    maxW: m.maxW,
    fixedH: m.fixedH,
    fixedD: m.fixedD,
    unitPrice: m.unitPrice,
    place: m.anchor?.place ?? '',
    ...fromRecipe(r),
    keep,
  };
}

const typeOf = (d: Pick<ModuleDraft, 'montaje'>) => (d.montaje === 'cover' ? 'upper' : d.montaje);
const cleanBuild = (b: ModuleBuild) => Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) as ModuleBuild;

/** The recipe fields a draft sets (library recipe or a placed module). */
function recipeOf(d: ModuleDraft) {
  if (d.montaje === 'cover') return { fr: [], cover: 1 };
  const build = cleanBuild(d.build);
  return {
    fr: build.front ? [] : d.fr,
    ...(d.shelves != null ? { shelves: d.shelves } : {}),
    ...(d.div ? { div: d.div } : {}),
    ...(d.back ? {} : { back: 0 }),
    ...(Object.keys(build).length ? { build } : {}),
    ...(d.montaje === 'base' && d.sink ? { sink: d.sink } : {}),
    ...(d.montaje === 'base' && d.cook ? { cook: d.cook } : {}),
    ...(d.montaje !== 'upper' && d.oven ? { oven: 1 } : {}),
  };
}

/** What the API stores for a draft (POST / PATCH /library/modules). */
export function draftToBody(d: ModuleDraft) {
  const cover = d.montaje === 'cover';
  return {
    name: d.name.trim(),
    category: d.category,
    projectType: d.projectType,
    type: typeOf(d),
    ...(d.kind ? { kind: d.kind } : {}),
    defW: d.defW,
    minW: d.minW,
    maxW: d.maxW,
    fixedH: d.fixedH,
    fixedD: d.fixedD,
    unitPrice: d.unitPrice,
    anchor: d.place && !cover ? { place: d.place } : null,
    recipe: { ...d.keep, ...recipeOf(d) },
  };
}

/** A module placed in a project as a draft (the designer edits only that copy). */
export function draftOfInstance(m: ModuleInstance): ModuleDraft {
  const type = m.type === 'upper' || m.type === 'tall' ? m.type : 'base';
  const [lo, hi] = m.rw ?? [m.w, m.w];
  return { ...emptyDraft(m.cover ? 'cover' : type), name: m.name, category: m.cat, defW: m.w, minW: Math.min(lo, m.w), maxW: Math.max(hi, m.w), fixedH: m.h, fixedD: m.d, ...fromRecipe(m as RecipeLike) };
}

/** The changes a draft makes to a placed module: name, size, fronts and construction. */
export function draftToInstancePatch(d: ModuleDraft): Partial<ModuleInstance> {
  const r = recipeOf(d);
  return {
    name: d.name.trim() || 'Módulo',
    w: d.defW,
    h: d.fixedH,
    d: d.fixedD,
    rw: [d.minW, d.maxW],
    fr: r.fr,
    shelves: 'shelves' in r ? r.shelves : undefined,
    div: 'div' in r ? r.div : undefined,
    back: 'back' in r ? (r.back as 0) : undefined,
    build: 'build' in r ? r.build : undefined,
    sink: 'sink' in r ? (r.sink as 1) : undefined,
    cook: 'cook' in r ? (r.cook as 4) : undefined,
    oven: 'oven' in r ? 1 : undefined,
  };
}

/** Problems that keep a draft from being saved (empty = fine). */
export function draftErrors(d: ModuleDraft): string[] {
  const out: string[] = [];
  if (!d.name.trim()) out.push('Ponle un nombre al módulo.');
  if (d.minW > d.defW || d.defW > d.maxW) out.push('El ancho debe estar entre el ancho mínimo y el máximo.');
  if (d.montaje !== 'cover' && d.fr.some((f) => f.t === 'oven') && d.montaje === 'upper') out.push('Un hueco de horno no va en una alacena.');
  return out;
}

/** Catalogue furniture a new module can start from ("Partir de"). */
const STARTERS = DEFAULT_MODULES.filter((m) => !isAppliance(m) && !m.panels?.length && !m.cover && (m.type === 'base' || m.type === 'upper' || m.type === 'tall')).sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));

const PREVIEW_MATS = ESTILOS[0]!.m;
const PREVIEW_MATERIALS = Object.fromEntries(DEFAULT_MATERIALS.map((m) => [m.code, m]));

/** Despiece names of each panel (to highlight the selected one). */
const ROLE_PIECES: Record<BoardRole, string[]> = {
  techo: ['Techo'],
  travesano: ['Travesaño'],
  suelo: ['Base'],
  'lat-izq': ['Lateral'],
  'lat-der': ['Lateral'],
  trasera: ['Trasera'],
  frontal: ['Frontal'],
  division: ['División'],
  entrepano: ['Entrepaño'],
  divisor: ['Divisor de hueco'],
  puerta: ['Puerta'],
  cajon: ['Frente de cajón'],
  horno: ['Remate de horno'],
};
/** Properties group each panel is edited in. */
const ROLE_GROUP: Record<BoardRole, string> = {
  techo: 'techo',
  travesano: 'techo',
  suelo: 'suelo',
  'lat-izq': 'lat-izq',
  'lat-der': 'lat-der',
  trasera: 'trasera',
  frontal: 'frontal',
  division: 'interior',
  entrepano: 'interior',
  divisor: 'interior',
  puerta: 'frentes',
  cajon: 'frentes',
  horno: 'frentes',
};

/** One row of the property grid: name on the left, value on the right (like Polyboard's "Propiedades"). */
function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div title={hint} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.25fr)', alignItems: 'center', gap: 8, padding: '3px 0 3px 22px', borderBottom: '1px solid color-mix(in srgb,var(--color-divider) 60%,transparent)', fontSize: 13 }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <div>{children}</div>
    </div>
  );
}

/** Collapsible group of the property grid (⊟ / ⊞). */
function Group({ id, title, open, onToggle, active, children, level = 0 }: { id: string; title: string; open: boolean; onToggle: (id: string) => void; active?: boolean; children: React.ReactNode; level?: number }) {
  return (
    <div id={`md-group-${id}`} style={{ marginLeft: level * 14, background: active ? 'color-mix(in srgb,var(--color-accent) 10%,transparent)' : undefined, outline: active ? '1px solid var(--color-accent)' : undefined }}>
      <button type="button" onClick={() => onToggle(id)} aria-expanded={open} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 2px', background: 'none', border: 0, font: 'inherit', fontSize: 13, fontWeight: 800, cursor: 'pointer', color: 'var(--color-text)', textAlign: 'left' }}>
        <Icon name={open ? 'square-minus' : 'square-plus'} size={14} />
        {title}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

const sel = { height: 30, minHeight: 30, padding: '2px 6px', fontSize: 13, width: '100%' } as const;

function YesNo({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <select className="input" aria-label={label} value={value ? 'si' : 'no'} disabled={disabled} onChange={(e) => onChange(e.target.value === 'si')} style={sel}>
      <option value="si">Sí</option>
      <option value="no">No</option>
    </select>
  );
}

/** Millimetres typed, centimetres stored (the modules are in cm). */
function Mm({ label, cm, min, max, onChange }: { label: string; cm: number; min: number; max: number; onChange: (cm: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const mm = Math.round(cm * 100) / 10;
  const commit = () => {
    const v = Number((text ?? '').replace(',', '.'));
    if (text != null && Number.isFinite(v) && text.trim()) onChange(Math.max(min, Math.min(max, Math.round(v) / 10)));
    setText(null);
  };
  return (
    <div style={{ position: 'relative' }}>
      <input className="input" type="text" inputMode="decimal" aria-label={`${label} en mm`} value={text ?? mm.toFixed(1)} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} style={{ ...sel, paddingRight: 34 }} />
      <span style={{ position: 'absolute', right: 8, top: 7, fontSize: 12, opacity: 0.6 }}>mm</span>
    </div>
  );
}

export function ModuleDesigner({ initial, title, cats, busy, onCancel, onSave, mode = 'library' }: { initial: ModuleDraft; title: string; cats: string[]; busy?: boolean; onCancel: () => void; onSave: (d: ModuleDraft) => void; mode?: 'library' | 'project' }) {
  const [d, setD] = useState<ModuleDraft>(initial);
  const [errs, setErrs] = useState<string[]>([]);
  const [picked, setPicked] = useState<BoardRole | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({ general: true, dim: true, paneles: true, techo: true, suelo: true, 'lat-der': true, 'lat-izq': true, trasera: true, frontal: true, interior: true, equipo: true, biblioteca: mode === 'library', coste: true });
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const set = (patch: Partial<ModuleDraft>) => setD((x) => ({ ...x, ...patch }));
  const setB = (patch: Partial<ModuleBuild>) => setD((x) => ({ ...x, build: { ...x.build, ...patch } }));
  const cover = d.montaje === 'cover';
  const type = typeOf(d);
  const lib = mode === 'library';

  const inst = useMemo(
    () =>
      ({
        id: 1,
        code: 'NUEVO',
        name: d.name || 'Nuevo módulo',
        cat: d.category,
        type,
        wall: 'A',
        pos: 0,
        w: d.defW,
        h: d.fixedH,
        d: d.fixedD,
        rw: [d.minW, d.maxW],
        ...recipeOf(d),
      }) as unknown as ModuleInstance,
    [d, type],
  );
  const b = buildOf(inst);
  const boards = useMemo(() => (cover ? [{ n: 'Cubre falta superior', role: 'frontal' as const, box: [0, d.defW * 10, d.fixedD * 10 - 18, d.fixedD * 10, 0, d.fixedH * 10] as [number, number, number, number, number, number], L: 0, A: 0, esp: 18, slot: 'frentes' as const, veta: '', cantos: '', grp: 'door' as const }] : moduleBoards(inst)), [inst, cover, d.defW, d.fixedD, d.fixedH]);
  const pieces = useMemo(() => parts(inst, PREVIEW_MATS, PREVIEW_MATERIALS), [inst]);
  const area = pieces.reduce((a, p) => a + (p.cant * p.L * p.A) / 1e6, 0);
  const counts = frontCounts(inst);
  const hinges = counts.doors * 2 + counts.tallDoors;
  const places = placesFor({ projectType: d.projectType, type });
  const hot = picked ? ROLE_PIECES[picked] : [];

  const pick = (r: BoardRole | null) => {
    setPicked(r);
    if (!r) return;
    const g = ROLE_GROUP[r];
    setOpen((o) => ({ ...o, [g]: true, paneles: true }));
    setTimeout(() => document.getElementById(`md-group-${g}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0);
  };
  const chooseKind = (k: string) => {
    const kind = KIND.get(k);
    if (!kind) return set({ kind: '' });
    setD((x) => ({
      ...x,
      ...emptyDraft(kind.montaje),
      ...kind.set,
      fr: structuredClone(kind.set?.fr ?? NEW_DEFAULTS[kind.montaje].fr),
      kind: k,
      name: x.name || kind.label,
      category: kind.cat,
      projectType: kind.pt ?? 'cocina',
      place: kind.place ?? '',
      unitPrice: x.unitPrice,
      keep: x.keep,
      build: x.build,
    }));
  };
  const startFrom = (code: string) => {
    const m = DEFAULT_MODULES.find((x) => x.code === code);
    if (!m) return;
    const montaje = m.type === 'upper' || m.type === 'tall' ? m.type : 'base';
    setD((x) => ({ ...x, name: x.name || `${m.name} (propio)`, category: m.cat, projectType: m.projectType, montaje, defW: m.w, minW: m.rw?.[0] ?? m.w, maxW: m.rw?.[1] ?? m.w, fixedH: m.h, fixedD: m.d, fr: structuredClone(m.fr), sink: m.sink === 2 ? 2 : m.sink ? 1 : 0, cook: m.cook === 6 ? 6 : m.cook ? 4 : 0, oven: !!m.oven, shelves: null, div: 0, back: true, build: {}, place: '' }));
  };
  const save = () => {
    const e = draftErrors(d);
    setErrs(e);
    if (!e.length) onSave(d);
  };
  // Sides: «Total» = floor to top (top and bottom between them); «Entre techo y suelo» = top and bottom over them.
  const sidePos = b.topPos === 'entre' && b.bottomPos === 'entre' ? 'total' : b.topPos === 'total' && b.bottomPos === 'total' ? 'entre' : 'mixta';
  const setSidePos = (v: string) => (v === 'total' ? setB({ topPos: 'entre', bottomPos: 'entre' }) : setB({ topPos: 'total', bottomPos: 'total' }));

  const panel = (id: 'lat-der' | 'lat-izq', title: string, key: 'right' | 'left') => (
    <Group id={id} title={title} open={open[id]!} onToggle={toggle} active={picked === id} level={1}>
      <Row label="Presente">
        <YesNo label={`${title}: presente`} value={!!b[key]} onChange={(v) => setB({ [key]: v ? 1 : 0 })} />
      </Row>
      <Row label="Posición" hint="Total: de piso a techo, con el techo y el suelo entre los laterales">
        <select className="input" aria-label={`${title}: posición`} value={sidePos} disabled={!b[key]} onChange={(e) => setSidePos(e.target.value)} style={sel}>
          <option value="total">Total</option>
          <option value="entre">Entre techo y suelo</option>
          {sidePos === 'mixta' && <option value="mixta">Mixta</option>}
        </select>
      </Row>
    </Group>
  );

  return (
    <div className="dialog-backdrop" style={{ zIndex: 80, position: 'fixed' }} onClick={onCancel}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} style={{ width: 'min(1440px,100%)', height: 'min(900px,100%)', gap: 0, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <style>{'@media (max-width: 1000px){.designer-body{grid-template-columns:minmax(0,1fr)!important}.designer-body>div{overflow:visible!important;border:0!important}}'}</style>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '2px solid var(--color-divider)', flexWrap: 'wrap' }}>
          <Icon name="box" size={20} />
          <div style={{ flex: '1 1 260px' }}>
            <div className="dialog-title" style={{ margin: 0 }}>{title}</div>
            <div style={{ fontSize: 13, color: MUTED }}>Como en Polyboard: cada panel con «Presente» y «Posición». Gira el mueble arrastrando y haz clic en una pieza para editarla.</div>
          </div>
          {lib && <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
            ¿Qué es?
            <select className="input" aria-label="¿Qué es?" value={d.kind} onChange={(e) => chooseKind(e.target.value)} style={{ width: 230 }}>
              <option value="">Elige qué mueble es…</option>
              {KINDS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map((k) => (
                    <option key={k.k} value={k.k}>
                      {k.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>}
          <button type="button" className="btn btn-icon" onClick={onCancel} aria-label="Cerrar">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="designer-body" style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(300px,360px) minmax(0,1fr) minmax(250px,320px)', overflow: 'auto' }}>
          {/* ---------- Propiedades ---------- */}
          <div style={{ overflow: 'auto', padding: '10px 14px', borderRight: '1px solid var(--color-divider)' }}>
            <div style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Propiedades</div>
            <div style={{ padding: '6px 8px', border: '1px solid var(--color-divider)', fontSize: 13, marginBottom: 6, fontWeight: 700 }}>Mueble «{d.name || 'sin nombre'}»</div>

            <Group id="general" title="General" open={open.general!} onToggle={toggle}>
              <Row label="Nombre">
                <input className="input" aria-label="Nombre" value={d.name} maxLength={120} placeholder="MB 2 puertas" onChange={(e) => set({ name: e.target.value })} style={sel} />
              </Row>
              <Row label="Montaje">
                <select
                  className="input"
                  aria-label="Montaje"
                  value={d.montaje}
                  onChange={(e) => {
                    const montaje = e.target.value as Montaje;
                    setD((x) => ({ ...x, montaje, ...structuredClone(NEW_DEFAULTS[montaje]), ...(montaje === 'cover' ? { shelves: null, div: 0 } : {}), place: '' }));
                  }}
                  style={sel}
                >
                  <option value="base">Bajo (con encimera)</option>
                  <option value="upper">Alto (a 150 cm)</option>
                  <option value="tall">Columna</option>
                  <option value="cover">Cubre falta superior</option>
                </select>
              </Row>
              {lib && (
                <Row label="Partir de">
                  <select className="input" aria-label="Partir de un módulo del catálogo" value="" onChange={(e) => startFrom(e.target.value)} style={sel}>
                    <option value="">Módulo del catálogo…</option>
                    {STARTERS.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.cat} · {m.name}
                      </option>
                    ))}
                  </select>
                </Row>
              )}
            </Group>

            <Group id="dim" title="Dimensiones" open={open.dim!} onToggle={toggle}>
              <Row label="Altura">
                <Mm label="Altura" cm={d.fixedH} min={3} max={300} onChange={(fixedH) => set({ fixedH })} />
              </Row>
              <Row label="Anchura">
                <Mm label="Anchura" cm={d.defW} min={10} max={400} onChange={(defW) => set({ defW, minW: Math.min(d.minW, defW), maxW: Math.max(d.maxW, defW) })} />
              </Row>
              <Row label="Profundidad">
                <Mm label="Profundidad" cm={d.fixedD} min={10} max={120} onChange={(fixedD) => set({ fixedD })} />
              </Row>
              <Row label="Anchura mín." hint="En el proyecto se puede estirar entre la mínima y la máxima">
                <Mm label="Anchura mínima" cm={d.minW} min={10} max={400} onChange={(minW) => set({ minW: Math.min(minW, d.defW) })} />
              </Row>
              <Row label="Anchura máx.">
                <Mm label="Anchura máxima" cm={d.maxW} min={10} max={400} onChange={(maxW) => set({ maxW: Math.max(maxW, d.defW) })} />
              </Row>
            </Group>

            {!cover && (
              <Group id="paneles" title="Paneles" open={open.paneles!} onToggle={toggle}>
                <Group id="techo" title="Techo" open={open.techo!} onToggle={toggle} active={picked === 'techo' || picked === 'travesano'} level={1}>
                  <Row label="Presente">
                    <select className="input" aria-label="Techo: presente" value={b.top} onChange={(e) => setB({ top: e.target.value as ModuleBuild['top'] })} style={sel}>
                      <option value="completo">Sí</option>
                      <option value="travesanos">Travesaños</option>
                      <option value="no">No</option>
                    </select>
                  </Row>
                  <Row label="Posición" hint="Total: sobre los laterales, de lado a lado">
                    <select className="input" aria-label="Techo: posición" value={b.topPos} disabled={b.top === 'no'} onChange={(e) => setB({ topPos: e.target.value as 'total' })} style={sel}>
                      <option value="total">Total</option>
                      <option value="entre">Entre laterales</option>
                    </select>
                  </Row>
                  {b.top === 'travesanos' && (
                    <Row label="Ancho travesaño">
                      <Mm label="Ancho del travesaño" cm={b.rail / 10} min={4} max={30} onChange={(cm) => setB({ rail: Math.round(cm * 10) })} />
                    </Row>
                  )}
                </Group>
                <Group id="suelo" title="Suelo" open={open.suelo!} onToggle={toggle} active={picked === 'suelo'} level={1}>
                  <Row label="Presente">
                    <YesNo label="Suelo: presente" value={!!b.bottom} onChange={(v) => setB({ bottom: v ? 1 : 0 })} />
                  </Row>
                  <Row label="Posición" hint="Total: bajo los laterales, de lado a lado">
                    <select className="input" aria-label="Suelo: posición" value={b.bottomPos} disabled={!b.bottom} onChange={(e) => setB({ bottomPos: e.target.value as 'total' })} style={sel}>
                      <option value="total">Total</option>
                      <option value="entre">Entre laterales</option>
                    </select>
                  </Row>
                </Group>
                {panel('lat-der', 'Lateral derecho', 'right')}
                {panel('lat-izq', 'Lateral izquierdo', 'left')}
                <Group id="trasera" title="Trasera" open={open.trasera!} onToggle={toggle} active={picked === 'trasera'} level={1}>
                  <Row label="Presente">
                    <YesNo label="Trasera: presente" value={d.back} onChange={(back) => set({ back })} />
                  </Row>
                  <Row label="Posición" hint="Ranurada: encajada en una ranura · Total: atornillada sobre toda la parte de atrás · Entre laterales: entre los laterales, el techo y el suelo">
                    <select className="input" aria-label="Trasera: posición" value={b.backPos} disabled={!d.back} onChange={(e) => setB({ backPos: e.target.value as 'total' })} style={sel}>
                      <option value="ranura">Ranurada</option>
                      <option value="total">Total</option>
                      <option value="entre">Entre laterales</option>
                    </select>
                  </Row>
                  <Row label="Espesor">
                    <select className="input" aria-label="Trasera: espesor" value={b.backT} disabled={!d.back} onChange={(e) => setB({ backT: Number(e.target.value) as 6 })} style={sel}>
                      <option value={6}>6 mm (HDF)</option>
                      <option value={18}>18 mm (tablero)</option>
                    </select>
                  </Row>
                </Group>
                <Group id="frontal" title="Frontal" open={open.frontal!} onToggle={toggle} active={picked === 'frontal'} level={1}>
                  <Row label="Presente" hint="Un tablero fijo que cierra todo el frente (sin puertas ni cajones)">
                    <YesNo label="Frontal: presente" value={!!b.front} onChange={(v) => setB({ front: v ? 1 : 0 })} />
                  </Row>
                  <Row label="Posición">
                    <span style={{ fontSize: 13, color: MUTED }}>Total</span>
                  </Row>
                </Group>
              </Group>
            )}

            {!cover && (
              <Group id="interior" title="Interior" open={open.interior!} onToggle={toggle} active={picked === 'entrepano' || picked === 'division' || picked === 'divisor'}>
                <Row label="Entrepaños" hint="Por compartimento">
                  <select className="input" aria-label="Entrepaños" value={d.shelves ?? 'auto'} onChange={(e) => set({ shelves: e.target.value === 'auto' ? null : Number(e.target.value) })} style={sel}>
                    <option value="auto">Automático</option>
                    {Array.from({ length: 13 }, (_, i) => (
                      <option key={i} value={i}>
                        {i === 0 ? 'Ninguno' : i}
                      </option>
                    ))}
                  </select>
                </Row>
                <Row label="Divisiones">
                  <select className="input" aria-label="Divisiones verticales" value={d.div} onChange={(e) => set({ div: Number(e.target.value) })} style={sel}>
                    {Array.from({ length: 7 }, (_, i) => (
                      <option key={i} value={i}>
                        {i === 0 ? 'Ninguna' : `${i} (${i + 1} huecos)`}
                      </option>
                    ))}
                  </select>
                </Row>
              </Group>
            )}

            {!cover && d.montaje !== 'upper' && (
              <Group id="equipo" title="Equipamiento" open={open.equipo!} onToggle={toggle}>
                {d.montaje === 'base' && (
                  <>
                    <Row label="Fregadero">
                      <select className="input" aria-label="Fregadero" value={d.sink} onChange={(e) => set({ sink: Number(e.target.value) as ModuleDraft['sink'] })} style={sel}>
                        <option value={0}>No</option>
                        <option value={1}>1 bocal</option>
                        <option value={2}>2 bocales</option>
                      </select>
                    </Row>
                    <Row label="Parrilla">
                      <select className="input" aria-label="Parrilla empotrada" value={d.cook} onChange={(e) => set({ cook: Number(e.target.value) as ModuleDraft['cook'] })} style={sel}>
                        <option value={0}>No</option>
                        <option value={4}>4 hornillas</option>
                        <option value={6}>6 hornillas</option>
                      </select>
                    </Row>
                  </>
                )}
                <Row label="Horno empotrado">
                  <YesNo label="Horno empotrado" value={d.oven} onChange={(oven) => set({ oven })} />
                </Row>
              </Group>
            )}

            {lib && (
              <Group id="biblioteca" title="Biblioteca" open={open.biblioteca!} onToggle={toggle}>
                <Row label="Categoría">
                  <select className="input" aria-label="Categoría" value={d.category} onChange={(e) => set({ category: e.target.value })} style={sel}>
                    {[...new Set([...cats, d.category])].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Row>
                <Row label="Proyecto">
                  <select className="input" aria-label="Proyecto" value={d.projectType} onChange={(e) => set({ projectType: e.target.value as ModuleDraft['projectType'], place: '' })} style={sel}>
                    <option value="cocina">Cocina</option>
                    <option value="closet">Closet y vestidor</option>
                    <option value="tv">Mueble de TV</option>
                  </select>
                </Row>
                {!cover && (
                  <Row label="Ubicación" hint="Dónde lo coloca «Generar distribución» sin elegirlo en el asistente">
                    <select className="input" aria-label="Ubicación predeterminada" value={places.some((p) => p.key === d.place) ? d.place : ''} onChange={(e) => set({ place: e.target.value })} style={sel}>
                      <option value="">Ninguna</option>
                      {places.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </Row>
                )}
                <Row label="Mano de obra">
                  <input className="input" type="number" min={0} aria-label="Precio de mano de obra" value={d.unitPrice} onChange={(e) => set({ unitPrice: Math.max(0, Number(e.target.value) || 0) })} style={sel} />
                </Row>
              </Group>
            )}

            <Group id="coste" title="Coste" open={open.coste!} onToggle={toggle}>
              <Row label="Piezas">{pieces.reduce((a, p) => a + p.cant, 0)}</Row>
              <Row label="Tablero">{area.toFixed(2).replace('.', ',')} m²</Row>
              {hinges > 0 && <Row label="Bisagras">{hinges}</Row>}
              {counts.drawers > 0 && <Row label="Correderas (pares)">{counts.drawers}</Row>}
            </Group>
          </div>

          {/* ---------- 3D + frentes ---------- */}
          <div style={{ overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 14, background: 'var(--color-bg)' }}>
            <BoardView boards={boards} W={d.defW * 10} H={d.fixedH * 10} D={d.fixedD * 10} selected={picked} onSelect={pick} height={460} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
              {(
                [
                  ['frente', 'Frente'],
                  ['lado', 'Lateral'],
                  ['arriba', 'Planta'],
                ] as const
              ).map(([p, l]) => (
                <figure key={p} style={{ margin: 0 }}>
                  <BoardView boards={boards} W={d.defW * 10} H={d.fixedH * 10} D={d.fixedD * 10} selected={picked} onSelect={pick} height={170} preset={p} compact />
                  <figcaption style={{ fontSize: 12, color: MUTED, textAlign: 'center' }}>{l}</figcaption>
                </figure>
              ))}
            </div>
            {!cover && !b.front && (
              <div id="md-group-frentes" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, border: `1px solid ${picked && ROLE_GROUP[picked] === 'frentes' ? 'var(--color-accent)' : 'var(--color-divider)'}` }}>
                <h6 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="door-closed" size={15} />
                  Frentes (puertas, cajones, huecos)
                </h6>
                <FrontsEditor w={d.defW} h={d.fixedH} type={type} fr={d.fr} onChange={(fr) => set({ fr })} />
              </div>
            )}
            {b.front && <p style={{ margin: 0, fontSize: 13, color: MUTED }}>Con «Frontal» presente, el frente es un tablero fijo: no lleva puertas ni cajones.</p>}
          </div>

          {/* ---------- despiece ---------- */}
          <div style={{ overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, borderLeft: '1px solid var(--color-divider)' }}>
            <h6 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="list" size={15} />
              Lista de corte
            </h6>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: MUTED }}>
                  <th style={{ padding: '4px 4px 4px 0' }}>Pieza</th>
                  <th style={{ padding: 4, textAlign: 'right' }}>Cant.</th>
                  <th style={{ padding: 4, textAlign: 'right' }}>Largo × ancho</th>
                  <th style={{ padding: '4px 0 4px 4px', textAlign: 'right' }}>Esp.</th>
                </tr>
              </thead>
              <tbody>
                {pieces.map((p) => (
                  <tr key={p.ref} style={{ borderTop: '1px solid var(--color-divider)', background: hot.includes(p.pieza) ? 'color-mix(in srgb,var(--color-accent) 14%,transparent)' : undefined }}>
                    <td style={{ padding: '5px 4px 5px 0' }}>
                      {p.pieza}
                      <div style={{ color: MUTED }}>{p.slot === 'frentes' ? 'Frentes' : p.slot === 'trasera' ? 'Trasera' : 'Cuerpo'}</div>
                    </td>
                    <td style={{ padding: 4, textAlign: 'right', fontWeight: 700 }}>{p.cant}</td>
                    <td style={{ padding: 4, textAlign: 'right' }}>
                      {p.L} × {p.A}
                    </td>
                    <td style={{ padding: '5px 0 5px 4px', textAlign: 'right' }}>{p.esp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <span style={{ fontSize: 12, color: MUTED }}>En mm, con tableros de 18 mm y juntas de 4 mm. En cada proyecto se usan sus materiales, espesores y separación entre puertas.</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderTop: '2px solid var(--color-divider)', flexWrap: 'wrap' }}>
          <span role={errs.length ? 'alert' : undefined} style={{ flex: '1 1 260px', fontSize: 13, color: errs.length ? 'var(--color-accent-700)' : MUTED }}>
            {errs.length ? errs.join(' ') : lib ? 'Se guarda en la biblioteca y aparece en la pestaña Módulos del editor, en su categoría.' : 'Cambia solo este módulo del proyecto; el de la biblioteca queda igual.'}
          </span>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            <Icon name="check" size={15} />
            {busy ? 'Guardando…' : lib ? 'Guardar módulo' : 'Aplicar al módulo'}
          </button>
        </div>
      </div>
    </div>
  );
}
