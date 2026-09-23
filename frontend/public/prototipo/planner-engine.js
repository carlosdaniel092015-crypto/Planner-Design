(function () {
const MATS = {
  blanco: { name: 'Blanco mate', type: 'Melamina', c: '#eeebe6' },
  arena: { name: 'Arena', type: 'Melamina', c: '#d9cdb8' },
  roble: { name: 'Roble natural', type: 'Melamina texturizada', c: '#c49a6c', wood: 1 },
  nogal: { name: 'Nogal americano', type: 'Chapa natural', c: '#7a5236', wood: 1 },
  fresno: { name: 'Fresno claro', type: 'Chapa natural', c: '#d8bf98', wood: 1 },
  grafito: { name: 'Gris grafito', type: 'Lacado mate', c: '#4a4845' },
  salvia: { name: 'Verde salvia', type: 'Lacado mate', c: '#8e9c86' },
  cuarzo: { name: 'Cuarzo blanco', type: 'Cuarzo 20 mm', c: '#e9e7e2' },
  granito: { name: 'Granito negro', type: 'Granito 30 mm', c: '#34322f' },
  macizo: { name: 'Encino macizo', type: 'Madera maciza 40 mm', c: '#b3804f', wood: 1 },
  negro: { name: 'Negro mate', type: 'Aluminio', c: '#2a2928' },
  inox: { name: 'Acero inoxidable', type: 'Acero', c: '#9ea2a3' },
  laton: { name: 'Latón cepillado', type: 'Latón', c: '#b8995a' }
};
const GROUPS = [
  { k: 'cuerpo', label: 'Cuerpo', ids: ['blanco', 'arena', 'roble', 'grafito'] },
  { k: 'frentes', label: 'Frentes', ids: ['roble', 'nogal', 'fresno', 'blanco', 'grafito', 'salvia'] },
  { k: 'encimera', label: 'Encimera', ids: ['cuarzo', 'granito', 'macizo'] },
  { k: 'jaladeras', label: 'Jaladeras', ids: ['negro', 'inox', 'laton'] }
];
const D1 = [{ t: 'door', n: 1, f: 1 }], D2 = [{ t: 'door', n: 2, f: 1 }];
const KITCHEN = () => [
  { id: 1, code: 'BE-90', name: 'Bajo esquinero', cat: 'Esquinas', wall: 'A', pos: 0, w: 90, h: 76, d: 60, type: 'base', fr: D1, rw: [80, 110] },
  { id: 2, code: 'BF-90', name: 'Bajo fregadero', cat: 'Bajos', wall: 'A', pos: 90, w: 90, h: 76, d: 60, type: 'base', sink: 1, fr: D2, rw: [60, 120] },
  { id: 3, code: 'LV-60', name: 'Lavavajillas panelable', cat: 'Electro', wall: 'A', pos: 180, w: 60, h: 76, d: 60, type: 'base', appl: 1, fr: D1, rw: [45, 60] },
  { id: 4, code: 'BC-60', name: 'Cajonera 3 cajones', cat: 'Cajoneras', wall: 'A', pos: 240, w: 60, h: 76, d: 60, type: 'base', fr: [{ t: 'drawer', f: .4 }, { t: 'drawer', f: .32 }, { t: 'drawer', f: .28 }], rw: [40, 90] },
  { id: 5, code: 'CH-60', name: 'Columna horno', cat: 'Columnas', wall: 'A', pos: 300, w: 60, h: 210, d: 60, type: 'tall', oven: 1, fr: [{ t: 'drawer', f: .17 }, { t: 'drawer', f: .17 }, { t: 'oven', f: .28 }, { t: 'door', n: 1, f: .38 }], rw: [60, 60] },
  { id: 6, code: 'BP-80', name: 'Bajo parrilla', cat: 'Cajoneras', wall: 'B', pos: 60, w: 80, h: 76, d: 60, type: 'base', cook: 1, fr: [{ t: 'drawer', f: .5 }, { t: 'drawer', f: .5 }], rw: [60, 90] },
  { id: 7, code: 'B2-60', name: 'Bajo 2 puertas', cat: 'Bajos', wall: 'B', pos: 140, w: 60, h: 76, d: 60, type: 'base', fr: D2, rw: [60, 120] },
  { id: 8, code: 'RF-75', name: 'Refrigerador', cat: 'Electro', wall: 'B', pos: 200, w: 75, h: 185, d: 65, type: 'fridge', appl: 1, fr: [], rw: [60, 90] },
  { id: 9, code: 'BB-22', name: 'Botellero', cat: 'Bajos', wall: 'B', pos: 275, w: 22, h: 76, d: 60, type: 'base', fr: D1, rw: [15, 30] },
  { id: 10, code: 'AL-60', name: 'Alacena 1 puerta', cat: 'Altos', wall: 'A', pos: 180, w: 60, h: 70, d: 35, type: 'upper', fr: D1, rw: [30, 60] },
  { id: 11, code: 'AL-60', name: 'Alacena 1 puerta', cat: 'Altos', wall: 'A', pos: 240, w: 60, h: 70, d: 35, type: 'upper', fr: D1, rw: [30, 60], open: 'izq' },
  { id: 12, code: 'CM-80', name: 'Campana decorativa', cat: 'Electro', wall: 'B', pos: 60, w: 80, h: 25, d: 50, type: 'hood', appl: 1, fr: [], rw: [60, 90] },
  { id: 13, code: 'A2-60', name: 'Alacena 2 puertas', cat: 'Altos', wall: 'B', pos: 140, w: 60, h: 70, d: 35, type: 'upper', fr: D2, rw: [60, 120] }
];
const ISLAND = () => KITCHEN().concat([
  { id: 14, code: 'IS-120', name: 'Isla cajonera', cat: 'Cajoneras', wall: 'F', x: 150, y: 175, w: 120, h: 76, d: 70, type: 'base', fr: [{ t: 'drawer', f: .5 }, { t: 'drawer', f: .5 }], rw: [90, 180] }
]);
const LINEAL = () => [
  { id: 1, code: 'CH-60', name: 'Columna horno', cat: 'Columnas', wall: 'A', pos: 0, w: 60, h: 210, d: 60, type: 'tall', oven: 1, fr: [{ t: 'drawer', f: .17 }, { t: 'drawer', f: .17 }, { t: 'oven', f: .28 }, { t: 'door', n: 1, f: .38 }], rw: [60, 60] },
  { id: 2, code: 'RF-70', name: 'Refrigerador', cat: 'Electro', wall: 'A', pos: 60, w: 70, h: 185, d: 65, type: 'fridge', appl: 1, fr: [], rw: [60, 90] },
  { id: 3, code: 'BF-90', name: 'Bajo fregadero', cat: 'Bajos', wall: 'A', pos: 130, w: 90, h: 76, d: 60, type: 'base', sink: 1, fr: D2, rw: [60, 120] },
  { id: 4, code: 'LV-60', name: 'Lavavajillas panelable', cat: 'Electro', wall: 'A', pos: 220, w: 60, h: 76, d: 60, type: 'base', appl: 1, fr: D1, rw: [45, 60] },
  { id: 5, code: 'BP-80', name: 'Bajo parrilla', cat: 'Cajoneras', wall: 'A', pos: 280, w: 80, h: 76, d: 60, type: 'base', cook: 1, fr: [{ t: 'drawer', f: .5 }, { t: 'drawer', f: .5 }], rw: [60, 90] },
  { id: 6, code: 'CM-80', name: 'Campana decorativa', cat: 'Electro', wall: 'A', pos: 280, w: 80, h: 25, d: 50, type: 'hood', appl: 1, fr: [], rw: [60, 90] },
  { id: 7, code: 'AL-60', name: 'Alacena 1 puerta', cat: 'Altos', wall: 'A', pos: 220, w: 60, h: 70, d: 35, type: 'upper', fr: D1, rw: [30, 60] }
];
const OPEN_ROD = [{ t: 'open', f: 1, rod: 1 }], OPEN_SH = [{ t: 'open', f: 1 }];
const CLOSET = () => [
  { id: 1, code: 'CL-100', name: 'Colgado largo', cat: 'Closet', wall: 'A', pos: 0, w: 100, h: 230, d: 60, type: 'tall', fr: D2, rw: [60, 120] },
  { id: 2, code: 'CJ-100', name: 'Cajonera + colgado corto', cat: 'Closet', wall: 'A', pos: 100, w: 100, h: 230, d: 60, type: 'tall', fr: [{ t: 'drawer', f: .12 }, { t: 'drawer', f: .12 }, { t: 'drawer', f: .12 }, { t: 'door', n: 2, f: .64 }], rw: [60, 120] },
  { id: 3, code: 'CC-100', name: 'Colgado corto doble', cat: 'Closet', wall: 'A', pos: 200, w: 100, h: 230, d: 60, type: 'tall', fr: D2, rw: [60, 120] },
  { id: 4, code: 'ZP-60', name: 'Zapatera extraíble', cat: 'Closet', wall: 'A', pos: 300, w: 60, h: 230, d: 60, type: 'tall', fr: D1, rw: [40, 80] }
];
const VESTIDOR = () => [
  { id: 1, code: 'VL-100', name: 'Colgado largo abierto', cat: 'Closet', wall: 'A', pos: 0, w: 100, h: 230, d: 55, type: 'tall', fr: OPEN_ROD, rw: [60, 120] },
  { id: 2, code: 'VE-80', name: 'Entrepaños abiertos', cat: 'Closet', wall: 'A', pos: 100, w: 80, h: 230, d: 55, type: 'tall', fr: OPEN_SH, rw: [40, 100] },
  { id: 3, code: 'VC-100', name: 'Colgado corto abierto', cat: 'Closet', wall: 'A', pos: 180, w: 100, h: 230, d: 55, type: 'tall', fr: [{ t: 'drawer', f: .14 }, { t: 'drawer', f: .14 }, { t: 'open', f: .72, rod: 1 }], rw: [60, 120] },
  { id: 4, code: 'VZ-80', name: 'Zapatera abierta', cat: 'Closet', wall: 'A', pos: 280, w: 80, h: 230, d: 55, type: 'tall', fr: OPEN_SH, rw: [40, 100] },
  { id: 5, code: 'VE-90', name: 'Entrepaños abiertos', cat: 'Closet', wall: 'B', pos: 55, w: 90, h: 230, d: 55, type: 'tall', fr: OPEN_SH, rw: [40, 100] },
  { id: 6, code: 'VL-90', name: 'Colgado largo abierto', cat: 'Closet', wall: 'B', pos: 145, w: 90, h: 230, d: 55, type: 'tall', fr: OPEN_ROD, rw: [60, 120] },
  { id: 7, code: 'IC-100', name: 'Isla cajonera', cat: 'Closet', wall: 'F', x: 150, y: 130, w: 100, h: 80, d: 55, type: 'base', fr: [{ t: 'drawer', f: .34 }, { t: 'drawer', f: .33 }, { t: 'drawer', f: .33 }], rw: [80, 140] }
];
const LIB = [
  { code: 'B-1P', name: 'Bajo 1 puerta', cat: 'Bajos', rw: [30, 60], w: 45, h: 76, d: 60, type: 'base', fr: D1 },
  { code: 'B-2P', name: 'Bajo 2 puertas', cat: 'Bajos', rw: [60, 120], w: 80, h: 76, d: 60, type: 'base', fr: D2 },
  { code: 'BF', name: 'Bajo fregadero', cat: 'Bajos', rw: [60, 120], w: 90, h: 76, d: 60, type: 'base', fr: D2, sink: 1 },
  { code: 'BC-3', name: 'Cajonera 3 cajones', cat: 'Cajoneras', rw: [40, 90], w: 60, h: 76, d: 60, type: 'base', fr: [{ t: 'drawer', f: .4 }, { t: 'drawer', f: .32 }, { t: 'drawer', f: .28 }] },
  { code: 'BC-2', name: 'Cajonera 2 cajones', cat: 'Cajoneras', rw: [40, 120], w: 80, h: 76, d: 60, type: 'base', fr: [{ t: 'drawer', f: .5 }, { t: 'drawer', f: .5 }] },
  { code: 'A-1P', name: 'Alacena 1 puerta', cat: 'Altos', rw: [30, 60], w: 45, h: 70, d: 35, type: 'upper', fr: D1 },
  { code: 'A-2P', name: 'Alacena 2 puertas', cat: 'Altos', rw: [60, 120], w: 80, h: 70, d: 35, type: 'upper', fr: D2 },
  { code: 'A-AB', name: 'Alacena abatible', cat: 'Altos', rw: [60, 120], w: 90, h: 40, d: 35, type: 'upper', fr: D1 },
  { code: 'C-HO', name: 'Columna horno', cat: 'Columnas', rw: [60, 60], w: 60, h: 210, d: 60, type: 'tall', oven: 1, fr: [{ t: 'drawer', f: .17 }, { t: 'drawer', f: .17 }, { t: 'oven', f: .28 }, { t: 'door', n: 1, f: .38 }] },
  { code: 'C-DE', name: 'Columna despensa', cat: 'Columnas', rw: [40, 60], w: 50, h: 210, d: 60, type: 'tall', fr: [{ t: 'door', n: 1, f: .45 }, { t: 'door', n: 1, f: .55 }] },
  { code: 'E-L', name: 'Esquinero en L', cat: 'Esquinas', rw: [80, 110], w: 90, h: 76, d: 60, type: 'base', fr: D1 },
  { code: 'E-AL', name: 'Alacena esquinera', cat: 'Esquinas', rw: [60, 80], w: 65, h: 70, d: 35, type: 'upper', fr: D1 },
  { code: 'CL-L', name: 'Colgado largo', cat: 'Closet', rw: [60, 120], w: 90, h: 230, d: 55, type: 'tall', fr: OPEN_ROD },
  { code: 'CL-E', name: 'Entrepaños abiertos', cat: 'Closet', rw: [40, 100], w: 60, h: 230, d: 55, type: 'tall', fr: OPEN_SH },
  { code: 'CL-Z', name: 'Zapatera extraíble', cat: 'Closet', rw: [40, 80], w: 60, h: 230, d: 55, type: 'tall', fr: D1 }
];

function shade(h, k) {
  if (h[0] !== '#') return h;
  const c = [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16)).map(v => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)));
  return '#' + c.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}
