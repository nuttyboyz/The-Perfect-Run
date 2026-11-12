// Seeded open-world generation: terrain, biome props, crates, spawn and boss arena.
// Every player regenerates the identical map from the round seed.
import * as THREE from 'three';
import { mulberry32, makeNoise } from './rng.js';
import * as TX from './textures.js';
import { BIOMES, CONFIG, DUEL, DUEL_BIOMES } from './data.js';
import { duelHeight, buildDunes, buildFrost, buildGrave, buildDuelScenery } from './arenas.js';
import { placeBoards } from './skate.js';
import { placeDice } from './dice.js';
import { chestParts, chestMats } from './chest.js';
import { propLibrary, stoneMat, WIND, crystalCluster } from './props.js';
import { makeTerrainMaterial } from './terrain.js';
import { skyMaterial } from './look.js';
import { prepStage, buildStageExtras } from './stages.js';
import { rockGeo, softBox, lathe, merge, paint, finish, setColor, noise3, clamp } from './geo.js';

const SIZE = 360;
const CELL = 96; // instanced props are split into spatial cells so frustum culling (and shadow culling) works
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Visual-only extras per biome (not in data.js). Their own seeded stream keeps gameplay placement untouched.
const EXTRA = { graveyard: ['puddle', 'stump'], forest: ['puddle', 'stump'], frozen: ['puddle'], waterfall: ['puddle', 'stump'], clearing: ['puddle', 'stump'], ruins: ['puddle'] };
// Soft contact-shadow radius at unit scale for props that touch the ground.
const BLOB = { rock: 1.5, snowrock: 1.6, tomb: 0.95, cross: 0.6, pine: 1.5, snowpine: 1.5, deadtree: 0.9, twisted: 1.9, mesa: 1.3, pillar: 1.2, basalt: 2.6, mausoleum: 4.4, log: 1.5, stump: 0.8, cactus: 0.7, icecrystal: 1.1, voidcrystal: 1.1, obsidian: 0.9, obelisk: 1.5, lantern: 0.3, mushroom: 0.45 };

export class World {
  constructor(scene, seed, roundIdx, quality = 2, stage = roundIdx % BIOMES.length, opts = {}) {
    this.scene = scene;
    this.duel = !!opts.duel; // Duel Arena: a walled arena, no crates or boards
    const na = DUEL_BIOMES.length;
    this.arenaIdx = this.duel ? (((opts.arena | 0) % na) + na) % na : 0; // which of the duel arenas (see DUEL_BIOMES)
    this.seed = seed;
    this.round = roundIdx;
    this.biome = this.duel ? DUEL_BIOMES[this.arenaIdx] : BIOMES[stage];
    this.group = new THREE.Group();
    this.colliders = [];
    this.blobs = [];
    this.platforms = [];
    this.solids = []; // duel cover that stops bullets and rockets (see rayBlock)
    this.braziers = [];
    this.trees = [];
    this.grid = new Map();
    this.crates = [];
    this.crateCount = this.duel ? 0 : 88; // four times the original 22
    this.animated = [];
    this.quality = quality;
    const r = mulberry32(seed);
    this.rng = r;
    this.noise = makeNoise(seed);
    this.noise2 = makeNoise(seed + 77);

    // Spawn and arena sit on opposite sides so each round is a trek. The Duel Arena sits in the middle of a flat plain.
    const a = r() * Math.PI * 2;
    this.spawn = { x: Math.cos(a) * 95, z: Math.sin(a) * 95 };
    const b = a + Math.PI + (r() - 0.5) * 1.2;
    this.arena = this.duel ? { x: 0, z: 0, r: DUEL.arena } : { x: Math.cos(b) * 85, z: Math.sin(b) * 85, r: 26 };
    this.amp = this.duel ? 0 : { graveyard: 9, forest: 11, desert: 8, frozen: 16, volcanic: 13, abyss: 12, springs: 6, space: 8, waterfall: 7, clearing: 5, volcano: 12, ruins: 7 }[this.biome.id] ?? 8;

    this.stage = null; this.carves = [];
    if (!this.duel) prepStage(this); // the stage's own ground shaping (ponds, craters) before the terrain mesh is built
    this.buildTerrain();
    this.buildSky();
    if (!this.duel) this.buildProps();
    this.buildArena();
    this.buildCrates();
    if (!this.duel) this.buildSpawn();
    this.boards = this.duel ? [] : placeBoards(this);
    this.dice = this.duel ? [] : placeDice(this);
    if (this.duel) this.buildDuelCover();
    if (this.duel && this.arenaIdx) buildDuelScenery(this); // the new arenas' backdrop: buttes, ice crystals, pines
    if (!this.duel) buildStageExtras(this); // water, trees, the crashed UFO...
    this.buildContactShadows();
    this.buildClutter();
    this.buildAmbient();
    scene.add(this.group);
    this.minimap = this.buildMinimap();
  }

  rawHeight(x, z) {
    if (this.duel) return duelHeight(this.arenaIdx, x, z); // flat inside the ring (bar the dune arena's mound), rolling hills outside it
    const n = this.noise, n2 = this.noise2;
    let h = (n.fbm(x * 0.009, z * 0.009, 5) - 0.5) * this.amp * 2.2;
    h += (n2.fbm(x * 0.04, z * 0.04, 3) - 0.5) * 2.4;
    h += (n2.fbm(x * 0.13 + 40, z * 0.13, 2) - 0.5) * 0.5; // small-scale undulation so the ground is never glass-flat
    if (this.biome.id === 'desert') {
      h += Math.pow(n2.ridged(x * 0.02, z * 0.03, 3), 2) * 5;
      h += Math.sin((x * 0.8 + z * 0.35) * 0.1 + n.fbm(x * 0.012, z * 0.012, 2) * 7) * 0.45; // wind-formed dune ripples
    }
    if (this.biome.id === 'frozen' || this.biome.id === 'volcanic' || this.biome.id === 'volcano') h += Math.pow(n.ridged(x * 0.015, z * 0.015, 4), 3) * 9;
    const d = Math.hypot(x, z);
    const edge = 132 + (n2.noise2(Math.atan2(z, x) * 6, 3) - 0.5) * 16;
    if (d > edge) h += Math.pow(d - edge, 1.35) * 0.32;
    return h;
  }

