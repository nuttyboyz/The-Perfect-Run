// Auto-guns: the Guardian Drone (tier-3 gear) that hovers at your shoulder, and the Turret Pack's sentry turret you
// plant on the ground. Both lock on to the nearest enemy within range and rake it with a fast gatling gun; no input
// needed. Teammates see yours too (presence dr / tr); their copy aims and flashes the same way, only yours deals damage.
import * as THREE from 'three';
import { DUEL } from './data.js';

export const DRONE = {
  range: 22,     // metres around the wearer that the drone watches
  rate: 0.075,   // seconds between rounds once spun up
  dmg: 5,        // per round, scaled by the wearer's damage stat
  hit: 0.82,     // chance a round connects (the rest streak past)
  spinUp: 0.3,   // seconds for the barrels to reach speed
  hover: [1.3, 2.0, 1.3], // where it sits: left of you, above head height, a little ahead
};
export const TURRET = {
  range: 38, rate: 0.045, dmg: 13, hit: 0.9, spinUp: 0.4,
  size: 2.7,     // the planted turret is a huge one
  life: 10,      // seconds it stays up
  cd: 9,         // seconds between drops (also the Turret Pack's reload)
};


let mats = null;
function materials() {
  if (mats) return mats;
  mats = {
    shell: new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.55, roughness: 0.5 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xe0581e, metalness: 0.3, roughness: 0.5 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x9aa1aa, metalness: 0.9, roughness: 0.3 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x111317, metalness: 0.4, roughness: 0.7 }),
    rotor: new THREE.MeshBasicMaterial({ color: 0x9aa4b0, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    blade: new THREE.MeshStandardMaterial({ color: 0x1c1e22, metalness: 0.3, roughness: 0.6 }),
    eye: new THREE.MeshBasicMaterial({ color: 0x38e0ff, toneMapped: false }),
    led: new THREE.MeshBasicMaterial({ color: 0xff5a1e, toneMapped: false }),
    olive: new THREE.MeshStandardMaterial({ color: 0x4e5a3a, metalness: 0.35, roughness: 0.6 }),
  };
  return mats;
}

// A gatling turret head: yaws and pitches toward the target; the barrel cluster spins inside a shroud.
// Returns the group (origin at the pivot); userData.gat is the spinning cluster, userData.muzzle the tip in gun space.
function makeGatling(m, scale = 1) {
  const gun = new THREE.Group(); gun.rotation.order = 'YXZ';
  const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.07, 12), m.dark); mount.position.set(0, 0.04, 0); gun.add(mount);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.14), m.shell); box.position.set(0, -0.01, -0.04); gun.add(box);
  const gat = new THREE.Group(); gat.position.set(0, -0.01, 0.1); gun.add(gat);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; const b = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.26, 8).rotateX(Math.PI / 2), m.steel); b.position.set(Math.cos(a) * 0.022, Math.sin(a) * 0.022, 0.1); gat.add(b); }
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.02, 12).rotateX(Math.PI / 2), m.dark); ring.position.set(0, 0, 0.16); gat.add(ring);
  const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.042, 0.1, 12).rotateX(Math.PI / 2), m.dark); shroud.position.set(0, -0.01, 0.06); gun.add(shroud);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.08), m.trim); belt.position.set(-0.065, -0.01, -0.04); gun.add(belt);
  gun.scale.setScalar(scale);
  gun.userData.gat = gat;
  gun.userData.muzzle = new THREE.Vector3(0, -0.01, 0.24);
  return gun;
}

