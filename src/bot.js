// The CPU player. One brain drives a Game the way a person would: it fills in the same input a keyboard would, turns to
// face its target and makes the same choices in the menus. Two modes:
//   'duel'  the hidden second game that fights you in the Duel Arena
//   'run'   plays your whole co-op run for you (solo) so you can watch it and see what to improve
import { CONFIG, WEAPON_BY_ID, NPCS } from './data.js';

const rnd = (a, b) => a + Math.random() * (b - a);
// Duel CPU Level (Easy, Medium, Hard, Insane): how fast it reacts, how well it aims and leads, how often it dodges, dashes and casts.
export const CPU_SKILL = [0.25, 0.6, 0.85, 1];
const TAU = Math.PI * 2;
const angDiff = (a, b) => ((b - a + Math.PI * 3) % TAU) - Math.PI;
const KEY = { q: 'KeyQ', e: 'KeyG', r: 'KeyF' };

// How far each weapon likes to fight from, and how far it can reach.
function prefRange(w) {
  if (w.kind === 'melee') return Math.max(1.5, w.range * 0.55);
  if (w.proj) return 14;
  if ((w.pellets || 1) >= 8) return 6.5;
  if (['sniper', 'dmr', 'lever', 'crossbow', 'magnum'].includes(w.id)) return 20;
  if (w.spread >= 0.03) return 10;
  return 13;
}
function maxRange(w) {
  if (w.kind === 'melee') return w.range + 0.7;
  if (w.proj) return 40;
  if ((w.pellets || 1) >= 8) return 15;
  if (['sniper', 'dmr', 'crossbow'].includes(w.id)) return 70;
  if (w.spread >= 0.03) return 24;
  return 42;
}

// Pick weights for the duel power-up rounds.
const DUEL_WEIGHT = {
  d_berserk: 1.3, d_blades: 1.5, d_ring: 1.3, d_rush: 1.1, d_vamp: 1.1, d_glass: 0.8, orbit: 1.3, aura: 1.1, dmg: 1.4, rate: 1.3, leech: 1,
  armor: 1, hp: 0.9, spd: 0.7, cd: 0.7, fire: 1.2, earth: 0.8, wind: 0.8, m_q_dmg: 0.6, m_r_dmg: 0.6, m_e_dmg: 0.6, m_d_dmg: 0.4,
};

export class Bot {
  constructor(game, mode) {
    this.g = game;
    this.mode = mode;
    this.t = 0;
    this.input = { keys: new Set(), pressed: new Set(), dx: 0, dy: 0, mouseDown: false, mouseClicked: false, rightClicked: false, aimHeld: false, wheel: 0, ax: 0, ay: 0, padSprint: false, padFire: false };
    this.strafe = 1; this.strafeT = 0;
    this.swapT = 0; this.abT = rnd(0.5, 1.5); this.jumpT = rnd(1, 3); this.dashT = rnd(1, 3);
    this.err = [0, 0, 0]; this.errT = 0;
    this.lastPos = null; this.lastPosT = 0; this.unstick = 0; this.unstickAng = 0;
    this.prev = new Map(); // opponent positions, to lead moving targets
    this.uiWait = 0;
    this.wander = null; this.wanderT = 0;
    this.openedCrates = 0; this.hired = 0;
    // What the run report is made of.
    this.log = [];
    this.stat = { stuck: 0, idle: 0, deaths: 0, unspentPC: [], crates: 0, picks: [] };
    this.lastPhase = null; this.lastRound = -1; this.lastAlive = true;
    this.phaseStart = 0;
    // How well the CPU plays a run: 1 = the old sharp shooter, lower = a more human player (slower turns, a beat of
    // reaction before tracking a new target, shaky aim that really misses, standing still to shoot, looking where it walks).
    // Duels keep the sharp CPU. Tests can set window.__cpuSkill.
    this.skill = mode === 'duel' ? CPU_SKILL[typeof window !== 'undefined' && window.__cpuLevel != null ? window.__cpuLevel : 1] ?? 0.6 : (typeof window !== 'undefined' && window.__cpuSkill != null ? window.__cpuSkill : 0.45);
    this.aimId = null; this.react = 0; this.stopT = 0; this.lookT = 0;
  }

