// Treasure chests: the closed chests on the map (instanced, see World.buildCrates), the opening animation, and the
// power-up that floats out of an opened chest until its owner grabs it with Use (E / Square).
//
// Opening, in real-chest terms: the chest gives a little shake as the latch pops and gold light leaks from the seam,
// then the domed lid swings back on its rear hinges (fast, then slowing, with a small bounce as it hits its stop),
// a shaft of warm light pours out with sparkles, and the power-up's icon rises out of the chest and hovers there.
import * as THREE from 'three';
import * as TX from './textures.js';
import { puIconURL } from './puicons.js';

export const CHEST = { w: 1.1, d: 0.75, h: 0.55, r: 0.375 }; // body width (x), depth (z), body height, lid radius
const HINGE = new THREE.Vector3(0, CHEST.h, -CHEST.d / 2);

let parts = null;
// Shared geometry. All in chest space: origin on the ground in the middle, the lock on the +z (front) side.
export function chestParts() {
  if (parts) return parts;
  const { w, d, h, r } = CHEST;
  const body = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
  // The lid is a half barrel, hinged at the back. lidGeo is in hinge space (hinge at the origin).
  const lid = new THREE.CylinderGeometry(r, r, w, 20, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, 0, d / 2);
  const ironBody = [], ironLid = [];
  for (const x of [-0.36, 0.36]) {
    ironBody.push(new THREE.BoxGeometry(0.075, h + 0.01, d + 0.02).translate(x, h / 2, 0));
    ironLid.push(new THREE.CylinderGeometry(r + 0.012, r + 0.012, 0.075, 20, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(x, 0, d / 2));
  }
  ironBody.push(new THREE.BoxGeometry(w + 0.02, 0.06, d + 0.02).translate(0, 0.03, 0)); // the foot rim
  ironBody.push(new THREE.BoxGeometry(w + 0.02, 0.05, d + 0.02).translate(0, h - 0.025, 0)); // the rim the lid closes on
  ironLid.push(new THREE.BoxGeometry(0.16, 0.2, 0.04).translate(0, -0.06, d + 0.01)); // hasp
  const lock = new THREE.BoxGeometry(0.17, 0.17, 0.05).translate(0, h - 0.11, d / 2 + 0.02);
  ironBody.push(lock);
  const merge = (list) => {
    const g = list.map((x) => x.toNonIndexed());
    let n = 0; for (const x of g) n += x.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    for (const x of g) { pos.set(x.attributes.position.array, o * 3); nor.set(x.attributes.normal.array, o * 3); uv.set(x.attributes.uv.array, o * 2); o += x.attributes.position.count; }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return out;
  };
  const toWorldLid = (g) => g.clone().translate(HINGE.x, HINGE.y, HINGE.z);
  parts = {
    body, lid,
    ironBody: merge(ironBody), ironLid: merge(ironLid),
    closedWood: merge([body, toWorldLid(lid)]),
    closedIron: merge([...ironBody, ...ironLid.map(toWorldLid)]),
    // a thin strip of light all round the seam between lid and body
    seam: new THREE.BoxGeometry(w + 0.03, 0.022, d + 0.03).translate(0, h + 0.005, 0),
  };
  return parts;
}
let mats = null;
export function chestMats() {
  if (mats) return mats;
  const cm = TX.crateMaps();
  mats = {
    wood: new THREE.MeshStandardMaterial({ map: cm.map, normalMap: cm.normalMap, roughness: 0.72, metalness: 0 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.45, metalness: 0.85 }),
    seam: new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  };
  return mats;
}

// A soft round glow texture for the light burst and the icon halo.
let softTex = null;
function soft() {
  if (softTex) return softTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,230,170,.55)'); g.addColorStop(1, 'rgba(255,200,100,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  softTex = new THREE.CanvasTexture(c); return softTex;
}
// The shaft of light out of the open chest: a cone with soft vertical falloff.
let shaftMat = null;
function shaft() {
  if (shaftMat) return shaftMat;
  shaftMat = new THREE.ShaderMaterial({
    uniforms: { uA: { value: 0 }, uT: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'uniform float uA, uT; varying vec2 vUv; void main(){ float a = pow(1. - vUv.y, 1.6) * (.75 + .25 * sin(uT * 4. + vUv.x * 40.)) * uA; gl_FragColor = vec4(vec3(1., .82, .45) * a, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  return shaftMat;
}

const easeOutBack = (x) => { const c1 = 1.25, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

export class ChestFx {
  constructor(game) { this.game = game; this.list = []; }

  // Play the opening at chest c. pu: the power-up inside (only for the player who paid for it), else just the show.
  open(c, pu) {
    const g = this.game, P = chestParts(), M = chestMats();
    const root = new THREE.Group();
    root.position.set(c.x, c.y, c.z); root.rotation.y = c.ry;
    const body = new THREE.Mesh(P.body, M.wood), ib = new THREE.Mesh(P.ironBody, M.iron);
    const hinge = new THREE.Group(); hinge.position.copy(HINGE);
    hinge.add(new THREE.Mesh(P.lid, M.wood), new THREE.Mesh(P.ironLid, M.iron));
    const seamMat = M.seam.clone(); const seam = new THREE.Mesh(P.seam, seamMat);
    root.add(body, ib, hinge, seam);
    root.traverse((o) => { if (o.isMesh && o !== seam) { o.castShadow = true; o.receiveShadow = true; } });
    // inside glow: a bright sprite sitting in the chest, and the light shaft rising from it
    const inner = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft(), color: 0xffd890, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    inner.position.set(0, CHEST.h + 0.1, 0); inner.scale.set(2.2, 1.6, 1);
    const sm = shaft().clone();
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.45, 5, 18, 1, true).translate(0, 2.5 + CHEST.h, 0), sm);
    root.add(inner, cone);
    g.scene.add(root);
    const e = { c, root, hinge, seamMat, inner, sm, t: 0, pu, icon: null, taken: !pu, sparkT: 0 };
    if (pu) {
      // The power-up's own icon on a glowing card that rises out of the chest and hovers.
      const tex = new THREE.TextureLoader().load(puIconURL(pu)); tex.colorSpace = THREE.SRGBColorSpace;
      const ic = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true, fog: false, toneMapped: false }));
      ic.scale.setScalar(0.001); ic.renderOrder = 9;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft(), color: 0xffe0a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      halo.renderOrder = 8;
      g.scene.add(halo, ic);
      e.icon = ic; e.halo = halo;
    }
    this.list.push(e);
    g.audio.play('crate', 0.9);
    return e;
  }

  // The power-up that is waiting for you nearest to p (within reach), if any.
  nearest(p, reach = 3.6) {
    let best = null, bd = reach;
    for (const e of this.list) {
      if (e.taken || e.t < 1.2) continue;
      const d = Math.hypot(e.c.x - p.pos.x, e.c.z - p.pos.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  take(e) { e.taken = true; e.takeT = e.t; }

  update(dt) {
    const g = this.game;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.t += dt;
      const t = e.t;
      // 0 - 0.45 s: the latch pops, the chest shudders, light leaks from the seam
      const shake = t < 0.45 ? Math.sin(t * 70) * 0.025 * (1 - t / 0.45) : 0;
      e.root.rotation.z = shake; e.root.position.y = e.c.y + Math.abs(shake) * 0.5;
      e.seamMat.opacity = t < 0.45 ? 0.5 + (t / 0.45) * 0.5 : Math.max(0, 1 - (t - 0.45) * 2);
      // 0.45 - 1.15 s: the lid swings back on its hinges to about 110 degrees, with a small bounce at the stop
      const k = Math.min(1, Math.max(0, (t - 0.45) / 0.7));
      e.hinge.rotation.x = -1.92 * easeOutBack(k);
      // light from inside, peaking as the lid clears, then a steady warm glow
      const glow = t < 0.45 ? 0 : t < 0.9 ? (t - 0.45) / 0.45 : Math.max(0.35, 1 - (t - 0.9) * 0.5);
      e.inner.material.opacity = glow * 0.9;
      e.sm.uniforms.uA.value = glow * (e.taken ? Math.max(0, 1 - (t - (e.takeT || t)) * 1.5) : 0.55);
      e.sm.uniforms.uT.value = t;
      if (t > 0.5 && t < 1.6) {
        e.sparkT -= dt;
        if (e.sparkT <= 0) {
          e.sparkT = 0.03;
          const p = new THREE.Vector3((Math.random() - 0.5) * 0.8, CHEST.h + 0.1, (Math.random() - 0.5) * 0.5).applyMatrix4(e.root.matrixWorld);
          g.fx.spark.emit({ p: [p.x, p.y, p.z], v: [(Math.random() - 0.5) * 2.5, 3 + Math.random() * 4, (Math.random() - 0.5) * 2.5], life: 1.2, s0: 0.14, s1: 0.03, c0: [1, 0.9, 0.5, 1], c1: [1, 0.6, 0.2, 0], g: 3 });
        }
      }
      if (t > 0.8 && t - dt <= 0.8) g.fx.glow.emit({ p: [e.c.x, e.c.y + 1.2, e.c.z], life: 0.5, s0: 2.5, s1: 4.5, c0: [1, 0.85, 0.5, 0.9], c1: [1, 0.6, 0.2, 0] });
      // the power-up rises out of the chest (from 0.8 s) and hovers, turning gently, until it's taken
      if (e.icon) {
        const rise = Math.min(1, Math.max(0, (t - 0.8) / 0.7)), re = 1 - Math.pow(1 - rise, 3);
        let y = e.c.y + CHEST.h + re * 1.35 + Math.sin(t * 2.4) * 0.08 * rise, s = 0.001 + re * 0.95;
        let fade = 1;
        if (e.taken) { const q = (t - e.takeT) / 0.35; fade = Math.max(0, 1 - q); s *= 1 + q * 0.8; y += q * 0.6; }
        e.icon.position.set(e.c.x, y, e.c.z); e.icon.scale.setScalar(s * (1 + Math.sin(t * 3.1) * 0.03)); e.icon.material.opacity = fade;
        e.halo.position.set(e.c.x, y, e.c.z); e.halo.scale.setScalar(s * 2.4); e.halo.material.opacity = 0.55 * re * fade * (0.85 + 0.15 * Math.sin(t * 5));
        if (e.taken && fade <= 0) { g.scene.remove(e.icon, e.halo); e.icon.material.map.dispose(); e.icon = null; }
      }
      // an opened chest stays open; it is just no longer lit once it's done
      if (e.taken && !e.icon && t - (e.takeT || 0) > 2) { e.inner.visible = false; e.done = true; }
    }
  }

  // Anything still waiting when the round ends is handed over rather than lost.
  clear(onUnclaimed) {
    for (const e of this.list) {
      if (!e.taken && e.pu && onUnclaimed) onUnclaimed(e.pu);
      this.game.scene.remove(e.root); if (e.icon) this.game.scene.remove(e.icon, e.halo);
    }
    this.list.length = 0;
  }
}
