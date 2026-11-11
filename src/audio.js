// Synthesized sound effects and music (no audio files to load).
import { Music } from './music.js';

export class Audio {
  constructor() {
    this.ctx = null;
    this.vol = 0.6;
    this.sfxOn = true; // Settings > Sound effects (music has its own level)
    this.last = new Map();
    this.music = new Music(this);
  }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.vol;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch { this.ctx = null; }
    if (this.ctx) this.music.resume();
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }

  // Music: safe to call before unlock(); it starts once sound is allowed.
  startLobbyMusic() { this.music.start('lobby'); }
  startRunMusic(stage) { this.music.start('run', stage); } // stage = BIOMES index; new take each call
  stopMusic() { this.music.stop(); }
  pauseMusic(on) { this.music.pause(on); }
  setMusicIntensity(x) { this.music.setIntensity(x); } // 0 calm .. 1 boss
  setMusicVolume(v) { this.music.setLevel(v); } // relative to master, default 1

  // Jetpack roar: a looping filtered-noise engine. level 0 (silent) .. 1 (full thrust).
  jet(level) {
    if (!this.ctx || !this.noise) return;
    if (!this.sfxOn) level = 0;
    if (!this.jetN) {
      if (level <= 0) return;
      const c = this.ctx, src = c.createBufferSource();
      src.buffer = this.noise; src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master); src.start();
      this.jetN = { f, g };
    }
    const t = this.ctx.currentTime;
    this.jetN.g.gain.setTargetAtTime(0.2 * level, t, 0.07);
    this.jetN.f.frequency.setTargetAtTime(450 + 900 * level, t, 0.09);
  }

  env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  noiseHit({ dur = 0.2, freq = 1200, q = 1, type = 'lowpass', gain = 0.5, sweep = 0, delay = 0 }) {
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    const g = c.createGain();
    this.env(g, t, 0.004, gain, dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }
  tone({ freq = 440, to = 0, dur = 0.2, type = 'sine', gain = 0.3, delay = 0 }) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    this.env(g, t, 0.005, gain, dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // Quiet footstep, tuned per character kind. Not throttled: the caller paces the steps.
  footstep(kind = 'boot', vol = 1) {
    if (!this.ctx || !this.sfxOn || vol < 0.02) return;
    const r = 0.85 + Math.random() * 0.3, v = Math.min(1, vol);
    switch (kind) {
      case 'heavy': this.noiseHit({ dur: 0.1, freq: 190 * r, gain: 0.1 * v }); this.noiseHit({ dur: 0.05, freq: 900 * r, type: 'bandpass', q: 1.2, gain: 0.035 * v }); break;
      case 'bone': this.noiseHit({ dur: 0.04, freq: 2300 * r, type: 'bandpass', q: 5, gain: 0.05 * v }); this.noiseHit({ dur: 0.05, freq: 1500 * r, type: 'bandpass', q: 4, gain: 0.03 * v, delay: 0.03 }); break;
      case 'claw': this.noiseHit({ dur: 0.07, freq: 1700 * r, type: 'bandpass', q: 1.4, gain: 0.04 * v }); this.noiseHit({ dur: 0.07, freq: 260 * r, gain: 0.045 * v }); break;
      case 'soft': this.noiseHit({ dur: 0.07, freq: 420 * r, gain: 0.045 * v }); break;
      default: this.noiseHit({ dur: 0.08, freq: 260 * r, gain: 0.075 * v }); this.noiseHit({ dur: 0.04, freq: 1100 * r, type: 'bandpass', q: 1.2, gain: 0.03 * v }); break;
    }
  }

  // Held-down rotary gun (minigun): one long-lived set of nodes for the whole burst, steered every frame, so
  // 28 rounds a second cost no new nodes. spin 0..1 sets the motor whine; firing chops a noise bed at the fire rate.
  gunLoop(spin, firing, rate = 28) {
    if (!this.ctx) return;
    if (!this.sfxOn) { firing = false; spin = 0; }
    let L = this.loop;
    const c = this.ctx;
    if (!L) {
      if (spin <= 0.001) return;
      const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.8;
      const am = c.createGain(); am.gain.value = 0;
      const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = rate;
      const lg = c.createGain(); lg.gain.value = 0;
      lfo.connect(lg).connect(am.gain);
      src.connect(bp).connect(am).connect(this.master);
      const whine = c.createOscillator(); whine.type = 'sawtooth'; whine.frequency.value = 60;
      const wf = c.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 600;
      const wg = c.createGain(); wg.gain.value = 0;
      whine.connect(wf).connect(wg).connect(this.master);
      src.start(); lfo.start(); whine.start();
      L = this.loop = { src, lfo, whine, am, lg, wg, quiet: 0 };
    }
    const t = c.currentTime, lvl = firing ? 0.42 : 0;
    L.am.gain.setTargetAtTime(lvl * 0.5, t, 0.03); L.lg.gain.setTargetAtTime(lvl * 0.5, t, 0.03);
    L.lfo.frequency.setTargetAtTime(rate, t, 0.05);
    L.whine.frequency.setTargetAtTime(55 + spin * 190, t, 0.06);
    L.wg.gain.setTargetAtTime(spin * 0.07, t, 0.06);
    L.quiet = spin > 0.001 || firing ? 0 : L.quiet + 1;
    if (L.quiet > 20) { // spun down: let the nodes go
      for (const n of [L.src, L.lfo, L.whine]) { try { n.stop(); n.disconnect(); } catch { /* already stopped */ } }
      this.loop = null;
    }
  }

  // Held-down repulsor (Pulse Cannon): one long-lived set of nodes for the whole burst, steered every frame. A buzzing
  // whine chopped at the pulse rate; its pitch sags as the charge runs down. Call it every frame while the weapon is
  // out (firing true/false); it lets the nodes go a moment after the trigger is released.
  // `laser` retunes it for Laser Vision: a thin, high whine with a faster chop and a hotter hiss.
  beamLoop(firing, charge = 1, laser = false) {
    if (!this.ctx) return;
    if (!this.sfxOn) firing = false;
    const c = this.ctx;
    let L = this.beamL;
    if (!L) {
      if (!firing) return;
      const o1 = c.createOscillator(); o1.type = 'sawtooth';
      const o2 = c.createOscillator(); o2.type = 'square';
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4;
      const am = c.createGain(); am.gain.value = 0;
      const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 16.7;
      const lg = c.createGain(); lg.gain.value = 0;
      lfo.connect(lg).connect(am.gain);
      o1.connect(lp); o2.connect(lp); lp.connect(am).connect(this.master);
      const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.9;
      const ng = c.createGain(); ng.gain.value = 0;
      src.connect(bp).connect(ng).connect(this.master);
      for (const n of [o1, o2, lfo, src]) n.start();
      L = this.beamL = { o1, o2, lp, am, lfo, lg, src, ng, quiet: 0 };
      this.tone({ freq: 220, to: 900, dur: 0.16, type: 'sawtooth', gain: 0.09 }); // charge-up
    }
    const t = c.currentTime, lvl = firing ? 1 : 0, f = laser ? 520 + 240 * charge : 110 + 90 * charge;
    L.o1.frequency.setTargetAtTime(f, t, 0.04); L.o2.frequency.setTargetAtTime(f * 0.5, t, 0.04);
    L.lp.frequency.setTargetAtTime(laser ? 1800 + 2600 * charge : 700 + 1800 * charge, t, 0.05);
    L.lfo.frequency.setTargetAtTime(laser ? 34 : 16.7, t, 0.05);
    L.am.gain.setTargetAtTime(lvl * (laser ? 0.045 : 0.07), t, 0.025); L.lg.gain.setTargetAtTime(lvl * (laser ? 0.02 : 0.035), t, 0.025);
    L.ng.gain.setTargetAtTime(lvl * (laser ? 0.08 : 0.11), t, 0.03);
    if (firing) L.quiet = 0;
    else {
      if (L.quiet++ === 0) this.tone({ freq: f * 4, to: 80, dur: 0.24, type: 'sawtooth', gain: 0.07 }); // power-down
      if (L.quiet > 12) {
        for (const n of [L.o1, L.o2, L.lfo, L.src]) { try { n.stop(); n.disconnect(); } catch { /* already stopped */ } }
        this.beamL = null;
      }
    }
  }

  gunLoopStop() {
    const L = this.loop;
    if (!L || !this.ctx) return;
    const t = this.ctx.currentTime;
    L.am.gain.setTargetAtTime(0, t, 0.02); L.lg.gain.setTargetAtTime(0, t, 0.02); L.wg.gain.setTargetAtTime(0, t, 0.02);
    for (const n of [L.src, L.lfo, L.whine]) { try { n.stop(t + 0.2); } catch { /* already stopped */ } }
    this.loop = null;
  }

  play(name, vol = 1) {
    if (!this.ctx || !this.sfxOn) return;
    const now = performance.now();
    if (now - (this.last.get(name) || 0) < 30) return;
    this.last.set(name, now);
    const v = vol;
    switch (name) {
      case 'shot_pistol': this.noiseHit({ dur: 0.12, freq: 2400, gain: 0.5 * v, sweep: 0.3 }); this.tone({ freq: 180, to: 60, dur: 0.08, gain: 0.25 * v }); break;
      case 'shot_revolver': this.noiseHit({ dur: 0.3, freq: 1800, gain: 0.8 * v, sweep: 0.2 }); this.tone({ freq: 120, to: 40, dur: 0.18, gain: 0.4 * v }); break;
      case 'shot_smg': this.noiseHit({ dur: 0.07, freq: 3000, gain: 0.3 * v, sweep: 0.4 }); break;
      case 'shot_ar': this.noiseHit({ dur: 0.1, freq: 2600, gain: 0.42 * v, sweep: 0.3 }); this.tone({ freq: 140, to: 50, dur: 0.06, gain: 0.2 * v }); break;
      case 'shot_shotgun': this.noiseHit({ dur: 0.4, freq: 1400, gain: 0.9 * v, sweep: 0.15 }); this.tone({ freq: 90, to: 35, dur: 0.25, gain: 0.5 * v }); break;
      case 'shot_dmr': this.noiseHit({ dur: 0.35, freq: 3200, gain: 0.7 * v, sweep: 0.1 }); this.tone({ freq: 200, to: 50, dur: 0.15, gain: 0.35 * v }); break;
      case 'shot_coach': this.noiseHit({ dur: 0.45, freq: 1200, gain: 1.0 * v, sweep: 0.15 }); this.tone({ freq: 80, to: 30, dur: 0.3, gain: 0.55 * v }); break;
      case 'shot_lever': this.noiseHit({ dur: 0.3, freq: 2400, gain: 0.65 * v, sweep: 0.15 }); this.tone({ freq: 160, to: 50, dur: 0.14, gain: 0.3 * v }); break;
      case 'shot_lmg': this.noiseHit({ dur: 0.09, freq: 2000, gain: 0.45 * v, sweep: 0.3 }); this.tone({ freq: 110, to: 45, dur: 0.06, gain: 0.3 * v }); break;
      // Heavier and quieter guns. Each is a few nodes per shot; the minigun uses gunLoop() while it fires.
      case 'shot_sniper': this.noiseHit({ dur: 0.7, freq: 3600, gain: 0.95 * v, sweep: 0.06 }); this.tone({ freq: 170, to: 40, dur: 0.22, gain: 0.45 * v }); this.noiseHit({ dur: 0.03, freq: 2600, type: 'bandpass', q: 5, gain: 0.22 * v, delay: 0.42 }); this.noiseHit({ dur: 0.04, freq: 1800, type: 'bandpass', q: 4, gain: 0.25 * v, delay: 0.6 }); break;
      case 'shot_pdw': this.noiseHit({ dur: 0.06, freq: 1100, gain: 0.2 * v, sweep: 0.5 }); this.noiseHit({ dur: 0.02, freq: 3800, type: 'bandpass', q: 3, gain: 0.1 * v }); break;
      case 'shot_hpistol': this.noiseHit({ dur: 0.3, freq: 1700, gain: 0.85 * v, sweep: 0.15 }); this.tone({ freq: 105, to: 38, dur: 0.16, gain: 0.45 * v }); break;
      case 'shot_magnum': this.noiseHit({ dur: 0.5, freq: 1500, gain: 1.0 * v, sweep: 0.1 }); this.tone({ freq: 90, to: 30, dur: 0.28, gain: 0.55 * v }); break;
      case 'shot_sawedoff': this.noiseHit({ dur: 0.38, freq: 1500, gain: 1.0 * v, sweep: 0.13 }); this.tone({ freq: 85, to: 30, dur: 0.24, gain: 0.55 * v }); this.noiseHit({ dur: 0.25, freq: 1100, gain: 0.7 * v, sweep: 0.2, delay: 0.035 }); break;
      case 'shot_crossbow': this.noiseHit({ dur: 0.1, freq: 700, type: 'bandpass', q: 1.5, gain: 0.3 * v }); this.tone({ freq: 150, to: 70, dur: 0.14, type: 'triangle', gain: 0.28 * v }); this.tone({ freq: 560, to: 330, dur: 0.22, type: 'triangle', gain: 0.07 * v }); break;
      case 'shot_grenadel': this.tone({ freq: 95, to: 42, dur: 0.24, gain: 0.6 * v }); this.noiseHit({ dur: 0.28, freq: 600, gain: 0.55 * v, sweep: 0.3 }); this.tone({ freq: 700, to: 300, dur: 0.06, type: 'square', gain: 0.05 * v, delay: 0.02 }); break;
      case 'shot_rocket': this.noiseHit({ dur: 0.9, freq: 500, type: 'bandpass', q: 0.8, gain: 0.85 * v, sweep: 3.5 }); this.tone({ freq: 75, to: 28, dur: 0.55, gain: 0.65 * v }); this.noiseHit({ dur: 0.5, freq: 1600, gain: 0.7 * v, sweep: 0.1 }); break;
      case 'shot_minigun': this.noiseHit({ dur: 0.1, freq: 2200, gain: 0.3 * v, sweep: 0.5 }); this.tone({ freq: 100, to: 60, dur: 0.06, gain: 0.14 * v }); break; // teammates: one rattle per few shots
      case 'web_shoot': this.noiseHit({ dur: 0.11, freq: 3000, type: 'bandpass', q: 2, gain: 0.22 * v, sweep: 0.3 }); this.tone({ freq: 950, to: 380, dur: 0.07, type: 'triangle', gain: 0.08 * v }); break; // the web line's pneumatic "thwip"
      case 'web_release': this.tone({ freq: 420, to: 180, dur: 0.09, type: 'triangle', gain: 0.06 * v }); this.noiseHit({ dur: 0.05, freq: 2200, type: 'bandpass', q: 3, gain: 0.08 * v }); break; // letting go: the line snaps
      case 'shot_laser': this.tone({ freq: 1800, to: 1300, dur: 0.06, type: 'sawtooth', gain: 0.045 * v }); this.noiseHit({ dur: 0.05, freq: 5200, type: 'highpass', gain: 0.05 * v }); break; // teammates: one hiss per pair of pulses
      case 'shot_pulse': this.tone({ freq: 520, to: 250, dur: 0.07, type: 'sawtooth', gain: 0.07 * v }); this.noiseHit({ dur: 0.05, freq: 3200, type: 'highpass', gain: 0.07 * v }); break; // teammates: one zap per pair of pulses
      case 'boom': this.noiseHit({ dur: 1.4, freq: 800, gain: 1.0 * v, sweep: 0.05 }); this.tone({ freq: 58, to: 22, dur: 1.0, gain: 0.85 * v }); this.noiseHit({ dur: 0.9, freq: 2400, type: 'highpass', gain: 0.3 * v, delay: 0.05 }); break;
      case 'swing': this.noiseHit({ dur: 0.18, freq: 900, type: 'bandpass', q: 2, gain: 0.25 * v, sweep: 2.5 }); break;
      case 'hit_melee': this.noiseHit({ dur: 0.12, freq: 500, gain: 0.5 * v }); this.tone({ freq: 110, to: 60, dur: 0.1, gain: 0.3 * v }); break;
      case 'hit': this.tone({ freq: 1400, to: 900, dur: 0.05, type: 'square', gain: 0.05 * v }); break;
      case 'kill': this.tone({ freq: 700, to: 1400, dur: 0.12, type: 'triangle', gain: 0.12 * v }); break;
      case 'coin': this.tone({ freq: 1320, dur: 0.08, type: 'triangle', gain: 0.12 * v }); this.tone({ freq: 1760, dur: 0.15, type: 'triangle', gain: 0.12 * v, delay: 0.06 }); break;
      case 'reload': this.noiseHit({ dur: 0.06, freq: 2000, type: 'bandpass', q: 4, gain: 0.25 * v }); this.noiseHit({ dur: 0.06, freq: 1500, type: 'bandpass', q: 4, gain: 0.25 * v, delay: 0.25 }); break;
      case 'recharge': this.tone({ freq: 140, to: 1100, dur: 2.6, type: 'triangle', gain: 0.07 * v }); this.tone({ freq: 70, to: 550, dur: 2.6, type: 'sawtooth', gain: 0.025 * v }); break; // Pulse Cannon charging back up
      case 'charged': this.tone({ freq: 1200, dur: 0.12, type: 'triangle', gain: 0.1 * v }); this.tone({ freq: 1800, dur: 0.2, type: 'triangle', gain: 0.1 * v, delay: 0.08 }); break;
      case 'cooling': this.noiseHit({ dur: 1.6, freq: 1800, type: 'bandpass', q: 0.7, gain: 0.12 * v, sweep: 0.25 }); this.tone({ freq: 900, to: 160, dur: 1.4, type: 'triangle', gain: 0.03 * v }); break; // Laser Vision overheated: a long hiss of steam
      case 'reloaded':this.noiseHit({ dur: 0.05, freq: 2500, type: 'bandpass', q: 5, gain: 0.3 * v }); break;
      case 'empty': this.tone({ freq: 900, dur: 0.03, type: 'square', gain: 0.08 * v }); break;
      case 'swap': this.noiseHit({ dur: 0.08, freq: 1800, type: 'bandpass', q: 3, gain: 0.2 * v }); break;
      case 'jump': this.noiseHit({ dur: 0.1, freq: 600, gain: 0.08 * v }); break;
      case 'land': this.noiseHit({ dur: 0.15, freq: 300, gain: 0.25 * v }); break;
      case 'hurt': this.tone({ freq: 200, to: 90, dur: 0.18, type: 'sawtooth', gain: 0.15 * v }); this.noiseHit({ dur: 0.1, freq: 700, gain: 0.25 * v }); break;
      case 'death': this.tone({ freq: 300, to: 50, dur: 1.2, type: 'sawtooth', gain: 0.25 * v }); break;
      case 'fire_cast': this.noiseHit({ dur: 0.5, freq: 600, gain: 0.5 * v, sweep: 3 }); break;
      case 'explode': this.noiseHit({ dur: 0.9, freq: 900, gain: 0.9 * v, sweep: 0.1 }); this.tone({ freq: 70, to: 30, dur: 0.6, gain: 0.6 * v }); break;
      case 'inferno': this.noiseHit({ dur: 1.6, freq: 500, gain: 0.7 * v, sweep: 2.5 }); this.tone({ freq: 60, to: 40, dur: 1, gain: 0.4 * v }); break;
      case 'earth': this.noiseHit({ dur: 0.8, freq: 300, gain: 0.8 * v, sweep: 0.5 }); this.tone({ freq: 55, to: 35, dur: 0.6, gain: 0.6 * v }); break;
      case 'quake': this.noiseHit({ dur: 1.4, freq: 250, gain: 0.9 * v, sweep: 0.4 }); this.tone({ freq: 45, to: 28, dur: 1.2, gain: 0.7 * v }); break;
      case 'zap': this.noiseHit({ dur: 0.35, freq: 4000, type: 'highpass', gain: 0.5 * v }); this.tone({ freq: 1800, to: 300, dur: 0.25, type: 'sawtooth', gain: 0.12 * v }); break;
      case 'thunder': this.noiseHit({ dur: 1.2, freq: 1200, gain: 0.8 * v, sweep: 0.08 }); this.tone({ freq: 50, to: 30, dur: 0.9, gain: 0.5 * v }); break;
      case 'ice': this.tone({ freq: 2400, to: 1200, dur: 0.4, type: 'triangle', gain: 0.15 * v }); this.noiseHit({ dur: 0.5, freq: 5000, type: 'highpass', gain: 0.35 * v }); break;
      case 'summon': this.tone({ freq: 90, to: 38, dur: 0.9, type: 'sawtooth', gain: 0.3 * v }); this.noiseHit({ dur: 0.7, freq: 300, type: 'lowpass', gain: 0.5 * v }); this.tone({ freq: 220, to: 110, dur: 0.6, type: 'triangle', gain: 0.12 * v }); break;
      case 'shot_icegun': this.tone({ freq: 1500, to: 500, dur: 0.16, type: 'triangle', gain: 0.16 * v }); this.noiseHit({ dur: 0.1, freq: 4200, type: 'highpass', gain: 0.22 * v }); break;
      case 'shot_gravgun': this.tone({ freq: 140, to: 620, dur: 0.22, type: 'sawtooth', gain: 0.14 * v }); this.tone({ freq: 880, to: 300, dur: 0.18, type: 'sine', gain: 0.12 * v, delay: 0.04 }); this.noiseHit({ dur: 0.14, freq: 1800, type: 'bandpass', q: 2, gain: 0.2 * v }); break;
      case 'grav_pull': this.tone({ freq: 70, to: 520, dur: 1.2, type: 'sawtooth', gain: 0.16 * v }); this.tone({ freq: 140, to: 1040, dur: 1.2, type: 'sine', gain: 0.1 * v }); this.noiseHit({ dur: 1.2, freq: 300, type: 'bandpass', q: 2, gain: 0.35 * v, sweep: 8 }); break;
      case 'grav_boom': this.noiseHit({ dur: 1.1, freq: 1100, gain: 1.0 * v, sweep: 0.08 }); this.tone({ freq: 90, to: 22, dur: 0.9, gain: 0.8 * v }); this.tone({ freq: 1200, to: 200, dur: 0.3, type: 'sawtooth', gain: 0.14 * v }); break;
      case 'ice_big': this.tone({ freq: 1800, to: 600, dur: 0.8, type: 'triangle', gain: 0.18 * v }); this.noiseHit({ dur: 1.0, freq: 3500, type: 'highpass', gain: 0.5 * v }); this.tone({ freq: 70, to: 40, dur: 0.5, gain: 0.4 * v }); break;
      case 'wind': this.noiseHit({ dur: 0.5, freq: 800, type: 'bandpass', q: 1.5, gain: 0.6 * v, sweep: 3 }); break;
      case 'howl': this.noiseHit({ dur: 3.2, freq: 500, type: 'bandpass', q: 3, gain: 0.5 * v, sweep: 2.5 }); this.noiseHit({ dur: 3.0, freq: 1500, type: 'bandpass', q: 5, gain: 0.25 * v, sweep: 0.5, delay: 0.1 }); this.tone({ freq: 160, to: 240, dur: 3, type: 'sine', gain: 0.05 * v }); break;
      case 'deflect': this.tone({ freq: 1400, to: 700, dur: 0.12, type: 'triangle', gain: 0.1 * v }); this.noiseHit({ dur: 0.18, freq: 3000, type: 'bandpass', q: 2, gain: 0.25 * v, sweep: 0.4 }); break;
      case 'cyclone': this.noiseHit({ dur: 2.5, freq: 400, type: 'bandpass', q: 1, gain: 0.6 * v, sweep: 4 }); break;
      case 'place': this.tone({ freq: 400, to: 600, dur: 0.15, type: 'triangle', gain: 0.15 * v }); break;
      case 'buy': this.tone({ freq: 880, dur: 0.1, type: 'triangle', gain: 0.15 * v }); this.tone({ freq: 1320, dur: 0.2, type: 'triangle', gain: 0.15 * v, delay: 0.08 }); break;
      case 'deny': this.tone({ freq: 200, dur: 0.15, type: 'square', gain: 0.08 * v }); break;
      case 'crate': this.noiseHit({ dur: 0.3, freq: 800, gain: 0.4 * v }); [660, 880, 1320].forEach((f, i) => this.tone({ freq: f, dur: 0.2, type: 'triangle', gain: 0.12 * v, delay: 0.1 + i * 0.08 })); break;
      case 'spit': this.noiseHit({ dur: 0.2, freq: 900, type: 'bandpass', q: 3, gain: 0.25 * v, sweep: 0.5 }); break;
      case 'slam': this.noiseHit({ dur: 1.0, freq: 400, gain: 0.9 * v, sweep: 0.2 }); this.tone({ freq: 50, to: 25, dur: 0.8, gain: 0.7 * v }); break;
      case 'roar': this.tone({ freq: 90, to: 50, dur: 1.5, type: 'sawtooth', gain: 0.3 * v }); this.noiseHit({ dur: 1.5, freq: 300, gain: 0.5 * v }); break;
      case 'demon': this.tone({ freq: 220, to: 110, dur: 2.5, type: 'sawtooth', gain: 0.2 * v }); this.tone({ freq: 233, to: 116, dur: 2.5, type: 'sawtooth', gain: 0.2 * v }); break;
      case 'hell_rise': this.tone({ freq: 70, to: 30, dur: 0.8, type: 'sawtooth', gain: 0.18 * v }); this.noiseHit({ dur: 0.7, freq: 500, type: 'lowpass', gain: 0.35 * v }); this.noiseHit({ dur: 0.5, freq: 2200, type: 'bandpass', q: 1.5, gain: 0.12 * v, delay: 0.1 }); break;
      case 'heal_staff': this.tone({ freq: 523, to: 784, dur: 0.5, type: 'sine', gain: 0.12 * v }); this.tone({ freq: 784, to: 1175, dur: 0.6, type: 'sine', gain: 0.1 * v, delay: 0.12 }); this.tone({ freq: 1568, to: 1760, dur: 0.8, type: 'triangle', gain: 0.05 * v, delay: 0.25 }); this.noiseHit({ dur: 0.5, freq: 5000, type: 'highpass', gain: 0.06 * v }); break;
      case 'heal': this.tone({ freq: 660, to: 990, dur: 0.3, type: 'sine', gain: 0.1 * v }); break;
      case 'ui': this.tone({ freq: 1000, dur: 0.05, type: 'triangle', gain: 0.08 * v }); break;
      // Mutators.
      case 'pinata': this.noiseHit({ dur: 0.09, freq: 3200, type: 'highpass', gain: 0.55 * v }); this.noiseHit({ dur: 0.25, freq: 900, gain: 0.25 * v, delay: 0.02 }); [1047, 1319, 1568].forEach((f, i) => this.tone({ freq: f, dur: 0.09, type: 'triangle', gain: 0.07 * v, delay: 0.05 + i * 0.05 })); break;
      case 'candy': this.tone({ freq: 1568, to: 2093, dur: 0.07, type: 'triangle', gain: 0.1 * v }); break;
      case 'jackpot': [784, 988, 1175, 1568, 1976].forEach((f, i) => this.tone({ freq: f, dur: 0.16, type: 'square', gain: 0.07 * v, delay: i * 0.07 })); for (let i = 0; i < 10; i++) this.tone({ freq: 1320 + (i % 3) * 260, dur: 0.06, type: 'triangle', gain: 0.08 * v, delay: 0.4 + i * 0.06 }); this.noiseHit({ dur: 0.5, freq: 5000, type: 'highpass', gain: 0.12 * v, delay: 0.35 }); break;
      case 'necro_rise': this.tone({ freq: 110, to: 220, dur: 0.9, type: 'sawtooth', gain: 0.07 * v }); this.tone({ freq: 165, to: 330, dur: 0.9, type: 'sine', gain: 0.1 * v, delay: 0.05 }); this.noiseHit({ dur: 0.8, freq: 600, gain: 0.12 * v }); break;
      case 'necro_fall': this.tone({ freq: 220, to: 70, dur: 0.6, type: 'sine', gain: 0.12 * v }); this.noiseHit({ dur: 0.5, freq: 500, gain: 0.1 * v }); break;
      case 'bt_in': this.tone({ freq: 520, to: 70, dur: 0.55, type: 'sine', gain: 0.3 * v }); this.noiseHit({ dur: 0.5, freq: 500, gain: 0.18 * v }); break;
      case 'bt_out': this.tone({ freq: 90, to: 620, dur: 0.3, type: 'sine', gain: 0.24 * v }); break;
      case 'mu_sting': this.tone({ freq: 55, to: 40, dur: 1.4, type: 'sawtooth', gain: 0.18 * v }); this.tone({ freq: 82, to: 60, dur: 1.4, type: 'sine', gain: 0.25 * v }); this.noiseHit({ dur: 0.6, freq: 300, gain: 0.35 * v }); [311, 294].forEach((f, i) => this.tone({ freq: f, dur: 0.7, type: 'triangle', gain: 0.06 * v, delay: 0.15 + i * 0.35 })); break;
      case 'round': [392, 523, 659, 784].forEach((f, i) => this.tone({ freq: f, dur: 0.4, type: 'triangle', gain: 0.12 * v, delay: i * 0.12 })); break;
      case 'bless': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone({ freq: f, dur: 0.8, type: 'sine', gain: 0.1 * v, delay: i * 0.1 })); break;
    }
  }
}
