// Playable characters: realistic skinned models driven by motion-capture
// locomotion plus a procedural upper body (aiming, two-handed gun holds via
// arm IK with gripping fingers, horizontal melee swings, casting).
import { swingFire } from './flameweapon.js';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { muOn, BIG_HEAD, HEAD_SCALE } from './mutators.js';
import { assetGLTF } from './assets.js';
import { retargetClip, boneKey, tposeArms } from './retarget.js';
import { buildSkeleton, boneMaterial } from './skeleton.js';
import { graspFit, thumbFit, handVerts, inMesh } from './mobrig.js';
import { buildLizard, animateTail } from './lizard.js';
import { buildReptilian } from './reptilian.js';
import { buildVeteranGear, buildDeathGear, buildAura, buildLongHair, animateAura, makeScythe, makeStaff } from './gear.js';
import { buildIronwood, buildCrown, recolorTexture } from './armor.js';
import { buildChad } from './chad.js';
import { moveOf, samplePose, strikeDir, MELEE_V2 } from './meleemoves.js';
import { buildQuill, animateSpark } from './quill.js';
import { SKINS, skinOf, DEFAULT_SKIN } from './skins.js';
import { makeWeapon } from './weapons.js';
import { findEyepiece, eyeRelief, CAM_LEAD } from './scope.js';
import { buildReaper, makeReaperScythe } from './reaper.js';
import { buildKnight } from './knight.js';
import { buildNinja } from './ninja.js';
import { buildCorsair } from './corsair.js';
import { buildGrey, buildAlien } from './grey.js';
import { buildThermes } from './thermes.js';

export const CHARACTERS = [
  { id: 'grey', name: 'The Visitor', role: 'Grey', blurb: 'Sinewy grey skin and two huge black eyes that never blink. It does not say where it is from. Light, quick and unsettling.', file: 'm10.glb', tposeArms: true, build: 'alien', height: 1.9, grip: { curl: 1.3, palm: 0.012 }, stats: { hp: 0.92, speed: 1.1 } }, // Nutty 2026-11-14: Mixamo #10 in medium grey, replaces the old drawn grey
  { id: 'veteran', name: 'Blitz', role: 'Tank', blurb: 'Black-ops plate from boots to visor and a habit of walking straight through the firefight. His bullets heal teammates.', file: 'blitz.glb', hand: 0.85, tposeArms: true, height: 1.97, bulk: 1.05, healShots: true, stats: { hp: 1.25, speed: 0.95 } }, // was The Veteran (Nutty 2026-11-05: Mixamo #2, renamed Blitz)
  { id: 'bonelord', name: 'Bonelord', role: 'Skeleton', blurb: 'A soldier\'s skeleton that refused to stay buried.', file: 'xbot.glb', build: 'skeleton', height: 1.86, stats: { hp: 0.9, speed: 1.08 } },
  /* Scalefang left the playable list (Nutty 2026-11-16: no finger bones, he could never hold a weapon cleanly). His body is now the enemy Lizard man (mobrig.js lizardman).
     { id: 'scalefang', name: 'Scalefang', role: 'Lizard', blurb: 'Cold-blooded hunter from the swamps. Tail and all.', file: 'xbot.glb', build: 'reptilian', height: 1.9, stats: { hp: 1.1, speed: 1.0 } }, */
  { id: 'ironwood', name: 'Ironwood', role: 'Super Soldier', blurb: 'Moss-green power armour, a visor that never blinks and exactly one plan: stand in front of everyone else.', file: 'soldier.glb', build: 'ironwood', height: 1.9, bulk: 1.1, hand: 0.74, stats: { hp: 1.2, speed: 0.96 } },
  { id: 'ragmon', name: 'Ragmon', role: 'Blank', blurb: 'A faceless figure with no past and nothing to hide behind. Nobody knows what Ragmon is. Ragmon does not know either.', file: 'ragmon.glb', tposeArms: true, height: 1.8, stats: { hp: 1.0, speed: 1.03 } }, // Nutty 2026-11-05: Mixamo #27
  { id: 'kratia', name: 'Kratia', role: 'Duelist', blurb: 'A red combat suit, silver hair and no patience for anyone slower than her. She hits first and keeps moving.', file: 'kratia.glb', tposeArms: true, height: 1.75, stats: { hp: 0.95, speed: 1.08 } }, // Nutty 2026-11-05: Mixamo #22
  { id: 'selena', name: 'Selena', role: 'Rogue', blurb: 'Hooded, cloaked in black leather and gone before the bodies hit the floor. Quiet, quick and hard to pin down.', file: 'selena.glb', tposeArms: true, height: 1.72, stats: { hp: 0.92, speed: 1.1 } }, // Nutty 2026-11-05: Mixamo #15
  { id: 'vanta', name: 'Vanta', role: 'Recon', blurb: 'A sealed black exo-suit and an orange visor that has never once looked away. Nobody has heard him speak; nobody has needed him to.', file: 'm35.glb', tposeArms: true, height: 1.82, stats: { hp: 1.05, speed: 1.0 } }, // Nutty 2026-11-14: Mixamo #35
  { id: 'amara', name: 'Amara', role: 'Duelist', blurb: 'Red tunic, quick feet and a grin that says she has already picked where to hit you. Light on armour, lighter on patience.', file: 'm39.glb', tposeArms: true, height: 1.74, stats: { hp: 0.95, speed: 1.06 } }, // Nutty 2026-11-14: Mixamo #39, brown skinned
  { id: 'knight', name: 'Sir Aldric', role: 'Knight', blurb: 'Full plate, a great helm and a vow he takes far too seriously. Slow, loud and very hard to put down.', file: 'aldric.glb', tposeArms: true, height: 1.92, bulk: 0.95, stats: { hp: 1.25, speed: 0.92 } }, // Nutty 2026-11-05: Mixamo #1 body, same name (was the hand-built knight on veteran.glb)
  { id: 'ninja', name: 'Kiri', role: 'Ninja', blurb: 'Indigo shinobi garb, a masked face and no footsteps worth hearing. Fast, quiet, fragile.', file: 'kiri.glb', tposeArms: true, height: 1.76, stats: { hp: 0.9, speed: 1.12 } }, // Nutty 2026-11-06: the Mixamo ninja replaces the hand-built one
  { id: 'corsair', name: 'Captain Saltvane', role: 'Pirate Captain', blurb: 'Tricorne, frock coat, one good eye and a parrot that swears in four languages. Yo ho.', file: 'veteran.glb', tposeArms: true, build: 'corsair', height: 1.84, stats: { hp: 1.08, speed: 0.98 } },
];
for (const c of CHARACTERS) c.skins = SKINS[c.id] || [];
export const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));
export const DEATH_DEF = { id: 'death', name: 'Death', file: 'sorceress.glb', build: 'reaper', height: 1.72 };

const V = (...a) => new THREE.Vector3(...a);
// Where a long gun's butt is, in weapon space (the back end of its stock), or null for guns without a stock.
// Measured once from the model and cached on it.
function buttOf(w) {
  const u = w.userData;
  if (u.butt !== undefined) return u.butt;
  w.updateMatrixWorld(true);
  let minZ = Infinity; const pts = [], v = new THREE.Vector3(), inv = new THREE.Matrix4().copy(w.matrixWorld).invert();
  w.traverse((o) => {
    if (!o.isMesh || !o.geometry || o === u.ammo) return;
    const P = o.geometry.attributes.position, M = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i < P.count; i += 3) { v.fromBufferAttribute(P, i).applyMatrix4(M); pts.push(v.x, v.y, v.z); if (v.z < minZ) minZ = v.z; }
  });
  if (!(minZ < -0.12)) return (u.butt = null); // nothing reaches far enough back to be a stock
  let y = 0, n = 0;
  for (let i = 0; i < pts.length; i += 3) if (pts[i + 2] < minZ + 0.05) { y += pts[i + 1]; n++; }
  return (u.butt = V(0, n ? y / n : 0, minZ + 0.015));
}
const UP = V(0, 1, 0);
// A melee weapon's world rotation along its move: the shaft points out along `radial`, the edge (+x) leads the strike.
function moveBasis(p, dir, frame) {
  const ca = Math.cos(p.az), sa = Math.sin(p.az), ce = Math.cos(p.el), se = Math.sin(p.el);
  const z = V(sa * ce, se, ca * ce).normalize();
  const x = V(ca * ce, 0, -sa * ce).multiplyScalar(dir.daz).add(V(-sa * se, ce, -ca * se).multiplyScalar(dir.del));
  x.addScaledVector(z, -x.dot(z));
  if (x.lengthSq() < 1e-4) x.crossVectors(UP, z);
  x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)).premultiply(frame);
}
// Fist weapons keep their own left and right whichever way the strike travels (the left fist never crosses over to the
// right): the knuckles point out along the move, the weapon's x stays the wearer's left.
function fistBasis(p, frame) {
  const ca = Math.cos(p.az), sa = Math.sin(p.az), ce = Math.cos(p.el), se = Math.sin(p.el);
  const z = V(sa * ce, se, ca * ce).normalize();
  const x = new THREE.Vector3().crossVectors(UP, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)).premultiply(frame);
}
const templates = new Map();
let animSource = null;

function bakePose(root, clip) {
  // Apply a pose clip (e.g. a T-pose) permanently to the rig's rest transforms.
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play(); mixer.setTime(0);
  const sv = []; root.traverse((o) => { if (o.isBone) sv.push([o, o.quaternion.clone(), o.position.clone()]); });
  mixer.stopAllAction(); mixer.uncacheRoot(root);
  sv.forEach(([o, q, p]) => { o.quaternion.copy(q); o.position.copy(p); });
  root.updateMatrixWorld(true);
}

export function bonesOf(root) { const m = new Map(); root.traverse((o) => { if (o.isBone && !m.has(boneKey(o.name))) m.set(boneKey(o.name), o); }); return m; }

function getAnimSource() {
  if (animSource) return animSource;
  const g = assetGLTF('xbot.glb');
  if (!g) return null;
  const root = SkeletonUtils.clone(g.scene);
  const clip = (n) => g.animations.find((c) => c.name === n);
  animSource = { root, clips: { idle: clip('idle'), walk: clip('walk'), run: clip('run') } };
  return animSource;
}

// Re-colours the textured body meshes of a template for a skin (clones the materials first).
function skinBodyMaterials(scene, def, skin) {
  const edit = (re, fn) => scene.traverse((o) => {
    if (!o.isMesh || !re.test(o.name)) return;
    o.material = Array.isArray(o.material) ? o.material.map((m) => fn(m.clone())) : fn(o.material.clone());
  });
  if (def.id === 'veteran' && def.file === 'veteran.glb' && skin.suit) {
    const r = skin.suit;
    edit(/Outfit_(Top|Bottom)/, (m) => {
      if (m.map && m.map.image) m.map = recolorTexture(m.map, skin.id, (h, sat, l) => [h + r.dh, sat * r.sk, l * r.lk + (r.l0 || 0)]).map;
      return m;
    });
  }
  // Mixamo heroes (one textured body each): a skin recolours every texture. `mx.h` set = repaint to that hue,
  // otherwise shift the existing colours. Skin-tone pixels are left alone unless keepSkin is false.
  // metal / rough make the surface shinier (the knight's plate).
  if (skin.mx && !def.build) {
    const r = skin.mx, keep = r.keepSkin !== false;
    const isSkin = (h, sat, l) => (h <= 42 || h >= 350) && sat >= 0.18 && sat <= 0.68 && l >= 0.28 && l <= 0.86;
    edit(/./, (m) => {
      if (m.map && m.map.image) m.map = recolorTexture(m.map, skin.id + 'mx', (h, sat, l) => {
        if (keep && isSkin(h, sat, l)) return null;
        return r.h != null ? [r.h, (r.s0 || 0) + sat * (r.sk ?? 1), (r.l0 || 0) + l * (r.lk ?? 1)] : [h + (r.dh || 0), sat * (r.sk ?? 1), (r.l0 || 0) + l * (r.lk ?? 1)];
      }).map;
      if (r.metal != null && 'metalness' in m) { m.metalness = r.metal; if (m.metalnessMap && r.metal > 0.5) m.metalnessMap = null; }
      if (r.rough != null && 'roughness' in m) { m.roughness = r.rough; m.roughnessMap = null; if ('clearcoat' in m && r.rough > 0.6) m.clearcoat = 0; if ('specularIntensity' in m && r.rough > 0.6) m.specularIntensity = 0.35; }
      if (r.env != null && 'envMapIntensity' in m) m.envMapIntensity = r.env;
      return m;
    });
  }
  if (def.id === 'nyx') {
    if (skin.outfit) {
      // Every piece of clothing becomes one colour (black or a solid colourway); skin tones are left alone.
      const o = skin.outfit;
      edit(/^Mesh$/, (m) => {
        if (m.map && m.map.image) m.map = recolorTexture(m.map, skin.id + 'o', (h, sat, l) => {
          if ((h <= 45 || h >= 345) && sat >= 0.12 && sat <= 0.5 && l >= 0.5) return null;
          if (o.black) return [h, sat * 0.06, 0.015 + l * 0.1];
          return [o.h, o.s, Math.max(0.05, Math.min(0.9, o.l + (l - 0.35) * 0.3))];
        }).map;
        return m;
      });
    }
    if (skin.eyes) edit(/^Mesh_2$/, (m) => { if (m.map && m.map.image) m.map = recolorTexture(m.map, skin.id + 'e', (h, sat, l) => (sat > 0.2 ? [h + skin.eyes.dh, sat, l] : null)).map; return m; });
    if (skin.hair) edit(/^Mesh_1$/, (m) => { m.color = new THREE.Color(skin.hair); return m; });
  }
}