  // ---------- menus and choices (run every frame, also while the game is frozen) ----------
  ui(dt) {
    const g = this.g, p = g.player;
    if (!p) return;
    this.t += dt;
    // Run report.
    if (this.mode === 'run') {
      if (g.phase !== this.lastPhase || g.round !== this.lastRound) {
        this.note(g.phase);
        this.lastPhase = g.phase; this.lastRound = g.round; this.phaseStart = this.t;
      }
      if (this.lastAlive && !p.alive) this.stat.deaths++;
      this.lastAlive = p.alive;
    }
    if (g.elemOpen) {
      this.uiWait += dt;
      if (this.uiWait > (g.elemKind === 'duel' ? 0.9 : 0.6)) { this.uiWait = 0; g.pickElem(this.chooseElem()); }
    } else if (g.blessOpen) {
      this.uiWait += dt;
      if (this.uiWait > 1.2) { this.uiWait = 0; const i = Math.floor(Math.random() * g.blessOpts.length); this.stat.picks.push(g.blessOpts[i].name); g.pickBlessing(i); }
    } else this.uiWait = 0;
    if (this.mode === 'run' && g.phase === 'vote' && !g.myVote && p.alive) {
      const final = g.round >= CONFIG.rounds - 1;
      g.castVote(!final && p.hp < p.stats.maxHp * 0.35 ? 'x' : 'f');
    }
  }

  chooseElem() {
    const g = this.g;
    let best = 0, bs = -1;
    g.elemOpts.forEach((o, i) => {
      const w = g.elemKind === 'duel' ? (DUEL_WEIGHT[o.id] || DUEL_WEIGHT[o.el] || 1) : o.el === 'storm' || o.el === 'fire' ? 1.3 : 1;
      const sc = w + Math.random() * 0.9;
      if (sc > bs) { bs = sc; best = i; }
    });
    if (g.elemKind !== 'duel') this.stat.picks.push(g.elemOpts[best].name);
    return best;
  }

  note(what) {
    const g = this.g, p = g.player;
    this.log.push({
      t: Math.round(this.t), round: (g.round || 0) + 1, what, kills: p.totalKills, level: p.level + 1, hp: Math.round((p.hp / p.stats.maxHp) * 100),
      pc: p.pc, powerups: p.powerups.length, blessings: p.blessings.length, deaths: this.stat.deaths,
    });
  }

  // The finished report: what the CPU did, and what looks worth improving.
  report() {
    if (this.log.length && this.log[this.log.length - 1].what !== this.g.phase) this.note(this.g.phase);
    const s = this.stat, notes = [];
    if (s.stuck > 6) notes.push('Got stuck on scenery ' + s.stuck + ' times: check colliders and props.');
    if (s.idle > 60) notes.push('Spent ' + Math.round(s.idle) + ' s with nothing to shoot: spawn pacing may be slow.');
    if (s.deaths) notes.push('Died ' + s.deaths + ' time' + (s.deaths > 1 ? 's' : '') + '.');
    const pc = s.unspentPC.filter((x) => x > 120);
    if (pc.length) notes.push('Reached the vote with spare PC ' + pc.length + ' time(s) (up to ' + Math.max(...pc) + '): not enough to spend it on.');
    if (s.crates) notes.push('Opened ' + s.crates + ' crate' + (s.crates > 1 ? 's' : '') + '.');
    // One row per round: how long the farming and the boss fight took, and what the build looked like at the vote.
    const rounds = [];
    for (const e of this.log) {
      if (e.what === 'play') rounds[e.round - 1] = { round: e.round, start: e.t };
      const r = rounds[e.round - 1];
      if (!r) continue;
      if (e.what === 'vote') { r.farm = e.t - r.start; r.voteT = e.t; r.kills = e.kills; r.level = e.level; r.pc = e.pc; r.powerups = e.powerups; }
      if (e.what === 'bless' || e.what === 'win' || e.what === 'over') { r.boss = e.t - (r.voteT || e.t); }
    }
    const rows = rounds.filter((r) => r && r.farm != null).map((r) => ({ ...r, boss: r.boss ?? 0 }));
    if (rows.length) {
      const slow = rows.reduce((a, b) => (b.boss > a.boss ? b : a));
      notes.push('Longest boss fight: round ' + slow.round + ' (' + slow.boss + ' s).');
    }
    return { log: this.log, rounds: rows, notes };
  }

