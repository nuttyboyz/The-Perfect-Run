// Things the player earns and keeps on this device (localStorage 'perfectrun.unlocks'): flags such as the hidden space map and
// The Visitor character, plus lifetime progress counters for the gear unlock goals.
import { Profile } from './profile.js';
const KEY = 'perfectrun.unlocks';
let cache = null;
function load() {
  if (cache) return cache;
  try { cache = JSON.parse(Profile.get(KEY) || 'null'); } catch { cache = null; }
  if (!cache || typeof cache !== 'object') cache = {};
  cache.flags = cache.flags || {}; cache.prog = cache.prog || {};
  return cache;
}
function save() { Profile.set(KEY, JSON.stringify(cache)); }

export const Unlocks = {
  has(id) { return Profile.isAdmin() || !!load().flags[id]; }, // Admin: everything unlocked
  grant(id) { const u = load(); if (u.flags[id]) return false; u.flags[id] = 1; save(); return true; },
  count(stat) { return Profile.isAdmin() ? 1e9 : load().prog[stat] || 0; },
  add(stat, n = 1) { const u = load(); u.prog[stat] = (u.prog[stat] || 0) + n; save(); },
  max(stat, n) { const u = load(); if (n > (u.prog[stat] || 0)) { u.prog[stat] = n; save(); } },
};
// Characters that start locked, and what unlocks them.
export const LOCKED_CHARACTERS = { grey: { flag: 'visitor', how: 'Defeat The Visitor on the hidden space map' } };
export const charUnlocked = (id) => !LOCKED_CHARACTERS[id] || Unlocks.has(LOCKED_CHARACTERS[id].flag);

// Gear is earned. Each item lists what unlocks it; `p` reads this device's progress counters as [done, needed].
// Kill and boss counters tick live (Game.handleEvent), run counters at the end of a run (Game.endRun).
const prog = (stat, need) => () => [Math.min(Unlocks.count(stat), need), need];
const flag = (id) => () => [Unlocks.has(id) ? 1 : 0, 1];
export const GEAR_GOALS = {
  turret: { how: 'Win a run with only guns as your weapons', p: flag('gunsWin') },
  drone: { how: 'Get 1,000 kills with the Turret Pack', p: prog('killsTurret', 1000) },
  webswing: { how: 'Get 500 kills while in the air', p: prog('killsAir', 500) },
  jetpack: { how: 'Win 3 runs on Normal', p: prog('winsNormal', 3) },
  zombiestaff: { how: 'Win 3 runs on Hard', p: prog('winsHard', 3) },
  healstaff: { how: 'Win 5 rounds (beat 5 round bosses)', p: prog('bosses', 5) },
  gravgun: { how: 'Defeat 10 bosses on Crash Site Prime', p: prog('bossesSpace', 10) },
  wings: { how: 'Get 1,000 kills in the air on Hard', p: prog('killsAirHard', 1000) },
  laser: { how: 'Get 5,000 kills', p: prog('kills', 5000) },
  alienblaster: { how: 'Get 1,000 kills on Crash Site Prime', p: prog('killsSpace', 1000) },
};
// Extras that are not wall items: the game-speed control (T / D-pad down) is earned by finishing runs.
export const EXTRA_GOALS = { speed: { name: 'Game speed', how: 'Win 4 runs. Then T or D-pad down cycles 1x / 2x / 3x in solo and couch runs', p: prog('wins', 4), tag: 'Control' } };
export const speedUnlocked = () => { const [a, b] = EXTRA_GOALS.speed.p(); return a >= b; };

export function gearUnlocked(id) {
  if (id === 'wings') return false; /* deleted gear (Nutty 2026-11-17): a saved loadout that still lists it drops it */
  const g = GEAR_GOALS[id];
  if (!g) return true; // nothing to earn for this item
  const [a, b] = g.p();
  return a >= b;
}
