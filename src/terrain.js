// Terrain material: a PBR standard material extended (onBeforeCompile) with four blended procedural layers
// (base, secondary, special, cliff rock), height-based blending, slope-driven triplanar rock, macro colour
// variation, tile breaking, baked splat weights from the generator, glowing cracks and frost sparkle.
import * as THREE from 'three';
import * as TX from './textures.js';
import { GROUND, groundTex, SCAN_ON } from './scan.js';

export const SUN_DIR = new THREE.Vector3(0.69, 0.56, 0.38).normalize();

const FRAG_PARS = /* glsl */ `
uniform sampler2D tA, tB, tS, tR, nA, nB, nS, nR, tMacro;
uniform vec4 uInv, uRough, uEmit;
uniform vec3 uTA, uTB, uTS, uTR;
uniform vec2 uSlope;
uniform float uT, uSpark, uNS, uDesat;
uniform vec3 uCrackCol;
varying vec4 vSplat;
varying vec3 vWP;
varying vec3 vWN;
float th12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

const MAP_BLOCK = /* glsl */ `
  vec2 tp = vWP.xz;
  float dK = 1.0 + 5.0 * smoothstep(35.0, 150.0, length(cameraPosition - vWP));
  vec3 dpx = dFdx(vWP) * dK, dpy = dFdy(vWP) * dK;
  vec4 mc = texture2D(tMacro, tp * 0.0071);
  vec4 mc2 = texture2D(tMacro, tp * 0.021 + 0.3);
  vec2 wp = tp + (mc.gb - 0.5) * 4.0;
  float nb = texture2D(tMacro, tp * 0.17).a - 0.5;
  float slope = 1.0 - vWN.y;
  float wB = clamp((vSplat.x - 0.5 + nb * 0.8) * 3.0 + 0.5, 0.0, 1.0);
  float wS = clamp((vSplat.y - 0.5 + nb * 0.6) * 3.0 + 0.5, 0.0, 1.0);
  float wR = smoothstep(uSlope.x, uSlope.y, slope + vSplat.z * 0.3 + (mc2.b - 0.5) * 0.1);
  wB *= (1.0 - wR); wS *= (1.0 - wR);
  float wA = max(0.0, 1.0 - wB - wS - wR);
  vec2 uA = wp * uInv.x, uB = wp * uInv.y, uS = wp * uInv.z;
  vec2 gAx = dpx.xz * uInv.x, gAy = dpy.xz * uInv.x;
  vec4 cA = textureGrad(tA, uA, gAx, gAy);
  vec4 cA2 = textureGrad(tA, wp * uInv.x * 0.173 + 0.31, gAx * 0.173, gAy * 0.173);
  cA = mix(cA, cA2, 0.38);
  cA.rgb *= uTA;
  vec4 cB = vec4(0.0), cS = vec4(0.0), cR = vec4(0.0);
  if (wB > 0.004) { cB = textureGrad(tB, uB, dpx.xz * uInv.y, dpy.xz * uInv.y); cB.rgb *= uTB; }
  if (wS > 0.004) { cS = textureGrad(tS, uS, dpx.xz * uInv.z, dpy.xz * uInv.z); cS.rgb *= uTS; }
  vec3 bw = vec3(0.0, 1.0, 0.0);
  vec2 uRy = tp * uInv.w, uRx = vWP.zy * uInv.w, uRz = vWP.xy * uInv.w;
  if (wR > 0.004) {
    bw = pow(abs(vWN), vec3(4.0)); bw /= max(bw.x + bw.y + bw.z, 1e-5);
    vec2 gy1 = dpx.xz * uInv.w, gy2 = dpy.xz * uInv.w;
#ifdef TERR_TRI
    cR = bw.y * textureGrad(tR, uRy, gy1, gy2) + bw.x * textureGrad(tR, uRx, dpx.zy * uInv.w, dpy.zy * uInv.w) + bw.z * textureGrad(tR, uRz, dpx.xy * uInv.w, dpy.xy * uInv.w);
#else
    vec2 uRs = bw.y > 0.6 ? uRy : (abs(vWN.x) > abs(vWN.z) ? uRx : uRz);
    cR = textureGrad(tR, uRs, gy1, gy2);
#endif
    cR.rgb *= uTR;
  }
  vec4 rr = vec4(wA, wB, wS, wR);
  vec4 hh = vec4(cA.a, cB.a, cS.a, cR.a);
  vec4 sc = rr + hh * 0.45 * sqrt(rr);
  float mxs = max(max(sc.x, sc.y), max(sc.z, sc.w));
  vec4 ww = max(sc - (mxs - 0.3), 0.0);
  ww /= (ww.x + ww.y + ww.z + ww.w);
  vec3 terrAlb = ww.x * cA.rgb + ww.y * cB.rgb + ww.z * cS.rgb + ww.w * cR.rgb;
  terrAlb *= (0.8 + 0.45 * mc.r) * (0.92 + 0.16 * mc2.g);
  terrAlb = mix(terrAlb, vec3(dot(terrAlb, vec3(0.2126, 0.7152, 0.0722))) * vec3(0.97, 0.99, 1.04), uDesat); // the Moon: comet grey, no brown
  diffuseColor.rgb *= terrAlb;
  float terrRough = dot(ww, uRough);
  vec3 terrDelta = vec3(0.0);
