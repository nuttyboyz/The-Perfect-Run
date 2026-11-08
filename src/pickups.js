// Health pickups dropped by champions (mini bosses). Each player sees and collects their own
// copies, so nothing needs syncing: the drop event carries a position and a seed.
import { Dailies } from './dailies.js';
import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { MINI } from './data.js';
import { addPP, getMeta } from './meta.js';
import { gemURL } from './metashop.js';

const LIFE = 45;
let _geo = null, _mats = null;
function shared() {
  if (_geo) return { geo: _geo, mats: _mats };
  _geo = {
    orb: new THREE.IcosahedronGeometry(0.28, 2),
    cross: new THREE.BoxGeometry(0.34, 0.1, 0.1),
    ring: new THREE.TorusGeometry(0.42, 0.025, 8, 28),
  };
  _mats = {
    orb: new THREE.MeshStandardMaterial({ color: 0x35d06a, emissive: 0x20ff6a, emissiveIntensity: 1.4, roughness: 0.25 }),
    cross: new THREE.MeshBasicMaterial({ color: 0xf2fff4, toneMapped: false }),
    ring: new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.7, toneMapped: false }),
  };
  return { geo: _geo, mats: _mats };
}

// Perfect Point shards: short-lived crystals that surface at random during a round.
const SHARD_LIFE = 22;
const COIN_SOFT = 60; // above this many coins on the floor, crowded ones merge
const PP_CSS = `
.pp-chip { position: absolute; right: 74px; top: 242px; display: flex; align-items: center; gap: 6px; padding: 3px 10px 3px 6px; border-radius: 999px; background: rgba(12,8,22,.7); border: 1px solid rgba(181,140,255,.45); color: #e9dcff; font: 700 15px/1 var(--ui, system-ui), sans-serif; pointer-events: none; z-index: 14; transition: transform .15s; }
.pp-chip img { width: 18px; height: 18px; }
.pp-chip.bump { transform: scale(1.18); }
.pp-chip em { font-style: normal; color: #ffe9a8; margin-left: 2px; opacity: 0; transition: opacity .3s; }
.pp-chip.bump em { opacity: 1; }
`;

export class HealthPickups {
  constructor(game) {
    this.game = game; this.list = []; this.shards = []; this.coins = [];
    this.ppT = 10; this.ppRun = 0;
    if (!document.getElementById('pp-chip-css')) { const s = document.createElement('style'); s.id = 'pp-chip-css'; s.textContent = PP_CSS; document.head.appendChild(s); }
    const hud = game.root.querySelector('#hud') || game.root;
    this.chip = document.createElement('div');
    this.chip.className = 'pp-chip';
    this.chip.innerHTML = '<img alt=""><b>0</b><em></em>';
    this.chip.firstChild.src = gemURL();
    hud.appendChild(this.chip);
  }