  heightAt(x, z) {
    let h = this.rawHeight(x, z);
    for (const f of this.flats || []) {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < f.r + f.blend) {
        const t = d <= f.r ? 1 : 1 - (d - f.r) / f.blend;
        const s = t * t * (3 - 2 * t);
        h = h + (f.h - h) * s;
      }
    }
    for (const c of this.carves) h = c(x, z, h);
    return h;
  }

  // Meandering worn path between the spawn camp and the boss arena (visual only).
  buildPath() {
    if (this.duel) { this.pathPts = [[1e4, 1e4], [1e4 + 1, 1e4]]; return; }
    const s = this.spawn, a = this.arena, pts = [];
    const dx = a.x - s.x, dz = a.z - s.z, len = Math.hypot(dx, dz), nx = -dz / len, nz = dx / len;
    for (let i = 0; i <= 56; i++) {
      const t = i / 56, off = (this.noise.fbm(t * 4 + 11, 3, 3) - 0.5) * 38 * Math.sin(t * Math.PI);
      pts.push([s.x + dx * t + nx * off, s.z + dz * t + nz * off]);
    }
    this.pathPts = pts;
  }
  pathDist(x, z) {
    let best = 1e9;
    const p = this.pathPts;
    for (let i = 0; i < p.length - 1; i++) {
      const ax = p[i][0], az = p[i][1], bx = p[i + 1][0] - ax, bz = p[i + 1][1] - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz)));
      const d = Math.hypot(x - ax - bx * t, z - az - bz * t);
      if (d < best) best = d;
    }
    return best;
  }

  // Layer weights for the terrain shader: x = secondary (dirt/ice/ash), y = special (gravel/moss/powder), z = rock bias.
  splat(x, z, y, ny) {
    const id = this.biome.tex || this.biome.id, n1 = this.noise2.noise2(x * 0.035 + 7, z * 0.035), n2 = this.noise.noise2(x * 0.014 + 50, z * 0.014 + 9), n3 = this.noise2.noise2(x * 0.09 + 9, z * 0.09 + 3);
    const pd = this.pathDist(x, z), wob = (this.noise2.noise2(x * 0.2, z * 0.2) - 0.5) * 1.4;
    const pk = 1 - smoothstep(1.1, 3.4, pd + wob);
    const camp = 1 - smoothstep(9, 17, Math.hypot(x - this.spawn.x, z - this.spawn.z));
    const arK = 1 - smoothstep(this.arena.r - 1, this.arena.r + 3, Math.hypot(x - this.arena.x, z - this.arena.z));
    const flat = smoothstep(0.93, 0.985, ny);
    let b = 0, s = 0;
    if (this.biome.id === 'crypt') {
      // The churchyard: worn mud paths from gate to chapel and across it, mud inside the buildings' footprints, gravel round the graves.
      const ar = Math.hypot(x - this.arena.x, z - this.arena.z), inR = 1 - smoothstep(this.arena.r - 2, this.arena.r + 2, ar);
      const lane = (1 - smoothstep(2.2, 4.6, Math.min(Math.abs(x - this.arena.x), Math.abs(z - this.arena.z)) + wob)) * inR;
      const rim = (1 - smoothstep(1.5, 4, Math.abs(ar - (this.arena.r - 5)) + wob)) * 0.45;
      b = Math.max(lane * 0.95, rim, smoothstep(0.66, 0.82, n2) * 0.55);
      s = smoothstep(0.6, 0.8, n3 * 0.55 + n1 * 0.45) * (1 - b) * 0.9;
      return [Math.min(1, b), Math.min(1, s), 0];
    }
    switch (id) {
      case 'graveyard':
        b = Math.max(pk * 0.95, smoothstep(0.6, 0.78, n2) * 0.9, camp * 0.85, arK * 0.9);
        s = smoothstep(0.68, 0.86, n3 * 0.55 + n1 * 0.45) * (1 - b) * 0.9;
        break;
      case 'forest':
        b = Math.max(pk, smoothstep(0.62, 0.8, n1), camp * 0.85, arK * 0.9);
        s = smoothstep(0.5, 0.75, n3 * 0.5 + (1 - clamp((y + 3) / 7)) * 0.5) * (1 - b);
        break;
      case 'meadow':
        b = Math.max(arK * 0.92, smoothstep(0.68, 0.84, n1) * 0.3); // bare earth in the arena, faint dirt patches outside
        s = smoothstep(0.5, 0.7, n3 * 0.5 + n2 * 0.5) * (1 - b) * 0.85; // clover and moss
        break;
      case 'dunes':
        b = arK * 0.9; // pale packed sand inside the ring, golden dunes outside
        s = smoothstep(0.55, 0.72, n2 * 0.5 + n3 * 0.5) * (1 - b) * 0.7; // warm orange patches
        break;
      case 'frost':
        b = arK * 0.97; // the frozen lake inside the ring, snow outside
        s = smoothstep(0.55, 0.72, n2 * 0.5 + n3 * 0.5) * (1 - b) * 0.8; // wind-packed drifts
        break;
      case 'desert':
        b = Math.max(smoothstep(0.58, 0.74, n1) * 0.9, pk * 0.9, camp * 0.85, arK * 0.9);
        s = smoothstep(0.55, 0.72, n2 * 0.5 + clamp((y + 1) / 5) * 0.5) * (1 - b);
        break;
      case 'frozen':
        b = smoothstep(0.62, 0.8, n1 * 0.5 + (1 - clamp((y + 1) / 6)) * 0.5) * flat;
        s = Math.max(smoothstep(0.5, 0.7, clamp((y - 3) / 10) * 0.7 + n3 * 0.3), camp * 0.7, arK * 0.5) * (1 - b);
        break;
      case 'volcanic':
        b = Math.max(smoothstep(0.55, 0.72, n1), pk * 0.9, camp * 0.9);
        s = smoothstep(0.55, 0.72, n2 * 0.5 + clamp((y - 4) / 10) * 0.5) * (1 - b);
        break;
      default:
        b = Math.max(smoothstep(0.55, 0.72, n1), camp * 0.85);
        s = smoothstep(0.55, 0.72, n2 * 0.5 + clamp((y - 3) / 10) * 0.5) * (1 - b);
    }
    return [Math.min(1, b), Math.min(1, s), 0];
  }

  buildTerrain() {
    this.flats = this.flats || []; // (a stage may already have added its own basins)
    if (!this.duel) { // the duel arenas shape their own ground (arenas.js)
      this.flats.push({ x: this.spawn.x, z: this.spawn.z, r: 12, blend: 14, h: this.rawHeight(this.spawn.x, this.spawn.z) });
      this.flats.push({ x: this.arena.x, z: this.arena.z, r: this.arena.r + 2, blend: 16, h: this.rawHeight(this.arena.x, this.arena.z) });
    }
    this.buildPath();
    const segs = [150, 200, 260][this.quality];
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, segs, segs).rotateX(-Math.PI / 2);
    geo.deleteAttribute('uv');
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.heightAt(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal, sp = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      const v = this.splat(pos.getX(i), pos.getZ(i), pos.getY(i), nrm.getY(i));
      sp[i * 4] = v[0]; sp[i * 4 + 1] = v[1]; sp[i * 4 + 2] = v[2];
    }
    geo.setAttribute('aSplat', new THREE.BufferAttribute(sp, 4));
    const mat = makeTerrainMaterial(this.biome, this.quality);
    this.terrainMat = mat;
    this.animated.push((t) => (mat.userData.uniforms.uT.value = t));
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.group.add(this.terrain);
  }

  buildSky() {
    const mat = skyMaterial(this.biome);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 40, 20), mat);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);
    this.animated.push((t) => (mat.uniforms.uT.value = t));
  }

  // top: world height above which a flying, swinging or jumping body clears it (omitted = infinitely tall).
  addCollider(x, z, r, top = Infinity) {
    if (r <= 0) return;
    const c = { x, z, r, top };
    this.colliders.push(c);
    const cs = 8;
    const x0 = Math.floor((x - r) / cs), x1 = Math.floor((x + r) / cs);
    const z0 = Math.floor((z - r) / cs), z1 = Math.floor((z + r) / cs);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const k = i * 1000 + j;
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(c);
    }
  }

  // Push a circle (x,z,r) out of props; returns corrected [x,z].
  collide(x, z, r, y) {
    const cs = 8;
    const list = this.grid.get(Math.floor(x / cs) * 1000 + Math.floor(z / cs));
    if (list) {
      for (const c of list) {
        const dx = x - c.x, dz = z - c.z;
        const d = Math.hypot(dx, dz), m = c.r + r;
        if (y !== undefined && y >= c.top) continue; // over the crown of a tree or rock: nothing to push against
        if (d < m && d > 1e-4) { x = c.x + (dx / d) * m; z = c.z + (dz / d) * m; }
      }
    }
    // Platforms block you from the side unless your feet are already high enough to step or land on top.
    if (this.platforms) {
      for (const pf of this.platforms) {
        if (pf.air || (y !== undefined && y >= pf.top - 0.35)) continue;
        if (pf.box) {
          // A box (a building, a wall, a roof): push out through the nearest side, in its own frame.
          if (y !== undefined && pf.base !== undefined && y < pf.base - 0.5) continue; // walking under a raised floor or bridge
          const c = Math.cos(pf.yaw || 0), s = Math.sin(pf.yaw || 0), dx = x - pf.x, dz = z - pf.z;
          const lx = dx * c + dz * s, lz = -dx * s + dz * c, ox = pf.hw + r - Math.abs(lx), oz = pf.hd + r - Math.abs(lz);
          if (ox <= 0 || oz <= 0) continue;
          let nx = lx, nz = lz;
          if (ox < oz) nx = Math.sign(lx || 1) * (pf.hw + r); else nz = Math.sign(lz || 1) * (pf.hd + r);
          x = pf.x + nx * c - nz * s; z = pf.z + nx * s + nz * c;
          continue;
        }
        if (y !== undefined && pf.base !== undefined && y < pf.base - 0.5) continue; // under a tower's top floor
        const dx = x - pf.x, dz = z - pf.z, d = Math.hypot(dx, dz), m = pf.r + r;
        if (d < m && d > 1e-4) { x = pf.x + (dx / d) * m; z = pf.z + (dz / d) * m; }
      }
    }
    if (this.duel) {
      // The duel arena is a closed ring.
      const ax = x - this.arena.x, az = z - this.arena.z, ad = Math.hypot(ax, az), al = this.arena.r - 2.2;
      if (ad > al) { x = this.arena.x + ax * al / ad; z = this.arena.z + az * al / ad; }
    }
    const d = Math.hypot(x, z), lim = CONFIG.mapHalf - 12;
    if (d > lim) { x *= lim / d; z *= lim / d; }
    return [x, z];
  }

  // Ground height under a body whose feet are at y, counting jumpable platforms.
  standY(x, z, y) {
    let h = this.heightAt(x, z);
    if (this.platforms) for (const pf of this.platforms) {
      if (pf.box) {
        const c = Math.cos(pf.yaw || 0), s = Math.sin(pf.yaw || 0), dx = x - pf.x, dz = z - pf.z;
        const lx = dx * c + dz * s, lz = -dx * s + dz * c;
        if (Math.abs(lx) > pf.hw - 0.1 || Math.abs(lz) > pf.hd - 0.1) continue;
        const top = pf.top - (pf.pitch || 0) * Math.abs(lx); // pitched roofs fall away from the ridge along local x
        if (y >= top - 0.35) h = Math.max(h, top);
        continue;
      }
      if (y >= pf.top - 0.35 && Math.hypot(x - pf.x, z - pf.z) < pf.r - 0.1) h = Math.max(h, pf.top);
    }
    return h;
  }

  blocked(x, z, r = 0.5) {
    const cs = 8;
    const list = this.grid.get(Math.floor(x / cs) * 1000 + Math.floor(z / cs));
    if (list) for (const c of list) if (Math.hypot(x - c.x, z - c.z) < c.r + r) return true;
    return false;
  }

  // Where nothing may be placed (water, the crashed UFO): set by the stage (stages.js).
  noPlace(x, z, r = 0) { return !!(this.stage && this.stage.noPlace(x, z, r)); }

  clearOf(x, z, extra) {
    if (this.noPlace(x, z, extra)) return false;
    if (Math.hypot(x - this.spawn.x, z - this.spawn.z) < 16 + extra) return false;
    if (Math.hypot(x - this.arena.x, z - this.arena.z) < this.arena.r + 6 + extra) return false;
    if (Math.hypot(x, z) > 128) return false;
    return true;
  }

  // Spatially split InstancedMesh so camera and shadow frustum culling work per cell.
  addInstanced(parts, items, { cast = true, receive = true, lavaMat = null } = {}) {
    const cells = new Map();
    for (const it of items) {
      const k = Math.floor((it.x + SIZE / 2) / CELL) * 32 + Math.floor((it.z + SIZE / 2) / CELL);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(it);
    }
    const out = [];
    for (const list of cells.values()) {
      for (const part of parts) {
        const mat = part.mat === 'lava' ? lavaMat : part.mat;
        const im = new THREE.InstancedMesh(part.geo, mat, list.length);
        list.forEach((it, i) => { im.setMatrixAt(i, it.m); if (it.c) im.setColorAt(i, it.c); });
        im.castShadow = cast && !part.noShadow;
        im.receiveShadow = receive;
        im.computeBoundingSphere();
        this.group.add(im);
        out.push(im);
      }
    }
    return out;
  }

  buildProps() {
    const lib = propLibrary(this.biome, this.quality);
    const r = this.rng;
    const lavaMat = this.biome.id === 'volcanic' || this.biome.id === 'volcano' ? this.makeLavaMaterial() : null;
    const density = [0.55, 0.8, 1][this.quality];
    this.blobs = [];
    const tmpV = new THREE.Vector3();
    const place = (type, def, count, rng, pickVar, scaleDensity) => {
      const items = [], fork = [];
      for (let i = 0; i < count; ) {
        let x = (rng() * 2 - 1) * 130, z = (rng() * 2 - 1) * 130;
        const cl = def.cluster || 1;
        for (let c = 0; c < cl && i < count; c++, i++) {
          const px = x + (cl > 1 ? (rng() - 0.5) * 10 : 0), pz = z + (cl > 1 ? (rng() - 0.5) * 10 : 0);
          const s = def.s[0] + rng() * (def.s[1] - def.s[0]);
          if (!this.clearOf(px, pz, def.r * s)) continue;
          if (def.r && this.blocked(px, pz, def.r * s)) continue;
          const m = new THREE.Matrix4();
          const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rng() - 0.5) * (def.tilt || 0) * 2, rng() * Math.PI * 2, (rng() - 0.5) * (def.tilt || 0) * 2));
          let y = this.heightAt(px, pz) - (def.sink || 0) * s;
          if (def.float) y += def.float[0] + rng() * (def.float[1] - def.float[0]);
          if (def.flat) {
            // Pools and puddles sit on level ground: skip slopes, ride the average height.
            let lo = 1e9, hi = -1e9, sum = 0;
            for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.28, hh = this.heightAt(px + Math.cos(a) * 2.5 * s, pz + Math.sin(a) * 2.5 * s); lo = Math.min(lo, hh); hi = Math.max(hi, hh); sum += hh; }
            if (hi - lo > (def.maxSlope || 0.5) * s) continue;
            y = sum / 8 + 0.02;
          }
          m.compose(new THREE.Vector3(px, y, pz), q, new THREE.Vector3(s, s, s));
          const vi = pickVar(i);
          items.push({ m, x: px, z: pz, vi });
          if (BLOB[type] && !def.float) this.blobs.push({ x: px, z: pz, y: this.heightAt(px, pz), r: BLOB[type] * s });
          if (def.r) this.addCollider(px, pz, def.r * s, y + (def.climb ? def.climb + 3.5 : 6) * s); // trees are about climb + 3.5 tall
          if (def.climb) {
            // A fork high in the trunk you can stand in (see Player.climb).
            const top = y + def.climb * s;
            this.trees.push({ x: px, z: pz, r: def.r * s, top, gy: y });
            this.platforms = this.platforms || [];
            this.platforms.push({ x: px, z: pz, r: def.r * s + 1.5, top, air: true });
            fork.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(px, top - 0.1, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * 6.28, 0)), new THREE.Vector3(s, 1, s)), x: px, z: pz });
          }
        }
      }
      void scaleDensity;
      return { items, fork };
    };
    let ti = 0;
    for (const type of this.biome.props) {
      const def = lib[type]();
      const variants = def.variants || [def.parts];
      const vr = mulberry32(this.seed * 31 + ti++ * 7919 + 5); // variant choice never touches the gameplay stream
      const count = Math.floor(def.n * density);
      const { items, fork } = place(type, def, count, r, () => Math.floor(vr() * variants.length));
      this.emitProps(type, def, variants, items, fork, lavaMat);
    }
    // Visual extras: separate stream, fixed counts (identical for every player).
    const er = mulberry32(this.seed * 17 + 991);
    for (const type of EXTRA[this.biome.id] || []) {
      if (!lib[type]) continue;
      const def = lib[type]();
      const variants = def.variants || [def.parts];
      const { items, fork } = place(type, def, def.n, er, () => 0);
      this.emitProps(type, def, variants, items, fork, lavaMat);
    }
  }

  emitProps(type, def, variants, items, fork, lavaMat) {
    if (fork.length && def.fork) {
      const fm = this.addInstanced([{ geo: def.fork, mat: def.forkMat }], fork);
      void fm;
    }
    variants.forEach((parts, vi) => {
      const mine = items.filter((it) => it.vi === vi);
      if (mine.length) this.addInstanced(parts, mine, { cast: !def.flat && !def.noShadow, lavaMat });
    });
    if (type === 'lantern' || type === 'mushroom') this.glowPoints = (this.glowPoints || []).concat(items.map((it) => new THREE.Vector3().setFromMatrixPosition(it.m)));
  }

  // Cheap contact darkening: a soft dark blob under every grounded prop (stands in for SSAO).
  buildContactShadows() {
    if (!this.blobs.length) return;
    const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: TX.blobTexture(), color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, fog: false });
    const items = this.blobs.map((b) => {
      const dx = this.heightAt(b.x + 0.8, b.z) - this.heightAt(b.x - 0.8, b.z), dz = this.heightAt(b.x, b.z + 0.8) - this.heightAt(b.x, b.z - 0.8);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-dx / 1.6, 1, -dz / 1.6).normalize());
      const m = new THREE.Matrix4().compose(new THREE.Vector3(b.x, b.y + 0.05, b.z), q, new THREE.Vector3(b.r, 1, b.r));
      return { m, x: b.x, z: b.z };
    });
    const ims = this.addInstanced([{ geo, mat }], items, { cast: false, receive: false });
    for (const im of ims) im.renderOrder = 1;
  }

  // Grass, ferns, pebbles and crystal shards: instanced ground cover, thinned on lower quality.
  buildClutter() {
    const id = this.biome.id, Q = this.quality, rng = mulberry32(this.seed * 13 + 4242);
    const spec = {
      graveyard: { tufts: [['deadgrass', [0.9, 1.6], [500, 1400, 2400]]], pebbles: [160, 320, 520], tint: [0.5, 0.5, 0.48] },
      forest: { tufts: [['grass', [0.9, 1.6], [900, 2400, 3800]], ['fern', [1.1, 1.9], [150, 420, 700]]], pebbles: [100, 200, 350], tint: [0.5, 0.5, 0.46] },
      crypt: { tufts: [['grass', [0.9, 1.5], [700, 1700, 2600]], ['deadgrass', [0.9, 1.6], [300, 800, 1300]]], pebbles: [120, 240, 400], tint: [0.5, 0.5, 0.48] },
      meadow: { tufts: [['grass', [0.9, 1.6], [1400, 3200, 4800]], ['fern', [0.8, 1.4], [60, 160, 260]]], pebbles: [60, 120, 200], tint: [0.5, 0.52, 0.44] },
      dunes: { tufts: [['drygrass', [0.8, 1.4], [120, 300, 500]]], pebbles: [80, 160, 260], tint: [0.8, 0.64, 0.44] },
      frost: { tufts: [['frostgrass', [0.6, 1.1], [100, 260, 420]]], pebbles: [40, 90, 160], tint: [0.62, 0.68, 0.76] },
      desert: { tufts: [['drygrass', [0.8, 1.4], [250, 700, 1200]]], pebbles: [240, 460, 760], tint: [0.75, 0.58, 0.4] },
      frozen: { tufts: [['frostgrass', [0.6, 1.1], [150, 400, 700]]], pebbles: [200, 360, 560], tint: [0.55, 0.6, 0.68] },
      volcanic: { tufts: [], pebbles: [340, 640, 1000], tint: [0.2, 0.17, 0.16] },
      abyss: { tufts: [], pebbles: [200, 380, 600], tint: [0.22, 0.18, 0.3], crystals: [60, 140, 240] },
      springs: { tufts: [['grass', [0.9, 1.7], [1600, 3600, 5400]], ['fern', [0.8, 1.4], [120, 300, 460]]], pebbles: [60, 120, 200], tint: [0.5, 0.54, 0.44] },
      space: { tufts: [], pebbles: [400, 700, 1000], tint: [0.46, 0.46, 0.48], crystals: [0, 0, 0] },
      waterfall: { tufts: [['grass', [0.9, 1.7], [1600, 3600, 5400]], ['fern', [0.8, 1.4], [140, 340, 520]]], pebbles: [80, 160, 260], tint: [0.5, 0.54, 0.44] },
      clearing: { tufts: [['grass', [0.9, 1.6], [1200, 3000, 4600]], ['fern', [1.1, 1.9], [160, 440, 720]]], pebbles: [80, 160, 280], tint: [0.5, 0.5, 0.44] },
      volcano: { tufts: [], pebbles: [360, 680, 1050], tint: [0.18, 0.15, 0.14] },
      ruins: { tufts: [['grass', [0.9, 1.6], [1300, 3000, 4500]], ['fern', [0.8, 1.4], [80, 200, 320]]], pebbles: [120, 240, 400], tint: [0.5, 0.52, 0.46] },
    }[id];
    const ok = (x, z, minClear) => {
      if (Math.hypot(x, z) > 128) return null;
      if (Math.hypot(x - this.arena.x, z - this.arena.z) < this.arena.r - 1) return null;
      if (this.blocked(x, z, minClear) || this.noPlace(x, z, minClear)) return null;
      const h = this.heightAt(x, z);
      if (Math.abs(this.heightAt(x + 1, z) - h) > 0.7 || Math.abs(this.heightAt(x, z + 1) - h) > 0.7) return null;
      return h;
    };
    // Tufts: three crossed cards bending in the wind.
    const tuftGeo = (() => {
      const list = [];
      for (let k = 0; k < 3; k++) {
        const g = new THREE.PlaneGeometry(1, 1, 1, 2);
        g.translate(0, 0.5, 0);
        const p = g.attributes.position;
        const col = new Float32Array(p.count * 3), nor = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) { const y = p.getY(i), c = 0.68 + 0.32 * y; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c; nor[i * 3] = 0; nor[i * 3 + 1] = 1; nor[i * 3 + 2] = 0; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        g.rotateY((k / 3) * Math.PI);
        list.push(g);
      }
      return merge(list);
    })();
    for (const [kind, sz, counts] of spec.tufts) {
      const n = counts[Q];
      if (!n) continue;
      const tex = TX.sprayMaps(kind);
      const mat = new THREE.MeshStandardMaterial({ map: tex.map, alphaMap: tex.alphaMap, alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.9, alphaToCoverage: Q >= 1 });
      windifyGrass(mat);
      const items = [];
      for (let i = 0, tries = 0; i < n && tries < n * 3; tries++) {
        const x = (rng() * 2 - 1) * 128, z = (rng() * 2 - 1) * 128, s = sz[0] + rng() * (sz[1] - sz[0]), yaw = rng() * 6.28, tv = rng(), tw = rng();
        const h = ok(x, z, 0.35);
        if (h === null) continue;
        i++;
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x, h - 0.04, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(s * (0.85 + tw * 0.4), s * (0.8 + tv * 0.5), s * (0.85 + tw * 0.4)));
        const c = new THREE.Color().setRGB(0.85 + tv * 0.3, 0.85 + tw * 0.3, 0.85 + tv * 0.2);
        items.push({ m, x, z, c });
      }
      for (const im of this.addInstanced([{ geo: tuftGeo, mat }], items, { cast: false })) { im.userData.full = im.count; (this.grassMeshes ||= []).push(im); }
    }
    // Pebbles: small clusters of displaced stones.
    if (spec.pebbles[Q]) {
      const list = [];
      for (let k = 0; k < 2; k++) {
        const g = rockGeo({ seed: 200 + k, detail: 1, squash: 0.7, rough: 0.3, planes: 4 });
        g.scale(0.22 + k * 0.05, 0.22 + k * 0.05, 0.22 + k * 0.05).translate((k - 1) * 0.28, 0.02, ((k * 7) % 3 - 1) * 0.2);
        list.push(g);
      }
      const geo = merge(list);
      const mat = stoneMat(spec.tint);
      const items = [];
      for (let i = 0, tries = 0; i < spec.pebbles[Q] && tries < spec.pebbles[Q] * 3; tries++) {
        const x = (rng() * 2 - 1) * 128, z = (rng() * 2 - 1) * 128, s = 0.5 + rng() * 1.3, yaw = rng() * 6.28;
        const h = ok(x, z, 0.4);
        if (h === null) continue;
        i++;
        items.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x, h - 0.03, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(s, s, s)), x, z });
      }
      this.addInstanced([{ geo, mat }], items, { cast: false });
    }
    if (spec.crystals && spec.crystals[Q]) {
      const geo = crystalCluster(11, 4, 0.28);
      const mat = new THREE.MeshStandardMaterial({ color: 0x5a2aa8, emissive: 0x9a50ff, emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.1, vertexColors: true, flatShading: true });
      const items = [];
      for (let i = 0, tries = 0; i < spec.crystals[Q] && tries < spec.crystals[Q] * 3; tries++) {
        const x = (rng() * 2 - 1) * 128, z = (rng() * 2 - 1) * 128, s = 0.6 + rng() * 1.5;
        const h = ok(x, z, 0.4);
        if (h === null) continue;
        i++;
        items.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x, h - 0.05, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * 6.28, 0)), new THREE.Vector3(s, s, s)), x, z });
      }
      this.addInstanced([{ geo, mat }], items, { cast: false });
    }
  }

  // Drifting motes around the camera: snow, embers, fireflies, dust, mist, void sparks (one draw call, GPU-wrapped).
  buildAmbient() {
    const id = this.biome.id, Q = this.quality;
    const P = {
      graveyard: { n: 420, size: 0.13, col: [0.7, 0.75, 0.95], a: 0.22, vel: [0.1, 0.03, 0.06], add: true, box: [60, 22, 60], blink: 0 },
      forest: { n: 380, size: 0.1, col: [0.8, 1.0, 0.4], a: 0.9, vel: [0.1, 0.05, 0.07], add: true, box: [56, 14, 56], blink: 1 },
      crypt: { n: 320, size: 0.1, col: [1.0, 0.86, 0.6], a: 0.4, vel: [0.3, 0.06, 0.15], add: true, box: [60, 18, 60], blink: 0 },
      meadow: { n: 260, size: 0.09, col: [1.0, 0.95, 0.7], a: 0.55, vel: [0.35, 0.08, 0.2], add: false, box: [56, 14, 56], blink: 0 },
      dunes: { n: 380, size: 0.1, col: [0.95, 0.82, 0.55], a: 0.3, vel: [2.4, 0.05, 0.8], add: false, box: [60, 16, 60], blink: 0 },
      frost: { n: 420, size: 0.1, col: [1, 1, 1], a: 0.85, vel: [0.5, -1.0, 0.3], add: false, box: [50, 24, 50], blink: 0 },
      desert: { n: 520, size: 0.1, col: [0.85, 0.72, 0.5], a: 0.22, vel: [3.2, 0.05, 1.1], add: false, box: [60, 16, 60], blink: 0 },
      frozen: { n: 1100, size: 0.1, col: [1, 1, 1], a: 0.85, vel: [0.7, -1.3, 0.35], add: false, box: [50, 24, 50], blink: 0 },
      volcanic: { n: 420, size: 0.09, col: [3.0, 0.9, 0.2], a: 1, vel: [0.35, 1.4, 0.2], add: true, box: [56, 20, 56], blink: 0.5 },
      abyss: { n: 380, size: 0.12, col: [0.7, 0.4, 1.5], a: 0.9, vel: [0.05, 0.25, 0.04], add: true, box: [56, 22, 56], blink: 0.5 },
      springs: { n: 300, size: 0.09, col: [1.0, 0.95, 0.75], a: 0.6, vel: [0.3, 0.1, 0.2], add: false, box: [56, 14, 56], blink: 0 },
      space: { n: 420, size: 0.1, col: [2.4, 0.9, 0.3], a: 0.95, vel: [0.5, 1.1, 0.3], add: true, box: [56, 20, 56], blink: 0.4 },
      waterfall: { n: 320, size: 0.1, col: [0.95, 0.98, 1.0], a: 0.45, vel: [0.4, -0.15, 0.25], add: false, box: [56, 16, 56], blink: 0 },
      clearing: { n: 360, size: 0.1, col: [1.0, 0.92, 0.6], a: 0.7, vel: [0.25, 0.08, 0.15], add: true, box: [56, 14, 56], blink: 0.6 },
      volcano: { n: 520, size: 0.09, col: [3.0, 0.9, 0.2], a: 1, vel: [0.4, 1.5, 0.25], add: true, box: [56, 22, 56], blink: 0.5 },
      ruins: { n: 340, size: 0.14, col: [0.85, 0.88, 0.86], a: 0.3, vel: [0.3, 0.02, 0.15], add: false, box: [60, 12, 60], blink: 0 },
    }[id];
    const n = Math.round(P.n * [0.25, 0.5, 1][Q]);
    const seed = new Float32Array(n * 4), pos = new Float32Array(n * 3), r = mulberry32(this.seed + 31);
    for (let i = 0; i < n; i++) { seed[i * 4] = r(); seed[i * 4 + 1] = r(); seed[i * 4 + 2] = r(); seed[i * 4 + 3] = r(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uT: { value: 0 }, uPx: { value: 700 }, uBox: { value: new THREE.Vector3(...P.box) }, uVel: { value: new THREE.Vector3(...P.vel) }, uCol: { value: new THREE.Vector3(...P.col) },
        uSize: { value: P.size }, uA: { value: P.a }, uBlink: { value: P.blink },
      }]),
      vertexShader: `
        attribute vec4 aSeed; uniform float uT, uPx, uSize, uBlink; uniform vec3 uBox, uVel; varying float vA;
        #include <fog_pars_vertex>
        void main(){
          vec3 base = aSeed.xyz * uBox;
          vec3 sway = vec3(sin(uT * 0.7 + aSeed.w * 40.0), sin(uT * 0.9 + aSeed.x * 30.0) * 0.5, cos(uT * 0.6 + aSeed.z * 50.0)) * (0.6 + aSeed.w);
          vec3 off = mod(base + uVel * uT * (0.6 + aSeed.w * 0.8) + sway - cameraPosition, uBox) - uBox * 0.5;
          vec3 wp = cameraPosition + off;
          vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          float d = -mvPosition.z;
          gl_PointSize = clamp(uSize * (0.6 + aSeed.w) * uPx / max(d, 0.5), 1.0, 22.0);
          float edge = 1.0 - smoothstep(0.35, 0.5, max(abs(off.x) / uBox.x, max(abs(off.y) / uBox.y, abs(off.z) / uBox.z)));
          vA = edge * smoothstep(0.4, 2.0, d) * mix(1.0, 0.5 + 0.5 * sin(uT * (1.5 + aSeed.w * 3.0) + aSeed.x * 60.0), uBlink);
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform vec3 uCol; uniform float uA; varying float vA;
        #include <fog_pars_fragment>
        void main(){
          vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0;
          float a = pow(clamp(1.0 - r, 0.0, 1.0), 1.6) * vA * uA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uCol, a);
          #if defined( USE_FOG ) && defined( FOG_EXP2 )
            float fd = vFogDepth * fogDensity; gl_FragColor.a *= exp(-fd * fd * 1.2);
          #endif
        }`,
      transparent: true, depthWrite: false, blending: P.add ? THREE.AdditiveBlending : THREE.NormalBlending, fog: true,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 2;
    this.group.add(pts);
    this.ambient = pts;
    this.animated.push((t) => { mat.uniforms.uT.value = t; mat.uniforms.uPx.value = (window.innerHeight || 720) * 0.75; });
  }

  makeLavaMaterial() {
    const tex = TX.lavaMap();
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: tex }, uT: { value: 0 } }]),
      vertexShader: `varying vec2 vUv;
        #include <fog_pars_vertex>
        void main(){ vUv = uv; vec4 p = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            p = instanceMatrix * p;
          #endif
          vec4 mvPosition = modelViewMatrix * p;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D map; uniform float uT; varying vec2 vUv;
        #include <fog_pars_fragment>
        void main(){
          vec2 uv = vUv * 2.2;
          vec2 w = texture2D(map, uv * 0.6 + vec2(uT * 0.011, -uT * 0.008)).rg;
          vec2 wuv = uv + (w - 0.5) * 0.45;
          vec3 a = texture2D(map, wuv + vec2(uT * 0.02, uT * 0.013)).rgb;
          vec3 b = texture2D(map, wuv * 1.7 - vec2(uT * 0.015, -uT * 0.02)).rgb;
          vec3 c = (a * 0.6 + b * 0.6) * 2.6;
          float lum = dot(c, vec3(0.3, 0.5, 0.2));
          vec3 crust = vec3(0.06, 0.02, 0.012);
          c = mix(crust, c * 1.35, smoothstep(0.22, 0.95, lum));
          float r = length(vUv - 0.5) * 2.0;
          c = mix(c, crust, smoothstep(0.78, 1.05, r) * 0.85);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      fog: true,
    });
    this.animated.push((t) => (mat.uniforms.uT.value = t));
    return mat;
  }

  // A flat glowing ring-and-glyph decal (additive, one quad).
  runeDecal(x, y, z, size, color) {
    const runeMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, col: { value: new THREE.Color(color) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; vec4 p=vec4(position,1.);\n#ifdef USE_INSTANCING\np=instanceMatrix*p;\n#endif\ngl_Position=projectionMatrix*modelViewMatrix*p; }`,
      fragmentShader: `uniform float uT; uniform vec3 col; varying vec2 vUv;
        void main(){ vec2 p = vUv-0.5; float r = length(p)*2.; float a = atan(p.y,p.x);
          float ring = smoothstep(0.03,0.0,abs(r-0.92)) + smoothstep(0.02,0.0,abs(r-0.78));
          float glyph = step(0.78, r) * step(r, 0.92) * step(0.5, fract(a*6.0/3.14159 + uT*0.05)) * 0.35;
          float star = smoothstep(0.02, 0.0, abs(sin(a*2.5 + uT*0.2) * r - 0.0)) * step(r, 0.78) * 0.5;
          float k = (ring + glyph + star) * (0.7 + 0.3*sin(uT*2.0));
          gl_FragColor = vec4(col*k*2.5, k); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const rune = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), runeMat);
    rune.position.set(x, y, z);
    this.group.add(rune);
    this.animated.push((t) => (runeMat.uniforms.uT.value = t));
    return runeMat;
  }

  buildArena() {
    const { x, z, r } = this.arena;
    const y = this.duel ? this.heightAt(x + r, z) : this.heightAt(x, z); // a duel arena may have a mound in the middle: the ring stands on the flat
    const stone = stoneMat(this.duel ? this.biome.stone || [0.64, 0.62, 0.56] : [0.46, 0.44, 0.42]);
    const pillars = [];
    const NP = this.duel ? 16 : 12;
    for (let i = 0; i < NP; i++) {
      const a = (i / NP) * Math.PI * 2;
      const h = 5 + ((i * 7919) % 5);
      const px = Math.cos(a) * r, pz = Math.sin(a) * r;
      const col = lathe([[1.15, 0], [1.0, 0.3], [0.88, 0.6], [0.84, h * 0.5], [0.82, h - 0.5], [0.9, h - 0.3], [0.95, h]], { seg: 18, lobes: 10, lobeAmp: 0.035, noiseAmp: 0.02, seed: i });
      const p = col.attributes.position, nz = noise3(40 + i);
      const broken = i % 3 === 0;
      for (let k = 0; k < p.count; k++) { const yy = p.getY(k); if (broken && yy > h - 1.4) p.setY(k, yy - Math.max(0, nz.fbm(p.getX(k) * 2, 3, p.getZ(k) * 2, 3) - 0.3) * 2.6 * ((yy - h + 1.4) / 1.4)); }
      const cap = broken ? null : softBox(2.1, 0.45, 2.1, { r: 0.08, seed: i }).translate(0, h + 0.2, 0);
      const base = softBox(2.5, 0.5, 2.5, { r: 0.08, seed: i + 20 }).translate(0, 0.1, 0);
      const g = merge(cap ? [col, cap, base] : [col, base]);
      paint(g, (xx, yy) => 0.55 + 0.45 * clamp(yy / 1.5));
      g.translate(px, y - 0.3, pz);
      pillars.push(g);
      this.addCollider(x + px, z + pz, 1.2);
    }
    const ring = new THREE.Mesh(merge(pillars), stone);
    ring.position.set(x, 0, z);
    ring.castShadow = true;
    ring.receiveShadow = true;
    this.group.add(ring);
    if (this.duel) {
      // A low stone wall joins the pillars, so the edge of the fight is something you can see.
      const wr = r + 0.4, wh = 1.0;
      const wall = lathe([[wr - 0.7, -0.4], [wr - 0.7, wh - 0.15], [wr - 0.5, wh], [wr + 0.5, wh], [wr + 0.7, wh - 0.15], [wr + 0.7, -0.4]], { seg: 160, noiseAmp: 0.01, seed: 9, crease: 80 });
      paint(wall, (xx, yy) => 0.6 + 0.4 * clamp((yy + 0.4) / 2));
      const wm = new THREE.Mesh(wall, stone);
      wm.position.set(x, y, z);
      wm.castShadow = wm.receiveShadow = true;
      this.group.add(wm);
    }
    if (this.duel && this.arenaIdx) return; // the other duel arenas have their own centrepiece (arenas.js)
    // Altar: stepped, chamfered dais with a glowing rune circle around it.
    const altarG = lathe([[3.5, -0.4], [3.45, -0.2], [3.25, 0.1], [3.05, 0.2], [2.95, 0.62], [2.85, 0.7], [2.7, 0.72], [2.6, 0.8], [0.01, 0.8]], { seg: 36, lobes: 12, lobeAmp: 0.012, noiseAmp: 0.012, seed: 3, crease: 60 });
    paint(altarG, (xx, yy) => 0.55 + 0.45 * clamp((yy + 0.3) / 1.0));
    const altar = new THREE.Mesh(altarG, stone);
    altar.position.set(x, y + 0.0, z);
    altar.receiveShadow = altar.castShadow = true;
    this.group.add(altar);
    this.runeMat = this.runeDecal(x, y + 0.08, z, r * 1.6, this.duel ? 0x7a5a2c : 0xff3a4a);
    // The altar stone is a platform, not a wall: you can jump up onto it (see collide / standY).
    (this.platforms = this.platforms || []).push({ x, z, r: 3.1, top: y + 0.8 });
  }

  // Duel Arena: where the two fighters start (opposite sides, facing the middle) and the cover between them.
  duelSpawn(i) {
    const a = i % 2 ? Math.PI : 0, R = this.arena.r - 8;
    const x = this.arena.x + Math.cos(a) * R, z = this.arena.z + Math.sin(a) * R;
    return { x, z, yaw: Math.atan2(this.arena.x - x, this.arena.z - z) };
  }

  // Duel Arena cover. Everything is mirrored through the middle, so neither fighter gets the better spot.
  //   drums and ziggurats: round stone steps you can jump onto (platforms; each step is about one jump high)
  //   walls and monoliths: tall enough to hide behind (colliders), and they stop bullets and rockets (solids)
  buildDuelCover() {
    if (this.arenaIdx === 1) { buildDunes(this); return; }
    if (this.arenaIdx === 2) { buildFrost(this); return; }
    if (this.arenaIdx === 3) { buildGrave(this); return; }
    const { x: cx, z: cz } = this.arena;
    const y0 = this.heightAt(cx, cz);
    const stone = stoneMat([0.66, 0.63, 0.56]);
    const parts = [];
    let seed = 60;
    const K = this.arena.r / 42; // the layout was drawn for a 42 m ring and spreads out with a bigger one
    const drum = (u, v, r, h) => {
      u *= K; v *= K;
      const g = lathe([[r + 0.18, -0.4], [r + 0.1, 0.0], [r, 0.08], [r, h - 0.1], [r - 0.1, h], [0.01, h]], { seg: 28, noiseAmp: 0.012, seed: seed++, crease: 70 });
      paint(g, (xx, yy) => 0.62 + 0.38 * clamp((yy + 0.4) / (h + 0.4)));
      parts.push(g.translate(u, y0, v));
      this.platforms.push({ x: cx + u, z: cz + v, r, top: y0 + h });
      this.solids.push({ t: 'c', x: cx + u, z: cz + v, r, top: y0 + h });
    };
    const zig = (u, v) => { drum(u, v, 4.4, 1.1); drum(u, v, 3.0, 2.2); drum(u, v, 1.7, 3.3); };
    const wall = (u, v, ang, len, h, th) => {
      u *= K; v *= K;
      const g = softBox(len, h, th, { r: 0.12, seed: seed++ });
      paint(g, (xx, yy) => 0.6 + 0.4 * clamp((yy + h / 2) / h));
      parts.push(g.translate(0, h / 2 - 0.2, 0).rotateY(-ang).translate(u, y0, v));
      const c = Math.cos(ang), s = Math.sin(ang);
      this.solids.push({ t: 'b', x: cx + u, z: cz + v, hx: len / 2, hz: th / 2, c, s, top: y0 + h - 0.2 });
      for (let d = -len / 2 + 0.6; d <= len / 2 - 0.6 + 1e-6; d += 1.2) this.addCollider(cx + u + c * d, cz + v + s * d, th / 2 + 0.2);
      this.blobs.push({ x: cx + u, z: cz + v, y: y0, r: len * 0.42 });
    };
    const mono = (u, v, r, h) => {
      u *= K; v *= K;
      const g = lathe([[r + 0.2, -0.4], [r + 0.1, 0.4], [r * 0.92, h * 0.5], [r * 0.88, h - 0.5], [r, h - 0.3], [r, h], [0.01, h]], { seg: 20, lobes: 5, lobeAmp: 0.03, noiseAmp: 0.02, seed: seed++, crease: 60 });
      paint(g, (xx, yy) => 0.55 + 0.45 * clamp((yy + 0.4) / 3));
      parts.push(g.translate(u, y0, v));
      this.addCollider(cx + u, cz + v, r + 0.1);
      this.solids.push({ t: 'c', x: cx + u, z: cz + v, r, top: y0 + h });
      this.blobs.push({ x: cx + u, z: cz + v, y: y0, r: r * 1.8 });
    };
    // Ziggurats: three steps up to a firing platform.
    zig(0, -17); zig(0, 17);
    // Single drums to hop on and shoot from.
    for (const [u, v, r] of [[11, -8, 2.6], [22, 11, 2.3], [-8, -25, 2.1]]) { drum(u, v, r, 1.1); drum(-u, -v, r, 1.1); }
    // Stairs of two drums: low, then higher.
    for (const [u, v] of [[-19, -17], [19, 17]]) { const k = Math.sign(u); drum(u, v, 2.3, 1.1); drum(u + k * 3.3 / K, v + k * 3.3 / K, 1.8, 2.2); }
    // Tall walls to hide behind.
    wall(21, 1, Math.PI / 2, 10, 4.6, 1.4); wall(-21, -1, Math.PI / 2, 10, 4.6, 1.4);
    wall(8, -13, 0.35, 8.5, 4.2, 1.3); wall(-8, 13, 0.35, 8.5, 4.2, 1.3);
    wall(-14, 24, -0.6, 7, 4.2, 1.3); wall(14, -24, -0.6, 7, 4.2, 1.3);
    // Monoliths.
    for (const [u, v] of [[28, -17], [14, 27], [-5, -8], [-28, 17], [-14, -27], [5, 8]]) mono(u, v, 1.3, 5.5);
    const m = new THREE.Mesh(merge(parts), stone);
    m.position.set(cx, 0, cz);
    m.castShadow = m.receiveShadow = true;
    this.group.add(m);
    for (const p of this.platforms) if (!p.box && p.top > y0 + 0.3 && p.top <= y0 + 1.2 && !p.air) this.blobs.push({ x: p.x, z: p.z, y: y0, r: p.r * 1.35 });
  }

  // Does the segment from (ox,oy,oz) along unit dir stop at a duel solid? Returns the distance, or Infinity.
  rayBlock(ox, oy, oz, dx, dy, dz, maxD) {
    let best = Infinity;
    for (const s of this.solids) {
      let tin, tout;
      if (s.t === 'c') {
        const rx = ox - s.x, rz = oz - s.z, a = dx * dx + dz * dz;
        if (a < 1e-9) continue;
        const b = rx * dx + rz * dz, c = rx * rx + rz * rz - s.r * s.r, disc = b * b - a * c;
        if (disc < 0) continue;
        const q = Math.sqrt(disc);
        tin = (-b - q) / a; tout = (-b + q) / a;
      } else {
        // Oriented box: slide into its own frame, then slab-test x and z.
        const rx = ox - s.x, rz = oz - s.z;
        const lx = rx * s.c + rz * s.s, lz = -rx * s.s + rz * s.c, ldx = dx * s.c + dz * s.s, ldz = -dx * s.s + dz * s.c;
        tin = -Infinity; tout = Infinity;
        let ok = true;
        for (const [o, d, h] of [[lx, ldx, s.hx], [lz, ldz, s.hz]]) {
          if (Math.abs(d) < 1e-9) { if (Math.abs(o) > h) { ok = false; break; } continue; }
          let t1 = (-h - o) / d, t2 = (h - o) / d;
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
          tin = Math.max(tin, t1); tout = Math.min(tout, t2);
        }
        if (!ok || tin > tout) continue;
      }
      if (tout < 0 || tin > maxD) continue;
      const t0 = Math.max(0, tin);
      const yAt = oy + dy * t0;
      let hit = Infinity;
      if (yAt < s.top) hit = t0; // the side of it
      else if (dy < 0) { const tt = (s.top - oy) / dy; if (tt >= t0 && tt <= tout) hit = tt; } // coming down onto the top
      if (hit < best) best = hit;
    }
    return best <= maxD ? best : Infinity;
  }

  // Trees, rocks, tombs, walls and buildings stop shots. Where does a ray along unit dir first meet one?
  // Returns the distance, or Infinity. Anything nearer than tMin is skipped: cover the shooter is hugging, or a
  // trunk that sits between a third-person camera and its own player.
  rayProps(ox, oy, oz, dx, dy, dz, maxD, tMin = 0) {
    let best = Infinity;
    const a = dx * dx + dz * dz;
    const span = (tin, tout, top, base) => {
      if (tout < tMin || tin > maxD || tin < tMin) return;
      const y = oy + dy * tin;
      let hit = Infinity;
      if (y < top && y > base) hit = tin; // the side of it
      else if (y >= top && dy < 0) { const tt = (top - oy) / dy; if (tt >= tin && tt <= tout) hit = tt; } // coming down onto the top
      if (hit < best) best = hit;
    };
    const cyl = (cx, cz, r, top, base) => {
      if (r <= 0.05 || a < 1e-9) return;
      const rx = ox - cx, rz = oz - cz, b = rx * dx + rz * dz, c = rx * rx + rz * rz - r * r, disc = b * b - a * c;
      if (disc < 0) return;
      const q = Math.sqrt(disc);
      span((-b - q) / a, (-b + q) / a, top, base);
    };
    for (const c of this.colliders) cyl(c.x, c.z, c.r, this.colTop(c), -Infinity);
    if (this.temps && this.temps.length) { const now = performance.now() / 1000; for (const t of this.temps) if (t.until > now) cyl(t.x, t.z, t.r, t.top, -Infinity); }
    if (this.platforms) for (const pf of this.platforms) {
      if (pf.air) continue;
      if (!pf.box) { cyl(pf.x, pf.z, pf.r, pf.top - 0.05, pf.base !== undefined ? pf.base - 0.3 : -Infinity); continue; }
      const c = Math.cos(pf.yaw || 0), s = Math.sin(pf.yaw || 0), rx = ox - pf.x, rz = oz - pf.z;
      const lx = rx * c + rz * s, lz = -rx * s + rz * c, ldx = dx * c + dz * s, ldz = -dx * s + dz * c;
      let tin = -Infinity, tout = Infinity, ok = true;
      for (const [o, d, h] of [[lx, ldx, pf.hw], [lz, ldz, pf.hd]]) {
        if (Math.abs(d) < 1e-9) { if (Math.abs(o) > h) { ok = false; break; } continue; }
        let t1 = (-h - o) / d, t2 = (h - o) / d;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tin = Math.max(tin, t1); tout = Math.min(tout, t2);
      }
      if (ok && tin <= tout) span(tin, tout, pf.top - 0.05, pf.base !== undefined ? pf.base - 0.3 : -Infinity);
    }
    return best <= maxD ? best : Infinity;
  }
  // How tall a prop is for shots (props with no stated height count as about 4 m).
  colTop(c) { if (c.top !== Infinity) return c.top; if (c.shotTop === undefined) c.shotTop = this.heightAt(c.x, c.z) + 4; return c.shotTop; }
  // Is this point inside a tree, rock, tomb, wall or building? (Arrows, rockets, fireballs and enemy shots stop there.)
  // Short-lived solid columns (Pillar Burst's rocks): they stop every shot while they stand.
  addTemp(x, z, r, top, sec) {
    const now = performance.now() / 1000;
    this.temps = (this.temps || []).filter((t) => t.until > now);
    this.temps.push({ x, z, r, top, until: now + sec });
  }
  solidPoint(x, y, z, r = 0.12) {
    if (this.temps && this.temps.length) { const now = performance.now() / 1000; for (const t of this.temps) if (t.until > now && y < t.top && Math.hypot(x - t.x, z - t.z) < t.r + r) return true; }
    const cs = 8;
    const list = this.grid.get(Math.floor(x / cs) * 1000 + Math.floor(z / cs));
    if (list) for (const c of list) if (y < this.colTop(c) && Math.hypot(x - c.x, z - c.z) < c.r + r) return true;
    if (this.platforms) for (const pf of this.platforms) {
      if (pf.air || y > pf.top - 0.05) continue;
      if (pf.box) {
        if (pf.base !== undefined && y < pf.base - 0.3) continue;
        const c = Math.cos(pf.yaw || 0), s = Math.sin(pf.yaw || 0), rx = x - pf.x, rz = z - pf.z;
        if (Math.abs(rx * c + rz * s) < pf.hw + r && Math.abs(-rx * s + rz * c) < pf.hd + r) return true;
      } else if (!(pf.base !== undefined && y < pf.base - 0.3) && Math.hypot(x - pf.x, z - pf.z) < pf.r + r) return true;
    }
    return this.solids.length ? this.solidAt(x, y, z) : false;
  }

  // Is this point inside the wall, lintel or roof of a walk-in building (buildkit.js)? The third-person camera pulls in instead.
  inBuilding(x, y, z, r = 0.35) {
    if (this.platforms) for (const pf of this.platforms) {
      if (!pf.bld || y > pf.top + r || (pf.base !== undefined && y < pf.base - r)) continue;
      const c = Math.cos(pf.yaw || 0), s = Math.sin(pf.yaw || 0), rx = x - pf.x, rz = z - pf.z, lx = rx * c + rz * s, lz = -rx * s + rz * c;
      if (Math.abs(lx) < pf.hw + r && Math.abs(lz) < pf.hd + r && y < pf.top - (pf.pitch || 0) * Math.abs(lx) + r) return true;
    }
    return false;
  }

  // Is this point inside a duel solid? (Rockets and grenades burst on it.)
  solidAt(x, y, z) {
    for (const s of this.solids) {
      if (y > s.top) continue;
      if (s.t === 'c') { if (Math.hypot(x - s.x, z - s.z) < s.r) return true; }
      else {
        const rx = x - s.x, rz = z - s.z;
        if (Math.abs(rx * s.c + rz * s.s) < s.hx && Math.abs(-rx * s.s + rz * s.c) < s.hz) return true;
      }
    }
    return false;
  }

  buildCrates() {
    if (!this.crateCount) return;
    const r = this.rng;
    // Treasure chests (src/chest.js): a wooden body and domed lid with iron straps, a thin line of gold light leaking
    // from the seam, and a faint beam above so they can be spotted from afar.
    const P = chestParts(), M = chestMats();
    const beamMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; vec4 p=vec4(position,1.);\n#ifdef USE_INSTANCING\np=instanceMatrix*p;\n#endif\ngl_Position=projectionMatrix*modelViewMatrix*p; }`,
      fragmentShader: `uniform float uT; varying vec2 vUv; void main(){ float a = pow(1.0-vUv.y, 2.0) * 0.16 * (0.75+0.25*sin(uT*3.0+vUv.y*10.)); gl_FragColor = vec4(vec3(1.0,0.8,0.35)*a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const seamMat = M.seam.clone();
    this.animated.push((t) => { beamMat.uniforms.uT.value = t; seamMat.opacity = 0.55 + 0.35 * Math.sin(t * 2.6); });
    const beamGeo = new THREE.CylinderGeometry(0.15, 0.45, 9, 12, 1, true).translate(0, 4.5, 0);
    // There are many chests, so each part is one instanced mesh and an opened chest is hidden by collapsing its
    // instances (the opening itself is a separate animated model, ChestFx).
    const N = this.crateCount;
    const woods = new THREE.InstancedMesh(P.closedWood, M.wood, N);
    const irons = new THREE.InstancedMesh(P.closedIron, M.iron, N);
    const seams = new THREE.InstancedMesh(P.seam, seamMat, N);
    const beams = new THREE.InstancedMesh(beamGeo, beamMat, N);
    woods.castShadow = woods.receiveShadow = irons.castShadow = irons.receiveShadow = true;
    const all = [woods, irons, seams, beams];
    for (const m of all) { m.frustumCulled = false; m.count = 0; this.group.add(m); }
    const root = new THREE.Object3D(), none = new THREE.Matrix4().makeScale(0, 0, 0);
    const place = (c, on) => {
      const k = c.id;
      if (!on) for (const m of all) m.setMatrixAt(k, none);
      else {
        root.position.set(c.x, c.y, c.z); root.rotation.y = c.ry; root.updateMatrix();
        for (const m of all) m.setMatrixAt(k, root.matrix);
      }
      for (const m of all) m.instanceMatrix.needsUpdate = true;
    };
    let id = 0;
    for (let tries = 0; this.crates.length < N && tries < 4000; tries++) {
      const x = (r() * 2 - 1) * 120, z = (r() * 2 - 1) * 120;
      if (!this.clearOf(x, z, 2) || this.blocked(x, z, 1.5)) continue;
      const y = this.heightAt(x, z);
      const c = { id: id++, x, z, y, ry: r() * Math.PI, opened: false };
      c.mesh = { get visible() { return !c.opened; }, set visible(v) { place(c, v); } };
      this.crates.push(c);
      place(c, true);
      this.addCollider(x, z, 0.7, y + 0.95); // the chest is under a metre tall: a jump (or a flight) clears it
      this.blobs.push({ x, z, y, r: 1.1 });
    }
    for (const m of all) m.count = this.crates.length;
  }

  buildSpawn() {
    // A ring of braziers marks the spawn camp.
    const { x, z } = this.spawn;
    const y = this.heightAt(x, z);
    const stone = stoneMat([0.38, 0.36, 0.33]);
    const parts = [];
    this.braziers = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const bx = Math.cos(a) * 7, bz = Math.sin(a) * 7;
      const ped = lathe([[0.62, 0], [0.5, 0.15], [0.34, 0.45], [0.3, 0.8], [0.46, 1.0], [0.62, 1.18], [0.58, 1.24], [0.4, 1.12], [0.01, 1.08]], { seg: 14, lobes: 6, lobeAmp: 0.03, noiseAmp: 0.02, seed: i });
      paint(ped, (xx, yy) => 0.55 + 0.45 * clamp(yy / 0.9));
      parts.push(ped.translate(bx, y + 0.0, bz));
      this.braziers.push([x + bx, y + 1.3, z + bz]);
      this.addCollider(x + bx, z + bz, 0.6);
      this.blobs.push({ x: x + bx, z: z + bz, y, r: 1.2 });
    }
    const m = new THREE.Mesh(merge(parts), stone);
    m.position.set(x, 0, z);
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
  }

  buildMinimap() {
    const S = 220;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    const base = this.biome.groundCols[1];
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = (i / S - 0.5) * SIZE * 0.9, z = (j / S - 0.5) * SIZE * 0.9;
      const h = this.heightAt(x, z);
      const k = 0.55 + Math.max(-0.4, Math.min(0.6, h / 30));
      const o = (j * S + i) * 4;
      const out = Math.hypot(x, z) > 140;
      img.data[o] = base[0] * 255 * k * (out ? 0.4 : 1);
      img.data[o + 1] = base[1] * 255 * k * (out ? 0.4 : 1);
      img.data[o + 2] = base[2] * 255 * k * (out ? 0.4 : 1);
      img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (const col of this.colliders) {
      const [i, j] = this.toMap(col.x, col.z, S);
      g.beginPath(); g.arc(i, j, Math.max(1, col.r * S / (SIZE * 0.9)), 0, 7); g.fill();
    }
    return c;
  }

  toMap(x, z, S = 220) { return [(x / (SIZE * 0.9) + 0.5) * S, (z / (SIZE * 0.9) + 0.5) * S]; }

  update(dt, t) {
    WIND.uT.value = t;
    for (const f of this.animated) f(t);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    });
  }
}

// Grass-style sway: cards bend by their height along the card (uv.y) with a per-instance phase.
function windifyGrass(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWT = WIND.uT;
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
    sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', 'diffuseColor.a *= smoothstep(0.5, 1.6, length(vViewPosition));\n#include <alphatest_fragment>');
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float wph = uWT * 1.8 + ip.x * 0.23 + ip.z * 0.19;
  float wg = position.y * position.y * 0.16;
  transformed.x += (sin(wph) + 0.4 * sin(wph * 2.7 + ip.z)) * wg;
  transformed.z += cos(wph * 0.9 + ip.x) * wg * 0.6;`);
  };
  mat.customProgramCacheKey = () => 'grasswind';
}
