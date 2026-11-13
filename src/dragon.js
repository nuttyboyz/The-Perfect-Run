// Ember's Dragon (reworked 2026-11-12 to Nutty's brief): charcoal and deep red scales with lava glowing in the cracks, huge torn bat wings whose
// thin skin glows when fire is behind it, always in the air (legs tucked, whip tail trailing in an S), slow heavy wingbeats, a long thick
// stream of fire, and small flames and embers licking off it as it flies. It is summoned in a ring of fire, already airborne. No roar.
// spawnDragon() draws and flies it for everyone; only the caster passes `burn`, which does the damage.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => { while (a > Math.PI) a -= 6.2832; while (a < -Math.PI) a += 6.2832; return a; };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease01 = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };

// ---------------------------------------------------------------- textures (made once)
let TEX = null;
function textures() {
  if (TEX) return TEX;
  const N = 1024, cols = 14, rows = 24, cw = N / cols, rh = N / rows;
  const cv = (n = N) => { const c = document.createElement('canvas'); c.width = c.height = n; return c; };
  const hc = cv(), hx = hc.getContext('2d'); hx.fillStyle = '#000'; hx.fillRect(0, 0, N, N);
  const ac = cv(), ax = ac.getContext('2d'); ax.fillStyle = '#141414'; ax.fillRect(0, 0, N, N);
  let seed = 7; const rr = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const hash = (a, b, k) => { const s = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };
  // Overlapping scales in staggered rows, top row first so each row laps over the one above it. Every scale has its own size, lean and shade.
  for (let r = -1; r <= rows; r++) for (let c = -1; c <= cols; c++) {
    const R = (r + rows) % rows, C = (c + cols) % cols;
    const x = (c + (r & 1 ? 0.5 : 0)) * cw + cw / 2 + (hash(R, C, 1) - 0.5) * cw * 0.2, y = r * rh + rh * 0.2 + (hash(R, C, 2) - 0.5) * rh * 0.22;
    const w = cw * (0.5 + hash(R, C, 3) * 0.12), h = rh * (0.92 + hash(R, C, 4) * 0.3), lean = (hash(R, C, 5) - 0.5) * cw * 0.16, v = 0.5 + hash(R, C, 6) * 0.5;
    for (const wrapX of [0, N, -N]) for (const wrapY of [0, N, -N]) {
      const X = x + wrapX, Y = y + wrapY;
      if (X < -cw || X > N + cw || Y < -rh * 2 || Y > N + rh * 2) continue;
      const path = (ctx) => { ctx.beginPath(); ctx.moveTo(X - w, Y); ctx.quadraticCurveTo(X - w, Y + h * 0.75, X + lean, Y + h); ctx.quadraticCurveTo(X + w, Y + h * 0.75, X + w, Y); ctx.quadraticCurveTo(X, Y - h * 0.25, X - w, Y); ctx.closePath(); };
      const g1 = hx.createLinearGradient(X, Y - h * 0.2, X, Y + h); g1.addColorStop(0, '#3a3a3a'); g1.addColorStop(0.5, '#b8b8b8'); g1.addColorStop(0.9, '#ffffff'); g1.addColorStop(1, '#909090');
      path(hx); hx.fillStyle = g1; hx.fill(); hx.lineWidth = 5; hx.strokeStyle = '#000'; hx.stroke();
      hx.strokeStyle = 'rgba(255,255,255,0.35)'; hx.lineWidth = 2; hx.beginPath(); hx.moveTo(X, Y + h * 0.1); hx.lineTo(X + lean, Y + h * 0.9); hx.stroke(); // a keel down the middle
      const L = (k) => { const q = Math.round(255 * clamp(v * k, 0, 1)); return 'rgb(' + q + ',' + q + ',' + q + ')'; };
      const g2 = ax.createLinearGradient(X, Y - h * 0.2, X, Y + h); g2.addColorStop(0, L(0.3)); g2.addColorStop(0.5, L(0.75)); g2.addColorStop(0.9, L(1)); g2.addColorStop(1, L(0.55));
      path(ax); ax.fillStyle = g2; ax.fill(); ax.lineWidth = 5; ax.strokeStyle = 'rgba(4,2,2,0.95)'; ax.stroke();
    }
  }
  const ad = ax.getImageData(0, 0, N, N);
  for (let i = 0; i < ad.data.length; i += 4) { const n = (rr() - 0.5) * 30; ad.data[i] = clamp(ad.data[i] + n, 0, 255); ad.data[i + 1] = clamp(ad.data[i + 1] + n, 0, 255); ad.data[i + 2] = clamp(ad.data[i + 2] + n, 0, 255); }
  ax.putImageData(ad, 0, 0);
  // height -> normal map, roughness map (worn smooth on each scale, rough in the gaps) and the glow layer (lava in the cracks between scales)
  const hd = hx.getImageData(0, 0, N, N).data, H = (x, y) => hd[(((y + N) % N) * N + ((x + N) % N)) * 4] / 255;
  const nc = cv(), nx = nc.getContext('2d'), nd = nx.createImageData(N, N), rc = cv(), rx = rc.getContext('2d'), rd = rx.createImageData(N, N), gc = cv(), gx = gc.getContext('2d'), gd = gx.createImageData(N, N);
  const TAU = 6.2832;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const h0 = H(x, y), dx = (H(x + 1, y) - H(x - 1, y)) * 4.2, dy = (H(x, y + 1) - H(x, y - 1)) * 4.2, l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
    nd.data[i] = (-dx / l * 0.5 + 0.5) * 255; nd.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; nd.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; nd.data[i + 3] = 255;
    const ro = clamp(0.92 - 0.5 * h0 + (hash(x, y, 9) - 0.5) * 0.12, 0.2, 1) * 255; rd.data[i] = rd.data[i + 1] = rd.data[i + 2] = ro; rd.data[i + 3] = 255;
    const u = x / N * TAU, w2 = y / N * TAU; // veins of heat wander over the hide: the cracks glow in some places and stay dark in others
    const m = 0.5 + 0.5 * Math.sin(u * 2 + 1.7 * Math.sin(w2 * 3 + 0.6)) * Math.sin(w2 * 2 + 1.3 * Math.sin(u * 3 + 2.1));
    const mask = 0.06 + 0.94 * sm(0.42, 0.8, m), gap = 1 - sm(0.0, 0.16, h0), gl = gap * mask;
    gd.data[i] = 255 * Math.min(1, gl * 1.25); gd.data[i + 1] = 255 * Math.min(1, gl * gl * 0.62); gd.data[i + 2] = 255 * gl * gl * gl * 0.16; gd.data[i + 3] = 255;
  }
  nx.putImageData(nd, 0, 0); rx.putImageData(rd, 0, 0); gx.putImageData(gd, 0, 0);
  const mk = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  // wing skin: leathery, mottled, with veins fanning out
  const mc = cv(512), mx = mc.getContext('2d');
  mx.fillStyle = '#8c8c8c'; mx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 3200; i++) { const q = Math.round(70 + rr() * 130); mx.fillStyle = 'rgba(' + q + ',' + q + ',' + q + ',0.16)'; mx.beginPath(); mx.arc(rr() * 512, rr() * 512, 2 + rr() * 9, 0, 6.3); mx.fill(); }
  mx.strokeStyle = 'rgba(20,10,10,0.7)';
  for (let i = 0; i < 70; i++) { let x = rr() * 512, y = rr() * 512, a = rr() * 6.28; mx.lineWidth = 0.8 + rr() * 2.4; mx.beginPath(); mx.moveTo(x, y); for (let k = 0; k < 16; k++) { a += (rr() - 0.5) * 0.7; x += Math.cos(a) * 16; y += Math.sin(a) * 16; mx.lineTo(x, y); } mx.stroke(); }
  // soft noise: decides where the wing edges are torn
  const tc = cv(256), tx = tc.getContext('2d'); tx.fillStyle = '#808080'; tx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 420; i++) { const X = rr() * 256, Y = rr() * 256, R0 = 6 + rr() * 26, q = rr() < 0.5 ? 0 : 255;
    for (const ox of [0, 256, -256]) for (const oy of [0, 256, -256]) { const g = tx.createRadialGradient(X + ox, Y + oy, 0, X + ox, Y + oy, R0); g.addColorStop(0, 'rgba(' + q + ',' + q + ',' + q + ',0.4)'); g.addColorStop(1, 'rgba(' + q + ',' + q + ',' + q + ',0)'); tx.fillStyle = g; tx.fillRect(X + ox - R0, Y + oy - R0, R0 * 2, R0 * 2); } }
  // horn: ridged rings, bone-pale streaks
  const oc = cv(256), ox2 = oc.getContext('2d'); ox2.fillStyle = '#9a9a9a'; ox2.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 1) { const q = Math.round(120 + 70 * Math.sin(y * 0.55) + rr() * 50); ox2.fillStyle = 'rgba(' + q + ',' + q + ',' + q + ',0.55)'; ox2.fillRect(0, y, 256, 1); }
  for (let i = 0; i < 300; i++) { ox2.fillStyle = 'rgba(20,16,12,0.25)'; ox2.fillRect(rr() * 256, rr() * 256, 1 + rr() * 2, 8 + rr() * 40); }
  // a real photo-scanned cracked surface laid over the scales for grit and pores (Poly Haven CC0, already in the game's scan set)
  const det = { value: null }, detK = { value: 0 };
  const dtx = new THREE.TextureLoader().load('assets/scan/mud_cracked_dry_03_a.webp', () => { detK.value = 0.6; });
  dtx.wrapS = dtx.wrapT = THREE.RepeatWrapping; dtx.colorSpace = THREE.SRGBColorSpace; dtx.anisotropy = 4; det.value = dtx;
  TEX = { scale: mk(ac, true), scaleN: mk(nc, false), scaleR: mk(rc, false), glow: mk(gc, true), skin: mk(mc, true), tear: mk(tc, false), horn: mk(oc, true), det, detK };
  return TEX;
}

