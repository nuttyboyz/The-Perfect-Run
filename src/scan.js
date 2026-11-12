// Photo-scanned assets (Poly Haven, CC0; sources in assets/scan/CREDITS.md).
// Models were cleaned and decimated in headless Blender (tools in /mnt/project-files/perfect-run/scan-tools)
// and ship like the other assets: glTF JSON with an inlined buffer, textures as webp next to them.
// Models load at boot (small); ground textures stream in per biome and replace the procedural layers.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toGLB } from './assets.js';

const BASE = 'assets/scan/';
export const SCAN_ON = !/[?&]noscan\b/.test(location.search);
const geos = new Map(); // variant file -> BufferGeometry (centred, base at y = 0)
let index = null;
const texLoader = new THREE.TextureLoader();
const texCache = new Map();

function tex(file, srgb, aniso = 8) {
  const key = file + (srgb ? 's' : 'l');
  if (texCache.has(key)) return texCache.get(key);
  const t = texLoader.load(BASE + file);
  t.flipY = false;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  texCache.set(key, t);
  return t;
}

export async function loadScan(onEach) {
  if (!SCAN_ON) return;
  try {
    index = await (await fetch(BASE + 'index.json')).json();
  } catch (e) { console.warn('scan index failed', e); index = null; return; }
  const loader = new GLTFLoader();
  const files = Object.values(index).flatMap((m) => m.variants);
  await Promise.all(files.map(async (f) => {
    try {
      const g = await loader.parseAsync(toGLB(await (await fetch(BASE + f + '.json')).json()), BASE);
      let geo = null;
      g.scene.traverse((o) => { if (!geo && o.isMesh) { o.updateWorldMatrix(true, false); geo = o.geometry.clone().applyMatrix4(o.matrixWorld); } });
      if (geo) {
        geo.computeBoundingBox();
        const b = geo.boundingBox;
        geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
        geo.computeBoundingBox(); geo.computeBoundingSphere();
        geos.set(f, geo);
      }
    } catch (e) { console.warn('scan model failed', f, e); }
    if (onEach) onEach(f);
  }));
}

export const scanReady = () => !!index && geos.size > 0;

// One scanned model's geometry, scaled so its footprint radius (half the larger horizontal side) is `radius`.
export function scanGeo(file, { radius = 1, height = 0 } = {}) {
  const g = geos.get(file);
  if (!g) return null;
  const b = g.boundingBox, w = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2, h = b.max.y - b.min.y;
  const k = height ? height / h : radius / w;
  return g.clone().scale(k, k, k);
}

