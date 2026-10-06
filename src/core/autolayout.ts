// Automatic layout ("Generar distribución"). The prototype always returned a fixed template; this places real
// modules from the organisation's catalogue using the room size, doors, windows, installation points, chosen
// appliances and preferences. Pure and deterministic: same input → same modules.
import { DEFAULT_MODULES } from './catalog';
import { templateOf } from './editing';
import { zocaloCm } from './geometry';
import type { ModuleInstance, ProjectData } from './schema';
import { applOf, closetOf, cmOf, distOf, ESTILOS, isCustomAppl, tvOf, tvSize } from './spec';
import type { ModuleDefinition, ModuleShape } from './types';

type Wall = 'A' | 'B' | 'C' | 'D';
interface Seg {
  wall: Wall;
  a: number;
  b: number;
}
interface Placed {
  wall: Wall;
  pos: number;
  w: number;
  tpl: ModuleShape & { moduleVersion?: number };
  patch?: Partial<ModuleInstance>;
}

export interface GeneratedDesign {
  mods: ModuleInstance[];
  mats: ProjectData['mats'];
  /** Human-readable notes about compromises (Spanish). */
  notes: string[];
}

const FALLBACK = Object.fromEntries(DEFAULT_MODULES.map((d) => [d.code, d]));

/**
 * Standard modules the generator places, one per role. The designer can replace each with one of the organisation's own
 * modules (`prefs.mods`: standard code → chosen code; '' = keep the standard one).
 */
export const MODULE_ROLES: { code: string; label: string; ptype: 'cocina' | 'closet' | 'vestidor' | 'tv' }[] = [
  { code: 'E-L', label: 'Esquinero', ptype: 'cocina' },
  { code: 'BF', label: 'Base fregadero', ptype: 'cocina' },
  { code: 'LV-60', label: 'Lavavajillas y empotrados', ptype: 'cocina' },
  { code: 'BP-80', label: 'Base parrilla', ptype: 'cocina' },
  { code: 'BC-3', label: 'Cajonera junto a la parrilla', ptype: 'cocina' },
  { code: 'B-1P', label: 'Base 1 puerta', ptype: 'cocina' },
  { code: 'B-2P', label: 'Base 2 puertas', ptype: 'cocina' },
  { code: 'BB-22', label: 'Base estrecha / botellero', ptype: 'cocina' },
  { code: 'A-1P', label: 'Alacena 1 puerta', ptype: 'cocina' },
  { code: 'A-2P', label: 'Alacena 2 puertas', ptype: 'cocina' },
  { code: 'CM-80', label: 'Campana', ptype: 'cocina' },
  { code: 'RF-75', label: 'Refrigerador', ptype: 'cocina' },
  { code: 'C-HO', label: 'Columna horno', ptype: 'cocina' },
  { code: 'C-DE', label: 'Columna despensa / microondas', ptype: 'cocina' },
  { code: 'IS-120', label: 'Isla / península', ptype: 'cocina' },
  { code: 'CL-100', label: 'Colgado largo', ptype: 'closet' },
  { code: 'CC-100', label: 'Colgado corto', ptype: 'closet' },
  { code: 'CJ-100', label: 'Cajonera', ptype: 'closet' },
  { code: 'ZP-60', label: 'Zapatero', ptype: 'closet' },
  { code: 'CL-E', label: 'Entrepaños', ptype: 'closet' },
  { code: 'IC-100', label: 'Isla cajonera', ptype: 'closet' },
  { code: 'VL-100', label: 'Colgado largo', ptype: 'vestidor' },
  { code: 'VC-100', label: 'Colgado corto / cajonera', ptype: 'vestidor' },
  { code: 'VZ-80', label: 'Zapatero', ptype: 'vestidor' },
  { code: 'VE-80', label: 'Entrepaños', ptype: 'vestidor' },
  { code: 'IC-100', label: 'Isla cajonera', ptype: 'vestidor' },
  { code: 'TV-CON', label: 'Consola TV', ptype: 'tv' },
  { code: 'TV-TOR', label: 'Torre lateral', ptype: 'tv' },
  { code: 'TV-PAN', label: 'Panel para TV', ptype: 'tv' },
  { code: 'TV-REP', label: 'Repisa flotante', ptype: 'tv' },
  { code: 'TV-ALT', label: 'Alacena superior', ptype: 'tv' },
];

/**
 * Default locations a library module can declare ("Ubicación predeterminada"). The generator uses it automatically in
 * those roles, or in the extra spots (`roles: []`: corner upper, over the fridge) that only exist for own modules.
 */
