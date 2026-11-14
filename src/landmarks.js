// Landmarks (Nutty 2026-11-12): more structures on every run map, each one true to the map's theme, and every one of them open:
// you can walk into it, under it and stand on top of it (standing rule: nothing on a map is a sealed box). Built from the walk-in
// kit (buildkit.js): hollow halls with open doorways, colonnades, arches, watchtowers, and a stair up to every roof.
// pickLandmarkSites runs before the terrain mesh is made, so each site gets a patch of level ground; buildLandmarks runs after the
// stage's own scenery. Sites keep clear of the spawn, the boss arena, water and whatever the stage itself has built.
import * as THREE from 'three';
import { Shell, hall, column, steps, storeys } from './buildkit.js';
import { stoneMat, surfMat } from './stages.js';
import { mulberry32 } from './rng.js';

const TAU = Math.PI * 2;
const SITE_R = 15;

// What each map builds, and from what. kinds: [kind, weight].
export function theme(id) {
  const wood = () => ({
    wall: surfMat('rough_wood', { tint: [0.95, 0.8, 0.62], rough: 0.88, bump: 0.7, rep: 1 }), trim: surfMat('dark_wood', { tint: [1.1, 1.0, 0.9], rough: 0.85, bump: 0.6 }),
    roof: surfMat('rough_wood', { tint: [0.62, 0.66, 0.46], rough: 0.9, bump: 0.9, rep: 3 }), floor: surfMat('rough_wood', { tint: [0.8, 0.68, 0.52], rough: 0.9, bump: 0.5, rep: 2 }),
    stone: stoneMat('mossy_rock', [0.92, 0.92, 0.9], 0.8),
  });
  switch (id) {
    case 'graveyard': { const wall = stoneMat('mud_cracked_dry_03', [0.8, 0.8, 0.84], 1), trim = stoneMat('rock_face', [1.5, 1.5, 1.46], 1), roof = stoneMat('dark_rock', [0.8, 0.84, 0.95], 1);
      return { n: 14, mats: { wall, trim, roof, floor: trim, stone: trim }, kinds: [['crypt', 4], ['chapel', 2], ['arch', 3], ['temple', 1]] }; }
    case 'forest': case 'clearing': case 'waterfall': case 'springs':
      return { n: 14, mats: wood(), kinds: [['cabin', 4], ['watch', 3], ['arch', 2], ['chapel', 1]] };
    case 'desert': { const wall = stoneMat('mud_cracked_dry_03', [1.55, 1.28, 0.92], 1.2), trim = stoneMat('mud_cracked_dry_03', [1.15, 0.92, 0.66], 2.2), roof = stoneMat('mud_cracked_dry_03', [1.3, 1.1, 0.82], 0.7);
      return { n: 15, mats: { wall, trim, roof, floor: roof, stone: trim }, kinds: [['adobe', 5], ['temple', 3], ['arch', 3], ['keep', 1]] }; }
    case 'frozen': { const wall = stoneMat('rock_face', [1.15, 1.2, 1.3], 1), trim = stoneMat('snow_02', [1.5, 1.55, 1.65], 1), roof = trim;
      return { n: 14, mats: { wall, trim, roof, floor: wall, stone: wall }, kinds: [['keep', 4], ['chapel', 2], ['arch', 2], ['adobe', 2]] }; }
    case 'volcanic': case 'volcano': { const wall = stoneMat('dark_rock', [0.95, 0.88, 0.86], 1), trim = stoneMat('dark_rock_02', [1.4, 1.15, 1.0], 1), roof = stoneMat('burned_ground_01', [1.1, 0.9, 0.8], 1);
      return { n: 13, mats: { wall, trim, roof, floor: trim, stone: trim }, kinds: [['keep', 4], ['temple', 3], ['arch', 3], ['crypt', 1]] }; }
    case 'space': { const wall = surfMat('metal_plate', { tint: [1.15, 1.2, 1.3], rough: 0.55, bump: 0.5, rep: 1 }), trim = surfMat('metal_plate_02', { tint: [0.9, 0.95, 1.05], rough: 0.5, bump: 0.6 }), roof = surfMat('rusty_metal_04', { tint: [0.8, 0.85, 0.95], rough: 0.7, bump: 0.4 });
      return { n: 12, mats: { wall, trim, roof, floor: trim, stone: trim }, kinds: [['module', 5], ['watch', 3], ['pad', 3]] }; }
    case 'ruins': { const wall = stoneMat('mossy_rock', [0.92, 0.92, 0.9], 0.8), trim = stoneMat('rock_face', [1.3, 1.3, 1.22], 1);
      return { n: 9, mats: { wall, trim, roof: trim, floor: trim, stone: trim }, kinds: [['keep', 3], ['arch', 4], ['temple', 3], ['crypt', 1]] }; }
    default: { const wall = stoneMat('dark_rock', [0.8, 0.7, 1.0], 1), trim = stoneMat('rock_face', [1.0, 0.9, 1.3], 1);
      return { n: 12, mats: { wall, trim, roof: trim, floor: trim, stone: trim }, kinds: [['keep', 3], ['temple', 3], ['arch', 3], ['crypt', 2]] }; }
  }
}

