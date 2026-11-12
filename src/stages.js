// The two extra maps: the Hot Springs Valley (a stream, a pond, steaming pools, blossom trees, flowers) and the hidden space map
// (a huge crashed UFO burning in a crater, alien plants, a ringed planet in a starry sky). Both are visual dressing on top of the
// normal world generator: world.js calls prepStage() before the terrain is built (ground shaping goes through world.flats / world.carves)
// and buildStageExtras() after the props. Everything is seeded from the round seed so every player sees the same map, and nothing here
// touches the gameplay random stream.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './rng.js';
import { propLibrary } from './props.js';
import * as TX from './textures.js';
import { scanMat, groundTex } from './scan.js';
import { Shell, hall } from './buildkit.js';

const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;

export function prepStage(w) {
  w.carves = []; w.flats = w.flats || [];
  const id = w.biome.id;
  if (id === 'springs') setupSprings(w);
  else if (id === 'space') setupSpace(w);
  else if (id === 'waterfall') setupWaterfall(w);
  else if (id === 'clearing') setupClearing(w);
  else if (id === 'volcano') setupVolcano(w);
  else if (id === 'ruins') setupRuins(w);
}
export function buildStageExtras(w) {
  const st = w.stage;
  if (!st) return;
  if (st.id === 'springs') buildSprings(w, st);
  else if (st.id === 'space') buildSpace(w, st);
  else if (st.id === 'waterfall') buildWaterfall(w, st);
  else if (st.id === 'clearing') buildClearing(w, st);
  else if (st.id === 'volcano') buildVolcano(w, st);
  else if (st.id === 'ruins') buildRuins(w, st);
}

// ---------- shared helpers ----------
// Jittered low-poly blob (canopies, boulders): an icosphere with its vertices pushed around by a hash, vertex-coloured.
function blob(r, detail, jit, seed, colA, colB, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail).toNonIndexed();
  const pos = g.attributes.position, rnd = mulberry32(seed), n = pos.count, col = new Float32Array(n * 3);
  const keep = new Map();
  for (let i = 0; i < n; i++) {
    const k = pos.getX(i).toFixed(3) + ',' + pos.getY(i).toFixed(3) + ',' + pos.getZ(i).toFixed(3);
    if (!keep.has(k)) keep.set(k, 1 + (rnd() - 0.5) * jit);
    const s = keep.get(k);
    pos.setXYZ(i, pos.getX(i) * s * sx, pos.getY(i) * s * sy, pos.getZ(i) * s * sz);
    const t = Math.max(0, Math.min(1, (pos.getY(i) / (r * sy) + 1) / 2)), c = new THREE.Color(colA).lerp(new THREE.Color(colB), t);
    const v = 0.88 + rnd() * 0.24;
    col[i * 3] = c.r * v; col[i * 3 + 1] = c.g * v; col[i * 3 + 2] = c.b * v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}
function tint(g, hex) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const prep = (g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); if (!n.attributes.normal) n.computeVertexNormals(); return n; };
const matrixAt = (x, y, z, ry = 0, s = 1, sy = s) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(s, sy, s));
const stdVC = (o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, ...o });

const SOFT = (() => { // a soft round sprite for steam, smoke and glow
  let t = null;
  return () => {
    if (t) return t;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    t = new THREE.CanvasTexture(c);
    return t;
  };
})();

// Rising puffs (steam, smoke, embers) from a set of sources. Each puff lives `life` seconds, climbs `rise` m and drifts with `drift`.
export function plume(w, sources, { count, color, size, rise, life, alpha, spread, additive = false, drift = [0.6, 0, 0.3], grow = 2.2 }) {
  const n = Math.max(8, Math.round(count * [0.4, 0.7, 1][w.quality])), seed = new Float32Array(n * 4), pos = new Float32Array(n * 3), r = mulberry32(w.seed * 3 + 91);
  const src = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    seed[i * 4] = r(); seed[i * 4 + 1] = r(); seed[i * 4 + 2] = r(); seed[i * 4 + 3] = r();
    const s = sources[i % sources.length];
    src[i * 4] = s.x; src[i * 4 + 1] = s.y; src[i * 4 + 2] = s.z; src[i * 4 + 3] = s.r || 1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  g.setAttribute('aSrc', new THREE.BufferAttribute(src, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e4);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uMap: { value: SOFT() }, uCol: { value: new THREE.Color(color) }, uPx: { value: 700 } },
    vertexShader: `attribute vec4 aSeed; attribute vec4 aSrc; uniform float uT, uPx; varying float vA;
      void main(){
        float ph = fract(uT / ${life.toFixed(2)} + aSeed.x);
        vec3 p = aSrc.xyz + vec3((aSeed.y - .5) * aSrc.w * ${spread.toFixed(2)}, ph * ${rise.toFixed(2)}, (aSeed.z - .5) * aSrc.w * ${spread.toFixed(2)});
        p += vec3(${drift.map((d) => d.toFixed(2)).join(',')}) * ph * ${rise.toFixed(2)} * (.4 + aSeed.w);
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = ${size.toFixed(2)} * (1. + ph * ${grow.toFixed(2)}) * uPx / max(1., -mv.z);
        vA = sin(ph * 3.14159) * ${alpha.toFixed(2)};
      }`,
    fragmentShader: `uniform sampler2D uMap; uniform vec3 uCol; varying float vA;
      void main(){ float a = texture2D(uMap, gl_PointCoord).a * vA; gl_FragColor = vec4(uCol, a); }`,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false; pts.renderOrder = 4;
  w.group.add(pts);
  w.animated.push((t) => { mat.uniforms.uT.value = t; mat.uniforms.uPx.value = Math.max(300, (w.pxScale || 700)); });
  return pts;
}

// Water: gently rolling ripples and slow glints, tinted deep to shallow; takes the scene fog.
function waterMaterial(w, { deep, shallow, alpha = 0.8, glow = 0 }) {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uT: { value: 0 }, uDeep: { value: new THREE.Color(deep) }, uShallow: { value: new THREE.Color(shallow) }, uA: { value: alpha }, uGlow: { value: glow }, tN: { value: (() => { const t = TX.macroNoise(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; return t; })() } }]),
    vertexShader: `varying vec3 vP;
      #include <fog_pars_vertex>
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.); vP = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    // Real-looking water: a fine ripple normal built from two drifting layers of noise, a sharp sun glint off it, sky
    // reflected at grazing angles, the bed showing through where you look straight down (Nutty: "even the water").
    fragmentShader: `uniform float uT, uA, uGlow; uniform vec3 uDeep, uShallow; uniform sampler2D tN; varying vec3 vP;
      #include <fog_pars_fragment>
      float hgt(vec2 p){ return texture2D(tN, p * .11 + vec2(uT * .018, uT * .011)).r * .6 + texture2D(tN, p * .37 + vec2(-uT * .03, uT * .022)).r * .3 + texture2D(tN, p * 1.1 + vec2(uT * .05, -uT * .04)).r * .1; }
      void main(){
        vec2 p = vP.xz;
        float e = .08, h0 = hgt(p), hx = hgt(p + vec2(e, 0.)), hz = hgt(p + vec2(0., e));
        vec3 N = normalize(vec3((h0 - hx) * 2.4, e * 1.0, (h0 - hz) * 2.4));
        vec3 V = normalize(cameraPosition - vP), L = normalize(vec3(-.42, .62, .5)), H = normalize(V + L);
        float fres = .04 + .96 * pow(1. - clamp(dot(N, V), 0., 1.), 4.);
        float swell = sin(p.x * .55 + uT * 1.1 + sin(p.y * .31 + uT * .5) * 1.7) * .5 + sin(p.y * .7 - uT * .9) * .5;
        vec3 bed = mix(uDeep, uShallow, clamp(.5 + swell * .3 + (h0 - .5) * .8, 0., 1.));
        vec3 sky = mix(vec3(.55, .68, .78), vec3(.86, .92, .97), clamp(N.y * .5 + .5, 0., 1.));
        vec3 col = mix(bed, sky, fres * .85);
        float spec = pow(max(dot(N, H), 0.), 420.) * 2.2 + pow(max(dot(N, H), 0.), 40.) * .18;
        col += spec * vec3(1., .97, .9);
        col += uGlow * (.5 + (h0 - .5) * .8) * vec3(.35, .9, .85);
        gl_FragColor = vec4(col, mix(uA, 1., fres * .6));
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, fog: true,
  });
  w.animated.push((t) => (mat.uniforms.uT.value = t));
  return mat;
}

