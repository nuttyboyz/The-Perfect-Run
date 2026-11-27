// Achievements (v146): each one pays Perfect Points once, the moment it is earned. Progress is per profile
// (Profile key 'perfectrun.ach'). Most counters ride on the Daily Challenge hooks (Dailies.add / Dailies.best forward here),
// so anything that does not count for a daily (CPU runs, mutator runs, couch seat 2) does not count here either.
//   stat: a lifetime counter      run: the same counter, but only what was earned in the current run
//   best: the highest value seen  all: every listed counter must be above zero
import { Profile } from './profile.js';
import { addPP } from './meta.js';

const BOSS = (name, title) => ({ id: 'boss_' + name.replace(/\W/g, '').toLowerCase(), cat: 'Bosses', name: title, how: 'Beat ' + name, pp: 50, stat: 'boss:' + name, need: 1 });
const HERO = (ch, name) => ({ id: 'hero_' + ch, cat: 'Heroes', name: name + ' Wins', how: 'Win a run as ' + name, pp: 100, stat: 'winCh:' + ch, need: 1 });
const BOSS_NAMES = ['The Gravewarden', 'Thornmother', 'Sandreaver', 'Rimefang', 'Magmaw', 'Vexaris', 'Mossback', 'Dreadknight', 'The Archmage', 'The Flayed', 'Rotgut', 'Big Elvis', 'Uncle Gus', 'Dreyar', 'The Visitor', 'Thermes'];