export function getTemplate(def, skinId) {
  const skin = skinOf(def.id, skinId);
  const design = (globalThis.__design && globalThis.__design[def.id]) || def.design; // hero look options (dev viewer picks one; the game uses def.design)
  const key = def.id + ':' + skin.id + (design ? ':d' + design : '');
  if (templates.has(key)) return templates.get(key);
  const gltf = assetGLTF(def.file);
  const src = getAnimSource();
  if (!gltf || !src) return null;
  const scene = SkeletonUtils.clone(gltf.scene);
  scene.updateMatrixWorld(true);
  const tpose = gltf.animations.find((c) => /t-?pose/i.test(c.name));
  if (tpose) bakePose(scene, tpose);
  else if (def.tposeArms) tposeArms(scene);
  // Locomotion clips: the X Bot's own, or retargeted onto this rig.
  const clips = {};
  for (const k of ['idle', 'walk', 'run']) clips[k] = def.file === 'xbot.glb' ? src.clips[k] : retargetClip(src.root, src.clips[k], scene);
  // Measure before any build step (some collapse the original head).
  scene.updateMatrixWorld(true);
  const b0 = bonesOf(scene);
  const top = b0.get('HeadTop_End') ? b0.get('HeadTop_End').getWorldPosition(new THREE.Vector3()).y : new THREE.Box3().setFromObject(scene).max.y;
  // Character-specific build on top of the rest pose.
  if (def.build === 'skeleton') {
    let geo = null; const sk = assetGLTF('skull.glb'); if (sk) sk.scene.traverse((o) => { if (o.isMesh) geo = o.geometry; });
    const grp = buildSkeleton(scene, geo || new THREE.SphereGeometry(1, 16, 12), { eyeColor: skin.eye || def.eye || 0x9fe8ff });
    if (skin.bone != null) {
      // Tint the shared bone material for this skin (the shader tweak is copied over).
      const shared = boneMaterial(), m = shared.clone();
      m.onBeforeCompile = shared.onBeforeCompile; m.customProgramCacheKey = shared.customProgramCacheKey;
      m.color.set(skin.bone); if (skin.metal) { m.metalness = skin.metal; m.roughness = 0.38; }
      for (const g of grp) g.material = m;
    }
    if (skin.crown || skin.ember) buildCrown(scene, skin);
  } else if (def.build === 'lizard') buildLizard(scene, { base: 0x5d7a2c, belly: 0xb8b072, ...(def.lizard || {}), ...(skin.lizard || {}), eye: skin.eye, body: def.body || 'goblin' });
  else if (def.build === 'reptilian') buildReptilian(scene, skin);
  else if (def.build === 'death') buildDeathGear(scene);
  else if (def.build === 'sorceress') buildAura(scene);
  else if (def.build === 'reaper') buildReaper(scene, { top });
  else if (def.build === 'ironwood') buildIronwood(scene, skin);
  else if (def.build === 'chad') buildChad(scene, skin);
  else if (def.build === 'quill') buildQuill(scene, design ? { ...skin, design } : skin);
  else if (def.build === 'knight') buildKnight(scene, design ? { ...skin, design } : skin);
  else if (def.build === 'ninja') buildNinja(scene, design ? { ...skin, design } : skin);
  else if (def.build === 'corsair') buildCorsair(scene, design ? { ...skin, design } : skin);
  else if (def.build === 'grey') buildGrey(scene, design ? { ...skin, design } : skin);
  else if (def.build === 'alien') buildAlien(scene, skin);
  else if (def.build === 'thermes') buildThermes(scene, skin);
  skinBodyMaterials(scene, def, skin);
  if (def.id === 'veteran' && def.file === 'veteran.glb') buildVeteranGear(scene, skin.gear);
  if (def.id === 'nyx') buildLongHair(scene, { color: skin.hair || 0xf2f2fa });
  scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
  // Normalise height and facing (+Z forward).
  scene.updateMatrixWorld(true);
  const b = bonesOf(scene);
  const la = b.get('LeftArm').getWorldPosition(new THREE.Vector3()), lf = b.get('LeftForeArm').getWorldPosition(new THREE.Vector3());
  const yaw = Math.atan2(-(lf.z - la.z), lf.x - la.x); // rotation that makes the left arm point +X
  const t = { def, skin, scene, clips, scale: (def.height / top) * 1.04, yaw: -yaw };
  templates.set(key, t);
  return t;
}

// Zombie Staff slam: 0..1 lift of the upright staff over a swing's progress (rise, hold, drive down at ~0.52, settle).
const caneLift = (m) => (m <= 0 ? 0 : m < 0.34 ? smooth(m / 0.34) : m < 0.38 ? 1 : m < 0.52 ? 1 - smooth((m - 0.38) / 0.14) : 0);

// ---------- small bone helpers ----------
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
function setWorldQuat(bone, qw) {
  bone.parent.getWorldQuaternion(_q2);
  bone.quaternion.copy(_q2.invert().multiply(qw));
  bone.updateMatrixWorld(true);
}
function rotateWorld(bone, axis, angle) {
  if (!bone || Math.abs(angle) < 1e-5) return;
  bone.getWorldQuaternion(_q);
  const r = new THREE.Quaternion().setFromAxisAngle(axis, angle);
  setWorldQuat(bone, r.multiply(_q));
}
function basis(f, p) {
  const z = new THREE.Vector3().crossVectors(f, p).normalize();
  const pp = new THREE.Vector3().crossVectors(z, f).normalize();
  return new THREE.Matrix4().makeBasis(f.clone().normalize(), pp, z);
}

// Two-bone IK: rotate upper and lower so `end` reaches `target`, bending toward `pole`.
function twoBoneIK(upper, lower, end, target, pole) {
  const a = upper.getWorldPosition(new THREE.Vector3());
  const b = lower.getWorldPosition(new THREE.Vector3());
  const c = end.getWorldPosition(new THREE.Vector3());
  const lab = a.distanceTo(b), lbc = b.distanceTo(c);
  const t = target.clone();
  let dist = a.distanceTo(t);
  const maxR = (lab + lbc) * 0.999;
  if (dist > maxR) { t.sub(a).setLength(maxR).add(a); dist = maxR; }
  dist = Math.max(dist, Math.abs(lab - lbc) + 1e-3);
  const d = t.clone().sub(a).normalize();
  const pv = pole.clone().sub(a); pv.sub(d.clone().multiplyScalar(pv.dot(d))).normalize();
  const cosA = THREE.MathUtils.clamp((lab * lab + dist * dist - lbc * lbc) / (2 * lab * dist), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  const e = a.clone().addScaledVector(d, cosA * lab).addScaledVector(pv, sinA * lab);
  // Upper bone.
  _q.setFromUnitVectors(b.clone().sub(a).normalize(), e.clone().sub(a).normalize());
  const uq = upper.getWorldQuaternion(new THREE.Quaternion());
  setWorldQuat(upper, _q.clone().multiply(uq));
  // Lower bone.
  const b2 = lower.getWorldPosition(new THREE.Vector3()), c2 = end.getWorldPosition(new THREE.Vector3());
  const lq = lower.getWorldQuaternion(new THREE.Quaternion());
  _q.setFromUnitVectors(c2.sub(b2).normalize(), t.clone().sub(b2).normalize());
  setWorldQuat(lower, _q.clone().multiply(lq));
}

const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];
// ---- Measured weapon holds (Nutty 2026-11-15: every character holds every weapon with a real grip, nothing through the hand) ----
// The weapon's own shape is read where the hand goes: its cross-section gives the handle's true size and middle, the palm is seated
// on it, the fingers are solved round it (mobrig graspFit) and then eased off the real meshes together with the thumb (thumbFit).
/* Guns whose support hand has a real upright handle to hold (weapon space: the top of that handle). */
/* Guns whose pistol grip sits behind the weapon's origin: how far back (weapon space, metres). */
const GRIPZ = { shotgun: -0.07, coach: -0.06 };
/* Guns whose body sits right on top of the grip: the main hand holds this far down it (metres). */
const GRIPDN = { gravgun: 0.052 };
const VGRIP = { minigun: [0, 0.002, 0.272], grenadel: [0, 0, 0.312], pulse: [0, 0, 0.22], icegun: [0, -0.012, 0.23], gravgun: [0, -0.012, 0.23], smg: [0, -0.075, 0.12] };
export const HOLDS = new Map(); /* worked-out holds, by hero | weapon | hand | place. holds-data.js ships them ready-made (pw/herocheck.mjs BAKE=1 writes it) so nothing is worked out mid-game; one that is missing or whose weapon has changed shape is worked out on the spot */
let BAKED_HOLDS = {}; /* assets/holds.json: fetched in the background at start-up (about 1 MB), never waited for */
try { fetch(new URL('../assets/holds.json', import.meta.url)).then((r) => (r.ok ? r.json() : {})).then((o) => { BAKED_HOLDS = o || {}; }).catch(() => {}); } catch (e) { /* no fetch (tests) */ }
const holdSig = (wpn) => { if (wpn.userData.holdSig == null) { let n = 0; wpn.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.attributes.position) n += o.geometry.attributes.position.count; }); wpn.userData.holdSig = n; } return wpn.userData.holdSig; };
export function bakeHolds() { const o = {}; for (const [k, S] of HOLDS) if (S) o[k] = [+S.wf.toFixed(4), +S.wp.toFixed(4), +S.wa.toFixed(4), S.dbg ? (/\|g\d$/.test(k) && S.dbg.bar === false ? 99 : S.dbg.palm | 0) : 0, S.sig, S.quats.map(([n, q]) => [n.replace(/^.*Hand/, ''), +q.x.toFixed(4), +q.y.toFixed(4), +q.z.toFixed(4), +q.w.toFixed(4)])]; return o; }
const _hrc = new THREE.Raycaster(), _hrd = new THREE.Vector3(0.36, 0.48, 0.8), HOLD_MAT = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
function nearMeshes(wpn, p, r) { /* world-space copies of every visible weapon part that comes within r of p */
  const out = [], bb = new THREE.Box3(), sp = new THREE.Sphere(p, r); wpn.updateMatrixWorld(true);
  wpn.traverse((o) => { const pa = o.isMesh && o.geometry && o.geometry.attributes.position; if (!pa || pa.count < 4 || o.isSkinnedMesh) return; for (let q = o; q; q = q.parent) { if (!q.visible) return; if (q === wpn) break; }
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); bb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); if (!bb.intersectsSphere(sp)) return;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', pa.clone()); if (o.geometry.index) g.setIndex(o.geometry.index.clone()); g.applyMatrix4(o.matrixWorld); g.computeBoundingSphere(); out.push(new THREE.Mesh(g, HOLD_MAT)); });
  return out;
}
function sliceGrip(meshes, c, ax, e1, e2, k, planes, seed) { /* the handle's cross-section round c (planes: distances along ax; e1, e2: across the palm and out of it): the solid blob nearest `seed`, its half sizes and its middle (metres) */
  const W = 0.078 * k, N = 52, cs = 2 * W / N, tv = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], dd = [0, 0, 0], q = new THREE.Vector3();
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, got = 0;
  for (const s of planes) { const segs = [];
    for (const m of meshes) { const pa = m.geometry.attributes.position, ix = m.geometry.index, nt = (ix ? ix.count : pa.count) / 3;
      for (let t = 0; t < nt; t++) { for (let i = 0; i < 3; i++) { tv[i].fromBufferAttribute(pa, ix ? ix.getX(t * 3 + i) : t * 3 + i).sub(c); dd[i] = tv[i].dot(ax) - s; }
        if ((dd[0] < 0) === (dd[1] < 0) && (dd[1] < 0) === (dd[2] < 0)) continue; const pt = [];
        for (let i = 0; i < 3; i++) { const j = (i + 1) % 3; if ((dd[i] < 0) === (dd[j] < 0)) continue; q.copy(tv[i]).lerp(tv[j], dd[i] / (dd[i] - dd[j])); pt.push(q.dot(e1), q.dot(e2)); }
        if (pt.length === 4 && Math.max(Math.abs(pt[0]), Math.abs(pt[2])) < W * 1.6 && Math.max(Math.abs(pt[1]), Math.abs(pt[3])) < W * 1.6) segs.push(pt); } }
    if (segs.length < 3) continue;
    /* a cell is solid when the outline shuts it in on all four sides (overlapping parts of one mesh do not fool this the way counting crossings does) */
    const g = new Uint8Array(N * N);
    for (let iy = 0; iy < N; iy++) { const y = -W + (iy + 0.5) * cs + 1e-5, xs = []; for (const [ax0, ay0, bx0, by0] of segs) if ((ay0 < y) !== (by0 < y)) xs.push(ax0 + (bx0 - ax0) * (y - ay0) / (by0 - ay0)); if (xs.length < 2) continue; const lo = Math.min(...xs), hi = Math.max(...xs);
      for (let ix2 = 0; ix2 < N; ix2++) { const x = -W + (ix2 + 0.5) * cs; if (x > lo && x < hi) g[iy * N + ix2] = 1; } }
    for (let ix2 = 0; ix2 < N; ix2++) { const x = -W + (ix2 + 0.5) * cs + 1e-5, ys = []; for (const [ax0, ay0, bx0, by0] of segs) if ((ax0 < x) !== (bx0 < x)) ys.push(ay0 + (by0 - ay0) * (x - ax0) / (bx0 - ax0)); const lo = ys.length > 1 ? Math.min(...ys) : 1, hi = ys.length > 1 ? Math.max(...ys) : -1;
      for (let iy = 0; iy < N; iy++) { const y = -W + (iy + 0.5) * cs; if (!(y > lo && y < hi)) g[iy * N + ix2] = 0; } }
    let bi = -1, bd = (0.03 * k) ** 2; for (let n = 0; n < N * N; n++) if (g[n]) { const x = -W + (n % N + 0.5) * cs - seed[0], y = -W + (((n / N) | 0) + 0.5) * cs - seed[1], d2 = x * x + y * y; if (d2 < bd) { bd = d2; bi = n; } }
    if (bi < 0) continue; got++;
    const st = [bi]; g[bi] = 2; while (st.length) { const n = st.pop(), cx = n % N, cy = (n / N) | 0, x = -W + (cx + 0.5) * cs, y = -W + (cy + 0.5) * cs;
      if (x - cs / 2 < x0) x0 = x - cs / 2; if (x + cs / 2 > x1) x1 = x + cs / 2; if (y - cs / 2 < y0) y0 = y - cs / 2; if (y + cs / 2 > y1) y1 = y + cs / 2;
      if (cx > 0 && g[n - 1] === 1) { g[n - 1] = 2; st.push(n - 1); } if (cx < N - 1 && g[n + 1] === 1) { g[n + 1] = 2; st.push(n + 1); } if (cy > 0 && g[n - N] === 1) { g[n - N] = 2; st.push(n - N); } if (cy < N - 1 && g[n + N] === 1) { g[n + N] = 2; st.push(n + N); } } }
  if (!got) return null;
  const mx = 0.034 * k, my = 0.03 * k, hr = Math.min((x1 - x0) / 2, mx), hy = Math.min((y1 - y0) / 2, my);
  /* a section too big for a hand: the bar that is fitted is the part of it lying against the palm */
  return { hr, hy, cf: (x1 - x0) / 2 > mx ? Math.max(x0 + hr, Math.min(x1 - hr, seed[0])) : (x0 + x1) / 2, cp: y0 + hy, big: ((x1 - x0) / 2 > mx) + ((y1 - y0) / 2 > my), raw: [x0, x1, y0, y1] };
}