// ---------------------------------------------------------------- geometry helpers
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// A tube lofted through stations { p: Vector3, r, sx, sy }. colorAt(angleSin, v01) -> [r, g, b, heat] (sin = +1 on top, -1 belly; heat = how hot the cracks glow there).
function loft(st, seg, ring, colorAt, uRep = 4, vRep = 0.5, capEnds = true) {
  const curve = new THREE.CatmullRomCurve3(st.map((s) => s.p), false, 'catmullrom', 0.5);
  const pos = [], uv = [], col = [], heat = [], idx = [], centers = [];
  const up0 = V(0, 1, 0), tan = V(), side = V(), up = V(), c = V();
  let len = 0, prev = null;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, f = t * (st.length - 1), i0 = Math.min(st.length - 2, Math.floor(f)), k = f - i0, a = st[i0], b = st[i0 + 1];
    curve.getPoint(t, c); curve.getTangent(t, tan);
    const r = a.r + (b.r - a.r) * k, sx = (a.sx ?? 1) + ((b.sx ?? 1) - (a.sx ?? 1)) * k, sy = (a.sy ?? 1) + ((b.sy ?? 1) - (a.sy ?? 1)) * k;
    side.crossVectors(up0, tan).normalize(); up.crossVectors(tan, side).normalize();
    if (prev) len += c.distanceTo(prev); prev = c.clone();
    centers.push({ c: c.clone(), r, sx, sy, up: up.clone(), tan: tan.clone(), t });
    for (let j = 0; j <= ring; j++) {
      const ang = -Math.PI / 2 + (j / ring) * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang); // the seam runs along the belly
      pos.push(c.x + side.x * cs * r * sx + up.x * sn * r * sy, c.y + side.y * cs * r * sx + up.y * sn * r * sy, c.z + side.z * cs * r * sx + up.z * sn * r * sy);
      uv.push((j / ring) * uRep, len * vRep);
      const cc = colorAt(sn, t); col.push(cc[0], cc[1], cc[2]); heat.push(cc[3] || 0);
    }
  }
  const W = ring + 1;
  for (let i = 0; i < seg; i++) for (let j = 0; j < ring; j++) { const a = i * W + j, b = a + W; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  if (capEnds) for (const end of [0, seg]) {
    const cc = centers[end].c, base = pos.length / 3, col0 = colorAt(0, end / seg);
    pos.push(cc.x, cc.y, cc.z); uv.push(0.5, 0); col.push(col0[0], col0[1], col0[2]); heat.push(col0[3] || 0);
    for (let j = 0; j < ring; j++) { const a = end * W + j; if (end === 0) idx.push(base, a + 1, a); else idx.push(base, a, a + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('aHeat', new THREE.Float32BufferAttribute(heat, 1));
  g.setIndex(idx); g.computeVertexNormals();
  return { geo: g, centers };
}
// charcoal on the back, deep red down the flanks, ember-dark underneath
const COAL = [0.2, 0.026, 0.022], RED = [0.9, 0.05, 0.03], BELLY = [0.42, 0.07, 0.03], HORN0 = [0.17, 0.14, 0.115], HORN1 = [0.03, 0.026, 0.024];
const hide = (sn, heat = 0.2) => { const b = sm(0.25, 0.85, -sn), d = sm(0.3, 0.95, sn); return [...[0, 1, 2].map((i) => (RED[i] * (1 - d) + COAL[i] * d) * (1 - b) + BELLY[i] * b), heat * (0.03 + 0.97 * sm(-0.35, 0.8, -sn))]; };
const paint = (g, c, heat = 0) => { const n = g.attributes.position.count, a = new Float32Array(n * 3), h = new Float32Array(n).fill(heat); for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.setAttribute('aHeat', new THREE.BufferAttribute(h, 1)); return g.index ? g.toNonIndexed() : g; };
function cone(r, h, dir, at, seg = 7, flat = 1) { // a spike of height h pointing along dir with its base at `at`; flat < 1 squeezes it into a blade
  const g = new THREE.ConeGeometry(r, h, seg, 3).translate(0, h / 2, 0); if (flat !== 1) g.scale(flat, 1, 1);
  const p = g.attributes.position, c = new Float32Array(p.count * 3); // pale at the root, black at the tip
  for (let i = 0; i < p.count; i++) { const k = sm(0, 0.75, p.getY(i) / h); for (let j = 0; j < 3; j++) c[i * 3 + j] = HORN0[j] * (1 - k) + HORN1[j] * k; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.setAttribute('aHeat', new THREE.BufferAttribute(new Float32Array(p.count), 1));
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize())); g.translate(at.x, at.y, at.z);
  return g.toNonIndexed();
}
function limb(a, b, r0, r1) { // a tapering bone from a to b, with a knuckle at each end
  const d = b.clone().sub(a), L = d.length(), g = new THREE.CylinderGeometry(r1, r0, L, 8).translate(0, L / 2, 0), q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize());
  g.applyQuaternion(q); g.translate(a.x, a.y, a.z);
  const k0 = new THREE.SphereGeometry(r0 * 1.25, 8, 6).translate(a.x, a.y, a.z);
  return mergeGeometries([paint(g, COAL, 0.1), paint(k0, COAL, 0.1)]);
}
// a muscled limb segment hanging down -y, from a silhouette of [radius, y] points
function muscle(pts, sx = 0.85, sz = 1.1, heat = 0.25) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 14).scale(sx, 1, sz), p = g.attributes.position, u = g.attributes.uv, n = p.count, c = new Float32Array(n * 3), h = new Float32Array(n);
  const y0 = pts[0][1], y1 = pts[pts.length - 1][1];
  for (let i = 0; i < n; i++) { const k = (p.getY(i) - y0) / (y1 - y0), front = sm(-0.2, 0.6, p.getZ(i)); for (let j = 0; j < 3; j++) c[i * 3 + j] = (RED[j] * (1 - k * 0.8) + COAL[j] * k * 0.8) * (1 - front * 0.5) + COAL[j] * front * 0.5; h[i] = heat * (1 - k); u.setXY(i, u.getX(i) * 3, u.getY(i) * 2); }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.setAttribute('aHeat', new THREE.BufferAttribute(h, 1)); g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- the model
