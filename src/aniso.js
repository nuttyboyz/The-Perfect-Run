// How many samples the card will filter a texture with when it is seen at a grazing angle. Game sets it from
// the renderer at boot (16 on anything modern), where every texture used to be built at a flat 8 or 4 and the
// ground smeared into mush a few metres ahead of the player. Textures made before that are brought up to it too.
export const ANISO = { v: 8 };
const made = new Set();
export function track(t) { made.add(t); return t; }
export function setAniso(n) {
  ANISO.v = n;
  for (const t of made) { t.anisotropy = n; t.needsUpdate = true; }
}
