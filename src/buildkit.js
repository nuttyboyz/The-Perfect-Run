// Walk-in buildings. Standing rule (Nutty 2026-11-12): every building and structure on a map can be walked inside, with no
// entrance blockers. A building here is a hollow shell: real walls with open doorways, a lintel over each doorway you walk under,
// a floor and a roof you can also stand on. Looks are boxes with scanned stone photos, merged into one mesh per material.
// Physics are World.platforms boxes (movement, shots, standing); `bld` marks the pieces the third-person camera must stay out of.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxUV } from './stages.js';

export class Shell {
  constructor(world) { this.w = world; this.groups = new Map(); }
  // A box of material `mat`, W x H x D, centred at (x, z) with its underside at y, turned by yaw.
  box(mat, W, H, D, x, y, z, yaw = 0, uvk = 0.26) {
    const g = boxUV(new THREE.BoxGeometry(W, H, D), uvk).rotateY(yaw).translate(x, y + H / 2, z);
    this.geo(mat, g);
    return this;
  }
  geo(mat, g) {
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!this.groups.has(mat)) this.groups.set(mat, []);
    this.groups.get(mat).push(g);
  }
  // The physics of a box: blocks movement and shots between base and top, and its top can be stood on.
  solid(W, H, D, x, y, z, yaw = 0, { under = false, bld = true, shot = true } = {}) {
    const w = this.w;
    w.platforms.push({ box: true, x, z, hw: W / 2, hd: D / 2, yaw: -yaw, top: y + H, base: under ? y : undefined, bld });
    if (shot && !under && w.duel) w.solids.push({ t: 'b', x, z, hx: W / 2, hz: D / 2, c: Math.cos(yaw), s: -Math.sin(yaw), top: y + H });
    return this;
  }
  // Look and physics together.
  block(mat, W, H, D, x, y, z, yaw = 0, opts = {}) { return this.box(mat, W, H, D, x, y, z, yaw, opts.uvk).solid(W, H, D, x, y, z, yaw, opts); }
  finish() {
    for (const [mat, list] of this.groups) {
      const m = new THREE.Mesh(mergeGeometries(list), mat);
      m.castShadow = m.receiveShadow = true;
      this.w.group.add(m);
    }
    this.groups.clear();
  }
}

