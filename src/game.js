// Game orchestrator: renderer, parties/lobby, the per-frame loop, networking
// sync, combat helpers, events, HUD feeding and round flow.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FX } from './fx.js';
import { Elements } from './elements.js';
import { World } from './world.js';
import { LocalPlayer, flashSize } from './player.js';
import { HostSim, THERMES } from './sim.js';
import { RemotePlayerView, MobView, BossView, DemonView, NpcView } from './views.js';
import * as Vault from './vault.js';
import { classWith } from './data.js';
import { CONFIG, CLASSES, CLASS_BY_ID, WEAPONS, WEAPON_BY_ID, BIOMES, BOSSES, NPCS, BLESSINGS, POWERUPS, ELEMENTS, CRATE_POOL, DUEL, DUEL_BIOMES, GRAV, HEAL, DUEL_PICKS, puInfo, levelOffer, rerollOffer, XP, MOB_TYPES, MOBS, stageIdx, bossIdx, seedFlags, MINI, ELITE, TIER, loadoutFull, zoneOf } from './data.js';
import { SoloParty, RoomParty, RoomLobby, BCParty, BCLobby, PeerParty, getRoom, makeCode, PeerSlotLobby } from './net.js';
import { Audio } from './audio.js';
import { MenuScene } from './menu.js';
import { kbLogical } from './controls.js';
import { setWeaponEnv, boltProto } from './weapons.js';
import { ScopeView, CAM_LEAD, scopeZoomFov, RETICLES } from './scope.js';
import { moveOf, samplePose } from './meleemoves.js';
import { launchArrow, longbowPick } from './longbow.js';
import { Governor } from './perf.js';
import { CHAR_BY_ID, CHARACTERS } from './characters.js';
import { validSkin, DEFAULT_SKIN, skinUnlocked, skinOf } from './skins.js';
import { mulberry32 } from './rng.js';
import { warmMobs, makeMobRig } from './mobrig.js';
import { PadInput, KeyPad, connectedPads } from './pad.js';
import { LocalParty, makeLocalHub } from './net.js';
import { Profile } from './profile.js';
import { AllyTags } from './allytags.js';
import { HealthPickups } from './pickups.js';
import { Unlocks, charUnlocked, gearUnlocked, speedUnlocked } from './unlocks.js';
import { installFog, SUN_OFFSET, buildComposer, applyBiomeLook, healNormals } from './look.js';
import { addPP, runReward } from './meta.js';
import { Bot } from './bot.js';
import { Dailies } from './dailies.js';
import { ChestFx } from './chest.js';
import { MutatorFx } from './mufx.js';
import { MU, MU_MASK, muList, muOn, JACKPOT, PINATA, NECRO, LOWGRAV, JACKPOT_EVERY, BULLET_TIME } from './mutators.js';

