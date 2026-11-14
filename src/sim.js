// Host-authoritative simulation: enemies, bosses, the Demon Huntress, bought
// NPCs, crates, the round clock and phase changes. Only the host runs this;
// it reads every player's presence and writes the world snapshot `w`.
import { BULLET_TIME, BT_SLOW, BT_IN, BT_OUT, NECRO, LOWGRAV, GRAV_K, THRALL_LIFE, THRALL_MAX, THRALL_RISE, MU_MASK } from './mutators.js';
import { CONFIG, MOBS, MOB_TYPES, BOSSES, BOSS_HP, BOSS_GROW, BOSS_HP_ROUND, BOSS_DMG_ROUND, bossIdx, BIOMES, STAGE_MOBS, STAGE_FLY, FLYERS, DEMON, NPCS, NPC_TYPES, stageIdx, SEED_SPACE, SEED_HARD, seedFlags, MINI, ELITE, DUEL, DUEL_BIOMES, GRAV, armedBase, pickArm } from './data.js';

const q10 = (v) => Math.round(v * 10);
const EVENT_TTL = 1.6;
const SPACE_LEN = 10 * 60; // seconds on the crash site before The Visitor lands (10 minutes, like every round; Nutty 2026-11-06)

// Thermes, the final boss: eye lasers that sweep the arena and ground smashes whose shockwave you jump over.
export const THERMES = { laserWind: 0.9, laserTime: 2.6, laserSweep: 1.5, laserRange: 70, laserWidth: 2.4, laserDmg: 9, laserTick: 0.3, quakeWind: 1.0, quakeSpeed: 24, quakeRange: 62, quakeJump: 1.6, quakeDmg: 30, quakeKnock: 14 };

export const ENEMY_TUNE = { hp: 0.7, dmg: 0.7 };

export class HostSim {
  constructor(game, opts = {}) {
    this.game = game;
    this.epoch = Math.floor(Math.random() * 1e9);
    this.seq = 1;
    this.phase = 'lobby';
    this.round = 0;
    this.seed = 0;
    this.runSeed = 0;
    this.tl = 0;
    this.roundLen = opts.roundLen ?? 600; // 0 = endless: the round ends when the altar is used
    this.rt = 0;
    this.mobs = new Map();
    this.mu = 0; // mutator bits (mutators.js)
    this.npcs = new Map();
    this.boss = null;
    this.demon = null;
    this.events = [];
    this.ack = {};
    this.rack = {};
    this.opened = new Set();
    this.nextId = 1;
    this.spawnCd = 2; this.seedDue = true;
    this.time = 0;
    this.voteTally = { f: 0, x: 0 };
    this.lastPlayers = [];
    this.duel = false; this.winner = ''; this.pickN = 0;
    this.arena = -1; // which Duel Arena (index into DUEL_BIOMES) the current or last match is in; -1 before the first
    this.dots = []; // damage over time on players, from burning and poisonous melee
    this.blasts = []; // bomber explosions waiting to hurt NPCs (players check their own distance)
    this.wells = []; // Gravity Gun wells: pull everything in for GRAV.dur seconds, then blast
  }

  // Rebuild from the last snapshot when the previous host disappears.
  static fromSnapshot(game, w) {
    const s = new HostSim(game, { roundLen: w.rl });
    s.phase = w.ph; s.round = w.rd; s.seed = w.sd; s.runSeed = w.rs || 0; s.mu = (w.mu | 0) & MU_MASK; s.tl = w.tl; s.arena = w.ar ?? (w.du ? 0 : -1);
    if (w.du) {
      // A duel carries on under the new host: same arena, clock and winner; a power-up round counts the picks already made.
      s.duel = true; s.roundLen = DUEL.len; s.winner = w.wn || '';
      s.puT = w.pt || DUEL.pickEvery; s.pickWait = 0; s.cd = DUEL.count; s.lastCd = -1;
      s.pickN = Math.max(w.dp || 0, ...game.party.peers().map((q) => (q.p && q.p.dk) || 0));
    }
    s.seq = (w.e && w.e.length ? Math.max(...w.e.map((e) => e[1])) : 0) + 1;
    s.ack = { ...(w.ak || {}) }; s.rack = { ...(w.rk || {}) };
    s.opened = new Set(w.oc || []);
    for (const m of w.m || []) {
      const type = MOB_TYPES[m[1]];
      const base = MOBS[type];
      const maxHp = base.hp * s.hpScale();
      const mini = m[9] ? s.miniHpMul() : 1;
      const nm = s.newMob(type, m[2] / 10, m[3] / 10, m[0], maxHp * mini * (m[4] / 100), m[11] | 0);
      if (m[9]) { nm.mini = 1; nm.maxHp = maxHp * mini; }
      if (m[8] != null) nm.fy = m[8] / 10;
      if (m[10]) { s.makeElite(nm, m[10]); nm.hp = nm.maxHp * (m[4] / 100); }
      s.mobs.set(m[0], nm);
      s.nextId = Math.max(s.nextId, m[0] + 1);
    }
    if (w.b) { s.spawnBoss(); s.boss.x = w.b[1] / 10; s.boss.z = w.b[2] / 10; s.boss.hp = s.boss.maxHp * (w.b[3] / 1000); }
    if (w.dm) { s.spawnDemon(); s.demon.x = w.dm[0] / 10; s.demon.z = w.dm[1] / 10; if (w.dm[4]) s.demon.hp = s.demon.maxHp * (w.dm[4] / 1000); s.deathDone = true; }
    for (const n of w.n || []) {
      const type = NPC_TYPES[n[1]];
      const npc = s.newNpc(type, n[2], n[3] / 10, n[4] / 10, n[0]);
      npc.hp = npc.maxHp * (n[5] / 100);
      if (n[9]) { npc.mt = n[9] - 1; npc.wi = n[10] | 0; npc.dmg = npc.maxHp * 0.3; }
      s.npcs.set(n[0], npc);
      s.nextId = Math.max(s.nextId, n[0] + 1);
    }
    return s;
  }

  get world() { return this.game.world; }
  // Give a mob an elite modifier (ELITE.kinds): tougher, and each kind has its own trick.
  makeElite(m, kind) {
    const K = ELITE.kinds[kind];
    if (!K) return;
    m.el = kind; m.maxHp *= K.hp; m.hp = m.maxHp; m.speed *= K.speed;
    if (kind === 2) m.shield = m.maxHp * ELITE.shield;
  }
  eliteOk(B) { return !B.fly && !B.swarm && !B.bomb && !B.summon && !B.summoned && B.cost == null; }
  miniHpMul() { return MINI.hpMul + this.round * MINI.hpPerRound; }
  // Enemies start tough and get much tougher every round (health far faster than damage, so fights get longer before they get deadlier).
  hard() { return seedFlags(this.runSeed).hard; } // Hard mode: tougher, harder-hitting, more of them
  // ENEMY_TUNE: Nutty asked for enemy health and damage 30% lower (2026-11-04); it scales every mob, elite and boss hit.
  hpScale() { return ENEMY_TUNE.hp * 1.5 * Math.pow(1.3, this.round) * (this.hard() ? 2 : 1); } // Nutty 2026-11-12 15:11: 1.3x a round; Hard is twice that all the way // // Hard: three times the health and damage (Nutty 2026-11-12 14:43; was 1.5x and 1.35x) // 1.2x health every round (Nutty 2026-11-11), and a further 1.1x a round on top (Nutty 2026-11-12 14:38) so they last a little longer; same for damage
  dmgScale() { return ENEMY_TUNE.dmg * 1.2 * Math.pow(1.3, this.round) * (this.hard() ? 2 : 1) * this.easeIn() * (this.duel ? 1 : 0.42); } // x0.42 in runs: the crowd is three times the size (playtest 2026-11-12: 21 deaths in round 1 without it) // 1.2x damage every round (Nutty 2026-11-11)
  bossDmgScale() { return ENEMY_TUNE.dmg * 1.2 * Math.pow(1.2, this.round) * (this.hard() ? 1.35 : 1) * this.easeIn() * (this.round === 0 && !this.duel ? 0.6 : 1); } // bosses keep their own curve: +20% a round; the first boss hits at 60% (playtest 2026-11-12: it killed a fresh player in seconds)
  // Round 1 eases new players in: enemies hit at 55% for the opening and reach full strength by the 4-minute mark.
  easeIn() { return this.round === 0 && this.phase === 'play' && !this.duel ? Math.min(1, 0.55 + ((this.rt || 0) / 240) * 0.45) : 1; }

  ev(...data) {
    const e = [data[0], this.seq++, ...data.slice(1)];
    e.t = this.time;
    this.events.push(e);
    return e;
  }

  // Duel Arena: one 10 minute match in one of the three arenas (see DUEL_BIOMES). Phases: dcount (3, 2, 1) -> duel <-> dpick (every 30 s the
  // game stops until everyone has chosen a power-up) -> dend (winner announced).
  startDuel(pick = -1) {
    this.duel = true; this.mu = 0;
    this.roundLen = DUEL.len;
    this.round = 0;
    this.runSeed = (Math.random() * 2 ** 31) | 0;
    this.seed = (Math.random() * 2 ** 31) | 0;
    // A random arena for every match, never the one just played (a rematch always moves on). It travels in the snapshot ('ar').
    const na = DUEL_BIOMES.length;
    // The players choose the arena on the Stage Select screen (pick); without a pick it is a random one, never the one just played.
    this.arena = pick >= 0 && pick < na ? pick | 0 : this.arena < 0 ? (Math.random() * na) | 0 : (this.arena + 1 + ((Math.random() * (na - 1)) | 0)) % na;
    this.phase = 'dcount';
    this.tl = DUEL.len; this.cd = DUEL.count; this.lastCd = -1;
    this.puT = DUEL.pickEvery; this.pickN = 0; this.pickWait = 0;
    this.winner = '';
    this.mobs.clear(); this.npcs.clear(); this.boss = null; this.demon = null;
    this.dots.length = 0; this.blasts.length = 0; this.wells.length = 0; this.opened.clear();
    this.ev('msg', 'Duel Arena');
  }

  endDuel(winner) {
    this.phase = 'dend';
    this.winner = winner || '';
    this.ev('dw', this.winner);
  }

  updateDuel(dt, players) {
    const ready = this.world && this.world.seed === this.seed;
    if (this.phase === 'dcount') {
      if (!ready) return;
      this.cd -= dt;
      const n = Math.max(0, Math.ceil(this.cd));
      if (n !== this.lastCd) { this.lastCd = n; this.ev('dc', n); }
      if (this.cd <= 0) { this.phase = 'duel'; this.ev('dc', 0); }
    } else if (this.phase === 'duel') {
      this.tl = Math.max(0, this.tl - dt);
      this.puT -= dt;
      if (players.length < 2) { this.endDuel(players[0] ? players[0].id : ''); return; }
      const down = players.filter((p) => !p.alive || p.hp <= 0);
      if (down.length) {
        const up = players.filter((p) => p.alive && p.hp > 0);
        this.endDuel(up.length === 1 ? up[0].id : '');
        return;
      }
      if (this.tl <= 0) {
        // Time is up: the healthier fighter wins.
        const f = (p) => p.hp / Math.max(1, p.mh);
        const s = [...players].sort((a, b) => f(b) - f(a));
        this.endDuel(Math.abs(f(s[0]) - f(s[1])) < 0.001 ? '' : s[0].id);
        return;
      }
      if (this.puT <= 0 && this.tl > 4) { this.phase = 'dpick'; this.pickN++; this.pickWait = 0; this.ev('dp', this.pickN); }
    } else if (this.phase === 'dpick') {
      this.pickWait += dt;
      if (players.every((p) => (p.raw.dk || 0) >= this.pickN) || this.pickWait > 90) { this.phase = 'duel'; this.puT = DUEL.pickEvery; }
    }
  }

  // flags: { space: the hidden space map is unlocked and joins the stage pool, hard: Hard mode }; both ride in the seed's low bits (see seedFlags).
  startRun(roundLen, flags = {}) {
    this.duel = false;
    this.mu = (flags.mu | 0) & MU_MASK; // mutators (see mutators.js)
    this.roundLen = roundLen;
    this.round = 0;
    this.runSeed = (((Math.random() * 2 ** 31) | 0) & ~3) | (flags.space ? SEED_SPACE : 0) | (flags.hard ? SEED_HARD : 0); // sets this run's stage order and difficulty
    this.beginRound();
  }

  beginRound() {
    this.seed = (Math.random() * 2 ** 31) | 0;
    this.phase = 'play';
    this.space = stageIdx(this.runSeed, this.round) === 7; // Crash Site Prime: a 10-minute clock, and The Visitor lands when it hits zero
    this.tl = this.space ? SPACE_LEN : this.roundLen;
    this.tl0 = this.tl;
    this.rt = 0;
    this.miniDone = 0;
    this.mobs.clear();
    this.dots.length = 0; this.blasts.length = 0; this.wells.length = 0;
    this.boss = null;
    this.demon = null;
    this.deathDone = false; // Death comes once per round
    this.opened.clear();
    this.spawnCd = 4; this.seedDue = true;
    this.pendingNpcRelocate = true;
    this.lineup = this.pickLineup(this.round);
    this.ev('msg', 'Round ' + (this.round + 1) + ' · ' + Object.keys(this.lineup).map((t) => MOBS[t].name + 's').join(', '));
  }

  // ---------- inputs ----------
  readPlayers(peers) {
    const out = [];
    for (const pr of peers) {
      const p = pr.p;
      if (!p || !p.ig || !Array.isArray(p.p)) continue;
      out.push({ id: pr.id, x: p.p[0] / 10, y: p.p[1] / 10, z: p.p[2] / 10, ry: (p.ry || 0) / 100, alive: !!p.al, out: !!p.out, hp: p.hp || 0, mh: p.mh || 100, v: p.v, hid: !!p.hd, raw: p }); // hid: in Cloud Form, nothing can see them
    }
    return out;
  }

