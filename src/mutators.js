// Mutators (Nutty 2026-11-08): optional twists the host switches on in the lobby. They are purely for fun:
// a run with any mutator on counts toward nothing (no unlocks, Daily Challenges, records, PP or achievements).
// The host's choice rides in the lobby info (lb.mu) and in every world snapshot (w.mu), as a bit mask.
export const MUTATORS = [
  { id: 'bighead', bit: 1, name: 'Big Head', desc: 'Every head is huge, yours included. Headshots get a lot easier.' },
  { id: 'jackpot', bit: 2, name: 'Jackpot', desc: 'Every 20th kill bursts into a fountain of gold.' },
  { id: 'pinata', bit: 4, name: 'Piñata', desc: 'Enemies pop in confetti and spill candy that heals you.' },
  { id: 'bottomless', bit: 8, name: 'Bottomless Clip', desc: 'Your guns never run dry. No reloading, ever.' },
  { id: 'necro', bit: 16, name: 'Necromancer', desc: 'The dead rise and fight for you for 10 seconds, then fall for good.' },
  { id: 'bullettime', bit: 64, name: 'Bullet Time', desc: 'Hold aim and the whole world drops into slow motion while you move, shoot and fight at full speed. Hold it in the air to hang there.' },
  { id: 'lowgrav', bit: 32, name: 'Low Gravity', desc: 'Moon jumps, a slower moon-walk, floaty falls, and enemies drift away when they die.' },
];
export const MU_MASK = MUTATORS.reduce((a, m) => a | m.bit, 0);
export const MU_BY_ID = Object.fromEntries(MUTATORS.map((m) => [m.id, m]));
export const BIG_HEAD = 1, JACKPOT = 2, PINATA = 4, BOTTOMLESS = 8, NECRO = 16, LOWGRAV = 32, BULLET_TIME = 64;

// The mutators in play right now on this device (set from each world snapshot, cleared in the lobby).
// Views, rigs and the player read it directly, so nothing has to be passed down to them.
export const MU = { on: 0, bt: 1 }; // bt: the world's clock speed right now (Bullet Time), 1 = normal
export const muOn = (bit) => (MU.on & bit) !== 0;
export const muList = (mask) => MUTATORS.filter((m) => mask & m.bit);

// Tuning.
export const HEAD_SCALE = 2.3; // Big Head: how much bigger every head is
export const JACKPOT_EVERY = 20; // Jackpot: every Nth kill of yours
export const GRAV_K = 0.3; // Low Gravity: share of normal gravity
export const LOWGRAV_WALK = 0.82; // Low Gravity: walking and running speed (Nutty 2026-11-11: slightly slow walk)
export const THRALL_LIFE = 10; // Necromancer: seconds a risen enemy fights for you
export const THRALL_MAX = 16; // most risen at once (keeps the frame rate up)
export const THRALL_RISE = 1.1; // seconds from the death to standing back up
export const BT_SLOW = 0.2; // Bullet Time: how fast the world runs while someone holds aim
export const BT_IN = 9, BT_OUT = 5; // how quickly time bends in and snaps back (per second)
