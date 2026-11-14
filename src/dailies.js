// Daily Challenges: 50 challenges in four tiers. Every day (local midnight) three come up, one Easy, one Medium and a Hard one
// (an Elite one every third day). A finished one is claimed for PP on the title screen and replaced by another of its tier.
// Progress is per account (Profile key 'perfectrun.daily') and resets each day. Runs the CPU played count for nothing.
import { Profile } from './profile.js';
import { addPP } from './meta.js';

export const DAILY_TIERS = {
  1: { name: 'Easy', pp: 5 },
  2: { name: 'Medium', pp: 10 },
  3: { name: 'Hard', pp: 20 },
  4: { name: 'Elite', pp: 40 },
};

// stat: a counter that adds up over the day. best: the highest value reached in one run.
export const DAILIES = [
  // Easy
  { id: 'e1', tier: 1, text: 'Defeat 150 enemies', stat: 'kills', need: 150 },
  { id: 'e2', tier: 1, text: 'Get 25 headshot kills', stat: 'headKills', need: 25 },
  { id: 'e3', tier: 1, text: 'Get 40 melee kills', stat: 'meleeKills', need: 40 },
  { id: 'e4', tier: 1, text: 'Get 60 gun kills', stat: 'gunKills', need: 60 },
  { id: 'e5', tier: 1, text: 'Open 3 crates', stat: 'crates', need: 3 },
  { id: 'e6', tier: 1, text: 'Reach level 8 in a run', best: 'level', need: 8 },
  { id: 'e7', tier: 1, text: 'Collect 400 PC', stat: 'pc', need: 400 },
  { id: 'e8', tier: 1, text: 'Get 15 kills while in the air', stat: 'airKills', need: 15 },
  { id: 'e9', tier: 1, text: 'Defeat 5 elite enemies', stat: 'eliteKills', need: 5 },
  { id: 'e10', tier: 1, text: 'Use your element abilities 25 times', stat: 'casts', need: 25 },
  { id: 'e11', tier: 1, text: 'Finish a run', stat: 'runs', need: 1 },
  { id: 'e12', tier: 1, text: 'Reach round 2', best: 'round', need: 2 },
  { id: 'e13', tier: 1, text: 'Get 20 bow or crossbow kills', stat: 'bowKills', need: 20 },
  { id: 'e14', tier: 1, text: 'Defeat a champion', stat: 'champKills', need: 1 },
  { id: 'e15', tier: 1, text: 'Land 100 headshots', stat: 'headHits', need: 100 },
  { id: 'e16', tier: 1, text: 'Get 5 kills while riding a skateboard', stat: 'boardKills', need: 5 },
  { id: 'e17', tier: 1, text: 'Level up 10 times', stat: 'levels', need: 10 },
  { id: 'e18', tier: 1, text: 'Deal 50,000 damage', stat: 'dmg', need: 50000 },
  // Medium
  { id: 'm1', tier: 2, text: 'Defeat 600 enemies', stat: 'kills', need: 600 },
  { id: 'm2', tier: 2, text: 'Get 100 headshot kills', stat: 'headKills', need: 100 },
  { id: 'm3', tier: 2, text: 'Get 150 melee kills', stat: 'meleeKills', need: 150 },
  { id: 'm4', tier: 2, text: 'Get 200 gun kills', stat: 'gunKills', need: 200 },
  { id: 'm5', tier: 2, text: 'Open 8 crates', stat: 'crates', need: 8 },
  { id: 'm6', tier: 2, text: 'Reach level 15 in a run', best: 'level', need: 15 },
  { id: 'm7', tier: 2, text: 'Collect 2,000 PC', stat: 'pc', need: 2000 },
  { id: 'm8', tier: 2, text: 'Get 60 kills while in the air', stat: 'airKills', need: 60 },
  { id: 'm9', tier: 2, text: 'Defeat 20 elite enemies', stat: 'eliteKills', need: 20 },
  { id: 'm10', tier: 2, text: 'Defeat a round boss', stat: 'bosses', need: 1 },
  { id: 'm11', tier: 2, text: 'Reach round 3', best: 'round', need: 3 },
  { id: 'm12', tier: 2, text: 'Get 300 kills in one run', best: 'runKills', need: 300 },
  { id: 'm13', tier: 2, text: 'Parry 15 attacks with a shield', stat: 'parries', need: 15 },
  { id: 'm14', tier: 2, text: 'Get 25 kills with gear (turrets, staffs, drones and more)', stat: 'gearKills', need: 25 },
  { id: 'm15', tier: 2, text: 'Defeat 4 champions', stat: 'champKills', need: 4 },
  { id: 'm16', tier: 2, text: 'Use your element abilities 100 times', stat: 'casts', need: 100 },
  // Hard
  { id: 'h1', tier: 3, text: 'Defeat 1,500 enemies', stat: 'kills', need: 1500 },
  { id: 'h2', tier: 3, text: 'Get 300 headshot kills', stat: 'headKills', need: 300 },
  { id: 'h3', tier: 3, text: 'Defeat 3 round bosses', stat: 'bosses', need: 3 },
  { id: 'h4', tier: 3, text: 'Reach round 4', best: 'round', need: 4 },
  { id: 'h5', tier: 3, text: 'Get 800 kills in one run', best: 'runKills', need: 800 },
  { id: 'h6', tier: 3, text: 'Get 150 kills while in the air', stat: 'airKills', need: 150 },
  { id: 'h7', tier: 3, text: 'Beat a round boss without dying in that run', stat: 'cleanBoss', need: 1 },
  { id: 'h8', tier: 3, text: 'Defeat 50 elite enemies', stat: 'eliteKills', need: 50 },
  { id: 'h9', tier: 3, text: 'Collect 6,000 PC', stat: 'pc', need: 6000 },
  { id: 'h10', tier: 3, text: 'Get 400 melee kills', stat: 'meleeKills', need: 400 },
  // Elite
  { id: 'x1', tier: 4, text: 'Win a run', stat: 'wins', need: 1 },
  { id: 'x2', tier: 4, text: 'Reach round 6', best: 'round', need: 6 },
  { id: 'x3', tier: 4, text: 'Defeat 6 round bosses', stat: 'bosses', need: 6 },
  { id: 'x4', tier: 4, text: 'Get 2,000 kills in one run', best: 'runKills', need: 2000 },
  { id: 'x5', tier: 4, text: 'Win a run on Hard', stat: 'winsHard', need: 1 },
  { id: 'x6', tier: 4, text: 'Win a run without dying', stat: 'cleanWins', need: 1 },
];
export const DAILY_BY_ID = Object.fromEntries(DAILIES.map((d) => [d.id, d]));

