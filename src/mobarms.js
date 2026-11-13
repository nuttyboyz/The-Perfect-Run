// Enemy hand weapons (Nutty 2026-11-13): every one built here from scratch to suit the body that carries it. Nothing comes from the
// Weapon Wall. Real proportions: tapered, edged blades (a diamond section, not a slab), guards, wrapped grips, pommels, forged axe heads.
// Each builder returns parts for the mob's hand: { metal, soft, rust } geometries, vertex-coloured, the weapon standing along +Y with the
// grip at the origin and its cutting edge toward +Z. mobrig.js tips it forward in the fist.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const tint = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
const flat = (g) => { g = g.index ? g.toNonIndexed() : g; if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); if (!g.attributes.normal) g.computeVertexNormals(); return g; };
const cyl = (r0, r1, h, seg = 10) => new THREE.CylinderGeometry(r1, r0, h, seg);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const ball = (r, sx = 1, sy = 1, sz = 1) => new THREE.SphereGeometry(r, 12, 9).scale(sx, sy, sz);
// colours
const STEEL = 0xdfe3ea, DARKSTEEL = 0x858a96, IRON = 0x565a62, BLACK = 0x26272b, BRASS = 0xb08a3a, RUST = 0x7a4a2e, OLDSTEEL = 0x8c8a84;
const LEATHER = 0x4a2e1c, DARKLEATHER = 0x22180f, WOOD = 0x7a5634, ASH = 0xa88a5c, DARKWOOD = 0x3c2a1c, RED = 0x9a1c14, CORD = 0x1c1c22, BONE = 0xd8cca4, YELLOW = 0xb89a2a;

// A blade: rings of a diamond section lofted from the guard to the point. Width runs along X (the edge is +X), thickness along Z.
// curve: how far the point sweeps back (toward the spine). single: one edge, the point rides up to the spine. belly: extra width mid-blade.
function blade({ len, w0, w1 = w0 * 0.8, tip = w0 * 1.6, curve = 0, single = false, th = 0.011, y0 = 0.09, belly = 0, flare = 0 }) {
  const body = len - tip, rings = [], NB = 9, NT = 5;
  const ring = (u, w, k) => { const y = y0 + len * u, cx = -curve * u * u, t = th * k; const xl = single ? cx - w0 / 2 : cx - w / 2, xr = xl + w, xm = single ? xl + w * 0.3 : (xl + xr) / 2;
    rings.push([[xl, y, 0], [xm, y, t / 2], [xr, y, 0], [xm, y, -t / 2]]); };
  for (let i = 0; i <= NB; i++) { const t = i / NB, u = t * body / len; ring(u, w0 + (w1 - w0) * t + belly * Math.sin(Math.PI * t) + flare * t * t, 1 - 0.25 * t); }
  for (let i = 1; i <= NT; i++) { const v = i / NT, u = (body + tip * v) / len, k = Math.max(0.03, 1 - Math.pow(v, single ? 2.2 : 1.5)); ring(u, (w1 + flare) * k, 0.75 * (0.25 + 0.75 * k)); }
  const P = [];
  const quad = (a, b, c, d) => { P.push(...a, ...b, ...c, ...a, ...c, ...d); };
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < 4; k++) quad(rings[i][k], rings[i][(k + 1) % 4], rings[i + 1][(k + 1) % 4], rings[i + 1][k]);
  const r0 = rings[0]; quad(r0[3], r0[2], r0[1], r0[0]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3)); g.computeVertexNormals();
  return flat(g);
}
// A forged axe head: thick at the eye (x = 0), thinning to the edge. up / down: how far the edge reaches above and below the eye's centre
// (a long `down` is a beard). bulge rounds the edge.
function axeHead({ L, h0, up, down, t0 = 0.045, bulge = 0.03, y = 0 }) {
  const NA = 6, NB = 8, pt = (a, b, sz) => { const e = Math.pow(a, 1.4), lo = -h0 / 2 + (-down + h0 / 2) * e, hi = h0 / 2 + (up - h0 / 2) * e, f = 2 * b - 1;
    return [a * (L + bulge * (1 - f * f)), y + lo + (hi - lo) * b, sz * t0 * 0.5 * Math.pow(1 - a, 0.75)]; };
  const P = [], quad = (a, b, c, d) => { P.push(...a, ...b, ...c, ...a, ...c, ...d); };
  for (let i = 0; i < NA; i++) for (let j = 0; j < NB; j++) { const a0 = i / NA, a1 = (i + 1) / NA, b0 = j / NB, b1 = (j + 1) / NB;
    quad(pt(a0, b0, 1), pt(a1, b0, 1), pt(a1, b1, 1), pt(a0, b1, 1)); quad(pt(a0, b1, -1), pt(a1, b1, -1), pt(a1, b0, -1), pt(a0, b0, -1)); }
  for (let i = 0; i < NA; i++) { const a0 = i / NA, a1 = (i + 1) / NA; quad(pt(a0, 0, -1), pt(a1, 0, -1), pt(a1, 0, 1), pt(a0, 0, 1)); quad(pt(a0, 1, 1), pt(a1, 1, 1), pt(a1, 1, -1), pt(a0, 1, -1)); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3)); g.computeVertexNormals();
  return flat(g);
}
// hilt pieces
const grip = (y0, y1, r = 0.017, col = LEATHER) => { const out = [tint(cyl(r, r * 0.92, y1 - y0, 8).translate(0, (y0 + y1) / 2, 0), col)]; return out; };
const wraps = (y0, y1, n, r = 0.0185, col = DARKLEATHER) => { const o = []; for (let i = 0; i < n; i++) o.push(tint(cyl(r, r, 0.007, 8).translate(0, y0 + (y1 - y0) * (i + 0.5) / n, 0), col)); return o; };
const cross = (y, w, col = DARKSTEEL, r = 0.011, droop = 0) => [tint(cyl(r, r, w, 6).rotateZ(Math.PI / 2).translate(0, y, 0), col), tint(ball(r * 1.5).translate(w / 2, y - droop, 0), col), tint(ball(r * 1.5).translate(-w / 2, y - droop, 0), col), tint(box(0.03, 0.024, 0.03).translate(0, y, 0), col)];
const wheel = (y, r = 0.026, col = DARKSTEEL) => tint(cyl(r, r, 0.02, 12).rotateX(Math.PI / 2).translate(0, y, 0), col);
const haft = (y0, y1, r = 0.018, col = ASH, seg = 8) => tint(cyl(r * 1.08, r, y1 - y0, seg).translate(0, (y0 + y1) / 2, 0), col);
const spike = (r, h, seg = 4) => new THREE.ConeGeometry(r, h, seg);
const out = (metal, soft, rust) => ({ metal, soft, rust });

