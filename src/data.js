// Game data: classes, weapons, biomes, enemies, bosses, NPCs, blessings, crates.

export const CONFIG = {
  maxPlayers: 5,
  rounds: 6,
  voteSeconds: 10,
  pcPerKill: 2,
  pcPerBoss: 300, ppPerBoss: 3,
  cratePrice: 100, // Nutty 2026-11-12 14:45 (was 30, then 50); game.js price() raises it every round
  bedPrice: 60,
  baseHp: 100,
  walk: 6.27,
  sprint: 9.69,
  jump: 7.8,
  gravity: 22,
  mapHalf: 208, // maps are 30% wider than they were (Nutty 2026-11-12); MAPK is that factor for anything laid out by hand
  mapK: 1.3,
  minSpawnDist: 45, // nothing ever appears closer than this to any player
};

export const CLASSES = [
  {
    id: 'pyre', name: 'Ember', element: 'Fire', color: 0xd84a1b, accent: 0xffa040, css: '#ff7a2a',
    tagline: 'Burn it all down.',
    q: { id: 'fireball', name: 'Fireball', cd: 5, desc: 'Hurl a blazing fireball that flies through every enemy on its way (130 m), burning each one, then explodes where it lands.' },
    r: { id: 'inferno', name: 'Inferno', cd: 10, desc: 'Erupt in a wide ring of fire that scorches everything around you for 5s while blasts keep going off inside it.' },
    e: { id: 'firewall', name: 'Wall of Fire', cd: 10, desc: 'Raise a long, tall wall of flame across your crosshair for 6 seconds. Anything caught in it or walking through burns hard.' },
    more: [
      { id: 'breath', name: 'Dragon Breath', cd: 10, desc: 'Breathe a stream of fire that is at full length the moment you cast it, no holding needed. For 5.5s it sweeps wherever you face, burning everything in it.' },
      { id: 'flameweap', name: 'Flaming Weapons', cd: 10, desc: 'Set whatever you are holding on fire until this is ready again. Blades and fists hit harder, reach farther and trail fire; bullets, arrows and blasts hit harder too. Every hit sets the enemy alight, and they keep burning until they die or the fire goes out.' },
      { id: 'minisun', name: 'Mini Sun', cd: 12, desc: 'Hang a small blazing sun in the air at your crosshair for 8s. It scorches and sets alight every enemy near it, and each kill it gets makes it bigger, hotter and wider. When it burns out it shrinks, then goes off in a big bang that blasts everything nearby and leaves a spinning galaxy.' },
      { id: 'sunlance', name: 'Sunlance', cd: 12, desc: 'Call a wide beam of sunlight down from the sky onto your crosshair. For 3s it lights the whole area like daylight and burns everything inside it, on the ground or in the air, for huge damage.' },
      { id: 'dragon', name: 'Dragon', cd: 20, desc: 'Summon a giant red dragon in a ring of fire. For 26s it flies with you, circling overhead, and dives on your enemies breathing a river of fire that leaves the ground burning. It climbs to reach bosses and anything that flies.' },
      { id: 'seekers', name: 'Homing Fireballs', cd: 5, desc: 'Loose 3 flaming skulls that hunt down the nearest enemies by themselves and explode on impact.' },
    ],
  },
  {
    id: 'bastion', name: 'Quake', element: 'Earth', color: 0x7a5a3a, accent: 0xd9a25a, css: '#d9a25a',
    tagline: 'The earth bends to you.',
    q: { id: 'boulder', name: 'Boulder Toss', cd: 5, desc: 'Rip a boulder out of the ground and hurl it at your crosshair. It smashes on impact, stunning and scattering everything nearby.' },
    r: { id: 'rockarmor', name: 'Rock Armor', cd: 10, desc: 'Stone slabs clamp on to your body and you take no damage at all until Rock Armor is ready again. Every hit the armor takes shocks the ground, knocking back and stunning enemies around you.' },
    e: { id: 'pillars', name: 'Pillar Burst', cd: 10, desc: 'Stamp the ground: tall, jagged spikes of rock erupt under every enemy within 12 m, launching, stunning and crushing them. No shot gets through the rocks while they stand.' },
    more: [
      { id: 'orbit', name: 'Boulder Orbit', cd: 10, desc: 'Three rocks rise and circle you. While they circle they block incoming attacks. They break one at a time: each crumbles after blocking three. Each press hurls one at your crosshair. The cooldown only starts once all three are thrown.' },
      { id: 'meteor', name: 'Meteor Call', cd: 10, desc: 'Mark a spot with your crosshair. Two seconds later a giant flaming rock falls from the sky and crushes everything there.' },
      { id: 'golem', name: 'Golem', cd: 30, desc: 'A towering rock golem breaks out of the ground in front of you and rises to his full height. For 25s he walks with you and hurls huge boulders at every enemy within 40 m. Press the button again to let him roam free, and again to call him back. He crumbles to rubble when his time or his health runs out.' },
      { id: 'stomp', name: 'Seismic Stomp', cd: 10, desc: 'Leap up and slam the ground. Slabs of rock burst up, chunks fly in every direction, and everything within 15 m is staggered and takes heavy damage.' },
    ],
  },
  {
    id: 'tempest', name: 'Arc', element: 'Storm', color: 0x2c3f8f, accent: 0x8fb4ff, css: '#b57bff',
    tagline: 'Strike first. Strike everywhere.',
    q: { id: 'chain', name: 'Chain Lightning', cd: 5, desc: 'A thick braid of lightning strands that snap together on one focal point at the far end, going straight through everything in its path and striking every enemy it touches. The current also reflects to nearby enemies, and the braid stays up for 4s, striking anything that walks into it.' },
    r: { id: 'storm', name: 'Thunderstorm', cd: 10, desc: 'Call a wide storm cell (26 m across) that hammers the whole area with lightning for 4s. Every bolt stays up until the storm ends and hits anything that touches it.' },
    e: { id: 'shockwave', name: 'Thunder Shockwave', cd: 10, desc: 'Slam the ground and send a tight ring of electricity racing 32 m in every direction. Everything it crosses is badly shocked.' },
    more: [
      { id: 'fence', name: 'Tesla Fence', cd: 12, desc: 'Place two posts, one per press, anywhere you can aim. An electric fence joins them however far apart they are and does massive damage to whoever walks into it. It stands for 15s and takes 50 hits before it breaks. It recharges once the fence is gone.' },
      { id: 'blink', name: 'Blink', cd: 5, desc: 'Hold the button and a blue circle appears on the ground: move it anywhere your crosshair can reach, however far. Let go and you are there at once, and the spot you left shocks every enemy near it. Press again within 8s to snap back to where you started; the icon counts the seconds down.' },
    ],
  },
  {
    id: 'rime', name: 'Tundra', element: 'Frost', color: 0x2f7fa8, accent: 0xaee8ff, css: '#3f86ff',
    tagline: 'Everything stops.',
    q: { id: 'shards', name: 'Ice Shards', cd: 5, desc: 'Four large diamond crystals of ice form around you and dart at the nearest enemies, shattering on impact and chilling everything they hit.' },
    r: { id: 'barrier', name: 'Ice Barrier', cd: 10, desc: 'Raise a wall of ice ahead of you for 8s. Anything that touches it is locked inside an ice crystal for 10 seconds, however big.' },
    e: { id: 'tsunami', name: 'Tsunami', cd: 10, desc: 'A towering wave of water surges forward and drowns a wide spread of enemies.' },
    more: [
      { id: 'rain', name: 'Healing Rain', cd: 10, desc: 'Call down a small, heavy rain storm for 7s. Its raindrops heal you and every teammate under it, and are toxic to every enemy caught in it.' },
      { id: 'whirl', name: 'Whirlpool', cd: 10, desc: 'Open a spinning whirlpool at your crosshair for 6s and steer it: it follows wherever you aim. It drags enemies in, traps and staggers them, and hurts more the longer they stay in it.' },
      { id: 'jet', name: 'Pressure Jet', cd: 5, desc: 'Fire a thin, high-pressure stream of water along your crosshair. It pierces through every enemy and staggers them until it runs out.' },
      { id: 'polaris', name: 'Polaris', cd: 30, desc: 'A huge arctic bear bursts up out of the ice and fights for you for 25s. He runs down enemies by himself, rears up to claw them, bites, and pounces from a distance. What he hits is often frozen solid.' },
      { id: 'snowball', name: 'Snowball', cd: 10, desc: 'Hop into a snowball for 16s and roll through enemies. It grows as it rolls and hits harder the bigger it gets. Anything it touches is slowed for 3s.' },
      { id: 'zero', name: 'Absolute Zero', cd: 10, desc: 'Every enemy near you stops dead for 5s, and so does every enemy shot in mid-air.' },
    ],
  },
  {
    id: 'gale', name: 'Gale', element: 'Wind', color: 0x3f8a6c, accent: 0xbaffea, css: '#dfe4ea',
    tagline: 'Never where they aim.',
    q: { id: 'veil', name: 'Storm Veil', cd: 5, desc: 'Unleash a thick, howling curtain of wind in a wide cone ahead for 3s. It keeps shoving enemies back, slashes them and slows them while they are inside.' },
    r: { id: 'cyclone', name: 'Tornado', cd: 10, desc: 'Unleash a tornado that drags enemies in and shreds them.' },
    e: { id: 'eye', name: 'Eye of the Storm', cd: 10, desc: 'Wrap yourself in a huge swirl of wind for 5s. Nothing can hurt you inside it, enemy shots are deflected back at their shooters, and enemies that touch the swirl are flung away. You can still shoot out.' },
    more: [
      { id: 'cloud', name: 'Cloud Form', cd: 10, desc: 'Turn into drifting mist until Cloud Form is ready again. You pass straight through enemies and attacks, nothing can see you, and you can keep attacking the whole time.' },
      { id: 'airshot', name: 'Airshot', cd: 6, desc: 'Fire a spinning ball of hard wind straight ahead. It tears through every enemy in its path for high damage. Every impact scatters the crowd: whoever it hits, and everyone standing near them, is sent flying.' },
      { id: 'tornado', name: 'Whirlwind', cd: 10, desc: 'Summon a wide, dark tornado you steer with your crosshair for 6s. It drags in everything nearby and tears at it hard. Whoever falls into it is sent to the top of the funnel and held there, then dropped. It also swallows enemy shots.' },
    ],
  },
  {
    id: 'necro', name: 'Necromancer', element: 'Death', color: 0x2c3a2a, accent: 0x9be36a, css: '#9be36a',
    tagline: 'Nothing stays buried.',
    q: { id: 'lifedrain', name: 'Life Drain', cd: 5, desc: 'Latch onto the enemy at your crosshair and drain its life into yourself for 3s. It bleeds the whole time, and a long enough drain kills it.' },
    r: { id: 'acid', name: 'Acid Splash', cd: 10, desc: 'Drop a huge puddle of acid at your feet for 8s. It burns and can kill, slows everything wading through it, and leaves each enemy it touched poisoned for 3s more.' },
    e: { id: 'raise', name: 'Raise the Dead', cd: 10, desc: 'For 10s every enemy you kill gets back up and fights for you for 10 seconds, then falls for good. In a duel, three of the dead climb out of the ground and hunt your opponent.' },
    more: [
      { id: 'vines', name: 'Black Thorn Vines', cd: 10, desc: 'Huge black-rosed vines burst from the ground at your crosshair. Enemies can walk through them but are torn up the whole time they are inside. When the cooldown runs out the thorns fly off into every enemy nearby, and then it recharges again.' },
      { id: 'scythe', name: "Reaper's Scythe", cd: 5, desc: 'A giant ghostly scythe sweeps a full circle around you, cutting down everything in reach.' },
      { id: 'ghostwalk', name: 'Ghost Walk', cd: 10, desc: 'Your body stays behind while your spirit runs ahead for 6s, faster and untouchable, free to scout and attack. Then you snap back to your body. Press again to snap back early.' },
      { id: 'crows', name: 'Crow Swarm', cd: 10, desc: 'A swarm of red-eyed crows dives from the sky onto your crosshair and tears at everything there in all directions for 5s.' },
      { id: 'supper', name: 'Last Supper', cd: 10, desc: 'For the next 8s you heal a little for every enemy that dies. In a duel you heal a little for every hit you land.' },
      { id: 'finger', name: 'Finger of Death', cd: 10, desc: 'Every enemy around you except bosses and champions dies instantly, its soul leaving its body. In a duel it takes a fifth of your opponent\'s health instead.' },
    ],
  },
];
export const CLASS_BY_ID = Object.fromEntries(CLASSES.map((c) => [c.id, c]));
// Customize (Element page): every cooldown an element owns. Its first three are the ones it starts with; the rest come from the Elemental Vault.
for (const c of CLASSES) c.pool = [c.q, c.r, c.e, ...(c.more || [])];
// The element with a player's own three picks ([q, r, e] ids) in its slots. Anything invalid or doubled falls back to the standard three.
export function classWith(id, abs) {
  const c = CLASS_BY_ID[id];
  if (!c || !Array.isArray(abs) || abs.length !== 3 || new Set(abs).size !== 3) return c;
  const pick = abs.map((a) => c.pool.find((x) => x.id === a));
  return pick.some((x) => !x) ? c : { ...c, q: pick[0], r: pick[1], e: pick[2] };
}
// The preview clip that shows a cooldown: the element's own three are filed by slot, vault ones by their id.
export function clipName(c, ab) {
  const base = CLASS_BY_ID[c.id];
  for (const k of ['q', 'r', 'e']) if (base[k].id === ab.id) return c.id + '-' + k;
  return 'ab-' + ab.id;
}

