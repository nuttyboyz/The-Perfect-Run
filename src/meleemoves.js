// Melee attack motions. Every melee weapon has its own attacks that alternate (a pair; the chainsaw has three), and so must every melee weapon added later:
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
/* Full-body attacks (Nutty 2026-11-24, after Chivalry 2 and Dying Light): every cut is a real swing, not an arm waving a blade.
   A V3 move adds:
   - a 5th key column, tilt: the wrist. Positive lays the blade back behind the hands (cocked over the shoulder in the wind-up),
     negative lets the tip whip out ahead of them as it cuts through.
   - b: body keys [t, yaw, lean, bend, step]: the torso coils away in the wind-up (yaw, + = turned to the left), leans back to load
     an overhead and crunches forward into the blow (lean, + = forward), bends sideways (bend), and a foot steps in under the strike
     (step: + = left foot forward, - = right foot forward). The hips lead the shoulders (characters.js samples them a little ahead),
     so the swing travels up the body like a real one: legs, hips, chest, arms, then the wrist.
   - sk: which two keys are the strike (the edge leads from the first to the second); hit: the phase the blow lands.
   Keys are joined with smooth (monotone cubic) curves so the weapon never stops dead between them. */
const V3 = (type, k, b, extra = {}) => ({ type, k, b, v3: 1, sk: [1, 3], hit: 0.4, ...extra });

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
  // Fencing lunge: the guard hand draws back a little, then the arm snaps straight and the whole body drives in behind the point; a quick recovery to guard.
  /* Shield thrust (Nutty 2026-11-19): the fencing lunge done from behind a raised shield. A little shorter, so the fist never leaves the handle. */
  sthrust: M('thrust', [[0, 0, 0.0, 0.95], [0.22, -0.08, 0.02, 0.6], [0.42, 0, 0.03, 1.36], [0.6, 0, 0.02, 1.32], [1, 0, 0, 0.95]], { lunge: 1, reachK: 1.3, dmgK: 1.25, arcK: 0.6 }),
  lunge: M('thrust', [[0, 0, 0.02, 1], [0.22, -0.1, 0.05, 0.62], [0.42, 0, 0.06, 1.62], [0.6, 0, 0.04, 1.58], [1, 0, 0, 0.95]], { lunge: 1, reachK: 1.35, dmgK: 1.25, arcK: 0.6 }),
  // Fencing cut: a fast diagonal slash from the high right down to the left, wrist-led.
  fcut: M('sweep', [[0, 0, 0.02, 1], [0.24, -0.8, 0.9, 0.95], [0.5, 0.7, -0.4, 1.12], [0.72, 0.95, -0.55, 1.02], [1, 0.15, -0.05, 0.95]]),
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
  // Chainsaw, diagonal slash: lifted over the right shoulder and dragged down across the body to the left hip, motor biting all the way.
  sawdiag: M('sweep', [[0, 0, -0.12, 1], [0.27, -0.8, 0.85, 0.92], [0.52, 0.6, -0.4, 1.2], [0.78, 0.9, -0.55, 1.1], [1, 0.1, -0.12, 1]], { buck: 1 }),
  // Chainsaw: braced low with both hands and pushed into the target, the motor bucking while it cuts (no second move).
  saw: M('thrust', [[0, 0, -0.12, 1], [0.25, 0, -0.08, 0.72], [0.45, 0.05, -0.15, 1.3], [0.8, 0.1, -0.2, 1.3], [1, 0, -0.12, 1]], { buck: 1, reachK: 1, dmgK: 1, arcK: 1.6 }),
};

