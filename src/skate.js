// Rideable skateboards: the board model, the boards scattered over each map, the riding physics and the
// rider's sideways skater pose (feet across the deck, kick-push, foot-drag brake, ollie / kickflip).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './rng.js';

export const DECKS = [0xe4572e, 0x29a8c4, 0xf2c14e, 0x7bc950, 0xb868e0, 0xf2f2f2, 0xff7aa8, 0x2b2d42];
export const BOARD_SCALE = 1.25; // board units -> metres

// ---------------------------------------------------------------- board model
// Built in board units (deck 0.82 long on z, 0.2 wide on x, wheels on y = 0). Three vertex-coloured parts
// (wood and grip, metal trucks, urethane wheels) so each can have its own material.
const L2 = 0.41, W2 = 0.1, DECK_Y = 0.098, THICK = 0.011, CONCAVE = 0.012;
const KICK_AT = 0.235, KICK_LEN = L2 - KICK_AT, KICK_RISE = 0.056;
const WHEEL_R = 0.03, WHEEL_W = 0.032, TRUCK_Z = 0.2;
const MAPLE = 0xd9b27c, PLY = 0x8c6a42;

const smoothstep = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
const rise = (z) => KICK_RISE * Math.pow(Math.min(1, Math.max(0, (Math.abs(z) - KICK_AT) / KICK_LEN)), 1.8);
// Half width of the outline at z: straight sides, then a squarish rounded nose and tail.
const halfW = (z) => { const t = Math.min(1, Math.max(0, (Math.abs(z) - 0.3) / (L2 - 0.3))); return W2 * Math.pow(Math.max(0, 1 - Math.pow(t, 2.6)), 1 / 2.6); };
// Height of the grip surface at board z (centre line), in board units.
export const deckTop = (z) => DECK_Y + rise(z) + 0.0013;

const hash = (i, j) => { const x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return x - Math.floor(x); };

function paint(geo, color) {
  const c = new THREE.Color(color), n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}
// A primitive part: non-indexed, colour attribute, normals kept as built (smooth for round things).
function part(geo, color) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  geo.deleteAttribute('uv');
  paint(geo, color);
  return geo;
}
function cyl(r, len, axis, x, y, z, color, segs = 8) {
  const g = new THREE.CylinderGeometry(r, r, len, segs);
  if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
  return part(g.translate(x, y, z), color);
}
function box(w, h, d, x, y, z, color) { return part(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color); }

