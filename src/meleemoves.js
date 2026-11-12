// Melee attack motions. Every melee weapon has its own pair of attacks that alternate, and so must every melee weapon added later:
// list it in WEAPON_MOVES with two moves true to how that weapon is really swung (an unlisted one gets forehand, backhand).
// The first attack after a pause is always the first move of the pair.
// A move is a path for the weapon's tip around the shoulders, as keyframes [time 0..1, az, el, reach]:
//   az: sideways angle (negative = the right side, positive = across to the left), el: height angle (up = positive),
//   reach: how far out the hands go (1 = normal; a thrust drives past it).
// Every move has the same rhythm so the hit lands where the eye expects it: wind-up to 0.28, the strike to about 0.55,
// the follow-through to 0.75, and the recovery back to guard at 1. The blade's edge (weapon +x) always leads the strike.
// type: 'sweep' hits across the weapon's whole arc, 'thrust' is a narrow lunge that reaches farther and hits harder,
// 'chop' is a heavy downward blow on a narrower arc that hits harder.

// The new attack motions are switched on for review first (test link / melee viewer) and go live once Nutty approves.
export const MELEE_V2 = true;

const M = (type, k, extra = {}) => ({ type, k, ...extra });

// The reference moves (most weapons pick two of these).
export const MOVES = {
  // Forehand: from the right shoulder, across the body to the left, level.
  fore: M('sweep', [[0, 0, -0.1, 1], [0.28, -1.3, 0.08, 0.95], [0.55, 1.0, -0.06, 1.05], [0.75, 1.35, -0.12, 1], [1, 0.25, -0.15, 0.92]]),
  // Backhand: the return cut, from the left back across to the right.
  back: M('sweep', [[0, 0, -0.1, 1], [0.28, 1.25, 0.12, 0.92], [0.55, -0.95, -0.04, 1.05], [0.75, -1.3, -0.1, 1], [1, -0.25, -0.15, 0.92]]),
  // Diagonal: high over the right shoulder, cutting down and across to the left hip.
  diag: M('sweep', [[0, 0, 0, 1], [0.28, -0.95, 1.05, 0.92], [0.55, 0.75, -0.45, 1.05], [0.75, 1.05, -0.62, 1], [1, 0.25, -0.22, 0.92]]),
  // Rising diagonal backhand: from low on the left, up and across to high on the right.
  rise: M('sweep', [[0, 0, -0.1, 1], [0.28, 0.95, -0.6, 0.92], [0.55, -0.8, 0.72, 1.05], [0.75, -1.05, 0.88, 1], [1, -0.25, 0.1, 0.92]]),
  // Stab: draw the hand back to the hip, drive straight out ahead, pull back.
  stab: M('thrust', [[0, 0, -0.08, 1], [0.28, -0.18, -0.02, 0.55], [0.45, 0, 0.02, 1.45], [0.6, 0, 0, 1.4], [1, 0, -0.1, 0.92]]),
  // Overhead chop: lift it up past the head, bring it straight down in front.
  chop: M('chop', [[0, 0, 0, 1], [0.3, -0.2, 1.5, 0.85], [0.55, 0, -0.55, 1.05], [0.75, 0, -0.72, 1], [1, 0, -0.22, 0.92]]),
  // Uppercut: from low by the right hip up through the target.
  upper: M('sweep', [[0, 0, -0.1, 1], [0.28, -0.45, -0.72, 0.9], [0.55, 0.12, 0.9, 1.05], [0.75, 0.18, 1.02, 1], [1, 0, 0.1, 0.92]]),
  // Fists: a straight jab, then a hook from the right.
  jab: M('thrust', [[0, 0, -0.05, 1], [0.25, -0.1, 0, 0.7], [0.42, 0, 0.04, 1.4], [0.58, 0, 0.02, 1.35], [1, 0, -0.05, 0.95]]),
  hook: M('sweep', [[0, 0, -0.05, 1], [0.28, -1.05, 0.1, 0.85], [0.52, 0.6, 0.05, 1.05], [0.72, 0.85, 0, 1], [1, 0.15, -0.05, 0.95]]),
  // Bullwhip, overhead crack: the arm goes up and back over the shoulder, then snaps forward and down at the target.
  // The cord is simulated (weapons.js ropeMesh), so the sudden stop at the end of the snap is what makes the tip crack.
  lash: M('thrust', [[0, 0, 0, 1], [0.3, -0.35, 1.45, 0.8], [0.47, 0, 0.12, 1.3], [0.6, 0, -0.12, 1.35], [1, 0, -0.1, 0.92]], { reachK: 1.05 }),
  // Bullwhip, sidearm lash: a flat swing out to the side that whips round in front, level with the waist.
  sidelash: M('sweep', [[0, 0, -0.1, 1], [0.3, -1.4, 0.0, 0.85], [0.52, 0.55, -0.08, 1.25], [0.72, 0.9, -0.12, 1.2], [1, 0.2, -0.12, 0.92]]),
  // Fist weapons strike one hand at a time (characters.js pins the other hand at the guard). Right hand first.
  // Claws: a raking slash from high on the striking side, down and across the body. rakeL is its mirror for the left hand.
  rake: M('sweep', [[0, -0.15, 0.0, 0.9], [0.26, -0.85, 0.7, 0.8], [0.5, 0.35, -0.3, 1.25], [0.7, 0.7, -0.5, 1.1], [1, -0.1, -0.05, 0.92]]),
  rakeL: M('sweep', [[0, 0.15, 0.0, 0.9], [0.26, 0.85, 0.7, 0.8], [0.5, -0.35, -0.3, 1.25], [0.7, -0.7, -0.5, 1.1], [1, 0.1, -0.05, 0.92]]),
  // Bare hands: a straight right, then a left hook.
  cross: M('thrust', [[0, -0.1, -0.05, 0.9], [0.24, -0.25, 0, 0.6], [0.42, 0.05, 0.04, 1.45], [0.58, 0.05, 0.02, 1.4], [1, -0.05, -0.05, 0.95]]),
  hookL: M('sweep', [[0, 0.1, -0.05, 0.9], [0.28, 1.05, 0.1, 0.8], [0.52, -0.6, 0.05, 1.1], [0.72, -0.85, 0, 1], [1, -0.1, -0.05, 0.95]]),
  // Chainsaw, second attack: with the bar buried, rip it across from right to left, motor still biting.
  sawrip: M('sweep', [[0, 0, -0.12, 1], [0.25, -0.75, -0.02, 0.95], [0.5, 0.55, -0.18, 1.2], [0.78, 0.85, -0.24, 1.1], [1, 0.1, -0.12, 1]], { buck: 1 }),
  // Chainsaw: braced low with both hands and pushed into the target, the motor bucking while it cuts (no second move).
  saw: M('thrust', [[0, 0, -0.12, 1], [0.25, 0, -0.08, 0.72], [0.45, 0.05, -0.15, 1.3], [0.8, 0.1, -0.2, 1.3], [1, 0, -0.12, 1]], { buck: 1, reachK: 1, dmgK: 1, arcK: 1.6 }),
};

