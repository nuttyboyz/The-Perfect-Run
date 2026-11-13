// Tundra's Polaris (Nutty 2026-11-13): a summon. A huge arctic polar bear bursts up out of ice and fights for his summoner: he lopes after
// enemies on his own, rears up to swipe with both paws, snaps at them, and pounces from a distance, landing with all his weight. What he hits
// often freezes. Thick white fur, a crest of long ice spikes fanning up and back from his shoulders, neck and spine, smaller shards along his
// sides and legs, ice claws, shining blue eyes. When his time ends he lies down, then breaks apart into tiny fragments of ice.
// spawnPolaris() draws and moves him for everyone; only the caster passes `hit`, which does the damage.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { iceMat } from './elements.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => { while (a > Math.PI) a -= 6.2832; while (a < -Math.PI) a += 6.2832; return a; };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
const key = (t, ks) => { if (t <= ks[0][0]) return ks[0][1]; for (let i = 1; i < ks.length; i++) if (t < ks[i][0]) return ks[i - 1][1] + (ks[i][1] - ks[i - 1][1]) * ease((t - ks[i - 1][0]) / (ks[i][0] - ks[i - 1][0])); return ks[ks.length - 1][1]; };

export const POLARIS = { dur: 25, hp: 700, claw: 55, bite: 90, pounce: 130, pounceR: 4, freeze: 0.65, freezeFor: 2, speed: 9.5, range: 45 };
const SIZE = 1.3;

// ---------------------------------------------------------------- shapes
// A skin lofted along z through sections { z, y, r, sx, sy }. Returns the geometry and the sections so things can be planted on its surface.
function loft(st, seg, ring, uRep = 3, vRep = 1) {
  const pos = [], uv = [], idx = [], S = [];
  const cr = (a, b, c, d, k) => 0.5 * ((2 * b) + (-a + c) * k + (2 * a - 5 * b + 4 * c - d) * k * k + (-a + 3 * b - 3 * c + d) * k * k * k);
  const at = (f, key, def) => { const i = clamp(Math.floor(f), 0, st.length - 2), k = f - i, g = (j) => st[clamp(j, 0, st.length - 1)][key] ?? def; return cr(g(i - 1), g(i), g(i + 1), g(i + 2), k); };
  let len = 0, pz = null, py = null;
  for (let i = 0; i <= seg; i++) {
    const f = (i / seg) * (st.length - 1), z = at(f, 'z', 0), y = at(f, 'y', 0), r = Math.max(0.001, at(f, 'r', 0.1)), sx = at(f, 'sx', 1), sy = at(f, 'sy', 1);
    if (pz !== null) len += Math.hypot(z - pz, y - py); pz = z; py = y;
    S.push({ z, y, r, sx, sy });
    for (let j = 0; j <= ring; j++) { const a = -Math.PI / 2 + (j / ring) * Math.PI * 2; pos.push(Math.cos(a) * r * sx, y + Math.sin(a) * r * sy, z); uv.push((j / ring) * uRep, len * vRep); }
  }
  const W = ring + 1;
  for (let i = 0; i < seg; i++) for (let j = 0; j < ring; j++) { const a = i * W + j, b = a + W; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  for (const end of [0, seg]) { const base = pos.length / 3; pos.push(0, S[end].y, S[end].z); uv.push(0.5, 0); for (let j = 0; j < ring; j++) { const a = end * W + j; if (end === 0) idx.push(base, a + 1, a); else idx.push(base, a, a + 1); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return { geo: g, S };
}
// the point on a lofted skin at length z and angle ang round it (0 = his left side, PI/2 = the top), sunk `depth` in; n = outward there
const on = (L, z, ang, depth = 0) => { const S = L.S; let k = 0; while (k < S.length - 2 && S[k + 1].z < z) k++; const a = S[k], b = S[k + 1], f = clamp((z - a.z) / Math.max(1e-4, b.z - a.z), 0, 1), m = (q) => a[q] + (b[q] - a[q]) * f;
  const cs = Math.cos(ang), sn = Math.sin(ang), n = V(cs / m('sx'), sn / m('sy'), 0).normalize(); return { p: V(cs * m('r') * m('sx'), m('y') + sn * m('r') * m('sy'), z).addScaledVector(n, -depth), n }; };
// a limb lofted downward (-y): sections [down, radius, sx, sz, forward]
const limb = (st, seg) => { const g = loft(st.map(([d, r, sx = 1, sy = 1, f = 0]) => ({ z: d, y: f, r, sx, sy })), seg, 22, 2, 1.4).geo; g.rotateX(Math.PI / 2); return g.toNonIndexed(); };
const ball = (r, sc, at) => new THREE.SphereGeometry(r, 18, 12).scale(sc[0], sc[1], sc[2]).translate(at.x, at.y, at.z).toNonIndexed();
// how long the fur stands at each vertex (1 = full coat)
const setFur = (geo, fn) => { const p = geo.attributes.position, a = new Float32Array(p.count); for (let k = 0; k < p.count; k++) a[k] = fn(p.getX(k), p.getY(k), p.getZ(k)); geo.setAttribute('aFur', new THREE.BufferAttribute(a, 1)); return geo; };
// a sharp shard of ice: base at `at`, pointing along dir
function shard(at, dir, len, w, seed = 1) {
  const g = new THREE.ConeGeometry(1, 1, 5 + (seed % 2), 1).toNonIndexed(); g.translate(0, 0.5, 0); g.scale(w, len, w * (0.55 + (seed % 3) * 0.15)); g.rotateY(seed * 1.7);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize())); g.translate(at.x, at.y, at.z); g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- fur
let MATS = null;
const SCAR_N = 4, SCAR_P = 8, SCAR = { value: Array.from({ length: SCAR_N * SCAR_P }, () => new THREE.Vector3(0, 99, 0)) }; // claw gashes across the face, in head space
function mats() {
  if (MATS) return MATS;
  const N = 512, cv = () => { const c = document.createElement('canvas'); c.width = c.height = N; return c; };
  let seed = 11; const rr = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // coat: off-white with thousands of fine strands lying along the body, slightly yellow at the roots like a real polar bear
  const ac = cv(), ax = ac.getContext('2d'); ax.fillStyle = '#e9e6dc'; ax.fillRect(0, 0, N, N);
  const hc = cv(), hx = hc.getContext('2d'); hx.fillStyle = '#808080'; hx.fillRect(0, 0, N, N);
  for (let i = 0; i < 9000; i++) { const x = rr() * N, y = rr() * N, l = 10 + rr() * 26, lean = (rr() - 0.5) * 7, v = rr();
    ax.strokeStyle = v < 0.5 ? `rgba(255,255,255,${0.25 + rr() * 0.4})` : `rgba(${188 + rr() * 30},${182 + rr() * 26},${160 + rr() * 26},${0.2 + rr() * 0.3})`; ax.lineWidth = 0.8 + rr() * 1.2;
    hx.strokeStyle = `rgba(${v < 0.5 ? 255 : 30},${v < 0.5 ? 255 : 30},${v < 0.5 ? 255 : 30},${0.3 + rr() * 0.4})`; hx.lineWidth = ax.lineWidth;
    for (const c of [ax, hx]) for (const oy of [0, N, -N]) { c.beginPath(); c.moveTo(x, y + oy); c.quadraticCurveTo(x + lean, y + oy + l * 0.5, x + lean * 1.6, y + oy + l); c.stroke(); } }
  const hd = hx.getImageData(0, 0, N, N).data, nc = cv(), nx = nc.getContext('2d'), nd = nx.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const h = (X, Y) => hd[(((Y + N) % N) * N + ((X + N) % N)) * 4] / 255, dx = (h(x + 1, y) - h(x - 1, y)) * 2.2, dy = (h(x, y + 1) - h(x, y - 1)) * 2.2, l = Math.hypot(dx, dy, 1), o = (y * N + x) * 4;
    nd.data[o] = (-dx / l * 0.5 + 0.5) * 255; nd.data[o + 1] = (-dy / l * 0.5 + 0.5) * 255; nd.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; nd.data[o + 3] = 255; }
  nx.putImageData(nd, 0, 0);
  // tufts: where each shell of fur still has hair standing (bright = long hair)
  const tc = cv(), tx = tc.getContext('2d'); tx.fillStyle = '#000'; tx.fillRect(0, 0, N, N);
  for (let i = 0; i < 26000; i++) { const x = rr() * N, y = rr() * N, v = 60 + rr() * 195; tx.fillStyle = `rgb(${v},${v},${v})`; tx.fillRect(x, y, 1.6, 2.6); }
  const T = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const map = T(ac, true), nor = T(nc, false), tuft = T(tc, false);
  map.repeat.set(2.2, 2.2); nor.repeat.set(2.2, 2.2);
  const furLen = { value: 0.105 };
  const fur = (layer, layers, scar = false) => { // layer 0 is the skin under the fur; the rest are shells of hair standing out from it
    const k = layer / layers, m = new THREE.MeshStandardMaterial({ map, normalMap: nor, normalScale: new THREE.Vector2(0.75, 0.75), roughness: 0.95, metalness: 0, color: 0xffffff });
    m.onBeforeCompile = (sh) => { sh.uniforms.uShell = { value: k }; sh.uniforms.uLen = furLen; sh.uniforms.uTuft = { value: tuft }; sh.uniforms.uScar = SCAR;
      sh.vertexShader = 'attribute float aFur; uniform float uShell; uniform float uLen; varying vec3 vScP; varying float vFur;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vScP = position; vFur = aFur; transformed += normalize(objectNormal) * uShell * uLen * aFur; transformed.y -= uShell * uShell * uLen * 0.45 * aFur;');
      sh.fragmentShader = 'uniform float uShell; uniform sampler2D uTuft; varying vec3 vScP; varying float vFur;\n' + (scar ? `uniform vec3 uScar[${SCAR_N * SCAR_P}];
          // how deep into a claw gash this point is: 0 = the middle of a cut, 1 = its edge, more = clear of it
          float scarAt(vec3 p) { float best = 9.0;
            for (int g = 0; g < ${SCAR_N}; g++) for (int i = 0; i < ${SCAR_P - 1}; i++) { vec3 a = uScar[g * ${SCAR_P} + i], b = uScar[g * ${SCAR_P} + i + 1], ab = b - a;
              float h = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0), tt = (float(i) + h) / ${SCAR_P - 1}.0;
              float w = 0.021 * pow(sin(3.14159 * clamp(tt, 0.02, 0.98)), 0.55) * (g == 1 || g == 2 ? 1.0 : 0.78);
              best = min(best, length(p - a - ab * h) / w); }
            return best; }\n` : '') + sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
          float tf_ = texture2D(uTuft, vMapUv * 3.0).r;
          float sc_ = 9.0;
          ${scar ? `sc_ = scarAt(vScP) + (tf_ - 0.45) * 0.5 + (texture2D(uTuft, vMapUv * 0.7).r - 0.4) * 0.35;
          if (uShell > 0.0 && sc_ < 1.25 + uShell * 0.5) discard;   // the coat is parted along every cut, hair leaning in over the edges` : ''}
          if (uShell > 0.0 && tf_ < 0.3 + uShell * 0.68) discard;
          diffuseColor.rgb *= mix(0.56, 1.14, sqrt(uShell)) * vec3(1.0, 0.985, 0.94);
          diffuseColor.rgb *= 0.93 + 0.09 * sin(vScP.x * 23.0 + sin(vScP.z * 17.0) * 2.0) * sin(vScP.y * 19.0 + vScP.z * 13.0); // the coat lies in clumps
          diffuseColor.rgb *= mix(vec3(0.5, 0.47, 0.45), vec3(1.0), smoothstep(0.04, 0.34, vFur));                                // thin fur: the dark hide shows through
          ${scar ? `{ float skin = 1.0 - smoothstep(1.0, 2.1, sc_), flesh = 1.0 - smoothstep(0.55, 1.05, sc_), core = 1.0 - smoothstep(0.0, 0.5, sc_);
            float mot = texture2D(uTuft, vMapUv * 5.0).r;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.09, 0.085), skin * 0.92);                       // bare dark hide round the wound
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.4, 0.15, 0.14), vec3(0.26, 0.045, 0.05), mot), flesh); // raw healed-over flesh, mottled
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.012, 0.015), core * 0.9); }                    // the dark crease down the middle` : ''}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.42, 1.0 - smoothstep(0.55, 1.05, sc_));`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(0.5, 0.62, 0.8) * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0) * 0.16;`); };
    m.customProgramCacheKey = () => 'polaris-fur4' + (layer ? 1 : 0) + (scar ? 's' : '');
    return m;
  };
  const LAYERS = 6;
  MATS = { fur: Array.from({ length: LAYERS + 1 }, (_, i) => fur(i, LAYERS)), furHead: Array.from({ length: LAYERS + 1 }, (_, i) => fur(i, LAYERS, true)), ice: iceMat(),
    dark: new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.35 }), eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.16, 0.75, 2.1), toneMapped: false }),
    tooth: new THREE.MeshStandardMaterial({ color: 0xefe8d2, roughness: 0.32 }), mouth: new THREE.MeshStandardMaterial({ color: 0x200a0d, roughness: 0.55 }),
    gum: new THREE.MeshStandardMaterial({ color: 0x3d1a1e, roughness: 0.4 }), tongue: new THREE.MeshStandardMaterial({ color: 0x8a4048, roughness: 0.45 }) };
  return MATS;
}

