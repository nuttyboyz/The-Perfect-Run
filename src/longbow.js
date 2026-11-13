// Longbows: five hand-built bows for the Weapon Wall, the draw animation that bends their limbs and pulls the
// string, and the arrow they loose (a real projectile with gravity drop that sticks where it lands).
//
// Frames. A bow's weapon frame (W) follows weapons.js: the origin is where the right hand holds it, +Z points at the
// target, +Y is up. For a bow the right hand is the STRING hand: the nocked arrow's nock sits at the W origin and
// the arrow runs along +Z. The bow itself lives in a child group, the BODY (frame B: grip centre at the origin,
// +Y up the upper limb, +Z toward the target), placed `brace` metres ahead of the string hand and pushed further
// out as the bow is drawn (push-pull, like a real archer), so the left hand (userData.support = the grip) reaches
// forward and the arrow slides back along the bow. The string is a dynamic tube from limb tip to limb tip through
// the nock, the limbs are hinged segments that bend back with the draw.
//
// Variant builders return (see rigBow for how weapons.js mounts them):
//   { parts,                 static body parts [[geometry, material]...] in B
//     limbs: [{ parts, pivot: [x,y,z], parent: index|null, bend: rad }], hinged limb segments in B (parents first)
//     tips: [[x,y,z], [x,y,z]], tipSeg: [upperSegIndex, lowerSegIndex],   string attachment points in B
//     string: { r, mat, serving },  arrow: parts in W (nock at the origin, head toward +Z, ~0.72 m),
//     brace, drawLen, arrowY (arrow pass above the grip), cant, muzzle, support, cardTilt }
import { muOn, LOWGRAV } from './mutators.js';
import * as THREE from 'three';
import { grainTexture, mats, build, lathe, sweep, helix, slab, rod, cyl, at, BX, V3 } from './weapons.js';

