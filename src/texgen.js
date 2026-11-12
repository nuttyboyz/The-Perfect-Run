// Heavier procedural texture generators (terrain layers, rock, bark, foliage sprays) used by textures.js.
// Everything is generated into raw byte arrays (DataTexture) so alpha channels carry real data
// (height / roughness) without canvas premultiplication, and so loading stays quick.
import * as THREE from 'three';
import { hashInt, mulberry32 } from './rng.js';

const sm = (t) => t * t * (3 - 2 * t);
const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;
const step = (a, b, x) => c01((x - a) / (b - a));
const cache = new Map();

// Tileable value noise with independent periods per axis.
function tn(u, v, pu, pv, seed) {
  const x = u * pu, y = v * pv;
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = sm(x - ix), fy = sm(y - iy);
  const x0 = ((ix % pu) + pu) % pu, x1 = (x0 + 1) % pu, y0 = ((iy % pv) + pv) % pv, y1 = (y0 + 1) % pv;
  const a = hashInt(x0, y0, seed), b = hashInt(x1, y0, seed), c = hashInt(x0, y1, seed), d = hashInt(x1, y1, seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
function fbmT(u, v, pu, pv, oct, seed) {
  let a = 0.5, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * tn(u, v, pu << i, pv << i, seed + i * 31); n += a; a *= 0.5; }
  return s / n;
}
function ridgeT(u, v, pu, pv, oct, seed) {
  let a = 0.5, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { const r = 1 - Math.abs(tn(u, v, pu << i, pv << i, seed + i * 17) * 2 - 1); s += a * r * r; n += a; a *= 0.5; }
  return s / n;
}
const W = { f1: 0, f2: 0, id: 0 };
// Tileable cellular noise: nearest/second-nearest distance (in cells) and the nearest cell's id.
function worley(u, v, P, seed) {
  const x = u * P, y = v * P, ix = Math.floor(x), iy = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = ix + dx, cy = iy + dy, wx = ((cx % P) + P) % P, wy = ((cy % P) + P) % P;
    const px = cx + hashInt(wx, wy, seed), py = cy + hashInt(wx, wy, seed + 17);
    const d = Math.hypot(x - px, y - py);
    if (d < f1) { f2 = f1; f1 = d; id = hashInt(wx, wy, seed + 3); } else if (d < f2) f2 = d;
  }
  W.f1 = f1; W.f2 = f2; W.id = id;
  return W;
}

