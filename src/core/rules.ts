// Design validation. The first block is the prototype's validate() ported 1:1 (same texts);
// the second adds structural checks the server needs. Any `err` blocks approval.
import { ranges } from './editing';
import { geo, isFloor, wallPt, zocaloCm, zr } from './geometry';
import type { ModuleInstance, ProjectData } from './schema';
import type { PricingContext, ValidationIssue } from './types';

export function validateProject(s: ProjectData, ctx?: PricingContext): ValidationIssue[] {
  const mods = s.mods;
  const out: ValidationIssue[] = [];
  const center = (m: ModuleInstance) => {
    const g = geo(m, s.room);
    return [(g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2] as const;
  };
  const ptXY = (p: ProjectData['pts'][number]) => wallPt(p.wall, p.pos, 0, s.room.A, s.room.B);
  const sink = mods.find((m) => m.sink);
  const cook = mods.find((m) => m.cook);
  const fridge = mods.find((m) => m.type === 'fridge');
  const hood = mods.find((m) => m.type === 'hood');
  const oven = mods.find((m) => m.oven);
  const lv = mods.find((m) => m.code?.startsWith('LV'));

  if (sink) {
    const ws = s.pts.filter((p) => p.t === 'agua');
    if (ws.length) {
      const c = center(sink);
      const dist = Math.min(
        ...ws.map((p) => (p.wall === sink.wall ? Math.abs(p.pos - ((sink.pos ?? 0) + sink.w / 2)) : Math.hypot(ptXY(p)[0] - c[0], ptXY(p)[1] - c[1]))),
      );
      const dd = Math.round(dist);
      out.push(
        dd > 60
          ? { st: 'err', code: 'AGUA_LEJOS', text: `El fregadero (módulo ${sink.id}) está a ${dd} cm de la toma de agua (máx. 60 cm)`, id: sink.id }
          : { st: 'ok', code: 'AGUA_LEJOS', text: `Fregadero a ${dd} cm de la toma de agua`, id: sink.id },
      );
    } else out.push({ st: 'err', code: 'SIN_TOMA_AGUA', text: 'No hay toma de agua definida para el fregadero' });
  }

  // Corner ownership: A takes the A–B and A–C corners, B the B–D corner and C the C–D corner.
  const floorAt = (w: string, at: 'start' | 'end', len: number) =>
    mods.find((m) => m.wall === w && isFloor(m) && (at === 'start' ? m.pos === 0 : Math.abs((m.pos ?? 0) + m.w - len) < 0.5));
  const aCorner = floorAt('A', 'start', s.room.A);
  const aCornerC = floorAt('A', 'end', s.room.A);
  const bCornerD = floorAt('B', 'end', s.room.B);
  const cCornerD = floorAt('C', 'end', s.room.B);
  for (const [w, len, start] of [
    ['A', s.room.A, 0],
    ['B', s.room.B, aCorner ? aCorner.d : 0],
    ['C', s.room.B, aCornerC ? aCornerC.d : 0],
    ['D', s.room.A - (cCornerD ? cCornerD.d : 0), bCornerD ? bCornerD.d : 0],
  ] as const) {
    const list = mods.filter((m) => m.wall === w && isFloor(m)).sort((a, b) => a.pos! - b.pos!);
    if (!list.length) continue;
    let cur: number = start;
    let prev: ModuleInstance | null = null;
    for (const m of list) {
      const gap = Math.round(m.pos! - cur);
      if (gap > 0 && gap < 15)
        out.push({
          st: 'warn',
          code: 'RELLENO',
          text: prev ? `Espacio sobrante de ${gap} cm entre módulos ${prev.id} y ${m.id} — agregar relleno` : `Espacio sobrante de ${gap} cm al inicio del muro ${w} — agregar relleno`,
          id: m.id,
        });
      if (gap < 0) out.push({ st: 'err', code: 'TRASLAPE', text: `Los módulos ${prev ? prev.id : ''} y ${m.id} se traslapan ${-gap} cm`, id: m.id });
      cur = Math.max(cur, m.pos! + m.w);
      prev = m;
    }
    const end = Math.round(len - cur);
    if (end < 0) out.push({ st: 'err', code: 'EXCEDE_MURO', text: `Los módulos del muro ${w} exceden su longitud por ${-end} cm`, id: prev!.id });
    else if (end > 0 && end < 15)
      out.push({ st: 'warn', code: 'RELLENO', text: `Espacio sobrante de ${end} cm entre el módulo ${prev!.id} y el muro ${w} — agregar relleno`, id: prev!.id });
    else if (end === 0) out.push({ st: 'ok', code: 'MURO_AJUSTADO', text: `Muro ${w}: módulos ajustados a la longitud (${len * 10} mm)` });
  }

  if (sink && cook && fridge) {
    const a = center(sink);
    const b = center(cook);
    const c = center(fridge);
    const t = (Math.hypot(a[0] - b[0], a[1] - b[1]) + Math.hypot(b[0] - c[0], b[1] - c[1]) + Math.hypot(c[0] - a[0], c[1] - a[1])) / 100;
    const ok = t >= 4 && t <= 7.9;
    out.push({
      st: ok ? 'ok' : 'warn',
      code: 'TRIANGULO',
      text: `Triángulo de trabajo: ${t.toFixed(1).replace('.', ',')} m ${ok ? '(recomendado 4–7,9 m)' : '— fuera del rango recomendado 4–7,9 m'}`,
    });
  }
  if (hood && cook) {
    const dc = Math.abs((hood.pos ?? 0) + hood.w / 2 - ((cook.pos ?? 0) + cook.w / 2));
    out.push(
      hood.wall === cook.wall && dc <= 5
        ? { st: 'ok', code: 'CAMPANA', text: `Campana centrada sobre la parrilla, a ${150 - 90} cm de altura libre` }
        : { st: 'warn', code: 'CAMPANA', text: 'La campana no está centrada sobre la parrilla', id: hood.id },
    );
  }
  if (oven) {
    const near = s.pts.some((p) => p.t === 'elec' && p.wall === oven.wall && Math.abs(p.pos - ((oven.pos ?? 0) + oven.w / 2)) < 80);
    out.push(
      near
        ? { st: 'ok', code: 'HORNO_CONTACTO', text: `Columna horno ${oven.id}: contacto eléctrico dedicado a menos de 80 cm` }
        : { st: 'warn', code: 'HORNO_CONTACTO', text: `La columna horno ${oven.id} no tiene contacto eléctrico cercano`, id: oven.id },
    );
  }
  if (lv && sink)
    out.push(
      lv.wall === sink.wall && (Math.abs(lv.pos! - (sink.pos! + sink.w)) < 1 || Math.abs(sink.pos! - (lv.pos! + lv.w)) < 1)
        ? { st: 'ok', code: 'LAVAVAJILLAS', text: 'Lavavajillas contiguo al fregadero' }
        : { st: 'warn', code: 'LAVAVAJILLAS', text: 'El lavavajillas no está junto al fregadero', id: lv.id },
    );
  if (mods.some((m) => m.wall === 'A' && m.type === 'base') && mods.some((m) => m.wall === 'B' && m.type === 'base'))
    out.push({
      st: 'warn',
      code: 'JUNTA_L',
      text: `Encimera en L: se requiere junta en la esquina (tramos de ${(s.room.A / 100).toFixed(1).replace('.', ',')} m y ${((s.room.B - 60) / 100).toFixed(1).replace('.', ',')} m)`,
    });
  if (s.ptype !== 'cocina' && mods.length) out.push({ st: 'ok', code: 'PROFUNDIDAD_COLGADO', text: 'Profundidad de colgado suficiente (≥ 55 cm) en todos los módulos' });

  out.push(...structuralIssues(s, ctx));
  return out;
}

function structuralIssues(s: ProjectData, ctx?: PricingContext): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (s.mods.length === 0) out.push({ st: 'err', code: 'PROYECTO_VACIO', text: 'El proyecto no tiene módulos' });
  const zoc = zocaloCm(s.prefs.zocalo);
  const seen = new Set<number>();
  for (const m of s.mods) {
    if (seen.has(m.id)) out.push({ st: 'err', code: 'ID_DUPLICADO', text: `Hay dos módulos con el número ${m.id}`, id: m.id });
    seen.add(m.id);
    // Same range the editor allows (3D models stretch beyond their saved width).
    const rw = m.rw ? ranges(m).w : undefined;
    if (rw && (m.w < rw[0] - 1e-9 || m.w > rw[1] + 1e-9))
      out.push({ st: 'err', code: 'ANCHO_FUERA_DE_RANGO', text: `El módulo ${m.id} (${m.name}) mide ${m.w} cm; su rango es ${rw[0]}–${rw[1]} cm`, id: m.id });
    const top = zr(m, zoc)[1] + (m.type === 'base' ? 4 : 0);
    if (top > s.room.H + 0.05) out.push({ st: 'err', code: 'EXCEDE_ALTURA', text: `El módulo ${m.id} (${m.name}) supera la altura del muro (${top} > ${s.room.H} cm)`, id: m.id });
    if (ctx) {
      const def = ctx.modules[m.code];
      if (!def && m.pBase === undefined && m.pOv === undefined)
        out.push({ st: 'warn', code: 'FUERA_DE_CATALOGO', text: `El módulo ${m.id} (${m.code}) no está en el catálogo; se presupuesta solo con materiales`, id: m.id });
      else if (def && !def.active) out.push({ st: 'warn', code: 'DESCONTINUADO', text: `Descontinuado: el módulo ${m.code} ya no está activo en el catálogo`, id: m.id });
      else if (def && m.moduleVersion && m.moduleVersion < def.version)
        out.push({ st: 'warn', code: 'VERSION_ANTERIOR', text: `El módulo ${m.code} cambió en el catálogo desde que se colocó`, id: m.id });
      for (const code of [m.cue, m.fre]) if (code) materialIssue(ctx, code, out, m.id);
    }
  }
  if (ctx) for (const code of Object.values(s.mats)) materialIssue(ctx, code, out);
  return out;
}

function materialIssue(ctx: PricingContext, code: string, out: ValidationIssue[], id?: number) {
  const mat = ctx.materials[code];
  if (!mat) out.push({ st: 'err', code: 'MATERIAL_DESCONOCIDO', text: `El material "${code}" no existe en el catálogo`, id });
  else if (!mat.active) out.push({ st: 'warn', code: 'DESCONTINUADO', text: `Descontinuado: el material ${mat.name} ya no está activo`, id });
}

export const hasErrors = (issues: ValidationIssue[]) => issues.some((i) => i.st === 'err');
