// Loads the binary game assets (character and weapon glTF files) once at boot.
// They ship as glTF JSON with the geometry buffer base64-inlined and textures
// as separate image files, so any static host serves them. The JSON is
// repacked into an in-memory GLB before parsing, so no data: or blob: URL is
// ever fetched (strict content security policies block those).
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadScan } from './scan.js';

const cache = new Map();
export const ASSET_FILES = ['veteran.glb', 'xbot.glb', 'clown.glb', 'soldier.glb', 'michelle.glb', 'sorceress.glb', 'skull.glb', 'blitz.glb', 'warlord.glb', 'archmage.glb', 'flayed.glb', 'rotgut.glb', 'king.glb', 'aldric.glb', 'ragmon.glb', 'gus.glb', 'surgeon.glb', 'kratia.glb', 'selena.glb', 'kiri.glb', 'm12.glb', 'm13.glb', 'm16.glb', 'm17.glb', 'm21.glb', 'm04.glb', 'm07.glb', 'm14.glb', 'm11.glb', 'm10.glb', 'm19.glb', 'm03.glb', 'm05.glb', 'm23.glb', 'm06.glb', 'm18.glb', 'm29.glb', 'm43.glb', 'm40.glb'];

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// glTF JSON with one inlined buffer -> GLB ArrayBuffer.
export function toGLB(json) {
  let bin = new Uint8Array(0);
  if (json.buffers && json.buffers.length) {
    const uri = json.buffers[0].uri || '';
    const i = uri.indexOf('base64,');
    if (i >= 0) { bin = b64ToBytes(uri.slice(i + 7)); delete json.buffers[0].uri; }
  }
  const enc = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = Math.ceil(enc.length / 4) * 4, binLen = Math.ceil(bin.length / 4) * 4;
  const total = 12 + 8 + jsonLen + (bin.length ? 8 + binLen : 0);
  const buf = new ArrayBuffer(total), dv = new DataView(buf), u8 = new Uint8Array(buf);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true); dv.setUint32(16, 0x4e4f534a, true);
  u8.set(enc, 20); for (let k = enc.length; k < jsonLen; k++) u8[20 + k] = 0x20;
  if (bin.length) {
    const o = 20 + jsonLen;
    dv.setUint32(o, binLen, true); dv.setUint32(o + 4, 0x004e4942, true);
    u8.set(bin, o + 8);
  }
  return buf;
}

// What the menus need (the playable characters and the weapon models) loads before the title screen. Everything else (enemies and
// bosses, about two thirds of the download) streams in behind the menu, a few files at a time, and a run waits for it only if it must.
const FIRST = new Set(['m10.glb', 'veteran.glb', 'xbot.glb', 'soldier.glb', 'michelle.glb', 'sorceress.glb', 'skull.glb', 'blitz.glb', 'aldric.glb', 'ragmon.glb', 'kratia.glb', 'selena.glb', 'kiri.glb']);
let restDone = false, restP = Promise.resolve();
export const assetsReady = () => restDone;
export const whenAssets = () => restP;

async function loadOne(loader, f) {
  try {
    const res = await fetch('assets/' + f.replace(/\.glb$/, '.json'));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const glb = toGLB(await res.json());
    cache.set(f, await loader.parseAsync(glb, 'assets/'));
  } catch (e) {
    console.warn('asset failed', f, e);
  }
}

export async function loadAssets(onProgress) {
  const loader = new GLTFLoader();
  const first = ASSET_FILES.filter((f) => FIRST.has(f)), rest = ASSET_FILES.filter((f) => !FIRST.has(f));
  let done = 0;
  const scanP = loadScan();
  await Promise.all(first.map(async (f) => { await loadOne(loader, f); done++; if (onProgress) onProgress(done / first.length, f); }));
  await scanP;
  restP = (async () => {
    const queue = [...rest];
    const lane = async () => { while (queue.length) { await loadOne(loader, queue.shift()); await new Promise((r) => setTimeout(r, 90)); } }; // a breath between files keeps the menu smooth
    await Promise.all([lane(), lane()]);
    restDone = true;
  })();
}

export function assetGLTF(file) { return cache.get(file) || null; }
