// Horde Mode's four market stalls (Nutty 2026-11-14): Weapons (melee), Guns, Elements and Gear. Each is a timber stall with a
// striped canvas awning in its own colour, a painted banner with the shop's name and symbol, goods on the counter and its own
// keeper standing behind it. The stalls are spread round the map and marked on the minimap with a shopping cart in the shop's colour.
import * as THREE from 'three';
import * as TX from './textures.js';
import { HORDE } from './data.js';
import { makeCharacterModel } from './characters.js';
import { makeHumanoid } from './models.js';
import { makeWeapon } from './weapons.js';

// The four symbols (24 x 24 paths): used on the banners, the minimap and the shop window.
const cog = () => {
  let d = '';
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 0.5) / 16) * Math.PI * 2, r = i % 2 ? 7.2 : 10.2;
    for (const a of [a0, a1]) d += (d ? 'L' : 'M') + (12 + Math.cos(a) * r).toFixed(2) + ' ' + (12 + Math.sin(a) * r).toFixed(2);
  }
  return d + 'ZM15.4 12A3.4 3.4 0 1 0 8.6 12A3.4 3.4 0 1 0 15.4 12Z';
};
export const SHOP_ICON = {
  melee: 'M20.5 2.5L21.5 3.5L21 7L11.6 16.4L13.4 18.2L12 19.6L9.6 17.2L6.6 20.2L7 21.6L5.6 23L1 18.4L2.4 17L3.8 17.4L6.8 14.4L4.4 12L5.8 10.6L7.6 12.4L17 3Z',
  gun: 'M2 6.5H19.5V5.5H21V6.5H22.5V10.5H13.2L12.4 12.6H9.6L8.2 19.5H3.4L5.2 12.6H2Z',
  elem: 'M12.4 1.5C13.4 5.6 18.6 8 18.6 14A6.6 6.6 0 0 1 5.4 14C5.4 11.4 6.6 9.8 8 8.4C8.2 10.6 9.2 11.6 10.2 11.9C9.8 8 10.6 4.4 12.4 1.5Z',
  gear: cog(),
  cart: 'M1.5 3H5L7.6 13.5H18L20.5 6H6.2M9 17.5A1.6 1.6 0 1 0 9 20.7A1.6 1.6 0 1 0 9 17.5ZM17 17.5A1.6 1.6 0 1 0 17 20.7A1.6 1.6 0 1 0 17 17.5Z',
};
export const shopSvg = (id, color = 'currentColor') => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${SHOP_ICON[id]}" fill="${id === 'cart' ? 'none' : color}" ${id === 'cart' ? `stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"` : ''} fill-rule="evenodd"/></svg>`;

const KEEPER = { melee: ['keepMelee', 'sword'], gun: ['keepGun', 'ak'], elem: ['keepElem', null], gear: ['keepGear', null] }; // bodies: characters.js KEEPER_DEFS
const GOODS = { melee: ['katana', 'axe', 'warhammer'], gun: ['ak', 'shotgun', 'magnum'] };