// ---------------------------------------------------------------- the bear
let GEO = null;
function geos() {
  if (GEO) return GEO;
  // torso: rump, deep belly, chest, the big shoulder hump of a polar bear, a long thick neck
  const B = loft([{ z: -1.5, y: 0.0, r: 0.3, sx: 1, sy: 1 }, { z: -1.2, y: 0.05, r: 0.62, sx: 1.02, sy: 1 }, { z: -0.6, y: 0.02, r: 0.74, sx: 1.04, sy: 1.02 }, { z: 0.1, y: -0.02, r: 0.74, sx: 1.0, sy: 1.02 }, { z: 0.7, y: 0.06, r: 0.72, sx: 0.98, sy: 1.08 }, { z: 1.15, y: 0.12, r: 0.64, sx: 0.96, sy: 1.05 }, { z: 1.5, y: 0.1, r: 0.55, sx: 0.96, sy: 1.02 }, { z: 1.8, y: 0.05, r: 0.44, sx: 0.94, sy: 1 }, { z: 2.0, y: 0.02, r: 0.36, sx: 0.92, sy: 0.98 }], 48, 34, 5, 1.2);
  const tail = ball(0.16, [1, 0.9, 1.2], V(0, 0.22, -1.52));
  // head: one smooth sculpted skin. A wide, heavy skull, small round ears set out to the sides, a short deep muzzle with a gentle
  // roman nose (no step at the brow), cheeks, eye sockets and whisker pads worked into the surface rather than stuck on.
  const H = loft([{ z: -0.36, y: 0, r: 0.41, sx: 1.05, sy: 0.96 }, { z: -0.12, y: 0.0, r: 0.44, sx: 1.18, sy: 0.9 }, { z: 0.1, y: -0.01, r: 0.42, sx: 1.15, sy: 0.86 }, { z: 0.28, y: -0.035, r: 0.365, sx: 1.06, sy: 0.85 },
    { z: 0.447, y: -0.065, r: 0.31, sx: 1.02, sy: 0.86 }, { z: 0.589, y: -0.085, r: 0.28, sx: 1.04, sy: 0.86 }, { z: 0.708, y: -0.1, r: 0.255, sx: 1.05, sy: 0.85 }, { z: 0.78, y: -0.11, r: 0.205, sx: 1.05, sy: 0.84 }, { z: 0.821, y: -0.115, r: 0.1, sx: 1.05, sy: 0.84 }], 48, 32, 3, 1.6);
  const bump = (x, y, z, cx, cy, cz, rad) => Math.exp(-((x - cx) * (x - cx) + (y - cy) * (y - cy) + (z - cz) * (z - cz)) / (rad * rad));
  const hdef = (x, y, z) => { const ax = Math.abs(x);
    let d = 0;
    d -= 0.06 * bump(ax, y, z, 0.185, 0.12, 0.36, 0.08);    // eye sockets
    d += 0.092 * bump(ax, y, z, 0.2, 0.185, 0.31, 0.085);     // a heavy brow pulled low over each eye: he glares
    d += 0.045 * bump(ax, y, z, 0.38, -0.1, 0.08, 0.17);    // cheeks
    d += 0.03 * bump(ax, y, z, 0.16, -0.12, 0.661, 0.11);   // whisker pads
    d += 0.025 * bump(ax, y, z, 0.0, 0.14, 0.566, 0.14);    // the bridge of the nose
    d -= 0.03 * bump(ax, y, z, 0.0, 0.3, 0.22, 0.08);       // the furrow between the brows
    d += 0.012 * Math.sin(z * 60) * bump(ax, y, z, 0.0, 0.1, 0.62, 0.1); // the snarl wrinkles the top of his muzzle
    let dy = 0; if (y < -0.08 && z > 0.3) dy = -0.045 * Math.min(1, ax / 0.12) * Math.min(1, (z - 0.3) / 0.12) * Math.min(1, Math.max(0, (0.777 - z) / 0.06));
    return [d, dy]; };
  { const p = H.geo.attributes.position;
    for (let k = 0; k < p.count; k++) { const x = p.getX(k), y = p.getY(k), z = p.getZ(k), l = Math.hypot(x, y) || 1, [d, dy] = hdef(x, y, z);
      p.setXYZ(k, x + (x / l) * d, y + (y / l) * d + dy, z); }
    H.geo.computeVertexNormals(); }
  // a point on the finished face: length z, angle round it, lifted `lift` off the skin
  const surf = (z, ang, lift = 0) => { const q = on(H, z, ang, 0), l = Math.hypot(q.p.x, q.p.y) || 1, [d, dy] = hdef(q.p.x, q.p.y, z); return V(q.p.x + (q.p.x / l) * d, q.p.y + (q.p.y / l) * d + dy, z).addScaledVector(q.n, lift); };
  // the scar: four claw gashes raked across his face by another bear, from over his right eye, across the bridge of the nose, on to the other cheek.
  // They are not a model: the fur shader paints them into the hide and parts the coat along them (SCAR).
  const scarLine = [[0.0, 2.62], [0.12, 2.5], [0.24, 2.36], [0.34, 2.2], [0.44, 1.98], [0.54, 1.68], [0.63, 1.3], [0.7, 0.95], [0.75, 0.6]];
  const scarAt = (t) => { const f = clamp(t, 0, 1) * (scarLine.length - 1), k = Math.min(scarLine.length - 2, Math.floor(f)), u = f - k; return [scarLine[k][0] + (scarLine[k + 1][0] - scarLine[k][0]) * u, scarLine[k][1] + (scarLine[k + 1][1] - scarLine[k][1]) * u]; };
  const scarCurves = [[-0.115, 0.16, 0.74, 0.05], [-0.04, 0.03, 0.9, -0.03], [0.035, 0.08, 0.97, 0.04], [0.105, 0.24, 0.8, -0.05]].map(([dz, t0, t1, wob], g) => { const pts = [];
    for (let k = 0; k < SCAR_P; k++) { const u = k / (SCAR_P - 1), [z, a] = scarAt(t0 + (t1 - t0) * u), p = surf(clamp(z + dz, -0.2, 0.74), a + dz * 1.5 + Math.sin(u * 5 + g * 2) * wob, 0); pts.push(p); SCAR.value[g * SCAR_P + k].copy(p); }
    return pts; });
  const segD = (x, y, z, a, b) => { const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, h = clamp(((x - a.x) * abx + (y - a.y) * aby + (z - a.z) * abz) / (abx * abx + aby * aby + abz * abz), 0, 1); return Math.hypot(x - a.x - abx * h, y - a.y - aby * h, z - a.z - abz * h); };
  const scarD = (x, y, z) => { let m = 9; for (const c of scarCurves) for (let k = 0; k < c.length - 1; k++) m = Math.min(m, segD(x, y, z, c[k], c[k + 1])); return m; };
  const headBits = [H.geo.toNonIndexed()];
  const lipPts = [];
  for (const s of [-1, 1]) { const A = (a) => (s > 0 ? a : Math.PI - a);
    const e = on(H, -0.16, A(0.7), 0.03).p; // a small round ear, cupped, sunk into the skull
    headBits.push(new THREE.SphereGeometry(0.1, 20, 14).scale(1, 1.05, 0.5).rotateY(s * 0.45).translate(e.x, e.y + 0.02, e.z).toNonIndexed()); }
  // the black edge of the lips, round the whole mouth
  const lipLine = (side) => [0.3, 0.42, 0.55, 0.68, 0.76].map((z) => { const q = on(H, z, side > 0 ? -0.72 : Math.PI + 0.72, 0.012).p; return V(q.x, q.y - (z > 0.34 ? 0.045 : 0.02), q.z); });
  const lipCurve = new THREE.CatmullRomCurve3([...lipLine(1), V(0.1, -0.3, 0.8), V(0, -0.292, 0.812), V(-0.1, -0.3, 0.8), ...lipLine(-1).reverse()]);
  const lips = new THREE.TubeGeometry(lipCurve, 40, 0.009, 6).toNonIndexed();
  const J = loft([{ z: -0.02, y: 0, r: 0.2, sx: 1.3, sy: 0.62 }, { z: 0.23, y: -0.02, r: 0.2, sx: 1.2, sy: 0.6 }, { z: 0.46, y: -0.025, r: 0.185, sx: 1.1, sy: 0.6 }, { z: 0.62, y: -0.02, r: 0.16, sx: 1.05, sy: 0.6 }, { z: 0.69, y: -0.01, r: 0.075, sx: 1.05, sy: 0.62 }], 18, 22, 2, 1.6);
  // a jaw full of teeth: long canines, six incisors across the front, and a row of cheek teeth down each side, top and bottom, set in gums
  const tooth = (r, h, up) => { const g = new THREE.ConeGeometry(r, h, 8); g.scale(1, 1, 0.8); if (!up) g.rotateX(Math.PI); return g; };
  const teeth = [], jteeth = [], gumU = [], gumL = [];
  const UP = [[0.768, 0.07, 0.022, 0.03], [0.762, 0.075, 0.022, 0.075], [0.744, 0.085, 0.024, 0.118], [0.679, 0.27, 0.047, 0.165], [0.578, 0.075, 0.03, 0.178], [0.494, 0.085, 0.034, 0.19], [0.405, 0.09, 0.038, 0.205], [0.316, 0.075, 0.036, 0.22]]; // z, length, radius, x
  for (const s of [-1, 1]) { const row = [];
    for (const [z, h, r, x] of UP) { const base = on(H, z, -Math.PI / 2, 0).p.y + 0.035; teeth.push(tooth(r, h, false).translate(s * x * 0.9, base - h / 2 + 0.02, z).toNonIndexed()); row.push(V(s * x * 0.86, base + 0.012, z - 0.012)); }
    gumU.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(row), 16, 0.024, 6).toNonIndexed()); }
  const LO = [[0.65, 0.06, 0.02, 0.028], [0.644, 0.065, 0.02, 0.07], [0.627, 0.07, 0.022, 0.108], [0.564, 0.19, 0.04, 0.142], [0.46, 0.065, 0.028, 0.16], [0.38, 0.08, 0.032, 0.175], [0.293, 0.085, 0.036, 0.19], [0.207, 0.07, 0.034, 0.205]];
  for (const s of [-1, 1]) { const row = [];
    for (const [z, h, r, x] of LO) { const base = on(J, z, Math.PI / 2, 0).p.y - 0.03; jteeth.push(tooth(r, h, true).translate(s * x * 0.9, base + h / 2 - 0.015, z).toNonIndexed()); row.push(V(s * x * 0.86, base + 0.004, z - 0.012)); }
    gumL.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(row), 16, 0.022, 6).toNonIndexed()); }
  const tongue = new THREE.SphereGeometry(0.1, 16, 10).scale(1.05, 0.28, 2.7).translate(0, 0.118, 0.3).toNonIndexed();
  const floor = new THREE.SphereGeometry(1, 16, 10).scale(0.15, 0.03, 0.3).translate(0, 0.092, 0.3).toNonIndexed(); // the wet floor of the mouth, inside the lower teeth
  const palate = new THREE.SphereGeometry(1, 16, 10).scale(0.165, 0.032, 0.27).translate(0, -0.325, 0.5).toNonIndexed(); // the roof of the mouth, inside the upper teeth
  // legs: a bear's. The front: a heavy shoulder that runs into the body, an elbow that stands out behind, a thick forearm down to a wide wrist.
  // The hind: a huge round haunch, the knee forward, a short shank and the hock behind. Each ends in a broad flat paw: one pad-shaped
  // foot with five toes grown into its front edge and a short, thick, curved claw out of the end of every toe.
  const claw = (x, z, yaw) => { const g = new THREE.ConeGeometry(0.034, 0.19, 8, 6); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.085); const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const zz = Math.max(0, p.getZ(k)); p.setY(k, p.getY(k) - 2.6 * zz * zz); }
    g.rotateY(yaw); g.translate(x, -0.045, z); g.computeVertexNormals(); return g.toNonIndexed(); };
  const pawOf = (rear) => { const k = rear ? 1.22 : 1, TX5 = [-0.25, -0.13, 0, 0.13, 0.25];
    const L = loft([{ z: -0.26 * k, y: -0.02, r: 0.1, sx: 1.25, sy: 0.7 }, { z: -0.12 * k, y: -0.02, r: 0.2, sx: 1.3, sy: 0.66 }, { z: 0.1 * k, y: -0.025, r: 0.25, sx: 1.4, sy: 0.56 }, { z: 0.3 * k, y: -0.045, r: 0.245, sx: 1.48, sy: 0.46 }, { z: 0.42 * k, y: -0.06, r: 0.17, sx: 1.5, sy: 0.44 }, { z: 0.47 * k, y: -0.065, r: 0.06, sx: 1.5, sy: 0.44 }], 16, 22, 2, 1.4);
    const tz = (x) => (0.44 - Math.abs(x) * 0.42) * k;
    const fur = setFur(mergeGeometries([L.geo.toNonIndexed(), ...TX5.map((x) => ball(0.082, [1.0, 0.82, 1.45], V(x, -0.075, tz(x)))), ball(rear ? 0.215 : 0.25, [1.06, 1.1, 1.08], V(0, 0.02, 0))]), (x, y, z) => (Math.hypot(x, y, z) < 0.3 ? 0.62 : 0.55));
    return { fur, claws: mergeGeometries(TX5.map((x) => claw(x, tz(x) + 0.075, x * 0.7))) }; };
  const leg = (rear) => { const pw = pawOf(rear); return {
    up: setFur(mergeGeometries([limb(rear ? [[-0.6, 0.18, 0.8, 1.5, -0.08], [-0.2, 0.44, 0.74, 1.62, -0.03], [0.2, 0.42, 0.78, 1.4, 0.06], [0.46, 0.33, 0.92, 1.14, 0.05], [0.62, 0.27, 1, 1.05, 0.0]] : [[-0.62, 0.16, 0.8, 1.3, 0.04], [-0.22, 0.4, 0.74, 1.42, 0.04], [0.2, 0.38, 0.8, 1.22, 0.0], [0.46, 0.32, 0.94, 1.1, -0.02], [0.62, 0.29, 1, 1.05, 0.0]], 18),
      rear ? ball(0.17, [0.9, 1.15, 1], V(0, -0.54, 0.11)) : ball(0.16, [0.9, 1.2, 1], V(0, -0.56, -0.14))]), () => 1), // the knee (hind) or the elbow (front)
    low: setFur(mergeGeometries([limb(rear ? [[0.0, 0.27, 1, 1.05, 0], [0.16, 0.275, 0.98, 1.14, -0.03], [0.38, 0.225, 1, 1.05, -0.03], [0.52, 0.2, 1.02, 1.05, -0.01], [0.62, 0.19, 1.04, 1.06, 0.0]] : [[0.0, 0.29, 1, 1.05, 0], [0.16, 0.295, 0.98, 1.08, 0.01], [0.38, 0.265, 1, 1.02, 0.01], [0.52, 0.24, 1.02, 1.03, 0.0], [0.62, 0.225, 1.04, 1.05, 0.0]], 14), ball(rear ? 0.295 : 0.315, [1, 1.05, 1.06], V(0, 0, 0)),
      ...(rear ? [ball(0.12, [0.85, 1.1, 1.1], V(0, -0.5, -0.14))] : [])]), (x, y) => 1 - 0.38 * clamp((-y - 0.2) / 0.42, 0, 1)), // the hock; fur shortens toward the paw
    paw: pw.fur, claws: pw.claws }; };
  // ice. The crest: long spikes fanning up and back from the neck, shoulders and spine; shorter shards down the flanks.
  const crest = [];
  let sd = 1;
  for (let z = 1.62; z > -1.3; z -= 0.17) { const big = Math.exp(-Math.pow((z - 0.85) / 0.75, 2)), nAcross = z > 0 ? 7 : 5;
    for (let j = 0; j < nAcross; j++) { const a = Math.PI / 2 + (j / (nAcross - 1) - 0.5) * (z > 0.2 ? 2.0 : 1.3) + Math.sin(sd * 3.1) * 0.08, q = on(B, z + Math.sin(sd * 1.3) * 0.05, a, 0.12), up = Math.sin(a);
      const len = (0.28 + big * 1.25 * (0.55 + 0.45 * up)) * (0.75 + (Math.sin(sd * 7.7) * 0.5 + 0.5) * 0.5);
      crest.push(shard(q.p, V(q.n.x * 0.9, q.n.y * 0.9 + 0.25, -0.55 - (1 - big) * 0.5), len, 0.05 + len * 0.075, sd)); sd++; } }
  for (const s of [-1, 1]) for (let z = 1.2; z > -1.2; z -= 0.3) { const q = on(B, z, s > 0 ? 0.15 : Math.PI - 0.15, 0.08); crest.push(shard(q.p, V(q.n.x, 0.25, -0.9), 0.3 + Math.abs(Math.sin(z * 5)) * 0.25, 0.06, sd++)); }
  const headIce = []; for (const s of [-1, 1]) for (const [z, a, l] of [[-0.3, 1.3, 0.42], [-0.3, 0.6, 0.34]]) { const q = on(H, z, s > 0 ? a : Math.PI - a, 0.06); headIce.push(shard(q.p, V(q.n.x, q.n.y + 0.2, -0.8), l, 0.045, sd++)); }
  const legIce = (rear) => [shard(V(0, -0.1, -0.3), V(0, 0.35, -1), rear ? 0.45 : 0.4, 0.06, sd++), shard(V(0.12, -0.35, -0.26), V(0.3, 0.2, -1), 0.3, 0.05, sd++), shard(V(-0.12, -0.5, -0.24), V(-0.3, 0.15, -1), 0.24, 0.045, sd++)];
  
  const headGeo = setFur(mergeGeometries(headBits), (x, y, z) => { let f = z > 0.55 ? 0.1 : z > 0.2 ? 0.1 + (0.55 - z) / 0.35 * 0.45 : 0.55 + clamp((0.2 - z) / 0.45, 0, 1) * 0.45;
    if (y < -0.2 && z > 0.25) f = Math.min(f, 0.06);                       // the lips and the underside of the muzzle: bare
    f *= clamp((Math.hypot(Math.abs(x) - 0.19, y - 0.12, z - 0.38) - 0.035) / 0.09, 0.04, 1); // short round the eyes
    f *= clamp((Math.hypot(x, y + 0.035, z - 0.795) - 0.07) / 0.08, 0.05, 1);              // and round the nose
    return f * clamp(0.35 + (scarD(x, y, z) - 0.02) / 0.06, 0.35, 1); });                  // the coat lies short and flat beside the gashes
  GEO = { body: mergeGeometries([B.geo.toNonIndexed(), tail]), head: headGeo, eyeP: [on(H, 0.375, 0.72, 0.052).p, on(H, 0.395, 0.72, 0.022).p, surf(0.37, 0.98, 0.012)], jaw: setFur(J.geo.toNonIndexed(), (x, y, z) => (y > 0.02 ? 0.04 : 0.14)), teeth: mergeGeometries(teeth), jteeth: mergeGeometries(jteeth), gumU: mergeGeometries(gumU), gumL: mergeGeometries(gumL), tongue, lips, front: leg(false), rear: leg(true),
    crest: mergeGeometries(crest), headIce: mergeGeometries(headIce), legIceF: mergeGeometries(legIce(false)), legIceR: mergeGeometries(legIce(true)),
    nose: new THREE.SphereGeometry(0.075, 20, 14).scale(1.5, 0.9, 0.75), socket: new THREE.SphereGeometry(0.058, 14, 10), palate, floor, eye: new THREE.SphereGeometry(0.03, 14, 10), mouth: new THREE.SphereGeometry(0.13, 12, 8).scale(1.1, 0.5, 1.7),
    spike: shard(V(0, 0, 0), V(0, 1, 0), 1, 0.22, 3) };
  return GEO;
}

