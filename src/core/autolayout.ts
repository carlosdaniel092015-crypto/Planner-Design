// Automatic layout ("Generar distribución"). The prototype always returned a fixed template; this places real
// modules from the organisation's catalogue using the room size, doors, windows, installation points, chosen
// appliances and preferences. Pure and deterministic: same input → same modules.
import { DEFAULT_MODULES } from './catalog';
import { templateOf } from './editing';
import { zocaloCm } from './geometry';
import type { ModuleInstance, ProjectData } from './schema';
import { applOf, closetOf, ESTILOS } from './spec';
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
const wallLen = (w: Wall, p: ProjectData) => (w === 'A' || w === 'D' ? p.room.A : p.room.B);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function generateDesign(p: ProjectData, catalog: Record<string, ModuleDefinition>, opts: { layout?: string } = {}): GeneratedDesign {
  const layout = opts.layout ?? p.layout ?? (p.ptype === 'cocina' ? 'L' : 'lineal');
  const tpl = (code: string) => {
    const def = catalog[code]?.active ? catalog[code] : FALLBACK[code];
    if (!def) throw new Error(`Falta el módulo ${code} en el catálogo`);
    return templateOf(def);
  };
  const est = ESTILOS.find((e) => e.name === p.prefs.estilo) ?? ESTILOS[0];
  const mats = { ...est.m };
  const notes: string[] = [];
  const out: Placed[] = [];
  const islands: ModuleInstance[] = [];

  const isKitchen = p.ptype === 'cocina';
  const open = p.ptype === 'vestidor' || layout === 'abierto';
  const walls: Wall[] =
    layout === 'lineal' ? ['A'] : layout === 'U' ? ['A', 'B', 'C'] : layout === 'paralela' ? ['A', 'D'] : ['A', 'B'];
  const depth = isKitchen ? 60 : open ? 55 : 60;

  // ----- usable floor segments (corners owned by A; doors removed) -----
  const segs: Seg[] = [];
  for (const w of walls) {
    let a = 0;
    let b = wallLen(w, p);
    if ((w === 'B' && walls.includes('A')) || (w === 'C' && walls.includes('A'))) a = depth;
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
  else closet();

  // ----- ids -----
  let id = 0;
  const mods: ModuleInstance[] = out
    .sort((x, y) => walls.indexOf(x.wall) - walls.indexOf(y.wall) || Number(x.tpl.type === 'upper' || x.tpl.type === 'hood') - Number(y.tpl.type === 'upper' || y.tpl.type === 'hood') || x.pos - y.pos)
    .map((x) => ({ ...structuredClone(x.tpl), ...x.patch, id: ++id, wall: x.wall, pos: x.pos, w: x.w }) as ModuleInstance);
  for (const m of islands) mods.push({ ...m, id: ++id });
  return { mods, mats, notes };

  // =====================================================================
  function kitchen() {
    const ap = applOf('cocina', p.appl);
    const zoc = zocaloCm(p.prefs.zocalo);
    const tallH = clamp(p.room.H - zoc - 15, 180, 240) >= 210 ? 210 : clamp(p.room.H - zoc - 15, 180, 240);
    const pt = (t: string) => p.pts.find((x) => x.t === t && walls.includes(x.wall as Wall));

    // Corners first: an L-shaped corner base where A meets B (and C).
    if (walls.includes('B')) out.push({ wall: 'A', pos: 0, w: 90, tpl: tpl('E-L') });
    if (walls.includes('C')) out.push({ wall: 'A', pos: p.room.A - 90, w: 90, tpl: tpl('E-L') });

    // Sink on the water point (under the window when there is none).
    const agua = pt('agua');
    const win = p.ops.find((o) => o.t === 'ventana' && walls.includes(o.wall as Wall));
    const sinkW = clamp(Math.ceil(((ap.freg?.w ?? 76) + 14) / 10) * 10, 60, 120);
    const sinkWall = (agua?.wall as Wall) ?? (win?.wall as Wall) ?? 'A';
    const sinkAt = agua ? agua.pos : win ? win.pos + win.w / 2 : wallLen(sinkWall, p) / 2;
    const sink = ap.freg?.on !== false ? placeNear(sinkWall, sinkAt, sinkW, tpl('BF')) ?? placeNear(null, null, sinkW, tpl('BF')) : null;
    if (ap.freg?.on !== false && !sink) notes.push('No hubo espacio para el fregadero.');

    // Dishwasher next to the sink.
    if (ap.lava?.on && sink) {
      const w = clamp(ap.lava.w, 45, 60);
      const right = placeNear(sink.wall, sink.pos + sink.w + w / 2, w, tpl('LV-60'));
      if (!right || right.pos !== sink.pos + sink.w) {
        if (right) out.splice(out.indexOf(right), 1);
        if (!placeNear(sink.wall, sink.pos - w / 2, w, tpl('LV-60'))) notes.push('El lavavajillas no cupo junto al fregadero.');
      }
    }

    // Tall cluster (fridge, oven column, pantry) against the wall end farthest from the sink.
    const tallWall: Wall = walls.includes('B') ? (walls.includes('C') ? 'C' : 'B') : walls.includes('D') ? 'D' : 'A';
    const tallAt: 'start' | 'end' = tallWall === sink?.wall ? (sink.pos + sink.w / 2 > wallLen(tallWall, p) / 2 ? 'start' : 'end') : 'end';
    if (ap.refri?.on) {
      const w = clamp(ap.refri.w, 60, 90);
      const patch = { h: clamp(ap.refri.h, 170, Math.min(200, p.room.H - 10)), d: clamp(ap.refri.d, 45, 70), name: 'Refrigerador' };
      if (!placeNear(tallWall, null, w, tpl('RF-75'), patch, tallAt) && !placeNear(null, null, w, tpl('RF-75'), patch, 'end')) notes.push('No hubo espacio para el refrigerador.');
    }

    // Cooktop on the gas point (or the hood outlet), otherwise away from the sink.
    const gas = pt('gas') ?? pt('campana');
    let cook: Placed | null = null;
    if (ap.estufa?.on) {
      const w = clamp(Math.ceil((ap.estufa.w + 4) / 10) * 10, 60, 90);
      const underOven = ap.horno?.on && ap.horno.inst === 'Bajo encimera';
      const patch: Partial<ModuleInstance> | undefined = underOven ? { fr: [{ t: 'oven', f: 0.62 }, { t: 'drawer', f: 0.38 }], oven: 1, name: 'Bajo parrilla con horno' } : undefined;
      if (gas) cook = placeNear(gas.wall as Wall, gas.pos, w, tpl('BP-80'), patch);
      if (!cook) {
        const other = walls.find((x) => x !== sink?.wall) ?? null;
        const far = sink ? (sink.pos + sink.w / 2 > wallLen(sink.wall, p) / 2 ? wallLen(sink.wall, p) * 0.2 : wallLen(sink.wall, p) * 0.8) : null;
        cook = (other && placeNear(other, wallLen(other, p) / 2, w, tpl('BP-80'), patch)) || placeNear(sink?.wall ?? 'A', far, w, tpl('BP-80'), patch);
      }
      if (!cook) notes.push('No hubo espacio para la parrilla.');
    }
    // Oven column next to the fridge; if it does not fit, the oven goes under the cooktop.
    if (ap.horno?.on && ap.horno.inst === 'En columna') {
      const col = placeNear(tallWall, null, 60, tpl('C-HO'), { h: tallH }, tallAt) ?? placeNear(null, null, 60, tpl('C-HO'), { h: tallH }, 'end');
      if (!col && cook) {
        cook.patch = { ...cook.patch, fr: [{ t: 'oven', f: 0.62 }, { t: 'drawer', f: 0.38 }], oven: 1, name: 'Bajo parrilla con horno' };
        notes.push('La columna del horno no cupo; el horno quedó bajo la parrilla.');
      } else if (!col) notes.push('No hubo espacio para la columna del horno.');
    }
    if (ap.micro?.on && ap.micro.inst === 'En columna' && !placeNear(tallWall, null, 60, tpl('C-DE'), { h: tallH, name: 'Columna microondas' }, tallAt)) notes.push('No hubo espacio para la columna del microondas.');
    if (ap.cava?.on) placeNear(null, null, clamp(ap.cava.w, 15, 30), tpl('BB-22'), { name: 'Cava de vinos', appl: 1 });

    // Hood centred over the cooktop.
    if (ap.campana?.on && cook) {
      const w = clamp(ap.campana.w, 60, 90);
      out.push({ wall: cook.wall, pos: Math.round(cook.pos + cook.w / 2 - w / 2), w, tpl: tpl('CM-80') });
    }

    // Fill the rest of every floor segment with base units.
    for (const s of segs)
      for (const [g0, g1] of free(s).filter(([a, b]) => b - a >= 15)) fillBases(s.wall, g0, g1, cook);
    absorbSmallGaps();

    // Uppers over the base runs, skipping windows, tall units and the hood.
    // Any height the user typed ("80 cm"); 70 cm when missing.
    const uh = parseFloat(p.prefs.alacena ?? '') || 70;
    const upperH = Math.min(uh, Math.max(35, p.room.H - 150 - 5));
    for (const w of walls) {
      const floor = out.filter((o) => o.wall === w && o.tpl.type === 'base').sort((a, b) => a.pos - b.pos);
      if (!floor.length) continue;
      let a = Math.min(...floor.map((f) => f.pos));
      const b = Math.max(...floor.map((f) => f.pos + f.w));
      if ((w === 'B' || w === 'C') && walls.includes('A')) a = Math.max(a, 35);
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
      for (const [r0, r1] of runs) fillUppers(w, r0, r1, upperH);
    }

    // Island / peninsula.
    if (layout === 'isla' || layout === 'peninsula') {
      const aisle = 90;
      const iw = clamp(Math.round((p.room.A * (layout === 'isla' ? 0.35 : 0.4)) / 10) * 10, 90, 180);
      const idp = 70;
      const t = tpl('IS-120');
      if (layout === 'isla') {
        // Work aisle in front of the wall runs, at least 60 cm walkway behind the island.
        const y = Math.max(depth + aisle + 5, Math.round(p.room.B / 2 - 20));
        const x0 = walls.includes('B') ? depth + aisle : 60;
        const maxW = Math.min(180, p.room.A - x0 - 60);
        if (maxW >= 90 && p.room.B - (y + idp) >= 60) {
          const w = clamp(iw, 90, maxW);
          islands.push({ ...structuredClone(t), wall: 'F', x: x0 + Math.round((p.room.A - x0 - 60 - w) / 2), y, w, d: idp, id: 0 } as ModuleInstance);
        } else notes.push(`La habitación es muy pequeña para una isla (pasillos de ${aisle} cm frente a los muebles y 60 cm detrás).`);
      } else {
        const y = Math.round(p.room.B - idp - aisle);
        if (y > depth + 60) islands.push({ ...structuredClone(t), name: 'Península cajonera', wall: 'F', x: depth, y, w: iw, d: idp, id: 0 } as ModuleInstance);
        else notes.push('No cupo la península; quedó como cocina en L.');
      }
    }
  }

  function fillBases(wall: Wall, g0: number, g1: number, cook: Placed | null) {
    let len = g1 - g0;
    let pos = g0;
    const next = (code: string, w: number) => {
      out.push({ wall, pos: Math.round(pos), w: Math.round(w), tpl: tpl(code) });
      pos += Math.round(w);
      len -= Math.round(w);
    };
    // A drawer unit next to the cooktop when there is room.
    const nearCook = cook && cook.wall === wall && (Math.abs(g1 - cook.pos) < 1 || Math.abs(g0 - (cook.pos + cook.w)) < 1);
    if (nearCook && len >= 120) {
      if (Math.abs(g1 - (cook?.pos ?? -1)) < 1) {
        const w = 60;
        out.push({ wall, pos: Math.round(g1 - w), w, tpl: tpl('BC-3') });
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
      out.push({ wall, pos: Math.round(pos), w: Math.round(w), tpl: tpl(code), patch: { h } });
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
      const t = tpl(item.code);
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
          out.push({ wall: s.wall, pos: Math.round(pos), w: Math.round(w), tpl: tpl(code.ent), patch: { h, d: depth } });
          pos += Math.round(w);
          len -= Math.round(w);
        }
        if (len > 0) {
          const prev = out.find((o) => o.wall === s.wall && Math.abs(o.pos + o.w - pos) < 1);
          const max = prev?.tpl.rw?.[1] ?? 0;
          if (prev && prev.w + len <= max) prev.w += Math.round(len);
        }
      }

    if (open && p.room.A >= 240 && p.room.B >= 240) {
      const t = tpl('IC-100');
      islands.push({ ...structuredClone(t), wall: 'F', x: Math.round((p.room.A - 100) / 2), y: Math.round(p.room.B / 2 - 10), w: 100, d: 55, id: 0 } as ModuleInstance);
    }
  }
}
