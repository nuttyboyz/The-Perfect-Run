// The Elemental Vault: the look of the extra cooldowns a player can swap in on the Element page (Customize).
// Every function draws the effect; the caster passes callbacks that do the damage, everyone else just watches.
import * as THREE from 'three';
import * as TX from './textures.js';
import { rockGeos, rockMat, iceGeo, iceMat } from './elements.js';
import { groundTex, scanMat } from './scan.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// A photo texture from the scan folder (repeats, so it can tile round a model).
const PHOTO = new Map(), photoLoader = new THREE.TextureLoader();
function photo(file, rx = 1, ry = 1) {
  const k = file + rx + ',' + ry;
  if (PHOTO.has(k)) return PHOTO.get(k);
  const t = photoLoader.load('assets/scan/' + file);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8;
  PHOTO.set(k, t); return t;
}
// The scanned ground layer `id` as a surface for a model: photo albedo and its normal map.
function scanSurface(id, rx, ry, o = {}) {
  const g = groundTex(id), map = g.albedo.clone(), nor = g.normal.clone();
  for (const t of [map, nor]) { t.repeat.set(rx, ry); t.needsUpdate = true; }
  g.wait.then(() => { map.image = g.albedo.image; nor.image = g.normal.image; map.needsUpdate = nor.needsUpdate = true; });
  return new THREE.MeshStandardMaterial({ map, normalMap: nor, roughness: 0.9, ...o });
}

const rnd = (a, b) => a + Math.random() * (b - a);

// A skull for Homing Fireballs: cranium, cheekbones, jaw, black sockets. It faces +Z.
let SKULL = null;
function skull() {
  if (!SKULL) {
    const bone = scanSurface('rock_face', 1.5, 1, { color: 0xfff0d2, emissive: 0xff5a08, emissiveIntensity: 0.22, roughness: 0.72, normalScale: new THREE.Vector2(1.6, 1.6) });
    const dark = new THREE.MeshBasicMaterial({ color: 0x120400 });
    const hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb040).multiplyScalar(2.4), toneMapped: false });
    SKULL = { bone, dark, hot,
      cran: new THREE.SphereGeometry(0.34, 14, 12).scale(1, 1.05, 1.15).translate(0, 0.08, -0.04),
      face: new THREE.BoxGeometry(0.4, 0.26, 0.3).translate(0, -0.14, 0.14),
      jaw: new THREE.BoxGeometry(0.32, 0.12, 0.26).translate(0, -0.33, 0.12),
      eye: new THREE.SphereGeometry(0.095, 10, 8), pup: new THREE.SphereGeometry(0.04, 8, 6),
      nose: new THREE.ConeGeometry(0.05, 0.1, 3).rotateX(Math.PI / 2).translate(0, -0.1, 0.3),
      tooth: new THREE.BoxGeometry(0.3, 0.05, 0.02).translate(0, -0.265, 0.29) };
  }
  const K = SKULL, grp = new THREE.Group();
  grp.add(new THREE.Mesh(K.cran, K.bone), new THREE.Mesh(K.face, K.bone), new THREE.Mesh(K.jaw, K.bone), new THREE.Mesh(K.nose, K.dark), new THREE.Mesh(K.tooth, K.dark));
  for (const x of [-0.13, 0.13]) { const e = new THREE.Mesh(K.eye, K.dark); e.position.set(x, 0.03, 0.27); const p = new THREE.Mesh(K.pup, K.hot); p.position.set(x, 0.03, 0.33); grp.add(e, p); }
  grp.traverse((m) => { if (m.isMesh && m.material === K.bone) m.castShadow = true; });
  return grp;
}

// ---- Pyre: Homing Fireballs. A flaming skull that climbs out, then hunts `live()` (or flies to `to` when it has no target) and bursts.
export function seeker(g, o, d, live, to, onExplode, delay = 0) {
  const fx = g.fx, pos = new THREE.Vector3(...o), vel = new THREE.Vector3(d[0], d[1], d[2]).normalize().multiplyScalar(13);
  const aim = new THREE.Vector3(...to), want = new THREE.Vector3();
  let age = -delay;
  const sk = skull(); sk.scale.setScalar(1.25); sk.visible = false; g.scene.add(sk);
  fx.add({
    dur: 7 + delay,
    update: (dt) => {
      age += dt;
      if (age < 0) return;
      const t = live && live();
      if (t) aim.set(t[0], t[1], t[2]);
      const sp = Math.min(34, 13 + age * 30);
      want.copy(aim).sub(pos); const dist = want.length();
      want.normalize().multiplyScalar(sp);
      vel.lerp(want, Math.min(1, dt * (age < 0.25 ? 1.5 : 7)));
      pos.addScaledVector(vel, dt);
      const P = [pos.x, pos.y, pos.z];
      sk.visible = true; sk.position.copy(pos); sk.lookAt(pos.x + vel.x, pos.y + vel.y, pos.z + vel.z); sk.rotateZ(Math.sin(age * 9) * 0.12);
      fx.glow.emit({ p: P, life: 0.06, s0: 2.2, s1: 2.2, c0: [1, 0.55, 0.15, 0.5], c1: [1, 0.45, 0.1, 0.35] });
      // the flames stream back off the crown of the skull
      { const sp = vel.length() || 1, bx = -vel.x / sp, by = -vel.y / sp, bz = -vel.z / sp;
        for (let i = 0; i < fx.n(4); i++) fx.fire.emit({ p: [pos.x + bx * 0.25 + rnd(-0.28, 0.28), pos.y + 0.22 + rnd(-0.2, 0.25), pos.z + bz * 0.25 + rnd(-0.28, 0.28)], v: [bx * 3 + rnd(-0.6, 0.6), by * 3 + 1.6, bz * 3 + rnd(-0.6, 0.6)], life: rnd(0.25, 0.5), s0: 1.05, s1: 0.15, c0: [1, 0.75, 0.35, 1], c1: [0.9, 0.2, 0.02, 0], turb: 2 }); }
      if (Math.random() < 0.3) fx.smoke.emit({ p: P, v: [0, 0.5, 0], life: 0.7, s0: 0.4, s1: 1.2, c0: [0.25, 0.22, 0.2, 0.3], c1: [0.3, 0.3, 0.3, 0] });
      const gy = g.world.heightAt(pos.x, pos.z);
      if (dist < 1.3 || pos.y <= gy + 0.2 || age > 5.5) {
        const p = [pos.x, Math.max(pos.y, gy + 0.3), pos.z];
        fx.explosion(p, 0.8);
        fx.flash(p, 0xff8a30, 16, 0.2, 10);
        onExplode && onExplode(p);
        return false;
      }
    },
    dispose: () => g.scene.remove(sk),
  });
}

// ---- Bastion: Boulder Orbit. `n` rocks circle the point `follow()` returns (null ends it). take() removes one and says where it was.
export function orbit(g, follow, n) {
  const scene = g.scene, fx = g.fx, geos = rockGeos(), mat = rockMat();
  const rocks = [];
  const chips = (p, k) => { for (let i = 0; i < fx.n(k); i++) fx.debris.emit({ p: [p[0] + rnd(-0.4, 0.4), p[1] + rnd(-0.4, 0.4), p[2] + rnd(-0.4, 0.4)], v: [rnd(-4, 4), rnd(1, 6), rnd(-4, 4)], life: rnd(0.6, 1.1), s0: rnd(0.12, 0.3), s1: 0.08, c0: [0.5, 0.4, 0.3, 1], c1: [0.4, 0.3, 0.2, 0], g: 22, drag: 0.3 }); };
  // a rock breaking up: real chunks of the same scanned stone fly apart, fall and sink away
  const crumble = (p) => { chips(p, 14); fx.dustBurst(p, 1.1, [0.58, 0.48, 0.36]);
    const N = fx.n(9) | 0 || 4, im = new THREE.InstancedMesh(geos[0], mat, N), C = [], M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), SC = new THREE.Vector3();
    im.castShadow = true; im.frustumCulled = false; scene.add(im);
    for (let i = 0; i < N; i++) C.push({ p: [p[0] + rnd(-0.3, 0.3), p[1] + rnd(-0.3, 0.3), p[2] + rnd(-0.3, 0.3)], v: [rnd(-5, 5), rnd(1, 7), rnd(-5, 5)], rot: [rnd(0, 6), rnd(0, 6), rnd(0, 6)], spin: [rnd(-8, 8), rnd(-8, 8), rnd(-8, 8)], s: rnd(0.14, 0.34), hit: 0 });
    fx.add({ dur: 2.4, update: (dt, t) => { const out = Math.max(0, (t - 1.7) / 0.7);
        C.forEach((q, i) => { if (q.hit < 2) { q.v[1] -= 27 * dt; for (let k = 0; k < 3; k++) { q.p[k] += q.v[k] * dt; q.rot[k] += q.spin[k] * dt; }
            const gy = g.world.heightAt(q.p[0], q.p[2]) + q.s * 0.4; if (q.p[1] < gy && q.v[1] < 0) { q.p[1] = gy; q.hit++; q.v[1] *= -0.3; q.v[0] *= 0.45; q.v[2] *= 0.45; for (let k = 0; k < 3; k++) q.spin[k] *= 0.4; } }
          E.set(q.rot[0], q.rot[1], q.rot[2]); Q.setFromEuler(E); P.set(q.p[0], q.p[1] - out * q.s, q.p[2]); SC.setScalar(q.s * (1 - out * 0.5)); im.setMatrixAt(i, M.compose(P, Q, SC)); });
        im.instanceMatrix.needsUpdate = true; },
      dispose: () => { scene.remove(im); im.dispose(); } }); };
  const add = (i) => { const m = new THREE.Mesh(geos[i % geos.length], mat); m.castShadow = true; m.scale.setScalar(0.01); m.userData = { s: 0.85 + (i % 3) * 0.06, sp: [rnd(-2, 2), rnd(-2, 2), rnd(-2, 2)] }; scene.add(m); rocks.push(m); };
  for (let i = 0; i < n; i++) add(i);
  const first = follow();
  if (first) { fx.dustBurst([first[0], g.world.heightAt(first[0], first[2]), first[2]], 1.2); fx.decal([first[0], 0, first[2]], TX.crackDecal(), 3.2, 5); }
  const h = {
    alive: true, ang: 0,
    take() { const m = rocks.pop(); if (!m) return null; const p = [m.position.x, m.position.y, m.position.z]; scene.remove(m); if (!rocks.length) h.alive = false; return p; },
    set(k) { while (rocks.length > k) scene.remove(rocks.pop()); while (rocks.length < k) add(rocks.length); if (!k) h.alive = false; },
    end() { h.set(0); },
    // the rock closest to where a blow comes from (or any rock): it flinches and that is where the dust flies
    // the rock closest to where a blow comes from takes it: it flinches, cracks, and after `max` blows it breaks apart
    block(from, max) { let best = null, bd = 1e9; for (const m of rocks) { const d = from ? Math.hypot(m.position.x - from[0], m.position.z - from[2]) : Math.random(); if (d < bd) { bd = d; best = m; } } if (!best) return null;
      const u = best.userData, p = [best.position.x, best.position.y, best.position.z]; u.hit = 1; u.dmg = (u.dmg || 0) + 1; u.s *= 0.9;
      if (u.dmg < max) { chips(p, 5); return { p, broke: false }; }
      rocks.splice(rocks.indexOf(best), 1); scene.remove(best); crumble(p); if (!rocks.length) h.alive = false; return { p, broke: true }; },
    crumbleAt(p) { let best = null, bd = 1e9; for (const m of rocks) { const d = Math.hypot(m.position.x - p[0], m.position.y - p[1], m.position.z - p[2]); if (d < bd) { bd = d; best = m; } } if (!best) return;
      rocks.splice(rocks.indexOf(best), 1); scene.remove(best); crumble([best.position.x, best.position.y, best.position.z]); if (!rocks.length) h.alive = false; },
  };
  fx.add({
    dur: 1e9,
    update: (dt, t) => {
      const c = follow();
      if (!c || !h.alive || !rocks.length) { h.alive = false; return false; }
      h.ang += dt * 2.6;
      rocks.forEach((m, i) => {
        const a = h.ang + (i / rocks.length) * Math.PI * 2, u = m.userData, rise = Math.min(1, t / 0.45);
        m.position.set(c[0] + Math.cos(a) * 3, c[1] - 1.4 * (1 - rise) + Math.sin(t * 2 + i * 2) * 0.18, c[2] + Math.sin(a) * 3);
        u.hit = Math.max(0, (u.hit || 0) - dt * 5); m.scale.setScalar(u.s * rise * (1 + 0.22 * u.hit));
        m.rotation.x += u.sp[0] * dt; m.rotation.y += u.sp[1] * dt; m.rotation.z += u.sp[2] * dt;
        if (Math.random() < 0.12) fx.debris.emit({ p: [m.position.x, m.position.y - 0.3, m.position.z], v: [rnd(-0.5, 0.5), -1, rnd(-0.5, 0.5)], life: 0.5, s0: 0.12, s1: 0.05, c0: [0.5, 0.4, 0.3, 1], c1: [0.4, 0.3, 0.2, 0], g: 10 });
      });
    },
    dispose: () => { for (const m of rocks) scene.remove(m); rocks.length = 0; h.alive = false; },
  });
  return h;
}

// ---- Bastion: Meteor Call. A burning ring marks `p`; `delay` seconds later a giant flaming rock comes down on it.
export function meteor(g, p, onImpact, delay = 2, r = 9) {
  const scene = g.scene, fx = g.fx;
  g.el.telegraph([p[0], 0, p[2]], r, delay + 0.1, 0xff7a20);
  const m = new THREE.Mesh(rockGeos()[1], rockMat());
  m.scale.setScalar(4.2); m.castShadow = true;
  const from = new THREE.Vector3(p[0] - 26, p[1] + 95, p[2] - 18), to = new THREE.Vector3(p[0], p[1] + 1.5, p[2]);
  m.position.copy(from); scene.add(m);
  fx.add({
    dur: delay + 0.2,
    update: (dt, t) => {
      const k = Math.min(1, t / delay), e = k * k; // it gathers speed all the way down
      m.position.lerpVectors(from, to, e);
      m.rotation.x += dt * 3; m.rotation.z += dt * 2.2;
      const P = m.position;
      for (let i = 0; i < fx.n(7); i++) fx.fire.emit({ p: [P.x + rnd(-2.2, 2.2), P.y + rnd(-1, 3), P.z + rnd(-2.2, 2.2)], v: [rnd(1, 4), rnd(6, 14), rnd(1, 3)], life: rnd(0.4, 0.8), s0: rnd(3, 5), s1: 0.6, c0: [1, 0.7, 0.3, 1], c1: [0.8, 0.15, 0.02, 0], turb: 3 });
      for (let i = 0; i < fx.n(2); i++) fx.smoke.emit({ p: [P.x + rnd(-1.5, 1.5), P.y + 3, P.z + rnd(-1.5, 1.5)], v: [rnd(0, 2), rnd(4, 8), rnd(0, 2)], life: rnd(1.2, 2), s0: 3, s1: 8, c0: [0.16, 0.13, 0.12, 0.6], c1: [0.3, 0.3, 0.3, 0] });
      fx.glow.emit({ p: [P.x, P.y, P.z], life: 0.08, s0: 14, s1: 14, c0: [1, 0.55, 0.15, 0.55], c1: [1, 0.4, 0.1, 0.4] });
      // the marked ground glows hotter as it comes
      if (Math.random() < 0.5) { const a = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * r; fx.fire.emit({ p: [p[0] + Math.cos(a) * rr, g.world.heightAt(p[0] + Math.cos(a) * rr, p[2] + Math.sin(a) * rr) + 0.2, p[2] + Math.sin(a) * rr], v: [0, 2 + 4 * k, 0], life: 0.5, s0: 0.8 + k, s1: 0.2, c0: [1, 0.6, 0.2, 0.9], c1: [0.9, 0.2, 0.02, 0] }); }
      if (k >= 1) {
        fx.explosion([p[0], p[1] + 1, p[2]], 3.2);
        fx.shockwave(p, r + 4, 0xff8a3a, 0.6);
        fx.shockwave(p, r, 0xffd27a, 0.35);
        fx.decal([p[0], 0, p[2]], TX.crackDecal(), r * 2, 14);
        fx.flash([p[0], p[1] + 3, p[2]], 0xff9a40, 60, 0.4, 40);
        fx.dustBurst(p, 4, [0.4, 0.3, 0.24]);
        for (let i = 0; i < fx.n(46); i++) { const a = Math.random() * 6.28, sp = rnd(5, 20); fx.debris.emit({ p: [p[0], p[1] + 0.4, p[2]], v: [Math.cos(a) * sp, rnd(6, 22), Math.sin(a) * sp], life: rnd(0.8, 1.6), s0: rnd(0.4, 1.1), s1: 0.3, c0: [0.45, 0.32, 0.22, 1], c1: [0.3, 0.22, 0.16, 0], g: 20, drag: 0.3 }); }
        for (let i = 0; i < fx.n(30); i++) { const a = Math.random() * 6.28, rr = rnd(0, r); fx.fire.emit({ p: [p[0] + Math.cos(a) * rr, p[1] + 0.3, p[2] + Math.sin(a) * rr], v: [Math.cos(a) * 3, rnd(3, 9), Math.sin(a) * 3], life: rnd(0.6, 1.3), s0: rnd(2, 4), s1: 0.4, c0: [1, 0.7, 0.3, 1], c1: [0.8, 0.15, 0.02, 0], turb: 3 }); }
        onImpact && onImpact(p);
        return false;
      }
    },
    dispose: () => scene.remove(m),
  });
}