function dataTex(arr, size, srgb, aniso = 4) {
  const t = new THREE.DataTexture(arr, size, size, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

// Height -> tangent-space normal bytes (seamless), roughness in alpha.
function normalBytes(h, rough, size, strength) {
  const out = new Uint8Array(size * size * 4);
  const st = strength * (size / 256);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * st, dy = (at(x, y + 1) - at(x, y - 1)) * st;
    const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    out[i] = (-dx / l * 0.5 + 0.5) * 255; out[i + 1] = (-dy / l * 0.5 + 0.5) * 255; out[i + 2] = (1 / l * 0.5 + 0.5) * 255;
    out[i + 3] = c01(rough[y * size + x]) * 255;
  }
  return out;
}

// ---------- terrain layer kinds ----------
// Each fills o = [r, g, b, height, roughness]. c = palette [[r,g,b] x3]. Values in sRGB-ish 0..1.
const K = {};
const lerp3 = (o, a, b, t) => { o[0] = mix(a[0], b[0], t); o[1] = mix(a[1], b[1], t); o[2] = mix(a[2], b[2], t); };
const tintK = (o, k) => { o[0] *= k; o[1] *= k; o[2] *= k; };

K.grass = (u, v, s, c, o) => {
  const f = fbmT(u, v, 10, 10, 5, s), m = fbmT(u, v, 4, 4, 3, s + 9), sp = tn(u, v, 128, 128, s + 3), bl = tn(u, v, 48, 48, s + 5);
  const h = c01(0.5 * f + 0.3 * bl + 0.2 * sp);
  lerp3(o, c[0], c[1], c01((f - 0.3) * 1.8));
  const dry = c01((m - 0.55) * 4);
  o[0] = mix(o[0], c[2][0], dry); o[1] = mix(o[1], c[2][1], dry); o[2] = mix(o[2], c[2][2], dry);
  tintK(o, (0.62 + 0.75 * h) * (0.9 + 0.3 * sp));
  o[3] = h; o[4] = 0.9;
};
K.dirt = (u, v, s, c, o) => {
  const f = fbmT(u, v, 12, 12, 5, s), w = worley(u, v, 22, s + 4);
  const peb = c01(1 - w.f1 * 2.0) * step(0.4, 0.6, hashInt(w.id * 1e6 | 0, 3, s));
  const h = c01(0.55 * f + 0.45 * peb);
  lerp3(o, c[0], c[1], c01(f * 1.3 - 0.1));
  const k = peb * 0.28;
  o[0] = mix(o[0], c[2][0], k); o[1] = mix(o[1], c[2][1], k); o[2] = mix(o[2], c[2][2], k);
  tintK(o, 0.6 + 0.8 * h);
  o[3] = h; o[4] = 0.88 - peb * 0.2;
};
K.sand = (u, v, s, c, o) => {
  const f = fbmT(u, v, 4, 4, 3, s), rip = 0.5 + 0.5 * Math.sin((v * 16 + f * 5 + tn(u, v, 6, 6, s + 2) * 2) * Math.PI * 2);
  const grain = tn(u, v, 192, 192, s + 7), g2 = tn(u, v, 64, 64, s + 8);
  const h = c01(0.3 * rip * (0.6 + 0.4 * f) + 0.3 * g2 + 0.35 * grain * 0.6 + 0.2 * f);
  lerp3(o, c[0], c[1], c01(rip * 0.35 + grain * 0.35 + f * 0.4 - 0.15));
  const sh = c01((f - 0.55) * 3) * 0.5;
  o[0] = mix(o[0], c[2][0], sh); o[1] = mix(o[1], c[2][1], sh); o[2] = mix(o[2], c[2][2], sh);
  tintK(o, 0.85 + 0.3 * grain);
  o[3] = h; o[4] = 0.95;
};
K.rock = (u, v, s, c, o) => {
  const f = fbmT(u, v, 8, 8, 5, s), crack = Math.pow(ridgeT(u, v, 5, 5, 3, s + 9), 6);
  const w = worley(u, v, 6, s + 21), edge = 1 - step(0.0, 0.12, w.f2 - w.f1);
  const strata = 0.5 + 0.5 * Math.sin(v * 24 * Math.PI + fbmT(u, v, 6, 3, 3, s + 4) * 9);
  const grain = tn(u, v, 160, 160, s + 2);
  const h = c01(0.5 * f + 0.2 * strata + 0.15 * grain + 0.15 * (1 - crack) - edge * 0.35 - crack * 0.4);
  lerp3(o, c[0], c[1], c01(h * 1.2));
  const lich = c01((fbmT(u, v, 10, 10, 4, s + 33) - 0.6) * 5) * 0.55;
  o[0] = mix(o[0], c[2][0], lich); o[1] = mix(o[1], c[2][1], lich); o[2] = mix(o[2], c[2][2], lich);
  tintK(o, (0.7 + 0.6 * h) * (1 - edge * 0.4) * (0.94 + 0.12 * strata));
  o[3] = h; o[4] = 0.88;
};
K.snow = (u, v, s, c, o) => {
  const f = fbmT(u, v, 6, 6, 4, s), f2 = fbmT(u, v, 24, 24, 3, s + 5), sp = tn(u, v, 180, 180, s + 6);
  const h = c01(0.6 * f + 0.4 * f2);
  lerp3(o, c[0], c[1], c01(f * 1.4 - 0.1));
  const dip = c01((0.5 - h) * 2) * 0.5;
  o[0] = mix(o[0], c[2][0], dip); o[1] = mix(o[1], c[2][1], dip); o[2] = mix(o[2], c[2][2], dip);
  tintK(o, 0.94 + 0.08 * sp);
  o[3] = h; o[4] = 0.62 - sp * 0.12;
};
K.ice = (u, v, s, c, o) => {
  const f = fbmT(u, v, 5, 5, 4, s), cr = Math.pow(ridgeT(u, v, 7, 7, 3, s + 3), 5), cr2 = Math.pow(ridgeT(u, v, 19, 19, 2, s + 4), 7);
  const h = c01(0.7 * f + 0.15 - cr * 0.2);
  lerp3(o, c[0], c[1], c01(f * 1.3));
  const w = c01(cr * 0.8 + cr2 * 0.7);
  o[0] = mix(o[0], 0.95, w * 0.7); o[1] = mix(o[1], 0.98, w * 0.7); o[2] = mix(o[2], 1.0, w * 0.7);
  o[3] = h; o[4] = 0.14 + w * 0.35;
};
K.ash = (u, v, s, c, o) => {
  const f = fbmT(u, v, 16, 16, 5, s), g = tn(u, v, 140, 140, s + 2), m = fbmT(u, v, 3, 3, 3, s + 8);
  const h = c01(0.65 * f + 0.35 * g);
  lerp3(o, c[0], c[1], c01(h * 1.2 + (m - 0.5) * 0.5));
  const sp = step(0.86, 0.95, g) * 0.35;
  o[0] = mix(o[0], c[2][0], sp); o[1] = mix(o[1], c[2][1], sp); o[2] = mix(o[2], c[2][2], sp);
  tintK(o, 0.75 + 0.5 * h);
  o[3] = h; o[4] = 0.97;
};
// Dark plates split by thin cracks. Height ~0 inside cracks: the shader uses that for the glow mask.
function crackPlates(P, widthA, widthB) {
  return (u, v, s, c, o) => {
    const wob = fbmT(u, v, 6, 6, 4, s + 40), wob2 = fbmT(u, v, 9, 9, 3, s + 43);
    const wu = u + (wob - 0.5) * 0.14, wv = v + (wob2 - 0.5) * 0.14;
    const w = worley(wu, wv, P, s + 5);
    const gap = w.f2 - w.f1, id = w.id;
    // big plates are split again along a second, finer, sparser network
    const w2 = worley(wu + 0.31, wv + 0.17, P * 2, s + 9);
    const gap2 = (w2.f2 - w2.f1) * 0.5 + (hashInt(w2.id * 1e6 | 0, 2, s) < 0.55 ? 0.2 : 0);
    const g = Math.min(gap, gap2 * 1.2);
    const wide = 0.6 + 0.8 * fbmT(u, v, 5, 5, 3, s + 44);
    const crack = 1 - step(widthA * wide, widthB * wide, g + (fbmT(u, v, 32, 32, 2, s + 6) - 0.5) * 0.04);
    const f = fbmT(u, v, 12, 12, 5, s), gr = tn(u, v, 120, 120, s + 2);
    const tilt = 0.8 + 0.4 * id;
    const plate = c01(0.35 + 0.65 * (0.6 * f + 0.4 * gr)) * (0.5 + 0.5 * Math.min(1, g * 2.5)) * tilt;
    const h = plate * (1 - crack);
    lerp3(o, c[0], c[1], c01(f * 1.3 + (id - 0.5) * 0.4));
    tintK(o, 0.55 + 0.9 * h);
    o[0] = mix(o[0], c[2][0] * 1.2, crack); o[1] = mix(o[1], c[2][1] * 1.2, crack); o[2] = mix(o[2], c[2][2] * 1.2, crack);
    o[3] = Math.min(h, 1); o[4] = 0.8 - crack * 0.3;
  };
}
K.lavarock = crackPlates(5, 0.012, 0.06);
K.voidstone = crackPlates(6, 0.008, 0.045);
K.gravel = (u, v, s, c, o) => {
  const w = worley(u, v, 26, s + 4), f = fbmT(u, v, 8, 8, 3, s);
  const tone = hashInt(w.id * 1e6 | 0, 5, s);
  const bump = c01(1 - w.f1 * 1.5);
  const h = c01(bump * (0.55 + 0.45 * tone) * 0.85 + 0.1 * f);
  lerp3(o, c[0], c[1], tone);
  const cav = 1 - c01(bump * 2.0);
  tintK(o, (0.55 + 0.7 * bump) * (1 - cav * 0.3));
  o[0] = mix(o[0], c[2][0], cav * 0.5); o[1] = mix(o[1], c[2][1], cav * 0.5); o[2] = mix(o[2], c[2][2], cav * 0.5);
  o[3] = h; o[4] = 0.85;
};
K.moss = (u, v, s, c, o) => {
  const f = fbmT(u, v, 18, 18, 5, s), g = tn(u, v, 100, 100, s + 3), m = fbmT(u, v, 5, 5, 3, s + 9);
  const h = c01(0.7 * f + 0.3 * g);
  lerp3(o, c[0], c[1], c01(f * 1.5 - 0.1));
  const sp = c01((m - 0.6) * 4) * 0.5;
  o[0] = mix(o[0], c[2][0], sp); o[1] = mix(o[1], c[2][1], sp); o[2] = mix(o[2], c[2][2], sp);
  tintK(o, 0.65 + 0.7 * h);
  o[3] = h; o[4] = 1.0;
};
K.obsidian = (u, v, s, c, o) => {
  const w = worley(u, v, 5, s + 2), f = fbmT(u, v, 10, 10, 4, s), e = 1 - step(0.0, 0.18, w.f2 - w.f1);
  const h = c01(0.5 * f + 0.4 * (1 - e) + 0.1);
  lerp3(o, c[0], c[1], c01(f * 1.2));
  tintK(o, 0.6 + 0.6 * h + e * 0.5);
  o[3] = h; o[4] = 0.28 + e * 0.4;
};
K.dust = (u, v, s, c, o) => {
  const f = fbmT(u, v, 14, 14, 5, s), g = tn(u, v, 150, 150, s + 6), m = fbmT(u, v, 4, 4, 3, s + 1);
  const h = c01(0.6 * f + 0.4 * g);
  lerp3(o, c[0], c[1], c01(h + (m - 0.5) * 0.6));
  const sp = step(0.9, 0.97, g);
  o[0] = mix(o[0], c[2][0], sp * 0.6); o[1] = mix(o[1], c[2][1], sp * 0.6); o[2] = mix(o[2], c[2][2], sp * 0.6);
  tintK(o, 0.75 + 0.45 * h);
  o[3] = h; o[4] = 0.9;
};

export function layerTex(kind, colors, seed, size, withNormal, nStrength, aniso = 4) {
  const N = size * size, alb = new Uint8Array(N * 4), h = new Float32Array(N), ro = new Float32Array(N), o = [0, 0, 0, 0, 0];
  const fn = K[kind];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    fn(x / size, y / size, seed, colors, o);
    const i = y * size + x, j = i * 4;
    alb[j] = c01(o[0]) * 255; alb[j + 1] = c01(o[1]) * 255; alb[j + 2] = c01(o[2]) * 255; alb[j + 3] = c01(o[3]) * 255;
    h[i] = o[3]; ro[i] = o[4];
  }
  return { albedo: dataTex(alb, size, true, aniso), normal: withNormal ? dataTex(normalBytes(h, ro, size, nStrength), size, false, aniso) : null };
}