  // ---------- one frame of input ----------
  step(dt) {
    const g = this.g, p = g.player, I = this.input;
    I.keys.clear(); I.pressed.clear();
    I.mouseDown = I.mouseClicked = false; I.ax = I.ay = 0; I.padSprint = false; I.dx = I.dy = 0;
    if (!p || !p.alive || p.out || p.frozenUntil > g.now) return I; // sealed in ice: no aiming either
    this.swapT -= dt; this.errT -= dt; this.strafeT -= dt; this.abT -= dt; this.jumpT -= dt; this.dashT -= dt;
    if (this.errT <= 0) { this.errT = this.skill < 1 ? rnd(0.5, 1.2) : rnd(0.25, 0.5); this.err = [rnd(-1, 1), rnd(-0.6, 0.6), rnd(-1, 1)]; }
    this.aimed = false; this.stopT -= dt;
    if (this.strafeT <= 0) { this.strafeT = rnd(0.7, 2.2); this.strafe = Math.random() < 0.3 ? -this.strafe : this.strafe; if (Math.random() < 0.25) this.strafe *= -1; }
    if (p.board) I.pressed.add('KeyE'); // never ride a skateboard
    if (this.mode === 'duel') this.duelStep(dt, I); else this.runStep(dt, I);
    this.antiStuck(dt, I);
    if (this.skill < 1 && !this.aimed && this.mode === 'run') this.lookWhereWalking(dt, I);
    return I;
  }

  // ---------- movement helpers ----------
  // Walk toward a world direction (dx, dz). Analog input is relative to where the player faces.
  walk(I, dx, dz, sprint) {
    const p = this.g.player;
    const l = Math.hypot(dx, dz);
    if (l < 1e-4) return;
    dx /= l; dz /= l;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    I.ay = dx * fx + dz * fz;
    I.ax = -dx * fz + dz * fx;
    I.padSprint = !!sprint;
    this.wantMove = true;
  }

  // Turn to face and aim at a target point; the shot flies from the muzzle to g.aim.point.
  aimAt(t, dt, lead = 0) {
    if (this.skill < 1) return this.aimHuman(t, dt, lead);
    const g = this.g, p = g.player;
    let tx = t.x, ty = t.y + t.h * 0.62, tz = t.z;
    const dist = Math.hypot(tx - p.pos.x, tz - p.pos.z);
    const v = this.prev.get(t.id);
    if (lead && v) { const k = dist / lead; tx += v.x * k; tz += v.z * k; }
    const sloppy = 0.12 + dist * 0.014;
    tx += this.err[0] * sloppy; ty += this.err[1] * sloppy * 0.6; tz += this.err[2] * sloppy;
    g.aim.point.set(tx, ty, tz);
    g.aim.target = t;
    const ex = tx - p.pos.x, ez = tz - p.pos.z, ey = ty - (p.pos.y + 1.5);
    const want = Math.atan2(ex, ez);
    p.yaw += angDiff(p.yaw, want) * Math.min(1, dt * 22);
    const wp = Math.atan2(-ey, Math.hypot(ex, ez));
    p.pitch += (Math.max(-1.0, Math.min(1.1, wp)) - p.pitch) * Math.min(1, dt * 22);
  }

