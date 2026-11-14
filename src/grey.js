// The Visitor: a classic grey alien on the veteran's rig, drawn with the same realistic surface treatment as the pirate:
// pore-bumped skin with a soft sheen and a thin glossy film, wet black eyes with real reflections, sculpted anatomy
// (collarbones, ribs, tendons, knees, toes) and the veteran's real hands. No clothes. Three looks via skin.design:
//   1  classic grey: round dome, wrap-around slanted eyes, slate skin
//   2  tall grey: a high egg-shaped head, paler skin, even bigger eyes
//   3  elder grey: a broad low brow-ridged skull, deep upright eyes, dark mottled skin
import * as THREE from 'three';
import { makeKit, V, ell, limb, chainWeights } from './armor.js';
import { real } from './realmat.js';
import { boneKey } from './retarget.js';

// A lens-shaped dome in the XY plane facing +Z (pointed ends, rx long, ry tall, `depth` of the bulge).
function almond(rx, ry, depth, nu = 30, nv = 14) {
  const pos = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = (i / nu) * 2 - 1, v = (j / nv) * 2 - 1;
    const h = Math.pow(Math.max(0, 1 - u * u), 0.75);
    const x = u * rx, y = v * h * ry + (u * u) * ry * 0.12;
    const z = depth * Math.sqrt(Math.max(0, 1 - u * u)) * Math.sqrt(Math.max(0, 1 - v * v)) ;
    pos.push(x, y, z);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function buildGrey(scene, skin) {
  const d = skin && skin.design ? +skin.design : 1;
  const SK = skin.skin, SH = skin.shade, EYE = skin.eye != null ? skin.eye : 0x05060a;
  const sc = new THREE.Color(SK);
  const skinMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.55, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.4 });   // perfectly smooth: no pore noise
  skinMat.sheenColor = new THREE.Color(0xa9bacc);
  const eyeMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, ior: 1.55, specularIntensity: 1, envMapIntensity: 1.6 });
  const kit = makeKit(scene, [skinMat, eyeMat], 'grey_body');
  const { add, mirror, tube, J } = kit;
  const mix = (k) => new THREE.Color(SK).lerp(new THREE.Color(SH), k).getHex();
  const dark = mix(1.0), mid = mix(0.5);
  const limbC = (k) => mix(Math.min(1, k)); // arms and legs darken toward the extremities, as in the reference

  // Remove the veteran's clothes, face and hair; keep only the real hands, in grey skin.
  const drop = [];
  scene.traverse((o) => { if (o.isMesh) drop.push(o); });
  for (const o of drop) {
    if (/Wolf3D_Body/.test(o.name)) { keepBones(o, /Hand/, new THREE.Color(mix(0.3))); stretchHands(o, kit); o.material = skinMat; o.castShadow = true; }
    else if (o.parent) o.parent.remove(o);
  }

  // ---- the body: a slender frame with real anatomy ----
  const hips = J('Hips'), neck = J('Neck'), headJ = J('Head');
  const torsoBones = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck'];
  const slim = d === 2 ? 0.94 : 1;
  {
    const rows = [ // y, rx, rz, z
      [0.95, 0.1, 0.08, 0.0], [0.99, 0.128, 0.092, 0.0], [1.04, 0.122, 0.088, 0.0], [1.11, 0.1, 0.078, 0.008], [1.2, 0.102, 0.078, 0.012],
      [1.29, 0.114, 0.084, 0.008], [1.38, 0.124, 0.088, 0.0], [1.455, 0.13, 0.082, -0.012], [1.5, 0.108, 0.07, -0.022], [1.535, 0.062, 0.054, -0.03],
    ];
    const pts = rows.map((r) => V(0, r[0], r[3])), rad = rows.map((r) => [r[1] * slim, r[2] * slim]);
    tube(0, pts, rad, (i) => chainWeights(kit, torsoBones, pts[i].y), { color: SK, ao: 0.3, seg: 26, up: V(0, 0, 1), ringColor: (i) => (i < 2 ? mix(0.3) : i > 7 ? mix(0.12) : SK) });
    // Ribcage, soft pot belly, sternum, collarbones, navel.
    mirror((s) => {
      add(0, ell(V(s * 0.1, 1.003, 0.012), [0.048, 0.058, 0.044], null, 14), 'Hips', SK, 0.3);                       // hip bones
      // Ribs: six thin flush arcs sloping down and out, a visible cage over a hollow belly.
      for (let r = 0; r < 6; r++) add(0, ell(V(s * 0.062, 1.402 - r * 0.033, 0.0725 - r * 0.0035), [0.036, 0.0055, 0.01], [0.0, s * 0.4, -s * 0.2], 12), r < 3 ? 'Spine2' : 'Spine1', mix(0.2), 0.3);
      // Collarbones and the two neck tendons.
      add(0, limb(V(s * 0.015, 1.483, 0.044), V(s * 0.135, 1.5, 0.006), 0.0075, 0.0065, 0.0075, 0.0065, V(0, 1, 0), 0.7), 'Spine2', mix(0.12), 0.3);
      add(0, limb(V(s * 0.03, 1.62, -0.004), V(s * 0.03, 1.495, 0.028), 0.0065, 0.0065, 0.0085, 0.0085, V(0, 0, 1), 0.7), 'Neck', mix(0.1), 0.3);
      // Pelvic crease running in toward the groin (smooth, no detail below).
      add(0, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(s * 0.12, 1.06, 0.07), V(s * 0.075, 1.0, 0.087), V(s * 0.02, 0.965, 0.09)]), 10, 0.003, 4, false), 'Hips', mix(0.6), 0.0);
      // Shoulder blade bumps on the back.
      add(0, ell(V(s * 0.075, 1.36, -0.082), [0.052, 0.07, 0.014], [0, 0, s * 0.18], 12), 'Spine2', SK, 0.3);
    });
    add(0, ell(V(0, 1.12, 0.034), [0.07 * slim, 0.075, 0.036], null, 18), 'Spine', SK, 0.25);
    add(0, ell(V(0, 0.99, -0.004), [0.108, 0.06, 0.082], null, 20), 'Hips', SK, 0.3);
    add(0, ell(V(0, 0.935, 0.0), [0.088, 0.05, 0.07], null, 20), 'Hips', SK, 0.3);                                      // closes the crotch
    add(0, ell(V(0, 1.386, 0.072), [0.011, 0.07, 0.01], null, 10), 'Spine2', mix(0.22), 0.3);
    add(0, ell(V(0, 1.02, 0.088), [0.011, 0.012, 0.007], null, 8), 'Hips', dark, 0.0);
    add(0, ell(V(0, 1.462, 0.058), [0.022, 0.009, 0.01], null, 10), 'Spine2', dark, 0.0);                            // sternal notch
  }
  // Neck: long, thin.
  tube(0, [V(0, neck.y - 0.03, -0.03), V(0, neck.y + 0.05, -0.02), V(0, headJ.y + 0.0, 0.0)], [[0.056, 0.05], [0.047, 0.043], [0.05, 0.046]], (i) => chainWeights(kit, ['Spine2', 'Neck', 'Head'], [neck.y - 0.03, neck.y + 0.05, headJ.y][i]), { color: SK, ao: 0.2, seg: 16, up: V(0, 0, 1) });

  // ---- limbs ----
  mirror((s) => {
    const A = s > 0 ? 'Left' : 'Right';
    const sh = J(A + 'Arm'), el = J(A + 'ForeArm'), wr = J(A + 'Hand');
    const lenU = sh.distanceTo(el), lenF = el.distanceTo(wr), total = lenU + lenF;
    const prof = [[0.0, 0.052, 0.052], [0.12, 0.044, 0.046], [0.3, 0.036, 0.038], [0.45, 0.031, 0.033], [0.5, 0.032, 0.034], [0.58, 0.034, 0.035], [0.72, 0.029, 0.03], [0.88, 0.025, 0.026], [1.0, 0.0235, 0.0245]];
    const at = (t) => { const dd = t * total; return dd <= lenU ? sh.clone().lerp(el, dd / lenU) : el.clone().lerp(wr, (dd - lenU) / lenF); };
    tube(0, prof.map((p) => at(p[0])), prof.map((p) => [p[1], p[2]]), (i) => {
      const w = THREE.MathUtils.smoothstep(prof[i][0] * total, lenU - 0.06, lenU + 0.06);
      return w <= 0.001 ? [[A + 'Arm', 1]] : w >= 0.999 ? [[A + 'ForeArm', 1]] : [[A + 'Arm', 1 - w], [A + 'ForeArm', w]];
    }, { color: SK, ao: 0.25, seg: 16, up: V(0, 0, 1), ringColor: (i) => (i === 4 || i === 5 ? limbC(0.3) : limbC(0.05 + i * 0.045)) });
    add(0, ell(sh.clone().add(V(s * -0.008, 0.002, 0)), [0.046, 0.046, 0.046], null, 16), A + 'Arm', SK, 0.3);           // shoulder cap
    add(0, ell(el.clone().add(V(0, 0.002, -0.014)), [0.034, 0.034, 0.034], null, 12), A + 'ForeArm', mix(0.1), 0.3);       // elbow
    add(0, ell(wr.clone().add(V(0, 0, -0.012)), [0.019, 0.02, 0.02], null, 10), A + 'Hand', SK, 0.3);                      // wrist
    const hp = J(A + 'UpLeg'), kn = J(A + 'Leg'), an = J(A + 'Foot');
    const lenT = hp.distanceTo(kn), lenS = kn.distanceTo(an), tot = lenT + lenS;
    const lp = [[0.0, 0.076, 0.08], [0.12, 0.072, 0.076], [0.3, 0.06, 0.064], [0.44, 0.048, 0.051], [0.5, 0.046, 0.05], [0.57, 0.05, 0.054], [0.68, 0.046, 0.05], [0.82, 0.034, 0.036], [0.95, 0.028, 0.03], [1.0, 0.028, 0.03]];
    const lat = (t) => { const dd = t * tot; return dd <= lenT ? hp.clone().lerp(kn, dd / lenT) : kn.clone().lerp(an, (dd - lenT) / lenS); };
    tube(0, lp.map((p) => lat(p[0])), lp.map((p) => [p[1], p[2]]), (i) => {
      const w = THREE.MathUtils.smoothstep(lp[i][0] * tot, lenT - 0.07, lenT + 0.07);
      return w <= 0.001 ? [[A + 'UpLeg', 1]] : w >= 0.999 ? [[A + 'Leg', 1]] : [[A + 'UpLeg', 1 - w], [A + 'Leg', w]];
    }, { color: SK, ao: 0.25, seg: 18, up: V(0, 0, 1), ringColor: (i) => (i === 4 || i === 5 ? limbC(0.6) : limbC(0.25 + i * 0.06)) });
    add(0, ell(hp.clone().add(V(s * -0.012, -0.005, 0.0)), [0.07, 0.075, 0.074], null, 18), A + 'UpLeg', SK, 0.3);       // hip ball hides the thigh's top edge
    add(0, ell(kn.clone().add(V(0, 0.01, 0.016)), [0.044, 0.05, 0.04], null, 14), A + 'Leg', limbC(0.5), 0.3);
    add(0, ell(kn.clone().add(V(0, -0.045, 0.006)), [0.036, 0.03, 0.034], null, 12), A + 'Leg', limbC(0.5), 0.3);
    add(0, ell(kn.clone().add(V(s * 0.036, 0.0, -0.004)), [0.016, 0.04, 0.03], null, 10), A + 'Leg', limbC(0.5), 0.3);  // knee joint sides               // kneecap
    add(0, ell(lat(0.64).add(V(0, 0.0, -0.022)), [0.04, 0.085, 0.036], null, 14), A + 'Leg', SK, 0.3);                    // calf
    // Foot: thin and long, four small toes.
    const te = kit.has(A + 'Toe_End') ? J(A + 'Toe_End') : V(an.x, 0, an.z + 0.2), tb = kit.has(A + 'ToeBase') ? J(A + 'ToeBase') : V(an.x, 0.04, an.z + 0.1);
    add(0, ell(V(an.x, an.y - 0.04, an.z - 0.004), [0.03, 0.07, 0.034], null, 12), A + 'Foot', limbC(0.7), 0.3);                  // ankle
    add(0, ell(V(an.x + s * 0.002, 0.036, (an.z + tb.z) * 0.5 + 0.05), [0.04, 0.03, 0.135], [0.1, 0, 0], 16), A + 'Foot', limbC(0.7), 0.3);
    for (let k = 0; k < 5; k++) add(0, limb(V(an.x + (k - 2) * 0.017, 0.022, te.z - 0.11), V(an.x + (k - 2) * 0.021, 0.012, te.z + 0.01 + (k === 0 ? 0.025 : k === 1 ? 0.035 : 0.02 - k * 0.003)), 0.011, 0.01, 0.0075, 0.0068, V(0, 1, 0), 0.9), A + 'ToeBase', limbC(0.7), 0.3);
  });

  // ---- head ----
  const HEAD = 'Head', ha = (slot, g, c, ao) => add(slot, g, HEAD, c, ao);
  const C = d === 1 ? { c: V(0, 1.83, -0.015), r: [0.152, 0.17, 0.158], e: [0.95, 0.95] }
    : d === 2 ? { c: V(0, 1.875, -0.025), r: [0.136, 0.205, 0.152], e: [0.9, 0.95] }
      : { c: V(0, 1.8, -0.03), r: [0.172, 0.14, 0.168], e: [0.9, 0.9] };
  // One continuous head: ellipse rings lofted from chin to crown, their width and depth the smooth union of a cranium ellipsoid
  // and a tapering lower face, with smooth normals throughout. No overlapping shells, so there are no seams or creases.
  const wd = d === 2 ? 0.095 : 0.108, faceShapes = [{ c: C.c, r: C.r }, { c: V(0, C.c.y - 0.085, C.c.z + 0.004), r: [C.r[0] * 0.86, 0.085, C.r[2] * 0.84] }];
  for (let i = 0; i < 5; i++) {
    const t = i / 4, k = 1 - 0.58 * t * t;
    faceShapes.push({ c: V(0, 1.705 - t * 0.06, -0.012 + t * 0.016), r: [wd * k, 0.1, (d === 2 ? 0.1 : 0.102) * (0.62 + 0.38 * k)] });
  }
  const KS = 0.03;
  const smax = (a, b) => { const h = Math.max(KS - Math.abs(a - b), 0) / KS; return Math.max(a, b) + h * h * KS * 0.25; };
  const smin = (a, b) => -smax(-a, -b); // blend radius of the union
  const sil = (y) => { // union silhouette at height y: half-width, front z, back z
    let w = 0, zf = null, zb = null;
    for (const f of faceShapes) {
      const q = 1 - ((y - f.c.y) / f.r[1]) ** 2;
      if (q <= 0) continue;
      const sq = Math.sqrt(q), wi = f.r[0] * sq, fi = f.c.z + f.r[2] * sq, bi = f.c.z - f.r[2] * sq;
      w = w ? smax(w, wi) : wi;
      zf = zf === null ? fi : smax(zf, fi);
      zb = zb === null ? bi : smin(zb, bi);
    }
    return zf === null ? null : { w, zf, zb };
  };
  const yTop = C.c.y + C.r[1], yBot = faceShapes[6].c.y - faceShapes[6].r[1] * 0.55;
  const loft = (() => {
    const RN = 90, SG = 56, pos = [], idx = [];
    for (let i = 0; i <= RN; i++) {
      const y = yBot + (yTop - yBot) * (0.5 - 0.5 * Math.cos(Math.PI * i / RN)); // dense near both ends
      const sl = sil(Math.min(yTop - 1e-5, Math.max(yBot + 1e-5, y))) || { w: 0, zf: 0, zb: 0 };
      const zc = (sl.zf + sl.zb) / 2, rz = (sl.zf - sl.zb) / 2;
      for (let j = 0; j < SG; j++) { const a = (j / SG) * Math.PI * 2; pos.push(Math.sin(a) * sl.w, y, zc + Math.cos(a) * rz); }
    }
    for (let i = 0; i < RN; i++) for (let j = 0; j < SG; j++) {
      const a = i * SG + j, b = i * SG + (j + 1) % SG, c = (i + 1) * SG + j, e = (i + 1) * SG + (j + 1) % SG;
      idx.push(a, b, c, b, e, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();
  ha(0, loft, SK, 0.0);
  const front = (x, y) => { const sl = sil(y); if (!sl || Math.abs(x) >= sl.w) return -9; return (sl.zf + sl.zb) / 2 + ((sl.zf - sl.zb) / 2) * Math.sqrt(1 - (x / sl.w) ** 2); };
  mirror((s) => {
    const ex = Math.sqrt(Math.max(0, 1 - ((1.715 - C.c.y) / C.r[1]) ** 2)) * C.r[0] * 0.97;
    ha(0, ell(V(s * ex, 1.712, -0.02), [0.008, 0.026, 0.017], null, 10), mix(0.25), 0.3);                                  // ears: low flat folds
    ha(0, ell(V(s * (ex + 0.002), 1.712, -0.014), [0.004, 0.011, 0.007], null, 8), dark, 0.0);
  });

  // ---- eyes: huge glossy wet black almonds with a raised lid rim ----
  const E = d === 1 ? { x: 0.072, y: 1.745, rx: 0.07, ry: 0.047, dp: 0.02, yaw: 0.5, tilt: 0.3 }
    : d === 2 ? { x: 0.075, y: 1.77, rx: 0.078, ry: 0.052, dp: 0.021, yaw: 0.62, tilt: 0.36 }
      : { x: 0.066, y: 1.73, rx: 0.052, ry: 0.054, dp: 0.017, yaw: 0.5, tilt: 0.1 };
  mirror((s) => {
    const zf = front(s * E.x, E.y);
    const rot = new THREE.Euler(0.12, s * E.yaw, s * E.tilt, 'YXZ'), M = new THREE.Matrix4().makeRotationFromEuler(rot);
    const place = (g, dz) => { g.applyMatrix4(M); g.translate(s * E.x, E.y, zf + dz); return g; };
    ha(0, place(almond(E.rx * 1.1, E.ry * 1.13, 0.004), -0.004), mix(0.28), 0.3);                // lid rim, a shade darker and slightly raised
    ha(1, place(almond(E.rx, E.ry, E.dp), -0.002), EYE, 0.0);                                  // the eye
    // little wet highlight beads (bright dots the env lights miss)
    ha(1, place(ell(V(-E.rx * 0.3, E.ry * 0.42, E.dp * 0.82), [0.0075, 0.0045, 0.003], null, 8), 0), 0xf2f6ff, 0.0);
    ha(1, place(ell(V(E.rx * 0.35, -E.ry * 0.38, E.dp * 0.7), [0.004, 0.0025, 0.002], null, 6), 0), 0xcfd8ee, 0.0);
  });
  // A flat, smooth face: no folds or ridges. The nose is two black dots, the mouth one small horizontal slit.
  const ny = d === 2 ? 1.676 : 1.678;
  for (const sx of [-1, 1]) ha(0, ell(V(sx * 0.009, ny, front(sx * 0.009, ny) - 0.001), [0.0062, 0.0078, 0.002], null, 8), dark, 0.0);
  const my = d === 2 ? 1.628 : 1.63;
  ha(0, ell(V(0, my + 0.006, front(0, my + 0.006) - 0.0008), [0.0135, 0.0016, 0.0025], null, 10), dark, 0.0);

  const sm = kit.finish();
  return sm;
}

// Keeps only the triangles of a skinned mesh whose strongest bone matches `re`, and bakes the skin colour in.
function keepBones(mesh, re, tone) {
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  const names = mesh.skeleton.bones.map((b) => boneKey(b.name));
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, n = si.count;
  const keep = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
    keep[i] = re.test(names[best] || '') ? 1 : 0;
  }
  const tri = [];
  for (let t = 0; t < n; t += 3) if (keep[t] + keep[t + 1] + keep[t + 2] >= 2) tri.push(t);
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(g.attributes)) {
    const sz = attr.itemSize, arr = new (attr.array.constructor)(tri.length * 3 * sz);
    let j = 0;
    for (const t of tri) for (let v = 0; v < 3; v++) for (let c = 0; c < sz; c++) arr[j++] = attr.array[(t + v) * sz + c];
    out.setAttribute(name, new THREE.BufferAttribute(arr, sz));
  }
  const col = new Float32Array(tri.length * 9);
  for (let i = 0; i < tri.length * 3; i++) { const k = 0.82 + 0.18 * Math.min(1, Math.max(0, (out.attributes.normal ? out.attributes.normal.getY(i) : 0) * 0.5 + 0.5)); col[i * 3] = tone.r * k; col[i * 3 + 1] = tone.g * k; col[i * 3 + 2] = tone.b * k; }
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  mesh.geometry = out;
}

// Long thin fingers: stretch each hand outward from the wrist along the arm and slim it across.
function stretchHands(mesh, kit) {
  const p = mesh.geometry.attributes.position, wl = kit.byKey.get('LeftHand').getWorldPosition(V(0, 0, 0)), wr = kit.byKey.get('RightHand').getWorldPosition(V(0, 0, 0));
  mesh.updateWorldMatrix(true, false);
  const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert(), a = wl.clone().applyMatrix4(inv), b = wr.clone().applyMatrix4(inv), v = V(0, 0, 0);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const w = Math.abs(v.x - a.x) < Math.abs(v.x - b.x) ? a : b, dir = w.x >= 0 ? 1 : -1;
    const d = (v.x - w.x) * dir;
    if (d < 0.004) continue;
    p.setXYZ(i, w.x + dir * (d * 1.55), w.y + (v.y - w.y) * 0.82, w.z + (v.z - w.z) * 0.82);
  }
  p.needsUpdate = true; mesh.geometry.computeBoundingSphere();
}

