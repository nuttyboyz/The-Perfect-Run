// Realistic monsters: each mob type is a skinned, motion-captured creature
// (goblin ghouls, lizardmen, risen skeletons, a hexing clown, an armoured
// juggernaut, spectral wraiths) with a procedural layer on top for posture,
// claw swipes, casting, hit flinches and a falling death.
import * as THREE from 'three';
import { lodSet, lodLevel } from './lod.js';
import { MOBS, MOB_MIN_H, MOB_ARMS, MOB_ARM_POOL } from './data.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { getTemplate, bonesOf } from './characters.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MOB_SIZE, MOB_TALL } from './data.js';
import { animateTail } from './lizard.js';
import { muOn, BIG_HEAD, HEAD_SCALE } from './mutators.js';

// h: standing height in metres. hunch: forward lean of the spine (radians).
// float: hover height for spirits. bulk: horizontal thickening.
export const MOB_LOOKS = {
  grunt: { file: 'm04.glb', tposeArms: true, h: 1.8, hunch: 0.32, rough: 0.75 }, // #4 zombie soldier
  runner: { file: 'm07.glb', tposeArms: true, h: 1.62, hunch: 0.6, bulk: 0.9 }, // #7 rotted woman
  spitter: { file: 'xbot.glb', build: 'lizard', body: 'xbot', lizard: { base: 0x5e7a14, belly: 0xe2d27a }, h: 1.8, hunch: 0.25, cast: true },
  crawler: { file: 'xbot.glb', build: 'skeleton', eye: 0xff4a2a, h: 1.4, hunch: 0.95 },
  brute: { file: 'm14.glb', tposeArms: true, h: 3.0, hunch: 0.28, bulk: 1.2 }, // #14 shirtless strongman
  wraith: { file: 'xbot.glb', build: 'skeleton', eye: 0x9fe8ff, h: 2.0, hunch: 0.2, ghost: 0x7fd8ff, float: 0.45 },
  hexer: { file: 'clown.glb', h: 2.0, hunch: 0.1, tint: 0xb9a6d6, cast: true, orb: 0xb06aff, horns: true },
  ravager: { file: 'm11.glb', tposeArms: true, h: 2.45, hunch: 0.5, bulk: 1.1, horns: true, hornScale: 1.6 }, // #11 dark flesh monster
  juggernaut: { file: 'soldier.glb', h: 3.4, hunch: 0.12, tint: 0x7c7f8c, bulk: 1.25, visor: 0xff3a1a },
  banshee: { file: 'sorceress.glb', h: 1.95, hunch: 0.05, ghost: 0xff8ad0, float: 0.6, cast: true },
  // Flyers: a winged imp that dives, and a bone archer that hovers and shoots.
  gloomwing: { file: 'm10.glb', tposeArms: true, h: 1.55, hunch: 0.35, bulk: 0.9, horns: true, hornScale: 1.2, fly: true, wings: { membrane: 0x9a62b0, bone: 0x3a2430, span: 0.95 } }, // #10 red flesh
  skyhunter: { file: 'xbot.glb', build: 'skeleton', eye: 0x9fe8ff, h: 1.9, hunch: 0.15, fly: true, wings: { membrane: 0xb9c6d4, bone: 0xe8e0cc, span: 1.25, alpha: 0.72 } },
  // Summoned from hell by the Zombie Staff: the rigged veteran avatar rotted green-grey (see rotDress), arms out in front, glowing eyes.
  // Variants. gear: rigid props (see buildGear). tele: glow colour while winding up an ability. aura: ambient particles.
  bulwark: { file: 'soldier.glb', h: 2.2, hunch: 0.08, tint: 0x6486bb, bulk: 1.2, visor: 0xffc040, gear: ['tower'], tele: [0.9, 0.9, 1] },
  bomber: { file: 'clown.glb', h: 1.5, hunch: 0.3, tint: 0xf09040, lift: 0.3, gear: ['keg'], tele: [1, 0.45, 0.1], aura: 'spark' },
  pouncer: { file: 'm19.glb', tposeArms: true, h: 1.5, hunch: 0.95, lift: 0.22, bulk: 0.9, gear: ['ridge'], tele: [1, 0.9, 0.3] }, // #19 wrapped mummy
  hatchling: { file: 'xbot.glb', build: 'lizard', body: 'xbot', lizard: { base: 0xe2d41c, belly: 0xfff6a0 }, h: 0.95, hunch: 0.5 },
  cinder: { file: 'xbot.glb', build: 'lizard', body: 'xbot', lizard: { base: 0x9a1c0c, belly: 0xff7a20 }, h: 2.15, hunch: 0.3, horns: true, hornScale: 1.5, gear: ['embers'], aura: 'fire' },
  venomfang: { file: 'clown.glb', h: 1.75, hunch: 0.5, tint: 0xa8e048, lift: 0.2, gear: ['sacs'], aura: 'poison' },
  necro: { file: 'xbot.glb', build: 'skeleton', eye: 0x7dffb0, h: 2.0, hunch: 0.25, gear: ['robe', 'staff'], tele: [0.4, 1, 0.65], aura: 'wisp' },
  boneling: { file: 'xbot.glb', build: 'skeleton', eye: 0x7dffb0, h: 1.15, hunch: 0.6 },
  archer: { file: 'soldier.glb', h: 1.9, hunch: 0.15, tint: 0xa48c58, lift: 0.2, gear: ['bow', 'quiver'], tele: [1, 0.95, 0.7] },
  troll: { file: 'm03.glb', tposeArms: true, h: 3.0, hunch: 0.3, lift: 0.16, bulk: 1.3, gear: ['club'] }, // #3 big old man in a coat
  ogre: { file: 'soldier.glb', h: 3.5, hunch: 0.2, tint: 0xc08068, lift: 0.06, bulk: 1.5, slam: true, horns: true, hornScale: 2.2, gear: ['fists'], tele: [1, 0.5, 0.3] },
  // Goblins: the ghoul's goblin body, green-skinned, small and quick; the shaman wears a robe and carries a skull staff, the chief a club and a shield.
  goblin: { file: 'm05.glb', tposeArms: true, h: 1.35, hunch: 0.55, bulk: 0.9, lift: 0.08, gear: ['dagger'] }, // #5 purple imp
  gobshaman: { file: 'm23.glb', tposeArms: true, h: 1.5, hunch: 0.35, bulk: 0.9, lift: 0.08, cast: true, orb: 0x8aff30, gear: ['staff'], tele: [0.5, 1, 0.2] }, // #23 red hooded cleric
  gobchief: { file: 'm06.glb', tposeArms: true, h: 2.2, hunch: 0.3, bulk: 1.2, lift: 0.06, slam: true, gear: ['club', 'tower'], tele: [1, 0.7, 0.2] }, // #6 crusader
  // Humans: the hero bodies turned hostile. Cutthroat = the pirate build, Shadow Blade = the ninja, the rifleman a plain soldier, the witch a hooded woman.
  bandit: { file: 'veteran.glb', tposeArms: true, build: 'corsair', h: 1.84, hunch: 0.25, tint: 0xb8a898, gear: ['blade'] },
  rifleman: { file: 'veteran.glb', tposeArms: true, h: 1.9, hunch: 0.15, tint: 0x9a9a8a, gear: ['rifle'], tele: [1, 0.9, 0.6] },
  assassin: { file: 'veteran.glb', tposeArms: true, build: 'ninja', h: 1.74, hunch: 0.3, gear: ['blade'], tele: [0.6, 0.2, 1] },
  witch: { file: 'michelle.glb', h: 1.72, hunch: 0.1, tint: 0x7a5a9a, lift: 0.1, cast: true, orb: 0xc040ff, gear: ['robe'], tele: [0.8, 0.3, 1] },
  // The hidden space map: aliens in every shape and colour. The grey build (the Visitor's body, designs 1 short dome / 2 tall egg / 3 broad brow) in
  // their own skins (skins.js mob_*), plus insectoids, floaters and a bruiser on the other rigs.
  zorp: { file: 'veteran.glb', tposeArms: true, build: 'grey', design: 1, h: 1.15, hunch: 0.35 },
  skree: { file: 'xbot.glb', build: 'lizard', body: 'xbot', lizard: { base: 0x1fb8c8, belly: 0xbff5ff }, h: 2.9, hunch: 0.5 }, // was a knee-high skitterer; Nutty wants nothing small
  gloop: { file: 'veteran.glb', tposeArms: true, build: 'grey', design: 3, h: 1.65, hunch: 0.25, bulk: 1.25 },
  gruk: { file: 'm18.glb', tposeArms: true, h: 3.0, hunch: 0.28, bulk: 1.3, gear: ['fists'], slam: true, tele: [1, 0.5, 0.3] }, // #18 armoured trooper
  lanky: { file: 'veteran.glb', tposeArms: true, build: 'grey', design: 2, h: 2.7, hunch: 0.1, bulk: 0.9, tele: [0.8, 0.5, 1] },
  stinger: { file: 'veteran.glb', tposeArms: true, build: 'grey', design: 1, h: 1.8, hunch: 0.4, tele: [1, 0.9, 0.3] },
  brainer: { file: 'sorceress.glb', h: 2.0, hunch: 0.05, ghost: 0xff7ad0, float: 0.7, cast: true, orb: 0xff5ad0 },
  warden: { file: 'veteran.glb', tposeArms: true, build: 'grey', design: 3, h: 2.6, hunch: 0.15, bulk: 1.3, slam: true, tele: [0.3, 1, 0.9] },
  // The rest of the Mixamo bodies (Nutty 2026-11-05). Their weapons come from MOB_ARM_POOL (data.js), one at random per mob.
  shambler: { file: 'm12.glb', tposeArms: true, h: 1.85, hunch: 0.4, rough: 0.75 }, // #12 rotting man in jeans
  deadcop: { file: 'm13.glb', tposeArms: true, h: 1.85, hunch: 0.35 }, // #13 zombie police officer
  trooper: { file: 'm16.glb', tposeArms: true, h: 1.85, hunch: 0.12 }, // #16 helmeted infantryman
  warmaiden: { file: 'm17.glb', tposeArms: true, h: 1.85, hunch: 0.1 }, // #17 armoured warrior woman
  riot: { file: 'm21.glb', tposeArms: true, h: 1.9, hunch: 0.1, bulk: 1.05 }, // #21 SWAT trooper
  surgeon: { file: 'surgeon.glb', tposeArms: true, h: 2.6, hunch: 0.2, fly: true, wings: { membrane: 0xd8f0f4, bone: 0x3a4a50, span: 1.2, alpha: 0.75 } },
  wasp: { file: 'm29.glb', tposeArms: true, h: 2.8, hunch: 0.35, bulk: 0.95, fly: true, wings: { membrane: 0xffb830, bone: 0x2a1a00, span: 1.1, alpha: 0.8 } }, // #29 striped alien
  // The Hot Springs Valley's boss and the hidden space map's boss, The Visitor (boss rigs are boss + BOSSES index).
  boss7: { file: 'gus.glb', tposeArms: true, h: 8.6, hunch: 0.3, bulk: 1.0, slam: true, hands: 0x9aff6a }, // old Mossback body retired (goblin body removed 2026-11-05)
  boss8: { file: 'veteran.glb', tposeArms: true, build: 'grey', design: 2, h: 10.5, hunch: 0.1, bulk: 1.15, slam: true, hands: 0x7dffb0 },
  // Mixamo bosses (Nutty 2026-11-05): the characters' own textures, scaled up to boss height.
  boss9: { file: 'warlord.glb', tposeArms: true, h: 8.0, hunch: 0.12, bulk: 1.0, slam: true, hands: 0x9a3aff },
  boss10: { file: 'archmage.glb', tposeArms: true, h: 7.6, hunch: 0.1, bulk: 1.0, slam: true, hands: 0xff5ad0 },
  boss11: { file: 'flayed.glb', tposeArms: true, h: 8.4, hunch: 0.3, bulk: 1.05, slam: true, hands: 0xff4a3a },
  boss12: { file: 'rotgut.glb', tposeArms: true, h: 7.0, hunch: 0.35, bulk: 1.0, slam: true, hands: 0x9aff4a },
  boss13: { file: 'king.glb', tposeArms: true, h: 8.8, hunch: 0.05, bulk: 1.0, slam: true, hands: 0xffd04a },
  boss14: { file: 'gus.glb', tposeArms: true, h: 8.2, hunch: 0.1, bulk: 1.0, slam: true, hands: 0xffa040 },
  // Knights: the player's own plate-armour build as an enemy; the dread knight is bigger, blackened and smashes the ground.
  knight: { file: 'veteran.glb', tposeArms: true, build: 'knight', h: 2.0, hunch: 0.1, bulk: 0.95, gear: ['sword', 'kite'], tele: [0.9, 0.9, 1] },
  dreadknight: { file: 'veteran.glb', tposeArms: true, build: 'knight', h: 2.4, hunch: 0.12, bulk: 1.1, tint: 0x3a2a3a, lift: 0.12, slam: true, gear: ['greatsword'], tele: [1, 0.2, 0.2] },
  // Bosses: giants built from the same bodies, one per round.
  boss0: { file: 'xbot.glb', build: 'skeleton', eye: 0x7dffb0, h: 8.0, hunch: 0.25, bulk: 1.15, slam: true, hands: 0x7dffb0 },
  boss1: { file: 'xbot.glb', build: 'lizard', body: 'xbot', lizard: { base: 0x557f1e, belly: 0xd6e48a }, h: 8.0, hunch: 0.35, bulk: 1.2, slam: true, hands: 0xb6ff4a },
  boss2: { file: 'archmage.glb', tposeArms: true, h: 7.6, hunch: 0.35, bulk: 1.0, slam: true },
  boss3: { file: 'soldier.glb', h: 8.2, hunch: 0.1, tint: 0x9cc4e8, bulk: 1.2, visor: 0x9fe8ff, slam: true },
  boss4: { file: 'warlord.glb', tposeArms: true, h: 8.8, hunch: 0.3, bulk: 1.0, slam: true, hands: 0xff6a1a },
  boss5: { file: 'sorceress.glb', h: 9.2, hunch: 0.0, ghost: 0xb08aff, float: 1.2, cast: true, hands: 0xd9a0ff },
};