// Per-biome terrain recipe: four layers (A base, B secondary, S special, R cliff rock).
// scale = metres per texture tile, em = glow strength (cracks), rough = fallback when no normal map.
function recipe(biome) {
  const gc = biome.groundCols;
  const sc = (c, k) => c.map((x) => x * k);
  const dark = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  switch (biome.tex || biome.id) {
    case 'graveyard': return [
      { kind: 'grass', colors: [[0.13, 0.16, 0.08], [0.24, 0.26, 0.13], [0.36, 0.32, 0.18]], scale: 6.5, rough: 0.92 },
      { kind: 'dirt', colors: [[0.17, 0.12, 0.09], [0.27, 0.2, 0.14], [0.36, 0.34, 0.3]], scale: 5, rough: 0.8 },
      { kind: 'gravel', colors: [[0.2, 0.2, 0.19], [0.36, 0.35, 0.32], [0.07, 0.07, 0.07]], scale: 3.6, rough: 0.85 },
      { kind: 'rock', colors: [[0.26, 0.26, 0.27], [0.48, 0.47, 0.46], [0.22, 0.28, 0.16]], scale: 6, rough: 0.88 },
    ];
    case 'forest': return [
      { kind: 'grass', colors: [[0.07, 0.15, 0.05], [0.17, 0.3, 0.09], [0.3, 0.24, 0.1]], scale: 6, rough: 0.92 },
      { kind: 'dirt', colors: [[0.14, 0.09, 0.05], [0.26, 0.17, 0.09], [0.22, 0.2, 0.15]], scale: 4.5, rough: 0.78 },
      { kind: 'moss', colors: [[0.07, 0.16, 0.06], [0.17, 0.3, 0.1], [0.3, 0.36, 0.14]], scale: 4, rough: 1.0 },
      { kind: 'rock', colors: [[0.24, 0.25, 0.23], [0.46, 0.46, 0.42], [0.18, 0.3, 0.12]], scale: 6, rough: 0.9 },
    ];
    case 'meadow': return [
      { kind: 'grass', colors: [[0.1, 0.22, 0.05], [0.24, 0.42, 0.1], [0.36, 0.4, 0.12]], scale: 6, rough: 0.92 },
      { kind: 'dirt', colors: [[0.22, 0.16, 0.09], [0.38, 0.29, 0.17], [0.46, 0.4, 0.3]], scale: 4.5, rough: 0.8 },
      { kind: 'moss', colors: [[0.12, 0.26, 0.07], [0.27, 0.45, 0.12], [0.42, 0.5, 0.18]], scale: 4, rough: 1.0 },
      { kind: 'rock', colors: [[0.3, 0.3, 0.28], [0.52, 0.52, 0.48], [0.26, 0.38, 0.16]], scale: 6, rough: 0.9 },
    ];
    case 'springs': return [
      { kind: 'grass', colors: [[0.1, 0.26, 0.06], [0.26, 0.46, 0.11], [0.4, 0.44, 0.14]], scale: 6, rough: 0.92 },
      { kind: 'dirt', colors: [[0.2, 0.15, 0.09], [0.36, 0.28, 0.17], [0.5, 0.44, 0.33]], scale: 4.5, rough: 0.8 },
      { kind: 'moss', colors: [[0.1, 0.26, 0.09], [0.24, 0.44, 0.14], [0.4, 0.52, 0.2]], scale: 4, rough: 1.0 },
      { kind: 'rock', colors: [[0.34, 0.34, 0.32], [0.58, 0.57, 0.52], [0.3, 0.42, 0.2]], scale: 6, rough: 0.9 },
    ];
    case 'space': return [
      { kind: 'dust', colors: [[0.3, 0.3, 0.32], [0.46, 0.46, 0.48], [0.6, 0.6, 0.62]], scale: 5, rough: 0.95 },
      { kind: 'rock', colors: [[0.22, 0.22, 0.24], [0.4, 0.4, 0.42], [0.58, 0.58, 0.6]], scale: 6, rough: 0.9 },
      { kind: 'dust', colors: [[0.36, 0.36, 0.38], [0.52, 0.52, 0.54], [0.7, 0.7, 0.72]], scale: 4, rough: 0.93 },
      { kind: 'rock', colors: [[0.18, 0.18, 0.2], [0.34, 0.34, 0.36], [0.5, 0.5, 0.52]], scale: 6, rough: 0.88 },
    ];
    case 'dunes': return [
      { kind: 'sand', colors: [[0.74, 0.56, 0.3], [0.93, 0.76, 0.44], [0.6, 0.42, 0.22]], scale: 8, rough: 0.95 },
      { kind: 'sand', colors: [[0.88, 0.68, 0.4], [0.98, 0.84, 0.54], [0.74, 0.54, 0.3]], scale: 5, rough: 0.9 },
      { kind: 'sand', colors: [[0.84, 0.6, 0.32], [0.95, 0.72, 0.4], [0.7, 0.46, 0.24]], scale: 6, rough: 0.95 },
      { kind: 'rock', colors: [[0.5, 0.3, 0.18], [0.82, 0.54, 0.32], [0.65, 0.5, 0.34]], scale: 7, rough: 0.9 },
    ];
    case 'frost': return [
      { kind: 'snow', colors: [[0.84, 0.9, 0.97], [0.98, 0.99, 1.0], [0.66, 0.78, 0.92]], scale: 7, rough: 0.6 },
      { kind: 'ice', colors: [[0.5, 0.72, 0.92], [0.74, 0.9, 1.0], [0.94, 0.98, 1.0]], scale: 8, rough: 0.18 },
      { kind: 'snow', colors: [[0.92, 0.95, 1.0], [1.0, 1.0, 1.0], [0.78, 0.86, 0.96]], scale: 4.5, rough: 0.55 },
      { kind: 'rock', colors: [[0.42, 0.52, 0.66], [0.66, 0.76, 0.88], [0.82, 0.9, 0.97]], scale: 6, rough: 0.85 },
    ];
    case 'desert': return [
      { kind: 'sand', colors: [[0.6, 0.45, 0.27], [0.8, 0.64, 0.4], [0.46, 0.32, 0.19]], scale: 8, rough: 0.95 },
      { kind: 'dirt', colors: [[0.45, 0.29, 0.17], [0.62, 0.42, 0.25], [0.7, 0.58, 0.42]], scale: 5.5, rough: 0.9 },
      { kind: 'sand', colors: [[0.78, 0.64, 0.44], [0.92, 0.8, 0.58], [0.62, 0.48, 0.3]], scale: 6, rough: 0.95 },
      { kind: 'rock', colors: [[0.4, 0.22, 0.13], [0.7, 0.44, 0.26], [0.55, 0.4, 0.25]], scale: 7, rough: 0.9 },
    ];
    case 'frozen': return [
      { kind: 'snow', colors: [[0.82, 0.88, 0.95], [0.97, 0.98, 1.0], [0.6, 0.72, 0.88]], scale: 7, rough: 0.6 },
      { kind: 'ice', colors: [[0.45, 0.65, 0.85], [0.7, 0.86, 0.98], [0.9, 0.96, 1.0]], scale: 6, rough: 0.2 },
      { kind: 'snow', colors: [[0.9, 0.94, 1.0], [1.0, 1.0, 1.0], [0.72, 0.82, 0.94]], scale: 4.5, rough: 0.55 },
      { kind: 'rock', colors: [[0.2, 0.22, 0.27], [0.44, 0.47, 0.53], [0.7, 0.76, 0.82]], scale: 6, rough: 0.88 },
    ];
    case 'volcanic': return [
      { kind: 'lavarock', colors: [[0.07, 0.06, 0.06], [0.16, 0.13, 0.12], biome.crackCol], scale: 7, rough: 0.8, em: 1 },
      { kind: 'ash', colors: [[0.07, 0.065, 0.065], [0.17, 0.15, 0.14], [0.3, 0.27, 0.25]], scale: 6, rough: 0.97 },
      { kind: 'ash', colors: [[0.18, 0.17, 0.17], [0.34, 0.32, 0.31], [0.5, 0.45, 0.42]], scale: 5, rough: 0.97 },
      { kind: 'lavarock', colors: [[0.09, 0.075, 0.07], [0.2, 0.16, 0.14], biome.crackCol], scale: 5, rough: 0.85, em: 0.7 },
    ];
    default: return [
      { kind: 'voidstone', colors: [[0.06, 0.04, 0.1], [0.13, 0.09, 0.2], biome.crackCol], scale: 6.5, rough: 0.7, em: 0.7 },
      { kind: 'dust', colors: [[0.08, 0.06, 0.13], [0.2, 0.15, 0.3], [0.45, 0.35, 0.6]], scale: 5, rough: 0.9 },
      { kind: 'dust', colors: [[0.18, 0.14, 0.28], [0.35, 0.28, 0.5], [0.6, 0.5, 0.8]], scale: 4, rough: 0.9 },
      { kind: 'obsidian', colors: [[0.04, 0.03, 0.07], [0.12, 0.09, 0.18], [0.3, 0.2, 0.5]], scale: 6, rough: 0.35 },
    ];
  }
}

