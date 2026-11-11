// Home screen backdrop (Nutty 2026-11-11): Nutty's oil painting of a river running between pine banks toward misty
// blue mountains, brought to life. The scene is a real 3D valley (so it fills any screen shape): water that flows
// toward you, pines and grass that sway in gusts, drifting streaky clouds and valley mist. A Kuwahara pass then
// turns every frame into thick oil-paint strokes on canvas, so it reads as the painting moving.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, makeNoise } from './rng.js';

const RIVER_W = 8.5; // half width of the river
const HAZE = new THREE.Color(0.82, 0.9, 0.96);

// GLSL noise shared by the shaders.
const NOISE = `
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;
// Distance haze toward the valley's pale blue air (applied by hand: these shaders skip three's fog).
const HAZE_GLSL = `
  uniform vec3 uHaze; uniform float uHazeK;
  vec3 haze(vec3 c, float d){ return mix(c, uHaze, 1.0 - exp(-d * uHazeK)); }
`;

function riverHalf(z) { return RIVER_W + Math.sin(z * 0.013) * 1.2; }
// Ground height: the river bed, then a bank that rises to the grassy shelf the forest stands on.
function groundH(n, x, z) {
  const w = riverHalf(z), ax = Math.abs(x);
  const bank = THREE.MathUtils.smoothstep(ax, w - 1.5, w + 3.5);
  const lumps = (n.fbm(x * 0.05, z * 0.05, 3) - 0.5) * 3 + (n.fbm(x * 0.4, z * 0.4, 2) - 0.5) * 0.4;
  return -1.2 + bank * (2.6 + Math.max(0, lumps)) + THREE.MathUtils.smoothstep(ax, w + 12, 90) * 6;
}

// ------------------------------------------------------------------ sky
function makeSky() {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { t: { value: 0 } },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `${NOISE}
      uniform float t; varying vec3 vP;
      void main(){
        vec3 d = normalize(vP); float y = max(d.y, 0.0);
        vec3 zen = vec3(0.08, 0.30, 0.68), mid = vec3(0.30, 0.58, 0.86), hor = vec3(0.86, 0.93, 0.95);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.22, y));
        c = mix(c, zen, smoothstep(0.18, 0.7, y));
        // Pale sun haze behind the mountains, a touch of yellow like the painting.
        float sd = max(dot(d, normalize(vec3(0.05, 0.16, -1.0))), 0.0);
        c = mix(c, vec3(0.95, 0.95, 0.78), pow(sd, 24.0) * 0.55);
        // Streaky brushed clouds: stretched sideways, drifting slowly.
        vec2 p = vec2(atan(d.x, -d.z) * 2.2 + t * 0.006, y * 9.0);
        float s = fbm(vec2(p.x * 1.3, p.y * 3.2) + vec2(0.0, fbm(p * 0.7) * 1.5));
        float w = smoothstep(0.52, 0.8, s) * smoothstep(0.02, 0.12, y);
        float dk = smoothstep(0.58, 0.82, fbm(vec2(p.x * 1.1 + 4.0, p.y * 2.4 - t * 0.003))) * smoothstep(0.25, 0.6, y);
        c = mix(c, vec3(0.92, 0.96, 1.0), w * 0.8);
        c = mix(c, vec3(0.05, 0.22, 0.58), dk * 0.55);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 48, 24), m);
  sky.renderOrder = -10;
  return sky;
}