// The drone: origin at the body centre, +z the way it faces. userData: rotors (spin), gun (aims).
export function makeDrone() {
  const m = materials();
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 12), m.shell); body.scale.set(1, 0.42, 1.35); g.add(body);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.016, 8, 28).rotateX(Math.PI / 2), m.trim); band.scale.set(1, 1, 1.35); g.add(band);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), m.eye); eye.position.set(0, 0.0, 0.25); g.add(eye);
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.06), m.dark); brow.position.set(0, 0.06, 0.22); g.add(brow);
  g.userData.rotors = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.3), m.shell);
    arm.position.set(sx * 0.21, 0.01, sz * 0.2); arm.rotation.y = Math.atan2(sx, sz); g.add(arm);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.06, 12), m.dark); hub.position.set(sx * 0.31, 0.035, sz * 0.3); g.add(hub);
    const rot = new THREE.Group(); rot.position.set(sx * 0.31, 0.07, sz * 0.3); g.add(rot);
    rot.add(new THREE.Mesh(new THREE.CircleGeometry(0.17, 20).rotateX(-Math.PI / 2), m.rotor));
    for (const a of [0, Math.PI / 2]) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.006, 0.03), m.blade); bl.rotation.y = a; rot.add(bl); }
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.008, 6, 24).rotateX(Math.PI / 2), m.trim); guard.position.set(sx * 0.31, 0.05, sz * 0.3); g.add(guard);
    g.userData.rotors.push(rot);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), m.led); led.position.set(sx * 0.31, 0.0, sz * 0.3); g.add(led);
  }
  const gun = makeGatling(m); gun.position.set(0, -0.11, 0.06); g.add(gun);
  g.userData.gun = gun;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// The sentry turret: a folding tripod, a column with an ammo drum and the gatling head on top. Origin at the feet.
export function makeTurret() {
  const m = materials();
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3 + Math.PI / 6;
    // Each leg runs from the hub down to its foot.
    const A = new THREE.Vector3(Math.sin(a) * 0.08, 0.54, Math.cos(a) * 0.08), B = new THREE.Vector3(Math.sin(a) * 0.46, 0.03, Math.cos(a) * 0.46);
    const d = B.clone().sub(A), len = d.length();
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, len, 8), m.shell);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); leg.position.copy(A).add(B).multiplyScalar(0.5); g.add(leg);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.03, 10), m.dark); foot.position.set(Math.sin(a) * 0.46, 0.015, Math.cos(a) * 0.46); g.add(foot);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.12, 14), m.dark); hub.position.y = 0.56; g.add(hub);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 12), m.steel); col.position.y = 0.76; g.add(col);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 16).rotateZ(Math.PI / 2), m.olive); drum.position.set(0, 0.74, -0.13); g.add(drum);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 20).rotateY(Math.PI / 2), m.trim); band.position.set(0, 0.74, -0.13); g.add(band);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), m.led); led.position.set(0, 0.68, 0.11); g.add(led);
  const gun = makeGatling(m, 1.4); gun.position.set(0, 0.96, 0); g.add(gun);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), m.eye); eye.position.set(0, 0.1, -0.02); gun.add(eye);
  g.userData.gun = gun;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

const _v = new THREE.Vector3(), _m = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3();
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Shared targeting and gunnery. `shooter` is true only for the owner's own game, which is the one that deals damage.
class Sentry {
  constructor(shooter, obj, P, game) {
    this.G = game; this.shooter = shooter; this.obj = obj; this.P = P; // the Game that owns it: a CPU or couch duel runs two Games in one page
    this.G.scene.add(obj);
    this.spin = 0; this.fireCd = 0; this.shotN = 0; this.acc = 0;
    this.targetId = null; this.retarget = 0; this.firing = false;
    this.gunYaw = 0; this.gunPitch = 0;
  }

  // Is a duel wall or block between this gun and the target? (Outside the Duel Arena there are no solids, so never.)
  blocked(t) {
    const w = this.G.world;
    if (!w || !w.solids.length) return false;
    const o = this.obj.position, oy = o.y + (this.eyeY || 0), dx = t.x - o.x, dy = t.y + t.h * 0.55 - oy, dz = t.z - o.z, d = Math.hypot(dx, dy, dz) || 1;
    if (w.rayBlock(o.x, oy, o.z, dx / d, dy / d, dz / d, d) < d - 0.5) return true;
    const r = this.G.terrainRay(_o.set(o.x, oy, o.z), _d.set(dx / d, dy / d, dz / d), d); // dune crests and mounds count too
    return r.hit && r.dist < d - 0.5;
  }

