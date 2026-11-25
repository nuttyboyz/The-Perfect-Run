// Motion capture (Nutty 2026-11-25: "the most realistic movements you can that can possibly mirror actors"). Clips recorded from real
// actors (Mixamo, on the X Bot skeleton) are kept as each bone's WORLD turn away from the T-pose, so the same numbers pose any body
// rigged the same way, whatever its size or its bones' own axes: a bone's pose = the clip's turn x that body's own T-pose.
// pw/mocapconv.mjs makes the clips, pw/mocappack.mjs packs the chosen ones into assets/mocap.json.
import * as THREE from 'three';

export const MBONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];
const PARENT = [-1, 0, 1, 2, 3, 4, 3, 6, 7, 8, 3, 10, 11, 12, 0, 14, 15, 16, 0, 18, 19, 20], NB = MBONES.length;
export const UPPER = MBONES.map((n, i) => (i >= 1 && i <= 13 ? 1 : 0)), LEGS = MBONES.map((n, i) => (i >= 14 ? 1 : 0));
export const MOCAP = {}; // id -> { n, fps, dur, q: Int16Array, h: Int16Array, hit, in, out, ... }
export const mocapReady = { v: false };

const b64 = (s) => { const bin = atob(s), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Int16Array(u8.buffer); };
export function addMocap(pack) {
  for (const id in pack.clips) { const c = pack.clips[id]; MOCAP[id] = { ...c, id, q: null, h: null, _q: c.q, _h: c.h }; }
  mocapReady.v = true;
}
const data = (c) => { if (!c.q) { c.q = b64(c._q); c.h = b64(c._h); c._q = c._h = null; } return c; };
export async function loadMocap(url) { try { const r = await fetch(url); if (r.ok) addMocap(await r.json()); } catch (e) { /* the game plays on with its hand-built moves */ } }

const key = (name) => name.replace(/^mixamorig[:_]?/, '').replace(/^.*[:|]/, '');
const _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _v = new THREE.Vector3(), _m = new THREE.Matrix4();

// A body's T-pose, taken once from its template while it stands in its rest pose: each bone's rest turn and its parent's, in a frame
// where the body faces +Z (left arm along +X), and what the hips' move is measured in.
export function mocapRest(scene) {
  scene.updateMatrixWorld(true);
  const bones = new Map(); scene.traverse((o) => { if (o.isBone && !bones.has(key(o.name))) bones.set(key(o.name), o); });
  const hips = bones.get('Hips'), la = bones.get('LeftArm'), lf = bones.get('LeftForeArm'); if (!hips || !la || !lf || !bones.get('Spine') || !bones.get('RightArm')) return null;
  const d = lf.getWorldPosition(new THREE.Vector3()).sub(la.getWorldPosition(new THREE.Vector3()));
  const F = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-d.z, d.x)), FI = F.clone().invert(); // F turns the facing-forward frame into the scene's
  const rest = [], prest = [], link = [], has = [];
  MBONES.forEach((n, i) => { const b = bones.get(n); has.push(!!b); if (!b) { rest.push(new THREE.Quaternion()); prest.push(new THREE.Quaternion()); link.push(null); return; }
    rest.push(FI.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion())));
    prest.push(FI.clone().multiply(b.parent.getWorldQuaternion(new THREE.Quaternion())));
    link.push(null); });
  // (a body with a bone between two of the clip's bones: the parent's pose is carried on through it as it stands at rest)
  MBONES.forEach((n, i) => { const pi = PARENT[i]; if (pi < 0 || !has[i] || !has[pi]) return; const b = bones.get(n), pb = bones.get(MBONES[pi]); if (b.parent !== pb) link[i] = rest[pi].clone().invert().multiply(prest[i]); });
  const hp = hips.getWorldPosition(new THREE.Vector3()), sp = scene.getWorldPosition(new THREE.Vector3());
  let floor = hp.y; for (const n of ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot']) { const b = bones.get(n); if (b) floor = Math.min(floor, b.getWorldPosition(_v).y); }
  const hipH = Math.max(1e-4, hp.y - Math.min(sp.y, floor)); /* (the clips measure the hips from the floor) */
  // the hips' move, given in the facing-forward frame, in the hips' own parent's space
  const toLocal = new THREE.Matrix3().setFromMatrix4(_m.copy(hips.parent.matrixWorld).invert()).multiply(new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(F)));
  return { rest, prest, link, has, hipH, toLocal, hip0: hips.position.clone() };
}