// Every gun handles like its real-world type (Nutty 2026-11-12), and every gun added later must get the same fields:
//   rec: recoil in degrees: v = muzzle climb per shot, h = sideways wander, b = steady sideways pull (+ = right),
//        ret = how much of the kick settles back by itself, grow = extra climb per shot of a burst, first = the first
//        shot's extra kick, cap = where a long burst's climb levels off, bloom = spread added per shot of automatic fire.
//   fall: [full damage to this many metres, weakest from this many, the weakest share]. hand: how fast it comes up to aim.
//   scope: true = looked THROUGH in first person (scope.js: clear glass, zoom scopeFov, reticle). Otherwise the eye lines
//   up on the gun's own sights (weapons.js sightOf: red dot, or the front sight post) and the shot lands on them.
// Every melee weapon has two attacks that alternate, true to its type (meleemoves.js).
// kind: melee | gun. Damage per hit/pellet. rate = seconds between attacks. Melee arc = total degrees the swing covers; every melee weapon shares the spear's range (4.8) and trail-sized sweep.
import { SWORD_SHIELD_DATA } from './shields.js';
// Sword-and-shield pairs (src/shields.js): one-handed melee that can also block and parry (Player.blockStep).
export const WEAPONS = [
  ...SWORD_SHIELD_DATA,
  { id: 'knife', name: 'Combat Knife', kind: 'melee', dmg: 34, rate: 0.3, range: 6.2, arc: 70, desc: 'Fast and vicious up close.' },
  { id: 'sword', name: 'Longsword', kind: 'melee', dmg: 70, rate: 0.55, range: 6.2, arc: 165, desc: 'Wide sweeping cuts.' },
  { id: 'katana', name: 'Katana', kind: 'melee', dmg: 52, rate: 0.42, range: 6.2, arc: 120, desc: 'Folded steel. Quick, clean cuts.' },
  { id: 'spear', name: 'War Spear', kind: 'melee', dmg: 86, rate: 0.7, range: 8.4, arc: 40, desc: 'Long reach, wide sweeping thrusts.' },
  { id: 'axe', name: 'Battle Axe', kind: 'melee', dmg: 118, rate: 0.9, range: 6.2, arc: 150, desc: 'A one-hand viking bearded axe with brass inlay. Swings alternate overhead chops and wide cuts.' },
  { id: 'warhammer', name: 'Warhammer', kind: 'melee', dmg: 140, rate: 1.1, range: 6.2, arc: 100, kb: 12, desc: 'Crushing blows that hurl enemies back.' },
  { id: 'claws', name: 'Claws', kind: 'melee', fist: true, dmg: 30, rate: 0.26, range: 6.2, arc: 110, desc: 'Triple blades on both fists. Fast raking slashes, right hand then left.' },
  { id: 'lucille', name: 'Lucille', kind: 'melee', dmg: 100, rate: 0.75, range: 6.2, arc: 135, kb: 12, desc: 'A baseball bat wrapped in barbed wire. Brutal, and it knocks them flying.' },
  { id: 'machete', name: 'Machete', kind: 'melee', dmg: 54, rate: 0.42, range: 6.2, arc: 125, desc: 'A broad survival blade. Fast, heavy chops.' },
  { id: 'fireaxe', name: 'Fire Axe', kind: 'melee', dmg: 135, rate: 0.95, range: 6.2, arc: 150, desc: 'Hickory-handled rescue axe, red head with a bright steel edge and a glass-breaker spike. Chops alternate with wide cuts.' },
  { id: 'sledge', name: 'Sledgehammer', kind: 'melee', dmg: 185, rate: 1.3, range: 6.2, arc: 110, kb: 17, desc: 'A long-handled demolition hammer. Slow, and nothing stands up to it.' },
  { id: 'chainsaw', name: 'Chainsaw', kind: 'melee', dmg: 30, rate: 0.2, range: 6.2, arc: 90, kb: 3, desc: 'Roaring two-handed saw. Hold the attack to keep the motor running: it drives in, then rips across, over and over.' },
  { id: 'whip', name: 'Bullwhip', kind: 'melee', dmg: 55, rate: 0.5, range: 9.5, arc: 50, desc: 'A long lash with the longest reach of any melee weapon.' },
  { id: 'alienblaster', tap: true, name: 'Alien Blaster', kind: 'gun', dmg: 46, rate: 0.16, mag: 14, reload: 1.3, spread: 0.006, auto: false, quiet: true, tracer: [1, 0.12, 0.1], beamLen: 9, kick: 0.35, fall: [40, 90, 0.7], hand: 13, rec: { v: 0.7, h: 0.3, ret: 0.9 }, desc: 'Strange alien pistol. Fires fast semi-auto bursts of short red beams that hit hard.' },
  { id: 'pistol', tap: true, name: 'Striker Pistol', kind: 'gun', dmg: 27, rate: 0.2, mag: 17, reload: 1.1, spread: 0.008, auto: false, fall: [25, 60, 0.55], hand: 14, rec: { v: 1.3, h: 0.4, ret: 0.85 }, desc: 'Polymer service pistol. Fast and reliable, 17 in the mag.' },
  { id: 'smg', name: 'Tactical SMG', kind: 'gun', dmg: 13, rate: 0.068, mag: 36, reload: 1.6, spread: 0.035, auto: true, fall: [18, 48, 0.5], hand: 13, rec: { v: 0.22, h: 0.42, ret: 0.6, grow: 0.04, cap: 9, bloom: 0.0022 }, desc: 'Compact and flat-shooting. Sprays fast at close range.' },
  { id: 'ar', name: 'Carbine', kind: 'gun', dmg: 20, rate: 0.092, mag: 30, reload: 1.8, spread: 0.014, auto: true, fall: [45, 100, 0.75], hand: 11, rec: { v: 0.26, h: 0.28, b: 0.05, ret: 0.6, grow: 0.04, cap: 8, bloom: 0.0015 }, desc: 'Short-barrel carbine with a red dot. All-round automatic.' },
  { id: 'ak', name: 'AK-47', kind: 'gun', dmg: 26, rate: 0.1, mag: 30, reload: 2.3, spread: 0.02, auto: true, kick: 0.6, adsBack: 0.7, hand: 9.5, fall: [38, 90, 0.7], rec: { v: 0.42, h: 0.5, b: 0.2, ret: 0.5, grow: 0.05, first: 1.6, cap: 11, bloom: 0.003 }, desc: 'Stamped steel and wood. Hits harder than the Carbine and kicks up and to the right; fire it in short bursts. Aimed through its iron sights.' },
  { id: 'shotgun', name: 'Combat Shotgun', kind: 'gun', dmg: 12, pellets: 9, rate: 0.55, mag: 7, reload: 2.1, spread: 0.085, auto: false, fall: [9, 28, 0.3], hand: 10, rec: { v: 4, h: 1.0, ret: 0.8 }, desc: 'Semi-auto 12 gauge. Nine pellets of pure argument.' },
  { id: 'coach', name: 'Tactical Double', kind: 'gun', dmg: 17, pellets: 8, rate: 0.35, mag: 2, reload: 1.6, spread: 0.09, auto: false, fall: [8, 24, 0.25], hand: 10.5, rec: { v: 5.5, h: 1.3, ret: 0.8 }, desc: 'Railed side-by-side defender. Two barrels, eight pellets each.' },
  { id: 'dmr', scope: true, scopeFov: 9, reticle: 'chevron', name: 'Marksman Rifle', kind: 'gun', dmg: 85, rate: 0.6, mag: 10, reload: 2.0, spread: 0.001, auto: false, pierce: 3, hand: 8.5, rec: { v: 2.2, h: 0.45, ret: 0.85 }, desc: 'Suppressed precision rifle. Pierces through 3 enemies.' },
  // More firearms. Optional fields: quiet (no muzzle flash), kick (view kick), tracer (colour),
  // proj ('rocket' | 'grenade': a visible projectile that explodes: radius, falloff, kb, speed),
  // spin (spin-up seconds), spreadMax / moveMul (minigun: spread widening, slower movement).
  { id: 'sniper', scope: true, scopeFov: 6, name: 'Sniper Rifle', kind: 'gun', dmg: 170, rate: 1.15, mag: 5, reload: 2.8, spread: 0.0005, auto: false, pierce: 2, kick: 1.4, hand: 7, rec: { v: 5.5, h: 0.7, ret: 0.9 }, desc: 'Chassis bolt-action. One slow shot that goes through two enemies.' },
  { id: 'pdw', name: 'Suppressed PDW', kind: 'gun', dmg: 15, rate: 0.085, mag: 40, reload: 1.5, spread: 0.012, auto: true, quiet: true, tracer: [0.75, 0.8, 0.85], kick: 0.2, fall: [22, 55, 0.55], hand: 13, rec: { v: 0.17, h: 0.26, ret: 0.65, grow: 0.03, cap: 7, bloom: 0.0012 }, desc: 'Compact and silenced. Tight, steady automatic fire.' },
  { id: 'magnum', tap: true, name: 'Magnum Revolver', kind: 'gun', dmg: 95, rate: 0.75, mag: 6, reload: 2.4, spread: 0.002, auto: false, kick: 1.3, fall: [35, 80, 0.65], hand: 12, rec: { v: 5, h: 0.9, ret: 0.8 }, desc: 'Stainless, compensated hand cannon. Slow, heavy rounds.' },
  { id: 'crossbow', scope: true, scopeFov: 18, reticle: 'ranger', name: 'Crossbow', kind: 'gun', bolt: true, boltSpeed: 95, dmg: 190, rate: 0.9, mag: 1, reload: 1.3, spread: 0.001, auto: false, pierce: 2, quiet: true, tracer: [0.85, 0.7, 0.45], kick: 0.4, hand: 9, rec: { v: 0.8, h: 0.2, ret: 0.9 }, desc: 'Silent. One heavy bolt that skewers two enemies.' },
  { id: 'longbow', name: 'Longbow', kind: 'gun', bow: true, dmg: 150, rate: 0.5, mag: 1, reload: 0, spread: 0, auto: false, proj: 'arrow', speed: 75, minSpeed: 22, draw: 0.9, nock: 0.5, pierce: 2, quiet: true, kick: 0.3, range: 120, tracer: [0.85, 0.75, 0.55], adsBack: 0.55, adsUp: 0.06, desc: 'Hold to draw, let go to loose. A quick tap lobs a weak arrow; a full draw flies flat and fast and skewers two enemies.' },
  { id: 'grenadel', name: 'Grenade Launcher', kind: 'gun', dmg: 75, rate: 0.65, mag: 6, reload: 3.6, spread: 0, auto: false, proj: 'grenade', radius: 4.8, falloff: 0.45, kb: 9, speed: 29, kick: 0.9, adsBack: 0.9, adsUp: 0.15, hand: 8, rec: { v: 2.6, h: 0.5, ret: 0.85 }, desc: 'Six-shot revolving launcher. Lobs grenades that blow up on impact.' },
  { id: 'rocket', name: 'Rocket Launcher', kind: 'gun', dmg: 320, rate: 0.8, mag: 1, reload: 2.8, spread: 0, auto: false, proj: 'rocket', radius: 7.5, falloff: 0.5, kb: 16, speed: 62, kick: 1.5, adsBack: 1.15, adsUp: 0.19, hand: 6.5, rec: { v: 1.8, h: 0.6, ret: 0.8 }, desc: 'Shoulder-fired. One rocket, huge blast. You are never hurt by it.' },
  { id: 'minigun', name: 'Minigun', kind: 'gun', dmg: 8, rate: 0.036, mag: 300, reload: 5.5, spread: 0.018, spreadMax: 0.075, auto: true, spin: 0.6, moveMul: 0.55, kick: 0.12, adsBack: 1.0, adsUp: 0.22, hand: 6, rec: { v: 0.02, h: 0.2, ret: 0.3 }, desc: 'Barrels spin up for 0.6s, then it never stops. Spread widens; you move slowly.' },
  // range: how far the shot reaches (default 160). rapid: hits and effects are thinned like the minigun's.
  // energy: the magazine is a charge bar shown as a percentage; the reload is the recharge. shoulder: braced on the shoulder.
  { id: 'pulse', name: 'Pulse Cannon', kind: 'gun', dmg: 13, rate: 0.06, mag: 100, reload: 3.0, spread: 0.02, auto: true, rapid: true, energy: true, shoulder: true, quiet: true, tracer: [0.5, 0.9, 1], kick: 0.1, bar: 'REPULSOR', adsHide: true, rec: { v: 0.02, h: 0.08, ret: 0.5 }, desc: 'Shoulder-mounted repulsor cannon. Hold fire for a steady stream until the charge bar runs dry, then wait for it to recharge.' },
  { id: 'icegun', tap: true, name: 'Ice Gun', kind: 'gun', dmg: 16, rate: 0.3, mag: 14, reload: 1.9, spread: 0.006, auto: false, ice: 5, quiet: true, tracer: [0.55, 0.9, 1], kick: 0.3, adsHide: true, hand: 10, rec: { v: 0.6, h: 0.2, ret: 0.9 }, desc: 'Cryo rifle. Anything it hits is sealed in a block of ice for 5 seconds.' },
  // Tier 3 actives: used from their slot with the attack button (they replace the fists while selected).
  // Tier 3, gear: one piece goes with your two weapons. A `gear` item is passive (it never takes the weapon slot);
  // Laser Vision is a weapon of its own that key 3 selects. eyes: fired from the eyes, nothing held in the hands.
  { id: 'webswing', name: 'Web Swing', kind: 'gear', tier: 3, gear: 'swing', how: 'Passive · press Jump again in the air', hud: 'Jump again in the air', desc: 'Jump, then hold Jump in the air: a web line shoots up into the sky and you swing on it. Let go to fly on, press Jump again for the next line.' },
  { id: 'jetpack', name: 'Jetpack', kind: 'gear', tier: 3, gear: 'jet', how: 'Passive · double-tap Jump to fly', hud: 'Double-tap Jump', desc: 'Double-tap Jump to light the jets: hold Jump to climb, hold Shift (L3 on a controller) to descend, tap it twice to drop straight down. Fuel refills on the ground.' },
  { id: 'wings', name: 'Wings', kind: 'gear', tier: 3, gear: 'wings', how: 'Passive · X to flap, hold Sprint to soar', hud: 'X flap · Sprint soar', desc: 'Feathered wings on your back. Tap X in the air or on the ground to flap and climb bit by bit, then hold Sprint to spread them and soar across the sky. Stamina refills on the ground. X no longer dashes while you wear them.' },
  { id: 'drone', name: 'Guardian Drone', kind: 'gear', tier: 3, gear: 'drone', how: 'Passive · hovers at your side', hud: 'Auto-fires nearby', desc: 'A quad-rotor that hovers at your shoulder and locks on to anything within 22 m of you, raking it with a fast gatling gun. Needs no input.' },
  { id: 'turret', name: 'Turret Pack', kind: 'gun', tier: 3, deploy: true, how: 'Active · shoot to drop it · 9 s recharge', dmg: 0, rate: 0.5, mag: 1, reload: 9, spread: 0, auto: false, quiet: true, kick: 0.3, desc: 'Shoot to drop one huge sentry turret where you aim. It tears apart everything within 38 m for 10 seconds. 9 second recharge.' },
  { id: 'zombiestaff', name: 'Zombie Staff', kind: 'melee', tier: 3, how: 'Active · attack to slam · 60 s recharge', cane: true, summon: 5, cd: 60, dmg: 0, rate: 1.0, range: 0, arc: 0, desc: 'Hold it upright like a cane, then slam it into the ground: five zombies claw out and hunt everything around you for 25 seconds. 60 second recharge.' },
  // grav: a shot opens a gravity well (see GRAV) where it lands. Harmless to friends; deadly for enemies and the other duelist.
  { id: 'gravgun', name: 'Gravity Gun', kind: 'gun', tier: 3, grav: true, how: 'Active · pulls enemies into a clump, then detonates', dmg: 0, rate: 1.4, mag: 6, reload: 2.4, spread: 0.002, auto: false, quiet: true, range: 90, tracer: [0.75, 0.45, 1], kick: 0.9, hand: 10, rec: { v: 1.6, h: 0.4, ret: 0.85 }, desc: 'Pulls everything into a clump, then detonates. Harmless to friends.' },
  // heal: a use mends every living teammate anywhere on the map for that fraction of their max HP (and you for HEAL.self). cd: seconds of recharge.
  { id: 'healstaff', name: 'Healing Staff', kind: 'melee', tier: 3, how: 'Active · attack to heal every ally · 6 s recharge', cane: true, heal: 0.35, cd: 6, dmg: 0, rate: 1.0, range: 0, arc: 0, desc: 'Hold it upright like a cane and raise it: a bending beam of light curls out to every teammate, wherever they are on the map, and heals them by 35%. You mend a little too. 6 second recharge.' },
  { id: 'laser', name: 'Laser Vision', kind: 'gun', tier: 3, eyes: true, dmg: 14, rate: 0.05, mag: 100, reload: 2.5, spread: 0, auto: true, rapid: true, energy: true, quiet: true, range: 120, tracer: [1, 0.2, 0.15], kick: 0.03, bar: 'LASER', cool: true, pierce: 8, desc: 'Press 3 and hold fire: two thick red beams burn from your eyes and punch through a whole line of enemies until the heat bar is full, then wait for them to cool.' },
];
// Taken off the weapon wall (Nutty 2026-11-12). Kept here only so old references still resolve; never offered.
export const RETIRED = [
  { id: 'revolver', tap: true, name: 'Combat Revolver', kind: 'gun', dmg: 55, rate: 0.55, mag: 6, reload: 1.8, spread: 0.004, auto: false, desc: 'Railed tactical wheelgun. Six heavy rounds.' },
  { id: 'lever', scope: true, scopeFov: 16, name: 'Battle Rifle', kind: 'gun', dmg: 40, rate: 0.36, mag: 20, reload: 2.2, spread: 0.004, auto: false, desc: 'Hard-hitting semi-auto .308 with a low-power scope.' },
  { id: 'lmg', name: 'Machine Gun', kind: 'gun', dmg: 17, rate: 0.095, mag: 80, reload: 4.2, spread: 0.028, auto: true, adsBack: 1.5, adsUp: 0.1, desc: 'Belt-fed, with a red dot up top. Hold the trigger down.' },
  { id: 'hpistol', tap: true, name: 'Heavy Pistol', kind: 'gun', dmg: 44, rate: 0.3, mag: 8, reload: 1.5, spread: 0.005, auto: false, kick: 0.8, desc: 'Big-bore semi-auto with a compensator. Hits hard, eight rounds.' },
  { id: 'sawedoff', name: 'Shorty Pump', kind: 'gun', dmg: 11, pellets: 10, rate: 0.55, mag: 5, reload: 2.2, spread: 0.115, auto: false, kick: 1.2, desc: 'Fourteen-inch pump with a bird\'s-head grip. Devastating up close.' },
];
// Bare hands: what you fight with when the loadout is all gear. Not on the weapon wall.
export const BARE = { id: 'bare', name: 'Bare Hands', kind: 'melee', fist: true, dmg: 24, rate: 0.3, range: 6.2, arc: 146, desc: 'Nothing but your fists.' };
export const WEAPON_BY_ID = Object.fromEntries([...WEAPONS, ...RETIRED, BARE].map((w) => [w.id, w]));
// The weapon wall has three tiers: 1 melee, 2 guns, 3 gear. A loadout is two picks from tiers 1-2 and one from tier 3,
// kept in that order ([weapon, weapon, gear]).
export const TIER = (w) => (!w ? 0 : w.tier === 3 ? 3 : w.kind === 'melee' ? 1 : 2);
// A loadout is any three different items off the wall, weapons first then gear. All three may be gear (you fight bare-handed).
export const splitLoadout = (ids) => { const ws = [], gears = []; for (const id of ids || []) (TIER(WEAPON_BY_ID[id]) === 3 ? gears : ws).push(id); return { ws, gears, gear: gears[0] || null }; };
export const loadoutFull = (ids) => { const { ws, gears } = splitLoadout(ids); return ws.length + gears.length === 3 && new Set(ids).size === 3; };