const QUALITY = { low: 0, medium: 1, high: 2 };
// Shared by both couch seats so they always run at the same speed.
const SPEED = { n: 1 };
const SPLIT_SCALE = 0.8; // starting resolution scale for each couch seat
const q10 = (v) => Math.round(v * 10);
// Settings are shared by the device; everything else (records, skins, last loadout) belongs to the signed-in profile.
const devKey = (k) => /settings$/.test(k);
const LS = {
  get(k, d) { try { const v = devKey(k) ? localStorage.getItem('perfectrun.' + k) : Profile.get('perfectrun.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { if (devKey(k)) localStorage.setItem('perfectrun.' + k, JSON.stringify(v)); else Profile.set('perfectrun.' + k, JSON.stringify(v)); } catch {} },
};

export class Game {
  // opts: { root (this seat's DOM), seat (1 | 2), pad (gamepad index | 'any' | null), spawnSeat (couch co-op) }
  constructor(canvas, UIClass, opts = {}) {
    this.canvas = canvas;
    this.opts = opts;
    this.UIClass = UIClass;
    this.seat = opts.seat || 1;
    this.root = opts.root || canvas.parentElement;
    this.keyboard = this.seat === 1;
    this.isBot = !!opts.bot; // the CPU opponent: a hidden second game that plays by itself
    this.headless = this.isBot;
    this.bot = null; this.brain = null; this.duelMode = false; this.autoplay = false;
    this.pad = opts.pad === 'kb' ? new KeyPad() : new PadInput(opts.pad === undefined ? 'any' : opts.pad);
    this.hitSrc = new Map();
    this.hitInfo = new Map(); // mob id -> { head, wk } of the player's last hit on it, for the Daily Challenges
    this.settings = Object.assign({ quality: 'high', sens: 1, vol: 0.6, name: this.seat === 2 ? 'Player 2' : 'Runner' + Math.floor(Math.random() * 900 + 100), fps: false, roundLen: 10, hard: false, speed: 1, view: 'third', layout: 'ds', sensAds: 1, invertY: false, music: true, musicVol: 1, sfx: true, fov: 70, shake: true, dmgNums: true, mu: 0 }, LS.get(this.lsKey('settings'), {}));
    if (this.seat === 1 && !this.isBot && Profile.playName()) this.settings.name = Profile.playName(); // signed-in players play under their profile name
    this.settings.roundLen = this.settings.roundLen === 0 ? 0 : 10; // 10-minute rounds, or 0 = Endless (Nutty 2026-11-05)
    if (this.isBot) Object.assign(this.settings, { name: 'CPU', vol: 0, view: 'first' });
    // Couch co-op runs two full renderers on one screen: each seat is capped at medium quality and
    // starts at a lower resolution scale that the adaptive logic in trackPerf raises when there is headroom.
    this.split = document.body.classList.contains('split');
    this.q = Math.min(QUALITY[this.settings.quality] ?? 2, this.split ? 1 : 2);
    this.pixelScale = this.split ? SPLIT_SCALE : 1;
    if (this.isBot) this.q = 0; // never drawn, so no effects budget
    this.menuFlip = this.seat === 2; // the two seats draw their menu backdrops on alternate frames
    this.now = 0;
    this.mode = 'menu';
    this.audio = new Audio();
    this.applySettings();
    this.initRenderer();
    this.initScene();
    this.input = { keys: new Set(), pressed: new Set(), dx: 0, dy: 0, mouseDown: false, mouseClicked: false, rightClicked: false, aimHeld: false, wheel: 0 };
    this.initInput();
    this.menu = new MenuScene(this);
    for (const ms of [1500, 5000, 12000]) setTimeout(() => { try { if (this.menu && this.menu.scene) healNormals(this.menu.scene); } catch {} }, ms);
    this.ui = new UIClass(this);
    this.allyTags = new AllyTags(this);
    this.pickups = new HealthPickups(this);
    this.chests = new ChestFx(this);
    if (!this.isBot) this.gov = new Governor(this); // holds 60+ fps by stepping quality tiers (perf.js)
    this.onResize();
    this.records = LS.get('records', { runs: 0, wins: 0, bestRound: 0, bestKills: 0, totalKills: 0 });
    this.views = { players: new Map(), mobs: new Map(), npcs: new Map(), boss: null, demon: null, dying: [] };
    this.hits = []; this.hitSeq = 0;
    this.reqs = []; this.reqSeq = 0;
    this.fxOut = []; this.fxSeq = 0;
    this.lastEv = 0; this.epoch = null;
    this.remoteFxSeen = new Map();
    this.timers = [];
    this.shakeAmt = 0;
    this.frameTimes = [];
    this.aim = { origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), point: new THREE.Vector3() };
    this.transport = null;
    this.detectTransport();
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------- setup ----------------
  initRenderer() {
    installFog();
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: this.q >= 1, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, this.q === 2 ? 1.75 : this.q === 1 ? 1.25 : 0.85));
    r.setSize(this.vw(), this.vh(), false); // false: CSS keeps the canvas at 100%, so it fills any later window size
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.1;
    r.shadowMap.enabled = this.q >= 1;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;
    this.basePixelRatio = r.getPixelRatio();
    if (this.pixelScale !== 1) r.setPixelRatio(this.basePixelRatio * this.pixelScale);
    const pm = new THREE.PMREMGenerator(r);
    this.envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.resizeHandler = () => this.onResize();
    setWeaponEnv(this.envTex);
    window.addEventListener('resize', this.resizeHandler);
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = 0.35;
    this.camera = new THREE.PerspectiveCamera(70, this.vw() / this.vh(), 0.1, 1500);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = this.q >= 1;
    const sz = this.q === 2 ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sz, sz);
    const sc = this.sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 200;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    this.scene.add(this.hemi);
    this.scene.fog = new THREE.FogExp2(0x333344, 0.012);
    this.fx = new FX(this.scene, this.camera, this.q);
    this.muFx = new MutatorFx(this);
    this.el = new Elements(this.fx, this.scene);
    this.el.block = (x, z, r, top, sec) => { if (this.world) this.world.addTemp(x, z, r, top, sec); };
    this.el.solid = (x, y, z) => !!this.world && this.world.solidPoint(x, y, z); // enemy shots and element projectiles stop at props
    this.setupComposer();
    this.onResize();
  }

  setupComposer() {
    if (this.q === 0) { this.composer = null; return; }
    // Scene target is multisampled and a grade pass (vignette, saturation) runs before tone mapping: see look.js.
    this.composer = buildComposer(this, { EffectComposer, RenderPass, UnrealBloomPass });
  }

  onResize() {
    const w = this.vw(), h = this.vh();
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setSize(w, h);
      const pr = this.renderer.getPixelRatio(), dv = (this.gov && this.gov.bloomDiv) || 2;
      if (this.bloom) this.bloom.setSize((w * pr * 2) / dv, (h * pr * 2) / dv); // bloom's first mip works at 1/dv of the screen
    }
    if (this.menu) this.menu.onResize(w, h);
    const px = (h * this.renderer.getPixelRatio()) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.fx.setScale(px);
    if (this.menu) this.menu.fx.setScale(px);
    if (this.ui && this.ui.fitScreen) requestAnimationFrame(() => this.ui.fitScreen());
  }

  lsKey(k) { return this.isBot ? 'bot.' + k : this.seat === 2 ? 'p2.' + k : k; }
  vw() { return this.root.clientWidth || window.innerWidth; }
  vh() { return this.root.clientHeight || window.innerHeight; }
  // Gameplay input counts as live with the mouse locked, or a controller in use.
  // The couch's second seat has no pointer to lock: it stays live until its own menu button is pressed,
  // instead of popping a menu over half the screen whenever the controller sits idle for a few seconds.
  inputLive() { return !!this.brain || document.pointerLockElement === this.canvas || (this.seat === 2 ? !this.padPaused : this.pad.active && !this.padPaused); }

  // While the Settings screen is open (draft), changes are tried out live but only stored by its Save button.
  saveSettings(force) {
    if (this.draft && !force) this.draftDirty = true;
    else { LS.set(this.lsKey('settings'), this.settings); if (this.ui && !this.draft) this.ui.setSaved = null; }
    this.applySettings();
  }
  storeSettings(obj) { LS.set(this.lsKey('settings'), obj || this.settings); }
  // Switch graphics quality on the spot: shadows, bloom and anti-aliasing, effects budget, resolution and the
  // frame-rate governor's ceiling all change without a reload. A stage already built keeps its terrain and prop
  // detail until the next round is built.
  setQuality(name) {
    if (name) this.settings.quality = name;
    const q = this.isBot ? 0 : Math.min(QUALITY[this.settings.quality] ?? 2, this.split ? 1 : 2);
    if (q === this.q) return false;
    this.q = q;
    const r = this.renderer, sh = q >= 1;
    r.shadowMap.enabled = sh;
    this.sun.castShadow = sh;
    const sz = q === 2 ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sz, sz);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    r.shadowMap.needsUpdate = true;
    try { if (this.composer) this.composer.dispose(); } catch {}
    this.composer = null; this.bloom = null;
    this.setupComposer();
    this.fx.q = q;
    if (this.world) this.world.quality = q;
    const scenes = [this.scene];
    if (this.menu) {
      this.menu.fx.q = q;
      if (this.menu.scene) scenes.push(this.menu.scene);
      for (const sc of scenes) sc.traverse((o) => { if (o.isDirectionalLight && o !== this.sun && o.shadow && o.userData.wasCaster === undefined) o.userData.wasCaster = true; });
      if (this.menu.scene) this.menu.scene.traverse((o) => { if (o.isDirectionalLight && o.userData.wasCaster) o.castShadow = sh; });
    }
    for (const sc of scenes) sc.traverse((o) => { const m = o.material; if (!m) return; if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true)); else m.needsUpdate = true; });
    if (this.gov) { this.gov.bloomDiv = undefined; this.gov.samples = []; this.gov.winT = 0; this.gov.apply(this.gov.startTier()); }
    else { this.basePixelRatio = Math.min(window.devicePixelRatio, q === 2 ? 1.75 : q === 1 ? 1.25 : 0.85); r.setPixelRatio(this.basePixelRatio * this.pixelScale); }
    try { if (this.world && this.world.biome) applyBiomeLook(this, this.world.biome); } catch {}
    this.onResize();
    return true;
  }
  // Everything in Settings that takes effect at once (graphics quality goes through setQuality).
  applySettings() {
    const S = this.settings;
    this.audio.setVolume(this.seat === 2 ? 0 : S.vol);
    this.audio.setMusicVolume(S.music === false ? 0 : S.musicVol ?? 1);
    this.audio.sfxOn = S.sfx !== false;
    if (this.ui && this.ui.refreshHints) this.ui.refreshHints(); // button labels everywhere follow the layout
  }

  // A controller that plugs in names its layout for the prompts, until the player picks one in Settings.
  detectLayout(pad) {
    const S = this.settings;
    if (S.layoutChosen || !pad) return;
    const id = String(pad.id || '').toLowerCase();
    const L = /045e|xbox|xinput|microsoft/.test(id) ? 'xbox' : /054c|sony|dualshock|dualsense|playstation|wireless controller/.test(id) ? 'ds' : null;
    if (L && L !== S.layout) { S.layout = L; this.saveSettings(); this.applySettings(); if (this.ui) this.ui.toast((L === 'ds' ? 'PlayStation' : 'Xbox') + ' controller detected: prompts now show its buttons', ''); }
  }

  initInput() {
    const I = this.input;
    window.addEventListener('gamepadconnected', (e) => this.detectLayout(e.gamepad));
    for (const pd of connectedPads()) this.detectLayout(pd);
    if (!this.keyboard) return; // the second couch seat plays on a controller only
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (this.couch && this.couch.pad.reserved && this.couch.pad.reserved.has(e.code)) return; // player 2's keyboard keys
      if (e.code === 'F11' || (e.code === 'Enter' && e.altKey)) { e.preventDefault(); this.ui.toggleFullscreen(); return; }
      const code = this.mode === 'game' ? kbLogical(e.code) : e.code; // the player's remapped keys (Controls screen)
      if (code === 'Tab') { e.preventDefault(); if (this.mode === 'game') this.toggleShop(); return; }
      if (!I.keys.has(code)) I.pressed.add(code);
      I.keys.add(code);
      if (this.mode === 'game' && ['Space', 'KeyQ', 'KeyF'].includes(code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { I.keys.delete(e.code); I.keys.delete(kbLogical(e.code)); });
    window.addEventListener('blur', () => { I.keys.clear(); I.mouseDown = false; });
    document.addEventListener('mousemove', (e) => {
      // Chrome sometimes reports a huge jump on the first event after locking; drop it.
      if (document.pointerLockElement === this.canvas && Math.abs(e.movementX) < 250 && Math.abs(e.movementY) < 250) { I.dx += e.movementX; I.dy += e.movementY; }
      this.menuMouse = [e.clientX / window.innerWidth, e.clientY / window.innerHeight];
    });
    this.canvas.addEventListener('mousedown', (e) => {
      this.audio.unlock();
      if (this.mode !== 'game') return;
      if (document.pointerLockElement !== this.canvas) { this.lockPointer(); return; }
      if (e.button === 0) { I.mouseDown = true; I.mouseClicked = true; }
      if (e.button === 2) { I.rightClicked = true; I.aimHeld = true; }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) I.mouseDown = false; if (e.button === 2) I.aimHeld = false; });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => { if (this.mode === 'game' && document.pointerLockElement === this.canvas) I.wheel = Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      if (this.mode === 'game') this.ui.setLocked(locked, this.shopOpen || this.blessOpen || this.elemOpen);
      if (!locked) { I.mouseDown = false; I.aimHeld = false; }
    });
    window.addEventListener('pointerdown', () => this.audio.unlock(), { once: false });
  }

  unlockPointer() { if (document.pointerLockElement === this.canvas) document.exitPointerLock(); }

  lockPointer() {
    this.padPaused = false;
    if (this.brain) { if (this.mode === 'game') this.ui.setLocked(true, false); return; } // the CPU plays: the mouse stays free
    if (!this.keyboard || this.pad.active) { if (this.mode === 'game') this.ui.setLocked(true, this.shopOpen || this.blessOpen || this.elemOpen); return; }
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch {} });
    } catch { try { this.canvas.requestPointerLock(); } catch {} }
  }

  // ---------------- transports and parties ----------------
  async detectTransport() {
    const params = new URLSearchParams(location.search);
    if (params.get('net') === 'bc') { this.transport = 'bc'; this.lobby = new BCLobby(); }
    else {
      const room = await getRoom();
      if (room) { this.transport = 'room'; this.room = room; this.lobby = new RoomLobby(room); }
      else { this.transport = 'peer'; this.lobby = new PeerSlotLobby(); }
    }
    if (this.lobby) this.lobby.onChange(() => this.ui.refreshPartyList());
    this.ui.refreshPartyList();
    const code = params.get('party');
    if (code && this.mode === 'menu') this.ui.autoJoin(code.toUpperCase());
  }

  get myName() { return String(this.settings.name || 'Runner').slice(0, 16); }

  async playSolo() {
    this.party = new SoloParty();
    this.isHost = true;
    this.partyCode = null;
    this.enterLobby();
  }

  // Duel Arena against the CPU: a hidden second game joins the party, picks its own fighter and plays by itself.
  playDuelBot() {
    if (!this.opts.spawnSeat || this.bot) return;
    const hub = makeLocalHub();
    this.party = new LocalParty(hub, 'p1');
    this.isHost = true;
    this.partyCode = null;
    this.duelMode = true;
    this.bot = this.opts.spawnSeat(hub, null, () => {}, { bot: true, host: this });
    this.enterLobby();
  }

  // Duel versus the CPU: after picking their own fighter the player picks the CPU's. While that is going on, the
  // lobby edits a stand-in loadout (the CPU's), and the player's own picks wait here.
  cpuPickBegin() {
    const b = this.bot;
    if (!b || this._cpuPick) return;
    this._cpuPick = { lo: { ...this.loadout, w: [...this.loadout.w] }, skins: LS.get(this.lsKey('skins'), {}) };
    const bl = b.loadout;
    this.loadout = { ch: bl.ch, sk: bl.sk, c: bl.c, w: [...bl.w] };
    this.party.set({ ch: this.loadout.ch, sk: this.loadout.sk, c: this.loadout.c, wp: this.loadout.w });
    this.menu.show(this.loadout);
  }
  cpuPickEnd(apply) {
    const st = this._cpuPick;
    if (!st) return;
    this._cpuPick = null;
    const b = this.bot, cl = this.loadout;
    if (apply && b) {
      b.loadout = { ch: cl.ch, sk: cl.sk, c: cl.c, w: [...cl.w] };
      b.party.set({ ch: cl.ch, sk: cl.sk, c: cl.c, wp: b.loadout.w });
    }
    LS.set(this.lsKey('skins'), st.skins);
    this.loadout = st.lo;
    LS.set(this.lsKey('loadout'), { ch: this.loadout.ch, c: this.loadout.c, w: this.loadout.w });
    if (this.party) this.party.set({ ch: this.loadout.ch, sk: this.loadout.sk, c: this.loadout.c, wp: this.loadout.w });
    this.menu.show(this.loadout);
  }

  endBot() {
    if (!this.bot) return;
    const b = this.bot; this.bot = null;
    b.destroy();
  }

  // Customize (Element page): the element this player has picked, with their own three cooldowns in its slots. Remembered per element.
  myClass() {
    if (this.isBot) return CLASS_BY_ID[this.loadout.c];
    if (!this.abPicks) this.abPicks = LS.get(this.lsKey('abils'), {}) || {};
    return classWith(this.loadout.c, this.abPicks[this.loadout.c]);
  }
  // Put cooldown `id` in slot k ('q' | 'r' | 'e'). Refused when it is already in one of the three: no doubles.
  setAbility(k, id) {
    const c = this.myClass(), cur = { q: c.q.id, r: c.r.id, e: c.e.id };
    if (!(k in cur) || !c.pool.some((a) => a.id === id) || Object.values(cur).includes(id)) return false;
    cur[k] = id;
    this.abPicks[c.id] = [cur.q, cur.r, cur.e];
    LS.set(this.lsKey('abils'), this.abPicks);
    return true;
  }
  // Healing Rain over `c`: everyone sees the storm; each runner standing under it mends themselves (6% of full health a second). toxic(): the caster's rain hurts enemies.
  healRain(c, heals, toxic) {
    Vault.rain(this, c, 7, 12, () => {
      const p = this.player;
      if (toxic) toxic();
      if (!heals || !p || !p.alive || Math.hypot(p.pos.x - c[0], p.pos.z - c[2]) > 12.5) return;
      p.heal(p.stats.maxHp * 0.015);
      Vault.healSpark(this, [p.pos.x, p.pos.y, p.pos.z]);
    });
  }

  // Local Co-op has no setup screen: it goes straight to the select. Player 2's half opens by itself the moment a controller is free for them:
  // a second controller, or the only controller while player 1 is on keyboard and mouse. Until then player 1 picks alone.
  autoCouchDev() {
    const pads = connectedPads();
    if (pads.length >= 2) { const mine = this.pad.active && typeof this.pad.lastIdx === 'number' ? pads.find((p) => p.index === this.pad.lastIdx) : null, p1 = mine || pads[0]; return { p1: p1.index, p2: pads.find((p) => p !== p1).index }; }
    if (pads.length === 1 && !this.pad.active) return { p1: null, p2: pads[0].index };
    return null;
  }
  startLocal() {
    const dev = this.autoCouchDev();
    if (dev) { this.startCouch(dev); return; }
    this.playSolo(); this.couchWait = true;
    this.ui.renderLobby();
    this.ui.toast('Player 2: press any button on a second controller to join', '');
  }
  couchWaitTick() {
    if (!this.couchWait || this.mode !== 'lobby' || this.couch) return;
    const dev = this.autoCouchDev();
    if (!dev) return;
    const lo = { ...this.loadout, w: [...this.loadout.w] }, duel = this.duelMode, step = this.ui.flipStep;
    this.leaveParty();
    this.duelMode = duel;
    this.startCouch(dev);
    this.setLoadout(lo); this.ui.flipStep = step; this.ui.renderLobby();
    this.ui.toast('Player 2 joined', 'good');
  }

  // Couch co-op: this seat hosts, a second seat opens on the right half of the screen.
  // dev = { p1: pad index or null (player 1 also plays on that controller), p2: pad index or 'kb' }.
  startCouch(dev) {
    if (!this.opts.spawnSeat || this.couch) return;
    if (!dev) {
      const pads = connectedPads();
      dev = pads.length >= 2 ? { p1: pads[0].index, p2: pads[1].index } : pads.length ? { p1: null, p2: pads[0].index } : { p1: null, p2: 'kb' };
    }
    this.pad.which = dev.p1 == null ? null : dev.p1;
    const hub = makeLocalHub();
    this.party = new LocalParty(hub, 'p1');
    this.isHost = true;
    this.partyCode = null;
    this.devLabel = dev.p1 == null ? 'Keyboard + Mouse' : 'Controller 1 or Keyboard + Mouse';
    this.setSeatTag();
    document.body.classList.add('split');
    this.setSplit(true);
    // If player 2 leaves, couch co-op ends for both seats.
    const label = dev.p2 === 'kb' ? 'Keyboard (arrows)' : 'Controller';
    this.couch = this.opts.spawnSeat(hub, dev.p2, () => this.couchSeatLeft(), { host: this, label });
    this.enterLobby();
  }

  // Player 2 chose to leave. In a run, player 1 simply carries on full screen and solo. In the lobby the pair is
  // split up, so we go back to the title.
  couchSeatLeft() {
    if (!this.couch) return;
    if (this.mode === 'game') {
      setTimeout(() => {
        if (!this.couch) return;
        this.endCouch();
        if (this.party) this.party.kind = 'solo';
        this.setSeatTag();
        this.ui.toast('Player 2 left. Carrying on solo.', '');
      }, 0);
    } else setTimeout(() => { this.leaveParty(); this.ui.toast('Couch co-op ended', ''); }, 0);
  }

  // Which controls list matches this seat's device: 'p1' keyboard + mouse, 'pad' controller, 'kb' keyboard half.
  padKind() { return this.pad instanceof KeyPad ? 'kb' : this.seat === 2 ? 'pad' : 'p1'; }

  // True when player 2's controller has been unplugged (seen from either seat).
  padLost() {
    const g2 = this.seat === 2 ? this : this.couch;
    const w = g2 && g2.pad.which;
    return typeof w === 'number' && !connectedPads().some((p) => p.index === w);
  }

  // The coloured tab at the top of each half: seat, name and input device.
  setSeatTag() {
    const el = this.root.querySelector('.seat-tag');
    if (!el) return;
    el.innerHTML = '<b>PLAYER ' + this.seat + '</b><span></span>';
    el.lastChild.textContent = ' · ' + this.myName + (this.devLabel ? ' · ' + this.devLabel : '');
  }

  endCouch() {
    if (!this.couch) return;
    const c = this.couch; this.couch = null;
    c.destroy();
    document.body.classList.remove('split');
    this.pad.which = 'any';
    this.devLabel = '';
    this.setSplit(false);
  }

  // Switch this seat between full-screen and split-screen cost: medium quality cap, lower starting resolution.
  setSplit(on) {
    this.split = on;
    const q = Math.min(QUALITY[this.settings.quality] ?? 2, on ? 1 : 2);
    if (q !== this.q) {
      this.q = q;
      const sz = q === 2 ? 2048 : 1024;
      this.sun.shadow.mapSize.set(sz, sz);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.basePixelRatio = Math.min(window.devicePixelRatio, q === 2 ? 1.75 : q === 1 ? 1.25 : 0.85);
    this.pixelScale = on ? SPLIT_SCALE : 1;
    this.frameTimes = [];
    this.renderer.setPixelRatio(this.basePixelRatio * this.pixelScale);
    this.onResize();
    if (this.gov) this.gov.apply(this.gov.startTier());
  }

  // Tear down a seat completely (used for the second couch seat).
  destroy() {
    this.brain = null;
    this.renderer.setAnimationLoop(null);
    clearInterval(this.lobbyTimer);
    window.removeEventListener('resize', this.resizeHandler);
    try { if (this.party) this.party.leave(); } catch {}
    try { this.ui.dispose(); } catch {}
    try { if (this.pad.dispose) this.pad.dispose(); } catch {}
    try { if (this.composer) this.composer.dispose(); } catch {}
    try { if (this.skyEnv) this.skyEnv.dispose(); } catch {}
    this.renderer.dispose();
    try { this.renderer.forceContextLoss(); } catch {}
    this.root.remove();
  }

  joinLocal(hub) {
    this.party = new LocalParty(hub, 'p2');
    this.isHost = false;
    this.partyCode = null;
    this.enterLobby();
  }

  async createParty(pub = true) {
    this.partyPublic = pub !== false;
    const code = makeCode();
    this.partyCode = code;
    this.isHost = true;
    if (this.transport === 'room') this.party = await RoomParty.create(this.room, code);
    else if (this.transport === 'bc') this.party = new BCParty(code);
    else this.party = await PeerParty.create(code, true);
    this.enterLobby();
  }

  async joinParty(code) {
    code = code.trim().toUpperCase();
    this.partyCode = code;
    this.isHost = false;
    if (this.transport === 'room') this.party = await RoomParty.create(this.room, code);
    else if (this.transport === 'bc') this.party = new BCParty(code);
    else this.party = await PeerParty.create(code, false);
    this.enterLobby();
  }

  enterLobby() {
    this.mode = 'lobby';
    if (this.seat !== 2) this.audio.startLobbyMusic();
    const prev = LS.get(this.lsKey('loadout'), {});
    // Character and element carry over; the weapon wall always starts empty.
    // The second couch seat starts on a different character and element so the two players look different on screen.
    const dflt = this.seat === 2 ? { ch: 'nyx', c: 'tempest' } : { ch: 'veteran', c: 'pyre' };
    this.loadout = { ch: CHAR_BY_ID[prev.ch] && charUnlocked(prev.ch) ? prev.ch : dflt.ch, c: CLASS_BY_ID[prev.c] ? prev.c : dflt.c, w: [] };
    this.loadout.sk = this.skinFor(this.loadout.ch);
    this.lobbyStep = 1;
    this.ready = false;
    this.cdAt = null;
    if (this.isBot) this.botLoadout();
    this.party.set({ jt: this.party.mine.jt || Date.now(), n: this.myName, ch: this.loadout.ch, sk: this.loadout.sk, c: this.loadout.c, wp: this.loadout.w, rdy: this.isBot ? 1 : 0, cd: 0, host: this.isHost ? 1 : 0, ig: 0 });
    if (this.isHost) this.party.set({ lb: this.lbInfo() });
    if (this.isHost && !this.sim) this.sim = new HostSim(this);
    if (this.isHost) this.sim.phase = 'lobby';
    this.ui.showLobby();
    this.menu.show(this.loadout);
    if (!this.lobbyHooked) { this.lobbyHooked = true; this.party.onChange(() => { if (this.mode === 'lobby') this.ui.renderLobby(); }); }
    this.lobbyTimer = setInterval(() => {
      if (this.mode === 'lobby') { this.couchWaitTick(); this.duelVoteTick(); if (this.mode === 'lobby') this.ui.renderLobby(); }
      if (this.isHost && this.lobby && this.partyCode) {
        const n = this.party.peers().length;
        // Private parties are never listed: friends join with the invite link or the code.
        this.lobby.advertise(this.mode === 'lobby' && this.partyPublic !== false ? { code: this.partyCode, host: this.myName, n, dm: this.duelMode ? 1 : 0, pub: 1 } : null);
      }
    }, 500);
  }

  // The CPU opponent picks a random character, element, a gun, a blade and a piece of tier-3 gear.
  botLoadout() {
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const lo = this.loadout;
    lo.ch = pick(CHARACTERS).id;
    lo.sk = this.skinFor(lo.ch);
    lo.c = pick(CLASSES).id;
    lo.w = [pick(WEAPONS.filter((w) => TIER(w) === 2)).id, pick(WEAPONS.filter((w) => TIER(w) === 1)).id, pick(WEAPONS.filter((w) => TIER(w) === 3)).id];
    this.ready = true;
  }

  // Skins are remembered per character (localStorage 'skins': { characterId: skinId }).
  skinFor(ch) {
    const saved = LS.get(this.lsKey('skins'), {})[ch];
    return validSkin(ch, saved) && skinUnlocked(ch, skinOf(ch, saved)) ? saved : DEFAULT_SKIN(ch);
  }

  setLoadout(patch) {
    patch = { ...patch };
    if (patch.ch && !charUnlocked(patch.ch)) delete patch.ch; // a locked character can never be picked
    if (patch.w) patch.w = patch.w.filter((id) => gearUnlocked(id)); // nor locked gear
    if (patch.sk != null) {
      const ch = patch.ch || this.loadout.ch;
      if (!validSkin(ch, patch.sk)) delete patch.sk;
      else { const m = LS.get(this.lsKey('skins'), {}); m[ch] = patch.sk; LS.set(this.lsKey('skins'), m); }
    }
    if (patch.ch && patch.sk == null) patch.sk = this.skinFor(patch.ch); // switching character: use that character's remembered skin
    Object.assign(this.loadout, patch);
    LS.set(this.lsKey('loadout'), { ch: this.loadout.ch, c: this.loadout.c, w: this.loadout.w });
    this.party.set({ ch: this.loadout.ch, sk: this.loadout.sk, c: this.loadout.c, wp: this.loadout.w });
    if (this.ready && (patch.w || (this.party.kind === 'local' && (patch.ch || patch.c || patch.sk)))) this.setReady(false);
    this.menu.show(this.loadout);
  }

  setReady(r) { this.ready = r; this.party.set({ rdy: r ? 1 : 0 }); }

  lbInfo() { return { code: this.partyCode, rl: this.settings.roundLen, dm: this.duelMode ? 1 : 0, hd: this.settings.hard ? 1 : 0, pub: this.partyPublic === false ? 0 : 1, mu: this.settings.mu & MU_MASK }; }
  setPublic(on) { this.partyPublic = !!on; if (this.isHost && this.party) this.party.set({ lb: this.lbInfo() }); }

  // Quickplay: join a random open public party (co-op first, not full); if none is open, host a public one for others to find.
  async quickplay() {
    if (this.lobby && this.lobby.scan) await this.lobby.scan();
    const open = (this.lobby ? this.lobby.parties() : []).filter((p) => !p.me && p.code && p.pub !== 0 && (p.n || 1) < 5);
    const coop = open.filter((p) => !p.dm);
    const pool = coop.length ? coop : open;
    if (pool.length) { const p = pool[Math.floor(Math.random() * pool.length)]; await this.joinParty(p.code); return 'joined'; }
    this.duelMode = false;
    await this.createParty(true);
    return 'created';
  }
  setMu(mask) { this.settings.mu = mask & MU_MASK; this.saveSettings(); if (this.isHost && this.party) this.party.set({ lb: this.lbInfo() }); }
  setHard(on) { this.settings.hard = !!on; this.saveSettings(); if (this.isHost && this.party) this.party.set({ lb: this.lbInfo() }); }
  setDuelMode(on) {
    this.duelMode = !!on;
    if (this.isHost && this.party) this.party.set({ lb: this.lbInfo() });
  }

  setRoundLen(min) {
    this.settings.roundLen = +min === 0 ? 0 : 10; // 10 minutes, or 0 = Endless: the round ends when the altar is used
    this.saveSettings();
    this.party.set({ lb: this.lbInfo() });
  }

  leaveParty() {
    if (this.seat === 2 && this.opts.onLeave) { this.opts.onLeave(); return; }
    this.couchWait = false;
    if (this._cpuPick) this.cpuPickEnd(false);
    this._dv = null;
    if (this.couch) this.endCouch();
    if (this.bot) this.endBot();
    clearInterval(this.lobbyTimer);
    if (this.lobby && this.isHost) this.lobby.advertise(null);
    if (this.party) this.party.leave();
    this.party = null;
    this.sim = null;
    this.isHost = false;
    this.lobbyHooked = false;
    this.myW = this.lastW = this.syncedW = null; this.snapT = 0;
    this.brain = null;
    this.teardownGame();
    this.mode = 'menu';
    this.menu.show(null);
    this.ui.showTitle();
  }

  lobbyMembers() {
    if (!this.party) return [];
    return this.party.peers().filter((p) => p.p && p.p.n).slice(0, CONFIG.maxPlayers);
  }

  hostPeer(peers) {
    const hs = peers.filter((p) => p.p && p.p.host);
    if (!hs.length) return null;
    hs.sort((a, b) => (a.id < b.id ? -1 : 1));
    return hs[0];
  }

  startRun() {
    if (!this.isHost) return;
    if (this.duelMode) {
      const n = this.lobbyMembers().length;
      if (n !== 2) { this.ui.toast(n < 2 ? 'A duel needs a second fighter' : 'A duel is for exactly two players', 'bad'); return; }
      if (this._dv) return; // the stage vote is already open
      if (!this.bot) { this.duelVoteOpen(); return; } // two players: both pick a stage first
      this.sim.startDuel(this.duelStage ?? -1); // versus the CPU: the stage was picked before the fighters
    } else this.sim.startRun(this.settings.roundLen === 0 ? 0 : 10 * 60, { space: Unlocks.has('space'), hard: !!this.settings.hard, mu: this.settings.mu & MU_MASK });
    this.sim.lastPlayers = this.lobbyMembers().map((p) => ({ id: p.id }));
    const k = this.party && this.party.kind;
    SPEED.n = 1; // every run starts at normal speed; T or D-pad down cycles it once Game speed is unlocked
    this.party.set({ w: this.sim.snapshot() });
  }

  // ---------------- Duel stage vote (two players, couch or online) ----------------
  // The host opens the vote in its presence ('dv'); each player answers with 'ds' (arena index) tagged with the
  // vote's id ('dsi'). Same pick: straight in. Different picks: the host draws one of the two and every screen
  // plays the spinner before the match starts.
  duelVoteOpen() {
    this._dv = { id: Date.now() };
    this.party.set({ dv: { id: this._dv.id }, ds: -1, dsi: this._dv.id });
    this.ui.renderLobby();
  }
  duelVoteCancel() {
    if (!this._dv) return;
    this._dv = null;
    if (this.party) this.party.set({ dv: 0 });
  }
  duelPick(i) {
    if (!this.party) return;
    const host = this.hostPeer(this.party.peers()), dv = host && host.p.dv;
    if (!dv || dv.r) return;
    this.party.set({ ds: i | 0, dsi: dv.id });
  }
  duelVoteTick() {
    const v = this._dv;
    if (!v || !this.isHost) return;
    if (this.mode !== 'lobby') { this._dv = null; return; }
    const ms = this.lobbyMembers();
    if (ms.length !== 2) { this.duelVoteCancel(); return; }
    if (!v.r) {
      const pk = ms.map((m) => (m.p.dsi === v.id && m.p.ds >= 0 ? m.p.ds | 0 : -1));
      if (pk[0] < 0 || pk[1] < 0) return;
      const same = pk[0] === pk[1], w = same ? 0 : Math.random() < 0.5 ? 0 : 1;
      v.r = { i: pk[w], w: ms[w].id, same: same ? 1 : 0 };
      v.goAt = Date.now() + (same ? 1600 : 5600);
      this.party.set({ dv: { id: v.id, r: v.r } });
    } else if (Date.now() >= v.goAt) {
      this._dv = null;
      this.party.set({ dv: 0 });
      this.sim.startDuel(v.r.i);
      this.sim.lastPlayers = ms.map((q) => ({ id: q.id }));
      SPEED.n = 1;
      this.party.set({ w: this.sim.snapshot() });
    }
  }

  // ---------------- entering / leaving the game ----------------
  enterGame() {
    warmMobs();
    this.mode = 'game';
    clearInterval(this.lobbyTimer);
    if (this.lobby && this.isHost) this.lobby.advertise(null);
    this.ui.showGame();
    this.player = new LocalPlayer(this, { ch: this.loadout.ch, sk: this.loadout.sk, cls: this.loadout.c, clsObj: this.myClass(), weapons: this.loadout.w, name: this.myName });
    this.hits = []; this.reqs = []; this.fxOut = [];
    this.lastEv = 0; this.epoch = null;
    this.myW = this.lastW = this.syncedW = null; this.snapT = 0;
    this.myVote = null;
    this.phase = null;
    this.runStats = { pcEarned: 0, roundsCleared: 0, bosses: 0, start: performance.now() };
    this.muFx.reset(); this._muRound = -1;
    this.player.invulnUntil = this.now + 6; // a few seconds to get your bearings before the first mobs arrive
    this.brain = this.isBot ? new Bot(this, 'duel') : this.autoplay && this.party.kind === 'solo' && !this.duelMode ? new Bot(this, 'run') : null;
    if (this.brain && this.brain.mode === 'run') this.runStats.cpuUsed = true;
    this.ui.cpuFlag(this.brain && this.brain.mode === 'run');
    this.duelEndOpen = false; this.ui.duelEnd(null);
    this.party.set({ ig: 1, out: 0, al: 1 });
    if (this.isHost) this.party.set({ w: this.sim.snapshot() });
    this.lockPointer();
  }

  teardownGame() {
    this.syncedW = null;
    if (this.allyTags) this.allyTags.clear();
    if (this.world) { this.world.dispose(); this.world = null; }
    this.clearViews();
    this.fx.clearAll();
    this.timers = [];
    if (this.player) { this.player.dispose(); this.player = null; }
    this.removeBedMesh();
    this.shopOpen = false;
    this.blessOpen = false;
    this.elemOpen = false;
    this.duelEndOpen = false; this.ui.duelEnd(null); this.ui.cpuFlag(false);
    this.brain = null;
    SPEED.n = 1;
    this.ui.elem(null); this.ui.frost(0);
    this.unlockPointer();
  }

  backToLobby() {
    MU.on = 0; MU.bt = 1;
    if (this.isHost) { const last = this.sim ? this.sim.arena : -1; this.sim = new HostSim(this); this.sim.phase = 'lobby'; this.sim.arena = last; this.party.set({ w: this.sim.snapshot() }); } // arena: so the next duel moves on from this one
    this.teardownGame();
    this.party.set({ ig: 0, rdy: 0, out: 0, al: 1 }); // a stale 'out' from the failed run would end the next run the moment it starts
    this.enterLobby();
  }

  clearViews() {
    for (const v of this.views.players.values()) v.dispose();
    for (const v of this.views.mobs.values()) v.dispose();
    for (const v of this.views.dying) v.dispose();
    for (const v of this.views.npcs.values()) v.dispose();
    if (this.views.boss) this.views.boss.dispose();
    if (this.views.demon) this.views.demon.dispose();
    this.views = { players: new Map(), mobs: new Map(), npcs: new Map(), boss: null, demon: null, dying: [] };
  }

  // ---------------- main loop ----------------
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.now += dt;
    this.trackPerf(dt);
    this.pollPad(dt);
    if (this.mode === 'game') {
      // Game speed: run the whole simulation several steps per drawn frame, so it all (sim, timers, cooldowns) speeds up together.
      const n = this.paused || this.elemOpen ? 1 : SPEED.n;
      this.steps = n;
      for (let i = 0; i < n; i++) {
        if (i > 0) { this.now += dt; this.input.pressed.clear(); this.input.dx = this.input.dy = 0; this.input.mouseClicked = false; this.input.rightClicked = false; this.input.wheel = 0; }
        this.gameFrame(dt, i < n - 1);
      }
    } else if (this.headless) {
      if (this.mode === 'lobby' && this.party) this.lobbyTick();
    } else {
      if (this.mode === 'lobby' && this.party) this.lobbyTick();
      // The menu backdrop only needs about 30 fps; in split-screen draw it every other frame.
      this.menuAcc = (this.menuAcc || 0) + dt;
      if (!this.split || (this.menuFlip = !this.menuFlip)) {
        this.menu.update(this.menuAcc, this.menuMouse);
        this.menuAcc = 0;
        if (this.menu.paintOn && !this.headless) { if (this.gov) this.gov.beforeRender(); this.menu.drawPaint(this.renderer); }
        else this.render(this.menu.scene, this.menu.camera);
      }
    }
    this.input.pressed.clear();
    this.input.dx = this.input.dy = 0;
    this.input.mouseClicked = false;
    this.input.rightClicked = false;
    this.input.wheel = 0;
  }

  render(scene, camera) {
    if (this.headless) return;
    if (this.gov) this.gov.beforeRender();
    // Behind a scope your own body and gun are left out of the picture (scope.js), so nothing can block the glass.
    const me = this.scope && this.scope.zoomed && scene === this.scene && this.player ? this.player.model : null, was = me && me.visible;
    if (me) me.visible = false;
    if (this.composer) {
      this.renderPass.scene = scene;
      this.renderPass.camera = camera;
      this.composer.render();
    } else this.renderer.render(scene, camera);
    if (me) me.visible = was;
  }

  trackPerf(dt) {
    if (this.gov) { this.gov.tick(dt); return; } // the governor keeps fps and quality
    this.frameTimes.push(dt);
    if (this.frameTimes.length < (this.split ? 60 : 120)) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    this.fps = Math.round(1 / avg);
  }

  // The host left: this player runs the party from now on (same code, same lobby).
  becomeHost(why) {
    const lb = this.lastHostLb || {};
    this.isHost = true;
    this.duelMode = !!lb.dm; this.partyPublic = lb.pub !== 0;
    if (lb.rl != null) this.settings.roundLen = lb.rl === 0 ? 0 : 10;
    this.settings.mu = (lb.mu | 0) & MU_MASK;
    this.sim = new HostSim(this); this.sim.phase = 'lobby';
    this.party.promoted = false;
    this.party.set({ host: 1, rdy: 0, lb: this.lbInfo(), w: this.sim.snapshot() });
    this.ui.toast(why || 'The host left. You are the host now, so the lobby stays open.', 'good');
    if (this.mode === 'game') this.backToLobby();
    else this.ui.renderLobby();
  }

  // Online lobby: when the host is gone for a few seconds, the player who joined earliest takes over.
  checkHostGone(host, peers) {
    if (this.isHost || this.party.kind === 'solo' || this.party.kind === 'local') { this.hostGoneAt = null; return; }
    if (host && host.p.lb) this.lastHostLb = host.p.lb;
    if (this.party.kind === 'peer') { if (this.party.promoted) this.becomeHost(); return; } // the relay handoff is done in net.js
    if (host) { this.hostGoneAt = null; return; }
    if (this.hostGoneAt == null) this.hostGoneAt = performance.now();
    if (performance.now() - this.hostGoneAt < 3000) return;
    const order = peers.filter((p) => p.p && p.p.n).sort((a, b) => ((a.p.jt || 9e15) - (b.p.jt || 9e15)) || (a.id < b.id ? -1 : 1));
    if (order[0] && order[0].me) this.becomeHost();
  }

  lobbyTick() {
    const peers = this.party.peers();
    const host = this.hostPeer(peers);
    this.checkHostGone(host, peers);
    if (this.isHost && this.sim && this.sim.phase === 'lobby' && this.mode !== 'lobby') return;
    if (this.isHost) {
      this.party.set({ w: this.sim.snapshot() });
      if (this.sim.phase !== 'lobby') this.enterGame();
      else if (this.party.kind === 'local') this.couchCountdown();
    } else if (host && host.p.w && host.p.w.ph && host.p.w.ph !== 'lobby' && !['over', 'win', 'dend'].includes(host.p.w.ph) && loadoutFull(this.loadout.w) && (this.ready || !this.ui.flipOn())) {
      this.enterGame(); // a late joiner goes in when they press Ready Up on the Element page
    }
  }

  // Couch lobby: once every seat is armed and ready the run starts after a short, cancellable countdown.
  couchCountdown() {
    const ms = this.lobbyMembers();
    const ok = ms.length >= (this.couch ? 2 : 1) && ms.every((m) => m.p.rdy && loadoutFull(m.p.wp));
    let left = 0;
    if (this._dv) { if (!ok) this.duelVoteCancel(); this.cdAt = null; if (this.party.mine.cd) this.party.set({ cd: 0 }); return; } // stage vote in progress
    if (ok) {
      if (this.cdAt == null) this.cdAt = this.now + 3;
      left = Math.max(1, Math.ceil(this.cdAt - this.now));
      if (this.now >= this.cdAt) { this.cdAt = null; this.party.set({ cd: 0 }); this.startRun(); return; }
    } else this.cdAt = null;
    if ((this.party.mine.cd || 0) !== left) this.party.set({ cd: left });
  }

  gameFrame(dt, quiet = false) {
    let vdt = dt * (this.steps || 1); // visuals advance once per drawn frame by the whole stretch
    const peers = this.party.peers();
    this.myId = this.party.myId;
    // Solo and couch co-op stop the whole game while someone chooses an element; online play carries on.
    const kind = this.party.kind;
    const choosing = (kind === 'solo' || kind === 'local') && (this.elemOpen || (kind === 'local' && peers.some((q) => !q.me && q.p && q.p.lc)));
    const duelHold = this.duel && (['dcount', 'dpick'].includes(this.phase) || (this.phase === 'dend' && this.now - (this.dendAt || 0) > 2.2));
    const frozen = (this.paused && (kind === 'solo' || (kind === 'local' && !!this.bot))) || choosing;
    const paused = frozen || duelHold; // the duel's countdown and power-up rounds stop the fight, but the host's clock for them keeps running
    // Going into a pause thaws everyone: the clock that melts the ice would stop with the rest of the fight.
    if (duelHold && !this._duelHeld && this.player) { this.el.thawAll(); this.player.clearStatus(); }
    this._duelHeld = duelHold;
    // Host migration (room / tab transports only).
    let host = this.hostPeer(peers);
    if (!this.isHost && !host && this.lastW && this.party.kind !== 'peer') {
      this.hostLostT = (this.hostLostT || 0) + dt;
      const ingame = peers.filter((p) => p.p && p.p.ig).sort((a, b) => (a.id < b.id ? -1 : 1));
      if (this.hostLostT > 3 && ingame[0] && ingame[0].me) {
        this.isHost = true;
        this.sim = HostSim.fromSnapshot(this, this.lastW);
        this.party.set({ host: 1 });
        this.ui.toast('The host left. You are now hosting.', '');
      }
    } else this.hostLostT = 0;
    if (!this.isHost && this.party.kind === 'peer') {
      if (host && host.p.lb) this.lastHostLb = host.p.lb;
      if (this.party.promoted) { this.becomeHost('The host left. You are the host now: everyone is back in the lobby.'); return; }
      if (!host && this.party.status !== 'ok' && !this.hostGoneShown) { this.hostGoneShown = true; this.ui.toast(this.party.status === 'migrating' ? 'The host left. Moving the party to a new host…' : 'Lost connection to the host.', 'bad'); }
      if (host) this.hostGoneShown = false;
    }

    if (this.isHost && !frozen) {
      this.sim.update(dt, peers);
      this.snapT = (this.snapT || 0) - dt;
      if (this.snapT <= 0) { this.snapT = 0.05; this.myW = this.sim.snapshot(); this.party.set({ w: this.myW }); }
    }
    host = this.isHost ? { p: { w: this.myW || this.sim.snapshot() } } : host;
    const w = host && host.p.w;
    if (w) { this.lastW = w; this.syncWorld(w, dt); }
    if (this.mode !== 'game') return; // the host went back to the lobby (Run it back): this seat just left the game
    if (this.isHost && this.sim && this.world && this.sim.phase !== 'lobby' && this.sim.seed && this.world.seed !== this.sim.seed) { if (this.sim.duel) this.duelArena = this.sim.arena | 0; this.loadRound(this.sim.seed, this.sim.round); } // never let the world fall behind the sim
    if (!this.world) { this.ui.waiting(true); if (!quiet) this.render(this.scene, this.camera); return; }
    this.ui.waiting(false);

    const p = this.player;
    if (p.elemPending > 0 && !this.elemOpen && !this.shopOpen && !this.blessOpen && p.alive && !p.out) this.openElem();
    if (this.duel && this.phase === 'dpick' && this.dp > (this.dpDone || 0) && !this.elemOpen && !this.duelEndOpen) this.openElem('duel');
    if (this.elemOpen) this.elemKeys();
    if (this.duel && this.phase === 'dend' && !this.duelEndOpen && this.now - (this.dendAt || 0) > 1.6) this.showDuelEnd();
    if (this.brain) {
      this.brain.ui(dt);
      if (this.brain.mode === 'run') {
        if (this.input.pressed.has('KeyP')) this.takeOver();
        if (this.input.pressed.has('KeyT')) this.cycleSpeed();
      }
    }
    if (!this.brain && this.input.pressed.has('KeyP')) this.giveToCpu();
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      if (paused) continue;
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }
    if (!paused) {
      const uiBlocking = this.shopOpen || this.blessOpen || this.phase === 'spaceq' || (this.elemOpen && this.elemStops());
      const inp = this.brain && !uiBlocking && (!this.duel || this.phase === 'duel') ? this.brain.step(dt) : uiBlocking || !this.inputLive() || (this.duel && this.phase !== 'duel') ? this.frozenInput() : this.input;
      if (this.phase === 'vote' && !p.out) this.voteKeys();
      if (this.phase === 'bless' && this.blessOpen) this.blessKeys();
      if (this.phase === 'spaceq' && this.isHost) { if (this.input.pressed.has('Digit1')) this.answerSpace(true); else if (this.input.pressed.has('Digit2')) this.answerSpace(false); }
      p.update(dt, inp);
      this.interactions();
    }
    if (quiet) { this.publish(); return; }
    if (this._healT > 0 && (this._healT -= dt) <= 0) { healNormals(this.scene); this._healT = 5; } // new enemy bodies arrive all round; already-checked geometry is skipped
    this.bulletTimeFx(dt);
    const rdt = vdt; vdt *= MU.bt; // Bullet Time: the world's visuals (enemies, effects, grass) follow the slowed clock; players do not
    this.updateRemotePlayers(peers, rdt);
    this.recoilStep(dt);
    this.updateCamera(dt);
    this.updateAim();
    if (!paused) {
      this.fx.update(vdt);
      this.world.update(vdt, this.now);
      this.ambient(dt);
    }
    for (const v of this.views.mobs.values()) v.update(vdt, this.world, this.camera, this.fx);
    this.views.dying = this.views.dying.filter((v) => { if (v.dying(vdt)) return true; v.dispose(); return false; });
    for (const v of this.views.npcs.values()) v.update(vdt, this.world, this.camera, this.fx);
    if (this.views.boss) { this.views.boss.update(vdt, this.world, this.camera, this.fx); this.bossLaserFx(); }
    if (this.views.demon) this.views.demon.update(vdt, this.world, this.camera, this.fx);
    this.publish();
    if (!this.headless) { this.ui.updateHud(dt); this.allyTags.update(); }
    this.pickups.update(vdt);
    this.chests.update(vdt);
    this.muFx.update(vdt);
    this.render(this.scene, this.camera);
  }

  // Bullet Time look and sound: colour drains, the edges darken, and a low whoosh marks time bending and snapping back.
  bulletTimeFx(dt) {
    const m = 1 - (MU.bt - 0.2) / 0.8, was = this._btM || 0;
    if (m === was && !m) return;
    this._btM = m;
    const on = m > 0.35, hud = this.ui && this.ui.$('#hud');
    if (on !== !!this._btOn) {
      this._btOn = on;
      if (hud) hud.classList.toggle('bt', on);
      this.audio.play(on ? 'bt_in' : 'bt_out', 0.7);
    }
    const gp = this.gradePass;
    if (gp && gp.uniforms.uSat) {
      const u = gp.uniforms;
      if (!was || this._btBase === undefined || this._btGp !== gp) { if (!was || this._btGp !== gp) this._btBase = [u.uSat.value, u.uVig.value]; this._btGp = gp; }
      u.uSat.value = this._btBase[0] * (1 - 0.5 * m);
      u.uVig.value = this._btBase[1] + 0.45 * m;
    }
  }

  pollPad(dt) {
    const overlay = this.root.querySelector('.overlay.on:not(.soft)');
    const inGame = this.mode === 'game' && !overlay && !this.shopOpen && !this.blessOpen;
    if (!inGame) { this.pad.release(this.input); this.pad.nav(this.root, dt); return; }
    const wasActive = this.pad.active;
    const ev = this.pad.apply(this.input, dt, this.now);
    if (!ev) return;
    if (this.pad.active !== wasActive) { this.ui.setLocked(this.inputLive(), false); this.ui.padHints(); }
    // With the lobby's CPU Run box checked, D-pad up toggles who plays: hands the run to the CPU, or takes it back. Unchecked it does nothing.
    if (ev.du && this.autoplay && !this.elemOpen) { if (this.brain && this.brain.mode === 'run') this.takeOver(); else if (!this.brain) this.giveToCpu(); return; }
    if (this.elemOpen && !this.elemStops()) {
      // Online the run carries on, so the D-pad doubles as the picker: left/right choose, up confirms.
      const I = this.input;
      if (ev.dl) { I.pressed.delete('Digit1'); this.elemMove(-1); }
      if (ev.dr) { I.pressed.delete('Digit2'); this.elemMove(1); }
      if (ev.du) this.pickElem(this.elemSel);
    }
    if (ev.dd) this.cycleSpeed();
    // D-pad left / right: previous / next weapon, round all three slots. In the vote and
    // the element picker those same presses stay the 1 / 2 choices, so only turn them into a cycle outside those.
    if ((ev.dl || ev.dr) && !this.elemOpen && this.phase !== 'vote') { const I = this.input; I.pressed.delete('Digit1'); I.pressed.delete('Digit2'); I.wheel = ev.dr ? 1 : -1; }
    if (ev.shop) this.toggleShop();
    if (ev.pause) { this.padPaused = true; this.ui.setLocked(false, false); }
  }

  frozenInput() {
    return { keys: new Set(), pressed: new Set(), dx: 0, dy: 0, mouseDown: false, mouseClicked: false, rightClicked: false, aimHeld: false, wheel: 0 };
  }

  publish() {
    const p = this.player;
    const now = this.now;
    this.fxOut = this.fxOut.filter((f) => now - f.t < 1.5);
    this.party.set({
      ...p.presence(),
      n: this.myName, ch: this.loadout.ch, sk: this.loadout.sk, c: this.loadout.c, wp: this.loadout.w, ig: 1,
      h: this.hits.slice(-60),
      rq: this.reqs.slice(-20),
      f: this.fxOut.map((f) => f.e),
      v: this.myVote,
      lc: this.elemOpen ? 1 : 0,
      dk: this.dpDone || 0,
      host: this.isHost ? 1 : 0,
    });
  }

  // ---------------- networking sync ----------------
  syncWorld(w, dt) {
    // The sim publishes a new snapshot about every 50 ms; frames in between would only re-apply the same one.
    if (w === this.syncedW && this.world) return;
    this.syncedW = w;
    if (w.ep !== this.epoch) { this.epoch = w.ep; this.lastEv = 0; }
    if (w.ph === 'lobby') { if (!this.isHost) this.backToLobby(); return; }
    this.runSeed = w.rs || 0;
    MU.on = w.du ? 0 : (w.mu | 0) & MU_MASK;
    MU.bt = MU.on & BULLET_TIME ? Math.min(1, Math.max(0.05, (w.bt || 100) / 100)) : 1;
    if (MU.on && this.runStats) this.runStats.mutated = true; // a mutator run counts toward nothing
    this.duel = !!w.du; this.dp = w.dp || 0; this.dpt = w.pt || 0; this.duelWinner = w.wn || '';
    this.duelArena = this.duel ? (((w.ar | 0) % DUEL_BIOMES.length) + DUEL_BIOMES.length) % DUEL_BIOMES.length : 0; // which Duel Arena the host picked for this match
    if (!this.world || this.world.seed !== w.sd || (this.duel && this.world.arenaIdx !== this.duelArena)) this.loadRound(w.sd, w.rd);
    this.round = w.rd;
    if (w.ph === 'play' && MU.on && this.round !== this._muRound) { this._muRound = this.round; this.ui.mutatorBanner(muList(MU.on), this.round === 0 ? 5 : 0); this.audio.play('mu_sting', 0.8); }
    if (w.ph === 'play' && this.round !== this._dailyRound) { this._dailyRound = this.round; if (this.dailyOn()) Dailies.best('round', this.round + 1); }
    this.tl = w.tl;
    this.endless = w.rl === 0;
    this.voteTally = w.vt;
    const ak = (w.ak && w.ak[this.party.myId]) || 0;
    if (ak) this.hits = this.hits.filter((h) => h[0] > ak);
    const rk = (w.rk && w.rk[this.party.myId]) || 0;
    if (rk) this.reqs = this.reqs.filter((r) => r[0] > rk);

    // Mobs.
    const seen = new Set();
    const tint = this.world.biome.mobTint;
    for (const row of w.m || []) {
      seen.add(row[0]);
      let v = this.views.mobs.get(row[0]);
      if (!v) { v = new MobView(this.scene, row, tint); this.views.mobs.set(row[0], v); }
      v.apply(row);
    }
    for (const [id, v] of this.views.mobs) if (!seen.has(id)) { v.dispose(); this.views.mobs.delete(id); }
    // Boss.
    if (w.b) {
      if (!this.views.boss || this.views.boss.idx !== w.b[0]) { if (this.views.boss) this.views.boss.dispose(); this.views.boss = new BossView(this.scene, w.b); }
      this.views.boss.apply(w.b);
    } else if (this.views.boss) { this.views.boss.dispose(); this.views.boss = null; }
    // Demon.
    if (w.dm) {
      if (!this.views.demon) this.views.demon = new DemonView(this.scene, w.dm);
      this.views.demon.apply(w.dm);
    } else if (this.views.demon) { this.views.demon.dispose(); this.views.demon = null; }
    // NPCs.
    const seenN = new Set();
    for (const row of w.n || []) {
      seenN.add(row[0]);
      let v = this.views.npcs.get(row[0]);
      if (!v) { v = new NpcView(this.scene, row, this.nameOf(row[2])); this.views.npcs.set(row[0], v); }
      v.size = this.duel && v.def.summoned ? 2 : 1;
      v.apply(row);
    }
    for (const [id, v] of this.views.npcs) if (!seenN.has(id)) { this.views.npcs.delete(id); if (v.thrall && v.rig) { this.views.dying.push(v); this.audio.play('necro_fall', 0.6 * this.distVol(v.x, v.z)); continue; } if (v.rig) this.el.hellFade([v.x, v.y, v.z]); v.dispose(); }
    // Crates.
    if (w.oc) for (const id of w.oc) { const c = this.world.crates[id]; if (c && !c.opened) this.openCrateVisual(c); }
    // Events.
    const evs = (w.e || []).filter((e) => e[1] > this.lastEv).sort((a, b) => a[1] - b[1]);
    for (const e of evs) { this.lastEv = e[1]; this.handleEvent(e); }
    if (w.ph !== this.phase) { const prev = this.phase; this.phase = w.ph; this.onPhase(w.ph, prev); }
  }

  nameOf(id) {
    if (!this.party) return '';
    if (id === this.party.myId) return this.myName;
    const p = this.party.peers().find((x) => x.id === id);
    return p && p.p ? String(p.p.n || '') : '';
  }

  // Zombie Staff: its six zombie bodies and the hell pit are shader programs the game has never used, and compiling them on
  // the first slam froze the game for a moment. Build and compile them now, behind the round banner, once per page.
  warmSummons() {
    if (this._summonWarm) return;
    this._summonWarm = true;
    const rigs = [];
    for (let i = 0; i < 6; i++) { const r = makeMobRig('zombie' + i); if (r) { r.root.position.y = -300; this.scene.add(r.root); rigs.push(r); } }
    const pit = this.el.hellPitProbe(), hb = this.el.healBeamProbe();
    try {
      this.renderer.setRenderTarget(this.composer ? this.composer.readBuffer : null); // same target as the real frame, so the programs match
      this.renderer.compile(this.scene, this.camera);
    } catch (e) { /* a failed warm-up only costs the old hitch */ } finally { this.renderer.setRenderTarget(null); }
    for (const r of rigs) this.scene.remove(r.root);
    this.scene.remove(pit, hb); hb.geometry.dispose(); hb.material.dispose();
  }

  loadRound(seed, rd) {
    if (this.world) this.world.dispose();
    this.clearViews();
    this.fx.clearAll();
    this.timers = [];
    this.removeBedMesh();
    this.pickups.clear();
    this.muFx.clearRound();
    this.chests.clear((pu) => { if (this.player) this.player.takePowerup(pu); }); // a power-up left in a chest is yours anyway
    this.hitSrc = new Map();
    this.world = new World(this.scene, seed, rd, this.q, this.duel ? DUEL.stage : (this.forceStage ?? stageIdx(this.runSeed, rd)), { duel: this.duel, arena: this.duelArena });
    this.fx.heightAt = (x, z) => this.world.heightAt(x, z);
    const b = this.world.biome;
    this.scene.fog.color.set(b.fog);
    this.scene.fog.density = b.fogDensity;
    this.fx.setFog(b.fogDensity);
    this.sun.color.set(b.sun);
    this.sun.intensity = b.sunI;
    this.hemi.color.set(b.hemi[0]);
    this.hemi.groundColor.set(b.hemi[1]);
    this.hemi.intensity = b.hemiI;
    applyBiomeLook(this, b);
    healNormals(this.scene); this._healT = 2; // (again shortly after: some props finish building a moment later)
    if (this.loadout.w.includes('zombiestaff') || this.party.peers().some((q) => q.p && (q.p.wp || []).includes('healstaff'))) this.warmSummons(); // the Healing Staff's beam shader is warmed for every seat that can see one
    const p = this.player;
    // A duel's two fighters are the lobby's two named players: the other one's in-game flag may not have reached us yet, and both sides must agree who is first.
    const peers = (this.duel ? this.lobbyMembers() : this.party.peers().filter((x) => x.p && x.p.ig)).sort((a, c) => (a.id < c.id ? -1 : 1));
    const idx = Math.max(0, peers.findIndex((x) => x.me));
    const a = (idx / 5) * Math.PI * 2;
    if (this.duel) {
      const s = this.world.duelSpawn(idx);
      p.placeAt(s.x, s.z); p.yaw = s.yaw; p.pitch = 0.1;
      p.resetDuel();
      this.dpDone = 0; this.elemOpen = false; this.ui.elem(null);
    } else {
      p.placeAt(this.world.spawn.x + Math.cos(a) * 3, this.world.spawn.z + Math.sin(a) * 3);
      p.yaw = Math.atan2(this.world.arena.x - this.world.spawn.x, this.world.arena.z - this.world.spawn.z);
      p.pitch = 0.1;
    }
    if (rd > 0 && !this.duel) {
      // A fresh map heals everyone and brings fallen teammates back.
      if (!p.alive || p.out) p.revive(1);
      p.hp = p.stats.maxHp;
      this.runStats.roundsCleared = rd;
    }
    p.bedPos = null;
    this.ui.minimapBase(this.world.minimap);
    if (this.duel) this.ui.banner('Duel Arena', b.name); else this.ui.banner(rd >= CONFIG.rounds ? 'Bonus round' : 'Round ' + (rd + 1) + ' of ' + CONFIG.rounds, b.name);
    this.audio.play('round');
    // Braziers burn at camp.
    for (const br of this.world.braziers) this.brazier(br);
  }

  brazier(pos) {
    const fx = this.fx;
    const light = fx.holdLight({}, 0xff8a3a, 6, 14);
    if (light) light.position.set(pos[0], pos[1] + 1, pos[2]);
    fx.add({
      update: () => {
        if (!this.world) return false;
        if (Math.random() < 0.7) fx.fire.emit({ p: [pos[0] + (Math.random() - 0.5) * 0.4, pos[1], pos[2] + (Math.random() - 0.5) * 0.4], v: [0, 2.2, 0], life: 0.6, s0: 0.9, s1: 0.2, c0: [1, 0.8, 0.45, 1], c1: [0.9, 0.2, 0.02, 0], turb: 3 });
        if (Math.random() < 0.1) fx.smoke.emit({ p: [pos[0], pos[1] + 1, pos[2]], v: [0, 1.2, 0], life: 2, s0: 0.6, s1: 2, c0: [0.2, 0.2, 0.2, 0.3], c1: [0.3, 0.3, 0.3, 0] });
        if (light) light.intensity = 6 + Math.sin(this.now * 17) * 1.5;
      },
      dispose: () => fx.releaseLight(light),
    });
  }

  handleEvent(e) {
    const [k] = e;
    const me = this.party.myId;
    const p = this.player;
    switch (k) {
      case 'a': {
        const [, , target, dmg, src, sl = 0, fz = 0, lk = 0, kx = 0, kz = 0, ln = 0] = e;
        if (target === me && p.takeDamage(dmg, src) && (sl || fz || lk || kx || kz || ln)) p.takeStatus({ sl, fz, lk, kx: kx / 10, kz: kz / 10, ln });
        break;
      }
      case 'p': {
        const [, , x, y, z, vx, vy, vz, dmg, style] = e;
        const col = style === 1 && this.views.boss ? new THREE.Color(this.views.boss.def.glow) : new THREE.Color(style === 4 ? 0x3aa0ff : style === 3 ? 0xfff2c0 : style === 2 ? 0xffc860 : 0x7dff3a); // 2: archer arrow, 3: a soldier's bullet, 4: the Visitor's bursting plasma
        let hit = false, back = false, held = null;
        this.el.orb([x / 10, y / 10, z / 10], [vx / 10, vy / 10, vz / 10], {
          color: [col.r, col.g, col.b], size: style === 1 ? 1.5 : style === 4 ? 1.3 : style === 2 ? 0.95 : style === 3 ? 0.5 : 1.15, dur: style === 3 ? 1.2 : 4,
          onUpdate: (pos, vel) => {
            if (hit || !p.alive) return;
            { // Absolute Zero: a shot inside the frozen air hangs where it is until the cold lets go.
              const zz = this.zeroZone;
              if (zz && this.now < zz.until && (pos.x - zz.x) ** 2 + (pos.z - zz.z) ** 2 < zz.r * zz.r) {
                if (!held) { held = vel.clone(); vel.set(0, 0, 0); }
                if (Math.random() < 0.15) this.fx.shard.emit({ p: [pos.x, pos.y, pos.z], v: [0, -0.3, 0], life: 0.5, s0: 0.3, s1: 0.1, c0: [0.85, 0.95, 1, 1], c1: [0.6, 0.85, 1, 0] });
                return;
              }
              if (held) { vel.copy(held); held = null; }
              // Tornado Life: a shot that reaches the funnel is swallowed.
              if (!back && this.windZones) for (const wz of this.windZones) if (this.now < wz.until && (pos.x - wz.x) ** 2 + (pos.z - wz.z) ** 2 < wz.r * wz.r) { hit = true; this.el.windDeflect([pos.x, pos.y, pos.z]); return false; }
            }
            if (back) {
              // Turned back by the Eye of the Storm: it strikes the first enemy in its way.
              const t = this.targets().find((q) => q.kind !== 'demon' && Math.hypot(q.x - pos.x, q.z - pos.z) < q.r + 0.8 && pos.y > q.y - 0.4 && pos.y < q.y + q.h + 0.4);
              if (t) { hit = true; this.damage(t, 30 * p.stats.dmg * p.mm('eye'), { kx: vel.x * 0.3, kz: vel.z * 0.3, at: [pos.x, pos.y, pos.z] }); this.el.windDeflect([pos.x, pos.y, pos.z]); return false; }
              return;
            }
            if (style === 4) {
              // Plasma bursts where it lands: a small blast that catches anyone standing close.
              const gy = this.world.heightAt(pos.x, pos.z);
              if (pos.y <= gy + 0.3) {
                hit = true;
                this.fx.explosion([pos.x, gy + 0.5, pos.z], 0.5, { color: [0.25, 0.6, 1], smoke: false });
                this.audio.play('slam', this.distVol(pos.x, pos.z) * 0.35);
                if (Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z) < 3.2 && p.pos.y - gy < 2.5) p.takeDamage(Math.round(dmg * 0.6), 'proj');
                return false;
              }
            }
            const dx = pos.x - p.pos.x, dy = pos.y - (p.pos.y + 1.1), dz = pos.z - p.pos.z;
            if (p.eyeOn() && dx * dx + dz * dz < p.eye.r * p.eye.r && dy > -2 && dy < 9) {
              // Eye of the Storm: the shot hits the swirl and is flung back where it came from (a little outward too).
              const ox = x / 10 - pos.x, oy = y / 10 - pos.y, oz = z / 10 - pos.z, ol = Math.hypot(ox, oy, oz) || 1, dl = Math.hypot(dx, dz) || 1;
              const sp = Math.hypot(vel.x, vel.y, vel.z) * 1.15;
              vel.set(ox / ol + dx / dl * 0.4, oy / ol, oz / ol + dz / dl * 0.4).normalize().multiplyScalar(sp);
              back = true;
              this.el.windDeflect([pos.x, pos.y, pos.z]);
              this.audio.play('deflect', 0.8);
              return;
            }
            if (dx * dx + dz * dz < 0.8 && Math.abs(dy) < 1.2) {
              hit = true;
              p.takeDamage(dmg, 'proj');
              this.fx.impact([pos.x, pos.y, pos.z], [col.r, col.g, col.b]);
              if (style === 4) this.fx.explosion([pos.x, pos.y, pos.z], 0.5, { color: [0.25, 0.6, 1], smoke: false });
              return false;
            }
          },
        });
        if (style === 0) this.audio.play('spit', this.distVol(x / 10, z / 10));
        if (style === 4) this.audio.play('shot_alienblaster', this.distVol(x / 10, z / 10) * 0.7);
        break;
      }
      case 's': {
        const [, , x, z, r10, d100, dmg] = e;
        const X = x / 10, Z = z / 10, R = r10 / 10, D = d100 / 100;
        this.el.telegraph([X, 0, Z], R, D);
        this.timers.push({ t: D, fn: () => {
          const y = this.world.heightAt(X, Z);
          this.fx.dustBurst([X, y, Z], R / 3);
          this.fx.shockwave([X, y, Z], R, 0xff7a50, 0.4);
          this.audio.play('slam', this.distVol(X, Z));
          this.shake(Math.max(0, 0.6 - this.distTo(X, Z) / 40));
          if (p.alive && Math.hypot(p.pos.x - X, p.pos.z - Z) < R && p.pos.y - y < 2.2) p.takeDamage(dmg, 'slam');
        } });
        break;
      }
      case 'd': {
        const [, , id, killer, x, z, ti, risen] = e;
        const X = x / 10, Z = z / 10, y = this.world.heightAt(X, Z);
        const v = this.views.mobs.get(id);
        if (muOn(PINATA)) this.muFx.pinata(X, y, Z, v ? v.vh : 2); // Piñata: confetti and candy instead of blood
        else this.fx.blood([X, y + 1, Z]);
        this.fx.dustBurst([X, y, Z], 0.5, [0.25, 0.22, 0.2]);
        if (v) {
          this.views.mobs.delete(id);
          if (risen) v.risen = true; // Necromancer: the body drops, then gets back up as yours (the thrall takes over from here)
          if (v.rig && !v.base.bomb && (risen || !muOn(PINATA))) this.views.dying.push(v); else v.dispose(); // a piñata bursts: no body left
        }
        if (p && p.supperUntil > this.now) p.supperFeed([X, y + 1, Z]); // Last Supper: every death feeds the Necromancer
        if (killer === me) {
          const pcGain = Math.round(CONFIG.pcPerKill * Math.min(2, p.stats.greed)); // PC bonuses stop at double
          p.totalKills++;
          this.countKill(id, v);
          this.pickups.dropCoins(X, Z, pcGain); // the PC drops as a coin where it died: walk over it
          this.muFx.kill(X, y, Z, pcGain); // Jackpot: every 20th kill bursts into gold
          this.audio.play('kill');
          this.ui.hitmarker(true);
          const tier = (MOBS[MOB_TYPES[ti]] || { tier: 1 }).tier;
          p.addXp(XP.kill[tier] * (1 + XP.perRound * (this.round || 0)));
          if (p.stats.burst) {
            this.areaDamage([X, y + 1, Z], 3.6 + 0.4 * p.stats.burst, (14 + 8 * p.stats.burst) * p.stats.dmg, { silentNum: true, kb: 5 });
            this.fx.explosion([X, y + 1, Z], 0.7);
          }
        }
        break;
      }
      case 'mk': {
        // Champion down: it drops health pickups (each player collects their own) and a PC bonus.
        const [, , , killer, x, z, seed] = e;
        const X = x / 10, Z = z / 10;
        this.pickups.spawn(X, Z, seed);
        this.fx.explosion([X, this.world.heightAt(X, Z) + 1.5, Z], 1.6);
        this.audio.play('explode', this.distVol(X, Z));
        if (killer === me) p.addXp(XP.mini);
        if (p.alive || !p.out) this.pickups.dropCoins(X, Z, CONFIG.pcPerKill * MINI.pcMul, 6);
        this.ui.toast('Champion down. Grab the health pickups.', 'good');
        break;
      }
      case 'ek': {
        // Elite down: a bonus purse, and its colour bursts out.
        const [, , , killer, x, z, kind] = e;
        const X = x / 10, Z = z / 10, K = ELITE.kinds[kind];
        if (K) {
          this.fx.explosion([X, this.world.heightAt(X, Z) + 1.2, Z], 0.9);
          for (let i = 0; i < 18; i++) this.fx.glow.emit({ p: [X, this.world.heightAt(X, Z) + 1.2, Z], v: [(Math.random() - 0.5) * 9, Math.random() * 6, (Math.random() - 0.5) * 9], life: 0.7, s0: 0.8, s1: 0.1, c0: [...K.color, 1], c1: [...K.color, 0] });
          if (killer === me) { const pc = Math.round(CONFIG.pcPerKill * Math.min(2, p.stats.greed) * ELITE.pcMul); this.pickups.dropCoins(X, Z, pc, 3); } // no message: the gold coins on the ground say it
        }
        break;
      }
      case 'bx': {
        // Bomber blast: a warning ring, then the explosion hurts anyone still inside it.
        const [, , x, z, r10, d100, dmg] = e;
        const X = x / 10, Z = z / 10, R = r10 / 10, D = d100 / 100;
        this.el.telegraph([X, 0, Z], R, D, 0xff8a20);
        this.timers.push({ t: D, fn: () => {
          const y = this.world.heightAt(X, Z);
          this.fx.explosion([X, y + 0.8, Z], R / 3);
          this.fx.shockwave([X, y, Z], R, 0xffb050, 0.45);
          this.audio.play('explode', this.distVol(X, Z));
          this.shake(Math.max(0, 0.7 - this.distTo(X, Z) / 35));
          if (p.alive && Math.hypot(p.pos.x - X, p.pos.z - Z) < R && p.pos.y - y < 2.5) p.takeDamage(dmg, 'blast');
        } });
        break;
      }
      case 'bk': {
        // A shield turned a hit aside: sparks on the guard side.
        const v = this.views.mobs.get(e[2]);
        if (v) { this.fx.impact([v.x + Math.sin(v.yaw) * 0.9, v.y + v.vh * 0.55, v.z + Math.cos(v.yaw) * 0.9], [0.85, 0.9, 1]); this.audio.play('hit', 0.8 * this.distVol(v.x, v.z)); }
        break;
      }
      case 'gf': {
        // A teammate shared PC.
        const [, , from, to, amt] = e;
        if (to === this.party.myId && p) {
          const pr = this.party.peers().find((q) => q.id === from);
          p.pc += amt; this.ui.coinPop(amt);
          this.audio.play('coin', 0.8);
          this.ui.toast(((pr && pr.p && pr.p.n) || 'A teammate') + ' shared ' + amt + ' PC with you', 'good');
        }
        break;
      }
      case 'bd': {
        const [, , killer, x, z] = e;
        const X = x / 10, Z = z / 10, y = this.world.heightAt(X, Z);
        this.fx.explosion([X, y + 3, Z], 3);
        this.fx.shockwave([X, y, Z], 20, 0xffe0a0, 1.2);
        this.audio.play('explode');
        this.shake(0.8);
        if (p.alive || !p.out) {
          p.pc += CONFIG.pcPerBoss;
          this.runStats.pcEarned += CONFIG.pcPerBoss;
          if (this.dailyOn()) Dailies.add('pc', CONFIG.pcPerBoss);
          this.ui.coinPop(CONFIG.pcPerBoss);
          p.addXp(XP.boss);
        }
        // Perfect Points for the boss, banked on the spot (CPU and mutator runs earn nothing).
        const bpp = this.counts() && (p.alive || !p.out) ? CONFIG.ppPerBoss || 0 : 0;
        if (bpp && this.seat === 1) { addPP(bpp); this.runStats.pp = (this.runStats.pp || 0) + bpp; }
        this.runStats.bosses++;
        if ((p.alive || !p.out) && this.dailyOn()) { Dailies.add('bosses'); if (!p.deaths) Dailies.add('cleanBoss'); }
        if (this.counts()) { Unlocks.add('bosses'); if (stageIdx(this.runSeed, this.round) === 7) Unlocks.add('bossesSpace'); }
        if (this.counts() && BOSSES[bossIdx(this.runSeed, this.round)].name === 'The Visitor' && Unlocks.grant('visitor')) { this.ui.banner('The Visitor unlocked', 'Pick them in character select'); }
        this.ui.banner('Boss defeated', '+' + CONFIG.pcPerBoss + ' PC' + (bpp ? ' · +' + bpp + ' PP' : '') + (killer === me ? ' · Final blow!' : ''));
        break;
      }
      case 'h': {
        const [, , target, amt, npcId] = e;
        const nv = this.views.npcs.get(npcId);
        const tp = target === me ? [p.pos.x, p.pos.y + 1.4, p.pos.z] : this.playerChest(target);
        if (nv && tp) this.el.healBeam(nv.chest(), tp);
        if (target === me) { p.heal(amt); this.audio.play('heal', 0.5); this.ui.healFlash(); }
        break;
      }
      case 'nf': {
        const [, , id, x, z] = e;
        const nv = this.views.npcs.get(id);
        if (nv && nv.gun) { const y = this.world.heightAt(x / 10, z / 10) + 1.2; this.el.arrow(nv.chest(), [x / 10, y, z / 10]); this.audio.play('shot_pistol', 0.3 * this.distVol(nv.x, nv.z)); }
        break;
      }
      case 'ns': {
        const [, , id, type] = e;
        if (type === 'thrall') { this.timers.push({ t: 0.5, fn: () => { const nv = this.views.npcs.get(id); if (!nv) return; const y = this.world.heightAt(nv.x, nv.z); this.fx.shockwave([nv.x, y, nv.z], 2.6, 0x5aff9a, 0.5); for (let i = 0; i < 18; i++) this.fx.glow.emit({ p: [nv.x + (Math.random() - 0.5) * 1.2, y + 0.1, nv.z + (Math.random() - 0.5) * 1.2], v: [0, 2 + Math.random() * 3, 0], life: 0.7, s0: 0.5, s1: 0.1, c0: [0.4, 1, 0.55, 0.9], c1: [0.1, 0.7, 0.3, 0] }); this.audio.play('necro_rise', 0.7 * this.distVol(nv.x, nv.z)); } }); break; }
        this.timers.push({ t: 0.1, fn: () => { const nv = this.views.npcs.get(id); if (!nv) return; if (nv.rig) { this.el.hellPit([nv.x, nv.y, nv.z]); this.audio.play('hell_rise', 0.5 * this.distVol(nv.x, nv.z)); } else this.fx.shockwave([nv.x, nv.y, nv.z], 3, 0x9affb0, 0.6); } });
        break;
      }
      case 'nd': {
        const [, , , x, z] = e;
        this.fx.dustBurst([x / 10, this.world.heightAt(x / 10, z / 10), z / 10], 0.6);
        break;
      }
      case 'tp': {
        const [, , x, z] = e;
        const peers = this.party.peers().filter((q) => q.p && q.p.ig).sort((a, b) => (a.id < b.id ? -1 : 1));
        const idx = Math.max(0, peers.findIndex((q) => q.me));
        const a = (idx / 5) * Math.PI * 2 + Math.PI / 12;
        const X = x / 10 + Math.cos(a) * 22, Z = z / 10 + Math.sin(a) * 22;
        p.placeAt(X, Z);
        p.yaw = Math.atan2(x / 10 - X, z / 10 - Z);
        this.fx.shockwave([X, p.pos.y, Z], 4, 0xffffff, 0.5);
        this.removeBedMesh();
        p.bedPos = null;
        break;
      }
      case 'msg': { const t = String(e[2] || ''); if (t.includes(' · ')) this.ui.toast('Enemies this round: ' + t.split(' · ')[1]); break; }
      case 'dc': {
        if (this.headless) break;
        this.ui.duelCount(e[2]);
        this.audio.play(e[2] > 0 ? 'ui' : 'round');
        if (e[2] === 0) this.shake(0.3);
        break;
      }
      case 'dp':
        if (!this.headless) { this.ui.banner('Power-up round', 'Both fighters choose one'); this.audio.play('bless', 0.5); }
        break;
      case 'demon':
        this.audio.play('demon');
        this.ui.banner('Death', 'The ten minutes are up. She hunts you now');
        break;
      case 'dd': {
        const [, , killer, x, z] = e;
        const X = x / 10, Z = z / 10, y = this.world.heightAt(X, Z);
        this.fx.explosion([X, y + 2, Z], 3);
        this.fx.shockwave([X, y, Z], 16, 0x8fb0ff, 1.2);
        this.audio.play('explode');
        this.shake(0.7);
        if (p.alive || !p.out) p.addXp(XP.boss);
        this.ui.banner('Death has fallen', killer === me ? 'Final blow!' : '');
        break;
      }
      case 'extract': {
        const pos = [p.pos.x, p.pos.y, p.pos.z];
        this.fx.add({ dur: 4, update: () => { for (let i = 0; i < 6; i++) this.fx.glow.emit({ p: [pos[0] + (Math.random() - 0.5) * 2, pos[1] + Math.random() * 2, pos[2] + (Math.random() - 0.5) * 2], v: [0, 12, 0], life: 1, s0: 0.8, s1: 0.2, c0: [0.7, 0.9, 1, 1], c1: [0.7, 0.9, 1, 0] }); } });
        this.fx.flash([pos[0], pos[1] + 3, pos[2]], 0xbfe0ff, 40, 3, 30);
        break;
      }
      case 'lw': {
        // Thermes charges his eye lasers: blue telegraph discs along where the sweep will start, and a roar.
        const [, , x, z, yaw10, sw10, w10] = e;
        const X = x / 10, Z = z / 10, yaw = yaw10 / 10, sw = sw10 / 10, W = w10 / 10;
        for (let i = 1; i <= 5; i++) { const a = yaw + sw * (i / 5), d = 10 + i * 9; this.el.telegraph([X + Math.sin(a) * d, 0, Z + Math.cos(a) * d], 2.4, W + i * 0.4, 0x5aa8ff); }
        this.audio.play('roar', 0.7);
        break;
      }
      case 'qw': {
        const [, , x, z, w10, own] = e;
        this.el.telegraph([x / 10, 0, z / 10], 9, w10 / 10, own && this.views.boss ? this.views.boss.def.glow : 0x5aa8ff);
        break;
      }
      case 'qk': {
        // The ground smash: an expanding blue shockwave ring on the floor (a second one follows when he is enraged).
        const [, , x, z, n, rg, sp, own] = e;
        const X = x / 10, Z = z / 10, y = this.world.heightAt(X, Z);
        const T = { quakeRange: rg || THERMES.quakeRange, quakeSpeed: sp || THERMES.quakeSpeed }, dur = T.quakeRange / T.quakeSpeed; // other bosses' stomps send their own size
        const qc = own && this.views.boss ? this.views.boss.def.glow : 0x5aa8ff;
        this.fx.dustBurst([X, y, Z], 6);
        this.fx.shockwave([X, y, Z], T.quakeRange, qc, dur, 0.5);
        this.fx.shockwave([X, y, Z], T.quakeRange, 0xffffff, dur, 1.4);
        if (n > 1) this.timers.push({ t: 0.7, fn: () => this.fx.shockwave([X, y, Z], T.quakeRange, qc, dur, 0.5) });
        this.audio.play('slam', this.distVol(X, Z));
        this.shake(Math.max(0, 0.9 - this.distTo(X, Z) / 60));
        break;
      }
      case 'vt': {
        // The Visitor blinks: a green flash and a rising column of light where it left and where it lands.
        const [, , x0, z0, x1, z1] = e;
        for (const [X, Z] of [[x0 / 10, z0 / 10], [x1 / 10, z1 / 10]]) {
          const y = this.world.heightAt(X, Z);
          this.fx.shockwave([X, y, Z], 8, 0x7dffb0, 0.45);
          this.fx.flash([X, y + 6, Z], 0x7dffb0, 40, 0.3, 30);
          for (let i = 0; i < 16; i++) this.fx.glow.emit({ p: [X + (Math.random() - 0.5) * 4, y + Math.random() * 12, Z + (Math.random() - 0.5) * 4], v: [0, 7, 0], life: 0.55, s0: 1.3, s1: 0.1, c0: [0.5, 1, 0.7, 0.9], c1: [0.5, 1, 0.7, 0] });
        }
        if (this.views.boss) this.views.boss.snap = true;
        this.audio.play('deflect', Math.max(0.35, this.distVol(x1 / 10, z1 / 10)));
        break;
      }
      case 'ax': {
        // Thermes' axe: 1 overhead cleave (the slam warning shows where), 2 a wide sweep, 3 the whirlwind.
        const [, , kind, x, z, d100, yaw100, rng] = e;
        const X = x / 10, Z = z / 10;
        this.audio.play('swing', Math.max(0.5, this.distVol(X, Z)));
        if (kind === 2) {
          this.timers.push({ t: d100 / 100, fn: () => {
            const yw = yaw100 / 100;
            for (let i = 0; i < 26; i++) {
              const a = yw - 1.75 + (i / 25) * 3.5, r = rng * (0.55 + Math.random() * 0.45), px = X + Math.sin(a) * r, pz = Z + Math.cos(a) * r, py = this.world.heightAt(px, pz);
              this.fx.dustBurst([px, py, pz], 0.7);
              this.fx.spark.emit({ p: [px, py + 1, pz], v: [Math.sin(a) * 9, 3 + Math.random() * 4, Math.cos(a) * 9], life: 0.4, s0: 0.3, s1: 0.05, c0: [0.6, 0.85, 1, 1], c1: [0.3, 0.5, 1, 0], g: 10 });
            }
            this.audio.play('slam', this.distVol(X, Z) * 0.7);
            this.shake(Math.max(0, 0.5 - this.distTo(X, Z) / 50));
          } });
        } else if (kind === 3) this.audio.play('roar', 0.5);
        break;
      }
      case 'bw': { this.ui.toast(String(e[2] || ''), 'bad'); this.audio.play('roar', 0.6); break; } // a boss warning
      case 'mt': {
        // Thermes' meteor: a warning circle, a burning rock falling out of the sky for the whole warning, then the crash.
        const [, , x, z, r10, d100, dmg] = e;
        const X = x / 10, Z = z / 10, R = r10 / 10, D = d100 / 100, y = this.world.heightAt(X, Z);
        this.el.telegraph([X, 0, Z], R, D, 0xff5a1a);
        const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(R * 0.42, 1), new THREE.MeshStandardMaterial({ color: 0x2a1408, emissive: 0xd03a08, emissiveIntensity: 0.9, roughness: 0.9, flatShading: true }));
        const sx = X + 60, sz = Z - 35, sy = y + 170;
        rock.position.set(sx, sy, sz);
        this.scene.add(rock);
        let done = false;
        const fx = this.fx;
        fx.add({
          dur: D + 0.05,
          update: (dt, t) => {
            const k = Math.min(1, t / D), kk = k * k; // it speeds up as it comes down
            rock.position.set(sx + (X - sx) * kk, sy + (y - sy) * kk, sz + (Z - sz) * kk);
            rock.rotation.x += dt * 2.2; rock.rotation.z += dt * 1.4;
            const q = rock.position;
            for (let i = 0; i < fx.n(3); i++) fx.glow.emit({ p: [q.x + (Math.random() - 0.5) * R * 0.5, q.y + (Math.random() - 0.5) * R * 0.5, q.z + (Math.random() - 0.5) * R * 0.5], v: [(sx - X) * 0.05, 4, (sz - Z) * 0.05], life: 0.7, s0: R * 0.55, s1: 0.4, c0: [1, 0.55, 0.15, 0.9], c1: [1, 0.2, 0.05, 0] });
            fx.smoke.emit({ p: [q.x, q.y, q.z], v: [(sx - X) * 0.03, 2, (sz - Z) * 0.03], life: 1.6, s0: R * 0.5, s1: R * 1.1, c0: [0.12, 0.08, 0.07, 0.7], c1: [0.1, 0.08, 0.08, 0] });
          },
          dispose: () => { if (done) return; done = true; this.scene.remove(rock); rock.geometry.dispose(); rock.material.dispose(); },
        });
        this.timers.push({ t: D, fn: () => {
          const yy = this.world ? this.world.heightAt(X, Z) : y;
          fx.dustBurst([X, yy, Z], R / 2);
          fx.shockwave([X, yy, Z], R * 1.3, 0xff7a30, 0.55);
          fx.flash([X, yy + 2, Z], 0xffa040, 16, 0.3, 40);
          for (let i = 0; i < fx.n(26); i++) { const an = Math.random() * 6.28; fx.debris.emit({ p: [X, yy + 0.4, Z], v: [Math.cos(an) * (4 + Math.random() * 12), 6 + Math.random() * 14, Math.sin(an) * (4 + Math.random() * 12)], life: 0.8 + Math.random() * 0.8, s0: 0.3 + Math.random() * 0.6, s1: 0.2, c0: [0.35, 0.2, 0.12, 1], c1: [0.25, 0.15, 0.1, 0], g: 18, drag: 0.3 }); }
          this.audio.play('slam', this.distVol(X, Z));
          this.shake(Math.max(0, 1 - this.distTo(X, Z) / 60));
          if (p.alive && Math.hypot(p.pos.x - X, p.pos.z - Z) < R && p.pos.y - yy < 3) p.takeDamage(dmg, 'slam');
        } });
        break;
      }
      case 'cw': {
        const [, , x, z, vx, vz] = e;
        const X = x / 10, Z = z / 10;
        for (let i = 1; i <= 6; i++) this.el.telegraph([X + (vx / 10) * i * 0.18, 0, Z + (vz / 10) * i * 0.18], 2.2, 0.8, 0xff5030);
        this.audio.play('roar', 0.6);
        break;
      }
      case 'sm': {
        const [, , x, z] = e;
        const X = x / 10, Z = z / 10, y = this.world.heightAt(X, Z);
        for (let i = 0; i < 12; i++) this.fx.smoke.emit({ p: [X, y + 0.5, Z], v: [(Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3], life: 1.5, s0: 1, s1: 3, c0: [0.1, 0.05, 0.12, 0.8], c1: [0.1, 0.05, 0.12, 0] });
        break;
      }
      case 'bl': {
        const [, , x0, z0, x1, z1] = e;
        for (const [X, Z] of [[x0 / 10, z0 / 10], [x1 / 10, z1 / 10]]) {
          const y = this.world.heightAt(X, Z);
          for (let i = 0; i < 20; i++) this.fx.smoke.emit({ p: [X, y + Math.random() * 2.5, Z], v: [(Math.random() - 0.5) * 4, Math.random() * 2, (Math.random() - 0.5) * 4], life: 1.2, s0: 1, s1: 3, c0: [0.05, 0.08, 0.16, 0.85], c1: [0.04, 0.06, 0.12, 0] });
          this.fx.flash([X, y + 2, Z], 0x5a8aff, 25, 0.4, 12);
        }
        this.audio.play('demon', 0.5);
        break;
      }
    }
    if (k === 'msg') this.ui.killfeed(e[2]);
  }

  // Closest living teammate whose body the ray passes through, before maxDist.
  teammateOnRay(o, d, maxDist) {
    let best = null;
    const c = new THREE.Vector3();
    for (const [id, v] of this.views.players) {
      if (!v.model.visible || v.dead) continue;
      for (const hy of [0.5, 1.0, 1.45]) {
        c.set(v.pos.x, v.pos.y + hy, v.pos.z).sub(o);
        const t = c.dot(d);
        if (t < 0.3 || t > maxDist) continue;
        const miss = c.addScaledVector(d, -t).length();
        if (miss < 0.42 && (!best || t < best.t)) best = { id, t, point: o.clone().addScaledVector(d, t) };
      }
    }
    return best;
  }

  healTeammate(id, amt) {
    this.emitFx(['heal', id, amt]);
    this.audio.play('heal', 0.35);
  }

  playerChest(id) {
    const v = this.views.players.get(id);
    return v ? [v.pos.x, v.pos.y + 1.4, v.pos.z] : null;
  }

  onPhase(ph, prev) {
    const p = this.player;
    this.ui.phase(ph, prev);
    if (ph === 'vote') { this.myVote = null; this.audio.play('round'); }
    if (ph === 'boss') {
      this.audio.play('roar');
      const def = BOSSES[bossIdx(this.runSeed, this.round)];
      this.ui.banner(def.name, this.round >= CONFIG.rounds ? 'Bonus boss' : 'Round ' + (this.round + 1) + ' boss');
    }
    if (this.seat !== 2 && ph === 'play') this.audio.startRunMusic(stageIdx(this.runSeed, this.round)); // each stage has its own song
    if (ph === 'spaceq') {
      this.unlockPointer();
      if (this.isHost && this.sim && (this.brain || this.headless || (this.runStats && this.runStats.cpuUsed))) this.answerSpace(false); // a run the CPU touched never goes to space
    }
    if (ph === 'sproam') { this.ui.banner('Loot up', 'The ship leaves for space in 60 seconds'); this.lockPointer(); }
    if (ph === 'bless') this.offerBlessings();
    if (ph === 'bless') this.runStats.roundsCleared = this.round + 1;
    if (ph === 'demon') this.ui.banner('Death', 'She will hunt you until you fall');
    if (this.seat !== 2) this.audio.setMusicIntensity(ph === 'boss' || ph === 'demon' ? 1 : 0);
    if (ph === 'over' || ph === 'win') this.endRun(ph === 'win');
    if (this.duel) this.onDuelPhase(ph, prev);
  }

  onDuelPhase(ph, prev) {
    if (ph === 'dcount') {
      this.duelEndOpen = false; this.ui.duelEnd(null);
      if (this.seat !== 2 && !this.headless) this.audio.startRunMusic(this.world && this.world.biome.stage != null ? this.world.biome.stage : DUEL.stage);
    }
    if (ph === 'duel' && (prev === 'dcount' || prev === 'dpick')) this.lockPointer();
    if (ph === 'dend') {
      this.dendAt = this.now;
      if (this.seat !== 2) this.audio.setMusicIntensity(1);
    }
  }

  // The winner screen: Rematch or Return to lobby.
  showDuelEnd() {
    const p = this.player, me = this.party.myId, w = this.duelWinner;
    this.duelEndOpen = true;
    this.elemOpen = false; this.ui.elem(null);
    const result = !w ? 'draw' : w === me ? 'win' : 'lose';
    const winner = w ? (w === me ? this.myName : this.nameOf(w) || 'Your opponent') : '';
    const t = Math.round(DUEL.len - (this.tl || 0));
    this.unlockPointer();
    this.audio.play(result === 'win' ? 'bless' : 'death', 0.8);
    this.ui.duelEnd({
      result, winner, timeUp: (this.tl || 0) <= 0,
      stats: [['Damage dealt', Math.round(p.damageDealt * DUEL.pvp)], ['Power-ups', p.powerups.length], ['Health left', Math.max(0, Math.ceil(p.hp)) + ' / ' + Math.round(p.stats.maxHp)], ['Match time', Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0')]],
    });
  }

  rematch() {
    if (!this.duel || this.phase !== 'dend') return;
    if (this.isHost) {
      if (!this.party.peers().some((q) => !q.me && q.p && q.p.ig)) { this.ui.toast('Your opponent has left the match', 'bad'); return; }
      this.sim.startDuel();
    } else this.request('rematch');
  }

  // Take the controls back from the CPU in the middle of an autoplay run.
  takeOver() {
    if (!this.brain || this.brain.mode !== 'run') return;
    this.input.pressed.delete('KeyP'); // so the same press doesn't hand them straight back
    this.brain = null;
    this.ui.cpuFlag(false);
    this.ui.toast('You have the controls. ' + this.ui.ctl('cpu') + ' hands them back to the CPU', 'good');
    this.ui.setLocked(false, false);
  }
  // Hand the controls (back) to the CPU mid-run. Solo runs only. Nothing a CPU-played run does counts toward the Unlockables.
  giveToCpu() {
    if (!this.autoplay) return; // only when the lobby's "CPU Run" box is checked
    if (this.brain || this.mode !== 'game' || this.duel || !this.party || this.party.kind !== 'solo' || !this.player || !this.player.alive) return;
    this.brain = new Bot(this, 'run');
    this.runStats.cpuUsed = true;
    this.ui.cpuFlag(true);
    this.ui.toast('The CPU has the controls. ' + this.ui.ctl('takeover') + ' takes them back', '');
  }

  // ---------------- remote players ----------------
  updateRemotePlayers(peers, dt) {
    const seen = new Set();
    for (const pr of peers) {
      if (pr.me || !pr.p || !pr.p.ig || !Array.isArray(pr.p.p)) continue;
      seen.add(pr.id);
      let v = this.views.players.get(pr.id);
      if (!v) { v = new RemotePlayerView(this.scene, pr.id, pr.p); v.audio = this.audio; v.game = this; this.views.players.set(pr.id, v); }
      v.size = this.duel ? DUEL.size : 1;
      v.update(pr.p, dt, this.camera, this.fx);
      if (pr.p.sh && !v.shieldWas) { if (v.armorFx) v.armorFx.end(); v.armorFx = this.el.rockArmor(() => [v.pos.x, v.pos.y, v.pos.z, v.yaw], 8); }
      else if (!pr.p.sh && v.shieldWas && v.armorFx) { v.armorFx.end(); v.armorFx = null; }
      v.shieldWas = pr.p.sh;
      // Their effects.
      if (Array.isArray(pr.p.f)) {
        const last = this.remoteFxSeen.get(pr.id) || 0;
        let max = last;
        for (const f of pr.p.f) {
          if (!Array.isArray(f) || f[0] <= last) continue;
          max = Math.max(max, f[0]);
          if (last === 0 && this.now < 2) continue;
          this.playRemoteFx(v, f);
        }
        this.remoteFxSeen.set(pr.id, max);
      }
    }
    for (const [id, v] of this.views.players) if (!seen.has(id)) { v.dispose(); this.views.players.delete(id); }
  }

  playRemoteFx(v, f) {
    const kind = f[1], a = f.slice(2);
    const P = (i) => [a[i] / 10, a[i + 1] / 10, a[i + 2] / 10];
    const D = (i) => [a[i] / 100, a[i + 1] / 100, a[i + 2] / 100];
    const vol = this.distVol(v.pos.x, v.pos.z);
    switch (kind) {
      case 'shot': {
        const wp = WEAPON_BY_ID[a[6]] || {};
        if (wp.bow || wp.bolt) {
          // Longbow / crossbow: a real arrow or bolt flies from the teammate's bow (no damage from this copy).
          const o = P(0), e = P(3); launchArrow(this, o, [e[0] - o[0], e[1] - o[1], e[2] - o[2]], wp.bolt ? { speed: wp.boltSpeed || 95, proto: boltProto() } : { speed: wp.speed || 60, style: longbowPick() });
        } else if (wp.eyes) {
          // Laser Vision: twin beams from that player's eyes (one event stands for a pair of pulses).
          const rig = v.model.userData.rig;
          this.fx.laserBeams(rig ? rig.eyesWorld() : [P(0), P(0)], P(3), 'r' + v.id, false, 0.2);
          if (Math.random() < 0.5) this.fx.laserHit(P(3));
        } else if (wp.energy) { this.fx.shotFx(wp, P(0), P(3), 'r' + v.id, false, 0.2); this.fx.pulseMuzzle(P(0)); }
        else { this.fx.tracer(P(0), P(3), wp.tracer, wp.beamLen); if (!wp.quiet) { const o = P(0), e = P(3); this.fx.muzzle(o, [e[0] - o[0], e[1] - o[1], e[2] - o[2]], undefined, flashSize(wp.id)); } }
        this.audio.play('shot_' + a[6], vol * (wp.quiet ? 0.5 : 0.7));
        break;
      }
      case 'rk': { const wp = WEAPONS[a[6]] || {}; this.launchProjectile(wp.proj || 'rocket', P(0), D(3), { speed: wp.speed || 50 }); this.fx.muzzle(P(0), D(3)); this.audio.play('shot_' + wp.id, vol); break; }
      case 'melee': this.audio.play('swing', vol * 0.6); break;
      case 'fq': this.el.fireball(P(0), D(3), { pierce: true, speed: 46, range: 130 }); this.audio.play('fire_cast', vol); break;
      case 'fw': this.el.firewall(P(0), P(3), 6); this.audio.play('inferno', vol); break;
      case 'fr': this.el.inferno(() => [v.pos.x, v.pos.y, v.pos.z], 5, 8); this.audio.play('inferno', vol); break;
      case 'eq': this.audio.play('earth', vol); break;
      case 'er': this.el.quake(P(0), D(3), 22); this.audio.play('quake', vol); break;
      case 'eb': this.el.boulder(P(0), D(3), { hitTest: (pos) => this.targets().some((t) => Math.hypot(t.x - pos.x, t.z - pos.z) < t.r + 0.7 && pos.y < t.y + t.h + 0.4), onImpact: () => this.audio.play('quake', vol * 0.6) }); this.audio.play('earth', vol); break;
      case 'ep': { const pts = []; for (let i = 0; i + 2 < a.length; i += 3) pts.push(P(i)); this.el.pillars(pts, [v.pos.x, v.pos.y, v.pos.z]); this.audio.play('quake', vol); break; }
      case 'es': this.el.armorShock(P(0)); this.audio.play('earth', vol * 0.5); break;
      case 'sq': { const pts = []; for (let i = 0; i + 2 < a.length; i += 3) pts.push(P(i)); this.el.chain(pts); this.audio.play('zap', vol); break; }
      case 'sr': this.el.thunderstorm(P(0), a[3], 4, 13); this.audio.play('thunder', vol); break;
      case 'iq': this.el.frostNova(P(0), a[3] ? a[3] / 10 : 7); this.audio.play('ice', vol); break;
      case 'is': { const pts = []; for (let i = 3; i + 2 < a.length; i += 3) pts.push(P(i)); Vault.crystals(this, P(0), pts); this.audio.play('ice', vol); break; }
      // ---- the Elemental Vault ----
      case 'fs': { const o = P(0); for (let i = 3, k = 0; i + 2 < a.length; i += 3, k++) { const to = P(i), dx = to[0] - o[0], dz = to[2] - o[2], l = Math.hypot(dx, dz) || 1; Vault.seeker(this, o, [dx / l, 0.6, dz / l], null, to, null, k * 0.12); } this.audio.play('fire_cast', vol); break; }
      case 'bo': {
        const m = this._orbits || (this._orbits = new Map()), h = m.get(v);
        if (h && h.alive) h.set(a[0]);
        else if (a[0] > 0) m.set(v, Vault.orbit(this, () => (v.alive && this.views.players.get(v.id) === v ? [v.pos.x, v.pos.y + 1.25, v.pos.z] : null), a[0]));
        break;
      }
      case 'tb': Vault.blink(this, P(0), P(3)); this.audio.play('zap', vol); break;
      case 'nl': { // Life Drain: one pull of blood from that spot into the runner
        const at = P(0), end = this.now + 0.3;
        Vault.drain(this, () => (v.alive && this.now < end ? [v.pos.x, v.pos.y + 1.2, v.pos.z] : null), () => at, 0.3);
        this.fx.blood(at, [0.35, 0.05, 0.08]);
        break;
      }
      case 'na': Vault.acid(this, P(0)); this.audio.play('necro_fall', vol); break;
      case 'nt': { // Black Thorn Vines: a[3] = seconds they stand; then 'nx' sends the thorns out
        Vault.vines(this, P(0), 7, a[3] / 10); this.audio.play('earth', vol); break;
      }
      case 'nx': { const o = P(0), ends = []; for (let i = 3; i + 2 < a.length; i += 3) ends.push(P(i)); Vault.thorns(this, o, ends.map((e) => () => e)); this.audio.play('swing', vol); break; }
      case 'ny': Vault.scythe(this, () => (v.alive ? [v.pos.x, v.pos.y, v.pos.z] : null), a[0] / 100); this.audio.play('swing', vol); break;
      case 'ng': { // Ghost Walk: that runner's spirit is out for a[3]/10 s; their body waits at P(0)
        const until = this.now + a[3] / 10, body = P(0);
        if (a[3] <= 0) { v.spiritEnd = 0; break; }
        v.spirit = true; v.spiritEnd = until;
        Vault.spirit(this, () => (v.alive && this.now < v.spiritEnd && this.views.players.get(v.id) === v ? [v.pos.x, v.pos.y, v.pos.z] : null), null, body, () => { v.spirit = false; });
        this.audio.play('necro_rise', vol);
        break;
      }
      case 'nc': Vault.crows(this, P(0), 8, 5); this.audio.play('wind', vol); break;
      case 'ns': { const until = this.now + 8; Vault.supper(this, () => (v.alive && this.now < until && this.views.players.get(v.id) === v ? [v.pos.x, v.pos.y, v.pos.z] : null), 8); break; }
      case 'nd': { for (let i = 0; i + 3 < a.length; i += 4) Vault.soul(this, P(i), a[i + 3] / 10); this.audio.play('necro_fall', vol); break; }
      case 'nr': { const until = this.now + 10; Vault.raise(this, () => (v.alive && this.now < until && this.views.players.get(v.id) === v ? [v.pos.x, v.pos.y, v.pos.z] : null), 10); this.audio.play('necro_rise', vol); break; }
      case 'tf': { // Tesla Fence: 1 = first post, 2 = both posts (strung), 3 = health % and where it was hit, 0 = destroyed
        const m = this._fences || (this._fences = new Map());
        let h = m.get(v); if (h && !h.alive) h = null;
        if (a[0] === 0) { if (h) h.end(true); m.delete(v); this.audio.play('thunder', vol); break; }
        if (a[0] === 3) { if (h) { h.hp(a[1] / 100); h.zap(a[2] / 100); } this.audio.play('zap', vol * 0.8); break; }
        if (a[0] === 1) { if (h) h.end(false); h = Vault.fence(this); m.set(v, h); h.post(P(1)); }
        else { if (!h) { h = Vault.fence(this); m.set(v, h); h.post(P(1)); } h.post(P(4)); }
        this.audio.play('zap', vol);
        break;
      }
      case 'fd': case 'rj': { // Dragon Breath / Pressure Jet: the stream follows where that runner faces
        const until = this.now + a[0] / 10;
        const ray = () => { if (!v.alive || this.now > until || this.views.players.get(v.id) !== v) return null; const cp = Math.cos(v.pitch || 0); return { o: [v.pos.x + Math.sin(v.yaw) * 0.6, v.pos.y + 1.45, v.pos.z + Math.cos(v.yaw) * 0.6], d: [Math.sin(v.yaw) * cp, -Math.sin(v.pitch || 0), Math.cos(v.yaw) * cp] }; };
        if (kind === 'fd') { Vault.breath(this, ray, a[0] / 10, 18); this.audio.play('inferno', vol); } else { Vault.jet(this, ray, a[0] / 10, 45); this.audio.play('ice', vol); }
        break;
      }
      case 'rw': Vault.whirlpool(this, P(0)); this.audio.play('ice_big', vol); break;
      case 'rs': { // Snowball: it grows with the distance that runner rolls, the same rule as their own game uses
        const until = this.now + a[0] / 10, S = { r: 1.1, last: [v.pos.x, v.pos.z] };
        v.ball = true;
        Vault.snowball(this, () => {
          if (!v.alive || this.now > until || this.views.players.get(v.id) !== v) return null;
          const md = Math.hypot(v.pos.x - S.last[0], v.pos.z - S.last[1]); if (md < 20) S.r = Math.min(3.4, S.r + md * 0.03); S.last = [v.pos.x, v.pos.z];
          return { p: [v.pos.x, v.pos.y, v.pos.z], r: S.r };
        }, () => { v.ball = false; });
        this.audio.play('ice', vol);
        break;
      }
      case 'bm': Vault.meteor(this, P(0), () => this.audio.play('quake', vol)); this.audio.play('fire_cast', vol); break;
      case 'bs': Vault.stomp(this, P(0)); this.audio.play('quake', vol); break;
      case 'hr': this.healRain(P(0), !this.duel); this.audio.play('ice', vol); break;
      case 'az': { const c = P(0); Vault.zero(this, c); this.zeroZone = { x: c[0], z: c[2], r: 24, until: this.now + 5 }; this.audio.play('ice_big', vol); break; }
      case 'wc': { const until = this.now + a[0] / 10; v.mist = true; Vault.mist(this, () => (v.alive && this.now < until && this.views.players.get(v.id) === v ? [v.pos.x, v.pos.y, v.pos.z] : null), () => { v.mist = false; }); this.audio.play('howl', vol * 0.6); break; }
      case 'wt': {
        const x = a[0] / 10, z = a[1] / 10;
        if (a[2] || !v._tw || v._tw.until < this.now) {
          const w = v._tw = { x, z, r: 8, until: this.now + 6.2 }, cc = [x, z];
          this.windZones = (this.windZones || []).filter((q) => q.until > this.now); this.windZones.push(w);
          const steer = () => { const dx = w.x - cc[0], dz = w.z - cc[1], d = Math.hypot(dx, dz); steer.k = Math.min(1.3, d / 3); return d > 0.3 ? [dx / d, 0, dz / d] : [0, 0, 1]; };
          this.el.cyclone([x, this.world.heightAt(x, z), z - 3], steer, 6, 17, (c) => { cc[0] = c[0]; cc[1] = c[2]; });
          this.audio.play('cyclone', vol);
        } else { v._tw.x = x; v._tw.z = z; }
        break;
      }
      case 'ib': this.el.iceBarrier(P(0), P(3), 8); this.audio.play('ice_big', vol); break;
      // 'ic' with a 'P:id' target: a duelist sealed in ice (their own game emits it)
      case 'ic': { const tv = a[0] === 'B' ? this.views.boss : typeof a[0] === 'string' && a[0][0] === 'P' ? this.views.players.get(a[0].slice(2)) : this.views.mobs.get(a[0]); if (tv) this.el.encase(tv, a[1] / 10, a[2] / 10, a[3] ? a[3] / 10 : 10); break; }
      case 'gv': this.gravWell(P(0), v.id); break;
      case 'zs': this.fx.impact(P(0)); this.fx.shockwave(P(0), 5, 0xff5a1a, 0.45); this.audio.play('summon', vol); break;
      case 'hs': {
        const rig = v.model.userData.rig;
        this.el.holyBurst([v.pos.x, v.pos.y, v.pos.z], 0.5);
        this.healStaffFx(() => (rig ? rig.muzzleWorld().toArray() : [v.pos.x, v.pos.y + 1.6, v.pos.z]), a.slice(1), a[0], v.id, Math.max(0.25, vol));
        break;
      }
      case 'tw': this.el.tsunami(P(0), D(3), 24, 13); this.audio.play('ice_big', vol); break;
      case 'we': if (v.eyeFx) v.eyeFx.end(); v.eyeFx = this.el.eyeStorm(() => [v.pos.x, v.pos.y, v.pos.z], 6, a[0] / 10); this.audio.play('howl', vol); break;
      case 'ir': this.el.glacier(P(0), D(3), 26); this.audio.play('ice_big', vol); break;
      case 'tr': this.el.tremor(P(0), 9); this.audio.play('quake', vol); break;
      case 'sw': this.el.shockwave(P(0), 32, 40); this.audio.play('thunder', vol); break;
      case 'ts': this.el.strike(P(0)[0], P(0)[2], 1.8); this.audio.play('thunder', vol); break;
      case 'df': this.el.frostNova(P(0), 11); this.audio.play('ice_big', vol); break;
      case 'wv': this.el.stormVeil(() => [v.pos.x, v.pos.y, v.pos.z], () => [Math.sin(v.yaw), Math.cos(v.yaw)], 20, 3); this.audio.play('howl', vol); break;
      case 'dh': this.el.dash((CLASSES[a[0]] || CLASSES[0]).element, [a[1] / 10, a[2] / 10, a[3] / 10], [a[4] / 10, a[5] / 10, a[6] / 10]); break;
      case 'wr': this.el.cyclone(P(0), D(3), 5, 6); this.audio.play('cyclone', vol); break;
      case 'die': this.fx.dustBurst([v.pos.x, v.pos.y, v.pos.z], 0.8); if (v.eyeFx) { v.eyeFx.end(); v.eyeFx = null; } break;
      case 'bld': this.fx.playerBlood(P(0), D(3), a[6] / 10); break;
      case 'heal': {
        const tv = this.views.players.get(a[0]);
        if (a[0] === this.party.myId && this.player) { const p = this.player; p.heal(a[1]); this.audio.play('heal', 0.5); this.ui.healFlash(); this.el.healAura([p.pos.x, p.pos.y, p.pos.z]); }
        else if (tv) this.el.healAura([tv.pos.x, tv.pos.y, tv.pos.z]);
        this.el.healAura([v.pos.x, v.pos.y, v.pos.z], 0.4);
        break;
      }
    }
  }

  emitFx(arr) {
    this.fxOut.push({ t: this.now, e: [++this.fxSeq, ...arr] });
  }

  queueHit(id, dmg, o = {}) {
    const h = [++this.hitSeq, id, Math.round(dmg), o.slow || 0, o.freeze || 0, o.burn || 0, q10(o.kx || 0), q10(o.kz || 0), o.lock || 0, o.launch || 0];
    this.hits.push(h);
  }

  giftPC(toId, amt) {
    const p = this.player;
    amt = Math.floor(amt / 10) * 10;
    if (!p || amt < 10 || p.pc < amt) return false;
    p.pc -= amt;
    this.request('gift', [toId, amt]);
    this.audio.play('ui');
    return true;
  }
  request(kind, arg) { this.reqs.push([++this.reqSeq, kind, arg]); }

  // ---------------- combat helpers ----------------
  targets() {
    const out = [];
    for (const v of this.views.mobs.values()) if (v.hp > 0) out.push(v.target());
    if (this.views.boss) out.push(this.views.boss.target());
    if (this.views.demon) out.push(this.views.demon.target());
    // Duel Arena: the other fighter is a target.
    if (this.duel && this.phase === 'duel') for (const [id, v] of this.views.players) if (v.alive) out.push({ id: 'P:' + id, kind: 'player', x: v.pos.x, y: v.pos.y, z: v.pos.z, r: 0.55 * DUEL.size, h: 1.85 * DUEL.size, view: v });
    return out;
  }

  // Ray against vertical capsules; returns hits sorted by distance.
  rayHit(origin, dir, maxDist, pierce = 1) {
    const ground = this.groundRay(origin, dir, maxDist);
    const limit = ground.hit ? ground.dist : maxDist;
    const res = [];
    const hv = (this._hv = this._hv || new THREE.Vector3());
    for (const t of this.targets()) {
      // The real head first: wherever the body's head actually is (hunched, flying, leaning), a shot through it is a headshot.
      let headAt = -1;
      const hb = t.kind !== 'demon' && t.view && t.view.rig && t.view.rig.bn && t.view.rig.bn.head;
      if (hb) {
        hb.getWorldPosition(hv);
        const hr = Math.max(0.2, t.h * 0.105) * (t.big ? 2.1 : 1);
        hv.y += hr * 0.45; // the joint is at the base of the skull
        if (Math.abs(hv.x - t.x) < t.h && Math.abs(hv.z - t.z) < t.h && hv.y > t.y - 0.5 && hv.y < t.y + t.h * 1.6) {
          const vx = hv.x - origin.x, vy = hv.y - origin.y, vz = hv.z - origin.z, tca = vx * dir.x + vy * dir.y + vz * dir.z;
          const d2h = vx * vx + vy * vy + vz * vz - tca * tca;
          if (tca > 0 && d2h < hr * hr) { const th = tca - Math.sqrt(hr * hr - d2h); if (th <= limit) headAt = Math.max(0, th); }
        }
      }
      const headHit = () => { if (headAt < 0) return false; res.push({ t, dist: headAt, point: new THREE.Vector3(origin.x + dir.x * headAt, origin.y + dir.y * headAt, origin.z + dir.z * headAt), zone: 'head', head: true }); return true; };
      // Closest point between the ray and the target's vertical axis.
      const ox = origin.x - t.x, oz = origin.z - t.z;
      const a = dir.x * dir.x + dir.z * dir.z;
      if (a < 1e-6) { headHit(); continue; }
      const tc = -(ox * dir.x + oz * dir.z) / a;
      if (tc < 0 || tc > limit + t.r) { headHit(); continue; }
      const cx = ox + dir.x * tc, cz = oz + dir.z * tc;
      const d2 = cx * cx + cz * cz;
      if (d2 > t.r * t.r) { headHit(); continue; }
      const back = Math.sqrt((t.r * t.r - d2) / a);
      const th = Math.max(0, tc - back);
      if (th > limit) { headHit(); continue; } // behind the ground or a rock
      const y = origin.y + dir.y * th;
      if (y < t.y - 0.1 || y > t.y + t.h + 0.15) { headHit(); continue; }
      if (headAt >= 0 && headAt <= th + 0.8) { headHit(); continue; }
      const point = new THREE.Vector3(origin.x + dir.x * th, y, origin.z + dir.z * th);
      const zone = t.kind === 'demon' ? 'body' : zoneOf(t, y, d2);
      res.push({ t, dist: th, point, zone, head: zone === 'head' });
    }
    res.sort((a, b) => a.dist - b.dist);
    return res.slice(0, pierce);
  }

  // The first thing a shot meets: the ground, or (in the Duel Arena) a wall or step.
  groundRay(origin, dir, maxDist) {
    const r = this.terrainRay(origin, dir, maxDist), w = this.world;
    if (w.solids.length) {
      const sd = w.rayBlock(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxDist);
      if (sd < r.dist) { r.copy(origin).addScaledVector(dir, sd); r.hit = true; r.dist = sd; }
    }
    // Trees, rocks, tombs and buildings stop bullets too (never the cover right beside the shooter, or a trunk
    // between a third-person camera and its player).
    const pl = this.player;
    let tMin = 0.5;
    if (pl) { const t = (pl.pos.x - origin.x) * dir.x + (pl.pos.y + 1.2 - origin.y) * dir.y + (pl.pos.z - origin.z) * dir.z; if (t > 0 && t < 12) tMin = t + 0.7; }
    const pd = w.rayProps(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, Math.min(maxDist, r.dist), tMin);
    if (pd < r.dist) { r.copy(origin).addScaledVector(dir, pd); r.hit = true; r.dist = pd; r.prop = true; }
    return r;
  }

  terrainRay(origin, dir, maxDist) {
    const w = this.world;
    let prev = 0;
    for (let d = 0.5; d <= maxDist; d += 1.5) {
      const x = origin.x + dir.x * d, y = origin.y + dir.y * d, z = origin.z + dir.z * d;
      if (y < w.heightAt(x, z)) {
        let lo = prev, hi = d;
        for (let i = 0; i < 8; i++) {
          const m = (lo + hi) / 2;
          const mx = origin.x + dir.x * m, my = origin.y + dir.y * m, mz = origin.z + dir.z * m;
          if (my < w.heightAt(mx, mz)) hi = m; else lo = m;
        }
        const r = new THREE.Vector3(origin.x + dir.x * hi, origin.y + dir.y * hi, origin.z + dir.z * hi);
        r.hit = true; r.dist = hi;
        return r;
      }
      prev = d;
    }
    const r = new THREE.Vector3().copy(origin).addScaledVector(dir, maxDist);
    r.hit = false; r.dist = maxDist;
    return r;
  }

  damage(t, dmg, o = {}) {
    const p = this.player;
    const pos = o.at || [t.x, t.y + t.h * 0.7, t.z];
    if (t.kind === 'demon') { this.ui.damageNumber(this.project(pos), 'IMMUNE', 'immune'); return; }
    // Physical power-ups: Killer Instinct crits, Executioner finishes the wounded, Heavy Rounds shove.
    if (!o.chain) { // the other duelist is an enemy like any other: crits, executes and shoves land on them too (Nutty 2026-11-11)
      if (p.stats.crit && Math.random() < p.stats.crit) { dmg *= 2; o = { ...o, crit: true }; }
      if (p.stats.execute && t.view && (t.kind === 'player' ? t.view.hp / (t.view.mh || 1) : t.view.hp) < 0.34) dmg *= 1 + p.stats.execute;
      if (p.stats.kb && !o.kx && !o.kz) { const dx = t.x - p.pos.x, dz = t.z - p.pos.z, dd = Math.hypot(dx, dz) || 1; o = { ...o, kx: dx / dd * p.stats.kb, kz: dz / dd * p.stats.kb }; }
    }
    dmg = Math.round(dmg);
    const E = p.stats.elem;
    if (E && !o.chain) {
      // Elemental power-ups ride on every hit the player lands.
      o = { ...o };
      if (E.fire) o.burn = Math.max(o.burn || 0, 1 + E.fire);
      if (E.frost) {
        o.slow = Math.max(o.slow || 0, 1.5 + 0.5 * E.frost);
        if (Math.random() < Math.min(0.5, 0.03 + 0.04 * E.frost)) o.freeze = Math.max(o.freeze || 0, 1.2);
      }
      if (E.storm && dmg > 0 && t.kind !== 'player' && this.now - (this._chainT || -9) > 0.14) { // (a duel has no other target to arc to)
        this._chainT = this.now;
        const near = this.targets().filter((q) => q !== t && q.kind !== 'demon' && Math.hypot(q.x - t.x, q.z - t.z) < 8).sort((a, b) => Math.hypot(a.x - t.x, a.z - t.z) - Math.hypot(b.x - t.x, b.z - t.z));
        for (const q of near.slice(0, 1 + E.storm)) {
          this.fx.bolt([t.x, t.y + t.h * 0.6, t.z], [q.x, q.y + q.h * 0.6, q.z], { width: 0.35, dur: 0.18, color: 0xb8c8ff, branches: 1 });
          this.damage(q, dmg * 0.35, { chain: true, silent: true, at: [q.x, q.y + q.h * 0.6, q.z] });
        }
      }
    }
    if (t.kind === 'mob') this.hitSrc.set(t.id, o.src || 'player'); // who landed the last hit, for the kill counters
    if (t.kind === 'mob' && !o.chain) {
      const w = p.weapon || {};
      this.hitInfo.set(t.id, { head: !!o.head, wk: o.src ? 'gear' : w.kind === 'gear' ? 'gear' : w.kind === 'melee' ? 'melee' : (w.bow || w.bolt) ? 'bow' : 'gun' });
      if (o.head && !o.silent && this.dailyOn()) Dailies.add('headHits');
    }
    this.queueHit(t.id, dmg, o);
    // Against the other duelist the host scales hits down; show and count what actually lands.
    const eff = t.kind === 'player' ? Math.max(1, Math.round(dmg * DUEL.pvp)) : dmg;
    if (t.kind === 'player' && p.supperUntil > this.now && !o.silent) p.supperFeed(pos, 0.4); // Last Supper in a duel: every hit you land feeds you a little
    if (!o.kill) p.damageDealt += dmg; // Finger of Death kills outright: it is not damage for the records
    if (t.kind !== 'player' && dmg > 0 && !o.kill && this.dailyOn()) Dailies.add('dmg', Math.round(dmg));
    if (p.stats.lifesteal) p.heal(eff * p.stats.lifesteal);
    if (!o.silentNum && !o.silent) this.ui.damageNumber(this.project(pos), o.shown != null ? Math.round(o.shown * (eff / (dmg || 1))) : eff, o.head ? 'crit' : o.crit ? 'pcrit' : o.zone === 'arm' || o.zone === 'leg' ? 'limb' : t.kind === 'boss' ? 'boss' : '');
    if (!o.silent) { this.ui.hitmarker(false, !!o.head); this.audio.play('hit'); }
    if (o.at && !o.silent) this.fx.blood(Array.isArray(o.at) ? o.at : [o.at.x, o.at.y, o.at.z], t.kind === 'boss' ? [0.3, 0.2, 0.05] : [0.35, 0.05, 0.08]);
    // Local prediction: dim the bar right away.
    if (t.view && t.kind === 'mob') t.view.hp = Math.max(0.01, t.view.hp - dmg / (t.view.base.hp * (1 + 0.38 * (this.round || 0)) * (t.view.mini ? MINI.hpMul + (this.round || 0) * MINI.hpPerRound : 1)));
  }

  // Gravity Gun well: every peer shows the vortex and its collapse; the host (sim) pulls and blasts the enemies.
  // Everyone but the shooter is dragged toward the centre here, on their own character: friends are only teased
  // and never hurt, while in the Duel Arena the host's lethal blast catches the other duelist as they arrive.
  gravWell(c, from) {
    const p = this.player;
    this.el.gravityWell(c, { dur: GRAV.dur, pull: GRAV.pull, blast: GRAV.blast, onCollapse: () => {
      const dist = this.distTo(c[0], c[2]);
      this.audio.play('grav_boom', Math.max(0.2, 1 - dist / 90));
      this.shake(Math.max(0, 0.7 - dist / 45));
    } });
    this.audio.play('grav_pull', Math.max(0.2, 1 - this.distTo(c[0], c[2]) / 90));
    if (p && p.alive && from !== this.party.myId && Math.hypot(p.pos.x - c[0], p.pos.z - c[2]) < GRAV.pull) p.gravPull = { x: c[0], z: c[2], t: GRAV.dur };
  }

  // Healing Staff, seen by everyone: a golden beam bends from `src()` (the crystal) to each ally id in `ids`, following them
  // for HEAL.beam seconds. The ally's own client does the healing (pct of max HP); the user's self heal is in Player.staffHeal.
  healStaffFx(src, ids, pct, from, vol = 0.9) {
    const p = this.player, me = this.party.myId, tgts = [];
    for (const id of ids) {
      const v = this.views.players.get(id);
      if (id === me && p) tgts.push(() => [p.pos.x, p.pos.y + 1.2, p.pos.z]);
      else if (v) tgts.push(() => [v.pos.x, v.pos.y + 1.2, v.pos.z]);
    }
    this.el.healBeams(src, tgts, HEAL.beam);
    this.audio.play('heal_staff', vol);
    if (from !== me && ids.includes(me) && p && p.alive) { p.heal(p.stats.maxHp * pct / 100); this.ui.healFlash(); }
  }

  // Rocket or grenade in flight. Every peer runs the visuals; only the shooter passes `dmg`, whose blast is
  // reported through the normal hits list (areaDamage -> damage -> queueHit), so the host stays the one
  // applying damage. The shooter's own character is never hurt by the blast.
  launchProjectile(kind, o, d, { dmg = 0, radius = 6, falloff = 0.5, kb = 12, speed = 50, mine = false } = {}) {
    const w = this.world, rocket = kind === 'rocket';
    const touch = (pos) => {
      if (w.solidPoint(pos.x, pos.y, pos.z)) return true; // trees, stones, tombs, buildings, duel walls and steps
      if (this._tgAt !== this.now) { this._tgAt = this.now; this._tg = this.targets(); }
      for (const t of this._tg) if (Math.hypot(t.x - pos.x, t.z - pos.z) < t.r + 0.25 && pos.y > t.y - 0.3 && pos.y < t.y + t.h + 0.3) return true;
      return false;
    };
    if (mine && this.player && this.duel) {
      // Duel fighters are drawn 2.25x, so the muzzle sits well out in front of the body: an opponent standing between the two
      // would be skipped. Walk from the body to the muzzle and burst on the first duelist in the way.
      const p = this.player, sy = p.pos.y + 1.2, dx = o[0] - p.pos.x, dy = o[1] - sy, dz = o[2] - p.pos.z, L = Math.hypot(dx, dy, dz);
      const foes = L > 0.5 ? this.targets().filter((t) => t.kind === 'player') : [];
      for (let s = 0.5; foes.length && s < L; s += 0.5) {
        const qx = p.pos.x + dx * s / L, qy = sy + dy * s / L, qz = p.pos.z + dz * s / L;
        if (foes.some((t) => Math.hypot(t.x - qx, t.z - qz) < t.r + 0.25 && qy > t.y - 0.3 && qy < t.y + t.h + 0.3)) { o = [qx, qy, qz]; break; }
      }
    }
    this.fx.projectile(kind, o, d, {
      speed, hitTest: touch, size: rocket ? 2 : 1.25,
      onExplode: (p) => {
        if (mine && dmg) this.areaDamage(p, radius, dmg, { falloff, kb });
        const dist = this.distTo(p[0], p[2]);
        this.shake(Math.max(0, (rocket ? 0.6 : 0.35) - dist / 70));
        this.audio.play(rocket ? 'boom' : 'explode', Math.max(0.15, 1 - dist / 90));
      },
    });
  }

  // Damage every target within r of the ground segment a-b (a wall of fire, say).
  lineDamage(a, b, r, dmg, o = {}) {
    const vx = b[0] - a[0], vz = b[2] - a[2], L2 = vx * vx + vz * vz || 1;
    for (const t of this.targets()) {
      if (t.kind === 'demon') continue;
      const s = Math.max(0, Math.min(1, ((t.x - a[0]) * vx + (t.z - a[2]) * vz) / L2));
      const d = Math.hypot(t.x - (a[0] + vx * s), t.z - (a[2] + vz * s)) - t.r;
      if (d > r || t.y > a[1] + 3.5) continue;
      this.damage(t, dmg, { ...o });
    }
  }

  areaDamage(c, r, dmg, o = {}) {
    let n = 0;
    for (const t of this.targets()) {
      if (t.kind === 'demon') continue;
      const dx = t.x - c[0], dz = t.z - c[2];
      const d = Math.hypot(dx, dz) - t.r;
      if (d > r || Math.abs((t.y + t.h / 2) - c[1]) > 5 + t.h / 2) continue;
      const f = o.falloff ? 1 - o.falloff * Math.max(0, d) / r : 1;
      const dd = Math.hypot(dx, dz) || 1;
      this.damage(t, dmg * f, { ...o, kx: o.kb ? (dx / dd) * o.kb : 0, kz: o.kb ? (dz / dd) * o.kb : 0 });
      n++;
    }
    return n;
  }

  project(p) {
    const v = (this._pv = this._pv || new THREE.Vector3()).set(p[0], p[1], p[2]).project(this.camera);
    if (v.z > 1) return null;
    return [(v.x * 0.5 + 0.5) * this.vw(), (-v.y * 0.5 + 0.5) * this.vh()];
  }

  distTo(x, z) { const p = this.player; return p ? Math.hypot(p.pos.x - x, p.pos.z - z) : 0; }
  distVol(x, z) { return Math.max(0.05, Math.min(1, 1 - this.distTo(x, z) / 80)); }

  shake(a) { if (this.settings.shake === false) return; this.shakeAmt = Math.min(1, Math.max(this.shakeAmt, a)); }
  recoil(a) { if (this.player) this.player.pitch -= a * 0.012; }
  // Real recoil (data.js `rec`, degrees): each shot throws the muzzle up and a little sideways over a few frames; a burst
  // climbs harder shot by shot until it levels off; when the trigger rests, part of the kick settles back by itself.
  recoilW(wp, a) {
    const p = this.player, r = wp && wp.rec;
    if (!p) return;
    if (!r) return this.recoil(a);
    const R = this.rcl || (this.rcl = { p: 0, y: 0, n: 0, t: -9, qp: 0, qy: 0, sum: 0 });
    if (this.now - R.t > 0.3) { R.n = 0; R.sum = 0; }
    R.n++; R.t = this.now;
    const D = Math.PI / 180, aim = 1 - 0.3 * (p.ads || 0);
    const tired = r.cap ? Math.max(0.18, 1 - R.sum / (r.cap * D)) : 1;
    const v = r.v * D * aim * (1 + Math.min(R.n - 1, 8) * (r.grow || 0)) * (R.n === 1 ? r.first || 1 : 1) * tired;
    const h = ((Math.random() * 2 - 1) * r.h + (r.b || 0) * (R.n > 2 ? 1 : 0.35)) * D * aim;
    R.qp += v; R.qy += h; R.sum += v;
    R.p += v * r.ret; R.y += h * r.ret;
  }
  recoilStep(dt) {
    const R = this.rcl, p = this.player;
    if (!R || !p) return;
    if (R.qp || R.qy) {
      const k = Math.min(1, dt * 30), dp = R.qp * k, dy = R.qy * k;
      R.qp = Math.abs(R.qp - dp) < 1e-6 ? 0 : R.qp - dp; R.qy = Math.abs(R.qy - dy) < 1e-6 ? 0 : R.qy - dy;
      p.pitch = Math.max(-1.1, p.pitch - dp); p.yaw -= dy;
    }
    if (this.now - R.t > 0.1 && (R.p || R.y)) {
      const k = Math.min(1, dt * 8), bp = R.p * k, by = R.y * k;
      R.p = Math.abs(R.p - bp) < 1e-6 ? 0 : R.p - bp; R.y = Math.abs(R.y - by) < 1e-6 ? 0 : R.y - by;
      p.pitch = Math.min(1.25, p.pitch + bp); p.yaw += by;
    }
  }

  // ---------------- camera / aim ----------------
  // Sights see-through: while aiming, every weapon mesh gets a ghost copy of its material that fades to ~12% opacity
  // inside a cone around the line of sight (view-space angle), so scopes, optics and iron sights never block the view.
  ghostSights(wm, a) {
    if (!this.ghostU) this.ghostU = { value: 0 };
    this.ghostU.value = a;
    if (a <= 0.02 && !wm.userData.ghosted) return;
    wm.userData.ghosted = a > 0.02;
    wm.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const ud = o.userData;
      if (!ud.solidMat) ud.solidMat = o.material;
      if (a > 0.02) {
        if (ud.ghostMat === undefined) {
          const base = ud.solidMat;
          if (!base.isMeshStandardMaterial) ud.ghostMat = null;
          else {
            const g = base.clone(), prev = base.onBeforeCompile, U = this.ghostU;
            g.transparent = true; g.depthWrite = true;
            g.onBeforeCompile = (sh, r) => {
              if (prev) prev(sh, r);
              sh.uniforms.uGhost = U;
              sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGhost;')
                .replace('#include <dithering_fragment>', `#include <dithering_fragment>
                  { float gz = max(vViewPosition.z, 0.001), gr = length(vViewPosition.xy) / gz;
                    float gm = max(1.0 - smoothstep(0.09, 0.3, gr), 1.0 - smoothstep(0.05, 0.16, gz));
                    gl_FragColor.a *= 1.0 - uGhost * gm * 0.88; }`);
            };
            const k = base.customProgramCacheKey; g.customProgramCacheKey = () => (k ? k.call(base) : '') + 'ghost';
            ud.ghostMat = g;
          }
        }
        if (ud.ghostMat && o.material !== ud.ghostMat) o.material = ud.ghostMat;
      } else if (o.material !== ud.solidMat) o.material = ud.solidMat;
    });
  }

  updateCamera(dt) {
    const p = this.player;
    let px = p.pos.x, py = p.pos.y, pz = p.pos.z;
    let yaw = p.yaw, pitch = p.pitch;
    if (p.out) {
      // Spectate a living teammate.
      const alive = [...this.views.players.values()].filter((v) => v.model.visible);
      const v = alive[(this.spectateIdx || 0) % Math.max(1, alive.length)];
      if (v) { px = v.pos.x; py = v.pos.y; pz = v.pos.z; yaw = v.yaw; pitch = 0.25; }
      if (this.input.mouseClicked) this.spectateIdx = (this.spectateIdx || 0) + 1;
    }
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const dx = Math.sin(yaw) * cp, dy = -sp, dz = Math.cos(yaw) * cp;
    const rig = p.model.userData.rig;
    const ads = p.alive && !p.out ? p.ads : 0;
    const wpn = p.weapon;
    // Aim down sights always looks through the sights, even from the third-person view (Call of Duty style).
    // Nutty (2026-11-05): aiming no longer flips a third-person player into first person; third person just zooms in.
    const fp = this.settings.view === 'first' && !p.out && p.alive && rig;
    this.fpNow = !!fp;
    if (rig) rig.firstPerson = !!fp;
    // Aim down sights: zoom in (scoped weapons a lot), and in first person line the eye up behind the gun.
    // Every weapon with `scope: true` (now or added later) is looked THROUGH in first person: see scope.js.
    const scoped = !!wpn.scope;
    const scopeK = fp && scoped ? Math.min(1, Math.max(0, (ads - 0.5) / 0.45)) : 0;
    if (!this.scope) this.scope = new ScopeView();
    this.scope.set(scopeK, this.scene, this.camera.aspect, RETICLES[wpn.reticle] || 0);
    const base = Math.max(55, Math.min(105, this.settings.fov || 70));
    const fovT = this.scope.zoomed ? scopeZoomFov(wpn) : base - (base - (fp ? (scoped ? 40 : 52) : 50 * base / 70)) * ads + (p.board ? (p.windK || 0) * 9 : 0); // sprinting on a board widens the view
    if (Math.abs(this.camera.fov - fovT) > 0.05) { this.camera.fov = fovT; this.camera.updateProjectionMatrix(); }
    if (fp) {
      // First person: eyes in the character's own head, which is hidden from view.
      const eye = rig.eyeWorld();
      const cam = this.camera;
      cam.position.copy(eye).add(new THREE.Vector3(dx * CAM_LEAD, 0, dz * CAM_LEAD));
      // Looking through a scope: the weapon model would only block the view.
      const wm = p.model.userData.weapon;
      if (wm) { wm.visible = true; this.ghostSights(wm, wpn.adsHide ? ads : 0); } // sights, red dots and scopes stay solid: you look through them
      // Aiming down the sights no longer moves the camera to the gun (it ended up inside the body); the rig brings the
      // gun up to the eye instead (characters.js, st.ads), so this works for every character, present and future.
      cam.lookAt(cam.position.x + dx * 30, cam.position.y + dy * 30, cam.position.z + dz * 30);
      // Your head goes with a melee swing: the view rolls into the cut and dips with a chop, more for heavier weapons.
      if (p.meleeT > 0 && wpn.kind === 'melee' && !wpn.cane && this.settings.shake !== false) {
        const dur = Math.max(0.2, wpn.rate / p.stats.rate), ph = Math.min(1, Math.max(0, 1 - p.meleeT / dur));
        const ps = samplePose(moveOf(wpn, p.meleeMove), ph), w = Math.sin(ph * Math.PI), kk = Math.min(1.7, Math.max(0.5, wpn.rate / 0.6));
        cam.rotateZ(-ps.az * 0.045 * w * kk); cam.rotateX(Math.min(0, ps.el) * 0.02 * w * kk);
      }
      if (cam.near !== 0.04) { cam.near = 0.04; cam.updateProjectionMatrix(); }
      if (this.shakeAmt > 0) { const s = this.shakeAmt * 0.06; cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s; this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5); }
      this.sun.position.set(px + SUN_OFFSET.x, py + SUN_OFFSET.y, pz + SUN_OFFSET.z);
      this.sun.target.position.set(px, py, pz);
      this.camBack = 0.2;
      return;
    }
    if (this.camera.near !== 0.1) { this.camera.near = 0.1; this.camera.updateProjectionMatrix(); }
    { const wm = p.model.userData.weapon; if (wm) { wm.visible = true; this.ghostSights(wm, 0); } } // out of the sights the gun is solid again
    // Up in a tree the foliage closes in, so the camera tucks in close.
    const high = p.climb || (p.onGround && p.pos.y - this.world.heightAt(p.pos.x, p.pos.z) > 2.5);
    const S = this.duel ? DUEL.size : 1; // a duel-sized fighter gets the camera pulled back in proportion
    const back = (4.4 - 3.0 * Math.max(ads, p.aimIn || 0)) * (high ? 0.45 : 1) * S; // aiming: closer over the shoulder
    const rx = -Math.cos(yaw) * S, rz = Math.sin(yaw) * S;
    const pivot = new THREE.Vector3(px, py + 1.65 * S, pz); // chest height, even on a duel-sized fighter
    let dist = back;
    const w = this.world;
    // Pull in when terrain blocks the view.
    for (let s = 1; s <= 6; s++) {
      const k = (s / 6) * back;
      const x = pivot.x - dx * k + rx * 1.05, y = pivot.y - dy * k + 0.45 * S, z = pivot.z - dz * k + rz * 1.05;
      if (y < w.heightAt(x, z) + 0.35) { dist = Math.max(0.8, k - back / 6); break; }
    }
    const cam = this.camera;
    cam.position.set(pivot.x - dx * dist + rx * 1.05, pivot.y - dy * dist + 0.45 * S, pivot.z - dz * dist + rz * 1.05);
    const gy = w.heightAt(cam.position.x, cam.position.z) + 0.35;
    if (cam.position.y < gy) cam.position.y = gy;
    cam.lookAt(cam.position.x + dx * 30, cam.position.y + dy * 30, cam.position.z + dz * 30);
    if (this.shakeAmt > 0) {
      const s = this.shakeAmt * 0.12;
      cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s; cam.position.z += (Math.random() - 0.5) * s;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5);
    }
    // Shadows follow the player.
    this.sun.position.set(px + SUN_OFFSET.x, py + SUN_OFFSET.y, pz + SUN_OFFSET.z);
    this.sun.target.position.set(px, py, pz);
    this.camBack = dist;
  }

  updateAim() {
    const cam = this.camera;
    const o = this.aim.origin.copy(cam.position);
    const d = this.aim.dir.set(0, 0, -1).applyQuaternion(cam.quaternion);
    // Start the ray at the player so things behind them aren't targeted.
    const start = o.clone().addScaledVector(d, (this.camBack || 3.7) + 0.5);
    const hits = this.rayHit(start, d, 150, 1);
    if (hits.length) this.aim.point.copy(hits[0].point);
    else this.aim.point.copy(this.groundRay(start, d, 150));
    this.aim.target = hits.length ? hits[0].t : null;
  }

  // ---------------- interactions ----------------
  interactions() {
    const p = this.player;
    if (!p.alive) { this.ui.prompt(null); return; }
    let prompt = null;
    if (p.climb) {
      this.ui.prompt(this.ui.ctlB('up') + ' / ' + this.ui.ctlB('down') + ' Climb · ' + this.ui.ctlB('side') + ' Circle · ' + this.ui.ctlB('jump') + ' Leap off · ' + this.ui.ctlB('use') + ' Let go');
      return;
    }
    // Reroll dice: walk over one to bank a reroll for the level-up screen.
    for (const dc of this.world.dice || []) {
      if (dc.taken || Math.hypot(dc.x - p.pos.x, dc.z - p.pos.z) > 1.8 || Math.abs(dc.y - p.pos.y) > 3) continue;
      dc.taken = true; this.world.group.remove(dc.mesh);
      p.rerolls = (p.rerolls || 0) + 1;
      this.audio.play('crate', 0.6);
      this.fx.flash([dc.x, dc.y + 1, dc.z], 0xffd34a, 10, 0.6, 12);
      this.ui.toast('🎲 Reroll banked (' + p.rerolls + ')', 'good');
    }
    // Skateboards: E hops on a board lying nearby, or hops off the one you are riding.
    if (p.board) {
      this.ui.prompt(this.ui.ctlB('use') + ' Hop off the skateboard');
      if (this.input.pressed.has('KeyE')) p.dismountBoard();
      return;
    }
    let board = null, bdist = 2.4;
    for (const b of this.world.boards || []) {
      const d = Math.hypot(b.x - p.pos.x, b.z - p.pos.z);
      if (d < bdist && Math.abs(b.y - p.pos.y) < 2) { bdist = d; board = b; }
    }
    if (board) {
      this.ui.prompt(this.ui.ctlB('use') + ' Ride skateboard');
      if (this.input.pressed.has('KeyE')) p.mountBoard();
      return;
    }
    const tree = p.nearTree();
    // A power-up floating over a chest you opened: Use (E / Square) takes it.
    const wait = this.chests.nearest(p);
    if (wait) {
      const info = puInfo(wait.pu, p.cls);
      this.ui.prompt(this.ui.ctlB('use') + ' Take ' + info.name);
      if (this.input.pressed.has('KeyE')) {
        this.chests.take(wait);
        p.takePowerup(wait.pu);
        this.audio.play('buy');
        this.ui.toast(info.name + ' · ' + info.desc, 'good');
      }
      return;
    }
    const crateNear = this.world.crates.some((c) => !c.opened && Math.hypot(c.x - p.pos.x, c.z - p.pos.z) < 3);
    if (tree && !p.board && !crateNear) {
      const high = p.pos.y > tree.gy + 1.2;
      this.ui.prompt(this.ui.ctlB('use') + ' ' + (high ? 'Climb down' : 'Climb tree'));
      if (this.input.pressed.has('KeyE')) p.startClimb(tree);
      return;
    }
    let near = null, nd = 2.8;
    for (const c of this.world.crates) {
      if (c.opened) continue;
      const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z);
      if (d < nd) { nd = d; near = c; }
    }
    if (near) {
      prompt = this.ui.ctlB('use') + ' Open crate · ' + this.cratePrice() + ' PC';
      if (this.input.pressed.has('KeyE')) this.openCrate(near);
    }
    const a = this.world.arena;
    const atAltar = !near && this.phase === 'play' && Math.hypot(a.x - p.pos.x, a.z - p.pos.z) < 7;
    // The altar only ever summons the boss, and only once the round clock has run out. Hold E to call it.
    if (atAltar && !this.endless && this.tl > 0) {
      const t = Math.ceil(this.tl), mm = Math.floor(t / 60), ss = t % 60;
      prompt = 'The altar is sealed · opens in ' + mm + ':' + (ss < 10 ? '0' : '') + ss;
      this.summonHold = 0;
    } else if (atAltar) {
      const now = performance.now(), dtH = Math.min(0.1, (now - (this.summonLast || now)) / 1000);
      this.summonLast = now;
      if (this.input.keys.has('KeyE')) this.summonHold = (this.summonHold || 0) + dtH; else this.summonHold = 0;
      const pct = Math.min(100, Math.round((this.summonHold / 2.5) * 10) * 10);
      prompt = this.summonHold > 0 ? 'Summoning the boss… ' + pct + '%' : '<b>Hold ' + this.ui.ctl('use') + '</b> Summon the boss';
      if (this.summonHold >= 2.5) { this.summonHold = 0; this.request('early'); this.ui.toast('The altar answers…'); }
    } else { this.summonHold = 0; this.summonLast = 0; }
    this.ui.prompt(prompt);
  }

  openCrate(c) {
    const p = this.player;
    const cost = this.cratePrice();
    if (p.pc < cost) { this.ui.toast('Need ' + cost + ' PC to open this crate', 'bad'); this.audio.play('deny'); return; }
    p.pc -= cost;
    p.cratesOpened = (p.cratesOpened || 0) + 1;
    if (this.dailyOn()) Dailies.add('crates');
    const r = mulberry32((this.world.seed ^ (c.id * 7919) ^ (this.hitSeq + this.reqSeq * 31)) >>> 0);
    // Half of all crates hold a special power-up (a new effect), the rest are a stat or mastery.
    let pu;
    if (r() < 0.5) {
      const sp = CRATE_POOL;
      let tot = 0; for (const q of sp) tot += q.crate || 1;
      let x = r() * tot; pu = sp[sp.length - 1];
      for (const q of sp) { x -= q.crate || 1; if (x <= 0) { pu = q; break; } }
    } else {
      const rest = POWERUPS.filter((q) => q.kind !== 'special');
      pu = rest[Math.floor(r() * rest.length)];
    }
    // The power-up isn't handed over yet: it rises out of the chest and waits for you to grab it.
    this.request('crate', c.id);
    this.openCrateVisual(c, pu);
  }

  // Swap the closed chest for the animated one and play the opening (chest.js). pu: what's inside, for the opener.
  openCrateVisual(c, pu) {
    if (c.opened) return;
    c.opened = true;
    c.mesh.visible = false;
    this.chests.open(c, pu);
    this.fx.dustBurst([c.x, c.y, c.z], 0.4, [0.45, 0.32, 0.2]);
  }

  // ---------------- shop ----------------
  toggleShop(force) {
    if (this.duel) return;
    const open = force ?? !this.shopOpen;
    this.shopOpen = open;
    this.ui.shop(open);
    if (open) { this.unlockPointer(); }
    else this.lockPointer();
  }

  // Everything you can buy gets 10% dearer with each round.
  // Crates also get 3% dearer with every one you open this run, so a build grows over the whole run instead of all at once.
  cratePrice() { return Math.round(this.price(CONFIG.cratePrice) * (1 + 0.06 * (this.player ? this.player.cratesOpened || 0 : 0))); }
  price(base) { return Math.round(base * Math.pow(1.3, this.round || 0)); } // prices keep pace with what a round pays

  buy(item) {
    const p = this.player;
    const cost = this.price(item === 'bed' ? CONFIG.bedPrice : NPCS[item] ? NPCS[item].cost : 0);
    if (!cost) return;
    if (!p.alive && item !== 'bed') return;
    if (p.pc < cost) { this.audio.play('deny'); this.ui.toast('Not enough PC', 'bad'); return; }
    if (item !== 'bed') {
      const mine = [...this.views.npcs.values()].filter((v) => this.lastW && (this.lastW.n || []).some((r) => r[0] === v.id && r[2] === this.party.myId));
      if (mine.length >= 3) { this.ui.toast('You can lead up to 3 NPCs', 'bad'); this.audio.play('deny'); return; }
    }
    p.pc -= cost;
    if (item === 'bed') { p.beds++; this.ui.toast('Bed bought. Beds: ' + p.beds, 'good'); }
    else { this.request('npc', item); this.ui.toast(NPCS[item].name + ' hired', 'good'); }
    this.audio.play('buy');
    this.ui.shop(true);
  }

  // ---------------- beds ----------------
  placeBedMesh(pos, yaw) {
    this.removeBedMesh();
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.8 });
    const cloth = new THREE.MeshStandardMaterial({ color: this.player.cls.color, roughness: 0.95 });
    const white = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.9 });
    const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); };
    add(new THREE.BoxGeometry(1.1, 0.25, 2.1), wood, 0, 0.2, 0);
    add(new THREE.BoxGeometry(1.0, 0.18, 2.0), white, 0, 0.4, 0);
    add(new THREE.BoxGeometry(1.02, 0.1, 1.4), cloth, 0, 0.5, 0.28);
    add(new THREE.BoxGeometry(0.7, 0.14, 0.35), white, 0, 0.55, -0.75);
    add(new THREE.BoxGeometry(1.1, 0.7, 0.08), wood, 0, 0.45, -1.05);
    g.position.set(pos.x, this.world.heightAt(pos.x, pos.z), pos.z);
    g.rotation.y = yaw;
    this.scene.add(g);
    this.bedMesh = g;
    this.fx.dustBurst([pos.x, g.position.y, pos.z], 0.4);
  }
  removeBedMesh() { if (this.bedMesh) { this.scene.remove(this.bedMesh); this.bedMesh = null; } }

  // ---------------- vote / blessings ----------------
  voteKeys() {
    const I = this.input;
    const final = this.round >= CONFIG.rounds - 1;
    if (I.pressed.has('Digit1')) { I.pressed.delete('Digit1'); this.castVote('f'); }
    if (I.pressed.has('Digit2') && !final) { I.pressed.delete('Digit2'); this.castVote('x'); }
  }
  castVote(v) {
    this.myVote = v + this.round;
    this.audio.play('ui');
    this.ui.phase('vote');
  }

  offerBlessings() {
    const p = this.player;
    const owned = new Set(p.blessings.map((b) => b.id));
    const r = mulberry32((this.world.seed + this.round * 13 + (this.party.myId || '').length * 97) >>> 0);
    const pool = BLESSINGS.filter((b) => !owned.has(b.id));
    const opts = [];
    while (opts.length < 9 && pool.length) opts.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    this.blessOpts = opts;
    this.blessOpen = true;
    this.audio.play('bless');
    this.ui.bless(opts);
    this.unlockPointer();
  }
  blessKeys() {
    const I = this.input;
    ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'].forEach((k, i) => { if (I.pressed.has(k) && this.blessOpts[i]) { I.pressed.delete(k); this.pickBlessing(i); } });
  }
  pickBlessing(i) {
    if (!this.blessOpen) return;
    const b = this.blessOpts[i];
    this.player.blessings.push(b);
    this.player.recomputeStats();
    this.player.hp = this.player.stats.maxHp;
    this.blessOpen = false;
    this.ui.bless(null);
    this.ui.toast(b.name + ' is yours for the rest of the run', 'good');
    this.lockPointer();
  }

  // The Visitor's big beam: its blaster glows while it charges, then one red beam burns along the ground after its target, and smokes once it overheats.
  visitorBeamFx(v) {
    const m = v.muzzle(this._vm || (this._vm = new THREE.Vector3())), M = [m.x, m.y, m.z];
    if (v.flag === 1) { if (Math.random() < 0.6) this.fx.smoke.emit({ p: [...M], v: [(Math.random() - 0.5) * 1.5, 3, (Math.random() - 0.5) * 1.5], life: 1.2, s0: 0.8, s1: 2.6, c0: [0.75, 0.75, 0.75, 0.55], c1: [0.5, 0.5, 0.5, 0] }); return; }
    if (!v.lasering) { this._vc = 0; return; }
    if (v.laser == null) {
      // Charging: the glow at the muzzle swells and sparks are pulled in.
      this._vc = Math.min(1, (this._vc || 0) + 0.02);
      this.fx.glow.emit({ p: [...M], life: 0.12, s0: 1 + this._vc * 4, s1: 0.6, c0: [0.3, 0.65, 1, 0.9], c1: [0.15, 0.4, 1, 0] });
      const a = Math.random() * 6.28, r = 3 + Math.random() * 2;
      this.fx.spark.emit({ p: [M[0] + Math.cos(a) * r, M[1] + (Math.random() - 0.5) * 3, M[2] + Math.sin(a) * r], v: [-Math.cos(a) * r * 3, 0, -Math.sin(a) * r * 3], life: 0.3, s0: 0.25, s1: 0.05, c0: [0.6, 0.85, 1, 1], c1: [0.2, 0.5, 1, 0], g: 0 });
      return;
    }
    // One thick, steady, dead-straight beam from the blaster to the spot it is burning.
    const yaw = v.laser, D = v.beamD || 20, ex = v.x + Math.sin(yaw) * D, ez = v.z + Math.cos(yaw) * D, end = [ex, this.world.heightAt(ex, ez) + 0.2, ez];
    this.fx.beam('vb0', M, end, { color: [0.12, 0.42, 1], core: [0.5, 0.78, 1], width: 1.5, life: 0.12, ripple: false });
    this.fx.beam('vb1', M, end, { color: [0.1, 0.35, 1], core: [0.25, 0.55, 1], width: 3.4, life: 0.12, ripple: false, alpha: 0.16 });
    this.fx.glow.emit({ p: [...M], life: 0.1, s0: 3.6, s1: 2, c0: [0.6, 0.85, 1, 0.9], c1: [0.2, 0.5, 1, 0] });
    this.fx.glow.emit({ p: [...end], life: 0.14, s0: 2.5, s1: 4, c0: [0.5, 0.8, 1, 0.6], c1: [0.2, 0.45, 1, 0] });
    for (let i = 0; i < 3; i++) this.fx.spark.emit({ p: [...end], v: [(Math.random() - 0.5) * 12, 3 + Math.random() * 7, (Math.random() - 0.5) * 12], life: 0.35, s0: 0.3, s1: 0.05, c0: [0.7, 0.9, 1, 1], c1: [0.3, 0.5, 1, 0], g: 10 });
    if (Math.random() < 0.35) this.fx.dustBurst(end, 0.8);
  }

  // Thermes' eye lasers: twin ice-blue beams from his eyes to the ground, then along it to the end of the sweep, with sparks where they burn.
  bossLaserFx() {
    const v = this.views.boss;
    if (v && v.def.visitor) return this.visitorBeamFx(v);
    if (!v || v.laser == null || !v.eyes) return;
    const yaw = v.laser, T = THERMES, sx = Math.sin(yaw), cz = Math.cos(yaw);
    const gx = v.x + sx * 9, gz = v.z + cz * 9, gy = this.world.heightAt(gx, gz) + 0.5;
    const ex = v.x + sx * T.laserRange, ez = v.z + cz * T.laserRange, ey = this.world.heightAt(ex, ez) + 0.6;
    const mid = [gx, gy, gz], end = [ex, ey, ez];
    for (let i = 0; i < 2; i++) {
      const a = v.eyes[i];
      this.fx.beam('bl' + i, a, mid, { color: [0.3, 0.65, 1], core: [0.92, 0.98, 1], width: 0.55, life: 0.1, ripple: false });
      this.fx.beam('bh' + i, a, mid, { color: [0.25, 0.5, 1], core: [0.5, 0.8, 1], width: 1.3, life: 0.1, ripple: false, alpha: 0.25 });
    }
    this.fx.beam('bg', mid, end, { color: [0.3, 0.65, 1], core: [0.92, 0.98, 1], width: 0.9, life: 0.1, ripple: false });
    this.fx.beam('bgh', mid, end, { color: [0.25, 0.5, 1], core: [0.5, 0.8, 1], width: 2.2, life: 0.1, ripple: false, alpha: 0.22 });
    const k = 9 + Math.random() * (T.laserRange - 9), px = v.x + sx * k, pz = v.z + cz * k, py = this.world.heightAt(px, pz);
    this.fx.glow.emit({ p: [px, py + 0.4, pz], life: 0.15, s0: 1.2, s1: 2.4, c0: [0.5, 0.8, 1, 0.9], c1: [0.3, 0.5, 1, 0] });
    for (let i = 0; i < 2; i++) this.fx.spark.emit({ p: [px, py + 0.3, pz], v: [(Math.random() - 0.5) * 8, 2 + Math.random() * 5, (Math.random() - 0.5) * 8], life: 0.3, s0: 0.25, s1: 0.05, c0: [0.7, 0.9, 1, 1], c1: [0.3, 0.5, 1, 0], g: 10 });
    if (Math.random() < 0.2) this.fx.glow.emit({ p: [gx, gy, gz], life: 0.12, s0: 1.5, s1: 3, c0: [0.5, 0.8, 1, 0.8], c1: [0.3, 0.5, 1, 0] });
  }

  // The thing a hit on you came from, as a damage target (a mob id, or 'B' for the boss), for the shield parry.
  attackerTarget(src) {
    if (src === 'B') return this.targets().find((t) => t.kind === 'boss') || null;
    if (typeof src !== 'number') return null;
    return this.targets().find((t) => t.kind === 'mob' && t.id === src) || null;
  }

  // Lifetime kill counters for the gear unlocks: where it happened, whether you were airborne, and what did the killing.
  // Daily Challenges count your own runs: not the CPU's, not the Duel Arena, and couch seat 2 shares seat 1's account.
  dailyOn() { return !this.isBot && !this.duel && this.seat !== 2 && !(this.runStats && (this.runStats.cpuUsed || this.runStats.mutated)); }
  // Unlockables, records and PP: never from a run the CPU touched or one with mutators on.
  counts() { return !(this.runStats && (this.runStats.cpuUsed || this.runStats.mutated)); }

  countKill(mobId, v) {
    const p = this.player, hard = seedFlags(this.runSeed).hard;
    if (!this.counts()) { this.hitSrc.delete(mobId); this.hitInfo.delete(mobId); return; } // the CPU's kills are not yours; mutator kills are just for fun
    if (this.dailyOn()) {
      const h = this.hitInfo.get(mobId) || { wk: 'gun' };
      const wk = this.hitSrc.get(mobId) && this.hitSrc.get(mobId) !== 'player' ? 'gear' : h.wk;
      Dailies.add('kills');
      if (h.head) Dailies.add('headKills');
      Dailies.add(wk + 'Kills');
      if (!p.onGround) Dailies.add('airKills');
      if (p.board) Dailies.add('boardKills');
      if (v && v.elite) Dailies.add('eliteKills');
      if (v && v.mini) Dailies.add('champKills');
      Dailies.best('runKills', p.totalKills);
    }
    this.hitInfo.delete(mobId);
    Unlocks.add('kills');
    if (stageIdx(this.runSeed, this.round) === 7) Unlocks.add('killsSpace');
    if (!p.onGround) { Unlocks.add('killsAir'); if (hard) Unlocks.add('killsAirHard'); }
    if (this.hitSrc.get(mobId) === 'turret') Unlocks.add('killsTurret');
    this.hitSrc.delete(mobId);
  }

  // After Thermes: the host decides whether the run continues to the optional space round.
  answerSpace(yes) {
    if (!(this.isHost && this.sim)) return;
    this.sim.spaceAnswer(yes);
    if (yes) this.lockPointer();
  }

  // ---------------- game speed ----------------
  // D-pad down: normal, 2x, 3x, then back to normal. Only where this machine runs the whole game (solo and couch).
  cycleSpeed() {
    const k = this.party && this.party.kind;
    if (this.mode !== 'game') return;
    if (k !== 'solo' && k !== 'local') return; // online: no speed-up, and no message about it (Nutty 2026-11-11)
    if (!speedUnlocked()) { this.ui.toast('Game speed is locked: win 4 runs to earn it (see Unlockables)', 'bad', 'speed'); this.audio.play('deny'); return; }
    SPEED.n = SPEED.n >= 3 ? 1 : SPEED.n + 1;
    this.audio.play('ui');
    this.ui.toast(SPEED.n === 1 ? 'Normal speed' : 'Game speed ' + SPEED.n + 'x', '', 'speed');
  }

  // ---------------- elemental level-up ----------------
  elemStops() { const k = this.party && this.party.kind; return !!this.duel || k === 'solo' || k === 'local'; }
  openElem(kind = 'elem') {
    this.elemOpen = true;
    this.elemKind = kind;
    this.elemSel = 0;
    // Duel: five different power-ups drawn at random, fresh for every pick.
    this.elemOpts = kind === 'duel' ? [...DUEL_PICKS].sort(() => Math.random() - 0.5).slice(0, DUEL.offer) : levelOffer();
    this.audio.play('bless');
    if (!this.headless) this.ui.elem(this.elemOpts, this.player, !this.elemStops(), kind);
    if (this.elemStops() && !this.headless) this.unlockPointer();
    this.elemAt = this.now;
  }
  elemKeys() {
    const I = this.input;
    if (I.pressed.has('ArrowLeft')) { I.pressed.delete('ArrowLeft'); this.elemMove(-1); }
    if (I.pressed.has('ArrowRight')) { I.pressed.delete('ArrowRight'); this.elemMove(1); }
    if (I.pressed.has('Enter')) { I.pressed.delete('Enter'); this.pickElem(this.elemSel); return; }
    if (I.pressed.has('KeyR')) { I.pressed.delete('KeyR'); this.rerollElem(); }
    for (let i = 0; i < this.elemOpts.length; i++) { const key = i === 9 ? 'Digit0' : 'Digit' + (i + 1); if (I.pressed.has(key)) { I.pressed.delete(key); this.pickElem(i); if (!this.elemOpen) return; } }
  }
  // A banked dice reroll swaps the ten level-up picks on screen for ten others.
  rerollElem() {
    const p = this.player;
    if (!this.elemOpen || this.elemKind !== 'elem' || !p) return;
    if (!(p.rerolls > 0)) { this.ui.toast('No rerolls. Find the dice lying around the map', 'bad'); this.audio.play('deny'); return; }
    p.rerolls--;
    this.elemOpts = rerollOffer(this.elemOpts);
    this.elemSel = 0;
    this.audio.play('bless');
    this.ui.elem(this.elemOpts, p, !this.elemStops(), 'elem');
  }
  elemMove(d) { const n = this.elemOpts.length; this.elemSel = (this.elemSel + d + n) % n; this.ui.elemSel(this.elemSel); this.audio.play('ui'); }
  pickElem(i) {
    const pu = this.elemOpts && this.elemOpts[i], p = this.player;
    if (!this.elemOpen || !pu || !p) return;
    const stops = this.elemStops();
    this.elemOpen = false;
    this.ui.elem(null);
    if (!this.headless) this.audio.play('crate', 0.7);
    if (this.elemKind === 'duel') {
      p.takePowerup(pu);
      this.dpDone = this.dp; // tells the host this fighter has chosen
      this.fx.shockwave([p.pos.x, p.pos.y + 0.1, p.pos.z], 7, 0xffd96a, 0.6);
      this.ui.toast(pu.icon + ' ' + puInfo(pu, p.cls).name, 'good');
      this.publish();
      if (stops && this.phase !== 'dpick') this.lockPointer();
      return;
    }
    p.elemPending = Math.max(0, p.elemPending - 1);
    p.takePowerup(pu);
    this.fx.shockwave([p.pos.x, p.pos.y + 0.1, p.pos.z], 7, pu.color ? parseInt(pu.color.slice(1), 16) : 0xffd96a, 0.6);
    const info = puInfo(pu, p.cls), n = pu.el ? p.stats.elem[pu.el] : p.powerups.filter((q) => q.id === pu.id).length;
    this.ui.toast(pu.icon + ' ' + info.name + (n > 1 ? ' ×' + n : ''), 'good');
    if (stops && p.elemPending <= 0) this.lockPointer();
  }

  // ---------------- ambient ----------------
  ambient(dt) {
    const b = this.world.biome.id;
    const c = this.camera.position;
    const fx = this.fx;
    const rp = (r) => [c.x + (Math.random() - 0.5) * r, c.y + (Math.random() - 0.3) * 10, c.z + (Math.random() - 0.5) * r];
    const n = this.q === 0 ? 0.4 : 1;
    if (b === 'graveyard' && Math.random() < 0.5 * n) {
      const p = rp(50); p[1] = this.world.heightAt(p[0], p[2]) + 0.6;
      fx.smoke.emit({ p, v: [0.4, 0.05, 0.2], life: 6, s0: 5, s1: 9, c0: [0.55, 0.58, 0.65, 0.12], c1: [0.55, 0.58, 0.65, 0], rotV: 0.1 });
    }
    if (b === 'forest' && Math.random() < 0.4 * n) fx.glow.emit({ p: rp(40), v: [(Math.random() - 0.5), (Math.random() - 0.5) * 0.4, (Math.random() - 0.5)], life: 4, s0: 0.35, s1: 0.35, c0: [0.8, 1, 0.4, 0.9], c1: [0.8, 1, 0.4, 0], turb: 1.5 });
    if (b === 'desert' && Math.random() < 0.6 * n) fx.debris.emit({ p: rp(40), v: [4, 0, 1.5], life: 3, s0: 0.06, s1: 0.06, c0: [1, 1, 1, 0.8], c1: [1, 1, 1, 0], turb: 2 });
    if (b === 'frozen' && Math.random() < 2 * n) { const p = rp(50); p[1] = c.y + 15; fx.shard.emit({ p, v: [1, -2.5, 0.5], life: 7, s0: 0.15, s1: 0.15, c0: [1, 1, 1, 0.9], c1: [1, 1, 1, 0.6], turb: 1.5 }); }
    if (b === 'volcanic' && Math.random() < 1 * n) { const p = rp(50); p[1] = this.world.heightAt(p[0], p[2]); fx.spark.emit({ p, v: [0.5, 2 + Math.random() * 2, 0.3], life: 4, s0: 0.12, s1: 0.04, c0: [1, 0.6, 0.2, 1], c1: [1, 0.2, 0, 0], turb: 2 }); }
    if (b === 'abyss' && Math.random() < 0.8 * n) { const p = rp(50); p[1] = this.world.heightAt(p[0], p[2]); fx.glow.emit({ p, v: [0, 1.5, 0], life: 5, s0: 0.3, s1: 0.1, c0: [0.7, 0.4, 1, 0.8], c1: [0.4, 0.2, 1, 0], turb: 1 }); }
  }

  // ---------------- end of run ----------------
  endRun(win) {
    const p = this.player;
    const roundsReached = (this.round || 0) + 1;
    const mutated = !!this.runStats.mutated;
    const r = mutated ? { ...this.records } : this.records; // a mutator run leaves the records alone
    r.runs++;
    if (win) r.wins++;
    r.bestRound = Math.max(r.bestRound, roundsReached);
    r.bestKills = Math.max(r.bestKills, p.totalKills);
    r.totalKills += p.totalKills;
    if (!mutated) LS.set('records', r);
    const hardRun = seedFlags(this.runSeed).hard;
    const cpu = !!this.runStats.cpuUsed || mutated; // a run the CPU played (even partly), or with mutators on, earns nothing
    if (this.runStats.cpuUsed) this.ui.toast('CPU run: nothing counts toward the Unlockables', '');
    else if (mutated) this.ui.toast('Mutator run: just for fun, nothing counts', '');
    if (!cpu && win && hardRun && Unlocks.grant('space')) this.ui.toast('Hidden map unlocked: Crash Site Prime', 'good');
    if (!cpu) { Unlocks.add('runs'); Unlocks.max('bestRound', roundsReached); }
    if (this.dailyOn()) {
      Dailies.add('runs');
      if (win) { Dailies.add('wins'); if (hardRun) Dailies.add('winsHard'); if (!p.deaths) Dailies.add('cleanWins'); }
      Dailies.flush();
    }
    if (win && !cpu) {
      Unlocks.add('wins'); Unlocks.add(hardRun ? 'winsHard' : 'winsNormal');
      const ws = (this.loadout.w || []).map((id) => WEAPON_BY_ID[id]).filter((w) => w && TIER(w) !== 3);
      if (ws.length && ws.every((w) => w.kind === 'gun') && Unlocks.grant('gunsWin')) this.ui.toast('Turret Pack unlocked', 'good');
    }
    const reward = runReward({ win, round: roundsReached, kills: p.totalKills, bosses: this.runStats.bosses || 0 });
    if (this.seat === 1 && !cpu) { addPP(reward); this.runStats.pp = (this.runStats.pp || 0) + reward; } // couch seat 2 shares seat 1's wallet
    const stats = {
      pp: this.runStats.pp, win, round: roundsReached, kills: p.totalKills, pc: this.runStats.pcEarned, dmg: Math.round(p.damageDealt), deaths: p.deaths || 0,
      blessings: p.blessings.map((b) => b.name), cls: p.cls.name, time: Math.round((performance.now() - this.runStats.start) / 1000), records: r,
    };
    if (this.brain && this.brain.mode === 'run') { stats.cpu = this.brain.report(); window.__cpuReport = stats.cpu; console.table(stats.cpu.rounds); }
    if (this.seat !== 2) this.audio.stopMusic();
    this.timers.push({ t: 2.5, fn: () => { this.unlockPointer(); this.ui.summary(stats); if (this.seat !== 2) this.audio.startLobbyMusic(); } });
  }
}
