// Client-side views of networked things: other players, mobs, bosses, the
// demon and NPCs. They interpolate toward the latest snapshot.
import { PERF } from './perf.js';
import { makeRiderBoard, RiderAnim, unpackBoard } from './skate.js';
import { animateWeapon, makeWeapon } from './weapons.js';
import * as THREE from 'three';
import { MOBS, MOB_TYPES, MOB_ARM_IDS, armedBase, BOSSES, NPCS, NPC_TYPES, CLASS_BY_ID, WEAPON_BY_ID, MINI, ELITE } from './data.js';
import { makeHumanoid, makeMob, makeBoss, makeDemon, makeNameplate } from './models.js';
import { makeCharacterModel, flushSwipes, setCharacterScale, STEP_KIND, stepAccum } from './characters.js';
import { makeMobRig, MOB_LOOKS, makeVikingAxe } from './mobrig.js';
import { muOn, LOWGRAV, BIG_HEAD, HEAD_SCALE } from './mutators.js';
import { makeOrbitBlades, makeFireRing, auraRadius } from './duelfx.js';
import { makeJetpack, jetFx } from './jetpack.js';
import { makeWings, setWings } from './wings.js';
import { Drone, Turret } from './drone.js';
import * as thermes from './thermes.js';
import { CHAR_BY_ID } from './characters.js';

const lerpA = (a, b, t) => { const d = Math.atan2(Math.sin(b - a), Math.cos(b - a)); return a + d * t; };

const barGeo = new THREE.PlaneGeometry(1, 0.1);
const barBg = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthTest: false });
const barFg = new THREE.MeshBasicMaterial({ color: 0xff3a3a, depthTest: false });
const barFgMini = new THREE.MeshBasicMaterial({ color: 0xffc233, depthTest: false });
const barFgEcho = new THREE.MeshBasicMaterial({ color: 0xc070ff, depthTest: false });
const barFgNpc = new THREE.MeshBasicMaterial({ color: 0x5aff7a, depthTest: false });

function hpBar(width, fgMat = barFg) {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(barGeo, barBg);
  bg.scale.set(width + 0.06, 1.6, 1);
  const fg = new THREE.Mesh(barGeo, fgMat);
  fg.scale.x = width;
  fg.position.z = 0.001;
  bg.renderOrder = fg.renderOrder = 9;
  g.add(bg, fg);
  g.userData = { fg, width };
  g.visible = false;
  return g;
}
function setBar(bar, frac, camera, always) {
  bar.visible = always || frac < 0.999;
  if (!bar.visible) return;
  const w = bar.userData.width;
  bar.userData.fg.scale.x = Math.max(0.001, w * frac);
  bar.userData.fg.position.x = -(w - w * frac) / 2;
  bar.quaternion.copy(camera.quaternion);
}