export function terrainLayers(biome, q) {
  const key = 'terrain-' + biome.id + '-' + q;
  if (cache.has(key)) return cache.get(key);
  const sizes = q >= 2 ? [512, 384, 256, 384] : q === 1 ? [384, 256, 256, 256] : [256, 256, 128, 256];
  const rc = recipe(biome);
  const lift = { graveyard: 1.5, forest: 1.4, abyss: 2.0, volcanic: 2.0, desert: 1.05, frozen: 1.0, meadow: 1.15, dunes: 1.05, frost: 1.0, springs: 1.15, space: 1.6, crypt: 1.5 }[biome.id] || 1;
  const layers = rc.map((r, i) => {
    r = { ...r, colors: r.colors.map((c, k) => (r.em && k === 2 ? c : c.map((v) => Math.min(1, v * lift)))) };
    const t = layerTex(r.kind, r.colors, biome.seedTex * 3 + i * 101, sizes[i], q >= 2 || (q === 1 && (i === 0 || i === 3)), r.kind === 'ice' ? 3 : r.kind === 'snow' ? 2.5 : 5, q >= 2 ? 4 : q === 1 ? 2 : 1);
    return { ...t, scale: r.scale, rough: r.rough, em: r.em || 0 };
  });
  const res = { layers };
  cache.set(key, res);
  return res;
}

