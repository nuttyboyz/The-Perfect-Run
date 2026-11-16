// Ten Alien Blaster designs for Nutty to pick from (2026-11-14: "the one i have currently ... doesn't seem like it belongs in this
// game. never forget we're not settling for the easy low budget graphics"). Every design is modelled from smooth lofted hulls,
// turned parts and swept tubes, and every surface carries its own painted colour, bump (normal), roughness and glow maps.
// Weapon space: +z is the barrel, +y is up, the hand closes on the grip that hangs below the origin.
import * as THREE from 'three';
import { slab, lathe, sweep, at } from './weapons.js';

// ---------- geometry ----------
const UVK = 6.5; // one texture tile every 15 cm, on every part of every blaster
const sg = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
// A smooth hull lofted along z through stations [z, centre y, half width, height above, height below, squareness (2 = oval, 4 = boxy)].
function hull(st, seg = 36, sub = 6, flat = false) {
  const cr = (a, b, c, d, t) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  const rows = [];
  for (let i = 0; i < st.length - 1; i++) {
    const p0 = st[Math.max(0, i - 1)], p1 = st[i], p2 = st[i + 1], p3 = st[Math.min(st.length - 1, i + 2)];
    for (let s = 0; s < sub; s++) rows.push(p1.map((_, k) => cr(p0[k], p1[k], p2[k], p3[k], s / sub)));
  }
  rows.push(st[st.length - 1].slice());
  const cap = (r) => [r[0], r[1], r[2] * 0.02, r[3] * 0.02, r[4] * 0.02, r[5]];
  rows.unshift(cap(rows[0])); rows.push(cap(rows[rows.length - 1]));
  let per = 0; for (const r of rows) per += r[2] + (r[3] + r[4]) / 2; per = Math.PI * per / rows.length;
  const pos = [], uv = [], idx = [], n = seg + 1;
  for (const r of rows) {
    const e = 2 / Math.max(1.2, r[5]), w = Math.max(1e-4, r[2]), ht = Math.max(1e-4, r[3]), hb = Math.max(1e-4, r[4]);
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      pos.push(w * sg(c, e), r[1] + (s >= 0 ? ht : hb) * sg(s, e), r[0]);
      uv.push((j / seg) * per * UVK, r[0] * UVK);
    }
  }
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < seg; j++) { const A = i * n + j, B = A + 1, C = A + n, D = C + 1; idx.push(A, C, B, B, C, D); }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  if (flat) { g = g.toNonIndexed(); g.computeVertexNormals(); }
  else {
    g.computeVertexNormals(); const N = g.attributes.normal;
    for (let i = 0; i < rows.length; i++) { // the seam where the skin closes: one shared normal, no visible line
      const a = i * n, b = a + seg, x = N.getX(a) + N.getX(b), y = N.getY(a) + N.getY(b), z = N.getZ(a) + N.getZ(b), l = Math.hypot(x, y, z) || 1;
      N.setXYZ(a, x / l, y / l, z / l); N.setXYZ(b, x / l, y / l, z / l);
    }
  }
  g.userData.uvok = true;
  return g;
}
// Every other part gets its texture laid on from the side it faces most, at the same scale as the hulls.
function boxUV(g0) {
  if (g0.userData.uvok) return g0;
  const g = g0.index ? g0.toNonIndexed() : g0; if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, uv = new Float32Array(p.count * 2), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const nx = Math.abs((b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y)), ny = Math.abs((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z)), nz = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    for (let k = 0; k < 3; k++) { const v = k === 0 ? a : k === 1 ? b : c;
      if (nx >= ny && nx >= nz) { uv[(i + k) * 2] = v.z * UVK; uv[(i + k) * 2 + 1] = v.y * UVK; }
      else if (ny >= nz) { uv[(i + k) * 2] = v.x * UVK; uv[(i + k) * 2 + 1] = v.z * UVK; }
      else { uv[(i + k) * 2] = v.x * UVK; uv[(i + k) * 2 + 1] = v.y * UVK; } }
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
const faceted = (g) => { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); return n; };
const ring = (R, r, z, y = 0, seg = 40) => new THREE.TorusGeometry(R, r, 10, seg).translate(0, y, z); // a hoop round the barrel line
const turn = (prof, y, seg = 28) => lathe(prof, seg).translate(0, y, 0);                         // turned part on the barrel line
const ball = (r, x, y, z, sx = 1, sy = 1, sz = 1) => new THREE.SphereGeometry(r, 24, 16).scale(sx, sy, sz).translate(x, y, z);
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const drum = (r, len, x, y, z, seg = 24) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2).translate(x, y, z); // axle across the gun
// The grip every design shares the place of (so the hand always closes on it the same way): a raked, swelling handle.
function gripHull(w = 0.0155, d = 0.024, len = 0.104, rake = 0.3, sq = 2.6, swell = 1) {
  // front (ht) carries three finger grooves, back (hb) the palm swell; a flared butt plate closes it
  const F = [0.92, 1.02, 0.86, 1.0, 0.85, 0.99, 0.86, 1.04], B = [1.1, 1.0, 1.06, 1.14, 1.12, 1.05, 1.0, 1.1], st = [];
  for (let i = 0; i < 8; i++) { const z = -0.006 + (len + 0.006) * i / 7; st.push([z, 0.001 * Math.sin(i / 7 * Math.PI), w * (0.94 + 0.1 * swell * Math.sin(i / 7 * Math.PI)), d * (1 + (F[i] - 1) * swell), d * B[i], sq]); }
  st.push([len + 0.004, 0, w * 1.16, d * 1.12, d * 1.16, sq], [len + 0.012, 0, w * 1.12, d * 1.08, d * 1.12, sq]);
  const g = hull(st, 28, 5);
  g.rotateX(Math.PI / 2 + rake); g.translate(0, 0.004, -0.012);
  return g;
}
// The frame every body sits on: it carries the grip and the trigger, so nothing hangs in the air.
const frame = (w = 0.0165, sq = 3) => hull([[-0.05, 0.016, w * 0.7, 0.01, 0.012, sq], [-0.02, 0.012, w, 0.014, 0.014, sq], [0.04, 0.011, w, 0.014, 0.013, sq], [0.085, 0.014, w * 0.9, 0.012, 0.011, sq], [0.105, 0.018, w * 0.6, 0.008, 0.007, sq]], 24, 5);
const guardTube = (r = 0.0032) => sweep([[0, 0.0, 0.085], [0, -0.03, 0.08], [0, -0.052, 0.058], [0, -0.058, 0.03], [0, -0.05, 0.006]], [r, r, r, r, r], 8);
const trigger = () => sweep([[0, -0.004, 0.034], [0, -0.02, 0.03], [0, -0.034, 0.036]], [0.0034, 0.003, 0.0022], 8);