// The scanned PBR material for a model id (diffuse, GL normal, ARM or roughness), with an optional tint.
const matCache = new Map();
export function scanMat(id, { tint = null, normal = 1, desat = 0 } = {}) {
  const key = id + (tint ? tint.join(',') : '') + normal + '|' + desat;
  if (matCache.has(key)) return matCache.get(key);
  const m = index && index[id] && index[id].maps;
  if (!m) return null;
  const opts = { map: tex(m.diff, true), normalMap: tex(m.nor_gl, false), normalScale: new THREE.Vector2(normal, normal), roughness: 1, metalness: 0 };
  if (m.arm) { const t = tex(m.arm, false, 4); opts.roughnessMap = t; opts.aoMap = t; opts.aoMapIntensity = 0.85; }
  else if (m.rough) opts.roughnessMap = tex(m.rough, false, 4);
  if (tint) opts.color = new THREE.Color(tint[0], tint[1], tint[2]);
  const mat = new THREE.MeshStandardMaterial(opts);
  if (desat) { // grey the photo (the Moon's rocks): mix the albedo toward its own luminance
    mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))) * vec3(0.97, 0.99, 1.04), ${desat.toFixed(2)});`); };
    mat.customProgramCacheKey = () => 'scandesat' + desat;
  }
  matCache.set(key, mat);
  return mat;
}

// Variant file names of a scanned model (in index order).
export const scanVariants = (id) => (index && index[id] ? index[id].variants.filter((f) => geos.has(f)) : []);

// ---------- ground ----------
// Per biome: four scanned layers (A base, B secondary, S special, R cliff rock). null keeps the procedural layer
// (ice, lava rock, void stone). scale = metres per tile, tint multiplies the photo, rough = fallback roughness.
const L = (id, scale, tint = [1, 1, 1]) => ({ id, scale, tint });
export const GROUND = {
  graveyard: [L('leafy_grass', 3.4, [0.85, 0.9, 0.7]), L('mud_forest', 3.0, [1.2, 1.15, 1.1]), L('gravel_ground_01', 2.4, [0.8, 0.8, 0.8]), L('rock_face', 5, [0.8, 0.8, 0.82])],
  crypt: [L('leafy_grass', 3.4, [0.8, 1.0, 0.68]), L('mud_forest', 3.0, [1.25, 1.2, 1.15]), L('gravel_ground_01', 2.4, [0.85, 0.85, 0.85]), L('rock_face', 5, [0.8, 0.8, 0.82])],
  forest: [L('forest_ground_04', 3.2), L('brown_mud_leaves_01', 3.0), L('forest_leaves_02', 2.8, [0.95, 1, 0.9]), L('mossy_rock', 4.5)],
  meadow: [L('leafy_grass', 3.4, [1.05, 1.1, 0.95]), L('brown_mud_leaves_01', 3.0, [1.1, 1.05, 1]), L('forest_ground_04', 3.2, [1.1, 1.1, 1]), L('rock_face', 5)],
  springs: [L('leafy_grass', 3.4, [1.08, 1.14, 0.98]), L('rocky_terrain_02', 3.2), L('forest_ground_04', 3.2, [1.1, 1.15, 1]), L('rock_face', 5, [1.05, 1.05, 1])],
  desert: [L('aerial_sand', 4.5, [1.32, 1.1, 0.8]), L('mud_cracked_dry_03', 3.6, [1.2, 1.0, 0.78]), L('rocky_terrain_02', 3.2, [1.25, 1.05, 0.82]), L('rock_face', 5, [1.25, 0.92, 0.7])],
  dunes: [L('aerial_sand', 4.5, [1.35, 1.12, 0.8]), L('aerial_sand', 3.0, [1.4, 1.15, 0.82]), L('mud_cracked_dry_03', 3.6, [1.15, 1.0, 0.85]), L('rock_face', 5, [1.3, 0.95, 0.72])],
  frozen: [L('snow_02', 3.6), null, L('snow_02', 2.4, [1.02, 1.03, 1.05]), L('rock_face', 5, [0.8, 0.86, 0.95])],
  frost: [L('snow_02', 3.6), null, L('snow_02', 2.4, [1.02, 1.03, 1.05]), L('rock_face', 5, [0.9, 0.98, 1.1])],
  volcanic: [null, L('burned_ground_01', 3.2, [0.8, 0.78, 0.76]), L('dark_rock', 3.4, [0.85, 0.82, 0.8]), null],
  abyss: [null, L('dark_rock_02', 3.4, [0.75, 0.68, 0.95]), L('dark_rock', 3.0, [0.8, 0.72, 1.0]), null],
  space: [L('gravel_ground_01', 3.0, [0.72, 0.73, 0.78]), L('dark_rock_02', 3.4, [0.95, 0.96, 1.0]), L('aerial_sand', 2.6, [0.5, 0.52, 0.58]), L('dark_rock', 5, [0.85, 0.86, 0.92])], // moon grey, no warm or green tones
};

// Ground layer textures for a scanned layer id. Returns textures right away; images arrive a moment later.
export function groundTex(id, onReady) {
  const key = 'g:' + id;
  if (texCache.has(key)) { const r = texCache.get(key); if (onReady) r.wait.then(onReady); return r; }
  let n = 0, done;
  const wait = new Promise((res) => (done = res));
  const mk = (f, srgb) => {
    const t = texLoader.load(BASE + f, () => { if (++n === 2) done(r); }, undefined, () => {});
    t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    return t;
  };
  const r = { albedo: mk(id + '_a.webp', true), normal: mk(id + '_n.webp', false), wait };
  texCache.set(key, r);
  if (onReady) wait.then(onReady);
  return r;
}
