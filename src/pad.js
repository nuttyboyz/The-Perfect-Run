// Gamepad support: maps a standard controller onto the same input object the
// keyboard and mouse fill, and drives menus with spatial focus navigation.
import { padPhys, anyPadRemap } from './controls.js';
const DEAD = 0.18;
const dz = (v) => (Math.abs(v) < DEAD ? 0 : Math.sign(v) * (Math.abs(v) - DEAD) / (1 - DEAD));

// Standard mapping (Xbox names): 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT,
// 8 View, 9 Menu, 10 L3, 11 R3, 12-15 d-pad up/down/left/right.
// Y / △ is the third ability (G), D-pad up does nothing, D-pad down is the game speed, ◀ ▶ swap weapons.
const HOLD = { 0: ['Space'], 1: ['KeyX'], 2: ['KeyR', 'KeyE'], 3: ['KeyG'], 4: ['KeyQ'], 5: ['KeyF'], 6: ['PadClose'], 10: ['PadDown'], 14: ['Digit1'], 15: ['Digit2'] };

export function connectedPads() {
  return [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter((p) => p && p.connected);
}

export class PadInput {
  // which: a gamepad index, 'any' (first connected), or null (none).
  constructor(which) { this.which = which; this.prev = []; this.held = new Set(); this.sprint = false; this.lastUse = -1e9; this.navCd = 0; }
  get() {
    const pads = connectedPads();
    if (this.which === null || this.which === undefined) return null;
    if (this.which === 'any') return pads[0] || null;
    return pads.find((p) => p.index === this.which) || null;
  }
  get active() { return performance.now() - this.lastUse < 8000; }

  // Gameplay: merge this frame's controller state into the shared input object.
  apply(I, dt, now) {
    const p = this.get();
    if (!p) { this.release(I); return null; }
    const raw = p.buttons.map((x) => x.pressed || x.value > 0.4);
    // Remapped buttons (Controls screen): each game button reads the physical button it was moved to. Real controllers only.
    const b = p.index >= 0 && anyPadRemap() ? raw.map((v, i) => (i < 16 ? !!raw[padPhys(i)] : v)) : raw;
    const down = (i) => b[i] && !this.prev[i];
    const lx = dz(p.axes[0] || 0), ly = dz(p.axes[1] || 0), rx = dz(p.axes[2] || 0), ry = dz(p.axes[3] || 0);
    if (b.some(Boolean) || lx || ly || rx || ry) this.lastUse = performance.now();
    // Move: analog stick.
    I.ax = lx; I.ay = -ly;
    if (Math.hypot(lx, ly) < 0.3) this.sprint = false;
    if (down(10) && !I.jetOn) this.sprint = !this.sprint; // with the jetpack lit, L3 means descend
    I.padSprint = !I.jetOn && (this.sprint || (I.ay > 0.95 && b[10]));
    // Look: right stick with a response curve.
    const curve = (v) => Math.sign(v) * Math.pow(Math.abs(v), 1.7);
    I.dx += curve(rx) * 1250 * dt;
    I.dy += curve(ry) * 900 * dt;
    // Fire / ultimate.
    if (b[7]) { if (!this.prev[7]) I.mouseClicked = true; I.padFire = true; } else I.padFire = false;
    // Held keys and presses.
    for (const [i, codes] of Object.entries(HOLD)) {
      for (const c of codes) {
        if (b[i]) { if (!this.prev[i]) I.pressed.add(c); if (!I.keys.has(c)) { I.keys.add(c); this.held.add(c); } }
        else if (this.held.has(c)) { I.keys.delete(c); this.held.delete(c); }
      }
    }
    // R3 flips the camera view; with the left trigger held it places a bed. D-pad down is the speed-up button.
    if (down(11)) I.pressed.add(b[6] ? 'KeyB' : 'KeyV');
    const ev = { pause: down(9), shop: down(8), back: down(1), a: down(0), dl: down(14), dr: down(15), du: down(12), dd: down(13) };
    this.prev = b;
    return ev;
  }
  release(I) { for (const c of this.held) I.keys.delete(c); this.held.clear(); I.ax = I.ay = 0; I.padFire = false; }

  // Menus: move focus between visible controls, A presses, B goes back.
  nav(root, dt) {
    const p = this.get();
    if (!p) return;
    const b = p.buttons.map((x) => x.pressed || x.value > 0.5);
    const down = (i) => b[i] && !this.prev[i];
    const lx = dz(p.axes[0] || 0), ly = dz(p.axes[1] || 0);
    if (b.some(Boolean) || lx || ly) this.lastUse = performance.now();
    if (root.querySelector('#controls.listening')) { this.prev = b; return; } // the Controls screen is waiting for a button to remap
    this.navCd -= dt;
    let dir = null;
    if (down(12) || (ly < -0.6 && this.navCd <= 0)) dir = [0, -1];
    else if (down(13) || (ly > 0.6 && this.navCd <= 0)) dir = [0, 1];
    else if (down(14) || (lx < -0.6 && this.navCd <= 0)) dir = [-1, 0];
    else if (down(15) || (lx > 0.6 && this.navCd <= 0)) dir = [1, 0];
    if (!lx && !ly) this.navCd = 0;
    const items = focusables(root);
    let cur = items.find((e) => e.classList.contains('pad-focus'));
    if (!cur && items.length && (dir || down(0))) { setFocus(root, items.find((e) => e.matches('.sel, .primary, .pad-first')) || items[0]); this.prev = b; return; }
    if (dir && cur) {
      this.navCd = 0.22;
      // A focused slider moves left/right instead of focus.
      if (cur.tagName === 'INPUT' && cur.type === 'range' && dir[0]) {
        const st = +cur.step || 0.05; cur.value = String(+cur.value + dir[0] * st * 2); cur.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        const next = spatial(cur, items, dir);
        if (next) setFocus(root, next);
      }
    }
    // Right stick scrolls the list under the focus (or the first open list) and the focus follows it.
    const ry = dz(p.axes[3] || 0);
    if (ry) {
      const sc = (cur && scrollerOf(cur)) || [...root.querySelectorAll('.screen.on .wall, .overlay.on .set-panes, .overlay.on .cz-list')].find(visible);
      if (sc && sc.scrollHeight > sc.clientHeight + 2) {
        glides.delete(sc);
        sc.scrollTop += ry * dt * sc.clientHeight * 2.2;
        if (cur && sc.contains(cur)) {
          const s = sc.getBoundingClientRect(), r = cur.getBoundingClientRect(), cx = r.left + r.width / 2;
          if (r.top < s.top - 2 || r.bottom > s.bottom + 2) {
            let best = null, bs = Infinity;
            for (const e of items) { if (!sc.contains(e)) continue; const q = e.getBoundingClientRect(); if (q.top < s.top - 2 || q.bottom > s.bottom + 2) continue;
              const sco = Math.abs(q.left + q.width / 2 - cx) * 3 + (ry > 0 ? q.top - s.top : s.bottom - q.bottom); if (sco < bs) { bs = sco; best = e; } }
            if (best) { root.querySelectorAll('.pad-focus').forEach((e) => e.classList.remove('pad-focus')); best.classList.add('pad-focus'); best.dispatchEvent(new CustomEvent('padfocus', { bubbles: true })); }
          }
        }
      }
    }
    if (down(0) && cur) press(cur);
    if (down(9)) { const r = root.querySelector('.overlay.on #pause-resume'); if (r && visible(r)) r.click(); }
    if (down(1)) {
      // Most specific "back" first. Leaving the lobby is never on B in split-screen: one slip would end the game for both players.
      const sels = ['.overlay.on [data-act=close]', '.pad-modal.on [data-back]', '.pad-root [data-back]', '.overlay.on #shop-close', '.screen.on [data-back]', '.screen.on #btn-to-char', '.screen.on .flip-back'];
      if (!document.body.classList.contains('split')) sels.push('.screen.on #btn-leave');
      let back = null;
      for (const sel of sels) { back = [...root.querySelectorAll(sel)].find(visible); if (back) break; }
      if (back) back.click();
    }
    this.prev = b;
  }
}

function visible(e) { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; }
function focusables(root) {
  // The top-most open layer wins: an open overlay, else the open screen.
  const layers = [...root.querySelectorAll('.overlay.on:not(.soft), .screen.on, .overlay.on.soft')];
  const modal = [...root.querySelectorAll('.pad-modal.on')].find(visible); // e.g. the on-screen keyboard
  const layer = modal || layers.find((l) => l.classList.contains('overlay') && !l.classList.contains('soft')) || layers.find((l) => l.classList.contains('screen')) || layers[0] || (root.classList && root.classList.contains('pad-root') ? root : null);
  if (!layer) return [];
  return [...layer.querySelectorAll('button, select, input[type=range], input[type=checkbox], .pad-nav')].filter((e) => !e.disabled && visible(e) && (modal || !e.closest('.pad-modal')));
}
export function setFocus(root, el) {
  root.querySelectorAll('.pad-focus').forEach((e) => e.classList.remove('pad-focus'));
  el.classList.add('pad-focus');
  const sc = scrollerOf(el);
  if (sc) {
    // Inside a scrolling list: glide so the focused item sits comfortably in view, with the next row already showing.
    const r = el.getBoundingClientRect(), s = sc.getBoundingClientRect(), pad = Math.min(r.height * 0.9, s.height * 0.25);
    let dy = 0;
    if (r.top < s.top + pad) dy = r.top - s.top - pad; else if (r.bottom > s.bottom - pad) dy = r.bottom - s.bottom + pad;
    const to = Math.max(0, Math.min(sc.scrollHeight - sc.clientHeight, sc.scrollTop + dy));
    if (Math.abs(to - sc.scrollTop) > 1) glide(sc, to);
  } else el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  el.dispatchEvent(new CustomEvent('padfocus', { bubbles: true }));
}
// The nearest scrolling list an element sits in (weapon wall, settings panes, ...).
function scrollerOf(el) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    if (p.scrollHeight > p.clientHeight + 2) { const o = getComputedStyle(p).overflowY; if (o === 'auto' || o === 'scroll') return p; }
  }
  return null;
}
const glides = new WeakMap();
function glide(sc, to) {
  const from = sc.scrollTop, t0 = performance.now(), id = {};
  glides.set(sc, id); sc._glideTo = to;
  const step = (t) => {
    if (glides.get(sc) !== id) return;
    const k = Math.min(1, (t - t0) / 140), e = 1 - (1 - k) * (1 - k);
    sc.scrollTop = from + (to - from) * e;
    if (k < 1) requestAnimationFrame(step); else sc._glideTo = null;
  };
  requestAnimationFrame(step);
}
function spatial(cur, items, dir) {
  // Inside a scrolling list, stay in the list while it still has something that way, even if it is scrolled out of sight.
  const sc = scrollerOf(cur);
  if (sc) {
    const own = items.filter((e) => sc.contains(e));
    const inside = spatial1(cur, own, dir, true); if (inside) return inside;
    // End of a row: carry on to the next (or previous) item, so left and right alone can walk the whole list.
    if (dir[0]) { const i = own.indexOf(cur) + dir[0]; if (own[i]) return own[i]; }
  }
  return spatial1(cur, items, dir, false);
}
function spatial1(cur, items, [dx, dy], grid) {
  const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bs = Infinity;
  for (const e of items) {
    if (e === cur) continue;
    const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const vx = x - ax, vy = y - ay;
    const along = vx * dx + vy * dy;
    if (along <= 4) continue;
    const across = Math.abs(vx * dy - vy * dx);
    if (grid && dx && across > a.height * 0.5) continue; // left and right stay on the same row
    const score = along + across * 2.2;
    if (score < bs) { bs = score; best = e; }
  }
  return best;
}
function press(el) {
  if (el.classList.contains('pad-text')) { el.dispatchEvent(new CustomEvent('padtype', { bubbles: true })); return; } // a text box: open the on-screen keyboard
  if (el.tagName === 'SELECT') { el.selectedIndex = (el.selectedIndex + 1) % el.options.length; el.dispatchEvent(new Event('change', { bubbles: true })); return; }
  if (el.tagName === 'INPUT' && el.type === 'checkbox') { el.checked = !el.checked; el.dispatchEvent(new Event('change', { bubbles: true })); return; }
  el.click();
}

