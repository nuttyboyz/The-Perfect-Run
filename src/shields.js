// Sword-and-shield pairs: ten one-handed blades, each with its own shield.
// The blade follows the weapon convention of weapons.js: origin at the hand, +Z from the grip to the tip,
// blades flat in the X/Z plane with the edge along +X (or symmetric), thickness along Y.
// The shield has its OWN frame: centred at the origin, lying in the Y/Z plane, its front (outer) face toward +X
// (front surface at x ~ +thickness, strap/grip side at x ~ 0), up is +Y, so a kite shield's point is at -Y.
// `size` is the shield's height in metres. Builders return { parts, reach, support, twoHanded, shield: { parts, size } }.
import * as THREE from 'three';
import { mats, modern, grainTexture, lathe, at, sweep, rod, cyl, BX, CY, wrapped, bladeParts, ringD, ringS, TAG_D, TAG_S, flatPlate, glowColor, bat, tab } from './weapons.js';

// ---------- shield helpers ----------
let SM = null;
function smats() {
  if (SM) return SM;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  SM = {
    woodRed: std({ map: grainTexture('#93301f', '#2a0c08', 90), roughness: 0.62 }),
    woodOchre: std({ map: grainTexture('#c99b3c', '#5a3a10', 90), roughness: 0.62 }),
    woodPale: std({ map: grainTexture('#a8845a', '#4a3015', 90), roughness: 0.6 }),
    coat: std({ color: 0x1f2124, metalness: 0.6, roughness: 0.5 }),               // black-oxide blade coating
    orange: std({ color: 0xe0661a, roughness: 0.85 }),                              // rubber grip
    tape: std({ color: 0x7d7f84, roughness: 0.95 }),                                // duct tape
    galv: std({ color: 0x8e9499, metalness: 0.7, roughness: 0.55 }),                // galvanised sign post
    signRed: std({ color: 0xc41e1e, roughness: 0.45, metalness: 0.1 }),
    rust: std({ color: 0x6a3a1c, roughness: 0.95 }),
    primer: std({ color: 0x8a8d8a, roughness: 0.9 }),
    carPaint: new THREE.MeshPhysicalMaterial({ color: 0x2a7a86, metalness: 0.55, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
    poly: new THREE.MeshStandardMaterial({ color: 0x2c3a48, transparent: true, opacity: 0.3, roughness: 0.15, metalness: 0, envMapIntensity: 0.6, depthWrite: false }), // tinted polycarbonate: almost no diffuse, just sheen
    hexPanel: new THREE.MeshPhysicalMaterial({ color: 0x3ec8ff, emissive: 0x0a4a66, transparent: true, opacity: 0.38, roughness: 0.1, metalness: 0, depthWrite: false, side: THREE.DoubleSide }),
    cyan: glowColor(0x5ff0ff),
    plasmaCore: new THREE.MeshBasicMaterial({ color: 0xf4ecff, toneMapped: false }),
    plasmaGlow: new THREE.MeshBasicMaterial({ color: 0x8a46ff, toneMapped: false, transparent: true, opacity: 0.7, depthWrite: false }),
    violet: glowColor(0xb070ff),
  };
  return SM;
}
// Painted canvas -> texture (sRGB). fn(ctx, w, h) draws it; the canvas starts transparent.
function paint(w, h, fn) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// Curved panel in shield space. rows = [[y, z0, z1], ...] from bottom to top; prof(z) is the x offset of the
// surface (curvature, a ridge); t the thickness (front at dx + t + prof, back at dx + prof). Front and back are
// smooth grids, the rim is flat quads. UV: u runs screen-right (toward -z) so painted textures read correctly.
function shell(rows, prof, t, { N = 12, dx = 0, uv = null } = {}) {
  const R = rows.length, pos = [], uvs = [], idx = [];
  const ymin = rows[0][0], ymax = rows[R - 1][0];
  const Z = Math.max(...rows.map((r) => Math.max(Math.abs(r[1]), Math.abs(r[2])))) || 1;
  const UV = uv || ((z, y) => [0.5 - z / (2 * Z), (y - ymin) / (ymax - ymin || 1)]);
  const push = (p) => { pos.push(p[0], p[1], p[2]); const [u, v] = UV(p[2], p[1]); uvs.push(u, v); return pos.length / 3 - 1; };
  const f = (i, j) => { const [y, z0, z1] = rows[i], z = z0 + (z1 - z0) * j / N; return [dx + t + prof(z), y, z]; };
  const b = (i, j) => { const p = f(i, j); p[0] -= t; return p; };
  const F = [], B = [];
  for (let i = 0; i < R; i++) { F.push([]); B.push([]); for (let j = 0; j <= N; j++) { F[i].push(push(f(i, j))); B[i].push(push(b(i, j))); } }
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < N; j++) {
    idx.push(F[i][j], F[i + 1][j], F[i + 1][j + 1], F[i][j], F[i + 1][j + 1], F[i][j + 1]);
    idx.push(B[i][j], B[i + 1][j + 1], B[i + 1][j], B[i][j], B[i][j + 1], B[i + 1][j + 1]);
  }
  // Rim quads, wound so they face away from the panel's centre.
  const cx = dx + t / 2, cy = (ymin + ymax) / 2, cz = rows.reduce((s, r) => s + (r[1] + r[2]) / 2, 0) / R;
  const quad = (a, b2, c, d) => {
    const i0 = push(a), i1 = push(b2), i2 = push(c), i3 = push(d);
    const ab = [b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const o = [(a[0] + c[0]) / 2 - cx, (a[1] + c[1]) / 2 - cy, (a[2] + c[2]) / 2 - cz];
    if (n[0] * o[0] + n[1] * o[1] + n[2] * o[2] >= 0) idx.push(i0, i1, i2, i0, i2, i3); else idx.push(i0, i2, i1, i0, i3, i2);
  };
  for (let j = 0; j < N; j++) { quad(f(0, j), f(0, j + 1), b(0, j + 1), b(0, j)); quad(f(R - 1, j), f(R - 1, j + 1), b(R - 1, j + 1), b(R - 1, j)); }
  for (let i = 0; i < R - 1; i++) { quad(f(i, 0), f(i + 1, 0), b(i + 1, 0), b(i, 0)); quad(f(i, N), f(i + 1, N), b(i + 1, N), b(i, N)); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// Rows for a symmetric outline: half-width fn(y) sampled from y0 to y1.
const rowsSym = (fn, y0, y1, n) => { const r = []; for (let i = 0; i <= n; i++) { const y = y0 + (y1 - y0) * i / n, w = Math.max(0, fn(y)); r.push([y, -w, w]); } return r; };
// Rows of a vertical plank z0..z1 clipped to a disc of radius R (a round shield's planking).
function plankRows(R, z0, z1, n = 16) {
  const zin = Math.max(0, z0, -z1), yl = Math.sqrt(Math.max(0, R * R - zin * zin)), r = [];
  for (let i = 0; i <= n; i++) {
    const y = -yl + 2 * yl * i / n, h = Math.sqrt(Math.max(0, R * R - y * y));
    r.push([y, Math.max(z0, -h), Math.min(z1, h)]);
  }
  return r;
}
const flat = () => 0;
const curve = (k) => (z) => -k * z * z;
// Cylinder/disc/sphere with its axis turned to +X.
const axisX = (g) => g.rotateZ(-Math.PI / 2);
const sphere = (r, x, y, z, w = 10, h = 7) => at(new THREE.SphereGeometry(r, w, h), x, y, z);
const box = (w, h, d, x, y, z) => at(new THREE.BoxGeometry(w, h, d), x, y, z); // w along x (depth), h along y, d along z
const ringX = (r, tube, x, y, z, seg = 24) => at(new THREE.TorusGeometry(r, tube, 7, seg).rotateY(Math.PI / 2), x, y, z);
// Grip and strap on the back (x <= 0): a bar across for the fist and a forearm strap.
function straps(P, m, w = 0.12, dx = 0) {
  P.push([at(new THREE.CylinderGeometry(0.011, 0.011, w, 8).rotateX(Math.PI / 2), dx - 0.028, 0, 0), m.leather]);
  P.push([box(0.004, 0.035, w * 0.9, dx - 0.004, 0.11, 0), m.cord], [box(0.004, 0.035, w * 0.9, dx - 0.004, -0.11, 0), m.cord]);
}

// ---------- blade helpers ----------
// Double-edged blade: S = [[z, half-width, half-thickness, fuller half-width], ...]
const dbl = (S, m, fd = 0.0025) => bladeParts(S.map((s) => s[0]), S.map(([, w, t, fw]) => ringD(w, t, w * 0.3, fw, Math.min(fd, t * 0.4))), TAG_D, m);
// Single-edged blade: S = [[z, spine x, edge x, half-thickness], ...], optional x shift per station (a curved blade).
const sgl = (S, m, bend = () => 0, fw = 0) => bladeParts(S.map((s) => s[0]), S.map(([z, xs, xe, t]) => ringS(xe + bend(z), xs + bend(z), t, Math.min((xe - xs) * 0.3, 0.012), xs + (xe - xs) * 0.36 + bend(z), fw, 0.0016, 0.0015)), TAG_S, m);
const wheelPommel = (z, r, mat) => [lathe([[0, z - r * 0.8], [r * 0.4, z - r * 0.8], [r, z - r * 0.4], [r, z + r * 0.4], [r * 0.55, z + r * 0.8], [0, z + r * 0.8]], 16), mat];

// ================= MEDIEVAL =================
// Knight's heater shield (curved, red field with a gold chevron) and an arming sword.
function heater() {
  const m = mats(), s = smats(), P = [];
  const S = [[0.09, 0.03, 0.0065, 0], [0.11, 0.03, 0.0065, 0.005], [0.3, 0.029, 0.006, 0.006], [0.55, 0.025, 0.005, 0.005], [0.7, 0.018, 0.0035, 0.002], [0.76, 0.009, 0.002, 0], [0.8, 0, 0, 0]];
  P.push(...dbl(S, m));
  P.push([at(new THREE.BoxGeometry(0.2, 0.011, 0.013), 0, 0, 0.08), m.steelDark]);                      // straight cross
  for (const sx of [-1, 1]) P.push([sphere(0.0085, sx * 0.1, 0, 0.08, 8, 6), m.steelDark]);
  wrapped(P, -0.1, 0.072, [[-0.1, 0.0135], [-0.02, 0.0165], [0.072, 0.0145]], s.woodRed, m.cord, 11);
  P.push(wheelPommel(-0.125, 0.024, m.iron));
  // Shield: outline from a flat top through two arcs to the point; mapped heraldry.
  const rows = rowsSym((y) => (y > 0.1 ? 0.25 : 0.25 - 0.445 + Math.sqrt(Math.max(0, 0.445 * 0.445 - (y - 0.1) * (y - 0.1)))), -0.3, 0.1, 12);
  rows.push([0.3, -0.25, 0.25]);
  const tex = paint(256, 256, (g, w, h) => {
    g.fillStyle = '#a81e1e'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e2b53c'; g.beginPath(); g.moveTo(0, 150); g.lineTo(128, 60); g.lineTo(256, 150); g.lineTo(256, 200); g.lineTo(128, 110); g.lineTo(0, 200); g.fill();
    g.fillStyle = '#f2e6c8'; for (const [x, y] of [[62, 42], [194, 42], [128, 196]]) { g.beginPath(); g.arc(x, y, 16, 0, 7); g.fill(); }
    g.strokeStyle = '#d9b25c'; g.lineWidth = 10; g.strokeRect(0, 0, w, h);
  });
  const Q = [];
  Q.push([shell(rows, curve(0.3), 0.012, { N: 14 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.15 })]);
  Q.push([box(0.008, 0.016, 0.52, 0.016, 0.292, 0), m.iron]);                                            // steel top edge
  for (const z of [-0.2, -0.1, 0, 0.1, 0.2]) Q.push([sphere(0.006, 0.02, 0.28, z, 6, 5), m.brass]);
  straps(Q, m, 0.16);
  return { parts: P, reach: 0.8, support: null, twoHanded: false, shield: { parts: Q, size: 0.6 } };
}

// Viking round shield (painted planks, iron boss and rim) and a broad fullered viking sword.
function viking() {
  const m = mats(), s = smats(), P = [];
  const S = [[0.065, 0.031, 0.006, 0], [0.085, 0.031, 0.006, 0.011], [0.3, 0.03, 0.006, 0.011], [0.5, 0.027, 0.0055, 0.009], [0.62, 0.02, 0.004, 0.004], [0.68, 0.01, 0.002, 0], [0.71, 0, 0, 0]];
  P.push(...dbl(S, m, 0.002));
  P.push([at(new THREE.BoxGeometry(0.095, 0.017, 0.022), 0, 0, 0.052), m.iron]);                       // short lower guard
  P.push([at(new THREE.BoxGeometry(0.078, 0.015, 0.018), 0, 0, -0.112), m.iron]);                      // upper guard
  P.push([sphere(0.021, 0, 0, -0.136, 10, 8), m.brass], [sphere(0.013, 0.03, 0, -0.128, 8, 6), m.brass], [sphere(0.013, -0.03, 0, -0.128, 8, 6), m.brass]); // lobed pommel
  wrapped(P, -0.102, 0.042, [[-0.102, 0.0145], [-0.03, 0.0165], [0.042, 0.015]], m.leather, m.cord, 9);
  // Shield: seven vertical planks clipped to the disc, the left half painted red, the right ochre.
  const R = 0.36, Q = [], edges = [-R, -0.26, -0.155, -0.05, 0.05, 0.155, 0.26, R];
  for (let i = 0; i < 7; i++) {
    const z0 = edges[i], z1 = edges[i + 1], mat = z1 <= 0.001 ? s.woodRed : s.woodOchre;
    Q.push([shell(plankRows(R, z0, z1, 18), flat, 0.012, { N: 2, uv: (z, y) => [y * 2.2, z * 2.2] }), mat]);
  }
  for (const z of edges.slice(1, -1)) Q.push([box(0.002, 2 * Math.sqrt(R * R - z * z) - 0.01, 0.003, 0.0125, 0, z), m.slot]); // plank seams
  Q.push([axisX(new THREE.SphereGeometry(0.085, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2)), m.iron]);     // boss
  Q.push([axisX(new THREE.CylinderGeometry(0.105, 0.105, 0.006, 24)), m.iron]);                         // boss flange
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; Q.push([sphere(0.006, 0.015, Math.sin(a) * 0.097, Math.cos(a) * 0.097, 6, 5), m.brass]); }
  Q.push([ringX(R, 0.009, 0.006, 0, 0, 40), m.iron]);                                                   // iron rim
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; Q.push([sphere(0.006, 0.015, Math.sin(a) * (R - 0.028), Math.cos(a) * (R - 0.028), 6, 5), m.iron]); }
  Q.push([at(new THREE.CylinderGeometry(0.013, 0.013, 0.5, 8).rotateX(Math.PI / 2), -0.008, 0, 0), m.wood]);        // grip bar across the back, hand in the boss
  return { parts: P, reach: 0.71, support: null, twoHanded: false, shield: { parts: Q, size: 0.72 } };
}

// Norman kite shield (tall, curved, gold with a red bend) and a long tapering Norman sword.
function kite() {
  const m = mats(), s = smats(), P = [];
  const S = [[0.08, 0.028, 0.006, 0], [0.1, 0.028, 0.006, 0.008], [0.4, 0.026, 0.0055, 0.007], [0.65, 0.021, 0.0045, 0.005], [0.78, 0.014, 0.003, 0.002], [0.84, 0.006, 0.0015, 0], [0.87, 0, 0, 0]];
  P.push(...dbl(S, m));
  P.push([at(new THREE.BoxGeometry(0.21, 0.011, 0.013), 0, 0, 0.07), m.iron]);
  wrapped(P, -0.1, 0.064, [[-0.1, 0.013], [-0.02, 0.016], [0.064, 0.014]], m.leather, m.cord, 10);
  P.push([at(new THREE.SphereGeometry(0.021, 12, 8).scale(1.7, 0.75, 1.0), 0, 0, -0.125), m.iron]);     // brazil-nut pommel
  const rows = rowsSym((y) => (y > 0.19 ? Math.sqrt(Math.max(0, 0.21 * 0.21 - (y - 0.19) * (y - 0.19))) : 0.21 * (y + 0.4) / 0.59), -0.4, 0.4, 18);
  const tex = paint(256, 512, (g, w, h) => {
    g.fillStyle = '#d8b040'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#9c1c1c'; g.beginPath(); g.moveTo(0, 60); g.lineTo(0, 190); g.lineTo(256, 450); g.lineTo(256, 320); g.fill();
    g.strokeStyle = '#2a1a0a'; g.lineWidth = 12; g.strokeRect(0, 0, w, h);
  });
  const Q = [];
  Q.push([shell(rows, curve(0.3), 0.012, { N: 12 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.1 })]);
  Q.push([axisX(new THREE.SphereGeometry(0.05, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)).translate(0.008, 0.16, 0), m.iron]); // boss
  for (const [y, z] of [[0.33, 0], [0.16, -0.17], [0.16, 0.17], [-0.12, 0], [0.0, -0.1], [0.0, 0.1]]) Q.push([sphere(0.007, 0.018 - 0.3 * z * z, y, z, 6, 5), m.iron]);
  straps(Q, m, 0.14);
  return { parts: P, reach: 0.87, support: null, twoHanded: false, shield: { parts: Q, size: 0.8 } };
}

// Crossbowman's pavise (tall, ridged, white with a red cross on planks) and a broad falchion.
function pavise() {
  const m = mats(), s = smats(), P = [];
  const S = [[0.08, -0.016, 0.016, 0.006], [0.1, -0.016, 0.02, 0.006], [0.3, -0.016, 0.03, 0.0055], [0.45, -0.016, 0.042, 0.005], [0.54, -0.016, 0.05, 0.0045], [0.6, -0.01, 0.048, 0.004], [0.64, 0.0, 0.038, 0.003], [0.67, 0.012, 0.022, 0.002], [0.69, 0.018, 0.018, 0]];
  P.push(...sgl(S, m));
  P.push([at(new THREE.BoxGeometry(0.15, 0.011, 0.012), 0, 0, 0.072), m.iron]);
  wrapped(P, -0.1, 0.066, [[-0.1, 0.014], [-0.02, 0.0165], [0.066, 0.015]], s.woodPale, m.cord, 10);
  P.push(wheelPommel(-0.122, 0.021, m.iron));
  const rows = [[-0.4, -0.25, 0.25], [0.35, -0.25, 0.25], [0.4, -0.21, 0.21]];
  const tex = paint(256, 512, (g, w, h) => {
    g.fillStyle = '#efe4cc'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#b02020'; g.fillRect(104, 40, 48, 430); g.fillRect(30, 140, 196, 48);
    g.strokeStyle = '#4a2a10'; g.lineWidth = 14; g.strokeRect(0, 0, w, h);
  });
  const Q = [];
  Q.push([shell(rows, (z) => -0.09 * Math.abs(z), 0.014, { N: 12 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0.0 })]);
  for (let i = 0; i < 6; i++) for (const z of [-0.23, 0.23]) Q.push([sphere(0.006, 0.015 - 0.09 * 0.23, -0.35 + i * 0.14, z, 6, 5), m.brass]);
  Q.push([box(0.012, 0.74, 0.03, -0.007, 0, 0), m.wood], [box(0.012, 0.03, 0.44, -0.03, 0.2, 0), m.wood], [box(0.012, 0.03, 0.44, -0.03, -0.2, 0), m.wood]); // back battens (the sides drop with the ridge)
  straps(Q, m, 0.16, -0.024);
  return { parts: P, reach: 0.69, support: null, twoHanded: false, shield: { parts: Q, size: 0.8 } };
}

// Steel buckler (domed boss, riveted flange) and a swept-hilt rapier.
function buckler() {
  const m = mats(), s = smats(), P = [];
  const S = [[0.11, 0.012, 0.004, 0], [0.13, 0.011, 0.004, 0.003], [0.5, 0.009, 0.0035, 0.0025], [0.85, 0.006, 0.0025, 0], [1.0, 0.0025, 0.0012, 0], [1.04, 0, 0, 0]];
  P.push(...dbl(S, m, 0.0012));
  P.push([at(new THREE.BoxGeometry(0.02, 0.0075, 0.07), 0, 0, 0.075), m.steelDark]);                   // ricasso
  P.push([sweep([[-0.13, 0, 0.078], [-0.07, 0, 0.082], [0, 0, 0.08], [0.07, 0, 0.082], [0.13, 0, 0.078]], [0.004, 0.0045, 0.005, 0.0045, 0.004], 8), m.steelDark]); // quillons
  P.push([sweep([[0.125, 0, 0.078], [0.14, 0, 0.02], [0.1, 0, -0.06], [0.035, 0, -0.1]], [0.004, 0.0042, 0.0042, 0.004], 8), m.steelDark]); // knuckle bow
  P.push([at(new THREE.TorusGeometry(0.032, 0.0035, 6, 20).rotateX(Math.PI / 2), 0, 0, 0.105), m.steelDark]);               // side ring
  P.push([at(new THREE.TorusGeometry(0.02, 0.003, 6, 16).rotateX(Math.PI / 2), 0, 0, 0.135), m.steelDark]);
  for (const sx of [-1, 1]) P.push([sweep([[sx * 0.03, 0, 0.078], [sx * 0.045, 0, 0.13], [sx * 0.02, 0, 0.145]], [0.0035, 0.0035, 0.003], 7), m.steelDark]); // pas d'ane
  wrapped(P, -0.085, 0.07, [[-0.085, 0.0105], [0.07, 0.0105]], m.steelDark, m.brass, 16, 0.0022, true);
  P.push([at(new THREE.SphereGeometry(0.015, 12, 8).scale(1, 1, 1.35), 0, 0, -0.105), m.steelDark]);
  // Shield: one turned steel dish with a domed centre and a flat flange.
  const Q = [];
  Q.push([axisX(new THREE.LatheGeometry([[0, 0.078], [0.03, 0.072], [0.06, 0.05], [0.08, 0.03], [0.1, 0.018], [0.205, 0.012], [0.225, 0.012], [0.225, 0.0], [0.205, 0.0], [0.1, 0.006], [0.08, 0.018], [0.06, 0.038], [0.03, 0.06], [0, 0.066]].map(([r, x]) => new THREE.Vector2(r, x)), 32)), m.steel]);
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; Q.push([sphere(0.006, 0.015, Math.sin(a) * 0.195, Math.cos(a) * 0.195, 6, 5), m.brass]); }
  Q.push([ringX(0.1, 0.004, 0.02, 0, 0, 28), m.brass]);
  Q.push([at(new THREE.CylinderGeometry(0.011, 0.011, 0.18, 8).rotateX(Math.PI / 2), 0.025, 0, 0), m.leather]);  // grip inside the dome
  return { parts: P, reach: 1.04, support: null, twoHanded: false, shield: { parts: Q, size: 0.45 } };
}

// ================= MODERN =================
// Clear polycarbonate riot shield (curved, black frame, POLICE) and a black-coated sawback machete.
function riot() {
  const m = mats(), s = smats(), P = [];
  const S = [[0.1, -0.02, 0.02, 0.005], [0.13, -0.02, 0.03, 0.005], [0.3, -0.02, 0.045, 0.005], [0.48, -0.02, 0.052, 0.005], [0.58, -0.015, 0.05, 0.0045], [0.64, 0.0, 0.04, 0.003], [0.68, 0.016, 0.024, 0.0015], [0.7, 0.022, 0.022, 0]];
  P.push(...sgl(S, { edge: m.edge, steel: s.coat, steelDark: s.coat }));
  for (let z = 0.2; z < 0.5; z += 0.035) P.push([at(new THREE.BoxGeometry(0.012, 0.004, 0.012).rotateY(Math.PI / 4), -0.024, 0, z), s.coat]); // sawback
  P.push([lathe([[0, -0.085], [0.017, -0.085], [0.02, -0.065], [0.0185, 0.0], [0.0185, 0.085], [0.021, 0.1], [0, 0.1]], 10), s.orange]);
  for (const z of [-0.05, 0.0, 0.05]) P.push([at(new THREE.TorusGeometry(0.0185, 0.0025, 5, 12), 0, 0, z), m.rubber]);
  P.push([at(new THREE.BoxGeometry(0.016, 0.048, 0.012), 0, 0, 0.106), s.coat]);
  P.push([at(new THREE.TorusGeometry(0.012, 0.002, 5, 12).rotateY(Math.PI / 2), 0, 0, -0.095), m.cord]);
  const rows = [[-0.4, -0.24, 0.24], [0.4, -0.24, 0.24]], pr = curve(0.35), Q = [];
  Q.push([shell(rows, pr, 0.006, { N: 14 }), s.poly]);
  for (const [y0, y1] of [[-0.4, -0.355], [0.355, 0.4]]) Q.push([shell([[y0, -0.245, 0.245], [y1, -0.245, 0.245]], pr, 0.012, { N: 14, dx: -0.003 }), m.rubber]);
  for (const [z0, z1] of [[-0.245, -0.205], [0.205, 0.245]]) Q.push([shell([[-0.4, z0, z1], [0.4, z0, z1]], pr, 0.012, { N: 2, dx: -0.003 }), m.rubber]);
  const tex = paint(512, 128, (g, w, h) => { g.fillStyle = '#ffffff'; g.font = 'bold 96px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('POLICE', w / 2, h / 2 + 4); });
  Q.push([shell([[-0.045, -0.2, 0.2], [0.045, -0.2, 0.2]], pr, 0.0012, { N: 14, dx: 0.0065 }), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6 })]);
  Q.push([at(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8).rotateX(Math.PI / 2), -0.03, -0.05, 0), m.rubber]);   // handle
  Q.push([box(0.06, 0.02, 0.02, -0.03, -0.05, -0.08), m.polymer], [box(0.06, 0.02, 0.02, -0.03, -0.05, 0.08), m.polymer]);
  Q.push([box(0.006, 0.04, 0.2, -0.006, 0.12, 0), m.nylon]);                                           // forearm cuff
  return { parts: P, reach: 0.7, support: null, twoHanded: false, shield: { parts: Q, size: 0.8 } };
}

