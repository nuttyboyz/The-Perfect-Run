// Modern firearms for the weapon wall: polymer, aluminium and steel, rails, optics. No wood anywhere.
// Same conventions as weapons.js: origin at the right hand's grip, +Z down the barrel, +Y up, metres.
// `H` carries the builders from weapons.js so both files share one set of materials.
export function modernGuns(H) {
  const { THREE, mats, slab, cyl, at, BX, CY, guard, rod, railTeeth, sweep } = H;

  // ---------- shared pieces ----------
  // Pistol grip (polymer with a rubber overmould): top edge at (z, 0), angled back like a modern AR grip.
  const pgrip = (P, m, z = -0.03, h = 0.112, w = 0.034) => {
    P.push([slab([[z, 0.0], [z + 0.03, 0.0], [z + 0.012, -h], [z - 0.024, -h - 0.006], [z - 0.035, -h + 0.02]], w, 0.007), m.rubber]);
    P.push([BX(w - 0.012, 0.006, 0.028, 0, -h - 0.004, z - 0.006), m.polymer]); // grip floor
  };
  const trig = (P, m, z = 0.012, y = -0.012) => P.push([BX(0.006, 0.024, 0.008, 0, y, z), m.steel]);
  // M-LOK slots: dark recessed slots down a face at x (sign), y, from z0 to z1.
  const mlok = (P, m, x, y, z0, z1, step = 0.034, h = 0.011, len = 0.024) => {
    for (let z = z0; z + len <= z1; z += step) P.push([BX(0.0012, h, len, x, y, z + len / 2), m.slot]);
  };
  const mlokDown = (P, m, y, z0, z1, step = 0.034, w = 0.011, len = 0.024) => {
    for (let z = z0; z + len <= z1; z += step) P.push([BX(w, 0.0012, len, 0, y, z + len / 2), m.slot]);
  };
  // Slim free-float handguard: box section with slots on three faces and a top rail.
  const handguard = (P, m, z0, z1, y0, y1, w, mat) => {
    P.push([slab([[z0, y0], [z1, y0], [z1, y1], [z0, y1]], w, 0.004), mat || m.anod]);
    mlok(P, m, w / 2 + 0.0004, (y0 + y1) / 2, z0 + 0.02, z1 - 0.015);
    mlok(P, m, -w / 2 - 0.0004, (y0 + y1) / 2, z0 + 0.02, z1 - 0.015);
    mlokDown(P, m, y0 - 0.0004, z0 + 0.02, z1 - 0.015);
    for (const g of railTeeth(z0 + 0.01, z1 - 0.01, y1 + 0.003, w - 0.004)) P.push([g, mat || m.anod]);
  };
  // Polymer magazine (PMAG style): slightly curved, ribbed, with a baseplate.
  const pmag = (P, m, z, h, curve = 0.02, w = 0.03) => {
    P.push([slab([[z, 0.0], [z + 0.05, 0.0], [z + 0.05 + curve, -h], [z + curve, -h - 0.004]], w, 0.004), m.polymer]);
    P.push([slab([[z - 0.003, -h + 0.004], [z + 0.057 + curve, -h + 0.004], [z + 0.057 + curve, -h - 0.014], [z - 0.003 + curve, -h - 0.014]], w + 0.004, 0.003), m.polymer]); // baseplate
    for (let i = 1; i < 4; i++) { const y = -h * (i / 4), zz = z + curve * (i / 4); P.push([BX(w + 0.0012, 0.004, 0.034, 0, y, zz + 0.025), m.slot]); } // rib lines
  };
  // Straight steel box magazine.
  const boxmag = (P, m, z, h, w = 0.03, d = 0.05) => {
    P.push([BX(w, h, d, 0, -h / 2, z + d / 2), m.gunmetal]);
    P.push([BX(w + 0.004, 0.01, d + 0.006, 0, -h - 0.005, z + d / 2), m.polymer]);
  };
  // Collapsible carbine stock: buffer tube with a sliding polymer stock and a rubber butt pad.
  const m4stock = (P, m, z0, y = 0.035) => {
    P.push([CY(0.0145, 0.2, 0, y, z0 - 0.1, 14), m.anod]); // buffer tube
    P.push([CY(0.025, 0.02, 0, y, z0 - 0.01, 14), m.gunmetal]); // castle nut
    P.push([slab([[z0 - 0.06, y + 0.02], [z0 - 0.22, y + 0.024], [z0 - 0.24, y + 0.016], [z0 - 0.246, y - 0.07], [z0 - 0.22, y - 0.088], [z0 - 0.16, y - 0.05], [z0 - 0.11, y - 0.03], [z0 - 0.06, y - 0.02]], 0.04, 0.006), m.polymer]);
    P.push([slab([[z0 - 0.238, y + 0.02], [z0 - 0.254, y + 0.018], [z0 - 0.258, y - 0.075], [z0 - 0.23, y - 0.092], [z0 - 0.222, y - 0.086]], 0.042, 0.002), m.rubber]); // butt pad
    P.push([BX(0.02, 0.012, 0.02, 0, y - 0.046, z0 - 0.17), m.gunmetal]); // release latch
    P.push([at(new THREE.TorusGeometry(0.006, 0.0018, 6, 12), 0.022, y - 0.02, z0 - 0.2), m.steel]); // QD sling loop
  };
  // An open tube you can look through: outer wall, inner wall and a rim at each end. Every sight tube is built from
  // this, never from a solid cylinder, so the eye can always see down it.
  const tube = (P, mat, rOut, rIn, len, y, z, seg = 20) => {
    const wall = (r, inside) => {
      const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true).rotateX(Math.PI / 2);
      if (inside) {
        const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 1]; ix[i + 1] = t; }
        const n = g.attributes.normal.array; for (let i = 0; i < n.length; i++) n[i] = -n[i];
      }
      return at(g, 0, y, z);
    };
    P.push([wall(rOut, false), mat]); P.push([wall(rIn, true), mat]);
    P.push([at(new THREE.RingGeometry(rIn, rOut, seg), 0, y, z + len / 2), mat]);
    P.push([at(new THREE.RingGeometry(rIn, rOut, seg).rotateY(Math.PI), 0, y, z - len / 2), mat]);
  };
  // Red-dot sight: short open tube on a riser with clear glass front and back and the dot inside.
  const reddot = (P, m, z, y, r = 0.0135, len = 0.05) => {
    P.push([BX(0.026, 0.016, len - 0.004, 0, y + 0.008, z), m.gunmetal]); // riser
    tube(P, m.gunmetal, r, r - 0.0022, len, y + 0.016 + r, z, 20);
    tube(P, m.anod, r + 0.0018, r - 0.0022, 0.006, y + 0.016 + r, z + len / 2 - 0.003, 20);
    P.push([at(new THREE.CircleGeometry(r - 0.002, 18), 0, y + 0.016 + r, z + len / 2 + 0.0005), m.glass]);
    P.push([at(new THREE.CircleGeometry(r - 0.002, 18).rotateY(Math.PI), 0, y + 0.016 + r, z - len / 2 - 0.0005), m.glass]);
    P.push([at(new THREE.SphereGeometry(0.0011, 8, 6), 0, y + 0.016 + r, z + len / 2 - 0.004), m.dot]);
    P.push([BX(0.012, 0.01, 0.012, 0.016, y + 0.018 + r, z), m.gunmetal]); // brightness turret
  };
  // Holographic sight: open square hood with a glass pane and the dot.
  const holo = (P, m, z, y) => {
    P.push([BX(0.032, 0.012, 0.062, 0, y + 0.006, z), m.gunmetal]);
    P.push([BX(0.004, 0.034, 0.05, 0.015, y + 0.028, z), m.gunmetal]); P.push([BX(0.004, 0.034, 0.05, -0.015, y + 0.028, z), m.gunmetal]);
    P.push([BX(0.032, 0.004, 0.05, 0, y + 0.046, z), m.gunmetal]);
    P.push([BX(0.026, 0.028, 0.002, 0, y + 0.028, z + 0.026), m.glass]);
    P.push([at(new THREE.SphereGeometry(0.0012, 8, 6), 0, y + 0.028, z + 0.024), m.dot]);
  };
  // Rifle scope: tube, objective and ocular bells, turrets, two rings on a one-piece mount.
  const scope = (P, m, z, y, len = 0.3, r = 0.016, obj = 0.026) => {
    const yc = y + 0.03 + r;
    P.push([CY(r, len, 0, yc, z, 20), m.gunmetal]);
    P.push([at(cyl(r, obj, len * 0.25, 20), 0, yc, z + len / 2 + len * 0.125), m.gunmetal]);
    P.push([CY(obj, 0.012, 0, yc, z + len / 2 + len * 0.25 + 0.006, 20), m.anod]);
    P.push([at(cyl(obj * 0.85, r, len * 0.16, 20), 0, yc, z - len / 2 - len * 0.08), m.gunmetal]);
    P.push([at(new THREE.CircleGeometry(obj - 0.002, 20), 0, yc, z + len / 2 + len * 0.25 + 0.0125), m.lens]);
    P.push([at(new THREE.CircleGeometry(obj * 0.85 - 0.002, 20).rotateY(Math.PI), 0, yc, z - len / 2 - len * 0.16 - 0.0005), m.lens]);
    P.push([at(new THREE.CylinderGeometry(0.011, 0.011, 0.03, 12), 0, yc + r + 0.012, z), m.gunmetal]); // elevation turret
    P.push([at(new THREE.CylinderGeometry(0.011, 0.011, 0.028, 12).rotateZ(Math.PI / 2), r + 0.012, yc, z, 12), m.gunmetal]); // windage turret
    P.push([at(new THREE.CylinderGeometry(0.009, 0.009, 0.02, 12).rotateZ(Math.PI / 2), -r - 0.008, yc, z, 12), m.gunmetal]); // parallax
    for (const dz of [-0.07, 0.07]) { P.push([CY(r + 0.004, 0.022, 0, yc, z + dz, 20), m.anod]); P.push([BX(0.028, 0.032, 0.022, 0, y + 0.016, z + dz), m.anod]); }
    P.push([BX(0.03, 0.01, 0.2, 0, y + 0.004, z), m.anod]); // one-piece mount base
  };
  // Muzzle brake: fat cylinder with side ports.
  const brake = (P, m, z, y, r = 0.0165, len = 0.07) => {
    P.push([CY(r, len, 0, y, z, 14), m.gunmetal]);
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) P.push([BX(0.004, r * 1.3, 0.012, s * r, y, z - len / 2 + 0.014 + i * 0.02), m.slot]);
    P.push([at(new THREE.CircleGeometry(r * 0.45, 12), 0, y, z + len / 2 + 0.0005), m.slot]); // bore
  };
  // Birdcage flash hider.
  const flash = (P, m, z, y) => {
    P.push([at(cyl(0.011, 0.0125, 0.05, 14), 0, y, z), m.gunmetal]);
    for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; P.push([at(new THREE.BoxGeometry(0.004, 0.012, 0.028).rotateZ(a), Math.cos(a + Math.PI / 2) * 0.0118, y + Math.sin(a + Math.PI / 2) * 0.0118, z + 0.006), m.slot]); }
  };
  // Suppressor can.
  const can = (P, m, z, y, r = 0.021, len = 0.18) => {
    P.push([CY(r, len, 0, y, z, 20), m.gunmetal]);
    P.push([CY(r + 0.0015, 0.008, 0, y, z - len / 2 + 0.004, 20), m.anod]); P.push([CY(r + 0.0015, 0.008, 0, y, z + len / 2 - 0.004, 20), m.anod]);
    P.push([at(new THREE.CircleGeometry(0.006, 12), 0, y, z + len / 2 + 0.0005), m.slot]);
  };
  // Fibre-optic front sight (green) and a plain rear notch.
  const fiberFront = (P, m, z, y, h = 0.012) => { P.push([BX(0.005, h, 0.012, 0, y + h / 2, z), m.gunmetal]); P.push([at(new THREE.SphereGeometry(0.0022, 6, 4), 0, y + h - 0.002, z + 0.005), m.fiber]); };
  const rearNotch = (P, m, z, y, w = 0.018) => { P.push([BX(w, 0.008, 0.01, 0, y + 0.004, z), m.gunmetal]); for (const s of [-1, 1]) P.push([at(new THREE.SphereGeometry(0.0016, 6, 4), s * 0.0045, y + 0.0065, z + 0.005), m.fiber]); };
  // Receiver pins / screws across X.
  const pin = (P, m, y, z, w = 0.04, r = 0.0035) => P.push([at(new THREE.CylinderGeometry(r, r, w, 10).rotateZ(Math.PI / 2), 0, y, z), m.steel]);
  // Dark ejection port on the right side (x negative is the gun's right when the barrel points +Z... keep it consistent with weapons.js).
  const eject = (P, m, x, y, z, h = 0.02, len = 0.05) => P.push([BX(0.0012, h, len, x, y, z), m.slot]);
  const foldBipod = (P, m, y, z) => { for (const s of [-1, 1]) { P.push([rod([s * 0.022, y, z], [s * 0.022, y, z + 0.2], 0.0045, 8), m.anod]); P.push([BX(0.012, 0.012, 0.03, s * 0.022, y, z + 0.015), m.gunmetal]); } P.push([BX(0.06, 0.018, 0.03, 0, y + 0.006, z), m.gunmetal]); };

  return {
    // Striker-fired polymer service pistol: squared slide with front and rear serrations, accessory rail, stippled grip.
    pistol() {
      const m = mats(), P = [];
      P.push([slab([[-0.045, 0.02], [0.17, 0.02], [0.178, 0.03], [0.178, 0.05], [0.168, 0.056], [-0.04, 0.056], [-0.048, 0.044]], 0.03, 0.003), m.gunmetal]); // slide
      P.push([BX(0.02, 0.004, 0.21, 0, 0.0575, 0.064), m.gunmetal]); // slide top flat
      for (let i = 0; i < 6; i++) P.push([BX(0.032, 0.03, 0.0018, 0, 0.04, -0.034 + i * 0.0065), m.slot]); // rear serrations
      for (let i = 0; i < 4; i++) P.push([BX(0.032, 0.026, 0.0018, 0, 0.04, 0.12 + i * 0.0065), m.slot]); // front serrations
      eject(P, m, -0.0156, 0.045, 0.07, 0.016, 0.05);
      P.push([slab([[-0.04, -0.006], [0.165, -0.006], [0.165, 0.021], [-0.045, 0.021]], 0.028, 0.004), m.polymer]); // frame
      for (const g of railTeeth(0.085, 0.16, -0.009, 0.02)) P.push([g, m.polymer]); // accessory rail
      P.push([slab([[-0.04, 0.0], [0.012, 0.0], [-0.002, -0.108], [-0.05, -0.116], [-0.064, -0.09]], 0.032, 0.006), m.rubber]); // grip
      for (let i = 0; i < 3; i++) P.push([BX(0.033, 0.003, 0.03, 0, -0.03 - i * 0.022, -0.032 - i * 0.004), m.polymer]); // finger grooves
      P.push([BX(0.03, 0.012, 0.052, 0, -0.118, -0.028, -0.12), m.polymer]); // extended mag base
      P.push([guard(0.0, 0.062, 0.0, 0.036), m.polymer]);
      trig(P, m, 0.014, -0.014);
      P.push([CY(0.0075, 0.02, 0, 0.038, 0.182, 12), m.steel]); // barrel at the muzzle
      P.push([at(new THREE.CircleGeometry(0.0045, 10), 0, 0.038, 0.1925), m.slot]);
      fiberFront(P, m, 0.16, 0.0575, 0.008); rearNotch(P, m, -0.03, 0.0575, 0.016);
      P.push([BX(0.012, 0.006, 0.012, 0.0165, -0.012, -0.012), m.polymer]); // mag release
      P.push([BX(0.012, 0.004, 0.018, -0.016, 0.006, -0.02), m.steel]); // slide stop
      pin(P, m, 0.008, 0.04, 0.03, 0.0025); pin(P, m, 0.012, -0.03, 0.03, 0.0025);
      return { parts: P, muzzle: [0, 0.038, 0.195], support: null, pistol: true };
    },
    // Tactical revolver: matte frame with a full-length rail shroud, fluted cylinder, rubber grip, fibre-optic sights.
    revolver() {
      const m = mats(), P = [];
      P.push([slab([[0.055, 0.016], [0.225, 0.016], [0.235, 0.03], [0.235, 0.058], [0.225, 0.064], [0.055, 0.064]], 0.03, 0.004), m.gunmetal]); // barrel shroud
      P.push([CY(0.0085, 0.02, 0, 0.044, 0.242, 12), m.steel]); P.push([at(new THREE.CircleGeometry(0.0045, 10), 0, 0.044, 0.2525), m.slot]); // muzzle
      for (const g of railTeeth(0.08, 0.22, 0.067, 0.022)) P.push([g, m.gunmetal]); // top rail
      for (const g of railTeeth(0.09, 0.2, 0.013, 0.022)) P.push([g, m.gunmetal]); // under rail
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) P.push([BX(0.0012, 0.008, 0.024, s * 0.0154, 0.04, 0.09 + i * 0.034), m.slot]); // shroud vents
      P.push([at(new THREE.CylinderGeometry(0.026, 0.026, 0.056, 18).rotateX(Math.PI / 2), 0, 0.036, 0.028), m.anod]); // cylinder
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + 0.2; P.push([at(new THREE.BoxGeometry(0.009, 0.006, 0.04).rotateZ(a + Math.PI / 2), Math.cos(a) * 0.0265, 0.036 + Math.sin(a) * 0.0265, 0.026), m.slot]); } // flutes
      P.push([slab([[-0.045, 0.05], [0.06, 0.05], [0.06, 0.0], [0.0, -0.006], [-0.03, 0.01], [-0.05, 0.04]], 0.026, 0.004), m.gunmetal]); // frame
      P.push([BX(0.03, 0.03, 0.03, 0, 0.038, 0.06), m.gunmetal]); // frame front / crane
      P.push([slab([[-0.038, 0.006], [0.0, 0.0], [-0.01, -0.104], [-0.054, -0.112], [-0.07, -0.084]], 0.034, 0.008), m.rubber]); // grip
      for (let i = 0; i < 3; i++) P.push([BX(0.035, 0.003, 0.028, 0, -0.03 - i * 0.022, -0.028 - i * 0.004), m.polymer]);
      P.push([guard(-0.002, 0.054, -0.004, 0.034), m.gunmetal]);
      trig(P, m, 0.012, -0.002);
      P.push([BX(0.01, 0.022, 0.012, 0, 0.066, -0.05, -0.5), m.steel]); // hammer
      fiberFront(P, m, 0.225, 0.067, 0.01); rearNotch(P, m, -0.012, 0.052, 0.018);
      P.push([BX(0.012, 0.01, 0.016, 0.0145, 0.03, -0.015), m.gunmetal]); // cylinder release
      return { parts: P, muzzle: [0, 0.044, 0.253], support: null, pistol: true };
    },
    // Compact SMG in the slanted-body style: the bolt recoils down into the housing below the barrel,
    // magazine in the grip, folding stock, holographic sight, vertical foregrip and a short compensator.
    smg() {
      const m = mats(), P = [];
      P.push([slab([[-0.09, 0.02], [0.2, 0.02], [0.22, 0.03], [0.22, 0.072], [-0.09, 0.072]], 0.046, 0.005), m.polymer]); // upper
      P.push([slab([[0.03, -0.055], [0.19, -0.075], [0.21, -0.04], [0.21, 0.02], [0.03, 0.02]], 0.05, 0.006), m.polymer]); // lower housing (slants down toward the front)
      P.push([slab([[-0.09, 0.0], [0.03, 0.0], [0.03, 0.02], [-0.09, 0.02]], 0.044, 0.004), m.polymer]);
      P.push([BX(0.047, 0.036, 0.1, 0, 0.046, 0.06), m.gunmetal]); // receiver block
      eject(P, m, -0.0236, 0.05, 0.03, 0.016, 0.04);
      P.push([slab([[-0.04, 0.0], [0.0, 0.0], [-0.012, -0.13], [-0.056, -0.136], [-0.07, -0.108]], 0.034, 0.007), m.rubber]); // grip (magazine inside)
      P.push([BX(0.028, 0.095, 0.03, 0, -0.18, -0.042, -0.1), m.polymer]); // extended magazine below the grip
      P.push([BX(0.032, 0.008, 0.034, 0, -0.23, -0.048, -0.1), m.polymer]);
      P.push([guard(0.0, 0.07, 0.0, 0.038), m.polymer]);
      trig(P, m, 0.016, -0.014);
      P.push([CY(0.0105, 0.07, 0, 0.046, 0.25, 12), m.gunmetal]); // barrel
      brake(P, m, 0.3, 0.046, 0.014, 0.045);
      P.push([slab([[0.1, -0.075], [0.14, -0.075], [0.136, -0.15], [0.104, -0.155]], 0.026, 0.005), m.polymer]); // vertical foregrip
      for (const g of railTeeth(-0.08, 0.21, 0.075, 0.03)) P.push([g, m.gunmetal]);
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) P.push([BX(0.0012, 0.01, 0.02, s * 0.0254, -0.02, 0.1 + i * 0.03), m.slot]); // side slots
      holo(P, m, 0.0, 0.078);
      // folding skeleton stock
      P.push([rod([0.018, 0.05, -0.09], [0.018, 0.05, -0.26], 0.0045, 8), m.anod]); P.push([rod([-0.018, 0.05, -0.09], [-0.018, 0.05, -0.26], 0.0045, 8), m.anod]);
      P.push([slab([[-0.255, 0.075], [-0.275, 0.07], [-0.28, -0.03], [-0.255, -0.036]], 0.036, 0.004), m.polymer]); // butt
      P.push([BX(0.044, 0.03, 0.03, 0, 0.05, -0.1), m.gunmetal]); // stock hinge
      P.push([BX(0.008, 0.012, 0.03, -0.027, 0.055, -0.03), m.steel]); // charging handle
      P.push([BX(0.012, 0.004, 0.02, 0.023, 0.008, -0.03), m.steel]); // selector
      return { parts: P, muzzle: [0, 0.046, 0.325], support: [0, -0.08, 0.12] };
    },
    // Carbine: flat-top upper, slim M-LOK handguard, angled foregrip, red dot, collapsible stock, birdcage flash hider.
    ar() {
      const m = mats(), P = [];
      P.push([slab([[-0.12, 0.028], [0.12, 0.028], [0.13, 0.04], [0.13, 0.068], [-0.12, 0.068]], 0.046, 0.004), m.anod]); // upper
      P.push([slab([[-0.12, 0.0], [0.12, 0.0], [0.12, 0.03], [-0.12, 0.03]], 0.048, 0.005), m.anod]); // lower
      eject(P, m, -0.0234, 0.05, 0.04, 0.02, 0.06);
      P.push([BX(0.012, 0.02, 0.03, -0.028, 0.05, -0.01), m.anod]); // brass deflector
      P.push([BX(0.01, 0.012, 0.02, -0.027, 0.052, 0.085), m.gunmetal]); // forward assist
      P.push([BX(0.05, 0.008, 0.06, 0, 0.066, -0.12), m.gunmetal]); // charging handle
      handguard(P, m, 0.13, 0.42, 0.01, 0.062, 0.04);
      P.push([CY(0.0095, 0.19, 0, 0.038, 0.51, 12), m.gunmetal]); // barrel
      P.push([BX(0.02, 0.024, 0.02, 0, 0.044, 0.43), m.gunmetal]); // low-profile gas block
      flash(P, m, 0.615, 0.038);
      pgrip(P, m, -0.03);
      pmag(P, m, 0.035, 0.16, 0.024);
      P.push([guard(0.0, 0.07, 0.0, 0.038), m.anod]);
      trig(P, m, 0.016, -0.014);
      m4stock(P, m, -0.12, 0.045);
      for (const g of railTeeth(-0.1, 0.12, 0.071, 0.036)) P.push([g, m.anod]);
      reddot(P, m, 0.0, 0.074);
      P.push([slab([[0.27, 0.01], [0.33, 0.01], [0.325, -0.045], [0.3, -0.05], [0.27, -0.02]], 0.03, 0.005), m.polymer]); // angled foregrip
      P.push([BX(0.006, 0.016, 0.01, 0, 0.074, 0.4), m.gunmetal]); // folded front sight
      pin(P, m, 0.014, -0.08, 0.05); pin(P, m, 0.014, 0.09, 0.05);
      P.push([BX(0.014, 0.004, 0.024, 0.025, 0.024, -0.04), m.steel]); // selector
      P.push([BX(0.012, 0.012, 0.012, -0.025, 0.02, 0.02), m.steel]); // mag release
      P.push([BX(0.012, 0.02, 0.02, 0.025, 0.028, 0.0), m.steel]); // bolt release
      return { parts: P, muzzle: [0, 0.038, 0.645], support: [0, 0.005, 0.3] };
    },
    // AK-47: stamped steel receiver with a ribbed dust cover, wooden handguards, grip and stock, the gas tube riding
    // over the barrel, a hooded front sight post, a tangent rear sight, a slant muzzle brake and the long curved magazine.
    // Open iron sights: `sight` is the line the eye sits on (rear notch to the tip of the front post).
    ak() {
      const m = mats(), P = [];
      P.push([slab([[-0.13, 0.0], [0.16, 0.0], [0.16, 0.05], [-0.13, 0.05]], 0.036, 0.004), m.akSteel]); // stamped receiver
      P.push([slab([[-0.125, 0.05], [0.14, 0.05], [0.14, 0.064], [0.12, 0.071], [-0.1, 0.071], [-0.125, 0.062]], 0.034, 0.006), m.akSteel]); // dust cover
      for (let i = 0; i < 5; i++) P.push([BX(0.0348, 0.011, 0.004, 0, 0.0625, -0.07 + i * 0.04), m.slot]); // cover ribs
      eject(P, m, -0.0184, 0.05, 0.055, 0.013, 0.08);
      P.push([BX(0.022, 0.008, 0.012, -0.027, 0.05, 0.09), m.akWorn]); // charging handle
      P.push([BX(0.0016, 0.011, 0.105, -0.0188, 0.027, -0.035), m.akWorn]); P.push([BX(0.006, 0.006, 0.014, -0.021, 0.022, 0.012), m.akWorn]); // selector lever
      // Rivets and pins down both sides of the receiver, rubbed bright.
      for (const sx of [-1, 1]) for (const [y, z] of [[0.012, -0.105], [0.038, -0.105], [0.012, -0.02], [0.012, 0.035], [0.036, 0.06], [0.012, 0.1], [0.04, 0.135], [0.014, 0.145]])
        P.push([at(new THREE.SphereGeometry(0.0034, 10, 6).scale(0.45, 1, 1), sx * 0.0182, y, z), m.akWorn]);
      P.push([BX(0.0372, 0.004, 0.2, 0, 0.047, 0.0), m.akSteel]); // the rail the dust cover sits on
      P.push([BX(0.0015, 0.016, 0.05, 0.0187, 0.02, 0.07), m.akWorn]); // magazine dimple plate
      P.push([BX(0.03, 0.03, 0.05, 0, 0.066, 0.165), m.akSteel]); // rear sight block
      P.push([BX(0.011, 0.005, 0.078, 0, 0.0865, 0.166), m.akSteel]); // tangent leaf
      for (const sx of [-1, 1]) P.push([BX(0.0065, 0.008, 0.005, sx * 0.0062, 0.093, 0.13), m.akSteel]); // rear notch
      P.push([slab([[0.16, 0.012], [0.335, 0.017], [0.335, 0.05], [0.16, 0.05]], 0.042, 0.009), m.akWood]); // lower handguard
      P.push([CY(0.0168, 0.128, 0, 0.068, 0.266, 14), m.akWood]); // upper handguard over the gas tube
      P.push([CY(0.0178, 0.011, 0, 0.068, 0.197, 14), m.akSteel]); P.push([BX(0.046, 0.05, 0.011, 0, 0.04, 0.338), m.akSteel]); // retainers
      P.push([CY(0.0086, 0.1, 0, 0.068, 0.385, 12), m.akSteel]); // gas tube
      P.push([slab([[0.418, 0.03], [0.456, 0.03], [0.456, 0.06], [0.44, 0.08], [0.418, 0.08]], 0.024, 0.003), m.akSteel]); // gas block
      P.push([CY(0.0088, 0.47, 0, 0.04, 0.395, 12), m.akSteel]); // barrel
      P.push([rod([0, 0.0265, 0.345], [0, 0.0265, 0.6], 0.0028, 8), m.akSteel]); // cleaning rod
      P.push([slab([[0.555, 0.04], [0.592, 0.04], [0.586, 0.09], [0.564, 0.09]], 0.012, 0.002), m.akSteel]); // front sight tower
      P.push([BX(0.003, 0.014, 0.003, 0, 0.0945, 0.575), m.akWorn]); // the post
      P.push([at(new THREE.TorusGeometry(0.0115, 0.0017, 8, 24, Math.PI * 1.72).rotateZ(2.03), 0, 0.099, 0.575), m.akSteel]); // the hood, open at the top
      P.push([at(cyl(0.0105, 0.0125, 0.034, 12), 0, 0.04, 0.643), m.akSteel]); // slant brake
      P.push([at(new THREE.CircleGeometry(0.0045, 10), 0, 0.04, 0.6605), m.slot]);
      P.push([slab([[0.032, 0.002], [0.09, 0.002], [0.114, -0.062], [0.154, -0.122], [0.202, -0.168], [0.168, -0.2], [0.114, -0.15], [0.07, -0.082], [0.046, -0.03]], 0.026, 0.003), m.akMag]); // curved 30-round magazine
      P.push([slab([[0.044, 0.0], [0.054, 0.0], [0.08, -0.064], [0.12, -0.126], [0.172, -0.178], [0.164, -0.186], [0.111, -0.133], [0.07, -0.07]], 0.0282, 0.001), m.akMag]); // rear rib
      P.push([slab([[0.062, 0.0], [0.072, 0.0], [0.098, -0.062], [0.138, -0.122], [0.188, -0.17], [0.18, -0.178], [0.129, -0.129], [0.088, -0.068]], 0.0282, 0.001), m.akMag]); // front rib
      P.push([slab([[0.158, -0.194], [0.204, -0.158], [0.21, -0.166], [0.166, -0.206]], 0.03, 0.002), m.akWorn]); // floor plate
      P.push([slab([[-0.03, 0.0], [0.0, 0.0], [-0.018, -0.105], [-0.054, -0.111], [-0.065, -0.085]], 0.03, 0.008), m.akGrip]); // grip, dark brown-black
      P.push([guard(0.0, 0.078, 0.0, 0.036), m.akSteel]);
      trig(P, m, 0.02, -0.014);
      P.push([slab([[-0.13, 0.05], [-0.19, 0.048], [-0.41, 0.012], [-0.42, -0.085], [-0.395, -0.09], [-0.2, -0.012], [-0.13, 0.004]], 0.038, 0.01), m.akWood]); // stock
      P.push([slab([[-0.412, 0.014], [-0.426, 0.012], [-0.436, -0.088], [-0.42, -0.09]], 0.04, 0.002), m.akSteel]); // steel butt plate
      P.push([at(new THREE.TorusGeometry(0.007, 0.0018, 6, 12), 0.021, 0.03, -0.14), m.steel]); // sling loop
      return { parts: P, muzzle: [0, 0.04, 0.662], support: [0, 0.008, 0.25], sight: [0, 0.1018, 0.13] };
    },
    // Semi-auto combat shotgun: pistol-grip polymer stock, ghost ring sights on a rail, heat shield, extended tube.
    shotgun() {
      const m = mats(), P = [];
      P.push([slab([[-0.1, 0.0], [0.11, 0.0], [0.11, 0.072], [-0.1, 0.072]], 0.05, 0.005), m.anod]); // receiver
      eject(P, m, -0.0254, 0.04, 0.03, 0.026, 0.07);
      P.push([CY(0.015, 0.5, 0, 0.056, 0.36, 14), m.gunmetal]); // barrel
      P.push([CY(0.013, 0.46, 0, 0.022, 0.34, 14), m.gunmetal]); // magazine tube
      P.push([CY(0.0145, 0.012, 0, 0.022, 0.575, 14), m.anod]);
      P.push([at(new THREE.CylinderGeometry(0.021, 0.021, 0.28, 16, 1, true, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), 0, 0.056, 0.4), m.gunmetal]); // heat shield (upper half)
      for (let i = 0; i < 8; i++) P.push([BX(0.044, 0.004, 0.006, 0, 0.073, 0.28 + i * 0.03), m.slot]); // shield vents
      P.push([slab([[0.11, 0.0], [0.26, 0.0], [0.26, 0.044], [0.11, 0.044]], 0.046, 0.006), m.polymer]); // forend
      for (let i = 0; i < 4; i++) P.push([BX(0.047, 0.004, 0.02, 0, 0.022, 0.13 + i * 0.03), m.slot]);
      P.push([BX(0.006, 0.016, 0.02, 0, 0.078, 0.56), m.gunmetal]); P.push([at(new THREE.SphereGeometry(0.0025, 6, 4), 0, 0.092, 0.565), m.fiber]); // front sight
      P.push([at(new THREE.TorusGeometry(0.009, 0.002, 6, 16), 0, 0.09, -0.04), m.gunmetal]); P.push([BX(0.006, 0.014, 0.008, 0, 0.078, -0.04), m.gunmetal]); // ghost ring
      for (const g of railTeeth(-0.09, 0.1, 0.075, 0.034)) P.push([g, m.anod]);
      P.push([slab([[-0.1, 0.07], [-0.19, 0.066], [-0.4, 0.056], [-0.42, 0.046], [-0.426, -0.06], [-0.4, -0.078], [-0.24, -0.04], [-0.17, -0.02], [-0.1, 0.0]], 0.044, 0.007), m.polymer]); // stock
      P.push([slab([[-0.418, 0.046], [-0.436, 0.044], [-0.44, -0.062], [-0.41, -0.082], [-0.398, -0.076]], 0.046, 0.002), m.rubber]); // recoil pad
      pgrip(P, m, -0.1, 0.11);
      P.push([guard(-0.07, -0.005, 0.0, 0.036), m.anod]);
      trig(P, m, -0.055, -0.014);
      P.push([BX(0.012, 0.012, 0.03, -0.03, 0.04, -0.01), m.steel]); // charging handle
      P.push([BX(0.012, 0.02, 0.012, 0.03, 0.018, 0.02), m.steel]); // bolt release
      for (let i = 0; i < 6; i++) { P.push([CY(0.0092, 0.052, 0.034, 0.03, -0.075 + i * 0.024, 10), m.shell]); P.push([CY(0.0095, 0.012, 0.034, 0.03, -0.097 + i * 0.024, 10), m.brass]); } // side saddle shells
      P.push([BX(0.012, 0.052, 0.15, 0.0265, 0.03, -0.015), m.polymer]); // saddle plate
      return { parts: P, muzzle: [0, 0.056, 0.615], support: [0, -0.004, 0.19] };
    },
    // Marksman rifle: long M-LOK handguard, 20-round magazine, suppressor, scope, fixed precision stock.
    dmr() {
      const m = mats(), P = [];
      P.push([slab([[-0.14, 0.028], [0.15, 0.028], [0.16, 0.04], [0.16, 0.07], [-0.14, 0.07]], 0.048, 0.004), m.anod]);
      P.push([slab([[-0.14, 0.0], [0.15, 0.0], [0.15, 0.03], [-0.14, 0.03]], 0.05, 0.005), m.anod]);
      eject(P, m, -0.0244, 0.05, 0.05, 0.022, 0.07);
      P.push([BX(0.05, 0.008, 0.06, 0, 0.068, -0.14), m.gunmetal]);
      handguard(P, m, 0.16, 0.56, 0.012, 0.062, 0.042, m.gunmetal);
      P.push([CY(0.0105, 0.2, 0, 0.038, 0.66, 12), m.gunmetal]);
      can(P, m, 0.84, 0.038, 0.02, 0.2);
      pgrip(P, m, -0.03);
      boxmag(P, m, 0.035, 0.12, 0.032, 0.07);
      P.push([guard(0.0, 0.07, 0.0, 0.038), m.anod]);
      trig(P, m, 0.016, -0.014);
      P.push([slab([[-0.14, 0.066], [-0.24, 0.07], [-0.42, 0.07], [-0.45, 0.06], [-0.456, -0.06], [-0.43, -0.082], [-0.3, -0.05], [-0.22, -0.03], [-0.14, 0.0]], 0.044, 0.007), m.gunmetal]); // precision stock, gun metal
      P.push([BX(0.036, 0.016, 0.12, 0, 0.084, -0.3), m.anod]); // cheek riser, grey steel
      P.push([slab([[-0.448, 0.06], [-0.466, 0.058], [-0.47, -0.062], [-0.44, -0.084], [-0.428, -0.078]], 0.046, 0.002), m.rubber]);
      for (const g of railTeeth(-0.12, 0.15, 0.073, 0.036)) P.push([g, m.anod]);
      scope(P, m, 0.0, 0.076, 0.3, 0.017, 0.027);
      foldBipod(P, m, 0.004, 0.36);
      pin(P, m, 0.014, -0.1, 0.052); pin(P, m, 0.014, 0.12, 0.052);
      P.push([BX(0.014, 0.004, 0.024, 0.026, 0.024, -0.04), m.steel]);
      return { parts: P, muzzle: [0, 0.038, 0.945], support: [0, 0.006, 0.36] };
    },
    // Battle rifle: tall polymer upper with a full-length rail, 20-round magazine, side-folding adjustable stock, muzzle brake.
    lever() {
      const m = mats(), P = [];
      P.push([slab([[-0.14, 0.03], [0.4, 0.03], [0.41, 0.045], [0.41, 0.082], [-0.14, 0.082]], 0.05, 0.005), m.tan]); // monolithic upper, flat dark earth
      P.push([slab([[-0.14, 0.0], [0.13, 0.0], [0.13, 0.032], [-0.14, 0.032]], 0.052, 0.005), m.polymer]); // lower
      eject(P, m, -0.0254, 0.055, 0.04, 0.024, 0.07);
      mlok(P, m, 0.0254, 0.05, 0.16, 0.4); mlok(P, m, -0.0254, 0.05, 0.16, 0.4); mlokDown(P, m, 0.0296, 0.17, 0.4);
      for (const g of railTeeth(-0.12, 0.4, 0.085, 0.036)) P.push([g, m.tan]);
      P.push([CY(0.0115, 0.16, 0, 0.05, 0.48, 14), m.gunmetal]);
      brake(P, m, 0.59, 0.05, 0.017, 0.07);
      P.push([BX(0.014, 0.016, 0.04, 0.03, 0.062, 0.1), m.gunmetal]); // reciprocating charging handle
      pgrip(P, m, -0.03);
      pmag(P, m, 0.035, 0.13, 0.012, 0.032);
      P.push([guard(0.0, 0.07, 0.0, 0.038), m.polymer]);
      trig(P, m, 0.016, -0.014);
      P.push([slab([[-0.14, 0.078], [-0.3, 0.078], [-0.38, 0.07], [-0.4, 0.05], [-0.404, -0.055], [-0.38, -0.075], [-0.3, -0.04], [-0.2, -0.02], [-0.14, 0.0]], 0.042, 0.006), m.tan]); // folding stock
      P.push([BX(0.04, 0.02, 0.11, 0, 0.092, -0.3), m.tan]); // cheek piece
      P.push([slab([[-0.396, 0.05], [-0.414, 0.048], [-0.418, -0.056], [-0.39, -0.078], [-0.378, -0.072]], 0.044, 0.002), m.rubber]);
      P.push([BX(0.05, 0.05, 0.02, 0, 0.04, -0.15), m.gunmetal]); // stock hinge
      scope(P, m, 0.03, 0.09, 0.22, 0.015, 0.022);
      P.push([BX(0.014, 0.004, 0.024, 0.027, 0.024, -0.04), m.steel]);
      P.push([BX(0.012, 0.012, 0.012, -0.027, 0.02, 0.02), m.steel]);
      pin(P, m, 0.014, -0.1, 0.054); pin(P, m, 0.014, 0.1, 0.054);
      return { parts: P, muzzle: [0, 0.05, 0.63], support: [0, 0.012, 0.3] };
    },
    // Tactical double: side-by-side 20-inch barrels, black synthetic furniture, rails on the receiver and forend, fibre bead.
    coach() {
      const m = mats(), P = [];
      for (const s of [-1, 1]) { P.push([CY(0.0135, 0.5, s * 0.0145, 0.052, 0.31, 14), m.gunmetal]); P.push([at(new THREE.CircleGeometry(0.0095, 12), s * 0.0145, 0.052, 0.5605), m.slot]); }
      P.push([BX(0.01, 0.005, 0.48, 0, 0.067, 0.31), m.gunmetal]); // rib
      P.push([BX(0.005, 0.014, 0.014, 0, 0.074, 0.545), m.gunmetal]); P.push([at(new THREE.SphereGeometry(0.003, 6, 4), 0, 0.083, 0.548), m.fiber]); // bead
      P.push([slab([[-0.09, 0.0], [0.07, 0.0], [0.075, 0.076], [-0.085, 0.076]], 0.05, 0.006), m.anod]); // receiver
      for (const g of railTeeth(-0.08, 0.06, 0.079, 0.034)) P.push([g, m.anod]);
      P.push([slab([[0.09, 0.044], [0.3, 0.04], [0.305, -0.014], [0.09, -0.016]], 0.044, 0.008), m.polymer]); // forend
      for (const g of railTeeth(0.12, 0.28, -0.019, 0.026)) P.push([g, m.polymer]);
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) P.push([BX(0.0012, 0.012, 0.02, s * 0.0224, 0.014, 0.12 + i * 0.04), m.slot]);
      P.push([slab([[-0.09, 0.072], [-0.17, 0.064], [-0.4, 0.05], [-0.42, 0.04], [-0.426, -0.06], [-0.4, -0.08], [-0.25, -0.04], [-0.17, -0.02], [-0.09, 0.0]], 0.044, 0.007), m.polymer]); // stock
      P.push([slab([[-0.418, 0.04], [-0.436, 0.038], [-0.44, -0.062], [-0.41, -0.084], [-0.398, -0.078]], 0.046, 0.002), m.rubber]);
      pgrip(P, m, -0.09, 0.108);
      P.push([guard(-0.06, 0.0, 0.0, 0.034), m.anod]);
      P.push([BX(0.005, 0.02, 0.008, 0.007, -0.012, -0.03), m.steel]); P.push([BX(0.005, 0.02, 0.008, -0.007, -0.012, -0.045), m.steel]);
      P.push([BX(0.028, 0.008, 0.03, 0, 0.08, -0.05), m.steel]); // top lever
      P.push([BX(0.012, 0.004, 0.02, 0, 0.078, -0.078), m.steel]); // tang safety
      P.push([CY(0.0255, 0.014, 0, 0.05, 0.085, 16), m.anod]); // hinge / forend iron
      return { parts: P, muzzle: [0, 0.052, 0.565], support: [0, -0.006, 0.2] };
    },
    // Light machine gun: perforated shroud, folded bipod, collapsible stock, feed-cover rail with a red dot, soft ammo pouch.
    lmg() {
      const m = mats(), P = [];
      P.push([slab([[-0.16, 0.0], [0.26, 0.0], [0.27, 0.02], [0.27, 0.09], [-0.16, 0.09]], 0.056, 0.006), m.gunmetal]);
      P.push([slab([[-0.02, 0.09], [0.2, 0.09], [0.19, 0.118], [0.0, 0.118]], 0.05, 0.005), m.anod]); // feed cover
      for (const g of railTeeth(-0.0, 0.19, 0.121, 0.036)) P.push([g, m.anod]);
      reddot(P, m, 0.1, 0.124, 0.014, 0.05);
      P.push([CY(0.023, 0.32, 0, 0.05, 0.42, 16), m.gunmetal]); // shroud
      for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) P.push([BX(0.048, 0.009, 0.009, 0, 0.05 + (r ? 0.005 : -0.005), 0.31 + i * 0.026 + r * 0.013), m.slot]);
      for (let i = 0; i < 4; i++) P.push([CY(0.0245, 0.006, 0, 0.05, 0.3 + i * 0.07, 16), m.anod]);
      P.push([CY(0.0125, 0.22, 0, 0.05, 0.68, 12), m.gunmetal]);
      flash(P, m, 0.805, 0.05);
      P.push([slab([[0.36, 0.07], [0.37, 0.115], [0.46, 0.115], [0.47, 0.07]], 0.014, 0.003), m.polymer]); // barrel change handle
      foldBipod(P, m, 0.016, 0.3);
      pgrip(P, m, -0.03);
      P.push([guard(0.0, 0.06, 0.0, 0.036), m.gunmetal]);
      trig(P, m, 0.014, -0.014);
      m4stock(P, m, -0.16, 0.05);
      P.push([BX(0.062, 0.1, 0.15, 0, -0.064, 0.12), m.nylon]); // soft ammo pouch
      P.push([BX(0.066, 0.012, 0.154, 0, -0.012, 0.12), m.gunmetal]); // pouch bracket
      for (let i = 0; i < 3; i++) P.push([BX(0.064, 0.003, 0.01, 0, -0.03 - i * 0.03, 0.12), m.slot]); // pouch stitching
      for (let i = 0; i < 12; i++) P.push([at(cyl(0.0058, 0.0058, 0.022, 8).rotateZ(Math.PI / 2), 0.04, -0.004 + i * 0.0095, 0.145 - i * 0.0045), m.brass]); // belt
      P.push([BX(0.006, 0.02, 0.008, 0, 0.126, 0.5), m.gunmetal]);
      P.push([BX(0.012, 0.012, 0.04, -0.034, 0.05, 0.05), m.steel]); // charging handle
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) P.push([BX(0.0012, 0.012, 0.024, s * 0.0284, 0.04, 0.05 + i * 0.05), m.slot]);
      return { parts: P, muzzle: [0, 0.05, 0.835], support: [0, 0.012, 0.36] };
    },
    // Precision sniper in an aluminium chassis: folding skeleton stock, fluted barrel, muzzle brake, box magazine, bipod, long scope.
    sniper() {
      const m = mats(), P = [];
      P.push([slab([[-0.12, 0.0], [0.16, 0.0], [0.16, 0.064], [-0.12, 0.064]], 0.044, 0.005), m.anod]); // chassis centre
      P.push([CY(0.0215, 0.26, 0, 0.034, 0.03, 16), m.gunmetal]); // round receiver
      eject(P, m, -0.0218, 0.04, 0.06, 0.016, 0.05);
      handguard(P, m, 0.16, 0.5, 0.008, 0.06, 0.042);
      P.push([at(cyl(0.0135, 0.011, 0.5, 16), 0, 0.034, 0.75), m.gunmetal]); // heavy barrel
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; P.push([at(new THREE.BoxGeometry(0.004, 0.003, 0.3).rotateZ(a), Math.cos(a + Math.PI / 2) * 0.0125, 0.034 + Math.sin(a + Math.PI / 2) * 0.0125, 0.68), m.slot]); } // flutes
      brake(P, m, 1.03, 0.034, 0.018, 0.08);
      P.push([CY(0.0118, 0.1, 0, 0.046, -0.13, 12), m.steel]); // bolt shroud
      P.push([rod([-0.012, 0.046, -0.06], [-0.064, 0.036, -0.066], 0.0045, 8), m.steel]); P.push([at(new THREE.SphereGeometry(0.0115, 10, 8), -0.072, 0.032, -0.068), m.polymer]); // bolt handle
      boxmag(P, m, 0.04, 0.08, 0.034, 0.08);
      pgrip(P, m, -0.03);
      P.push([guard(0.0, 0.07, 0.0, 0.038), m.anod]);
      trig(P, m, 0.016, -0.014);
      // folding skeleton stock
      P.push([BX(0.044, 0.05, 0.02, 0, 0.034, -0.13), m.anod]); // hinge block
      P.push([slab([[-0.14, 0.058], [-0.42, 0.058], [-0.44, 0.05], [-0.444, 0.03], [-0.16, 0.03]], 0.03, 0.004), m.anod]); // top spine
      P.push([slab([[-0.14, 0.01], [-0.3, -0.03], [-0.42, -0.05], [-0.44, -0.04], [-0.444, 0.03], [-0.16, 0.03]], 0.026, 0.004), m.anod]); // lower strut
      P.push([slab([[-0.438, 0.064], [-0.456, 0.062], [-0.46, -0.07], [-0.432, -0.088], [-0.42, -0.08], [-0.424, -0.05]], 0.04, 0.003), m.rubber]); // butt pad on an adjustable plate
      P.push([BX(0.034, 0.018, 0.12, 0, 0.078, -0.27), m.polymer]); // cheek riser
      P.push([CY(0.004, 0.03, 0.012, 0.064, -0.27, 8), m.steel]); P.push([CY(0.004, 0.03, -0.012, 0.064, -0.27, 8), m.steel]); // riser posts
      P.push([BX(0.012, 0.06, 0.012, 0, -0.06, -0.4), m.anod]); // monopod
      for (const g of railTeeth(-0.1, 0.14, 0.067, 0.036)) P.push([g, m.anod]);
      scope(P, m, 0.0, 0.07, 0.36, 0.0175, 0.032);
      foldBipod(P, m, 0.0, 0.3);
      P.push([at(new THREE.TorusGeometry(0.006, 0.0018, 6, 12), 0.023, 0.01, -0.3), m.steel]);
      return { parts: P, muzzle: [0, 0.034, 1.07], support: [0, 0.0, 0.34] };
    },
    // Suppressed PDW: grey upper with a long side rail, black polymer lower, fold-out foregrip, telescoping stock, reflex sight.
    pdw() {
      const m = mats(), P = [];
      P.push([slab([[-0.1, 0.02], [0.2, 0.02], [0.24, 0.032], [0.24, 0.066], [-0.1, 0.066]], 0.036, 0.005), m.anod]);
      P.push([slab([[-0.1, -0.006], [0.2, -0.006], [0.2, 0.024], [-0.1, 0.024]], 0.04, 0.006), m.tan]);
      for (const s of [-1, 1]) for (const g of railTeeth(0.08, 0.22, 0.043, 0.014)) { g.rotateZ(s * Math.PI / 2); g.translate(s * 0.021, 0, 0); P.push([g, m.gunmetal]); } // side rails
      P.push([slab([[-0.034, 0.0], [0.012, 0.0], [-0.004, -0.145], [-0.05, -0.15], [-0.062, -0.12]], 0.033, 0.006), m.rubber]);
      P.push([BX(0.036, 0.012, 0.052, 0, -0.152, -0.032, -0.12), m.polymer]);
      P.push([guard(0.0, 0.065, -0.006, 0.035), m.polymer]);
      trig(P, m, 0.014, -0.02);
      P.push([rod([0.016, 0.046, -0.1], [0.016, 0.046, -0.215], 0.004), m.anod]); P.push([rod([-0.016, 0.046, -0.1], [-0.016, 0.046, -0.215], 0.004), m.anod]);
      P.push([slab([[-0.212, 0.07], [-0.232, 0.064], [-0.236, -0.03], [-0.212, -0.036]], 0.034, 0.004), m.polymer]);
      P.push([CY(0.007, 0.07, 0, 0.043, 0.275, 10), m.gunmetal]);
      can(P, m, 0.39, 0.043, 0.0225, 0.22);
      P.push([slab([[0.14, 0.0], [0.17, 0.0], [0.168, -0.09], [0.14, -0.085]], 0.026, 0.005), m.polymer]);
      for (const g of railTeeth(-0.09, 0.2, 0.07, 0.022)) P.push([g, m.gunmetal]);
      holo(P, m, 0.04, 0.074);
      P.push([BX(0.018, 0.012, 0.03, 0, 0.074, 0.19), m.gunmetal]); P.push([BX(0.004, 0.016, 0.006, 0, 0.088, 0.2), m.gunmetal]);
      P.push([BX(0.006, 0.01, 0.03, -0.021, 0.05, -0.04), m.gunmetal]);
      eject(P, m, -0.0184, 0.04, 0.06, 0.014, 0.04);
      P.push([BX(0.012, 0.004, 0.02, 0.021, 0.006, -0.03), m.steel]);
      return { parts: P, muzzle: [0, 0.043, 0.51], support: [0, -0.04, 0.155] };
    },
    // Heavy pistol: big matte slide with a compensated barrel, rail, polymer grip panels, fibre sights.
    hpistol() {
      const m = mats(), P = [];
      P.push([slab([[-0.045, 0.02], [0.2, 0.02], [0.205, 0.062], [0.195, 0.07], [-0.035, 0.07], [-0.048, 0.054]], 0.03, 0.004), m.gunmetal]);
      P.push([slab([[0.19, 0.02], [0.262, 0.028], [0.262, 0.058], [0.19, 0.066]], 0.026, 0.004), m.anod]); // compensator
      for (let i = 0; i < 3; i++) P.push([BX(0.012, 0.0012, 0.012, 0, 0.0665, 0.215 + i * 0.016), m.slot]); // comp ports
      P.push([slab([[-0.04, 0.0], [0.17, 0.0], [0.17, 0.022], [-0.045, 0.022]], 0.028, 0.004), m.gunmetal]);
      P.push([slab([[-0.042, 0.0], [0.012, 0.0], [-0.002, -0.125], [-0.056, -0.13], [-0.07, -0.1]], 0.034, 0.007), m.polymer]);
      for (const s of [-1, 1]) P.push([slab([[-0.036, -0.012], [0.002, -0.012], [-0.008, -0.11], [-0.05, -0.116], [-0.06, -0.092]], 0.004, 0.001).translate(s * 0.0175, 0, 0), m.rubber]); // grip panels
      P.push([BX(0.036, 0.014, 0.07, 0, -0.131, -0.032), m.gunmetal]);
      P.push([guard(0.0, 0.068, 0.002, 0.04), m.gunmetal]);
      trig(P, m, 0.012, -0.012);
      for (const g of railTeeth(0.06, 0.17, -0.003, 0.02)) P.push([g, m.gunmetal]);
      fiberFront(P, m, 0.245, 0.07, 0.01); rearNotch(P, m, -0.03, 0.07, 0.018);
      eject(P, m, -0.0156, 0.052, 0.07, 0.02, 0.06);
      for (let i = 0; i < 6; i++) P.push([BX(0.032, 0.036, 0.0022, 0, 0.045, -0.03 + i * 0.0065), m.slot]);
      for (let i = 0; i < 4; i++) P.push([BX(0.032, 0.03, 0.0022, 0, 0.045, 0.15 + i * 0.0065), m.slot]);
      P.push([CY(0.0095, 0.012, 0, 0.044, 0.268, 12), m.steel]); P.push([at(new THREE.CircleGeometry(0.0055, 10), 0, 0.044, 0.2745), m.slot]);
      P.push([BX(0.012, 0.006, 0.012, 0.0175, -0.012, -0.012), m.polymer]);
      P.push([BX(0.012, 0.004, 0.018, -0.016, 0.014, -0.025), m.steel]);
      return { parts: P, muzzle: [0, 0.044, 0.275], support: null, pistol: true };
    },
    // Long magnum revolver: stainless, compensated barrel on a full underlug, top rail, rubber grip.
    magnum() {
      const m = mats(), P = [];
      P.push([CY(0.0135, 0.32, 0, 0.042, 0.22, 16), m.steel]); // barrel
      P.push([BX(0.012, 0.009, 0.3, 0, 0.0565, 0.21), m.steel]); // top rib
      for (const g of railTeeth(0.07, 0.3, 0.063, 0.02)) P.push([g, m.steelDark]);
      P.push([CY(0.0155, 0.26, 0, 0.016, 0.2, 12), m.steel]); // underlug
      for (let i = 0; i < 4; i++) P.push([BX(0.014, 0.0012, 0.01, 0, 0.0615, 0.33 + i * 0.014), m.slot]); // comp ports
      P.push([CY(0.0145, 0.056, 0, 0.042, 0.38, 14), m.steel]); P.push([at(new THREE.CircleGeometry(0.0065, 10), 0, 0.042, 0.4085), m.slot]);
      P.push([CY(0.029, 0.058, 0, 0.036, 0.03, 12), m.steel]); // cylinder
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; P.push([at(new THREE.BoxGeometry(0.012, 0.006, 0.05).rotateZ(a + Math.PI / 2), Math.cos(a) * 0.0295, 0.036 + Math.sin(a) * 0.0295, 0.03), m.slot]); }
      P.push([slab([[-0.04, 0.056], [0.06, 0.056], [0.06, 0.0], [0.0, -0.006], [-0.03, 0.01], [-0.047, 0.044]], 0.026, 0.004), m.steel]);
      P.push([BX(0.028, 0.03, 0.03, 0, 0.04, 0.062), m.steel]);
      P.push([slab([[-0.036, 0.006], [0.0, 0.0], [-0.008, -0.106], [-0.052, -0.113], [-0.066, -0.085]], 0.034, 0.008), m.rubber]);
      for (let i = 0; i < 3; i++) P.push([BX(0.035, 0.003, 0.028, 0, -0.03 - i * 0.022, -0.026 - i * 0.004), m.polymer]);
      P.push([guard(-0.002, 0.052, -0.004, 0.034), m.steel]);
      trig(P, m, 0.012, 0.0);
      P.push([BX(0.01, 0.022, 0.012, 0, 0.068, -0.05, -0.5), m.steelDark]);
      rearNotch(P, m, -0.012, 0.06, 0.016);
      fiberFront(P, m, 0.395, 0.0575, 0.012);
      P.push([BX(0.012, 0.01, 0.016, 0.0145, 0.03, -0.015), m.steelDark]);
      return { parts: P, muzzle: [0, 0.042, 0.41], support: null, pistol: true };
    },
    // Shorty pump: 14-inch barrel, bird's-head polymer grip, strapped corn-cob forend, bead sight.
    sawedoff() {
      const m = mats(), P = [];
      P.push([slab([[-0.06, 0.0], [0.09, 0.0], [0.09, 0.07], [-0.06, 0.07]], 0.046, 0.005), m.anod]); // receiver
      eject(P, m, -0.0234, 0.04, 0.02, 0.024, 0.06);
      P.push([slab([[-0.06, 0.0], [0.09, 0.0], [0.09, -0.012], [-0.06, -0.012]], 0.04, 0.003), m.anod]); // loading port plate
      P.push([BX(0.028, 0.0012, 0.06, 0, -0.0126, 0.03), m.slot]);
      P.push([CY(0.015, 0.33, 0, 0.055, 0.25, 14), m.gunmetal]); // barrel
      P.push([at(new THREE.CircleGeometry(0.0095, 12), 0, 0.055, 0.4155), m.slot]);
      P.push([CY(0.0125, 0.3, 0, 0.022, 0.24, 14), m.gunmetal]); // mag tube
      P.push([CY(0.0135, 0.012, 0, 0.022, 0.39, 14), m.anod]);
      P.push([BX(0.02, 0.024, 0.014, 0, 0.04, 0.395), m.gunmetal]); // barrel clamp
      P.push([CY(0.024, 0.13, 0, 0.022, 0.2, 18), m.polymer]); // corn-cob pump
      for (let i = 0; i < 6; i++) P.push([CY(0.0252, 0.004, 0, 0.022, 0.15 + i * 0.02, 18), m.slot]);
      P.push([at(new THREE.TorusGeometry(0.027, 0.005, 6, 18), 0, 0.022, 0.2), m.nylon]); P.push([at(new THREE.TorusGeometry(0.027, 0.005, 6, 18), 0, 0.022, 0.24), m.nylon]); // hand strap bands over the pump
      P.push([BX(0.005, 0.012, 0.012, 0, 0.076, 0.4), m.gunmetal]); P.push([at(new THREE.SphereGeometry(0.003, 6, 4), 0, 0.086, 0.403), m.fiber]); // bead
      P.push([slab([[-0.06, 0.07], [-0.1, 0.064], [-0.15, 0.02], [-0.19, -0.06], [-0.2, -0.1], [-0.17, -0.118], [-0.12, -0.1], [-0.07, -0.05], [-0.04, -0.04], [-0.03, 0.0], [-0.06, 0.0]], 0.04, 0.008), m.polymer]); // bird's-head grip
      for (let i = 0; i < 4; i++) P.push([BX(0.041, 0.003, 0.024, 0, -0.02 - i * 0.024, -0.1 - i * 0.016), m.slot]); // grip texture
      P.push([at(new THREE.TorusGeometry(0.012, 0.0028, 6, 14).rotateY(Math.PI / 2), 0, -0.118, -0.19), m.nylon]); // lanyard loop
      P.push([guard(-0.04, 0.012, 0.0, 0.036), m.anod]);
      trig(P, m, -0.02, -0.016);
      P.push([BX(0.012, 0.008, 0.02, 0.0235, 0.012, -0.03), m.steel]); // action release
      P.push([BX(0.01, 0.008, 0.016, 0, 0.074, -0.03), m.steel]); // safety
      return { parts: P, muzzle: [0, 0.055, 0.42], support: [0, -0.01, 0.2] };
    },
  };
}