export class RemotePlayerView {
  constructor(scene, id, p) {
    this.scene = scene;
    this.id = id;
    this.cls = CLASS_BY_ID[p.c] || CLASS_BY_ID.pyre;
    this.model = makeCharacterModel(p.ch || 'veteran', () => makeHumanoid({ color: this.cls.color, accent: this.cls.accent, hood: p.c === 'pyre' || p.c === 'gale' }), p.sk);
    this.plate = makeNameplate(String(p.n || 'Player').slice(0, 16), this.cls.css);
    this.plate.position.y = 2.35;
    this.plate.visible = false; // the DOM ally tag (src/allytags.js) replaces it
    this.model.add(this.plate);
    this.boardObj = makeRiderBoard();
    this.model.add(this.boardObj);
    this.rider = new RiderAnim();
    this.rb = { h: 0, s: 0, lean: 0, pushT: -1, brake: false, air: false, ollieN: 0, kick: 0, aimT: 0, ci: 0 };
    // The jetpack (Perfect Shop) shows on a teammate's back while they have it equipped (presence jp), jets lit when flying.
    const def = CHAR_BY_ID[p.ch] || {};
    this.pack = makeJetpack();
    this.pack.position.set(0, (def.height || 1.8) * 0.7, -(def.packZ ?? 0.2));
    this.pack.visible = false;
    this.model.add(this.pack);
    this.wings = makeWings(); // Wings (gear) show on the back too: presence jp 3 idle, 4 soaring, 5 flapping
    this.wings.position.set(0, (def.height || 1.8) * 0.74, -(def.packZ ?? 0.2) + 0.02);
    this.wings.visible = false; this.wingSpread = 0;
    this.model.add(this.wings);
    this.jetLevel = 0;
    scene.add(this.model);
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.yaw = 0;
    this.init = false;
    this.t = Math.random() * 10;
    this.shieldWas = 0;
  }
  update(p, dt, camera, fx) {
    this.t += dt;
    if (Array.isArray(p.p)) this.target.set(p.p[0] / 10, p.p[1] / 10, p.p[2] / 10);
    if (!this.init) { this.pos.copy(this.target); this.init = true; }
    if (this.pos.distanceTo(this.target) > 12) this.pos.copy(this.target);
    else this.pos.lerp(this.target, Math.min(1, dt * 14));
    this.yaw = lerpA(this.yaw, (p.ry || 0) / 100, Math.min(1, dt * 14));
    this.pitch = (p.pt || 0) / 100;
    this.model.position.copy(this.pos);
    this.model.rotation.y = this.yaw;
    setCharacterScale(this.model, this.size || 1); // duel fighters are drawn larger (game sets size)
    const riding = p.sb > 0 && p.al;
    this.boardObj.visible = !!riding;
    if (riding) {
      // Sideways skater stance, same pose code as the local player; teammates send heading, lean and a packed state.
      const rb = unpackBoard(this.rb, p), fire = p.ml || p.ct;
      if (this.boardObj.userData.ci !== rb.ci) this.boardObj.userData.setColor(rb.ci);
      if (fire) rb.aimT = 1;
      const dy = this.prevY === undefined ? 0 : (this.pos.y - this.prevY) / Math.max(dt, 1e-3);
      this.vyEst = (this.vyEst || 0) + (dy - (this.vyEst || 0)) * Math.min(1, dt * 10);
      const pitch = rb.air ? 0 : -Math.atan(THREE.MathUtils.clamp(this.vyEst / Math.max(rb.s, 2), -0.6, 0.6));
      this.slopeP = (this.slopeP || 0) + (pitch - (this.slopeP || 0)) * Math.min(1, dt * 6);
      this.rider.pre(this.model, this.boardObj, rb, dt, { pos: this.pos, yaw: this.yaw, fp: false, tilt: { pitch: this.slopeP, roll: 0 }, vy: this.vyEst });
    } else {
      this.model.rotation.set(0, this.yaw, 0);
      this.rider.reset();
    }
    this.prevY = this.pos.y;
    if (p.ml && !this.mlT) { this.mlT = 0.001; this.mlMv = p.mv | 0; }
    if (this.mlT) { this.mlT += dt * 1.8; if (this.mlT >= 1) { this.mlT = p.ml ? 0.001 : 0; this.mlMv = p.mv | 0; } }
    const w = Array.isArray(p.wp) ? p.wp[p.wi || 0] : null;
    if (w && WEAPON_BY_ID[w]) this.model.userData.setWeapon(WEAPON_BY_ID[w].kind === 'gear' ? 'bare' : w); // an all-gear loadout fights bare-handed
    // Web Swing: the anchor of the line they hang from (presence sw, tenths of a metre); the left arm reaches for it.
    const sw = Array.isArray(p.sw) && p.sw.length === 3 ? [p.sw[0] / 10, p.sw[1] / 10, p.sw[2] / 10] : null;
    this.model.userData.anim({ speed: riding ? 0 : (p.sp || 0) / 10, pitch: (p.pt || 0) / 100, gun: true, reload: !p.gn && WEAPON_BY_ID[w] && WEAPON_BY_ID[w].kind === 'gun', weapon: true, melee: this.mlT || 0, move: this.mlMv | 0, arc: WEAPON_BY_ID[w] && WEAPON_BY_ID[w].arc, cast: p.ct ? 1 : 0, dead: !p.al, swing: sw, eyes: p.ey > 0, eyeGlow: p.ey === 2 ? 1 : 0.45 }, dt, this.t);
    if (fx) flushSwipes(this.model, fx);
    const rig = this.model.userData.rig;
    if (sw && fx && p.al) fx.webLine('r' + this.id, rig ? rig.handWorld('Left') : [this.pos.x, this.pos.y + 1.6, this.pos.z], sw);
    // Jetpack on the back: shown while equipped, flames while they fly (jp 2).
    const jp = p.jp | 0;
    this.pack.visible = jp > 0 && jp < 3 && !!p.al;
    this.wings.visible = jp >= 3 && !!p.al;
    if (this.wings.visible) {
      this.wingSpread += ((jp === 4 ? 1 : jp === 5 ? 0.8 : 0) - this.wingSpread) * Math.min(1, dt * 9);
      setWings(this.wings, this.wingSpread, jp === 5 ? Math.sin(this.t * 22) : 0);
    }
    this.jetLevel += ((jp === 2 ? 1 : 0) - this.jetLevel) * Math.min(1, dt * 8);
    if (fx) jetFx(this.pack, this.pack.visible ? this.jetLevel : 0, fx, dt, this.t);
    // Guardian Drone at a teammate's shoulder (presence dr): this copy aims and flashes but deals no damage.
    if ((p.dr | 0) > 0 && !this.drone) this.drone = new Drone(false, this.game);
    if (this.drone) this.drone.update(dt, { x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw }, (p.dr | 0) > 0 && !!p.al);
    // A teammate's planted turret (presence tr: position and facing): shown while they report it, aiming and flashing, no damage.
    const tr = Array.isArray(p.tr) && p.tr.length === 4 ? p.tr : null;
    if (tr && (!this.turret || Math.hypot(this.turret.obj.position.x - tr[0] / 10, this.turret.obj.position.z - tr[2] / 10) > 0.5)) {
      if (this.turret) this.turret.dispose();
      this.turret = new Turret(false, tr[0] / 10, tr[1] / 10, tr[2] / 10, tr[3] / 100, this.game);
    }
    if (!tr && this.turret) { this.turret.dispose(); this.turret = null; }
    if (this.turret) { this.turret.life = 99; this.turret.update(dt); }
    if (riding) this.rider.post(this.model);
    animateWeapon(this.model.userData.weapon, (p.sn || 0) / 100, dt, !!p.gn); // teammate's minigun rotor, rocket / bolt shown while loaded
    // Quiet footsteps for teammates, softer with distance.
    if (this.audio && p.al && !riding) {
      const cd = Math.hypot(camera.position.x - this.pos.x, camera.position.z - this.pos.z);
      this.stepAcc = stepAccum(this.stepAcc || 0, dt, (p.sp || 0) / 10, true, (vv) => this.audio.footstep(STEP_KIND[p.ch] || 'boot', vv * 0.8 * Math.max(0, 1 - cd / 28)));
    }
    this.dead = !p.al;
    this.specials(p, dt);
    this.alive = !!p.al && !p.out;
    this.hp = p.hp || 0; this.mh = p.mh || 1; this.name = String(p.n || 'Player');
    this.model.visible = (!p.out || !!p.al) && !this.mist && !this.ball && !this.spirit; // Cloud Form: only the mist shows. Snowball: the runner is inside it
  }
  // Orbiting blades and the fire ring of a power-up the other fighter holds.
  specials(p, dt) {
    const ob = p.ob | 0, au = p.au | 0;
    if (ob > 0) {
      if (!this.orbit || this.orbit.userData.n !== ob) { if (this.orbit) this.scene.remove(this.orbit); this.orbit = makeOrbitBlades(ob, this.cls.color); this.scene.add(this.orbit); }
      this.orbit.position.set(this.pos.x, this.pos.y + 1.0, this.pos.z);
      this.orbit.rotation.y += dt * 3.4;
    } else if (this.orbit) { this.scene.remove(this.orbit); this.orbit = null; }
    if (au > 0) {
      if (!this.ring) { this.ring = makeFireRing(); this.scene.add(this.ring); }
      this.ring.position.set(this.pos.x, this.pos.y + 0.02, this.pos.z);
      this.ring.userData.set(auraRadius(au), au, this.t);
    } else if (this.ring) { this.scene.remove(this.ring); this.ring = null; }
  }
  dispose() {
    this.scene.remove(this.model);
    if (this.orbit) this.scene.remove(this.orbit);
    if (this.ring) this.scene.remove(this.ring);
    if (this.drone) { this.drone.dispose(); this.drone = null; } // a teammate's / the opponent's sentries leave with them (rematch, round load)
    if (this.turret) { this.turret.dispose(); this.turret = null; }
  }
}