#ifdef TERR_NORMALS
  vec4 nrA = textureGrad(nA, uA, gAx, gAy);
  vec3 dA = vec3(nrA.x * 2.0 - 1.0, 0.0, nrA.y * 2.0 - 1.0);
  terrDelta = ww.x * dA;
  terrRough = ww.x * nrA.a;
#ifdef TERR_NORMALS_ALL
  if (ww.y > 0.004) { vec4 t = textureGrad(nB, uB, dpx.xz * uInv.y, dpy.xz * uInv.y); terrDelta += ww.y * vec3(t.x * 2.0 - 1.0, 0.0, t.y * 2.0 - 1.0); terrRough += ww.y * t.a; }
  if (ww.z > 0.004) { vec4 t = textureGrad(nS, uS, dpx.xz * uInv.z, dpy.xz * uInv.z); terrDelta += ww.z * vec3(t.x * 2.0 - 1.0, 0.0, t.y * 2.0 - 1.0); terrRough += ww.z * t.a; }
#else
  terrRough += ww.y * uRough.y + ww.z * uRough.z;
#endif
  if (ww.w > 0.004) {
    vec2 gy1 = dpx.xz * uInv.w, gy2 = dpy.xz * uInv.w;
#ifdef TERR_TRI
    vec4 ty = textureGrad(nR, uRy, gy1, gy2), tx = textureGrad(nR, uRx, dpx.zy * uInv.w, dpy.zy * uInv.w), tz = textureGrad(nR, uRz, dpx.xy * uInv.w, dpy.xy * uInv.w);
    vec3 dR = bw.y * vec3(ty.x * 2.0 - 1.0, 0.0, ty.y * 2.0 - 1.0) + bw.x * vec3(0.0, tx.y * 2.0 - 1.0, tx.x * 2.0 - 1.0) + bw.z * vec3(tz.x * 2.0 - 1.0, tz.y * 2.0 - 1.0, 0.0);
    terrRough += ww.w * (bw.y * ty.a + bw.x * tx.a + bw.z * tz.a);
#else
    vec4 ty = textureGrad(nR, (bw.y > 0.6 ? uRy : (abs(vWN.x) > abs(vWN.z) ? uRx : uRz)), gy1, gy2);
    vec3 dR = bw.y > 0.6 ? vec3(ty.x * 2.0 - 1.0, 0.0, ty.y * 2.0 - 1.0) : (abs(vWN.x) > abs(vWN.z) ? vec3(0.0, ty.y * 2.0 - 1.0, ty.x * 2.0 - 1.0) : vec3(ty.x * 2.0 - 1.0, ty.y * 2.0 - 1.0, 0.0));
    terrRough += ww.w * ty.a;
#endif
    terrDelta += ww.w * dR * 1.25;
  }
  terrDelta *= uNS;
