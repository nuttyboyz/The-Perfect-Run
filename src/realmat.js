// Realistic surface materials for the hand-built heroes (knight, samurai, ninja, corsair, quill).
// Kit geometry has no UVs, so every pattern is triplanar in object space and drives a bump normal, a
// cavity tint and a roughness variation. Vertex colours still carry the base colour and baked occlusion.
//   real('steel' | 'plate' | 'gilt' | 'cloth' | 'wool' | 'silk' | 'leather' | 'lacquer' | 'felt' | 'rope' | 'bone', { scale, bump })
import * as THREE from 'three';
import { SCAN_ON } from './scan.js';

// Photo-scanned surfaces (Poly Haven CC0) laid over each kind: triplanar in object space, they add real
// weave, grain, pores and wear on top of the hand-picked vertex colours. ?surf=0 off, 1 normal, 2 strong.
const SURF = SCAN_ON ? +(new URLSearchParams(location.search).get('surf') ?? 2) : 0; // Nutty picked "strong" (2) on 2026-11-05; ?surf=3 adds strong + cloth folds, grime and gloss break-up (anti-clay pass)
const SCAN_SURF = {
  steel: { id: 'metal_plate_02', tile: 0.55, k: 0.55 }, plate: { id: 'metal_plate', tile: 0.6, k: 0.7 }, gilt: { id: 'metal_plate_02', tile: 0.55, k: 0.45 },
  cloth: { id: 'rough_linen', tile: 0.32, k: 0.8 }, wool: { id: 'poly_wool_herringbone', tile: 0.38, k: 0.8 }, silk: { id: 'velour_velvet', tile: 0.45, k: 0.6 },
  leather: { id: 'brown_leather', tile: 0.4, k: 0.85 }, felt: { id: 'curly_teddy_natural', tile: 0.3, k: 0.7 }, rope: { id: 'hessian_230', tile: 0.18, k: 0.8 },
  lacquer: { id: 'metal_plate_02', tile: 0.6, k: 0.25 },
};
const surfTex = new Map();
let surfAvg = null;
const surfAvgP = SURF ? fetch('assets/scan/mats.json').then((r) => r.json()).then((j) => (surfAvg = j)).catch(() => null) : null;
function surfUniforms(id) {
  if (surfTex.has(id)) return surfTex.get(id);
  const u = { rmTex: { value: null }, rmOn: { value: 0 }, rmAvg: { value: new THREE.Vector3(0.5, 0.5, 0.5) } };
  const t = new THREE.TextureLoader().load('assets/scan/' + id + '_m.webp', () => {
    Promise.resolve(surfAvgP).then(() => { const a = surfAvg && surfAvg[id]; if (a) u.rmAvg.value.set(a[0], a[1], a[2]); u.rmOn.value = 1; });
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  u.rmTex.value = t;
  surfTex.set(id, u);
  return u;
}

const KINDS = {
  // plate steel: forged and polished, with fine brushing, shallow hammer dents and scratches
  steel: { metal: 0.92, rough: 0.34, rv: 0.28, bump: 0.18, sc: 1, h: 'steel', cav: 0.3 },
  // darker blackened or lacquered-iron plate
  plate: { metal: 0.85, rough: 0.46, rv: 0.3, bump: 0.18, sc: 1, h: 'steel', cav: 0.4 },
  gilt: { metal: 1, rough: 0.3, rv: 0.2, bump: 0.25, sc: 1, h: 'steel', cav: 0.3 },
  // woven linen / cotton: a visible twill
  cloth: { metal: 0, rough: 0.9, rv: 0.1, bump: 0.12, sc: 0.45, h: 'twill', cav: 0.5, sheen: 0.35 },
  // heavier wool / broadcloth: coarser and fuzzier
  wool: { metal: 0, rough: 0.96, rv: 0.1, bump: 0.2, sc: 0.35, h: 'twill', cav: 0.5, sheen: 0.55 },
  // silk and satin: a fine weave with a sheen
  silk: { metal: 0, rough: 0.5, rv: 0.2, bump: 0.08, sc: 0.6, h: 'twill', cav: 0.2, sheen: 1 },
  leather: { metal: 0.02, rough: 0.58, rv: 0.28, bump: 0.5, sc: 1, h: 'leather', cav: 0.55 },
  // urushi lacquer over iron: deep gloss, barely any surface detail
  lacquer: { metal: 0.15, rough: 0.16, rv: 0.06, bump: 0.12, sc: 1, h: 'steel', cav: 0.15, clear: 0.9 },
  felt: { metal: 0, rough: 1, rv: 0.05, bump: 0.7, sc: 0.8, h: 'felt', cav: 0.4, sheen: 0.4 },
  rope: { metal: 0, rough: 0.95, rv: 0.1, bump: 1.2, sc: 1.2, h: 'rope', cav: 0.6 },
  bone: { metal: 0, rough: 0.7, rv: 0.15, bump: 0.4, sc: 1, h: 'leather', cav: 0.4 },
  // bare skin: fine pores over soft wrinkle noise, a faint sheen and a thin glossy film
  skin: { metal: 0, rough: 0.5, rv: 0.22, bump: 0.16, sc: 1.6, h: 'leather', cav: 0.1, sheen: 0.8, clear: 0.18, ccr: 0.32 },
};

const GLSL = `
varying vec3 rmP; varying vec3 rmN;
float rmH;
float rh3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float rn3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rh3(i), rh3(i + vec3(1,0,0)), f.x), mix(rh3(i + vec3(0,1,0)), rh3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(rh3(i + vec3(0,0,1)), rh3(i + vec3(1,0,1)), f.x), mix(rh3(i + vec3(0,1,1)), rh3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float rfbm(vec3 p){ return rn3(p) * 0.55 + rn3(p * 2.03 + 7.1) * 0.3 + rn3(p * 4.1 + 3.3) * 0.15; }
// plane patterns: u in "cells"
float rTwill(vec2 u){ float a = sin((u.x + u.y) * 6.2832) * 0.5 + 0.5; float t = sin(u.x * 6.2832) * sin(u.y * 6.2832); return a * 0.6 + t * 0.25; }
float rLeather(vec2 u){ vec2 i = floor(u), f = fract(u); float d = 9.0; for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)); vec2 o = vec2(rh3(vec3(i + g, 1.0)), rh3(vec3(i + g, 5.0))); d = min(d, length(g + o - f)); } return smoothstep(0.0, 0.55, d); }
float rRope(vec2 u){ return sin((u.x * 1.0 + u.y * 3.0) * 6.2832) * 0.5 + 0.5; }
float rHeight(vec3 p, vec3 w, int kind, float sc) {
  if (kind == 0) { // steel: brushing along local Y, hammer dents, hairline scratches
    float brush = rn3(vec3(p.x * 150.0, p.y * 6.0, p.z * 150.0) * sc);
    float dent = rfbm(p * 22.0 * sc);
    float scr = smoothstep(0.93, 1.0, rn3(vec3(p.x * 60.0 + p.y * 40.0, p.z * 20.0, p.y * 60.0) * sc));
    return brush * 0.1 + dent * 0.6 - scr * 0.25;
  }
  if (kind == 1) { float u = 60.0 * sc; return (rTwill(p.yz * u) * w.x + rTwill(p.xz * u) * w.y + rTwill(p.xy * u) * w.z) * 0.8 + rfbm(p * 40.0) * 0.2; }
  if (kind == 2) { float u = 30.0 * sc; return (rLeather(p.yz * u) * w.x + rLeather(p.xz * u) * w.y + rLeather(p.xy * u) * w.z) * 0.7 + rfbm(p * 25.0) * 0.3; }
  if (kind == 3) { return rfbm(p * 45.0 * sc) * 0.7 + rn3(p * 110.0 * sc) * 0.3; }
  float u = 45.0 * sc; return (rRope(p.yz * u) * w.x + rRope(p.xz * u) * w.y + rRope(p.xy * u) * w.z);
}
vec3 rPerturb(vec3 surfPos, vec3 surfNorm, vec2 dH, float faceDir) {
  vec3 dpx = dFdx(surfPos), dpy = dFdy(surfPos);
  if (dot(dpx, dpx) < 1e-16 || dot(dpy, dpy) < 1e-16) return surfNorm; // a sliver or far-away triangle: nothing to perturb
  vec3 sx = normalize(dpx), sy = normalize(dpy);
  vec3 r1 = cross(sy, surfNorm), r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
  vec3 pn = abs(det) * surfNorm - grad;
  return dot(pn, pn) > 1e-12 ? normalize(pn) : surfNorm;
}
`;

const cache = new Map();
export function real(kind = 'steel', { scale, bump, rough, metal } = {}) {
  const K = KINDS[kind] || KINDS.steel;
  const key = [kind, scale, bump, rough, metal].join('|');
  if (cache.has(key)) return cache.get(key);
  const hk = { steel: 0, twill: 1, leather: 2, felt: 3, rope: 4 }[K.h];
  const sc = (scale || 1) * K.sc, bp = (bump == null ? 1 : bump) * K.bump;
  const Mat = K.clear ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new Mat({ vertexColors: true, color: 0xffffff, metalness: metal ?? K.metal, roughness: rough ?? K.rough });
  const SS = SURF && SCAN_SURF[kind];
  const su = SS ? surfUniforms(SS.id) : null;
  const sk = SS ? Math.min(1, SS.k * (SURF >= 2 ? 1.5 : 1)) : 0, tile = SS ? (SS.tile / (scale || 1)).toFixed(3) : '1.0';
  if (K.clear) { m.clearcoat = K.clear; m.clearcoatRoughness = K.ccr ?? 0.08; }
  if (K.sheen) { m.sheen = K.sheen; m.sheenRoughness = 0.5; m.sheenColor = new THREE.Color(0.7, 0.7, 0.7); }
  // Anti-clay pass (SURF 3): soft goods get draping folds and crumples with dark fold valleys; hard goods get
  // smudged, uneven gloss and grime in their recesses, so no surface reads as one smooth moulded colour.
  const soft = K.metal < 0.2 && kind !== 'lacquer' && kind !== 'bone' && kind !== 'skin';
  const FOLD = SURF >= 3 ? (kind === 'leather' ? 0.006 : soft ? 0.013 : 0) : 0;
  const GLOSS = SURF >= 3 ? (K.metal > 0.5 || kind === 'lacquer' ? 0.55 : 0.25) : 0;
  m.onBeforeCompile = (sh) => {
    if (su) Object.assign(sh.uniforms, su);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 rmP; varying vec3 rmN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nrmP = position; rmN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL + (su ? 'uniform sampler2D rmTex; uniform float rmOn; uniform vec3 rmAvg;' : ''))
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 rmW = dot(rmN, rmN) > 1e-10 ? pow(abs(normalize(rmN)), vec3(4.0)) : vec3(0.0, 1.0, 0.0); rmW /= max(rmW.x + rmW.y + rmW.z, 1e-5);
        rmH = rHeight(rmP, rmW, ${hk}, ${sc.toFixed(3)});
        ${su ? `if (rmOn > 0.5) {
          vec3 q = rmP / ${tile};
          vec4 sx = texture2D(rmTex, q.zy), sy = texture2D(rmTex, q.xz), sz = texture2D(rmTex, q.xy);
          vec4 sc4 = sx * rmW.x + sy * rmW.y + sz * rmW.z;
          vec3 det = clamp(sc4.rgb / max(rmAvg, vec3(0.05)), 0.0, 2.2);
          diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(dot(det, vec3(0.333))), det, 0.35), ${sk.toFixed(2)});
          rmH = mix(rmH, sc4.a, ${(sk * 0.85).toFixed(2)});
        }` : ''}
        float rmF = 0.5, rmG = 0.5;
        ${FOLD ? `{ vec3 fp = rmP;
          float dr = rn3(vec3(fp.x * 6.5, fp.y * 1.3, fp.z * 6.5) + 3.7); dr = 1.0 - abs(dr * 2.0 - 1.0);
          float dr2 = rn3(vec3(fp.x * 13.0, fp.y * 2.6, fp.z * 13.0) + 9.1); dr2 = 1.0 - abs(dr2 * 2.0 - 1.0);
          float cr = rfbm(fp * 18.0 + 1.3);
          rmF = dr * 0.55 + dr2 * 0.25 + cr * 0.2;
          diffuseColor.rgb *= 0.72 + 0.4 * smoothstep(0.15, 0.85, rmF); }` : ''}
        ${GLOSS ? `rmG = rfbm(rmP * 3.1 + 5.0) * 0.7 + rfbm(rmP * 11.0) * 0.3;
          diffuseColor.rgb *= 1.0 - ${(GLOSS * 0.35).toFixed(2)} * smoothstep(0.55, 0.85, rmG) * (1.0 - smoothstep(0.35, 0.6, rmH));` : ''}
        float rmCav = rmH - 0.5;
        diffuseColor.rgb *= 1.0 + rmCav * ${K.cav.toFixed(2)};`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (1.0 + (rmH - 0.5) * ${(K.rv * 2).toFixed(2)}) + (rmG - 0.5) * ${(GLOSS * 0.9).toFixed(2)}, 0.04, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = rPerturb(-vViewPosition, normal, vec2(dFdx(rmH), dFdy(rmH)) * ${(bp * 0.6).toFixed(3)} * 9.0, faceDirection);
        ${FOLD ? `normal = rPerturb(-vViewPosition, normal, vec2(dFdx(rmF), dFdy(rmF)) * ${(FOLD * 1.0).toFixed(4)} * 60.0, faceDirection);` : ''}`);
  };
  m.customProgramCacheKey = () => 'real' + key + (su ? 's' + SURF : '');
  cache.set(key, m);
  return m;
}