  processInputs(peers, players) {
    for (const pr of peers) {
      const p = pr.p;
      if (!p) continue;
      const last = this.ack[pr.id] || 0;
      let max = last;
      if (Array.isArray(p.h)) {
        for (const h of p.h) {
          if (!Array.isArray(h) || h[0] <= last) continue;
          max = Math.max(max, h[0]);
          this.applyHit(pr.id, h);
        }
      }
      if (max !== last) this.ack[pr.id] = max;
      const rl = this.rack[pr.id] || 0;
      let rmax = rl;
      if (Array.isArray(p.rq)) {
        for (const r of p.rq) {
          if (!Array.isArray(r) || r[0] <= rl) continue;
          rmax = Math.max(rmax, r[0]);
          this.applyRequest(pr.id, r, players);
        }
      }
      if (rmax !== rl) this.rack[pr.id] = rmax;
    }
  }

  // h: [seq, targetId, dmg, slow, freeze, burn, kx10, kz10]
  applyHit(from, h) {
    const [, id, dmg, slow = 0, freeze = 0, burn = 0, kx = 0, kz = 0, lock = 0, launch = 0] = h; // lock: frozen solid for that long, whatever the size; launch: hurled up at that speed
    const d = Math.max(0, Math.min(5000, +dmg || 0));
    if (id === 'B' && this.boss) {
      this.boss.hp -= d;
      this.boss.lastHit = from;
      if (slow) this.boss.slow = Math.max(this.boss.slow, slow * 0.4);
      if (lock) this.boss.frozen = Math.max(this.boss.frozen || 0, lock);
      if (burn) this.boss.burn = Math.max(this.boss.burn, burn);
      if (this.boss.hp <= 0) this.killBoss(from);
      return;
    }
    if (typeof id === 'string' && id.startsWith('P:')) {
      // Duel: one fighter's hit on the other. The victim's own game applies the damage when it reads this event.
      const vid = id.slice(2);
      if (!this.duel || this.phase !== 'duel' || vid === from || !this.lastPlayers.some((q) => q.id === vid)) return;
      // Slow, freeze, ice block (lock), shove and launch ride along with the hit; the victim's own game applies them (Player.takeStatus).
      const st = slow || freeze || lock || kx || kz || launch ? [slow, freeze, lock, kx, kz, launch] : [];
      this.ev('a', vid, Math.max(1, Math.min(300, Math.round(d * DUEL.pvp))), 'pvp', ...st);
      if (burn) this.addDot(vid, 4, Math.min(8, Math.ceil(burn)), 1, 'burn');
      return;
    }
    if (id === 'D') {
      const dm = this.demon;
      if (!dm) return;
      dm.hp -= d;
      dm.lastHit = from;
      if (dm.hp <= 0) { this.ev('dd', from, q10(dm.x), q10(dm.z)); this.demon = null; }
      return;
    }
    const m = this.mobs.get(id);
    if (!m) return;
    this.wake(m);
    let dd = d, guard = 1;
    if (m.base.guard) {
      // Frontal shield: hits that come from the side the mob faces are mostly turned aside.
      const a = this.lastPlayers.find((q) => q.id === from);
      if (a) {
        const ax = a.x - m.x, az = a.z - m.z, al = Math.hypot(ax, az) || 1;
        if ((Math.sin(m.yaw) * ax + Math.cos(m.yaw) * az) / al > 0.25) {
          dd = d * (1 - m.base.guard); guard = 0.3;
          if (this.time - (m.bkT || -9) > 0.2) { m.bkT = this.time; this.ev('bk', m.id); }
        }
      }
    }
    if (m.shield > 0) { // Shielded elite: the glowing shell soaks damage first
      const soak = Math.min(m.shield, dd); m.shield -= soak; dd -= soak;
      if (m.shield <= 0) this.ev('bk', m.id);
    }
    m.hp -= dd;
    m.lastHit = from;
    if (slow) m.slow = Math.max(m.slow, slow);
    if (freeze) m.frozen = Math.max(m.frozen, freeze * (m.base.radius >= 1 || m.mini ? 0.5 : 1));
    if (lock) m.frozen = Math.max(m.frozen, lock);
    if (launch && !m.base.fly && m.mode !== 'leap') { m.lvy = Math.max(m.lvy || 0, launch * (m.base.radius >= 1 || m.mini ? 0.6 : 1)); m.frozen = Math.max(m.frozen, 0.1); }
    if (burn) m.burn = Math.max(m.burn, burn);
    if ((this.mu & LOWGRAV) && Math.hypot(kx || 0, kz || 0) >= 30 && !m.base.fly && m.mode !== 'leap' && !(m.base.radius >= 1 || m.mini)) {
      m.lvy = Math.max(m.lvy || 0, Math.min(6.5, 2.2 + Math.hypot(kx, kz) * 0.04)); // Low Gravity: a big hit sends it drifting up
    }
    if (kx || kz) {
      const k = (m.base.radius >= 1 || m.mini ? 0.35 : 1) * guard;
      m.kx += (kx / 10) * k; m.kz += (kz / 10) * k;
    }
    // Stagger: a hit stops the mob for a moment and shoves it back a step, so every shot is felt. Big ones barely budge.
    if (dd > 0 && m.hp > 0) {
      const big = m.base.radius >= 1 || m.mini;
      m.stag = Math.max(m.stag, (big ? 0.12 : 0.28) * guard);
      m.atk = Math.max(m.atk, m.stag + 0.1);
      const a = this.lastPlayers.find((q) => q.id === from);
      if (a) { const ax = m.x - a.x, az = m.z - a.z, al = Math.hypot(ax, az) || 1, kk = (big ? 0.5 : 2.4) * guard; m.kx += (ax / al) * kk; m.kz += (az / al) * kk; }
    }
    if (m.hp <= 0) this.killMob(m, from);
  }

