// Weapon models. Every weapon's origin is where the right hand grips it,
// +Z points along the barrel or blade, +Y is the top of the weapon.
// userData: { id, kind, muzzle, support (left-hand point or null), twoHanded }.
import * as THREE from 'three';
import { makeJetpack } from './jetpack.js';
import { makeWings, setWings } from './wings.js';
import { modernGuns } from './guns.js';
import { makeDrone, makeTurret } from './drone.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SWORD_SHIELDS } from './shields.js';
import { SILVER_VARIANTS } from './shields_silver.js';
import { AXE_PICKS, grenadelModern } from './axes.js';
import { LONGBOW_VARIANTS, longbowPick, rigBow } from './longbow.js';

// ---------- materials ----------
export function grainTexture(base, dark, lines = 60, w = 256, h = 256) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < lines; i++) {
    g.strokeStyle = dark; g.globalAlpha = 0.08 + Math.random() * 0.18; g.lineWidth = 0.5 + Math.random() * 2;
    g.beginPath(); let y = Math.random() * h; g.moveTo(0, y);
    for (let x = 0; x <= w; x += 16) { y += (Math.random() - 0.5) * 3; g.lineTo(x, y); }
    g.stroke();
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function noiseTexture(seed = 1) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) { const v = 150 + Math.random() * 90; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
let M = null, ENV = null;
// Polished metals get the studio environment explicitly (the world's own environment is dim by
// design), so steel keeps its reflections wherever the weapon is: lobby card, hand, any biome.
const ENV_K = { steel: 1.25, edge: 1.5, steelDark: 1.2, iron: 1.2, brass: 1.3, gunmetal: 1.2, blued: 1.3, ironRed: 1.2, ironGold: 1.3 };
function applyEnv() {
  if (!M || !ENV) return;
  for (const k of Object.keys(ENV_K)) { M[k].envMap = ENV; M[k].envMapIntensity = ENV_K[k]; M[k].needsUpdate = true; }
}
export function setWeaponEnv(tex) { ENV = tex; applyEnv(); }
export function mats() {
  if (M) return M;
  const rough = noiseTexture();
  M = {
    // Blades: bright polished steel for the flats, brighter still on the ground edge bevels, a
    // slightly darker satin in the fuller so the groove reads.
    steel: new THREE.MeshStandardMaterial({ color: 0xe4e8ee, metalness: 0.88, roughness: 0.26, roughnessMap: rough }),
    edge: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.14 }),
    steelDark: new THREE.MeshStandardMaterial({ color: 0x9aa1ab, metalness: 1, roughness: 0.24, roughnessMap: rough }),
    iron: new THREE.MeshStandardMaterial({ color: 0x9096a0, metalness: 0.75, roughness: 0.42, roughnessMap: rough }),
    gunmetal: new THREE.MeshStandardMaterial({ color: 0x2e3136, metalness: 0.85, roughness: 0.38, roughnessMap: rough }),
    blued: new THREE.MeshStandardMaterial({ color: 0x3a4660, metalness: 0.9, roughness: 0.3, roughnessMap: rough }),
    polymer: new THREE.MeshStandardMaterial({ color: 0x1b1b1d, metalness: 0.05, roughness: 0.72, roughnessMap: rough }),
    tan: new THREE.MeshStandardMaterial({ color: 0x8a7a5c, metalness: 0.05, roughness: 0.75, roughnessMap: rough }),
    olive: new THREE.MeshStandardMaterial({ color: 0x5a6438, metalness: 0.35, roughness: 0.5, roughnessMap: rough }), // painted ordnance
    wood: new THREE.MeshStandardMaterial({ map: grainTexture('#70492a', '#2a160a'), roughness: 0.5, metalness: 0.0 }),
    leather: new THREE.MeshStandardMaterial({ map: grainTexture('#4a2f1c', '#150a05', 120), roughness: 0.8 }),
    cord: new THREE.MeshStandardMaterial({ color: 0xb08a58, roughness: 0.85 }), // light leather strap / cord wrap
    ito: new THREE.MeshStandardMaterial({ color: 0x8a1c1c, roughness: 0.8 }), // katana grip braid
    ray: new THREE.MeshStandardMaterial({ color: 0xe8e2d2, roughness: 0.55 }), // ray skin under the braid
    brass: new THREE.MeshStandardMaterial({ color: 0xd9b25c, metalness: 1, roughness: 0.28 }),
    ironRed: new THREE.MeshStandardMaterial({ color: 0xa91616, metalness: 0.78, roughness: 0.26, roughnessMap: rough }), // hot-rod red armour plate
    ironGold: new THREE.MeshStandardMaterial({ color: 0xe2b23c, metalness: 1, roughness: 0.24 }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0x0b0f14, metalness: 0.6, roughness: 0.06, clearcoat: 1, emissive: 0x04070a }),
    // Red-dot and holographic sight glass: clear, so you look through it at the target with the dot on top.
    glass: new THREE.MeshPhysicalMaterial({ color: 0xa8d0e0, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.1, depthWrite: false }),
    // AK-47 (Nutty 2026-11-12, from a photo): blued-black steel with a worn sheen, a grey gun-metal magazine, glossy
    // reddish-brown wood with visible grain, and a dark brown-black grip.
    akSteel: new THREE.MeshStandardMaterial({ color: 0x343a44, metalness: 0.78, roughness: 0.32, roughnessMap: rough }),
    akWorn: new THREE.MeshStandardMaterial({ color: 0x7a8088, metalness: 1, roughness: 0.26, roughnessMap: rough }), // edges and pins rubbed back to bare steel
    akMag: new THREE.MeshStandardMaterial({ color: 0x6d737c, metalness: 0.7, roughness: 0.3, roughnessMap: rough }),
    akWood: new THREE.MeshPhysicalMaterial({ map: grainTexture('#6f2d15', '#1e0703', 150), roughness: 0.3, metalness: 0, clearcoat: 0.75, clearcoatRoughness: 0.18 }),
    akGrip: new THREE.MeshPhysicalMaterial({ color: 0x1a0f0a, roughness: 0.45, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.4 }),
    dot: new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false }),
    // Modern firearms (guns.js): hard-anodised aluminium, rubber overmould, nylon webbing, dark recesses, fibre-optic sights, shotshells.
    anod: new THREE.MeshStandardMaterial({ color: 0x4d525a, metalness: 0.7, roughness: 0.48, roughnessMap: rough }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x141416, metalness: 0.0, roughness: 0.92 }),
    nylon: new THREE.MeshStandardMaterial({ color: 0x2a2c2a, metalness: 0.0, roughness: 0.95, map: grainTexture('#2a2c2a', '#111', 160, 64, 64) }),
    slot: new THREE.MeshStandardMaterial({ color: 0x07080a, metalness: 0.2, roughness: 0.9 }),
    fiber: new THREE.MeshBasicMaterial({ color: 0x8cff3c, toneMapped: false }),
    shell: new THREE.MeshStandardMaterial({ color: 0xb8201e, metalness: 0.05, roughness: 0.55 }),
  };
  applyEnv();
  return M;
}

// Extrude a side profile (points as [z, y] in metres) to a slab `t` thick, centred on x=0.
export function slab(points, t, bevel = 0.003) {
  const s = new THREE.Shape();
  points.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, t - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  g.rotateY(-Math.PI / 2); // shape x -> +z, extrusion -> -x
  g.translate(t / 2 - bevel, 0, 0);
  return g;
}
export const cyl = (r0, r1, len, seg = 16) => new THREE.CylinderGeometry(r1, r0, len, seg).rotateX(Math.PI / 2); // along +z, r0 at -z end
export const at = (g, x, y, z) => g.translate(x, y, z);
export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- blade and handle builders ----------
// Piecewise-linear lookup in [[z, value], ...].
export function tab(t, z) {
  if (z <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) if (z <= t[i][0]) return t[i - 1][1] + (t[i][1] - t[i - 1][1]) * (z - t[i - 1][0]) / (t[i][0] - t[i - 1][0] || 1);
  return t[t.length - 1][1];
}
// Body of revolution about the Z axis. prof: [[radius, z], ...] in increasing z.
export const lathe = (prof, seg = 14) => new THREE.LatheGeometry(prof.map(([r, z]) => new THREE.Vector2(r, z)), seg).rotateX(Math.PI / 2);
// Wood grain runs along the length: swap the UVs of a turned part.
export const grainAlong = (g) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i)); return g; };
// Tube along a curve with a radius per control point (curved quillons, loops, levers).
export function sweep(pts, radii, radial = 10) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => V3(...p)), false, 'centripetal');
  const N = pts.length * 8, pos = [], uv = [], idx = [];
  const T = V3(0, 0, 0), a = V3(0, 0, 0), b = V3(0, 0, 0);
  for (let i = 0; i <= N; i++) {
    const t = i / N, p = curve.getPoint(t);
    curve.getTangent(t, T);
    a.crossVectors(T, Math.abs(T.y) > 0.9 ? V3(1, 0, 0) : V3(0, 1, 0)).normalize(); b.crossVectors(T, a).normalize();
    const f = t * (radii.length - 1), i0 = Math.min(radii.length - 2, Math.floor(f)), r = radii[i0] + (radii[i0 + 1] - radii[i0]) * (f - i0);
    for (let j = 0; j <= radial; j++) {
      const ang = (j / radial) * Math.PI * 2;
      pos.push(p.x + (a.x * Math.cos(ang) + b.x * Math.sin(ang)) * r, p.y + (a.y * Math.cos(ang) + b.y * Math.sin(ang)) * r, p.z + (a.z * Math.cos(ang) + b.z * Math.sin(ang)) * r);
      uv.push(t, j / radial);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < radial; j++) { const A = i * (radial + 1) + j, B = A + 1, C = A + radial + 1, D = C + 1; idx.push(A, B, D, A, D, C); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// Spiral wrap (leather strap, braid) round a handle. rfn(z) gives the surface radius.
export function helix(z0, z1, rfn, turns, tr, dir = 1, phase = 0) {
  class H extends THREE.Curve {
    getPoint(t, o = new THREE.Vector3()) { const a = phase + dir * t * turns * Math.PI * 2, z = z0 + (z1 - z0) * t, r = rfn(z); return o.set(Math.cos(a) * r, Math.sin(a) * r, z); }
  }
  return new THREE.TubeGeometry(new H(), Math.round(turns * 10), tr, 5, false);
}
// Wrapped handle: core of `coreMat` with a visible spiral of `wrapMat` (two crossed spirals when `cross`).
export function wrapped(parts, z0, z1, rt, coreMat, wrapMat, turns, tr = 0.0032, cross = false) {
  const prof = [[0, z0]];
  for (let i = 0; i <= 10; i++) { const z = z0 + (z1 - z0) * (i / 10); prof.push([tab(rt, z), z]); }
  prof.push([0, z1]);
  parts.push([lathe(prof, 14), coreMat]);
  const rf = (z) => tab(rt, z) + tr * 0.35;
  parts.push([helix(z0, z1, rf, turns, tr), wrapMat]);
  if (cross) parts.push([helix(z0, z1, rf, turns, tr, -1), wrapMat]);
}
// Loft cross-section rings along Z into flat-shaded facets, bucketed by segment tag.
// rings[i] = [[x, y], ...] (counter-clockwise), zs[i] = station z, tags[k] = tag of ring segment k.
export function loft(zs, rings, tags) {
  const buckets = {}, n = rings[0].length;
  for (let i = 0; i < zs.length - 1; i++) {
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n, A = rings[i][k], B = rings[i][k2], C = rings[i + 1][k2], D = rings[i + 1][k], z0 = zs[i], z1 = zs[i + 1];
      (buckets[tags[k]] || (buckets[tags[k]] = [])).push(A[0], A[1], z0, B[0], B[1], z0, C[0], C[1], z1, A[0], A[1], z0, C[0], C[1], z1, D[0], D[1], z1);
    }
  }
  const out = {};
  for (const t in buckets) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(buckets[t], 3)); g.computeVertexNormals(); out[t] = g; }
  return out;
}
// Cross-sections: double-edged with a fuller, diamond with a ridge, single-edged (knife, katana), axe cheek.
export const TAG_D = ['edge', 'flat', 'fuller', 'fuller', 'fuller', 'flat', 'edge', 'edge', 'flat', 'fuller', 'fuller', 'fuller', 'flat', 'edge'];
export const ringD = (w, t, eb, fw = 0, fd = 0) => { const f2 = fw * 0.8; return [[w, 0], [w - eb, t], [fw, t], [f2, t - fd], [-f2, t - fd], [-fw, t], [-(w - eb), t], [-w, 0], [-(w - eb), -t], [-fw, -t], [-f2, -(t - fd)], [f2, -(t - fd)], [fw, -t], [w - eb, -t]]; };
export const TAG_X = ['edge', 'flat', 'flat', 'edge', 'edge', 'flat', 'flat', 'edge'];
export const ringX = (w, t, eb) => [[w, 0], [w - eb, t * 0.45], [0, t], [-(w - eb), t * 0.45], [-w, 0], [-(w - eb), -t * 0.45], [0, -t], [w - eb, -t * 0.45]];
export const TAG_S = ['edge', 'flat', 'fuller', 'fuller', 'fuller', 'flat', 'flat', 'flat', 'flat', 'flat', 'fuller', 'fuller', 'fuller', 'flat', 'edge'];
export const ringS = (xe, xs, t, eb, fc = 0, fw = 0, fd = 0, sb = 0.002) => { const f2 = fw * 0.8; return [[xe, 0], [xe - eb, t], [fc + fw, t], [fc + f2, t - fd], [fc - f2, t - fd], [fc - fw, t], [xs + sb, t], [xs, t * 0.5], [xs, -t * 0.5], [xs + sb, -t], [fc - fw, -t], [fc - f2, -(t - fd)], [fc + f2, -(t - fd)], [fc + fw, -t], [xe - eb, -t]]; };
const TAG_A = ['edge', 'flat', 'flat', 'flat', 'back', 'flat', 'flat', 'flat', 'edge'];
const ringA = (xs, xe, ts, tm, te, eb) => { const d = xe - xs, x1 = xs + d * 0.22, x2 = xs + d * 0.45; return [[xe, 0], [xe - eb, te], [x2, tm], [x1, ts * 0.92], [xs, ts], [xs, -ts], [x1, -ts * 0.92], [x2, -tm], [xe - eb, -te]]; };
// Loft -> [[geometry, material], ...]: edge bevels polished bright, flats steel, fuller satin.
export function bladeParts(zs, rings, tags, m, fuller) {
  const g = loft(zs, rings, tags), mm = { edge: m.edge, flat: m.steel, fuller: fuller || m.steelDark, back: m.steel };
  return Object.keys(g).map((t) => [g[t], mm[t]]);
}
// Flat plate: outline [[z, x], ...] in the horizontal plane, `t` thick in Y.
export const plate = (pts, t, bevel = 0.002) => slab(pts, t, bevel).rotateZ(-Math.PI / 2);