const W = MBONES.map(() => new THREE.Quaternion()), _d = new THREE.Quaternion(), _l = new THREE.Quaternion(), _h = new THREE.Vector3();
// One body's motion capture player. bones: Map of bone key -> Bone (the rig's own), R: mocapRest() of its template.
export class MocapLayer {
  constructor(bones, R) { this.R = R; this.b = MBONES.map((n, i) => (R.has[i] ? bones.get(n) || null : null)); this.out = MBONES.map(() => new THREE.Quaternion()); this.from = MBONES.map(() => new THREE.Quaternion()); this.fade = 0; this.live = false; this.hipOut = new THREE.Vector3(); this.hipFrom = new THREE.Vector3(); }
  // A new clip starts while another was showing: the pose is carried over and faded out under the new one.
  cut(dur = 0.14) { if (this.live) { for (let i = 0; i < NB; i++) this.from[i].copy(this.out[i]); this.hipFrom.copy(this.hipOut); this.fade = 1; this.fadeK = 1 / dur; } }
  /* Pose the body from clip c at time t (seconds into the clip). w 0..1 how much of it shows over the pose the body has now (its idle
     or walk); mask: per bone share (null = all); hipW: share of the hips' own move; drift: [x, z] taken out of the hips' move (hip
     heights), so a clip that travels can be played on the spot. dt moves the fade from the clip before. */
  apply(c, t, w, dt = 0, mask = null, hipW = 1, drift = null) {
    data(c); const R = this.R, f = Math.max(0, Math.min(c.n - 1.001, t * c.fps)), i0 = f | 0, a = f - i0, Q = c.q, B = this.b, s = 1 / 32767;
    if (this.fade > 0) this.fade = Math.max(0, this.fade - dt * this.fadeK); const fd = this.fade * this.fade * (3 - 2 * this.fade);
    for (let i = 0; i < NB; i++) { const o0 = (i0 * NB + i) * 4, o1 = o0 + NB * 4;
      _d.set(Q[o0] + (Q[o1] - Q[o0]) * a, Q[o0 + 1] + (Q[o1 + 1] - Q[o0 + 1]) * a, Q[o0 + 2] + (Q[o1 + 2] - Q[o0 + 2]) * a, Q[o0 + 3] + (Q[o1 + 3] - Q[o0 + 3]) * a).normalize();
      W[i].copy(_d).multiply(R.rest[i]); const b = B[i]; if (!b) continue;
      const pi = PARENT[i]; if (pi < 0) _p.copy(R.prest[i]); else { _p.copy(W[pi]); if (R.link[i]) _p.multiply(R.link[i]); }
      _l.copy(_p).invert().multiply(W[i]);
      const k = w * (mask ? mask[i] : 1); if (k >= 0.999) b.quaternion.copy(_l); else if (k > 0.001) b.quaternion.slerp(_l, k);
      if (fd > 0) b.quaternion.slerp(this.from[i], fd);
      this.out[i].copy(b.quaternion); }
    const hb = B[0]; if (hb) { const H = c.h, o = i0 * 3, hs = R.hipH / 4096; _h.set((H[o] + (H[o + 3] - H[o]) * a), (H[o + 1] + (H[o + 4] - H[o + 1]) * a), (H[o + 2] + (H[o + 5] - H[o + 2]) * a)).multiplyScalar(hs);
      if (drift) { _h.x -= drift[0] * R.hipH; _h.z -= drift[1] * R.hipH; }
      _h.applyMatrix3(R.toLocal).add(R.hip0); const k = w * hipW; if (k > 0.001) hb.position.lerp(_h, Math.min(1, k)); if (fd > 0) hb.position.lerp(this.hipFrom, fd); this.hipOut.copy(hb.position); }
    this.live = w > 0.02;
  }
  stop() { this.live = false; this.fade = 0; }
}
