// What the mutators look like on this device: Piñata confetti and candy, the Jackpot fountain and its counter.
// Everything is local (each player sees their own copy), so none of it needs syncing.
import * as THREE from 'three';
import { PERF } from './perf.js';
import { MU, muOn, JACKPOT, PINATA, JACKPOT_EVERY } from './mutators.js';

const CONF_MAX = 900, CANDY_MAX = 90, CANDY_LIFE = 20;
const PAPER = [0xff2d55, 0xffcc00, 0x2ecc71, 0x1e90ff, 0xff7f11, 0xb84dff, 0x00d5d5, 0xff5ec4];
const CANDY = [0xff3355, 0x33c8ff, 0xffd22e, 0x7cff4a, 0xff8a1e, 0xc46bff];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

// A wrapped sweet: a glossy oval with a twisted paper fan at each end.
function candyGeometry() {
  const body = new THREE.SphereGeometry(0.13, 14, 10); body.scale(1.35, 0.85, 0.85);
  const parts = [body];
  for (const sx of [-1, 1]) {
    const tw = new THREE.ConeGeometry(0.1, 0.16, 8, 1, true); tw.rotateZ(sx * Math.PI / 2); tw.translate(sx * 0.23, 0, 0);
    parts.push(tw);
  }
  return mergeGeos(parts);
}
function mergeGeos(list) {
  let n = 0, ni = 0; for (const g of list) { n += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), idx = []; let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (g.index) for (const i of g.index.array) idx.push(i + o); else for (let i = 0; i < g.attributes.position.count; i++) idx.push(i + o);
    o += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setIndex(idx);
  return g;
}

const CSS = `
.jp-chip { position: absolute; right: 74px; top: 276px; display: flex; align-items: center; gap: 6px; padding: 3px 10px 3px 6px; border-radius: 999px; background: rgba(22,16,4,.72); border: 1px solid rgba(255,200,60,.55); color: #ffe7a0; font: 700 14px/1 var(--ui, system-ui), sans-serif; pointer-events: none; z-index: 14; }
.jp-chip i { width: 16px; height: 16px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff6c8, #ffc83a 45%, #b27200); box-shadow: 0 0 6px rgba(255,200,60,.7); }
.jp-chip.hot { animation: jpHot .5s ease-in-out infinite alternate; }
@keyframes jpHot { to { box-shadow: 0 0 16px rgba(255,210,60,.9); transform: scale(1.06); } }
.jp-pop { position: fixed; left: 0; right: 0; top: 38%; text-align: center; pointer-events: none; z-index: 9; font: 900 clamp(2.2rem, 6vw, 4.4rem)/1 var(--title, serif); letter-spacing: .08em; background: linear-gradient(180deg, #fffbe0, #ffd23a 55%, #b46a00); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 4px 14px rgba(0,0,0,.8)); animation: jpPop 1.8s cubic-bezier(.2,1.5,.4,1) forwards; }
.jp-pop small { display: block; font-size: .42em; letter-spacing: .2em; margin-top: .2em; }
@keyframes jpPop { 0% { opacity: 0; transform: scale(.4); } 15% { opacity: 1; transform: scale(1.12); } 25% { transform: scale(1); } 75% { opacity: 1; } 100% { opacity: 0; transform: translateY(-30px); } }
`;