// ---- Bastion: Seismic Stomp. The ground breaks open in rings round `c`.
export function stomp(g, c, r = 15) {
  const fx = g.fx, scene = g.scene, gy0 = g.world.heightAt(c[0], c[2]);
  fx.shockwave(c, r, 0xc8955a, 0.5);
  fx.shockwave(c, r * 0.6, 0xffd9a0, 0.32);
  fx.decal([c[0], 0, c[2]], TX.crackDecal(), r * 1.7, 12);
  fx.decal([c[0], 0, c[2]], TX.crackDecal(), r * 0.8, 12);
  fx.flash([c[0], c[1] + 1, c[2]], 0xffb070, 22, 0.25, 18);
  fx.dustBurst(c, 3.6, [0.58, 0.48, 0.36]);
  for (let k = 0; k < 3; k++) for (let i = 0; i < fx.n(14); i++) {
    const a = (i / 14) * 6.28 + k, rr = r * (0.3 + k * 0.3), x = c[0] + Math.cos(a) * rr, z = c[2] + Math.sin(a) * rr, y = g.world.heightAt(x, z);
    fx.debris.emit({ p: [x, y + 0.2, z], v: [Math.cos(a) * rnd(2, 6), rnd(6, 13), Math.sin(a) * rnd(2, 6)], life: rnd(0.7, 1.3), s0: rnd(0.2, 0.5), s1: 0.15, c0: [0.5, 0.38, 0.26, 1], c1: [0.4, 0.3, 0.2, 0], g: 20, drag: 0.3 });
    fx.smoke.emit({ p: [x, y + 0.3, z], v: [Math.cos(a) * 3, rnd(1, 3), Math.sin(a) * 3], life: rnd(0.9, 1.6), s0: 1.5, s1: 4.5, c0: [0.6, 0.5, 0.38, 0.5], c1: [0.6, 0.5, 0.4, 0], drag: 1 });
  }
  // Real rock (the scanned boulder surface): slabs of ground heave up and tilt outward in broken rings, and chunks are thrown
  // in every direction, tumble, bounce once and come to rest before the lot sinks back (Nutty 2026-11-13).
  const geos = rockGeos(), mat = rockMat(), NS = fx.n(22) | 0 || 8, NC = fx.n(30) | 0 || 10;
  const slabs = new THREE.InstancedMesh(geos[1 % geos.length], mat, NS), chunks = new THREE.InstancedMesh(geos[0], mat, NC);
  for (const m of [slabs, chunks]) { m.castShadow = true; m.frustumCulled = false; scene.add(m); }
  const S = [], C = [], M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), SC = new THREE.Vector3();
  for (let i = 0; i < NS; i++) { const ring = i % 3, a = (i / NS) * 6.28 * 3 + ring * 0.7 + rnd(-0.2, 0.2), d = r * (0.4 + ring * 0.22 + rnd(-0.04, 0.04)), x = c[0] + Math.cos(a) * d, z = c[2] + Math.sin(a) * d;
    S.push({ x, z, gy: g.world.heightAt(x, z), a, s: rnd(0.42, 0.8) * (1.25 - ring * 0.18), tilt: rnd(0.45, 0.95), roll: rnd(-0.35, 0.35), tw: rnd(0, 6.28), delay: d / r * 0.16 }); }
  for (let i = 0; i < NC; i++) { const a = Math.random() * 6.28, d = r * rnd(0.3, 0.7), sp = rnd(4, 15), x = c[0] + Math.cos(a) * d, z = c[2] + Math.sin(a) * d, da = a + rnd(-0.5, 0.5);
    C.push({ p: [x, g.world.heightAt(x, z) + 0.2, z], v: [Math.cos(da) * sp, rnd(9, 21), Math.sin(da) * sp], rot: [rnd(0, 6), rnd(0, 6), rnd(0, 6)], spin: [rnd(-7, 7), rnd(-7, 7), rnd(-7, 7)], s: rnd(0.1, 0.34), hit: 0 }); }
  const DUR = 3.4, ez = (k) => { k = Math.max(0, Math.min(1, k)); return 1 - (1 - k) * (1 - k); };
  fx.add({
    dur: DUR,
    update: (dt, t) => {
      const out = Math.max(0, (t - (DUR - 1)) / 1);
      S.forEach((q, i) => { const k = ez((t - q.delay) / 0.16), up = k - out;
        E.set(q.roll, -q.a + Math.PI / 2 + q.tw * 0.0, 0, 'YXZ'); Q.setFromEuler(E);
        E.set(q.tilt * k, 0, 0); Q.multiply(Q2.setFromEuler(E)); // leans away from the middle
        P.set(q.x, q.gy - q.s * 1.5 * (1 - up) + q.s * 0.35, q.z); SC.set(q.s * 1.15, q.s * 1.7, q.s * 0.75);
        slabs.setMatrixAt(i, M.compose(P, Q, SC)); });
      C.forEach((q, i) => {
        if (q.hit < 2) { q.v[1] -= 27 * dt; q.p[0] += q.v[0] * dt; q.p[1] += q.v[1] * dt; q.p[2] += q.v[2] * dt; for (let k = 0; k < 3; k++) q.rot[k] += q.spin[k] * dt;
          const gy = g.world.heightAt(q.p[0], q.p[2]) + q.s * 0.4;
          if (q.p[1] < gy && q.v[1] < 0) { q.p[1] = gy; q.hit++; if (q.hit === 1) { q.v[1] *= -0.32; q.v[0] *= 0.5; q.v[2] *= 0.5; for (let k = 0; k < 3; k++) q.spin[k] *= 0.5; if (Math.random() < 0.6) fx.dustBurst([q.p[0], gy, q.p[2]], 0.35, [0.58, 0.48, 0.36]); } } }
        E.set(q.rot[0], q.rot[1], q.rot[2]); Q.setFromEuler(E); P.set(q.p[0], q.p[1] - out * q.s * 1.2, q.p[2]); SC.setScalar(q.s);
        chunks.setMatrixAt(i, M.compose(P, Q, SC)); });
      slabs.instanceMatrix.needsUpdate = true; chunks.instanceMatrix.needsUpdate = true;
    },
    dispose: () => { scene.remove(slabs); scene.remove(chunks); slabs.dispose(); chunks.dispose(); },
  });
}

// ---- Rime: Healing Rain. A small, heavy rain storm: a low, dark-bellied storm cloud lit blue from inside, sheets of rain,
// splashes and ground mist under it for `dur` seconds. onTick() runs four times a second.
let CLOUD_MAT = null;
export function rain(g, c, dur = 7, r = 12, onTick) {
  const scene = g.scene, fx = g.fx;
  CLOUD_MAT = CLOUD_MAT || new THREE.MeshStandardMaterial({ color: 0x66758c, emissive: 0x2458b0, emissiveIntensity: 0.3, roughness: 1, transparent: true, opacity: 0, depthWrite: false });
  const mat = CLOUD_MAT.clone();
  const grp = new THREE.Group(), geo = new THREE.IcosahedronGeometry(1, 2), puffs = [];
  for (let i = 0; i < 34; i++) {
    const a = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * r * 0.9, s = rnd(2.8, 5) * (1 - rr / r * 0.35);
    const m = new THREE.Mesh(geo, mat); m.position.set(Math.cos(a) * rr, rnd(-0.8, 1.6), Math.sin(a) * rr); m.scale.set(s * 1.25, s * 0.7, s * 1.25);
    m.userData = { y: m.position.y, ph: Math.random() * 6 }; grp.add(m); puffs.push(m);
  }
  const gy = g.world.heightAt(c[0], c[2]), top = gy + 12;
  grp.position.set(c[0], top + 1.5, c[2]); scene.add(grp);
  fx.decal([c[0], 0, c[2]], TX.ringDecal(), r * 2, dur, { color: 0x58b4ff, additive: true, opacity: 0.4 });
  fx.flash([c[0], gy + 6, c[2]], 0x7fc8ff, 18, 0.5, 24);
  // the rain itself: a few hundred thin, slanted drops that fall fast and wrap back to the cloud
  const ND = Math.max(120, fx.n(520)), dp = new Float32Array(ND * 6), drops = [];
  for (let i = 0; i < ND; i++) { const a = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * r; drops.push({ x: c[0] + Math.cos(a) * rr, z: c[2] + Math.sin(a) * rr, y: gy + Math.random() * 12, v: rnd(26, 36), l: rnd(0.5, 0.95) }); }
  const dgeo = new THREE.BufferGeometry(); dgeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dmat = new THREE.LineBasicMaterial({ color: 0xb4dcff, transparent: true, opacity: 0, depthWrite: false });
  const lines = new THREE.LineSegments(dgeo, dmat); lines.frustumCulled = false; scene.add(lines);
  let tick = 0, flick = 0;
  fx.add({
    dur: dur + 0.8,
    update: (dt, t) => {
      mat.opacity = 0.5 * Math.min(1, t / 0.6) * Math.min(1, Math.max(0, (dur + 0.8 - t) / 0.8));
      if (t < dur) for (let i = 0; i < fx.n(5); i++) { const q = puffs[Math.floor(Math.random() * puffs.length)], sh = rnd(0.2, 0.42); fx.smoke.emit({ p: [c[0] + q.position.x + rnd(-2, 2), top + 1.5 + q.position.y + rnd(-1.4, 1), c[2] + q.position.z + rnd(-2, 2)], v: [rnd(-0.8, 0.8), rnd(-0.3, 0.3), rnd(-0.8, 0.8)], life: rnd(1.1, 1.9), s0: rnd(5, 8), s1: rnd(8, 11), c0: [sh, sh + 0.04, sh + 0.1, 0], c1: [sh, sh + 0.04, sh + 0.1, 0.55], rotV: rnd(-0.3, 0.3) }); }
      dmat.opacity = t < dur ? 0.6 * Math.min(1, t / 0.5) : Math.max(0, dmat.opacity - dt * 2);
      grp.rotation.y += dt * 0.1;
      for (const m of puffs) m.position.y = m.userData.y + Math.sin(t * 0.9 + m.userData.ph) * 0.35;
      // the cloud flickers from inside now and then, like a storm cell
      flick -= dt;
      if (flick <= 0 && t < dur) { flick = rnd(0.5, 1.4); mat.emissiveIntensity = 1.5; fx.glow.emit({ p: [c[0] + rnd(-r, r) * 0.5, top + 1, c[2] + rnd(-r, r) * 0.5], life: 0.18, s0: 12, s1: 16, c0: [0.6, 0.8, 1, 0.5], c1: [0.5, 0.75, 1, 0] }); }
      mat.emissiveIntensity += (0.3 - mat.emissiveIntensity) * Math.min(1, dt * 7);
      if (t < dur) {
        // each drop that reaches the ground starts again under the cloud
        for (let i = 0; i < ND; i++) {
          const d = drops[i];
          d.y -= d.v * dt; d.x += 2.2 * dt; d.z += 0.8 * dt;
          if (d.y < g.world.heightAt(d.x, d.z)) { const a = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * r; d.x = c[0] + Math.cos(a) * rr; d.z = c[2] + Math.sin(a) * rr; d.y = top - Math.random() * 1.5; }
          const o = i * 6; dp[o] = d.x; dp[o + 1] = d.y; dp[o + 2] = d.z; dp[o + 3] = d.x + 0.07 * d.l; dp[o + 4] = d.y + d.l; dp[o + 5] = d.z + 0.025 * d.l;
        }
        dgeo.attributes.position.needsUpdate = true;
        for (let i = 0; i < fx.n(9); i++) {
          const a = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * r, x = c[0] + Math.cos(a) * rr, z = c[2] + Math.sin(a) * rr, y = g.world.heightAt(x, z);
          fx.glow.emit({ p: [x, y + 0.12, z], life: 0.22, s0: 0.25, s1: 1.2, c0: [0.7, 0.9, 1, 0.7], c1: [0.7, 0.9, 1, 0] });
          fx.shard.emit({ p: [x, y + 0.1, z], v: [rnd(-1.2, 1.2), rnd(1.5, 3), rnd(-1.2, 1.2)], life: 0.3, s0: 0.14, s1: 0.04, c0: [0.8, 0.93, 1, 0.9], c1: [0.7, 0.9, 1, 0], g: 12 });
        }
        if (Math.random() < 0.6) { const a = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * r, x = c[0] + Math.cos(a) * rr, z = c[2] + Math.sin(a) * rr; fx.smoke.emit({ p: [x, g.world.heightAt(x, z) + 0.4, z], v: [0.6, 0.25, 0.2], life: 1.5, s0: 1.8, s1: 4.2, c0: [0.75, 0.86, 1, 0.2], c1: [0.75, 0.86, 1, 0] }); }
        if (Math.random() < 0.5) fx.glow.emit({ p: [c[0] + rnd(-r, r) * 0.7, top - 0.5, c[2] + rnd(-r, r) * 0.7], life: 0.5, s0: 6, s1: 9, c0: [0.35, 0.6, 1, 0.2], c1: [0.35, 0.6, 1, 0] });
        tick += dt;
        if (tick >= 0.25) { tick -= 0.25; onTick && onTick(); }
      }
    },
    dispose: () => { scene.remove(grp); scene.remove(lines); geo.dispose(); mat.dispose(); dgeo.dispose(); dmat.dispose(); },
  });
}
// A healed runner sparkles.
export function healSpark(g, p) {
  const fx = g.fx;
  for (let i = 0; i < 2; i++) fx.plus.emit({ p: [p[0] + rnd(-0.5, 0.5), p[1] + rnd(0.4, 1.6), p[2] + rnd(-0.5, 0.5)], v: [0, 1.4, 0], life: 0.8, s0: 0.35, s1: 0.2, c0: [0.5, 0.9, 1, 1], c1: [0.5, 0.9, 1, 0] });
}

// ---- Rime: Absolute Zero. A white-blue front races out from `c` to radius `r` and the air hangs full of frost for `dur` seconds.
export function zero(g, c, r = 24, dur = 5) {
  const fx = g.fx;
  fx.shockwave(c, r, 0xbfe8ff, 0.5);
  fx.shockwave(c, r * 0.5, 0xffffff, 0.3);
  fx.flash([c[0], c[1] + 2, c[2]], 0xbfe8ff, 50, 0.4, 40);
  fx.decal([c[0], 0, c[2]], TX.ringDecal(), r * 2, dur, { color: 0x9fdcff, additive: true, opacity: 0.35 });
  for (let i = 0; i < fx.n(60); i++) { const a = Math.random() * 6.28, sp = rnd(10, 40); fx.shard.emit({ p: [c[0], c[1] + rnd(0.3, 2), c[2]], v: [Math.cos(a) * sp, rnd(0, 4), Math.sin(a) * sp], life: rnd(0.4, 0.8), s0: 0.4, s1: 0.1, c0: [0.85, 0.95, 1, 1], c1: [0.6, 0.85, 1, 0], drag: 1.5 }); }
  fx.add({
    dur,
    update: (dt, t) => {
      for (let i = 0; i < fx.n(5); i++) {
        const a = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * r, x = c[0] + Math.cos(a) * rr, z = c[2] + Math.sin(a) * rr;
        fx.shard.emit({ p: [x, g.world.heightAt(x, z) + rnd(0.3, 5), z], v: [0, -0.15, 0], life: rnd(0.6, 1.2), s0: 0.22, s1: 0.18, c0: [0.85, 0.95, 1, 0.9], c1: [0.7, 0.9, 1, 0] });
      }
      if (Math.random() < 0.6) { const a = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * r, x = c[0] + Math.cos(a) * rr, z = c[2] + Math.sin(a) * rr; fx.smoke.emit({ p: [x, g.world.heightAt(x, z) + 0.4, z], v: [0, 0.2, 0], life: 1.6, s0: 2, s1: 4.5, c0: [0.8, 0.92, 1, 0.22], c1: [0.8, 0.92, 1, 0] }); }
    },
  });
}

// ---- Gale: Cloud Form. The body is gone; a living, see-through swirl of mist stands in its place while `follow()` returns a point.
export function mist(g, follow, onEnd) {
  const fx = g.fx;
  const first = follow();
  if (first) for (let i = 0; i < fx.n(22); i++) fx.smoke.emit({ p: [first[0] + rnd(-0.5, 0.5), first[1] + rnd(0.1, 1.9), first[2] + rnd(-0.5, 0.5)], v: [rnd(-3, 3), rnd(0, 2), rnd(-3, 3)], life: rnd(0.5, 0.9), s0: 0.8, s1: 2.6, c0: [0.92, 0.96, 1, 0.5], c1: [0.92, 0.96, 1, 0], drag: 2 });
  let last = first;
  fx.add({
    dur: 30,
    update: (dt, t) => {
      const c = follow();
      if (!c) {
        if (last) for (let i = 0; i < fx.n(18); i++) fx.smoke.emit({ p: [last[0] + rnd(-0.6, 0.6), last[1] + rnd(0.1, 1.9), last[2] + rnd(-0.6, 0.6)], v: [rnd(-1, 1) * 2, rnd(0, 1.5), rnd(-1, 1) * 2], life: rnd(0.4, 0.8), s0: 1.6, s1: 0.5, c0: [0.92, 0.96, 1, 0.45], c1: [0.92, 0.96, 1, 0], drag: 2 });
        onEnd && onEnd();
        return false;
      }
      last = c;
      // a body-shaped column of slow wisps that curl round each other, a faint glow inside, and a trail where it moved
      for (let i = 0; i < fx.n(4); i++) {
        const h = Math.random(), a = t * 3 + h * 9 + i * 2.1, rr = 0.18 + 0.32 * Math.sin(h * Math.PI);
        fx.smoke.emit({ p: [c[0] + Math.cos(a) * rr, c[1] + 0.15 + h * 1.8, c[2] + Math.sin(a) * rr], v: [-Math.sin(a) * 1.3, rnd(0.1, 0.5), Math.cos(a) * 1.3], life: rnd(0.4, 0.65), s0: 0.45, s1: 0.95, c0: [0.93, 0.97, 1, 0.2], c1: [0.93, 0.97, 1, 0], drag: 1.5 });
      }
      if (Math.random() < 0.5) fx.glow.emit({ p: [c[0], c[1] + 1.1, c[2]], life: 0.12, s0: 1.7, s1: 1.7, c0: [0.8, 0.95, 1, 0.05], c1: [0.8, 0.95, 1, 0.03] });
      if (Math.random() < 0.3) fx.streak.emit({ p: [c[0] + rnd(-0.4, 0.4), c[1] + rnd(0.3, 1.7), c[2] + rnd(-0.4, 0.4)], v: [rnd(-2, 2), 0.5, rnd(-2, 2)], life: 0.3, s0: 0.7, s1: 0.2, c0: [0.9, 1, 0.97, 0.2], c1: [0.9, 1, 0.97, 0] });
    },
  });
}

