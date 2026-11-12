// Pyre's Dragon: a giant red dragon that is summoned in a ring of fire, takes off like a bat (crouch, push off, fast deep wingbeats),
// soars like an eagle (slow heavy beats and long glides), banks into its turns, and breathes a flamethrower stream at enemies.
// spawnDragon() draws and flies it for everyone; only the caster passes `burn`, which does the damage.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => { while (a > Math.PI) a -= 6.2832; while (a < -Math.PI) a += 6.2832; return a; };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- textures (made once)
let TEX = null;
function textures() {
  if (TEX) return TEX;
  const N = 512, cols = 12, rows = 20, cw = N / cols, rh = N / rows;
  const hc = document.createElement('canvas'); hc.width = hc.height = N;
  const hx = hc.getContext('2d'); hx.fillStyle = '#000'; hx.fillRect(0, 0, N, N);
  const ac = document.createElement('canvas'); ac.width = ac.height = N;
  const ax = ac.getContext('2d'); ax.fillStyle = '#6e6e6e'; ax.fillRect(0, 0, N, N);
  // Overlapping scales in staggered rows, drawn top row first so each row laps over the one above it (like roof tiles).
  let seed = 7; const rr = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let r = -1; r <= rows; r++) for (let c = -1; c <= cols; c++) {
    const x = (c + (r & 1 ? 0.5 : 0)) * cw + cw / 2, y = r * rh + rh * 0.2, w = cw * 0.62, h = rh * 1.05;
    for (const wrapX of [0, N, -N]) for (const wrapY of [0, N, -N]) {
      const X = x + wrapX, Y = y + wrapY;
      if (X < -cw || X > N + cw || Y < -rh * 2 || Y > N + rh * 2) continue;
      const path = (ctx) => { ctx.beginPath(); ctx.moveTo(X - w, Y); ctx.quadraticCurveTo(X - w, Y + h * 0.75, X, Y + h); ctx.quadraticCurveTo(X + w, Y + h * 0.75, X + w, Y); ctx.quadraticCurveTo(X, Y - h * 0.25, X - w, Y); ctx.closePath(); };
      const g1 = hx.createLinearGradient(X, Y - h * 0.2, X, Y + h); g1.addColorStop(0, '#2a2a2a'); g1.addColorStop(0.55, '#b4b4b4'); g1.addColorStop(0.92, '#ffffff'); g1.addColorStop(1, '#8a8a8a');
      path(hx); hx.fillStyle = g1; hx.fill(); hx.lineWidth = 2; hx.strokeStyle = '#000'; hx.stroke();
    }
    const v = 0.72 + rr() * 0.28;
    for (const wrapX of [0, N, -N]) for (const wrapY of [0, N, -N]) {
      const X = x + wrapX, Y = y + wrapY;
      if (X < -cw || X > N + cw || Y < -rh * 2 || Y > N + rh * 2) continue;
      const g2 = ax.createLinearGradient(X, Y - h * 0.2, X, Y + h); const L = (k) => { const q = Math.round(255 * clamp(v * k, 0, 1)); return 'rgb(' + q + ',' + q + ',' + q + ')'; };
      g2.addColorStop(0, L(0.42)); g2.addColorStop(0.5, L(0.8)); g2.addColorStop(0.9, L(1)); g2.addColorStop(1, L(0.7));
      ax.beginPath(); ax.moveTo(X - w, Y); ax.quadraticCurveTo(X - w, Y + h * 0.75, X, Y + h); ax.quadraticCurveTo(X + w, Y + h * 0.75, X + w, Y); ax.quadraticCurveTo(X, Y - h * 0.25, X - w, Y); ax.closePath();
      ax.fillStyle = g2; ax.fill(); ax.lineWidth = 2.2; ax.strokeStyle = 'rgba(8,4,4,0.9)'; ax.stroke();
    }
  }
  // fine grain so a scale is not a flat plate
  const ad = ax.getImageData(0, 0, N, N);
  for (let i = 0; i < ad.data.length; i += 4) { const n = (rr() - 0.5) * 26; ad.data[i] = clamp(ad.data[i] + n, 0, 255); ad.data[i + 1] = clamp(ad.data[i + 1] + n, 0, 255); ad.data[i + 2] = clamp(ad.data[i + 2] + n, 0, 255); }
  ax.putImageData(ad, 0, 0);
  // height -> normal map
  const hd = hx.getImageData(0, 0, N, N).data, nc = document.createElement('canvas'); nc.width = nc.height = N;
  const nx = nc.getContext('2d'), nd = nx.createImageData(N, N), H = (x, y) => hd[(((y + N) % N) * N + ((x + N) % N)) * 4] / 255;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 3.2, dy = (H(x, y + 1) - H(x, y - 1)) * 3.2, l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
    nd.data[i] = (-dx / l * 0.5 + 0.5) * 255; nd.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; nd.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; nd.data[i + 3] = 255;
  }
  nx.putImageData(nd, 0, 0);
  const mk = (cv, srgb) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  // wing skin: leathery, mottled, with veins fanning out
  const mc = document.createElement('canvas'); mc.width = mc.height = 512; const mx = mc.getContext('2d');
  mx.fillStyle = '#8c8c8c'; mx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) { const q = Math.round(90 + rr() * 110); mx.fillStyle = 'rgba(' + q + ',' + q + ',' + q + ',0.16)'; mx.beginPath(); mx.arc(rr() * 512, rr() * 512, 2 + rr() * 9, 0, 6.3); mx.fill(); }
  mx.strokeStyle = 'rgba(40,20,20,0.5)';
  for (let i = 0; i < 46; i++) { let x = rr() * 512, y = rr() * 512, a = rr() * 6.28; mx.lineWidth = 0.8 + rr() * 1.8; mx.beginPath(); mx.moveTo(x, y); for (let k = 0; k < 14; k++) { a += (rr() - 0.5) * 0.7; x += Math.cos(a) * 16; y += Math.sin(a) * 16; mx.lineTo(x, y); } mx.stroke(); }
  TEX = { scale: mk(ac, true), scaleN: mk(nc, false), skin: mk(mc, true) };
  return TEX;
}

