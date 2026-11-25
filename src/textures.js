// Procedural texture pack: every element, prop and ground surface gets
// generated maps (diffuse + normal) at load, so nothing ships as flat colour.
import * as THREE from 'three';
import { ANISO, track } from './aniso.js';
import { makeNoise } from './rng.js';

const cache = new Map();

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function toTexture(c, { repeat = 1, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = Math.max(4, ANISO.v); track(t);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// Fill a canvas from a per-pixel function returning [r,g,b,a] in 0..1.
function paint(size, fn) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const out = [0, 0, 0, 1];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      out[3] = 1;
      fn(x / size, y / size, out, x, y);
      const i = (y * size + x) * 4;
      d[i] = Math.max(0, Math.min(255, out[0] * 255));
      d[i + 1] = Math.max(0, Math.min(255, out[1] * 255));
      d[i + 2] = Math.max(0, Math.min(255, out[2] * 255));
      d[i + 3] = Math.max(0, Math.min(255, out[3] * 255));
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Height field -> tangent-space normal map (seamless with wrap).
function normalFromHeight(h, size, strength = 2) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      let nx = -dx, ny = -dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * size + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function heightField(size, fn) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = fn(x / size, y / size);
  return h;
}

const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export { rockMaps, barkMaps, terrainLayers, macroNoise, sprayMaps, ringMaps, cactusMaps, blobTexture } from './texgen.js';
// ---------- Ice (Frost ability) ----------
export function iceMaps() {
  if (cache.has('ice')) return cache.get('ice');
  const size = 256, P = 6;
  const n = makeNoise(31, P);
  const h = heightField(size, (u, v) => n.ridged(u * P, v * P, 4) * 0.6 + n.fbm(u * P * 2, v * P * 2, 3) * 0.4);
  const diff = paint(size, (u, v, o, x, y) => {
    const hv = h[y * size + x];
    const crack = Math.pow(n.ridged(u * P * 3 + 5, v * P * 3, 2), 10);
    o[0] = 0.55 + hv * 0.25 + crack * 0.4;
    o[1] = 0.78 + hv * 0.18 + crack * 0.3;
    o[2] = 0.95 + crack * 0.05;
  });
  const res = { map: toTexture(diff), normalMap: toTexture(normalFromHeight(h, size, 4), { srgb: false }) };
  cache.set('ice', res);
  return res;
}

// ---------- Lava (volcanic ground, Magmaw, fire scorch glow) ----------
export function lavaMap() {
  if (cache.has('lava')) return cache.get('lava');
  const size = 256, P = 6;
  const n = makeNoise(77, P);
  const c = paint(size, (u, v, o) => {
    const r = n.ridged(u * P, v * P, 5);
    const hot = Math.pow(r, 3);
    o[0] = 0.25 + hot * 1.2;
    o[1] = 0.03 + Math.pow(hot, 2) * 0.7;
    o[2] = Math.pow(hot, 4) * 0.2;
  });
  const t = toTexture(c);
  cache.set('lava', t);
  return t;
}

// ---------- Ground detail per biome ----------
export function groundMaps(biome) {
  const key = 'ground-' + biome.id;
  if (cache.has(key)) return cache.get(key);
  const size = 512, P = 16;
  const n = makeNoise(biome.seedTex, P);
  const n2 = makeNoise(biome.seedTex + 1, P * 4);
  const h = heightField(size, (u, v) => {
    let hv = n.fbm(u * P, v * P, 5) * 0.6 + n2.fbm(u * P * 4, v * P * 4, 3) * 0.4;
    if (biome.ground === 'cracked') hv -= Math.pow(n.ridged(u * P * 0.5, v * P * 0.5, 3), 8) * 0.8;
    if (biome.ground === 'pebbles') hv += Math.pow(n2.noise2(u * P * 6, v * P * 6), 6) * 0.9;
    return hv;
  });
  const [c1, c2, c3] = biome.groundCols;
  const diff = paint(size, (u, v, o, x, y) => {
    const hv = h[y * size + x];
    const m = n.fbm(u * P * 0.5 + 9, v * P * 0.5, 3);
    const t = clamp01(hv * 1.4 - 0.2);
    for (let i = 0; i < 3; i++) o[i] = mix(mix(c1[i], c2[i], t), c3[i], clamp01((m - 0.5) * 3));
    if (biome.ground === 'cracked') {
      const crack = Math.pow(n.ridged(u * P * 0.5, v * P * 0.5, 3), 8);
      o[0] = mix(o[0], biome.crackCol[0], crack);
      o[1] = mix(o[1], biome.crackCol[1], crack);
      o[2] = mix(o[2], biome.crackCol[2], crack);
    }
  });
  const res = {
    map: toTexture(diff, { repeat: 1 }),
    normalMap: toTexture(normalFromHeight(h, size, 5), { srgb: false, repeat: 1 }),
  };
  cache.set(key, res);
  return res;
}

export function crateMaps() {
  if (cache.has('crate')) return cache.get('crate');
  const size = 256;
  const n = makeNoise(13, 4);
  const h = new Float32Array(size * size);
  const diff = paint(size, (u, v, o, x, y) => {
    const plank = Math.floor(v * 5);
    const grain = n.fbm(u * 3 + plank * 7, v * 40, 4);
    const edge = Math.min(Math.abs(v * 5 - Math.round(v * 5)), 1) < 0.04 ? 1 : 0;
    const band = (u < 0.09 || u > 0.91 || v < 0.09 || v > 0.91) ? 1 : 0;
    const rivet = band && ((Math.hypot((u % 0.2) - 0.1, (v % 0.2) - 0.1) < 0.025)) ? 1 : 0;
    let r = 0.45 + grain * 0.35, g = 0.3 + grain * 0.22, b = 0.16 + grain * 0.1;
    if (edge) { r *= 0.4; g *= 0.4; b *= 0.4; }
    if (band) { r = 0.32; g = 0.33; b = 0.36; const k = 0.8 + grain * 0.3; r *= k; g *= k; b *= k; }
    if (rivet) { r = g = b = 0.7; }
    o[0] = r; o[1] = g; o[2] = b;
    h[y * size + x] = band ? 0.8 + rivet * 0.4 : grain * 0.4 - edge * 0.5;
  });
  const res = { map: toTexture(diff), normalMap: toTexture(normalFromHeight(h, size, 3), { srgb: false }) };
  cache.set('crate', res);
  return res;
}

// ---------- Sprites for particles ----------
function sprite(key, size, fn) {
  if (cache.has(key)) return cache.get(key);
  const c = paint(size, fn);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

export function flameSprite() {
  const n = makeNoise(3, 6);
  return sprite('flame', 128, (u, v, o) => {
    const dx = (u - 0.5) * 2, dy = (v - 0.5) * 2;
    const r = Math.hypot(dx, dy * 0.85);
    const turb = n.fbm(u * 6, v * 6, 4);
    const a = clamp01((1 - r) * 1.6 - 0.25 + (turb - 0.5) * 0.9);
    o[0] = o[1] = o[2] = 1;
    o[3] = Math.pow(a, 1.4);
  });
}

export function smokeSprite() {
  const n = makeNoise(11, 8);
  return sprite('smoke', 128, (u, v, o) => {
    const dx = (u - 0.5) * 2, dy = (v - 0.5) * 2;
    const r = Math.hypot(dx, dy);
    const turb = n.fbm(u * 8, v * 8, 5);
    const a = clamp01((1 - r) * 1.3 - 0.1) * clamp01(turb * 1.6 - 0.2);
    const k = 0.75 + turb * 0.25;
    o[0] = o[1] = o[2] = k;
    o[3] = a;
  });
}

export function glowSprite() {
  return sprite('glow', 64, (u, v, o) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    o[0] = o[1] = o[2] = 1;
    o[3] = Math.pow(clamp01(1 - r), 2.2);
  });
}

export function plusSprite() {
  return sprite('plus', 64, (u, v, o) => {
    const x = Math.abs(u - 0.5) * 2, y = Math.abs(v - 0.5) * 2;
    // A rounded medical cross with a soft glow around it.
    const arm = 0.26, len = 0.78;
    const dx = Math.max(0, Math.min(x, y) - arm), dy = Math.max(0, Math.max(x, y) - len);
    const d = Math.hypot(dx, dy);
    const core = d < 0.02 ? 1 : 0;
    o[0] = o[1] = o[2] = 1;
    o[3] = clamp01(core + Math.exp(-d * 9) * 0.55);
  });
}

export function sparkSprite() {
  return sprite('spark', 32, (u, v, o) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    o[0] = o[1] = o[2] = 1;
    o[3] = clamp01(1 - r) ** 4 + (r < 0.25 ? 0.6 : 0);
  });
}

