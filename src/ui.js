// DOM UI: title, join, lobby (class + weapon wall), HUD, shop, vote,
// blessings, summary, settings. Game logic lives in game.js.
import { renderPShop, gemURL } from './metashop.js';
import { MUTATORS, muOn, BOTTOMLESS } from './mutators.js';
import { getMeta } from './meta.js';
import { Profile } from './profile.js';
import { DUEL_BIOMES, clipName } from './data.js';
import { CONFIG, CLASSES, CLASS_BY_ID, WEAPONS, WEAPON_BY_ID, NPCS, NPC_TYPES, BIOMES, BOSSES, DASH, DUEL, POWERUP_BY_ID, puInfo, TIER, splitLoadout, loadoutFull } from './data.js';
import { JET } from './jetpack.js';
import { WING } from './wings.js';
import { charUnlocked, LOCKED_CHARACTERS, gearUnlocked, GEAR_GOALS, EXTRA_GOALS, Unlocks } from './unlocks.js';
import { coinDataURL } from './textures.js';
import { setFocus, connectedPads, KEYPAD_HELP } from './pad.js';
import { CHARACTERS, CHAR_BY_ID } from './characters.js';
import { skinsOf, skinIsFree, skinUnlocked } from './skins.js';
import { Dailies, msToReset } from './dailies.js';
import { puIcon, hasPuIcon } from './puicons.js';
import { ControlsScreen, loadBinds, bindsJSON, kbPhys, padPhys, keyName, PAD_NAMES } from './controls.js';

// Every control the game ever names, as the button it is on each layout. Settings > Controller layout picks
// the column (DualShock by default); 'kp' is player 2's right-hand keyboard half in couch co-op.
const CLIP_MS = 3900; // length of one skill clip on the Element page
const CPU_LEVELS = ['Easy', 'Medium', 'Hard', 'Insane'];
const FLIP_LOBBY = document.documentElement.dataset.lobby === 'flip' || new URLSearchParams(location.search).get('lobby') === 'flip'; // flip-book select screen (test)

