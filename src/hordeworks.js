// Horde Mode structures (Nutty 2026-11-14): in Horde every map is rebuilt with big structures that are only used there:
// ravaged buildings, temples with high points, towers, and stair plazas standing on bases. Every one is open: walk in, walk
// through, walk up real stairs (each tread is low enough to walk, no jumping) and stand on any part of it. Nothing here has a
// sloped top, so a jump onto any piece lands and stays. Built from the walk-in kit (buildkit.js) in the map's own stone or wood.
import * as THREE from 'three';
import { Shell, hall, column, steps, storeys } from './buildkit.js';
import { theme } from './landmarks.js';
import { mulberry32 } from './rng.js';

const TAU = Math.PI * 2;
const SLIT = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 });
const RAD = { tower: 11, ravaged: 12, temple: 18, plaza: 13 };
// What each map leans toward: [kind, weight].
const MIX = {
  graveyard: [['ravaged', 4], ['tower', 3], ['temple', 2], ['plaza', 2]],
  forest: [['ravaged', 4], ['tower', 3], ['plaza', 2], ['temple', 2]],
  clearing: [['ravaged', 3], ['tower', 3], ['plaza', 3], ['temple', 2]],
  desert: [['temple', 4], ['plaza', 3], ['ravaged', 3], ['tower', 2]],
  frozen: [['tower', 4], ['ravaged', 3], ['temple', 2], ['plaza', 2]],
  volcanic: [['temple', 4], ['tower', 3], ['ravaged', 2], ['plaza', 2]],
  springs: [['plaza', 4], ['temple', 3], ['ravaged', 2], ['tower', 2]],
  ruins: [['ravaged', 4], ['temple', 3], ['tower', 2], ['plaza', 2]],
};

// Before the terrain is made: choose the sites and level the ground under each.
export function pickHordeSites(w) {
  const mix = MIX[w.biome.id] || MIX.graveyard, r = mulberry32((w.seed * 17 + 4243) >>> 0), sites = [];
  const tot = mix.reduce((a, k) => a + k[1], 0);
  const must = ['tower', 'temple', 'ravaged', 'plaza']; // every map gets at least one of each
  for (let tries = 0; sites.length < 15 && tries < 1600; tries++) {
    let kind = must[sites.length];
    if (!kind) { let roll = r() * tot; kind = mix[0][0]; for (const [k, wt] of mix) { roll -= wt; if (roll <= 0) { kind = k; break; } } }
    const R = RAD[kind], a = r() * TAU, d = 30 + Math.sqrt(r()) * 118, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.hypot(x - w.spawn.x, z - w.spawn.z) < 22 + R || Math.hypot(x - w.arena.x, z - w.arena.z) < w.arena.r + 14 + R) continue;
    if (Math.hypot(x, z) + R > 158) continue;
    if (w.stage && w.stage.noPlace(x, z, R + 5)) continue;
    if (sites.some((s) => Math.hypot(s.x - x, s.z - z) < s.R + R + 12)) continue;
    if ((w.flats || []).some((f) => Math.hypot(f.x - x, f.z - z) < f.r + (f.blend || 0) + R)) continue;
    const h = w.rawHeight(x, z);
    let steep = 0; for (let k = 0; k < 8; k++) steep = Math.max(steep, Math.abs(w.rawHeight(x + Math.cos(k * 0.785) * R, z + Math.sin(k * 0.785) * R) - h));
    if (steep > 5.5) continue;
    sites.push({ x, z, h, yaw: Math.floor(r() * 8) * (Math.PI / 4), kind, R, s: r(), seed: (r() * 1e9) | 0 });
    w.flats.push({ x, z, r: R + 2, blend: 11, h });
  }
  w.landSites = sites; // props, chests and stalls keep clear of these (World.noPlace)
  return sites;
}

const atOf = (st) => { const c = Math.cos(st.yaw), s = Math.sin(st.yaw); return (lx, lz) => [st.x + c * lx + s * lz, st.z - s * lx + c * lz]; };
const SINK = 1.8;

