// Low-level effect primitives: GPU point particles, pooled flash lights,
// ground decals, lightning ribbons, shockwaves and timed mesh effects.
import { PERF } from './perf.js';
import { muOn, LOWGRAV } from './mutators.js';
import * as THREE from 'three';
import { Ballistics } from './ballistics.js';
import * as TX from './textures.js';

const VERT = /* glsl */ `
attribute vec4 aColor;
attribute float aSize;
attribute float aRot;
varying vec4 vColor;
varying float vRot;
varying float vFog;
uniform float uScale;
uniform float uFogDensity;
void main() {
  vColor = aColor;
  vRot = aRot;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = -mv.z;
  float ps = aSize * uScale / max(d, 0.1);
  gl_PointSize = min(ps, 420.0);
  float f = uFogDensity * d;
  vFog = 1.0 - exp(-f * f);
  // Fade particles that are about to hit the camera so they never fill the screen.
  // (2026-11-12: a cloud or blast right on the camera washed the whole screen white-green. A puff now fades out from 4 m in, and any
  // puff that would cover a big part of the screen is thinned in step with its size.)
  vFog = 1.0 - (1.0 - vFog) * smoothstep(0.6, 4.0, d) * (1.0 - 0.85 * smoothstep(160.0, 420.0, ps));
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D map;
varying vec4 vColor;
varying float vRot;
varying float vFog;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float c = cos(vRot), s = sin(vRot);
  uv = mat2(c, -s, s, c) * uv + 0.5;
  vec4 t = texture2D(map, uv);
  float a = vColor.a * t.a * (1.0 - vFog);
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor.rgb * t.rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class ParticleSystem {
  constructor(scene, { texture, max = 2000, additive = true, name = '' }) {
    this.max = max;
    this.count = 0;
    this.name = name;
    const f = (n) => new Float32Array(max * n);
    this.pos = f(3); this.vel = f(3); this.c0 = f(4); this.c1 = f(4);
    this.age = f(1); this.life = f(1); this.s0 = f(1); this.s1 = f(1);
    this.rot = f(1); this.rotV = f(1); this.grav = f(1); this.drag = f(1); this.turb = f(1);
    this.geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(f(3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(f(4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(f(1), 1).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.BufferAttribute(f(1), 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.aPos);
    this.geo.setAttribute('aColor', this.aCol);
    this.geo.setAttribute('aSize', this.aSize);
    this.geo.setAttribute('aRot', this.aRot);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, uScale: { value: 600 }, uFogDensity: { value: 0.01 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
    this.budget = 1;
  }

  // o: {p:[x,y,z], v:[x,y,z], life, s0, s1, c0:[r,g,b,a], c1, g, drag, rot, rotV, turb}
  emit(o) {
    if (this.count >= this.max) return;
    if (PERF.fx < 1 && Math.random() > PERF.fx) return; // the frame governor thins particles on slow machines
    const i = this.count++;
    const i3 = i * 3, i4 = i * 4;
    this.pos[i3] = o.p[0]; this.pos[i3 + 1] = o.p[1]; this.pos[i3 + 2] = o.p[2];
    const v = o.v || [0, 0, 0];
    this.vel[i3] = v[0]; this.vel[i3 + 1] = v[1]; this.vel[i3 + 2] = v[2];
    const c0 = o.c0 || [1, 1, 1, 1], c1 = o.c1 || [c0[0], c0[1], c0[2], 0];
    for (let k = 0; k < 4; k++) { this.c0[i4 + k] = c0[k]; this.c1[i4 + k] = c1[k]; }
    this.age[i] = 0; this.life[i] = o.life || 1;
    this.s0[i] = o.s0 ?? 1; this.s1[i] = o.s1 ?? this.s0[i];
    this.rot[i] = o.rot ?? Math.random() * 6.28; this.rotV[i] = o.rotV ?? 0;
    this.grav[i] = o.g ?? 0; this.drag[i] = o.drag ?? 0; this.turb[i] = o.turb ?? 0;
  }

  kill(i) {
    const last = --this.count;
    if (i === last) return;
    const cp = (arr, n) => { for (let k = 0; k < n; k++) arr[i * n + k] = arr[last * n + k]; };
    cp(this.pos, 3); cp(this.vel, 3); cp(this.c0, 4); cp(this.c1, 4);
    cp(this.age, 1); cp(this.life, 1); cp(this.s0, 1); cp(this.s1, 1);
    cp(this.rot, 1); cp(this.rotV, 1); cp(this.grav, 1); cp(this.drag, 1); cp(this.turb, 1);
  }

  update(dt, time) {
    const P = this.aPos.array, C = this.aCol.array, S = this.aSize.array, R = this.aRot.array;
    for (let i = 0; i < this.count; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.kill(i); i--; continue; }
      const i3 = i * 3, i4 = i * 4;
      const t = this.age[i] / this.life[i];
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3 + 1] -= this.grav[i] * dt;
      const tb = this.turb[i];
      if (tb) {
        this.vel[i3] += Math.sin(time * 7 + i * 1.7) * tb * dt;
        this.vel[i3 + 2] += Math.cos(time * 6 + i * 2.3) * tb * dt;
      }
      this.vel[i3] *= dr; this.vel[i3 + 1] *= dr; this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.rot[i] += this.rotV[i] * dt;
      P[i3] = this.pos[i3]; P[i3 + 1] = this.pos[i3 + 1]; P[i3 + 2] = this.pos[i3 + 2];
      const fadeIn = Math.min(1, t * 10);
      for (let k = 0; k < 4; k++) C[i4 + k] = this.c0[i4 + k] + (this.c1[i4 + k] - this.c0[i4 + k]) * t;
      C[i4 + 3] *= fadeIn;
      S[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      R[i] = this.rot[i];
    }
    this.geo.setDrawRange(0, this.count);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aRot.needsUpdate = true;
    this.aPos.updateRanges && (this.aPos.clearUpdateRanges(), this.aPos.addUpdateRange(0, this.count * 3));
    this.aCol.updateRanges && (this.aCol.clearUpdateRanges(), this.aCol.addUpdateRange(0, this.count * 4));
    this.aSize.updateRanges && (this.aSize.clearUpdateRanges(), this.aSize.addUpdateRange(0, this.count));
    this.aRot.updateRanges && (this.aRot.clearUpdateRanges(), this.aRot.addUpdateRange(0, this.count));
  }

  clear() { this.count = 0; }
}

const rnd = (a, b) => a + Math.random() * (b - a);
const rv = (s) => [rnd(-s, s), rnd(-s, s), rnd(-s, s)];

const SWIPE_LIFE = 0.24, SWIPE_MAX = 40, BEAM_N = 12;

export class FX {
  constructor(scene, camera, quality) {
    this.scene = scene;
    this.camera = camera;
    this.time = 0;
    this.q = quality; // 0 low, 1 medium, 2 high
    const mul = [0.4, 0.7, 1][quality];
    this.mul = mul;
    this.fire = new ParticleSystem(scene, { texture: TX.flameSprite(), max: Math.floor(5000 * mul), additive: true, name: 'fire' });
    this.smoke = new ParticleSystem(scene, { texture: TX.smokeSprite(), max: Math.floor(2500 * mul), additive: false, name: 'smoke' });
    this.glow = new ParticleSystem(scene, { texture: TX.glowSprite(), max: Math.floor(3000 * mul), additive: true, name: 'glow' });
    this.spark = new ParticleSystem(scene, { texture: TX.sparkSprite(), max: Math.floor(4000 * mul), additive: true, name: 'spark' });
    this.shard = new ParticleSystem(scene, { texture: TX.shardSprite(), max: Math.floor(2000 * mul), additive: true, name: 'shard' });
    this.debris = new ParticleSystem(scene, { texture: TX.debrisSprite(), max: Math.floor(1500 * mul), additive: false, name: 'debris' });
    this.streak = new ParticleSystem(scene, { texture: TX.streakSprite(), max: Math.floor(1500 * mul), additive: true, name: 'streak' });
    this.plus = new ParticleSystem(scene, { texture: TX.plusSprite(), max: Math.floor(600 * mul) + 100, additive: true, name: 'plus' });
    this.systems = [this.smoke, this.debris, this.fire, this.glow, this.spark, this.shard, this.streak, this.plus];

    // Fixed light pool: a constant light count avoids shader recompiles.
    this.lights = [];
    for (let i = 0; i < 8; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.userData = { life: 0, max: 1, peak: 0, owner: null };
      scene.add(l);
      this.lights.push(l);
    }
    this.effects = [];
    this.swipes = new Map(); this.swipeFree = []; // blade swipe trails (see swipe())
    this.beams = new Map(); this.beamFree = [[], []]; // beam ribbons (see beam()): normal-blend and additive pools
    this.decalGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.boltTex = TX.boltTexture();
    this.heightAt = () => 0;
    this.ball = new Ballistics(scene, camera); // tracer rounds and muzzle flashes (ballistics.js)
  }

  setScale(px) { for (const s of this.systems) s.mat.uniforms.uScale.value = px; }
  setFog(d) { for (const s of this.systems) s.mat.uniforms.uFogDensity.value = d; }
  n(count) { return Math.max(1, Math.round(count * this.mul)); }

  update(dt) {
    this.time += dt;
    for (const s of this.systems) s.update(dt, this.time);
    this.ball.update(dt);
    for (const l of this.lights) {
      const u = l.userData;
      if (u.owner) continue;
      if (u.life > 0) {
        u.life -= dt;
        const t = Math.max(0, u.life / u.max);
        l.intensity = u.peak * t * t;
      } else l.intensity = 0;
    }
    this.updateSwipes();
    this.updateBeams();
    for (let i = 0; i < this.effects.length; i++) {
      const e = this.effects[i];
      e.t += dt;
      const alive = e.update(dt, e.t) !== false && e.t < (e.dur ?? 1e9);
      if (!alive) {
        e.dispose && e.dispose();
        this.effects.splice(i, 1);
        i--;
      }
    }
  }

  clearAll() {
    for (const s of this.systems) s.clear();
    for (const [k, sw] of this.swipes) { sw.pts.length = 0; sw.mesh.visible = false; this.swipeFree.push(sw); }
    this.swipes.clear();
    for (const [, b] of this.beams) { b.mesh.visible = false; this.beamFree[b.add ? 1 : 0].push(b); }
    this.beams.clear();
    for (const e of this.effects) e.dispose && e.dispose();
    this.effects = [];
    for (const l of this.lights) { l.userData.owner = null; l.userData.life = 0; l.intensity = 0; }
  }

  add(effect) { effect.t = 0; this.effects.push(effect); return effect; }

  flash(p, color, intensity = 30, dur = 0.25, dist = 14) {
    let best = null;
    for (const l of this.lights) {
      if (l.userData.owner) continue;
      if (!best || l.userData.life < best.userData.life) best = l;
    }
    if (!best) return;
    best.position.set(p[0], p[1], p[2]);
    best.color.set(color);
    best.distance = dist;
    best.userData.life = best.userData.max = dur;
    best.userData.peak = intensity;
    best.intensity = intensity;
  }

  // A light that follows something until released.
  holdLight(owner, color, intensity, dist) {
    const l = this.lights.find((x) => !x.userData.owner && x.userData.life <= 0) || this.lights.find((x) => !x.userData.owner);
    if (!l) return null;
    l.userData.owner = owner;
    l.color.set(color);
    l.intensity = intensity;
    l.distance = dist;
    return l;
  }
  releaseLight(l) { if (l) { l.userData.owner = null; l.userData.life = 0; l.intensity = 0; } }

  decal(p, tex, size, dur, { color = 0xffffff, additive = false, opacity = 1, rot = Math.random() * 6.28, grow = 0 } = {}) {
    const m = new THREE.MeshBasicMaterial({
      map: tex, color, transparent: true, depthWrite: false, opacity,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    const mesh = new THREE.Mesh(this.decalGeo, m);
    mesh.position.set(p[0], this.heightAt(p[0], p[2]) + 0.12, p[2]);
    mesh.rotation.y = rot;
    mesh.scale.set(size, 1, size);
    mesh.renderOrder = 1;
    this.scene.add(mesh);
    return this.add({
      dur, mesh,
      update: (dt, t) => {
        const k = t / dur;
        m.opacity = opacity * (k > 0.7 ? (1 - k) / 0.3 : 1);
        if (grow) { const s = size * (1 + grow * Math.min(1, t * 4)); mesh.scale.set(s, 1, s); }
      },
      dispose: () => { this.scene.remove(mesh); m.dispose(); },
    });
  }

  shockwave(p, radius, color, dur = 0.5, y = 0.3) {
    const geo = new THREE.RingGeometry(0.7, 1, 48).rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(p[0], (p[1] ?? this.heightAt(p[0], p[2])) + y, p[2]);
    this.scene.add(mesh);
    this.add({
      dur,
      update: (dt, t) => {
        const k = t / dur;
        const s = 0.5 + radius * (1 - Math.pow(1 - k, 3));
        mesh.scale.set(s, 1, s);
        m.opacity = (1 - k) * 0.9;
      },
      dispose: () => { this.scene.remove(mesh); geo.dispose(); m.dispose(); },
    });
  }

  // Jagged lightning between two points, re-forked every few frames.
  bolt(a, b, { width = 0.5, dur = 0.25, color = 0xaaccff, jag = 0.18, branches = 2 } = {}) {
    const segs = 18;
    const maxPts = (segs + 1) * (1 + branches);
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(maxPts * 2 * 3);
    const uv = new Float32Array(maxPts * 2 * 2);
    const idx = [];
    for (let s = 0; s < 1 + branches; s++) {
      for (let i = 0; i < segs; i++) {
        const base = (s * (segs + 1) + i) * 2;
        idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const m = new THREE.MeshBasicMaterial({ map: this.boltTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, m);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    const tmp = new THREE.Vector3(), dir = new THREE.Vector3(), side = new THREE.Vector3(), cam = new THREE.Vector3();
    let paths = [];
    const fork = () => {
      paths = [];
      const main = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const off = Math.sin(t * Math.PI) * len * jag;
        main.push(new THREE.Vector3().lerpVectors(A, B, t).add(new THREE.Vector3(rnd(-off, off), rnd(-off, off), rnd(-off, off))));
      }
      main[0].copy(A); main[segs].copy(B);
      paths.push({ pts: main, w: width });
      for (let k = 0; k < branches; k++) {
        const st = main[Math.floor(rnd(3, segs - 4))];
        const end = st.clone().add(new THREE.Vector3(rnd(-1, 1), rnd(-1, 0.3), rnd(-1, 1)).multiplyScalar(len * 0.35));
        const br = [];
        for (let i = 0; i <= segs; i++) {
          const t = i / segs;
          const off = Math.sin(t * Math.PI) * len * jag * 0.4;
          br.push(new THREE.Vector3().lerpVectors(st, end, t).add(new THREE.Vector3(rnd(-off, off), rnd(-off, off), rnd(-off, off))));
        }
        paths.push({ pts: br, w: width * 0.45 });
      }
    };
    const build = () => {
      this.camera.getWorldPosition(cam);
      let o = 0;
      for (let s = 0; s < 1 + branches; s++) {
        const path = paths[s];
        for (let i = 0; i <= segs; i++) {
          const p = path ? path.pts[i] : A;
          const w = path ? path.w * (s ? 1 - i / segs : 1) : 0;
          const q = path ? path.pts[Math.min(segs, i + 1)] : B;
          const r = path ? path.pts[Math.max(0, i - 1)] : A;
          dir.subVectors(q, r).normalize();
          tmp.subVectors(cam, p).normalize();
          side.crossVectors(dir, tmp).normalize().multiplyScalar(w);
          pos[o * 3] = p.x + side.x; pos[o * 3 + 1] = p.y + side.y; pos[o * 3 + 2] = p.z + side.z;
          uv[o * 2] = i / segs; uv[o * 2 + 1] = 0; o++;
          pos[o * 3] = p.x - side.x; pos[o * 3 + 1] = p.y - side.y; pos[o * 3 + 2] = p.z - side.z;
          uv[o * 2] = i / segs; uv[o * 2 + 1] = 1; o++;
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.uv.needsUpdate = true;
    };
    fork();
    build();
    let since = 0;
    this.add({
      dur,
      update: (dt, t) => {
        since += dt;
        if (since > 0.05) { since = 0; fork(); }
        build();
        m.opacity = Math.random() > 0.15 ? 1 - t / dur * 0.6 : 0.2;
      },
      dispose: () => { this.scene.remove(mesh); geo.dispose(); m.dispose(); },
    });
  }

  // ---------- Swipe trails ----------
  // A blade traces a glowing ribbon between its base point `b` and tip `t` (world space) as it cuts. Call every frame
  // the blade is moving, with a stable `key` per blade, the swing's progress `ph` and an opacity scale `k`; `c` is the wearer's position, used to keep fast swings round
  // between frames. A new swing (a gap of more than 0.12 s) starts a fresh ribbon; it fades over SWIPE_LIFE.
  swipe(key, b, t, c, ph = 0, k = 1, color = [0.62, 0.84, 1]) {
    let s = this.swipes.get(key);
    if (!s) { s = this.swipeFree.pop() || this.makeSwipe(); s.pts.length = 0; this.swipes.set(key, s); }
    s.color = color; s.k = k;
    const last = s.pts[s.pts.length - 1], back = ph < (s.ph || 0); // the swing's progress ph (0..1) running backwards means a new swing
    s.ph = ph;
    if (!last || back || this.time - last.at > 0.12) { s.pts.length = 0; s.pts.push({ b: b.clone(), t: t.clone(), at: this.time }); return; }
    const polar = (p) => ({ r: Math.hypot(p.x - c.x, p.z - c.z), a: Math.atan2(p.x - c.x, p.z - c.z), y: p.y });
    const lb = polar(last.b), lt = polar(last.t), nb = polar(b), nt = polar(t);
    const turn = (p0, p1) => { const d = p1.a - p0.a; return Math.atan2(Math.sin(d), Math.cos(d)); };
    const n = Math.min(10, Math.max(1, Math.ceil(Math.abs(turn(lt, nt)) / 0.1)));
    const mk = (p0, p1, k) => { const a = p0.a + turn(p0, p1) * k, r = p0.r + (p1.r - p0.r) * k; return new THREE.Vector3(c.x + Math.sin(a) * r, p0.y + (p1.y - p0.y) * k, c.z + Math.cos(a) * r); };
    for (let i = 1; i <= n; i++) s.pts.push({ b: mk(lb, nb, i / n), t: mk(lt, nt, i / n), at: last.at + (this.time - last.at) * (i / n) });
    if (s.pts.length > SWIPE_MAX) s.pts.splice(0, s.pts.length - SWIPE_MAX);
  }

  makeSwipe() {
    const geo = new THREE.BufferGeometry(), V = SWIPE_MAX * 3, ix = new Uint16Array((SWIPE_MAX - 1) * 12);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(V * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(V * 4), 4));
    // Rows of three vertices per sample (base, near-tip, tip): two quads between neighbouring samples.
    for (let i = 0; i < SWIPE_MAX - 1; i++) for (let r = 0; r < 2; r++) {
      const a = i * 3 + r, b = a + 3, o = (i * 2 + r) * 6;
      ix.set([a, a + 1, b, a + 1, b + 1, b], o);
    }
    geo.setIndex(new THREE.BufferAttribute(ix, 1));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.visible = false;
    this.scene.add(mesh);
    return { mesh, geo, pts: [], color: [1, 1, 1] };
  }

  updateSwipes() {
    for (const [key, s] of this.swipes) {
      const pts = s.pts;
      while (pts.length && this.time - pts[0].at > SWIPE_LIFE) pts.shift();
      if (pts.length < 2) {
        s.mesh.visible = false;
        if (!pts.length) { this.swipes.delete(key); this.swipeFree.push(s); }
        continue;
      }
      const P = s.geo.attributes.position, C = s.geo.attributes.color, col = s.color;
      for (let i = 0; i < pts.length; i++) {
        const q = pts[i], f = Math.pow(Math.max(0, 1 - (this.time - q.at) / SWIPE_LIFE), 1.6);
        const rows = [[q.b, 0.05], [q.t.clone().lerp(q.b, 0.12), 0.35], [q.t, 0.9]];
        for (let r = 0; r < 3; r++) {
          const v = i * 3 + r;
          P.setXYZ(v, rows[r][0].x, rows[r][0].y, rows[r][0].z);
          C.setXYZW(v, col[0], col[1], col[2], rows[r][1] * f * (s.k ?? 1));
        }
      }
      P.needsUpdate = C.needsUpdate = true;
      s.geo.setDrawRange(0, (pts.length - 1) * 12);
      s.mesh.visible = true;
    }
  }

  // Flaming Weapons: a burning round. Fire licks along the first stretch of its path and bursts where it lands.
  fireShot(a, b, light = false) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1, n = this.n(light ? 4 : 8), R = (p, q) => p + Math.random() * (q - p);
    for (let i = 0; i < n; i++) { const d = Math.min(L, 1.2 + (i / n) * Math.min(L, 26) + R(0, 1.5)), k = d / L;
      this.fire.emit({ p: [a[0] + dx * k + R(-0.05, 0.05), a[1] + dy * k + R(-0.05, 0.05), a[2] + dz * k + R(-0.05, 0.05)], v: [dx / L * 5 + R(-0.4, 0.4), R(0.4, 1.4), dz / L * 5 + R(-0.4, 0.4)], life: R(0.22, 0.45), s0: R(0.16, 0.3), s1: 0.04, c0: [1, 0.55, 0.14, 0.85], c1: [0.9, 0.16, 0.02, 0] }); }
    for (let i = 0; i < this.n(light ? 3 : 6); i++) this.fire.emit({ p: [b[0] + R(-0.12, 0.12), b[1] + R(-0.05, 0.15), b[2] + R(-0.12, 0.12)], v: [R(-1, 1), R(1, 2.6), R(-1, 1)], life: R(0.3, 0.6), s0: R(0.3, 0.5), s1: 0.06, c0: [1, 0.6, 0.16, 0.9], c1: [0.9, 0.16, 0.02, 0] });
    for (let i = 0; i < this.n(3); i++) this.spark.emit({ p: [b[0], b[1], b[2]], v: [R(-3, 3), R(1.5, 4.5), R(-3, 3)], life: R(0.35, 0.8), s0: 0.07, s1: 0.01, c0: [1, 0.6, 0.15, 1], c1: [0.9, 0.15, 0, 0], g: 6 });
  }
  tracer(a, b, color = [1, 0.85, 0.5], beamLen = 0) {
    if (beamLen > 0) { // a short beam: only the stretch just ahead of the muzzle is drawn
      const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1, k = Math.min(1, beamLen / L);
      b = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
      return this.oldTracer(a, b, color);
    }
    // A real round: a thin hot streak that travels from the muzzle to the hit (ballistics.js).
    this.ball.bullet(a, b, color || [1, 0.78, 0.42]);
  }

  // The old glowing-puff tracer, kept for short energy beams (Alien Blaster).
  oldTracer(a, b, color) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    const n = Math.min(16, Math.max(4, Math.floor(len / 3)));
    const rot = Math.atan2(dy, Math.hypot(dx, dz));
    // Bright, fat tracer: a saturated halo with a white-hot core so shots read clearly in any light.
    const hot = color.map((c) => Math.min(1, c * 1.25 + 0.15));
    for (let i = 0; i < n; i++) {
      const t = i / n, p = [a[0] + dx * t, a[1] + dy * t, a[2] + dz * t], v = [dx / len * 30, dy / len * 30, dz / len * 30];
      this.streak.emit({ p, v, life: 0.16, s0: 1.1, s1: 0.4, c0: [...hot, 1], c1: [...color, 0], rot });
      this.streak.emit({ p, v, life: 0.1, s0: 0.5, s1: 0.2, c0: [1, 1, 1, 1], c1: [1, 1, 1, 0], rot });
    }
    // A glowing slug at the muzzle end of the line.
    this.glow.emit({ p: [a[0] + dx / len * 1.2, a[1] + dy / len * 1.2, a[2] + dz / len * 1.2], life: 0.1, s0: 0.7, s1: 0.2, c0: [...hot, 0.9], c1: [...color, 0] });
  }

  // ---------- Beams ----------
  // A camera-facing ribbon from a to b that lives `life` seconds after its last refresh. The Pulse Cannon keeps one
  // key and refreshes it on every pulse (a glowing stream with a rippling core); Laser Vision keeps one per eye; the
  // Web Swing line is a pale normal-blended thread refreshed every frame (`grow` shoots it out, `sag` droops it).
  beam(key, a, b, { color = [0.4, 0.85, 1], core = [1, 1, 1], width = 0.2, life = 0.09, grow = 0, sag = 0, add = true, alpha = 1, ripple = add } = {}) {
    if (a.isVector3) a = [a.x, a.y, a.z];
    if (b.isVector3) b = [b.x, b.y, b.z];
    let s = this.beams.get(key);
    if (!s) { s = this.beamFree[add ? 1 : 0].pop() || this.makeBeam(add); this.beams.set(key, s); s.born = this.time; }
    s.a.set(a[0], a[1], a[2]); s.b.set(b[0], b[1], b[2]);
    s.color = color; s.core = core; s.width = width; s.life = life; s.until = this.time + life; s.grow = grow; s.sag = sag; s.alpha = alpha; s.ripple = ripple; s.add = add;
  }

  makeBeam(add) {
    const geo = new THREE.BufferGeometry(), V = (BEAM_N + 1) * 5, ix = new Uint16Array(BEAM_N * 4 * 6);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(V * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(V * 4), 4));
    // Five vertices across the ribbon per sample (clear edge, soft shoulder, bright core, shoulder, edge): four quads between neighbours.
    for (let i = 0; i < BEAM_N; i++) for (let r = 0; r < 4; r++) { const p = i * 5 + r, q = p + 5; ix.set([p, p + 1, q, p + 1, q + 1, q], (i * 4 + r) * 6); }
    geo.setIndex(new THREE.BufferAttribute(ix, 1));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.visible = false;
    this.scene.add(mesh);
    return { mesh, geo, a: new THREE.Vector3(), b: new THREE.Vector3(), born: 0 };
  }

  updateBeams() {
    const cam = this.camera.position, d = (this._bd = this._bd || new THREE.Vector3()), side = (this._bs = this._bs || new THREE.Vector3()), mid = (this._bm = this._bm || new THREE.Vector3());
    const X = [-1, -0.42, 0, 0.42, 1];
    for (const [key, s] of this.beams) {
      const left = s.until - this.time;
      if (left <= 0) { s.mesh.visible = false; this.beams.delete(key); this.beamFree[s.add ? 1 : 0].push(s); continue; }
      const f = s.grow ? Math.min(1, (this.time - s.born) / s.grow) : 1, fade = Math.min(1, left / (s.life * 0.55)) * s.alpha;
      d.subVectors(s.b, s.a);
      const len = d.length() * f;
      if (len < 0.01) { s.mesh.visible = false; continue; }
      d.normalize();
      mid.copy(s.a).addScaledVector(d, len * 0.5).sub(cam);
      side.crossVectors(d, mid).normalize();
      if (side.lengthSq() < 0.5) side.set(0, 1, 0);
      const P = s.geo.attributes.position, C = s.geo.attributes.color, col = s.color, cr = s.core;
      const A = s.add ? [0, 0.5, 1, 0.5, 0] : [0, 0.85, 1, 0.85, 0];
      for (let i = 0; i <= BEAM_N; i++) {
        const t = i / BEAM_N, px = s.a.x + d.x * len * t, py = s.a.y + d.y * len * t - s.sag * len * Math.sin(Math.PI * t), pz = s.a.z + d.z * len * t;
        const w = s.width * (s.add ? 0.5 + 0.5 * t : 1), rip = s.ripple ? 0.78 + 0.22 * Math.sin(this.time * 80 - i * 1.9) : 1;
        for (let r = 0; r < 5; r++) {
          const v = i * 5 + r, c = r === 2 ? cr : col;
          P.setXYZ(v, px + side.x * X[r] * w, py + side.y * X[r] * w, pz + side.z * X[r] * w);
          C.setXYZW(v, c[0], c[1], c[2], A[r] * fade * rip);
        }
      }
      P.needsUpdate = C.needsUpdate = true;
      s.mesh.visible = true;
    }
  }

  // A puff of silk and loose threads: a web line biting into the sky, or snapping free.
  silkPuff(p, k = 1) {
    for (let i = 0; i < this.n(7 * k); i++) {
      const v = rv(5); v[1] = rnd(0.5, 3.5);
      this.streak.emit({ p: [...p], v, life: rnd(0.2, 0.4), s0: 0.55, s1: 0.2, c0: [0.92, 0.95, 1, 0.85], c1: [0.92, 0.95, 1, 0], rot: rnd(0, 6.28), drag: 3 });
    }
    this.smoke.emit({ p: [...p], v: [0, 0.4, 0], life: 0.45, s0: 0.4 * k, s1: 1.3 * k, c0: [0.93, 0.95, 0.98, 0.55], c1: [0.93, 0.95, 0.98, 0] });
  }

  // The Web Swing line: a taut pale thread from the hand to its anchor in the sky, refreshed every frame while the
  // player hangs from it, with a faint knot of silk at the anchor.
  webLine(key, hand, anchor, fp = false) {
    this.beam(key + 'sw', hand, anchor, { color: [0.86, 0.9, 0.96], core: [1, 1, 1], width: fp ? 0.016 : 0.03, life: 0.12, add: false, alpha: 0.9, ripple: false });
    if (Math.random() < 0.5) this.glow.emit({ p: [...anchor], life: 0.12, s0: 0.9, s1: 0.7, c0: [0.92, 0.95, 1, 0.35], c1: [0.92, 0.95, 1, 0] });
  }

  // Laser Vision: a thick red beam from each eye to the same point, white-hot down the middle, with a soft haze
  // around the pair so it reads as one heavy cutting beam rather than two threads.
  laserBeams(eyes, end, key, fp = false, life = 0) {
    for (let i = 0; i < 2; i++) {
      const e = eyes[i] || eyes[0], a = Array.isArray(e) ? e : [e.x, e.y, e.z];
      this.beam(key + (i ? 'lr' : 'll'), a, end, { color: [1, 0.12, 0.08], core: [1, 0.8, 0.72], width: fp ? 0.055 : 0.13, life: life || 0.1, ripple: false });
      this.beam(key + (i ? 'hr' : 'hl'), a, end, { color: [1, 0.15, 0.08], core: [1, 0.3, 0.15], width: fp ? 0.14 : 0.3, life: life || 0.1, ripple: false, alpha: 0.28 });
    }
  }

  // Laser impact: a hot red flash, sparks and a wisp of smoke where the beams burn.
  laserHit(p) {
    this.glow.emit({ p: [...p], life: 0.1, s0: 0.9, s1: 1.6, c0: [1, 0.45, 0.3, 0.9], c1: [1, 0.15, 0.05, 0] });
    for (let i = 0; i < this.n(3); i++) {
      const v = rv(6); v[1] = rnd(1, 4);
      this.spark.emit({ p: [...p], v, life: rnd(0.15, 0.35), s0: 0.2, s1: 0.04, c0: [1, 0.7, 0.4, 1], c1: [1, 0.2, 0.05, 0], g: 10 });
    }
    if (Math.random() < 0.3) this.smoke.emit({ p: [...p], v: [0, 1.2, 0], life: 0.7, s0: 0.3, s1: 0.9, c0: [0.25, 0.22, 0.2, 0.45], c1: [0.2, 0.2, 0.2, 0] });
    this.flash(p, 0xff4a2a, 10, 0.06, 6);
  }

  // Pulse Cannon impact: a hot blue-white flash and sparks.
  pulseHit(p) {
    this.glow.emit({ p: [...p], life: 0.1, s0: 1.3, s1: 2.3, c0: [0.65, 0.95, 1, 0.9], c1: [0.3, 0.8, 1, 0] });
    for (let i = 0; i < this.n(4); i++) {
      const v = rv(7); v[1] = rnd(1, 5);
      this.spark.emit({ p: [...p], v, life: rnd(0.15, 0.35), s0: 0.22, s1: 0.04, c0: [0.65, 0.95, 1, 1], c1: [0.2, 0.6, 1, 0], g: 10 });
    }
  }

  // One pulse of the Pulse Cannon: its own glowing beam instead of a tracer. `key` names the shooter; `life` (seconds)
  // is for effects that arrive less often than the gun fires (teammates).
  shotFx(wp, a, b, key, fp = false, life = 0) {
    this.beam(key + 'p', a, b, { color: [0.3, 0.8, 1], core: [0.9, 1, 1], width: fp ? 0.05 : 0.1, life: life || 0.1 });
  }

  // Pulse Cannon muzzle: a bright blue-white flare and a quick light on the gun.
  pulseMuzzle(p, size = 1) {
    this.glow.emit({ p: [...p], life: 0.07, s0: 1.4 * size, s1: 2.1 * size, c0: [0.7, 0.96, 1, 0.9], c1: [0.3, 0.8, 1, 0] });
    this.flash(p, 0x6fdcff, 16, 0.08, 9);
  }

  // ---------- Composite helpers ----------
  explosion(p, scale = 1, { color = [1, 0.55, 0.15], smoke = true } = {}) {
    const n = this.n(26 * scale);
    for (let i = 0; i < n; i++) {
      const v = rv(6 * scale);
      v[1] = Math.abs(v[1]) * 0.8 + 2;
      const hot = i < n * 0.25;
      this.fire.emit({ p: [p[0] + rnd(-0.5, 0.5) * scale, p[1] + rnd(0, 0.6), p[2] + rnd(-0.5, 0.5) * scale], v, life: rnd(0.35, 0.8), s0: rnd(1.2, 2) * scale, s1: rnd(2.2, 3.4) * scale, c0: hot ? [1, 0.75, 0.4, 0.8] : [1, 0.45, 0.12, 0.6], c1: [color[0] * 0.6, color[1] * 0.12, 0.01, 0], drag: 3, g: -2, rotV: rnd(-2, 2) });
    }
    if (smoke) for (let i = 0; i < this.n(18 * scale); i++) {
      const v = rv(2.5 * scale); v[1] = rnd(1.5, 4);
      this.smoke.emit({ p: [p[0] + rnd(-1, 1) * scale, p[1] + rnd(0, 1), p[2] + rnd(-1, 1) * scale], v, life: rnd(1.4, 2.6), s0: 2 * scale, s1: 6 * scale, c0: [0.09, 0.08, 0.075, 0.85], c1: [0.2, 0.19, 0.18, 0], drag: 1.2, g: -0.6, rotV: rnd(-0.6, 0.6) });
    }
    for (let i = 0; i < this.n(30 * scale); i++) {
      const v = rv(14 * scale); v[1] = Math.abs(v[1]) + 4;
      this.spark.emit({ p: [...p], v, life: rnd(0.4, 1.1), s0: 0.25, s1: 0.05, c0: [1, 0.8, 0.4, 1], c1: [1, 0.3, 0.05, 0], g: 18, drag: 0.6 });
    }
    this.glow.emit({ p: [p[0], p[1] + 0.5, p[2]], life: 0.15, s0: 4 * scale, s1: 7 * scale, c0: [1, 0.6, 0.25, 0.7], c1: [1, 0.3, 0.05, 0] });
    this.flash([p[0], p[1] + 1.5, p[2]], 0xff7a2a, 45 * scale, 0.4, 16 * scale);
  }

  // A visible rocket or grenade. Flies from o along d (rockets speed up from a slow launch, grenades arc under
  // gravity), trails smoke, and when hitTest(pos) says it touched something, or it hits the ground, it blows
  // up with an explosion and calls onExplode(pos) once. Damage and sound belong to the caller.
  projectile(kind, o, d, { speed = 60, hitTest, onExplode, range = 150, size = 2 } = {}) {
    const rocket = kind === 'rocket';
    if (!this._projMesh) {
      const olive = new THREE.MeshStandardMaterial({ color: 0x5a6438, metalness: 0.3, roughness: 0.5 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x23252a, metalness: 0.8, roughness: 0.4 });
      const brass = new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.3 });
      const mk = (parts) => { const gr = new THREE.Group(); for (const [geo, mat] of parts) gr.add(new THREE.Mesh(geo, mat)); return gr; };
      const Z = (g) => g.rotateX(Math.PI / 2);
      this._projMesh = {
        rocket: () => mk([
          [Z(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 12)).translate(0, 0, -0.1), olive],
          [Z(new THREE.ConeGeometry(0.05, 0.22, 12)).translate(0, 0, 0.285), dark],
          [Z(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 8)).translate(0, 0, -0.45), dark],
          ...[0, 1, 2, 3].map((i) => [new THREE.BoxGeometry(0.01, 0.1, 0.1).translate(0, 0.06, -0.38).rotateZ(i * Math.PI / 2), dark]),
        ]),
        grenade: () => mk([
          [Z(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 10)).translate(0, 0, 0), olive],
          [Z(new THREE.SphereGeometry(0.045, 10, 6)).translate(0, 0, 0.06), olive],
          [Z(new THREE.CylinderGeometry(0.047, 0.047, 0.04, 10)).translate(0, 0, -0.07), brass],
        ]),
      };
    }
    const mesh = this._projMesh[rocket ? 'rocket' : 'grenade']();
    const pos = new THREE.Vector3(...o), vel = new THREE.Vector3(...d).normalize();
    const Zax = new THREE.Vector3(0, 0, 1), back = new THREE.Vector3(), last = pos.clone();
    let v = rocket ? speed * 0.35 : speed, traveled = 0;
    vel.multiplyScalar(v);
    this.scene.add(mesh);
    const light = this.holdLight({}, rocket ? 0xff8a3a : 0xffb060, rocket ? 26 : 6, rocket ? 14 : 6);
    const sm = [0.62, 0.6, 0.58];
    const finish = () => {
      const gy = this.heightAt(pos.x, pos.z);
      if (pos.y < gy + 0.2) pos.y = gy + 0.2;
      const P = [pos.x, pos.y, pos.z];
      this.explosion(P, size);
      this.shockwave([pos.x, gy, pos.z], 5 * size, 0xff7733, 0.5);
      this.decal([pos.x, 0, pos.z], TX.scorchDecal(), 3.5 * size, 12);
      for (let i = 0; i < this.n(10 * size); i++) { const a = Math.random() * 6.28, sp = rnd(6, 14); this.debris.emit({ p: [pos.x, pos.y + 0.3, pos.z], v: [Math.cos(a) * sp, rnd(5, 12), Math.sin(a) * sp], life: rnd(0.7, 1.4), s0: rnd(0.25, 0.5), s1: 0.15, c0: [1, 1, 1, 1], c1: [1, 1, 1, 1], g: 22, rotV: rnd(-8, 8) }); }
      onExplode && onExplode(P);
    };
    let age = 0;
    this.add({
      dur: 20,
      update: (dt) => {
        age += dt;
        if (rocket) { v = Math.min(speed, v + (speed - speed * 0.35) * dt * 4); vel.setLength(v); } else vel.y -= 17 * (muOn(LOWGRAV) ? 0.4 : 1) * dt;
        const step = vel.length() * dt, n = Math.max(1, Math.ceil(step / 0.55));
        last.copy(pos);
        for (let i = 0; i < n; i++) {
          pos.addScaledVector(vel, dt / n);
          if (pos.y <= this.heightAt(pos.x, pos.z) + 0.05 || (hitTest && hitTest(pos))) { traveled = Infinity; break; }
        }
        traveled += step;
        mesh.position.copy(pos);
        back.copy(vel).normalize();
        mesh.quaternion.setFromUnitVectors(Zax, back);
        if (!rocket) mesh.rotateZ(this.time * 14); // grenades tumble
        if (light) light.position.copy(pos);
        // Trail: smoke along everything flown this frame, and a hot flame at the tail of a rocket.
        const segs = Math.max(1, Math.ceil(step / 0.35));
        for (let i = 0; i < segs; i++) {
          const t = (i + 0.5) / segs, x = last.x + (pos.x - last.x) * t, y = last.y + (pos.y - last.y) * t, z = last.z + (pos.z - last.z) * t;
          if (rocket) {
            if (this.q > 0 || i % 2 === 0) this.smoke.emit({ p: [x - back.x * 0.5, y - back.y * 0.5, z - back.z * 0.5], v: [rnd(-0.4, 0.4), rnd(0.2, 0.8), rnd(-0.4, 0.4)], life: rnd(1.5, 2.3), s0: 0.45, s1: rnd(2.2, 3.2), c0: [sm[0], sm[1], sm[2], 0.55], c1: [0.5, 0.5, 0.5, 0], drag: 0.8, rotV: rnd(-0.5, 0.5) });
            this.fire.emit({ p: [x - back.x * 0.55, y - back.y * 0.55, z - back.z * 0.55], v: [-back.x * 8 + rnd(-1, 1), -back.y * 8 + rnd(-1, 1), -back.z * 8 + rnd(-1, 1)], life: rnd(0.12, 0.25), s0: rnd(0.5, 0.8), s1: 0.12, c0: [1, 0.75, 0.35, 0.9], c1: [1, 0.3, 0.05, 0], drag: 2 });
          } else if (i % 2 === 0) this.smoke.emit({ p: [x, y, z], v: [0, 0.2, 0], life: 0.7, s0: 0.2, s1: 0.9, c0: [0.7, 0.7, 0.7, 0.3], c1: [0.6, 0.6, 0.6, 0] });
        }
        if (rocket) this.glow.emit({ p: [pos.x - back.x * 0.6, pos.y - back.y * 0.6, pos.z - back.z * 0.6], life: 0.05, s0: 1.4, s1: 1.4, c0: [1, 0.8, 0.45, 0.9], c1: [1, 0.55, 0.2, 0.5] });
        if (traveled > range || age > 6 || mesh.position.y < -50) { finish(); return false; }
        return true;
      },
      dispose: () => { this.scene.remove(mesh); mesh.traverse((c) => c.geometry && c.geometry.dispose()); this.releaseLight(light); },
    });
  }

  dustBurst(p, scale = 1, col = [0.55, 0.48, 0.38]) {
    for (let i = 0; i < this.n(16 * scale); i++) {
      const a = Math.random() * 6.28, sp = rnd(2, 6) * scale;
      this.smoke.emit({ p: [p[0], p[1] + 0.3, p[2]], v: [Math.cos(a) * sp, rnd(0.5, 2), Math.sin(a) * sp], life: rnd(0.8, 1.6), s0: 1.2 * scale, s1: 4 * scale, c0: [...col, 0.7], c1: [col[0] * 1.1, col[1] * 1.1, col[2] * 1.1, 0], drag: 2.5, rotV: rnd(-1, 1) });
    }
    for (let i = 0; i < this.n(14 * scale); i++) {
      const v = rv(5 * scale); v[1] = rnd(4, 9) * scale;
      this.debris.emit({ p: [p[0], p[1] + 0.2, p[2]], v, life: rnd(0.6, 1.2), s0: rnd(0.2, 0.45) * scale, s1: 0.15, c0: [1, 1, 1, 1], c1: [1, 1, 1, 1], g: 22, rotV: rnd(-8, 8) });
    }
  }

  // A player taking a hit: a gout of blood out of the wound, a mist, and a splat on the ground. k scales with the
  // damage (1 = a solid hit), dir is the way the blood flies (away from the attacker).
  playerBlood(p, dir, k = 1) {
    const col = [0.5, 0.03, 0.05];
    const n = this.n(Math.round(22 + 26 * k));
    for (let i = 0; i < n; i++) {
      const v = rv(3.5 + 2.5 * k);
      v[0] += dir[0] * (3 + 3 * k); v[1] = rnd(1.5, 5.5); v[2] += dir[2] * (3 + 3 * k);
      this.debris.emit({ p: [p[0] + rnd(-0.15, 0.15), p[1] + rnd(-0.3, 0.25), p[2] + rnd(-0.15, 0.15)], v, life: rnd(0.35, 0.85), s0: rnd(0.05, 0.15) * (0.8 + 0.4 * k), s1: 0.03, c0: [col[0] * 1.7, col[1] * 2, col[2] * 2, 1], c1: [col[0] * 0.6, col[1], col[2], 0.9], g: 20, drag: 1.2, rotV: rnd(-7, 7) });
    }
    for (let i = 0; i < this.n(3); i++) {
      this.smoke.emit({ p: [p[0], p[1] + rnd(-0.2, 0.2), p[2]], v: [dir[0] * 1.6 + rnd(-0.6, 0.6), 0.7, dir[2] * 1.6 + rnd(-0.6, 0.6)], life: rnd(0.4, 0.75), s0: 0.45, s1: 1.5 + k, c0: [col[0] * 0.8, col[1], col[2], 0.55], c1: [col[0] * 0.4, col[1], col[2], 0] });
    }
    // The splat lands a step away in the spray direction; a glancing hit does not always leave one.
    if (k > 0.35 || Math.random() < 0.5) {
      const d = rnd(0.3, 1.3) + k * 0.6;
      this.decal([p[0] + dir[0] * d + rnd(-0.3, 0.3), 0, p[2] + dir[2] * d + rnd(-0.3, 0.3)], TX.bloodDecal(), rnd(1.0, 1.6) + k * 0.8, 20, { opacity: 0.9 });
    }
  }

  blood(p, col = [0.35, 0.05, 0.08]) {
    for (let i = 0; i < this.n(8); i++) {
      const v = rv(3); v[1] = rnd(1, 4);
      this.debris.emit({ p: [...p], v, life: rnd(0.3, 0.6), s0: 0.2, s1: 0.08, c0: [col[0] * 2, col[1] * 2, col[2] * 2, 1], c1: [col[0], col[1], col[2], 0.8], g: 18 });
    }
    this.smoke.emit({ p: [...p], v: [0, 0.5, 0], life: 0.5, s0: 0.6, s1: 1.4, c0: [col[0], col[1], col[2], 0.5], c1: [col[0], col[1], col[2], 0] });
  }

  impact(p, col = [1, 0.8, 0.5]) {
    for (let i = 0; i < this.n(6); i++) {
      const v = rv(6); v[1] = rnd(1, 5);
      this.spark.emit({ p: [...p], v, life: rnd(0.15, 0.35), s0: 0.18, s1: 0.04, c0: [...col, 1], c1: [col[0], col[1] * 0.5, 0.1, 0], g: 12 });
    }
    this.smoke.emit({ p: [...p], v: [0, 0.6, 0], life: 0.6, s0: 0.4, s1: 1.4, c0: [0.5, 0.47, 0.42, 0.4], c1: [0.5, 0.47, 0.42, 0] });
  }

  // A real muzzle flash (ballistics.js): a quick star burst and flame tongues, a short warm light and a thin wisp.
  muzzle(p, dir, col = [1, 0.75, 0.4], size = 0.3) {
    this.ball.flash(p, dir, size);
    this.smoke.emit({ p: [...p], v: [dir[0] * 1.5, 0.5, dir[2] * 1.5], life: 0.45, s0: 0.12, s1: 0.5, c0: [0.62, 0.6, 0.58, 0.12], c1: [0.62, 0.6, 0.58, 0] });
    this.flash(p, 0xffa850, 7, 0.05, 6);
  }

}