// The Zombie Staff's dead: six variants of one grave-risen body (see ZV / rotDress), picked by npc id so five in a row all differ.
for (let i = 0; i < 6; i++) MOB_LOOKS['zombie' + i] = { file: 'veteran.glb', tposeArms: true, rot: true, zv: i, h: 1.34, hunch: 0.7, reach: 1.25, lurch: 1, limp: i % 2 ? -1 : 1 };

// Mobs stand taller (skeletons a bit more still); bosses keep their giant height.
for (const [k, l] of Object.entries(MOB_LOOKS)) {
  if (k.startsWith('boss')) continue;
  const g = MOB_SIZE * MOB_TALL * (l.build === 'skeleton' ? 1.2 : 1);
  l.h *= g; if (l.float) l.float *= MOB_SIZE * MOB_TALL;
}

// Fear's echoes: the beaten bosses, back at roughly twice a mob's height.
for (const i of [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14]) { const b = MOB_LOOKS['boss' + i]; if (b) MOB_LOOKS['echo' + i] = { ...b, h: (b.h || 8) * 0.5 }; }
// Thermes: the shirtless demonic viking deity (src/thermes.js), purple pulsing skin, blue aura, laser eyes.
// No short mobs (Nutty 2026-11-05): every regular mob stands at least MOB_MIN_H, and its hit size grows with it.
for (const [k, l] of Object.entries(MOB_LOOKS)) {
  if (k.startsWith('boss') || k.startsWith('echo') || !(l.h < MOB_MIN_H)) continue;
  const f = MOB_MIN_H / l.h;
  l.h = MOB_MIN_H; if (l.float) l.float *= f;
  const m = MOBS[k]; if (m) { m.scale *= f; m.height *= f; m.radius *= Math.min(f, 1.35); }
}
MOB_LOOKS.boss6 = { file: 'veteran.glb', tposeArms: true, build: 'thermes', h: 22, hunch: 0.1, bulk: 1.3, slam: true };

const V = (...a) => new THREE.Vector3(...a);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _r = new THREE.Quaternion();
const AX = V(1, 0, 0), AY = V(0, 1, 0), AZ = V(0, 0, 1);

// Rotate a bone about a world axis. Only this bone's world matrix is
// refreshed (from its parent's); children catch up when they are rotated
// next or when the renderer updates the scene graph.
function rotWorld(bone, axisWorld, angle) {
  if (!bone || Math.abs(angle) < 1e-4) return;
  const parent = bone.parent;
  parent.matrixWorld.decompose(_v1, _q2, _v2);
  _q.copy(_q2).multiply(bone.quaternion);
  _r.setFromAxisAngle(axisWorld, angle);
  bone.quaternion.copy(_q2.invert().multiply(_r.multiply(_q)));
  bone.updateMatrix();
  bone.matrixWorld.multiplyMatrices(parent.matrixWorld, bone.matrix);
}
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
// Refresh a chain's world matrices top-down (after edits to ancestors).
function chain(...bs) { for (const b of bs) if (b) { b.updateMatrix(); b.matrixWorld.multiplyMatrices(b.parent.matrixWorld, b.matrix); } }

// Rotate a bone by a world-space rotation vector (axis * angle): pitch, twist and
// roll of a spine bone become one matrix update instead of three.
const _w = new THREE.Vector3();
function rotVec(bone, x, y, z) {
  if (!bone) return;
  const ang = Math.sqrt(x * x + y * y + z * z);
  if (ang < 1e-4) return;
  const parent = bone.parent;
  parent.matrixWorld.decompose(_v1, _q2, _v2);
  _q.copy(_q2).multiply(bone.quaternion);
  _r.setFromAxisAngle(_w.set(x / ang, y / ang, z / ang), ang);
  bone.quaternion.copy(_q2.invert().multiply(_r.multiply(_q)));
  bone.updateMatrix();
  bone.matrixWorld.multiplyMatrices(parent.matrixWorld, bone.matrix);
}

// Body frame of the mob being animated: side, up, forward (3 floats each).
const AXS = new Float64Array(9);
function rv(bone, pitch, twist, roll) {
  rotVec(bone, AXS[0] * pitch + AXS[3] * twist + AXS[6] * roll, AXS[1] * pitch + AXS[4] * twist + AXS[7] * roll, AXS[2] * pitch + AXS[5] * twist + AXS[8] * roll);
}
const { smoothstep: ss, clamp } = THREE.MathUtils;
const TAU = Math.PI * 2;
// Attack/hit timing helpers.
const wrapPi = (d) => d - TAU * Math.round(d / TAU);

// Walk/run stride of a template, measured once from its own clips: how fast the
// planted foot travels backwards at clip speed (so the body can move at exactly
// that speed and the feet do not skate), plus the cycle phase of the left heel strike
// so the walk and run cycles can share one phase while they blend.
function measureStride(tpl) {
  if (tpl.stride) return tpl.stride;
  const fb = { vw: 1.3 * tpl.scale, vr: 2.2 * tpl.scale, dw: 0.9667, dr: 0.7, ow: 0.208, or: 0.283 };
  try {
    const root = SkeletonUtils.clone(tpl.scene);
    root.scale.setScalar(tpl.scale);
    const b = bonesOf(root);
    const feet = [b.get('LeftFoot'), b.get('RightFoot')];
    if (!feet[0] || !feet[1]) return (tpl.stride = fb);
    const mixer = new THREE.AnimationMixer(root);
    const out = { ...fb };
    const N = 36, pos = [new Float32Array((N + 1) * 3), new Float32Array((N + 1) * 3)], p = new THREE.Vector3();
    for (const name of ['walk', 'run']) {
      const clip = tpl.clips[name], dur = clip.duration;
      const act = mixer.clipAction(clip); act.play();
      for (let i = 0; i <= N; i++) {
        act.time = (dur * i) / N; mixer.update(0); root.updateMatrixWorld(true);
        for (let f = 0; f < 2; f++) { feet[f].getWorldPosition(p); p.toArray(pos[f], i * 3); }
      }
      act.stop(); mixer.uncacheAction(clip);
      let sum = 0, cnt = 0, strike = 0;
      for (let f = 0; f < 2; f++) {
        let ymin = 1e9, ymax = -1e9, zi = 0, zmax = -1e9;
        for (let i = 0; i <= N; i++) { const y = pos[f][i * 3 + 1]; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
        const lim = ymin + 0.25 * (ymax - ymin) + 0.01;
        for (let i = 0; i < N; i++) {
          if (pos[f][i * 3 + 1] < lim && pos[f][(i + 1) * 3 + 1] < lim) { sum += Math.hypot(pos[f][(i + 1) * 3] - pos[f][i * 3], pos[f][(i + 1) * 3 + 2] - pos[f][i * 3 + 2]) / (dur / N); cnt++; }
        }
        if (f === 0) { for (let i = 0; i < N; i++) { const z = pos[0][i * 3 + 2] * Math.cos(tpl.yaw) - pos[0][i * 3] * Math.sin(tpl.yaw); if (z > zmax) { zmax = z; zi = i; } } strike = zi / N; }
      }
      if (cnt > 6) { const v = sum / cnt; if (name === 'walk') { out.vw = v; out.dw = dur; out.ow = strike; } else { out.vr = v; out.dr = dur; out.or = strike; } }
    }
    mixer.uncacheRoot(root);
    out.lw = out.vw * out.dw; out.lr = out.vr * out.dr;
    return (tpl.stride = out);
  } catch (e) { return (tpl.stride = fb); }
}

function ghostMaterial(color) {
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.4, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      float fr = pow(clamp(1.0 - abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 2.0);
      gl_FragColor.a *= 0.25 + fr * 1.2;
      gl_FragColor.rgb += emissive * fr * 0.8;
      if (any(isnan(gl_FragColor)) || any(isinf(gl_FragColor))) discard;`);
  };
  return m;
}

// Moonlit rim so dark creatures still read against a night scene.
function addRim(m, color = 0x8fa4d8, k = 0.55) {
  if (m.userData.rim) return m;
  m.userData.rim = true;
  const prev = m.onBeforeCompile;
  const hasPrev = prev && prev.toString().includes('sh.');
  m.onBeforeCompile = (sh, r) => {
    if (hasPrev) prev.call(m, sh, r);
    sh.uniforms.uRim = { value: new THREE.Color(color).multiplyScalar(k) };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace('#include <opaque_fragment>', `{ float rv = clamp(1.0 - abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0); outgoingLight += uRim * rv * rv * rv; }
      #include <opaque_fragment>`);
  };
  const key = hasPrev ? prev.toString() : '';
  m.customProgramCacheKey = () => 'rim|' + key;
  m.needsUpdate = true;
  return m;
}

// Per-type material dressing, applied once to the shared template.
function dress(tpl, look) {
  if (tpl.dressed) return;
  tpl.dressed = true;
  const ghost = look.ghost ? ghostMaterial(look.ghost) : null;
  const done = new Map();
  const fix = (m) => {
    if (done.has(m)) return done.get(m);
    let n = m;
    if (ghost) n = ghost;
    else if (m.onBeforeCompile && m.onBeforeCompile.toString().includes('sh.') && !look.tint) n = m; // custom shader (lizard skin): keep as is
    else {
      n = m.clone();
      if (m.onBeforeCompile && m.onBeforeCompile.toString().includes('sh.')) { n.onBeforeCompile = m.onBeforeCompile; n.customProgramCacheKey = m.customProgramCacheKey; } // a tinted hero kit keeps its wear shader
      if (look.tint && n.color) n.color.multiply(new THREE.Color(look.tint));
      // Dark textures swallow a tint: `lift` adds the tint back as a faint glow so the colour still reads at a glance.
      if (look.tint && look.lift && n.emissive) n.emissive.copy(new THREE.Color(look.tint)).multiplyScalar(look.lift);
      if (look.rough != null && 'roughness' in n) n.roughness = look.rough;
    }
    if (!ghost && (n.isMeshStandardMaterial || n.isMeshPhysicalMaterial)) addRim(n);
    done.set(m, n);
    return n;
  };
  tpl.scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    if (look.visor && /visor/i.test(o.name)) { o.material = new THREE.MeshStandardMaterial({ color: 0x110302, emissive: look.visor, emissiveIntensity: 2.4, roughness: 0.2, metalness: 0.6 }); return; }
    o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material);
    if (ghost) o.castShadow = false;
  });
}

// Rotting dead flesh for a rigged avatar (look.rot): skin goes grey-green with dark necrotic patches, caked grave mud and dried blood
// round the mouth and chest; the clothes are filthy, dark and torn (ragged hems and holes cut with noise); the eyes are milky.
// Done in the shader from the bind-pose position (no extra textures). Each variant (ZV) also cuts parts away in the shader
// (a forearm, a shin, a jaw, a patch of skull, a belly) and glues bone, torn flesh and entrails on as a few merged rigid meshes.
const ROT_GLSL = `
  varying vec3 vBind;
  float vHell = 0.;
  float rh(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float rn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
    return mix(mix(mix(rh(i), rh(i + vec3(1,0,0)), f.x), mix(rh(i + vec3(0,1,0)), rh(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(rh(i + vec3(0,0,1)), rh(i + vec3(1,0,1)), f.x), mix(rh(i + vec3(0,1,1)), rh(i + vec3(1,1,1)), f.x), f.y), f.z); }`;