  // A glittering crystal somewhere nearby; worth 2 to 4 PP (usually 2).
  spawnShard() {
    const g = this.game, p = g.player, w = g.world;
    if (!p || !w) return;
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2, d = 9 + Math.random() * 20;
      const x = p.pos.x + Math.cos(a) * d, z = p.pos.z + Math.sin(a) * d;
      if (w.blocked && w.blocked(x, z, 1)) continue;
      const roll = Math.random(), val = roll < 0.7 ? 2 : roll < 0.95 ? 3 : 4;
      const grp = new THREE.Group();
      const geo = (this._sg = this._sg || new THREE.OctahedronGeometry(0.34, 0));
      const mat = (this._sm = this._sm || new THREE.MeshStandardMaterial({ color: 0xb58cff, emissive: 0x8a5cff, emissiveIntensity: 1.6, roughness: 0.15, metalness: 0.3, flatShading: true }));
      const m = new THREE.Mesh(geo, mat); m.scale.set(0.8 + val * 0.15, 1.3 + val * 0.2, 0.8 + val * 0.15);
      grp.add(m);
      const y = w.heightAt(x, z);
      grp.position.set(x, y + 1, z);
      g.scene.add(grp);
      this.shards.push({ grp, x, z, y, t: 0, val, ph: Math.random() * 6 });
      g.fx.shockwave([x, y, z], 3, 0xb58cff, 0.5);
      g.fx.glow.emit({ p: [x, y + 1, z], life: 0.5, s0: 2.4, s1: 0.4, c0: [0.8, 0.65, 1, 0.8], c1: [0.7, 0.5, 1, 0] });
      return;
    }
  }

  earnPP(n) {
    this.ppRun += n; addPP(n);
    this.game.runStats.pp = (this.game.runStats.pp || 0) + n;
    this.chip.lastChild.textContent = '+' + n;
    this.chip.classList.add('bump');
    clearTimeout(this._bt); this._bt = setTimeout(() => this.chip.classList.remove('bump'), 900);
  }

  spawn(x, z, seed, n = MINI.drops) {
    const g = this.game, r = mulberry32(seed || 1), { geo, mats } = shared();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.8, d = 2.2 + r() * 2.4;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      const grp = new THREE.Group();
      const orb = new THREE.Mesh(geo.orb, mats.orb);
      const c1 = new THREE.Mesh(geo.cross, mats.cross), c2 = new THREE.Mesh(geo.cross, mats.cross);
      c2.rotation.z = Math.PI / 2;
      const ring = new THREE.Mesh(geo.ring, mats.ring); ring.rotation.x = Math.PI / 2;
      grp.add(orb, c1, c2, ring);
      orb.castShadow = false;
      const y = g.world.heightAt(px, pz);
      grp.position.set(px, y + 0.9, pz);
      g.scene.add(grp);
      // Pop out of the champion's body, then settle.
      this.list.push({ grp, x: px, z: pz, y, t: 0, ph: r() * 6, fromX: x, fromZ: z });
      g.fx.plus.emit({ p: [px, y + 1, pz], v: [0, 2, 0], life: 0.8, s0: 0.5, s1: 0.2, c0: [0.5, 1, 0.6, 1], c1: [0.3, 1, 0.5, 0] });
    }
  }

  // PC drops where an enemy dies as gold coins to walk over (the magnet pulls them in). `n` coins share `amount` PC.
  dropCoins(x, z, amount, n = 1) {
    const g = this.game;
    if (!g.world || amount <= 0) return;
    const cg = (this._cg = this._cg || new THREE.CylinderGeometry(0.2, 0.2, 0.05, 14).rotateX(Math.PI / 2));
    const cm = this.coinMat(0);
    n = Math.max(1, Math.min(n, amount));
    const each = Math.floor(amount / n), extra = amount - each * n;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = n === 1 ? 0.3 : 0.8 + Math.random() * 1.6;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, y = g.world.heightAt(px, pz);
      const m = new THREE.Mesh(cg, cm); m.scale.setScalar(n === 1 ? 1 : 1.15);
      m.position.set(x, y + 1, z); g.scene.add(m);
      this.coins.push({ m, x: px, z: pz, y, fx: x, fz: z, t: 0, val: each + (i === 0 ? extra : 0), ph: Math.random() * 6, tier: 0 });
      g.fx.glow.emit({ p: [px, y + 0.8, pz], life: 0.35, s0: 0.7, s1: 0.2, c0: [1, 0.85, 0.3, 0.9], c1: [1, 0.6, 0.1, 0] });
    }
    if (this.coins.length > COIN_SOFT) this.mergeCoins();
  }

  // Coins never expire. gold = a plain coin, green = several piled into one, red = a lot piled into one.
  coinMat(tier) {
    this._mats = this._mats || {};
    if (!this._mats[tier]) {
      const c = [[0xffc83a, 0xff9a10], [0x4cff6a, 0x12b83a], [0xff3b30, 0xc0100a]][tier];
      this._mats[tier] = new THREE.MeshStandardMaterial({ color: c[0], emissive: c[1], emissiveIntensity: 1.1, metalness: 0.8, roughness: 0.25 });
    }
    return this._mats[tier];
  }

  // Too many coins on the floor slows the game, so crowded ones fuse into one bigger coin (same total PC) near where they lay.
  mergeCoins() {
    const g = this.game, p = g.player, CELL = 7;
    for (let pass = 0; pass < 6 && this.coins.length > COIN_SOFT * 0.7; pass++) {
      const cells = new Map();
      for (const k of this.coins) {
        if (k.t < 1.2) continue; // still popping out
        if (p && Math.hypot(p.pos.x - k.x, p.pos.z - k.z) < 6) continue; // never under your feet
        const key = Math.floor(k.x / CELL) + ',' + Math.floor(k.z / CELL);
        let c = cells.get(key); if (!c) cells.set(key, (c = [])); c.push(k);
      }
      const groups = [...cells.values()].filter((c) => c.length > 1).sort((a, b) => b.length - a.length);
      if (!groups.length) break;
      for (const grp of groups) {
        if (this.coins.length <= COIN_SOFT * 0.7) break;
        let val = 0, x = 0, z = 0, tier = 0;
        for (const k of grp) { val += k.val; x += k.x * k.val; z += k.z * k.val; tier = Math.max(tier, k.tier); g.scene.remove(k.m); }
        x /= val; z /= val;
        const gone = new Set(grp); this.coins = this.coins.filter((k) => !gone.has(k));
        tier = tier >= 1 || val >= 80 ? 2 : 1; // plain coins fuse to green; a pile of piles (or a big sum) goes red
        const y = g.world.heightAt(x, z);
        const m = new THREE.Mesh(this._cg, this.coinMat(tier)); m.scale.setScalar([1, 1.5, 1.9][tier]);
        m.position.set(x, y + 1, z); g.scene.add(m);
        this.coins.push({ m, x, z, y, fx: x, fz: z, t: 1, val, ph: Math.random() * 6, tier });
        g.fx.glow.emit({ p: [x, y + 0.9, z], life: 0.35, s0: 1.2, s1: 0.3, c0: tier === 2 ? [1, 0.3, 0.2, 0.9] : [0.4, 1, 0.5, 0.9], c1: [0.2, 1, 0.3, 0] });
      }
    }
  }

  collectCoin(k, quiet = false) {
    const g = this.game, p = g.player;
    this.game.scene.remove(k.m);
    if (!p) return;
    p.pc += k.val; g.runStats.pcEarned += k.val; if (g.dailyOn && g.dailyOn()) Dailies.add('pc', k.val);
    if (!quiet) { g.audio.play('coin', 0.5); g.ui.coinPop(k.val); g.fx.glow.emit({ p: [k.x, k.y + 1, k.z], life: 0.3, s0: 1.1, s1: 0.2, c0: [1, 0.9, 0.4, 1], c1: [1, 0.7, 0.2, 0] }); }
  }

  updateCoins(dt) {
    const g = this.game, p = g.player;
    const mag = p && p.perks ? (p.perks.magnet + p.stats.magnet) : 0, reach = 2.3 + mag * 1.2;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const k = this.coins[i];
      k.t += dt;
      const pop = Math.min(1, k.t / 0.45), e = 1 - (1 - pop) * (1 - pop);
      let x = k.fx + (k.x - k.fx) * e, z = k.fz + (k.z - k.fz) * e;
      if (pop >= 1 && p && p.alive) { // pulled in once you are close
        const dx = p.pos.x - k.x, dz = p.pos.z - k.z, d = Math.hypot(dx, dz) || 1;
        if (d < reach + 2.5 + mag * 2) { const sp = Math.min(d, (8 + mag * 4 + (reach + 2.5 - d) * 3) * dt); k.x += (dx / d) * sp; k.z += (dz / d) * sp; k.y = g.world.heightAt(k.x, k.z); x = k.x; z = k.z; }
      }
      k.m.position.set(x, k.y + 0.8 + Math.sin(pop * Math.PI) * 1.4 + Math.sin(k.t * 3 + k.ph) * 0.08, z);
      k.m.rotation.y += dt * 4;
      if (k.t > 0.35 && p && p.alive && Math.hypot(p.pos.x - k.x, p.pos.z - k.z) < reach) { this.coins.splice(i, 1); this.collectCoin(k); }
    }
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.chip.style.display = g.mode === 'game' ? '' : 'none';
    this.chip.children[1].textContent = getMeta().pp.toLocaleString();
    // Random, brief PP shards during the round (Seeker makes them more frequent).
    if (g.phase === 'play' && p && p.alive) {
      this.ppT -= dt;
      if (this.ppT <= 0) { this.spawnShard(); this.ppT = (12 + Math.random() * 22) / (1 + 0.2 * (p.perks ? p.perks.seeker : 0)); }
    }
    this.updateShards(dt);
    this.updateCoins(dt);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const k = this.list[i];
      k.t += dt;
      const pop = Math.min(1, k.t / 0.5);
      const e = 1 - (1 - pop) * (1 - pop);
      const x = k.fromX + (k.x - k.fromX) * e, z = k.fromZ + (k.z - k.fromZ) * e;
      const arc = Math.sin(pop * Math.PI) * 2.2;
      k.grp.position.set(x, k.y + 0.9 + arc + Math.sin(k.t * 2.4 + k.ph) * 0.12, z);
      k.grp.rotation.y += dt * 2;
      // Blink out near the end of their life.
      k.grp.visible = k.t < LIFE - 6 || Math.floor(k.t * 6) % 2 === 0;
      if (Math.random() < 0.12) g.fx.plus.emit({ p: [x + (Math.random() - 0.5) * 0.5, k.y + 1, z + (Math.random() - 0.5) * 0.5], v: [0, 0.9, 0], life: 0.9, s0: 0.35, s1: 0.1, c0: [0.5, 1, 0.65, 0.9], c1: [0.3, 1, 0.5, 0] });
      let done = k.t > LIFE;
      if (!done && p && p.alive && k.t > 0.4 && p.hp < p.stats.maxHp - 0.5 && Math.hypot(p.pos.x - k.x, p.pos.z - k.z) < 2.2 + (p.perks ? (p.perks.magnet + p.stats.magnet) * 1.2 : 0)) {
        p.heal(p.stats.maxHp * MINI.heal);
        g.audio.play('heal', 0.6); g.ui.healFlash(); g.el.healAura([p.pos.x, p.pos.y, p.pos.z]);
        done = true;
      }
      if (done) { g.scene.remove(k.grp); this.list.splice(i, 1); }
    }
  }

  updateShards(dt) {
    const g = this.game, p = g.player;
    const reach = 2.0 + (p && p.perks ? (p.perks.magnet + p.stats.magnet) * 1.2 : 0);
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const k = this.shards[i];
      k.t += dt;
      // Magnet pull once close.
      if (p && p.alive) {
        const dx = p.pos.x - k.x, dz = p.pos.z - k.z, d = Math.hypot(dx, dz);
        if (d < reach + 3 && (p.perks.magnet + p.stats.magnet)) { const s = Math.min(d, (6 + (p.perks.magnet + p.stats.magnet) * 3) * dt); k.x += (dx / d) * s; k.z += (dz / d) * s; k.y = g.world.heightAt(k.x, k.z); }
      }
      k.grp.position.set(k.x, k.y + 1.05 + Math.sin(k.t * 2.2 + k.ph) * 0.15, k.z);
      k.grp.rotation.y += dt * 2.4;
      k.grp.visible = k.t < SHARD_LIFE - 5 || Math.floor(k.t * 7) % 2 === 0;
      if (Math.random() < 0.15) g.fx.glow.emit({ p: [k.x + (Math.random() - 0.5) * 0.6, k.y + 1 + Math.random(), k.z + (Math.random() - 0.5) * 0.6], v: [0, 0.8, 0], life: 0.7, s0: 0.5, s1: 0.1, c0: [0.85, 0.7, 1, 0.8], c1: [0.7, 0.5, 1, 0] });
      let done = k.t > SHARD_LIFE;
      if (!done && p && p.alive && Math.hypot(p.pos.x - k.x, p.pos.z - k.z) < reach) {
        this.earnPP(k.val);
        g.audio.play('coin', 0.7);
        g.fx.shockwave([k.x, k.y, k.z], 2.4, 0xd9b8ff, 0.3);
        done = true;
      }
      if (done) { g.scene.remove(k.grp); this.shards.splice(i, 1); }
    }
  }

  clear() {
    // PC never vanishes: coins still lying about when the round ends go into the purse.
    const pl = this.game.player;
    if (pl) for (const k of this.coins) { pl.pc += k.val; this.game.runStats.pcEarned += k.val; }
    for (const k of this.list) this.game.scene.remove(k.grp);
    for (const k of this.shards) this.game.scene.remove(k.grp);
    for (const k of this.coins) this.game.scene.remove(k.m); 
    this.list.length = 0; this.shards.length = 0; this.coins.length = 0;
    this.ppT = 8 + Math.random() * 8;
  }
}
