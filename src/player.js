// The local player: movement, weapons, abilities, damage, beds and death.
import * as THREE from 'three';
import { muOn, BOTTOMLESS, LOWGRAV, GRAV_K, LOWGRAV_WALK, BULLET_TIME } from './mutators.js';
import { CONFIG, DUEL, GRAV, HEAL, CLASSES, CLASS_BY_ID, WEAPONS, WEAPON_BY_ID, DASH, freshStats, XP, puInfo, ZONE_K, zoneOf } from './data.js';
import { makeHumanoid } from './models.js';
import { animateWeapon, boltProto } from './weapons.js';
import { launchArrow } from './longbow.js';
import { applyMeta, metaPerks } from './meta.js';
import { CHAR_BY_ID, CHARACTERS, makeCharacterModel, flushSwipes, setCharacterScale, STEP_KIND, stepAccum } from './characters.js';
import { makeRiderBoard, rideStep, SKATE, newBoard, ollieBoard, groundTilt, RiderAnim, packBoard } from './skate.js';
import { makeJetpack, jetFx, JET } from './jetpack.js';
import { makeWings, setWings, WING } from './wings.js';
import { Drone, Turret, TURRET } from './drone.js';
const DIVE_KEYS = ['ShiftLeft', 'ShiftRight', 'ControlLeft', 'KeyZ', 'PadDown'];
import { makeOrbitBlades, makeFireRing, auraRadius } from './duelfx.js';
import { Dailies } from './dailies.js';
import { moveOf, movesFor, hitShape, MELEE_V2 } from './meleemoves.js';

const TAP_MIN = 0.06; // fastest a handgun can be fired by tapping the trigger
const PARRY = { window: 0.22, mul: 1 }; // seconds after raising the shield that a hit is parried; the attacker takes the hit's damage times mul
const q10 = (v) => Math.round(v * 10);
const rnd = (a, b) => a + Math.random() * (b - a);
const v3 = () => new THREE.Vector3();
const tmp = v3(), tmp2 = v3();
// Muzzle flash size (metres across) by gun: handguns small, shotguns and belt-fed big.
export const flashSize = (id) => ({ pistol: 0.22, revolver: 0.26, hpistol: 0.26, magnum: 0.3, shotgun: 0.42, coach: 0.45, sawedoff: 0.45, lmg: 0.4, minigun: 0.36, sniper: 0.4, lever: 0.36 }[id] || 0.32);

export class LocalPlayer {
  constructor(game, { ch, sk, cls, weapons, name }) {
    this.game = game;
    this.ch = CHAR_BY_ID[ch] || CHAR_BY_ID.veteran;
    this.cls = CLASS_BY_ID[cls];
    this.name = name;
    this.weapons = weapons; // any three items: weapons first, then up to two pieces of gear (never selected as the held weapon)
    this.gears = new Set(weapons.map((w) => WEAPON_BY_ID[w]).filter((w) => w && w.gear).map((w) => w.gear));
    this.swing = null; this.swingCd = 0; this.jumpT = -9; this.flyT = 0;
    this.cur = Math.max(0, weapons.findIndex((w) => WEAPON_BY_ID[w] && WEAPON_BY_ID[w].kind !== 'gear'));
    this.ammo = weapons.map((w) => WEAPON_BY_ID[w].mag || 0);
    this.reloadT = 0;
    this.fireCd = 0;
    this.spinT = 0; // rotary gun spin-up (seconds of wind-up reached)
    this.bowDraw = 0; this.bowNock = 0; this.bowHold = 0; this.bowWob = [0, 0]; // longbow: draw 0..1, time until the next arrow is nocked, how long it has been held, the aim wobble applied
    this.heat = 0; // sustained fire widens the spread
    this.stats = this.baseStats();
    this.hp = this.stats.maxHp;
    this.pos = v3();
    this.vel = v3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = true;
    this.cds = { q: 0, r: 0, e: 0, d: 0 };
    this.hasteUntil = 0;
    this.shield = { until: 0, hp: 0 };
    this.eye = { until: 0, dur: 5 }; // Eye of the Storm: while it lasts nothing can hurt you
    const perks = (this.perks = metaPerks());
    this.beds = 1 + perks.beds;
    this.revives = perks.revives;
    this.bedPos = null;
    this.pc = perks.pc;
    this.kills = 0;
    this.totalKills = 0;
    this.damageDealt = 0;
    this.alive = true;
    this.out = false;
    this.deadT = 0;
    this.meleeT = 0;
    this.meleePending = 0;
    this.castT = 0;
    this.dash = null;
    this.blessings = [];
    this.powerups = [];
    this.elemPending = 0; // elemental picks waiting for the player
    this.xp = 0; this.level = 0; this.xpNeed = XP.need(0); this.lastPick = null;
    this.orbitT = 0; this.auraT = 0; this.orbitHit = new Map(); this.orbitGroup = null; this.phoenixUsed = 0;
    this.time = 0;
    this.model = makeCharacterModel(this.ch.id, () => makeHumanoid({ color: this.cls.color, accent: this.cls.accent, hood: cls === 'pyre' || cls === 'gale' }), sk);
    this.recoilT = 0;
    this.model.userData.setWeapon(this.heldId());
    this.climb = null; this.climbV = 0;
    this.ads = 0; this.aimIn = 0;
    this.jet = { on: false, fuel: JET.fuel, tapT: -9, diveT: -9, idle: 0, level: 0 };
    this.pack = makeJetpack();
    this.pack.position.set(0, (this.ch.height || 1.8) * 0.7, -(this.ch.packZ ?? 0.2));
    this.pack.visible = false;
    this.model.add(this.pack);
    this.wing = { stam: WING.stam, soar: false, cd: 0, beat: 0, spread: 0, flapT: -9 };
    this.wings = makeWings();
    this.wings.position.set(0, (this.ch.height || 1.8) * 0.74, -(this.ch.packZ ?? 0.2) + 0.02);
    this.wings.visible = false;
    this.model.add(this.wings);
    this.drone = this.hasGear('drone') ? new Drone(true, game) : null; // Guardian Drone gear: hovers beside you and shoots for you
    this.turret = null; this.gravPull = null; this.staffCd = 0; // Turret Pack drops a huge sentry when you shoot; the Zombie Staff slams to summon
    this.board = null; // skate.js newBoard(): { h: heading, s: speed, lean, pushT, ... } while riding a skateboard
    this.boardObj = makeRiderBoard();
    this.rider = new RiderAnim();
    this.model.add(this.boardObj);
    game.scene.add(this.model);
    this.speedNow = 0;
  }

  // An all-gear loadout has nothing to hold: the slot stays on a gear item and the hands are bare.
  heldId() { const w = WEAPON_BY_ID[this.weapons[this.cur]]; return w && w.kind === 'gear' ? 'bare' : this.weapons[this.cur]; }
  get weapon() { return WEAPON_BY_ID[this.heldId()]; }

  // Each character has its own build: the tank is tougher, the skeleton quicker.
  baseStats() {
    const s = freshStats();
    s.maxHp = Math.round(s.maxHp * this.ch.stats.hp);
    s.speed *= this.ch.stats.speed;
    if (this.game.duel) { s.maxHp = DUEL.hp; s.phoenix = 0; return s; } // a duel is fair: no shop perks, everyone has 1000 health
    return applyMeta(s); // permanent Perfect Shop upgrades
  }

  recomputeStats() {
    const s = this.baseStats();
    for (const b of this.blessings) b.apply(s, this);
    for (const p of this.powerups) if (p.id !== 'heal') p.apply(s, this);
    s.orbit = Math.min(6, s.orbit); s.aura = Math.min(6, s.aura); // blades and fire ring stop stacking at six
    const ratio = this.hp / this.stats.maxHp;
    this.stats = s;
    this.hp = Math.min(s.maxHp, Math.max(1, ratio * s.maxHp));
  }

  placeAt(x, z) {
    const w = this.game.world;
    this.pos.set(x, w.heightAt(x, z) + 0.1, z);
    this.vel.set(0, 0, 0);
  }