export const BIOMES = [
  {
    id: 'graveyard', name: 'The Graveyard', seedTex: 101,
    groundCols: [[0.2, 0.22, 0.15], [0.3, 0.3, 0.2], [0.23, 0.2, 0.16]], ground: 'pebbles',
    sky: [0x1b1f33, 0x55506a], fog: 0x3d3c4f, fogDensity: 0.0125, sun: 0xb0b8ff, sunI: 1.4, hemi: [0x8088b0, 0x2a2418], hemiI: 0.7,
    props: ['tomb', 'cross', 'deadtree', 'mausoleum', 'rock', 'lantern'], mobTint: 0x9aa58a,
  },
  {
    id: 'forest', name: 'Haunted Forest', seedTex: 202,
    groundCols: [[0.12, 0.17, 0.08], [0.2, 0.25, 0.1], [0.18, 0.13, 0.08]], ground: 'pebbles',
    sky: [0x0f1f1a, 0x3f5a4a], fog: 0x24362c, fogDensity: 0.016, sun: 0xd8f0c0, sunI: 1.2, hemi: [0x7da88a, 0x1d1a10], hemiI: 0.7,
    props: ['pine', 'twisted', 'mushroom', 'rock', 'log'], mobTint: 0x6f8f5a,
  },
  {
    id: 'desert', name: 'Scorched Desert', seedTex: 303,
    groundCols: [[0.62, 0.48, 0.3], [0.75, 0.6, 0.4], [0.55, 0.38, 0.24]], ground: 'smooth',
    sky: [0x3c6aa8, 0xf0c890], fog: 0xd9b48a, fogDensity: 0.0085, sun: 0xffe2b0, sunI: 2.6, hemi: [0xbfd4ff, 0x7a5a38], hemiI: 0.9,
    props: ['mesa', 'cactus', 'rock', 'bones', 'pillar'], mobTint: 0xc29a6a,
  },
  {
    id: 'frozen', name: 'Frozen Peaks', seedTex: 404,
    groundCols: [[0.78, 0.84, 0.9], [0.92, 0.95, 1.0], [0.6, 0.66, 0.74]], ground: 'smooth',
    sky: [0x6d8cb8, 0xdde8f5], fog: 0xb8c8dc, fogDensity: 0.0085, sun: 0xe8f0ff, sunI: 2.0, hemi: [0xcfe0ff, 0x5a6578], hemiI: 0.9,
    props: ['snowpine', 'icecrystal', 'rock', 'snowrock'], mobTint: 0xa8c4dc,
  },
  {
    id: 'volcanic', name: 'Volcanic Wastes', seedTex: 505,
    groundCols: [[0.1, 0.08, 0.08], [0.2, 0.15, 0.13], [0.06, 0.05, 0.05]], ground: 'cracked', crackCol: [1.0, 0.35, 0.05],
    sky: [0x200806, 0x7a2a12], fog: 0x3a1a12, fogDensity: 0.014, sun: 0xff9a6a, sunI: 1.4, hemi: [0xff7a50, 0x200a05], hemiI: 0.6,
    props: ['basalt', 'obsidian', 'rock', 'lavapool', 'deadtree'], mobTint: 0x8a4a3a,
  },
  {
    id: 'abyss', name: 'The Abyss', seedTex: 606,
    groundCols: [[0.08, 0.05, 0.12], [0.15, 0.1, 0.22], [0.05, 0.04, 0.08]], ground: 'cracked', crackCol: [0.6, 0.2, 1.0],
    sky: [0x05020c, 0x2a1048], fog: 0x1a0d2a, fogDensity: 0.015, sun: 0xc9a0ff, sunI: 1.2, hemi: [0x9a70ff, 0x100818], hemiI: 0.6,
    props: ['obelisk', 'voidcrystal', 'rock', 'floater'], mobTint: 0x7a5aa8,
  },
  // Index 6: a random extra map, a green valley with a stream, a pond and hot springs (see stages.js).
  {
    id: 'springs', name: 'Hot Springs Valley', seedTex: 707,
    groundCols: [[0.2, 0.38, 0.12], [0.3, 0.48, 0.16], [0.34, 0.3, 0.16]], ground: 'pebbles',
    sky: [0x4a90e0, 0xcfe9f0], fog: 0xd2e8e4, fogDensity: 0.0075, sun: 0xfff2d2, sunI: 2.5, hemi: [0xcfe6ff, 0x4f7a34], hemiI: 0.95,
    props: ['pine', 'log', 'rock', 'mushroom'], mobTint: 0x7a9a6a,
  },
  // Index 7: the hidden space map. Only joins the stage pool once the game has been beaten on Hard (see stageIdx).
  {
    id: 'space', name: 'Crash Site Prime', seedTex: 808,
    groundCols: [[0.4, 0.4, 0.42], [0.52, 0.52, 0.54], [0.3, 0.3, 0.32]], ground: 'pebbles', crackCol: [0, 0, 0], // moon-grey floor (Nutty 2026-11-05: no lava)
    sky: [0x010104, 0x1c0b22], fog: 0x0d0e14, fogDensity: 0.0055, sun: 0xf2f5ff, sunI: 2.0, hemi: [0x8c94b4, 0x26282e], hemiI: 0.6, desat: 0.9, // hard white sunlight, grey ground, like the real Moon
    props: ['rock'], mobTint: 0xb07ac0, // only space rocks: no trees, no plants
  },
  // Indices 8-11 (2026-11-05): the lobby backdrops turned into maps (see stages.js). `tex` names the biome whose ground textures,
  // prop tints and splat rules they borrow; `stage` the music they share. They join the stage pool through STAGE_POOL below.
  {
    id: 'waterfall', name: 'Waterfall Valley', seedTex: 909, tex: 'springs', stage: 6,
    groundCols: [[0.18, 0.36, 0.12], [0.28, 0.46, 0.16], [0.32, 0.3, 0.17]], ground: 'pebbles',
    sky: [0x3d7fd0, 0xd8ecf2], fog: 0xcfe4e6, fogDensity: 0.0068, sun: 0xfff3d8, sunI: 2.6, hemi: [0xcfe6ff, 0x4a7a34], hemiI: 0.95,
    props: ['pine', 'log', 'rock', 'mushroom'], mobTint: 0x7a9a6a,
  },
  {
    id: 'clearing', name: 'Forest Clearing', seedTex: 1010, tex: 'forest', stage: 1,
    groundCols: [[0.14, 0.2, 0.08], [0.24, 0.3, 0.11], [0.2, 0.15, 0.08]], ground: 'pebbles',
    sky: [0x2f6ac8, 0xf2d29a], fog: 0xb8b29a, fogDensity: 0.0078, sun: 0xffd29a, sunI: 3.0, hemi: [0xa0b8d0, 0x3a3020], hemiI: 0.8,
    props: ['pine', 'rock', 'log', 'mushroom'], mobTint: 0x6f8f5a,
  },
  {
    id: 'volcano', name: 'The Volcano', seedTex: 1111, tex: 'volcanic', stage: 4,
    groundCols: [[0.09, 0.07, 0.07], [0.18, 0.14, 0.12], [0.05, 0.04, 0.04]], ground: 'cracked', crackCol: [1.0, 0.32, 0.04],
    sky: [0x050304, 0x8c2410], fog: 0x3a1410, fogDensity: 0.0072, sun: 0xff7a40, sunI: 1.6, hemi: [0x5a3048, 0x401008], hemiI: 0.6,
    props: ['basalt', 'obsidian', 'rock', 'lavapool', 'deadtree'], mobTint: 0x8a4a3a,
  },
  {
    id: 'ruins', name: 'Misty Ruins', seedTex: 1212, tex: 'meadow', stage: 0,
    groundCols: [[0.22, 0.3, 0.14], [0.3, 0.36, 0.2], [0.3, 0.3, 0.24]], ground: 'pebbles',
    sky: [0x6688b8, 0xeae8de], fog: 0xc4c8c2, fogDensity: 0.008, sun: 0xffe0b0, sunI: 2.2, hemi: [0xb0c0d0, 0x40402a], hemiI: 0.9,
    props: ['pine', 'rock', 'pillar', 'log'], mobTint: 0x8a9a7a,
  },
];