// Before the terrain is made: choose the sites and level the ground under each.
export function pickLandmarkSites(w) {
  const T = theme(w.biome.id), r = mulberry32((w.seed * 13 + 7771) >>> 0), sites = [];
  const tot = T.kinds.reduce((a, k) => a + k[1], 0);
  for (let tries = 0; sites.length < T.n && tries < 900; tries++) {
    const a = r() * TAU, d = 34 + Math.sqrt(r()) * 122, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.hypot(x - w.spawn.x, z - w.spawn.z) < 30 || Math.hypot(x - w.arena.x, z - w.arena.z) < w.arena.r + 22) continue;
    if (w.noPlace(x, z, SITE_R + 5)) continue;
    if (sites.some((s) => Math.hypot(s.x - x, s.z - z) < 38)) continue;
    if ((w.flats || []).some((f) => Math.hypot(f.x - x, f.z - z) < f.r + (f.blend || 0) + SITE_R)) continue;
    const h = w.rawHeight(x, z);
    let steep = 0; for (let k = 0; k < 6; k++) steep = Math.max(steep, Math.abs(w.rawHeight(x + Math.cos(k * 1.047) * 11, z + Math.sin(k * 1.047) * 11) - h));
    if (steep > 4.5) continue;
    let roll = r() * tot, kind = T.kinds[0][0];
    for (const [k, wt] of T.kinds) { roll -= wt; if (roll <= 0) { kind = k; break; } }
    sites.push({ x, z, h, yaw: r() * TAU, kind, s: r() });
    w.flats.push({ x, z, r: SITE_R, blend: 10, h });
  }
  w.landSites = sites;
  return sites;
}

// A stair of jump-high steps up the outside of a building, running along its local +z and ending at local z = zEnd.
function stairUp(S, mat, at, yaw, lx, zEnd, toH, yb, width = 1.7) {
  const n = Math.max(1, Math.ceil((toH - yb) / 1.0)), [sx, sz] = at(lx, zEnd - n * 1.5);
  steps(S, mat, sx, sz, yaw, toH, yb, { width });
}

