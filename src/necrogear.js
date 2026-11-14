// The Necromancer's kit (Nutty 2026-11-14: "polish him more, make everything not collide and give him a more detailed staff, the one
// it has looks like clay"). A floor-length wool robe in separate pieces that each ride one bone (skirt, body, capelet, sleeves, a deep
// cowl), so no bone pokes through cloth, and a gnarled staff whose split crown grips a real skull. Everything is vertex-coloured for
// the scanned-surface materials in realmat.js (wool, wood, bone, leather, rope, iron).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { assetGLTF } from './assets.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// Non-indexed, with position / normal / uv / colour only, so any mix of pieces merges.
function T(g, hex, shade) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  const c = new THREE.Color(hex), a = new Float32Array(n * 3), P = g.attributes.position;
  for (let i = 0; i < n; i++) { const k = shade ? shade(P.getX(i), P.getY(i), P.getZ(i)) : 1; a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const merge = (list) => mergeGeometries(list, false);
const hash = (i) => { const x = Math.sin(i * 127.1 + 31.7) * 43758.5453; return x - Math.floor(x); };
// A draped tube of cloth round the Y axis: rings from top to bottom, each [y, radius]; folds = how many vertical pleats, deep = their
// depth at the bottom (none at the top); ragged = how far the hem's edge wanders; gap = [centre angle, width] left open (a hood's face).
function drape(rings, { seg = 36, folds = 9, deep = 0.03, ragged = 0, gap = null, sx = 1, sz = 1, phase = 0 } = {}) {
  const a0 = gap ? gap[0] + gap[1] / 2 : 0, span = gap ? Math.PI * 2 - gap[1] : Math.PI * 2;
  const N = rings.length;
  const pt = (i, j) => { const t = i / (N - 1), a = a0 + span * (j / seg), [y, r] = rings[i];
    const rr = r + Math.sin(a * folds + phase) * deep * t * t + Math.sin(a * (folds * 2 + 1) + 1.7 + phase) * deep * 0.35 * t;
    const yy = y - (i === N - 1 ? ragged * (0.35 + hash(j * 3 + folds)) : 0);
    return [Math.sin(a) * rr * sx, yy, Math.cos(a) * rr * sz]; };
  return grid(N, seg, pt, !gap, true);
}
// An indexed grid of rows x (cols + 1) points with smooth normals; wrap welds the seam's normals; flip turns the faces round.
function grid(rows, cols, pt, wrap, flip) {
  const P = [], I = [], W = cols + 1;
  for (let i = 0; i < rows; i++) for (let j = 0; j <= cols; j++) P.push(...pt(i, j));
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols; j++) { const a = i * W + j, b = a + 1, c = a + W + 1, d = a + W; if (flip) I.push(a, d, c, a, c, b); else I.push(a, b, c, a, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3)); g.setIndex(I); g.computeVertexNormals();
  if (wrap) { const Nn = g.attributes.normal; for (let i = 0; i < rows; i++) { const a = i * W, b = a + cols, x = Nn.getX(a) + Nn.getX(b), y = Nn.getY(a) + Nn.getY(b), z = Nn.getZ(a) + Nn.getZ(b), l = Math.hypot(x, y, z) || 1; Nn.setXYZ(a, x / l, y / l, z / l); Nn.setXYZ(b, x / l, y / l, z / l); } }
  return g;
}
// A round bar along a path of points, its radius given per point (a bough, a claw, a cord).
function bough(pts, radii, seg = 8) {
  const curve = new THREE.CatmullRomCurve3(pts), n = Math.max(8, pts.length * 5), fr = curve.computeFrenetFrames(n, false);
  const rad = (t) => { const x = t * (radii.length - 1), i = Math.min(radii.length - 2, Math.floor(x)); return radii[i] + (radii[i + 1] - radii[i]) * (x - i); };
  const pt = (i, j) => { const t = i / n, c = curve.getPointAt(t), a = (j / seg) * Math.PI * 2, r = rad(t) * (1 + 0.12 * Math.sin(t * 37 + j * 2.1));
    return [c.x + (fr.normals[i].x * Math.cos(a) + fr.binormals[i].x * Math.sin(a)) * r, c.y + (fr.normals[i].y * Math.cos(a) + fr.binormals[i].y * Math.sin(a)) * r, c.z + (fr.normals[i].z * Math.cos(a) + fr.binormals[i].z * Math.sin(a)) * r]; };
  return grid(n + 1, seg, pt, true, false);
}
const WOOL = 0x282334, WOOL_DARK = 0x1a1724, WOOL_TRIM = 0x32293f, ROPE = 0x9a8660, WOODC = 0x5a3e28, WOOD_DARK = 0x33231a, BONE = 0xe2d6b4, BONE_OLD = 0xb8a886, IRON = 0x4c4f58, HIDE = 0x3a2416, FEATHER = 0x15151b;
const dusty = (lo, hi) => (x, y) => 0.62 + 0.38 * Math.min(1, Math.max(0, (y - lo) / (hi - lo))); // cloth goes dark and dirty toward the hem