export function build(parts) {
  // parts: [[geometry, material], ...] -> one mesh per material
  const byMat = new Map();
  for (const [g, m] of parts) {
    const n = g.index ? g.toNonIndexed() : g;
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    for (const a of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(a)) n.deleteAttribute(a);
    if (!byMat.has(m)) byMat.set(m, []);
    byMat.get(m).push(n);
  }
  const grp = new THREE.Group();
  for (const [m, list] of byMat) {
    const mesh = new THREE.Mesh(mergeGeometries(list), m);
    mesh.castShadow = true;
    grp.add(mesh);
  }
  return grp;
}

function railTeeth(z0, z1, y, w = 0.022) {
  const out = [];
  for (let z = z0; z < z1; z += 0.012) out.push(at(new THREE.BoxGeometry(w, 0.006, 0.006), 0, y, z));
  return out;
}

// ---------- guns ----------
const GUNS = {
  // pistol, revolver, smg, ar, shotgun, dmr, lever, coach, lmg, sniper, pdw, hpistol, magnum, sawedoff: see guns.js
};


// ---------- more guns: sniper, PDW, heavy pistol, magnum, sawed-off, crossbow, launchers, minigun ----------
// A rod between two points (bolts, bowstrings, struts).
export function rod(a, b, r, seg = 6) {
  const A = V3(...a), Bv = V3(...b), d = Bv.clone().sub(A), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize()));
  g.translate((A.x + Bv.x) / 2, (A.y + Bv.y) / 2, (A.z + Bv.z) / 2);
  return g;
}
const guard = (z0, z1, y0, depth) => slab([[z0, y0], [z1, y0], [z1, y0 - depth * 0.4], [z1 - 0.015, y0 - depth], [z0 + 0.005, y0 - depth], [z0, y0 - depth * 0.6]], 0.008, 0.001);
// Box centred at (x, y, z), optionally tilted about X first.
export const BX = (w, h, d, x, y, z, rx = 0) => at(new THREE.BoxGeometry(w, h, d).rotateX(rx), x, y, z);
// Cylinder along Z centred at (x, y, z).
export const CY = (r, len, x, y, z, seg = 14) => at(cyl(r, r, len, seg), x, y, z);
Object.assign(GUNS, modernGuns({ THREE, mats, slab, cyl, at, BX, CY, guard, rod, railTeeth, sweep }));

Object.assign(GUNS, {
  // Tactical crossbow: cocked, with a bolt on the rail, recurve limbs, cams, stirrup and a small scope.
  crossbow() {
    const m = mats();
    const limb = (s) => sweep([[s * 0.05, 0.036, 0.46], [s * 0.17, 0.036, 0.466], [s * 0.285, 0.036, 0.445], [s * 0.36, 0.036, 0.402]], [0.0125, 0.0115, 0.0095, 0.0075], 8);
    const tip = (s) => [s * 0.36, 0.036, 0.402];
    const p = [
      [slab([[-0.1, 0.05], [0.3, 0.05], [0.52, 0.045], [0.53, 0.008], [0.3, -0.012], [0.1, -0.03], [-0.1, -0.03]], 0.036, 0.006), m.wood], // tiller
      [slab([[-0.1, 0.05], [-0.2, 0.062], [-0.33, 0.066], [-0.35, 0.05], [-0.352, -0.085], [-0.33, -0.098], [-0.28, -0.078], [-0.2, -0.05], [-0.1, -0.03]], 0.04, 0.006), m.wood], // butt
      [slab([[-0.036, 0.0], [0.0, 0.0], [-0.016, -0.11], [-0.055, -0.116], [-0.066, -0.09]], 0.034, 0.007), m.wood], // pistol grip
      [BX(0.024, 0.012, 0.52, 0, 0.056, 0.22), m.gunmetal], // flight rail
      ...railTeeth(-0.05, 0.45, 0.0635, 0.024).map((g) => [g, m.gunmetal]),
      [BX(0.1, 0.044, 0.07, 0, 0.032, 0.455), m.gunmetal], // prod riser
      [limb(1), m.gunmetal], [limb(-1), m.gunmetal],
      [at(new THREE.CylinderGeometry(0.02, 0.02, 0.014, 14), ...tip(1)), m.gunmetal], [at(new THREE.CylinderGeometry(0.02, 0.02, 0.014, 14), ...tip(-1)), m.gunmetal], // cams
      [rod(tip(1), [0.012, 0.062, 0.1], 0.0022), m.cord], [rod(tip(-1), [-0.012, 0.062, 0.1], 0.0022), m.cord], // string
      [BX(0.04, 0.03, 0.06, 0, 0.056, 0.08), m.gunmetal], // latch housing
      [guard(0.0, 0.07, 0.0, 0.04), m.gunmetal],
      [at(new THREE.TorusGeometry(0.042, 0.0055, 6, 18).rotateY(Math.PI / 2), 0, 0.012, 0.548), m.steel], // stirrup
      // scope
      [CY(0.0155, 0.15, 0, 0.1, 0.14, 16), m.gunmetal], [BX(0.014, 0.03, 0.03, 0, 0.078, 0.1), m.gunmetal], [BX(0.014, 0.03, 0.03, 0, 0.078, 0.18), m.gunmetal],
      [at(new THREE.CircleGeometry(0.0145, 16), 0, 0.1, 0.2155), m.lens],
      [at(new THREE.CircleGeometry(0.0145, 16).rotateY(Math.PI), 0, 0.1, 0.0645), m.lens],
    ];
    // The bolt on the rail: shaft, broadhead and fletching. Hidden while the bow is unloaded.
    const ammo = [
      [rod([0, 0.0715, 0.06], [0, 0.0715, 0.54], 0.0042, 8), m.steel],
      [at(new THREE.ConeGeometry(0.012, 0.05, 4).rotateX(Math.PI / 2), 0, 0.0715, 0.565), m.steel],
      [BX(0.0015, 0.024, 0.05, 0, 0.0715, 0.085), m.cord], [BX(0.021, 0.0015, 0.05, 0, 0.0715, 0.085), m.cord],
    ];
    return { parts: p, ammo, muzzle: [0, 0.0715, 0.6], support: [0, -0.012, 0.28], cardRoll: 0.55 };
  },
  // 40 mm revolving grenade launcher: six-chamber cylinder, barrel on top, vertical foregrip, collapsing stock.
  grenadel() {
    const m = mats();
    const p = [
      [CY(0.058, 0.13, 0, 0.04, 0.12, 20), m.gunmetal], // cylinder
      [CY(0.0605, 0.012, 0, 0.04, 0.075, 20), m.blued], [CY(0.0605, 0.012, 0, 0.04, 0.165, 20), m.blued],
      [at(cyl(0.0215, 0.0215, 0.37, 20), 0, 0.078, 0.37), m.blued], // barrel
      [CY(0.0245, 0.03, 0, 0.078, 0.54, 18), m.gunmetal], // muzzle ring
      [at(new THREE.CircleGeometry(0.0165, 16), 0, 0.078, 0.5555), m.polymer], // bore
      [slab([[-0.125, 0.012], [-0.05, -0.012], [0.07, -0.012], [0.07, 0.092], [0.0, 0.106], [-0.125, 0.094]], 0.044, 0.01), m.tan], // receiver
      ...railTeeth(-0.1, 0.0, 0.11, 0.026).map((g) => [g, m.gunmetal]),
      [BX(0.036, 0.03, 0.15, 0, 0.056, 0.265), m.gunmetal], // barrel mount
      [slab([[0.29, 0.05], [0.335, 0.05], [0.33, -0.075], [0.292, -0.08]], 0.03, 0.006), m.tan], // vertical foregrip
      [BX(0.05, 0.03, 0.08, 0, 0.044, 0.31), m.gunmetal],
      [slab([[-0.036, 0.0], [0.002, 0.0], [-0.012, -0.11], [-0.054, -0.116], [-0.064, -0.09]], 0.034, 0.007), m.tan], // pistol grip
      [guard(0.0, 0.07, -0.004, 0.036), m.gunmetal],
      [rod([0.022, 0.05, -0.125], [0.022, 0.05, -0.3], 0.006), m.gunmetal], [rod([-0.022, 0.05, -0.125], [-0.022, 0.05, -0.3], 0.006), m.gunmetal], // stock rods
      [slab([[-0.298, 0.1], [-0.32, 0.095], [-0.326, -0.045], [-0.298, -0.05]], 0.042, 0.005), m.tan], // butt
      [BX(0.005, 0.018, 0.006, 0, 0.116, 0.48), m.blued], // front sight
      [BX(0.02, 0.022, 0.006, 0, 0.112, -0.06), m.blued], // rear sight
    ];
    for (let i = 0; i < 6; i++) { const a = Math.PI / 2 + i * (Math.PI / 3); p.push([at(new THREE.CircleGeometry(0.0155, 14), Math.cos(a) * 0.036, 0.04 + Math.sin(a) * 0.036, 0.1856), m.polymer]); } // chamber mouths
    return { parts: p, muzzle: [0, 0.078, 0.56], support: [0, -0.03, 0.312] };
  },
  // Shoulder-fired rocket launcher: steel tube with a flared rear venturi, wooden heat shield and grips,
  // optical sight, and the rocket's warhead standing out of the muzzle.
  rocket() {
    const m = mats(), Y = 0.088;
    const tube = lathe([[0, -0.3], [0.0235, -0.3], [0.0235, 0.5], [0.028, 0.52], [0.0285, 0.55], [0, 0.55]], 18);
    const bell = lathe([[0.057, -0.5], [0.054, -0.47], [0.043, -0.4], [0.03, -0.32], [0.0225, -0.27], [0.0205, -0.27], [0.0265, -0.32], [0.039, -0.4], [0.0505, -0.47], [0.0525, -0.5], [0.057, -0.5]], 20);
    const p = [
      [at(tube, 0, Y, 0), m.gunmetal],
      [at(bell, 0, Y, 0), m.gunmetal],
      [at(new THREE.CircleGeometry(0.05, 20).rotateY(Math.PI), 0, Y, -0.4995), m.polymer], // dark throat
      [at(grainAlong(lathe([[0.0345, 0.04], [0.0365, 0.05], [0.0365, 0.32], [0.0345, 0.34]], 16)), 0, Y, 0), m.wood], // heat shield
      [at(lathe([[0.0368, 0.035], [0.0368, 0.045]], 16), 0, Y, 0), m.steel], [at(lathe([[0.0368, 0.335], [0.0368, 0.345]], 16), 0, Y, 0), m.steel],
      [slab([[-0.04, 0.06], [0.012, 0.06], [-0.002, -0.07], [-0.048, -0.076], [-0.06, -0.055]], 0.034, 0.007), m.wood], // pistol grip
      [BX(0.04, 0.022, 0.1, 0, 0.058, -0.01), m.polymer], // trigger housing
      [guard(0.0, 0.065, 0.0, 0.036), m.gunmetal],
      [slab([[0.215, 0.056], [0.28, 0.056], [0.272, -0.07], [0.22, -0.07]], 0.032, 0.007), m.wood], // front grip
      [BX(0.014, 0.02, 0.12, 0, 0.056, 0.245), m.gunmetal],
      // optical sight on the left
      [at(cyl(0.0152, 0.0152, 0.17, 14), 0.052, 0.138, 0.1), m.gunmetal],
      [at(cyl(0.0152, 0.022, 0.03, 14), 0.052, 0.138, 0.2), m.gunmetal],
      [BX(0.05, 0.012, 0.05, 0.026, 0.118, 0.1), m.gunmetal], [BX(0.012, 0.03, 0.04, 0.052, 0.122, 0.1), m.gunmetal],
      [at(new THREE.CircleGeometry(0.0215, 14), 0.052, 0.138, 0.2155), m.lens],
      [at(new THREE.CircleGeometry(0.0145, 14).rotateY(Math.PI), 0.052, 0.138, 0.0145), m.lens],
      [BX(0.006, 0.014, 0.008, 0, Y + 0.036, 0.5), m.steel], // iron front sight
    ];
    // The rocket itself: painted warhead and body with a dark fuse probe. Hidden while reloading.
    const ammo = [
      [at(lathe([[0, 0.5], [0.0225, 0.5], [0.0225, 0.56], [0.034, 0.585], [0.0425, 0.61], [0.0425, 0.71], [0.04, 0.77], [0.03, 0.82], [0.016, 0.855], [0.008, 0.875], [0, 0.88]], 20), 0, Y, 0), m.olive],
      [at(lathe([[0.0432, 0.7], [0.0432, 0.716], [0, 0.716]], 20), 0, Y, 0), m.gunmetal],
      [at(lathe([[0.0085, 0.865], [0.0065, 0.93], [0, 0.95]], 8), 0, Y, 0), m.gunmetal],
    ];
    return { parts: p, ammo, muzzle: [0, Y, 0.96], back: [0, Y, -0.52], support: [0, 0.0, 0.248] };
  },
  // Rotary minigun: six spinning barrels, ammo drum with a brass belt, motor housing and two handles.
  minigun() {
    const m = mats(), AY = 0.07;
    const p = [
      [at(cyl(0.052, 0.052, 0.3, 20), 0, AY, 0.06), m.gunmetal], // main housing
      [at(cyl(0.064, 0.064, 0.14, 20), 0, AY, -0.16), m.gunmetal], // motor housing
      [at(cyl(0.056, 0.064, 0.05, 20), 0, AY, -0.255), m.polymer], // rear cap
      [at(cyl(0.0625, 0.0625, 0.06, 20), 0, AY, 0.24), m.gunmetal], // front shroud
      [at(cyl(0.066, 0.066, 0.012, 20), 0, AY, 0.275), m.polymer],
      [slab([[-0.04, 0.02], [0.012, 0.02], [-0.004, -0.095], [-0.052, -0.1], [-0.064, -0.075]], 0.034, 0.007), m.polymer], // rear grip
      [guard(0.0, 0.07, 0.02, 0.04), m.gunmetal],
      [slab([[0.25, 0.03], [0.295, 0.03], [0.29, -0.085], [0.252, -0.09]], 0.03, 0.006), m.polymer], // front handle
      [BX(0.04, 0.02, 0.07, 0, 0.026, 0.27), m.gunmetal],
      [slab([[-0.02, 0.118], [0.16, 0.118], [0.15, 0.16], [0.0, 0.16]], 0.016, 0.004), m.gunmetal], // carry handle
      [BX(0.03, 0.02, 0.012, 0, 0.14, 0.15), m.gunmetal],
      [at(cyl(0.095, 0.095, 0.15, 24).rotateZ(Math.PI / 2), 0, -0.125, 0.07), m.olive], // ammo drum
      ...[-0.05, 0.0, 0.05].map((x) => [at(cyl(0.0975, 0.0975, 0.009, 24).rotateZ(Math.PI / 2), x, -0.125, 0.07), m.gunmetal]),
      [at(cyl(0.03, 0.03, 0.16, 12).rotateZ(Math.PI / 2), 0, -0.125, 0.07), m.polymer], // hub
      [BX(0.05, 0.06, 0.07, 0, -0.04, 0.07), m.gunmetal], // feed chute
    ];
    for (let i = 0; i < 9; i++) { const t = i / 8; p.push([at(cyl(0.0058, 0.0058, 0.024, 8).rotateZ(Math.PI / 2), 0.053, -0.045 + t * 0.1, 0.1 - t * 0.075), m.brass]); } // belt
    // The rotor spins about the housing axis: built around the origin, then lifted onto the axis.
    const sp = [];
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; sp.push([at(cyl(0.0088, 0.0088, 0.58, 10), Math.cos(a) * 0.034, Math.sin(a) * 0.034, 0.5), m.blued]); }
    sp.push([at(cyl(0.02, 0.02, 0.56, 12), 0, 0, 0.49), m.blued]);
    for (const z of [0.32, 0.5, 0.7]) sp.push([at(cyl(0.05, 0.05, 0.012, 22), 0, 0, z), m.steel]);
    sp.push([at(cyl(0.048, 0.048, 0.03, 22), 0, 0, 0.215), m.steel]);
    return { parts: p, spinner: { parts: sp, at: [0, AY, 0] }, muzzle: [0, AY, 0.8], support: [0, -0.02, 0.272] };
  },
});