// ---------- painted surfaces ----------
// One canvas each for colour, height (turned into a normal map), roughness and glow, drawn together so they line up.
const S = 512;
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function surface(key, o) {
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
  const cc = mk(), ch = mk(), cr = mk(), ce = mk(), C = cc.getContext('2d'), H = ch.getContext('2d'), R = cr.getContext('2d'), E = ce.getContext('2d'), r = rng(o.seed || 7);
  const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`, grey = (v, a = 1) => rgb([v, v, v], a);
  const all = (fn) => { for (const g of [C, H, R, E]) fn(g); };
  C.fillStyle = rgb(o.base); C.fillRect(0, 0, S, S); H.fillStyle = grey(128); H.fillRect(0, 0, S, S); R.fillStyle = grey(o.rough * 255); R.fillRect(0, 0, S, S); E.fillStyle = '#000'; E.fillRect(0, 0, S, S);
  const wrap = (g, x, y, rad, fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { if (x + ox + rad < 0 || x + ox - rad > S || y + oy + rad < 0 || y + oy - rad > S) continue; fn(g, x + ox, y + oy); } };
  const blob = (g, x, y, rad, col, a) => wrap(g, x, y, rad, (q, px, py) => { const gr = q.createRadialGradient(px, py, 0, px, py, rad); gr.addColorStop(0, rgb(col, a)); gr.addColorStop(1, rgb(col, 0)); q.fillStyle = gr; q.fillRect(px - rad, py - rad, rad * 2, rad * 2); });
  // Mottling: soft clouds of the other tones, with matching change in sheen.
  for (let i = 0; i < (o.mottle || 90); i++) { const x = r() * S, y = r() * S, rad = 20 + r() * 90, col = o.tones[(r() * o.tones.length) | 0]; blob(C, x, y, rad, col, 0.1 + r() * 0.22); blob(R, x, y, rad, [255 * r(), 255 * r(), 255 * r()].fill((o.rough + (r() - 0.5) * (o.roughVar || 0.3)) * 255), 0.35); }
  // Hammered / pitted skin.
  for (let i = 0; i < (o.dents || 0); i++) { const x = r() * S, y = r() * S, rad = 6 + r() * 16, up = r() < 0.5; blob(H, x, y, rad, up ? [190, 190, 190] : [70, 70, 70], 0.5); }
  for (let i = 0; i < (o.pores || 0); i++) { const x = r() * S, y = r() * S, rad = 1.2 + r() * 2.6; blob(H, x, y, rad * 2, [20, 20, 20], 0.9); blob(C, x, y, rad * 2.4, o.dark || [0, 0, 0], 0.55); blob(R, x, y, rad * 3, [235, 235, 235], 0.6); }
  // Ribs: rounded ridges running across v (growth lines, hoses, cooling ribs).
  if (o.ribs) { const n = o.ribs, w = S / n; for (let i = 0; i < n; i++) { const y0 = i * w, gr = H.createLinearGradient(0, y0, 0, y0 + w); gr.addColorStop(0, grey(40)); gr.addColorStop(0.5, grey(215)); gr.addColorStop(1, grey(40)); H.fillStyle = gr; H.globalAlpha = o.ribK || 0.5; H.fillRect(0, y0, S, w + 1); H.globalAlpha = 1;
    const gc = C.createLinearGradient(0, y0, 0, y0 + w); gc.addColorStop(0, rgb(o.dark || [0, 0, 0], 0.32)); gc.addColorStop(0.5, rgb(o.dark || [0, 0, 0], 0)); gc.addColorStop(1, rgb(o.dark || [0, 0, 0], 0.32)); C.fillStyle = gc; C.fillRect(0, y0, S, w + 1); } }
  // Scales / hex cells: raised cells with dark seams.
  if (o.hex) { const n = o.hex, w = S / n, hh = w * 0.866; for (let j = 0; j * hh < S + hh; j++) for (let i = 0; i <= n; i++) { const x = i * w + (j % 2 ? w / 2 : 0), y = j * (S / Math.round(S / hh));
    wrap(H, x, y, w, (q, px, py) => { const gr = q.createRadialGradient(px, py - w * 0.1, w * 0.1, px, py, w * 0.56); gr.addColorStop(0, grey(205)); gr.addColorStop(0.8, grey(150)); gr.addColorStop(1, grey(30)); q.fillStyle = gr; q.beginPath(); q.arc(px, py, w * 0.56, 0, 7); q.fill(); });
    wrap(C, x, y, w, (q, px, py) => { const gr = q.createRadialGradient(px, py, w * 0.3, px, py, w * 0.56); gr.addColorStop(0, rgb(o.dark || [0, 0, 0], 0)); gr.addColorStop(1, rgb(o.dark || [0, 0, 0], 0.75)); q.fillStyle = gr; q.beginPath(); q.arc(px, py, w * 0.56, 0, 7); q.fill(); }); } }
  // Panel lines: machined seams with a few rivets, and paint worn bright along the edges.
  if (o.panels) { const [nx, ny] = o.panels, lw = o.panelW || 3; const line = (x0, y0, x1, y1) => { all((g) => { g.lineCap = 'butt'; }); H.strokeStyle = grey(15); H.lineWidth = lw; H.beginPath(); H.moveTo(x0, y0); H.lineTo(x1, y1); H.stroke(); C.strokeStyle = rgb(o.dark || [0, 0, 0], 0.85); C.lineWidth = lw; C.beginPath(); C.moveTo(x0, y0); C.lineTo(x1, y1); C.stroke();
      if (o.edge) { C.strokeStyle = rgb(o.edge, 0.5); C.lineWidth = 1.2; for (const d of [-lw, lw]) { C.beginPath(); C.moveTo(x0 + (y1 !== y0 ? d : 0), y0 + (x1 !== x0 ? d : 0)); C.lineTo(x1 + (y1 !== y0 ? d : 0), y1 + (x1 !== x0 ? d : 0)); C.stroke(); } }
      R.strokeStyle = grey(230); R.lineWidth = lw + 1; R.beginPath(); R.moveTo(x0, y0); R.lineTo(x1, y1); R.stroke(); };
    for (let j = 0; j < ny; j++) { const y = (j + 0.5) * S / ny; line(0, y, S, y); for (let i = 0; i < nx; i++) { const x = ((i + (j % 2 ? 0.5 : 0.15)) * S / nx) % S; line(x, y, x, y + S / ny); if (y + S / ny > S) line(x, y - S, x, y - S + S / ny);
      for (const [dx, dy] of [[9, 9], [9, S / ny - 9]]) { blob(H, x + dx, y + dy, 5, [235, 235, 235], 1); blob(C, x + dx, y + dy, 5, o.edge || [200, 200, 200], 0.6); } } } }
  // Glowing seams / cracks / glyphs.
  if (o.cracks) for (let i = 0; i < o.cracks; i++) { let x = r() * S, y = r() * S, a = r() * 7; const pts = [[x, y]]; for (let k = 0; k < 9; k++) { a += (r() - 0.5) * 1.6; x += Math.cos(a) * (14 + r() * 26); y += Math.sin(a) * (14 + r() * 26); pts.push([x, y]); }
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { const path = (g) => { g.beginPath(); pts.forEach(([px, py], k) => (k ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy))); g.stroke(); };
      H.strokeStyle = grey(10); H.lineWidth = 3.5; path(H); E.strokeStyle = rgb(o.glow, 0.35); E.lineWidth = 7; path(E); E.strokeStyle = rgb(o.glow, 1); E.lineWidth = 2; path(E); C.strokeStyle = rgb(o.dark || [0, 0, 0], 0.9); C.lineWidth = 3; path(C); } }
  if (o.glyphs) { const rows = o.glyphs, rh = S / rows; for (let j = 0; j < rows; j++) { const y0 = j * rh + rh * 0.5; for (const g of [H, C]) { g.strokeStyle = g === H ? grey(25) : rgb(o.dark || [0, 0, 0], 0.8); g.lineWidth = 2.5; for (const dy of [-rh * 0.34, rh * 0.34]) { g.beginPath(); g.moveTo(0, y0 + dy); g.lineTo(S, y0 + dy); g.stroke(); } }
      const n = 8; for (let i = 0; i < n; i++) { const cx = (i + 0.5) * S / n, k = 3 + ((r() * 4) | 0), pts = []; for (let q = 0; q < k; q++) pts.push([cx + (r() - 0.5) * S / n * 0.62, y0 + (r() - 0.5) * rh * 0.5]);
        const path = (g) => { g.beginPath(); pts.forEach(([px, py], q) => (q ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke(); if (r() < 0.6) { g.beginPath(); g.arc(pts[0][0], pts[0][1], 4, 0, 7); g.stroke(); } };
        H.strokeStyle = grey(20); H.lineWidth = 4; H.lineJoin = 'round'; path(H); C.strokeStyle = rgb(o.dark || [0, 0, 0], 0.9); C.lineWidth = 4; path(C);
        if (o.glow) { E.strokeStyle = rgb(o.glow, 0.3); E.lineWidth = 8; path(E); E.strokeStyle = rgb(o.glow, 1); E.lineWidth = 2.2; path(E); } } } }
  // Vent slots: rows of dark louvres with heat showing inside.
  if (o.vents) { const [nx, ny] = o.vents; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const x = (i + 0.5) * S / nx, y = (j + 0.5) * S / ny, w = S / nx * 0.6, h = S / ny * 0.3; const rr = (g, pad) => { g.beginPath(); g.roundRect(x - w / 2 - pad, y - h / 2 - pad, w + pad * 2, h + pad * 2, h / 2 + pad); g.fill(); };
      H.fillStyle = grey(200); rr(H, 4); H.fillStyle = grey(5); rr(H, 0); C.fillStyle = rgb(o.edge || [180, 180, 180], 0.45); rr(C, 3); C.fillStyle = '#050505'; rr(C, 0); E.fillStyle = rgb(o.glow, 0.25); rr(E, 5); E.fillStyle = rgb(o.glow, 1); rr(E, -h * 0.22); R.fillStyle = grey(240); rr(R, 0); } }
  // Patina settled in the hollows, wear on the high spots, fine scratches everywhere a hand has been.
  if (o.patina) for (let i = 0; i < 160; i++) { const x = r() * S, y = r() * S; blob(C, x, y, 8 + r() * 30, o.patina, 0.16 + r() * 0.2); blob(R, x, y, 20, [240, 240, 240], 0.3); }
  for (let i = 0; i < (o.scratches || 0); i++) { const x = r() * S, y = r() * S, a = (o.scratchDir ?? r() * 7) + (r() - 0.5) * 0.5, l = 5 + r() * 34; const ln = (g, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); };
    ln(C, rgb(o.edge || [220, 220, 220], 0.04 + r() * 0.12), 0.5 + r() * 0.5); ln(H, grey(100, 0.35), 0.8); ln(R, grey(70, 0.4), 1); }
  // Height -> normal map.
  const hd = H.getImageData(0, 0, S, S).data, nc = mk(), ng = nc.getContext('2d'), ni = ng.createImageData(S, S), k = (o.bump ?? 1.6) / 255 * 4;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const hx = hd[(y * S + ((x + 1) % S)) * 4] - hd[(y * S + ((x + S - 1) % S)) * 4], hy = hd[(((y + 1) % S) * S + x) * 4] - hd[(((y + S - 1) % S) * S + x) * 4];
    const nx = -hx * k, ny = hy * k, l = Math.hypot(nx, ny, 1), i = (y * S + x) * 4; ni.data[i] = (nx / l * 0.5 + 0.5) * 255; ni.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; ni.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; ni.data[i + 3] = 255; }
  ng.putImageData(ni, 0, 0);
  const T = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const out = { map: T(cc, true), normalMap: T(nc), roughnessMap: T(cr) };
  if (o.glow) out.emissiveMap = T(ce, true);
  return out;
}
let ENV = null; const ALL = [];
export function setBlasterEnv(tex) { ENV = tex; for (const m of ALL) { m.envMap = tex; m.needsUpdate = true; } }
const cache = new Map();
// A finished material: painted surface + how the light sits on it.
function skin(key, o, p = {}) {
  if (cache.has(key)) return cache.get(key);
  const t = surface(key, o), rep = p.repeat || 1; delete p.repeat;
  for (const k of Object.keys(t)) t[k].repeat.set(rep, rep);
  const m = new THREE.MeshPhysicalMaterial({ ...t, color: 0xffffff, roughness: 1, metalness: 0.8, envMapIntensity: 1.25, normalScale: new THREE.Vector2(1, 1), ...(o.glow ? { emissive: 0xffffff, emissiveIntensity: p.glowK || 2.2 } : {}), ...p });
  delete m.glowK; if (ENV) m.envMap = ENV; ALL.push(m); cache.set(key, m);
  return m;
}
const glow = (hex) => { const k = 'g' + hex; if (!cache.has(k)) cache.set(k, new THREE.MeshBasicMaterial({ color: hex, toneMapped: false })); return cache.get(k); };
// A lit energy cell: bright cloudy plasma behind glass.
function plasma(key, c0, c1, seed = 3) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = `rgb(${c0})`; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) { const x = r() * 256, y = r() * 256, rad = 10 + r() * 50; for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad); gr.addColorStop(0, `rgba(${c1},${0.25 + r() * 0.5})`); gr.addColorStop(1, `rgba(${c1},0)`); g.fillStyle = gr; g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2); } }
  for (let i = 0; i < 26; i++) { g.strokeStyle = `rgba(255,255,255,${0.15 + r() * 0.5})`; g.lineWidth = 0.6 + r() * 1.6; g.beginPath(); let x = r() * 256, y = r() * 256; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 70; y += (r() - 0.5) * 70; g.lineTo(x, y); } g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(1.5, 1.5);
  const m = new THREE.MeshPhysicalMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 1.9, color: 0x222222, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04 });
  if (ENV) m.envMap = ENV; ALL.push(m); cache.set(key, m);
  return m;
}

// ---------- the ten designs ----------
const Y = 0.04; // barrel line height above the grip
function make(parts, muzzle) { return { parts: parts.map(([g, m]) => [boxUV(g), m]), muzzle, support: null, pistol: true }; }

// 1. Sentinel: a sidearm in violet-grey star alloy, machined panels, a cyan power cell slung under the barrel.
function ab1() {
  const A = skin('alloy1', { base: [58, 54, 78], tones: [[84, 78, 112], [36, 34, 52], [70, 80, 110]], rough: 0.36, roughVar: 0.35, panels: [3, 4], dark: [10, 9, 16], edge: [190, 196, 220], scratches: 220, seed: 11 }, { metalness: 0.9, clearcoat: 0.25, clearcoatRoughness: 0.3 });
  const D = skin('alloy1d', { base: [22, 22, 28], tones: [[36, 36, 46], [12, 12, 16]], rough: 0.5, ribs: 26, ribK: 0.45, dark: [0, 0, 0], scratches: 60, seed: 12 }, { metalness: 0.7 });
  const Gp = skin('alloy1g', { base: [20, 20, 26], tones: [[32, 32, 42], [10, 10, 14]], rough: 0.7, hex: 47, dark: [0, 0, 0], bump: 1.8, seed: 13 }, { metalness: 0.2 });
  const Cg = glow(0x58f0ff), Pl = plasma('pl1', '8,60,90', '120,255,255', 4), P = [];
  P.push([hull([[-0.075, Y, 0.012, 0.016, 0.014, 3], [-0.05, Y, 0.02, 0.027, 0.024, 3.4], [0.02, Y + 0.002, 0.0225, 0.03, 0.028, 3.6], [0.1, Y + 0.002, 0.021, 0.027, 0.024, 3.6], [0.17, Y, 0.017, 0.021, 0.016, 3.2], [0.2, Y, 0.0135, 0.016, 0.013, 2.6]]), A]);
  P.push([turn([[0.0, 0.18], [0.0135, 0.18], [0.0135, 0.2], [0.011, 0.205], [0.011, 0.265], [0.0145, 0.27], [0.0145, 0.29], [0.0165, 0.295], [0.0165, 0.31], [0.0105, 0.312], [0.0085, 0.3], [0.0, 0.3]], Y), D]);
  for (const z of [0.215, 0.232, 0.249]) P.push([ring(0.0125, 0.0022, z, Y), A]);
  P.push([turn([[0, 0.296], [0.0082, 0.296], [0.0082, 0.3], [0, 0.3]], Y), Cg]);                                     // lit bore
  P.push([turn([[0, 0.088], [0.008, 0.09], [0.0105, 0.1], [0.0105, 0.172], [0.008, 0.182], [0, 0.184]], Y - 0.031), Pl]); // power cell
  for (const z of [0.094, 0.136, 0.178]) P.push([ring(0.0112, 0.0017, z, Y - 0.031), D]);
  for (const sx of [-1, 1]) { P.push([box(0.0016, 0.004, 0.13, sx * 0.0228, Y + 0.004, 0.05), Cg]); P.push([box(0.003, 0.016, 0.05, sx * 0.0215, Y - 0.004, -0.02), A]); }
  P.push([slab([[-0.045, Y + 0.027], [0.12, Y + 0.029], [0.12, Y + 0.036], [0.1, Y + 0.038], [-0.03, Y + 0.038], [-0.045, Y + 0.034]], 0.012, 0.002), D]); // top rail
  P.push([box(0.003, 0.008, 0.006, 0, Y + 0.042, 0.108), A], [box(0.011, 0.007, 0.006, 0, Y + 0.041, -0.03), A]);
  P.push([turn([[0, -0.082], [0.011, -0.082], [0.0135, -0.076], [0.0135, -0.07], [0, -0.07]], Y), D], [ring(0.0085, 0.0018, -0.0825, Y, 28), Cg]);
  P.push([gripHull(0.0155, 0.0245, 0.104, 0.3, 3), Gp], [frame(0.018, 3.4), A], [guardTube(), A], [trigger(), Cg]);
  return make(P, [0, Y, 0.312]);
}
// 2. Hive: grown, not made. Ivory chitin plates over a dark body, an amber sac that swells behind the horn.
function ab2() {
  const Ch = skin('chitin', { base: [176, 150, 112], tones: [[212, 190, 150], [120, 88, 56], [150, 118, 80]], rough: 0.42, roughVar: 0.4, ribs: 16, ribK: 0.55, dark: [52, 30, 16], pores: 240, scratches: 40, bump: 2.6, seed: 21 }, { metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.25 });
  const Fl = skin('flesh', { base: [44, 26, 28], tones: [[80, 36, 36], [24, 14, 18]], rough: 0.3, hex: 54, dark: [8, 4, 6], bump: 1.8, seed: 22 }, { metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.1 });
  const Sac = plasma('sac', '120,50,0', '255,190,60', 9), G = glow(0xffb040), P = [];
  P.push([hull([[-0.07, Y, 0.01, 0.012, 0.012, 2], [-0.04, Y + 0.002, 0.021, 0.024, 0.024, 2], [0.03, Y + 0.004, 0.025, 0.027, 0.03, 2], [0.1, Y + 0.002, 0.02, 0.022, 0.024, 2], [0.17, Y, 0.012, 0.014, 0.013, 2], [0.24, Y + 0.004, 0.0075, 0.009, 0.008, 2], [0.3, Y + 0.012, 0.004, 0.005, 0.005, 2]]), Fl]);
  for (let i = 0; i < 6; i++) { const z = -0.05 + i * 0.036, k = 1 - i * 0.1; // overlapping back plates, each tucked under the one behind
    P.push([hull([[z - 0.004, Y + 0.012, 0.022 * k, 0.019 * k, 0.004, 2.2], [z + 0.022, Y + 0.014, 0.0245 * k, 0.022 * k, 0.006, 2.2], [z + 0.05, Y + 0.012, 0.019 * k, 0.014 * k, 0.003, 2.2]], 24, 4), Ch]); }
  P.push([ball(0.021, 0, Y + 0.03, -0.045, 0.85, 0.8, 1.15), Sac]);
  for (const sx of [-1, 1]) P.push([sweep([[sx * 0.012, Y + 0.038, -0.05], [sx * 0.021, Y + 0.03, -0.02], [sx * 0.024, Y + 0.012, 0.03], [sx * 0.018, Y - 0.004, 0.09]], [0.0036, 0.0042, 0.0038, 0.002], 8), Fl]);
  for (let i = 0; i < 3; i++) { const a = Math.PI / 2 + i * Math.PI * 2 / 3, cx = Math.cos(a), cy = Math.sin(a); // three mandibles closing round the spitting horn
    P.push([sweep([[cx * 0.012, Y + cy * 0.012, 0.17], [cx * 0.024, Y + cy * 0.024, 0.215], [cx * 0.021, Y + 0.006 + cy * 0.021, 0.265], [cx * 0.008, Y + 0.012 + cy * 0.008, 0.305]], [0.0052, 0.0048, 0.0034, 0.0008], 10), Ch]); }
  P.push([ball(0.0055, 0, Y + 0.012, 0.3), G]);
  P.push([gripHull(0.015, 0.024, 0.104, 0.34, 2, 1.6), Ch]);
  for (let i = 0; i < 5; i++) { const g = ring(0.0185 - i * 0.0004, 0.0032, 0, 0, 24).scale(0.86, 1.25, 1).rotateX(Math.PI / 2 + 0.34).translate(0, -0.018 - i * 0.021, -0.02 - i * 0.0074); P.push([g, Fl]); }
  P.push([sweep([[0, 0.012, 0.08], [0, -0.026, 0.082], [0, -0.054, 0.058], [0, -0.06, 0.026], [0, -0.05, 0.004]], [0.0048, 0.0036, 0.003, 0.003, 0.0038], 8), Ch], [trigger(), Fl], [frame(0.017, 2), Fl]);
  return make(P, [0, Y + 0.012, 0.306]);
}
// 3. Obsidian Fang: knapped black volcanic glass with fire running in its cracks and a blood-red crystal for a muzzle.
function ab3() {
  const Ob = skin('obsid', { base: [14, 12, 16], tones: [[30, 24, 34], [6, 6, 8]], rough: 0.1, roughVar: 0.12, cracks: 9, glow: [255, 40, 20], dark: [0, 0, 0], scratches: 80, edge: [150, 150, 170], bump: 1.4, seed: 31 }, { metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03, glowK: 3 });
  const Au = skin('gold3', { base: [190, 140, 60], tones: [[230, 190, 100], [120, 80, 30]], rough: 0.32, ribs: 40, ribK: 0.5, dark: [50, 28, 6], scratches: 120, seed: 32 }, { metalness: 1 });
  const Cr = new THREE.MeshPhysicalMaterial({ color: 0x7a0808, emissive: 0xff1a10, emissiveIntensity: 1.3, roughness: 0.05, metalness: 0, clearcoat: 1, flatShading: true }); ALL.push(Cr); if (ENV) Cr.envMap = ENV;
  const P = [], sh = (x, y, z, r, len, rx = 0, ry = 0) => faceted(new THREE.OctahedronGeometry(r, 0).scale(0.55, 0.55, len / r).rotateX(rx).rotateY(ry).translate(x, y, z));
  P.push([hull([[-0.08, Y + 0.004, 0.006, 0.008, 0.008, 1.3], [-0.045, Y, 0.019, 0.03, 0.022, 1.25], [0.03, Y, 0.022, 0.034, 0.027, 1.3], [0.11, Y, 0.018, 0.026, 0.02, 1.25], [0.19, Y + 0.002, 0.011, 0.015, 0.012, 1.3], [0.225, Y + 0.002, 0.007, 0.009, 0.008, 1.3]], 8, 2, true), Ob]);
  P.push([faceted(slab([[-0.06, Y + 0.02], [-0.02, Y + 0.05], [0.05, Y + 0.058], [0.13, Y + 0.04], [0.16, Y + 0.02], [0.02, Y + 0.022]], 0.007, 0.003)), Ob]); // knapped back blade
  P.push([faceted(slab([[0.06, Y - 0.018], [0.15, Y - 0.014], [0.2, Y - 0.006], [0.14, Y - 0.034], [0.08, Y - 0.032]], 0.008, 0.003)), Ob]);
  P.push([sh(0, Y + 0.002, 0.255, 0.019, 0.062), Cr], [sh(0.012, Y + 0.008, 0.225, 0.011, 0.04, 0.1, 0.3), Cr], [sh(-0.012, Y - 0.004, 0.228, 0.01, 0.036, -0.15, -0.3), Cr], [sh(0, Y - 0.012, 0.218, 0.009, 0.03, 0.3), Cr]);
  for (const z of [0.196, 0.204, 0.212]) P.push([ring(0.0128 - (z - 0.196) * 0.2, 0.0019, z, Y + 0.002, 24), Au]);       // gold wire binding the crystal in
  for (const z of [-0.052, -0.045]) P.push([ring(0.024, 0.002, z, Y + 0.003, 24).scale(0.82, 1.1, 1), Au]);
  P.push([faceted(gripHull(0.015, 0.024, 0.104, 0.3, 1.5)), Ob]);
  for (let i = 0; i < 7; i++) P.push([ring(0.021, 0.0021, 0, 0, 20).scale(0.72, 1.14, 1).rotateX(Math.PI / 2 + 0.3).translate(0, -0.03 - i * 0.012, -0.0245 - i * 0.0036), Au]);
  P.push([guardTube(0.003), Au], [trigger(), Au], [faceted(hull([[-0.05, 0.016, 0.011, 0.01, 0.012, 1.4], [0.0, 0.011, 0.016, 0.014, 0.014, 1.4], [0.07, 0.012, 0.015, 0.013, 0.012, 1.4], [0.105, 0.018, 0.009, 0.008, 0.007, 1.4]], 8, 2)), Ob]);
  return make(P, [0, Y + 0.002, 0.318]);
}
// 4. Relic: a temple piece older than the stars it was dug up under. Hammered bronze gone green in the hollows, glyphs still lit.
function ab4() {
  const Br = skin('bronze', { base: [150, 98, 48], tones: [[196, 140, 70], [96, 60, 30], [170, 120, 60]], rough: 0.4, roughVar: 0.35, dents: 260, patina: [58, 150, 128], dark: [30, 16, 6], scratches: 140, edge: [240, 200, 130], seed: 41 }, { metalness: 1 });
  const Gl = skin('glyph', { base: [120, 78, 38], tones: [[170, 118, 58], [80, 50, 24]], rough: 0.38, glyphs: 3, glow: [60, 255, 215], patina: [58, 150, 128], dark: [20, 10, 4], seed: 42 }, { metalness: 1, glowK: 2.6 });
  const Le = skin('cord', { base: [70, 36, 22], tones: [[100, 54, 30], [40, 20, 12]], rough: 0.8, ribs: 26, ribK: 1, dark: [10, 4, 2], pores: 60, seed: 43 }, { metalness: 0 });
  const G = glow(0x4dffd6), P = [];
  P.push([turn([[0, -0.085], [0.012, -0.085], [0.02, -0.078], [0.02, -0.07], [0.013, -0.064], [0.013, -0.058], [0.0225, -0.05], [0.0245, 0.0], [0.0245, 0.07], [0.021, 0.082], [0.016, 0.09], [0.016, 0.1], [0.0195, 0.106], [0.0195, 0.112], [0.014, 0.118], [0.0125, 0.2], [0.014, 0.215], [0.022, 0.25], [0.031, 0.285], [0.0325, 0.292], [0.029, 0.295], [0.02, 0.262], [0.009, 0.24], [0, 0.24]], Y, 40), Br]);
  P.push([turn([[0.0252, -0.04], [0.0262, -0.036], [0.0262, 0.064], [0.0252, 0.068]], Y, 40), Gl]);                    // glyph sleeve
  P.push([turn([[0.0132, 0.126], [0.0142, 0.13], [0.0142, 0.192], [0.0132, 0.196]], Y, 40), Gl]);
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; P.push([slab([[0.2, 0.013], [0.25, 0.022], [0.292, 0.033], [0.297, 0.046], [0.27, 0.04], [0.225, 0.026]], 0.0036, 0.0012).rotateZ(a).translate(0, Y, 0), Br]); } // petals of the bell
  P.push([ball(0.0095, 0, Y, 0.248), G], [ring(0.0155, 0.0022, 0.094, Y, 28), G], [ring(0.0162, 0.002, -0.061, Y, 28), G]);
  for (const sx of [-1, 1]) { P.push([drum(0.014, 0.006, sx * 0.027, Y, 0.014), Br]); P.push([drum(0.008, 0.008, sx * 0.028, Y, 0.014), G]); }
  P.push([gripHull(0.0145, 0.022, 0.104, 0.26, 2.2), Le]);
  P.push([guardTube(0.0036), Br], [trigger(), Br], [frame(0.016, 2.4), Br]);
  return make(P, [0, Y, 0.296]);
}
// 5. Halo: no barrel at all. Pearl-white shell, two polished rails, and four rings that the shot rides through.
function ab5() {
  const Pe = skin('pearl', { base: [226, 226, 232], tones: [[244, 240, 250], [196, 200, 214], [232, 220, 236]], rough: 0.22, roughVar: 0.15, panels: [2, 3], panelW: 2, dark: [70, 70, 90], scratches: 60, edge: [255, 255, 255], bump: 1.3, seed: 51 }, { metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.06, iridescence: 0.5, iridescenceIOR: 1.6 });
  const Chr = skin('chrome', { base: [200, 204, 212], tones: [[240, 240, 246], [150, 156, 170]], rough: 0.08, roughVar: 0.1, scratches: 200, scratchDir: 0, edge: [255, 255, 255], bump: 0.6, seed: 52 }, { metalness: 1, envMapIntensity: 1.6 });
  const Dk = skin('halo-d', { base: [26, 24, 34], tones: [[40, 36, 54], [14, 12, 20]], rough: 0.45, hex: 40, dark: [0, 0, 0], bump: 1.6, seed: 53 }, { metalness: 0.6 });
  const G = glow(0xb070ff), Pl = plasma('pl5', '50,10,110', '225,170,255', 6), P = [];
  P.push([hull([[-0.08, Y, 0.009, 0.012, 0.012, 2.4], [-0.05, Y + 0.002, 0.021, 0.028, 0.024, 2.6], [0.01, Y + 0.004, 0.024, 0.032, 0.027, 2.8], [0.07, Y + 0.002, 0.021, 0.027, 0.024, 2.6], [0.11, Y, 0.014, 0.016, 0.016, 2.2], [0.125, Y, 0.009, 0.01, 0.01, 2]]), Pe]);
  P.push([ball(0.0125, 0, Y, 0.118, 1, 1, 0.8), Pl]);                                                                  // the well the shot is born in
  for (const sy of [1, -1]) P.push([hull([[0.06, Y + sy * 0.03, 0.0075, 0.004, 0.004, 3], [0.14, Y + sy * 0.032, 0.0065, 0.0036, 0.0036, 3], [0.26, Y + sy * 0.027, 0.0055, 0.003, 0.003, 3], [0.325, Y + sy * 0.02, 0.003, 0.002, 0.002, 3]], 16, 5), Chr]);
  [[0.155, 0.0245], [0.2, 0.0215], [0.245, 0.0185], [0.29, 0.0155]].forEach(([z, R]) => { P.push([ring(R, 0.0034, z, Y), Chr], [ring(R - 0.0036, 0.0012, z, Y), G], [ring(R + 0.001, 0.0044, z - 0.006, Y).scale(1, 1, 0.5).translate(0, 0, (z - 0.006) * 0.5), Dk]); });
  P.push([new THREE.CylinderGeometry(0.0014, 0.0014, 0.2, 8).rotateX(Math.PI / 2).translate(0, Y, 0.225), G]);       // thread of light through the rings
  for (const sx of [-1, 1]) P.push([hull([[-0.04, Y + 0.004, 0.002, 0.007, 0.007, 2], [0.02, Y + 0.006, 0.0026, 0.009, 0.009, 2], [0.075, Y + 0.004, 0.002, 0.005, 0.005, 2]], 12, 4).translate(sx * 0.0235, 0, 0), Pl]);
  P.push([turn([[0, -0.086], [0.008, -0.086], [0.011, -0.08], [0.011, -0.074], [0, -0.074]], Y), Chr]);
  P.push([gripHull(0.015, 0.0235, 0.104, 0.3, 2.6), Dk], [guardTube(), Chr], [trigger(), G], [frame(0.017, 2.6), Pe]);
  return make(P, [0, Y, 0.33]);
}
// 6. Blight: wet black biomechanics. Ribbed hoses feed a tank of green venom to a ring of teeth.
function ab6() {
  const Bm = skin('biomech', { base: [26, 30, 28], tones: [[46, 56, 48], [10, 12, 12], [34, 44, 36]], rough: 0.28, roughVar: 0.3, ribs: 30, ribK: 0.85, dark: [0, 0, 0], pores: 80, bump: 2.6, seed: 61 }, { metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.12 });
  const Bn = skin('bone6', { base: [118, 112, 88], tones: [[150, 144, 112], [70, 70, 52]], rough: 0.45, pores: 200, dark: [30, 34, 20], scratches: 80, seed: 62 }, { metalness: 0.1, clearcoat: 0.5 });
  const Pl = plasma('pl6', '10,70,0', '170,255,60', 8), G = glow(0x9dff3a), P = [];
  P.push([hull([[-0.08, Y, 0.008, 0.01, 0.01, 2.2], [-0.05, Y, 0.018, 0.022, 0.022, 2.4], [0.02, Y, 0.021, 0.024, 0.026, 2.4], [0.12, Y, 0.0185, 0.021, 0.021, 2.2], [0.2, Y, 0.0165, 0.018, 0.018, 2], [0.275, Y, 0.0185, 0.0195, 0.0195, 2], [0.285, Y, 0.016, 0.017, 0.017, 2]]), Bm]);
  for (let i = 0; i < 9; i++) { const z = -0.045 + i * 0.022; P.push([ball(0.0072 - i * 0.0003, 0, Y + 0.0215 - i * 0.0005, z, 1.25, 0.7, 0.85), Bn]); } // spine
  P.push([turn([[0, -0.058], [0.009, -0.056], [0.0125, -0.046], [0.0125, 0.03], [0.009, 0.04], [0, 0.042]], Y + 0.046), Pl]); // venom tank
  for (const z of [-0.05, -0.008, 0.034]) P.push([ring(0.0132, 0.002, z, Y + 0.046), Bm]);
  for (const sx of [-1, 1]) {
    P.push([sweep([[sx * 0.008, Y + 0.046, 0.04], [sx * 0.018, Y + 0.036, 0.075], [sx * 0.022, Y + 0.012, 0.13], [sx * 0.019, Y + 0.004, 0.2], [sx * 0.018, Y + 0.004, 0.262]], [0.0048, 0.0046, 0.0042, 0.0038, 0.0036], 10), Bm]);
    P.push([sweep([[sx * 0.02, Y - 0.008, -0.04], [sx * 0.0245, Y - 0.014, 0.03], [sx * 0.021, Y - 0.014, 0.12], [sx * 0.017, Y - 0.01, 0.2]], [0.0034, 0.0038, 0.0034, 0.003], 8), Bm]);
    P.push([sweep([[sx * 0.0215, Y + 0.004, -0.02], [sx * 0.0232, Y + 0.004, 0.06], [sx * 0.0195, Y + 0.004, 0.13]], [0.0012, 0.0014, 0.0012], 6), G]);
  }
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, g = new THREE.ConeGeometry(0.0042, 0.03, 8).rotateX(Math.PI / 2 - 0.42).translate(0, 0.0165, 0.292).rotateZ(a).translate(0, Y, 0); P.push([g, Bn]); } // teeth round the mouth
  P.push([turn([[0, 0.268], [0.0125, 0.268], [0.0125, 0.272], [0, 0.272]], Y), G]);
  P.push([gripHull(0.015, 0.024, 0.104, 0.32, 2.3, 1.4), Bm]);
  P.push([sweep([[0, 0.006, 0.086], [0, -0.03, 0.084], [0, -0.054, 0.06], [0, -0.06, 0.03], [0, -0.05, 0.005]], [0.0042, 0.0036, 0.0032, 0.0032, 0.0036], 8), Bn], [trigger(), Bn], [frame(0.0165, 2.3), Bm]);
  return make(P, [0, Y, 0.3]);
}
// 7. Prism: three grown crystals in a gold collar, tuned to one note. White enamel behind, light in front.
function ab7() {
  const En = skin('enamel', { base: [214, 216, 222], tones: [[236, 236, 242], [180, 186, 200]], rough: 0.2, roughVar: 0.15, panels: [2, 2], panelW: 2, dark: [60, 60, 76], edge: [255, 255, 255], scratches: 90, bump: 1.2, seed: 71 }, { metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 });
  const Au = skin('gold7', { base: [204, 152, 62], tones: [[244, 204, 112], [140, 92, 34]], rough: 0.24, glyphs: 4, dark: [60, 34, 8], scratches: 120, edge: [255, 236, 170], seed: 72 }, { metalness: 1, envMapIntensity: 1.5 });
  const Dk = skin('prism-d', { base: [30, 26, 36], tones: [[46, 40, 56], [16, 14, 20]], rough: 0.6, hex: 47, dark: [0, 0, 0], bump: 1.8, seed: 73 }, { metalness: 0.3 });
  const Cr = new THREE.MeshPhysicalMaterial({ color: 0xc2188f, emissive: 0xff18b0, emissiveIntensity: 0.38, roughness: 0.02, metalness: 0, clearcoat: 1, flatShading: true, iridescence: 1, iridescenceIOR: 1.8 }); ALL.push(Cr); if (ENV) Cr.envMap = ENV;
  const G = glow(0xff7ae0), P = [];
  P.push([hull([[-0.08, Y, 0.008, 0.01, 0.01, 2.6], [-0.05, Y + 0.002, 0.02, 0.026, 0.022, 3], [0.02, Y + 0.003, 0.0225, 0.029, 0.025, 3], [0.09, Y + 0.001, 0.02, 0.024, 0.022, 2.6], [0.13, Y, 0.0175, 0.019, 0.019, 2.1], [0.145, Y, 0.016, 0.017, 0.017, 2]]), En]);
  P.push([turn([[0.0165, 0.118], [0.0235, 0.124], [0.0255, 0.14], [0.0255, 0.162], [0.022, 0.172], [0.0185, 0.172], [0.0185, 0.14], [0.012, 0.14], [0, 0.14]], Y, 36), Au]); // collar
  const cry = (r, len) => { const g = new THREE.CylinderGeometry(r * 0.72, r, len, 6, 1).rotateX(Math.PI / 2), tip = new THREE.ConeGeometry(r * 0.72, len * 0.28, 6).rotateX(Math.PI / 2).translate(0, 0, len * 0.64); return [faceted(g), faceted(tip)]; };
  for (let i = 0; i < 3; i++) { const a = Math.PI / 2 + i * Math.PI * 2 / 3; for (const g of cry(0.0078, 0.135)) P.push([g.translate(0, 0.0115, 0.225).rotateZ(a - Math.PI / 2).translate(0, Y, 0), Cr]); }
  for (const g of cry(0.0034, 0.15)) P.push([g.translate(0, Y, 0.215), G]);
  P.push([ring(0.0205, 0.0022, 0.232, Y, 36), Au], [ring(0.0205, 0.001, 0.2325, Y, 36).scale(1.08, 1.08, 1).translate(0, -Y * 0.08, 0), G]);
  P.push([ball(0.0105, 0, Y, -0.079, 1, 1, 0.5), G], [turn([[0.0105, -0.084], [0.0135, -0.08], [0.0135, -0.072], [0.011, -0.07]], Y), Au]); // focus lens at the back
  for (const sx of [-1, 1]) P.push([box(0.0014, 0.003, 0.1, sx * 0.0228, Y + 0.006, 0.03), G]);
  P.push([slab([[-0.04, Y + 0.027], [0.1, Y + 0.025], [0.115, Y + 0.02], [0.115, Y + 0.03], [0.09, Y + 0.035], [-0.03, Y + 0.036]], 0.009, 0.002), Au]);
  P.push([gripHull(0.015, 0.0235, 0.104, 0.3, 2.8), Dk], [guardTube(), Au], [trigger(), Au], [frame(0.017, 3), En]);
  return make(P, [0, Y, 0.33]);
}
// 8. Arc Fork: a tuning fork for lightning. Heat-blued tines, capacitor drums, and a live arc held between the two.
function ab8() {
  const Bl = skin('blued', { base: [70, 88, 150], tones: [[120, 90, 170], [60, 130, 180], [150, 110, 90], [50, 60, 110]], rough: 0.24, roughVar: 0.2, mottle: 160, panels: [2, 3], dark: [6, 8, 18], edge: [200, 214, 255], scratches: 200, scratchDir: 0, bump: 1.6, seed: 81 }, { metalness: 1, iridescence: 0.7, iridescenceIOR: 2 });
  const Cu = skin('copper', { base: [176, 92, 50], tones: [[220, 130, 76], [110, 54, 30]], rough: 0.3, ribs: 46, ribK: 0.8, dark: [40, 14, 6], seed: 82 }, { metalness: 1 });
  const Rb = skin('rubber8', { base: [18, 18, 20], tones: [[30, 30, 34], [8, 8, 10]], rough: 0.85, hex: 54, dark: [0, 0, 0], bump: 2.2, seed: 83 }, { metalness: 0 });
  const G = glow(0x8fd8ff), W = glow(0xf2fbff), P = [];
  P.push([hull([[-0.08, Y, 0.009, 0.012, 0.012, 3], [-0.05, Y, 0.02, 0.03, 0.026, 3.6], [0.02, Y, 0.022, 0.033, 0.029, 3.8], [0.075, Y, 0.021, 0.032, 0.028, 3.6], [0.1, Y, 0.016, 0.03, 0.026, 3]]), Bl]);
  for (const sy of [1, -1]) { P.push([hull([[0.08, Y + sy * 0.022, 0.012, 0.0075, 0.0075, 3.4], [0.16, Y + sy * 0.0235, 0.0105, 0.0065, 0.0065, 3.4], [0.27, Y + sy * 0.0225, 0.0085, 0.0055, 0.0055, 3.2], [0.33, Y + sy * 0.0215, 0.0055, 0.004, 0.004, 3]], 20, 5), Bl]);
    P.push([box(0.006, 0.0014, 0.2, 0, Y + sy * 0.0158, 0.21), G]);
    for (const z of [0.15, 0.21, 0.27]) P.push([ball(0.0042, 0, Y + sy * 0.0135, z), Cu]); }
  { const r = rng(88), pts = []; for (let i = 0; i <= 16; i++) pts.push([(r() - 0.5) * 0.008, Y + (i % 2 ? 1 : -1) * (0.004 + r() * 0.008), 0.125 + i * 0.012]); pts[0][1] = Y; // the arc itself
    P.push([sweep(pts, pts.map(() => 0.0011), 6), W]); const p2 = pts.map(([x, y, z]) => [x * -1.4, Y - (y - Y) * 0.7, z + 0.004]); P.push([sweep(p2, p2.map(() => 0.0007), 5), G]); }
  P.push([ball(0.008, 0, Y, 0.112), W]);
  for (const sx of [-1, 1]) { P.push([drum(0.0185, 0.014, sx * 0.028, Y + 0.002, 0.02), Cu], [drum(0.0205, 0.003, sx * 0.0215, Y + 0.002, 0.02), Bl], [drum(0.0205, 0.003, sx * 0.0355, Y + 0.002, 0.02), Bl], [drum(0.007, 0.002, sx * 0.0375, Y + 0.002, 0.02), G]); }
  P.push([slab([[-0.05, Y + 0.03], [0.07, Y + 0.032], [0.085, Y + 0.036], [0.07, Y + 0.041], [-0.04, Y + 0.04]], 0.008, 0.002), Rb]);
  P.push([turn([[0, -0.086], [0.009, -0.086], [0.012, -0.08], [0.012, -0.074], [0, -0.074]], Y), Cu]);
  P.push([gripHull(0.0155, 0.0245, 0.104, 0.3, 3.2), Rb], [guardTube(), Bl], [trigger(), Cu], [frame(0.0175, 3.4), Bl]);
  return make(P, [0, Y, 0.335]);
}
// 9. Scarab: a living jewel. A beetle's wing-cases, green turning to violet as it moves, gold legs gripping one burning eye.
function ab9() {
  const Sh = skin('scarab', { base: [20, 110, 70], tones: [[30, 150, 90], [60, 50, 140], [10, 70, 60], [120, 110, 40]], rough: 0.14, roughVar: 0.14, mottle: 130, pores: 420, ribs: 9, ribK: 0.3, dark: [2, 20, 14], bump: 1.5, seed: 91 }, { metalness: 0.75, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 1, iridescenceIOR: 2.1, iridescenceThicknessRange: [180, 620] });
  const Au = skin('gold9', { base: [196, 148, 58], tones: [[240, 200, 108], [130, 88, 30]], rough: 0.26, dents: 200, dark: [56, 32, 8], scratches: 100, edge: [255, 236, 170], seed: 92 }, { metalness: 1, envMapIntensity: 1.5 });
  const Bk = skin('scarab-b', { base: [16, 16, 18], tones: [[28, 30, 30], [6, 6, 8]], rough: 0.3, hex: 36, dark: [0, 0, 0], bump: 2, seed: 93 }, { metalness: 0.4, clearcoat: 1 });
  const Eye = plasma('eye9', '150,20,0', '255,170,40', 12), G = glow(0xff7a20), P = [];
  P.push([hull([[-0.075, Y, 0.012, 0.012, 0.012, 2], [-0.045, Y + 0.002, 0.024, 0.024, 0.022, 2], [0.03, Y + 0.004, 0.03, 0.03, 0.026, 2.1], [0.11, Y + 0.002, 0.0265, 0.025, 0.023, 2], [0.165, Y, 0.019, 0.018, 0.018, 2], [0.185, Y, 0.016, 0.016, 0.016, 2]]), Bk]);
  for (const sx of [-1, 1]) P.push([hull([[-0.058, Y + 0.012, 0.011, 0.014, 0.012, 2.2], [-0.02, Y + 0.016, 0.0155, 0.02, 0.016, 2.2], [0.05, Y + 0.018, 0.0165, 0.021, 0.018, 2.2], [0.12, Y + 0.014, 0.013, 0.016, 0.014, 2.2], [0.158, Y + 0.008, 0.006, 0.008, 0.007, 2.2]], 24, 5).translate(sx * 0.0152, 0, 0), Sh]); // wing-cases
  P.push([hull([[-0.072, Y + 0.014, 0.015, 0.012, 0.008, 2.2], [-0.05, Y + 0.02, 0.019, 0.014, 0.01, 2.2], [-0.03, Y + 0.02, 0.014, 0.01, 0.008, 2.2]], 20, 4), Au]);    // collar plate
  P.push([ball(0.0185, 0, Y, 0.186, 1, 1, 0.8), Eye], [ring(0.0185, 0.0036, 0.184, Y, 36), Au], [ball(0.0062, 0, Y, 0.2, 1, 1, 0.5), glow(0x200400)]);
  for (const sx of [-1, 1]) for (const [z0, k] of [[0.02, 1], [0.07, 0.9], [0.115, 0.75]]) P.push([sweep([[sx * 0.022, Y + 0.004, z0], [sx * 0.036 * k + sx * 0.004, Y - 0.006, z0 + 0.03], [sx * 0.032 * k, Y - 0.022, z0 + 0.06], [sx * 0.018 * k, Y - 0.026, z0 + 0.082 * k]], [0.0032, 0.0034, 0.0026, 0.001], 8), Au]); // legs
  for (const sx of [-1, 1]) P.push([sweep([[sx * 0.008, Y + 0.02, 0.16], [sx * 0.016, Y + 0.034, 0.19], [sx * 0.02, Y + 0.03, 0.225], [sx * 0.012, Y + 0.018, 0.245]], [0.0026, 0.0024, 0.002, 0.0008], 8), Au]); // horns over the eye
  P.push([gripHull(0.015, 0.0235, 0.104, 0.3, 2.2), Bk], [guardTube(0.0034), Au], [trigger(), Au], [frame(0.018, 2.2), Bk]);
  return make(P, [0, Y, 0.205]);
}
// 10. Warden: the heavy one. A six-sided titanium shroud breathing furnace light, a muzzle brake, a core drum on its flank.
function ab10() {
  const Ti = skin('titan', { base: [62, 64, 68], tones: [[92, 94, 100], [36, 38, 42], [74, 66, 58]], rough: 0.42, roughVar: 0.3, panels: [2, 3], dark: [6, 6, 8], edge: [210, 210, 216], scratches: 320, scratchDir: 0, bump: 2, seed: 101 }, { metalness: 0.95 });
  const Vt = skin('vents', { base: [44, 46, 50], tones: [[66, 68, 74], [26, 28, 30]], rough: 0.46, vents: [3, 8], glow: [255, 120, 20], edge: [200, 200, 206], scratches: 120, scratchDir: 0, seed: 102 }, { metalness: 0.95, glowK: 2.8, repeat: 1 });
  const Dk = skin('warden-d', { base: [20, 20, 22], tones: [[32, 32, 36], [10, 10, 12]], rough: 0.7, hex: 50, dark: [0, 0, 0], bump: 2.2, seed: 103 }, { metalness: 0.2 });
  const Pl = plasma('pl10', '120,30,0', '255,200,90', 5), G = glow(0xff8a1e), P = [];
  P.push([hull([[-0.085, Y, 0.012, 0.016, 0.016, 3.4], [-0.055, Y + 0.002, 0.0225, 0.03, 0.027, 3.8], [0.02, Y + 0.003, 0.025, 0.034, 0.03, 4], [0.09, Y + 0.002, 0.024, 0.031, 0.028, 3.8], [0.115, Y, 0.021, 0.025, 0.024, 3]]), Ti]);
  { const g = faceted(new THREE.CylinderGeometry(0.0215, 0.0235, 0.17, 6, 1).rotateX(Math.PI / 2).rotateZ(Math.PI / 6).translate(0, Y, 0.195)); P.push([g, Vt]); }   // vented shroud
  for (const z of [0.112, 0.196, 0.28]) P.push([faceted(new THREE.CylinderGeometry(0.0255, 0.0255, 0.01, 6, 1).rotateX(Math.PI / 2).rotateZ(Math.PI / 6).translate(0, Y, z)), Ti]);
  P.push([turn([[0.0, 0.28], [0.015, 0.28], [0.015, 0.292], [0.0245, 0.296], [0.0245, 0.312], [0.019, 0.314], [0.019, 0.322], [0.0245, 0.324], [0.0245, 0.34], [0.0165, 0.343], [0.0125, 0.33], [0.0, 0.33]], Y, 32), Dk]); // muzzle brake
  P.push([turn([[0, 0.326], [0.0122, 0.326], [0.0122, 0.331], [0, 0.331]], Y), G], [ring(0.0193, 0.0016, 0.318, Y, 28), G]);
  P.push([drum(0.024, 0.024, 0.037, Y - 0.002, 0.03), Ti], [drum(0.0185, 0.008, 0.052, Y - 0.002, 0.03), Pl], [drum(0.021, 0.004, 0.0475, Y - 0.002, 0.03).scale(1, 1, 1), Dk]); // core drum on the right flank
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; P.push([box(0.003, 0.006, 0.006, 0.05, Y - 0.002 + Math.sin(a) * 0.0205, 0.03 + Math.cos(a) * 0.0205), Ti]); }
  P.push([box(0.006, 0.02, 0.07, -0.0265, Y + 0.004, 0.03), Dk], [box(0.0015, 0.004, 0.06, -0.03, Y + 0.004, 0.03), G]);
  P.push([slab([[-0.06, Y + 0.03], [0.1, Y + 0.033], [0.112, Y + 0.038], [0.1, Y + 0.046], [-0.045, Y + 0.046], [-0.06, Y + 0.04]], 0.014, 0.0025), Dk]);
  for (const z of [-0.035, 0.085]) P.push([box(0.016, 0.009, 0.008, 0, Y + 0.05, z), Ti]); P.push([box(0.0025, 0.006, 0.003, 0, Y + 0.056, 0.085), G]);
  P.push([slab([[0.07, Y - 0.026], [0.115, Y - 0.022], [0.26, Y - 0.024], [0.27, Y - 0.034], [0.12, Y - 0.04], [0.085, Y - 0.038]], 0.016, 0.003), Ti]);          // under-barrel heat sink
  for (let i = 0; i < 7; i++) P.push([box(0.022, 0.012, 0.0035, 0, Y - 0.034, 0.13 + i * 0.02), Dk]);
  P.push([turn([[0, -0.092], [0.012, -0.092], [0.016, -0.084], [0.016, -0.078], [0, -0.078]], Y), Dk], [ring(0.009, 0.002, -0.0925, Y, 24), G]);
  P.push([gripHull(0.0165, 0.026, 0.104, 0.28, 3.4), Dk], [guardTube(0.0038), Ti], [trigger(), G], [frame(0.019, 3.6), Ti]);
  return make(P, [0, Y, 0.343]);
}
export const BLASTERS = { ab1, ab2, ab3, ab4, ab5, ab6, ab7, ab8, ab9, ab10 };
export const BLASTER_NAMES = { ab1: 'Sentinel', ab2: 'Hive', ab3: 'Obsidian Fang', ab4: 'Relic', ab5: 'Halo', ab6: 'Blight', ab7: 'Prism', ab8: 'Arc Fork', ab9: 'Scarab', ab10: 'Warden' };
