// The opening movie (Nutty 2026-11-22): "a movie like opening screen before the player touches the controller/keyboard ... about 2 minutes
// long showcasing characters, no HUD, in a movie like world". It plays in the game's own engine: every hero gets a scene of their own on one
// of the backdrop landscapes, fighting real enemies with their weapon and an element, then a hero shot with their name. A quick montage,
// then the whole roster together and the logo. Any key, click or controller button goes straight to the menu with its usual song.
import * as THREE from 'three';
import { FX } from './fx.js';
import { Elements } from './elements.js';
import { buildBgSet } from './lobbybg.js';
import { CHAR_BY_ID, makeCharacterModel, flushSwipes } from './characters.js';
import { makeMobRig } from './mobrig.js';
import { CLASSES, WEAPON_BY_ID } from './data.js';
import { whenAssets } from './assets.js';

const EL = Object.fromEntries(CLASSES.map((c) => [c.id, c]));
// Who, where, with what. set = lobby backdrop number (lobbybg.js OPTIONS).
const CAST = [
  { ch: 'knight', set: 3, el: 'pyre', fx: 'fireball', w: 'viking', mobs: ['grunt@machete', 'runner@cleaver', 'grunt@shovel', 'runner@hatchet', 'grunt@pipe'] },
  { ch: 'veteran', set: 2, el: 'tempest', fx: 'chain', w: 'ar', mobs: ['bandit@cutlass', 'pouncer', 'bandit@sabre', 'pouncer', 'bandit@hatchet'] },
  { ch: 'kratia', set: 4, el: 'gale', fx: 'veil', w: 'fencing', mobs: ['knight@arming', 'warmaiden@spear', 'knight@mace', 'warmaiden@waraxe', 'knight@falchion'] },
  { ch: 'bonelord', set: 6, el: 'necro', fx: 'pit', w: 'sword', mobs: ['shambler@bat', 'crawler', 'grunt@shovel', 'crawler', 'shambler@crowbar'] },
  { ch: 'corsair', set: 7, el: 'rime', fx: 'tsunami', w: 'coach', mobs: ['goblin@scimitar', 'goblin@falchion', 'bandit@cutlass', 'goblin@shortsword', 'bandit@sabre'] },
  { ch: 'ironwood', set: 5, el: 'pyre', fx: 'inferno', w: 'minigun', mobs: ['brute', 'ravager', 'hatchling', 'brute', 'ravager'] },
  { ch: 'ninja', set: 8, el: 'rime', fx: 'shards', w: 'katana', mobs: ['lizardman@spear', 'venomfang', 'lizardman@spear', 'venomfang', 'pouncer'] },
  { ch: 'selena', set: 9, el: 'tempest', fx: 'storm', w: 'smg', mobs: ['wraith', 'runner@cleaver', 'wraith', 'grunt@machete', 'runner@bat'] },
  { ch: 'ragmon', set: 10, el: 'bastion', fx: 'quake', w: 'sledge', mobs: ['troll@greataxe', 'goblin@scimitar', 'gobchief@longsword', 'goblin@falchion', 'goblin@shortsword'] },
  { ch: 'grey', set: 11, el: 'gale', fx: 'eye', w: 'pulse', mobs: ['zorp', 'gloop', 'stinger', 'zorp', 'gloop'] },
].filter((c) => CHAR_BY_ID[c.ch]);