export function shardSprite() {
  // Snow/ice glint: a four-point star.
  return sprite('shard', 64, (u, v, o) => {
    const dx = Math.abs(u - 0.5) * 2, dy = Math.abs(v - 0.5) * 2;
    const star = Math.max(clamp01(1 - dx * 6 - dy), clamp01(1 - dy * 6 - dx));
    const core = clamp01(1 - Math.hypot(dx, dy) * 2.2);
    o[0] = o[1] = o[2] = 1;
    o[3] = Math.max(star, core * core);
  });
}

export function streakSprite() {
  // Soft horizontal streak used for wind and tracers.
  return sprite('streak', 64, (u, v, o) => {
    const dy = Math.abs(v - 0.5) * 2;
    const dx = Math.abs(u - 0.5) * 2;
    o[0] = o[1] = o[2] = 1;
    o[3] = clamp01(1 - dy) ** 3 * clamp01(1 - dx) ** 1.2;
  });
}

export function debrisSprite() {
  const n = makeNoise(19, 4);
  return sprite('debris', 64, (u, v, o) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const edge = 0.7 + (n.noise2(u * 4, v * 4) - 0.5) * 0.6;
    const k = 0.5 + n.fbm(u * 8, v * 8, 3) * 0.5;
    o[0] = 0.5 * k; o[1] = 0.42 * k; o[2] = 0.33 * k;
    o[3] = r < edge ? 1 : 0;
  });
}