const ACC = '#ec3013', INK = '#201e1d';
const handleOf = a => a === 'Gola' ? 'gola' : a === 'Push' ? 'none' : 'bar';
function geo(m) {
  if (m.wall === 'A') return { x0: m.pos, x1: m.pos + m.w, y0: 0, y1: m.d };
  if (m.wall === 'B') return { x0: 0, x1: m.d, y0: m.pos, y1: m.pos + m.w };
  return { x0: m.x, x1: m.x + m.w, y0: m.y, y1: m.y + m.d };
}
function zr(m, zoc) {
  if (m.type === 'upper') return [150, 150 + m.h];
  if (m.type === 'fridge') return [0, m.h];
  if (m.type === 'hood') return [150, 150 + m.h];
  return [zoc, zoc + m.h];
}
function cols(m, mats) {
  return { f: MATS[m.fre || mats.frentes].c, b: MATS[m.cue || mats.cuerpo].c, c: MATS[mats.encimera].c, hd: MATS[mats.jaladeras].c };
}

// ---------- isometric scene ----------
function iso(mods, o) {
  const a = (o.ang || 45) * Math.PI / 180, s = Math.sin(a), c = Math.cos(a);
  const P = (x, y, z) => [x * c - y * s, (x * s + y * c) * 0.55 - z * 0.83];
  const it = [], bx = [1e9, 1e9, -1e9, -1e9];
  const pt = p => { const q = P(p[0], p[1], p[2]); bx[0] = Math.min(bx[0], q[0]); bx[1] = Math.min(bx[1], q[1]); bx[2] = Math.max(bx[2], q[0]); bx[3] = Math.max(bx[3], q[1]); return q[0].toFixed(1) + ' ' + q[1].toFixed(1); };
  const poly = (ps, fill, stroke, sw, ex) => it.push(Object.assign({ d: 'M' + ps.map(pt).join('L') + 'Z', fill, stroke, sw }, ex || {}));
  const line = (ps, stroke, sw, ex) => it.push(Object.assign({ d: 'M' + ps.map(pt).join('L'), stroke, sw }, ex || {}));
  const text = (p, str, ex) => { const q = P(p[0], p[1], p[2]); it.push(Object.assign({ t: 'text', x: q[0], y: q[1], s: str, fs: 10, halo: '#ffffff' }, ex || {})); };
  const box = (x0, x1, y0, y1, z0, z1, col, ex) => {
    const e = shade(col, -.3);
    poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], shade(col, .12), e, .35, ex);
    poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], col, e, .35, ex);
    poly([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], shade(col, -.16), e, .35, ex);
  };
  const { A, B, H } = o.room, T = 12, zoc = o.zoc == null ? 10 : o.zoc;
  poly([[0, 0, 0], [A, 0, 0], [A, B, 0], [0, B, 0]], '#dcd5ca', '#c9c0b3', .4);
  for (let x = 50; x < A; x += 50) line([[x, 0, 0], [x, B, 0]], '#cfc6b8', .4);
  for (let y = 50; y < B; y += 50) line([[0, y, 0], [A, y, 0]], '#cfc6b8', .4);
  poly([[0, 0, 0], [A, 0, 0], [A, 0, H], [0, 0, H]], '#f2efea', '#d3cdc4', .4);
  poly([[0, 0, 0], [0, B, 0], [0, B, H], [0, 0, H]], '#e5e0d9', '#d3cdc4', .4);
  poly([[-T, -T, H], [A, -T, H], [A, 0, H], [0, 0, H]], '#bdb6ac');
  poly([[-T, -T, H], [0, 0, H], [0, B, H], [-T, B, H]], '#bdb6ac');
  poly([[A, -T, 0], [A, 0, 0], [A, 0, H], [A, -T, H]], '#cbc4ba');
  poly([[-T, B, 0], [0, B, 0], [0, B, H], [-T, B, H]], '#d6d0c7');
  (o.ops || []).forEach(op => {
    if (op.wall !== 'A' && op.wall !== 'B') return;
    const z0 = op.t === 'ventana' ? (op.z || 110) : 0, z1 = z0 + op.h;
    const Q = (t, z) => op.wall === 'A' ? [t, .3, z] : [.3, t, z];
    const t0 = op.pos, t1 = op.pos + op.w, tm = (t0 + t1) / 2;
    if (op.t === 'ventana') {
      poly([Q(t0, z0), Q(t1, z0), Q(t1, z1), Q(t0, z1)], '#d3dcde', '#ffffff', 2.2);
      line([Q(tm, z0), Q(tm, z1)], '#ffffff', 1.6);
      poly([Q(t0 + 4, z0 + 4), Q(tm - 4, z0 + 4), Q(tm - 4, z0 + op.h * .45)], 'rgba(255,255,255,.35)');
    } else {
      poly([Q(t0, z0), Q(t1, z0), Q(t1, z1), Q(t0, z1)], '#cfc6b8', '#ffffff', 2);
    }
  });
  const key = m => { const g = geo(m); return ((g.x0 + g.x1) / 2) * s + ((g.y0 + g.y1) / 2) * c - (m.type === 'upper' || m.type === 'hood' ? 1 : 0); };
  const list = mods.filter(m => o.altos !== false || (m.type !== 'upper' && m.type !== 'hood')).slice().sort((p, q) => key(p) - key(q));
  const hstyle = o.handle || 'bar';
  let selM = null;
  list.forEach(m => {
    const g = geo(m), [z0, z1] = zr(m, zoc), C = cols(m, o.mats), isB = m.wall === 'B';
    const ex = o.onSel ? { oc: () => o.onSel(m.id) } : {};
    if (o.sel === m.id) selM = m;
    if (m.type !== 'upper' && m.type !== 'hood') poly([[g.x0, g.y0, 0], [g.x1 + 5, g.y0, 0], [g.x1 + 5, g.y1 + 6, 0], [g.x0, g.y1 + 6, 0]], 'rgba(70,50,30,.16)');
    const FP = (u, v) => isB ? [g.x1 + .3, g.y0 + u * m.w, z0 + v * (z1 - z0)] : [g.x0 + u * m.w, g.y1 + .3, z0 + v * (z1 - z0)];
    const R = (u0, u1, a0, a1, fill, st, sw) => poly([FP(u0, a0), FP(u1, a0), FP(u1, a1), FP(u0, a1)], fill, st || shade(fill, -.3), sw || .4, ex);
    const L = (u0, a0, u1, a1, st, sw) => line([FP(u0, a0), FP(u1, a1)], st, sw, ex);
    if (m.type === 'hood') {
      const cx = isB ? (g.y0 + g.y1) / 2 : (g.x0 + g.x1) / 2;
      if (isB) { box(0, 50, g.y0, g.y1, z0, z0 + 14, '#b9bcbd', ex); box(0, 28, cx - 15, cx + 15, z0 + 14, o.room.H, '#c6c9ca', ex); }
      else { box(g.x0, g.x1, 0, 50, z0, z0 + 14, '#b9bcbd', ex); box(cx - 15, cx + 15, 0, 28, z0 + 14, o.room.H, '#c6c9ca', ex); }
      return;
    }
    if (m.type === 'fridge') {
      box(g.x0, g.x1, g.y0, g.y1, 0, m.h, '#c5c8c9', ex);
      R(.01, .99, .005, .615, '#c5c8c9', '#8f9394'); R(.01, .99, .625, .995, '#c5c8c9', '#8f9394');
      L(.1, .45, .1, .58, '#6f7374', 2.2); L(.1, .66, .1, .8, '#6f7374', 2.2);
      return;
    }
    if (m.type !== 'upper' && zoc > 0) {
      if (isB) box(g.x0, g.x1 - 5, g.y0, g.y1, 0, zoc, '#3b3936');
      else box(g.x0, g.x1, g.y0 + (m.wall === 'F' ? 5 : 0), g.y1 - 5, 0, zoc, '#3b3936');
    }
    box(g.x0, g.x1, g.y0, g.y1, z0, z1, C.b, ex);
    const fh = z1 - z0, gu = .25 / m.w, gv = .25 / fh;
    let v = 0;
    m.fr.forEach(seg => {
      const v0 = v, v1 = v + seg.f; v = v1;
      if (seg.t === 'door') {
        const n = seg.n || 1;
        for (let i = 0; i < n; i++) R(i / n + gu, (i + 1) / n - gu, v0 + gv, v1 - gv, C.f);
        if (hstyle === 'bar') {
          const up = m.type === 'upper', b0 = up ? v0 + 3 / fh : v1 - 17 / fh, b1 = up ? v0 + 17 / fh : v1 - 3 / fh;
          if (n === 2) { L(.5 - 3 / m.w, b0, .5 - 3 / m.w, b1, C.hd, 1.6); L(.5 + 3 / m.w, b0, .5 + 3 / m.w, b1, C.hd, 1.6); }
          else { const u = m.open === 'izq' ? 1 - 4 / m.w : 4 / m.w; L(u, b0, u, b1, C.hd, 1.6); }
        }
      } else if (seg.t === 'drawer') {
        R(gu, 1 - gu, v0 + gv, v1 - gv, C.f);
        if (hstyle === 'bar') L(.36, v1 - 4 / fh, .64, v1 - 4 / fh, C.hd, 1.6);
      } else if (seg.t === 'oven') {
        R(gu, 1 - gu, v0 + gv, v1 - gv, '#2d2c2b');
        R(.08, .92, v0 + seg.f * .12, v1 - seg.f * .3, '#4a4f52');
        R(.06, .94, v1 - seg.f * .2, v1 - seg.f * .07, '#9ea2a3');
      } else if (seg.t === 'open') {
        R(.03, .97, v0 + .005, v1 - .005, shade(C.b, -.38), shade(C.b, -.45));
        const k = seg.rod ? 2 : 4;
        for (let i = 1; i < k; i++) L(.03, v0 + seg.f * i / k, .97, v0 + seg.f * i / k, shade(C.b, -.05), 1.4);
        if (seg.rod) L(.06, v1 - .08, .94, v1 - .08, '#9ea2a3', 1.6);
      }
      if (hstyle === 'gola' && (seg.t === 'door' || seg.t === 'drawer') && m.type !== 'upper') L(0, v1 - gv, 1, v1 - gv, '#2a2928', 1.3);
    });
    if (m.type === 'base') {
      const zt = z1 + 4;
      if (isB) box(g.x0, g.x1 + 2, g.y0, g.y1, z1, zt, C.c);
      else if (m.wall === 'F') box(g.x0 - 2, g.x1 + 2, g.y0 - 2, g.y1 + 2, z1, zt, C.c);
      else box(g.x0, g.x1, g.y0, g.y1 + 2, z1, zt, C.c);
      const TP = (u, w) => isB ? [g.x0 + w * m.d, g.y0 + u * m.w, zt + .1] : [g.x0 + u * m.w, g.y0 + w * m.d, zt + .1];
      const TR = (u0, u1, w0, w1, fill, st) => poly([TP(u0, w0), TP(u1, w0), TP(u1, w1), TP(u0, w1)], fill, st, .5, ex);
      if (m.sink) {
        TR(.14, .86, .14, .8, '#c9cccd', '#8f9394'); TR(.19, .81, .2, .74, '#a7abac', '#8f9394');
        const f0 = TP(.5, .06), f1 = TP(.5, .3);
        line([f0, [f0[0], f0[1], zt + 28], [f1[0], f1[1], zt + 28], [f1[0], f1[1], zt + 22]], '#7f8384', 2);
      }
      if (m.cook) {
        TR(.08, .92, .15, .85, '#232221', '#111');
        [[.28, .32], [.72, .32], [.28, .68], [.72, .68]].forEach(p => TR(p[0] - .1, p[0] + .1, p[1] - .1, p[1] + .1, 'none', '#5d5e5f'));
      }
    }
  });
  if (selM) {
    const m = selM, g = geo(m), [z0, z1b] = zr(m, zoc), zt = m.type === 'base' ? z1b + 4 : z1b, zb = m.type === 'upper' || m.type === 'hood' ? z0 : 0;
    const e = { fill: 'rgba(236,48,19,.1)' };
    poly([[g.x0, g.y0, zt], [g.x1, g.y0, zt], [g.x1, g.y1, zt], [g.x0, g.y1, zt]], e.fill, ACC, 1.6);
    poly([[g.x0, g.y1, zb], [g.x1, g.y1, zb], [g.x1, g.y1, zt], [g.x0, g.y1, zt]], e.fill, ACC, 1.6);
    poly([[g.x1, g.y0, zb], [g.x1, g.y1, zb], [g.x1, g.y1, zt], [g.x1, g.y0, zt]], e.fill, ACC, 1.6);
    if (o.cotas) {
      const isB = m.wall === 'B', zc = zt + 16;
      const E = (u, z) => isB ? [g.x1, g.y0 + u, z] : [g.x0 + u, g.y1, z];
      line([E(0, zc), E(m.w, zc)], ACC, 1.2); line([E(0, zc - 5), E(0, zc + 5)], ACC, 1.2); line([E(m.w, zc - 5), E(m.w, zc + 5)], ACC, 1.2);
      text(E(m.w / 2, zc + 9), (m.w * 10) + ' mm', { fill: ACC, fs: 10.5, fw: 800 });
      const hx = isB ? [g.x1 + 12, g.y0] : [g.x1 + 12, g.y1];
      line([[hx[0], hx[1], zb], [hx[0], hx[1], zt]], ACC, 1.2);
      text([hx[0] + 6, hx[1], (zb + zt) / 2], ((zt - zb) * 10) + ' mm', { fill: ACC, fs: 10.5, fw: 800, anchor: 'start' });
    }
  }
  if (o.cotas) {
    const z = H + 22;
    line([[0, -T, z], [A, -T, z]], INK, .8); line([[0, -T, z - 5], [0, -T, z + 5]], INK, .8); line([[A, -T, z - 5], [A, -T, z + 5]], INK, .8);
    text([A / 2, -T, z + 9], (A * 10) + ' mm · Muro A', { fs: 10 });
    line([[-T, 0, z], [-T, B, z]], INK, .8); line([[-T, B, z - 5], [-T, B, z + 5]], INK, .8);
    text([-T, B / 2, z + 9], (B * 10) + ' mm · Muro B', { fs: 10 });
  }
  const pad = o.pad == null ? 24 : o.pad;
  let vb = [bx[0] - pad, bx[1] - pad, bx[2] - bx[0] + pad * 2, bx[3] - bx[1] + pad * 2];
  if (o.focus) { const q = P(o.focus[0], o.focus[1], o.focus[2]); vb = [q[0] - o.focus[3] / 2, q[1] - o.focus[3] * .33, o.focus[3], o.focus[3] * .66]; }
  if (o.zoom && o.zoom !== 1) { const cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2, w = vb[2] / o.zoom, hh = vb[3] / o.zoom; vb = [cx - w / 2, cy - hh / 2, w, hh]; }
  return { items: it, vb };
}