// Cylinder along X centred at (x, y, z).
export const CX = (r, len, x, y, z, seg = 20) => at(new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2), x, y, z);
export const glowColor = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });

// ---------- tier 3 gear ----------
// Shown on the weapon wall and in the HUD slot. The Web Swing bracer is never held (its web line is drawn by FX.beam)
// and Laser Vision has nothing in the hands at all: in the game makeWeapon gives it an empty object tagged `eyes`,
// so the rig leaves the arms free; the card shows a pair of burning eyes and their beams.
const GEAR = {
  // One wrist bracer holding a cartridge of web fluid, a reel drum and a fine nozzle over the back of the hand.
  webswing() {
    const m = mats(), P = [];
    P.push([at(cyl(0.049, 0.041, 0.13, 22), 0, -0.004, -0.135), m.gunmetal]); // bracer shell over the forearm
    P.push([at(cyl(0.0505, 0.0505, 0.018, 22), 0, -0.004, -0.205), m.leather]); // strap
    P.push([at(cyl(0.0435, 0.0435, 0.012, 22), 0, -0.004, -0.076), m.iron]); // front band
    P.push([BX(0.06, 0.026, 0.14, 0, 0.044, -0.13), m.gunmetal]); // housing on top
    P.push([BX(0.05, 0.006, 0.108, 0, 0.059, -0.13), m.iron]);
    P.push([BX(0.034, 0.02, 0.06, 0, 0.052, -0.03), m.gunmetal]); // trigger block ahead of it
    P.push([at(cyl(0.012, 0.012, 0.092, 14), 0.033, 0.034, -0.13), m.lens]); // fluid cartridge
    for (const z of [-0.178, -0.082]) P.push([at(cyl(0.0138, 0.0138, 0.008, 14), 0.033, 0.034, z), m.brass]);
    P.push([at(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 20).rotateZ(Math.PI / 2), -0.04, 0.03, -0.13), m.iron]); // reel drum
    P.push([at(new THREE.CylinderGeometry(0.022, 0.022, 0.024, 20).rotateZ(Math.PI / 2), -0.041, 0.03, -0.13), m.cord]); // wound silk
    P.push([at(lathe([[0.0105, -0.03], [0.0105, 0.018], [0.0078, 0.05], [0.0068, 0.078]], 12), 0, 0.056, 0), m.gunmetal]); // nozzle tube
    P.push([at(lathe([[0.0125, 0.07], [0.0125, 0.09], [0.0075, 0.09]], 12), 0, 0.056, 0), m.brass]); // nozzle tip
    P.push([at(new THREE.CircleGeometry(0.0068, 10), 0, 0.056, 0.0905), m.polymer]);
    P.push([at(new THREE.SphereGeometry(0.0055, 10, 8), 0, 0.0665, -0.09), m.dot]); // status LED
    return { parts: P, kind: 'gear', cardTilt: [0.6, -0.25, 0.1] };
  },
  // Jetpack: worn on the back (the player's own pack model), nothing in the hands. The card shows the pack itself.
  jetpack(card) {
    if (!card) return { parts: [], kind: 'gear' };
    const P = [], pack = makeJetpack();
    pack.updateMatrixWorld(true);
    pack.traverse((o) => { if (o.isMesh) P.push([o.geometry.clone().applyMatrix4(o.matrixWorld), o.material]); });
    return { parts: P, kind: 'gear', cardTilt: [0.15, 0.7, 0.05] };
  },
  // Wings: worn on the back (the player's own wing model), nothing in the hands. The card shows the wings spread.
  wings(card) {
    if (!card) return { parts: [], kind: 'gear' };
    const P = [], w = makeWings();
    setWings(w, 1, 0);
    w.updateMatrixWorld(true);
    w.traverse((o) => { if (o.isMesh) P.push([o.geometry.clone().applyMatrix4(o.matrixWorld), o.material]); });
    return { parts: P, kind: 'gear', cardTilt: [0.1, 0.5, 0.05] };
  },
  // Guardian Drone: hovers beside the wearer (src/drone.js), nothing in the hands. The card shows the drone itself.
  drone(card) {
    if (!card) return { parts: [], kind: 'gear' };
    const P = [], d = makeDrone();
    d.userData.gun.rotation.set(0.25, -0.5, 0);
    d.updateMatrixWorld(true);
    d.traverse((o) => { if (o.isMesh && o.material.opacity !== 0.28) P.push([o.geometry.clone().applyMatrix4(o.matrixWorld), o.material]); });
    return { parts: P, kind: 'gear', cardTilt: [0.55, -0.6, 0.0] };
  },
  // No Gear: an empty harness ring with a strap, so the slot reads as deliberately empty.
  nogear(card) {
    if (!card) return { parts: [], kind: 'gear' };
    const m = mats(), P = [];
    P.push([new THREE.TorusGeometry(0.16, 0.022, 10, 40).rotateY(Math.PI / 2), m.gunmetal]); // faces the card camera once laid on its side
    P.push([new THREE.BoxGeometry(0.02, 0.4, 0.03).rotateZ(Math.PI / 4).rotateY(Math.PI / 2), m.polymer]);
    P.push([at(new THREE.BoxGeometry(0.03, 0.06, 0.06), 0, 0.17, 0), m.leather]);
    return { parts: P, kind: 'gear', cardTilt: [0.0, 0.0, 0.0] };
  },
  // Laser Vision: nothing to hold. `card` builds the wall picture: two burning eyes and the twin beams they throw.
  laser(card) {
    if (!card) return { parts: [], kind: 'gun', eyes: true };
    const P = [];
    const red = new THREE.MeshBasicMaterial({ color: 0xff2412, toneMapped: false }), hot = new THREE.MeshBasicMaterial({ color: 0xffd2c4, toneMapped: false });
    const dark = new THREE.MeshStandardMaterial({ color: 0x14080a, metalness: 0.2, roughness: 0.6 });
    for (const x of [-0.075, 0.075]) {
      P.push([at(new THREE.SphereGeometry(0.05, 20, 14), x, 0, 0), dark]); // the eye
      P.push([at(new THREE.SphereGeometry(0.03, 16, 12), x, 0, 0.034), red]); // iris, white-hot core
      P.push([at(new THREE.SphereGeometry(0.014, 12, 8), x, 0, 0.052), hot]);
      P.push([at(cyl(0.013, 0.006, 1.15, 12), x, 0, 0.63), red]); // the beam
      P.push([at(cyl(0.005, 0.002, 1.1, 8), x, 0, 0.6), hot]);
    }
    P.push([BX(0.26, 0.03, 0.04, 0, 0.065, -0.01), dark]); // brow
    return { parts: P, kind: 'gun', eyes: true, cardTilt: [0.12, -0.2, 0] };
  },
};

