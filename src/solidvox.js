// What is drawn is what is solid (Nutty 2026-11-14: "No exceptions... from rocks, a tree, to a entire temple... factor the structures
// height, width"). Every solid model on the map is laid into a fine 3D grid (25 cm cells) the first time a body or a shot comes near
// it, straight from its own triangles. Walking, standing and every kind of shot then ask that grid, so a wall, a rock or a trunk blocks
// exactly where it is seen, at its real height and width, in every mode and on every map. The older round and box guesses stay only
// where nothing drawn stands for them (chests, invisible edges) and for floors and stairs, which they already describe exactly.
import * as THREE from 'three';

const CS = 8, CELL = 0.25, NC = 32, NK = 96, WORDS = 3; // 8 m chunks of 32 x 32 columns, 96 slabs of 25 cm (24 m) each
const STEP = 0.12; // how finely a triangle is sampled
const LOW = 0.36, HIGH = 1.7; // a body is stopped by anything between knee and head; lower things are stepped onto
const DIRS = []; for (let i = 0; i < 16; i++) DIRS.push([Math.cos((i / 16) * Math.PI * 2), Math.sin((i / 16) * Math.PI * 2)]);

export function installSolids(World) {
  const P = World.prototype;

  // List every solid thing that is drawn, by the chunks it touches. Nothing is measured yet.
  P.buildSolidIndex = function () {
    const vx = (this.vx = { cells: new Map(), todo: [], n: 0 });
    this.group.updateMatrixWorld(true);
    const M = new THREE.Matrix4(), box = new THREE.Box3();
    const add = (geo, mw, fresh) => {
      if (!geo.boundingBox) geo.computeBoundingBox();
      box.copy(geo.boundingBox).applyMatrix4(mw);
      const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
      if (!(box.max.x - box.min.x < 240) || Math.abs(cx) > 200 || Math.abs(cz) > 200) return; // the sky's own things
      const gy = Math.min(this.heightAt(cx, cz), this.heightAt(box.min.x, box.min.z), this.heightAt(box.max.x, box.min.z), this.heightAt(box.min.x, box.max.z), this.heightAt(box.max.x, box.max.z)); // the lowest ground it stands on (a ring wall's middle is not where it stands)
      if (box.max.y - gy < 0.25 || box.min.y - gy > 30) return; // pebbles and flat things are walked over; far overhead is scenery
      const it = { geo, m: mw.clone(), done: false }; if (fresh) fresh.push(it);
      const i0 = Math.floor(box.min.x / CS), i1 = Math.floor(box.max.x / CS), j0 = Math.floor(box.min.z / CS), j1 = Math.floor(box.max.z / CS);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const k = i * 1000 + j; let c = vx.cells.get(k);
        if (!c) { vx.cells.set(k, (c = { i, j, items: [], ready: false, data: null, hmax: null, gnd: null, yb: 0 })); vx.todo.push(c); }
        if (c.items) c.items.push(it);
      }
      vx.n++;
    };
    this._vxAdd = add;
    this.vxWalk(this.group, add);
    // nearest the start first, so the ground the round opens on is measured before anyone moves
    const sx = this.duel ? 0 : this.spawn.x, sz = this.duel ? 0 : this.spawn.z;
    vx.todo.sort((a, b) => Math.hypot(b.i * CS + 4 - sx, b.j * CS + 4 - sz) - Math.hypot(a.i * CS + 4 - sx, a.j * CS + 4 - sz));
  };

  P.vxWalk = function (root, add) {
    const M = new THREE.Matrix4();
    for (let p = root.parent; p; p = p.parent) if (!p.visible || p.noSolid) return;
    root.traverse((o) => {
      if (!o.isMesh || o === this.terrain || o === this.sky || o.isSkinnedMesh || !o.geometry || !o.geometry.attributes.position) return;
      for (let p = o; p && p !== root.parent; p = p.parent) if (!p.visible || p.noSolid) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || m.transparent || m.alphaTest > 0 || m.isShaderMaterial || m.depthWrite === false || m.isMeshBasicMaterial) return;
      if (o.isInstancedMesh) { for (let q = 0; q < o.count; q++) { o.getMatrixAt(q, M); M.premultiply(o.matrixWorld); add(o.geometry, M); } }
      else add(o.geometry, o.matrixWorld);
    });
  };
  // Something built after the map (a Horde stall): it is solid from the moment it stands.
  P.addSolids = function (root) {
    if (!this.vx) return;
    root.updateMatrixWorld(true);
    const fresh = [];
    this.vxWalk(root, (geo, mw) => { const n = this.vx.n; this._vxAdd(geo, mw, fresh); void n; });
    for (const it of fresh) if (!it.done) { it.done = true; this.vxLay(it); }
    for (const c of this.colliders) if (c.vx === false) c.vx = undefined; // a round guess may now have a drawn shape to give way to
  };

  // A few chunks are measured every frame until the whole map is done, so no shot or sprint ever waits on it.
  // One chunk can cost many times another (a whole temple against a patch of rocks), and checking the clock only
  // before starting one used to let a single monster chunk blow the budget many times over. Another is now started
  // only while the frame still has room for the worst chunk this map has shown, so warming never costs a stutter.
  P.warmSolids = function (ms = 3) {
    const vx = this.vx; if (!vx || !vx.todo.length) return;
    const t0 = performance.now();
    let worst = vx.worst || 0;
    for (;;) {
      if (!vx.todo.length || performance.now() - t0 + worst * 0.8 > ms) break;
      const c = vx.todo.pop();
      if (c.ready) continue;
      const t1 = performance.now();
      this.vxBuild(c);
      const e = performance.now() - t1;
      if (e > worst) worst = e;
    }
    vx.worst = worst * 0.97; // let it fade, so one heavy chunk does not hold back the rest of the map for ever
  };

  P.vxOpen = function (c) {
    if (c.data) return;
    c.data = new Uint32Array(NC * NC * WORDS); c.hmax = new Float32Array(NC * NC).fill(-Infinity); c.gnd = new Float32Array(NC * NC);
    const x0 = c.i * CS, z0 = c.j * CS, g = new Float32Array(81); let lo = Infinity;
    for (let b = 0; b < 9; b++) for (let a = 0; a < 9; a++) { const h = this.heightAt(x0 + a, z0 + b); g[b * 9 + a] = h; if (h < lo) lo = h; }
    for (let b = 0; b < NC; b++) for (let a = 0; a < NC; a++) {
      const fx = (a + 0.5) * CELL, fz = (b + 0.5) * CELL, i = Math.min(7, fx | 0), k = Math.min(7, fz | 0), u = fx - i, v = fz - k;
      c.gnd[b * NC + a] = (g[k * 9 + i] * (1 - u) + g[k * 9 + i + 1] * u) * (1 - v) + (g[(k + 1) * 9 + i] * (1 - u) + g[(k + 1) * 9 + i + 1] * u) * v;
    }
    c.yb = Math.floor(lo) - 1;
  };

  // Measure one chunk: every model that touches it is laid into the grid (each model once, into every chunk it reaches).
  P.vxBuild = function (c) {
    c.ready = true;
    for (const it of c.items) if (!it.done) { it.done = true; this.vxLay(it); }
    c.items = null;
  };

  P.vxLay = function (it) {
    const cells = this.vx.cells, geo = it.geo, pos = geo.attributes.position, ix = geo.index, nv = pos.count, e = it.m.elements;
    let W = this._vw; if (!W || W.length < nv * 3) W = this._vw = new Float32Array(nv * 3);
    const A = pos.array, st = pos.isInterleavedBufferAttribute ? pos.data.stride : pos.itemSize, off = pos.isInterleavedBufferAttribute ? pos.offset : 0, src = pos.isInterleavedBufferAttribute ? pos.data.array : A;
    for (let a = 0; a < nv; a++) { const x = src[a * st + off], y = src[a * st + off + 1], z = src[a * st + off + 2];
      W[a * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]; W[a * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; W[a * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]; }
    let ck = NaN, cc = null;
    const mark = (x, y, z, exact) => {
      const i = Math.floor(x / CS), j = Math.floor(z / CS), k = i * 1000 + j;
      if (k !== ck) { ck = k; cc = cells.get(k) || null; if (cc && !cc.data) this.vxOpen(cc); }
      if (!cc) return;
      const col = Math.min(NC - 1, Math.floor((z - j * CS) / CELL)) * NC + Math.min(NC - 1, Math.floor((x - i * CS) / CELL));
      if (y < cc.gnd[col] + 0.12) return; // the ground itself, or under it
      const s = Math.floor((y - cc.yb) / CELL); if (s < 0 || s >= NK) return;
      cc.data[col * WORDS + (s >> 5)] |= 1 << (s & 31);
      if (exact && y > cc.hmax[col]) cc.hmax[col] = y;
    };
    const nt = (ix ? ix.count : nv) / 3, I = ix ? ix.array : null;
    for (let t = 0; t < nt; t++) {
      const a = (I ? I[t * 3] : t * 3) * 3, b = (I ? I[t * 3 + 1] : t * 3 + 1) * 3, d = (I ? I[t * 3 + 2] : t * 3 + 2) * 3;
      const ax = W[a], ay = W[a + 1], az = W[a + 2];
      const ux = W[b] - ax, uy = W[b + 1] - ay, uz = W[b + 2] - az, vx_ = W[d] - ax, vy = W[d + 1] - ay, vz = W[d + 2] - az;
      let nx = uy * vz - uz * vy, ny = uz * vx_ - ux * vz, nz = ux * vy - uy * vx_; const nl = Math.hypot(nx, ny, nz);
      if (nl > 1e-9) { nx *= 0.13 / nl; ny *= 0.13 / nl; nz *= 0.13 / nl; } else nx = ny = nz = 0;
      const n1 = Math.min(800, Math.max(1, Math.ceil(Math.hypot(ux, uy, uz) / STEP))), n2 = Math.min(800, Math.max(1, Math.ceil(Math.hypot(vx_, vy, vz) / STEP)));
      for (let i = 0; i <= n1; i++) { const u = i / n1, jm = Math.round(n2 * (1 - u));
        for (let j = 0; j <= jm; j++) { const v = j / n2, x = ax + ux * u + vx_ * v, y = ay + uy * u + vy * v, z = az + uz * u + vz * v;
          mark(x, y, z, true); mark(x - nx, y - ny, z - nz, false); } } // one cell deeper too, so no slanted ray slips between two cells
    }
  };

  // The measured chunk over (x, z), or null where nothing solid is drawn.
  P.vxAt = function (x, z) {
    const vx = this.vx; if (!vx) return null;
    const c = vx.cells.get(Math.floor(x / CS) * 1000 + Math.floor(z / CS)); if (!c) return null;
    if (!c.ready) this.vxBuild(c);
    return c.data ? c : null;
  };
  // Is this point inside something drawn?
  P.vxPoint = function (x, y, z) {
    const c = this.vxAt(x, z); if (!c) return false;
    const s = Math.floor((y - c.yb) / CELL); if (s < 0 || s >= NK) return false;
    const col = Math.min(NC - 1, Math.floor((z - c.j * CS) / CELL)) * NC + Math.min(NC - 1, Math.floor((x - c.i * CS) / CELL));
    return (c.data[col * WORDS + (s >> 5)] & (1 << (s & 31))) !== 0;
  };
  // Floors, stairs and walls the box list already describes exactly keep their own rules: is this bit of the grid one of theirs?
  P.vxOwned = function (x, z, ylo, yhi) {
    for (const pf of this.platsAt(x, z)) {
      if (pf.air || pf.shotOnly) continue;
      if (yhi < (pf.base !== undefined ? pf.base - 0.5 : -Infinity) || ylo > pf.top + 0.3) continue;
      if (pf.box) { const c = Math.cos(pf.yaw || 0), s = Math.sin(pf.yaw || 0), dx = x - pf.x, dz = z - pf.z;
        if (Math.abs(dx * c + dz * s) < pf.hw + 0.3 && Math.abs(-dx * s + dz * c) < pf.hd + 0.3) return true; }
      else if (Math.hypot(x - pf.x, z - pf.z) < pf.r + 0.3) return true;
    }
    return false;
  };
  // Does something drawn stand between knee and head height here, for a body whose feet are at y?
  P.vxCol = function (x, z, y) {
    const c = this.vxAt(x, z); if (!c) return false;
    const col = Math.min(NC - 1, Math.floor((z - c.j * CS) / CELL)) * NC + Math.min(NC - 1, Math.floor((x - c.i * CS) / CELL)), d = c.data, o = col * WORDS;
    if (!(d[o] | d[o + 1] | d[o + 2])) return false;
    if (y === undefined) y = c.gnd[col]; // a body that keeps to the ground (the mobs): the ground right here
    const s0 = Math.max(0, Math.ceil((y + 0.3 - c.yb) / CELL)), s1 = Math.min(NK - 1, Math.floor((y + HIGH - c.yb) / CELL));
    for (let s = s0; s <= s1; s++) if (d[o + (s >> 5)] & (1 << (s & 31))) {
      if (s === s0 && c.hmax[col] < y + LOW) continue; // its top is low enough to step onto
      if (!this.vxOwned(x, z, c.yb + s * CELL, c.yb + (s + 1) * CELL)) return true;
    }
    return false;
  };
  // Is a body of radius r, feet at y, pressed into something drawn?
  P.walkBlocked = function (x, z, r, y) {
    if (!this.vx) return false;
    // quick way out: nothing drawn in any chunk the body touches
    const i0 = Math.floor((x - r) / CS), i1 = Math.floor((x + r) / CS), j0 = Math.floor((z - r) / CS), j1 = Math.floor((z + r) / CS);
    let any = false; for (let i = i0; i <= i1 && !any; i++) for (let j = j0; j <= j1; j++) if (this.vx.cells.has(i * 1000 + j)) { any = true; break; }
    if (!any) return false;
    let hit = this.vxCol(x, z, y);
    for (let q = 0; q < 8 && !hit; q++) { const d = DIRS[q * 2]; hit = this.vxCol(x + d[0] * r, z + d[1] * r, y); }
    if (!hit && r > 0.7) for (let q = 0; q < 8 && !hit; q++) { const d = DIRS[q * 2 + 1]; hit = this.vxCol(x + d[0] * r * 0.5, z + d[1] * r * 0.5, y); }
    if (!hit) return false;
    if (y !== undefined) for (const pf of this.platsAt(x, z)) if (pf.air && !pf.box && y >= pf.top - 0.6 && Math.hypot(x - pf.x, z - pf.z) < pf.r) return false; // sitting in a tree's fork
    return true;
  };
  // The nearest spot where the body is clear of everything drawn (it slides along a wall, never through it). null: none close by.
  P.walkFree = function (x, z, r, y) {
    const lim = Math.max(1.2, r + 0.4);
    for (let d = 0.05; d <= lim; d += 0.05) for (const [cx, cz] of DIRS) {
      if (this.walkBlocked(x + cx * d, z + cz * d, r, y)) continue;
      let lo = d - 0.05, hi = d; // settle right against the surface
      for (let q = 0; q < 3; q++) { const m = (lo + hi) / 2; if (this.walkBlocked(x + cx * m, z + cz * m, r, y)) lo = m; else hi = m; }
      return [x + cx * hi, z + cz * hi];
    }
    return null;
  };
  // The top of whatever is drawn under a body whose feet are at y (it can step up 35 cm), or -Infinity.
  P.vxTop = function (x, z, y) {
    const c = this.vxAt(x, z); if (!c) return -Infinity;
    const col = Math.min(NC - 1, Math.floor((z - c.j * CS) / CELL)) * NC + Math.min(NC - 1, Math.floor((x - c.i * CS) / CELL)), d = c.data, o = col * WORDS;
    if (!(d[o] | d[o + 1] | d[o + 2])) return -Infinity;
    const hm = c.hmax[col], sTop = Math.floor((hm - c.yb) / CELL);
    for (let s = Math.min(NK - 1, Math.floor((y + 0.35 - c.yb) / CELL)); s >= 0; s--) {
      if (!(d[o + (s >> 5)] & (1 << (s & 31)))) continue;
      const t = s >= sTop ? hm : c.yb + (s + 1) * CELL - 0.08;
      if (t > y + 0.35) continue;
      if (t <= c.gnd[col] + 0.1) return -Infinity;
      if (this.vxOwned(x, z, c.yb + s * CELL, c.yb + (s + 1) * CELL)) return -Infinity;
      return t;
    }
    return -Infinity;
  };
  // Where does a ray first enter something drawn? The distance, or Infinity.
  P.vxRay = function (ox, oy, oz, dx, dy, dz, maxD, tMin = 0) {
    const vx = this.vx; if (!vx) return Infinity;
    let t = Math.max(0, tMin), ck = NaN, c = null;
    while (t <= maxD) {
      const x = ox + dx * t, z = oz + dz * t, i = Math.floor(x / CS), j = Math.floor(z / CS), k = i * 1000 + j;
      if (k !== ck) { ck = k; c = vx.cells.get(k) || null; if (c && !c.ready) this.vxBuild(c); if (c && !c.data) c = null; }
      const y = oy + dy * t;
      if (!c || (y > c.yb + NK * CELL && dy >= 0) ) {
        if (Math.abs(x) > 230 || Math.abs(z) > 230 || y > 400 || y < -100) return Infinity;
        // straight to the far side of this empty chunk
        const tx = dx > 1e-9 ? ((i + 1) * CS - x) / dx : dx < -1e-9 ? (i * CS - x) / dx : Infinity, tz = dz > 1e-9 ? ((j + 1) * CS - z) / dz : dz < -1e-9 ? (j * CS - z) / dz : Infinity;
        const dt = Math.min(tx, tz); if (dt === Infinity) return Infinity;
        t += dt + 0.02; continue;
      }
      const s = Math.floor((y - c.yb) / CELL);
      if (s >= 0 && s < NK) {
        const col = Math.min(NC - 1, Math.floor((z - j * CS) / CELL)) * NC + Math.min(NC - 1, Math.floor((x - i * CS) / CELL));
        if (c.data[col * WORDS + (s >> 5)] & (1 << (s & 31))) return t;
      }
      t += 0.11;
    }
    return Infinity;
  };
  // Is a round guess standing in for something that is really drawn there? Then the drawn shape is used and the guess is dropped.
  P.colVox = function (c) {
    c.vx = false;
    if (!this.vx || c.r > 7) return false;
    if (c.gy === undefined) c.gy = this.heightAt(c.x, c.z);
    const top = Math.min(c.top === Infinity ? c.gy + 4 : c.top, c.gy + 4), has = (x, z) => { for (let y = c.gy + 0.4; y < top; y += 0.2) if (this.vxPoint(x, y, z)) return true; return false; };
    let n = has(c.x, c.z) ? 1 : 0;
    for (const f of [0.35, 0.7]) for (let q = 0; q < 16 && !n; q += 2) if (has(c.x + DIRS[q][0] * c.r * f, c.z + DIRS[q][1] * c.r * f)) n++;
    return (c.vx = n > 0);
  };
}
