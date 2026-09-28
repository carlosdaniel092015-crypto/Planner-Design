// Stephanny Planner — realistic three.js renderer (live viewer + offscreen snapshots)
const V = '0.184.0', B = `https://unpkg.com/three@${V}/`;
let T = null, OrbitControls, RoomEnvironment, GLTFLoader, RoundedBoxGeometry;
const blobs = {}, RES = () => window.__resources || {};
const rid = p => 'th_' + p.replace(/[^a-z0-9]/gi, '_');
const srcOf = p => RES()[rid(p)] || (B + p);
function mod(p) {
  if (blobs[p]) return blobs[p];
  return blobs[p] = (async () => {
    let src = await (await fetch(srcOf(p))).text();
    const deps = new Set([...src.matchAll(/(?:from|import)\s*['"](\.{1,2}\/[^'"]+)['"]/g)].map(m => m[1]));
    for (const d of deps) { const np = new URL(d, B + p).href.slice(B.length), b = await mod(np); src = src.split("'" + d + "'").join("'" + b + "'").split('"' + d + '"').join('"' + b + '"'); }
    if (/from\s*['"]three['"]/.test(src)) { const tb = await mod('build/three.module.js'); src = src.replace(/from\s*['"]three['"]/g, "from '" + tb + "'"); }
    return URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  })();
}
let initP = null;
export function init() {
  return initP || (initP = (async () => {
    T = await import(await mod('build/three.module.js'));
    const mods = await Promise.all(['controls/OrbitControls.js', 'environments/RoomEnvironment.js', 'loaders/GLTFLoader.js', 'geometries/RoundedBoxGeometry.js'].map(async p => import(await mod('examples/jsm/' + p))));
    OrbitControls = mods[0].OrbitControls; RoomEnvironment = mods[1].RoomEnvironment; GLTFLoader = mods[2].GLTFLoader; RoundedBoxGeometry = mods[3].RoundedBoxGeometry;
  })());
}

// ---------- procedural textures ----------
const texCache = {};
function rnd(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }
function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function hexRgb(h) { return [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16)); }
function mute(c, k) { const l = c[0] * .3 + c[1] * .59 + c[2] * .11; return c.map(v => v + (l - v) * k); }
function muteHex(h, k) { return '#' + mute(hexRgb(h), k).map(v => Math.round(v).toString(16).padStart(2, '0')).join(''); }
function rgb(a, k) { return `rgb(${a.map(v => Math.max(0, Math.min(255, Math.round(v * k)))).join(',')})`; }
function noise(g, w, h, r, amp) {
  const d = g.getImageData(0, 0, w, h), p = d.data;
  for (let i = 0; i < p.length; i += 4) { const n = (r() - .5) * amp; p[i] += n; p[i + 1] += n; p[i + 2] += n; }
  g.putImageData(d, 0, 0);
}
function ctex(key, w, h, draw) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h, rnd(hashStr(key)));
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8;
  return texCache[key] = t;
}
function grain(g, x0, y0, w, h, c, r, n) {
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * w, amp = 1.5 + r() * 7, fr = 2 * Math.PI * (1 + Math.floor(r() * 3)) / h, ph = r() * 6;
    g.strokeStyle = rgb(c, r() < .72 ? .7 + r() * .16 : 1.06 + r() * .1);
    g.globalAlpha = .06 + r() * .22; g.lineWidth = .5 + r() * 2.2;
    g.beginPath();
    for (let y = 0; y <= h; y += 12) { const xx = x + Math.sin(y * fr + ph) * amp; y ? g.lineTo(xx, y0 + y) : g.moveTo(xx, y0 + y); }
    g.stroke();
  }
  g.globalAlpha = 1;
}
// Colour fidelity: textures keep the catalogue colour (the prototype muted them 20–30 %, which washed out every finish).
const WOOD_MUTE = .04;
function woodTex(hex) {
  return ctex('wood' + hex, 512, 1024, (g, w, h, r) => {
    const c = mute(hexRgb(hex), WOOD_MUTE); g.fillStyle = rgb(c, 1); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) { g.globalAlpha = .3; g.fillStyle = rgb(c, .88 + r() * .22); g.fillRect(r() * w, 0, 18 + r() * 70, h); }
    g.globalAlpha = 1; grain(g, 0, 0, w, h, c, r, 240); noise(g, w, h, r, 9);
  });
}
function stoneTex(hex, dark) {
  return ctex('stone' + hex + dark, 512, 512, (g, w, h, r) => {
    const c = hexRgb(hex); g.fillStyle = rgb(c, 1); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 7000; i++) {
      const k = dark ? (r() < .1 ? 2.4 + r() * 2 : .7 + r() * .9) : .82 + r() * .12;
      g.globalAlpha = dark ? .5 : .35; g.fillStyle = rgb(dark ? [70, 68, 66] : c, k);
      g.beginPath(); g.arc(r() * w, r() * h, .5 + r() * (dark ? 2.2 : 1.6), 0, 7); g.fill();
    }
    if (!dark) { g.globalAlpha = .06; g.strokeStyle = '#8c8880'; g.lineWidth = 3; for (let i = 0; i < 3; i++) { g.beginPath(); let x = r() * w, y = 0; g.moveTo(x, y); while (y < h) { x += (r() - .5) * 40; y += 20; g.lineTo(x, y); } g.stroke(); } }
    g.globalAlpha = 1; noise(g, w, h, r, 6);
  });
}
function plainTex(hex, amp) { return ctex('plain' + hex + amp, 256, 256, (g, w, h, r) => { g.fillStyle = hex; g.fillRect(0, 0, w, h); noise(g, w, h, r, amp || 6); }); }
function floorTex() {
  return ctex('floor', 1024, 1024, (g, w, h, r) => {
    const cols = 12, pw = w / cols, base = [168, 152, 132];
    for (let ci = 0; ci < cols; ci++) {
      let y = -r() * h * .5;
      while (y < h) {
        const len = h * (.25 + r() * .5), k = .92 + r() * .12;
        const c = base.map(v => v * k);
        g.save(); g.beginPath(); g.rect(ci * pw, y, pw, len); g.clip();
        g.fillStyle = rgb(c, 1); g.fillRect(ci * pw, y, pw, len);
        grain(g, ci * pw, Math.max(0, y), pw, Math.min(len, h), c, r, 26);
        g.restore();
        g.fillStyle = 'rgba(60,40,20,.55)'; g.fillRect(ci * pw, y, pw, 1.5);
        y += len;
      }
      g.fillStyle = 'rgba(60,40,20,.5)'; g.fillRect(ci * pw, 0, 1.5, h);
    }
    noise(g, w, h, r, 7);
  });
}
function tileTex() {
  return ctex('subway', 512, 512, (g, w, h, r) => {
    g.fillStyle = '#cdc7bd'; g.fillRect(0, 0, w, h);
    const tw = 128, th = 64;
    for (let row = 0; row < 8; row++) for (let i = -1; i < 5; i++) {
      const x = i * tw + (row % 2 ? tw / 2 : 0), y = row * th, k = .97 + r() * .05;
      g.fillStyle = rgb([242, 240, 235], k); g.fillRect(x + 2, y + 2, tw - 4, th - 4);
      const gr = g.createLinearGradient(0, y, 0, y + th); gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(0,0,0,.04)');
      g.fillStyle = gr; g.fillRect(x + 2, y + 2, tw - 4, th - 4);
    }
    noise(g, w, h, r, 3);
  });
}
function skyTex() {
  return ctex('sky', 64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#e9f1f5'); gr.addColorStop(.6, '#f7f5ef'); gr.addColorStop(1, '#d9dccf');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

// ---------- materials ----------
const matCache = {}, loadedTex = {}, glbCache = {};
function M(key, fn) { return matCache[key] || (matCache[key] = fn()); }
const std = (key, p) => M(key, () => new T.MeshStandardMaterial(p));
const mats = {
  plinth: () => std('plinth', { color: 0x2b2a28, roughness: .7 }),
  // Metals get their look from reflections: brighter environment on them only (the room stays calibrated).
  // Brushed stainless: part diffuse so it reads light grey like the real thing, not a dark mirror of the studio.
  steel: () => std('steel', { color: 0xc9cccd, metalness: .55, roughness: .32, envMapIntensity: 1.6 }),
  chrome: () => std('chrome', { color: 0xf0f0f0, metalness: 1, roughness: .08, envMapIntensity: 2 }),
  blackGlass: () => std('bglass', { color: 0x0d0d0d, metalness: .3, roughness: .06 }),
  gola: () => std('gola', { color: 0x1e1e1e, metalness: .6, roughness: .45 }),
  frame: () => std('frame', { color: 0x2a2a2a, metalness: .4, roughness: .5 }),
  trim: () => std('trim', { color: 0xf4f2ee, roughness: .6 }),
  glass: () => M('glass', () => new T.MeshStandardMaterial({ color: 0xcfe0e6, metalness: .1, roughness: .04, transparent: true, opacity: .22 })),
  sky: () => M('sky', () => new T.MeshBasicMaterial({ map: skyTex() })),
  wall: () => std('wall', { map: plainTex('#e8e6e2', 5), roughness: .95 }),
  led: () => M('led', () => new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1d6, emissiveIntensity: 2.2 })),
  edge: () => std('edge', { color: 0xcfc8bc, roughness: .9 })
};
function fabric(hex) { return std('fab' + hex, { color: new T.Color(hex), roughness: .95 }); }
function baseMat(id) {
  const E = window.SPEngine, m = E.MATS[id] || E.MATS.blanco, t = m.type || '';
  return M('m' + id + (m.img || '') + (m.tile || '') + (m.rough || ''), () => {
    let p = { color: 0xffffff, roughness: .55, metalness: 0 }, ud = { tile: .5, tileH: .5 }, phys = false;
    if (m.img) {
      const tx = loadedTex[m.img];
      if (tx) p.map = tx; else p.color = new T.Color(m.c);
      p.roughness = m.rough != null ? m.rough : .5; ud.tile = ud.tileH = (m.tile || 60) / 100;
      if (/Acero|Latón|Aluminio|Metal/.test(t)) p.metalness = .9;
    } else if (/Acero/.test(t)) Object.assign(p, { color: new T.Color('#c3c6c8'), metalness: .6, roughness: .3 });
    else if (/Latón/.test(t)) Object.assign(p, { color: new T.Color('#b9a275'), metalness: 1, roughness: .38 });
    else if (/Aluminio/.test(t)) Object.assign(p, { color: new T.Color(m.c), metalness: .6, roughness: .42 });
    else if (/Cuarzo/.test(t)) { phys = true; p.map = stoneTex(m.c, false); Object.assign(p, { roughness: .2, clearcoat: .35, clearcoatRoughness: .25, bumpMap: p.map, bumpScale: .15 }); ud.tile = ud.tileH = .6; }
    else if (/Granito/.test(t)) { phys = true; p.map = stoneTex(m.c, true); Object.assign(p, { roughness: .16, clearcoat: .45, clearcoatRoughness: .2, bumpMap: p.map, bumpScale: .2 }); ud.tile = ud.tileH = .6; }
    else if (m.wood) { p.map = woodTex(m.c); p.roughness = /Chapa/.test(t) ? .42 : .56; p.bumpMap = p.map; p.bumpScale = .35; ud.tile = .6; ud.tileH = 1.2; }
    else if (/Lacado/.test(t)) { phys = true; Object.assign(p, { color: new T.Color(m.c), roughness: .46, clearcoat: .2, clearcoatRoughness: .5 }); }
    else { p.map = plainTex(m.c, 4); p.roughness = .62; }
    if (p.metalness > .5) p.envMapIntensity = 1.8;
    const mat = phys ? new T.MeshPhysicalMaterial(p) : new T.MeshStandardMaterial(p);
    mat.userData = ud; return mat;
  });
}
function texMat(id, w, h, rotate, seed) {
  const base = baseMat(id);
  if (!base.map) return base;
  const m = base.clone(); m.map = base.map.clone(); if (base.bumpMap) m.bumpMap = m.map; m.userData = Object.assign({ clone: 1 }, base.userData);
  const tw = base.userData.tile, th = base.userData.tileH, r = rnd(seed * 7919 + 13);
  if (rotate) { m.map.center.set(.5, .5); m.map.rotation = Math.PI / 2; m.map.repeat.set(h / tw, w / th); }
  else m.map.repeat.set(w / tw, h / th);
  m.map.offset.set(r(), r()); m.map.needsUpdate = true;
  return m;
}
function tiledMat(tex, w, h, tile, props) {
  const { bump, physical, ...rest } = props || {};
  const m = physical ? new T.MeshPhysicalMaterial(Object.assign({ map: tex.clone() }, rest)) : new T.MeshStandardMaterial(Object.assign({ map: tex.clone() }, rest));
  m.map.repeat.set(w / tile, h / tile); m.map.needsUpdate = true; m.userData = { clone: 1 };
  if (props && props.bump) { m.bumpMap = m.map; m.bumpScale = props.bump; }
  return m;
}
function loadTex(url) {
  if (loadedTex[url]) return Promise.resolve(loadedTex[url]);
  return new T.TextureLoader().loadAsync(url).then(t => { t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; loadedTex[url] = t; return t; }).catch(() => null);
}
function loadGLB(url) {
  if (!glbCache[url]) glbCache[url] = new GLTFLoader().loadAsync(url).then(g => { g.scene.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } }); return g.scene; }).catch(() => null);
  return glbCache[url];
}
async function preload(cfg) {
  const E = window.SPEngine, urls = new Set(), glbs = new Set();
  Object.values(cfg.mats || {}).concat((cfg.mods || []).flatMap(m => [m.cue, m.fre])).forEach(id => { const m = id && E.MATS[id]; if (m && m.img) urls.add(m.img); });
  (cfg.mods || []).forEach(m => { if (m.glb) glbs.add(m.glb); });
  await Promise.all([...urls].map(loadTex).concat([...glbs].map(loadGLB)));
}

