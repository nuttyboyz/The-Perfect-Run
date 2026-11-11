// Element visuals. Every function here is deterministic from its arguments,
// so the caster and every other player render the same thing from one event.
// Gameplay callbacks (hitTest / onHit / onStep / onTick) are only passed by
// the caster; remote copies render visuals only.
import { muOn, LOWGRAV } from './mutators.js';
import * as THREE from 'three';
import * as TX from './textures.js';
import { mulberry32, makeNoise } from './rng.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const rnd = (a, b) => a + Math.random() * (b - a);

let ROCK_GEOS = null, ROCK_MAT = null, ICE_GEO = null, ICE_MAT = null;

function rockGeos() {
  if (ROCK_GEOS) return ROCK_GEOS;
  ROCK_GEOS = [];
  for (let k = 0; k < 4; k++) {
    const g = new THREE.IcosahedronGeometry(1, 3);
    const n = makeNoise(100 + k);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const d = 0.75 + n.fbm(v.x * 1.6 + 5, v.y * 1.6 + v.z * 1.3, 4) * 0.55 + (n.ridged(v.x * 3, v.z * 3 + v.y, 2) - 0.5) * 0.12;
      v.multiplyScalar(d);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    ROCK_GEOS.push(g);
  }
  return ROCK_GEOS;
}

// A sharp, faceted shard of rock (base at y = 0, tip at y = 1) for Pillar Burst.
let SHARD_GEOS = null;
function shardGeos() {
  if (SHARD_GEOS) return SHARD_GEOS;
  SHARD_GEOS = [];
  for (let k = 0; k < 3; k++) {
    const g = new THREE.ConeGeometry(1, 1, 6 + k, 4);
    g.translate(0, 0.5, 0);
    const p = g.attributes.position, n = makeNoise(300 + k);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (y > 0.985) continue; // the tip stays a needle point
      const j = 1 + (n.fbm(x * 2.3 + y * 3 + 4, z * 2.3 + y * 2, 3) - 0.5) * 0.7 * (1 - y * 0.6);
      p.setXYZ(i, x * j + Math.sin(y * 9 + k) * 0.05, y, z * j + Math.cos(y * 7 + k) * 0.05);
    }
    g.computeVertexNormals();
    SHARD_GEOS.push(g);
  }
  return SHARD_GEOS;
}

export function rockMaterial(tint) {
  const m = TX.rockMaps(tint || [0.46, 0.4, 0.34]);
  return new THREE.MeshStandardMaterial({ map: m.map, normalMap: m.normalMap, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.93, metalness: 0.02 });
}

function rockMat() {
  if (!ROCK_MAT) ROCK_MAT = rockMaterial();
  return ROCK_MAT;
}

export function iceGeo() {
  if (ICE_GEO) return ICE_GEO;
  const body = new THREE.CylinderGeometry(0.32, 0.36, 1.1, 6, 1).translate(0, 0.55, 0);
  const tip = new THREE.ConeGeometry(0.32, 0.8, 6, 1).translate(0, 1.5, 0);
  ICE_GEO = mergeGeometries([body.toNonIndexed(), tip.toNonIndexed()]);
  ICE_GEO.computeVertexNormals();
  return ICE_GEO;
}

export function iceMat() {
  if (ICE_MAT) return ICE_MAT;
  const m = TX.iceMaps();
  ICE_MAT = new THREE.MeshPhysicalMaterial({
    color: 0xd8f2ff, map: m.map, normalMap: m.normalMap, roughness: 0.12, metalness: 0.0,
    clearcoat: 1, clearcoatRoughness: 0.08, transparent: true, opacity: 0.82,
    emissive: 0x1c4a6e, emissiveIntensity: 0.55, envMapIntensity: 2.2, flatShading: true,
  });
  return ICE_MAT;
}

const tmpV = new THREE.Vector3();