Object.assign(GUNS, {
  // Iron Man style shoulder cannon: red armoured housing with gold trim, a stack of glowing emitter coils round the
  // barrel, an arc-reactor emitter set into each side, heat-sink fins and a padded shoulder plate. The side gauge
  // shows the charge; the glowing parts are lit by animateWeapon.
  pulse() {
    const m = mats(), AY = 0.15, glow = [], gauge = [], extras = [];
    const lit = (c, k = 1) => { const x = glowColor(c); glow.push({ m: x, c: new THREE.Color(c), k }); return x; };
    const ring = (z, r0, r1, w) => lathe([[r0, z - w], [r1, z - w * 0.7], [r1, z + w * 0.7], [r0, z + w]], 28);
    const body = lathe([[0, -0.41], [0.055, -0.41], [0.082, -0.38], [0.097, -0.32], [0.1, -0.26], [0.1, 0.17], [0.09, 0.23], [0.074, 0.27], [0.066, 0.29]], 32);
    const p = [
      [at(body, 0, AY, 0), m.ironRed],
      ...[-0.3, -0.02, 0.2].map((z) => [at(ring(z, 0.1, 0.1055, 0.009), 0, AY, 0), m.ironGold]),
      [at(lathe([[0, -0.485], [0.1, -0.485], [0.115, -0.465], [0.12, -0.43], [0.108, -0.408], [0, -0.408]], 26).scale(0.92, 1.28, 1), 0, AY - 0.01, 0), m.polymer], // padded shoulder plate
      [at(lathe([[0.11, -0.47], [0.1215, -0.455], [0.1215, -0.44], [0.1105, -0.428]], 26).scale(0.92, 1.28, 1), 0, AY - 0.01, 0), m.ironGold],
      [at(lathe([[0, 0.28], [0.062, 0.28], [0.06, 0.34], [0.054, 0.63], [0.052, 0.66], [0, 0.66]], 22), 0, AY, 0), m.gunmetal], // barrel jacket
      ...[0.4, 0.5].map((z) => [at(ring(z, 0.05, 0.0625, 0.007), 0, AY, 0), m.ironGold]),
      [at(lathe([[0.052, 0.62], [0.067, 0.65], [0.087, 0.69], [0.092, 0.716], [0.083, 0.716], [0.062, 0.69], [0.05, 0.668]], 26), 0, AY, 0), m.ironGold], // flared emitter bell
      [at(new THREE.CircleGeometry(0.05, 24), 0, AY, 0.688), lit(0x59d9ff, 1)], // the repulsor glow
      [at(new THREE.CircleGeometry(0.024, 18), 0, AY, 0.6885), lit(0xffffff, 0.9)],
      ...[0.34, 0.45, 0.56].map((z) => [at(ring(z, 0.05, 0.0665, 0.0105), 0, AY, 0), lit(0x59d9ff, 1)]), // emitter coils
      [BX(0.05, 0.01, 0.34, 0, AY + 0.134, -0.03), m.iron], // top plate and cooling fins
      [BX(0.1, 0.022, 0.3, 0, AY + 0.1, -0.03), m.gunmetal],
      [slab([[0.0, 0.06], [-0.05, 0.06], [-0.066, -0.06], [-0.054, -0.082], [-0.004, -0.075], [0.012, 0.06]], 0.036, 0.007), m.polymer], // pistol grip
      [BX(0.044, 0.024, 0.11, 0, 0.056, -0.012), m.gunmetal],
      [guard(0.0, 0.07, 0.0, 0.036), m.gunmetal],
      [slab([[0.19, 0.05], [0.25, 0.05], [0.242, -0.075], [0.195, -0.075]], 0.034, 0.007), m.polymer], // front grip
      [BX(0.044, 0.03, 0.12, 0, 0.056, 0.22), m.gunmetal],
      [BX(0.006, 0.014, 0.01, 0, AY + 0.152, 0.2), m.ironGold], // front sight
    ];
    for (let i = 0; i < 9; i++) p.push([BX(0.088, 0.04, 0.007, 0, AY + 0.119, -0.17 + i * 0.026), m.gunmetal]);
    for (const sx of [-1, 1]) { // arc-reactor emitter set into each side of the housing
      p.push([CX(0.06, 0.04, sx * 0.093, AY, -0.2), m.ironGold]);
      p.push([CX(0.0485, 0.04, sx * 0.0935, AY, -0.2), m.gunmetal]);
      p.push([CX(0.0345, 0.04, sx * 0.0945, AY, -0.2), lit(0x59d9ff, 0.85)]);
      p.push([CX(0.0165, 0.04, sx * 0.0955, AY, -0.2), lit(0xffffff, 0.9)]);
      for (let k = 0; k < 6; k++) p.push([at(new THREE.BoxGeometry(0.003, 0.004, 0.034).translate(0, 0, 0.032).rotateX(k * Math.PI / 3), sx * 0.1155, AY, -0.2), m.ironGold]);
    }
    // Charge gauge: ten segments up each side of the housing, lit as far as the charge goes.
    const GN = 10, GA = 0.56, gx = Math.cos(GA), gy = Math.sin(GA);
    for (let i = 0; i < GN; i++) gauge.push(glowColor(0x0c1a22));
    for (const sx of [-1, 1]) {
      p.push([at(new THREE.BoxGeometry(0.012, 0.024, 0.27).rotateZ(sx * GA), sx * 0.102 * gx, AY + 0.102 * gy, 0.02), m.gunmetal]); // gauge housing
      for (let i = 0; i < GN; i++) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.014, 0.02), gauge[i]);
        mesh.position.set(sx * 0.1079 * gx, AY + 0.1079 * gy, -0.095 + i * 0.026); mesh.rotation.z = sx * GA;
        extras.push(mesh);
      }
    }
    return { parts: p, muzzle: [0, AY, 0.74], support: [0, 0.0, 0.22], shoulder: true, glow, gauge, extras };
  },
});

// ---------- cryo rifle and necromancer's staff ----------
Object.assign(GUNS, {
  // Ice Gun: a chunky two-handed cryo rifle: frosted white-blue shell, a glowing coolant core in a glass tube, finned emitter.
  icegun() {
    const m = mats(), glow = [];
    const lit = (c, k = 1) => { const x = glowColor(c); glow.push({ m: x, c: new THREE.Color(c), k }); return x; };
    const frost = new THREE.MeshStandardMaterial({ color: 0xcfe9f5, metalness: 0.55, roughness: 0.3 });
    const p = [
      [at(lathe([[0, -0.3], [0.05, -0.3], [0.068, -0.27], [0.074, -0.2], [0.074, 0.16], [0.06, 0.22], [0.045, 0.24], [0, 0.24]], 22), 0, 0.1, 0), frost], // body
      [at(lathe([[0, 0.22], [0.04, 0.22], [0.04, 0.5], [0.034, 0.52], [0, 0.52]], 18), 0, 0.1, 0), m.gunmetal], // barrel
      [at(lathe([[0.034, 0.5], [0.066, 0.54], [0.08, 0.6], [0.07, 0.66], [0.046, 0.66], [0.03, 0.6]], 22), 0, 0.1, 0), frost], // emitter bell
      [at(new THREE.CircleGeometry(0.036, 20), 0, 0.1, 0.661), lit(0x9fe8ff, 1)],
      [CX(0.03, 0.15, 0, 0.19, 0.03), m.lens], // glass coolant tube on top
      [at(new THREE.CylinderGeometry(0.02, 0.02, 0.135, 14).rotateX(Math.PI / 2), 0, 0.19, 0.03), lit(0x59d9ff, 1)],
      [BX(0.02, 0.014, 0.2, 0, 0.152, 0.03), m.gunmetal],
      [slab([[0.0, 0.05], [-0.05, 0.05], [-0.066, -0.08], [-0.05, -0.1], [-0.004, -0.09], [0.012, 0.05]], 0.036, 0.007), m.polymer], // pistol grip
      [BX(0.05, 0.026, 0.1, 0, 0.042, 0.0), m.gunmetal],
      [slab([[0.2, 0.06], [0.26, 0.06], [0.252, -0.07], [0.205, -0.07]], 0.034, 0.007), m.polymer], // fore grip
      [BX(0.06, 0.034, 0.18, 0, 0.1, -0.33), m.polymer], // stock pad
    ];
    for (let i = 0; i < 5; i++) p.push([at(lathe([[0.04, 0], [0.058, 0.004], [0.058, 0.012], [0.04, 0.016]], 18), 0, 0.1, 0.27 + i * 0.045), frost]); // cooling fins
    for (let i = 0; i < 4; i++) p.push([BX(0.078, 0.012, 0.012, 0, 0.1, -0.2 + i * 0.07), m.iron]);
    return { parts: p, muzzle: [0, 0.1, 0.68], support: [0, 0, 0.23], glow, gauge: [], extras: [] };
  },
  // Gravity Gun: a chunky brass-and-steel gravity cannon. A violet core glows in a glass dome on top, a dish-shaped
  // emitter flares at the muzzle and a studded ring turns around the barrel (the spinner, turned by animateWeapon).
  gravgun() {
    const m = mats(), glow = [];
    const lit = (c, k = 1) => { const x = glowColor(c); glow.push({ m: x, c: new THREE.Color(c), k }); return x; };
    const AY = 0.1, glass = new THREE.MeshStandardMaterial({ color: 0xd8c8ff, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.35 });
    const p = [
      [at(lathe([[0, -0.3], [0.056, -0.3], [0.082, -0.26], [0.088, -0.2], [0.088, 0.16], [0.07, 0.22], [0.05, 0.25], [0, 0.25]], 22), 0, AY, 0), m.brass], // body
      [at(lathe([[0.05, 0.24], [0.05, 0.4], [0.075, 0.44], [0.1, 0.55], [0.115, 0.66], [0.096, 0.66], [0.07, 0.56], [0.05, 0.5]], 26), 0, AY, 0), m.steel], // flared emitter dish
      [at(lathe([[0, 0.5], [0.07, 0.56], [0.095, 0.655], [0, 0.655]], 24), 0, AY, 0), lit(0xb890ff, 3.4)], // glowing well inside the dish
      [at(lathe([[0.088, -0.18], [0.1, -0.17], [0.1, -0.13], [0.088, -0.12]], 22), 0, AY, 0), m.gunmetal], // rear band
      [at(lathe([[0.088, 0.06], [0.1, 0.07], [0.1, 0.11], [0.088, 0.12]], 22), 0, AY, 0), m.gunmetal], // front band
      [at(new THREE.SphereGeometry(0.07, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), 0, AY + 0.075, -0.04), glass], // glass dome
      [at(new THREE.SphereGeometry(0.036, 16, 12), 0, AY + 0.1, -0.04), lit(0x9a5cff, 3.2)], // violet core
      [at(new THREE.SphereGeometry(0.016, 12, 8), 0, AY + 0.1, -0.04), lit(0xf2e8ff, 3.6)],
      [at(new THREE.CylinderGeometry(0.075, 0.08, 0.02, 20), 0, AY + 0.075, -0.04), m.ironGold], // dome collar
      [slab([[0.0, 0.05], [-0.05, 0.05], [-0.066, -0.08], [-0.05, -0.1], [-0.004, -0.09], [0.012, 0.05]], 0.036, 0.007), m.polymer], // pistol grip
      [BX(0.05, 0.026, 0.1, 0, 0.042, 0.0), m.gunmetal],
      [slab([[0.2, 0.06], [0.26, 0.06], [0.252, -0.07], [0.205, -0.07]], 0.034, 0.007), m.polymer], // fore grip
      [BX(0.06, 0.04, 0.18, 0, AY, -0.34), m.polymer], // stock pad
    ];
    for (const sx of [-1, 1]) {
      p.push([at(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 10).rotateX(Math.PI / 2), sx * 0.082, AY - 0.02, 0.08), m.ironGold]); // brass feed pipes along the flanks
      p.push([at(new THREE.SphereGeometry(0.022, 10, 8), sx * 0.082, AY - 0.02, 0.25), m.brass]);
      p.push([at(new THREE.CircleGeometry(0.03, 14).rotateY(sx * Math.PI / 2), sx * 0.0885, AY + 0.03, -0.18), lit(0xb890ff, 2.2)]); // side indicator lamps
    }
    for (let i = 0; i < 4; i++) p.push([BX(0.1, 0.012, 0.012, 0, AY, -0.16 + i * 0.07), m.iron]);
    // The ring: a brass torus with eight steel studs, spinning around the barrel.
    const ring = [[new THREE.TorusGeometry(0.108, 0.013, 10, 32), m.brass]];
    for (let k = 0; k < 8; k++) ring.push([at(new THREE.BoxGeometry(0.03, 0.03, 0.03), Math.cos(k * Math.PI / 4) * 0.108, Math.sin(k * Math.PI / 4) * 0.108, 0), k % 2 ? m.steel : m.gunmetal]);
    return { parts: p, spinner: { parts: ring, at: [0, AY, 0.4] }, idleSpin: 1.7, muzzle: [0, AY, 0.68], support: [0, 0, 0.23], glow, gauge: [], extras: [] };
  },
  // Turret Pack: the sentry folded down to a carry case (the planted version is src/drone.js).
  turret() {
    const t = makeTurret();
    t.userData.gun.rotation.set(0, 0, 0);
    t.scale.setScalar(0.34);
    t.updateMatrixWorld(true);
    const P = [];
    t.traverse((o) => { if (o.isMesh && o.material.opacity !== 0.28) P.push([o.geometry.clone().applyMatrix4(o.matrixWorld).rotateY(Math.PI / 2), o.material]); });
    return { parts: P.map(([g, m]) => [g.translate(0, 0.09, 0.05), m]), muzzle: [0, 0.2, 0.3], support: [0, 0.04, 0.14], cardRoll: 0.5 };
  },
});

// ---------- melee ----------
// Blades lie flat: width along X, thickness along Y, tip along +Z. The cutting edge of single-edged
// weapons faces +X, the side that leads the in-hand sweep.
function sword() {
  const m = mats(), P = [];
  // Blade: tapered double-edged blade with ground bevels, a fuller and a hard point.
  const S = [[0.10, 0.034, 0.0075, 0], [0.125, 0.034, 0.0075, 0], [0.17, 0.0335, 0.0075, 0.0055], [0.30, 0.033, 0.007, 0.0075], [0.55, 0.030, 0.006, 0.0065], [0.75, 0.0255, 0.0048, 0.0045], [0.84, 0.0195, 0.0033, 0.0012], [0.885, 0.012, 0.002, 0], [0.915, 0.0055, 0.001, 0], [0.93, 0, 0, 0]];
  P.push(...bladeParts(S.map((s) => s[0]), S.map(([, w, t, fw]) => ringD(w, t, w * 0.3, fw, Math.min(0.0026, t * 0.4))), TAG_D, m));
  // Crossguard: dark iron bar drooping toward the grip, brass boss and ball terminals.
  P.push([sweep([[-0.17, 0, 0.066], [-0.09, 0, 0.079], [0, 0, 0.087], [0.09, 0, 0.079], [0.17, 0, 0.066]], [0.0075, 0.0105, 0.013, 0.0105, 0.0075], 10), m.iron]);
  P.push([at(new THREE.SphereGeometry(0.0108, 10, 8), -0.172, 0, 0.065), m.brass], [at(new THREE.SphereGeometry(0.0108, 10, 8), 0.172, 0, 0.065), m.brass]);
  P.push([lathe([[0, 0.066], [0.0185, 0.066], [0.026, 0.074], [0.027, 0.092], [0.021, 0.104], [0.016, 0.106], [0, 0.106]], 14), m.brass]);
  // Leather-wrapped grip with a visible spiral of strap, brass ferrule and wheel pommel.
  wrapped(P, -0.12, 0.068, [[-0.12, 0.0135], [-0.07, 0.0172], [0, 0.0182], [0.04, 0.0168], [0.068, 0.015]], m.leather, m.cord, 13);
  P.push([lathe([[0, 0.062], [0.0165, 0.062], [0.0198, 0.066], [0.0198, 0.072], [0, 0.072]], 14), m.brass]);
  P.push([lathe([[0, -0.168], [0.012, -0.168], [0.024, -0.158], [0.029, -0.145], [0.027, -0.13], [0.018, -0.123], [0.0165, -0.122], [0, -0.122]], 16), m.brass]);
  P.push([lathe([[0, -0.178], [0.008, -0.178], [0.009, -0.168], [0, -0.168]], 8), m.brass]);
  return { parts: P, reach: 0.93, support: null, twoHanded: false };
}