// ---------- geometry helpers ----------
function bx(parent, w, h, d, mat, x, y, z, opt) {
  if (w <= 0 || h <= 0 || d <= 0) return null;
  const g = opt && opt.round ? new RoundedBoxGeometry(w, h, d, 2, Math.min(.0025, w / 4, h / 4, d / 4)) : new T.BoxGeometry(w, h, d);
  const me = new T.Mesh(g, mat); me.position.set(x + w / 2, y + h / 2, z + d / 2);
  me.castShadow = !(opt && opt.noCast); me.receiveShadow = true; parent.add(me); return me;
}
function vbar(g, x, cy, L, zf, mat) {
  bx(g, .012, L, .012, mat, x - .006, cy - L / 2, zf + .02, { round: 1 });
  [cy - L / 2 + .02, cy + L / 2 - .02].forEach(y => bx(g, .007, .007, .022, mat, x - .0035, y - .0035, zf));
}
function hbar(g, cx, y, L, zf, mat) {
  bx(g, L, .012, .012, mat, cx - L / 2, y - .006, zf + .02, { round: 1 });
  [cx - L / 2 + .02, cx + L / 2 - .02].forEach(x => bx(g, .007, .007, .022, mat, x - .0035, y - .0035, zf));
}
const PAL = ['#3a404a', '#d6d1c8', '#8a8d88', '#eeece8', '#4a433e', '#a39888', '#5f666b', '#282828', '#b3a898', '#5e524a'];