export function buildPolaris() {
  const G = geos(), M = mats(), root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const all = [];
  const furry = (parent, geo, mats = M.fur) => { if (!geo.attributes.aFur) setFur(geo, () => 1); for (const m of mats) { const q = new THREE.Mesh(geo, m); q.castShadow = m === M.fur[0]; q.receiveShadow = true; q.frustumCulled = false; parent.add(q); all.push(q); } };
  const put = (parent, geo, mat, at) => { const q = new THREE.Mesh(geo, mat); if (at) q.position.copy(at); q.castShadow = true; q.frustumCulled = false; parent.add(q); all.push(q); return q; };
  furry(body, G.body); put(body, G.crest, M.ice);
  const neck = new THREE.Group(); neck.position.set(0, 0.0, 1.88); body.add(neck);
  const head = new THREE.Group(); head.position.set(0, 0.02, 0.2); head.scale.set(0.85, 0.86, 1.12); neck.add(head);
  furry(head, G.head, M.furHead); put(head, G.headIce, M.ice); put(head, G.teeth, M.tooth); put(head, G.nose, M.dark, V(0, -0.035, 0.795)); put(head, G.mouth, M.mouth, V(0, -0.2, 0.3)); put(head, G.lips, M.dark); put(head, G.gumU, M.gum); put(head, G.palate, M.mouth);
  for (const s of [-1, 1]) { put(head, G.socket, M.dark, V(s * G.eyeP[0].x, G.eyeP[0].y, G.eyeP[0].z)); const e = put(head, G.eye, M.eye, V(s * G.eyeP[1].x, G.eyeP[1].y, G.eyeP[1].z)); e.scale.set(1.35, 0.62, 1); e.rotation.z = s * 0.45; } // narrowed and slanted down toward the nose: a glare
  const jaw = new THREE.Group(); jaw.position.set(0, -0.215, 0.1); head.add(jaw); furry(jaw, G.jaw); put(jaw, G.jteeth, M.tooth); put(jaw, G.gumL, M.gum); put(jaw, G.floor, M.mouth); put(jaw, G.tongue, M.tongue);
  const legs = [];
  for (const [x, y, z, rear] of [[0.44, -0.22, 0.95, 0], [-0.44, -0.22, 0.95, 0], [0.46, -0.2, -0.95, 1], [-0.46, -0.2, -0.95, 1]]) {
    const L = rear ? G.rear : G.front, hip = new THREE.Group(); hip.position.set(x, y, z); body.add(hip); furry(hip, L.up); put(hip, rear ? G.legIceR : G.legIceF, M.ice);
    const knee = new THREE.Group(); knee.position.set(0, -0.62, 0); hip.add(knee); furry(knee, L.low);
    const paw = new THREE.Group(); paw.position.set(0, -0.62, 0); knee.add(paw); furry(paw, L.paw); put(paw, L.claws, M.ice);
    legs.push({ hip, knee, paw, rear: !!rear, s: Math.sign(x) });
  }
  return { root, body, neck, head, jaw, legs, all };
}
const LEG = 0.62, STANDY = 0.2 + LEG * 2 + 0.12; // body height when he stands square