// ------------------------------------------------------------------ mountains
// Painted cut-outs far up the valley: soft blue peaks in the gap, a huge slanting grey-violet ridge on the right.
function makeMountains() {
  const g = new THREE.Group();
  const mat = (cTop, cLow, seed) => new THREE.ShaderMaterial({
    depthWrite: false, transparent: true, fog: false,
    uniforms: { cTop: { value: new THREE.Color(...cTop) }, cLow: { value: new THREE.Color(...cLow) }, seed: { value: seed } },
    vertexShader: `varying vec2 vU; attribute float hgt; varying float vH; void main(){ vU = position.xy; vH = hgt; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `${NOISE}
      uniform vec3 cTop, cLow; uniform float seed; varying vec2 vU; varying float vH;
      void main(){
        float k = clamp(vU.y / max(vH, 1.0), 0.0, 1.0);
        vec3 c = mix(cLow, cTop, smoothstep(0.1, 0.9, k));
        // Palette-knife strokes running down the slopes.
        float s = fbm(vec2(vU.x * 0.03 + vU.y * 0.025, vU.y * 0.004 + seed));
        c *= 0.82 + 0.35 * s;
        c = mix(c, c * 0.55, smoothstep(0.62, 0.75, fbm(vec2(vU.x * 0.05 - vU.y * 0.04, seed * 3.0))) * k);
        float a = smoothstep(0.0, 0.35, k); // the foot melts into the valley mist
        gl_FragColor = vec4(c, a);
        #include <colorspace_fragment>
      }`,
  });
  const ridge = (z, x0, x1, prof, cTop, cLow, seed) => {
    const N = 140, pos = [], hg = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, x = x0 + (x1 - x0) * u, h = prof(u);
      pos.push(x, -60, z, x, h, z); hg.push(h, h);
      if (i < N) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('hgt', new THREE.Float32BufferAttribute(hg, 1));
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, mat(cTop, cLow, seed));
    g.add(m);
    return m;
  };
  const n = makeNoise(5);
  const peak = (u, c, w, h) => h * Math.max(0, 1 - Math.abs(u - c) / w);
  const jag = (u, s) => (n.fbm(u * 18 + s, s, 3) - 0.5) * 22;
  // Back: the tall blue peaks in the gap.
  ridge(-1300, -520, 520, (u) => Math.max(peak(u, 0.47, 0.09, 330), peak(u, 0.54, 0.08, 360), peak(u, 0.4, 0.2, 200), 40) + jag(u, 1), [0.30, 0.38, 0.64], [0.66, 0.74, 0.88], 1.0).renderOrder = -6;
  // Middle: the soft grey-blue slope on the left of the gap.
  ridge(-1100, -620, 200, (u) => Math.max(peak(u, 0.5, 0.35, 230), 30) + jag(u, 7) * 0.6, [0.42, 0.5, 0.7], [0.75, 0.82, 0.92], 2.0).renderOrder = -5;
  // Right: the big slanting grey-violet mountain.
  ridge(-900, 10, 1000, (u) => Math.max(0, Math.min(1, u * 1.5)) * 620 - Math.max(0, u - 0.66) * 300 + jag(u, 13), [0.48, 0.44, 0.58], [0.72, 0.74, 0.86], 3.0).renderOrder = -4;
  return g;
}

// ------------------------------------------------------------------ ground
function makeGround(n) {
  const W = 260, D = 760, geo = new THREE.PlaneGeometry(W, D, 220, 320);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -D / 2 + 40);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, groundH(n, p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();
  const m = new THREE.ShaderMaterial({
    fog: false,
    uniforms: { uHaze: { value: HAZE }, uHazeK: { value: 0.0042 } },
    vertexShader: `varying vec3 vW; varying vec3 vN; varying float vD;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normal; vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `${NOISE}${HAZE_GLSL}
      varying vec3 vW; varying vec3 vN; varying float vD;
      float riverHalf(float z){ return ${RIVER_W.toFixed(1)} + sin(z * 0.013) * 1.2; }
      void main(){
        float ax = abs(vW.x), e = ax - riverHalf(vW.z);
        float n1 = fbm(vW.xz * 0.12), n2 = fbm(vW.xz * 0.6 + 3.0);
        vec3 grass = mix(vec3(0.18, 0.26, 0.07), vec3(0.62, 0.62, 0.16), smoothstep(0.35, 0.75, n1 * 0.7 + n2 * 0.4));
        grass = mix(grass, vec3(0.42, 0.33, 0.12), smoothstep(0.6, 0.8, fbm(vW.xz * 0.05 + 9.0)) * 0.6);
        // The bank: dark brown earth with white-grey rock strokes along the water's edge.
        float bandK = smoothstep(-1.6, -0.6, e) * (1.0 - smoothstep(2.0, 3.6, e));
        vec3 rock = mix(vec3(0.20, 0.14, 0.10), vec3(0.32, 0.24, 0.18), n2);
        float streak = smoothstep(0.66, 0.74, fbm(vec2(vW.z * 0.35, vW.y * 2.5 + vW.x * 0.2)));
        rock = mix(rock, vec3(0.92, 0.9, 0.86), streak * 0.85);
        vec3 c = mix(grass, rock, bandK);
        vec3 L = normalize(vec3(-0.3, 0.8, -0.5));
        c *= 0.55 + 0.6 * max(dot(normalize(vN), L), 0.0);
        gl_FragColor = vec4(haze(c, vD), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  return new THREE.Mesh(geo, m);
}

// ------------------------------------------------------------------ water
function makeWater() {
  const geo = new THREE.PlaneGeometry(2 * RIVER_W + 8, 900, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -0.15, -410);
  const m = new THREE.ShaderMaterial({
    fog: false,
    uniforms: { t: { value: 0 }, uHaze: { value: HAZE }, uHazeK: { value: 0.0042 } },
    vertexShader: `varying vec3 vW; varying float vD;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `${NOISE}${HAZE_GLSL}
      uniform float t; varying vec3 vW; varying float vD;
      float riverHalf(float z){ return ${RIVER_W.toFixed(1)} + sin(z * 0.013) * 1.2; }
      void main(){
        float z = vW.z - t * 2.6; // the current runs toward you
        float e = abs(vW.x) / riverHalf(vW.z);
        // Body: bright sky blue down the middle, deeper blue toward the banks.
        vec3 c = mix(vec3(0.62, 0.82, 0.93), vec3(0.23, 0.50, 0.78), smoothstep(0.15, 0.95, e));
        // Green reflections of the forest hugging each bank.
        float refl = smoothstep(0.55, 0.95, e) * (0.6 + 0.4 * fbm(vec2(vW.x * 0.3, z * 0.08)));
        c = mix(c, vec3(0.18, 0.34, 0.24), refl * 0.75);
        // Long horizontal brush strokes that slide downstream.
        float s1 = fbm(vec2(vW.x * 0.07 + t * 0.02, z * 0.9));
        float s2 = fbm(vec2(vW.x * 0.15 - 3.0, z * 2.3 + 5.0));
        c = mix(c, vec3(0.12, 0.33, 0.62), smoothstep(0.62, 0.78, s1) * 0.5);
        c = mix(c, vec3(0.97, 0.98, 1.0), smoothstep(0.7, 0.8, s2) * (1.0 - refl) * 0.85);
        // Glints: tiny bright flecks that ride the current.
        float gl = smoothstep(0.93, 0.99, vn(vec2(vW.x * 1.7, z * 3.1 + 2.0)) * vn(vec2(vW.x * 0.9 + 4.0, z * 1.3)) * 1.6);
        c += vec3(1.0, 0.98, 0.9) * gl * (1.0 - refl) * 0.6;
        // The far reach turns to bright sky as the water meets the mist.
        c = mix(c, vec3(0.86, 0.93, 0.98), smoothstep(80.0, 320.0, vD) * 0.6);
        gl_FragColor = vec4(haze(c, vD * 0.7), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  return new THREE.Mesh(geo, m);
}

// ------------------------------------------------------------------ pines
// One drooping-tier pine (normalised to 1 m tall, base at 0): pale trunk, layered dark-green skirts.
function pineGeo(seed) {
  const r = mulberry32(seed), parts = [];
  const trunk = new THREE.CylinderGeometry(0.004, 0.011, 1, 5).translate(0, 0.5, 0);
  paint(trunk, null, 1);
  parts.push(trunk);
  // Foliage: drooping clumps of needles stacked in tiers around the trunk, narrowing to a spire.
  const tiers = 12 + Math.floor(r() * 4), base = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < tiers; i++) {
    const k = i / tiers, y = 0.12 + k * 0.8, rad = (1 - k) * 0.13 + 0.02;
    const m = Math.max(1, Math.round(6 * (1 - k) + 1));
    for (let j = 0; j < m; j++) {
      const a = (j / m) * Math.PI * 2 + r() * 0.8 + i * 0.7, rr = m === 1 ? 0 : rad * (0.6 + r() * 0.4);
      const sz = (0.035 + (1 - k) * 0.05) * (0.8 + r() * 0.4);
      const c = base.clone();
      // Ragged, drooping bough: spiky outline, edges sag downward.
      const cp = c.attributes.position, ph = r() * 6.28;
      for (let q = 0; q < cp.count; q++) {
        const x = cp.getX(q), y = cp.getY(q), z = cp.getZ(q), an = Math.atan2(z, x);
        const f = 1 + 0.45 * Math.max(0, Math.sin(an * 7 + ph)) * (1 - Math.abs(y));
        cp.setXYZ(q, x * f, y - (x * x + z * z) * 0.7, z * f);
      }
      c.scale(sz * 1.7, sz * 0.6, sz * 1.7);
      c.rotateZ((r() - 0.5) * 0.5); c.rotateY(a);
      c.translate(Math.cos(a) * rr, y - rr * 0.35, Math.sin(a) * rr);
      paint(c, null, 0);
      parts.push(c);
    }
  }
  const spire = new THREE.ConeGeometry(0.012, 0.1, 5).translate(0, 0.95, 0);
  paint(spire, null, 0);
  parts.push(spire);
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  // Soft volume shading: normals lean out from the trunk (and up a little), mixed with each clump's own.
  const P = g.attributes.position, N = g.attributes.normal, T = g.attributes.trunk, v = new THREE.Vector3(), o = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    if (T.getX(i) > 0.5) continue;
    const x = P.getX(i), z = P.getZ(i), l = Math.hypot(x, z) || 1e-4;
    v.set(x / l, 0.5, z / l).normalize();
    o.set(N.getX(i), N.getY(i), N.getZ(i)).lerp(v, 0.6).normalize();
    N.setXYZ(i, o.x, o.y, o.z);
  }
  return g;
}
function paint(g, rgb, trunk) {
  const n = g.attributes.position.count;
  g.setAttribute('trunk', new THREE.Float32BufferAttribute(new Float32Array(n).fill(trunk), 1));
}
function makePines(n) {
  const geos = [pineGeo(3), pineGeo(11), pineGeo(29)];
  const r = mulberry32(77), lists = geos.map(() => []);
  const place = (x, z, s) => lists[Math.floor(r() * geos.length)].push([x, groundH(n, x, z) - 0.4, z, s, r() * Math.PI * 2]);
  // Dense forest on both banks: the near rows stand tall right at the edge, like the painting.
  for (let z = -10; z > -560; z -= 2.2 + (-z) * 0.012) {
    for (const side of [-1, 1]) {
      const w = riverHalf(z);
      const rows = 6 + Math.floor(-z / 40);
      for (let k = 0; k < rows; k++) {
        if (r() < 0.25) continue;
        const x = side * (w + 6 + Math.max(0, -z - 50) * 0.16 + k * (4 + (-z) * 0.02) + r() * 4 + (z > -45 ? 6 : 0));
        if (Math.abs(x) > 128) continue;
        const s = (19 + r() * 16) * (k === 0 ? 1.15 : 1) * (1 + Math.max(0, -z - 200) * 0.0015);
        place(x, z + (r() - 0.5) * 3, s);
      }
    }
  }
  const mat = new THREE.ShaderMaterial({
    fog: false,
    uniforms: { t: { value: 0 }, uHaze: { value: HAZE }, uHazeK: { value: 0.0042 } },
    vertexShader: `${NOISE}
      attribute float trunk; uniform float t; varying vec3 vN; varying float vH; varying float vD; varying float vTr; varying vec3 vW; varying float vSeed;
      void main(){
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        float h = position.y; vH = h; vTr = trunk;
        vSeed = fract(instanceMatrix[3].x * 0.137 + instanceMatrix[3].z * 0.071);
        // Wind: a slow swell plus travelling gusts; the top sways most.
        float gust = fbm(vec2(w.x * 0.012 - t * 0.35, w.z * 0.012));
        float sway = (sin(t * 1.3 + vSeed * 6.28) * 0.35 + gust * 1.6 - 0.6) * h * h * 1.1;
        w.x += sway; w.z += sway * 0.3;
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `${NOISE}${HAZE_GLSL}
      varying vec3 vN; varying float vH; varying float vD; varying float vTr; varying vec3 vW; varying float vSeed;
      void main(){
        vec3 L = normalize(vec3(-0.6, 0.55, 0.45));
        float lit = max(dot(normalize(vN), L), 0.0);
        float nz = fbm(vW.xz * 0.7 + vW.y * 0.9);
        vec3 dark = vec3(0.04, 0.11, 0.07), mid = vec3(0.10, 0.22, 0.09), hi = vec3(0.55, 0.60, 0.17);
        vec3 c = mix(dark, mid, smoothstep(0.2, 0.8, lit * 0.8 + nz * 0.4));
        c = mix(c, hi, smoothstep(0.72, 0.95, lit * 0.55 + nz * 0.7) * (0.4 + vSeed * 0.6));
        // Needle dabs: clumps of light and shade like palette-knife touches.
        float dab = fbm(vW.xz * 3.5 + vW.y * 4.0);
        c *= 0.6 + 0.8 * dab;
        vec3 bark = mix(vec3(0.22, 0.18, 0.14), vec3(0.88, 0.86, 0.8), smoothstep(0.15, 0.3, vH));
        c = mix(c, bark * (0.7 + lit * 0.4), vTr);
        gl_FragColor = vec4(haze(c, vD), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const g = new THREE.Group(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  geos.forEach((geo, gi) => {
    const L = lists[gi];
    const im = new THREE.InstancedMesh(geo, mat, L.length);
    L.forEach(([x, y, z, s, a], i) => { q.setFromEuler(e.set(0, a, 0)); m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s * 0.9, s, s * 0.9)); im.setMatrixAt(i, m4); });
    im.frustumCulled = false;
    g.add(im);
  });
  g.userData.mat = mat;
  return g;
}

// ------------------------------------------------------------------ bushes and grass on the near banks
function makeBrush(n) {
  const blade = new THREE.ConeGeometry(0.05, 1, 3, 1, true).translate(0, 0.5, 0);
  const blob = new THREE.IcosahedronGeometry(1, 1);
  const r = mulberry32(5);
  const blades = [], blobs = [];
  for (let i = 0; i < 9000; i++) {
    const side = r() < 0.5 ? -1 : 1, z = 12 - Math.pow(r(), 1.6) * 170, w = riverHalf(z);
    const x = side * (w + 1.2 + Math.pow(r(), 1.3) * 30);
    blades.push([x, groundH(n, x, z), z, 0.6 + r() * 1.4, r()]);
  }
  for (let i = 0; i < 1400; i++) {
    const side = r() < 0.5 ? -1 : 1, z = 10 - Math.pow(r(), 1.4) * 220, w = riverHalf(z);
    const x = side * (w + 3 + r() * 30);
    blobs.push([x, groundH(n, x, z), z, 0.6 + r() * 1.4, r()]);
  }
  const mat = (blob) => new THREE.ShaderMaterial({
    fog: false,
    uniforms: { t: { value: 0 }, uHaze: { value: HAZE }, uHazeK: { value: 0.0042 } },
    vertexShader: `${NOISE}
      attribute float tint; uniform float t; varying float vT; varying float vD; varying vec3 vN; varying float vH;
      void main(){
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        float h = ${blob ? 'position.y * 0.5 + 0.5' : 'position.y'}; vH = h; vT = tint;
        float gust = fbm(vec2(w.x * 0.05 - t * 0.6, w.z * 0.05));
        w.x += (sin(t * 2.1 + w.z * 0.3) * 0.15 + gust * 0.9 - 0.3) * h * ${blob ? '0.25' : '0.55'};
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `${HAZE_GLSL}
      varying float vT; varying float vD; varying vec3 vN; varying float vH;
      void main(){
        float lit = max(dot(normalize(vN), normalize(vec3(-0.35, 0.75, -0.4))), 0.0);
        vec3 a = mix(vec3(0.20, 0.30, 0.06), vec3(0.70, 0.70, 0.18), vT);
        vec3 c = mix(a * 0.5, a * 1.2, ${blob ? 'lit * 0.8 + vH * 0.3' : 'vH'});
        gl_FragColor = vec4(haze(c, vD), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const build = (geo, list, blob) => {
    const im = new THREE.InstancedMesh(geo, mat(blob), list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const tint = new Float32Array(list.length);
    list.forEach(([x, y, z, s, k], i) => {
      q.setFromEuler(e.set((k - 0.5) * 0.5, k * 9, (k - 0.5) * 0.6));
      m4.compose(new THREE.Vector3(x, y - (blob ? s * 0.3 : 0), z), q, blob ? new THREE.Vector3(s, s * 0.7, s) : new THREE.Vector3(s, s, s));
      im.setMatrixAt(i, m4); tint[i] = k;
    });
    geo.setAttribute('tint', new THREE.InstancedBufferAttribute(tint, 1));
    im.frustumCulled = false;
    return im;
  };
  const g = new THREE.Group();
  g.add(build(blade, blades, false), build(blob, blobs, true));
  g.userData.mats = g.children.map((c) => c.material);
  return g;
}

// ------------------------------------------------------------------ valley mist
function makeMist() {
  const g = new THREE.Group(), mats = [];
  const layers = [[-150, 70, 30, 0.6], [-240, 110, 60, 0.85], [-360, 170, 100, 0.95], [-520, 260, 150, 1.0], [-700, 380, 200, 0.9]];
  layers.forEach(([z, w, h, a], i) => {
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { t: { value: 0 }, a: { value: a }, seed: { value: i * 7.3 } },
      vertexShader: `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `${NOISE}
        uniform float t, a, seed; varying vec2 vU;
        void main(){
          float n = fbm(vec2(vU.x * 3.0 + t * 0.02 + seed, vU.y * 1.6 - t * 0.01));
          float edge = smoothstep(0.0, 0.25, vU.x) * smoothstep(1.0, 0.75, vU.x) * smoothstep(1.0, 0.25, vU.y) * smoothstep(0.0, 0.08, vU.y);
          float al = smoothstep(0.22, 0.7, n) * edge * a;
          gl_FragColor = vec4(vec3(0.93, 0.96, 0.99), al);
          #include <colorspace_fragment>
        }`,
    });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    p.position.set(0, h * 0.35, z);
    p.renderOrder = 2 + i;
    g.add(p); mats.push(m);
  });
  g.userData.mats = mats;
  return g;
}