function rotMaterial(src, kind, y0, hh, zc) {
  const m = new THREE.MeshStandardMaterial({ map: src.map || null, color: src.color ? src.color.clone() : 0xffffff, roughness: kind === 'skin' ? 0.82 : 0.95, metalness: 0, side: kind === 'skin' || kind === 'shoe' ? THREE.FrontSide : THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBind;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>' + ROT_GLSL + (kind === 'shoe' ? 'const bool kind_shoe = true;' : 'const bool kind_shoe = false;'))
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${zc.cut}
        vec3 q = vBind * ${(1 / hh * 1.8).toFixed(3)};
        float ny = (vBind.y - ${y0.toFixed(4)}) / ${hh.toFixed(4)};
        float lum = dot(diffuseColor.rgb, vec3(.3, .59, .11));
        float bl = rn(q * 5.) * .6 + rn(q * 13.) * .4;
        ${kind === 'skin' ? `
        vec3 flesh = mix(vec3(lum) * vec3(.62, .82, .5), vec3(.27, .36, .22), .45);
        flesh = mix(flesh, vec3(.13, .19, .15), smoothstep(.42, .7, bl));
        flesh *= .75 + .5 * rn(q * 31.);
        float wound = smoothstep(.84, .88, rn(q * 13. + 21.));
        flesh = mix(flesh, vec3(.34, .05, .03), wound);
        flesh = mix(flesh, vec3(.1, .05, .04), smoothstep(.8, .9, rn(q * 17. + 1.)) * .8);
        float vein = smoothstep(.02, .0, abs(rn(q * 5. + 3.) - .5)) * smoothstep(.55, .8, rn(q * 2. + 9.));
        diffuseColor.rgb = flesh;
        vHell = 0.;` : `
        vec3 rag = vec3(lum) * vec3(.5, .46, .4) * .7;
        rag = mix(rag, vec3(.16, .04, .03), smoothstep(.66, .78, rn(q * 6. + 4.)) * .85);
        rag = mix(rag, vec3(.07, .06, .05), smoothstep(.5, .75, rn(q * 9. + 8.)) * .7);
        diffuseColor.rgb = rag * (.5 + .6 * bl);
        float cut = ${kind === 'top' ? 'ny - (.5 + .09 * rn(q * 12.))' : kind === 'bottom' ? 'ny - (.1 + .1 * rn(q * 11.))' : '1.'};
        if (kind_shoe) diffuseColor.rgb = vec3(lum) * .3;
        if (cut < 0. || rn(q * 15. + 2.) > .83) discard;`}
        ${zc.blood}
        float mud = smoothstep(.5, .78, rn(q * 4. + 11.) * .65 + (1. - ny) * .45 + rn(q * 23.) * .15);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.2, .14, .09) * (.7 + .5 * rn(q * 30.)), mud * ${kind === 'skin' ? '.6' : '.85'});`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        ${kind === 'skin' ? 'totalEmissiveRadiance += vec3(1., .3, .04) * vHell * 1.2;' : ''}`);
  };
  addRim(m, 0xff6a2a, 0.12);
  m.customProgramCacheKey = () => 'zrot|' + kind + '|' + zc.key; // addRim keys the program on the shader source, which is the same for every kind
  return m;
}
// Variants: which parts are gone or torn open. arm/leg: side whose forearm (hand = just the hand) / shin is missing; gut: belly torn open
// with entrails; ribs: ribcage showing; jaw: jaw torn away; skull: a patch of skull showing; strips: hanging strips of flesh.
const ZV = [
  { arm: 'Right', gut: 1, strips: 1 },
  { leg: 'Left', ribs: 1, strips: 1 },
  { jaw: 1, skull: 1, arm: 'Left', hand: 1 },
  { gut: 1, jaw: 1, strips: 1 },
  { ribs: 1, arm: 'Left', skull: 1 },
  { leg: 'Right', skull: 1, gut: 1 },
];
function zombieParts(tpl, hh, vi) {
  const v = ZV[vi % ZV.length], sc = tpl.scene, bones = bonesOf(sc), s = hh / 1.8;
  sc.updateMatrixWorld(true);
  const P = (n) => bones.get(n).getWorldPosition(V());
  const f = (x) => x.toFixed(4), v3 = (p) => f(p.x) + ',' + f(p.y) + ',' + f(p.z);
  const M = {
    bone: new THREE.MeshStandardMaterial({ color: 0xd8cfae, roughness: 0.75 }),
    flesh: new THREE.MeshStandardMaterial({ color: 0x5c1214, roughness: 0.55, side: THREE.DoubleSide }),
    gut: new THREE.MeshStandardMaterial({ color: 0xb87078, roughness: 0.35, emissive: 0x2a0c10 }),
    hole: new THREE.MeshBasicMaterial({ color: 0x240606, side: THREE.DoubleSide }),
  };
  const cut = [], blood = [], key = [vi];
  const add = (bone, geo, mat) => { const m = new THREE.Mesh(geo, mat); sc.add(m); bones.get(bone).attach(m); };
  const sph = (c, r) => cut.push(`if (distance(vBind, vec3(${v3(c)})) < ${f(r)}) discard;`);
  const stain = (c, r, k = 0.85) => blood.push(`{ float b = smoothstep(${f(r)}, ${f(r * 0.3)}, distance(vBind, vec3(${v3(c)})) + (rn(q * 18.) - .5) * ${f(r * 0.8)}); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.24, .03, .04), b * ${f(k)}); }`);
  const ell = (c, rx, ry, rz) => new THREE.SphereGeometry(1, 10, 8).scale(rx * s, ry * s, rz * s).translate(c.x, c.y, c.z);
  const tube = (pts, r, seg = 14) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r * s, 6);
  const along = (a, b, r, seg = 7) => { const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r * s, r * s * 1.15, d.length(), seg); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize())); return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); };
  const fwd = (p, d, y = 0) => p.clone().add(V(0, y * s, d * s));
  // dried blood round the mouth and down the chest, on every zombie
  const head = P('Head'), mouth = fwd(head, 0.09, 0.05), chest = fwd(P('Spine2'), 0.12);
  stain(mouth, 0.1 * s); stain(fwd(head, 0.08, -0.04), 0.12 * s, 0.8); stain(chest, 0.2 * s, 0.7); stain(fwd(P('Spine1'), 0.12), 0.14 * s, 0.6);
  // limbs: the shader cuts everything beyond a point along the bone (a half-line, so the hand and fingers go too)
  const limb = (a, b, tmin, r) => cut.push(`{ vec3 a = vec3(${v3(a)}), d = vec3(${v3(b.clone().sub(a))}); float t = dot(vBind - a, d) / dot(d, d); if (t > ${f(tmin)} && length(vBind - a - d * t) < ${f(r)}) discard; }`);
  if (v.arm) {
    const E = P(v.arm + 'ForeArm'), W = P(v.arm + 'Hand'), t = v.hand ? 0.93 : 0.5, C = E.clone().lerp(W, t), dir = W.clone().sub(E).normalize();
    limb(E, W, t, 0.16 * s);
    add(v.arm + 'ForeArm', along(C.clone().addScaledVector(dir, -0.02 * s), C.clone().addScaledVector(dir, 0.07 * s), 0.011), M.bone);
    add(v.arm + 'ForeArm', new THREE.TorusGeometry(0.034 * s, 0.014 * s, 6, 10).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), dir)).translate(C.x, C.y, C.z), M.flesh);
    add(v.arm + 'ForeArm', along(C.clone().addScaledVector(dir, -0.04 * s), C.clone().addScaledVector(dir, 0.01 * s), 0.036), M.flesh);
    stain(C, 0.14 * s, 0.9);
  }
  if (v.leg) {
    const K = P(v.leg + 'Leg'), A = P(v.leg + 'Foot'), t = 0.5, C = K.clone().lerp(A, t), dir = A.clone().sub(K).normalize();
    limb(K, A, t, 0.24 * s);
    add(v.leg + 'Leg', along(C, A.clone().add(V(0, -0.04 * s, 0)), 0.014), M.bone); // a bare shin bone to limp on
    add(v.leg + 'Leg', along(C.clone().addScaledVector(dir, -0.05 * s), C.clone().addScaledVector(dir, 0.03 * s), 0.05), M.flesh);
    stain(C, 0.2 * s, 0.9);
  }
  if (v.gut || v.ribs) {
    const c = v.gut ? fwd(P('Spine'), 0.13, -0.02) : chest.clone().add(V(0, 0.02 * s, 0));
    sph(c, (v.gut ? 0.12 : 0.13) * s);
    add(v.gut ? 'Spine' : 'Spine2', ell(c.clone().add(V(0, 0, -0.035 * s)), 0.1, v.gut ? 0.11 : 0.12, 0.05), M.hole);
    stain(c, 0.2 * s, 0.9);
    if (v.gut) {
      // entrails: thick pink-grey loops spilling out of the belly and hanging down the front of the legs
      const loops = [];
      for (let k = 0; k < 5; k++) {
        const dx = (k - 2) * 0.05 * s, pts = [], len = (0.12 + ((k * 7) % 4) * 0.07) * s;
        for (let j = 0; j <= 7; j++) { const u = j / 7; pts.push(V(c.x + dx + Math.sin(u * 9 + k * 2) * 0.03 * s, c.y + 0.03 * s - u * len, c.z + 0.07 * s + Math.cos(u * 8 + k) * 0.025 * s + u * 0.03 * s)); }
        loops.push(tube(pts, 0.017 + (k % 2) * 0.004, 20));
      }
      add('Hips', mergeGeometries(loops.map((g) => g.toNonIndexed())), M.gut);
    }
    if (v.ribs) {
      const ribs = [], r0 = chest.clone();
      for (let k = 0; k < 5; k++) ribs.push(new THREE.TorusGeometry(0.1 * s, 0.0075 * s, 5, 12, Math.PI).rotateX(Math.PI / 2).scale(1, 1, 0.8).translate(c.x, c.y + (k - 2) * 0.034 * s, c.z - 0.085 * s));
      ribs.push(along(V(c.x, c.y - 0.09 * s, c.z + 0.0), V(c.x, c.y + 0.1 * s, c.z + 0.0), 0.009, 5).toNonIndexed());
      add('Spine2', mergeGeometries(ribs.map((g) => (g.index ? g.toNonIndexed() : g))), M.bone);
    }
  }
  if (v.jaw) {
    const c = fwd(head, 0.075, 0.035);
    sph(c, 0.075 * s);
    add('Head', ell(fwd(head, 0.055, 0.045), 0.06, 0.055, 0.04), M.hole);
    // the torn lower jaw dangling on a strip of flesh, teeth showing
    const jc = fwd(head, 0.1, -0.1);
    add('Head', mergeGeometries([new THREE.TorusGeometry(0.045 * s, 0.009 * s, 5, 10, Math.PI).rotateX(-Math.PI / 2).translate(jc.x, jc.y, jc.z).toNonIndexed(), along(fwd(head, 0.07, 0.0), fwd(head, 0.1, -0.08), 0.008, 5).toNonIndexed()]), M.bone);
    add('Head', along(fwd(head, 0.06, -0.01), fwd(head, 0.09, -0.08), 0.012, 5), M.flesh);
    stain(c, 0.12 * s, 0.9);
  }
  if (v.skull) {
    const c = head.clone().add(V(0.045 * s, 0.17 * s, -0.01 * s));
    sph(c, 0.065 * s);
    add('Head', ell(c.clone().add(V(0, -0.012 * s, 0)), 0.062, 0.05, 0.062), M.hole);
    add('Head', new THREE.SphereGeometry(0.052 * s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(c.x, c.y - 0.012 * s, c.z), M.bone);
    add('Head', new THREE.TorusGeometry(0.06 * s, 0.01 * s, 5, 12).rotateX(Math.PI / 2).translate(c.x, c.y, c.z), M.flesh);
    stain(c, 0.1 * s, 0.9);
  }
  if (v.strips) {
    const st = [], at = P('Spine2');
    [[0.15, 0.04, 0.1, 0.26, 0.3], [-0.16, 0.0, 0.08, 0.2, -0.25], [0.04, -0.06, 0.13, 0.16, 0.1], [-0.05, 0.08, -0.13, 0.22, 0.2]].forEach(([x, y, z, l, rot]) => {
      st.push(new THREE.BoxGeometry(0.04 * s, l * s, 0.008 * s).translate(0, -l * s / 2, 0).rotateZ(rot).translate(at.x + x * s, at.y + y * s, at.z + z * s));
    });
    add('Spine2', mergeGeometries(st.map((g) => g.toNonIndexed())), M.flesh);
  }
  return { cut: cut.join('\n'), blood: blood.join('\n'), key: key.join('') };
}
function rotDress(tpl, look) {
  const box = new THREE.Box3().setFromObject(tpl.scene), y0 = box.min.y, hh = Math.max(0.1, box.max.y - box.min.y);
  const zc = zombieParts(tpl, hh, look.zv || 0);
  const mats = {};
  const get = (kind, src) => mats[kind + src.uuid] || (mats[kind + src.uuid] = rotMaterial(src, kind, y0, hh, zc));
  tpl.scene.traverse((o) => {
    if (!o.isMesh || o.userData.zpart) return;
    const n = o.name || '';
    if (/Eye/i.test(n)) o.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 0.78, 0.5).multiplyScalar(0.85), toneMapped: false }); // milky, dull yellow
    else if (/Head|Body/i.test(n)) o.material = get('skin', o.material);
    else if (/Outfit_Top/i.test(n)) o.material = get('top', o.material);
    else if (/Outfit_Bottom/i.test(n)) o.material = get('bottom', o.material);
    else if (/Footwear/i.test(n)) o.material = get('shoe', o.material);
    else if (/Beard|Teeth/i.test(n)) { o.material = o.material.clone(); o.material.color.multiply(new THREE.Color(0.75, 0.7, 0.45)); }
  });
}

