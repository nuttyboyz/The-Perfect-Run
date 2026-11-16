// Is a point inside a weapon? The weapon is many closed parts merged together and overlapping, so counting surfaces crossed (odd = inside)
// is fooled wherever two parts overlap. Here every crossing is signed (leaving a part +1, entering one -1): the sum along a line of sight
// is the number of parts the point is inside, whatever overlaps. Two of three lines of sight must agree, so a flat or open part cannot fool it.
// Triangles are binned on a grid across each line of sight, so one test looks at a handful of triangles.
import * as THREE from 'three';
const DIRS = [[0.36, 0.48, 0.8], [-0.62, -0.7, 0.35], [0.55, -0.3, -0.78]].map((d) => new THREE.Vector3(...d).normalize());
const CACHE = new WeakMap();
export function makeSolid(meshes) {
  let n = 0; for (const m of meshes) { const g = m.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3; }
  const T = new Float32Array(n * 9), v = new THREE.Vector3(); let k = 0;
  for (const m of meshes) { const g = m.geometry, pa = g.attributes.position, ix = g.index, c = ix ? ix.count : pa.count; m.updateWorldMatrix(true, false);
    for (let i = 0; i < c; i++) { v.fromBufferAttribute(pa, ix ? ix.getX(i) : i).applyMatrix4(m.matrixWorld); T[k++] = v.x; T[k++] = v.y; T[k++] = v.z; } }
  const views = DIRS.map((d) => {
    const a = new THREE.Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize(), b = new THREE.Vector3().crossVectors(d, a);
    const P = new Float32Array(n * 9), S = new Int8Array(n); let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (let t = 0; t < n; t++) { for (let i = 0; i < 3; i++) { const x = T[t * 9 + i * 3], y = T[t * 9 + i * 3 + 1], z = T[t * 9 + i * 3 + 2], u = x * a.x + y * a.y + z * a.z, w = x * b.x + y * b.y + z * b.z;
        P[t * 9 + i * 3] = u; P[t * 9 + i * 3 + 1] = w; P[t * 9 + i * 3 + 2] = x * d.x + y * d.y + z * d.z; if (u < u0) u0 = u; if (u > u1) u1 = u; if (w < v0) v0 = w; if (w > v1) v1 = w; }
      const ar = (P[t * 9 + 3] - P[t * 9]) * (P[t * 9 + 7] - P[t * 9 + 1]) - (P[t * 9 + 6] - P[t * 9]) * (P[t * 9 + 4] - P[t * 9 + 1]); S[t] = Math.abs(ar) < 1e-10 ? 0 : ar > 0 ? 1 : -1; }
    const N = Math.max(4, Math.min(72, Math.ceil(Math.sqrt(n / 2)))), cu = (u1 - u0) / N || 1, cv = (v1 - v0) / N || 1, cnt = new Uint32Array(N * N + 1);
    const span = (t) => { const o = t * 9, ua = Math.min(P[o], P[o + 3], P[o + 6]), ub = Math.max(P[o], P[o + 3], P[o + 6]), va = Math.min(P[o + 1], P[o + 4], P[o + 7]), vb = Math.max(P[o + 1], P[o + 4], P[o + 7]);
      return [Math.max(0, Math.min(N - 1, Math.floor((ua - u0) / cu))), Math.max(0, Math.min(N - 1, Math.floor((ub - u0) / cu))), Math.max(0, Math.min(N - 1, Math.floor((va - v0) / cv))), Math.max(0, Math.min(N - 1, Math.floor((vb - v0) / cv)))]; };
    for (let t = 0; t < n; t++) if (S[t]) { const [i0, i1, j0, j1] = span(t); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cnt[j * N + i + 1]++; }
    for (let i = 0; i < N * N; i++) cnt[i + 1] += cnt[i];
    const L = new Uint32Array(cnt[N * N]), at = cnt.slice(0, N * N);
    for (let t = 0; t < n; t++) if (S[t]) { const [i0, i1, j0, j1] = span(t); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) L[at[j * N + i]++] = t; }
    return { a, b, d, P, S, N, u0, v0, cu, cv, cnt, L };
  });
  // how many parts the point is inside, seen along one line of sight (0 = outside)
  const count = (V, x, y, z) => { const u = x * V.a.x + y * V.a.y + z * V.a.z, w = x * V.b.x + y * V.b.y + z * V.b.z, dp = x * V.d.x + y * V.d.y + z * V.d.z;
    const i = Math.floor((u - V.u0) / V.cu), j = Math.floor((w - V.v0) / V.cv); if (i < 0 || j < 0 || i >= V.N || j >= V.N) return 0; const P = V.P; let sum = 0;
    for (let q = V.cnt[j * V.N + i], e = V.cnt[j * V.N + i + 1]; q < e; q++) { const t = V.L[q], o = t * 9, ax = P[o] - u, ay = P[o + 1] - w, bx = P[o + 3] - u, by = P[o + 4] - w, cx = P[o + 6] - u, cy = P[o + 7] - w;
      const w0 = bx * cy - by * cx, w1 = cx * ay - cy * ax, w2 = ax * by - ay * bx; if (!((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0))) continue; const ws = w0 + w1 + w2; if (!ws) continue;
      if ((w0 * P[o + 2] + w1 * P[o + 5] + w2 * P[o + 8]) / ws > dp) sum += V.S[t]; }
    return sum; };
  return { tris: n, inside: (p) => { let y = 0, no = 0; for (const V of views) { if (count(V, p.x, p.y, p.z)) { if (++y > 1) return true; } else if (++no > 1) return false; } return false; }, /* two of the three lines of sight must agree (a flat decal or an open part can upset one of them either way) */ counts: (p) => views.map((V) => count(V, p.x, p.y, p.z)) };
}
export function solidOf(meshes) { let s = CACHE.get(meshes); if (!s) CACHE.set(meshes, (s = makeSolid(meshes))); return s; }