function buildModule(m, ctx) {
  const E = window.SPEngine, g = new T.Group();
  g.userData = { modId: m.id, type: m.type };
  const W = m.w / 100, H = m.h / 100, D = m.d / 100;
  const zr = E.zr(m, ctx.zoc), yb = zr[0] / 100, yt = zr[1] / 100;
  const bodyId = m.cue || ctx.mats.cuerpo, frId = m.fre || ctx.mats.frentes, hdMat = baseMat(ctx.mats.jaladeras);
  let seed = m.id * 97 + Math.round(m.pos || m.x || 0);
  // Uploaded modules stand on the plinth like the parametric ones (recessed 6 cm; islands on both faces).
  const plinth = () => { if (m.type !== 'upper' && m.type !== 'fridge' && m.type !== 'hood' && ctx.zoc > 0) { const rz = m.wall === 'F' ? .06 : 0; bx(g, W - .004, yb, D - .018 - .06 - rz, mats.plinth(), .002, 0, rz); } };
  if (m.boards && m.boards.length) {
    plinth();
    // Uploaded model built from boards: each board where it is, in the project's body / front material.
    // Front boards facing the room open like the catalogue's: doors swing on their hinge, drawers slide out.
    const fronts = m.boards.filter(bd => bd.slot === 'frentes' && bd.thin === 1);
    const doors = fronts.filter(bd => !bd.drawer);
    for (const bd of m.boards) {
      const [x0, x1, y0, y1, z0, z1] = bd.b.map(v => v / 1000);
      const bw = x1 - x0, bh = z1 - z0, bdp = y1 - y0;
      const faceW = bd.thin === 0 ? bdp : bw, faceH = bd.thin === 2 ? bdp : bh;
      const mat = texMat(bd.slot === 'frentes' ? frId : bodyId, faceW, faceH, bd.slot === 'frentes' && faceW > faceH, seed++);
      if (!fronts.includes(bd)) { bx(g, bw, bh, bdp, mat, x0, yb + z0, y0); continue; }
      const top = yb + z1, bottom = yb + z0;
      if (bd.drawer) {
        const dr = new T.Group(); dr.userData.mv = { kind: 'drawer', travel: Math.min(.45, D * .7) }; g.add(dr);
        bx(dr, bw, bh, bdp, mat, x0, bottom, y0);
        if (ctx.handle === 'bar') hbar(dr, (x0 + x1) / 2, top - .04, Math.min(.32, bw * .5), y1, hdMat);
        continue;
      }
      // Pairs open from the middle; a single door follows the module's "Apertura" (right by default).
      const hingeLeft = doors.length > 1 ? (x0 + x1) / 2 < W / 2 : m.open === 'izq';
      const hx = hingeLeft ? x0 : x1;
      const pv = new T.Group(); pv.position.set(hx, 0, y0); pv.userData.mv = { kind: 'door', dir: hingeLeft ? -1 : 1 }; g.add(pv);
      bx(pv, bw, bh, bdp, mat, x0 - hx, bottom, 0);
      if (ctx.handle === 'bar') {
        const L = bh > 1.2 ? .32 : .16, cy = m.type === 'upper' ? bottom + .03 + L / 2 : top - .04 - L / 2;
        vbar(pv, (hingeLeft ? x1 - .035 : x0 + .035) - hx, cy, L, bdp, hdMat);
      }
    }
    return g;
  }
  if (m.glb) {
    const src = glbCache[m.glb + '_scene'];
    // The model fills the module's body (above the plinth), not the plinth height too.
    const y0 = m.type === 'upper' ? 1.5 : m.type === 'fridge' ? 0 : yb, y1 = m.type === 'upper' ? 1.5 + H : yt;
    plinth();
    if (src) {
      const o = src.clone(true), bb = new T.Box3().setFromObject(o), sz = bb.getSize(new T.Vector3());
      // A model not built from boards keeps its own colours unless a material was chosen for this module.
      if (m.fre || m.cue) { const tm = texMat(m.fre ? frId : bodyId, W, y1 - y0, false, seed++); o.traverse(c => { if (c.isMesh) c.material = tm; }); }
      o.scale.set(W / (sz.x || 1), (y1 - y0) / (sz.y || 1), D / (sz.z || 1));
      const bb2 = new T.Box3().setFromObject(o);
      o.position.set(-bb2.min.x, y0 - bb2.min.y, -bb2.min.z); g.add(o);
    } else bx(g, W, y1 - y0, D, texMat(bodyId, W, y1 - y0, false, seed), 0, y0, 0);
    return g;
  }
  if (m.type === 'fridge') {
    const st = mats.steel();
    bx(g, W, H, D - .03, st, 0, 0, 0);
    const split = H * .615;
    bx(g, W - .006, split - .006, .03, st, .003, .003, D - .03, { round: 1 });
    bx(g, W - .006, H - split - .006, .03, st, .003, split + .003, D - .03, { round: 1 });
    vbar(g, .05, split - .25, .36, D, mats.chrome()); vbar(g, .05, split + .2, .28, D, mats.chrome());
    return g;
  }
  if (m.type === 'hood') {
    const st = mats.steel();
    bx(g, W, .06, .5, st, 0, yb, 0);
    bx(g, W - .02, .004, .46, mats.led(), .01, yb - .002, .02, { noCast: 1 });
    bx(g, .3, Math.max(.1, ctx.H - yb - .06), .28, st, W / 2 - .15, yb + .06, 0);
    return g;
  }
  const FT = .018, TT = .018, gap = .0025, cd = D - FT, hh = yt - yb;
  if (m.type !== 'upper' && ctx.zoc > 0) { const rz = m.wall === 'F' ? .06 : 0; bx(g, W - .004, yb, cd - .06 - rz, mats.plinth(), .002, 0, rz); }
  const body = (w, h) => texMat(bodyId, w, h, false, seed++);
  bx(g, TT, hh, cd, body(cd, hh), 0, yb, 0); bx(g, TT, hh, cd, body(cd, hh), W - TT, yb, 0);
  bx(g, W - 2 * TT, TT, cd, body(W, cd), TT, yb, 0); bx(g, W - 2 * TT, TT, cd, body(W, cd), TT, yt - TT, 0);
  bx(g, W - 2 * TT, hh - 2 * TT, .006, body(W, hh), TT, yb + TT, .006);
  if (m.type === 'upper') bx(g, W - .04, .004, .012, mats.led(), .02, yb - .004, cd - .06, { noCast: 1 });
  let v = 0;
  m.fr.forEach(seg => {
    const s0 = yb + v * hh, s1 = yb + (v + seg.f) * hh, sh = s1 - s0; v += seg.f;
    const gc = ctx.handle === 'gola' && m.type !== 'upper' && (seg.t === 'door' || seg.t === 'drawer') ? .03 : 0;
    if (seg.t === 'door') {
      const n = seg.n || 1, w = W / n;
      // An inner shelf, so an open door doesn't reveal an empty box.
      if (sh > .4) bx(g, W - 2 * TT, TT, cd - .02, body(W, cd), TT, s0 + sh / 2, .006);
      const L = m.type === 'tall' ? .32 : .16;
      let cy = m.type === 'upper' ? s0 + .03 + L / 2 : s1 - .04 - L / 2;
      if (m.type === 'tall') cy = Math.min(s1 - .06 - L / 2, Math.max(s0 + .06 + L / 2, 1.05));
      for (let i = 0; i < n; i++) {
        // The hinge sits opposite the handle: single doors follow m.open, pairs open from the middle.
        const hingeLeft = n === 2 ? i === 0 : m.open === 'izq', hx = hingeLeft ? i * w : (i + 1) * w;
        const pv = new T.Group(); pv.position.set(hx, 0, cd); pv.userData.mv = { kind: 'door', dir: hingeLeft ? -1 : 1 }; g.add(pv);
        bx(pv, w - 2 * gap, sh - 2 * gap - gc, FT, texMat(frId, w, sh, false, seed++), (hingeLeft ? 0 : -w) + gap, s0 + gap, 0, { round: 1 });
        if (ctx.handle === 'bar') {
          const x = n === 2 ? W / 2 + (i ? .035 : -.035) : m.open === 'izq' ? W - .04 : .04;
          vbar(pv, x - hx, cy, L, FT, hdMat);
        }
      }
    } else if (seg.t === 'drawer') {
      const travel = Math.min(.45, cd * .75), dr = new T.Group(); dr.userData.mv = { kind: 'drawer', travel }; g.add(dr);
      bx(dr, W - 2 * gap, sh - 2 * gap - gc, FT, texMat(frId, W, sh, true, seed++), gap, s0 + gap, cd, { round: 1 });
      if (ctx.handle === 'bar') hbar(dr, W / 2, s1 - gc - .04, Math.min(.32, W * .5), cd + FT, hdMat);
      // Drawer box (sides, back, bottom) behind the front: visible when it slides out.
      const bw = W - 2 * TT - .026, bd = Math.min(cd - .04, .5), bh = Math.max(.06, (sh - gc) * .62), bz = cd - bd, bxX = TT + .013, by0 = s0 + .03, dm = body(bd, bh);
      bx(dr, bw, .012, bd, dm, bxX, by0, bz, { noCast: 1 });
      bx(dr, .012, bh, bd, dm, bxX, by0, bz, { noCast: 1 }); bx(dr, .012, bh, bd, dm, bxX + bw - .012, by0, bz, { noCast: 1 });
      bx(dr, bw, bh, .012, dm, bxX, by0, bz, { noCast: 1 });
    } else if (seg.t === 'oven') {
      bx(g, W - 2 * gap, sh - 2 * gap, FT, mats.blackGlass(), gap, s0 + gap, cd, { round: 1 });
      bx(g, W - .04, sh * .13, .004, mats.steel(), .02, s1 - sh * .17, cd + FT);
      hbar(g, W / 2, s1 - sh * .26, W * .72, cd + FT, mats.steel());
    } else if (seg.t === 'open') {
      const k = seg.rod ? 2 : 4, r = rnd(seed++);
      for (let i = 1; i < k; i++) bx(g, W - 2 * TT, TT, cd - .01, body(W, cd), TT, s0 + sh * i / k, 0);
      if (seg.rod) {
        const ry = s1 - .07, rod = new T.Mesh(new T.CylinderGeometry(.011, .011, W - 2 * TT, 16), mats.chrome());
        rod.rotation.z = Math.PI / 2; rod.position.set(W / 2, ry, cd / 2); rod.castShadow = true; g.add(rod);
        let x = TT + .03;
        while (x < W - TT - .05) {
          const t = .018 + r() * .02, gh = (ry - s0 - .12) * (.55 + r() * .4);
          bx(g, t, gh, .42, fabric(PAL[Math.floor(r() * PAL.length)]), x, ry - .05 - gh, cd / 2 - .21);
          bx(g, .004, .05, .004, mats.chrome(), x + t / 2, ry - .05, cd / 2 - .002, { noCast: 1 });
          x += t + .012 + r() * .03;
        }
      } else {
        for (let i = 0; i < k; i++) {
          const yb2 = s0 + sh * i / k + (i ? TT : 0);
          let x = TT + .02;
          while (x < W - TT - .2) {
            const n = 2 + Math.floor(r() * 4), sw = .24 + r() * .06, col = PAL[Math.floor(r() * PAL.length)];
            for (let j = 0; j < n; j++) bx(g, sw, .028, .28, fabric(j % 2 ? col : PAL[(PAL.indexOf(col) + 3) % PAL.length]), x + (r() - .5) * .01, yb2 + j * .03, .06);
            x += sw + .03 + r() * .05;
          }
        }
      }
    }
    if (gc) bx(g, W, gc, .03, mats.gola(), 0, s1 - gc, cd - .012);
  });
  return g;
}
function addSink(g, W, D, top) {
  const hw = Math.min(W - .14, .74), hx = (W - hw) / 2, hz0 = D - .08 - .42, st = mats.steel(), dep = .19;
  bx(g, hw, .004, .42, st, hx, top - dep, hz0);
  bx(g, .004, dep, .42, st, hx, top - dep, hz0); bx(g, .004, dep, .42, st, hx + hw - .004, top - dep, hz0);
  bx(g, hw, dep, .004, st, hx, top - dep, hz0); bx(g, hw, dep, .004, st, hx, top - dep, hz0 + .416);
  const dr = new T.Mesh(new T.CylinderGeometry(.03, .03, .004, 24), mats.frame()); dr.position.set(W / 2, top - dep + .005, hz0 + .21); g.add(dr);
  const fx = W / 2, fz = hz0 - .05;
  const base = new T.Mesh(new T.CylinderGeometry(.024, .026, .05, 24), mats.chrome()); base.position.set(fx, top + .025, fz); base.castShadow = true; g.add(base);
  const curve = new T.CatmullRomCurve3([[0, .04, 0], [0, .26, 0], [0, .33, .06], [0, .31, .17], [0, .25, .2]].map(p => new T.Vector3(fx + p[0], top + p[1], fz + p[2])));
  const tube = new T.Mesh(new T.TubeGeometry(curve, 48, .012, 14), mats.chrome()); tube.castShadow = true; g.add(tube);
  const lever = new T.Mesh(new T.CylinderGeometry(.006, .006, .08, 10), mats.chrome()); lever.rotation.z = 1.2; lever.position.set(fx + .05, top + .08, fz); g.add(lever);
}
function addCooktop(g, W, D, top) {
  const cw = Math.min(W - .08, .62), cz = D - .06 - .5;
  bx(g, cw, .006, .5, mats.blackGlass(), (W - cw) / 2, top, cz);
  const ring = std('ring', { color: 0x4a4a4a, roughness: .5 });
  [[.27, .3, .09], [.73, .3, .07], [.27, .72, .07], [.73, .72, .1]].forEach(([u, w, r]) => {
    const me = new T.Mesh(new T.RingGeometry(r - .006, r, 48), ring); me.rotation.x = -Math.PI / 2;
    me.position.set((W - cw) / 2 + cw * u, top + .0065, cz + .5 * w); g.add(me);
  });
}
// Walls C (x = A) and D (y = B) added for U-shaped and galley layouts: fronts face into the room.
function roomSize() { const r = window.SPEngine.room || { A: 0, B: 0 }; return { A: r.A / 100, B: r.B / 100 }; }
function place(g, m) {
  const E = window.SPEngine, geo = E.geo(m), R = roomSize();
  if (m.wall === 'B') { g.rotation.y = Math.PI / 2; g.position.set(0, 0, (m.pos + m.w) / 100); }
  else if (m.wall === 'C') { g.rotation.y = -Math.PI / 2; g.position.set(R.A, 0, m.pos / 100); }
  else if (m.wall === 'D') { g.rotation.y = Math.PI; g.position.set((m.pos + m.w) / 100, 0, R.B); }
  else g.position.set(geo.x0 / 100, 0, geo.y0 / 100);
}
function toWorld(m, lx, lz) {
  const E = window.SPEngine, geo = E.geo(m), R = roomSize();
  if (m.wall === 'B') return [lz, (m.pos + m.w) / 100 - lx];
  if (m.wall === 'C') return [R.A - lz, m.pos / 100 + lx];
  if (m.wall === 'D') return [(m.pos + m.w) / 100 - lx, R.B - lz];
  return [geo.x0 / 100 + lx, geo.y0 / 100 + lz];
}
const alongZ = wall => wall === 'B' || wall === 'C';
function slab(root, wall, a0, a1, d0, d1, y, th, holes, matId) {
  const cuts = [a0, a1]; holes.forEach(h => cuts.push(h.a0, h.a1));
  const pts = [...new Set(cuts)].filter(p => p >= a0 && p <= a1).sort((a, b) => a - b);
  const put = (p, q, e0, e1) => {
    if (q - p < .001 || e1 - e0 < .001) return;
    const mat = texMat(matId, q - p, e1 - e0, false, Math.round(p * 1000));
    if (alongZ(wall)) bx(root, e1 - e0, th, q - p, mat, e0, y, p); else bx(root, q - p, th, e1 - e0, mat, p, y, e0);
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1], h = holes.find(h => h.a0 <= p + 1e-4 && h.a1 >= q - 1e-4);
    if (h) { put(p, q, d0, h.d0); put(p, q, h.d1, d1); } else put(p, q, d0, d1);
  }
}
function counters(root, mods, ctx, groups) {
  const th = { cuarzo: .02, granito: .03, macizo: .04 }[ctx.mats.encimera] || .03, out = [];
  const bases = mods.filter(m => m.type === 'base');
  const by = {};
  bases.forEach(m => { const k = m.wall === 'F' ? 'F' + m.id : m.wall; (by[k] = by[k] || []).push(m); });
  const aCorner = bases.find(m => m.wall === 'A' && m.pos === 0);
  const R = roomSize(), atEnd = (w, len) => bases.find(m => m.wall === w && Math.abs((m.pos + m.w) / 100 - len) < .006);
  const aEnd = atEnd('A', R.A), bEnd = atEnd('B', R.B), cEnd = atEnd('C', R.B);
  Object.keys(by).forEach(k => {
    const list = by[k].sort((a, b) => (a.pos || a.x) - (b.pos || b.x)), wall = list[0].wall;
    const runs = [];
    list.forEach(m => { const s = (m.wall === 'F' ? m.x : m.pos) / 100, e = s + m.w / 100, last = runs[runs.length - 1]; if (last && s - last.e < .011) { last.e = Math.max(last.e, e); last.ms.push(m); } else runs.push({ s, e, ms: [m] }); });
    runs.forEach(r => {
      const top = Math.max(...r.ms.map(m => (ctx.zoc + m.h) / 100)), D = Math.max(...r.ms.map(m => m.d)) / 100;
      let a0 = r.s, a1 = r.e, d0 = 0, d1 = D + .02;
      if (wall === 'F') { const m = r.ms[0]; d0 = m.y / 100 - .02; d1 = (m.y + m.d) / 100 + .02; a0 -= .02; a1 += .02; }
      if (wall === 'B' && aCorner) a0 = Math.max(a0, aCorner.d / 100 + .02);
      if (wall === 'C') { d0 = R.A - D - .02; d1 = R.A; if (aEnd) a0 = Math.max(a0, aEnd.d / 100 + .02); }
      if (wall === 'D') { d0 = R.B - D - .02; d1 = R.B; if (bEnd) a0 = Math.max(a0, bEnd.d / 100 + .02); if (cEnd) a1 = Math.min(a1, R.A - cEnd.d / 100 - .02); }
      const holes = [];
      r.ms.filter(m => m.sink).forEach(m => {
        const W = m.w / 100, Dm = m.d / 100, hw = Math.min(W - .14, .74), hx = (W - hw) / 2, hz0 = Dm - .08 - .42;
        const p1 = toWorld(m, hx, hz0), p2 = toWorld(m, hx + hw, hz0 + .42);
        if (alongZ(wall)) holes.push({ a0: Math.min(p1[1], p2[1]), a1: Math.max(p1[1], p2[1]), d0: Math.min(p1[0], p2[0]), d1: Math.max(p1[0], p2[0]) });
        else holes.push({ a0: Math.min(p1[0], p2[0]), a1: Math.max(p1[0], p2[0]), d0: Math.min(p1[1], p2[1]), d1: Math.max(p1[1], p2[1]) });
      });
      slab(root, wall, a0, a1, d0, d1, top, th, holes, ctx.mats.encimera);
      r.ms.forEach(m => { const g = groups[m.id]; if (!g) return; if (m.sink) addSink(g, m.w / 100, m.d / 100, top + th); if (m.cook) addCooktop(g, m.w / 100, m.d / 100, top + th); });
      if (wall !== 'F') out.push({ wall, a0, a1, top: top + th });
    });
  });
  return out;
}
// Each wall is built in its own frame (along +x from 0 to len, interior towards +z, masonry at z ∈ [-t, 0]) and then
// placed like the modules on that wall. B and D run "backwards" in that frame, so their positions are mirrored.
const WALL_T = .12;
function wallFrame(wall, R) {
  if (wall === 'B') return { rot: Math.PI / 2, pos: [0, 0, R.B], len: R.B, mirror: true };
  if (wall === 'C') return { rot: -Math.PI / 2, pos: [R.A, 0, 0], len: R.B, mirror: false };
  if (wall === 'D') return { rot: Math.PI, pos: [R.A, 0, R.B], len: R.A, mirror: true };
  return { rot: 0, pos: [0, 0, 0], len: R.A, mirror: false };
}
function buildWall(root, wall, cfg, splash) {
  const R = { A: cfg.room.A / 100, B: cfg.room.B / 100 }, H = cfg.room.H / 100, fr = wallFrame(wall, R), len = fr.len, t = WALL_T;
  const g = new T.Group(); g.rotation.y = fr.rot; g.position.set(...fr.pos); g.userData.wall = wall; root.add(g);
  const loc = a => (fr.mirror ? len - a : a);
  const ops = (cfg.ops || []).filter(o => o.wall === wall).map(o => { const a = o.pos / 100, b = (o.pos + o.w) / 100; return { ...o, a: Math.min(loc(a), loc(b)), b: Math.max(loc(a), loc(b)) }; });
  const cuts = [0, len]; ops.forEach(o => cuts.push(o.a, o.b));
  const pts = [...new Set(cuts)].filter(p => p >= 0 && p <= len).sort((a, b) => a - b);
  const put = (p, q, y0, y1) => { if (q - p < .001 || y1 - y0 < .001) return; const me = bx(g, q - p, y1 - y0, t, mats.wall(), p, y0, -t); if (me) me.castShadow = false; };
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1], o = ops.find(o => o.a <= p + 1e-4 && o.b >= q - 1e-4);
    if (!o) { put(p, q, 0, H); continue; }
    const z0 = o.t === 'ventana' ? (o.z || 110) / 100 : 0;
    put(p, q, 0, z0); put(p, q, z0 + o.h / 100, H);
  }
  // Corner post so walls meet without a gap.
  bx(g, t, H, t, mats.wall(), -t, 0, -t, { noCast: 1 });
  ops.forEach(o => {
    const a = o.a, ow = o.b - o.a, z0 = o.t === 'ventana' ? (o.z || 110) / 100 : 0, oh = o.h / 100, f = .05;
    if (o.t === 'ventana') {
      const fm = mats.frame();
      bx(g, ow, f, .07, fm, a, z0, -.1); bx(g, ow, f, .07, fm, a, z0 + oh - f, -.1);
      bx(g, f, oh, .07, fm, a, z0, -.1); bx(g, f, oh, .07, fm, a + ow - f, z0, -.1); bx(g, .025, oh, .06, fm, a + ow / 2 - .0125, z0, -.095);
      bx(g, ow - 2 * f, oh - 2 * f, .004, mats.glass(), a + f, z0 + f, -.07, { noCast: 1 });
      bx(g, ow + .08, .025, .16, mats.trim(), a - .04, z0 - .025, -.12);
      // Daylight backdrop flush with the wall's outer face, the size of the opening: never peeks over the wall.
      bx(g, ow, oh, .005, mats.sky(), a, z0, -WALL_T - .006, { noCast: 1 });
    } else {
      const tr = mats.trim();
      bx(g, .06, oh + .06, .14, tr, a - .06, 0, -.13); bx(g, .06, oh + .06, .14, tr, a + ow, 0, -.13); bx(g, ow, .06, .14, tr, a, oh, -.13);
      bx(g, ow - .01, oh - .01, .04, texMat('fresno', ow, oh, false, 3), a + .005, 0, -.08, { round: 1 });
    }
  });
  const skirt = std('skirt', { color: 0xf4f2ee, roughness: .6 });
  let segs = [[0, len]];
  ops.filter(o => o.t === 'puerta').forEach(({ a: s0, b: e0 }) => { segs = segs.flatMap(([p, q]) => (e0 <= p || s0 >= q ? [[p, q]] : [[p, s0], [e0, q]].filter(x => x[1] - x[0] > .01))); });
  segs.forEach(([p, q]) => bx(g, q - p, .08, .012, skirt, p, 0, 0, { noCast: 1 }));
  // Backsplash tiles between the countertop and the uppers (1.5 m), cut around windows.
  splash.filter(r => r.wall === wall).forEach(r => {
    const a0 = Math.min(loc(r.a0), loc(r.a1)), a1 = Math.max(loc(r.a0), loc(r.a1)), win = ops.filter(o => o.t === 'ventana');
    const cs = [a0, a1]; win.forEach(o => cs.push(o.a, o.b));
    const ps = [...new Set(cs)].filter(p => p >= a0 && p <= a1).sort((x, y) => x - y);
    for (let i = 0; i < ps.length - 1; i++) {
      const p = ps[i], q = ps[i + 1], o = win.find(o => o.a <= p + 1e-4 && o.b >= q - 1e-4);
      const y1 = o ? Math.min(1.5, (o.z || 110) / 100 - .025) : 1.5, y0 = r.top;
      if (y1 - y0 < .01) continue;
      bx(g, q - p, y1 - y0, .008, tiledMat(tileTex(), q - p, y1 - y0, .6, { roughness: .18 }), p, y0, 0, { noCast: 1 });
    }
  });
  return g;
}
function buildRoom(root, cfg, ctx, runs) {
  const A = cfg.room.A / 100, Bw = cfg.room.B / 100;
  const fl = new T.Mesh(new T.PlaneGeometry(A, Bw), tiledMat(floorTex(), A, Bw, 1.8, { physical: true, roughness: .5, clearcoat: .25, clearcoatRoughness: .4, bump: .25 }));
  fl.rotation.x = -Math.PI / 2; fl.position.set(A / 2, 0, Bw / 2); fl.receiveShadow = true; root.add(fl);
  bx(root, A + 2 * WALL_T, .05, Bw + 2 * WALL_T, mats.edge(), -WALL_T, -.0501, -WALL_T, { noCast: 1 });
  return ['A', 'B', 'C', 'D'].map(w => buildWall(root, w, cfg, ctx.kitchen ? runs : []));
}
/** Hides the walls standing between the camera and the room (dynamic cut-away), so any side can be viewed. */
function cutaway(walls, cam, cfg) {
  if (!walls) return;
  const A = cfg.room.A / 100, Bw = cfg.room.B / 100, p = cam.position;
  const out = { A: p.z < 0, B: p.x < 0, C: p.x > A, D: p.z > Bw };
  walls.forEach(g => { g.visible = !out[g.userData.wall]; });
}
function addLights(root, cfg, mods) {
  const A = cfg.room.A / 100, Bw = cfg.room.B / 100;
  root.add(new T.HemisphereLight(0xf6f5f2, 0xa8a49c, HEMI));
  const sun = new T.DirectionalLight(0xfff7ec, SUN);
  sun.position.set(A + 3.4, 4.6, Bw * .7 + .6); sun.target.position.set(A * .3, 0, Bw * .3);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera, ext = Math.max(A, Bw) * .9 + 1; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = .5; sc.far = 18;
  sun.shadow.bias = -.0004; sun.shadow.normalBias = .02; sun.shadow.radius = 5;
  root.add(sun, sun.target);
  const fill = new T.DirectionalLight(0xe8f0ff, .35); fill.position.set(A * .4, 2.2, -2); root.add(fill);
  mods.filter(m => m.type === 'upper').slice(0, 4).forEach(m => {
    const [x, z] = toWorld(m, m.w / 200, m.d / 100 - .08);
    const pl = new T.PointLight(0xfff3e2, .35, 1.3, 1.6); pl.position.set(x, 1.47, z); root.add(pl);
  });
}
function buildScene(root, cfg) {
  const ctx = { handle: cfg.handle || 'bar', zoc: cfg.zoc == null ? 10 : cfg.zoc, mats: cfg.mats, H: cfg.room.H / 100, kitchen: cfg.kitchen !== false };
  const groups = {}, list = cfg.mods || [];
  list.forEach(m => { if (m.glb) glbCache[m.glb + '_scene'] = glbCache[m.glb + '_scene'] || null; });
  list.forEach(m => { const g = buildModule(m, ctx); place(g, m); root.add(g); groups[m.id] = g; });
  const runs = counters(root, list, ctx, groups);
  root.userData.walls = buildRoom(root, cfg, ctx, runs);
  addLights(root, cfg, list);
  return groups;
}
function collectMovers(root) { const out = []; root.traverse(o => { if (o.userData && o.userData.mv) out.push(o); }); return out; }
/** k: 0 closed … 1 open. Doors swing ~95° on their hinge, drawers slide out. */
function applyOpen(movers, k) {
  const e = k * k * (3 - 2 * k);
  movers.forEach(o => { const mv = o.userData.mv; if (mv.kind === 'door') o.rotation.y = mv.dir * e * 1.66; else o.position.z = mv.travel * e; });
}
function disposeTree(o) {
  o.traverse(c => { if (c.isMesh) { c.geometry.dispose(); const m = c.material; if (m && m.userData && m.userData.clone) { if (m.map) m.map.dispose(); m.dispose(); } } });
}
async function resolveGlbs(cfg) {
  await preload(cfg);
  for (const m of cfg.mods || []) if (m.glb) glbCache[m.glb + '_scene'] = await glbCache[m.glb];
}
/** Camera azimuth that faces the most fronts: U → from the D side, galley → from the C side, otherwise the corner view. */
function defaultAz(cfg) {
  const mods = cfg.mods || [], on = w => mods.some(m => m.wall === w);
  if (on('C')) return 0;
  if (on('D')) return Math.PI / 2;
  return Math.PI / 4;
}
/** A saved camera is used only when every number is finite (a broken one falls back to the automatic view). */
const validCam = c => !!c && [c.az, c.polar, c.dist, ...(c.target || [])].length === 6 && [c.az, c.polar, c.dist, ...c.target].every(Number.isFinite) && c.dist > 0;
function camFor(cam, target, dist, az, polar) {
  cam.position.set(target.x + dist * Math.sin(polar) * Math.sin(az), target.y + dist * Math.cos(polar), target.z + dist * Math.sin(polar) * Math.cos(az));
  cam.lookAt(target);
}
function frameBox(groups, cfg, focusId) {
  const bb = new T.Box3();
  if (focusId && groups[focusId]) bb.setFromObject(groups[focusId]);
  else { Object.values(groups).forEach(g => bb.expandByObject(g)); if (bb.isEmpty()) bb.set(new T.Vector3(0, 0, 0), new T.Vector3(cfg.room.A / 100, 2.2, cfg.room.B / 100)); }
  return bb;
}
// Khronos PBR Neutral keeps base colours faithful; exposure/lights are calibrated so a lit front ≈ its catalogue hex.
const EXPOSURE = 1, ENV = .5, HEMI = .55, SUN = 1.7;
function mkRenderer(preserve) {
  const r = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !!preserve });
  r.outputColorSpace = T.SRGBColorSpace; r.toneMapping = T.NeutralToneMapping || T.ACESFilmicToneMapping; r.toneMappingExposure = EXPOSURE;
  r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
  const pm = new T.PMREMGenerator(r); r.userData = { env: pm.fromScene(new RoomEnvironment(), .04).texture }; pm.dispose();
  return r;
}