// ---------------------------------------------------------------- geometry helpers
// A tube lofted through stations { p: Vector3, r, sx, sy }. colorAt(angleSin, v01) gives each vertex its colour (sin = +1 on top, -1 belly).
function loft(st, seg, ring, colorAt, uRep = 4, vRep = 0.5, capEnds = true) {
  const curve = new THREE.CatmullRomCurve3(st.map((s) => s.p), false, 'catmullrom', 0.5);
  const pos = [], uv = [], col = [], idx = [], centers = [];
  const up0 = V(0, 1, 0), tan = V(), side = V(), up = V(), c = V();
  let len = 0, prev = null;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, f = t * (st.length - 1), i0 = Math.min(st.length - 2, Math.floor(f)), k = f - i0, a = st[i0], b = st[i0 + 1];
    curve.getPoint(t, c); curve.getTangent(t, tan);
    const r = a.r + (b.r - a.r) * k, sx = (a.sx ?? 1) + ((b.sx ?? 1) - (a.sx ?? 1)) * k, sy = (a.sy ?? 1) + ((b.sy ?? 1) - (a.sy ?? 1)) * k;
    side.crossVectors(up0, tan).normalize(); up.crossVectors(tan, side).normalize();
    if (prev) len += c.distanceTo(prev); prev = c.clone();
    centers.push({ c: c.clone(), r, sy, up: up.clone(), tan: tan.clone(), t });
    for (let j = 0; j <= ring; j++) {
      const ang = -Math.PI / 2 + (j / ring) * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang); // the seam runs along the belly
      pos.push(c.x + side.x * cs * r * sx + up.x * sn * r * sy, c.y + side.y * cs * r * sx + up.y * sn * r * sy, c.z + side.z * cs * r * sx + up.z * sn * r * sy);
      uv.push((j / ring) * uRep, len * vRep);
      const cc = colorAt(sn, t); col.push(cc[0], cc[1], cc[2]);
    }
  }
  const W = ring + 1;
  for (let i = 0; i < seg; i++) for (let j = 0; j < ring; j++) { const a = i * W + j, b = a + W; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  if (capEnds) for (const end of [0, seg]) {
    const cc = centers[end].c, base = pos.length / 3, col0 = colorAt(0, end / seg);
    pos.push(cc.x, cc.y, cc.z); uv.push(0.5, 0); col.push(col0[0], col0[1], col0[2]);
    for (let j = 0; j < ring; j++) { const a = end * W + j; if (end === 0) idx.push(base, a + 1, a); else idx.push(base, a, a + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return { geo: g, centers };
}
const RED = [0.62, 0.05, 0.035], DARK = [0.2, 0.018, 0.02], BELLY = [0.7, 0.47, 0.25];
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hide = (sn) => { const b = sm(0.3, 0.8, -sn), d = sm(0.55, 1, sn); return [0, 1, 2].map((i) => (RED[i] * (1 - d) + DARK[i] * d) * (1 - b) + BELLY[i] * b); };
function cone(r, h, dir, at, seg = 7) { // a spike of height h pointing along dir with its base at `at`
  const g = new THREE.ConeGeometry(r, h, seg).translate(0, h / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize())); g.translate(at.x, at.y, at.z);
  return g;
}
function limb(a, b, r0, r1) { // a tapering bone from a to b
  const d = b.clone().sub(a), L = d.length(), g = new THREE.CylinderGeometry(r1, r0, L, 7).translate(0, L / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize())); g.translate(a.x, a.y, a.z);
  return g;
}
const paint = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };

// ---------------------------------------------------------------- the model
function buildDragon() {
  const T = textures(), U = { uT: { value: 0 }, uBend: { value: 0 }, uSag: { value: 0 }, uRip: { value: 0.5 } };
  // the tail swims behind the body and swings wide in a turn (uBend), drooping or lifting with the climb (uSag)
  const tailPatch = (m) => { m.onBeforeCompile = (sh) => { sh.uniforms.uT = U.uT; sh.uniforms.uBend = U.uBend; sh.uniforms.uSag = U.uSag;
    sh.vertexShader = 'uniform float uT; uniform float uBend; uniform float uSag;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float tw = pow(clamp((-0.6 - position.z) / 8., 0., 1.), 1.25);
      transformed.y += (sin(position.z * 0.62 + uT * 2.6) * 0.5 + uSag * 2.6) * tw;
      transformed.x += (sin(position.z * 0.45 + uT * 1.9) * 0.55 + uBend * 4.2 * tw) * tw;`); };
    m.customProgramCacheKey = () => 'dragon-tail'; return m; };
  const scaleMat = tailPatch(new THREE.MeshStandardMaterial({ map: T.scale, normalMap: T.scaleN, normalScale: new THREE.Vector2(1.5, 1.5), vertexColors: true, roughness: 0.48, metalness: 0.18 }));
  const hornMat = tailPatch(new THREE.MeshStandardMaterial({ color: 0x2a211b, roughness: 0.42, metalness: 0.1 }));
  const plainScale = new THREE.MeshStandardMaterial({ map: T.scale, normalMap: T.scaleN, normalScale: new THREE.Vector2(1.5, 1.5), vertexColors: true, roughness: 0.48, metalness: 0.18 });
  const plainHorn = new THREE.MeshStandardMaterial({ color: 0x2a211b, roughness: 0.42, metalness: 0.1 });
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.35 });
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const shadow = (o) => { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; return o; };

  // body: tail tip -> hips -> chest -> neck
  const B = loft([
    { p: V(0, 0.35, -9.2), r: 0.05 }, { p: V(0, 0.2, -7.2), r: 0.2 }, { p: V(0, 0.05, -5.2), r: 0.42 }, { p: V(0, 0, -3.2), r: 0.78 },
    { p: V(0, 0, -1.3), r: 1.16, sx: 1.05 }, { p: V(0, 0.05, 0.4), r: 1.34, sx: 1.08 }, { p: V(0, 0.25, 1.8), r: 1.12, sx: 1.05 }, { p: V(0, 0.75, 2.9), r: 0.66 },
    { p: V(0, 1.35, 3.8), r: 0.5 }, { p: V(0, 1.75, 4.7), r: 0.47 }, { p: V(0, 1.82, 5.2), r: 0.46 },
  ], 64, 18, (sn) => hide(sn), 5, 0.42);
  body.add(shadow(new THREE.Mesh(B.geo, scaleMat)));
  // a row of spines down the back, biggest over the shoulders
  const spikes = [];
  for (let i = 3; i < B.centers.length - 4; i += 1) { const s = B.centers[i]; if (i % 2) continue; const top = s.c.clone().addScaledVector(s.up, s.r * s.sy * 0.94); const h = 0.22 + s.r * 0.62; spikes.push(cone(0.05 + s.r * 0.13, h, s.up.clone().addScaledVector(s.tan, -0.75), top)); }
  // the tail ends in a barbed blade
  spikes.push(cone(0.34, 1.1, V(0, 0.15, -1), V(0, 0.35, -9.1), 4).scale(1, 0.22, 1).translate(0, 0.27, 0));
  body.add(shadow(new THREE.Mesh(mergeGeometries(spikes), hornMat)));

  // head (its own group so it can turn and aim): skull, lower jaw, horns, teeth, eyes, the fire in its throat
  const head = new THREE.Group(); head.position.set(0, 1.82, 5.15); body.add(head);
  const skull = loft([{ p: V(0, 0.02, -0.25), r: 0.5, sx: 1.05, sy: 0.9 }, { p: V(0, 0.14, 0.45), r: 0.6, sx: 1.12, sy: 0.74 }, { p: V(0, 0.1, 1.2), r: 0.44, sx: 1.05, sy: 0.6 }, { p: V(0, 0.04, 1.95), r: 0.33, sx: 1, sy: 0.52 }, { p: V(0, 0, 2.45), r: 0.2, sx: 1, sy: 0.5 }], 20, 14, (sn) => hide(sn * 0.6 + 0.4), 3, 0.5).geo;
  head.add(shadow(new THREE.Mesh(skull, plainScale)));
  const jaw = new THREE.Group(); jaw.position.set(0, -0.16, 0.05); head.add(jaw);
  jaw.add(shadow(new THREE.Mesh(loft([{ p: V(0, -0.05, 0), r: 0.34, sx: 1.2, sy: 0.5 }, { p: V(0, -0.1, 0.9), r: 0.3, sx: 1.1, sy: 0.42 }, { p: V(0, -0.08, 1.8), r: 0.2, sx: 1, sy: 0.4 }, { p: V(0, -0.04, 2.25), r: 0.11, sx: 1, sy: 0.4 }], 14, 12, (sn) => hide(sn * 0.5 - 0.5), 3, 0.5).geo, plainScale)));
  const horns = [], teeth = [], jteeth = [];
  for (const s of [-1, 1]) {
    horns.push(cone(0.16, 1.7, V(s * 0.28, 0.5, -1), V(s * 0.34, 0.42, 0.05), 8), cone(0.1, 0.8, V(s * 0.75, 0.1, -1), V(s * 0.56, 0.12, 0.2), 6), cone(0.07, 0.45, V(s * 0.5, 0.9, -0.5), V(s * 0.3, 0.45, 0.75), 6));
    for (let i = 0; i < 7; i++) { const z = 1.0 + i * 0.2, w = 0.4 - i * 0.04; teeth.push(cone(0.035, i === 5 ? 0.3 : 0.17, V(0, -1, 0.1), V(s * w, -0.1 - i * 0.004, z), 5)); jteeth.push(cone(0.03, 0.14, V(0, 1, 0.1), V(s * (w - 0.05), 0.04, z - 0.08), 5)); }
  }
  head.add(shadow(new THREE.Mesh(mergeGeometries(horns), plainHorn)), new THREE.Mesh(mergeGeometries(teeth), toothMat)); jaw.add(new THREE.Mesh(mergeGeometries(jteeth), toothMat));
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a0d00, emissive: 0xffa21a, emissiveIntensity: 2.4, roughness: 0.2 });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), eyeMat); e.position.set(s * 0.5, 0.3, 0.72); e.scale.set(0.6, 0.8, 1.3); head.add(e); }
  const throatMat = new THREE.MeshBasicMaterial({ color: 0xff7a18, transparent: true, opacity: 0 });
  const throat = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), throatMat); throat.position.set(0, -0.14, 0.5); throat.scale.set(1, 0.6, 1.6); head.add(throat);
  const throatLight = { intensity: 0 }; // (lit with the effect system's pooled lights: a new light in the scene would make every material recompile)

  // legs: thigh + shin + clawed foot; they stand on the ground and tuck back in flight
  const legs = [];
  const legGeo = (r, L) => { const q = new THREE.CapsuleGeometry(r, L, 5, 12).translate(0, -L / 2 - r * 0.4, 0), u = q.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * 2.2, u.getY(i) * 1.4); return paint(q, RED); };
  for (const [x, y, z, k] of [[1.0, -0.45, 1.25, 0.9], [-1.0, -0.45, 1.25, 0.9], [0.95, -0.45, -1.35, 1.1], [-0.95, -0.45, -1.35, 1.1]]) {
    const hip = new THREE.Group(); hip.position.set(x, y, z); body.add(hip);
    hip.add(shadow(new THREE.Mesh(legGeo(0.4 * k, 1.05 * k), plainScale)));
    const knee = new THREE.Group(); knee.position.set(0, -1.45 * k, 0); hip.add(knee);
    knee.add(shadow(new THREE.Mesh(legGeo(0.25 * k, 1.0 * k), plainScale)));
    const foot = new THREE.Group(); foot.position.set(0, -1.3 * k, 0); knee.add(foot);
    const claws = []; for (const a of [-0.5, 0, 0.5]) claws.push(cone(0.1 * k, 0.6 * k, V(Math.sin(a), -0.35, Math.cos(a)), V(Math.sin(a) * 0.12, 0, Math.cos(a) * 0.12), 6));
    foot.add(shadow(new THREE.Mesh(mergeGeometries(claws), plainHorn)));
    legs.push({ hip, knee, foot, rear: z < 0 });
  }

  // wings: bat-style. An arm (shoulder S, elbow E, wrist W), three long fingers from the wrist, skin stretched between them and back to the hip.
  const S = V(0, 0, 0), E = V(2.7, 0.25, 0.7), W = V(5.3, 0.4, 1.5), T1 = V(9.4, 0.15, 0.6), T2 = V(8.7, 0, -2.4), T3 = V(6.6, 0, -4.3), ET = V(3.1, 0, -3.5), BH = V(0.25, -0.1, -3.4);
  const mid = (a, b, pull) => a.clone().add(b).multiplyScalar(0.5).lerp(W, pull);
  const M12 = mid(T1, T2, 0.36), M23 = mid(T2, T3, 0.36), M3E = mid(T3, ET, 0.38), MEB = ET.clone().add(BH).multiplyScalar(0.5).lerp(E, 0.4);
  const skinMat = new THREE.MeshStandardMaterial({ map: T.skin, color: 0x7d1410, roughness: 0.62, metalness: 0.05, side: THREE.DoubleSide, emissive: 0x3a0704, emissiveIntensity: 1.0 });
  skinMat.onBeforeCompile = (sh) => { sh.uniforms.uT = U.uT; sh.uniforms.uRip = U.uRip;
    sh.vertexShader = 'uniform float uT; uniform float uRip; attribute float aTrail;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed.y += (sin(position.x * 1.5 + position.z * 1.2 - uT * 9.) * 0.11 + sin(position.x * 3.1 - position.z * 2.3 - uT * 13.) * 0.045) * uRip * aTrail - aTrail * aTrail * 0.4;`); };
  skinMat.customProgramCacheKey = () => 'dragon-skin';
  const membrane = (tris, bones) => {
    // split every triangle three times so the skin has enough points to ripple and billow
    let list = tris;
    for (let k = 0; k < 3; k++) { const out = []; for (const [a, b, c] of list) { const ab = a.clone().add(b).multiplyScalar(0.5), bc = b.clone().add(c).multiplyScalar(0.5), ca = c.clone().add(a).multiplyScalar(0.5); out.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]); } list = out; }
    const pos = [], uv = [], tr = [], seg = new THREE.Line3(), q = V();
    for (const t of list) for (const p of t) {
      pos.push(p.x, p.y, p.z); uv.push(p.x / 5, p.z / 5);
      let d = 9; for (const [a, b] of bones) { seg.set(a, b); seg.closestPointToPoint(p, true, q); d = Math.min(d, q.distanceTo(p)); }
      tr.push(clamp(d / 1.1, 0, 1));
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('aTrail', new THREE.Float32BufferAttribute(tr, 1));
    g.computeVertexNormals(); return g;
  };
  const wings = [];
  for (const side of [1, -1]) {
    const mount = new THREE.Group(); mount.position.set(0.85 * side, 0.8, 1.55); mount.scale.x = side; body.add(mount);
    const inner = new THREE.Group(); mount.add(inner);
    const innerBones = [[S, E], [E, W], [E, ET], [W, ET]];
    inner.add(shadow(new THREE.Mesh(membrane([[S, E, BH], [E, MEB, BH], [E, ET, MEB], [E, W, ET]], [[S, E], [E, W], [E, ET], [W, ET], [S, BH]]), skinMat)));
    inner.add(shadow(new THREE.Mesh(paint(mergeGeometries([limb(S, E, 0.3, 0.2), limb(E, W, 0.2, 0.14), limb(E, ET, 0.1, 0.035), cone(0.09, 0.55, V(0.3, 0.3, 1), W, 6)]), DARK), plainScale)));
    const outer = new THREE.Group(); outer.position.copy(W); inner.add(outer);
    const o = (p) => p.clone().sub(W), O = V(0, 0, 0);
    outer.add(shadow(new THREE.Mesh(membrane([[O, o(T1), o(M12)], [O, o(M12), o(T2)], [O, o(T2), o(M23)], [O, o(M23), o(T3)], [O, o(T3), o(M3E)], [O, o(M3E), o(ET)]], [[O, o(T1)], [O, o(T2)], [O, o(T3)], [O, o(ET)]]), skinMat)));
    outer.add(shadow(new THREE.Mesh(paint(mergeGeometries([limb(O, o(T1), 0.13, 0.03), limb(O, o(T2), 0.11, 0.03), limb(O, o(T3), 0.1, 0.03)]), DARK), plainScale)));
    wings.push({ inner, outer, axis: ET.clone().sub(W).normalize() });
  }
  void innerBones;
  return { root, body, head, jaw, throat, throatMat, throatLight, legs, wings, U, mats: [scaleMat, hornMat, plainScale, plainHorn, toothMat, eyeMat, throatMat, skinMat] };
}
function innerBones() {}
void innerBones;