// A broad-leaved tree: a trunk and a few jittered canopy blobs, vertex-coloured.
const leafTrunk = (h, r0, r1) => tint(prep(new THREE.CylinderGeometry(r1, r0, h, 7, 1).translate(0, h / 2, 0)), 0x5a4030);
const leafTree = (colA, colB, seed, scale) => mergeGeometries([
  leafTrunk(3.2 * scale, 0.32 * scale, 0.2 * scale),
  blob(2.3 * scale, 1, 0.45, seed, colA, colB, 1, 0.85, 1).translate(0, 4.4 * scale, 0),
  blob(1.7 * scale, 1, 0.45, seed + 1, colA, colB, 1, 0.85, 1).translate(1.3 * scale, 3.6 * scale, 0.4 * scale),
  blob(1.6 * scale, 1, 0.45, seed + 2, colA, colB, 1, 0.85, 1).translate(-1.2 * scale, 3.8 * scale, -0.5 * scale),
  blob(1.3 * scale, 1, 0.45, seed + 3, colA, colB, 1, 0.85, 1).translate(0.2 * scale, 5.7 * scale, 0.5 * scale),
].map((g) => (g.index ? g.toNonIndexed() : g)));
// Plant broad-leaved trees: `pick` returns a candidate [x, z] (or null). Adds colliders and contact blobs.
function plantTrees(w, r, geo, count, pick, { bl = 1.8, placed = [] } = {}) {
  const items = [];
  for (let i = 0, k = 0; i < count && k < count * 40; k++) {
    const c = pick(); if (!c) continue;
    const [x, z] = c;
    if (!w.clearOf(x, z, 2.2) || w.blocked(x, z, 2) || Math.hypot(x, z) > 162) continue;
    if (placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < 4.2)) continue;
    const h = w.heightAt(x, z);
    if (Math.abs(w.heightAt(x + 1.5, z) - h) > 0.9 || Math.abs(w.heightAt(x, z + 1.5) - h) > 0.9) continue;
    const s = 0.75 + r() * 0.6;
    items.push({ m: matrixAt(x, h - 0.1, z, r() * TAU, s), x, z });
    w.addCollider(x, z, 0.55 * s, h + 7 * s);
    w.blobs.push({ x, z, y: h, r: bl * s });
    placed.push([x, z]); i++;
  }
  w.addInstanced([{ geo, mat: stdVC({ roughness: 0.82 }) }], items, { cast: true });
  return placed;
}
// Wildflowers through the grass: `pick` returns a candidate [x, z].
function scatterFlowers(w, r, count, pick, cols = [0xffd23a, 0xff6a8a, 0xffffff, 0xc77dff, 0xff9a3a, 0x7ad0ff]) {
  const headGeo = prep(new THREE.IcosahedronGeometry(0.13, 0).translate(0, 0.42, 0)), stalkGeo = tint(prep(new THREE.CylinderGeometry(0.012, 0.016, 0.42, 4).translate(0, 0.21, 0)), 0x4a8a34);
  const heads = [], stalks = [];
  for (let i = 0, k = 0; i < count && k < count * 6; k++) {
    const [x, z] = pick();
    if (!w.clearOf(x, z, 0.5) || w.blocked(x, z, 0.4)) continue;
    const h = w.heightAt(x, z), sc = 0.8 + r() * 0.9, m = matrixAt(x, h - 0.02, z, r() * TAU, sc);
    heads.push({ m, x, z, c: new THREE.Color(cols[Math.floor(r() * cols.length)]) }); stalks.push({ m, x, z }); i++;
  }
  w.addInstanced([{ geo: headGeo, mat: new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: 0x222222 }) }], heads, { cast: false, receive: false });
  w.addInstanced([{ geo: stalkGeo, mat: stdVC({ roughness: 0.8 }) }], stalks, { cast: false, receive: false });
}
// A water ribbon that follows the ground along a polyline (streams, lava rivers). uv: x across, y along.
function ribbon(w, pts, hw0, hw1, sink, mat, vScale = 0.5) {
  const n = pts.length, pos = [], uv = [], idx = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const hw = hw0 + (i / n) * (hw1 - hw0), cy = w.heightAt(pts[i][0], pts[i][1]) - sink;
    pos.push(pts[i][0] - tz * hw, cy, pts[i][1] + tx * hw, pts[i][0] + tz * hw, cy, pts[i][1] - tx * hw);
    uv.push(0, i * vScale, 1, i * vScale);
    if (i < n - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 2; m.frustumCulled = false; w.group.add(m);
  return m;
}
const nearPoly = (pts) => (x, z) => { let b = 1e9; for (let i = 0; i < pts.length - 1; i++) { const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0] - ax, bz = pts[i + 1][1] - az, t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz))); b = Math.min(b, Math.hypot(x - ax - bx * t, z - az - bz * t)); } return b; };
// Photo-scanned boulders from the biome's rock kit: `pick` returns a candidate [x, z]. Big ones get colliders and shadows.
function scanBoulders(w, r, count, pick, { s = [1.2, 3.4], sink = 0.15, maxSlope = 1.2 } = {}) {
  const def = propLibrary(w.biome, w.quality).rock(), vars = def.variants, lists = vars.map(() => []);
  for (let i = 0, k = 0; i < count && k < count * 30; k++) {
    const c = pick(); if (!c) continue;
    const [x, z] = c, sc = s[0] + r() * (s[1] - s[0]);
    if (!w.clearOf(x, z, sc) || w.blocked(x, z, sc * 0.9) || Math.hypot(x, z) > 164) continue;
    const h = w.heightAt(x, z);
    if (Math.abs(w.heightAt(x + 1.5, z) - h) > maxSlope || Math.abs(w.heightAt(x, z + 1.5) - h) > maxSlope) continue;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.2, r() * TAU, (r() - 0.5) * 0.2));
    lists[Math.floor(r() * vars.length)].push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x, h - sink * sc, z), q, new THREE.Vector3(sc, sc * (0.8 + r() * 0.4), sc)), x, z });
    w.addCollider(x, z, sc * 0.9, h + sc * 1.6); w.blobs.push({ x, z, y: h, r: 1.5 * sc });
    i++;
  }
  vars.forEach((parts, vi) => lists[vi].length && w.addInstanced(parts, lists[vi], { cast: true }));
}
// A direction (unit x, z) that points away from both the spawn camp and the boss arena: sideways from the spawn.
function sideDir(w, r) {
  const as = Math.atan2(w.spawn.z, w.spawn.x), a = as + (r() < 0.5 ? 1 : -1) * Math.PI / 2;
  return [Math.cos(a), Math.sin(a)];
}

// ======================================================================================================================
// HOT SPRINGS VALLEY
// ======================================================================================================================
function setupSprings(w) {
  const r = mulberry32(w.seed * 7 + 1234);
  const far = (x, z, d) => Math.hypot(x - w.spawn.x, z - w.spawn.z) > d && Math.hypot(x - w.arena.x, z - w.arena.z) > w.arena.r + d * 0.6;
  const cands = [];
  for (let tries = 0; cands.length < 14 && tries < 200; tries++) {
    const a = r() * TAU, d = 38 + r() * 55, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (far(x, z, 48)) cands.push({ x, z, h: w.rawHeight(x, z) });
  }
  if (cands.length < 4) cands.push({ x: 20, z: 20, h: w.rawHeight(20, 20) }, { x: -60, z: 40, h: w.rawHeight(-60, 40) }, { x: 50, z: -60, h: w.rawHeight(50, -60) }, { x: -40, z: -70, h: w.rawHeight(-40, -70) });
  const pond = cands.reduce((a, b) => (b.h < a.h ? b : a));
  const source = cands.filter((c) => Math.hypot(c.x - pond.x, c.z - pond.z) > 62).reduce((a, b) => (b.h > a.h ? b : a), cands.find((c) => Math.hypot(c.x - pond.x, c.z - pond.z) > 62) || cands[0]);
  // The stream: from the high source to the pond, wandering side to side.
  const pts = [], N = 26, dx = pond.x - source.x, dz = pond.z - source.z, L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L, ph = r() * 6;
  for (let i = 0; i <= N; i++) {
    const t = i / N, off = Math.sin(t * Math.PI) * 11 * Math.sin(t * 5 + ph) + Math.sin(t * 13 + ph * 2) * 2.2 * Math.sin(t * Math.PI);
    pts.push([source.x + dx * t + nx * off, source.z + dz * t + nz * off]);
  }
  const pondR = 15, base = pond.h;
  // Hot spring pools beside the pond, away from the stream, from each other, the camp and the boss arena.
  const pools = [];
  const nearStream = (x, z) => { let b = 1e9; for (let i = 0; i < pts.length - 1; i++) { const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0] - ax, bz = pts[i + 1][1] - az, t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz))); b = Math.min(b, Math.hypot(x - ax - bx * t, z - az - bz * t)); } return b; };
  for (let tries = 0; pools.length < 4 && tries < 120; tries++) {
    const a = r() * TAU, d = pondR + 16 + r() * 22, x = pond.x + Math.cos(a) * d, z = pond.z + Math.sin(a) * d, pr = 5 + r() * 3;
    if (!far(x, z, 30) || Math.hypot(x, z) > 146 || nearStream(x, z) < pr + 8) continue;
    if (pools.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + pr + 12)) continue;
    pools.push({ x, z, r: pr, h: w.rawHeight(x, z) });
  }
  // Shape the ground: a basin for the pond, a bowl for each pool, a channel for the stream.
  w.flats.push({ x: pond.x, z: pond.z, r: pondR, blend: 13, h: base - 2.0 });
  for (const p of pools) w.flats.push({ x: p.x, z: p.z, r: p.r, blend: 4, h: p.h - 1.0 });
  const HW = 1.5, BL = 2.6, DEPTH = 0.85;
  w.carves.push((x, z, h) => {
    if (x < w.stageBox.x0 || x > w.stageBox.x1 || z < w.stageBox.z0 || z > w.stageBox.z1) return h;
    const d = nearStream(x, z);
    if (d > HW + BL) return h;
    return h - DEPTH * smooth(1 - (d - HW) / BL);
  });
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  w.stageBox = { x0: x0 - 8, x1: x1 + 8, z0: z0 - 8, z1: z1 + 8 };
  w.stage = {
    id: 'springs', pond: { x: pond.x, z: pond.z, r: pondR, base }, pools, stream: pts, HW, nearStream,
    noPlace(x, z, rad) {
      if (Math.hypot(x - pond.x, z - pond.z) < pondR + 9 + rad) return true;
      for (const p of pools) if (Math.hypot(x - p.x, z - p.z) < p.r + 3.5 + rad) return true;
      return nearStream(x, z) < HW + 3 + rad;
    },
  };
}

function buildSprings(w, st) {
  const r = mulberry32(w.seed * 11 + 777), Q = w.quality, pond = st.pond;
  const lvlPond = pond.base - 0.85;
  // ---- water ----
  const pondMat = waterMaterial(w, { deep: 0x1d6f8a, shallow: 0x58c4cf, alpha: 0.82 });
  const pondMesh = new THREE.Mesh(new THREE.CircleGeometry(pond.r + 12, 56).rotateX(-Math.PI / 2), pondMat);
  pondMesh.position.set(pond.x, lvlPond, pond.z); pondMesh.renderOrder = 2; pondMesh.frustumCulled = false; w.group.add(pondMesh);
  const poolMat = waterMaterial(w, { deep: 0x2aa7b4, shallow: 0x9af2e6, alpha: 0.88, glow: 0.35 });
  for (const p of st.pools) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(p.r + 3, 40).rotateX(-Math.PI / 2), poolMat);
    m.position.set(p.x, p.h - 0.38, p.z); m.renderOrder = 2; m.frustumCulled = false; w.group.add(m);
  }
  // The stream: a ribbon that follows the ground along its channel and ends in the pond.
  {
    const pts = st.stream, n = pts.length, pos = [], idx = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const hw = 3.4 + (i / n) * 1.2, cy = w.heightAt(pts[i][0], pts[i][1]) - 0.4;
      pos.push(pts[i][0] - tz * hw, cy, pts[i][1] + tx * hw, pts[i][0] + tz * hw, cy, pts[i][1] - tx * hw);
      if (i < n - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const m = new THREE.Mesh(g, waterMaterial(w, { deep: 0x2a8aa0, shallow: 0x7fd6dc, alpha: 0.72 }));
    m.renderOrder = 2; m.frustumCulled = false; w.group.add(m);
  }
  // Steam rising off every hot spring (and a faint mist over the pond).
  plume(w, st.pools.map((p) => ({ x: p.x, y: p.h - 0.3, z: p.z, r: p.r })), { count: 130, color: 0xf2f6f8, size: 7, rise: 9, life: 5.5, alpha: 0.34, spread: 1.5, grow: 1.8 });
  plume(w, [{ x: pond.x, y: lvlPond + 0.2, z: pond.z, r: pond.r }], { count: 50, color: 0xe6f0f2, size: 8, rise: 2.5, life: 9, alpha: 0.16, spread: 1.6, drift: [0.3, 0, 0.1] });

  // ---- stones round the pools, lily pads, reeds ----
  // Scanned stones ring every pool (Nutty 2026-11-05: no clay on this map).
  for (const p of st.pools) { let i = 0; const n = 12 + Math.floor(r() * 4); scanBoulders(w, r, n, () => { const a = (i++ / n) * TAU + r() * 0.3, d = p.r + 0.4 + r() * 0.8; return [p.x + Math.cos(a) * d, p.z + Math.sin(a) * d]; }, { s: [0.45, 0.9], sink: 0.2, maxSlope: 9 }); }
  const pad = new THREE.CircleGeometry(0.7, 14).rotateX(-Math.PI / 2); tint(pad, 0x3f8a3a);
  const pads = [];
  for (let i = 0; i < 46; i++) {
    const a = r() * TAU, d = 2 + r() * (pond.r + 4), x = pond.x + Math.cos(a) * d, z = pond.z + Math.sin(a) * d;
    pads.push({ m: matrixAt(x, lvlPond + 0.05, z, r() * TAU, 0.7 + r() * 0.9), x, z });
  }
  w.addInstanced([{ geo: prep(pad), mat: stdVC({ side: THREE.DoubleSide, roughness: 0.6 }) }], pads, { cast: false, receive: false });
  const reedGeo = (() => { const parts = []; for (let k = 0; k < 6; k++) { const c = new THREE.ConeGeometry(0.05, 2.1 + (k % 3) * 0.4, 4, 1).translate(0, 1.1, 0); c.rotateZ((k - 2.5) * 0.09); c.rotateY(k * 1.1); c.translate(Math.cos(k * 2) * 0.3, 0, Math.sin(k * 2) * 0.3); parts.push(tint(prep(c), k % 2 ? 0x5f8f3a : 0x7aa044)); } return mergeGeometries(parts); })();
  const reeds = [];
  const nearWater = (x, z) => Math.abs(Math.hypot(x - pond.x, z - pond.z) - (pond.r + 3)) < 3 || st.nearStream(x, z) < 5.4;
  for (let i = 0, k = 0; i < [60, 110, 170][Q] && k < 4000; k++) {
    const a = r() * TAU, d = pond.r + r() * 12, x = pond.x + Math.cos(a) * d, z = pond.z + Math.sin(a) * d;
    if (!nearWater(x, z) || w.heightAt(x, z) < lvlPond - 0.1) continue;
    reeds.push({ m: matrixAt(x, w.heightAt(x, z) - 0.1, z, r() * TAU, 0.8 + r() * 0.7), x, z }); i++;
  }
  for (let i = 0, k = 0; i < [40, 80, 120][Q] && k < 4000; k++) {
    const p = st.stream[Math.floor(r() * st.stream.length)], x = p[0] + (r() - 0.5) * 14, z = p[1] + (r() - 0.5) * 14;
    const d = st.nearStream(x, z); if (d < 3.6 || d > 6.5) continue;
    reeds.push({ m: matrixAt(x, w.heightAt(x, z) - 0.1, z, r() * TAU, 0.7 + r() * 0.6), x, z }); i++;
  }
  w.addInstanced([{ geo: reedGeo, mat: stdVC({ side: THREE.DoubleSide, roughness: 0.8 }) }], reeds, { cast: false });

  // ---- big scanned boulders through the valley, and a few giants by the pond (the clay trees and flowers are gone) ----
  scanBoulders(w, r, [50, 80, 110][Q], () => [(r() * 2 - 1) * 161, (r() * 2 - 1) * 161], { s: [1.4, 3.6] });
  scanBoulders(w, r, 8, () => { const a = r() * TAU, d = pond.r + 10 + r() * 22; return [pond.x + Math.cos(a) * d, pond.z + Math.sin(a) * d]; }, { s: [3.5, 5.5], sink: 0.3 });
}