// ---------- materials ----------
let BM = null;
function furTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = '#5a4330'; g.fillRect(0, 0, 128, 128);
  const cols = ['#2a1a10', '#4a3522', '#7a5c3e', '#9a7a58', '#3a2818', '#b09070'];
  for (let i = 0; i < 2600; i++) {
    g.strokeStyle = cols[i % cols.length]; g.globalAlpha = 0.25 + Math.random() * 0.5; g.lineWidth = 0.6 + Math.random();
    const x = Math.random() * 128, y = Math.random() * 128, a = -0.5 + Math.random() * 0.4, l = 5 + Math.random() * 11;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l + 2); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function featherTexture(base, bar) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, 64, 128);
  g.fillStyle = bar;
  for (let y = 6; y < 128; y += 15) { g.globalAlpha = 0.75; g.beginPath(); g.moveTo(0, y); g.lineTo(64, y + 5); g.lineTo(64, y + 11); g.lineTo(0, y + 6); g.fill(); }
  g.globalAlpha = 0.35; g.strokeStyle = '#000'; g.lineWidth = 0.5;
  for (let y = 0; y < 128; y += 3) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y + 4); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function bowMats() {
  if (BM) return BM;
  const m = mats(), tex = (a, b, n, w = 256, h = 256) => grainTexture(a, b, n, w, h);
  const std = (o) => new THREE.MeshStandardMaterial(o), phys = (o) => new THREE.MeshPhysicalMaterial(o);
  BM = {
    yewBack: std({ map: tex('#dcc08a', '#a8824c', 80), roughness: 0.52 }), // pale sapwood on the back
    yewBelly: std({ map: tex('#a9733c', '#5a3312', 110), roughness: 0.5 }), // orange heartwood belly
    horn: phys({ color: 0x241c16, roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.25 }),
    hornPale: phys({ color: 0x9d8a66, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    linen: std({ color: 0xe6dcc4, roughness: 0.9 }),
    waxed: std({ color: 0x4a3a2a, roughness: 0.6 }),
    sinew: std({ color: 0xb9a07c, roughness: 0.95 }),
    maple: std({ map: tex('#d9bd8e', '#a98657', 50), roughness: 0.45 }),
    glass: phys({ color: 0x2f4028, roughness: 0.2, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.1 }), // dark olive fibreglass
    glassBlack: phys({ color: 0x0d0e10, roughness: 0.22, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.12 }),
    ironwood: std({ map: tex('#2c1d13', '#0a0604', 120), roughness: 0.48 }),
    ironwoodBelly: std({ map: tex('#3a2619', '#0c0705', 120), roughness: 0.46 }),
    ash: std({ map: tex('#d9c5a0', '#9a7f58', 45), roughness: 0.5 }),
    inlay: std({ color: 0x0b3330, emissive: 0x2ef0cf, emissiveIntensity: 2.4, roughness: 0.3 }),
    glowString: std({ color: 0xd8f4ee, emissive: 0x3ad8c0, emissiveIntensity: 0.55, roughness: 0.7 }),
    rough: std({ map: tex('#8f6b43', '#3b2411', 150), roughness: 0.85 }),
    bark: std({ map: tex('#4a3828', '#1c120a', 200, 128, 128), roughness: 1 }),
    fur: std({ map: furTexture(), roughness: 1 }),
    bone: std({ color: 0xe6dfcc, roughness: 0.6 }),
    flint: std({ color: 0x3a3e44, roughness: 0.45, metalness: 0.1 }),
    cedar: std({ map: tex('#c9a070', '#8a6238', 60, 256, 64), roughness: 0.6 }),
    birch: std({ map: tex('#e8d9b8', '#c0a880', 30, 256, 64), roughness: 0.55 }),
    ebony: std({ color: 0x2b2634, roughness: 0.35 }),
    fWhite: std({ color: 0xf1ece0, roughness: 0.9, side: THREE.DoubleSide }),
    fGrey: std({ map: featherTexture('#cfc8b8', '#6a6258'), roughness: 0.9, side: THREE.DoubleSide }),
    fBarred: std({ map: featherTexture('#d9c9a8', '#3a2a1a'), roughness: 0.95, side: THREE.DoubleSide }),
    fRed: std({ color: 0xb8352a, roughness: 0.9, side: THREE.DoubleSide }),
    fTeal: std({ color: 0x9ff0e4, emissive: 0x1fa892, emissiveIntensity: 0.6, roughness: 0.8, side: THREE.DoubleSide }),
    silver: m.steel, brass: m.brass, leather: m.leather, cord: m.cord, iron: m.iron, steelDark: m.steelDark,
  };
  return BM;
}

// ---------- limb loft ----------
// Section rings as [u, v, tag]: u across the width (-0.5..0.5 of w), v along the back normal (-0.5..0.5 of t); the
// tag names the material bucket of the segment that starts at this point.
function sectionRing(shape) {
  const r = [];
  if (shape === 'D') { // flat back, round belly: the classic longbow stave
    for (let i = 0; i <= 4; i++) r.push([0.5 - i / 4, 0.5, 'back']);
    for (let i = 1; i < 10; i++) { const th = Math.PI + (i / 10) * Math.PI; r.push([0.5 * Math.cos(th), 0.5 + Math.sin(th), 'belly']); }
    r[4][2] = 'belly';
  } else if (shape === 'flat') { // laminated limb: flat faces, rounded edges
    const c = 0.12;
    r.push([0.5 - c, 0.5, 'back'], [0.17, 0.5, 'back'], [-0.17, 0.5, 'back'], [-(0.5 - c), 0.5, 'side']);
    r.push([-0.5, 0.5 - c, 'side'], [-0.5, 0, 'side'], [-0.5, -(0.5 - c), 'side'], [-(0.5 - c), -0.5, 'belly']);
    r.push([-0.17, -0.5, 'belly'], [0.17, -0.5, 'belly'], [0.5 - c, -0.5, 'side'], [0.5, -(0.5 - c), 'side'], [0.5, 0, 'side'], [0.5, 0.5 - c, 'side']);
  } else { // oval
    for (let i = 0; i < 16; i++) { const th = (i / 16) * Math.PI * 2; r.push([0.5 * Math.sin(th), 0.5 * Math.cos(th), Math.cos(th) > 0.2 ? 'back' : Math.cos(th) < -0.2 ? 'belly' : 'side']); }
  }
  return r;
}
// Loft `st` = [[y, z, w, t], ...] stations along the limb's centreline (x = 0) into one indexed, smooth geometry
// per material tag. nOff pushes the whole section along the back normal (inlays sitting on a face).
export function limbLoft(st, shape = 'D', nOff = 0, uRep = 0) {
  const ring = sectionRing(shape), K = ring.length, N = st.length, fr = [];
  let len = 0;
  for (let i = 0; i < N; i++) {
    const a = st[Math.max(0, i - 1)], b = st[Math.min(N - 1, i + 1)];
    let ty = b[0] - a[0], tz = b[1] - a[1]; const L = Math.hypot(ty, tz) || 1; ty /= L; tz /= L;
    let ny = -tz, nz = ty; if (nz < 0) { ny = -ny; nz = -nz; } // the back normal points toward +z (the target)
    if (i) len += Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]);
    fr.push({ y: st[i][0], z: st[i][1], ny, nz, w: st[i][2], t: st[i][3], s: len });
  }
  const rep = uRep || Math.max(1, Math.round(len / 0.22));
  const bk = {};
  const vert = (tag, i, k) => {
    const B = bk[tag] || (bk[tag] = { pos: [], uv: [], idx: [], map: new Map() }), key = i * K + k;
    if (B.map.has(key)) return B.map.get(key);
    const f = fr[i], [u, v] = ring[k], d = v * f.t + nOff;
    B.pos.push(u * f.w, f.y + f.ny * d, f.z + f.nz * d); B.uv.push((f.s / len) * rep, k / K);
    const id = B.pos.length / 3 - 1; B.map.set(key, id); return id;
  };
  for (let i = 0; i < N - 1; i++) for (let k = 0; k < K; k++) {
    const tag = ring[k][2], k2 = (k + 1) % K;
    const A = vert(tag, i, k), Bv = vert(tag, i, k2), C = vert(tag, i + 1, k2), D = vert(tag, i + 1, k);
    bk[tag].idx.push(A, D, C, A, C, Bv);
  }
  const out = {};
  for (const t in bk) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(bk[t].pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(bk[t].uv, 2)); g.setIndex(bk[t].idx); g.computeVertexNormals(); out[t] = g; }
  return out;
}
const lofted = (st, shape, mm, nOff = 0) => Object.entries(limbLoft(st, shape, nOff)).map(([t, g]) => [g, mm[t] || mm.back]);
// Stations from the handle end y0 out to the tip L (sign ±1 for the upper/lower limb). zf/wf/tf take s = 0..1.
function stations(sign, y0, L, n, zf, wf, tf) {
  const out = [];
  for (let i = 0; i <= n; i++) { const s = i / n, y = y0 + (L - y0) * s; out.push([sign * y, zf(s, y), wf(s), tf(s)]); }
  return out;
}
// Split a limb's stations at index m into a hinged inner and outer segment; returns limb descriptors for rigBow.
function hinge(sign, st, m, shape, mm, bend = [0.11, 0.19], nOff = 0) {
  const inner = st.slice(0, m + 1), outer = st.slice(m);
  return [
    { parts: lofted(inner, shape, mm, nOff), pivot: [0, st[0][0], st[0][1]], parent: null, bend: bend[0], sign },
    { parts: lofted(outer, shape, mm, nOff), pivot: [0, st[m][0], st[m][1]], parent: 'prev', bend: bend[1], sign },
  ];
}
// A turned cap (nock, ferrule, tip overlay) with its axis along `dir`, its base at `pos`. prof: [[r, z], ...].
function capAt(prof, pos, dir, mat, seg = 10) {
  const g = lathe(prof, seg), d = V3(...dir).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), d));
  g.translate(pos[0], pos[1], pos[2]);
  return [g, mat];
}
const tipDir = (st) => { const a = st[st.length - 2], b = st[st.length - 1]; return [0, b[0] - a[0], b[1] - a[1]]; };
const tipOf = (st) => { const b = st[st.length - 1]; return [0, b[0], b[1]]; };
// A turned part along the handle axis (y): lathe about z, then z -> y.
const alongY = (g) => g.rotateX(-Math.PI / 2);
const ringY = (r, h, y, mat, seg = 16) => [alongY(lathe([[0, -h / 2], [r, -h / 2], [r, h / 2], [0, h / 2]], seg)).translate(0, y, 0), mat];
// Grip wrap round the handle axis (y) between y0 and y1 at radius r.
const wrapY = (y0, y1, r, turns, tr, mat) => [alongY(helix(y0, y1, () => r, turns, tr)), mat];
// Three fletchings round the shaft: cock feather up, the others at ±120°.
function fletch(z0, z1, h, mats3, r = 0.0045) {
  const out = [];
  [0, 2.094, -2.094].forEach((ang, i) => {
    const g = slab([[z0, 0], [z1, 0], [z1 - 0.012, h * 0.3], [z0 + 0.03, h], [z0 + 0.006, h * 0.72]], 0.0012, 0);
    g.translate(0, r * 0.95, 0); g.rotateZ(ang);
    out.push([g, mats3[Math.min(i, mats3.length - 1)]]);
  });
  return out;
}
const SHAFT_R = 0.0045, ARROW_L = 0.72;
function shaft(mat, r = SHAFT_R, z0 = 0.012, z1 = 0.685) { return [at(cyl(r, r, z1 - z0, 10), 0, 0, (z0 + z1) / 2), mat]; }
const nockPiece = (mat) => [lathe([[0, 0], [0.0052, 0], [0.0058, 0.008], [0.0046, 0.018], [0.0046, 0.024], [0, 0.024]], 10), mat];
const torusZ = (r, tr, z, mat) => [at(new THREE.TorusGeometry(r, tr, 6, 14), 0, 0, z), mat];
const bodkin = (mat, z = 0.68, L = 0.06) => [capAt([[0, 0], [0.0062, 0], [0.0062, 0.012], [0.0048, 0.02], [0, L]], [0, 0, z], [0, 0, 1], mat, 4)];
const fieldPoint = (mat, z = 0.68) => [capAt([[0, 0], [0.0052, 0], [0.0052, 0.016], [0.004, 0.03], [0, 0.044]], [0, 0, z], [0, 0, 1], mat, 10)];
// Two-blade broadhead standing vertical: a thin steel plate on a short ferrule.
const broadhead = (mat, z = 0.675) => [
  capAt([[0, 0], [0.0054, 0], [0.0054, 0.02], [0.003, 0.03], [0, 0.034]], [0, 0, z], [0, 0, 1], mat, 10),
  [slab([[z + 0.012, 0.0], [z + 0.018, 0.016], [z + 0.07, 0.0], [z + 0.018, -0.016]], 0.0016, 0.0004), mat],
];
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