// Low-frequency noise for macro colour variation and sky clouds: R/G/B/A at four scales.
export function macroNoise() {
  if (cache.has('macro')) return cache.get('macro');
  const size = 256, a = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, i = (y * size + x) * 4;
    a[i] = fbmT(u, v, 3, 3, 5, 11) * 255; a[i + 1] = fbmT(u, v, 7, 7, 4, 23) * 255; a[i + 2] = fbmT(u, v, 17, 17, 3, 37) * 255; a[i + 3] = fbmT(u, v, 4, 4, 6, 53) * 255;
  }
  const t = dataTex(a, size, false);
  cache.set('macro', t);
  return t;
}

// ---------- rock (props, arena, abilities) ----------
function rockHeight(seed, size) {
  const key = 'rockh' + seed + '_' + size;
  if (cache.has(key)) return cache.get(key);
  const h = new Float32Array(size * size), strata = new Float32Array(size * size), lich = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, i = y * size + x;
    const f = fbmT(u, v, 6, 6, 5, seed), crack = Math.pow(ridgeT(u, v, 4, 4, 3, seed + 9), 6);
    const w = worley(u, v, 5, seed + 21), edge = 1 - step(0.0, 0.1, w.f2 - w.f1);
    const st = 0.5 + 0.5 * Math.sin(v * 22 * Math.PI + fbmT(u, v, 5, 3, 3, seed + 4) * 9);
    const grain = tn(u, v, 128, 128, seed + 2) * 0.5 + tn(u, v, 64, 64, seed + 6) * 0.5;
    h[i] = c01(0.5 * f + 0.14 * st + 0.18 * grain + 0.18 * (1 - crack) - edge * 0.3 - crack * 0.4);
    strata[i] = st;
    lich[i] = c01((fbmT(u, v, 9, 9, 4, seed + 33) - 0.6) * 5);
  }
  const res = { h, strata, lich, normal: dataTex(normalBytes(h, new Float32Array(size * size).fill(0.9), size, 6), size, false) };
  cache.set(key, res);
  return res;
}