  // A human-like aim: a short reaction before tracking a new target, a turn speed that has limits and eases in,
  // and an error that wanders. The shot goes where the crosshair really points, so misses are real misses.
  aimHuman(t, dt, lead) {
    const g = this.g, p = g.player, S = this.skill;
    this.aimed = true;
    if (t.id !== this.aimId) { this.aimId = t.id; this.react = rnd(0.18, 0.45) * (1.7 - S); }
    this.react -= dt;
    let tx = t.x, ty = t.y + t.h * 0.62, tz = t.z;
    const dist = Math.hypot(tx - p.pos.x, tz - p.pos.z);
    const v = this.prev.get(t.id);
    if (lead && v && S > 0.6) { const k = dist / lead; tx += v.x * k; tz += v.z * k; } // only good players lead their shots
    const sloppy = (0.3 + dist * 0.045) * (1.6 - S);
    tx += this.err[0] * sloppy; ty += this.err[1] * sloppy * 0.7; tz += this.err[2] * sloppy;
    const ex = tx - p.pos.x, ez = tz - p.pos.z, ey = ty - (p.pos.y + 1.5);
    if (this.react <= 0) {
      const maxRate = (2.2 + 5 * S) * dt, ease = Math.min(1, dt * (3 + 7 * S));
      const dy = angDiff(p.yaw, Math.atan2(ex, ez)) * ease;
      p.yaw += Math.max(-maxRate, Math.min(maxRate, dy));
      const wp = Math.max(-1.0, Math.min(1.1, Math.atan2(-ey, Math.hypot(ex, ez))));
      p.pitch += Math.max(-maxRate, Math.min(maxRate, (wp - p.pitch) * ease));
    }
    // Where the crosshair actually is, at the target's distance.
    const ch = Math.cos(p.pitch), r = Math.max(2, dist);
    g.aim.point.set(p.pos.x + Math.sin(p.yaw) * r, p.pos.y + 1.5 - Math.tan(p.pitch) * r, p.pos.z + Math.cos(p.yaw) * r);
    g.aim.target = null;
    this.offAim = Math.abs(angDiff(p.yaw, Math.atan2(t.x - p.pos.x, t.z - p.pos.z))); // how far off the real target we point
    void ch;
  }

  // Walking with nothing to shoot: turn smoothly to face the way we go (and glance around now and then), like a person would.
  lookWhereWalking(dt, I) {
    const p = this.g.player;
    if (!I.ax && !I.ay) return;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const wx = fx * I.ay - fz * I.ax, wz = fz * I.ay + fx * I.ax; // the world direction of this move
    this.lookT -= dt;
    if (this.lookT <= -2.5) this.lookT = rnd(3, 7);
    const glance = this.lookT < 0 ? Math.sin(this.lookT * 2.4) * 0.7 : 0; // a look to the side while walking
    const want = Math.atan2(wx, wz) + glance;
    const d = angDiff(p.yaw, want) * Math.min(1, dt * 3);
    p.yaw += d;
    p.pitch += (0.05 - p.pitch) * Math.min(1, dt * 2);
    // Keep walking the same world direction after the turn.
    const nfx = Math.sin(p.yaw), nfz = Math.cos(p.yaw), l = Math.hypot(wx, wz) || 1;
    I.ay = (wx * nfx + wz * nfz) / l; I.ax = (-wx * nfz + wz * nfx) / l;
  }

  trackVel(list, dt) {
    for (const t of list) {
      const o = this.prevPos && this.prevPos.get(t.id);
      if (o && dt > 0) { const v = this.prev.get(t.id) || { x: 0, z: 0 }; v.x += ((t.x - o.x) / dt - v.x) * 0.3; v.z += ((t.z - o.z) / dt - v.z) * 0.3; this.prev.set(t.id, v); }
    }
    this.prevPos = new Map(list.map((t) => [t.id, { x: t.x, z: t.z }]));
  }