// Base stats; scaled per round in the host sim.
// tier: 1 early, 2 mid, 3 late. `model` reuses a body plan; `extra` adds a look.
export const MOBS = {
  grunt: { name: 'Ghoul', tier: 1, hp: 60, speed: 4.6, dmg: 8, range: 1.9, rate: 1.0, radius: 0.55, height: 1.8, scale: 1 },
  runner: { name: 'Stalker', tier: 1, hp: 38, speed: 7.6, dmg: 6, range: 1.7, rate: 0.7, radius: 0.45, height: 1.5, scale: 0.85 },
  spitter: { name: 'Spitter', tier: 1, hp: 48, speed: 3.6, dmg: 10, range: 22, rate: 2.2, radius: 0.6, height: 1.7, scale: 1, ranged: true },
  crawler: { name: 'Crawler', tier: 1, model: 'runner', extra: 'spikes', hp: 30, speed: 6.2, dmg: 5, range: 1.5, rate: 0.55, radius: 0.46, height: 1.4, scale: 0.85, color: 0x6a5040 },
  brute: { name: 'Brute', tier: 2, hp: 230, speed: 3.3, dmg: 18, range: 2.6, rate: 1.6, radius: 1.0, height: 2.8, scale: 1.6 },
  wraith: { name: 'Wraith', tier: 2, model: 'grunt', extra: 'ghost', hp: 70, speed: 6.4, dmg: 14, range: 2.0, rate: 0.9, radius: 0.5, height: 1.9, scale: 1.05, color: 0x9fe8ff },
  hexer: { name: 'Hexer', tier: 2, model: 'spitter', extra: 'horns', hp: 90, speed: 3.8, dmg: 16, range: 26, rate: 1.7, radius: 0.6, height: 1.8, scale: 1.1, ranged: true, color: 0x6a3a8a },
  ravager: { name: 'Ravager', tier: 3, model: 'runner', extra: 'horns', hp: 170, speed: 7.2, dmg: 17, range: 2.1, rate: 0.8, radius: 0.7, height: 2.0, scale: 1.35, color: 0x7a2a22 },
  juggernaut: { name: 'Juggernaut', tier: 3, model: 'brute', extra: 'armor', hp: 520, speed: 3.0, dmg: 28, range: 3.0, rate: 1.8, radius: 1.3, height: 3.4, scale: 2.0, color: 0x4a4a52 },
  // Flyers join from round 3. They circle overhead and dive (Gloomwing) or shoot from the air (Skyhunter).
  gloomwing: { name: 'Gloomwing', tier: 2, fly: true, hp: 80, speed: 7.5, dmg: 13, range: 2.3, rate: 1.5, radius: 0.55, height: 1.5, scale: 1, color: 0x4a2a5a },
  skyhunter: { name: 'Skyhunter', tier: 3, fly: true, ranged: true, hp: 120, speed: 6, dmg: 15, range: 28, rate: 1.9, radius: 0.55, height: 1.8, scale: 1.1, color: 0x6a8aa0 },
  banshee: { name: 'Banshee', tier: 3, model: 'grunt', extra: 'ghost', hp: 110, speed: 5.0, dmg: 20, range: 30, rate: 1.4, radius: 0.5, height: 1.9, scale: 1.1, ranged: true, color: 0xff9ad0 },
  // ---- Variants. APPENDED: the snapshot sends the index in MOB_TYPES, so never reorder the types above.
  // Optional keys read by the host sim: w spawn-weight multiplier, cap max alive, share max fraction of live
  // mobs, cost share of the live-mob budget, pack [min,max], guard/turn (frontal shield), bomb, leap, summon,
  // burnHit/poisonHit (damage over time on the player), slam (ground smash), hold/pspd/pstyle (ranged), summoned, hard (absolute alive cap).
  bulwark: { name: 'Bulwark', tier: 2, model: 'brute', extra: 'armor', hp: 250, speed: 3.5, dmg: 15, range: 2.5, rate: 1.5, radius: 0.85, height: 2.4, scale: 1.3, color: 0x6a7a9a, w: 0.8, cap: 4, guard: 0.72, turn: 1.4 },
  bomber: { name: 'Bomber', tier: 1, model: 'runner', hp: 36, speed: 6.4, dmg: 0, range: 2.4, rate: 1, radius: 0.5, height: 1.5, scale: 0.9, color: 0xd8681a, w: 0.8, cap: 4, bomb: { r: 5.2, dmg: 30, fuse: 0.75 } },
  pouncer: { name: 'Pouncer', tier: 2, model: 'runner', hp: 85, speed: 5.8, dmg: 15, range: 2.2, rate: 1.0, radius: 0.55, height: 1.4, scale: 0.95, color: 0xc89a3a, w: 0.9, cap: 4, leap: { min: 5, max: 15, cd: 4.5, wind: 0.5, t: 0.6, h: 3.4 } },
  hatchling: { name: 'Hatchling', tier: 1, model: 'spitter', hp: 14, speed: 5.8, dmg: 4, range: 1.4, rate: 0.6, radius: 0.4, height: 1.2, scale: 0.75, color: 0xd8c820, w: 0.7, cap: 10, share: 0.22, cost: 0.4, pack: [4, 6], weave: true },
  cinder: { name: 'Cinderfiend', tier: 3, model: 'grunt', extra: 'horns', hp: 150, speed: 5.4, dmg: 12, range: 2.1, rate: 1.0, radius: 0.6, height: 2.0, scale: 1.15, color: 0xb02a10, w: 0.9, cap: 3, burnHit: { n: 3, every: 1, k: 0.4 } },
  venomfang: { name: 'Venomfang', tier: 2, model: 'grunt', hp: 90, speed: 5.2, dmg: 9, range: 2.0, rate: 0.9, radius: 0.55, height: 1.7, scale: 1.0, color: 0x9ad040, w: 0.9, cap: 4, poisonHit: { n: 5, every: 0.8, k: 0.25 } },
  necro: { name: 'Necromancer', tier: 3, model: 'grunt', hp: 120, speed: 4.2, dmg: 0, range: 30, rate: 1, radius: 0.55, height: 2.0, scale: 1.1, color: 0x7dffb0, w: 0.8, cap: 2, summon: { cd: 7, cap: 4, lo: 12, hi: 20 } },
  boneling: { name: 'Boneling', tier: 1, model: 'runner', hp: 16, speed: 6.6, dmg: 5, range: 1.5, rate: 0.7, radius: 0.35, height: 1.1, scale: 0.6, color: 0xe8e0cc, summoned: true, cost: 0.3 },
  archer: { name: 'Ashen Archer', tier: 2, model: 'spitter', hp: 70, speed: 4.6, dmg: 17, range: 40, rate: 2.5, radius: 0.55, height: 1.8, scale: 1.0, ranged: true, color: 0x8a7a50, w: 0.9, cap: 3, hold: [15, 26], pspd: 34, pstyle: 2 },
  // Trolls: big, tough, slow-swinging brawlers that rotate in with (and replace) the Ghoul.
  troll: { name: 'Cave Troll', tier: 2, model: 'brute', hp: 300, speed: 3.6, dmg: 22, range: 2.8, rate: 1.7, radius: 1.0, height: 2.7, scale: 1.55, color: 0x7a6a4a, w: 0.9, cap: 4, regen: 0.02 },
  ogre: { name: 'Ogre Smasher', tier: 3, model: 'brute', hp: 460, speed: 3.2, dmg: 20, range: 3.2, rate: 2.2, radius: 1.25, height: 3.2, scale: 1.9, color: 0x8a5a4a, w: 0.8, cap: 2, slam: { r: 4.6, d: 1.1, dmg: 26, cd: 5 } },
  // Goblins (the Haunted Forest's tribe): small raiders in packs, a shaman that lobs curses, and the warchief.
  goblin: { name: 'Raider', tier: 1, model: 'runner', hp: 46, speed: 6.8, dmg: 7, range: 1.8, rate: 0.75, radius: 0.45, height: 1.35, scale: 0.8, color: 0x5a9a2c, w: 1.1, cap: 10, share: 0.3, pack: [3, 5] },
  gobshaman: { name: 'Hexcaller', tier: 2, model: 'spitter', hp: 95, speed: 4.4, dmg: 14, range: 24, rate: 1.8, radius: 0.5, height: 1.5, scale: 0.9, ranged: true, color: 0x8aff30, w: 0.9, cap: 3, hold: [12, 20], pspd: 20, pstyle: 1 },
  gobchief: { name: 'Warchief', tier: 3, model: 'brute', hp: 380, speed: 5.0, dmg: 24, range: 2.4, rate: 1.4, radius: 0.8, height: 2.2, scale: 1.3, color: 0x6a4a1c, w: 0.9, cap: 2, slam: { r: 4.0, d: 1.0, dmg: 22, cd: 6 } },
  // Humans (the Scorched Desert's outlaws, the Abyss's hired killers): cutthroats, deserters with rifles, shadow blades and a hedge witch.
  // (The hero-built ones, cutthroat, shadow blade and the knights, carry 200k+ vertices each, hence the low caps.)
  bandit: { name: 'Cutthroat', tier: 1, model: 'grunt', hp: 56, speed: 5.8, dmg: 9, range: 2.0, rate: 0.9, radius: 0.5, height: 1.84, scale: 1, color: 0x8a5a3a, w: 1.0, cap: 2, hard: 4, share: 0.2, pack: [1, 2] },
  rifleman: { name: 'Deserter Rifleman', tier: 2, model: 'spitter', hp: 85, speed: 4.6, dmg: 16, range: 42, rate: 2.0, radius: 0.5, height: 1.9, scale: 1, ranged: true, color: 0x8a8a7a, w: 0.9, cap: 3, hold: [16, 28], pspd: 44, pstyle: 2 },
  assassin: { name: 'Shadow Blade', tier: 2, model: 'runner', hp: 75, speed: 8.0, dmg: 16, range: 2.0, rate: 0.8, radius: 0.45, height: 1.74, scale: 0.95, color: 0x2a2a3a, w: 0.9, cap: 1, hard: 2, leap: { min: 5, max: 14, cd: 5, wind: 0.4, t: 0.5, h: 3.0 } },
  witch: { name: 'Hedge Witch', tier: 3, model: 'spitter', hp: 150, speed: 4.0, dmg: 19, range: 30, rate: 1.6, radius: 0.5, height: 1.72, scale: 1, ranged: true, color: 0xc040ff, w: 0.8, cap: 2, hold: [14, 24], pspd: 18, pstyle: 1 },
  // Knights (the Frozen Peaks' fallen order): plate-armoured swordsmen with a shield, and the dread knight that smashes the ground.
  knight: { name: 'Knight Errant', tier: 2, model: 'brute', hp: 260, speed: 4.4, dmg: 20, range: 2.6, rate: 1.3, radius: 0.65, height: 2.0, scale: 1.15, color: 0x8896b0, w: 0.9, cap: 1, hard: 3, guard: 0.55, turn: 1.5 },
  dreadknight: { name: 'Dread Knight', tier: 3, model: 'brute', hp: 620, speed: 3.8, dmg: 30, range: 2.8, rate: 1.8, radius: 0.8, height: 2.4, scale: 1.35, color: 0x3a2a3a, w: 0.8, cap: 1, hard: 1, regen: 0.01, slam: { r: 4.5, d: 1.1, dmg: 28, cd: 5.5 } },
  // Fear's call: the bosses already beaten, shrunk to mob size. Boss rigs, appended so snapshot indices stay stable.
  echo0: { name: 'Echo of the Gravewarden', tier: 3, hp: 900, speed: 4.2, dmg: 30, range: 3.6, rate: 1.6, radius: 1.2, height: 4.2, scale: 1, summoned: true, cost: 3, slam: { r: 5, d: 1.0, dmg: 34, cd: 5 } },
  echo1: { name: 'Echo of Thornmother', tier: 3, hp: 1100, speed: 3.8, dmg: 30, range: 3.6, rate: 1.6, radius: 1.2, height: 4.4, scale: 1, summoned: true, cost: 3, slam: { r: 5, d: 1.0, dmg: 34, cd: 5 } },
  echo2: { name: 'Echo of Sandreaver', tier: 3, hp: 1200, speed: 5.4, dmg: 32, range: 3.4, rate: 1.3, radius: 1.2, height: 4.2, scale: 1, summoned: true, cost: 3, leap: { min: 6, max: 16, cd: 5, wind: 0.5, t: 0.6, h: 3.4 } },
  echo3: { name: 'Echo of Rimefang', tier: 3, hp: 1300, speed: 5.4, dmg: 32, range: 3.6, rate: 1.4, radius: 1.2, height: 4.4, scale: 1, summoned: true, cost: 3, slam: { r: 5, d: 1.0, dmg: 34, cd: 5 } },
  echo4: { name: 'Echo of Magmaw', tier: 3, hp: 1500, speed: 4.0, dmg: 36, range: 3.8, rate: 1.7, radius: 1.3, height: 4.8, scale: 1, summoned: true, cost: 3, burnHit: { n: 3, every: 1, k: 0.4 }, slam: { r: 5.5, d: 1.0, dmg: 38, cd: 5 } },
  echo5: { name: 'Echo of Vexaris', tier: 3, hp: 1800, speed: 5.2, dmg: 38, range: 3.8, rate: 1.4, radius: 1.3, height: 5, scale: 1, summoned: true, cost: 3, slam: { r: 5.5, d: 1.0, dmg: 40, cd: 5 } },
};
// Every stage has its own tribe: these are the ground types a round draws from (flyers join on top, see HostSim.pickLineup).
export const STAGE_MOBS = {
  graveyard: ['grunt', 'wraith', 'archer', 'necro', 'banshee', 'shambler', 'deadcop'],
  forest: ['goblin', 'gobshaman', 'venomfang', 'troll', 'gobchief', 'shambler'],
  desert: ['bandit', 'spitter', 'rifleman', 'pouncer', 'ogre', 'trooper', 'riot'],
  frozen: ['crawler', 'knight', 'bulwark', 'juggernaut', 'dreadknight', 'warmaiden'],
  volcanic: ['hatchling', 'bomber', 'brute', 'cinder', 'ravager', 'riot'],
  abyss: ['runner', 'assassin', 'hexer', 'witch'],
  springs: ['hatchling', 'venomfang', 'pouncer', 'spitter', 'troll', 'trooper'],
  space: ['zorp', 'skree', 'gloop', 'lanky', 'stinger', 'brainer', 'warden', 'gorgle'], // Gruk out (Nutty 2026-11-05); Gorgle in (picked 2026-11-05)
  waterfall: ['hatchling', 'venomfang', 'pouncer', 'spitter', 'troll'],
  clearing: ['goblin', 'gobshaman', 'venomfang', 'troll', 'gobchief', 'warmaiden'],
  volcano: ['hatchling', 'bomber', 'brute', 'cinder', 'ravager'],
  ruins: ['grunt', 'wraith', 'archer', 'necro', 'banshee', 'shambler', 'deadcop', 'riot'],
};
// Flyers belong to the abyss alone, so no other stage repeats them.
export const STAGE_FLY = { abyss: ['gloomwing', 'skyhunter'], space: ['wasp'] };
// Every other stage takes its flyer in turn from this list, a different one each round (Nutty 2026-11-05: alternate all flyers, #8 included).
// Hit zones (Nutty 2026-11-05): every body takes different damage by where a shot lands. Head = yellow number.
export const ZONE_K = { head: 2.0, body: 1.0, arm: 0.8, leg: 0.6 }; // head = always a critical hit (yellow); legs are the weakest spot
export function zoneOf(t, y, d2) {
  const rel = (y - t.y) / (t.h || 1), r = t.r || 0.5;
  if (rel > (t.big ? 0.73 : t.kind === 'boss' ? 0.86 : 0.82)) return 'head'; // big: Big Head mutator (much larger head)
  if (rel < 0.45) return 'leg';
  if (d2 > r * r * 0.36) return 'arm';
  return 'body';
}
export const FLYERS = ['gloomwing', 'skyhunter', 'wasp', 'surgeon'];
// Ghoul and Stalker share the lizard-troll body and used to be most of every round: keep them rare.
MOBS.grunt.w = 0.4; MOBS.grunt.pack = [1, 2]; MOBS.grunt.share = 0.22; MOBS.grunt.fam = 'troll';
MOBS.runner.w = 0.5; MOBS.runner.pack = [1, 2]; MOBS.runner.share = 0.24; MOBS.runner.fam = 'troll';
// The hidden space map's aliens, in every shape and colour. Appended last so snapshot indices stay stable (see MOB_LOOKS for their bodies).
Object.assign(MOBS, {
  zorp: { name: 'Zorp', tier: 1, hp: 44, speed: 6.6, dmg: 7, range: 1.7, rate: 0.7, radius: 0.4, height: 1.15, scale: 0.7, color: 0x7fd070, w: 1.2, cap: 12, share: 0.3, pack: [3, 5] },
  skree: { name: 'Skree', tier: 1, hp: 24, speed: 8.8, dmg: 5, range: 1.6, rate: 0.55, radius: 0.7, height: 2.9, scale: 0.55, color: 0x1fb8c8, w: 0.9, cap: 12, share: 0.22, cost: 0.4, pack: [4, 7], weave: true },
  gloop: { name: 'Gloop', tier: 1, hp: 70, speed: 4.6, dmg: 9, range: 1.9, rate: 0.9, radius: 0.55, height: 1.6, scale: 0.95, color: 0x3a8aff, w: 1.0, cap: 6 },
  gruk: { name: 'Gruk', tier: 2, hp: 280, speed: 3.9, dmg: 20, range: 2.8, rate: 1.7, radius: 1.0, height: 3.0, scale: 1.55, color: 0xe05a30, w: 0.9, cap: 3, slam: { r: 4.2, d: 1.0, dmg: 22, cd: 5.5 } },
  lanky: { name: 'Lanky Sniper', tier: 2, hp: 95, speed: 4.4, dmg: 17, range: 40, rate: 2.1, radius: 0.45, height: 2.7, scale: 1.1, ranged: true, color: 0xb070ff, w: 0.9, cap: 3, hold: [15, 26], pspd: 32, pstyle: 2 },
  stinger: { name: 'Stinger', tier: 2, hp: 90, speed: 5.4, dmg: 14, range: 24, rate: 1.5, radius: 0.5, height: 1.8, scale: 1.0, ranged: true, color: 0xe8c820, w: 0.9, cap: 3, hold: [12, 20], pspd: 22, pstyle: 1, poisonHit: { n: 4, every: 0.9, k: 0.2 } },
  brainer: { name: 'Brainer', tier: 3, hp: 130, speed: 4.2, dmg: 19, range: 30, rate: 1.5, radius: 0.5, height: 2.0, scale: 1.1, ranged: true, color: 0xff7ad0, w: 0.8, cap: 2, hold: [14, 24], pspd: 18, pstyle: 1 },
  gorgle: { name: 'Gorgle', tier: 3, hp: 360, speed: 3.4, dmg: 22, range: 2.9, rate: 1.4, radius: 1.6, height: 4.2, scale: 1, color: 0x5fd8c8, w: 0.7, cap: 2, share: 0.12, cost: 2.4, turn: 1.2, slam: { r: 4.2, d: 1.1, dmg: 20, cd: 7 } }, // huge jelly blob with three faces (src/spacemobs.js)
  warden: { name: 'Hive Warden', tier: 3, hp: 420, speed: 3.9, dmg: 26, range: 2.7, rate: 1.5, radius: 0.8, height: 2.6, scale: 1.3, color: 0x4adbd0, w: 0.8, cap: 2, guard: 0.6, turn: 1.4, regen: 0.01, slam: { r: 4.4, d: 1.0, dmg: 24, cd: 6 } },
  surgeon: { name: 'The Surgeon', tier: 2, fly: true, hp: 95, speed: 7.0, dmg: 14, range: 2.4, rate: 1.4, radius: 0.6, height: 2.6, scale: 1, color: 0x7ac8d8 }, // Nutty 2026-11-05: Mixamo #8, flies with the other flyers
  wasp: { name: 'Hive Wasp', tier: 2, fly: true, hp: 90, speed: 7.6, dmg: 13, range: 2.6, rate: 1.4, radius: 0.8, height: 2.8, scale: 1, color: 0xffa020 },
  echo7: { name: 'Echo of Mossback', tier: 3, hp: 1300, speed: 4.4, dmg: 32, range: 3.6, rate: 1.5, radius: 1.2, height: 4.4, scale: 1, summoned: true, cost: 3, slam: { r: 5, d: 1.0, dmg: 34, cd: 5 } },
  echo8: { name: 'Echo of The Visitor', tier: 3, hp: 1800, speed: 5.6, dmg: 36, range: 3.6, rate: 1.3, radius: 1.1, height: 5.0, scale: 1, summoned: true, cost: 3, slam: { r: 5, d: 1.0, dmg: 36, cd: 4.5 } },
  // Thermes calls back the bosses beaten earlier in the run as his team mates (each with its own health bar).
  echo9: { name: 'Echo of Dreadknight', tier: 3, hp: 1500, speed: 5.2, dmg: 34, range: 3.6, rate: 1.3, radius: 1.2, height: 4.4, scale: 1, summoned: true, cost: 3, slam: { r: 5, d: 1.0, dmg: 36, cd: 5 } },
  echo10: { name: 'Echo of The Archmage', tier: 3, hp: 1300, speed: 4.6, dmg: 32, range: 3.6, rate: 1.5, radius: 1.2, height: 4.2, scale: 1, summoned: true, cost: 3, slam: { r: 5, d: 1.0, dmg: 34, cd: 5 } },
  echo11: { name: 'Echo of The Flayed', tier: 3, hp: 1500, speed: 5.6, dmg: 30, range: 3.4, rate: 0.9, radius: 1.2, height: 4.4, scale: 1, summoned: true, cost: 3, leap: { min: 6, max: 16, cd: 5, wind: 0.5, t: 0.6, h: 3.4 } },
  echo12: { name: 'Echo of Rotgut', tier: 3, hp: 1200, speed: 5.4, dmg: 30, range: 3.4, rate: 1.4, radius: 1.2, height: 4.0, scale: 1, summoned: true, cost: 3, slam: { r: 5, d: 1.0, dmg: 34, cd: 5 } },
  echo13: { name: 'Echo of Big Elvis', tier: 3, hp: 1700, speed: 4.2, dmg: 36, range: 3.8, rate: 1.6, radius: 1.3, height: 4.8, scale: 1, summoned: true, cost: 3, slam: { r: 5.5, d: 1.0, dmg: 38, cd: 5 } },
  echo14: { name: 'Echo of Uncle Gus', tier: 3, hp: 1500, speed: 4.4, dmg: 34, range: 3.6, rate: 1.5, radius: 1.3, height: 4.6, scale: 1, summoned: true, cost: 3, leap: { min: 6, max: 16, cd: 5, wind: 0.5, t: 0.6, h: 3.4 } },
});