// ---------- the five bows ----------
// drawLen is how far the bow is pushed out from the string hand at full draw: shorter than a real 0.6 m draw so the
// rig's bow arm (which starts from the gun pose, close to the chest) can still reach the grip.
const COMMON = { brace: 0.17, drawLen: 0.32, arrowY: 0.04, cant: 0.07, muzzle: [0, 0, 0.745], cardTilt: [-1.3, 0, -1.25] };
const sup = (c) => [0, -c.arrowY, c.brace];

// 1. English yew longbow: a plain D-section stave, pale sapwood back and heartwood belly, horn nocks, a linen string
// with a little cord wrap at the handle.
function bow1() {
  const B = bowMats(), mm = { back: B.yewBack, belly: B.yewBelly, side: B.yewBack };
  const L = 0.86, y0 = 0.085, zf = (s) => -0.17 * Math.pow(s, 1.5), wf = (s) => 0.033 - 0.02 * Math.pow(s, 0.9), tf = (s) => 0.03 - 0.018 * Math.pow(s, 0.9);
  const up = stations(1, y0, L, 14, zf, wf, tf), lo = stations(-1, y0, L, 14, zf, wf, tf);
  const handle = []; for (let i = 0; i <= 8; i++) { const y = -y0 + (2 * y0) * i / 8; handle.push([y, 0, 0.034 + 0.003 * Math.cos(y / y0 * 1.5), 0.031 + 0.003 * Math.cos(y / y0 * 1.5)]); }
  const parts = [...lofted(handle, 'D', mm), wrapY(-0.055, 0.055, 0.0205, 9, 0.0028, B.cord)];
  const limbs = [...hinge(1, up, 7, 'D', mm, [0.13, 0.22]), ...hinge(-1, lo, 7, 'D', mm, [0.13, 0.22])];
  for (const [st, seg] of [[up, limbs[1]], [lo, limbs[3]]]) seg.parts.push(capAt([[0.012, 0], [0.0135, 0.012], [0.01, 0.028], [0.0045, 0.04], [0, 0.044]], tipOf(st), tipDir(st), B.horn));
  const tipPt = (st) => { const d = V3(...tipDir(st)).normalize().multiplyScalar(0.018), t = tipOf(st); return [t[0], t[1] + d.y, t[2] + d.z]; };
  const arrow = [nockPiece(B.horn), shaft(B.cedar), ...fletch(0.035, 0.125, 0.017, [B.fGrey, B.fWhite, B.fWhite]), ...bodkin(B.steelDark)];
  return { ...COMMON, parts, limbs, tips: [tipPt(up), tipPt(lo)], tipSeg: [1, 3], string: { r: 0.0018, mat: B.linen, serving: 1.5 }, arrow, support: sup(COMMON) };
}