  pickWeapon(I, dist) {
    const p = this.g.player;
    if (this.swapT > 0) return;
    const ws = p.weapons.map((id) => WEAPON_BY_ID[id]);
    const usable = (i) => ws[i].kind !== 'gear' && (ws[i].kind === 'melee' || p.ammo[i] > 0 || i !== p.cur); // passive gear is not a weapon
    let want = p.cur, bestScore = 1e9;
    ws.forEach((w, i) => {
      if (!usable(i)) return;
      let sc = Math.abs(dist - prefRange(w));
      if (i === p.cur) sc -= 2.5; // stay put unless the other is clearly better
      if (w.kind === 'gun' && p.ammo[i] <= 0) sc += 12;
      if (sc < bestScore) { bestScore = sc; want = i; }
    });
    if (want !== p.cur) { I.pressed.add('Digit' + (want + 1)); this.swapT = 0.9; }
  }

  // Close in or back off to the weapon's range, circle the target, fire.
  fight(I, tgt, dt, opts = {}) {
    const g = this.g, p = g.player;
    const dx = tgt.x - p.pos.x, dz = tgt.z - p.pos.z, dist = Math.hypot(dx, dz) || 0.01;
    this.pickWeapon(I, dist);
    const wp = p.weapon;
    const pref = prefRange(wp);
    const ux = dx / dist, uz = dz / dist;
    let rad = dist > pref + 2 ? 1 : dist < pref - 2 ? -1 : 0;
    if (wp.kind === 'melee') rad = dist > pref + 0.4 ? 1 : 0;
    if (opts.covered && wp.kind !== 'melee') rad = 0.5; // a wall is in the way: slide round it rather than walk into it
    const S = this.skill;
    const tang = (opts.covered ? 1.3 : wp.kind === 'melee' && dist < pref + 1 ? 0.5 : 0.95) * (S < 1 ? 0.25 + 0.6 * S : 1);
    let mx = ux * rad + -uz * this.strafe * tang, mz = uz * rad + ux * this.strafe * tang;
    // Shoot and scoot: when there is somewhere to be, keep heading there while the guns work.
    if (opts.goal) {
      const gx = opts.goal.x - p.pos.x, gz = opts.goal.z - p.pos.z, gl = Math.hypot(gx, gz) || 1;
      mx = gx / gl * 1.4 + mx * 0.35; mz = gz / gl * 1.4 + mz * 0.35;
    }
    // Stay inside the arena and away from its rim.
    const a = g.world.arena;
    if (opts.keepIn) {
      const rx = p.pos.x - a.x, rz = p.pos.z - a.z, rim = Math.hypot(rx, rz);
      if (rim > a.r - 7) { const k = (rim - (a.r - 7)) / 4; mx -= (rx / rim) * k * 1.6; mz -= (rz / rim) * k * 1.6; }
    }
    // A less practised player plants their feet to shoot every so often.
    if (S < 1 && wp.kind !== 'melee' && this.stopT <= -1.5 && Math.random() < dt * (1.2 - S)) this.stopT = rnd(0.6, 1.6);
    if (!(S < 1 && this.stopT > 0 && !opts.goal)) this.walk(I, mx, mz, dist > 22);
    this.aimAt(tgt, dt, wp.proj ? wp.speed : 0);
    // Fire when the shot can land (a human fires once they think they are on target, which is not always true).
    const onTarget = S >= 1 || wp.kind === 'melee' || (this.react <= 0 && (this.offAim || 0) < 0.12 + (1 - S) * 0.35);
    if (onTarget && dist <= maxRange(wp) && p.reloadT <= 0 && !p.dash && !opts.covered) {
      I.mouseDown = true;
      if (p.fireCd <= 0) I.mouseClicked = true;
    }
    if (wp.kind === 'gun' && p.ammo[p.cur] < wp.mag * 0.25 && dist > 12 && p.reloadT <= 0) I.pressed.add('KeyR');
    // Jump now and then, dash to close or to dodge.
    if (this.jumpT <= 0) { this.jumpT = S < 1 ? rnd(3, 8) : rnd(1.5, 4); if (p.onGround) I.keys.add('Space'); }
    if (this.dashT <= 0 && p.cds.d <= 0) {
      if (S >= 1 ? dist > 14 || Math.random() < 0.3 : Math.random() < 0.25 + 0.3 * S) { I.pressed.add('KeyX'); }
      this.dashT = S < 1 ? rnd(3, 7) : rnd(1.2, 3.5);
    }
    // Abilities when something is close enough to feel them.
    if (this.abT <= 0) {
      this.abT = S < 1 ? rnd(1.5, 4) : rnd(0.5, 1.2);
      const range = opts.abilityRange || 22;
      if (dist < range) for (const k of ['r', 'q', 'e']) if (p.cds[k] <= 0 && Math.random() < 0.6) { I.pressed.add(KEY[k]); break; }
    }
    return dist;
  }