#endif
  // Glowing cracks: height ~0 inside the crack channels of emissive layers.
  vec4 cr = vec4(1.0 - smoothstep(0.02, 0.2, cA.a), 1.0 - smoothstep(0.02, 0.2, cB.a), 1.0 - smoothstep(0.02, 0.2, cS.a), 1.0 - smoothstep(0.02, 0.2, cR.a));
  float crackK = dot(ww * uEmit, cr);
  vec3 terrEmit = uCrackCol * crackK * (0.8 + 0.35 * sin(uT * 1.4 + mc.g * 18.0 + mc2.r * 9.0));
  if (uSpark > 0.0) {
    vec3 V = normalize(cameraPosition - vWP);
    float dist = length(cameraPosition - vWP);
    vec2 cell = floor(vWP.xz * 38.0);
    float hh1 = th12(cell), hh2 = th12(cell + 17.3);
    vec3 sn = normalize(vec3(cos(hh2 * 31.0) * 0.7, 1.0, sin(hh2 * 57.0) * 0.7));
    vec3 L = normalize(vec3(0.69, 0.56, 0.38));
    float g = pow(max(dot(reflect(-L, sn), V), 0.0), 60.0) * step(0.78, hh1);
    g *= (1.0 - smoothstep(18.0, 60.0, dist)) * ((ww.x + ww.z) * (1.0 - wR) + ww.y * 0.4);
    terrEmit += vec3(1.0, 0.97, 0.92) * g * 2.4 * uSpark;
  }
`;

export function makeTerrainMaterial(biome, q) {
  const set = TX.terrainLayers(biome, q);
  const L = set.layers;
  const crack = biome.crackCol || [0, 0, 0];
  const uniforms = {
    tA: { value: L[0].albedo }, tB: { value: L[1].albedo }, tS: { value: L[2].albedo }, tR: { value: L[3].albedo },
    nA: { value: L[0].normal }, nB: { value: L[1].normal }, nS: { value: L[2].normal }, nR: { value: L[3].normal },
    tMacro: { value: TX.macroNoise() },
    uInv: { value: new THREE.Vector4(1 / L[0].scale, 1 / L[1].scale, 1 / L[2].scale, 1 / L[3].scale) },
    uRough: { value: new THREE.Vector4(L[0].rough, L[1].rough, L[2].rough, L[3].rough) },
    uEmit: { value: new THREE.Vector4(L[0].em, L[1].em, L[2].em, L[3].em) },
    uSlope: { value: new THREE.Vector2(0.17, 0.34) },
    uDesat: { value: biome.desat || 0 },
    uT: { value: 0 }, uSpark: { value: biome.id === 'frozen' || biome.id === 'frost' ? 1 : 0 }, uNS: { value: biome.id === 'frozen' || biome.id === 'frost' ? 0.9 : 1.15 },
    uCrackCol: { value: new THREE.Color(crack[0], crack[1], crack[2]).multiplyScalar(biome.id === 'volcanic' || biome.id === 'volcano' ? 2.6 : 1.8) },
  };
  uniforms.uTA = { value: new THREE.Vector3(1, 1, 1) }; uniforms.uTB = { value: new THREE.Vector3(1, 1, 1) };
  uniforms.uTS = { value: new THREE.Vector3(1, 1, 1) }; uniforms.uTR = { value: new THREE.Vector3(1, 1, 1) };
  // Photo-scanned ground: each scanned layer replaces its procedural one as soon as its two maps have loaded.
  const scan = SCAN_ON && (GROUND[biome.id] || GROUND[biome.tex]);
  if (scan) {
    const K = ['A', 'B', 'S', 'R'], inv = ['x', 'y', 'z', 'w'], rough = [0.92, 0.9, 0.9, 0.88];
    scan.forEach((ly, i) => {
      if (!ly) return;
      groundTex(ly.id, (t) => {
        uniforms['t' + K[i]].value = t.albedo; uniforms['n' + K[i]].value = t.normal;
        uniforms.uInv.value[inv[i]] = 1 / ly.scale; uniforms.uRough.value[inv[i]] = rough[i];
        uniforms['uT' + K[i]].value.set(ly.tint[0], ly.tint[1], ly.tint[2]);
      });
    });
  }
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  if (q >= 1) mat.defines.TERR_NORMALS = '';
  if (q >= 2) { mat.defines.TERR_TRI = ''; mat.defines.TERR_NORMALS_ALL = ''; }
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aSplat;\nvarying vec4 vSplat;\nvarying vec3 vWP;\nvarying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = aSplat; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <map_fragment>', MAP_BLOCK)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(terrRough, 0.04, 1.0);')
      .replace('#include <normal_fragment_maps>', 'normal = prSafeN(normal + (viewMatrix * vec4(terrDelta, 0.0)).xyz);')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += terrEmit;');
  };
  mat.customProgramCacheKey = () => 'terrain' + q + biome.id;
  mat.userData.uniforms = uniforms;
  return mat;
}
