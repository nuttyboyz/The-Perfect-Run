// Scan build: candidate character-select backdrops (pick with ?bg=1..6; no flag keeps the dusk cliff).
// Each one is a real landscape: a heightfield shaded with photo-scanned ground/rock layers (Poly Haven, CC0),
// the game's own props and scanned rocks, its own sky, sun and air. The hero stands on flat ground at the origin.
import * as THREE from 'three';
import { propLibrary } from './props.js';
import { makeNoise } from './rng.js';
import { groundTex, scanReady, scanGeo, scanMat, scanVariants, SCAN_ON } from './scan.js';
import { FALLS } from './vista.js';

export const BG = SCAN_ON ? +(new URLSearchParams(location.search).get('bg') ?? 3) : 0; // Nutty picked 3 (forest clearing) on 2026-11-05; ?bg=0 brings back the dusk cliff

// ---------------------------------------------------------------- sky
function makeBgSky(o) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      cZen: { value: new THREE.Color(...o.zen) }, cHor: { value: new THREE.Color(...o.hor) }, cGnd: { value: new THREE.Color(...(o.gnd || o.hor)) },
      sunDir: { value: new THREE.Vector3(...o.sun).normalize() }, sunCol: { value: new THREE.Color(...o.sunCol) },
      sunSize: { value: o.sunSize || 0.0012 }, glow: { value: o.glow ?? 1 }, clouds: { value: o.clouds || 0 }, cCloud: { value: new THREE.Color(...(o.cloudCol || [1, 1, 1])) },
      stars: { value: o.stars || 0 }, aurora: { value: o.aurora || 0 }, t: { value: 0 },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 cZen, cHor, cGnd, sunDir, sunCol, cCloud; uniform float sunSize, glow, clouds, stars, aurora, t; varying vec3 vP;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
      void main(){
        vec3 d = normalize(vP); float y = d.y;
        vec3 c = mix(cHor, cZen, pow(smoothstep(0.0, 0.75, y), 0.55));
        c = mix(cGnd, c, smoothstep(-0.06, 0.01, y));
        float sd = max(dot(d, normalize(sunDir)), 0.0);
        c += sunCol * (pow(sd, 6.0) * 0.28 + pow(sd, 48.0) * 0.5) * glow;
        if (y > 0.0) {
          vec2 cp = d.xz / (y + 0.1) * 1.3 + vec2(t * 0.01, 0.0);
          float cl = smoothstep(0.5, 0.78, fbm(cp) + 0.08 * fbm(cp * 3.0)) * clouds * smoothstep(0.0, 0.15, y);
          vec3 cc = cCloud * (0.75 + 0.5 * fbm(cp * 2.0 + 1.7)) + sunCol * pow(sd, 4.0) * 0.6;
          c = mix(c, cc, cl);
          vec2 sp = d.xz / (y + 0.4) * 160.0;
          float st = step(0.996, h21(floor(sp))) * smoothstep(0.08, 0.4, y) * (1.0 - cl);
          c += vec3(st) * stars * (0.5 + 0.5 * h21(floor(sp) + 3.0));
          if (aurora > 0.0) {
            float ax = atan(d.x, -d.z);
            float band = sin(ax * 3.0 + fbm(vec2(ax * 2.0, t * 0.05)) * 4.0) * 0.08 + 0.26;
            float a = exp(-pow((y - band) * 9.0, 2.0)) * fbm(vec2(ax * 14.0, y * 3.0 + t * 0.1));
            float cur = smoothstep(0.0, 0.5, fbm(vec2(ax * 40.0, 0.0)));
            c += (mix(vec3(0.1, 1.0, 0.45), vec3(0.6, 0.25, 1.0), smoothstep(band, band + 0.12, y)) * a * (0.6 + cur) * aurora) * smoothstep(0.03, 0.12, y);
          }
        }
        c += sunCol * smoothstep(1.0 - sunSize, 1.0 - sunSize * 0.6, sd) * 3.0;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(390, 32, 16), mat);
  sky.renderOrder = -3;
  return sky;
}

// ---------------------------------------------------------------- land
const LAND_PARS = /* glsl */ `
uniform sampler2D gA, gR, gS, gG, nA, nR, nS, nG;
uniform vec3 tA, tR, tS, tG, cLava; uniform vec4 kS; uniform float uOn, gGreen;
varying vec3 vWP; varying vec3 vWN; varying vec4 vLW;
vec4 tri(sampler2D t, vec3 p, vec3 w, float k) { return texture2D(t, p.zy * k) * w.x + texture2D(t, p.xz * k) * w.y + texture2D(t, p.xy * k) * w.z; }
`;
const LAND_MAP = /* glsl */ `
  vec3 tw = pow(abs(normalize(vWN)), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
  vec2 gp = vWP.xz;
  float far = smoothstep(40.0, 200.0, length(cameraPosition - vWP));
  vec4 cA = mix(texture2D(gA, gp / kS.x), texture2D(gA, gp / (kS.x * 4.1) + 0.37), 0.3 + far * 0.4);
  vec4 cR = mix(tri(gR, vWP, tw, 1.0 / kS.y), tri(gR, vWP, tw, 0.25 / kS.y), 0.4 + far * 0.3);
  vec4 cS = texture2D(gS, gp / kS.z);
  vec4 cG = texture2D(gG, gp / kS.w);
  float wA = max(0.0, 1.0 - vLW.x - vLW.y - vLW.z);
  vec4 wv = vec4(wA, vLW.x, vLW.y, vLW.z);
  vec4 hh = vec4(cA.a, cR.a, cS.a, cG.a);
  vec4 sc = wv + hh * 0.4 * sqrt(wv);
  float mx = max(max(sc.x, sc.y), max(sc.z, sc.w));
  vec4 ww = max(sc - (mx - 0.25), 0.0); ww /= (ww.x + ww.y + ww.z + ww.w);
  vec3 a3 = cA.rgb;
  if (gGreen > 0.0) { float gl = dot(a3, vec3(0.3, 0.59, 0.11)); a3 = mix(a3, gl * vec3(0.5, 1.0, 0.22), 0.9 * gGreen) * mix(1.0, 0.62, gGreen); }
  vec3 alb = ww.x * a3 * tA + ww.y * cR.rgb * tR + ww.z * cS.rgb * tS + ww.w * cG.rgb * tG;
  diffuseColor.rgb = mix(diffuseColor.rgb, alb, uOn);
  vec4 nA4 = texture2D(nA, gp / kS.x), nR4 = tri(nR, vWP, tw, 1.0 / kS.y), nS4 = texture2D(nS, gp / kS.z), nG4 = texture2D(nG, gp / kS.w);
  float landRough = ww.x * nA4.a + ww.y * nR4.a + ww.z * nS4.a + ww.w * nG4.a;
  vec3 landD = ww.x * vec3(nA4.x * 2.0 - 1.0, 0.0, nA4.y * 2.0 - 1.0) + ww.z * vec3(nS4.x * 2.0 - 1.0, 0.0, nS4.y * 2.0 - 1.0) + ww.w * vec3(nG4.x * 2.0 - 1.0, 0.0, nG4.y * 2.0 - 1.0)
    + ww.y * (tw.y * vec3(nR4.x * 2.0 - 1.0, 0.0, nR4.y * 2.0 - 1.0) + tw.x * vec3(0.0, nR4.y * 2.0 - 1.0, nR4.x * 2.0 - 1.0) + tw.z * vec3(nR4.x * 2.0 - 1.0, nR4.y * 2.0 - 1.0, 0.0)) * 1.6;
  landD *= uOn * (1.0 - far * 0.7);
  float lavaW = vLW.w * (0.55 + 0.45 * (1.0 - cA.a));
`;