// Pose. P: { ph gait phase, run 0..1, rear 0..1 (reared up on his hind legs), swL/swR paw swipe 0..1, bite 0..1, leap 0..1 (stretched in the air),
// lie 0..1 (lying dead), look yaw }
export function posePolaris(D, P) {
  const run = P.run || 0, rear = P.rear || 0, lie = P.lie || 0, leap = P.leap || 0, ph = P.ph || 0;
  const squat = clamp((P.land || 0) * 0.55 + (P.crouch || 0) * 0.5, 0, 1);
  const pitch = -rear * 1.05 + Math.sin(ph + 0.9) * 0.09 * run - leap * 0.2 + (P.land || 0) * 0.22;
  D.body.rotation.set(pitch, 0, lie * 1.4, 'YXZ');
  // Legs. hip angle a: + swings the leg back, - forward. knee angle b: a bear's elbow bends back (b < 0), its hind knee forward (b > 0).
  let hind = 0;
  for (const L of D.legs) {
    const th = ph + (L.rear ? 0 : 2.3) + (L.s > 0 ? 0.35 : 0), sw = Math.sin(th), lift = Math.max(0, -Math.cos(th));
    let a, b;
    if (L.rear) {
      a = -0.25 + sw * 0.7 * run; b = 0.5 + lift * 0.95 * run;
      a -= squat * 0.6; b += squat * 1.25;          // folds under him
      a += -pitch * rear;                            // rearing: hind legs stay straight down under the hips
      a += leap * 1.0; b += -leap * 0.25;            // a leap: they trail out behind
      a += lie * 0.5; b += lie * 0.5;
    } else {
      const s = L.s > 0 ? (P.swR || 0) : (P.swL || 0);
      a = 0.15 + sw * 0.7 * run; b = -0.3 - lift * 0.95 * run;
      a += squat * 0.6; b -= squat * 1.25;
      a += -rear * 0.75 - s * 1.15; b += -rear * 0.45 + s * 0.55; // reared: paws up in front of the chest; a swipe lifts one high and rakes it down
      a += -leap * 1.15; b += leap * 0.2;            // a leap: both reach out in front
      a += -lie * 0.6; b += lie * 0.1;
    }
    L.hip.rotation.set(a, 0, L.s * (0.04 + lie * 0.3 + (L.rear ? 0 : rear * 0.2)));
    L.knee.rotation.x = b;
    const grounded = L.rear ? 1 - leap : (1 - rear) * (1 - leap);
    L.paw.rotation.x = (-(a + b) - pitch) * grounded + (1 - grounded) * 0.5;
    if (L.rear) hind += LEG * (Math.cos(a + pitch * rear) + Math.cos(a + pitch * rear + b)) / 2;
  }
  // Body height comes from the hind legs, so squatting and crouching keep the paws on the ground. Rearing pivots him about the hind hips.
  const hipY = -0.2, hipZ = -0.95, cs = Math.cos(pitch), sn = Math.sin(pitch);
  const hipH = hind + 0.12, standY = hipH - (hipY * cs - hipZ * sn), bob = Math.abs(Math.sin(ph)) * 0.1 * run;
  D.body.position.set(lie * 0.3, (standY + bob) * (1 - lie) + lie * 0.58, (hipZ - (hipY * sn + hipZ * cs)) * (1 - lie));
  const bite = P.bite || 0;
  D.neck.rotation.set(0.16 + rear * 0.8 - leap * 0.2 + lie * 0.25 + Math.sin(ph + 2) * 0.06 * run + bite * 0.12 + (P.sniff || 0) * 0.3, clamp(P.look || 0, -0.8, 0.8), -lie * 0.35, 'YXZ');
  D.head.position.z = 0.2 + Math.sin(Math.min(1, bite * 1.4) * Math.PI) * 0.26;
  D.head.rotation.x = 0.1 + rear * 0.2 - bite * 0.1;
  D.jaw.rotation.x = Math.max(0.27, (P.jaw || 0)) * 0.72 + lie * 0.2; // never fully shut: the teeth always show
}