export class MutatorFx {
  constructor(game) {
    this.g = game;
    this.kills = 0;
    // Confetti: one instanced mesh of paper flecks, each with its own spin and flutter.
    const paper = new THREE.PlaneGeometry(0.075, 0.11);
    this.conf = new THREE.InstancedMesh(paper, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.6, metalness: 0.05 }), CONF_MAX);
    this.conf.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.conf.count = 0; this.conf.frustumCulled = false;
    this.conf.setColorAt(0, _c.set(0xffffff));
    this.cp = [];
    // Candy: instanced too, glossy.
    this.candy = new THREE.InstancedMesh(candyGeometry(), new THREE.MeshPhysicalMaterial({ roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0 }), CANDY_MAX);
    this.candy.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.candy.count = 0; this.candy.frustumCulled = false; this.candy.castShadow = true;
    this.candy.setColorAt(0, _c.set(0xffffff));
    this.cs = [];
    game.scene.add(this.conf, this.candy);
    if (!document.getElementById('mufx-css')) { const st = document.createElement('style'); st.id = 'mufx-css'; st.textContent = CSS; document.head.appendChild(st); }
    const hud = game.root.querySelector('#hud') || game.root;
    this.chip = document.createElement('div'); this.chip.className = 'jp-chip'; this.chip.innerHTML = '<i></i><span></span>'; this.chip.style.display = 'none';
    hud.appendChild(this.chip);
  }

  // ---------- Piñata ----------
  pinata(x, y, z, h = 2) {
    const g = this.g;
    g.audio.play('pinata', g.distVol ? g.distVol(x, z) : 1);
    const n = Math.min(Math.round(70 * PERF.fx), CONF_MAX - this.cp.length); // fewer flecks when the governor is saving frames
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, up = 3 + Math.random() * 6, out = 1.5 + Math.random() * 4.5;
      this.cp.push({ x: x + Math.cos(a) * 0.3, y: y + h * (0.45 + Math.random() * 0.45), z: z + Math.sin(a) * 0.3, vx: Math.cos(a) * out, vy: up, vz: Math.sin(a) * out,
        rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6, sx: (Math.random() - 0.5) * 18, sy: (Math.random() - 0.5) * 14, sz: (Math.random() - 0.5) * 18,
        col: PAPER[(Math.random() * PAPER.length) | 0], t: 0, life: 3.2 + Math.random() * 1.6, ph: Math.random() * 6 });
    }
    // a puff of paper dust and a bright pop
    g.fx.glow.emit({ p: [x, y + h * 0.6, z], life: 0.18, s0: h * 1.4, s1: h * 2.2, c0: [1, 0.9, 0.7, 0.55], c1: [1, 0.6, 0.8, 0] });
    for (let i = 0; i < 14; i++) g.fx.spark.emit({ p: [x, y + h * 0.6, z], v: [(Math.random() - 0.5) * 10, Math.random() * 7, (Math.random() - 0.5) * 10], life: 0.5, s0: 0.12, s1: 0.03, c0: [1, 0.9, 0.5, 1], c1: [1, 0.4, 0.7, 0], g: 9 });
    // 2 to 4 sweets spill out and bounce
    const k = 2 + ((Math.random() * 3) | 0);
    for (let i = 0; i < k && this.cs.length < CANDY_MAX; i++) {
      const a = Math.random() * Math.PI * 2, out = 1.5 + Math.random() * 2.5;
      this.cs.push({ x, y: y + h * 0.6, z, vx: Math.cos(a) * out, vy: 4 + Math.random() * 3, vz: Math.sin(a) * out, ry: Math.random() * 6, rs: (Math.random() - 0.5) * 10, col: CANDY[(Math.random() * CANDY.length) | 0], t: 0, rest: false });
    }
  }

  // ---------- Jackpot ----------
  // Called on each of your kills; every JACKPOT_EVERY-th one bursts into gold.
  kill(x, y, z, pcGain) {
    if (!muOn(JACKPOT)) return;
    this.kills++;
    if (this.kills % JACKPOT_EVERY) return;
    const g = this.g, total = pcGain * 12;
    g.pickups.dropCoins(x, z, total, 16);
    g.fx.explosion([x, y + 1.2, z], 1.1, { color: [1, 0.82, 0.25], smoke: false });
    g.fx.shockwave([x, y, z], 7, 0xffd23a, 0.6);
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 5;
      g.fx.spark.emit({ p: [x, y + 1, z], v: [Math.cos(a) * s, 6 + Math.random() * 9, Math.sin(a) * s], life: 1.4 + Math.random() * 0.8, s0: 0.2, s1: 0.06, c0: [1, 0.9, 0.4, 1], c1: [1, 0.6, 0.1, 0], g: 10 });
    }
    g.fx.glow.emit({ p: [x, y + 1.5, z], life: 0.5, s0: 6, s1: 9, c0: [1, 0.85, 0.3, 0.7], c1: [1, 0.6, 0.1, 0] });
    if (g.fx.flash) g.fx.flash([x, y + 2, z], 0xffd23a, 30, 0.5, 18);
    g.audio.play('jackpot');
    const pop = document.createElement('div'); pop.className = 'jp-pop'; pop.innerHTML = 'JACKPOT!<small>+' + total + ' PC</small>';
    document.body.appendChild(pop); setTimeout(() => pop.remove(), 1900);
  }

  reset() { this.kills = 0; this.clearRound(); }
  clearRound() {
    this.cp.length = 0; this.cs.length = 0; this.conf.count = 0; this.candy.count = 0;
  }

  update(dt) {
    const g = this.g, p = g.player, w = g.world;
    // Jackpot counter.
    const jp = muOn(JACKPOT) && g.mode === 'game';
    this.chip.style.display = jp ? '' : 'none';
    if (jp) { const left = JACKPOT_EVERY - (this.kills % JACKPOT_EVERY); this.chip.lastChild.textContent = 'Jackpot in ' + left; this.chip.classList.toggle('hot', left <= 3); }
    if (!w) return;
    // Confetti: tumbles up and out, then flutters down with lots of air drag, rests on the ground and fades by shrinking.
    let n = 0;
    for (let i = this.cp.length - 1; i >= 0; i--) {
      const c = this.cp[i];
      c.t += dt;
      if (c.t > c.life) { this.cp[i] = this.cp[this.cp.length - 1]; this.cp.pop(); continue; }
      const gy = w.heightAt(c.x, c.z) + 0.02;
      if (c.y > gy) {
        const drag = c.vy < 0 ? 3.2 : 1.2;
        c.vx *= Math.exp(-drag * dt); c.vz *= Math.exp(-drag * dt); c.vy = Math.max(c.vy - 9 * dt, -1.4);
        c.vx += Math.sin(c.t * 5 + c.ph) * 1.6 * dt; c.vz += Math.cos(c.t * 4 + c.ph) * 1.6 * dt; // flutter
        c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
        c.rx += c.sx * dt; c.ry += c.sy * dt; c.rz += c.sz * dt;
        if (c.y <= gy) { c.y = gy; c.rx = -Math.PI / 2; c.rz = 0; }
      }
      const fade = Math.min(1, (c.life - c.t) / 0.6);
      _p.set(c.x, c.y, c.z); _q.setFromEuler(_e.set(c.rx, c.ry, c.rz)); _s.setScalar(fade);
      this.conf.setMatrixAt(n, _m.compose(_p, _q, _s)); this.conf.setColorAt(n, _c.set(c.col)); n++;
    }
    this.conf.count = n;
    if (n) { this.conf.instanceMatrix.needsUpdate = true; this.conf.instanceColor.needsUpdate = true; }
    // Candy: bounces to rest, bobs, and the magnet pulls it in; each one heals a little and is worth 1 PC.
    const mag = p && p.perks ? p.perks.magnet + p.stats.magnet : 0, reach = 2.2 + mag * 1.2;
    n = 0;
    for (let i = this.cs.length - 1; i >= 0; i--) {
      const c = this.cs[i];
      c.t += dt;
      const gy = w.heightAt(c.x, c.z) + 0.12;
      if (!c.rest) {
        c.vy -= 18 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt; c.ry += c.rs * dt;
        if (c.y <= gy) { c.y = gy; if (c.vy < -2.5) { c.vy *= -0.38; c.vx *= 0.6; c.vz *= 0.6; } else c.rest = true; }
      } else c.y = gy + 0.08 + Math.sin(c.t * 3 + c.ry) * 0.05;
      let take = false;
      if (p && p.alive && c.t > 0.5) {
        const dx = p.pos.x - c.x, dz = p.pos.z - c.z, d = Math.hypot(dx, dz) || 1;
        if (d < reach + 2) { const sp = Math.min(d, (7 + mag * 3) * dt); c.x += (dx / d) * sp; c.z += (dz / d) * sp; c.rest = true; }
        take = d < reach * 0.55;
      }
      if (take) {
        p.heal(p.stats.maxHp * 0.02); p.pc += 1; g.runStats.pcEarned += 1;
        g.audio.play('candy', 0.6);
        g.fx.glow.emit({ p: [c.x, c.y + 0.3, c.z], life: 0.3, s0: 0.8, s1: 0.1, c0: [1, 0.8, 0.9, 0.9], c1: [1, 0.5, 0.8, 0] });
      }
      if (take || c.t > CANDY_LIFE) { this.cs[i] = this.cs[this.cs.length - 1]; this.cs.pop(); continue; }
      const blink = c.t > CANDY_LIFE - 4 && Math.floor(c.t * 6) % 2 === 0 ? 0.001 : 1;
      _p.set(c.x, c.y, c.z); _q.setFromEuler(_e.set(0, c.ry + c.t * 1.5, 0.25)); _s.setScalar(blink);
      this.candy.setMatrixAt(n, _m.compose(_p, _q, _s)); this.candy.setColorAt(n, _c.set(c.col)); n++;
    }
    this.candy.count = n;
    if (n) { this.candy.instanceMatrix.needsUpdate = true; this.candy.instanceColor.needsUpdate = true; }
  }

  dispose() {
    this.g.scene.remove(this.conf, this.candy);
    this.chip.remove();
  }
}
