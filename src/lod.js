// Distance versions of the skinned enemy bodies. Each collapsed mob body is 50-60k triangles, and a crowded round
// draws 30+ of them twice (colour + shadow), which is what held the frame rate in the 20s-40s. Far away nobody can
// see that detail, so a vertex-clustering pass (cells a fixed fraction of the body's height) builds lighter copies
// that keep the skin indices/weights, so they animate exactly like the full mesh.
import { PERF } from './perf.js';
import * as THREE from 'three';

const cache = new WeakMap(); // full geometry -> [full, mid, far]

function cluster(g, cells) {
  const P = g.attributes.position, N = g.attributes.normal, n = P.count;
  if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox, size = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z), c = size / cells;
  const map = new Map(), rep = new Int32Array(n), sums = [];
  for (let i = 0; i < n; i++) {
    const k = Math.floor((P.getX(i) - b.min.x) / c) + Math.floor((P.getY(i) - b.min.y) / c) * 4096 + Math.floor((P.getZ(i) - b.min.z) / c) * 16777216;
    let r = map.get(k);
    if (r === undefined) { r = sums.length; map.set(k, r); sums.push([i, 0, 0, 0, 0, 0, 0, 0]); }
    const s = sums[r];
    s[1] += P.getX(i); s[2] += P.getY(i); s[3] += P.getZ(i); s[4]++;
    if (N) { s[5] += N.getX(i); s[6] += N.getY(i); s[7] += N.getZ(i); }
    rep[i] = r;
  }
  const m = sums.length, out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) {
    const arr = new a.array.constructor(m * a.itemSize);
    for (let r = 0; r < m; r++) { const src = sums[r][0]; for (let j = 0; j < a.itemSize; j++) arr[r * a.itemSize + j] = a.array[src * a.itemSize + j]; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
  }
  const op = out.attributes.position, on = out.attributes.normal;
  for (let r = 0; r < m; r++) {
    const s = sums[r];
    op.setXYZ(r, s[1] / s[4], s[2] / s[4], s[3] / s[4]);
    if (on) { const l = Math.hypot(s[5], s[6], s[7]); if (l > 0.05) on.setXYZ(r, s[5] / l, s[6] / l, s[7] / l); /* else keep the first vertex's own normal: opposing normals cancel to zero, and a zero normal shades as NaN */ }
  }
  const idx = g.index ? g.index.array : null, tri = idx ? idx.length : n, keep = [], seen = new Set();
  for (let t = 0; t < tri; t += 3) {
    const a = rep[idx ? idx[t] : t], b2 = rep[idx ? idx[t + 1] : t + 1], c2 = rep[idx ? idx[t + 2] : t + 2];
    if (a === b2 || b2 === c2 || a === c2) continue;
    // drop exact duplicates (same three cells, same winding)
    const lo = Math.min(a, b2, c2), key = a === lo ? `${a},${b2},${c2}` : b2 === lo ? `${b2},${c2},${a}` : `${c2},${a},${b2}`;
    if (seen.has(key)) continue;
    seen.add(key); keep.push(a, b2, c2);
  }
  out.setIndex(m > 65535 ? new THREE.Uint32BufferAttribute(keep, 1) : new THREE.Uint16BufferAttribute(keep, 1));
  out.boundingSphere = g.boundingSphere ? g.boundingSphere.clone() : null;
  out.boundingBox = g.boundingBox.clone();
  out.groups = [];
  return out;
}

export function lodSet(g) {
  let s = cache.get(g);
  if (s) return s;
  const tris = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  s = tris < 6000 ? [g, g, g] : [g, cluster(g, 110), cluster(g, 55)];
  cache.set(g, s);
  return s;
}

// LOD level for a distance in metres (0 full, 1 mid, 2 far).
export const lodLevel = (d) => { const k = PERF.lod || 1; return d < 8 * k ? 0 : d < 24 * k ? 1 : 2; }; // the frame governor shrinks these on slow machines