export function rockMaps(tint = [0.42, 0.38, 0.33], seed = 7) {
  const key = 'rock' + tint.join() + seed;
  if (cache.has(key)) return cache.get(key);
  const size = 512, r = rockHeight(seed, size), a = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const hv = r.h[i], k = 0.5 + hv * 0.75 + (r.strata[i] - 0.5) * 0.1, l = r.lich[i] * 0.4, j = i * 4;
    a[j] = c01(mix(tint[0] * k, 0.33, l)) * 255; a[j + 1] = c01(mix(tint[1] * k, 0.4, l)) * 255; a[j + 2] = c01(mix(tint[2] * k, 0.25, l)) * 255; a[j + 3] = 255;
  }
  const res = { map: dataTex(a, size, true), normalMap: r.normal };
  cache.set(key, res);
  return res;
}

// ---------- bark ----------
export function barkMaps(tint = [0.25, 0.18, 0.12]) {
  const key = 'bark' + tint.join();
  if (cache.has(key)) return cache.get(key);
  const size = 256, h = new Float32Array(size * size), a = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, i = y * size + x;
    const f = fbmT(u, v, 10, 3, 5, 5), ridge = Math.pow(1 - Math.abs(tn(u + fbmT(u, v, 4, 2, 2, 8) * 0.06, v, 12, 4, 15) * 2 - 1), 2.2);
    const fine = tn(u, v, 64, 32, 21);
    h[i] = c01(0.4 * f + 0.45 * ridge + 0.15 * fine);
  }
  const lichen = (u, v) => c01((fbmT(u, v, 6, 6, 3, 61) - 0.62) * 6);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, j = i * 4, u = x / size, v = y / size, hv = h[i], l = lichen(u, v) * 0.35;
    const k = 0.32 + hv * 1.0;
    a[j] = c01(mix(tint[0] * k, 0.28, l)) * 255; a[j + 1] = c01(mix(tint[1] * k, 0.34, l)) * 255; a[j + 2] = c01(mix(tint[2] * k, 0.2, l)) * 255; a[j + 3] = 255;
  }
  const res = { map: dataTex(a, size, true), normalMap: dataTex(normalBytes(h, new Float32Array(size * size).fill(0.9), size, 7), size, false) };
  cache.set(key, res);
  return res;
}

// Wood end-grain rings for sawn log ends and stumps.
export function ringMaps() {
  if (cache.has('rings')) return cache.get('rings');
  const size = 128, a = new Uint8Array(size * size * 4), h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size - 0.5, v = y / size - 0.5, r = Math.hypot(u, v) * 2 + (tn(x / size, y / size, 8, 8, 3) - 0.5) * 0.15;
    const ring = 0.5 + 0.5 * Math.sin(r * 38), i = y * size + x, j = i * 4;
    h[i] = ring * 0.6;
    const k = 0.55 + ring * 0.35 - r * 0.12;
    a[j] = c01(0.55 * k) * 255; a[j + 1] = c01(0.4 * k) * 255; a[j + 2] = c01(0.24 * k) * 255; a[j + 3] = 255;
  }
  const res = { map: dataTex(a, size, true), normalMap: dataTex(normalBytes(h, new Float32Array(size * size).fill(0.9), size, 3), size, false) };
  cache.set('rings', res);
  return res;
}