export const MODULE_PLACES: { key: string; label: string; ptype: 'cocina' | 'closet' | 'tv'; type: ModuleShape['type']; roles: string[] }[] = [
  { key: 'bajo', label: 'Bajo encimera', ptype: 'cocina', type: 'base', roles: ['B-1P', 'B-2P'] },
  { key: 'esquina-baja', label: 'Bajo encimera esquina', ptype: 'cocina', type: 'base', roles: ['E-L'] },
  { key: 'fregadero', label: 'Bajo fregadero', ptype: 'cocina', type: 'base', roles: ['BF'] },
  { key: 'parrilla', label: 'Bajo parrilla', ptype: 'cocina', type: 'base', roles: ['BP-80'] },
  { key: 'cajonera', label: 'Cajonera', ptype: 'cocina', type: 'base', roles: ['BC-3'] },
  { key: 'estrecho', label: 'Estrecho / botellero', ptype: 'cocina', type: 'base', roles: ['BB-22'] },
  { key: 'isla', label: 'Isla / península', ptype: 'cocina', type: 'base', roles: ['IS-120'] },
  { key: 'alto', label: 'Montaje alto', ptype: 'cocina', type: 'upper', roles: ['A-1P', 'A-2P'] },
  { key: 'esquina-alta', label: 'Montaje alto esquina', ptype: 'cocina', type: 'upper', roles: [] },
  { key: 'sobre-nevera', label: 'Sobre nevera', ptype: 'cocina', type: 'upper', roles: [] },
  { key: 'columna-horno', label: 'Columna horno', ptype: 'cocina', type: 'tall', roles: ['C-HO'] },
  { key: 'despensa', label: 'Columna despensa', ptype: 'cocina', type: 'tall', roles: ['C-DE'] },
  { key: 'colgado-largo', label: 'Colgado largo', ptype: 'closet', type: 'tall', roles: ['CL-100', 'VL-100'] },
  { key: 'colgado-corto', label: 'Colgado corto', ptype: 'closet', type: 'tall', roles: ['CC-100', 'VC-100'] },
  { key: 'cajonera-closet', label: 'Cajonera', ptype: 'closet', type: 'tall', roles: ['CJ-100'] },
  { key: 'zapatero', label: 'Zapatero', ptype: 'closet', type: 'tall', roles: ['ZP-60', 'VZ-80'] },
  { key: 'entrepanos', label: 'Entrepaños', ptype: 'closet', type: 'tall', roles: ['CL-E', 'VE-80'] },
  { key: 'isla-closet', label: 'Isla cajonera', ptype: 'closet', type: 'base', roles: ['IC-100'] },
  { key: 'consola-tv', label: 'Consola TV', ptype: 'tv', type: 'base', roles: ['TV-CON'] },
  { key: 'torre-tv', label: 'Torre lateral', ptype: 'tv', type: 'tall', roles: ['TV-TOR'] },
  { key: 'panel-tv', label: 'Panel para TV', ptype: 'tv', type: 'upper', roles: ['TV-PAN'] },
  { key: 'repisa-tv', label: 'Repisa flotante', ptype: 'tv', type: 'upper', roles: ['TV-REP'] },
  { key: 'alto-tv', label: 'Alacena superior', ptype: 'tv', type: 'upper', roles: ['TV-ALT'] },
];

/** Locations that fit a module (same kind of project; montaje compatible). */
export const placesFor = (m: Pick<ModuleDefinition, 'projectType' | 'type'>) => MODULE_PLACES.filter((p) => p.ptype === m.projectType && (p.type === m.type || (p.ptype === 'closet' && m.type !== 'upper' && m.type !== 'hood')));