// 2. Recurve-tipped laminated bow: a sculpted maple riser with a dark laminate stripe and an arrow shelf, flat
// limbs faced in dark olive fibreglass over a maple core, tips that hook forward, with horn overlays.
function bow2() {
  const B = bowMats(), mm = { back: B.glass, belly: B.glass, side: B.maple };
  const L = 0.8, y0 = 0.19, zf = (s) => -0.19 * Math.pow(s, 1.35) + 0.12 * Math.pow(Math.max(0, (s - 0.7) / 0.3), 2.2), wf = (s) => 0.04 - 0.022 * s, tf = (s) => 0.0115 - 0.0045 * s;
  const up = stations(1, y0, L, 16, zf, wf, tf), lo = stations(-1, y0, L, 16, zf, wf, tf);
  const riser = [[0.0, -0.19], [0.028, -0.19], [0.046, -0.1], [0.046, -0.03], [0.05, 0.02], [0.072, 0.03], [0.072, 0.052], [0.05, 0.062], [0.04, 0.1], [0.04, 0.19], [0.0, 0.19], [-0.018, 0.12], [-0.028, 0.0], [-0.018, -0.12]];
  const parts = [
    [slab(riser, 0.038, 0.004), B.maple],
    [slab(riser.map(([z, y]) => [z * 1.04 - 0.0012, y * 1.012]), 0.011, 0.001), B.ironwood], // the dark lamination through the middle, proud of the maple
    [BX(0.014, 0.004, 0.028, 0.019, 0.055, 0.03), B.leather], // arrow shelf (the arrow passes on the +x side)
    [BX(0.03, 0.03, 0.03, 0, 0.19, -0.004), B.glassBlack], [BX(0.03, 0.03, 0.03, 0, -0.19, -0.004), B.glassBlack], // limb bolts' pockets
  ];
  const limbs = [...hinge(1, up, 8, 'flat', mm, [0.1, 0.17]), ...hinge(-1, lo, 8, 'flat', mm, [0.1, 0.17])];
  for (const [st, seg] of [[up, limbs[1]], [lo, limbs[3]]]) seg.parts.push(capAt([[0.009, -0.03], [0.012, 0.0], [0.01, 0.022], [0.0045, 0.032], [0, 0.034]], tipOf(st), tipDir(st), B.hornPale));
  const tipPt = (st) => { const d = V3(...tipDir(st)).normalize().multiplyScalar(0.012), t = tipOf(st); return [t[0], t[1] + d.y, t[2] + d.z]; };
  const C = { ...COMMON, brace: 0.19, cant: 0.04 };
  const arrow = [nockPiece(B.glassBlack), shaft(B.birch), ...fletch(0.035, 0.12, 0.016, [B.fRed, B.fWhite, B.fWhite]), ...fieldPoint(B.silver)];
  return { ...C, parts, limbs, tips: [tipPt(up), tipPt(lo)], tipSeg: [1, 3], string: { r: 0.0016, mat: B.linen, serving: 1.6 }, arrow, support: sup(C) };
}

// 3. Dark ironwood warbow: a heavy D-section stave, almost black, leather-wrapped grip between brass bands, brass
// tip caps, a dark waxed string.
function bow3() {
  const B = bowMats(), mm = { back: B.ironwood, belly: B.ironwoodBelly, side: B.ironwood };
  const L = 0.95, y0 = 0.1, zf = (s) => -0.17 * Math.pow(s, 1.45), wf = (s) => 0.042 - 0.026 * Math.pow(s, 0.95), tf = (s) => 0.038 - 0.024 * Math.pow(s, 0.95);
  const up = stations(1, y0, L, 15, zf, wf, tf), lo = stations(-1, y0, L, 15, zf, wf, tf);
  const handle = []; for (let i = 0; i <= 8; i++) { const y = -y0 + (2 * y0) * i / 8; handle.push([y, 0, 0.04, 0.036]); }
  const parts = [
    ...lofted(handle, 'oval', mm),
    [alongY(lathe([[0, -0.072], [0.0235, -0.072], [0.0235, 0.072], [0, 0.072]], 16)), B.leather], // leather core
    wrapY(-0.07, 0.07, 0.0235, 11, 0.0034, B.leather),
    ringY(0.025, 0.012, 0.082, B.brass), ringY(0.025, 0.012, -0.082, B.brass), // brass bands
    ringY(0.0245, 0.005, 0.0, B.brass),
  ];
  const limbs = [...hinge(1, up, 7, 'D', mm, [0.1, 0.17]), ...hinge(-1, lo, 7, 'D', mm, [0.1, 0.17])];
  for (const [st, seg] of [[up, limbs[1]], [lo, limbs[3]]]) seg.parts.push(capAt([[0.0105, -0.01], [0.011, 0.0], [0.0095, 0.018], [0.006, 0.03], [0, 0.034]], tipOf(st), tipDir(st), B.brass, 12));
  const tipPt = (st) => { const d = V3(...tipDir(st)).normalize().multiplyScalar(0.016), t = tipOf(st); return [t[0], t[1] + d.y, t[2] + d.z]; };
  const C = { ...COMMON, drawLen: 0.34, arrowY: 0.05, cant: 0.09 };
  const arrow = [[lathe([[0, 0], [0.0056, 0], [0.0056, 0.006], [0, 0.006]], 10), B.brass], nockPiece(B.horn), shaft(B.ironwoodBelly, 0.0052), ...fletch(0.035, 0.135, 0.019, [B.fGrey, B.fGrey, B.fGrey], 0.0052), ...bodkin(B.iron, 0.68, 0.07)];
  return { ...C, parts, limbs, tips: [tipPt(up), tipPt(lo)], tipSeg: [1, 3], string: { r: 0.0021, mat: B.waxed, serving: 1.5 }, arrow, support: sup(C) };
}