// ======================================================================================================================
// CRASH SITE PRIME (the hidden space map)
// ======================================================================================================================
function setupSpace(w) {
  const r = mulberry32(w.seed * 9 + 555);
  const craters = [{ x: 0, z: 0, r: 34, d: 7.5, rim: 3.2 }]; // the UFO's own crater
  for (let tries = 0; craters.length < 13 && tries < 200; tries++) {
    const a = r() * TAU, d = 30 + r() * 125, x = Math.cos(a) * d, z = Math.sin(a) * d, cr = 6 + r() * 12;
    if (Math.hypot(x - w.spawn.x, z - w.spawn.z) < cr + 20 || Math.hypot(x - w.arena.x, z - w.arena.z) < w.arena.r + cr + 8) continue;
    if (craters.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + cr + 4)) continue;
    craters.push({ x, z, r: cr, d: cr * 0.16, rim: cr * 0.06 });
  }
  // Moon-style minor craters everywhere (Nutty 2026-11-05): shallow bowls the player can walk in and out of.
  for (let tries = 0; craters.length < 48 && tries < 600; tries++) {
    const a = r() * TAU, d = 28 + r() * 135, x = Math.cos(a) * d, z = Math.sin(a) * d, cr = 3.5 + r() * 5;
    if (Math.hypot(x - w.spawn.x, z - w.spawn.z) < cr + 6 || Math.hypot(x - w.arena.x, z - w.arena.z) < w.arena.r + cr + 2) continue;
    if (craters.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + cr + 1.5)) continue;
    craters.push({ x, z, r: cr, d: cr * 0.22, rim: cr * 0.08 });
  }
  w.carves.push((x, z, h) => {
    for (const c of craters) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d > c.r * 1.6) continue;
      if (d < c.r) h -= c.d * (1 - (d / c.r) * (d / c.r));
      const e = (d - c.r) / (c.r * 0.28);
      h += c.rim * Math.exp(-e * e);
    }
    return h;
  });
  w.stage = {
    id: 'space', craters, ufo: { x: 0, z: 0, r: 25 },
    noPlace(x, z, rad) { return Math.hypot(x, z) < 38 + rad; },
  };
}