function katana() {
  const m = mats(), P = [];
  // Curved single-edged blade: broad polished edge strip (the hamon line), bo-hi groove, kissaki tip.
  const S = [ // z, xs (spine), xe (edge), t, fuller half-width
    [0.09, -0.0145, 0.0145, 0.0055, 0], [0.11, -0.0145, 0.0145, 0.0055, 0.0025], [0.30, -0.0145, 0.0142, 0.0054, 0.003],
    [0.50, -0.0142, 0.0132, 0.0052, 0.003], [0.64, -0.0135, 0.0118, 0.005, 0.0022], [0.71, -0.0128, 0.0095, 0.0045, 0],
    [0.755, -0.011, 0.0055, 0.0034, 0], [0.785, -0.0085, -0.0005, 0.002, 0], [0.80, -0.0055, -0.0055, 0, 0]];
  const sori = (z) => -0.034 * Math.pow(Math.max(0, z - 0.09) / 0.71, 2); // tip curves toward the spine
  const zs = S.map((s) => s[0]);
  const rings = S.map(([z, xs, xe, t, fw]) => ringS(xe + sori(z), xs + sori(z), t, Math.min((xe - xs) * 0.42, 0.012), (xs + (xe - xs) * 0.32) + sori(z), fw, Math.min(0.0016, t * 0.35), 0.0016));
  P.push(...bladeParts(zs, rings, TAG_S, m, m.steel));
  // Brass habaki collar, round iron tsuba with a brass seppa, iron fuchi and kashira.
  P.push([lathe([[0, 0.07], [0.0165, 0.07], [0.0175, 0.074], [0.0165, 0.118], [0.0145, 0.124], [0, 0.124]], 14), m.brass]);
  P.push([lathe([[0, 0.058], [0.05, 0.058], [0.0535, 0.0615], [0.0535, 0.0665], [0.05, 0.07], [0, 0.07]], 28), m.iron]);
  P.push([lathe([[0, 0.052], [0.021, 0.052], [0.022, 0.058], [0, 0.058]], 14), m.brass]);
  P.push([lathe([[0, 0.04], [0.0178, 0.04], [0.019, 0.044], [0.019, 0.052], [0, 0.052]], 14), m.iron]);
  P.push([lathe([[0, -0.255], [0.014, -0.255], [0.0195, -0.248], [0.02, -0.236], [0.0185, -0.226], [0, -0.226]], 14), m.iron]);
  // Tsuka: ray skin showing through a criss-cross red braid.
  wrapped(P, -0.232, 0.044, [[-0.232, 0.0155], [-0.12, 0.0172], [0, 0.0178], [0.044, 0.0165]], m.ray, m.ito, 9, 0.0034, true);
  for (const z of [-0.12, -0.03]) P.push([at(new THREE.SphereGeometry(0.0055, 8, 6).scale(1.6, 1, 1), 0.0, 0.0182, z), m.brass], [at(new THREE.SphereGeometry(0.0055, 8, 6).scale(1.6, 1, 1), 0.0, -0.0182, z), m.brass]); // menuki
  return { parts: P, reach: 0.8, support: [0, 0, -0.11], twoHanded: true };
}

function knife() {
  const m = mats(), P = [];
  // Clip-point fighting knife: straight spine, curved belly, ground edge bevel, short fuller.
  const S = [ // z, xs, xe, t, fuller half-width
    [0.058, -0.0185, 0.0185, 0.0048, 0], [0.078, -0.0185, 0.0245, 0.0048, 0], [0.12, -0.0185, 0.0268, 0.0048, 0.0042],
    [0.20, -0.0185, 0.0275, 0.0048, 0.0045], [0.27, -0.0185, 0.0255, 0.0046, 0.0035], [0.315, -0.0135, 0.0205, 0.0042, 0],
    [0.355, -0.0045, 0.0125, 0.003, 0], [0.385, 0.0035, 0.0075, 0.0016, 0], [0.405, 0.0055, 0.0055, 0, 0]];
  P.push(...bladeParts(S.map((s) => s[0]), S.map(([, xs, xe, t, fw]) => ringS(xe, xs, t, Math.min(0.009, (xe - xs) * 0.3), xs + (xe - xs) * 0.36, fw, 0.0016, 0.0015)), TAG_S, m));
  // Partial tang with walnut scales, brass pins and a brass guard; lanyard loop at the butt.
  P.push([plate([[-0.09, -0.011], [-0.09, 0.011], [0.058, 0.0185], [0.058, -0.0185]], 0.007, 0.001), m.steel]);
  const outline = [[-0.093, -0.0135], [-0.093, 0.0135], [-0.07, 0.0185], [-0.02, 0.0198], [0.02, 0.0175], [0.054, 0.0198], [0.054, -0.0198], [0.02, -0.0175], [-0.02, -0.0198], [-0.07, -0.0185]];
  P.push([at(plate(outline, 0.011, 0.0025), 0, 0.0085, 0), m.wood], [at(plate(outline, 0.011, 0.0025), 0, -0.0085, 0), m.wood]);
  for (const z of [-0.07, -0.025, 0.022]) P.push([at(cyl(0.0038, 0.0038, 0.031, 10).rotateX(-Math.PI / 2), 0, 0, z), m.brass]);
  P.push([plate([[0.05, -0.03], [0.05, 0.03], [0.064, 0.025], [0.064, -0.025]], 0.024, 0.003), m.brass]);
  P.push([at(new THREE.TorusGeometry(0.011, 0.0022, 6, 14).rotateY(Math.PI / 2), 0, 0, -0.104), m.cord]);
  return { parts: P, reach: 0.405, support: null, twoHanded: false };
}

function spear() {
  const m = mats(), P = [];
  // Ash haft, leather-wrapped grip, iron butt spike.
  P.push([grainAlong(lathe([[0, -0.4], [0.0175, -0.4], [0.0175, 1.45], [0, 1.45]], 12)), m.wood]);
  wrapped(P, -0.1, 0.2, [[-0.1, 0.0195], [0.2, 0.0195]], m.leather, m.cord, 9, 0.003);
  P.push([lathe([[0, -0.43], [0.0035, -0.415], [0.014, -0.385], [0.0215, -0.36], [0.0215, -0.335], [0.0185, -0.33], [0, -0.33]], 10), m.iron]);
  P.push([lathe([[0, 0.2], [0.0225, 0.2], [0.0235, 0.206], [0.0225, 0.212], [0, 0.212]], 12), m.brass]);
  // Iron langets running down the haft from the socket, riveted.
  for (const sx of [-1, 1]) {
    P.push([at(new THREE.BoxGeometry(0.0045, 0.012, 0.27), sx * 0.0195, 0, 1.285), m.iron]);
    for (const z of [1.19, 1.25, 1.31, 1.37]) P.push([at(new THREE.SphereGeometry(0.0042, 6, 4), sx * 0.0212, 0, z), m.brass]);
  }
  // Tapered socket with two brass bands.
  P.push([lathe([[0, 1.4], [0.0225, 1.4], [0.0245, 1.425], [0.0245, 1.46], [0.0215, 1.51], [0.0155, 1.57], [0.0135, 1.6], [0, 1.6]], 14), m.iron]);
  P.push([lathe([[0, 1.435], [0.0262, 1.435], [0.0268, 1.442], [0.0262, 1.449], [0, 1.449]], 14), m.brass]);
  P.push([lathe([[0, 1.523], [0.0215, 1.523], [0.022, 1.529], [0.0215, 1.535], [0, 1.535]], 14), m.brass]);
  // Leaf-shaped blade: widest about a third of the way up, long concave run to a needle point, central ridge.
  const L = 0.35, W = 0.04, z0 = 1.58;
  const ss = [0, 0.04, 0.1, 0.18, 0.28, 0.4, 0.52, 0.64, 0.76, 0.86, 0.93, 0.97, 1];
  const wf = (s) => W * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.62)), 0.8);
  P.push(...bladeParts(ss.map((s) => z0 + L * s), ss.map((s) => { const w = wf(s); return ringX(w, 0.0085 * (1 - s * s), w * 0.4); }), TAG_X, m));
  return { parts: P, reach: 1.95, support: [0, 0, 0.5], twoHanded: true };
}

function axe() {
  const m = mats(), P = [];
  // Ash haft with swelled butt, leather-wrapped lower grip, iron butt cap, collar and langets with rivets.
  P.push([grainAlong(lathe([[0, -0.108], [0.0205, -0.108], [0.0215, -0.09], [0.0185, 0.0], [0.0175, 0.3], [0.0175, 0.76], [0, 0.76]], 12)), m.wood]);
  wrapped(P, -0.09, 0.24, [[-0.09, 0.0225], [0, 0.0205], [0.24, 0.0195]], m.leather, m.cord, 12, 0.003);
  P.push([lathe([[0, -0.125], [0.0185, -0.125], [0.0245, -0.112], [0.0245, -0.095], [0.0225, -0.09], [0, -0.09]], 14), m.iron]);
  P.push([lathe([[0, 0.24], [0.0215, 0.24], [0.0225, 0.246], [0.0215, 0.252], [0, 0.252]], 14), m.brass]);
  P.push([lathe([[0, 0.3], [0.0215, 0.3], [0.0228, 0.306], [0.0215, 0.312], [0, 0.312]], 14), m.iron]);
  for (const sy of [-1, 1]) {
    P.push([at(new THREE.BoxGeometry(0.017, 0.005, 0.3), 0, sy * 0.0205, 0.445), m.iron]);
    for (const z of [0.34, 0.4, 0.46, 0.52]) P.push([at(new THREE.SphereGeometry(0.0046, 6, 4), 0, sy * 0.0238, z), m.brass]);
  }
  // Steel head: thick eye block thinning to a wide polished edge, bearded toe and heel.
  const S = [ // z, xs (back of the cheek), xe (edge), half-thickness at the back
    [0.395, 0.2, 0.2, 0], [0.42, 0.14, 0.275, 0.005], [0.46, 0.1, 0.268, 0.01], [0.52, 0.04, 0.23, 0.015],
    [0.585, -0.032, 0.2, 0.021], [0.625, -0.032, 0.19, 0.021], [0.67, -0.032, 0.188, 0.021], [0.715, -0.032, 0.198, 0.021],
    [0.75, -0.01, 0.224, 0.017], [0.79, 0.03, 0.25, 0.011], [0.83, 0.07, 0.268, 0.006], [0.86, 0.19, 0.24, 0]];
  P.push(...bladeParts(S.map((s) => s[0]), S.map(([, xs, xe, ts]) => ringA(xs, xe, ts, ts * 0.45, ts > 0 ? 0.0035 : 0, Math.min(0.022, (xe - xs) * 0.4))), TAG_A, m));
  // Back spike on the poll and a spike on top of the haft.
  P.push([at(new THREE.ConeGeometry(0.03, 0.09, 4).rotateY(Math.PI / 4).rotateZ(Math.PI / 2), -0.077, 0, 0.67), m.steel]);
  P.push([lathe([[0, 0.735], [0.0235, 0.735], [0.0238, 0.75], [0.0165, 0.775], [0.008, 0.84], [0, 0.885]], 12), m.steel]);
  return { parts: P, reach: 0.86, support: [0, 0, 0.166], twoHanded: true };
}

function warhammer() {
  const m = mats(), P = [];
  P.push([grainAlong(lathe([[0, -0.108], [0.0205, -0.108], [0.0215, -0.09], [0.0185, 0.0], [0.0175, 0.3], [0.0175, 0.82], [0, 0.82]], 12)), m.wood]);
  wrapped(P, -0.09, 0.26, [[-0.09, 0.0225], [0, 0.0205], [0.26, 0.0195]], m.leather, m.cord, 13, 0.003);
  P.push([lathe([[0, -0.125], [0.0185, -0.125], [0.0245, -0.112], [0.0245, -0.095], [0.0225, -0.09], [0, -0.09]], 14), m.iron]);
  P.push([lathe([[0, 0.26], [0.0215, 0.26], [0.0225, 0.266], [0.0215, 0.272], [0, 0.272]], 14), m.brass]);
  for (const sy of [-1, 1]) {
    P.push([at(new THREE.BoxGeometry(0.018, 0.005, 0.5), 0, sy * 0.0205, 0.55), m.iron]);
    for (const z of [0.36, 0.44, 0.52, 0.6, 0.68, 0.76]) P.push([at(new THREE.SphereGeometry(0.0046, 6, 4), 0, sy * 0.0238, z), m.brass]);
  }
  // Head: steel body with a polished striking face, a back pick and a top spike.
  P.push([plate([[0.78, -0.034], [0.78, 0.068], [0.87, 0.068], [0.87, -0.034]], 0.072, 0.009), m.iron]);
  P.push([plate([[0.775, 0.066], [0.775, 0.1], [0.875, 0.1], [0.875, 0.066]], 0.08, 0.007), m.edge]);
  for (const z of [0.795, 0.855]) for (const x of [0.082]) for (const sy of [-1, 1]) P.push([at(new THREE.SphereGeometry(0.0055, 6, 4), x, sy * 0.034, z), m.brass]);
  P.push([at(new THREE.ConeGeometry(0.034, 0.17, 4).rotateY(Math.PI / 4).rotateZ(Math.PI / 2), -0.119, 0, 0.825), m.steel]);
  P.push([lathe([[0, 0.865], [0.021, 0.865], [0.021, 0.88], [0.013, 0.93], [0, 0.99]], 4), m.steel]);
  P.push([lathe([[0, 0.77], [0.032, 0.77], [0.034, 0.777], [0.032, 0.784], [0, 0.784]], 16), m.brass]);
  P.push([lathe([[0, 0.36], [0.0215, 0.36], [0.0228, 0.366], [0.0215, 0.372], [0, 0.372]], 14), m.iron]);
  return { parts: P, reach: 0.9, support: [0, 0, 0.35], twoHanded: true };
}