// 4. Carved elvish bow: a slender pale ash bow with recurved tips, silver bands and leaf-curled tips, a glowing
// inlay set into the back of each limb and a spiral of it round the grip, a faintly luminous string.
function bow4() {
  const B = bowMats(), mm = { back: B.ash, belly: B.ash, side: B.ash }, GL = { back: B.inlay, belly: B.inlay, side: B.inlay };
  const L = 0.84, y0 = 0.12, zf = (s) => -0.18 * Math.pow(s, 1.3) + 0.08 * Math.pow(Math.max(0, (s - 0.74) / 0.26), 2.2), wf = (s) => 0.028 - 0.017 * s, tf = (s) => 0.019 - 0.011 * s;
  const up = stations(1, y0, L, 16, zf, wf, tf), lo = stations(-1, y0, L, 16, zf, wf, tf);
  const handle = []; for (let i = 0; i <= 8; i++) { const y = -y0 + (2 * y0) * i / 8; handle.push([y, 0, 0.03 - 0.004 * Math.abs(y / y0), 0.024 - 0.003 * Math.abs(y / y0)]); }
  const parts = [...lofted(handle, 'oval', mm), wrapY(-0.1, 0.1, 0.0128, 3, 0.0016, B.inlay), ringY(0.016, 0.008, 0.115, B.silver), ringY(0.016, 0.008, -0.115, B.silver)];
  // Leaf curls at the tips: a silver tendril sweeping forward and back (added to the outer limb segments below).
  const tipWork = (st) => {
    const t = tipOf(st), s = Math.sign(t[1]);
    return [capAt([[0.007, -0.012], [0.0075, 0.0], [0.006, 0.018], [0.003, 0.028], [0, 0.03]], t, tipDir(st), B.silver, 12),
      [sweep([[0, t[1] + s * 0.02, t[2]], [0, t[1] + s * 0.05, t[2] + 0.025], [0, t[1] + s * 0.06, t[2] + 0.06], [0, t[1] + s * 0.035, t[2] + 0.075]], [0.0035, 0.003, 0.002, 0.0012], 7), B.silver],
      [at(new THREE.TorusGeometry(0.011, 0.0018, 6, 16).rotateX(Math.PI / 2), 0, t[1] - s * 0.05, zf(0.93)), B.silver]];
  };
  // Glowing inlay: a thin strip let into the back of each limb, short of the tips.
  const inlayOf = (st) => { const s2 = st.slice(0, st.length - 3).map(([y, z, w, t]) => [y, z, Math.min(0.0095, w * 0.42), 0.0032]); const off = (st[0][3]) / 2; return { s2, off }; };
  const limbs = [];
  for (const [sign, st] of [[1, up], [-1, lo]]) {
    const h = hinge(sign, st, 8, 'oval', mm, [0.1, 0.18]);
    const il = inlayOf(st), in1 = il.s2.slice(0, 9), in2 = il.s2.slice(8);
    h[0].parts.push(...lofted(in1, 'flat', GL, (st[0][3] * 0.5 + st[8][3] * 0.5) / 2 - 0.0005));
    h[1].parts.push(...lofted(in2, 'flat', GL, (st[8][3] * 0.5 + st[st.length - 4][3] * 0.5) / 2 - 0.0005));
    h[1].parts.push(...tipWork(st));
    limbs.push(...h);
  }
  const tipPt = (st) => { const d = V3(...tipDir(st)).normalize().multiplyScalar(0.01), t = tipOf(st); return [t[0], t[1] + d.y, t[2] + d.z]; };
  const C = { ...COMMON, brace: 0.18, cant: 0.06 };
  const arrow = [nockPiece(B.silver), shaft(B.ebony), torusZ(0.0052, 0.0012, 0.14, B.silver), torusZ(0.0052, 0.0012, 0.4, B.silver), ...fletch(0.03, 0.125, 0.018, [B.fTeal, B.fTeal, B.fTeal]), ...broadhead(B.silver)];
  return { ...C, parts, limbs, tips: [tipPt(up), tipPt(lo)], tipSeg: [1, 3], string: { r: 0.0015, mat: B.glowString, serving: 1.5 }, arrow, support: sup(C) };
}