// The rest of the Mixamo bodies as mobs (Nutty 2026-11-05: "all other unlisted characters will be added to the mobs").
Object.assign(MOBS, {
  shambler: { name: 'Shambler', tier: 1, hp: 64, speed: 4.2, dmg: 9, range: 1.9, rate: 1.0, radius: 0.55, height: 1.8, scale: 1, color: 0x5a6a4a, w: 1.0, cap: 8 }, // #12 rotting man in jeans
  deadcop: { name: 'Dead Cop', tier: 2, hp: 120, speed: 4.4, dmg: 13, range: 2.0, rate: 1.0, radius: 0.55, height: 1.85, scale: 1, color: 0x2a3040, w: 0.9, cap: 4 }, // #13 zombie police officer
  trooper: { name: 'Trench Trooper', tier: 2, hp: 95, speed: 4.6, dmg: 14, range: 40, rate: 2.0, radius: 0.5, height: 1.85, scale: 1, color: 0x5a6040, w: 0.9, cap: 4, ranged: true, hold: [14, 26], pspd: 70, pstyle: 3 }, // #16 helmeted infantryman
  warmaiden: { name: 'Warmaiden', tier: 2, hp: 150, speed: 4.8, dmg: 17, range: 2.2, rate: 1.1, radius: 0.55, height: 1.85, scale: 1, color: 0x6a5a4a, w: 0.9, cap: 3 }, // #17 armoured warrior woman
  riot: { name: 'Riot Trooper', tier: 3, hp: 220, speed: 4.4, dmg: 16, range: 40, rate: 1.8, radius: 0.55, height: 1.9, scale: 1, color: 0x34465a, w: 0.8, cap: 3, ranged: true, hold: [14, 26], pspd: 70, pstyle: 3 }, // #21 armoured SWAT trooper
});

// Tuning: mobs are bigger, hit 10% softer and close in 10% slower, so there is time to
// run and grab drops. Health is untouched, so kills take as long as before.
export const MOB_SIZE = 1.3;
export const MOB_TALL = 1.15; // extra height on top of MOB_SIZE, for every regular mob
for (const m of Object.values(MOBS)) {
  m.scale *= MOB_SIZE * MOB_TALL; m.height *= MOB_SIZE * MOB_TALL; m.radius *= 1.2;
  m.dmg = Math.round(m.dmg * 0.9 * 10) / 10;
  m.speed = Math.round(m.speed * 0.9 * 100) / 100;
}
// Nutty (2026-11-05): no short mobs. mobrig.js lifts every regular mob shorter than MOB_MIN_H (metres, standing) up to
// it and grows its hit size here in MOBS to match (see the floor loop there).
export const MOB_MIN_H = 2.3;
// ...and the ones that outran a walking player (Stalker, Gloomwing, Ravager, Shadow Blade, Skree, Hive Wasp) move 30% slower.
for (const id of ['runner', 'gloomwing', 'ravager', 'assassin', 'skree', 'wasp']) if (MOBS[id]) MOBS[id].speed = Math.round(MOBS[id].speed * 0.7 * 100) / 100;
// ...and no fast ones: no regular mob moves faster than MOB_MAX_SPEED (a walking player does 6.27). Leaps and charges still burst.
export const MOB_MAX_SPEED = 5.0;
for (const [id, m] of Object.entries(MOBS)) if (!id.startsWith('echo')) m.speed = Math.min(m.speed, MOB_MAX_SPEED);
export const MOB_TYPES = Object.keys(MOBS);

// ---------- Mob weapons (Nutty 2026-11-05) ----------
// Human-looking mobs carry combat weapons (blades, axes, maces, spears, crossbows), soldiers carry guns only, zombies carry crude
// scavenged weapons. Each mob spawned picks one at random from its class, so a crowd mixes them. Melee weapons change reach,
// damage and swing speed; ranged ones turn the mob into a shooter that keeps its distance. `gear` is the prop mobrig.js builds.
export const MOB_ARMS = {
  // soldiers: guns only
  rifle: { cls: 'soldier', gear: 'arifle', ranged: true, range: 44, rate: 2.0, dmgK: 1.0, hold: [16, 28], pspd: 72, pstyle: 3 },
  smg: { cls: 'soldier', gear: 'smg', ranged: true, range: 28, rate: 0.75, dmgK: 0.45, hold: [9, 17], pspd: 66, pstyle: 3 },
  pistol: { cls: 'soldier', gear: 'pistol', ranged: true, range: 30, rate: 1.25, dmgK: 0.65, hold: [10, 18], pspd: 62, pstyle: 3 },
  shotgun: { cls: 'soldier', gear: 'shotgun', ranged: true, range: 16, rate: 1.9, dmgK: 1.4, hold: [6, 12], pspd: 58, pstyle: 3 },
  crossbow: { cls: 'human', gear: 'crossbow', ranged: true, range: 40, rate: 2.4, dmgK: 1.3, hold: [14, 24], pspd: 46, pstyle: 2 },
  // Hand weapons, each modelled for the bodies that carry it (mobarms.js; Nutty 2026-11-13: realistic, made for the enemy, none from the Weapon Wall).
  // swords for the smaller enemies
  arming: { gear: 'w_arming', reach: 0.5, rate: 1.0, dmgK: 1.1 }, falchion: { gear: 'w_falchion', reach: 0.45, rate: 1.05, dmgK: 1.15 },
  shortsword: { gear: 'w_shortsword', reach: 0.3, rate: 0.85, dmgK: 1.0 }, sabre: { gear: 'w_sabre', reach: 0.55, rate: 0.95, dmgK: 1.1 },
  cutlass: { gear: 'w_cutlass', reach: 0.4, rate: 0.95, dmgK: 1.1 }, katana: { gear: 'w_katana', reach: 0.55, rate: 0.9, dmgK: 1.15 },
  ninjato: { gear: 'w_ninjato', reach: 0.35, rate: 0.8, dmgK: 1.0 }, scimitar: { gear: 'w_scimitar', reach: 0.4, rate: 0.9, dmgK: 1.05 },
  waraxe: { gear: 'w_waraxe', reach: 0.4, rate: 1.15, dmgK: 1.25 }, mace: { gear: 'w_mace', reach: 0.3, rate: 1.2, dmgK: 1.3 }, spear: { gear: 'w_spear', reach: 1.4, rate: 1.0, dmgK: 1.05 },
  // long swords and axes for the brutes
  longsword: { gear: 'w_longsword', reach: 0.8, rate: 1.2, dmgK: 1.3 }, greatsword: { gear: 'w_greatsword', reach: 1.0, rate: 1.35, dmgK: 1.45 },
  battleaxe: { gear: 'w_battleaxe', reach: 0.7, rate: 1.3, dmgK: 1.4 }, greataxe: { gear: 'w_greataxe', reach: 0.9, rate: 1.4, dmgK: 1.5 }, warhammer: { gear: 'w_warhammer', reach: 0.7, rate: 1.35, dmgK: 1.45 },
  // the dead carry whatever was lying around
  machete: { gear: 'w_machete', reach: 0.3, rate: 0.95, dmgK: 1.15 }, cleaver: { gear: 'w_cleaver', reach: 0.15, rate: 0.9, dmgK: 1.15 }, fireaxe: { gear: 'w_fireaxe', reach: 0.45, rate: 1.15, dmgK: 1.25 },
  hatchet: { gear: 'w_hatchet', reach: 0.2, rate: 0.9, dmgK: 1.1 }, crowbar: { gear: 'w_crowbar', reach: 0.4, rate: 1.0, dmgK: 1.1 }, wrench: { gear: 'w_wrench', reach: 0.3, rate: 1.05, dmgK: 1.15 },
  bat: { gear: 'w_bat', reach: 0.45, rate: 1.05, dmgK: 1.2 }, baton: { gear: 'w_baton', reach: 0.35, rate: 0.85, dmgK: 1.0 }, sledge: { gear: 'w_sledge', reach: 0.6, rate: 1.3, dmgK: 1.35 },
  shovel: { gear: 'w_shovel', reach: 0.6, rate: 1.2, dmgK: 1.2 }, pipe: { gear: 'w_pipe', reach: 0.35, rate: 1.05, dmgK: 1.1 },
};
export const MOB_ARM_IDS = Object.keys(MOB_ARMS);
const ARMS_OF = (cls) => MOB_ARM_IDS.filter((k) => MOB_ARMS[k].cls === cls);
// Which mob types carry a random weapon, and from which pool. Mobs not listed keep what they have (casters keep their staffs,
// monsters their claws, the Brute the hammer his body already holds, the archer its bow).
export const MOB_ARM_POOL = {
  // the dead: scavenged tools, each body its own kind (the soldier's field kit, the kitchen and the yard, the garage, the officer's belt)
  grunt: ['machete', 'shovel', 'hatchet', 'pipe', 'crowbar'], runner: ['cleaver', 'hatchet', 'bat', 'machete'], shambler: ['bat', 'wrench', 'crowbar', 'fireaxe', 'sledge', 'pipe'], deadcop: ['baton', 'crowbar', 'pistol'],
  // smaller enemies carry swords; the brutes carry axes and long swords
  goblin: ['scimitar', 'shortsword', 'falchion'], bandit: ['cutlass', 'sabre', 'hatchet'], assassin: ['katana', 'ninjato', 'crossbow'],
  knight: ['arming', 'falchion', 'mace', 'waraxe'], warmaiden: ['arming', 'shortsword', 'spear', 'waraxe'],
  troll: ['greataxe', 'battleaxe', 'greatsword'], gobchief: ['longsword', 'battleaxe', 'greataxe'], dreadknight: ['greatsword', 'greataxe', 'warhammer'],
  rifleman: ARMS_OF('soldier'), bulwark: ['pistol', 'smg', 'shotgun'], juggernaut: ['shotgun', 'rifle', 'smg'], trooper: ARMS_OF('soldier'), riot: ARMS_OF('soldier'),
};
// The mob's stats with its weapon applied (cached per type and weapon). wi: index into MOB_ARM_IDS, plus 1 (0 = unarmed).
const _armed = new Map();
export function armedBase(type, wi) {
  const base = MOBS[type];
  if (!wi) return base;
  const key = type + '@' + wi;
  if (_armed.has(key)) return _armed.get(key);
  const A = MOB_ARMS[MOB_ARM_IDS[wi - 1]];
  const b = { ...base, arm: MOB_ARM_IDS[wi - 1], dmg: Math.round(base.dmg * A.dmgK) };
  if (A.ranged) Object.assign(b, { ranged: true, range: A.range, rate: A.rate, hold: A.hold, pspd: A.pspd, pstyle: A.pstyle });
  else { delete b.ranged; delete b.pstyle; delete b.pspd; delete b.hold; b.range = (base.ranged ? 2.0 : base.range) + A.reach; b.rate = (base.ranged ? 1.0 : base.rate) * A.rate; }
  _armed.set(key, b);
  return b;
}
export function pickArm(type, rnd = Math.random) {
  const pool = MOB_ARM_POOL[type];
  if (!pool || !pool.length) return 0;
  return MOB_ARM_IDS.indexOf(pool[Math.floor(rnd() * pool.length)]) + 1;
}


// Boss health is multiplied by BOSS_HP and grows BOSS_GROW per round on top (see HostSim.spawnBoss); their hits use dmgScale.
export const BOSS_HP = 2.5, BOSS_GROW = 0.45;
export const BOSS_HP_ROUND = 2000, BOSS_DMG_ROUND = 10; // every round adds this much boss health, and this much damage to every boss attack
export const BOSSES = [
  { name: 'The Gravewarden', hp: 2200, color: 0x5a6a5a, glow: 0x7dffb0, scale: 3.2, speed: 4.2, attacks: ['slam', 'summon', 'ring'] },
  { name: 'Thornmother', hp: 2900, color: 0x3a4a22, glow: 0xb6ff4a, scale: 3.4, speed: 3.8, attacks: ['ring', 'summon', 'slam', 'barrage'] },
  { name: 'Sandreaver', hp: 3600, color: 0x9a6a3a, glow: 0xffc04a, scale: 3.2, speed: 5.0, attacks: ['charge', 'barrage', 'slam'] },
  { name: 'Rimefang', hp: 4400, color: 0x8ab0d0, glow: 0x9fe8ff, scale: 3.4, speed: 5.4, attacks: ['charge', 'ring', 'slam', 'barrage'] },
  { name: 'Magmaw', hp: 5400, color: 0x3a1a12, glow: 0xff6a1a, scale: 3.8, speed: 4.0, attacks: ['slam', 'barrage', 'ring', 'summon'] },
  { name: 'Vexaris', hp: 7500, color: 0x1a1024, glow: 0xd9a0ff, scale: 4.0, speed: 5.2, attacks: ['volley', 'beam', 'ring', 'volley', 'summon'] },
  // Round 6, always: a colossus. Calls minions and the bosses you already beat. dmgAdd is on top of the usual +10 a round.
  { name: 'Thermes', hp: 10000, color: 0x2a1040, glow: 0x5aa8ff, scale: 9.5, speed: 5.0, reach: 12, rad: 5, dmgAdd: 100, attacks: ['eyelaser', 'axespin', 'quake', 'meteor', 'echo', 'eyelaser', 'axespin', 'quake', 'meteor'] },
  // 7: the Hot Springs Valley's boss. 8: The Visitor, the hidden space map's boss: exactly 10,000 health (flatHp) and +400 damage on every attack.
  { name: 'Mossback', hp: 3200, color: 0x4a6a2a, glow: 0x9aff6a, scale: 3.6, speed: 4.4, attacks: ['slam', 'ring', 'summon', 'charge'] },
  { name: 'The Visitor', hp: 10000, flatHp: true, dmgAdd: 400, color: 0x9aa4b0, glow: 0x7dffb0, scale: 6.5, speed: 5.4, reach: 8, rad: 3.4, visitor: true, attacks: ['tpnear', 'vbeam', 'tpfar', 'ring', 'vbeam', 'tpnear', 'summon'] },
  // 9-13 (Nutty 2026-11-05): the Mixamo bosses that replace the old rotating stage bosses (0-5 and 7 stay in the table for echoes).
  { name: 'Dreadknight', hp: 4200, color: 0x2a2a34, glow: 0x9a3aff, scale: 3.6, speed: 5.0, attacks: ['pursuit', 'slam', 'charge', 'pursuit', 'ring'] },   // 9: #9 black-armoured warlord
  { name: 'The Archmage', hp: 3800, color: 0x5a2a4a, glow: 0xff5ad0, scale: 3.4, speed: 4.6, attacks: ['beam', 'ring', 'summon', 'beam', 'barrage'] }, // 10: #24 ornate mage
  { name: 'The Flayed', hp: 4600, color: 0x8a2a2a, glow: 0xff4a3a, scale: 3.8, speed: 5.4, attacks: ['flurry', 'charge', 'flurry', 'slam'] },    // 11: #26 skinless horror
  { name: 'Rotgut', hp: 3400, color: 0x4a7a3a, glow: 0x9aff4a, scale: 3.2, speed: 5.6, attacks: ['summon', 'pools', 'charge', 'pools'] },     // 12: #28 zombie
  { name: 'Big Elvis', hp: 5000, color: 0xe8e0d0, glow: 0xffd04a, scale: 4.0, speed: 4.2, attacks: ['stomp', 'slam', 'charge', 'stomp', 'ring'] },       // 13: #20 the huge jumpsuit crooner
  { name: 'Uncle Gus', hp: 4400, color: 0xd0a070, glow: 0xffa040, scale: 3.8, speed: 4.4, attacks: ['leap', 'slam', 'leap', 'summon'] },      // 14: #25 the big man in the shirt
];