// Black ballistic shield with an armoured viewport, and a kukri.
function ballistic() {
  const m = mats(), s = smats(), P = [];
  const bend = (z) => 0.13 * Math.pow(Math.max(0, z - 0.08) / 0.3, 2);
  const S = [[0.075, -0.013, 0.013, 0.006], [0.1, -0.013, 0.018, 0.006], [0.17, -0.013, 0.028, 0.0058], [0.25, -0.013, 0.045, 0.0055], [0.32, -0.013, 0.058, 0.005], [0.37, -0.005, 0.056, 0.004], [0.41, 0.015, 0.045, 0.0025], [0.44, 0.032, 0.032, 0]];
  P.push(...sgl(S, m, bend, 0.003));
  P.push([lathe([[0, -0.1], [0.015, -0.1], [0.021, -0.092], [0.016, -0.06], [0.0155, 0.0], [0.0165, 0.05], [0.015, 0.06], [0, 0.06]], 12), m.wood]);
  P.push([lathe([[0, 0.058], [0.017, 0.058], [0.018, 0.078], [0.012, 0.08], [0, 0.08]], 12), m.brass]); // bolster
  P.push([lathe([[0, -0.106], [0.021, -0.106], [0.021, -0.098], [0, -0.098]], 12), m.brass]);          // butt plate
  const rows = [[-0.35, -0.23, 0.23], [0.27, -0.23, 0.23], [0.32, -0.2, 0.2], [0.35, -0.15, 0.15]], pr = curve(0.15), Q = [];
  Q.push([shell(rows, pr, 0.025, { N: 12 }), m.polymer]);
  Q.push([shell([[-0.35, -0.23, 0.23], [-0.2, -0.23, 0.23]], pr, 0.002, { N: 12, dx: 0.0255 }), m.anod]);   // grey lower panel
  Q.push([box(0.006, 0.12, 0.2, 0.027, 0.2, 0), m.gunmetal]);                                             // viewport frame
  Q.push([box(0.006, 0.095, 0.175, 0.029, 0.2, 0), m.lens]);                                              // armoured glass
  for (const y of [-0.3, -0.22, 0.05, 0.12]) for (const z of [-0.2, 0.2]) Q.push([sphere(0.006, 0.027 + pr(z), y, z, 6, 5), m.anod]);
  Q.push([box(0.004, 0.012, 0.42, 0.027, 0.0, 0), m.anod]);                                               // reflective strip
  Q.push([at(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8), -0.03, -0.02, 0), m.rubber]);                                      // vertical handle
  Q.push([box(0.06, 0.02, 0.02, -0.03, 0.06, 0), m.polymer], [box(0.06, 0.02, 0.02, -0.03, -0.1, 0), m.polymer]);
  Q.push([box(0.008, 0.05, 0.22, -0.006, 0.15, 0), m.nylon]);                                             // forearm strap
  return { parts: P, reach: 0.44, support: null, twoHanded: false, shield: { parts: Q, size: 0.7 } };
}