// A grid surface over (z rows, s columns). pos(i, j) -> [x, y, z]; colour(i, j) per quad or a single colour.
function grid(zs, ss, pos, up, colour) {
  const nI = zs.length - 1, nJ = ss.length - 1;
  const P = new Float32Array((nI + 1) * (nJ + 1) * 3);
  for (let i = 0; i <= nI; i++) for (let j = 0; j <= nJ; j++) { const p = pos(i, j); P.set(p, (i * (nJ + 1) + j) * 3); }
  const idx = [];
  for (let i = 0; i < nI; i++) for (let j = 0; j < nJ; j++) {
    const a = i * (nJ + 1) + j, b = a + 1, c = a + nJ + 1, d = c + 1;
    if (up) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g = g.toNonIndexed();
  const col = new Float32Array(g.attributes.position.count * 3);
  const cc = new THREE.Color();
  let q = 0;
  for (let i = 0; i < nI; i++) for (let j = 0; j < nJ; j++, q++) {
    cc.set(typeof colour === 'function' ? colour(i, j) : colour);
    for (let v = 0; v < 6; v++) { col[(q * 6 + v) * 3] = cc.r; col[(q * 6 + v) * 3 + 1] = cc.g; col[(q * 6 + v) * 3 + 2] = cc.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Under-deck graphics: a few pixel-art designs picked by the deck colour.
function graphic(kind, base, ink, gold) {
  return (x, z) => {
    const ax = Math.abs(x), az = Math.abs(z);
    if (kind === 0) { // sun: ringed disc, striped nose and tail
      const r = Math.hypot(x, z * 0.8);
      if (r < 0.052) return r < 0.03 ? gold : ink;
      if (r < 0.068) return base;
      if (r < 0.082) return ink;
      if (az > 0.3) return Math.floor((az - 0.3) / 0.025) % 2 ? ink : gold;
      return base;
    }
    if (kind === 1) { // chevrons
      const v = (ax * 3.2 + az) % 0.14;
      if (az < 0.34) return v < 0.05 ? ink : v < 0.075 ? gold : base;
      return base;
    }
    if (kind === 2) { // split diagonal with a bolt
      const side = x * 1.4 + z * 0.55 > 0;
      if (Math.abs(x * 1.4 + z * 0.55) < 0.012) return gold;
      if (ax < 0.018 && az < 0.16 && ((z * 18) | 0) % 2 === 0) return gold;
      return side ? ink : base;
    }
    // checker bands at both ends, plain middle with a stripe
    if (az > 0.26) return (Math.floor(ax / 0.04) + Math.floor((az - 0.26) / 0.04)) % 2 ? ink : base;
    if (ax < 0.014) return gold;
    return base;
  };
}

function wheelParts(R, hw, tire, hub, out, x, z) {
  const prof = [[0.018, -hw], [R - 0.007, -hw], [R - 0.0035, -hw + 0.001], [R - 0.0012, -hw + 0.0035], [R, -hw + 0.007], [R, hw - 0.007],
    [R - 0.0012, hw - 0.0035], [R - 0.0035, hw - 0.001], [R - 0.007, hw], [0.018, hw]].map(([r, y]) => new THREE.Vector2(r, y));
  const segs = out.segs;
  const t = new THREE.LatheGeometry(prof, segs).rotateZ(Math.PI / 2).translate(x, WHEEL_R, z);
  out.wheel.push(part(t, tire));
  const core = new THREE.LatheGeometry([[0.0, -hw + 0.002], [0.018, -hw + 0.002], [0.018, hw - 0.002], [0.0, hw - 0.002]].map(([r, y]) => new THREE.Vector2(r, y)), segs).rotateZ(Math.PI / 2).translate(x, WHEEL_R, z);
  out.wheel.push(part(core, hub));
}

const partCache = new Map();
// The three geometries of one board for a deck colour index.
export function boardParts(ci = 0, detail = 1) {
  const key = ci + ':' + detail;
  if (partCache.has(key)) return partCache.get(key);
  const base = DECKS[ci % DECKS.length];
  const lum = new THREE.Color(base).getHSL({}).l;
  const ink = lum > 0.62 ? 0x20222c : 0xf4f1ea, gold = lum > 0.62 ? 0xe4572e : 0xffd23f;
  const out = { deck: [], metal: [], wheel: [], segs: detail >= 1 ? 22 : 10 };
  const NZ = detail >= 1 ? 44 : 28, NX = detail >= 1 ? 10 : 6, PLIES = detail >= 1 ? 7 : 3;
  const zs = Array.from({ length: NZ + 1 }, (_, i) => L2 * Math.sin((i / NZ * 2 - 1) * Math.PI / 2));
  const ss = Array.from({ length: NX + 1 }, (_, i) => Math.sin((i / NX * 2 - 1) * Math.PI / 2));
  const topY = (s, z) => DECK_Y + rise(z) + CONCAVE * Math.pow(Math.abs(s), 2.3);
  // Top veneer face (coloured rim under the grip) and the grip tape on top of it.
  out.deck.push(grid(zs, ss, (i, j) => [ss[j] * halfW(zs[i]), topY(ss[j], zs[i]), zs[i]], true, base));
  const GZ = 0.965, GI = 0.012;
  out.deck.push(grid(zs, ss, (i, j) => { const z = zs[i] * GZ; return [ss[j] * Math.max(0, halfW(z) - GI), topY(ss[j], z) + 0.0013, z]; }, true,
    (i, j) => { const k = 0.82 + hash(i, j) * 0.3; return new THREE.Color(0x1d1d22).multiplyScalar(k); }));
  // Underside with the graphic.
  const NZb = detail >= 1 ? 52 : 30, NXb = detail >= 1 ? 14 : 8;
  const zb = Array.from({ length: NZb + 1 }, (_, i) => L2 * Math.sin((i / NZb * 2 - 1) * Math.PI / 2));
  const sb = Array.from({ length: NXb + 1 }, (_, i) => Math.sin((i / NXb * 2 - 1) * Math.PI / 2));
  const art = graphic(ci % 4, base, ink, gold);
  out.deck.push(grid(zb, sb, (i, j) => [sb[j] * halfW(zb[i]), topY(sb[j], zb[i]) - THICK, zb[i]], false,
    (i, j) => art((sb[j] + sb[j + 1]) * 0.5 * W2, (zb[i] + zb[i + 1]) * 0.5)));
  // Side wall, one strip per ply: veneer, maple, dark glue line...
  const plyCol = Array.from({ length: PLIES }, (_, k) => (k === 0 || k === PLIES - 1 ? base : k % 2 ? MAPLE : PLY));
  for (const sg of [-1, 1]) {
    out.deck.push(grid(zs, Array.from({ length: PLIES + 1 }, (_, k) => k), (i, k) => {
      const z = zs[i], y = topY(sg, z) - THICK * (k / PLIES);
      return [sg * halfW(z), y, z];
    }, sg > 0, (i, k) => plyCol[k]));
  }
  // Mounting bolts on the grip.
  for (const sz of [-1, 1]) for (const zo of [-0.04, 0.04]) for (const xo of [-0.027, 0.027]) {
    const z = sz * TRUCK_Z + zo;
    out.metal.push(cyl(0.0035, 0.003, 'y', xo, topY(xo / W2, z) + 0.0028, z, 0x3a3d44, 6));
  }
  // Trucks: riser pad, baseplate, hanger, kingpin with bushings, axle and nuts.
  for (const sz of [-1, 1]) {
    const zc = sz * TRUCK_Z, dir = -sz; // kingpin points to the board centre
    out.deck.push(box(0.07, 0.006, 0.108, 0, DECK_Y - THICK - 0.003, zc, 0x23242a));
    out.metal.push(box(0.074, 0.004, 0.104, 0, DECK_Y - THICK - 0.008, zc, 0xb9c0c8));
    out.metal.push(box(0.05, 0.024, 0.034, 0, 0.062, zc + dir * 0.004, 0xa5adb6));
    out.metal.push(box(0.15, 0.016, 0.026, 0, 0.039, zc, 0x9aa2ab));
    const kp = new THREE.CylinderGeometry(0.0055, 0.0055, 0.05, 8).rotateX(dir * 0.7).translate(0, 0.058, zc + dir * 0.012);
    out.metal.push(part(kp, 0x70757d));
    for (const k of [0, 1]) {
      const b = new THREE.CylinderGeometry(0.012, 0.012, 0.013, 10).rotateX(dir * 0.7).translate(0, 0.07 - k * 0.026, zc + dir * (0.006 + k * 0.021));
      out.metal.push(part(b, k ? 0xe4572e : 0xff9a3c));
    }
    out.metal.push(cyl(0.0045, 0.214, 'x', 0, WHEEL_R, zc, 0x80858d, 6));
    for (const sx of [-1, 1]) {
      out.metal.push(cyl(0.0075, 0.007, 'x', sx * 0.102, WHEEL_R, zc, 0x4b4f57, 8));
      wheelParts(WHEEL_R, WHEEL_W / 2, lum > 0.62 ? 0x2d2f36 : 0xf4f1ea, lum > 0.62 ? 0xe4572e : base, out, sx * 0.082, zc);
    }
  }
  const res = {
    deck: mergeGeometries(out.deck.map(prep)), metal: mergeGeometries(out.metal.map(prep)), wheel: mergeGeometries(out.wheel.map(prep)),
  };
  partCache.set(key, res);
  return res;
}
// All parts non-indexed with position, normal, color only, so they merge.
function prep(g) {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g.index ? g.toNonIndexed() : g;
}

export const boardMats = {
  deck: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.02 }),
  metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.7 }),
  wheel: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.0 }),
};
const KINDS = ['deck', 'metal', 'wheel'];