const _dir = new THREE.Vector3();
export class MobView {
  constructor(scene, row, tint) {
    this.scene = scene;
    this.id = row[0];
    this.type = MOB_TYPES[row[1]];
    this.wi = row[11] | 0; // the weapon it carries (MOB_ARM_IDS index + 1)
    this.base = armedBase(this.type, this.wi);
    this.rig = makeMobRig(this.wi ? this.type + '@' + MOB_ARM_IDS[this.wi - 1] : this.type);
    if (this.rig) {
      this.model = this.rig.root;
      this.vh = MOB_LOOKS[this.type].h + (MOB_LOOKS[this.type].float || 0);
    } else {
      this.model = makeMob(this.type, tint);
      this.model.scale.setScalar(this.base.scale);
      this.vh = this.base.height * this.base.scale;
    }
    this.mini = !!row[9];
    if (this.mini) { this.model.scale.multiplyScalar(MINI.size); this.vh *= MINI.size; }
    this.elite = ELITE.kinds[row[10] | 0] || null; // elite modifier: a coloured aura, a little bigger
    if (this.elite && !this.mini) { this.model.scale.multiplyScalar(1.18); this.vh *= 1.18; }
    const s = this.model.scale.x;
    this.echo = this.type.startsWith('echo'); // a boss team mate: its health bar always shows
    this.bar = hpBar(this.base.radius * 1.8 * (this.mini ? MINI.size : this.echo ? 1.7 : 1), this.mini ? barFgMini : this.echo ? barFgEcho : barFg);
    if (this.echo) this.bar.scale.y = 1.8;
    this.bar.position.y = (this.vh + 0.35) / s;
    this.model.add(this.bar);
    this.bar.scale.setScalar(1 / s);
    scene.add(this.model);
    this.x = row[2] / 10; this.z = row[3] / 10; this.y = 0;
    this.fly = !!this.base.fly;
    this.air = this.fly || !!this.base.leap; // follows the height the host sends (flyers, and pouncers mid-leap)
    this.look = MOB_LOOKS[this.type] || {};
    this.fy = this.tfy = (row[8] || 0) / 10;
    this.fvy = 0;
    this.tx = this.x; this.tz = this.z;
    this.yaw = row[6] / 10;
    this.t = Math.random() * 10;
    this.phase = Math.random() * 6;
    this.hp = row[4] / 100;
    this.lastHp = this.hp;
    this.flags = 0;
    this.anim = 0;
    this.spawnT = 0;
  }
  apply(row) {
    this.tx = row[2] / 10; this.tz = row[3] / 10;
    this.hp = row[4] / 100;
    this.flags = row[5];
    this.tyaw = row[6] / 10;
    this.anim = Math.max(this.anim, row[7] / 9);
    this.tfy = (row[8] || 0) / 10;
  }
  update(dt, world, camera, fx) {
    this.t += dt;
    this.spawnT += dt;
    const ox = this.x, oz = this.z, oy = this.y;
    const k = Math.min(1, dt * 10);
    this.x += (this.tx - this.x) * k;
    this.z += (this.tz - this.z) * k;
    const speed = Math.hypot(this.x - ox, this.z - oz) / Math.max(dt, 1e-3);
    this.ground = world.heightAt(this.x, this.z);
    const air = this.air || this.tfy > 0 || this.fy > 0.01; // hurled ground mobs ride the host's height too
    if (air) this.fy += (this.tfy - this.fy) * Math.min(1, dt * (this.fly ? 8 : 16));
    this.y = this.ground + (air ? this.fy : 0);
    this.yaw = lerpA(this.yaw, this.tyaw ?? this.yaw, Math.min(1, dt * 10));
    const rise = this.fly ? 1 : Math.min(1, this.spawnT / 0.6);
    const fl = this.rig ? (MOB_LOOKS[this.type].float || 0) : 0;
    const bob = fl ? Math.sin(this.t * 2 + this.phase) * 0.12 : 0;
    this.model.position.set(this.x, this.y + fl + bob - (1 - rise) * 1.8, this.z);
    this.model.rotation.y = this.yaw;
    this.anim = Math.max(0, this.anim - dt * 3);
    // Held still by ice.
    const frozen = this.flags & 1 ? 1 : 0;
    const hit = this.hp < this.lastHp - 1e-4; this.lastHp = this.hp;
    // Staggered (flag 32): the body stops dead and jolts; the rig gets a heavier flinch the moment it starts.
    const stag = (this.flags & 32) !== 0, stagStart = stag && !this.stagWas; this.stagWas = stag;
    if (this.rig) {
      const dx = this.x - camera.position.x, dz = this.z - camera.position.z, d = Math.hypot(dx, dz);
      camera.getWorldDirection(_dir);
      const behind = d > 4 && (dx * _dir.x + dz * _dir.z) / d < -0.2;
      const far = behind ? 0.2 : d < 16 ? 0 : d < 36 ? 0.05 : 0.12;
      if (this.rig.setLod) this.rig.setLod(d);
      const st = { speed: frozen || stag ? 0 : speed, attack: this.anim, frozen, hit, stagger: stagStart };
      if (this.fly) {
        // Wing beat and body pitch follow the climb or dive.
        const vy = (this.y - oy) / Math.max(dt, 1e-3);
        st.vy = vy; st.frozen = frozen;
        st.pitch = THREE.MathUtils.clamp(Math.atan2(-vy, Math.max(speed, 1.5)) * 0.8 + 0.12, -0.7, 1.0);
      }
      this.rig.update(st, dt, far);
    } else this.model.userData.anim({ speed: frozen || stag ? 0 : speed, attack: this.anim, phase: this.phase, frozen }, frozen ? 0 : dt, this.t);
    // Every enemy shows its health once you are close enough; hurt ones stay visible from further away, champions always.
    const bd = Math.hypot(this.x - camera.position.x, this.z - camera.position.z);
    // Only enemies near the camera cast shadows (the frame-rate governor sets how near).
    const shad = bd < PERF.mobShadow;
    if (shad !== this.shad) {
      if (!this.shMeshes) { this.shMeshes = []; this.model.traverse((o) => { if (o.isMesh && o.castShadow) this.shMeshes.push(o); }); }
      this.shad = shad;
      for (const o of this.shMeshes) o.castShadow = shad;
    }
    this.bar.position.y = (this.vh * (muOn(BIG_HEAD) && this.rig ? 1.22 : 1) + 0.35) / this.model.scale.x; // clear of a Big Head
    setBar(this.bar, this.hp, camera, this.mini || this.echo || bd < 30 || (this.hp < 0.999 && bd < 55));
    if (this.mini) {
      if (Math.random() < 0.18) fx.glow.emit({ p: [this.x + (Math.random() - 0.5) * 2, this.y + 0.1, this.z + (Math.random() - 0.5) * 2], v: [0, 1.4, 0], life: 0.8, s0: 0.9, s1: 0.2, c0: [1, 0.8, 0.3, 0.5], c1: [1, 0.55, 0.1, 0] });
    }
    const H = this.vh;
    if (this.elite && bd < 70) {
      const c = this.elite.color, sh = this.flags & 64;
      if (Math.random() < 0.55) fx.glow.emit({ p: [this.x + (Math.random() - 0.5) * 1.0, this.y + Math.random() * H, this.z + (Math.random() - 0.5) * 1.0], v: [0, 1.0, 0], life: 0.55, s0: 0.7, s1: 0.15, c0: [c[0], c[1], c[2], 0.85], c1: [c[0], c[1], c[2], 0] });
      fx.glow.emit({ p: [this.x, this.y + H * 0.55, this.z], life: 0.06, s0: H * (sh ? 2.1 : 1.5), s1: H * (sh ? 2.1 : 1.5), c0: [c[0], c[1], c[2], sh ? 0.3 : 0.16], c1: [c[0], c[1], c[2], sh ? 0.25 : 0.1] }); // a halo you can spot from far away
    }
    // Ability wind-up (bit 8: bomber fuse, pouncer crouch, necromancer cast, archer aim, ogre smash) and per-type ambience.
    const L = this.look;
    if (bd < 55) {
      if (this.flags & 8 && L.tele) {
        const c = L.tele;
        for (let i = 0; i < 2; i++) fx.glow.emit({ p: [this.x + (Math.random() - 0.5) * 0.9, this.y + Math.random() * H, this.z + (Math.random() - 0.5) * 0.9], v: [0, 1.5, 0], life: 0.35, s0: 0.7, s1: 0.1, c0: [c[0], c[1], c[2], 0.9], c1: [c[0], c[1], c[2], 0] });
        if (Math.random() < 0.12) fx.glow.emit({ p: [this.x, this.y + H * 0.6, this.z], life: 0.12, s0: H * 1.6, s1: H * 1.2, c0: [c[0], c[1], c[2], 0.35], c1: [c[0], c[1], c[2], 0] });
      }
      if (L.aura && Math.random() < 0.3) {
        const px = this.x + (Math.random() - 0.5) * 0.8, pz = this.z + (Math.random() - 0.5) * 0.8;
        if (L.aura === 'fire') fx.fire.emit({ p: [px, this.y + Math.random() * H, pz], v: [0, 1.8, 0], life: 0.5, s0: 0.55, s1: 0.1, c0: [1, 0.6, 0.15, 0.9], c1: [0.8, 0.1, 0, 0], turb: 3 });
        else if (L.aura === 'poison') fx.glow.emit({ p: [px, this.y + H * (0.2 + Math.random() * 0.5), pz], v: [0, -0.5, 0], life: 0.7, s0: 0.3, s1: 0.1, c0: [0.5, 1, 0.15, 0.8], c1: [0.4, 0.8, 0.1, 0] });
        else if (L.aura === 'wisp') fx.glow.emit({ p: [px, this.y + Math.random() * H, pz], v: [0, 0.9, 0], life: 1.0, s0: 0.4, s1: 0.1, c0: [0.3, 1, 0.6, 0.6], c1: [0.2, 0.9, 0.5, 0] });
        else if (L.aura === 'spark') fx.glow.emit({ p: [this.x, this.y + H * 0.95, this.z], v: [(Math.random() - 0.5) * 2, 2.5, (Math.random() - 0.5) * 2], life: 0.3, s0: 0.25, s1: 0.05, c0: [1, 0.8, 0.3, 1], c1: [1, 0.3, 0, 0] });
      }
    }
    if (this.flags & 2 && Math.random() < 0.5) fx.fire.emit({ p: [this.x + (Math.random() - 0.5) * 0.6, this.y + Math.random() * H, this.z + (Math.random() - 0.5) * 0.6], v: [0, 2.5, 0], life: 0.4, s0: 0.7, s1: 0.2, c0: [1, 0.8, 0.4, 1], c1: [1, 0.2, 0, 0], turb: 4 });
    if (this.flags & 1 && Math.random() < 0.4) fx.shard.emit({ p: [this.x + (Math.random() - 0.5) * 0.8, this.y + Math.random() * H, this.z + (Math.random() - 0.5) * 0.8], v: [0, 0.3, 0], life: 0.6, s0: 0.35, s1: 0.1, c0: [0.8, 0.95, 1, 1], c1: [0.6, 0.85, 1, 0] });
    else if (this.flags & 4 && Math.random() < 0.2) fx.glow.emit({ p: [this.x, this.y + 0.3, this.z], v: [0, 0.4, 0], life: 0.6, s0: 1.2, s1: 1.6, c0: [0.6, 0.85, 1, 0.3], c1: [0.6, 0.85, 1, 0] });
  }
  target() {
    if (muOn(BIG_HEAD)) return { id: this.id, kind: 'mob', x: this.x, y: this.y, z: this.z, r: this.base.radius, h: this.vh * 1.17, big: 1, view: this }; // the swollen head sticks up above the body
    return { id: this.id, kind: 'mob', x: this.x, y: this.y, z: this.z, r: this.base.radius, h: this.vh, view: this };
  }
  // Killed: play the fall, then remove. Returns false when finished.
  dying(dt) {
    if (!this.rig) return false;
    this.bar.visible = false;
    // Necromancer: the body only drops; the risen thrall takes its place once it is down.
    if (this.risen && this.rig.dieT > 0.5) return false;
    // Low Gravity: once it has toppled, the body drifts up off the ground, turning slowly, and dwindles away.
    if (muOn(LOWGRAV) && this.rig.dieT > 0.35) {
      const t = this.rig.dieT - 0.35;
      this.model.position.y += dt * (0.5 + t * 0.35);
      this.model.rotation.y += dt * 0.5;
      if (t > 2.4) { const k = Math.max(0.001, 1 - (t - 2.4) / 0.8); this.model.scale.setScalar(this.s0 * k); if (k <= 0.001) return false; }
      else this.s0 = this.model.scale.x;
      this.rig.die(dt);
      return true;
    }
    if (this.air && this.fy > 0) {
      // A shot flyer drops out of the sky before it settles.
      this.fvy += 22 * dt;
      this.fy = Math.max(0, this.fy - this.fvy * dt);
      this.model.position.y = this.ground + this.fy;
    }
    return this.rig.die(dt);
  }
  dispose() { this.scene.remove(this.model); if (this.drone) this.drone.dispose(); if (this.turret) this.turret.dispose(); }
}