function buildDragon() {
  const T = textures(), U = { uT: { value: 0 }, uBend: { value: 0 }, uSag: { value: 0 }, uRip: { value: 0.5 }, uFire: { value: 0 }, uDet: T.det, uDetK: T.detK, uTear: { value: T.tear } };
  // One shader patch for every hide material: the whip tail (S-curve that swims and swings wide in a turn), lava glow in the cracks that
  // breathes and flares when he fires, a photo-scanned grit layer, and a rim of orange light from his own fire.
  const hideMat = (m, tail) => { m.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, { uT: U.uT, uBend: U.uBend, uSag: U.uSag, uFire: U.uFire, uDet: U.uDet, uDetK: U.uDetK });
    sh.vertexShader = 'uniform float uT; uniform float uBend; uniform float uSag; attribute float aHeat; varying float vHeat;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vHeat = aHeat;` + (tail ? `
      float tw = pow(clamp((-1.0 - position.z) / 14., 0., 1.), 1.2);
      transformed.y += (sin(position.z * 0.5 + uT * 2.0) * 0.55 + uSag * 4.0) * tw;
      transformed.x += (sin(position.z * 0.42 + 0.8) * 1.5 + sin(position.z * 0.36 + uT * 1.5) * 0.7 + uBend * 6.5 * tw) * tw;` : ''));
    sh.fragmentShader = 'uniform float uT; uniform float uFire; uniform float uDetK; uniform sampler2D uDet; varying float vHeat;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
      vec3 dt_ = texture2D(uDet, vMapUv * 0.41).rgb; diffuseColor.rgb *= mix(1.0, dot(dt_, vec3(0.5)), uDetK);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float pulse_ = 0.72 + 0.28 * sin(uT * 1.7 + vMapUv.y * 2.0 + vMapUv.x * 1.3);
      totalEmissiveRadiance *= (0.012 + vHeat * (1.0 + uFire * 0.8)) * pulse_;
      totalEmissiveRadiance += vec3(1.0, 0.32, 0.05) * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.5) * (0.02 + uFire * 0.55);`); };
    m.customProgramCacheKey = () => 'dragon2-hide' + (tail ? 't' : ''); return m; };
  const scaleProps = () => ({ map: T.scale, normalMap: T.scaleN, normalScale: new THREE.Vector2(2.0, 2.0), roughnessMap: T.scaleR, roughness: 1, metalness: 0, vertexColors: true, emissive: 0xffffff, emissiveMap: T.glow, emissiveIntensity: 2.6 });
  const hornProps = () => ({ map: T.horn, vertexColors: true, roughness: 0.5, metalness: 0, emissive: 0x000000 });
  const scaleMat = hideMat(new THREE.MeshStandardMaterial(scaleProps()), true), plainScale = hideMat(new THREE.MeshStandardMaterial(scaleProps()), false);
  const hornMat = hideMat(new THREE.MeshStandardMaterial(hornProps()), true), plainHorn = hideMat(new THREE.MeshStandardMaterial(hornProps()), false);
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xd6c59c, roughness: 0.42 });
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const shadow = (o) => { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; return o; };

  // body: a long whip tail -> hips -> arched back -> deep chest -> long neck. Hottest on the chest, throat and belly.
  const heatAt = (t) => 0.3 + 0.7 * sm(0.5, 0.66, t);
  const B = loft([
    { p: V(0, 0.75, -15.5), r: 0.03 }, { p: V(0, 0.62, -13.4), r: 0.085 }, { p: V(0, 0.5, -11.2), r: 0.16 }, { p: V(0, 0.4, -9.0), r: 0.26 }, { p: V(0, 0.32, -6.9), r: 0.4 }, { p: V(0, 0.3, -4.9), r: 0.58 }, { p: V(0, 0.34, -3.2), r: 0.8 },
    { p: V(0, 0.46, -1.6), r: 0.98, sx: 1.0 }, { p: V(0, 0.6, 0), r: 1.04, sx: 1.02 }, { p: V(0, 0.45, 1.5), r: 1.22, sx: 1.1, sy: 1.06 }, { p: V(0, 0.52, 2.7), r: 0.98, sx: 1.04 },
    { p: V(0, 0.95, 3.7), r: 0.62 }, { p: V(0, 1.5, 4.7), r: 0.5 }, { p: V(0, 2.0, 5.7), r: 0.45 }, { p: V(0, 2.3, 6.5), r: 0.42 }, { p: V(0, 2.38, 7.0), r: 0.42 },
  ], 120, 26, (sn, t) => hide(sn, heatAt(t)), 6, 0.5);
  body.add(shadow(new THREE.Mesh(B.geo, scaleMat)));
  // blade spines down the neck, back and tail: tallest over the shoulders, ragged in size
  const spikes = [];
  for (let i = 6; i < B.centers.length - 3; i += 2) { const s = B.centers[i], top = s.c.clone().addScaledVector(s.up, s.r * s.sy * 0.92), j = 0.75 + ((i * 7919) % 13) / 26; const h = (0.2 + s.r * 0.78) * j; spikes.push(cone(0.07 + s.r * 0.16, h, s.up.clone().addScaledVector(s.tan, -0.85), top, 6, 0.42)); }
  // the tail ends in a barbed blade
  spikes.push(cone(0.42, 1.5, V(0, 0.1, -1), V(0, 0.75, -15.4), 4, 1).scale(1, 0.2, 1).translate(0, 0.6, 0), cone(0.16, 0.7, V(0.9, 0, 0.5), V(0.1, 0.72, -15.2), 4, 1).scale(1, 0.25, 1).translate(0, 0.54, 0), cone(0.16, 0.7, V(-0.9, 0, 0.5), V(-0.1, 0.72, -15.2), 4, 1).scale(1, 0.25, 1).translate(0, 0.54, 0));
  body.add(shadow(new THREE.Mesh(mergeGeometries(spikes), hornMat)));

  // head (its own group so it can turn and aim): a long wedge skull with heavy brows, lower jaw, swept horns, cheek and chin spikes, fangs, slit eyes, the fire in its throat
  const head = new THREE.Group(); head.position.set(0, 2.38, 6.95); body.add(head);
  const SK = loft([{ p: V(0, 0.0, -0.4), r: 0.42, sx: 1.0, sy: 0.9 }, { p: V(0, 0.1, 0.1), r: 0.6, sx: 1.22, sy: 0.82 }, { p: V(0, 0.2, 0.55), r: 0.62, sx: 1.16, sy: 0.78 }, { p: V(0, 0.1, 0.98), r: 0.46, sx: 1.02, sy: 0.62 }, { p: V(0, 0.03, 1.5), r: 0.37, sx: 1.0, sy: 0.52 }, { p: V(0, 0.05, 2.0), r: 0.34, sx: 1.06, sy: 0.52 }, { p: V(0, 0.0, 2.4), r: 0.25, sx: 1, sy: 0.46 }, { p: V(0, -0.04, 2.62), r: 0.1, sx: 1, sy: 0.4 }], 36, 20, (sn) => hide(sn * 0.55 + 0.45, 0.35), 4, 0.7);
  head.add(shadow(new THREE.Mesh(SK.geo, plainScale)));
  const jaw = new THREE.Group(); jaw.position.set(0, -0.16, 0.05); head.add(jaw);
  const JW = loft([{ p: V(0, -0.02, -0.1), r: 0.36, sx: 1.3, sy: 0.5 }, { p: V(0, -0.1, 0.5), r: 0.36, sx: 1.2, sy: 0.46 }, { p: V(0, -0.1, 1.2), r: 0.27, sx: 1.1, sy: 0.42 }, { p: V(0, -0.08, 1.9), r: 0.2, sx: 1, sy: 0.4 }, { p: V(0, -0.04, 2.4), r: 0.11, sx: 1, sy: 0.4 }], 20, 16, (sn) => hide(sn * 0.75 - 0.25, 0.4), 4, 0.7);
  jaw.add(shadow(new THREE.Mesh(JW.geo, plainScale)));
  // Everything on the head grows out of the hide: each piece is placed from the real surface of the skull or jaw and sunk into it,
  // so no tooth, horn, nostril or brow can float. on(L, z, ang, depth): the surface point at length z, angle ang round the section
  // (0 = straight out to his left, PI/2 = top), pushed `depth` inside; n is the outward direction there.
  const on = (L, z, ang, depth = 0) => { const C = L.centers; let k = 0; while (k < C.length - 2 && C[k + 1].c.z < z) k++; const a = C[k], b = C[k + 1], f = clamp((z - a.c.z) / Math.max(1e-4, b.c.z - a.c.z), 0, 1);
    const r = a.r + (b.r - a.r) * f, sx = a.sx + (b.sx - a.sx) * f, sy = a.sy + (b.sy - a.sy) * f, cy = a.c.y + (b.c.y - a.c.y) * f, cs = Math.cos(ang), sn = Math.sin(ang);
    const n = V(cs / sx, sn / sy, 0).normalize(); return { p: V(cs * r * sx, cy + sn * r * sy, z).addScaledVector(n, -depth), n }; };
  const mound = (at, r, sc, col, heat = 0.1) => paint(new THREE.SphereGeometry(r, 12, 9).scale(sc[0], sc[1], sc[2]).translate(at.x, at.y, at.z), col, heat); // a swelling of the hide itself
  const hornCurve = (s, p0, d, L, r) => loft([0, 0.28, 0.55, 0.8, 1].map((k, i) => ({ p: V(p0.x + s * d[0] * L * k * (1 - 0.2 * k), p0.y + d[1] * L * k * (0.55 + 0.7 * k), p0.z + d[2] * L * k), r: r * [1, 0.86, 0.62, 0.36, 0.06][i] })), 18, 10, (sn, t) => { const k = sm(0.05, 0.8, t); return [0, 1, 2].map((j) => HORN0[j] * (1 - k) + HORN1[j] * k); }, 2, 3, true).geo.toNonIndexed();
  const horns = [], teeth = [], jteeth = [], jspk = [], lumps = [], jlumps = [], sockets = [];
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a0000, emissive: 0xff1206, emissiveIntensity: 7, roughness: 0.2 }), pupilMat = new THREE.MeshBasicMaterial({ color: 0x050200 }), darkMat = new THREE.MeshBasicMaterial({ color: 0x030101 });
  const SKIN = hide(0.9, 0.05).slice(0, 3), SIDE = hide(0.1, 0.1).slice(0, 3), GUM = [0.16, 0.02, 0.02];
  for (const s of [-1, 1]) {
    const A = (a) => (s > 0 ? a : Math.PI - a), mx = (v) => v; // mirror the angle for his right side
    // horns: rooted deep in the back of the skull, each with a swollen base of hide round it
    const h1 = on(SK, 0.02, A(1.0), 0.16), h2 = on(SK, 0.08, A(0.42), 0.14);
    horns.push(hornCurve(s, V(s * Math.abs(h1.p.x), h1.p.y, h1.p.z), [0.3, 0.42, -1], 1.9, 0.16), hornCurve(s, V(s * Math.abs(h2.p.x), h2.p.y, h2.p.z), [0.7, 0.16, -1], 1.25, 0.11));
    lumps.push(mound(on(SK, 0.02, A(1.0), 0.13).p, 0.24, [1, 0.6, 1.3], SKIN), mound(on(SK, 0.08, A(0.42), 0.12).p, 0.19, [0.6, 1, 1.3], SIDE));
    // studs on the snout, spikes on the cheek
    for (const [z, a, h, r] of [[1.12, 1.15, 0.26, 0.055], [1.55, 1.1, 0.2, 0.05], [1.95, 1.1, 0.14, 0.04]]) { const q = on(SK, z, A(a), 0.05); horns.push(cone(r, h + 0.05, V(q.n.x, q.n.y, -0.45), q.p, 6)); }
    for (const [z, a, h, r] of [[0.16, -0.12, 0.85, 0.1], [0.36, -0.42, 0.58, 0.085]]) { const q = on(SK, z, A(a), 0.1); horns.push(cone(r, h + 0.1, V(q.n.x * 0.9, q.n.y * 0.9 - 0.1, -1), q.p, 6, 1)); lumps.push(mound(on(SK, z, A(a), 0.09).p, r * 1.6, [0.7, 1, 1.4], SIDE)); }
    for (const [z, a, h, r] of [[0.5, -0.75, 0.5, 0.07], [1.2, -0.95, 0.36, 0.06]]) { const q = on(JW, z, A(a), 0.06); jspk.push(cone(r, h + 0.06, V(q.n.x * 0.6, q.n.y, -0.7), q.p, 6)); }
    // teeth: a gum line along each lip with every tooth rooted in it
    for (let i = 0; i < 10; i++) { const z = 0.8 + i * 0.165, big = i === 8 || i === 4, hh = big ? 0.34 : 0.14 + (i % 3) * 0.03, q = on(SK, z, A(-0.62), 0.045);
      teeth.push(paint(new THREE.ConeGeometry(big ? 0.05 : 0.036, hh + 0.06, 6).rotateX(Math.PI).translate(q.p.x, q.p.y - hh / 2 + 0.03, q.p.z), [1, 1, 1]));
      lumps.push(mound(q.p, 0.075, [0.75, 0.6, 1.5], GUM, 0));
      const u = on(JW, z - 0.1, A(0.62), 0.04), jh = i === 7 ? 0.26 : 0.12 + (i % 2) * 0.03;
      jteeth.push(paint(new THREE.ConeGeometry(0.032, jh + 0.05, 6).translate(u.p.x, u.p.y + jh / 2 - 0.025, u.p.z), [1, 1, 1]));
      jlumps.push(mound(u.p, 0.065, [0.75, 0.6, 1.5], GUM, 0)); }
    // brow: a heavy ridge of hide over the eye, and the eye sunk in its socket under it
    const br = on(SK, 0.7, A(0.72), 0.12); lumps.push(paint(new THREE.SphereGeometry(0.2, 12, 9).scale(0.75, 0.42, 2.0).rotateY(s * 0.22).translate(br.p.x, br.p.y, br.p.z), SKIN, 0.05));
    const ey = on(SK, 0.76, A(0.33), 0.035);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), eyeMat); e.position.copy(ey.p); e.scale.set(0.75, 0.75, 1.3); head.add(e);
    const pu = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), pupilMat); pu.position.copy(ey.p).addScaledVector(ey.n, 0.05); pu.scale.set(0.34, 1.0, 0.36); head.add(pu);
    sockets.push(mound(on(SK, 0.76, A(0.1), 0.1).p, 0.12, [0.7, 0.45, 1.7], SIDE)); // lower lid
    // nostril: a raised rim of hide on top of the snout with the dark opening set inside it
    const no = on(SK, 2.3, A(1.02), 0.03); lumps.push(mound(no.p, 0.075, [0.95, 0.75, 1.5], SKIN, 0.05));
    const nh = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), darkMat); nh.position.copy(no.p).addScaledVector(no.n, 0.035); nh.position.z += 0.045; nh.scale.set(0.8, 0.7, 1.3); head.add(nh);
  }
  head.add(shadow(new THREE.Mesh(mergeGeometries(horns), plainHorn)), new THREE.Mesh(mergeGeometries(teeth), toothMat), shadow(new THREE.Mesh(mergeGeometries([...lumps, ...sockets]), plainScale)));
  jaw.add(new THREE.Mesh(mergeGeometries(jteeth), toothMat), shadow(new THREE.Mesh(mergeGeometries(jspk), plainHorn)), shadow(new THREE.Mesh(mergeGeometries(jlumps), plainScale)));
  const throatMat = new THREE.MeshBasicMaterial({ color: 0xff8a20, transparent: true, opacity: 0 });
  const throat = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), throatMat); throat.position.set(0, -0.14, 0.5); throat.scale.set(1.05, 0.62, 2.4); head.add(throat);
  const throatLight = { intensity: 0 }; // (lit with the effect system's pooled lights: a new light in the scene would make every material recompile)

  // legs: sculpted like a real animal's. A heavy haunch that swells out of the body and tapers to the knee, a lean shin with a calf
  // behind it and a bony hock, a broad scaled foot, four long jointed toes each ending in a curved talon, and a dewclaw behind.
  const legs = [];
  const legCol = (dark) => (sn, t) => { const c = hide(sn * 0.45 + 0.2 + dark * 0.3, 0.22 * (1 - t)); return c; };
  // a limb lofted along its length (down -y after turning), `f` = how far forward each section sits, sy > 1 = deeper front to back
  const limbGeo = (st, seg, dark) => { const g = loft(st.map(([d, r, sx = 1, sy = 1, f = 0, x = 0]) => ({ p: V(x, f, d), r, sx, sy })), seg, 14, legCol(dark), 3, 1.1).geo; g.rotateX(Math.PI / 2); return g.toNonIndexed(); };
  const talon = (base, dir, L, r) => loft([0, 0.3, 0.6, 0.85, 1].map((q, n) => ({ p: V(base.x + dir.x * L * q, base.y + dir.y * L * q - L * 0.42 * q * q, base.z + dir.z * L * q), r: r * [1, 0.85, 0.6, 0.32, 0.04][n] })), 12, 8, (sn, t) => { const q = sm(0, 0.7, t); return [0, 1, 2].map((n) => HORN0[n] * (1 - q) + HORN1[n] * q); }, 2, 3, true).geo.toNonIndexed();
  for (const [x, y, z, k] of [[0.98, -0.25, 1.75, 0.82], [-0.98, -0.25, 1.75, 0.82], [0.9, -0.1, -1.5, 1.0], [-0.9, -0.1, -1.5, 1.0]]) {
    const sd = Math.sign(x), rear = z < 0, K = (a) => a.map((r) => r.map((v, n) => (n === 2 || n === 3 ? v : v * k)));
    const hip = new THREE.Group(); hip.position.set(x, y, z); body.add(hip);
    hip.add(shadow(new THREE.Mesh(mergeGeometries([
      limbGeo(K([[-0.45, 0.2, 1, 1.2, 0, -sd * 0.25], [-0.1, 0.5, 0.82, 1.35, 0.02, -sd * 0.1], [0.3, 0.6, 0.8, 1.32, 0.08], [0.72, 0.5, 0.8, 1.15, 0.1], [1.1, 0.33, 0.85, 1.05, 0.04], [1.38, 0.25, 0.95, 1.0, 0], [1.56, 0.23, 1, 1, -0.02]]), 22, 0),
      paint(new THREE.SphereGeometry(0.2 * k, 10, 8).scale(0.85, 1.1, 1.0).translate(0, -1.45 * k, 0.1 * k), hide(0.5, 0).slice(0, 3), 0.05)]), plainScale))); // kneecap
    const knee = new THREE.Group(); knee.position.set(0, -1.45 * k, 0); hip.add(knee);
    knee.add(shadow(new THREE.Mesh(limbGeo(K([[-0.14, 0.2, 1, 1], [0.12, 0.3, 0.85, 1.3, -0.07], [0.42, 0.27, 0.85, 1.2, -0.06], [0.78, 0.17, 0.9, 1.05, -0.01], [1.08, 0.135, 1, 1, 0], [1.26, 0.17, 1.05, 1.15, -0.03], [1.38, 0.15, 1, 1, 0]]), 18, 0.4), plainScale)));
    knee.add(shadow(new THREE.Mesh(cone(0.07 * k, 0.42 * k, V(0, 0.35, -1), V(0, -1.24 * k, -0.12 * k), 6), plainHorn))); // spur on the hock
    const foot = new THREE.Group(); foot.position.set(0, -1.3 * k, 0); knee.add(foot);
    const pads = [loft([{ p: V(0, 0.02, -0.2 * k), r: 0.15 * k, sx: 1, sy: 0.9 }, { p: V(0, -0.03 * k, 0.05 * k), r: 0.2 * k, sx: 1.35, sy: 0.7 }, { p: V(0, -0.07 * k, 0.3 * k), r: 0.19 * k, sx: 1.7, sy: 0.55 }, { p: V(0, -0.1 * k, 0.46 * k), r: 0.12 * k, sx: 2.2, sy: 0.5 }], 10, 12, legCol(0.6), 3, 1.5).geo.toNonIndexed()], claws = [];
    for (const a of [-0.6, -0.2, 0.2, 0.6]) { // a toe: two knuckled bones, then the talon
      const dx = Math.sin(a), dz = Math.cos(a), b = V(dx * 0.24 * k, -0.08 * k, 0.12 * k + dz * 0.26 * k), L = (Math.abs(a) < 0.3 ? 0.56 : 0.46) * k;
      pads.push(loft([{ p: b.clone(), r: 0.095 * k }, { p: V(b.x + dx * L * 0.45, b.y + 0.035 * k, b.z + dz * L * 0.45), r: 0.105 * k, sy: 0.85 }, { p: V(b.x + dx * L * 0.75, b.y - 0.01 * k, b.z + dz * L * 0.75), r: 0.075 * k, sy: 0.85 }, { p: V(b.x + dx * L, b.y - 0.03 * k, b.z + dz * L), r: 0.085 * k, sy: 0.9 }], 10, 9, legCol(0.7), 2, 2).geo.toNonIndexed());
      claws.push(talon(V(b.x + dx * L * 0.94, b.y - 0.02 * k, b.z + dz * L * 0.94), V(dx, 0.12, dz), 0.5 * k, 0.07 * k));
    }
    pads.push(loft([{ p: V(0, -0.02 * k, -0.1 * k), r: 0.09 * k }, { p: V(-sd * 0.05 * k, 0, -0.32 * k), r: 0.07 * k }], 4, 8, legCol(0.7), 2, 2).geo.toNonIndexed());
    claws.push(talon(V(-sd * 0.05 * k, 0, -0.3 * k), V(0, 0.1, -1), 0.34 * k, 0.055 * k));
    foot.add(shadow(new THREE.Mesh(mergeGeometries(pads), plainScale)), shadow(new THREE.Mesh(mergeGeometries(claws), plainHorn)));
    legs.push({ hip, knee, foot, rear: z < 0 });
  }

  // wings: bat-style and huge. An arm (shoulder S, elbow E, wrist W), four long fingers from the wrist, thin skin stretched between them and back to the hip.
  // The trailing edge is torn: the shader cuts ragged notches and holes out of it. Thin skin lets firelight through and glows orange.
  const S = V(0, 0, 0), E = V(3.7, 0.3, 0.95), W = V(7.3, 0.5, 2.1), T1 = V(14.2, 0.2, 1.3), T2 = V(13.4, 0, -2.7), T3 = V(11.0, 0, -5.9), T4 = V(7.9, 0, -7.4), ET = V(4.2, 0, -5.6), BH = V(0.3, -0.1, -4.6);
  const mid = (a, b, pull) => a.clone().add(b).multiplyScalar(0.5).lerp(W, pull);
  const M12 = mid(T1, T2, 0.3), M23 = mid(T2, T3, 0.3), M34 = mid(T3, T4, 0.3), M4E = mid(T4, ET, 0.34), MEB = ET.clone().add(BH).multiplyScalar(0.5).lerp(E, 0.36);
  const skinMat = new THREE.MeshStandardMaterial({ map: T.skin, color: 0xd41c12, roughness: 0.66, metalness: 0, side: THREE.DoubleSide, emissive: 0x000000 });
  skinMat.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, { uT: U.uT, uRip: U.uRip, uFire: U.uFire, uTear: U.uTear });
    sh.vertexShader = 'uniform float uT; uniform float uRip; attribute float aTrail; attribute float aEdge; varying float vTr; varying float vEdge;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vTr = aTrail; vEdge = aEdge;
      transformed.y += (sin(position.x * 1.1 + position.z * 0.9 - uT * 6.) * 0.16 + sin(position.x * 2.3 - position.z * 1.7 - uT * 9.) * 0.06) * uRip * aTrail - aTrail * aTrail * 0.55;`);
    sh.fragmentShader = 'uniform float uFire; uniform sampler2D uTear; varying float vTr; varying float vEdge;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
      float n1_ = texture2D(uTear, vMapUv * 1.9).r, n2_ = texture2D(uTear, vMapUv * 0.8 + 0.37).r;
      if (vEdge < n1_ * n1_ * 1.5 * smoothstep(0.25, 0.7, n2_)) discard;
      if (n1_ > 0.74 && n2_ > 0.6 && vTr > 0.6 && vEdge < 2.6) discard;
      float vein_ = texture2D(map, vMapUv).g * 2.2;
      diffuseColor.rgb *= mix(0.4, 1.0, vTr);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(1.0, 0.16, 0.02) * vTr * vTr * clamp(vein_ * vein_ * 3.0, 0.0, 1.6) * (0.2 + uFire * 0.75);
      totalEmissiveRadiance += vec3(0.5, 0.035, 0.01) * vTr * (0.22 + uFire * 0.3);
      totalEmissiveRadiance += vec3(1.0, 0.32, 0.05) * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.5) * uFire * 0.5;`); };
  skinMat.customProgramCacheKey = () => 'dragon2-skin';
  const membrane = (tris, bones, trail) => {
    let list = tris; // split every triangle three times so the skin has enough points to ripple and billow
    for (let k = 0; k < 3; k++) { const out = []; for (const [a, b, c] of list) { const ab = a.clone().add(b).multiplyScalar(0.5), bc = b.clone().add(c).multiplyScalar(0.5), ca = c.clone().add(a).multiplyScalar(0.5); out.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]); } list = out; }
    const pos = [], uv = [], tr = [], ed = [], seg = new THREE.Line3(), q = V(), near = (p, segs) => { let d = 99; for (const [a, b] of segs) { seg.set(a, b); seg.closestPointToPoint(p, true, q); d = Math.min(d, q.distanceTo(p)); } return d; };
    for (const t of list) for (const p of t) { pos.push(p.x, p.y, p.z); uv.push(p.x / 5, p.z / 5); tr.push(clamp(near(p, bones) / 1.3, 0, 1)); ed.push(near(p, trail)); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('aTrail', new THREE.Float32BufferAttribute(tr, 1)); g.setAttribute('aEdge', new THREE.Float32BufferAttribute(ed, 1));
    g.computeVertexNormals(); return g;
  };
  const wings = [];
  for (const side of [1, -1]) {
    const mount = new THREE.Group(); mount.position.set(0.8 * side, 1.25, 1.9); mount.scale.x = side; body.add(mount);
    const inner = new THREE.Group(); mount.add(inner);
    inner.add(shadow(new THREE.Mesh(membrane([[S, E, BH], [E, MEB, BH], [E, ET, MEB], [E, W, ET]], [[S, E], [E, W], [E, ET], [W, ET], [S, BH]], [[ET, MEB], [MEB, BH]]), skinMat)));
    inner.add(shadow(new THREE.Mesh(mergeGeometries([limb(S, E, 0.36, 0.24), limb(E, W, 0.24, 0.16), limb(E, ET, 0.11, 0.035), cone(0.1, 0.75, V(0.3, 0.3, 1), W, 6)]), plainScale)));
    const outer = new THREE.Group(); outer.position.copy(W); inner.add(outer);
    const o = (p) => p.clone().sub(W), O = V(0, 0, 0), tips = [T1, M12, T2, M23, T3, M34, T4, M4E, ET].map(o);
    const tris = []; for (let i = 0; i < tips.length - 1; i++) tris.push([O, tips[i], tips[i + 1]]);
    const trail = []; for (let i = 0; i < tips.length - 1; i++) trail.push([tips[i], tips[i + 1]]);
    outer.add(shadow(new THREE.Mesh(membrane(tris, [[O, o(T1)], [O, o(T2)], [O, o(T3)], [O, o(T4)], [O, o(ET)]], trail), skinMat)));
    outer.add(shadow(new THREE.Mesh(mergeGeometries([limb(O, o(T1), 0.15, 0.03), limb(O, o(T2), 0.13, 0.03), limb(O, o(T3), 0.12, 0.03), limb(O, o(T4), 0.11, 0.03), cone(0.05, 0.5, o(T1).normalize(), o(T1), 5), cone(0.05, 0.45, o(T2).normalize(), o(T2), 5), cone(0.05, 0.45, o(T3).normalize(), o(T3), 5), cone(0.05, 0.4, o(T4).normalize(), o(T4), 5)]), plainScale)));
    wings.push({ inner, outer, axis: ET.clone().sub(W).normalize(), tips: [o(T1), o(T2), o(T3), o(T4)] });
  }
  return { root, body, head, jaw, throat, throatMat, throatLight, legs, wings, U, mats: [scaleMat, hornMat, plainScale, plainHorn, toothMat, eyeMat, pupilMat, darkMat, throatMat, skinMat] };
}