  // What this gun may aim at. A visual copy of the other duelist's sentry (shooter false) aims at the local fighter, not at its own owner.
  targetList() {
    const list = this.G.targets();
    const G = this.G, p = G.player;
    if (this.shooter || !G.duel) return list;
    const out = list.filter((q) => q.kind !== 'player');
    if (p && p.alive && G.phase === 'duel') out.push({ id: 'me', kind: 'player', x: p.pos.x, y: p.pos.y, z: p.pos.z, r: 0.55 * DUEL.size, h: 1.85 * DUEL.size });
    return out;
  }

  // Pick the nearest live thing within range of (cx, cz); a lock is kept until it leaves range or dies.
  pickTarget(dt, cx, cz) {
    const list = this.targetList();
    this.retarget -= dt;
    let t = null;
    if (this.targetId != null) t = list.find((q) => q.id === this.targetId) || null;
    if (t && (Math.hypot(t.x - cx, t.z - cz) > this.P.range * 1.15 || (t.kind === 'player' && this.blocked(t)))) t = null;
    if (!t || this.retarget <= 0) {
      this.retarget = 0.2;
      let best = t, bd = t ? Math.hypot(t.x - cx, t.z - cz) : this.P.range;
      for (const q of list) {
        if (q.kind === 'demon') continue; // the other duelist is fair game (targets() only lists them mid-duel)
        if (q.kind === 'player' && this.blocked(q)) continue; // ...unless duel cover is in the way
        const d = Math.hypot(q.x - cx, q.z - cz);
        if (d < bd) { bd = d; best = q; }
      }
      t = best; this.targetId = t ? t.id : null;
    }
    return t;
  }

  // Turn the gun onto the target (bodyYaw is what the gun's parent already faces), spin up, and fire at rate.
  gunnery(dt, t, bodyYaw) {
    const gun = this.obj.userData.gun;
    let wantYaw = 0, wantPitch = 0;
    if (t) {
      gun.getWorldPosition(_v);
      const ty = t.y + t.h * 0.55, dx = t.x - _v.x, dz = t.z - _v.z, dy = ty - _v.y;
      wantYaw = wrap(Math.atan2(dx, dz) - bodyYaw); wantPitch = -Math.atan2(dy, Math.hypot(dx, dz));
    }
    this.gunYaw += wrap(wantYaw - this.gunYaw) * Math.min(1, dt * 12);
    this.gunPitch += (wantPitch - this.gunPitch) * Math.min(1, dt * 12);
    gun.rotation.set(this.gunPitch, this.gunYaw, 0);
    this.spin += ((t ? 1 : 0) - this.spin) * Math.min(1, dt / this.P.spinUp);
    gun.userData.gat.rotation.z += this.spin * 45 * dt;
    this.firing = !!t && this.spin > 0.85;
    if (!this.firing) { this.fireCd = Math.min(this.fireCd, this.P.rate); return; }
    this.fireCd -= dt;
    this.obj.updateMatrixWorld(true);
    while (this.fireCd <= 0) { this.fireCd += this.P.rate; this.shoot(t, gun); }
  }

  shoot(t, gun) {
    const g = this.G, fx = g.fx, P = this.P;
    const n = ++this.shotN;
    const muz = _m.copy(gun.userData.muzzle).applyMatrix4(gun.matrixWorld);
    const aim = [t.x + (Math.random() - 0.5) * 0.5, t.y + t.h * (0.35 + Math.random() * 0.45), t.z + (Math.random() - 0.5) * 0.5];
    const dir = _v.set(aim[0] - muz.x, aim[1] - muz.y, aim[2] - muz.z).normalize();
    const hit = Math.random() < P.hit;
    const end = hit ? aim : [aim[0] + dir.x * 12 + (Math.random() - 0.5) * 3, aim[1] + dir.y * 12 + (Math.random() - 0.5) * 2, aim[2] + dir.z * 12 + (Math.random() - 0.5) * 3];
    fx.tracer([muz.x, muz.y, muz.z], end, [1, 0.8, 0.45]);
    if (n % 2 === 0) { fx.muzzle([muz.x, muz.y, muz.z], [dir.x, dir.y, dir.z], [1, 0.75, 0.45]); g.audio.play('shot_pdw', 0.4); }
    if (!hit) return;
    if (n % 2 === 0) fx.blood(aim, t.kind === 'boss' ? [0.3, 0.2, 0.05] : [0.35, 0.05, 0.08]);
    if (!this.shooter) return;
    const p = g.player, dmg = P.dmg * (p ? p.stats.dmg : 1);
    this.acc += dmg;
    const show = n % 4 === 0;
    g.damage(t, dmg, { at: aim, silent: true, silentNum: !show, shown: show ? this.acc : undefined, src: this.src, wf: g.player ? g.player.wf : 0 });
    if (show) this.acc = 0;
  }