// A board for a rider; origin at the contact patch under the board centre. userData.mesh is the part that
// spins for kickflips (it turns about the deck centre).
export function makeRiderBoard(ci = 0) {
  const g = new THREE.Group();
  g.scale.setScalar(BOARD_SCALE);
  const spin = new THREE.Group();
  spin.position.y = DECK_Y;
  const inner = new THREE.Group();
  inner.position.y = -DECK_Y;
  spin.add(inner);
  g.add(spin);
  const meshes = KINDS.map((k) => { const m = new THREE.Mesh(boardParts(ci).deck, boardMats[k]); m.castShadow = k !== 'wheel'; inner.add(m); return m; });
  g.userData.mesh = spin;
  g.userData.ci = ci;
  g.userData.setColor = (c) => {
    c = ((c | 0) % DECKS.length + DECKS.length) % DECKS.length;
    if (c === g.userData.ci) return;
    g.userData.ci = c;
    const p = boardParts(c);
    KINDS.forEach((k, i) => { meshes[i].geometry = p[k]; });
  };
  meshes.forEach((m, i) => { m.geometry = boardParts(ci)[KINDS[i]]; });
  g.visible = false;
  // Build the other deck colours a little later so picking up a board never hitches.
  if (!makeRiderBoard.warm) { makeRiderBoard.warm = true; for (let c = 0; c < DECKS.length; c++) setTimeout(() => boardParts(c), 400 + 120 * c); }
  return g;
}