const SEG = 9.4, OPEN = 9, MONTAGE = 11, FINALE = 15; // seconds
const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Intro {
  constructor(game) {
    this.game = game; this.alive = true; this.t = 0; this.q = game.q;
    const s = (this.scene = new THREE.Scene());
    s.environment = game.envTex; s.environmentIntensity = 0.35;
    s.fog = new THREE.FogExp2(0x98a090, 0.006);
    this.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.fx = new FX(s, this.camera, game.q);
    this.el = new Elements(this.fx, s);
    this.H = () => 0; this.fx.heightAt = (x, z) => this.H(x, z);
    // A key light from just beside the camera and a cool fill, so every hero reads against any sky.
    this.key = new THREE.DirectionalLight(0xfff0dc, 2.2); this.fill = new THREE.DirectionalLight(0xbfd0ff, 0.8);
    s.add(this.key, this.key.target, this.fill, this.fill.target);
    this.sets = new Map(); this.heroes = new Map(); this.actors = [];
    this.buildOverlay();
    this.plan();
    // Only ✕ (DualShock) / A (Xbox) / Space skip the movie (Nutty 2026-11-23); every other key and click is swallowed.
    this.onKey = (e) => { if (!this.alive || this.leaving) return; e.preventDefault(); e.stopPropagation(); if (e.code === 'Space' || e.key === ' ') this.skip(); };
    window.addEventListener('keydown', this.onKey, true);
    this.ov.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
    this.ov.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
    this.ready = false; whenAssets().then(() => { this.ready = true; }); // the enemies' bodies stream in after the menu: the opening waits for them
    this.padWas = true; // a button already held when the movie starts does not count
    this.game.audio.startRunMusic(4); // only heard once the browser allows sound (after any earlier click)
  }

  // ---------------------------------------------------------------- the story board
  plan() {
    const shots = (this.shots = []);
    let t = 0;
    shots.push({ kind: 'open', t0: t, dur: OPEN }); t += OPEN;
    CAST.forEach((c, i) => { shots.push({ kind: 'hero', c, i, t0: t, dur: SEG }); t += SEG; });
    const cuts = [0, 5, 3, 8, 1, 6, 2, 9].filter((i) => CAST[i]), cd = MONTAGE / cuts.length;
    cuts.forEach((i, k) => { shots.push({ kind: 'flash', c: CAST[i], i, k, t0: t, dur: cd }); t += cd; });
    shots.push({ kind: 'finale', t0: t, dur: FINALE }); t += FINALE;
    this.total = t;
  }

  set(k) {
    let S = this.sets.get(k);
    if (!S) { S = buildBgSet(k, Math.min(this.q, 1)); if (!S) return null;
      // No point lights mid-movie (each one would recompile every material and stutter); the snow set is dimmed so it does not wash out white.
      const pl = []; S.group.traverse((o) => { if (o.isPointLight) pl.push(o); else if (k === 2 && (o.isDirectionalLight || o.isHemisphereLight)) o.intensity *= 0.55; });
      for (const o of pl) o.parent.remove(o);
      S.group.visible = false; this.scene.add(S.group); this.sets.set(k, S); }
    return S;
  }
  showSet(k) {
    for (const [kk, S] of this.sets) S.group.visible = kk === k;
    const S = this.set(k); if (!S) return null;
    S.group.visible = true; this.H = S.H; this.curSet = S;
    this.scene.fog.color.set(S.fog[0]); this.scene.fog.density = Math.min(S.fog[1], k === 2 ? 0.005 : 0.012); this.fx.setFog(this.scene.fog.density);
    // Snow is already bright: a softer key light so white effects and armour do not wash out.
    this.key.intensity = k === 2 ? 1.0 : 2.2; this.fill.intensity = k === 2 ? 0.35 : 0.8;
    return S;
  }
  hero(id, w) {
    let m = this.heroes.get(id);
    if (!m) { m = makeCharacterModel(id, null); m.traverse((o) => { if (o.isMesh) o.castShadow = true; }); this.heroes.set(id, m); this.scene.add(m); }
    if (w && m.userData.setWeapon) m.userData.setWeapon(WEAPON_BY_ID[w] ? w : 'sword');
    m.visible = true;
    return m;
  }
  clearActors() { for (const a of this.actors) { this.scene.remove(a.root); } this.actors = []; for (const m of this.heroes.values()) m.visible = false; this.fx.clearAll(); }

  // ---------------------------------------------------------------- one hero's scene
  // The hero stands near the middle of the clearing facing the far end, where the enemies come from. Three camera set-ups:
  // a sweeping wide shot, a tracking shot of the fight with the element, then a low hero shot as they turn to camera with their name.
  startHero(sh, quick) {
    const c = sh.c, S = this.showSet(c.set); if (!S) return;
    const m = this.hero(c.ch, c.w), H = S.H;
    const hx = quick ? 0 : -1.5, hz = quick ? -2 : 3;
    sh.h = { m, x: hx, z: hz, yaw: Math.PI, speed: 0, melee: 0, move: 0, cast: 0, gun: WEAPON_BY_ID[c.w] && WEAPON_BY_ID[c.w].kind === 'gun', fireCd: 0, rec: 0, tgt: null };
    m.position.set(hx, H(hx, hz), hz); m.rotation.y = Math.PI;
    sh.mobs = [];
    const n = quick ? 3 : c.mobs.length;
    for (let i = 0; i < n; i++) {
      const rig = makeMobRig(c.mobs[i % c.mobs.length]) || makeMobRig(c.mobs[i % c.mobs.length].split('@')[0]);
      if (!rig) continue;
      const a = (i - (n - 1) / 2) * 0.55, d = (quick ? 9 : 17) + (i % 2) * 2.5;
      const mob = { rig, root: rig.root, x: hx + Math.sin(a) * d, z: hz - Math.cos(a) * d, yaw: 0, hp: 3, dieT: -1, atk: 0 };
      rig.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.scene.add(rig.root); this.actors.push(mob); sh.mobs.push(mob);
    }
    sh.castAt = quick ? 0.25 : 4.55; sh.cast = false;
    sh.camSeed = sh.i * 1.7;
  }

  aliveMobs(sh) { return sh.mobs.filter((o) => o.dieT < 0); }
  kill(sh, mob, dir, big) {
    if (mob.dieT >= 0) return;
    mob.dieT = 0; mob.kx = dir ? dir[0] * (big ? 7 : 3) : 0; mob.kz = dir ? dir[1] * (big ? 7 : 3) : 0;
    const p = [mob.x, this.H(mob.x, mob.z) + 1.3, mob.z];
    this.fx.blood(p); this.fx.impact(p, [1, 0.8, 0.55]);
  }

  stepHero(sh, t, dt, quick) {
    const h = sh.h, c = sh.c, H = this.H, m = h.m;
    const mobs = this.aliveMobs(sh);
    // the enemies close in, swing when they reach the hero
    for (const o of sh.mobs) {
      if (o.dieT >= 0) {
        o.dieT += dt; o.x += (o.kx || 0) * dt * Math.max(0, 1 - o.dieT * 2); o.z += (o.kz || 0) * dt * Math.max(0, 1 - o.dieT * 2);
        o.root.position.set(o.x, H(o.x, o.z), o.z); o.rig.die(dt);
        continue;
      }
      const dx = h.x - o.x, dz = h.z - o.z, d = Math.hypot(dx, dz);
      o.yaw = Math.atan2(dx, dz);
      const go = d > 1.9 && t > (quick ? 0 : 0.4);
      const sp = go ? (quick ? 3.2 : 2.6) : 0;
      if (go) { o.x += (dx / d) * sp * dt; o.z += (dz / d) * sp * dt; }
      o.atk = go ? Math.max(0, o.atk - dt * 3) : (o.atk <= 0 ? 1 : o.atk - dt * 1.6);
      o.root.position.set(o.x, H(o.x, o.z), o.z); o.root.rotation.y = o.yaw;
      o.rig.update({ speed: sp, attack: o.atk, hit: false }, dt, 0);
    }
    // the hero: weapon first, then the element
    const fightFrom = quick ? 0 : 2.4, fightTo = quick ? 0.2 : sh.castAt - 0.15;
    h.speed = 0; h.cast = Math.max(0, h.cast - dt);
    const near = mobs.slice().sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z))[0];
    if (!quick && t < fightFrom && near) { // walk in to meet them
      h.speed = 2.2; h.x += Math.sin(h.yaw) * 2.2 * dt; h.z += Math.cos(h.yaw) * 2.2 * dt;
    }
    if (near && t < sh.castAt + 0.8) h.yaw = lerpAng(h.yaw, Math.atan2(near.x - h.x, near.z - h.z), Math.min(1, dt * 8));
    if (t >= fightFrom && t < fightTo && near) {
      if (h.gun) {
        h.fireCd -= dt;
        if (h.fireCd <= 0) {
          const wp = WEAPON_BY_ID[c.w]; h.fireCd = Math.max(0.09, Math.min(0.5, (wp && wp.rate) || 0.12)); h.rec = 0.12;
          const mz = this.muzzle(m), tp = [near.x, H(near.x, near.z) + 1.3, near.z];
          this.fx.muzzle(mz, [tp[0] - mz[0], tp[1] - mz[1], tp[2] - mz[2]]); this.fx.tracer(mz, tp); this.fx.impact(tp);
          this.game.audio.play(wp && this.game.audio ? 'shot_' + c.w : 'shot_ar', 0.35);
          if (--near.hp <= 0) this.kill(sh, near, [Math.sin(h.yaw), Math.cos(h.yaw)]);
        }
      } else {
        const d = Math.hypot(near.x - h.x, near.z - h.z);
        if (d > 2.0 && h.melee <= 0) { h.speed = 4.5; h.x += Math.sin(h.yaw) * 4.5 * dt; h.z += Math.cos(h.yaw) * 4.5 * dt; }
        else if (h.melee <= 0) { h.melee = 0.001; h.move = (h.move + 1) % 2; h.hitDone = false; }
      }
    }
    if (h.melee > 0) {
      h.melee += dt / 0.5;
      if (!h.hitDone && h.melee > 0.45) { h.hitDone = true; this.game.audio.play('hit_melee', 0.4); const tg = near && Math.hypot(near.x - h.x, near.z - h.z) < 3 ? near : null; if (tg) { tg.hp -= 2; if (tg.hp <= 0) this.kill(sh, tg, [Math.sin(h.yaw), Math.cos(h.yaw)]); } }
      if (h.melee >= 1) h.melee = 0;
    }
    h.rec = Math.max(0, h.rec - dt);
    if (!sh.cast && t >= sh.castAt) { sh.cast = true; h.cast = 0.7; this.castElement(sh); }
    m.position.set(h.x, H(h.x, h.z), h.z); m.rotation.y = h.yaw;
    m.userData.anim({ speed: h.speed, pitch: 0, gun: h.gun, weapon: true, melee: h.melee, move: h.move, cast: h.cast > 0 ? 1 : 0, recoil: h.rec, alive: true, arc: 150 }, dt, this.t);
    flushSwipes(m, this.fx);
  }

  muzzle(m) {
    const w = m.userData.weapon;
    m.updateMatrixWorld(true);
    if (w && w.userData.muzzle) { const p = w.userData.muzzle.clone().applyMatrix4(w.matrixWorld); return [p.x, p.y, p.z]; }
    return [m.position.x + Math.sin(m.rotation.y) * 0.7, m.position.y + 1.35, m.position.z + Math.cos(m.rotation.y) * 0.7];
  }

  // Each hero's element, from the game's own element effects (elements.js). Whatever is in its path falls.
  castElement(sh) {
    const c = sh.c, h = sh.h, H = this.H, el = this.el, fx = this.fx, A = this.game.audio;
    const fwd = [Math.sin(h.yaw), 0, Math.cos(h.yaw)];
    const o = [h.x + fwd[0] * 1.2, H(h.x, h.z) + 1.4, h.z + fwd[2] * 1.2];
    const live = this.aliveMobs(sh);
    const ctr = live.length ? [live.reduce((a, q) => a + q.x, 0) / live.length, 0, live.reduce((a, q) => a + q.z, 0) / live.length] : [h.x + fwd[0] * 9, 0, h.z + fwd[2] * 9];
    ctr[1] = H(ctr[0], ctr[2]);
    const dist = (q) => Math.hypot(q.x - h.x, q.z - h.z);
    const killAll = (delay, per, big = true) => { for (const q of live) { const d = delay + dist(q) * per; this.later(d, () => this.kill(sh, q, [(q.x - h.x) / (dist(q) || 1), (q.z - h.z) / (dist(q) || 1)], big)); } };
    const toC = [ctr[0] - o[0], ctr[1] + 1 - o[1], ctr[2] - o[2]];
    switch (c.fx) {
      case 'fireball': A.play('fire_cast', 0.6); el.fireball(o, toC, { speed: 30, range: Math.hypot(...toC), onExplode: () => { A.play('explode', 0.7); for (const q of live) this.kill(sh, q, [(q.x - ctr[0]) || 0.1, (q.z - ctr[2]) || 0.1], true); } }); break;
      case 'chain': { const pts = [o, ...live.map((q) => [q.x, H(q.x, q.z) + 1.3, q.z])]; el.chain(pts); A.play('zap', 0.6); fx.flash(o, 0x9fb8ff, 40, 0.3, 20); killAll(0.05, 0.01); break; }
      case 'veil': A.play('wind', 0.7); el.stormVeil(() => [h.x, H(h.x, h.z), h.z], fwd, 20, 2.2); killAll(0.15, 0.06); break;
      case 'pit': A.play('hell_rise', 0.6); el.hellPit([ctr[0], ctr[1], ctr[2]]); for (const q of live) el.orb([q.x, H(q.x, q.z) + 1.2, q.z], [(h.x - q.x) * 0.6, 3, (h.z - q.z) * 0.6], { color: [0.55, 1, 0.35], size: 0.8, dur: 1.4 }); killAll(0.35, 0.02); break;
      case 'tsunami': A.play('wind', 0.8); el.tsunami([h.x + fwd[0] * 2, 0, h.z + fwd[2] * 2], fwd, 34, 14); killAll(0.2, 1 / 14); break;
      case 'inferno': A.play('inferno', 0.6); el.inferno(() => [h.x, H(h.x, h.z), h.z], 3.5, 9); killAll(0.25, 0.04); break;
      case 'shards': A.play('ice', 0.7); el.iceShards(o, live.map((q) => [q.x, H(q.x, q.z) + 1.2, q.z]).concat(live.length < 4 ? [ctr, ctr] : [])); killAll(0.45, 0.025); break;
      case 'storm': A.play('thunder', 0.7); el.thunderstorm(ctr, 7, 3.4, 7); killAll(0.5, 0.06); break;
      case 'quake': A.play('quake', 0.7); el.quake([h.x, 0, h.z], fwd, 24); el.pillars(live.map((q) => [q.x, H(q.x, q.z), q.z]), [h.x, h.z]); killAll(0.3, 0.05); break;
      case 'eye': A.play('cyclone', 0.6); el.eyeStorm(() => [h.x, H(h.x, h.z), h.z], 6, 3.4); killAll(0.2, 0.05); break;
      default: fx.explosion(ctr, 1.4); killAll(0.1, 0.02);
    }
  }
  later(t, fn) { (this.timers || (this.timers = [])).push({ t, fn }); }

  // ---------------------------------------------------------------- the camera
  camHero(sh, t) {
    const h = sh.h, H = this.H, gy = H(h.x, h.z);
    const hp = V(h.x, gy + 1.2, h.z), fwd = V(Math.sin(h.yaw), 0, Math.cos(h.yaw)), rt = V(Math.cos(h.yaw), 0, -Math.sin(h.yaw));
    let pos, look, fov = 38;
    if (t < 3.1) { // 1. sweeping wide: from high behind the hero, down and round to the side as the enemies charge
      const k = ease(t / 3.1);
      pos = V(lerp(-9, -6, k) + h.x, gy + lerp(9, 2.4, k), h.z + lerp(10, 6.5, k));
      look = V(h.x * 0.5, gy + 1.2, h.z - lerp(9, 5, k)); fov = lerp(46, 40, k);
    } else if (t < 6.3) { // 2. tracking the fight from the side and a little behind, hero and enemies both in frame, the element filling it
      const k = (t - 3.1) / 3.2, side = sh.i % 2 ? 1 : -1;
      pos = hp.clone().addScaledVector(rt, side * lerp(7.5, 6.2, k)).addScaledVector(fwd, lerp(-4.2, -2.6, k)); pos.y = gy + lerp(2.2, 1.7, k);
      look = hp.clone().addScaledVector(fwd, 5).addScaledVector(rt, -side * 0.6); look.y = gy + 1.1; fov = 46;
    } else { // 3. the hero shot: low, in front, slowly pushing in as they turn to us
      const k = ease((t - 6.3) / 3.1);
      pos = hp.clone().addScaledVector(fwd, lerp(4.4, 3.0, k)).addScaledVector(rt, lerp(-1.5, -0.9, k)); pos.y = gy + lerp(0.55, 0.8, k);
      look = hp.clone().addScaledVector(rt, 0.55); look.y = gy + 1.35; fov = lerp(34, 30, k);
    }
    return { pos, look, fov };
  }

  // ---------------------------------------------------------------- the overlay: letterbox, names, logo, fades
  buildOverlay() {
    const ov = (this.ov = document.createElement('div'));
    ov.id = 'intro';
    ov.innerHTML = `<div class="ib top"></div><div class="ib bot"></div><div class="in-card"><b class="in-role"></b><i class="in-band"></i><h2 class="in-name"></h2><span class="in-el"></span></div>
      <div class="in-logo"><h1><em>The</em>PERFECT<span>RUN</span></h1></div><div class="in-skip"><b>✕</b> / <b>A</b> / <b>Space</b> Skip</div><div class="in-flash"></div><div class="in-fade"></div>`;
    this.game.root.appendChild(ov);
    document.body.classList.add('intro-on');
    this.$ = (s) => ov.querySelector(s);
  }
  card(c) {
    const card = this.$('.in-card'), E = EL[c.el], ch = CHAR_BY_ID[c.ch];
    card.style.setProperty('--ec', E ? E.css : '#f5c242');
    this.$('.in-name').textContent = ch.name; this.$('.in-role').textContent = ch.role || '';
    this.$('.in-el').textContent = E ? E.name : '';
    card.classList.remove('on'); void card.offsetWidth; card.classList.add('on');
  }
  flash(k = 1) { const f = this.$('.in-flash'); f.style.transition = 'none'; f.style.opacity = String(k); void f.offsetWidth; f.style.transition = 'opacity .45s'; f.style.opacity = '0'; }

  // ---------------------------------------------------------------- running it
  update(dt) {
    if (!this.alive) return;
    dt = Math.min(dt, 1 / 20);
    const g = this.game;
    if (g.mode !== 'menu' || (g.root.dataset.screen && g.root.dataset.screen !== 's-title')) { this.end(); return; } // something else took over
    this.pollPad();
    if (this.leaving) { this.leaveT += dt; this.$('.in-fade').style.opacity = String(Math.min(1, this.leaveT / 0.35)); if (this.leaveT > 0.4) this.end(); }
    this.t += dt;
    if (!this.ready && this.cur && this.cur.kind === 'open' && this.t > OPEN - 0.6) this.t = OPEN - 0.6; // hold on the valley until the enemies are in
    if (this.t >= this.total) { this.t = this.total - 1e-3; if (!this.leaving) { this.leaving = true; this.leaveT = 0.35; } } // the movie ends on black, then the title screen
    const sh = this.shots.find((s) => this.t >= s.t0 && this.t < s.t0 + s.dur);
    if (sh !== this.cur) this.enter(sh);
    const lt = this.t - sh.t0;
    // slow motion as the hero turns for their name, like the reveal in a trailer
    let sdt = dt;
    if (sh.kind === 'hero' && lt > 6.3 && lt < 7.3) sdt = dt * 0.35;
    if (sh.kind === 'flash' && lt > 0.35 && lt < 0.8) sdt = dt * 0.4;
    if (this.timers) for (let i = this.timers.length - 1; i >= 0; i--) { const tm = this.timers[i]; tm.t -= sdt; if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); } }
    let cam;
    if (sh.kind === 'open') cam = this.camOpen(lt);
    else if (sh.kind === 'hero') { this.stepHero(sh, sh.st = (sh.st || 0) + sdt, sdt, false); cam = this.camHero(sh, lt); if (lt > 6.3 && !sh.carded) { sh.carded = true; this.card(sh.c); } if (lt > 6.3) sh.h.yaw = lerpAng(sh.h.yaw, Math.atan2(this.camera.position.x - sh.h.x, this.camera.position.z - sh.h.z) - 0.35, Math.min(1, dt * 3)); }
    else if (sh.kind === 'flash') { this.stepHero(sh, sh.st = (sh.st || 0) + sdt, sdt, true); cam = this.camFlash(sh, lt); }
    else cam = this.camFinale(sh, lt);
    this.camera.position.copy(cam.pos); this.camera.lookAt(cam.look);
    if (Math.abs(this.camera.fov - cam.fov) > 0.01) { this.camera.fov = cam.fov; this.camera.updateProjectionMatrix(); }
    if (sh.kind === 'finale') this.stepFinale(sh, lt, dt);
    this.lights();
    if (this.curSet && this.curSet.sky.material.uniforms.t) this.curSet.sky.material.uniforms.t.value += dt;
    if (this.curSet && this.curSet.embers && Math.random() < 0.6) this.fx.glow.emit({ p: [this.camera.position.x + (Math.random() - 0.5) * 30, this.H(0, 0) + Math.random() * 3, this.camera.position.z - 8 - Math.random() * 20], v: [(Math.random() - 0.5), 1.5 + Math.random() * 2, 0], life: 2.5, s0: 0.12, s1: 0.04, c0: [1, 0.5, 0.15, 1], c1: [1, 0.2, 0.05, 0] });
    this.fx.update(sdt);
    if (sh.kind === 'open' && this.game.menu) this.game.menu.vista && this.game.menu.vista.update && this.game.menu.vista.update(dt, this.t);
  }
  // Which scene to draw this frame (the opening flies over the title valley, which lives in the menu's scene).
  get drawScene() { return this.cur && this.cur.kind === 'open' && this.game.menu ? this.game.menu.scene : this.scene; }

  enter(sh) {
    const prev = this.cur; this.cur = sh; sh.st = 0; sh.carded = false;
    this.clearActors(); this.timers = [];
    this.$('.in-card').classList.remove('on');
    const logo = this.$('.in-logo');
    logo.classList.remove('on');
    if (sh.kind === 'open') {
      this.$('.in-fade').style.transition = 'none'; this.$('.in-fade').style.opacity = '1'; void this.ov.offsetWidth;
      this.$('.in-fade').style.transition = 'opacity 2.4s'; this.$('.in-fade').style.opacity = '0';
      this.ov.classList.add('bars');
      if (this.game.menu && this.game.menu.setDay) this.game.menu.setDay(true);
    } else if (sh.kind === 'hero' || sh.kind === 'flash') { this.startHero(sh, sh.kind === 'flash'); if (prev) this.flash(sh.kind === 'flash' ? 0.55 : 0.85); }
    else if (sh.kind === 'finale') this.startFinale(sh);
    // build the next scene's land now, while this one plays, so the cut does not stutter
    const nx = this.shots[this.shots.indexOf(sh) + 1];
    if (nx && nx.c) setTimeout(() => { try { this.set(nx.c.set); } catch (e) { console.warn('intro set', e); } }, 400);
  }

  camOpen(t) {
    const k = ease(clamp01(t / OPEN)), M = this.game.menu;
    const off = this.camera.aspect > 1.3 ? -2.9 : 0;
    const pos = V(off - 60 + 56 * k, 46 - 31 * k, 150 - 100 * k), look = V(off + 10 - 4 * (1 - k), 16 + 4 * (1 - k), -62);
    if (M && M.camera) { /* keep the valley's own camera where the menu expects it */ }
    return { pos, look, fov: lerp(50, 44, k) };
  }

  camFlash(sh, t) {
    const h = sh.h, gy = this.H(h.x, h.z), a = sh.k * 2.1 + t * 0.9 * (sh.k % 2 ? 1 : -1), r = 5.5 - t * 0.8;
    return { pos: V(h.x + Math.sin(a) * r, gy + 1.0 + (sh.k % 3) * 0.6, h.z + Math.cos(a) * r), look: V(h.x + Math.sin(h.yaw) * 3, gy + 1.3, h.z + Math.cos(h.yaw) * 3), fov: 44 };
  }

  // The whole roster in the forest clearing, then the logo.
  startFinale(sh) {
    const S = this.showSet(3); if (!S) return;
    const H = S.H, n = CAST.length;
    sh.line = CAST.map((c, i) => {
      const a = (i - (n - 1) / 2) * 0.16, r = 9;
      const x = Math.sin(a) * r, z = -Math.cos(a) * r + 6;
      const m = this.hero(c.ch, c.w); m.position.set(x, H(x, z), z); m.rotation.y = Math.atan2(-x, 12 - z);
      return { m, c, x, z, ph: i * 0.37 };
    });
    for (const L of sh.line) { const E = EL[L.c.el]; L.light = this.fx.holdLight({}, E ? E.accent : 0xffd090, 3.2, 5); if (L.light) L.light.position.set(L.x, H(L.x, L.z) + 2.4, L.z - 1); }
    this.flash(1);
  }
  stepFinale(sh, t, dt) {
    for (const L of sh.line || []) {
      const st = t * 0.8 + L.ph; // each hero shifts their weight; now and then one swings or raises a hand
      L.m.userData.anim({ speed: 0, pitch: 0, gun: WEAPON_BY_ID[L.c.w] && WEAPON_BY_ID[L.c.w].kind === 'gun', weapon: true, melee: 0, cast: (st % 7) > 6.2 ? 1 : 0, alive: true }, dt, this.t);
    }
    if (t > 6.2 && !sh.logo) { sh.logo = true; this.$('.in-logo').classList.add('on'); this.flash(0.9); this.game.audio.play('boom', 0.45); for (const L of sh.line || []) { const E = EL[L.c.el]; this.fx.shockwave([L.x, this.H(L.x, L.z) + 0.2, L.z], 3, E ? E.accent : 0xffd090, 0.6); } }
    if (t > FINALE - 1.1 && !sh.out) { sh.out = true; const f = this.$('.in-fade'); f.style.transition = 'opacity 1s'; f.style.opacity = '1'; }
  }
  camFinale(sh, t) {
    const k = ease(clamp01(t / 7.5));
    const gy = this.H(0, 0);
    return { pos: V(lerp(-2.5, 0, k) + Math.sin(t * 0.15) * 0.6, gy + lerp(0.7, 2.0, k), lerp(4.5, 12.5, k)), look: V(0, gy + lerp(1.4, 2.2, k), -3), fov: lerp(36, 42, k) };
  }

  lights() {
    const c = this.camera, fw = new THREE.Vector3(), up = V(0, 1, 0);
    c.getWorldDirection(fw); const rt = new THREE.Vector3().crossVectors(fw, up).normalize(), aim = c.position.clone().addScaledVector(fw, 6);
    this.key.position.copy(c.position).addScaledVector(rt, 2.5).addScaledVector(up, 3); this.key.target.position.copy(aim);
    this.fill.position.copy(c.position).addScaledVector(rt, -3).addScaledVector(up, 0.5); this.fill.target.position.copy(aim);
  }

  pollPad() {
    let down = false;
    try { for (const p of navigator.getGamepads ? navigator.getGamepads() : []) { if (!p) continue; const b = p.buttons[0]; if (b && (b.pressed || b.value > 0.5)) down = true; /* ✕ on DualShock, A on Xbox */ } } catch {}
    if (down && !this.padWas) this.skip();
    this.padWas = down;
  }
  skip() {
    if (this.leaving || !this.alive) return;
    this.leaving = true; this.leaveT = 0;
    const g = this.game; g.audio.unlock(); g.audio.startLobbyMusic(); g.introSkipped = true;
    const f = this.$('.in-fade'); f.style.transition = 'none';
  }
  onResize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  end() {
    if (!this.alive) return;
    this.alive = false;
    window.removeEventListener('keydown', this.onKey, true);
    document.body.classList.remove('intro-on');
    this.ov.remove();
    this.fx.clearAll();
    this.scene.traverse((o) => { if (o.geometry && o.geometry.dispose && !o.isSkinnedMesh) { /* the shared hero and land geometry stays cached */ } });
    for (const S of this.sets.values()) this.scene.remove(S.group);
    for (const m of this.heroes.values()) this.scene.remove(m);
    this.clearActors();
    const g = this.game; g.intro = null; g.introSeen = performance.now();
    if (g.menu && g.menu.setDay && !g.root.dataset.lobby) g.menu.setDay(true);
    g.showPressStart();
  }
}