// Ribbed cactus skin with spine dots.
export function cactusMaps() {
  if (cache.has('cactus')) return cache.get('cactus');
  const size = 128, a = new Uint8Array(size * size * 4), h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, i = y * size + x, j = i * 4;
    const rib = 0.5 + 0.5 * Math.cos(u * Math.PI * 2 * 8), f = fbmT(u, v, 8, 8, 4, 4);
    const sp = worley(u * 1, v * 1, 14, 9), spine = sp.f1 < 0.12 && rib > 0.7 ? 1 : 0;
    h[i] = rib * 0.8 + f * 0.2;
    const k = 0.6 + rib * 0.4 + (f - 0.5) * 0.4;
    a[j] = c01(mix(0.2 * k, 0.8, spine)) * 255; a[j + 1] = c01(mix(0.4 * k, 0.75, spine)) * 255; a[j + 2] = c01(mix(0.18 * k, 0.55, spine)) * 255; a[j + 3] = 255;
  }
  const res = { map: dataTex(a, size, true), normalMap: dataTex(normalBytes(h, new Float32Array(size * size).fill(0.7), size, 4), size, false) };
  cache.set('cactus', res);
  return res;
}

// ---------- foliage sprays (alpha-tested cards) ----------
function cvs(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function sprayTex(c, srgb) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Draw the same strokes on a colour canvas (opaque background) and an alpha canvas (white on black).
function dual(w, h, bg, fn) {
  const cc = cvs(w, h), ca = cvs(w, h), a = cc.getContext('2d'), b = ca.getContext('2d');
  a.fillStyle = bg; a.fillRect(0, 0, w, h);
  b.fillStyle = '#000'; b.fillRect(0, 0, w, h);
  for (const g of [a, b]) { g.lineCap = 'round'; g.lineJoin = 'round'; }
  fn({
    line(x0, y0, x1, y1, lw, col) { a.strokeStyle = col; a.lineWidth = lw; a.beginPath(); a.moveTo(x0, y0); a.lineTo(x1, y1); a.stroke(); b.strokeStyle = '#fff'; b.lineWidth = lw; b.beginPath(); b.moveTo(x0, y0); b.lineTo(x1, y1); b.stroke(); },
    path(pts, col, grad) {
      const mk = (g, fill) => { g.fillStyle = fill; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) { const p = pts[i]; if (p.length === 4) g.quadraticCurveTo(p[0], p[1], p[2], p[3]); else g.lineTo(p[0], p[1]); } g.closePath(); g.fill(); };
      let f = col;
      if (grad) { f = a.createLinearGradient(grad[0], grad[1], grad[2], grad[3]); f.addColorStop(0, col[0]); f.addColorStop(1, col[1]); }
      mk(a, f); mk(b, '#fff');
    },
  });
  const map = sprayTex(cc, true), alphaMap = sprayTex(ca, false);
  return { map, alphaMap };
}

