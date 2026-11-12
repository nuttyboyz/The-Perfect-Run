// Pyre: Flaming Weapons. While it is up, whatever the fighter holds is wrapped in fire: licking flame tongues that hug the
// weapon (the same warped-noise fire as the Scorching Aura), textured fire and ember particles streaming off it, smoke above.
// It works for any weapon model because it only needs the model's own bounding box: the tongues are rooted along the box's
// long axis. Call updateWeaponFlames() once a frame for every fighter (the player and every remote view).
import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);
const N = 34; // tongues per weapon
let baseMat = null;
function material() {
  if (baseMat) return baseMat.clone();
  baseMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uHot: { value: 0.9 }, uK: { value: 1 }, uA: { value: 1 } },
    vertexShader: `attribute vec3 aS; varying vec2 vUv; varying float vSeed; uniform float uT, uK, uA;
      void main(){
        vUv = uv; vSeed = aS.z;
        vec3 c = (modelMatrix * vec4(position, 1.)).xyz;          // the root of this tongue, on the weapon
        vec3 toCam = normalize(cameraPosition - c);
        vec3 right = normalize(cross(vec3(0., 1., 0.), toCam));
        float w = aS.x * uK, h = aS.y * uK * uA;
        float sway = sin(uT * 3.1 + aS.z * 6.) * .12 + sin(uT * 5.3 + aS.z * 11.) * .06;
        vec3 p = c + right * (uv.x - .5) * w + vec3(0., uv.y * h - .12 * h, 0.) + right * sway * w * uv.y * uv.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
      }`,
    fragmentShader: `uniform float uT, uHot; varying vec2 vUv; varying float vSeed;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float nz(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 4; i++) { v += a * nz(p); p = p * 2.03 + 17.1; a *= .5; } return v; }
      void main(){
        // One lick of flame: a column of rising, warped noise that is eaten away from its edges and its top, so no two
        // frames (and no two licks) have the same outline. Hot pale core low down, orange body, dark red ragged tips.
        float y = vUv.y, t = uT * (1.5 + fract(vSeed * 7.3) * .8) + vSeed * 40.;
        vec2 q = vec2(vUv.x * 1.7 + vSeed * 9., y * 1.4 - t * 1.2);
        vec2 warp = vec2(fbm(q), fbm(q + 5.2)) - .5;
        float x = (vUv.x - .5) * 2. + warp.x * (.5 + y * 1.5);
        float n = fbm(vec2(vUv.x * 2.8 + vSeed * 3., y * 2.4 - t * 2.2) + warp * 1.5);
        float n2 = fbm(vec2(vUv.x * 6. - vSeed * 5., y * 5. - t * 3.1));
        float width = mix(.62, .08, pow(y, .75)) * (.55 + n * .9) * smoothstep(-.02, .26, y); // a teardrop: pinched at the root, widest low down
        float body = 1. - smoothstep(width * .2, width, abs(x) + (n2 - .5) * .45);
        float heat = body * (.3 + n * 1.0) * smoothstep(0., .2, y + (n2 - .5) * .12) * (1. - smoothstep(.45, 1., y + (1. - n) * .6));
        heat = clamp(heat * 1.5 - y * (1. - n2) * .55, 0., 1.);
        vec3 col = mix(vec3(.45, .04, .0), vec3(.95, .2, .02), smoothstep(.05, .3, heat));
        col = mix(col, vec3(1., .52, .08), smoothstep(.28, .58, heat));
        col = mix(col, vec3(1., .78, .34), smoothstep(.7, .98, heat));
        float al = smoothstep(.08, .42, heat) * .88;
        gl_FragColor = vec4(col * (.72 + heat * .38), al);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  return baseMat.clone();
}

// The weapon's own box, in the weapon's local frame.
const _b = new THREE.Box3(), _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _v = new THREE.Vector3();
function localBox(wpn) {
  const box = new THREE.Box3();
  wpn.updateWorldMatrix(true, true);
  _inv.copy(wpn.matrixWorld).invert();
  // A sword-and-shield burns along the sword only: the shield (and anything hanging off it) is left out.
  const skip = new Set(), sh = wpn.userData.shield;
  if (sh) sh.traverse((o) => skip.add(o));
  wpn.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.userData.fwFlame || o.visible === false || skip.has(o)) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    _m.multiplyMatrices(_inv, o.matrixWorld);
    _b.copy(o.geometry.boundingBox).applyMatrix4(_m);
    if (isFinite(_b.min.x) && isFinite(_b.max.x)) box.union(_b);
  });
  return box;
}

function build(wpn) {
  const box = localBox(wpn);
  if (box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3()), ws = wpn.getWorldScale(new THREE.Vector3()).x || 1;
  const long = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
  const thick = Math.max(0.05, (size.x + size.y + size.z - size[long]) / 2) * ws, len = size[long] * ws;
  const pos = [], uv = [], aS = [], idx = [], roots = [];
  for (let k = 0; k < N; k++) {
    const t = (k + 0.5) / N + rnd(-0.02, 0.02), p = new THREE.Vector3(rnd(box.min.x, box.max.x), rnd(box.min.y, box.max.y), rnd(box.min.z, box.max.z));
    p[long] = box.min[long] + size[long] * t;
    for (const ax of ['x', 'y', 'z']) if (ax !== long) p[ax] = (box.min[ax] + box.max[ax]) / 2 + (p[ax] - (box.min[ax] + box.max[ax]) / 2) * 0.5;
    roots.push(p);
    const tall = k % 3 !== 0, w = Math.min(0.34, Math.max(0.15, thick * 1.6 + 0.08)) * rnd(0.8, 1.3), h = (tall ? rnd(0.24, 0.4) : rnd(0.14, 0.22)) * (1 + Math.min(1, len) * 0.2);
    const seed = Math.random();
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { pos.push(p.x, p.y, p.z); uv.push(u, v); aS.push(w, h, seed); }
    const o = k * 4; idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 3)); g.setIndex(idx);
  const mesh = new THREE.Mesh(g, material());
  mesh.frustumCulled = false; mesh.renderOrder = 7; mesh.userData.fwFlame = true;
  return { mesh, box, roots, thick, len };
}

function drop(st) {
  if (!st) return;
  if (st.mesh.parent) st.mesh.parent.remove(st.mesh);
  st.mesh.geometry.dispose(); st.mesh.material.dispose();
}

// on: is Flaming Weapons up for this fighter. o: { fp: first-person view of this model, ads: 0..1 aimed, k: fighter size (2.25 in a duel),
// head: [x, y, z] of the fighter's head (used when nothing is held: Laser Vision burns at the eyes) }.
export function updateWeaponFlames(model, fx, on, t, dt, o = {}) {
  const U = model.userData, wpn = U.weapon;
  let st = U.fwFx;
  if (!on || !wpn || !model.visible) {
    if (st) { drop(st); U.fwFx = null; }
    if (on && !wpn && o.head && fx && model.visible) for (let i = 0; i < fx.n(2); i++) fx.fire.emit({ p: [o.head[0] + rnd(-0.12, 0.12), o.head[1] + rnd(-0.05, 0.08), o.head[2] + rnd(-0.12, 0.12)], v: [rnd(-0.3, 0.3), rnd(1, 2), rnd(-0.3, 0.3)], life: rnd(0.2, 0.4), s0: 0.3, s1: 0.06, c0: [1, 0.5, 0.1, 0.8], c1: [0.9, 0.15, 0.02, 0] });
    return;
  }
  if (!st || st.wpn !== wpn) {
    drop(st);
    st = U.fwFx = build(wpn);
    if (!st) return;
    st.wpn = wpn; st.acc = 0;
    wpn.add(st.mesh);
  }
  const k = o.k || 1, fp = !!o.fp, u = st.mesh.material.uniforms;
  // In first person the flames stay low and thin out as you aim, so the sights are never hidden.
  u.uT.value = t; u.uK.value = k * (fp ? 0.55 : 1); u.uA.value = fp ? 1 - 0.75 * (o.ads || 0) : 1;
  st.mesh.visible = wpn.visible !== false;
  if (!fx || !st.mesh.visible) return;
  // Loose fire, embers and smoke streaming off it.
  st.acc += dt * (fp ? 16 : 34);
  const s = k * (fp ? 0.5 : 1);
  while (st.acc >= 1) {
    st.acc -= 1;
    const r = st.roots[(Math.random() * st.roots.length) | 0];
    _v.copy(r).applyMatrix4(wpn.matrixWorld);
    fx.fire.emit({ p: [_v.x + rnd(-0.04, 0.04) * s, _v.y + rnd(0, 0.06) * s, _v.z + rnd(-0.04, 0.04) * s], v: [rnd(-0.25, 0.25), rnd(0.9, 2.1) * s, rnd(-0.25, 0.25)], life: rnd(0.22, 0.42), s0: rnd(0.2, 0.34) * s, s1: 0.05, c0: [1, 0.55, 0.14, fp ? 0.45 : 0.8], c1: [0.9, 0.16, 0.02, 0] });
    if (Math.random() < 0.3) fx.spark.emit({ p: [_v.x, _v.y, _v.z], v: [rnd(-1, 1), rnd(1.2, 3.2), rnd(-1, 1)], life: rnd(0.35, 0.8), s0: 0.07 * s, s1: 0.01, c0: [1, 0.6, 0.15, 1], c1: [0.9, 0.15, 0, 0], g: 3 });
    if (!fp && Math.random() < 0.12) fx.smoke.emit({ p: [_v.x, _v.y + 0.35 * s, _v.z], v: [rnd(-0.2, 0.2), rnd(0.8, 1.5), rnd(-0.2, 0.2)], life: rnd(0.6, 1.0), s0: 0.2 * s, s1: 0.8 * s, c0: [0.06, 0.05, 0.045, 0.35], c1: [0.16, 0.15, 0.15, 0], rotV: rnd(-1, 1) });
  }
}

// A burning swing: fire along the blade's span this frame (b = base of the blade, t = its tip, world space).
export function swingFire(fx, b, t, k = 1) {
  for (let i = 0; i < fx.n(5); i++) {
    const q = Math.random(), x = b.x + (t.x - b.x) * q, y = b.y + (t.y - b.y) * q, z = b.z + (t.z - b.z) * q;
    fx.fire.emit({ p: [x, y, z], v: [rnd(-0.6, 0.6), rnd(0.6, 2.2), rnd(-0.6, 0.6)], life: rnd(0.25, 0.5), s0: rnd(0.3, 0.55) * k, s1: 0.08, c0: [1, 0.5, 0.1, 0.85], c1: [0.9, 0.14, 0.02, 0] });
  }
  if (Math.random() < 0.5) fx.spark.emit({ p: [t.x, t.y, t.z], v: [rnd(-2, 2), rnd(1, 4), rnd(-2, 2)], life: rnd(0.4, 0.8), s0: 0.09 * k, s1: 0.01, c0: [1, 0.6, 0.15, 1], c1: [0.9, 0.15, 0, 0], g: 4 });
}

// A hit from a flaming weapon: the target catches fire where it was struck.
export function igniteFx(fx, p, k = 1) {
  for (let i = 0; i < fx.n(10); i++) fx.fire.emit({ p: [p[0] + rnd(-0.25, 0.25), p[1] + rnd(-0.3, 0.3), p[2] + rnd(-0.25, 0.25)], v: [rnd(-1.6, 1.6), rnd(1, 3.5), rnd(-1.6, 1.6)], life: rnd(0.25, 0.5), s0: rnd(0.4, 0.75) * k, s1: 0.1, c0: [1, 0.55, 0.12, 0.9], c1: [0.9, 0.15, 0.02, 0] });
  for (let i = 0; i < fx.n(5); i++) fx.spark.emit({ p: [p[0], p[1], p[2]], v: [rnd(-4, 4), rnd(1, 5), rnd(-4, 4)], life: rnd(0.4, 0.8), s0: 0.1, s1: 0.01, c0: [1, 0.6, 0.15, 1], c1: [0.9, 0.15, 0, 0], g: 6 });
  fx.flash(p, 0xff6a18, 10, 0.16, 8);
}