function grainNoise(x, w, h, a) {
  const d = x.getImageData(0, 0, w, h), p = d.data;
  for (let i = 0; i < p.length; i += 4) { const n = (Math.random() - 0.5) * a; p[i] += n; p[i + 1] += n; p[i + 2] += n; }
  x.putImageData(d, 0, 0);
}
// Striped awning canvas: the shop's colour and off-white, weathered, with a weave you can see up close.
function awningTex(color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#e9e1cf' : color; x.fillRect(i * 32, 0, 32, 256); }
  x.globalAlpha = 0.16; x.fillStyle = '#000';
  for (let i = 0; i < 128; i++) x.fillRect(0, i * 2, 256, 1);
  x.globalAlpha = 0.22;
  for (let i = 0; i < 40; i++) { x.fillStyle = Math.random() < 0.5 ? '#3a2a1a' : '#fff'; x.beginPath(); x.ellipse(Math.random() * 256, Math.random() * 256, 6 + Math.random() * 30, 3 + Math.random() * 12, Math.random() * 3, 0, 7); x.fill(); }
  x.globalAlpha = 1;
  grainNoise(x, 256, 256, 26);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
// The banner: a dark timber board with the symbol and the shop's name painted on it in the shop's colour.
function bannerTex(shop) {
  const c = document.createElement('canvas'); c.width = 768; c.height = 192;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 192); g.addColorStop(0, '#4a3220'); g.addColorStop(1, '#2c1c10');
  x.fillStyle = g; x.fillRect(0, 0, 768, 192);
  x.globalAlpha = 0.35;
  for (let i = 0; i < 90; i++) { x.strokeStyle = Math.random() < 0.5 ? '#1a0f08' : '#6a4a2c'; x.lineWidth = 1 + Math.random() * 2; const y = Math.random() * 192; x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(250, y + (Math.random() - 0.5) * 14, 500, y + (Math.random() - 0.5) * 14, 768, y + (Math.random() - 0.5) * 10); x.stroke(); }
  x.globalAlpha = 1;
  x.strokeStyle = shop.color; x.lineWidth = 8; x.strokeRect(10, 10, 748, 172);
  x.font = '900 104px Georgia, "Times New Roman", serif'; x.textBaseline = 'middle';
  const label = shop.name.toUpperCase(), tw = x.measureText(label).width, iw = 120, gap = 26, x0 = (768 - (iw + gap + tw)) / 2;
  x.save(); x.translate(x0, 36); x.scale(5, 5);
  x.fillStyle = shop.color; x.shadowColor = 'rgba(0,0,0,.7)'; x.shadowBlur = 2; x.fill(new Path2D(SHOP_ICON[shop.id]), 'evenodd');
  x.restore();
  x.shadowColor = 'rgba(0,0,0,.8)'; x.shadowBlur = 8; x.shadowOffsetY = 3;
  x.fillStyle = '#f4ead2'; x.fillText(label, x0 + iw + gap, 100);
  x.shadowColor = 'transparent';
  grainNoise(x, 768, 192, 18);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function box(mat, w, h, d, x, y, z, parent, ry = 0, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, 0); m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}