// Turn a bone so the line from it to its child points along a world direction (used to aim the Visitor's gun arm).
const AIM_V = new THREE.Vector3(), AIM_A = new THREE.Vector3(), AIM_C = new THREE.Vector3(), AIM_Q = new THREE.Quaternion(), AIM_W = new THREE.Quaternion(), AIM_P = new THREE.Quaternion();
const AXE_CURL = [0.7, 2.0, 3.2], AXE_THUMB = [[0.3, 0.9, 0.3], [0, 0.8, -0.6], [-0.5, 0.3, -0.8]], AXE_A = new THREE.Vector3(), AXE_B = new THREE.Vector3(), AXE_C = new THREE.Vector3();
const GUN_S = 7, GRIP_FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'], GRIP_CURL = [0.9, 1.5, 1.2];
const GRIP_U = new THREE.Vector3(), GRIP_L = new THREE.Vector3(), GRIP_W = new THREE.Vector3(), GRIP_1 = new THREE.Vector3(), GRIP_2 = new THREE.Vector3(), GRIP_3 = new THREE.Vector3(), GRIP_D = new THREE.Vector3(), GRIP_MA = new THREE.Matrix4(), GRIP_MB = new THREE.Matrix4();
function aimBone(bone, child, dir) {
  bone.updateWorldMatrix(true, true);
  bone.getWorldPosition(AIM_A); child.getWorldPosition(AIM_C).sub(AIM_A).normalize();
  AIM_Q.setFromUnitVectors(AIM_C, dir);
  bone.getWorldQuaternion(AIM_W).premultiply(AIM_Q);
  bone.parent.getWorldQuaternion(AIM_P).invert();
  bone.quaternion.copy(AIM_P.multiply(AIM_W));
  bone.updateWorldMatrix(false, true);
}

