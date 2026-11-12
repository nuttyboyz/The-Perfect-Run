// Reroll dice: glowing dice lying around every map. Walk over one to bank a reroll for the level-up screen.
import * as THREE from 'three';
import { mulberry32 } from './rng.js';

const PIPS = [[[0, 0]], [[-1, -1], [1, 1]], [[-1, -1], [0, 0], [1, 1]], [[-1, -1], [1, -1], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]];
let proto = null;
function die() {
  if (proto) return proto.clone();
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0xf4efe2, roughness: 0.35, metalness: 0.05, emissive: 0x3a2a10, emissiveIntensity: 0.5 }));
  body.castShadow = true;
  g.add(body);
  const pm = new THREE.MeshStandardMaterial({ color: 0x15110e, roughness: 0.5 });
  const pg = new THREE.SphereGeometry(0.044, 8, 6);
  // Faces +z,-z,+x,-x,+y,-y carry 1..6 pips.
  const faces = [[[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]], [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]]];
  faces.forEach(([n, u, v], i) => {
    for (const [a, b] of PIPS[i]) {
      const m = new THREE.Mesh(pg, pm);
      m.position.set(n[0] * 0.25 + u[0] * a * 0.12 + v[0] * b * 0.12, n[1] * 0.25 + u[1] * a * 0.12 + v[1] * b * 0.12, n[2] * 0.25 + u[2] * a * 0.12 + v[2] * b * 0.12);
      g.add(m);
    }
  });
  proto = g;
  return g.clone();
}

export function placeDice(world) {
  const r = mulberry32((world.seed ^ 0x0d1ce5) >>> 0);
  const spots = [];
  const ok = (x, z) => {
    if (Math.hypot(x, z) > 156 || world.blocked(x, z, 1.2) || (world.noPlace && world.noPlace(x, z, 1.5))) return false;
    if (Math.hypot(x - world.arena.x, z - world.arena.z) < world.arena.r + 3) return false;
    return spots.every((s) => Math.hypot(s.x - x, s.z - z) > 18);
  };
  for (let tries = 0; spots.length < 9 && tries < 500; tries++) {
    const a = r() * Math.PI * 2, d = spots.length < 2 ? 8 + r() * 10 : 18 + r() * 130;
    const x = (spots.length < 2 ? world.spawn.x : 0) + Math.cos(a) * d, z = (spots.length < 2 ? world.spawn.z : 0) + Math.sin(a) * d;
    if (ok(x, z)) spots.push({ x, z, y: world.heightAt(x, z), taken: false });
  }
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd34a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd34a, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ringGeo = new THREE.RingGeometry(0.6, 0.78, 24).rotateX(-Math.PI / 2), beamGeo = new THREE.CylinderGeometry(0.1, 0.4, 5, 10, 1, true).translate(0, 2.5, 0);
  for (const s of spots) {
    const grp = new THREE.Group();
    grp.position.set(s.x, s.y, s.z);
    const d = die();
    d.position.y = 0.9;
    grp.add(d, new THREE.Mesh(ringGeo, ringMat), new THREE.Mesh(beamGeo, beamMat));
    s.mesh = grp; s.die = d; s.ph = r() * 6;
    world.group.add(grp);
  }
  world.animated.push((t) => {
    ringMat.opacity = 0.45 + 0.2 * Math.sin(t * 3);
    for (const s of spots) if (!s.taken) { s.die.position.y = 0.95 + Math.sin(t * 2 + s.ph) * 0.12; s.die.rotation.set(t * 0.7 + s.ph, t * 1.1, t * 0.5); }
  });
  return spots;
}