function buildStall(shop) {
  const g = new THREE.Group();
  const cm = TX.crateMaps(), bk = TX.barkMaps([0.3, 0.22, 0.14]);
  const wood = new THREE.MeshStandardMaterial({ map: cm.map, normalMap: cm.normalMap, roughness: 0.8, color: 0xb89a78 });
  const post = new THREE.MeshStandardMaterial({ map: bk.map, normalMap: bk.normalMap, roughness: 0.9 });
  const canvas = new THREE.MeshStandardMaterial({ map: awningTex(shop.color), roughness: 0.95, side: THREE.DoubleSide });
  const board = new THREE.MeshStandardMaterial({ map: bannerTex(shop), roughness: 0.75 });
  // Four posts, sunk a metre so a slope never leaves one hanging; the front pair is taller, so the awning sheds rain to the back.
  for (const [px, pz, h] of [[-1.9, 1.15, 3.2], [1.9, 1.15, 3.2], [-1.9, -1.15, 2.7], [1.9, -1.15, 2.7]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, h + 1, 8), post);
    p.position.set(px, (h - 1) / 2, pz); p.castShadow = true; g.add(p);
  }
  // Counter across the front, shelves across the back, a crate and a barrel at the side.
  box(wood, 3.9, 0.12, 0.85, 0, 1.0, 1.0, g);
  box(wood, 3.7, 0.94, 0.12, 0, 0.47, 1.34, g);
  box(wood, 0.12, 0.94, 0.7, -1.8, 0.47, 1.0, g); box(wood, 0.12, 0.94, 0.7, 1.8, 0.47, 1.0, g);
  box(wood, 3.7, 0.08, 0.5, 0, 1.25, -1.0, g); box(wood, 3.7, 0.08, 0.5, 0, 1.95, -1.0, g); box(wood, 3.7, 2.3, 0.06, 0, 1.15, -1.24, g);
  box(wood, 0.8, 0.8, 0.8, 2.75, 0.4, 0.5, g, 0.3); box(wood, 0.6, 0.6, 0.6, 2.7, 1.1, 0.45, g, -0.2);
  { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.32, 0.95, 14), wood); b.position.set(-2.75, 0.47, 0.4); b.castShadow = true; b.receiveShadow = true; g.add(b); }
  // Awning: a sloped sheet with a hanging front valance.
  { const a = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.04, 3.1), canvas); a.position.set(0, 2.98, 0); a.rotation.x = Math.atan2(0.5, 2.3); a.castShadow = true; a.receiveShadow = true; g.add(a);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 0.42, 9, 1), canvas);
    const pa = v.geometry.attributes.position; for (let i = 0; i < pa.count; i++) if (pa.getY(i) < 0) pa.setY(i, pa.getY(i) - (i % 2 ? 0.14 : 0));
    v.geometry.computeVertexNormals(); v.position.set(0, 3.08, 1.56); v.castShadow = true; g.add(v); }
  // Banner over the front, readable from both sides.
  { const b = box(board, 3.4, 0.85, 0.07, 0, 3.95, 1.2, g); b.material = [wood, wood, wood, wood, board, board];
    for (const sx of [-1.9, 1.9]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.3, 6), post); p.position.set(sx, 3.75, 1.15); p.castShadow = true; g.add(p); }
    box(post, 3.9, 0.08, 0.08, 0, 4.4, 1.15, g); }
  // Goods.
  const put = (o, x, y, z, ry, rz = 0, s = 1) => { o.position.set(x, y, z); o.rotation.set(0, ry, rz); o.scale.setScalar(s); o.traverse((q) => { if (q.isMesh) q.castShadow = true; }); g.add(o); };
  if (GOODS[shop.id]) {
    GOODS[shop.id].forEach((id, i) => { try { put(makeWeapon(id), -1.2 + i * 1.2, 1.1, 1.0, 0.4 + i * 0.5, Math.PI / 2); } catch {} });
    GOODS[shop.id].forEach((id, i) => { try { put(makeWeapon(id), -1.2 + i * 1.2, 1.36, -1.0, Math.PI / 2, Math.PI / 2); } catch {} });
  } else if (shop.id === 'elem') {
    // Stoppered flasks, one for each element, each with its own glow.
    const cols = [0xff7a2a, 0xd9a25a, 0xb57bff, 0x3f86ff, 0xdfe4ea, 0x9be36a];
    const glass = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.7, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.85 });
    const cork = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.9 });
    cols.forEach((c, i) => {
      for (const [y, z, k] of [[1.06, 1.0, 1], [1.29, -1.0, 0.8], [1.99, -1.0, 0.8]]) {
        const f = new THREE.Group();
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), glass(c)); body.position.y = 0.17; body.scale.y = 0.9; f.add(body);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.16, 10), glass(c)); neck.position.y = 0.38; f.add(neck);
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.07, 8), cork); st.position.y = 0.49; f.add(st);
        put(f, -1.5 + i * 0.6 + (z < 0 ? 0.1 : 0), y, z, i, 0, k);
      }
    });
  } else {
    // Gear: strapped packs, a coil of line and tool boxes.
    const iron = new THREE.MeshStandardMaterial({ color: 0x4a4e56, roughness: 0.4, metalness: 0.85 });
    const strap = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.85 });
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Group();
      for (const sx of [-0.13, 0.13]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.55, 12), iron); t.position.set(sx, 0.3, 0); p.add(t); const n = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 12), iron); n.position.set(sx, 0.02, 0); n.rotation.x = Math.PI; p.add(n); }
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.24), strap); s.position.y = 0.34; p.add(s);
      put(p, -1.2 + i * 1.2, 1.12, 1.0, 0.3 * i);
    }
    for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 18), strap); t.rotation.x = Math.PI / 2; t.position.set(-1.4 + i * 0.9, 1.34, -1.0); t.castShadow = true; g.add(t); }
    for (let i = 0; i < 3; i++) box(iron, 0.5, 0.3, 0.32, -1.1 + i * 1.1, 2.14, -1.0, g, 0.1 * i);
  }
  return g;
}