// 5. Rough-hewn hunter's bow: a knotty stave with bark left on the belly in places, a fur-wrapped grip tied with sinew,
// whittled nocks bound with cord, a sinew string and heavy feathered arrows with lashed flint heads.
function bow5() {
  const B = bowMats(), mm = { back: B.rough, belly: B.rough, side: B.rough }, R = rng(7);
  const L = 0.78, y0 = 0.09;
  const zf = (s, y) => -0.16 * Math.pow(s, 1.5) + 0.008 * Math.sin(y * 9 + 1), wf = (s) => (0.036 - 0.02 * s) * (1 + 0.1 * Math.sin(s * 11 + 2)), tf = (s) => (0.03 - 0.017 * s) * (1 + 0.1 * Math.cos(s * 13));
  const up = stations(1, y0, L, 16, zf, wf, tf), lo = stations(-1, y0, L, 16, (s, y) => zf(s, -y) + 0.005, (s) => wf(s) * 1.04, tf);
  const handle = []; for (let i = 0; i <= 8; i++) { const y = -y0 + (2 * y0) * i / 8; handle.push([y, 0, 0.036, 0.03]); }
  const parts = [...lofted(handle, 'D', mm), [alongY(lathe([[0, -0.075], [0.027, -0.075], [0.03, -0.03], [0.03, 0.03], [0.027, 0.075], [0, 0.075]], 14)), B.fur]];
  for (let i = 0; i < 30; i++) { // tufts standing out of the fur
    const a = R() * Math.PI * 2, y = -0.07 + R() * 0.14, r = 0.029 + 0.001 * R(), g = new THREE.ConeGeometry(0.003, 0.011 + R() * 0.008, 5);
    g.translate(0, 0.008, 0); g.rotateZ(-0.6 + R() * 0.5); g.rotateX(R() * 0.6 - 0.3);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), V3(Math.cos(a), 0, Math.sin(a))));
    g.translate(Math.cos(a) * r, y, Math.sin(a) * r); parts.push([g, B.fur]);
  }
  parts.push(wrapY(-0.08, -0.065, 0.028, 3, 0.0022, B.sinew), wrapY(0.065, 0.08, 0.028, 3, 0.0022, B.sinew));
  const limbs = [];
  for (const [sign, st] of [[1, up], [-1, lo]]) {
    const h = hinge(sign, st, 8, 'D', mm, [0.12, 0.2]);
    // bark left on the belly here and there, and a knot or two
    const bark = (a, b, seg) => { const s2 = st.slice(a, b).map(([y, z, w, t]) => [y, z, w * 0.36, 0.004]); h[seg].parts.push(...lofted(s2, 'flat', { back: B.bark, belly: B.bark, side: B.bark }, -(st[a][3] + st[b - 1][3]) / 4 + 0.001)); };
    if (sign > 0) { bark(2, 6, 0); bark(10, 14, 1); } else { bark(4, 8, 0); bark(9, 12, 1); }
    for (const [i, seg] of [[3, 0], [11, 1]]) { const s = st[i]; h[seg].parts.push([new THREE.SphereGeometry(0.0075, 8, 6).scale(1, 1.3, 0.7).translate(sign > 0 ? 0.008 : -0.009, s[0], s[1] + s[3] * 0.45), B.bark]); }
    // whittled nock: the tip tapers and a cord binding below it
    const t = tipOf(st), d = V3(...tipDir(st)).normalize();
    h[1].parts.push(capAt([[0.0075, -0.03], [0.0068, 0.0], [0.004, 0.02], [0, 0.03]], t, tipDir(st), B.rough, 8));
    h[1].parts.push([helix(-0.028, -0.014, () => 0.0082, 4, 0.0014).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), d)).translate(t[0], t[1], t[2]), B.sinew]);
    limbs.push(...h);
  }
  const tipPt = (st) => { const d = V3(...tipDir(st)).normalize().multiplyScalar(0.012), t = tipOf(st); return [t[0], t[1] + d.y, t[2] + d.z]; };
  const C = { ...COMMON, brace: 0.16, drawLen: 0.3, cant: 0.1 };
  const arrow = [nockPiece(B.bone), shaft(B.rough, 0.005), torusZ(0.0058, 0.0014, 0.03, B.sinew), torusZ(0.0058, 0.0014, 0.14, B.sinew), ...fletch(0.035, 0.145, 0.024, [B.fBarred, B.fBarred, B.fBarred], 0.005),
    [slab([[0.66, 0], [0.675, 0.012], [0.70, 0.017], [0.725, 0.009], [0.75, 0.0], [0.725, -0.01], [0.70, -0.018], [0.675, -0.012]], 0.0055, 0.0015), B.flint],
    torusZ(0.0062, 0.0015, 0.655, B.sinew), torusZ(0.0062, 0.0015, 0.661, B.sinew), torusZ(0.0062, 0.0015, 0.667, B.sinew)];
  return { ...C, parts, limbs, tips: [tipPt(up), tipPt(lo)], tipSeg: [1, 3], string: { r: 0.002, mat: B.sinew, serving: 1.4 }, arrow, support: sup(C) };
}

export const LONGBOW_VARIANTS = { bow1, bow2, bow3, bow4, bow5 };
// Which variant 'longbow' uses. The owner picks; setLongbowVariant changes it for weapons made from then on.
let PICK = 'bow5'; // Nutty's pick (2026-11-04): the hunter's bow
export const longbowPick = () => PICK;
export function setLongbowVariant(id) { if (LONGBOW_VARIANTS[id]) PICK = id; }
export const LONGBOW_IDS = Object.keys(LONGBOW_VARIANTS);

// ---------- rigging: string, limbs, arrow and the draw hook ----------
// A tube along a polyline whose points move: the bowstring (tip -> nock -> tip, thicker at the serving).
function stringMesh({ r, mat, serving = 1.5 }) {
  const S = 6, P = 5, pos = new Float32Array(P * S * 3), nor = new Float32Array(P * S * 3), idx = [];
  for (let k = 0; k < P - 1; k++) for (let j = 0; j < S; j++) { const a = k * S + j, b = k * S + (j + 1) % S, c = (k + 1) * S + j, d = (k + 1) * S + (j + 1) % S; idx.push(a, c, b, b, c, d); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(P * S * 2), 2)); geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.castShadow = true;
  const T = new THREE.Vector3(), Nn = new THREE.Vector3(), Bb = new THREE.Vector3(), tmp = new THREE.Vector3(), pts = [0, 1, 2, 3, 4].map(() => new THREE.Vector3());
  const radii = [r, r, r * serving, r, r];
  mesh.userData.set = (tipU, nock, tipL) => {
    pts[0].copy(tipU); pts[4].copy(tipL); pts[2].copy(nock);
    pts[1].lerpVectors(tipU, nock, 0.9); pts[3].lerpVectors(tipL, nock, 0.9);
    for (let k = 0; k < P; k++) {
      T.subVectors(pts[Math.min(k + 1, P - 1)], pts[Math.max(k - 1, 0)]).normalize();
      Nn.set(1, 0, 0).addScaledVector(T, -T.x).normalize(); Bb.crossVectors(T, Nn);
      for (let j = 0; j < S; j++) {
        const ph = (j / S) * Math.PI * 2, c = Math.cos(ph), s = Math.sin(ph), o = (k * S + j) * 3;
        tmp.set(Nn.x * c + Bb.x * s, Nn.y * c + Bb.y * s, Nn.z * c + Bb.z * s);
        nor[o] = tmp.x; nor[o + 1] = tmp.y; nor[o + 2] = tmp.z;
        pos[o] = pts[k].x + tmp.x * radii[k]; pos[o + 1] = pts[k].y + tmp.y * radii[k]; pos[o + 2] = pts[k].z + tmp.z * radii[k];
      }
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.normal.needsUpdate = true;
  };
  return mesh;
}