export const ACHIEVEMENTS = [
  // First steps
  { id: 'firstblood', cat: 'First steps', name: 'First Blood', how: 'Get your first kill', pp: 10, stat: 'kills', need: 1 },
  { id: 'levelup', cat: 'First steps', name: 'Level Up', how: 'Level up in a run', pp: 10, best: 'level', need: 1 },
  { id: 'pick', cat: 'First steps', name: 'Pick Your Poison', how: 'Take your first power-up card', pp: 10, stat: 'picks', need: 1 },
  { id: 'crate', cat: 'First steps', name: 'Treasure Hunter', how: 'Open your first crate', pp: 15, stat: 'crates', need: 1 },
  { id: 'altar', cat: 'First steps', name: 'Altar Call', how: 'Summon a boss at the altar', pp: 20, stat: 'summons', need: 1 },
  { id: 'bossdown', cat: 'First steps', name: 'Boss Down', how: 'Beat your first round boss', pp: 50, stat: 'bosses', need: 1 },
  { id: 'blessed', cat: 'First steps', name: 'Blessed', how: 'Take your first deity blessing', pp: 20, stat: 'blessings', need: 1 },
  { id: 'comeback', cat: 'First steps', name: 'Back on Your Feet', how: 'Beat a round boss after going down in that run', pp: 25, stat: 'comebackBoss', need: 1 },
  { id: 'shopper', cat: 'First steps', name: 'Shopper', how: 'Buy your first Perfect Shop upgrade', pp: 15, stat: 'shopBuys', need: 1 },
  { id: 'reroll', cat: 'First steps', name: 'Lucky Roll', how: 'Use a reroll die on a level-up', pp: 15, stat: 'rerolls', need: 1 },
  // Kills
  { id: 'k100', cat: 'Kills', name: 'Centurion', how: '100 kills in one run', pp: 25, best: 'runKills', need: 100 },
  { id: 'k500', cat: 'Kills', name: 'Slayer', how: '500 kills in one run', pp: 75, best: 'runKills', need: 500 },
  { id: 'k1500', cat: 'Kills', name: 'Massacre', how: '1,500 kills in one run', pp: 150, best: 'runKills', need: 1500 },
  { id: 'kl1k', cat: 'Kills', name: 'Thousand Cuts', how: '1,000 lifetime kills', pp: 50, stat: 'kills', need: 1000 },
  { id: 'kl10k', cat: 'Kills', name: 'Ten Thousand', how: '10,000 lifetime kills', pp: 200, stat: 'kills', need: 10000 },
  { id: 'kl50k', cat: 'Kills', name: 'Fifty Thousand', how: '50,000 lifetime kills', pp: 400, stat: 'kills', need: 50000 },
  { id: 'multi', cat: 'Kills', name: 'Multi-Kill', how: 'Kill 10 enemies within 1 second', pp: 40, best: 'multi', need: 10 },
  { id: 'sweep', cat: 'Kills', name: 'Clean Sweep', how: 'Kill 50 enemies in a row without taking damage', pp: 75, best: 'noHitKills', need: 50 },
  { id: 'heads', cat: 'Kills', name: 'Headhunter', how: '100 headshot kills in one run', pp: 60, run: 'headKills', need: 100 },
  { id: 'elites', cat: 'Kills', name: 'Elite Hunter', how: 'Defeat 25 elite enemies in one run', pp: 60, run: 'eliteKills', need: 25 },
  // Bosses
  BOSS('The Gravewarden', 'The Gravewarden Falls'), BOSS('Thornmother', 'Root and Branch'), BOSS('Sandreaver', 'Sand in the Gears'), BOSS('Rimefang', 'Fang Shattered'),
  BOSS('Magmaw', 'Cooled Off'), BOSS('Vexaris', 'Vexed'), BOSS('Mossback', 'Mossback Down'), BOSS('Dreadknight', 'Fallen Knight'), BOSS('The Archmage', 'Spell Broken'),
  BOSS('The Flayed', 'Skin Deep'), BOSS('Rotgut', 'Gutted'), BOSS('Big Elvis', 'Left the Building'), BOSS('Uncle Gus', 'Sorry, Uncle Gus'), BOSS('Dreyar', "Dreyar's End"),
  { ...BOSS('The Visitor', 'Close Encounter'), pp: 150 }, { ...BOSS('Thermes', 'The Perfect Run'), pp: 300 },
  { id: 'fastboss', cat: 'Bosses', name: 'Speed Kill', how: 'Beat a round boss in under 60 seconds', pp: 100, stat: 'fastBoss', need: 1 },
  { id: 'cleanboss', cat: 'Bosses', name: 'Untouchable', how: 'Beat a round boss without taking damage', pp: 150, stat: 'noHitBoss', need: 1 },
  { id: 'earlyboss', cat: 'Bosses', name: 'Early Riser', how: 'Call a boss with more than 6:00 left on the clock, and beat it', pp: 100, stat: 'earlyBoss', need: 1 },
  { id: 'allbosses', cat: 'Bosses', name: 'Boss Rush', how: 'Beat all 16 bosses', pp: 500, all: BOSS_NAMES.map((n) => 'boss:' + n) },
  // Runs
  { id: 'win', cat: 'Runs', name: 'Survivor', how: 'Win a run', pp: 150, stat: 'wins', need: 1 },
  { id: 'winhard', cat: 'Runs', name: 'Hardened', how: 'Win a run on Hard', pp: 250, stat: 'winsHard', need: 1 },
  { id: 'flawless', cat: 'Runs', name: 'Flawless', how: 'Win a run without dying', pp: 300, stat: 'cleanWins', need: 1 },
  { id: 'fastwin', cat: 'Runs', name: 'Speedrunner', how: 'Win a run in under 35 minutes', pp: 200, stat: 'fastWin', need: 1 },
  { id: 'frugal', cat: 'Runs', name: 'Penny Pincher', how: 'Win a run opening 2 crates or fewer', pp: 150, stat: 'frugalWin', need: 1 },
  { id: 'spender', cat: 'Runs', name: 'Big Spender', how: 'Open 20 crates in one run', pp: 100, run: 'crates', need: 20 },
  { id: 'space', cat: 'Runs', name: 'Into the Void', how: 'Reach Crash Site Prime', pp: 150, stat: 'space', need: 1 },
  { id: 'runs10', cat: 'Runs', name: 'Regular', how: 'Finish 10 runs (win or lose)', pp: 75, stat: 'runs', need: 10 },
  { id: 'runs50', cat: 'Runs', name: 'Veteran', how: 'Finish 50 runs', pp: 200, stat: 'runs', need: 50 },
  // Weapons and elements
  { id: 'meleewin', cat: 'Weapons', name: 'Blade Only', how: 'Win a run carrying only melee weapons', pp: 200, stat: 'meleeWin', need: 1 },
  { id: 'gunwin', cat: 'Weapons', name: 'Trigger Happy', how: 'Win a run carrying only guns', pp: 200, stat: 'gunWin', need: 1 },
  { id: 'elements', cat: 'Elements', name: 'Elementalist', how: 'Win a run with each of the 6 elements', pp: 400, all: ['pyre', 'bastion', 'tempest', 'rime', 'gale', 'necro'].map((c) => 'winEl:' + c) },
  // Builds
  { id: 'glass', cat: 'Builds', name: 'Glass Cannon', how: 'Reach 3x damage', pp: 75, best: 'dmgX', need: 3 },
  { id: 'tank', cat: 'Builds', name: 'Tank', how: 'Reach 400 max HP', pp: 75, best: 'maxHp', need: 400 },
  { id: 'speed', cat: 'Builds', name: 'Speed Demon', how: 'Reach 2x move speed', pp: 75, best: 'speedX', need: 2 },
  { id: 'blades', cat: 'Builds', name: 'Blade Storm', how: 'Have 6 Orbiting Blades at once', pp: 75, best: 'orbit', need: 6 },
  { id: 'epics', cat: 'Builds', name: 'Lucky', how: 'Take 3 Epic cards in one run', pp: 100, run: 'epics', need: 3 },
  { id: 'stacked', cat: 'Builds', name: 'Stacked', how: 'Take the same card 8 times in one run', pp: 60, best: 'stack', need: 8 },
  { id: 'cdking', cat: 'Builds', name: 'Cooldown King', how: 'Cut your cooldowns by 60%', pp: 75, best: 'cdrPct', need: 60 },
  { id: 'armor', cat: 'Builds', name: 'Iron Wall', how: 'Reach 50% damage reduction', pp: 75, best: 'armorPct', need: 50 },
  { id: 'onetrick', cat: 'Builds', name: 'One-Trick', how: 'Win a run taking only one kind of card (5 or more of it)', pp: 250, stat: 'oneTrick', need: 1 },
  // Heroes
  HERO('selena', 'Selena'), HERO('knight', 'Sir Aldric'), HERO('ninja', 'Kiri'), HERO('corsair', 'Captain Saltvane'), HERO('kratia', 'Kratia'), HERO('bonelord', 'Bonelord'), HERO('ironwood', 'Ironwood'),
  { id: 'hero_trio', cat: 'Heroes', name: 'Ragmon, Blitz and Visitor', how: 'Win a run with each of Ragmon, Blitz and The Visitor', pp: 200, all: ['ragmon', 'veteran', 'grey'].map((c) => 'winCh:' + c) },
  // Modes
  { id: 'wave10', cat: 'Modes', name: 'Horde Wave 10', how: 'Reach wave 10 in Horde', pp: 100, best: 'wave', need: 10 },
  { id: 'wave25', cat: 'Modes', name: 'Horde Wave 25', how: 'Reach wave 25 in Horde', pp: 250, best: 'wave', need: 25 },
  { id: 'duels', cat: 'Modes', name: 'Duelist', how: 'Win 10 duels', pp: 100, stat: 'duelWins', need: 10 },
  { id: 'couch', cat: 'Modes', name: 'Best Friends', how: 'Win a run in local co-op', pp: 150, stat: 'couchWin', need: 1 },
  { id: 'five', cat: 'Modes', name: 'Party of Five', how: 'Win a run with 5 players online', pp: 200, stat: 'fiveWin', need: 1 },
  { id: 'dailies', cat: 'Modes', name: 'Daily Grind', how: 'Complete 7 daily challenges', pp: 100, stat: 'dailies', need: 7 },
];