// Build the four stalls for this map and stand their keepers behind the counters. Returns [{ shop, x, y, z, yaw, group, npc }].
export function buildStalls(game) {
  const w = game.world, out = [];
  const base = Math.atan2(w.spawn.z, w.spawn.x);
  HORDE.shops.forEach((shop, i) => {
    // Two near the camp, two across the map, never on water, in a building or on a steep bank.
    const ang = base + [0.85, -0.85, 2.3, -2.3][i];
    let best = null;
    for (let ring = 0; ring < 40 && !best; ring++) {
      for (let k = 0; k < 10; k++) {
        const R = 92 + (ring ? (Math.random() - 0.5) * (10 + ring * 3) : 0), a = ang + (ring ? (Math.random() - 0.5) * (0.1 + ring * 0.03) : 0);
        const x = Math.cos(a) * R, z = Math.sin(a) * R;
        if (!w.clearOf(x, z, 6) || w.blocked(x, z, 4.5)) continue;
        if (w.platsAt && (w.platsAt(x, z) || []).length) continue;
        const y = w.heightAt(x, z);
        let steep = 0; for (const [dx, dz] of [[3, 0], [-3, 0], [0, 2.5], [0, -2.5]]) steep = Math.max(steep, Math.abs(w.heightAt(x + dx, z + dz) - y));
        if (steep > 0.7) continue;
        best = { x, y, z }; break;
      }
    }
    if (!best) { const x = Math.cos(ang) * 60, z = Math.sin(ang) * 60; best = { x, y: w.heightAt(x, z), z }; }
    const yaw = Math.atan2(-best.x, -best.z); // the counter faces the middle of the map
    const group = buildStall(shop);
    group.position.set(best.x, best.y, best.z); group.rotation.y = yaw;
    w.group.add(group);
    // The counter and the shelves are solid; the space between is the keeper's.
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    for (const s of [-1.3, 0, 1.3]) { w.addCollider(best.x + fx * 1.05 + rx * s, best.z + fz * 1.05 + rz * s, 0.75, best.y + 1.1); w.addCollider(best.x - fx * 1.1 + rx * s, best.z - fz * 1.1 + rz * s, 0.7, best.y + 2.3); }
    let npc = null;
    try {
      const [ch, wp] = KEEPER[shop.id];
      npc = makeCharacterModel(ch, () => makeHumanoid({ color: shop.hex, accent: 0xffffff }));
      npc.position.set(best.x, best.y, best.z); npc.rotation.y = yaw;
      if (wp && npc.userData.setWeapon) npc.userData.setWeapon(wp); // no weapon: arms hang relaxed (not the bare-fist guard)
      npc.userData.armed = !!wp;
      w.group.add(npc);
    } catch (e) { console.warn('stall keeper failed', e); }
    out.push({ shop, x: best.x, y: best.y, z: best.z, yaw, group, npc });
  });
  return out;
}

// Keepers breathe and shift their weight while someone is close enough to see it.
export function updateStalls(stalls, p, dt, t) {
  for (const s of stalls || []) {
    if (!s.npc || !s.npc.userData.anim || Math.hypot(s.x - p.pos.x, s.z - p.pos.z) > 70) continue;
    try { s.npc.userData.anim({ speed: 0, pitch: 0, gun: false, weapon: !!s.npc.userData.armed, melee: 0, move: 0, alive: true }, dt, t); } catch {}
  }
}