  antiStuck(dt, I) {
    const p = this.g.player;
    this.lastPosT += dt;
    if (this.unstick > 0) {
      this.unstick -= dt;
      I.ax = I.ay = 0;
      this.walk(I, Math.sin(this.unstickAng), Math.cos(this.unstickAng), false);
      if (p.onGround) I.keys.add('Space');
    }
    if (this.lastPosT >= 0.6) {
      if (this.lastPos && this.wantMove) {
        const moved = Math.hypot(p.pos.x - this.lastPos.x, p.pos.z - this.lastPos.z);
        if (moved < 0.5 && this.unstick <= 0) { this.unstick = 0.8; this.unstickAng = rnd(0, TAU); this.stat.stuck++; this.wander = null; }
      }
      this.lastPos = { x: p.pos.x, z: p.pos.z };
      this.lastPosT = 0;
      this.wantMove = false;
    }
  }

  // ---------- Duel Arena ----------
  duelStep(dt, I) {
    const g = this.g;
    const foes = [];
    for (const [id, v] of g.views.players) if (v.alive && !v.mist) foes.push({ id, x: v.pos.x, y: v.pos.y, z: v.pos.z, r: 0.55, h: 1.85 }); // a fighter in Cloud Form cannot be seen
    this.trackVel(foes, dt);
    const foe = foes[0];
    if (!foe || g.phase !== 'duel') return;
    // Cover blocks bullets: no point firing at a wall, walk round it instead.
    const w = g.world, p = g.player, ex = p.pos.x, ey = p.pos.y + 1.5, ez = p.pos.z;
    const vx = foe.x - ex, vy = foe.y + 1.1 - ey, vz = foe.z - ez, vl = Math.hypot(vx, vy, vz) || 1;
    const covered = w.solids.length > 0 && w.rayBlock(ex, ey, ez, vx / vl, vy / vl, vz / vl, vl) < vl - 0.3;
    this.fight(I, foe, dt, { keepIn: true, abilityRange: 26, covered });
  }