// ---- Rime: the four big crystals of Ice Shards. Diamond-shaped, they form round `o`, hang a beat, then dart to `pts`. onHit(i, p) for the caster.
let DIAMOND = null;
export function crystals(g, o, pts, onHit) {
  const fx = g.fx, scene = g.scene, mat = iceMat();
  DIAMOND = DIAMOND || new THREE.OctahedronGeometry(1, 0).scale(0.42, 1, 0.42);
  const list = pts.map((p, i) => {
    const m = new THREE.Mesh(DIAMOND, mat); m.castShadow = true;
    const a = (i / pts.length) * Math.PI * 2 + 0.6;
    const home = new THREE.Vector3(o[0] + Math.cos(a) * 2.2, o[1] + 0.9 + (i % 2) * 0.5, o[2] + Math.sin(a) * 2.2);
    m.position.copy(home); m.scale.setScalar(0.01);
    m.userData = { home, to: new THREE.Vector3(...p), go: 0.38 + i * 0.09, flying: false, done: false };
    scene.add(m);
    return m;
  });
  fx.flash([o[0], o[1], o[2]], 0x9fdcff, 20, 0.35, 11);
  for (let i = 0; i < fx.n(18); i++) fx.glow.emit({ p: [o[0] + rnd(-1.4, 1.4), o[1] + rnd(-0.5, 1.4), o[2] + rnd(-1.4, 1.4)], v: [0, 0.6, 0], life: 0.5, s0: 1, s1: 0.1, c0: [0.6, 0.85, 1, 0.5], c1: [0.8, 0.95, 1, 0] });
  const dir = new THREE.Vector3();
  fx.add({
    dur: 5,
    update: (dt, t) => {
      let alive = 0;
      for (let i = 0; i < list.length; i++) {
        const m = list[i], u = m.userData;
        if (u.done) continue;
        alive++;
        if (t < u.go) {
          m.position.y = u.home.y + Math.sin(t * 5 + i) * 0.1;
          m.scale.setScalar(1.15 * Math.min(1, t / 0.28));
          m.lookAt(u.to); m.rotateX(Math.PI / 2); m.rotateY(t * 5);
          if (Math.random() < 0.3) fx.shard.emit({ p: [m.position.x + rnd(-0.6, 0.6), m.position.y + rnd(-0.8, 0.8), m.position.z + rnd(-0.6, 0.6)], v: [0, 0.4, 0], life: 0.4, s0: 0.2, s1: 0.05, c0: [0.85, 0.95, 1, 1], c1: [0.6, 0.85, 1, 0] });
          continue;
        }
        if (!u.flying) { u.flying = true; fx.glow.emit({ p: [m.position.x, m.position.y, m.position.z], life: 0.2, s0: 2, s1: 0.4, c0: [0.7, 0.9, 1, 0.8], c1: [0.7, 0.9, 1, 0] }); }
        dir.copy(u.to).sub(m.position);
        const dist = dir.length(), step = 36 * dt;
        if (dist <= step + 0.05) {
          u.done = true; m.visible = false;
          const p = [u.to.x, u.to.y, u.to.z];
          for (let k = 0; k < fx.n(16); k++) fx.shard.emit({ p, v: [rnd(-6, 6), rnd(0, 7), rnd(-6, 6)], life: rnd(0.35, 0.75), s0: 0.5, s1: 0.08, c0: [0.85, 0.95, 1, 1], c1: [0.6, 0.85, 1, 0], g: 9 });
          fx.glow.emit({ p, life: 0.25, s0: 3, s1: 0.5, c0: [0.6, 0.85, 1, 0.8], c1: [0.6, 0.85, 1, 0] });
          fx.shockwave([p[0], g.world.heightAt(p[0], p[2]), p[2]], 2.6, 0x9fdcff, 0.3);
          onHit && onHit(i, p);
          continue;
        }
        dir.normalize();
        m.position.addScaledVector(dir, step);
        m.lookAt(u.to); m.rotateX(Math.PI / 2); m.rotateY(t * 9);
        fx.streak.emit({ p: [m.position.x, m.position.y, m.position.z], v: [-dir.x * 2, -dir.y * 2, -dir.z * 2], life: 0.16, s0: 1.3, s1: 0.2, c0: [0.8, 0.95, 1, 0.7], c1: [0.8, 0.95, 1, 0], rot: Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) });
      }
      if (!alive) return false;
    },
    dispose: () => { for (const m of list) scene.remove(m); },
  });
}

// ---- Tempest: Blink. A crack of light where the runner lands (`to`), and at the spot they left (`o`) a ball of live
// electricity that keeps arcing for `dur` seconds; onPulse(k) fires at once and then twice a second (caster only).
export function blink(g, o, to, onPulse, dur = 1.5, r = 7) {
  const fx = g.fx, gy = g.world.heightAt(o[0], o[2]), C = [o[0], gy + 1.1, o[2]];
  fx.bolt([o[0], o[1] + 1.1, o[2]], [to[0], to[1] + 1.1, to[2]], { width: 0.5, dur: 0.22, color: 0xd0b8ff, branches: 2 });
  fx.flash([to[0], to[1] + 1.2, to[2]], 0xc8b0ff, 26, 0.25, 14);
  fx.flash(C, 0xb89cff, 30, 0.3, 16);
  for (let i = 0; i < fx.n(14); i++) fx.spark.emit({ p: [to[0], to[1] + rnd(0.3, 1.8), to[2]], v: [rnd(-6, 6), rnd(0, 6), rnd(-6, 6)], life: rnd(0.2, 0.45), s0: 0.3, s1: 0.05, c0: [0.85, 0.8, 1, 1], c1: [0.6, 0.4, 1, 0], g: 6 });
  let tick = 0.5, k = 0;
  const burst = () => {
    fx.shockwave([o[0], gy, o[2]], r, 0xb89cff, 0.35);
    for (let i = 0; i < 5; i++) { const a = Math.random() * 6.28, rr = rnd(r * 0.45, r); fx.bolt(C, [o[0] + Math.cos(a) * rr, g.world.heightAt(o[0] + Math.cos(a) * rr, o[2] + Math.sin(a) * rr) + rnd(0.1, 1.5), o[2] + Math.sin(a) * rr], { width: 0.3, dur: 0.2, color: 0xc8b8ff, branches: 1 }); }
    onPulse && onPulse(k++);
  };
  burst();
  fx.add({
    dur,
    update: (dt, t) => {
      const s = 1 - t / dur;
      fx.glow.emit({ p: C, life: 0.08, s0: 3.2 * s + 1, s1: 3.2 * s + 1, c0: [0.7, 0.55, 1, 0.55], c1: [0.6, 0.45, 1, 0.4] });
      fx.glow.emit({ p: C, life: 0.08, s0: 1.1 * s + 0.4, s1: 1.1 * s + 0.4, c0: [1, 1, 1, 0.9], c1: [1, 1, 1, 0.7] });
      for (let i = 0; i < fx.n(3); i++) { const a = Math.random() * 6.28, rr = rnd(0.5, r * 0.9); fx.spark.emit({ p: [o[0] + Math.cos(a) * rr, gy + rnd(0.1, 2), o[2] + Math.sin(a) * rr], v: [rnd(-2, 2), rnd(1, 4), rnd(-2, 2)], life: rnd(0.15, 0.35), s0: 0.25, s1: 0.04, c0: [0.85, 0.8, 1, 1], c1: [0.6, 0.4, 1, 0] }); }
      if (Math.random() < 0.35) { const a = Math.random() * 6.28, rr = rnd(1.5, r * 0.8); fx.bolt(C, [o[0] + Math.cos(a) * rr, gy + rnd(0.1, 2.4), o[2] + Math.sin(a) * rr], { width: 0.18, dur: 0.12, color: 0xc8b8ff, branches: 0 }); }
      tick -= dt;
      if (tick <= 0 && t < dur - 0.1) { tick = 0.5; burst(); }
    },
  });
}

// ---- Pyre: Dragon Breath. A stream of fire `len` m long from the first frame; follow() returns { o: [x, y, z], d: [x, y, z] } (null ends it).
// onTick(o, d) runs four times a second (caster only).
export function breath(g, follow, dur = 4, len = 18, onTick) {
  const fx = g.fx;
  let tick = 0;
  fx.add({
    dur,
    update: (dt, t) => {
      const f = follow();
      if (!f) return false;
      const o = f.o, d = f.d, fade = Math.min(1, (dur - t) * 3);
      for (let i = 0; i < fx.n(22); i++) {
        const s = Math.pow(Math.random(), 0.8) * len, w = 0.15 + s * 0.085; // the stream widens toward its end
        fx.fire.emit({ p: [o[0] + d[0] * s + rnd(-w, w), o[1] + d[1] * s + rnd(-w, w) * 0.7, o[2] + d[2] * s + rnd(-w, w)], v: [d[0] * 13 + rnd(-1, 1), d[1] * 13 + rnd(0.5, 2.2), d[2] * 13 + rnd(-1, 1)], life: rnd(0.24, 0.46), s0: (0.55 + s * 0.12) * fade, s1: 0.2, c0: [0.95, 0.2 - s * 0.004, 0.02, 0.42], c1: [0.4, 0.02, 0, 0], turb: 4, rotV: rnd(-3, 3) });
      }
      for (let i = 0; i < fx.n(5); i++) { const s = Math.random() * len * 0.45; fx.fire.emit({ p: [o[0] + d[0] * s, o[1] + d[1] * s, o[2] + d[2] * s], v: [d[0] * 16, d[1] * 16 + 0.5, d[2] * 16], life: rnd(0.15, 0.28), s0: 0.3 + s * 0.06, s1: 0.1, c0: [1, 0.55, 0.12, 0.5], c1: [0.9, 0.2, 0.02, 0], turb: 2 }); } // the hot core
      for (let i = 0; i < fx.n(3); i++) { const s = rnd(2, len); fx.spark.emit({ p: [o[0] + d[0] * s, o[1] + d[1] * s, o[2] + d[2] * s], v: [d[0] * 9 + rnd(-3, 3), rnd(1, 5), d[2] * 9 + rnd(-3, 3)], life: rnd(0.4, 0.9), s0: 0.13, s1: 0.02, c0: [1, 0.5, 0.1, 1], c1: [0.8, 0.1, 0, 0], g: 5 }); } // embers
      for (let i = 0; i < 2; i++) { const s = rnd(len * 0.35, len); fx.smoke.emit({ p: [o[0] + d[0] * s, o[1] + d[1] * s + 0.6, o[2] + d[2] * s], v: [d[0] * 4, rnd(1.5, 3), d[2] * 4], life: rnd(0.8, 1.3), s0: 0.9, s1: 3.2, c0: [0.05, 0.04, 0.035, 0.5], c1: [0.16, 0.15, 0.15, 0], rotV: rnd(-1, 1) }); } // black smoke
      if (Math.random() < 0.25) { const s = rnd(3, len * 0.8); fx.flash([o[0] + d[0] * s, o[1] + d[1] * s + 0.5, o[2] + d[2] * s], 0xff4a10, 16, 0.14, 12); } // it lights what it passes
      if (t < 0.05) fx.flash([o[0] + d[0] * 2, o[1], o[2] + d[2] * 2], 0xff8a30, 22, 0.3, 16);
      tick += dt;
      if (tick >= 0.25) { tick -= 0.25; onTick && onTick(o, d); }
    },
  });
}