// Lightning ribbon: bright core, soft glow across V.
export function boltTexture() {
  return sprite('bolt', 64, (u, v, o) => {
    const d = Math.abs(v - 0.5) * 2;
    const core = clamp01(1 - d * 5);
    const glow = Math.pow(clamp01(1 - d), 3);
    o[0] = mix(0.55, 1, core); o[1] = mix(0.7, 1, core); o[2] = 1;
    o[3] = Math.max(core, glow * 0.7);
  });
}

// ---------- Decals ----------
export function scorchDecal() {
  const n = makeNoise(21, 6);
  return sprite('scorch', 256, (u, v, o) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const turb = n.fbm(u * 6, v * 6, 5);
    const a = clamp01((1 - r) * 1.5 + (turb - 0.5) * 0.9 - 0.15);
    const ember = Math.pow(clamp01(n.ridged(u * 10, v * 10, 3) - 0.55) * 2, 3) * clamp01(1 - r * 1.4);
    o[0] = 0.05 + ember * 1.0; o[1] = 0.04 + ember * 0.35; o[2] = 0.03;
    o[3] = a * 0.92;
  });
}

// Blood splat on the ground: one ragged pool with a scatter of droplets around it.
export function bloodDecal() {
  const n = makeNoise(33, 6);
  return sprite('blood', 256, (u, v, o) => {
    const dx = u - 0.5, dy = v - 0.5, r = Math.hypot(dx, dy) * 2;
    const turb = n.fbm(u * 5, v * 5, 4);
    const pool = clamp01((1 - r * 1.35) * 1.6 + (turb - 0.5) * 1.3);
    const drops = Math.pow(clamp01(n.ridged(u * 14, v * 14, 2) - 0.62) * 2.8, 2) * clamp01(1.25 - r) * clamp01(r * 2.5 - 0.6);
    const a = clamp01(pool + drops);
    const wet = clamp01(pool * 1.4);
    o[0] = 0.22 + wet * 0.3; o[1] = 0.015; o[2] = 0.02 + wet * 0.02;
    o[3] = a * 0.95;
  });
}

export function frostDecal() {
  const n = makeNoise(41, 8);
  return sprite('frost', 256, (u, v, o) => {
    const dx = u - 0.5, dy = v - 0.5;
    const r = Math.hypot(dx, dy) * 2;
    const ang = Math.atan2(dy, dx);
    const rays = Math.pow(Math.abs(Math.cos(ang * 9 + n.fbm(u * 4, v * 4, 3) * 4)), 30);
    const cr = Math.pow(n.ridged(u * 12, v * 12, 3), 6);
    const a = clamp01((1 - r) * 1.6 - 0.2) * (0.35 + cr * 0.6 + rays * 0.5);
    o[0] = 0.8; o[1] = 0.93; o[2] = 1;
    o[3] = a;
  });
}

export function ringDecal() {
  return sprite('ring', 256, (u, v, o) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const ring = clamp01(1 - Math.abs(r - 0.92) * 18);
    const fill = r < 0.92 ? 0.22 + 0.15 * Math.pow(r, 4) : 0;
    o[0] = o[1] = o[2] = 1;
    o[3] = Math.max(ring, fill);
  });
}

export function crackDecal() {
  const n = makeNoise(51, 8);
  return sprite('crack', 256, (u, v, o) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const c = Math.pow(n.ridged(u * 6, v * 6, 4), 9);
    o[0] = 0.08; o[1] = 0.06; o[2] = 0.05;
    o[3] = clamp01(c * 1.6) * clamp01(1.2 - r);
  });
}

// Coin icon used in the HUD and shop.
export function coinDataURL() {
  const c = canvas(64);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(26, 24, 4, 32, 32, 30);
  grd.addColorStop(0, '#fff6c2'); grd.addColorStop(0.5, '#f5c242'); grd.addColorStop(1, '#a86b12');
  g.fillStyle = grd; g.beginPath(); g.arc(32, 32, 28, 0, 7); g.fill();
  g.strokeStyle = '#7a4a08'; g.lineWidth = 3; g.stroke();
  g.fillStyle = '#7a4a08'; g.font = 'bold 23px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('PC', 32, 34);
  return c.toDataURL();
}
