// Quake's Golem (Nutty 2026-11-12): a summon. He breaks out of the ground hunched, head down, rises to his full height, then walks with his
// summoner and hurls huge boulders at anything hostile nearby. Built from chunky grey boulders with flat faces, thin pale cracks and black gaps
// between the rocks; small dark head sunk between huge spiked shoulders, two yellow eyes, slab chest, pillar legs, fists that hang past the knees.
// When his time (or his health) runs out he crumbles into rubble.
// spawnGolem() draws and moves him for everyone; only the caster passes `hit`, which does the damage.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';
import { scanReady, scanMat } from './scan.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => { while (a > Math.PI) a -= 6.2832; while (a < -Math.PI) a += 6.2832; return a; };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
// value at time t along keys [[t, v], ...], eased between them
const key = (t, ks) => { if (t <= ks[0][0]) return ks[0][1]; for (let i = 1; i < ks.length; i++) if (t < ks[i][0]) return ks[i - 1][1] + (ks[i][1] - ks[i - 1][1]) * ease((t - ks[i - 1][0]) / (ks[i][0] - ks[i - 1][0])); return ks[ks.length - 1][1]; };
const mul32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export const GOLEM = { dur: 25, hp: 800, dmg: 120, radius: 5.5, every: 2.6, range: 40, speed: 3.8 };

// ---------------------------------------------------------------- rock
// One boulder: a ball cut by random planes so it has big flat faces that catch the light, flat shaded, with box-mapped UVs for the stone photo.
function finish(g) {
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i += 3) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    for (let k = 0; k < 3; k++) { const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k); let u, v; if (ax >= ay && ax >= az) { u = z; v = y; } else if (ay >= az) { u = x; v = z; } else { u = x; v = y; } uv[(i + k) * 2] = u * 0.42 + 0.31; uv[(i + k) * 2 + 1] = v * 0.42 + 0.17; }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
function chunk([x, y, z, sx, sy, sz, seed, rx = 0, ry = 0, rz = 0, cuts = 13, depth = 0.5]) {
  const g = new THREE.IcosahedronGeometry(1, 2); g.deleteAttribute('normal'); g.deleteAttribute('uv');
  const r = mul32(seed * 977 + 13), pl = [];
  for (let i = 0; i < cuts; i++) { const n = V(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize(); pl.push([n, depth + r() * 0.32]); }
  const p = g.attributes.position, v = V();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); for (const [n, d] of pl) { const k = v.dot(n); if (k > d) v.addScaledVector(n, d - k); } p.setXYZ(i, v.x, v.y, v.z); }
  g.scale(sx, sy, sz); g.rotateX(rx).rotateY(ry).rotateZ(rz); g.translate(x, y, z);
  return g;
}
// a jagged spike of rock: base at `at`, pointing along (dx, dy, dz)
function spike([x, y, z, dx, dy, dz, len, w, seed]) {
  let g = new THREE.ConeGeometry(1, 1, 5, 2).toNonIndexed(); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g.translate(0, 0.5, 0);
  const r = mul32(seed * 31 + 7), p = g.attributes.position, jit = new Map();
  for (let i = 0; i < p.count; i++) { const X = p.getX(i), Y = p.getY(i), Z = p.getZ(i); if (Y > 0.98) continue; const k = X.toFixed(3) + Y.toFixed(3) + Z.toFixed(3); if (!jit.has(k)) jit.set(k, [1 + (r() - 0.5) * 0.5, (r() - 0.5) * 0.12]); const j = jit.get(k); p.setXYZ(i, X * j[0], Y + j[1] * (Y > 0.1 ? 1 : 0), Z * j[0]); }
  g.scale(w, len, w * 0.8);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(dx, dy, dz).normalize()); g.applyQuaternion(q); g.translate(x, y, z);
  return g;
}