// Collapse a built creature (skinned body plus rigid parts glued to bones)
// into one skinned mesh per material: dozens of draw calls become a few.
function collapse(root) {
  root.updateMatrixWorld(true);
  const bones = []; root.traverse((o) => { if (o.isBone) bones.push(o); });
  const bIdx = new Map(bones.map((b, i) => [b, i]));
  const inverses = bones.map((b) => b.matrixWorld.clone().invert());
  const byMat = new Map();
  const meshes = []; root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const m4 = new THREE.Matrix4(), acc = new THREE.Matrix4(), tmp = new THREE.Matrix4(), nm = new THREE.Matrix3();
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  // A hero-kit mesh (knight plate, pirate coat, ninja cloth) is one skinned mesh with a material per geometry group: split it into
  // one piece per group so each lands in its material's bucket like any other mesh.
  const pieces = [];
  for (const mesh of meshes) {
    let vis = mesh.visible; for (let p = mesh.parent; p && vis; p = p.parent) vis = p.visible;
    if (!vis) continue;
    if (!Array.isArray(mesh.material)) { pieces.push([mesh, mesh.geometry, mesh.material]); continue; }
    const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    for (const gr of geo.groups) {
      const sub = new THREE.BufferGeometry();
      for (const [k, a] of Object.entries(geo.attributes)) sub.setAttribute(k, new THREE.BufferAttribute(a.array.slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize), a.itemSize));
      pieces.push([mesh, sub, mesh.material[gr.materialIndex]]);
    }
  }
  for (const [mesh, src, material] of pieces) {
    const cnt = src.attributes.position.count;
    const pos = new Float32Array(cnt * 3), nor = new Float32Array(cnt * 3), uv = new Float32Array(cnt * 2);
    const si = new Uint16Array(cnt * 4), sw = new Float32Array(cnt * 4);
    const P = src.attributes.position, N = src.attributes.normal, U = src.attributes.uv, C = src.attributes.color;
    let rigidBone = null;
    if (!mesh.isSkinnedMesh) { for (let p = mesh.parent; p; p = p.parent) if (p.isBone) { rigidBone = p; break; } }
    const rb = rigidBone ? bIdx.get(rigidBone) : 0;
    for (let i = 0; i < cnt; i++) {
      if (mesh.isSkinnedMesh) {
        const sk = mesh.skeleton, SI = src.attributes.skinIndex, SW = src.attributes.skinWeight;
        acc.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        for (let k = 0; k < 4; k++) {
          const w = SW.getComponent(i, k); if (!w) continue;
          const bone = sk.bones[SI.getComponent(i, k)];
          tmp.multiplyMatrices(bone.matrixWorld, sk.boneInverses[SI.getComponent(i, k)]);
          for (let e = 0; e < 16; e++) acc.elements[e] += tmp.elements[e] * w;
          si[i * 4 + k] = bIdx.get(bone); sw[i * 4 + k] = w;
        }
        m4.multiplyMatrices(acc, mesh.bindMatrix);
      } else {
        m4.copy(mesh.matrixWorld);
        si[i * 4] = rb; sw[i * 4] = 1;
      }
      v.fromBufferAttribute(P, i).applyMatrix4(m4);
      if (v.x !== v.x || v.y !== v.y || v.z !== v.z) v.set(pos[0], pos[1], pos[2]); // a kit's stray NaN vertex (the ninja's cloth has a few) folds into a flat triangle instead of breaking the bounds
      pos.set([v.x, v.y, v.z], i * 3);
      if (N) { nm.getNormalMatrix(m4); n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.set([n.x, n.y, n.z], i * 3); }
      if (U) uv.set([U.getX(i), U.getY(i)], i * 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    if (src.index) g.setIndex(Array.from(src.index.array));
    else g.setIndex([...Array(cnt).keys()]);
    if (!N) g.computeVertexNormals();
    // Vertex colours ride along for materials that read them (every piece in such a bucket gets one, so they still merge).
    if (material.vertexColors) g.setAttribute('color', C && C.itemSize === 3 ? new THREE.BufferAttribute(C.array.slice(0, cnt * 3), 3) : new THREE.BufferAttribute(new Float32Array(cnt * 3).fill(1), 3));
    if (!byMat.has(material)) byMat.set(material, []);
    byMat.get(material).push(g);
  }
  for (const m of meshes) m.removeFromParent();
  const skel = new THREE.Skeleton(bones, inverses);
  for (const [mat, geos] of byMat) {
    const g = mergeGeometries(geos, false);
    if (!g) continue;
    g.computeBoundingSphere();
    const sm = new THREE.SkinnedMesh(g, mat);
    sm.castShadow = true;
    root.add(sm);
    sm.bind(skel, new THREE.Matrix4());
  }
}

// ---------- rigid gear (shields, kegs, staffs, robes ...) ----------
// Pieces are modelled in the creature's own frame (metres for a 1.8 m body; +Y up, +Z forward, +X its left), placed from
// the bones of the rest pose, and glued to a bone as rigid meshes BEFORE collapse(): they get skinned into the body mesh
// and cost one extra draw call per material (not per piece, not per mob).
const GEAR_MATS = {
  steel: () => new THREE.MeshStandardMaterial({ color: 0x8896b0, roughness: 0.38, metalness: 0.75 }),
  gold: () => new THREE.MeshStandardMaterial({ color: 0xd2a22e, roughness: 0.3, metalness: 0.85 }),
  wood: () => new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.8 }),
  bone: () => new THREE.MeshStandardMaterial({ color: 0xe6dab0, roughness: 0.6 }),
  stone: () => new THREE.MeshStandardMaterial({ color: 0x7c7466, roughness: 0.9 }),
  cloth: () => new THREE.MeshStandardMaterial({ color: 0x1d1830, roughness: 0.95, side: THREE.DoubleSide }),
  rag: () => new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 1, side: THREE.DoubleSide }),
  gun: () => new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.42, metalness: 0.7 }),
  poly: () => new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.7, metalness: 0.1 }),
  rust: () => new THREE.MeshStandardMaterial({ color: 0x6b4a36, roughness: 0.75, metalness: 0.45 }),
  iron: () => new THREE.MeshStandardMaterial({ color: 0x5c5f66, roughness: 0.5, metalness: 0.7 }),
  plank: () => new THREE.MeshStandardMaterial({ color: 0x8a6a46, roughness: 0.9 }),
  glowO: () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff7a1a).multiplyScalar(2.2), toneMapped: false }),
  glowG: () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8aff30).multiplyScalar(2.0), toneMapped: false }),
  glowC: () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7dffb0).multiplyScalar(2.2), toneMapped: false }),
};
// Weapons a mob carries from MOB_ARMS: on armed types the template leaves its old weapon out and each mob gets its own.
const WEAPON_GEAR = new Set(['blade', 'dagger', 'sword', 'greatsword', 'club', 'rifle', ...Object.values(MOB_ARMS).map((a) => a.gear)]);
const SHARED_MATS = {};
function buildGear(tpl, look, names = look.gear, shared = null) {
  const scene = tpl.scene;
  scene.updateMatrixWorld(true);
  const bones = bonesOf(scene), s = look.h / 1.8;
  const toI = new THREE.Matrix4().makeScale(tpl.scale, tpl.scale, tpl.scale).multiply(new THREE.Matrix4().makeRotationY(tpl.yaw));
  const toT = toI.clone().invert();
  const mats = shared || {};
  const mat = (k) => mats[k] || (mats[k] = (() => { const m = GEAR_MATS[k](); if (m.isMeshStandardMaterial) addRim(m); return m; })());
  const bp = (n) => (bones.get(n) ? bones.get(n).getWorldPosition(V()).applyMatrix4(toI) : V());
  const ID = { u: V(0, 1, 0), f: V(0, 0, 1) };
  // Frame along a limb: Y runs hand -> elbow (up, once the arm hangs), Z is as far forward as that allows.
  const limb = (hand, fore) => {
    const u = bp(fore).sub(bp(hand)).normalize(), f = V(0, 0, 1).addScaledVector(u, -u.z).normalize();
    return { u, f };
  };
  const put = (bone, matKey, geo, o = [0, 0, 0], fr = ID, rot) => {
    const b = bones.get(bone); if (!b) return;
    const y = fr.u, z = fr.f, x = V().crossVectors(y, z).normalize();
    const M = new THREE.Matrix4().makeBasis(x, y, z);
    const origin = bp(bone).addScaledVector(x, o[0] * s).addScaledVector(y, o[1] * s).addScaledVector(z, o[2] * s);
    M.setPosition(origin);
    if (rot) geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
    geo.scale(s, s, s);
    geo.applyMatrix4(M).applyMatrix4(toT);
    const m = new THREE.Mesh(geo, mat(matKey));
    scene.add(m); b.attach(m);
  };
  const cyl = (r0, r1, h, seg = 10) => new THREE.CylinderGeometry(r1, r0, h, seg);
  const cone = (r, h, seg = 8) => new THREE.ConeGeometry(r, h, seg);
  const ball = (r) => new THREE.SphereGeometry(r, 12, 10);
  const merge = (arr) => mergeGeometries(arr.map((g) => (g.index ? g.toNonIndexed() : g)));
  const G = {
    // Bulwark: a kite shield strapped over the chest.
    tower() {
      const sh = new THREE.Shape();
      sh.moveTo(-0.42, 0.52); sh.lineTo(0.42, 0.52); sh.lineTo(0.46, 0.08); sh.lineTo(0.27, -0.5); sh.lineTo(0, -0.7); sh.lineTo(-0.27, -0.5); sh.lineTo(-0.46, 0.08); sh.closePath();
      const plate = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.02, bevelSegments: 1 });
      plate.scale(0.82, 0.82, 1);
      put('Spine2', 'steel', plate, [0, 0.0, 0.27]);
      put('Spine2', 'gold', merge([ball(0.12).scale(1, 1, 0.55).translate(0, 0.05, 0.16), new THREE.BoxGeometry(0.07, 0.86, 0.04).translate(0, -0.05, 0.12), new THREE.BoxGeometry(0.66, 0.06, 0.04).translate(0, 0.32, 0.12)]), [0, 0.0, 0.27]);
    },
    // Bomber: a powder keg with a lit fuse strapped to its back.
    keg() {
      put('Spine2', 'wood', merge([cyl(0.19, 0.21, 0.5, 12).translate(0, 0, 0), cyl(0.02, 0.02, 0.14, 6).translate(0, 0.31, 0)]), [0, -0.08, -0.3]);
      put('Spine2', 'steel', merge([new THREE.TorusGeometry(0.205, 0.022, 6, 14).rotateX(Math.PI / 2).translate(0, 0.14, 0), new THREE.TorusGeometry(0.205, 0.022, 6, 14).rotateX(Math.PI / 2).translate(0, -0.14, 0)]), [0, -0.08, -0.3]);
      put('Spine2', 'glowO', ball(0.075).translate(0, 0.4, 0), [0, -0.08, -0.3]);
    },
    // Pouncer: a ridge of bone spikes down the back.
    ridge() {
      const at = [['Hips', 0.16], ['Spine', 0.2], ['Spine1', 0.24], ['Spine2', 0.26], ['Neck', 0.2]];
      at.forEach(([bn, h], i) => put(bn, 'bone', cone(0.05 + i * 0.004, h, 6).rotateX(-0.9).translate(0, h / 2, 0), [0, 0.04, -0.14]));
    },
    // Cinderfiend: glowing shoulder and back spikes.
    embers() {
      for (const sd of ['Left', 'Right']) {
        const k = sd === 'Left' ? 1 : -1;
        put(sd + 'Shoulder', 'glowO', merge([cone(0.07, 0.42, 6).rotateZ(-0.5 * k).translate(0.09 * k, 0.22, 0), cone(0.05, 0.28, 6).rotateZ(-0.9 * k).translate(0.13 * k, 0.1, 0.08)]), [0, 0.05, -0.02]);
      }
      put('Spine2', 'glowO', merge([cone(0.06, 0.34, 6).rotateX(-0.6).translate(0, 0.2, 0), cone(0.05, 0.26, 6).rotateX(-0.6).translate(0.14, 0.12, 0), cone(0.05, 0.26, 6).rotateX(-0.6).translate(-0.14, 0.12, 0)]), [0, 0.0, -0.17]);
    },
    // Venomfang: swollen venom sacs on its back.
    sacs() {
      put('Spine2', 'glowG', merge([ball(0.17).translate(0, 0.02, 0), ball(0.12).translate(0.18, -0.12, 0.02), ball(0.1).translate(-0.16, -0.16, 0.0), ball(0.08).translate(0.02, 0.22, 0.04)]), [0, 0, -0.24]);
    },
    // Necromancer: a hooded mantle, a ragged robe and a skull-topped staff.
    robe() {
      const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector2(0.2 + t * 0.2 + Math.sin(t * 9) * 0.015, -t * 1.05)); }
      put('Hips', 'cloth', new THREE.LatheGeometry(pts, 14), [0, 0.08, 0]);
      put('Head', 'cloth', merge([cone(0.15, 0.36, 12).translate(0, 0.24, -0.03), ball(0.16).scale(1, 1.15, 1.05).translate(0, 0.06, -0.06)]), [0, 0.0, 0]);
      put('Spine2', 'cloth', new THREE.CylinderGeometry(0.13, 0.3, 0.46, 14, 1, true).translate(0, 0, 0), [0, -0.08, -0.01]);
    },
    staff() {
      const fr = limb('RightHand', 'RightForeArm');
      put('RightHand', 'wood', cyl(0.03, 0.03, 1.8, 6).translate(0, 0.35, 0), [0, 0, 0.05], fr);
      put('RightHand', 'bone', merge([ball(0.1).scale(1, 1.1, 1).translate(0, 1.31, 0), cone(0.03, 0.2, 5).translate(0.09, 1.38, 0).rotateZ(0), cone(0.03, 0.2, 5).translate(-0.09, 1.38, 0)]), [0, 0, 0.05], fr);
      put('RightHand', 'glowC', ball(0.07).translate(0, 1.44, 0), [0, 0, 0.05], fr);
    },
    // Archer: a recurve bow in the left hand and a quiver of arrows.
    bow() {
      const fr = limb('LeftHand', 'LeftForeArm');
      const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10 * 2 - 1; pts.push(V(0, t * 0.62, 0.3 * (1 - t * t))); }
      put('LeftHand', 'wood', merge([new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.024, 6), cyl(0.006, 0.006, 1.24, 4).translate(0, 0, 0)]), [0, 0.3, 0.02], fr);
    },
    quiver() {
      put('Spine2', 'wood', merge([cyl(0.075, 0.085, 0.55, 8).translate(0, 0.0, 0), cone(0.04, 0.12, 4).translate(0.02, 0.34, 0), cone(0.04, 0.12, 4).translate(-0.03, 0.31, 0.03)]), [0.1, 0.02, -0.26], ID, [0.0, 0.0, -0.35]);
    },
    // Cave Troll: a big spiked club.
    club() {
      const fr = limb('RightHand', 'RightForeArm');
      const spikes = []; for (let i = 0; i < 6; i++) { const a = i * 1.05; spikes.push(cone(0.03, 0.11, 5).rotateZ(-Math.PI / 2).translate(0.2, 0, 0).rotateY(a).translate(0, 0.46 + (i % 2) * 0.1, 0)); }
      put('RightHand', 'wood', merge([cyl(0.05, 0.06, 0.7, 8).translate(0, 0.15, 0), cyl(0.1, 0.2, 0.32, 10).translate(0, 0.52, 0), ...spikes]), [0, 0, 0.06], fr);
    },
    // Zombie: ragged strips of cloth hanging off the waist and shoulders.
    rags() {
      const strip = (w, l, tilt) => new THREE.BoxGeometry(w, l, 0.012).translate(0, -l / 2, 0).rotateX(tilt);
      const hips = [[0.14, 0.34, 0.1, 0.3], [-0.12, 0.42, 0.14, 0.4], [0.02, 0.3, -0.05, -0.2], [-0.2, 0.28, 0.1, -0.1], [0.22, 0.26, 0.05, 0.1]];
      put('Hips', 'rag', merge(hips.map(([x, l, tz, rx]) => strip(0.08, l, rx).translate(x, 0.02, 0.17 + tz * 0.3))), [0, -0.02, 0]);
      put('Spine2', 'rag', merge([strip(0.1, 0.34, 0.2).translate(0.12, 0.02, -0.18), strip(0.07, 0.26, -0.1).translate(-0.1, 0.0, -0.2), strip(0.09, 0.22, 0.1).translate(0.0, 0.04, 0.2)]), [0, 0.1, 0]);
      put('LeftArm', 'rag', merge([strip(0.06, 0.2, 0.3).translate(0.0, -0.1, 0.06)]), [0, 0, 0]);
      put('RightArm', 'rag', merge([strip(0.06, 0.26, -0.2).translate(0.0, -0.08, 0.06)]), [0, 0, 0]);
    },
    // Blades. A sword or dagger in the right hand (blade along the forearm's up axis, like the staff), a two-hander for the dread knight.
    blade() {
      const fr = limb('RightHand', 'RightForeArm');
      put('RightHand', 'steel', merge([new THREE.BoxGeometry(0.06, 0.95, 0.012).translate(0, 0.62, 0), cone(0.03, 0.12, 4).rotateY(Math.PI / 4).translate(0, 1.15, 0)]), [0, 0, 0.05], fr);
      put('RightHand', 'gold', merge([new THREE.BoxGeometry(0.22, 0.04, 0.05).translate(0, 0.14, 0), cyl(0.02, 0.02, 0.18, 6).translate(0, 0.02, 0), ball(0.035).translate(0, -0.08, 0)]), [0, 0, 0.05], fr);
    },
    dagger() {
      const fr = limb('RightHand', 'RightForeArm');
      put('RightHand', 'steel', merge([new THREE.BoxGeometry(0.045, 0.42, 0.01).translate(0, 0.3, 0), cone(0.022, 0.08, 4).rotateY(Math.PI / 4).translate(0, 0.55, 0)]), [0, 0, 0.05], fr);
      put('RightHand', 'wood', merge([new THREE.BoxGeometry(0.12, 0.03, 0.04).translate(0, 0.08, 0), cyl(0.018, 0.018, 0.14, 6).translate(0, 0.0, 0)]), [0, 0, 0.05], fr);
    },
    sword() {
      const fr = limb('RightHand', 'RightForeArm');
      put('RightHand', 'steel', merge([new THREE.BoxGeometry(0.07, 1.05, 0.014).translate(0, 0.68, 0), cone(0.035, 0.14, 4).rotateY(Math.PI / 4).translate(0, 1.27, 0)]), [0, 0, 0.05], fr);
      put('RightHand', 'gold', merge([new THREE.BoxGeometry(0.26, 0.045, 0.06).translate(0, 0.15, 0), cyl(0.022, 0.022, 0.2, 6).translate(0, 0.02, 0), ball(0.04).translate(0, -0.1, 0)]), [0, 0, 0.05], fr);
    },
    greatsword() {
      const fr = limb('RightHand', 'RightForeArm');
      put('RightHand', 'steel', merge([new THREE.BoxGeometry(0.11, 1.5, 0.02).translate(0, 0.95, 0), cone(0.055, 0.2, 4).rotateY(Math.PI / 4).translate(0, 1.8, 0)]), [0, 0, 0.06], fr);
      put('RightHand', 'gold', merge([new THREE.BoxGeometry(0.36, 0.05, 0.07).translate(0, 0.2, 0), cyl(0.026, 0.026, 0.34, 6).translate(0, 0.0, 0), ball(0.05).translate(0, -0.2, 0)]), [0, 0, 0.06], fr);
    },
    // Knight Errant: a kite shield on the left forearm.
    kite() {
      const fr = limb('LeftHand', 'LeftForeArm');
      const sh = new THREE.Shape();
      sh.moveTo(-0.3, 0.4); sh.lineTo(0.3, 0.4); sh.lineTo(0.33, 0.05); sh.lineTo(0.18, -0.4); sh.lineTo(0, -0.55); sh.lineTo(-0.18, -0.4); sh.lineTo(-0.33, 0.05); sh.closePath();
      const plate = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.015, bevelSegments: 1 });
      plate.rotateY(Math.PI / 2);
      put('LeftForeArm', 'steel', plate, [-0.14, 0.12, 0.0], fr);
      put('LeftForeArm', 'gold', merge([ball(0.09).scale(0.55, 1, 1).translate(-0.17, 0.1, 0), new THREE.BoxGeometry(0.03, 0.6, 0.06).translate(-0.17, 0.08, 0)]), [0, 0.0, 0.0], fr);
    },
    // Deserter Rifleman: a bolt-action rifle held across the body in both hands.
    rifle() {
      const fr = limb('RightHand', 'RightForeArm');
      put('RightHand', 'wood', merge([new THREE.BoxGeometry(0.05, 0.5, 0.08).translate(0, 0.1, 0.02), new THREE.BoxGeometry(0.06, 0.26, 0.12).translate(0, -0.22, 0.03)]), [0, 0, 0.05], fr);
      put('RightHand', 'steel', merge([cyl(0.014, 0.014, 0.75, 8).translate(0, 0.72, 0.0), cyl(0.03, 0.03, 0.12, 8).translate(0, 0.28, 0.0), new THREE.BoxGeometry(0.02, 0.1, 0.03).translate(0.05, 0.22, 0.03)]), [0, 0, 0.05], fr);
    },
    // ---- Mob weapons (MOB_ARMS). Guns point along -u: forward once the forearm is raised to hip-fire; stock along the forearm. ----
    arifle() {
      const fr = limb('RightHand', 'RightForeArm');
      put('RightHand', 'gun', merge([new THREE.BoxGeometry(0.055, 0.5, 0.1).translate(0, -0.16, 0.03), cyl(0.016, 0.016, 0.42, 8).translate(0, -0.6, 0.05), new THREE.BoxGeometry(0.03, 0.06, 0.05).translate(0, -0.36, 0.1)]), [0, 0, 0.04], fr);
      put('RightHand', 'poly', merge([new THREE.BoxGeometry(0.05, 0.08, 0.17).rotateX(0.25).translate(0, -0.24, -0.1), new THREE.BoxGeometry(0.045, 0.3, 0.08).translate(0, 0.2, 0.0), new THREE.BoxGeometry(0.04, 0.05, 0.1).rotateX(-0.3).translate(0, -0.02, -0.06)]), [0, 0, 0.04], fr);
    },
    smg() {
      const fr = limb('RightHand', 'RightForeArm');
      put('RightHand', 'gun', merge([new THREE.BoxGeometry(0.05, 0.34, 0.09).translate(0, -0.1, 0.03), cyl(0.014, 0.014, 0.16, 8).translate(0, -0.34, 0.05)]), [0, 0, 0.04], fr);
      put('RightHand', 'poly', merge([new THREE.BoxGeometry(0.04, 0.06, 0.22).translate(0, -0.14, -0.13), new THREE.BoxGeometry(0.04, 0.05, 0.1).rotateX(-0.3).translate(0, 0.0, -0.06), new THREE.BoxGeometry(0.03, 0.2, 0.03).translate(0, 0.14, 0.04)]), [0, 0, 0.04], fr);
    },
    pistol() {
      const fr = limb('RightHand', 'RightForeArm');
      put('RightHand', 'gun', merge([new THREE.BoxGeometry(0.035, 0.22, 0.05).translate(0, -0.1, 0.06), cyl(0.009, 0.009, 0.03, 6).translate(0, -0.22, 0.07)]), [0, 0, 0.04], fr);
      put('RightHand', 'poly', new THREE.BoxGeometry(0.034, 0.055, 0.12).rotateX(-0.25).translate(0, -0.02, 0.0), [0, 0, 0.04], fr);
    },
    shotgun() {
      const fr = limb('RightHand', 'RightForeArm');
      put('RightHand', 'gun', merge([cyl(0.02, 0.02, 0.62, 8).translate(0, -0.52, 0.06), cyl(0.015, 0.015, 0.5, 8).translate(0, -0.48, 0.025), new THREE.BoxGeometry(0.055, 0.28, 0.08).translate(0, -0.08, 0.04)]), [0, 0, 0.04], fr);
      put('RightHand', 'wood', merge([cyl(0.032, 0.032, 0.2, 8).translate(0, -0.5, 0.03), new THREE.BoxGeometry(0.05, 0.34, 0.09).translate(0, 0.2, -0.01), new THREE.BoxGeometry(0.04, 0.06, 0.1).rotateX(-0.3).translate(0, 0.02, -0.05)]), [0, 0, 0.04], fr);
    },
    crossbow() {
      const fr = limb('RightHand', 'RightForeArm');
      const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8 * 2 - 1; pts.push(V(t * 0.36, -0.5 + 0.09 * (1 - t * t), 0.05)); }
      put('RightHand', 'wood', merge([new THREE.BoxGeometry(0.05, 0.62, 0.06).translate(0, -0.22, 0.04), new THREE.BoxGeometry(0.045, 0.22, 0.08).translate(0, 0.16, 0.0)]), [0, 0, 0.04], fr);
      put('RightHand', 'iron', merge([new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.016, 6), new THREE.BoxGeometry(0.72, 0.006, 0.006).translate(0, -0.33, 0.06), new THREE.BoxGeometry(0.012, 0.36, 0.012).translate(0, -0.3, 0.08)]), [0, 0, 0.04], fr);
    },
    axe() {
      const fr = limb('RightHand', 'RightForeArm');
      put('RightHand', 'wood', cyl(0.024, 0.028, 0.95, 8).translate(0, 0.33, 0), [0, 0, 0.05], fr);
      const sh = new THREE.Shape(); sh.moveTo(0, -0.05); sh.lineTo(0.08, -0.06); sh.quadraticCurveTo(0.22, -0.12, 0.25, -0.14); sh.quadraticCurveTo(0.28, 0.02, 0.25, 0.16); sh.quadraticCurveTo(0.2, 0.12, 0.08, 0.06); sh.lineTo(0, 0.05); sh.closePath();
      const head = new THREE.ExtrudeGeometry(sh, { depth: 0.022, bevelEnabled: false }).translate(0, 0, -0.011).rotateY(-Math.PI / 2);
      put('RightHand', 'steel', merge([head.translate(0, 0.74, 0.01), new THREE.BoxGeometry(0.05, 0.11, 0.06).translate(0, 0.74, -0.02)]), [0, 0, 0.05], fr);
    },
    mace() {
      const fr = limb('RightHand', 'RightForeArm');
      const spikes = []; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; spikes.push(cone(0.025, 0.09, 5).rotateZ(-Math.PI / 2).translate(0.1, 0, 0).rotateY(a).translate(0, 0.66 + (i % 2) * 0.05, 0)); }
      put('RightHand', 'wood', cyl(0.024, 0.026, 0.7, 8).translate(0, 0.22, 0), [0, 0, 0.05], fr);
      put('RightHand', 'iron', merge([ball(0.09).translate(0, 0.66, 0), ...spikes, cyl(0.035, 0.035, 0.05, 8).translate(0, -0.12, 0)]), [0, 0, 0.05], fr);
    },
    spear() {
      const fr = limb('RightHand', 'RightForeArm');
      put('RightHand', 'wood', cyl(0.022, 0.024, 2.0, 8).translate(0, 0.45, 0), [0, 0, 0.05], fr);
      put('RightHand', 'steel', merge([cone(0.045, 0.3, 4).rotateY(Math.PI / 4).scale(1, 1, 0.35).translate(0, 1.6, 0), cyl(0.03, 0.03, 0.08, 8).translate(0, 1.44, 0)]), [0, 0, 0.05], fr);
    },
    pipe() {
      const fr = limb('RightHand', 'RightForeArm');
      put('RightHand', 'rust', merge([cyl(0.026, 0.026, 0.9, 8).translate(0, 0.33, 0), cyl(0.036, 0.036, 0.08, 8).translate(0, 0.78, 0), cyl(0.026, 0.026, 0.14, 8).rotateZ(Math.PI / 2).translate(0.07, 0.8, 0)]), [0, 0, 0.05], fr);
    },
    cleaver() {
      const fr = limb('RightHand', 'RightForeArm');
      put('RightHand', 'wood', new THREE.BoxGeometry(0.035, 0.16, 0.03).translate(0, 0.02, 0), [0, 0, 0.05], fr);
      put('RightHand', 'steel', new THREE.BoxGeometry(0.13, 0.28, 0.008).translate(0.045, 0.24, 0), [0, 0, 0.05], fr);
    },
    plank() {
      const fr = limb('RightHand', 'RightForeArm');
      const nails = []; for (let i = 0; i < 5; i++) nails.push(cyl(0.004, 0.004, 0.12, 4).rotateX(Math.PI / 2).translate(((i % 2) - 0.5) * 0.05, 0.55 + i * 0.07, 0.04));
      put('RightHand', 'plank', new THREE.BoxGeometry(0.1, 0.95, 0.03).translate(0, 0.38, 0), [0, 0, 0.05], fr);
      put('RightHand', 'iron', merge(nails), [0, 0, 0.05], fr);
    },
    machete() {
      const fr = limb('RightHand', 'RightForeArm');
      put('RightHand', 'poly', new THREE.BoxGeometry(0.035, 0.15, 0.03).translate(0, 0.02, 0), [0, 0, 0.05], fr);
      put('RightHand', 'steel', merge([new THREE.BoxGeometry(0.065, 0.6, 0.008).translate(0.01, 0.4, 0), cone(0.035, 0.1, 3).scale(1, 1, 0.2).translate(0.015, 0.74, 0)]), [0, 0, 0.05], fr);
    },
    shovel() {
      const fr = limb('RightHand', 'RightForeArm');
      put('RightHand', 'wood', merge([cyl(0.022, 0.022, 1.1, 8).translate(0, 0.35, 0), new THREE.BoxGeometry(0.14, 0.03, 0.03).translate(0, -0.2, 0)]), [0, 0, 0.05], fr);
      put('RightHand', 'rust', merge([new THREE.BoxGeometry(0.2, 0.28, 0.012).translate(0, 1.04, 0.0), cyl(0.03, 0.03, 0.1, 8).translate(0, 0.88, 0)]), [0, 0, 0.05], fr);
    },
    // Ogre Smasher: stone fists.
    fists() {
      for (const sd of ['Left', 'Right']) put(sd + 'Hand', 'stone', merge([ball(0.12), ball(0.06).translate(0.07, 0.09, 0.07), ball(0.06).translate(-0.07, 0.09, 0.07), ball(0.06).translate(0, 0.1, -0.07)]), [0, 0, 0]);
    },
  };
  for (const n of names) if (G[n]) G[n]();
}