// Which moves each melee weapon uses, in order (they alternate, attack after attack).
// Researched against how each weapon is really used:
export const WEAPON_MOVES = {
  knife: ['diag', 'stab'], // a slashing cut across, then a straight stab
  sword: ['diag', 'rise'], // longsword: the descending diagonal cut, then the rising cut back
  katana: ['diag', 'back'], // kesa-giri (shoulder to hip diagonal), then a level backhand cut
  machete: ['diag', 'back'], // a hacking chop down and across, then the backhand return
  spear: ['stab', 'fore'], // the thrust, then a sweep of the blade across
  axe: ['chop', 'fore'], // a one-handed bearded axe: overhead chop, then a flat cut
  fireaxe: ['chop', 'diag'], // a two-handed felling chop, then a diagonal chop
  warhammer: ['chop', 'fore'], // a crushing overhead blow, then a side swing
  sledge: ['chop', 'fore'], // a demolition slam from overhead, then a heavy side swing
  lucille: ['fore', 'diag'], // a full baseball swing, then a downward clubbing blow
  claws: ['rake', 'rakeL'], // raking slashes: the right arm only, then the left arm only
  bare: ['cross', 'hookL'], // a straight right, then a left hook
  whip: ['lash', 'sidelash'], // the overhead crack, then the sidearm lash
  chainsaw: ['saw', 'sawrip'], // drive the bar in, then rip it across (hold the attack and it keeps going)
};
// Sword-and-shield sets (and any new one-handed sword) slash, then stab past the shield's rim.
export const SHIELD_MOVES = ['fore', 'stab'];
// Any future melee weapon that isn't listed: forehand, then backhand.
export const DEFAULT_MOVES = ['fore', 'back'];

export function movesFor(wp) {
  if (!wp) return DEFAULT_MOVES;
  if (WEAPON_MOVES[wp.id]) return WEAPON_MOVES[wp.id];
  if (wp.shield) return SHIELD_MOVES;
  if (wp.fist) return WEAPON_MOVES.claws;
  return DEFAULT_MOVES;
}
export const moveOf = (wp, i) => { const l = movesFor(wp), n = l.length; return MOVES[l[(((i | 0) % n) + n) % n]]; };

const sm = (x) => x * x * (3 - 2 * x);
// The weapon's place along a move at phase t (0..1): { az, el, r }.
export function samplePose(mv, t, out = { az: 0, el: 0, r: 1 }) {
  const k = mv.k;
  let i = 0;
  while (i < k.length - 2 && t > k[i + 1][0]) i++;
  const a = k[i], b = k[i + 1];
  const u = sm(Math.min(1, Math.max(0, (t - a[0]) / Math.max(1e-4, b[0] - a[0]))));
  out.az = a[1] + (b[1] - a[1]) * u;
  out.el = a[2] + (b[2] - a[2]) * u;
  out.r = a[3] + (b[3] - a[3]) * u;
  if (mv.buck && t > 0.3 && t < 0.85) { out.el += Math.sin(t * 160) * 0.025; out.az += Math.sin(t * 117) * 0.02; } // the saw bucks as it bites
  return out;
}
// The way the strike travels (in the same az/el terms), used to point the edge forward through the cut.
export function strikeDir(mv) {
  if (mv._dir) return mv._dir;
  const k = mv.k, a = k[1], b = k[2];
  mv._dir = { daz: b[1] - a[1], del: b[2] - a[2] };
  return mv._dir;
}
// How a move changes the hit itself.
export function hitShape(mv, wp) {
  if (mv.type === 'thrust') return { arc: Math.min(wp.arc, 40) * (mv.arcK || 1), reach: mv.reachK || 1.2, dmg: mv.dmgK || 1.15 };
  if (mv.type === 'chop') return { arc: wp.arc * 0.6, reach: 1, dmg: 1.15 };
  return { arc: wp.arc, reach: 1, dmg: 1 };
}
