// Looking through a scope (Nutty 2026-11-12: "the lens is a solid blue screen I can't see through ... I must be looking
// THROUGH the scope ... like Call of Duty"). The old way drew a second picture of the world onto the gun's rear lens;
// on some machines that picture never showed and the blue glass was all you saw. Now, like Call of Duty's sniper
// scopes, the game's own camera does the zooming: once the gun is up at the eye the body and gun are left out of the
// picture, the view narrows to the scope's magnification, and a scope is drawn over the whole view: black outside,
// a steel ring round a clear circle, a soft shadow at the rim and the reticle in the exact middle of the screen, which
// is where every shot goes. Nothing is ever between the eye and the world, so the view can never be blocked.
// Any weapon with `scope: true` gets it (scopeFov = how narrow the glass is; reticle = which crosshair, see RETICLES).
import * as THREE from 'three';
import { mats } from './weapons.js';

// The first-person camera sits this far ahead of the rig's eye point (game.js updateCamera).
export const CAM_LEAD = 0.06;
// Eye relief: how far the CAMERA sits behind the ocular lens when aiming: far enough that the disc fills about two
// thirds of the view whatever the lens size, and always past the camera's near plane (0.04).
export const eyeRelief = (ep) => Math.max(0.085, ep.r * 5.7); // metres from the ocular lens to the eye when aiming

// Find the ocular (rear) lens of a weapon model: the lens-material disc that faces the shooter (-z).
// Returns { p: Vector3 (weapon space), r: radius } or null.
export function findEyepiece(w) {
  const lens = mats().lens, pts = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  w.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(w.matrixWorld).invert();
  w.traverse((o) => {
    if (!o.isMesh || o.material !== lens || !o.geometry.attributes.normal) return;
    const P = o.geometry.attributes.position, N = o.geometry.attributes.normal, M = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const R = new THREE.Matrix3().getNormalMatrix(M);
    for (let i = 0; i < P.count; i++) {
      n.fromBufferAttribute(N, i).applyMatrix3(R);
      if (n.z > -0.9) continue;
      v.fromBufferAttribute(P, i).applyMatrix4(M); pts.push(v.x, v.y, v.z);
    }
  });
  if (pts.length < 9) return null;
  const c = new THREE.Vector3();
  for (let i = 0; i < pts.length; i += 3) c.x += pts[i], c.y += pts[i + 1], c.z += pts[i + 2];
  c.divideScalar(pts.length / 3);
  let r = 0;
  for (let i = 0; i < pts.length; i += 3) r = Math.max(r, Math.hypot(pts[i] - c.x, pts[i + 1] - c.y));
  return { p: c, r };
}

// Reticles a scoped weapon can ask for with `reticle` in data.js. A new scoped gun with none gets the mil-dot.
export const RETICLES = { mildot: 0, chevron: 1, ranger: 2 };
// The full-screen zoom for a scope: scopeFov is the glass's own field; the clear circle fills 4/5 of the view's height.
export const scopeZoomFov = (wp) => Math.max(6, (wp.scopeFov || 10) * 1.5);

