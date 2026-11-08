// Shared visuals for the orbiting blades and the fire ring, so an opponent's power-ups can be seen as well as your own.
import * as THREE from 'three';

// Orbiting blades: slim steel throwing daggers (blade, guard, wrapped grip) flying point-first around the player and
// spinning a little as they go. (2026-11-08: replaced the big flat glowing crescents, which read as placeholder shapes.)
let bladeParts = null;
// The blade is forged, not extruded: a diamond cross-section (a raised spine down the middle, both flats ground down to a
// sharp edge each side), widest just above the guard and tapering to the point. Flat facets with hard normals catch the
// sky and the ground separately, which is what makes polished steel read as steel.
function bladeGeo() {
  const N = 14, L = 0.62, pos = [];
  const width = (u) => (u < 0.08 ? 0.05 + u * 0.15 : 0.062 * Math.pow(1 - (u - 0.08) / 0.92, 0.72)); // half-width along the blade
  const ridge = (u) => 0.011 * (1 - u * 0.75); // half-thickness at the spine
  const sec = (u) => { const y = u * L, w = width(u), t = ridge(u); return [[w, y, 0], [0, y, t], [-w, y, 0], [0, y, -t]]; };
  for (let i = 0; i < N; i++) {
    const a = sec(i / N), b = sec((i + 1) / N);
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      pos.push(...a[k], ...b[k], ...b[k2], ...a[k], ...b[k2], ...a[k2]);
    }
  }
  // the base of the blade (hidden in the guard) is left open
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals(); // non-indexed: every facet keeps its own hard normal
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0; i < pos.length / 3; i++) { uv[i * 2] = pos[i * 3] * 6 + 0.5; uv[i * 2 + 1] = pos[i * 3 + 1] / L; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
// Fine grinding marks running along the blade: a brushed-steel roughness map, so highlights stretch along the length.
let brushTex = null;
function brushed() {
  if (brushTex) return brushTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = 'rgb(60,60,60)'; x.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 220; i++) { const v = 40 + Math.random() * 60 | 0; x.fillStyle = `rgba(${v},${v},${v},0.5)`; x.fillRect(Math.random() * 64, 0, 0.6 + Math.random() * 0.8, 256); }
  brushTex = new THREE.CanvasTexture(c); brushTex.wrapS = brushTex.wrapT = THREE.RepeatWrapping;
  return brushTex;
}
function daggerParts() {
  if (bladeParts) return bladeParts;
  const blade = bladeGeo();
  // Cross-guard with rounded quillons, a leather-wrapped grip with ridges, and a round pommel.
  const guard = new THREE.CapsuleGeometry(0.018, 0.17, 4, 10).rotateZ(Math.PI / 2);
  const grip = new THREE.LatheGeometry([0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => new THREE.Vector2(0.021 + (i % 2) * 0.004, -0.02 - i * 0.019)), 12);
  const pommel = new THREE.SphereGeometry(0.033, 14, 10); pommel.translate(0, -0.2, 0);
  bladeParts = { blade, guard, grip, pommel };
  return bladeParts;
}
let mats = null;
function daggerMats() {
  if (mats) return mats;
  mats = {
    // Mirror-polished steel: no glow of its own, so it shows whatever is around it (the sky, the ground, fire, and the
    // shadows it passes through). envMapIntensity keeps the reflection bright enough to read in daylight.
    steel: new THREE.MeshPhysicalMaterial({ color: 0xe8ecf2, metalness: 1, roughness: 0.16, roughnessMap: brushed(), envMapIntensity: 1.6, clearcoat: 0.4, clearcoatRoughness: 0.08, side: THREE.DoubleSide }),
    leather: new THREE.MeshStandardMaterial({ color: 0x2b1d14, metalness: 0, roughness: 0.82 }),
    brass: new THREE.MeshPhysicalMaterial({ color: 0xc09a58, metalness: 1, roughness: 0.28, envMapIntensity: 1.3 }),
  };
  return mats;
}
export function makeOrbitBlades(n, color = 0xaaccff) {
  const P = daggerParts(), Mt = daggerMats();
  const grp = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const d = new THREE.Group();
    d.add(new THREE.Mesh(P.blade, Mt.steel), new THREE.Mesh(P.guard, Mt.brass), new THREE.Mesh(P.grip, Mt.leather), new THREE.Mesh(P.pommel, Mt.brass));
    d.scale.setScalar(1.3);
    const a = (i / n) * Math.PI * 2;
    const holder = new THREE.Group(); // places the dagger on the circle, point first along the way it flies
    holder.position.set(Math.sin(a) * 2.6, 0, Math.cos(a) * 2.6);
    holder.rotation.y = a + Math.PI / 2;
    d.rotation.set(0, 0, -Math.PI / 2); // lie the dagger along the direction of travel
    holder.add(d);
    holder.userData.spin = d;
    grp.add(holder);
  }
  grp.userData.n = n;
  grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return grp;
}

// A glowing ring on the ground that marks the reach of the fire aura.
let ringMat = null;
export function makeAuraRing() {
  if (!ringMat) ringMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), ringMat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 3;
  return m;
}