// ---------- plan ----------
function wallPt(wall, t, n, A, B) {
  if (wall === 'A') return [t, n];
  if (wall === 'B') return [n, t];
  if (wall === 'C') return [A - n, t];
  return [t, B - n];
}
function plan(o) {
  const it = [], T = 12, { A, B } = o;
  const P = (x, y) => x.toFixed(1) + ' ' + y.toFixed(1);
  const rect = (x, y, w, h, fill, stroke, sw, ex) => it.push(Object.assign({ d: `M${P(x, y)}L${P(x + w, y)}L${P(x + w, y + h)}L${P(x, y + h)}Z`, fill, stroke, sw }, ex || {}));
  const ln = (x1, y1, x2, y2, stroke, sw, ex) => it.push(Object.assign({ d: `M${P(x1, y1)}L${P(x2, y2)}`, stroke, sw }, ex || {}));
  const tx = (x, y, s, ex) => it.push(Object.assign({ t: 'text', x, y, s, fs: 9 }, ex || {}));
  rect(0, 0, A, B, '#faf9f7', 'none', 0, o.onClick ? { floor: 1 } : {});
  for (let x = 50; x < A; x += 50) ln(x, 0, x, B, '#ebe7e1', .5);
  for (let y = 50; y < B; y += 50) ln(0, y, A, y, '#ebe7e1', .5);
  rect(-T, -T, A + 2 * T, T, INK); rect(-T, 0, T, B, INK); rect(A, 0, T, B, INK); rect(-T, B, A + 2 * T, T, INK);
  const lab = { A: [A / 2, -T / 2, 0], B: [-T / 2, B / 2, -90], C: [A + T / 2, B / 2, 90], D: [A / 2, B + T / 2, 0] };
  Object.keys(lab).forEach(k => tx(lab[k][0], lab[k][1], 'MURO ' + k, { fill: '#ffffff', fs: 6.5, rot: lab[k][2], fw: 800 }));
  (o.ops || []).forEach(op => {
    const W = (t, n) => wallPt(op.wall, t, n, A, B);
    const a = W(op.pos, -T), b = W(op.pos + op.w, 0);
    const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(a[0] - b[0]), h = Math.abs(a[1] - b[1]);
    if (op.t === 'ventana') {
      rect(x, y, w, h, '#ffffff', INK, .8);
      const m1 = W(op.pos, -T / 2), m2 = W(op.pos + op.w, -T / 2); ln(m1[0], m1[1], m2[0], m2[1], INK, .8);
    } else {
      rect(x, y, w, h, '#faf9f7');
      const h0 = W(op.pos, 0), h1 = W(op.pos, op.w); ln(h0[0], h0[1], h1[0], h1[1], INK, 1.4);
      const pts = []; for (let i = 0; i <= 12; i++) { const th = i / 12 * Math.PI / 2; pts.push(W(op.pos + op.w * Math.sin(th), op.w * Math.cos(th))); }
      it.push({ d: 'M' + pts.map(p => P(p[0], p[1])).join('L'), stroke: INK, sw: .6, dash: '3 3' });
    }
  });
  const mods = o.mods || [];
  const floorM = mods.filter(m => m.type !== 'upper' && m.type !== 'hood');
  const upM = o.altos === false ? [] : mods.filter(m => m.type === 'upper' || m.type === 'hood');
  floorM.concat(upM).forEach(m => {
    const g = geo(m), w = g.x1 - g.x0, h = g.y1 - g.y0, up = m.type === 'upper' || m.type === 'hood';
    const ex = o.onSel ? { oc: () => o.onSel(m.id) } : {};
    const sel = o.sel === m.id;
    if (up) rect(g.x0, g.y0, w, h, 'none', sel ? ACC : '#6d6a68', sel ? 1.8 : .8, Object.assign({ dash: '4 3' }, ex));
    else rect(g.x0, g.y0, w, h, sel ? '#fff2ef' : '#ffffff', sel ? ACC : INK, sel ? 1.8 : 1, ex);
    if (!up) {
      if (m.type === 'fridge' || m.type === 'tall') { ln(g.x0, g.y0, g.x1, g.y1, '#9b9797', .6); ln(g.x1, g.y0, g.x0, g.y1, '#9b9797', .6); }
      if (m.sink) rect(g.x0 + w * .15, g.y0 + h * .15, w * .7, h * .6, 'none', INK, .7);
      if (m.cook) [[.3, .3], [.7, .3], [.3, .7], [.7, .7]].forEach(p => it.push({ t: 'c', cx: g.x0 + w * p[0], cy: g.y0 + h * p[1], r: Math.min(w, h) * .12, fill: 'none', stroke: INK, sw: .7 }));
    }
    if (o.nums !== false && !up) {
      const cx = (g.x0 + g.x1) / 2, cy = (g.y0 + g.y1) / 2;
      it.push(Object.assign({ t: 'c', cx, cy, r: 8, fill: sel ? ACC : INK }, ex));
      tx(cx, cy + .5, String(m.id), { fill: '#ffffff', fs: 8.5, fw: 800 });
    }
  });
  const PTS = { agua: 'AG', desague: 'DS', elec: 'EL', gas: 'GS', campana: 'CP' };
  (o.pts || []).forEach(p => {
    const [x, y] = wallPt(p.wall, p.pos, 9, A, B), sel = o.ptSel === p.id;
    const col = sel ? INK : ACC;
    if (p.t === 'agua') it.push({ t: 'c', cx: x, cy: y, r: 7, fill: col });
    else if (p.t === 'desague') it.push({ t: 'c', cx: x, cy: y, r: 7, fill: '#ffffff', stroke: col, sw: 1.6 });
    else if (p.t === 'elec') rect(x - 7, y - 7, 14, 14, col);
    else if (p.t === 'gas') it.push({ d: `M${P(x, y - 8)}L${P(x + 8, y + 6)}L${P(x - 8, y + 6)}Z`, fill: col });
    else it.push({ d: `M${P(x, y - 8)}L${P(x + 8, y)}L${P(x, y + 8)}L${P(x - 8, y)}Z`, fill: col });
    tx(x, y + (p.t === 'gas' ? 1.5 : .5), PTS[p.t], { fill: p.t === 'desague' ? col : '#ffffff', fs: 5.5, fw: 800 });
  });
  const ext = [-T - 20, -T - 20, A + 2 * T + 40, B + 2 * T + 40];
  if (o.cotas !== false) {
    const chain = (wall, ms, len) => {
      const off = -T - 18, off2 = -T - 38;
      const seg = (t0, t1, off, lbl) => {
        const a = wallPt(wall, t0, off, A, B), b = wallPt(wall, t1, off, A, B);
        ln(a[0], a[1], b[0], b[1], INK, .6);
        [a, b].forEach((p, i) => { const q = wallPt(wall, i ? t1 : t0, off - 4, A, B), r = wallPt(wall, i ? t1 : t0, off + 4, A, B); ln(q[0], q[1], r[0], r[1], INK, .6); });
        const mid = wallPt(wall, (t0 + t1) / 2, off - 6, A, B);
        tx(mid[0], mid[1], lbl, { fs: 7.5, rot: wall === 'B' ? -90 : 0, halo: '#f3f2f2' });
      };
      ms.forEach(m => seg(m.pos, m.pos + m.w, off, String(m.w * 10)));
      seg(0, len, off2, (len * 10) + ' mm');
    };
    const fl = mods.filter(m => m.type !== 'upper' && m.type !== 'hood');
    chain('A', fl.filter(m => m.wall === 'A'), A);
    chain('B', fl.filter(m => m.wall === 'B'), B);
    const c1 = [A + T + 18, 0], c2 = [A + T + 18, B]; ln(c1[0], c1[1], c2[0], c2[1], INK, .6);
    tx(A + T + 26, B / 2, (B * 10) + ' mm', { fs: 7.5, rot: 90 });
    ln(0, B + T + 18, A, B + T + 18, INK, .6); tx(A / 2, B + T + 26, (A * 10) + ' mm', { fs: 7.5 });
    ext[0] = -T - 52; ext[1] = -T - 52; ext[2] = A + 2 * T + 92; ext[3] = B + 2 * T + 92;
  }
  return { items: it, vb: ext };
}