const tplCache = new Map();
function mobTemplate(kind) {
  if (tplCache.has(kind)) return tplCache.get(kind);
  const look = MOB_LOOKS[kind];
  if (!look) return null;
  const def = { id: 'mob_' + kind, file: look.file, tposeArms: look.tposeArms, build: look.build, design: look.design, body: look.body, lizard: look.lizard, eye: look.eye, height: look.h };
  const tpl = getTemplate(def);
  if (tpl) { if (look.rot) rotDress(tpl, look); dress(tpl, look); if (look.gear) buildGear(tpl, look, MOB_ARM_POOL[kind] ? look.gear.filter((n) => !WEAPON_GEAR.has(n)) : look.gear); collapse(tpl.scene); }
  tplCache.set(kind, tpl);
  return tpl;
}

// One bat wing (the right one; the left is mirrored): arm bones, finger bones and a
// membrane stretched between them. Flap bending is done in the vertex shader.
function wingGeometry(boneCol, memCol) {
  const J = { S: V(0, 0, 0), E: V(1.0, 0.35, 0.25), W: V(2.0, 0.5, 0.05), F1: V(3.5, 0.15, -0.55), F2: V(3.1, -0.1, -1.5), F3: V(2.3, -0.2, -2.2), T: V(0.35, -0.12, -1.6) };
  const P = V(1.5, 0.15, -0.95);
  const ring = [J.S, J.E, J.W, J.F1, J.F2, J.F3, J.T];
  const tris = [];
  const sd = (a, b, c, n) => {
    if (n === 0) { tris.push(a, b, c); return; }
    const ab = a.clone().lerp(b, 0.5), bc = b.clone().lerp(c, 0.5), ca = c.clone().lerp(a, 0.5);
    sd(a, ab, ca, n - 1); sd(ab, b, bc, n - 1); sd(ca, bc, c, n - 1); sd(ab, bc, ca, n - 1);
  };
  for (let i = 0; i < ring.length; i++) sd(P, ring[i], ring[(i + 1) % ring.length], 2);
  const mem = new THREE.BufferGeometry().setFromPoints(tris);
  mem.computeVertexNormals();
  const col = (g, c) => { const k = new THREE.Color(c), a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = k.r; a[i + 1] = k.g; a[i + 2] = k.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  col(mem, memCol);
  const bones = [];
  const bone = (a, b, r0, r1) => {
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(r1, r0, len, 6, 1, false).toNonIndexed();
    g.deleteAttribute('uv');
    g.translate(0, len / 2, 0).rotateX(0);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    g.applyQuaternion(q).translate(a.x, a.y, a.z);
    bones.push(col(g, boneCol));
  };
  bone(J.S, J.E, 0.07, 0.055); bone(J.E, J.W, 0.055, 0.045);
  for (const f of [J.F1, J.F2, J.F3]) bone(J.W, f, 0.04, 0.012);
  bone(J.E, J.T, 0.03, 0.02);
  mem.deleteAttribute('uv');
  return mergeGeometries([mem, ...bones]);
}
let _wingGeo = {};

export class MobRig {
  constructor(kind) {
    this.kind = kind;
    // 'type@weapon': an armed mob (MOB_ARMS). Same body template; the weapon is glued to this mob's own hand bone.
    const [kb, arm] = kind.split('@'), A = arm && MOB_ARMS[arm];
    this.look = A ? { ...MOB_LOOKS[kb], aim: !!A.ranged } : (MOB_LOOKS[kb] || {});
    const tpl = mobTemplate(kb);
    this.root = new THREE.Group();
    this.ok = !!tpl;
    if (!tpl) return;
    this.model = SkeletonUtils.clone(tpl.scene);
    if (A) buildGear({ scene: this.model, scale: tpl.scale, yaw: tpl.yaw }, this.look, [A.gear], SHARED_MATS);
    this.model.rotation.y = tpl.yaw;
    const bulk = this.look.bulk || 1;
    this.model.scale.set(tpl.scale * bulk, tpl.scale, tpl.scale * bulk);
    this.pivot = new THREE.Group(); // tipped over on death
    this.pivot.add(this.model);
    this.root.add(this.pivot);
    this.model.traverse((o) => { if (o.isMesh) { o.frustumCulled = true; o.castShadow = !this.look.ghost; } });
    this.bodies = []; this.model.traverse((o) => { if (o.isSkinnedMesh && o.castShadow) this.bodies.push(o); }); // LOD + shadow switching (lod.js)
    this.full = this.bodies.map((m) => m.geometry); this.lod = 0; this.shadow = true;
    this.b = bonesOf(this.model);
    // Bones a build shrank (the lizard goblin's hidden head) keep that size: the clips carry scale tracks that would put it back to 1.
    this.keepScale = []; for (const b of this.b.values()) if (Math.abs(b.scale.x - 1) > 1e-3) this.keepScale.push([b, b.scale.clone()]);
    this.h = this.look.h / 1.8;
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const k of ['idle', 'walk', 'run']) { const a = this.mixer.clipAction(tpl.clips[k]); a.play(); a.setEffectiveWeight(k === 'idle' ? 1 : 0); a.time = Math.random() * a.getClip().duration; this.actions[k] = a; }
    // Walk and run are driven by one shared stride phase (set by hand each update) so the feet
    // keep ground contact and the two cycles stay in step while they blend.
    this.actions.walk.timeScale = 0; this.actions.run.timeScale = 0;
    this.stride = measureStride(tpl);
    this.cyc = Math.random();
    this.bw = 0; this.bwk = 0; this.brn = 0; // idle/walk/run weights are bi = 1 - bwk - brn
    this.blend = { idle: 1, walk: 0, run: 0 };
    // Per-instance character: cadence, posture, idle rhythm, so a pack does not move in lockstep.
    this.ph = Math.random() * 6.283; this.vary = 0.96 + Math.random() * 0.08; this.hunchVar = (Math.random() - 0.5) * 0.14;
    this.headTilt = (Math.random() - 0.5) * 0.1; this.t = 0;
    // Smoothed motion state, derived from the transform the view sets each frame.
    this.spf = 0; this.spS = 0; this.yr = 0; this.lastYaw = null;
    this.fl = 0; this.flv = 0; this.flImp = 0; this.flSide = 1; this.flinch = 0;
    this.atkT = -1; this.atkArm = true; this.atkDur = 0.5; this.lungeZ = 0;
    this.pP = 0; this.pB = 0;
    this.tail = []; this.model.traverse((o) => { if (/^tail_\d+$/.test(o.name)) this.tail[+o.name.slice(5)] = o; });
    if (this.tail.length) { this.model.userData.tail = this.tail; this.model.userData.tailBase = this.tail.map((s) => s.rotation.x); }
    this.atkDur = this.look.slam ? 1.25 : this.look.cast ? 0.7 : this.look.aim ? 0.35 : 0.5; // slams land near the 1.2 s ground telegraph
    this.hover = !!(this.look.fly || this.look.float);
    const g = (k) => this.b.get(k) || null;
    this.bn = { sp: g('Spine'), sp1: g('Spine1'), sp2: g('Spine2'), neck: g('Neck'), head: g('Head'), lsh: g('LeftShoulder'), rsh: g('RightShoulder'),
      lua: g('LeftArm'), rua: g('RightArm'), lfa: g('LeftForeArm'), rfa: g('RightForeArm'), lul: g('LeftUpLeg'), rul: g('RightUpLeg'), lll: g('LeftLeg'), rll: g('RightLeg') };
    this.orbs = [];
    const glow = this.look.orb || this.look.hands;
    if (glow) {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(glow).multiplyScalar(2.2), toneMapped: false });
      for (const sd of this.look.hands ? ['Right', 'Left'] : ['Right']) {
        const o = new THREE.Mesh(new THREE.SphereGeometry(0.09 * (this.look.h / 1.8), 16, 12), mat);
        o.userData.hand = sd + 'Hand';
        this.root.add(o); this.orbs.push(o);
      }
    }
    if (this.look.horns) this.addHorns();
    if (this.look.wings) this.addWings();
    this.acc = 0; this.dieT = -1;
  }

  addWings() {
    const w = this.look.wings, S = (this.look.h / 1.8) * 0.8 * (w.span || 1);
    const key = w.bone + '/' + w.membrane;
    const geo = _wingGeo[key] || (_wingGeo[key] = wingGeometry(w.bone, w.membrane));
    this.wings = [];
    this.wingT = Math.random() * 6; this.wingFold = 0;
    for (const side of [1, -1]) {
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7, metalness: 0, transparent: !!w.alpha, opacity: w.alpha || 1 });
      mat.emissive = new THREE.Color(w.membrane).multiplyScalar(0.16);
      const flap = { value: 0 };
      mat.userData.flap = flap;
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uFlap = flap;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uFlap;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            float wx = clamp(abs(position.x) * 0.3, 0.0, 1.0);
            transformed.y += uFlap * wx * wx * 1.1;
            transformed.z -= abs(uFlap) * wx * 0.3;
            transformed.x *= 1.0 - 0.1 * abs(uFlap) * wx;`);
      };
      mat.customProgramCacheKey = () => 'mobwing' + (w.alpha ? 'a' : '');
      const m = new THREE.Mesh(geo, mat);
      m.frustumCulled = false; m.castShadow = false;
      const g = new THREE.Group();
      g.add(m);
      g.scale.set(S * side, S, S);
      g.position.set(0.12 * S * side, this.look.h * 0.72, -0.04 * S);
      g.userData.side = side;
      this.pivot.add(g);
      this.wings.push(g);
    }
  }

  animWings(dt, st) {
    const climb = THREE.MathUtils.clamp(st.vy || 0, -12, 12);
    // Dives tuck the wings back; climbing and hovering beat hard.
    const glide = THREE.MathUtils.smoothstep(-climb, 2, 9);
    this.wingT += dt * (8 + Math.max(0, climb) * 0.5 + (1 - glide) * 2);
    const dead = this.dieT >= 0;
    this.wingFold += ((dead ? 1 : glide) - this.wingFold) * Math.min(1, dt * 8);
    const f = this.wingFold;
    const a = dead ? -0.9 : (0.18 - f * 0.45) + Math.sin(this.wingT) * 0.62 * (1 - f * 0.9);
    const bend = dead ? 0.3 : -Math.cos(this.wingT) * (1 - f * 0.8);
    for (const g of this.wings) {
      g.rotation.z = a * g.userData.side;
      g.rotation.y = f * 0.7 * -g.userData.side;
      g.children[0].material.userData.flap.value = bend;
    }
  }

  addHorns() {
    const head = this.b.get('Head');
    if (!head) return;
    this.root.updateMatrixWorld(true);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a1a14, roughness: 0.35, metalness: 0.1 });
    const top = (this.b.get('HeadTop_End') || head).getWorldPosition(V());
    const hp = head.getWorldPosition(V());
    const S = this.h * (this.look.hornScale || 1);
    for (const s of [-1, 1]) {
      // A curved ram horn: a tapered tube along a spiral.
      const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(V(s * (0.05 + t * 0.16), 0.02 + Math.sin(t * 2.4) * 0.12, -t * 0.08 + Math.sin(t * 3.0) * 0.03).multiplyScalar(S)); }
      const curve = new THREE.CatmullRomCurve3(pts);
      const g = new THREE.TubeGeometry(curve, 24, 0.028 * S, 8);
      const p = g.attributes.position, c = V(), tan = V();
      for (let i = 0; i < p.count; i++) { const seg = Math.floor(i / 9) / 24; curve.getPoint(seg, c); c.fromBufferAttribute(p, i).sub(curve.getPoint(seg, tan)).multiplyScalar(1 - seg * 0.85).add(curve.getPoint(seg, tan)); p.setXYZ(i, c.x, c.y, c.z); }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.position.copy(hp.clone().lerp(top, 0.75)).add(V(0, 0, 0.02 * S));
      m.castShadow = true;
      this.root.add(m);
      head.attach(m);
    }
  }

  // Pitch, bank and sway of the whole body for things that hang in the air. The body tips about
  // its middle, not its feet, so a bank reads as a lean and not as a sideways slide.
  hoverPose(dt, st) {
    const L = this.look, k = 1 - Math.exp(-dt * 6);
    const pitchT = L.fly ? (st.pitch || 0) : clamp(this.spf * 0.03, 0, 0.3);
    this.pP += (pitchT - this.pP) * k;
    const bankT = clamp(-this.yr * (L.fly ? 0.16 : 0.05), -0.5, 0.5);
    this.pB += (bankT - this.pB) * k;
    const sway = Math.sin(this.t * (L.fly ? 2.1 : 1.3) + this.ph) * (L.fly ? 0.03 : 0.04);
    const piv = this.pivot, cy = L.h * 0.6;
    piv.rotation.set(this.pP, 0, this.pB + sway);
    _v1.set(0, cy, 0).applyEuler(piv.rotation);
    piv.position.set(-_v1.x, cy - _v1.y, -_v1.z + this.lungeZ);
  }

  // st: { speed, attack (1 -> 0 as the swing plays), frozen, hit, pitch/vy (flyers) }
  // Distance detail: lighter body copies further out (lod.js).
  setLod(d) {
    if (!this.ok) return;
    const lv = lodLevel(d); // (shadow casting by distance is the frame governor's job: PERF.mobShadow in views.js)
    if (lv !== this.lod) { this.lod = lv; this.bodies.forEach((m, i) => { m.geometry = lodSet(this.full[i])[lv]; }); }
  }

  // Big Head mutator: the head bone (and whatever it wears) blown up; back to normal when it is off.
  headSize() {
    const h = this.bn && this.bn.head;
    if (!h) return;
    if (!this._hb) this._hb = h.scale.clone();
    const k = muOn(BIG_HEAD) ? HEAD_SCALE : 1;
    if (k !== 1 || this._hk !== 1) { h.scale.copy(this._hb).multiplyScalar(k); this._hk = k; }
  }
  update(st, dt, far = 0) {
    if (!this.ok) return;
    if (st.hit) this.flImp += this.look.slam ? 0.4 : 1;
    if (st.stagger) this.flImp += this.look.slam ? 0.5 : 1.4; // a staggering hit rocks the whole body
    // Motion state from the transform the view just set: smoothed speed (jittery snapshot
    // interpolation would otherwise make the stride stutter), turn rate, a slower speed for acceleration.
    const root = this.root, yaw = root.rotation.y;
    if (this.lastYaw === null) this.lastYaw = yaw;
    const dyaw = wrapPi(yaw - this.lastYaw); this.lastYaw = yaw;
    this.t += dt;
    this.yr += (clamp(dyaw / Math.max(dt, 1e-3), -8, 8) - this.yr) * (1 - Math.exp(-dt * 9));
    this.spf += ((st.frozen ? 0 : st.speed) - this.spf) * (1 - Math.exp(-dt * 8));
    this.spS += (this.spf - this.spS) * (1 - Math.exp(-dt * 2.5));
    if (this.wings) this.animWings(dt, st);
    if (this.hover) this.hoverPose(dt, st);
    // Distant or off-screen mobs animate at a lower rate (far = seconds between updates).
    this.acc += dt;
    if (far && this.acc < far) return;
    dt = this.acc; this.acc = 0;
    const L = this.look, S = this.stride, b = this.b;
    const frozen = !!st.frozen, rs = root.scale.x || 1;
    const sp = L.fly || frozen ? 0 : this.spf, sl = sp / rs; // gait speed, in the rig's own metres
    // ---- locomotion: blend idle/walk/run, one shared stride phase, feet matched to ground speed ----
    const run = ss(sl, S.vw * 1.25, S.vr * 0.95);
    const walk = ss(sl, S.vw * 0.12, S.vw * 0.55) * (1 - run);
    const k = 1 - Math.exp(-dt * 8);
    this.bwk += (walk - this.bwk) * k; this.brn += (run - this.brn) * k;
    if (this.bwk < 0.004) this.bwk = 0; if (this.brn < 0.004) this.brn = 0; // let the mixer skip dead clips
    const A = this.actions;
    A.idle.setEffectiveWeight(1 - this.bwk - this.brn); A.walk.setEffectiveWeight(this.bwk); A.run.setEffectiveWeight(this.brn);
    if (!frozen && sl > 0.05) {
      const rb = this.brn / Math.max(1e-3, this.bwk + this.brn);
      const f = Math.min(1.9, sl / (S.lw * (1 - rb) + S.lr * rb)) * this.vary;
      this.cyc += f * dt; this.cyc -= Math.floor(this.cyc);
      A.walk.time = ((this.cyc + S.ow) % 1) * S.dw; A.run.time = ((this.cyc + S.or) % 1) * S.dr;
      if (this.tail.length) animateTail(this.model, this.t, dt, sp, this.yr, TAU * f * 0.5 + 1.2);
    } else if (this.tail.length) animateTail(this.model, this.t, dt, 0, this.yr, 1.6);
    this.mixer.update(frozen ? 0 : dt);
    for (const [b, sc] of this.keepScale) b.scale.copy(sc);
    this.headSize();
    root.updateMatrixWorld(true);
    // Axes of the body's own frame (+Z forward, +X its left, so a tilted flyer pitches about its own side).
    const e = this.pivot.matrixWorld.elements;
    for (let c = 0; c < 3; c++) {
      const o = c === 0 ? 0 : c === 1 ? 4 : 8, ix = 1 / Math.sqrt(e[o] * e[o] + e[o + 1] * e[o + 1] + e[o + 2] * e[o + 2]);
      AXS[c * 3] = e[o] * ix; AXS[c * 3 + 1] = e[o + 1] * ix; AXS[c * 3 + 2] = e[o + 2] * ix;
    }
    const N = this.bn;

    // ---- hit reaction: a spring kicked by each hit, so the torso snaps back and rebounds ----
    if (this.flImp > 0) { this.flv += 7.5 * this.flImp; this.flImp = 0; this.flSide = Math.random() < 0.5 ? 1 : -1; }
    if (Math.abs(this.fl) + Math.abs(this.flv) > 1e-3) {
      const n = Math.min(4, Math.ceil(dt / 0.02)), h = Math.min(dt, 0.1) / n;
      for (let i = 0; i < n; i++) { this.flv += (-150 * this.fl - 13 * this.flv) * h; this.fl += this.flv * h; }
    } else this.fl = this.flv = 0;
    const flinch = clamp(this.fl, -0.6, 0.9) * 0.55;

    // ---- attack timeline: anticipation, fast strike with overshoot, recovery (own clock, not the noisy network value) ----
    const a = Math.min(1, st.attack || 0);
    if (a > 0.7 && this.atkArm) { this.atkArm = false; this.atkT = 0; } else if (a < 0.3) this.atkArm = true;
    let u = -1;
    if (this.atkT >= 0) { this.atkT += dt; if (this.atkT >= this.atkDur) this.atkT = -1; else u = this.atkT / this.atkDur; }
    let sp1 = 0, sp2 = 0, spY = 0, headP = 0, lunge = 0, armRaise = 0, armSweep = 0, foreBend = 0, castLift = 0, pulse = 0, atkE = 0;
    let down = 0, up2 = 0, rec = 0;
    if (u >= 0) {
      atkE = Math.sin(Math.PI * Math.min(1, u * 1.2));
      if (L.slam) {
        // Both fists rise slowly, hang, then a heavy smash with a rebound.
        up2 = ss(u, 0, 0.5); down = ss(u, 0.6, 0.7); rec = ss(u, 0.78, 1);
        const reb = Math.sin(Math.PI * ss(u, 0.7, 0.88)) * 0.1;
        armRaise = (-2.7 * up2 + 2.1 * down + reb) * (1 - rec);
        foreBend = -0.6 * up2 * (1 - down);
        sp1 = (-0.25 * up2 + 0.7 * down) * (1 - rec); sp2 = reb * 0.6; headP = 0.25 * down * (1 - rec);
        lunge = this.h * (-0.06 * up2 * (1 - down) + 0.2 * down * (1 - rec));
      } else if (L.cast) {
        // Arms gather, hold, then throw forward and settle.
        castLift = ss(u, 0, 0.45) * (1 - ss(u, 0.66, 1));
        pulse = Math.sin(Math.PI * ss(u, 0.48, 0.66));
        sp2 = -0.25 * castLift * (1 - ss(u, 0.45, 0.55)) + 0.3 * pulse; headP = 0.12 * pulse;
        lunge = this.h * (-0.04 * castLift + 0.08 * pulse);
      } else if (L.aim) {
        // A shot: the gun kicks up and back, the shoulders take it.
        const k = Math.sin(Math.PI * ss(u, 0, 0.35)) * (1 - ss(u, 0.35, 1));
        sp2 = -0.08 * k; headP = -0.05 * k; lunge = -this.h * 0.03 * k; foreBend = k;
      } else {
        // Wind up to the right (weight back), strike across the body, overshoot, recover.
        const wind = ss(u, 0, 0.3), rake = ss(u, 0.3, 0.46), back = ss(u, 0.52, 1);
        const ov = Math.sin(Math.PI * ss(u, 0.46, 0.76)) * 0.35;
        armRaise = (wind - back) * 1.45;
        armSweep = (-1.1 * wind + 2.1 * rake + ov) * (1 - back);
        foreBend = -0.5 * armRaise * (1 - rake * 0.7);
        spY = armSweep * 0.3; sp2 = rake * (1 - back) * 0.3 - 0.12 * wind * (1 - rake); headP = 0.28 * rake * (1 - back);
        lunge = this.h * (-0.07 * wind * (1 - rake) + 0.32 * rake * (1 - back));
      }
    }

    // ---- posture: hunch, lean into acceleration and turns, breathing, head leading the turn and scanning ----
    const idleW = 1 - this.bwk - this.brn, tt = this.t, ph = this.ph;
    const hunch = ((L.hunch || 0) + this.hunchVar) * (1 + this.brn * 0.3);
    const slamK = L.slam ? 0.5 : 1;
    const lean = clamp((this.spf - this.spS) * 0.045, -0.22, 0.28) * slamK * (frozen ? 0 : 1);
    const roll = clamp(-this.yr * this.spf * 0.011 / rs, -0.2, 0.2) * slamK;
    const calm = frozen ? 0 : 1 - Math.min(1, atkE * 2);
    const breath = Math.sin(tt * 1.7 + ph) * 0.014 * idleW * (frozen ? 0 : 1);
    const scan = (Math.sin(tt * 0.45 + ph) * 0.3 + Math.sin(tt * 1.1 + ph * 2) * 0.08) * idleW * calm;
    const lead = clamp(this.yr * 0.09, -0.3, 0.3) * calm;
    const sway = Math.sin(tt * 0.5 + ph * 1.7) * 0.025 * idleW * calm;
    if (L.float || L.fly) {
      // Spirits and flyers hang with their legs trailing behind.
      const tr = -0.35 - sp * 0.04 - this.spf * 0.012;
      rv(N.lul, tr, 0, 0); rv(N.rul, tr, 0, 0); rv(N.lll, 0.5, 0, 0); rv(N.rll, 0.5, 0, 0);
    }
    rv(N.sp, hunch * 0.45 + lean * 0.3, 0, roll * 0.3 + sway);
    rv(N.sp1, hunch * 0.3 + lean * 0.35 - flinch + sp1, spY, roll * 0.35 + flinch * 0.3 * this.flSide - sway * 0.5);
    rv(N.sp2, hunch * 0.25 + lean * 0.35 + breath + sp2 - flinch * 0.4, 0, roll * 0.35);
    rv(N.neck, -hunch * 0.55 - lean * 0.4 - breath * 0.5 + headP * 0.4, (scan + lead) * 0.35, this.headTilt * 0.4 - roll * 0.3);
    rv(N.head, -hunch * 0.3 - lean * 0.2 - breath * 0.5 + headP * 0.6 - flinch * 0.6, (scan + lead) * 0.65, this.headTilt * 0.6 - roll * 0.3);
    chain(N.sp2, N.neck, N.head, N.lsh, N.rsh);
    // Arms.
    if (u >= 0) {
      if (L.slam) {
        rv(N.lua, armRaise, 0, 0); rv(N.rua, armRaise, 0, 0); rv(N.lfa, foreBend, 0, 0); rv(N.rfa, foreBend, 0, 0);
      } else if (L.cast) {
        const lift = castLift, ang = -1.35 * lift - 0.35 * pulse, yw = 0.35 * lift;
        rv(N.lua, ang, -yw, 0); rv(N.rua, ang, yw, 0);
        rv(N.lfa, -0.3 * lift, 0, 0); rv(N.rfa, -0.3 * lift, 0, 0);
      } else if (!L.aim) {
        rv(N.rua, -armRaise, armSweep, 0); rv(N.rfa, foreBend, 0, 0); rv(N.lua, -armRaise * 0.5, armSweep * 0.4, 0);
      }
    }
    // Shooters hold their gun at the hip, pointed ahead, the other hand on the fore-grip; foreBend carries the recoil.
    if (L.aim && !frozen) {
      const k = u >= 0 ? foreBend : 0;
      rv(N.rua, -0.3 - 0.15 * k, 0.2, 0); rv(N.rfa, -1.45 - 0.3 * k, 0, 0);
      rv(N.lua, -0.7, -0.5, 0); rv(N.lfa, -1.25, 0, 0);
    }
    // Zombies: arms hang out in front, uneven and swaying (one higher, one drooping), the head lolls to one side, and the gait is a
    // limp: one leg stiff and dragging, a hitch and a hip drop on every step on it, the whole body lurching.
    if (L.reach) {
      const lu = (L.lurch || 0) * (frozen ? 0 : 1), side = L.limp || 1, mv = clamp(this.spf * 0.3, 0, 1) * lu, cy = Math.sin(this.cyc * TAU), stp = cy * mv;
      if (u < 0) {
        const hi = L.reach + Math.sin(tt * 1.3 + ph) * 0.1, lo = L.reach - 0.45 + Math.sin(tt * 1.7 + ph * 2) * 0.12;
        rv(N.lua, -(side > 0 ? hi : lo), -0.18, 0); rv(N.rua, -(side > 0 ? lo : hi), 0.18, 0);
        rv(N.lfa, -0.3, 0, 0); rv(N.rfa, -0.55, 0, 0);
      }
      rv(N.sp1, 0, stp * 0.25, stp * 0.12 * side); rv(N.neck, 0.18, -stp * 0.2, 0.32 * side); rv(N.head, 0.2, -stp * 0.15, 0.3 * side + Math.sin(tt * 2.3 + ph) * 0.05);
      // the bad leg: hip hitched up and the leg held stiff and swung out and back
      const hip = side > 0 ? N.lul : N.rul, knee = side > 0 ? N.lll : N.rll, hit = Math.max(0, cy) * mv;
      rv(hip, -0.3 * hit, 0, 0.18 * side * hit); rv(knee, 0.4 * hit, 0, 0); rv(N.sp, 0, 0, -0.14 * side * hit);
    }
    // Weight thrown into a strike, recoil from a hit.
    this.lungeZ = lunge - flinch * 0.1 * this.h;
    if (!this.hover) this.pivot.position.set(0, 0, this.lungeZ);
    for (const o of this.orbs) {
      const hand = b.get(o.userData.hand);
      if (hand) { hand.getWorldPosition(o.position); this.root.worldToLocal(o.position); o.position.y += 0.08 * this.h; }
      o.scale.setScalar(1 + Math.sin(tt * 8 + ph) * 0.15 + atkE * 0.8);
    }
  }

  // Collapse: tip over like a falling weight (slow start, hard landing, small rebound), arms flung, head lagging;
  // a runner pitches forward and slides, a flyer tumbles. Returns true while still playing.
  die(dt) {
    const first = this.dieT < 0;
    if (first) {
      this.dieT = 0; for (const o of this.orbs) o.visible = false;
      this.rot0 = this.pivot.rotation.x; this.rotZ0 = this.pivot.rotation.z; this.pos0 = this.pivot.position.clone();
      const fast = this.spf / (this.root.scale.x || 1) > this.stride.vr * 0.9 && !this.look.fly;
      this.fallDir = Math.random() < 0.5 ? 1 : -1;
      const r = Math.random();
      this.fallKind = this.look.fly ? 2 : fast ? (r < 0.8 ? 1 : 2) : (r < 0.62 ? 0 : r < 0.82 ? 1 : 2);
      this.slide = fast ? Math.min(2.2, this.spf * 0.25) * this.h * 0.5 : 0;
      this.fallT = this.look.slam ? 0.85 : 0.55;
      this.impact = false;
    }
    this.dieT += dt;
    const t = this.dieT, T = this.fallT, p = Math.min(1, t / T);
    // gravity-like topple: eases in, then a damped rebound after the impact
    const e = p * p * (1.5 - 0.5 * p);
    const after = Math.max(0, t - T), reb = 1 - 0.07 * Math.sin(Math.min(1, after * 2.2) * Math.PI) * Math.exp(-after * 1.5);
    const f = e * (after > 0 ? reb : 1);
    const piv = this.pivot, kind = this.fallKind, d = this.fallDir;
    const rx = kind === 0 ? -1.45 : kind === 1 ? 1.45 : 0.35 * d, rz = kind === 2 ? 1.45 * d : 0.12 * d * (kind === 0 ? 1 : -1);
    const blendIn = ss(t, 0, 0.12); // continue smoothly from the pose the mob died in
    piv.rotation.x = (this.rot0 * (1 - blendIn) + rx * f * blendIn) ;
    piv.rotation.z = (this.rotZ0 * (1 - blendIn) + rz * f * blendIn);
    if (this.wings) this.animWings(dt, { vy: 0 });
    const lift = 0.1 * this.h * Math.min(1, Math.abs(piv.rotation.x) / 1.2 + Math.abs(piv.rotation.z) / 1.2);
    const slide = this.slide * (1 - Math.exp(-t * 4)) / 4 * (kind === 1 ? 1 : kind === 0 ? -0.2 : 0.4);
    piv.position.set(this.pos0.x * (1 - blendIn), this.pos0.y * (1 - blendIn) + lift - Math.max(0, t - 1.1) * 0.9 * this.look.h * 0.4, this.pos0.z * (1 - blendIn) + slide);
    if (this.mixer) {
      this.mixer.update(dt * Math.max(0, 1 - t * 2));
      for (const [b, sc] of this.keepScale) b.scale.copy(sc);
      this.headSize();
      this.root.updateMatrixWorld(true);
      // limbs go slack: arms fling out and trail, head lags the fall
      const b = this.b, w = Math.sin(Math.PI * Math.min(1, t / 0.9)) * (1 - ss(t, 0.9, 1.6) * 0.4);
      if (w > 0.01) {
        const E = piv.matrixWorld.elements, fl = w * (kind === 1 ? -1 : 1);
        const Sx = E[0] / (this.root.scale.x || 1), Sy = E[1] / (this.root.scale.x || 1), Sz = E[2] / (this.root.scale.x || 1);
        const Fx = E[8] / (this.root.scale.x || 1), Fy = E[9] / (this.root.scale.x || 1), Fz = E[10] / (this.root.scale.x || 1);
        rotVec(b.get('Head'), Sx * -0.5 * fl, Sy * -0.5 * fl, Sz * -0.5 * fl);
        chain(b.get('Neck'), b.get('Head'), b.get('LeftShoulder'), b.get('RightShoulder'));
        rotVec(b.get('LeftArm'), Sx * -0.7 * fl + Fx * 0.9 * w, Sy * -0.7 * fl + Fy * 0.9 * w, Sz * -0.7 * fl + Fz * 0.9 * w);
        rotVec(b.get('RightArm'), Sx * -0.7 * fl - Fx * 0.9 * w, Sy * -0.7 * fl - Fy * 0.9 * w, Sz * -0.7 * fl - Fz * 0.9 * w);
      }
    }
    return t < 2.2;
  }
}

export function makeMobRig(kind) {
  const r = new MobRig(kind);
  return r.ok ? r : null;
}

// Build every template up front so the first spawn of a type doesn't hitch.
export function warmMobs() { for (const k in MOB_LOOKS) mobTemplate(k); }