// Claws: the first fist weapon. One object holds both fists (right at x = -FIST, left at +FIST, weapon
// space x = the wearer's left), each a vertical knuckle bar with three long blades pointing along +Z, and the
// character holds it with a punching grip (see CharacterRig). `fist` are the two grip points, `swipe` the
// blade spans the swing trail follows.
// Every melee weapon shares one swing: the swipe trail spans this stretch of the cut in front of the grip (the War Spear's span).
const SWIPE_BASE = 0.9, SWIPE_TIP = 1.95;
const FIST = 0.2;
function claws() {
  const m = mats(), P = [];
  const S = [[0, -0.0125, 0.0125, 0.0058], [0.12, -0.0125, 0.0125, 0.0058], [0.3, -0.0105, 0.0105, 0.0052], [0.42, -0.007, 0.007, 0.0038], [0.49, -0.003, 0.003, 0.002], [0.52, 0, 0, 0]];
  for (const x of [-FIST, FIST]) {
    // Knuckle bar with a leather wrap, a plate across the knuckles and brass sockets the blades slide out of.
    P.push([at(new THREE.CylinderGeometry(0.0125, 0.0125, 0.19, 14), x, 0, -0.012), m.iron]);
    P.push([at(new THREE.CylinderGeometry(0.0165, 0.0165, 0.11, 14), x, 0, -0.012), m.leather]);
    for (const sy of [-1, 1]) P.push([at(new THREE.CylinderGeometry(0.0205, 0.0205, 0.012, 14), x, sy * 0.058, -0.012), m.brass]);
    P.push([at(new THREE.BoxGeometry(0.034, 0.135, 0.032), x, 0, 0.026), m.gunmetal]);
    for (const k of [-1, 0, 1]) {
      P.push([at(cyl(0.0145, 0.0145, 0.026, 12), x, k * 0.036, 0.05), m.brass]);
      for (const [g, mm] of bladeParts(S.map((r) => r[0]), S.map(([, xs, xe, t]) => ringS(xe, xs, t, Math.min(0.006, (xe - xs) * 0.3), 0, 0, 0, 0.0015)), TAG_S, m)) {
        g.rotateX(-k * 0.045); at(g, x, k * 0.036, 0.062); P.push([g, m.steel]); // plain satin steel throughout: the mirror edge strip glares under bloom up close
      }
    }
  }
  return { parts: P, reach: 0.58, support: null, twoHanded: false, fist: [[-FIST, 0, -0.012], [FIST, 0, -0.012]], swipe: [[[-FIST, 0, SWIPE_BASE], [-FIST, 0, SWIPE_TIP]], [[FIST, 0, SWIPE_BASE], [FIST, 0, SWIPE_TIP]]] };
}

// Zombie Staff: a necromancer's reliquary staff held upright like a walking stick. Oak shaft bound in iron and leather,
// an iron-shod butt, and a forged cage of curved prongs around a green soul-stone, with a hanging skull charm and bone fetish.
function zombiestaff() {
  const m = mats(), P = [];
  const oak = new THREE.MeshStandardMaterial({ map: grainTexture('#4b3220', '#1a0e06', 90), roughness: 0.6, metalness: 0 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xd8d0b4, roughness: 0.72 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x6a3a2a, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  const soul = new THREE.MeshBasicMaterial({ color: 0x7dff5a, toneMapped: false });
  const soulHalo = new THREE.MeshBasicMaterial({ color: 0x3fd01c, transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false });
  const iron = m.gunmetal, rust = m.iron;
  // shaft: slightly knotted oak, thicker above the grip
  P.push([grainAlong(lathe([[0.0, -0.95], [0.018, -0.95], [0.021, -0.5], [0.022, 0.0], [0.024, 0.5], [0.027, 0.9], [0.03, 1.0], [0, 1.0]], 14)), oak]);
  // iron-shod butt: ferrule, band and a spike
  P.push([lathe([[0.0, -1.0], [0.012, -1.0], [0.03, -0.96], [0.034, -0.86], [0.03, -0.84], [0.0, -0.84]], 14), iron]);
  P.push([lathe([[0.0, -1.04], [0.013, -0.97], [0.0, -0.95]], 10), iron]);
  for (const z of [-0.64, -0.3, 0.42, 0.72]) P.push([lathe([[0.02, z - 0.012], [0.032, z - 0.01], [0.032, z + 0.01], [0.02, z + 0.012]], 14), rust]);
  // leather-wrapped grip
  P.push([lathe([[0.022, -0.2], [0.03, -0.19], [0.03, 0.17], [0.022, 0.18]], 14), m.leather]);
  P.push([helix(-0.19, 0.17, () => 0.0305, 9, 0.0035), m.cord]);
  // crown collar where the head sits, then four forged prongs bowing out and curling in over the stone
  P.push([lathe([[0.024, 0.98], [0.05, 1.0], [0.058, 1.04], [0.05, 1.07], [0.03, 1.08]], 16), iron]);
  P.push([lathe([[0.056, 1.03], [0.062, 1.035], [0.062, 1.05], [0.056, 1.055]], 16), m.brass]);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4, c = Math.cos(a), sn = Math.sin(a);
    const pr = (r, z) => [c * r, sn * r, z];
    P.push([sweep([pr(0.05, 1.07), pr(0.095, 1.14), pr(0.108, 1.24), pr(0.09, 1.34), pr(0.05, 1.4), pr(0.012, 1.44)], [0.011, 0.012, 0.011, 0.009, 0.007, 0.003], 7), iron]);
    P.push([at(new THREE.SphereGeometry(0.014, 8, 6), c * 0.0, sn * 0.0, 1.45), rust]);
  }
  for (const z of [1.17, 1.3]) { P.push([lathe([[0.097 + (z - 1.17) * 0.0, z], [0.101, z + 0.004], [0.097, z + 0.008]], 20).scale(1.12, 1.12, 1), m.brass]); }
  // the soul-stone in the cage, and its halo
  P.push([at(new THREE.OctahedronGeometry(0.058, 1).scale(0.9, 0.9, 1.35), 0, 0, 1.24), soul]);
  P.push([at(new THREE.SphereGeometry(0.095, 14, 10).scale(1, 1, 1.25), 0, 0, 1.24), soulHalo]);
  // skull charm on a short chain below the cage, and a bone fetish
  for (let k = 0; k < 4; k++) P.push([at(new THREE.TorusGeometry(0.009, 0.0032, 6, 8).rotateY(k % 2 ? 0 : Math.PI / 2), 0.05, 0, 0.93 - k * 0.018), rust]);
  P.push([at(new THREE.SphereGeometry(0.036, 12, 10).scale(1, 0.95, 1.05), 0.05, 0, 0.84), bone]);
  P.push([at(new THREE.BoxGeometry(0.036, 0.026, 0.02), 0.05, 0.008, 0.808), bone]);
  for (const x of [0.04, 0.06]) P.push([at(new THREE.SphereGeometry(0.0085, 8, 6), x, 0.031, 0.848), m.slot]);
  // bone talisman knotted under the collar
  P.push([rod([-0.03, 0.02, 0.9], [-0.03, 0.02, 0.76], 0.007, 6), bone]);
  P.push([rod([-0.04, 0.02, 0.8], [-0.02, 0.02, 0.8], 0.006, 6), bone]);
  return { parts: P, reach: 1.45, support: null, twoHanded: false, cane: true, swipe: [[[0, 0, 0.9], [0, 0, 1.45]]] };
}

// Healing Staff: an ivory shaft twined with gold wire and held upright like a cane. A white-gold crystal floats in a
// cradle of gold prongs between a pair of feathered wings (the crystal is the muzzle: the heal beams start from it).
function healstaff() {
  const m = mats(), P = [];
  const ivory = new THREE.MeshStandardMaterial({ color: 0xf2ead6, roughness: 0.38, metalness: 0.05, emissive: 0x2a2418 });
  const plume = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.5, emissive: 0x3a3426, side: THREE.DoubleSide });
  const gold = m.ironGold;
  const gem = new THREE.MeshBasicMaterial({ color: 0xfff6d0, toneMapped: false });
  const halo = new THREE.MeshBasicMaterial({ color: 0xffd870, transparent: true, opacity: 0.32, toneMapped: false, depthWrite: false });
  // shaft: slim ivory, thicker at the grip and just under the head, with a gold wire spiralling up it
  P.push([lathe([[0.0, -0.95], [0.016, -0.95], [0.02, -0.5], [0.022, 0.0], [0.024, 0.5], [0.026, 0.9], [0.03, 1.0], [0, 1.0]], 16), ivory]);
  P.push([helix(-0.5, 0.92, (z) => 0.0245 + (z + 0.5) * 0.0006, 7, 0.0032, 1), gold]);
  // gold-shod butt with a small orb, and rings along the shaft
  P.push([lathe([[0.0, -1.0], [0.012, -1.0], [0.028, -0.96], [0.032, -0.86], [0.028, -0.84], [0.0, -0.84]], 14), gold]);
  P.push([at(new THREE.SphereGeometry(0.02, 10, 8), 0, 0, -1.02), gold]);
  for (const z of [-0.7, 0.5, 0.74]) P.push([lathe([[0.02, z - 0.012], [0.032, z - 0.01], [0.032, z + 0.01], [0.02, z + 0.012]], 16), gold]);
  // pale leather grip
  P.push([lathe([[0.022, -0.2], [0.03, -0.19], [0.03, 0.17], [0.022, 0.18]], 14), m.cord]);
  // collar under the head
  P.push([lathe([[0.024, 0.98], [0.05, 1.0], [0.058, 1.04], [0.05, 1.07], [0.03, 1.1]], 18), gold]);
  P.push([lathe([[0.056, 1.03], [0.062, 1.035], [0.062, 1.05], [0.056, 1.055]], 18), ivory]);
  // three gold prongs bow out and curl in under the crystal
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2, c = Math.cos(a), sn = Math.sin(a);
    const pr = (r, z) => [c * r, sn * r, z];
    P.push([sweep([pr(0.045, 1.09), pr(0.08, 1.13), pr(0.085, 1.2), pr(0.065, 1.27), pr(0.03, 1.3)], [0.01, 0.011, 0.009, 0.007, 0.003], 7), gold]);
  }
  // the crystal: a long white-gold diamond with a halo
  P.push([at(new THREE.OctahedronGeometry(0.052, 0).scale(0.85, 0.85, 1.7), 0, 0, 1.2), gem]);
  P.push([at(new THREE.SphereGeometry(0.09, 14, 10).scale(1, 1, 1.4), 0, 0, 1.2), halo]);
  // a pair of wings sweeping out and up from the cradle: a gold spine and fanned feathers
  for (const sx of [-1, 1]) {
    P.push([sweep([[sx * 0.05, 0, 1.1], [sx * 0.15, 0, 1.15], [sx * 0.26, 0, 1.28], [sx * 0.3, 0, 1.43]], [0.008, 0.009, 0.007, 0.004], 7), gold]);
    const fan = [[0.1, 0.2], [0.34, 0.26], [0.58, 0.3], [0.82, 0.28], [1.06, 0.24], [1.3, 0.2]];
    fan.forEach(([phi, l], k) => {
      const base = [sx * (0.07 + k * 0.012), 0, 1.11 + k * 0.045];
      const dir = [sx * Math.cos(phi), 0, Math.sin(phi)];
      const g = new THREE.SphereGeometry(1, 8, 6).scale(l / 2, 0.006, 0.026).rotateY(sx > 0 ? -phi : Math.PI + phi);
      P.push([at(g, base[0] + dir[0] * l / 2, 0, base[2] + dir[2] * l / 2), plume]);
    });
    P.push([at(new THREE.SphereGeometry(0.014, 8, 6), sx * 0.3, 0, 1.44), gold]);
  }
  return { parts: P, reach: 1.2, support: null, twoHanded: false, cane: true, swipe: [[[0, 0, 0.9], [0, 0, 1.3]]] };
}

// Bare hands: nothing to draw, just the two fists that throw the punches.
function bare() {
  return { parts: [], reach: 0.5, support: null, twoHanded: false, fist: [[-FIST, 0, -0.012], [FIST, 0, -0.012]], swipe: [[[-FIST, 0, SWIPE_BASE], [-FIST, 0, SWIPE_TIP]], [[FIST, 0, SWIPE_BASE], [FIST, 0, SWIPE_TIP]]] };
}


