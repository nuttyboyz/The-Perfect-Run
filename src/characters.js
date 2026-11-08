// Playable characters: realistic skinned models driven by motion-capture
// locomotion plus a procedural upper body (aiming, two-handed gun holds via
// arm IK with gripping fingers, horizontal melee swings, casting).
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { assetGLTF } from './assets.js';
import { retargetClip, boneKey, tposeArms } from './retarget.js';
import { buildSkeleton, boneMaterial } from './skeleton.js';
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
import { buildGrey } from './grey.js';
import { buildThermes } from './thermes.js';

export const CHARACTERS = [
  { id: 'grey', name: 'The Visitor', role: 'Grey', blurb: 'Smooth grey skin, a head too big for its neck and two black eyes that never blink. It does not say where it is from. Light, quick and unsettling.', file: 'veteran.glb', tposeArms: true, build: 'grey', height: 1.64, bulk: 0.95, stats: { hp: 0.92, speed: 1.1 } },
  { id: 'veteran', name: 'Blitz', role: 'Tank', blurb: 'Black-ops plate from boots to visor and a habit of walking straight through the firefight. His bullets heal teammates.', file: 'blitz.glb', tposeArms: true, height: 1.97, bulk: 1.05, healShots: true, stats: { hp: 1.25, speed: 0.95 } }, // was The Veteran (Nutty 2026-11-05: Mixamo #2, renamed Blitz)
  { id: 'bonelord', name: 'Bonelord', role: 'Skeleton', blurb: 'A soldier\'s skeleton that refused to stay buried.', file: 'xbot.glb', build: 'skeleton', height: 1.86, stats: { hp: 0.9, speed: 1.08 } },
  { id: 'scalefang', name: 'Scalefang', role: 'Lizard', blurb: 'Cold-blooded hunter from the swamps. Tail and all.', file: 'xbot.glb', build: 'reptilian', height: 1.9, stats: { hp: 1.1, speed: 1.0 } },
  { id: 'nyx', name: 'Nyx', role: 'Huntress', blurb: 'White hair, red eyes, and a very short temper.', file: 'michelle.glb', height: 1.72, stats: { hp: 0.95, speed: 1.06 } },
  { id: 'ironwood', name: 'Ironwood', role: 'Super Soldier', blurb: 'Moss-green power armour, a visor that never blinks and exactly one plan: stand in front of everyone else.', file: 'soldier.glb', build: 'ironwood', height: 1.9, bulk: 1.1, stats: { hp: 1.2, speed: 0.96 } },
  { id: 'gigachad', name: 'Giga Tyrone', role: 'Absolute Unit', blurb: 'Jaw first, questions never. Tyrone has won every staring contest, handshake and argument with gravity, and he never skips leg day.', file: 'xbot.glb', build: 'chad', armPose: { out: 0.2, fwd: 0.14, bend: 0.3 }, height: 1.96, stats: { hp: 1.15, speed: 1.0 } },
  { id: 'ragmon', name: 'Ragmon', role: 'Blank', blurb: 'A faceless figure with no past and nothing to hide behind. Nobody knows what Ragmon is. Ragmon does not know either.', file: 'ragmon.glb', tposeArms: true, height: 1.8, stats: { hp: 1.0, speed: 1.03 } }, // Nutty 2026-11-05: Mixamo #27
  { id: 'kratia', name: 'Kratia', role: 'Duelist', blurb: 'A red combat suit, silver hair and no patience for anyone slower than her. She hits first and keeps moving.', file: 'kratia.glb', tposeArms: true, height: 1.75, stats: { hp: 0.95, speed: 1.08 } }, // Nutty 2026-11-05: Mixamo #22
  { id: 'selena', name: 'Selena', role: 'Rogue', blurb: 'Hooded, cloaked in black leather and gone before the bodies hit the floor. Quiet, quick and hard to pin down.', file: 'selena.glb', tposeArms: true, height: 1.72, stats: { hp: 0.92, speed: 1.1 } }, // Nutty 2026-11-05: Mixamo #15
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

// Shield on the left forearm: offset (metres at 1.8 m tall) and rotation about the forearm bone. Tuned by eye.
const SHIELD_MOUNT = { pos: [0, 0.14, 0.03], rot: [0, 0, Math.PI / 2] };
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
    let mvPose = null, mvDir = null;
    if (MELEE_V2 && melee > 0 && wd && wd.kind === 'melee' && !wd.cane && !wd.reaper) {
      const mv = moveOf({ id: wd.id, shield: !!wd.shield, fist: !!wd.fist }, st.move);
      mvPose = samplePose(mv, melee); mvDir = strikeDir(mv);
      twist = mvPose.az * (mv.type === 'chop' ? 0.15 : 0.45);
    }
    const pitch = THREE.MathUtils.clamp(st.pitch || 0, -1.1, 1.2);
    this.pitch = pitch;
    const spine = ['Spine', 'Spine1', 'Spine2'].map((k) => B.get(k)).filter(Boolean);
    for (const sb of spine) {
      rotateWorld(sb, up, (-this.legYaw + twist) / spine.length);
      rotateWorld(sb, right, -(isGun || melee > 0 ? pitch * 0.7 : pitch * 0.35) / spine.length);
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
            const sight = ep ? V(-ep.p.x, -ep.p.y, eyeRelief(ep) + CAM_LEAD - ep.p.z) : V(-mz.x, -(mz.y + (st.adsUp ?? 0.075)), (st.adsBack ?? 0.78) + 0.16 - mz.z);
            off.lerp(sight, e);
          }
          if (st.recoil) { off.z -= (wd.shoulder ? 0.02 : 0.05) * st.recoil; off.y += 0.012 * st.recoil; }
          gp = eye.clone().add(off.multiplyScalar(K).applyQuaternion(aimQ));
          gq = aimQ.clone();
          if (st.recoil) gq.multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), (wd.shoulder ? -0.03 : -0.1) * st.recoil));
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
            const pivot = eye.clone().add(V(0, -0.24, 0.02).multiplyScalar(K).applyQuaternion(aimQ));
            const p2 = { az: mvPose.az * 0.75, el: mvPose.el * 0.85 - 0.12, r: mvPose.r };
            const ca = Math.cos(p2.az), ce = Math.cos(p2.el);
            const radial = V(Math.sin(p2.az) * ce, Math.sin(p2.el), ca * ce).normalize().applyQuaternion(aimQ);
            gp = pivot.clone().addScaledVector(radial, (wd.fist ? 0.36 : twoH ? 0.42 : 0.48) * p2.r * K);
            gq = moveBasis(p2, mvDir, aimQ);
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
          gq = moveBasis(p2, mvDir, yaw);
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
      // Blade spans for the swipe trail: only while the cut itself is under way.
      if (melee > 0.2 && melee < 0.74 && wd.swipe) {
        const c = this.root.getWorldPosition(new THREE.Vector3());
        for (let i = 0; i < wd.swipe.length; i++) this.swipeOut.push({ k: i, ph: melee, b: wd.swipe[i][0].clone().applyMatrix4(wpn.matrixWorld), t: wd.swipe[i][1].clone().applyMatrix4(wpn.matrixWorld), c });
      }
      if (wd.reaper) {
        // Right hand on the shaft, left hand joins for the swing. Weapon axes: z shaft, x blade, y = z cross x.
        const R = (a) => a.clone().applyQuaternion(gq);
        this.grab('Right', gp, R(V(1, 0, 0)), R(V(0, 1, 0)), 1.0, right, h);
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
        const fw = V(0, 0, 1).applyQuaternion(gq), px = V(1, 0, 0).applyQuaternion(gq);
        this.grab('Right', wd.fist[0].clone().applyMatrix4(wpn.matrixWorld), fw, px, 1.0, right, h);
        this.grab('Left', wd.fist[1].clone().applyMatrix4(wpn.matrixWorld), fw.clone(), px.clone().negate(), 1.0, right.clone().negate(), h);
      } else {
      // Right hand to the grip. Hand frames in weapon space.
      const wq = gq;
      const gripF = isGun ? V(0, -0.35, 1) : V(0, 1, 0); // knuckles direction
      // A bow in first person is held mirrored: the right hand on the grip, the left on the string.
      const swap = !!(wd.bow && this.firstPerson), mir = swap ? -1 : 1, gripH = swap ? 'Left' : 'Right', supH = swap ? 'Right' : 'Left';
      const gripP = V(mir, 0, 0); // palm faces the weapon's left side
      this.grab(gripH, gp, gripF.normalize().applyQuaternion(wq), gripP.applyQuaternion(wq), 1.0, swap ? right.clone().negate() : right, h);
      // Left hand: support point or free. With a shield: held at the side, or raised square in front of the chest to block.
      const supP = wd.cane ? (melee > 0 ? V(0, 0, 0.34) : null) : wd.support;
      if (wd.shield) {
        const eyeP = B.get('Head').getWorldPosition(new THREE.Vector3());
        const bk = st.block ? 1 : 0;
        const pt = eyeP.clone().add(V(0.16 - 0.1 * bk, -0.55 + 0.25 * bk, 0.12 + 0.3 * bk).multiplyScalar(h).applyQuaternion(yaw));
        this.grab('Left', pt, V(0, -1, 0.2 + bk * 0.8).normalize().applyQuaternion(yaw), V(1, 0, 0).applyQuaternion(yaw), 0.95, right.clone().negate(), h);
      } else if (supP) {
        const sp = supP.clone().applyMatrix4(wpn.matrixWorld);
        let f, p;
        if (wd.bow) { f = V(-0.25 * mir, 0.05, 1).normalize(); p = V(-mir, 0, -0.15).normalize(); } // fist round the riser, arm straight at the target
        else if (isGun && wd.pistol) { f = V(0.3, -0.5, 1).normalize(); p = V(-1, 0.3, 0).normalize(); }
        else if (isGun) { f = V(-0.45, 0.1, 1).normalize(); p = V(0, 1, 0); }
        else { f = V(0, -1, 0); p = V(1, 0, 0); }
        this.grab(supH, sp, f.applyQuaternion(wq), p.applyQuaternion(wq), 0.9, swap ? right : right.clone().negate(), h);
      } else if (isGun && wd.pistol) {
        // Cup the pistol grip from below.
        const sp = V(0.02, -0.07, -0.01).applyMatrix4(wpn.matrixWorld);
        this.grab('Left', sp, V(-0.2, -0.3, 1).normalize().applyQuaternion(wq), V(-1, 0.4, 0).normalize().applyQuaternion(wq), 0.8, right.clone().negate(), h);
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
    if (hb) { const k = this.firstPerson ? 0.001 : 1; if (hb.scale.x !== k) { hb.scale.setScalar(k); hb.updateMatrixWorld(true); } }

    // --- death: topple backwards ---
    if (st.dead) this.deadT = Math.min(1, this.deadT + dt * 1.8); else this.deadT = Math.max(0, this.deadT - dt * 4);
    const k = smooth(this.deadT);
    this.model.rotation.x = -k * 1.45;
    this.model.position.y = k * 0.12 * this.h0; // root-local: the root's scale already applies
    this.model.position.z = -k * 0.5 * this.h0;
  }

  // Put a hand (wrist) so its palm sits on `point`, knuckles along f, palm facing p.
  grab(sd, point, f, p, curl, outward, h) {
    const B = this.b, rest = this.handRest[sd];
    const upper = B.get(sd + 'Arm'), lower = B.get(sd + 'ForeArm'), hand = B.get(sd + 'Hand');
    if (!upper || !lower || !hand || !rest) return;
    const fN = f.clone().normalize(), pN = p.clone().normalize();
    const wrist = point.clone().addScaledVector(fN, -rest.len * 0.75).addScaledVector(pN, -0.025 * h);
    const sh = upper.getWorldPosition(new THREE.Vector3());
    const pole = sh.clone().add(V(0, -0.6, -0.15)).addScaledVector(outward, 0.5);
    twoBoneIK(upper, lower, hand, wrist, pole);
    // Orient the hand.
    const des = basis(fN, pN);
    const R = des.clone().multiply(rest.m.clone().transpose());
    const qR = new THREE.Quaternion().setFromRotationMatrix(R);
    setWorldQuat(hand, qR.multiply(rest.q.clone()));
    // Curl fingers around the grip.
    if (curl > 0) {
      const axis = new THREE.Vector3().crossVectors(fN, pN).normalize();
      for (const fn of FINGERS) for (let j = 1; j <= 3; j++) rotateWorld(B.get(sd + 'Hand' + fn + j), axis, curl * [0, 1.05, 1.25, 0.85][j]);
      const th = B.get(sd + 'HandThumb1'); if (th) { rotateWorld(th, fN, (sd === 'Left' ? -1 : 1) * 0.35 * curl); rotateWorld(B.get(sd + 'HandThumb2'), axis, 0.4 * curl); }
    }
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
  for (const s of r.swipeOut) fx.swipe(r.swipeId + ':' + s.k, s.b, s.t, s.c, s.ph, r.firstPerson ? 0.4 : 1);
  r.swipeOut.length = 0;
}

export function makeCharacter(id, skin) {
  const def = id === 'death' ? DEATH_DEF : (CHAR_BY_ID[id] || CHAR_BY_ID.veteran);
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
export const STEP_KIND = { ragmon: 'soft', kratia: 'boot', selena: 'soft', veteran: 'boot', ironwood: 'heavy', gigachad: 'heavy', bonelord: 'bone', scalefang: 'claw', nyx: 'soft', quill: 'soft', knight: 'heavy', ninja: 'soft', corsair: 'boot', grey: 'soft' };

// Distance-driven steps: call every frame with the speed and whether the body is on the ground.
// Returns the new stride accumulator; plays at most one step per call.
export function stepAccum(acc, dt, speed, grounded, play) {
  if (!grounded || speed < 1.2) return Math.min(acc, 0.6);
  acc += speed * dt;
  const stride = speed > 8 ? 3.1 : 2.2;
  if (acc >= stride) { acc -= stride; play(Math.min(1, 0.35 + speed / 14)); }
  return acc;
}