const KEY = 'perfectrun.ach';
let cache = null, run = {}, saveT = 0;
function load() {
  if (!cache) { try { cache = JSON.parse(Profile.get(KEY) || 'null'); } catch { cache = null; } }
  if (!cache || typeof cache !== 'object') cache = {};
  cache.p = cache.p || {}; cache.done = cache.done || {};
  return cache;
}
function flush() { if (saveT) { clearTimeout(saveT); saveT = 0; } if (cache) Profile.set(KEY, JSON.stringify(cache)); }
function save() { if (!saveT) saveT = setTimeout(flush, 1000); } // kills tick many times a second: write at most once a second
// [current, needed] for one achievement
function progress(a) {
  const c = load();
  if (a.all) return [a.all.filter((s) => c.p[s] > 0).length, a.all.length];
  return [Math.min(a.need, Math.floor((a.run ? run[a.run] : c.p[a.stat || a.best]) || 0)), a.need];
}
function check(stat) {
  const c = load();
  for (const a of ACHIEVEMENTS) {
    if (c.done[a.id] || !(a.stat === stat || a.run === stat || a.best === stat || (a.all && a.all.includes(stat)))) continue;
    const [cur, need] = progress(a);
    if (cur < need) continue;
    c.done[a.id] = 1; addPP(a.pp); flush();
    if (Ach.onDone) Ach.onDone(a);
  }
}

export const Ach = {
  onDone: null, // (achievement) => void, set by the UI to show the toast
  add(stat, n = 1) { if (!n) return; const c = load(); c.p[stat] = (c.p[stat] || 0) + n; run[stat] = (run[stat] || 0) + n; save(); check(stat); },
  best(stat, v) { const c = load(); if (!(v > (c.p[stat] || 0))) return; c.p[stat] = v; save(); check(stat); },
  newRun() { run = {}; },
  inRun(stat) { return run[stat] || 0; },
  list() { const c = load(); return ACHIEVEMENTS.map((a) => { const [cur, need] = progress(a); return { ...a, cur, need, done: !!c.done[a.id] }; }); },
  flush,
};