// A real stair you walk straight up. It climbs along local `dir` and its top edge ends at local (lx, lz), from yFrom to yTo.
function stair(S, mat, st, at, lx, lz, dir, yFrom, yTo, { width = 1.7, depth = 0.55, ground = true } = {}) {
  const n = Math.max(1, Math.ceil((yTo - yFrom) / 0.33 - 1e-6)), run = n * depth;
  const ux = dir === 'x+' ? 1 : dir === 'x-' ? -1 : 0, uz = dir === 'z+' ? 1 : dir === 'z-' ? -1 : 0;
  const [fx, fz] = at(lx - ux * run, lz - uz * run);
  steps(S, mat, fx, fz, st.yaw + (dir === 'z+' ? 0 : dir === 'x+' ? Math.PI / 2 : dir === 'z-' ? Math.PI : -Math.PI / 2), yTo, yFrom, { rise: 0.33, depth, width, under: !ground, sink: ground ? SINK : 0 });
}

const BUILD = {
  // A tower: three storeys, a stair inside along the wall of every floor, battlements and a corner turret (the high point).
  tower(S, M, st, yb) {
    const W = 13, th = 1, F = 5, H = F * 3, at = atOf(st), I = W / 2 - th; // I: half the inside
    hall(S, { x: st.x, z: st.z, yaw: st.yaw, W, D: W, H, th, yb, sink: SINK, tk: 0.9, roof: 'none', mats: M,
      doors: [{ side: 'z+', w: 2.8, h: 3.6 }, { side: 'x+', w: 2.4, h: 3.4 }, { side: 'z-', w: 2.2, h: 3.2, off: 1.6 }] });
    storeys(S, at, st.yaw, I, I, [yb + 0.15, yb + F, yb + 2 * F, yb + 3 * F], M); // a whole floor on every storey, a stair along the wall up to each
    // String courses at every floor, stepped buttresses on the corners (ledges to hop up), and arrow slits.
    for (let f = 1; f <= 3; f++) S.box(M.trim, W + 0.5, 0.4, W + 0.5, st.x, yb + F * f - (f === 3 ? 0.4 : 0.2), st.z, st.yaw);
    for (const [kx, kz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (const [bw, bh] of [[2.4, 1.2], [1.8, 2.4], [1.3, 5.0]]) {
      const [bx, bz] = at(kx * (W / 2 + bw / 2 - 0.5), kz * (W / 2 + bw / 2 - 0.5)); S.block(M.stone || M.trim, bw, bh + SINK, bw, bx, yb - SINK, bz, st.yaw, { bld: false });
    }
    for (let f = 0; f < 3; f++) for (const [lx, lz, ry] of [[-2.6, W / 2, 0], [2.6, W / 2, 0], [-2.6, -W / 2, 0], [-3, -W / 2, 0], [W / 2, -3, 1], [W / 2, 3, 1], [-W / 2, -3, 1], [-W / 2, 3, 1]]) {
      const [x, z] = at(lx, lz); S.box(SLIT, ry ? 0.08 : 0.45, 1.7, ry ? 0.45 : 0.08, x, yb + F * f + 2.2, z, st.yaw, 1);
    }
    // Battlements: merlons on the wall tops, each one a block to stand on.
    const top = yb + H;
    for (let i = -2; i <= 2; i++) for (const [lx, lz] of [[i * 2.2, W / 2 - 0.5], [i * 2.2, -W / 2 + 0.5], [W / 2 - 0.5, i * 2.2], [-W / 2 + 0.5, i * 2.2]]) {
      if (Math.abs(i) === 2 && (lx === W / 2 - 0.5 || lx === -W / 2 + 0.5)) continue; // the corners are already taken by the first two rows
      const [mx, mz] = at(lx, lz); S.block(M.trim, 1.1, 0.9, 1.0, mx, top, mz, st.yaw, { bld: false, under: true });
    }
    // The corner turret: two hops up to the highest point on the tower.
    const [tx, tz] = at(I - 1.5, -(I - 1.5)); S.block(M.wall, 3, 2.0, 3, tx, top, tz, st.yaw, { bld: false, under: true });
    const [hx, hz] = at(I - 1.5 - 2.2, -(I - 1.5)); S.block(M.trim, 1.4, 1.0, 2.2, hx, top, hz, st.yaw, { bld: false, under: true });
    S.block(M.trim, 1.5, 0.8, 1.5, tx, top + 2.0, tz, st.yaw + 0.785, { bld: false, under: true });
    S.w.blobs.push({ x: st.x, z: st.z, y: yb + 0.2, r: 8 });
  },

  // A ravaged building: two storeys with the walls torn down toward one corner, half of the upper floor and a scrap of roof
  // left, a stair inside, and rubble spilled out of the broken side. The broken walls step down, so you can hop along them.
  ravaged(S, M, st, yb) {
    const W = 13, D = 10, th = 0.7, F = 3.7, at = atOf(st), r = mulberry32(st.seed >>> 0), seg = 1.3;
    const hAt = (lx, lz) => { // how much wall is left here: whole at the (-x, -z) corner, almost nothing at the (+x, +z) corner
      const t = ((lx + W / 2) / W + (lz + D / 2) / D) / 2, h = 2 * F - Math.max(0, t - 0.28) * 13 + (r() - 0.5) * 1.2;
      return Math.max(0.6, Math.min(2 * F, Math.round(h / 0.6) * 0.6));
    };
    const wallRun = (len, pos, ry, gaps) => {
      const n = Math.round(len / seg), L = len / n;
      for (let i = 0; i < n; i++) {
        const o = -len / 2 + (i + 0.5) * L, [lx, lz] = pos(o);
        if (gaps.some(([a, b]) => o > a && o < b)) continue; // a doorway, or a hole blown clean through
        const h = hAt(lx, lz), [px, pz] = at(lx, lz);
        S.block(M.wall, L, h + SINK, th, px, yb - SINK, pz, st.yaw + ry, { bld: h > 2.4 });
        if (h >= 2 * F - 0.01) S.box(M.trim, L, 0.45, th + 0.3, px, yb + h - 0.45, pz, st.yaw + ry);
      }
    };
    wallRun(W, (o) => [o, D / 2 - th / 2], 0, [[-1.4, 1.4]]);
    wallRun(W, (o) => [o, -D / 2 + th / 2], 0, [[3.2, 5.2]]);
    wallRun(D - 2 * th, (o) => [W / 2 - th / 2, o], Math.PI / 2, [[-1.2, 1.2]]);
    wallRun(D - 2 * th, (o) => [-W / 2 + th / 2, o], Math.PI / 2, [[0.4, 2.6]]);
    // The floor, a little above the ground, and what is left of the upper floor with its broken edge.
    S.box(M.floor || M.trim, W + 0.4, 0.3 + SINK, D + 0.4, st.x, yb - SINK - 0.15, st.z, st.yaw, 0.3); S.solid(W + 0.4, 0.3 + SINK, D + 0.4, st.x, yb - SINK - 0.15, st.z, st.yaw, { bld: false, shot: false });
    const ix = W / 2 - th, iz = D / 2 - th, uf = yb + F;
    { const [x, z] = at((-ix - 0.5) / 2, 0); S.block(M.floor || M.trim, ix - 0.5, 0.35, 2 * iz, x, uf - 0.35, z, st.yaw, { under: true, uvk: 0.3 }); }
    { const [x, z] = at(1.2, 1.0); S.block(M.floor || M.trim, 3.6, 0.35, 6.6, x, uf - 0.35, z, st.yaw, { under: true, uvk: 0.3 }); const [px, pz] = at(2.7, -2.0); S.block(M.trim, 0.5, F - 0.5, 0.5, px, yb + 0.15, pz, st.yaw, { bld: false, under: true }); }
    // The stair up to it, along the back wall.
    stair(S, M.stone, st, at, -0.6, -(iz - 1.0), 'x-', yb + 0.15, uf, { width: 1.7 });
    // A scrap of roof over the whole corner, on the walls that still reach it.
    { const [x, z] = at(-W / 2 + 2.6, -D / 2 + 2.4); S.block(M.roof || M.trim, 5.2, 0.4, 4.8, x, yb + 2 * F, z, st.yaw, { under: true, uvk: 0.3 }); }
    // Hop-ups from the upper floor to that roof, against the corner.
    for (let i = 0; i < 3; i++) { const [x, z] = at(-ix + 0.8, 2.8 - i * 1.35); S.block(M.trim, 1.5, 1.1 * (i + 1), 1.35, x, uf, z, st.yaw, { bld: false, under: true }); }
    // Rubble: fallen blocks inside the broken corner and spilled outside it.
    for (let i = 0; i < 9; i++) {
      const a = r() * 1.7 - 0.2, d = 3.5 + r() * 8, lx = W / 2 - 3 + Math.cos(a) * d * 0.7, lz = D / 2 - 3 + Math.sin(a) * d * 0.7, [x, z] = at(lx, lz);
      const sw = 0.9 + r() * 1.3, sd = 0.8 + r() * 1.1, sh = 0.45 + r() * 0.7;
      S.block(i % 3 ? M.wall : M.trim, sw, sh + 0.5, sd, x, S.w.heightAt(x, z) - 0.5, z, r() * TAU, { bld: false, under: true });
    }
    S.w.blobs.push({ x: st.x, z: st.z, y: yb + 0.2, r: 9 });
  },

  // A high temple: three great tiers with a wide stair up the front and the back, a walk-in shrine on top with a stair to
  // its roof, and a stepped spire on that roof: the highest point on the map.
  temple(S, M, st, yb) {
    const at = atOf(st), T = [[24, 2], [18, 4], [12, 6]];
    for (const [w, h] of T) S.block(h === 4 ? M.trim : M.wall, w, h + SINK, w, st.x, yb - SINK, st.z, st.yaw, { bld: false, uvk: 0.22 });
    for (const k of [1, -1]) stair(S, M.stone, st, at, 0, k * 6, k > 0 ? 'z-' : 'z+', yb, yb + 6, { width: 4.6 });
    // Half-height ledges on the two sides without stairs, so the tiers can be climbed by jumping as well.
    for (const k of [1, -1]) for (let i = 0; i < 3; i++) {
      const half = T[i][0] / 2, y0 = i ? T[i - 1][1] : 0;
      const [x, z] = at(k * (half + 0.75), (i - 1) * 3.2); S.block(M.trim, 1.5, 1.0 + (i ? 0 : SINK), 3.0, x, yb + y0 - (i ? 0 : SINK), z, st.yaw, { bld: false, under: true });
    }
    const ty = yb + 6, H = 4.6;
    hall(S, { x: st.x, z: st.z, yaw: st.yaw, W: 7, D: 7, H, th: 0.7, yb: ty, tk: 0.7, roof: 'flat', floor: false, mats: M,
      doors: [{ side: 'z+', w: 2.4, h: 3.3 }, { side: 'z-', w: 2.4, h: 3.3 }, { side: 'x-', w: 2.0, h: 3.1 }] });
    { const [x, z] = at(0, 0); S.block(M.trim, 1.8, 1.0, 1.2, x, ty, z, st.yaw, { bld: false, under: true }); } // the altar
    const roof = ty + H + 0.6;
    stair(S, M.stone, st, at, 4.5, 3.8, 'z+', ty, roof, { width: 1.6, ground: false }); // up the side of the shrine to its roof
    for (const k of [1, -1]) for (const j of [1, -1]) { const [x, z] = at(k * 3.4, j * 7.6); column(S, M.wall, x, z, 0.5, 4.2, yb + 4); } // columns flanking both stairs
    // The spire: four hops to the top.
    let sy = roof;
    for (const [w, h] of [[3.2, 1.0], [2.4, 1.0], [1.6, 1.0], [0.9, 1.1]]) { const [x, z] = at(-0.6, 0); S.block(w > 2 ? M.trim : M.wall, w, h, w, x, sy, z, st.yaw, { bld: false, under: true }); sy += h; }
    S.w.blobs.push({ x: st.x, z: st.z, y: yb + 0.2, r: 15 });
  },

  // A stair plaza: a tall base with a wide stair on two sides, a raised dais on it with its own stairs, standing pillars
  // with a lintel across one pair, and a broken pillar and fallen drums to hop on.
  plaza(S, M, st, yb) {
    const at = atOf(st), BW = 16, BD = 11, BH = 3;
    S.block(M.wall, BW, BH + SINK, BD, st.x, yb - SINK, st.z, st.yaw, { bld: false, uvk: 0.22 });
    S.box(M.trim, BW + 0.5, 0.4, BD + 0.5, st.x, yb + BH - 0.4, st.z, st.yaw); // a proud course under the edge
    for (const k of [1, -1]) stair(S, M.stone, st, at, 0, k * (BD / 2), k > 0 ? 'z-' : 'z+', yb, yb + BH, { width: 5 });
    const dy = yb + BH, DW = 6.4, DD = 5, DH = 1.9;
    S.block(M.trim, DW, DH, DD, st.x, dy, st.z, st.yaw, { bld: false, uvk: 0.25 });
    for (const k of [1, -1]) stair(S, M.stone, st, at, k * (DW / 2), 0, k > 0 ? 'x-' : 'x+', dy, dy + DH, { width: 3, ground: false });
    const py = dy + DH;
    for (const [kx, kz, h] of [[-1, -1, 4.2], [1, -1, 4.2], [-1, 1, 4.2], [1, 1, 1.3]]) { const [x, z] = at(kx * (DW / 2 - 0.6), kz * (DD / 2 - 0.6)); S.block(M.wall, 0.9, h, 0.9, x, py, z, st.yaw, { bld: false, under: true }); if (h > 2) S.box(M.trim, 1.2, 0.35, 1.2, x, py + h - 0.35, z, st.yaw); }
    { const [x, z] = at(0, -(DD / 2 - 0.6)); S.block(M.trim, DW - 0.2, 0.8, 1.1, x, py + 4.2, z, st.yaw, { under: true, bld: false }); } // the lintel across the back pair
    { const [x, z] = at(0, 0); S.block(M.wall, 1.6, 0.9, 1.6, x, py, z, st.yaw + 0.785, { bld: false, under: true }); } // the plinth in the middle
    // Low walls at the corners of the base (a hop up, a ledge to stand on), and fallen drums below.
    for (const k of [1, -1]) for (const j of [1, -1]) { const [x, z] = at(k * 5.5, j * (BD / 2 - 0.45)); S.block(M.trim, 3.6, 1.0, 0.9, x, dy, z, st.yaw, { bld: false, under: true }); }
    const r = mulberry32(st.seed >>> 0);
    for (let i = 0; i < 5; i++) { const a = r() * TAU, d = BW / 2 + 2 + r() * 3, [x, z] = at(Math.cos(a) * d, Math.sin(a) * d * 0.5 + (r() < 0.5 ? 1 : -1) * 0.5); if (Math.abs(Math.sin(a)) > 0.75) continue; S.block(M.wall, 1.1 + r() * 0.6, 0.6 + r() * 0.6 + 0.5, 1.1 + r() * 0.5, x, S.w.heightAt(x, z) - 0.5, z, r() * TAU, { bld: false, under: true }); }
    S.w.blobs.push({ x: st.x, z: st.z, y: yb + 0.2, r: 11 });
  },
};

export function buildHordeWorks(w) {
  if (!w.landSites || !w.landSites.length) return;
  const T = theme(w.biome.id), S = new Shell(w);
  for (const st of w.landSites) BUILD[st.kind](S, T.mats, st, w.heightAt(st.x, st.z) - 0.05);
  S.finish(); // one mesh per material for the whole map
}