// Modern melee: a baseball bat, a chainsaw and a bullwhip.
// How each weapon is swung: thrust (stabs out), whip (lash), smash (overhead), chop (overhead, a little aslant); anything else cuts across.
const STYLE = { knife: 'thrust', spear: 'thrust', whip: 'whip', warhammer: 'smash', chainsaw: 'thrust', axe: 'chop', fireaxe: 'chop', sledge: 'smash' };
export function bat() {
  const m = mats(), P = [];
  P.push([grainAlong(lathe([[0, -0.03], [0.026, -0.03], [0.026, -0.015], [0.0165, 0.0], [0.0155, 0.2], [0.019, 0.42], [0.028, 0.6], [0.0335, 0.72], [0.033, 0.82], [0.026, 0.9], [0.012, 0.935], [0, 0.94]], 16)), m.wood]);
  wrapped(P, 0.0, 0.22, [[0.0, 0.0172], [0.22, 0.0168]], m.leather, m.cord, 10, 0.003);
  return { parts: P, reach: 0.94, support: null, twoHanded: false };
}
function chainsaw() {
  const m = mats(), P = [];
  const orange = new THREE.MeshStandardMaterial({ color: 0xd8601a, metalness: 0.2, roughness: 0.5 });
  // Engine housing and rear handle (the grip sits at the origin), front handle bar, then the guide bar and chain out front.
  P.push([at(new THREE.BoxGeometry(0.13, 0.17, 0.3), 0, 0.02, 0.17), orange]);
  P.push([at(new THREE.BoxGeometry(0.12, 0.04, 0.18), 0, 0.12, 0.12), m.polymer]);
  P.push([lathe([[0, -0.1], [0.017, -0.1], [0.017, 0.12], [0, 0.12]], 8), m.polymer]);
  P.push([at(new THREE.BoxGeometry(0.03, 0.05, 0.14), 0, -0.1, 0.0), m.polymer]);
  const hb = new THREE.CatmullRomCurve3([V3(0, 0.08, 0.1), V3(0, 0.2, 0.17), V3(0, 0.2, 0.3), V3(0, 0.1, 0.34)]);
  P.push([new THREE.TubeGeometry(hb, 10, 0.012, 6), m.polymer]);
  P.push([at(new THREE.CylinderGeometry(0.045, 0.045, 0.14, 12).rotateZ(Math.PI / 2), 0, 0.0, 0.34), m.gunmetal]); // clutch drum
  P.push([at(new THREE.BoxGeometry(0.02, 0.1, 0.72), 0, 0.0, 0.72), m.steelDark]);                                  // guide bar
  P.push([at(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 14).rotateZ(Math.PI / 2), 0, 0.0, 1.08), m.steelDark]);    // rounded nose
  for (let i = 0; i < 26; i++) { // chain teeth along the top and bottom edges and round the nose
    const z = 0.38 + i * 0.0275;
    P.push([at(new THREE.BoxGeometry(0.03, 0.016, 0.014), 0, 0.054, z), m.steel]);
    P.push([at(new THREE.BoxGeometry(0.03, 0.016, 0.014), 0, -0.054, z), m.steel]);
  }
  for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i / 5) * Math.PI; P.push([at(new THREE.BoxGeometry(0.03, 0.016, 0.014), 0, Math.cos(a) * 0.056, 1.08 + Math.sin(a) * 0.056), m.steel]); }
  return { parts: P, reach: 1.1, support: [0, 0.12, 0.3], twoHanded: true, swipe: [[[0, 0, 0.6], [0, 0, 1.15]]] };
}
function whip() {
  const m = mats(), P = [];
  wrapped(P, -0.12, 0.2, [[-0.12, 0.016], [0.2, 0.0165]], m.leather, m.cord, 12, 0.003);
  P.push([lathe([[0, -0.13], [0.019, -0.13], [0.019, -0.12], [0, -0.12]], 10), m.brass]);
  return { parts: P, rope: true, reach: 2.55, support: null, twoHanded: false, swipe: [[[0, 0, 1.2], [0, 0, 2.5]]] };
}


// Bullwhip cord: a verlet rope simulated in world space and drawn as a tube in the weapon's own frame, so it hangs,
// sways and trails behind the hand like a real whip. At rest (and after a lash) it is pulled into loose coils; during a
// swing (userData.lash, 0..1, set by the character animation) it is pulled out straight, stiffest at the handle so the
// tip lags and cracks. Only the look changes: the hit range is still the weapon's `range`.
const ROPE_N = 48, ROPE_L = 2.35, ROPE_SIDES = 7, ROPE_R0 = 0.0105, ROPE_R1 = 0.0042;
const ropeSm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const ropeExt = (m) => (m <= 0 ? 0 : m < 0.28 ? 0.35 * ropeSm(m / 0.28) : m < 0.5 ? 0.35 + 0.65 * ropeSm((m - 0.28) / 0.22) : m < 0.7 ? 1 : 1 - ropeSm((m - 0.7) / 0.3));
const ROPE_COIL = [], ROPE_LINE = [];
for (let k = 0; k < ROPE_N; k++) {
  const sN = k / (ROPE_N - 1), r = 0.115, th = sN * ROPE_L / r * 0.97;
  ROPE_COIL.push(V3(r * Math.sin(th), -0.04 - sN * 0.34, 0.2 + r * (1 - Math.cos(th))));
  ROPE_LINE.push(V3(Math.sin(sN * Math.PI * 2) * 0.03, 0, 0.2 + sN * ROPE_L));
}
function ropeMesh(mat) {
  const N = ROPE_N, S = ROPE_SIDES, pos = new Float32Array(N * S * 3), nor = new Float32Array(N * S * 3), idx = [];
  for (let k = 0; k < N - 1; k++) for (let j = 0; j < S; j++) {
    const a = k * S + j, b = k * S + (j + 1) % S, c = (k + 1) * S + j, d = (k + 1) * S + (j + 1) % S;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(N * S * 2), 2));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.castShadow = true;
  const P = ROPE_COIL.map((v) => v.clone()), L = ROPE_COIL.map((v) => v.clone()), prev = ROPE_COIL.map((v) => v.clone());
  const wp = ROPE_COIL.map((v) => v.clone()), wprev = ROPE_COIL.map((v) => v.clone()), tg = new THREE.Vector3(), inv = new THREE.Matrix4();
  const T = new THREE.Vector3(), Nn = new THREE.Vector3(), B = new THREE.Vector3(), tmp = new THREE.Vector3();
  let live = false, last = 0;
  const writeGeo = (pts) => { // sweep the tube along pts (local space) with parallel-transport frames
    for (let k = 0; k < N; k++) {
      T.subVectors(pts[Math.min(k + 1, N - 1)], pts[Math.max(k - 1, 0)]).normalize();
      if (k === 0) { Nn.set(0, 1, 0); if (Math.abs(T.y) > 0.95) Nn.set(1, 0, 0); Nn.addScaledVector(T, -Nn.dot(T)).normalize(); }
      else { Nn.addScaledVector(T, -Nn.dot(T)); if (Nn.lengthSq() < 1e-8) Nn.set(1, 0, 0).addScaledVector(T, -T.x); Nn.normalize(); }
      B.crossVectors(T, Nn);
      const rad = ROPE_R0 + (ROPE_R1 - ROPE_R0) * (k / (N - 1));
      for (let j = 0; j < S; j++) {
        const ph = (j / S) * Math.PI * 2, c = Math.cos(ph), sn = Math.sin(ph), o = (k * S + j) * 3;
        tmp.set(Nn.x * c + B.x * sn, Nn.y * c + B.y * sn, Nn.z * c + B.z * sn);
        nor[o] = tmp.x; nor[o + 1] = tmp.y; nor[o + 2] = tmp.z;
        pos[o] = pts[k].x + tmp.x * rad; pos[o + 1] = pts[k].y + tmp.y * rad; pos[o + 2] = pts[k].z + tmp.z * rad;
      }
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.normal.needsUpdate = true;
  };
  writeGeo(ROPE_COIL);
  mesh.onBeforeRender = () => {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000);
    if (last && now - last < 3) return; // already stepped for this frame (second viewport, extra pass)
    const par = mesh.parent;
    if (!par) return;
    par.updateWorldMatrix(true, false);
    const M = par.matrixWorld, sc = M.getMaxScaleOnAxis(), seg = (ROPE_L / (N - 1)) * sc;
    const ext = ropeExt(par.userData.lash || 0), gone = !last || now - last > 400;
    last = now;
    for (let k = 0; k < N; k++) L[k].lerpVectors(ROPE_COIL[k], ROPE_LINE[k], ext).applyMatrix4(M); // where the spring wants each point (world)
    if (!live || gone) { for (let k = 0; k < N; k++) { wp[k].copy(L[k]); wprev[k].copy(L[k]); } live = true; }
    else {
      const damp = Math.pow(0.12, dt), g = 9.2 * dt * dt;
      for (let k = 1; k < N; k++) {
        const sN = k / (N - 1), kk = (0.1 + (0.34 * (1 - sN) + 0.05 - 0.1) * ext) * Math.min(1, dt * 60), p = wp[k];
        tg.copy(p).sub(wprev[k]).multiplyScalar(damp);
        wprev[k].copy(p);
        p.add(tg); p.y -= g * sc;
        p.lerp(L[k], k < 3 ? Math.max(kk, 0.6) : kk);
      }
      wp[0].copy(L[0]);
      for (let it = 0; it < 8; it++) {
        for (let k = 0; k < N - 1; k++) {
          tmp.subVectors(wp[k + 1], wp[k]); const d = tmp.length() || 1e-6, diff = (d - seg) / d;
          if (k === 0) wp[k + 1].addScaledVector(tmp, -diff); else { wp[k].addScaledVector(tmp, diff * 0.5); wp[k + 1].addScaledVector(tmp, -diff * 0.5); }
        }
      }
    }
    inv.copy(M).invert();
    for (let k = 0; k < N; k++) P[k].copy(wp[k]).applyMatrix4(inv);
    writeGeo(P);
  };
  return mesh;
}


