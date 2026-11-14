// Perfect Points (PP) and the permanent power-ups bought with them in the Perfect Shop.
// Saved on this device, shared by both couch seats. Ranks apply at the start of every run.
import { Profile } from './profile.js';
const KEY = 'perfectrun.meta';
const ADMIN_PP = 999999; // Admin can buy anything in the Perfect Shop

export const META = [
  { id: 'might', name: 'Might', icon: '⚔', max: 5, base: 50, per: '+5% damage', lore: 'Every blow you ever landed is remembered. The Archivist hands them back, sharpened.', apply: (s, r) => (s.dmg *= 1 + 0.05 * r) },
  { id: 'vitality', name: 'Vitality', icon: '♥', max: 5, base: 45, per: '+8% max health', lore: 'A heart that has stopped before beats stronger the next time.', apply: (s, r) => (s.maxHp = Math.round(s.maxHp * (1 + 0.08 * r))) },
  { id: 'mend', name: 'Mend', icon: '✚', max: 5, base: 60, per: '+0.25 health per second', lore: 'Wounds close on their own if you have bled enough in the past.', apply: (s, r) => (s.regen += 0.25 * r) },
  { id: 'aegis', name: 'Aegis', icon: '⛨', max: 5, base: 70, per: '3% less damage taken', lore: 'The memory of every hit you took becomes a wall.', apply: (s, r) => (s.armor = 1 - (1 - s.armor) * (1 - 0.03 * r)) },
  { id: 'fleetfoot', name: 'Fleetfoot', icon: '➤', max: 5, base: 50, per: '+3% move speed', lore: 'You have run this road before. Your legs know it.', apply: (s, r) => (s.speed *= 1 + 0.03 * r) },
  { id: 'haste', name: 'Haste', icon: '⏱', max: 5, base: 80, per: '3% faster ability cooldowns', lore: 'Time was cheaper the last time you spent it.', apply: (s, r) => (s.cdr *= 1 - 0.03 * r) },
  { id: 'frenzy', name: 'Frenzy', icon: '≫', max: 5, base: 80, per: '+4% attack speed', lore: 'The hands remember what the mind forgets.', apply: (s, r) => (s.rate *= 1 + 0.04 * r) },
  { id: 'leech', name: 'Leech', icon: '☠', max: 3, base: 120, per: 'Heal 1% of damage dealt', lore: 'A small gift from the one who keeps the dead. A very small gift.', apply: (s, r) => (s.lifesteal += 0.01 * r) },
  { id: 'learner', name: 'Quick Learner', icon: '✎', max: 5, base: 70, per: '+12% XP from kills', lore: 'The Archivist has read your story before. She whispers the next page.', apply: (s, r) => (s.xpGain *= 1 + 0.12 * r) },
  { id: 'dashmaster', name: 'Fleet Step', icon: '≡', max: 4, base: 70, per: '+12% dash distance', lore: 'The shortest path between two breaths.', dash: true },
  { id: 'headstart', name: 'Head Start', icon: '◎', max: 5, base: 40, per: '+12 PC at the start of a run', lore: 'The Archivist slips a few coins into your pocket. She will not say where from.', pc: 12 },
  { id: 'bed', name: 'Another Chance', icon: '✚', max: 2, base: 90, per: '+1 revive every run', lore: 'Death keeps a waiting list. The Archivist keeps losing your page.', beds: 1 }, // id stays 'bed' so ranks already bought carry over
  { id: 'magnet', name: 'Lodestone', icon: '⌖', max: 3, base: 55, per: 'Pickups are drawn from farther away', lore: 'Good things want to find you. Help them.', magnet: 1 },
  { id: 'seeker', name: 'Seeker', icon: '✦', max: 5, base: 100, per: '+20% more Perfect Point shards', lore: 'The crystals of old runs surface where you walk. Walk more.', seeker: 1 },
];
export const META_BY_ID = Object.fromEntries(META.map((m) => [m.id, m]));

export const costOf = (m, rank) => Math.round((m.base * (1 + 0.55 * rank)) / 5) * 5;

// Perks that were removed from the shop: ranks already bought are refunded in PP.
const RETIRED = { secondwind: { base: 250 }, jetpack: { base: 260 } }; // the jetpack is gear on the weapon wall now
function read() {
  try {
    const v = JSON.parse(Profile.get(KEY) || 'null');
    if (v && typeof v === 'object') {
      const out = { pp: Math.max(0, v.pp | 0), ranks: v.ranks || {}, spent: v.spent || 0, earned: v.earned || 0 };
      for (const [id, d] of Object.entries(RETIRED)) {
        const r = out.ranks[id] | 0;
        if (r || id in out.ranks) {
          let back = 0;
          for (let i = 0; i < r; i++) back += Math.round((d.base * (1 + 0.55 * i)) / 5) * 5;
          out.pp += back; out.spent = Math.max(0, out.spent - back);
          delete out.ranks[id];
          Profile.set(KEY, JSON.stringify(out));
        }
      }
      if (Profile.isAdmin()) out.pp = Math.max(out.pp, ADMIN_PP);
      return out;
    }
  } catch {}
  return { pp: Profile.isAdmin() ? ADMIN_PP : 0, ranks: {}, spent: 0, earned: 0 };
}
function write(m) { Profile.set(KEY, JSON.stringify(m)); return m; }

export const getMeta = read;
export const metaRank = (id) => (read().ranks[id] | 0);

// Add (or take away) PP. Reads before writing so two couch seats never overwrite each other.
export function addPP(n) { const m = read(); m.pp = Math.max(0, m.pp + n); if (n > 0) m.earned += n; return write(m); }

export function buy(id) {
  const m = read(), def = META_BY_ID[id];
  if (!def) return { ok: false, why: 'unknown' };
  const r = m.ranks[id] | 0;
  if (r >= def.max) return { ok: false, why: 'max' };
  const c = costOf(def, r);
  if (m.pp < c) return { ok: false, why: 'pp', need: c - m.pp };
  m.pp -= c; m.spent += c; m.ranks[id] = r + 1;
  write(m);
  return { ok: true, meta: m, cost: c };
}

// Give back every PP spent and reset all ranks.
export function refundAll() { const m = read(); m.pp += m.spent; m.spent = 0; m.ranks = {}; return write(m); }

// Fold the bought ranks into a player's stats (called from baseStats).
export function applyMeta(s) {
  const ranks = read().ranks;
  for (const d of META) { const r = ranks[d.id] | 0; if (r && d.apply) d.apply(s, r); }
  return s;
}

// Run-start extras that are not plain stats.
export function metaPerks() {
  const ranks = read().ranks, out = { pc: 0, beds: 0, revives: 0, magnet: 0, seeker: 0, dashDist: 1, jetpack: 0 };
  for (const d of META) {
    const r = ranks[d.id] | 0; if (!r) continue;
    if (d.pc) out.pc += d.pc * r;
    if (d.beds) out.beds += d.beds * r;
    if (d.revives) out.revives += d.revives * r;
    if (d.magnet) out.magnet += d.magnet * r;
    if (d.seeker) out.seeker += d.seeker * r;
    if (d.jet) out.jetpack = 1;
    if (d.dash) out.dashDist *= 1 + 0.12 * r;
  }
  return out;
}

// PP awarded when a run ends, on top of the shards picked up during it.
export function runReward({ win, round, kills, bosses }) {
  return Math.round(round * 6 + kills / 8 + (bosses || 0) * 15 + (win ? 120 : 0));
}