// Shield on the left forearm: offset (metres at 1.8 m tall) and rotation about the forearm bone. Tuned by eye.
const SHIELD_MOUNT = { pos: [0, 0.14, 0.03], rot: [0, 0, Math.PI / 2] };
// A mixer only writes a bone when its animated value changed since the last frame. A body held still (frozen, dead) gets the same value
// every frame, so nothing is written, and the extra rotations this rig lays on top of the clip pile up frame after frame: the body
// twists out of shape (Nutty 2026-11-13: frozen enemies distorted). This makes the next update write every bone again.
function rewritePose(mixer) { const b = mixer._bindings, n = mixer._nActiveBindings; if (!b || n === undefined) return; const k = mixer._accuIndex | 0; for (let i = 0; i < n; i++) { const pm = b[i]; pm.buffer[k * pm.valueSize + pm.valueSize] = NaN; } }

export class CharacterRig {
  constructor(def, opts = {}) {
    this.def = def;
    this.skinId = skinOf(def.id, opts.skin).id;
    const tpl = getTemplate(def, this.skinId);
    this.root = new THREE.Group();
    this.ok = !!tpl;
    if (!tpl) return;
    this.model = SkeletonUtils.clone(tpl.scene);
    this.model.rotation.y = tpl.yaw;
    const bulk = def.bulk || 1;
    this.model.scale.set(tpl.scale * bulk, tpl.scale, tpl.scale * bulk);
    this.root.add(this.model);
    this.h0 = this.h = def.height / 1.8; // h: the rig's offsets scale with the character's height, and with setScale
    this.k = 1;
    this.root.updateMatrixWorld(true);
    this.b = bonesOf(this.model);
    this.tail = []; this.model.traverse((o) => { if (/^tail_\d+$/.test(o.name)) this.tail[+o.name.slice(5)] = o; });
    if (this.tail.length) { this.model.userData.tail = this.tail; this.model.userData.tailBase = this.tail.map((s) => s.rotation.x); this.model.userData.tailLift = 0; }
    this.model.traverse((o) => { if (o.name === 'aura') this.model.userData.aura = o.material; if (o.name === 'spark_orb') this.model.userData.spark = o; });
    // Rest hand frames (wrist->knuckles and palm normal) for grip orientation.
    if (def.hand) { for (const sd of ['Left', 'Right']) { const hb = this.b.get(sd + 'Hand'); if (hb) hb.scale.multiplyScalar(def.hand); } this.model.updateMatrixWorld(true); } /* (a body whose gauntlets are too big to close round a grip: smaller hands) */
    this.handRest = {};
    for (const sd of ['Left', 'Right']) {
      const hb = this.b.get(sd + 'Hand'), m1 = this.b.get(sd + 'HandMiddle1'), i1 = this.b.get(sd + 'HandIndex1'), p1 = this.b.get(sd + 'HandPinky1');
      if (!hb || !m1) continue;
      const hp = hb.getWorldPosition(new THREE.Vector3());
      const f = m1.getWorldPosition(new THREE.Vector3()).sub(hp).normalize();
      let palm;
      if (i1 && p1) {
        const s = i1.getWorldPosition(new THREE.Vector3()).sub(p1.getWorldPosition(new THREE.Vector3())).normalize();
        palm = new THREE.Vector3().crossVectors(f, s).multiplyScalar(sd === 'Left' ? 1 : -1).normalize();
      } else palm = V(0, -1, 0);
      const len = hp.distanceTo(m1.getWorldPosition(new THREE.Vector3()));
      this.handRest[sd] = { m: basis(f, palm), q: hb.getWorldQuaternion(new THREE.Quaternion()), len, len0: len };
    }
    this.fingerRest = {}; this.gfit = {}; this.boneByName = new Map(); this.model.traverse((o) => { if (o.isBone && !this.boneByName.has(o.name)) this.boneByName.set(o.name, o); });
    for (const sd of ['Left', 'Right']) { const a = []; for (const fn of ['Thumb', ...FINGERS]) for (let j = 1; j <= 4; j++) { const b = this.b.get(sd + 'Hand' + fn + j); if (b) a.push([b, b.quaternion.clone()]); } if (a.length >= 8 && this.handRest[sd]) this.fingerRest[sd] = a; }
    // Laser Vision: a glowing orb over each eye, lit by st.eyes / st.eyeGlow (see update and eyesWorld).
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2412, toneMapped: false });
    this.eyeGlow = [0, 1].map(() => { const o = new THREE.Mesh(new THREE.SphereGeometry(0.024 * this.h0, 12, 8), this.eyeMat); o.visible = false; o.frustumCulled = false; this.root.add(o); return o; });
    this.eyesOn = false; this.pitch = 0;
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const k of ['idle', 'walk', 'run']) { const a = this.mixer.clipAction(tpl.clips[k]); a.play(); a.setEffectiveWeight(k === 'idle' ? 1 : 0); this.actions[k] = a; }
    this.lastPos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.first = true;
    this.legYaw = 0; this.blend = { idle: 1, walk: 0, run: 0 };
    this.weapon = null; this.weaponId = null;
    this.deadT = 0; this.t = Math.random() * 10;
    this.swipeOut = []; this.swipeId = ++RIG_UID; // blade spans traced this frame; the owner hands them to FX.swipe (flushSwipes)
    this.root.userData.setWeapon = (id) => this.setWeapon(id);
    this.root.userData.anim = (st, dt, t) => this.update(st, dt);
    this.root.userData.rig = this;
  }

  // Draw the whole character k times its normal size (Duel Arena fighters): the hand reach and every offset follow,
  // and the weapon grows with the body.
  setScale(k) {
    if (!this.ok || k === this.k) return;
    this.k = k;
    this.root.scale.setScalar(k);
    this.h = this.h0 * k;
    for (const r of Object.values(this.handRest)) r.len = r.len0 * k;
    this.root.updateMatrixWorld(true);
  }

  setWeapon(id) {
    if (!this.ok || id === this.weaponId) return;
    if (this.weapon) this.root.remove(this.weapon);
    this.weaponId = id;
    this.weapon = id ? (id === 'scythe' ? makeScythe() : id === 'reaperScythe' ? makeReaperScythe() : id === 'staff' ? makeStaff() : makeWeapon(id)) : null;
    if (this.weapon) this.root.add(this.weapon);
    this.root.userData.weapon = this.weapon;
    // A sword-and-shield's shield straps onto the left forearm (SHIELD_MOUNT: where on the arm, in forearm space).
    if (this.shield) { this.shield.parent && this.shield.parent.remove(this.shield); this.shield = null; }
    const sh = this.weapon && this.weapon.userData.shield, fa = this.b && this.b.get('LeftForeArm');
    if (sh && fa) {
      this.shield = sh;
      sh.position.set(...SHIELD_MOUNT.pos).multiplyScalar(this.h / (fa.getWorldScale(new THREE.Vector3()).y || 1));
      sh.quaternion.setFromEuler(new THREE.Euler(...SHIELD_MOUNT.rot, 'YXZ'));
      sh.scale.setScalar(1 / (fa.getWorldScale(new THREE.Vector3()).y || 1));
      sh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      fa.add(sh);
    }
  }

  // st: { speed (m/s), pitch (+down), gun, melee (0..1 swing progress, 0 = none), cast, dead, sprint }
  update(st, dt) {
    if (!this.ok) return;
    this.t += dt;
    const root = this.root;
    root.updateMatrixWorld(true);
    // Velocity in the character's own frame from position changes.
    const wp = root.getWorldPosition(new THREE.Vector3());
    if (this.first) { this.lastPos.copy(wp); this.first = false; }
    const v = wp.clone().sub(this.lastPos).divideScalar(Math.max(1e-4, dt)); v.y = 0;
    this.lastPos.copy(wp);
    if (v.length() > 30) v.set(0, 0, 0);
    this.vel.lerp(v, Math.min(1, dt * 10));
    const yaw = root.getWorldQuaternion(new THREE.Quaternion());
    const local = this.vel.clone().applyQuaternion(yaw.clone().invert());
    const speed = st.speed != null ? Math.max(st.speed, 0) : local.length();
    const moving = local.length() > 0.4;

    // --- locomotion blend ---
    const s = Math.min(speed, local.length() + 0.5);
    const tw = { idle: Math.max(0, 1 - s / 1.6), walk: Math.max(0, 1 - Math.abs(s - 2.2) / 2.2), run: THREE.MathUtils.clamp((s - 3) / 3, 0, 1) };
    if (st.dead) { tw.idle = 1; tw.walk = tw.run = 0; }
    const tot = tw.idle + tw.walk + tw.run || 1;
    const back = moving && local.z < -0.3 * local.length();
    for (const k of ['idle', 'walk', 'run']) {
      this.blend[k] += (tw[k] / tot - this.blend[k]) * Math.min(1, dt * 8);
      this.actions[k].setEffectiveWeight(this.blend[k]);
    }
    const dir = back ? -1 : 1;
    this.actions.walk.timeScale = dir * THREE.MathUtils.clamp(s / (1.5 * this.h), 0.6, 1.8);
    this.actions.run.timeScale = dir * THREE.MathUtils.clamp(s / (4.6 * this.h), 0.7, 1.5);
    if (st.dead || !dt) rewritePose(this.mixer);
    this.mixer.update(st.dead ? 0 : dt);

    // --- legs turn toward the movement, chest stays on the aim ---
    let targetLeg = 0;
    if (moving) { targetLeg = Math.atan2(local.x, local.z); if (back) targetLeg = Math.atan2(-local.x, -local.z); }
    targetLeg = THREE.MathUtils.clamp(targetLeg, -1.0, 1.0);
    this.legYaw += (targetLeg - this.legYaw) * Math.min(1, dt * 8);
    this.model.updateMatrixWorld(true);
    const B = this.b;
    const up = UP;
    const right = V(-1, 0, 0).applyQuaternion(yaw);
    const fwd = V(0, 0, 1).applyQuaternion(yaw);
    rotateWorld(B.get('Hips'), up, this.legYaw);

    // Swing / aim posture.
    const melee = st.melee || 0;
    const wpn = this.weapon, wd = wpn ? wpn.userData : null;
    if (wd && wd.kind === 'melee' && wd.style === 'whip') wd.lash = melee; // drives the bullwhip cord (weapons.js ropeMesh)
    const isGun = !!(wd && wd.kind === 'gun') && st.gun !== false;
    let twist = 0;
    let swingAng = 0, thr = 0, ovh = 0;
    if (melee > 0) {
      // Wind up to the right, cut across horizontally to the left, recover.
      const e = melee < 0.28 ? -1.25 * Math.sin((melee / 0.28) * Math.PI / 2) : melee < 0.62 ? -1.25 + 2.55 * smooth((melee - 0.28) / 0.34) : 1.3 * (1 - smooth((melee - 0.62) / 0.38));
      const wide = Math.max(1, (st.arc || 0) / 146); // the blade sweeps at least as far as the hit arc
      const sty = wd && wd.style;
      if (sty === 'thrust' || sty === 'whip') {
        // Stabs and lashes go out ahead of you instead of across: draw back, then drive forward and recover.
        thr = melee < 0.28 ? -0.35 * Math.sin((melee / 0.28) * Math.PI / 2) : melee < 0.5 ? -0.35 + 1.35 * smooth((melee - 0.28) / 0.22) : 1 - smooth((melee - 0.5) / 0.5);
        swingAng = sty === 'whip' ? e * 0.5 : 0; twist = sty === 'whip' ? swingAng * 0.45 : e * 0.12;
      } else if (sty === 'smash' || sty === 'chop') {
        // Overhead: lift it high, bring it down on the target.
        ovh = THREE.MathUtils.clamp(-e * 0.95, -0.55, 1.2);
        swingAng = sty === 'chop' ? e * 0.4 : 0; twist = swingAng * 0.45;
      } else { swingAng = e * wide; twist = swingAng * 0.45; }
    }
    // Melee weapons follow their own pair of attack motions (meleemoves.js); st.move picks which one this swing is.
    let mvPose = null, mvDir = null, fistGuard = null; let lungeK = 0;
    if (MELEE_V2 && melee > 0 && wd && wd.kind === 'melee' && !wd.cane && !wd.reaper) {
      const mv = moveOf({ id: wd.id, shield: !!wd.shield, fist: !!wd.fist }, st.move);
      mvPose = samplePose(mv, melee); mvDir = strikeDir(mv);
      twist = mvPose.az * (mv.type === 'chop' ? 0.15 : 0.45);
      if (mv.lunge) lungeK = Math.max(0, Math.min(1, (mvPose.r - 1) / 0.6)); /* a fencing lunge: the body goes in behind the point */
    }
    const pitch = THREE.MathUtils.clamp(st.pitch || 0, -1.1, 1.2);
    this.pitch = pitch;
    const spine = ['Spine', 'Spine1', 'Spine2'].map((k) => B.get(k)).filter(Boolean);
    for (const sb of spine) {
      rotateWorld(sb, up, (-this.legYaw + twist) / spine.length);
      rotateWorld(sb, right, -(isGun || melee > 0 ? pitch * 0.7 : pitch * 0.35) / spine.length);
      if (lungeK) { rotateWorld(sb, right, -lungeK * 0.3 / spine.length); } /* leaning in, sword shoulder leading */
    }
    if (this.firstPerson) lungeK = 0;
    this._lunge = lungeK;
    if (lungeK) { /* the lunge's legs: front knee bent over the foot, back leg straight, hips low */
      rotateWorld(B.get('RightUpLeg'), right, lungeK * 0.96); rotateWorld(B.get('RightLeg'), right, -lungeK * 0.96);
      rotateWorld(B.get('LeftUpLeg'), right, -lungeK * 0.66); rotateWorld(B.get('LeftFoot'), right, lungeK * 0.5);
    }
    if (B.get('Neck')) rotateWorld(B.get('Neck'), right, -pitch * 0.15);
    if (B.get('Head')) rotateWorld(B.get('Head'), right, -pitch * 0.15);

    // Heavy builds carry the free arm away from the lats, slightly forward with a soft elbow.
    const ap = this.def.armPose;
    if (ap && !st.dead) {
      for (const [sd, sg] of [['Left', 1], ['Right', -1]]) {
        const a = B.get(sd + 'Arm'), fa = B.get(sd + 'ForeArm');
        if (!a || !fa) continue;
        rotateWorld(a, fwd, sg * ap.out);
        rotateWorld(a, right, ap.fwd);
        rotateWorld(fa, right, ap.bend);
      }
    }

    // --- weapon placement and arms --- (Laser Vision holds nothing: the arms stay free)
    if (wpn && !st.dead && !wd.eyes) {
      const ls = B.get('LeftArm').getWorldPosition(new THREE.Vector3()), rs = B.get('RightArm').getWorldPosition(new THREE.Vector3());
      const sc = ls.clone().add(rs).multiplyScalar(0.5);
      const h = this.h;
      const aimQ = yaw.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), pitch));
      let gp, gq, reaperL = 0;
      if (wd.bow && isGun) {
        // Archery (Nutty 2026-11-05: the bow used to shove forward on the draw). The bow arm reaches out toward the aim
        // and stays put; the string hand (the weapon origin = the nock) starts at the bow and pulls back to the cheek
        // as the draw builds. wd.support is the grip in weapon space, which bowDraw slides forward with the draw, so
        // placing the grip and backing the origin off from it puts the nock exactly where the draw says.
        const fp = this.firstPerson, K = this.k;
        const headP = fp ? this.eyeWorld() : B.get('Head').getWorldPosition(new THREE.Vector3());
        const bobY = moving ? Math.sin(this.t * (st.sprint ? 13 : 9)) * (st.sprint ? 0.012 : 0.005) : 0;
        // First person (Nutty 2026-11-05): hands swapped, the bow in the right hand out to the right, the left hand draws.
        const reach = fp ? V(-0.11, -0.19 + bobY, 0.62).multiplyScalar(K) : V(-0.03, -0.07, 0.6).multiplyScalar(h);
        gq = aimQ.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), fp ? 0.3 : -0.05)); // a slight cant, like a real archer
        const grip = headP.clone().add(reach.applyQuaternion(aimQ));
        gp = grip.clone().sub(wd.support.clone().applyQuaternion(gq));
      } else if (this.firstPerson) {
        // First person: the weapon lives in the camera's frame, arms reach for it.
        const eye = this.eyeWorld();
        const bob = moving ? Math.sin(this.t * (st.sprint ? 13 : 9)) * (st.sprint ? 0.014 : 0.007) : Math.sin(this.t * 1.6) * 0.002;
        const bobX = moving ? Math.cos(this.t * (st.sprint ? 6.5 : 4.5)) * 0.008 : 0;
        const K = this.k; // a duel-sized fighter holds its (equally enlarged) weapon proportionally further out
        if (isGun) {
          // Fist weapons: both wrists up ahead of you. Pulse Cannon: braced low on the right shoulder, barrel out in front.
          const off = wd.fist ? V(0, -0.21 + bob, 0.44) : wd.shoulder ? V(-0.29 + bobX, -0.34 + bob, 0.32) : wd.pistol ? V(-0.13 + bobX, -0.16 + bob, 0.45) : V(-0.16 + bobX, -0.19 + bob, 0.4);
          // Aiming down the sights: the GUN comes up to the eye (the camera never leaves the head, so it can't end up
          // inside the body). The sight line sits adsUp above the barrel's axis; the muzzle ends adsBack ahead of the eye.
          const ads = st.ads || 0;
          if (ads > 0.001 && !wd.fist && !wd.shoulder && wd.muzzle) {
            const e = ads * ads * (3 - 2 * ads), mz = wd.muzzle;
            if (st.scope && wd.eyepiece === undefined) wd.eyepiece = findEyepiece(wpn);
            const ep = st.scope ? wd.eyepiece : null;
            // A scope: the eye goes to its eye relief behind the ocular lens. Open sights: behind the rear sight.
            // Open sights and red dots: the eye sits exactly on the gun's own sight line (weapons.js sightOf), so the shot
            // lands where the sights line up. A gun with no sights: a little above the barrel.
            const sl = wd.sight;
            const sight = ep ? V(-ep.p.x, -ep.p.y, eyeRelief(ep) + CAM_LEAD - ep.p.z) : sl ? V(-sl.x, -sl.y, (st.adsBack ?? 0.78) + 0.16 - mz.z) : V(-mz.x, -(mz.y + (st.adsUp ?? 0.075)), (st.adsBack ?? 0.78) + 0.16 - mz.z);
            off.lerp(sight, e);
          }
          const rk = (st.recoil || 0) * (1 - 0.8 * (st.ads || 0));
          if (st.recoil) { off.z -= (wd.shoulder ? 0.02 : 0.05) * st.recoil * (1 - 0.5 * (st.ads || 0)); off.y += 0.012 * rk; }
          gp = eye.clone().add(off.multiplyScalar(K).applyQuaternion(aimQ));
          gq = aimQ.clone();
          if (st.recoil) gq.multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), (wd.shoulder ? -0.03 : -0.1) * rk));
          const special = wd.fist || wd.shoulder;
          if (st.reload) {
            if (wd.shoulder) gp.add(V(0, -0.03, -0.03).applyQuaternion(aimQ)); // recharging: the cannon sags a little
            else if (wd.fist) { gq.multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 0.55)); gp.add(V(0, 0.03, -0.05).applyQuaternion(aimQ)); }
            else { gq.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -0.6)).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 0.45)); gp.add(V(0.03, -0.06, -0.04).applyQuaternion(aimQ)); }
          }
          if (st.sprint && !st.reload) {
            if (special) gp.add(V(0, -0.05, -0.03).applyQuaternion(aimQ));
            else { gq = aimQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, 0.45, 0.2, 'YXZ'))); gp = eye.clone().add(V(-0.13 + bobX, -0.23 + bob, 0.34).multiplyScalar(K).applyQuaternion(aimQ)); }
          }
        } else {
          const twoH = wd.twoHanded;
          if (wd.cane) {
            // Zombie Staff: planted upright at the right of the view like a walking stick; the slam lifts it overhead and drives it down.
            const L = caneLift(melee);
            gp = eye.clone().add(V(-0.3 + bobX, -0.7 + bob + L * 0.6, 0.52).multiplyScalar(K).applyQuaternion(yaw));
            gq = yaw.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.1 - L * 0.12, -0.08, 0, 'YXZ')));
          } else if (mvPose) {
            const pivot = eye.clone().add(V(0, -0.15, 0.16).multiplyScalar(K).applyQuaternion(aimQ));
            // squeezed so the whole swing stays in the first-person view (downward strikes most of all: the camera can't see your feet)
            const p2 = { az: mvPose.az * 0.6, el: mvPose.el >= 0 ? mvPose.el * 0.6 : mvPose.el * 0.28, r: mvPose.r };
            const ca = Math.cos(p2.az), ce = Math.cos(p2.el);
            const radial = V(Math.sin(p2.az) * ce, Math.sin(p2.el), ca * ce).normalize().applyQuaternion(aimQ);
            gp = pivot.clone().addScaledVector(radial, (wd.fist ? 0.36 : twoH ? 0.42 : 0.48) * p2.r * K);
            gq = wd.fist ? fistBasis(p2, aimQ) : moveBasis(p2, mvDir, aimQ);
            if (wd.fist) fistGuard = { p: eye.clone().add(V(0, -0.3 + bob, 0.4).multiplyScalar(K).applyQuaternion(aimQ)), q: aimQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0, 0, 'YXZ'))) };
          } else if (melee > 0) {
            const pivot = eye.clone().add(V(0, -0.24, 0.02).multiplyScalar(K).applyQuaternion(aimQ));
            const a = swingAng * 0.75;
            const radial = V(Math.sin(a) * Math.cos(ovh), -0.12 + Math.sin(ovh), Math.cos(a) * Math.cos(ovh)).normalize().applyQuaternion(aimQ);
            gp = pivot.clone().addScaledVector(radial, ((wd.fist ? 0.36 : twoH ? 0.42 : 0.48) + thr * 0.5) * K);
            const yAxis = V(0, 1, 0).applyQuaternion(aimQ);
            gq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(yAxis, radial).normalize(), yAxis, radial));
            gq.multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -0.2));
          } else {
            if (wd.fist) {
              // Both fists up and forward, blades pointing out ahead.
              gp = eye.clone().add(V(0, (st.sprint ? -0.42 : -0.3) + bob, st.sprint ? 0.34 : 0.4).multiplyScalar(K).applyQuaternion(aimQ));
              gq = aimQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(st.sprint ? 0.25 : -0.12, 0, 0, 'YXZ')));
            } else {
            gp = eye.clone().add(V(-0.25 + bobX, -0.34 + bob, 0.42).multiplyScalar(K).applyQuaternion(aimQ));
            gq = aimQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.55, 0.2, -0.45, 'YXZ')));
            if (st.sprint) gq = aimQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, 0.2, 0.5, 'YXZ')));
            }
          }
        }
      } else if (isGun) {
        const pistol = wd.pistol, special = wd.fist || wd.shoulder;
        const off = wd.fist ? V(0, -0.09, 0.36) : wd.shoulder ? V(-0.11, -0.12, 0.17) : pistol ? V(-0.03, -0.07, 0.46) : V(-0.13, -0.11, 0.24);
        off.multiplyScalar(h);
        if (st.recoil) off.z -= (wd.shoulder ? 0.015 : 0.035) * st.recoil * h;
        gp = sc.clone().add(off.applyQuaternion(aimQ));
        gq = aimQ.clone();
        // Long guns with a stock: the butt goes into the right shoulder pocket (Nutty 2026-11-05: guns used to float out
        // at arm's length), so the grip hand sits by the chest and the support hand reaches the forend.
        const butt = !pistol && !special ? buttOf(wpn) : null;
        if (butt) {
          const pocket = B.get('RightArm').getWorldPosition(new THREE.Vector3()).add(V(0.07, -0.05, 0.05).multiplyScalar(h).applyQuaternion(aimQ));
          if (st.recoil) pocket.add(V(0, 0, -0.03 * st.recoil * h).applyQuaternion(aimQ));
          gp = pocket.sub(butt.clone().applyQuaternion(gq));
        }
        if (st.recoil) gq.multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), (wd.shoulder ? -0.04 : -0.12) * st.recoil));
        if (st.reload) {
          if (wd.shoulder) gp.add(V(0, -0.02 * h, 0));
          else if (wd.fist) gq.multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 0.5));
          else gq.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -0.5)).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 0.35));
        }
        if (st.sprint && !st.reload && special) gp.add(V(0, -0.04 * h, 0));
        else if (st.sprint && !st.reload) { gq = yaw.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 0.7)).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), 0.5)); gp = sc.clone().add(V(-0.1, -0.22, 0.2).multiplyScalar(h).applyQuaternion(yaw)); }
      } else if (wd.reaper) {
        // Death's scythe: a two-handed sweep (see reaperPose). The torso frame carries the twist set above.
        const tq = yaw.clone().multiply(new THREE.Quaternion().setFromAxisAngle(UP, twist));
        const rp = reaperPose(melee, sc, tq, st.reaperLunge || 0);
        gp = rp.gp; gq = rp.gq; reaperL = rp.left;
      } else {
        const twoH = wd.twoHanded;
        if (wd.cane) {
          // Zombie Staff: held upright at the right hip like a cane; the slam lifts it over the head and drives the butt into the ground.
          const L = caneLift(melee);
          gp = sc.clone().add(V(-0.32, -0.5 + L * 0.82, 0.2).multiplyScalar(h).applyQuaternion(yaw));
          gq = yaw.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.05 - L * 0.1, -0.05, 0, 'YXZ')));
        } else if (mvPose) {
          const pivot = sc.clone().add(V(0, -0.1 * h, 0));
          const p2 = { az: mvPose.az, el: mvPose.el - 0.05, r: mvPose.r };
          const ce = Math.cos(p2.el);
          const radial = V(Math.sin(p2.az) * ce, Math.sin(p2.el), Math.cos(p2.az) * ce).normalize().applyQuaternion(yaw);
          gp = pivot.clone().addScaledVector(radial, (wd.fist ? 0.3 : twoH ? 0.42 : 0.5) * p2.r * h);
          gq = wd.fist ? fistBasis(p2, yaw) : moveBasis(p2, mvDir, yaw);
          if (wd.fist) fistGuard = { p: sc.clone().add(V(0, -0.2, 0.28).multiplyScalar(h).applyQuaternion(yaw)), q: yaw.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0, 0, 'YXZ'))) };
          if (twoH) gq.multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -0.15));
        } else if (melee > 0) {
          const pivot = sc.clone().add(V(0, -0.1 * h, 0));
          const r = ((wd.fist ? 0.3 : twoH ? 0.42 : 0.5) + thr * 0.55) * h;
          const a = swingAng;
          const radial = V(Math.sin(a) * Math.cos(ovh), -0.05 + Math.sin(ovh), Math.cos(a) * Math.cos(ovh)).normalize().applyQuaternion(yaw);
          gp = pivot.clone().addScaledVector(radial, r);
          // Blade lies flat along the radius, edge leading the cut.
          const zAxis = radial.clone();
          const yAxis = UP.clone();
          gq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(yAxis, zAxis).normalize(), yAxis, zAxis));
          if (twoH) gq.multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -0.15));
        } else {
          // Ready stance: weapon held low at the right side, blade angled forward and up.
          if (wd.fist) {
            // Fists guarding the chest, blades forward; pumping low and back while sprinting.
            gp = sc.clone().add(V(0, st.sprint ? -0.3 : -0.2, st.sprint ? 0.2 : 0.28).multiplyScalar(h).applyQuaternion(yaw));
            gq = yaw.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(st.sprint ? 0.3 : -0.12, 0, 0, 'YXZ')));
          } else {
          gp = sc.clone().add(V(twoH ? -0.12 : -0.2, -0.4, twoH ? 0.22 : 0.2).multiplyScalar(h).applyQuaternion(yaw));
          gq = yaw.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(twoH ? -0.35 : 0.35, twoH ? 0.3 : 0.12, 0, 'YXZ')));
          if (st.sprint) gq = yaw.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 0.1, 0, 'YXZ')));
          }
        }
      }
      // Weapon object in root-local space.
      const inv = root.matrixWorld.clone().invert();
      const m = new THREE.Matrix4().compose(gp, gq, V(1, 1, 1)).premultiply(inv);
      m.decompose(wpn.position, wpn.quaternion, wpn.scale);
      wpn.scale.setScalar(1); // the root's own scale (setScale) then enlarges the weapon with the body
      wpn.updateMatrixWorld(true);
      // Fist weapons strike one hand at a time (Nutty 2026-11-12): attack 1 the right arm only, attack 2 the left arm
      // only. The striking half rides the move with the weapon; the other half is pinned back at the guard.
      const fistOn = wd.halves && fistGuard ? (st.move | 0) % 2 : -1;
      if (wd.halves) {
        for (let i = 0; i < 2; i++) {
          const hf = wd.halves[i];
          if (fistOn >= 0 && i !== fistOn) {
            const mG = new THREE.Matrix4().compose(fistGuard.p, fistGuard.q, new THREE.Vector3().setFromMatrixScale(wpn.matrixWorld));
            mG.premultiply(wpn.matrixWorld.clone().invert()).decompose(hf.position, hf.quaternion, hf.scale);
            hf.scale.setScalar(1);
          } else { hf.position.set(0, 0, 0); hf.quaternion.identity(); }
        }
        wpn.updateMatrixWorld(true);
      }
      // Blade spans for the swipe trail: only while the cut itself is under way.
      if (melee > 0.2 && melee < 0.74 && wd.swipe) {
        const c = this.root.getWorldPosition(new THREE.Vector3());
        for (let i = 0; i < wd.swipe.length; i++) if (fistOn < 0 || i === fistOn) this.swipeOut.push({ k: i, ph: melee, b: wd.swipe[i][0].clone().applyMatrix4(wpn.matrixWorld), t: wd.swipe[i][1].clone().applyMatrix4(wpn.matrixWorld), c });
      }
      if (wd.reaper) {
        // Right hand on the shaft, left hand joins for the swing. Weapon axes: z shaft, x blade, y = z cross x.
        const R = (a) => a.clone().applyQuaternion(gq);
        this.grab('Right', gp, R(V(1, 0, 0)), R(V(0, 1, 0)), 1.0, right, h, 'grip');
        if (reaperL > 0.02) {
          const lh = B.get('LeftHand'), q0 = lh.getWorldQuaternion(new THREE.Quaternion()), p0 = lh.getWorldPosition(new THREE.Vector3());
          const sp = wd.support.clone().applyMatrix4(wpn.matrixWorld);
          const rest = this.handRest.Left;
          // Blend the target from where the free hand already is toward the shaft.
          const tgt = sp.clone().lerp(p0.clone().addScaledVector(R(V(1, 0, 0)), rest.len * 0.75), 1 - reaperL);
          this.grab('Left', tgt, R(V(1, 0, 0)), R(V(0, -1, 0)), 0.9 * reaperL, right.clone().negate(), h);
          if (reaperL < 0.98) setWorldQuat(lh, lh.getWorldQuaternion(new THREE.Quaternion()).slerp(q0, 1 - reaperL));
        }
      } else if (wd.fist) {
        // Punching grip: both fists close round their knuckle bars, knuckles pointing along the blades.
        // Each fist follows its own half of the weapon (one may be striking while the other holds the guard).
        const hm = (i) => (wd.halves ? wd.halves[i].matrixWorld : wpn.matrixWorld);
        const hq = (i) => (wd.halves ? wd.halves[i].getWorldQuaternion(new THREE.Quaternion()) : gq);
        const qR = hq(0), qL = hq(1);
        this.grab('Right', wd.fist[0].clone().applyMatrix4(hm(0)), V(0, 0, 1).applyQuaternion(qR), V(1, 0, 0).applyQuaternion(qR), 1.0, right, h);
        this.grab('Left', wd.fist[1].clone().applyMatrix4(hm(1)), V(0, 0, 1).applyQuaternion(qL), V(-1, 0, 0).applyQuaternion(qL), 1.0, right.clone().negate(), h);
      } else {
      // Right hand to the grip. Hand frames in weapon space.
      const wq = gq;
      const gripF = isGun ? V(0, -0.35, 1) : V(0, 1, 0); // knuckles direction
      // A bow in first person is held mirrored: the right hand on the grip, the left on the string.
      const swap = !!(wd.bow && this.firstPerson), mir = swap ? -1 : 1, gripH = swap ? 'Left' : 'Right', supH = swap ? 'Right' : 'Left';
      const gripP = V(mir, 0, 0); // palm faces the weapon's left side
      gripF.normalize().applyQuaternion(wq); gripP.applyQuaternion(wq);
      const gz = !globalThis.__oldHold && isGun && GRIPZ[wd.id], gpt = () => { if (!gz) return gp; wpn.updateMatrixWorld(true); return V(0, 0, gz).applyMatrix4(wpn.matrixWorld); }; /* (these guns' grips sit behind the weapon's own origin) */
      const mainGrab = () => { this._gax = isGun || wd.bow || globalThis.__oldHold ? null : V(0, 0, 1).applyQuaternion(wq); const r = this.grab(gripH, gpt(), gripF, gripP, 1.0, swap ? right.clone().negate() : right, h, isGun ? 'ggrip' : 'grip'); this._gax = null; return r; };
      /* an arm that cannot quite reach where the weapon was put: the weapon comes to the hand (not in first person, where the sights must stay on the eye) */
      const follow = (ms) => { if (!ms || (this.firstPerson && (isGun || wd.bow)) || ms.lengthSq() < 4e-6 || ms.lengthSq() > (isGun || wd.bow ? 0.04 : 0.6)) return false; /* (a sword thrust out past the arm's reach comes back into the fist, in any view) */ gp.add(ms); wpn.position.add(ms.clone().applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()).invert()).divideScalar(this.k)); wpn.updateMatrixWorld(true); return true; };
      follow(mainGrab());
      // Left hand: support point or free. With a shield: held at the side, or raised square in front of the chest to block.
      const supP = wd.cane ? (melee > 0 ? V(0, 0, 0.34) : null) : wd.support;
      if (wd.shield) {
        const eyeP = B.get('Head').getWorldPosition(new THREE.Vector3());
        const bk = st.block ? 1 : 0;
        const pt = eyeP.clone().add(V(0.16 - 0.1 * bk, -0.55 + 0.25 * bk, 0.12 + 0.3 * bk).multiplyScalar(h).applyQuaternion(yaw));
        this.grab('Left', pt, V(0, -1, 0.2 + bk * 0.8).normalize().applyQuaternion(yaw), V(1, 0, 0).applyQuaternion(yaw), 0.95, right.clone().negate(), h);
      } else if (supP) {
        let f, p, gun2 = false; const topBar = !globalThis.__oldHold && wd.id === 'chainsaw'; const vg = !globalThis.__oldHold && isGun && VGRIP[wd.id];
        if (wd.bow) { f = V(-0.25 * mir, 0.05, 1).normalize(); p = V(-mir, 0, -0.15).normalize(); } // fist round the riser, arm straight at the target
        else if (isGun && wd.pistol) { f = V(0.3, -0.5, 1).normalize(); p = V(-1, 0.3, 0).normalize(); }
        else if (isGun) { gun2 = !globalThis.__oldHold; f = gun2 ? V(-0.906, 0, 0.423) : V(-0.45, 0.1, 1).normalize(); p = V(0, 1, 0); } /* a long gun's fore-end lies across the palm, fingers up its far side */
        else if (topBar) { f = V(-1, 0, 0); p = V(0, -1, 0); } /* a chainsaw's top handle bar: the hand comes over it, palm down */
        else { f = V(0, -1, 0); p = V(1, 0, 0); }
        f.applyQuaternion(wq); p.applyQuaternion(wq);
        /* a gun with a real front handle: the support hand holds it the way the other holds the grip (unless this body's arm cannot get there: then it stays on the old hold for good) */
        const vf = V(0, -0.04, 1).normalize().applyQuaternion(wq), vp = V(-mir, 0, 0).applyQuaternion(wq), vOff = this.vgOff || (this.vgOff = {});
        const haft = !isGun && !wd.bow, supGrab = () => { if (vg && (vOff[wd.id] | 0) < 25) { const ms = this.grab(supH, V(...vg).applyMatrix4(wpn.matrixWorld), vf, vp, 1.0, swap ? right : right.clone().negate(), h, 'ggrip'); if (ms.length() / this.k < 0.05 || wd.id === "minigun") { vOff[wd.id] = 0; return ms; } vOff[wd.id] = (vOff[wd.id] | 0) + 1; if (vOff[wd.id] < 25) return ms; /* (out of reach for a moment while the weapon comes up is nothing; out of reach for good and the hand goes under the fore-end instead) */ if (globalThis.__holdDbg) (globalThis.__vgLog || (globalThis.__vgLog = [])).push([this.def.id, wd.id, +(ms.length() / this.k).toFixed(3), this.missBy && this.missBy.Left]); } const sl = topBar ? V(0, 0.2, 0.235) : supP.clone(); if (gun2) sl.z -= 0.07; /* (the hand lies across the fore-end, its middle where its heel used to be) */ const sp = sl.clone().applyMatrix4(wpn.matrixWorld);
          const bar = gun2 || topBar ? V(0, 0, 1).applyQuaternion(wq) : haft ? sp.clone().sub(gp).normalize() : null;
          return this.grab(supH, sp, f, p, 0.9, swap ? right : right.clone().negate(), h, 'sup', bar, gun2 ? Math.max(0, sl.z - 0.1) : topBar ? 0 : haft ? Math.max(0, sp.distanceTo(gp) / this.k - 0.12) : 0); };
        if (follow(supGrab())) { follow(mainGrab()); supGrab(); } if (follow(mainGrab())) supGrab(); /* (and once more if the main hand is still off its mark) */ /* still out of the support arm's reach: the weapon comes in to it, and both hands take hold again */
      } else if (isGun && wd.pistol) {
        // Cup the pistol grip from below.
        const sp = V(0.02, -0.07, -0.01).applyMatrix4(wpn.matrixWorld);
        this.grab('Left', sp, V(-0.2, -0.3, 1).normalize().applyQuaternion(wq), V(-1, 0.4, 0).normalize().applyQuaternion(wq), 0.8, right.clone().negate(), h, 'ease');
      } else if (st.cast) {
        const tp = sc.clone().add(V(0.12, -0.05, 0.55).multiplyScalar(h).applyQuaternion(aimQ));
        this.grab('Left', tp, V(0, 0.2, 1).normalize().applyQuaternion(aimQ), V(0, 0, 1).applyQuaternion(aimQ), 0.1, right.clone().negate(), h);
      }
      }
    }
    // Web Swing: the left arm reaches up the line to its anchor in the sky (st.swing, world position).
    if (st.swing && !st.dead) {
      const a = Array.isArray(st.swing) ? V(st.swing[0], st.swing[1], st.swing[2]) : st.swing;
      const la = B.get('LeftArm');
      if (la) {
        const sp = la.getWorldPosition(new THREE.Vector3()), dir = a.clone().sub(sp).normalize();
        this.grab('Left', sp.clone().addScaledVector(dir, 0.56 * this.h), dir, V(0, 0, -1).applyQuaternion(yaw), 0.95, right.clone().negate(), this.h);
      }
    }
    // Laser Vision: the eyes burn red (not in first person, where the head is collapsed and the beams start by the camera).
    const eyesOn = !!st.eyes && !st.dead && !this.firstPerson;
    if (eyesOn !== this.eyesOn) { this.eyesOn = eyesOn; for (const o of this.eyeGlow) o.visible = eyesOn; }
    if (eyesOn) {
      const pts = this.eyesWorld(), inv = this.root.matrixWorld.clone().invert(), gk = st.eyeGlow ?? 0.5;
      this.eyeGlow.forEach((o, i) => { o.position.copy(pts[i]).applyMatrix4(inv); o.scale.setScalar(0.8 + 0.6 * gk); });
      this.eyeMat.color.setRGB(0.7 + 1.3 * gk, 0.16 * gk, 0.1 * gk);
    }

    // --- extras ---
    if (this.model.userData.tail) animateTail(this.model, this.t, dt, speed, 0);
    if (this.model.userData.aura) animateAura(this.model, this.t, st.auraI != null ? st.auraI : 1);
    if (this.model.userData.spark) animateSpark(this.model.userData.spark, this.t, speed, this.firstPerson || st.dead);

    // First person: collapse the head (and anything worn on it) so the camera sees out.
    const hb = B.get('Head');
    if (hb) { const k = this.firstPerson ? 0.001 : muOn(BIG_HEAD) ? HEAD_SCALE * 0.92 : 1; /* Big Head mutator: yours too */ if (hb.scale.x !== k) { hb.scale.setScalar(k); hb.updateMatrixWorld(true); } }

    // --- death: topple backwards ---
    if (st.dead) this.deadT = Math.min(1, this.deadT + dt * 1.8); else this.deadT = Math.max(0, this.deadT - dt * 4);
    const k = smooth(this.deadT);
    this.model.rotation.x = -k * 1.45;
    const lg = this._lunge || 0;
    this.model.position.y = (k * 0.12 - lg * 0.19) * this.h0; // root-local: the root's scale already applies
    this.model.position.z = (-k * 0.5 + lg * 0.3) * this.h0;
  }

  // Put a hand (wrist) so its palm sits on `point`, knuckles along f, palm facing p.
  grab(sd, point, f, p, curl, outward, h, site = null, bar = null, slide = 0) {
    const B = this.b, rest = this.handRest[sd];
    const upper = B.get(sd + 'Arm'), lower = B.get(sd + 'ForeArm'), hand = B.get(sd + 'Hand');
    if (!upper || !lower || !hand || !rest) return;
    const fN = f.clone().normalize(), pN = p.clone().normalize();
    const fit = this.def && this.def.grip; if (fit) curl *= fit.curl; // a body with long thin fingers closes them further and holds its palm nearer the grip
    const sh = upper.getWorldPosition(new THREE.Vector3());
    let H = null, wrist = null;
    if (site && this.weapon && this.fingerRest[sd] && curl >= 0.75 && !globalThis.__oldHold) {
      const key = this.weaponId + '|' + sd + '|' + site + (this.firstPerson ? '|fp' : ''), fitAt = (kk, pt) => { let F = this.gfit[kk]; if (F === undefined) F = this.gfit[kk] = this.fitHold(sd, site, pt, fN, pN, curl, kk, bar, outward); return F; };
      const aN = new THREE.Vector3().crossVectors(fN, pN).normalize(), p2 = new THREE.Vector3().crossVectors(aN, fN), at = (F, pt) => pt.clone().addScaledVector(fN, F.wf * this.k).addScaledVector(p2, F.wp * this.k).addScaledVector(aN, F.wa * this.k); /* (fN, p2, aN: square to each other even when the palm direction given is not quite square to the fingers) */
      H = fitAt(key, point); if (H) wrist = at(H, point);
      if (H && site === 'grip' && this._gax && !bar) { /* a handle with a guard that crowds the hand (curved quillons, a knuckle bow): the hand takes hold a little further down the handle if it sits closer there */
        let bp = point; for (let q = 1; q <= 3; q++) { const pt = point.clone().addScaledVector(this._gax, -q * 0.015 * this.k), F = fitAt(key + '|g' + q, pt); if (F && !F.dbg.palm && F.dbg.bar !== false && F.wp > H.wp + 0.008) { H = F; bp = pt; } } wrist = at(H, bp); }
      if (H && bar && slide > 0) { /* a hand on a fore-end or a haft takes hold where the arm can reach it: it is fitted afresh every few centimetres back along it */
        const el = lower.getWorldPosition(new THREE.Vector3()), L = (sh.distanceTo(el) + el.distanceTo(hand.getWorldPosition(new THREE.Vector3()))) * 0.985, bz = bar.clone().normalize(), st = 0.035 * this.k;
        let q = 0; const qm = Math.floor(slide * this.k / st + 1e-6); while (q < qm && at(H, point.clone().addScaledVector(bz, -q * st)).distanceTo(sh) > L) q++; /* (how far back, judged with the first fit; then fitted there) */
        if (!q && H.dbg.palm) for (let q2 = 1; q2 <= Math.min(qm, 6); q2++) { const pt = point.clone().addScaledVector(bz, -q2 * st), F = fitAt(key + '|s' + q2, pt); if (F && !F.dbg.palm) { H = F; wrist = at(F, pt); break; } } /* (no clean hold at the usual place, under a fat round body say: the nearest clean one back along it) */
        let fb = null; for (let n = 0; q > 0 && n < 4; n++, q--) { const pt = point.clone().addScaledVector(bz, -q * st), F = fitAt(key + '|s' + q, pt); if (F && !F.dbg.palm) { H = F; wrist = at(F, pt); fb = null; break; } if (F && F.dbg.palm === 98 && !fb) fb = [F, pt]; } if (fb && H.dbg.palm) { H = fb[0]; wrist = at(fb[0], fb[1]); } /* (nothing snug within reach and too far for the weapon to come in: a clear but looser hold where the arm does reach beats a hand left short of the weapon) */ } /* (no clean hold that far back, on a magazine say: the nearest good place is taken and the weapon comes in the rest of the way) */
    }
    if (!wrist) wrist = point.clone().addScaledVector(fN, -rest.len * 0.75).addScaledVector(pN, -(fit ? fit.palm : 0.025) * h);
    const pole = sh.clone().add(V(0, -0.6, -0.15)).addScaledVector(outward, 0.5);
    twoBoneIK(upper, lower, hand, wrist, pole);
    if (H) { /* some skeletons (armour, twisted arm bones) leave the wrist a centimetre or two off the mark: aimed again by the error */
      const hp = new THREE.Vector3(), aim = wrist.clone(); for (let n = 0; n < 14; n++) { hand.getWorldPosition(hp); if (hp.distanceToSquared(wrist) < 2.5e-7) break; aim.add(wrist).sub(hp); twoBoneIK(upper, lower, hand, aim, pole); } }
    // Orient the hand.
    const des = basis(fN, pN);
    const R = des.clone().multiply(rest.m.clone().transpose());
    const qR = new THREE.Quaternion().setFromRotationMatrix(R);
    setWorldQuat(hand, qR.multiply(rest.q.clone()));
    if (H) { for (const [b, q] of H.quats) b.quaternion.copy(q); const ms = hand.getWorldPosition(new THREE.Vector3()).sub(wrist); if (globalThis.__holdDbg) (this.missBy || (this.missBy = {}))[sd] = [+ms.length().toFixed(3), +wrist.distanceTo(sh).toFixed(3), +(sh.distanceTo(lower.getWorldPosition(new THREE.Vector3())) + lower.getWorldPosition(new THREE.Vector3()).distanceTo(hand.getWorldPosition(new THREE.Vector3()))).toFixed(3)]; return ms; } // the measured hold: every finger joint as it was solved round this weapon
    // Curl fingers around the grip.
    if (curl > 0) {
      const axis = new THREE.Vector3().crossVectors(fN, pN).normalize();
      for (const fn of FINGERS) for (let j = 1; j <= 3; j++) rotateWorld(B.get(sd + 'Hand' + fn + j), axis, curl * [0, 1.05, 1.25, 0.85][j]);
      const th = B.get(sd + 'HandThumb1'); if (th) { rotateWorld(th, fN, (sd === 'Left' ? -1 : 1) * 0.35 * curl); rotateWorld(B.get(sd + 'HandThumb2'), axis, 0.4 * curl); }
    }
  }

  // Work out, once per character + weapon + hand, how this hand holds this weapon (see "Measured weapon holds" above).
  // Returns { wf, wp: the wrist from the grip point along the knuckle and palm directions (metres at normal size), quats: [[bone, turn]] }.
  fitHold(sd, site, point, fN, pN, curl, key, bar, outward) {
    const gk = this.def.id + '|' + key, sig = holdSig(this.weapon); let S = HOLDS.get(gk);
    if (S === undefined && !globalThis.__noBaked) { const Bk = BAKED_HOLDS[gk]; if (Bk && Bk[4] === sig) { S = { wf: Bk[0], wp: Bk[1], wa: Bk[2], sig, short: true, quats: Bk[5].map(([n, x, y, z, w]) => [n, new THREE.Quaternion(x, y, z, w).normalize()]), dbg: { palm: Bk[3] } }; HOLDS.set(gk, S); } }
    if (S && S.sig !== sig) S = undefined; /* (the weapon's model has changed since this was worked out) */
    if (S === undefined) {
      S = null; const t0 = performance.now();
      const B = this.b, rest = this.handRest[sd], hand = B.get(sd + 'Hand'), k = this.k, len = rest.len, fr = this.fingerRest[sd];
      const meshes = nearMeshes(this.weapon, point, 0.2 * k);
      if (meshes.length) {
        const p0 = hand.position.clone(), q0 = hand.quaternion.clone(), axis = new THREE.Vector3().crossVectors(fN, pN).normalize();
        for (const [b, q] of fr) b.quaternion.copy(q);
        hand.parent.updateWorldMatrix(true, false);
        const qR = new THREE.Quaternion().setFromRotationMatrix(basis(fN, pN).multiply(rest.m.clone().transpose())); setWorldQuat(hand, qR.multiply(rest.q.clone()));
        const upper = B.get(sd + 'Arm'), lower = B.get(sd + 'ForeArm'), hq = hand.getWorldQuaternion(new THREE.Quaternion()), pole = upper.getWorldPosition(new THREE.Vector3()).add(V(0, -0.6, -0.15)).addScaledVector(outward, 0.5);
        /* the hand is put exactly at w, on an arm bent toward it as it will be in play (skin by the wrist follows the forearm) */
        const put = (w) => { hand.position.copy(p0); twoBoneIK(upper, lower, hand, w, pole); upper.updateWorldMatrix(false, true); setWorldQuat(hand, hq.clone()); hand.position.copy(hand.parent.worldToLocal(w.clone())); hand.updateWorldMatrix(false, true); };
        const sk = []; this.model.traverse((o) => { if (!o.isSkinnedMesh || !o.geometry.attributes.skinIndex) return; const hv = handVerts(o, sd), ge = o.geometry, ud = ge.userData.palmAll || (ge.userData.palmAll = {});
          if (!ud[sd]) { const si = ge.attributes.skinIndex, sw = ge.attributes.skinWeight, A = { palm: [], Thumb: [], Index: [], Middle: [], Ring: [], Pinky: [] }, re = new RegExp(sd + 'Hand(Thumb|Index|Middle|Ring|Pinky)?\\d?$'), grp = o.skeleton.bones.map((b) => { const m = re.exec(b.name); return m ? m[1] || 'palm' : null; });
            for (let i = 0; i < si.count; i++) { let bi = 0, bw = -1; for (let q = 0; q < 4; q++) { const w = sw.getComponent(i, q); if (w > bw) { bw = w; bi = si.getComponent(i, q); } } if (grp[bi]) A[grp[bi]].push(i); }
            for (const g2 in A) { const cap = globalThis.__holdFull ? 1e9 : g2 === 'palm' ? 700 : 320; if (A[g2].length > cap) { const a = A[g2], st = a.length / cap, t = []; for (let q = 0; q < cap; q++) t.push(a[Math.floor(q * st)]); A[g2] = t; } } /* (a very dense hand is thinned evenly: the fit must stay a matter of milliseconds) */ ud[sd] = A; }
          sk.push([o, ud[sd]]); }); /* (every palm point, not a sample: the palm is what is seated on the weapon) */
        const v = new THREE.Vector3(), inside = (grp) => { let n = 0; for (const [o, V] of sk) for (const i of V[grp]) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); if (inMesh(v, meshes)) n++; } return n; };
        /* the same with a hair of room: a point within 2.5 mm of going in counts as in (the arm never lands the wrist to the millimetre) */
        const MG = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((d) => new THREE.Vector3(...d).multiplyScalar(0.0025 * k)), v2 = new THREE.Vector3(), near = (grp) => { let n = 0; for (const [o, V] of sk) for (const i of V[grp]) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); let hit = inMesh(v, meshes); for (let q = 0; q < 6 && !hit; q++) hit = inMesh(v2.copy(v).add(MG[q]), meshes); if (hit) n++; } return n; };
        /* the handle's own line (bar, or straight across the knuckles), the hand's knuckle row and how far the two are tipped apart */
        const sg = sd === 'Left' ? -1 : 1, kv = new THREE.Vector3().crossVectors(fN, pN).multiplyScalar(sg).normalize(), wv = bar ? bar.clone().normalize() : kv.clone(); if (wv.dot(kv) < 0) wv.negate();
        const tilt = Math.max(-0.6, Math.min(0.6, Math.round(wv.dot(fN) / Math.max(0.3, wv.dot(kv)) * 20) / 20)), uv = fN.clone().addScaledVector(wv, -fN.dot(wv)).normalize();
        /* a gun's grip hangs below the point the hand is given (the top of the grip): it is measured, and held, a little way down it */
        const down = site === 'ggrip' ? wv.clone().multiplyScalar(wv.y > 0 ? -1 : 1) : null; let dn = 0.034 * k;
        if (down) { /* how far down: the middle finger goes just under the trigger guard, so the first clear space in front of the grip is looked for */
          const pre = sliceGrip(meshes, point.clone().addScaledVector(down, dn), down, uv, pN, k, [0.004 * k, 0.026 * k], [-0.03 * k, 0]);
          if (pre) { const fr0 = pre.cf + pre.hr + 0.014 * k, pp = new THREE.Vector3(); for (let t = 0.012 * k; t <= 0.07 * k; t += 0.003 * k) { pp.copy(point).addScaledVector(down, t).addScaledVector(uv, fr0); if (!inMesh(pp, meshes)) { dn = Math.max(dn, Math.min(0.07 * k, t + Math.max(0.014 * k, 0.12 * len) + 0.003 * k)); break; } } } }
          if (sd === 'Right' && GRIPDN[this.weaponId]) dn = Math.max(dn, GRIPDN[this.weaponId] * k); /* (a body right on top of the grip: held lower) */
        const c = down ? point.clone().addScaledVector(down, dn) : point;
        const sl = site === 'ease' ? null : sliceGrip(meshes, c, down || wv, uv, pN, k, down ? [-0.012 * k, 0.012 * k] : [-0.02 * k, 0, 0.02 * k], down ? [-0.03 * k, 0] : [0, 0]); let G = null;
        put(point.clone().addScaledVector(fN, -len * 0.75).addScaledVector(pN, -0.06 * k)); this.model.updateMatrixWorld(true);
        if (sl) { G = graspFit(this.model, sd, sl.hr / len, tilt, 'H:' + this.def.id, sl.hy / len); if (G && !G.good) G = null; }
        let w;
        if (G) { const C = c.clone().addScaledVector(uv, sl.cf).addScaledVector(pN, sl.cp); w = C.addScaledVector(uv, -G.a * fN.dot(uv) * len).addScaledVector(wv, -G.a * fN.dot(wv) * len).addScaledVector(pN, -G.b * len); }
        if (G) { /* seat the palm on the real grip (the open hand is brought in until its skin touches), then solve the fingers again round the handle where it now lies */
          let d = 0; const lim = G.b * len - sl.hy; for (let t = 0.002 * k; t < lim; t += 0.002 * k) { put(w.clone().addScaledVector(pN, t)); if (inside('palm')) break; d = t; }
          d = Math.max(0, d - 0.003 * k); const bf = Math.round((G.b - d / len) * 100) / 100;
          if (d > 0) { put(w); this.model.updateMatrixWorld(true); const G2 = graspFit(this.model, sd, sl.hr / len, tilt, 'H:' + this.def.id, sl.hy / len, bf); if (G2 && G2.good) { G = G2; w.addScaledVector(pN, (G.b0 = G.b, d)); } } }
        else { // no clean handle to wrap (a hand under a fore-end, a cupped hand): the old closed hand, to be eased off the weapon below
          w = point.clone().addScaledVector(fN, -len * 0.75).addScaledVector(pN, -0.025 * this.h);
          const fj = {}, quats = [], shut = {}, qq = new THREE.Quaternion();
          for (const fn of FINGERS) { fj[fn] = []; for (let j = 1; j <= 3; j++) { const b = B.get(sd + 'Hand' + fn + j); if (!b) continue; const ang = curl * [0, 1.05, 1.25, 0.85][j], q0b = b.quaternion.clone(), la = axis.clone().applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
            b.quaternion.copy(q0b).multiply(qq.setFromAxisAngle(la, ang)); b.updateWorldMatrix(false, true); fj[fn].push([b.name, q0b, la, ang]); quats.push([b.name, b.quaternion.clone()]); shut[fn] = (shut[fn] || 0) + ang; } }
          const th = B.get(sd + 'HandThumb1'), th2 = B.get(sd + 'HandThumb2'); if (th) { rotateWorld(th, fN, (sd === 'Left' ? -1 : 1) * 0.35 * curl); quats.push([th.name, th.quaternion.clone()]); if (th2) { rotateWorld(th2, axis, 0.4 * curl); quats.push([th2.name, th2.quaternion.clone()]); } }
          for (const [b, q] of fr) b.quaternion.copy(q);
          G = { a: 0.75, b: 0.25, r: 0.2, kl: 1, quats, key: 'H:' + this.def.id + '|' + sd + '|ease' + curl.toFixed(2), shut, fat: {}, dbg: {}, fj, good: true };
        }
        // seat the palm: straight back off the weapon until none of the palm's own skin is inside it
        put(w); let bn = inside('palm'), bw = w.clone(); for (let n = 1; n <= 12 && bn; n++) { const t = w.clone().addScaledVector(pN, -0.003 * k * n); put(t); const c = inside('palm'); if (c < bn) { bn = c; bw = t; } }
        put(bw); this.model.updateMatrixWorld(true);
        const T = thumbFit(G, this.model, sd, meshes, gk);
        { /* with the fingers and thumb closed the palm's skin has shifted: checked once more as it will really be, and eased back if it now touches */
          for (const [n, q] of T.quats) { const b = this.boneByName.get(n); if (b) b.quaternion.copy(q); } put(bw);
          let c0 = inside('palm'); for (let n = 1; n <= 5 && c0; n++) { const t = bw.clone().addScaledVector(pN, -0.002 * k * n); put(t); const c = inside('palm'); if (c < c0) { c0 = c; bw = t; } } bn = c0; }
        { /* last, on every point of the hand (not a sample) and as the hand will really be: each finger is squeezed shut until its skin meets the weapon, let off a hair, the thumb swung clear, and the whole hand eased back if anything still touches */
          const qq = new THREE.Quaternion(), qi = new THREE.Quaternion(), now = new Map(T.quats.map(([n, q]) => [n, q.clone()])), kz = (0.22 * len) ** 2, kn = new THREE.Vector3();
          /* points of a group inside the weapon; mg: within 2.5 mm counts too; skip: the soft skin right at the knuckle (a handle presses into it) is left out */
          const cnt = (grp, mg, skip) => { let n = 0; for (const [o, V] of sk) for (const i of V[grp]) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); if (skip && v.distanceToSquared(kn) < kz) continue; let hit = inMesh(v, meshes); for (let q = 0; mg && q < 6 && !hit; q++) hit = inMesh(v2.copy(v).add(MG[q]), meshes); if (hit) n++; } return n; };
          const turn = (J, a) => { J.ang = a; J.b.quaternion.copy(J.q0).multiply(qq.setFromAxisAngle(J.la, a)); J.b.updateWorldMatrix(false, true); now.set(J.b.name, J.b.quaternion.clone()); };
          const FJ = {}; for (const fn of FINGERS) FJ[fn] = (G.fj[fn] || []).map(([n, q0, la]) => { const b = this.boneByName.get(n); if (!b) return null; qi.copy(q0).invert().multiply(b.quaternion); return { b, q0, la, ang: 2 * Math.atan2(qi.x * la.x + qi.y * la.y + qi.z * la.z, qi.w) }; }).filter(Boolean);
          const settle = () => { for (const fn of FINGERS) { const js = FJ[fn]; if (!js.length) continue;
            js[0].b.getWorldPosition(kn);
            if (!cnt(fn, false, true)) for (let ji = 0; ji < js.length; ji++) { const J = js[ji], mx = [1.5, 1.65, 1.2][ji]; while (J.ang + 0.06 <= mx) { const a0 = J.ang; turn(J, a0 + 0.06); if (cnt(fn, false, true)) { turn(J, a0); break; } } }
            for (let n = 0; n < 40 && cnt(fn, true, true); n++) { const J = js[2] && js[2].ang > 0.02 ? js[2] : js[1] && js[1].ang > 0.02 ? js[1] : js[0]; if (J === js[0] && J.ang <= -0.6) break; turn(J, J === js[0] ? J.ang - 0.05 : Math.max(0, J.ang - 0.05)); } } };
          settle();
          const t1 = B.get(sd + 'HandThumb1'); let tc = t1 ? cnt('Thumb', true, false) : 0;
          for (let n = 0; n < 14 && tc; n++) { const iq = t1.getWorldQuaternion(new THREE.Quaternion()).invert(), qb = t1.quaternion.clone(); let bq = null, bc = tc;
            for (const ax of [fN, pN, axis]) for (const sg2 of [0.1, -0.1]) { t1.quaternion.copy(qb).multiply(qq.setFromAxisAngle(ax.clone().applyQuaternion(iq).normalize(), sg2)); t1.updateWorldMatrix(false, true); const c = cnt('Thumb', true, false); if (c < bc) { bc = c; bq = t1.quaternion.clone(); } }
            if (!bq) { t1.quaternion.copy(qb); t1.updateWorldMatrix(false, true); break; } t1.quaternion.copy(bq); t1.updateWorldMatrix(false, true); tc = bc; now.set(t1.name, bq.clone()); }
          const all = () => cnt('palm', true, false) + cnt('Index', false, false) + cnt('Middle', false, false) + cnt('Ring', false, false) + cnt('Pinky', false, false) + cnt('Thumb', false, false);
          let far = false; let c0 = all(); const ways = [pN.clone().negate(), fN.clone().negate(), axis.clone(), axis.clone().negate()];
          for (let n = 0; n < 8 && c0; n++) { let bt = null, bc = c0; for (const st of [0.002, 0.006, 0.018]) { for (const d of ways) { const t = bw.clone().addScaledVector(d, st * k); put(t); const c = all(); if (c < bc) { bc = c; bt = t; } } if (bt) break; } if (!bt) break; bw = bt; c0 = bc; } /* (away from the weapon, back along the fingers, or up or down the handle: whichever clears most) */
          if (c0) { /* nothing nearby is clear (under a fat round body, say): the hand is opened flat, taken straight back off the weapon until it is clear, and closed onto it again from there */
            for (const fn of FINGERS) for (const J of FJ[fn]) turn(J, 0);
            for (let t = 0.004; t <= 0.12; t += 0.004) { const q = bw.clone().addScaledVector(pN, -t * k); put(q); if (!all()) { bw = q; c0 = 0; far = t > 0.03; break; } }
            if (!c0) { settle(); c0 = all(); } }
          put(bw); bn = c0;
          if (!bn && site === 'sup' && far) bn = 98; /* (clear only because the hand left the weapon: a poor hold) */
          if (!bn && site === 'sup') { let sa = 0, sm = 0; for (const fn of FINGERS) for (const J of FJ[fn].slice(0, 2)) { sa += J.ang; sm++; } if (sm && sa / sm < 0.45) bn = 98; } /* (clear of the weapon but lying open on it: counted as a poor hold, so a closed one nearby is preferred) */
          T.quats2 = [...now.entries()]; }
        const tipD = globalThis.__holdDbg ? ['', 'Middle1', 'Middle3', 'Pinky1'].map((n) => { const b = B.get(sd + 'Hand' + n); return b ? this.weapon.worldToLocal(b.getWorldPosition(new THREE.Vector3())).toArray().map((x) => +(x * 100).toFixed(1)) : null; }) : null;
        const off = bw.clone().sub(point);
        S = { sig, wf: off.dot(fN) / k, wp: off.dot(new THREE.Vector3().crossVectors(axis, fN)) / k, wa: off.dot(axis) / k, quats: T.quats2 || T.quats, dbg: { sl, bar: G.r !== 0.2, tilt, tipD, gb: [G.a, G.b, len / k, G.dbg.bt || 0], fat: G.fat, eased: T.quats.map(([n, q], i) => [n.replace(/^.*Hand/, ''), +(2 * Math.acos(Math.min(1, Math.abs(q.dot((G.quats.find((e) => e[0] === n) || [0, q])[1]))))).toFixed(2)]).filter((e) => e[1] > 0.01), palm: bn, shut: G.shut } };
        hand.position.copy(p0); hand.quaternion.copy(q0); for (const [b, q] of fr) b.quaternion.copy(q); this.model.updateMatrixWorld(true);
        for (const m of meshes) m.geometry.dispose();
      }
      HOLDS.set(gk, S); if (globalThis.__holdDbg) (globalThis.__holdT || (globalThis.__holdT = [])).push(+(performance.now() - t0).toFixed(0));
    }
    if (!S) return null;
    const quats = []; for (const [n, q] of S.quats) { const b = S.short ? this.b.get(sd + 'Hand' + n) : this.boneByName.get(n); if (b) quats.push([b, q]); }
    return { wf: S.wf, wp: S.wp, wa: S.wa, quats, dbg: S.dbg };
  }

  // Eye position: just in front of and above the head joint.
  eyeWorld() {
    const hb = this.b.get('Head');
    if (!hb) return this.root.getWorldPosition(new THREE.Vector3()).add(V(0, 1.65, 0));
    const yaw = this.root.getWorldQuaternion(new THREE.Quaternion());
    return hb.getWorldPosition(new THREE.Vector3()).add(V(0, 0.075 * this.h, 0.07 * this.h).applyQuaternion(yaw));
  }

  muzzleWorld() {
    if (!this.weapon) return this.root.getWorldPosition(new THREE.Vector3()).add(V(0, 1.5, 0));
    this.root.updateMatrixWorld(true);
    return this.weapon.userData.muzzle.clone().applyMatrix4(this.weapon.matrixWorld);
  }

  // The two eyes in world space ([left, right] as the character sees them), following the head's aim. `fp` is an
  // offset {x, y, z} (metres at normal size) used in first person to start the beams beside and below the camera.
  eyesWorld(fp = null) {
    const hb = this.b.get('Head'), h = this.h;
    const q = this.root.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), this.pitch || 0));
    const base = hb ? hb.getWorldPosition(new THREE.Vector3()) : this.root.getWorldPosition(new THREE.Vector3()).add(V(0, 1.6 * h, 0));
    const out = [];
    for (const sx of [1, -1]) out.push(base.clone().add((fp ? V(sx * fp.x, fp.y, fp.z) : V(sx * 0.033, 0.07, 0.085)).multiplyScalar(h).applyQuaternion(q)));
    return out;
  }

  // A hand's world position (the Web Swing line is drawn from the left one).
  handWorld(sd) {
    const b = this.b.get(sd + 'Hand');
    return b ? b.getWorldPosition(new THREE.Vector3()) : this.root.getWorldPosition(new THREE.Vector3()).add(V(0, 1.4 * this.h, 0));
  }
}

