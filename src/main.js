import { Game } from './game.js';
import { UI } from './ui.js';
import { loadAssets } from './assets.js';
import { Profile } from './profile.js';
import { runLogin } from './loginui.js';

const loading = document.getElementById('loading');
// A pristine copy of the seat markup, for the second couch co-op seat.
const SEAT_HTML = document.getElementById('seat1').innerHTML;

function spawnSeat(hub, pad, onLeave, info = {}) {
  if (info.bot) return spawnBot(hub, info.host);
  const el = document.createElement('div');
  el.className = 'seat p2'; el.id = 'seat2'; el.dataset.screen = 's-lobby';
  el.innerHTML = SEAT_HTML;
  document.body.insertBefore(el, document.getElementById('seats-split'));
  const g = new Game(el.querySelector('canvas'), UI, { root: el, seat: 2, pad, onLeave });
  g.devLabel = info.label || 'Controller';
  g.setSeatTag();
  // Both seats show the same character portraits and weapon renders: draw them once on the host seat
  // and hand the finished images to this one instead of rendering them a second time.
  const host = info.host;
  if (host) {
    try {
      g.menu._portraits = host.menu.portraits(host.renderer);
      g.menu._wshots = host.menu.weaponShots(host.renderer);
    } catch (e) { console.warn('could not share lobby images', e); }
  }
  g.joinLocal(hub);
  window.__game2 = g;
  return g;
}

// The Duel Arena's CPU opponent: a full game that never draws. It sits off screen, joins the party and plays by itself.
function spawnBot(hub, host) {
  const el = document.createElement('div');
  el.className = 'seat bot'; el.id = 'seat-bot'; el.dataset.screen = 's-lobby';
  el.style.cssText = 'position:fixed;left:-4000px;top:0;width:960px;height:540px;visibility:hidden;pointer-events:none;';
  el.innerHTML = SEAT_HTML;
  document.body.appendChild(el);
  const g = new Game(el.querySelector('canvas'), UI, { root: el, seat: 2, pad: null, bot: true, onLeave: () => {} });
  g.devLabel = 'CPU';
  try {
    g.menu._portraits = host.menu.portraits(host.renderer);
    g.menu._wshots = host.menu.weaponShots(host.renderer);
  } catch (e) { console.warn('could not share lobby images', e); }
  g.joinLocal(hub);
  window.__bot = g;
  return g;
}

function fail(msg) {
  console.error(msg);
  document.getElementById('error-text').textContent = String(msg && msg.message ? msg.message : msg);
  document.getElementById('error').classList.add('on');
  loading.classList.remove('on');
}

window.addEventListener('error', (e) => { if (!window.__game) fail(e.error || e.message); });
window.addEventListener('unhandledrejection', (e) => { if (!window.__game) fail(e.reason); });

// Let the loading screen paint before the heavy texture generation.
requestAnimationFrame(() => setTimeout(async () => {
  const bar = loading.querySelector('.ld-bar i'), txt = loading.querySelector('.ld-text');
  txt.textContent = 'Loading characters…';
  // Who's playing? (shown over the loading screen while the assets come in; skipped when a profile is still signed in)
  const who = Promise.resolve(Profile.restore()).then((ok) => (ok ? null : runLogin()));
  await loadAssets((f) => { if (bar) { bar.style.animation = 'none'; bar.style.transition = 'width .2s'; bar.style.width = Math.round(f * 100) + '%'; } });
  await who;
  txt.textContent = 'Forging the world…';
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 20)));
  try {
    const game = new Game(document.querySelector('#seat1 canvas'), UI, { root: document.getElementById('seat1'), seat: 1, spawnSeat });
    window.__game = game;
    // Draw the character cards and weapon pictures now, behind the loading screen, so opening character select is instant later.
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    try { game.menu.portraits(game.renderer); } catch (e) { console.warn('portraits', e); }
    await new Promise((r) => setTimeout(r, 0));
    try { game.menu.weaponShots(game.renderer); } catch (e) { console.warn('weapon shots', e); }
    setTimeout(() => loading.classList.remove('on'), 150);
  } catch (e) {
    fail(e);
  }
}, 30));