let MATS = null;
function mats() {
  if (MATS && (MATS.scan || !scanReady())) return MATS;
  // thin pale crack lines, drawn once
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, N, N);
  const r = mul32(99); x.strokeStyle = '#fff'; x.lineCap = 'round';
  for (let i = 0; i < 16; i++) { let px = r() * N, py = r() * N, a = r() * 6.28; x.lineWidth = 0.6 + r() * 0.8; x.beginPath(); x.moveTo(px, py); const n = 6 + (r() * 10 | 0); for (let k = 0; k < n; k++) { a += (r() - 0.5) * 1.3; px += Math.cos(a) * (10 + r() * 22); py += Math.sin(a) * (10 + r() * 22); x.lineTo(px, py); if (r() < 0.18) { x.stroke(); x.beginPath(); x.moveTo(px, py); a += (r() < 0.5 ? 1 : -1) * 0.9; } } x.stroke(); }
  const crack = new THREE.CanvasTexture(c); crack.wrapS = crack.wrapT = THREE.RepeatWrapping; crack.anisotropy = 4;
  const src = scanReady() ? scanMat('boulder_01') : null, fall = src ? null : TX.rockMaps([0.5, 0.5, 0.52]);
  const stone = (tint, crackK) => {
    const m = new THREE.MeshStandardMaterial({ map: src ? src.map : fall.map, normalMap: src ? src.normalMap : fall.normalMap, normalScale: new THREE.Vector2(0.45, 0.45), roughnessMap: src ? src.roughnessMap : null, roughness: src ? 1 : 0.9, metalness: 0, color: new THREE.Color(tint[0], tint[1], tint[2]), flatShading: true });
    m.onBeforeCompile = (sh) => { sh.uniforms.uCrack = { value: crack };
      sh.fragmentShader = 'uniform sampler2D uCrack;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        float lum_ = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb = diffuse * mix(sampledDiffuseColor.rgb, vec3(lum_ * 0.55 + 0.2), 0.96);
        float ck_ = texture2D(uCrack, vMapUv * 0.55).r;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.9, 0.88), ck_ * ${crackK.toFixed(2)});`); };
    m.customProgramCacheKey = () => 'golem-stone' + crackK;
    return m;
  };
  const k = src ? 1.15 : 1.0; // the scan photo is dark: lift it to a mid grey
  MATS = { scan: !!src, body: stone([k, k, k * 1.03], 0.8), head: stone([k * 0.22, k * 0.22, k * 0.24], 0.25),
    core: new THREE.MeshBasicMaterial({ color: 0x030303 }), eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.3, 0.35), toneMapped: false }) };
  return MATS;
}

// ---------------------------------------------------------------- the body
let GEO = null;
function geos() {
  if (GEO) return GEO;
  const M = (list, sp = []) => finish(mergeGeometries([...list.map(chunk), ...sp.map(spike)]));
  const blob = (x, y, z, sx, sy, sz) => new THREE.IcosahedronGeometry(1, 1).scale(sx, sy, sz).translate(x, y, z);
  const side = (s) => ({
    // huge shoulder boulder with jagged spikes
    shoulder: M([[s * 1.55, 1.32, -0.05, 0.9, 0.8, 0.9, 11 + s, 0.2, s * 0.4, 0, 14, 0.48], [s * 1.05, 0.72, -0.1, 0.62, 0.62, 0.6, 14 + s, 0, 0.5, 0.3]],
      [[s * 1.35, 1.85, -0.1, s * 0.2, 1, -0.15, 0.95, 0.3, 3 + s], [s * 1.85, 1.75, 0.05, s * 0.7, 1, 0, 0.85, 0.28, 5 + s], [s * 1.6, 1.8, -0.5, s * 0.3, 0.9, -0.7, 0.8, 0.26, 7 + s], [s * 2.15, 1.45, -0.1, s * 1, 0.5, -0.1, 0.65, 0.24, 9 + s], [s * 1.2, 1.75, 0.35, s * 0.1, 1, 0.45, 0.55, 0.2, 21 + s]]),
    upper: M([[s * 0.1, -0.48, 0, 0.56, 0.66, 0.56, 31 + s, 0.3, 0, 0.2], [s * 0.18, -1.1, 0, 0.44, 0.34, 0.44, 33 + s]]),
    fore: M([[0, -0.4, 0, 0.64, 0.56, 0.64, 41 + s, 0, 0.6, 0], [s * 0.05, -1.0, 0.04, 0.8, 0.62, 0.78, 43 + s, 0.4, 0, 0.3, 14], [s * -0.3, -0.75, 0.42, 0.3, 0.34, 0.28, 45 + s], [s * 0.42, -0.6, -0.3, 0.3, 0.36, 0.3, 47 + s]], [[s * 0.55, -0.7, -0.1, s * 1, 0.5, -0.3, 0.5, 0.2, 49 + s]]),
    fist: M([[0, -0.1, 0.02, 0.92, 0.78, 0.94, 51 + s, 0.2, 0.3, 0, 14, 0.5], [-0.42, -0.55, 0.42, 0.27, 0.27, 0.27, 53], [-0.14, -0.62, 0.52, 0.27, 0.28, 0.27, 54], [0.15, -0.62, 0.52, 0.27, 0.28, 0.27, 55], [0.43, -0.55, 0.42, 0.26, 0.26, 0.26, 56], [s * -0.6, -0.2, 0.45, 0.3, 0.26, 0.3, 57]]),
    thigh: M([[0, -0.42, 0, 0.62, 0.66, 0.64, 61 + s, 0, 0.4, 0.1], [s * 0.1, -0.95, 0.12, 0.36, 0.28, 0.34, 63 + s]]),
    shin: M([[0, -0.4, 0, 0.6, 0.56, 0.62, 71 + s, 0.2, 0, 0], [0, -0.8, 0.02, 0.72, 0.4, 0.74, 73 + s, 0, 0.7, 0, 14]]),
    foot: M([[0, 0.24, 0.2, 0.66, 0.3, 0.9, 81 + s, 0, 0, 0, 14, 0.48], [-0.34, 0.14, 0.95, 0.24, 0.16, 0.26, 83], [0, 0.15, 1.05, 0.26, 0.17, 0.28, 84], [0.34, 0.14, 0.95, 0.24, 0.16, 0.26, 85], [s * 0.6, 0.12, -0.2, 0.2, 0.14, 0.22, 86 + s], [s * -0.55, 0.1, 0.3, 0.16, 0.12, 0.18, 88 + s]]),
  });
  GEO = {
    hips: M([[0, -0.05, 0, 0.8, 0.42, 0.58, 1], [-0.42, 0.34, 0.16, 0.34, 0.3, 0.32, 2], [0.4, 0.36, 0.18, 0.33, 0.31, 0.3, 3], [0, 0.38, 0.3, 0.3, 0.28, 0.26, 4], [-0.3, 0.4, -0.26, 0.34, 0.3, 0.3, 5], [0.32, 0.38, -0.28, 0.33, 0.3, 0.3, 6]]),
    chest: M([[0, 0.9, -0.38, 1.3, 0.88, 0.95, 7, 0.2, 0, 0, 14], [-0.8, 0.5, -0.15, 0.62, 0.58, 0.72, 8], [0.8, 0.5, -0.15, 0.62, 0.58, 0.72, 9], [0, 1.72, -0.5, 0.8, 0.5, 0.62, 10],
      [-0.62, 0.78, 0.44, 0.74, 0.6, 0.32, 15, 0.1, 0.18, 0.06, 8, 0.6], [0.62, 0.78, 0.44, 0.74, 0.6, 0.32, 16, 0.1, -0.18, -0.06, 8, 0.6], // the two slab chest plates
      [-0.3, 0.12, 0.36, 0.34, 0.26, 0.24, 17], [0.3, 0.12, 0.36, 0.34, 0.26, 0.24, 18]], [[0, 1.95, -0.6, 0, 1, -0.5, 0.6, 0.24, 23], [-0.45, 1.85, -0.65, -0.3, 1, -0.6, 0.5, 0.2, 24], [0.45, 1.85, -0.65, 0.3, 1, -0.6, 0.5, 0.2, 25]]),
    head: M([[0, 0, 0, 0.42, 0.42, 0.44, 26, 0, 0, 0, 14], [0, 0.2, 0.26, 0.46, 0.15, 0.28, 27, -0.25, 0, 0, 6, 0.7], [0, -0.3, 0.12, 0.32, 0.18, 0.3, 28]]),
    L: side(-1), R: side(1),
    core: { hips: blob(0, 0.3, 0, 0.5, 0.55, 0.36), chest: mergeGeometries([blob(0, 0.8, -0.05, 1.1, 0.85, 0.42), blob(0, 1.45, 0.15, 0.5, 0.4, 0.4)]), upper: blob(0, -0.6, 0, 0.2, 0.62, 0.2), fore: blob(0, -0.75, 0, 0.3, 0.75, 0.3), leg: blob(0, -0.5, 0, 0.26, 0.55, 0.26) },
    eye: new THREE.SphereGeometry(0.065, 8, 6),
    boulder: finish(chunk([0, 0, 0, 1.3, 1.15, 1.25, 91, 0, 0, 0, 14, 0.5])),
    rubble: M([[2.3, 0.18, 0.3, 0.5, 0.3, 0.45, 101], [-2.1, 0.2, 0.9, 0.55, 0.34, 0.5, 102], [0.9, 0.16, 2.2, 0.42, 0.26, 0.4, 103], [-1.2, 0.14, -2.0, 0.46, 0.25, 0.42, 104], [1.7, 0.12, -1.6, 0.34, 0.2, 0.3, 105], [-2.4, 0.12, -0.7, 0.32, 0.2, 0.34, 106], [0.1, 0.1, -2.5, 0.28, 0.18, 0.3, 107], [-0.9, 0.12, 2.5, 0.36, 0.2, 0.3, 108], [2.6, 0.1, 1.5, 0.26, 0.16, 0.26, 109], [1.3, 0.08, 1.2, 0.2, 0.12, 0.2, 110], [-1.5, 0.08, 0.2, 0.2, 0.12, 0.22, 111]]),
  };
  return GEO;
}

export function buildGolem() {
  const G = geos(), m = mats(), root = new THREE.Group(), rocks = [];
  const bone = (parent, x, y, z) => { const b = new THREE.Group(); b.position.set(x, y, z); parent.add(b); return b; };
  const put = (b, geo, mat = m.body) => { const q = new THREE.Mesh(geo, mat); q.castShadow = true; q.receiveShadow = true; b.add(q); rocks.push(q); return q; };
  const cores = []; const core = (b, geo) => { const q = new THREE.Mesh(geo, m.core); b.add(q); cores.push(q); };
  const hips = bone(root, 0, 2.05, 0); put(hips, G.hips); core(hips, G.core.hips);
  const chest = bone(hips, 0, 0.75, 0); put(chest, G.chest); core(chest, G.core.chest);
  const head = bone(chest, 0, 1.6, 0.32); put(head, G.head, m.head);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(G.eye, m.eye); e.position.set(s * 0.15, 0.02, 0.4); head.add(e); cores.push(e); }
  const arms = [], legs = [];
  for (const s of [-1, 1]) {
    const S = s < 0 ? G.L : G.R;
    put(chest, S.shoulder);
    const sh = bone(chest, s * 1.62, 1.12, 0); put(sh, S.upper); core(sh, G.core.upper);
    const fore = bone(sh, s * 0.2, -1.15, 0); put(fore, S.fore); core(fore, G.core.fore);
    const fist = bone(fore, 0, -1.55, 0.05); put(fist, S.fist);
    arms.push({ s, sh, fore, fist });
    const thigh = bone(hips, s * 0.64, -0.1, 0); put(thigh, S.thigh); core(thigh, G.core.leg);
    const knee = bone(thigh, 0, -0.95, 0); put(knee, S.shin); core(knee, G.core.leg);
    const foot = bone(knee, 0, -0.95, 0); put(foot, S.foot);
    legs.push({ s, thigh, knee, foot });
  }
  return { root, hips, chest, head, arms, legs, rocks, cores };
}

// Stand him in a pose. P: { hunch 0..1, ph walk phase, walk 0..1, thr: throw time or -1 }
const THROW = 2.3, RIP = 0.6, RELEASE = 1.52;
export function poseGolem(D, P) {
  const h = P.hunch || 0, w = P.walk || 0, sn = Math.sin(P.ph || 0), t = P.thr >= 0 ? P.thr : -1;
  let pitch = 0.08 + h * 0.85, squat = h, armR = 0, armL = 0, twist = 0, headUp = -h * 0.55;
  if (t >= 0) {
    pitch += key(t, [[0, 0], [0.55, 0.7], [0.8, 0.6], [1.35, -0.28], [1.6, 0.5], [2.3, 0]]);
    squat += key(t, [[0, 0], [0.55, 0.55], [1.2, 0.1], [1.6, 0.25], [2.3, 0]]);
    armR = key(t, [[0, 0], [0.55, -0.75], [0.8, -0.9], [1.38, -3.25], [1.62, -1.1], [2.3, 0]]);
    armL = key(t, [[0, 0], [0.6, 0.25], [1.35, -0.9], [1.65, 0.5], [2.3, 0]]);
    twist = key(t, [[0, 0], [0.6, -0.25], [1.35, -0.35], [1.62, 0.4], [2.3, 0]]);
    headUp += key(t, [[0, 0], [0.55, -0.45], [1.35, 0.1], [2.3, 0]]);
  }
  let lowest = 9;
  for (const L of D.legs) {
    const k = L.s * sn * w; // this leg forward when k < 0
    const a = -squat * 0.75 - k * 0.45, lift = Math.max(0, L.s * Math.cos(P.ph || 0)) * w, b = squat * 1.45 + lift * 0.75;
    L.thigh.rotation.x = a; L.knee.rotation.x = b; L.foot.rotation.x = -(a + b) + lift * 0.25;
    L.thigh.rotation.z = L.s * 0.05;
    L.reach = 0.1 + 0.95 * Math.cos(a) + 0.95 * Math.cos(a + b); if (lift < 0.05 || w < 0.05) lowest = Math.min(lowest, L.reach);
  }
  if (lowest === 9) lowest = Math.max(D.legs[0].reach, D.legs[1].reach);
  D.hips.position.y = 0.05 + lowest; D.hips.position.z = -squat * 0.25;
  D.hips.rotation.set(squat * 0.12, twist * 0.3, sn * w * 0.05);
  D.chest.rotation.set(pitch, twist + sn * w * 0.12, -sn * w * 0.05);
  D.head.rotation.set(headUp, -twist * 0.6, 0);
  for (const A of D.arms) {
    const own = A.s > 0 ? armR : armL;
    A.sh.rotation.set(-pitch * 0.92 + own + A.s * sn * w * 0.24 - 0.05, 0, A.s * (0.1 + h * 0.1 + (own < -1.5 ? 0.25 : 0)));
    A.fore.rotation.set(-0.16 - h * 0.25 + (own < 0 ? own * 0.12 : 0), 0, -A.s * 0.06);
  }
}

// ---------------------------------------------------------------- living
// o: { owner(): {x,y,z} | null, targets(): [{x,y,z,h,r,kind}], dur, yaw, hp, hit(point) (caster only: a boulder landed) }
export function spawnGolem(g, o) {
  const fx = g.fx, scene = g.scene, D = buildGolem(), root = D.root, G = geos(), M = mats(), dur = o.dur || GOLEM.dur;
  const ground = (x, z) => g.world.heightAt(x, z);
  const own0 = o.owner() || { x: 0, y: 0, z: 0 }, yaw0 = o.yaw || 0;
  const st = { mode: 'emerge', t0: 0, yaw: yaw0, hunch: 1, ph: 0, walk: 0, speed: 0, thr: -1, cd: 0.6, tgt: null, hp: o.hp || GOLEM.hp, maxHp: o.hp || GOLEM.hp, thrown: 0, lastC: 1, rock: null, done: false };
  const place = (x, z) => { root.position.set(x, ground(x, z), z); };
  place(own0.x + Math.sin(yaw0) * 5, own0.z + Math.cos(yaw0) * 5);
  root.rotation.y = st.yaw; scene.add(root);
  const rubble = new THREE.Mesh(G.rubble, M.body); rubble.castShadow = true; rubble.receiveShadow = true; scene.add(rubble);
  const tmp = V(), tmp2 = V();
  const vol = () => { const c = g.camera.position; return clamp(1.2 - Math.hypot(c.x - root.position.x, c.z - root.position.z) / 70, 0.1, 1); };
  const near = () => { const c = g.camera.position; return Math.hypot(c.x - root.position.x, c.z - root.position.z); };
  const grit = (x, y, z, n, sp = 1) => { for (let i = 0; i < fx.n(n); i++) { const a = Math.random() * 6.28, r = rnd(2, 8) * sp; fx.debris.emit({ p: [x + rnd(-0.6, 0.6), y + 0.2, z + rnd(-0.6, 0.6)], v: [Math.cos(a) * r, rnd(4, 11) * sp, Math.sin(a) * r], life: rnd(0.6, 1.3), s0: rnd(0.25, 0.7), s1: 0.2, c0: [0.5, 0.5, 0.5, 1], c1: [0.4, 0.4, 0.4, 0], g: 18, drag: 0.3 }); } };
  const burst = (first) => { // rocks and dust burst up where he breaks through
    const p = root.position, gy = ground(p.x, p.z);
    fx.dustBurst([p.x, gy, p.z], first ? 2.6 : 1.2, [0.5, 0.48, 0.45]); grit(p.x, gy, p.z, first ? 34 : 8, first ? 1.2 : 0.7);
    if (first) { fx.shockwave([p.x, gy, p.z], 7, 0xb8b0a4, 0.5); fx.decal([p.x, 0, p.z], TX.crackDecal(), 9, dur + 4); g.audio.play('quake', vol()); g.audio.play('earth', vol()); if (near() < 30) g.shake(0.45); }
  };
  const startEmerge = (x, z, t) => { place(x, z); rubble.position.set(x, ground(x, z) - 0.6, z); rubble.rotation.y = Math.random() * 6.28; st.mode = 'emerge'; st.t0 = t; st.hunch = 1; st.thr = -1; st.walk = 0; dropRock(); burst(true); };
  const dropRock = () => { if (st.rock) { st.rock.parent && st.rock.parent.remove(st.rock); st.rock = null; } };

  // a thrown boulder: a high heavy arc, tumbling, smashing into debris and dust where it lands
  const hurl = (from, to) => {
    const m = new THREE.Mesh(G.boulder, M.body); m.castShadow = true; m.position.copy(from); scene.add(m);
    const dx = to.x - from.x, dz = to.z - from.z, dist = Math.hypot(dx, dz), T = clamp(dist / 24, 0.7, 1.5), GR = 22;
    const vel = V(dx / T, (to.y - from.y + 0.5 * GR * T * T) / T, dz / T), spin = [rnd(-5, 5), rnd(-3, 3), rnd(-5, 5)], pos = from.clone();
    let life = 0;
    fx.add({ dur: 6, update: (dt) => {
      life += dt; vel.y -= GR * dt; pos.addScaledVector(vel, dt); m.position.copy(pos); m.rotation.x += spin[0] * dt; m.rotation.y += spin[1] * dt; m.rotation.z += spin[2] * dt;
      if (Math.random() < 0.6) fx.debris.emit({ p: [pos.x + rnd(-0.6, 0.6), pos.y + rnd(-0.6, 0.6), pos.z + rnd(-0.6, 0.6)], v: [rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)], life: rnd(0.3, 0.6), s0: 0.18, s1: 0.06, c0: [0.5, 0.5, 0.5, 1], c1: [0.4, 0.4, 0.4, 0], g: 10 });
      if (Math.random() < 0.5) fx.smoke.emit({ p: [pos.x, pos.y, pos.z], v: [0, 0.4, 0], life: 0.7, s0: 0.8, s1: 2, c0: [0.55, 0.53, 0.5, 0.3], c1: [0.55, 0.53, 0.5, 0], drag: 1 });
      const gy = ground(pos.x, pos.z);
      let hit = pos.y <= gy + 0.6;
      if (!hit && life > 0.25) for (const t of o.targets()) { if (t.kind === 'demon') continue; if (Math.hypot(t.x - pos.x, t.z - pos.z) < t.r + 1.2 && pos.y > t.y - 0.5 && pos.y < t.y + t.h + 1) { hit = true; break; } }
      if (!hit) return;
      const p = [pos.x, Math.max(pos.y, gy), pos.z];
      fx.dustBurst([p[0], gy, p[2]], 2.3, [0.52, 0.5, 0.47]); fx.shockwave([p[0], gy, p[2]], GOLEM.radius + 1, 0xc0b8aa, 0.45); fx.decal([p[0], 0, p[2]], TX.crackDecal(), 8, 9);
      grit(p[0], p[1], p[2], 30, 1.1);
      g.audio.play('quake', vol() * 0.8); if (g.distTo(p[0], p[2]) < 25) g.shake(0.3);
      o.hit && o.hit(p);
      return false;
    }, dispose: () => scene.remove(m) });
  };

  // crumble: every rock comes loose, falls and tumbles into a heap, then sinks away
  const crumble = () => {
    const p = root.position, gy = ground(p.x, p.z); root.updateMatrixWorld(true);
    for (const c of D.cores) c.visible = false; dropRock();
    const parts = D.rocks.map((q) => { scene.attach(q); const c = tmp.set(0, 0, 0); q.geometry.boundingBox || q.geometry.computeBoundingBox(); q.geometry.boundingBox.getCenter(c); q.localToWorld(c);
      return { q, cy: c.y - q.position.y, cx: c.x - q.position.x, cz: c.z - q.position.z, v: V((c.x - p.x) * rnd(0.5, 1.2) + rnd(-0.6, 0.6), rnd(0, 1.5), (c.z - p.z) * rnd(0.5, 1.2) + rnd(-0.6, 0.6)), w: V(rnd(-2.5, 2.5), rnd(-1.5, 1.5), rnd(-2.5, 2.5)), rest: false, wait: (5.5 - (c.y - gy)) * 0.05 }; });
    scene.remove(root);
    fx.dustBurst([p.x, gy, p.z], 2.4, [0.5, 0.48, 0.45]); g.audio.play('quake', vol()); g.audio.play('earth', vol() * 0.7); if (near() < 25) g.shake(0.3);
    let t = 0;
    fx.add({ dur: 6, update: (dt) => {
      t += dt;
      for (const P of parts) {
        const q = P.q; if (t < P.wait) continue;
        if (!P.rest) { P.v.y -= 20 * dt; q.position.addScaledVector(P.v, dt); q.rotation.x += P.w.x * dt; q.rotation.y += P.w.y * dt; q.rotation.z += P.w.z * dt;
          const fl = ground(q.position.x + P.cx, q.position.z + P.cz) + 0.35;
          if (q.position.y + P.cy < fl) { q.position.y = fl - P.cy; if (P.v.y < -5) { P.v.y *= -0.22; P.v.x *= 0.5; P.v.z *= 0.5; P.w.multiplyScalar(0.4); fx.dustBurst([q.position.x + P.cx, fl, q.position.z + P.cz], 0.6, [0.5, 0.48, 0.45]); } else P.rest = true; } }
        if (t > 3) q.position.y -= dt * 1.1;
      }
      rubble.position.y -= t > 3 ? dt * 0.5 : 0;
      if (t > 4.6) return false;
    }, dispose: () => { for (const P of parts) scene.remove(P.q); scene.remove(rubble); } });
  };

  const DEPTH = 4.3;
  burst(true); rubble.position.set(root.position.x, root.position.y - 0.6, root.position.z);
  const fxh = fx.add({
    dur: dur + 1,
    update: (dt, t) => {
      const own = o.owner(), pos = root.position;
      if ((!own || t > dur || st.hp <= 0) && !st.done) { st.done = true; crumble(); return false; }
      const O = own || own0;
      let sink = 0;
      if (st.mode === 'emerge') { // up out of the ground hunched, head down, then he straightens to his full height
        const e = t - st.t0, up = ease(e / 1.3);
        sink = -DEPTH * (1 - up); rubble.position.y = ground(rubble.position.x, rubble.position.z) - 0.6 * (1 - up);
        st.hunch = 1 - ease((e - 1.5) / 1.3);
        if (e < 1.3 && Math.random() < dt * 14) burst(false);
        if (e > 2.9) { st.mode = 'idle'; st.cd = 0.3; }
      } else {
        // who to throw at
        if (st.thr < 0) { let best = null, bd = GOLEM.range; for (const q of o.targets()) { if (q.kind === 'demon') continue; const d = Math.hypot(q.x - pos.x, q.z - pos.z); if (d < bd && d > 3) { bd = d; best = q; } } st.tgt = best; }
        else if (st.tgt) { const f = o.targets().find((q) => q.id === st.tgt.id); if (f) st.tgt = f; }
        st.cd -= dt;
        const dO = Math.hypot(O.x - pos.x, O.z - pos.z);
        if (dO > 48 && st.thr < 0) { const a = Math.random() * 6.28; startEmerge(O.x + Math.sin(a) * 5, O.z + Math.cos(a) * 5, t); return; } // left far behind: he comes up out of the ground beside his summoner
        let wantYaw = st.yaw, wantSpeed = 0;
        if (st.thr >= 0) { // the throw: stoop, rip a boulder out of the ground, heave it overhead, hurl it
          const was = st.thr; st.thr += dt;
          if (st.tgt) wantYaw = Math.atan2(st.tgt.x - pos.x, st.tgt.z - pos.z);
          const fist = D.arms[1].fist;
          if (was < RIP && st.thr >= RIP) { fist.getWorldPosition(tmp); const gy = ground(tmp.x, tmp.z); fx.dustBurst([tmp.x, gy, tmp.z], 1.4, [0.5, 0.48, 0.45]); grit(tmp.x, gy, tmp.z, 14, 0.8); fx.decal([tmp.x, 0, tmp.z], TX.crackDecal(), 4, 6); g.audio.play('earth', vol());
            st.rock = new THREE.Mesh(G.boulder, M.body); st.rock.castShadow = true; st.rock.position.set(0, -1.15, 0.45); st.rock.scale.setScalar(0.2); fist.add(st.rock); }
          if (st.rock) st.rock.scale.setScalar(Math.min(1, st.rock.scale.x + dt * 3.5));
          if (was < RELEASE && st.thr >= RELEASE && st.rock) { st.rock.getWorldPosition(tmp); dropRock(); const q = st.tgt;
            if (q) tmp2.set(q.x, q.y + (q.y - ground(q.x, q.z) > 2.5 ? (q.h || 2) * 0.5 : 0.3), q.z); else tmp2.set(pos.x + Math.sin(st.yaw) * 18, pos.y, pos.z + Math.cos(st.yaw) * 18);
            hurl(tmp.clone(), tmp2.clone()); st.thrown++; g.audio.play('swing', vol()); }
          if (st.thr >= THROW) { st.thr = -1; st.cd = GOLEM.every - THROW; }
        } else if (st.tgt && st.cd <= 0 && dO < 40) { st.thr = 0; }
        else if (dO > 7 || (st.walk > 0.3 && dO > 4.5)) { wantYaw = Math.atan2(O.x - pos.x, O.z - pos.z); wantSpeed = dO > 20 ? 7.5 : dO > 12 ? 5.5 : GOLEM.speed; }
        else if (st.tgt) wantYaw = Math.atan2(st.tgt.x - pos.x, st.tgt.z - pos.z);
        if (wantSpeed > 0) { // walls: feel ahead and step round whatever is in the way; if he is truly stuck he comes up out of the ground beside his summoner
          const blocked = (y) => { for (const d of [1.6, 3]) { const X = pos.x + Math.sin(y) * d, Z = pos.z + Math.cos(y) * d; if (g.world.solidPoint(X, ground(X, Z) + 1.6, Z, 1.3) || Math.abs(ground(X, Z) - ground(pos.x, pos.z)) > 2.2) return true; } return false; };
          let found = true;
          if (blocked(wantYaw)) { found = false; for (const off of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) { const y = wantYaw + off * (st.side || 1); if (!blocked(y)) { wantYaw = y; found = true; if (off < 0) st.side = -(st.side || 1); break; } } if (!found) wantSpeed = 0; }
          st.stuck = Math.max(0, (st.stuck || 0) + (!found ? dt : wantYaw !== Math.atan2(O.x - pos.x, O.z - pos.z) ? dt * 0.3 : -dt));
          if (st.stuck > 2.5 && st.thr < 0) { st.stuck = 0; const a = Math.random() * 6.28; startEmerge(O.x + Math.sin(a) * 4, O.z + Math.cos(a) * 4, t); return; }
        } else st.stuck = 0;
        st.yaw += clamp(wrap(wantYaw - st.yaw), -2.4 * dt, 2.4 * dt);
        st.speed += clamp(wantSpeed - st.speed, -9 * dt, 5 * dt);
        st.walk += ((st.speed > 0.3 ? 1 : 0) - st.walk) * Math.min(1, dt * 5);
        if (st.speed > 0.05) { pos.x += Math.sin(st.yaw) * st.speed * dt; pos.z += Math.cos(st.yaw) * st.speed * dt; st.ph += st.speed * dt * 1.75; }
        else st.ph += wrap(Math.round(st.ph / Math.PI) * Math.PI - st.ph) * Math.min(1, dt * 4); // settle with both feet down
        const c = Math.cos(st.ph); // a foot comes down each time this changes sign: the ground shakes
        if (st.walk > 0.5 && c * st.lastC < 0) { const L = D.legs[c > 0 ? 1 : 0]; L.foot.getWorldPosition(tmp); fx.dustBurst([tmp.x, ground(tmp.x, tmp.z), tmp.z], 0.7, [0.5, 0.48, 0.45]); g.audio.play('quake', vol() * 0.35); if (near() < 14) g.shake(0.12); }
        st.lastC = c;
        // he can be worn down: anything hostile at his feet chips his health
        for (const q of o.targets()) { if (q.kind === 'demon') continue; if (Math.hypot(q.x - pos.x, q.z - pos.z) < 3.4 + q.r && Math.abs(q.y - pos.y) < 6) st.hp -= dt * (q.kind === 'boss' ? 90 : q.kind === 'player' ? 60 : 22); }
      }
      pos.y = ground(pos.x, pos.z) + sink;
      root.rotation.y = st.yaw;
      poseGolem(D, st);
    },
    dispose: () => { fxh.done = true; if (!st.done) { st.done = true; dropRock(); scene.remove(root); scene.remove(rubble); } },
  });
  return { root, state: st, fx: fxh, parts: D };
}