// ---------------------------------------------------------------- living
// o: { owner(): {x,y,z} | null, targets(): [{id,x,y,z,h,r,kind}], dur, yaw, hp, hit(kind, target, point) (caster only) } kind: 'claw' | 'bite' | 'pounce'
export function spawnPolaris(g, o) {
  const fx = g.fx, scene = g.scene, D = buildPolaris(), root = D.root, G = geos(), M = mats(), dur = o.dur || POLARIS.dur;
  const ground = (x, z) => g.world.heightAt(x, z);
  const own0 = o.owner() || { x: 0, y: 0, z: 0 }, yaw0 = o.yaw || 0;
  const st = { mode: 'arrive', t0: 0, yaw: yaw0, speed: 0, ph: 0, run: 0, rear: 0, swL: 0, swR: 0, bite: 0, jaw: 0, leap: 0, land: 0, lie: 0, look: 0, crouch: 0, sniff: 0, tgt: null, act: null, cd: 0.4, hp: o.hp || POLARIS.hp, hits: 0, breathT: 1, air: 0, done: false, lastC: 1, stuck: 0, side: 1 };
  root.scale.setScalar(SIZE); root.position.set(own0.x + Math.sin(yaw0) * 5, 0, own0.z + Math.cos(yaw0) * 5); root.position.y = ground(root.position.x, root.position.z); root.rotation.y = yaw0; scene.add(root);
  const tmp = V(), tmp2 = V();
  const vol = () => { const c = g.camera.position; return clamp(1.2 - Math.hypot(c.x - root.position.x, c.z - root.position.z) / 70, 0.1, 1); };
  const near = () => { const c = g.camera.position; return Math.hypot(c.x - root.position.x, c.z - root.position.z); };
  const chips = (p, n, sp = 1) => { for (let i = 0; i < fx.n(n); i++) { const a = Math.random() * 6.28, r = rnd(2, 8) * sp; fx.shard.emit({ p: [p.x + rnd(-0.3, 0.3), p.y + rnd(-0.3, 0.3), p.z + rnd(-0.3, 0.3)], v: [Math.cos(a) * r, rnd(1, 7) * sp, Math.sin(a) * r], life: rnd(0.5, 1.1), s0: rnd(0.15, 0.45), s1: 0.05, c0: [0.86, 0.95, 1, 1], c1: [0.6, 0.85, 1, 0], drag: 2, g: 9, rotV: rnd(-5, 5) }); } };
  const frost = (p, n, s = 1) => { for (let i = 0; i < n; i++) fx.smoke.emit({ p: [p.x + rnd(-0.4, 0.4) * s, p.y + rnd(-0.2, 0.4) * s, p.z + rnd(-0.4, 0.4) * s], v: [rnd(-1, 1) * s, rnd(0.2, 1.4), rnd(-1, 1) * s], life: rnd(0.6, 1.3), s0: 0.5 * s, s1: 2.2 * s, c0: [0.9, 0.96, 1, 0.42], c1: [0.9, 0.96, 1, 0], drag: 1.5, rotV: rnd(-1, 1) }); };
  // the ice he bursts out of: a cluster of tall spikes that erupts, stands a moment and shatters
  const spikes = [];
  for (let i = 0; i < 11; i++) { const a = i * 0.571 * 6.28, r = i < 3 ? rnd(0.3, 1.2) : rnd(1.6, 3.2), m = new THREE.Mesh(G.spike, M.ice); m.position.set(root.position.x + Math.cos(a) * r, 0, root.position.z + Math.sin(a) * r); m.position.y = ground(m.position.x, m.position.z) - 0.3;
    m.rotation.set(Math.sin(a) * (0.15 + r * 0.12), i, -Math.cos(a) * (0.15 + r * 0.12)); m.userData.h = (i < 3 ? rnd(3.4, 4.6) : rnd(1.4, 3.0)); m.scale.set(1.3, 0.01, 1.3); m.castShadow = true; scene.add(m); spikes.push(m); }
  const P0 = root.position.clone();
  fx.shockwave([P0.x, P0.y, P0.z], 7, 0x9fd8ff, 0.5); fx.flash([P0.x, P0.y + 2, P0.z], 0x9fd0ff, 40, 0.5, 30); frost(V(P0.x, P0.y + 0.5, P0.z), 14, 3); chips(V(P0.x, P0.y + 0.5, P0.z), 30, 1.3);
  g.audio.play('ice_big', vol()); if (near() < 30) g.shake(0.35);

  const strike = (kind, reach) => { // caster only does damage; everyone sees the ice fly
    const q = st.tgt; if (!q) return;
    const d = Math.hypot(q.x - root.position.x, q.z - root.position.z);
    if (d > reach + (q.r || 0.5)) return;
    const p = V(q.x, q.y + (q.h || 2) * 0.55, q.z); chips(p, kind === 'bite' ? 10 : 14); frost(p, 3); fx.flash([p.x, p.y, p.z], 0xbfe4ff, 10, 0.15, 8);
    g.audio.play(kind === 'bite' ? 'ice' : 'swing', vol()); st.hits++;
    o.hit && o.hit(kind, q, [p.x, p.y, p.z]);
  };
  const shatter = () => { // lying dead, he breaks apart into tiny fragments of ice
    root.updateMatrixWorld(true);
    for (let i = 0; i < 90; i++) { D.body.localToWorld(tmp.set(rnd(-0.7, 0.7), rnd(-0.6, 0.7), rnd(-1.5, 2.6)));
      for (let k = 0; k < 2; k++) { const a = Math.random() * 6.28, r = rnd(0.5, 5); fx.shard.emit({ p: [tmp.x, tmp.y, tmp.z], v: [Math.cos(a) * r, rnd(1, 7), Math.sin(a) * r], life: rnd(0.8, 1.9), s0: rnd(0.1, 0.34), s1: 0.03, c0: [0.9, 0.97, 1, 1], c1: [0.6, 0.85, 1, 0], drag: 1.2, g: 10, rotV: rnd(-6, 6) }); }
      if (i % 3 === 0) fx.glow.emit({ p: [tmp.x, tmp.y, tmp.z], v: [rnd(-1, 1), rnd(0.5, 2.5), rnd(-1, 1)], life: rnd(0.6, 1.4), s0: 0.25, s1: 0.02, c0: [0.7, 0.9, 1, 0.9], c1: [0.4, 0.7, 1, 0] }); }
    frost(tmp.copy(root.position).setY(root.position.y + 0.8), 16, 3.2);
    fx.shockwave([root.position.x, root.position.y, root.position.z], 5, 0x9fd8ff, 0.45); fx.flash([root.position.x, root.position.y + 1, root.position.z], 0xa8d8ff, 30, 0.4, 20);
    g.audio.play('ice_big', vol()); scene.remove(root);
  };

  const fxh = fx.add({
    dur: dur + 6,
    update: (dt, t) => {
      const own = o.owner(), pos = root.position, O = own || own0;
      // the ice cluster
      for (const m of spikes) { const h = m.userData.h; if (t < 1.25) m.scale.y = h * ease(t / 0.28); else if (!m.userData.gone) { m.userData.gone = true; m.visible = false; for (let k = 0; k < 6; k++) chips(tmp.set(m.position.x, m.position.y + h * (k / 6), m.position.z), 3, 0.9); frost(tmp.set(m.position.x, m.position.y + h * 0.4, m.position.z), 2, 1.5); } }
      if (t >= 1.25 && !st.broke) { st.broke = true; g.audio.play('ice_big', vol()); g.audio.play('ice', vol()); if (near() < 25) g.shake(0.3); }
      if ((!own || t > dur || st.hp <= 0) && st.mode !== 'die' && st.mode !== 'arrive') { st.mode = 'die'; st.t0 = t; st.act = null; }
      let sink = 0;
      if (st.mode === 'arrive') { // up through the ice, reared and roaring, then down on to all fours
        const e = t;
        sink = -3.2 * (1 - ease((e - 0.25) / 0.7)); st.rear = e < 1.25 ? ease((e - 0.3) / 0.6) : 1 - ease((e - 1.25) / 0.5); st.jaw = e > 0.7 && e < 1.5 ? 1 : 0;
        st.land = e > 1.6 ? Math.sin(clamp((e - 1.6) / 0.45, 0, 1) * Math.PI) : 0;
        if (e > 1.72 && !st.thud) { st.thud = true; fx.shockwave([pos.x, pos.y, pos.z], 4, 0xcfe8ff, 0.35); g.audio.play('quake', vol() * 0.6); if (near() < 20) g.shake(0.25); frost(tmp.set(pos.x, pos.y + 0.3, pos.z), 6, 2); }
        if (e > 2.1) { st.mode = 'hunt'; st.rear = 0; st.land = 0; }
      } else if (st.mode === 'die') { // he lies down like a dead bear, then breaks apart
        const e = t - st.t0; st.speed = 0; st.run += (0 - st.run) * Math.min(1, dt * 6); st.rear = 0; st.swL = st.swR = st.bite = st.leap = 0;
        st.lie = ease(e / 1.3); st.jaw = st.lie * 0.4;
        if (e > 2.3 && !st.done) { st.done = true; shatter(); }
        if (e > 2.4) return false;
      } else {
        const A = st.act;
        if (!A) { let best = null, bd = POLARIS.range; for (const q of o.targets()) { if (q.kind === 'demon') continue; const dOwn = Math.hypot(q.x - O.x, q.z - O.z); if (dOwn > POLARIS.range) continue; const d = Math.hypot(q.x - pos.x, q.z - pos.z); if (d < bd) { bd = d; best = q; } } st.tgt = best; }
        else if (st.tgt) { const f = o.targets().find((q) => q.id === st.tgt.id); if (f) st.tgt = f; }
        st.cd -= dt;
        const q = st.tgt, dO = Math.hypot(O.x - pos.x, O.z - pos.z);
        let wantYaw = st.yaw, wantSpeed = 0;
        if (dO > 60 && !A) { const a = Math.random() * 6.28; pos.x = O.x + Math.sin(a) * 5; pos.z = O.z + Math.cos(a) * 5; chips(tmp.set(pos.x, ground(pos.x, pos.z) + 1, pos.z), 20); frost(tmp, 8, 2); }
        if (A) {
          A.t += dt; if (q) wantYaw = Math.atan2(q.x - pos.x, q.z - pos.z);
          if (A.kind === 'swipe') { // rear up, right paw, left paw, drop
            st.rear = key(A.t, [[0, 0], [0.32, 1], [0.85, 1], [1.15, 0]]); st.swR = key(A.t, [[0.3, 0], [0.42, -0.5], [0.55, 1], [0.8, 0]]); st.swL = key(A.t, [[0.5, 0], [0.62, -0.5], [0.75, 1], [1.0, 0]]); st.jaw = A.t < 0.9 ? 0.8 : 0;
            if (A.t >= 0.52 && !A.h1) { A.h1 = true; strike('claw', 3.6); } if (A.t >= 0.72 && !A.h2) { A.h2 = true; strike('claw', 3.6); }
            st.land = A.t > 1.05 ? Math.sin(clamp((A.t - 1.05) / 0.3, 0, 1) * Math.PI) * 0.6 : 0;
            if (A.t >= 1.35) { st.act = null; st.cd = 0.35; st.rear = st.swL = st.swR = st.land = 0; }
          } else if (A.kind === 'bite') { // lunge and snap
            st.bite = key(A.t, [[0, 0], [0.26, 1], [0.5, 0.2], [0.65, 0]]); st.jaw = key(A.t, [[0, 0], [0.18, 1], [0.27, 0], [0.65, 0]]); wantSpeed = A.t < 0.25 ? 4 : 0;
            if (A.t >= 0.27 && !A.h1) { A.h1 = true; strike('bite', 3.3); }
            if (A.t >= 0.65) { st.act = null; st.cd = 0.3; st.bite = 0; }
          } else if (A.kind === 'pounce') { // crouch, leap in a high arc, land on them with his whole weight
            const T = 0.72;
            if (A.t < 0.28) { st.crouch = ease(A.t / 0.28); if (q) A.to.set(q.x, 0, q.z); }
            else if (!A.landed) { const k = clamp((A.t - 0.28) / T, 0, 1); if (!A.from) { A.from = pos.clone(); g.audio.play('swing', vol()); } st.crouch = 0; st.leap = Math.sin(k * Math.PI); st.jaw = 0.9;
              const back = Math.hypot(A.to.x - A.from.x, A.to.z - A.from.z), stop = Math.max(0, 1 - 1.6 / Math.max(1.6, back));
              pos.x = A.from.x + (A.to.x - A.from.x) * k * stop; pos.z = A.from.z + (A.to.z - A.from.z) * k * stop; st.air = Math.sin(k * Math.PI) * 2.6;
              if (k >= 1) { A.landed = A.t; st.air = 0; st.leap = 0; fx.shockwave([pos.x, pos.y, pos.z], POLARIS.pounceR + 1, 0xbfe4ff, 0.4); chips(tmp.set(pos.x, pos.y + 0.6, pos.z), 26, 1.2); frost(tmp, 8, 2.4); g.audio.play('quake', vol() * 0.8); g.audio.play('ice', vol()); if (near() < 22) g.shake(0.35);
                st.hits++; o.hit && o.hit('pounce', null, [pos.x + Math.sin(st.yaw) * 1.5, pos.y + 0.5, pos.z + Math.cos(st.yaw) * 1.5]); } }
            else { st.land = Math.sin(clamp((A.t - A.landed) / 0.45, 0, 1) * Math.PI); st.jaw = 0.3; if (A.t - A.landed > 0.45) { st.act = null; st.cd = 0.25; st.land = 0; } }
          }
        } else if (q) {
          const d = Math.hypot(q.x - pos.x, q.z - pos.z), reach = 2.6 + (q.r || 0.5);
          wantYaw = Math.atan2(q.x - pos.x, q.z - pos.z);
          if (d < reach && st.cd <= 0 && Math.abs(wrap(wantYaw - st.yaw)) < 0.6) { st.n = (st.n || 0) + 1; st.act = { kind: st.n % 3 === 2 ? 'bite' : 'swipe', t: 0 }; }
          else if (d > 6 && d < 15 && st.cd <= 0 && Math.abs(wrap(wantYaw - st.yaw)) < 0.4 && (st.pn = (st.pn || 0) + dt) > 0.15) { st.pn = 0; st.act = { kind: 'pounce', t: 0, to: V(q.x, 0, q.z) }; }
          else if (d >= reach * 0.8) wantSpeed = POLARIS.speed;
        } else if (dO > 7 || (st.run > 0.3 && dO > 4)) { wantYaw = Math.atan2(O.x - pos.x, O.z - pos.z); wantSpeed = dO > 16 ? POLARIS.speed : 5; }
        if (wantSpeed > 0 && !(A && A.kind === 'pounce')) { // walls: feel ahead and go round
          const blocked = (y) => { for (const d of [1.4, 2.8]) { const X = pos.x + Math.sin(y) * d, Z = pos.z + Math.cos(y) * d; if (g.world.solidPoint(X, ground(X, Z) + 1.0, Z, 0.9) || Math.abs(ground(X, Z) - ground(pos.x, pos.z)) > 2.2) return true; } return false; };
          if (blocked(wantYaw)) { let found = false; for (const off of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) { const y = wantYaw + off * st.side; if (!blocked(y)) { wantYaw = y; found = true; if (off < 0) st.side = -st.side; break; } } if (!found) { wantSpeed = 0; st.stuck += dt; } }
          else st.stuck = Math.max(0, st.stuck - dt);
          if (st.stuck > 2 && !A) { st.stuck = 0; const a = Math.random() * 6.28; pos.x = O.x + Math.sin(a) * 4; pos.z = O.z + Math.cos(a) * 4; chips(tmp.set(pos.x, ground(pos.x, pos.z) + 1, pos.z), 20); }
        }
        st.yaw += clamp(wrap(wantYaw - st.yaw), -5.5 * dt, 5.5 * dt);
        st.speed += clamp(wantSpeed - st.speed, -22 * dt, 14 * dt);
        st.run += ((st.speed > 0.4 ? clamp(st.speed / 7, 0.45, 1) : 0) - st.run) * Math.min(1, dt * 6);
        if (st.speed > 0.05) { pos.x += Math.sin(st.yaw) * st.speed * dt; pos.z += Math.cos(st.yaw) * st.speed * dt; st.ph += st.speed * dt * 1.15; }
        const c = Math.cos(st.ph);
        if (st.run > 0.5 && c * st.lastC < 0) { // a light trail of snow off his paws
          for (let i = 0; i < fx.n(5); i++) fx.smoke.emit({ p: [pos.x + rnd(-0.6, 0.6), pos.y + 0.15, pos.z + rnd(-0.6, 0.6)], v: [rnd(-1, 1) - Math.sin(st.yaw) * 2, rnd(0.6, 2), rnd(-1, 1) - Math.cos(st.yaw) * 2], life: rnd(0.5, 1), s0: 0.3, s1: 1.3, c0: [1, 1, 1, 0.5], c1: [1, 1, 1, 0], drag: 2 });
          for (let i = 0; i < fx.n(3); i++) fx.glow.emit({ p: [pos.x + rnd(-0.6, 0.6), pos.y + 0.2, pos.z + rnd(-0.6, 0.6)], v: [rnd(-1, 1), rnd(1, 3), rnd(-1, 1)], life: rnd(0.4, 0.9), s0: 0.09, s1: 0.02, c0: [1, 1, 1, 0.9], c1: [0.8, 0.9, 1, 0] });
          g.audio.play('quake', vol() * 0.12); }
        st.lastC = c;
        // frosty breath
        st.breathT -= dt; if (st.breathT <= 0) { st.breathT = st.run > 0.5 ? 0.45 : 1.6; D.head.localToWorld(tmp.set(0, -0.12, 1.15)); const f = [Math.sin(st.yaw), Math.cos(st.yaw)]; for (let i = 0; i < 4; i++) fx.smoke.emit({ p: [tmp.x, tmp.y, tmp.z], v: [f[0] * rnd(1.5, 3) + rnd(-0.3, 0.3), rnd(-0.2, 0.5), f[1] * rnd(1.5, 3) + rnd(-0.3, 0.3)], life: rnd(0.5, 0.9), s0: 0.18, s1: 1.1, c0: [0.92, 0.97, 1, 0.4], c1: [0.92, 0.97, 1, 0], drag: 2.5 }); }
        // he can be worn down: anything hostile on top of him chips his health
        for (const w of o.targets()) { if (w.kind === 'demon') continue; if (Math.hypot(w.x - pos.x, w.z - pos.z) < 2.6 + w.r && Math.abs(w.y - pos.y) < 5) st.hp -= dt * (w.kind === 'boss' ? 90 : w.kind === 'player' ? 60 : 22); }
        st.look += ((q ? clamp(wrap(Math.atan2(q.x - pos.x, q.z - pos.z) - st.yaw), -0.8, 0.8) : 0) - st.look) * Math.min(1, dt * 6);
      }
      if (!st.done) { pos.y = ground(pos.x, pos.z) + sink + st.air * SIZE * 0.6; root.rotation.y = st.yaw; posePolaris(D, st); }
    },
    dispose: () => { fxh.done = true; for (const m of spikes) scene.remove(m); if (!st.done) { st.done = true; scene.remove(root); } },
  });
  return { root, state: st, fx: fxh, parts: D };
}