  // ---------- per frame ----------
  update(dt, input) {
    this.time += dt;
    const g = this.game;
    const w = g.world;
    for (const k of ['q', 'r', 'e', 'd']) this.cds[k] = Math.max(0, this.cds[k] - dt);
    // Rotary guns carry the leftover of a frame into the next shot, so 28 rounds a second hold at 30 or 60 fps.
    this.fireCd = Math.max(this.weapon.spin ? -0.04 : 0, this.fireCd - dt);
    this.meleeT = Math.max(0, this.meleeT - dt);
    this.castT = Math.max(0, this.castT - dt);

    if (!this.alive) {
      this.deadT -= dt;
      if (!this.out && this.deadT <= 0) this.respawn();
      this.animate(dt);
      return;
    }
    if (this.frozenUntil > g.now) { input = g.frozenInput(); this.meleePending = 0; } // sealed in ice: no moving, looking, shooting or casting until it thaws
    else if (this.frozenUntil) { this.frozenUntil = 0; g.ui.frost(0); }
    if (this.stats.regen && this.hp < this.stats.maxHp) this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.regen * dt);
    // Catch your breath: 4 seconds without taking a hit and health slowly comes back (4% a second), so a rough fight isn't a death sentence.
    else if (!g.duel && this.hp < this.stats.maxHp && g.now - (this.hurtAt || 0) > 4) this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * 0.04 * dt);

    // Aim down sights (right mouse / C / left trigger): slower, steadier, zoomed, and the view goes through the
    // gun's iron sights or scope (see Game.updateCamera). Other weapons just pull the camera in close.
    const adsBtn = input.aimHeld || input.keys.has('KeyC') || input.keys.has('PadClose');
    const aimBtn = adsBtn || input.keys.has('PadClose');
    // Bullet Time mutator: holding aim slows the world (the host reads this flag), and in the air it holds you there.
    this.btHold = muOn(BULLET_TIME) && adsBtn && this.alive && !this.out;
    this.blockStep(dt, adsBtn && !!this.weapon.shield);
    const wantAds = adsBtn && this.weapon.kind === 'gun' && !this.weapon.eyes && !this.board && !this.climb && !this.sprinting && !this.dash;
    this.ads += ((wantAds ? 1 : 0) - this.ads) * Math.min(1, dt * 11);
    this.aimIn += ((aimBtn ? 1 : 0) - this.aimIn) * Math.min(1, dt * 11);
    // Look.
    const lookK = g.settings.sens * 0.0022 * (1 - 0.45 * this.ads) * (1 + ((g.settings.sensAds ?? 1) - 1) * this.ads);
    this.yaw -= input.dx * lookK;
    this.pitch = Math.max(-1.1, Math.min(1.25, this.pitch + input.dy * lookK * (g.settings.invertY ? -1 : 1)));

    // Move.
    const k = input.keys;
    let f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    let s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    // A controller stick gives analog movement (slow walk at a light push).
    const analog = Math.hypot(input.ax || 0, input.ay || 0) > 0.05 && !f && !s;
    if (analog) { f = input.ay; s = input.ax; }
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight') || !!input.padSprint;
    this.sprinting = sprint && f > 0.3;
    if (this.stagT > 0) this.stagT -= dt;
    const speed = (sprint && f > 0.3 ? CONFIG.sprint : CONFIG.walk) * this.stats.speed * (this.hasteUntil > g.now ? 1.45 : 1) * (1 - 0.35 * this.ads) * (this.spinMove || 1) * (this.stagT > 0 ? 0.35 : 1) * (this.slowUntil > g.now ? 0.55 : 1) * (muOn(LOWGRAV) ? LOWGRAV_WALK : 1); // Low Gravity: a slightly slower, floatier stride
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    let mx = fx * f - fz * s, mz = fz * f + fx * s;
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { const n = analog ? Math.max(ml, 1) : ml; mx /= n; mz /= n; }
    this.moveDir = ml > 0 ? [mx, mz] : null;
    if (this.dash) {
      this.dash.t -= dt;
      this.vel.x = this.dash.vx; this.vel.z = this.dash.vz;
      if (this.dashDmg) this.dashStrike();
      if (this.dash.t <= 0) { this.dash = null; this.dashDmg = 0; }
    } else if (this.climb) {
      this.climbStep(dt, f, s, input);
    } else if (this.board) {
      this.rideBoard(dt, mx, mz, ml, sprint);
    } else if (this.swing) {
      this.swingSteer(dt, mx, mz, ml); // on the web line: the swing itself carries you
    } else if (this.flyT > 0 && !this.onGround) {
      // Just let go of a web line: the momentum carries (gentle steering, only a little drag) until you land.
      this.flyT -= dt;
      this.vel.x += mx * 6 * dt; this.vel.z += mz * 6 * dt;
      const k = Math.max(0, 1 - 0.25 * dt); this.vel.x *= k; this.vel.z *= k;
    } else {
      const flying = this.jet.on;
      const accel = this.onGround ? 14 : flying ? 8 : 4;
      const sp = flying ? Math.max(speed, CONFIG.walk * this.stats.speed * (this.slowUntil > g.now ? 0.55 : 1)) * JET.airSpeed : speed;
      this.vel.x += (mx * sp - this.vel.x) * Math.min(1, accel * dt);
      this.vel.z += (mz * sp - this.vel.z) * Math.min(1, accel * dt);
    }
    if (k.has('Space') && this.onGround && !this.climb && !this.swing) { // (a web line that touches down ends first, not with a bounce)
      this.vel.y = CONFIG.jump * (this.board ? SKATE.ollie : 1) * this.stats.jump; this.onGround = false; this.jumpT = this.time; g.audio.play('jump');
      if (this.board) ollieBoard(this.board, mx, mz, ml); // ollie: the board pops under you (sideways input = kickflip)
    }
    this.jetStep(dt, input);
    this.wingStep(dt, input, sprint);
    this.swingStep(dt, input, f);
    if (this.drone) this.drone.update(dt, { x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw }, this.alive);
    this.turretStep(dt, input);
    if (this.gravPull) this.gravStep(dt);
    this.btHang = !!this.btHold && !this.onGround && !this.climb && !this.swing && !this.jet.on && !this.wing.soar && !this.dash;
    if (this.btHang) { this.vel.y *= Math.exp(-14 * dt); const hd = Math.exp(-6 * dt); this.vel.x *= hd; this.vel.z *= hd; if (Math.abs(this.vel.y) < 0.05) this.vel.y = 0; } // brake to a stop and hang
    if (!this.climb) { if (!this.jet.on && !this.wing.soar && !this.btHang) this.vel.y -= CONFIG.gravity * (muOn(LOWGRAV) ? GRAV_K : 1) * dt; /* Low Gravity mutator: moon jumps */ this.pos.addScaledVector(this.vel, dt); }
    if (this.knock) { // a shove from the other duelist's hit: slides you back, fading over about 0.4 s
      this.pos.x += this.knock.x * dt; this.pos.z += this.knock.z * dt;
      const kd = Math.exp(-5 * dt); this.knock.x *= kd; this.knock.z *= kd;
      if (Math.hypot(this.knock.x, this.knock.z) < 0.3) this.knock = null;
    }
    const bx = this.pos.x, bz = this.pos.z;
    if (!this.climb) [this.pos.x, this.pos.z] = w.collide(this.pos.x, this.pos.z, 0.45, this.pos.y);
    if (this.board && this.board.s > 3 && Math.hypot(this.pos.x - bx, this.pos.z - bz) > 0.02) this.board.s *= Math.max(0, 1 - 5 * dt); // scraping a wall
    const gy = w.standY(this.pos.x, this.pos.z, this.pos.y);
    // Riding: stay glued to the ground over crests and bumps (only a real drop or an ollie leaves it), so the board glides instead of hopping.
    const glued = this.board && this.onGround && this.time - (this.jumpT || -9) > 0.35 && this.pos.y - gy < 3; // any hill: only an ollie or a real cliff leaves the ground
    if (this.climb) { this.onGround = false; } else if (glued || this.pos.y <= gy) {
      if (!this.onGround && this.vel.y < -12) g.audio.play('land');
      this.pos.y = gy; this.vel.y = 0; this.onGround = true; this.flyT = 0;
    } else if (this.pos.y > gy + 0.3) this.onGround = false;
    if (this.swing) this.swingConstrain(dt);
    this.speedNow = Math.hypot(this.vel.x, this.vel.z);
    // Footsteps: quiet, paced by distance covered, not while riding a board or dashing.
    this.stepAcc = stepAccum(this.stepAcc || 0, dt, this.board || this.dash ? 0 : this.speedNow, this.onGround, (v) => g.audio.footstep(STEP_KIND[this.ch.id] || 'boot', v * (this.sprinting ? 1 : 0.8)));

    // Weapons.
    if (input.pressed.has('Digit1')) this.swap(0);
    if (input.pressed.has('Digit2')) this.swap(1);
    if (input.pressed.has('Digit3')) this.swap(2);
    if (input.wheel) this.swap(this.nextSlot(input.wheel < 0 ? -1 : 1));
    if (input.pressed.has('KeyR')) this.reload();
    if (muOn(BOTTOMLESS)) { // Bottomless Clip mutator: every gun stays topped up, so there is never a reload
      for (let i = 0; i < this.weapons.length; i++) { const w = WEAPON_BY_ID[this.weapons[i]]; if (w && w.kind === 'gun') this.ammo[i] = this.magOf(w); }
      if (this.reloadT > 0 && this.weapon.kind === 'gun') this.reloadT = 0;
    }
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) { this.ammo[this.cur] = this.magOf(this.weapon); g.audio.play(this.weapon.energy ? 'charged' : 'reloaded'); }
    }
    const wp = this.weapon;
    this.gunSpin(dt, wp, (input.mouseDown || input.padFire) && !this.dash && this.reloadT <= 0);
    if (wp.bow) this.bowStep(dt, input);
    else if ((input.mouseDown || input.padFire) && this.fireCd <= 0 && !this.dash && !this.blocking) {
      if (wp.kind === 'melee') this.melee();
      else this.shoot(); // every weapon keeps attacking while the trigger is held
    } else if (wp.tap && input.mouseClicked && this.fireCd > 0 && this.game.now - (this.tapT || -9) >= TAP_MIN && !this.dash && !this.blocking && this.reloadT <= 0) {
      this.fireCd = 0; this.shoot(); // handguns: a fresh pull of the trigger fires right away, as fast as you can pull it
    }
    if (this.meleePending > 0) {
      this.meleePending -= dt;
      if (this.meleePending <= 0) { if (this.weapon.summon) this.staffSlam(); else if (this.weapon.heal) this.staffHeal(); else this.meleeHit(); }
    }
    this.tickSpecials(dt);
    // Abilities.
    if (input.pressed.has('KeyX') && !this.hasGear('wings')) this.doDash(); // with wings, X flaps instead
    if (input.pressed.has('KeyQ')) this.cast('q');
    if (input.pressed.has('KeyG')) this.cast('e');
    if (input.pressed.has('KeyF')) this.cast('r');
    if (input.pressed.has('KeyB')) this.placeBed();
    if (input.pressed.has('KeyV')) this.game.ui.setView(this.game.settings.view === 'first' ? 'third' : 'first');

    // Shield pulses (Rock Armor shoves enemies off).
    if (this.shield.until > g.now) {
      this.shieldPulse = (this.shieldPulse || 0) - dt;
      if (this.shieldPulse <= 0) {
        this.shieldPulse = 0.5;
        for (const t of g.targets()) {
          if (t.kind !== 'mob' && t.kind !== 'player') continue; // in a duel the shove catches the other fighter too
          const dx = t.x - this.pos.x, dz = t.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
          if (d < 3.6) g.damage(t, 10 * this.stats.dmg, { kx: dx / d * 16, kz: dz / d * 16, silent: true });
        }
      }
    }
    this.animate(dt);
  }

  animate(dt) {
    const m = this.model;
    setCharacterScale(m, this.game.duel ? DUEL.size : 1); // duel fighters stand half as big again
    m.position.copy(this.pos);
    m.rotation.y = this.climb ? this.climb.ang + Math.PI : this.yaw;
    const bd = this.board;
    this.boardObj.visible = !!bd;
    if (bd) {
      // Stand sideways on the deck; the chest turns to your aim while you shoot or cast.
      const rig = m.userData.rig;
      bd.aimT = this.recoilT > 0 || this.meleeT > 0 || this.castT > 0 ? 0.55 : Math.max(0, bd.aimT - dt);
      this.rider.pre(m, this.boardObj, bd, dt, { pos: this.pos, yaw: this.yaw, fp: !!(rig && rig.firstPerson), tilt: groundTilt(this.game.world, this.pos.x, this.pos.z, bd.h), vy: this.vel.y });
    }
    const wp = this.weapon;
    // Weapon extras: a spinning rotor, a rocket or bolt that shows only while loaded, and the minigun's sound loop.
    if (!this.alive) this.spinT = 0;
    this.spinK = wp.bow ? this.bowDraw : wp.spin ? Math.min(1, this.spinT / wp.spin) : 0; // for a bow the "spin" is the draw
    let charge;
    if (wp.energy) {
      // Pulse Cannon: the emitters glow hot while it fires and dim while it recharges; the gauge shows the charge
      // left, filling back up through the recharge. Its hum is one long loop (audio.beamLoop).
      const firing = this.alive && this.game.now - (this.lastShot || -9) < 0.12;
      this.glowK = (this.glowK || 0) + ((this.reloadT > 0 ? 0.12 : firing ? 1 : 0.35) - (this.glowK || 0)) * Math.min(1, dt * 12);
      this.spinK = this.glowK;
      charge = this.reloadT > 0 ? 1 - this.reloadT / (this.reloadDur || 1) : this.ammo[this.cur] / this.magOf(wp);
      this.game.audio.beamLoop(firing, charge, !!wp.eyes);
      this.eyeGlow = this.reloadT > 0 ? 0.15 : firing ? 1 : 0.45;
    } else if (this.game.audio.beamL) this.game.audio.beamLoop(false, 0);
    animateWeapon(m.userData.weapon, this.spinK, dt, wp.bow ? this.alive && this.bowNock <= 0 : this.reloadT <= 0 && (wp.kind !== 'gun' || this.ammo[this.cur] > 0), charge);
    if (wp.spin) { this.game.audio.gunLoop(this.spinK, this.game.now - (this.lastShot || -9) < 0.12, 1 / wp.rate * this.stats.rate); this.loopOn = true; }
    else if (this.loopOn) { this.game.audio.gunLoopStop(); this.loopOn = false; }
    this.recoilT = Math.max(0, this.recoilT - dt * 9);
    m.userData.anim({
      speed: this.board ? 0 : this.speedNow, pitch: this.pitch, gun: wp.kind === 'gun', reload: this.reloadT > 0,
      weapon: true, melee: this.meleeT > 0 ? 1 - this.meleeT / Math.max(0.2, wp.rate / this.stats.rate) : 0, move: this.meleeMove | 0,
      cast: this.castT, dead: !this.alive, sprint: this.sprinting && this.recoilT === 0 && this.meleeT <= 0, recoil: this.recoilT, arc: wp.kind === 'melee' ? Math.min(360, wp.arc * this.stats.reach) : wp.arc,
      block: !!this.blocking, swing: this.swing ? this.swing.a : null, ads: this.ads || 0, adsUp: wp.adsUp ?? 0.075, adsBack: wp.adsBack ?? 0.78, scope: !!wp.scope, eyes: !!wp.eyes && this.alive, eyeGlow: this.eyeGlow || 0.45,
    }, dt, this.time);
    flushSwipes(m, this.game.fx);
    // The web line, from the hand the rig just posed up to the anchor.
    if (this.swing && this.alive) { const rig = m.userData.rig, a = this.swing.a; this.game.fx.webLine('me', rig ? rig.handWorld('Left') : this.chest(), [a.x, a.y, a.z], this.game.settings.view === 'first'); }
    if (bd) this.rider.post(m);
  }

  // The next slot the wheel lands on: weapons only, never the passive gear.
  nextSlot(dir = 1) {
    const L = this.weapons.length;
    for (let k = 1; k <= L; k++) {
      const i = (((this.cur + dir * k) % L) + L) % L, w = WEAPON_BY_ID[this.weapons[i]];
      if (w && w.kind !== 'gear') return i;
    }
    return this.cur;
  }

  swap(i) {
    const w = WEAPON_BY_ID[this.weapons[i]];
    if (i === this.cur || !w || w.kind === 'gear') return;
    this.cur = i;
    this.reloadT = 0;
    this.spinT = 0;
    this.bowDraw = 0; this.bowNock = 0; this.bowHold = 0;
    this.fireCd = Math.max(this.fireCd, 0.25);
    this.model.userData.setWeapon(this.heldId());
    this.game.audio.play('swap');
    if (this.game.ui && this.game.ui.padHints) this.game.ui.padHints();
  }

  magOf(wp) { return Math.round((wp.mag || 0) * this.stats.mag); } // Extended Mag grows every magazine

  reload() {
    const wp = this.weapon;
    if (wp.kind !== 'gun' || this.reloadT > 0 || this.ammo[this.cur] >= this.magOf(wp)) return;
    this.reloadT = this.reloadDur = wp.reload / Math.sqrt(this.stats.rate) * this.stats.reload;
    this.game.audio.play(wp.cool ? 'cooling' : wp.energy ? 'recharge' : 'reload');
  }

  muzzleWorld() {
    const wpn = this.model.userData.weapon;
    if (!wpn) return this.pos.clone().add(new THREE.Vector3(0, 1.5, 0));
    this.model.updateMatrixWorld(true);
    return wpn.userData.muzzle.clone().applyMatrix4(wpn.matrixWorld);
  }

  // Where the Laser Vision beams start: the rig's eyes, or in first person a little below and either side of the
  // camera so the beams read as your own.
  eyePoints(fp) {
    const rig = this.model.userData.rig;
    if (rig && rig.ok) { this.model.updateMatrixWorld(true); return rig.eyesWorld(fp ? { x: 0.12, y: -0.1, z: 0.16 } : null); }
    const r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)), e = this.pos.clone().add(new THREE.Vector3(0, 1.62, 0));
    return [e.clone().addScaledVector(r, 0.035), e.clone().addScaledVector(r, -0.035)];
  }

  // Laser Vision: a hitscan pulse from between the eyes along the aim, drawn as a beam from each eye. Rapid like the
  // Pulse Cannon (every pulse counts on the host, every third shows a number); the charge is the magazine, cooling the reload.
  shootLaser(wp) {
    const g = this.game;
    this.ammo[this.cur]--;
    this.recoilT = 0.5;
    this.fireCd = wp.rate / this.stats.rate;
    const n = (this.shotN = (this.shotN || 0) + 1), reach = wp.range || 120, fp = (g.settings.view === 'first' || !!g.fpNow);
    this.lastShot = g.now;
    const eyes = this.eyePoints(fp);
    const origin = tmp2.copy(eyes[0]).add(eyes[1]).multiplyScalar(0.5);
    const dir = tmp.copy(g.aim.point).sub(origin).normalize();
    // The beam burns through every enemy standing in its line and only stops at the ground or a wall.
    const hits = g.rayHit(origin, dir, reach, wp.pierce || 1);
    const end = g.groundRay(origin, dir, reach);
    for (const h of hits) {
      const dmg = wp.dmg * this.stats.dmg * (ZONE_K[h.zone] || 1);
      this.mgAcc = (this.mgAcc || 0) + dmg;
      const show = n % 3 === 0;
      g.damage(h.t, dmg, { at: h.point, zone: h.zone, head: h.head, silent: !show, silentNum: !show, shown: this.mgAcc });
      if (show) this.mgAcc = 0;
      if (n % 2 === 0) g.fx.laserHit([h.point.x, h.point.y, h.point.z]);
    }
    if (n % 2 === 0 && end.hit) g.fx.laserHit([end.x, end.y, end.z]);
    g.fx.laserBeams(eyes, [end.x, end.y, end.z], 'me', fp);
    g.recoil(wp.kick ?? 0.03);
    if (n % 2 === 0) g.emitFx(['shot', q10(origin.x), q10(origin.y), q10(origin.z), q10(end.x), q10(end.y), q10(end.z), wp.id]);
    if (this.ammo[this.cur] === 0) this.reload();
  }

  shoot() {
    const g = this.game, wp = this.weapon;
    if (this.reloadT > 0) return;
    if (this.ammo[this.cur] <= 0) { this.reload(); g.audio.play('empty'); this.fireCd = 0.25; return; }
    if (wp.spin && this.spinT < wp.spin) return; // rotary gun still spinning up
    if (wp.eyes) return this.shootLaser(wp);
    if (wp.deploy) return this.deployTurret(wp);
    this.ammo[this.cur]--;
    this.recoilT = 1;
    this.tapT = g.now;
    this.fireCd = (wp.spin ? Math.min(0, this.fireCd) : 0) + wp.rate / this.stats.rate;
    const origin = this.muzzleWorld();
    if (wp.proj) { this.fireProjectile(wp, origin); if (this.ammo[this.cur] === 0) this.reload(); return; }
    if (wp.bolt) {
      // Crossbow: a real bolt flies (and can end up stuck in whoever it hits), not a hitscan line.
      let dir = tmp.copy(g.aim.point).sub(origin).normalize();
      if (dir.dot(g.aim.dir) < 0.3) dir = g.aim.dir.clone();
      launchArrow(g, [origin.x, origin.y, origin.z], [dir.x, dir.y, dir.z], { speed: wp.boltSpeed || 95, dmg: wp.dmg * this.stats.dmg, pierce: wp.pierce || 1, mine: true, range: 160, proto: boltProto() });
      g.audio.play('shot_crossbow', 0.9); g.recoil(wp.kick ?? 0.4); this.lastShot = g.now;
      const end = origin.clone().addScaledVector(dir, 60);
      g.emitFx(['shot', q10(origin.x), q10(origin.y), q10(origin.z), q10(end.x), q10(end.y), q10(end.z), wp.id]);
      if (this.ammo[this.cur] === 0) this.reload();
      return;
    }
    // Rapid-fire (minigun): hits and effects are thinned out so 28 rounds a second stay cheap.
    const rapid = !!(wp.spin || wp.rapid), n = (this.shotN = (this.shotN || 0) + 1), reach = wp.range || 160;
    if (rapid) { this.heat = Math.min(1, this.heat + 0.035); this.lastShot = g.now; }
    const spread = wp.spreadMax ? wp.spread + (wp.spreadMax - wp.spread) * this.heat : wp.spread;
    const pellets = wp.pellets || 1;
    let lastEnd = null, gravAt = null;
    for (let i = 0; i < pellets; i++) {
      const dir = tmp.copy(g.aim.point).sub(origin).normalize();
      const sp = spread * (this.speedNow > 7 ? 1.6 : 1) * (this.onGround ? 1 : 2) * (1 - 0.6 * this.ads);
      dir.x += (Math.random() - 0.5) * sp * 2; dir.y += (Math.random() - 0.5) * sp * 2; dir.z += (Math.random() - 0.5) * sp * 2;
      dir.normalize();
      const hits = g.rayHit(origin, dir, reach, wp.pierce || 1);
      // The Veteran's rounds mend allies: a teammate in the line of fire is healed, not hurt.
      const mate = this.ch.healShots && (!rapid || n % 3 === 0) ? g.teammateOnRay(origin, dir, hits.length ? hits[0].point.distanceTo(origin) : 160) : null;
      let end;
      if (wp.grav) {
        // Gravity Gun: the well opens on whatever the shot meets first: an enemy, a teammate (a prank), the other duelist or the ground.
        const gm = g.teammateOnRay(origin, dir, hits.length ? hits[0].dist : reach), gh = gm || hits[0];
        if (gh) end = gravAt = gh.point;
        else { end = g.groundRay(origin, dir, reach); if (end.hit) gravAt = end; }
      } else if (mate) {
        const amt = Math.max(4, Math.round(wp.dmg * this.stats.dmg * 0.45)) * (rapid ? 3 : 1);
        g.healTeammate(mate.id, amt);
        end = mate.point;
        g.fx.tracer([origin.x, origin.y, origin.z], [end.x, end.y, end.z], [0.4, 1, 0.5]);
        const mv = g.views.players.get(mate.id);
        if (mv) g.el.healAura([mv.pos.x, mv.pos.y, mv.pos.z]);
        g.el.healAura([this.pos.x, this.pos.y, this.pos.z], 0.4);
      } else if (hits.length) {
        for (const h of hits) {
          const dmg = wp.dmg * this.stats.dmg * (ZONE_K[h.zone] || 1);
          if (wp.ice) { this.iceHit(h.t, dmg, wp.ice, h.point, h.head); continue; }
          if (!rapid) { g.damage(h.t, dmg, { at: h.point, zone: h.zone, head: h.head }); continue; }
          // Minigun and Pulse Cannon: every bullet counts on the host, but only every third makes a number, blood and a tick.
          this.mgAcc = (this.mgAcc || 0) + dmg;
          const show = n % 3 === 0;
          g.damage(h.t, dmg, { at: h.point, zone: h.zone, head: h.head, silent: !show, silentNum: !show, shown: this.mgAcc });
          if (show) this.mgAcc = 0;
        }
        end = hits[hits.length - 1].point;
      } else {
        end = g.groundRay(origin, dir, reach);
        if (end.hit && wp.energy) { if (n % 2 === 0) g.fx.pulseHit([end.x, end.y, end.z]); }
        else if (end.hit && (!rapid || n % 3 === 0)) g.fx.impact([end.x, end.y, end.z]);
      }
      if (wp.energy && hits.length && n % 2 === 0) g.fx.pulseHit([end.x, end.y, end.z]);
      if (wp.energy) g.fx.shotFx(wp, [origin.x, origin.y, origin.z], [end.x, end.y, end.z], 'me', (g.settings.view === 'first' || !!g.fpNow));
      else if (!rapid || n % 2 === 0) g.fx.tracer([origin.x, origin.y, origin.z], [end.x, end.y, end.z], wp.tracer, wp.beamLen);
      lastEnd = end;
    }
    if (gravAt) this.gravShot(gravAt);
    if (wp.energy) { if (n % 2 === 0) g.fx.pulseMuzzle([origin.x, origin.y, origin.z], (g.settings.view === 'first' || !!g.fpNow) ? 0.3 : 1); }
    else if (!wp.quiet && (!rapid || n % 2 === 0)) g.fx.muzzle([origin.x, origin.y, origin.z], [g.aim.dir.x, g.aim.dir.y, g.aim.dir.z], undefined, flashSize(wp.id));
    if (!rapid) g.audio.play('shot_' + wp.id, wp.quiet ? 0.8 : 1); // the minigun and Pulse Cannon sound as one continuous loop (audio.gunLoop / beamLoop)
    g.recoil(wp.kick ?? (wp.id === 'shotgun' || wp.id === 'coach' || wp.id === 'revolver' || wp.id === 'dmr' || wp.id === 'lever' ? 1 : 0.35));
    if (!rapid || n % (wp.energy ? 2 : 3) === 0) g.emitFx(['shot', q10(origin.x), q10(origin.y), q10(origin.z), q10(lastEnd.x), q10(lastEnd.y), q10(lastEnd.z), wp.id]);
    if (this.ammo[this.cur] === 0) this.reload();
  }

  // Gravity Gun: open a well at `at`. The host pulls and blasts the enemies (request 'gv'); everyone sees the vortex ('gv'
  // fx) and everyone but you is dragged in. You are never pulled or hurt.
  gravShot(at) {
    const g = this.game, y = Math.max(at.y, g.world.heightAt(at.x, at.z)), c = [at.x, y, at.z];
    g.gravWell(c, g.party.myId);
    g.request('gv', [...c.map(q10), Math.round(this.stats.dmg * 100)]);
    g.emitFx(['gv', ...c.map(q10)]);
  }

  // Dragged toward a well's centre (a teammate's Gravity Gun, or the other duelist's): a quick hop, then a firm pull
  // that lands you in the clump as it collapses, and a comedic toss outward at the end. No damage here, ever.
  gravStep(dt) {
    const G = this.gravPull;
    if (!G || !this.alive) { this.gravPull = null; return; }
    if (G.t === GRAV.dur && this.onGround) { this.vel.y = 6; this.onGround = false; }
    G.t -= dt;
    const dx = G.x - this.pos.x, dz = G.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
    if (G.t <= 0) {
      this.gravPull = null;
      this.vel.x -= (dx / d) * 5; this.vel.z -= (dz / d) * 5; this.vel.y = Math.max(this.vel.y, 6);
      return;
    }
    const sp = Math.min(13, Math.max(0, d - 1.2) / Math.max(0.2, G.t - 0.1) * 1.3);
    this.pos.x += (dx / d) * sp * dt; this.pos.z += (dz / d) * sp * dt;
  }

  // Ice Gun: a hit target is sealed in an ice block. Bosses only freeze for a shorter spell.
  iceHit(t, dmg, secs, at, head) {
    const g = this.game;
    const boss = t.kind === 'boss';
    const sec = boss ? Math.min(secs, 2) : secs;
    if (t.kind === 'player') { g.damage(t, dmg, { at, head, lock: sec, slow: sec }); return; } // the other duelist seals themselves in ice when the hit lands (takeStatus)
    const iced = t.view && t.view.icedUntil > g.now;
    g.damage(t, dmg, iced ? { at, head } : { at, head, lock: sec, slow: sec });
    if (iced || t.id === 'D' || !t.view) return;
    t.view.icedUntil = g.now + sec;
    g.el.encase(t.view, t.r, t.h, sec);
    g.emitFx(['ic', t.id, q10(t.r), q10(t.h), q10(sec)]);
  }

  // Rocket or grenade launcher: spawns a visible projectile. Its blast damage is reported (like Fireball and
  // Meteor) as hits by game.launchProjectile; teammates see it through the 'rk' effect. You are never hurt by your own blast.
  fireProjectile(wp, origin) {
    const g = this.game;
    const to = tmp.copy(g.aim.point).sub(origin);
    let dir = to.clone().normalize();
    if (dir.dot(g.aim.dir) < 0.3) dir = g.aim.dir.clone(); // target right under the muzzle: just fire along the view
    if (wp.proj === 'grenade') {
      // Lob it so it lands on the crosshair: low-angle ballistic solution for speed v under gravity G.
      const G = 17, v = wp.speed, dx = Math.hypot(to.x, to.z), dy = to.y;
      if (dx > 1.5) {
        const disc = v * v * v * v - G * (G * dx * dx + 2 * dy * v * v);
        const th = disc >= 0 ? Math.atan2(v * v - Math.sqrt(disc), G * dx) : Math.PI / 4;
        dir = new THREE.Vector3(to.x / dx * Math.cos(th), Math.sin(th), to.z / dx * Math.cos(th));
      }
    }
    const oa = [origin.x, origin.y, origin.z], da = [dir.x, dir.y, dir.z];
    g.launchProjectile(wp.proj, oa, da, { mine: true, dmg: wp.dmg * this.stats.dmg, radius: wp.radius, falloff: wp.falloff, kb: wp.kb, speed: wp.speed });
    g.fx.muzzle(oa, da);
    // Rocket backblast: a puff of smoke and flame out of the rear venturi.
    const wpn = this.model.userData.weapon;
    if (wp.proj === 'rocket' && wpn && wpn.userData.back) {
      const b = wpn.userData.back.clone().applyMatrix4(wpn.matrixWorld), first = (g.settings.view === 'first' || !!g.fpNow);
      for (let i = 0; i < (first ? 4 : 12); i++) g.fx.smoke.emit({ p: [b.x, b.y, b.z], v: [-dir.x * rnd(3, 9) + rnd(-2, 2), rnd(-0.5, 1.5), -dir.z * rnd(3, 9) + rnd(-2, 2)], life: rnd(0.8, 1.6), s0: 0.4, s1: rnd(1.6, 3), c0: [0.7, 0.68, 0.65, 0.5], c1: [0.6, 0.6, 0.6, 0], drag: 2 });
      if (!first) for (let i = 0; i < 6; i++) g.fx.fire.emit({ p: [b.x, b.y, b.z], v: [-dir.x * rnd(8, 18), rnd(-1, 1), -dir.z * rnd(8, 18)], life: rnd(0.1, 0.22), s0: 0.5, s1: 0.1, c0: [1, 0.7, 0.3, 0.8], c1: [1, 0.3, 0.05, 0], drag: 3 });
    }
    g.audio.play('shot_' + wp.id);
    g.recoil(wp.kick ?? 1);
    g.shake(wp.proj === 'rocket' ? 0.28 : 0.14);
    g.emitFx(['rk', ...oa.map(q10), ...da.map((x) => Math.round(x * 100)), WEAPONS.indexOf(wp)]);
  }

  // Longbow. Holding fire draws the bow (wp.draw seconds to full), letting go looses the arrow: a quick tap is a weak
  // short lob, a full draw a fast flat shot that goes through two enemies. A new arrow is nocked wp.nock seconds after
  // the shot (infinite arrows: no magazine, no reload). Held at full draw the aim wanders a little, much less when
  // aiming down the shaft. A CPU player (game.brain) cannot let go of the button, so it looses at full draw.
  bowStep(dt, input) {
    const g = this.game, wp = this.weapon;
    const held = (input.mouseDown || input.padFire) && !this.dash && !this.blocking && this.alive;
    // undo last frame's wobble so it never accumulates into a drift
    this.yaw -= this.bowWob[0]; this.pitch -= this.bowWob[1]; this.bowWob[0] = this.bowWob[1] = 0;
    if (this.bowNock > 0) { this.bowNock -= dt; if (this.bowNock <= 0 && g.audio.ctx && g.audio.sfxOn) g.audio.noiseHit({ dur: 0.04, freq: 2600, type: 'bandpass', q: 5, gain: 0.12 }); }
    if (this.bowNock > 0) { this.bowDraw = 0; this.bowHold = 0; return; }
    if (held && this.fireCd <= 0) {
      const was = this.bowDraw;
      this.bowDraw = Math.min(1, this.bowDraw + dt / (wp.draw || 0.9));
      this.bowHold += dt;
      // the stave creaks as it comes back
      if (Math.floor(this.bowDraw * 6) !== Math.floor(was * 6) && this.bowDraw < 1 && g.audio.ctx && g.audio.sfxOn) g.audio.noiseHit({ dur: 0.09, freq: 420 + 900 * this.bowDraw, type: 'bandpass', q: 7, gain: 0.05 + 0.04 * this.bowDraw });
      if (was < 1 && this.bowDraw >= 1 && g.audio.ctx && g.audio.sfxOn) g.audio.tone({ freq: 220, to: 180, dur: 0.12, type: 'triangle', gain: 0.03 });
      if (this.bowDraw >= 1 && g.brain) { this.looseArrow(this.bowDraw); return; }
      // Aim wobble: grows the longer a full draw is held, steadied by the sights.
      const k = this.bowDraw * (1 - 0.85 * this.ads) * 0.0038 * Math.max(0, Math.min(1, (this.bowHold - 0.7) / 1.6)), t = this.time;
      this.bowWob[0] = (Math.sin(t * 1.7) + 0.5 * Math.sin(t * 3.3)) * k; this.bowWob[1] = Math.cos(t * 2.3) * k * 0.7;
      this.yaw += this.bowWob[0]; this.pitch += this.bowWob[1];
    } else if (this.bowDraw > 0) this.looseArrow(this.bowDraw);
    else this.bowHold = 0;
  }

  // Let the arrow go at draw `a` (0..1): speed, damage, range and piercing all scale with it.
  looseArrow(a) {
    const g = this.game, wp = this.weapon;
    const speed = (wp.minSpeed || 22) + ((wp.speed || 75) - (wp.minSpeed || 22)) * a;
    const dmg = wp.dmg * this.stats.dmg * (0.25 + 0.75 * a), pierce = a >= 0.97 ? (wp.pierce || 2) : 1;
    const origin = this.muzzleWorld();
    const to = tmp.copy(g.aim.point).sub(origin);
    let dir = to.clone().normalize();
    if (dir.dot(g.aim.dir) < 0.3) dir = g.aim.dir.clone(); // target right under the arrow: just fire along the view
    const wpn = this.model.userData.weapon, style = wpn && wpn.userData.bowStyle;
    this.lastArrow = launchArrow(g, [origin.x, origin.y, origin.z], [dir.x, dir.y, dir.z], { speed, dmg, pierce, style, mine: true, range: wp.range || 120 });
    this.lastArrow.draw = a;
    this.bowDraw = 0; this.bowHold = 0; this.bowNock = wp.nock || 0.5; this.fireCd = 0.1; this.recoilT = 0.4 + 0.6 * a; this.lastShot = g.now;
    g.audio.play('shot_crossbow', 0.45 + 0.55 * a);
    if (g.audio.ctx && g.audio.sfxOn) g.audio.tone({ freq: 160 + 160 * a, to: 70, dur: 0.14, type: 'triangle', gain: 0.1 * a });
    g.recoil((wp.kick ?? 0.3) * (0.3 + 0.7 * a));
    // Teammates see a tracer along the first stretch of the flight (and hear the string).
    const end = origin.clone().addScaledVector(dir, Math.min(40, (wp.range || 120)));
    g.emitFx(['shot', q10(origin.x), q10(origin.y), q10(origin.z), q10(end.x), q10(end.y), q10(end.z), wp.id]);
  }

  // Rotary gun spin-up/down and the way sustained fire builds spread; also sets the speed penalty while spun up.
  gunSpin(dt, wp, held) {
    if (wp.spin) {
      const can = held && this.ammo[this.cur] > 0;
      this.spinT = can ? Math.min(wp.spin, this.spinT + dt) : Math.max(0, this.spinT - dt * (wp.spin / 0.9));
    } else this.spinT = 0;
    this.spinMove = wp.spin ? 1 - (1 - (wp.moveMul || 1)) * (this.spinT / wp.spin) : 1;
    if (!held) this.heat = Math.max(0, this.heat - dt * 1.5);
  }

  melee() {
    const wp = this.weapon;
    if (wp.summon || wp.heal) { // Zombie Staff: lift it overhead, slam the butt into the ground, five zombies claw out. Healing Staff: the same lift, then the beams
      if (this.staffCd > 0) { this.fireCd = 0.25; this.game.ui.toast('Staff recharging ' + Math.ceil(this.staffCd) + ' s', 'bad'); return; }
      this.staffCd = wp.cd * this.stats.cdr;
      this.fireCd = wp.rate / this.stats.rate;
      this.meleeT = wp.rate / this.stats.rate;
      this.meleePending = this.meleeT * (wp.heal ? 0.4 : 0.52); // the Healing Staff fires at the top of its lift
      this.game.audio.play('swing');
      this.game.emitFx(['melee', q10(this.pos.x), q10(this.pos.z), Math.round(this.yaw * 100), wp.id]);
      return;
    }
    // Each weapon's attacks alternate (meleemoves.js): slash then stab, chop then cut, and so on.
    if (MELEE_V2) {
      this.meleeMove = ((this.meleeMove | 0) + 1) % movesFor(wp).length;
      this.stab = moveOf(wp, this.meleeMove).type === 'thrust';
    } else {
      if (wp.shield) { this.stab = !this.stab; const wo = this.model.userData.weapon; if (wo) wo.userData.style = this.stab ? 'thrust' : undefined; } // sword and shield: slash, stab, slash, stab
      if (wp.id === 'axe' || wp.id === 'fireaxe') { this.chopAlt = !this.chopAlt; const wo = this.model.userData.weapon; if (wo) wo.userData.style = this.chopAlt ? 'chop' : undefined; } // axes: overhead chop, horizontal cut
    }
    this.fireCd = wp.rate / this.stats.rate;
    this.meleeT = Math.max(0.2, wp.rate / this.stats.rate);
    this.meleePending = MELEE_V2 ? Math.min(0.3, Math.max(0.1, this.meleeT * 0.38)) : 0.1; // the hit lands as the strike comes through
    this.game.audio.play('swing');
    this.game.emitFx(['melee', q10(this.pos.x), q10(this.pos.z), Math.round(this.yaw * 100), wp.id]);
  }

  // The staff's butt hits the ground: a shock of dust and bone-white light, then the zombies rise around you.
  staffSlam() {
    const g = this.game, o = [this.pos.x, this.pos.y, this.pos.z];
    g.request('npc', 'zombie');
    g.audio.play('summon');
    g.shake(0.45);
    g.fx.impact(o);
    g.fx.shockwave(o, 5, 0xff5a1a, 0.45);
    g.emitFx(['zs', ...o.map(q10)]);
  }

  // The Healing Staff is raised: every living teammate, wherever they are on the map, is mended and a bending beam of light
  // curls out to each (never to the other duelist). Each ally's own client applies the heal ('hs' fx); you mend HEAL.self.
  staffHeal() {
    const g = this.game, wp = this.weapon;
    const ids = g.duel ? [] : [...g.views.players].filter(([, v]) => v.alive).map(([id]) => id);
    this.heal(this.stats.maxHp * HEAL.self);
    g.el.holyBurst([this.pos.x, this.pos.y, this.pos.z], 0.5); // solo or not, you glow too
    g.healStaffFx(() => this.muzzleWorld().toArray(), ids, Math.round(wp.heal * 100), g.party.myId);
    g.shake(0.12);
    g.emitFx(['hs', Math.round(wp.heal * 100), ...ids]);
  }

  // The height the crosshair points at, at this target's distance, mapped to a hit zone (body when aimed off the target).
  meleeZone(t) {
    const g = this.game, c = g.camera && g.camera.position, a = g.aim && g.aim.point;
    if (!c || !a || t.kind === 'demon') return 'body';
    const dx = a.x - c.x, dz = a.z - c.z, hl = Math.hypot(dx, dz);
    if (hl < 1e-3) return 'body';
    const y = c.y + ((a.y - c.y) / hl) * Math.hypot(t.x - c.x, t.z - c.z);
    if (y < t.y - 0.4 || y > t.y + t.h + 0.4) return 'body';
    return zoneOf({ ...t, y: t.y }, Math.min(t.y + t.h, Math.max(t.y, y)), 0);
  }

  meleeHit() {
    const g = this.game, wp = this.weapon;
    const rm = wp.kind === 'melee' ? this.stats.reach : 1; // Reaper's Reach: wider swing and longer reach while a melee weapon is in hand
    // The move shapes the hit: a thrust is narrow, reaches farther and hits harder; a chop is narrower and heavier.
    const hs = MELEE_V2 && wp.kind === 'melee' && !wp.cane ? hitShape(moveOf(wp, this.meleeMove), wp) : wp.shield && this.stab ? { arc: 40, reach: 1.2, dmg: 1.3 } : { arc: wp.arc, reach: 1, dmg: 1 };
    const arc = (Math.min(360, hs.arc * rm) * Math.PI) / 180 / 2, reach = wp.range * rm * hs.reach, dmgMul = hs.dmg;
    let hitAny = false, n = 0;
    for (const t of g.targets()) {
      const dx = t.x - this.pos.x, dz = t.z - this.pos.z;
      const d = Math.hypot(dx, dz) - t.r;
      if (d > reach) continue;
      if (t.view && t.view.fly && t.view.fy > 2.6) continue; // out of reach overhead
      let da = Math.atan2(dx, dz) - this.yaw;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > arc && d > 0.6) continue;
      const kb = wp.kb || (wp.id === 'axe' ? 10 : 5);
      const dd = Math.hypot(dx, dz) || 1;
      // A wide swing can hit a whole crowd: only the first few hits get numbers, blood and sound.
      // Where the crosshair is on the body picks the hit zone: head = critical, legs = weakest.
      const zone = this.meleeZone(t), zy = t.y + t.h * (zone === 'head' ? 0.9 : zone === 'leg' ? 0.3 : 0.6);
      g.damage(t, wp.dmg * dmgMul * this.stats.dmg * (ZONE_K[zone] || 1), { kx: dx / dd * kb, kz: dz / dd * kb, at: [t.x, zy, t.z], zone, head: zone === 'head', silent: n >= 4 });
      hitAny = true; n++;
    }
    // The swing trail is drawn from the blade itself (CharacterRig -> FX.swipe), not here.
    if (hitAny) g.audio.play('hit_melee');
  }

  // Ability mastery: damage multiplier for the move with this id.
  mm(id) {
    for (const k of ['q', 'r', 'e']) if (this.cls[k].id === id) return this.stats.mast[k].dmg;
    return 1;
  }

  // ---------- XP and level-ups ----------
  addXp(n) {
    if ((!this.alive && this.out) || this.game.duel) return;
    this.xp += n * this.stats.xpGain;
    let guard = 0;
    while (this.xp >= this.xpNeed && guard++ < 6) {
      this.xp -= this.xpNeed;
      this.level++;
      this.xpNeed = XP.need(this.level);
      this.levelUp();
    }
  }

  // Each level opens the ten-card pick (openElem); nothing is granted until the player chooses.
  levelUp() {
    const g = this.game;
    this.elemPending++;
    g.ui.levelUp(this.level);
    if (g.dailyOn && g.dailyOn()) { Dailies.add('levels'); Dailies.best('level', this.level); }
    g.audio.play('crate', 0.6);
    g.fx.shockwave([this.pos.x, this.pos.y + 0.1, this.pos.z], 6, 0xffe08a, 0.5);
  }

  takePowerup(pu) {
    if (pu.id === 'heal') { this.hp = this.stats.maxHp; return; }
    this.powerups.push(pu);
    this.recomputeStats();
  }

  // Orbiting blades and the burning aura.
  tickSpecials(dt) {
    const g = this.game, s = this.stats;
    if (!this.alive) { this.orbitGroup && (this.orbitGroup.visible = false); return; }
    if (s.orbit > 0) {
      if (!this.orbitGroup || this.orbitGroup.userData.n !== s.orbit) this.buildOrbit(s.orbit);
      const og = this.orbitGroup;
      og.visible = true;
      og.position.set(this.pos.x, this.pos.y + 1.0, this.pos.z);
      og.rotation.y += dt * 3.4;
      for (const h of og.children) if (h.userData.spin) h.userData.spin.rotation.x += dt * 9; // each dagger rolls as it flies
      this.orbitT -= dt;
      if (this.orbitT <= 0) {
        this.orbitT = 0.12;
        const R = 2.6, n = s.orbit, dmg = 16 * s.dmg;
        for (const t of g.targets()) {
          if (t.kind === 'demon' || t.mini) continue;
          const dist = Math.hypot(t.x - this.pos.x, t.z - this.pos.z);
          if (Math.abs(dist - R) > t.r + 0.9) continue;
          const ang = Math.atan2(t.x - this.pos.x, t.z - this.pos.z);
          let hit = false;
          for (let i = 0; i < n; i++) {
            const ba = og.rotation.y + (i / n) * Math.PI * 2;
            let d = Math.abs(((ang - ba + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
            if (d * R < t.r + 1.0) { hit = true; break; }
          }
          if (!hit) continue;
          const last = this.orbitHit.get(t.id) || 0;
          if (g.now - last < 0.45) continue;
          this.orbitHit.set(t.id, g.now);
          g.damage(t, dmg, { silentNum: true, kx: (t.x - this.pos.x) / dist * 5, kz: (t.z - this.pos.z) / dist * 5 });
        }
        if (this.orbitHit.size > 80) this.orbitHit.clear();
      }
    } else if (this.orbitGroup) this.orbitGroup.visible = false;
    if (s.aura > 0) {
      // Scorching Aura: a ring of real fire around you. Everything inside it burns; each stack widens the ring,
      // makes the flames taller and hotter, and burns harder.
      const r = auraRadius(s.aura);
      if (!this.fireRing) { this.fireRing = makeFireRing(); g.scene.add(this.fireRing); }
      this.fireRing.visible = this.alive;
      this.fireRing.position.set(this.pos.x, this.pos.y + 0.02, this.pos.z);
      this.fireRing.userData.set(r, s.aura, g.now);
      this.auraT -= dt;
      if (this.auraT <= 0 && this.alive) {
        this.auraT = 0.5;
        g.areaDamage([this.pos.x, this.pos.y + 1, this.pos.z], r, (6 + 4 * s.aura) * s.dmg, { silentNum: true, burn: 1 + 0.3 * s.aura });
        const e = g.fx.spark;
        for (let i = 0; i < 3 + s.aura; i++) { const a = Math.random() * 6.283; e.emit({ p: [this.pos.x + Math.sin(a) * r, this.pos.y + 0.5, this.pos.z + Math.cos(a) * r], v: [(Math.random() - 0.5), 2 + Math.random() * 3, (Math.random() - 0.5)], life: 1.1, s0: 0.12, s1: 0.03, c0: [1, 0.65, 0.2, 1], c1: [1, 0.2, 0, 0], turb: 2 }); }
      }
    } else if (this.fireRing) { g.scene.remove(this.fireRing); this.fireRing = null; }
  }

  buildOrbit(n) {
    const g = this.game;
    if (this.orbitGroup) { g.scene.remove(this.orbitGroup); }
    const grp = makeOrbitBlades(n, this.cls.color || 0xaaccff);
    g.scene.add(grp);
    this.orbitGroup = grp;
  }

  // ---------- abilities ----------
  cast(key) {
    const g = this.game;
    if (this.cds[key] > 0 || !this.alive) return;
    const ab = this.cls[key];
    const ok = this['ab_' + ab.id] && this['ab_' + ab.id]();
    if (ok === false) return;
    this.cds[key] = (this.game.duel ? DUEL.cd : ab.cd) * this.stats.cdr * this.stats.mast[key].cd; // every power is 5 s in the arena
    this.castT = 0.35;
    g.ui.flashAbility(key);
    if (g.dailyOn && g.dailyOn()) Dailies.add('casts');
  }

  // The dash hurts whatever it passes through, with the character's element on top.
  dashStrike() {
    const g = this.game, el = this.cls.element;
    const o = { kx: this.dash.vx * 0.5, kz: this.dash.vz * 0.5 };
    if (el === 'Fire') o.burn = 2; else if (el === 'Frost') o.slow = 1.5; else if (el === 'Earth') o.kx *= 0.4, o.kz *= 0.4;
    for (const t of g.targets()) {
      if (t.kind === 'demon' || this.dashHit.has(t.id)) continue;
      if (Math.hypot(t.x - this.pos.x, t.z - this.pos.z) < t.r + 1.3 && Math.abs(t.y - this.pos.y) < t.h + 1.5) {
        this.dashHit.add(t.id);
        g.damage(t, this.dashDmg, { ...o, at: [t.x, t.y + t.h * 0.6, t.z] });
      }
    }
  }

  // Every character's dash: a short invulnerable burst of speed that shows their element.
  doDash() {
    const g = this.game;
    if (this.cds.d > 0 || !this.alive || this.dash) return;
    const dir = this.moveDir || [Math.sin(this.yaw), Math.cos(this.yaw)];
    const { t } = DASH, dist = DASH.dist * this.perks.dashDist;
    const a = [this.pos.x, this.pos.y, this.pos.z];
    const b = [a[0] + dir[0] * dist, a[1], a[2] + dir[1] * dist];
    this.dash = { t, vx: dir[0] * dist / t, vz: dir[1] * dist / t };
    this.invulnUntil = Math.max(this.invulnUntil || 0, g.now + t + 0.08);
    this.cds.d = DASH.cd * this.stats.cdr * this.stats.mast.d.cd;
    this.dashHit = new Set();
    this.dashDmg = DASH.dmg * this.stats.dmg * this.stats.mast.d.dmg;
    // The trail left behind keeps biting for a couple of seconds: fire burns, frost slows, storm shocks, earth crushes, wind cuts.
    const el = this.cls.element, tdmg = 7 * this.stats.dmg * this.stats.mast.d.dmg;
    const to = el === 'Fire' ? { burn: 2 } : el === 'Frost' ? { slow: 1.5 } : el === 'Storm' ? { freeze: 0.3 } : el === 'Wind' ? { slow: 0.6 } : {};
    g.el.dash(el, a, b, (p, q, k) => g.lineDamage(p, q, 1.15, tdmg * (el === 'Earth' ? 1.5 : 1) * (0.5 + 0.5 * k), { ...to, silentNum: true }));
    g.audio.play('wind', 0.5);
    g.ui.flashAbility('d');
    g.emitFx(['dh', CLASSES.indexOf(this.cls), ...a.map(q10), ...b.map(q10)]);
  }

  // ---------- jetpack ----------
  hasGear(k) { return this.gears.has(k); }
  jetEquipped() { return this.hasGear('jet'); } // like the Web Swing: picking it on the wall is all it takes

  jetStep(dt, input) {
    const g = this.game, J = this.jet, k = input.keys;
    const eq = this.jetEquipped();
    if (!eq || !this.alive || this.board || this.climb) J.on = false;
    input.jetOn = J.on; // lets the controller keep L3 for descending instead of toggling sprint
    // Double-tap Jump: the second tap lights the jets.
    if (eq && this.alive && !this.board && !this.climb && input.pressed.has('Space')) {
      if (!J.on && g.now - J.tapT < JET.tap && J.fuel > 8) {
        J.on = true; J.idle = 0;
        if (this.onGround) { this.pos.y += 0.05; this.onGround = false; }
        g.audio.play('ui', 0.5);
      }
      J.tapT = g.now;
    }
    let level = 0;
    if (J.on) {
      // Descend: Shift on keyboard, L3 on a controller (also Ctrl / Z). Tap it twice to drop straight to the ground.
      const hold = k.has('Space'), dive = DIVE_KEYS.some((c) => k.has(c));
      if (DIVE_KEYS.some((c) => input.pressed.has(c))) {
        if (g.now - J.diveT < JET.tap + 0.1) {
          J.on = false; J.diveT = -9; J.idle = 0;
          this.vel.y = -62; this.vel.x *= 0.4; this.vel.z *= 0.4;
          g.audio.play('ui', 0.5);
        } else J.diveT = g.now;
      }
      if (!J.on) { /* slammed to the ground this frame */ } else if (hold && J.fuel > 0) {
        this.vel.y = Math.min(JET.climb, this.vel.y + JET.thrust * dt);
        J.fuel -= JET.burn * dt; level = 1;
      } else if (dive) {
        this.vel.y += (-10 - this.vel.y) * Math.min(1, 5 * dt);
        J.fuel -= 3 * dt; level = 0.25;
      } else {
        // Hands off: the jets idle and hold a slow, steady sink.
        this.vel.y += (-1.6 - this.vel.y) * Math.min(1, 4 * dt);
        J.fuel -= JET.hoverBurn * dt; level = 0.4;
      }
      const ceil = g.world.heightAt(this.pos.x, this.pos.z) + JET.ceiling;
      if (this.pos.y > ceil) { this.pos.y = ceil; this.vel.y = Math.min(0, this.vel.y); }
      if (J.fuel <= 0) { J.fuel = 0; J.on = false; g.ui.toast('Jetpack out of fuel', 'bad'); }
      else if (this.onGround && this.vel.y <= 0 && !hold) J.on = false;
      J.idle = 0;
    } else {
      J.idle += dt;
      if (J.idle > JET.regenDelay && J.fuel < JET.fuel) J.fuel = Math.min(JET.fuel, J.fuel + JET.regen * (this.onGround ? 1 : 0.3) * dt);
    }
    J.level += (level - J.level) * Math.min(1, dt * 10);
    this.pack.visible = eq && this.alive;
    jetFx(this.pack, J.level, g.fx, dt, this.time);
    g.audio.jet(this.pack.visible ? J.level : 0);
  }

  // ---------- wings (tier-3 gear) ----------
  // X flaps: every press lifts you a little (stamina permitting), so you climb bit by bit. In the air, hold Sprint to spread the
  // wings and soar: you glide fast along your view, nose down to dive, nose up to climb, until the stamina runs dry.
  wingStep(dt, input, sprint) {
    const g = this.game, W = this.wing, k = input.keys;
    const eq = this.hasGear('wings');
    if (!eq || !this.alive || this.board || this.climb || this.swing || this.jet.on || this.dash) W.soar = false;
    if (this.onGround) W.soar = false;
    if (W.cd > 0) W.cd -= dt;
    let flapped = false;
    if (eq && this.alive && !this.board && !this.climb && !this.swing && !this.jet.on) {
      if (input.pressed.has('KeyX') && W.cd <= 0 && W.stam >= WING.flapCost) {
        W.cd = WING.flapCd; W.stam -= WING.flapCost; flapped = true; W.flapT = g.now; W.soar = false;
        this.vel.y = Math.min(WING.climbCap, Math.max(this.vel.y, 0) + WING.flapLift);
        if (this.onGround) { this.pos.y += 0.05; this.onGround = false; }
        g.audio.play('jump', 0.6);
        g.fx.glow.emit({ p: [this.pos.x, this.pos.y + 1.2, this.pos.z], life: 0.25, s0: 1.2, s1: 2.2, c0: [1, 1, 1, 0.35], c1: [1, 1, 1, 0] });
      }
      if (!this.onGround && sprint && !flapped && W.stam > WING.soarMin && (W.soar || this.vel.y < 6)) W.soar = true;
      else if (W.soar && (!sprint || W.stam <= 0)) W.soar = false;
    }
    if (W.soar) {
      const dirx = Math.sin(this.yaw), dirz = Math.cos(this.yaw), tgt = WING.soarSpeed * Math.max(0.35, Math.cos(this.pitch));
      const a = Math.min(1, 3 * dt);
      this.vel.x += (dirx * tgt - this.vel.x) * a; this.vel.z += (dirz * tgt - this.vel.z) * a;
      const vy = Math.max(-24, Math.min(7, WING.sink - this.pitch * 20)); // pitch > 0 looks down
      this.vel.y += (vy - this.vel.y) * Math.min(1, 4 * dt);
      W.stam -= WING.soarCost * dt;
      const ceil = g.world.heightAt(this.pos.x, this.pos.z) + WING.ceiling;
      if (this.pos.y > ceil) { this.pos.y = ceil; this.vel.y = Math.min(0, this.vel.y); }
      if (W.stam <= 0) { W.stam = 0; W.soar = false; g.ui.toast('Wings out of stamina', 'bad'); }
    } else {
      W.stam = Math.min(WING.stam, W.stam + (this.onGround ? WING.regenGround : WING.regenAir) * dt);
    }
    // Look: folded on the back, a quick beat after a flap, spread level while soaring.
    const beating = g.now - W.flapT < 0.45;
    W.spread += ((W.soar ? 1 : beating ? 0.8 : 0) - W.spread) * Math.min(1, dt * 9);
    W.beat = beating ? Math.sin((g.now - W.flapT) * 22) : 0;
    this.wings.visible = eq && this.alive;
    setWings(this.wings, W.spread, W.beat);
  }

  // ---------- turret pack (tier-3 gear) ----------
  // Standing still, double-tap Jump: a sentry turret unfolds a step ahead of you and fights for 20 seconds.
  turretStep(dt, input) {
    const g = this.game;
    if (this.staffCd > 0) this.staffCd -= dt;
    if (this.turret && !this.turret.update(dt)) { this.turret.dispose(); this.turret = null; }
  }

  // Turret Pack: shoot to drop one huge sentry where you aim (see shoot / deployTurret).
  deployTurret(wp) {
    const g = this.game, p = g.aim.point;
    const f = [Math.sin(this.yaw), Math.cos(this.yaw)];
    let x = p.x, z = p.z;
    const d = Math.hypot(x - this.pos.x, z - this.pos.z);
    if (d > 14 || d < 2.5) { const k = Math.min(Math.max(d, 4), 14); x = this.pos.x + f[0] * k; z = this.pos.z + f[1] * k; }
    [x, z] = g.world.collide(x, z, 1.2);
    if (this.turret) { this.turret.dispose(); this.turret = null; }
    this.turret = new Turret(true, x, g.world.heightAt(x, z), z, this.yaw, g);
    this.ammo[this.cur] = 0;
    this.fireCd = 0.5;
    this.recoilT = 1;
    g.audio.play('ui', 0.8);
    g.shake(0.3);
    g.ui.toast('Turret deployed', 'good');
    this.reload();
  }

  // ---------- web swing (tier-3 gear) ----------
  // Press Jump again in the air and a web line shoots up to a point in the sky ahead; while you hold it you hang from
  // the line and swing through the bottom of the arc, the line reeling in so the swing carries you up and over the
  // ground. Let go to fly on with everything you built up, then press Jump for the next line. A quick double-tap
  // still lights a jetpack (the jets take the press first).
  swingStep(dt, input, fwdIn) {
    const g = this.game, k = input.keys;
    this.swingCd = Math.max(0, this.swingCd - dt);
    if (this.swing) {
      if (!k.has('Space') || !this.alive || this.onGround || this.climb || this.board || this.dash || this.jet.on) this.endSwing(!this.onGround && this.alive);
      else this.swing.pump = fwdIn > 0.3;
      return;
    }
    if (!this.hasGear('swing') || !this.alive || this.onGround || this.climb || this.board || this.jet.on || this.dash || this.swingCd > 0) return;
    if (!input.pressed.has('Space') || this.time - this.jumpT < 0.1) return; // a new press, not the one that made the jump
    const w = g.world, f = this.forward(), look = g.aim.dir;
    if (this.pos.y < w.heightAt(this.pos.x, this.pos.z) + 0.5) return; // not off the ground yet
    const a = new THREE.Vector3(this.pos.x + f[0] * 11 + look.x * 3, this.pos.y + 19, this.pos.z + f[2] * 11 + look.z * 3);
    a.y = Math.max(a.y, w.heightAt(a.x, a.z) + 14);
    const L = a.distanceTo(this.pos);
    this.swing = { a, L, Lmin: Math.max(6, Math.min(L, a.y - w.heightAt(a.x, a.z) - 2.6)), t: 0, pump: false };
    // A standing start still swings: the line yanks you forward.
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs < 9) { this.vel.x += f[0] * (9 - hs); this.vel.z += f[2] * (9 - hs); }
    g.audio.play('web_shoot');
    g.fx.silkPuff([a.x, a.y, a.z], 0.8);
  }

  endSwing(boost) {
    const S = this.swing;
    if (!S) return;
    this.swing = null; this.swingCd = 0.2;
    if (boost) { this.vel.y += 3; const sp = this.vel.length(); if (sp > 1) this.vel.multiplyScalar(Math.min(1.08, 1 + 2 / sp)); this.flyT = 1.8; }
    this.game.audio.play('web_release');
    this.game.fx.silkPuff([S.a.x, S.a.y, S.a.z], 0.6);
  }

  // Steering on the line (instead of the usual air control): forward input pumps the swing, sideways leans it.
  swingSteer(dt, mx, mz, ml) {
    if (ml > 0) { this.vel.x += mx * 7 * dt; this.vel.z += mz * 7 * dt; }
  }

  // After the frame's movement: keep the body on the line (reeling it in a little each frame) and cap the speed.
  swingConstrain(dt) {
    const S = this.swing;
    S.t += dt;
    S.L = Math.max(S.Lmin, S.L - 7 * dt);
    const d = tmp.copy(this.pos).sub(S.a), dist = d.length();
    if (dist > S.L) {
      d.multiplyScalar(S.L / dist);
      this.pos.copy(S.a).add(d);
      const n = d.normalize(), vr = this.vel.dot(n);
      if (vr > 0) this.vel.addScaledVector(n, -vr); // nothing moves away from the anchor along the line
    }
    const sp = this.vel.length();
    if (sp > 32) this.vel.multiplyScalar(32 / sp);
  }

  // ---------- tree climbing ----------
  nearTree() {
    let best = null, bd = 1e9;
    for (const t of this.game.world.trees) {
      const d = Math.hypot(t.x - this.pos.x, t.z - this.pos.z) - t.r;
      if (d < 1.5 && d < bd && this.pos.y > t.gy - 1 && this.pos.y < t.top + 0.8) { bd = d; best = t; }
    }
    return best;
  }

  startClimb(t) {
    if (this.climb || this.board) return;
    const ang = Math.atan2(this.pos.x - t.x, this.pos.z - t.z);
    this.climb = { t, ang, h: Math.max(this.pos.y, t.gy) };
    this.vel.set(0, 0, 0);
    this.dash = null;
    this.game.audio.play('ui');
  }

  endClimb(leap) {
    const c = this.climb;
    if (!c) return;
    this.climb = null;
    if (leap) {
      this.vel.set(Math.sin(c.ang) * 5, CONFIG.jump * 0.9, Math.cos(c.ang) * 5);
      this.onGround = false;
      this.game.audio.play('jump');
    }
  }

  climbStep(dt, f, s, input) {
    const c = this.climb, t = c.t, g = this.game;
    const orbit = t.r + 0.55;
    const up = f * 3.2;
    c.h = Math.max(t.gy, Math.min(t.top + 0.2, c.h + up * dt));
    c.ang += s * 1.9 / orbit * dt;
    this.pos.set(t.x + Math.sin(c.ang) * orbit, c.h, t.z + Math.cos(c.ang) * orbit);
    this.vel.set(0, 0, 0);
    this.climbV = up;
    this.speedNow = Math.abs(up) + Math.abs(s) * 1.9;
    if (input.pressed.has('Space')) return this.endClimb(true);
    if (input.pressed.has('KeyE')) return this.endClimb(false);
    if (c.h <= t.gy + 0.05 && f < 0) return this.endClimb(false);
    if (c.h >= t.top) {
      // Over the top: step out onto the fork.
      this.pos.set(t.x + Math.sin(c.ang) * (t.r + 1.0), t.top, t.z + Math.cos(c.ang) * (t.r + 1.0));
      this.onGround = true;
      this.climb = null;
      g.ui.toast('Up in the tree. Walk off the edge or ' + g.ui.ctl('jump') + ' to jump.', '');
    }
  }

  // ---------- skateboard ----------
  mountBoard() {
    if (this.board || !this.alive) return;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    let ci = 0, best = 1e9;
    for (const sp2 of this.game.world.boards || []) { const d = Math.hypot(sp2.x - this.pos.x, sp2.z - this.pos.z); if (d < best) { best = d; ci = sp2.ci | 0; } }
    this.board = newBoard(this.moveDir ? Math.atan2(this.moveDir[0], this.moveDir[1]) : this.yaw, Math.min(sp, 5), ci);
    this.boardObj.userData.setColor(ci);
    this.rider.reset();
    this.game.audio.play('ui');
    this.game.ui.toast('On the board. Hold forward to kick-push, let go to coast, hold back to drag a foot, ' + this.game.ui.ctl('jump') + ' to ollie (sideways + ' + this.game.ui.ctl('jump') + ' = kickflip).', '');
  }

  dismountBoard() {
    if (!this.board) return;
    // Keep a little momentum when you hop off.
    this.vel.x = Math.sin(this.board.h) * Math.min(this.board.s, 8);
    this.vel.z = Math.cos(this.board.h) * Math.min(this.board.s, 8);
    this.board = null; this.windK = 0;
    this.rider.reset();
    this.model.rotation.set(0, this.yaw, 0);
  }

  rideBoard(dt, mx, mz, ml, boost = false) {
    const b = this.board, w = this.game.world;
    const maxS = CONFIG.sprint * SKATE.maxMul * this.stats.speed * (this.hasteUntil > this.game.now ? 1.3 : 1);
    const dx = Math.sin(b.h), dz = Math.cos(b.h);
    const rise = (w.heightAt(this.pos.x + dx * 0.9, this.pos.z + dz * 0.9) - w.heightAt(this.pos.x - dx * 0.9, this.pos.z - dz * 0.9)) / 1.8;
    const slope = rise > 0 ? rise * 0.25 : rise; // uphill drags less than downhill pulls, so small hills don't stop you
    const ev = rideStep(b, dt, mx, mz, ml, maxS, slope, this.onGround, boost || this.sprinting);
    if (ev & 1) this.game.audio.footstep(STEP_KIND[this.ch.id] || 'boot', 0.5); // the push foot hits the road
    this.vel.x = Math.sin(b.h) * b.s; this.vel.z = Math.cos(b.h) * b.s;
    // Sprinting on the board: wind whips past, streaks trail behind and a speed haze fills the screen edges.
    const fast = (boost || this.sprinting) && b.s > 5 && this.onGround, fx = this.game.fx;
    this.windK = THREE.MathUtils.clamp((this.windK || 0) + (fast ? dt * 3 : -dt * 2.5), 0, 1);
    if (fast && fx && !this.game.headless) {
      const k = Math.min(1, b.s / maxS), n = 1 + (Math.random() < k ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const side = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.8), back = -0.3 - Math.random() * 0.9, up = 0.1 + Math.random() * 1.7;
        fx.glow.emit({ p: [this.pos.x + dx * back + dz * side, this.pos.y + up, this.pos.z + dz * back - dx * side], v: [-dx * b.s * 0.85, 0, -dz * b.s * 0.85], life: 0.22 + Math.random() * 0.12, s0: 0.14, s1: 0.04, c0: [0.85, 0.95, 1, 0.55], c1: [0.8, 0.9, 1, 0] });
      }
      if (Math.random() < 0.5) fx.smoke.emit({ p: [this.pos.x - dx * 0.6, this.pos.y + 0.1, this.pos.z - dz * 0.6], v: [-dx * 2 + (Math.random() - 0.5), 0.4, -dz * 2 + (Math.random() - 0.5)], life: 0.5, s0: 0.25, s1: 0.8, c0: [0.8, 0.85, 0.9, 0.18], c1: [0.8, 0.85, 0.9, 0] });
    }
  }

  forward() { return [Math.sin(this.yaw), 0, Math.cos(this.yaw)]; }
  chest() { return [this.pos.x, this.pos.y + 1.4, this.pos.z]; }

  // "One More" (stats.extra): the directions of a cast and its extra copies, spread in a fan 0.16 rad apart.
  fan(d, step = 0.16) {
    const n = 1 + (this.stats.extra || 0), out = [];
    for (let i = 0; i < n; i++) {
      const a = (i - (n - 1) / 2) * step, c = Math.cos(a), sn = Math.sin(a);
      out.push([d[0] * c + d[2] * sn, d[1], -d[0] * sn + d[2] * c]);
    }
    return out;
  }

  ab_fireball() {
    const g = this.game;
    const o = this.muzzleWorld();
    o.y += 0.2;
    const d = tmp.copy(g.aim.point).sub(o).normalize();
    const oa = [o.x, o.y, o.z], da = [d.x, d.y, d.z];
    const dmg = this.stats.dmg * this.mm('fireball');
    for (const dd of this.fan(da)) { // "One More" throws extra fireballs in a fan
      // A blazing orb: it flies through everything (up to 130 m), searing and igniting each enemy it passes once, and bursts where it lands.
      const hit = new Set();
      g.el.fireball(oa, dd, {
        pierce: true, speed: 46, range: 130,
        onPass: (pos) => {
          for (const t of g.targets()) {
            if (t.kind === 'demon' || hit.has(t.id)) continue;
            if (Math.hypot(t.x - pos[0], t.z - pos[2]) > t.r + 1.8 || pos[1] < t.y - 1.2 || pos[1] > t.y + t.h + 1.2) continue;
            hit.add(t.id);
            g.damage(t, 55 * dmg, { at: pos, burn: 5, kx: dd[0] * 3, kz: dd[2] * 3 });
          }
        },
        onExplode: (p) => g.areaDamage(p, 6.5, 50 * dmg, { burn: 4, falloff: 0.5, kb: 8 }),
      });
      g.emitFx(['fq', ...oa.map(q10), ...dd.map((v) => Math.round(v * 100))]);
    }
    g.audio.play('fire_cast');
  }

  ab_inferno() {
    const g = this.game;
    const dmg = this.stats.dmg * this.mm('inferno');
    // 8 m wide (15% more than before), burns 5 s, and blasts keep going off inside the ring.
    g.el.inferno(() => [this.pos.x, this.pos.y, this.pos.z], 5, 8, (p, r) => g.areaDamage(p, r + 0.5, 7 * dmg, { burn: 3.5, silentNum: true }),
      (bp) => g.areaDamage(bp, 3.2, 16 * dmg, { burn: 2, kb: 3, silentNum: true }));
    g.audio.play('inferno');
    g.emitFx(['fr']);
  }

  // Boulder Toss: a rock rips out of the ground and flies at the crosshair in a heavy arc, smashing on whatever it meets.
  ab_boulder() {
    const g = this.game;
    const f = this.forward();
    const o = { x: this.pos.x + f[0] * 0.6, y: this.pos.y + 1.6, z: this.pos.z + f[2] * 0.6 };
    const d = tmp.copy(g.aim.point).sub(o).normalize();
    const oa = [o.x, o.y, o.z], da = [d.x, d.y, d.z];
    for (const dd of this.fan(da)) { // "One More" hurls extra boulders in a fan
      g.el.boulder(oa, dd, {
        hitTest: (pos) => g.targets().some((t) => t.kind !== 'demon' && Math.hypot(t.x - pos.x, t.z - pos.z) < t.r + 0.7 && pos.y > t.y - 0.3 && pos.y < t.y + t.h + 0.4),
        onImpact: (p) => { g.areaDamage(p, 4.5, 85 * this.stats.dmg * this.mm('boulder'), { kb: 11, freeze: 0.9, falloff: 0.35 }); g.shake(0.3); g.audio.play('quake', 0.6); },
      });
      g.emitFx(['eb', ...oa.map(q10), ...dd.map((v) => Math.round(v * 100))]);
    }
    g.audio.play('earth');
  }

  // Rock Armor: stone slabs clamp on and soak 200 damage for 8 s; every hit they take shocks the ground around you.
  ab_rockarmor() {
    const g = this.game;
    const dur = (g.duel ? DUEL.cd : this.cls.r.cd) * this.stats.cdr * this.stats.mast.r.cd; // up until the power is ready again
    this.shield = { until: g.now + dur, hp: 200, rock: true, dur };
    if (this.armorFx) this.armorFx.end();
    this.armorFx = g.el.rockArmor(() => [this.pos.x, this.pos.y, this.pos.z, this.yaw], dur);
    g.audio.play('earth');
    g.emitFx(['eq']);
  }

  // Pillar Burst: stamp, and a column of rock erupts under every enemy within 12 m (or a fan of them ahead if none are near).
  ab_pillars() {
    const g = this.game;
    const c = [this.pos.x, this.pos.y, this.pos.z];
    let near = g.targets().filter((t) => t.kind !== 'demon' && Math.hypot(t.x - c[0], t.z - c[2]) < 14.5 + t.r);
    near.sort((u, v) => Math.hypot(u.x - c[0], u.z - c[2]) - Math.hypot(v.x - c[0], v.z - c[2]));
    near = near.slice(0, 12);
    const pts = near.map((t) => [t.x, t.y, t.z]);
    if (!pts.length) {
      const f = this.forward();
      for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.32, dist = 4.5; pts.push([c[0] + (f[0] * Math.cos(a) - f[2] * Math.sin(a)) * dist, c[1], c[2] + (f[2] * Math.cos(a) + f[0] * Math.sin(a)) * dist]); }
    }
    g.el.pillars(pts, c);
    const dmg = 154 * this.stats.dmg * this.mm('pillars'), hit = new Set(); // 140 + 10% (Nutty 2026-11-11)
    for (const t of g.targets()) {
      if (t.kind === 'demon' || hit.has(t.id)) continue;
      const pt = pts.find((p) => Math.hypot(t.x - p[0], t.z - p[2]) < t.r + 2.2);
      if (!pt) continue;
      hit.add(t.id);
      const dx = t.x - c[0], dz = t.z - c[2], dd = Math.hypot(dx, dz) || 1;
      g.damage(t, dmg, { freeze: 1.6, kx: dx / dd * 7, kz: dz / dd * 7, at: [t.x, t.y + t.h * 0.6, t.z] });
    }
    g.shake(0.45);
    g.audio.play('quake');
    g.emitFx(['ep', ...pts.flat().map(q10)]);
  }

  // Chain Lightning: one tight bolt along the crosshair, 260 m long, that goes straight through everything on its line
  // (enemies, rocks, trees; nothing stops it) and strikes every enemy it touches, with a short arc between each.
  ab_chain() {
    // Nutty (2026-11-05): the braid stays up for 4 s and everything inside it, along its whole length and width, gets
    // the full bolt when it fires and again every half second while it is still on screen.
    const g = this.game;
    const RANGE = 260, LIFE = 4, EVERY = 0.5;
    const o = this.muzzleWorld(), ao = g.aim.origin, ad = g.aim.dir;
    const O = o.clone(), E = new THREE.Vector3(ao.x + ad.x * RANGE, ao.y + ad.y * RANGE, ao.z + ad.z * RANGE);
    const D = E.clone().sub(O), L = D.length(); D.divideScalar(L);
    const dmg = 75 * this.stats.dmg * this.mm('chain');
    const P = new THREE.Vector3();
    // The braid's strands swing out up to ~4.5 m from its axis in the middle (elements.js chain), so the hit lane follows them.
    const lane = (f) => 1.4 + 4.0 * Math.sin(Math.PI * Math.sqrt(Math.max(0, Math.min(1, f))));
    const inside = () => {
      const out = [];
      for (const t of g.targets()) {
        if (t.kind === 'demon') continue;
        let best = Infinity, fBest = 0;
        for (const k of [0.15, 0.5, 0.85]) { // test the body at three heights
          P.set(t.x, t.y + t.h * k, t.z).sub(O);
          const along = P.dot(D);
          if (along < 0 || along > L) continue;
          const off = P.addScaledVector(D, -along).length();
          if (off < best) { best = off; fBest = along / L; }
        }
        if (best < t.r + lane(fBest)) out.push({ t, along: fBest });
      }
      return out.sort((u, v) => u.along - v.along);
    };
    const hits = inside();
    const pts = [[O.x, O.y, O.z]];
    hits.forEach(({ t }, i) => { if (i < 24) pts.push([t.x, t.y + t.h * 0.6, t.z]); g.damage(t, dmg, { slow: 1 }); });
    pts.push([E.x, E.y, E.z]);
    g.el.chain(pts);
    g.audio.play('zap');
    g.emitFx(['sq', ...pts.flat().map(q10)]);
    // The current reflects off every body it passes through: each struck enemy arcs to up to 2 others within 10 m for half damage.
    const struck = new Set(hits.map((h) => h.t.id)), arced = new Set();
    let arcs = 0;
    for (const { t } of hits.slice(0, 16)) {
      const near = g.targets().filter((u) => u.kind !== 'demon' && !struck.has(u.id) && !arced.has(u.id) && Math.hypot(u.x - t.x, u.z - t.z) < 10)
        .sort((u, v) => Math.hypot(u.x - t.x, u.z - t.z) - Math.hypot(v.x - t.x, v.z - t.z)).slice(0, 2);
      for (const u of near) {
        arced.add(u.id);
        g.damage(u, dmg * 0.5, { slow: 1 });
        const arc = [[t.x, t.y + t.h * 0.6, t.z], [u.x, u.y + u.h * 0.6, u.z]];
        g.el.chain(arc);
        if (arcs++ < 20) g.emitFx(['sq', ...arc.flat().map(q10)]);
      }
    }
    // While it is up: anything inside takes the full bolt again every half second, with a small arc where it touches.
    let next = EVERY;
    g.fx.add({
      dur: LIFE,
      update: (dt, t) => {
        if (t < next || t > LIFE - 0.05) return;
        next += EVERY;
        for (const { t: u } of inside()) {
          g.damage(u, dmg, { slow: 1 });
          const c = [u.x, u.y + u.h * 0.6, u.z];
          g.fx.spark.emit({ p: c, v: [0, 4, 0], life: 0.3, s0: 0.3, s1: 0.05, c0: [0.85, 0.92, 1, 1], c1: [0.4, 0.5, 1, 0], g: 8 });
          g.fx.glow.emit({ p: c, life: 0.25, s0: 2.5, s1: 4, c0: [0.6, 0.75, 1, 0.9], c1: [0.3, 0.4, 1, 0] });
        }
      },
    });
  }

  ab_storm() {
    const g = this.game;
    let c = g.aim.point.clone();
    const d = Math.hypot(c.x - this.pos.x, c.z - this.pos.z);
    if (d > 40) c = this.pos.clone().add(c.sub(this.pos).setY(0).normalize().multiplyScalar(40));
    const ca = [c.x, g.world.heightAt(c.x, c.z), c.z];
    const seed = (Math.random() * 1e9) | 0;
    const k = this.stats.dmg * this.mm('storm');
    // Nutty (2026-11-05): the storm lasts 4 s; every bolt stays up as a column and anything touching one takes the full bolt again every 0.5 s.
    g.el.thunderstorm(ca, seed, 4, 13, (p) => { g.areaDamage(p, 2.8, 42 * k, { slow: 1 }); g.audio.play('thunder', 0.6); }, (p) => g.areaDamage(p, 2.8, 42 * k, { slow: 1 }));
    g.audio.play('thunder');
    g.emitFx(['sr', ...ca.map(q10), seed]);
  }

  // Ice Shards: tiny shards form around you, then dart at the nearest enemies (a ring outward if nobody is near).
  ab_shards() {
    const g = this.game;
    const o = [this.pos.x, this.pos.y + 1.3, this.pos.z];
    const n = 10 + 4 * (this.stats.extra || 0);
    const ts = g.targets().filter((t) => t.kind !== 'demon' && Math.hypot(t.x - o[0], t.z - o[2]) < 20)
      .sort((u, v) => Math.hypot(u.x - o[0], u.z - o[2]) - Math.hypot(v.x - o[0], v.z - o[2]));
    const pts = [], ids = [];
    for (let i = 0; i < n; i++) {
      const t = ts.length ? ts[i % ts.length] : null;
      if (t) { pts.push([t.x + (Math.random() - 0.5) * 0.4, t.y + t.h * (0.4 + Math.random() * 0.4), t.z + (Math.random() - 0.5) * 0.4]); ids.push(t.id); }
      else { const a = (i / n) * 6.283; pts.push([o[0] + Math.sin(a) * 9, o[1], o[2] + Math.cos(a) * 9]); ids.push(null); }
    }
    const dmg = 16 * this.stats.dmg * this.mm('shards');
    g.el.iceShards(o, pts, (i) => {
      const id = ids[i];
      if (id == null) return;
      const t = g.targets().find((q) => q.id === id);
      if (t) g.damage(t, dmg, { slow: 2, at: [t.x, t.y + t.h * 0.6, t.z], silentNum: i % 2 === 1 });
    });
    g.audio.play('ice');
    g.emitFx(['is', ...o.map(q10), ...pts.flat().map(q10)]);
  }

  // Ice Barrier: a wall of ice 3 m ahead, 12 m wide, for 8 s. Whatever touches it is locked in an ice crystal for 10 s.
  ab_barrier() {
    const g = this.game, f = this.forward();
    const cx = this.pos.x + f[0] * 3, cz = this.pos.z + f[2] * 3, px = -f[2], pz = f[0], hw = 6;
    const y = g.world.heightAt(cx, cz);
    const a = [cx - px * hw, y, cz - pz * hw], b = [cx + px * hw, y, cz + pz * hw];
    const locked = new Set(), dmg = 20 * this.stats.dmg * this.mm('barrier');
    g.el.iceBarrier(a, b, 8, () => {
      const vx = b[0] - a[0], vz = b[2] - a[2], L2 = vx * vx + vz * vz || 1;
      for (const t of g.targets()) {
        if (t.kind === 'demon' || locked.has(t.id)) continue;
        const sgm = Math.max(0, Math.min(1, ((t.x - a[0]) * vx + (t.z - a[2]) * vz) / L2));
        const d = Math.hypot(t.x - (a[0] + vx * sgm), t.z - (a[2] + vz * sgm)) - t.r;
        if (d > 1.0 || Math.abs(t.y - y) > 3.5) continue;
        locked.add(t.id);
        g.damage(t, dmg, { lock: 10, slow: 10, at: [t.x, t.y + t.h * 0.6, t.z] });
        if (t.kind === 'player') continue; // the other duelist seals themselves in takeStatus (3 s cap, thaw grace, blockers) and announces it with fx 'ic'
        if (t.view) g.el.encase(t.view, t.r, t.h, 10);
        g.emitFx(['ic', t.id, q10(t.r), q10(t.h)]);
      }
    });
    g.audio.play('ice_big');
    g.emitFx(['ib', ...a.map(q10), ...b.map(q10)]);
  }

  // Storm Veil: a thick howling curtain of wind fills a cone ahead (14 m long, 3 m wide at your feet to 10 m at the far end) for 3 s.
  // Ten times a second it shoves everything inside back, slashes it with wind and slows it. Pure wind, no movement.
  ab_veil() {
    const g = this.game;
    const dir = this.forward().filter((_, i) => i !== 1);
    const len = 20, dur = 3, dmg = 4.5 * this.stats.dmg * this.mm('veil'); // 45 per second
    let n = 0;
    g.el.stormVeil(() => [this.pos.x, this.pos.y, this.pos.z], () => { dir[0] = Math.sin(this.yaw); dir[1] = Math.cos(this.yaw); return dir; }, len, dur, () => {
      const shown = ++n % 5 === 0; // only every half second gets a number and a hit sound
      for (const tg of g.targets()) {
        if (tg.kind === 'demon') continue;
        const px = tg.x - this.pos.x, pz = tg.z - this.pos.z;
        const along = px * dir[0] + pz * dir[1];
        if (along < -1 || along > len + tg.r || Math.abs(tg.y - this.pos.y) > 5) continue;
        const across = Math.abs(px * -dir[1] + pz * dir[0]);
        if (across < tg.r + 1.6 + 3.4 * Math.max(0, along) / len) {
          g.damage(tg, dmg, { kx: dir[0] * 2.5, kz: dir[1] * 2.5, slow: 0.5, silent: !shown, shown: dmg * 5, at: [tg.x, tg.y + tg.h * 0.6, tg.z] });
        }
      }
    });
    g.shake(0.25);
    g.audio.play('howl');
    g.emitFx(['wv', ...dir.map((v) => Math.round(v * 100))]);
  }

  // ---------- third powers (G / d-pad up) ----------
  ab_firewall() {
    const g = this.game;
    // The wall stands across your line of sight on the ground where you are aiming (at most 18 m out), 14 m wide.
    const t = g.aim.point;
    let dx = t.x - this.pos.x, dz = t.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1, r = Math.max(4, Math.min(d, 18));
    dx /= d; dz /= d;
    const cx = this.pos.x + dx * r, cz = this.pos.z + dz * r, y = g.fx.heightAt(cx, cz);
    const px = -dz, pz = dx, hw = 11; // the wall is 22 m long
    const a = [cx - px * hw, y, cz - pz * hw], b = [cx + px * hw, y, cz + pz * hw];
    const dmg = 30 * this.stats.dmg * this.mm('firewall'); // every quarter second to anything in the flames, plus a long burn
    g.el.firewall(a, b, 6, (a, b) => g.lineDamage(a, b, 1.7, dmg, { burn: 4, silentNum: true }));
    g.audio.play('inferno');
    g.emitFx(['fw', ...a.map(q10), ...b.map(q10)]);
  }

  // Thunder Shockwave: a ring of lightning bursts out along the ground to 32 m, shocking everything it crosses.
  // "One More" sends extra rings a beat behind the first.
  ab_shockwave() {
    const g = this.game;
    const rings = 1 + (this.stats.extra || 0);
    for (let i = 0; i < rings; i++) {
      const go = () => {
        const o = [this.pos.x, this.pos.y, this.pos.z], hit = new Set(), dmg = 290 * this.stats.dmg * this.mm('shockwave');
        g.el.shockwave(o, 32, 40, (r, prev) => {
          for (const t of g.targets()) {
            if (t.kind === 'demon' || hit.has(t.id)) continue;
            const d = Math.hypot(t.x - o[0], t.z - o[2]);
            if (d + t.r < prev || d - t.r > r + 1) continue;
            if (t.y - o[1] > 7) continue; // out of the ground's reach, far overhead
            hit.add(t.id);
            const k = 1 - Math.min(1, d / 32) * 0.25; // a little weaker at the far edge
            const dx = (t.x - o[0]) / (d || 1), dz = (t.z - o[2]) / (d || 1);
            g.damage(t, dmg * k, { kx: dx * 8, kz: dz * 8, slow: 2.5, at: [t.x, t.y + t.h * 0.6, t.z] });
          }
        });
        g.emitFx(['sw', ...o.map(q10)]);
        g.shake(0.5);
        g.audio.play('thunder');
      };
      if (i === 0) go(); else setTimeout(go, 520 * i);
    }
  }

  // Tsunami: a towering wave rolls forward from you, 26 m wide, for 45 m, drowning everything it passes.
  ab_tsunami() {
    const g = this.game;
    const o = [this.pos.x, this.pos.y, this.pos.z], d = this.forward();
    const hit = new Set(), dmg = 420 * this.stats.dmg * this.mm('tsunami');
    g.el.tsunami(o, d, 24, 13, (c, hw) => {
      for (const t of g.targets()) {
        if (t.kind === 'demon' || hit.has(t.id)) continue;
        const rx = t.x - c[0], rz = t.z - c[2];
        const along = rx * d[0] + rz * d[2], across = Math.abs(rx * -d[2] + rz * d[0]);
        if (Math.abs(along) < 2.6 + t.r && across < hw + t.r && t.y - c[1] < 6) {
          hit.add(t.id);
          g.damage(t, dmg, { kx: d[0] * 12, kz: d[2] * 12, slow: 3, at: [t.x, t.y + t.h * 0.6, t.z] });
        }
      }
    });
    g.shake(0.4);
    g.audio.play('ice_big');
    g.emitFx(['tw', ...o.map(q10), ...d.map((v) => Math.round(v * 100))]);
  }

  // Eye of the Storm: a huge swirl of wind (6 m across the ground, 5 s) closes round you. Nothing can hurt you inside it
  // (takeDamage), enemy shots that reach it are flung back at their shooters (Game.handleEvent 'p'), and enemies at its wall are thrown out.
  ab_eye() {
    const g = this.game;
    const dur = g.duel ? 2.5 : 5; // in the arena every power is ready again after 5 s: no standing guard for ever
    this.eye = { until: g.now + dur, dur, r: 6 };
    if (this.eyeFx) this.eyeFx.end();
    let n = 0;
    this.eyeFx = g.el.eyeStorm(() => [this.pos.x, this.pos.y, this.pos.z], this.eye.r, dur, () => {
      if (++n % 2) return; // every quarter second
      for (const t of g.targets()) {
        if (t.kind === 'demon') continue;
        const dx = t.x - this.pos.x, dz = t.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
        if (d - t.r > this.eye.r + 0.8 || Math.abs(t.y - this.pos.y) > 9) continue;
        g.damage(t, 9 * this.stats.dmg * this.mm('eye'), { kx: dx / d * 16, kz: dz / d * 16, silent: n % 8 !== 0, shown: 36 * this.stats.dmg * this.mm('eye'), at: [t.x, t.y + t.h * 0.6, t.z] });
      }
    });
    g.shake(0.3);
    g.audio.play('howl');
    g.emitFx(['we', Math.round(dur * 10)]);
  }

  ab_cyclone() {
    const g = this.game;
    const o = [this.pos.x, this.pos.y, this.pos.z];
    for (const d of this.fan(this.forward(), 0.5)) { // "One More" sends extra tornadoes out beside the first
      const off = Math.atan2(d[0], d[2]) - this.yaw; // an "One More" copy keeps its angle beside your facing
      g.el.cyclone(o, () => [Math.sin(this.yaw + off), 0, Math.cos(this.yaw + off)], 5, 6, (c) => {
        for (const t of g.targets()) {
          if (t.kind === 'demon') continue;
          const dx = c[0] - t.x, dz = c[2] - t.z, dd = Math.hypot(dx, dz) || 1;
          if (dd < 6.5 + t.r) g.damage(t, 9 * this.stats.dmg * this.mm('cyclone'), { kx: dx / dd * 9, kz: dz / dd * 9, silentNum: true });
        }
      });
      g.emitFx(['wr', ...o.map(q10), ...d.map((v) => Math.round(v * 100))]);
    }
    g.audio.play('cyclone');
  }

  // ---------- taking damage ----------
  eyeOn() { return this.eye.until > this.game.now; }
  endEye() {
    this.eye.until = 0;
    if (this.eyeFx) { this.eyeFx.end(); this.eyeFx = null; }
  }

  // Returns true when the hit got through (nothing turned it aside), so status effects riding on it only apply then.
  // ---------- shield block / parry ----------
  // Holding the aim button with a sword-and-shield raises the shield: physical hits (enemy melee, arrows and shots) are stopped,
  // and one raised in the PARRY window just before a hit lands throws that hit's damage straight back at the attacker.
  blockStep(dt, want) {
    const B = this.block || (this.block = { on: false, t: 0 });
    if (want && !B.on) { B.on = true; B.t = 0; this.game.audio.play('ui', 0.3); }
    if (!want) B.on = false;
    if (B.on) B.t += dt;
    this.blocking = B.on && this.alive && !this.dash && !this.board && !this.climb;
  }
  tryBlock(amount, src) {
    if (!this.blocking) return false;
    const physical = typeof src === 'number' || src === 'B' || src === 'proj';
    if (!physical) return false;
    const g = this.game, B = this.block, c = [this.pos.x + Math.sin(this.yaw) * 0.6, this.pos.y + 1.2, this.pos.z + Math.cos(this.yaw) * 0.6];
    if (B.t <= PARRY.window && g.now - (this.parryT || -9) > 0.3) {
      this.parryT = g.now;
      if (g.dailyOn && g.dailyOn()) Dailies.add('parries');
      const t = g.attackerTarget(src);
      if (t) g.damage(t, amount * PARRY.mul, { at: [t.x, t.y + t.h * 0.6, t.z], kx: (t.x - this.pos.x) * 2, kz: (t.z - this.pos.z) * 2, head: true });
      g.fx.shockwave(c, 3, 0xffe9a8, 0.3); g.fx.impact(c, [1, 0.95, 0.7]);
      g.audio.play('deflect', 1); g.shake(0.25);
      g.ui.damageNumber(g.project(c), 'PARRY', 'crit');
    } else {
      g.fx.impact(c, [0.8, 0.85, 1]);
      g.audio.play('deflect', 0.5);
      this.blockHit = (this.blockHit || 0) + 1;
    }
    return true;
  }

  takeDamage(amount, src) {
    const g = this.game;
    if (!this.alive) return false;
    if (this.tryBlock(amount, src)) return false;
    if (src === 'gv') { this.invulnUntil = 0; this.shield.until = 0; this.endEye(); } // the Gravity Gun's blast on the other duelist is lethal: nothing stops it
    if (this.invulnUntil && g.now < this.invulnUntil) return false;
    if (this.eyeOn()) {
      // Eye of the Storm: the wind turns the blow aside.
      if (g.now - (this.eyeT || 0) > 0.2) { this.eyeT = g.now; g.fx.impact([this.pos.x, this.pos.y + 1.2, this.pos.z], [0.8, 1, 0.9]); g.audio.play('deflect', 0.6); }
      return;
    }
    let dmg = amount * (1 - this.stats.armor);
    if (this.shield.rock && this.shield.until > g.now) {
      // Rock Armor: nothing gets through while it stands, and every hit on it shocks the ground.
      g.fx.dustBurst([this.pos.x, this.pos.y + 1, this.pos.z], 0.3);
      if (g.now - (this.shockT || 0) > 0.45) {
        this.shockT = g.now;
        const c = [this.pos.x, this.pos.y, this.pos.z];
        g.el.armorShock(c);
        g.areaDamage(c, 4.5, 20 * this.stats.dmg, { kb: 14, freeze: 0.8, silentNum: true });
        g.audio.play('earth', 0.5);
        g.emitFx(['es', ...c.map(q10)]);
      }
      return false;
    }
    if (this.shield.until > g.now && this.shield.hp > 0) {
      dmg *= 0.7;
      const ab = Math.min(this.shield.hp, dmg);
      this.shield.hp -= ab;
      dmg -= ab;
      g.fx.dustBurst([this.pos.x, this.pos.y + 1, this.pos.z], 0.3);
      if (dmg <= 0) return false;
    }
    this.hp -= dmg;
    this.hurtAt = g.now;
    g.ui.hurt(dmg / this.stats.maxHp, src);
    const dir = this.bleed(dmg);
    g.audio.play('hurt');
    // Stagger: a short stumble (slow feet, a shove back) and a camera jolt, so you feel the hit land.
    const k = Math.max(0.3, Math.min(1, dmg / 30));
    this.stagT = Math.max(this.stagT || 0, 0.14 + 0.12 * k);
    if (!this.swing && !this.board) { this.vel.x += dir[0] * 2.2 * k; this.vel.z += dir[2] * 2.2 * k; }
    this.pitch -= 0.02 * k; this.yaw += (Math.random() - 0.5) * 0.04 * k;
    g.shake(Math.max(0.3 * k, Math.min(0.5, dmg / 40)));
    if (this.hp <= 0) this.die();
    return true;
  }

  clearStatus() { this.frozenUntil = this.slowUntil = this.thawImmune = 0; this.knock = null; this.game.ui.frost(0); }

  // Duel Arena: what the other fighter's hit does besides damage (sim 'a' event, src 'pvp').
  // sl: slow secs, fz: freeze secs, lk: ice block secs, kx/kz: shove (m/s), ln: launch speed. Same effects as on mobs in a run.
  takeStatus({ sl = 0, fz = 0, lk = 0, kx = 0, kz = 0, ln = 0 }) {
    const g = this.game, now = g.now;
    if (!this.alive) return;
    if (sl) this.slowUntil = Math.max(this.slowUntil || 0, now + Math.min(sl, DUEL.slowMax));
    const stun = Math.max(fz, lk);
    if (stun >= 0.25 && now >= (this.thawImmune || 0) && !(this.frozenUntil > now)) {
      const dur = Math.min(stun, DUEL.freezeMax);
      this.frozenUntil = now + dur; this.thawImmune = now + dur + DUEL.thawImmune; // no chain-freezing: a short grace after the thaw
      this.dash = null; this.dashDmg = 0; this.meleePending = 0; this.jet.on = false; if (this.swing) this.endSwing(false);
      if (dur >= 1) { // a real ice block, seen by both fighters; a short freeze is only a stun
        const r = 0.55 * DUEL.size, h = 1.85 * DUEL.size;
        g.el.encase(this, r, h, dur);
        g.emitFx(['ic', 'P:' + g.party.myId, q10(r), q10(h), q10(dur)]);
        g.audio.play('ice_big', 0.7);
      }
      g.ui.frost(dur);
    }
    if (kx || kz) { const m = Math.hypot(kx, kz), k = m > 14 ? 14 / m : 1; this.knock = { x: kx * k, z: kz * k }; }
    if (ln) { this.vel.y = Math.max(this.vel.y, Math.min(ln, 14)); this.onGround = false; }
  }

  // Every hit draws blood: a spray out of the back (away from whatever is in front of you), a splat on the ground,
  // and on your own screen a splatter; everyone else sees the spray on your character.
  bleed(dmg) {
    const g = this.game;
    const k = Math.max(0.3, Math.min(1.6, (dmg / this.stats.maxHp) * 5));
    const dir = [-Math.sin(this.yaw) + (Math.random() - 0.5) * 0.6, 0, -Math.cos(this.yaw) + (Math.random() - 0.5) * 0.6];
    const c = this.chest(), S = g.duel ? DUEL.size : 1;
    const p = [c[0], this.pos.y + (c[1] - this.pos.y - 0.1) * S, c[2]];
    g.fx.playerBlood(p, dir, k);
    if (g.settings.hudBlood === true) g.ui.bloodSplat(k); // screen splatter is opt-in: it gets in the way of aiming
    g.emitFx(['bld', q10(p[0]), q10(p[1]), q10(p[2]), Math.round(dir[0] * 100), 0, Math.round(dir[2] * 100), Math.round(k * 10)]);
    return dir;
  }

  heal(amount) {
    if (!this.alive) return;
    this.hp = Math.min(this.stats.maxHp, this.hp + amount);
  }

  die() {
    const g = this.game;
    this.hp = 0;
    this.alive = false;
    this.bowDraw = 0; this.bowHold = 0; // a dropped bow is not held drawn
    this.dismountBoard();
    this.dash = null; this.swing = null;
    this.clearStatus();
    this.endEye();
    this.deaths = (this.deaths || 0) + 1;
    if (this.fireRing) this.fireRing.visible = false;
    g.audio.play('death');
    const canRespawn = this.beds > 0 && g.phase !== 'demon' && g.phase !== 'boss';
    if (this.stats.phoenix > this.phoenixUsed && g.phase !== 'demon') {
      this.phoenixUsed++;
      this.freeRise = true;
      this.deadT = 2;
      g.ui.toast('Phoenix Feather. You rise from the ashes…', 'good');
    } else if (this.revives > 0 && g.phase !== 'demon') {
      // Second Wind (Perfect Shop): get back up once without spending a bed.
      this.revives--;
      this.freeRise = true;
      this.deadT = 2.5;
      g.ui.toast('Second Wind. You rise again…', 'good');
    } else if (canRespawn) {
      this.deadT = 4;
      g.ui.toast('You died. Respawning ' + (this.bedPos ? 'at your bed' : 'at camp') + '…', 'bad');
    } else {
      this.out = true;
      if (!['over', 'win', 'lobby'].includes(g.phase) && !g.duel) g.ui.toast(g.phase === 'demon' ? 'She found you.' : 'You are out of beds.', 'bad');
    }
    g.emitFx(['die']);
  }

  // Fresh fighter for a duel (also a rematch): full health, no power-ups, no beds, nothing carried over.
  resetDuel() {
    const g = this.game;
    this.blessings = []; this.powerups = []; this.elemPending = 0; this.cratesOpened = 0;
    this.beds = 0; this.revives = 0; this.phoenixUsed = 0; this.bedPos = null;
    this.alive = true; this.out = false; this.deadT = 0; this.freeRise = false;
    this.stats = this.baseStats();
    this.hp = this.stats.maxHp;
    this.cds = { q: 0, r: 0, e: 0, d: 0 };
    this.shield = { until: 0, hp: 0 };
    if (this.armorFx) { this.armorFx.end(); this.armorFx = null; }
    this.endEye();
    this.clearStatus();
    if (this.turret) { this.turret.dispose(); this.turret = null; }
    this.staffCd = 0; this.gravPull = null; this.swingCd = 0; this.jet.on = false; this.jet.fuel = JET.fuel; this.wing.stam = WING.stam; this.wing.soar = false;
    this.dash = null; this.swing = null; this.fireCd = 0; this.reloadT = 0; this.heat = 0; this.bowDraw = 0; this.bowNock = 0; this.bowHold = 0;
    this.ammo = this.weapons.map((w) => WEAPON_BY_ID[w].mag || 0);
    this.cur = Math.max(0, this.weapons.findIndex((w) => WEAPON_BY_ID[w] && WEAPON_BY_ID[w].kind !== 'gear')); this.model.userData.setWeapon(this.heldId());
    this.xp = 0; this.level = 0; this.xpNeed = XP.need(0); this.kills = 0; this.damageDealt = 0; this.deaths = 0;
    this.orbitT = 0; this.auraT = 0; this.orbitHit.clear();
    if (this.orbitGroup) { g.scene.remove(this.orbitGroup); this.orbitGroup = null; }
    this.invulnUntil = 0;
    this.dismountBoard();
  }

  respawn() {
    const g = this.game;
    if (this.freeRise) this.freeRise = false; else this.beds--;
    const p = this.bedPos || g.world.spawn;
    this.placeAt(p.x + (Math.random() - 0.5) * 2, p.z + (Math.random() - 0.5) * 2);
    this.alive = true;
    this.hp = this.stats.maxHp;
    this.invulnUntil = g.now + 5; // grace so a respawn in the middle of the horde does not end the run at once
    g.request('clear', [Math.round(this.pos.x), Math.round(this.pos.z)]);
    if (this.bedPos) { this.bedPos = null; g.removeBedMesh(); }
    g.fx.shockwave([this.pos.x, this.pos.y, this.pos.z], 4, 0xffe0a0, 0.6);
    g.ui.toast('Bed used. Beds left: ' + this.beds, this.beds ? '' : 'bad');
  }

  revive(frac = 0.6) {
    this.alive = true;
    this.out = false;
    this.hp = Math.max(1, this.stats.maxHp * frac);
  }

  placeBed() {
    const g = this.game;
    if (!this.alive || this.beds <= 0) { g.ui.toast('No beds left. Buy one in the shop (' + g.ui.ctl('shop') + ').', 'bad'); return; }
    if (!this.onGround) return;
    this.bedPos = { x: this.pos.x, z: this.pos.z };
    g.placeBedMesh(this.bedPos, this.yaw);
    g.ui.toast('Bed placed. You will respawn here.');
    g.audio.play('place');
  }

  presence() {
    const wp = this.weapon;
    return {
      p: [q10(this.pos.x), q10(this.pos.y), q10(this.pos.z)], ry: Math.round(this.yaw * 100), pt: Math.round(this.pitch * 100),
      hp: Math.round(this.hp), mh: Math.round(this.stats.maxHp), al: this.alive ? 1 : 0, out: this.out ? 1 : 0, bt: this.btHold ? 1 : 0,
      wi: this.cur, sp: Math.round(this.speedNow * 10), ml: this.meleeT > 0 ? 1 : 0, mv: this.meleeMove | 0, gn: wp.bow ? (this.bowNock <= 0 ? 1 : 0) : wp.kind === 'gun' && this.reloadT <= 0 ? 1 : 0,
      ct: this.castT > 0 ? 1 : 0, sn: Math.round((this.spinK || 0) * 100), sb: this.board ? 700 + Math.round(this.board.h * 100) : 0, sl: this.board ? Math.round(this.board.lean * 100) : 0, sx: this.board ? packBoard(this.board) : 0, pc: this.pc, k: this.totalKills, sh: this.shield.until > this.game.now ? 1 : 0,
      jp: this.jetEquipped() ? (this.jet.level > 0.1 ? 2 : 1) : this.hasGear('wings') ? (this.wing.soar ? 4 : this.game.now - this.wing.flapT < 0.45 ? 5 : 3) : 0,
      dr: this.drone && this.alive ? (this.drone.firing ? 2 : 1) : 0,
      tr: this.turret ? [q10(this.turret.obj.position.x), q10(this.turret.obj.position.y), q10(this.turret.obj.position.z), Math.round(this.yaw * 100)] : 0,
      sw: this.swing && this.alive ? [q10(this.swing.a.x), q10(this.swing.a.y), q10(this.swing.a.z)] : 0,
      ey: wp.eyes && this.alive ? (this.game.now - (this.lastShot || -9) < 0.12 ? 2 : 1) : 0,
      ob: this.alive ? this.stats.orbit : 0, au: this.alive ? this.stats.aura : 0,
    };
  }

  dispose() { this.game.scene.remove(this.model); if (this.orbitGroup) this.game.scene.remove(this.orbitGroup); if (this.fireRing) this.game.scene.remove(this.fireRing); if (this.drone) this.drone.dispose(); if (this.turret) this.turret.dispose(); }
}