// A stop sign still on its post stub, and a baseball bat with nails through the barrel.
function stopsign() {
  const m = mats(), s = smats(), d = bat(), P = d.parts;
  const rad = (z) => tab([[0.0, 0.0165], [0.2, 0.0155], [0.42, 0.019], [0.6, 0.028], [0.72, 0.0335], [0.82, 0.033], [0.9, 0.026]], z);
  for (let i = 0; i < 16; i++) {
    const z = 0.5 + (i / 16) * 0.38, a = i * 2.1, r = rad(z), c = Math.cos(a), sn = Math.sin(a);
    P.push([rod([c * (r - 0.012), sn * (r - 0.012), z], [c * (r + 0.04), sn * (r + 0.04), z], 0.0026, 6), m.steelDark]);
    P.push([new THREE.ConeGeometry(0.0026, 0.012, 6).translate(0, 0.006, 0).rotateZ(a - Math.PI / 2).translate(c * (r + 0.04), sn * (r + 0.04), z), m.steelDark]);
  }
  P.push([lathe([[0, 0.22], [0.0185, 0.22], [0.0185, 0.3], [0, 0.3]], 12), s.tape]);                    // duct tape above the grip
  const Q = [], R = 0.31;
  Q.push([axisX(new THREE.CylinderGeometry(R, R, 0.005, 8)).rotateX(Math.PI / 8), s.signRed]);
  const tex = paint(512, 512, (g, w, h) => {
    g.strokeStyle = '#ffffff'; g.lineWidth = 22; g.beginPath();
    for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4, x = 256 + 225 * Math.cos(a), y = 256 + 225 * Math.sin(a); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath(); g.stroke();
    g.fillStyle = '#ffffff'; g.font = 'bold 150px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STOP', 256, 262);
  });
  Q.push([at(new THREE.PlaneGeometry(0.62, 0.62).rotateY(Math.PI / 2), 0.0056, 0, 0), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5 })]);
  for (const [y, z] of [[0.12, -0.09], [-0.05, 0.14], [-0.17, -0.02]]) Q.push([at(new THREE.CylinderGeometry(0.009, 0.009, 0.002, 10).rotateZ(Math.PI / 2), 0.0062, y, z), m.slot]); // bullet holes
  Q.push([at(new THREE.CylinderGeometry(0.019, 0.019, 0.5, 10), -0.022, -0.04, 0), s.galv]);           // post stub (the grip)
  for (const y of [0.12, -0.12]) Q.push([sphere(0.008, -0.004, y, 0, 6, 5), s.galv]);
  return { parts: P, reach: 0.94, support: null, twoHanded: false, shield: { parts: Q, size: 0.6 } };
}

