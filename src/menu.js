// The title/lobby backdrop: the four playable characters on a cliff at dusk,
// each wreathed in an element. In the lobby the camera closes in on the
// character you pick, wearing your element and holding your first weapon.
import * as THREE from 'three';
import { FX } from './fx.js';
import { CLASSES } from './data.js';
import { makeHumanoid } from './models.js';
import { CHARACTERS, makeCharacterModel } from './characters.js';
import { DEFAULT_SKIN } from './skins.js';
import { rockMaterial } from './elements.js';
import { makeNoise } from './rng.js';
import * as TX from './textures.js';
import { WEAPONS } from './data.js';
import { makeWeapon } from './weapons.js';
import { buildVista, makeSky } from './vista.js';
import { upgradeVistaScan } from './vistascan.js';
import { setupLobbyBg } from './lobbybg.js';
import { PaintScape } from './paintscape.js';

// Nutty's river painting brought to life (2026-11-11). Nutty only wanted to look at it, so it is OFF: the home screen stays
// the 3D waterfall valley. ?home=paint shows the painted one.
const PAINT_HOME = new URLSearchParams(location.search).get('home') === 'paint';

export class MenuScene {
  constructor(game) {
    this.game = game;
    const s = (this.scene = new THREE.Scene());
    s.environment = game.envTex;
    s.environmentIntensity = 0.3;
    s.fog = new THREE.FogExp2(0x140c1c, 0.028);
    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 500);
    this.fx = new FX(s, this.camera, game.q);
    this.fx.heightAt = () => 0;
    this.fx.setFog(0.02);
    this.t = 0;
    this.focusIdx = -1;

    this.sky = makeSky();
    s.add(this.sky);
    // Everything that belongs to the dusk cliff (the lobby backdrop) lives in one group, the daylight valley in another.
    const dusk = (this.dusk = new THREE.Group());
    s.add(dusk);