// ---------------- couch co-op: keyboard stand-in for a controller ----------------
// Player 2 can play on the right-hand side of the keyboard while player 1 keeps the mouse and WASD.
// It is a PadInput whose "controller" is read from the keys, so gameplay and menu navigation reuse
// the controller code unchanged. Game mode is tank-style: arrows move and turn.
export const KEYPAD_HELP = [
  ['↑ ↓', 'Move'], ['← →', 'Turn'], [', .', 'Strafe'], ['Enter', 'Attack'], ['/', 'Jump'], ['R Shift', 'Sprint'], ["'", 'Dash'],
  ['[ ] P', 'Abilities'], [';', 'Reload / use'], ['9 0', 'Previous / next weapon'], ['\\', 'CPU plays / take over'], ['N', 'Game speed'], ['PgUp PgDn', 'Aim up / down'], ['Backspace', 'Menu'], ['=', 'Shop'],
];
// physical key -> controller button, per mode
const KP_GAME = { Slash: [0], Quote: [1], Semicolon: [2], KeyP: [3], BracketLeft: [4], BracketRight: [5], Enter: [7], ShiftRight: [10], Backslash: [12], KeyN: [13], Digit9: [14], Digit0: [15], Backspace: [9], Equal: [8] };
const KP_MENU = { Enter: [0], Slash: [0], Backspace: [1, 9], Escape: [1] };
const KP_ALL = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Comma', 'Period', 'PageUp', 'PageDown', ...Object.keys(KP_GAME), ...Object.keys(KP_MENU)]);
KP_ALL.delete('Escape'); // Escape stays player 1's menu key
const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA');