export const CTL = {
  ds: { move: 'L stick', look: 'R stick', jump: '✕', dash: '○', use: '□', reload: '□', next: '◀ ▶', ab1: 'L1', ab2: '△', ult: 'R1', aim: 'L2', block: 'L2', fire: 'R2', sprint: 'L3', camera: 'R3', bed: 'L2 + R3', shop: 'Share', pause: 'Options', prev: '◀', nxt: '▶', speed: '▼', takeover: '▲', cpu: '▲', up: 'L stick up', down: 'L stick down', side: 'L stick left / right', select: '✕', back: '○', fs: 'F11' },
  xbox: { move: 'L stick', look: 'R stick', jump: 'A', dash: 'B', use: 'X', reload: 'X', next: '◀ ▶', ab1: 'LB', ab2: 'Y', ult: 'RB', aim: 'LT', block: 'LT', fire: 'RT', sprint: 'L3', camera: 'R3', bed: 'LT + R3', shop: 'View', pause: 'Menu', prev: '◀', nxt: '▶', speed: '▼', takeover: '▲', cpu: '▲', up: 'L stick up', down: 'L stick down', side: 'L stick left / right', select: 'A', back: 'B', fs: 'F11' },
  kb: { move: 'W A S D', look: 'Mouse', jump: 'Space', dash: 'X', use: 'E', reload: 'R', next: 'Wheel', ab1: 'Q', ab2: 'G', ult: 'F', aim: 'Right click / C', block: 'Right click / C', fire: 'Left click', sprint: 'Shift', camera: 'V', bed: 'B', shop: 'Tab', pause: 'Esc', prev: '1', nxt: '2', speed: 'T', takeover: 'P', cpu: 'P', up: 'W', down: 'S', side: 'A D', select: 'Enter', back: 'Esc', fs: 'F11' },
  kp: { move: '↑ ↓', look: 'PgUp PgDn', jump: '/', dash: "'", use: ';', reload: ';', next: '9 0', ab1: '[', ab2: 'P', ult: ']', aim: 'Shift', block: 'Shift', fire: 'Enter', sprint: 'R Shift', camera: 'R3', bed: 'B', shop: '=', pause: 'Backspace', prev: '9', nxt: '0', speed: 'N', takeover: '\\', cpu: '\\', up: '↑', down: '↓', side: '← →', select: 'Enter', back: 'Backspace', fs: 'F11' },
};
const CTL0 = JSON.parse(JSON.stringify(CTL));
// Button prompts follow the player's remaps (Controls screen): rewrite the names in place from the defaults.
export function applyBindLabels() {
  for (const L of Object.keys(CTL0)) Object.assign(CTL[L], CTL0[L]);
  const k = CTL.kb, K = (c) => keyName(kbPhys(c));
  Object.assign(k, { jump: K('Space'), dash: K('KeyX'), use: K('KeyE'), reload: K('KeyR'), ab1: K('KeyQ'), ab2: K('KeyG'), ult: K('KeyF'), aim: 'Right click / ' + K('KeyC'), block: 'Right click / ' + K('KeyC'), sprint: K('ShiftLeft'), camera: K('KeyV'), bed: K('KeyB'), shop: K('Tab'), prev: K('Digit1'), nxt: K('Digit2'), speed: K('KeyT'), takeover: K('KeyP'), cpu: K('KeyP') });
  for (const L of ['ds', 'xbox']) {
    const N = PAD_NAMES[L], B = (i) => N[padPhys(i)], c = CTL[L];
    Object.assign(c, { jump: B(0), dash: B(1), use: B(2), reload: B(2), ab2: B(3), ab1: B(4), ult: B(5), aim: B(6), block: B(6), fire: B(7), shop: B(8), pause: B(9), sprint: B(10), camera: B(11), cpu: B(12), takeover: B(12), speed: B(13), prev: B(14), nxt: B(15), next: B(14) + ' ' + B(15), bed: B(6) + ' + ' + B(11) });
  }
}
const isPad = (L) => L === 'ds' || L === 'xbox';
const ctlOf = (L) => CTL[L] || CTL.ds;
// The full "how to play" controls list for one layout.
export function helpRows(L) {
  const c = ctlOf(L), pad = isPad(L);
  return [
    [c.move, 'Move'], [c.look, 'Aim'], [c.fire, 'Attack'], [c.sprint, pad ? 'Sprint (press the stick)' : 'Sprint'], [c.jump, 'Jump · with the Jetpack equipped: double-tap to fly · with Web Swing equipped: press again in the air and hold'], [c.dash, 'Dash'],
    [c.ab1 + ' · ' + c.ab2, 'Element abilities'], [c.ult, 'Ultimate'], [c.aim, 'Aim down sights, or block with a shield'],
    pad ? [c.prev + ' ' + c.nxt, 'Swap weapon'] : ['1 2 3 / ' + c.next, 'Swap weapon'], [c.reload, 'Reload'], [c.use, 'Open crate · ride the skateboard · use the altar (hold)'], [c.bed, 'Place bed'],
    [c.shop, 'Shop'], [c.camera, 'First / third person'], [c.speed, 'Game speed (solo and couch)'], ...([[c.cpu, 'CPU Run: hand the run to the CPU, and the same again to take it back']]), [c.pause, 'Menu'],
  ];
}
// What each keyboard key is called on the other devices (HUD badges and the class card).
const KEY_HINTS = { pad: { X: 'B', Q: 'LB', G: 'Y', F: 'RB', R: 'X', E: 'X', 1: '◀', 2: '▶', 3: '▶' }, ds: { X: '○', Q: 'L1', G: '△', F: 'R1', R: '□', E: '□', 1: '◀', 2: '▶', 3: '▶' }, kb: { X: "'", Q: '[', G: 'P', F: ']', R: ';', E: ';', 1: '9', 2: '0', 3: '0' } };
// Xbox button names as PlayStation ones, for the DualShock layout.
const DS_NAMES = { A: '✕', B: '○', X: '□', Y: '△', LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', View: 'Share', Menu: 'Options', L3: 'L3', R3: 'R3' };
export const padName = (s, layout) => layout === 'ds' ? String(s).split(' ').map((w) => DS_NAMES[w] || w).join(' ') : s;
// Compact "what do the buttons do" lists for the couch seats (player 2's keyboard half comes from pad.js).
const shortRows = (L) => { const c = CTL[L] || CTL.ds, pad = isPad(L); return [[c.move, 'Move'], [c.look, 'Aim'], [c.fire, 'Attack · hold ' + c.aim + ' to aim or block'], [c.jump, 'Jump · double-tap: jetpack · again in the air and hold: web swing'], [c.sprint, 'Sprint · with the jetpack on: descend'], [c.dash, 'Dash'], [c.ab1 + ' ' + c.ab2 + ' ' + c.ult, 'Abilities'], [c.reload, 'Reload / use'], [pad ? c.prev + ' ' + c.nxt : '1 2 3', 'Swap weapon'], [c.shop, 'Shop'], [c.pause, 'Menu']]; };
export function controlsHtml(kind, layout = 'ds') {
  // kind: 'kb' = player 2's keyboard half, 'pad' = a controller (in the chosen layout's names), 'p1' = whatever Settings says.
  const rows = kind === 'kb' ? KEYPAD_HELP : kind === 'kbm' ? shortRows('kb') : shortRows(kind === 'pad' && !isPad(layout) ? 'ds' : layout);
  return rows.map(([k, v]) => `<li><kbd>${esc(k)}</kbd> ${esc(v)}</li>`).join('');
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

export const ICONS = {
  Fire: '<svg viewBox="0 0 24 24"><path d="M12 2c1 4-3 5-3 9a3 3 0 0 0 6 0c0-1.5-.8-2.6-1-4 2.5 1.5 4 4.2 4 7a6 6 0 0 1-12 0c0-5 5-7 6-12z"/></svg>',
  Earth: '<svg viewBox="0 0 24 24"><path d="M3.5 18.5l1.2-6.2 3.8-5 6-1.3 4.6 3.6 1.4 6.4-2.6 3.5H6.2z"/><path d="M9 8.5l2.2 4.3-1.4 3.4M11.2 12.8l4.4-1.6M15.6 11.2l1.8 3.6" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  Storm: '<svg viewBox="0 0 24 24"><path fill="#9cc0ff" d="M13 2L4 14h6l-2 8 10-13h-6z"/></svg>',
  Frost: '<svg viewBox="0 0 24 24"><path d="M11 2h2v20h-2zM2 11h20v2H2zM4.2 5.6l1.4-1.4 14.2 14.2-1.4 1.4zM18.4 4.2l1.4 1.4L5.6 19.8l-1.4-1.4z"/></svg>',
  Death: '<svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M12 2C7.3 2 4 5.4 4 9.8c0 2.3.9 4 2.3 5.2.5.4.7.9.7 1.5V18c0 .6.4 1 1 1h.6v1.6c0 .5.4.9.9.9h.9v-1.6h1v1.6h1.2v-1.6h1v1.6h.9c.5 0 .9-.4.9-.9V19h.6c.6 0 1-.4 1-1v-1.5c0-.6.2-1.1.7-1.500C19.100 13.800 20 12.100 20 9.800 20 5.400 16.700 2 12 2zM8.600 8.400c1.400 0 2.400 1 2.400 2.300s-1.100 2.300-2.500 2.300S6.200 12 6.200 10.600 7.200 8.400 8.600 8.400zm6.800 0c1.400 0 2.400.9 2.400 2.200S16.800 13 15.500 13 13 12 13 10.700s1-2.300 2.400-2.300zM12 13.300l1.300 2.700h-2.600z"/></svg>',
  Wind: '<svg viewBox="0 0 24 24"><path d="M3 8h11a3 3 0 1 0-3-3h-2a5 5 0 1 1 5 5H3zM3 13h15a3 3 0 1 1-3 3h2a1 1 0 1 0 1-1H3zM3 18h7v2H3z"/></svg>',
};

// One glyph per ability so Q and F never look the same.
export const AB_ICONS = {
  fireball: '<svg viewBox="0 0 24 24"><circle cx="15" cy="9" r="5"/><path d="M11 12L3 21M12.5 14.5L6 21M9 10.5L3 16" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".75"/></svg>',
  inferno: '<svg viewBox="0 0 24 24"><path d="M12 3c.8 3-2 4-2 7a2 2 0 0 0 4 0c0-1-.5-2-.7-3 1.8 1 2.7 3 2.7 5a4 4 0 0 1-8 0c0-4 3-5 4-9z"/><ellipse cx="12" cy="19" rx="10" ry="3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  boulder: '<svg viewBox="0 0 24 24"><path d="M14 4l5 2 3 5-2 5-5 2-4-3-1-5 4-6z"/><path d="M8 13L2 20M6 10L2 13" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".7"/></svg>',
  rockarmor: '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/><path d="M12 6v12M7 10h10" stroke="#0007" stroke-width="1.4"/></svg>',
  chain: '<svg viewBox="0 0 24 24"><path d="M3 4l6 6-3 1 7 4-2 1 9 5" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><circle cx="9" cy="10" r="2"/><circle cx="13" cy="15" r="2"/><circle cx="21" cy="20" r="2"/></svg>',
  storm: '<svg viewBox="0 0 24 24"><path d="M6 11a4 4 0 0 1 1-7.9A5 5 0 0 1 17 4a3.5 3.5 0 0 1 1 7z"/><path d="M9 13l-2 4h3l-1 4 4-6h-3l1-2zM16 13l-1 3h2l-1 3" /></svg>',
  shards: '<svg viewBox="0 0 24 24"><path d="M12 2l1.5 5-1.5 5-1.5-5zM4 7l4 3-1 4-3-2zM20 7l-4 3 1 4 3-2zM12 14l1.5 4-1.5 4-1.5-4zM5 17l3-2 2 3-3 2zM19 17l-3-2-2 3 3 2z"/></svg>',
  // the Elemental Vault
  minisun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M12 1l1.2 4h-2.4zM12 23l-1.2-4h2.4zM1 12l4-1.2v2.4zM23 12l-4 1.2v-2.4zM4.2 4.2l3.7 2-1.7 1.7zM19.8 19.8l-3.7-2 1.7-1.7zM19.8 4.2l-2 3.7-1.7-1.7zM4.2 19.8l2-3.7 1.7 1.7z"/></svg>',
  flameweap: '<svg viewBox="0 0 24 24"><path d="M5 21l2-2 8.5-8.5 2 2L9 21zM17 3c2.5 2.6 3.6 5 1.2 7.4a2.6 2.6 0 0 1-4-.4c-.9-1.4-.3-2.7.8-3.8C16 5.200 17 4.400 17 3zM9 4c1.500 1.600 2.200 3 .8 4.500A1.700 1.700 0 0 1 7 8c-.5-1.500 2-2.200 2-4z"/></svg>',
  sunlance: '<svg viewBox="0 0 24 24"><path d="M9 1h6l-1 15h-4zM4 19c2.500-2 5-3 8-3s5.500 1 8 3c-2.500 2-5 3-8 3s-5.500-1-8-3zM3 4l3 5H4zM21 4l-3 5h2z"/></svg>',
  golem: '<svg viewBox="0 0 24 24"><path d="M9 3h6l1 3h4l2 5-2 1v6l-3 1v3h-4v-5h-2v5H7v-3l-3-1v-6l-2-1 2-5h4z"/></svg>',
  dragon: '<svg viewBox="0 0 24 24"><path d="M2 9c3-4 7-5 10-2 3-3 7-2 10 2-3-1-5 0-6 2 2 1 3 3 2 6l-3-3-3 6-3-6-3 3c-1-3 0-5 2-6-1-2-3-3-6-2z"/></svg>',
  airshot: '<svg viewBox="0 0 24 24"><path d="M14 4a8 8 0 1 1-7.400 11h2.200A6 6 0 1 0 14 6a4 4 0 0 0-4 4h-2a6 6 0 0 1 6-6zM2 9h9v2H2zM4 13h8v2H4zM14 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg>',
  seekers: '<svg viewBox="0 0 24 24"><path d="M6 3c2 2 3 4 1 6a2.5 2.5 0 1 1-3-2c1-1 2-2 2-4zM18 3c2 2 3 4 1 6a2.5 2.5 0 1 1-3-2c1-1 2-2 2-4zM12 11c2.5 2.5 4 5 1.5 7.5a3 3 0 1 1-4-2.5c1.2-1.2 2.5-2.5 2.5-5z"/></svg>',
  orbit: '<svg viewBox="0 0 24 24"><path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 1l2.5 2-1 2.5h-3L9.5 3zM3 15l3-.5L7.5 17l-2 2L3 18zM21 15l-3-.5-1.5 2.5 2 2 2.5-1z"/></svg>',
  meteor: '<svg viewBox="0 0 24 24"><path d="M22 2l-7 3 2 1-5 2 2 1-4 2a5.5 5.500 0 1 0 5 5l2-4 1 2 2-5 1 2z"/></svg>',
  stomp: '<svg viewBox="0 0 24 24"><path d="M9 2h6v9l3 1v3H6v-3l3-1zM2 20l4-3 3 3 3-3 3 3 3-3 4 3v2H2z"/></svg>',
  rain: '<svg viewBox="0 0 24 24"><path d="M7 12a4 4 0 0 1 .5-8 5 5 0 0 1 9.500 1A3.500 3.500 0 0 1 17 12zM8 14l-1.500 4h3zM12 15l-1.500 5h3zM16 14l-1.500 4h3z"/></svg>',
  zero: '<svg viewBox="0 0 24 24"><path d="M11 2h2v20h-2zM2 11h20v2H2zM4.200 5.600l1.400-1.400 14.200 14.200-1.400 1.400zM18.400 4.200l1.400 1.400L5.600 19.800l-1.400-1.400z"/></svg>',
  cloud: '<svg viewBox="0 0 24 24"><path d="M6 18a4.500 4.500 0 0 1 .5-9 6 6 0 0 1 11.500 1.500A3.800 3.800 0 0 1 18 18z"/></svg>',
  breath: '<svg viewBox="0 0 24 24"><path d="M2 9l5-3 3 1 2-2 1 3-2 2 1 2-4 1-2 3-1-4zM13 11l9-4-3 5 3 5-9-4z"/></svg>',
  whirl: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8zM12 6a6 6 0 1 0 6 6h-2a4 4 0 1 1-4-4zM12 10a2 2 0 1 0 2 2 2 2 0 0 0-2-2z"/></svg>',
  jet: '<svg viewBox="0 0 24 24"><path d="M2 11h15v2H2zM17 8l5 4-5 4zM4 6h6v2H4zM4 16h6v2H4z"/></svg>',
  snowball: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9zM8 9a1.5 1.5 0 1 1 1.500 1.500A1.500 1.500 0 0 1 8 9zM14 14a1.500 1.500 0 1 1 1.500 1.500A1.500 1.500 0 0 1 14 14zM2 21h20v1H2z"/></svg>',
  fence: '<svg viewBox="0 0 24 24"><path d="M3 3h3v18H3zM18 3h3v18h-3zM6 7l3 1 3-2 3 2 3-1v2l-3 1-3-2-3 2-3-1zM6 14l3 1 3-2 3 2 3-1v2l-3 1-3-2-3 2-3-1z"/></svg>',
  lifedrain: '<svg viewBox="0 0 24 24"><path d="M12 2c3 4.500 6 7.800 6 11.500a6 6 0 0 1-12 0C6 9.800 9 6.500 12 2zM9 13.500a3 3 0 0 0 3 3v-1.500a1.500 1.500 0 0 1-1.500-1.500z"/></svg>',
  acid: '<svg viewBox="0 0 24 24"><path d="M2 17c2-3 5-4 10-4s8 1 10 4c-2 2.500-5 4-10 4s-8-1.500-10-4zM8 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM14.500 7a1.500 1.500 0 1 1 0 3 1.500 1.500 0 0 1 0-3zM11 9.500a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/></svg>',
  raise: '<svg viewBox="0 0 24 24"><path d="M3 21h18v-2H3zM10 18v-7l-2 1.500-1-1.400L10 8.500V5.500l-1.500 1-1-1.500L10 3h2l.5 5 3-2 1 1.500-3.500 3V18z"/></svg>',
  vines: '<svg viewBox="0 0 24 24"><path d="M11 22c0-5-4-6-4-11 0-3 2-5 2-8h2c0 3-2 5-2 8 0 4 4 5 4 11zM9 12l-4-2 1 3zM12 16l5-2-1 4zM10 7l4-3v4zM17 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/></svg>',
  scythe: '<svg viewBox="0 0 24 24"><path d="M5 22L15 4l1.700 1L6.700 23zM13 3c5-1 8 2 9 7-3-3-6-4-9-3z"/></svg>',
  ghostwalk: '<svg viewBox="0 0 24 24"><path d="M12 2a6 6 0 0 0-6 6v13l2.500-2 1.700 2 1.800-2 1.800 2 1.700-2 2.500 2V8a6 6 0 0 0-6-6zM9.500 8a1.300 1.300 0 1 1 0 2.600A1.300 1.300 0 0 1 9.500 8zm5 0a1.300 1.300 0 1 1 0 2.600 1.300 1.300 0 0 1 0-2.600z"/></svg>',
  crows: '<svg viewBox="0 0 24 24"><path d="M2 9c3 0 5 1 7 3 1-3 4-5 8-5l5 1-4 2c0 5-3 9-8 9H6l2-3c-3-1-5-4-6-7zM16 9.500a.8.800 0 1 0 0 1.600.8.800 0 0 0 0-1.600z"/></svg>',
  supper: '<svg viewBox="0 0 24 24"><path d="M6 3h12v5a6 6 0 0 1-5 5.900V19h4v2H7v-2h4v-5.100A6 6 0 0 1 6 8zM8 5v3a4 4 0 0 0 8 0V5z"/></svg>',
  finger: '<svg viewBox="0 0 24 24"><path d="M10 2h3v9l5 1.500c1 .3 1.700 1.200 1.700 2.300V22H9l-4-7 1.500-1.500L10 15z"/></svg>',
  blink: '<svg viewBox="0 0 24 24"><path d="M13 1L5 13h5l-2 10 9-13h-5zM1 5h4v2H1zM1 10h3v2H1zM19 14h4v2h-4zM20 19h3v2h-3z"/></svg>',
  tornado: '<svg viewBox="0 0 24 24"><path d="M3 4h18v2H3zM5 8h14v2H5zM8 12h10v2H8zM10 16h6v2h-6zM12 20h3v2h-3z"/></svg>',
  barrier: '<svg viewBox="0 0 24 24"><path d="M2 21l2-10 2 4 2-12 2 9 2-6 2 11 2-8 2 5 2-7 2 14z"/><path d="M2 21h20" stroke="currentColor" stroke-width="1.6"/></svg>',
  veil: '<svg viewBox="0 0 24 24"><path d="M2 7c5-3 9 3 14 0s5 0 6-1M2 12c5-3 9 3 14 0s5 0 6-1M2 17c5-3 9 3 14 0s5 0 6-1" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  dash: '<svg viewBox="0 0 24 24"><path d="M3 7h9M2 12h12M5 17h9" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M14 5l8 7-8 7z"/></svg>',
  firewall: '<svg viewBox="0 0 24 24"><path d="M5 20c0-3 1.5-4.2 2.2-6.2.5 1.6 1.8 2.1 1.8 3.6A2 2 0 0 0 13 17c0-1.5-.8-2.3-1.2-3.6C13.6 14.6 15 16 15 18.4A4.8 4.8 0 0 1 10.2 23 4.8 4.8 0 0 1 5 18.4zM14.5 18.6c0-2 1-2.7 1.5-4.1.3 1 1.2 1.4 1.2 2.4a1.3 1.3 0 0 0 2.6 0c0-1-.5-1.6-.8-2.4 1.3.8 2.4 1.8 2.4 3.4a3.2 3.2 0 0 1-6.4.7z"/><path d="M2 22.5h20" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  meteor: '<svg viewBox="0 0 24 24"><circle cx="17" cy="17" r="4.5"/><path d="M13 13L3 3M10 14L2 8M14 10L8 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>',
  pillars: '<svg viewBox="0 0 24 24"><path d="M3 21V11l2-3 2 3v10zM10 21V6l2-3 2 3v15zM17 21v-8l2-3 2 3v8z"/><path d="M1 22h22" stroke="currentColor" stroke-width="1.6"/></svg>',
  shockwave: '<svg viewBox="0 0 24 24"><path d="M13 4L8 11h4l-2 6 6-8h-4z"/><path d="M3 19c4-2 14-2 18 0M1 22c6-3 16-3 22 0" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/></svg>',
  tsunami: '<svg viewBox="0 0 24 24"><path d="M2 20c3-1 4-9 9-9 4 0 6 3 7 3-1-3-3-5-6-5-3 0-4 2-5 2 1-4 5-7 10-6-6-2-11 2-12 8-.4 2 0 5-3 7z"/><path d="M2 22c3 0 4-1.5 6-1.5s3 1.5 6 1.5 4-1.5 8-1.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="10" ry="9" stroke="currentColor" stroke-width="1.8" fill="none" opacity=".6"/><path d="M12 4c5 0 8 3 8 7M12 20c-5 0-8-3-8-7M17 12a5 5 0 0 0-8-4M7 12a5 5 0 0 0 8 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="12" cy="12" r="1.8"/></svg>',
  cyclone: '<svg viewBox="0 0 24 24"><path d="M3 5h18M5 9h14M7 13h10M9 17h6M11 21h2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
};

export class UI {
  constructor(game) {
    this.game = game;
    this.root = game.root || document.body;
    this.coin = coinDataURL();
    this.$$('.coin-img').forEach((i) => (i.src = this.coin));
    this.hudEls = {};
    this.lastHud = 0;
    this.bindTitle();
    this.bindCouch();
    this.bindSettings();
    this.bindGame();
    this.showTitle();
  }

  $(s, r = this.root) { return r.querySelector(s); }
  $$(s, r = this.root) { return [...r.querySelectorAll(s)]; }
  // HUD writes that skip the DOM when nothing changed (a rewrite, even of the same value, makes the browser restyle).
  $k(s) { const c = (this._ec ||= new Map()); let e = c.get(s); if (!e || !e.isConnected) { e = this.$(s); c.set(s, e); } return e; }
  setT(e, v) { if (typeof e === 'string') e = this.$k(e); v = String(v); if (e && e.textContent !== v) e.textContent = v; }
  setW(e, f) { if (typeof e === 'string') e = this.$k(e); const v = (Math.round(f * 1000) / 10) + '%'; if (e && e.style.width !== v) e.style.width = v; }
  setH(e, v) { if (typeof e === 'string') e = this.$k(e); if (e && e._h !== v) { e._h = v; e.innerHTML = v; } }
  setC(e, cls, on) { if (typeof e === 'string') e = this.$k(e); on = !!on; if (e && e.classList.contains(cls) !== on) e.classList.toggle(cls, on); }

  // Duel Arena stage cards (Stage Select). withRandom adds a "Random" card (index -1).
  stageCards(withRandom) {
    const card = (i, name, cls) => `<button type="button" class="ds-card${cls || ''}" data-i="${i}"><span class="ds-img"${i >= 0 ? ` style="background-image:url(assets/arenas/${i}.webp)"` : ''}>${i < 0 ? '<em>?</em>' : ''}</span><b>${esc(name)}</b><span class="ds-picks"></span></button>`;
    return DUEL_BIOMES.map((b, i) => card(i, b.name)).join('') + (withRandom ? card(-1, 'Random', ' ds-rand') : '');
  }
  // Two-player stage vote: both players tap a stage (blue tick with their name). Different picks: a spinner flips
  // between the two names and lands on one.
  duelVoteUI() {
    const g = this.game, root = this.$('#s-lobby');
    const host = g.party && g.hostPeer(g.party.peers()), dv = host && host.p.dv;
    let o = this._dvEl;
    if (!dv) { if (o && o.classList.contains('on')) { o.classList.remove('on'); clearTimeout(this._dvT); this._dvSpin = null; } return; }
    if (!o) {
      o = document.createElement('div');
      o.className = 'ds-vote pad-modal';
      o.innerHTML = `<div class="ds-box"><h2>Stage Select</h2><p class="ds-sub"></p><div class="ds-cards">${this.stageCards(false)}</div><div class="ds-spin"></div></div>`;
      root.appendChild(o);
      o.querySelector('.ds-cards').onclick = (e) => { const b = e.target.closest('.ds-card'); if (!b || b.disabled) return; g.audio.play('ui'); g.duelPick(+b.dataset.i); this.renderLobby(); };
      this._dvEl = o;
    }
    const first = !o.classList.contains('on');
    o.classList.add('on');
    const ms = g.lobbyMembers(), local = g.party.kind === 'local';
    const nm = (m) => (local ? 'PLAYER ' + (m.id === 'p2' ? 2 : 1) : m.p.n || 'Player');
    const cards = [...o.querySelectorAll('.ds-card')], sub = o.querySelector('.ds-sub'), spin = o.querySelector('.ds-spin');
    const pickOf = (m) => (m.p.dsi === dv.id && m.p.ds >= 0 ? m.p.ds | 0 : -1);
    const paint = () => cards.forEach((c) => {
      const i = +c.dataset.i, who = ms.filter((m) => pickOf(m) === i);
      c.classList.toggle('picked', who.length > 0); c.classList.toggle('mine', who.some((m) => m.me));
      const h = who.map((m) => `<span class="${m.me ? 'me' : ''}"><i>✓</i>${esc(nm(m))}</span>`).join('');
      const pk = c.querySelector('.ds-picks'); if (pk.innerHTML !== h) pk.innerHTML = h;
    });
    if (!dv.r) {
      if (this._dvSpin) { this._dvSpin = null; clearTimeout(this._dvT); }
      cards.forEach((c) => { c.classList.remove('spin-on', 'landed', 'lost'); c.disabled = false; });
      paint();
      const mine = ms.find((m) => m.me), other = ms.find((m) => !m.me);
      sub.textContent = mine && pickOf(mine) >= 0 ? (other && pickOf(other) >= 0 ? '' : 'Waiting for ' + (other ? nm(other) : 'the other player') + ' to pick. You can still change yours.') : 'Both players pick a stage. Same pick goes straight in. Different picks spin for it.';
      spin.innerHTML = ''; spin.className = 'ds-spin';
      if (first && g.pad && g.pad.active) setFocus(this.root, cards[0]);
      return;
    }
    if (this._dvSpin === dv.id) return;
    this._dvSpin = dv.id;
    paint();
    cards.forEach((c) => (c.disabled = true));
    const land = cards.find((c) => +c.dataset.i === dv.r.i), stage = DUEL_BIOMES[dv.r.i] ? DUEL_BIOMES[dv.r.i].name : '';
    const done = (txt) => { cards.forEach((c) => { c.classList.remove('spin-on'); c.classList.toggle('lost', c !== land); }); if (land) land.classList.add('landed'); spin.className = 'ds-spin done'; spin.innerHTML = txt; sub.textContent = ''; g.audio.play('ready'); };
    if (dv.r.same || ms.length < 2) { done('<b>' + esc(stage) + '</b><span>Both picked it</span>'); return; }
    const win = ms.find((m) => m.id === dv.r.w) || ms[0], lose = ms.find((m) => m !== win) || ms[1];
    sub.textContent = 'Different picks. Spinning for it…';
    spin.className = 'ds-spin go';
    // The light sweeps the stages left to right, slows down, and stops on the winning pick.
    const li = Math.max(0, cards.indexOf(land)), N = cards.length * 4 + li + 1; let k = 0, delay = 80;
    const flip = () => {
      cards.forEach((c) => c.classList.remove('spin-on'));
      const c = cards[k % cards.length]; c.classList.add('spin-on');
      spin.innerHTML = '<i class="ds-wheel"></i><b>' + esc(c.querySelector('b').textContent) + '</b>';
      g.audio.play('ui', 0.5);
      if (++k >= N) { this._dvT = setTimeout(() => done('<b>' + esc(stage) + '</b><span>' + esc(nm(win)) + '\'s pick</span>'), 500); return; }
      delay *= 1.16; this._dvT = setTimeout(flip, delay);
    };
    flip();
  }
  // Main menu: Daily Challenges shows how many of today's three are done.
  dailyTitle() { const el = this.$('#title-daily'); if (el) { try { el.textContent = Dailies.today().filter((d) => d.done).length + '/3'; } catch {} } }
  screen(id) {
    if (id === 's-title') this.dailyTitle();
    // Menus and lobbies never show the run's "You are out" / "You died" overlay.
    const dead = this.$('#dead'); if (dead && id) dead.classList.remove('on');
    if (id !== 's-couch') this.couchStop();
    if (id !== 's-settings' && this.game.draft) { if (this.game.draftDirty) this.revertDraft(); this.game.draft = false; this.game.draftDirty = false; } // Settings closed some other way
    this.$$('.screen').forEach((s) => s.classList.toggle('on', s.id === id));
    this.root.dataset.screen = id || '';
    if (id === 's-title' && this.ringPlace) requestAnimationFrame(this.ringPlace);
    requestAnimationFrame(() => this.fitScreen());
  }

  // Shrink the open menu screen until it fits (fullscreen on a laptop at 125% scaling is only ~864 px tall).
  fitScreen() {
    const s = this.root && this.root.querySelector('.screen.on');
    if (!s) return;
    const kids = [...s.children];
    kids.forEach((k) => (k.style.zoom = ''));
    if (s.classList.contains('arc-on')) return; // the arcade select scales itself to the screen
    // Content that is taller than the screen also hides above the top when centred, so measure the real edges.
    const over = () => {
      const r = s.getBoundingClientRect();
      let top = 0, bot = s.clientHeight, right = s.clientWidth;
      s.querySelectorAll('*').forEach((e) => { const sc = e.closest('.scrolls'); if (sc && sc !== e) return; if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') return; const b = e.getBoundingClientRect(); if (!b.height) return; top = Math.min(top, b.top - r.top); bot = Math.max(bot, b.bottom - r.top); right = Math.max(right, b.right - r.left); });
      return Math.min(s.clientHeight / (bot - top), s.clientWidth / right);
    };
    let z = 1;
    for (let i = 0; i < 4; i++) {
      const f = over();
      if (f >= 0.995) break;
      z = Math.max(0.55, z * f * 0.98);
      kids.forEach((k) => (k.style.zoom = z.toFixed(3)));
    }
    if (s.id === 's-title' && this.ringPlace) this.ringPlace();
  }

  // The fiery ring beside the game mode you are on: it follows the mouse, keyboard focus and the controller.
  wireFireRing() {
    const ring = this.$('#fire-ring');
    if (!ring) return;
    const menu = ring.parentElement;
    const place = (el) => { if (!el || !menu.contains(el)) return; ring.style.top = (el.offsetTop + el.offsetHeight / 2) + 'px'; ring.classList.add('on'); };
    const btnOf = (e) => e.target && e.target.closest ? e.target.closest('.menu > .btn') : null;
    menu.addEventListener('mouseover', (e) => place(btnOf(e)));
    menu.addEventListener('focusin', (e) => place(btnOf(e)));
    this.root.addEventListener('padfocus', (e) => place(btnOf(e)));
    this.ringPlace = () => place(menu.querySelector('.menu > .btn.pad-focus') || menu.querySelector('.menu > .btn:hover') || this.$('#btn-solo'));
    // Window fit: when the game is not full screen every menu, pop-up and the HUD shrink together so nothing overlaps.
    if (!window.__fitBound) {
      window.__fitBound = true;
      const fit = () => { const k = Math.max(0.42, Math.min(1, innerWidth / 1500, innerHeight / 860)); document.documentElement.style.setProperty('--fit', k.toFixed(4)); document.documentElement.classList.toggle('fit-small', k < 0.999); };
      fit(); window.addEventListener('resize', fit); document.addEventListener('fullscreenchange', fit);
    }
    window.addEventListener('resize', () => { if (this.root.dataset.screen === 's-title') this.ringPlace(); });
    requestAnimationFrame(this.ringPlace);
  }

  // ---------------- title ----------------
  bindTitle() {
    const g = this.game;
    const name = this.$('#name');
    name.value = g.settings.name;
    // Signed-in profiles play under their own name; Guest can type any name.
    const chip = this.$('#profile-chip');
    if (chip) {
      const P = Profile.cur;
      chip.style.display = g.seat === 1 ? '' : 'none';
      chip.innerHTML = `<span>${P.kind === 'guest' ? 'Playing as <b>Guest</b> · progress is not saved' : 'Signed in as <b>' + esc(P.name) + '</b>' + (P.kind === 'admin' ? ' <em>ADMIN</em>' : '')}</span><button class="link" id="profile-switch">${P.kind === 'guest' ? 'Sign in' : 'Switch profile'}</button>`;
      this.$('#profile-switch').onclick = () => { g.audio.play('ui'); Profile.signOut(); setTimeout(() => location.reload(), 150); };
    }
    name.readOnly = g.seat === 1 && !!Profile.playName();
    name.addEventListener('change', () => { g.settings.name = name.value.trim().slice(0, 16) || g.settings.name; name.value = g.settings.name; g.saveSettings(); });
    this.$('#btn-couch').style.display = g.seat === 1 ? '' : 'none';
    this.$('#btn-couch').onclick = () => { g.audio.unlock(); g.audio.play('ui'); g.duelMode = false; g.startLocal(); };
    this.$('#btn-duel').style.display = g.seat === 1 ? '' : 'none';
    this.$('#btn-duel').onclick = () => { g.audio.unlock(); g.audio.play('ui'); this.screen('s-duel'); };
    this.$('#duel-cpu').onclick = () => { // versus the CPU: pick the stage first, then the fighters
      g.audio.unlock(); g.audio.play('ui');
      const box = this.$('#ds-cpu');
      box.innerHTML = this.stageCards(true);
      box.onclick = (e) => { const b = e.target.closest('.ds-card'); if (!b) return; g.audio.play('ui'); g.duelStage = +b.dataset.i; g.playDuelBot(); };
      this.screen('s-dstage');
    };
    this.$('#duel-couch').onclick = () => { g.audio.unlock(); g.audio.play('ui'); g.duelMode = true; g.startLocal(); };
    this.$('#duel-online').onclick = () => { g.audio.unlock(); g.audio.play('ui'); this.screen('s-donline'); };
    this.$('#do-host').onclick = async () => { // a duel for a friend: they join with the code
      g.audio.play('ui');
      this.busy('Opening your duel…');
      try { g.duelMode = true; await g.createParty(false); } catch (e) { g.duelMode = false; this.screen('s-donline'); this.toast(e.message || 'Could not open a duel', 'bad'); }
      this.busy(null);
    };
    this.$('#do-quick').onclick = async () => {
      g.audio.play('ui');
      this.busy('Finding an opponent…');
      try {
        const r = await g.quickplay(true);
        if (r === 'created') this.toast('Nobody is waiting right now, so you are hosting an open duel. The next Quick Play fighter lands here.', 'good');
      } catch (e) { g.duelMode = false; this.screen('s-donline'); this.toast(e.message || 'Quick Play could not connect', 'bad'); }
      this.busy(null);
    };
    const digits = (el) => el.addEventListener('input', () => { const v = el.value.replace(/\D/g, '').slice(0, 5); if (v !== el.value) el.value = v; });
    digits(this.$('#do-code')); digits(this.$('#join-code'));
    this.$('#do-go').onclick = () => this.join(this.$('#do-code').value, 's-donline');
    this.$('#do-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.join(this.$('#do-code').value, 's-donline'); });
    this.wireFireRing();
    this.$('#btn-solo').onclick = () => { g.audio.unlock(); g.audio.play('ui'); g.duelMode = false; this.screen('s-play'); };
    // Host a Run = an open game Quickplay can fill. Private Game = yours alone until you hand out the code.
    // With no connection either one still starts, as a plain solo run.
    const create = async (pub) => {
      g.audio.play('ui'); g.duelMode = false;
      this.busy(pub ? 'Opening your run…' : 'Setting up your game…');
      try { await g.createParty(pub); } catch (e) { g.playSolo(); if (pub) this.toast('Could not get online, so this is a solo run.', 'bad'); }
      this.busy(null);
    };
    this.$('#play-host').onclick = () => create(true);
    this.$('#play-private').onclick = () => create(false);
    this.$('#join-quick').onclick = async () => {
      g.audio.unlock(); g.audio.play('ui');
      this.busy('Finding an open game…');
      try {
        const r = await g.quickplay();
        if (r === 'created') this.toast('No open games right now, so you are hosting a public one. Players who Quickplay will land here.', 'good');
      } catch (e) { this.screen('s-join'); this.toast(e.message || 'Quickplay could not connect', 'bad'); }
      this.busy(null);
    };
    this.$('#btn-join').onclick = () => {
      g.audio.unlock(); g.audio.play('ui'); this.screen('s-join');
    };
    this.$('#btn-pshop').onclick = () => { g.audio.unlock(); g.audio.play('ui'); this.screen('s-pshop'); renderPShop(this); };
    this.$('#btn-unlocks').onclick = () => { g.audio.play('ui'); this.screen('s-unlocks'); this.renderUnlocks(); };
    this.$('#btn-daily').onclick = () => { g.audio.play('ui'); this.screen('s-daily'); this.renderDaily(); };
    if (g.seat === 1 && !g.isBot) Dailies.onDone = (d, pp) => { this.toast('Daily Challenge done: ' + d.text + ' · +' + pp + ' PP', 'good'); g.audio.play('crate', 0.7); };
    this.$('#btn-help').onclick = () => { g.audio.play('ui'); this.screen('s-help'); };
    this.$('#btn-settings').onclick = () => { g.audio.play('ui'); this.openSettings('s-title'); };
    this.$$('.fs-toggle').forEach((b) => (b.onclick = () => { g.audio.play('ui'); this.toggleFullscreen(); }));
    this.fsHandler = () => this.syncFullscreen();
    document.addEventListener('fullscreenchange', this.fsHandler);
    document.addEventListener('webkitfullscreenchange', this.fsHandler);
    this.syncFullscreen();
    this.$$('[data-back]').forEach((b) => (b.onclick = () => { g.audio.play('ui'); this.screen(b.dataset.back); }));
    // A Home button on every menu screen, so controller players never need Esc.
    this.$$('.screen').forEach((scr) => {
      if (scr.id === 's-title' || scr.id === 's-lobby' || scr.querySelector('.home-btn')) return;
      const hb = document.createElement('button');
      hb.type = 'button'; hb.className = 'home-btn'; hb.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h4.5v-5.5h4v5.5h4.5V10"/></svg><span>Home</span>';
      hb.onclick = () => { g.audio.play('ui'); this.screen('s-title'); };
      scr.appendChild(hb);
    });
    // Esc (player 1's keyboard) presses the open menu screen's Back button.
    if (g.seat === 1 && !this.escBack) {
      this.escBack = (e) => {
        if (e.key !== 'Escape' || g.mode === 'game') return;
        if ([...document.querySelectorAll('.overlay.on, .pad-modal')].some((m) => m.offsetParent || m.classList.contains('on'))) return;
        const scr = this.root.querySelector('.screen.on');
        const back = scr && [...scr.querySelectorAll('[data-back], #btn-leave')].find((b) => b.offsetParent);
        if (back && scr.id !== 's-title') { e.preventDefault(); back.click(); }
      };
      window.addEventListener('keydown', this.escBack);
    }
    this.$$('#help-tabs button').forEach((b) => (b.onclick = () => { g.audio.play('ui'); this.$$('#help-tabs button').forEach((x) => x.classList.toggle('sel', x === b)); this.$$('#s-help .help-pane').forEach((x) => x.classList.toggle('on', x.dataset.t === b.dataset.t)); }));
    { const hg = this.$('#help-gear'), GI = { webswing: '🕸️', jetpack: '🚀', wings: '🪽', drone: '🛸', turret: '🔫', zombiestaff: '🧟', gravgun: '🧲', healstaff: '✚', laser: '👁️', alienblaster: '👽' };
      if (hg) hg.innerHTML = WEAPONS.filter((w) => GEAR_GOALS[w.id]).map((w) => '<li><i>' + (GI[w.id] || '⚙️') + '</i><span><b>' + esc(w.name) + '.</b> ' + esc(w.how || '') + '</span></li>').join(''); }
    this.$('#join-go').onclick = () => this.join(this.$('#join-code').value);
    this.$('#join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.join(this.$('#join-code').value); });
  }

  // ---------------- couch setup ----------------
  bindCouch() {
    const g = this.game;
    if (g.seat !== 1) return;
    this.$('#couch-start').onclick = () => {
      g.audio.unlock(); g.audio.play('ui');
      const dev = this.couchDevices();
      this.couchStop();
      g.startCouch(dev);
    };
    this.$$('#cc-p2-seg button').forEach((b) => (b.onclick = () => { g.audio.play('ui'); this.couchDev = b.dataset.dev; this.refreshCouch(true); }));
    this.padEvt = () => { if (this.root.dataset.screen === 's-couch') this.refreshCouch(); };
    window.addEventListener('gamepadconnected', this.padEvt);
    window.addEventListener('gamepaddisconnected', this.padEvt);
  }

  openCouch() {
    this.screen('s-couch');
    this.$('#couch-start').textContent = this.game.duelMode ? 'Start couch duel' : 'Start couch co-op';
    this.couchKey = null;
    this.couchDev = connectedPads().length ? 'pad' : 'kb';
    this.couchPad2 = null;
    this.couchSeen = new Map();
    this.refreshCouch(true);
    // With two controllers, the one you press a button on becomes Player 2's.
    this.couchTimer = setInterval(() => { this.couchPoll(); this.refreshCouch(); }, 120);
  }

  couchStop() { if (this.couchTimer) { clearInterval(this.couchTimer); this.couchTimer = null; } }

  couchPoll() {
    const pads = connectedPads();
    if (pads.length < 2 || this.couchDev !== 'pad') return;
    for (const p of pads) {
      const on = p.buttons.some((b) => b.pressed);
      const was = this.couchSeen.get(p.index);
      this.couchSeen.set(p.index, on);
      if (on && !was && p.index !== this.couchPad2) { this.couchPad2 = p.index; this.couchKey = null; }
    }
  }

  // Which input device each seat gets: { p1: controller index or null, p2: controller index or 'kb' }.
  couchDevices() {
    const pads = connectedPads();
    if (!pads.length) return { p1: null, p2: 'kb' };
    if (this.couchDev === 'kb') return { p1: pads[0].index, p2: 'kb' };
    const p2 = pads.find((p) => p.index === this.couchPad2) || (pads.length >= 2 ? pads[1] : pads[0]);
    const other = pads.find((p) => p !== p2);
    return { p1: other ? other.index : null, p2: p2.index };
  }

  // Live device detection for the setup screen. Only touches the DOM when something changed.
  refreshCouch(force) {
    const pads = connectedPads();
    if (!pads.length) this.couchDev = 'kb';
    const dev = this.couchDevices();
    const key = pads.map((p) => p.index + ':' + p.id).join('|') + '/' + this.couchDev + '/' + dev.p2;
    if (!force && key === this.couchKey) return;
    this.couchKey = key;
    const nm = (i) => { const p = pads.find((x) => x.index === i); return p ? String(p.id || 'Controller').replace(/\s*\(.*$/, '').slice(0, 26) || 'Controller' : ''; };
    const set = (id, text, cls) => { const el = this.$(id); el.textContent = text; if (cls) el.className = 'chip ' + cls; };
    const kb2 = dev.p2 === 'kb';
    this.$('#cc-p1-dev').textContent = dev.p1 != null ? 'Controller' : 'Keyboard + Mouse';
    set('#cc-p1-chip', dev.p1 != null ? 'Found: ' + nm(dev.p1) : 'Mouse and keyboard ready', 'ok');
    this.$('#cc-p1-keys').innerHTML = dev.p1 != null ? controlsHtml('pad', this.game.settings.layout) : controlsHtml('kbm');
    this.$('#cc-p2-dev').textContent = kb2 ? 'Keyboard (right side)' : 'Controller';
    if (kb2) set('#cc-p2-chip', 'Arrow keys, Enter and friends', 'ok');
    else set('#cc-p2-chip', 'Found: ' + nm(dev.p2), 'ok');
    this.$('#cc-p2-keys').innerHTML = controlsHtml(kb2 ? 'kb' : 'pad', this.game.settings.layout);
    this.$('#cc-p2-seg').style.display = pads.length ? '' : 'none';
    this.$$('#cc-p2-seg button').forEach((b) => b.classList.toggle('on', b.dataset.dev === (kb2 ? 'kb' : 'pad')));
    this.$('#couch-note').textContent = !pads.length
      ? 'No controller found, so Player 2 plays on the right side of the keyboard. Plug a controller in or pair one over Bluetooth and press a button on it to use it instead.'
      : kb2 ? 'Player 2 shares the keyboard (arrow keys, Enter and the keys next to them). Player 1 keeps the mouse and WASD.'
      : pads.length === 1 ? 'The controller goes to Player 2. Player 1 plays with mouse and keyboard.'
      : 'Press any button on a controller to make it Player 2\'s. The other one also works for Player 1.';
    this.$('#couch-note').classList.remove('warn');
  }

  // Two-press guard for the buttons that end couch co-op, so a stray click or A press cannot drop both players.
  confirmEnd(btn, label, then, ask) {
    const g = this.game;
    if (g.mode !== 'game') { (then || (() => g.leaveParty()))(); return; } // menus leave in one press; only leaving a run asks twice (Nutty 2026-11-11)
    if (btn.dataset.armed) { clearTimeout(this.confirmTimer); this.confirmTimer = null; delete btn.dataset.armed; btn.textContent = label; (then || (() => g.leaveParty()))(); return; }
    btn.dataset.armed = '1';
    btn.textContent = ask || (g.seat === 2 ? 'Press again to leave' : 'Press again to end for both');
    this.confirmTimer = setTimeout(() => { this.confirmTimer = null; delete btn.dataset.armed; btn.textContent = label; }, 3500);
  }

  // A one-off reminder of this seat's controls at the start of a couch run.
  couchKeysCard() {
    const g = this.game, el = this.$('#couch-keys');
    if (!el) return;
    clearTimeout(this.keysTimer);
    if (!(g.party && g.party.kind === 'local') || g.bot || g.isBot) { el.classList.remove('on'); return; }
    const kind = g.padKind();
    el.innerHTML = '<b>PLAYER ' + g.seat + ' controls</b><ul>' + controlsHtml(kind, g.settings.layout) + '</ul>';
    el.classList.add('on');
    this.keysTimer = setTimeout(() => el.classList.remove('on'), 12000);
  }

  // Drop the page-level listeners (used when the second couch seat is destroyed).
  dispose() {
    this.couchStop();
    clearTimeout(this._frostT); if (this._frost) { this._frost.remove(); this._frost = null; }
    document.removeEventListener('fullscreenchange', this.fsHandler);
    document.removeEventListener('webkitfullscreenchange', this.fsHandler);
    if (this.padEvt) { window.removeEventListener('gamepadconnected', this.padEvt); window.removeEventListener('gamepaddisconnected', this.padEvt); }
  }

  // Fullscreen covers the whole page, so both couch seats go fullscreen together.
  isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  syncFullscreen() {
    const on = this.isFullscreen();
    const ico = on ? '<svg viewBox="0 0 24 24"><path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/></svg>';
    this.$$('.fs-toggle').forEach((b) => (b.innerHTML = '<span>' + (on ? 'Exit Full Screen' : 'Full Screen') + '</span>' + ico));
    // Layout can settle a frame or two after the switch, so size again once it has.
    this.game.onResize();
    setTimeout(() => this.game.onResize(), 250);
  }
  async toggleFullscreen() {
    const g = this.game, d = document, el = d.documentElement;
    // Browsers only allow fullscreen from a real click or key press, not a controller button.
    const ua = navigator.userActivation;
    if (!this.isFullscreen() && ua && !ua.isActive) { this.toast('Browsers only allow fullscreen from the mouse or keyboard. Click Fullscreen or press F11.'); return; }
    const relock = g.mode === 'game' && !g.paused && document.pointerLockElement === g.canvas;
    try {
      if (this.isFullscreen()) await (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else {
        const req = el.requestFullscreen || el.webkitRequestFullscreen;
        if (!req || d.fullscreenEnabled === false) throw new Error('blocked');
        await req.call(el, { navigationUI: 'hide' });
      }
    } catch (e) {
      this.toast('Fullscreen is blocked here. Open the game in its own browser tab, then try again.', 'bad');
      return;
    }
    if (relock) setTimeout(() => g.lockPointer(), 150);
  }

  async join(code, back = 's-join') {
    code = String(code || '').trim().toUpperCase();
    if (code.length < 4) { this.toast('Enter the 5-number code', 'bad'); return; }
    this.busy('Joining ' + code + '…');
    try { await this.game.joinParty(code); }
    catch (e) { this.screen(back); this.toast(e.message || 'Could not join', 'bad'); }
    this.busy(null);
  }

  autoJoin(code) { this.join(code); }

  busy(text) {
    const b = this.$('#busy');
    b.classList.toggle('on', !!text);
    if (text) this.$('#busy-text').textContent = text;
  }

  showTitle() {
    this.screen('s-title');
    if (this.game.seat !== 2) this.game.audio.startLobbyMusic();
    if (this.ringPlace) this.ringPlace();
    const r = this.game.records || {};
    this.$('#records').innerHTML = `<div><b>${r.wins || 0}</b><span>Completed runs</span></div><div><b>${r.totalKills || 0}</b><span>Lifetime kills</span></div>`;
    this.$('#hud').classList.remove('on');
    this.game.duelMode = false;
    this.$('#title-pp').textContent = getMeta().pp.toLocaleString();
    this.dailyTitle();
  }

  refreshPartyList() {
    const g = this.game;
    const list = this.$('#party-list');
    if (!list) return;
    const t = g.transport;
    this.$('#net-note').textContent = t === 'room'
      ? 'Friends who open this same game link appear here. Their party shows up automatically.'
      : t === 'bc' ? 'Local test mode: parties from other tabs on this computer.' : t === 'peer' ? (this.scanning ? 'Looking for open public games…' : 'Open public games are listed here. Friends in a private party can send you their code or invite link.') : 'Looking for parties…';
    const parties = g.lobby ? g.lobby.parties().filter((p) => !p.me && p.pub !== 0) : [];
    list.innerHTML = parties.length
      ? parties.map((p) => `<button class="party-row" data-code="${esc(p.code)}"><span class="pr-host">${esc(p.host || 'Party')}'s ${p.dm ? 'duel' : 'party'}</span><span class="pr-n">${Math.min(5, p.n || 1)}/5</span><span class="pr-code">${esc(p.code)}</span></button>`).join('')
      : `<div class="empty">${t === 'peer' && this.scanning ? 'Searching…' : 'No open public games right now. Quickplay will host one for you.'}</div>`;
    this.$$('.party-row', list).forEach((b) => (b.onclick = () => this.join(b.dataset.code)));
  }

  // ---------------- lobby ----------------
  showLobby() {
    const g = this.game;
    this.screen('s-lobby');
    this.$('#hud').classList.remove('on');
    // Whatever the last run left on screen (summary, death note, duel result...) must never sit on top of the lobby and swallow clicks:
    // a seat that gets pulled back to the lobby by the host never pressed the summary button itself.
    for (const id of ['#summary', '#dead', '#duelend', '#vote', '#bless', '#shop', '#bossbar', '#waiting']) { const e = this.$(id); if (e) e.classList.remove('on'); }
    const solo = g.party.kind === 'solo' || g.party.kind === 'local';
    this.$('#lobby-title').textContent = g.bot ? 'Duel Arena · versus the CPU' : g.duelMode ? (g.party.kind === 'local' ? 'Local duel' : 'Duel party ' + g.partyCode) : g.party.kind === 'local' ? 'Local co-op' : solo ? 'Solo run' : 'Party ' + g.partyCode;
    this.$('#invite').style.display = solo ? 'none' : '';
    this.$('#invite-code').textContent = g.partyCode || '';
    this.$('#invite-copy').onclick = () => {
      const url = new URL(location.href);
      url.searchParams.set('party', g.partyCode);
      const text = g.transport === 'peer' ? url.toString() : 'Party code: ' + g.partyCode;
      navigator.clipboard && navigator.clipboard.writeText(text).then(() => this.toast(g.transport === 'peer' ? 'Invite link copied' : 'Party code copied', 'good'), () => this.toast(text));
    };
    this.$('#invite-hint').textContent = g.transport === 'peer' ? 'Send this link to friends. They join straight into your party.' : g.transport === 'room' ? 'Friends open this same game link, then pick your party from Join Party.' : 'Open another tab with ?net=bc to join.';
    // Step 1: character cards (with rendered portraits) and the element row.
    const shots = g.menu.portraits(g.renderer);
    const wshots = g.menu.weaponShots(g.renderer);
    const bar = (v, max) => `<i style="width:${Math.min(100, (v / max) * 100)}%"></i>`;
    this.$('#char-cards').innerHTML = CHARACTERS.map((c) => `
      <button class="char-card${charUnlocked(c.id) ? '' : ' locked'}" data-ch="${c.id}">
        <img class="portrait" src="${shots[c.id] || ''}" alt="">
        <div class="ch-taken"></div>
        <div class="ch-check">✓</div>
        ${charUnlocked(c.id) ? '' : `<div class="ch-lock"><b>🔒 LOCKED</b><span>${esc(LOCKED_CHARACTERS[c.id].how)}</span></div>`}
        <div class="ch-info">
          <div class="ch-role">${c.role}</div>
          <div class="ch-name">${c.name}</div>
          <div class="ch-stats"><label>Health</label><div class="bar">${bar(c.stats.hp, 1.3)}</div><label>Speed</label><div class="bar">${bar(c.stats.speed, 1.12)}</div></div>
        </div>
      </button>`).join('');
    this.$$('.char-card').forEach((b) => (b.onclick = () => { if (!charUnlocked(b.dataset.ch)) { g.audio.play('deny'); this.toast(LOCKED_CHARACTERS[b.dataset.ch].how, 'bad'); return; } g.audio.play('ui'); g.setLoadout({ ch: b.dataset.ch }); this.renderLobby(); }));
    this.$('#class-cards').innerHTML = CLASSES.map((c) => `
      <button class="class-card" data-c="${c.id}" style="--cc:${c.css}">
        <div class="cc-icon">${ICONS[c.element]}</div>
        <div class="cc-name">${c.name}</div>
        <div class="cc-el">${c.element}</div>
      </button>`).join('');
    this.$$('.class-card').forEach((b) => (b.onclick = () => { g.audio.play('ui'); g.setLoadout({ c: b.dataset.c }); this.renderLobby(); }));
    const goStep = (n) => {
      g.audio.play('ui'); g.lobbyStep = n; this.renderLobby(); this.$('.lobby-right').scrollTop = 0;
      if (g.pad.active) setFocus(this.root, n === 2 ? this.$('.wcard') : (this.$('.char-card.sel') || this.$('.char-card')));
    };
    this.$('#btn-to-wall').onclick = () => goStep(2);
    this.$('#btn-to-char').onclick = () => goStep(1);
    this.$('#step-1').onclick = () => goStep(1);
    this.$('#step-2').onclick = () => goStep(2);
    // Step 2: the weapon wall, three shelves (tier 1 melee, tier 2 guns, tier 3 gear). Nothing is pre-picked.
    const tierName = { 1: 'Tier 1 · Melee', 2: 'Tier 2 · Guns', 3: 'Gear' }, tierSub = { 1: 'take any 3 items in all', 2: 'take any 3 items in all', 3: 'any mix, even all 3 gear' };
    const card = (w) => {
      const dps = w.kind === 'melee' ? w.dmg / w.rate : (w.dmg * (w.pellets || 1)) / w.rate;
      const act = w.summon || w.deploy || w.grav || w.heal;
      const kind = w.kind === 'gear' ? 'Gear' : act ? 'Gear · Active' : w.eyes ? 'Eye beams' : w.kind === 'melee' ? 'Melee' : w.proj ? 'Explosive' : w.auto ? 'Automatic' : 'Firearm';
      const stats = w.kind === 'gear' || act ? `<div class="w-how">${esc(w.how || 'Passive')}</div>`
        : `<div class="w-stats"><label>Damage</label><div class="bar">${bar(w.dmg * (w.pellets || 1), 100)}</div><label>Speed</label><div class="bar">${bar(1 / w.rate, 10)}</div><label>DPS</label><div class="bar">${bar(dps, 180)}</div></div>`;
      return `<button class="wcard ${TIER(w) === 3 ? 'gear' : ''}" data-w="${w.id}" title="${esc(w.name + ': ' + (w.desc || ''))}">
        ${wshots[w.id] ? `<img class="w-img" src="${wshots[w.id]}" alt="">` : ''}
        <div class="w-kind">${kind}</div>
        <div class="w-name">${w.name}</div>
        ${stats}
        <div class="w-desc">${w.desc}</div>
        <div class="w-slot"></div>
      </button>`;
    };
    this.$('#wall').innerHTML = [1, 2, 3].map((t) => `<div class="shelf"><b>${tierName[t]}</b><small>${tierSub[t]}</small></div>` + WEAPONS.filter((w) => TIER(w) === t && gearUnlocked(w.id)).map(card).join('') + (WEAPONS.some((w) => TIER(w) === t && !gearUnlocked(w.id)) ? '<div class="w-more">More unlocks as you play. See <b>Unlockables</b> on the main menu.</div>' : '')).join('');
    // The stats box to the left of the Weapon Wall: point at (or move the controller onto) any weapon and its numbers pop up there.
    const wstat = (id) => {
      const box = document.getElementById('arc-wstat'), w = WEAPON_BY_ID[id];
      if (!box) return;
      if (!w) { box.innerHTML = '<h3>Weapon stats</h3><p class="ws-hint">Point at any weapon on the wall to see its stats here.</p>'; box.dataset.w = ''; return; }
      if (box.dataset.w === id) return;
      box.dataset.w = id;
      const act = w.summon || w.deploy || w.grav || w.heal, gear = w.kind === 'gear' || act;
      const kind = w.kind === 'gear' ? 'Gear' : act ? 'Gear · Active' : w.eyes ? 'Eye beams' : w.kind === 'melee' ? 'Melee' : w.proj ? 'Explosive' : w.auto ? 'Automatic' : 'Firearm';
      const row = (l, v, max, num) => '<div class="ws-row"><span>' + l + '</span><i style="--v:' + Math.max(4, Math.min(100, (v / max) * 100)) + '%"></i><b>' + num + '</b></div>';
      const n1 = (v) => (Math.round(v * 10) / 10).toString();
      let rows = '';
      if (!gear) {
        const hit = w.dmg * (w.pellets || 1), dps = hit / w.rate;
        rows += row('Damage', hit, 160, w.pellets ? w.dmg + ' x ' + w.pellets : Math.round(hit));
        if (w.kind === 'melee') {
          rows += row('Swing speed', 1 / w.rate, 4, n1(1 / w.rate) + ' / s');
          rows += row('Damage / second', dps, 200, Math.round(dps));
          if (w.range) rows += row('Reach', w.range, 10, n1(w.range) + ' m');
          if (w.arc) rows += row('Sweep', w.arc, 200, Math.round(w.arc) + '°');
        } else {
          const kick = w.rec ? (w.rec.v || 0) + (w.rec.h || 0) * 0.5 : 0;
          rows += row('Fire rate', 60 / w.rate, 900, Math.round(60 / w.rate) + ' / min');
          rows += row('Damage / second', dps, 300, Math.round(dps));
          if (w.mag) rows += row('Magazine', w.mag, 60, w.mag);
          if (w.reload) rows += row('Reload', 4 - Math.min(4, w.reload), 4, n1(w.reload) + ' s');
          if (w.fall) rows += row('Range', w.fall[0], 120, w.fall[0] + ' m');
          if (w.rec) rows += row('Recoil', kick, 4, kick < 0.5 ? 'Low' : kick < 1.6 ? 'Medium' : 'High');
          if (w.hand) rows += row('Handling', w.hand, 14, w.hand >= 10 ? 'Quick' : w.hand >= 7 ? 'Steady' : 'Heavy');
          if (w.scope) rows += '<div class="ws-tag">Scoped</div>';
        }
      }
      box.innerHTML = '<h3>' + esc(w.name) + '</h3><div class="ws-kind">' + kind + '</div>' + (wshots[w.id] ? '<img src="' + wshots[w.id] + '" alt="">' : '')
        + (gear ? '<div class="ws-how">' + esc(w.how || 'Passive') + '</div>' : '<div class="ws-rows">' + rows + '</div>') + '<p>' + esc(w.desc || '') + '</p>';
    };
    this.wstat = wstat;
    wstat(splitLoadout(g.loadout.w).ws[0] || '');
    { const wall = this.$('#wall'), over = (e) => { const c = e.target.closest && e.target.closest('.wcard'); if (c) wstat(c.dataset.w); };
      wall.onmouseover = over; wall.onfocusin = over; wall.addEventListener('padfocus', over); }
    this.$$('.wcard').forEach((b) => (b.onclick = () => {
      g.audio.play('ui');
      const id = b.dataset.w, wd = WEAPON_BY_ID[id];
      let { ws, gears } = splitLoadout(g.loadout.w);
      const list = TIER(wd) === 3 ? gears : ws;
      if (list.includes(id)) { const out = list.filter((x) => x !== id); if (TIER(wd) === 3) gears = out; else ws = out; }
      else if (ws.length + gears.length >= 3) { this.toast('All three slots are full. Click a picked item to put it back.', 'bad'); return; }
      else list.push(id);
      const w = [...ws, ...gears]; // weapons first, gear after
      g.setLoadout({ w });
      this.renderLobby();
      // Controller: everything picked, jump straight to the ready button.
      if (loadoutFull(w) && g.pad.active) setFocus(this.root, this.$('#btn-ready'));
    }));
    this.$('#game-mode').onchange = (e) => { g.audio.play('ui'); g.setDuelMode(e.target.value === 'duel'); this.renderLobby(); };
    this.$('#cpu-play').onchange = (e) => { g.audio.play('ui'); g.autoplay = e.target.checked; this.refreshHints(); };
    this.$('#cpu-play').checked = !!g.autoplay;
    this.$('#round-len').onchange = (e) => { g.audio.play('ui'); g.setRoundLen(+e.target.value); };
    this.$('#party-vis').onchange = (e) => { g.audio.play('ui'); g.setPublic(e.target.value === 'pub'); };
    this.$('#difficulty').onchange = (e) => { g.audio.play('ui'); g.setHard(e.target.value === 'hard'); };
    this.$('#difficulty').value = g.settings.hard ? 'hard' : 'normal';
    this.$('#round-len').value = String(g.settings.roundLen);
    // Mutators: the host taps them on and off; everyone else sees the host's picks.
    const muBox = this.$('#mu-chips');
    muBox.innerHTML = MUTATORS.map((m) => `<button type="button" class="mu-chip" data-b="${m.bit}"><i></i>${esc(m.name)}</button>`).join('');
    const muDesc = (b) => { const m = b && MUTATORS.find((x) => x.bit === +b.dataset.b); this.$('#mu-desc').textContent = m ? m.desc : 'Point at a mutator to see what it does.'; };
    muDesc(null);
    muBox.onclick = (e) => { const b = e.target.closest('.mu-chip'); if (!b || !g.isHost) return; g.audio.play('ui'); g.setMu((g.settings.mu | 0) ^ +b.dataset.b); this.renderMuChips(); muDesc(b); };
    muBox.onmouseover = (e) => muDesc(e.target.closest('.mu-chip'));
    muBox.onfocusin = (e) => muDesc(e.target.closest('.mu-chip'));
    muBox.onmouseleave = () => muDesc(null);
    const muField = this.$('#mu-field');
    this.$('#mu-sum').onclick = () => { g.audio.play('ui'); muField.classList.toggle('open'); if (muField.classList.contains('open') && g.pad && g.pad.active && muBox.firstChild) setFocus(this.root, muBox.firstChild); };
    if (!this._muClose) { this._muClose = (e) => { if (!muField.contains(e.target)) muField.classList.remove('open'); }; document.addEventListener('pointerdown', this._muClose); }
    this.$('#btn-ready').onclick = () => {
      g.audio.play('ui');
      if (!loadoutFull(g.loadout.w)) { g.lobbyStep = 2; this.setFlip(2, true); this.renderLobby(); this.toast('Take 3 items off the wall first (any mix, weapons are optional)', 'bad'); return; }
      if (this.cpuFlow() && !g.ready && !this.cpuDone) { // versus the CPU: first your fighter, then the CPU's
        if (!g._cpuPick) { g.cpuPickBegin(); this.flipStep = 1; this.$('#s-lobby').classList.remove('flip-rev'); this.renderLobby(); return; }
        g.cpuPickEnd(true); this.cpuDone = true;
      }
      if (g.party.kind === 'local') g.setReady(!g.ready); // couch: both seats toggle Ready, the run starts when both are
      else if (g.isHost) {
        const members = g.lobbyMembers();
        const notReady = members.filter((m) => !m.me && !m.p.rdy);
        if (notReady.length) { this.toast('Waiting for ' + notReady.map((m) => m.p.n).join(', ') + ' to ready up', 'bad'); return; }
        this.$('#btn-ready').classList.add('go');
        g.startRun();
      } else g.setReady(!g.ready);
      this.renderLobby();
    };
    const couch = g.party.kind === 'local' && !g.bot;
    this.$('#btn-leave').onclick = () => { g.audio.play('ui'); if (couch) this.confirmEnd(this.$('#btn-leave'), g.duelMode ? 'End local duel' : 'End local co-op'); else g.leaveParty(); }; // Home leaves at once
    this.$('#btn-leave').classList.toggle('home-big', !couch);
    if (couch) this.$('#btn-leave').textContent = g.seat === 2 ? (g.duelMode ? 'Leave local duel' : 'Leave local co-op') : (g.duelMode ? 'End local duel' : 'End local co-op');
    else this.$('#btn-leave').innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h4.5v-5.5h4v5.5h4.5V10"/></svg><span>Home</span>';
    this.$('#btn-ready').classList.remove('go'); this.cpuDone = false;
    const cn = this.$('#couch-name');
    cn.value = g.settings.name;
    cn.onchange = () => {
      g.settings.name = cn.value.trim().slice(0, 16) || (g.seat === 2 ? 'Player 2' : 'Player 1');
      cn.value = g.settings.name; g.saveSettings();
      if (g.seat === 1) this.$('#name').value = g.settings.name;
      g.party.set({ n: g.myName }); g.setSeatTag(); this.renderLobby();
    };
    this.$('#couch-pad').innerHTML = couch ? '<b>Your controls</b><ul>' + controlsHtml(g.padKind(), g.settings.layout) + '</ul>' : '';
    this.$('#summary').classList.remove('on');
    this.flipStep = 1;
    this.arcLayout();
    this.renderLobby();
  }

  // Flip-book select (test, html[data-lobby=flip] or ?lobby=flip): the same lobby pieces, one page at a time.
  // Character, then Weapons, then Element, then Mutators with CPU Mode and Start Run. A duel stops at Element, with Ready under it.
  // Duel versus the CPU on the flip select: the player also picks the CPU's fighter.
  flipOn() { return FLIP_LOBBY && !!(this._arc && this._arc.on); }
  // Joining a run that is already under way: the select ends at the Element page with a Ready Up button (no run options to set).
  lateJoin() { const g = this.game, h = g.party && !g.isHost && g.hostPeer(g.party.peers()), ph = h && h.p.w && h.p.w.ph; return !!ph && ph !== 'lobby' && !['over', 'win', 'dend'].includes(ph); }
  cpuFlow() { const g = this.game; return FLIP_LOBBY && !!g.bot && !!(this._arc && this._arc.on); }
  // The Element panel: the three cooldowns with their descriptions and a Customize button under them. In Customize the three
  // shrink to a column of slots, and beside them a column lists every cooldown the element owns (name, description); the ones
  // already in a slot are shaded out, so nothing can be doubled.
  classDetailHTML(cls) {
    const g = this.game, K = [['q', 'Q'], ['e', 'G'], ['r', 'F']], cd = (ab) => (g.duelMode ? DUEL.cd : ab.cd) + 's';
    const head = `<div class="cd-head"><div class="cd-icon">${ICONS[cls.element]}</div><div><div class="cd-name">${cls.name}</div><div class="cd-tag">${cls.element} · ${cls.tagline}</div></div></div>`;
    const can = cls.pool.length > 3 && !g._cpuPick && !g.isBot;
    if (!this.custOn || !can) return head + K.map(([k, key]) => `<div class="ab"><kbd>${esc(this.key(key))}</kbd><div><b>${cls[k].name}</b><span class="cd">${cd(cls[k])}</span><p>${cls[k].desc}</p></div></div>`).join('') + (can ? '<button type="button" class="cz-btn">Customize</button>' : '');
    const sk = cls[this.custSlot] ? this.custSlot : 'q', eq = {};
    for (const [k, key] of K) eq[cls[k].id] = this.key(key);
    return head + '<div class="cz"><div class="cz-slots">'
      + K.map(([k, key]) => `<button type="button" class="cz-slot${k === sk ? ' on' : ''}" data-k="${k}"><kbd>${esc(this.key(key))}</kbd><b>${esc(cls[k].name)}</b></button>`).join('')
      + '<p class="cz-hint">Hover one of your three, then pick what replaces it.</p></div>'
      + `<div class="cz-list"><h5>Replace ${esc(cls[sk].name)} with</h5>`
      + [...cls.pool].sort((x, y) => !!eq[x.id] - !!eq[y.id]).map((ab) => `<button type="button" class="cz-opt${eq[ab.id] ? ' eq' : ''}" data-id="${ab.id}"><b>${esc(ab.name)}</b><span class="cd">${cd(ab)}</span>${eq[ab.id] ? '<em>Equipped · ' + esc(eq[ab.id]) + '</em>' : ''}<p>${esc(ab.desc)}</p></button>`).join('')
      + '</div></div><button type="button" class="cz-btn">Done</button>';
  }

  // Element page: a small clip of each of the element's three skills, one after the other.
  clipSync(show) {
    const g = this.game, F = this._flip;
    if (!F) return;
    const cls = g.loadout.c;
    if (!show) { clearTimeout(this.clipT); this.clipT = null; this.clipCls = null; return; }
    if (this.clipCls === cls && this.clipT) return;
    this.clipCls = cls; this.clipI = -1;
    if (!F.clip._bound) {
      // Pick any skill (its row, or its dot under the video) to play that clip now; click the video to replay it.
      F.clip._bound = true;
      const play = (i) => { if (!this.clipNext) return; g.audio.play('ui'); this.clipI = ((i % 3) + 3) % 3 - 1; this.clipNext(); };
      this.clipPlay = play;
      this.$('#class-detail').addEventListener('click', (e) => { const r = e.target.closest('.ab'); if (!r) return; const i = [...this.$$('#class-detail .ab')].indexOf(r); if (i >= 0) play(i); });
      F.clip.querySelector('.fc-dots').addEventListener('click', (e) => { const d = e.target.closest('i'); if (!d) return; e.stopPropagation(); play([...F.clip.querySelectorAll('.fc-dots i')].indexOf(d)); });
      F.clip.querySelector('.fc-screen').addEventListener('click', () => play(this.clipI < 0 ? 0 : this.clipI));
    }
    const next = () => {
      const c = g.myClass(); if (!c) return;
      if (g.mode !== 'lobby' || this.flipStep !== 3) { this.clipT = null; this.clipCls = null; return; } // the page was left: stop cycling
      this.clipI = (this.clipI + 1) % 3;
      const k = ['q', 'e', 'r'][this.clipI], ab = c[k];
      const img = F.clip.querySelector('img');
      img.src = ''; img.src = 'assets/clips/' + clipName(c, ab) + '.webp';
      F.clip.style.setProperty('--cc', c.css);
      F.clip.querySelector('.fc-cap').innerHTML = '<kbd>' + esc(this.key({ q: 'Q', e: 'G', r: 'F' }[k])) + '</kbd><b>' + esc(ab.name) + '</b><span>' + (this.clipI + 1) + ' / 3</span>';
      F.clip.querySelectorAll('.fc-dots i').forEach((d, i) => d.classList.toggle('on', i === this.clipI));
      this.$$('#class-detail .ab').forEach((r, i) => r.classList.toggle('playing', i === this.clipI));
      clearTimeout(this.clipT); this.clipT = setTimeout(next, CLIP_MS);
    };
    this.clipNext = next;
    next();
  }
  flipSync(duel) {
    if (!FLIP_LOBBY) return;
    const g = this.game, root = this.$('#s-lobby'), A = this._arc, on = !!(A && A.on);
    root.classList.toggle('flip-on', on);
    if (!on) return;
    if (!this._flip) {
      const mk = (cls, html) => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; A.el.appendChild(d); return d; };
      const steps = mk('flip-steps', ['Character', 'Weapons', 'Element', 'Mutators'].map((n, i) => `<button type="button" class="flip-step" data-s="${i + 1}"><b>${i + 1}</b><span>${n}</span></button>`).join('<i></i>'));
      const SIMPLE = { bighead: 'Everyone gets a giant head. Headshots are easy.', jackpot: 'Every 20th kill explodes into gold.', pinata: 'Enemies burst into confetti and candy that heals you.', bottomless: 'Never reload. Your guns never run out.', necro: 'Enemies you kill rise and fight for you for 10 seconds.', bullettime: 'Hold aim to slow the world. You stay fast and can hang in the air.', lowgrav: 'Moon jumps and floaty falls.' };
      const fin = mk('flip-final', `<h3 class="arc-h">Run options</h3><div class="flip-opts"></div>
        <div class="flip-muhead"><h3 class="arc-h">Mutators <small>just for fun · a mutator run counts toward nothing</small></h3><button type="button" class="mu-master" aria-pressed="false"><span>Off</span><i></i></button></div>
        <div class="flip-mulist">${MUTATORS.map((m) => `<button type="button" class="mu-row" data-b="${m.bit}"><i class="mu-sw"></i><b>${esc(m.name)}</b><p>${esc(SIMPLE[m.id] || m.desc)}</p></button>`).join('')}</div>
        <p class="flip-hint">Nothing to change? Just press Start.</p>`);
      fin.querySelector('.mu-master').onclick = () => {
        if (!g.isHost) return;
        g.audio.play('ui');
        const on = !(this.muOpen || (g.settings.mu | 0));
        if (on) { this.muOpen = true; if (this._muLast) g.setMu(this._muLast); }
        else { this._muLast = g.settings.mu | 0; this.muOpen = false; g.setMu(0); }
        this.renderMuChips(); this.flipSync(g.duelMode);
      };
      fin.querySelector('.flip-mulist').onclick = (e) => { const b = e.target.closest('.mu-row'); if (!b || !g.isHost) return; g.audio.play('ui'); g.setMu((g.settings.mu | 0) ^ +b.dataset.b); this.renderMuChips(); this.flipSync(g.duelMode); };
      const clip = mk('flip-clip', '<div class="fc-head">Skill preview</div><div class="fc-screen"><img alt=""><div class="fc-dots"><i></i><i></i><i></i></div></div><div class="fc-cap"></div>');
      const banner = mk('flip-cpu-banner', 'Choosing CPU');
      const nav = mk('flip-nav', `<button type="button" class="btn flip-back">◀ Back</button><button type="button" class="btn flip-next">Next ▶</button>`);
      steps.onclick = (e) => { const b = e.target.closest('.flip-step'); if (b) this.setFlip(+b.dataset.s); };
      nav.querySelector('.flip-back').onclick = () => {
        if ((this.flipStep || 1) === 1 && g._cpuPick) { g.audio.play('ui'); g.cpuPickEnd(false); this.flipStep = 3; root.classList.add('flip-rev'); this.renderLobby(); return; } // back to your own fighter
        this.setFlip((this.flipStep || 1) - 1);
      };
      nav.querySelector('.flip-next').onclick = () => this.setFlip((this.flipStep || 1) + 1);
      this._flip = { steps, fin, nav, clip, banner };
    }
    const F = this._flip;
    for (const [sel, to] of [['#cpu-field', '.flip-opts'], ['#round-field', '.flip-opts'], ['#diff-field', '.flip-opts']]) { const n = this.$(sel), box = F.fin.querySelector(to); if (n.parentNode !== box) box.appendChild(n); }
    { const cs = this.$('#cpu-field span'); if (cs && cs.textContent !== 'CPU Mode') cs.textContent = 'CPU Mode'; }
    { // Mutators switch and list follow the host's picks.
      const host = g.party && g.hostPeer(g.party.peers());
      const mask = g.isHost ? g.settings.mu | 0 : (host && host.p.lb && host.p.lb.mu) | 0, open = !!(mask || (g.isHost && this.muOpen));
      const ms = F.fin.querySelector('.mu-master');
      ms.classList.toggle('on', open); ms.setAttribute('aria-pressed', open); ms.disabled = !g.isHost; ms.firstChild.textContent = open ? 'On' : 'Off';
      F.fin.classList.toggle('mu-open', open);
      F.fin.querySelectorAll('.mu-row').forEach((b) => { b.classList.toggle('on', (mask & +b.dataset.b) !== 0); b.disabled = !g.isHost; });
    }
    const last = duel || this.lateJoin() ? 3 : 4, step = Math.min(last, Math.max(1, this.flipStep || 1));
    this.flipStep = step;
    if (root.dataset.flip !== String(step)) root.dataset.flip = step;
    root.classList.toggle('flip-duel', !!duel);
    root.classList.toggle('flip-last', step === last);
    F.steps.querySelectorAll('.flip-step').forEach((b) => { const n = +b.dataset.s; b.classList.toggle('sel', n === step); b.classList.toggle('done', n < step); b.style.display = n > last ? 'none' : ''; if (b.previousElementSibling) b.previousElementSibling.style.display = n > last ? 'none' : ''; });
    root.classList.toggle('cpu-pick', !!g._cpuPick);
    this.clipSync(step === 3 && root.classList.contains('on'));
    { const ab = this.$$('#class-detail .ab'); ab.forEach((r, i) => r.classList.toggle('playing', step === 3 && i === this.clipI)); }
    F.nav.querySelector('.flip-back').style.display = step > 1 || g._cpuPick ? '' : 'none';
    const nx = F.nav.querySelector('.flip-next');
    nx.style.display = step < last ? '' : 'none';
    nx.textContent = (['', 'Weapons', 'Element', 'Mutators'][step] || 'Next') + ' ▶';
  }
  setFlip(n, quiet) {
    if (!FLIP_LOBBY) return;
    const g = this.game, root = this.$('#s-lobby'), last = g.duelMode || this.lateJoin() ? 3 : 4, to = Math.min(last, Math.max(1, n | 0));
    if (to === (this.flipStep || 1)) return;
    root.classList.toggle('flip-rev', to < (this.flipStep || 1));
    this.flipStep = to;
    if (!quiet) g.audio.play('ui');
    this.flipSync(g.duelMode);
    if (g.pad && g.pad.active) { const f = this._flip.nav.querySelector(to < last ? '.flip-next' : '.flip-back'); const rb = this.$('#btn-ready'); setFocus(this.root, to === last && rb && !rb.disabled ? rb : f); }
  }

  // Arcade-versus character select (full screen only): the existing lobby pieces are moved into a one-screen layout,
  // with the roster along the bottom, element orbs and abilities on the left, the Weapon Wall and Ready on the right.
  // Split-screen couch play keeps the old three-column lobby, so every piece goes back where it came from.
  arcLayout() {
    const g = this.game, on = true, split = document.body.classList.contains('split'); // split-screen seats use the same flip select, sized to their half
    const root = this.$('#s-lobby');
    if (!this._arc) {
      const a = document.createElement('div');
      a.className = 'arc';
      a.innerHTML = `<div class="arc-shade"></div>
        <div class="arc-top"><div class="arc-logo">THE PERFECT RUN</div><div class="arc-opts"></div><div class="arc-chip arc-pp"><small>PP</small><b id="arc-pp">0</b></div><div class="arc-leave"></div></div>
        <div class="arc-hero"><div class="arc-name"></div><div class="arc-bars" id="arc-bars"></div><div class="arc-skins"></div><button type="button" class="cpu-level" id="cpu-level"></button></div>
        <div class="arc-orbs"></div>
        <div class="arc-abil"></div>
        <div class="arc-party"></div>
        <div class="arc-plist" id="arc-plist"></div>
        <div class="arc-wstat" id="arc-wstat"></div>
        <div class="arc-wall"><h3 class="arc-h">Weapon Wall <small>any 3 · weapons or gear</small></h3><div class="arc-wall-in"></div></div>
        <div class="arc-ready"><div class="arc-p1" id="arc-p1"></div></div>
        <div class="arc-roster"></div>`;
      root.appendChild(a);
      const q = (s) => a.querySelector(s);
      this._arc = { el: a, moves: [
        ['#lobby-title', '.arc-opts'], ['#couch-warn', '.arc-opts'], ['#mode-field', '.arc-opts'], ['#vis-field', '.arc-opts'], ['#cpu-field', '.arc-opts'], ['#diff-field', '.arc-opts'], ['#round-field', '.arc-opts'], ['#mu-field', '.arc-opts'],
        ['#btn-leave', '.arc-leave'], ['#stage-name', '.arc-name'], ['#skin-row', '.arc-skins'], ['#class-cards', '.arc-orbs'], ['#class-detail', '.arc-abil'],
        ['#invite', '.arc-party'], ['#members', '.arc-party'], ['#couch-pad', '.arc-party'],
        ['.slots', '.arc-wall-in'], ['#wall', '.arc-wall-in'], ['#btn-ready', '.arc-ready'], ['#char-cards', '.arc-roster'],
      ].map(([sel, to]) => { const n = this.$(sel); return { n, to: q(to), home: n.parentNode, next: n.nextSibling }; }) };
    }
    if (!this._cpuLvBound && !g.isBot) {
      // Duel versus the CPU: a button under the skins steps the CPU Level through Easy, Medium, Hard, Insane.
      this._cpuLvBound = true;
      window.__cpuLevel = Math.max(0, Math.min(3, g.settings.cpuLevel ?? 1));
      this._arc.el.querySelector('#cpu-level').onclick = () => { g.audio.play('ui'); g.settings.cpuLevel = window.__cpuLevel = ((g.settings.cpuLevel ?? 1) + 1) % 4; g.saveSettings(); this.renderLobby(); };
    }
    const A = this._arc;
    root.classList.toggle('arc-split', split);
    if (split) { const r = this.root.getBoundingClientRect(), u = Math.min(r.width / 1280, r.height / 1080).toFixed(4) + 'px'; if (A.u !== u) { A.u = u; A.el.style.setProperty('--u', u); } }
    else if (A.u) { A.u = null; A.el.style.removeProperty('--u'); }
    if (A.on === on) return;
    A.on = on;
    for (const m of A.moves) {
      if (on) m.to.appendChild(m.n);
      else m.home.insertBefore(m.n, m.next && m.next.parentNode === m.home ? m.next : null);
    }
    A.el.style.display = on ? '' : 'none';
    root.classList.toggle('arc-on', on);
    g.menu.arc = on;
  }

  // Skin picker for the selected character: swatch chips, a price tag (free for now) and a live 3D preview.
  renderSkins(lo) {
    const g = this.game, row = this.$('#skin-row');
    if (!row) return;
    if (row.dataset.ch !== lo.ch) {
      row.dataset.ch = lo.ch;
      row.innerHTML = skinsOf(lo.ch).map((s) => {
        const free = skinIsFree(s), ok = skinUnlocked(lo.ch, s);
        return `<button class="skin-chip${ok ? '' : ' locked'}" data-sk="${s.id}" title="${esc(s.name)}">
          <i class="sw" style="background:linear-gradient(135deg, ${(s.sw || ['#888'])[0]} 50%, ${(s.sw || ['#888', '#444'])[1] || '#444'} 50%)"></i>
          <span class="sk-name">${esc(s.name)}</span>${free ? '' : '<em>' + s.pp + ' PP</em>'}</button>`;
      }).join('');
      this.$$('.skin-chip', row).forEach((b) => (b.onclick = () => {
        const sk = skinsOf(g.loadout.ch).find((x) => x.id === b.dataset.sk);
        if (!sk || !skinUnlocked(g.loadout.ch, sk)) { this.toast('Locked: costs ' + (sk ? sk.pp : '?') + ' PP', 'bad'); return; }
        g.audio.play('ui');
        g.setLoadout({ sk: sk.id });
        const img = this.$('.char-card[data-ch="' + g.loadout.ch + '"] .portrait');
        if (img) img.src = g.menu.portrait(g.renderer, g.loadout.ch);
        this.renderLobby();
      }));
    }
    this.$$('.skin-chip', row).forEach((b) => b.classList.toggle('sel', b.dataset.sk === lo.sk));
  }

  // The mutator chips show the host's picks (lb.mu); only the host can change them.
  renderMuChips() {
    const g = this.game, box = this.$('#mu-chips');
    if (!box) return;
    const host = g.party && g.hostPeer(g.party.peers());
    const mask = g.isHost ? g.settings.mu | 0 : (host && host.p.lb && host.p.lb.mu) | 0;
    for (const b of box.children) { b.classList.toggle('on', (mask & +b.dataset.b) !== 0); b.disabled = !g.isHost; }
    const on = MUTATORS.filter((m) => mask & m.bit), sum = this.$('#mu-sum');
    if (sum) { sum.textContent = !on.length ? 'Off' : on.length === 1 ? on[0].name : on.length + ' on'; sum.classList.toggle('lit', on.length > 0); }
  }

  // Round start with mutators on: each one's name in dripping blood-red letters, gone after about 3 seconds.
  mutatorBanner(list, extra = 0) {
    let el = document.getElementById('mu-banner');
    if (el) el.remove();
    if (!list.length) return;
    el = document.createElement('div'); el.id = 'mu-banner';
    list.forEach((m, i) => {
      const d = document.createElement('div');
      d.textContent = m.name.toUpperCase() + ' APPLIED';
      d.style.animationDelay = (i * 0.14) + 's, ' + (2.5 + extra + i * 0.05) + 's';
      el.appendChild(d);
    });
    (this.root.querySelector('#hud') || this.root).appendChild(el);
    clearTimeout(this._muT); this._muT = setTimeout(() => el.remove(), 3600 + extra * 1000);
  }

  renderLobby() {
    this.duelVoteUI();
    const g = this.game;
    if (g.mode !== 'lobby' || !g.party) return;
    const lo = g.loadout;
    const cls = g.myClass();
    const chr = CHAR_BY_ID[lo.ch] || CHAR_BY_ID.veteran;
    const step = g.lobbyStep || 1, armed = loadoutFull(lo.w);
    this.$('#pick-char').classList.toggle('on', step === 1);
    this.$('#pick-wall').classList.toggle('on', step === 2);
    this.$('#step-1').classList.toggle('on', step === 1); this.$('#step-1').classList.toggle('done', step > 1);
    this.$('#step-2').classList.toggle('on', step === 2); this.$('#step-2').classList.toggle('done', armed);
    this.$('#step-3').classList.toggle('on', armed && step === 2);
    this.$$('.char-card').forEach((b) => b.classList.toggle('sel', b.dataset.ch === lo.ch));
    this.renderSkins(lo);
    const others = g.lobbyMembers().filter((m) => !m.me);
    this.$$('.char-card').forEach((b) => { this.$('.ch-taken', b).innerHTML = others.filter((m) => m.p.ch === b.dataset.ch).map((m) => `<span>${g.bot ? 'CPU' : g.party.kind === 'local' ? 'PLAYER ' + (m.id === 'p2' ? 2 : 1) : esc(m.p.n)}</span>`).join(''); });
    this.$$('.class-card').forEach((b) => b.classList.toggle('sel', b.dataset.c === lo.c));
    const picked = splitLoadout(lo.w), order = [...picked.ws, ...picked.gears];
    // Slot colours: primary red, other weapons blue, gear purple (on the slots and on the picked wall tiles).
    const KINDS = ['k-pri', 'k-sec', 'k-gear'];
    const slotKind = (i) => { const w = WEAPON_BY_ID[order[i]]; return !w ? KINDS[i] : TIER(w) === 3 ? 'k-gear' : i === 0 ? 'k-pri' : 'k-sec'; };
    this.$$('.wcard').forEach((b) => {
      const i = order.indexOf(b.dataset.w);
      b.classList.toggle('sel', i >= 0);
      for (const k of KINDS) b.classList.toggle(k, i >= 0 && slotKind(i) === k);
      this.$('.w-slot', b).textContent = i >= 0 ? String(i + 1) : '';
    });
    [0, 1, 2].forEach((i) => {
      const w = WEAPON_BY_ID[order[i]];
      this.$('#slot-' + i).classList.toggle('full', !!w);
      for (const k of KINDS) this.$('#slot-' + i).classList.toggle(k, slotKind(i) === k);
      this.$('#slot-' + i + ' span').textContent = w ? (w.kind === 'gear' ? 'Gear' : i === 0 ? 'Primary' : 'Weapon') : ['Primary', 'Secondary', 'Gear'][i];
      this.$('#slot-' + i + ' b').textContent = w ? w.name : 'Empty';
    });
    this.arcLayout();
    if (this._arc && this._arc.on) {
      this._arc.el.style.setProperty('--acc', cls.css);
      const bar = (l, v, max, num) => `<div class="abar"><span>${l}</span><i style="--v:${Math.min(100, (v / max) * 100)}%"></i><b>${num}</b></div>`;
      this.$('#arc-bars').innerHTML = bar('Health', chr.stats.hp, 1.3, Math.round(chr.stats.hp * CONFIG.baseHp)) + bar('Speed', chr.stats.speed, 1.12, Math.round(chr.stats.speed * 100) + '%');
      this.$('#arc-pp').textContent = getMeta().pp.toLocaleString();
      this.$('#arc-p1').textContent = (g.bot ? (g._cpuPick ? 'CPU' : 'YOU') : g.party.kind === 'local' ? 'PLAYER ' + g.seat : esc(g.myName || 'P1')) + (g.ready ? ' · LOCKED IN' : ' · ' + order.length + '/3 PICKED');
    }
    this.$('#stage-name').innerHTML = `<div class="sn-role">${chr.role}</div><div class="sn-name">${chr.name}</div><div class="sn-blurb">${esc(chr.blurb)}</div>`;
    this.$('#class-detail').style.setProperty('--cc', cls.css);
    { const cdEl = this.$('#class-detail'), h = this.classDetailHTML(cls);
      if (cdEl._h !== h) { cdEl._h = h; cdEl.innerHTML = h; }
      if (!this._czBound) {
        // Customize: hover (or click) one of your three cooldowns, then click its replacement in the column beside them.
        this._czBound = true;
        const IDX = { q: 0, e: 1, r: 2 };
        cdEl.addEventListener('click', (e) => {
          if (e.target.closest('.cz-btn')) { g.audio.play('ui'); this.custOn = !this.custOn; this.renderLobby(); return; }
          const sl = e.target.closest('.cz-slot');
          if (sl) { this.custSlot = sl.dataset.k; this.renderLobby(); if (this.clipPlay) this.clipPlay(IDX[sl.dataset.k]); return; }
          const o = e.target.closest('.cz-opt');
          if (o && !o.classList.contains('eq')) { const k = this.custSlot || 'q'; if (g.setAbility(k, o.dataset.id)) { this.renderLobby(); if (this.clipPlay) this.clipPlay(IDX[k]); else g.audio.play('ui'); } }
        });
        cdEl.addEventListener('mouseover', (e) => { const sl = e.target.closest('.cz-slot'); if (sl && this.custSlot !== sl.dataset.k) { this.custSlot = sl.dataset.k; this.renderLobby(); } });
      }
    }
    const members = g.lobbyMembers();
    const host = g.hostPeer(g.party.peers());
    const hostRl = host && host.p.lb ? host.p.lb.rl : g.settings.roundLen;
    const couch = g.party.kind === 'local';
    const duel = g.isHost ? !!g.duelMode : !!(host && host.p.lb && host.p.lb.dm);
    if (!g.isHost) g.duelMode = duel;
    const modeOn = g.party.kind !== 'solo' && !g.bot && g.seat === 1;
    this.$('#mode-field').classList.toggle('on', modeOn);
    this.$('#game-mode').disabled = !g.isHost;
    this.$('#game-mode').value = duel ? 'duel' : 'run';
    this.$('#cpu-field').classList.toggle('on', g.alone && !duel);
    this.$('#round-field').style.display = duel || (couch && !g.isHost) ? 'none' : '';
    this.$('#diff-field').style.display = duel ? 'none' : ''; // Duel Mode has no difficulty, CPU Run or mutators
    this.$('#mu-field').style.display = duel || (couch && !g.isHost) ? 'none' : '';
    this.renderMuChips();
    this.flipSync(duel);
    const startWord = duel ? 'Start Duel' : 'Start Run';
    this.$('#lobby-title').textContent = g.bot ? 'Duel Arena · versus the CPU' : duel ? (couch || g.couchWait ? 'Local duel' : 'Duel party ' + (g.partyCode || '')) : couch || g.couchWait ? 'Local co-op' : g.party.kind === 'solo' ? 'Solo run' : 'Party ' + g.partyCode;
    // Couch co-op: publish which step this seat is on so the other seat can show it.
    if (couch && g.party.mine.ls !== step) g.party.set({ ls: step });
    const memberHtml = (m, seat) => {
      const seatName = g.bot ? (seat === 2 ? 'CPU' : 'YOU') : 'PLAYER ' + seat;
      const c = CLASS_BY_ID[m.p.c] || cls;
      const mc = CHAR_BY_ID[m.p.ch];
      const wps = m.p.wp || [];
      const ws = wps.map((w) => (WEAPON_BY_ID[w] || {}).name).filter(Boolean).join(' + ');
      if (!seat) {
        return `<div class="member ${m.p.rdy || m.p.host ? 'ready' : ''}" style="--cc:${c.css}">
        <div class="m-icon">${ICONS[c.element]}</div>
        <div class="m-text"><b>${esc(m.p.n)}${m.me ? ' <em>(you)</em>' : ''}${m.p.host ? ' <span class="crown">HOST</span>' : ''}</b><span>${mc ? mc.name + ' · ' : ''}${c.name} · ${esc(loadoutFull(wps) ? ws : 'at the weapon wall')}</span></div>
        <div class="m-state">${m.p.host ? '' : m.p.rdy ? 'Ready' : 'Picking'}</div>
      </div>`;
      }
      const isArmed = loadoutFull(wps);
      const done = !!m.p.rdy;
      const state = m.p.rdy ? 'Ready ✓' : isArmed ? 'Armed · press Ready'
        : m.p.ls === 2 ? `At the Weapon Wall · ${wps.length}/3 picked` : 'Choosing a character';
      return `<div class="member couch p${seat} ${done ? 'ready' : ''}" style="--cc:${c.css}">
        <div class="m-icon">${ICONS[c.element]}</div>
        <div class="m-text"><b><i class="seat-pill p${seat}">${seatName}${m.me && !g.bot ? ' · YOU' : ''}</i> ${esc(m.p.n)}</b><span>${mc ? mc.name + ' · ' : ''}${c.name}${isArmed ? ' · ' + esc(ws) : ''}</span></div>
        <div class="m-state">${state}</div>
      </div>`;
    };
    { const cl = this.$('#cpu-level'), lv = Math.max(0, Math.min(3, g.settings.cpuLevel ?? 1));
      if (cl) { const h = g.bot ? 'CPU Level<b>' + CPU_LEVELS[lv] + '</b><i>▸</i>' : ''; if (cl._h !== h) { cl._h = h; cl.innerHTML = h; cl.dataset.lv = lv; cl.style.display = g.bot ? '' : 'none'; } } }
    { // Party panel on the right of the select: everyone in the game, a crown by the host.
      const pl = this.$('#arc-plist');
      if (pl) {
        const nm = (m) => g.bot ? (m.me ? 'You' : 'CPU') : couch ? 'Player ' + (m.id === 'p2' ? 2 : 1) : m.p.n;
        const rows = (couch ? members.slice().sort((a, b) => (a.id < b.id ? -1 : 1)) : members).map((m) => {
          const c = CLASS_BY_ID[m.p.c] || cls, st = g.bot && !m.me ? CPU_LEVELS[Math.max(0, Math.min(3, g.settings.cpuLevel ?? 1))] : m.p.rdy ? 'Ready' : m.p.ig ? 'In game' : m.p.host && !couch ? 'Host' : 'Picking';
          return `<div class="pl-row${m.me ? ' me' : ''}${m.p.rdy ? ' rdy' : ''}" style="--cc:${c.css}"><i class="pl-ic">${ICONS[c.element]}</i><b>${esc(nm(m))}</b>${m.p.host ? '<span class="pl-crown" title="Host">👑</span>' : ''}<em>${st}</em></div>`;
        }).join('');
        const wait = g.couchWait ? '<div class="pl-row wait"><i class="pl-ic">＋</i><b>Player 2</b><em>Press a button on a controller</em></div>' : '';
        const html = `<h4>Party <small>${members.length}${g.party.kind === 'solo' || couch || g.bot ? '' : ' / ' + CONFIG.maxPlayers}</small></h4>` + rows + wait;
        if (pl._h !== html) { pl._h = html; pl.innerHTML = html; }
      }
    }
    this.$('#members').innerHTML = couch
      ? members.slice().sort((a, b) => (a.id < b.id ? -1 : 1)).map((m) => memberHtml(m, m.id === 'p2' ? 2 : 1)).join('')
      : members.map((m) => memberHtml(m, 0)).join('') + (g.party.kind === 'solo' ? '' : `<div class="member empty-slot">${members.length}/5 · waiting for friends</div>`);
    this.$('#round-len').disabled = !g.isHost;
    const online = g.party.kind !== 'solo' && g.party.kind !== 'local';
    this.$('#vis-field').style.display = online ? '' : 'none';
    this.$('#party-vis').disabled = !g.isHost;
    this.$('#party-vis').value = (g.isHost ? g.partyPublic !== false : !(host && host.p.lb && host.p.lb.pub === 0)) ? 'pub' : 'priv';
    if (!g.isHost) this.$('#round-len').value = String(hostRl);
    this.$('#difficulty').disabled = !g.isHost;
    if (!g.isHost) this.$('#difficulty').value = host && host.p.lb && host.p.lb.hd ? 'hard' : 'normal';
    // A controller that drops out mid-lobby would leave a controller seat unable to ready up: say so on both seats.
    const warn = this.$('#couch-warn');
    const lost = couch && g.padLost();
    warn.textContent = lost ? (g.seat === 2 ? 'Your controller is not connected. Reconnect it and press any button.' : 'Player 2\'s controller is not connected. Reconnect it and press any button on it.') : '';
    warn.style.display = lost ? '' : 'none';
    const cn = this.$('#couch-name');
    if (cn && document.activeElement !== cn && cn.value !== g.settings.name) cn.value = g.settings.name;
    const btn = this.$('#btn-ready');
    if (this.cpuFlow() && !g.ready && !this.cpuDone && !((host && host.p.cd) || 0)) {
      if (!armed) btn.textContent = g._cpuPick ? 'Pick 3 items for the CPU' : 'Pick 3 items to ready up';
      else btn.innerHTML = g._cpuPick ? 'Ready Up' : 'Choose CPU ▶';
      btn.disabled = !armed; btn.classList.remove('is-ready', 'waiting');
      return;
    }
    if (couch) {
      // One shared rule for both seats: everyone picks two weapons and presses Ready; the run then starts on a short countdown.
      const other = members.filter((m) => !m.me)[0];
      const cd = (host && host.p.cd) || 0;
      const waitFor = other && !other.p.rdy && !g.bot ? 'PLAYER ' + (other.id === 'p2' ? 2 : 1) : '';
      if (!armed) btn.textContent = 'Pick 3 items to ready up';
      else if (cd) btn.innerHTML = `${duel ? 'Duel' : 'Starting'} in ${cd}…<small>Press to cancel</small>`;
      else if (g.ready) btn.innerHTML = `Ready ✓<small>${waitFor ? 'Starts when both are ready · press to cancel' : 'Press to cancel'}</small>`;
      else btn.innerHTML = `Ready up<small>${waitFor || g.bot ? '' : 'The other player is ready'}</small>`;
      btn.disabled = !armed;
      btn.classList.toggle('is-ready', armed && g.ready);
      btn.classList.remove('waiting');
      return;
    }
    if (g.couchWait && duel) { btn.textContent = 'Waiting for Player 2'; btn.disabled = true; btn.classList.remove('is-ready', 'waiting'); return; }
    const wait = g.isHost ? members.filter((m) => !m.me && !m.p.rdy).length : 0;
    if (!armed) btn.textContent = 'Pick 3 items to ready up';
    else if (g.isHost) btn.innerHTML = wait ? `${startWord}<small>${wait} ${wait > 1 ? 'players still need' : 'player still needs'} to ready up</small>` : startWord;
    else btn.textContent = g.ready ? 'Ready ✓' : this.lateJoin() ? 'Ready Up' : 'Ready up';
    btn.disabled = !armed;
    btn.classList.toggle('is-ready', !g.isHost && g.ready);
    btn.classList.toggle('waiting', armed && g.isHost && wait > 0);
  }

  // ---------------- settings ----------------
  bindSettings() {
    const g = this.game;
    this.$('#set-quality').onchange = (e) => { g.settings.quality = e.target.value; g.saveSettings(); this.setState(); };
    this.$('#set-sens').oninput = (e) => { g.settings.sens = +e.target.value; this.$('#sens-val').textContent = (+e.target.value).toFixed(2); g.saveSettings(); };
    this.$('#set-vol').oninput = (e) => { g.settings.vol = +e.target.value; g.saveSettings(); };
    this.$('#set-fps').onchange = (e) => { g.settings.fps = e.target.checked; g.saveSettings(); };
    this.$('#set-blood').onchange = (e) => { g.settings.hudBlood = e.target.checked; g.saveSettings(); };
    const bind = (id, key, kind) => { const el = this.$('#' + id); if (!el) return; el[kind === 'check' ? 'onchange' : kind === 'select' ? 'onchange' : 'oninput'] = (e) => { g.settings[key] = kind === 'check' ? e.target.checked : kind === 'select' ? e.target.value : +e.target.value; g.saveSettings(); if (key === 'layout') { g.settings.layoutChosen = true; this.renderControls(); } this.settingsVals(); this.refreshHints(); }; };
    bind('set-layout', 'layout', 'select'); bind('set-sens-ads', 'sensAds'); bind('set-invert', 'invertY', 'check'); bind('set-music', 'music', 'check'); bind('set-music-vol', 'musicVol');
    bind('set-sfx', 'sfx', 'check'); bind('set-ui-scale', 'uiScale'); bind('set-cb', 'cb', 'select'); bind('set-xh', 'xh', 'select'); bind('set-xh-size', 'xhSize');
    this.$$('#set-nav button').forEach((b) => (b.onclick = () => { g.audio.play('ui'); this.setCat(b.dataset.cat); }));
    this.applyLook(); bind('set-fov', 'fov'); bind('set-shake', 'shake', 'check'); bind('set-dmgnums', 'dmgNums', 'check');
    this.$('#set-view').onchange = (e) => this.setView(e.target.value);
    // Controls screen: pictures of each device, remapping. Remaps are saved with the settings.
    if (g.seat === 1) { loadBinds(g.settings.binds); applyBindLabels(); }
    const openCtl = (fromPause) => {
      if (!this.ctlScreen) this.ctlScreen = new ControlsScreen(this.$('#controls'), {
        sound: () => g.audio.play('ui'),
        onChange: () => { g.settings.binds = bindsJSON(); if (g.draft) { const put = (k) => { try { const o = JSON.parse(this[k]); o.binds = g.settings.binds; this[k] = JSON.stringify(o); return o; } catch { return null; } }; put('setSnap'); const st = put('setSaved'); if (st) g.storeSettings(st); } else g.saveSettings(); applyBindLabels(); this.refreshHints(); },
        onClose: () => { this.$('#pause').classList.remove('under'); },
      });
      if (fromPause) this.$('#pause').classList.add('under');
      this.ctlScreen.open(g.pad && g.pad.active ? (g.settings.layout === 'xbox' ? 'xbox' : 'ds') : 'kb');
    };
    this.$('#pause-controls').onclick = () => { g.audio.play('ui'); openCtl(true); };
    this.$('#set-controls').onclick = () => { g.audio.play('ui'); openCtl(false); };
    this.$$('#view-toggle button').forEach((b) => (b.onclick = () => { g.audio.play('ui'); this.setView(b.dataset.view); }));
    this.setView(g.settings.view || 'third', true);
    this.$('#settings-apply').onclick = () => { g.audio.play('ui'); this.applyDraft(false); };
    this.$('#settings-save').onclick = () => { g.audio.play('ui'); this.applyDraft(true); };
    this.$('#s-settings').addEventListener('input', () => this.setState());
    this.$('#s-settings').addEventListener('change', () => this.setState());
    this.refreshHints();
  }
  setView(v, quiet) {
    const g = this.game;
    g.settings.view = v === 'first' ? 'first' : 'third';
    if (!quiet) g.saveSettings();
    this.$$('#view-toggle button').forEach((b) => b.classList.toggle('on', b.dataset.view === g.settings.view));
    this.$('#set-view').value = g.settings.view;
  }
  openSettings(back) {
    const g = this.game;
    this.screen('s-settings');
    this.setCat('controls');
    this.$('#settings-back').dataset.back = back;
    { const hb = this.$('#s-settings .home-btn'); if (hb) hb.style.display = back === 'game' ? 'none' : ''; }
    // Draft mode: changes are tried out live, Apply keeps them for this session, Save stores them for good.
    g.draft = true; g.draftDirty = false;
    this.setSnap = JSON.stringify(g.settings);   // what Back returns to
    this.setSaved = this.setSaved || this.setSnap; // what is stored on this device
    const leave = (to) => {
      const bb = this.$('#settings-back');
      if (g.draftDirty && !bb.dataset.armed) {
        bb.dataset.armed = '1'; bb.textContent = 'Leave without applying?'; bb.classList.add('warn');
        this.toast('You have changes that are not applied. Press Apply or Save settings to keep them.', '');
        clearTimeout(this.backT); this.backT = setTimeout(() => this.setState(), 4000);
        return;
      }
      if (g.draftDirty) this.revertDraft();
      g.draft = false; g.draftDirty = false; clearTimeout(this.backT);
      if (to === 'game') { this.screen(null); this.$('#pause').classList.add('on'); } else this.screen(to);
    };
    this.$('#settings-back').onclick = () => { g.audio.play('ui'); leave(back); };
    { const hb = this.$('#s-settings .home-btn'); if (hb) hb.onclick = () => { g.audio.play('ui'); leave('s-title'); }; }
    this.setState();
    this.$('#set-quality').value = g.settings.quality;
    this.$('#set-sens').value = g.settings.sens;
    this.$('#sens-val').textContent = (+g.settings.sens).toFixed(2);
    this.$('#set-vol').value = g.settings.vol;
    this.$('#set-fps').checked = !!g.settings.fps;
    this.$('#set-blood').checked = g.settings.hudBlood === true;
    this.settingsVals();
    this.renderAccounts();
  }

  // Settings > Accounts, Admin only: every user profile on this device with a Delete button (press twice to confirm).
  renderAccounts() {
    const box = this.$('#set-accounts');
    if (!box) return;
    const admin = Profile.isAdmin() && this.game.seat === 1;
    box.style.display = admin ? '' : 'none';
    { const nb = this.$('#set-nav-acc'); if (nb) nb.style.display = admin ? '' : 'none'; }
    if (!admin) return;
    const users = Profile.users();
    const list = this.$('#acc-list');
    list.innerHTML = users.length
      ? users.map((u) => `<div class="acc-row"><b>${esc(u.name)}</b><span>${u.created ? new Date(u.created).toLocaleDateString() : ''}</span><button class="btn small danger" data-del="${esc(u.id)}">${u.local ? 'Delete' : 'Remove from this device'}</button></div>`).join('')
      : '<p class="muted">You are signed in as Admin. No player profiles have been saved on this device yet.</p>';
    list.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
      if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Press again to delete'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Delete'; } }, 3000); return; }
      const u = users.find((x) => x.id === b.dataset.del);
      if (Profile.deleteUser(b.dataset.del)) this.toast((u && !u.local ? 'Removed ' : 'Deleted ') + (u ? u.name : 'the account'), 'good');
      this.renderAccounts();
    }));
  }
  // Settings > Button guide: every control for each controller type (opens on the layout picked above).
  renderControls(l) {
    l = l || this.game.settings.layout || 'ds';
    const P = {
      ds: { a: '✕', b: '○', x: '□', y: '△', lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2', l3: 'L3', r3: 'R3', view: 'Share', menu: 'Options', ls: 'Left stick', rs: 'Right stick' },
      xbox: { a: 'A', b: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT', l3: 'LS click', r3: 'RS click', view: 'View', menu: 'Menu', ls: 'Left stick', rs: 'Right stick' },
    };
    const rows = l === 'kb' ? [
      ['W A S D', 'Move'], ['Mouse', 'Look and aim'], ['Left click', 'Attack / fire (melee alternates slash and stab)'], ['Right click or C', 'Aim down sights, or block with a melee weapon'],
      ['Shift', 'Sprint'], ['Space', 'Jump (again in the air: Web Swing, double-tap: Jet Pack)'], ['X', 'Dash'], ['Q', 'Element ability'], ['G', 'Third ability'], ['F', 'Ultimate'],
      ['1 2 3 or wheel', 'Swap weapon'], ['R', 'Reload'], ['E', 'Open crate, use altar, take a power-up'], ['B', 'Place bed'], ['V', 'First / third person'], ['Tab', 'Shop'], ['Esc', 'Pause menu'],
    ] : (() => { const k = P[l] || P.ds; return [
      [k.ls, 'Move'], [k.l3, 'Sprint on/off (with the Jet Pack lit: go down)'], [k.rs, 'Look and aim'], [k.rt, 'Attack / fire (melee alternates slash and stab)'], [k.lt, 'Aim down sights, or hold to block (tap just before a hit to parry)'],
      [k.a, 'Jump (again in the air: Web Swing, double-tap: Jet Pack)'], [k.b, 'Dash'], [k.x, 'Reload, open crate, use altar, take a power-up'], [k.lb, 'Element ability'], [k.y, 'Third ability'], [k.rb, 'Ultimate'],
      ['D-pad ◀ ▶', 'Swap weapon'], ['D-pad ▼', 'Game speed'], ['D-pad ▲', 'CPU takes over / hand back (CPU Run only)'], [k.r3, 'First / third person'], [k.lt + ' + ' + k.r3, 'Place bed'], [k.view, 'Shop'], [k.menu, 'Pause menu'],
    ]; })();
    const list = this.$('#ctl-list');
    if (list) list.innerHTML = rows.map(([key, d]) => '<div class="ctl-row"><kbd>' + key + '</kbd><span>' + d + '</span></div>').join('');
    this.$$('#ctl-tabs button').forEach((x) => x.classList.toggle('sel', x.dataset.l === l));
  }
  // Settings footer: says whether anything is waiting for Apply or Save.
  setState() {
    const g = this.game, st = this.$('#set-state'), bb = this.$('#settings-back');
    if (!st) return;
    const cur = JSON.stringify(g.settings), unapplied = !!g.draftDirty && cur !== this.setSnap, unsaved = cur !== this.setSaved;
    if (!unapplied) g.draftDirty = false;
    st.textContent = unapplied ? 'Changes not applied yet' : unsaved ? 'Applied for this session. Press Save settings to keep them' : 'All settings saved';
    st.dataset.s = unapplied ? 'dirty' : unsaved ? 'applied' : 'saved';
    this.$('#settings-apply').disabled = !unapplied;
    this.$('#settings-save').disabled = !unsaved;
    this.$('#quality-note').style.display = unapplied && g.settings.quality !== JSON.parse(this.setSnap || '{}').quality ? '' : 'none';
    if (bb) { delete bb.dataset.armed; bb.textContent = 'Back'; bb.classList.remove('warn'); }
  }
  // Apply (keep for this session) or Save (store for good). Graphics quality switches here, with no reload.
  applyDraft(store) {
    const g = this.game;
    const switched = g.setQuality(g.settings.quality);
    g.applySettings(); this.applyLook();
    this.setSnap = JSON.stringify(g.settings); g.draftDirty = false;
    if (store) { g.saveSettings(true); this.setSaved = this.setSnap; }
    this.setState();
    const qn = { high: 'High', medium: 'Medium', low: 'Low' }[g.settings.quality] || '';
    this.toast((store ? 'Settings saved' : 'Settings applied') + (switched ? '. Graphics now on ' + qn : ''), 'good');
  }
  // Leaving without Apply: everything goes back to how it was when Settings opened (or was last applied).
  revertDraft() {
    const g = this.game;
    let o; try { o = JSON.parse(this.setSnap); } catch { return; }
    for (const k of Object.keys(g.settings)) delete g.settings[k];
    Object.assign(g.settings, o);
    g.setQuality(g.settings.quality);
    g.applySettings(); this.setView(g.settings.view || 'third', true); this.applyLook(); this.refreshHints();
  }
  setCat(cat) {
    this.$$('#set-nav button').forEach((x) => x.classList.toggle('sel', x.dataset.cat === cat));
    this.$$('#s-settings .set-pane').forEach((x) => x.classList.toggle('on', x.dataset.cat === cat));
  }
  // UI scale, colourblind mode and crosshair: applied straight away, on this seat's screen.
  applyLook() {
    const S = this.game.settings, sc = Math.min(1.3, Math.max(0.8, +S.uiScale || 1)), xs = Math.min(2.2, Math.max(0.6, +S.xhSize || 1)), xh = S.xh || 'cross';
    if (this.game.seat === 1) {
      document.documentElement.style.setProperty('--ui', sc);
      document.documentElement.style.setProperty('--uis', sc);
      document.documentElement.style.fontSize = (16 * sc) + 'px';
      const cb = S.cb && S.cb !== 'off' ? S.cb : '';
      if (cb) document.documentElement.dataset.cb = cb; else delete document.documentElement.dataset.cb;
    }
    const hud = this.$('#hud'); if (hud) { hud.dataset.xh = xh; hud.style.setProperty('--xhs', xs); }
    const demo = this.$('#xh-demo'); if (demo) { demo.dataset.xh = xh; demo.style.setProperty('--xhs', xs); }
  }
  // The value readouts and the rest of the Settings controls.
  settingsVals() {
    const S = this.game.settings, $ = (id) => this.$('#' + id);
    const set = (id, v, lbl, txt) => { const el = $(id); if (!el) return; if (el.type === 'checkbox') el.checked = !!v; else el.value = v; if (lbl && $(lbl)) $(lbl).textContent = txt; };
    set('set-layout', S.layout || 'ds');
    set('set-ui-scale', S.uiScale ?? 1, 'ui-scale-val', Math.round((S.uiScale ?? 1) * 100) + '%'); set('set-cb', S.cb || 'off'); set('set-xh', S.xh || 'cross'); set('set-xh-size', S.xhSize ?? 1, 'xh-size-val', Math.round((S.xhSize ?? 1) * 100) + '%');
    this.applyLook();
    set('set-sens-ads', S.sensAds ?? 1, 'sens-ads-val', (S.sensAds ?? 1).toFixed(2) + 'x');
    set('set-invert', S.invertY === true);
    set('set-music', S.music !== false); { const mv = $('set-music-vol'); if (mv) { mv.disabled = S.music === false; mv.closest('.field').classList.toggle('off', S.music === false); } } set('set-music-vol', S.musicVol ?? 1, 'music-vol-val', Math.round((S.musicVol ?? 1) * 100) + '%');
    set('set-sfx', S.sfx !== false);
    set('set-fov', S.fov || 70, 'fov-val', String(Math.round(S.fov || 70)));
    set('set-shake', S.shake !== false); set('set-dmgnums', S.dmgNums !== false);
    set('set-vol', S.vol, 'vol-val', Math.round(S.vol * 100) + '%');
    this.setState();
  }

  // ---------------- game ----------------
  bindGame() {
    const g = this.game;
    this.$('#pause-resume').onclick = () => { g.paused = false; g.lockPointer(); };
    this.$('#pause-settings').onclick = () => { this.$('#pause').classList.remove('on'); this.openSettings('game'); };
    const sure = (on) => this.$('#pause').classList.toggle('asking', on);
    this.$('#pause-leave').onclick = () => {
      g.audio.play('ui');
      const local = g.party && g.party.kind === 'local' && !g.bot, online = g.party && g.party.kind !== 'solo' && !local && !g.bot;
      this.$('#pause-sure-note').textContent = local ? (g.seat === 2 ? 'You leave couch co-op. Player 1 carries on alone.' : 'This ends the run for both players.') : online ? 'You leave the party and go back to the main menu. The others keep playing.' : 'Your run will end and you go back to the main menu.';
      sure(true);
      const no = this.$('#pause-no'); if (g.pad && g.pad.active) setFocus(this.$('#pause'), no);
    };
    this.$('#pause-no').onclick = () => { g.audio.play('ui'); sure(false); };
    this.$('#pause-yes').onclick = () => { sure(false); g.paused = false; this.$('#pause').classList.remove('on'); g.leaveParty(); };
    this.$('#shop-close').onclick = () => g.toggleShop(false);
    this.$('#sq-yes').onclick = () => { g.audio.play('ui'); g.answerSpace(true); };
    this.$('#sq-no').onclick = () => { g.audio.play('ui'); g.answerSpace(false); };
    this.$('#sum-lobby').onclick = () => { this.$('#summary').classList.remove('on'); g.backToLobby(); };
    this.$('#sum-menu').onclick = () => { this.$('#summary').classList.remove('on'); g.leaveParty(); };
    this.$$('#vote [data-vote]').forEach((b) => (b.onclick = () => g.castVote(b.dataset.vote)));
  }

  showGame() {
    this.screen(null);
    this.$('#hud').classList.add('on');
    this.$('#summary').classList.remove('on');
    this.$('#vote').classList.remove('on');
    this.$('#bless').classList.remove('on');
    this.$('#shop').classList.remove('on');
    this.$('#bossbar').classList.remove('on');
    this.$('#killfeed').innerHTML = '';
    this.couchKeysCard();
    const p = this.game.loadout;
    const cls = this.game.myClass();
    this.root.style.setProperty('--class', cls.css);
    this.$('#ab-q .ab-icon').innerHTML = AB_ICONS[cls.q.id] || ICONS[cls.element];
    this.$('#ab-r .ab-icon').innerHTML = AB_ICONS[cls.r.id] || ICONS[cls.element];
    this.$('#ab-d .ab-icon').innerHTML = AB_ICONS.dash;
    this.$('#ab-e .ab-icon').innerHTML = AB_ICONS[cls.e.id] || ICONS[cls.element];
    this.$('#ab-e .ab-name').textContent = cls.e.name;
    this.$('#ab-q .ab-name').textContent = cls.q.name;
    this.$('#ab-r .ab-name').textContent = cls.r.name;
    this.padHints();
  }

  setLocked(locked, uiOpen) {
    const g = this.game;
    const show = !locked && !g.inputLive() && !uiOpen && g.mode === 'game' && !this.$('#summary').classList.contains('on') && this.root.dataset.screen !== 's-settings';
    this.$('#pause').classList.toggle('on', show);
    if (g.party && (g.alone || g.bot)) { g.paused = show; if (g.seat !== 2) g.audio.pauseMusic(show); } // a fight against the CPU stops for the pause menu too
    const local = g.party && g.party.kind === 'local' && !g.bot;
    this.$('#pause-sub').textContent = local ? 'Player ' + g.seat + ' menu' : g.party && !g.alone && !g.bot ? 'The run keeps going while you are here.' : 'Paused';
    this.$('#pause').classList.remove('asking');
    this.$('#pause-note').textContent = !local ? '' : g.seat === 2 ? 'Player 1 keeps playing. Leaving puts Player 1 back in a solo run.' : 'Player 2 keeps playing. Ending couch co-op stops the run for both players.';
    if (!this.confirmTimer) this.$('#pause-leave').textContent = local ? (g.seat === 2 ? 'Leave couch co-op' : 'End couch co-op') : 'Leave run';
    if (show) this.renderShare();
  }

  // Pause menu: share PC with teammates in steps of 10.
  renderShare() {
    const g = this.game, box = this.$('#pause-share');
    if (!box) return;
    const mates = g.party ? g.party.peers().filter((q) => !q.me && q.p && q.p.ig) : [];
    this.shareAmt = this.shareAmt || {};
    if (!mates.length || !g.player) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="share-head">Share PC <b>' + Math.floor(g.player.pc) + '</b></div>' + mates.map((q) => {
      const a = this.shareAmt[q.id] || 10;
      return '<div class="share-row" data-id="' + q.id + '"><span class="share-name">' + String(q.p.n || 'Runner').replace(/[<>&]/g, '') + '</span>' +
        '<button class="btn sm share-dn">−10</button><b class="share-amt">' + a + '</b><button class="btn sm share-up">+10</button><button class="btn sm primary share-go">Give</button></div>';
    }).join('');
    box.querySelectorAll('.share-row').forEach((row) => {
      const id = row.dataset.id;
      const set = (v) => { this.shareAmt[id] = Math.max(10, Math.min(1000, v)); this.renderShare(); };
      row.querySelector('.share-dn').onclick = () => set((this.shareAmt[id] || 10) - 10);
      row.querySelector('.share-up').onclick = () => set((this.shareAmt[id] || 10) + 10);
      row.querySelector('.share-go').onclick = () => {
        const a = this.shareAmt[id] || 10;
        if (g.giftPC(id, a)) { this.toast('Shared ' + a + ' PC', 'good'); this.renderShare(); } else this.toast('Not enough PC', 'bad');
      };
    });
  }

  waiting(on) { this.$('#waiting').classList.toggle('on', on); }

  minimapBase(canvas) { this.mmBase = canvas; }

  updateHud(dt) {
    const g = this.game, p = g.player;
    if (!p) return;
    // Every frame: bars and cooldowns.
    const hpF = Math.max(0, p.hp / p.stats.maxHp);
    this.setW('#hp-fill', hpF);
    const sh = p.eyeOn() ? (p.eye.until - g.now) / p.eye.dur : p.shield.until > g.now ? (p.shield.rock ? (p.shield.until - g.now) / (p.shield.dur || 10) : p.shield.hp / 200) : 0;
    this.setW('#hp-shield', Math.min(1, sh));
    this.setT('#hp-text', Math.ceil(p.hp) + ' / ' + Math.round(p.stats.maxHp));
    this.setC(this.root, 'lowhp', hpF < 0.3 && p.alive);
    for (const k of ['d', 'q', 'e', 'r']) {
      const cd = p.cds[k], max = (k === 'd' ? DASH.cd : p.cls[k].cd) * p.stats.cdr * p.stats.mast[k].cd;
      const el = this.$k('#ab-' + k);
      const cdv = cd > 0 ? Math.round((cd / max) * 360) + 'deg' : '0deg';
      if (el._cd !== cdv) { el._cd = cdv; el.style.setProperty('--cd', cdv); }
      this.setC(el, 'ready', cd <= 0);
      this.setT(el._n ||= this.$('.ab-cd', el), cd > 0 ? Math.ceil(cd) : '');
    }
    const wp = p.weapon;
    // Three slots: two weapons and the tier-3 gear (a passive piece shows what it does instead of ammo).
    (this._ws && this._ws[0].isConnected ? this._ws : (this._ws = this.$$('.wslot'))).forEach((el, i) => {
      const w = WEAPON_BY_ID[p.weapons[i]];
      const disp = w ? '' : 'none';
      if (el._d !== disp) { el._d = disp; el.style.display = disp; }
      if (!w) return;
      const gear = w.kind === 'gear';
      this.setC(el, 'cur', i === p.cur);
      this.setC(el, 'gear', gear);
      if (el.dataset.w !== w.id) {
        el.dataset.w = w.id;
        const shot = (g.menu.weaponShots(g.renderer) || {})[w.id];
        this.$('.ws-img', el).style.backgroundImage = shot ? `url(${shot})` : '';
      }
      this.setT(el._nm ||= this.$('.ws-name', el), w.name);
      this.setT(el._am ||= this.$('.ws-ammo', el), w.deploy && p.turret ? 'Up · ' + Math.ceil(p.turret.life) + ' s' : gear ? (w.id === 'turret' ? (p.turret ? 'Up · ' + Math.ceil(p.turret.life) + ' s' : p.turretCd > 0 ? 'Ready in ' + Math.ceil(p.turretCd) + ' s' : w.hud) : (w.hud || 'Passive')) : w.summon || w.heal ? (p.staffCd > 0 ? 'Ready in ' + Math.ceil(p.staffCd) + ' s' : w.heal ? 'Raise to heal' : 'Slam to summon') : w.kind === 'melee' || w.bow || (w.kind === 'gun' && muOn(BOTTOMLESS)) ? '∞' : (i === p.cur && p.reloadT > 0 ? (w.cool ? 'Cooling' : w.energy ? 'Recharging' : 'Reloading') : w.energy ? Math.round(p.ammo[i] / p.magOf(w) * 100) + '% charge' : p.ammo[i] + ' / ' + p.magOf(w)));
    });
    // Charge bar of an energy weapon (Pulse Cannon, Laser Vision).
    const eb = this.$k('#energybar'), en = !!wp.energy && p.alive;
    this.setC(eb, 'on', en);
    if (en) {
      const rc = p.reloadT > 0, f = Math.max(0, Math.min(1, rc ? 1 - p.reloadT / (p.reloadDur || 1) : p.ammo[p.cur] / p.magOf(wp)));
      this.setW('#energy-fill', f);
      this.setC(eb, 'low', !rc && f < 0.25);
      this.setC(eb, 'charging', rc);
      this.setC(eb, 'laser', !!wp.eyes);
      const txt = (rc ? (wp.cool ? 'COOLING ' : 'RECHARGING ') : (wp.bar || 'CHARGE') + ' ') + Math.round(f * 100) + '%';
      if (txt !== this.energyTxt) { this.energyTxt = txt; this.$('#energy-text').textContent = txt; }
    }
    const fpv = g.settings.view === 'first' || !!g.fpNow;
    const adsF = p.alive ? p.ads : 0;
    const scopedW = !!wp.scope;
    { const wk = p.board ? Math.round((p.windK || 0) * 20) / 20 : 0, we = this.$k('#wind'); if (we && we._k !== wk) { we._k = wk; we.style.opacity = wk * 0.85; } }
    const chc = (wp.kind === 'melee' ? 'melee' : '') + (adsF > 0.5 ? (fpv ? (scopedW ? ' ads scoped' : ' ads') : ' ads-tp') : ''), ch = this.$k('#crosshair');
    if (ch._k !== chc) { ch._k = chc; ch.className = chc; }
    const so = '0', sc = this.$k('#scope'); // the black scope overlay is gone: scoped guns show a real scope picture (scope.js)
    if (sc._o !== so) { sc._o = so; sc.style.opacity = so; }
    // Throttled text.
    this.lastHud -= dt;
    if (this.lastHud > 0) return;
    this.lastHud = 0.1;
    const b = g.world.biome;
    this.setC(this.root, 'duelmode', !!g.duel);
    this.setT('#round-label', g.duel ? 'Duel Arena · ' + b.name : ((g.round || 0) >= CONFIG.rounds ? 'Bonus round' : 'Round ' + ((g.round || 0) + 1) + ' / ' + CONFIG.rounds) + ' · ' + b.name);
    const ph = g.phase;
    const timerText = g.duel ? fmtTime(g.tl || 0) : ph === 'play' ? (g.endless ? '∞' : g.tl <= 0 ? 'DEATH' : fmtTime(g.tl)) : ph === 'vote' ? fmtTime(g.tl) : ph === 'boss' ? 'BOSS' : ph === 'demon' ? 'RUN' : ph === 'bless' || ph === 'sproam' ? fmtTime(g.tl) : ph === 'extract' ? 'EXTRACT' : '';
    this.setT('#timer', timerText);
    this.setC('#timer', 'urgent', (g.duel && ph === 'duel' && g.tl < 30) || (ph === 'play' && !g.endless && g.tl < 30) || (ph === 'play' && !!g.views.demon) || ph === 'vote' || ph === 'demon');
    this.setT('#phase-hint', g.duel ? (ph === 'duel' ? 'Next power-up in ' + Math.max(0, Math.ceil(g.dpt || 0)) + 's · first one down loses' : ph === 'dpick' ? 'Choose your power-up' : ph === 'dcount' ? 'Get ready' : '') : ph === 'play' ? (g.world && g.world.biome.id === 'space' ? 'Hunt, Loot, Survive' : g.endless && !g.views.demon ? 'Endless: hunt as long as you like, then hold ' + this.ctl('use') + ' at the altar to call the boss' : g.views.demon ? 'Death is hunting you. Hold ' + this.ctl('use') + ' at the altar to summon the boss, or kill her' : 'Hunt, Loot, Survive') : ph === 'boss' ? 'Defeat the boss' : ph === 'demon' ? 'Death is hunting you' : ph === 'bless' ? 'Choose a Deity Blessing' : ph === 'sproam' ? 'Free roam: open crates and hire NPCs before the ship leaves for space' : '');
    this.setT('#pc', p.pc);
    this.setT('#kills', p.totalKills);
    this.setT('#beds', p.beds);
    { const bp = this.$k('#bed-placed'), v = p.bedPos ? '' : 'none'; if (bp._d !== v) { bp._d = v; bp.style.display = v; } }
    // Jetpack fuel (only when you own it and have it switched on).
    const jf = this.$k('#jetfuel');
    const jon = p.jetEquipped(), won = !jon && p.hasGear('wings');
    this.setC(jf, 'on', jon || won);
    if (jon) { this.setW('#jet-fill', (p.jet.fuel / JET.fuel)); this.setC(jf, 'low', p.jet.fuel < JET.fuel * 0.22); }
    else if (won) { this.setW('#jet-fill', (p.wing.stam / WING.stam)); this.setC(jf, 'low', p.wing.stam < WING.stam * 0.22); this.setT(jf._sp ||= jf.querySelector('span'), 'WINGS · ' + this.ctl('dash') + ' flap · hold ' + this.ctl('sprint') + ' in the air to soar'); }
    let tag = this.$('#speedtag');
    if (!tag) { tag = document.createElement('div'); tag.id = 'speedtag'; this.$('#hud').appendChild(tag); }
    const spd = g.steps || 1;
    if (tag.dataset.n !== String(spd)) {
      // A big badge in the upper right: it stays while the game runs fast and flashes "normal" when it ends.
      const was = +(tag.dataset.n || 1);
      tag.dataset.n = String(spd);
      clearTimeout(this.speedT);
      if (spd > 1 || was > 1) {
        tag.innerHTML = spd > 1 ? '<i>' + '▶'.repeat(spd) + '</i><b>' + spd + 'x</b><small>SPEED</small>' : '<i>▶</i><b>1x</b><small>NORMAL SPEED</small>';
        tag.className = 'on ' + (spd > 1 ? 'fast' : 'norm');
        tag.style.animation = 'none'; void tag.offsetWidth; tag.style.animation = '';
        if (spd === 1) this.speedT = setTimeout(() => (tag.className = ''), 1600);
      } else tag.className = '';
    }
    // XP bar and power-up chips.
    // While an elemental pick is waiting the bar stays full; it empties once the player has chosen.
    const hold = p.elemPending > 0;
    const xpf = hold ? 1 : Math.min(1, p.xp / p.xpNeed);
    this.setW('#xp-fill', xpf);
    this.setT('#xp-text', 'LV ' + (p.level + 1 - p.elemPending));
    this.setT('#xp-pct', hold ? 'LEVEL UP!' : '');
    { const xb = this.$('#xpbar'), near = xpf >= 0.85 && !hold; if (xb && xb._near !== near) { xb._near = near; xb.classList.toggle('near', near); } }
    // Each XP gain makes the bar flash and its tip spark.
    if (this._xpLast !== undefined && p.xp > this._xpLast && !hold) { const xb = this.$('#xpbar'); if (xb) { xb.classList.remove('gain'); void xb.offsetWidth; xb.classList.add('gain'); } }
    this._xpLast = p.xp;
    const pk = p.powerups.length + ':' + p.level;
    if (pk !== this.puKey) {
      this.puKey = pk;
      const cnt = new Map(); for (const q of p.powerups) cnt.set(q.id, (cnt.get(q.id) || 0) + 1);
      // Only the 8 power-ups you hold most of stay on screen; the rest fold into "+N" (the pause menu lists them all).
      const all = [...cnt].sort((a, b) => b[1] - a[1]), top = all.slice(0, 8), more = all.length - top.length;
      this.setH('#powerups', top.map(([id, n]) => { const q = POWERUP_BY_ID[id], i = puInfo(q, p.cls); return `<span class="${hasPuIcon(q) ? 'pi' : ''}" title="${esc(i.name + ': ' + i.desc)}">${hasPuIcon(q) ? puIcon(q) : q.icon || '•'}${n > 1 ? '<b>×' + n + '</b>' : ''}</span>`; }).join('') + (more > 0 ? `<span class="pu-more" title="${esc(all.slice(8).map(([id, n]) => puInfo(POWERUP_BY_ID[id], p.cls).name + (n > 1 ? ' ×' + n : '')).join(', '))}">+${more}</span>` : ''));
    }
    this.setH('#blessings', p.blessings.map((x) => `<span title="${esc(x.name + ': ' + x.desc)}">${x.icon}</span>`).join(''));
    this.setT('#fps', g.settings.fps ? (g.fps || '') + ' FPS' + (g.gov ? ' · ' + g.gov.name + (g.gov.gpu ? ' · ' + g.gov.gpu : '') : '') : '');
    // Boss bar. In a duel it shows the other fighter.
    const bv = g.views.boss;
    let opp = null;
    if (g.duel) for (const v of g.views.players.values()) { opp = v; break; }
    this.setC('#bossbar', 'duel', !!opp);
    // A champion (mini boss) nearby borrows the boss bar when no boss is out.
    let champ = null;
    if (!bv && !g.views.demon && g.player) {
      let best = 55;
      for (const mv of g.views.mobs.values()) { if (!mv.mini) continue; const d = Math.hypot(mv.x - g.player.pos.x, mv.z - g.player.pos.z); if (d < best) { best = d; champ = mv; } }
    }
    this.setC('#bossbar', 'on', !!opp || !!bv || !!g.views.demon || !!champ);
    if (opp) { this.$('#boss-name').textContent = opp.name + ' · ' + Math.ceil(opp.hp) + ' / ' + Math.round(opp.mh); this.setW('#boss-fill', Math.max(0, opp.hp / opp.mh)); this.$('#bossbar').classList.remove('demon'); }
    else if (bv) { this.$('#boss-name').textContent = bv.def.name; this.setW('#boss-fill', bv.hp); this.$('#bossbar').classList.remove('demon'); }
    else if (g.views.demon) { this.$('#boss-name').textContent = 'Death'; this.setW('#boss-fill', g.views.demon.hp); this.$('#bossbar').classList.add('demon'); }
    else if (champ) { this.$('#boss-name').textContent = 'Champion ' + champ.base.name; this.setW('#boss-fill', champ.hp); this.$('#bossbar').classList.remove('demon'); }
    // Party.
    const peers = g.party.peers().filter((x) => !x.me && x.p && x.p.ig);
    this.setH('#party', peers.map((x) => {
      const c = CLASS_BY_ID[x.p.c] || CLASSES[0];
      const f = Math.max(0, (x.p.hp || 0) / (x.p.mh || 100));
      const sn = g.party.kind === 'local' && /^p[12]$/.test(x.id) ? x.id : '';
      return `<div class="pm ${sn} ${x.p.al ? '' : 'down'}" style="--cc:${c.css}">${sn ? `<i class="seat-pill ${sn}">${sn.toUpperCase()}</i> ` : ''}<span>${esc(x.p.n || '')}</span><div class="pm-bar"><i style="width:${f * 100}%"></i></div></div>`;
    }).join(''));
    if (ph === 'vote') this.phase('vote');
    this.drawMinimap();
    const live = g.mode === 'game' && !g.duel && !['over', 'win', 'lobby'].includes(g.phase) && !this.$('#summary').classList.contains('on');
    this.setC('#dead', 'on', !p.alive && live);
    if (!p.alive && live) {
      this.setT('#dead-title', p.out ? 'You are out' : 'You died');
      this.setT('#dead-sub', p.out ? (peers.some((x) => x.p.al) ? 'Spectating your party. Click to switch. You return next round.' : '') : 'Respawning in ' + Math.ceil(p.deadT) + '…');
    }
  }

  drawMinimap() {
    const g = this.game, c = this.$('#minimap'), ctx = c.getContext('2d');
    const S = c.width;
    if (!this.mmBase) return;
    ctx.save();
    ctx.clearRect(0, 0, S, S);
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, 7); ctx.clip();
    ctx.drawImage(this.mmBase, 0, 0, S, S);
    const w = g.world;
    const M = (x, z) => w.toMap(x, z, S);
    const dot = (x, z, r, col) => { const [i, j] = M(x, z); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(i, j, r, 0, 7); ctx.fill(); };
    const [ax, az] = M(w.arena.x, w.arena.z);
    ctx.strokeStyle = '#ff4a5a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ax, az, 6 + Math.sin(g.now * 4) * 1.5, 0, 7); ctx.stroke();
    const [sx, sz] = M(w.spawn.x, w.spawn.z);
    ctx.fillStyle = '#fff'; ctx.fillRect(sx - 2, sz - 2, 4, 4);
    for (const cr of w.crates) if (!cr.opened) dot(cr.x, cr.z, 2.2, '#ffd36a');
    for (const m of g.views.mobs.values()) dot(m.x, m.z, 1.6, '#ff4040');
    for (const n of g.views.npcs.values()) dot(n.x, n.z, 2, '#7dff8a');
    if (g.views.boss) dot(g.views.boss.x, g.views.boss.z, 5, '#ff2050');
    if (g.views.demon) dot(g.views.demon.x, g.views.demon.z, 4 + Math.sin(g.now * 10) * 1.5, '#ff0030');
    if (g.player.bedPos) { const [bx, bz] = M(g.player.bedPos.x, g.player.bedPos.z); ctx.fillStyle = '#9fd0ff'; ctx.fillRect(bx - 3, bz - 2, 6, 4); }
    for (const v of g.views.players.values()) dot(v.pos.x, v.pos.z, 3, v.cls.css);
    const p = g.player;
    const [px, pz] = M(p.pos.x, p.pos.z);
    ctx.translate(px, pz); ctx.rotate(-p.yaw + Math.PI);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(0, 3); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  phase(ph) {
    const g = this.game;
    const v = this.$('#vote');
    v.classList.toggle('on', ph === 'vote' && g.phase === 'vote' && g.player && !g.player.out);
    if (g.phase === 'vote') {
      const final = (g.round || 0) >= CONFIG.rounds - 1;
      this.$('#vote-x').style.display = final ? 'none' : '';
      this.$('#vote-title').textContent = final ? 'The final boss awaits' : 'Time is up';
      this.$('#vote-time').textContent = Math.max(0, Math.ceil(g.tl || 0));
      const t = g.voteTally || [0, 0];
      this.$('#vote-f-n').textContent = t[0] ? t[0] + ' vote' + (t[0] > 1 ? 's' : '') : '';
      this.$('#vote-x-n').textContent = t[1] ? t[1] + ' vote' + (t[1] > 1 ? 's' : '') : '';
      this.$$('#vote [data-vote]').forEach((b) => b.classList.toggle('picked', g.myVote === b.dataset.vote + g.round));
      // Controller players vote with the D-pad.
      const pad = g.pad && g.pad.active;
      this.$$('#vote [data-vote] kbd').forEach((k, i) => (k.textContent = pad ? (i ? 'D-pad ▶' : '◀ D-pad') : String(i + 1)));
    }
    this.$('#demon-tint').classList.toggle('on', g.phase === 'demon');
    const sq = this.$('#spaceq');
    sq.classList.toggle('on', g.phase === 'spaceq');
    if (g.phase === 'spaceq') {
      const host = g.isHost && !!g.sim;
      this.$('#sq-yes').style.display = this.$('#sq-no').style.display = host ? '' : 'none';
      this.$('#sq-wait').textContent = host ? '' : 'The host is choosing…';
    }
  }

  shop(open) {
    const g = this.game, p = g.player;
    this.$('#shop').classList.toggle('on', open);
    if (!open || !p) return;
    this.$('#shop-pc').textContent = p.pc;
    const items = [{ id: 'bed', name: 'Bed', role: 'Respawn', cost: g.price(CONFIG.bedPrice), desc: 'One more respawn. Place it with B.' }]
      ;
    this.$('#shop-items').innerHTML = items.map((it) => `
      <button class="shop-item ${p.pc < it.cost ? 'poor' : ''} role-${it.role.toLowerCase()}" data-buy="${it.id}">
        <div class="si-role">${it.role}</div>
        <div class="si-name">${it.name}</div>
        <div class="si-desc">${it.desc}</div>
        <div class="si-cost"><img class="coin-img" src="${this.coin}">${it.cost}</div>
      </button>`).join('');
    this.$$('[data-buy]').forEach((b) => (b.onclick = () => g.buy(b.dataset.buy)));
  }

  bless(opts) {
    const el = this.$('#bless');
    el.classList.toggle('on', !!opts);
    if (!opts) return;
    this.$('#bless-cards').innerHTML = opts.map((b, i) => `<button class="bless-card${i === 0 ? ' pad-first' : ''}" data-i="${i}"><div class="b-icon">${b.icon}</div><div class="b-name">${b.name}</div><div class="b-desc">${b.desc}</div><kbd>${i + 1}</kbd></button>`).join('');
    this.$$('.bless-card').forEach((b) => (b.onclick = () => this.game.pickBlessing(+b.dataset.i)));
  }

  // Level-up choice: five elements, each stacks. `live` (online) is a compact strip that leaves the game running.
  // The duel's power-up round (kind 'duel') always stops the game and offers five random attack picks.
  elem(opts, p, live, kind = 'elem') {
    const el = this.$('#elem');
    el.classList.toggle('on', !!opts);
    if (!opts) return;
    const duel = kind === 'duel';
    live = live && !duel;
    el.classList.toggle('soft', !!live);
    el.classList.toggle('live', !!live);
    this.$('#elem .vote-kicker').textContent = duel ? 'Power-up round ' + (this.game.dp || 1) : 'Level up';
    this.$('#elem h2').textContent = duel ? 'Choose an Attack Power-Up' : 'Choose a Power-Up';
    this.$('#elem-sub').textContent = duel
      ? 'The match is frozen until you both choose. Click, press 1-5, or use ◀ ▶ and Space. Picks stack.'
      : live ? 'Press 1-9 or 0, or ◀ ▶ then Space · D-pad ◀ ▶ then ' + 'X (A on Xbox)' + ' on a controller · the run keeps going' : 'The game is paused. Click, press 1-9 or 0, or use ◀ ▶ and Space. Everything stacks.';
    el.classList.toggle('ten', !duel && opts.length > 5);
    this.$('#elem-cards').innerHTML = opts.map((e, i) => {
      const info = puInfo(e, p.cls);
      const n = e.el ? p.stats.elem[e.el] : p.powerups.filter((q) => q.id === e.id).length;
      return `<button class="elem-card${i === 0 ? ' sel pad-first' : ''}" data-i="${i}" style="--ec:${e.color || '#ffb347'}"><div class="b-icon">${hasPuIcon(e) ? `<span class="pu-ic">${puIcon(e)}</span>` : e.icon || '•'}</div><div class="b-name">${esc(info.name)}${n ? ` <small>×${n}</small>` : ''}</div><div class="b-desc">${esc(info.desc)}</div><kbd>${i === 9 ? 0 : i + 1}</kbd></button>`;
    }).join('');
    this.$$('.elem-card').forEach((b) => (b.onclick = () => this.game.pickElem(+b.dataset.i)));
    // The tumbling die under the cards says a reroll is available; click it (or R) for a whole new set.
    const dc = this.$('#elem-dice'), rr = p.rerolls || 0;
    dc.classList.toggle('on', !duel); dc.classList.toggle('empty', !(rr > 0)); // always under the cards; dim when no reroll is banked
    dc.querySelector('.die-text').textContent = 'REROLL (' + rr + ')';
    dc.onclick = () => this.game.rerollElem();
    dc.querySelector('.die-text').onclick = (e) => { e.stopPropagation(); this.game.rerollElem(); };
  }
  elemSel(i) { this.$$('.elem-card').forEach((b, j) => b.classList.toggle('sel', i === j)); }

  cpuFlag(on) { const f = this.$('#cpuflag'); if (f) f.classList.toggle('on', !!on); }

  // 3, 2, 1, FIGHT!
  duelCount(n) {
    const el = this.$('#duelcount');
    el.textContent = n > 0 ? String(n) : 'FIGHT!';
    el.className = '';
    void el.offsetWidth;
    el.className = 'show' + (n > 0 ? '' : ' fight');
  }

  // Winner announcement with Rematch and Return to lobby. `info` null hides it.
  duelEnd(info) {
    const el = this.$('#duelend');
    el.classList.toggle('on', !!info);
    if (!info) return;
    el.classList.toggle('won', info.result === 'win');
    el.classList.toggle('lost', info.result === 'lose');
    this.$('#de-kicker').textContent = info.timeUp ? 'Time is up' : 'Match over';
    this.$('#de-title').textContent = info.result === 'win' ? 'VICTORY' : info.result === 'lose' ? 'DEFEAT' : 'DRAW';
    this.$('#de-sub').textContent = info.winner ? info.winner + ' wins the duel' : 'Nobody won this one';
    this.$('#de-stats').innerHTML = info.stats.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(String(v))}</b></div>`).join('');
    this.$('#de-wait').textContent = '';
    this.$('#de-rematch').onclick = () => { this.game.audio.play('ui'); this.game.rematch(); this.$('#de-wait').textContent = this.game.isHost ? '' : 'Rematch requested…'; };
    this.$('#de-lobby').onclick = () => { this.game.audio.play('ui'); this.game.backToLobby(); };
  }

  renderDaily() {
    const list = Dailies.today();
    const ms = msToReset(), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60;
    this.$('#dl-sub').textContent = list.filter((d) => d.done).length + ' of 3 done · new challenges in ' + h + 'h ' + m + 'm';
    this.$('#dl-grid').innerHTML = list.map((d) => {
      const pct = Math.round(100 * d.cur / Math.max(1, d.need));
      return `<div class="ul-card pad-nav ${d.done ? 'got' : ''}" tabindex="0"><div class="dl-tier"><span class="ul-tag t${d.tier}">${d.tierName}</span><span class="dl-pp">+${d.pp} PP</span></div><div class="ul-name">${esc(d.text)}</div>` +
        (d.done ? '<div class="ul-state">✓ Done · PP paid</div>' : `<div class="ul-bar"><i style="width:${pct}%"></i></div><div class="ul-state">${d.cur.toLocaleString()} / ${d.need.toLocaleString()}</div>`) + '</div>';
    }).join('');
  }
  renderUnlocks() {
    const gear = WEAPONS.filter((w) => GEAR_GOALS[w.id]);
    const GI = { webswing: '🕸️', jetpack: '🚀', wings: '🪽', drone: '🛸', turret: '🔫', zombiestaff: '🧟', gravgun: '🧲', healstaff: '✚', laser: '👁️', alienblaster: '👽' };
    let total = 0, got = 0;
    const row = (name, how, done, cur, need, tag, icon, secret) => {
      total++; if (done) got++;
      const pct = Math.round(100 * cur / Math.max(1, need)), hide = secret && !done;
      return `<div class="ul-card pad-nav ${done ? 'got' : ''} ${hide ? 'secret' : ''}" tabindex="0"><div class="ul-ico">${hide ? '❓' : icon}</div><div class="ul-tag">${hide ? 'Secret' : tag}</div><div class="ul-name">${hide ? '???' : esc(name)}</div><div class="ul-how">${esc(hide ? secret : how)}</div>` +
        (done ? '<div class="ul-state">✓ Unlocked</div>' : `<div class="ul-bar"><i style="width:${pct}%"></i></div><div class="ul-state">🔒 ${need > 1 ? cur + ' / ' + need : 'Locked'}</div>`) + '</div>';
    };
    const cards = gear.map((w) => { const G = GEAR_GOALS[w.id]; const [a, b] = G.p(); return row(w.name, G.how, a >= b, a, b, TIER(w) === 3 ? 'Gear' : 'Weapon', GI[w.id] || '⚙️'); });
    cards.push(
      row('Crash Site Prime', 'Win a run on Hard difficulty. Say yes to space after beating Thermes in round 6 to play it: a 10-minute round with The Visitor as the boss.', Unlocks.has('space'), Unlocks.has('space') ? 1 : 0, 1, 'Hidden map', '🪐', 'A hidden map. Hint: beat the whole run on a tougher difficulty.'),
      row('The Visitor', 'Defeat The Visitor on Crash Site Prime', Unlocks.has('visitor'), Unlocks.has('visitor') ? 1 : 0, 1, 'Character', '🛸', 'A hidden character. Hint: something is waiting past round 6.'),
      ...Object.values(EXTRA_GOALS).map((G) => { const [a, b] = G.p(); return row(G.name, G.how, a >= b, a, b, G.tag, '⏩'); }),
    );
    this.$('#ul-sub').textContent = got + ' of ' + total + ' unlocked. Unlocked gear and weapons show up on the Weapon Wall.';
    this.$('#ul-grid').innerHTML = cards.join('');
  }

  summary(s) {
    const el = this.$('#summary');
    el.classList.add('on');
    this.$('#dead').classList.remove('on');
    this.$('#toasts').innerHTML = '';
    el.classList.toggle('win', s.win);
    const cpu = this.$('#sum-cpu');
    cpu.classList.toggle('on', !!s.cpu);
    if (s.cpu) {
      const rows = s.cpu.rounds.map((r) => `<tr><td>Round ${r.round}</td><td>${r.farm}s</td><td>${r.boss}s</td><td>${r.kills}</td><td>${r.level}</td><td>${r.pc}</td><td>${r.powerups}</td></tr>`).join('');
      cpu.innerHTML = '<h3>CPU run report</h3><table><tr><th></th><th>Farm</th><th>Boss</th><th>Kills</th><th>Level</th><th>PC at vote</th><th>Picks</th></tr>' + rows + '</table><ul>' + s.cpu.notes.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul>';
    }
    this.$('#sum-title').textContent = s.win ? 'A Perfect Run' : 'Run Over';
    this.$('#sum-sub').textContent = s.win ? (s.round > CONFIG.rounds ? 'You even beat The Visitor in space as ' : 'You conquered all six rounds as ') + s.cls + '.' : 'You reached round ' + s.round + ' as ' + s.cls + '. The next run is yours.';
    const m = Math.floor(s.time / 60), sec = s.time % 60;
    this.$('#sum-stats').innerHTML = [
      ['Round reached', s.round > CONFIG.rounds ? 'Bonus round' : s.round + ' / ' + CONFIG.rounds], ['Kills', s.kills], ['PC earned', s.pc], ['Damage dealt', s.dmg.toLocaleString()],
      ['Deaths', s.deaths], ['Time', m + 'm ' + sec + 's'], ['Perfect Points', '+' + (s.pp || 0)],
    ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('') + (s.blessings.length ? `<div class="wide"><span>Blessings</span><b>${s.blessings.map(esc).join(', ')}</b></div>` : '');
    this.$('#sum-records').textContent = 'Best round ' + s.records.bestRound + ' · Perfect runs ' + s.records.wins + ' · Lifetime kills ' + s.records.totalKills;
    // Every player can go back to character select on their own; only the host starts the next run.
    this.$('#sum-lobby').style.display = this.game.party ? '' : 'none';
    this.$('#sum-lobby').textContent = this.game.isHost || (this.game.party && this.game.party.kind === 'solo') ? 'Run it back' : 'Back to character select';
    const couch = !!this.game.party && this.game.party.kind === 'local';
    this.$('#sum-menu').textContent = couch ? 'End couch co-op' : 'Go to main menu';
    this.$('#sum-wait').textContent = couch ? 'Waiting for Player 1 to start another run…' : 'Waiting for the host to start another run…';
    this.$('#sum-wait').style.display = 'none';
  }

  // ---------------- feedback ----------------
  toast(msg, kind = '', key = '') {
    if (key) { const old = this.$('#toasts [data-k="' + key + '"]'); if (old) { clearTimeout(old._t1); clearTimeout(old._t2); old.remove(); } }
    const t = document.createElement('div');
    if (key) t.dataset.k = key;
    t.className = 'toast ' + kind;
    t.textContent = msg;
    this.$('#toasts').appendChild(t);
    t._t1 = setTimeout(() => t.classList.add('out'), 2600);
    t._t2 = setTimeout(() => t.remove(), 3200);
    while (this.$('#toasts').children.length > 2) this.$('#toasts').firstChild.remove(); // never more than two messages over the fight
  }

  levelUp(lv, pu, info) {
    // A round banner is up: show the level-up just after it, so the two never stack.
    const bn = this.$('#banner');
    if (bn && bn.classList.contains('on') && performance.now() - (this.bannerAt || 0) < 3000) { clearTimeout(this.luT); this.luT = setTimeout(() => this.levelUp(lv, pu, info), 3000 - (performance.now() - this.bannerAt)); return; }
    let el = this.$('#levelup');
    if (!el) { el = document.createElement('div'); el.id = 'levelup'; this.$('#hud').appendChild(el); }
    el.innerHTML = `<b>LEVEL ${lv + 1}</b><span>${pu ? esc((pu.icon || '') + ' ' + info.name) + ' · ' + esc(info.desc) : 'Choose one of ten power-ups'}</span>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    const x = this.$('#xpbar'); x.classList.remove('pop'); void x.offsetWidth; x.classList.add('pop');
  }

  banner(title, sub) {
    const b = this.$('#banner');
    this.$('#banner-title').textContent = title;
    this.$('#banner-sub').textContent = sub || '';
    b.classList.remove('on');
    void b.offsetWidth;
    b.classList.add('on');
    this.bannerAt = performance.now();
    const lu = this.$('#levelup'); if (lu) lu.classList.remove('show'); // the round banner wins the middle of the screen
  }

  killfeed(text) {
    const k = document.createElement('div');
    k.textContent = text;
    this.$('#killfeed').prepend(k);
    setTimeout(() => k.remove(), 5000);
  }

  // Sealed in ice (duel): a pale blue frost creeps in from the screen edges until the thaw. 0 clears it.
  frost(secs) {
    let v = this._frost;
    if (!v) {
      v = this._frost = document.createElement('div');
      v.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:6;opacity:0;transition:opacity .25s;box-shadow:inset 0 0 180px 70px rgba(150,215,255,.75),inset 0 0 60px 10px rgba(235,250,255,.55)';
      this.root.appendChild(v); // inside this player's own screen (a hidden CPU's frost must not frost yours, a couch seat only its own half)
    }
    v.style.opacity = secs > 0 ? 1 : 0;
    clearTimeout(this._frostT);
    if (secs > 0) this._frostT = setTimeout(() => this.frost(0), secs * 1000 + 150); // belt and braces: a paused duel round can't leave it up
  }

  hurt(frac) {
    const v = this.$('#vignette');
    v.style.opacity = Math.min(1, 0.35 + frac * 3);
    clearTimeout(this.hurtT);
    this.hurtT = setTimeout(() => (v.style.opacity = 0), 160);
  }

  // Which CTL column this seat reads: player 2's keyboard half, else Settings > Controller layout.
  layout() { const g = this.game; return g.padKind && g.padKind() === 'kb' ? 'kp' : (g.settings.layout || 'ds'); }
  // The button for an action ('jump', 'use', 'shop', 'takeover', …) on the current layout, for prompts and toasts.
  ctl(action) { const c = ctlOf(this.layout()); return c[action] || action; }
  // Same, wrapped as a <b> for ui.prompt() html.
  ctlB(action) { return '<b>' + esc(this.ctl(action)) + '</b>'; }
  // Every static line of button text in the menus and HUD, rebuilt for the current layout.
  refreshHints() {
    const L = this.layout(), c = ctlOf(L), k = (a) => '<kbd>' + esc(c[a]) + '</kbd>';
    const help = this.$('#s-help ul.keys');
    if (help) help.innerHTML = helpRows(L).map(([a, b]) => `<li><kbd>${esc(a)}</kbd> ${esc(b)}</li>`).join('');
    const tip = this.$('.couch-tip');
    if (tip) tip.innerHTML = isPad(L) ? `Menus: D-pad or stick to move, ${k('select')} to select, ${k('back')} to go back. Press ${k('fs')} for fullscreen.` : `Menus: click, or arrows to move, ${k('select')} to select, ${k('back')} to go back. Press ${k('fs')} for fullscreen.`;
    const vf = this.$('.vote-opt[data-vote="f"] kbd'), vx = this.$('#vote-x kbd');
    if (vf) vf.textContent = c.prev; if (vx) vx.textContent = c.nxt;
    const flag = this.$('#cpuflag');
    if (flag) flag.innerHTML = 'CPU IS PLAYING · <b>' + esc(c.takeover) + '</b> take over · <b>' + esc(c.speed) + '</b> speed';
    const jet = this.$('#jetfuel span');
    if (jet && !(this.game.player && this.game.player.hasGear && !this.game.player.jetEquipped() && this.game.player.hasGear('wings'))) jet.textContent = 'JETPACK · double-tap ' + c.jump + ' · ' + c.sprint + ' descend';
    const alt = this.$('#help-altar'); if (alt) alt.textContent = 'Hold ' + c.use;
    this.hintSig = null;
    this.padHints();
  }
  // Key labels follow the device you play on: keyboard letters, controller buttons, or player 2's keyboard half.
  key(k) {
    const g = this.game, kind = g.padKind ? g.padKind() : 'p1';
    // Settings > Controller layout decides the badges: PlayStation or Xbox names, or the keys themselves.
    const L = g.settings.layout || 'ds';
    const m = kind === 'kb' ? KEY_HINTS.kb : kind === 'pad' || L === 'ds' || L === 'xbox' ? (L === 'xbox' ? KEY_HINTS.pad : KEY_HINTS.ds) : null;
    return (m && m[k]) || k;
  }
  // Refresh the HUD's ability and weapon key badges for the current device and weapon slot.
  padHints() {
    const g = this.game, L = g.settings.layout || 'ds', pad = g.padKind && g.padKind() === 'pad' || L === 'ds' || L === 'xbox', cur = g.player ? g.player.cur : 0;
    const sig = this.key('X') + this.key('Q') + this.key('G') + this.key('F') + (pad ? 'p' + cur : 'k');
    if (sig === this.hintSig) return;
    this.hintSig = sig;
    const set = (sel, k) => { const e = this.$(sel); if (e) e.textContent = this.key(k); };
    set('#ab-d kbd', 'X'); set('#ab-q kbd', 'Q'); set('#ab-e kbd', 'G'); set('#ab-r kbd', 'F');
    this.$$('.wslot kbd').forEach((e, i) => { e.textContent = pad ? (i === cur ? '◀ ▶' : '') : this.key(String(i + 1)); });
  }

  // Blood on your own screen (Settings > Blood splatter, off by default): a few splats near the edges that run down and fade.
  bloodSplat(k = 1) {
    const box = this.$('#bloodfx');
    if (!box) return;
    const n = Math.min(5, 1 + Math.round(k * 2.5));
    for (let i = 0; i < n; i++) {
      const e = document.createElement('i');
      const side = Math.random() < 0.5, edge = Math.random() < 0.5;
      const sz = (90 + Math.random() * 110) * (0.7 + 0.5 * k);
      e.style.width = e.style.height = sz + 'px';
      e.style.left = (side ? (edge ? 2 : 70) + Math.random() * 26 : 10 + Math.random() * 80) + '%';
      e.style.top = (side ? 10 + Math.random() * 70 : (edge ? -4 : 66) + Math.random() * 30) + '%';
      e.style.setProperty('--r', `rotate(${Math.round(Math.random() * 360)}deg) scale(${(0.8 + Math.random() * 0.5).toFixed(2)}, ${(0.8 + Math.random() * 0.6).toFixed(2)})`);
      e.style.animationDuration = (0.9 + Math.random() * 0.6) + 's';
      box.appendChild(e);
      setTimeout(() => e.remove(), 1700);
    }
    while (box.children.length > 14) box.firstChild.remove();
  }

  healFlash() {
    const v = this.$('#healfx');
    v.classList.remove('on'); void v.offsetWidth; v.classList.add('on');
  }

  flashAbility(k) {
    const el = this.$('#ab-' + k);
    el.classList.remove('cast'); void el.offsetWidth; el.classList.add('cast');
  }

  hitmarker(kill, head) {
    const now = performance.now();
    if (!kill && now - (this._hmT || 0) < 60) return; // restarting the animation forces a layout; once per few frames is plenty
    this._hmT = now;
    const h = this.$('#hitmarker');
    h.className = ''; void h.offsetWidth; h.className = kill ? 'on kill' : head ? 'on head' : 'on';
  }

  coinPop(n) {
    const c = this.$('#coinpop');
    c.textContent = '+' + n;
    c.classList.remove('on'); void c.offsetWidth; c.classList.add('on');
  }

  damageNumber(pos, val, kind) {
    if (!pos || this.game.settings.dmgNums === false) return;
    const layer = this.$('#dmgnums');
    if (layer.children.length > 40) layer.firstChild.remove();
    const d = document.createElement('div');
    d.className = 'dn ' + (kind || '');
    d.textContent = val;
    d.style.left = pos[0] + (Math.random() - 0.5) * 30 + 'px';
    d.style.top = pos[1] + (Math.random() - 0.5) * 10 + 'px';
    layer.appendChild(d);
    setTimeout(() => d.remove(), 1000);
  }

  prompt(html) {
    const p = this.$('#prompt');
    if (html === this.lastPrompt) return;
    this.lastPrompt = html;
    p.innerHTML = html || '';
    p.classList.toggle('on', !!html);
  }
}