function buildSpace(w, st) {
  const r = mulberry32(w.seed * 13 + 4321), Q = w.quality;
  const floor = w.heightAt(0, 0);
  // ---- the UFO ----
  const ufo = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x59606b, roughness: 0.38, metalness: 0.92 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.5, metalness: 0.85 });
  const scorch = new THREE.MeshStandardMaterial({ color: 0x1a1412, roughness: 0.9, metalness: 0.4 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x7dffd8, toneMapped: false });
  const lampOff = new THREE.MeshStandardMaterial({ color: 0x0e1a18, roughness: 0.4, metalness: 0.6 });
  const prof = [[0, -3.2], [9, -3.6], [17, -2.9], [23, -1.2], [25.5, 0.4], [24, 1.7], [18, 2.7], [11, 3.5], [5, 4.6], [0, 5.0]].map(([rr, y]) => new THREE.Vector2(rr, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), hull);
  body.castShadow = true; body.receiveShadow = true; ufo.add(body);
  for (const [rr, y, tr] of [[25.4, 0.5, 0.55], [18.5, 2.75, 0.4], [10, -3.4, 0.45]]) { const t = new THREE.Mesh(new THREE.TorusGeometry(rr, tr, 8, 64).rotateX(Math.PI / 2), dark); t.position.y = y; ufo.add(t); }
  // Window lamps around the rim: most are dark, a few still glow.
  const lampGeo = new THREE.BoxGeometry(1.5, 0.7, 0.5);
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU, lamp = new THREE.Mesh(lampGeo, r() < 0.28 ? glowMat : lampOff);
    lamp.position.set(Math.cos(a) * 25.1, 0.5, Math.sin(a) * 25.1); lamp.rotation.y = -a + Math.PI / 2; ufo.add(lamp);
  }
  // The cracked dome with a sick green glow inside.
  const dome = new THREE.Mesh(new THREE.SphereGeometry(7.5, 28, 16, 0, TAU, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x9fe8d0, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1, clearcoat: 1, side: THREE.DoubleSide, emissive: 0x1a6a4a, emissiveIntensity: 0.6 }));
  dome.position.y = 4.4; ufo.add(dome);
  const core = new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 10), glowMat); core.position.y = 6.2; ufo.add(core);
  // Burnt scars and torn plating chunks sticking out of the hull.
  for (let i = 0; i < 9; i++) {
    const a = r() * TAU, rr = 15 + r() * 8, chunk = new THREE.Mesh(new THREE.BoxGeometry(3 + r() * 5, 0.5, 2 + r() * 3), i % 2 ? dark : scorch);
    chunk.position.set(Math.cos(a) * rr, 1.8 + r() * 1.8, Math.sin(a) * rr); chunk.rotation.set((r() - 0.5) * 0.9, r() * TAU, (r() - 0.5) * 0.9); chunk.castShadow = true; ufo.add(chunk);
  }
  // Landing struts snapped off, one still planted.
  for (const [a, broke] of [[0.8, false], [2.4, true], [4.0, true]]) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, broke ? 3 : 7, 8), dark);
    s.position.set(Math.cos(a) * 17, broke ? -3.6 : -5.3, Math.sin(a) * 17); s.rotation.z = broke ? 0.6 : 0; ufo.add(s);
  }
  // Half-buried in the crater, tipped over.
  ufo.position.set(0, floor + 3.4, 0); ufo.rotation.set(0.22, 0.6, -0.16);
  ufo.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  w.group.add(ufo);
  w.addCollider(0, 0, 23, floor + 14);
  w.blobs.push({ x: 0, z: 0, y: floor, r: 30 });

  // ---- fire ----
  // Each fire is a cluster of camera-facing flame tongues (one draw call for all of them). The shader warps layered noise
  // upward so the tongues lick and split, and colours by heat: a white-yellow core, orange body, deep red tips that fade out.
  const flameMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 } },
    vertexShader: `attribute vec3 aC; attribute vec3 aS; varying vec2 vUv; varying float vSeed;
      uniform float uT;
      void main(){
        vUv = uv; vSeed = aS.z;
        vec3 toCam = cameraPosition - aC; toCam.y = 0.; toCam = normalize(toCam);
        vec3 right = normalize(cross(vec3(0., 1., 0.), toCam));
        float sway = sin(uT * 1.7 + aS.z * 6.) * .12 + sin(uT * 3.1 + aS.z * 11.) * .06;
        vec3 p = aC + right * (uv.x - .5) * aS.x + vec3(0., uv.y * aS.y, 0.);
        p += right * sway * aS.x * uv.y * uv.y + vec3(.35, 0., .12) * aS.y * .18 * uv.y * uv.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
      }`,
    fragmentShader: `uniform float uT; varying vec2 vUv; varying float vSeed;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float nz(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 4; i++) { v += a * nz(p); p = p * 2.03 + 17.1; a *= .5; } return v; }
      void main(){
        float y = vUv.y, t = uT * (1. + fract(vSeed * 7.3) * .4) + vSeed * 40.;
        vec2 q = vec2(vUv.x * 2.2 + vSeed * 9., y * 1.6 - t * 1.25);
        vec2 warp = vec2(fbm(q), fbm(q + 5.2)) - .5;
        float n = fbm(vec2(vUv.x * 3.4, y * 2.6 - t * 2.1) + warp * 1.6 + vSeed * 3.);
        float x = (vUv.x - .5) + warp.x * .5 * y;               // the tongue bends and splits higher up
        float width = mix(.34, .02, pow(y, .65)) * (.75 + n * .6);                  // wide at the base, a point at the top
        float body = 1. - smoothstep(0., width, abs(x)); body *= body;
        float heat = body * smoothstep(1., .05, y + (n - .5) * .55) * smoothstep(0., .08, y);
        heat *= .55 + n * .9;
        heat -= y * (1. - n) * 1.1;           // ragged tips that break off
        heat = clamp(heat, 0., 1.);
        vec3 col = mix(vec3(.45, .04, .01), vec3(1., .28, .03), smoothstep(.08, .4, heat));
        col = mix(col, vec3(1., .62, .14), smoothstep(.35, .7, heat));
        col = mix(col, vec3(1., .95, .75), smoothstep(.7, .98, heat));
        float a = smoothstep(.04, .3, heat);
        gl_FragColor = vec4(col * (.25 + heat * .45) * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  w.animated.push((t) => (flameMat.uniforms.uT.value = t));
  const fires = [[16, 3.2, 8], [-14, 3.5, -12], [4, 5.5, -19], [-21, 2.6, 4], [20, 1.2, -10], [-2, 8.5, 2], [9, 4.0, 17], [-10, 3.2, 14]];
  const smokeSrc = [], emberSrc = [], tongues = [];
  fires.forEach(([fx, fy, fz], i) => {
    const wp = new THREE.Vector3(fx, fy, fz).applyEuler(ufo.rotation).add(ufo.position), s = 7 + (i % 3) * 3;
    // a tall main tongue, a ring of smaller licks around it, and low flames rolling along the base
    tongues.push([wp.x, wp.y - 0.4, wp.z, s * 1.0, s * 1.55, r()]);
    const n = 5 + (i % 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + r() * 0.8, d = s * (0.12 + r() * 0.22), hh = s * (0.6 + r() * 0.6);
      tongues.push([wp.x + Math.cos(a) * d, wp.y - 0.3 - r() * 0.4, wp.z + Math.sin(a) * d, hh * 0.7, hh, r()]);
    }
    for (let k = 0; k < 3; k++) { const a = r() * TAU, d = s * 0.3 * r(); tongues.push([wp.x + Math.cos(a) * d, wp.y - 0.2, wp.z + Math.sin(a) * d, s * 0.9, s * 0.45, r()]); }
    smokeSrc.push({ x: wp.x, y: wp.y + s * 1.2, z: wp.z, r: 3 }); emberSrc.push({ x: wp.x, y: wp.y + 1, z: wp.z, r: 4 });
  });
  {
    const N = tongues.length, pos = new Float32Array(N * 12), uv = new Float32Array(N * 8), aC = new Float32Array(N * 12), aS = new Float32Array(N * 12), idx = [];
    tongues.forEach(([x, y, z, tw, th, seed], k) => {
      [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], j) => {
        const o = k * 4 + j;
        pos.set([x, y, z], o * 3); uv.set([u, v], o * 2); aC.set([x, y, z], o * 3); aS.set([tw, th, seed], o * 3);
      });
      const o = k * 4; idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aC', new THREE.BufferAttribute(aC, 3)); g.setAttribute('aS', new THREE.BufferAttribute(aS, 3)); g.setIndex(idx);
    const m = new THREE.Mesh(g, flameMat); m.renderOrder = 5; m.frustumCulled = false; w.group.add(m);
  }
  // Hot glow at the foot of each fire, flickering.
  const baseGlow = new THREE.SpriteMaterial({ map: SOFT(), color: 0xff7a26, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  fires.forEach(([fx, fy, fz], i) => {
    const wp = new THREE.Vector3(fx, fy, fz).applyEuler(ufo.rotation).add(ufo.position), s = 7 + (i % 3) * 3;
    const sp = new THREE.Sprite(baseGlow); sp.position.set(wp.x, wp.y + s * 0.25, wp.z); sp.scale.set(s * 2.2, s * 1.4, 1); sp.renderOrder = 4; w.group.add(sp);
  });
  w.animated.push((t) => { baseGlow.opacity = 0.2 + Math.sin(t * 9.1) * 0.03 + Math.sin(t * 15.7) * 0.025; });
  plume(w, smokeSrc, { count: 170, color: 0x1f1a18, size: 14, rise: 70, life: 9, alpha: 0.55, spread: 1.6, drift: [1.1, 0, 0.4], grow: 2.6 });
  plume(w, emberSrc, { count: 220, color: 0xffb050, size: 0.3, rise: 30, life: 3.4, alpha: 1, spread: 2, additive: true, drift: [0.7, 0, 0.25], grow: 0.2 });
  // A pool of firelight on the crater floor.
  const glowTex = SOFT();
  const lightPool = new THREE.Mesh(new THREE.PlaneGeometry(34, 34).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex, color: 0xff6a1a, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  lightPool.position.set(0, floor + 1.2, 0); lightPool.renderOrder = 1; lightPool.frustumCulled = false; w.group.add(lightPool);
  w.animated.push((t) => { lightPool.material.opacity = 0.22 + Math.sin(t * 7) * 0.03 + Math.sin(t * 13.3) * 0.02; });

  // ---- wreckage and alien plants ----
  // (the low-poly wreckage chunks are gone: Nutty wants nothing clay on the moon; the UFO's own torn plating stays)
  // ---- space rocks in weird formations (Nutty 2026-11-05: no trees or plants, only rock) ----
  // Scanned boulders stacked into arches, balancing towers, leaning spires and stone rings, plus loose boulders.
  const rockDef = propLibrary(w.biome, Q).rock(), rvars = rockDef.variants, rlists = rvars.map(() => []);
  const putRock = (x, y, z, sc, sy, yaw, tiltX = 0, tiltZ = 0) => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, yaw, tiltZ));
    rlists[Math.floor(r() * rvars.length)].push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sc, sy, sc)), x, z });
  };
  const formations = [];
  for (let i = 0, k = 0; i < [14, 20, 26][Q] && k < 900; k++) {
    const a = r() * TAU, d = 34 + r() * 118, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!w.clearOf(x, z, 7) || w.blocked(x, z, 6) || formations.some((f) => Math.hypot(f[0] - x, f[1] - z) < 16)) continue;
    const h = w.heightAt(x, z), kind = Math.floor(r() * 4), yaw = r() * TAU;
    if (kind === 0) { // arch: two uprights and a bridge stone
      const g = 3 + r() * 1.5, sc = 1.6 + r() * 0.6, hh = sc * 2.6, c = Math.cos(yaw), sn = Math.sin(yaw);
      putRock(x + c * g, h - 0.3, z - sn * g, sc, sc * 2.1, yaw + 0.3); putRock(x - c * g, h - 0.3, z + sn * g, sc, sc * 2.0, yaw - 0.4);
      putRock(x, h + hh, z, sc * 1.3, sc * 0.75, yaw + 1.57, 0, 0.08);
      w.addCollider(x + c * g, z - sn * g, sc, h + hh); w.addCollider(x - c * g, z + sn * g, sc, h + hh);
      w.platforms.push({ x, z, r: sc * 1.6, top: h + hh + sc * 0.6 });
    } else if (kind === 1) { // balancing tower: three boulders getting smaller, slightly off axis
      let y = h - 0.3, sc = 2.0 + r() * 0.7, ox = 0, oz = 0;
      for (let j = 0; j < 3; j++) { putRock(x + ox, y, z + oz, sc, sc * 0.8, r() * TAU, (r() - 0.5) * 0.15, (r() - 0.5) * 0.15); y += sc * 1.25; sc *= 0.78; ox += (r() - 0.5) * 0.8; oz += (r() - 0.5) * 0.8; }
      w.addCollider(x, z, 2.2, y); w.platforms.push({ x: x + ox, z: z + oz, r: sc * 1.3, top: y + sc * 0.2 });
    } else if (kind === 2) { // leaning spire
      const sc = 1.4 + r() * 0.5, lean = 0.25 + r() * 0.2;
      putRock(x, h - 0.5, z, sc, sc * 4.2, yaw, lean, 0); w.addCollider(x, z, sc * 1.1, h + sc * 6);
    } else { // ring of standing stones round a shallow hollow
      const n = 5 + Math.floor(r() * 3), R = 4 + r() * 2;
      for (let j = 0; j < n; j++) { const aa = (j / n) * TAU + yaw, sc = 0.9 + r() * 0.5, sx = x + Math.cos(aa) * R, sz = z + Math.sin(aa) * R; putRock(sx, w.heightAt(sx, sz) - 0.3, sz, sc, sc * 2.2, aa, (r() - 0.5) * 0.2, (r() - 0.5) * 0.2); w.addCollider(sx, sz, sc * 0.9, h + sc * 3); }
    }
    w.blobs.push({ x, z, y: h, r: 7 }); formations.push([x, z]); i++;
  }
  rvars.forEach((parts, vi) => rlists[vi].length && w.addInstanced(parts, rlists[vi], { cast: true }));
  scanBoulders(w, r, [40, 70, 100][Q], () => { const a = r() * TAU, d = 30 + r() * 130; return [Math.cos(a) * d, Math.sin(a) * d]; }, { s: [0.8, 3.0], sink: 0.2, maxSlope: 2.5 });

  // ---- the sky: stars and a ringed planet ----
  const starN = 1400, sp = new Float32Array(starN * 3), sc = new Float32Array(starN * 3);
  for (let i = 0; i < starN; i++) {
    const u = r() * 2 - 1, a = r() * TAU, q = Math.sqrt(1 - u * u), rad = 820;
    sp[i * 3] = Math.cos(a) * q * rad; sp[i * 3 + 1] = Math.abs(u) * rad * 0.95 + 20; sp[i * 3 + 2] = Math.sin(a) * q * rad;
    const b = 0.5 + r() * 0.8; sc[i * 3] = b; sc[i * 3 + 1] = b * (0.85 + r() * 0.15); sc[i * 3 + 2] = b * (0.8 + r() * 0.3);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false, transparent: true }));
  stars.renderOrder = -0.8; stars.frustumCulled = false; w.group.add(stars);
  // The galaxy: a band of milky light and coloured nebulae painted on the inside of the sky, plus more worlds.
  const gal = new THREE.Mesh(new THREE.SphereGeometry(860, 48, 24), new THREE.MeshBasicMaterial({ map: galaxyTexture(), transparent: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  gal.rotation.set(0.55, 0.8, 0.3); gal.renderOrder = -0.85; gal.frustumCulled = false; w.group.add(gal);
  const worlds = new THREE.Group();
  const shade = (c1, c2, f) => new THREE.ShaderMaterial({
    uniforms: { c1: { value: new THREE.Color(c1) }, c2: { value: new THREE.Color(c2) }, f: { value: f } },
    vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'uniform vec3 c1, c2; uniform float f; varying vec3 vN; varying vec3 vP; void main(){ float b = sin(vP.y * f) * .5 + .5 + sin(vP.y * f * 3.3 + 1.) * .15; vec3 c = mix(c1, c2, b); float l = clamp(dot(normalize(vN), normalize(vec3(-.6, .35, .7))) * .9 + .12, .05, 1.); gl_FragColor = vec4(c * l, 1.); }',
    fog: false, depthWrite: false,
  });
  const gas = new THREE.Mesh(new THREE.SphereGeometry(75, 32, 20), shade(0x2a5aa8, 0x9fd0ff, 0.14)); gas.position.set(520, 300, 180); worlds.add(gas);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(28, 24, 14), shade(0x6a3a30, 0xd09a80, 0.5)); moon.position.set(140, 420, -600); worlds.add(moon);
  const far = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 10), shade(0x8ab0a0, 0xe0fff0, 0.9)); far.position.set(-640, 250, 320); worlds.add(far);
  const glare = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshBasicMaterial({ map: SOFT(), color: 0xfff0d0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
  glare.position.set(-700, 380, -200); glare.lookAt(0, 0, 0); worlds.add(glare);
  worlds.renderOrder = -0.7; worlds.traverse((o) => { o.frustumCulled = false; o.renderOrder = -0.7; }); w.group.add(worlds);
  const planet = new THREE.Group();
  const bands = new THREE.ShaderMaterial({
    uniforms: {}, vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'varying vec3 vN; varying vec3 vP; void main(){ float b = sin(vP.y * .09) * .5 + .5 + sin(vP.y * .31 + 1.) * .15; vec3 c = mix(vec3(.55, .28, .22), vec3(.95, .72, .5), b); float l = clamp(dot(normalize(vN), normalize(vec3(-.6, .35, .7))) * .9 + .15, .08, 1.); gl_FragColor = vec4(c * l, 1.); }',
    fog: false, depthWrite: false,
  });
  planet.add(new THREE.Mesh(new THREE.SphereGeometry(130, 40, 24), bands));
  const ring = new THREE.Mesh(new THREE.RingGeometry(170, 250, 80, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd9b48a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, fog: false, depthWrite: false }));
  ring.rotation.set(0.35, 0, 0.18); planet.add(ring);
  planet.position.set(-420, 330, -560); planet.renderOrder = -0.7; planet.traverse((o) => { o.frustumCulled = false; o.renderOrder = -0.7; });
  w.group.add(planet);
}

// An equirectangular painting of the galaxy: a tilted band of milky light with dust lanes, two coloured nebulae, dense faint
// stars. Alpha, so the biome's horizon glow still shows through beneath it.
function galaxyTexture() {
  const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), r = mulberry32(4242);
  x.clearRect(0, 0, W, H);
  // Faint far stars.
  for (let i = 0; i < 2600; i++) { const b = r(); x.fillStyle = `rgba(${200 + (r() * 55) | 0},${200 + (r() * 55) | 0},255,${0.15 + b * 0.5})`; const s = b > 0.9 ? 2 : 1; x.fillRect(r() * W, r() * H, s, s); }
  // The band: a wavy strip across the middle, built from many soft blobs.
  const band = (y0, amp, n, col, size, a) => { for (let i = 0; i < n; i++) { const u = r(), px = u * W, py = y0 + Math.sin(u * 6.28 + 1) * amp + (r() - 0.5) * size * 1.2; const g = x.createRadialGradient(px, py, 0, px, py, size * (0.5 + r())); g.addColorStop(0, col.replace('A', String(a))); g.addColorStop(1, col.replace('A', '0')); x.fillStyle = g; x.fillRect(px - size * 2, py - size * 2, size * 4, size * 4); } };
  band(H / 2, 40, 220, 'rgba(210,200,235,A)', 52, 0.16);
  band(H / 2, 40, 320, 'rgba(255,245,230,A)', 24, 0.22);
  band(H / 2, 40, 120, 'rgba(90,70,110,A)', 30, 0.2); // dust lanes
  // Nebulae.
  for (const [cx, cy, col, sz] of [[300, 180, 'rgba(190,90,230,A)', 90], [760, 330, 'rgba(70,210,230,A)', 80], [560, 120, 'rgba(255,130,100,A)', 60]]) {
    for (let i = 0; i < 26; i++) { const px = cx + (r() - 0.5) * sz * 2, py = cy + (r() - 0.5) * sz; const g = x.createRadialGradient(px, py, 0, px, py, sz * (0.3 + r() * 0.5)); g.addColorStop(0, col.replace('A', '0.16')); g.addColorStop(1, col.replace('A', '0')); x.fillStyle = g; x.fillRect(px - sz, py - sz, sz * 2, sz * 2); }
  }
  // Bright stars along the band.
  for (let i = 0; i < 500; i++) { const u = r(), px = u * W, py = H / 2 + Math.sin(u * 6.28 + 1) * 40 + (r() - 0.5) * 90; x.fillStyle = `rgba(255,250,240,${0.4 + r() * 0.6})`; const s = r() > 0.85 ? 2 : 1; x.fillRect(px, py, s, s); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ======================================================================================================================
// WATERFALL VALLEY: a cliff wall along one side of the valley, a waterfall dropping into a plunge pool, a stream across
// the valley floor to a pond, broad-leaved trees and flowers by the water.
// ======================================================================================================================
function setupWaterfall(w) {
  const r = mulberry32(w.seed * 7 + 2468);
  const [ux, uz] = sideDir(w, r);
  const WALL = 86, RISE = 44;
  const n = w.noise2;
  // The cliff: the ground climbs steeply past the wall line, with ridges along its face.
  w.carves.push((x, z, h) => {
    const p = x * ux + z * uz;
    if (p < WALL - 2) return h;
    const t = smooth((p - WALL + 2) / 7);
    const side = -x * uz + z * ux;
    return h + RISE * t + (n.fbm(side * 0.05, p * 0.08, 3) - 0.5) * 6 * t + Math.pow(Math.max(0, p - WALL - 11), 1.1) * 0.5;
  });
  // The plunge pool at the foot of the fall, and a pond far down the valley fed by the stream.
  const pool = { x: ux * (WALL - 10), z: uz * (WALL - 10), r: 12 };
  pool.base = w.rawHeight(pool.x, pool.z);
  const cands = [];
  for (let tries = 0; cands.length < 12 && tries < 300; tries++) {
    const a = r() * TAU, d = 30 + r() * 60, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (x * ux + z * uz > 40 || Math.hypot(x - pool.x, z - pool.z) < 70) continue;
    if (Math.hypot(x - w.spawn.x, z - w.spawn.z) < 45 || Math.hypot(x - w.arena.x, z - w.arena.z) < w.arena.r + 30) continue;
    cands.push({ x, z, h: w.rawHeight(x, z) });
  }
  if (!cands.length) cands.push({ x: -ux * 40, z: -uz * 40, h: w.rawHeight(-ux * 40, -uz * 40) });
  const pond = cands.reduce((a, b) => (b.h < a.h ? b : a));
  pond.r = 13; pond.base = pond.h;
  const pts = [], N = 28, dx = pond.x - pool.x, dz = pond.z - pool.z, L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L, ph = r() * 6;
  for (let i = 0; i <= N; i++) {
    const t = i / N, off = Math.sin(t * Math.PI) * 12 * Math.sin(t * 4.5 + ph) + Math.sin(t * 11 + ph * 2) * 2.5 * Math.sin(t * Math.PI);
    pts.push([pool.x + dx * t + nx * off, pool.z + dz * t + nz * off]);
  }
  const nearStream = nearPoly(pts), HW = 1.6, BL = 2.8, DEPTH = 0.9;
  w.flats.push({ x: pool.x, z: pool.z, r: pool.r, blend: 10, h: pool.base - 2.4 });
  w.flats.push({ x: pond.x, z: pond.z, r: pond.r, blend: 12, h: pond.base - 2.0 });
  w.carves.push((x, z, h) => { const d = nearStream(x, z); return d > HW + BL ? h : h - DEPTH * smooth(1 - (d - HW) / BL); });
  const fall = { x: ux * (WALL - 3.5), z: uz * (WALL - 3.5) };
  w.stage = {
    id: 'waterfall', ux, uz, WALL, RISE, pool, pond, stream: pts, nearStream, HW, fall,
    noPlace(x, z, rad) {
      if (x * ux + z * uz > WALL - 6 - rad) return true;
      if (Math.hypot(x - pool.x, z - pool.z) < pool.r + 7 + rad || Math.hypot(x - pond.x, z - pond.z) < pond.r + 8 + rad) return true;
      return nearStream(x, z) < HW + 3 + rad;
    },
  };
}

function buildWaterfall(w, st) {
  const r = mulberry32(w.seed * 11 + 1357), Q = w.quality, { pool, pond, ux, uz } = st;
  const lvlPool = pool.base - 2.4 - 0.7, lvlPond = pond.base - 2.0 - 0.8;
  // ---- water ----
  const mk = (c, lvl, rr) => { const m = new THREE.Mesh(new THREE.CircleGeometry(rr, 56).rotateX(-Math.PI / 2), waterMaterial(w, { deep: 0x1b6a86, shallow: 0x5cc6d2, alpha: 0.84 })); m.position.set(c.x, lvl, c.z); m.renderOrder = 2; m.frustumCulled = false; w.group.add(m); };
  mk(pool, lvlPool, pool.r + 10); mk(pond, lvlPond, pond.r + 11);
  ribbon(w, st.stream, 3.6, 4.6, 0.4, waterMaterial(w, { deep: 0x2a8aa0, shallow: 0x7fd6dc, alpha: 0.72 }));
  // ---- the fall: two sheets of streaming water from the cliff top to the pool ----
  const top = w.heightAt(st.fall.x + ux * 9, st.fall.z + uz * 9), H = top - lvlPool + 1.5, W = 9;
  const fallMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uT: { value: 0 }, uK: { value: 1 } }]),
    vertexShader: `varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uT, uK; varying vec2 vUv;
      #include <fog_pars_fragment>
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float nz(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        float y = vUv.y;
        float s1 = nz(vec2(vUv.x * 14. * uK, y * 6. + uT * 2.2)), s2 = nz(vec2(vUv.x * 30. * uK + 7., y * 14. + uT * 3.4));
        float streak = smoothstep(.35, .95, s1 * .6 + s2 * .5);
        float edge = smoothstep(0., .12, vUv.x) * smoothstep(1., .88, vUv.x);
        float foam = smoothstep(.75, 1., 1. - y) * .5 + smoothstep(.2, 0., y) * .6;
        float a = clamp((streak * .75 + .25 + foam) * edge, 0., 1.) * .92;
        vec3 c = mix(vec3(.62, .82, .92), vec3(1., 1., 1.), streak * .6 + foam);
        gl_FragColor = vec4(c, a);
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
  });
  w.animated.push((t) => (fallMat.uniforms.uT.value = t));
  const sheet = new THREE.PlaneGeometry(W, H, 1, 24);
  { // the sheet bows out from the lip, then hangs straight
    const p = sheet.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = (p.getY(i) / H) + 0.5; p.setZ(i, Math.sin(t * Math.PI * 0.5) * 2.2); }
  }
  const yaw = Math.atan2(ux, uz);
  for (const [off, k, dz] of [[0, 1, 0], [0.6, 1.7, -0.5]]) {
    const m = new THREE.Mesh(sheet, k === 1 ? fallMat : (() => { const f = fallMat.clone(); f.uniforms.uK.value = k; w.animated.push((t) => (f.uniforms.uT.value = t * 1.3)); return f; })());
    m.position.set(st.fall.x - ux * (1 + dz) + uz * off, lvlPool - 1.5 + H / 2, st.fall.z - uz * (1 + dz) - ux * off);
    m.rotation.y = yaw + Math.PI; m.renderOrder = 3; m.frustumCulled = false; w.group.add(m);
  }
  // Spray and mist: at the foot, and drifting off the drop.
  plume(w, [{ x: pool.x + ux * 7, y: lvlPool, z: pool.z + uz * 7, r: 5 }], { count: 170, color: 0xf4f8fa, size: 9, rise: 12, life: 4.5, alpha: 0.4, spread: 1.6, grow: 2.2, drift: [-ux * 0.5, 0, -uz * 0.5] });
  plume(w, [{ x: pool.x, y: lvlPool + 0.2, z: pool.z, r: pool.r }], { count: 60, color: 0xe6f0f2, size: 9, rise: 3, life: 9, alpha: 0.18, spread: 1.6, drift: [0.2, 0, 0.1] });
  plume(w, [{ x: st.fall.x - ux * 3, y: lvlPool + H * 0.55, z: st.fall.z - uz * 3, r: 4 }], { count: 50, color: 0xf4f8fa, size: 6, rise: 6, life: 3.5, alpha: 0.22, spread: 2.2, grow: 2.4, drift: [-ux * 1.2, 0, -uz * 1.2] });
  // Scanned boulders at the lip and round the pool.
  { let i = 0; scanBoulders(w, r, 16, () => { const a = (i++ / 16) * TAU + r() * 0.3, d = pool.r + 0.8 + r() * 2.5, x = pool.x + Math.cos(a) * d, z = pool.z + Math.sin(a) * d; return x * ux + z * uz > st.WALL - 5 ? null : [x, z]; }, { s: [1.0, 2.6], sink: 0.25, maxSlope: 9 }); }
  { let i = 0; scanBoulders(w, r, 6, () => { const off = (i++ - 2.5) * 3.2; return [st.fall.x + uz * off + ux * 2.5, st.fall.z - ux * off + uz * 2.5]; }, { s: [1.8, 3.2], sink: 0.5, maxSlope: 99 }); }
  // Lily pads on the pond, broad-leaved trees by the water, flowers through the grass.
  const pad = new THREE.CircleGeometry(0.7, 14).rotateX(-Math.PI / 2); tint(pad, 0x3f8a3a);
  const pads = [];
  for (let i = 0; i < 40; i++) { const a = r() * TAU, d = 2 + r() * (pond.r + 3), x = pond.x + Math.cos(a) * d, z = pond.z + Math.sin(a) * d; pads.push({ m: matrixAt(x, lvlPond + 0.05, z, r() * TAU, 0.7 + r() * 0.9), x, z }); }
  w.addInstanced([{ geo: prep(pad), mat: stdVC({ side: THREE.DoubleSide, roughness: 0.6 }) }], pads, { cast: false, receive: false });
  scanBoulders(w, r, [50, 80, 110][Q], () => [(r() * 2 - 1) * 161, (r() * 2 - 1) * 161], { s: [1.4, 3.6] });
  scanBoulders(w, r, 10, () => { const c = r() < 0.5 ? pool : pond, a = r() * TAU, d = c.r + 10 + r() * 22; return [c.x + Math.cos(a) * d, c.z + Math.sin(a) * d]; }, { s: [3.2, 5.2], sink: 0.3 });
}