// ---------- 2D front ----------
function front2D(m, X, Y, W, H, C, hstyle, ex, it) {
  const P = (x, y) => x.toFixed(1) + ' ' + y.toFixed(1);
  const rect = (x, y, w, h, fill, stroke, sw) => it.push(Object.assign({ d: `M${P(x, y)}L${P(x + w, y)}L${P(x + w, y + h)}L${P(x, y + h)}Z`, fill, stroke: stroke || shade(fill, -.35), sw: sw == null ? .6 : sw }, ex || {}));
  const ln = (x1, y1, x2, y2, stroke, sw) => it.push(Object.assign({ d: `M${P(x1, y1)}L${P(x2, y2)}`, stroke, sw }, ex || {}));
  const g = .3;
  if (m.type === 'fridge') {
    rect(X, Y, W, H, '#c5c8c9', '#8f9394'); ln(X, Y + H * .38, X + W, Y + H * .38, '#8f9394', .8);
    ln(X + W * .1, Y + H * .2, X + W * .1, Y + H * .34, '#6f7374', 1.6); ln(X + W * .1, Y + H * .42, X + W * .1, Y + H * .55, '#6f7374', 1.6);
    return;
  }
  if (m.type === 'hood') { it.push({ d: `M${P(X, Y + H)}L${P(X + W, Y + H)}L${P(X + W * .7, Y)}L${P(X + W * .3, Y)}Z`, fill: '#c5c8c9', stroke: '#8f9394', sw: .6 }); return; }
  rect(X, Y, W, H, C.b);
  let v = 0;
  m.fr.forEach(seg => {
    const y1 = Y + H - v * H, y0 = Y + H - (v + seg.f) * H; v += seg.f;
    const sh = y1 - y0;
    if (seg.t === 'door') {
      const n = seg.n || 1;
      for (let i = 0; i < n; i++) rect(X + W * i / n + g, y0 + g, W / n - 2 * g, sh - 2 * g, C.f);
      if (hstyle === 'bar') {
        const up = m.type === 'upper', b0 = up ? y1 - 17 : y0 + 3, b1 = up ? y1 - 3 : y0 + 17;
        if (n === 2) { ln(X + W / 2 - 3, b0, X + W / 2 - 3, b1, C.hd, 1.4); ln(X + W / 2 + 3, b0, X + W / 2 + 3, b1, C.hd, 1.4); }
        else { const x = m.open === 'izq' ? X + W - 4 : X + 4; ln(x, b0, x, b1, C.hd, 1.4); }
      }
      if (n === 1) { const hx = m.open === 'izq' ? X + g : X + W - g; it.push({ d: `M${P(hx, y0 + g)}L${P(m.open === 'izq' ? X + W - g : X + g, y0 + sh / 2)}L${P(hx, y1 - g)}`, stroke: shade(C.f, -.4), sw: .4, dash: '3 2' }); }
    } else if (seg.t === 'drawer') {
      rect(X + g, y0 + g, W - 2 * g, sh - 2 * g, C.f);
      if (hstyle === 'bar') ln(X + W * .36, y0 + 4, X + W * .64, y0 + 4, C.hd, 1.4);
    } else if (seg.t === 'oven') {
      rect(X + g, y0 + g, W - 2 * g, sh - 2 * g, '#2d2c2b'); rect(X + W * .08, y0 + sh * .3, W * .84, sh * .58, '#4a4f52'); rect(X + W * .06, y0 + sh * .07, W * .88, sh * .13, '#9ea2a3');
    } else if (seg.t === 'open') {
      rect(X + 1.8, y0 + .5, W - 3.6, sh - 1, shade(C.b, -.3));
      const k = seg.rod ? 2 : 4; for (let i = 1; i < k; i++) ln(X + 1.8, y0 + sh * i / k, X + W - 1.8, y0 + sh * i / k, shade(C.b, -.05), 1.6);
      if (seg.rod) ln(X + 4, y0 + 7, X + W - 4, y0 + 7, '#9ea2a3', 1.6);
    }
    if (hstyle === 'gola' && (seg.t === 'door' || seg.t === 'drawer') && m.type !== 'upper') ln(X, y0 + .6, X + W, y0 + .6, '#2a2928', 1.2);
  });
}
function frontThumb(m, mats, hstyle) {
  const it = [], C = cols(m, mats);
  front2D(m, 0, 0, m.w, m.h, C, hstyle, null, it);
  const pad = Math.max(m.w, m.h) * .08;
  return { items: it, vb: [-pad, -pad, m.w + pad * 2, m.h + pad * 2] };
}