// ---------- Death's scythe poses ----------
// Key poses in the torso frame (x = her left, y up, z forward), relative to the shoulder centre:
// the right-hand grip g, the shaft direction s (butt to head) and the direction the blade points b.
const RK = {
  rest: { g: V(-0.21, -0.36, 0.2), s: V(0.05, 1, 0.3), b: V(0.6, -0.2, 0.8) },
  wind: { g: V(-0.27, -0.06, -0.06), s: V(-0.3, 0.7, -0.65), b: V(0.9, 0.15, -0.3) },
  cut: { g: V(-0.1, -0.3, 0.34), s: V(0.8, 0.1, 0.6), b: V(0.6, -0.1, -0.8) },
  follow: { g: V(0.03, -0.27, 0.22), s: V(0.75, 0.1, -0.4), b: V(-0.4, -0.2, -0.75) },
};
for (const k of Object.values(RK)) { k.s.normalize(); k.b.sub(k.s.clone().multiplyScalar(k.b.dot(k.s))).normalize(); k.q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(k.b, new THREE.Vector3().crossVectors(k.s, k.b), k.s)); }
const _rq = new THREE.Quaternion();
function reaperPose(m, sc, tq, lunge) {
  const T = [[0, RK.rest], [0.26, RK.wind], [0.44, RK.cut], [0.62, RK.follow], [1, RK.rest]];
  let g, q;
  if (m <= 0) { g = RK.rest.g.clone(); q = RK.rest.q.clone(); } else {
    let i = 0; while (i < T.length - 2 && m > T[i + 1][0]) i++;
    let t = clamp01((m - T[i][0]) / (T[i + 1][0] - T[i][0]));
    t = i === 0 ? smooth(t) : i === 1 ? Math.pow(t, 1.5) : i === 2 ? 1 - (1 - t) * (1 - t) : smooth(t);
    g = T[i][1].g.clone().lerp(T[i + 1][1].g, t);
    q = _rq.copy(T[i][1].q).slerp(T[i + 1][1].q, t).clone();
  }
  const gp = sc.clone().add(g.applyQuaternion(tq));
  const gq = tq.clone().multiply(q);
  const left = m > 0 ? smooth(m / 0.12) * (1 - smooth((m - 0.82) / 0.16)) : 0;
  return { gp, gq, left };
}
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function smooth(x) { x = THREE.MathUtils.clamp(x, 0, 1); return x * x * (3 - 2 * x); }