    // Cliff top built from a noisy disc.
    const g = new THREE.CircleGeometry(9, 64, 0, Math.PI * 2);
    g.rotateX(-Math.PI / 2);
    const n = makeNoise(9);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), r = Math.hypot(x, z);
      pos.setY(i, (n.fbm(x * 0.3, z * 0.3, 4) - 0.5) * 0.5 - Math.max(0, r - 7) * 1.2);
    }
    g.computeVertexNormals();
    const rock = rockMaterial([0.32, 0.28, 0.26]);
    const top = new THREE.Mesh(g, rock);
    top.receiveShadow = true;
    dusk.add(top);
    const cliff = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 4, 14, 24, 6, true), rock);
    cliff.position.y = -7.2;
    dusk.add(cliff);
    // Distant mountain ranges: layered silhouettes that fade into the dusk haze.
    const ridge = (R, base, amp, seed, near, far) => {
      const N = 360, nz = makeNoise(seed);
      const pos = [], hv = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        const u = Math.cos(a) * 3, v = Math.sin(a) * 3;
        const h = base + amp * (Math.pow(nz.fbm(u + 7, v + 3, 5), 1.6) * 1.6 + Math.abs(nz.fbm(u * 3.1, v * 3.1, 3) - 0.5) * 0.35);
        pos.push(Math.cos(a) * R, -40, Math.sin(a) * R, Math.cos(a) * R, h, Math.sin(a) * R);
        hv.push(0, 1, 0, 1);
        if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      const m = new THREE.ShaderMaterial({
        side: THREE.DoubleSide, depthWrite: false, fog: false,
        uniforms: { cTop: { value: new THREE.Color(near) }, cLow: { value: new THREE.Color(far) } },
        vertexShader: `varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
        fragmentShader: `uniform vec3 cTop, cLow; varying float vY; void main(){ float k = smoothstep(-22.0, ${(base + amp * 0.8).toFixed(1)}, vY); vec3 c = mix(cLow, cTop, k); gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.renderOrder = -1;
      dusk.add(mesh);
    };
    ridge(190, -6, 34, 31, 0x3a1f2e, 0x8a3c34);   // far range, warm haze
    ridge(150, -14, 26, 47, 0x1c1020, 0x5a2a2c);  // middle range
    ridge(115, -22, 20, 59, 0x0d0910, 0x2a1418);  // near ridge, almost black
    // A low moon over the ranges.
    const moon = new THREE.Mesh(new THREE.CircleGeometry(7, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.86, 0.72).multiplyScalar(1.6), fog: false, toneMapped: false }));
    moon.position.set(-60, 34, -150); moon.lookAt(0, 0, 0); moon.renderOrder = -2;
    dusk.add(moon);
    // A dead tree on the cliff edge.
    const tree = new THREE.Group();
    const bark = new THREE.MeshStandardMaterial({ color: 0x1a120e, roughness: 0.95 });
    const branch = (len, rad, depth) => {
      const g2 = new THREE.Group();
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.6, rad, len, 7).translate(0, len / 2, 0), bark);
      m.castShadow = true; g2.add(m);
      if (depth > 0) for (let j = 0; j < 2 + (depth > 1 ? 1 : 0); j++) {
        const c = branch(len * 0.68, rad * 0.62, depth - 1);
        c.position.y = len * (0.6 + j * 0.15);
        c.rotation.set(0.5 + j * 0.2, j * 2.2 + depth, (j % 2 ? 1 : -1) * 0.55);
        g2.add(c);
      }
      return g2;
    };
    tree.add(branch(2.6, 0.2, 3));
    tree.position.set(5.8, -0.3, -4.2); tree.rotation.z = -0.08;
    dusk.add(tree);

    const key = new THREE.DirectionalLight(0xffb48a, 2.2);
    key.position.set(-6, 10, 8);
    key.castShadow = game.q >= 1;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
    dusk.add(key);
    dusk.add(new THREE.HemisphereLight(0x6a5aa0, 0x1a1010, 0.7));

    this.SHOW = ['ar', 'sword', 'axe', 'pistol', 'shotgun', 'smg', 'dmr'];
    const CLS = [1, 3, 0, 4, 2, 0, 4];
    this.heroes = CHARACTERS.map((ch, i) => {
      const cls = CLASSES[CLS[i % CLS.length]];
      const a = -0.8 + (i / (CHARACTERS.length - 1)) * 1.6;
      const light = this.fx.holdLight({}, cls.accent, 2.2, 5);
      const hero = { mesh: null, ch, cls, baseCls: cls, show: this.SHOW[i % this.SHOW.length], light, skin: null, base: new THREE.Vector3(Math.sin(a) * 4.5, 0, Math.cos(a) * 4.5 - 3.6), baseRy: a * 0.5 };
      this.buildHero(hero, this.savedSkin(ch.id));
      if (light) light.position.set(hero.base.x + 0.9, 1.3, hero.base.z - 0.9); // element rim light from behind
      return hero;
    });
    this.vista = buildVista(this.fx, game.q);
    s.add(this.vista.group);
    try { upgradeVistaScan(this, game.q); } catch (e) { console.warn('vista scan failed', e); }
    try { setupLobbyBg(this, game.q); } catch (e) { console.warn('lobby bg failed', e); }
    const off0 = this.camera.aspect > 1.3 ? -2.9 : 0;
    this.camTarget = new THREE.Vector3(off0 + 10, 18, -62);
    this.camPos = new THREE.Vector3(off0 - 4, 13, 46);
    this.camera.position.copy(this.camPos);
    if (PAINT_HOME) {
      try {
        this.paint = new PaintScape(game.q);
        this.paintScene = new THREE.Scene();
        this.paintScene.add(this.paint.group);
        this.paintCam = new THREE.PerspectiveCamera(50, this.camera.aspect, 0.5, 4000);
      } catch (e) { console.warn('painted home failed', e); this.paint = null; }
    }
    this.setDay(true);
  }

  // True while the title shows the living painting (drawn by drawPaint instead of the normal render).
  get paintOn() { return !!this.paint && this.day && this.focusIdx < 0; }
  drawPaint(renderer) { this.paint.render(renderer, this.paintScene, this.paintCam, null); }

  // Title = the daylight valley (no characters); lobby = the dusk cliff with your character on it.
  setDay(day) {
    if (this.day === day) return;
    this.day = day;
    this.vista.group.visible = day;
    this.dusk.visible = !day;
    this.sky.material.uniforms.uDay.value = day ? 1 : 0;
    const fog = this.scene.fog;
    if (day) { fog.color.set(0xc6d6e4); fog.density = 0.0048; this.fx.setFog(0.0048); }
    else { fog.color.set(0x140c1c); fog.density = 0.028; this.fx.setFog(0.02); }
    for (const h of this.heroes) { if (day) h.mesh.visible = false; if (h.light) h.light.intensity = day ? 0 : 2.2; }
    this.fx.clearAll();
  }

  // Skin remembered for a character (the game owns the saved choice).
  savedSkin(chId) { return this.game.skinFor ? this.game.skinFor(chId) : DEFAULT_SKIN(chId); }

  // (Re)build a hero's model in a given skin, keeping its place on the cliff.
  buildHero(h, skin) {
    const cls = h.cls;
    const old = h.mesh;
    const m = makeCharacterModel(h.ch.id, () => makeHumanoid({ color: cls.color, accent: cls.accent }), skin);
    m.position.copy(old ? old.position : h.base);
    m.rotation.y = old ? old.rotation.y : h.baseRy;
    m.visible = old ? old.visible : true;
    m.userData.setWeapon(old && old.userData.rig ? old.userData.rig.weaponId : h.show);
    m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    if (old) this.scene.remove(old);
    this.scene.add(m);
    h.mesh = m; h.skin = skin;
  }

  onResize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); if (this.paintCam) this.paintCam.aspect = w / h; }

  focus(i) { this.focusIdx = i; }

  // Lobby view: null for the title (everyone on show), else the player's loadout.
  show(lo) {
    this._lo = lo;
    if (!lo) {
      this.focusIdx = -1;
      for (const h of this.heroes) { const sk = this.savedSkin(h.ch.id); if (h.skin !== sk) this.buildHero(h, sk); h.cls = h.baseCls; h.mesh.userData.setWeapon(h.show); h.mesh.visible = true; }
      this.setDay(true);
      return;
    }
    this.setDay(false);
    this.focusIdx = this.heroes.findIndex((h) => h.ch.id === lo.ch);
    const cls = CLASSES.find((c) => c.id === lo.c) || CLASSES[0];
    this.heroes.forEach((h, i) => {
      const me = i === this.focusIdx;
      const sk = me && lo.sk ? lo.sk : this.savedSkin(h.ch.id);
      if (h.skin !== sk) this.buildHero(h, sk);
      h.cls = me ? cls : h.baseCls;
      h.mesh.userData.setWeapon(me ? lo.w[0] || null : h.show);
      h.mesh.visible = me; // only your pick stands on the cliff in the lobby
      if (h.light) h.light.color.set(h.cls.accent);
    });
  }

  // Head-and-shoulders portraits of each character for the select cards.
  portraits(renderer) {
    if (this._portraits) return this._portraits;
    this._portraits = {};
    for (const h of this.heroes) this.portrait(renderer, h.ch.id);
    return this._portraits;
  }

  // One head-and-shoulders render (the character in whatever skin it currently wears) as a data URL.
  portrait(renderer, chId) {
    const W = 240, H = 300;
    if (!this._pcam) {
      this._pcam = new THREE.PerspectiveCamera(30, W / H, 0.05, 50);
      this._pcv = document.createElement('canvas'); this._pcv.width = W; this._pcv.height = H;
    }
    const cam = this._pcam, ctx = this._pcv.getContext('2d');
    const size = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio();
    const fog = this.scene.fog; this.scene.fog = null;
    const h = this.heroes.find((x) => x.ch.id === chId);
    this.heroes.forEach((o) => (o.mesh.visible = o === h));
    h.mesh.userData.setWeapon(h.show);
    for (let k = 0; k < 4; k++) h.mesh.userData.anim({ speed: 0, pitch: 0.05, gun: true }, 0.05, k);
    h.mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(h.mesh);
    const p = h.mesh.position, top = isFinite(box.max.y) ? box.max.y : p.y + (h.ch.height || 1.85); // a skinned part with no usable bounds (the ninja's gear) would otherwise aim the camera at NaN
    const fwd = new THREE.Vector3(Math.sin(h.mesh.rotation.y), 0, Math.cos(h.mesh.rotation.y));
    const look = new THREE.Vector3(p.x, top - 0.42, p.z);
    cam.position.copy(look).addScaledVector(fwd, 2.3).add(new THREE.Vector3(0, 0.12, 0));
    cam.position.addScaledVector(new THREE.Vector3(fwd.z, 0, -fwd.x), 0.35);
    cam.lookAt(look);
    // Plain black behind the character: no sky, no cliff, no valley; only the dusk lights stay on.
    const hidden = [this.sky, this.vista.group, ...this.dusk.children.filter((o) => !o.isLight)].map((o) => [o, o.visible]);
    for (const [o] of hidden) o.visible = false;
    const duskVis = this.dusk.visible; this.dusk.visible = true;
    const prevClear = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
    renderer.setClearColor(h.ch.portraitBg ?? 0x000000, 1); // dark-clad heroes (the ninja) need a lighter card backdrop to read
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.render(this.scene, cam);
    renderer.setClearColor(prevClear, prevA);
    for (const [o, v] of hidden) o.visible = v;
    this.dusk.visible = duskVis;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(renderer.domElement, 0, 0, W, H, 0, 0, W, H);
    const url = this._pcv.toDataURL('image/jpeg', 0.86);
    this.scene.fog = fog;
    renderer.setPixelRatio(pr);
    renderer.setSize(size.x, size.y, false);
    if (this._portraits) this._portraits[chId] = url;
    this.show(this._lo || null); // restore who is visible and holding what
    return url;
  }

  // Side-on studio renders of every weapon (transparent PNGs) for the wall.
  weaponShots(renderer) {
    if (this._wshots) return this._wshots;
    const W = 480, H = 192;
    const sc = new THREE.Scene();
    sc.environment = this.game.envTex; sc.environmentIntensity = 0.9;
    const k = new THREE.DirectionalLight(0xfff0e0, 2.6); k.position.set(2, 3, 2); sc.add(k);
    const f = new THREE.DirectionalLight(0x9ab0ff, 1.2); f.position.set(-2, 1, -1); sc.add(f);
    sc.add(new THREE.AmbientLight(0xffffff, 0.35));
    const cam = new THREE.OrthographicCamera(-1, 1, 0.4, -0.4, 0.01, 20);
    const size = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio();
    const prevClear = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
    const tm = renderer.toneMapping;
    renderer.setPixelRatio(1); renderer.setSize(W, H, false);
    const grab = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').drawImage(renderer.domElement, 0, 0, W, H, 0, 0, W, H); return c.getContext('2d').getImageData(0, 0, W, H); };
    const out = {};
    for (const w of WEAPONS) {
      const m = makeWeapon(w.id, { card: true });
      // Lay it on its side: barrel/blade to the right.
      const holder = new THREE.Group(); holder.add(m); sc.add(holder);
      m.rotation.set(0, Math.PI / 2, 0);
      if (m.userData.cardFlat) { m.quaternion.setFromAxisAngle(new THREE.Vector3(1, 1, 1).normalize(), (Math.PI * 2) / 3); holder.rotation.set(0.0, -0.3, 0.3); } // broad face to the camera, point up
      else if (m.userData.fist) { m.rotation.set(0, Math.PI / 2, 0); holder.rotation.set(0.6, -0.25, 0.1); } // blades to the right, top face tipped toward the camera so the stacked blades show
      else if (m.userData.cardTilt) holder.rotation.set(...m.userData.cardTilt); // tier-3 gear: each piece says how it sits
      else if (w.kind === 'melee') m.rotation.set(0, Math.PI / 2, -0.55);
      if (m.userData.cardRoll) holder.rotation.x = m.userData.cardRoll; // crossbow: tipped toward the camera so the limbs show
      holder.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(holder), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
      const half = Math.max(sz.x / 2 / 0.92, sz.y / 2 / 0.92 * (W / H));
      cam.left = -half; cam.right = half; cam.top = half * H / W; cam.bottom = -half * H / W; cam.updateProjectionMatrix();
      cam.position.set(c.x, c.y + 0.05 * half, c.z + 5); cam.lookAt(c.x, c.y, c.z);
      renderer.setClearColor(0x000000, 1); renderer.render(sc, cam); const b = grab();
      renderer.setClearColor(0xffffff, 1); renderer.render(sc, cam); const wht = grab();
      const res = new ImageData(W, H);
      for (let i = 0; i < b.data.length; i += 4) {
        const a = 1 - (wht.data[i + 1] - b.data[i + 1]) / 255;
        res.data[i + 3] = Math.max(0, Math.min(255, a * 255));
        for (let ch = 0; ch < 3; ch++) res.data[i + ch] = a > 0.01 ? Math.min(255, b.data[i + ch] / a) : 0;
      }
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.getContext('2d').putImageData(res, 0, 0);
      out[w.id] = cv.toDataURL('image/png');
      sc.remove(holder);
    }
    renderer.setClearColor(prevClear, prevA); renderer.toneMapping = tm;
    renderer.setPixelRatio(pr); renderer.setSize(size.x, size.y, false);
    this._wshots = out;
    return out;
  }

  aura(h, i, dt) {
    const fx = this.fx, p = h.mesh.position, c = h.cls.id;
    if (this.focusIdx >= 0 && this.focusIdx !== i) return;
    const R = () => Math.random() - 0.5;
    const sel = this.focusIdx === -1 || this.focusIdx === i;
    const k = sel ? 1 : 0.35;
    if (c === 'pyre') {
      if (Math.random() < 0.8 * k) fx.fire.emit({ p: [p.x + R() * 0.8, 0.1, p.z + R() * 0.8], v: [R() * 0.4, 1.6 + Math.random(), R() * 0.4], life: 0.7, s0: 0.7, s1: 0.15, c0: [1, 0.8, 0.45, 1], c1: [0.9, 0.2, 0.02, 0], turb: 3 });
      if (Math.random() < 0.3 * k) fx.spark.emit({ p: [p.x + R(), 0.5, p.z + R()], v: [R(), 2 + Math.random() * 2, R()], life: 1.5, s0: 0.08, s1: 0.03, c0: [1, 0.7, 0.3, 1], c1: [1, 0.2, 0, 0], turb: 3 });
    } else if (c === 'bastion') {
      if (Math.random() < 0.15 * k) fx.debris.emit({ p: [p.x + Math.cos(this.t * 2 + Math.random() * 6) * 0.9, 0.3 + Math.random() * 1.5, p.z + Math.sin(this.t * 2) * 0.9], v: [0, 0.4, 0], life: 1.5, s0: 0.2, s1: 0.1, c0: [1, 1, 1, 1], c1: [1, 1, 1, 1], rotV: 2 });
      if (Math.random() < 0.15 * k) fx.smoke.emit({ p: [p.x + R(), 0.1, p.z + R()], v: [R() * 0.5, 0.2, R() * 0.5], life: 2, s0: 0.6, s1: 1.6, c0: [0.55, 0.45, 0.35, 0.35], c1: [0.55, 0.45, 0.35, 0] });
    } else if (c === 'tempest') {
      if (Math.random() < 0.025 * k) {
        const a = [p.x + R() * 0.4, 1.3 + Math.random() * 0.6, p.z + R() * 0.4];
        fx.bolt(a, [a[0] + R() * 2, a[1] + R() * 1.6, a[2] + R() * 2], { width: 0.1, dur: 0.15, branches: 1 });
      }
      if (Math.random() < 0.5 * k) fx.glow.emit({ p: [p.x + R() * 1.2, 0.4 + Math.random() * 1.8, p.z + R() * 1.2], v: [0, 0.3, 0], life: 0.6, s0: 0.15, s1: 0.05, c0: [0.7, 0.8, 1, 1], c1: [0.4, 0.5, 1, 0] });
    } else if (c === 'rime') {
      if (Math.random() < 0.6 * k) fx.shard.emit({ p: [p.x + R() * 1.4, 0.2 + Math.random() * 2, p.z + R() * 1.4], v: [R() * 0.2, -0.2, R() * 0.2], life: 2, s0: 0.12, s1: 0.06, c0: [0.85, 0.95, 1, 1], c1: [0.6, 0.85, 1, 0], rotV: 2 });
      if (Math.random() < 0.2 * k) fx.glow.emit({ p: [p.x + R(), 0.15, p.z + R()], v: [R() * 0.3, 0.05, R() * 0.3], life: 2, s0: 1.4, s1: 2.2, c0: [0.6, 0.85, 1, 0.12], c1: [0.6, 0.85, 1, 0] });
    } else if (c === 'necro') {
      if (Math.random() < 0.5 * k) fx.glow.emit({ p: [p.x + R() * 1.4, 0.1, p.z + R() * 1.4], v: [0, 0.8 + Math.random(), 0], life: 1, s0: 0.3, s1: 0.06, c0: [0.4, 1, 0.55, 0.8], c1: [0.1, 0.7, 0.3, 0] });
      if (Math.random() < 0.2 * k) fx.smoke.emit({ p: [p.x + R(), 0.1, p.z + R()], v: [R() * 0.4, 0.3, R() * 0.4], life: 2, s0: 0.7, s1: 1.8, c0: [0.1, 0.22, 0.14, 0.35], c1: [0.15, 0.3, 0.2, 0] });
    } else if (c === 'gale') {
      if (Math.random() < 0.5 * k) {
        const a = this.t * 4 + Math.random() * 6, r = 0.9 + Math.random() * 0.3;
        fx.streak.emit({ p: [p.x + Math.cos(a) * r, 0.2 + Math.random() * 2, p.z + Math.sin(a) * r], v: [-Math.sin(a) * 4, 0.5, Math.cos(a) * 4], life: 0.4, s0: 0.6, s1: 0.2, c0: [0.85, 1, 0.95, 0.4], c1: [0.85, 1, 0.95, 0] });
      }
    }
  }

  update(dt, mouse) {
    this.t += dt;
    if (this.paintOn) {
      this.paint.update(this.t);
      const pm = (this._pm ||= { x: 0, y: 0 }), mx0 = mouse ? mouse[0] - 0.5 : 0, my0 = mouse ? mouse[1] - 0.5 : 0;
      pm.x += (mx0 - pm.x) * Math.min(1, dt * 2); pm.y += (-my0 - pm.y) * Math.min(1, dt * 2);
      this.paint.placeCamera(this.paintCam, this.t, pm);
      return;
    }
    if (this.day) { this.vista.update(dt, this.t); this.sky.material.uniforms.t.value = this.t; }
    else this.heroes.forEach((h, i) => {
      h.mesh.userData.anim({ speed: 0, pitch: 0.08, weapon: true }, dt, this.t + i);
      // The picked character turns to face the camera.
      const want = this.focusIdx === i ? Math.atan2(this.camPos.x - h.mesh.position.x, this.camPos.z - h.mesh.position.z) : h.baseRy;
      h.mesh.rotation.y += (want - h.mesh.rotation.y) * Math.min(1, dt * 3);
      this.aura(h, i, dt);
      if (h.light) h.light.intensity = this.focusIdx === i ? 1.3 : this.focusIdx === -1 ? 1.1 : 0.4; // steady, soft rim light: no flicker, no white glare
    });
    // Embers drifting over the cliff.
    if (!this.day && Math.random() < 0.4) this.fx.spark.emit({ p: [(Math.random() - 0.5) * 20, -2, (Math.random() - 0.5) * 10], v: [1, 1.5 + Math.random(), 0], life: 6, s0: 0.06, s1: 0.03, c0: [1, 0.6, 0.3, 1], c1: [1, 0.3, 0.1, 0], turb: 1.5 });
    const mx = mouse ? mouse[0] - 0.5 : 0, my = mouse ? mouse[1] - 0.5 : 0;
    let tp, tt;
    if (this.focusIdx >= 0) {
      const h = this.heroes[this.focusIdx].mesh.position;
      if (this.arc) {
        // Arcade select: close on the hero, framed a touch right of centre, in the gap between the abilities panel and the Weapon Wall.
        const side = this.camera.aspect > 1.3 ? -0.3 : 0;
        tt = new THREE.Vector3(h.x + side, 0.98, h.z);
        tp = new THREE.Vector3(h.x + side, 1.25, h.z + 3.5);
      } else {
        tt = new THREE.Vector3(h.x, 0.6, h.z);
        tp = new THREE.Vector3(h.x, 1.05, h.z + 5.3);
      }
    } else if (this.day) {
      // Title: the menu sits on the left, so the falls and the peaks are framed on the right. The camera drifts slowly.
      const off = this.camera.aspect > 1.3 ? -2.9 : 0;
      tt = new THREE.Vector3(off + 10 + Math.sin(this.t * 0.04) * 2, 18 + Math.sin(this.t * 0.06) * 0.8, -62);
      tp = new THREE.Vector3(off - 4 + Math.sin(this.t * 0.05) * 2, 13 + Math.sin(this.t * 0.07) * 0.5, 46);
    } else {
      const off = this.camera.aspect > 1.3 ? -2.9 : 0;
      tt = new THREE.Vector3(off, 1.2, -1.5);
      tp = new THREE.Vector3(off + Math.sin(this.t * 0.08) * 1.2, 2.4, 11.4);
    }
    tp.x += mx * 0.8; tp.y -= my * 0.4;
    this.camPos.lerp(tp, Math.min(1, dt * 2.5));
    this.camTarget.lerp(tt, Math.min(1, dt * 2.5));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
    this.fx.update(dt);
  }
}