export class BossView {
  constructor(scene, row) {
    this.scene = scene;
    this.idx = row[0];
    this.def = BOSSES[this.idx];
    this.rig = makeMobRig('boss' + this.idx);
    this.model = this.rig ? this.rig.root : makeBoss(this.idx, this.def);
    scene.add(this.model);
    if (this.idx === 6) { this.axe = makeVikingAxe(); this.axeW = -0.7; scene.add(this.axe); } // Thermes' axe, held in his right fist
    if (this.def.visitor) { this.gun = makeWeapon('alienblaster'); this.gun.scale.setScalar(GUN_S); this.gun.traverse((o) => { if (o.isMesh) o.castShadow = true; }); scene.add(this.gun); } // the very same Alien Blaster as on the weapon wall, boss sized
    this.x = row[1] / 10; this.z = row[2] / 10; this.y = 0;
    this.tx = this.x; this.tz = this.z;
    this.yaw = 0; this.t = 0; this.hp = 1; this.anim = 0; this.spawnT = 0;
  }
  apply(row) {
    this.tx = row[1] / 10; this.tz = row[2] / 10;
    this.hp = row[3] / 1000;
    this.anim = Math.max(this.anim, row[4] / 9);
    this.tyaw = row[5] / 10;
    this.charging = row[6];
    // Thermes: row[7] is the current eye-laser yaw (x100), 9999 while he charges them, null otherwise.
    this.laser = row[7] == null || row[7] === 9999 ? null : row[7] / 100;
    this.lasering = row[7] != null;
    this.beamD = row[9] | 0; // The Visitor: how far out its beam lands
    this.flag = row[8] | 0; // Thermes: 1 cleave, 2 sweep, 3 whirlwind. The Visitor: 1 = blaster overheated
  }
  update(dt, world, camera, fx) {
    this.t += dt;
    this.spawnT += dt;
    if (this.snap || Math.hypot(this.tx - this.x, this.tz - this.z) > 20) { this.x = this.tx; this.z = this.tz; this.snap = false; } // a blink: no slide
    const ox = this.x, oz = this.z;
    const k = Math.min(1, dt * (this.charging ? 18 : 8));
    this.x += (this.tx - this.x) * k;
    this.z += (this.tz - this.z) * k;
    const speed = Math.hypot(this.x - ox, this.z - oz) / Math.max(dt, 1e-3);
    this.y = world.heightAt(this.x, this.z);
    this.yaw = lerpA(this.yaw, this.tyaw ?? 0, Math.min(1, dt * 6));
    const rise = Math.min(1, this.spawnT / 2.5);
    const fl = this.rig ? (MOB_LOOKS['boss' + this.idx].float || 0) : 0;
    // A leaping boss (charging === 2) arcs through the air on its way to the landing spot.
    if (this.charging === 2) this.leapT = (this.leapT || 0) + dt; else this.leapT = 0;
    const hop = this.leapT ? Math.sin(Math.min(1, this.leapT / 1.15) * Math.PI) * 11 : 0;
    this.model.position.set(this.x, this.y + hop + fl + (fl ? Math.sin(this.t * 1.3) * 0.3 : 0) - (1 - rise) * 8, this.z);
    this.spin = this.idx === 6 && this.flag === 3 ? (this.spin || 0) + dt * 7.5 : 0; // Thermes' whirlwind
    this.model.rotation.y = this.yaw + this.spin;
    this.anim = Math.max(0, this.anim - dt * 1.5);
    const hit = this.hp < (this.lastHp ?? this.hp) - 0.02; this.lastHp = this.hp;
    if (this.rig) this.rig.update({ speed: this.def.visitor ? 0 : speed, attack: this.spin ? 1 : this.anim, hit, kind: this.idx === 6 ? this.flag : 0 }, dt, false); // The Visitor glides: no walk cycle
    else this.model.userData.anim({ speed, attack: this.anim }, dt, this.t);
    if (this.def.visitor && this.rig && this.rig.b) {
      // The Visitor holds its blaster out like any gunman: upper arm forward and down, forearm straight at its target, recoil on each shot.
      const B = this.rig.b, ua = B.get('RightArm'), fa = B.get('RightForeArm'), hd = B.get('RightHand');
      if (ua && fa && hd) {
        const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), kick = this.anim * 0.18;
        aimBone(ua, fa, AIM_V.set(sy * 0.75 - cy * 0.22, -0.62, cy * 0.75 + sy * 0.22).normalize());
        aimBone(fa, hd, (this.aimDir || (this.aimDir = new THREE.Vector3())).set(sy, -0.2 + kick, cy).normalize());
        // The blaster is held like a real pistol: the hand turns so the knuckle row stands upright with the palm inward, the fingers
        // close round the grip and the thumb lies along the far side. Hand, fingers and gun all hang off the aimed forearm, so the
        // whole grip rides the recoil together. (Fitted against close-up renders, 2026-11-11.)
        const F = this.aimDir, U = GRIP_U.set(0, 1, 0).addScaledVector(F, -F.y).normalize(), L = GRIP_L.crossVectors(U, F).normalize();
        hd.updateWorldMatrix(true, true);
        const wr = hd.getWorldPosition(GRIP_W), a1 = B.get('RightHandMiddle1').getWorldPosition(GRIP_1).sub(wr).normalize();
        const a2 = B.get('RightHandPinky1').getWorldPosition(GRIP_2).sub(B.get('RightHandIndex1').getWorldPosition(GRIP_3)); a2.addScaledVector(a1, -a2.dot(a1)).normalize();
        GRIP_MA.makeBasis(a1, a2, GRIP_3.crossVectors(a1, a2)).transpose();
        GRIP_2.copy(U).negate(); GRIP_MB.makeBasis(F, GRIP_2, GRIP_3.crossVectors(F, GRIP_2)).multiply(GRIP_MA);
        AIM_Q.setFromRotationMatrix(GRIP_MB);
        hd.getWorldQuaternion(AIM_W).premultiply(AIM_Q); hd.parent.getWorldQuaternion(AIM_P).invert(); hd.quaternion.copy(AIM_P.multiply(AIM_W)); hd.updateWorldMatrix(false, true);
        for (const f of GRIP_FINGERS) { let t = 0; for (let k = 1; k <= 3; k++) { t += GRIP_CURL[k - 1]; aimBone(B.get('RightHand' + f + k), B.get('RightHand' + f + (k + 1)), GRIP_D.copy(F).multiplyScalar(Math.cos(t)).addScaledVector(L, Math.sin(t))); } }
        aimBone(B.get('RightHandThumb1'), B.get('RightHandThumb2'), GRIP_D.copy(F).multiplyScalar(0.55).addScaledVector(L, 0.75).addScaledVector(U, 0.25).normalize());
        aimBone(B.get('RightHandThumb2'), B.get('RightHandThumb3'), GRIP_D.copy(F).addScaledVector(L, 0.25).normalize());
        aimBone(B.get('RightHandThumb3'), B.get('RightHandThumb4'), GRIP_D.copy(F).addScaledVector(L, -0.1).normalize());
        const gp = this.gun.position;
        hd.getWorldPosition(gp).lerp(B.get('RightHandMiddle1').getWorldPosition(GRIP_1), 0.5).addScaledVector(L, 0.2);
        gp.addScaledVector(U, B.get('RightHandIndex1').getWorldPosition(GRIP_1).sub(gp).dot(U) + 0.03).addScaledVector(F, 0.02 * GUN_S);
        this.gun.quaternion.setFromRotationMatrix(GRIP_MB.makeBasis(GRIP_1.crossVectors(U, F), U, F));
      }
    }
    if (this.axe && this.rig && this.rig.b) {
      // Thermes holds his axe in a hammer grip: the haft lies across his palm along the knuckle row, the fingers close round it and the
      // thumb locks over them, the blade edge leads where his knuckles point. His wrist cocks the head up while he carries it and snaps
      // it down on a cleave. In the whirlwind his elbow bends so the haft sticks straight out and the edge leads the spin.
      // (Fitted against close-up renders, 2026-11-12.)
      const B = this.rig.b, R = this.rig, hd = B.get('RightHand'), m1 = B.get('RightHandMiddle1'), i1 = B.get('RightHandIndex1'), p1 = B.get('RightHandPinky1');
      if (hd && m1 && i1 && p1) {
        const D = GRIP_D, U = GRIP_U, N = GRIP_L;
        const frame = () => { hd.updateWorldMatrix(true, true); hd.getWorldPosition(GRIP_W); m1.getWorldPosition(GRIP_1); D.copy(GRIP_1).sub(GRIP_W).normalize(); U.copy(i1.getWorldPosition(GRIP_2)).sub(p1.getWorldPosition(GRIP_3)); U.addScaledVector(D, -U.dot(D)).normalize(); N.crossVectors(U, D); };
        const turnHand = (q) => { hd.getWorldQuaternion(AIM_W).premultiply(q); hd.parent.getWorldQuaternion(AIM_P).invert(); hd.quaternion.copy(AIM_P.multiply(AIM_W)); };
        const u = R.atkT >= 0 ? R.atkT / R.atkDur : -1, k = R.atkKind | 0;
        let w = -0.7;
        if (this.spin) {
          const ry = this.model.rotation.y, fx = Math.sin(ry), fz = Math.cos(ry), rx = -fz, rz = fx; // his forward and his right
          const ua = B.get('RightArm'), fa = B.get('RightForeArm');
          aimBone(ua, fa, AIM_V.set(rx * 0.9 + fx * 0.1, -0.45, rz * 0.9 + fz * 0.1).normalize());
          aimBone(fa, hd, AIM_V.set(fx * 0.9 + rx * 0.35, 0.05, fz * 0.9 + rz * 0.35).normalize());
          frame();
          const td = AXE_A.copy(AIM_V), tu = AXE_B.set(rx, 0.12, rz); tu.addScaledVector(td, -tu.dot(td)).normalize();
          GRIP_MA.makeBasis(D, U, AXE_C.crossVectors(D, U)).transpose();
          GRIP_MB.makeBasis(td, tu, AXE_C.crossVectors(td, tu)).multiply(GRIP_MA);
          turnHand(AIM_Q.setFromRotationMatrix(GRIP_MB));
          w = 0;
        } else if (u >= 0 && k === 1) { const t = Math.max(0, Math.min(1, (u - 0.55) / 0.17)); w = -0.5 + 1.2 * t * t * (3 - 2 * t); }
        else if (u >= 0 && k === 2) w = 0.1;
        this.axeW += (w - this.axeW) * Math.min(1, dt * (this.spin ? 30 : 10));
        frame();
        if (this.axeW) { turnHand(AIM_Q.setFromAxisAngle(N, this.axeW)); frame(); }
        const d0 = AXE_A.copy(D), n0 = AXE_B.copy(N), u0 = AXE_C.copy(U);
        for (const f of GRIP_FINGERS) for (let j = 1; j <= 3; j++) { const t = AXE_CURL[j - 1]; aimBone(B.get('RightHand' + f + j), B.get('RightHand' + f + (j + 1)), AIM_V.copy(d0).multiplyScalar(Math.cos(t)).addScaledVector(n0, Math.sin(t))); }
        for (let j = 1; j <= 3; j++) { const t = AXE_THUMB[j - 1]; aimBone(B.get('RightHandThumb' + j), B.get('RightHandThumb' + (j + 1)), AIM_V.copy(d0).multiplyScalar(t[0]).addScaledVector(n0, t[1]).addScaledVector(u0, t[2]).normalize()); }
        const S = hd.getWorldPosition(GRIP_W).distanceTo(m1.getWorldPosition(GRIP_1)) * 8; // sized to his hand
        this.axe.scale.setScalar(S);
        this.axe.position.copy(GRIP_1).addScaledVector(n0, S * 0.042);
        this.axe.quaternion.setFromRotationMatrix(GRIP_MB.makeBasis(n0, u0, d0));
      }
    }
    if (this.idx === 6) {
      // Thermes: pulsing skin and breathing aura, eyes tracked for the laser beams (brighter while they charge).
      thermes.tickThermes(this.model, dt, this.t);
      if (this.laser != null) { this.eyes = this.eyes || [new THREE.Vector3(), new THREE.Vector3()]; thermes.thermesEyes(this.model, this.eyes); }
    }
    if (rise < 1 && Math.random() < 0.8) fx.dustBurst([this.x + (Math.random() - 0.5) * 6, this.y, this.z + (Math.random() - 0.5) * 6], 0.6);
    if (Math.random() < 0.3) {
      const c = new THREE.Color(this.def.glow);
      fx.glow.emit({ p: [this.x + (Math.random() - 0.5) * 3, this.y + Math.random() * this.def.scale * 2.5, this.z + (Math.random() - 0.5) * 3], v: [0, 1, 0], life: 1, s0: 0.6, s1: 0.1, c0: [c.r, c.g, c.b, 0.8], c1: [c.r, c.g, c.b, 0] });
    }
  }
  // Where the Visitor's blaster points from: just ahead of its gun hand.
  muzzle(out) {
    const h = this.rig && this.rig.b && this.rig.b.get('RightHand');
    if (h && this.aimDir && this.gun) { out.copy(this.gun.position).addScaledVector(this.aimDir, 0.31 * GUN_S); out.y += 0.03 * GUN_S; return out; }
    return out.set(this.x + Math.sin(this.yaw) * 3, this.y + 7, this.z + Math.cos(this.yaw) * 3);
  }
  target() { const s = this.def.scale; return { id: 'B', kind: 'boss', x: this.x, y: this.y, z: this.z, r: 0.9 * s, h: 2.9 * s, view: this }; }
  dispose() { this.scene.remove(this.model); if (this.gun) this.scene.remove(this.gun); if (this.axe) this.scene.remove(this.axe); }
}