// ---------- live viewer ----------
class Viewer {
  constructor(host, opts) {
    this.host = host; this.opts = opts || {}; this.ver = 0;
    const r = this.r = mkRenderer(true); r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.domElement.style.cssText = 'width:100%;height:100%;display:block;cursor:grab;touch-action:none';
    host.appendChild(r.domElement);
    this.ov = document.createElement('div'); this.ov.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
    host.appendChild(this.ov);
    this.scene = new T.Scene(); this.scene.environment = r.userData.env; this.scene.environmentIntensity = ENV;
    this.cam = new T.PerspectiveCamera(38, 1, .05, 100);
    const c = this.ctl = new OrbitControls(this.cam, r.domElement);
    Object.assign(c, { enableDamping: true, dampingFactor: .08, minPolarAngle: .25, maxPolarAngle: 1.47, minDistance: 1, maxDistance: 16, screenSpacePanning: true });
    c.addEventListener('change', () => this.dirty = true);
    this.root = new T.Group(); this.scene.add(this.root); this.groups = {};
    this.sel = new T.Group(); this.scene.add(this.sel); this.labels = [];
    const el = r.domElement;
    el.addEventListener('pointerdown', e => { this.pd = [e.clientX, e.clientY]; el.style.cursor = 'grabbing'; });
    el.addEventListener('pointerup', e => { el.style.cursor = 'grab'; if (!this.pd || Math.hypot(e.clientX - this.pd[0], e.clientY - this.pd[1]) > 5) return; this.pick(e); });
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host); this.resize();
    this.openK = 0; this.openTo = 0; this.movers = [];
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (this.tw) this.tw();
      if (this.openK !== this.openTo) { const d = this.openTo - this.openK, st = Math.sign(d) * Math.min(Math.abs(d), .045); this.openK += st; applyOpen(this.movers, this.openK); this.dirty = true; }
      if (this.ctl.update() || this.dirty) { this.dirty = false; this.renderNow(); }
    };
    loop();
  }
  resize() { const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1; this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); if (this.ready) this.renderNow(); else this.dirty = true; }
  pick(e) {
    const rc = this.r.domElement.getBoundingClientRect(), ray = new T.Raycaster();
    ray.setFromCamera(new T.Vector2((e.clientX - rc.left) / rc.width * 2 - 1, -(e.clientY - rc.top) / rc.height * 2 + 1), this.cam);
    const hits = ray.intersectObjects(Object.values(this.groups).filter(g => g.visible), true);
    let id = null;
    if (hits.length) { let o = hits[0].object; while (o && !(o.userData && o.userData.modId)) o = o.parent; id = o ? o.userData.modId : null; }
    // Ctrl/⌘ (or Shift) + click adds or removes the module from the selection.
    this.opts.onSelect && this.opts.onSelect(id, e.ctrlKey || e.metaKey || e.shiftKey);
  }
  async update(cfg) {
    this.cfg = cfg;
    const light = JSON.stringify([cfg.sel, cfg.sels, cfg.cotas, cfg.altos, cfg.bg]);
    const E = window.SPEngine;
    const texSig = Object.keys(E.MATS).filter(k => E.MATS[k].img).map(k => k + E.MATS[k].tile + E.MATS[k].rough).join();
    const sig = JSON.stringify([cfg.mods, cfg.mats, cfg.room, cfg.ops, cfg.handle, cfg.zoc, cfg.kitchen, texSig]);
    if (sig === this.sig && light === this.light) return;
    this.light = light; this.scene.background = new T.Color(cfg.bg || '#d3cec6');
    if (sig !== this.sig) {
      this.sig = sig; const ver = ++this.ver;
      await resolveGlbs(cfg); if (ver !== this.ver || this.dead) return;
      disposeTree(this.root); this.scene.remove(this.root);
      this.root = new T.Group(); this.scene.add(this.root);
      this.groups = buildScene(this.root, cfg);
      this.movers = collectMovers(this.root); applyOpen(this.movers, this.openK);
      const rs = JSON.stringify(cfg.room);
      if (rs !== this.roomSig) { this.roomSig = rs; this.fit(true); }
      if (!this.ready) { this.ready = true; this.opts.onReady && this.opts.onReady(); }
    }
    Object.values(this.groups).forEach(g => { g.visible = cfg.altos !== false || !(g.userData.type === 'upper' || g.userData.type === 'hood'); });
    this.drawSel(); this.renderNow();
  }
  renderNow() { this.dirty = false; if (this.cfg) cutaway(this.root.userData.walls, this.cam, this.cfg); this.r.render(this.scene, this.cam); this.placeLabels(); }
  /** Opens (true) or closes every door and drawer with a short animation. */
  setOpen(open) { this.openTo = open ? 1 : 0; this.dirty = true; }
  label(text, pos, dark) {
    const d = document.createElement('div');
    d.textContent = text;
    d.style.cssText = `position:absolute;left:0;top:0;white-space:nowrap;font:800 11px Archivo,system-ui,sans-serif;padding:3px 7px;color:#fff;background:${dark ? '#201e1d' : '#ec3013'};box-shadow:0 1px 3px rgba(0,0,0,.25)`;
    this.ov.appendChild(d); this.labels.push({ d, p: pos });
  }
  line(pts, col) {
    const g = new T.BufferGeometry().setFromPoints(pts), l = new T.Line(g, new T.LineBasicMaterial({ color: col, depthTest: false, transparent: true }));
    l.renderOrder = 999; this.sel.add(l);
  }
  drawSel() {
    this.sel.children.slice().forEach(c => { c.geometry && c.geometry.dispose(); this.sel.remove(c); });
    this.labels.forEach(l => l.d.remove()); this.labels = [];
    const cfg = this.cfg, m = (cfg.mods || []).find(x => x.id === cfg.sel), g = m && this.groups[m.id];
    const RED = 0xec3013, INK = 0x201e1d, V3 = (x, y, z) => new T.Vector3(x, y, z);
    // Other selected modules: a thinner box each (the primary keeps its dimensions).
    (cfg.sels || []).filter(id => id !== cfg.sel).forEach(id => {
      const og = this.groups[id]; if (!og || !og.visible) return;
      const h = new T.Box3Helper(new T.Box3().setFromObject(og).expandByScalar(.004), RED); h.material.depthTest = false; h.material.transparent = true; h.material.opacity = .75; h.renderOrder = 999; this.sel.add(h);
    });
    if (g && g.visible) {
      const bb = new T.Box3().setFromObject(g).expandByScalar(.004);
      const h = new T.Box3Helper(bb, RED); h.material.depthTest = false; h.material.transparent = true; h.renderOrder = 999; this.sel.add(h);
      if (cfg.cotas) {
        const y = bb.max.y + .08, a = bb.min, b = bb.max;
        if (m.wall === 'B') { this.line([V3(b.x, y, a.z), V3(b.x, y, b.z)], RED); this.label(m.w * 10 + ' mm', V3(b.x, y + .03, (a.z + b.z) / 2)); this.line([V3(b.x + .06, a.y, a.z), V3(b.x + .06, b.y, a.z)], RED); this.label((Math.round((b.y - a.y) * 1000 / 10) * 10) + ' mm', V3(b.x + .06, (a.y + b.y) / 2, a.z)); }
        else { this.line([V3(a.x, y, b.z), V3(b.x, y, b.z)], RED); this.label(m.w * 10 + ' mm', V3((a.x + b.x) / 2, y + .03, b.z)); this.line([V3(b.x, a.y, b.z + .06), V3(b.x, b.y, b.z + .06)], RED); this.label((Math.round((b.y - a.y) * 1000 / 10) * 10) + ' mm', V3(b.x, (a.y + b.y) / 2, b.z + .06)); }
      }
    }
    if (cfg.cotas) {
      const A = cfg.room.A / 100, Bw = cfg.room.B / 100, H = cfg.room.H / 100 + .12;
      this.line([V3(0, H, -.12), V3(A, H, -.12)], INK); this.label(cfg.room.A * 10 + ' mm · Muro A', V3(A / 2, H + .05, -.12), 1);
      this.line([V3(-.12, H, 0), V3(-.12, H, Bw)], INK); this.label(cfg.room.B * 10 + ' mm · Muro B', V3(-.12, H + .05, Bw / 2), 1);
    }
  }
  placeLabels() {
    const w = this.host.clientWidth, h = this.host.clientHeight, v = new T.Vector3();
    this.labels.forEach(l => { v.copy(l.p).project(this.cam); const vis = v.z < 1; l.d.style.display = vis ? '' : 'none'; l.d.style.transform = `translate(${(v.x + 1) / 2 * w}px,${(1 - v.y) / 2 * h}px) translate(-50%,-50%)`; });
  }
  fit(instant, az) {
    const bb = frameBox(this.groups, this.cfg), c = bb.getCenter(new T.Vector3()), r = bb.getSize(new T.Vector3()).length() / 2;
    c.y = Math.min(c.y, 1.05);
    const vf = this.cam.fov * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * this.cam.aspect);
    const dist = r / Math.sin(Math.min(vf, hf) / 2) * .7;
    const sph = new T.Spherical().setFromVector3(this.cam.position.clone().sub(this.ctl.target));
    this.anim(c, dist, az === 'auto' || (az == null && instant) ? defaultAz(this.cfg) : az != null ? az : sph.theta, 1.18, instant);
  }
  anim(target, dist, az, polar, instant) {
    const t0 = this.ctl.target.clone(), s0 = new T.Spherical().setFromVector3(this.cam.position.clone().sub(t0));
    const go = k => { const t = t0.clone().lerp(target, k); this.ctl.target.copy(t); camFor(this.cam, t, s0.radius + (dist - s0.radius) * k, s0.theta + (az - s0.theta) * k, s0.phi + (polar - s0.phi) * k); this.dirty = true; };
    if (instant || !isFinite(s0.radius) || s0.radius === 0) { this.ctl.target.copy(target); camFor(this.cam, target, dist, az, polar); this.tw = null; this.dirty = true; return; }
    const st = performance.now();
    this.tw = () => { const k = Math.min(1, (performance.now() - st) / 450), e = 1 - Math.pow(1 - k, 3); go(e); if (k >= 1) this.tw = null; };
  }
  /** Frames one module (detail view) keeping the current azimuth. */
  focus(id) { const g = this.groups[id]; if (!g) return; const bb = new T.Box3().setFromObject(g), c = bb.getCenter(new T.Vector3()), r = bb.getSize(new T.Vector3()).length() / 2; const s = new T.Spherical().setFromVector3(this.cam.position.clone().sub(this.ctl.target)); this.anim(c, Math.max(1.1, r * 2.6), s.theta, 1.0, true); }
  /** Current orbit camera (to save a hand-made view). */
  getCamera() { const s = new T.Spherical().setFromVector3(this.cam.position.clone().sub(this.ctl.target)); const t = this.ctl.target; return { az: s.theta, polar: s.phi, dist: s.radius, target: [t.x, t.y, t.z] }; }
  setCamera(c) { if (!validCam(c)) return; this.anim(new T.Vector3(...c.target), c.dist, c.az, c.polar, true); }
  setAngle(deg) { const s = new T.Spherical().setFromVector3(this.cam.position.clone().sub(this.ctl.target)); this.anim(this.ctl.target.clone(), s.radius, deg * Math.PI / 180, s.phi); }
  zoomBy(f) { const s = new T.Spherical().setFromVector3(this.cam.position.clone().sub(this.ctl.target)); this.anim(this.ctl.target.clone(), Math.max(1, Math.min(16, s.radius / f)), s.theta, s.phi); }
  dispose() { this.dead = true; cancelAnimationFrame(this.raf); this.ro.disconnect(); this.ctl.dispose(); disposeTree(this.root); this.r.dispose(); this.r.forceContextLoss && this.r.forceContextLoss(); this.r.domElement.remove(); this.ov.remove(); }
}
export async function createViewer(host, opts) { await init(); return new Viewer(host, opts); }

