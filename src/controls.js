// Controls screen (Nutty 2026-11-11): three coloured tabs (Keyboard + Mouse red, DualShock blue, Xbox green), a list
// of every game control on the left and a picture of the device on the right. Whichever control you scroll to,
// point at or focus lights up on the picture like a hologram. Any control can be remapped; the picture always
// lights the button it is on NOW, and Restore defaults puts everything back.
// Remaps live in settings.binds = { kb: { logicalCode: physicalCode }, pad: { logicalButton: physicalButton } }.
// The rest of the game keeps asking for the default key codes / button numbers; the input layer translates.

export const BINDS = { kb: {}, pad: {} };

// One row per game control. key = default keyboard code (remappable), kfix = fixed keyboard parts to light,
// btn = default controller button number (remappable), pfix = fixed controller parts to light.
export const ACTIONS = [
  { id: 'move', name: 'Move', kfix: ['KeyW', 'KeyA', 'KeyS', 'KeyD'], pfix: ['ls'], hint: 'Walk and run' },
  { id: 'look', name: 'Look / Aim', kfix: ['Mouse'], pfix: ['rs'], hint: 'Turn the camera' },
  { id: 'fire', name: 'Shoot / Attack', kfix: ['MouseL'], btn: 7, hint: 'Fire guns, swing melee weapons' },
  { id: 'aim', name: 'Aim / Block', key: 'KeyC', kfix: ['MouseR'], btn: 6, hint: 'Aim down sights, or block with a melee weapon' },
  { id: 'jump', name: 'Jump', key: 'Space', btn: 0, hint: 'Also Web Swing and Jetpack when equipped' },
  { id: 'sprint', name: 'Sprint', key: 'ShiftLeft', btn: 10, hint: 'Run faster' },
  { id: 'dash', name: 'Dash', key: 'KeyX', btn: 1, hint: 'A quick burst in the direction you move' },
  { id: 'ab1', name: 'Element Ability', key: 'KeyQ', btn: 4, hint: 'Your first element power' },
  { id: 'ab2', name: 'Third Ability', key: 'KeyG', btn: 3, hint: 'Your second element power' },
  { id: 'ult', name: 'Ultimate', key: 'KeyF', btn: 5, hint: 'Your strongest element power' },
  { id: 'reload', name: 'Reload', padName: 'Reload / Use', key: 'KeyR', btn: 2, hint: 'Reload your gun' },
  { id: 'use', name: 'Use / Open', key: 'KeyE', kbOnly: true, hint: 'Open crates, take power-ups, use the altar' },
  { id: 'w1', name: 'Weapon 1', padName: 'Previous Weapon', key: 'Digit1', btn: 14, hint: 'Swap weapon' },
  { id: 'w2', name: 'Weapon 2', padName: 'Next Weapon', key: 'Digit2', btn: 15, hint: 'Swap weapon' },
  { id: 'w3', name: 'Weapon 3', key: 'Digit3', kfix: ['Wheel'], kbOnly: true, hint: 'Swap weapon (the wheel cycles too)' },
  { id: 'camera', name: 'First / Third Person', key: 'KeyV', btn: 11, hint: 'Switch the camera view' },
  { id: 'shop', name: 'Shop', key: 'Tab', btn: 8, hint: 'Open the shop' },
  { id: 'speed', name: 'Game Speed', key: 'KeyT', btn: 13, hint: 'Solo and couch runs, once unlocked' },
  { id: 'cpu', name: 'CPU Takeover', key: 'KeyP', btn: 12, hint: 'CPU Run only: hand over or take back' },
  { id: 'pause', name: 'Pause Menu', kfix: ['Escape'], btn: 9, hint: 'Open this menu' },
];