// Death arrives at the 10 minute mark of every round. She can be killed, but her health bar is 500 times a Ghoul's.
// Her attack grows 20% with every round (compounding).
export const DEMON = { name: 'Death', speed: 8.4, dmg: 22, rate: 0.9, range: 3.6, hpMul: 500, atkGrow: 1.2, arrive: 600 };

export const NPCS = {
  sellsword: { name: 'Sellsword', role: 'Attack', cost: 40, hp: 160, dmg: 22, rate: 0.9, range: 2.5, speed: 7, color: 0x8a3a2a, desc: 'A hired blade that charges into melee.' },
  hunter: { name: 'Hunter', role: 'Attack', cost: 55, hp: 120, dmg: 20, rate: 1.0, range: 22, speed: 7, color: 0x3a5a2a, desc: 'Shoots arrows from range.' },
  cleric: { name: 'Cleric', role: 'Support', cost: 60, hp: 110, heal: 12, healRate: 1.6, dmg: 0, speed: 7, color: 0xe8e0c0, desc: 'Keeps the party alive with steady healing.' },
  warden: { name: 'Warden', role: 'Support', cost: 80, hp: 200, dmg: 18, rate: 1.0, range: 2.5, heal: 8, healRate: 2.2, speed: 7, color: 0x6a7a9a, desc: 'Tanky melee fighter who also heals.' },
  zombie: { name: 'Zombie', role: 'Summoned', cost: 0, summoned: true, life: 25, hp: 110, dmg: 14, rate: 0.8, range: 2.2, speed: 4.2, hunt: 45, color: 0x6a8a5a, desc: 'Raised by the Zombie Staff.' },
  medic: { name: 'Ranger-Medic', role: 'Support', cost: 90, hp: 120, dmg: 16, rate: 1.0, range: 20, heal: 8, healRate: 2.0, speed: 7, color: 0x4a8a6a, desc: 'Ranged fighter who also heals.' },
};
// Necromancer mutator: a fallen enemy back on its feet for 10 s (its body, health and hits are set from the enemy it was).
NPCS.thrall = { name: 'Risen', role: 'Summoned', cost: 0, summoned: true, risen: true, life: 10, hp: 100, dmg: 14, rate: 0.85, range: 2.3, speed: 4.4, hunt: 40, color: 0x5aff9a, desc: 'Raised by Raise the Dead.' };
export const NPC_TYPES = Object.keys(NPCS);

export const BLESSINGS = [
  { id: 'ares', name: "Ares' Wrath", desc: '+30% damage', icon: '⚔', apply: (s) => (s.dmg *= 1.3) },
  { id: 'hermes', name: "Hermes' Stride", desc: '+18% move speed', icon: '🜁', apply: (s) => (s.speed *= 1.18) },
  { id: 'asclepius', name: "Asclepius' Grace", desc: 'Regenerate 2.4 HP per second', icon: '✚', apply: (s) => (s.regen += 2.4) },
  { id: 'chronos', name: "Chronos' Gift", desc: '-30% ability cooldowns', icon: '⧗', apply: (s) => (s.cdr *= 0.7) },
  { id: 'athena', name: "Athena's Aegis", desc: '+60 max HP', icon: '⛨', apply: (s) => (s.maxHp += 60) },
  { id: 'hades', name: "Hades' Thirst", desc: 'Heal 7.2% of damage dealt', icon: '☠', apply: (s) => (s.lifesteal += 0.072) },
  { id: 'artemis', name: "Artemis' Focus", desc: '+30% attack speed', icon: '➶', apply: (s) => (s.rate *= 1.3) },
  { id: 'gaia', name: "Gaia's Bulwark", desc: 'Take 18% less damage', icon: '⛰', apply: (s) => (s.armor = 1 - (1 - s.armor) * 0.82) },
  { id: 'hephaestus', name: "Hephaestus' Forge", desc: 'Two blazing blades orbit you and cut everything near', icon: '⚒', apply: (s) => (s.orbit += 2) },
  { id: 'apollo', name: "Apollo's Sunfire", desc: 'A scorching aura of sunlight burns every enemy near you', icon: '☀', apply: (s) => (s.aura += 2) },
  { id: 'persephone', name: "Persephone's Harvest", desc: 'Everything you kill bursts into thorns (+1 Soul Burst) and you heal 3% of damage dealt', icon: '❀', apply: (s) => { s.burst += 1; s.lifesteal += 0.03; } },
  { id: 'demeter', name: "Demeter's Bounty", desc: '+36% PC from kills and pickups fly to you from far away', icon: '❦', apply: (s) => { s.greed *= 1.36; s.magnet += 2; } },
  { id: 'zeus', name: "Zeus' Thunder", desc: 'Your hits call lightning that arcs to 2 more enemies, and you attack 12% faster', icon: '↯', apply: (s) => { s.elem.storm += 2; s.rate *= 1.12; } },
  // The big six: each is run-defining on its own. Nine blessings are offered after every boss.
  { id: 'poseidon', name: "Poseidon's Tide", desc: '+250 max HP and regenerate 6 HP per second', icon: '🔱', apply: (s) => { s.maxHp += 250; s.regen += 6; } },
  { id: 'hera', name: "Hera's Decree", desc: '+60% damage and +25% attack speed', icon: '♛', apply: (s) => { s.dmg *= 1.6; s.rate *= 1.25; } },
  { id: 'dionysus', name: "Dionysus' Revelry", desc: '+30% move speed, +25% attack speed and heal 10% of damage dealt', icon: '🍇', apply: (s) => { s.speed *= 1.3; s.rate *= 1.25; s.lifesteal += 0.1; } },
  { id: 'hecate', name: "Hecate's Rebirth", desc: 'Rise again once when you fall, and take 25% less damage', icon: '☾', apply: (s) => { s.phoenix += 1; s.armor = 1 - (1 - s.armor) * 0.75; } },
  { id: 'nike', name: "Nike's Triumph", desc: '35% of hits deal double damage, and +60% damage to enemies below a third of their health', icon: '✦', apply: (s) => { s.crit += 0.35; s.execute += 0.6; } },
  { id: 'prometheus', name: "Prometheus' Gift", desc: '-40% cooldowns, +60% XP, +40% PC, and one more of your signature power', icon: '🔥', apply: (s) => { s.cdr *= 0.6; s.xpGain *= 1.6; s.greed *= 1.4; s.extra += 1; } },
];