function lerpAng(a, b, k) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; }

// The title screen between the movie and the main menu (Nutty 2026-11-23): the logo over the valley and "Press any button".
// Any key, click or controller button opens the main menu; the menu song is already playing (or starts on that press).
export class PressStart {
  constructor(game) {
    this.game = game; this.alive = true; this.padWas = true; this.t = 0;
    const ov = (this.ov = document.createElement('div'));
    ov.id = 'press-start';
    ov.innerHTML = `<div class="ps-logo"><h1><em>The</em>PERFECT<span>RUN</span></h1></div><div class="ps-press">Press any button</div>`;
    game.root.appendChild(ov);
    document.body.classList.add('ps-on');
    this.onKey = (e) => { if (!this.alive) return; e.preventDefault(); e.stopPropagation(); if (this.t > 0.35 && !e.repeat) this.go(); };
    window.addEventListener('keydown', this.onKey, true);
    ov.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (this.t > 0.35) this.go(); });
    ov.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
    game.audio.startLobbyMusic(); // heard right away if sound is already allowed (the skip press allows it)
  }
  update(dt) {
    if (!this.alive) return;
    this.t += dt;
    const g = this.game;
    if (g.mode !== 'menu') { this.remove(); return; }
    let down = false;
    try { for (const p of navigator.getGamepads ? navigator.getGamepads() : []) { if (!p) continue; if (p.buttons.some((b) => b.pressed || b.value > 0.5)) down = true; } } catch {}
    if (down && !this.padWas && this.t > 0.35) this.go();
    this.padWas = down;
  }
  go() {
    if (!this.alive) return;
    const g = this.game; g.audio.unlock(); g.audio.startLobbyMusic(); g.audio.play('ui');
    g.lastInput = performance.now();
    this.remove();
  }
  remove() {
    if (!this.alive) return;
    this.alive = false;
    window.removeEventListener('keydown', this.onKey, true);
    document.body.classList.remove('ps-on');
    this.ov.classList.add('out'); setTimeout(() => this.ov.remove(), 400);
    if (this.game.ps === this) this.game.ps = null;
  }
}