// Scorching Aura: a wall of real flame standing in a ring around the player. Anything inside it burns.
// The flames are camera-facing tongues (one draw call) shaded with warped noise so they lick, split and flicker:
// white-yellow at the roots, orange bodies, dark red ragged tips. More stacks = a wider ring and taller, hotter flames.
let fireMat = null;
const FIRE_N = 96;
function fireMaterial() {
  if (fireMat) return fireMat;
  fireMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uR: { value: 4 }, uH: { value: 1 }, uHot: { value: 0.5 } },
    vertexShader: `attribute vec3 aS; varying vec2 vUv; varying float vSeed; uniform float uT, uR, uH;
      void main(){
        vUv = uv; vSeed = aS.z;
        float a = position.x;                                // angle around the ring is stored in position.x
        float rr = uR * (1. + position.z * .06);             // a little ragged in and out
        vec3 c = (modelMatrix * vec4(sin(a) * rr, 0., cos(a) * rr, 1.)).xyz;
        vec3 toCam = cameraPosition - c; toCam.y = 0.; toCam = normalize(toCam);
        vec3 right = normalize(cross(vec3(0., 1., 0.), toCam));
        float w = aS.x * (.8 + .25 * uH), h = aS.y * uH;
        float sway = sin(uT * 2.3 + aS.z * 6.) * .1 + sin(uT * 4.1 + aS.z * 11.) * .05;
        vec3 p = c + right * (uv.x - .5) * w + vec3(0., uv.y * h - .05, 0.) + right * sway * w * uv.y * uv.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
      }`,
    fragmentShader: `uniform float uT, uHot; varying vec2 vUv; varying float vSeed;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float nz(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 4; i++) { v += a * nz(p); p = p * 2.03 + 17.1; a *= .5; } return v; }
      void main(){
        float y = vUv.y, t = uT * (1.3 + fract(vSeed * 7.3) * .5) + vSeed * 40.;
        vec2 q = vec2(vUv.x * 2.2 + vSeed * 9., y * 1.6 - t * 1.4);
        vec2 warp = vec2(fbm(q), fbm(q + 5.2)) - .5;
        float n = fbm(vec2(vUv.x * 3.4, y * 2.6 - t * 2.3) + warp * 1.6 + vSeed * 3.);
        float x = (vUv.x - .5) + warp.x * .5 * y;
        float width = mix(.42, .03, pow(y, .6)) * (.7 + n * .7);
        float body = 1. - smoothstep(0., width, abs(x)); body *= body;
        float heat = body * smoothstep(1., .05, y + (n - .5) * .7) * smoothstep(0., .06, y);
        heat *= .35 + n * .85 + uHot * .12;
        heat -= y * (1. - n) * 1.25;              // the upper half breaks into ragged licks
        heat = clamp(heat, 0., 1.);
        vec3 col = mix(vec3(.5, .05, .01), vec3(.95, .22, .02), smoothstep(.05, .3, heat));
        col = mix(col, vec3(1., .5, .08), smoothstep(.3, .6, heat));
        col = mix(col, vec3(1., .85, .45), smoothstep(.62, .9, heat));
        float al = smoothstep(.03, .22, heat) * .9;
        // drawn as a solid-ish flame (not added on top of the scene), so it stays orange on snow and in daylight
        gl_FragColor = vec4(col * (.9 + heat * .9), al);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  return fireMat;
}
let glowMat = null;
function groundGlowMat() {
  if (glowMat) return glowMat;
  glowMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uA: { value: 0.5 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform float uT, uA; varying vec2 vP;
      void main(){ float r = length(vP); float band = exp(-pow((r - 1.) * 9., 2.)) * .8; float inner = smoothstep(1.02, .3, r) * .05;
        float fl = .85 + .15 * sin(uT * 13. + atan(vP.y, vP.x) * 5.) * sin(uT * 7.3);
        float a = (band + inner) * uA * fl; gl_FragColor = vec4(vec3(1., .42, .1) * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  return glowMat;
}
// How far the fire reaches with this many stacks (the damage uses the same number).
export const auraRadius = (k) => 3.2 + 0.85 * k;
export function makeFireRing() {
  const grp = new THREE.Group();
  // flame tongues: tall ones and short ones alternating, so the wall has depth
  const pos = [], uv = [], aS = [], idx = [];
  for (let k = 0; k < FIRE_N; k++) { // tongues sorted back-to-front by the camera are not needed: they barely overlap
    const a = (k / FIRE_N) * Math.PI * 2 + Math.random() * 0.08, tall = k % 2 === 0;
    const w = tall ? 1.3 + Math.random() * 0.5 : 1.0 + Math.random() * 0.4, hh = tall ? 1.15 + Math.random() * 0.45 : 0.6 + Math.random() * 0.3, seed = Math.random(), jig = Math.random() * 2 - 1;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { pos.push(a, 0, jig); uv.push(u, v); aS.push(w, hh, seed); }
    const o = k * 4; idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 3)); g.setIndex(idx);
  const mat = fireMaterial().clone();
  const flames = new THREE.Mesh(g, mat); flames.frustumCulled = false; flames.renderOrder = 6;
  const gmat = groundGlowMat().clone();
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1.15, 48), gmat); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.06; glow.renderOrder = 3;
  grp.add(flames, glow); // (no real light: adding one would make every material recompile the moment you pick it up)
  // r: ring radius, stacks: 1..6. Called every frame with the time.
  grp.userData.set = (r, stacks, t) => {
    const k = Math.max(1, stacks);
    mat.uniforms.uT.value = t; mat.uniforms.uR.value = r; mat.uniforms.uH.value = 0.85 + 0.28 * k; mat.uniforms.uHot.value = Math.min(1, k / 5);
    gmat.uniforms.uT.value = t; gmat.uniforms.uA.value = 0.35 + 0.08 * k;
    glow.scale.setScalar(r);
  };
  return grp;
}