export function sprayMaps(kind, seed = 3) {
  const key = 'spray-' + kind;
  if (cache.has(key)) return cache.get(key);
  const rnd = mulberry32(seed + kind.length * 13);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  let res;
  if (kind === 'pine' || kind === 'snowpine') {
    const snow = kind === 'snowpine';
    const W = 128, H = 256;
    const greens = snow ? ['#2d5a38', '#356a40', '#244c30', '#e6eef2', '#d2e0e8', '#f4f8fa', '#bfd2de'] : ['#1b4425', '#235a2e', '#2e6c38', '#17381f', '#357a3d', '#2a6030'];
    res = dual(W, H, snow ? '#4a6a58' : '#1d4a26', (d) => {
      const cx = W / 2;
      d.line(cx, H - 2, cx + 3, H * 0.04, 4.5, snow ? '#4b4034' : '#3a2a1a');
      for (let pass = 0; pass < 2; pass++) {
        for (let y = H - 8; y > H * 0.07; y -= pass ? 3.4 : 5.2) {
          const t = 1 - y / H;
          const env = (0.38 + 0.62 * Math.sin(Math.min(1, t * 1.05 + 0.1) * Math.PI * 0.92 + 0.15)) * (W * 0.46) * (1 - t * 0.28);
          for (const side of [-1, 1]) {
            const ang = (0.95 + rnd() * 0.45) + t * 0.15;
            const len = env * (0.75 + rnd() * 0.35) * (pass ? 0.7 : 1);
            const x1 = cx + side * Math.sin(ang) * len, y1 = y - Math.cos(ang) * len * 0.55 + len * 0.25;
            const col = snow && (t > 0.15 && rnd() < 0.55) ? pick(greens.slice(3)) : pick(greens.slice(0, snow ? 3 : greens.length));
            d.line(cx + 1, y, x1, y1, pass ? 2.1 : 2.8, col);
          }
        }
      }
    });
  } else if (kind === 'leaf' || kind === 'twisted') {
    const W = 128, H = 128;
    const pal = kind === 'twisted' ? ['#3b2a4a', '#4a3560', '#2b1f3a', '#58427a', '#33264a'] : ['#2f5a22', '#3f7a2c', '#25481b', '#4e8a34'];
    res = dual(W, H, kind === 'twisted' ? '#2f2340' : '#2a4d1e', (d) => {
      for (let i = 0; i < 46; i++) {
        const x = 10 + rnd() * (W - 20), y = 10 + rnd() * (H - 20), a = rnd() * Math.PI * 2, L = 13 + rnd() * 10, Wd = 5 + rnd() * 3.5;
        const ca = Math.cos(a), sa = Math.sin(a);
        const P = (px, py) => [x + px * ca - py * sa, y + px * sa + py * ca];
        const tip = P(L, 0), tail = P(-L * 0.2, 0), t1 = P(L * 0.4, -Wd), t2 = P(L * 0.4, Wd);
        d.path([[tail[0], tail[1]], [t1[0], t1[1], tip[0], tip[1]], [t2[0], t2[1], tail[0], tail[1]]], pick(pal));
        d.line(tail[0], tail[1], tip[0], tip[1], 0.9, 'rgba(0,0,0,0.35)');
      }
    });
  } else if (kind === 'grass' || kind === 'deadgrass' || kind === 'drygrass' || kind === 'frostgrass') {
    const W = 128, H = 128;
    const pals = {
      grass: [['#356a1e', '#7bb83c'], ['#3a7522', '#9fd050'], ['#2e5a1a', '#68a040']],
      deadgrass: [['#5a5030', '#a89858'], ['#6a5e38', '#c4b476'], ['#463e24', '#8a7c46']],
      drygrass: [['#7a6334', '#d8c483'], ['#8f7840', '#e6d79b'], ['#6a5530', '#c4ae6c']],
      frostgrass: [['#7a8e86', '#d8e6e6'], ['#8ea298', '#f2f8f8'], ['#6a7c74', '#bccece']],
    }[kind];
    res = dual(W, H, pals[0][0], (d) => {
      for (let i = 0; i < 26; i++) {
        const bx = 14 + rnd() * (W - 28), h = H * (0.45 + rnd() * 0.5), lean = (rnd() - 0.5) * 46, w = 3 + rnd() * 3.2;
        const tx = bx + lean, ty = H - h, cx = bx + lean * 0.25, cy = H - h * 0.55;
        d.path([[bx - w, H], [cx - w * 0.5, cy, tx, ty], [cx + w * 0.5, cy, bx + w, H]], pick(pals), [0, H, 0, ty]);
      }
    });
  } else if (kind === 'fern') {
    const W = 128, H = 128;
    const greens = ['#1f4a1a', '#2b5f22', '#357328', '#25541d'];
    res = dual(W, H, '#1f4a1a', (d) => {
      for (let f = 0; f < 6; f++) {
        const a0 = -0.4 + f * 0.16 + (rnd() - 0.5) * 0.1, L = H * (0.62 + rnd() * 0.3), bx = W / 2 + (rnd() - 0.5) * 16;
        let px = bx, py = H - 2, ang = Math.PI / 2 - a0 * 1.3;
        const N = 18;
        for (let i = 0; i < N; i++) {
          const t = i / N;
          ang += 0.045 * (1 + t * 1.5) * (a0 < 0 ? -1 : 1);
          const nx = px + Math.cos(ang) * L / N, ny = py - Math.sin(ang) * L / N;
          d.line(px, py, nx, ny, 2.2 - t * 1.1, '#3a5a22');
          const ll = (W * 0.2) * Math.sin(Math.min(1, t * 1.15 + 0.1) * Math.PI) * (1 - t * 0.35) + 2;
          for (const s of [-1, 1]) {
            const la = ang + s * (1.15 - t * 0.35);
            d.line(px, py, px + Math.cos(la) * ll, py - Math.sin(la) * ll, 3.2 - t * 1.5, pick(greens));
          }
          px = nx; py = ny;
        }
      }
    });
  } else if (kind === 'rune') {
    const W = 128, H = 128;
    res = dual(W, H, '#000', (d) => {
      for (let g = 0; g < 4; g++) {
        const ox = 8 + (g % 2) * 60, oy = 8 + Math.floor(g / 2) * 60, n = 4 + Math.floor(rnd() * 3);
        let px = ox + rnd() * 44, py = oy + rnd() * 44;
        for (let i = 0; i < n; i++) { const nx = ox + 4 + rnd() * 44, ny = oy + 4 + rnd() * 44; d.line(px, py, nx, ny, 3.2, '#fff'); px = nx; py = ny; }
      }
    });
  }
  cache.set(key, res);
  return res;
}

// Soft contact-shadow blob (alpha in R, used with multiply-ish dark blending).
export function blobTexture() {
  if (cache.has('blob')) return cache.get('blob');
  const size = 64, a = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const r = Math.hypot(x / size - 0.5, y / size - 0.5) * 2, j = (y * size + x) * 4, k = Math.pow(c01(1 - r), 1.6);
    a[j] = a[j + 1] = a[j + 2] = 255; a[j + 3] = k * 255;
  }
  const t = dataTex(a, size, false);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  cache.set('blob', t);
  return t;
}