// ---- Rime: Whirlpool. A disc of spinning water at `c` (radius r) for `dur` seconds, foam spiralling into its middle. onTick() four times a second.
export function whirlpool(g, c, dur = 6, r = 7, onTick) {
  const fx = g.fx, scene = g.scene, gy = g.world.heightAt(c[0], c[2]);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 }, uA: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform float uT; uniform float uA; varying vec2 vUv;
      void main(){
        vec2 p = (vUv - 0.5) * 2.; float rr = length(p), a = atan(p.y, p.x);
        float arms = sin(a * 3. + pow(rr, 0.6) * 11. - uT * 7.) * 0.5 + 0.5;
        float fine = sin(a * 9. + rr * 26. - uT * 11.) * 0.5 + 0.5;
        vec3 deep = vec3(0.02, 0.1, 0.3), mid = vec3(0.1, 0.42, 0.85), foam = vec3(0.86, 0.96, 1.);
        vec3 col = mix(deep, mid, smoothstep(0.08, 0.75, rr));
        col = mix(col, foam, smoothstep(0.62, 0.95, arms) * (0.35 + 0.65 * rr) + smoothstep(0.85, 1., fine) * 0.25);
        col = mix(col, vec3(0., 0.02, 0.08), smoothstep(0.22, 0., rr));
        float al = smoothstep(1., 0.84, rr) * uA * 0.93;
        gl_FragColor = vec4(col, al);
      }`,
  });
  const geo = new THREE.CircleGeometry(r, 56).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat); m.position.set(c[0], gy + 0.18, c[2]); m.renderOrder = 2; scene.add(m);
  fx.shockwave([c[0], gy, c[2]], r, 0x6fc0ff, 0.4);
  fx.flash([c[0], gy + 1.5, c[2]], 0x6fb8ff, 18, 0.35, 16);
  let tick = 0;
  fx.add({
    dur: dur + 0.5,
    update: (dt, t) => {
      mat.uniforms.uT.value = t;
      mat.uniforms.uA.value = Math.min(1, t * 3) * Math.min(1, Math.max(0, (dur + 0.5 - t) * 2));
      if (t < dur) {
        for (let i = 0; i < fx.n(7); i++) {
          const a = Math.random() * 6.28, rr = rnd(1, r);
          fx.glow.emit({ p: [c[0] + Math.cos(a) * rr, gy + 0.3, c[2] + Math.sin(a) * rr], v: [-Math.sin(a) * 9 - Math.cos(a) * 4, 0.3, Math.cos(a) * 9 - Math.sin(a) * 4], life: rnd(0.3, 0.55), s0: 0.5, s1: 0.15, c0: [0.85, 0.95, 1, 0.75], c1: [0.6, 0.85, 1, 0], drag: 0.5 });
        }
        for (let i = 0; i < fx.n(3); i++) { const a = Math.random() * 6.28, rr = rnd(0, 1.6); fx.shard.emit({ p: [c[0] + Math.cos(a) * rr, gy + 0.3, c[2] + Math.sin(a) * rr], v: [rnd(-2, 2), rnd(4, 8), rnd(-2, 2)], life: rnd(0.4, 0.7), s0: 0.2, s1: 0.05, c0: [0.8, 0.93, 1, 0.9], c1: [0.6, 0.85, 1, 0], g: 14 }); }
        if (Math.random() < 0.5) { const a = Math.random() * 6.28; fx.smoke.emit({ p: [c[0] + Math.cos(a) * r * 0.8, gy + 0.4, c[2] + Math.sin(a) * r * 0.8], v: [-Math.sin(a) * 4, 0.5, Math.cos(a) * 4], life: 1, s0: 1, s1: 2.6, c0: [0.75, 0.88, 1, 0.25], c1: [0.75, 0.88, 1, 0] }); }
        tick += dt;
        if (tick >= 0.25) { tick -= 0.25; onTick && onTick(); }
      }
    },
    dispose: () => { scene.remove(m); geo.dispose(); mat.dispose(); },
  });
}

// ---- Rime: Pressure Jet. A thin, hard stream of water from o along d (follow() returns { o, d }, null ends it), `len` m long. onTick(o, d) five times a second.
let JET_N = 0;
export function jet(g, follow, dur = 2.5, len = 45, onTick) {
  const fx = g.fx, key = 'pj' + (JET_N++ % 64);
  let tick = 0.2;
  fx.add({
    dur,
    update: (dt, t) => {
      const f = follow();
      if (!f) return false;
      const o = f.o, d = f.d;
      // it stops where it meets the ground
      let L = len; for (let s = 2; s < len; s += 1.5) { if (o[1] + d[1] * s < g.world.heightAt(o[0] + d[0] * s, o[2] + d[2] * s)) { L = s; break; } }
      const e = [o[0] + d[0] * L, o[1] + d[1] * L, o[2] + d[2] * L], wob = 1 + Math.sin(t * 60) * 0.12;
      fx.beam(key, o, e, { color: [0.35, 0.7, 1], core: [0.92, 0.98, 1], width: 0.32 * wob, life: 0.09, ripple: false });
      fx.beam(key + 'h', o, e, { color: [0.3, 0.6, 1], core: [0.5, 0.8, 1], width: 0.9 * wob, life: 0.09, ripple: false, alpha: 0.25 });
      for (let i = 0; i < fx.n(8); i++) { const s = Math.random() * L; fx.shard.emit({ p: [o[0] + d[0] * s, o[1] + d[1] * s, o[2] + d[2] * s], v: [d[0] * 20 + rnd(-2.5, 2.5), d[1] * 20 + rnd(-1, 3), d[2] * 20 + rnd(-2.5, 2.5)], life: rnd(0.15, 0.35), s0: 0.16, s1: 0.04, c0: [0.85, 0.95, 1, 0.9], c1: [0.6, 0.85, 1, 0], g: 10 }); }
      fx.glow.emit({ p: [o[0] + d[0] * 0.3, o[1] + d[1] * 0.3, o[2] + d[2] * 0.3], life: 0.07, s0: 1, s1: 1, c0: [0.8, 0.93, 1, 0.8], c1: [0.6, 0.85, 1, 0.5] });
      for (let i = 0; i < fx.n(4); i++) fx.shard.emit({ p: [...e], v: [rnd(-5, 5), rnd(2, 8), rnd(-5, 5)], life: rnd(0.3, 0.6), s0: 0.3, s1: 0.05, c0: [0.85, 0.95, 1, 1], c1: [0.6, 0.85, 1, 0], g: 14 });
      if (Math.random() < 0.6) fx.smoke.emit({ p: [...e], v: [rnd(-1, 1), 1.5, rnd(-1, 1)], life: 0.7, s0: 0.8, s1: 2.2, c0: [0.8, 0.92, 1, 0.3], c1: [0.8, 0.92, 1, 0] });
      tick += dt;
      if (tick >= 0.2) { tick -= 0.2; onTick && onTick(o, d, L); }
    },
  });
}

// ---- Rime: Snowball. A ball of packed snow rolls where follow() says: { p: [x, y, z], r } (null ends it in a burst of snow).
let SNOW_MAT = null;
export function snowball(g, follow, onEnd) {
  const fx = g.fx, scene = g.scene;
  SNOW_MAT = SNOW_MAT || scanSurface('snow_02', 3, 2, { color: 0xffffff, roughness: 0.92, normalScale: new THREE.Vector2(2.2, 2.2), emissive: 0x8fb0d8, emissiveIntensity: 0.05 });
  const geo = new THREE.SphereGeometry(1, 30, 22), pa = geo.attributes.position;
  for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), k = 1 + (Math.sin(x * 7.1 + y * 3.3) * Math.sin(z * 6.3 + x * 2.1) + Math.sin(y * 9.7 + z * 4.4) * 0.5) * 0.06 + Math.sin(x * 23.1 + z * 17.3) * Math.sin(y * 19.7) * 0.012; pa.setXYZ(i, x * k, y * k, z * k); }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, SNOW_MAT); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  const last = new THREE.Vector3(), ax = new THREE.Vector3(), mv = new THREE.Vector3();
  let first = true, lastR = 1;
  const puff = (p, r, n) => { for (let i = 0; i < fx.n(n); i++) { const a = Math.random() * 6.28; fx.smoke.emit({ p: [p[0] + Math.cos(a) * r * 0.7, p[1] + rnd(0.1, r), p[2] + Math.sin(a) * r * 0.7], v: [Math.cos(a) * rnd(2, 6), rnd(1, 5), Math.sin(a) * rnd(2, 6)], life: rnd(0.5, 1), s0: 0.9, s1: 2.6, c0: [0.96, 0.98, 1, 0.6], c1: [0.96, 0.98, 1, 0], drag: 1.5 }); fx.shard.emit({ p: [p[0], p[1] + r, p[2]], v: [Math.cos(a) * rnd(3, 9), rnd(2, 8), Math.sin(a) * rnd(3, 9)], life: rnd(0.4, 0.8), s0: 0.3, s1: 0.06, c0: [1, 1, 1, 1], c1: [0.8, 0.9, 1, 0], g: 12 }); } };
  fx.add({
    dur: 60,
    update: (dt, t) => {
      const f = follow();
      if (!f) { puff([last.x, last.y - lastR, last.z], lastR, 22); onEnd && onEnd(); return false; }
      const r = f.r; lastR = r;
      m.scale.setScalar(r * Math.min(1, 0.3 + t * 4));
      m.position.set(f.p[0], f.p[1] + r, f.p[2]);
      if (first) { first = false; last.copy(m.position); puff(f.p, r, 12); }
      mv.copy(m.position).sub(last); mv.y = 0; const dist = mv.length();
      if (dist > 0.0005) { ax.set(mv.z, 0, -mv.x).normalize(); m.rotateOnWorldAxis(ax, dist / r); // it really rolls
        if (Math.random() < 0.7) fx.smoke.emit({ p: [f.p[0] + rnd(-r, r) * 0.5, f.p[1] + 0.2, f.p[2] + rnd(-r, r) * 0.5], v: [rnd(-1, 1), rnd(0.5, 2), rnd(-1, 1)], life: rnd(0.5, 0.9), s0: 0.6, s1: 1.8, c0: [0.96, 0.98, 1, 0.45], c1: [0.96, 0.98, 1, 0], drag: 1.5 });
        if (Math.random() < 0.5) fx.shard.emit({ p: [f.p[0], f.p[1] + 0.2, f.p[2]], v: [rnd(-3, 3), rnd(1, 4), rnd(-3, 3)], life: 0.5, s0: 0.2, s1: 0.05, c0: [1, 1, 1, 1], c1: [0.8, 0.9, 1, 0], g: 12 }); }
      last.copy(m.position);
    },
    dispose: () => { scene.remove(m); geo.dispose(); },
  });
}

// ---- Tempest: Tesla Fence. Two coil posts and three live wires between them that follow the ground, however far apart.
// Returns a handle: post(p) plants a post (the second one strings the fence), hp(f) sets the health bar (0..1), end(boom) removes it.
// onFrame(dt) runs every frame while the fence is strung (caster only).
let POST_MAT = null, COIL_MAT = null, BAR_GEO = null, BAR_BG = null;
export function fence(g, onFrame) {
  const fx = g.fx, scene = g.scene;
  POST_MAT = POST_MAT || new THREE.MeshStandardMaterial({ color: 0xf4f6fa, roughness: 0.05, metalness: 1, envMap: g.envTex || null, envMapIntensity: 2.4 }); // polished chrome: it mirrors the sky and the lightning
  COIL_MAT = COIL_MAT || new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.03, metalness: 1, envMap: g.envTex || null, envMapIntensity: 2.8, emissive: 0x7a4cff, emissiveIntensity: 0.22 });
  BAR_GEO = BAR_GEO || new THREE.PlaneGeometry(1, 0.16);
  BAR_BG = BAR_BG || new THREE.MeshBasicMaterial({ color: 0x0a0a12, transparent: true, opacity: 0.8, depthTest: false });
  const H = 3.3, root = new THREE.Group(); scene.add(root);
  const posts = [], bars = [], disp = [];
  const wireMat = new THREE.MeshBasicMaterial({ color: 0xc9b4ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const haloMat = new THREE.MeshBasicMaterial({ color: 0x7a4cff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false });
  const barFg = new THREE.MeshBasicMaterial({ color: 0xb57bff, depthTest: false });
  const timeFg = new THREE.MeshBasicMaterial({ color: 0xf2f2f2, depthTest: false });
  const orbMat = new THREE.MeshBasicMaterial({ color: 0xe6dcff });
  disp.push(wireMat, haloMat, barFg, orbMat, timeFg);
  let path = null, frac = 1, len = 0, left = 1;
  const h = { alive: true, strung: false, a: null, b: null };
  const mkPost = (p) => {
    const gy = g.world.heightAt(p[0], p[2]), o = new THREE.Group(); o.position.set(p[0], gy, p[2]);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.35, 10), POST_MAT); base.position.y = 0.17;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, H, 8), POST_MAT); pole.position.y = H / 2;
    o.add(base, pole); disp.push(base.geometry, pole.geometry);
    const ring = new THREE.TorusGeometry(0.27, 0.055, 6, 14).rotateX(Math.PI / 2); disp.push(ring);
    for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(ring, COIL_MAT); r.position.y = 1 + i * 0.36; o.add(r); }
    const og = new THREE.SphereGeometry(0.3, 12, 10); disp.push(og);
    const orb = new THREE.Mesh(og, orbMat); orb.position.y = H + 0.25; o.add(orb);
    o.traverse((m) => { if (m.isMesh && m !== orb) m.castShadow = true; });
    // its health bar
    const bar = new THREE.Group(), bg = new THREE.Mesh(BAR_GEO, BAR_BG), fg = new THREE.Mesh(BAR_GEO, barFg);
    bg.scale.set(2.5, 1.5, 1); fg.scale.x = 2.4; fg.position.z = 0.001; bg.renderOrder = fg.renderOrder = 9; bar.add(bg, fg); bar.position.set(p[0], gy + H + 1.1, p[2]); bar.userData.fg = fg; bar.visible = false;
    const tf = new THREE.Mesh(BAR_GEO, timeFg); tf.scale.set(2.4, 0.35, 1); tf.position.set(0, -0.17, 0.002); tf.renderOrder = 9; bar.add(tf); bar.userData.tf = tf; // the thin line under it is the time left
    root.add(o, bar); bars.push(bar);
    fx.bolt([p[0], gy + 14, p[2]], [p[0], gy + H, p[2]], { width: 0.5, dur: 0.25, color: 0xd0b8ff, branches: 2 });
    fx.flash([p[0], gy + 2, p[2]], 0xb89cff, 26, 0.3, 14);
    fx.shockwave([p[0], gy, p[2]], 3, 0xb89cff, 0.35);
    return [p[0], gy, p[2]];
  };
  h.post = (p) => {
    if (!h.alive || posts.length >= 2) return;
    posts.push(mkPost(p));
    if (posts.length === 1) { h.a = posts[0]; return; }
    h.b = posts[1];
    const a = h.a, b = h.b; len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const n = Math.max(2, Math.min(90, Math.round(len / 2.5)));
    path = [];
    for (let i = 0; i <= n; i++) { const k = i / n, x = a[0] + (b[0] - a[0]) * k, z = a[2] + (b[2] - a[2]) * k; path.push([x, Math.max(g.world.heightAt(x, z), a[1] + (b[1] - a[1]) * k - 1.5), z]); }
    path[0][1] = a[1]; path[n][1] = b[1];
    for (const hy of [0.75, 1.65, 2.55]) {
      const curve = new THREE.CatmullRomCurve3(path.map((q) => new THREE.Vector3(q[0], q[1] + hy, q[2])));
      const tg = new THREE.TubeGeometry(curve, n * 2, 0.045, 5, false), hg = new THREE.TubeGeometry(curve, n * 2, 0.17, 5, false);
      disp.push(tg, hg);
      const w = new THREE.Mesh(tg, wireMat), ha = new THREE.Mesh(hg, haloMat); w.frustumCulled = ha.frustumCulled = false; root.add(w, ha);
    }
    for (const bar of bars) bar.visible = true;
    h.strung = true;
    fx.bolt([a[0], a[1] + H, a[2]], [b[0], b[1] + H, b[2]], { width: 0.6, dur: 0.3, color: 0xd0b8ff, branches: 3 });
  };
  h.hp = (f) => { frac = Math.max(0, Math.min(1, f)); };
  h.time = (f) => { left = Math.max(0, Math.min(1, f)); };
  let born = -1;
  // a hit on the line at k (0..1): sparks and a crack of lightning there
  h.zap = (k) => {
    if (!path) return;
    const q = path[Math.max(0, Math.min(path.length - 1, Math.round(k * (path.length - 1))))];
    fx.flash([q[0], q[1] + 1.6, q[2]], 0xd0b8ff, 30, 0.2, 14);
    fx.bolt([q[0], q[1] + 2.8, q[2]], [q[0] + rnd(-1, 1), q[1] + 0.1, q[2] + rnd(-1, 1)], { width: 0.45, dur: 0.18, color: 0xe0d0ff, branches: 2 });
    for (let i = 0; i < fx.n(16); i++) fx.spark.emit({ p: [q[0], q[1] + rnd(0.5, 2.6), q[2]], v: [rnd(-7, 7), rnd(0, 7), rnd(-7, 7)], life: rnd(0.2, 0.5), s0: 0.3, s1: 0.05, c0: [0.9, 0.85, 1, 1], c1: [0.6, 0.4, 1, 0], g: 8 });
  };
  h.end = (boom) => {
    if (!h.alive) return;
    h.alive = false;
    if (boom) for (const p of posts) { fx.shockwave([p[0], p[1], p[2]], 5, 0xb89cff, 0.4); fx.flash([p[0], p[1] + 2, p[2]], 0xd0b8ff, 34, 0.35, 18); for (let i = 0; i < fx.n(22); i++) fx.spark.emit({ p: [p[0], p[1] + rnd(0.3, H), p[2]], v: [rnd(-8, 8), rnd(1, 9), rnd(-8, 8)], life: rnd(0.3, 0.7), s0: 0.35, s1: 0.05, c0: [0.9, 0.85, 1, 1], c1: [0.6, 0.4, 1, 0], g: 9 }); }
  };
  fx.add({
    dur: 1e9,
    update: (dt, t) => {
      if (!h.alive) return false;
      const fl = 0.75 + Math.sin(t * 47) * 0.12 + Math.random() * 0.13;
      wireMat.opacity = fl; haloMat.opacity = 0.2 + fl * 0.14;
      for (const bar of bars) { if (!bar.visible) continue; bar.quaternion.copy(g.camera.quaternion); const d = Math.max(1, bar.position.distanceTo(g.camera.position) / 22); bar.scale.setScalar(Math.min(6, d)); const fg = bar.userData.fg; fg.scale.x = Math.max(0.001, 2.4 * frac); fg.position.x = -(2.4 - 2.4 * frac) / 2; const tf = bar.userData.tf; tf.scale.x = Math.max(0.001, 2.4 * left); tf.position.x = -(2.4 - 2.4 * left) / 2; }
      if (path && !onFrame) { if (born < 0) born = t; left = Math.max(0, 1 - (t - born) / 15); } // other players' copies count down on their own
      for (const p of posts) { fx.glow.emit({ p: [p[0], p[1] + H + 0.25, p[2]], life: 0.07, s0: 1.5 + fl, s1: 1.5 + fl, c0: [0.75, 0.6, 1, 0.6], c1: [0.7, 0.5, 1, 0.4] }); if (Math.random() < 0.12) fx.bolt([p[0], p[1] + H + 0.25, p[2]], [p[0] + rnd(-1.4, 1.4), p[1] + rnd(0.2, 2.5), p[2] + rnd(-1.4, 1.4)], { width: 0.16, dur: 0.1, color: 0xc8b8ff, branches: 0 }); }
      if (path) {
        // arcs hop between the wires here and there along the line
        // the wires never stop crackling: jagged current runs along all three, the whole length of the line
        const runs = Math.min(9, 3 + Math.floor(len / 8));
        for (let i = 0; i < runs; i++) { const j = Math.floor(Math.random() * (path.length - 1)), q = path[j], q2 = path[j + 1], hy = [0.75, 1.65, 2.55][Math.floor(Math.random() * 3)]; fx.bolt([q[0], q[1] + hy, q[2]], [q2[0], q2[1] + hy, q2[2]], { width: 0.2, dur: 0.07, color: 0xe6dcff, jag: 0.3, branches: Math.random() < 0.25 ? 1 : 0 }); }
        if (Math.random() < 0.25) { const q = path[Math.floor(Math.random() * path.length)]; fx.flash([q[0], q[1] + 1.6, q[2]], 0xc0a8ff, 9, 0.08, 9); }
        const tries = Math.min(6, 2 + Math.floor(len / 20));
        for (let i = 0; i < tries; i++) if (Math.random() < 0.55) { const j = Math.floor(Math.random() * (path.length - 1)), q = path[j], q2 = path[j + 1]; fx.bolt([q[0], q[1] + rnd(0.7, 2.6), q[2]], [q2[0], q2[1] + rnd(0.7, 2.6), q2[2]], { width: 0.14, dur: 0.1, color: 0xd8c8ff, branches: 0 }); }
        for (let i = 0; i < fx.n(5); i++) { const q = path[Math.floor(Math.random() * path.length)]; fx.spark.emit({ p: [q[0], q[1] + rnd(0.7, 2.6), q[2]], v: [rnd(-1.5, 1.5), rnd(0, 2.5), rnd(-1.5, 1.5)], life: rnd(0.15, 0.35), s0: 0.2, s1: 0.04, c0: [0.9, 0.85, 1, 1], c1: [0.6, 0.4, 1, 0] }); }
        onFrame && onFrame(dt);
      }
    },
    dispose: () => { h.alive = false; scene.remove(root); for (const d of disp) d.dispose(); },
  });
  return h;
}

// ---- Necromancer: Life Drain. A pulsing red cord from the victim to the caster, blood pulled along it. from()/to() return [x, y, z] (null ends it).
let DRAIN_N = 0;
export function drain(g, from, to, dur = 3) {
  const fx = g.fx, key = 'ld' + (DRAIN_N++ % 64);
  fx.add({
    dur,
    update: (dt, t) => {
      const a = to(dt), b = from();
      if (!a || !b) return false;
      const pulse = 1 + Math.sin(t * 18) * 0.25;
      fx.beam(key, a, b, { color: [0.9, 0.02, 0.03], core: [1, 0.3, 0.25], width: 0.4 * pulse, life: 0.09, sag: 0.6, ripple: true });
      fx.beam(key + 'h', a, b, { color: [0.6, 0, 0.02], core: [0.8, 0.05, 0.05], width: 1.1 * pulse, life: 0.09, sag: 0.6, alpha: 0.35, ripple: false });
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1, sp = Math.max(9, L / 0.45);
      // blood torn out of the victim and pulled along the cord into the caster
      for (let i = 0; i < fx.n(9); i++) fx.debris.emit({ p: [a[0] + rnd(-0.35, 0.35), a[1] + rnd(-0.5, 0.5), a[2] + rnd(-0.35, 0.35)], v: [dx / L * sp + rnd(-1.2, 1.2), dy / L * sp + rnd(0, 2.2), dz / L * sp + rnd(-1.2, 1.2)], life: L / sp, s0: rnd(0.12, 0.24), s1: 0.06, c0: [0.6, 0.01, 0.02, 1], c1: [0.3, 0, 0, 0.6], g: 3 });
      for (let i = 0; i < fx.n(2); i++) fx.debris.emit({ p: [a[0] + rnd(-0.3, 0.3), a[1] + rnd(-0.6, 0.4), a[2] + rnd(-0.3, 0.3)], v: [rnd(-1.5, 1.5), rnd(-0.5, 1.5), rnd(-1.5, 1.5)], life: rnd(0.4, 0.7), s0: 0.1, s1: 0.05, c0: [0.5, 0.01, 0.02, 1], c1: [0.3, 0, 0, 0], g: 12 }); // it drips
      fx.glow.emit({ p: a, life: 0.08, s0: 1.5 * pulse, s1: 1.5 * pulse, c0: [0.8, 0.02, 0.03, 0.4], c1: [0.6, 0, 0, 0.25] });
      fx.glow.emit({ p: b, life: 0.08, s0: 1.1 * pulse, s1: 1.1 * pulse, c0: [0.9, 0.1, 0.1, 0.35], c1: [0.7, 0, 0, 0.2] });
    },
  });
}

// ---- Necromancer: Acid Splash. A huge bubbling pool of acid at `c` (radius r) for `dur` s. onTick() twice a second (it keeps ticking 3 s after the pool dries, for the poison).
export function acid(g, c, dur = 8, r = 9, onTick) {
  const fx = g.fx, scene = g.scene, gy = g.world.heightAt(c[0], c[2]);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uT: { value: 0 }, uA: { value: 0 }, uG: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform float uT; uniform float uA; uniform float uG; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1., 0.)), f.x), mix(h(i + vec2(0., 1.)), h(i + vec2(1., 1.)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.; for (int i = 0; i < 4; i++) { s += a * n(p); p *= 2.03; a *= 0.5; } return s; }
      void main(){
        vec2 p = (vUv - 0.5) * 2.; float rr = length(p), a = atan(p.y, p.x);
        float edge = uG * (0.82 + 0.16 * fbm(vec2(a * 2.2, 3.7)) + 0.05 * sin(a * 9. + 1.3)); // a ragged, splashed outline
        float body = smoothstep(edge, edge - 0.07, rr);
        float flow = fbm(p * 5. + vec2(uT * 0.25, -uT * 0.18)) + 0.5 * fbm(p * 11. - vec2(uT * 0.4, uT * 0.3));
        vec3 deep = vec3(0.012, 0.045, 0.006), mid = vec3(0.1, 0.24, 0.02), hot = vec3(0.42, 0.62, 0.12);
        vec3 col = mix(deep, mid, smoothstep(0.35, 0.95, flow));
        // bubbles swell and pop on a grid that drifts
        vec2 g2 = p * 17. + vec2(0., uT * 0.15), cell = floor(g2), f = fract(g2) - 0.5;
        float ph = fract(h(cell) * 7. + uT * (0.35 + h(cell + 3.) * 0.5)), br = 0.1 + 0.3 * ph;
        float ring = smoothstep(0.05, 0., abs(length(f + (vec2(h(cell + 1.), h(cell + 2.)) - 0.5) * 0.4) - br)) * (1. - ph) * step(0.45, h(cell + 5.));
        col = mix(col, hot, ring * 0.7);
        col = mix(col, deep * 0.5, smoothstep(0.5, 0.2, fbm(p * 3.2 + 7.)) * 0.6); // darker, deeper patches
        col += hot * smoothstep(0.08, 0., edge - rr) * 0.22 * body; // the wet, bright rim
        col += vec3(0.7, 0.85, 0.45) * pow(smoothstep(0.8, 1., flow), 4.) * 0.3; // glints on the surface
        gl_FragColor = vec4(col, body * uA * 0.94);
      }`,
  });
  const geo = new THREE.CircleGeometry(r * 1.08, 64).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat); m.position.set(c[0], gy + 0.16, c[2]); m.renderOrder = 2; scene.add(m);
  fx.flash([c[0], gy + 1.5, c[2]], 0x7fc040, 7, 0.3, 14);
  for (let i = 0; i < fx.n(40); i++) { const a = Math.random() * 6.28, v = rnd(4, 13); fx.debris.emit({ p: [c[0], gy + 0.6, c[2]], v: [Math.cos(a) * v, rnd(3, 8), Math.sin(a) * v], life: rnd(0.5, 0.9), s0: rnd(0.12, 0.28), s1: 0.05, c0: [0.5, 0.95, 0.15, 1], c1: [0.25, 0.6, 0.05, 0], g: 16 }); } // the splash
  let tick = 0.5;
  fx.add({
    dur: dur + 3.2,
    update: (dt, t) => {
      mat.uniforms.uT.value = t;
      mat.uniforms.uG.value = Math.min(1, 0.25 + t * 2.2);
      mat.uniforms.uA.value = Math.min(1, t * 5) * Math.min(1, Math.max(0, (dur + 0.6 - t) / 0.6));
      if (t < dur) {
        for (let i = 0; i < fx.n(4); i++) { const a = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * r * 0.9; fx.debris.emit({ p: [c[0] + Math.cos(a) * rr, gy + 0.25, c[2] + Math.sin(a) * rr], v: [rnd(-0.5, 0.5), rnd(1.5, 4), rnd(-0.5, 0.5)], life: rnd(0.3, 0.6), s0: rnd(0.08, 0.2), s1: 0.03, c0: [0.65, 1, 0.25, 1], c1: [0.3, 0.7, 0.05, 0], g: 12 }); } // spitting bubbles
        for (let i = 0; i < fx.n(2); i++) { const a = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * r * 0.85; fx.smoke.emit({ p: [c[0] + Math.cos(a) * rr, gy + 0.4, c[2] + Math.sin(a) * rr], v: [rnd(-0.4, 0.4), rnd(0.8, 1.8), rnd(-0.4, 0.4)], life: rnd(1.2, 2), s0: 0.8, s1: 3, c0: [0.35, 0.55, 0.12, 0.3], c1: [0.4, 0.6, 0.2, 0], rotV: rnd(-0.5, 0.5) }); } // fumes
        if (Math.random() < 0.1) { const a = Math.random() * 6.28, rr = Math.random() * r * 0.7; fx.flash([c[0] + Math.cos(a) * rr, gy + 0.8, c[2] + Math.sin(a) * rr], 0x6fa83a, 3, 0.3, 7); }
      }
      tick -= dt;
      if (tick <= 0) { tick = 0.5; onTick && onTick(t < dur); }
    },
    dispose: () => { scene.remove(m); geo.dispose(); mat.dispose(); },
  });
}
// Poison showing on a body: green drips and a sick haze at p (its chest).
export function poisonDrip(g, p) {
  const fx = g.fx;
  for (let i = 0; i < fx.n(5); i++) fx.debris.emit({ p: [p[0] + rnd(-0.35, 0.35), p[1] + rnd(-0.3, 0.5), p[2] + rnd(-0.35, 0.35)], v: [rnd(-0.6, 0.6), rnd(-0.5, 1), rnd(-0.6, 0.6)], life: rnd(0.4, 0.7), s0: 0.1, s1: 0.04, c0: [0.55, 1, 0.2, 1], c1: [0.25, 0.6, 0.05, 0], g: 10 });
  fx.smoke.emit({ p: [p[0], p[1] + 0.3, p[2]], v: [0, 0.9, 0], life: 0.8, s0: 0.7, s1: 1.8, c0: [0.35, 0.6, 0.12, 0.35], c1: [0.4, 0.6, 0.2, 0] });
}

