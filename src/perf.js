// Frame-rate governor: holds the game at 60+ fps by stepping through quality tiers. It watches the median frame
// time over short windows (so a one-off hitch never counts), drops a tier as soon as the game runs under target
// (two at once when it is far under) and only climbs back after a long stretch of headroom. A tier that failed
// twice is never tried again in this session, so it settles instead of see-sawing.
// Every change here is cheap to switch at runtime: no shader recompiles (shadows stay on, they just refresh less
// often and cast from fewer things), so stepping never causes a stall of its own.

// pr: render resolution per CSS pixel (capped at the screen's own density). msaa: samples on the scene target.
// shadow: shadow map size. every: redraw the shadow map every Nth frame. mobShadow: enemies cast shadows within this
// many metres of the camera. bloomDiv: bloom works at 1/N of the screen.
// grass: share of grass and fern tufts drawn. fx: share of particles kept. lod: how far enemies keep their detailed bodies.
export const TIERS = [
  { name: 'Ultra', pr: 1.5, msaa: 4, bloom: true, bloomDiv: 2, shadow: 2048, every: 1, mobShadow: 40, grass: 1, fx: 1, lod: 1.2 },
  { name: 'High', pr: 1.0, msaa: 4, bloom: true, bloomDiv: 2, shadow: 2048, every: 1, mobShadow: 26, grass: 1, fx: 1, lod: 1 },
  { name: 'Medium', pr: 1.0, msaa: 2, bloom: true, bloomDiv: 3, shadow: 1024, every: 2, mobShadow: 16, grass: 0.8, fx: 0.85, lod: 0.85 },
  { name: 'Low', pr: 0.85, msaa: 0, bloom: false, bloomDiv: 3, shadow: 1024, every: 2, mobShadow: 10, grass: 0.55, fx: 0.7, lod: 0.65 },
  { name: 'Very low', pr: 0.72, msaa: 0, bloom: false, bloomDiv: 3, shadow: 512, every: 3, mobShadow: 0, grass: 0.35, fx: 0.5, lod: 0.5 },
  { name: 'Lowest', pr: 0.6, msaa: 0, bloom: false, bloomDiv: 3, shadow: 512, every: 4, mobShadow: 0, grass: 0.2, fx: 0.35, lod: 0.4 },
  { name: 'Rescue', pr: 0.5, msaa: 0, bloom: false, bloomDiv: 3, shadow: 512, every: 6, mobShadow: 0, grass: 0, fx: 0.25, lod: 0.3 },
];

// Read by views (MobView) every frame.
export const PERF = { mobShadow: 26, grass: 1, fx: 1, lod: 1, tier: 'High' };
// Ground cover: show only the governor's share of each grass/fern batch (instances are in random order, so cutting the
// count thins the field evenly). Called on every tier change and whenever a new round's world is built.
export function applyGrass(world) {
  if (!world || !world.grassMeshes) return;
  for (const m of world.grassMeshes) { m.count = Math.floor(m.userData.full * PERF.grass); m.visible = m.count > 0; }
  world._grassK = PERF.grass;
}

export class Governor {
  constructor(game) {
    this.g = game;
    this.samples = [];
    this.winT = 0;
    this.goodT = 0;
    this.settleT = 1.5; // ignore the first moments after a change (and after start-up)
    this.fails = new Array(TIERS.length).fill(0);
    this.upAt = -1e9; this.upTier = -1;
    this.frame = 0;
    this.target = 60;
    this.gpu = gpuName(game.renderer);
    this.tier = -1;
    this.apply(this.startTier());
  }
  // Highest tier the quality setting allows, and where to start.
  ceiling() { const q = this.g.q; return q >= 2 ? 0 : q === 1 ? 2 : 3; }
  startTier() { return Math.max(this.ceiling(), this.g.split ? 3 : this.g.q >= 2 ? 1 : 2); }
  get name() { return TIERS[this.tier].name; }