const KEY = 'perfectrun.daily';
const DAY = 86400000;
// Today's number, counted in the player's own time zone so the reset lands at their midnight.
export function dayNumber(now = new Date()) { return Math.floor((now.getTime() - now.getTimezoneOffset() * 60000) / DAY); }
export function msToReset(now = new Date()) { const t = new Date(now); t.setHours(24, 0, 0, 0); return t - now; }

// A fixed shuffle of each tier, walked one step a day, so every challenge comes up once before any repeats.
function shuffled(list, seed) {
  const a = list.slice();
  let s = (seed * 2654435761) >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function pickFromTier(tier, k, salt) {
  const list = DAILIES.filter((d) => d.tier === tier);
  return shuffled(list, salt + tier * 1009)[k % list.length]; // the same order every pass, so nothing repeats close together
}
// The three challenges for a given day.
const forCache = new Map();
export function dailiesFor(day = dayNumber()) {
  if (forCache.has(day)) return forCache.get(day);
  const out = [pickFromTier(1, day, 7), pickFromTier(2, day, 13)];
  // Hard on two days out of three, Elite on the third. Each keeps its own count so it still runs through its whole list.
  if (day % 3 === 2) out.push(pickFromTier(4, Math.floor(day / 3), 19));
  else out.push(pickFromTier(3, day - Math.floor((day + 1) / 3), 17));
  forCache.set(day, out);
  return out;
}

// Since 2026-11-14 (Nutty): the three challenges live in a box on the title screen. Finishing one does not pay by itself:
// it is ticked off and shows a Claim button. Claiming pays the PP and puts a new challenge of the same tier in its place,
// counted from zero. Each slot keeps its own count: { id, cur, done }.
let cache = null;
function fresh(day) { return { day, slots: dailiesFor(day).map((d) => ({ id: d.id, cur: 0, done: 0 })) }; }
function load() {
  const day = dayNumber();
  if (!cache) { try { cache = JSON.parse(Profile.get(KEY) || 'null'); } catch { cache = null; } }
  if (cache && typeof cache === 'object' && cache.day === day && !Array.isArray(cache.slots)) {
    // A save from before the box: carry today's progress over; anything already paid gets a new challenge.
    const old = cache; cache = fresh(day);
    cache.slots = cache.slots.map((s) => { const d = DAILY_BY_ID[s.id]; if (old.done && old.done[d.id]) return { id: reroll(d, cache.slots.map((q) => q.id)), cur: 0, done: 0 };
      return { id: d.id, cur: Math.min(d.need, d.best ? (old.best || {})[d.best] || 0 : (old.p || {})[d.stat] || 0), done: 0 }; });
  }
  if (!cache || typeof cache !== 'object' || cache.day !== day || !Array.isArray(cache.slots)) {
    // A new day. Anything finished yesterday and never claimed is paid now, so nothing earned is lost.
    if (cache && Array.isArray(cache.slots)) for (const s of cache.slots) { const d = DAILY_BY_ID[s.id]; if (d && s.done) addPP(DAILY_TIERS[d.tier].pp); }
    cache = fresh(day);
    Profile.set(KEY, JSON.stringify(cache));
  }
  cache.slots = cache.slots.filter((s) => DAILY_BY_ID[s.id]);
  if (cache.slots.length !== 3) cache = fresh(day);
  return cache;
}
// Another challenge of the same tier: never one that is on the board now, never the one just finished.
function reroll(d, onBoard) {
  const pool = DAILIES.filter((q) => q.tier === d.tier && q.id !== d.id && !onBoard.includes(q.id));
  return (pool[Math.floor(Math.random() * pool.length)] || d).id;
}
let saveT = 0;
function save() {
  // Kills tick many times a second: write at most once a second.
  if (saveT) return;
  saveT = setTimeout(() => { saveT = 0; if (cache) Profile.set(KEY, JSON.stringify(cache)); }, 1000);
}
function flush() { if (saveT) { clearTimeout(saveT); saveT = 0; } if (cache) Profile.set(KEY, JSON.stringify(cache)); }

export const Dailies = {
  onDone: null, // (daily, pp) => void, set by the game to show the toast
  today() {
    const c = load();
    return c.slots.map((s, i) => { const d = DAILY_BY_ID[s.id]; return { ...d, slot: i, cur: Math.min(s.cur || 0, d.need), done: !!s.done, pp: DAILY_TIERS[d.tier].pp, tierName: DAILY_TIERS[d.tier].name }; });
  },
  add(stat, n = 1) {
    if (!n) return; const c = load(); let hit = false;
    for (const s of c.slots) { const d = DAILY_BY_ID[s.id]; if (d.stat !== stat || s.done) continue; s.cur = (s.cur || 0) + n; hit = true; this.check(s, d); }
    if (hit) save();
  },
  best(stat, v) {
    const c = load(); let hit = false;
    for (const s of c.slots) { const d = DAILY_BY_ID[s.id]; if (d.best !== stat || s.done || v <= (s.cur || 0)) continue; s.cur = v; hit = true; this.check(s, d); }
    if (hit) save();
  },
  check(s, d) {
    if (s.done || (s.cur || 0) < d.need) return;
    s.done = 1; s.cur = d.need;
    flush();
    if (this.onDone) this.onDone(d, DAILY_TIERS[d.tier].pp);
  },
  // Claim a finished challenge: pays its PP and swaps in a new one of the same tier. Returns the PP paid (0 if not claimable).
  claim(slot) {
    const c = load(), s = c.slots[slot], d = s && DAILY_BY_ID[s.id];
    if (!d || !s.done) return 0;
    const pp = DAILY_TIERS[d.tier].pp;
    addPP(pp);
    c.slots[slot] = { id: reroll(d, c.slots.map((q) => q.id)), cur: 0, done: 0 };
    flush();
    return pp;
  },
  flush,
};