// ---- V3: the Chivalry-style set: two diagonal slashes (one from each shoulder), the overhead, and the thrust with a step. ----
// Phase rhythm: wind-up to 0.22, the cut through the target 0.32-0.44 (the hit at 0.4), follow-through to 0.62, back to guard at 1.
Object.assign(MOVES, {
  // Forehand diagonal: blade cocked over the right shoulder, the body coiled right; hips turn, the left foot steps in, and it cuts
  // down through the target to the left hip, the torso following round.
  slashR: V3('sweep', [[0, -0.2, 0.05, 0.95, 0.25], [0.22, -1.2, 0.98, 0.78, 1.15], [0.33, -0.45, 0.6, 0.98, 0.4], [0.44, 0.5, -0.2, 1.1, -0.3], [0.62, 1.15, -0.68, 1.0, -0.45], [1, 0.0, -0.08, 0.95, 0.2]],
    [[0, 0, 0, 0, 0], [0.22, -0.95, -0.14, 0.16, 0.1], [0.36, -0.15, 0.16, 0.02, 0.8], [0.46, 0.5, 0.32, -0.14, 1.15], [0.64, 0.85, 0.36, -0.18, 1], [1, 0, 0.02, 0, 0]]),
  // Backhand diagonal: the return cut from over the left shoulder down to the right hip; the right foot steps.
  slashL: V3('sweep', [[0, -0.2, 0.05, 0.95, 0.25], [0.22, 0.95, 0.95, 0.74, 1.15], [0.33, 0.35, 0.55, 0.98, 0.4], [0.44, -0.55, -0.2, 1.1, -0.3], [0.62, -1.15, -0.62, 1.0, -0.45], [1, -0.1, -0.08, 0.95, 0.2]],
    [[0, 0, 0, 0, 0], [0.22, 0.75, -0.12, -0.14, -0.1], [0.36, 0.08, 0.16, 0, -0.8], [0.46, -0.58, 0.3, 0.14, -1.15], [0.64, -0.85, 0.34, 0.18, -1], [1, 0, 0.02, 0, 0]]),
  // Overhead: raised high behind the head with the back arched, then brought straight down with the whole body crunching in behind it.
  overhead: V3('chop', [[0, -0.1, 0.05, 0.95, 0.25], [0.24, -0.15, 1.72, 0.7, 1.05], [0.34, -0.06, 0.95, 0.98, 0.3], [0.45, 0.02, -0.3, 1.12, -0.3], [0.64, 0.05, -0.82, 1.0, -0.4], [1, -0.08, -0.08, 0.95, 0.2]],
    [[0, 0, 0, 0, 0], [0.24, -0.2, -0.32, 0.04, 0.15], [0.36, -0.05, 0.1, 0, 0.8], [0.47, 0.04, 0.5, 0, 1.15], [0.66, 0.05, 0.55, 0, 1], [1, 0, 0.02, 0, 0]], { hit: 0.41 }),
  // Thrust: the right shoulder draws back with the point at the target, then the hips square up, the right foot drives forward and the
  // arm spears straight out; a quick pull back to guard.
  thrust: V3('thrust', [[0, -0.12, 0.02, 0.95, 0], [0.24, -0.3, 0.04, 0.5, 0], [0.34, -0.12, 0.05, 1.0, 0], [0.44, 0, 0.04, 1.5, 0], [0.6, 0, 0.03, 1.45, 0], [1, -0.1, 0, 0.95, 0]],
    [[0, 0, 0, 0, 0], [0.24, -0.62, -0.06, 0.05, 0.1], [0.36, -0.1, 0.12, 0, -0.6], [0.46, 0.3, 0.3, -0.04, -1], [0.62, 0.3, 0.3, -0.04, -1], [1, 0, 0.02, 0, 0]], { sk: [1, 3], reachK: 1.25, dmgK: 1.2 }),
});
// ---- First person (Nutty 2026-11-24: "make the blade swings in first person view look like swings from Dying Light 1 + 2"). ----
// Seen through the eyes a swing is authored on the screen, not squeezed down from the third-person arc: the hand is drawn back out to
// the edge of the view with the blade laid back out of sight, then the whole length of the blade is dragged across the middle of the
// screen and out of the opposite bottom corner, and it comes back to the ready under the view. Keys: [phase, hand x (right), y (up),
// z (ahead) from the eye in metres, blade direction x, y, z]. fe: the way the edge faces through the cut. cam: the head going with
// it, [phase, yaw (left +), pitch (up +), roll (anticlockwise +)] in radians for a middling weapon (heavier ones move the head more).
const FPK = {
  slashR: { fe: [-0.75, -0.65, 0.1],
    fp: [[0, 0.25, -0.34, 0.42, -0.2, 0.8, 0.56], [0.12, 0.34, -0.2, 0.38, 0.2, 0.93, 0.3], [0.22, 0.4, -0.04, 0.34, 0.55, 0.75, -0.36], [0.3, 0.34, -0.02, 0.42, 0.1, 0.95, 0.3],
      [0.37, 0.12, -0.1, 0.46, -0.5, 0.78, 0.38], [0.44, -0.1, -0.15, 0.45, -0.9, 0.22, 0.38], [0.52, -0.24, -0.21, 0.4, -0.88, -0.32, 0.34], [0.64, -0.3, -0.27, 0.36, -0.75, -0.6, 0.28],
      [0.84, 0.04, -0.42, 0.38, -0.4, 0.3, 0.86], [1, 0.25, -0.34, 0.42, -0.2, 0.8, 0.56]],
    cam: [[0, 0, 0, 0], [0.2, -0.04, 0.014, -0.035], [0.31, -0.02, 0.01, -0.015], [0.44, 0.06, -0.032, 0.065], [0.6, 0.05, -0.036, 0.055], [1, 0, 0, 0]] },
  slashL: { fe: [0.75, -0.65, 0.1],
    fp: [[0, 0.25, -0.34, 0.42, -0.2, 0.8, 0.56], [0.12, 0.1, -0.24, 0.4, -0.3, 0.9, 0.3], [0.22, -0.16, -0.06, 0.38, -0.62, 0.72, -0.3], [0.3, -0.12, -0.03, 0.44, -0.2, 0.93, 0.3],
      [0.37, 0.04, -0.1, 0.47, 0.45, 0.8, 0.4], [0.44, 0.24, -0.15, 0.45, 0.9, 0.22, 0.38], [0.52, 0.38, -0.21, 0.4, 0.88, -0.32, 0.34], [0.64, 0.44, -0.27, 0.36, 0.75, -0.58, 0.3],
      [0.84, 0.34, -0.4, 0.38, 0.2, 0.3, 0.9], [1, 0.25, -0.34, 0.42, -0.2, 0.8, 0.56]],
    cam: [[0, 0, 0, 0], [0.2, 0.04, 0.014, 0.035], [0.31, 0.02, 0.01, 0.015], [0.44, -0.06, -0.032, -0.065], [0.6, -0.05, -0.036, -0.055], [1, 0, 0, 0]] },
  overhead: { fe: [0, -1, 0.2],
    fp: [[0, 0.25, -0.34, 0.42, -0.2, 0.8, 0.56], [0.14, 0.24, -0.1, 0.36, 0, 0.95, 0.3], [0.24, 0.18, 0.12, 0.3, 0.08, 0.7, -0.7], [0.32, 0.15, 0.14, 0.42, 0, 0.97, 0.25],
      [0.38, 0.1, 0.02, 0.48, -0.05, 0.8, 0.6], [0.45, 0.06, -0.16, 0.5, -0.08, 0.2, 0.97], [0.54, 0.05, -0.25, 0.46, -0.08, -0.4, 0.9], [0.66, 0.06, -0.31, 0.42, -0.05, -0.6, 0.8],
      [0.85, 0.18, -0.4, 0.4, -0.1, 0.3, 0.95], [1, 0.25, -0.34, 0.42, -0.2, 0.8, 0.56]],
    cam: [[0, 0, 0, 0], [0.22, 0, 0.045, 0], [0.34, 0, 0.02, 0], [0.46, 0, -0.075, 0.012], [0.62, 0, -0.065, 0.01], [1, 0, 0, 0]] },
  thrust: { fe: [-0.3, -0.95, 0],
    fp: [[0, 0.25, -0.34, 0.42, -0.2, 0.8, 0.56], [0.14, 0.28, -0.26, 0.3, -0.15, 0.25, 0.95], [0.24, 0.32, -0.2, 0.16, -0.22, 0.08, 0.97], [0.34, 0.2, -0.2, 0.44, -0.14, 0.03, 0.99],
      [0.44, 0.07, -0.17, 0.72, -0.06, 0, 1], [0.6, 0.07, -0.18, 0.69, -0.06, 0, 1], [0.82, 0.22, -0.3, 0.46, -0.2, 0.35, 0.9], [1, 0.25, -0.34, 0.42, -0.2, 0.8, 0.56]],
    cam: [[0, 0, 0, 0], [0.24, -0.022, 0.004, -0.016], [0.44, 0.016, -0.012, 0.01], [0.6, 0.012, -0.01, 0.008], [1, 0, 0, 0]] },
};
for (const k in FPK) Object.assign(MOVES[k], FPK[k]);
Object.assign(MOVES.lunge, { fp: FPK.thrust.fp, fe: FPK.thrust.fe, cam: FPK.thrust.cam });
/* The rest of the wall (Nutty 2026-11-25: claws, fists, whip and chainsaw were still arm-only). Each gets its own body: the hips load and turn, the weight
   steps in under the blow and the feet stay planted (same body keys as a V3 move: [t, yaw, lean, bend, step]); the whip is also seen through the first-person
   swings. */