// ---------------------------------------------------------------- flying it
// o: { owner(): {x,y,z} | null, targets(): [{x,y,z,h,r,kind}], dur, burn(point) (caster only, five times a second while the fire lands), yaw }
export function spawnDragon(g, o) {
  const fx = g.fx, scene = g.scene, D = buildDragon(), root = D.root, dur = o.dur || 16;
  const own0 = o.owner() || { x: 0, y: 0, z: 0 };
  const ground = (x, z) => g.world.heightAt(x, z);
  const yaw0 = o.yaw || 0, sx = own0.x + Math.sin(yaw0) * 7 + Math.cos(yaw0) * 3, sz = own0.z + Math.cos(yaw0) * 7 - Math.sin(yaw0) * 3;
  const SIZE = 1.3, P = V(sx, ground(sx, sz), sz), STAND = 2.75 * SIZE;
  const st = { mode: 'summon', yaw: yaw0, yawRate: 0, roll: 0, pitch: 0, speed: 0, vy: 0, ph: 0, amp: 0, freq: 1, fold: 1.7, lift: 1.0, sweep: 0.5, tuck: 0, glide: 0, beats: 0, lastSin: 0,
    atk: null, fireCd: 1.2, pass: 'approach', passT: 0, ext: V(), roarT: 0.35, bob: 0, hy: 0, hp: 0.1, jaw: 0, glow: 0, aim: V(), patches: [], patchT: 0, burnT: 0, tgt: null, tgtT: 0, crouch: 0, gone: false };
  root.position.copy(P); root.position.y += STAND; root.scale.setScalar(0.05); scene.add(root);
  const fireLight = { position: V(0, 0, 0), intensity: 0 }; let lightT = 0;
  const vol = () => { const c = g.camera.position; return clamp(1.25 - Math.hypot(c.x - root.position.x, c.z - root.position.z) / 90, 0.15, 1); };
  const mouth = V(), tmp = V(), tmp2 = V();
  // the summoning: a ring of fire spins up out of the ground and he rises inside it
  fx.shockwave([P.x, P.y, P.z], 9, 0xff6a18, 0.6); fx.flash([P.x, P.y + 3, P.z], 0xff8a30, 40, 0.5, 36);
  g.audio.play('inferno', vol());

  const pickTarget = (own) => {
    let best = null, bd = 110;
    for (const t of o.targets()) { if (t.kind === 'demon') continue; const d = Math.hypot(t.x - own.x, t.z - own.z); if (d < bd) { bd = d; best = t; } }
    return best;
  };
  const stream = (dt, A) => { // the flamethrower: narrow and white-hot at the mouth, widening to orange then red, black smoke rolling off the end
    tmp.copy(A).sub(mouth); const L = Math.min(30, tmp.length()), d = tmp.normalize();
    for (let i = 0; i < fx.n(44); i++) {
      const s = Math.pow(Math.random(), 0.8) * L, k = s / L, w = 0.1 + s * 0.13, edge = Math.random();
      const c0 = k < 0.13 ? [1, 0.86, 0.5, 0.6] : k < 0.5 ? [1, 0.5 - edge * 0.2, 0.07, 0.6] : [0.95, 0.2 - edge * 0.13, 0.02, 0.55];
      fx.fire.emit({ p: [mouth.x + d.x * s + rnd(-w, w), mouth.y + d.y * s + rnd(-w, w), mouth.z + d.z * s + rnd(-w, w)], v: [d.x * 11 + rnd(-1.5, 1.5) * k, d.y * 11 + 1 + k * 5.5, d.z * 11 + rnd(-1.5, 1.5) * k], life: rnd(0.22, 0.4) + k * 0.25, s0: 0.5 + s * 0.2, s1: 0.3 + k * 1.2, c0, c1: [0.5, 0.03, 0, 0], turb: 2 + k * 5, rotV: rnd(-3, 3), drag: 1 + k * 2 });
    }
    for (let i = 0; i < fx.n(4); i++) { const s = Math.random() * L * 0.3; fx.glow.emit({ p: [mouth.x + d.x * s, mouth.y + d.y * s, mouth.z + d.z * s], v: [d.x * 26, d.y * 26, d.z * 26], life: 0.12, s0: 0.5 + s * 0.1, s1: 0.2, c0: [1, 0.95, 0.75, 0.7], c1: [1, 0.6, 0.15, 0] }); }
    for (let i = 0; i < 3; i++) fx.smoke.emit({ p: [A.x + rnd(-1.5, 1.5), A.y + rnd(0.5, 2), A.z + rnd(-1.5, 1.5)], v: [d.x * 5 + rnd(-1, 1), rnd(2.5, 5), d.z * 5 + rnd(-1, 1)], life: rnd(1.3, 2.1), s0: 1.4, s1: 5.2, c0: [0.035, 0.03, 0.028, 0.6], c1: [0.13, 0.12, 0.12, 0], rotV: rnd(-1, 1) });
    for (let i = 0; i < fx.n(3); i++) fx.spark.emit({ p: [A.x + rnd(-1, 1), A.y + 0.3, A.z + rnd(-1, 1)], v: [rnd(-5, 5), rnd(3, 9), rnd(-5, 5)], life: rnd(0.5, 1), s0: 0.14, s1: 0.02, c0: [1, 0.6, 0.15, 1], c1: [0.8, 0.1, 0, 0], g: 6 });
    fireLight.position.set(A.x, A.y + 1.8, A.z); fireLight.intensity = 70 * (0.85 + 0.3 * Math.random());
    // it leaves the ground burning where it lands
    st.patchT -= dt;
    if (st.patchT <= 0 && A.y - ground(A.x, A.z) < 3) { st.patchT = 0.16; st.patches.push({ x: A.x + rnd(-1.2, 1.2), z: A.z + rnd(-1.2, 1.2), t: rnd(2.6, 3.6) }); if (st.patches.length > 16) st.patches.shift(); }
  };

  const fxh = fx.add({
    dur: dur + 1.5,
    update: (dt, t) => {
      const own = o.owner();
      if (!own && !st.gone) { st.gone = true; st.goneAt = t; }
      if (t > dur && !st.gone) { st.gone = true; st.goneAt = t; }
      const O = own || own0;
      D.U.uT.value = t;
      let wantAmp = 0.5, wantFreq = 0.85, hard = false;
      // ---------------- summon: inside the fire, crouching, wings folded
      if (st.mode === 'summon') {
        const k = Math.min(1, t / 0.8);
        root.scale.setScalar(SIZE * (0.05 + 0.95 * k * k * (3 - 2 * k)));
        for (let i = 0; i < fx.n(30); i++) { const a = t * 7 + i * 0.21 + Math.random(), r = 8.5 - t * 0.6, h = Math.pow(Math.random(), 1.6) * 11 * Math.min(1, t * 1.5); fx.fire.emit({ p: [P.x + Math.cos(a) * r, P.y + h, P.z + Math.sin(a) * r], v: [-Math.sin(a) * 9, rnd(3, 7), Math.cos(a) * 9], life: rnd(0.45, 0.8), s0: rnd(1.8, 3.2), s1: 0.4, c0: [1, 0.48, 0.07, 0.6], c1: [0.75, 0.05, 0, 0], turb: 3, rotV: rnd(-2, 2) }); }
        for (let i = 0; i < fx.n(3); i++) { const a = Math.random() * 6.28; fx.spark.emit({ p: [P.x + Math.cos(a) * 6, P.y + 0.3, P.z + Math.sin(a) * 6], v: [-Math.sin(a) * 6, rnd(5, 12), Math.cos(a) * 6], life: rnd(0.6, 1.2), s0: 0.16, s1: 0.02, c0: [1, 0.65, 0.2, 1], c1: [0.9, 0.15, 0, 0], g: 3 }); }
        st.crouch = sm(0.9, 1.5, t); // he sinks onto his haunches before the jump
        root.position.set(P.x, P.y + STAND - st.crouch * 0.85 * SIZE, P.z);
        st.fold += (1.7 - st.crouch * 1.1 - st.fold) * Math.min(1, dt * 5); st.lift += ((1.0 - st.crouch * 0.2) - st.lift) * Math.min(1, dt * 5); st.amp = 0;
        st.hp += ((t < 0.9 ? -0.45 : 0.25) - st.hp) * Math.min(1, dt * 4); st.jaw += ((t > 0.3 && t < 1.3 ? 0.5 : 0) - st.jaw) * Math.min(1, dt * 8);
        if (t >= 1.6) { st.mode = 'takeoff'; st.vy = 11; st.speed = 2.5; st.ph = Math.PI / 2; st.modeT = t; g.audio.play('wing', vol()); fx.shockwave([P.x, P.y, P.z], 8, 0xd8c8a8, 0.5);
          for (let i = 0; i < 18; i++) { const a = Math.random() * 6.28; fx.smoke.emit({ p: [P.x + Math.cos(a) * 2, P.y + 0.4, P.z + Math.sin(a) * 2], v: [Math.cos(a) * 9, rnd(0.5, 2), Math.sin(a) * 9], life: rnd(0.8, 1.4), s0: 1.2, s1: 4, c0: [0.5, 0.44, 0.36, 0.4], c1: [0.5, 0.45, 0.4, 0], drag: 2 }); } }
      } else {
        // ---------------- in the air
        const pos = root.position, gy = ground(pos.x, pos.z);
        let goalX, goalZ, goalY, wantSpeed = 12.5;
        st.tgtT -= dt;
        if (!st.atk && (st.tgtT <= 0 || !st.tgt)) { st.tgt = st.gone ? null : pickTarget(O); st.tgtT = 2.5; }
        else if (st.tgt) { const fresh = o.targets().find((q) => q.id === st.tgt.id); if (fresh) st.tgt = fresh; else if (!st.atk) st.tgt = null; }
        const T = st.tgt;
        if (st.mode === 'takeoff') { // straight up and forward on hard, deep beats
          goalX = pos.x + Math.sin(st.yaw) * 10; goalZ = pos.z + Math.cos(st.yaw) * 10; goalY = gy + 12; hard = true; wantSpeed = 9;
          if (pos.y > gy + 8.5 || t - st.modeT > 2.6) st.mode = 'fly';
        } else if (st.gone) { goalX = pos.x + Math.sin(st.yaw) * 20; goalZ = pos.z + Math.cos(st.yaw) * 20; goalY = pos.y + 30; hard = true; wantSpeed = 16; }
        else if (T) {
          const top = T.y + (T.h || 2);
          goalY = Math.max(top + 5.5, ground(T.x, T.z) + 7);
          if (st.pass === 'extend') { goalX = st.ext.x; goalZ = st.ext.z; st.passT -= dt; if (st.passT <= 0) st.pass = 'approach'; }
          else { goalX = T.x; goalZ = T.z; if (Math.hypot(T.x - pos.x, T.z - pos.z) < 4.5 && !st.atk) { st.pass = 'extend'; st.passT = 1.9; st.ext.set(pos.x + Math.sin(st.yaw) * 26, 0, pos.z + Math.cos(st.yaw) * 26); } }
        } else { // nobody to burn: wide, lazy circles round the summoner
          const a = Math.atan2(pos.x - O.x, pos.z - O.z) + 0.75; goalX = O.x + Math.sin(a) * 14; goalZ = O.z + Math.cos(a) * 14; goalY = Math.max(O.y + 10, gy + 7); wantSpeed = 11;
        }
        if (st.atk) wantSpeed = 8.5;
        const dy = wrap(Math.atan2(goalX - pos.x, goalZ - pos.z) - st.yaw);
        const wantRate = clamp(dy * 1.5, -1.05, 1.05) * (st.mode === 'takeoff' ? 0.3 : 1);
        st.yawRate += (wantRate - st.yawRate) * Math.min(1, dt * 2.2); st.yaw += st.yawRate * dt; // he can't swing round at once: the turn builds and he leans into it
        st.speed += clamp(wantSpeed - st.speed, -4 * dt, 5 * dt);
        const wantVy = clamp((goalY - pos.y) * 0.9, -5, st.mode === 'takeoff' ? 9 : 7);
        st.vy += clamp(wantVy - st.vy, -9 * dt, 9 * dt);
        if (wantVy > 2.2 || st.vy > 2.6) hard = true; // climbing takes real work
        pos.x += Math.sin(st.yaw) * st.speed * dt; pos.z += Math.cos(st.yaw) * st.speed * dt; pos.y += st.vy * dt;
        if (pos.y < gy + 4 && st.mode !== 'takeoff') { pos.y = gy + 4; st.vy = Math.max(st.vy, 0); }
        st.roll += (-st.yawRate * 0.62 - st.roll) * Math.min(1, dt * 3);
        st.pitch += (-Math.atan2(st.vy, Math.max(4, st.speed)) * 0.75 - st.pitch) * Math.min(1, dt * 3);
        st.tuck += (1 - st.tuck) * Math.min(1, dt * 2.2); st.crouch += (0 - st.crouch) * Math.min(1, dt * 4);
        // wingbeats: hard and fast to climb, slow and heavy to cruise, then a long glide on spread wings
        if (hard) { wantAmp = 0.92; wantFreq = st.mode === 'takeoff' ? 2.5 : 1.75; st.glide = 0; st.beats = 0; }
        else if (st.atk) { wantAmp = 0.62; wantFreq = 1.15; st.glide = 0; }
        else if (st.glide > 0) { st.glide -= dt; wantAmp = 0.05; wantFreq = 0.5; }
        else { wantAmp = 0.62; wantFreq = 0.8; if (st.beats >= 3) { st.beats = 0; st.glide = rnd(2.2, 3.4); } }

        // ---------------- fire
        st.fireCd -= dt;
        if (!st.atk && T && st.mode === 'fly' && !st.gone && st.fireCd <= 0 && st.pass === 'approach') {
          const d = Math.hypot(T.x - pos.x, T.z - pos.z);
          if (d > 15 && d < 34 && Math.abs(dy) < 0.5) { st.atk = { t: 0, sw: Math.random() < 0.5 ? 1 : -1, lit: false }; }
        }
        if (st.atk) {
          const A = st.atk; A.t += dt;
          if (T) { const px = Math.cos(st.yaw), pz = -Math.sin(st.yaw), sw = Math.sin(clamp((A.t - 0.75) / 1.9, 0, 1) * Math.PI - Math.PI / 2) * 3.2 * A.sw; st.aim.set(T.x + px * sw, T.y + (T.y - ground(T.x, T.z) > 2.5 ? (T.h || 2) * 0.5 : 0.25), T.z + pz * sw); }
          if (A.t >= 0.75 && A.t < 2.65) {
            if (!A.lit) { A.lit = true; g.audio.play('inferno', vol()); g.audio.play('fire_cast', vol()); }
            D.head.localToWorld(mouth.set(0, -0.14, 2.3)); st.fired = (st.fired || 0) + 1;
            stream(dt, st.aim);
            st.burnT -= dt; if (st.burnT <= 0) { st.burnT = 0.2; o.burn && o.burn([st.aim.x, st.aim.y, st.aim.z]); }
          }
          if (A.t >= 2.75) { st.atk = null; st.fireCd = rnd(1.1, 1.7); }
        }
      }
      // ---------------- wings, body, head, legs
      st.amp += (wantAmp - st.amp) * Math.min(1, dt * 3); st.freq += (wantFreq - st.freq) * Math.min(1, dt * 3);
      if (st.mode !== 'summon') st.ph += dt * st.freq * 6.2832;
      const sn = Math.sin(st.ph), cs = Math.cos(st.ph); // cs > 0: the wings are coming up
      if (st.lastSin > 0 && sn <= 0 && st.mode !== 'summon') st.beats++;
      if (st.mode !== 'summon' && st.lastCs !== undefined && st.lastCs >= 0 && cs < 0 && st.amp > 0.35) g.audio.play('wing', vol() * (0.35 + st.amp * 0.6)); // the downstroke
      st.lastSin = sn; st.lastCs = cs;
      const fly = st.mode !== 'summon';
      const wantLift = fly ? 0.24 + sn * st.amp * 0.8 : st.lift, wantFold = fly ? 0.06 + Math.max(0, cs) * st.amp * 0.62 + (1 - Math.min(1, st.amp * 3)) * 0.02 : st.fold, wantSweep = fly ? Math.max(0, cs) * st.amp * 0.35 - 0.05 : 0.55;
      if (fly) { st.lift += (wantLift - st.lift) * Math.min(1, dt * 14); st.fold += (wantFold - st.fold) * Math.min(1, dt * 12); }
      st.sweep += (wantSweep - st.sweep) * Math.min(1, dt * 8);
      for (const w of D.wings) { w.inner.rotation.set(0, st.sweep, st.lift, 'ZYX'); w.outer.quaternion.setFromAxisAngle(w.axis, st.fold); }
      D.U.uRip.value = 0.35 + Math.abs(cs) * st.amp * 1.3;
      st.bob = fly ? -sn * st.amp * 0.42 : 0; // up on the downstroke, down on the upstroke
      D.body.position.y = st.bob;
      root.rotation.set(st.pitch + (fly ? cs * st.amp * 0.035 : 0), st.yaw, st.roll, 'YXZ');
      D.U.uBend.value += (-st.yawRate * 0.55 - D.U.uBend.value) * Math.min(1, dt * 1.6); D.U.uSag.value += (-st.vy * 0.02 - D.U.uSag.value) * Math.min(1, dt * 2);
      for (const L of D.legs) { const k = st.tuck, c = st.crouch;
        L.hip.rotation.x = (L.rear ? 0.35 : -0.3) * (1 - k) + (L.rear ? 1.15 : 0.95) * k + c * (L.rear ? 0.55 : 0.45) * (1 - k);
        L.knee.rotation.x = (L.rear ? -0.75 : 0.55) * (1 - k) + (L.rear ? -1.9 : -1.75) * k - c * (L.rear ? 1.0 : -0.85) * (1 - k);
        L.foot.rotation.x = (L.rear ? 0.4 : -0.25) * (1 - k) + 0.7 * k; }
      // head: looks where he is going, rears back and opens wide before the fire, then follows the stream
      let hy = clamp(st.yawRate * 0.5, -0.5, 0.5), hp = st.mode === 'summon' ? st.hp : 0.12 - st.pitch * 0.6, jaw = st.mode === 'summon' ? st.jaw : 0.04, glow = 0;
      if (st.atk) {
        const A = st.atk;
        if (A.t < 0.75) { const k = A.t / 0.75; hp = -0.55 * Math.sin(k * Math.PI * 0.5); jaw = 0.75 * k; glow = k; }
        else { D.head.parent.worldToLocal(tmp2.copy(st.aim)).sub(D.head.position); hy = clamp(Math.atan2(tmp2.x, tmp2.z), -1.1, 1.1); hp = clamp(Math.atan2(-tmp2.y, Math.hypot(tmp2.x, tmp2.z)), -0.5, 1.35); jaw = 0.8; glow = A.t < 2.65 ? 1.3 : 0.4; }
      } else if (st.roaring > 0) { st.roaring -= dt; jaw = 0.7; hp = -0.3; }
      if (st.mode !== 'summon') { st.hy += (hy - st.hy) * Math.min(1, dt * 6); st.hp += (hp - st.hp) * Math.min(1, dt * 7); st.jaw += (jaw - st.jaw) * Math.min(1, dt * 9); }
      st.glow += (glow - st.glow) * Math.min(1, dt * 7);
      D.head.rotation.set(st.hp, st.hy, 0, 'YXZ'); D.jaw.rotation.x = st.jaw;
      D.throatMat.opacity = Math.min(1, st.glow); D.throat.visible = st.glow > 0.02; D.throatLight.intensity = st.glow * 26;
      if (!st.atk || st.atk.t < 0.75 || st.atk.t > 2.65) fireLight.intensity *= Math.max(0, 1 - dt * 5);
      // a roar every few seconds: deep, loud, with a rumble under it
      st.roarT -= dt;
      if (st.roarT <= 0 && !st.atk && !st.gone) { st.roarT = rnd(4.5, 6.5); st.roaring = 1.5; g.audio.play('roar', vol()); if (g.shake) g.shake(0.25 * vol()); }
      // burning ground
      for (let i = st.patches.length - 1; i >= 0; i--) { const q = st.patches[i]; q.t -= dt; if (q.t <= 0) { st.patches.splice(i, 1); continue; }
        if (Math.random() < 0.6) { const y = ground(q.x, q.z); fx.fire.emit({ p: [q.x + rnd(-0.8, 0.8), y + 0.25, q.z + rnd(-0.8, 0.8)], v: [rnd(-0.4, 0.4), rnd(1.6, 3.4), rnd(-0.4, 0.4)], life: rnd(0.4, 0.75), s0: rnd(0.8, 1.4) * Math.min(1, q.t), s1: 0.15, c0: [1, 0.45, 0.07, 0.5], c1: [0.7, 0.05, 0, 0], turb: 2, rotV: rnd(-2, 2) }); } }
      if (st.patches.length && fireLight.intensity < 14) { const q = st.patches[st.patches.length - 1]; fireLight.position.set(q.x, ground(q.x, q.z) + 1.5, q.z); fireLight.intensity = 14 * (0.8 + 0.4 * Math.random()); }
      lightT -= dt;
      if (lightT <= 0) { lightT = 0.09;
        if (fireLight.intensity > 2) fx.flash([fireLight.position.x, fireLight.position.y, fireLight.position.z], 0xff8a30, fireLight.intensity * 0.6, 0.2, 34);
        if (st.glow > 0.15) { D.head.getWorldPosition(tmp); fx.flash([tmp.x, tmp.y - 0.4, tmp.z], 0xff7a20, st.glow * 16, 0.2, 16); } }
      // leaving: he climbs away and burns out
      if (st.gone) { const k = clamp(1 - (t - st.goneAt) / 1.4, 0, 1); root.scale.setScalar(SIZE * Math.max(0.02, k));
        for (let i = 0; i < fx.n(8); i++) fx.fire.emit({ p: [root.position.x + rnd(-3, 3) * k, root.position.y + rnd(-1, 1), root.position.z + rnd(-3, 3) * k], v: [rnd(-2, 2), rnd(1, 4), rnd(-2, 2)], life: rnd(0.3, 0.6), s0: rnd(1, 2.2), s1: 0.2, c0: [1, 0.5, 0.08, 0.5], c1: [0.7, 0.05, 0, 0], turb: 3 });
        if (k <= 0) return false; }
    },
    dispose: () => { fxh.done = true; scene.remove(root); root.traverse((q) => { if (q.geometry) q.geometry.dispose(); }); for (const m of D.mats) m.dispose(); },
  });
  return { root, state: st, fx: fxh, parts: D };
}