let RIG_UID = 0;
// Hands the blade spans a rig traced this frame to FX.swipe (call right after the rig's anim()).
export function flushSwipes(model, fx) {
  const r = model && model.userData.rig;
  if (!r || !r.swipeOut || !r.swipeOut.length) return;
  const hot = !!model.userData.flaming; // Flaming Weapons: the trail is fire, and flames pour off the blade as it cuts
  for (const s of r.swipeOut) {
    if (hot) { fx.swipe(r.swipeId + ':' + s.k, s.b, s.t, s.c, s.ph, r.firstPerson ? 0.55 : 1.25, [1, 0.42, 0.08]); swingFire(fx, s.b, s.t, r.firstPerson ? 0.5 : (model.userData.fwK || 1)); }
    else fx.swipe(r.swipeId + ':' + s.k, s.b, s.t, s.c, s.ph, r.firstPerson ? 0.4 : 1);
  }
  r.swipeOut.length = 0;
}

// The four Horde shop owners (Nutty 2026-11-14, from the numbered Mixamo sheets: #43 Uriel, #21 the soldier, #40 Peasant Girl, #20 Elvis).
// Not playable: they only stand behind their counters (hordeshops.js).
export const KEEPER_DEFS = {
  keepMelee: { id: 'keepMelee', name: 'Blacksmith', file: 'm43.glb', tposeArms: true, height: 2.0 },
  keepGun: { id: 'keepGun', name: 'Quartermaster', file: 'm21.glb', tposeArms: true, height: 1.9 },
  keepElem: { id: 'keepElem', name: 'Sage', file: 'm40.glb', tposeArms: true, height: 1.72 },
  keepGear: { id: 'keepGear', name: 'Tinkerer', file: 'king.glb', tposeArms: true, height: 1.85 },
};
export function makeCharacter(id, skin) {
  const def = id === 'death' ? DEATH_DEF : (KEEPER_DEFS[id] || CHAR_BY_ID[id] || CHAR_BY_ID.veteran);
  return new CharacterRig(def, { skin });
}