// ======================================================================================================================
// FOREST CLEARING: a wide sunlit glade ringed by dense pines, stumps and logs in the grass, shafts of late sun.
// ======================================================================================================================
function setupClearing(w) {
  const r = mulberry32(w.seed * 7 + 3579);
  const GR = 30, g = { x: (r() - 0.5) * 10, z: (r() - 0.5) * 10, r: GR };
  g.h = w.rawHeight(g.x, g.z);
  w.flats.push({ x: g.x, z: g.z, r: GR, blend: 24, h: g.h });
  w.stage = {
    id: 'clearing', glade: g,
    noPlace(x, z, rad) { return rad > 0.9 && Math.hypot(x - g.x, z - g.z) < GR + rad - 2; }, // the glade stays open: trees and big props keep to the edge, grass and small things still grow in it
  };
}

function buildClearing(w, st) {
  const r = mulberry32(w.seed * 11 + 9753), Q = w.quality, g = st.glade;
  const lib = propLibrary(w.biome, Q);
  // A thick ring of pines just outside the glade, on top of the biome's own scatter.
  const pine = lib.pine(), vars = pine.variants || [pine.parts];
  const items = vars.map(() => []);
  for (let i = 0, k = 0; i < [150, 240, 340][Q] && k < 5000; k++) {
    const a = r() * TAU, d = g.r + 1 + Math.pow(r(), 1.4) * 42, x = g.x + Math.cos(a) * d, z = g.z + Math.sin(a) * d;
    if (!w.clearOf(x, z, 1.6) || w.blocked(x, z, 1.4)) continue;
    const h = w.heightAt(x, z), s = pine.s[0] + r() * (pine.s[1] - pine.s[0]);
    items[Math.floor(r() * vars.length)].push({ m: matrixAt(x, h - 0.1, z, r() * TAU, s), x, z });
    w.addCollider(x, z, pine.r * s, h + 9 * s); w.blobs.push({ x, z, y: h, r: 1.5 * s });
    i++;
  }
  vars.forEach((parts, vi) => items[vi].length && w.addInstanced(parts, items[vi], { cast: true }));
  // Stumps and fallen logs in the grass.
  for (const [kind, n, bl] of [['stump', 9, 0.8], ['log', 6, 1.5]]) {
    const def = lib[kind](), parts = def.variants ? def.variants[0] : def.parts, list = [];
    for (let i = 0, k = 0; i < n && k < 400; k++) {
      const a = r() * TAU, d = 4 + r() * (g.r - 6), x = g.x + Math.cos(a) * d, z = g.z + Math.sin(a) * d;
      if (Math.hypot(x - w.spawn.x, z - w.spawn.z) < 18 || Math.hypot(x - w.arena.x, z - w.arena.z) < w.arena.r + 6) continue;
      const h = w.heightAt(x, z), s = def.s[0] + r() * (def.s[1] - def.s[0]);
      list.push({ m: matrixAt(x, h - 0.05, z, r() * TAU, s), x, z }); w.blobs.push({ x, z, y: h, r: bl * s });
      if (def.r) w.addCollider(x, z, def.r * s, h + 1.5 * s);
      i++;
    }
    if (list.length) w.addInstanced(parts, list, { cast: true });
  }
  // Scanned boulders in and around the glade (no flowers: Nutty 2026-11-05).
  scanBoulders(w, r, [14, 22, 30][Q], () => { const a = r() * TAU, d = 6 + r() * (g.r + 14); return [g.x + Math.cos(a) * d, g.z + Math.sin(a) * d]; }, { s: [1.0, 3.0] });
  // Shafts of low sun slanting through the trees round the glade.
  const shaftTex = (() => { const c = document.createElement('canvas'); c.width = 32; c.height = 128; const x = c.getContext('2d'); const gr = x.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,230,180,0)'); gr.addColorStop(0.25, 'rgba(255,230,180,0.55)'); gr.addColorStop(0.75, 'rgba(255,225,170,0.4)'); gr.addColorStop(1, 'rgba(255,220,160,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 128); const g2 = x.createLinearGradient(0, 0, 32, 0); g2.addColorStop(0, 'rgba(0,0,0,1)'); g2.addColorStop(0.5, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,1)'); x.globalCompositeOperation = 'destination-out'; x.fillStyle = g2; x.fillRect(0, 0, 32, 128); return new THREE.CanvasTexture(c); })();
  const shaftMat = new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const shaftGeo = new THREE.PlaneGeometry(1, 1);
  const shafts = [];
  for (let i = 0; i < [8, 12, 16][Q]; i++) {
    const a = r() * TAU, d = g.r * 0.5 + r() * g.r * 0.8, x = g.x + Math.cos(a) * d, z = g.z + Math.sin(a) * d, h = w.heightAt(x, z);
    const m = new THREE.Mesh(shaftGeo, shaftMat), W = 2.5 + r() * 4, H = 55;
    m.scale.set(W, H, 1); m.position.set(x + 10, h + H * 0.42, z - 2); m.rotation.set(0, r() * TAU, 0.42); m.renderOrder = 4; m.frustumCulled = false;
    w.group.add(m); shafts.push(m);
  }
  w.animated.push((t) => { shaftMat.opacity = 0.13 + Math.sin(t * 0.37) * 0.03; });
}

// ======================================================================================================================
// THE VOLCANO: a smoking cone on one side of the map with a lava lake in its crater, rivers of lava running down the
// slope onto the plain, embers in the air and a sky lit from below.
// ======================================================================================================================
function setupVolcano(w) {
  const r = mulberry32(w.seed * 7 + 4680);
  const [ux, uz] = sideDir(w, r);
  const C = { x: ux * 140, z: uz * 140, r: 135, h: 78, crater: 16 };
  const n = w.noise2;
  w.carves.push((x, z, h) => {
    const d = Math.hypot(x - C.x, z - C.z);
    if (d > C.r) return h;
    const t = smooth(1 - d / C.r), cone = C.h * Math.pow(t, 1.7) + (n.fbm(x * 0.03, z * 0.03, 3) - 0.5) * 10 * t;
    const dip = 24 * smooth(1 - d / C.crater);
    return h + cone - dip;
  });
  // Lava rivers: three channels from the crater rim down the slope toward the plain.
  const rivers = [], back = Math.atan2(-uz, -ux);
  for (let k = 0; k < 3; k++) {
    const a = back + (k - 1) * 0.55 + (r() - 0.5) * 0.3, len = 58 + r() * 26, pts = [], ph = r() * 6;
    for (let i = 0; i <= 22; i++) {
      const t = i / 22, d = C.crater - 2 + t * len, off = Math.sin(t * 7 + ph) * 5 * Math.sin(t * Math.PI);
      pts.push([C.x + Math.cos(a) * d - Math.sin(a) * off, C.z + Math.sin(a) * d + Math.cos(a) * off]);
    }
    rivers.push({ pts, near: nearPoly(pts) });
  }
  const HW = 2.2, BL = 3.2, DEPTH = 1.4;
  w.carves.push((x, z, h) => { let dd = 1e9; for (const rv of rivers) dd = Math.min(dd, rv.near(x, z)); return dd > HW + BL ? h : h - DEPTH * smooth(1 - (dd - HW) / BL); });
  w.stage = {
    id: 'volcano', C, rivers, HW, ux, uz,
    noPlace(x, z, rad) {
      if (Math.hypot(x - C.x, z - C.z) < C.crater + 10 + rad) return true;
      for (const rv of rivers) if (rv.near(x, z) < HW + 2.5 + rad) return true;
      return false;
    },
  };
}

function buildVolcano(w, st) {
  const r = mulberry32(w.seed * 11 + 8642), Q = w.quality, C = st.C;
  const lava = w.makeLavaMaterial();
  // The lake in the crater and the rivers down the slope.
  const floor = w.heightAt(C.x, C.z);
  const lake = new THREE.Mesh(new THREE.CircleGeometry(C.crater - 1, 48).rotateX(-Math.PI / 2), lava);
  lake.position.set(C.x, floor + 1.2, C.z); lake.renderOrder = 2; lake.frustumCulled = false; w.group.add(lake);
  for (const rv of st.rivers) ribbon(w, rv.pts, st.HW + 0.9, st.HW + 0.3, 0.55, lava, 0.35);
  // Firelight: a glow pool over the crater, point lights down each river.
  const glowTex = SOFT();
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex, color: 0xff5a14, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  pool.position.set(C.x, floor + 3, C.z); pool.renderOrder = 1; pool.frustumCulled = false; w.group.add(pool);
  w.animated.push((t) => { pool.material.opacity = 0.4 + Math.sin(t * 5) * 0.05 + Math.sin(t * 11.7) * 0.04; });
  const lights = [];
  for (const rv of st.rivers) for (const i of [6, 14, 21]) { const p = rv.pts[i], l = new THREE.PointLight(0xff6a20, 40, 34, 1.7); l.position.set(p[0], w.heightAt(p[0], p[1]) + 1.5, p[1]); w.group.add(l); lights.push(l); }
  const crater = new THREE.PointLight(0xff7a30, 120, 80, 1.5); crater.position.set(C.x, floor + 6, C.z); w.group.add(crater); lights.push(crater);
  w.animated.push((t) => { for (let i = 0; i < lights.length; i++) lights[i].intensity = (i === lights.length - 1 ? 120 : 40) * (0.85 + Math.sin(t * 6 + i) * 0.1 + Math.sin(t * 13 + i * 2) * 0.05); });
  // Smoke pouring out of the crater, embers rising off the lava.
  plume(w, [{ x: C.x, y: floor + 4, z: C.z, r: 8 }], { count: 160, color: 0x2a1e1a, size: 18, rise: 95, life: 11, alpha: 0.55, spread: 1.4, drift: [st.ux * -0.3 + 0.6, 0, st.uz * -0.3 + 0.3], grow: 3 });
  const emberSrc = [{ x: C.x, y: floor + 2, z: C.z, r: 10 }];
  for (const rv of st.rivers) for (let i = 2; i < rv.pts.length; i += 4) emberSrc.push({ x: rv.pts[i][0], y: w.heightAt(rv.pts[i][0], rv.pts[i][1]), z: rv.pts[i][1], r: 3 });
  plume(w, emberSrc, { count: 170, color: 0xffa040, size: 1.5, rise: 24, life: 3.6, alpha: 0.9, spread: 2, additive: true, drift: [0.6, 0, 0.3], grow: 0.2 });
  // Scorched boulders and cinder cones on the slope.
  const rockGeo = prep(blob(1, 1, 0.55, 12, 0x17120f, 0x3a302a, 1.3, 0.8, 1)), rocks = [];
  for (let i = 0, k = 0; i < [40, 60, 80][Q] && k < 2000; k++) {
    const a = r() * TAU, d = C.crater + 12 + r() * 70, x = C.x + Math.cos(a) * d, z = C.z + Math.sin(a) * d;
    if (Math.hypot(x, z) > 164 || !w.clearOf(x, z, 1.5) || w.blocked(x, z, 1)) continue;
    const s = 0.8 + r() * 2.4, h = w.heightAt(x, z);
    rocks.push({ m: matrixAt(x, h - 0.3 * s, z, r() * TAU, s, s * (0.6 + r() * 0.6)), x, z });
    w.addCollider(x, z, 0.9 * s, h + 1.2 * s); w.blobs.push({ x, z, y: h, r: 1.4 * s }); i++;
  }
  w.addInstanced([{ geo: rockGeo, mat: stdVC({ roughness: 0.95 }) }], rocks, { cast: true });
}

// ======================================================================================================================
// MISTY RUINS: a ruined temple in a morning fog. A colonnade along the path from the camp, broken walls and tombs,
// a ring of columns and two obelisks guarding the boss arena, mist rolling over the ground.
// ======================================================================================================================
function setupRuins(w) {
  const r = mulberry32(w.seed * 7 + 6420);
  const [ux, uz] = sideDir(w, r);
  // The castle sits on a flattened rise on the side away from the camp and the arena; the villages flank the path.
  const castle = { x: ux * 78, z: uz * 78, r: 30, yaw: Math.atan2(-ux, -uz) };
  castle.h = w.rawHeight(castle.x, castle.z) + 1.2;
  w.flats.push({ x: castle.x, z: castle.z, r: castle.r, blend: 16, h: castle.h });
  const villages = [];
  for (const sd of [-1, 1]) {
    const x = -ux * 20 * sd + uz * 52 * sd, z = -uz * 20 * sd - ux * 52 * sd;
    if (Math.hypot(x - w.spawn.x, z - w.spawn.z) < 32 || Math.hypot(x - w.arena.x, z - w.arena.z) < w.arena.r + 22) continue;
    const v = { x, z, r: 20, h: w.rawHeight(x, z) };
    w.flats.push({ x, z, r: v.r, blend: 12, h: v.h });
    villages.push(v);
  }
  w.stage = {
    id: 'ruins', castle, villages,
    noPlace(x, z, rad) {
      if (Math.hypot(x - castle.x, z - castle.z) < castle.r + 4 + rad) return true;
      for (const v of villages) if (Math.hypot(x - v.x, z - v.z) < v.r + 3 + rad) return true;
      return false;
    },
  };
}

// ---- buildings: box geometry with tiling scanned surfaces, every top a platform you can stand on ----
// UVs by world size, so a 2 m tile repeats across walls and roofs however big the box is.
export function boxUV(g, k = 0.5) {
  const p = g.attributes.position, n = g.attributes.normal;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.count * 2), 2));
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    if (nx > 0.5) uv.setXY(i, p.getZ(i) * k, p.getY(i) * k); else if (ny > 0.5) uv.setXY(i, p.getX(i) * k, p.getZ(i) * k); else uv.setXY(i, p.getX(i) * k, p.getY(i) * k);
  }
  return g;
}
// Castle and village surfaces: the scanned Poly Haven photos the ground and characters already use,
// tiled by world size (boxUV). Stone = rock_face albedo + normal; wood / plaster = the character surface photos.
const surfLoader = new THREE.TextureLoader();
export function surfMat(id, { tint = [1, 1, 1], rough = 0.95, bump = 0.5, rep = 1 } = {}) {
  const key = 'surf:' + id + tint.join(',') + rep;
  if (surfMat.cache.has(key)) return surfMat.cache.get(key);
  const t = surfLoader.load('assets/scan/' + id + '_m.webp'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.repeat.set(rep, rep);
  const m = new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: bump, roughness: rough, metalness: 0, color: new THREE.Color(tint[0], tint[1], tint[2]) });
  surfMat.cache.set(key, m); return m;
}
surfMat.cache = new Map();
export function stoneMat(id, tint, rep = 1) {
  const key = 'stone:' + id + tint.join(',') + rep;
  if (surfMat.cache.has(key)) return surfMat.cache.get(key);
  const g = groundTex(id); g.albedo.repeat.set(rep, rep); g.normal.repeat.set(rep, rep);
  const m = new THREE.MeshStandardMaterial({ map: g.albedo, normalMap: g.normal, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.96, metalness: 0, color: new THREE.Color(tint[0], tint[1], tint[2]) });
  surfMat.cache.set(key, m); return m;
}
function buildMats() {
  const stone = stoneMat('mossy_rock', [0.92, 0.92, 0.9], 0.8);
  const wood = surfMat('rough_wood', { tint: [1.05, 0.95, 0.85], rough: 0.85, bump: 0.6 });
  const roof = surfMat('rough_wood', { tint: [1.35, 0.72, 0.52], rough: 0.85, bump: 0.8, rep: 3 });
  const plaster = stoneMat('mud_cracked_dry_03', [1.5, 1.42, 1.28], 1.3);
  return { stone, wood, roof, plaster };
}
// A solid block with a standable top; `pitch` makes it a roof ridge falling away along its local x.
function block(w, M, x, z, yaw, W, H, D, yBase, mat, { pitch = 0, plat = true, uvk = 0.5, collide = true } = {}) {
  const g = boxUV(new THREE.BoxGeometry(W, H, D), uvk);
  const m = new THREE.Mesh(g, mat); m.position.set(x, yBase + H / 2, z); m.rotation.y = yaw; m.castShadow = true; m.receiveShadow = true;
  w.group.add(m);
  if (plat) w.platforms.push({ box: true, x, z, hw: W / 2, hd: D / 2, yaw: -yaw, top: yBase + H, pitch, base: collide ? undefined : yBase });
  return m;
}
// A gable roof: two sloped slabs over a W x D footprint, standable as one pitched platform.
function gableRoof(w, M, x, z, yaw, W, D, yEave, rise, mat) {
  const half = W / 2 + 0.5, slope = Math.hypot(half, rise), ang = Math.atan2(rise, half);
  for (const sd of [-1, 1]) {
    const g = boxUV(new THREE.BoxGeometry(slope, 0.3, D + 0.8), 0.5);
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
    const ox = sd * half / 2, oy = rise / 2;
    m.position.set(x + Math.cos(yaw) * ox, yEave + oy, z - Math.sin(yaw) * ox); m.rotation.set(0, yaw, -sd * ang);
    w.group.add(m);
  }
  w.platforms.push({ box: true, x, z, hw: half, hd: D / 2 + 0.4, yaw: -yaw, top: yEave + rise + 0.15, pitch: rise / half });
}
// Steps up to a height: a run of stacked blocks, each about one jump high, climbing along `yaw`.
function stairs(w, M, x, z, yaw, toH, yBase, mat, { rise = 1.05, depth = 1.3, width = 2.2 } = {}) {
  const n = Math.max(1, Math.ceil((toH - yBase) / rise)), c = Math.cos(yaw), s = Math.sin(yaw);
  for (let i = 0; i < n; i++) {
    const h = Math.min(toH, yBase + rise * (i + 1)) - yBase, d = (i + 0.5) * depth;
    block(w, M, x + s * d, z + c * d, yaw, width, h, depth, yBase, mat, { uvk: 0.7 });
  }
}
// A village house you can walk into: plastered walls with timber corners and frames, an open doorway at the front and one at the
// side (no doors: nothing blocks an entrance), an earth floor, a gable roof, and steps up the back to the roof.
function house(w, M, x, z, yaw, W, D, H, r) {
  const yb = w.heightAt(x, z) - 0.2;
  const S = new Shell(w);
  hall(S, { x, z, yaw, W, D, H: H + 0.4, th: 0.35, yb: yb + 0.2, sink: 1.2, tk: 0.4, floor: false, roof: 'gable', rise: W * 0.36, over: 0.3,
    mats: { wall: M.plaster, trim: M.wood, roof: M.roof }, doors: [{ side: 'z+', w: 1.7, h: 2.3 }, { side: 'x+', w: 1.5, h: 2.3, off: D * 0.12 }] });
  S.finish();
  (w.houses ||= []).push({ x, z, yaw, W, D });
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // Steps against the back wall up to the eave, so the roof can be reached on foot.
  stairs(w, M, x - s * (D / 2 + 0.2), z - c * (D / 2 + 0.2), yaw + Math.PI, yb + 1.1 + H, yb, M.stone, { width: 1.6 });
  void r;
}
function buildVillages(w, st, r) {
  const M = buildMats();
  for (const v of st.villages) {
    const n = 5 + Math.floor(r() * 2), placed = [];
    for (let i = 0, k = 0; i < n && k < 60; k++) {
      const a = (i / n) * TAU + r() * 0.5, d = 7 + r() * 8, x = v.x + Math.cos(a) * d, z = v.z + Math.sin(a) * d;
      if (placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < 9)) continue;
      const W = 4.5 + r() * 2.5, D = 5 + r() * 3, H = 2.6 + r() * 0.8;
      house(w, M, x, z, Math.atan2(v.x - x, v.z - z) + (r() - 0.5) * 0.4, W, D, H, r);
      placed.push([x, z]); i++;
    }
    // A well in the middle and a few crates to hop on.
    const wy = w.heightAt(v.x, v.z) - 0.1;
    const well = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 1.0, 14, 1, true), M.stone); well.position.set(v.x, wy + 0.5, v.z); well.castShadow = true; w.group.add(well);
    w.platforms.push({ x: v.x, z: v.z, r: 1.25, top: wy + 1.0 });
    for (let i = 0; i < 6; i++) { const a = r() * TAU, d = 3 + r() * 3, x = v.x + Math.cos(a) * d, z = v.z + Math.sin(a) * d, s = 0.8 + r() * 0.5; block(w, M, x, z, r() * TAU, s, s, s, w.heightAt(x, z) - 0.05, M.wood, { uvk: 1 }); }
  }
}
function buildCastle(w, st, r) {
  const M = buildMats(), C = st.castle, yb = C.h - 0.3, yaw = C.yaw, c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [C.x + c * lx + s * lz, C.z - s * lx + c * lz];
  const WALL = 7.5, TW = 3.2, R = 20;
  const TS = new Shell(w), towerMat = M.stone.clone(); towerMat.side = THREE.DoubleSide;
  // Four round towers at the corners, a curtain wall between them (the wall-walk is standable), a gatehouse facing the ruins.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const [x, z] = at(sx * R, sz * R);
    // A hollow tower: the wall is a ring with a doorway facing the courtyard, the top floor is a deck you walk under and can stand on.
    const td = Math.atan2(C.x - x, C.z - z), gap = 0.36, DH = 3.0;
    const ring = new THREE.Mesh(boxUV(new THREE.CylinderGeometry(TW, TW + 0.3, 11, 18, 1, true, td + gap, TAU - 2 * gap), 0.5), towerMat); ring.position.set(x, yb + 5.5, z); ring.castShadow = true; ring.receiveShadow = true; w.group.add(ring);
    const over = new THREE.Mesh(boxUV(new THREE.CylinderGeometry(TW, TW + 0.2, 11 - DH, 4, 1, true, td - gap, 2 * gap), 0.5), towerMat); over.position.set(x, yb + DH + (11 - DH) / 2, z); over.castShadow = true; w.group.add(over);
    const deck = new THREE.Mesh(boxUV(new THREE.CylinderGeometry(TW, TW, 0.6, 18), 0.5), M.stone); deck.position.set(x, yb + 10.7, z); deck.castShadow = true; deck.receiveShadow = true; w.group.add(deck);
    const NS = 12, stepA = (TAU - 2 * gap) / NS, segLen = 2 * TW * Math.tan(stepA / 2) + 0.2;
    for (let i = 0; i < NS; i++) { const a = td + gap + (i + 0.5) * stepA; TS.solid(segLen, 11, 0.7, x + Math.sin(a) * (TW - 0.35), yb, z + Math.cos(a) * (TW - 0.35), a); }
    TS.solid(2 * TW * Math.tan(gap) + 0.2, 11 - DH, 0.7, x + Math.sin(td) * (TW - 0.35), yb + DH, z + Math.cos(td) * (TW - 0.35), td, { under: true });
    const cap = new THREE.Mesh(new THREE.ConeGeometry(TW + 0.6, 3.2, 18), M.roof); cap.position.set(x, yb + 12.6, z); cap.castShadow = true; w.group.add(cap);
    w.platforms.push({ x, z, r: TW + 0.2, top: yb + 11, base: yb + 10.4 });
    // Crenellations round the top.
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; block(w, M, x + Math.cos(a) * (TW - 0.2), z + Math.sin(a) * (TW - 0.2), -a, 0.9, 0.9, 0.5, yb + 11, M.stone, { plat: false }); }
  }
  for (const [lx, lz, len, ry] of [[0, -R, 2 * R - TW, 0], [0, R, 2 * R - TW, 0], [-R, 0, 2 * R - TW, Math.PI / 2], [R, 0, 2 * R - TW, Math.PI / 2]]) {
    const [x, z] = at(lx, lz);
    if (lz === R && lx === 0) { // the gatehouse wall: two halves with an arch between
      for (const sd of [-1, 1]) { const [gx, gz] = at(sd * (len / 4 + 2), lz); block(w, M, gx, gz, yaw + ry, len / 2 - 4, WALL, 1.6, yb, M.stone); }
      const [ax, az] = at(0, lz); block(w, M, ax, az, yaw, 8, 2.5, 1.6, yb + 5, M.stone, { collide: false }); // lintel over the gate: walk under it
      continue;
    }
    block(w, M, x, z, yaw + ry, len, WALL, 1.6, yb, M.stone);
    // Merlons along the outer edge.
    for (let i = -Math.floor(len / 4.8); i <= Math.floor(len / 4.8); i++) { const o = i * 2.4; const [mx, mz] = ry ? at(lx + Math.sign(lx) * 0.6, o) : at(o, lz + Math.sign(lz) * 0.6); block(w, M, mx, mz, yaw + ry, 1.1, 0.9, 0.4, yb + WALL, M.stone, { plat: false }); }
  }
  // Steps up to the wall-walk inside the courtyard, one each side.
  for (const sd of [-1, 1]) { const [x, z] = at(sd * (R - 1.6), -4); stairs(w, M, x, z, yaw + Math.PI, yb + WALL, yb, M.stone, { width: 2 }); }
  // The keep: a tall stone block with a battlemented top, a timber hall beside it, steps to both roofs.
  const [kx, kz] = at(-6, -4);
  // The keep is hollow: a doorway beside the steps and one facing the hall.
  hall(TS, { x: kx, z: kz, yaw, W: 14, D: 12, H: 12.4, th: 1.4, yb, sink: 1, tk: 0.6, floor: false, roof: 'flat', mats: { wall: M.stone, trim: M.stone, roof: M.stone },
    doors: [{ side: 'z+', w: 3.2, h: 3.8, off: 4.2 }, { side: 'x+', w: 3.2, h: 3.8 }] });
  for (let i = -6; i <= 6; i += 2) for (const [ex, ez] of [[i, -5.7], [i, 5.7], [-6.7, i], [6.7, i]]) { const [mx, mz] = at(-6 + ex, -4 + ez); block(w, M, mx, mz, yaw, 1.0, 0.9, 1.0, yb + 13, M.stone, { plat: false }); }
  const [sx1, sz1] = at(-6, 3.2); stairs(w, M, sx1, sz1, yaw, yb + 13, yb, M.stone, { width: 2.6, rise: 1.05, depth: 1.1 });
  const [hx, hz] = at(9, 2);
  hall(TS, { x: hx, z: hz, yaw, W: 9, D: 11, H: 4.1, th: 0.5, yb, sink: 1, tk: 0.5, floor: false, roof: 'gable', rise: 3.2, over: 0.4, mats: { wall: M.plaster, trim: M.wood, roof: M.roof },
    doors: [{ side: 'x-', w: 2.4, h: 2.9 }, { side: 'z-', w: 2.4, h: 2.9 }] });
  TS.finish();
  const [sx2, sz2] = at(9 + 4.5 + 1.1, 7.5); stairs(w, M, sx2, sz2, yaw + Math.PI, yb + 4.6, yb, M.stone, { width: 2 }); // outside, along the hall's side wall
  // Banners on the keep.
  for (const sd of [-1, 1]) { const [bx, bz] = at(-6 + sd * 6.9, -4); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 6), M.wood); pole.position.set(bx, yb + 15, bz); w.group.add(pole); const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), new THREE.MeshStandardMaterial({ color: 0x7a1a2a, side: THREE.DoubleSide, roughness: 0.9 })); flag.position.set(bx, yb + 16.6, bz); flag.rotation.y = yaw; w.group.add(flag); w.animated.push((t) => { flag.rotation.y = yaw + Math.sin(t * 2.2 + sd) * 0.25; }); }
  w.blobs.push({ x: C.x, z: C.z, y: yb + 0.2, r: R + 4 });
}