  dispose() {
    this.obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); // the materials are shared, so only geometry goes
    this.G.scene.remove(this.obj);
  }
}

export class Drone extends Sentry {
  constructor(shooter, game) {
    super(shooter, makeDrone(), DRONE, game);
    this.obj.visible = false;
    this.pos = new THREE.Vector3(); this.placed = false;
    this.vel = new THREE.Vector3();
    this.t = Math.random() * 10;
  }

  // owner: { x, y, z, yaw }, feet position and facing. alive: whether the wearer is up.
  update(dt, owner, alive) {
    const o = this.obj;
    this.t += dt;
    o.visible = !!alive;
    if (!alive) { this.firing = false; return; }
    // Hover beside the wearer with a lazy spring and a slow bob.
    const [hx, hy, hz] = DRONE.hover, sy = Math.sin(owner.yaw), cy = Math.cos(owner.yaw);
    _v.set(owner.x + cy * hx + sy * hz, owner.y + hy + Math.sin(this.t * 1.7) * 0.08, owner.z - sy * hx + cy * hz);
    if (!this.placed) { this.pos.copy(_v); this.placed = true; }
    const k = Math.min(1, dt * 5);
    this.vel.lerp(_m.subVectors(_v, this.pos).multiplyScalar(5), k);
    this.pos.addScaledVector(this.vel, dt);
    const gy = this.G.world.heightAt(this.pos.x, this.pos.z) + 0.6;
    if (this.pos.y < gy) this.pos.y = gy;
    o.position.copy(this.pos);
    // Body faces the wearer's way, leaning into its own motion; rotors always turn.
    const lean = Math.min(0.35, this.vel.length() * 0.06);
    o.rotation.set(0, owner.yaw, 0);
    o.rotateX(this.vel.z * cy + this.vel.x * sy > 0 ? lean : -lean * 0.5);
    o.rotateZ(-(this.vel.x * cy - this.vel.z * sy) * 0.06);
    for (const r of o.userData.rotors) r.rotation.y += dt * 55;
    const t = this.pickTarget(dt, owner.x, owner.z); // watches the space around the wearer, not around itself
    this.gunnery(dt, t, owner.yaw);
  }
}

export class Turret extends Sentry {
  constructor(shooter, x, y, z, yaw, game) {
    super(shooter, makeTurret(), TURRET, game);
    this.src = 'turret'; // kills it lands count toward the Guardian Drone unlock
    this.eyeY = TURRET.size * 0.96; // gun height, for the line-of-sight test
    this.obj.position.set(x, y, z); this.obj.rotation.y = yaw;
    this.yaw = yaw; this.life = TURRET.life; this.t = 0;
    this.G.fx.dustBurst([x, y, z], 0.7);
  }

  // Returns false once its time is up (the owner then disposes it).
  update(dt) {
    this.t += dt; this.life -= dt;
    const s = Math.min(1, this.t * 3); // unfolds over the first third of a second
    this.obj.scale.set(TURRET.size, TURRET.size * (0.2 + 0.8 * s), TURRET.size);
    if (this.life <= 0) { this.firing = false; return false; }
    const p = this.obj.position;
    const t = this.pickTarget(dt, p.x, p.z);
    this.gunnery(dt, t, this.yaw);
    return true;
  }

  dispose() { this.G.fx.dustBurst([this.obj.position.x, this.obj.position.y, this.obj.position.z], 0.6); super.dispose(); }
}