// Sci-fi energy shield (alloy hex frame, glowing rim, translucent hex-cell panel) and a plasma blade.
function energy() {
  const m = mats(), s = smats(), P = [];
  P.push([lathe([[0, -0.15], [0.016, -0.15], [0.018, -0.13], [0.016, -0.02], [0.02, 0.0], [0.025, 0.03], [0.025, 0.085], [0.02, 0.1], [0, 0.1]], 14), m.gunmetal]);
  for (const z of [-0.11, -0.075, -0.04]) P.push([at(new THREE.TorusGeometry(0.0165, 0.003, 5, 14), 0, 0, z), m.rubber]);
  P.push([at(new THREE.TorusGeometry(0.023, 0.003, 6, 18), 0, 0, 0.1), s.violet]);                       // emitter ring
  P.push([at(new THREE.BoxGeometry(0.03, 0.006, 0.09), 0, 0.02, 0.055), s.violet]);                      // power cell window
  P.push([flatPlate([[-0.026, 0.1], [0.026, 0.1], [0.026, 0.8], [0.0, 0.9], [-0.026, 0.8]], 0.016, 0.004), s.plasmaGlow]);
  P.push([flatPlate([[-0.011, 0.1], [0.011, 0.1], [0.011, 0.82], [0.0, 0.88], [-0.011, 0.82]], 0.006, 0.0015), s.plasmaCore]);
  const Q = [], R = 0.31, V = [];
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 2; V.push([0.012, R * Math.sin(a), R * Math.cos(a)]); }
  for (let k = 0; k < 6; k++) Q.push([rod(V[k], V[(k + 1) % 6], 0.012, 8), m.gunmetal]);
  for (const v of V) Q.push([sphere(0.018, ...v, 10, 8), m.anod]);
  for (let k = 0; k < 6; k++) { const a = V[k], b = V[(k + 1) % 6]; Q.push([rod([0.02, a[1] * 0.9, a[2] * 0.9], [0.02, b[1] * 0.9, b[2] * 0.9], 0.004, 6), s.cyan]); }
  Q.push([axisX(new THREE.CylinderGeometry(R * 0.9, R * 0.9, 0.003, 6)).rotateX(Math.PI / 6).translate(0.01, 0, 0), s.hexPanel]);
  const tex = paint(512, 512, (g, w, h) => {
    g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 2, x = 256 + 250 * Math.cos(a), y = 256 - 250 * Math.sin(a); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); g.clip();
    g.strokeStyle = 'rgba(120,235,255,0.9)'; g.lineWidth = 3;
    const r = 34, dx = r * Math.sqrt(3), dy = r * 1.5;
    for (let row = -1; row < 12; row++) for (let col = -1; col < 10; col++) {
      const cx = col * dx + (row % 2 ? dx / 2 : 0), cy = row * dy; g.beginPath();
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; i ? g.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)) : g.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
      g.closePath(); g.stroke();
    }
  });
  Q.push([at(new THREE.PlaneGeometry(R * 1.8, R * 1.8).rotateY(Math.PI / 2), 0.0125, 0, 0), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, opacity: 0.85, depthWrite: false })]);
  Q.push([sphere(0.03, 0.0, 0, 0, 12, 8), m.gunmetal], [ringX(0.04, 0.005, 0.0, 0, 0, 20), s.cyan]);   // core emitter
  Q.push([box(0.03, 0.06, 0.14, -0.015, 0, 0), m.gunmetal], [box(0.012, 0.04, 0.04, -0.03, 0, 0), m.rubber]); // back housing and grip
  Q.push([box(0.02, 0.04, 0.12, -0.012, 0.12, 0), m.gunmetal], [box(0.02, 0.04, 0.12, -0.012, -0.12, 0), m.gunmetal]);
  return { parts: P, reach: 0.9, support: null, twoHanded: false, shield: { parts: Q, size: 0.62 } };
}

