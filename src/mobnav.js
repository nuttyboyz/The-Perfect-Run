// How enemies find a player who is camping in a building (Nutty 2026-11-14: "enemies can climb to find me if im camping in those
// buildings"). Around every player who is inside or on top of something, the walkable ground, floors and stairs are flooded outward
// from where they stand (the game's own collision is the judge of what can be walked), and each spot remembers the next step toward
// the player. A mob standing on a flooded spot follows those steps: round the wall to the doorway, up the stair, across the floor.
// What is walkable is remembered for the whole map, so a second flood of the same building costs almost nothing.
const CELL = 0.5, R = 0.68, REACH = 30, MAXN = 16000;
const key = (ix, iz, yi) => (ix + 512) + (iz + 512) * 1024 + (yi + 200) * 1048576;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class MobNav {
  constructor(world) { this.w = world; this.probe = new Map(); this.fields = new Map(); }

  // Can a body standing at height y step into this cell, and how high does it then stand? (kept for the whole map)
  step(ix, iz, y) {
    const yq = Math.round(y * 4), k = key(ix, iz, yq);
    let v = this.probe.get(k);
    if (v !== undefined) return v;
    const w = this.w, x = ix * CELL, z = iz * CELL, yy = yq / 4;
    const sy = w.standY(x, z, yy + 0.1);
    v = NaN;
    if (Math.abs(sy - yy) <= 0.6 && Math.hypot(x, z) < 168) { const [cx, cz] = w.collide(x, z, R, sy); if (Math.hypot(cx - x, cz - z) < 0.08) v = sy; }
    this.probe.set(k, v);
    return v;
  }

  // Is this player somewhere a straight line will not reach: off the ground, or beside the walls of a building?
  camping(x, y, z) {
    const w = this.w;
    if (y - w.heightAt(x, z) > 0.7) return true;
    for (const pf of w.platsAt(x, z)) if (pf.bld && Math.hypot(pf.x - x, pf.z - z) < (pf.box ? Math.hypot(pf.hw, pf.hd) : pf.r) + 7) return true;
    return false;
  }

  // Called for every living player each tick; keeps their flood fresh.
  want(id, x, y, z, now) {
    let f = this.fields.get(id);
    if (!f) this.fields.set(id, (f = { live: null, build: null, seen: now }));
    f.seen = now;
    const ix = Math.round(x / CELL), iz = Math.round(z / CELL);
    const cur = f.build || f.live;
    if (cur && Math.abs(cur.ix - ix) <= 2 && Math.abs(cur.iz - iz) <= 2 && Math.abs(cur.y - y) < 0.7) return;
    if (f.build && now - f.build.t0 < 0.4) return; // let the one being made finish first
    f.build = { ix, iz, y, t0: now, map: new Map(), q: [[ix, iz, y, 0]], head: 0 };
    f.build.map.set(key(ix, iz, Math.round(y * 2)), [x, y, z, 0]);
  }
  drop(now) { for (const [id, f] of this.fields) if (now - f.seen > 2) this.fields.delete(id); }

  // A few milliseconds of flooding per tick.
  tick(ms = 1.5) {
    const t0 = performance.now();
    for (const f of this.fields.values()) {
      const b = f.build; if (!b) continue;
      let n = 0;
      while (b.head < b.q.length) {
        if ((++n & 31) === 0 && performance.now() - t0 > ms) return;
        const [ix, iz, y, d] = b.q[b.head++];
        if (d >= REACH / CELL || b.map.size > MAXN) continue;
        for (const [ax, az] of N4) {
          const jx = ix + ax, jz = iz + az, sy = this.step(jx, jz, y);
          if (sy !== sy) continue;
          const k = key(jx, jz, Math.round(sy * 2));
          if (b.map.has(k)) continue;
          b.map.set(k, [ix * CELL, y, iz * CELL, d + 1]); // from here, the next step toward the player is the cell we came from
          b.q.push([jx, jz, sy, d + 1]);
        }
      }
      b.q = null; f.live = b; f.build = null;
    }
  }

  // Which way should a mob at (x, y, z) walk to reach this player? [dx, dz] (unit), or null when no walked way is known.
  dir(id, x, y, z) {
    const f = this.fields.get(id), m = f && f.live && f.live.map; if (!m) return null;
    const ix = Math.round(x / CELL), iz = Math.round(z / CELL), yi = Math.round(y * 2);
    let e = null;
    for (const dy of [0, -1, 1]) { e = m.get(key(ix, iz, yi + dy)); if (e) break; }
    if (!e) { // between cells, or pressed against a wall: the nearest flooded neighbour
      for (const [ax, az] of N4) { for (const dy of [0, -1, 1]) { e = m.get(key(ix + ax, iz + az, yi + dy)); if (e) break; } if (e) break; }
      if (!e) return null;
    }
    if (e[3] <= 2) return null; // as good as there: the mob's own closing-in takes over
    // look two more steps ahead so the walk is smooth, as long as the height stays the same (never cut a stair's corner)
    let tx = e[0], tz = e[2], ty = e[1];
    for (let q = 0; q < 2; q++) { const nx = m.get(key(Math.round(tx / CELL), Math.round(tz / CELL), Math.round(ty * 2))); if (!nx || Math.abs(nx[1] - ty) > 0.05 || nx[3] === 0) break; tx = nx[0]; tz = nx[2]; ty = nx[1]; }
    const dx = tx - x, dz = tz - z, L = Math.hypot(dx, dz);
    return L > 0.05 ? [dx / L, dz / L] : null;
  }
}
