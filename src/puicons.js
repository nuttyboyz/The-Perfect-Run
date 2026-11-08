// Picture icons for every power-up (HUD row, level-up cards, the chest pickup that floats over an opened chest).
// Each is a small SVG drawing on a round badge: a sword for damage, a heart for health, a dumbbell for Killer Instinct
// (critical hits), a magnet for the magnet charm, and so on. puIcon(pu) returns the SVG markup; puIconURL(pu) a data URL.
import { POWERUP_BY_ID } from './data.js';

const S = (d, fill = '#fff', extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
const L = (d, col = '#fff', w = 4, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const C = (x, y, r, fill = '#fff', extra = '') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;
const T = (x, y, txt, size = 16, fill = '#fff') => `<text x="${x}" y="${y}" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="${size}" fill="${fill}" text-anchor="middle" stroke="#000" stroke-width="1.2" paint-order="stroke">${txt}</text>`;

// Drawings (64x64, centred on 32,32).
const G = {
  sword: () => S('M44 10 L54 10 L54 20 L30 44 L24 38 Z', '#e8edf3', 'stroke="#7d8794" stroke-width="1.5"') + L('M47 17 L28 36', '#9aa5b2', 1.5) + S('M18 36 L28 46 L25 49 L15 39 Z', '#c9a05a') + L('M21 43 L12 52', '#5a3a22', 5) + C(11, 53, 3, '#c9a05a'),
  fast: () => L('M14 18 L28 32 L14 46', '#fff', 6) + L('M30 18 L44 32 L30 46', '#ffe08a', 6) + L('M46 22 L52 32 L46 42', '#ffe08a', 3),
  heart: (c = '#ff4d5e') => S('M32 52 C14 40 8 30 12 21 C16 12 28 12 32 21 C36 12 48 12 52 21 C56 30 50 40 32 52 Z', c, 'stroke="#7a0f1c" stroke-width="2"') + S('M20 20 C22 16 26 16 28 19', 'none', 'stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"'),
  heartPlus: () => G.heart('#3fd27a') + L('M32 25 L32 41 M24 33 L40 33', '#fff', 5),
  boot: () => S('M22 12 L34 12 L34 36 L50 42 C54 44 54 52 50 52 L18 52 L18 44 L22 40 Z', '#a8743f', 'stroke="#4d3018" stroke-width="2"') + S('M34 18 C44 10 54 14 56 20 C48 18 42 20 34 26 Z', '#fff') + S('M34 26 C42 22 50 24 52 28 C46 28 40 30 34 32 Z', '#dfe7ff'),
  hourglass: () => S('M18 10 L46 10 L46 14 L36 30 L46 48 L46 54 L18 54 L18 48 L28 30 L18 14 Z', '#ffe7b0', 'stroke="#7a5a28" stroke-width="2.5"') + S('M23 49 L32 40 L41 49 Z', '#e0a43a') + S('M24 16 L40 16 L32 27 Z', '#e0a43a') + S('M14 8 L50 8 L50 12 L14 12 Z M14 52 L50 52 L50 56 L14 56 Z', '#8a5a2a'),
  drop: () => S('M32 8 C40 22 48 30 48 40 C48 50 40 56 32 56 C24 56 16 50 16 40 C16 30 24 22 32 8 Z', '#d0142a', 'stroke="#5e0712" stroke-width="2"') + S('M24 40 C24 34 27 30 29 28', 'none', 'stroke="#ffb0b8" stroke-width="3" stroke-linecap="round"'),
  shield: (c = '#7f95b8') => S('M32 8 L52 16 C52 34 46 48 32 56 C18 48 12 34 12 16 Z', c, 'stroke="#2a3346" stroke-width="2.5"') + S('M32 14 L46 20 C46 34 42 44 32 50 Z', '#ffffff', 'opacity=".25"') + L('M32 12 L32 54', '#2a3346', 2),
  spring: () => L('M20 50 L44 50 M22 44 L42 40 M22 36 L42 32 M22 28 L42 24 M22 20 L42 16', '#d6dde6', 4) + S('M28 12 L36 12 L32 4 Z', '#7dff9a') + L('M20 54 L44 54', '#6c7680', 4),
  star: () => S('M32 6 L38 24 L58 26 L42 38 L48 58 L32 46 L16 58 L22 38 L6 26 L26 24 Z', '#ffd84a', 'stroke="#8a5a00" stroke-width="2"') + C(32, 32, 5, '#fff'),
  plus2: () => L('M22 18 L22 46 M8 32 L36 32', '#fff', 6) + T(46, 44, '+1', 18, '#ffd84a'),
  dumbbell: () => `<g transform="rotate(-30 32 32)">` + S('M2 23 h6 v18 h-6 z M8 15 h9 v34 h-9 z M47 15 h9 v34 h-9 z M56 23 h6 v18 h-6 z', '#3a3f46', 'stroke="#0d0f12" stroke-width="2"') + S('M17 28 h30 v8 h-30 z', '#c8ced6', 'stroke="#555" stroke-width="1"') + S('M9 17 h6 v10 h-6 z M48 17 h6 v10 h-6 z', '#8a929c') + L('M20 28 v8 M24 28 v8 M40 28 v8 M44 28 v8', '#8a929c', 1.5) + '</g>',
  skull: () => S('M32 8 C46 8 54 18 54 30 C54 38 50 42 46 44 L46 52 L18 52 L18 44 C14 42 10 38 10 30 C10 18 18 8 32 8 Z', '#ece6d8', 'stroke="#5a4e3a" stroke-width="2"') + C(23, 31, 6, '#222') + C(41, 31, 6, '#222') + S('M32 37 L28 44 L36 44 Z', '#222') + L('M24 48 L24 52 M32 48 L32 52 M40 48 L40 52', '#5a4e3a', 2),
  mag: () => S('M22 8 L40 8 L46 54 L26 54 Z', '#3b4048', 'stroke="#111" stroke-width="2"') + S('M24 4 L38 4 L39 10 L23 10 Z', '#c9a24a') + L('M27 18 L41 18 M28 26 L42 26 M29 34 L43 34 M30 42 L44 42', '#6b737e', 2.5),
  reload: () => L('M48 26 A17 17 0 1 0 46 42', '#fff', 5) + S('M42 16 L54 22 L46 32 Z', '#fff') + S('M28 24 L36 24 L36 42 L28 42 Z', '#c9a24a') + S('M28 24 C28 18 36 18 36 24 Z', '#e8c070'),
  impact: () => S('M32 4 L36 22 L54 12 L42 28 L60 34 L42 38 L52 54 L34 42 L30 60 L26 42 L10 52 L20 36 L4 30 L22 26 L12 10 L28 22 Z', '#ffb03a', 'stroke="#8a3a00" stroke-width="2"') + C(32, 32, 8, '#fff3c8'),
  key: (k, sub) => S('M12 12 h40 v40 h-40 z', '#262b36', 'rx="8" stroke="#9fb4ff" stroke-width="3"') + T(32, 42, k, 26, '#fff') + (sub === 'dmg' ? S('M46 6 L56 18 L50 18 L50 26 L42 26 L42 18 L36 18 Z', '#ff6a4a', 'stroke="#000" stroke-width="1"') : sub === 'cd' ? C(48, 14, 9, '#5ac8ff', 'stroke="#000" stroke-width="1"') + L('M48 9 L48 14 L52 16', '#000', 2) : S('M48 4 L42 16 L48 16 L44 26 L56 12 L50 12 L54 4 Z', '#ffd84a', 'stroke="#000" stroke-width="1"')),
  orbit: () => L('M32 32 m-20 0 a20 20 0 1 0 40 0 a20 20 0 1 0 -40 0', '#9fb4ff', 2, 'stroke-dasharray="4 5"') + [0, 120, 240].map((a) => `<g transform="rotate(${a} 32 32)">${S('M30 6 L36 10 L32 22 L28 10 Z', '#e8edf3', 'stroke="#6a7480" stroke-width="1"')}${S('M27 21 h10 v3 h-10 z', '#c9a05a')}</g>`).join('') + C(32, 32, 5, '#fff'),
  firering: () => C(32, 40, 18, 'none', 'stroke="#ff7a2a" stroke-width="3" opacity=".6"') + [0, 1, 2, 3, 4].map((i) => { const x = 10 + i * 11; return S(`M${x} 50 C${x - 6} 40 ${x} 34 ${x + 2} 22 C${x + 6} 32 ${x + 10} 38 ${x + 6} 50 Z`, i % 2 ? '#ffb43a' : '#ff5a1a', 'stroke="#7a1a00" stroke-width="1"'); }).join('') + C(32, 30, 4, '#fff'),
  burst: () => S('M32 6 L38 22 L56 16 L44 30 L58 40 L40 40 L42 58 L32 44 L22 58 L24 40 L6 40 L20 30 L8 16 L26 22 Z', '#ff5a2a', 'stroke="#6a1000" stroke-width="2"') + S('M32 18 L36 28 L46 26 L38 34 L44 42 L34 38 L32 48 L28 38 L20 42 L26 34 L18 26 L28 28 Z', '#ffd84a'),
  magnet: () => S('M14 12 L26 12 L26 34 C26 42 38 42 38 34 L38 12 L50 12 L50 34 C50 58 14 58 14 34 Z', '#d8263a', 'stroke="#5e0712" stroke-width="2"') + S('M14 12 L26 12 L26 20 L14 20 Z M38 12 L50 12 L50 20 L38 20 Z', '#dfe5ec') + L('M8 6 L12 10 M56 6 L52 10 M32 4 L32 8', '#9fd8ff', 3),
  book: () => S('M8 14 C18 10 26 12 32 18 C38 12 46 10 56 14 L56 50 C46 46 38 48 32 54 C26 48 18 46 8 50 Z', '#f2ead8', 'stroke="#6a4a22" stroke-width="2"') + L('M32 18 L32 54', '#6a4a22', 2) + L('M14 22 L26 24 M14 30 L26 32 M38 24 L50 22 M38 32 L50 30', '#9a8a6a', 2),
  reach: () => G.sword() + L('M8 8 L18 8 M8 8 L8 18 M56 56 L46 56 M56 56 L56 46', '#7dff9a', 4),
  coins: () => [[20, 44], [32, 36], [44, 44], [32, 22]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="12" ry="7" fill="#ffc83a" stroke="#8a5a00" stroke-width="2"/><ellipse cx="${x}" cy="${y - 1}" rx="7" ry="3.5" fill="#ffe08a"/>`).join(''),
  eye: () => S('M4 32 C16 14 48 14 60 32 C48 50 16 50 4 32 Z', '#f4f0e6', 'stroke="#3a2a1a" stroke-width="2"') + C(32, 32, 10, '#3fa0ff') + C(32, 32, 5, '#111') + L('M32 12 L32 20 M32 44 L32 52 M12 32 L20 32 M44 32 L52 32', '#ff3a3a', 2.5),
  dash: () => L('M8 22 L30 22 M4 32 L30 32 M10 42 L30 42', '#9fd8ff', 4) + S('M32 14 L56 32 L32 50 Z', '#fff', 'stroke="#2a4a6a" stroke-width="2"'),
  tower: () => S('M16 20 L16 12 L22 12 L22 16 L28 16 L28 12 L36 12 L36 16 L42 16 L42 12 L48 12 L48 20 L44 24 L44 54 L20 54 L20 24 Z', '#a0a6ae', 'stroke="#3a3f46" stroke-width="2"') + S('M28 54 L28 42 C28 36 36 36 36 42 L36 54 Z', '#3a2a1a') + S('M30 28 h4 v6 h-4 z', '#3a2a1a'),
  rage: () => S('M14 30 C14 18 22 12 32 12 C42 12 50 18 50 30 C50 44 42 54 32 54 C22 54 14 44 14 30 Z', '#e8402a', 'stroke="#5e1000" stroke-width="2"') + L('M20 26 L28 30 M44 26 L36 30', '#2a0000', 4) + L('M24 44 C28 40 36 40 40 44', '#2a0000', 4) + S('M14 18 L8 6 L20 14 Z M50 18 L56 6 L44 14 Z', '#ece6d8'),
  syringe: () => `<g transform="rotate(45 32 32)">${S('M26 10 h12 v34 h-12 z', '#dff2ff', 'stroke="#3a5a7a" stroke-width="2"')}${S('M28 26 h8 v16 h-8 z', '#ff4a6a')}${S('M22 6 h20 v4 h-20 z M30 2 h4 v4 h-4 z', '#7a8a9a')}${L('M32 44 L32 58', '#b8c4d0', 2)}</g>`,
  clover: () => [[32, 20], [44, 32], [32, 44], [20, 32]].map(([x, y]) => C(x, y, 10, '#2fbf4a', 'stroke="#0f5a1e" stroke-width="2"')).join('') + C(32, 32, 5, '#5ae07a') + L('M36 40 C40 50 44 54 50 58', '#0f5a1e', 3),
  feather: () => S('M48 6 C30 10 16 26 14 50 L18 54 C30 46 46 32 52 12 Z', '#ff7a2a', 'stroke="#7a1a00" stroke-width="2"') + S('M48 10 C38 18 30 26 24 36 L28 34 C34 28 42 20 50 14 Z', '#ffd84a') + L('M14 58 L44 14', '#7a1a00', 2),
  glass: () => S('M32 4 L52 24 L32 60 L12 24 Z', '#bfe8ff', 'stroke="#2a6a9a" stroke-width="2" opacity=".95"') + L('M24 18 L34 30 L28 40 L36 50', '#2a6a9a', 2) + S('M32 4 L40 24 L32 24 Z', '#fff', 'opacity=".6"'),
  potion: () => S('M26 6 h12 v12 C48 22 52 30 52 38 C52 50 44 58 32 58 C20 58 12 50 12 38 C12 30 16 22 26 18 Z', '#e8f0ff', 'stroke="#3a4a6a" stroke-width="2" opacity=".9"') + S('M14 38 C14 50 22 56 32 56 C42 56 50 50 50 38 Z', '#3fd27a') + S('M24 4 h16 v6 h-16 z', '#8a5a2a') + L('M24 40 L40 40', '#fff', 2, 'opacity=".6"'),
  flame: () => S('M32 4 C40 18 52 26 50 42 C48 54 40 60 32 60 C22 60 14 52 14 42 C14 30 24 26 26 14 C30 22 32 26 32 4 Z', '#ff5a1a', 'stroke="#7a1a00" stroke-width="2"') + S('M32 26 C38 34 42 40 40 48 C38 54 34 56 32 56 C26 56 22 52 22 46 C22 40 28 38 32 26 Z', '#ffc83a'),
  snow: () => [0, 60, 120].map((a) => `<g transform="rotate(${a} 32 32)">${L('M32 6 L32 58 M26 12 L32 18 L38 12 M26 52 L32 46 L38 52', '#bfeaff', 4)}</g>`).join('') + C(32, 32, 4, '#fff'),
  bolt: () => S('M36 4 L14 36 L30 36 L24 60 L50 24 L34 24 L42 4 Z', '#d6b8ff', 'stroke="#4a2a8a" stroke-width="2"') + S('M36 8 L22 32 L32 32 Z', '#fff', 'opacity=".5"'),
  mountain: () => S('M4 54 L24 18 L32 30 L40 20 L60 54 Z', '#a87f55', 'stroke="#4a3018" stroke-width="2"') + S('M24 18 L30 28 L26 30 L22 26 L18 30 Z M40 20 L46 30 L42 32 L38 28 L36 30 Z', '#f4f0e6'),
  wind: () => L('M8 22 L38 22 C46 22 48 12 40 10 C34 9 32 14 34 16', '#bff0dc', 4) + L('M8 34 L50 34 C58 34 60 46 52 48 C46 49 44 44 46 42', '#9fe8c0', 4) + L('M14 46 L30 46', '#bff0dc', 4),
};

// Which drawing each power-up uses, and its badge colour.
const RED = '#7a1d24', GRN = '#14532d', BLU = '#1c3557', PUR = '#3b1d5a', GLD = '#5a4210', GRY = '#2c3036', ORG = '#6a2a0a';
const MAP = {
  dmg: ['sword', RED], rr_whet: ['sword', RED], rate: ['fast', GLD], rr_frenzy: ['fast', GLD],
  hp: ['heart', RED], rr_vigor: ['heart', RED], spd: ['boot', BLU], rr_swift: ['boot', BLU],
  cd: ['hourglass', BLU], rr_deepfocus: ['hourglass', BLU], leech: ['drop', RED], rr_drain: ['drop', RED], siphon: ['drop', PUR],
  armor: ['shield', GRY], rr_ward: ['shield', GRY], bulwark: ['shield', GRY], regen: ['heartPlus', GRN], rr_secondskin: ['heartPlus', GRN], adrenaline: ['heartPlus', GRN],
  jump: ['spring', GRN], rr_pogo: ['spring', GRN], eldmg: ['star', PUR], extra: ['plus2', PUR], rr_echo: ['plus2', PUR],
  crit: ['dumbbell', GLD], rr_hawk: ['eye', RED], execute: ['skull', GRY], rr_finisher: ['skull', GRY],
  bigmag: ['mag', GRY], rr_drum: ['mag', GRY], fastreload: ['reload', BLU], rr_speedload: ['reload', BLU], heavy: ['impact', ORG], rr_concuss: ['impact', ORG],
  orbit: ['orbit', BLU], rr_twinblades: ['orbit', BLU], aura: ['firering', ORG], rr_embers: ['firering', ORG], burst: ['burst', ORG], rr_deathpop: ['burst', ORG],
  magnet: ['magnet', GRY], rr_lure: ['magnet', GRY], learn: ['book', PUR], rr_scholar: ['book', PUR], reach: ['reach', GRN], longarm: ['reach', GRN], rr_giant: ['reach', GRN],
  rr_goldrush: ['coins', GLD], greed: ['coins', GLD], rr_dashmaster: ['dash', BLU], rr_bulwark: ['tower', GRY], titan: ['tower', RED],
  rr_rage: ['rage', RED], berserk: ['rage', RED], rr_adrenaline: ['syringe', GRN], rush: ['syringe', RED], rr_lucky: ['clover', GRN],
  phoenix: ['feather', ORG], glass: ['glass', BLU], heal: ['potion', GRN],
  el_fire: ['flame', ORG], el_frost: ['snow', BLU], el_storm: ['bolt', PUR], el_earth: ['mountain', GLD], el_wind: ['wind', GRN],
};
const KEYNAME = { q: 'Q', r: 'F', e: 'G', d: '⇢' };

export const hasPuIcon = (pu) => !!pu && (!!MAP[pu.id] || pu.kind === 'ability' || /^rr_[qfg]over$/.test(pu.id));
export function puIcon(pu) {
  if (!pu) return '';
  let body, bg;
  if (MAP[pu.id]) { const [g, c] = MAP[pu.id]; body = G[g](); bg = c; }
  else if (pu.kind === 'ability' || /^m_/.test(pu.id)) { body = G.key(KEYNAME[pu.key] || '?', pu.mode); bg = pu.mode === 'dmg' ? RED : BLU; }
  else if (/^rr_[qfg]over$/.test(pu.id)) { body = G.key({ rr_qover: 'Q', rr_fover: 'F', rr_gover: 'G' }[pu.id], 'over'); bg = PUR; }
  else { body = G.star(); bg = GRY; }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 64 64" class="pu-svg"><defs><radialGradient id="pg_${pu.id}" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="${bg}" stop-opacity="1"/><stop offset="1" stop-color="#08070b"/></radialGradient></defs><circle cx="32" cy="32" r="31" fill="url(#pg_${pu.id})" stroke="rgba(255,255,255,.35)" stroke-width="1.5"/><g transform="translate(6.4 6.4) scale(.8)">${body}</g></svg>`;
}
const urlCache = new Map();
export function puIconURL(pu) {
  if (!pu) return '';
  if (!urlCache.has(pu.id)) urlCache.set(pu.id, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(puIcon(pu)));
  return urlCache.get(pu.id);
}
export const puIconById = (id) => puIcon(POWERUP_BY_ID[id]);