// ---------- elevation ----------
function elev(o) {
  const it = [], { len, H, wall } = o, zoc = o.zoc == null ? 10 : o.zoc;
  const Y = z => H - z;
  const P = (x, y) => x.toFixed(1) + ' ' + y.toFixed(1);
  const rect = (x, y, w, h, fill, stroke, sw, ex) => it.push(Object.assign({ d: `M${P(x, y)}L${P(x + w, y)}L${P(x + w, y + h)}L${P(x, y + h)}Z`, fill, stroke, sw }, ex || {}));
  const ln = (x1, y1, x2, y2, stroke, sw, ex) => it.push(Object.assign({ d: `M${P(x1, y1)}L${P(x2, y2)}`, stroke, sw }, ex || {}));
  const tx = (x, y, s, ex) => it.push(Object.assign({ t: 'text', x, y, s, fs: 8 }, ex || {}));
  rect(0, 0, len, H, '#f2efea', 'none', 0);
  rect(-10, -10, 10, H + 10, INK); rect(len, -10, 10, H + 10, INK); rect(-10, -10, len + 20, 10, INK);
  ln(-30, H, len + 30, H, INK, 2);
  (o.ops || []).filter(op => op.wall === wall).forEach(op => {
    const z0 = op.t === 'ventana' ? (op.z || 110) : 0;
    rect(op.pos, Y(z0 + op.h), op.w, op.h, op.t === 'ventana' ? '#dfe6e8' : '#e3ddd4', INK, .8);
    if (op.t === 'ventana') ln(op.pos + op.w / 2, Y(z0 + op.h), op.pos + op.w / 2, Y(z0), INK, .6);
  });
  const ms = o.mods.filter(m => m.wall === wall && (o.altos !== false || (m.type !== 'upper' && m.type !== 'hood')));
  ms.forEach(m => {
    const C = cols(m, o.mats), [z0, z1] = zr(m, zoc), sel = o.sel === m.id, ex = o.onSel ? { oc: () => o.onSel(m.id) } : {};
    if ((m.type === 'base' || m.type === 'tall') && zoc > 0) rect(m.pos, Y(zoc), m.w, zoc, '#3b3936', 'none', 0, ex);
    if (m.type === 'hood') {
      front2D(m, m.pos, Y(z1), m.w, z1 - z0, C, o.handle, ex, it);
      rect(m.pos + m.w / 2 - 15, 0, 30, Y(z1), '#d0d3d4', '#8f9394', .6, ex);
    } else front2D(m, m.pos, Y(z1), m.w, z1 - z0, C, o.handle, ex, it);
    if (m.type === 'base') rect(m.pos, Y(z1 + 4), m.w, 4, C.c, shade(C.c, -.3), .6, ex);
    const top = m.type === 'base' ? z1 + 4 : z1, bot = m.type === 'upper' || m.type === 'hood' ? z0 : 0;
    if (sel) rect(m.pos, Y(top), m.w, top - bot, 'rgba(236,48,19,.08)', ACC, 1.8);
    if (m.type !== 'hood') { it.push({ t: 'c', cx: m.pos + m.w / 2, cy: Y(top) - 11, r: 7, fill: sel ? ACC : INK }); tx(m.pos + m.w / 2, Y(top) - 10.5, String(m.id), { fill: '#fff', fs: 7.5, fw: 800 }); }
  });
  if (o.cotas !== false) {
    const fl = ms.filter(m => m.type !== 'upper' && m.type !== 'hood').sort((a, b) => a.pos - b.pos);
    const seg = (t0, t1, y, lbl) => { ln(t0, y, t1, y, INK, .6); ln(t0, y - 4, t0, y + 4, INK, .6); ln(t1, y - 4, t1, y + 4, INK, .6); tx((t0 + t1) / 2, y + 8, lbl, { fs: 7.5 }); };
    fl.forEach(m => seg(m.pos, m.pos + m.w, H + 16, String(m.w * 10)));
    seg(0, len, H + 38, (len * 10) + ' mm');
    const x = len + 24, marks = [0, zoc, zoc + 80, 150, 220, H].filter((v, i, a) => a.indexOf(v) === i);
    ln(x, Y(0), x, Y(H), INK, .6);
    marks.forEach(z => { ln(x - 4, Y(z), x + 4, Y(z), INK, .6); tx(x + 8, Y(z), String(z * 10), { fs: 7.5, anchor: 'start' }); });
  }
  return { items: it, vb: [-40, -30, len + 110, H + 90] };
}