// A scene-ready character: the realistic rig when its assets loaded, otherwise
// the old procedural humanoid so the game still runs.
export function makeCharacterModel(id, fallback, skin) {
  const rig = makeCharacter(id, skin);
  if (rig.ok) {
    rig.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    return rig.root;
  }
  return fallback ? fallback() : rig.root;
}

// Size a character model from makeCharacterModel: the rig scales with its offsets, the fallback humanoid as a whole.
export function setCharacterScale(model, k) {
  const rig = model.userData.rig;
  if (rig) rig.setScale(k); else if (model.scale.x !== k) model.scale.setScalar(k);
}

// Footstep flavour per character (see Audio.footstep).
export const STEP_KIND = { ragmon: 'soft', kratia: 'boot', selena: 'soft', veteran: 'boot', ironwood: 'heavy', gigachad: 'heavy', bonelord: 'bone', scalefang: 'claw', nyx: 'soft', quill: 'soft', knight: 'heavy', ninja: 'soft', corsair: 'boot', grey: 'soft', vanta: 'boot', amara: 'soft' };

// Distance-driven steps: call every frame with the speed and whether the body is on the ground.
// Returns the new stride accumulator; plays at most one step per call.
export function stepAccum(acc, dt, speed, grounded, play) {
  if (!grounded || speed < 1.2) return Math.min(acc, 0.6);
  acc += speed * dt;
  const stride = speed > 8 ? 3.1 : 2.2;
  if (acc >= stride) { acc -= stride; play(Math.min(1, 0.35 + speed / 14)); }
  return acc;
}