// api: { put, bp, s, has } from mobrig's buildGear. Lengths are in the 1.8 m body's metres (put scales them to the mob).
export function necroRobe({ put, bp, s, has }) {
  const len = (a, b) => bp(a).distanceTo(bp(b)) / s;
  const frame = (from, to) => { const u = bp(to).sub(bp(from)).normalize(); let f = V(0, 0, 1).addScaledVector(u, -u.z); if (f.lengthSq() < 1e-4) f = V(0, 1, 0).addScaledVector(u, -u.y); return { u, f: f.normalize() }; };
  // Skirt: from the waist to just off the ground, wide enough that the striding legs stay inside it.
  const hipH = bp('Hips').y / s;
  const hem = -(hipH - 0.03), sk = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; sk.push([0.12 + (hem - 0.12) * t, 0.2 + 0.2 * Math.pow(t, 1.2)]); }
  put('Hips', 'nWool', T(drape(sk, { seg: 48, folds: 9, deep: 0.03, ragged: 0.06, sx: 0.8, sz: 1.0 }), WOOL, dusty(hem, hem + 0.5)), [0, 0, 0]);
  // Body: waist to collar on the spine, overlapping the skirt so no gap opens when he leans.
  const up = len('Hips', 'Spine2') + 0.2;
  put('Spine', 'nWool', T(drape([[up - 0.12, 0.2], [up * 0.5, 0.215], [0.02, 0.21], [-0.14, 0.225]], { folds: 7, deep: 0.012, sz: 0.85 }), WOOL), [0, 0, 0]);
  // Capelet over both shoulders: hides where the sleeves meet the body.
  const shW = has('RightArm') && has('LeftArm') ? bp('RightArm').distanceTo(bp('LeftArm')) / s / 2 : 0.19;
  const cape = []; for (let i = 0; i <= 8; i++) { const t = i / 8; cape.push([0.25 - 0.36 * Math.pow(t, 1.6), 0.075 + (shW + 0.035 - 0.075) * Math.pow(Math.sin(t * Math.PI / 2), 0.7)]); }
  put('Spine2', 'nWool', T(drape(cape, { seg: 40, folds: 11, deep: 0.01, ragged: 0.025, sz: 0.72 }), WOOL_DARK), [0, 0, 0]);
  // Sleeves: the upper arm in a close tube, the forearm in a wide bell that ends past the wrist.
  for (const sd of ['Right', 'Left']) {
    if (!has(sd + 'Arm') || !has(sd + 'ForeArm') || !has(sd + 'Hand')) continue;
    const la = len(sd + 'Arm', sd + 'ForeArm'), lf = len(sd + 'ForeArm', sd + 'Hand');
    const fa = frame(sd + 'ForeArm', sd + 'Arm'); // u: elbow -> shoulder, so the cloth hangs toward -u
    put(sd + 'Arm', 'nWool', T(drape([[0.05, 0.07], [-la * 0.5, 0.066], [-la - 0.04, 0.066]], { seg: 20, folds: 5, deep: 0.006 }), WOOL), [0, 0, 0], frame(sd + 'ForeArm', sd + 'Arm'));
    const ff = frame(sd + 'Hand', sd + 'ForeArm');
    put(sd + 'ForeArm', 'nWool', T(drape([[0.05, 0.068], [-lf * 0.4, 0.062], [-lf * 0.7, 0.06], [-lf * 0.86, 0.066]], { seg: 22, folds: 6, deep: 0.008, ragged: 0.012 }), WOOL, (x, y) => 0.7 + 0.3 * Math.min(1, (y + lf) / lf + 0.3)), [0, 0, 0], ff);
    void fa;
  }
  // Cowl: a deep hood open at the face, its peak falling back, with a cloth collar down onto the capelet.
  const hd = has('HeadTop_End') ? len('Head', 'HeadTop_End') : 0.19, R = Math.max(0.16, hd * 0.82);
  const hood = [];
  for (let i = 0; i <= 9; i++) { const t = i / 9, a = t * Math.PI * 0.78; hood.push([hd * 0.62 + Math.cos(a) * R * 1.05 - 0.01, Math.max(0.012, Math.sin(a) * R)]); }
  hood.push([hd * 0.62 - R * 0.9, R * 0.88], [-0.08, R * 0.92], [-0.15, R * 1.08], [-0.2, R * 1.3]);
  put('Head', 'nWool', T(drape(hood, { seg: 30, folds: 6, deep: 0.012, gap: [0, 1.5], sx: 0.98, sz: 1.22 }), WOOL_DARK), [0, 0, -0.035]);
  // the hood's rolled edge round the face
  const rim = []; for (let i = 0; i <= 14; i++) { const a = -0.78 + (i / 14) * (Math.PI + 1.56); rim.push(V(Math.cos(a) * R * 0.75, hd * 0.62 + Math.sin(a) * R * 0.98 - 0.02, R * 0.86 - 0.035 + Math.sin(a) * 0.02)); }
  put('Head', 'nWool', T(bough(rim, [0.016, 0.02, 0.02, 0.016], 6), WOOL_TRIM), [0, 0, 0]);
  // Rope belt, knotted, with two finger bones on a cord.
  const belt = []; for (let i = 0; i <= 20; i++) { const a = (i / 20) * Math.PI * 2; belt.push(V(Math.sin(a) * 0.215, 0.06 + Math.sin(a * 2) * 0.006, Math.cos(a) * 0.215 * 0.9)); }
  put('Hips', 'nRope', T(merge([bough(belt, [0.014, 0.014], 6), bough([V(0.05, 0.06, 0.2), V(0.07, -0.06, 0.225), V(0.065, -0.22, 0.25)], [0.012, 0.011, 0.014], 6), bough([V(0.03, 0.06, 0.2), V(0.02, -0.08, 0.225), V(0.03, -0.3, 0.262)], [0.012, 0.011, 0.014], 6),
    new THREE.SphereGeometry(0.024, 8, 6).translate(0.04, 0.058, 0.205)].map((g) => T(g, ROPE))), ROPE), [0, 0, 0]);
}