// Boards lying around the map: identical on every client because they come from the world seed.
export function placeBoards(world) {
  const r = mulberry32((world.seed ^ 0x5b0a4d) >>> 0);
  const spots = [];
  const ok = (x, z) => {
    if (Math.hypot(x, z) > 118 || world.blocked(x, z, 1.6) || (world.noPlace && world.noPlace(x, z, 2))) return false;
    if (Math.hypot(x - world.arena.x, z - world.arena.z) < world.arena.r + 4) return false;
    const h = world.heightAt(x, z);
    if (Math.abs(world.heightAt(x + 1.4, z) - h) > 0.6 || Math.abs(world.heightAt(x, z + 1.4) - h) > 0.6) return false;
    return spots.every((s) => Math.hypot(s.x - x, s.z - z) > 24);
  };
  const add = (x, z) => spots.push({ x, z, y: world.heightAt(x, z), yaw: r() * Math.PI * 2, ci: spots.length % DECKS.length, color: DECKS[spots.length % DECKS.length] });
  // Two close to where you arrive, the rest spread over the whole map.
  for (let tries = 0, got = 0; got < 2 && tries < 60; tries++) {
    const a = r() * Math.PI * 2, d = 6 + r() * 7;
    const x = world.spawn.x + Math.cos(a) * d, z = world.spawn.z + Math.sin(a) * d;
    if (ok(x, z)) { add(x, z); got++; }
  }
  for (let tries = 0, got = 0; got < 7 && tries < 400; tries++) {
    const a = r() * Math.PI * 2, d = 20 + r() * 98;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (ok(x, z)) { add(x, z); got++; }
  }
  if (!spots.length) return spots;
  const detail = 0.5; // boards on the ground are seen small; the rider's board (detail 1) is the close-up one
  const acc = { deck: [], metal: [], wheel: [] }, rings = [], beams = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (const s of spots) {
    // Lie flat on the slope, a hair above the ground.
    const hx = world.heightAt(s.x + 0.5, s.z) - world.heightAt(s.x - 0.5, s.z), hz = world.heightAt(s.x, s.z + 0.5) - world.heightAt(s.x, s.z - 0.5);
    q.setFromUnitVectors(up, new THREE.Vector3(-hx, 1, -hz).normalize());
    q.multiply(new THREE.Quaternion().setFromAxisAngle(up, s.yaw));
    m.compose(new THREE.Vector3(s.x, s.y + 0.02, s.z), q, new THREE.Vector3(BOARD_SCALE, BOARD_SCALE, BOARD_SCALE));
    const p = boardParts(s.ci, detail);
    for (const k of KINDS) acc[k].push(p[k].clone().applyMatrix4(m));
    rings.push(new THREE.RingGeometry(0.75, 0.92, 28).rotateX(-Math.PI / 2).translate(s.x, s.y + 0.06, s.z));
    beams.push(new THREE.CylinderGeometry(0.12, 0.5, 6, 10, 1, true).translate(s.x, s.y + 3, s.z));
  }
  const group = new THREE.Group();
  for (const k of KINDS) {
    const mesh = new THREE.Mesh(mergeGeometries(acc[k]), boardMats[k]);
    mesh.castShadow = k !== 'wheel';
    group.add(mesh);
  }
  const glow = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ringMat = glow(0x5fe0ff, 0.7), beamMat = glow(0x5fe0ff, 0.1);
  group.add(new THREE.Mesh(mergeGeometries(rings.map((g) => (g.index ? g.toNonIndexed() : g))), ringMat));
  group.add(new THREE.Mesh(mergeGeometries(beams.map((g) => (g.index ? g.toNonIndexed() : g))), beamMat));
  group.noSolid = true; world.group.add(group);
  world.animated.push((t) => { ringMat.opacity = 0.5 + 0.25 * Math.sin(t * 3); });
  return spots;
}

// ---------------------------------------------------------------- riding physics
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

export const SKATE = {
  maxMul: 1.75,    // top speed vs sprint (reached downhill or while holding sprint to pump)
  pushCap: 0.7,    // pushing alone tops out at this share of the top speed; sprint lifts the cap
  pushDv: 3.3,     // m/s gained by one kick-push from standstill (tapers toward the cap)
  roll: 0.42, drag: 0.0035, // rolling resistance m/s^2 and air drag per v^2: coasting bleeds speed slowly
  brake: 7.5, brakeV: 0.32, // foot drag deceleration: base + per m/s
  gSlope: 8.5,     // downhill pull per unit slope
  ollie: 0.82,     // jump height factor
};
const PUSH_HIT = 0.27, PUSH_END = 0.62;

export function newBoard(h, s, ci = 0) {
  return { h, s, lean: 0, pushT: -1, pushCd: 0, brake: false, air: false, ollieN: 0, kick: 0, aimT: 0, ci };
}

// Advance a board's heading and speed. (mx, mz) is the wanted direction, ml its strength (0 = no input).
// You steer like you walk: the board carves toward where you push (lean sets how hard, grip limits it with
// speed), a forward push kicks off with the back foot, letting go coasts, pushing back drags a foot.
// Returns a bit mask of events: 1 = the push foot hit the ground.
export function rideStep(b, dt, mx, mz, ml, maxS, slope, grounded, boost = false) {
  let ev = 0;
  const cap = boost ? maxS : maxS * SKATE.pushCap;
  const want = ml > 0.05;
  const d = want ? wrap(Math.atan2(mx, mz) - b.h) : 0, ad = Math.abs(d);
  b.air = !grounded; b.boost = !!boost;
  b.brake = grounded && want && ad > 2.2 && b.s > 0.8;
  const v = b.s;
  if (grounded) {
    // Carving: lean follows the wanted turn, the turn rate follows lean, speed and grip.
    const tgt = want && !b.brake ? clamp(d * 1.6, -1, 1) * clamp(ml, 0.4, 1) : 0;
    b.lean += (tgt - b.lean) * Math.min(1, dt * 9);
    const kick = 6.2 * (1 - smoothstep(1.2, 4.2, v)); // pivoting on the back wheels when slow
    const carve = Math.min(0.34 * v, 16 / Math.max(v, 3));
    const rate = Math.abs(b.lean) * Math.max(kick, carve);
    const step = Math.min(rate * dt, want ? ad : 9);
    b.h = wrap(b.h + Math.sign(b.lean) * step);
  } else {
    b.lean *= Math.max(0, 1 - 5 * dt);
    if (want) b.h = wrap(b.h + clamp(d, -1.5 * dt, 1.5 * dt));
  }
  // Pushing.
  const canPush = grounded && want && ad < 1.0 && !b.brake && (boost || b.s < cap * 0.985); // sprinting: keep kicking even at top speed
  if (b.pushT < 0) b.pushCd = Math.max(0, b.pushCd - dt);
  if (b.pushT < 0 && canPush && b.pushCd <= 0) b.pushT = 0;
  if (b.pushT >= 0) {
    if (b.brake || !grounded) b.pushT = -1;
    else {
      const T = lerp(0.5, 0.85, clamp(b.s / cap, 0, 1)) / (boost ? 1.15 : 1);
      const was = b.pushT;
      b.pushT += dt / T;
      if (was < PUSH_HIT && b.pushT >= PUSH_HIT) ev |= 1;
      if (b.pushT > PUSH_HIT && was < PUSH_END) {
        const u = clamp((b.pushT - PUSH_HIT) / (PUSH_END - PUSH_HIT), 0, 1);
        const dv = SKATE.pushDv * Math.pow(Math.max(0, 1 - b.s / cap), 0.7);
        b.s += (dv / ((PUSH_END - PUSH_HIT) * T)) * (Math.PI / 2) * Math.sin(Math.PI * u) * dt;
      }
      if (b.pushT >= 1) { b.pushT = -1; b.pushCd = boost ? 0.05 : lerp(0, 0.55, clamp(b.s / cap, 0, 1)); } // glide a while at speed (not when sprinting)
    }
  }
  // Coasting, carving scrub, foot drag and the hill.
  if (grounded) {
    b.s -= (SKATE.roll + SKATE.drag * b.s * b.s) * dt;
    b.s -= Math.abs(b.lean) * 0.1 * b.s * dt;
    if (b.brake) b.s -= (SKATE.brake + SKATE.brakeV * b.s) * dt;
    b.s -= slope * SKATE.gSlope * dt;
    if (want && !b.brake && slope > 0) b.s = Math.max(b.s, Math.min(cap, 3.2)); // pushing up any hill always keeps you rolling
  } else b.s -= SKATE.drag * b.s * b.s * dt;
  b.s = clamp(b.s, 0, maxS * 1.3);
  return ev;
}