  apply(t) {
    const g = this.g, T = TIERS[t], r = g.renderer;
    this.tier = t;
    PERF.mobShadow = T.mobShadow; PERF.grass = T.grass; PERF.fx = T.fx; PERF.lod = T.lod; PERF.tier = T.name;
    applyGrass(g.world);
    // Resolution.
    const pr = Math.min(window.devicePixelRatio || 1, T.pr) * (g.split ? 0.85 : 1);
    g.basePixelRatio = pr; g.pixelScale = 1;
    if (Math.abs(r.getPixelRatio() - pr) > 0.001) { r.setPixelRatio(pr); g.onResize(); }
    // Post effects.
    if (g.composer) {
      const rt = g.composer.renderTarget2, maxS = r.capabilities.maxSamples || 0;
      const s = r.extensions.has('EXT_color_buffer_float') ? Math.min(maxS, T.msaa) : 0;
      if (rt.samples !== s) { rt.samples = s; rt.dispose(); }
      if (g.bloom) {
        g.bloom.enabled = T.bloom;
        if (this.bloomDiv !== T.bloomDiv) { this.bloomDiv = T.bloomDiv; g.onResize(); }
      }
    }
    // Shadows: smaller map, refreshed less often (no recompiles: the light keeps casting).
    if (g.sun && g.sun.castShadow) {
      const sz = Math.min(T.shadow, g.q >= 2 ? 2048 : 1024);
      if (g.sun.shadow.mapSize.x !== sz) {
        g.sun.shadow.mapSize.set(sz, sz);
        if (g.sun.shadow.map) { g.sun.shadow.map.dispose(); g.sun.shadow.map = null; }
      }
    }
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = true;
    this.samples = []; this.winT = 0; this.goodT = 0; this.settleT = 1.2;
  }

  // Called once per drawn frame, right before rendering.
  beforeRender() {
    const every = TIERS[this.tier].every;
    if (++this.frame % every === 0) this.g.renderer.shadowMap.needsUpdate = true;
  }

  tick(dt) {
    if (this.g.world && this.g.world._grassK !== PERF.grass) applyGrass(this.g.world); // a new round's map
    if (this.settleT > 0) { this.settleT -= dt; return; }
    this.samples.push(dt);
    this.winT += dt;
    if (this.winT < 0.7) return;
    const s = this.samples.sort((a, b) => a - b), med = s[s.length >> 1];
    const n = s.length, fps = n / this.winT;
    this.samples = []; this.winT = 0;
    const g = this.g;
    g.fps = Math.round(fps);
    const medFps = 1 / Math.max(med, 1e-4);
    const low = this.target * 0.92;
    // Stutter: the median can look fine while every few frames hitch. Lots of long frames is lag too.
    let longF = 0; for (const x of s) if (x > 1 / 28) longF++;
    const stutter = n >= 10 && longF / n > 0.12;
    if ((medFps < low || stutter) && this.tier < TIERS.length - 1) {
      // Too slow: step down (two tiers when far under). A tier that fails right after we climbed into it counts as failed.
      if (this.tier === this.upTier && g.now - this.upAt < 20) this.fails[this.tier]++;
      this.apply(Math.min(TIERS.length - 1, this.tier + (medFps < this.target * 0.6 ? 2 : 1)));
      return;
    }
    // Headroom: a solid stretch at target (or well above it on a fast screen) earns one tier back.
    const up = this.tier - 1;
    if (up >= this.ceiling() && this.fails[up] < 2 && medFps >= this.target - 1.5) {
      this.goodT += 0.7;
      const need = medFps > this.target * 1.5 ? 5 : 12 + 8 * this.fails[up];
      if (this.goodT >= need) { this.upAt = g.now; this.upTier = up; this.apply(up); }
    } else this.goodT = 0;
  }
}

function gpuName(r) {
  try {
    const gl = r.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const s = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return String(s || '').replace(/^ANGLE \((.*)\)$/, '$1').replace(/ Direct3D.*$/, '').replace(/, or similar/, '').slice(0, 60);
  } catch (e) { return ''; }
}

// True when the browser is drawing on a built-in laptop GPU instead of the dedicated one.
export function onIntegratedGpu(name) { return /intel|uhd|iris|radeon\(tm\) graphics|vega \d+ graphics|microsoft basic/i.test(name) && !/nvidia|geforce|rtx|gtx|radeon rx|arc a/i.test(name); }