const BODY2 = {
  rake: [[0, 0, 0, 0, 0], [0.26, -0.7, -0.1, 0.1, 0.1], [0.4, -0.1, 0.14, 0, 0.7], [0.5, 0.45, 0.28, -0.1, 1], [0.7, 0.7, 0.3, -0.14, 0.9], [1, 0, 0.02, 0, 0]],
  rakeL: [[0, 0, 0, 0, 0], [0.26, 0.7, -0.1, -0.1, -0.1], [0.4, 0.1, 0.14, 0, -0.7], [0.5, -0.45, 0.28, 0.1, -1], [0.7, -0.7, 0.3, 0.14, -0.9], [1, 0, 0.02, 0, 0]],
  cross: [[0, 0, 0, 0, 0], [0.24, -0.45, -0.04, 0.04, 0.1], [0.34, -0.05, 0.08, 0, 0.6], [0.42, 0.55, 0.2, -0.04, 0.9], [0.58, 0.55, 0.2, -0.04, 0.85], [1, 0, 0.02, 0, 0]],
  hookL: [[0, 0, 0, 0, 0], [0.28, 0.6, -0.04, -0.08, -0.1], [0.4, 0.1, 0.08, 0, -0.3], [0.52, -0.65, 0.16, 0.1, -0.55], [0.72, -0.8, 0.16, 0.12, -0.5], [1, 0, 0.02, 0, 0]],
  lash: [[0, 0, 0, 0, 0], [0.3, -0.3, -0.26, 0.04, 0.1], [0.4, -0.08, 0.08, 0, 0.7], [0.47, 0.1, 0.36, 0, 1], [0.6, 0.12, 0.4, 0, 0.9], [1, 0, 0.02, 0, 0]],
  sidelash: [[0, 0, 0, 0, 0], [0.3, -0.85, -0.08, 0.1, 0.1], [0.42, -0.2, 0.1, 0, 0.7], [0.52, 0.5, 0.2, -0.1, 1], [0.72, 0.8, 0.22, -0.12, 0.9], [1, 0, 0.02, 0, 0]],
  saw: [[0, 0, 0, 0, 0], [0.25, -0.2, -0.08, 0, 0.1], [0.45, 0.1, 0.26, 0, 0.9], [0.8, 0.12, 0.3, 0, 0.9], [1, 0, 0.02, 0, 0]],
  sawdiag: [[0, 0, 0, 0, 0], [0.27, -0.7, -0.12, 0.12, 0.1], [0.4, -0.1, 0.14, 0, 0.7], [0.52, 0.45, 0.3, -0.12, 1], [0.78, 0.7, 0.32, -0.16, 0.95], [1, 0, 0.02, 0, 0]],
  sawrip: [[0, 0, 0, 0, 0], [0.25, -0.6, -0.04, 0.06, 0.1], [0.5, 0.4, 0.2, -0.06, 0.9], [0.78, 0.7, 0.22, -0.08, 0.9], [1, 0, 0.02, 0, 0]],
};
for (const k in BODY2) MOVES[k].b = BODY2[k];
const fpOf = (src, remap) => ({ fe: FPK[src].fe, fp: FPK[src].fp.map((r) => [remap ? remap(r[0]) : r[0], ...r.slice(1)]), cam: FPK[src].cam.map((r) => [remap ? remap(r[0]) : r[0], ...r.slice(1)]) });
Object.assign(MOVES.lash, fpOf('overhead')); Object.assign(MOVES.sidelash, fpOf('slashR')); /* (the chainsaw keeps its own first-person view: its body is too big to be drawn back across the screen like a blade) */ /* the fencing lunge is seen through the same first-person thrust */
export function sampleFP(mv, t, out = {}) { const k = mv.fp; out.x = mono(k, 1, t); out.y = mono(k, 2, t); out.z = mono(k, 3, t); out.bx = mono(k, 4, t); out.by = mono(k, 5, t); out.bz = mono(k, 6, t); return out; }
export function sampleCam(mv, t, out = {}) { const k = mv.cam; if (!k) { out.yaw = out.pitch = out.roll = 0; return out; } out.yaw = mono(k, 1, t); out.pitch = mono(k, 2, t); out.roll = mono(k, 3, t); return out; }
// Which moves each melee weapon uses, in order (they alternate, attack after attack).
// Researched against how each weapon is really used:
export const WEAPON_MOVES = {
  /* (Nutty 2026-11-24: no more flat horizontal slashes. Chivalry 2's three attacks: the slash, alternating from each shoulder, the overhead
     and the stab.) */
  knife: ['slashR', 'thrust', 'slashL'], // a slashing cut, a stab, the return cut
  sword: ['slashR', 'slashL', 'overhead'], // longsword: diagonal from the right, diagonal back from the left, then the overhead
  katana: ['slashR', 'slashL', 'overhead'], // kesa-giri, gyaku kesa-giri, then the overhead cut (shomen)
  machete: ['slashR', 'slashL', 'overhead'], // hacking diagonals, then a chop from above
  spear: ['thrust', 'thrust', 'slashR'], // two thrusts, then the blade swung down across
  axe: ['overhead', 'slashR', 'slashL'], // a one-handed axe: overhead chop, then hacks from each side
  fireaxe: ['overhead', 'slashR'], // a two-handed felling chop, then a diagonal chop
  warhammer: ['overhead', 'slashR'], // a crushing overhead blow, then a diagonal smash
  sledge: ['overhead', 'slashR'], // a demolition slam from overhead, then a heavy diagonal swing
  lucille: ['slashR', 'overhead', 'slashL'], // a bat swung down from over the shoulder, a clubbing overhead, then the backswing
  claws: ['rake', 'rakeL'], // raking slashes: the right arm only, then the left arm only
  bare: ['cross', 'hookL'], // a straight right, then a left hook
  whip: ['lash', 'sidelash'], // the overhead crack, then the sidearm lash
  fencing: ['lunge', 'slashR'], // the classic lunge, then a diagonal slash
  chainsaw: ['saw', 'sawdiag', 'sawrip'], // three attacks in turn: drive the bar straight in, a diagonal slash down, then a level rip across (hold the attack and it keeps going)
};
// Sword-and-shield sets (and any new one-handed sword) slash, then stab past the shield's rim.
/* Nutty 2026-11-19: the stab belongs to the raised shield only. Shield down: a forehand cut, then a backhand cut. Shield up (blocking): the
   attack is always the straight thrust past the shield's rim (player.js melee picks move 2). */