export const MOB_ARM_GEO = {
  // ---------- swords: the smaller, human-sized enemies ----------
  // knightly arming sword: straight double-edged blade, plain cross, leather grip, wheel pommel
  arming: () => out([blade({ len: 0.8, w0: 0.052, w1: 0.036, tip: 0.1 }), ...cross(0.085, 0.2), wheel(-0.1)].map((g, i) => (i ? g : tint(g, STEEL))), [...grip(-0.08, 0.075), ...wraps(-0.07, 0.07, 5)]),
  // falchion: a broad single-edged chopper that widens toward a clipped point
  falchion: () => out([tint(blade({ len: 0.66, w0: 0.044, w1: 0.07, tip: 0.13, single: true, curve: 0.02 }), STEEL), ...cross(0.085, 0.15, IRON), tint(ball(0.024).translate(0, -0.095, 0), IRON)], grip(-0.08, 0.075, 0.017, DARKLEATHER)),
  // short stabbing sword with a leaf-shaped blade
  shortsword: () => out([tint(blade({ len: 0.52, w0: 0.05, w1: 0.046, tip: 0.13, belly: 0.014 }), STEEL), tint(box(0.1, 0.022, 0.034).translate(0, 0.085, 0), BRASS), tint(ball(0.027, 1, 0.8, 1).translate(0, -0.095, 0), BRASS)], [...grip(-0.075, 0.075, 0.018, BONE), ...wraps(-0.06, 0.06, 3, 0.0195, DARKLEATHER)]),
  // sabre: long curved blade, a knuckle bow over the hand
  sabre: () => out([tint(blade({ len: 0.82, w0: 0.034, w1: 0.028, tip: 0.16, single: true, curve: 0.11 }), STEEL), tint(new THREE.TorusGeometry(0.085, 0.006, 6, 14, Math.PI).rotateZ(-Math.PI / 2).translate(0.012, 0.0, 0), BRASS), tint(box(0.07, 0.014, 0.03).translate(0.012, 0.085, 0), BRASS), tint(ball(0.02).translate(0, -0.09, 0), BRASS)], [...grip(-0.08, 0.08, 0.016, BLACK), ...wraps(-0.07, 0.07, 7, 0.0172, BRASS)]),
  // cutlass: short, heavy and curved, with a broad guard plate
  cutlass: () => out([tint(blade({ len: 0.62, w0: 0.048, w1: 0.05, tip: 0.15, single: true, curve: 0.06 }), OLDSTEEL), tint(new THREE.TorusGeometry(0.085, 0.007, 6, 14, Math.PI).scale(1, 1, 3.2).rotateZ(-Math.PI / 2).translate(0.012, 0.0, 0), IRON), tint(cyl(0.04, 0.04, 0.008, 12).translate(0.006, 0.086, 0), IRON), tint(ball(0.021).translate(0, -0.09, 0), IRON)], grip(-0.08, 0.08, 0.017, DARKWOOD)),
  // katana: a slim, gently curved single-edged blade, round guard, long cord-wrapped grip
  katana: () => out([tint(blade({ len: 0.74, w0: 0.03, w1: 0.025, tip: 0.07, single: true, curve: 0.055, th: 0.009, y0: 0.1 }), STEEL), tint(cyl(0.02, 0.02, 0.022, 8).translate(0, 0.108, 0), BRASS), tint(cyl(0.042, 0.042, 0.007, 14).translate(0, 0.094, 0), BLACK), tint(cyl(0.019, 0.019, 0.016, 8).translate(0, -0.165, 0), BLACK)], [...grip(-0.16, 0.09, 0.0165, CORD), ...wraps(-0.15, 0.08, 9, 0.0178, 0x3c3c48)]),
  // the ninja's straight short sword with a square guard
  ninjato: () => out([tint(blade({ len: 0.52, w0: 0.03, w1: 0.028, tip: 0.07, single: true, th: 0.009, y0: 0.1 }), STEEL), tint(box(0.07, 0.007, 0.07).translate(0, 0.094, 0), BLACK), tint(cyl(0.019, 0.019, 0.016, 8).translate(0, -0.125, 0), BLACK)], [...grip(-0.12, 0.09, 0.0165, CORD), ...wraps(-0.11, 0.08, 7, 0.0178, 0x3c3c48)]),
  // raider's scimitar: crudely forged, deeply curved, widening toward the point, wrapped in hide
  scimitar: () => out([tint(blade({ len: 0.62, w0: 0.036, w1: 0.06, tip: 0.17, single: true, curve: 0.13 }), OLDSTEEL), tint(box(0.11, 0.018, 0.028).translate(0.01, 0.085, 0), IRON), tint(spike(0.02, 0.05, 6).rotateZ(Math.PI).translate(0, -0.105, 0), IRON)], [...grip(-0.08, 0.075, 0.018, LEATHER), ...wraps(-0.07, 0.07, 4, 0.02, DARKLEATHER)]),
  // ---------- the brutes: long swords and axes ----------
  // longsword: hand-and-a-half grip, long tapering blade
  longsword: () => out([tint(blade({ len: 1.02, w0: 0.054, w1: 0.034, tip: 0.12, th: 0.012 }), STEEL), ...cross(0.085, 0.26, DARKSTEEL, 0.012), tint(ball(0.028, 1, 1.25, 1).translate(0, -0.2, 0), DARKSTEEL)], [...grip(-0.18, 0.075, 0.018), ...wraps(-0.17, 0.07, 8)]),
  // two-handed great sword: a leather-bound ricasso above the cross, two parrying lugs, a very long blade
  greatsword: () => out([tint(blade({ len: 1.2, w0: 0.062, w1: 0.046, tip: 0.14, th: 0.014, y0: 0.24 }), STEEL), tint(box(0.04, 0.16, 0.012).translate(0, 0.17, 0), DARKSTEEL), tint(spike(0.016, 0.07, 4).rotateZ(-Math.PI / 2).translate(0.06, 0.245, 0), STEEL), tint(spike(0.016, 0.07, 4).rotateZ(Math.PI / 2).translate(-0.06, 0.245, 0), STEEL), ...cross(0.085, 0.36, DARKSTEEL, 0.013, 0.012), tint(ball(0.03, 1, 1.3, 1).translate(0, -0.26, 0), DARKSTEEL)], [...grip(-0.24, 0.075, 0.019, DARKLEATHER), ...wraps(-0.23, 0.07, 9, 0.0205, LEATHER)]),
  // one-handed bearded war axe
  waraxe: () => out([tint(axeHead({ L: 0.15, h0: 0.06, up: 0.07, down: 0.15, y: 0.5 }), STEEL), tint(box(0.036, 0.075, 0.04).translate(0, 0.5, 0), DARKSTEEL), tint(box(0.008, 0.2, 0.02).translate(0.02, 0.36, 0), DARKSTEEL)], [haft(-0.2, 0.56, 0.017), ...wraps(-0.08, 0.08, 5, 0.0195, LEATHER)]),
  // double-bitted battle axe
  battleaxe: () => out([tint(axeHead({ L: 0.19, h0: 0.07, up: 0.15, down: 0.15, y: 0.72 }), STEEL), tint(axeHead({ L: 0.19, h0: 0.07, up: 0.15, down: 0.15, y: 0.72 }).rotateY(Math.PI), STEEL), tint(box(0.04, 0.09, 0.046).translate(0, 0.72, 0), DARKSTEEL), tint(spike(0.016, 0.1, 4).translate(0, 0.84, 0), DARKSTEEL), tint(cyl(0.024, 0.024, 0.03, 8).translate(0, -0.3, 0), DARKSTEEL)], [haft(-0.3, 0.8, 0.02, DARKWOOD), ...wraps(-0.1, 0.1, 6, 0.0225, LEATHER)]),
  // great axe: one huge bearded blade, a back spike, an iron-shod haft
  greataxe: () => out([tint(axeHead({ L: 0.27, h0: 0.08, up: 0.14, down: 0.3, t0: 0.05, bulge: 0.04, y: 0.86 }), STEEL), tint(box(0.042, 0.1, 0.05).translate(0, 0.86, 0), DARKSTEEL), tint(spike(0.022, 0.13, 4).rotateZ(Math.PI / 2).translate(-0.085, 0.86, 0), DARKSTEEL), tint(cyl(0.025, 0.025, 0.04, 8).translate(0, -0.34, 0), DARKSTEEL), tint(cyl(0.024, 0.024, 0.02, 8).translate(0, 0.55, 0), DARKSTEEL)], [haft(-0.34, 0.93, 0.021, DARKWOOD), ...wraps(-0.1, 0.12, 7, 0.0235, DARKLEATHER)]),
  // war hammer: a square steel face, a curved beak behind, a top spike
  warhammer: () => out([tint(box(0.07, 0.07, 0.07).translate(0.075, 0.7, 0), STEEL), tint(box(0.085, 0.085, 0.085).translate(0.12, 0.7, 0), DARKSTEEL), tint(box(0.05, 0.06, 0.05).translate(0, 0.7, 0), DARKSTEEL), tint(spike(0.026, 0.16, 4).rotateZ(Math.PI / 2 + 0.25).translate(-0.1, 0.685, 0), STEEL), tint(spike(0.016, 0.1, 4).translate(0, 0.78, 0), STEEL), tint(box(0.008, 0.3, 0.02).translate(0.02, 0.5, 0), DARKSTEEL)], [haft(-0.3, 0.74, 0.019, DARKWOOD), ...wraps(-0.1, 0.1, 6, 0.0215, LEATHER)]),
  // flanged mace: six steel flanges round the head
  mace: () => { const fl = []; for (let i = 0; i < 6; i++) { const s = new THREE.Shape(); s.moveTo(0.012, -0.06); s.lineTo(0.05, -0.02); s.lineTo(0.058, 0.025); s.lineTo(0.012, 0.07); s.closePath(); fl.push(tint(flat(new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: false }).translate(0, 0, -0.004).rotateY(i * Math.PI / 3).translate(0, 0.52, 0)), STEEL)); }
    return out([...fl, tint(cyl(0.018, 0.018, 0.16, 8).translate(0, 0.52, 0), DARKSTEEL), tint(spike(0.014, 0.05, 6).translate(0, 0.62, 0), DARKSTEEL), tint(cyl(0.014, 0.014, 0.4, 8).translate(0, 0.26, 0), DARKSTEEL), tint(cyl(0.024, 0.024, 0.014, 10).translate(0, 0.085, 0), DARKSTEEL), tint(ball(0.022).translate(0, -0.09, 0), DARKSTEEL)], [...grip(-0.08, 0.08, 0.017), ...wraps(-0.07, 0.07, 5)]); },
  // spear: an ash shaft with a leaf-shaped socketed head
  spear: () => out([tint(blade({ len: 0.32, w0: 0.03, w1: 0.05, tip: 0.2, y0: 1.3, th: 0.012, belly: 0.012 }), STEEL), tint(cyl(0.02, 0.014, 0.12, 8).translate(0, 1.25, 0), DARKSTEEL), tint(spike(0.016, 0.07, 6).rotateZ(Math.PI).translate(0, -0.62, 0), DARKSTEEL)], [haft(-0.6, 1.2, 0.016), ...wraps(-0.06, 0.1, 5, 0.018, LEATHER)]),
  // ---------- the dead: whatever was lying around ----------
  machete: () => out(null, grip(-0.08, 0.07, 0.019, BLACK), [tint(blade({ len: 0.5, w0: 0.04, w1: 0.064, tip: 0.1, single: true, th: 0.006, y0: 0.07 }), OLDSTEEL)]),
  cleaver: () => out(null, grip(-0.08, 0.06, 0.019, DARKWOOD), [tint(blade({ len: 0.27, w0: 0.11, w1: 0.12, tip: 0.02, single: true, th: 0.007, y0: 0.07 }), OLDSTEEL), tint(cyl(0.006, 0.006, 0.022, 6).rotateX(Math.PI / 2).translate(-0.04, 0.3, 0), BLACK)]),
  // fireman's axe: red painted head, bright edge, a pick behind
  fireaxe: () => out([tint(axeHead({ L: 0.05, h0: 0.1, up: 0.07, down: 0.08, t0: 0.012, bulge: 0.012, y: 0.56 }).translate(0.115, 0, 0), STEEL)], [haft(-0.24, 0.62, 0.018, YELLOW), ...wraps(-0.2, -0.05, 4, 0.0195, BLACK)], [tint(axeHead({ L: 0.12, h0: 0.065, up: 0.06, down: 0.07, y: 0.56 }), RED), tint(box(0.04, 0.075, 0.042).translate(0, 0.56, 0), RED), tint(spike(0.02, 0.12, 4).rotateZ(Math.PI / 2).translate(-0.075, 0.56, 0), RED)]),
  hatchet: () => out(null, [haft(-0.14, 0.3, 0.016, WOOD)], [tint(axeHead({ L: 0.11, h0: 0.055, up: 0.05, down: 0.08, y: 0.25 }), OLDSTEEL), tint(box(0.034, 0.065, 0.038).translate(0, 0.25, 0), IRON)]),
  // crowbar: hexagonal bar, a hooked claw at the top, a chisel end
  crowbar: () => { const pts = []; for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI * 0.95; pts.push(new THREE.Vector3(0.05 - 0.05 * Math.cos(a), 0.56 + 0.05 * Math.sin(a), 0)); }
    return out(null, null, [tint(cyl(0.011, 0.011, 0.78, 6).translate(0, 0.17, 0), 0x2a3a6a), tint(flat(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.011, 6)), 0x2a3a6a), tint(box(0.03, 0.05, 0.006).translate(0.1, 0.54, 0), OLDSTEEL), tint(box(0.026, 0.06, 0.006).rotateZ(0.3).translate(-0.008, -0.24, 0), OLDSTEEL)]); },
  // pipe wrench: red cast handle, toothed steel jaws
  wrench: () => out([tint(box(0.03, 0.05, 0.026).translate(0.045, 0.5, 0), STEEL), tint(box(0.07, 0.022, 0.026).translate(0.02, 0.535, 0), STEEL), tint(box(0.06, 0.02, 0.026).translate(0.03, 0.43, 0), STEEL), tint(cyl(0.02, 0.02, 0.022, 10).rotateX(Math.PI / 2).translate(-0.005, 0.47, 0), DARKSTEEL)], null, [tint(box(0.028, 0.56, 0.016).translate(0, 0.16, 0), RED), tint(box(0.036, 0.1, 0.022).translate(0, 0.46, 0), RED)]),
  // baseball bat with nails driven through the barrel
  bat: () => { const pr = [[0.0, -0.2], [0.02, -0.2], [0.02, -0.185], [0.013, -0.17], [0.014, 0.1], [0.026, 0.38], [0.031, 0.56], [0.029, 0.6], [0.0, 0.61]].map(([x, y]) => new THREE.Vector2(x, y)); const nails = [];
    for (let i = 0; i < 7; i++) nails.push(tint(cyl(0.0028, 0.0028, 0.11, 5).rotateZ(Math.PI / 2).rotateY(i * 2.2).translate(0, 0.4 + i * 0.027, 0), IRON));
    return out(null, [tint(flat(new THREE.LatheGeometry(pr, 12)), ASH), ...wraps(-0.14, 0.02, 6, 0.0152, BLACK)], nails); },
  // police baton: black, with the side handle
  baton: () => out(null, [tint(cyl(0.015, 0.015, 0.6, 10).translate(0, 0.2, 0), BLACK), tint(cyl(0.013, 0.013, 0.12, 8).rotateZ(Math.PI / 2).translate(0.06, 0.06, 0), BLACK), tint(ball(0.017).translate(0.12, 0.06, 0), BLACK), tint(ball(0.016).translate(0, 0.5, 0), BLACK)], null),
  // sledgehammer
  sledge: () => out(null, [haft(-0.3, 0.72, 0.018, ASH)], [tint(cyl(0.042, 0.042, 0.17, 8).rotateZ(Math.PI / 2).translate(0, 0.7, 0), IRON), tint(cyl(0.046, 0.046, 0.02, 8).rotateZ(Math.PI / 2).translate(0.085, 0.7, 0), OLDSTEEL), tint(cyl(0.046, 0.046, 0.02, 8).rotateZ(Math.PI / 2).translate(-0.085, 0.7, 0), OLDSTEEL)]),
  shovel: () => { const b = blade({ len: 0.3, w0: 0.19, w1: 0.17, tip: 0.1, th: 0.008, y0: 0.9 }); const p = b.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + 0.9 * p.getX(i) * p.getX(i)); b.computeVertexNormals();
    return out(null, [haft(-0.3, 0.84, 0.017, WOOD), tint(cyl(0.015, 0.015, 0.13, 8).rotateZ(Math.PI / 2).translate(0, -0.32, 0), WOOD)], [tint(b, OLDSTEEL), tint(cyl(0.022, 0.018, 0.14, 8).translate(0, 0.86, 0), IRON)]); },
  pipe: () => out(null, null, [tint(cyl(0.02, 0.02, 0.85, 8).translate(0, 0.28, 0), IRON), tint(cyl(0.027, 0.027, 0.06, 8).translate(0, 0.7, 0), OLDSTEEL), tint(cyl(0.02, 0.02, 0.12, 8).rotateZ(Math.PI / 2).translate(0.06, 0.72, 0), IRON), tint(cyl(0.027, 0.027, 0.04, 6).rotateZ(Math.PI / 2).translate(0.12, 0.72, 0), OLDSTEEL)]),
};
const HOLD = { waraxe: 0.1, battleaxe: 0.16, greataxe: 0.2, warhammer: 0.16, fireaxe: 0.13, sledge: 0.16, shovel: 0.14, crowbar: 0.12, pipe: 0.1, wrench: 0.08, hatchet: 0.05 };
// The merged parts of one weapon, turned so its cutting edge faces +Z: [[material key, geometry], ...]
export function mobArmParts(id) {
  const P = MOB_ARM_GEO[id] && MOB_ARM_GEO[id](); if (!P) return [];
  const res = [], up = HOLD[id] || 0; // long hafts are gripped nearer the butt
  for (const [k, mk] of [['metal', 'wSteel'], ['soft', 'wSoft'], ['rust', 'wRust']]) { const a = P[k]; if (!a || !a.length) continue; res.push([mk, mergeGeometries(a.map(flat)).translate(0, up, 0).rotateY(-Math.PI / 2)]); }
  return res;
}