const DEATH_SCALE = 1.7;
export class DemonView {
  constructor(scene, row) {
    this.scene = scene;
    this.model = makeCharacterModel('death', makeDemon);
    if (this.model.userData.rig) this.model.userData.setWeapon('reaperScythe');
    this.model.scale.setScalar(DEATH_SCALE); // twice the player's height
    scene.add(this.model);
    this.x = row[0] / 10; this.z = row[1] / 10; this.y = 0; this.yaw = 0; this.t = 0; this.anim = 0;
    this.tx = this.x; this.tz = this.z; this.tyaw = 0; this.swing = 0; this.hp = 1;
  }
  apply(row) { this.hp = (row[4] || 1000) / 1000; this.tx = row[0] / 10; this.tz = row[1] / 10; this.tyaw = row[2] / 10; this.anim = Math.max(this.anim, row[3] / 9); }
  mist(fx, x, y, z, n, spread, up) {
    for (let i = 0; i < n; i++) {
      fx.smoke.emit({ p: [x + (Math.random() - 0.5) * spread, y + Math.random() * up, z + (Math.random() - 0.5) * spread], v: [(Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2], life: 1.3, s0: 0.9, s1: 2.6, c0: [0.03, 0.05, 0.14, 0.7], c1: [0.04, 0.06, 0.16, 0] });
      if (i % 3 === 0) fx.glow.emit({ p: [x + (Math.random() - 0.5) * spread, y + Math.random() * up, z + (Math.random() - 0.5) * spread], v: [0, 0.8, 0], life: 0.9, s0: 0.5, s1: 0.1, c0: [0.35, 0.5, 1, 0.55], c1: [0.2, 0.2, 0.8, 0] });
    }
  }
  update(dt, world, camera, fx) {
    this.t += dt;
    const ox = this.x, oz = this.z;
    if (Math.hypot(this.tx - this.x, this.tz - this.z) > 10) {
      // Blinked: a burst of cold mist where she left and where she lands.
      this.mist(fx, this.x, world.heightAt(this.x, this.z), this.z, 14, 1.4, 2);
      this.x = this.tx; this.z = this.tz;
      this.mist(fx, this.x, world.heightAt(this.x, this.z), this.z, 14, 1.4, 2);
    }
    const k = Math.min(1, dt * 10);
    this.x += (this.tx - this.x) * k; this.z += (this.tz - this.z) * k;
    const speed = Math.hypot(this.x - ox, this.z - oz) / Math.max(dt, 1e-3);
    this.y = world.heightAt(this.x, this.z);
    // Quick turn onto the target so the swing always faces it.
    this.yaw = lerpA(this.yaw, this.tyaw ?? 0, Math.min(1, dt * (this.anim > 0 ? 22 : 12)));
    this.model.position.set(this.x, this.y, this.z);
    this.model.rotation.y = this.yaw;
    this.anim = Math.max(0, this.anim - dt * 1.5);
    const m = this.anim > 0 ? 1 - this.anim : 0;
    const lean = 0.28 * Math.sin(Math.min(1, m) * Math.PI) + Math.min(0.18, speed / 50);
    this.model.userData.anim({ speed, attack: this.anim, melee: m, pitch: lean, sprint: speed > 5, auraI: 1 + this.anim }, dt, this.t);
    if (Math.random() < 0.6) fx.smoke.emit({ p: [this.x + (Math.random() - 0.5) * 0.8, this.y + 0.1 + Math.random() * 0.5, this.z + (Math.random() - 0.5) * 0.8], v: [0, 0.5, 0], life: 1.6, s0: 0.8, s1: 2.4, c0: [0.03, 0.05, 0.13, 0.55], c1: [0.04, 0.06, 0.16, 0] });
    if (Math.random() < 0.25) fx.glow.emit({ p: [this.x + (Math.random() - 0.5) * 0.7, this.y + 0.2 + Math.random() * 1.6, this.z + (Math.random() - 0.5) * 0.7], v: [0, 1, 0], life: 0.9, s0: 0.35, s1: 0.05, c0: [0.35, 0.5, 1, 0.6], c1: [0.2, 0.2, 0.8, 0] });
    // Cold glow in the hood.
    fx.glow.emit({ p: [this.x, this.y + 1.62 * DEATH_SCALE, this.z], life: 0.05, s0: 2.4 * DEATH_SCALE, s1: 2.4 * DEATH_SCALE, c0: [0.3, 0.45, 1, 0.22], c1: [0.3, 0.45, 1, 0.2] });
    // A pale arc follows the blade through the cut.
    if (m > 0.3 && m < 0.7 && this.model.userData.weapon) {
      const w = this.model.userData.weapon, tip = w.localToWorld(new THREE.Vector3(0.95, 0, 0.82));
      fx.glow.emit({ p: [tip.x, tip.y, tip.z], life: 0.22, s0: 0.5, s1: 0.15, c0: [0.6, 0.75, 1, 0.7], c1: [0.3, 0.4, 1, 0] });
    }
  }
  target() { return { id: 'D', kind: 'boss', x: this.x, y: this.y, z: this.z, r: 0.7 * DEATH_SCALE, h: 2.2 * DEATH_SCALE, view: this }; }
  dispose() { this.scene.remove(this.model); }
}

let _thrallRingMat = null, _thrallRingGeo = null;
export class NpcView {
  constructor(scene, row, ownerName) {
    this.scene = scene;
    this.id = row[0];
    this.type = NPC_TYPES[row[1]];
    this.def = NPCS[this.type];
    const look = { sellsword: 'veteran', hunter: 'nyx', warden: 'scalefang', medic: 'veteran', cleric: 'bonelord' }[this.type] || 'veteran';
    // Zombies (Zombie Staff) are the rotting mob-rig body, not a character avatar.
    // Necromancer thralls are the very enemy that just died, back on its feet with a green ghost-light.
    this.mt = (row[9] | 0) - 1;
    this.thrall = this.type === 'thrall';
    if (this.thrall && this.mt >= 0) { const mtp = MOB_TYPES[this.mt], wi = row[10] | 0; this.mtype = mtp; this.rig = makeMobRig(wi ? mtp + '@' + MOB_ARM_IDS[wi - 1] : mtp); }
    if (!this.rig) this.rig = this.type === 'zombie' || this.thrall ? makeMobRig('zombie' + (this.id % 6)) : null;
    if (this.thrall && this.rig) { // a soft green ring of grave-light under its feet marks a risen ally (its own textures stay as they are)
      _thrallRingMat = _thrallRingMat || new THREE.MeshBasicMaterial({ color: 0x4dff88, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      _thrallRingGeo = _thrallRingGeo || new THREE.RingGeometry(0.55, 0.85, 40).rotateX(-Math.PI / 2);
      this.ring = new THREE.Mesh(_thrallRingGeo, _thrallRingMat); this.ring.position.y = 0.06; this.ring.renderOrder = 3;
      this.rig.root.add(this.ring);
    }
    this.model = this.rig ? this.rig.root : makeCharacterModel(look, () => makeHumanoid({ color: this.def.color, accent: this.def.role === 'Support' ? 0x7dff8a : 0xff6a4a, cape: this.def.role === 'Support', hood: this.type === 'cleric' || this.type === 'medic', skin: 0xb08a6a }));
    const w = { sellsword: 'sword', zombie: null, hunter: 'dmr', warden: 'axe', medic: 'pistol', cleric: null }[this.type];
    if (!this.rig) this.model.userData.setWeapon(w);
    this.gun = this.type === 'hunter' || this.type === 'medic';
    this.plate = makeNameplate((ownerName ? ownerName + "'s " : '') + this.def.name, this.def.role === 'Support' ? '#7dff8a' : '#ffb08a');
    this.plate.position.y = 2.3;
    this.plate.scale.set(2.4, 0.6, 1);
    if (this.def.summoned) this.plate.visible = false; // five zombies would bury the screen in nameplates
    this.model.add(this.plate);
    this.bar = hpBar(1.0, barFgNpc);
    this.bar.position.y = 2.05;
    this.model.add(this.bar);
    scene.add(this.model);
    this.x = row[3] / 10; this.z = row[4] / 10; this.y = 0;
    this.tx = this.x; this.tz = this.z; this.yaw = 0; this.t = 0; this.anim = 0; this.spawnT = 0;
    this.vh = this.rig ? (this.mtype && MOB_LOOKS[this.mtype] ? MOB_LOOKS[this.mtype].h : MOB_LOOKS.zombie0.h) : 1.9;
    if (this.rig) this.bar.position.y = this.vh + 0.3;
  }
  apply(row) { this.tx = row[3] / 10; this.tz = row[4] / 10; this.hp = row[5] / 100; this.tyaw = row[6] / 10; this.anim = Math.max(this.anim, row[7] / 9); }
  update(dt, world, camera, fx) {
    this.t += dt;
    this.spawnT += dt;
    this.fxRef = fx;
    const ox = this.x, oz = this.z;
    if (Math.hypot(this.tx - this.x, this.tz - this.z) > 20) { this.x = this.tx; this.z = this.tz; }
    const k = Math.min(1, dt * 10);
    this.x += (this.tx - this.x) * k; this.z += (this.tz - this.z) * k;
    const speed = Math.hypot(this.x - ox, this.z - oz) / Math.max(dt, 1e-3);
    this.y = world.heightAt(this.x, this.z);
    this.yaw = lerpA(this.yaw, this.tyaw ?? 0, Math.min(1, dt * 8));
    // A summoned zombie claws up out of the ground over ~0.7 s once the pit has opened, still and groaning as it rises.
    const rise = this.thrall ? Math.min(1, Math.max(0, (this.spawnT - 0.5) / 0.6)) : this.rig ? Math.min(1, Math.max(0, (this.spawnT - 0.15) / 0.7)) : 1, er = 1 - (1 - rise) ** 3;
    if (this.thrall) this.model.visible = this.spawnT > 0.5; // the body drops first, then this one climbs out where it lay
    this.model.position.set(this.x, this.y - (1 - er) * this.vh * 1.05 * (this.size || 1), this.z);
    this.model.rotation.y = this.yaw;
    if (this.rig && this.size) this.model.scale.setScalar(this.size); // duel: summoned zombies are twice as big
    this.anim = Math.max(0, this.anim - dt * 3);
    if (this.rig) {
      this.rig.update({ speed: rise < 1 ? 0 : speed, attack: rise < 1 ? 0 : this.anim, frozen: 0 }, dt, 0);
      if (fx) { if (this.thrall) this.necroFx(dt, fx, rise); else this.hellFx(dt, fx, rise); }
    } else this.model.userData.anim({ speed, gun: this.gun, weapon: true, melee: !this.gun && this.anim > 0 ? 1 - this.anim : 0, cast: this.type === 'cleric' && this.anim > 0 ? 1 : 0 }, dt, this.t);
    setBar(this.bar, this.hp ?? 1, camera);
  }
  // Hell-fire clinging to a zombie: small flames and embers streaming off the shoulders and back, a smoulder of smoke and a
  // red-orange glow behind the burning eyes.
  hellFx(dt, fx, rise) {
    const H = this.vh, R = () => Math.random() - 0.5, y = this.model.position.y;
    const k = rise < 0.5 ? 0.3 : 1;
    if (Math.random() < 0.3 * k) fx.fire.emit({ p: [this.x + R() * 0.6, y + H * (0.55 + Math.random() * 0.4), this.z + R() * 0.6], v: [R() * 0.8, 1.2 + Math.random() * 1.2, R() * 0.8], life: 0.45, s0: 0.38, s1: 0.06, c0: [1, 0.5, 0.1, 0.9], c1: [0.8, 0.1, 0.02, 0], turb: 2.5 });
    if (Math.random() < 0.3 * k) fx.spark.emit({ p: [this.x + R() * 0.5, y + H * (0.4 + Math.random() * 0.5), this.z + R() * 0.5], v: [R() * 1.5, 1 + Math.random() * 2, R() * 1.5], life: 0.9, s0: 0.07, s1: 0.02, c0: [1, 0.55, 0.15, 1], c1: [1, 0.2, 0, 0], turb: 2 });
    if (Math.random() < 0.07 * k) fx.smoke.emit({ p: [this.x + R() * 0.4, y + H * 0.8, this.z + R() * 0.4], v: [0, 0.9, 0], life: 1.3, s0: 0.35, s1: 1.1, c0: [0.1, 0.07, 0.06, 0.4], c1: [0.1, 0.1, 0.1, 0] });
    // eye glow, from the head bone
    const hd = this.rig.bn.head;
    if (hd) {
      const e = this._eye || (this._eye = { p: new THREE.Vector3(), q: new THREE.Quaternion(), v: new THREE.Vector3() }), s = H / 1.8;
      hd.getWorldPosition(e.p); hd.getWorldQuaternion(e.q);
      for (const sx of [-1, 1]) { e.v.set(sx * 0.035 * s, 0.07 * s, 0.085 * s).applyQuaternion(e.q).add(e.p); fx.glow.emit({ p: [e.v.x, e.v.y, e.v.z], life: 0.06, s0: 0.14, s1: 0.14, c0: [0.9, 0.85, 0.5, 0.22], c1: [0.9, 0.85, 0.5, 0.15] }); }
    }
  }
  // Necromancer thrall: a green ghost-light clinging to it, wisps rising off it and burning green eyes.
  necroFx(dt, fx, rise) {
    if (rise <= 0) return;
    if (this.ring) this.ring.scale.setScalar(1 + 0.1 * Math.sin(this.t * 4));
    const H = this.vh, R = () => Math.random() - 0.5, y = this.model.position.y;
    if (Math.random() < 0.45) fx.glow.emit({ p: [this.x + R() * 0.7, y + H * (0.15 + Math.random() * 0.8), this.z + R() * 0.7], v: [R() * 0.4, 1.1 + Math.random(), R() * 0.4], life: 0.8, s0: 0.45, s1: 0.08, c0: [0.35, 1, 0.55, 0.75], c1: [0.1, 0.8, 0.4, 0] });
    if (Math.random() < 0.25) fx.fire.emit({ p: [this.x + R() * 0.5, y + H * (0.5 + Math.random() * 0.45), this.z + R() * 0.5], v: [0, 1.4, 0], life: 0.5, s0: 0.32, s1: 0.05, c0: [0.4, 1, 0.5, 0.8], c1: [0.05, 0.6, 0.25, 0], turb: 2 });
    fx.glow.emit({ p: [this.x, y + H * 0.55, this.z], life: 0.05, s0: H * 1.25, s1: H * 1.25, c0: [0.3, 1, 0.5, 0.12], c1: [0.3, 1, 0.5, 0.08] });
    const hd = this.rig.bn.head;
    if (hd) {
      const e = this._eye || (this._eye = { p: new THREE.Vector3(), q: new THREE.Quaternion(), v: new THREE.Vector3() }), s = H / 1.8;
      hd.getWorldPosition(e.p); hd.getWorldQuaternion(e.q);
      for (const sx of [-1, 1]) { e.v.set(sx * 0.035 * s, 0.07 * s, 0.085 * s).applyQuaternion(e.q).add(e.p); fx.glow.emit({ p: [e.v.x, e.v.y, e.v.z], life: 0.06, s0: 0.16, s1: 0.16, c0: [0.4, 1, 0.5, 0.5], c1: [0.4, 1, 0.5, 0.3] }); }
    }
  }
  // A thrall's ten seconds are up: it falls for good, the green light bleeding out of it.
  dying(dt) {
    if (!this.rig) return false;
    this.bar.visible = false;
    this.deadT = (this.deadT || 0) + dt;
    if (this.ring) this.ring.visible = false;
    if (this.fxRef && this.deadT < 1) for (let i = 0; i < 2; i++) this.fxRef.smoke.emit({ p: [this.x + (Math.random() - 0.5) * 0.6, this.y + Math.random() * this.vh * 0.6, this.z + (Math.random() - 0.5) * 0.6], v: [0, 0.8, 0], life: 1.1, s0: 0.3, s1: 1, c0: [0.15, 0.4, 0.2, 0.35], c1: [0.1, 0.2, 0.1, 0] });
    return this.rig.die(dt);
  }
  chest() { return [this.x, this.y + 1.4, this.z]; }
  dispose() {
    this.scene.remove(this.model);
  }
}