  // ---------- a whole co-op run ----------
  runStep(dt, I) {
    const g = this.g, p = g.player, w = g.world;
    const ph = g.phase;
    if (ph !== 'play' && ph !== 'boss' && ph !== 'demon') return;
    const all = g.targets().filter((t) => t.kind !== 'demon');
    this.trackVel(all, dt);
    // Death hunts you: run for the altar and call the boss.
    const hunted = ph === 'demon' || !!g.views.demon;
    const a = w.arena;
    const toAltar = Math.hypot(a.x - p.pos.x, a.z - p.pos.z);
    // Nearest enemy.
    let tgt = null, td = 1e9;
    for (const t of all) {
      const d = Math.hypot(t.x - p.pos.x, t.z - p.pos.z);
      if (d < td) { td = d; tgt = t; }
    }
    const elapsed = g.endless ? this.t - this.phaseStart : 600 - (g.tl || 0); // seconds into the round
    const hpF = p.hp / p.stats.maxHp;
    // Low health: back away and burn the dash.
    if (hpF < 0.3 && tgt && td < 9) {
      this.walk(I, p.pos.x - tgt.x, p.pos.z - tgt.z, true);
      if (p.cds.d <= 0) I.pressed.add('KeyX');
    }
    this.spend(dt);
    if (ph === 'play' || ph === 'demon') {
      // The altar once the farming is done, or at once when Death shows up.
      // A timed round is played out to the very end: the altar is only called once the ten minutes are up.
      const callable = g.horde ? false : g.endless ? elapsed > 150 : (g.tl || 0) <= 1;
      if ((callable || hunted) && toAltar < 6.5) { if (!this.calledAt || this.t - this.calledAt > 5) { this.calledAt = this.t; this.stat.unspentPC.push(p.pc); g.request('early'); g.ui.toast('The altar answers…'); } }
    }
    // Fight what is near.
    // Start walking to the altar in the last seconds so the bot arrives as the clock runs out.
    const farmedNow = g.horde ? false : g.endless ? elapsed > 150 : (g.tl || 0) <= 25; // Horde Mode has no altar: fight, loot, repeat
    const heading = ph !== 'boss' && (farmedNow || hunted) && toAltar > 5 ? { x: a.x, z: a.z } : null;
    if (tgt && td < (ph === 'boss' ? 90 : 40)) {
      this.fight(I, tgt, dt, { abilityRange: 26, goal: heading });
      return;
    }
    if (!tgt || td >= 40) this.stat.idle += dt;
    // Nothing to shoot: loot, then head for the altar, otherwise roam so the next wave finds us.
    const farmed = farmedNow;
    if (ph === 'boss') { if (g.horde && tgt) this.walk(I, tgt.x - p.pos.x, tgt.z - p.pos.z, true); else this.walk(I, a.x - p.pos.x, a.z - p.pos.z, false); return; }
    const price = g.cratePrice();
    let crate = null, cd = 1e9;
    if (p.pc >= price && !hunted) for (const c of w.crates) { if (c.opened) continue; const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z); if (d < cd) { cd = d; crate = c; } }
    if (hunted || farmed) { if (toAltar > 5) this.walk(I, a.x - p.pos.x, a.z - p.pos.z, true); return; }
    if (crate) {
      if (cd < 2.6) { g.openCrate(crate); this.stat.crates++; } else this.walk(I, crate.x - p.pos.x, crate.z - p.pos.z, cd > 12);
      return;
    }
    this.roam(I, dt);
  }

  allCratesOpened() { return this.g.world.crates.every((c) => c.opened); }

  roam(I, dt) {
    const g = this.g, p = g.player, w = g.world;
    this.wanderT -= dt;
    if (!this.wander || this.wanderT <= 0 || Math.hypot(this.wander.x - p.pos.x, this.wander.z - p.pos.z) < 3) {
      const ang = rnd(0, TAU), r = rnd(12, 38);
      this.wander = { x: w.spawn.x + Math.cos(ang) * r, z: w.spawn.z + Math.sin(ang) * r };
      this.wanderT = rnd(6, 12);
    }
    this.walk(I, this.wander.x - p.pos.x, this.wander.z - p.pos.z, true);
  }

  // Spend PC when it piles up. (Beds are gone; crates are bought in the roaming code above.)
  spend(dt) {
    const g = this.g, p = g.player;
    this.spendT = (this.spendT || 0) - dt;
    if (this.spendT > 0) return;
    this.spendT = 2;
  }
}