// A car door torn off at the hinges (teal paint, rust, window frame, rebar handle) and a crowbar.
function scrap() {
  const m = mats(), s = smats(), x = modern(), P = [];
  P.push([new THREE.CylinderGeometry(0.011, 0.011, 0.58, 6).rotateX(Math.PI / 2).translate(0, 0, 0.12), x.red]);
  P.push([sweep([[0, 0, 0.4], [0.01, 0, 0.47], [0.04, 0, 0.52], [0.085, 0, 0.54]], [0.011, 0.011, 0.01, 0.009], 6), m.steelDark]);
  P.push([flatPlate([[0.06, 0.515], [0.125, 0.565], [0.14, 0.545], [0.128, 0.528], [0.08, 0.5]], 0.014, 0.0015), m.steelDark]);       // claw
  P.push([flatPlate([[-0.013, -0.2], [0.013, -0.2], [0.013, -0.165], [-0.013, -0.165]], 0.006, 0.0012), m.steelDark]);                // chisel heel
  P.push([new THREE.CylinderGeometry(0.0115, 0.0115, 0.06, 6).rotateX(Math.PI / 2).translate(0, 0, -0.14), m.steelDark]);
  P.push([lathe([[0, -0.05], [0.014, -0.05], [0.014, 0.1], [0, 0.1]], 8), s.tape]);                                                     // taped grip
  const rows = [[-0.3, -0.26, 0.26], [0.2, -0.27, 0.27]], pr = curve(0.3), Q = [];
  Q.push([shell(rows, pr, 0.01, { N: 14 }), s.carPaint]);
  Q.push([shell([[-0.3, -0.26, 0.26], [-0.22, -0.26, 0.26]], pr, 0.006, { N: 14, dx: 0.008 }), m.rubber]);                             // sill trim
  for (const [y, z, r] of [[0.05, 0.19, 0.045], [-0.2, -0.1, 0.06], [0.12, -0.22, 0.035]]) Q.push([at(new THREE.SphereGeometry(r, 8, 6).scale(0.12, 1, 1), 0.016 + pr(z), y, z), s.rust]);
  Q.push([at(new THREE.SphereGeometry(0.07, 8, 6).scale(0.1, 0.7, 1), 0.015 + pr(0.05), -0.12, 0.05), s.primer]);
  Q.push([box(0.012, 0.03, 0.11, 0.02 + pr(-0.16), 0.1, -0.16), m.steel]);                                                               // chrome handle
  Q.push([rod([0.005, 0.2, -0.27], [0.005, 0.45, -0.19], 0.014, 7), m.gunmetal], [rod([0.005, 0.2, 0.27], [0.005, 0.45, 0.19], 0.014, 7), m.gunmetal], [rod([0.005, 0.45, -0.19], [0.005, 0.45, 0.19], 0.014, 7), m.gunmetal]); // window frame
  Q.push([sweep([[0, -0.06, -0.08], [-0.03, -0.06, -0.06], [-0.035, -0.06, 0.06], [0, -0.06, 0.08]], [0.008, 0.008, 0.008, 0.008], 7), s.rust]); // rebar handle
  Q.push([box(0.006, 0.05, 0.2, -0.004, 0.08, 0), m.nylon]);
  return { parts: P, reach: 0.57, support: null, twoHanded: false, shield: { parts: Q, size: 0.75 } };
}

export const SWORD_SHIELDS = { heater, viking, kite, pavise, buckler, riot, ballistic, stopsign, energy, scrap };

// Data entries for data.js (spread into WEAPONS). `shield: true` marks the pair for block/parry.
// Only the silver pair is on the wall (Nutty, 2026-11-04); the other builders stay for later.
export const SWORD_SHIELD_DATA = [
  { id: 'viking', name: 'Silver Round Shield & Steel Sword', kind: 'melee', dmg: 62, rate: 0.55, range: 6.2, arc: 140, desc: 'A polished steel disc with a domed boss, and a bright all-steel blade with mirror edges.', shield: true },
];