// ---------- offscreen snapshots ----------
let snapR = null, queue = Promise.resolve();
export function snapshot(cfg, o) {
  const job = queue.then(async () => {
    await init(); await resolveGlbs(cfg);
    if (!snapR) snapR = mkRenderer(true);
    // Supersample for clean edges (the JPEG comes out at up to 2× the requested size).
    snapR.setPixelRatio(Math.max(1, Math.min(2, 2400 / o.w))); snapR.setSize(o.w, o.h, false);
    const scene = new T.Scene(); scene.background = new T.Color(cfg.bg || '#d3cec6'); scene.environment = snapR.userData.env; scene.environmentIntensity = ENV;
    const root = new T.Group(); scene.add(root);
    const groups = buildScene(root, cfg);
    root.traverse(l => { if (l.isDirectionalLight && l.castShadow) { l.shadow.mapSize.set(4096, 4096); l.shadow.radius = 4; } });
    if (o.open) applyOpen(collectMovers(root), 1);
    const cam = new T.PerspectiveCamera(o.fov || 38, o.w / o.h, .05, 100);
    const bb = frameBox(groups, cfg, o.focusId), c = bb.getCenter(new T.Vector3()), r = bb.getSize(new T.Vector3()).length() / 2;
    if (!o.focusId) c.y = Math.min(c.y, 1.05);
    const k = o.w / o.h < 1.2 ? .95 : .78;
    const dist = o.focusId ? Math.max(1.1, r * 2.6) : r / Math.sin(cam.fov * Math.PI / 360) * k;
    if (validCam(o.cam)) camFor(cam, new T.Vector3(...o.cam.target), o.cam.dist, o.cam.az, o.cam.polar);
    else camFor(cam, c, dist, o.ang != null ? o.ang * Math.PI / 180 : defaultAz(cfg), o.polar || (o.focusId ? 1.0 : 1.18));
    cutaway(root.userData.walls, cam, cfg);
    snapR.render(scene, cam);
    const url = snapR.domElement.toDataURL('image/jpeg', .88);
    disposeTree(root);
    return url;
  });
  queue = job.catch(() => null);
  return job;
}
export async function modelInfo(url) {
  await init(); const s = await loadGLB(url); if (!s) throw new Error('No se pudo leer el modelo');
  const v = new T.Box3().setFromObject(s).getSize(new T.Vector3());
  let k = 100; if (Math.max(v.x, v.y, v.z) > 20) k = .1;
  return { w: Math.round(v.x * k) || 60, h: Math.round(v.y * k) || 76, d: Math.round(v.z * k) || 60 };
}
export function modelThumb(url) {
  const job = queue.then(async () => {
    await init(); const s = await loadGLB(url); if (!s) return null;
    if (!snapR) snapR = mkRenderer(true);
    snapR.setPixelRatio(1); snapR.setSize(320, 320, false);
    const scene = new T.Scene(); scene.background = new T.Color('#e4e1dc'); scene.environment = snapR.userData.env; scene.environmentIntensity = .7;
    const o = s.clone(true); scene.add(o);
    const l = new T.DirectionalLight(0xffffff, 1.6); l.position.set(3, 5, 4); scene.add(l, new T.HemisphereLight(0xffffff, 0xb8a58c, .6));
    const bb = new T.Box3().setFromObject(o), c = bb.getCenter(new T.Vector3()), r = bb.getSize(new T.Vector3()).length() / 2;
    const cam = new T.PerspectiveCamera(35, 1, r / 100, r * 100); camFor(cam, c, r / Math.sin(35 * Math.PI / 360) * 1.05, Math.PI / 5, 1.15);
    snapR.render(scene, cam);
    return snapR.domElement.toDataURL('image/jpeg', .88);
  });
  queue = job.catch(() => null);
  return job;
}