function buildRuins(w, st) {
  const r = mulberry32(w.seed * 11 + 7531), Q = w.quality, lib = propLibrary(w.biome, Q);
  const pillar = lib.pillar(), pvars = pillar.variants, stone = pvars[0][0].mat;
  const cols = pvars.map(() => []);
  const putCol = (x, z, s, lean = 0.08) => {
    if (!w.clearOf(x, z, 0.6) && Math.hypot(x - w.arena.x, z - w.arena.z) > w.arena.r + 2) return;
    if (w.blocked(x, z, 0.9)) return;
    const h = w.heightAt(x, z), m = new THREE.Matrix4().compose(new THREE.Vector3(x, h - 0.15, z), new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * lean, r() * TAU, (r() - 0.5) * lean)), new THREE.Vector3(s, s * (0.55 + r() * 0.5), s));
    cols[Math.floor(r() * pvars.length)].push({ m, x, z });
    w.addCollider(x, z, 0.75 * s, h + 5 * s); w.blobs.push({ x, z, y: h, r: 1.2 * s });
  };
  // The colonnade: pairs of columns either side of the worn path, every few metres.
  const path = w.pathPts || [];
  for (let i = 4; i < path.length - 4; i += 4) {
    const a = path[i - 1], b = path[i + 1], tx = b[0] - a[0], tz = b[1] - a[1], tl = Math.hypot(tx, tz) || 1, nx = -tz / tl, nz = tx / tl;
    for (const sd of [-1, 1]) { if (r() < 0.18) continue; putCol(path[i][0] + nx * 6 * sd, path[i][1] + nz * 6 * sd, 1.1 + r() * 0.3); }
  }
  // The temple ring round the arena, and the obelisks at its gate.
  const A = w.arena, ga = Math.atan2(w.spawn.z - A.z, w.spawn.x - A.x);
  for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; if (Math.abs(((a - ga + Math.PI) % TAU) - Math.PI) < 0.3) continue; putCol(A.x + Math.cos(a) * (A.r + 9), A.z + Math.sin(a) * (A.r + 9), 1.3 + r() * 0.2, 0.04); }
  pvars.forEach((parts, vi) => cols[vi].length && w.addInstanced(parts, cols[vi], { cast: true }));
  const ob = lib.obelisk(), obParts = ob.variants ? ob.variants[0] : ob.parts, obs = [];
  for (const sd of [-1, 1]) {
    const x = A.x + Math.cos(ga) * (A.r + 12) + Math.cos(ga + Math.PI / 2) * 7 * sd, z = A.z + Math.sin(ga) * (A.r + 12) + Math.sin(ga + Math.PI / 2) * 7 * sd, h = w.heightAt(x, z);
    obs.push({ m: matrixAt(x, h - 0.2, z, ga, 1.15), x, z }); w.addCollider(x, z, 1.2, h + 12); w.blobs.push({ x, z, y: h, r: 1.6 });
  }
  w.addInstanced(obParts, obs, { cast: true });
  // Broken walls: lengths of mossy stone half sunk in the grass.
  const wallGeo = (() => { const g = new THREE.BoxGeometry(1, 1, 1, 6, 2, 1).toNonIndexed(); const p = g.attributes.position, nz = mulberry32(5); for (let i = 0; i < p.count; i++) { if (p.getY(i) > 0.4) p.setY(i, 0.5 - Math.abs(Math.sin(p.getX(i) * 9 + 1)) * 0.35 - nz() * 0.1); } g.computeVertexNormals(); return tint(prep(g), 0x8a8c80); })();
  const walls = [];
  for (let i = 0, k = 0; i < [14, 20, 26][Q] && k < 1500; k++) {
    const x = (r() * 2 - 1) * 143, z = (r() * 2 - 1) * 143;
    if (!w.clearOf(x, z, 3.5) || w.blocked(x, z, 3)) continue;
    const h = w.heightAt(x, z), L = 5 + r() * 7, H = 1.6 + r() * 1.6, yaw = r() * TAU;
    walls.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x, h + H * 0.5 - 0.5, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, (r() - 0.5) * 0.08)), new THREE.Vector3(L, H, 0.9)), x, z });
    w.addCollider(x, z, L * 0.5, h + H); w.blobs.push({ x, z, y: h, r: L * 0.55 }); i++;
  }
  w.addInstanced([{ geo: boxUV(wallGeo, 0.5), mat: stoneMat('mossy_rock', [0.95, 0.95, 0.9], 3) }], walls, { cast: true });
  // Tombs between the walls, from the graveyard's kit.
  const tomb = propLibrary({ id: 'graveyard' }, Q).tomb(), tv = tomb.variants || [tomb.parts], tombs = tv.map(() => []);
  for (let i = 0, k = 0; i < [10, 16, 22][Q] && k < 1200; k++) {
    const x = (r() * 2 - 1) * 130, z = (r() * 2 - 1) * 130;
    if (!w.clearOf(x, z, 1.5) || w.blocked(x, z, 1.2)) continue;
    const h = w.heightAt(x, z), s = tomb.s[0] + r() * (tomb.s[1] - tomb.s[0]);
    tombs[Math.floor(r() * tv.length)].push({ m: matrixAt(x, h - 0.1, z, r() * TAU, s), x, z }); w.blobs.push({ x, z, y: h, r: 0.95 * s });
    if (tomb.r) w.addCollider(x, z, tomb.r * s, h + 2 * s);
    i++;
  }
  tv.forEach((parts, vi) => tombs[vi].length && w.addInstanced(parts, tombs[vi], { cast: true }));
  // A castle on the far side of the ruins and two small villages (Nutty 2026-11-05), every roof and wall-top standable.
  buildCastle(w, st, r);
  buildVillages(w, st, r);
  // Ground mist rolling slowly over the whole map.
  const src = [];
  for (let i = 0; i < 118; i++) { const x = (r() * 2 - 1) * 156, z = (r() * 2 - 1) * 156; src.push({ x, y: w.heightAt(x, z) + 0.3, z, r: 9 }); }
  if (!/nomist/.test(location.search)) plume(w, src, { count: [120, 180, 260][Q], color: 0xdfe4e0, size: 16, rise: 1.0, life: 14, alpha: 0.07, spread: 2.6, drift: [0.5, 0, 0.25], grow: 0.4 });
  void stone;
}