export class KeyPad extends PadInput {
  constructor() {
    super('kb');
    this.reserved = KP_ALL;
    this.down = new Set();
    this.menu = false;
    this.fake = { connected: true, index: -1, id: 'Keyboard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
    this.onDown = (e) => { if (!KP_ALL.has(e.code) || typing(e)) return; this.down.add(e.code); e.preventDefault(); };
    this.onUp = (e) => { this.down.delete(e.code); };
    this.onBlur = () => this.down.clear();
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }
  dispose() {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }
  get() {
    const d = this.down, f = this.fake, ax = f.axes;
    for (const b of f.buttons) b.pressed = false;
    const map = this.menu ? KP_MENU : KP_GAME;
    for (const k of d) { const bs = map[k]; if (bs) for (const i of bs) f.buttons[i].pressed = true; }
    const h = (a, b) => (d.has(b) ? 1 : 0) - (d.has(a) ? 1 : 0);
    ax[1] = h('ArrowUp', 'ArrowDown');
    if (this.menu) { ax[0] = h('ArrowLeft', 'ArrowRight'); ax[2] = 0; ax[3] = 0; }
    else { ax[0] = h('Comma', 'Period'); ax[2] = h('ArrowLeft', 'ArrowRight'); ax[3] = h('PageUp', 'PageDown'); }
    return f;
  }
  apply(I, dt, now) { this.menu = false; return super.apply(I, dt, now); }
  nav(root, dt) { this.menu = true; super.nav(root, dt); }
}