// ---- Necromancer: Raise the Dead. Grave light bursts from the ground round the caster and keeps seeping up while the power runs.
export function raise(g, follow, dur = 10) {
  const fx = g.fx, p0 = follow();
  if (p0) { fx.shockwave([p0[0], g.world.heightAt(p0[0], p0[2]), p0[2]], 9, 0x5aff9a, 0.6); fx.flash([p0[0], p0[1] + 1.2, p0[2]], 0x5aff9a, 26, 0.45, 18); }
  fx.add({
    dur,
    update: (dt, t) => {
      const p = follow();
      if (!p) return false;
      const k = t < 0.6 ? 6 : 1;
      for (let i = 0; i < fx.n(2 * k); i++) { const a = Math.random() * 6.28, rr = rnd(0.6, t < 0.6 ? 8 : 2.2), x = p[0] + Math.cos(a) * rr, z = p[2] + Math.sin(a) * rr; fx.glow.emit({ p: [x, g.world.heightAt(x, z) + 0.1, z], v: [0, rnd(1.5, 4), 0], life: rnd(0.5, 0.9), s0: 0.4, s1: 0.08, c0: [0.4, 1, 0.55, 0.85], c1: [0.1, 0.7, 0.3, 0] }); }
      if (Math.random() < 0.3 * k) { const a = Math.random() * 6.28, rr = rnd(0.5, 2.5), x = p[0] + Math.cos(a) * rr, z = p[2] + Math.sin(a) * rr; fx.smoke.emit({ p: [x, g.world.heightAt(x, z) + 0.2, z], v: [0, 0.8, 0], life: 1.4, s0: 0.8, s1: 2.4, c0: [0.1, 0.22, 0.14, 0.4], c1: [0.15, 0.3, 0.2, 0] }); }
    },
  });
}