// The hell pit's glare. Also built ahead of the first Zombie Staff slam (Game.warmSummons), so its shader isn't compiled mid-fight.
export const hellPitMaterial = () => new THREE.ShaderMaterial({
  uniforms: { uT: { value: 0 }, uA: { value: 0 } },
  vertexShader: 'varying vec2 vP; void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform float uT; uniform float uA; varying vec2 vP;
    void main(){
      float r = length(vP), th = atan(vP.y, vP.x);
      float w = .5 + .5 * sin(th * 5. + r * 9. - uT * 8.) * sin(th * 3. - uT * 5.);
      float core = smoothstep(1., .2, r);
      vec3 c = mix(vec3(.7, .06, .0), vec3(1., .72, .2), core * (.5 + .5 * w));
      float a = smoothstep(1., .82, r) * uA;
      gl_FragColor = vec4(c * a * 1.6, a);
    }`,
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
});

export class Elements {
  constructor(fx, scene) {
    this.fx = fx;
    this.scene = scene;
    this.h = (x, z) => fx.heightAt(x, z);
  }

  // ---------------- FIRE ----------------
  // pierce: a blazing orb that flies through everything (no hitTest), calling onPass(pos) ten times a second, and only bursts on the ground or at max range.
  fireball(o, d, { speed = 34, hitTest, onExplode, onPass, range = 60, pierce = false } = {}) {
    const fx = this.fx;
    let passT = 0;
    const pos = new THREE.Vector3(...o);
    const dir = new THREE.Vector3(...d).normalize();
    const light = fx.holdLight({}, 0xff7a2a, 30, 12);
    let traveled = 0;
    const explode = () => {
      fx.explosion([pos.x, pos.y, pos.z], pierce ? 1.8 : 1.3);
      fx.shockwave([pos.x, this.h(pos.x, pos.z), pos.z], pierce ? 8 : 6, 0xff7733, 0.45);
      fx.decal([pos.x, 0, pos.z], TX.scorchDecal(), 7, 9);
      onExplode && onExplode([pos.x, pos.y, pos.z]);
    };
    fx.add({
      dur: 4,
      update: (dt) => {
        const step = speed * dt;
        pos.addScaledVector(dir, step);
        traveled += step;
        if (light) light.position.copy(pos);
        for (let i = 0; i < fx.n(8); i++) {
          fx.fire.emit({ p: [pos.x + rnd(-0.2, 0.2), pos.y + rnd(-0.2, 0.2), pos.z + rnd(-0.2, 0.2)], v: [-dir.x * 3 + rnd(-1, 1), rnd(0, 1.5), -dir.z * 3 + rnd(-1, 1)], life: rnd(0.2, 0.45), s0: rnd(0.9, 1.4), s1: 0.3, c0: [1, 0.6, 0.2, 0.7], c1: [0.7, 0.1, 0.01, 0], drag: 2, g: -3 });
        }
        fx.smoke.emit({ p: [pos.x, pos.y, pos.z], v: [rnd(-0.5, 0.5), 1, rnd(-0.5, 0.5)], life: 1, s0: 0.6, s1: 2.2, c0: [0.2, 0.18, 0.16, 0.5], c1: [0.3, 0.3, 0.3, 0], drag: 1 });
        fx.glow.emit({ p: [pos.x, pos.y, pos.z], life: 0.04, s0: 1.8, s1: 1.8, c0: [1, 0.75, 0.4, 0.9], c1: [1, 0.6, 0.3, 0.7] });
        if (Math.random() < 0.6) fx.spark.emit({ p: [pos.x, pos.y, pos.z], v: [rnd(-3, 3), rnd(-1, 3), rnd(-3, 3)], life: 0.5, s0: 0.2, s1: 0.05, c0: [1, 0.8, 0.3, 1], c1: [1, 0.3, 0, 0], g: 8 });
        const ground = this.h(pos.x, pos.z);
        if (pierce) {
          // A bigger, fiercer orb: a thick flame tail and a ring of embers, and it scorches what it passes.
          for (let i = 0; i < fx.n(6); i++) fx.fire.emit({ p: [pos.x + rnd(-0.5, 0.5), pos.y + rnd(-0.5, 0.5), pos.z + rnd(-0.5, 0.5)], v: [-dir.x * 5 + rnd(-1.5, 1.5), rnd(0, 2), -dir.z * 5 + rnd(-1.5, 1.5)], life: rnd(0.3, 0.6), s0: rnd(1.6, 2.4), s1: 0.4, c0: [1, 0.55, 0.15, 0.7], c1: [0.6, 0.08, 0.01, 0], drag: 1, turb: 4 });
          fx.glow.emit({ p: [pos.x, pos.y, pos.z], life: 0.05, s0: 3.4, s1: 3.4, c0: [1, 0.7, 0.3, 0.7], c1: [1, 0.5, 0.2, 0.4] });
          if (onPass) { passT += dt; if (passT >= 0.1) { passT = 0; onPass([pos.x, pos.y, pos.z]); } }
        }
        if (pos.y <= ground + 0.2 || traveled > range || (!pierce && hitTest && hitTest(pos)) || (traveled > 1.5 && this.solid && this.solid(pos.x, pos.y, pos.z))) {
          explode();
          return false;
        }
      },
      dispose: () => fx.releaseLight(light),
    });
  }

  // Wall of Fire: a curtain of flame from a to b for dur seconds. onTick(a, b) fires four times a second for damage.
  firewall(a, b, dur = 6, onTick) {
    const fx = this.fx;
    const L = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
    const mid = [(a[0] + b[0]) / 2, a[1], (a[2] + b[2]) / 2];
    const light = fx.holdLight({}, 0xff6a20, 40, L * 1.6); // L is the wall's length; it stands about 1.7x taller than it used to
    const N = Math.max(3, Math.round(L / 2.4));
    for (let i = 0; i <= N; i++) { const s = i / N; fx.decal([a[0] + (b[0] - a[0]) * s, 0, a[2] + (b[2] - a[2]) * s], TX.scorchDecal(), 3.4, dur + 6); }
    fx.shockwave(mid, L / 2, 0xff7a30, 0.4);
    let tick = 0;
    const R = () => Math.random() - 0.5;
    fx.add({
      dur,
      update: (dt, t) => {
        const k = t < 0.35 ? t / 0.35 : t > dur - 1 ? Math.max(0, dur - t) : 1; // flares up, then dies down over the last second
        if (light) { light.position.set(mid[0], mid[1] + 3.6, mid[2]); light.intensity = (34 + Math.sin(t * 25) * 8) * k; }
        const n = fx.n(L * 2.6 * k);
        for (let i = 0; i < n; i++) {
          const s = Math.random(), x = a[0] + (b[0] - a[0]) * s + R() * 1.2, z = a[2] + (b[2] - a[2]) * s + R() * 1.2, y = fx.heightAt(x, z);
          fx.fire.emit({ p: [x, y + 0.2, z], v: [R() * 1.2, (3.5 + Math.random() * 3.5 * k) * 1.7, R() * 1.2], life: (0.55 + Math.random() * 0.6) * 1.2, s0: (1.2 + Math.random() * 0.9) * 1.3, s1: 0.4, c0: [1, 0.62, 0.22, 0.9], c1: [0.8, 0.15, 0.02, 0], turb: 3.5 });
        }
        // A soft heat glow gives the curtain its body.
        if (Math.random() < 0.9 * k) { const s = Math.random(), x = a[0] + (b[0] - a[0]) * s, z = a[2] + (b[2] - a[2]) * s; fx.glow.emit({ p: [x, fx.heightAt(x, z) + 2.4, z], v: [0, 1.8, 0], life: 0.55, s0: 2.1, s1: 3.1, c0: [1, 0.4, 0.08, 0.14], c1: [1, 0.25, 0.04, 0] }); }
        if (Math.random() < 0.8 * k) { const s = Math.random(), x = a[0] + (b[0] - a[0]) * s, z = a[2] + (b[2] - a[2]) * s; fx.spark.emit({ p: [x + R(), fx.heightAt(x, z) + 2.5, z + R()], v: [R() * 1.5, (3 + Math.random() * 3) * 1.5, R() * 1.5], life: 1.4, s0: 0.08, s1: 0.03, c0: [1, 0.7, 0.3, 1], c1: [1, 0.2, 0, 0], turb: 3 }); }
        if (Math.random() < 0.4 * k) { const s = Math.random(), x = a[0] + (b[0] - a[0]) * s, z = a[2] + (b[2] - a[2]) * s; fx.smoke.emit({ p: [x + R(), fx.heightAt(x, z) + 4.6, z + R()], v: [R() * 0.6, 1.6, R() * 0.6], life: 1.8, s0: 1.0, s1: 2.6, c0: [0.12, 0.1, 0.09, 0.45], c1: [0.1, 0.1, 0.1, 0] }); }
        tick += dt;
        if (onTick && tick >= 0.25) { tick -= 0.25; onTick(a, b); }
      },
      dispose: () => fx.releaseLight(light),
    });
  }

  // Blasts go off at random spots inside the ring about every 0.18 s; onBlast(p) fires for each (caster only).
  inferno(follow, dur = 4, radius = 7, onTick, onBlast) {
    const fx = this.fx;
    const light = fx.holdLight({}, 0xff6a20, 50, radius * 3);
    let tick = 0, blast = 0.3;
    const p0 = follow();
    fx.decal([p0[0], 0, p0[2]], TX.scorchDecal(), radius * 2.6, dur + 6);
    fx.shockwave(p0, radius, 0xff7a30, 0.5);
    fx.add({
      dur,
      update: (dt, t) => {
        const p = follow();
        if (light) { light.position.set(p[0], p[1] + 2, p[2]); light.intensity = 40 + Math.sin(t * 30) * 10; }
        const grow = Math.min(1, t * 3);
        const pts = fx.n(14);
        for (let i = 0; i < pts; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = radius * grow * rnd(0.85, 1.05);
          const x = p[0] + Math.cos(a) * r, z = p[2] + Math.sin(a) * r;
          const y = this.h(x, z);
          fx.fire.emit({ p: [x, y + 0.2, z], v: [rnd(-0.6, 0.6), rnd(3, 6), rnd(-0.6, 0.6)], life: rnd(0.4, 0.85), s0: rnd(1.1, 1.8), s1: 0.3, c0: i % 3 ? [1, 0.45, 0.1, 0.65] : [1, 0.72, 0.35, 0.75], c1: [0.6, 0.06, 0.01, 0], drag: 1, turb: 6, rotV: rnd(-2, 2) });
          if (i % 3 === 0) fx.smoke.emit({ p: [x, y + 2.5, z], v: [rnd(-0.4, 0.4), rnd(1.5, 3), rnd(-0.4, 0.4)], life: rnd(1.5, 2.5), s0: 1.5, s1: 5, c0: [0.07, 0.06, 0.055, 0.6], c1: [0.18, 0.17, 0.16, 0], drag: 0.6 });
          if (i % 3 === 0) fx.spark.emit({ p: [x, y + 1, z], v: [rnd(-2, 2), rnd(4, 9), rnd(-2, 2)], life: rnd(0.6, 1.4), s0: 0.16, s1: 0.04, c0: [1, 0.75, 0.3, 1], c1: [1, 0.3, 0.05, 0], g: 2, turb: 10 });
        }
        if (onTick) { tick += dt; if (tick >= 0.25) { tick = 0; onTick(p, radius * grow); } }
        blast -= dt;
        while (blast <= 0 && t < dur - 0.3) {
          blast += 0.18;
          const a = Math.random() * Math.PI * 2, r = radius * grow * Math.sqrt(Math.random()) * 0.95;
          const bp = [p[0] + Math.cos(a) * r, 0, p[2] + Math.sin(a) * r];
          bp[1] = this.h(bp[0], bp[2]) + 0.4;
          fx.explosion(bp, 0.9, { smoke: false });
          if (onBlast) onBlast(bp);
        }
      },
      dispose: () => fx.releaseLight(light),
    });
  }

  // ---------------- EARTH ----------------
  stoneWard(follow, dur = 6) {
    const fx = this.fx, scene = this.scene;
    const group = new THREE.Group();
    const geos = rockGeos(), mat = rockMat();
    const plates = [];
    const rings = [[3.0, 0.3, 13, 0.1], [2.85, 1.05, 12, 0.3]];
    let seed = 1;
    for (const [r, y, count, tilt] of rings) {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + y;
        const m = new THREE.Mesh(geos[(seed++) % 4], mat);
        m.castShadow = true;
        const s = 0.75 + ((seed * 37) % 10) / 30;
        m.scale.set(s * 0.95, s * 0.62, s * 0.4);
        m.userData = { a, r, y, tilt, delay: Math.random() * 0.18 };
        m.position.set(Math.cos(a) * r, y - 3, Math.sin(a) * r);
        m.lookAt(0, y + 0.5, 0);
        m.rotateX(-tilt);
        group.add(m);
        plates.push(m);
      }
    }
    // Faint energy shell inside the rocks so gaps read as protected.
    const shellMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uA: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 w = modelMatrix*vec4(position,1.); vP=position; vN=normalize(mat3(modelMatrix)*normal); vV=normalize(cameraPosition-w.xyz); gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uT; uniform float uA; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
        void main(){ float f = pow(max(0.0, 1.0 - abs(dot(vN, vV))), 2.5);
          float hex = abs(sin(vP.x*7.0+uT*2.0)*sin(vP.y*7.0-uT*1.3)*sin(vP.z*7.0+uT));
          float a = (f*0.75 + smoothstep(0.85,1.0,hex)*0.25) * uA;
          gl_FragColor = vec4(vec3(1.0,0.62,0.25)*a*1.6, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(2.9, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), shellMat);
    group.add(shell);
    scene.add(group);
    const p0 = follow();
    fx.dustBurst(p0, 1.5);
    fx.decal([p0[0], 0, p0[2]], TX.crackDecal(), 6, dur + 3);
    fx.shockwave(p0, 4, 0xc8955a, 0.5);
    let ending = false;
    const e = fx.add({
      dur: dur + 0.8,
      update: (dt, t) => {
        const p = follow();
        group.position.set(p[0], this.h(p[0], p[2]), p[2]);
        group.rotation.y += dt * 0.35;
        shellMat.uniforms.uT.value = t;
        const rise = (m) => Math.min(1, Math.max(0, (t - m.userData.delay) / 0.35));
        if (t < dur) {
          shellMat.uniforms.uA.value = Math.min(1, t * 2) * (0.75 + Math.sin(t * 5) * 0.1);
          for (const m of plates) {
            const k = rise(m);
            const ease = 1 - Math.pow(1 - k, 3);
            m.position.y = m.userData.y - 3 + ease * 3 + Math.sin(t * 2 + m.userData.a * 3) * 0.04;
          }
          if (Math.random() < 0.15) {
            const a = Math.random() * 6.28;
            fx.debris.emit({ p: [p[0] + Math.cos(a) * 2.2, group.position.y + rnd(0.5, 2.5), p[2] + Math.sin(a) * 2.2], v: [0, -1, 0], life: 0.8, s0: 0.12, s1: 0.08, c0: [1, 1, 1, 1], c1: [1, 1, 1, 1], g: 14 });
          }
        } else {
          if (!ending) { ending = true; fx.dustBurst(p, 1.4); }
          const k = (t - dur) / 0.8;
          shellMat.uniforms.uA.value = Math.max(0, 1 - k * 3);
          for (const m of plates) {
            m.position.y -= dt * (2 + k * 10);
            m.rotation.x += dt * 2;
          }
        }
      },
      dispose: () => { scene.remove(group); shell.geometry.dispose(); shellMat.dispose(); },
    });
    return e;
  }

  quake(o, d, len = 22, onStep) {
    const fx = this.fx, scene = this.scene;
    const dir = new THREE.Vector3(d[0], 0, d[2]).normalize();
    const steps = 14;
    const geos = rockGeos(), mat = rockMat();
    const spikes = [];
    let done = 0;
    fx.add({
      dur: 3.2,
      update: (dt, t) => {
        while (done < steps && t > done * 0.045) {
          const dist = 2 + (done / (steps - 1)) * len;
          const x = o[0] + dir.x * dist, z = o[2] + dir.z * dist;
          const y = this.h(x, z);
          fx.dustBurst([x, y, z], 0.8);
          fx.decal([x, 0, z], TX.crackDecal(), 4.5, 6);
          for (let k = 0; k < 2; k++) {
            const m = new THREE.Mesh(geos[(done + k) % 4], mat);
            const s = rnd(0.7, 1.2);
            m.scale.set(s * 0.6, s * 1.6, s * 0.6);
            m.position.set(x + rnd(-0.9, 0.9), y - 2.5, z + rnd(-0.9, 0.9));
            m.rotation.set(rnd(-0.4, 0.4), rnd(0, 6), rnd(-0.4, 0.4));
            m.castShadow = true;
            m.userData = { born: t, y };
            scene.add(m);
            spikes.push(m);
          }
          if (done % 3 === 0) fx.flash([x, y + 1, z], 0xffaa66, 6, 0.2, 8);
          onStep && onStep([x, y, z]);
          done++;
        }
        for (const m of spikes) {
          const a = t - m.userData.born;
          const up = a < 0.12 ? a / 0.12 : a < 2.3 ? 1 : Math.max(0, 1 - (a - 2.3) / 0.6);
          m.position.y = m.userData.y - 2.5 + up * 2.6;
        }
      },
      dispose: () => { for (const m of spikes) scene.remove(m); },
    });
  }

  // Boulder Toss: a rock rips out of the ground and is hurled along `d` in a heavy arc, tumbling, shedding grit.
  boulder(o, d, { speed = 30, hitTest, onImpact, range = 55 } = {}) {
    const fx = this.fx, scene = this.scene;
    const m = new THREE.Mesh(rockGeos()[1], rockMat());
    m.castShadow = true;
    m.scale.set(1.05, 0.88, 0.95);
    const pos = new THREE.Vector3(...o), vel = new THREE.Vector3(d[0], d[1] + 0.16, d[2]).normalize().multiplyScalar(speed);
    const spin = [rnd(-7, 7), rnd(-4, 4), rnd(-7, 7)];
    m.position.copy(pos);
    scene.add(m);
    fx.dustBurst([o[0], this.h(o[0], o[2]), o[2]], 1.1);
    fx.decal([o[0], 0, o[2]], TX.crackDecal(), 2.6, 5);
    for (let i = 0; i < fx.n(10); i++) fx.debris.emit({ p: [o[0] + rnd(-0.5, 0.5), this.h(o[0], o[2]) + 0.2, o[2] + rnd(-0.5, 0.5)], v: [rnd(-2, 2), rnd(3, 7), rnd(-2, 2)], life: rnd(0.5, 0.9), s0: rnd(0.2, 0.4), s1: 0.15, c0: [0.5, 0.38, 0.26, 1], c1: [0.4, 0.3, 0.2, 0], g: 16, drag: 0.4 });
    let traveled = 0;
    const smash = () => {
      const y = this.h(pos.x, pos.z), p = [pos.x, Math.max(pos.y, y), pos.z];
      fx.dustBurst([p[0], y, p[2]], 1.7, [0.58, 0.48, 0.36]);
      fx.shockwave([p[0], y, p[2]], 5, 0xc8955a, 0.4);
      fx.decal([p[0], 0, p[2]], TX.crackDecal(), 6.5, 9);
      fx.flash([p[0], y + 1, p[2]], 0xffb070, 10, 0.18, 9);
      for (let i = 0; i < fx.n(26); i++) {
        const a = Math.random() * 6.28, sp = rnd(3, 9);
        fx.debris.emit({ p: [p[0], y + 0.3, p[2]], v: [Math.cos(a) * sp, rnd(4, 10), Math.sin(a) * sp], life: rnd(0.6, 1.2), s0: rnd(0.3, 0.7), s1: 0.25, c0: [0.5, 0.38, 0.26, 1], c1: [0.4, 0.3, 0.2, 0], g: 18, drag: 0.3 });
      }
      onImpact && onImpact(p);
    };
    fx.add({
      dur: 5,
      update: (dt) => {
        vel.y -= 17 * (muOn(LOWGRAV) ? 0.4 : 1) * dt;
        pos.addScaledVector(vel, dt);
        traveled += speed * dt;
        m.position.copy(pos);
        m.rotation.x += spin[0] * dt; m.rotation.y += spin[1] * dt; m.rotation.z += spin[2] * dt;
        if (Math.random() < 0.7) fx.debris.emit({ p: [pos.x + rnd(-0.3, 0.3), pos.y + rnd(-0.3, 0.3), pos.z + rnd(-0.3, 0.3)], v: [rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)], life: rnd(0.3, 0.6), s0: 0.14, s1: 0.06, c0: [0.5, 0.4, 0.3, 1], c1: [0.4, 0.3, 0.2, 0], g: 10 });
        if (Math.random() < 0.5) fx.smoke.emit({ p: [pos.x, pos.y, pos.z], v: [0, 0.4, 0], life: 0.6, s0: 0.5, s1: 1.4, c0: [0.6, 0.5, 0.38, 0.3], c1: [0.6, 0.5, 0.4, 0], drag: 1 });
        if (pos.y <= this.h(pos.x, pos.z) + 0.35 || traveled > range || (hitTest && hitTest(pos)) || (traveled > 1.5 && this.solid && this.solid(pos.x, pos.y, pos.z))) { smash(); return false; }
      },
      dispose: () => scene.remove(m),
    });
  }

  // Rock Armor: slabs of stone fly in and clamp on to the body (chest, shoulders, forearms, thighs), riding along with the
  // runner. `follow` returns [x, y, z, yaw]. The returned effect's end() breaks the armor early: the slabs crumble off.
  rockArmor(follow, dur = 8) {
    const fx = this.fx, scene = this.scene;
    const group = new THREE.Group();
    const geos = rockGeos(), mat = rockMat();
    // [x, y, z, sx, sy, sz, yaw] in body space (z is forward).
    const slots = [
      [0, 1.35, 0.22, 0.42, 0.34, 0.16, 0], [0, 1.0, 0.24, 0.4, 0.26, 0.15, 0], [0, 1.3, -0.24, 0.44, 0.4, 0.16, Math.PI],
      [0.46, 1.62, 0, 0.26, 0.2, 0.26, 1.5], [-0.46, 1.62, 0, 0.26, 0.2, 0.26, -1.5],
      [0.46, 1.1, 0.08, 0.17, 0.3, 0.17, 1.5], [-0.46, 1.1, 0.08, 0.17, 0.3, 0.17, -1.5],
      [0.2, 0.55, 0.12, 0.2, 0.3, 0.2, 0.3], [-0.2, 0.55, 0.12, 0.2, 0.3, 0.2, -0.3],
      [0.2, 0.55, -0.14, 0.2, 0.26, 0.16, Math.PI], [-0.2, 0.55, -0.14, 0.2, 0.26, 0.16, Math.PI],
    ];
    const plates = slots.map((sl, i) => {
      const m = new THREE.Mesh(geos[i % 4], mat);
      m.castShadow = true;
      m.scale.set(sl[3], sl[4], sl[5]);
      m.rotation.y = sl[6];
      m.userData = { to: new THREE.Vector3(sl[0], sl[1], sl[2]), from: new THREE.Vector3(sl[0] * 6 + rnd(-1, 1), sl[1] - 1.2 + rnd(0, 0.5), sl[2] * 6 + rnd(-1, 1)), delay: i * 0.025, vy: 0 };
      m.position.copy(m.userData.from);
      group.add(m);
      return m;
    });
    scene.add(group);
    const p0 = follow();
    fx.dustBurst(p0, 1.4);
    fx.decal([p0[0], 0, p0[2]], TX.crackDecal(), 5, dur + 2);
    fx.flash([p0[0], p0[1] + 1, p0[2]], 0xffb070, 8, 0.25, 8);
    let endAt = dur, ending = false;
    const e = fx.add({
      dur: dur + 1.2,
      update: (dt, t) => {
        const p = follow();
        group.position.set(p[0], p[1], p[2]);
        group.rotation.y = p[3] || 0;
        if (t < endAt) {
          for (const m of plates) {
            const k = Math.min(1, Math.max(0, (t - m.userData.delay) / 0.3));
            const ease = 1 - Math.pow(1 - k, 3);
            m.position.lerpVectors(m.userData.from, m.userData.to, ease);
          }
          if (Math.random() < 0.25) fx.debris.emit({ p: [p[0] + rnd(-0.4, 0.4), p[1] + rnd(0.4, 1.6), p[2] + rnd(-0.4, 0.4)], v: [0, -0.5, 0], life: 0.7, s0: 0.08, s1: 0.05, c0: [0.6, 0.5, 0.4, 1], c1: [0.6, 0.5, 0.4, 0], g: 12 });
          if (Math.random() < 0.3) fx.glow.emit({ p: [p[0] + rnd(-0.3, 0.3), p[1] + rnd(0.6, 1.5), p[2] + rnd(-0.3, 0.3)], life: 0.3, s0: 0.5, s1: 0.1, c0: [1, 0.6, 0.25, 0.35], c1: [1, 0.5, 0.2, 0] });
        } else {
          if (!ending) { ending = true; fx.dustBurst(p, 1.2); for (const m of plates) m.userData.vy = rnd(1, 3); }
          for (const m of plates) {
            m.userData.vy -= 14 * dt;
            m.position.y += m.userData.vy * dt;
            m.position.x *= 1 + dt * 2; m.position.z *= 1 + dt * 2;
            m.rotation.x += dt * 4;
          }
          if (t > endAt + 0.9) return false;
        }
      },
      dispose: () => scene.remove(group),
    });
    e.end = () => { endAt = Math.min(endAt, e.t); };
    return e;
  }

  // The shock of Rock Armor taking a hit: a ring of force and grit bursts out of the ground at the wearer's feet.
  armorShock(p) {
    const fx = this.fx, y = this.h(p[0], p[2]);
    fx.shockwave([p[0], y, p[2]], 4.5, 0xd9a25a, 0.35);
    fx.dustBurst([p[0], y, p[2]], 0.9, [0.6, 0.5, 0.38]);
    for (let i = 0; i < fx.n(16); i++) {
      const a = Math.random() * 6.28;
      fx.debris.emit({ p: [p[0] + Math.cos(a) * 0.8, y + 0.2, p[2] + Math.sin(a) * 0.8], v: [Math.cos(a) * rnd(4, 8), rnd(2, 5), Math.sin(a) * rnd(4, 8)], life: rnd(0.4, 0.8), s0: rnd(0.2, 0.4), s1: 0.15, c0: [0.5, 0.38, 0.26, 1], c1: [0.4, 0.3, 0.2, 0], g: 16, drag: 0.5 });
    }
    fx.flash([p[0], y + 1, p[2]], 0xffb070, 8, 0.12, 7);
  }

  // Pillar Burst: a column of rock erupts under each point in `pts` (the enemies' feet), holds, then sinks back.
  pillars(pts, from, dur = 1.6) {
    const fx = this.fx, scene = this.scene;
    const geos = rockGeos(), shards = shardGeos(), mat = rockMat(), DEEP = 8.2;
    const cols = pts.map((p, i) => {
      const g = new THREE.Group();
      // a long needle of rock in the middle, a ring of leaning shards around it and broken boulders at its foot
      const base = new THREE.Mesh(geos[i % 4], mat);
      base.scale.set(1.35, 0.9, 1.35); base.position.y = 0.5;
      const spire = new THREE.Mesh(shards[i % 3], mat);
      spire.scale.set(0.95, 7.4 + Math.random() * 1.2, 0.95); spire.rotation.z = (Math.random() - 0.5) * 0.1;
      base.castShadow = spire.castShadow = true;
      g.add(base, spire);
      const nS = 6;
      for (let k = 0; k < nS; k++) {
        const an = (k / nS) * 6.28 + Math.random() * 0.5, rr = 0.75 + Math.random() * 0.75;
        const sh = new THREE.Mesh(shards[(i + k) % 3], mat), w = 0.34 + Math.random() * 0.3;
        sh.scale.set(w, 2.6 + Math.random() * 3.0, w);
        sh.position.set(Math.cos(an) * rr, 0, Math.sin(an) * rr);
        const tilt = 0.22 + Math.random() * 0.38;
        sh.rotation.set(Math.sin(an) * tilt, Math.random() * 6.28, -Math.cos(an) * tilt, 'YXZ');
        sh.castShadow = true;
        g.add(sh);
      }
      for (let k = 0; k < 3; k++) { const an = Math.random() * 6.28, rr = 1.5 + Math.random() * 0.7; const b = new THREE.Mesh(geos[(i + k + 1) % 4], mat); const sc = 0.35 + Math.random() * 0.3; b.scale.set(sc, sc * 0.8, sc); b.position.set(Math.cos(an) * rr, 0.2, Math.sin(an) * rr); g.add(b); }
      const y = this.h(p[0], p[2]);
      g.position.set(p[0], y - DEEP, p[2]);
      g.rotation.y = Math.random() * 6.28;
      const delay = from ? Math.hypot(p[0] - from[0], p[2] - from[2]) * 0.02 : i * 0.03;
      g.userData = { y, delay, up: false };
      if (this.block) this.block(p[0], p[2], 1.7, y + 7, delay + dur + 0.2); // while it stands, no shot passes through it
      scene.add(g);
      return g;
    });
    if (from) { const y = this.h(from[0], from[2]); fx.shockwave([from[0], y, from[2]], 12, 0xd9a25a, 0.5); fx.dustBurst([from[0], y, from[2]], 1.2); }
    fx.add({
      dur: dur + 0.7,
      update: (dt, t) => {
        for (const g of cols) {
          const u = g.userData, a = t - u.delay;
          if (a < 0) continue;
          if (!u.up) {
            u.up = true;
            fx.dustBurst([g.position.x, u.y, g.position.z], 1.1, [0.58, 0.48, 0.36]);
            fx.decal([g.position.x, 0, g.position.z], TX.crackDecal(), 4, dur + 5);
            fx.flash([g.position.x, u.y + 2, g.position.z], 0xffb070, 7, 0.15, 7);
            for (let k = 0; k < fx.n(12); k++) { const an = Math.random() * 6.28; fx.debris.emit({ p: [g.position.x, u.y + 0.3, g.position.z], v: [Math.cos(an) * rnd(2, 6), rnd(5, 11), Math.sin(an) * rnd(2, 6)], life: rnd(0.6, 1.1), s0: rnd(0.25, 0.55), s1: 0.2, c0: [0.5, 0.38, 0.26, 1], c1: [0.4, 0.3, 0.2, 0], g: 18, drag: 0.3 }); }
          }
          const rise = a < 0.14 ? 1 - Math.pow(1 - a / 0.14, 2) : a < dur ? 1 : Math.max(0, 1 - (a - dur) / 0.6);
          g.position.y = u.y - DEEP + rise * DEEP;
        }
      },
      dispose: () => { for (const g of cols) scene.remove(g); },
    });
  }

  // ---------------- STORM ----------------
  // The long piercing bolt (> 40 m): a fat core, a few braided strands that fan out of the muzzle and pinch back
  // together on one focal point at the far end. Short reflected arcs fall through to the thin per-segment look.
  chain(points) {
    const fx = this.fx;
    const O = points[0], E = points[points.length - 1];
    const dx = E[0] - O[0], dy = E[1] - O[1], dz = E[2] - O[2], L = Math.hypot(dx, dy, dz);
    if (points.length >= 2 && L > 40) {
      const d = [dx / L, dy / L, dz / L];
      let u = [d[2], 0, -d[0]]; const ul = Math.hypot(...u) || 1; u = u.map(q => q / ul);
      const v = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
      const PIECE = 34, N = Math.ceil(L / PIECE);
      const S = 4, R = 4.5, tw = rnd(0, 6.28);
      const at = (t, k) => {
        const o = k < 0 ? 0 : R * Math.sin(Math.PI * Math.sqrt(t)) * (0.75 + 0.25 * Math.sin(t * 9 + k * 1.7));
        const a = tw + (k < 0 ? 0 : (k / S) * 6.2832 + t * 3.2);
        const c = Math.cos(a) * o, sn = Math.sin(a) * o;
        return [O[0] + dx * t + u[0] * c + v[0] * sn, O[1] + dy * t + u[1] * c + v[1] * sn, O[2] + dz * t + u[2] * c + v[2] * sn];
      };
      for (let k = -1; k < S; k++) {
        const core = k < 0;
        for (let i = 0; i < N; i++) {
          const a = at(i / N, k), b = at((i + 1) / N, k);
          if (core) {
            fx.bolt(a, b, { width: 1.7, dur: 4.0, color: 0x3a5cff, branches: 0, jag: 0.02 });
            fx.bolt(a, b, { width: 0.8, dur: 3.95, color: 0xb9d4ff, branches: 0, jag: 0.03 });
            fx.bolt(a, b, { width: 0.35, dur: 3.9, color: 0xffffff, branches: 0, jag: 0.03 });
          } else fx.bolt(a, b, { width: 0.7, dur: 3.97, color: 0xa8c4ff, branches: 1, jag: 0.07 });
        }
      }
      // the focal point: everything snaps together here
      for (let k = 0; k < fx.n(40); k++) fx.spark.emit({ p: [...E], v: [rnd(-16, 16), rnd(-6, 16), rnd(-16, 16)], life: rnd(0.3, 0.8), s0: 0.4, s1: 0.05, c0: [0.85, 0.93, 1, 1], c1: [0.4, 0.5, 1, 0], g: 8 });
      fx.glow.emit({ p: [...E], life: 0.4, s0: 14, s1: 24, c0: [0.8, 0.9, 1, 1], c1: [0.3, 0.4, 1, 0] });
      fx.flash(E, 0xb9d0ff, 120, 0.3, 40);
      fx.glow.emit({ p: [...O], life: 0.25, s0: 3, s1: 6, c0: [0.8, 0.9, 1, 1], c1: [0.3, 0.4, 1, 0] });
      for (let i = 1; i < points.length - 1; i++) {
        const b = points[i];
        for (let k = 0; k < fx.n(8); k++) fx.spark.emit({ p: [...b], v: [rnd(-6, 6), rnd(0, 7), rnd(-6, 6)], life: rnd(0.2, 0.5), s0: 0.22, s1: 0.04, c0: [0.8, 0.9, 1, 1], c1: [0.4, 0.5, 1, 0], g: 10 });
        fx.glow.emit({ p: [...b], life: 0.2, s0: 4, s1: 7, c0: [0.6, 0.75, 1, 1], c1: [0.3, 0.4, 1, 0] });
      }
      return;
    }
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      fx.bolt(a, b, { width: 0.32, dur: 0.32, color: 0xb9d4ff, branches: 2 });
      fx.bolt(a, b, { width: 0.9, dur: 0.2, color: 0x4a6cff, branches: 0, jag: 0.12 });
      for (let k = 0; k < fx.n(10); k++) fx.spark.emit({ p: [...b], v: [rnd(-6, 6), rnd(0, 7), rnd(-6, 6)], life: rnd(0.2, 0.5), s0: 0.2, s1: 0.04, c0: [0.8, 0.9, 1, 1], c1: [0.4, 0.5, 1, 0], g: 10 });
      fx.glow.emit({ p: [...b], life: 0.2, s0: 4, s1: 6, c0: [0.6, 0.75, 1, 1], c1: [0.3, 0.4, 1, 0] });
      fx.flash(b, 0x9fbaff, 25, 0.18, 12);
    }
  }

  strike(x, z, big = 1) {
    const fx = this.fx;
    const y = this.h(x, z);
    fx.bolt([x + rnd(-3, 3), y + 24, z + rnd(-3, 3)], [x, y, z], { width: 0.6 * big, dur: 0.35, color: 0xc8dcff, branches: 3, jag: 0.12 });
    fx.bolt([x, y + 24, z], [x, y, z], { width: 1.8 * big, dur: 0.18, color: 0x3d5cff, branches: 0, jag: 0.08 });
    fx.flash([x, y + 3, z], 0xaac4ff, 90 * big, 0.3, 26);
    fx.glow.emit({ p: [x, y + 0.5, z], life: 0.3, s0: 6 * big, s1: 10 * big, c0: [0.7, 0.8, 1, 1], c1: [0.3, 0.4, 1, 0] });
    for (let k = 0; k < fx.n(18); k++) fx.spark.emit({ p: [x, y + 0.3, z], v: [rnd(-9, 9), rnd(3, 12), rnd(-9, 9)], life: rnd(0.3, 0.8), s0: 0.22, s1: 0.04, c0: [0.85, 0.92, 1, 1], c1: [0.4, 0.5, 1, 0], g: 16 });
    fx.decal([x, 0, z], TX.scorchDecal(), 3.5 * big, 6);
    fx.dustBurst([x, y, z], 0.5 * big, [0.4, 0.4, 0.42]);
  }

  // Shockwave: a ring of crackling electricity bursts out of o along the ground at `speed` m/s to `R` metres.
  // onTick(r, prev) runs every frame with the front's current and previous radius (caster only).
  shockwave(o, R = 60, speed = 44, onTick) {
    const fx = this.fx, scene = this.scene, N = 112;
    const pos = new Float32Array(N * 3 * 3), col = new Float32Array(N * 3 * 3), ix = [];
    for (let i = 0; i < N; i++) {
      const a = i, b = (i + 1) % N;
      ix.push(a * 3, a * 3 + 1, b * 3, b * 3, a * 3 + 1, b * 3 + 1); // trailing glow on the ground
      ix.push(a * 3 + 1, a * 3 + 2, b * 3 + 1, b * 3 + 1, a * 3 + 2, b * 3 + 2); // a curtain of light standing on the front
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(ix);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 5;
    scene.add(mesh);
    fx.flash([o[0], o[1] + 1.2, o[2]], 0xb9d0ff, 120, 0.35, 30);
    fx.glow.emit({ p: [o[0], o[1] + 0.8, o[2]], life: 0.35, s0: 5, s1: 14, c0: [0.8, 0.9, 1, 1], c1: [0.3, 0.4, 1, 0] });
    fx.decal([o[0], 0, o[2]], TX.scorchDecal(), 7, 6);
    for (let k = 0; k < fx.n(36); k++) fx.spark.emit({ p: [o[0], o[1] + 0.4, o[2]], v: [rnd(-14, 14), rnd(2, 12), rnd(-14, 14)], life: rnd(0.3, 0.8), s0: 0.25, s1: 0.04, c0: [0.9, 0.95, 1, 1], c1: [0.4, 0.5, 1, 0], g: 14 });
    // a handful of long forks race out ahead of the ring at fixed bearings
    const forks = []; for (let i = 0; i < 9; i++) forks.push({ a: (i / 9) * 6.2832 + rnd(-0.2, 0.2), k: rnd(0.9, 1.1) });
    let prev = 0, acc = 0;
    fx.add({
      dur: R / speed + 0.5,
      update: (dt, t) => {
        const r = Math.min(R, t * speed), fade = t * speed > R ? Math.max(0, 1 - (t - R / speed) / 0.5) : 1;
        const wid = 2.6 + r * 0.03;
        for (let i = 0; i < N; i++) {
          const a = (i / N) * 6.2832, c = Math.cos(a), sn = Math.sin(a);
          const jag = 1 + Math.sin(a * 23 + t * 40) * 0.015 + Math.sin(a * 41 - t * 55) * 0.01;
          const ro = r * jag, ri = Math.max(0, ro - wid);
          const xo = o[0] + c * ro, zo = o[2] + sn * ro, xi = o[0] + c * ri, zi = o[2] + sn * ri;
          const yo = this.h(xo, zo) + 0.7;
          pos.set([xi, this.h(xi, zi) + 0.7, zi, xo, yo, zo, xo, yo + 1.8 * fade, zo], i * 9);
          const f = fade * (0.55 + 0.45 * Math.sin(a * 17 + t * 60));
          col.set([0, 0, 0, 0.7 * f, 0.85 * f, 1.0 * f, 0.1 * f, 0.18 * f, 0.5 * f], i * 9);
        }
        geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
        // arcs crackling along the front
        acc += dt * 70;
        while (acc >= 1 && fade > 0.2 && r > 2) {
          acc -= 1;
          const a = Math.random() * 6.2832, da = rnd(0.02, 0.06) / Math.max(1, r * 0.04);
          const r1 = r - rnd(0, wid), r2 = r + rnd(0, 2.5);
          const A = [o[0] + Math.cos(a) * r1, 0, o[2] + Math.sin(a) * r1], B = [o[0] + Math.cos(a + da) * r2, 0, o[2] + Math.sin(a + da) * r2];
          A[1] = this.h(A[0], A[2]) + 0.3; B[1] = this.h(B[0], B[2]) + rnd(0.3, 2.2);
          fx.bolt(A, B, { width: 0.16, dur: 0.14, color: 0xcfe0ff, branches: 1, jag: 0.15 });
          if (Math.random() < 0.3) fx.spark.emit({ p: [...B], v: [rnd(-3, 3), rnd(2, 7), rnd(-3, 3)], life: rnd(0.2, 0.5), s0: 0.2, s1: 0.04, c0: [0.85, 0.92, 1, 1], c1: [0.4, 0.5, 1, 0], g: 10 });
        }
        for (const f of forks) {
          if (Math.random() > 0.45 || fade < 0.2) continue;
          const r1 = r * rnd(0.82, 1), r2 = r * rnd(1.0, 1.12) + 1;
          const A = [o[0] + Math.cos(f.a) * r1, 0, o[2] + Math.sin(f.a) * r1], B = [o[0] + Math.cos(f.a + rnd(-0.03, 0.03)) * r2, 0, o[2] + Math.sin(f.a + rnd(-0.03, 0.03)) * r2];
          A[1] = this.h(A[0], A[2]) + 0.4; B[1] = this.h(B[0], B[2]) + 0.4;
          fx.bolt(A, B, { width: 0.45, dur: 0.18, color: 0x7f9cff, branches: 3, jag: 0.2 });
        }
        if (Math.floor(t * 14) !== Math.floor((t - dt) * 14)) {
          const a = Math.random() * 6.2832; fx.flash([o[0] + Math.cos(a) * r, o[1] + 1.5, o[2] + Math.sin(a) * r], 0x9fbaff, 40, 0.12, 22);
        }
        onTick && onTick(r, prev);
        prev = r;
      },
      dispose: () => { scene.remove(mesh); geo.dispose(); mat.dispose(); },
    });
  }

  // Nutty (2026-11-05): every bolt that lands stays up as a crackling column until the storm ends (4 s), and anything
  // that touches a column takes the bolt's full hit again every half second (onLinger(p), caster only), so mobs
  // can't just walk through it.
  thunderstorm(c, seed, dur = 4, radius = 8, onStrike, onLinger) {
    const fx = this.fx;
    const r = mulberry32(seed);
    let next = 0.4;
    const cols = [];
    const cy = this.h(c[0], c[2]) + 17;
    fx.decal([c[0], 0, c[2]], TX.ringDecal(), radius * 2, dur, { color: 0x6f8cff, additive: true, opacity: 0.5 });
    fx.add({
      dur,
      update: (dt, t) => {
        for (let i = 0; i < fx.n(3); i++) {
          const a = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * radius * 1.3;
          fx.smoke.emit({ p: [c[0] + Math.cos(a) * rr, cy + rnd(-1, 1.5), c[2] + Math.sin(a) * rr], v: [rnd(-0.6, 0.6), rnd(-0.2, 0.2), rnd(-0.6, 0.6)], life: rnd(1.5, 2.5), s0: 5, s1: 8, c0: [0.08, 0.09, 0.13, 0.75], c1: [0.12, 0.13, 0.17, 0], rotV: rnd(-0.3, 0.3) });
        }
        if (Math.random() < 0.08) fx.flash([c[0], cy, c[2]], 0x8aa8ff, 25, 0.12, 30);
        while (t >= next && next < dur) {
          const a = r() * 6.28, rr = Math.sqrt(r()) * radius;
          const x = c[0] + Math.cos(a) * rr, z = c[2] + Math.sin(a) * rr;
          this.strike(x, z);
          const gp = [x, this.h(x, z), z];
          onStrike && onStrike(gp);
          cols.push({ p: gp, zap: 0.12 + r() * 0.1, hit: 0.5 });
          next += 0.24; // a 13 m wide cell: strikes come a little faster to keep it dense
        }
        // The standing columns: a thin crackle down each one a few times a second, a glow where it meets the ground.
        const every = fx.q === 0 ? 0.42 : 0.26;
        for (const k of cols) {
          k.zap -= dt; k.hit -= dt;
          if (k.zap <= 0) {
            k.zap = every * (0.8 + Math.random() * 0.4);
            const [x, y, z] = k.p;
            fx.bolt([x + rnd(-0.8, 0.8), y + 22, z + rnd(-0.8, 0.8)], [x, y, z], { width: 0.45, dur: every * 1.1, color: 0xb8ceff, branches: 1, jag: 0.1 });
            fx.glow.emit({ p: [x, y + 0.4, z], life: every * 1.4, s0: 2.4, s1: 3.2, c0: [0.6, 0.72, 1, 0.55], c1: [0.3, 0.4, 1, 0] });
          }
          if (onLinger && k.hit <= 0) { k.hit = 0.5; onLinger(k.p); }
        }
      },
    });
  }

  // ---------------- FROST ----------------
  frostNova(p, radius = 7) {
    const fx = this.fx, scene = this.scene;
    const geo = iceGeo(), mat = iceMat();
    const shards = [];
    const count = 22;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rnd(-0.1, 0.1);
      const m = new THREE.Mesh(geo, mat);
      m.userData = { a, r: rnd(0.7, 1), s: rnd(0.8, 1.6) };
      m.castShadow = true;
      scene.add(m);
      shards.push(m);
    }
    fx.decal([p[0], 0, p[2]], TX.frostDecal(), radius * 2.4, 7, { opacity: 0.9 });
    fx.shockwave(p, radius, 0x9fe0ff, 0.5);
    fx.flash([p[0], p[1] + 1.5, p[2]], 0x9fdcff, 40, 0.4, 16);
    for (let i = 0; i < fx.n(70); i++) {
      const a = Math.random() * 6.28, sp = rnd(5, 14);
      fx.glow.emit({ p: [p[0], p[1] + rnd(0.2, 1.2), p[2]], v: [Math.cos(a) * sp, rnd(0, 1.5), Math.sin(a) * sp], life: rnd(0.5, 1.1), s0: rnd(1.2, 2.4), s1: 3.5, c0: [0.6, 0.85, 1, 0.45], c1: [0.8, 0.95, 1, 0], drag: 3 });
      if (i % 2 === 0) fx.shard.emit({ p: [p[0], p[1] + rnd(0.3, 1.6), p[2]], v: [Math.cos(a) * sp, rnd(0, 4), Math.sin(a) * sp], life: rnd(0.6, 1.2), s0: rnd(0.3, 0.6), s1: 0.1, c0: [0.85, 0.95, 1, 1], c1: [0.6, 0.85, 1, 0], drag: 2.5, g: 2, rotV: rnd(-4, 4) });
    }
    fx.add({
      dur: 1.8,
      update: (dt, t) => {
        const out = Math.min(1, t / 0.18);
        for (const m of shards) {
          const u = m.userData;
          const r = 1 + (radius - 1) * u.r * (1 - Math.pow(1 - out, 3));
          const x = p[0] + Math.cos(u.a) * r, z = p[2] + Math.sin(u.a) * r;
          const shrink = t > 1.3 ? Math.max(0.01, 1 - (t - 1.3) / 0.5) : 1;
          m.position.set(x, this.h(x, z) - 0.2, z);
          m.scale.setScalar(u.s * shrink);
          m.rotation.set(0, -u.a, 0);
          m.rotateZ(-0.9);
        }
        if (t > 1.3 && t - dt <= 1.3) for (const m of shards) for (let k = 0; k < 2; k++) fx.shard.emit({ p: [m.position.x, m.position.y + 0.6, m.position.z], v: [rnd(-2, 2), rnd(1, 4), rnd(-2, 2)], life: 0.6, s0: 0.35, s1: 0.1, c0: [0.85, 0.95, 1, 1], c1: [0.6, 0.85, 1, 0], g: 9 });
      },
      dispose: () => { for (const m of shards) scene.remove(m); },
    });
  }

  glacier(o, d, len = 26, onStep) {
    const fx = this.fx, scene = this.scene;
    const geo = iceGeo(), mat = iceMat();
    const dir = new THREE.Vector3(d[0], 0, d[2]).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const steps = 12;
    const spikes = [];
    let done = 0;
    fx.add({
      dur: 3.6,
      update: (dt, t) => {
        while (done < steps && t > done * 0.055) {
          const dist = 2.5 + (done / (steps - 1)) * len;
          const x = o[0] + dir.x * dist, z = o[2] + dir.z * dist;
          const y = this.h(x, z);
          for (let k = 0; k < 3; k++) {
            const m = new THREE.Mesh(geo, mat);
            const off = (k - 1) * 0.9 + rnd(-0.3, 0.3);
            const s = (k === 1 ? 2.3 : 1.4) * 1.5 * rnd(0.85, 1.15); // icicles are 50% bigger
            m.position.set(x + side.x * off, y - 3, z + side.z * off);
            m.rotation.set(rnd(-0.2, 0.2) + (k - 1) * -0.35 * side.z, rnd(0, 6), rnd(-0.2, 0.2) + (k - 1) * 0.35 * side.x);
            m.scale.set(s, s * 1.3, s);
            m.castShadow = true;
            m.userData = { born: t, y, s };
            scene.add(m);
            spikes.push(m);
          }
          for (let i = 0; i < fx.n(12); i++) fx.shard.emit({ p: [x, y + 0.5, z], v: [rnd(-3, 3), rnd(3, 8), rnd(-3, 3)], life: rnd(0.4, 0.9), s0: 0.4, s1: 0.1, c0: [0.85, 0.95, 1, 1], c1: [0.6, 0.85, 1, 0], g: 12 });
          fx.glow.emit({ p: [x, y + 1, z], life: 0.5, s0: 4, s1: 7, c0: [0.5, 0.8, 1, 0.5], c1: [0.6, 0.9, 1, 0] });
          fx.decal([x, 0, z], TX.frostDecal(), 5, 7);
          if (done % 3 === 0) fx.flash([x, y + 2, z], 0x9fdcff, 15, 0.3, 10);
          onStep && onStep([x, y, z]);
          done++;
        }
        for (const m of spikes) {
          const a = t - m.userData.born;
          const up = a < 0.1 ? a / 0.1 : 1;
          m.position.y = m.userData.y - 3 + up * 2.9;
          if (a > 2.4) {
            const k = Math.max(0.001, 1 - (a - 2.4) / 0.5);
            m.scale.setScalar(m.userData.s * k);
            if (a - dt <= 2.4) for (let i = 0; i < 4; i++) fx.shard.emit({ p: [m.position.x, m.position.y + 1.5, m.position.z], v: [rnd(-3, 3), rnd(1, 5), rnd(-3, 3)], life: 0.7, s0: 0.45, s1: 0.1, c0: [0.85, 0.95, 1, 1], c1: [0.6, 0.85, 1, 0], g: 12 });
          }
        }
      },
      dispose: () => { for (const m of spikes) scene.remove(m); },
    });
  }

  // ---------------- EARTH SLAM ----------------
  tremor(p, radius = 9) {
    const fx = this.fx, y = this.h(p[0], p[2]);
    fx.shockwave([p[0], y, p[2]], radius, 0xd9a25a, 0.5);
    fx.shockwave([p[0], y, p[2]], radius * 0.6, 0xffe0a0, 0.35);
    fx.dustBurst([p[0], y, p[2]], radius * 0.18, [0.6, 0.5, 0.38]);
    for (let i = 0; i < fx.n(36); i++) {
      const a = Math.random() * 6.28, r = rnd(0.5, radius * 0.8);
      const x = p[0] + Math.cos(a) * r, z = p[2] + Math.sin(a) * r;
      fx.debris.emit({ p: [x, this.h(x, z) + 0.2, z], v: [Math.cos(a) * rnd(1, 4), rnd(4, 10), Math.sin(a) * rnd(1, 4)], life: rnd(0.7, 1.2), s0: rnd(0.3, 0.7), s1: 0.25, c0: [0.5, 0.38, 0.26, 1], c1: [0.4, 0.3, 0.2, 0], g: 18, drag: 0.3 });
    }
    fx.decal([p[0], 0, p[2]], TX.scorchDecal(), radius * 0.6, 5);
  }

  // ---------------- DASH ----------------
  // Each element's dash looks like that element on the move (a streak of flame, a sheet of ice, a lightning blink, a
  // rock slide, a slipstream) and leaves a trail on the ground that keeps hurting for a couple of seconds. The caster
  // passes onTick(a, b, k) (four times a second, k fading to 0 at the end); everyone else renders the visuals only.
  dash(element, a, b, onTick) {
    const fx = this.fx, scene = this.scene;
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len, px = -uz, pz = ux;
    const at = (t, side = 0) => { const x = a[0] + dx * t + px * side, z = a[2] + dz * t + pz * side; return [x, this.h(x, z), z]; };
    const dur = 2.4, N = fx.n(30);
    const meshes = [];
    // --- the burst: the dash itself ---
    switch (element) {
      case 'Fire':
        for (let i = 0; i <= 3; i++) { const p = at(i / 3); fx.decal([p[0], 0, p[2]], TX.scorchDecal(), 2.6, dur + 3); }
        for (let i = 0; i < N; i++) {
          const p = at(Math.random(), rnd(-0.35, 0.35));
          fx.fire.emit({ p: [p[0], p[1] + rnd(0.2, 1.6), p[2]], v: [ux * rnd(6, 14) + rnd(-1, 1), rnd(1, 3), uz * rnd(6, 14) + rnd(-1, 1)], life: rnd(0.3, 0.6), s0: rnd(0.9, 1.5), s1: 0.3, c0: [1, 0.62, 0.22, 0.85], c1: [0.6, 0.1, 0.01, 0], drag: 3, g: -3, rotV: rnd(-3, 3) });
          if (i % 2 === 0) fx.spark.emit({ p: [p[0], p[1] + rnd(0.3, 1.5), p[2]], v: [ux * rnd(4, 10) + rnd(-2, 2), rnd(1, 5), uz * rnd(4, 10) + rnd(-2, 2)], life: rnd(0.5, 1), s0: 0.18, s1: 0.04, c0: [1, 0.8, 0.4, 1], c1: [1, 0.3, 0.05, 0], g: 9, drag: 0.6 });
        }
        fx.flash([a[0], a[1] + 1, a[2]], 0xff7a2a, 14, 0.2, 9);
        break;
      case 'Frost': {
        for (let i = 0; i <= 4; i++) { const p = at(i / 4); fx.decal([p[0], 0, p[2]], TX.frostDecal(), 3, dur + 1.2, { opacity: 0.9, color: 0xdff4ff }); }
        for (let i = 0; i < N; i++) {
          const side = Math.random() < 0.5 ? -1 : 1, p = at(Math.random(), side * rnd(0.3, 0.7));
          fx.shard.emit({ p: [p[0], p[1] + 0.2, p[2]], v: [px * side * rnd(2, 5) + ux * 2, rnd(2, 5), pz * side * rnd(2, 5) + uz * 2], life: rnd(0.5, 0.9), s0: rnd(0.3, 0.7), s1: 0.1, c0: [0.75, 0.94, 1, 0.95], c1: [0.6, 0.85, 1, 0], g: 9, drag: 0.6, rotV: rnd(-6, 6) });
          if (i % 2 === 0) fx.smoke.emit({ p: [p[0], p[1] + 0.3, p[2]], v: [px * side * 1.2, rnd(0.2, 0.6), pz * side * 1.2], life: rnd(0.8, 1.3), s0: 0.9, s1: 2.4, c0: [0.85, 0.95, 1, 0.4], c1: [0.85, 0.95, 1, 0], drag: 1.5 });
        }
        break;
      }
      case 'Storm': {
        const A = [a[0], a[1] + 1.1, a[2]], B = [b[0], b[1] + 1.1, b[2]];
        fx.bolt(A, B, { width: 0.45, dur: 0.22, color: 0xb9d4ff, branches: 3, jag: 0.14 });
        fx.bolt(A, B, { width: 1.1, dur: 0.14, color: 0x4a6cff, branches: 0, jag: 0.08 });
        fx.flash(A, 0x9fbaff, 20, 0.15, 10); fx.flash(B, 0x9fbaff, 26, 0.2, 12);
        for (let i = 0; i < N; i++) {
          const p = at(Math.random(), rnd(-0.3, 0.3));
          fx.spark.emit({ p: [p[0], p[1] + rnd(0.3, 1.8), p[2]], v: [rnd(-4, 4), rnd(-1, 4), rnd(-4, 4)], life: rnd(0.15, 0.4), s0: 0.22, s1: 0.04, c0: [0.8, 0.9, 1, 1], c1: [0.4, 0.5, 1, 0], drag: 1.5 });
        }
        for (let i = 0; i < fx.n(8); i++) fx.glow.emit({ p: [b[0], b[1] + rnd(0.3, 1.6), b[2]], v: [rnd(-1, 1), rnd(0, 1), rnd(-1, 1)], life: 0.3, s0: 1.6, s1: 0.3, c0: [0.6, 0.75, 1, 0.7], c1: [0.3, 0.4, 1, 0] });
        break;
      }
      case 'Earth': {
        // A ridge of stones heaves up along the path and stays as the trail.
        const geos = rockGeos(), mat = rockMat(), n = Math.max(4, Math.round(len / 0.8));
        for (let i = 0; i < n; i++) {
          const p = at((i + 0.5) / n, rnd(-0.6, 0.6));
          const m = new THREE.Mesh(geos[i % 4], mat), sc = rnd(0.22, 0.42);
          m.scale.set(sc * rnd(0.9, 1.4), sc, sc * rnd(0.9, 1.4));
          m.rotation.set(rnd(-0.5, 0.5), rnd(0, 6.28), rnd(-0.5, 0.5));
          m.position.set(p[0], p[1] - 0.6, p[2]);
          m.castShadow = true;
          m.userData = { y: p[1], delay: (i / n) * 0.17 };
          scene.add(m); meshes.push(m);
        }
        for (let i = 0; i <= 3; i++) { const p = at(i / 3); fx.decal([p[0], 0, p[2]], TX.crackDecal(), 3, dur + 3); }
        for (let i = 0; i < N; i++) {
          const p = at(Math.random(), rnd(-0.4, 0.4));
          fx.debris.emit({ p: [p[0], p[1] + 0.15, p[2]], v: [rnd(-3, 3) - ux * 2, rnd(2, 6), rnd(-3, 3) - uz * 2], life: rnd(0.5, 0.9), s0: rnd(0.25, 0.5), s1: 0.2, c0: [0.5, 0.38, 0.26, 1], c1: [0.4, 0.3, 0.2, 0], g: 14, drag: 0.4 });
          if (i % 2 === 0) fx.smoke.emit({ p: [p[0], p[1] + 0.3, p[2]], v: [rnd(-0.5, 0.5), rnd(0.5, 1.2), rnd(-0.5, 0.5)], life: rnd(0.6, 1), s0: 0.9, s1: 2.4, c0: [0.62, 0.5, 0.36, 0.45], c1: [0.6, 0.5, 0.4, 0], drag: 2 });
        }
        break;
      }
      default: // Wind: a slipstream of long streaks that curl in behind the runner, dust skimming the ground
        for (let i = 0; i < N; i++) {
          const side = Math.random() < 0.5 ? -1 : 1, p = at(Math.random(), side * rnd(0.2, 0.9));
          fx.streak.emit({ p: [p[0], p[1] + rnd(0.2, 1.9), p[2]], v: [ux * rnd(14, 26) - px * side * 3, rnd(-0.4, 0.4), uz * rnd(14, 26) - pz * side * 3], life: rnd(0.2, 0.4), s0: rnd(1.4, 2.4), s1: 0.5, c0: [0.85, 1, 0.95, 0.8], c1: [0.8, 1, 0.95, 0], drag: 3, rot: Math.atan2(ux, uz) });
          if (i % 3 === 0) fx.smoke.emit({ p: [p[0], p[1] + 0.2, p[2]], v: [ux * 4 + px * side * 2, rnd(0.3, 0.9), uz * 4 + pz * side * 2], life: rnd(0.5, 0.9), s0: 0.8, s1: 2.2, c0: [0.75, 0.78, 0.74, 0.3], c1: [0.8, 0.82, 0.8, 0], drag: 2.5 });
        }
    }
    // --- the trail: lingers on the ground and keeps biting ---
    let tick = 0;
    fx.add({
      dur: dur + 0.8,
      update: (dt, t) => {
        const k = t < dur - 0.6 ? 1 : Math.max(0, (dur - t) / 0.6);
        if (element === 'Earth') {
          for (const m of meshes) {
            const aa = t - m.userData.delay;
            const up = aa < 0 ? 0 : aa < 0.12 ? aa / 0.12 : aa < dur ? 1 : Math.max(0, 1 - (aa - dur) / 0.7);
            m.position.y = m.userData.y - 0.6 + up * 0.6 * 1.15;
          }
        }
        if (k > 0) {
          const n = fx.n(len * (element === 'Storm' ? 2.4 : element === 'Wind' ? 1.15 : 1.1) * k);
          for (let i = 0; i < n; i++) {
            const p = at(Math.random(), rnd(-0.5, 0.5));
            switch (element) {
              case 'Fire': fx.fire.emit({ p: [p[0], p[1] + 0.15, p[2]], v: [rnd(-0.4, 0.4), rnd(1.5, 3.2), rnd(-0.4, 0.4)], life: rnd(0.35, 0.7), s0: rnd(0.6, 1.1), s1: 0.25, c0: [1, 0.55, 0.18, 0.8], c1: [0.7, 0.1, 0.01, 0], turb: 3, g: -2 }); break;
              case 'Frost': if (Math.random() < 0.5) fx.smoke.emit({ p: [p[0], p[1] + 0.15, p[2]], v: [rnd(-0.3, 0.3), rnd(0.1, 0.4), rnd(-0.3, 0.3)], life: rnd(0.8, 1.4), s0: 0.7, s1: 1.8, c0: [0.85, 0.95, 1, 0.3], c1: [0.85, 0.95, 1, 0], drag: 1.5 });
                else fx.shard.emit({ p: [p[0], p[1] + 0.1, p[2]], v: [rnd(-0.5, 0.5), rnd(0.5, 1.5), rnd(-0.5, 0.5)], life: rnd(0.4, 0.8), s0: 0.22, s1: 0.05, c0: [0.8, 0.95, 1, 0.9], c1: [0.7, 0.9, 1, 0], g: 3, rotV: rnd(-4, 4) }); break;
              case 'Storm': fx.spark.emit({ p: [p[0], p[1] + rnd(0.1, 0.9), p[2]], v: [rnd(-3, 3), rnd(0, 3), rnd(-3, 3)], life: rnd(0.1, 0.3), s0: 0.26, s1: 0.05, c0: [0.8, 0.9, 1, 1], c1: [0.4, 0.5, 1, 0], drag: 2 });
                if (Math.random() < 0.4) fx.glow.emit({ p: [p[0], p[1] + 0.25, p[2]], life: 0.25, s0: 0.9, s1: 0.3, c0: [0.55, 0.7, 1, 0.4], c1: [0.3, 0.4, 1, 0] }); break;
              case 'Earth': if (Math.random() < 0.35) fx.smoke.emit({ p: [p[0], p[1] + 0.2, p[2]], v: [rnd(-0.3, 0.3), rnd(0.3, 0.8), rnd(-0.3, 0.3)], life: rnd(0.6, 1), s0: 0.7, s1: 1.8, c0: [0.62, 0.5, 0.36, 0.3], c1: [0.6, 0.5, 0.4, 0], drag: 2 }); break;
              default: fx.streak.emit({ p: [p[0], p[1] + rnd(0.1, 1.2), p[2]], v: [ux * rnd(5, 10) + px * rnd(-4, 4), rnd(0.2, 1.2), uz * rnd(5, 10) + pz * rnd(-4, 4)], life: rnd(0.2, 0.4), s0: rnd(0.7, 1.3), s1: 0.2, c0: [0.85, 1, 0.95, 0.38], c1: [0.8, 1, 0.95, 0], drag: 2.5, rot: Math.atan2(ux, uz) });
            }
          }
          // Storm: little arcs crackle between points on the path.
          if (element === 'Storm' && Math.random() < 0.9 * k) { const s = Math.random(), p = at(s, rnd(-0.4, 0.4)), q = at(Math.min(1, s + rnd(0.05, 0.25)), rnd(-0.4, 0.4)); fx.bolt([p[0], p[1] + rnd(0.1, 0.6), p[2]], [q[0], q[1] + rnd(0.1, 0.8), q[2]], { width: 0.2, dur: 0.12, color: 0xb9d4ff, branches: 1, jag: 0.25 }); }
          if (element === 'Fire' && Math.random() < 0.5 * k) { const p = at(Math.random()); fx.glow.emit({ p: [p[0], p[1] + 0.8, p[2]], v: [0, 1, 0], life: 0.4, s0: 1.4, s1: 2, c0: [1, 0.4, 0.08, 0.12], c1: [1, 0.25, 0.04, 0] }); }
        }
        tick += dt;
        if (onTick && k > 0 && tick >= 0.25) { tick -= 0.25; onTick(a, b, k); }
      },
      dispose: () => { for (const m of meshes) scene.remove(m); },
    });
  }

  // Ice Shards: tiny shards form in a ring around `o`, hang for a beat, then dart to each point in `pts`.
  // onHit(i, p) fires when shard i arrives (caster only).
  iceShards(o, pts, onHit) {
    const fx = this.fx, scene = this.scene;
    const geo = iceGeo(), mat = iceMat();
    const shards = pts.map((p, i) => {
      const m = new THREE.Mesh(geo, mat);
      const a = (i / pts.length) * Math.PI * 2 + rnd(-0.2, 0.2);
      const home = new THREE.Vector3(o[0] + Math.cos(a) * 2.4, o[1] + rnd(-0.7, 0.9), o[2] + Math.sin(a) * 2.4);
      m.scale.setScalar(0.6);
      m.position.copy(home);
      m.userData = { home, to: new THREE.Vector3(...p), go: 0.22 + i * 0.045, flying: false, done: false, spin: rnd(4, 9) };
      scene.add(m);
      return m;
    });
    fx.flash([o[0], o[1], o[2]], 0x9fdcff, 14, 0.3, 9);
    for (let i = 0; i < fx.n(16); i++) fx.glow.emit({ p: [o[0] + rnd(-1, 1), o[1] + rnd(-0.5, 0.8), o[2] + rnd(-1, 1)], v: [0, 0.6, 0], life: 0.5, s0: 0.9, s1: 0.1, c0: [0.6, 0.85, 1, 0.5], c1: [0.8, 0.95, 1, 0] });
    const dir = new THREE.Vector3();
    fx.add({
      dur: 4,
      update: (dt, t) => {
        let alive = 0;
        for (let i = 0; i < shards.length; i++) {
          const m = shards[i], u = m.userData;
          if (u.done) continue;
          alive++;
          if (t < u.go) {
            // Forming: rises into place and spins, pointing at its mark.
            m.position.y = u.home.y + Math.sin(t * 6 + i) * 0.08;
            m.scale.setScalar(0.6 * Math.min(1, t / 0.2));
            m.lookAt(u.to); m.rotateX(Math.PI / 2);
            continue;
          }
          if (!u.flying) { u.flying = true; fx.glow.emit({ p: [m.position.x, m.position.y, m.position.z], life: 0.15, s0: 0.8, s1: 0.2, c0: [0.7, 0.9, 1, 0.8], c1: [0.7, 0.9, 1, 0] }); }
          dir.copy(u.to).sub(m.position);
          const dist = dir.length(), step = 32 * dt;
          if (dist <= step + 0.05) {
            u.done = true; m.visible = false;
            const p = [u.to.x, u.to.y, u.to.z];
            for (let k = 0; k < fx.n(6); k++) fx.shard.emit({ p, v: [rnd(-3, 3), rnd(0, 4), rnd(-3, 3)], life: rnd(0.3, 0.6), s0: 0.25, s1: 0.05, c0: [0.85, 0.95, 1, 1], c1: [0.6, 0.85, 1, 0], g: 9 });
            fx.glow.emit({ p, life: 0.2, s0: 1.2, s1: 0.3, c0: [0.6, 0.85, 1, 0.7], c1: [0.6, 0.85, 1, 0] });
            onHit && onHit(i, p);
            continue;
          }
          dir.normalize();
          m.position.addScaledVector(dir, step);
          m.lookAt(u.to); m.rotateX(Math.PI / 2); m.rotateY(t * u.spin);
          fx.streak.emit({ p: [m.position.x, m.position.y, m.position.z], v: [-dir.x * 2, -dir.y * 2, -dir.z * 2], life: 0.12, s0: 0.5, s1: 0.1, c0: [0.8, 0.95, 1, 0.6], c1: [0.8, 0.95, 1, 0], rot: Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) });
        }
        if (!alive) return false;
      },
      dispose: () => { for (const m of shards) scene.remove(m); },
    });
  }

  // Ice Barrier: a wall of ice crystals from a to b for dur seconds. onTick fires ten times a second (caster only).
  iceBarrier(a, b, dur = 8, onTick) {
    const fx = this.fx, scene = this.scene;
    const geo = iceGeo(), mat = iceMat();
    const L = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1, ux = (b[0] - a[0]) / L, uz = (b[2] - a[2]) / L;
    const n = Math.max(6, Math.round(L / 0.75));
    const spikes = [];
    for (let i = 0; i <= n; i++) {
      const sgm = i / n, x = a[0] + (b[0] - a[0]) * sgm + rnd(-0.2, 0.2), z = a[2] + (b[2] - a[2]) * sgm + rnd(-0.2, 0.2);
      const y = this.h(x, z);
      for (let k = 0; k < 2; k++) {
        const m = new THREE.Mesh(geo, mat);
        const big = k === 0, sc = big ? rnd(1.6, 2.3) : rnd(0.9, 1.3);
        m.scale.set(sc, sc * (big ? 1.35 : 1), sc);
        m.position.set(x + (k ? uz * 0.5 : 0), y - 4, z + (k ? -ux * 0.5 : 0));
        m.rotation.set(rnd(-0.18, 0.18), rnd(0, 6.28), rnd(-0.18, 0.18));
        m.castShadow = true;
        m.userData = { y, delay: Math.abs(sgm - 0.5) * 0.3, h: sc * (big ? 2.4 : 1.4) };
        scene.add(m); spikes.push(m);
      }
      fx.decal([x, 0, z], TX.frostDecal(), 3.2, dur + 2, { opacity: 0.85 });
    }
    const mid = [(a[0] + b[0]) / 2, this.h((a[0] + b[0]) / 2, (a[2] + b[2]) / 2), (a[2] + b[2]) / 2];
    fx.flash([mid[0], mid[1] + 2, mid[2]], 0x9fdcff, 30, 0.4, L);
    const light = fx.holdLight({}, 0x7fc8ff, 14, L);
    let tick = 0;
    fx.add({
      dur: dur + 0.6,
      update: (dt, t) => {
        if (light) { light.position.set(mid[0], mid[1] + 2.5, mid[2]); light.intensity = 10 + Math.sin(t * 4) * 3; }
        for (const m of spikes) {
          const u = m.userData, aa = t - u.delay;
          const up = aa < 0 ? 0 : aa < 0.25 ? 1 - Math.pow(1 - aa / 0.25, 3) : t < dur ? 1 : Math.max(0, 1 - (t - dur) / 0.6);
          m.position.y = u.y - 4 + up * 3.8;
          if (aa > 0 && aa - dt <= 0) for (let k = 0; k < fx.n(5); k++) fx.shard.emit({ p: [m.position.x, u.y + 0.3, m.position.z], v: [rnd(-2, 2), rnd(2, 6), rnd(-2, 2)], life: rnd(0.4, 0.8), s0: 0.35, s1: 0.1, c0: [0.85, 0.95, 1, 1], c1: [0.6, 0.85, 1, 0], g: 10 });
        }
        if (t < dur) {
          // Cold mist drifting off the wall.
          for (let i = 0; i < fx.n(2); i++) { const sgm = Math.random(), x = a[0] + (b[0] - a[0]) * sgm, z = a[2] + (b[2] - a[2]) * sgm; fx.smoke.emit({ p: [x, this.h(x, z) + rnd(0.2, 2.5), z], v: [rnd(-0.4, 0.4), rnd(-0.3, 0.2), rnd(-0.4, 0.4)], life: rnd(0.8, 1.4), s0: 0.8, s1: 2, c0: [0.85, 0.95, 1, 0.3], c1: [0.85, 0.95, 1, 0], drag: 1.5 }); }
          if (Math.random() < 0.6) { const sgm = Math.random(), x = a[0] + (b[0] - a[0]) * sgm, z = a[2] + (b[2] - a[2]) * sgm; fx.glow.emit({ p: [x, this.h(x, z) + rnd(0.5, 3), z], life: 0.4, s0: 0.5, s1: 0.1, c0: [0.7, 0.9, 1, 0.5], c1: [0.7, 0.9, 1, 0] }); }
        } else if (t - dt < dur) {
          for (const m of spikes) for (let k = 0; k < 3; k++) fx.shard.emit({ p: [m.position.x, m.userData.y + rnd(0.3, m.userData.h), m.position.z], v: [rnd(-3, 3), rnd(1, 5), rnd(-3, 3)], life: 0.7, s0: 0.4, s1: 0.1, c0: [0.85, 0.95, 1, 1], c1: [0.6, 0.85, 1, 0], g: 12 });
        }
        tick += dt;
        if (onTick && t < dur && tick >= 0.1) { tick -= 0.1; onTick(); }
      },
      dispose: () => { for (const m of spikes) scene.remove(m); fx.releaseLight(light); },
    });
  }

  // Locked in ice: a crystal grows around a mob (or boss) view and follows it until the lock ends or it dies.
  encase(view, r = 0.6, h = 1.8, dur = 10) {
    const fx = this.fx, scene = this.scene;
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const m = new THREE.Mesh(geo, iceMat());
    m.castShadow = true;
    const sx = r * 1.7, sy = h * 0.62 + 0.3;
    m.rotation.set(rnd(-0.2, 0.2), rnd(0, 6.28), rnd(-0.2, 0.2));
    scene.add(m);
    const at = () => (view.pos ? [view.pos.x, view.pos.y, view.pos.z] : [view.x, view.y, view.z]); // a mob view has x/y/z, a duelist (Player or RemotePlayerView) has pos
    const p0 = at();
    fx.flash([p0[0], p0[1] + h * 0.5, p0[2]], 0x9fdcff, 16, 0.3, 8);
    for (let i = 0; i < fx.n(14); i++) fx.shard.emit({ p: [p0[0], p0[1] + rnd(0.2, h), p0[2]], v: [rnd(-3, 3), rnd(1, 4), rnd(-3, 3)], life: rnd(0.4, 0.8), s0: 0.3, s1: 0.08, c0: [0.85, 0.95, 1, 1], c1: [0.6, 0.85, 1, 0], g: 9 });
    let gone = false, killed = false;
    const ice = { kill: () => { killed = true; m.visible = false; } }; // thawAll: the duel's pick pause stops fx, so a block still standing there is cleared outright
    (this._ice || (this._ice = new Set())).add(ice);
    fx.add({
      dur: dur + 0.1,
      update: (dt, t) => {
        if (killed) return false;
        const dead = !view.model || !view.model.parent || view.hp <= 0;
        const p = at();
        const grow = Math.min(1, t / 0.2);
        const k = t > dur - 0.3 || dead ? Math.max(0.001, 1 - (dead ? 1 : (t - (dur - 0.3)) / 0.3)) : 1;
        m.position.set(p[0], p[1] + h * 0.5, p[2]);
        m.scale.set(sx * grow * k, sy * grow * k, sx * grow * k);
        if (Math.random() < 0.3) fx.smoke.emit({ p: [p[0] + rnd(-r, r), p[1] + rnd(0, h * 0.5), p[2] + rnd(-r, r)], v: [0, -0.3, 0], life: 1, s0: 0.5, s1: 1.2, c0: [0.85, 0.95, 1, 0.25], c1: [0.85, 0.95, 1, 0], drag: 1.5 });
        if ((dead || t > dur - 0.3) && !gone) { gone = true; for (let i = 0; i < fx.n(18); i++) fx.shard.emit({ p: [p[0], p[1] + rnd(0.2, h), p[2]], v: [rnd(-4, 4), rnd(1, 5), rnd(-4, 4)], life: rnd(0.5, 0.9), s0: 0.4, s1: 0.1, c0: [0.85, 0.95, 1, 1], c1: [0.6, 0.85, 1, 0], g: 11 }); }
        if (dead && t > 0.3) return false;
      },
      dispose: () => { this._ice.delete(ice); scene.remove(m); geo.dispose(); },
    });
  }

  thawAll() { if (this._ice) for (const i of this._ice) i.kill(); }

  // Tsunami: a towering wave of water rolls from o along d for len metres at `speed`, 2*hw wide, then collapses.
  // onTick(c, hw) runs every frame with the crest's centre (caster only).
  tsunami(o, d, len = 45, speed = 13, onTick) {
    const fx = this.fx, scene = this.scene;
    const hw = 13, H = 6.5;
    const dir = new THREE.Vector3(d[0], 0, d[2]).normalize();
    // Wave body: a sheet that rises from the ground, leans forward and curls over at the crest.
    const W = 40, R = 14;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array((W + 1) * (R + 1) * 3), uv = new Float32Array((W + 1) * (R + 1) * 2), idx = [];
    for (let i = 0; i <= W; i++) {
      const u = i / W * 2 - 1, edge = 1 - Math.pow(Math.abs(u), 5);
      for (let j = 0; j <= R; j++) {
        const t = j / R, a = t * Math.PI * 1.15;
        const x = u * hw, y = Math.sin(Math.min(Math.PI / 2, a)) * H * edge + (a > Math.PI / 2 ? -Math.sin(a - Math.PI / 2) * H * 0.35 * edge : 0);
        const z = -2.5 + t * 1.5 + (a > Math.PI / 2 ? Math.sin(a - Math.PI / 2) * 3.2 : t * t * 1.8);
        const k = (i * (R + 1) + j);
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
        uv[k * 2] = (u + 1) / 2; uv[k * 2 + 1] = t;
        if (i < W && j < R) { const b = k + R + 1; idx.push(k, k + 1, b, k + 1, b + 1, b); }
      }
    }
    geo.setIndex(idx); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const mat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uA: { value: 1 } },
      vertexShader: `uniform float uT; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec3 p = position; p.y += sin(p.x*0.9 + uT*9.0)*0.25*uv.y + sin(p.x*2.3 - uT*6.0)*0.12; p.x += sin(uv.y*6.0 + uT*4.0)*0.15; vec4 w = modelMatrix*vec4(p,1.); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uT; uniform float uA; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        float hsh(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        float nz(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hsh(i),hsh(i+vec2(1,0)),f.x), mix(hsh(i+vec2(0,1)),hsh(i+vec2(1,1)),f.x), f.y); }
        void main(){ float f = pow(max(0.0, 1.0 - abs(dot(normalize(vN), normalize(vV)))), 2.0);
          float n = nz(vec2(vUv.x*14.0, vUv.y*5.0 - uT*2.5)) * 0.6 + nz(vec2(vUv.x*40.0 + uT*3.0, vUv.y*12.0)) * 0.4;
          vec3 deep = vec3(0.04, 0.22, 0.4), mid = vec3(0.12, 0.5, 0.72), foam = vec3(0.9, 0.97, 1.0);
          vec3 c = mix(deep, mid, vUv.y);
          float crest = smoothstep(0.55, 1.0, vUv.y) * smoothstep(0.35, 0.75, n);
          float streak = smoothstep(0.75, 0.95, n) * 0.5;
          c = mix(c, foam, clamp(crest + streak + f*0.5, 0.0, 1.0));
          float a = (0.82 + f*0.18) * uA;
          gl_FragColor = vec4(c, a); }`,
      transparent: true, side: THREE.DoubleSide, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.y = Math.atan2(dir.x, dir.z);
    scene.add(mesh);
    const light = fx.holdLight({}, 0x6fc8ff, 30, hw * 2);
    const c = new THREE.Vector3(o[0] + dir.x * 2, 0, o[2] + dir.z * 2);
    const sx = -dir.z, sz = dir.x;
    fx.shockwave([o[0], this.h(o[0], o[2]), o[2]], 8, 0x9fe0ff, 0.5);
    const T = len / speed;
    fx.add({
      dur: T + 0.9,
      update: (dt, t) => {
        const run = t < T;
        if (run) c.addScaledVector(dir, speed * dt);
        const gy = this.h(c.x, c.z);
        c.y = gy;
        mesh.position.set(c.x, gy - 0.3, c.z);
        mat.uniforms.uT.value = t;
        const rise = Math.min(1, t / 0.35), fall = run ? 1 : Math.max(0.001, 1 - (t - T) / 0.8);
        mesh.scale.set(1, rise * fall, 1);
        mat.uniforms.uA.value = fall;
        if (light) { light.position.set(c.x, gy + 4, c.z); light.intensity = 26 * fall; }
        // Spray off the crest, foam at the foot, wet ground left behind.
        const n = fx.n(14 * fall);
        for (let i = 0; i < n; i++) {
          const u = rnd(-1, 1), x = c.x + sx * u * hw, z = c.z + sz * u * hw, ed = 1 - Math.pow(Math.abs(u), 4);
          fx.smoke.emit({ p: [x, gy + H * ed * rnd(0.8, 1.05) * rise, z], v: [dir.x * rnd(4, 9) + rnd(-1, 1), rnd(0.5, 3), dir.z * rnd(4, 9) + rnd(-1, 1)], life: rnd(0.5, 1), s0: rnd(1, 1.8), s1: rnd(2.5, 4), c0: [0.85, 0.95, 1, 0.55], c1: [0.9, 0.97, 1, 0], drag: 1.5, g: 2 });
          if (i % 2 === 0) fx.glow.emit({ p: [x, gy + rnd(0.2, 1.2), z], v: [dir.x * 6, 0.5, dir.z * 6], life: 0.4, s0: 1.6, s1: 2.6, c0: [0.8, 0.95, 1, 0.5], c1: [0.8, 0.95, 1, 0], drag: 2 });
          if (i % 3 === 0) fx.shard.emit({ p: [x, gy + H * ed * rise, z], v: [dir.x * rnd(5, 12) + rnd(-2, 2), rnd(2, 6), dir.z * rnd(5, 12) + rnd(-2, 2)], life: rnd(0.5, 0.9), s0: 0.3, s1: 0.08, c0: [0.85, 0.95, 1, 0.9], c1: [0.7, 0.9, 1, 0], g: 12 });
        }
        if (run && Math.random() < 0.7) { const u = rnd(-0.9, 0.9); fx.decal([c.x + sx * u * hw - dir.x * 2, 0, c.z + sz * u * hw - dir.z * 2], TX.frostDecal(), 5, 4, { color: 0x6fb0d8, opacity: 0.4 }); }
        if (run && onTick) onTick([c.x, gy, c.z], hw);
        if (!run && t - dt < T) { fx.shockwave([c.x, gy, c.z], hw * 1.4, 0x9fe0ff, 0.6); for (let i = 0; i < fx.n(50); i++) { const u = rnd(-1, 1); fx.smoke.emit({ p: [c.x + sx * u * hw, gy + 0.5, c.z + sz * u * hw], v: [rnd(-3, 3) + dir.x * 5, rnd(2, 7), rnd(-3, 3) + dir.z * 5], life: rnd(0.7, 1.3), s0: 1.5, s1: 4.5, c0: [0.85, 0.95, 1, 0.6], c1: [0.9, 0.97, 1, 0], drag: 1.2, g: 3 }); } }
      },
      dispose: () => { scene.remove(mesh); geo.dispose(); mat.dispose(); fx.releaseLight(light); },
    });
  }

  // ---------------- WIND ----------------
  // Storm Veil: a thick curtain of howling wind fills a cone (`len` m long, 3 m wide at the caster, 10 m at the far end) for `dur` s.
  // `follow` returns the caster's [x, y, z]; `dir` is the fixed [x, z] heading; onTick (the caster only) fires ten times a second.
  // `dirIn` is [x, z] or a function returning it: the veil swings round to wherever the caster is facing.
  stormVeil(follow, dirIn, len = 20, dur = 3, onTick) {
    const fx = this.fx, scene = this.scene;
    let dir = typeof dirIn === 'function' ? dirIn() : dirIn;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uA: { value: 0 }, uS: { value: 1 } },
      vertexShader: `varying vec2 vUv; varying vec3 vW; varying vec3 vN; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uT; uniform float uA; uniform float uS; varying vec2 vUv; varying vec3 vW; varying vec3 vN;
        float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
        void main(){
          float u = vUv.y, a = vUv.x + sin(u*7.0 + uT*2.0 + uS)*0.012;
          // Long streaks rushing away from the caster, twisting a little as they go.
          float n1 = noise(vec2(u*2.6 - uT*5.5 + uS*9.0, a*28.0 + u*3.0));
          float n2 = noise(vec2(u*5.0 - uT*8.5, a*60.0 - u*5.0 + uS*4.0));
          float n = n1*0.6 + n2*0.4;
          float streak = smoothstep(0.5, 0.88, n);
          float haze = smoothstep(0.25, 0.7, noise(vec2(u*1.3 - uT*2.5, a*8.0 + uT*0.4)));
          float fade = smoothstep(0.0, 0.12, u) * smoothstep(1.0, 0.72, u);
          float near = smoothstep(0.8, 3.5, distance(vW, cameraPosition)); // a veil that fills the lens would blind you
          float soft = smoothstep(0.0, 0.55, abs(dot(normalize(vN), normalize(cameraPosition - vW)))); // silhouettes melt away
          // Teal-edged white ribbons over a faint haze: they read against snow and night alike.
          float al = (smoothstep(0.5, 0.72, n)*0.7 + haze*0.12) * fade * near * soft * uA;
          vec3 col = mix(vec3(0.34,0.72,0.6), vec3(0.97,1.0,0.99), smoothstep(0.55, 0.88, n));
          gl_FragColor = vec4(col, al);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const group = new THREE.Group();
    const sx = [1, 0.8];
    const layers = sx.map((k, i) => {
      // An open cone along +z, flattened to about 4 m tall: the wide end is the far end.
      const g = new THREE.CylinderGeometry(5 * k, 1.6 * k, len, 56, 14, true).rotateX(Math.PI / 2).scale(1, 0.42, 1).translate(0, 0, len / 2);
      const m = new THREE.Mesh(g, i ? mat.clone() : mat);
      m.material.uniforms.uS.value = i * 1.7;
      group.add(m);
      return m;
    });
    group.rotation.y = Math.atan2(dir[0], dir[1]);
    scene.add(group);
    const p0 = follow();
    fx.shockwave([p0[0], this.h(p0[0], p0[2]), p0[2]], 5, 0xbaffea, 0.35);
    const light = fx.holdLight({}, 0xbaffea, 6, len * 1.4);
    let tick = 0;
    fx.add({
      dur: dur + 0.1,
      update: (dt, t) => {
        if (typeof dirIn === 'function') { dir = dirIn(); group.rotation.y = Math.atan2(dir[0], dir[1]); }
        const p = follow();
        group.position.set(p[0] + dir[0] * 0.8, p[1] + 1.9, p[2] + dir[1] * 0.8);
        const k = Math.min(1, t / 0.25) * Math.min(1, (dur - t) / 0.5);
        layers.forEach((m, i) => { const u = m.material.uniforms; u.uT.value = t; u.uA.value = Math.max(0, k) * (i ? 0.7 : 1); });
        if (light) { light.position.set(p[0] + dir[0] * len * 0.5, p[1] + 2, p[2] + dir[1] * len * 0.5); light.intensity = 8 * Math.max(0, k); }
        // Wind ribbons, thin wisps and streaks of air sweeping through the veil; nothing but air.
        const n = fx.n(20 * k);
        for (let i = 0; i < n; i++) {
          const f = Math.sqrt(Math.random()), a = Math.random() * 6.283, rr = (1.6 + 3.4 * f) * Math.sqrt(Math.random());
          const side = Math.cos(a) * rr, up = Math.sin(a) * rr * 0.42;
          const x = p[0] + dir[0] * (1 + f * len) - dir[1] * side, z = p[2] + dir[1] * (1 + f * len) + dir[0] * side;
          const sp = rnd(22, 34), sw = rnd(-2, 2);
          fx.streak.emit({ p: [x, p[1] + 1.9 + up, z], v: [dir[0] * sp - dir[1] * sw, rnd(-0.6, 0.6), dir[1] * sp + dir[0] * sw], life: rnd(0.25, 0.5), s0: rnd(1.6, 3) * (0.4 + f), s1: 0.6, c0: [0.88, 1, 0.95, 0.4], c1: [0.8, 1, 0.95, 0], drag: 1.5, rot: rnd(-0.12, 0.12) });
          if (i % 4 === 0) fx.smoke.emit({ p: [x, p[1] + 1.9 + up, z], v: [dir[0] * 12 - dir[1] * sw, rnd(-0.5, 0.5), dir[1] * 12 + dir[0] * sw], life: rnd(0.6, 1), s0: 1.2, s1: 3, c0: [0.86, 0.98, 0.92, 0.1], c1: [0.9, 1, 0.95, 0], drag: 1.5, rotV: rnd(-1, 1) });
        }
        tick += dt;
        if (onTick && t < dur && tick >= 0.1) { tick -= 0.1; onTick(); }
      },
      dispose: () => { scene.remove(group); layers.forEach((m) => { m.geometry.dispose(); if (m.material !== mat) m.material.dispose(); }); mat.dispose(); fx.releaseLight(light); },
    });
  }

  // Eye of the Storm: a vortex of wind wraps the caster. Three translucent layers of rising, spinning bands (each a wall that
  // curves in over the top) around a calm centre. `follow` returns [x, y, z]; the returned effect's end() lets it die away early.
  // onTick (the caster only) fires eight times a second.
  eyeStorm(follow, r = 6, dur = 5, onTick) {
    const fx = this.fx, scene = this.scene;
    const vs = `varying vec2 vUv; varying vec3 vW; varying vec3 vN; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }`;
    const fs = `uniform float uT; uniform float uA; uniform float uS; varying vec2 vUv; varying vec3 vW; varying vec3 vN;
      float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
      void main(){
        float a = vUv.x, v = vUv.y;
        // Slanted streaks climb the wall as they spin: the shear (v*7) turns them into spiral arms.
        float n1 = noise(vec2(fract(a + uS*0.37)*26.0 + v*7.0, v*2.0 - uT*2.4 + uS));
        float n2 = noise(vec2(a*52.0 + v*11.0 + uS*5.0, v*4.0 - uT*4.0));
        float n = n1*0.6 + n2*0.4;
        float streak = smoothstep(0.5, 0.86, n);
        float band = 0.5 + 0.5*sin(v*17.0 - uT*3.0 + uS*3.0);
        float fade = smoothstep(0.0, 0.1, v) * smoothstep(1.0, 0.8, v);
        float near = smoothstep(2.5, 8.0, distance(vW, cameraPosition)); // from inside, the near wall thins out
        float soft = smoothstep(0.0, 0.5, abs(dot(normalize(vN), normalize(cameraPosition - vW))));
        float al = (smoothstep(0.46, 0.72, n)*0.6 + band*0.05 + 0.04) * fade * near * soft * uA;
        vec3 col = mix(vec3(0.38,0.74,0.62), vec3(0.97,1.0,0.99), smoothstep(0.55, 0.88, n));
        gl_FragColor = vec4(col, al);
      }`;
    // The wall profile: straight up from the ground, then curving in over the top into a dome.
    const prof = [];
    for (let i = 0; i <= 22; i++) {
      const f = i / 22;
      if (f < 0.5) prof.push(new THREE.Vector2(r * (1 + 0.1 * f * 2), f * 2 * 5.5));
      else { const q = (f - 0.5) * 2, an = q * Math.PI / 2; prof.push(new THREE.Vector2(r * 1.1 * Math.cos(an), 5.5 + Math.sin(an) * 4.2)); }
    }
    const mats = [], layers = [];
    const spin = [-2.6, 3.4, -4.4], size = [1, 0.84, 0.68];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.ShaderMaterial({
        uniforms: { uT: { value: 0 }, uA: { value: 0 }, uS: { value: i * 1.3 } },
        vertexShader: vs, fragmentShader: fs,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
      });
      const g = new THREE.LatheGeometry(prof.map((q) => new THREE.Vector2(q.x * size[i], q.y * (0.85 + 0.15 * size[i]))), 48);
      const mesh = new THREE.Mesh(g, m);
      mats.push(m); layers.push(mesh);
      scene.add(mesh);
    }
    const p0 = follow();
    fx.shockwave([p0[0], this.h(p0[0], p0[2]), p0[2]], r * 1.5, 0xbaffea, 0.5);
    fx.flash([p0[0], p0[1] + 2, p0[2]], 0xbaffea, 18, 0.4, r * 3);
    const light = fx.holdLight({}, 0xbaffea, 6, r * 3);
    let endAt = dur - 0.6, tick = 0; // the wall dies away over the last 0.6 s
    const e = fx.add({
      dur: dur + 0.1,
      update: (dt, t) => {
        const p = follow();
        const k = Math.min(1, t / 0.4) * (t < endAt ? 1 : Math.max(0, 1 - (t - endAt) / 0.6));
        const grow = 0.55 + 0.45 * (1 - Math.pow(1 - Math.min(1, t / 0.4), 3));
        layers.forEach((m, i) => {
          m.position.set(p[0], p[1], p[2]);
          m.rotation.y += dt * spin[i];
          m.scale.set(grow, grow, grow);
          mats[i].uniforms.uT.value = t;
          mats[i].uniforms.uA.value = k * (1 - i * 0.2);
        });
        if (light) { light.position.set(p[0], p[1] + 3, p[2]); light.intensity = 7 * k; }
        // Streaks racing round the wall and climbing it, a ground-hugging whirl, and a quiet glow at the calm centre.
        const n = fx.n(22 * k);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * 6.283, hh = Math.random() * 7.5, rr = r * grow * (hh < 5.5 ? 1.02 : Math.cos(Math.min(1.5, (hh - 5.5) / 4.2)) * 1.1) * rnd(0.82, 1);
          const sg = (i & 1) ? 1 : -1, sp = rnd(20, 30) * sg;
          fx.streak.emit({ p: [p[0] + Math.cos(a) * rr, p[1] + hh * grow, p[2] + Math.sin(a) * rr], v: [-Math.sin(a) * sp, rnd(2, 6), Math.cos(a) * sp], life: rnd(0.25, 0.45), s0: rnd(1.2, 2.2), s1: 0.5, c0: [0.88, 1, 0.95, 0.4], c1: [0.8, 1, 0.95, 0], drag: 0.8, rot: rnd(-0.3, 0.3) });
          if (i % 5 === 0) fx.smoke.emit({ p: [p[0] + Math.cos(a) * r * grow, p[1] + rnd(0.2, 1), p[2] + Math.sin(a) * r * grow], v: [-Math.sin(a) * 9 * sg, rnd(0.5, 2), Math.cos(a) * 9 * sg], life: rnd(0.7, 1.2), s0: 1.4, s1: 3.4, c0: [0.86, 0.98, 0.92, 0.2], c1: [0.9, 1, 0.95, 0], drag: 1, rotV: rnd(-1, 1) });
        }
        if (Math.random() < 0.25 * k) fx.glow.emit({ p: [p[0] + rnd(-1, 1), p[1] + rnd(0.3, 2.2), p[2] + rnd(-1, 1)], v: [0, 0.4, 0], life: 0.8, s0: 2.2, s1: 3.2, c0: [0.7, 1, 0.9, 0.08], c1: [0.7, 1, 0.9, 0] });
        tick += dt;
        if (onTick && t < dur && tick >= 0.125) { tick -= 0.125; onTick(); }
      },
      dispose: () => { for (const m of layers) { scene.remove(m); m.geometry.dispose(); } for (const m of mats) m.dispose(); fx.releaseLight(light); },
    });
    e.end = () => { endAt = Math.min(endAt, e.t); e.dur = Math.min(e.dur, endAt + 0.7); };
    return e;
  }

  // A shot turned aside by the Eye of the Storm: a flash of wind where it struck.
  windDeflect(p) {
    const fx = this.fx;
    fx.impact(p, [0.8, 1, 0.9]);
    for (let i = 0; i < fx.n(8); i++) fx.streak.emit({ p: [...p], v: [rnd(-12, 12), rnd(-4, 6), rnd(-12, 12)], life: rnd(0.2, 0.4), s0: rnd(1.2, 2), s1: 0.4, c0: [0.9, 1, 0.95, 0.9], c1: [0.8, 1, 0.95, 0], drag: 3 });
  }

  // `d` may be a function returning the caster's facing: the tornado is steered toward it as it travels.
  cyclone(o, d, dur = 5, speed = 6, onTick) {
    const fx = this.fx, scene = this.scene;
    const face = typeof d === 'function' ? d : null;
    const d0 = face ? face() : d;
    const dir = new THREE.Vector3(d0[0], 0, d0[2]).normalize();
    const pos = new THREE.Vector3(o[0] + dir.x * 3, 0, o[2] + dir.z * 3);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uA: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vN=normalize(mat3(modelMatrix)*normal); vV=normalize(cameraPosition-w.xyz); gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uT; uniform float uA; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
        void main(){
          vec2 uv = vec2(vUv.x*6. + uT*2.2 + vUv.y*2.5, vUv.y*3. - uT*1.5);
          float n = noise(uv*vec2(3.,6.)) * 0.6 + noise(uv*vec2(7.,12.))*0.4;
          float streak = smoothstep(0.45, 0.9, n);
          float edge = pow(max(0.0, 1.0 - abs(dot(vN, vV))), 1.5);
          float fade = smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
          float a = (streak*0.8 + edge*0.25) * fade * uA;
          gl_FragColor = vec4(mix(vec3(0.62,0.66,0.6), vec3(0.92,1.0,0.97), streak) * a, a*0.8);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    const group = new THREE.Group();
    const layers = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.CylinderGeometry(3.6 - i * 0.7, 0.35 + i * 0.1, 10 - i, 40, 10, true).translate(0, (10 - i) / 2, 0);
      const m = new THREE.Mesh(g, mat);
      layers.push(m);
      group.add(m);
    }
    scene.add(group);
    let tick = 0;
    fx.add({
      dur,
      update: (dt, t) => {
        if (face) { const f = face(); dir.lerp(new THREE.Vector3(f[0], 0, f[2]), Math.min(1, dt * 2.5)).normalize(); }
        pos.addScaledVector(dir, speed * dt);
        const y = this.h(pos.x, pos.z);
        group.position.set(pos.x + Math.sin(t * 3) * 0.3, y, pos.z + Math.cos(t * 2.5) * 0.3);
        layers.forEach((m, i) => (m.rotation.y -= dt * (6 + i * 3)));
        mat.uniforms.uT.value = t;
        mat.uniforms.uA.value = Math.min(1, t * 3) * Math.min(1, (dur - t) * 2);
        for (let i = 0; i < fx.n(6); i++) {
          const a = Math.random() * 6.28, r = rnd(1.5, 4);
          fx.smoke.emit({ p: [pos.x + Math.cos(a) * r, y + 0.3, pos.z + Math.sin(a) * r], v: [-Math.sin(a) * 9 + Math.cos(a) * 2, rnd(0.5, 3), Math.cos(a) * 9 + Math.sin(a) * 2], life: rnd(0.6, 1.1), s0: 1.2, s1: 3.2, c0: [0.62, 0.58, 0.5, 0.55], c1: [0.7, 0.68, 0.62, 0], drag: 1.5 });
        }
        for (let i = 0; i < fx.n(3); i++) {
          const a = Math.random() * 6.28, h = rnd(0, 8), r = 0.6 + h * 0.35;
          fx.debris.emit({ p: [pos.x + Math.cos(a) * r, y + h, pos.z + Math.sin(a) * r], v: [-Math.sin(a) * 12, rnd(2, 6), Math.cos(a) * 12], life: rnd(0.3, 0.6), s0: rnd(0.15, 0.35), s1: 0.1, c0: [1, 1, 1, 1], c1: [1, 1, 1, 1], rotV: 10 });
          fx.streak.emit({ p: [pos.x + Math.cos(a) * r, y + h, pos.z + Math.sin(a) * r], v: [-Math.sin(a) * 16, 3, Math.cos(a) * 16], life: 0.25, s0: 1.4, s1: 0.4, c0: [0.9, 1, 0.97, 0.45], c1: [0.9, 1, 0.97, 0] });
        }
        if (onTick) { tick += dt; if (tick >= 0.25) { tick = 0; onTick([pos.x, y, pos.z]); } }
      },
      dispose: () => { scene.remove(group); layers.forEach((m) => m.geometry.dispose()); mat.dispose(); },
    });
  }

  // ---------------- GRAVITY ----------------
  // Gravity Gun: for `dur` s a swirling violet vortex drags everything in (rings shrink toward the centre, motes spiral
  // in, the core swells and a hum rises), then it collapses in a blast of radius `blast`. onCollapse(c) is called once.
  gravityWell(c, { dur = 1.25, pull = 14, blast = 9, onCollapse } = {}) {
    const fx = this.fx, scene = this.scene;
    const gy = this.h(c[0], c[2]), cy = Math.max(c[1], gy + 0.5);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uA: { value: 0 } },
      vertexShader: 'varying vec2 vP; void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform float uT; uniform float uA; varying vec2 vP;
        void main(){
          float r = length(vP), th = atan(vP.y, vP.x);
          float arms = 0.5 + 0.5 * sin(th * 3. + log(r + 0.08) * 7. + uT * 11.);
          float rim = smoothstep(1., 0.55, r), core = smoothstep(0.45, 0., r);
          float a = (arms * 0.75 + core * 1.1) * rim * uA;
          gl_FragColor = vec4(mix(vec3(0.55, 0.28, 1.), vec3(1., 0.95, 1.), core + arms * 0.15) * a, a);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), mat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(c[0], gy + 0.3, c[2]);
    disc.renderOrder = 2;
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xc8a0ff, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const core = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), coreMat);
    core.position.set(c[0], cy, c[2]);
    const rgeo = new THREE.RingGeometry(0.94, 1, 64).rotateX(-Math.PI / 2);
    const rings = [0, 1, 2].map(() => new THREE.Mesh(rgeo, new THREE.MeshBasicMaterial({ color: 0xcaa8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
    for (const r of rings) { r.position.set(c[0], gy + 0.35, c[2]); scene.add(r); }
    scene.add(disc, core);
    const light = fx.holdLight({}, 0xa070ff, 10, pull * 1.6);
    if (light) light.position.set(c[0], cy + 1, c[2]);
    let boomed = false;
    fx.add({
      dur: dur + 0.15,
      update: (dt, t) => {
        const k = Math.min(1, t / dur);
        mat.uniforms.uT.value = t;
        mat.uniforms.uA.value = boomed ? 0 : Math.min(1, t * 6) * (0.55 + 0.45 * k);
        disc.scale.setScalar(pull * (0.75 - 0.3 * k * k));
        disc.visible = core.visible = !boomed;
        core.scale.setScalar(0.3 + 1.5 * k * k + Math.sin(t * 40) * 0.05);
        core.position.y = cy + Math.sin(t * 9) * 0.08;
        if (light) light.intensity = boomed ? 0 : 6 + 22 * k;
        rings.forEach((r, i) => {
          const ph = (t / dur * 1.8 + i / 3) % 1, rad = 1.2 + (pull - 1.2) * (1 - ph * ph);
          r.scale.set(rad, 1, rad);
          r.material.opacity = boomed ? 0 : Math.sin(ph * Math.PI) * 0.75;
        });
        if (!boomed) {
          for (let i = 0; i < fx.n(10 + 18 * k); i++) {
            const a = Math.random() * 6.28, rr = rnd(2.5, pull) * (1 - 0.4 * k), x = c[0] + Math.cos(a) * rr, z = c[2] + Math.sin(a) * rr, h = rnd(0, 1.2 + rr * 0.12);
            const sp = 12 + 10 * k, tg = 7;
            fx.glow.emit({ p: [x, gy + h, z], v: [-Math.cos(a) * sp - Math.sin(a) * tg, rnd(-0.5, 1.5), -Math.sin(a) * sp + Math.cos(a) * tg], life: rnd(0.25, 0.5), s0: rnd(0.6, 1.3), s1: 0.2, c0: [0.7, 0.45, 1, 0.55], c1: [0.9, 0.8, 1, 0] });
            if (i % 3 === 0) fx.streak.emit({ p: [x, gy + h + 0.4, z], v: [-Math.cos(a) * sp * 1.3 - Math.sin(a) * tg, rnd(0, 2), -Math.sin(a) * sp * 1.3 + Math.cos(a) * tg], life: 0.22, s0: rnd(1, 1.8), s1: 0.3, c0: [0.85, 0.75, 1, 0.5], c1: [0.8, 0.6, 1, 0], rot: 1.2 });
            if (i % 5 === 0) fx.debris.emit({ p: [x, gy + 0.2, z], v: [-Math.cos(a) * sp * 0.7, rnd(1, 4), -Math.sin(a) * sp * 0.7], life: rnd(0.3, 0.6), s0: rnd(0.12, 0.3), s1: 0.08, c0: [0.5, 0.4, 0.35, 1], c1: [0.5, 0.4, 0.35, 0], rotV: 8 });
          }
        }
        if (t >= dur && !boomed) {
          boomed = true;
          const p = [c[0], cy, c[2]];
          fx.explosion(p, 2.2, { color: [0.7, 0.3, 1] });
          fx.shockwave([c[0], gy, c[2]], blast, 0xb27cff, 0.6);
          fx.shockwave([c[0], gy, c[2]], blast * 0.65, 0xffffff, 0.4, 0.5);
          fx.dustBurst([c[0], gy, c[2]], blast * 0.3, [0.5, 0.45, 0.6]);
          fx.flash(p, 0xc09aff, 90, 0.5, blast * 2.4);
          for (let i = 0; i < fx.n(70); i++) {
            const a = Math.random() * 6.28, sp = rnd(8, 26);
            fx.glow.emit({ p: [...p], v: [Math.cos(a) * sp, rnd(-1, 6), Math.sin(a) * sp], life: rnd(0.4, 0.9), s0: rnd(1.5, 3), s1: 0.5, c0: [0.75, 0.5, 1, 0.8], c1: [0.9, 0.8, 1, 0], drag: 2.5 });
          }
          fx.glow.emit({ p: [...p], life: 0.25, s0: 6, s1: 16, c0: [0.85, 0.7, 1, 0.85], c1: [0.7, 0.4, 1, 0] });
          if (onCollapse) onCollapse(c);
        }
      },
      dispose: () => {
        scene.remove(disc, core);
        for (const r of rings) { scene.remove(r); r.material.dispose(); }
        disc.geometry.dispose(); mat.dispose(); core.geometry.dispose(); coreMat.dispose(); rgeo.dispose();
        fx.releaseLight(light);
      },
    });
  }

  // ---------------- Enemy / NPC visuals ----------------
  orb(o, v, { color = [0.4, 1, 0.3], size = 1, dur = 4, onUpdate, gravity = 0 } = {}) {
    const fx = this.fx;
    const pos = new THREE.Vector3(...o), vel = new THREE.Vector3(...v);
    let age = 0;
    return fx.add({
      dur,
      update: (dt) => {
        age += dt;
        vel.y -= gravity * dt;
        pos.addScaledVector(vel, dt);
        // Enemy shots must be easy to see: a big coloured halo, a white-hot core, a long fading trail and a streak along the flight line.
        const sp = vel.length() || 1, ang = Math.atan2(vel.y, Math.hypot(vel.x, vel.z));
        fx.glow.emit({ p: [pos.x, pos.y, pos.z], life: 0.05, s0: 2.6 * size, s1: 2.6 * size, c0: [...color, 0.85], c1: [...color, 0.7] });
        fx.glow.emit({ p: [pos.x, pos.y, pos.z], life: 0.05, s0: 0.9 * size, s1: 0.9 * size, c0: [1, 1, 1, 0.9], c1: [1, 1, 1, 0.8] });
        fx.glow.emit({ p: [pos.x, pos.y, pos.z], v: [rnd(-0.4, 0.4), rnd(-0.4, 0.4), rnd(-0.4, 0.4)], life: 0.6, s0: 1.7 * size, s1: 0.3, c0: [...color, 0.75], c1: [...color, 0] });
        fx.streak.emit({ p: [pos.x - vel.x / sp * 0.9 * size, pos.y - vel.y / sp * 0.9 * size, pos.z - vel.z / sp * 0.9 * size], v: [0, 0, 0], life: 0.12, s0: 3.2 * size, s1: 1.4 * size, c0: [...color, 0.9], c1: [...color, 0], rot: ang });
        if (onUpdate && onUpdate(pos, vel) === false) return false;
        if (pos.y < this.h(pos.x, pos.z)) { fx.impact([pos.x, pos.y + 0.2, pos.z], color); return false; }
        if (age > 0.12 && this.solid && this.solid(pos.x, pos.y, pos.z)) { fx.impact([pos.x, pos.y, pos.z], color); return false; } // a rock, tree or wall stops it
      },
    });
  }

  telegraph(p, r, delay, color = 0xff3030) {
    const fx = this.fx;
    fx.decal(p, TX.ringDecal(), r * 2, delay, { color, additive: true, opacity: 0.45 });
  }

  healBeam(a, b) {
    const fx = this.fx;
    for (let i = 0; i < fx.n(14); i++) {
      const t = Math.random();
      fx.glow.emit({ p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + Math.sin(t * 3.14) * 1.2, a[2] + (b[2] - a[2]) * t], v: [0, 1, 0], life: rnd(0.4, 0.8), s0: 0.6, s1: 0.1, c0: [0.5, 1, 0.55, 0.9], c1: [1, 0.95, 0.5, 0] });
    }
    for (let i = 0; i < fx.n(10); i++) {
      const a2 = Math.random() * 6.28;
      fx.shard.emit({ p: [b[0] + Math.cos(a2) * 0.7, b[1] - 1 + Math.random(), b[2] + Math.sin(a2) * 0.7], v: [0, rnd(1.5, 3), 0], life: rnd(0.6, 1), s0: 0.3, s1: 0.1, c0: [0.6, 1, 0.6, 1], c1: [1, 1, 0.6, 0] });
    }
  }

  // Green crosses spiral up around a healed body; `p` is the feet position.
  healAura(p, big = 1) {
    const fx = this.fx;
    for (let i = 0; i < fx.n(Math.round(16 * big)) + 4; i++) {
      const a = Math.random() * 6.28, r = rnd(0.45, 0.75);
      const tang = [-Math.sin(a) * 1.2, rnd(1.2, 2.4), Math.cos(a) * 1.2];
      fx.plus.emit({ p: [p[0] + Math.cos(a) * r, p[1] + rnd(0.1, 1.6), p[2] + Math.sin(a) * r], v: tang, life: rnd(0.7, 1.2), s0: rnd(0.22, 0.36), s1: 0.08, c0: [0.35, 1, 0.45, 1], c1: [0.7, 1, 0.6, 0], drag: 1.5 });
    }
    for (let i = 0; i < fx.n(6); i++) fx.glow.emit({ p: [p[0], p[1] + rnd(0.3, 1.5), p[2]], v: [0, 0.6, 0], life: 0.5, s0: 1.4, s1: 0.4, c0: [0.3, 1, 0.4, 0.35], c1: [0.3, 1, 0.4, 0] });
  }

  // Hell opens under a summoned zombie at `p`: the ground cracks, a fire pit glares open and a column of flame, smoke, sparks and
  // dirt is thrown up (the zombie climbs out of it, see NpcView). The pit smoulders ~2.5 s and the cracks stay on the ground.
  hellPit(p) {
    const fx = this.fx, scene = this.scene, gy = this.h(p[0], p[2]);
    fx.decal(p, TX.scorchDecal(), 4.2, 24, { opacity: 0.9 });
    fx.decal(p, TX.crackDecal(), 5.4, 24, { color: 0x180804, opacity: 0.95 });
    fx.decal(p, TX.crackDecal(), 5.4, 3.2, { color: 0xff5a14, additive: true, opacity: 1, rot: 0.6 });
    const mat = hellPitMaterial();
    const pit = new THREE.Mesh(new THREE.CircleGeometry(1, 28), mat);
    pit.rotation.x = -Math.PI / 2; pit.position.set(p[0], gy + 0.16, p[2]); pit.renderOrder = 2;
    scene.add(pit);
    const light = fx.holdLight({}, 0xff5a18, 0, 9);
    fx.shockwave([p[0], gy, p[2]], 2.6, 0xff6a1a, 0.5);
    fx.flash([p[0], gy + 1.2, p[2]], 0xff6a20, 26, 0.5, 12);
    fx.dustBurst([p[0], gy, p[2]], 0.9, [0.3, 0.22, 0.17]);
    for (let i = 0; i < fx.n(26); i++) {
      const a = Math.random() * 6.28, sp = rnd(0.5, 3);
      fx.debris.emit({ p: [p[0] + Math.cos(a) * 0.4, gy + 0.2, p[2] + Math.sin(a) * 0.4], v: [Math.cos(a) * sp, rnd(3, 8), Math.sin(a) * sp], life: rnd(0.6, 1.1), s0: rnd(0.12, 0.3), s1: 0.1, c0: [0.25, 0.18, 0.12, 1], c1: [0.25, 0.18, 0.12, 0], g: 14, rotV: 6 });
    }
    for (let i = 0; i < fx.n(14); i++) fx.spark.emit({ p: [p[0], gy + 0.3, p[2]], v: [rnd(-3, 3), rnd(6, 13), rnd(-3, 3)], life: rnd(0.8, 1.5), s0: 0.14, s1: 0.03, c0: [1, 0.6, 0.15, 1], c1: [1, 0.2, 0, 0], g: 9 });
    fx.add({
      dur: 2.6,
      update: (dt, t) => {
        const open = Math.min(1, t / 0.3), k = t < 1.6 ? 1 : Math.max(0, 1 - (t - 1.6) / 1);
        mat.uniforms.uT.value = t; mat.uniforms.uA.value = k;
        pit.scale.setScalar(1.15 * (1 - (1 - open) ** 2) * (0.6 + 0.4 * k));
        if (light) { light.position.set(p[0], gy + 1.2, p[2]); light.intensity = (10 + Math.sin(t * 30) * 3) * k; }
        const n = fx.n(7 * k);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * 6.28, r = Math.random() * 0.9 * (0.5 + 0.5 * open);
          fx.fire.emit({ p: [p[0] + Math.cos(a) * r, gy + 0.2, p[2] + Math.sin(a) * r], v: [rnd(-0.6, 0.6), rnd(3, 6.5) * (t < 0.5 ? 1.6 : 1), rnd(-0.6, 0.6)], life: rnd(0.5, 0.9), s0: rnd(0.8, 1.3), s1: 0.25, c0: [1, 0.55, 0.12, 0.9], c1: [0.7, 0.08, 0.01, 0], turb: 3 });
        }
        if (Math.random() < 0.5 * k) fx.smoke.emit({ p: [p[0] + rnd(-0.5, 0.5), gy + 1.5, p[2] + rnd(-0.5, 0.5)], v: [rnd(-0.3, 0.3), rnd(1.5, 2.6), rnd(-0.3, 0.3)], life: 1.8, s0: 0.8, s1: 2.4, c0: [0.08, 0.06, 0.05, 0.6], c1: [0.1, 0.1, 0.1, 0], drag: 0.6 });
        if (Math.random() < 0.4 * k) fx.glow.emit({ p: [p[0], gy + rnd(0.3, 1.5), p[2]], v: [rnd(-1, 1), rnd(1, 2.5), rnd(-1, 1)], life: 0.8, s0: 0.3, s1: 0.05, c0: [1, 0.5, 0.1, 0.8], c1: [1, 0.2, 0, 0] });
      },
      dispose: () => { scene.remove(pit); pit.geometry.dispose(); mat.dispose(); fx.releaseLight(light); },
    });
  }

  // A hidden hell pit for Game.warmSummons: makes the ground textures and the pit shader ahead of the first slam. The caller removes the mesh.
  // Its material is kept (never disposed) so the compiled program stays cached for the real pits.
  hellPitProbe() {
    TX.scorchDecal(); TX.crackDecal();
    const mat = this._pitProbeMat || (this._pitProbeMat = hellPitMaterial());
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 28), mat);
    m.position.y = -300; this.scene.add(m);
    return m;
  }

  // A summoned zombie's time is up (or it was destroyed): it bursts into flame and drifts away as ash and embers.
  hellFade(p) {
    const fx = this.fx;
    fx.flash([p[0], p[1] + 1, p[2]], 0xff6a20, 14, 0.4, 8);
    for (let i = 0; i < fx.n(16); i++) fx.fire.emit({ p: [p[0] + rnd(-0.4, 0.4), p[1] + rnd(0.1, 1.8), p[2] + rnd(-0.4, 0.4)], v: [rnd(-1, 1), rnd(1.5, 4), rnd(-1, 1)], life: rnd(0.5, 0.9), s0: rnd(0.8, 1.4), s1: 0.2, c0: [1, 0.5, 0.1, 0.9], c1: [0.6, 0.08, 0.01, 0], turb: 3 });
    for (let i = 0; i < fx.n(8); i++) fx.smoke.emit({ p: [p[0] + rnd(-0.4, 0.4), p[1] + rnd(0.3, 1.8), p[2] + rnd(-0.4, 0.4)], v: [rnd(-0.4, 0.4), rnd(1, 2), rnd(-0.4, 0.4)], life: 1.6, s0: 0.6, s1: 1.8, c0: [0.07, 0.06, 0.05, 0.5], c1: [0.1, 0.1, 0.1, 0] });
    for (let i = 0; i < fx.n(12); i++) fx.spark.emit({ p: [p[0], p[1] + 1, p[2]], v: [rnd(-2, 2), rnd(2, 6), rnd(-2, 2)], life: rnd(0.8, 1.4), s0: 0.1, s1: 0.02, c0: [1, 0.55, 0.15, 1], c1: [1, 0.2, 0, 0], g: 4 });
  }

  // Gold-white crosses and a ring of light lift off a healed body; `p` is the feet position.
  holyBurst(p, big = 1) {
    const fx = this.fx;
    for (let i = 0; i < fx.n(Math.round(20 * big)) + 4; i++) {
      const a = Math.random() * 6.28, r = rnd(0.2, 0.7);
      fx.plus.emit({ p: [p[0] + Math.cos(a) * r, p[1] + rnd(0.1, 1.4), p[2] + Math.sin(a) * r], v: [Math.cos(a) * 0.5, rnd(1.4, 3.2), Math.sin(a) * 0.5], life: rnd(0.9, 1.5), s0: rnd(0.24, 0.42), s1: 0.08, c0: [1, 0.92, 0.55, 1], c1: [1, 1, 0.9, 0], drag: 1.2 });
    }
    for (let i = 0; i < fx.n(8); i++) fx.glow.emit({ p: [p[0], p[1] + rnd(0.2, 1.6), p[2]], v: [0, 0.7, 0], life: 0.6, s0: 1.6, s1: 0.5, c0: [1, 0.9, 0.5, 0.4], c1: [1, 0.95, 0.7, 0] });
    fx.glow.emit({ p: [p[0], p[1] + 1, p[2]], life: 0.3, s0: 1, s1: 5 * big, c0: [1, 0.95, 0.7, 0.8], c1: [1, 0.85, 0.4, 0] });
    fx.shockwave([p[0], p[1] + 0.05, p[2]], 2.6 * big, 0xffe7a0, 0.55);
    fx.flash([p[0], p[1] + 1.2, p[2]], 0xffe9a8, 14 * big, 0.5, 9);
  }

  // Healing Staff: one beam of golden-white light per target, bending from the staff crystal to each of them for `dur`
  // seconds. `src()` is the crystal and every `tgts[i]()` an ally's chest; both are read every frame so the beams
  // follow them wherever they run. Each beam is a cubic curve that arcs up over the land and sways, drawn as a pair of
  // crossed ribbons (a wide halo and a thin white core) with bright pulses travelling along it, plus sparkles.
  // A hidden mesh with the beam's shader, so it can be compiled ahead of the first cast (see Game.warmSummons).
  healBeamProbe() {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), healBeamMat(0xffc860, 0.4));
    m.position.y = -300; m.frustumCulled = false; this.scene.add(m);
    return m;
  }

  healBeams(src, tgts, dur = 1.2) {
    const fx = this.fx, scene = this.scene, N = 40, GROW = 0.3, FADE = 0.4;
    const mk = healBeamMat;
    const idx = [];
    for (let i = 0; i < N; i++) for (let r = 0; r < 2; r++) { const o = i * 4 + r * 2; idx.push(o, o + 1, o + 4, o + 1, o + 5, o + 4); }
    const A = new THREE.Vector3(), B = new THREE.Vector3(), D = new THREE.Vector3(), S = new THREE.Vector3(), U = new THREE.Vector3(0, 1, 0);
    const P1 = new THREE.Vector3(), P2 = new THREE.Vector3(), Q = new THREE.Vector3(), T = new THREE.Vector3(), S2 = new THREE.Vector3(), NR = new THREE.Vector3();
    const beams = tgts.map((fn, k) => {
      const geo = new THREE.BufferGeometry();
      const n = (N + 1) * 4;
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      geo.setAttribute('off', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const uv = new Float32Array(n * 2);
      for (let i = 0; i <= N; i++) for (let c = 0; c < 4; c++) { uv[(i * 4 + c) * 2] = i / N; uv[(i * 4 + c) * 2 + 1] = c % 2 ? 1 : -1; }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      const halo = mk(0xffc860, 0.4), core = mk(0xfffbe8, 0.14);
      const m1 = new THREE.Mesh(geo, halo), m2 = new THREE.Mesh(geo, core);
      m1.frustumCulled = m2.frustumCulled = false; m1.renderOrder = 3; m2.renderOrder = 4;
      scene.add(m1, m2);
      return { fn, geo, halo, core, m1, m2, ph: k * 1.7 + Math.random() * 3, arrived: false, last: null };
    });
    const light = fx.holdLight({}, 0xffe0a0, 0, 24);
    // Point s (0..1) of beam b's curve into Q, and its tangent into T.
    const bez = (s) => {
      const u = 1 - s, a = u * u * u, b = 3 * u * u * s, c = 3 * u * s * s, d = s * s * s;
      Q.set(a * A.x + b * P1.x + c * P2.x + d * B.x, a * A.y + b * P1.y + c * P2.y + d * B.y, a * A.z + b * P1.z + c * P2.z + d * B.z);
      const t0 = 3 * u * u, t1 = 6 * u * s, t2 = 3 * s * s;
      T.set(t0 * (P1.x - A.x) + t1 * (P2.x - P1.x) + t2 * (B.x - P2.x), t0 * (P1.y - A.y) + t1 * (P2.y - P1.y) + t2 * (B.y - P2.y), t0 * (P1.z - A.z) + t1 * (P2.z - P1.z) + t2 * (B.z - P2.z)).normalize();
    };
    fx.add({
      dur: dur + FADE,
      update: (dt, t) => {
        const s0 = src();
        // A staff position that is not a number (a remote rig mid-load) must never reach the light: a NaN light position blacks the whole screen out.
        if (!s0 || !Number.isFinite(s0[0] + s0[1] + s0[2])) { if (light) light.intensity = 0; return; }
        A.set(s0[0], s0[1], s0[2]);
        const grow = Math.min(1, t / GROW), head = 1 - Math.pow(1 - grow, 2), fade = t < dur ? 1 : Math.max(0, 1 - (t - dur) / FADE);
        const k = Math.min(1, t / 0.12) * fade;
        if (light) { light.position.set(A.x, A.y, A.z); light.intensity = 16 * k; }
        for (const b of beams) {
          const e = b.fn();
          if (!e || !Number.isFinite(e[0] + e[1] + e[2])) continue;
          B.set(e[0], e[1], e[2]);
          D.subVectors(B, A);
          const L = Math.max(D.length(), 0.5);
          D.divideScalar(L);
          S.crossVectors(D, U); if (S.lengthSq() < 1e-4) S.set(1, 0, 0); S.normalize();
          // It arcs up over the land (higher the further it has to reach) and its handles sway so the whole curve bends and drifts.
          const H = Math.min(34, 2 + L * 0.26), sw1 = L * 0.13 * Math.sin(t * 2.3 + b.ph), sw2 = L * 0.13 * Math.sin(t * 1.8 + b.ph + 2);
          P1.copy(A).addScaledVector(D, L * 0.27).addScaledVector(U, H * 1.25).addScaledVector(S, sw1);
          P2.copy(B).addScaledVector(D, -L * 0.27).addScaledVector(U, H * 0.9).addScaledVector(S, -sw2);
          const amp = 0.2 + Math.min(1.6, L * 0.012), wave = (i) => Math.sin(i / N * Math.PI);
          const pos = b.geo.attributes.position.array, off = b.geo.attributes.off.array;
          for (let i = 0; i <= N; i++) {
            const s = i / N;
            bez(s);
            S2.crossVectors(T, U); if (S2.lengthSq() < 1e-4) S2.copy(S); S2.normalize();
            const wob = Math.sin(s * 11 - t * 7 + b.ph) * amp * wave(i);
            Q.addScaledVector(S2, wob);
            Q.y = Math.max(Q.y, this.h(Q.x, Q.z) + 0.9);
            // Two ribbons crossed at right angles so the beam reads from any side.
            const nrm = NR.crossVectors(T, S2).normalize();
            const o = i * 12;
            pos[o] = pos[o + 3] = pos[o + 6] = pos[o + 9] = Q.x;
            pos[o + 1] = pos[o + 4] = pos[o + 7] = pos[o + 10] = Q.y;
            pos[o + 2] = pos[o + 5] = pos[o + 8] = pos[o + 11] = Q.z;
            off[o] = -S2.x; off[o + 1] = -S2.y; off[o + 2] = -S2.z; off[o + 3] = S2.x; off[o + 4] = S2.y; off[o + 5] = S2.z;
            off[o + 6] = -nrm.x; off[o + 7] = -nrm.y; off[o + 8] = -nrm.z; off[o + 9] = nrm.x; off[o + 10] = nrm.y; off[o + 11] = nrm.z;
          }
          b.geo.attributes.position.needsUpdate = b.geo.attributes.off.needsUpdate = true;
          const wd = Math.min(1.1, 0.24 + L * 0.004);
          for (const m of [b.halo, b.core]) { m.uniforms.uT.value = t; m.uniforms.uHead.value = head; m.uniforms.uA.value = k; m.uniforms.uLen.value = L; }
          b.halo.uniforms.uW.value = wd; b.core.uniforms.uW.value = wd * 0.34;
          // Sparkles ride along the curve and shed behind it.
          const heads = 3;
          for (let i = 0; i < heads; i++) {
            const s = ((t * 0.8 + i / heads + b.ph * 0.1) % 1) * head;
            bez(s); Q.y = Math.max(Q.y, this.h(Q.x, Q.z) + 0.9);
            fx.glow.emit({ p: [Q.x, Q.y, Q.z], life: 0.12, s0: 1.1 + wd, s1: 0.6, c0: [1, 0.93, 0.6, 0.85 * k], c1: [1, 0.85, 0.4, 0] });
            if (Math.random() < 0.7) fx.spark.emit({ p: [Q.x + rnd(-0.2, 0.2), Q.y, Q.z + rnd(-0.2, 0.2)], v: [rnd(-1, 1), rnd(-0.5, 1.5), rnd(-1, 1)], life: rnd(0.5, 0.9), s0: 0.16, s1: 0.03, c0: [1, 0.95, 0.65, 1], c1: [1, 0.8, 0.3, 0], g: 1 });
          }
          if (Math.random() < 0.5 * k) { bez(Math.random() * head); Q.y = Math.max(Q.y, this.h(Q.x, Q.z) + 0.9); fx.plus.emit({ p: [Q.x, Q.y, Q.z], v: [rnd(-0.5, 0.5), rnd(0.2, 1.2), rnd(-0.5, 0.5)], life: 0.8, s0: 0.3, s1: 0.1, c0: [1, 0.93, 0.6, 0.9], c1: [1, 1, 0.9, 0], drag: 1 }); }
          // The beam lands: a heal burst on the ally, then crosses keep rising from them while it holds.
          if (!b.arrived && grow >= 1) { b.arrived = true; this.holyBurst([B.x, B.y - 1.2, B.z]); }
          if (b.arrived && Math.random() < 0.6 * k) fx.plus.emit({ p: [B.x + rnd(-0.5, 0.5), B.y - 1 + rnd(0, 0.6), B.z + rnd(-0.5, 0.5)], v: [0, rnd(1.5, 3), 0], life: 1, s0: 0.3, s1: 0.1, c0: [1, 0.93, 0.6, 1], c1: [1, 1, 0.9, 0], drag: 1 });
        }
        // A flare at the crystal while the beams hold.
        fx.glow.emit({ p: [A.x, A.y, A.z], life: 0.06, s0: 1.4 + 0.5 * Math.sin(t * 30), s1: 1.4, c0: [1, 0.95, 0.7, 0.7 * k], c1: [1, 0.85, 0.4, 0.5 * k] });
      },
      dispose: () => {
        for (const b of beams) { scene.remove(b.m1, b.m2); b.geo.dispose(); b.halo.dispose(); b.core.dispose(); }
        fx.releaseLight(light);
      },
    });
  }

  arrow(a, b, color = [1, 0.95, 0.75]) {
    this.fx.tracer(a, b, color);
    this.fx.impact(b);
  }
}

const HB_VSH = `attribute vec3 off; uniform float uW; varying vec2 vU;
      void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position + off * uW, 1.); }`;
const HB_FSH = `uniform float uT, uHead, uA, uLen; uniform vec3 uCol; varying vec2 vU;
      void main(){
        if (vU.x > uHead) discard;
        float e = pow(max(0., 1. - abs(vU.y)), 1.6);
        float pulse = pow(.5 + .5 * sin(vU.x * uLen * .32 - uT * 15.), 5.);
        float tip = smoothstep(uHead - .06, uHead, vU.x);
        float a = clamp(e * (.5 + 1.1 * pulse + 1.2 * tip) * uA, 0., 4.);
        if (!(a >= 0.)) a = 0.; // a NaN pixel would smear black through the bloom
        gl_FragColor = vec4(uCol * a, a);
      }`;
export const healBeamMat = (col, w) => new THREE.ShaderMaterial({ uniforms: { uW: { value: w }, uT: { value: 0 }, uHead: { value: 0 }, uA: { value: 0 }, uLen: { value: 10 }, uCol: { value: new THREE.Color(col) } }, vertexShader: HB_VSH, fragmentShader: HB_FSH, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });

export function scratchVec() { return tmpV; }