// Mount a bow built by a LONGBOW_VARIANTS builder on `g` (the group makeWeapon built from d.parts) and return the
// userData extras: ammo (the arrow group, hidden while no arrow is nocked), bowDraw(a, dt, loaded) (the per-frame
// draw hook animateWeapon calls with `spin` = draw amount 0..1), bow: true, bowStyle, and bowTips/bowBody for anyone
// who wants to read the pose. bowDraw also moves userData.support (the grip) so the rig's left hand follows the bow out.
export function rigBow(g, d, id = PICK) {
  const body = new THREE.Group();
  while (g.children.length) body.add(g.children[0]);
  g.add(body);
  body.position.set(-0.02, -d.arrowY, d.brace); body.rotation.z = d.cant;
  const segs = [];
  for (const l of d.limbs) {
    const p = l.pivot, grp = build(l.parts.map(([geo, m]) => [geo.translate(-p[0], -p[1], -p[2]), m]));
    const parent = l.parent === 'prev' ? segs[segs.length - 1] : l.parent != null ? segs[l.parent] : null;
    if (parent) { const pp = parent.userData.pivot; grp.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]); } else grp.position.set(p[0], p[1], p[2]);
    grp.userData.pivot = p; grp.userData.bend = l.bend; grp.userData.sign = l.sign; grp.userData.parent = parent;
    (parent || body).add(grp); segs.push(grp);
  }
  const str = stringMesh(d.string); g.add(str);
  const am = build(d.arrow); g.add(am);
  const tipsLocal = d.tips.map((t, i) => { const p = segs[d.tipSeg[i]].userData.pivot; return V3(t[0] - p[0], t[1] - p[1], t[2] - p[2]); });
  const tipsW = [V3(0, 0, 0), V3(0, 0, 0)], nock = V3(0, 0, 0), M = new THREE.Matrix4();
  let cur = -1;
  const bowDraw = (a = 0, dt = 0, loaded = true) => {
    a = Math.max(0, Math.min(1, a || 0));
    if (a === cur) return;
    cur = a;
    body.position.z = d.brace + d.drawLen * a;
    body.rotation.z = d.cant * (1 - 0.35 * a);
    body.updateMatrix();
    for (const s of segs) { s.rotation.x = -s.userData.sign * s.userData.bend * a; s.updateMatrix(); }
    for (let i = 0; i < 2; i++) {
      const chain = []; for (let s = segs[d.tipSeg[i]]; s; s = s.userData.parent) chain.unshift(s);
      M.copy(body.matrix); for (const s of chain) M.multiply(s.matrix);
      tipsW[i].copy(tipsLocal[i]).applyMatrix4(M);
    }
    str.userData.set(tipsW[0], nock, tipsW[1]);
    if (g.userData && g.userData.support) g.userData.support.copy(body.position);
  };
  bowDraw(0);
  return { ammo: am, bowDraw, bow: true, bowStyle: LONGBOW_VARIANTS[id] ? id : PICK, bowTips: tipsW, bowBody: body, bowString: str };
}