// A hollow hall: W along its local x, D along its local z, walls H tall and th thick, standing on yb.
// doors: [{ side: 'x+' | 'x-' | 'z+' | 'z-', w, h, off }] are open doorways (off = offset along the wall from its middle).
// roof: 'flat' (a slab with a cornice) or 'gable' (ridge along local z, `rise` high, `over` m of overhang past each gable end).
// Returns at(lx, lz): local to world.
// tk scales the trim (plinth, cornice, door frames) for small buildings; sink carries the walls below yb on sloping ground.
export function hall(S, { x, z, yaw = 0, W, D, H, th = 1, yb, doors = [], mats, roof = 'flat', rise = 3, over = 0, floor = true, tk = 1, sink = 0 }) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  const sides = [
    { id: 'z+', len: W, pos: (o) => [o, D / 2 - th / 2], ry: 0 },
    { id: 'z-', len: W, pos: (o) => [o, -D / 2 + th / 2], ry: 0 },
    { id: 'x+', len: D - 2 * th, pos: (o) => [W / 2 - th / 2, o], ry: Math.PI / 2 },
    { id: 'x-', len: D - 2 * th, pos: (o) => [-W / 2 + th / 2, o], ry: Math.PI / 2 },
  ];
  for (const sd of sides) {
    const ds = doors.filter((d) => d.side === sd.id).sort((a, b) => (a.off || 0) - (b.off || 0));
    let from = -sd.len / 2;
    const seg = (a, b) => {
      if (b - a < 0.05) return;
      const [px, pz] = at(...sd.pos((a + b) / 2));
      S.block(mats.wall, b - a, H + sink, th, px, yb - sink, pz, yaw + sd.ry);
      // A plinth course at the foot and a cornice band at the top, standing a little proud of the wall.
      S.box(mats.trim || mats.wall, b - a, 0.9 * tk + sink, th + 0.3 * tk, px, yb - sink, pz, yaw + sd.ry).box(mats.trim || mats.wall, b - a, 0.55 * tk, th + 0.36 * tk, px, yb + H - 0.55 * tk, pz, yaw + sd.ry);
    };
    for (const d of ds) {
      const o = d.off || 0;
      seg(from, o - d.w / 2);
      const [px, pz] = at(...sd.pos(o));
      if (H - d.h > 0.05) S.block(mats.trim || mats.wall, d.w, H - d.h, th, px, yb + d.h, pz, yaw + sd.ry, { under: true }); // the lintel: walk under it
      // Door jambs: a slightly proud frame either side, so the opening reads as a doorway.
      for (const k of [-1, 1]) { const [jx, jz] = at(...sd.pos(o + k * (d.w / 2 + 0.25 * tk))); S.box(mats.trim || mats.wall, 0.5 * tk, d.h + 0.3 * tk + sink, th + 0.3 * tk, jx, yb - sink, jz, yaw + sd.ry); }
      from = o + d.w / 2;
    }
    seg(from, sd.len / 2);
  }
  const trim = mats.trim || mats.wall;
  // Dressed corner stones.
  for (const [kx, kz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const [qx, qz] = at(kx * (W / 2 - th / 2), kz * (D / 2 - th / 2)); S.box(trim, th + 0.4 * tk, H + sink, th + 0.4 * tk, qx, yb - sink, qz, yaw); }
  if (floor) { S.box(mats.floor || trim, W + 0.6, 0.3, D + 0.6, x, yb - 0.15, z, yaw, 0.3); S.solid(W + 0.6, 0.3, D + 0.6, x, yb - 0.15, z, yaw, { bld: false, shot: false }); }
  if (roof === 'flat') {
    S.block(mats.roof || trim, W + 1.0, 0.6, D + 1.0, x, yb + H, z, yaw, { under: true });
    // A low parapet round the roof.
    for (const [lx, lz, pw, pd] of [[0, D / 2 + 0.3, W + 1.0, 0.4], [0, -D / 2 - 0.3, W + 1.0, 0.4], [W / 2 + 0.3, 0, 0.4, D + 0.2], [-W / 2 - 0.3, 0, 0.4, D + 0.2]]) { const [px, pz] = at(lx, lz); S.box(trim, pw, 0.5, pd, px, yb + H + 0.6, pz, yaw); }
  } else if (roof === 'gable') {
    const half = W / 2 + 0.7, slope = Math.hypot(half, rise), ang = Math.atan2(rise, half), len = D + 2 * over + 0.8;
    S.box(trim, W + 0.8, 0.5, D + 2 * over + 0.4, x, yb + H, z, yaw); // entablature under the roof
    S.solid(W + 0.8, 0.5, D + 2 * over + 0.4, x, yb + H, z, yaw, { under: true });
    for (const k of [-1, 1]) {
      const g = boxUV(new THREE.BoxGeometry(slope, 0.4, len), 0.4).rotateZ(-k * ang).translate(k * half / 2, rise / 2, 0).rotateY(yaw).translate(x, yb + H + 0.5, z);
      S.geo(mats.roof || trim, g);
    }
    // Pediments: the triangles that close the gable ends.
    const tri = new THREE.Shape(); tri.moveTo(-half + 0.3, 0); tri.lineTo(half - 0.3, 0); tri.lineTo(0, rise - 0.15); tri.closePath();
    for (const k of [-1, 1]) {
      const g = new THREE.ExtrudeGeometry(tri, { depth: 0.5, bevelEnabled: false }).translate(0, 0, -0.25);
      const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 0.4, p.getY(i) * 0.4);
      S.geo(trim, g.translate(0, 0, k * (D / 2 + over - 0.1)).rotateY(yaw).translate(x, yb + H + 0.5, z));
    }
    S.w.platforms.push({ box: true, x, z, hw: half, hd: len / 2, yaw: -yaw, top: yb + H + 0.5 + rise + 0.2, pitch: rise / half, base: yb + H + 0.5, bld: true });
  }
  S.w.blobs.push({ x, z, y: yb + 0.2, r: Math.max(W, D) * 0.75 });
  return at;
}