// ---------------------------------------------------------------------------------------------------------------------
// The new Visitor (Nutty 2026-11-14): the sinewy Mixamo body #10 (m10.glb) in medium grey with huge wet black alien eyes.
// The body's own scanned texture is turned to grey once (its detail kept, its red gone) and the two eyes, shaped in Blender to
// lie on the skull and wrap round its sides, are hung on the head bone. Used by the hero, the Crash Site boss and its echo.
const ALIEN_EYE = { headZ: 1.556, top: 1.767, x: 0.053, h: 0.45, w: 0.047, t: 0.034, tilt: 0.55 }; // metres on the 1.77 m body: centre off the nose line, height up the head (0 = head bone, 1 = crown), half length, half height, slant
const _greyTex = new WeakMap();
function greyTexture(src) {
  if (_greyTex.has(src)) return _greyTex.get(src);
  let out = src;
  try {
    const im = src.image, w = im.width, h = im.height, c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h), p = d.data;
    for (let i = 0; i < p.length; i += 4) { const l = 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2], k = Math.max(0, Math.min(1, (l - 38) / 141)), g = 74 + 76 * k; p[i] = g; p[i + 1] = g; p[i + 2] = g + 2; }
    x.putImageData(d, 0, 0);
    out = new THREE.CanvasTexture(c); out.flipY = src.flipY; out.colorSpace = src.colorSpace; out.wrapS = src.wrapS; out.wrapT = src.wrapT; out.anisotropy = src.anisotropy; out.channel = src.channel;
  } catch (e) { console.warn('grey texture failed', e); }
  _greyTex.set(src, out); return out;
}
let _eyeMat = null;
export function buildAlien(scene) {
  scene.updateMatrixWorld(true);
  scene.traverse((o) => { if (!o.isMesh) return; const conv = (m) => { const n = m.clone(); if (n.map) n.map = greyTexture(n.map); else n.color.set(0x8a8d92); if (n.emissiveMap || n.emissive) n.emissive.set(0); n.needsUpdate = true; return n; };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material); });
  let head = null; scene.traverse((o) => { if (o.isBone && boneKey(o.name) === 'Head') head = o; });
  if (!head) return;
  const hp = head.getWorldPosition(new THREE.Vector3()), k = 1;
  _eyeMat = _eyeMat || new THREE.MeshPhysicalMaterial({ color: 0x020203, roughness: 0.1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -60 }); // drawn a hair nearer than the skin, so no grey pokes through the lens
  // The face under the eyes, as plain triangles in the pose the body is built in, so each lens can be laid exactly on the skin.
  const U = hp.y / ALIEN_EYE.headZ, tri = [], v = new THREE.Vector3();
  scene.traverse((o) => { if (!o.isSkinnedMesh) return; const P = o.geometry.attributes.position, ix = o.geometry.index, n = ix ? ix.count : P.count, w = [];
    for (let i = 0; i < P.count; i++) { o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld); w.push(v.x, v.y, v.z); }
    for (let i = 0; i < n; i += 3) { const a = ix ? ix.getX(i) : i, b = ix ? ix.getX(i + 1) : i + 1, c = ix ? ix.getX(i + 2) : i + 2;
      if (w[a * 3 + 1] < hp.y || w[a * 3 + 2] < hp.z - 0.02 * U) continue; tri.push(w[a * 3], w[a * 3 + 1], w[a * 3 + 2], w[b * 3], w[b * 3 + 1], w[b * 3 + 2], w[c * 3], w[c * 3 + 1], w[c * 3 + 2]); } });
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tri), 3));
  const face = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })), rc = new THREE.Raycaster(), O = new THREE.Vector3(), D = new THREE.Vector3();
  // Each eye is a big slanted almond drawn straight onto the face: every point is found on the skin itself and lifted a hair (more toward
  // the middle, for the wet bulge), so the lens follows the brow and cheek and no skin can show through it. (Nutty's approved look, 2026-11-14.)
  const E = ALIEN_EYE, NS = 20, NT = 8, az = hp.z + 0.03 * U, top = hp.y + (ALIEN_EYE.top - ALIEN_EYE.headZ) * U;
  for (const sg of [-1, 1]) {
    const pos = [], idx = [], yc = hp.y + (top - hp.y) * E.h;
    rc.set(O.set(hp.x + sg * E.x * U, yc, az + 0.5 * U), D.set(0, 0, -1)); const h0 = rc.intersectObject(face, false)[0]; if (!h0) continue;
    const R = Math.hypot(h0.point.x - hp.x, h0.point.z - az), th0 = Math.atan2(h0.point.x - hp.x, h0.point.z - az), ct = Math.cos(E.tilt), st = Math.sin(E.tilt);
    for (let a = 0; a <= NS; a++) for (let b = 0; b <= NT; b++) {
      const s = Math.sin((a / NS - 0.5) * Math.PI), t = (b / NT) * 2 - 1, w = Math.pow(1 - s * s, 0.62); // even rows at the two tips, where the lens narrows
      const ex = E.w * U * s, ey = E.t * U * w * t, du = ex * ct - ey * st, dv = ex * st + ey * ct, th = th0 + sg * du / R;
      D.set(Math.sin(th), 0, Math.cos(th)); O.set(hp.x, yc + dv, az).addScaledVector(D, 0.5 * U); rc.set(O, D.negate()); const h = rc.intersectObject(face, false)[0];
      const c = (0.0025 + 0.011 * w * (1 - t * t)) * U; if (h) pos.push(h.point.x - D.x * c, h.point.y, h.point.z - D.z * c); else pos.push(hp.x - D.x * (R + c), yc + dv, az - D.z * (R + c));
    }
    for (let a = 0; a < NS; a++) for (let b = 0; b < NT; b++) { const p0 = a * (NT + 1) + b, p1 = p0 + NT + 1; if (sg > 0) idx.push(p0, p1, p0 + 1, p1, p1 + 1, p0 + 1); else idx.push(p0, p0 + 1, p1, p1, p0 + 1, p1 + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, _eyeMat); m.name = 'alienEye'; scene.add(m); head.attach(m);
  }
}