// Jump off the board. A sideways push while you pop it throws a kickflip.
export function ollieBoard(b, mx, mz, ml) {
  b.ollieN++;
  b.kick = 0;
  if (ml > 0.5) {
    const d = wrap(Math.atan2(mx, mz) - b.h);
    if (Math.abs(d) > 0.9 && Math.abs(d) < 2.2) b.kick = d > 0 ? 1 : -1;
  }
}

// Board tilt that follows the ground under it: pitch (nose up is negative about x) and roll about the long axis.
export function groundTilt(world, x, z, h) {
  const fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h), e = 0.45;
  const along = (world.heightAt(x + fx * e, z + fz * e) - world.heightAt(x - fx * e, z - fz * e)) / (2 * e);
  const left = (world.heightAt(x + lx * e, z + lz * e) - world.heightAt(x - lx * e, z - lz * e)) / (2 * e);
  return { pitch: -Math.atan(along), roll: Math.atan(left) };
}

// ---------------------------------------------------------------- presence packing (teammates see the same pose)
export function packBoard(b) {
  const push = b.pushT >= 0 ? 1 + Math.min(14, Math.floor(b.pushT * 14.99)) : 0;
  return 1 << 13 | push | (b.brake ? 16 : 0) | (b.air ? 32 : 0) | ((b.kick > 0 ? 1 : b.kick < 0 ? 2 : 0) << 6) | (b.aimT > 0 ? 256 : 0) | ((b.ci & 7) << 9) | ((b.ollieN & 1) << 12);
}
export function unpackBoard(rb, p) {
  const sx = p.sx | 0;
  rb.h = (p.sb - 700) / 100; rb.s = (p.sp || 0) / 10; rb.lean = (p.sl || 0) / 100;
  const code = sx & 15;
  rb.pushT = code ? (code - 0.5) / 15 : -1;
  rb.brake = !!(sx & 16); rb.air = !!(sx & 32);
  rb.kick = [0, 1, -1, 0][(sx >> 6) & 3];
  rb.aimT = sx & 256 ? 1 : 0;
  rb.ci = (sx >> 9) & 7;
  const par = (sx >> 12) & 1;
  if (rb.par === undefined) rb.par = par;
  if (par !== rb.par) { rb.par = par; rb.ollieN = (rb.ollieN | 0) + 1; }
  return rb;
}