/** Own modules that declared a location covering this standard role, same type (best first: by name). */
export function placedFor(code: string, catalog: Record<string, ModuleDefinition>): ModuleDefinition[] {
  const std = catalog[code] ?? FALLBACK[code];
  const keys = new Set(MODULE_PLACES.filter((p) => p.roles.includes(code)).map((p) => p.key));
  if (!std || !keys.size) return [];
  return Object.values(catalog)
    .filter((m) => m.active && m.place && keys.has(m.place) && m.code !== code && m.projectType === std.projectType && m.type === std.type)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Roles for a project (a closet laid out "abierto" uses the walk-in modules). */
export const moduleRolesFor = (p: Pick<ProjectData, 'ptype' | 'layout'>) =>
  MODULE_ROLES.filter((r) => r.ptype === (p.ptype === 'cocina' || p.ptype === 'tv' ? p.ptype : p.ptype === 'vestidor' || p.layout === 'abierto' ? 'vestidor' : 'closet'));

/** Catalogue modules that can stand in for a standard one: same kind of project and same module type. */
/** Bought appliances (fridges, hoods, ranges, dishwashers…), not furniture. */
export const isAppliance = (m: Pick<ModuleDefinition, 'type' | 'appl' | 'range' | 'cat'>) => m.type === 'fridge' || m.type === 'hood' || !!m.appl || !!m.range || m.cat === 'Electro';

export function moduleChoicesFor(code: string, catalog: Record<string, ModuleDefinition>): ModuleDefinition[] {
  const std = catalog[code] ?? FALLBACK[code];
  if (!std) return [];
  return Object.values(catalog)
    // Appliances are chosen in Especificaciones → Electrodomésticos, not as furniture; sink / cooktop bases only for their role.
    .filter((m) => m.active && m.code !== code && m.type === std.type && m.projectType === std.projectType && !isAppliance(m) && (!m.sink || !!std.sink) && (!m.cook || !!std.cook))
    .sort((a, b) => a.name.localeCompare(b.name));
}
const wallLen = (w: Wall, p: ProjectData) => (w === 'A' || w === 'D' ? p.room.A : p.room.B);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function generateDesign(p: ProjectData, catalog: Record<string, ModuleDefinition>, opts: { layout?: string } = {}): GeneratedDesign {
  const layout = opts.layout ?? p.layout ?? (p.ptype === 'cocina' ? 'L' : 'lineal');
  // Per role: the project's (or organisation's) explicit choice, '-' = standard; otherwise own modules placed there.
  const chosen = ((p.prefs as { mods?: Record<string, string> }).mods ?? {}) as Record<string, string>;
  const misfit = new Map<string, Set<number>>();
  const admits = (m: ModuleDefinition, w?: number) => {
    const [lo, hi] = m.rw ?? [m.w, m.w];
    return w == null || (w >= lo - 0.5 && w <= hi + 0.5);
  };
  const candidates = (code: string): { list: ModuleDefinition[]; explicit: boolean } => {
    const pick = chosen[code];
    if (pick === '-') return { list: [], explicit: false };
    const own = pick ? catalog[pick] : undefined;
    return own?.active ? { list: [own], explicit: true } : { list: placedFor(code, catalog), explicit: false };
  };
  /** Own module for a spot only own modules fill (corner upper, over the fridge). */
  const special = (key: string) =>
    Object.values(catalog)
      .filter((m) => m.active && m.place === key && m.projectType === 'cocina' && m.type === 'upper')
      .sort((a, b) => a.name.localeCompare(b.name))[0];
  /** Placed modules that keep their own depth (the over-fridge unit is usually deeper than the uppers). */
  const keepDepth = new Set<Placed>();
  /** Template for a role; the designer's own module when it admits width `w` (else the standard one, noted once). */
  const tpl = (code: string, w?: number) => {
    const { list, explicit } = candidates(code);
    const fit = list.find((m) => admits(m, w));
    if (fit) return templateOf(fit);
    // A module placed by location that does not fit a gap falls back quietly; an explicit choice is reported.
    if (explicit && w != null) {
      const s = misfit.get(list[0]!.name) ?? new Set<number>();
      s.add(Math.round(w));
      misfit.set(list[0]!.name, s);
    }
    const def = catalog[code]?.active ? catalog[code] : FALLBACK[code];
    if (!def) throw new Error(`Falta el módulo ${code} en el catálogo`);
    return templateOf(def);
  };
  /** Standard template only: appliance shells (custom appliances, wine rack) are not the designer's furniture. */
  const std = (code: string) => {
    const def = catalog[code]?.active ? catalog[code] : FALLBACK[code];
    if (!def) throw new Error(`Falta el módulo ${code} en el catálogo`);
    return templateOf(def);
  };
  const est = ESTILOS.find((e) => e.name === p.prefs.estilo) ?? ESTILOS[0];
  // "Personalizado": the designer picked each material group in Especificaciones.
  const own = (p.prefs as { mats?: Partial<ProjectData['mats']> }).mats;
  const mats = { ...est.m, ...(p.prefs.estilo === 'Personalizado' && own ? Object.fromEntries(Object.entries(own).filter(([, v]) => typeof v === 'string' && v)) : {}) } as ProjectData['mats'];
  const dist = distOf({ ...p, layout });
  const notes: string[] = [];
  const out: Placed[] = [];
  const islands: ModuleInstance[] = [];

  const isKitchen = p.ptype === 'cocina';
  const open = p.ptype === 'vestidor' || layout === 'abierto';
  const walls = dist.walls as Wall[];
  const depth = dist.baseD;
  const fridge = isKitchen ? applOf('cocina', p.appl).refri : undefined;
  const cornerD = Math.max(depth, fridge?.on ? clamp(fridge.d, 45, 70) : 0);

  // ----- usable floor segments (corners owned by A; doors removed) -----
  const segs: Seg[] = [];
  for (const w of walls) {
    let a = 0;
    let b = wallLen(w, p);
    // Corner ownership: A owns A-B and A-C, B owns B-D, C owns C-D. B and C can end in a fridge, which is deeper.
    if ((w === 'B' || w === 'C') && walls.includes('A')) a = depth;
    if (w === 'D' && walls.includes('B')) a = cornerD;
    if (w === 'D' && walls.includes('C')) b -= cornerD;
    let parts: Seg[] = [{ wall: w, a, b }];
    for (const o of p.ops.filter((o) => o.wall === w && o.t === 'puerta')) {
      const s0 = o.pos - 5;
      const s1 = o.pos + o.w + 5;
      parts = parts.flatMap((s) => (s1 <= s.a || s0 >= s.b ? [s] : [{ ...s, b: Math.min(s.b, s0) }, { ...s, a: Math.max(s.a, s1) }].filter((x) => x.b - x.a >= 15)));
    }
    segs.push(...parts);
  }

  const free = (s: Seg) => {
    const taken = out.filter((x) => x.wall === s.wall && x.pos < s.b && x.pos + x.w > s.a).sort((x, y) => x.pos - y.pos);
    const gaps: [number, number][] = [];
    let cur = s.a;
    for (const t of taken) {
      if (t.pos > cur) gaps.push([cur, t.pos]);
      cur = Math.max(cur, t.pos + t.w);
    }
    if (s.b > cur) gaps.push([cur, s.b]);
    return gaps;
  };

  /** Places `w` cm as close as possible to `center` on `wall` (or anywhere if center is null). */
  const placeNear = (wall: Wall | null, center: number | null, w: number, t: Placed['tpl'], patch?: Placed['patch'], at?: 'start' | 'end') => {
    const cands = segs.filter((s) => !wall || s.wall === wall);
    let best: { wall: Wall; pos: number; cost: number } | null = null;
    for (const s of cands)
      for (const [g0, g1] of free(s)) {
        if (g1 - g0 < w) continue;
        let pos: number;
        if (at === 'start') pos = g0;
        else if (at === 'end') pos = g1 - w;
        else pos = center == null ? g0 : clamp(Math.round(center - w / 2), g0, g1 - w);
        const cost = at ? (at === 'start' ? g0 : -g1) : center == null ? 0 : Math.abs(pos + w / 2 - center);
        if (!best || cost < best.cost) best = { wall: s.wall, pos, cost };
      }
    if (!best) return null;
    const placed: Placed = { wall: best.wall, pos: Math.round(best.pos), w: Math.round(w), tpl: t, patch };
    out.push(placed);
    return placed;
  };

  if (isKitchen) kitchen();
  else if (p.ptype === 'tv') tv();
  else closet();

  // ----- chosen depths and heights (the TV unit sets its own) -----
  if (p.ptype !== 'tv')
    for (const o of out) {
      if (o.tpl.type === 'base') o.patch = { ...o.patch, h: o.patch?.h && o.tpl.appl ? o.patch.h : dist.baseH, d: depth };
      else if (o.tpl.type === 'tall' && isKitchen) o.patch = { ...o.patch, d: depth };
      else if (o.tpl.type === 'upper' && !keepDepth.has(o)) o.patch = { ...o.patch, d: dist.upperD };
    }
  for (const m of islands) if (isKitchen) m.h = dist.baseH;

  // ----- ids -----
  let id = 0;
  const mods: ModuleInstance[] = out
    .sort((x, y) => walls.indexOf(x.wall) - walls.indexOf(y.wall) || Number(x.tpl.type === 'upper' || x.tpl.type === 'hood') - Number(y.tpl.type === 'upper' || y.tpl.type === 'hood') || x.pos - y.pos)
    .map((x) => ({ ...structuredClone(x.tpl), ...x.patch, id: ++id, wall: x.wall, pos: x.pos, w: x.w }) as ModuleInstance);
  for (const m of islands) mods.push({ ...m, id: ++id });
  for (const [name, ws] of misfit)
    notes.push(`«${name}» no admite ${[...ws].sort((a, b) => a - b).join(', ')} cm; en ${ws.size === 1 ? 'ese hueco' : 'esos huecos'} se usó el módulo estándar.`);
  return { mods, mats, notes };

  // =====================================================================
  function kitchen() {
    const ap = applOf('cocina', p.appl);
    const zoc = zocaloCm(p.prefs.zocalo);
    let fridgeAt: Placed | null = null;
    const tallH = clamp(p.room.H - zoc - 15, 180, 240) >= 210 ? 210 : clamp(p.room.H - zoc - 15, 180, 240);
    const pt = (t: string) => p.pts.find((x) => x.t === t && walls.includes(x.wall as Wall));
    const custom = Object.entries(ap)
      .filter(([k, v]) => isCustomAppl(k) && v.on)
      .map(([, v]) => ({ name: (v.name || 'Electrodoméstico').slice(0, 60), inst: v.inst, w: clamp(Math.round(v.w), 15, 150), h: Math.round(v.h), d: Math.round(v.d), done: false }));

    // Corners first: an L-shaped corner base where A meets B (and C).
    if (walls.includes('A') && walls.includes('B')) out.push({ wall: 'A', pos: 0, w: 90, tpl: tpl('E-L', 90) });
    if (walls.includes('A') && walls.includes('C')) out.push({ wall: 'A', pos: p.room.A - 90, w: 90, tpl: tpl('E-L', 90) });

    // Sink on the water point (under the window when there is none).
    const agua = pt('agua');
    if (ap.freg?.on !== false && !agua && p.pts.some((x) => x.t === 'agua')) notes.push('La toma de agua está en un muro sin muebles; el fregadero quedará lejos de ella.');
    const win = p.ops.find((o) => o.t === 'ventana' && walls.includes(o.wall as Wall));
    const bowls = ap.freg?.opt === 2 ? 2 : 1;
    const sinkW = clamp(Math.ceil(((ap.freg?.w ?? 76) + 14) / 10) * 10, bowls === 2 ? 80 : 60, 120);
    const sinkWall = (agua?.wall as Wall) ?? (win?.wall as Wall) ?? 'A';
    const sinkAt = agua ? agua.pos : win ? win.pos + win.w / 2 : wallLen(sinkWall, p) / 2;
    // The module under the sink always gets its sink (with the bowls chosen), also the designer's own module.
    const sinkTpl = () => {
      const t = candidates('BF').list.length ? tpl('BF', sinkW) : bowls === 2 && (catalog['BF-2B']?.active || FALLBACK['BF-2B']) ? std('BF-2B') : tpl('BF', sinkW);
      return { ...t, sink: bowls };
    };
    const sink = ap.freg?.on !== false ? placeNear(sinkWall, sinkAt, sinkW, sinkTpl()) ?? placeNear(null, null, sinkW, sinkTpl()) : null;
    if (ap.freg?.on !== false && !sink) notes.push('No hubo espacio para el fregadero.');

    // Dishwasher next to the sink.
    if (ap.lava?.on && sink) {
      const w = clamp(ap.lava.w, 45, 60);
      const right = placeNear(sink.wall, sink.pos + sink.w + w / 2, w, tpl('LV-60', w));
      if (!right || right.pos !== sink.pos + sink.w) {
        if (right) out.splice(out.indexOf(right), 1);
        if (!placeNear(sink.wall, sink.pos - w / 2, w, tpl('LV-60', w))) notes.push('El lavavajillas no cupo junto al fregadero.');
      }
    }

    // Tall cluster (fridge, oven column, pantry) against the wall end farthest from the sink.
    const tallWall: Wall = walls.includes('B') ? (walls.includes('C') ? 'C' : 'B') : walls.includes('D') ? 'D' : 'A';
    const tallAt: 'start' | 'end' = tallWall === sink?.wall ? (sink.pos + sink.w / 2 > wallLen(tallWall, p) / 2 ? 'start' : 'end') : 'end';
    if (ap.refri?.on) {
      const w = clamp(ap.refri.w, 60, 90);
      const patch = { h: clamp(ap.refri.h, 170, Math.min(200, p.room.H - 10)), d: clamp(ap.refri.d, 45, 70), name: 'Refrigerador' };
      // Side-by-side fridge (2 doors) when chosen in Especificaciones.
      const twoDoor = ap.refri.opt === 2 && (catalog['RF-2P']?.active || FALLBACK['RF-2P']);
      const fr = () => (twoDoor ? { ...std('RF-2P'), rw: [60, 110] as [number, number] } : tpl('RF-75', w));
      if (twoDoor) patch.name = 'Nevera 2 puertas';
      fridgeAt = placeNear(tallWall, null, w, fr(), patch, tallAt) ?? placeNear(null, null, w, fr(), patch, 'end');
      if (!fridgeAt) notes.push('No hubo espacio para el refrigerador.');
    }

    // Cooktop on the gas point (or the hood outlet), otherwise away from the sink.
    const gas = pt('gas') ?? pt('campana');
    let cook: Placed | null = null;
    if (ap.estufa?.on) {
      const burners = ap.estufa.opt === 6 ? 6 : 4;
      // Traditional (freestanding) range: the appliance itself, its own oven, the worktop stops at its sides.
      const range = ap.estufa.inst === 'Libre' ? (burners === 6 ? 'ET-90' : 'ET-76') : null;
      const rangeDef = range && (catalog[range]?.active ? catalog[range] : FALLBACK[range]);
      const w = rangeDef ? rangeDef.w : clamp(Math.ceil((ap.estufa.w + 4) / 10) * 10, burners === 6 ? 90 : 60, burners === 6 ? 120 : 90);
      const underOven = !rangeDef && ap.horno?.on && ap.horno.inst === 'Bajo encimera';
      // The module under the cooktop always gets its burners, also the designer's own module.
      const cookTpl = () => {
        if (rangeDef) return templateOf(rangeDef);
        const t = !candidates('BP-80').list.length && burners === 6 && (catalog['BP-6H']?.active || FALLBACK['BP-6H']) ? std('BP-6H') : tpl('BP-80', w);
        return { ...t, cook: burners === 6 ? 6 : 1 };
      };
      const patch: Partial<ModuleInstance> | undefined = underOven ? { fr: [{ t: 'oven', f: 0.62 }, { t: 'drawer', f: 0.38 }], oven: 1, name: 'Bajo parrilla con horno' } : undefined;
      if (gas) cook = placeNear(gas.wall as Wall, gas.pos, w, cookTpl(), patch);
      if (!cook) {
        const other = walls.find((x) => x !== sink?.wall) ?? null;
        const far = sink ? (sink.pos + sink.w / 2 > wallLen(sink.wall, p) / 2 ? wallLen(sink.wall, p) * 0.2 : wallLen(sink.wall, p) * 0.8) : null;
        cook = (other && placeNear(other, wallLen(other, p) / 2, w, cookTpl(), patch)) || placeNear(sink?.wall ?? 'A', far, w, cookTpl(), patch);
      }
      if (!cook) notes.push(rangeDef ? 'No hubo espacio para la estufa.' : 'No hubo espacio para la parrilla.');
    }
    // Oven column next to the fridge; if it does not fit, the oven goes under the cooktop.
    if (ap.horno?.on && ap.horno.inst === 'En columna') {
      const col = placeNear(tallWall, null, 60, tpl('C-HO', 60), { h: tallH }, tallAt) ?? placeNear(null, null, 60, tpl('C-HO', 60), { h: tallH }, 'end');
      if (!col && cook && !cook.tpl.range) {
        cook.patch = { ...cook.patch, fr: [{ t: 'oven', f: 0.62 }, { t: 'drawer', f: 0.38 }], oven: 1, name: 'Bajo parrilla con horno' };
        notes.push('La columna del horno no cupo; el horno quedó bajo la parrilla.');
      } else if (!col) notes.push('No hubo espacio para la columna del horno.');
    }
    if (ap.micro?.on && ap.micro.inst === 'En columna' && !placeNear(tallWall, null, 60, tpl('C-DE', 60), { h: tallH, name: 'Columna microondas' }, tallAt)) notes.push('No hubo espacio para la columna del microondas.');
    if (ap.cava?.on) placeNear(null, null, clamp(ap.cava.w, 15, 30), std('BB-22'), { name: 'Cava de vinos', appl: 1 });

    // Custom appliances, by installation: under the counter, in a column, free-standing (hanging ones go with the uppers).
    for (const c of custom) {
      let placed: Placed | null = null;
      if (c.inst === 'Bajo encimera' || c.inst === 'Empotrado') placed = placeNear(null, null, c.w, std('LV-60'), { name: c.name, rw: [c.w, c.w] });
      else if (c.inst === 'En columna') placed = placeNear(tallWall, null, c.w, std('C-DE'), { name: c.name, h: tallH, rw: [c.w, c.w] }, tallAt) ?? placeNear(null, null, c.w, std('C-DE'), { name: c.name, h: tallH, rw: [c.w, c.w] });
      else if (c.inst === 'Libre') {
        const patch = { name: c.name, h: clamp(c.h, 30, p.room.H - 10), d: clamp(c.d, 20, 90), rw: [c.w, c.w] as [number, number] };
        placed = placeNear(tallWall, null, c.w, std('RF-75'), patch, tallAt) ?? placeNear(null, null, c.w, std('RF-75'), patch);
      } else continue;
      if (!placed) notes.push(`No hubo espacio para ${c.name}.`);
    }

    // Hood centred over the cooktop.
    if (ap.campana?.on && cook) {
      const w = clamp(ap.campana.w, 60, 90);
      out.push({ wall: cook.wall, pos: Math.round(cook.pos + cook.w / 2 - w / 2), w, tpl: tpl('CM-80', w) });
    }

    // Fill the rest of every floor segment with base units.
    for (const s of segs)
      for (const [g0, g1] of free(s).filter(([a, b]) => b - a >= 15)) fillBases(s.wall, g0, g1, cook);
    absorbSmallGaps();

    // Uppers over the base runs, skipping windows, tall units and the hood.
    const upperH = Math.min(cmOf(p.prefs.alacena, 70), Math.max(35, p.room.H - 150 - 5));
    const hanging = custom.filter((c) => c.inst === 'Colgado');
    const cornerUp = special('esquina-alta');
    for (const w of walls) {
      const floor = out.filter((o) => o.wall === w && o.tpl.type === 'base').sort((a, b) => a.pos - b.pos);
      if (!floor.length) continue;
      let a = Math.min(...floor.map((f) => f.pos));
      let b = Math.max(...floor.map((f) => f.pos + f.w));
      if ((w === 'B' || w === 'C') && walls.includes('A')) a = Math.max(a, dist.upperD);
      if (w === 'D' && walls.includes('B')) a = Math.max(a, dist.upperD);
      if (w === 'D' && walls.includes('C')) b = Math.min(b, wallLen('D', p) - dist.upperD);
      const blocks: [number, number][] = [
        ...out.filter((o) => o.wall === w && (o.tpl.type === 'tall' || o.tpl.type === 'fridge' || o.tpl.type === 'hood')).map((o) => [o.pos, o.pos + o.w] as [number, number]),
        ...p.ops.filter((o) => o.wall === w).map((o) => [o.pos - 3, o.pos + o.w + 3] as [number, number]),
      ].sort((x, y) => x[0] - y[0]);
      let cur = a;
      const runs: [number, number][] = [];
      for (const [x0, x1] of blocks) {
        if (x1 <= cur) continue;
        if (x0 > cur) runs.push([cur, Math.min(x0, b)]);
        cur = Math.max(cur, x1);
      }
      if (b > cur) runs.push([cur, b]);
      for (let [r0, r1] of runs) {
        // "Montaje alto esquina": the designer's corner upper where wall A meets B (and C).
        if (cornerUp && w === 'A') {
          const [lo, hi] = cornerUp.rw ?? [cornerUp.w, cornerUp.w];
          const cw = clamp(cornerUp.w, lo, hi);
          if (walls.includes('B') && r0 <= 0.5 && r1 - r0 >= cw) {
            out.push({ wall: 'A', pos: 0, w: cw, tpl: templateOf(cornerUp), patch: { h: upperH } });
            r0 += cw;
          }
          if (walls.includes('C') && r1 >= p.room.A - 0.5 && r1 - r0 >= cw) {
            out.push({ wall: 'A', pos: Math.round(r1 - cw), w: cw, tpl: templateOf(cornerUp), patch: { h: upperH } });
            r1 -= cw;
          }
        }
        // Custom hanging appliances (e.g. a wall microwave) take the first upper slot where they fit.
        for (const c of hanging.filter((x) => !x.done && r1 - r0 >= x.w)) {
          out.push({ wall: w, pos: Math.round(r0), w: c.w, tpl: std('A-1P'), patch: { name: c.name, appl: 1, h: clamp(c.h, 20, upperH), rw: [c.w, c.w], fr: [{ t: 'door', n: 1, f: 1 }] } });
          r0 += c.w;
          c.done = true;
        }
        fillUppers(w, r0, r1, upperH);
      }
      for (const c of hanging.filter((x) => !x.done)) notes.push(`No hubo espacio en las alacenas para ${c.name}.`);
    }

    // "Sobre nevera": the designer's upper over the fridge, from just above it up to the uppers' top line.
    const overFridge = special('sobre-nevera');
    if (overFridge && fridgeAt) {
      const fh = fridgeAt.patch?.h ?? fridgeAt.tpl.h;
      const z = Math.round(fh + 2);
      const top = Math.min(p.room.H - 2, Math.max(150 + upperH, z + 20));
      const h = Math.round(Math.min(overFridge.h, top - z));
      if (!admits(overFridge, fridgeAt.w)) notes.push(`«${overFridge.name}» no admite ${fridgeAt.w} cm (el ancho del refrigerador); no se colocó sobre la nevera.`);
      else if (h < 20) notes.push(`No queda altura para «${overFridge.name}» sobre la nevera (techo de ${p.room.H} cm).`);
      else {
        const placed: Placed = { wall: fridgeAt.wall, pos: fridgeAt.pos, w: fridgeAt.w, tpl: templateOf(overFridge), patch: { z, h } };
        out.push(placed);
        keepDepth.add(placed);
      }
    }

    // Island / peninsula.
    if (dist.island.on) {
      const aisle = dist.aisle;
      const iw = dist.island.w ?? clamp(Math.round((p.room.A * (layout === 'peninsula' ? 0.4 : 0.35)) / 10) * 10, 90, 180);
      const idp = dist.island.d;
      const t = tpl('IS-120', iw);
      if (layout === 'isla') {
        // Work aisle in front of the wall runs, at least 60 cm walkway behind the island.
        // Aisle in front of every furnished wall, at least 60 cm walkway on the free sides.
        const front = (walls.includes('A') ? depth : 0) + aisle;
        const backLimit = p.room.B - (walls.includes('D') ? depth + aisle : 60);
        const x0 = walls.includes('B') ? depth + aisle : 60;
        const x1 = p.room.A - (walls.includes('C') ? depth + aisle : 60);
        const y = Math.max(front, Math.round((front + backLimit - idp) / 2));
        const w = Math.min(iw, x1 - x0);
        if (w >= 60 && y + idp <= backLimit) {
          islands.push({ ...structuredClone(t), wall: 'F', x: x0 + Math.round((x1 - x0 - w) / 2), y, w, d: idp, rw: [Math.min(60, w), Math.max(w, 180)], id: 0 } as ModuleInstance);
          if (w < iw) notes.push(`La isla se redujo a ${w} cm para dejar los pasillos de ${aisle} cm.`);
        } else notes.push(`La habitación es muy pequeña para una isla (pasillos de ${aisle} cm frente a los muebles y 60 cm en los lados libres).`);
      } else {
        const y = Math.round(p.room.B - idp - aisle);
        if (y > depth + 60) islands.push({ ...structuredClone(t), name: 'Península cajonera', wall: 'F', x: depth, y, w: iw, d: idp, rw: [Math.min(60, iw), Math.max(iw, 180)], id: 0 } as ModuleInstance);
        else notes.push('No cupo la península; quedó como cocina en L.');
      }
    }
  }

  function fillBases(wall: Wall, g0: number, g1: number, cook: Placed | null) {
    let len = g1 - g0;
    let pos = g0;
    const next = (code: string, w: number) => {
      out.push({ wall, pos: Math.round(pos), w: Math.round(w), tpl: tpl(code, Math.round(w)) });
      pos += Math.round(w);
      len -= Math.round(w);
    };
    // A drawer unit next to the cooktop when there is room.
    const nearCook = cook && cook.wall === wall && (Math.abs(g1 - cook.pos) < 1 || Math.abs(g0 - (cook.pos + cook.w)) < 1);
    if (nearCook && len >= 120) {
      if (Math.abs(g1 - (cook?.pos ?? -1)) < 1) {
        const w = 60;
        out.push({ wall, pos: Math.round(g1 - w), w, tpl: tpl('BC-3', w) });
        len -= w;
      } else next('BC-3', 60);
    }
    while (len >= 15) {
      if (len <= 30) next('BB-22', len);
      else if (len <= 60) next('B-1P', len);
      else if (len <= 120) next('B-2P', len);
      else {
        const n = Math.ceil(len / 100);
        const w = Math.max(60, Math.floor(len / n));
        next('B-2P', len - w * (n - 1) <= 120 ? w : 100);
      }
    }
  }

  function fillUppers(wall: Wall, r0: number, r1: number, h: number) {
    let len = r1 - r0;
    let pos = r0;
    const next = (code: string, w: number) => {
      out.push({ wall, pos: Math.round(pos), w: Math.round(w), tpl: tpl(code, Math.round(w)), patch: { h } });
      pos += Math.round(w);
      len -= Math.round(w);
    };
    while (len >= 30) {
      if (len <= 60) next('A-1P', len);
      else if (len <= 120) next('A-2P', len);
      else {
        const n = Math.ceil(len / 100);
        next('A-2P', Math.max(60, Math.floor(len / n)));
      }
    }
  }

  /** Floor gaps under 15 cm: widen the neighbouring base unit when its range allows it. */
  function absorbSmallGaps() {
    for (const s of segs)
      for (const [g0, g1] of free(s)) {
        const gap = g1 - g0;
        if (gap <= 0 || gap >= 15) continue;
        const floor = (o: Placed) => o.wall === s.wall && o.tpl.type !== 'upper' && o.tpl.type !== 'hood';
        const prev = out.find((o) => floor(o) && Math.abs(o.pos + o.w - g0) < 0.5);
        const next = out.find((o) => floor(o) && Math.abs(o.pos - g1) < 0.5);
        const fits = (o?: Placed) => !!o && o.tpl.type === 'base' && !o.tpl.appl && o.w + gap <= (o.tpl.rw?.[1] ?? o.w);
        if (fits(prev)) prev!.w += gap;
        else if (fits(next)) {
          next!.pos -= gap;
          next!.w += gap;
        }
      }
  }

  // =====================================================================
  /**
   * Mueble de TV on the first furnished wall: side towers at the ends, the console between them, the panel behind the
   * screen (sized from the TV's inches, its centre at the chosen height), floating shelves beside it and an upper
   * cabinet over everything.
   */
  function tv() {
    const t = tvOf(p.tv);
    const zoc = zocaloCm(p.prefs.zocalo);
    const wall = (walls[0] ?? 'A') as Wall;
    const seg = segs.filter((s) => s.wall === wall).sort((x, y) => y.b - y.a - (x.b - x.a))[0];
    if (!seg) {
      notes.push('No hay un muro libre para el mueble de TV.');
      return;
    }
    const screen = tvSize(clamp(t.pulgadas, 24, 120));
    const L = seg.b - seg.a;
    const towerT = tpl('TV-TOR', 40);
    const towerW = clamp(40, towerT.rw?.[0] ?? 40, towerT.rw?.[1] ?? 40);
    const asked = clamp(Math.round(t.torres), 0, 2);
    let towers = asked;
    // Towers only while the console between them still takes the screen.
    while (towers > 0 && L - towers * towerW < Math.max(100, screen.w + 20)) towers--;
    if (towers < asked) notes.push(`El muro es corto para ${asked} torre${asked === 1 ? '' : 's'}; quedaron ${towers}.`);
    const towerH = Math.round(clamp(p.room.H - zoc - 30, 150, 220));
    let in0 = seg.a;
    let in1 = seg.b;
    if (towers >= 1) {
      out.push({ wall, pos: Math.round(seg.a), w: towerW, tpl: towerT, patch: { h: towerH, d: towerT.d } });
      in0 += towerW;
    }
    if (towers === 2) {
      out.push({ wall, pos: Math.round(seg.b - towerW), w: towerW, tpl: towerT, patch: { h: towerH, d: towerT.d, open: 'izq' } });
      in1 -= towerW;
    }
    const inner = in1 - in0;
    const conStd = tpl('TV-CON');
    const [clo, chi] = conStd.rw ?? [80, 320];
    const cw = Math.round(Math.min(chi, towers ? inner : clamp(Math.max(screen.w + 40, 150), clo, inner)));
    if (cw < clo) {
      notes.push('No cabe la consola en ese muro.');
      return;
    }
    const c0 = Math.round(in0 + (inner - cw) / 2);
    const conT = tpl('TV-CON', cw);
    out.push({ wall, pos: c0, w: cw, tpl: conT, patch: { d: depth } });
    const conTop = zoc + conT.h;
    const cx = c0 + cw / 2;
    // Screen: centred at the chosen height, at least 10 cm over the console.
    const tvBottom = Math.max(conTop + 10, t.centro - screen.h / 2);
    const tvTop = tvBottom + screen.h;
    if (tvTop > p.room.H - 10) notes.push(`Una TV de ${t.pulgadas} pulgadas a esa altura llega casi al techo; baja la altura del centro.`);
    if (screen.w > cw) notes.push(`La TV de ${t.pulgadas} pulgadas (${screen.w} cm) es más ancha que la consola (${cw} cm).`);

    let side = screen.w + 20;
    let panelTop = tvTop;
    if (t.panel) {
      const panStd = tpl('TV-PAN');
      const pw = Math.round(clamp(screen.w + 60, panStd.rw?.[0] ?? 60, cw));
      const pz = conTop + 3;
      const ph = Math.round(clamp(tvTop + 15 - pz, 60, p.room.H - pz - 5));
      const panT = tpl('TV-PAN', pw);
      out.push({ wall, pos: Math.round(cx - pw / 2), w: pw, tpl: panT, patch: { z: pz, h: ph } });
      side = pw;
      panelTop = pz + ph;
    }
    let ceiling = p.room.H - 5;
    if (t.alacena) {
      const altT = tpl('TV-ALT', cw);
      const z = Math.round(Math.max(panelTop, tvTop + 10) + 5);
      if (z + altT.h <= p.room.H - 2) {
        out.push({ wall, pos: c0, w: cw, tpl: altT, patch: { z } });
        ceiling = z;
      } else notes.push('No queda altura para la alacena superior sobre la TV.');
    }

    const want = clamp(Math.round(t.repisas), 0, 8);
    if (want) {
      const repStd = tpl('TV-REP');
      const [rlo, rhi] = repStd.rw ?? [30, 150];
      const zones = (
        [
          [c0, cx - side / 2 - 5],
          [cx + side / 2 + 5, c0 + cw],
        ] as [number, number][]
      ).filter(([a, b]) => b - a >= rlo + 10);
      const levels: number[] = [];
      for (let z = conTop + 35; z + repStd.h <= ceiling - 25; z += 35) levels.push(z);
      let placed = 0;
      for (const z of levels)
        for (const [a, b] of zones) {
          if (placed >= want) break;
          const sw = Math.round(clamp(b - a - 10, rlo, rhi));
          out.push({ wall, pos: Math.round((a + b) / 2 - sw / 2), w: sw, tpl: tpl('TV-REP', sw), patch: { z: Math.round(z) } });
          placed++;
        }
      if (placed < want)
        notes.push(placed ? `Solo cupieron ${placed} de ${want} repisas junto a la TV.` : 'No hay espacio junto a la TV para repisas: la TV o el panel ocupan casi toda la consola.');
    }
  }

  // =====================================================================
  function closet() {
    const c = closetOf(p.closet);
    const zoc = zocaloCm(p.prefs.zocalo);
    const h = clamp(p.room.H - zoc - 10, 180, 240) >= 230 ? 230 : clamp(p.room.H - zoc - 10, 180, 240);
    const code = open
      ? { largo: 'VL-100', corto: 'VC-100', caj: 'VC-100', zap: 'VZ-80', ent: 'VE-80' }
      : { largo: 'CL-100', corto: 'CC-100', caj: 'CJ-100', zap: 'ZP-60', ent: 'CL-E' };
    const want: { code: string; w: number }[] = [];
    for (let i = 0; i < Math.round(c.largo); i++) want.push({ code: code.largo, w: 100 });
    for (let i = 0; i < c.cajoneras; i++) want.push({ code: code.caj, w: 100 });
    for (let i = 0; i < Math.max(0, Math.round(c.corto) - c.cajoneras); i++) want.push({ code: code.corto, w: 100 });
    for (let i = 0; i < Math.ceil(c.zapatos / 24); i++) want.push({ code: code.zap, w: open ? 80 : 60 });

    let skipped = 0;
    for (const item of want) {
      const t = tpl(item.code, item.w);
      const [lo] = t.rw ?? [item.w, item.w];
      let placed = placeNear(null, null, item.w, t, { h, d: depth });
      if (!placed) {
        // Shrink to whatever space is left, within the module's range.
        const gaps = segs.flatMap((s) => free(s).map(([a, b]) => ({ s, len: b - a })));
        const g = gaps.filter((x) => x.len >= lo).sort((x, y) => y.len - x.len)[0];
        if (g) placed = placeNear(g.s.wall, null, Math.min(item.w, g.len), t, { h, d: depth });
      }
      if (!placed) skipped++;
    }
    if (skipped) notes.push(`No cupieron ${skipped} módulo(s) de lo que pediste; se llenó el espacio disponible.`);

    // Remaining space: open shelving (or widen the previous module when the gap is small).
    for (const s of segs)
      for (const [g0, g1] of free(s)) {
        let pos = g0;
        let len = g1 - g0;
        while (len >= 40) {
          const w = len <= 100 ? len : Math.min(100, Math.max(40, len - 40));
          out.push({ wall: s.wall, pos: Math.round(pos), w: Math.round(w), tpl: tpl(code.ent, Math.round(w)), patch: { h, d: depth } });
          pos += Math.round(w);
          len -= Math.round(w);
        }
        if (len > 0) {
          const prev = out.find((o) => o.wall === s.wall && Math.abs(o.pos + o.w - pos) < 1);
          const max = prev?.tpl.rw?.[1] ?? 0;
          if (prev && prev.w + len <= max) prev.w += Math.round(len);
        }
      }

    if (dist.island.on) {
      const t = tpl('IC-100', dist.island.w ?? 100);
      const w = dist.island.w ?? 100;
      const d = dist.island.d;
      const fits = p.room.A - 2 * (depth + 60) >= w && p.room.B - (walls.includes('A') ? depth + 60 : 60) - 60 >= d;
      if (fits) islands.push({ ...structuredClone(t), wall: 'F', x: Math.round((p.room.A - w) / 2), y: Math.round(p.room.B / 2 - d / 2 + (walls.includes('A') ? depth / 2 : 0)), w, d, rw: [Math.min(60, w), Math.max(w, 150)], id: 0 } as ModuleInstance);
      else notes.push('No cupo la isla cajonera con pasillos de 60 cm.');
    }
  }
}