// ---------------------------------------------------------------- flying it
// o: { owner(): {x,y,z} | null, targets(): [{x,y,z,h,r,kind}], dur, burn(point) (caster only, five times a second while the fire lands), yaw }
export function spawnDragon(g, o) {
  const fx = g.fx, scene = g.scene, D = buildDragon(), root = D.root, dur = o.dur || 16;
  const own0 = o.owner() || { x: 0, y: 0, z: 0 };
  const ground = (x, z) => g.world.heightAt(x, z);
  const yaw0 = o.yaw || 0, sx = own0.x + Math.sin(yaw0) * 7 + Math.cos(yaw0) * 3, sz = own0.z + Math.cos(yaw0) * 7 - Math.sin(yaw0) * 3;
  const SIZE = 1.3, P = V(sx, ground(sx, sz), sz), GROUND = 2.75; // GROUND: how high his body rides when he crouches on all fours
  const st = { mode: 'summon', yaw: yaw0, yawRate: 0, roll: 0, pitch: 0, speed: 0, vy: 0, ph: 0, amp: 0, freq: 1, fold: 1.7, lift: 1.0, sweep: 0.5, tuck: 0, glide: 0, beats: 0, lastSin: 0,
    atk: null, fireCd: 1.2, pass: 'approach', passT: 0, ext: V(), roarT: 0.35, bob: 0, hy: 0, hp: 0.1, jaw: 0, glow: 0, aim: V(), patches: [], patchT: 0, burnT: 0, tgt: null, tgtT: 0, crouch: 0, gone: false };
  st.tuck = 0; st.fold = 1.0; st.lift = 0.85; st.sweep = 0.35;
  root.position.copy(P); root.position.y += GROUND; root.scale.setScalar(0.05); scene.add(root);
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
  const stream = (dt, A) => { // the breath: a long thick stream, white-yellow at the core, orange then red at the edges, widening as it travels, embers flying off it, dark smoke rolling off the end
    tmp.copy(A).sub(mouth); const L = Math.min(40, tmp.length()), d = tmp.normalize();
    for (let i = 0; i < fx.n(80); i++) {
      const s = Math.pow(Math.random(), 0.75) * L, k = s / L, w = 0.5 + s * 0.24, edge = Math.random(), core = edge < 0.4;
      const c0 = core ? (k < 0.45 ? [1, 0.95, 0.72, 0.65] : [1, 0.72, 0.2, 0.6]) : k < 0.45 ? [1, 0.48, 0.06, 0.6] : [0.92, 0.17, 0.02, 0.55];
      const ww = core ? w * 0.4 : w;
      fx.fire.emit({ p: [mouth.x + d.x * s + rnd(-ww, ww), mouth.y + d.y * s + rnd(-ww, ww), mouth.z + d.z * s + rnd(-ww, ww)], v: [d.x * 13 + rnd(-1.5, 1.5) * k, d.y * 13 + 0.8 + k * 5, d.z * 13 + rnd(-1.5, 1.5) * k], life: rnd(0.22, 0.4) + k * 0.28, s0: (core ? 0.7 : 1.1) + s * 0.3, s1: 0.4 + k * 1.6, c0, c1: [0.5, 0.03, 0, 0], turb: 2 + k * 5, rotV: rnd(-3, 3), drag: 1 + k * 2 });
    }
    for (let i = 0; i < fx.n(6); i++) { const s = Math.random() * L * 0.4; fx.glow.emit({ p: [mouth.x + d.x * s, mouth.y + d.y * s, mouth.z + d.z * s], v: [d.x * 28, d.y * 28, d.z * 28], life: 0.14, s0: 0.8 + s * 0.14, s1: 0.3, c0: [1, 0.97, 0.8, 0.75], c1: [1, 0.6, 0.15, 0] }); }
    for (let i = 0; i < fx.n(4); i++) { const s = Math.random() * L, w = 0.3 + s * 0.2; fx.spark.emit({ p: [mouth.x + d.x * s + rnd(-w, w), mouth.y + d.y * s + rnd(-w, w), mouth.z + d.z * s + rnd(-w, w)], v: [d.x * 9 + rnd(-4, 4), d.y * 9 + rnd(1, 6), d.z * 9 + rnd(-4, 4)], life: rnd(0.6, 1.3), s0: 0.13, s1: 0.02, c0: [1, 0.7, 0.2, 1], c1: [0.85, 0.12, 0, 0], g: 4, turb: 2 }); }
    for (let i = 0; i < 4; i++) fx.smoke.emit({ p: [A.x + rnd(-2, 2), A.y + rnd(0.5, 2.5), A.z + rnd(-2, 2)], v: [d.x * 6 + rnd(-1, 1), rnd(2.5, 5.5), d.z * 6 + rnd(-1, 1)], life: rnd(1.5, 2.4), s0: 1.8, s1: 6.5, c0: [0.03, 0.026, 0.024, 0.65], c1: [0.12, 0.11, 0.11, 0], rotV: rnd(-1, 1) });
    for (let i = 0; i < fx.n(3); i++) fx.spark.emit({ p: [A.x + rnd(-1, 1), A.y + 0.3, A.z + rnd(-1, 1)], v: [rnd(-5, 5), rnd(3, 9), rnd(-5, 5)], life: rnd(0.5, 1), s0: 0.14, s1: 0.02, c0: [1, 0.6, 0.15, 1], c1: [0.8, 0.1, 0, 0], g: 6 });
    fireLight.position.set(A.x, A.y + 1.8, A.z); fireLight.intensity = 70 * (0.85 + 0.3 * Math.random());
    // it leaves the ground burning where it lands
    st.patchT -= dt;
    if (st.patchT <= 0 && A.y - ground(A.x, A.z) < 3) { st.patchT = 0.16; st.patches.push({ x: A.x + rnd(-1.2, 1.2), z: A.z + rnd(-1.2, 1.2), t: rnd(2.6, 3.6) }); if (st.patches.length > 16) st.patches.shift(); }
  };

  const fxh = fx.add({
    dur: dur + 5,
    update: (dt, t) => {
      const own = o.owner();
      if (!own && !st.gone) { st.gone = true; st.goneAt = t; }
      if (t > dur && !st.gone) { st.gone = true; st.goneAt = t; }
      const O = own || own0;
      D.U.uT.value = t;
      let wantAmp = 0.5, wantFreq = 0.85, hard = false;
      // ---------------- summon: inside the fire, crouching, wings folded
      if (st.mode === 'summon') {
        const k = Math.min(1, t / 0.35);
        root.scale.setScalar(SIZE * (0.05 + 0.95 * k * k * (3 - 2 * k)));
        for (let i = 0; i < fx.n(30); i++) { const a = t * 7 + i * 0.21 + Math.random(), r = 8.5 - t * 0.6, h = Math.pow(Math.random(), 1.6) * 11 * Math.min(1, t * 1.5); fx.fire.emit({ p: [P.x + Math.cos(a) * r, P.y + h, P.z + Math.sin(a) * r], v: [-Math.sin(a) * 9, rnd(3, 7), Math.cos(a) * 9], life: rnd(0.45, 0.8), s0: rnd(1.8, 3.2), s1: 0.4, c0: [1, 0.48, 0.07, 0.6], c1: [0.75, 0.05, 0, 0], turb: 3, rotV: rnd(-2, 2) }); }
        for (let i = 0; i < fx.n(3); i++) { const a = Math.random() * 6.28; fx.spark.emit({ p: [P.x + Math.cos(a) * 6, P.y + 0.3, P.z + Math.sin(a) * 6], v: [-Math.sin(a) * 6, rnd(5, 12), Math.cos(a) * 6], life: rnd(0.6, 1.2), s0: 0.16, s1: 0.02, c0: [1, 0.65, 0.2, 1], c1: [0.9, 0.15, 0, 0], g: 3 }); }
        // Emergence: he bursts out of the fire crouched on the ground, wings half folded over his back, head low. He looks up, sinks
        // into his legs, then launches.
        if (!st.burst) { st.burst = true; fx.flash([P.x, P.y + 2, P.z], 0xffa040, 60, 0.6, 40); g.shake && Math.hypot(g.camera.position.x - P.x, g.camera.position.z - P.z) < 30 && g.shake(0.4);
          for (let i = 0; i < fx.n(70); i++) { const a = Math.random() * 6.28, sp = rnd(3, 13); fx.fire.emit({ p: [P.x + Math.cos(a) * rnd(0, 3), P.y + rnd(0.2, 2.5), P.z + Math.sin(a) * rnd(0, 3)], v: [Math.cos(a) * sp, rnd(4, 15), Math.sin(a) * sp], life: rnd(0.5, 1.0), s0: rnd(2.2, 4.5), s1: 0.5, c0: [1, 0.62, 0.14, 0.7], c1: [0.8, 0.06, 0, 0], turb: 3, rotV: rnd(-2, 2), drag: 1.2 }); }
          for (let i = 0; i < fx.n(30); i++) { const a = Math.random() * 6.28, sp = rnd(4, 14); fx.spark.emit({ p: [P.x, P.y + 1, P.z], v: [Math.cos(a) * sp, rnd(5, 16), Math.sin(a) * sp], life: rnd(0.8, 1.6), s0: 0.16, s1: 0.02, c0: [1, 0.7, 0.2, 1], c1: [0.9, 0.15, 0, 0], g: 9 }); }
          for (let i = 0; i < 10; i++) fx.smoke.emit({ p: [P.x + rnd(-3, 3), P.y + rnd(1, 4), P.z + rnd(-3, 3)], v: [rnd(-2, 2), rnd(3, 6), rnd(-2, 2)], life: rnd(1.5, 2.5), s0: 3, s1: 9, c0: [0.03, 0.026, 0.024, 0.6], c1: [0.12, 0.11, 0.11, 0], rotV: rnd(-1, 1) }); }
        const dip = t > 1.15 ? ease01((t - 1.15) / 0.45) : 0;
        st.crouch = 0.35 + dip * 0.65;
        root.position.set(P.x, P.y + (GROUND - st.crouch * 0.55) * (root.scale.x / SIZE), P.z);
        st.lift += ((t > 1.2 ? 1.05 : 0.85) - st.lift) * Math.min(1, dt * 5); st.fold += ((t > 1.2 ? 0.55 : 1.0) - st.fold) * Math.min(1, dt * 5); st.sweep += ((t > 1.2 ? 0.1 : 0.35) - st.sweep) * Math.min(1, dt * 5);
        st.hp += ((t < 0.7 ? 0.45 : -0.3) - st.hp) * Math.min(1, dt * 4); st.jaw += ((t > 0.7 && t < 1.4 ? 0.55 : 0) - st.jaw) * Math.min(1, dt * 8);
        if (t >= 1.6) { st.mode = 'takeoff'; st.vy = 10; st.speed = 5; fx.dustBurst && fx.dustBurst([P.x, P.y, P.z], 2.5, [0.35, 0.3, 0.26]); st.modeT = t; g.audio.play('wing', vol()); }
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
        } else if (st.gone) { goalX = pos.x + Math.sin(st.yaw) * 20; goalZ = pos.z + Math.cos(st.yaw) * 20; goalY = pos.y + 1; wantSpeed = 3; st.atk = null; }
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
        if (hard) { wantAmp = 1.0; wantFreq = st.mode === 'takeoff' ? 1.25 : 1.05; st.glide = 0; st.beats = 0; }
        else if (st.atk) { wantAmp = 0.7; wantFreq = 0.75; st.glide = 0; }
        else if (st.glide > 0) { st.glide -= dt; wantAmp = 0.05; wantFreq = 0.5; }
        else { wantAmp = 0.8; wantFreq = 0.58; if (st.beats >= 3) { st.beats = 0; st.glide = rnd(2.0, 3.0); } }

        // ---------------- fire
        st.fireCd -= dt;
        if (!st.atk && T && st.mode === 'fly' && !st.gone && st.fireCd <= 0 && st.pass === 'approach') {
          const d = Math.hypot(T.x - pos.x, T.z - pos.z);
          if (d > 15 && d < 40 && Math.abs(dy) < 0.5) { st.atk = { t: 0, sw: Math.random() < 0.5 ? 1 : -1, lit: false }; }
        }
        if (st.atk) {
          const A = st.atk; A.t += dt;
          if (T) { const px = Math.cos(st.yaw), pz = -Math.sin(st.yaw), sw = Math.sin(clamp((A.t - 0.75) / 1.9, 0, 1) * Math.PI - Math.PI / 2) * 3.2 * A.sw; st.aim.set(T.x + px * sw, T.y + (T.y - ground(T.x, T.z) > 2.5 ? (T.h || 2) * 0.5 : 0.25), T.z + pz * sw); }
          if (A.t >= 0.75 && A.t < 2.65) {
            if (!A.lit) { A.lit = true; g.audio.play('inferno', vol()); g.audio.play('fire_cast', vol()); }
            D.head.localToWorld(mouth.set(0, -0.14, 2.45)); st.fired = (st.fired || 0) + 1;
            stream(dt, st.aim);
            st.burnT -= dt; if (st.burnT <= 0) { st.burnT = 0.2; o.burn && o.burn([st.aim.x, st.aim.y, st.aim.z]); }
          }
          if (A.t >= 2.75) { st.atk = null; st.fireCd = rnd(1.1, 1.7); }
        }
      }
      // ---------------- wings, body, head, legs
      st.amp += (wantAmp - st.amp) * Math.min(1, dt * 3); st.freq += (wantFreq - st.freq) * Math.min(1, dt * 3);
      st.ph += dt * st.freq * 6.2832;
      const sn = Math.sin(st.ph), cs = Math.cos(st.ph); // cs > 0: the wings are coming up
      if (st.lastSin > 0 && sn <= 0) st.beats++;
      if (st.lastCs !== undefined && st.lastCs >= 0 && cs < 0 && st.amp > 0.35) g.audio.play('wing', vol() * (0.35 + st.amp * 0.6)); // the downstroke
      st.lastSin = sn; st.lastCs = cs;
      const fly = st.mode !== 'summon';
      const wantLift = fly ? 0.2 + sn * st.amp * 0.72 : st.lift, wantFold = fly ? 0.06 + Math.max(0, cs) * st.amp * 0.5 + (1 - Math.min(1, st.amp * 3)) * 0.02 : st.fold, wantSweep = fly ? Math.max(0, cs) * st.amp * 0.35 - 0.05 : 0.55;
      if (fly) { st.lift += (wantLift - st.lift) * Math.min(1, dt * 9); st.fold += (wantFold - st.fold) * Math.min(1, dt * 8); }
      st.sweep += (wantSweep - st.sweep) * Math.min(1, dt * 8);
      for (const w of D.wings) { w.inner.rotation.set(0, st.sweep, st.lift, 'ZYX'); w.outer.quaternion.setFromAxisAngle(w.axis, st.fold); }
      D.U.uRip.value = 0.35 + Math.abs(cs) * st.amp * 1.3;
      st.bob = fly ? -sn * st.amp * 0.6 : 0; // up on the downstroke, down on the upstroke
      D.body.position.y = st.bob;
      root.rotation.set(st.pitch + (fly ? cs * st.amp * 0.035 : 0), st.yaw, st.roll, 'YXZ');
      D.U.uBend.value += (-st.yawRate * 0.55 - D.U.uBend.value) * Math.min(1, dt * 1.6); D.U.uSag.value += (-st.vy * 0.02 - D.U.uSag.value) * Math.min(1, dt * 2);
      for (const L of D.legs) { const sw = Math.sin(t * 1.3 + (L.rear ? 1 : 0)) * 0.05 - cs * st.amp * 0.06; // tucked back, swaying a little with each beat, claws hanging
        const k = st.tuck, c = st.mode === 'summon' ? st.crouch : 0.3; // k 0: standing crouched on the ground, 1: tucked back in flight
        const ga = L.rear ? 0.75 + c * 0.25 : -0.6 - c * 0.2, gb = L.rear ? -1.45 - c * 0.45 : 1.1 + c * 0.4;
        const ta = (L.rear ? 1.2 : 1.0) + sw, tb = (L.rear ? -1.55 : -1.5) - sw;
        L.hip.rotation.x = ga + (ta - ga) * k; L.knee.rotation.x = gb + (tb - gb) * k; L.foot.rotation.x = (-(ga + gb) + 0.25) * (1 - k) + 0.95 * k; }
      // head: looks where he is going, rears back and opens wide before the fire, then follows the stream
      let hy = clamp(st.yawRate * 0.5, -0.5, 0.5), hp = st.mode === 'summon' ? st.hp : 0.3 - st.pitch * 0.6, jaw = st.mode === 'summon' ? st.jaw : 0.04, glow = 0;
      if (st.atk) {
        const A = st.atk;
        if (A.t < 0.75) { const k = A.t / 0.75; hp = -0.55 * Math.sin(k * Math.PI * 0.5); jaw = 0.75 * k; glow = k; }
        else { D.head.parent.worldToLocal(tmp2.copy(st.aim)).sub(D.head.position); hy = clamp(Math.atan2(tmp2.x, tmp2.z), -1.1, 1.1); hp = clamp(Math.atan2(-tmp2.y, Math.hypot(tmp2.x, tmp2.z)), -0.5, 1.35); jaw = 0.8; glow = A.t < 2.65 ? 1.3 : 0.4; }
      }
      if (st.mode !== 'summon') { st.hy += (hy - st.hy) * Math.min(1, dt * 6); st.hp += (hp - st.hp) * Math.min(1, dt * 7); st.jaw += (jaw - st.jaw) * Math.min(1, dt * 9); }
      st.glow += (glow - st.glow) * Math.min(1, dt * 7);
      D.head.rotation.set(st.hp, st.hy, 0, 'YXZ'); D.jaw.rotation.x = st.jaw;
      { const firing = st.atk && st.atk.t >= 0.6 && st.atk.t < 2.7; D.U.uFire.value += ((firing ? 1 : st.atk ? 0.45 : st.mode === 'summon' ? 0.8 : 0) - D.U.uFire.value) * Math.min(1, dt * 5); }
      D.throatMat.opacity = Math.min(1, st.glow); D.throat.visible = st.glow > 0.02; D.throatLight.intensity = st.glow * 26;
      if (!st.atk || st.atk.t < 0.75 || st.atk.t > 2.65) fireLight.intensity *= Math.max(0, 1 - dt * 5);
      // (roar removed, Nutty 2026-11-12: no sound, no shake, no roaring pose)
      // aura: small flames and embers lick off the wings, back and tail while he flies
      if (!st.gone) for (let i = 0; i < fx.n(9); i++) {
        const r = Math.random();
        if (r < 0.5) { const w = D.wings[i & 1], tip = w.tips[(Math.random() * 4) | 0]; w.outer.localToWorld(tmp.copy(tip).multiplyScalar(0.25 + Math.random() * 0.75)); }
        else if (r < 0.8) D.body.localToWorld(tmp.set(rnd(-0.3, 0.3), 1.3 + rnd(0, 0.5), rnd(-3, 5)));
        else { const z = rnd(-15, -5), tw = Math.pow(clamp((-1 - z) / 14, 0, 1), 1.2); D.body.localToWorld(tmp.set((Math.sin(z * 0.42 + 0.8) * 1.5 + Math.sin(z * 0.36 + t * 1.5) * 0.7 + D.U.uBend.value * 6.5 * tw) * tw, 0.6 + (Math.sin(z * 0.5 + t * 2) * 0.55 + D.U.uSag.value * 4) * tw, z)); }
        const bx = -Math.sin(st.yaw) * st.speed * 0.35, bz = -Math.cos(st.yaw) * st.speed * 0.35;
        if (Math.random() < 0.7) fx.fire.emit({ p: [tmp.x, tmp.y, tmp.z], v: [bx + rnd(-0.6, 0.6), rnd(0.8, 2.4), bz + rnd(-0.6, 0.6)], life: rnd(0.4, 0.8), s0: rnd(0.8, 1.7), s1: 0.15, c0: [1, 0.5, 0.08, 0.6], c1: [0.7, 0.05, 0, 0], turb: 2.5, rotV: rnd(-3, 3) });
        else fx.spark.emit({ p: [tmp.x, tmp.y, tmp.z], v: [bx * 1.5 + rnd(-1.5, 1.5), rnd(-1, 2.5), bz * 1.5 + rnd(-1.5, 1.5)], life: rnd(0.7, 1.5), s0: 0.11, s1: 0.02, c0: [1, 0.62, 0.18, 1], c1: [0.85, 0.12, 0, 0], g: 2.5, turb: 2 });
      }
      // burning ground
      for (let i = st.patches.length - 1; i >= 0; i--) { const q = st.patches[i]; q.t -= dt; if (q.t <= 0) { st.patches.splice(i, 1); continue; }
        if (Math.random() < 0.6) { const y = ground(q.x, q.z); fx.fire.emit({ p: [q.x + rnd(-0.8, 0.8), y + 0.25, q.z + rnd(-0.8, 0.8)], v: [rnd(-0.4, 0.4), rnd(1.6, 3.4), rnd(-0.4, 0.4)], life: rnd(0.4, 0.75), s0: rnd(0.8, 1.4) * Math.min(1, q.t), s1: 0.15, c0: [1, 0.45, 0.07, 0.5], c1: [0.7, 0.05, 0, 0], turb: 2, rotV: rnd(-2, 2) }); } }
      if (st.patches.length && fireLight.intensity < 14) { const q = st.patches[st.patches.length - 1]; fireLight.position.set(q.x, ground(q.x, q.z) + 1.5, q.z); fireLight.intensity = 14 * (0.8 + 0.4 * Math.random()); }
      lightT -= dt;
      if (lightT <= 0) { lightT = 0.09;
        if (fireLight.intensity > 2) fx.flash([fireLight.position.x, fireLight.position.y, fireLight.position.z], 0xff8a30, fireLight.intensity * 0.6, 0.2, 34);
        if (st.glow > 0.15) { D.head.getWorldPosition(tmp); fx.flash([tmp.x, tmp.y - 0.4, tmp.z], 0xff7a20, st.glow * 16, 0.2, 16); } }
      // leaving: he climbs away and burns out
      // The end: he does not fly away. A dark cloud boils up over his whole body, shot through with glowing embers; he burns down inside
      // it, and the cloud and its embers hang, drift and fade after he is gone.
      if (st.gone) {
        const e = t - st.goneAt, k = clamp(1 - (e - 0.5) / 1.1, 0, 1);
        if (!st.cloud) { st.cloud = []; root.updateMatrixWorld(true); g.audio.play('inferno', vol() * 0.7);
          for (let i = 0; i < 46; i++) { const r = Math.random();
            if (r < 0.45) { const w = D.wings[i & 1], tip = w.tips[(Math.random() * 4) | 0]; st.cloud.push({ o: w.outer, l: tip.clone().multiplyScalar(Math.random()), w: V() }); }
            else st.cloud.push({ o: D.body, l: V(rnd(-1, 1), rnd(-0.6, 1.6), rnd(-13, 8.5)), w: V() }); }
          fx.flash([root.position.x, root.position.y, root.position.z], 0xff5a18, 30, 0.5, 30); }
        root.scale.setScalar(SIZE * Math.max(0.001, k)); root.visible = k > 0.01;
        const life = clamp(1 - (e - 1.6) / 2.2, 0, 1), dense = e < 1.6 ? 1 : life;
        if (k > 0.35) { root.updateMatrixWorld(true); for (const q of st.cloud) q.o.localToWorld(q.w.copy(q.l)); } // the cloud wraps him while he is there, then hangs where he was
        st.speed *= Math.max(0, 1 - dt * 3);
        for (const q of st.cloud) { const c = q.w; if (k <= 0.35) c.y += dt * 0.5;
          if (Math.random() < 0.34 * dense) fx.smoke.emit({ p: [c.x + rnd(-1.4, 1.4), c.y + rnd(-1, 1), c.z + rnd(-1.4, 1.4)], v: [rnd(-0.8, 0.8), rnd(0.3, 1.6), rnd(-0.8, 0.8)], life: rnd(1.6, 2.8), s0: rnd(2.5, 4), s1: rnd(6, 9), c0: [0.022, 0.018, 0.018, 0.78], c1: [0.07, 0.06, 0.06, 0], rotV: rnd(-0.8, 0.8), drag: 0.8 });
          if (Math.random() < 0.75 * dense) fx.spark.emit({ p: [c.x + rnd(-1.8, 1.8), c.y + rnd(-1.4, 1.4), c.z + rnd(-1.8, 1.8)], v: [rnd(-1.6, 1.6), rnd(-0.6, 2.2), rnd(-1.6, 1.6)], life: rnd(1.4, 3.0), s0: rnd(0.12, 0.3), s1: 0.03, c0: [1, 0.62, 0.16, 1], c1: [0.8, 0.08, 0, 0], g: 0.8, turb: 3.5, drag: 0.6 });
          if (e < 1.3 && Math.random() < 0.1) fx.fire.emit({ p: [c.x + rnd(-1, 1), c.y + rnd(-0.8, 0.8), c.z + rnd(-1, 1)], v: [rnd(-0.6, 0.6), rnd(0.6, 2), rnd(-0.6, 0.6)], life: rnd(0.4, 0.8), s0: rnd(1.2, 2.4), s1: 0.3, c0: [1, 0.36, 0.05, 0.5], c1: [0.5, 0.03, 0, 0], turb: 3, rotV: rnd(-2, 2) }); }
        if (e > 4.2) return false; }
    },
    dispose: () => { fxh.done = true; scene.remove(root); root.traverse((q) => { if (q.geometry) q.geometry.dispose(); }); for (const m of D.mats) m.dispose(); },
  });
  return { root, state: st, fx: fxh, parts: D };
}