// ------------------------------------------------------------------ birds
function makeBirds() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0.25, 0, 0, 0, 0, 0, 0, 0, 1, 0.25, 0, 0, -0.05, 0, 0, 0.08, 0], 3));
  geo.setIndex([0, 4, 5, 3, 5, 4]);
  const mat = new THREE.MeshBasicMaterial({ color: 0x1b2430, side: THREE.DoubleSide, fog: false });
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(geo, mat); b.userData.k = i; g.add(b); }
  return g;
}

// ------------------------------------------------------------------ oil-paint pass
// Kuwahara filter: each pixel takes the calmest of four neighbouring squares, which flattens detail into
// brush-stroke patches while keeping edges crisp. Then a canvas weave and a soft vignette.
function makePaintPass() {
  return new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, radius: { value: 4 }, t: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tSrc; uniform vec2 texel; uniform float radius, t; varying vec2 vUv;
      ${NOISE}
      void main(){
        vec3 m[4]; vec3 s[4];
        for (int k = 0; k < 4; k++){ m[k] = vec3(0.0); s[k] = vec3(0.0); }
        const int R = 4;
        float st = radius / float(R);
        // Brush direction varies across the canvas so strokes don't look stamped.
        float ang = fbm(vUv * 6.0) * 3.14;
        mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
        for (int j = -R; j <= R; j++) for (int i = -R; i <= R; i++){
          vec2 o = rot * (vec2(float(i), float(j)) * st);
          vec3 c = texture2D(tSrc, vUv + o * texel).rgb;
          vec3 c2 = c * c;
          if (i <= 0 && j <= 0){ m[0] += c; s[0] += c2; }
          if (i >= 0 && j <= 0){ m[1] += c; s[1] += c2; }
          if (i <= 0 && j >= 0){ m[2] += c; s[2] += c2; }
          if (i >= 0 && j >= 0){ m[3] += c; s[3] += c2; }
        }
        float n = float((R + 1) * (R + 1));
        float best = 1e9; vec3 col = vec3(0.0);
        for (int k = 0; k < 4; k++){
          vec3 mu = m[k] / n; vec3 v = abs(s[k] / n - mu * mu);
          float sig = v.r + v.g + v.b;
          if (sig < best){ best = sig; col = mu; }
        }
        // Canvas weave and paint ridges.
        vec2 px = vUv / texel;
        float weave = (sin(px.x * 1.6) * sin(px.y * 1.6)) * 0.018 + (vn(px * 0.35) - 0.5) * 0.05;
        col *= 1.0 + weave;
        col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 1.08);
        vec2 q = vUv - 0.5; col *= 1.0 - dot(q, q) * 0.45;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

export class PaintScape {
  constructor(q = 2) {
    this.q = q;
    const n = makeNoise(21);
    const g = (this.group = new THREE.Group());
    this.sky = makeSky();
    this.mountains = makeMountains();
    this.ground = makeGround(n);
    this.water = makeWater();
    this.pines = makePines(n);
    this.brush = makeBrush(n);
    this.mist = makeMist();
    this.birds = makeBirds();
    g.add(this.sky, this.mountains, this.ground, this.water, this.pines, this.brush, this.mist, this.birds);
    this.paint = makePaintPass();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.paint);
    this.quad.frustumCulled = false;
    this.postScene = new THREE.Scene();
    this.postScene.add(this.quad);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.rt = null;
  }
  // Where the home screen camera stands: low over the water, looking up the river.
  placeCamera(cam, t, mouse) {
    const mx = mouse ? mouse.x : 0, my = mouse ? mouse.y : 0;
    cam.fov = 50; cam.near = 0.5; cam.far = 4000;
    cam.position.set(Math.sin(t * 0.05) * 0.6 + mx * 0.8, 3.0 + Math.sin(t * 0.07) * 0.15 + my * 0.3, 16);
    cam.lookAt(mx * 4 - (cam.aspect > 1.3 ? 14 : 0), 26 + my * 3, -200);
    cam.updateProjectionMatrix();
  }
  update(t) {
    this.sky.material.uniforms.t.value = t;
    this.water.material.uniforms.t.value = t;
    this.pines.userData.mat.uniforms.t.value = t;
    for (const m of this.brush.userData.mats) m.uniforms.t.value = t;
    for (const m of this.mist.userData.mats) m.uniforms.t.value = t;
    for (const b of this.birds.children) {
      const k = b.userData.k, u = ((t * 0.012 + k * 0.07) % 1);
      b.position.set(-260 + u * 520 + k * 9, 120 + k * 7 + Math.sin(t * 0.5 + k) * 4, -420 - k * 12);
      const flap = Math.sin(t * (7 + k) + k * 2);
      b.scale.set(5, 5 * (0.4 + flap * 0.6), 5);
      b.lookAt(b.position.x, b.position.y, 1e4);
    }
  }
  // Renders the scene through the oil-paint pass. Pass the target to draw into (null = screen).
  render(renderer, scene, cam, target = null) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const sc = this.q >= 2 ? 1 : 0.75, w = Math.max(2, Math.round(size.x * sc)), h = Math.max(2, Math.round(size.y * sc));
    if (!this.rt || this.rt.width !== w || this.rt.height !== h) {
      if (this.rt) this.rt.dispose();
      this.rt = new THREE.WebGLRenderTarget(w, h, { samples: 4, type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace });
    }
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.render(scene, cam);
    this.paint.uniforms.tSrc.value = this.rt.texture;
    this.paint.uniforms.texel.value.set(1 / w, 1 / h);
    this.paint.uniforms.radius.value = Math.max(2, Math.round(h / 190));
    renderer.setRenderTarget(target ?? prev);
    renderer.render(this.postScene, this.postCam);
  }
  dispose() {
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    if (this.rt) this.rt.dispose();
  }
}
