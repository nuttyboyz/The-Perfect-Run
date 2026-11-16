// The Alien Blaster's shot (Halo): a medium ball of dark purple plasma that flies from the muzzle to where it hits,
// with a slightly lighter purple trail behind it and a small burst where it lands.
//  - PlasmaShots: a pool for the players' shots (the hit itself is decided at once; this is what you see fly).
//  - plasmaBody(): one such ball as a model, flown by Elements.orb for The Visitor's own shots.
import * as THREE from 'three';

const DARK = 0x35106e, MID = 0x6a3cc4, LIGHT = 0x9a78ee;
let GEO = null, MAT = null;

function softTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function shared() {
  if (GEO) return;
  // The ball: a dark heart with a thin brighter skin, so it reads as dark purple against sky and ground alike.
  const core = new THREE.IcosahedronGeometry(0.1, 2);
  const skin = new THREE.IcosahedronGeometry(0.135, 2);
  // The trail: a long teardrop that fades to nothing at its tail (alpha in the vertex colours).
  const trail = new THREE.CylinderGeometry(0.004, 0.105, 1, 12, 6, true).rotateX(-Math.PI / 2).translate(0, 0, -0.5); /* wide end at the ball (z 0), tip 1 behind it */
  const P = trail.attributes.position, col = new Float32Array(P.count * 4);
  for (let i = 0; i < P.count; i++) { const k = 1 + P.getZ(i); col[i * 4] = 1; col[i * 4 + 1] = 1; col[i * 4 + 2] = 1; col[i * 4 + 3] = k * k * 0.75; }
  trail.setAttribute('color', new THREE.BufferAttribute(col, 4));
  GEO = { core, skin, trail };
  MAT = {
    core: new THREE.MeshBasicMaterial({ color: DARK, toneMapped: false, fog: false }),
    skin: new THREE.MeshBasicMaterial({ color: MID, transparent: true, opacity: 0.42, depthWrite: false, toneMapped: false, fog: false, side: THREE.BackSide }),
    trail: new THREE.MeshBasicMaterial({ color: LIGHT, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide }),
    halo: new THREE.SpriteMaterial({ map: softTexture(), color: MID, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false, fog: false, blending: THREE.AdditiveBlending }),
  };
}

// One ball, pointing along +z, its trail streaming out behind. userData.trail is the trail (scale.z = its length in metres).
export function plasmaBall(size = 1) {
  shared();
  const g = new THREE.Group();
  const core = new THREE.Mesh(GEO.core, MAT.core), skin = new THREE.Mesh(GEO.skin, MAT.skin), trail = new THREE.Mesh(GEO.trail, MAT.trail), halo = new THREE.Sprite(MAT.halo);
  halo.scale.setScalar(0.55); trail.scale.set(1, 1, 1.6);
  for (const o of [core, skin, trail, halo]) { o.frustumCulled = false; o.renderOrder = 6; }
  g.add(trail, skin, core, halo); g.scale.setScalar(size); g.userData.trail = trail; g.userData.core = core;
  return g;
}

// A ball for Elements.orb's `body`: { mesh, done }.
export function plasmaBody(scene, size = 1.5) {
  const pool = plasmaBody.pool || (plasmaBody.pool = []);
  const mesh = pool.pop() || plasmaBall(1); mesh.scale.setScalar(size); mesh.userData.trail.scale.z = 2.2; mesh.visible = true; scene.add(mesh);
  return { mesh, done: () => { mesh.visible = false; scene.remove(mesh); pool.push(mesh); } };
}

const SPEED = 95, MAXN = 28;
export class PlasmaShots {
  constructor(scene) { this.scene = scene; this.live = []; this.free = []; this.onLand = null; }
  // a: muzzle, b: where it hits. size 1 = medium (about 20 cm across).
  shot(a, b, size = 1) {
    const A = new THREE.Vector3(a[0], a[1], a[2]), B = new THREE.Vector3(b[0], b[1], b[2]), dir = B.clone().sub(A), len = dir.length();
    if (len < 0.4) return; dir.divideScalar(len);
    if (this.live.length >= MAXN) this.retire(0);
    const m = this.free.pop() || plasmaBall(1); m.scale.setScalar(size); m.visible = true; this.scene.add(m);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); m.position.copy(A).addScaledVector(dir, 0.25);
    this.live.push({ m, A, dir, len, d: 0.25, t: Math.random() * 6 });
  }
  retire(i) { const s = this.live[i]; s.m.visible = false; this.scene.remove(s.m); this.free.push(s.m); this.live.splice(i, 1); }
  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const s = this.live[i]; s.d += SPEED * dt; s.t += dt;
      if (s.d >= s.len) { if (this.onLand) this.onLand(s.A.clone().addScaledVector(s.dir, s.len)); this.retire(i); continue; }
      s.m.position.copy(s.A).addScaledVector(s.dir, s.d);
      const pulse = 1 + Math.sin(s.t * 38) * 0.07; s.m.userData.core.scale.setScalar(pulse);
      s.m.userData.trail.scale.z = Math.min(2.4, s.d * 0.9) / s.m.scale.x; /* the trail grows out of the muzzle, never reaching back past it */
    }
  }
}