// ---------- parts ----------
function parts(m, mats) {
  const W = m.w * 10, H = m.h * 10, D = m.d * 10, t = 18;
  const cu = MATS[m.cue || mats.cuerpo], fr = MATS[m.fre || mats.frentes];
  const cuN = cu.type.split(' ')[0] + ' ' + cu.name, frN = fr.type.split(' ')[0] + ' ' + fr.name;
  const P = [];
  const add = (pieza, cant, L, A, esp, mat, veta, cantos, box, grp) => P.push({ pieza, cant, L: Math.round(L), A: Math.round(A), esp, mat, veta, cantos, box, grp });
  if (m.type === 'fridge' || m.type === 'hood' || m.glb) return P;
  if (m.appl) { add('Panel frontal', 1, H - 4, W - 4, 18, frN, 'Vertical', '4L', null, 'door'); return P; }
  add('Lateral', 2, H, D, t, cuN, 'Vertical', '1L', null, 'lat');
  add('Base', 1, W - 2 * t, D, t, cuN, 'Horizontal', '1L', null, 'base');
  if (m.type === 'base') add('Travesaño', 2, W - 2 * t, 100, t, cuN, 'Horizontal', '1L', null, 'trav');
  else add('Techo', 1, W - 2 * t, D, t, cuN, 'Horizontal', '1L', null, 'top');
  add('Trasera', 1, W - 4, H - 4, 6, 'HDF Blanco 6 mm', '—', '—', null, 'back');
  const nSh = m.fr.some(f => f.t === 'open') ? (m.fr.some(f => f.rod) ? 2 : 4) : m.type === 'tall' ? 3 : m.fr.every(f => f.t === 'drawer') ? 0 : 1;
  if (nSh) add('Entrepaño', nSh, W - 2 * t - 2, D - 20, t, cuN, 'Horizontal', '1L', null, 'shelf');
  m.fr.forEach(seg => {
    const sh = seg.f * H;
    if (seg.t === 'door') add('Puerta', seg.n || 1, sh - 4, W / (seg.n || 1) - 4, 18, frN, 'Vertical', '4L', null, 'door');
    if (seg.t === 'drawer') add('Frente de cajón', 1, W - 4, sh - 4, 18, frN, 'Horizontal', '4L', null, 'drawer');
    if (seg.t === 'oven') add('Remate de horno', 1, W - 4, 60, 18, frN, 'Horizontal', '4L', null, 'drawer');
  });
  const merged = [];
  P.forEach(p => { const e = merged.find(q => q.pieza === p.pieza && q.L === p.L && q.A === p.A && q.mat === p.mat); if (e) e.cant += p.cant; else merged.push(p); });
  merged.forEach((p, i) => p.ref = i + 1);
  return merged;
}
function exploded(m, mats) {
  const W = m.w * 10, H = m.h * 10, D = m.d * 10, t = 18, e = Math.max(W, H) * .16;
  const C = cols(m, mats);
  const a = 40 * Math.PI / 180, s = Math.sin(a), c = Math.cos(a);
  const Pj = (x, y, z) => [x * c - y * s, (x * s + y * c) * 0.55 - z * 0.83];
  const bx = [1e9, 1e9, -1e9, -1e9], it = [];
  const pt = p => { const q = Pj(p[0], p[1], p[2]); bx[0] = Math.min(bx[0], q[0]); bx[1] = Math.min(bx[1], q[1]); bx[2] = Math.max(bx[2], q[0]); bx[3] = Math.max(bx[3], q[1]); return q[0].toFixed(1) + ' ' + q[1].toFixed(1); };
  const boxes = [];
  const pr = parts(m, mats); const ref = g => (pr.find(p => p.grp === g) || {}).ref;
  boxes.push([-e, t - e, 0, D, 0, H, C.b, ref('lat')]);
  boxes.push([W - t + e, W + e, 0, D, 0, H, C.b, ref('lat')]);
  boxes.push([t, W - t, 0, D, -e, t - e, C.b, ref('base')]);
  if (m.type === 'base') { boxes.push([t, W - t, D - 100, D, H - t + e, H + e, C.b, ref('trav')]); boxes.push([t, W - t, 0, 100, H - t + e, H + e, C.b, ref('trav')]); }
  else boxes.push([t, W - t, 0, D, H - t + e, H + e, C.b, ref('top')]);
  boxes.push([0, W, -6 - e, -e, 0, H, '#e8e4dc', ref('back')]);
  if (ref('shelf')) boxes.push([t, W - t, 0, D - 20, H / 2, H / 2 + t, shade(C.b, -.04), ref('shelf')]);
  let v = 0;
  m.fr.forEach(seg => {
    const z0 = v * H, z1 = (v + seg.f) * H; v += seg.f;
    const n = seg.t === 'door' ? (seg.n || 1) : 1;
    if (seg.t === 'open') return;
    for (let i = 0; i < n; i++) boxes.push([W * i / n + 2, W * (i + 1) / n - 2, D + e * 1.3, D + e * 1.3 + 18, z0 + 2, z1 - 2, seg.t === 'oven' ? '#2d2c2b' : C.f, ref(seg.t === 'door' ? 'door' : 'drawer')]);
  });
  boxes.sort((p, q) => ((p[0] + p[1]) * s + (p[2] + p[3]) * c) - ((q[0] + q[1]) * s + (q[2] + q[3]) * c));
  const labels = [];
  boxes.forEach(b => {
    const [x0, x1, y0, y1, z0, z1, col, r] = b, ed = shade(col, -.35);
    const poly = ps => 'M' + ps.map(pt).join('L') + 'Z';
    it.push({ d: poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]), fill: shade(col, .12), stroke: ed, sw: 1.5 });
    it.push({ d: poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]), fill: col, stroke: ed, sw: 1.5 });
    it.push({ d: poly([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]), fill: shade(col, -.16), stroke: ed, sw: 1.5 });
    if (r) { const q = Pj((x0 + x1) / 2, y1, (z0 + z1) / 2); labels.push([q, r]); }
  });
  const R = Math.max(W, H) * .028;
  labels.forEach(([q, r]) => { it.push({ t: 'c', cx: q[0], cy: q[1], r: R, fill: ACC, stroke: '#fff', sw: R * .15 }); it.push({ t: 'text', x: q[0], y: q[1], s: String(r), fs: R * 1.1, fill: '#fff', fw: 800 }); });
  const pad = Math.max(W, H) * .06;
  return { items: it, vb: [bx[0] - pad, bx[1] - pad, bx[2] - bx[0] + 2 * pad, bx[3] - bx[1] + 2 * pad] };
}
// orthographic views with cotas (mm)
function ortho(m, mats, view, hstyle) {
  const it = [], W = m.w * 10, H = m.h * 10, D = m.d * 10, C = cols(m, mats);
  const P = (x, y) => x.toFixed(1) + ' ' + y.toFixed(1);
  const rect = (x, y, w, h, fill, stroke, sw, dash) => it.push({ d: `M${P(x, y)}L${P(x + w, y)}L${P(x + w, y + h)}L${P(x, y + h)}Z`, fill, stroke, sw, dash });
  const ln = (x1, y1, x2, y2, stroke, sw, dash) => it.push({ d: `M${P(x1, y1)}L${P(x2, y2)}`, stroke, sw, dash });
  const k = Math.max(W, H, D) / 100, fs = 4.2 * k, sw = .35 * k;
  const dimH = (x0, x1, y, lbl) => { ln(x0, y, x1, y, INK, sw); ln(x0, y - 3 * k, x0, y + 3 * k, INK, sw); ln(x1, y - 3 * k, x1, y + 3 * k, INK, sw); it.push({ t: 'text', x: (x0 + x1) / 2, y: y + 5 * k, s: lbl, fs }); };
  const dimV = (y0, y1, x, lbl) => { ln(x, y0, x, y1, INK, sw); ln(x - 3 * k, y0, x + 3 * k, y0, INK, sw); ln(x - 3 * k, y1, x + 3 * k, y1, INK, sw); it.push({ t: 'text', x: x + 5 * k, y: (y0 + y1) / 2, s: lbl, fs, rot: 90 }); };
  let w, h;
  if (view === 'front') {
    const cm = Object.assign({}, m, { w: W, h: H }); front2D(cm, 0, 0, W, H, C, hstyle, null, it);
    it.forEach(p => { if (p.sw) p.sw *= k * .8; });
    w = W; h = H; dimH(0, W, H + 8 * k, String(W)); dimV(0, H, W + 8 * k, String(H));
  } else if (view === 'side') {
    rect(0, 0, D, H, C.b, INK, sw * 1.5); rect(D - 18, 0, 18, H, C.f, INK, sw);
    ln(0, 0, 0, H, INK, sw * 3);
    if (m.type !== 'fridge') ln(0, H / 2, D - 38, H / 2, INK, sw, `${2 * k} ${2 * k}`);
    w = D; h = H; dimH(0, D, H + 8 * k, String(D)); dimV(0, H, D + 8 * k, String(H));
  } else {
    rect(0, 0, W, D, C.b, INK, sw * 1.5); rect(0, D - 18, W, 18, C.f, INK, sw); rect(0, 0, W, 6, '#e8e4dc', INK, sw);
    ln(18, 6, 18, D - 18, INK, sw, `${2 * k} ${2 * k}`); ln(W - 18, 6, W - 18, D - 18, INK, sw, `${2 * k} ${2 * k}`);
    w = W; h = D; dimH(0, W, D + 8 * k, String(W)); dimV(0, D, W + 8 * k, String(D));
  }
  const pad = 6 * k;
  return { items: it, vb: [-pad, -pad, w + 20 * k, h + 18 * k] };
}
function price(m) {
  if (m.pBase) return m.pBase * 18 * (m.w / (m.w0 || m.w));
  if (m.type === 'fridge') return 32900;
  if (m.type === 'hood') return 11800;
  if (m.appl) return 14500 + m.w * 20;
  if (m.type === 'tall') return 9800 + m.w * 165 + (m.oven ? 2400 : 0);
  if (m.type === 'upper') return 3200 + m.w * 62;
  return 5400 + m.w * 88 + m.fr.filter(f => f.t === 'drawer').length * 1400 + (m.sink ? 2200 : 0);
}
window.SPEngine = { MATS, GROUPS, KITCHEN, ISLAND, LINEAL, CLOSET, VESTIDOR, LIB, iso, plan, elev, frontThumb, parts, exploded, ortho, price, geo, zr, shade, wallPt, handleOf };
})();