// ---------------------------------------------------------------- the rider
const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
function setWorldQuat(bone, qw) {
  bone.parent.getWorldQuaternion(_q2);
  bone.quaternion.copy(_q2.invert().multiply(qw));
  bone.updateMatrixWorld(true);
}
function rotateWorld(bone, axis, angle) {
  if (!bone || Math.abs(angle) < 1e-5) return;
  bone.getWorldQuaternion(_q);
  const r = _q3.setFromAxisAngle(axis, angle);
  setWorldQuat(bone, r.multiply(_q));
}
function twoBoneIK(upper, lower, end, target, pole) {
  const a = upper.getWorldPosition(new THREE.Vector3()), b = lower.getWorldPosition(new THREE.Vector3()), c = end.getWorldPosition(new THREE.Vector3());
  const lab = a.distanceTo(b), lbc = b.distanceTo(c);
  const t = target.clone();
  let dist = a.distanceTo(t);
  const maxR = (lab + lbc) * 0.999;
  if (dist > maxR) { t.sub(a).setLength(maxR).add(a); dist = maxR; }
  dist = Math.max(dist, Math.abs(lab - lbc) + 1e-3);
  const d = t.clone().sub(a).normalize();
  const pv = pole.clone().sub(a); pv.sub(d.clone().multiplyScalar(pv.dot(d))).normalize();
  const cosA = clamp((lab * lab + dist * dist - lbc * lbc) / (2 * lab * dist), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  const e = a.clone().addScaledVector(d, cosA * lab).addScaledVector(pv, sinA * lab);
  const q1 = new THREE.Quaternion().setFromUnitVectors(b.clone().sub(a).normalize(), e.clone().sub(a).normalize());
  setWorldQuat(upper, q1.multiply(upper.getWorldQuaternion(new THREE.Quaternion())));
  const b2 = lower.getWorldPosition(new THREE.Vector3()), c2 = end.getWorldPosition(new THREE.Vector3());
  const q2 = new THREE.Quaternion().setFromUnitVectors(c2.sub(b2).normalize(), t.clone().sub(b2).normalize());
  setWorldQuat(lower, q2.multiply(lower.getWorldQuaternion(new THREE.Quaternion())));
}

// Back-foot push path in board units: x across (negative = the side the rider faces), z along, up above the
// plane, g = how much it is on the road rather than the deck, yaw = foot direction relative to the heading.
const PUSH_KEYS = [
  [0.00, 0.00, -0.19, 0.000, 0, -1.45],
  [0.10, -0.07, -0.07, 0.100, 0, -1.10],
  [0.20, -0.19, 0.10, 0.030, 0.7, -0.45],
  [0.27, -0.20, 0.13, 0.000, 1, -0.25],
  [0.62, -0.18, -0.30, 0.000, 1, -0.25],
  [0.75, -0.12, -0.30, 0.100, 0, -0.70],
  [0.88, -0.02, -0.21, 0.030, 0, -1.42],
  [1.00, 0.00, -0.19, 0.000, 0, -1.45],
];
const _key = [0, 0, 0, 0, 0];
function pushPath(phi) {
  let i = 0;
  while (i < PUSH_KEYS.length - 2 && phi > PUSH_KEYS[i + 1][0]) i++;
  const a = PUSH_KEYS[i], b = PUSH_KEYS[i + 1];
  const t = smoothstep(0, 1, (phi - a[0]) / (b[0] - a[0]));
  for (let k = 0; k < 5; k++) _key[k] = lerp(a[k + 1], b[k + 1], t);
  return _key;
}
const REST_BACK = [0, -0.19, 0, 0, -Math.PI / 2 + 0.12], DRAG = [-0.2, -0.27, 0, 1, -0.2];

const STANCE = { front: 0.19, frontYaw: -Math.PI / 2 + 0.38, backYaw: -Math.PI / 2 + 0.12 };

// Poses a character on a board: pre() before the character's own animation update (body facing, height, lean
// and the board itself), post() after it (hips, head and legs onto the deck, push foot on the road).
export class RiderAnim {
  constructor() {
    this.w = 0; this.U = null; this.PH = 0; this.crouch = 0.1;
    this.pushFace = 0; this.brakeA = 0; this.lean = 0;
    this.popT = -1; this.flipT = -1; this.flipDir = 1; this.ollieN = null;
    this.airT = 0; this.air = false; this.landT = -1; this.ankleH = null;
    this.Qb = new THREE.Quaternion(); this.Qg = new THREE.Quaternion(); this.Pb = new THREE.Vector3(); this.Pg = new THREE.Vector3();
    this.phi = -1; this.h = 0;
  }
  reset() { this.w = 0; this.U = null; this.ollieN = null; this.popT = this.flipT = this.landT = -1; this.air = false; this.airT = 0; this.pushFace = this.brakeA = 0; }

  // b: board state (h, s, lean, pushT, brake, air, ollieN, kick, aimT, ci). o: { pos, yaw (aim), fp, tilt: {pitch, roll}, vy }
  pre(model, boardObj, b, dt, o) {
    const rs = this;
    rs.b = b; rs.h = b.h;
    if (rs.ollieN === null) rs.ollieN = b.ollieN;
    if (b.ollieN !== rs.ollieN) { rs.ollieN = b.ollieN; rs.popT = 0; rs.flipT = b.kick ? 0 : -1; rs.flipDir = b.kick || 1; }
    if (b.air && !rs.air) { rs.airT = 0; if (rs.popT < 0) rs.popT = 0.14; }
    if (!b.air && rs.air) rs.landT = 0;
    rs.air = !!b.air;
    if (rs.air) rs.airT += dt;
    if (rs.popT >= 0) { rs.popT += dt; if (rs.popT > 0.6) rs.popT = -1; }
    if (rs.flipT >= 0) { rs.flipT += dt; if (rs.flipT > 0.7) rs.flipT = -1; }
    if (rs.landT >= 0) { rs.landT += dt; if (rs.landT > 0.3) rs.landT = -1; }
    const ease = (k) => Math.min(1, dt * k);
    rs.w = Math.min(1, rs.w + dt / 0.22);
    const pushing = b.pushT >= 0;
    rs.phi = b.pushT;
    rs.pushFace += ((pushing ? 1 : 0) - rs.pushFace) * ease(9);
    rs.brakeA += ((b.brake ? 1 : 0) - rs.brakeA) * ease(12);
    rs.lean += (b.lean - rs.lean) * ease(10);
    const spd = b.s;

    // Crouch (hips down): low and springy, deeper in carves and at speed, a dip on each push, loaded for the pop.
    let c = 0.09 + 0.05 * Math.abs(rs.lean) * clamp(spd / 6, 0, 1) + 0.05 * clamp(spd / 14, 0, 1) + 0.045 * rs.brakeA;
    if (pushing) c += 0.05 * Math.sin(Math.PI * clamp(b.pushT, 0, 1));
    if (rs.popT >= 0 && rs.popT < 0.14) c += 0.11 * (1 - smoothstep(0, 0.14, rs.popT)) - 0.05 * smoothstep(0, 0.1, rs.popT);
    if (rs.air) c += 0.1 * smoothstep(0.1, 0.3, rs.airT);
    if (rs.landT >= 0) c += 0.17 * Math.sin(Math.PI * clamp(rs.landT / 0.3, 0, 1));
    rs.crouch += (c - rs.crouch) * ease(20);

    // Facing: feet and hips across the deck, shoulders turned a little toward travel; to the aim when shooting.
    const h = b.h;
    rs.PH = h + lerp(-Math.PI / 2 + 0.2, -0.5, rs.pushFace);
    let Ut;
    if (o.fp) Ut = o.yaw;
    else if (b.aimT > 0) Ut = rs.PH + clamp(wrap(o.yaw - rs.PH), -1.9, 1.9);
    else Ut = h + lerp(-Math.PI / 2 + 0.6, -0.35, rs.pushFace);
    if (rs.U === null) rs.U = Ut;
    rs.U = wrap(rs.U + wrap(Ut - rs.U) * ease(o.fp ? 40 : 14));

    // Body: lowered onto the deck, banked into the turn.
    const w = rs.w;
    const lag = rs.popT >= 0 && rs.popT < 0.4 ? 0.2 * Math.sin(Math.PI * clamp(rs.popT / 0.4, 0, 1)) : 0; // the board trails the feet at the pop
    const sole = DECK_Y * BOARD_SCALE + 0.0013 * BOARD_SCALE;
    model.position.set(o.pos.x, o.pos.y + (sole - rs.crouch) * w, o.pos.z);
    _q.setFromAxisAngle(UP, rs.U);
    _v.set(Math.sin(h), 0, Math.cos(h));
    _q2.setFromAxisAngle(_v, -rs.lean * 0.13 * w * clamp(spd / 5, 0.3, 1));
    model.quaternion.copy(_q2.multiply(_q));

    // Board: follows the ground, rolls onto its edge in carves, pops nose-up on the ollie.
    const t = o.tilt || { pitch: 0, roll: 0 };
    let pop = 0;
    if (rs.popT >= 0) pop = rs.popT < 0.07 ? 0.62 * Math.sin(Math.PI / 2 * rs.popT / 0.07) : 0.62 * (1 - smoothstep(0.1, 0.34, rs.popT));
    const airPitch = rs.air ? -clamp((o.vy || 0) * 0.025, -0.22, 0.22) : 0;
    const rollScale = clamp(spd / 4, 0.3, 1);
    rs.Qg.setFromEuler(_e.set(t.pitch, h, t.roll, 'YXZ'));
    rs.Qb.setFromEuler(_e.set(t.pitch - pop + airPitch, h, t.roll - rs.lean * 0.3 * rollScale, 'YXZ'));
    rs.Pg.set(o.pos.x, o.pos.y, o.pos.z);
    rs.Pb.set(o.pos.x, o.pos.y - lag, o.pos.z);
    if (pop > 0 && rs.popT < 0.14) { // the tail stays on the road while the nose comes up
      _v.set(0, 0, -0.4 * BOARD_SCALE);
      _v2.copy(_v).applyQuaternion(rs.Qg).sub(_v.applyQuaternion(rs.Qb)).multiplyScalar(1 - smoothstep(0.08, 0.14, rs.popT));
      rs.Pb.add(_v2);
    }
    model.updateMatrixWorld(true);
    _q.copy(model.quaternion).invert();
    boardObj.position.copy(rs.Pb).sub(model.position).applyQuaternion(_q);
    boardObj.quaternion.copy(_q.multiply(rs.Qb));
    boardObj.userData.mesh.rotation.z = rs.flipT >= 0 ? rs.flipDir * Math.PI * 2 * smoothstep(0.08, 0.62, rs.flipT) : 0;
    model.updateMatrixWorld(true);
  }

  // Foot target for one side: ankle position and the world frame the flat foot rotates into.
  foot(side, rig, out) {
    const rs = this, S = BOARD_SCALE, front = side === 'Left';
    let x, z, up, g, yaw;
    if (front) { x = 0; z = STANCE.front; up = 0; g = 0; yaw = STANCE.frontYaw; }
    else {
      const k = rs.phi >= 0 && rs.brakeA < 0.99 ? pushPath(clamp(rs.phi, 0, 1)) : REST_BACK;
      [x, z, up, g, yaw] = k;
      if (rs.b.boost && rs.phi >= 0) { z = z < 0 ? z * 1.35 : z * 1.15; up *= 1.2; } // sprint: a longer, harder kick along the road
      if (rs.brakeA > 0.01) { const a = rs.brakeA; x = lerp(x, DRAG[0], a); z = lerp(z, DRAG[1], a); up = lerp(up, DRAG[2], a); g = lerp(g, DRAG[3], a); yaw = lerp(yaw, DRAG[4], a); }
    }
    // Deck point and road point, blended by g.
    const pd = _v.set(x, deckTop(z), z).multiplyScalar(S).applyQuaternion(rs.Qb).add(rs.Pb);
    const nb = _n1.set(0, 1, 0).applyQuaternion(rs.Qb);
    pd.addScaledVector(nb, up);
    const pg = _p2.set(x, 0, z).multiplyScalar(S).applyQuaternion(rs.Qg).add(rs.Pg);
    const ng = _n2.set(0, 1, 0).applyQuaternion(rs.Qg);
    pg.addScaledVector(ng, up);
    out.pos.copy(pd).lerp(pg, g);
    out.n.copy(nb).lerp(ng, g).normalize();
    out.pos.addScaledVector(out.n, rs.ankleH ?? 0.08);
    // Frame: board (or road) orientation, then the foot's own yaw about the deck normal.
    _q.copy(rs.Qb).slerp(rs.Qg, g);
    out.yaw = yaw;
    out.q.copy(_q).multiply(_q3.setFromAxisAngle(UP, yaw));
    // Ankle sits behind the middle of the foot.
    _v2.set(Math.sin(rs.h + yaw), 0, Math.cos(rs.h + yaw));
    out.pos.addScaledVector(_v2, -0.045 * rig.h);
    out.toe.copy(_v2);
    return out;
  }

  post(model) {
    const rs = this, rig = model.userData.rig;
    if (!rig || !rig.ok || rs.w < 0.02 || !rs.b) return;
    const B = rig.b, hips = B.get('Hips'), sp0 = B.get('Spine'), UL = B.get('LeftUpLeg'), UR = B.get('RightUpLeg');
    if (!hips || !sp0 || !UL || !UR || !B.get('LeftFoot') || !B.get('RightFoot')) return;
    model.updateMatrixWorld(true);
    const w = rs.w;
    if (rs.ankleH === null) {
      const ry = model.getWorldPosition(_v).y;
      const a = Math.min(B.get('LeftFoot').getWorldPosition(_v2).y, B.get('RightFoot').getWorldPosition(_v2).y) - ry;
      rs.ankleH = clamp(a, 0.05, 0.14);
    }
    // Legs and hips turn across the deck while the chest keeps the facing set in pre().
    const cur = wrap(rs.U + rig.legYaw), delta = wrap(rs.PH - cur) * w;
    const act = cur + delta;
    if (Math.abs(delta) > 1e-4) {
      const p0 = sp0.getWorldPosition(new THREE.Vector3());
      rotateWorld(hips, UP, delta);
      rotateWorld(sp0, UP, -delta);
      const p1 = sp0.getWorldPosition(new THREE.Vector3());
      const hw = hips.getWorldPosition(new THREE.Vector3()).add(p0).sub(p1);
      hips.parent.worldToLocal(hw);
      hips.position.copy(hw);
      hips.updateMatrixWorld(true);
    }
    // Look where you are going.
    if (!rig.firstPerson) {
      const look = clamp(wrap(rs.h - rs.U), -1.3, 1.3) * w;
      rotateWorld(B.get('Neck'), UP, look * 0.4);
      rotateWorld(B.get('Head'), UP, look * 0.4);
    }
    model.updateMatrixWorld(true);
    // Feet onto the deck (the back foot onto the road while pushing or dragging).
    const tg = _tg;
    for (const side of ['Left', 'Right']) {
      const ft = B.get(side + 'Foot'), up = B.get(side + 'UpLeg'), lo = B.get(side + 'Leg');
      this.foot(side, rig, tg);
      const qNow = ft.getWorldQuaternion(new THREE.Quaternion());
      const qrel = new THREE.Quaternion().setFromAxisAngle(UP, -act).multiply(qNow); // the planted idle foot, yaw removed
      const target = tg.pos.clone();
      const pNow = ft.getWorldPosition(new THREE.Vector3());
      if (w < 1) target.lerpVectors(pNow, target, w);
      const hipP = up.getWorldPosition(new THREE.Vector3());
      const pole = hipP.clone().add(target).multiplyScalar(0.5).addScaledVector(tg.toe, 0.6);
      twoBoneIK(up, lo, ft, target, pole);
      const qWant = tg.q.clone().multiply(qrel);
      if (w < 1) qWant.copy(qNow.clone().slerp(qWant, w));
      setWorldQuat(ft, qWant);
    }
    model.updateMatrixWorld(true);
  }
}
const _e = new THREE.Euler(), _n1 = new THREE.Vector3(), _n2 = new THREE.Vector3(), _p2 = new THREE.Vector3();
const _tg = { pos: new THREE.Vector3(), n: new THREE.Vector3(), q: new THREE.Quaternion(), toe: new THREE.Vector3(), yaw: 0 };