const FRAG = `
uniform float uK, uAsp; uniform int uStyle; varying vec2 vUv;
float seg(float a, float w, float aa) { return 1.0 - smoothstep(w, w + aa, abs(a)); }
void main() {
  vec2 p = (vUv - 0.5) * 2.0 * vec2(uAsp, 1.0);
  float r = length(p), R = 0.8, aa = 0.003;
  float shut = smoothstep(0.0, 0.4, uK), open = smoothstep(0.4, 1.0, uK);
  float ax = abs(p.x), ay = abs(p.y);
  vec3 col = vec3(0.0); float a = 0.0;
  // The shadow a real scope has round the edge of its picture.
  float vig = smoothstep(R * 0.74, R, r); a = vig * vig * 0.92;
  float ret = 0.0; vec3 rc = vec3(0.02);
  if (uStyle == 0) {
    // Mil-dot duplex: hair-thin lines through the middle, heavy posts toward the rim, dots to judge distance.
    ret = max(ret, seg(p.y, 0.0016, aa * 0.6) * step(0.012, ax) * step(ax, R));
    ret = max(ret, seg(p.x, 0.0016, aa * 0.6) * step(0.012, ay) * step(ay, R));
    ret = max(ret, seg(p.y, 0.0085, aa) * step(R * 0.5, ax));
    ret = max(ret, seg(p.x, 0.0085, aa) * step(R * 0.5, ay));
    for (int i = 1; i <= 4; i++) { float d = float(i) * R * 0.1;
      ret = max(ret, 1.0 - smoothstep(0.0048, 0.0048 + aa, length(vec2(ax - d, p.y))));
      ret = max(ret, 1.0 - smoothstep(0.0048, 0.0048 + aa, length(vec2(p.x, ay - d)))); }
    ret = max(ret, 1.0 - smoothstep(0.0022, 0.0022 + aa * 0.6, r));
  } else if (uStyle == 1) {
    // Combat optic: a lit red chevron whose tip is the point of aim, range bars stepping down under it, side bars.
    float ch = seg(p.y + ax * 1.55, 0.0048, aa) * step(ax, 0.034) * step(-0.07, p.y);
    float lit = max(ch, 0.0);
    for (int i = 1; i <= 4; i++) { float y = -0.085 - float(i) * 0.06, w = 0.06 - float(i) * 0.009;
      ret = max(ret, seg(p.y - y, 0.0016, aa * 0.6) * step(ax, w)); }
    ret = max(ret, seg(p.x, 0.0016, aa * 0.6) * step(p.y, -0.085) * step(-R, p.y));
    ret = max(ret, seg(p.y, 0.0016, aa * 0.6) * step(0.11, ax) * step(ax, R));
    ret = max(ret, seg(p.y, 0.0085, aa) * step(R * 0.55, ax));
    ret = max(ret, seg(p.x, 0.0085, aa) * step(R * 0.55, -p.y));
    if (lit > ret) { ret = lit; rc = vec3(1.0, 0.1, 0.05); }
  } else {
    // Low-power hunting glass: a ring and a dot in the middle, three more dots below for a dropping bolt, fine cross.
    ret = max(ret, seg(r - 0.075, 0.0022, aa * 0.7));
    ret = max(ret, 1.0 - smoothstep(0.0055, 0.0055 + aa, r));
    for (int i = 1; i <= 3; i++) ret = max(ret, 1.0 - smoothstep(0.0048, 0.0048 + aa, length(vec2(p.x, p.y + 0.075 + float(i) * 0.075))));
    ret = max(ret, seg(p.y, 0.0016, aa * 0.6) * step(0.075, ax) * step(ax, R));
    ret = max(ret, seg(p.x, 0.0016, aa * 0.6) * step(0.075, p.y) * step(p.y, R));
    ret = max(ret, seg(p.y, 0.0085, aa) * step(R * 0.6, ax));
  }
  col = mix(col, rc, ret); a = max(a, ret * 0.96);
  // Inside the glass: black while the eye settles behind it, then clear.
  a = mix(1.0, a, open);
  // The scope's own body round the picture: a machined ring catching the light from above, then darkness.
  float ring = smoothstep(R - aa, R + aa, r);
  if (ring > 0.0) {
    float t = clamp((r - R) / 0.075, 0.0, 1.0);
    vec2 n = p / max(r, 1e-4);
    float lightK = 0.5 + 0.5 * dot(n, normalize(vec2(-0.35, 0.94)));
    float bevel = sin(t * 3.14159);
    vec3 steel = vec3(0.012, 0.013, 0.015) + vec3(0.2, 0.21, 0.23) * bevel * (0.12 + 0.88 * lightK * lightK);
    steel += vec3(0.5) * pow(max(0.0, bevel * lightK), 22.0) * 0.5;
    vec3 body = mix(steel, vec3(0.0), smoothstep(0.85, 1.0, t));
    col = mix(col, body, ring); a = mix(a, 1.0, ring);
  }
  gl_FragColor = vec4(col, a * shut);
}`;

export class ScopeView {
  constructor() {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uK: { value: 0 }, uAsp: { value: 16 / 9 }, uStyle: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 99999; this.mesh.visible = false;
    this.mesh.userData.noRealmat = true;
    this.k = 0; this.on = false; this.zoomed = false;
  }
  // k: 0 = not scoped ... 1 = fully behind the glass. From 0.4 on the camera is zoomed and your own body is left out.
  set(k, scene, aspect = 16 / 9, style = 0) {
    this.k = k; this.on = k > 0.001; this.zoomed = k >= 0.4;
    this.mesh.visible = this.on;
    if (!this.on) return;
    if (scene && this.mesh.parent !== scene) scene.add(this.mesh);
    const u = this.mat.uniforms; u.uK.value = k; u.uAsp.value = aspect; u.uStyle.value = style | 0;
  }
}