// ---------- the arrow in flight ----------
const PROTO = {};
function arrowProto(style) {
  if (PROTO[style]) return PROTO[style];
  const d = (LONGBOW_VARIANTS[style] || LONGBOW_VARIANTS[PICK])();
  const grp = build(d.arrow.map(([geo, m]) => [geo.translate(0, 0, -ARROW_L - 0.02), m])); // head at the origin, flying +z
  grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return (PROTO[style] = grp);
}
// Loose an arrow from `o` along `d` (world, arrays). It flies under gravity, is checked against enemies, the ground,
// props and duel walls every frame, pierces `pierce` enemies (the shooter's own hits only, like every weapon), and
// sticks where it lands for a while. Returns the effect so a test can watch it.
// `proto` (optional) is the mesh to fly instead of a bow's arrow, head at the origin pointing +z (the crossbow's bolt).
// An arrow that ends in an enemy who is still standing stays stuck in them (stickInto), riding the nearest bone.
export function launchArrow(g, o, d, { speed = 60, dmg = 0, pierce = 1, style = 'bow1', mine = false, range = 120, head = 1.5, proto = null, wf = 0, fire = !!wf } = {}) { // fire: the arrow itself burns (Flaming Weapons)
  const mesh = (proto || arrowProto(style)).clone();
  mesh.scale.setScalar(1.2); // a touch bigger in flight so the eye can follow it
  const pos = new THREE.Vector3(...o), vel = new THREE.Vector3(...d).normalize().multiplyScalar(speed), last = pos.clone(), dir = new THREE.Vector3();
  const Z = new THREE.Vector3(0, 0, 1), w = g.world, hitIds = new Set();
  mesh.position.copy(pos); mesh.quaternion.setFromUnitVectors(Z, vel.clone().normalize());
  g.fx.scene.add(mesh);
  const st = { pos, vel, stuck: false, hits: 0, traveled: 0, age: 0, spin: 0, dmg };
  const audio = g.audio;
  const thunk = (p, k) => { if (!audio || !audio.ctx || !audio.sfxOn) return; const v = g.distVol ? g.distVol(p.x, p.z) : 1; audio.noiseHit({ dur: 0.07, freq: 700 * k, type: 'bandpass', q: 2.5, gain: 0.16 * v }); audio.tone({ freq: 160 * k, to: 60, dur: 0.1, type: 'triangle', gain: 0.08 * v }); };
  const stick = (p, why) => { st.stuck = true; st.stuckAt = st.age; st.reason = why; pos.copy(p); mesh.position.copy(pos); mesh.quaternion.setFromUnitVectors(Z, dir.copy(vel).normalize()); mesh.rotateZ(st.spin); mesh.position.addScaledVector(dir, 0.06); thunk(p, 1); };
  const touch = (p) => w.solidPoint(p.x, p.y, p.z);
  const eff = g.fx.add({
    dur: 30, arrow: st,
    update: (dt) => {
      st.age += dt;
      if (fire && g.fx.fire && (!st.stuck || st.age - (st.stuckAt || 0) < 2.5)) { // a burning arrow: flame streams off the head in flight and it burns on where it lands
        const R = (p, q) => p + Math.random() * (q - p), k = st.stuck ? 1 : 2;
        for (let i = 0; i < g.fx.n(k + 1); i++) { const b = pos.clone().addScaledVector(dir, st.stuck ? 0 : -i * 0.35);
          g.fx.fire.emit({ p: [b.x + R(-0.04, 0.04), b.y + R(-0.02, 0.06), b.z + R(-0.04, 0.04)], v: [R(-0.3, 0.3), R(0.8, 1.9), R(-0.3, 0.3)], life: R(0.22, 0.45), s0: R(0.22, 0.36), s1: 0.05, c0: [1, 0.55, 0.14, 0.9], c1: [0.9, 0.16, 0.02, 0] }); }
        if (Math.random() < 0.35) g.fx.spark.emit({ p: [pos.x, pos.y, pos.z], v: [R(-1, 1), R(1, 3), R(-1, 1)], life: R(0.35, 0.7), s0: 0.07, s1: 0.01, c0: [1, 0.6, 0.15, 1], c1: [0.9, 0.15, 0, 0], g: 3 });
        if (!st.stuck && Math.random() < 0.25) g.fx.smoke.emit({ p: [pos.x, pos.y + 0.1, pos.z], v: [0, 0.8, 0], life: R(0.5, 0.9), s0: 0.15, s1: 0.6, c0: [0.06, 0.05, 0.045, 0.3], c1: [0.16, 0.15, 0.15, 0] });
      }
      if (st.stuck) return st.age < 12;
      vel.y -= 9.8 * (muOn(LOWGRAV) ? 0.4 : 1) * dt;
      const step = vel.length() * dt;
      last.copy(pos);
      dir.copy(vel).normalize();
      // Enemies along this frame's travel (the shooter's arrow only hurts; a teammate's copy just flies).
      if (mine) {
        const hits = g.rayHit(last, dir, step + 0.2, pierce + hitIds.size);
        for (const h of hits) {
          if (hitIds.has(h.t.id) || hitIds.size >= pierce) continue;
          hitIds.add(h.t.id); st.hits++;
          const k = Math.pow(0.7, hitIds.size - 1);
          if (st.dmg) g.damage(h.t, st.dmg * k * (h.head ? head : (h.zone === 'arm' ? 0.8 : h.zone === 'leg' ? 0.6 : 1)), { at: h.point, zone: h.zone, head: h.head, wf });
          g.fx.impact([h.point.x, h.point.y, h.point.z], [0.75, 0.12, 0.08]); if (fire && g.fx.fireShot) g.fx.fireShot([h.point.x, h.point.y, h.point.z], [h.point.x, h.point.y, h.point.z], true);
          if (hitIds.size >= pierce) { // buried in the last one: it stays in them while they are up
            thunk(h.point, 0.8);
            if (h.t.view && h.t.view.model && !(h.t.view.hp <= 0)) { stickInto(h.t.view, mesh, h.point, dir); st.inMob = true; }
            return false;
          }
          vel.multiplyScalar(0.85);
        }
      }
      const n = Math.max(1, Math.ceil(step / 0.5));
      for (let i = 0; i < n; i++) {
        pos.addScaledVector(vel, dt / n);
        const gy = w.heightAt(pos.x, pos.z);
        if (pos.y <= gy + 0.02) { // find the ground between the last point and here
          let lo = last.clone(), hi = pos.clone();
          for (let k = 0; k < 6; k++) { const m = lo.clone().lerp(hi, 0.5); if (m.y <= w.heightAt(m.x, m.z) + 0.02) hi = m; else lo = m; }
          stick(hi, 'ground'); g.fx.dustBurst && g.fx.dustBurst([hi.x, hi.y, hi.z], 0.35); return true;
        }
        if (touch(pos)) { stick(pos, 'prop'); return true; }
      }
      st.traveled += step;
      st.spin += dt * 18;
      // A faint wake behind it, so you can follow the flight.
      if (g.fx.glow && st.age > 0.02) for (let i = 0; i < 2; i++) { const b = pos.clone().addScaledVector(dir, -0.7 - i * step * 0.5); g.fx.glow.emit({ p: [b.x, b.y, b.z], life: 0.22, s0: 0.09, s1: 0.03, c0: [1, 0.96, 0.85, 0.32], c1: [1, 0.9, 0.8, 0] }); }
      mesh.position.copy(pos);
      mesh.quaternion.setFromUnitVectors(Z, dir.copy(vel).normalize());
      mesh.rotateZ(st.spin);
      return st.traveled < range && st.age < 8 && pos.y > -60;
    },
    dispose: () => { if (!st.inMob) g.fx.scene.remove(mesh); },
  });
  return eff;
}

// Leave a spent arrow (mesh, already flying in world space) sticking out of an enemy's body at `p`, pointing along
// `dir`: it is re-parented to the nearest bone so it moves with them, and goes when they are removed. Up to 6 a body.
const _bp = new THREE.Vector3();
export function stickInto(view, mesh, p, dir) {
  const root = view.model;
  let best = root, bd = Infinity;
  root.updateMatrixWorld(true);
  root.traverse((o) => { if (o.isBone) { o.getWorldPosition(_bp); const d = _bp.distanceToSquared(p); if (d < bd) { bd = d; best = o; } } });
  if (mesh.parent) mesh.parent.remove(mesh);
  mesh.scale.setScalar(1);
  mesh.position.copy(p).addScaledVector(dir, 0.12); // head buried a little way in
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  mesh.updateMatrixWorld(true);
  best.attach(mesh);
  const list = (view.stuckArrows = view.stuckArrows || []);
  list.push(mesh);
  if (list.length > 6) { const old = list.shift(); old.parent && old.parent.remove(old); }
}