// Power-ups come from crates and from levelling up (kill XP). `kind`: stat, ability (Q/R/G/dash
// mastery) or special (a new effect rather than a number). `lv: false` keeps one out of the
// level-up pool (crate-only); `crate: n` is its weight in the special-crate draw.
const mast = (key, mode, f) => ({ id: 'm_' + key + '_' + mode, kind: 'ability', key, mode, icon: mode === 'dmg' ? '✦' : '⏱', apply: (s) => { s.mast[key][mode] = Math.max(mode === 'cd' ? 0.35 : 0, s.mast[key][mode] * f); } });
export const POWERUPS = [
  { id: 'dmg', kind: 'stat', icon: '⚔', name: 'Sharpened Edge', desc: '+10% damage', apply: (s) => (s.dmg *= 1.1) },
  { id: 'rate', kind: 'stat', icon: '≫', name: 'Quick Hands', desc: '+10% attack speed', apply: (s) => (s.rate *= 1.1) },
  { id: 'hp', kind: 'stat', icon: '♥', name: 'Vital Essence', desc: '+20 max HP', apply: (s) => (s.maxHp += 20) },
  { id: 'spd', kind: 'stat', icon: '➤', name: 'Light Boots', desc: '+6% move speed', apply: (s) => (s.speed *= 1.06) },
  { id: 'cd', kind: 'stat', icon: '⏱', name: 'Arcane Focus', desc: '-10% cooldowns', apply: (s) => (s.cdr *= 0.9) },
  { id: 'leech', kind: 'stat', icon: '☠', name: 'Vampiric Rune', desc: '+3% lifesteal', apply: (s) => (s.lifesteal += 0.03) },
  { id: 'armor', kind: 'stat', icon: '⛨', name: 'Iron Skin', desc: 'Take 6% less damage', apply: (s) => (s.armor = 1 - (1 - s.armor) * 0.94) },
  { id: 'regen', kind: 'stat', icon: '✚', name: 'Regrowth', desc: '+2 HP per second', apply: (s) => (s.regen += 2) },
  { id: 'jump', kind: 'stat', icon: '⇑', name: 'Spring Legs', desc: '+15% jump height', apply: (s) => (s.jump *= 1.15) },
  { id: 'eldmg', kind: 'stat', icon: '✦', name: 'Elemental Might', desc: 'Your three powers (Q, F, G) hit 15% harder', apply: (s) => { for (const k of ['q', 'r', 'e']) s.mast[k].dmg *= 1.15; } },
  { id: 'extra', kind: 'extra', icon: '✚', name: 'One More', desc: 'Your signature power throws one more', apply: (s) => (s.extra += 1) },
  // Physical attack power-ups: one random pick on every level-up card row.
  { id: 'crit', kind: 'special', icon: '✧', name: 'Killer Instinct', desc: '+10% critical hit chance on every attack: double damage in yellow numbers (stacks)', apply: (s) => (s.crit = Math.min(0.6, s.crit + 0.1)) },
  { id: 'execute', kind: 'special', lv: false, icon: '☠', name: 'Executioner', desc: '+30% damage to enemies below a third of their health (stacks)', apply: (s) => (s.execute += 0.3) },
  { id: 'bigmag', kind: 'special', lv: false, icon: '▭', name: 'Extended Mag', desc: '+30% magazine on every gun (stacks)', apply: (s) => (s.mag *= 1.3) },
  { id: 'fastreload', kind: 'special', lv: false, icon: '↻', name: 'Fast Hands', desc: 'Reload and recharge 25% faster (stacks)', apply: (s) => (s.reload *= 0.75) },
  { id: 'heavy', kind: 'special', lv: false, icon: '⮕', name: 'Heavy Rounds', desc: 'Your hits shove enemies back (stacks)', apply: (s) => (s.kb += 4) },
  mast('q', 'dmg', 1.25), mast('q', 'cd', 0.85),
  mast('r', 'dmg', 1.25), mast('r', 'cd', 0.85),
  mast('e', 'dmg', 1.25), mast('e', 'cd', 0.85),
  mast('d', 'dmg', 1.3), mast('d', 'cd', 0.85),
  { id: 'orbit', kind: 'special', icon: '✶', crate: 7, name: 'Orbiting Blades', desc: 'A spinning blade circles you and cuts anything it touches (stacks, up to 6)', apply: (s) => (s.orbit += 1) },
  { id: 'aura', kind: 'special', icon: '◉', crate: 3, name: 'Scorching Aura', desc: 'Enemies near you are burned continuously (stacks, up to 6)', apply: (s) => (s.aura += 1) },
  { id: 'burst', kind: 'special', icon: '✹', crate: 3, name: 'Soul Burst', desc: 'Enemies you kill explode (stacks)', apply: (s) => (s.burst += 1) },
  { id: 'magnet', kind: 'special', icon: '⌖', crate: 2, name: 'Magnet Charm', desc: 'Pickups fly to you from farther away (stacks)', apply: (s) => (s.magnet += 1) },
  { id: 'learn', kind: 'special', icon: '✎', name: 'Quick Study', desc: '+25% XP from kills (stacks)', apply: (s) => (s.xpGain *= 1.25) },
  { id: 'reach', kind: 'special', icon: '⤢', crate: 3, name: 'Reaper\'s Reach', desc: 'While you hold a melee weapon, its swing is 10% wider and reaches 10% farther (stacks)', apply: (s) => (s.reach += 0.1) },
  { id: 'longarm', kind: 'stat', icon: '↔', name: 'Long Arm', desc: 'Melee weapons reach 20% farther and swing 20% wider (stacks)', apply: (s) => (s.reach += 0.2) },
  // Reroll set: 30 extra picks. Only dice rerolls draw from here, and every reroll shows a fresh ten.
  { id: 'rr_vigor', rr: true, kind: 'stat', icon: '♥', name: 'Vigor', desc: '+35 max HP and +1 HP per second', apply: (s) => { s.maxHp += 35; s.regen += 1; } },
  { id: 'rr_swift', rr: true, kind: 'stat', icon: '➤', name: 'Fleet Foot', desc: '+10% move speed', apply: (s) => { s.speed *= 1.1; } },
  { id: 'rr_whet', rr: true, kind: 'stat', icon: '⚔', name: 'Whetstone', desc: '+14% damage', apply: (s) => { s.dmg *= 1.14; } },
  { id: 'rr_frenzy', rr: true, kind: 'stat', icon: '≫', name: 'Frenzy', desc: '+14% attack speed', apply: (s) => { s.rate *= 1.14; } },
  { id: 'rr_ward', rr: true, kind: 'stat', icon: '⛨', name: 'Ward', desc: 'Take 9% less damage', apply: (s) => { s.armor = 1 - (1 - s.armor) * 0.91; } },
  { id: 'rr_drain', rr: true, kind: 'stat', icon: '☠', name: 'Soul Drain', desc: '+4.5% lifesteal', apply: (s) => { s.lifesteal += 0.045; } },
  { id: 'rr_deepfocus', rr: true, kind: 'stat', icon: '⏱', name: 'Deep Focus', desc: '-14% cooldowns', apply: (s) => { s.cdr *= 0.86; } },
  { id: 'rr_scholar', rr: true, kind: 'stat', icon: '✎', name: 'Scholar', desc: '+40% XP from kills', apply: (s) => { s.xpGain *= 1.4; } },
  { id: 'rr_goldrush', rr: true, kind: 'stat', icon: '¢', name: 'Gold Rush', desc: '+25% PC from kills', apply: (s) => { s.greed *= 1.25; } },
  { id: 'rr_lure', rr: true, kind: 'stat', icon: '⌖', name: 'Magnet Ring', desc: 'Pickups fly to you from much farther', apply: (s) => { s.magnet += 2; } },
  { id: 'rr_hawk', rr: true, kind: 'stat', icon: '✧', name: 'Hawkeye', desc: '+8% chance to deal double damage', apply: (s) => { s.crit = Math.min(0.75, s.crit + 0.08); } },
  { id: 'rr_finisher', rr: true, kind: 'stat', icon: '☠', name: 'Finisher', desc: '+40% damage to enemies below a third of their health', apply: (s) => { s.execute += 0.4; } },
  { id: 'rr_drum', rr: true, kind: 'stat', icon: '▭', name: 'Drum Mags', desc: '+40% magazine on every gun', apply: (s) => { s.mag *= 1.4; } },
  { id: 'rr_speedload', rr: true, kind: 'stat', icon: '↻', name: 'Speedloader', desc: 'Reload and recharge 30% faster', apply: (s) => { s.reload *= 0.7; } },
  { id: 'rr_concuss', rr: true, kind: 'stat', icon: '⮕', name: 'Concussive', desc: 'Your hits shove enemies back hard', apply: (s) => { s.kb += 6; } },
  { id: 'rr_pogo', rr: true, kind: 'stat', icon: '⇑', name: 'Pogo Legs', desc: '+25% jump height', apply: (s) => { s.jump *= 1.25; } },
  { id: 'rr_twinblades', rr: true, kind: 'stat', icon: '✶', name: 'Twin Blades', desc: 'Two more blades orbit you', apply: (s) => { s.orbit += 2; } },
  { id: 'rr_embers', rr: true, kind: 'stat', icon: '◉', name: 'Ember Skin', desc: 'A burning aura scorches nearby enemies', apply: (s) => { s.aura += 2; } },
  { id: 'rr_deathpop', rr: true, kind: 'stat', icon: '✹', name: 'Death Pop', desc: 'Enemies you kill explode, twice as hard', apply: (s) => { s.burst += 2; } },
  { id: 'rr_giant', rr: true, kind: 'stat', icon: '⤢', name: "Giant's Grip", desc: 'Melee weapons reach 25% farther', apply: (s) => { s.reach += 0.25; } },
  { id: 'rr_qover', rr: true, kind: 'stat', icon: '✦', name: 'Q Overload', desc: 'Your Q power hits 40% harder', apply: (s) => { s.mast.q.dmg *= 1.4; } },
  { id: 'rr_fover', rr: true, kind: 'stat', icon: '✦', name: 'F Overload', desc: 'Your F power hits 40% harder', apply: (s) => { s.mast.r.dmg *= 1.4; } },
  { id: 'rr_gover', rr: true, kind: 'stat', icon: '✦', name: 'G Overload', desc: 'Your G power hits 40% harder', apply: (s) => { s.mast.e.dmg *= 1.4; } },
  { id: 'rr_dashmaster', rr: true, kind: 'stat', icon: '➶', name: 'Dash Master', desc: 'Dash hits 50% harder and recharges 20% faster', apply: (s) => { s.mast.d.dmg *= 1.5; s.mast.d.cd = Math.max(0.35, s.mast.d.cd * 0.8); } },
  { id: 'rr_bulwark', rr: true, kind: 'stat', icon: '⛫', name: 'Bulwark', desc: '+60 max HP and take 5% less damage', apply: (s) => { s.maxHp += 60; s.armor = 1 - (1 - s.armor) * 0.95; } },
  { id: 'rr_rage', rr: true, kind: 'stat', icon: '☄', name: 'Berserk Rage', desc: '+30% damage, but you take 10% more', apply: (s) => { s.dmg *= 1.3; s.armor = 1 - (1 - s.armor) * 1.1; } },
  { id: 'rr_adrenaline', rr: true, kind: 'stat', icon: '⚡', name: 'Adrenaline', desc: '+8% move speed and +8% attack speed', apply: (s) => { s.speed *= 1.08; s.rate *= 1.08; } },
  { id: 'rr_secondskin', rr: true, kind: 'stat', icon: '✚', name: 'Second Skin', desc: '+3 HP per second', apply: (s) => { s.regen += 3; } },
  { id: 'rr_echo', rr: true, kind: 'stat', icon: '✚', name: 'Echo', desc: 'Your signature power throws one more', apply: (s) => { s.extra += 1; } },
  { id: 'rr_lucky', rr: true, kind: 'stat', icon: '♣', name: 'Lucky Streak', desc: '+6% double-damage chance and +20% PC from kills', apply: (s) => { s.crit = Math.min(0.75, s.crit + 0.06); s.greed *= 1.2; } },
  { id: 'phoenix', kind: 'special', lv: false, icon: '♨', crate: 2, name: 'Phoenix Feather', desc: 'Rise again once when you fall (stacks, per run)', apply: (s) => (s.phoenix += 1) },
  { id: 'greed', kind: 'special', lv: false, icon: '¢', crate: 2, name: 'Midas Touch', desc: '+30% PC from kills', apply: (s) => (s.greed *= 1.3) },
  // Crate-only specials: trade-offs and new flavours, so a crate is rarely the same pick twice.
  { id: 'titan', kind: 'special', lv: false, icon: '⛫', crate: 1.5, name: "Titan's Heart", desc: '+60 max HP, but 4% slower', apply: (s) => { s.maxHp += 60; s.speed *= 0.96; } },
  { id: 'glass', kind: 'special', lv: false, icon: '✦', crate: 1.5, name: 'Glass Cannon', desc: '+35% damage, -25 max HP', apply: (s) => { s.dmg *= 1.35; s.maxHp -= 25; } },
  { id: 'berserk', kind: 'special', lv: false, icon: '☄', crate: 1.5, name: 'Berserker', desc: '+20% damage, you take 5% more', apply: (s) => { s.dmg *= 1.2; s.armor = 1 - (1 - s.armor) * 1.05; } },
  { id: 'rush', kind: 'special', lv: false, icon: '⚡', crate: 1.5, name: 'Bloodrush', desc: '+15% attack speed and +8% move speed', apply: (s) => { s.rate *= 1.15; s.speed *= 1.08; } },
  { id: 'siphon', kind: 'special', lv: false, icon: '♥', crate: 1.5, name: 'Soul Siphon', desc: '+4% lifesteal and +1 HP per second', apply: (s) => { s.lifesteal += 0.04; s.regen += 1; } },
  { id: 'bulwark', kind: 'special', lv: false, icon: '⛨', crate: 1.5, name: 'Bulwark', desc: 'Take 10% less damage, 5% slower', apply: (s) => { s.armor = 1 - (1 - s.armor) * 0.9; s.speed *= 0.95; } },
  { id: 'adrenaline', kind: 'special', lv: false, icon: '✚', crate: 1.5, name: 'Adrenaline', desc: '+2 HP per second and +5% move speed', apply: (s) => { s.regen += 2; s.speed *= 1.05; } },
  // Wild elemental power-ups: they work with whatever cooldowns you carry.
  { id: 'wildmagic', kind: 'special', lv: false, icon: '✺', crate: 1.3, name: 'Wild Magic', desc: 'Every cooldown you cast has a 15% chance to make your other two ready at once (stacks)', apply: (s) => (s.wild = Math.min(0.6, s.wild + 0.15)) },
  { id: 'feast', kind: 'special', lv: false, icon: '✺', crate: 1.3, name: 'Elemental Feast', desc: 'Every cooldown you cast heals 4% of your health (stacks)', apply: (s) => (s.castHeal += 0.04) },
  { id: 'momentum', kind: 'special', lv: false, icon: '✺', crate: 1.3, name: 'Momentum', desc: 'Every cooldown you cast makes you run 45% faster for 3 seconds (stacks)', apply: (s) => (s.castHaste += 3) },
  { id: 'resonance', kind: 'special', lv: false, icon: '✺', crate: 1.1, name: 'Resonance', desc: 'Every cooldown you cast also bursts your element out around you, hitting everything close (stacks)', apply: (s) => (s.castNova += 1) },
  { id: 'heal', kind: 'stat', lv: false, icon: '✚', name: 'Healing Draught', desc: 'Fully healed', apply: (s, p) => (p.hp = s.maxHp) },
];

// Elemental power-ups: every level-up offers all five and each one stacks without limit.
const el = (id, icon, name, color, desc, apply) => ({ id: 'el_' + id, el: id, kind: 'element', icon, name, color, desc, apply: (s, p) => { s.elem[id]++; apply(s, p); } });
export const ELEMENTS = [
  el('fire', '🔥', 'Fire', '#ff7a2a', 'Your hits set enemies ablaze for longer (+1 s per stack) and hit 8% harder.', (s) => (s.dmg *= 1.08)),
  el('frost', '❄', 'Frost', '#8fdcff', 'Your hits chill enemies, and each hit has a growing chance to freeze them solid.', () => {}),
  el('storm', '⚡', 'Storm', '#c9a8ff', 'Your hits arc lightning to one more nearby enemy per stack, and you attack 4% faster.', (s) => (s.rate *= 1.04)),
  el('earth', '⛰', 'Earth', '#b99062', '+25 max HP and take 6% less damage.', (s) => { s.maxHp += 25; s.armor = 1 - (1 - s.armor) * 0.94; }),
  el('wind', '🌪', 'Wind', '#9fe8c0', '+7% move speed, +6% attack speed and 4% faster cooldowns.', (s) => { s.speed *= 1.07; s.rate *= 1.06; s.cdr *= 0.96; }),
];
export const LEVELUPS = POWERUPS.filter((p) => p.lv !== false && p.id !== 'extra'); // stats, masteries, and the blades/aura/burst/magnet family
// What a special crate can hold: every special above plus the five elements.
export const CRATE_POOL = [...POWERUPS.filter((p) => p.kind === 'special'), ...ELEMENTS.map((e) => ({ ...e, crate: 1.2 }))];

// Names for the ability masteries depend on the character's own moves.
// "One More": what the extra cast is depends on the character's Q power.
export const EXTRA_BY_CLASS = {
  pyre: { name: 'Extra Fireball', desc: 'Fireball throws one more fireball per cast (stacks)' },
  bastion: { name: 'Extra Boulder', desc: 'Boulder Toss hurls one more boulder per cast (stacks)' },
  gale: { name: 'Extra Tornado', desc: 'Tornado unleashes one more tornado per cast (stacks)' },
  tempest: { name: 'Extra Shockwave', desc: 'Thunder Shockwave sends out one more ring, a beat behind the first (stacks)' },
  necro: { name: 'Wider Drain', desc: 'Life Drain latches onto one more enemy per cast (stacks)' },
  rime: { name: 'More Crystals', desc: 'Ice Shards summons 2 more crystals per cast (stacks)' },
};
export function puInfo(pu, cls) {
  if (pu.kind === 'extra') return EXTRA_BY_CLASS[cls.id] || { name: pu.name, desc: pu.desc };
  if (pu.kind !== 'ability') return { name: pu.name, desc: pu.desc };
  const nm = pu.key === 'd' ? 'Dash' : cls[pu.key].name;
  return pu.mode === 'dmg'
    ? { name: nm + ' Mastery', desc: nm + ' hits ' + (pu.key === 'd' ? '30' : '25') + '% harder' }
    : { name: nm + ' Haste', desc: nm + ' recharges 15% faster' };
}

// Duel Arena: two players, one of three arenas (picked at random per match, see DUEL_BIOMES), 1000 HP each. Every `pickEvery` seconds the game pauses and both
// choose one of five random attack power-ups.
// pvp scales every hit one fighter lands on the other, so 1000 health lasts a fight instead of a few seconds.
// size: duel fighters are drawn (and hit) this many times their normal size, so they read clearly across the arena.
export const DUEL = { cd: 5, // every ability cooldown in the arena
 hp: 1000, len: 600, pickEvery: 30, count: 3, offer: 5, stage: 2, pvp: 0.06, arena: 50, size: 2.25,
 // Status effects one fighter lands on the other (Ice Gun block, frost slow, hammer shove...): longest freeze / slow, and the grace after a thaw.
 freezeMax: 3, slowMax: 3, thawImmune: 2 };
// Gravity Gun: a well pulls everything within `pull` m toward its centre for `dur` seconds, then collapses in a blast of
// radius `blast`. Bosses are pulled only `boss` m (weakly) and take `bossDmg`. Friends are pulled too, never hurt.
// Flaming Weapons (Pyre): damage and melee reach while the held weapon burns, and the shortest burn a hit leaves.
export const FLAME = { dmg: 1.95, reach: 1.35, arc: 1.15, minBurn: 2 };
export const HEAL = { self: 0.1, beam: 1.2 }; // Healing Staff: share of max HP you mend yourself, seconds the beams stay up
export const GRAV = { dur: 1.25, pull: 14, blast: 9, dmg: 600, boss: 5, bossDmg: 150, max: 6 };
// The first Duel Arena's look: a bright, flat green plain with the walled arena in the middle (not one of the six run stages).
export const DUEL_BIOME = {
  id: 'meadow', name: 'Green Plains', seedTex: 505,
  groundCols: [[0.2, 0.36, 0.11], [0.3, 0.46, 0.15], [0.26, 0.3, 0.12]], ground: 'pebbles',
  sky: [0x3f86d8, 0xbfe3f2], fog: 0xcde6e6, fogDensity: 0.0055, sun: 0xfff0d0, sunI: 2.7, hemi: [0xcfe6ff, 0x4f7a34], hemiI: 0.95,
  props: [], mobTint: 0x6f8f5a,
};
// Two more bright arenas. The host picks one of the three for every match (HostSim.startDuel) and sends its index in the snapshot.
// stone: tint of the arena's own stonework and cover, rune: colour of its glowing decal, stage: which stage's music plays (BIOMES index).
export const DUEL_DUNES = {
  id: 'dunes', name: 'Sun Dunes', seedTex: 515,
  groundCols: [[0.86, 0.68, 0.38], [0.96, 0.8, 0.46], [0.74, 0.52, 0.26]], ground: 'smooth',
  sky: [0x2c7be4, 0xcde8f6], fog: 0xefe2bf, fogDensity: 0.0042, sun: 0xfff1c8, sunI: 3.0, hemi: [0xd2e6ff, 0xc9a064], hemiI: 1.0,
  props: [], mobTint: 0xc29a6a, stone: [0.9, 0.62, 0.38], rune: 0xe0a030, stage: 2,
};
export const DUEL_FROST = {
  id: 'frost', name: 'Frostfield', seedTex: 525,
  groundCols: [[0.8, 0.9, 0.98], [0.93, 0.97, 1.0], [0.62, 0.8, 0.95]], ground: 'smooth',
  sky: [0x3f8cf0, 0xd6ecfb], fog: 0xdcebf7, fogDensity: 0.0042, sun: 0xfff6ea, sunI: 2.8, hemi: [0xd6eaff, 0xa9bfd8], hemiI: 1.05,
  props: [], mobTint: 0xa8c4dc, stone: [0.74, 0.86, 0.98], rune: 0x3a9ad8, stage: 3,
};
// The Graveyard arena: an old churchyard at golden hour, low sun and ground mist. A chapel in the middle and a crypt on each flank,
// all of them open to walk through (buildkit.js). tex: it shares the run Graveyard's scanned ground.
export const DUEL_GRAVE = {
  id: 'crypt', tex: 'graveyard', name: 'Graveyard', seedTex: 535,
  groundCols: [[0.2, 0.22, 0.15], [0.3, 0.3, 0.2], [0.23, 0.2, 0.16]], ground: 'pebbles',
  sky: [0x4a66a8, 0xf4c9a0], fog: 0xc9c0ba, fogDensity: 0.0046, sun: 0xffdcb4, sunI: 3.0, hemi: [0xb8c6f0, 0x5c5a4a], hemiI: 0.95,
  props: [], mobTint: 0x9aa58a, stone: [0.56, 0.56, 0.58], rune: 0x8a7a5a, stage: 0,
};
export const DUEL_BIOMES = [DUEL_BIOME, DUEL_DUNES, DUEL_FROST, DUEL_GRAVE];
const dp = (id, icon, name, desc, apply) => ({ id: 'd_' + id, kind: 'duel', lv: false, icon, name, desc, apply });
const byId = (id) => POWERUPS.find((p) => p.id === id);
export const DUEL_PICKS = [
  byId('orbit'), byId('aura'), byId('dmg'), byId('rate'), byId('leech'), byId('armor'), byId('hp'), byId('spd'), byId('cd'),
  byId('m_q_dmg'), byId('m_r_dmg'), byId('m_e_dmg'), byId('m_d_dmg'),
  ELEMENTS.find((e) => e.el === 'fire'), ELEMENTS.find((e) => e.el === 'earth'), ELEMENTS.find((e) => e.el === 'wind'),
  dp('blades', '⚔', 'Blade Storm', 'Two more razor blades whirl around you (stacks)', (s) => (s.orbit += 2)),
  dp('ring', '◉', 'Inferno Ring', 'A wider ring of fire burns everything near you (stacks)', (s) => (s.aura += 2)),
  dp('berserk', '☄', 'Berserker', '+25% damage, but you take 8% more', (s) => { s.dmg *= 1.25; s.armor = 1 - (1 - s.armor) * 1.08; }),
  dp('glass', '✦', 'Glass Cannon', '+40% damage, -120 max HP', (s) => { s.dmg *= 1.4; s.maxHp -= 120; }),
  dp('rush', '≫', 'Bloodrush', '+20% attack speed and +10% move speed', (s) => { s.rate *= 1.2; s.speed *= 1.1; }),
  dp('vamp', '♥', 'Soul Siphon', 'Heal 8% of damage dealt', (s) => (s.lifesteal += 0.08)),
];