// A column with a base and a capital (round, n-sided), solid.
export function column(S, mat, x, z, r, h, yb) {
  S.geo(mat, new THREE.CylinderGeometry(r * 0.88, r, h - 0.9, 18).translate(x, yb + 0.5 + (h - 0.9) / 2, z));
  S.box(mat, r * 2.6, 0.5, r * 2.6, x, yb, z, 0, 0.5);
  S.box(mat, r * 2.5, 0.4, r * 2.5, x, yb + h - 0.4, z, 0, 0.5);
  S.w.addCollider(x, z, r, yb + h);
  if (S.w.duel) S.w.solids.push({ t: 'c', x, z, r, top: yb + h });
}

// The walking surface of a stair: one slope from lo to hi, climbing along +local z of `yaw` from its foot at (x, z). You walk
// straight up and down it with no jumping (World.collide / standY read `ramp`). Shots ignore it: they stop on the treads.
export function ramp(w, x, z, yaw, width, run, lo, hi, { under = false, lift = 0.16 } = {}) {
  w.platforms.push({ box: true, x: x + Math.sin(yaw) * run / 2, z: z + Math.cos(yaw) * run / 2, hw: width / 2, hd: run / 2, yaw: -yaw, top: hi, lo, lift, ramp: true, base: under ? lo : undefined, noShot: true, bld: false });
}

// A stair up to a height, climbing along +local z of `yaw` from (x, z): real treads (a third of a metre each) over a walking
// slope, so it is walked, never jumped (Nutty 2026-11-14). rise and depth only set how long the whole stair runs.
// under: the stair stands on an upper floor (you can walk beneath that floor). sink: carry the treads below yb on sloping ground.
export function steps(S, mat, x, z, yaw, toH, yb, { rise = 1.0, depth = 1.5, width = 2.6, under = false, sink = 0 } = {}) {
  const run = Math.max(1, Math.ceil((toH - yb) / rise - 1e-6)) * depth, n = Math.max(1, Math.ceil((toH - yb) / 0.33 - 1e-6)), d = run / n, r = (toH - yb) / n;
  const c = Math.cos(yaw), s = Math.sin(yaw), y0 = yb - sink, P = S.w.platforms;
  for (let i = 0; i < n; i++) {
    const o = (i + 0.5) * d;
    S.block(mat, width, yb + r * (i + 1) - y0, d, x + s * o, y0, z + c * o, yaw, { bld: false, under, uvk: 0.35 });
    P[P.length - 1].shotOnly = true;
  }
  ramp(S.w, x, z, yaw, width, run, yb, toH, { under, lift: r / 2 });
}

// Floors for a building with more than one storey (Nutty 2026-11-14: every storey has a floor). levels: the height of each
// floor from the ground up. Each storey gets a stair along a side wall (they alternate sides) and the floor above is whole
// except for the stairwell the stair comes up through. Ix, Iz: half the inside of the building; at: its local-to-world.
export function storeys(S, at, yaw, Ix, Iz, levels, mats, { sw = 1.7 } = {}) {
  const sx = Ix - sw / 2 - 0.05;
  for (let f = 0; f + 1 < levels.length; f++) {
    const side = f % 2 === 0 ? -1 : 1, y0 = levels[f], y1 = levels[f + 1], n = Math.ceil((y1 - y0) / 0.33 - 1e-6), run = n * 0.55, h = run / 2;
    const [fx, fz] = at(side * sx, side * h);
    steps(S, mats.stone || mats.trim || mats.wall, fx, fz, yaw + (side < 0 ? 0 : Math.PI), y1, y0, { rise: 0.33, depth: 0.55, width: sw, under: f > 0, sink: f ? 0 : 1.8 });
    const fm = (f + 2 === levels.length && mats.roof) || mats.floor || mats.trim || mats.wall;
    const slab = (lx, lz, W, D) => { if (D < 0.2) return; const [x, z] = at(lx, lz); S.block(fm, W, 0.4, D, x, y1 - 0.4, z, yaw, { under: true, uvk: 0.3 }); };
    const fw = 2 * Ix - sw + 0.2;
    slab(-side * (Ix - fw / 2), 0, fw, 2 * Iz); // the floor
    slab(side * (sx - 0.3), -side * (h + Iz) / 2, sw + 0.6, Iz - h); // the landing at the head of the stair
    const p = Math.max(0, ((y1 - 0.4 - y0) - 2.4) / (y1 - y0) * run); // the floor carries on over the foot of the stair, as far as there is headroom
    slab(side * (sx - 0.3), side * (Iz + h - p) / 2, sw + 0.6, Iz - h + p);
  }
}