const BUILD = {
  // A cabin or lodge: gable roof, open doorways front and back, a stair up the side to the eave.
  cabin(S, M, st, yb) {
    const W = 6 + st.s * 3, D = 7.5 + st.s * 3, H = 3.4;
    const at = hall(S, { x: st.x, z: st.z, yaw: st.yaw, W, D, H, th: 0.4, yb, sink: 1.6, tk: 0.5, roof: 'gable', rise: W * 0.34, over: 0.5, mats: M,
      doors: [{ side: 'z+', w: 2.0, h: 2.6 }, { side: 'z-', w: 1.8, h: 2.6 }, { side: 'x+', w: 1.6, h: 2.5, off: D * 0.15 }] });
    stairUp(S, M.stone, at, st.yaw, -(W / 2 + 1.25), D / 2 - 0.5, yb + H + 0.6, yb);
    const [tx, tz] = at(W * 0.2, -D * 0.18); S.block(M.trim, 1.8, 0.9, 1.0, tx, yb + 0.15, tz, st.yaw, { bld: false }); // a table to hop on
  },
  // A chapel: a long gabled nave with a wide front door and side doors.
  chapel(S, M, st, yb) {
    const W = 8.5, D = 14, H = 6;
    const at = hall(S, { x: st.x, z: st.z, yaw: st.yaw, W, D, H, th: 0.8, yb, sink: 1.6, tk: 0.8, roof: 'gable', rise: 3.4, over: 1.0, mats: M,
      doors: [{ side: 'z+', w: 2.8, h: 3.8 }, { side: 'x+', w: 2.0, h: 3.0, off: -2 }, { side: 'x-', w: 2.0, h: 3.0, off: 2 }, { side: 'z-', w: 1.8, h: 2.8 }] });
    stairUp(S, M.stone, at, st.yaw, -(W / 2 + 1.3), D / 2, yb + H + 0.6, yb);
    for (const lz of [-3.5, 0]) for (const k of [-1, 1]) { const [bx, bz] = at(k * 2.2, lz); S.block(M.trim, 2.4, 0.55, 0.7, bx, yb + 0.15, bz, st.yaw, { bld: false }); } // pews
    const [ax, az] = at(0, -D / 2 + 2.2); S.block(M.trim, 2.6, 1.1, 1.2, ax, yb + 0.15, az, st.yaw, { bld: false }); // the altar
  },
  // A crypt: low and thick-walled, a flat roof with a parapet, a tomb inside.
  crypt(S, M, st, yb) {
    const W = 7, D = 9, H = 4.2;
    const at = hall(S, { x: st.x, z: st.z, yaw: st.yaw, W, D, H, th: 0.8, yb, sink: 1.6, tk: 0.8, roof: 'flat', mats: M,
      doors: [{ side: 'z+', w: 2.2, h: 3.0 }, { side: 'z-', w: 1.7, h: 2.6 }] });
    stairUp(S, M.stone, at, st.yaw, -(W / 2 + 1.3), D / 2, yb + H + 0.6, yb);
    const [tx, tz] = at(0, -0.6); S.block(M.trim, 1.3, 1.0, 2.6, tx, yb + 0.15, tz, st.yaw, { bld: false });
  },
  // A flat-roofed house with a walled roof terrace.
  adobe(S, M, st, yb) {
    const W = 7 + st.s * 3, D = 7 + st.s * 2, H = 3.6;
    const at = hall(S, { x: st.x, z: st.z, yaw: st.yaw, W, D, H, th: 0.55, yb, sink: 1.6, tk: 0.6, roof: 'flat', mats: M,
      doors: [{ side: 'z+', w: 2.0, h: 2.7 }, { side: 'x+', w: 1.8, h: 2.6 }, { side: 'z-', w: 1.6, h: 2.5, off: W * 0.2 }] });
    stairUp(S, M.stone, at, st.yaw, -(W / 2 + 1.3), D / 2, yb + H + 0.6, yb);
    // A second, smaller room on the roof, open on two sides, with its own little roof to climb.
    const [ux, uz] = at(W * 0.18, -D * 0.14);
    hall(S, { x: ux, z: uz, yaw: st.yaw, W: W * 0.5, D: D * 0.5, H: 2.7, th: 0.4, yb: yb + H + 0.6, tk: 0.4, roof: 'flat', floor: false, mats: M, doors: [{ side: 'z+', w: 1.6, h: 2.3 }, { side: 'x-', w: 1.5, h: 2.3 }] });
    const [bx, bz] = at(W * 0.18 - W * 0.25 - 0.9, -D * 0.14 + D * 0.25 - 4);
    steps(S, M.stone, bx, bz, st.yaw, yb + H + 0.6 + 2.7 + 0.6, yb + H + 0.6, { width: 1.4, depth: 1.0 });
  },
  // A keep: a tall hollow tower with two doorways, a gallery floor half way up, and a long stair to the battlements.
  keep(S, M, st, yb) {
    const W = 11 + Math.round(st.s * 2), H = 9;
    const at = hall(S, { x: st.x, z: st.z, yaw: st.yaw, W, D: W, H, th: 1.0, yb, sink: 1.8, tk: 0.8, roof: 'flat', mats: M,
      doors: [{ side: 'z+', w: 2.4, h: 3.2 }, { side: 'x+', w: 2.0, h: 3.0 }] });
    stairUp(S, M.stone, at, st.yaw, -(W / 2 + 1.35), W / 2, yb + H + 0.6, yb, 1.8);
    // Battlements: merlons round the roof you can stand on.
    for (let i = -1; i <= 1; i++) for (const [fx, fz] of [[i * (W / 2 - 0.6), W / 2 + 0.25], [i * (W / 2 - 0.6), -W / 2 - 0.25], [W / 2 + 0.25, i * (W / 2 - 0.6)]]) {
      const [mx, mz] = at(fx, fz); S.block(M.trim, 1.2, 1.0, 0.9, mx, yb + H + 0.6, mz, st.yaw, { bld: false });
    }
    // Inside: a whole upper floor, with a stair along the wall up to it.
    storeys(S, at, st.yaw, W / 2 - 1, W / 2 - 1, [yb + 0.15, yb + 4.5], M);
  },
  // A colonnade temple on a platform: two rows of columns under a roof slab, a stair at the back up to the roof.
  temple(S, M, st, yb) {
    const W = 14, D = 10, at = (lx, lz) => { const c = Math.cos(st.yaw), s = Math.sin(st.yaw); return [st.x + c * lx + s * lz, st.z - s * lx + c * lz]; };
    S.block(M.trim, W, 1.0 + 1.6, D, st.x, yb - 1.6, st.z, st.yaw, { bld: false });
    S.block(M.wall, W + 2.4, 0.5 + 1.6, D + 2.4, st.x, yb - 1.6, st.z, st.yaw, { bld: false }); // a lower step all round
    for (const lz of [-3.7, 3.7]) for (let i = 0; i < 5; i++) { const [cx, cz] = at(-5.4 + i * 2.7, lz); column(S, M.wall, cx, cz, 0.5, 5, yb + 1.0); }
    S.block(M.trim, W + 0.6, 0.7, D + 0.6, st.x, yb + 6.0, st.z, st.yaw, { under: true });
    S.block(M.roof, W - 2.4, 0.5, D - 2.4, st.x, yb + 6.7, st.z, st.yaw, { under: true, bld: false });
    const [ax, az] = at(0, 0); S.block(M.wall, 2.2, 1.0, 1.4, ax, yb + 1.0, az, st.yaw, { bld: false }); // the altar
    stairUp(S, M.stone, at, st.yaw, W / 2 + 1.15, D / 2, yb + 6.7, yb, 1.8);
    S.w.blobs.push({ x: st.x, z: st.z, y: yb + 0.1, r: 9 });
  },
  // A standing arch with a stair up one side to walk across its top, and low broken walls either side.
  arch(S, M, st, yb) {
    const c = Math.cos(st.yaw), s = Math.sin(st.yaw), at = (lx, lz) => [st.x + c * lx + s * lz, st.z - s * lx + c * lz];
    for (const k of [-1, 1]) { const [px, pz] = at(k * 2.7, 0); S.block(M.wall, 1.7, 5.6 + 1.6, 1.9, px, yb - 1.6, pz, st.yaw); S.box(M.trim, 2.1, 0.5, 2.3, px, yb + 5.1, pz, st.yaw); }
    S.block(M.trim, 7.4, 1.2, 2.1, st.x, yb + 5.6, st.z, st.yaw, { under: true });
    const [sx, sz] = at(-(3.55 + 7 * 1.5), 0);
    steps(S, M.stone, sx, sz, st.yaw + Math.PI / 2, yb + 6.8, yb, { width: 1.9 });
    for (const [lx, L, Hh] of [[6.6, 5, 1.4], [10.2, 3, 0.8]]) { const [wx, wz] = at(lx, 0); S.block(M.wall, L, Hh + 1.6, 1.1, wx, yb - 1.6, wz, st.yaw, { bld: false }); }
    S.w.blobs.push({ x: st.x, z: st.z, y: yb + 0.1, r: 5 });
  },
  // A watchtower: a deck on four posts with a roof over it and a stair up.
  watch(S, M, st, yb) {
    const c = Math.cos(st.yaw), s = Math.sin(st.yaw), at = (lx, lz) => [st.x + c * lx + s * lz, st.z - s * lx + c * lz], Hd = 5.2;
    for (const [kx, kz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const [px, pz] = at(kx * 2.3, kz * 2.3); S.block(M.trim, 0.55, Hd + 1.6, 0.55, px, yb - 1.6, pz, st.yaw, { bld: false });
      S.box(M.trim, 0.35, 2.5, 0.35, px, yb + Hd + 0.4, pz, st.yaw);
    }
    S.block(M.floor || M.wall, 5.6, 0.4, 5.6, st.x, yb + Hd, st.z, st.yaw, { under: true });
    for (const [lx, lz, pw, pd] of [[0, -2.7, 5.6, 0.2], [2.7, 0, 0.2, 5.6], [0, 2.7, 5.6, 0.2]]) { const [rx, rz] = at(lx, lz); S.box(M.trim, pw, 0.9, pd, rx, yb + Hd + 0.4, rz, st.yaw); }
    S.block(M.roof, 6.6, 0.35, 6.6, st.x, yb + Hd + 2.9, st.z, st.yaw, { under: true, bld: false });
    stairUp(S, M.stone, at, st.yaw, -(2.8 + 0.95), 2.8, yb + Hd + 0.4, yb, 1.7);
    S.w.blobs.push({ x: st.x, z: st.z, y: yb + 0.1, r: 4.5 });
  },
  // A habitat module: a long metal room open at both ends and one side, a stair to its roof and a mast on top.
  module(S, M, st, yb) {
    const W = 6.5, D = 12, H = 3.6;
    const at = hall(S, { x: st.x, z: st.z, yaw: st.yaw, W, D, H, th: 0.45, yb, sink: 1.6, tk: 0.5, roof: 'flat', mats: M,
      doors: [{ side: 'z+', w: 2.4, h: 2.8 }, { side: 'z-', w: 2.4, h: 2.8 }, { side: 'x+', w: 2.0, h: 2.7, off: 2 }] });
    stairUp(S, M.stone, at, st.yaw, -(W / 2 + 1.3), D / 2, yb + H + 0.6, yb);
    const [mx, mz] = at(1.6, -3.5); S.box(M.trim, 0.25, 6, 0.25, mx, yb + H + 0.6, mz, st.yaw).box(M.roof, 2.2, 0.15, 2.2, mx, yb + H + 5.2, mz, st.yaw + 0.6);
    for (const lz of [-3, 2]) { const [cx, cz] = at(-1.6, lz); S.block(M.roof, 1.4, 1.0, 1.4, cx, yb + 0.15, cz, st.yaw, { bld: false }); } // cargo cases
  },
  // A landing pad: a low eight-sided deck with four light pylons.
  pad(S, M, st, yb) {
    S.geo(M.trim, new THREE.CylinderGeometry(7.2, 7.6, 0.8 + 1.6, 8).translate(st.x, yb - 0.4, st.z));
    S.geo(M.wall, new THREE.CylinderGeometry(4.6, 4.6, 0.12, 8).translate(st.x, yb + 0.86, st.z));
    S.w.platforms.push({ x: st.x, z: st.z, r: 6.9, top: yb + 0.8 });
    for (let i = 0; i < 4; i++) { const a = st.yaw + i * (Math.PI / 2), px = st.x + Math.cos(a) * 8.6, pz = st.z + Math.sin(a) * 8.6; S.block(M.roof, 0.7, 3.2 + 1.6, 0.7, px, yb - 1.6, pz, a, { bld: false }); S.box(M.wall, 1.1, 0.25, 1.1, px, yb + 3.2, pz, a); }
    S.w.blobs.push({ x: st.x, z: st.z, y: yb + 0.1, r: 8 });
  },
};

export function buildLandmarks(w) {
  if (!w.landSites || !w.landSites.length) return;
  const T = theme(w.biome.id);
  for (const st of w.landSites) {
    const yb = w.heightAt(st.x, st.z) - 0.05;
    const S = new Shell(w);
    BUILD[st.kind](S, T.mats, st, yb);
    S.finish();
  }
}