// ---- Elemental chest power-ups (Nutty 2026-11-12): one for EVERY cooldown, found in chests, drawn from the three you carry. ----
// Each is built from the same few perks, so a new cooldown gets one the day it is added (give it a line in AB_PERKS for its own
// name, or it gets "<Name> Surge"). Perks: dmg (x damage), cd (x recharge), echo (chance it is ready again at once), nova (your
// element bursts out around you when you cast it), heal (share of max health per cast), haste (seconds of running fast),
// ward (seconds of taking half damage). All stack. The burst's own flavour comes from the element (player.js abNova).
const AB_PERKS = {
  fireball: ['Wildfire', { dmg: 1.35, nova: 1 }], inferno: ['Backdraft', { cd: 0.8, heal: 0.06 }], firewall: ['Firewalker', { dmg: 1.25, haste: 5 }],
  breath: ['Second Wind', { echo: 0.3 }], flameweap: ['Forge Heart', { heal: 0.1, nova: 1 }], minisun: ['Solar Flare', { dmg: 1.4 }],
  sunlance: ['High Noon', { cd: 0.75, dmg: 1.2 }], dragon: ['Dragon Rider', { haste: 6, ward: 4 }], seekers: ['Skull Storm', { echo: 0.35 }],
  boulder: ['Avalanche', { dmg: 1.4 }], rockarmor: ['Living Mountain', { heal: 0.15, nova: 1 }], pillars: ['Aftershock', { nova: 2 }],
  orbit: ['Moonlets', { dmg: 1.5 }], meteor: ['Meteor Shower', { echo: 0.3 }], stomp: ["Giant's Step", { cd: 0.75, ward: 3 }], golem: ['Stoneheart', { dmg: 1.3, ward: 4 }],
  chain: ['Overload', { dmg: 1.35, nova: 1 }], storm: ['Thunderhead', { cd: 0.8, haste: 4 }], shockwave: ['Thunderclap', { echo: 0.3 }],
  fence: ['Live Wire', { nova: 2, ward: 3 }], blink: ['Flicker', { echo: 0.4, heal: 0.05 }],
  shards: ['Glacier Lance', { dmg: 1.4 }], barrier: ['Permafrost', { heal: 0.12, nova: 1 }], tsunami: ['Riptide', { cd: 0.75, haste: 4 }],
  rain: ['Monsoon', { heal: 0.1, ward: 3 }], whirl: ['Maelstrom', { dmg: 1.4 }], jet: ['Fire Hose', { echo: 0.3 }],
  snowball: ['Snow Day', { ward: 5, nova: 1 }], polaris: ['North Star', { dmg: 1.3, heal: 0.08 }], zero: ['Deep Freeze', { cd: 0.75, nova: 1 }],
  veil: ['Tailwind', { haste: 6, heal: 0.06 }], cyclone: ['Twin Twisters', { echo: 0.3 }], eye: ['Calm Centre', { heal: 0.15, cd: 0.85 }],
  cloud: ['Silver Lining', { heal: 0.2, nova: 1 }], airshot: ['Sonic Boom', { dmg: 1.4, nova: 1 }], tornado: ['Hurricane', { dmg: 1.3, haste: 4 }],
  lifedrain: ['Blood Feast', { dmg: 1.3, heal: 0.05 }], acid: ['Corrosion', { dmg: 1.4 }], raise: ['Legion', { echo: 0.3 }],
  vines: ['Bramble Heart', { ward: 4, nova: 1 }], ghostwalk: ['Haunt', { heal: 0.15, nova: 1 }], crows: ['Murder of Crows', { cd: 0.75, dmg: 1.2 }],
  supper: ['Second Helping', { echo: 0.3 }], finger: ["Death's Door", { cd: 0.7 }],
};
const BURST = { pyre: 'a ring of fire that burns', bastion: 'a ground shock that stuns', tempest: 'a lightning burst that shocks', rime: 'a frost burst that freezes', gale: 'a blast of wind that throws back', necro: 'a wave of rot that poisons' };
const pct = (x) => Math.round(Math.abs(x - 1) * 100);
function abPu(cls, ab) {
  const [name, fx] = AB_PERKS[ab.id] || [ab.name + ' Surge', { dmg: 1.3, cd: 0.9 }];
  const d = [];
  if (fx.dmg) d.push(ab.name + ' hits ' + pct(fx.dmg) + '% harder');
  if (fx.cd) d.push((d.length ? 'it' : ab.name) + ' recharges ' + pct(fx.cd) + '% faster');
  if (fx.echo) d.push(ab.name + ' has a ' + Math.round(fx.echo * 100) + '% chance to be ready again the moment you cast it');
  const on = [];
  if (fx.nova) on.push('sends out ' + (BURST[cls.id] || 'a burst of your element that hits') + ' everything close' + (fx.nova > 1 ? ' (double strength)' : ''));
  if (fx.heal) on.push('heals ' + Math.round(fx.heal * 100) + '% of your health');
  if (fx.haste) on.push('makes you run 45% faster for ' + fx.haste + ' seconds');
  if (fx.ward) on.push('halves the damage you take for ' + fx.ward + ' seconds');
  if (on.length) d.push('Casting ' + ab.name + ' ' + on.join(' and '));
  return {
    id: 'ab_' + ab.id, kind: 'abpu', ab: ab.id, cls: cls.id, icon: '✦', color: cls.css, name, desc: d.join('. ') + '. Stacks.',
    apply: (s) => {
      const a = s.ab[ab.id] || (s.ab[ab.id] = { dmg: 1, cd: 1, echo: 0, nova: 0, heal: 0, haste: 0, ward: 0 });
      if (fx.dmg) a.dmg *= fx.dmg; if (fx.cd) a.cd = Math.max(0.4, a.cd * fx.cd); if (fx.echo) a.echo = Math.min(0.75, a.echo + fx.echo);
      a.nova += fx.nova || 0; a.heal += fx.heal || 0; a.haste += fx.haste || 0; a.ward += fx.ward || 0;
    },
  };
}
export const AB_PUS = CLASSES.flatMap((c) => [c.q, c.r, c.e, ...(c.more || [])].map((ab) => abPu(c, ab)));
export const AB_PU_BY_AB = Object.fromEntries(AB_PUS.map((p) => [p.ab, p]));
export const POWERUP_BY_ID = Object.fromEntries([...POWERUPS, ...ELEMENTS, ...DUEL_PICKS, ...AB_PUS].map((p) => [p.id, p]));

// Every level-up offers ten cards: six fixed picks, a random physical attack power-up, a random element,
// a random utility stat and a random power mastery.
const PHYSICAL = ['orbit', 'aura', 'burst', 'rate', 'leech', 'crit', 'execute', 'bigmag', 'fastreload', 'heavy'];
const UTILITY = ['hp', 'cd', 'armor', 'learn'];
const MASTERY = POWERUPS.filter((p) => p.kind === 'ability').map((p) => p.id);
// Nutty 2026-11-12 14:42: the cards are random every level (ten of them again, Nutty 2026-11-12 21:59; no repeats), and one or two are always elemental
// power-ups for the cooldowns of your own element that you carry (AB_PUS).
// The "one more" cards belong to each element's first cooldown. They are only offered while that cooldown is one of the three equipped.
const SIGNATURE = { pyre: 'fireball', bastion: 'boulder', gale: 'cyclone', tempest: 'shockwave', necro: 'lifedrain', rime: 'shards' };
export function hasSignature(cls) { return !!cls && ['q', 'r', 'e'].some((k) => cls[k] && cls[k].id === SIGNATURE[cls.id]); }
export function levelOffer(cls) {
  const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const mine = cls ? shuffle(['q', 'r', 'e'].map((k) => cls[k] && AB_PU_BY_AB[cls[k].id]).filter(Boolean)) : [];
  const el = mine.slice(0, mine.length ? 1 + (Math.random() < 0.5 ? 1 : 0) : 0);
  const pool = shuffle([...['dmg', 'spd', 'jump', 'eldmg', ...(hasSignature(cls) ? ['extra'] : []), 'regen', ...PHYSICAL, ...UTILITY, ...MASTERY].map((id) => POWERUP_BY_ID[id]).filter(Boolean), ...ELEMENTS]);
  return shuffle([...el, ...pool.slice(0, 10 - el.length)]);
}

// A reroll: ten different picks drawn from the 30 reroll power-ups, never any that are on screen now.
export function rerollOffer(current, cls) {
  const cur = new Set((current || []).map((o) => o.id));
  const pool = POWERUPS.filter((p) => p.rr && !cur.has(p.id) && (p.id !== 'rr_echo' || hasSignature(cls)));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, 10);
}

// XP: each kill feeds the bar, each full bar grants a random level-up power-up.
export const XP = {
  kill: { 1: 4, 2: 8, 3: 14 }, mini: 60, boss: 200, perRound: 0.08,
  need: (lv) => Math.round(80 + 60 * lv + lv * lv * 7), // steeper (Nutty 2026-11-12 14:42): was 50 + 34 lv + 3.2 lv^2, too many easy power-ups with the bigger crowd // about 8-10 power-ups a round for a good player: each pick matters (2026-11-08)
};

export function freshStats() {
  return {
    dmg: 1, rate: 1, maxHp: CONFIG.baseHp, speed: 1, cdr: 1, lifesteal: 0, regen: 0, armor: 0,
    xpGain: 1, elem: { fire: 0, frost: 0, storm: 0, earth: 0, wind: 0 }, orbit: 0, aura: 0, burst: 0, magnet: 0, phoenix: 0, greed: 1,
    jump: 1, extra: 0, reach: 1, crit: 0, execute: 0, mag: 1, reload: 1, kb: 0,
    mast: { q: { dmg: 1, cd: 1 }, r: { dmg: 1, cd: 1 }, e: { dmg: 1, cd: 1 }, d: { dmg: 1, cd: 1 } },
    ab: {}, wild: 0, castHeal: 0, castHaste: 0, castNova: 0, // elemental chest power-ups (AB_PUS): per-cooldown perks by ability id, and the wild ones that fire on every cast
  };
}

// Each run visits the six stages in its own order, shuffled from the run seed.
// Bosses are tied to their stage, so a stage always brings its own boss.
// The last round is always Fear; every other round fights the boss of its stage.
// The run seed's low bits carry the run's settings so every seat agrees on them: bit 0 = the hidden space map is in the pool, bit 1 = Hard mode.
export const SEED_SPACE = 1, SEED_HARD = 2;
export const seedFlags = (seed) => ({ space: ((seed | 0) & SEED_SPACE) !== 0, hard: ((seed | 0) & SEED_HARD) !== 0 });
// Stages 0-5 are the original six, 6 the Hot Springs Valley, 7 the space map. Boss indices: stage s fights BOSSES[s] (6 is Fear, so the
// springs map uses 7 and the space map 8); the last round is always Fear.
// Which boss each stage brings (BOSSES index per BIOMES index). The four newest maps borrow a boss until they get their own.
export const STAGE_BOSS = [9, 11, 10, 13, 10, 5, 12, 8, 11, 14, 10, 9]; // Nutty 2026-11-05: Mixamo bosses 9-13 on every rotating stage (Thermes and The Visitor unchanged)
// The stages a run draws from (BIOMES indices). The space map joins through the run seed's flag, never through this list.
export const STAGE_POOL = [0, 1, 2, 3, 4, 6, 9, 11]; // The Abyss (5) dropped, Forest Clearing (9) and Misty Ruins (11) added (Nutty 2026-11-05)
export function bossIdx(runSeed, round) { return round >= CONFIG.rounds ? 8 : round >= CONFIG.rounds - 1 ? 6 : STAGE_BOSS[stageIdx(runSeed, round)] ?? 0; }
export function stageIdx(runSeed, round) {
  if (round >= CONFIG.rounds) return 7; // the optional bonus round after Fear is always the space map
  const order = [...STAGE_POOL]; // Crash Site Prime never joins rounds 1-6: it is only the bonus round after Thermes (Nutty 2026-11-06)
  let a = (runSeed | 0) >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const run = order.slice(0, 6); // each run visits six of the stages
  while (run.length < 6) run.push(run[run.length % Math.max(1, order.length)]); // a short pool repeats itself
  if (run[5] === 7) [run[5], run[0]] = [run[0], run[5]]; // the space map's boss is The Visitor, so it can never be the Fear round
  return run[((round % 6) + 6) % 6];
}

// Every character can dash; the burst of power it shows matches their element.
export const DASH = { cd: 3, dist: 7, t: 0.17, dmg: 30 };

// Mini bosses: a big, slow-to-kill version of a normal enemy that drops health pickups.
// Elite enemies: a normal enemy now and then carries a glowing modifier. hp: health multiplier, speed: speed multiplier.
// 1 Explosive (blows up when it dies), 2 Shielded (a glowing shell soaks the first hits), 3 Swift (fast and fragile), 4 Splitting (two smaller copies burst out when it dies).
export const ELITE = {
  chance: (round) => Math.min(0.3, round === 0 ? 0.04 : 0.07 + 0.04 * round), pcMul: 3, shield: 0.6, splitHp: 0.35, blast: { r: 4.2, d: 0.7, dmg: 30 },
  kinds: [null,
    { id: 1, name: 'Explosive', color: [1, 0.45, 0.1], hp: 1.3, speed: 1.05 },
    { id: 2, name: 'Shielded', color: [0.35, 0.8, 1], hp: 1.2, speed: 1 },
    { id: 3, name: 'Swift', color: [0.95, 1, 0.3], hp: 0.8, speed: 1.55 },
    { id: 4, name: 'Splitting', color: [0.85, 0.4, 1], hp: 1.4, speed: 1 },
  ],
};
export const MINI = { hpMul: 7, hpPerRound: 0.8, dmgMul: 1.25, size: 1.5, drops: 4, heal: 0.2, pcMul: 6 };