// The staff stands along +Y in the hand's frame with the grip at the origin. Returns [material key, geometry] pairs.
export function necroStaffParts() {
  const out = [];
  // the shaft: a seasoned bough, never quite straight, thicker toward the crown, with knots and a broken twig
  const shaft = bough([V(0.006, -0.62, 0), V(-0.008, -0.3, 0.006), V(0.004, 0.0, -0.004), V(0.012, 0.35, 0.006), V(-0.006, 0.7, -0.006), V(0.004, 1.0, 0.004), V(0, 1.16, 0)], [0.019, 0.022, 0.023, 0.024, 0.026, 0.03, 0.034], 9);
  const knots = [[0.012, 0.36, 0.012, 0.03], [-0.01, 0.74, -0.012, 0.032], [-0.008, -0.33, 0.01, 0.027]].map(([x, y, z, r]) => new THREE.SphereGeometry(r, 8, 6).scale(1, 0.7, 1).translate(x, y, z));
  const twig = bough([V(0.01, 0.52, 0.0), V(0.05, 0.6, 0.02), V(0.07, 0.69, 0.02)], [0.012, 0.009, 0.004], 6);
  // the crown: the bough splits into four claws that close over the skull
  const claws = [];
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.6, cx = Math.sin(a), cz = Math.cos(a), h = i % 2 ? 0.02 : 0;
    claws.push(bough([V(0, 1.13, 0), V(cx * 0.05, 1.2, cz * 0.05), V(cx * 0.105, 1.29 + h, cz * 0.105), V(cx * 0.1, 1.38 + h, cz * 0.1), V(cx * 0.05, 1.455 + h, cz * 0.05)], [0.022, 0.019, 0.015, 0.011, 0.004], 7)); }
  out.push(['nWood', T(merge([shaft, ...knots, twig, ...claws].map((g) => T(g, WOODC))), WOODC, (x, y) => 0.86 + 0.14 * (0.5 + 0.5 * Math.sin(y * 23 + x * 40)))]);
  // iron: a spiked shoe on the foot and two forged bands
  out.push(['nIron', T(merge([new THREE.CylinderGeometry(0.024, 0.019, 0.1, 10).translate(0.006, -0.63, 0), new THREE.ConeGeometry(0.019, 0.07, 10).rotateX(Math.PI).translate(0.006, -0.715, 0),
    new THREE.CylinderGeometry(0.031, 0.031, 0.022, 12).translate(0.004, 1.02, 0.004), new THREE.CylinderGeometry(0.036, 0.036, 0.026, 12).translate(0, 1.13, 0)].map((g) => T(g, IRON))), IRON)]);
  // the grip: a leather thong wound round the shaft where the hand holds it
  const wrap = []; for (let i = 0; i <= 44; i++) { const t = i / 44, a = t * Math.PI * 2 * 9; wrap.push(V(0.004 + Math.sin(a) * 0.0265, -0.1 + t * 0.2, -0.004 + Math.cos(a) * 0.0265)); }
  out.push(['nHide', T(bough(wrap, [0.0075, 0.0075], 5), HIDE)]);
  // rope lashing under the crown, and a cord of charms: two finger bones and three crow feathers
  const lash = []; for (let i = 0; i <= 30; i++) { const t = i / 30, a = t * Math.PI * 2 * 5; lash.push(V(Math.sin(a) * 0.034, 1.05 + t * 0.07, Math.cos(a) * 0.034)); }
  const cord = bough([V(0.034, 1.08, 0.0), V(0.075, 1.0, 0.01), V(0.07, 0.86, 0.012)], [0.004, 0.004], 5), cord2 = bough([V(0.03, 1.07, 0.012), V(0.05, 0.98, 0.04), V(0.045, 0.9, 0.045)], [0.004, 0.004], 5);
  out.push(['nRope', T(merge([bough(lash, [0.007, 0.007], 5), cord, cord2].map((g) => T(g, ROPE))), ROPE)]);
  const fbone = (x, y, z, l, rz) => merge([new THREE.CylinderGeometry(0.006, 0.006, l, 6), new THREE.SphereGeometry(0.0095, 6, 5).translate(0, l / 2, 0), new THREE.SphereGeometry(0.0095, 6, 5).translate(0, -l / 2, 0)].map((g) => T(g, BONE_OLD))).rotateZ(rz).translate(x, y, z);
  const feather = (x, y, z, l, rz, ry) => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(0.018, -l * 0.4, 0.004, -l); sh.quadraticCurveTo(-0.02, -l * 0.5, 0, 0);
    const g = new THREE.ShapeGeometry(sh, 6); const b = g.clone(); b.scale(-1, 1, 1); return merge([T(g, FEATHER), T(b, FEATHER)]).rotateZ(rz).rotateY(ry).translate(x, y, z); };
  out.push(['nBone', T(merge([fbone(0.07, 0.83, 0.012, 0.055, 0.15), fbone(0.045, 0.87, 0.045, 0.05, -0.2)]), BONE_OLD)]);
  out.push(['nFeather', T(merge([feather(0.072, 0.8, 0.012, 0.13, 0.12, 0.4), feather(0.066, 0.805, 0.016, 0.1, -0.25, 1.6), feather(0.045, 0.845, 0.047, 0.11, 0.05, 2.6)]), FEATHER)]);
  // the skull, held in the claws and looking where the staff's bearer looks
  let sg = null; const sk = assetGLTF('skull.glb'); if (sk) sk.scene.traverse((o) => { if (o.isMesh && !sg) { sg = o.geometry.clone(); o.updateWorldMatrix(true, false); sg.applyMatrix4(o.matrixWorld); } });
  if (sg) { sg.computeBoundingBox(); const b = sg.boundingBox, c = b.getCenter(V()), size = b.getSize(V()); const k = 0.175 / Math.max(size.x, size.y, size.z); sg.translate(-c.x, -c.y, -c.z).scale(k, k, k).translate(0, 1.325, 0.004); }
  else sg = new THREE.SphereGeometry(0.08, 14, 10).scale(0.9, 1, 1.1).translate(0, 1.33, 0);
  out.push(['nBone', T(sg, BONE, (x, y, z) => 0.74 + 0.26 * Math.min(1, Math.max(0, (y - 1.24) / 0.14)))]);
  // the soul it holds: a shard of green light inside the crown and in each eye
  out.push(['glowC', merge([new THREE.OctahedronGeometry(0.026, 0).scale(0.7, 1.7, 0.7).translate(0, 1.47, 0), new THREE.SphereGeometry(0.014, 8, 6).translate(0.027, 1.335, 0.062), new THREE.SphereGeometry(0.014, 8, 6).translate(-0.027, 1.335, 0.062)].map((g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k); return g; }))]);
  return out;
}