// ---------- Modern melee (Lucille, machete, fire axe, sledgehammer) ----------
// Flat blade/head plate: outline as [x, z] points, `t` thick (y), centred on y = 0.
export function flatPlate(points, t, bevel = 0.002) {
  const sh = new THREE.Shape();
  points.forEach(([x, z], i) => (i ? sh.lineTo(x, z) : sh.moveTo(x, z)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, t - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  g.rotateX(Math.PI / 2); // shape y -> +z, extrusion -> -y
  g.translate(0, t / 2 - bevel, 0);
  return g;
}
let modernMats = null;
export function modern() {
  if (modernMats) return modernMats;
  modernMats = {
    red: new THREE.MeshStandardMaterial({ color: 0xb01818, roughness: 0.45, metalness: 0.1 }),
    wire: new THREE.MeshStandardMaterial({ color: 0xb9bcc0, roughness: 0.35, metalness: 0.9 }),
    blood: new THREE.MeshStandardMaterial({ color: 0x5a0d0d, roughness: 0.6, metalness: 0.2 }),
    alien: new THREE.MeshStandardMaterial({ color: 0x241636, roughness: 0.28, metalness: 0.65 }),
    alienLight: new THREE.MeshStandardMaterial({ color: 0x4a2f6a, roughness: 0.3, metalness: 0.6 }),
    emit: new THREE.MeshBasicMaterial({ color: 0xff2a22, toneMapped: false }),
  };
  return modernMats;
}
// Lucille: the baseball bat with barbed wire wound round the barrel and the odd dark stain.
function lucille() {
  const m = mats(), x = modern(), d = bat(), P = d.parts;
  const rad = (z) => tab([[0.0, 0.0165], [0.2, 0.0155], [0.42, 0.019], [0.6, 0.028], [0.72, 0.0335], [0.82, 0.033], [0.9, 0.026]], z) + 0.004;
  P.push([helix(0.4, 0.9, rad, 9, 0.0032, 1, 0), x.wire]);
  P.push([helix(0.4, 0.9, rad, 9, 0.0032, -1, 1.2), x.wire]);
  for (let i = 0; i < 26; i++) { // barbs: short spikes standing out of the wire
    const z = 0.42 + (i / 26) * 0.46, a = i * 2.4, r = rad(z) + 0.001;
    const c = new THREE.ConeGeometry(0.0035, 0.02, 4).translate(0, 0.01, 0).rotateZ(a - Math.PI / 2); // tip pointing radially out
    P.push([c.translate(Math.cos(a) * r, Math.sin(a) * r, z), x.wire]);
  }
  P.push([at(new THREE.SphereGeometry(0.034, 10, 6).scale(1, 1, 0.5), 0.0, 0.0, 0.8), x.blood]); // stained patch near the head
  return { parts: P, reach: 0.94, support: null, twoHanded: false };
}
export function machete() {
  const m = mats(), x = modern(), P = [];
  P.push([lathe([[0, -0.07], [0.019, -0.07], [0.021, -0.05], [0.0185, 0.0], [0.0185, 0.13], [0.02, 0.15], [0, 0.15]], 10), m.rubber]);
  P.push([at(new THREE.BoxGeometry(0.014, 0.05, 0.016), 0, 0, 0.158), m.steelDark]); // guard
  // Broad clip-point blade, belly curving to the tip.
  const B = [[-0.016, 0.15], [0.036, 0.16], [0.047, 0.3], [0.05, 0.48], [0.048, 0.6], [0.038, 0.69], [0.012, 0.74], [-0.016, 0.73], [-0.016, 0.3]];
  P.push([flatPlate(B, 0.005, 0.0012), m.steel]);
  P.push([at(new THREE.BoxGeometry(0.004, 0.0065, 0.55), -0.016, 0, 0.45), m.steelDark]); // spine
  for (const z of [0.045, 0.1]) P.push([at(new THREE.CylinderGeometry(0.004, 0.004, 0.044, 6).rotateZ(Math.PI / 2), 0, 0, z), m.steelDark]);
  return { parts: P, reach: 0.74, support: null, twoHanded: false };
}
function fireaxe() {
  const m = mats(), x = modern(), P = [];
  P.push([lathe([[0, -0.1], [0.021, -0.1], [0.021, 0.0], [0.0185, 0.3], [0.0185, 0.8], [0, 0.8]], 12), x.red]);
  P.push([lathe([[0, -0.1], [0.0225, -0.1], [0.0225, -0.04], [0, -0.04]], 12), m.rubber]); // grip
  P.push([at(new THREE.BoxGeometry(0.05, 0.07, 0.14), 0, 0, 0.82), x.red]);        // head socket
  const H = [[0.0, 0.78], [0.02, 0.79], [0.17, 0.74], [0.22, 0.83], [0.2, 0.92], [0.17, 0.995], [0.02, 0.95], [0.0, 0.93]];
  P.push([flatPlate(H, 0.016, 0.0025), x.red]);                                    // painted cheek
  P.push([flatPlate([[0.17, 0.74], [0.22, 0.83], [0.2, 0.92], [0.17, 0.995], [0.19, 0.83]], 0.01, 0.0015), m.steel]); // bright edge
  P.push([at(new THREE.ConeGeometry(0.022, 0.2, 4).rotateX(-Math.PI / 2).rotateZ(Math.PI), -0.1, 0, 0.84).rotateY(Math.PI * 0), m.steelDark]); // pick on the back
  return { parts: P, reach: 1.0, support: [0, 0, 0.2], twoHanded: true };
}
function sledge() {
  const m = mats(), x = modern(), P = [];
  P.push([grainAlong(lathe([[0, -0.1], [0.024, -0.1], [0.024, 0.0], [0.02, 0.4], [0.02, 0.95], [0, 0.95]], 12)), m.wood]);
  P.push([lathe([[0, -0.1], [0.0275, -0.1], [0.0275, -0.04], [0, -0.04]], 12), m.leather]);
  P.push([at(new THREE.BoxGeometry(0.26, 0.1, 0.1), 0, 0, 1.0), m.steelDark]);          // head body
  for (const sx of [-1, 1]) P.push([at(new THREE.BoxGeometry(0.03, 0.115, 0.115), sx * 0.13, 0, 1.0), m.steel]); // striking faces
  P.push([at(new THREE.BoxGeometry(0.06, 0.12, 0.012), 0, 0, 0.94), m.steel]);
  return { parts: P, reach: 1.06, support: [0, 0, 0.2], twoHanded: true };
}
// Alien Blaster: a glossy organic pistol with a glowing red emitter crystal.
GUNS.alienblaster = function alienblaster() {
  const m = mats(), x = modern(), P = [];
  P.push([slab([[-0.04, 0.0], [0.1, -0.005], [0.2, 0.012], [0.24, 0.03], [0.2, 0.065], [0.08, 0.075], [-0.03, 0.06]], 0.032, 0.008), x.alien]); // body
  P.push([slab([[0.0, 0.06], [0.12, 0.074], [0.2, 0.062], [0.12, 0.092], [0.02, 0.088]], 0.014, 0.004), x.alienLight]);                        // dorsal fin
  P.push([slab([[-0.035, 0.0], [0.02, -0.002], [0.0, -0.13], [-0.045, -0.12], [-0.06, -0.06]], 0.03, 0.008), x.alienLight]);                  // curved grip
  for (const sx of [-1, 1]) P.push([CY(0.0045, 0.19, sx * 0.019, 0.034, 0.1, 6), x.emit]);                                                       // glowing side veins
  P.push([at(new THREE.OctahedronGeometry(0.02, 0).scale(0.7, 0.7, 1.6), 0, 0.03, 0.255), x.emit]);                                            // emitter crystal
  for (const sx of [-1, 1]) P.push([at(new THREE.ConeGeometry(0.01, 0.1, 5).rotateX(Math.PI / 2), sx * 0.022, 0.03, 0.28), x.alienLight]);       // prongs
  P.push([BX(0.006, 0.022, 0.012, 0, -0.012, 0.008), x.emit]);                                                                                // trigger
  return { parts: P, muzzle: [0, 0.03, 0.31], support: null, pistol: true };
};

const MELEE = { lucille, machete, fireaxe, sledge, bat, chainsaw, whip, knife, sword, spear, axe, katana, warhammer, claws, bare, zombiestaff, healstaff };
// Sword-and-shield pairs (shields.js). Looked up lazily rather than spread into MELEE: shields.js imports this
// module, so if data.js pulls SWORD_SHIELD_DATA in first the cycle would hit SWORD_SHIELDS before it is initialised.
const meleeBuilder = (id) => AXE_PICKS[id] || MELEE[id] || SILVER_VARIANTS[id] || SWORD_SHIELDS[id]; // Nutty's axe and shield picks override the old builders
// Longbows (longbow.js): 'longbow' is whichever variant is picked; bow1..bow5 are the variants themselves (weapon-wall cards).
const bowBuilder = (id) => LONGBOW_VARIANTS[id] || (id === 'longbow' ? LONGBOW_VARIANTS[longbowPick()] : null);

// The line of sight of a gun's own sights, in weapon space: the red dot if it has one, else the tip of the front sight
// post (the brightest fibre dot on the centreline, furthest down the barrel). A builder can also say it outright with
// `sight: [x, y, z]`. First person aims the eye along this line, so the shot lands where the sights sit. null = no sights
// (the eye sits a little above the barrel as before).
function sightOf(d) {
  if (d.sight) return d.sight;
  const m = mats(); let best = null;
  for (const [g, mat] of d.parts) {
    if (mat !== m.dot && mat !== m.fiber) continue;
    g.computeBoundingBox(); const b = g.boundingBox, c = [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2];
    if (Math.abs(c[0]) > 0.003) continue; // on the centreline only (a rear notch's dots sit either side)
    const rank = (mat === m.dot ? 100 : 0) + c[2];
    if (!best || rank > best.rank) best = { rank, c };
  }
  return best ? best.c : null;
}

export function makeWeapon(id, { card = false } = {}) {
  let g, kind = 'melee', muzzle = [0, 0, 0.5], support = null, twoHanded = false, pistol = false, flat = false;
  const extra = {};
  if (GEAR[id]) {
    const d = GEAR[id](card);
    g = build(d.parts); kind = d.kind; muzzle = [0, 0, 0.1];
    if (d.eyes) extra.eyes = true;
    if (d.cardTilt) extra.cardTilt = d.cardTilt;
  } else if (bowBuilder(id)) {
    // A bow: the right hand holds the string (the weapon origin, where the arrow's nock sits), the left hand the grip
    // (support). rigBow hangs the limbs, string and arrow off the body and returns the draw hook (userData.bowDraw) that
    // animateWeapon drives with `spin` = draw amount; the arrow is `ammo`, hidden until one is nocked.
    const d = bowBuilder(id)();
    g = build(d.parts); kind = 'gun'; muzzle = d.muzzle; support = d.support; twoHanded = true;
    Object.assign(extra, rigBow(g, d, id === 'longbow' ? longbowPick() : id));
    if (d.cardTilt) extra.cardTilt = d.cardTilt;
  } else if (GUNS[id]) {
    const d = (id === 'grenadel' ? grenadelModern : GUNS[id])(); // the modern gunmetal launcher replaces the revolver-style one
    { const sg = d.shoulder || d.fist ? null : sightOf(d); if (sg) extra.sight = new THREE.Vector3(...sg); }
    g = build(d.parts); kind = 'gun'; muzzle = d.muzzle; support = d.support; twoHanded = !d.pistol; pistol = !!d.pistol;
    // A rotor that spins (minigun) and a round that can be hidden when the gun is empty (rocket, crossbow bolt).
    if (d.spinner) { const sp = build(d.spinner.parts); sp.position.set(...d.spinner.at); g.add(sp); extra.spinner = sp; }
    if (d.ammo) { const am = build(d.ammo); g.add(am); extra.ammo = am; }
    if (d.back) extra.back = new THREE.Vector3(...d.back);
    if (d.cardRoll) extra.cardRoll = d.cardRoll;
    // Pulse Cannon: braced on the shoulder, with glowing emitters and a charge gauge that animateWeapon drives.
    if (d.fist) { extra.fist = d.fist.map((f) => V3(...f)); extra.twoHanded = false; }
    if (d.shoulder) extra.shoulder = true;
    if (d.idleSpin) extra.idleSpin = d.idleSpin; // a ring that turns on its own (Gravity Gun)
    if (d.glow) { extra.glow = d.glow; extra.gauge = d.gauge; for (const e of d.extras) g.add(e); }
  } else if (meleeBuilder(id)) {
    const d = meleeBuilder(id)();
    if (d.fist && !card) {
      // A fist weapon is two halves (right hand, left hand) so each hand can strike on its own while the other stays on guard.
      g = new THREE.Group();
      const R = build(d.parts.filter(([q]) => { q.computeBoundingBox(); return q.boundingBox.min.x + q.boundingBox.max.x < 0; }));
      const L = build(d.parts.filter(([q]) => q.boundingBox.min.x + q.boundingBox.max.x >= 0));
      g.add(R, L); extra.halves = [R, L];
    } else g = build(d.parts); support = d.support; twoHanded = d.twoHanded; muzzle = [0, 0, d.reach]; flat = !d.fist;
    if (d.shield) {
      // Sword-and-shield: the shield is its own group (not added to g) in shield space: centred at the origin,
      // lying in the Y/Z plane, front face toward +X, up +Y. The character rig mounts it on the off arm.
      extra.shield = build(d.shield.parts); extra.shieldSize = d.shield.size;
      if (card) {
        // Weapon-wall card: the blade's flat faces the camera, tipped up to the right, with the shield standing
        // behind it to the left. After the card's own Ry(90°) weapon +z runs right, weapon -x is toward the camera.
        const sw = build(d.parts); sw.rotation.set(-0.4, 0, Math.PI / 2); g = new THREE.Group(); g.add(sw);
        const sh = build(d.shield.parts); sh.rotation.y = Math.PI; sh.position.set(0.12, 0.0, -0.12 - d.shield.size * 0.3); g.add(sh);
        extra.cardTilt = [0.0, -0.25, 0.0]; flat = false;
      }
    }
    extra.swipe = (d.swipe || [[[0, 0, SWIPE_BASE], [0, 0, SWIPE_TIP]]]).map(([b, t]) => [V3(...b), V3(...t)]);
    if (d.fist) extra.fist = d.fist.map((f) => V3(...f));
    if (d.cane) extra.cane = true;
    if (STYLE[id]) extra.style = STYLE[id];
    if (d.rope) g.add(ropeMesh(mats().leather));
  } else g = new THREE.Group();
  g.userData = { id, kind, muzzle: new THREE.Vector3(...muzzle), support: support ? new THREE.Vector3(...support) : null, twoHanded, pistol, cardFlat: flat, ...extra };
  return g;
}

// Per-frame weapon animation: the minigun's rotor turns at `spin` (0..1 of full speed) and a rocket or
// crossbow bolt only shows while the weapon is loaded. Safe to call with any weapon (or none).
// For the Pulse Cannon `spin` is how hot its emitters glow (0..1) and `charge` (0..1) how much of the gauge is lit.
// For a longbow `spin` is the draw (0 nocked and relaxed .. 1 full draw) and `loaded` whether an arrow is on the string.
const GAUGE_ON = new THREE.Color(0.3, 0.85, 1.15), GAUGE_LOW = new THREE.Color(1.0, 0.3, 0.12), GAUGE_OFF = new THREE.Color(0.03, 0.07, 0.09);
export function animateWeapon(w, spin = 0, dt = 0, loaded = true, charge = loaded ? 1 : 0) {
  const u = w && w.userData;
  if (!u) return;
  if (u.spinner && u.idleSpin) u.spinner.rotation.z = (u.spinner.rotation.z + u.idleSpin * (1 + 3 * spin) * dt) % (Math.PI * 2);
  else if (u.spinner && spin > 0.001) u.spinner.rotation.z = (u.spinner.rotation.z + spin * 26 * dt) % (Math.PI * 2);
  if (u.ammo && u.ammo.visible !== loaded) u.ammo.visible = loaded;
  if (u.bowDraw) u.bowDraw(spin, dt, loaded);
  if (u.glow) {
    const k = 0.3 + 1.1 * spin;
    for (const e of u.glow) e.m.color.copy(e.c).multiplyScalar(k * e.k);
    const lit = Math.round(charge * u.gauge.length);
    u.gauge.forEach((gm, i) => gm.color.copy(i < lit ? (charge < 0.25 ? GAUGE_LOW : GAUGE_ON) : GAUGE_OFF));
  }
}

// The crossbow's bolt as a flying projectile: head at the origin, pointing +z (longbow.js launchArrow's `proto`).
let BOLT = null;
export function boltProto() {
  if (BOLT) return BOLT;
  const d = GUNS.crossbow(), inner = build(d.ammo);
  inner.position.set(0, -0.0715, -0.59);
  inner.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  BOLT = new THREE.Group(); BOLT.add(inner);
  return BOLT;
}