  applyRequest(from, r, players) {
    const [, kind, arg] = r;
    if (kind === 'npc' && NPCS[arg] && NPCS[arg].summoned && !NPCS[arg].risen) { // hired helpers are gone; only Zombie Staff summons remain
      const owner = players.find((p) => p.id === from);
      const x = owner ? owner.x + 2 : this.world.spawn.x, z = owner ? owner.z + 2 : this.world.spawn.z;
      const k = NPCS[arg].summoned ? 5 : 1;
      if (this.duel && NPCS[arg].summoned) for (const n of [...this.npcs.values()]) if (n.owner === from && n.d.summoned) { this.npcs.delete(n.id); this.ev('nd', n.id, q10(n.x), q10(n.z)); } // duel: one pack at a time
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2 + Math.random();
        const n = this.newNpc(arg, from, k > 1 ? (owner ? owner.x : x) + Math.cos(a) * 2.6 : x, k > 1 ? (owner ? owner.z : z) + Math.sin(a) * 2.6 : z);
        this.npcs.set(n.id, n);
        this.ev('ns', n.id, arg);
      }
    } else if (kind === 'raise') {
      // Necromancer's Raise the Dead: for 10 s this runner's kills get back up and fight for them.
      (this.raiseBy || (this.raiseBy = {}))[from] = this.time + 10;
      // Duel Arena: nothing dies there, so three of the dead climb out of the ground and hunt the other duelist.
      if (this.duel && this.phase === 'duel') {
        const owner = players.find((p) => p.id === from);
        for (const n of [...this.npcs.values()]) if (n.owner === from && n.mt != null) { this.npcs.delete(n.id); this.ev('nd', n.id, q10(n.x), q10(n.z)); }
        const ti = Math.max(0, MOB_TYPES.indexOf('shambler') >= 0 ? MOB_TYPES.indexOf('shambler') : MOB_TYPES.indexOf('grunt'));
        for (let i = 0; i < 3 && owner; i++) {
          const a = (i / 3) * Math.PI * 2 + Math.random();
          const n = this.newNpc('thrall', from, owner.x + Math.cos(a) * 3, owner.z + Math.sin(a) * 3);
          n.mt = ti; n.wi = 0; n.maxHp = n.hp = 160; n.dmg = 230; n.spd = 4.8;
          n.wake = THRALL_RISE; n.life = THRALL_LIFE + THRALL_RISE;
          this.npcs.set(n.id, n);
          this.ev('ns', n.id, 'thrall');
        }
      }
    } else if (kind === 'rematch' && this.duel && this.phase === 'dend') {
      this.startDuel();
    } else if (kind === 'gift' && Array.isArray(arg)) {
      // Share PC with a teammate, in steps of 10. The sender already paid on their side.
      const [to, amt] = arg;
      if (typeof to === 'string' && to !== from && amt >= 10 && amt <= 1000 && amt % 10 === 0) this.ev('gf', from, to, amt | 0);
    } else if (kind === 'clear' && Array.isArray(arg)) {
      // A player respawned: shove the mobs standing around them back so the respawn is not an instant death.
      const [cx, cz] = arg;
      for (const m of this.mobs.values()) {
        const dx = m.x - cx, dz = m.z - cz, d = Math.hypot(dx, dz) || 0.01;
        if (d < 14) { m.x = cx + (dx / d) * 18; m.z = cz + (dz / d) * 18; }
      }
    } else if (kind === 'gv' && Array.isArray(arg)) {
      // Gravity Gun: a well opens at (x, y, z). k is the shooter's damage multiplier (x100).
      const [x, y, z, k] = arg.map(Number);
      const live = this.duel ? this.phase === 'duel' : this.phase === 'play' || this.phase === 'boss';
      if (!live || ![x, y, z, k].every(Number.isFinite) || this.wells.length >= GRAV.max) return;
      this.wells.push({ from, x: x / 10, y: y / 10, z: z / 10, k: Math.max(0.3, Math.min(4, k / 100)), t: 0, bossMoved: 0 });
    } else if (kind === 'crate') {
      this.opened.add(arg | 0);
    } else if (kind === 'early' && this.phase === 'play' && (this.roundLen <= 0 || this.tl <= 0.5)) {
      this.startBoss(); // no way out: the altar only calls the boss, and only after the round clock has run out
    }
  }

  // ---------- spawning ----------
  newMob(type, x, z, id, hp, wi) {
    // Armed mobs (MOB_ARM_POOL) pick a weapon from their class when they appear; it changes reach, damage and whether they shoot.
    if (wi === undefined) wi = pickArm(type);
    const base = armedBase(type, wi);
    let maxHp = base.hp * this.hpScale();
    // Toughness follows size (the player is 1.8 m): enemies about the player's size go down fast, bigger ones soak far more hits.
    if (id === undefined && hp === undefined) maxHp *= base.height <= 2.35 ? 0.35 : (base.height > 3.2 ? 1.6 : 1) * 1.2;
    return {
      id: id ?? this.nextId++, type, ti: MOB_TYPES.indexOf(type), wi, x, z, maxHp, hp: hp ?? maxHp,
      atk: Math.random() * base.rate, slow: 0, frozen: 0, burn: 0, stag: 0, kx: 0, kz: 0, yaw: 0, anim: 0,
      fy: base.fly ? 7 + Math.random() * 2 : 0, mode: 'orbit', modeT: 0,
      speed: base.speed * (0.9 + Math.random() * 0.2) * (1 + this.round * 0.04), base, strafe: Math.random() < 0.5 ? 1 : -1,
      cd: 1 + Math.random() * 3, fuse: 0, owner: 0,
      // Roaming: a fresh mob wanders near where it appeared (hx, hz) until a player comes close or hurts it.
      roam: 1, hx: x, hz: z, wx: x, wz: z, wt: 0, pause: 0,
    };
  }

  // A mob notices you: it and its pack-mates nearby give chase from now on.
  wake(m, spread = true) {
    if (!m.roam) return;
    m.roam = 0; m.wt = 0;
    m.atk = Math.max(m.atk, 0.5 + Math.random() * 0.5);
    if (!spread) return;
    for (const o of this.mobs.values()) if (o.roam && o !== m && Math.hypot(o.x - m.x, o.z - m.z) < 8) this.wake(o, false); // only its own little group comes with it (was 16 m)
  }

  // How many enemies hunt the players at once in a run: round 1 starts small and it grows each round (more on Hard).
  huntCap(players) { const n = players.filter((p) => p.alive).length || 1; return this.duel ? 1e9 : Math.round((12 + this.round * 5) * (0.6 + 0.4 * n) * (this.hard() ? 1.3 : 1) * (this.round === 0 ? Math.min(1, 0.5 + (this.rt || 0) / 360) : 1)); }

  // Wandering: drift between points near home, with pauses, at a third of running speed.
  wander(m, dt, t) {
    m.wt -= dt;
    if (m.wt <= 0) {
      m.wt = 2 + Math.random() * 4;
      m.pause = Math.random() < 0.35 ? 1 : 0;
      // The group drifts a little toward the nearest player each time it picks a new spot, so a fight finds
      // someone who stands still eventually, but only after a good while.
      if (t) { m.hx += (t.x - m.hx) * 0.06; m.hz += (t.z - m.hz) * 0.06; }
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 14;
      m.wx = m.hx + Math.sin(a) * r; m.wz = m.hz + Math.cos(a) * r;
    }
    if (m.base.fly) { const dfy = 6.5 - m.fy; m.fy = Math.max(0, m.fy + Math.sign(dfy) * Math.min(Math.abs(dfy), 3 * dt)); }
    if (m.pause) return;
    const dx = m.wx - m.x, dz = m.wz - m.z, d = Math.hypot(dx, dz);
    if (d < 0.8) { m.pause = 1; return; }
    const want = Math.atan2(dx, dz), dy = Math.atan2(Math.sin(want - m.yaw), Math.cos(want - m.yaw));
    m.yaw += Math.max(-2.5 * dt, Math.min(2.5 * dt, dy));
    const sp = m.speed * 0.32 * (m.frozen > 0 || m.stag > 0 ? 0 : 1);
    m.x += (dx / d) * sp * dt; m.z += (dz / d) * sp * dt;
  }

  newNpc(type, owner, x, z, id) {
    const d = NPCS[type];
    return { id: id ?? this.nextId++, type, ti: NPC_TYPES.indexOf(type), owner, x, z, hp: d.hp * (1 + this.round * 0.2), maxHp: d.hp * (1 + this.round * 0.2), atk: 0, heal: 1, yaw: 0, anim: 0, d, life: d.life || 0 };
  }

  pickSpawnPoint(players, wide = false) {
    const w = this.world;
    const alive = players.filter((p) => p.alive);
    if (!alive.length) return null;
    for (let tries = 0; tries < 25; tries++) {
      const p = alive[Math.floor(Math.random() * alive.length)];
      if (wide) {
        // Anywhere on the map, out of sight of everyone: the groups you meet while exploring.
        const a = Math.random() * Math.PI * 2, rr = 20 + Math.sqrt(Math.random()) * 135;
        const x = Math.sin(a) * rr, z = Math.cos(a) * rr;
        if (w.blocked(x, z, 1) || (w.noPlace && w.noPlace(x, z, 1))) continue;
        if (players.some((o) => o.alive && Math.hypot(o.x - x, o.z - z) < 60)) continue;
        return [x, z];
      }
      // Groups appear well out of sight in any direction (a little more often ahead, so a walk runs into them), never close.
      // (2026-11-08: fewer straight ahead and farther out, so a group never seems to pop up in front of you)
      const ahead = Math.random() < 0.3;
      const ang = ahead ? p.ry + (Math.random() - 0.5) * Math.PI * 1.2 : p.ry + Math.PI + (Math.random() - 0.5) * Math.PI * 1.2;
      const dist = (ahead ? 88 : 70) + Math.random() * 28;
      const x = p.x + Math.sin(ang) * dist, z = p.z + Math.cos(ang) * dist;
      if (Math.hypot(x, z) > 166) continue;
      if (w.blocked(x, z, 1) || (w.noPlace && w.noPlace(x, z, 1))) continue;
      if (players.some((o) => o.alive && Math.hypot(o.x - x, o.z - z) < CONFIG.minSpawnDist)) continue;
      return [x, z];
    }
    return null;
  }

  // Each round rolls its own mix of enemy types. Later rounds lean on
  // tougher tiers, on top of the usual health and damage scaling.
  pickLineup(r) {
    const tierW = [[1, 0.15, 0], [1, 0.6, 0.05], [0.6, 1, 0.3], [0.35, 1, 0.7], [0.2, 0.8, 1], [0.1, 0.6, 1]][Math.min(5, r)];
    // Each stage fields its own tribe (STAGE_MOBS), so no two levels of a run share a lineup. Duels have no stage: the whole roster.
    const stage = this.duel ? null : BIOMES[stageIdx(this.runSeed, r)];
    const types = (stage && STAGE_MOBS[stage.id]) || MOB_TYPES;
    const pool = types.map((t) => ({ t, w: tierW[MOBS[t].tier - 1] * (MOBS[t].w ?? 1) })).filter((o) => o.w > 0 && !MOBS[o.t].fly && !MOBS[o.t].summoned);
    const pick = [];
    const n = Math.min(pool.length, 5 + Math.min(3, Math.floor(r / 2)));
    while (pick.length < n) {
      let roll = Math.random() * pool.reduce((a, o) => a + o.w, 0);
      const i = pool.findIndex((o) => (roll -= o.w) <= 0);
      pick.push(pool.splice(i < 0 ? 0 : i, 1)[0]);
    }
    // Weight within the round: weaker types show up more often. Ghoul/Stalker carry a small multiplier.
    const heavy = (B) => (B.radius >= 0.8 || B.model === 'brute' ? 1.3 : 1); // Nutty 2026-11-12 13:19: half heavy-set, half regular (views.js girth does the split)
    const lineup = Object.fromEntries(pick.map((o) => [o.t, [50, 26, 14][MOBS[o.t].tier - 1] * (MOBS[o.t].w ?? 1) * heavy(MOBS[o.t]) * (0.8 + Math.random() * 0.4)]));
    // From round 3 on, flyers join every lineup.
    const fly = (stage && STAGE_FLY[stage.id]) || [FLYERS[(r + ((this.runSeed | 0) & 3)) % FLYERS.length]];
    fly.forEach((f, i) => { lineup[f] = (i === 0 ? 16 : 9) * (0.8 + Math.random() * 0.4); });
    return lineup;
  }

  // One champion a bit into every round, two from round 3 on.
  spawnMiniTry(players) { return this.spawnMini(players); }

  spawnMini(players) {
    const kinds = Object.keys(this.lineup || {}).filter((k) => !MOBS[k].fly && !MOBS[k].swarm && !MOBS[k].bomb && !MOBS[k].summon && MOBS[k].cost == null);
    const strong = kinds.filter((k) => MOBS[k].tier >= 2);
    const pool = strong.length ? strong : kinds.length ? kinds : ['troll'];
    const type = pool[Math.floor(Math.random() * pool.length)];
    const pt = this.pickSpawnPoint(players);
    if (!pt) return false;
    const m = this.newMob(type, pt[0], pt[1]);
    m.mini = 1;
    m.maxHp *= this.miniHpMul(); m.hp = m.maxHp;
    m.speed *= 0.9;
    this.mobs.set(m.id, m);
    this.ev('msg', 'A champion ' + MOBS[type].name + ' has appeared');
    return true;
  }

  spawnTick(dt, players) {
    if (this.phase !== 'play' && this.phase !== 'demon') return;
    if (this.phase === 'play') {
      // Timed rounds: a champion at 28% and 62% of the clock. Endless rounds: one every ~2.5 minutes.
      const due = this.roundLen > 0
        ? this.tl0 && this.miniDone < (this.round >= 2 ? 2 : 1) && this.tl <= this.tl0 * [0.72, 0.38][this.miniDone]
        : this.rt >= 90 + this.miniDone * 150;
      if (due && this.spawnMiniTry(players)) this.miniDone++;
    }
    // Recycle strays: a mob stuck far from everyone still counts toward the cap and would starve the spawner.
    this.recycleT = (this.recycleT || 0) - dt;
    if (this.recycleT <= 0) {
      this.recycleT = 1.5;
      const alive = players.filter((p) => p.alive);
      if (alive.length) {
        for (const m of this.mobs.values()) {
          let near = 1e9;
          for (const p of alive) near = Math.min(near, Math.hypot(p.x - m.x, p.z - m.z));
          if (near < (m.roam ? 175 : 110)) continue;
          // Moved somewhere out of sight on the map, not next to you: running away really gets you away.
          const pt = this.pickSpawnPoint(players, true);
          if (pt) { m.x = m.hx = m.wx = pt[0]; m.z = m.hz = m.wz = pt[1]; m.roam = 1; m.wt = 0; }
        }
      }
    }
    if (this.seedDue) {
      // A fresh round: fill most of the map with roaming groups right away, so there is always something out there.
      this.seedDue = false;
      // Round 1 starts thin (about a third of the crowd) so a new player can find their feet.
      for (let i = 0; i < 90; i++) if (!this.spawnGroup(players, true, this.round === 0 ? 0.3 : 0.55)) break;
      return;
    }
    this.spawnCd -= dt;
    if (this.spawnCd > 0) return;
    this.spawnGroup(players, Math.random() < 0.8, this.ramp()); // four in five groups appear far off as wanderers, not round the player
  }

  // The crowd builds over the opening of a round instead of being all there at once:
  // round 1 grows from a third to full over 2.5 minutes, later rounds from about half over the first minute.
  ramp() {
    if (this.phase !== 'play' || this.duel) return 1;
    const t = this.rt || 0;
    return this.round === 0 ? Math.min(1, 0.22 + (t / 300) * 0.78) : Math.min(1, 0.55 + (t / 60) * 0.45);
  }

  // Per-type alive caps were tuned for a 16-mob field; they grow with the budget so a big field still fills up.
  capOf(B, n = 1) { return B.cap == null ? null : Math.min(B.hard ?? Infinity, Math.ceil(B.cap * this.mobBudget(n) / 16)); } // hard: never more, whatever the budget (the heavy hero-built bodies)

  // How many mobs the field holds at once (small swarmers and minions count for less, see cost).
  mobBudget(n) { return Math.min(this.duel ? 230 : 560, Math.round((48 + this.round * 8 + n * 10) * 1.6 * (this.duel ? 1 : 3) * (this.hard() ? 1.25 : 1) * (this.round === 0 && !this.duel ? 0.55 : 1)) + (this.roundLen === 0 ? Math.floor(this.rt / 60) : 0)); }

  // One mixed group near a player (or anywhere on the map when `wide`), then a lull. Returns false when the field is full.
  spawnGroup(players, wide = false, fill = 1) {
    const n = players.filter((p) => p.alive).length || 1;
    const target = Math.round(this.mobBudget(n) * fill);
    // Live budget: small swarmers and summoned minions count for less than a full mob.
    const live = {}, fam = {};
    let load = 0;
    for (const x of this.mobs.values()) { live[x.type] = (live[x.type] || 0) + 1; load += x.base.cost ?? 1; if (x.base.fam) fam[x.base.fam] = (fam[x.base.fam] || 0) + 1; }
    if (load >= target) { this.spawnCd = 1; return false; }
    const pt = this.pickSpawnPoint(players, wide);
    // A group appears, then a lull: a few seconds of walking before the next one. Lulls shrink as rounds go on
    // and when the field is thin, so you are never left with nothing to fight for long.
    const quiet = load < target * 0.5;
    this.spawnCd = Math.max(this.round === 0 ? 3 : 1.4, (quiet ? 2.5 : 5) - this.round * 0.5 - n * 0.5) * 0.7 * (0.8 + Math.random() * 0.5) * (this.duel ? 1 : 0.4);
    if (!pt) { this.spawnCd = 1; return true; }
    const r = this.round;
    if (!this.lineup) this.lineup = this.pickLineup(r);
    // Variety rules: no single type may crowd a round. Flyers are capped (hard to read and costly), every type has an
    // alive cap and a max share of the live mobs, and the Ghoul/Stalker family shares one cap. Past a cap, roll something else.
    let flyers = 0;
    for (const x of this.mobs.values()) if (x.base.fly) flyers++;
    const flyCap = flyers >= Math.min(32, (3 + this.round * 3) * (this.duel ? 1 : 2));
    const total = this.mobs.size + 1;
    const weights = {};
    // A lineup with only three or four kinds cannot stay under a third each, so the field would stall far below its budget: loosen the shares to fit.
    const lim = Math.max(0.34, 1.3 / Math.max(1, Object.keys(this.lineup).length));
    for (const [k, v] of Object.entries(this.lineup)) {
      const B = MOBS[k], c = live[k] || 0;
      if (B.fly && flyCap) continue;
      const cap = this.capOf(B, n);
      if (cap != null && c >= cap) continue;
      if (B.share != null && c >= 2 && (c + 1) > Math.max(B.share, lim * 0.7) * total) continue;
      if (c >= 3 && (c + 1) > lim * total) continue; // nothing exceeds about a third of the field
      if (B.fam && (fam[B.fam] || 0) >= 2 && (fam[B.fam] + 1) > lim * total) continue;
      weights[k] = v;
    }
    if (!Object.keys(weights).length) { this.spawnCd = 0.5; return true; }
    let roll = Math.random() * Object.values(weights).reduce((a, b) => a + b, 0);
    let type = Object.keys(weights)[0];
    for (const [k, v] of Object.entries(weights)) { roll -= v; if (roll <= 0) { type = k; break; } }
    // Small packs feel better than single spawns; swarmers come in a bunch, heavy types alone.
    const B = MOBS[type];
    const pack = B.fly ? 1 + (Math.random() < 0.4 ? 1 : 0)
      : B.pack ? B.pack[0] + Math.floor(Math.random() * (B.pack[1] - B.pack[0] + 1))
      : B.tier === 3 || B.radius >= 1 ? 1 : 1 + Math.floor(Math.random() * 3);
    const group = Math.min(target - load, this.duel ? 18 : 30, (8 + this.round + n * 2) * (this.duel ? 1 : 2));
    let placed = 0;
    const place = (type, B, count) => {
      for (let i = 0; i < count && load < target && placed < group; i++) {
        const cap = this.capOf(B, n);
        if (cap != null && (live[type] || 0) >= cap) break;
        const m = this.newMob(type, pt[0] + (Math.random() - 0.5) * 8, pt[1] + (Math.random() - 0.5) * 8);
        [m.x, m.z] = this.world.collide(m.x, m.z, m.base.radius); m.hx = m.wx = m.x; m.hz = m.wz = m.z;
        if (this.eliteOk(B) && Math.random() < ELITE.chance(this.round)) this.makeElite(m, 1 + Math.floor(Math.random() * 4));
        this.mobs.set(m.id, m);
        live[type] = (live[type] || 0) + 1; load += B.cost ?? 1; placed++;
      }
    };
    place(type, B, pack);
    // Pad the group out with one or two more packs of other kinds from this round's lineup.
    const keys = Object.keys(weights).filter((k) => k !== type && !MOBS[k].fly && (this.capOf(MOBS[k], n) == null || (live[k] || 0) < this.capOf(MOBS[k], n)));
    for (let extra = 0; extra < 3 && placed < group && keys.length; extra++) {
      const k = keys[Math.floor(Math.random() * keys.length)], Bk = MOBS[k];
      place(k, Bk, Bk.pack ? Bk.pack[0] : Bk.tier === 3 || Bk.radius >= 1 ? 1 : 1 + Math.floor(Math.random() * 2));
    }
    return placed > 0;
  }

  spawnBoss() {
    const bi = bossIdx(this.runSeed, this.round), def = BOSSES[bi];
    const n = Math.max(1, this.lastPlayers.length);
    // +2,000 health on top for every round cleared so far.
    const hp = (def.flatHp ? def.hp : def.hp * BOSS_HP * (1 + BOSS_GROW * this.round) + BOSS_HP_ROUND * this.round) * (1 + 0.65 * (n - 1)) * (this.hard() && !def.flatHp ? 1.4 : 1);
    const a = this.world.arena;
    this.boss = { idx: bi, def, x: a.x, z: a.z, hp, maxHp: hp, yaw: 0, cd: 3, anim: 0, mode: 'walk', modeT: 0, slow: 0, burn: 0, frozen: 0, atkIdx: 0, cx: 0, cz: 0, melee: 0 };
  }

  spawnDemon(players = this.lastPlayers) {
    const alive = players.filter((p) => p.alive);
    const p = alive[0] || { x: 0, z: 0, ry: 0 };
    let x = p.x - Math.sin(p.ry) * 30, z = p.z - Math.cos(p.ry) * 30;
    if (this.world && this.world.seed === this.seed) [x, z] = this.world.collide(x, z, 0.5);
    // atk: swing cooldown, hit: seconds until the swing lands (-1 = none), ghost: seconds she drifts through props.
    const maxHp = DEMON.hpMul * MOBS.grunt.hp * this.hpScale();
    this.demon = { x, z, yaw: 0, atk: 1.5, anim: 0, blink: 6, hit: -1, stuck: 0, ghost: 0, side: 1, hp: maxHp, maxHp };
    this.deathDone = true;
  }

  killMob(m, killer) {
    this.mobs.delete(m.id);
    const rise = this.canRise(m, killer);
    this.ev('d', m.id, killer, q10(m.x), q10(m.z), m.ti, rise ? 1 : 0);
    if (rise) this.raiseThrall(m, killer);
    if (m.base.bomb && !(m.fuse > 0)) this.primeBomb(m, 0.45); // shot before it reached anyone: it still goes off, a beat later
    if (m.mini) this.ev('mk', m.id, killer, q10(m.x), q10(m.z), (Math.random() * 1e6) | 0);
    if (m.el) {
      this.ev('ek', m.id, killer, q10(m.x), q10(m.z), m.el);
      if (m.el === 1) this.ev('bx', q10(m.x), q10(m.z), Math.round(ELITE.blast.r * 10), Math.round(ELITE.blast.d * 100), Math.round(ELITE.blast.dmg * this.dmgScale()));
      if (m.el === 4) for (let i = 0; i < 2; i++) {
        const c = this.newMob(m.type, m.x + (i ? 1.2 : -1.2), m.z + (i ? 0.4 : -0.4), undefined, undefined, m.wi);
        c.maxHp *= ELITE.splitHp; c.hp = c.maxHp; c.roam = 0; c.speed *= 1.1; c.base = m.base;
        [c.x, c.z] = this.world.collide(c.x, c.z, c.base.radius);
        this.mobs.set(c.id, c);
      }
    }
  }

  // Necromancer mutator: the fallen get back up and fight for whoever killed them, then fall for good.
  canRise(m, killer) {
    const on = (this.mu & NECRO) || (this.raiseBy && this.raiseBy[killer] > this.time); // the old mutator bit, or the killer's Raise the Dead is running
    if (!on || this.duel) return false;
    const B = m.base;
    if (B.fly || B.bomb || B.summoned || B.swarm) return false;
    let n = 0; for (const x of this.npcs.values()) if (x.mt != null) n++;
    return n < THRALL_MAX;
  }
  raiseThrall(m, killer) {
    const owner = this.lastPlayers.some((q) => q.id === killer) ? killer : (this.lastPlayers[0] || {}).id || '';
    const n = this.newNpc('thrall', owner, m.x, m.z);
    n.mt = m.ti; n.wi = m.wi | 0;
    n.maxHp = n.hp = Math.max(80, m.maxHp * 0.7);
    n.dmg = m.maxHp * 0.3; // a few blows fell one of its old friends, whatever the round
    n.spd = Math.min(5.2, Math.max(3.6, (m.speed || 4) * 1.1));
    n.wake = THRALL_RISE; n.life = THRALL_LIFE + THRALL_RISE; n.yaw = m.yaw || 0;
    this.npcs.set(n.id, n);
    this.ev('ns', n.id, 'thrall');
  }

  // ---------- special abilities ----------
  // A bomber's blast: clients show the warning ring and check their own distance when it lands; NPCs are hurt here.
  primeBomb(m, fuse) {
    const B = m.base.bomb, f = fuse ?? B.fuse;
    if (fuse == null) { m.fuse = f; m.anim = 1; }
    const dmg = Math.round(B.dmg * this.dmgScale() * (m.mini ? MINI.dmgMul : 1));
    this.ev('bx', q10(m.x), q10(m.z), q10(B.r), Math.round(f * 100), dmg);
    this.blasts.push({ t: f, x: m.x, z: m.z, r: B.r, dmg });
  }

  updateBlasts(dt) {
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      b.t -= dt;
      if (b.t > 0) continue;
      this.blasts.splice(i, 1);
      for (const n of [...this.npcs.values()]) {
        if (Math.hypot(n.x - b.x, n.z - b.z) < b.r) this.hitTarget({ kind: 'n', npc: n }, b.dmg, 'bomb');
      }
    }
  }

  // Poison and fire: a few small ticks of damage on a player after being struck. Re-applying refreshes it.
  addDot(pid, dmg, n, every, kind) {
    const old = this.dots.find((d) => d.pid === pid && d.kind === kind);
    if (old) { old.left = n; old.dmg = Math.max(old.dmg, dmg); return; }
    this.dots.push({ pid, dmg, left: n, every, t: every, kind });
  }

  updateDots(dt, players) {
    for (let i = this.dots.length - 1; i >= 0; i--) {
      const d = this.dots[i];
      const p = players.find((q) => q.id === d.pid);
      if (!p || !p.alive) { this.dots.splice(i, 1); continue; }
      d.t -= dt;
      if (d.t > 0) continue;
      d.t += d.every; d.left--;
      this.ev('a', d.pid, Math.max(1, Math.round(d.dmg)), d.kind);
      if (d.left <= 0) this.dots.splice(i, 1);
    }
  }

  // Alive Bonelings raised by one Necromancer (or by anyone, with id 0).
  minions(owner) {
    let c = 0;
    for (const x of this.mobs.values()) if (x.type === 'boneling' && (!owner || x.owner === owner)) c++;
    return c;
  }

  raise(m) {
    for (let k = 0; k < 2; k++) {
      const a = m.yaw + (k ? 1 : -1) * 1.1 + (Math.random() - 0.5) * 0.4;
      const s = this.newMob('boneling', m.x + Math.sin(a) * 2.2, m.z + Math.cos(a) * 2.2);
      s.owner = m.id; s.roam = 0;
      this.mobs.set(s.id, s);
      this.ev('sm', q10(s.x), q10(s.z));
    }
  }

  // The host's answer to "go to space?" after the final boss.
  spaceAnswer(yes) {
    if (this.phase !== 'spaceq') return;
    if (yes) { this.phase = 'sproam'; this.tl = 60; this.ev('msg', 'The ship leaves in 60 seconds. Spend your PC while you can'); } else this.phase = 'win'; // yes: a minute of free roam on this map first, for crates and the shop
  }

  killBoss(killer) {
    const b = this.boss;
    this.ev('bd', killer, q10(b.x), q10(b.z));
    this.lastBossName = b.def.name;
    this.boss = null;
    for (const m of this.mobs.values()) this.ev('d', m.id, '', q10(m.x), q10(m.z), m.ti);
    this.mobs.clear();
    if (this.round === CONFIG.rounds - 1 && !this.duel) {
      // Thermes is down: offer the optional trip to the space map before the run ends.
      this.phase = 'spaceq';
      this.tl = 60;
      this.ev('msg', this.lastBossName + ' has fallen');
    } else if (this.round >= CONFIG.rounds - 1) {
      this.phase = 'win';
      this.ev('msg', this.lastBossName + ' has fallen');
    } else {
      this.phase = 'bless';
      this.tl = 30;
    }
  }

  // ---------- main tick ----------
  update(dt, peers) {
    this.time += dt;
    const players = this.readPlayers(peers);
    this.lastPlayers = players;
    this.processInputs(peers, players);
    // Bullet Time: while any player holds aim, everything the host simulates (enemies, bosses, their shots, the
    // round clock) runs in slow motion. The players themselves run on their own clocks at full speed.
    if ((this.mu & BULLET_TIME) && !this.duel) {
      const want = (this.phase === 'play' || this.phase === 'boss') && players.some((q) => q.alive && !q.out && q.raw && q.raw.bt) ? BT_SLOW : 1;
      const k = this.btK ?? 1;
      this.btK = k + (want - k) * Math.min(1, dt * (want < k ? BT_IN : BT_OUT));
      if (Math.abs(this.btK - want) < 0.005) this.btK = want;
      dt *= this.btK;
    } else this.btK = 1;
    if (this.phase === 'lobby' || this.phase === 'over' || this.phase === 'win') { this.pruneEvents(); return; }
    if (this.duel) { this.updateDuel(dt, players); if (this.phase === 'duel') { this.updateDots(dt, players); this.updateWells(dt, players); this.updateNpcs(dt, players); } else this.wells.length = 0; this.pruneEvents(); return; }

    if (this.pendingNpcRelocate && this.world && this.world.seed === this.seed) {
      this.pendingNpcRelocate = false;
      for (const n of this.npcs.values()) { n.x = this.world.spawn.x + (Math.random() - 0.5) * 6; n.z = this.world.spawn.z + (Math.random() - 0.5) * 6; }
    }
    const worldReady = this.world && this.world.seed === this.seed;

    // Phase clock.
    if (this.phase === 'play') {
      this.rt += dt;
      if (this.roundLen > 0) this.tl = Math.max(0, this.tl - dt);
      // After the 10 minute mark Death comes for the party, every round. The altar is the way out.
      if (this.space && this.tl <= 0) { this.startBoss(); this.ev('msg', 'The Visitor has landed'); }
      else if (!this.space && this.roundLen > 0 && !this.deathDone && !this.demon && this.rt >= DEMON.arrive) { // Endless rounds: Death never comes
        this.spawnDemon();
        this.ev('msg', 'Time is up. Death has come for you');
        this.ev('demon');
      }
    } else if (this.phase === 'spaceq') {
      // waits for the host's answer
    } else if (this.phase === 'sproam') {
      this.tl -= dt;
      if (this.tl <= 0) { this.round = CONFIG.rounds; this.beginRound(); this.ev('msg', 'The signal leads to a crash site in space'); }
    } else if (this.phase === 'bless') {
      this.tl -= dt;
      if (this.tl <= 0) { this.round++; this.beginRound(); }
    }

    if (players.length && players.every((p) => p.out) && !['over', 'win', 'lobby'].includes(this.phase)) {
      this.phase = 'over';
      this.ev('msg', 'The run is over');
    }

    if (worldReady) {
      this.spawnTick(dt, players);
      this.updateMobs(dt, players);
      this.updateDots(dt, players);
      this.updateBlasts(dt);
      this.updateWells(dt, players);
      this.updateBoss(dt, players);
      this.updateDemon(dt, players);
      this.updateNpcs(dt, players);
    }
    this.pruneEvents();
  }

  startBoss() {
    this.phase = 'boss';
    this.mobs.clear();
    this.demon = null; // Death stays out of the boss arena
    this.spawnBoss();
    const a = this.world.arena;
    this.ev('tp', q10(a.x), q10(a.z));
    this.ev('msg', this.boss.def.name);
  }

  pruneEvents() {
    const cut = this.time - EVENT_TTL;
    while (this.events.length && this.events[0].t < cut) this.events.shift();
    if (this.events.length > 40) this.events.splice(0, this.events.length - 40);
  }

  targetsFor(x, z, players) {
    let best = null, bd = 1e9;
    for (const p of players) {
      if (!p.alive || p.hid) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = { kind: 'p', id: p.id, x: p.x, z: p.z, y: p.y }; }
    }
    for (const n of this.npcs.values()) {
      const d = Math.hypot(n.x - x, n.z - z) + 3;
      if (d < bd) { bd = d; best = { kind: 'n', id: n.id, x: n.x, z: n.z, y: this.world.heightAt(n.x, n.z), npc: n }; }
    }
    return best ? { ...best, d: bd } : null;
  }

  hitTarget(t, dmg, srcId) {
    if (t.kind === 'p') this.ev('a', t.id, Math.round(dmg), srcId);
    else if (t.npc) {
      t.npc.hp -= dmg;
      if (t.npc.hp <= 0) { this.npcs.delete(t.npc.id); this.ev('nd', t.npc.id, q10(t.npc.x), q10(t.npc.z)); }
    }
  }

  updateMobs(dt, players) {
    const w = this.world;
    const list = [...this.mobs.values()];
    this.hunting = 0; for (const m of list) if (!m.roam && !m.owner) this.hunting++; // how many are after the players right now (see huntCap)
    const ds = this.dmgScale();
    for (const m of list) {
      const base0 = m.base;
      if (m.burn > 0) {
        m.burn -= dt;
        m.hp -= 9 * dt;
        if (m.hp <= 0) { this.killMob(m, m.lastHit || ''); continue; }
      }
      m.anim = Math.max(0, m.anim - dt * 3);
      if (m.base.regen && m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * m.base.regen * dt);
      m.atk -= dt;
      if (base0.slam) m.cd -= dt;
      m.slow = Math.max(0, m.slow - dt);
      m.frozen = Math.max(0, m.frozen - dt);
      if (m.lvy) {
        // Hurled into the air (Pillar Burst): rises, falls, and lands stunned.
        m.fy = Math.max(0, (m.fy || 0) + m.lvy * dt); m.lvy -= 26 * (this.mu & LOWGRAV ? GRAV_K : 1) * dt;
        if (m.fy <= 0 && m.lvy < 0) { m.fy = 0; m.lvy = 0; m.stag = Math.max(m.stag, 0.9); m.atk = Math.max(m.atk, 1); }
        else m.frozen = Math.max(m.frozen, 0.1);
      }
      m.stag = Math.max(0, m.stag - dt);
      // Knockback decays.
      m.x += m.kx * dt; m.z += m.kz * dt;
      { const kd = Math.max(0, 1 - (m.lvy ? 0.25 : 5) * dt); m.kx *= kd; m.kz *= kd; } // thrown into the air it keeps flying the way it was hit (Airshot); on the ground it skids to a stop
      const t = this.targetsFor(m.x, m.z, players);
      if (m.roam) {
        // Nutty 2026-11-12 15:11: no more brutal crowds. Enemies notice you from closer than before, and only so many hunt you
        // at once (huntCap): the rest keep wandering until you walk into them or hurt them.
        const notice = base0.fly ? 34 : base0.ranged ? 28 : 20;
        if (t && m.hp < m.maxHp) this.wake(m);
        else if (t && t.d < notice && (this.hunting < this.huntCap(players) || t.d < 7)) { this.wake(m, false); this.hunting++; }
        else { this.wander(m, dt, t); continue; }
      }
      if (!t) continue;
      if (!m.mini && !m.owner && t.d > 70 && m.hp >= m.maxHp) { m.roam = 1; m.hx = m.wx = m.x; m.hz = m.wz = m.z; m.wt = 0; continue; } // lost you: back to wandering where it stands
      const dx = t.x - m.x, dz = t.z - m.z;
      const d = Math.hypot(dx, dz) || 1;
      const want = Math.atan2(dx, dz);
      if (m.base.turn) { const dy = Math.atan2(Math.sin(want - m.yaw), Math.cos(want - m.yaw)), mt = m.base.turn * dt; m.yaw += Math.max(-mt, Math.min(mt, dy)); } else m.yaw = want;
      let sp = m.frozen > 0 || m.stag > 0 ? 0 : m.speed * (m.slow > 0 ? 0.45 : 1);
      const base = m.base;
      let mx = 0, mz = 0;
      if (base.fly && !base.ranged) {
        // Swooper: circle overhead, dive at the target, strike, then climb away.
        const ground = w.heightAt(m.x, m.z), tgtG = t.y || w.heightAt(t.x, t.z);
        let want = 6 + Math.sin(this.time * 1.3 + m.id) * 0.8;
        m.modeT -= dt;
        if (m.mode === 'orbit') {
          if (d > 14) { mx = dx / d; mz = dz / d; }
          else { mx = (-dz / d) * m.strafe * 0.9 - (d < 8 ? (dx / d) * 0.6 : 0); mz = (dx / d) * m.strafe * 0.9 - (d < 8 ? (dz / d) * 0.6 : 0); }
          if (m.atk <= 0 && m.frozen <= 0 && d < 18) { m.mode = 'dive'; m.modeT = 2.4; }
        } else if (m.mode === 'dive') {
          mx = dx / d; mz = dz / d; sp *= 1.7;
          want = Math.max(0.6, tgtG - ground + 1.0);
          if (m.frozen <= 0 && (d < base.range + 0.4 || m.modeT <= 0)) {
            if (d < base.range + 1.0) { m.anim = 1; this.hitTarget(t, base.dmg * ds * (m.mini ? MINI.dmgMul : 1), m.id); }
            m.mode = 'retreat'; m.modeT = 1.3; m.atk = base.rate + 0.8;
          }
        } else {
          mx = (-dx / d) * 0.5 + (-dz / d) * m.strafe * 0.5; mz = (-dz / d) * 0.5 + (dx / d) * m.strafe * 0.5; want = 7;
          if (m.modeT <= 0) m.mode = 'orbit';
        }
        const dfy = want - m.fy;
        m.fy = Math.max(0, m.fy + Math.sign(dfy) * Math.min(Math.abs(dfy), (m.mode === 'dive' ? 14 : 6) * dt));
      } else if (base.bomb) {
        // Bomber: rushes in, stops next to its target and blows up after a short fuse.
        if (m.fuse > 0) {
          sp = 0; m.fuse -= dt;
          if (m.fuse <= 0) { this.mobs.delete(m.id); this.ev('d', m.id, '', q10(m.x), q10(m.z), m.ti); continue; }
        } else if (d > 2.6) { mx = dx / d; mz = dz / d; }
        else if (m.frozen <= 0) this.primeBomb(m);
      } else if (base.leap) {
        // Pouncer: closes in, crouches, then springs in an arc and lands on its target.
        const L = base.leap;
        if (m.mode === 'crouch') {
          sp = 0;
          if (m.frozen <= 0) m.modeT -= dt;
          if (m.modeT <= 0) {
            m.mode = 'leap'; m.modeT = 0; m.lx0 = m.x; m.lz0 = m.z;
            const reach = Math.min(d, L.max * 1.1);
            m.lx1 = m.x + (dx / d) * reach; m.lz1 = m.z + (dz / d) * reach;
          }
        } else if (m.mode === 'leap') {
          const lg = this.mu & LOWGRAV ? 1 : 0;
          sp = 0; m.modeT += dt / (L.t * (lg ? 1.7 : 1));
          const u = Math.min(1, m.modeT);
          m.x = m.lx0 + (m.lx1 - m.lx0) * u; m.z = m.lz0 + (m.lz1 - m.lz0) * u;
          m.fy = 4 * L.h * (lg ? 2.2 : 1) * u * (1 - u);
          if (u >= 1) {
            m.fy = 0; m.mode = 'orbit'; m.cd = L.cd * (0.8 + Math.random() * 0.4); m.anim = 1;
            if (Math.hypot(t.x - m.x, t.z - m.z) < base.range + 1.1 && Math.abs((t.y || 0) - w.heightAt(m.x, m.z)) < 2.2) this.hitTarget(t, base.dmg * ds * (m.mini ? MINI.dmgMul : 1), m.id);
          }
        } else {
          m.cd -= dt;
          if (m.cd <= 0 && m.frozen <= 0 && d > L.min && d < L.max) { m.mode = 'crouch'; m.modeT = L.wind; }
          else if (d > base.range + 0.5) { mx = dx / d; mz = dz / d; }
          else if (m.atk <= 0 && m.frozen <= 0) { m.atk = base.rate; m.anim = 1; this.hitTarget(t, base.dmg * ds * (m.mini ? MINI.dmgMul : 1), m.id); }
        }
      } else if (base.summon) {
        // Necromancer: keeps its distance and raises two Bonelings every few seconds.
        const S = base.summon;
        if (m.mode === 'cast') {
          sp = 0; m.modeT -= dt;
          if (m.modeT <= 0) { m.mode = 'orbit'; m.cd = S.cd * (0.85 + Math.random() * 0.3); this.raise(m, S); }
        } else {
          if (d > S.hi) { mx = dx / d; mz = dz / d; }
          else if (d < S.lo) { mx = -dx / d; mz = -dz / d; }
          else { mx = (-dz / d) * m.strafe * 0.5; mz = (dx / d) * m.strafe * 0.5; }
          m.cd -= dt;
          if (m.cd <= 0 && m.frozen <= 0 && d < 40 && this.minions(m.id) <= S.cap - 2 && this.minions(0) < 10) { m.mode = 'cast'; m.modeT = 1.0; m.anim = 1; }
        }
      } else if (base.ranged) {
        if (base.fly) { const dfy = 5.5 + Math.sin(this.time * 1.1 + m.id) * 0.7 - m.fy; m.fy = Math.max(0, m.fy + Math.sign(dfy) * Math.min(Math.abs(dfy), 5 * dt)); }
        const hold = base.hold || [9, 16];
        if (d > hold[1]) { mx = dx / d; mz = dz / d; }
        else if (d < hold[0]) { mx = -dx / d; mz = -dz / d; }
        else { mx = (-dz / d) * m.strafe * 0.6; mz = (dx / d) * m.strafe * 0.6; }
        if (d < base.range && m.atk <= 0 && m.frozen <= 0) {
          m.atk = base.rate * (0.8 + Math.random() * 0.4);
          m.anim = 1;
          const y0 = w.heightAt(m.x, m.z) + (base.fly ? m.fy + 0.6 : 1.5);
          const ty = (t.y || w.heightAt(t.x, t.z)) + 1.2;
          const sp2 = base.pspd || 17;
          const L = Math.hypot(dx, ty - y0, dz) || 1;
          if (t.kind === 'p') this.ev('p', q10(m.x), q10(y0), q10(m.z), q10(dx / L * sp2), q10((ty - y0) / L * sp2), q10(dz / L * sp2), Math.round(base.dmg * ds * (m.mini ? MINI.dmgMul : 1)), base.pstyle || 0);
          else this.hitTarget(t, base.dmg * ds * (m.mini ? MINI.dmgMul : 1), m.id);
        }
      } else if (base.slam && m.mode === 'slam') {
        sp = 0; m.modeT -= dt;
        if (m.modeT <= 0) m.mode = 'orbit';
      } else if (d > base.range + 0.5) {
        mx = dx / d; mz = dz / d;
        if (base.weave && d > 4) { const wv = Math.sin(this.time * 5 + m.id * 1.7) * 0.7; mx += (-dz / d) * wv; mz += (dx / d) * wv; }
      } else if (m.atk <= 0 && m.frozen <= 0) {
        m.atk = base.rate;
        m.anim = 1;
        if (base.slam && m.cd <= 0) {
          // Ogre: raises its fists, then a ground smash lands where the target stood (telegraphed, like boss slams).
          m.cd = base.slam.cd; m.mode = 'slam'; m.modeT = base.slam.d;
          this.ev('s', q10(t.x), q10(t.z), q10(base.slam.r), Math.round(base.slam.d * 100), Math.round(base.slam.dmg * ds * (m.mini ? MINI.dmgMul : 1)));
        } else {
          this.hitTarget(t, base.dmg * ds * (m.mini ? MINI.dmgMul : 1), m.id);
          const dot = base.burnHit || base.poisonHit;
          if (dot && t.kind === 'p') this.addDot(t.id, base.dmg * ds * dot.k, dot.n, dot.every, base.burnHit ? 'burn' : 'poison');
        }
      }
      m.x += mx * sp * dt;
      m.z += mz * sp * dt;
    }
    // Separation so packs don't stack.
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!this.mobs.has(a.id)) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const md = a.base.radius + b.base.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < md * md && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (md - d) * 0.5;
          a.x -= (dx / d) * push; a.z -= (dz / d) * push;
          b.x += (dx / d) * push; b.z += (dz / d) * push;
        }
      }
      [a.x, a.z] = w.collide(a.x, a.z, a.base.radius);
    }
  }

  // Gravity Gun wells. While one is open every mob in range is dragged to its centre (arriving in a tight clump just as the
  // time runs out; big ones resist, the boss barely moves and flyers are brought down); when it collapses the blast
  // hurts every mob and the boss in range. Players are never touched here except in the Duel Arena, where the other
  // fighter takes a lethal hit (they pull themselves in on their own client, see game.gravWell).
  updateWells(dt, players) {
    const w = this.world;
    for (let i = this.wells.length - 1; i >= 0; i--) {
      const G = this.wells[i];
      G.t += dt;
      const left = GRAV.dur - G.t;
      if (left > 0) {
        for (const m of this.mobs.values()) {
          const dx = G.x - m.x, dz = G.z - m.z, d = Math.hypot(dx, dz) || 0.01;
          if (d > GRAV.pull) continue;
          const big = m.base.radius >= 1 || m.mini;
          const stop = 0.6 + (m.id % 5) * 0.3 + m.base.radius * 0.6;
          if (d > stop) {
            const sp = Math.min(30, (d - stop) / Math.max(0.12, left - 0.15) * 1.35) * (big ? 0.6 : 1);
            const mv = Math.min(d - stop, sp * dt);
            m.x += (dx / d) * mv; m.z += (dz / d) * mv;
          }
          m.stag = Math.max(m.stag, 0.15); m.kx = m.kz = 0; // held in its grip: no walking, attacking or shoving
          if (m.mode === 'leap' || m.mode === 'crouch') { m.mode = 'orbit'; m.modeT = 0; }
          if (m.base.fly) m.fy += (G.y - w.heightAt(m.x, m.z) + 1.5 - m.fy) * Math.min(1, 3 * dt);
        }
        const b = this.boss;
        if (b && G.bossMoved < GRAV.boss) {
          const dx = G.x - b.x, dz = G.z - b.z, d = Math.hypot(dx, dz) || 0.01;
          if (d < GRAV.pull && d > 4) {
            const mv = Math.min(GRAV.boss - G.bossMoved, 3 * dt);
            b.x += (dx / d) * mv; b.z += (dz / d) * mv; G.bossMoved += mv;
            [b.x, b.z] = w.collide(b.x, b.z, 2.5);
          }
        }
        continue;
      }
      this.wells.splice(i, 1);
      // Collapse.
      const dmg = GRAV.dmg * G.k;
      for (const m of [...this.mobs.values()]) {
        const dx = m.x - G.x, dz = m.z - G.z, d = Math.hypot(dx, dz) || 0.01;
        if (d - m.base.radius > GRAV.blast) continue;
        this.wake(m, false);
        m.hp -= dmg; m.lastHit = G.from;
        const big = m.base.radius >= 1 || m.mini;
        m.kx += (dx / d) * 10 * (big ? 0.35 : 1); m.kz += (dz / d) * 10 * (big ? 0.35 : 1);
        m.stag = Math.max(m.stag, 0.5);
        if (m.hp <= 0) this.killMob(m, G.from);
      }
      const b = this.boss;
      if (b && Math.hypot(b.x - G.x, b.z - G.z) - 3 <= GRAV.blast) {
        b.hp -= GRAV.bossDmg * G.k; b.lastHit = G.from;
        if (b.hp <= 0) this.killBoss(G.from);
      }
      if (this.duel) {
        for (const p of players) {
          if (p.id === G.from || !p.alive || Math.hypot(p.x - G.x, p.z - G.z) > GRAV.blast + 1 || Math.abs(p.y - G.y) > 9) continue;
          this.ev('a', p.id, 99999, 'gv'); // lethal, whatever the duel hit scaling (DUEL.pvp) would make of a normal hit
        }
      }
    }
  }

  // The Visitor never walks: it drifts like a ghost, blinks across the map or onto its target, and its Alien Blaster never stops.
  // Plasma bolts burst where they land; now and then it charges one big beam that follows its target until the blaster overheats.
  updateVisitor(b, dt, players, t, dx, dz, d, yb, enr, bd, ds) {
    const w = this.world, reach = b.def.reach || 8, A = w.arena;
    const blink = (x, z) => {
      const ox = b.x, oz = b.z, ex = x - A.x, ez = z - A.z, L = Math.hypot(ex, ez);
      if (L > 75) { x = A.x + ex / L * 75; z = A.z + ez / L * 75; }
      [b.x, b.z] = w.collide(x, z, b.def.rad || 2.2);
      this.ev('vt', q10(ox), q10(oz), q10(b.x), q10(b.z));
    };
    b.vf = (b.vf ?? 1.5) - dt; b.vs = (b.vs || 0) - dt;
    b.vnear = d < reach + 2 ? (b.vnear || 0) + dt : 0;
    if (b.mode === 'vcharge') {
      b.yaw = Math.atan2(dx, dz);
      if (b.modeT <= 0) { b.mode = 'vbeam'; b.modeT = enr ? 6 : 5; b.lt = 0; b.ly = b.yaw; b.ld = Math.max(12, Math.min(70, d)); }
      return;
    }
    if (b.mode === 'vbeam') {
      // The beam turns after its target, but slowly: keep running sideways and it trails behind you.
      const want = Math.atan2(dx, dz), da = Math.atan2(Math.sin(want - b.ly), Math.cos(want - b.ly)), mx = (enr ? 0.55 : 0.42) * dt;
      b.ly += Math.max(-mx, Math.min(mx, da)); b.yaw = b.ly;
      { const wd = Math.max(12, Math.min(70, d)), md = 9 * dt; b.ld += Math.max(-md, Math.min(md, wd - b.ld)); } // the aim point slides in and out after its target too
      b.lt -= dt;
      if (b.lt <= 0) {
        b.lt = THERMES.laserTick;
        const sx = Math.sin(b.ly), cz = Math.cos(b.ly);
        for (const p of players) {
          if (!p.alive) continue;
          const rx = p.x - b.x, rz = p.z - b.z, along = rx * sx + rz * cz;
          // One straight beam from the blaster down to the ground: it burns whoever stands in its last stretch or where it lands.
          if (along < b.ld * 0.55 || along > b.ld + 3.5) continue;
          if (Math.abs(rx * cz - rz * sx) < 2.6 && (p.y || 0) - w.heightAt(p.x, p.z) < 6) this.ev('a', p.id, Math.round((THERMES.laserDmg + 0.4 * BOSS_DMG_ROUND * this.round + 0.25 * (b.def.dmgAdd || 0)) * ds), 'B');
        }
      }
      if (b.modeT <= 0) { b.mode = 'overheat'; b.modeT = 3.2; b.ly = null; this.ev('bw', 'The blaster overheated! Hit The Visitor now'); }
      return;
    }
    if (b.mode === 'overheat') { if (b.modeT <= 0) { b.mode = 'walk'; b.vf = 0.8; } return; }
    b.yaw = Math.atan2(dx, dz);
    if (b.mode === 'hold') { if (b.modeT <= 0) b.mode = 'walk'; return; }
    // Drift: it keeps a ring around its target and slides sideways round it.
    if (b.vs <= 0) { b.vs = 2 + Math.random() * 3; b.vdir = Math.random() < 0.5 ? 1 : -1; }
    const sp = b.def.speed * (b.slow > 0 ? 0.7 : 1) * (enr ? 1.25 : 1), ux = dx / d, uz = dz / d, rad = d > 24 ? 1 : d < 13 ? -0.8 : 0;
    b.x += (ux * rad * 0.8 - uz * (b.vdir || 1) * 0.7) * sp * dt; b.z += (uz * rad * 0.8 + ux * (b.vdir || 1) * 0.7) * sp * dt;
    // The blaster never rests: one bursting plasma bolt after another.
    if (b.vf <= 0) {
      b.vf = enr ? 0.42 : 0.6; b.anim = 1;
      const ox = b.x + Math.sin(b.yaw) * 3.4, oz = b.z + Math.cos(b.yaw) * 3.4, oy = yb + 7.4;
      const tx = t.x + (Math.random() - 0.5) * 2.2, tz = t.z + (Math.random() - 0.5) * 2.2;
      const ex = tx - ox, ez = tz - oz, ey = ((t.y ?? w.heightAt(t.x, t.z)) + 0.9) - oy, L = Math.hypot(ex, ey, ez) || 1;
      this.ev('p', q10(ox), q10(oy), q10(oz), q10(ex / L * 30), q10(ey / L * 30), q10(ez / L * 30), Math.round(16 * ds + 2 * this.round), 4);
    }
    // Up close: it claws whoever is in reach, and blasts them off if they stay.
    if (d <= reach && b.melee <= 0) { b.melee = 1.2; this.hitTarget(t, bd(24), 'B'); }
    if (b.vnear > 2.2) { b.vnear = 0; this.ev('s', q10(b.x), q10(b.z), 95, 80, bd(30)); }
    if (d > 80) { const a = Math.random() * 6.28; blink(t.x + Math.cos(a) * 12, t.z + Math.sin(a) * 12); }
    b.cd -= dt;
    if (b.cd > 0) return;
    const atks = b.def.attacks, atk = atks[b.atkIdx++ % atks.length];
    b.cd = (enr ? 2.4 : 3.4) - this.round * 0.1;
    if (atk === 'tpnear') {
      // Blink onto its target, then a close-range blast around itself.
      const a = Math.random() * 6.28; blink(t.x + Math.cos(a) * 6.5, t.z + Math.sin(a) * 6.5);
      b.mode = 'hold'; b.modeT = 1.0; b.melee = 1.0; b.vnear = 0; b.vf = 1.4;
      this.ev('s', q10(b.x), q10(b.z), 100, 95, bd(30));
    } else if (atk === 'tpfar') {
      const a = Math.random() * 6.28, r = 40 + Math.random() * 16; blink(t.x + Math.cos(a) * r, t.z + Math.sin(a) * r);
      b.vf = 0.5; b.cd = Math.min(b.cd, 1.6);
    } else if (atk === 'vbeam') {
      b.mode = 'vcharge'; b.modeT = 1.8; b.ly = null;
      this.ev('bw', 'The Visitor is charging its blaster');
    } else if (atk === 'ring') {
      const n = enr ? 24 : 16, off = Math.random() * 6;
      for (let i = 0; i < n; i++) { const a = off + (i / n) * Math.PI * 2; this.ev('p', q10(b.x), q10(yb + 2.5), q10(b.z), q10(Math.sin(a) * 13), 0, q10(Math.cos(a) * 13), bd(13), 1); }
    } else if (atk === 'summon') {
      const ring = b.def.rad * 2.2 + 6, light = Object.keys(this.lineup || {}).filter((k) => MOBS[k].tier < 3);
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2;
        const m = this.newMob(light.length ? light[Math.floor(Math.random() * light.length)] : 'grunt', b.x + Math.cos(a) * ring, b.z + Math.sin(a) * ring);
        this.mobs.set(m.id, m); this.ev('sm', q10(m.x), q10(m.z));
      }
    }
  }

  updateBoss(dt, players) {
    const b = this.boss;
    if (!b) return;
    const w = this.world;
    const ds = this.bossDmgScale();
    // Every attack hits +10 harder per round (Thermes: +100 on top).
    const bd = (x) => Math.round(x * ds + BOSS_DMG_ROUND * this.round + (b.def.dmgAdd || 0));
    b.anim = Math.max(0, b.anim - dt * 1.5);
    b.slow = Math.max(0, b.slow - dt);
    if (b.burn > 0) { b.burn -= dt; b.hp -= 9 * dt; if (b.hp <= 0) return this.killBoss(b.lastHit || ''); }
    if (b.frozen > 0) { b.frozen -= dt; return; } // locked in ice: the boss stands where it is
    const t = this.targetsFor(b.x, b.z, players);
    if (!t) return;
    const dx = t.x - b.x, dz = t.z - b.z;
    const d = Math.hypot(dx, dz) || 1;
    const speed = b.def.speed * (b.slow > 0 ? 0.7 : 1) * (b.hp < b.maxHp * 0.4 ? 1.25 : 1);
    b.modeT -= dt;
    b.melee -= dt;
    const yb = w.heightAt(b.x, b.z);
    const enr = b.hp < b.maxHp * 0.4, reach = b.def.reach || 4.5;
    const Q = b.qp || { range: THERMES.quakeRange, speed: THERMES.quakeSpeed, dmg: THERMES.quakeDmg, knock: THERMES.quakeKnock, n: enr ? 2 : 1 };
    if (b.ak) { b.akT -= dt; if (b.akT <= 0) b.ak = 0; }
    if (b.def.visitor) { this.updateVisitor(b, dt, players, t, dx, dz, d, yb, enr, bd, ds); [b.x, b.z] = w.collide(b.x, b.z, b.def.rad || 2.2); return; }
    if (b.mode === 'laser-wind') {
      // Thermes gathers light in his eyes, then sweeps twin beams across the arena.
      b.yaw = b.lz;
      if (b.modeT <= 0) { b.mode = 'laser'; b.modeT = b.lsd; b.lt = 0; b.lstart = b.lsd; }
    } else if (b.mode === 'laser') {
      const k = 1 - Math.max(0, b.modeT) / b.lstart;
      const yaw = b.lz + b.lsw * k;
      b.yaw = yaw; b.ly = yaw;
      b.lt -= dt;
      if (b.lt <= 0) {
        b.lt = THERMES.laserTick;
        const sx = Math.sin(yaw), cz = Math.cos(yaw);
        for (const p of players) {
          if (!p.alive) continue;
          const rx = p.x - b.x, rz = p.z - b.z, along = rx * sx + rz * cz;
          if (along < 2 || along > THERMES.laserRange) continue;
          const side = Math.abs(rx * cz - rz * sx);
          if (side < THERMES.laserWidth && (p.y || 0) - w.heightAt(p.x, p.z) < 4.5) this.ev('a', p.id, Math.round((THERMES.laserDmg + 0.4 * BOSS_DMG_ROUND * this.round + 0.25 * (b.def.dmgAdd || 0)) * ds), 'B'); // a burn per tick, not a full boss hit
        }
      }
      if (b.modeT <= 0) { b.mode = 'walk'; b.ly = null; }
    } else if (b.mode === 'quake-wind') {
      if (b.modeT <= 0) {
        // The fists come down: one shockwave ring races out over the ground (two when he is enraged), jump it.
        b.mode = 'quake'; b.modeT = Q.range / Q.speed + (Q.n > 1 ? 0.8 : 0.1); b.qr = 0; b.qr2 = Q.n > 1 ? -Q.speed * 0.7 : null; b.hitSet = new Set();
        this.ev('qk', q10(b.x), q10(b.z), b.qr2 == null ? 1 : 2, Math.round(Q.range), Math.round(Q.speed), b.qp ? 1 : 0);
      }
    } else if (b.mode === 'quake') {
      const prev = b.qr; b.qr += Q.speed * dt;
      const prev2 = b.qr2; if (b.qr2 != null) b.qr2 += Q.speed * dt;
      for (const p of players) {
        if (!p.alive) continue;
        const d = Math.hypot(p.x - b.x, p.z - b.z);
        const first = d > prev && d <= b.qr && d <= Q.range, second = prev2 != null && prev2 > 0 && d > prev2 && d <= b.qr2 && d <= Q.range;
        const crossed = (first && !b.hitSet.has(p.id + ':1')) || (second && !b.hitSet.has(p.id + ':2'));
        if (!crossed) continue;
        b.hitSet.add(p.id + (first ? ':1' : ':2')); // each ring can catch you once
        if ((p.y || 0) - w.heightAt(p.x, p.z) > THERMES.quakeJump) continue;
        const kx = (p.x - b.x) / (d || 1), kz = (p.z - b.z) / (d || 1);
        this.ev('a', p.id, bd(Q.dmg), 'B', 0, 0, 0, q10(kx * Q.knock), q10(kz * Q.knock));
      }
      if (b.modeT <= 0) { b.mode = 'walk'; b.hitSet = null; b.qp = null; }
    } else if (b.mode === 'hold') {
      if (b.modeT <= 0) b.mode = 'walk';
    } else if (b.mode === 'axesweep') {
      // The axe comes round in a wide low arc: everyone in front of him is hit and thrown back. Jump it.
      b.yaw = b.sy;
      if (b.modeT <= 0) {
        for (const p of players) {
          if (!p.alive) continue;
          const px = p.x - b.x, pz = p.z - b.z, pd = Math.hypot(px, pz) || 1;
          if (pd > reach + 6 || (p.y || 0) - w.heightAt(p.x, p.z) > 2.4) continue;
          const off = Math.atan2(px, pz) - b.sy;
          if (Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) > 1.75) continue;
          this.ev('a', p.id, bd(30), 'B', 0, 0, 0, q10(px / pd * 14), q10(pz / pd * 14));
        }
        b.mode = 'hold'; b.modeT = 0.6;
      }
    } else if (b.mode === 'axespin') {
      // Whirlwind: he spins with the axe out and walks his target down.
      b.yaw = Math.atan2(dx, dz);
      if (d > 3) { const st = speed * 1.45 * dt; b.x += (dx / d) * st; b.z += (dz / d) * st; }
      b.st -= dt;
      if (b.st <= 0) {
        b.st = 0.5;
        for (const p of players) {
          if (!p.alive) continue;
          const px = p.x - b.x, pz = p.z - b.z, pd = Math.hypot(px, pz) || 1;
          if (pd > reach + 4 || (p.y || 0) - w.heightAt(p.x, p.z) > 6) continue;
          this.ev('a', p.id, Math.round(bd(24) * 0.6), 'B', 0, 0, 0, q10(px / pd * 9), q10(pz / pd * 9));
        }
      }
      if (b.modeT <= 0) { b.mode = 'hold'; b.modeT = 0.8; }
    } else if (b.mode === 'pursuit') {
      // The hunter: sprints after its target, swinging every half second, until the chase runs out.
      b.yaw = Math.atan2(dx, dz);
      if (d > reach * 0.7) { const st = Math.min(d - reach * 0.6, speed * 2.2 * dt); b.x += (dx / d) * st; b.z += (dz / d) * st; }
      if (d <= reach + 0.6 && b.melee <= 0) { b.melee = 0.55; b.anim = 1; this.hitTarget(t, Math.round(bd(24) * 0.5), 'B'); }
      if (b.modeT <= 0) b.mode = 'walk';
    } else if (b.mode === 'flurry-wind') {
      b.yaw = Math.atan2(dx, dz);
      if (b.modeT <= 0) { b.mode = 'flurry'; b.modeT = enr ? 2.2 : 1.7; b.ft = 0; }
    } else if (b.mode === 'flurry') {
      // A fast barrage: it darts in and rakes its target five times a second.
      b.yaw = Math.atan2(dx, dz);
      if (d > reach * 0.6) { const st = Math.min(d - reach * 0.5, 17 * dt); b.x += (dx / d) * st; b.z += (dz / d) * st; }
      b.ft -= dt;
      if (b.ft <= 0 && d <= reach + 1) { b.ft = 0.2; b.anim = 1; this.hitTarget(t, Math.round(bd(40) / 8), 'B'); }
      if (b.modeT <= 0) b.mode = 'walk';
    } else if (b.mode === 'leap') {
      // Airborne: it comes down on the marked spot as the warning circle closes.
      const k = 1 - Math.max(0, b.modeT) / b.lT;
      b.x = b.lx0 + (b.lx - b.lx0) * k; b.z = b.lz0 + (b.lz - b.lz0) * k;
      b.yaw = Math.atan2(b.lx - b.lx0, b.lz - b.lz0);
      if (b.modeT <= 0) { b.mode = 'walk'; b.anim = 1; }
    } else if (b.mode === 'volley') {
      // A stream of bolts, one after another, tracking the target while it fires.
      b.yaw = Math.atan2(dx, dz);
      b.vt -= dt;
      if (b.vt <= 0 && b.vn > 0) {
        b.vt = 0.14; b.vn--; b.anim = 1;
        const tx = t.x + (Math.random() - 0.5) * 2.4, tz = t.z + (Math.random() - 0.5) * 2.4;
        const ex = tx - b.x, ez = tz - b.z, ey = ((t.y || 0) + 1.2) - (yb + 4), L = Math.hypot(ex, ey, ez) || 1;
        this.ev('p', q10(b.x), q10(yb + 4), q10(b.z), q10(ex / L * 27), q10(ey / L * 27), q10(ez / L * 27), Math.round(bd(40) / 5), 1);
      }
      if (b.vn <= 0) b.mode = 'walk';
    } else if (b.mode === 'charge-wind') {
      if (b.modeT <= 0) { b.mode = 'charge'; b.modeT = 1.1; }
    } else if (b.mode === 'charge') {
      b.x += b.cx * 24 * dt; b.z += b.cz * 24 * dt;
      for (const p of players) {
        if (!p.alive) continue;
        if (Math.hypot(p.x - b.x, p.z - b.z) < 3.4 && !(b.hitSet || new Set()).has(p.id)) {
          (b.hitSet = b.hitSet || new Set()).add(p.id);
          this.ev('a', p.id, bd(28), 'B');
        }
      }
      if (b.modeT <= 0) { b.mode = 'walk'; b.hitSet = null; }
    } else {
      b.yaw = Math.atan2(dx, dz);
      if (d > (b.def.reach || 4.5)) { b.x += (dx / d) * speed * dt; b.z += (dz / d) * speed * dt; }
      else if (b.melee <= 0) {
        b.anim = 1;
        if (b.idx === 6 && t.kind === 'p') {
          // Thermes fights up close with his axe: an overhead cleave on the spot you stand on, then wide sweeps.
          if ((b.axN = (b.axN || 0) + 1) % 3 === 1) {
            b.ak = 1; b.akT = 1.3; b.melee = 2.1; b.mode = 'hold'; b.modeT = 1.25;
            this.ev('s', q10(t.x), q10(t.z), 65, 115, bd(38));
            this.ev('ax', 1, q10(t.x), q10(t.z), 115);
          } else {
            b.ak = 2; b.akT = 1.2; b.melee = 1.9; b.mode = 'axesweep'; b.modeT = 0.6; b.sy = Math.atan2(dx, dz);
            this.ev('ax', 2, q10(b.x), q10(b.z), 60, Math.round(b.sy * 100), Math.round(reach + 6));
          }
        } else { b.melee = 1.4; this.hitTarget(t, bd(24), 'B'); }
      }
      b.cd -= dt;
      if (b.cd <= 0) {
        const atks = b.def.attacks;
        const atk = atks[b.atkIdx++ % atks.length];
        const enraged = b.hp < b.maxHp * 0.4;
        b.cd = (enraged ? 2.2 : 3.2) - this.round * 0.12;
        b.anim = 1;
        if (atk === 'eyelaser') {
          // Lock a sweep that starts a little to one side of the nearest player and crosses over them.
          const to = Math.atan2(dx, dz), dir = Math.random() < 0.5 ? 1 : -1;
          b.lsw = dir * (enraged ? THERMES.laserSweep * 1.35 : THERMES.laserSweep);
          b.lz = to - b.lsw * 0.5;
          b.lsd = enraged ? THERMES.laserTime * 0.8 : THERMES.laserTime;
          b.mode = 'laser-wind'; b.modeT = THERMES.laserWind;
          b.cd += b.lsd + THERMES.laserWind;
          this.ev('lw', q10(b.x), q10(b.z), q10(b.lz), q10(b.lsw), Math.round(THERMES.laserWind * 10));
        } else if (atk === 'quake') {
          b.qp = null;
          b.mode = 'quake-wind'; b.modeT = THERMES.quakeWind;
          b.cd += THERMES.quakeWind + 1.2;
          this.ev('qw', q10(b.x), q10(b.z), Math.round(THERMES.quakeWind * 10));
        } else if (atk === 'slam') {
          const targets = players.filter((p) => p.alive);
          for (const p of targets) this.ev('s', q10(p.x), q10(p.z), 55, 120, bd(30));
          if (enraged) this.ev('s', q10(b.x), q10(b.z), 80, 140, bd(30));
        } else if (atk === 'ring') {
          const n = enraged ? 24 : 16;
          const off = Math.random() * 6;
          for (let i = 0; i < n; i++) {
            const a = off + (i / n) * Math.PI * 2;
            this.ev('p', q10(b.x), q10(yb + 2), q10(b.z), q10(Math.sin(a) * 13), 0, q10(Math.cos(a) * 13), bd(13), 1);
          }
        } else if (atk === 'barrage') {
          for (const p of players.filter((p) => p.alive)) {
            for (let k = 0; k < 3; k++) {
              const tx = p.x + (Math.random() - 0.5) * 3, tz = p.z + (Math.random() - 0.5) * 3;
              const ex = tx - b.x, ez = tz - b.z, ey = (p.y + 1.2) - (yb + 4);
              const L = Math.hypot(ex, ey, ez) || 1;
              this.ev('p', q10(b.x), q10(yb + 4), q10(b.z), q10(ex / L * 22), q10(ey / L * 22), q10(ez / L * 22), bd(12), 1);
            }
          }
        } else if (atk === 'axespin') {
          b.mode = 'axespin'; b.modeT = enraged ? 3.2 : 2.6; b.st = 0.5; b.cd += b.modeT + 0.8;
          this.ev('ax', 3, q10(b.x), q10(b.z), Math.round(b.modeT * 100));
        } else if (atk === 'pursuit') {
          b.mode = 'pursuit'; b.modeT = enraged ? 5 : 4; b.cd += b.modeT;
          this.ev('cw', q10(b.x), q10(b.z), q10(dx / d * 26), q10(dz / d * 26));
        } else if (atk === 'flurry') {
          b.mode = 'flurry-wind'; b.modeT = 0.5; b.cd += 2.4;
          this.ev('cw', q10(b.x), q10(b.z), q10(dx / d * 26), q10(dz / d * 26));
        } else if (atk === 'leap') {
          b.lx0 = b.x; b.lz0 = b.z; b.lx = t.x; b.lz = t.z;
          b.mode = 'leap'; b.modeT = b.lT = 1.15; b.cd += 1.4;
          this.ev('s', q10(t.x), q10(t.z), 75, 115, bd(34));
        } else if (atk === 'volley') {
          b.mode = 'volley'; b.vn = enraged ? 14 : 10; b.vt = 0.35; b.cd += b.vn * 0.14 + 0.6;
        } else if (atk === 'beam') {
          // Aura beam: a line of blasts races from the boss through each player, far past them.
          for (const p of players.filter((p) => p.alive)) {
            const ex = p.x - b.x, ez = p.z - b.z, L = Math.hypot(ex, ez) || 1;
            // A wall a player raised (Pillar Burst, Ice Barrier, Wall of Fire) stops the beam where it meets it. Only Thermes' eye lasers
            // and the Visitor's beam go through walls (Nutty 2026-11-13).
            let reach = Infinity;
            if (w.wallAt) for (let q = 1; q <= 50; q += 0.7) { const X = b.x + (ex / L) * q, Z = b.z + (ez / L) * q; if (w.wallAt(X, w.heightAt(X, Z) + 1, Z, 0.4)) { reach = q; break; } }
            for (let i = 0; i < 11; i++) { const dd = 5 + i * 4.4; if (dd > reach) break; this.ev('s', q10(b.x + (ex / L) * dd), q10(b.z + (ez / L) * dd), 27, 90 + i * 5, bd(22)); }
          }
          b.mode = 'hold'; b.modeT = 1.4; b.cd += 1.2;
        } else if (atk === 'stomp') {
          // Ground stomp: two shockwave rings roll out over the floor. Jump them.
          b.qp = { range: 38, speed: 20, dmg: 26, knock: 10, n: 2 };
          b.mode = 'quake-wind'; b.modeT = 0.8; b.cd += 2.4;
          this.ev('qw', q10(b.x), q10(b.z), 8, 1);
        } else if (atk === 'pools') {
          // Rot pools: a spread of blasts goes off around every player, one after another.
          for (const p of players.filter((p) => p.alive)) for (let k = 0; k < 6; k++) {
            const a = Math.random() * 6.28, rr = k ? 3 + Math.random() * 7 : 0;
            this.ev('s', q10(p.x + Math.cos(a) * rr), q10(p.z + Math.sin(a) * rr), 45, 100 + k * 28, bd(20));
          }
        } else if (atk === 'meteor') {
          // Thermes pulls meteors out of the sky: each lands where a player stood, four seconds after the warning.
          this.ev('bw', 'Meteors incoming! Get out of the circles');
          for (const p of players.filter((p) => p.alive)) {
            this.ev('mt', q10(p.x), q10(p.z), 90, 400, bd(55));
            for (let k = 0; k < (enraged ? 3 : 1); k++) { const a = Math.random() * 6.28, rr = 14 + Math.random() * 14; this.ev('mt', q10(p.x + Math.cos(a) * rr), q10(p.z + Math.sin(a) * rr), 90, 400 + 30 * (k + 1), bd(55)); }
          }
          b.cd += 1;
        } else if (atk === 'charge') {
          b.mode = 'charge-wind';
          b.modeT = 0.7;
          b.cx = dx / d; b.cz = dz / d;
          b.yaw = Math.atan2(dx, dz);
          this.ev('cw', q10(b.x), q10(b.z), q10(b.cx * 26), q10(b.cz * 26));
        } else if (atk === 'summon') {
          const ring = b.def.rad ? b.def.rad * 2.2 + 6 : 7;
          for (let i = 0; i < 3 + Math.floor(this.round / 2) + (b.def.rad ? 4 : 0); i++) {
            const a = Math.random() * Math.PI * 2;
            const light = Object.keys(this.lineup || {}).filter((t) => MOBS[t].tier < 3);
            const m = this.newMob(light.length ? light[Math.floor(Math.random() * light.length)] : 'grunt', b.x + Math.cos(a) * ring, b.z + Math.sin(a) * ring);
            this.mobs.set(m.id, m);
            this.ev('sm', q10(m.x), q10(m.z));
          }
        } else if (atk === 'echo') {
          // (Legacy) a boss calls back the bosses already beaten this run (two at a time, never more than four standing).
          let standing = 0;
          for (const x of this.mobs.values()) if (x.type.startsWith('echo')) standing++;
          const past = [];
          for (let r = 0; r < this.round; r++) past.push(bossIdx(this.runSeed, r));
          const pastOk = past.filter((x, i2) => MOBS['echo' + x] && past.indexOf(x) === i2);
          past.length = 0; past.push(...pastOk);
          if (past.length) this.ev('bw', 'Thermes calls the fallen bosses to his side');
          for (let i = 0; i < 2 && standing < (enraged ? 3 : 2) && past.length; i++, standing++) {
            const a = Math.random() * Math.PI * 2, ring = b.def.rad * 2.4 + 6;
            const m = this.newMob('echo' + past[Math.floor(Math.random() * past.length)], b.x + Math.cos(a) * ring, b.z + Math.sin(a) * ring);
            this.mobs.set(m.id, m);
            this.ev('sm', q10(m.x), q10(m.z));
          }
        }
      }
    }
    [b.x, b.z] = w.collide(b.x, b.z, b.def.rad || 2.2);
  }

  // The reaper never loses her prey: she always runs at the nearest living player, slides round props
  // (drifting through them if she gets wedged), blinks in when far behind, and lunges into every swing.
  updateDemon(dt, players) {
    const dm = this.demon;
    if (!dm) return;
    const w = this.world && this.world.seed === this.seed ? this.world : null;
    const alive = players.filter((p) => p.alive);
    dm.anim = Math.max(0, dm.anim - dt * 1.5);
    if (!alive.length) { dm.hit = -1; return; }
    const nearest = () => { let t = alive[0], bd = 1e9; for (const p of alive) { const d = Math.hypot(p.x - dm.x, p.z - dm.z); if (d < bd) { bd = d; t = p; } } return [t, bd]; };
    const [t, bd] = nearest();
    const dx = t.x - dm.x, dz = t.z - dm.z;
    const d = bd || 1;
    dm.yaw = Math.atan2(dx, dz);
    dm.blink -= dt; dm.ghost = Math.max(0, dm.ghost - dt);
    const blinkTo = () => {
      dm.blink = 3.5; dm.stuck = 0; dm.ghost = 0; dm.hit = -1;
      let nx = t.x - Math.sin(t.ry) * 6, nz = t.z - Math.cos(t.ry) * 6;
      if (w) [nx, nz] = w.collide(nx, nz, 0.5);
      this.ev('bl', q10(dm.x), q10(dm.z), q10(nx), q10(nz));
      dm.x = nx; dm.z = nz;
    };
    if ((d > 14 && dm.blink <= 0) || d > 60) { blinkTo(); return; }
    // Wedged for too long and still far away: step out of the world's way.
    if (dm.stuck > 1.6 && d > 6 && dm.blink <= 0) { blinkTo(); return; }
    const lunging = dm.hit > 0;
    let sp = DEMON.speed, want = d > DEMON.range;
    if (lunging) { sp = DEMON.speed * 2.6; want = d > 1.9; }
    if (want) {
      const step = sp * dt, base = Math.atan2(dx, dz);
      const ox = dm.x, oz = dm.z;
      // Try heading straight at the player, then veer either way round whatever is in the road.
      let best = null, bestScore = -1e9;
      for (const off of [0, 0.5 * dm.side, -0.5 * dm.side, 1.0 * dm.side, -1.0 * dm.side, 1.5 * dm.side, -1.5 * dm.side]) {
        const a = base + off;
        let nx = ox + Math.sin(a) * step, nz = oz + Math.cos(a) * step;
        if (w && dm.ghost <= 0) [nx, nz] = w.collide(nx, nz, 0.45);
        const prog = ((nx - ox) * dx + (nz - oz) * dz) / d / step;
        const score = prog - Math.abs(off) * 0.05;
        if (score > bestScore) { bestScore = score; best = [nx, nz, off]; }
        if (prog > 0.85) break;
      }
      dm.x = best[0]; dm.z = best[1];
      if (best[2] !== 0) dm.side = best[2] > 0 ? 1 : -1;
      const moved = Math.hypot(dm.x - ox, dm.z - oz);
      dm.stuck = moved < step * 0.45 ? dm.stuck + dt : Math.max(0, dm.stuck - dt * 2);
      if (dm.stuck > 0.6 && dm.ghost <= 0) { dm.ghost = 1.0; dm.stuck = 0.8; } // drift through the obstacle
    } else dm.stuck = 0;
    dm.atk -= dt;
    if (dm.hit > 0) {
      dm.hit -= dt;
      if (dm.hit <= 0) {
        dm.hit = -1;
        // The cut lands on whoever is nearest now, if the lunge brought them into reach.
        const [t2, d2] = nearest();
        if (d2 <= DEMON.range + 1.2) this.ev('a', t2.id, Math.round(DEMON.dmg * Math.pow(DEMON.atkGrow, this.round)), 'D');
      }
    }
    if (dm.hit < 0 && d <= DEMON.range + 0.6 && dm.atk <= 0) {
      dm.atk = DEMON.rate;
      dm.anim = 1;
      dm.hit = 0.27;
    }
  }

  updateNpcs(dt, players) {
    const w = this.world;
    for (const n of [...this.npcs.values()]) {
      const d = n.d;
      n.anim = Math.max(0, n.anim - dt * 3);
      const owner = players.find((p) => p.id === n.owner);
      if (d.life) { n.life -= dt; if (n.life <= 0) { this.npcs.delete(n.id); this.ev('nd', n.id, q10(n.x), q10(n.z)); continue; } }
      if (n.wake > 0) { n.wake -= dt; n.moving = 0; continue; } // still getting back up
      // Find a mob to fight.
      let foe = null, fd = 1e9;
      if (d.dmg) {
        for (const m of this.mobs.values()) {
          const dd = Math.hypot(m.x - n.x, m.z - n.z);
          if (dd < fd && dd < (d.hunt || 20)) { fd = dd; foe = { id: m.id, x: m.x, z: m.z, mob: m }; }
        }
        if (this.boss) {
          const dd = Math.hypot(this.boss.x - n.x, this.boss.z - n.z);
          if (dd < fd && dd < 26) { fd = dd; foe = { id: 'B', x: this.boss.x, z: this.boss.z, boss: true }; }
        }
        // Duel Arena: summoned fighters hunt the other duelist (never their own summoner).
        if (this.duel) {
          for (const p of players) {
            if (p.id === n.owner || !p.alive || p.hp <= 0 || p.y > w.heightAt(n.x, n.z) + 4) continue; // out of reach overhead
            const dd = Math.hypot(p.x - n.x, p.z - n.z);
            if (dd < fd && dd < (d.hunt || 20)) { fd = dd; foe = { id: 'P:' + p.id, x: p.x, z: p.z, pl: p }; }
          }
        }
      }
      let gx = n.x, gz = n.z;
      if (foe) {
        const body = (foe.pl ? 0.55 * DUEL.size : 0) + (this.duel && d.summoned ? 0.9 : 0); // duel fighters are big: aim for their edge, not their centre; duel zombies are twice as big
        const want = d.range > 5 ? d.range * 0.7 : d.range * 0.8 + (foe.boss ? 2.5 : 0) + body;
        const dx = foe.x - n.x, dz = foe.z - n.z, dd = Math.hypot(dx, dz) || 1;
        n.yaw = Math.atan2(dx, dz);
        if (dd > want) { gx = foe.x; gz = foe.z; }
        n.atk -= dt;
        if (dd <= d.range + (foe.boss ? 3 : 0.4) + body && n.atk <= 0) {
          n.atk = d.rate;
          n.anim = 1;
          const dmg = n.dmg ?? d.dmg * (1 + this.round * 0.3);
          if (d.range > 5) this.ev('nf', n.id, q10(foe.x), q10(foe.z));
          if (foe.pl) this.ev('a', foe.pl.id, Math.max(1, Math.round(dmg * DUEL.pvp)), 'pvp'); // the victim's own game applies it, like any duel hit
          else if (foe.boss) { this.boss.hp -= dmg; if (this.boss.hp <= 0) this.killBoss(n.owner); }
          else { foe.mob.hp -= dmg; foe.mob.lastHit = n.owner; if (foe.mob.hp <= 0) this.killMob(foe.mob, n.owner); }
        }
      } else if (owner) {
        const dx = owner.x - n.x, dz = owner.z - n.z, dd = Math.hypot(dx, dz);
        if (dd > 5) { gx = owner.x; gz = owner.z; n.yaw = Math.atan2(dx, dz); }
        if (dd > 60) { n.x = owner.x + 2; n.z = owner.z + 2; }
      }
      const dx = gx - n.x, dz = gz - n.z, dd = Math.hypot(dx, dz);
      const step = (n.spd ?? d.speed) * dt;
      if (dd > 0.5) {
        // Hunting a duelist behind cover: with a wall in the way a summon follows it sideways, keeping the same side until the line is clear.
        // (Low ray: summons are stopped by every block, however short.)
        let ux = dx / dd, uz = dz / dd;
        if (foe && foe.pl && w.solids.length) {
          if (w.rayBlock(n.x, w.heightAt(n.x, n.z) + 0.4, n.z, ux, 0, uz, dd) < dd) {
            if (!n.side) n.side = n.id % 2 ? 1 : -1;
            const a = n.side * 1.35, c = Math.cos(a), sn = Math.sin(a);
            [ux, uz] = [ux * c - uz * sn, ux * sn + uz * c];
          } else n.side = 0;
        }
        n.x += ux * step; n.z += uz * step; n.moving = 1;
      } else n.moving = 0;
      [n.x, n.z] = w.collide(n.x, n.z, 0.5);
      // Support NPCs always heal.
      if (d.heal) {
        n.heal -= dt;
        if (n.heal <= 0) {
          n.heal = d.healRate;
          let best = null, ratio = 0.999;
          for (const p of players) {
            if (!p.alive) continue;
            const r = p.hp / p.mh;
            if (r < ratio && Math.hypot(p.x - n.x, p.z - n.z) < 20) { ratio = r; best = p; }
          }
          if (best) this.ev('h', best.id, Math.round(d.heal * (1 + this.round * 0.2)), n.id);
        }
      }
    }
  }

  snapshot() {
    const m = [];
    for (const x of this.mobs.values()) {
      // 1 frozen, 2 burning, 4 slowed, 8 winding up an ability.
      const flags = (x.frozen > 0 ? 1 : 0) | (x.burn > 0 ? 2 : 0) | (x.slow > 0 ? 4 : 0) | (x.fuse > 0 || x.mode === 'crouch' || x.mode === 'cast' || x.mode === 'slam' || (x.base.pstyle && x.atk > 0 && x.atk < 0.5) ? 8 : 0) | (x.stag > 0 ? 32 : 0) | (x.shield > 0 ? 64 : 0);
      m.push([x.id, x.ti, q10(x.x), q10(x.z), Math.max(1, Math.round((x.hp / x.maxHp) * 100)), flags, Math.round(x.yaw * 10), Math.round(x.anim * 9), Math.round((x.fy || 0) * 10), x.mini ? 1 : 0, x.el | 0, x.wi | 0]);
    }
    const n = [];
    for (const x of this.npcs.values()) n.push([x.id, x.ti, x.owner, q10(x.x), q10(x.z), Math.max(1, Math.round((x.hp / x.maxHp) * 100)), Math.round(x.yaw * 10), Math.round(x.anim * 9), x.moving ? 1 : 0, x.mt != null ? x.mt + 1 : 0, x.wi | 0]);
    const b = this.boss;
    const dm = this.demon;
    return {
      mu: this.mu | 0, bt: Math.round((this.btK ?? 1) * 100),
      ph: this.phase, rd: this.round, sd: this.seed, rs: this.runSeed, tl: this.roundLen === 0 && this.phase === 'play' ? 0 : Math.round(this.tl * 10) / 10, rl: this.roundLen,
      m, n,
      b: b ? [b.idx, q10(b.x), q10(b.z), Math.max(1, Math.round((b.hp / b.maxHp) * 1000)), Math.round(b.anim * 9), Math.round(b.yaw * 10), b.mode === 'charge' || b.mode === 'pursuit' || b.mode === 'flurry' ? 1 : b.mode === 'leap' ? 2 : 0, b.mode === 'laser' || b.mode === 'vbeam' ? Math.round(b.ly * 100) : b.mode === 'laser-wind' || b.mode === 'vcharge' ? 9999 : null, b.mode === 'overheat' ? 1 : b.mode === 'axespin' ? 3 : b.ak || 0, b.mode === 'vbeam' ? Math.round(b.ld) : 0] : 0,
      dm: dm ? [q10(dm.x), q10(dm.z), Math.round(dm.yaw * 10), Math.round(dm.anim * 9), Math.max(1, Math.round((dm.hp / dm.maxHp) * 1000))] : 0,
      e: this.events.map((e) => [...e]),
      oc: [...this.opened],
      ak: this.ack, rk: this.rack,
      ep: this.epoch,
      du: this.duel ? 1 : 0, ar: this.arena, dp: this.phase === 'dpick' ? this.pickN : 0, pt: this.duel && this.phase === 'duel' ? Math.round(this.puT) : 0, wn: this.winner || '',
      vt: this.phase === 'vote' ? [this.voteTally.f, this.voteTally.x] : 0,
    };
  }
}