function landMaterial(o) {
  const U = { uOn: { value: 0 }, gGreen: { value: o.green || 0 }, cLava: { value: new THREE.Color(...(o.lava || [0, 0, 0])) } };
  const ids = { A: o.A, R: o.R, S: o.S || o.A, G: o.G || o.A };
  let n = 0;
  for (const k of 'ARSG') {
    const t = groundTex(ids[k], () => { if (++n === 4) U.uOn.value = 1; });
    U['g' + k] = { value: t.albedo }; U['n' + k] = { value: t.normal };
    U['t' + k] = { value: new THREE.Vector3(...((o.tint && o.tint[k]) || [1, 1, 1])) };
  }
  U.kS = { value: new THREE.Vector4(...(o.scale || [3.2, 6, 4, 3])) };
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(...(o.base || [0.4, 0.38, 0.32])), roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aLW; varying vec3 vWP; varying vec3 vWN; varying vec4 vLW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal); vLW = aLW;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + LAND_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + LAND_MAP)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = mix(roughness, clamp(landRough, ${(o.minRough ?? 0.75).toFixed(2)}, 1.0), uOn);`)
      .replace('#include <normal_fragment_maps>', 'normal = normalize(normal + (viewMatrix * vec4(landD, 0.0)).xyz);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += cLava * lavaW;');
  };
  mat.customProgramCacheKey = () => 'lobbyland' + o.key;
  return mat;
}

const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Heightfield centred on the hero spot. h(x, z) gives raw height; it is held flat round the hero and camera.
function buildLand(o, grp) {
  const SIZE = 700, SEG = 220;
  const g = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG).rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const H = (x, z) => {
    const d = Math.hypot(x, (z + 3) * (z > -3 ? 1.6 : 1));
    return o.h(x, z) * ss(o.flat || 11, (o.flat || 11) + (o.ramp || 16), d) + (o.near ? o.near(x, z) * ss(4, 9, d) : 0);
  };
  for (let i = 0; i < pos.count; i++) pos.setY(i, H(pos.getX(i), pos.getZ(i)));
  g.computeVertexNormals();
  const nrm = g.attributes.normal, lw = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), slope = 1 - nrm.getY(i);
    const w = o.weights(x, y, z, slope);
    lw[i * 4] = w[0]; lw[i * 4 + 1] = w[1]; lw[i * 4 + 2] = w[2]; lw[i * 4 + 3] = w[3] || 0;
  }
  g.setAttribute('aLW', new THREE.BufferAttribute(lw, 4));
  const land = new THREE.Mesh(g, landMaterial(o.mat));
  land.receiveShadow = true;
  grp.add(land);
  return H;
}

// Scatter one prop kind with instancing. spec = propLibrary entry; place(rnd) returns [x, z] or null.
function scatter(grp, H, spec, n, place, { s = null, seed = 1, sink = null, tint = null, lavaMat = null, slopeMax = 9, lift = null } = {}) {
  if (!spec) return;
  const variants = spec.variants || [spec.parts];
  const buckets = variants.map(() => []);
  let r = seed * 7919 + 13;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const S = s || spec.s || [1, 1];
  for (let t = 0, k = 0; k < n && t < n * 20; t++) {
    const p = place(rnd); if (!p) continue;
    const [x, z] = p, e = 0.8;
    const sl = Math.abs(H(x + e, z) - H(x - e, z)) + Math.abs(H(x, z + e) - H(x, z - e));
    if (sl > slopeMax) continue;
    const sc = S[0] + rnd() * (S[1] - S[0]);
    const y = Math.min(H(x, z), H(x + sc * 0.5, z), H(x - sc * 0.5, z), H(x, z + sc * 0.5), H(x, z - sc * 0.5));
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y - (sink ?? spec.sink ?? 0.05) * sc + (lift ? lift[0] + rnd() * (lift[1] - lift[0]) : 0), z), new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * (spec.tilt || 0), rnd() * 6.28, (rnd() - 0.5) * (spec.tilt || 0))), new THREE.Vector3(sc, sc, sc));
    buckets[k % variants.length].push(m); k++;
  }
  variants.forEach((parts, vi) => {
    const list = buckets[vi]; if (!list.length) return;
    for (const p of parts) {
      let mat = p.mat;
      if (typeof mat === 'string') mat = lavaMat || new THREE.MeshStandardMaterial({ color: 0x401000, emissive: 0xff5a10, emissiveIntensity: 2.2, roughness: 0.6 });
      if (tint && mat.color) { mat = mat.clone(); mat.color.multiply(new THREE.Color(...tint)); }
      const im = new THREE.InstancedMesh(p.geo, mat, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = !spec.noShadow; im.receiveShadow = true;
      grp.add(im);
    }
  });
}

// Scanned rocks of one model id, tinted.
function scanRockSpec(ids, tint) {
  if (!scanReady()) return null;
  const vars = [];
  for (const [id, picks] of ids) {
    const files = scanVariants(id), mat = scanMat(id, { tint });
    for (const k of picks) { const g = files[k] && scanGeo(files[k], { radius: 1 }); if (g && mat) vars.push([{ geo: g, mat }]); }
  }
  return vars.length ? { variants: vars, sink: 0.15 } : null;
}

// Placement helpers: keep the hero ring and the camera lane clear.
const clear = (x, z) => Math.abs(x) < 8 && z > -11 && z < 14;
// a wider camera lane, and a side-only variant that leaves the view straight ahead open
const wide = (f) => (rnd) => { const p = f(rnd); return p && !(Math.abs(p[0]) < 13 && p[1] > -16) ? p : null; };
const side = (f) => (rnd) => { const p = f(rnd); return p && !(p[1] < 0 && Math.abs(p[0]) < -p[1] * 0.45) ? p : null; };
const ring = (r0, r1, a0 = -Math.PI, a1 = Math.PI, cz = -3) => (rnd) => {
  const a = a0 + rnd() * (a1 - a0), r = r0 + Math.sqrt(rnd()) * (r1 - r0);
  const x = Math.sin(a) * r, z = cz - Math.cos(a) * r;
  return clear(x, z) ? null : [x, z];
};

// ---------------------------------------------------------------- the options
const N = makeNoise(77), N2 = makeNoise(91);
const ridged = (x, z, f) => { let s = 0, a = 1, k = f; for (let i = 0; i < 5; i++) { s += a * (1 - Math.abs(N.fbm(x * k, z * k, 1) * 2 - 1)); a *= 0.5; k *= 2.1; } return s / 1.94; };

const OPTIONS = {
  // 2. Alpine summit at sunrise: snowfield, a sea of jagged peaks, pink-gold light.
  2: {
    name: 'Snow summit',
    sky: { zen: [0.06, 0.16, 0.42], hor: [1.0, 0.62, 0.45], gnd: [0.75, 0.62, 0.62], sun: [-0.55, 0.06, -1], sunCol: [1.0, 0.62, 0.35], sunSize: 0.0016, clouds: 0.35, cloudCol: [1.0, 0.8, 0.78] },
    fog: [0xdcdfea, 0.0032], sunL: [0xffc8a0, 3.2, [-30, 30, -40]], hemi: [0x8fa8d8, 0x6a5a66, 0.9],
    land: {
      flat: 9, ramp: 30,
      h: (x, z) => { const d = Math.hypot(x, z + 3); return Math.pow(ridged(x, z, 0.007), 1.6) * 95 * ss(110, 300, d) + N2.fbm(x * 0.03, z * 0.03, 3) * 10 * ss(20, 60, d) - 3; },
      near: (x, z) => (N2.fbm(x * 0.15, z * 0.15, 3) - 0.5) * 0.8,
      weights: (x, y, z, sl) => { const r = ss(0.5, 0.75, sl) * ss(4, 20, y); return [r, 0, 0, 0]; },
      mat: { key: 'snow', A: 'snow_02', R: 'rock_face', G: 'gravel_ground_01', scale: [3.6, 7, 4, 2.6], base: [0.85, 0.88, 0.92], tint: { A: [1.02, 1.02, 1.06], R: [0.62, 0.68, 0.82], G: [0.7, 0.74, 0.82] }, minRough: 0.55 },
    },
    props: (grp, H, q) => {
      const lib = propLibrary({ id: 'frozen' }, Math.min(q, 1));
      scatter(grp, H, scanRockSpec([['boulder_01', [0]], ['rock_moss_set_02', [4, 6]], ['namaqualand_boulder_02', [0]]], [0.78, 0.82, 0.9]) || lib.snowrock(), 40, ring(9, 70), { s: [0.6, 3.2], seed: 3 });
      scatter(grp, H, lib.snowpine(), 90, side(ring(22, 120)), { seed: 4, s: [0.8, 1.5] });
      scatter(grp, H, scanRockSpec([['boulder_01', [0]]], [0.8, 0.84, 0.92]), 3, (rnd) => [-6 - rnd() * 5, -12 - rnd() * 6], { s: [2.6, 4], seed: 9 });
    },
  },
  // 3. Pine forest clearing, late afternoon sun slanting through the trunks.
  3: {
    name: 'Forest clearing',
    sky: { zen: [0.2, 0.42, 0.78], hor: [0.95, 0.82, 0.6], sun: [0.4, 0.12, -1], sunCol: [1.0, 0.75, 0.4], clouds: 0.3, cloudCol: [1, 0.95, 0.88] },
    fog: [0xa8b0a0, 0.0075], sunL: [0xffd29a, 3.4, [16, 26, -36]], hemi: [0xa0b8d0, 0x3a3020, 0.8],
    land: {
      flat: 16, ramp: 40,
      h: (x, z) => N.fbm(x * 0.012, z * 0.012, 4) * 46 - 22 + N2.fbm(x * 0.06, z * 0.06, 3) * 3,
      near: (x, z) => (N2.fbm(x * 0.2, z * 0.2, 3) - 0.5) * 0.5,
      weights: (x, y, z, sl) => { const r = ss(0.35, 0.6, sl); const p = ss(0.48, 0.62, N2.fbm(x * 0.09, z * 0.09, 3)); return [r, p * (1 - r) * 0.9, ss(0.55, 0.7, N.fbm(x * 0.13 + 5, z * 0.13, 3)) * (1 - r) * 0.8, 0]; },
      mat: { key: 'forest', A: 'forest_ground_04', R: 'mossy_rock', S: 'forest_leaves_02', G: 'brown_mud_leaves_01', scale: [3.2, 5, 2.8, 3], base: [0.32, 0.28, 0.2], tint: { R: [0.85, 0.85, 0.8] } },
    },
    props: (grp, H, q) => {
      const lib = propLibrary({ id: 'forest' }, Math.min(q, 1));
      scatter(grp, H, lib.pine(), [260, 420, 600][Math.min(2, q)], wide(ring(13, 150)), { seed: 5, s: [0.9, 1.8] });
      scatter(grp, H, lib.rock(), 30, ring(8, 50), { s: [0.5, 2.2], seed: 6 });
      scatter(grp, H, lib.stump(), 10, ring(8, 30), { seed: 7 });
      scatter(grp, H, lib.log(), 6, ring(9, 35), { seed: 8 });
      scatter(grp, H, lib.mushroom && null, 0, ring(8, 20));
    },
  },
  // 4. Desert canyon at sunset: red mesas, sand and cracked mud, cactus.
  4: {
    name: 'Desert canyon',
    sky: { zen: [0.12, 0.25, 0.6], hor: [1.0, 0.55, 0.28], sun: [-0.3, 0.07, -1], sunCol: [1.0, 0.55, 0.22], sunSize: 0.0018, clouds: 0.25, cloudCol: [1.0, 0.7, 0.55] },
    fog: [0xd8a07a, 0.0038], sunL: [0xffb070, 3.4, [-14, 10, -50]], hemi: [0x9ab0d8, 0x7a4a30, 0.9],
    land: {
      flat: 12, ramp: 20,
      h: (x, z) => {
        const v = N.fbm(x * 0.009 + 3, z * 0.009, 4), d = Math.hypot(x, z + 3);
        const t = ss(0.5, 0.56, v) * 38 + ss(0.62, 0.66, v) * 30 + ss(0.72, 0.75, v) * 22;
        return (t + N2.fbm(x * 0.04, z * 0.04, 3) * 4) * ss(25, 60, d) + N2.fbm(x * 0.03, z * 0.03, 3) * 3 - 1.5;
      },
      near: (x, z) => (N2.fbm(x * 0.25, z * 0.25, 2) - 0.5) * 0.4,
      weights: (x, y, z, sl) => { const r = ss(0.22, 0.42, sl); return [r, (1 - r) * ss(0.52, 0.66, N2.fbm(x * 0.07, z * 0.07, 3)) * 0.9, (1 - r) * ss(10, 24, y) * 0.9, 0]; },
      mat: { key: 'desert', A: 'aerial_sand', R: 'rock_face', S: 'mud_cracked_dry_03', G: 'rocky_terrain_02', scale: [4.5, 6, 3.6, 3.2], base: [0.7, 0.5, 0.35], tint: { A: [1.32, 1.1, 0.8], R: [1.3, 0.95, 0.72], S: [1.2, 1.0, 0.78], G: [1.25, 1.05, 0.82] }, minRough: 0.8 },
    },
    props: (grp, H, q) => {
      const lib = propLibrary({ id: 'desert' }, Math.min(q, 1));
      scatter(grp, H, scanRockSpec([['boulder_01', [0]], ['namaqualand_boulder_02', [0]]], [1.15, 0.92, 0.75]) || lib.rock(), 34, ring(8, 70), { s: [0.5, 3], seed: 10, slopeMax: 1.5 });
      scatter(grp, H, lib.cactus(), 26, ring(9, 60), { seed: 11, slopeMax: 1 });
      scatter(grp, H, lib.bones(), 3, ring(8, 18), { seed: 12, slopeMax: 1 });
    },
  },
  // 5. Volcanic ridge at night: black rock, basalt, lava rivers glowing, ash-red sky.
  5: {
    name: 'Volcano',
    sky: { zen: [0.02, 0.015, 0.03], hor: [0.55, 0.14, 0.05], gnd: [0.2, 0.05, 0.02], sun: [0.25, 0.05, -1], sunCol: [1.0, 0.3, 0.08], sunSize: 0.0, glow: 1.6, clouds: 0.6, cloudCol: [0.18, 0.08, 0.07], stars: 0.0 },
    fog: [0x3a1410, 0.0075], sunL: [0xff7a40, 1.6, [10, 12, -40]], hemi: [0x5a3048, 0x401008, 0.6], embers: true,
    land: {
      flat: 9, ramp: 26,
      h: (x, z) => {
        const d = Math.hypot(x, z + 3), cone = Math.hypot(x - 30, z + 170);
        return Math.pow(ridged(x + 40, z, 0.01), 2) * 70 * ss(30, 120, d) + Math.max(0, 95 - cone * 0.95) * ss(0, 6, cone) - ss(0, 16, 16 - cone) * 20 + N2.fbm(x * 0.05, z * 0.05, 3) * 5 - 2.5;
      },
      near: (x, z) => (N2.fbm(x * 0.2, z * 0.2, 3) - 0.5) * 0.6,
      weights: (x, y, z, sl) => {
        const d = Math.hypot(x, z + 3), r = ss(0.3, 0.55, sl);
        const lv = (1 - ss(0.0, 0.035, Math.abs(N2.fbm(x * 0.02, z * 0.02, 3) - 0.5))) * ss(16, 26, d) * (1 - r) * ss(3, -1, y);
        const top = ss(12, 0, Math.hypot(x - 30, z + 170)) * 1.5;
        return [r * 0.9, (1 - r) * ss(0.5, 0.62, N.fbm(x * 0.08, z * 0.08, 3)) * 0.9, lv, Math.max(lv, top)];
      },
      mat: { key: 'volc', A: 'burned_ground_01', R: 'dark_rock', S: 'dark_rock_02', G: 'dark_rock_02', scale: [3.2, 4, 3.4, 3], base: [0.12, 0.1, 0.1], tint: { A: [0.8, 0.76, 0.74], R: [0.8, 0.76, 0.74], S: [0.7, 0.66, 0.64], G: [0.35, 0.18, 0.12] }, lava: [3.2, 0.9, 0.18] },
    },
    props: (grp, H, q) => {
      const lib = propLibrary({ id: 'volcanic' }, Math.min(q, 1));
      scatter(grp, H, lib.basalt(), 30, ring(9, 60), { seed: 13, slopeMax: 2 });
      scatter(grp, H, scanRockSpec([['boulder_01', [0]], ['rock_moss_set_02', [4, 6]]], [0.32, 0.29, 0.28]) || lib.rock(), 36, ring(8, 70), { s: [0.5, 2.6], seed: 14 });
      scatter(grp, H, lib.obsidian(), 14, ring(9, 40), { seed: 15 });
      scatter(grp, H, lib.lavapool(), 6, ring(12, 40), { seed: 16, slopeMax: 0.6 });
      const glow = new THREE.PointLight(0xff5a20, 60, 60, 1.6); glow.position.set(4, 3, -22); grp.add(glow);
    },
  },
  // 6. Moonlit graveyard: wet grass, mud, tombs and crosses, a mausoleum, dead trees, lanterns in the fog.
  6: {
    name: 'Moonlit graveyard',
    sky: { zen: [0.01, 0.02, 0.06], hor: [0.12, 0.17, 0.28], sun: [-0.35, 0.3, -1], sunCol: [0.8, 0.88, 1.0], sunSize: 0.0022, glow: 0.5, clouds: 0.45, cloudCol: [0.12, 0.15, 0.22], stars: 1 },
    fog: [0x1c2638, 0.02], sunL: [0x9ab8ff, 1.5, [-16, 22, -30]], hemi: [0x4a5a80, 0x141410, 0.55],
    land: {
      flat: 10, ramp: 30,
      h: (x, z) => N.fbm(x * 0.014, z * 0.014, 4) * 30 - 12,
      near: (x, z) => (N2.fbm(x * 0.2, z * 0.2, 3) - 0.5) * 0.5,
      weights: (x, y, z, sl) => { const r = ss(0.35, 0.6, sl); return [r, (1 - r) * ss(0.5, 0.64, N2.fbm(x * 0.08, z * 0.08, 3)) * 0.9, (1 - r) * ss(0.6, 0.7, N.fbm(x * 0.15, z * 0.15, 3)) * 0.7, 0]; },
      mat: { key: 'grave', A: 'leafy_grass', R: 'rock_face', S: 'mud_forest', G: 'gravel_ground_01', scale: [3.4, 5, 3, 2.4], base: [0.2, 0.22, 0.16], tint: { A: [0.85, 0.9, 0.8], R: [0.75, 0.75, 0.78], S: [1.0, 0.95, 0.9], G: [0.8, 0.8, 0.8] }, green: 0.7 },
    },
    props: (grp, H, q) => {
      const lib = propLibrary({ id: 'graveyard' }, Math.min(q, 1));
      const yard = (r0, r1) => (rnd) => { const x = (rnd() - 0.5) * 50, z = -10 - rnd() * 45; return clear(x, z) || Math.hypot(x, z + 3) < r0 || Math.hypot(x, z + 3) > r1 ? null : [x, z]; };
      scatter(grp, H, lib.tomb(), 70, yard(8, 50), { seed: 17, slopeMax: 1.2 });
      scatter(grp, H, lib.cross(), 24, yard(8, 50), { seed: 18, slopeMax: 1.2 });
      scatter(grp, H, lib.mausoleum(), 1, () => [-9, -24], { seed: 19, s: [1.1, 1.1] });
      scatter(grp, H, lib.deadtree(), 26, ring(10, 90), { seed: 20, s: [1.0, 1.8] });
      scatter(grp, H, lib.lantern(), 5, yard(9, 30), { seed: 21 });
      scatter(grp, H, lib.pine(), 120, ring(40, 140), { seed: 22, s: [1, 1.7] });
      for (const [x, z] of [[-5, -15], [7, -19], [-3, -32]]) { const l = new THREE.PointLight(0xffa850, 10, 16, 1.8); l.position.set(x, H(x, z) + 2.6, z); grp.add(l); }
    },
  },
  // 7. Coast at sunset: a sand beach running down to the sea, rock stacks offshore, grassy headlands either side.
  7: {
    name: 'Sunset coast',
    sky: { zen: [0.1, 0.2, 0.5], hor: [1.0, 0.5, 0.32], gnd: [0.12, 0.2, 0.3], sun: [0.12, 0.035, -1], sunCol: [1.0, 0.58, 0.28], sunSize: 0.002, clouds: 0.45, cloudCol: [1.0, 0.62, 0.55] },
    fog: [0xd09a88, 0.0035], sunL: [0xffb27a, 3.2, [6, 9, -50]], hemi: [0x8aa0d0, 0x6a5040, 0.85],
    water: { y: -2.2, color: 0x16384a, rough: 0.12, metal: 0.4 },
    land: {
      flat: 8, ramp: 16,
      h: (x, z) => { const ax = Math.abs(x); return -6 * ss(-10, -26, z) * (1 - ss(45, 80, ax)) + ss(45, 90, ax) * (14 + N.fbm(x * 0.03, z * 0.03, 4) * 30) + N2.fbm(x * 0.05, z * 0.05, 3) * 2 - 1; },
      near: (x, z) => (N2.fbm(x * 0.2, z * 0.2, 2) - 0.5) * 0.3,
      weights: (x, y, z, sl) => { const r = ss(0.25, 0.45, sl); return [r, (1 - r) * ss(5, 10, y), (1 - r) * ss(-0.5, -2.4, y) * 0.9, 0]; },
      mat: { key: 'coast', A: 'aerial_sand', R: 'rock_face', S: 'leafy_grass', G: 'rocky_terrain_02', scale: [4, 6, 3.4, 3], base: [0.7, 0.6, 0.45], tint: { A: [1.15, 1.05, 0.9], R: [0.85, 0.8, 0.78], S: [0.62, 0.9, 0.45], G: [0.85, 0.8, 0.7] }, minRough: 0.7 },
    },
    props: (grp, H, q) => {
      const stacks = scanRockSpec([['boulder_01', [0]], ['namaqualand_boulder_02', [0]], ['rock_moss_set_02', [4, 6]]], [0.8, 0.75, 0.72]);
      scatter(grp, H, stacks, 9, (rnd) => [(rnd() - 0.5) * 140, -45 - rnd() * 90], { s: [5, 16], seed: 30, sink: 0.25 });
      scatter(grp, H, stacks, 22, ring(8, 40), { s: [0.5, 2], seed: 31 });
      scatter(grp, H, scanRockSpec([['dead_tree_trunk', [0]]], [0.95, 0.9, 0.85]) && { parts: [{ geo: scanGeo(scanVariants('dead_tree_trunk')[0], { radius: 2.6 }), mat: scanMat('dead_tree_trunk') }] }, 2, (rnd) => [-6 - rnd() * 6, -12 - rnd() * 5], { seed: 32, s: [0.9, 1.2] });
      const lib = propLibrary({ id: 'meadow' }, Math.min(q, 1));
      scatter(grp, H, lib.pine(), 60, (rnd) => { const x = (rnd() < 0.5 ? -1 : 1) * (40 + rnd() * 60), z = 10 - rnd() * 120; return H(x, z) > 8 ? [x, z] : null; }, { seed: 33, s: [0.9, 1.5] });
    },
  },
  // 8. Hot springs: steaming turquoise pools in a green valley under grey peaks.
  8: {
    name: 'Hot springs',
    sky: { zen: [0.16, 0.38, 0.8], hor: [0.85, 0.88, 0.9], sun: [0.5, 0.35, -1], sunCol: [1.0, 0.9, 0.75], clouds: 0.5 },
    fog: [0xc8d2d8, 0.005], sunL: [0xfff0d8, 3.0, [20, 30, -30]], hemi: [0xa8c0e0, 0x404830, 0.9], steam: [[-7, -15, 4.5], [7.5, -19, 5], [0, -30, 6], [-14, -30, 4]],
    water: { y: -0.55, color: 0x2a7f86, rough: 0.06, metal: 0.35, emissive: 0x04201f },
    land: {
      flat: 8, ramp: 14,
      h: (x, z) => {
        let h = Math.pow(ridged(x, z, 0.007), 1.8) * 110 * ss(80, 220, Math.hypot(x, z)) + N.fbm(x * 0.02, z * 0.02, 3) * 14 * ss(25, 70, Math.hypot(x, z + 3)) - 3;
        for (const [px, pz, pr] of [[-7, -15, 4.5], [7.5, -19, 5], [0, -30, 6], [-14, -30, 4]]) h -= 2.2 * ss(pr + 1.5, pr - 1.5, Math.hypot(x - px, z - pz));
        return h;
      },
      near: (x, z) => (N2.fbm(x * 0.2, z * 0.2, 3) - 0.5) * 0.4,
      weights: (x, y, z, sl) => { const r = ss(0.4, 0.65, sl); const rim = ss(0.4, -0.7, y) * ss(30, 10, Math.hypot(x, z + 20)); return [r, Math.max(0, rim * (1 - r)), ss(0.6, 0.72, N2.fbm(x * 0.08, z * 0.08, 3)) * (1 - r) * 0.6, 0]; },
      mat: { key: 'springs', A: 'leafy_grass', R: 'mossy_rock', S: 'rocky_terrain_02', G: 'forest_ground_04', scale: [3.4, 6, 3, 3.2], base: [0.3, 0.38, 0.2], tint: { R: [0.9, 0.92, 0.9], S: [1.1, 1.05, 1.0] }, green: 1 },
    },
    props: (grp, H, q) => {
      const lib = propLibrary({ id: 'springs' }, Math.min(q, 1));
      const rocks = scanRockSpec([['rock_moss_set_01', [0, 3, 4]], ['rock_moss_set_02', [3, 4]]], null);
      for (const [px, pz, pr] of [[-7, -15, 4.5], [7.5, -19, 5], [0, -30, 6], [-14, -30, 4]]) scatter(grp, H, rocks, 9, (rnd) => { const a = rnd() * 6.28; return [px + Math.cos(a) * (pr + 0.4), pz + Math.sin(a) * (pr + 0.4)]; }, { s: [0.5, 1.5], seed: 40 + px, slopeMax: 20 });
      scatter(grp, H, lib.pine(), 140, side(ring(18, 140)), { seed: 41, s: [0.9, 1.6] });
      scatter(grp, H, rocks, 20, ring(9, 60), { s: [0.6, 2.4], seed: 42 });
    },
  },
  // 9. Frozen lake at night under the northern lights.
  9: {
    name: 'Northern lights lake',
    sky: { zen: [0.005, 0.012, 0.04], hor: [0.04, 0.09, 0.16], sun: [-0.4, 0.45, -1], sunCol: [0.8, 0.9, 1.0], sunSize: 0.0015, glow: 0.3, clouds: 0.12, cloudCol: [0.08, 0.1, 0.16], stars: 1.2, aurora: 1.3 },
    fog: [0x0e1a28, 0.006], sunL: [0x9ac0ff, 1.3, [-14, 22, -30]], hemi: [0x3a7a78, 0x101820, 0.6],
    water: { y: -0.6, color: 0x8fb0c8, rough: 0.06, metal: 0.55 },
    land: {
      flat: 9, ramp: 12,
      h: (x, z) => { const d = Math.hypot(x, z + 3); return -2.2 * ss(-12, -24, z) * (1 - ss(60, 90, Math.abs(x))) + Math.pow(ridged(x, z, 0.007), 1.6) * 90 * ss(140, 300, d) + ss(50, 90, Math.abs(x)) * N.fbm(x * 0.03, z * 0.03, 3) * 30 + N2.fbm(x * 0.06, z * 0.06, 3) * 1.5 - 0.6; },
      near: (x, z) => (N2.fbm(x * 0.2, z * 0.2, 3) - 0.5) * 0.4,
      weights: (x, y, z, sl) => [ss(0.5, 0.75, sl) * ss(5, 20, y), 0, 0, 0],
      mat: { key: 'aurora', A: 'snow_02', R: 'rock_face', scale: [3.6, 7, 4, 3], base: [0.8, 0.85, 0.9], tint: { A: [0.95, 1.0, 1.06], R: [0.6, 0.66, 0.78] }, minRough: 0.55 },
    },
    props: (grp, H, q) => {
      const lib = propLibrary({ id: 'frozen' }, Math.min(q, 1));
      scatter(grp, H, lib.snowpine(), 160, (rnd) => { const x = (rnd() - 0.5) * 300, z = 20 - rnd() * 260; return H(x, z) > 0.2 && !clear(x, z) && !(Math.abs(x) < 14 && z > -14) ? [x, z] : null; }, { seed: 50, s: [0.8, 1.6], slopeMax: 3 });
      scatter(grp, H, scanRockSpec([['boulder_01', [0]], ['rock_moss_set_02', [4, 6]]], [0.7, 0.76, 0.86]), 14, ring(8, 22, -2.2, 2.2), { s: [0.5, 2], seed: 51 });
      scatter(grp, H, lib.icecrystal(), 6, (rnd) => [(rnd() - 0.5) * 40, -18 - rnd() * 10], { seed: 52, s: [0.6, 1.4] });
    },
  },
  // 10. Ruined temple in morning mist: broken columns, an obelisk, moss and stone.
  10: {
    name: 'Misty ruins',
    sky: { zen: [0.4, 0.55, 0.72], hor: [0.92, 0.9, 0.84], sun: [-0.6, 0.18, -1], sunCol: [1.0, 0.88, 0.65], clouds: 0.3 },
    fog: [0xc4c8c2, 0.017], sunL: [0xffe0b0, 3.0, [-24, 18, -30]], hemi: [0xb0c0d0, 0x40402a, 0.9],
    land: {
      flat: 10, ramp: 30,
      h: (x, z) => N.fbm(x * 0.015, z * 0.015, 4) * 34 - 14,
      near: (x, z) => (N2.fbm(x * 0.2, z * 0.2, 3) - 0.5) * 0.3,
      weights: (x, y, z, sl) => { const r = ss(0.35, 0.6, sl); const path = ss(2.6, 1.2, Math.abs(x + Math.sin(z * 0.08) * 2)) * ss(-4, -12, z) * ss(-60, -40, z); return [r, Math.max((1 - r) * ss(0.55, 0.66, N2.fbm(x * 0.08, z * 0.08, 3)) * 0.9, path * 0.9), 0, 0]; },
      mat: { key: 'ruins', A: 'leafy_grass', R: 'mossy_rock', S: 'gravel_ground_01', scale: [3.4, 5, 2.4, 3], base: [0.3, 0.34, 0.22], tint: { S: [0.9, 0.88, 0.82] }, green: 0.85 },
    },
    props: (grp, H, q) => {
      const lib = propLibrary({ id: 'meadow' }, Math.min(q, 1));
      const col = lib.pillar();
      const rows = [];
      for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) rows.push([sx * 7.5, -16 - i * 7]);
      let k = 0;
      scatter(grp, H, col, rows.length, () => rows[k++ % rows.length], { seed: 60, s: [1.2, 1.4], slopeMax: 20 });
      scatter(grp, H, lib.obelisk(), 1, () => [0, -62], { seed: 61, s: [1.2, 1.2], slopeMax: 20 });
      scatter(grp, H, propLibrary({ id: 'graveyard' }, Math.min(q, 1)).tomb(), 16, (rnd) => { const x = (rnd() - 0.5) * 26, z = -12 - rnd() * 40; return clear(x, z) || Math.abs(x) < 3 ? null : [x, z]; }, { seed: 62, s: [1.2, 2], slopeMax: 2 });
      scatter(grp, H, scanRockSpec([['rock_moss_set_01', [0, 3, 4]]], null), 26, ring(8, 50), { s: [0.5, 2], seed: 63 });
      scatter(grp, H, lib.pine(), 120, side(ring(25, 140)), { seed: 64, s: [1, 1.8] });
    },
  },
  // 11. Alien world: violet rock, glowing crystals, floating boulders and a ringed planet in a black sky.
  11: {
    name: 'Alien world',
    sky: { zen: [0.004, 0.003, 0.015], hor: [0.18, 0.06, 0.3], gnd: [0.06, 0.02, 0.1], sun: [0.6, 0.12, -1], sunCol: [0.4, 0.95, 1.0], sunSize: 0.0012, glow: 1.2, clouds: 0, stars: 1.6 },
    fog: [0x1c0e2c, 0.006], sunL: [0x7ae8ff, 2.2, [24, 16, -40]], hemi: [0x8a50d0, 0x200830, 0.7],
    planet: { pos: [-50, 34, -280], r: 42, color: 0xc8a0ff, ring: true },
    land: {
      flat: 9, ramp: 26,
      h: (x, z) => { const d = Math.hypot(x, z + 3); return Math.pow(ridged(x + 77, z, 0.012), 2.4) * 45 * ss(30, 140, d) + N2.fbm(x * 0.05, z * 0.05, 3) * 4 - 2; },
      near: (x, z) => (N2.fbm(x * 0.2, z * 0.2, 3) - 0.5) * 0.5,
      weights: (x, y, z, sl) => { const r = ss(0.3, 0.55, sl); const glow = (1 - ss(0.0, 0.012, Math.abs(N2.fbm(x * 0.05, z * 0.05, 3) - 0.5))) * ss(10, 18, Math.hypot(x, z + 3)) * (1 - ss(0.1, 0.25, sl)) * ss(4, 1, y); return [r, (1 - r) * ss(0.5, 0.62, N.fbm(x * 0.08, z * 0.08, 3)) * 0.9, 0, glow]; },
      mat: { key: 'alien', A: 'dark_rock_02', R: 'dark_rock', S: 'burned_ground_01', scale: [3.4, 4, 3.2, 3], base: [0.15, 0.1, 0.2], tint: { A: [0.75, 0.62, 0.98], R: [0.62, 0.55, 0.85], S: [0.7, 0.55, 0.9] }, lava: [0.3, 1.6, 2.2] },
    },
    props: (grp, H, q) => {
      const lib = propLibrary({ id: 'abyss' }, Math.min(q, 1));
      scatter(grp, H, lib.voidcrystal(), 26, ring(9, 60), { seed: 70, s: [0.8, 2.2] });
      scatter(grp, H, lib.floater(), 14, side(ring(20, 90)), { seed: 71, s: [2, 6], lift: [10, 30] });
      scatter(grp, H, scanRockSpec([['boulder_01', [0]], ['rock_moss_set_02', [4, 6]]], [0.5, 0.44, 0.66]), 30, ring(8, 60), { s: [0.5, 2.6], seed: 72 });
      const l = new THREE.PointLight(0x9a5cff, 40, 40, 1.6); l.position.set(-5, 3, -16); grp.add(l);
    },
  },
};

export const BG_NAMES = { 1: 'Waterfall valley', ...Object.fromEntries(Object.entries(OPTIONS).map(([k, v]) => [k, v.name])) };

// ---------------------------------------------------------------- wiring
export function setupLobbyBg(menu, q) {
  if (!BG) return;
  const grp = new THREE.Group(); grp.visible = false; menu.scene.add(grp);
  const fogOf = [];
  let enter, leave;
  if (BG === 1) {
    // The approved title valley itself, seen from the meadow at golden hour, the falls behind the hero.
    const V = menu.vista.group, H = menu.vista.height;
    let P = null, best = 1e9;
    for (let x = FALLS.x - 16; x <= FALLS.x + 16; x += 1) for (let z = -30; z <= 10; z += 1) {
      const y = H(x, z), e = 1.5, sl = Math.abs(H(x + e, z) - H(x - e, z)) + Math.abs(H(x, z + e) - H(x, z - e));
      if (y < 0.6 || Math.abs(x - FALLS.x) < 7) continue;
      const cost = sl * 10 + Math.abs(z + 12) * 0.15 + Math.abs(Math.abs(x - FALLS.x) - 9) * 0.3;
      if (cost < best) { best = cost; P = [x, y, z]; }
    }
    const off = new THREE.Vector3(-P[0], -P[1], -P[2] - 3);
    // Clear trees, tufts and rocks round the hero and the camera.
    // and keep the view from the hero to the falls open
    const keep = (x, z) => { const dz = P[2] - z, mx = P[0] + (FALLS.x - P[0]) * Math.min(1, Math.max(0, dz / (P[2] - FALLS.z))); return !((Math.abs(x - P[0]) < 9 && dz < 9 && dz > -14) || (dz > 0 && Math.abs(x - mx) < 6 + dz * 0.28)); };
    const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const prune = () => V.traverse((o) => {
      if (o.isInstancedMesh && o.material.alphaMap) { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); p.setFromMatrixPosition(m4); if (Math.abs(p.x - P[0]) < 7 && p.z - P[2] > -5 && p.z - P[2] < 12) o.setMatrixAt(i, zero); } o.instanceMatrix.needsUpdate = true; }
      else if (o.isInstancedMesh) { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); p.setFromMatrixPosition(m4); if (!keep(p.x, p.z)) o.setMatrixAt(i, zero); } o.instanceMatrix.needsUpdate = true; }
      else if (o.isMesh && o.geometry && o.geometry.boundingSphere && o.parent === V && o.position.lengthSq() > 0 && !keep(o.position.x, o.position.z)) o.visible = false;
    });
    let pruned = false;
    enter = () => {
      if (!pruned) { prune(); pruned = true; }
      V.position.copy(off); V.visible = true; menu.sky.visible = true; menu.sky.material.uniforms.uDay.value = 1;
      menu.scene.fog.color.set(0xd4dce4); menu.scene.fog.density = 0.0026; menu.fx.setFog(0.0026);
    };
    leave = () => { V.position.set(0, 0, 0); };
    // pruning only hides things near the lobby spot, far from the title camera, so the title view is unchanged
  } else {
    const o = OPTIONS[BG];
    const H = buildLand(o.land, grp);
    o.props(grp, H, q);
    const sky = makeBgSky(o.sky); grp.add(sky);
    const sun = new THREE.DirectionalLight(o.sunL[0], o.sunL[1]);
    sun.position.set(...o.sunL[2]); sun.castShadow = q >= 1; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 140 }); sun.shadow.bias = -0.0004;
    grp.add(sun);
    grp.add(new THREE.HemisphereLight(o.hemi[0], o.hemi[1], o.hemi[2]));
    enter = () => { menu.sky.visible = false; menu.scene.fog.color.set(o.fog[0]); menu.scene.fog.density = o.fog[1]; menu.fx.setFog(o.fog[1]); };
    leave = () => {};
    menu._bgEmbers = !!o.embers;
    if (o.water) {
      const w = o.water;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: w.color, roughness: w.rough, metalness: w.metal, emissive: w.emissive || 0x000000, envMapIntensity: 1.4 }));
      m.position.y = w.y; m.receiveShadow = true; grp.add(m);
    }
    if (o.planet) {
      const pl = o.planet;
      const m = new THREE.Mesh(new THREE.SphereGeometry(pl.r, 48, 32), new THREE.MeshStandardMaterial({ color: pl.color, roughness: 0.9, fog: false, emissive: 0x1a0a30 }));
      m.position.set(...pl.pos); m.renderOrder = -2; grp.add(m);
      if (pl.ring) {
        const rg = new THREE.Mesh(new THREE.RingGeometry(pl.r * 1.35, pl.r * 2.1, 96), new THREE.MeshBasicMaterial({ color: 0xd8c0ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, fog: false, depthWrite: false }));
        rg.position.copy(m.position); rg.rotation.set(-1.25, 0.2, 0.35); rg.renderOrder = -2; grp.add(rg);
      }
      const pk = new THREE.DirectionalLight(0xffffff, 0); grp.add(pk);
    }
    if (o.steam) {
      const up = menu.update.bind(menu);
      menu.update = (dt, mouse) => {
        up(dt, mouse);
        if (!grp.visible) return;
        for (const [x, z, r] of o.steam) if (Math.random() < 0.5) menu.fx.smoke.emit({ p: [x + (Math.random() - 0.5) * r * 1.4, H(x, z) + 1.0, z + (Math.random() - 0.5) * r * 1.4], v: [(Math.random() - 0.5) * 0.3, 0.7 + Math.random() * 0.5, 0], life: 4, s0: 1.2, s1: 4.5, c0: [1, 1, 1, 0.22], c1: [1, 1, 1, 0] });
      };
    }
  }
  // A photographer's key light on the hero (Nutty 2026-11-08: the knight read as a black shape against the bright forest).
  // It shines from just above and to the right of the camera, so the front of the character is always lit and polished
  // armour catches a highlight; a cooler fill from the other side keeps the shadow side from going black.
  {
    const key = new THREE.DirectionalLight(0xfff0dc, 2.4), fill = new THREE.DirectionalLight(0xbfd0ff, 0.9);
    grp.add(key, key.target, fill, fill.target);
    const fw = new THREE.Vector3(), rt = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0);
    const up2 = menu.update.bind(menu);
    menu.update = (dt, mouse) => {
      up2(dt, mouse);
      if (!grp.visible || !menu.camera) return;
      const c = menu.camera.position;
      menu.camera.getWorldDirection(fw); rt.crossVectors(fw, UPV).normalize();
      const aim = c.clone().addScaledVector(fw, 6);
      key.position.copy(c).addScaledVector(rt, 2.5).addScaledVector(UPV, 3); key.target.position.copy(aim);
      fill.position.copy(c).addScaledVector(rt, -3).addScaledVector(UPV, 0.5); fill.target.position.copy(aim);
    };
  }
  const sd = menu.setDay.bind(menu);
  menu.setDay = (day) => {
    sd(day);
    if (day) { grp.visible = false; menu.sky.visible = true; leave(); }
    else { menu.dusk.visible = false; grp.visible = true; enter(); }
  };
  // Portraits are shot on black with the dusk lights only: keep the new backdrop out of them.
  const pt = menu.portrait.bind(menu);
  menu.portrait = (r, id) => { const v = grp.visible, vv = menu.vista.group.visible; grp.visible = false; menu.vista.group.visible = false; const u = pt(r, id); grp.visible = v; menu.vista.group.visible = vv; return u; };
  void fogOf;
}