export const PAD_NAMES = {
  ds: ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3', '▲', '▼', '◀', '▶'],
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3', '▲', '▼', '◀', '▶'],
};
const KEY_NAMES = { Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'R Shift', ControlLeft: 'Ctrl', ControlRight: 'R Ctrl', AltLeft: 'Alt', AltRight: 'R Alt', Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace', CapsLock: 'Caps', Escape: 'Esc', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Mouse: 'Mouse', MouseL: 'Left click', MouseR: 'Right click', Wheel: 'Wheel' };
export const keyName = (c) => KEY_NAMES[c] || String(c).replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');

// ---- translation used by the input layer ----
// Which physical key is this default code on now?
export const kbPhys = (logical) => BINDS.kb[logical] || logical;
// A physical key press -> the default code the game listens for.
let _inv = null;
export function kbLogical(phys) {
  if (!_inv) { _inv = {}; for (const [l, p] of Object.entries(BINDS.kb)) _inv[p] = l; }
  if (_inv[phys]) return _inv[phys];
  return BINDS.kb[phys] && BINDS.kb[phys] !== phys ? 'Unbound' : phys;
}
// Which physical controller button is this default button number on now?
export const padPhys = (i) => (BINDS.pad[i] ?? i);
export const anyPadRemap = () => Object.keys(BINDS.pad).length > 0;

export function loadBinds(saved) {
  BINDS.kb = {}; BINDS.pad = {};
  if (saved && typeof saved === 'object') {
    for (const [k, v] of Object.entries(saved.kb || {})) if (typeof v === 'string' && v !== k) BINDS.kb[k] = v;
    for (const [k, v] of Object.entries(saved.pad || {})) if (Number.isInteger(+v) && +v !== +k && +v >= 0 && +v < 16) BINDS.pad[+k] = +v;
  }
  _inv = null;
}
export const bindsJSON = () => ({ kb: { ...BINDS.kb }, pad: { ...BINDS.pad } });
// Put a control on a new key / button. Whatever was on that key / button swaps onto the old one, so nothing is ever left unbound.
export function bindKey(logical, phys) {
  const old = kbPhys(logical), other = kbLogical(phys);
  if (old === phys) return;
  BINDS.kb[logical] = phys;
  if (other !== 'Unbound' && other !== logical) BINDS.kb[other] = old;
  for (const k of Object.keys(BINDS.kb)) if (BINDS.kb[k] === k) delete BINDS.kb[k];
  _inv = null;
}
export function bindPad(logical, phys) {
  const old = padPhys(logical);
  if (old === phys) return;
  let other = phys;
  for (let i = 0; i < 16; i++) if (padPhys(i) === phys) other = i;
  BINDS.pad[logical] = phys;
  if (other !== logical) BINDS.pad[other] = old;
  for (const k of Object.keys(BINDS.pad)) if (BINDS.pad[k] === +k) delete BINDS.pad[k];
}
export function resetBinds(tab) { if (tab === 'kb') BINDS.kb = {}; else BINDS.pad = {}; _inv = null; }

// What a row shows as its key / button, and which picture parts light up.
export function actionInfo(a, tab) {
  if (tab === 'kb') {
    const parts = [...(a.key ? [kbPhys(a.key)] : []), ...(a.kfix || [])];
    const label = a.id === 'move' ? 'W A S D' : parts.map(keyName).join(a.id === 'w3' ? ' / ' : ' or ');
    return { parts, label, can: !!a.key, changed: !!a.key && kbPhys(a.key) !== a.key };
  }
  const N = PAD_NAMES[tab];
  if (a.pcombo) { const p = a.pcombo.map(padPhys); return { parts: p.map((i) => 'b' + i), label: p.map((i) => N[i]).join(' + '), can: false, changed: false }; }
  if (a.btn !== undefined) { const p = padPhys(a.btn); return { parts: ['b' + p], label: N[p], can: true, changed: p !== a.btn }; }
  return { parts: a.pfix || [], label: (a.pfix || [])[0] === 'ls' ? 'Left stick' : 'Right stick', can: false, changed: false };
}

// ------------------------------------------------------------------ pictures
function padSvg(kind) {
  const ds = kind === 'ds', N = PAD_NAMES[kind];
  const LS = ds ? [245, 268] : [165, 188], DP = ds ? [165, 188] : [245, 268], RS = [395, 268], FB = [475, 188];
  const face = (i, dx, dy) => `<g class="pc" data-c="b${i}"><circle cx="${FB[0] + dx}" cy="${FB[1] + dy}" r="19"/><text x="${FB[0] + dx}" y="${FB[1] + dy + 6}">${N[i]}</text></g>`;
  const dp = (i, x, y, w, h, t, tx, ty) => `<g class="pc" data-c="b${i}"><rect x="${DP[0] + x}" y="${DP[1] + y}" width="${w}" height="${h}" rx="5"/><text class="sm" x="${DP[0] + tx}" y="${DP[1] + ty}">${t}</text></g>`;
  const stick = (c, P, name) => `<g class="pc" data-c="${c}"><circle cx="${P[0]}" cy="${P[1]}" r="33"/><circle class="in" cx="${P[0]}" cy="${P[1]}" r="21"/><text class="sm" x="${P[0]}" y="${P[1] + 5}">${name}</text></g>`;
  const pill = (i, x, y, w, h, tx, ty) => `<g class="pc" data-c="b${i}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(h / 2, 12)}"/><text class="sm" x="${tx}" y="${ty}">${N[i]}</text></g>`;
  return `<svg viewBox="0 0 640 420" class="ctl-svg pad ${kind}">
    <path class="body" d="M150 112 Q320 88 490 112 Q566 124 590 252 Q604 344 562 372 Q522 388 480 304 Q468 274 430 274 L210 274 Q172 274 160 304 Q118 388 78 372 Q36 344 50 252 Q74 124 150 112 Z"/>
    ${pill(6, 104, 26, 104, 40, 156, 52)}${pill(7, 432, 26, 104, 40, 484, 52)}
    ${pill(4, 100, 76, 116, 26, 158, 94)}${pill(5, 424, 76, 116, 26, 482, 94)}
    ${ds ? '<rect class="deco" x="256" y="128" width="128" height="74" rx="10"/>' : '<circle class="deco" cx="320" cy="150" r="20"/>'}
    ${ds ? pill(8, 214, 132, 30, 18, 229, 124) + pill(9, 396, 132, 30, 18, 411, 124) : pill(8, 262, 180, 34, 20, 279, 216) + pill(9, 344, 180, 34, 20, 361, 216)}
    ${dp(12, -11, -38, 22, 28, '▲', 0, -18)}${dp(13, -11, 10, 22, 28, '▼', 0, 30)}${dp(14, -38, -11, 28, 22, '◀', -24, 5)}${dp(15, 10, -11, 28, 22, '▶', 24, 5)}
    ${face(0, 0, 36)}${face(1, 36, 0)}${face(2, -36, 0)}${face(3, 0, -36)}
    ${stick('ls b10', LS, 'L3')}${stick('rs b11', RS, 'R3')}
  </svg>`;
}
const KB_ROWS = [
  [['Escape', 1, 'Esc'], ['Digit1'], ['Digit2'], ['Digit3'], ['Digit4'], ['Digit5'], ['Digit6'], ['Digit7'], ['Digit8'], ['Digit9'], ['Digit0'], ['Minus'], ['Equal'], ['Backspace', 2, '⌫']],
  [['Tab', 1.5], ['KeyQ'], ['KeyW'], ['KeyE'], ['KeyR'], ['KeyT'], ['KeyY'], ['KeyU'], ['KeyI'], ['KeyO'], ['KeyP'], ['BracketLeft'], ['BracketRight'], ['Backslash', 1.5]],
  [['CapsLock', 1.75], ['KeyA'], ['KeyS'], ['KeyD'], ['KeyF'], ['KeyG'], ['KeyH'], ['KeyJ'], ['KeyK'], ['KeyL'], ['Semicolon'], ['Quote'], ['Enter', 2.25]],
  [['ShiftLeft', 2.25], ['KeyZ'], ['KeyX'], ['KeyC'], ['KeyV'], ['KeyB'], ['KeyN'], ['KeyM'], ['Comma'], ['Period'], ['Slash'], ['ShiftRight', 2.75, 'Shift']],
  [['ControlLeft', 1.5], ['MetaLeft', 1.25, ''], ['AltLeft', 1.25], ['Space', 6.5], ['AltRight', 1.25, 'Alt'], ['ArrowLeft', 1], ['ArrowDown', 1], ['ArrowRight', 1], ['ArrowUp', 1]],
];
function kbSvg() {
  const U = 42, G = 4;
  let out = '';
  KB_ROWS.forEach((row, r) => {
    let x = 8;
    for (const [code, w = 1, lbl] of row) {
      const ww = w * U - G, t = lbl !== undefined ? lbl : keyName(code);
      out += `<g class="pc" data-c="${code}"><rect x="${x}" y="${12 + r * U}" width="${ww}" height="${U - G}" rx="6"/><text class="${t.length > 2 ? 'xs' : 'sm'}" x="${x + ww / 2}" y="${12 + r * U + 24}">${t.replace('&', '&amp;').replace('<', '&lt;')}</text></g>`;
      x += w * U;
    }
  });
  const mx = 668;
  out += `<g class="pc" data-c="Mouse"><rect x="${mx}" y="34" width="96" height="160" rx="46"/></g>
    <g class="pc" data-c="MouseL"><path d="M${mx} 104 V80 Q${mx} 34 ${mx + 44} 34 V104 Z"/><text class="xs" x="${mx + 23}" y="80">L</text></g>
    <g class="pc" data-c="MouseR"><path d="M${mx + 96} 104 V80 Q${mx + 96} 34 ${mx + 52} 34 V104 Z"/><text class="xs" x="${mx + 73}" y="80">R</text></g>
    <g class="pc" data-c="Wheel"><rect x="${mx + 41}" y="52" width="14" height="34" rx="7"/></g>`;
  return `<svg viewBox="0 0 776 232" class="ctl-svg kb">${out}</svg>`;
}

// ------------------------------------------------------------------ the screen
const TABS = [['kb', 'Keyboard + Mouse'], ['ds', 'DualShock Controller'], ['xbox', 'Xbox Controller']];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class ControlsScreen {
  // el: the #controls overlay. onChange(): binds changed (save + refresh prompts). onClose(): closed.
  constructor(el, { onChange, onClose, sound }) {
    this.el = el; this.onChange = onChange; this.onClose = onClose; this.sound = sound || (() => {});
    this.tab = 'kb'; this.sel = 'move'; this.listen = null; this.quietUntil = 0;
    el.innerHTML = `<div class="ctl-panel">
      <div class="ctl-top">${TABS.map(([k, n]) => `<button type="button" class="ctl-tab t-${k}" data-tab="${k}">${n}</button>`).join('')}</div>
      <div class="ctl-main">
        <div class="ctl-rows" tabindex="-1"></div>
        <div class="ctl-stage"><div class="ctl-pic"></div><div class="ctl-call"><b></b><span></span><small></small></div><i class="ctl-scan"></i></div>
      </div>
      <div class="ctl-foot"><span class="ctl-msg"></span><button type="button" class="btn small" data-act="remap">Remap</button><button type="button" class="btn small" data-act="reset">Restore defaults</button><button type="button" class="btn small ghost" data-act="close">Back</button></div>
    </div>`;
    this.rows = el.querySelector('.ctl-rows'); this.pic = el.querySelector('.ctl-pic'); this.msg = el.querySelector('.ctl-msg');
    el.querySelectorAll('.ctl-tab').forEach((b) => (b.onclick = () => { this.sound(); this.stopListen(); this.setTab(b.dataset.tab); }));
    el.querySelector('[data-act=close]').onclick = () => { this.sound(); this.close(); };
    el.querySelector('[data-act=remap]').onclick = () => { this.sound(); this.startListen(); };
    el.querySelector('[data-act=reset]').onclick = (e) => {
      const b = e.currentTarget;
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Press again to restore'; setTimeout(() => { delete b.dataset.sure; b.textContent = 'Restore defaults'; }, 3000); return; }
      delete b.dataset.sure; b.textContent = 'Restore defaults';
      this.stopListen(); resetBinds(this.tab === 'kb' ? 'kb' : 'pad'); this.onChange(); this.render(); this.say('Default controls restored.');
    };
    // Scrolling the list picks whichever control sits in the middle; pointing or focusing one picks it too.
    this.rows.addEventListener('scroll', () => {
      if (performance.now() < this.quietUntil) return;
      const r = this.rows.getBoundingClientRect(), mid = r.top + r.height / 2;
      let best = null, bd = 1e9;
      this.rows.querySelectorAll('.ctl-row2').forEach((x) => { const b = x.getBoundingClientRect(), d = Math.abs(b.top + b.height / 2 - mid); if (d < bd) { bd = d; best = x; } });
      if (best) this.select(best.dataset.id, false);
    });
    this.rows.addEventListener('mousemove', (e) => { const x = e.target.closest('.ctl-row2'); if (x && x.dataset.id !== this.sel) this.select(x.dataset.id, false, true); });
    this.rows.addEventListener('padfocus', (e) => { const x = e.target.closest('.ctl-row2'); if (x) this.select(x.dataset.id, false, true); });
    this.rows.addEventListener('click', (e) => { const x = e.target.closest('.ctl-row2'); if (!x) return; if (x.dataset.id === this.sel && !this.listen && this.info().can) { this.sound(); this.startListen(); } else this.select(x.dataset.id, false, true); });
    this.onKey = (e) => {
      if (!this.el.classList.contains('on')) return;
      if (this.listen === 'kb') {
        e.preventDefault(); e.stopPropagation();
        if (e.code === 'Escape') { this.stopListen(); this.say('Remap cancelled.'); return; }
        const a = this.action(); bindKey(a.key, e.code); this.stopListen(); this.onChange(); this.render(); this.say(a.name + ' is now on ' + keyName(e.code) + '.');
        return;
      }
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); if (this.listen) { this.stopListen(); this.say('Remap cancelled.'); } else this.close(); }
    };
    window.addEventListener('keydown', this.onKey, true);
  }
  action() { return ACTIONS.find((a) => a.id === this.sel) || ACTIONS[0]; }
  info() { return actionInfo(this.action(), this.tab); }
  list() { return ACTIONS.filter((a) => this.tab === 'kb' || !a.kbOnly); }
  say(t) { this.msg.textContent = t; }

  open(tab) {
    this.el.classList.add('on');
    this.setTab(tab || this.tab);
    this.say('Scroll or point at a control to see where it is. Select it again or press Remap to change it.');
  }
  close() { this.stopListen(); this.el.classList.remove('on'); if (this.onClose) this.onClose(); }
  setTab(tab) {
    this.tab = tab;
    this.el.dataset.tab = tab;
    this.el.querySelectorAll('.ctl-tab').forEach((b) => b.classList.toggle('sel', b.dataset.tab === tab));
    this.pic.innerHTML = tab === 'kb' ? kbSvg() : padSvg(tab);
    this.pic.classList.remove('in'); void this.pic.offsetWidth; this.pic.classList.add('in');
    if (!this.list().some((a) => a.id === this.sel)) this.sel = 'move';
    this.render();
    this.rows.scrollTop = 0; this.select(this.list()[0].id, false, true);
  }
  render() {
    this.rows.innerHTML = this.list().map((a) => {
      const I = actionInfo(a, this.tab), name = this.tab !== 'kb' && a.padName ? a.padName : a.name;
      return `<div class="ctl-row2 pad-nav ${I.changed ? 'chg' : ''} ${I.can ? '' : 'fixed'}" data-id="${a.id}" tabindex="0"><div><b>${esc(name)}</b><small>${esc(a.hint)}</small></div><kbd>${esc(I.label)}</kbd></div>`;
    }).join('');
    this.select(this.sel, false, true);
  }
  select(id, scroll, quiet) {
    this.sel = id;
    if (quiet) this.quietUntil = performance.now() + 350;
    const a = this.action(), I = this.info(), name = this.tab !== 'kb' && a.padName ? a.padName : a.name;
    this.rows.querySelectorAll('.ctl-row2').forEach((x) => x.classList.toggle('sel', x.dataset.id === id));
    this.pic.querySelectorAll('.pc').forEach((p) => p.classList.toggle('lit', p.dataset.c.split(' ').some((c) => I.parts.includes(c))));
    const call = this.el.querySelector('.ctl-call');
    call.querySelector('b').textContent = I.label; call.querySelector('span').textContent = name;
    call.querySelector('small').textContent = I.changed ? 'Remapped' : I.can ? '' : 'Cannot be remapped';
    call.classList.remove('pop'); void call.offsetWidth; call.classList.add('pop');
    const rb = this.el.querySelector('[data-act=remap]'); rb.disabled = !I.can; rb.textContent = this.listen ? 'Waiting…' : 'Remap';
    if (scroll) { const x = this.rows.querySelector('.ctl-row2.sel'); if (x) x.scrollIntoView({ block: 'center' }); }
  }
  startListen() {
    const a = this.action(), I = this.info();
    if (!I.can) { this.say(a.name + ' cannot be remapped.'); return; }
    this.el.classList.add('listening');
    if (this.tab === 'kb') { this.listen = 'kb'; this.say('Press the new key for ' + a.name + '. Esc cancels.'); }
    else {
      this.listen = 'pad';
      const snap = () => [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter((p) => p && p.connected);
      if (!snap().length) this.say('Connect a controller, then press the new button for ' + a.name + '.'); else this.say('Press the new button for ' + a.name + '. Esc cancels.');
      let prev = null;
      const tick = () => {
        if (this.listen !== 'pad') return;
        const p = snap()[0];
        if (p) {
          const b = p.buttons.slice(0, 16).map((x) => x.pressed || x.value > 0.5);
          if (prev) { const i = b.findIndex((v, k) => v && !prev[k]); if (i >= 0) { bindPad(a.btn, i); this.stopListen(); this.onChange(); this.render(); this.say((a.padName || a.name) + ' is now on ' + PAD_NAMES[this.tab][i] + '.'); this.padHold = performance.now() + 400; return; } }
          prev = b;
        }
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    }
    this.select(this.sel, false, true);
  }
  stopListen() { this.listen = null; cancelAnimationFrame(this.raf); this.el.classList.remove('listening'); const rb = this.el.querySelector('[data-act=remap]'); if (rb) rb.textContent = 'Remap'; }
}