export const SHIELD_MOVES = ['slashR', 'slashL', 'sthrust'];
// Any future melee weapon that isn't listed: forehand, then backhand.
export const DEFAULT_MOVES = ['slashR', 'slashL'];

for (const k in MOVES) MOVES[k].nm = k; /* (each move knows its own name: characters.js picks the actor's clip by it) */
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
// Monotone cubic through the keys (Fritsch-Carlson): smooth, never overshooting a key, and only stopping where the keys say so.
function mono(k, c, t) {
  const n = k.length;
  if (t <= k[0][0]) return k[0][c];
  if (t >= k[n - 1][0]) return k[n - 1][c];
  let i = 0;
  while (i < n - 2 && t > k[i + 1][0]) i++;
  const sl = (j) => (k[j + 1][c] - k[j][c]) / Math.max(1e-4, k[j + 1][0] - k[j][0]);
  const tan = (j) => {
    if (j === 0 || j === n - 1) return 0; // starts and ends at rest
    const a = sl(j - 1), b = sl(j);
    if (a * b <= 0) return 0; // a turning point: the weapon (or body) changes direction there
    const w1 = 2 * (k[j + 1][0] - k[j][0]) + (k[j][0] - k[j - 1][0]), w2 = (k[j + 1][0] - k[j][0]) + 2 * (k[j][0] - k[j - 1][0]);
    return (w1 + w2) / (w1 / a + w2 / b);
  };
  const h = k[i + 1][0] - k[i][0], u = Math.min(1, Math.max(0, (t - k[i][0]) / Math.max(1e-4, h))), u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * k[i][c] + (u3 - 2 * u2 + u) * h * tan(i) + (-2 * u3 + 3 * u2) * k[i + 1][c] + (u3 - u2) * h * tan(i + 1);
}
// The body along a V3 move at phase t: { yaw, lean, bend, step } (zeros for older moves).
export function sampleBody(mv, t, out = { yaw: 0, lean: 0, bend: 0, step: 0 }) {
  if (!mv || !mv.b) { out.yaw = out.lean = out.bend = out.step = 0; return out; }
  out.yaw = mono(mv.b, 1, t); out.lean = mono(mv.b, 2, t); out.bend = mono(mv.b, 3, t); out.step = mono(mv.b, 4, t);
  return out;
}
export function samplePose(mv, t, out = { az: 0, el: 0, r: 1 }) {
  const k = mv.k;
  if (mv.v3) { out.az = mono(k, 1, t); out.el = mono(k, 2, t); out.r = mono(k, 3, t); out.tilt = mono(k, 4, t); return out; }
  out.tilt = 0;
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
  const k = mv.k, sk = mv.sk || [1, 2], a = k[sk[0]], b = k[sk[1]];
  mv._dir = { daz: b[1] - a[1], del: b[2] - a[2] };
  return mv._dir;
}
// How a move changes the hit itself.
export function hitShape(mv, wp) {
  if (mv.type === 'thrust') return { arc: Math.min(wp.arc, 40) * (mv.arcK || 1), reach: mv.reachK || 1.2, dmg: mv.dmgK || 1.15 };
  if (mv.type === 'chop') return { arc: wp.arc * 0.6, reach: 1, dmg: 1.15 };
  return { arc: wp.arc, reach: 1, dmg: 1 };
}