// ================= Necromancer, part two =================
// A soul: a pale figure with hollow eyes whose body thins away into a trailing wisp. Painted once, used on a sprite.
let SOUL_TEX = null;
function soulTex() {
  if (SOUL_TEX) return SOUL_TEX;
  const W = 256, H = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const blob = (cx, cy, rx, ry, a) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, 1); g.addColorStop(0, `rgba(235,248,255,${a})`); g.addColorStop(0.55, `rgba(170,215,255,${a * 0.55})`); g.addColorStop(1, 'rgba(120,180,255,0)'); x.save(); x.translate(cx, cy); x.scale(rx, ry); x.translate(-cx, -cy); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, 1, 0, 6.3); x.fill(); x.restore(); };
  blob(128, 250, 120, 250, 0.22); // the haze round it
  blob(128, 92, 50, 58, 0.95); // head
  blob(128, 190, 78, 84, 0.8); // shoulders and chest
  blob(60, 215, 30, 80, 0.5); blob(196, 215, 30, 80, 0.5); // arms hanging
  for (let i = 0; i < 9; i++) blob(128 + Math.sin(i * 1.1) * (26 - i * 2), 270 + i * 26, 58 - i * 5.5, 40, 0.62 - i * 0.06); // the body thins into a tail
  x.globalCompositeOperation = 'destination-out';
  const hole = (cx, cy, rx, ry) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, 1); g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(0.7, 'rgba(0,0,0,0.7)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.save(); x.translate(cx, cy); x.scale(rx, ry); x.translate(-cx, -cy); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, 1, 0, 6.3); x.fill(); x.restore(); };
  hole(109, 84, 9, 11); hole(147, 84, 9, 11); hole(128, 104, 4, 7); hole(128, 128, 9, 20); // sunken eye sockets, the nose hollow and a long slack jaw
  for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.1})`; x.fillRect(Math.random() * W, 150 + Math.random() * 360, 1 + Math.random() * 3, 30 + Math.random() * 90); } // torn, streaming edges
  SOUL_TEX = new THREE.CanvasTexture(cv); SOUL_TEX.colorSpace = THREE.SRGBColorSpace;
  return SOUL_TEX;
}
// Finger of Death: the soul leaves the body at p (its feet), drifts up, sways, thins and is gone. h = the body's height.
export function soul(g, p, h = 2.2) {
  const fx = g.fx, scene = g.scene;
  const mat = new THREE.SpriteMaterial({ map: soulTex(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xdff0ff });
  const sp = new THREE.Sprite(mat); sp.center.set(0.5, 0); scene.add(sp);
  const ph = Math.random() * 6, dur = 2.6;
  fx.flash([p[0], p[1] + h * 0.6, p[2]], 0xbfe0ff, 10, 0.3, 8);
  for (let i = 0; i < fx.n(10); i++) fx.glow.emit({ p: [p[0] + rnd(-0.4, 0.4), p[1] + rnd(0.2, h), p[2] + rnd(-0.4, 0.4)], v: [rnd(-0.6, 0.6), rnd(0.5, 2), rnd(-0.6, 0.6)], life: rnd(0.5, 1), s0: 0.3, s1: 0.05, c0: [0.8, 0.92, 1, 0.8], c1: [0.5, 0.7, 1, 0] });
  fx.add({
    dur,
    update: (dt, t) => {
      const k = t / dur, e = k * k * (3 - 2 * k), y = p[1] + h * 0.15 + e * (h + 4.2);
      const sx = Math.sin(t * 2.3 + ph) * 0.35 * k, sz = Math.cos(t * 1.9 + ph) * 0.3 * k;
      sp.position.set(p[0] + sx, y, p[2] + sz);
      const w = h * 0.62 * (1 - k * 0.25) * (1 + Math.sin(t * 7 + ph) * 0.04);
      sp.scale.set(w, h * 1.25 * (1 + k * 0.7), 1); // it stretches as it rises
      mat.opacity = Math.min(1, t * 4) * (1 - Math.pow(k, 2.2)) * 0.95;
      mat.rotation = Math.sin(t * 2.3 + ph) * 0.12;
      if (Math.random() < 0.8) fx.glow.emit({ p: [sp.position.x + rnd(-0.25, 0.25), y + rnd(0, h * 0.5), sp.position.z + rnd(-0.25, 0.25)], v: [0, -0.6, 0], life: rnd(0.4, 0.8), s0: 0.22, s1: 0.03, c0: [0.75, 0.9, 1, 0.55 * (1 - k)], c1: [0.5, 0.7, 1, 0] });
    },
    dispose: () => { scene.remove(sp); mat.dispose(); },
  });
}

// ---- Reaper's Scythe: a giant ghostly scythe sweeps one full circle round the caster. onSweep(angle) every frame (caster only).
let SCYTHE = null;
function scytheGeo() {
  if (SCYTHE) return SCYTHE;
  const sh = new THREE.Shape(); // the blade: a long crescent, seen from above, hooked back from the end of the shaft
  sh.moveTo(0, 0); sh.quadraticCurveTo(1.4, 1.1, 1.2, 3.6); sh.quadraticCurveTo(0.95, 5.2, -0.6, 6.4); sh.quadraticCurveTo(0.45, 4.6, 0.35, 3.2); sh.quadraticCurveTo(0.25, 1.4, -0.45, 0.35); sh.lineTo(0, 0);
  const blade = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 18 }).rotateX(-Math.PI / 2).translate(0, 0.03, 0);
  const shaft = new THREE.CylinderGeometry(0.09, 0.12, 6.4, 8).rotateZ(Math.PI / 2).translate(-3.2, 0, 0);
  const collar = new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8).rotateZ(Math.PI / 2).translate(-0.1, 0, 0);
  SCYTHE = { blade, shaft: mergeGeometries([shaft.toNonIndexed(), collar.toNonIndexed()]) };
  return SCYTHE;
}
export function scythe(g, follow, a0 = 0, onSweep, R = 7.5, dur = 0.75) {
  const fx = g.fx, scene = g.scene, G = scytheGeo();
  const bm = new THREE.MeshPhysicalMaterial({ color: 0xcfeaff, emissive: 0x6fb8ff, emissiveIntensity: 1.3, metalness: 0.9, roughness: 0.15, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const smat = new THREE.MeshStandardMaterial({ color: 0x2a3340, emissive: 0x3a6a9a, emissiveIntensity: 0.6, roughness: 0.6, transparent: true, opacity: 0, depthWrite: false });
  const grp = new THREE.Group(), arm = new THREE.Group();
  const blade = new THREE.Mesh(G.blade, bm), shaft = new THREE.Mesh(G.shaft, smat);
  arm.add(blade, shaft); arm.position.x = R - 0.6; arm.rotation.x = -0.75; grp.add(arm); scene.add(grp); // the blade is canted, edge down, like a real reaping stroke
  const key = 'rs' + (DRAIN_N++ % 64);
  let prev = null;
  fx.add({
    dur: dur + 0.25,
    update: (dt, t) => {
      const p = follow();
      if (!p) return false;
      const k = Math.min(1, t / dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, ang = a0 + e * Math.PI * 2;
      grp.position.set(p[0], p[1] + 1.15, p[2]); grp.rotation.y = -ang;
      const op = Math.min(1, t * 10) * Math.min(1, Math.max(0, (dur + 0.25 - t) * 5));
      bm.opacity = 0.82 * op; smat.opacity = 0.7 * op;
      // the pale arc it leaves in the air, and cold motes off the edge
      const tip = [p[0] + Math.cos(ang) * R, p[1] + 1.15, p[2] + Math.sin(ang) * R];
      if (prev && k < 1) fx.beam(key + ((t * 60) | 0) % 8, prev, tip, { color: [0.55, 0.8, 1], core: [0.95, 1, 1], width: 0.55, life: 0.28, ripple: false, alpha: 0.45 });
      prev = tip;
      for (let i = 0; i < fx.n(5); i++) { const rr = rnd(R * 0.45, R); fx.glow.emit({ p: [p[0] + Math.cos(ang) * rr, p[1] + 1.15 + rnd(-0.2, 0.2), p[2] + Math.sin(ang) * rr], v: [rnd(-0.5, 0.5), rnd(0.3, 1.5), rnd(-0.5, 0.5)], life: rnd(0.3, 0.6), s0: 0.35, s1: 0.05, c0: [0.75, 0.9, 1, 0.7], c1: [0.4, 0.6, 1, 0] }); }
      if (k < 1) onSweep && onSweep(ang);
    },
    dispose: () => { scene.remove(grp); bm.dispose(); smat.dispose(); },
  });
}

// ---- Black Thorn Vines: thick black vines with thorns and black roses burst from the ground at `c` and stand for `dur` seconds.
let ROSE_GEO = null, THORN_GEO = null, VINE_MAT = null, ROSE_MAT = null, THORN_MAT = null;
function roseGeo() {
  if (ROSE_GEO) return ROSE_GEO;
  const parts = [];
  for (let ring = 0; ring < 3; ring++) { // three whorls of cupped petals, tight in the middle and open outside
    const n = 5 + ring * 2, rr = 0.07 + ring * 0.085, tilt = 0.25 + ring * 0.42;
    for (let i = 0; i < n; i++) {
      const pet = new THREE.SphereGeometry(0.13 + ring * 0.035, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1, 0.5, 0.7);
      pet.rotateX(-tilt); pet.translate(0, 0.05 - ring * 0.02, rr); pet.rotateY((i / n) * Math.PI * 2 + ring * 0.5);
      parts.push(pet.toNonIndexed());
    }
  }
  parts.push(new THREE.SphereGeometry(0.07, 8, 6).translate(0, 0.07, 0).toNonIndexed());
  ROSE_GEO = mergeGeometries(parts); ROSE_GEO.computeVertexNormals();
  return ROSE_GEO;
}
function vineMats() {
  if (VINE_MAT) return;
  const bark = scanMat('dead_tree_trunk', { tint: [0.16, 0.14, 0.15], normal: 1.6 }); // real bark, stained black
  VINE_MAT = bark || new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: 0.9 });
  THORN_MAT = new THREE.MeshStandardMaterial({ color: 0x0a0809, roughness: 0.35, metalness: 0.4 });
  ROSE_MAT = new THREE.MeshStandardMaterial({ color: 0x1c0408, roughness: 0.62, emissive: 0x240308, emissiveIntensity: 0.6, side: THREE.DoubleSide }); // black roses with a breath of dark crimson in the petals
  THORN_GEO = new THREE.ConeGeometry(0.07, 0.42, 5).translate(0, 0.21, 0);
}
export function vines(g, c, r = 7, dur = 10, onTick, onEnd) {
  const fx = g.fx, scene = g.scene, gy = g.world.heightAt(c[0], c[2]);
  vineMats();
  const root = new THREE.Group(); root.position.set(c[0], gy, c[2]); scene.add(root);
  const disp = [], stems = [], tips = [];
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), tan = new THREE.Vector3();
  const N = 16;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * 6.28 + rnd(-0.2, 0.2), rr = i === 0 ? 0 : Math.sqrt(rnd(0.08, 1)) * r * 0.85, H = rnd(3.2, 5.6) * (1 - rr / r * 0.3);
    const bx = Math.cos(a) * rr, bz = Math.sin(a) * rr, by = g.world.heightAt(c[0] + bx, c[2] + bz) - gy, ph = Math.random() * 6, lean = rnd(0.4, 1.3), tw = rnd(1.4, 2.6);
    const pts = [];
    for (let j = 0; j <= 9; j++) { const k = j / 9; pts.push(new THREE.Vector3(Math.cos(ph + k * tw * 3) * lean * k * (1.2 - k * 0.3), -0.4 + k * H, Math.sin(ph + k * tw * 3) * lean * k * (1.2 - k * 0.3))); }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.TubeGeometry(curve, 36, 0.3, 7, false), tp = tube.attributes.position, tn = tube.attributes.normal;
    for (let j = 0; j < tp.count; j++) { const k = Math.floor(j / 8) / 36, th = -(0.72 * k) * 0.3; tp.setXYZ(j, tp.getX(j) + tn.getX(j) * th, tp.getY(j) + tn.getY(j) * th, tp.getZ(j) + tn.getZ(j) * th); } // it tapers to a whip
    const parts = [], roses = [];
    for (let j = 0; j < 26; j++) { // thorns all the way up
      const k = 0.06 + Math.random() * 0.9; curve.getPointAt(k, v3); curve.getTangentAt(k, tan);
      const side = new THREE.Vector3(rnd(-1, 1), rnd(-0.2, 0.6), rnd(-1, 1)).cross(tan).normalize();
      const th = THORN_GEO.clone(); q.setFromUnitVectors(up, side); th.applyQuaternion(q); const sc = rnd(0.7, 1.5) * (1 - k * 0.4); th.scale(sc, sc, sc);
      th.translate(v3.x + side.x * 0.2 * (1 - k * 0.7), v3.y + side.y * 0.2 * (1 - k * 0.7), v3.z + side.z * 0.2 * (1 - k * 0.7)); parts.push(th);
      if (j < 3) tips.push([c[0] + bx + v3.x, gy + by + v3.y, c[2] + bz + v3.z]);
    }
    for (let j = 0; j < 3; j++) { // black roses in bloom along it
      const k = 0.45 + j * 0.24 + rnd(-0.05, 0.05); curve.getPointAt(Math.min(0.99, k), v3); curve.getTangentAt(Math.min(0.99, k), tan);
      const side = new THREE.Vector3(rnd(-1, 1), 0.6, rnd(-1, 1)).normalize();
      const ro = roseGeo().clone(); q.setFromUnitVectors(up, side); ro.applyQuaternion(q); const sc = rnd(0.85, 1.25); ro.scale(sc, sc, sc);
      ro.translate(v3.x + side.x * 0.22, v3.y + side.y * 0.22, v3.z + side.z * 0.22); roses.push(ro);
    }
    const tg = mergeGeometries(parts), rg = mergeGeometries(roses); disp.push(tube, tg, rg);
    const stem = new THREE.Group(); stem.position.set(bx, by, bz);
    const m1 = new THREE.Mesh(tube, VINE_MAT), m2 = new THREE.Mesh(tg, THORN_MAT), m3 = new THREE.Mesh(rg, ROSE_MAT);
    m1.castShadow = m2.castShadow = true;
    stem.add(m1, m2, m3); stem.scale.set(1, 0.001, 1); stem.userData = { d: rr / r * 0.35 + Math.random() * 0.15, ph };
    root.add(stem); stems.push(stem);
    fx.debris.emit({ p: [c[0] + bx, gy + by + 0.2, c[2] + bz], v: [rnd(-3, 3), rnd(3, 7), rnd(-3, 3)], life: 0.8, s0: 0.3, s1: 0.1, c0: [0.2, 0.15, 0.1, 1], c1: [0.2, 0.15, 0.1, 0], g: 14 });
  }
  fx.shockwave([c[0], gy, c[2]], r, 0x3a1020, 0.5);
  for (let i = 0; i < fx.n(26); i++) { const a = Math.random() * 6.28, rr = Math.random() * r; fx.smoke.emit({ p: [c[0] + Math.cos(a) * rr, gy + 0.2, c[2] + Math.sin(a) * rr], v: [rnd(-1, 1), rnd(1, 3), rnd(-1, 1)], life: rnd(0.8, 1.4), s0: 1, s1: 3, c0: [0.2, 0.16, 0.12, 0.5], c1: [0.25, 0.2, 0.16, 0] }); }
  let tick = 0.25, ended = false;
  fx.add({
    dur: dur + 0.7,
    update: (dt, t) => {
      for (const st of stems) {
        const k = Math.max(0, Math.min(1, (t - st.userData.d) / 0.55)), grow = 1 - Math.pow(1 - k, 3), out = t > dur ? Math.max(0, 1 - (t - dur) / 0.6) : 1;
        st.scale.set(0.4 + grow * 0.6, Math.max(0.001, grow * (1 + (1 - k) * 0.15 * Math.sin(k * 9)) * out), 0.4 + grow * 0.6);
        st.rotation.z = Math.sin(t * 1.3 + st.userData.ph) * 0.045; st.rotation.x = Math.cos(t * 1.1 + st.userData.ph) * 0.045; // they sway and writhe
        st.rotation.y = Math.sin(t * 0.5 + st.userData.ph) * 0.12;
      }
      if (t < dur) {
        if (Math.random() < 0.3) { const a = Math.random() * 6.28, rr = Math.random() * r * 0.8; fx.debris.emit({ p: [c[0] + Math.cos(a) * rr, gy + rnd(2, 4.5), c[2] + Math.sin(a) * rr], v: [rnd(-0.4, 0.4), -0.6, rnd(-0.4, 0.4)], life: 2, s0: 0.13, s1: 0.1, c0: [0.14, 0.01, 0.03, 1], c1: [0.1, 0, 0.02, 0], g: 0.6, rotV: rnd(-3, 3) }); } // a petal falls
        tick -= dt;
        if (tick <= 0) { tick = 0.25; onTick && onTick(); }
      } else if (!ended) { ended = true; onEnd && onEnd(tips); }
    },
    dispose: () => { scene.remove(root); for (const d of disp) d.dispose(); },
  });
}
// The thorns leave the vines: each one flies from near `o` to its victim (ends[i]() = [x, y, z] or null) and sticks. onHit(i) as it lands.
export function thorns(g, o, ends, onHit, from) {
  const fx = g.fx, scene = g.scene; vineMats();
  const geo = new THREE.ConeGeometry(0.09, 0.9, 5).rotateX(Math.PI / 2);
  let left = ends.length;
  if (!left) { geo.dispose(); return; }
  ends.forEach((end, i) => {
    const per = 3; // three thorns each
    for (let j = 0; j < per; j++) {
      const m = new THREE.Mesh(geo, THORN_MAT); m.castShadow = true;
      const s = from && from.length ? from[(i * per + j) % from.length] : [o[0] + rnd(-3, 3), o[1] + rnd(1.5, 4), o[2] + rnd(-3, 3)];
      const pos = new THREE.Vector3(s[0], s[1], s[2]), vel = new THREE.Vector3(rnd(-5, 5), rnd(7, 12), rnd(-5, 5));
      m.position.copy(pos); scene.add(m);
      let done = false;
      fx.add({
        dur: 3,
        update: (dt, t) => {
          if (t < j * 0.07) return;
          const e = end(); if (!e) return false;
          const to = new THREE.Vector3(e[0], e[1], e[2]).sub(pos), d = to.length();
          vel.lerp(to.normalize().multiplyScalar(42), Math.min(1, dt * (4 + t * 9)));
          pos.addScaledVector(vel, dt); m.position.copy(pos); m.lookAt(pos.x + vel.x, pos.y + vel.y, pos.z + vel.z);
          if (Math.random() < 0.6) fx.smoke.emit({ p: [pos.x, pos.y, pos.z], life: 0.3, s0: 0.2, s1: 0.5, c0: [0.08, 0.02, 0.04, 0.5], c1: [0.1, 0.03, 0.05, 0] });
          if (d < 1.2 || t > 2.8) { if (!done) { done = true; if (j === 0) onHit && onHit(i); fx.blood && fx.blood([pos.x, pos.y, pos.z], [0.35, 0.05, 0.08]); } return false; }
        },
        dispose: () => { scene.remove(m); if (--left <= -ends.length * (per - 1)) geo.dispose(); },
      });
    }
  });
}

// ---- Crow Swarm: red-eyed crows drop out of the sky onto `c` and wheel and stab at everything there for `dur` seconds. onTick() four times a second.
let CROW = null;
function crowParts() {
  if (CROW) return CROW;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
  x.fillStyle = '#0b0b10'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) { const px = Math.random() * 128, py = Math.random() * 128, l = 6 + Math.random() * 16; x.strokeStyle = `rgba(${40 + Math.random() * 40},${45 + Math.random() * 45},${70 + Math.random() * 70},${0.12 + Math.random() * 0.25})`; x.lineWidth = 0.6 + Math.random(); x.beginPath(); x.moveTo(px, py); x.lineTo(px + l, py + rnd(-1.5, 1.5)); x.stroke(); } // the blue-black sheen of feather barbs
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const mat = new THREE.MeshPhysicalMaterial({ map: tex, color: 0xffffff, roughness: 0.42, metalness: 0.25, sheen: 1, sheenColor: new THREE.Color(0x26306a), sheenRoughness: 0.35, side: THREE.DoubleSide });
  const eye = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff1408).multiplyScalar(3), toneMapped: false });
  const beakM = new THREE.MeshStandardMaterial({ color: 0x17171a, roughness: 0.3, metalness: 0.3 });
  // body faces +Z
  const body = mergeGeometries([
    new THREE.SphereGeometry(0.2, 12, 10).scale(0.85, 0.8, 1.9).toNonIndexed(),
    new THREE.SphereGeometry(0.13, 10, 8).scale(1, 1, 1.15).translate(0, 0.1, 0.4).toNonIndexed(),
    new THREE.ConeGeometry(0.16, 0.5, 6).rotateX(-Math.PI / 2).scale(1.5, 0.25, 1).translate(0, -0.02, -0.55).toNonIndexed(), // fanned tail
  ]);
  const beak = new THREE.ConeGeometry(0.045, 0.24, 6).rotateX(Math.PI / 2).translate(0, 0.08, 0.63);
  const eyes = mergeGeometries([new THREE.SphereGeometry(0.026, 6, 5).translate(0.085, 0.14, 0.46).toNonIndexed(), new THREE.SphereGeometry(0.026, 6, 5).translate(-0.085, 0.14, 0.46).toNonIndexed()]);
  // a wing: arm, then long primary feathers with a fingered trailing edge (hinge at x = 0, tip at +x)
  const ws = new THREE.Shape(); ws.moveTo(0, 0.2); ws.quadraticCurveTo(0.5, 0.36, 0.95, 0.22); ws.lineTo(1.25, 0.05);
  for (let i = 0; i < 6; i++) { const fxp = 1.2 - i * 0.2, tipY = -0.3 - (i < 3 ? 0.1 - i * 0.03 : 0); ws.quadraticCurveTo(fxp + 0.1, tipY * 0.6, fxp + 0.02, tipY); ws.quadraticCurveTo(fxp - 0.06, tipY * 0.9, fxp - 0.1, tipY + 0.07); } // rounded primaries with shallow gaps between them
  ws.lineTo(0, -0.22); ws.lineTo(0, 0.2);
  const wing = new THREE.ShapeGeometry(ws, 6).rotateX(-Math.PI / 2);
  const wu = wing.attributes.uv; for (let i = 0; i < wu.count; i++) wu.setXY(i, wu.getX(i) * 1.5, wu.getY(i) * 3);
  CROW = { mat, eye, beakM, body, beak, eyes, wing };
  return CROW;
}
function makeCrow() {
  const K = crowParts(), g = new THREE.Group();
  const b = new THREE.Mesh(K.body, K.mat); b.castShadow = true;
  const wl = new THREE.Mesh(K.wing, K.mat), wr = new THREE.Mesh(K.wing, K.mat); wl.castShadow = wr.castShadow = true;
  wl.position.set(0.1, 0.06, 0.05); wr.position.set(-0.1, 0.06, 0.05); wr.scale.x = -1;
  g.add(b, new THREE.Mesh(K.beak, K.beakM), new THREE.Mesh(K.eyes, K.eye), wl, wr);
  g.userData = { wl, wr };
  return g;
}
export function crows(g, c, r = 8, dur = 5, onTick, n = 22) {
  const fx = g.fx, scene = g.scene, gy = g.world.heightAt(c[0], c[2]);
  const root = new THREE.Group(); scene.add(root);
  const birds = [];
  for (let i = 0; i < n; i++) {
    const m = makeCrow(); m.scale.setScalar(rnd(1.05, 1.4));
    const a = Math.random() * 6.28;
    m.position.set(c[0] + Math.cos(a) * rnd(4, 14), gy + rnd(34, 52), c[2] + Math.sin(a) * rnd(4, 14));
    root.add(m);
    birds.push({ m, d: i * 0.07, ph: Math.random() * 6, a, rr: rnd(1.2, r * 0.9), sp: rnd(2.6, 4.4) * (i % 2 ? 1 : -1), hy: rnd(0.9, 3), bob: rnd(0.8, 1.6), fl: rnd(17, 23), vel: new THREE.Vector3(), tgt: new THREE.Vector3() });
  }
  fx.decal && fx.decal([c[0], 0, c[2]], TX.ringDecal(), r * 2, dur, { color: 0x30060a, opacity: 0.5 });
  let tick = 0.6;
  fx.add({
    dur: dur + 1.6,
    update: (dt, t) => {
      for (const b of birds) {
        const tt = t - b.d; if (tt < 0) continue;
        const m = b.m, leaving = t > dur;
        if (leaving) b.tgt.set(c[0] + Math.cos(b.a) * 30, gy + 45, c[2] + Math.sin(b.a) * 30); // done: they scatter back into the sky
        else { b.a += b.sp * dt * 0.55; const dive = Math.max(0, Math.sin(tt * b.bob * 2.2 + b.ph)); b.tgt.set(c[0] + Math.cos(b.a) * b.rr * (1 - dive * 0.6), gy + b.hy * (1 - dive * 0.75) + 0.5, c[2] + Math.sin(b.a) * b.rr * (1 - dive * 0.6)); } // wheel round, stoop in to stab, pull out
        const to = b.tgt.clone().sub(m.position), d = to.length() || 1, spd = leaving ? 26 : tt < 1 ? 46 : 15;
        b.vel.lerp(to.multiplyScalar(spd / d), Math.min(1, dt * (tt < 1 ? 3.5 : 6)));
        m.position.addScaledVector(b.vel, dt);
        if (b.vel.lengthSq() > 0.01) { m.lookAt(m.position.x + b.vel.x, m.position.y + b.vel.y, m.position.z + b.vel.z); m.rotateZ(Math.max(-0.7, Math.min(0.7, -b.sp * 0.12))); } // banked into the turn
        const stoop = tt < 1 && !leaving, f = stoop ? 0.15 : Math.sin(tt * b.fl + b.ph); // wings folded in the dive, beating hard after
        m.userData.wl.rotation.z = stoop ? 1.1 : f * 0.85 + 0.1; m.userData.wr.rotation.z = stoop ? -1.1 : -(f * 0.85 + 0.1);
        if (!leaving && tt > 1 && Math.random() < 0.05) fx.debris.emit({ p: [m.position.x, m.position.y, m.position.z], v: [rnd(-1, 1), rnd(-0.5, 0.5), rnd(-1, 1)], life: 1.6, s0: 0.14, s1: 0.1, c0: [0.03, 0.03, 0.05, 1], c1: [0.03, 0.03, 0.05, 0], g: 1.2, rotV: rnd(-5, 5) }); // a feather
      }
      if (t > 0.9 && t < dur) { tick -= dt; if (tick <= 0) { tick = 0.25; onTick && onTick(); } }
    },
    dispose: () => { scene.remove(root); },
  });
}

// ---- Last Supper: a dark red hunger round the caster while it runs; supperWisp() is the life of something that died flying into them.
export function supper(g, follow, dur = 8) {
  const fx = g.fx;
  const p0 = follow(); if (p0) { fx.shockwave([p0[0], g.world.heightAt(p0[0], p0[2]), p0[2]], 5, 0x8a0a14, 0.45); fx.flash([p0[0], p0[1] + 1.2, p0[2]], 0xff2030, 14, 0.35, 12); }
  fx.add({
    dur,
    update: (dt, t) => {
      const p = follow(); if (!p) return false;
      for (let i = 0; i < fx.n(2); i++) { const a = t * 3 + i * 3.14 + Math.random(), rr = 0.9; fx.glow.emit({ p: [p[0] + Math.cos(a) * rr, p[1] + rnd(0.1, 2), p[2] + Math.sin(a) * rr], v: [-Math.sin(a) * 2, 0.8, Math.cos(a) * 2], life: 0.5, s0: 0.3, s1: 0.05, c0: [0.9, 0.05, 0.08, 0.7], c1: [0.4, 0, 0.02, 0] }); }
      if (Math.random() < 0.25) fx.smoke.emit({ p: [p[0] + rnd(-0.5, 0.5), p[1] + 0.2, p[2] + rnd(-0.5, 0.5)], v: [0, 0.9, 0], life: 1, s0: 0.6, s1: 1.6, c0: [0.25, 0.02, 0.03, 0.35], c1: [0.2, 0.02, 0.03, 0] });
    },
  });
}
export function supperWisp(g, from, follow) {
  const fx = g.fx, pos = new THREE.Vector3(from[0], from[1], from[2]), vel = new THREE.Vector3(rnd(-3, 3), rnd(5, 8), rnd(-3, 3));
  fx.add({
    dur: 2.5,
    update: (dt, t) => {
      const p = follow(); if (!p) return false;
      const to = new THREE.Vector3(p[0], p[1] + 1.2, p[2]).sub(pos), d = to.length();
      vel.lerp(to.normalize().multiplyScalar(30), Math.min(1, dt * (2 + t * 8))); pos.addScaledVector(vel, dt);
      fx.glow.emit({ p: [pos.x, pos.y, pos.z], life: 0.3, s0: 0.55, s1: 0.08, c0: [1, 0.1, 0.12, 0.9], c1: [0.5, 0, 0.02, 0] });
      fx.glow.emit({ p: [pos.x, pos.y, pos.z], life: 0.08, s0: 0.3, s1: 0.3, c0: [1, 0.7, 0.7, 0.9], c1: [1, 0.5, 0.5, 0.5] });
      if (d < 0.8) { fx.flash([p[0], p[1] + 1.2, p[2]], 0xff2030, 8, 0.2, 8); return false; }
    },
  });
}

// ---- Ghost Walk: the spirit (a pale figure) runs where follow() says; the body waits at `at`. `body` is the frozen copy of the runner
// (null for other players' copies, who get a marker of grave light instead). onEnd() when the spirit goes back.
export function spirit(g, follow, body, at, onEnd) {
  const fx = g.fx, scene = g.scene;
  const mat = new THREE.SpriteMaterial({ map: soulTex(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xcfe6ff });
  const sp = new THREE.Sprite(mat); sp.center.set(0.5, 0); sp.scale.set(1.5, 2.9, 1); scene.add(sp);
  if (body) scene.add(body);
  let last = null;
  fx.flash([at[0], at[1] + 1.2, at[2]], 0xbfe0ff, 16, 0.3, 12);
  fx.add({
    dur: 60,
    update: (dt, t) => {
      const p = follow();
      if (!p) {
        if (last) { fx.bolt && fx.bolt([last[0], last[1] + 1.2, last[2]], [at[0], at[1] + 1.2, at[2]], { width: 0.5, dur: 0.25, color: 0xcfe6ff, branches: 0 }); fx.flash([at[0], at[1] + 1.2, at[2]], 0xbfe0ff, 20, 0.3, 12); }
        onEnd && onEnd(); return false;
      }
      last = p;
      sp.position.set(p[0], p[1] + Math.sin(t * 3) * 0.08, p[2]); mat.opacity = Math.min(1, t * 5) * (0.75 + Math.sin(t * 9) * 0.1);
      for (let i = 0; i < fx.n(2); i++) fx.glow.emit({ p: [p[0] + rnd(-0.3, 0.3), p[1] + rnd(0.1, 2), p[2] + rnd(-0.3, 0.3)], v: [0, 0.4, 0], life: rnd(0.4, 0.8), s0: 0.25, s1: 0.04, c0: [0.75, 0.9, 1, 0.6], c1: [0.5, 0.7, 1, 0] });
      // the thread that ties the spirit to its body
      if (Math.random() < 0.5) { const k = Math.random(); fx.glow.emit({ p: [at[0] + (p[0] - at[0]) * k, at[1] + 1.1 + (p[1] - at[1]) * k, at[2] + (p[2] - at[2]) * k], life: 0.5, s0: 0.14, s1: 0.02, c0: [0.7, 0.88, 1, 0.5], c1: [0.5, 0.7, 1, 0] }); }
      if (Math.random() < 0.4) fx.glow.emit({ p: [at[0] + rnd(-0.4, 0.4), at[1] + rnd(0.1, 1.9), at[2] + rnd(-0.4, 0.4)], v: [0, 0.5, 0], life: 0.7, s0: 0.2, s1: 0.03, c0: [0.7, 0.88, 1, 0.5], c1: [0.5, 0.7, 1, 0] });
    },
    dispose: () => { scene.remove(sp); mat.dispose(); if (body) scene.remove(body); },
  });
}

// ---- Pyre: Mini Sun. A small sun hanging at c (its middle) for `dur` seconds: a boiling fire surface, a corona, flares licking off it and a
// scorched glow on the ground under it out to R. onTick() four times a second. Returns { grow(r, R) } to swell it after a kill.
let SUN_GLOW = null;
function sunGlowTex() {
  if (SUN_GLOW) return SUN_GLOW;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const x = cv.getContext('2d'), gr = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,214,140,0.95)'); gr.addColorStop(0.28, 'rgba(255,150,50,0.6)'); gr.addColorStop(0.55, 'rgba(255,80,10,0.22)'); gr.addColorStop(1, 'rgba(255,40,0,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
  SUN_GLOW = new THREE.CanvasTexture(cv); SUN_GLOW.colorSpace = THREE.SRGBColorSpace;
  return SUN_GLOW;
}
const SUN_NOISE = `
  vec3 h3(vec3 p){ p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6))); return fract(sin(p) * 43758.5453) * 2. - 1.; }
  float n3(vec3 p){ vec3 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
    return mix(mix(mix(dot(h3(i), f), dot(h3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x), mix(dot(h3(i + vec3(0,1,0)), f - vec3(0,1,0)), dot(h3(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
               mix(mix(dot(h3(i + vec3(0,0,1)), f - vec3(0,0,1)), dot(h3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x), mix(dot(h3(i + vec3(0,1,1)), f - vec3(0,1,1)), dot(h3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z); }
  float fbm(vec3 p){ float a = 0.5, s = 0.; for (int i = 0; i < 5; i++){ s += a * n3(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }`;
export function miniSun(g, c, dur = 8, r = 1.3, R = 8, onTick, onBang) {
  const fx = g.fx, scene = g.scene, gy = g.world.heightAt(c[0], c[2]);
  const S = { r: 0.01, tr: r, R, tR: R };
  // the boiling surface: bright cells with darker lanes between them, hotter toward the rim (seen edge-on the fire is deeper)
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uA: { value: 1 } },
    vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform float uT; uniform float uA; varying vec3 vP; varying vec3 vN; varying vec3 vV;` + SUN_NOISE + `
      void main(){
        vec3 p = normalize(vP);
        float flow = fbm(p * 2.2 + vec3(0., uT * 0.22, uT * 0.1));
        float cells = fbm(p * 5.5 + flow * 1.6 + vec3(uT * 0.3, 0., -uT * 0.24));
        float fine = fbm(p * 14. - vec3(0., uT * 0.6, 0.) + cells);
        float h = clamp(0.5 + cells * 1.25 + fine * 0.45 + flow * 0.5, 0., 1.);
        vec3 dark = vec3(0.42, 0.045, 0.0), mid = vec3(1.0, 0.36, 0.03), hot = vec3(1.0, 0.78, 0.26), white = vec3(1.0, 0.95, 0.72);
        vec3 col = mix(dark, mid, smoothstep(0.08, 0.5, h));
        col = mix(col, hot, smoothstep(0.45, 0.8, h));
        col = mix(col, white, smoothstep(0.82, 1., h) * 0.7);
        float rim = 1. - max(dot(normalize(vN), normalize(vV)), 0.);
        col = mix(col, vec3(1.0, 0.5, 0.08), pow(rim, 2.2) * 0.7);
        gl_FragColor = vec4(col * (1.15 + 0.5 * uA), 1.);
      }`,
  });
  const geo = new THREE.IcosahedronGeometry(1, 5);
  const ball = new THREE.Mesh(geo, mat); ball.position.set(c[0], c[1], c[2]); ball.frustumCulled = false; scene.add(ball);
  // flares: a slightly bigger see-through shell whose ragged tongues stand off the surface
  const fmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uA: { value: 1 } },
    vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform float uT; uniform float uA; varying vec3 vP; varying vec3 vN; varying vec3 vV;` + SUN_NOISE + `
      void main(){
        vec3 p = normalize(vP);
        float edge = abs(dot(normalize(vN), normalize(vV)));
        float lick = fbm(p * 3.4 + vec3(0., -uT * 0.9, uT * 0.3)) * 0.5 + 0.5;
        float a = smoothstep(0.0, 0.75, edge) * smoothstep(0.34, 0.74, lick + edge * 0.25);
        gl_FragColor = vec4(vec3(1.0, 0.42, 0.06) * a * 0.85 * uA, a * uA);
      }`,
  });
  const shell = new THREE.Mesh(geo, fmat); shell.frustumCulled = false; shell.renderOrder = 6; ball.add(shell); shell.scale.setScalar(1.28);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunGlowTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
  glow.renderOrder = 5; scene.add(glow); glow.position.copy(ball.position);
  // the ground under it: baked, glowing out to where it burns
  const dmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uA: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform float uT; uniform float uA; varying vec2 vUv;
      void main(){ vec2 p = (vUv - 0.5) * 2.; float rr = length(p);
        float ring = smoothstep(1., 0.93, rr) * smoothstep(0.8, 0.97, rr);
        float heat = smoothstep(1., 0., rr) * (0.2 + 0.06 * sin(uT * 5. + rr * 9.));
        gl_FragColor = vec4(vec3(1.0, 0.36, 0.06) * (ring * 0.75 + heat) * uA, 1.); }`,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), dmat); disc.position.set(c[0], gy + 0.16, c[2]); disc.renderOrder = 2; scene.add(disc);
  const light = { intensity: 0, distance: 30 }; let lightT = 0; // lit through the pooled effect lights
  fx.flash([c[0], c[1], c[2]], 0xffb060, 30, 0.4, 26);
  fx.shockwave([c[0], gy, c[2]], R, 0xff7a20, 0.5);
  let tick = 0, ended = false, gal = null;
  const BANG = 2.8; // after the sun has shrunk away it goes off like a small big bang and leaves a spinning galaxy that fades (Nutty 2026-11-13)
  const bang = () => {
    const BR = S.R * 1.5;
    ball.visible = false; disc.visible = false;
    const gm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uT: { value: 0 }, uA: { value: 1 }, uSeed: { value: Math.random() * 40 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `uniform float uT; uniform float uA; uniform float uSeed; varying vec2 vUv;` + SUN_NOISE + `
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main(){
          vec2 p = (vUv - 0.5) * 2.; float r = length(p); if (r > 1.) discard;
          float a = atan(p.y, p.x);
          float wind = 5.2 * log(r + 0.04) - uT * 1.5;                 // the arms wind tighter toward the core and the whole disc turns
          float arm = pow(0.5 + 0.5 * cos(2. * a - wind * 2.), 2.2);
          vec2 sw = vec2(cos(a - wind * 0.5), sin(a - wind * 0.5)) * r;   // dust lanes dragged round with the spin
          float dust = fbm(vec3(sw * 4.5, uSeed)) * 0.5 + 0.5;
          float knots = smoothstep(0.55, 0.9, fbm(vec3(sw * 11., uSeed + 7.)) * 0.5 + 0.5);
          float fall = exp(-r * 2.9) * smoothstep(1., 0.72, r);
          float core = exp(-r * 13.) * 2.6 + exp(-r * 5.) * 0.55;
          // stars: sharp points scattered through the disc, denser along the arms, twinkling
          vec2 sp = sw * 46.; vec2 cell = floor(sp); vec2 f = fract(sp) - 0.5;
          float hs = h21(cell + uSeed);
          float star = step(0.9 - arm * 0.16, hs) * smoothstep(0.26, 0.0, length(f + (vec2(h21(cell + 3.1), h21(cell + 9.7)) - 0.5) * 0.5)) * (0.55 + 0.45 * sin(uT * 9. + hs * 60.));
          vec3 blue = vec3(0.12, 0.3, 1.0), violet = vec3(0.55, 0.12, 0.95), pink = vec3(1.0, 0.22, 0.5), gold = vec3(1.0, 0.74, 0.38);
          vec3 col = mix(violet, blue, smoothstep(0.15, 0.8, r)) * arm * (0.35 + 0.9 * dust) * fall * 2.3;
          col += pink * knots * arm * fall * 1.9;
          col += gold * core;
          col += vec3(0.95, 0.96, 1.0) * star * (0.5 + arm) * smoothstep(1., 0.6, r) * 1.6;
          col *= 1. - 0.55 * smoothstep(0.35, 0.7, dust) * (1. - arm) * step(0.12, r); // dark dust between the arms
          gl_FragColor = vec4(col * uA, 1.);
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 64), gm);
    mesh.position.set(c[0], c[1], c[2]); mesh.lookAt(g.camera.position.x, c[1], g.camera.position.z); mesh.rotateX(-0.95); // a tilted disc turned toward whoever is watching, so the spiral reads
    mesh.frustumCulled = false; mesh.renderOrder = 7; scene.add(mesh);
    gal = { mesh, gm, BR, t0: -1 };
    // the bang itself: a white-hot flash, a blast ring on the ground, and matter thrown out in every direction
    fx.flash([c[0], c[1], c[2]], 0xfff2d8, 90, 0.5, 30 + BR * 2);
    fx.shockwave([c[0], gy, c[2]], BR, 0xcfa8ff, 0.7);
    fx.shockwave([c[0], gy, c[2]], BR * 0.6, 0xffe2a0, 0.45);
    g.shake && g.shake(0.5);
    for (let i = 0; i < fx.n(70); i++) {
      const a = Math.random() * 6.28, y = rnd(-0.55, 0.55), q = Math.sqrt(1 - y * y), sp = rnd(0.35, 1) * BR * 1.1, d = [Math.cos(a) * q, y, Math.sin(a) * q];
      const hot = Math.random() < 0.5;
      fx.spark.emit({ p: [c[0], c[1], c[2]], v: [d[0] * sp - d[2] * sp * 0.5, d[1] * sp, d[2] * sp + d[0] * sp * 0.5], life: rnd(0.8, 1.9), s0: rnd(0.14, 0.34), s1: 0.02, c0: hot ? [1, 0.9, 0.7, 1] : [0.6, 0.7, 1, 1], c1: hot ? [1, 0.4, 0.5, 0] : [0.5, 0.2, 1, 0], drag: 1.4, g: 0 });
    }
    for (let i = 0; i < fx.n(16); i++) {
      const a = Math.random() * 6.28, y = rnd(-0.4, 0.6), q = Math.sqrt(1 - y * y);
      fx.fire.emit({ p: [c[0], c[1], c[2]], v: [Math.cos(a) * q * BR * 0.8, y * BR * 0.8, Math.sin(a) * q * BR * 0.8], life: rnd(0.35, 0.7), s0: S.r * 1.4, s1: 0.2, c0: [1, 0.8, 0.5, 0.8], c1: [0.6, 0.2, 0.9, 0], drag: 2.2 });
    }
    onBang && onBang(BR);
  };
  fx.add({
    dur: dur + 0.7 + BANG,
    update: (dt, t) => {
      if (t >= dur + 0.7) {
        if (!gal) bang();
        const u = Math.min(1, (t - dur - 0.7) / BANG), grow = 1 - Math.pow(1 - Math.min(1, u * 2.2), 3);
        gal.mesh.scale.setScalar(Math.max(0.01, gal.BR * 0.8 * (0.12 + 0.88 * grow)));
        gal.gm.uniforms.uT.value = t; gal.gm.uniforms.uA.value = Math.min(1, u * 14) * Math.pow(1 - Math.max(0, (u - 0.45) / 0.55), 1.6) * 0.62;
        glow.scale.setScalar(S.r * (3 + 14 * grow)); glow.material.opacity = 0.9 * Math.pow(1 - Math.min(1, u * 2.6), 2);
        for (let i = 0; i < fx.n(u < 0.6 ? 3 : 1); i++) { // stars drifting round the arms
          const a = Math.random() * 6.28, q = rnd(0.15, 0.95) * gal.BR * 0.8 * (0.12 + 0.88 * grow), tv = 3.2;
          fx.spark.emit({ p: [c[0] + Math.cos(a) * q, c[1] + rnd(-0.5, 0.5) - Math.sin(a) * q * 0.4, c[2] + Math.sin(a) * q], v: [-Math.sin(a) * tv, rnd(-0.3, 0.3), Math.cos(a) * tv], life: rnd(0.4, 0.9), s0: rnd(0.07, 0.16), s1: 0.01, c0: [0.85, 0.88, 1, 0.9 * (1 - u)], c1: [0.6, 0.4, 1, 0], g: 0 });
        }
        return;
      }
      const out = Math.min(1, Math.max(0, (dur + 0.7 - t) / 0.7)), inn = Math.min(1, t * 2.2), k = inn * out;
      S.r += (S.tr - S.r) * Math.min(1, dt * 5); S.R += (S.tR - S.R) * Math.min(1, dt * 5);
      const rr = S.r * (0.25 + 0.75 * k) * (1 + 0.025 * Math.sin(t * 6));
      ball.scale.setScalar(rr); ball.rotation.y = t * 0.12;
      mat.uniforms.uT.value = fmat.uniforms.uT.value = dmat.uniforms.uT.value = t;
      mat.uniforms.uA.value = fmat.uniforms.uA.value = k; dmat.uniforms.uA.value = k;
      glow.scale.setScalar(rr * 5.2); glow.material.opacity = 0.75 * k;
      disc.scale.setScalar(S.R);
      light.intensity = (26 + S.r * 14) * k; light.distance = 22 + S.R * 1.6;
      lightT -= dt; if (lightT <= 0 && k > 0.05) { lightT = 0.1; fx.flash([c[0], c[1], c[2]], 0xff9a40, light.intensity, 0.22, light.distance); }
      if (t < dur) {
        for (let i = 0; i < fx.n(5); i++) { // fire boiling off the surface
          const a = Math.random() * 6.28, y = rnd(-1, 1), q = Math.sqrt(1 - y * y), d = [Math.cos(a) * q, y, Math.sin(a) * q];
          fx.fire.emit({ p: [c[0] + d[0] * rr, c[1] + d[1] * rr, c[2] + d[2] * rr], v: [d[0] * 1.6 + rnd(-0.5, 0.5), d[1] * 1.6 + rnd(0.4, 1.4), d[2] * 1.6 + rnd(-0.5, 0.5)], life: rnd(0.35, 0.7), s0: rr * rnd(0.45, 0.75), s1: rr * 0.12, c0: [1, 0.42, 0.06, 0.5], c1: [0.7, 0.06, 0, 0], turb: 2, rotV: rnd(-2, 2) });
        }
        for (let i = 0; i < fx.n(2); i++) { const a = Math.random() * 6.28, q = rnd(0.3, 1) * S.R; fx.spark.emit({ p: [c[0] + Math.cos(a) * q, gy + 0.2, c[2] + Math.sin(a) * q], v: [rnd(-0.6, 0.6), rnd(1.5, 4), rnd(-0.6, 0.6)], life: rnd(0.5, 1.1), s0: 0.12, s1: 0.02, c0: [1, 0.55, 0.12, 1], c1: [0.8, 0.1, 0, 0], g: -1 }); } // embers lifting off the baked ground
        if (Math.random() < 0.3) fx.smoke.emit({ p: [c[0] + rnd(-rr, rr), c[1] + rr, c[2] + rnd(-rr, rr)], v: [rnd(-0.5, 0.5), rnd(1.5, 3), rnd(-0.5, 0.5)], life: rnd(1, 1.6), s0: rr * 0.8, s1: rr * 2.4, c0: [0.06, 0.04, 0.03, 0.3], c1: [0.14, 0.13, 0.13, 0], rotV: rnd(-1, 1) });
        tick += dt;
        if (tick >= 0.25) { tick -= 0.25; onTick && onTick(); }
      } else if (!ended) { ended = true; fx.shockwave([c[0], gy, c[2]], S.R * 0.6, 0xff7a20, 0.35); }
    },
    dispose: () => { if (gal) { scene.remove(gal.mesh); gal.mesh.geometry.dispose(); gal.gm.dispose(); } scene.remove(ball); scene.remove(glow); scene.remove(disc); geo.dispose(); mat.dispose(); fmat.dispose(); dmat.dispose(); disc.geometry.dispose(); glow.material.dispose(); },
  });
  return {
    c, grow(r2, R2) { S.tr = r2; S.tR = R2; fx.flash([c[0], c[1], c[2]], 0xffc070, 34, 0.3, 28); fx.shockwave([c[0], gy, c[2]], R2, 0xffa040, 0.4);
      for (let i = 0; i < fx.n(18); i++) { const a = Math.random() * 6.28, y = rnd(-1, 1), q = Math.sqrt(1 - y * y); fx.fire.emit({ p: [c[0], c[1], c[2]], v: [Math.cos(a) * q * 7, y * 7, Math.sin(a) * q * 7], life: rnd(0.3, 0.55), s0: r2 * 0.7, s1: 0.1, c0: [1, 0.6, 0.15, 0.7], c1: [0.9, 0.15, 0, 0], drag: 2 }); } },
  };
}

// ---- Pyre: Sunlance. A wide shaft of sunlight from the sky onto c (ground point), radius r, for `dur` seconds after a short gathering.
// A yellow-white hot core, orange and red fire spiralling around it, and the whole area lit as if the sun came out. onTick() four times a second.
export function sunlance(g, c, dur = 3, r = 7, onTick) {
  const fx = g.fx, scene = g.scene, gy = c[1], H = 90, wind = 0.55;
  const vs = 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }';
  // the hot core: brightest through its middle, soft at the edge, with slow streaks running down it
  const cmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 }, uA: { value: 0 } }, vertexShader: vs,
    fragmentShader: `uniform float uT; uniform float uA; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ float f = abs(dot(normalize(vN), normalize(vV)));
        float streak = 0.82 + 0.18 * sin(vUv.x * 60. + sin(vUv.y * 9. - uT * 3.) * 2.);
        float fadeTop = smoothstep(1., 0.55, vUv.y), base = 1. + smoothstep(0.08, 0., vUv.y) * 0.8;
        vec3 col = mix(vec3(1.0, 0.62, 0.14), vec3(1.0, 0.93, 0.62), pow(f, 1.5));
        gl_FragColor = vec4(col * pow(f, 1.3) * streak * fadeTop * base * uA * 0.2, 1.); }`,
  });
  // the aura: bands of orange and red fire winding around the shaft and sliding down it
  const amat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 }, uA: { value: 0 } }, vertexShader: vs,
    fragmentShader: `uniform float uT; uniform float uA; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
      void main(){ float a = vUv.x * 6.2832, y = vUv.y * 90.;
        float n = noise(vec2(vUv.x * 24., y * 0.35 + uT * 2.4)) ;
        float s1 = sin(a * 2. + y * 0.42 + uT * 5.5 + n * 2.2) * 0.5 + 0.5;
        float s2 = sin(a * 3. - y * 0.3 + uT * 3.8 + n * 1.6) * 0.5 + 0.5;
        float band = smoothstep(0.55, 0.95, s1), band2 = smoothstep(0.7, 1., s2);
        vec3 col = vec3(1.0, 0.42, 0.05) * band + vec3(0.95, 0.08, 0.02) * band2 * 0.9;
        float f = abs(dot(normalize(vN), normalize(vV)));
        float fade = smoothstep(1., 0.35, vUv.y) * smoothstep(0., 0.03, vUv.y);
        gl_FragColor = vec4(col * (0.35 + 0.65 * f) * fade * uA * 0.9, 1.); }`,
  });
  const cgeo = new THREE.CylinderGeometry(1, 1, H, 40, 1, true).translate(0, H / 2, 0);
  const core = new THREE.Mesh(cgeo, cmat), aura = new THREE.Mesh(cgeo, amat), aura2 = new THREE.Mesh(cgeo, amat);
  for (const m of [core, aura, aura2]) { m.position.set(c[0], gy, c[2]); m.frustumCulled = false; m.renderOrder = 6; scene.add(m); }
  aura2.rotation.y = 2.1;
  // where it lands: white-hot ground with a burning rim
  const dmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uA: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform float uT; uniform float uA; varying vec2 vUv;
      void main(){ vec2 p = (vUv - 0.5) * 2.; float rr = length(p), a = atan(p.y, p.x);
        float hot = smoothstep(0.78, 0.1, rr);
        float rim = smoothstep(1., 0.9, rr) * smoothstep(0.62, 0.9, rr) * (0.7 + 0.3 * sin(a * 5. + uT * 6.));
        vec3 col = vec3(1.0, 0.9, 0.55) * hot * 0.3 + vec3(1.0, 0.3, 0.04) * rim;
        gl_FragColor = vec4(col * uA, 1.); }`,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 56).rotateX(-Math.PI / 2), dmat); disc.position.set(c[0], gy + 0.2, c[2]); disc.renderOrder = 2; scene.add(disc);
  // real light: a warm lamp low in the shaft for what stands in it, and the whole view lifts a little, the way it does when the sun comes out
  let lightT = 0;
  let boost = 0, tick = 0, struck = false;
  const total = wind + dur + 0.6;
  fx.add({
    dur: total,
    update: (dt, t) => {
      const on = t >= wind && t < wind + dur;
      const k = t < wind ? (t / wind) * 0.3 : Math.min(1, 0.3 + (t - wind) * 6) * Math.min(1, Math.max(0, (total - t) / 0.6));
      const w = t < wind ? 0.12 + 0.2 * (t / wind) : Math.min(1, 0.32 + (t - wind) * 7); // the shaft opens from a thin ray to full width
      core.scale.set(r * 0.62 * w, 1, r * 0.62 * w); aura.scale.set(r * 0.86 * w, 1, r * 0.86 * w); aura2.scale.set(r * w, 1, r * w);
      aura.rotation.y = t * 2.6; aura2.rotation.y = 2.1 - t * 1.7;
      disc.scale.setScalar(r * Math.max(w, 0.3));
      cmat.uniforms.uT.value = amat.uniforms.uT.value = dmat.uniforms.uT.value = t;
      cmat.uniforms.uA.value = k; amat.uniforms.uA.value = k * (on ? 1 : 0.5); dmat.uniforms.uA.value = k;
      lightT -= dt; if (lightT <= 0 && k > 0.05) { lightT = 0.1; fx.flash([c[0], gy + 8, c[2]], 0xffe6b0, 46 * k, 0.22, 75); }
      const cam = g.camera.position, near = Math.max(0, 1 - Math.hypot(cam.x - c[0], cam.z - c[2]) / 90);
      const want = 0.1 * k * near; g.renderer.toneMappingExposure += want - boost; boost = want;
      if (on) {
        if (!struck) { struck = true; fx.shockwave([c[0], gy, c[2]], r * 1.5, 0xffd070, 0.5); fx.flash([c[0], gy + 3, c[2]], 0xfff0c0, 24, 0.3, 40); g.shake && g.shake(0.35 * near); }
        for (let i = 0; i < fx.n(5); i++) { const a = Math.random() * 6.28, q = Math.sqrt(Math.random()) * r; fx.fire.emit({ p: [c[0] + Math.cos(a) * q, gy + 0.3, c[2] + Math.sin(a) * q], v: [-Math.sin(a) * 3, rnd(3, 8), Math.cos(a) * 3], life: rnd(0.35, 0.7), s0: rnd(0.9, 1.6), s1: 0.25, c0: [1, 0.5, 0.08, 0.3], c1: [0.8, 0.08, 0, 0], turb: 3, rotV: rnd(-2, 2) }); }
        for (let i = 0; i < fx.n(5); i++) { const a = Math.random() * 6.28, q = rnd(0.5, 1) * r; fx.spark.emit({ p: [c[0] + Math.cos(a) * q, gy + rnd(0.2, 6), c[2] + Math.sin(a) * q], v: [-Math.sin(a) * 6, rnd(4, 11), Math.cos(a) * 6], life: rnd(0.5, 1), s0: 0.16, s1: 0.02, c0: [1, 0.7, 0.2, 1], c1: [0.9, 0.15, 0, 0], g: -2 }); }
        if (Math.random() < 0.6) { const a = Math.random() * 6.28; fx.smoke.emit({ p: [c[0] + Math.cos(a) * r, gy + 0.5, c[2] + Math.sin(a) * r], v: [Math.cos(a) * 2, rnd(1.5, 3), Math.sin(a) * 2], life: rnd(1, 1.6), s0: 1.2, s1: 3.6, c0: [0.07, 0.05, 0.04, 0.35], c1: [0.16, 0.15, 0.15, 0], rotV: rnd(-1, 1) }); }
        tick += dt;
        if (tick >= 0.25) { tick -= 0.25; onTick && onTick(); }
      }
    },
    dispose: () => { g.renderer.toneMappingExposure -= boost; boost = 0; for (const m of [core, aura, aura2, disc]) scene.remove(m); cgeo.dispose(); cmat.dispose(); amat.dispose(); dmat.dispose(); disc.geometry.dispose(); },
  });
}

// ---- Gale: Airshot. A spinning ball of wind (radius r) flying from o along d. onHit(target, dir) once for each enemy it passes through
// (caster only: pass targets()); it bursts on a wall or at the end of its range.
export function airshot(g, o, d, { speed = 44, range = 75, r = 1.25, targets = null, onHit = null } = {}) {
  const fx = g.fx, scene = g.scene;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 }, uA: { value: 1 } },
    vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform float uT; uniform float uA; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
      void main(){ vec3 p = normalize(vP); float a = atan(p.x, p.y), h = p.z;
        float n = noise(vec2(a * 2.5 + uT * 9., h * 5. - uT * 2.));
        float band = sin(a * 4. + h * 7. - uT * 16. + n * 3.) * 0.5 + 0.5; // streaks winding round the ball
        float streak = smoothstep(0.5, 0.95, band) * (0.55 + 0.45 * n);
        float rim = pow(1. - abs(dot(normalize(vN), normalize(vV))), 1.6);
        vec3 col = mix(vec3(0.72, 0.8, 0.86), vec3(1.), streak);
        gl_FragColor = vec4(col, (streak * 0.75 + rim * 0.55 + 0.06) * uA); }`,
  });
  const grp = new THREE.Group(); grp.position.set(o[0], o[1], o[2]); scene.add(grp);
  const dir = new THREE.Vector3(d[0], d[1], d[2]).normalize();
  grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  const geo = new THREE.SphereGeometry(1, 28, 20), ball = new THREE.Mesh(geo, mat), core = new THREE.Mesh(geo, mat);
  ball.frustumCulled = core.frustumCulled = false; ball.renderOrder = core.renderOrder = 6; core.scale.setScalar(0.6); grp.add(ball, core); grp.scale.setScalar(0.2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xf2f6fa, transparent: true, opacity: 0.55, depthWrite: false }), ringGeo = new THREE.TorusGeometry(1.22, 0.035, 6, 40);
  const rings = [0, 1, 2].map((i) => { const m = new THREE.Mesh(ringGeo, ringMat); m.rotation.set(i * 1.1, i * 0.7, 0); grp.add(m); return m; });
  const hit = new Set(), p = grp.position;
  let gone = 0;
  const burst = () => { fx.shockwave([p.x, g.world.heightAt(p.x, p.z), p.z], 6, 0xdfe4ea, 0.35); for (let i = 0; i < fx.n(24); i++) { const a = Math.random() * 6.28, y = rnd(-1, 1), q = Math.sqrt(1 - y * y); fx.smoke.emit({ p: [p.x, p.y, p.z], v: [Math.cos(a) * q * 12, y * 8, Math.sin(a) * q * 12], life: rnd(0.35, 0.7), s0: 0.8, s1: 2.6, c0: [0.92, 0.95, 0.98, 0.4], c1: [0.92, 0.95, 0.98, 0], drag: 3 }); } };
  fx.add({
    dur: range / speed + 0.3,
    update: (dt, t) => {
      mat.uniforms.uT.value = t;
      if (gone) { gone += dt; const k = Math.max(0, 1 - gone / 0.25); mat.uniforms.uA.value = k; ringMat.opacity = 0.55 * k; grp.scale.setScalar(r * (1 + (1 - k) * 0.9)); return gone < 0.25; }
      grp.scale.setScalar(r * Math.min(1, 0.2 + t * 6));
      p.addScaledVector(dir, speed * dt);
      ball.rotation.z += dt * 15; core.rotation.z -= dt * 22;
      rings[0].rotation.x += dt * 11; rings[1].rotation.y += dt * 13; rings[2].rotation.x -= dt * 9; rings[2].rotation.y += dt * 7;
      for (let i = 0; i < fx.n(5); i++) { const a = Math.random() * 6.28, q = r * rnd(0.6, 1.1), sx = Math.cos(a) * q, sy = Math.sin(a) * q; fx.smoke.emit({ p: [p.x + sx, p.y + sy * 0.9, p.z + sx * 0.2], v: [-dir.x * 6 + rnd(-1, 1), rnd(-0.5, 1), -dir.z * 6 + rnd(-1, 1)], life: rnd(0.25, 0.5), s0: 0.5, s1: 1.5, c0: [0.93, 0.96, 0.99, 0.32], c1: [0.93, 0.96, 0.99, 0], drag: 2 }); }
      const gy = g.world.heightAt(p.x, p.z);
      if (p.y - gy < 3 && Math.random() < 0.6) fx.smoke.emit({ p: [p.x + rnd(-1, 1), gy + 0.2, p.z + rnd(-1, 1)], v: [rnd(-2, 2), rnd(0.5, 2), rnd(-2, 2)], life: rnd(0.5, 0.9), s0: 0.6, s1: 2.2, c0: [0.6, 0.55, 0.48, 0.3], c1: [0.6, 0.55, 0.48, 0], drag: 2 }); // dust torn off the ground
      if (targets && onHit) for (const q of targets()) {
        if (hit.has(q.id) || q.kind === 'demon') continue;
        const cy = clamp01y(p.y, q.y, q.y + q.h);
        if (Math.hypot(q.x - p.x, q.z - p.z) < q.r + r + 0.3 && Math.abs(p.y - cy) < r + 0.4) { hit.add(q.id); onHit(q, dir); fx.shockwave([q.x, q.y + 0.2, q.z], 3, 0xdfe4ea, 0.25); }
      }
      if (t * speed >= range || p.y < gy + 0.25 || g.world.solidPoint(p.x, p.y, p.z, 0.5)) { gone = 0.001; burst(); }
    },
    dispose: () => { scene.remove(grp); geo.dispose(); mat.dispose(); ringGeo.dispose(); ringMat.dispose(); },
  });
}
const clamp01y = (y, a, b) => Math.max(a, Math.min(b, y));
