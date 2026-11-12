// Render look: height/sun-scatter fog (patched fog chunks), procedural sky with sun/moon, clouds and stars,
// per-biome image-based lighting baked from that sky, tone/grade pass with vignette, MSAA composer.
import * as THREE from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OutputShader } from 'three/addons/shaders/OutputShader.js';
import * as TX from './textures.js';
import { SUN_DIR } from './terrain.js';

// Light offset from the player used by the sun and its shadow camera (kept in step with SUN_DIR).
export const SUN_OFFSET = SUN_DIR.clone().multiplyScalar(88);

let fogPatched = false;
// Exponential-squared fog that thickens in low ground and warms toward the sun. Uses only the stock fog
// uniforms, so every material (including characters) picks it up.
export function installFog() {
  if (fogPatched) return;
  fogPatched = true;
  const C = THREE.ShaderChunk;
  // A surface normal of zero length (opposite normals blending across a thin shape, or broken model data) turns into
  // not-a-number on most graphics cards, and the bloom then smears that one pixel into a huge black square.
  // Every lit material now falls back to "straight up" for such a pixel instead.
  if (!C.common.includes('prSafeN')) {
    C.common += '\nvec3 prSafeN( vec3 n ) { float l = dot( n, n ); return l > 1e-12 ? n * inversesqrt( l ) : vec3( 0.0, 1.0, 0.0 ); }\n';
    C.normal_fragment_begin = C.normal_fragment_begin.split('normalize( vNormal )').join('prSafeN( vNormal )');
  }
  const sd = `vec3(${SUN_DIR.x.toFixed(4)}, ${SUN_DIR.y.toFixed(4)}, ${SUN_DIR.z.toFixed(4)})`;
  C.fog_pars_vertex = `#ifdef USE_FOG\n varying float vFogDepth;\n varying vec3 vFogRay;\n#endif`;
  C.fog_vertex = `#ifdef USE_FOG\n vFogDepth = - mvPosition.z;\n vFogRay = mvPosition.xyz * mat3( viewMatrix );\n#endif`;
  C.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogRay;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
  C.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogWY = cameraPosition.y + vFogRay.y;
    float fogD = fogDensity * (0.88 + 0.4 * exp( - max( fogWY + 4.0, 0.0 ) * 0.045 ));
    float fogFactor = 1.0 - exp( - fogD * fogD * vFogDepth * vFogDepth );
    float fogSun = pow( max( dot( normalize( vFogRay ), ${sd} ), 0.0 ), 4.0 );
    vec3 fogCol = fogColor * ( 1.0 + fogSun * 0.85 );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    vec3 fogCol = fogColor;
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, fogFactor );
#endif`;
}

const SKY = {
  graveyard: { moon: 1, stars: 1, cover: 0.5, cloud: [0.2, 0.2, 0.3], cloudLit: [0.38, 0.4, 0.58], sunK: 0.5 },
  forest: { moon: 1, stars: 1, cover: 0.52, cloud: [0.1, 0.15, 0.13], cloudLit: [0.28, 0.4, 0.33], sunK: 0.5 },
  desert: { moon: 0, stars: 0, cover: 0.7, cloud: [0.85, 0.75, 0.62], cloudLit: [1.3, 1.1, 0.85], sunK: 1 },
  frozen: { moon: 0, stars: 0, cover: 0.5, cloud: [0.62, 0.7, 0.82], cloudLit: [1.25, 1.25, 1.3], sunK: 1 },
  volcanic: { moon: 0, stars: 1, cover: 0.42, cloud: [0.1, 0.045, 0.035], cloudLit: [0.9, 0.3, 0.12], sunK: 0.8 },
  abyss: { moon: 1, stars: 1, cover: 0.55, cloud: [0.08, 0.04, 0.14], cloudLit: [0.32, 0.2, 0.6], sunK: 0.5 },
  meadow: { moon: 0, stars: 0, cover: 0.42, cloud: [0.8, 0.84, 0.9], cloudLit: [1.3, 1.28, 1.2], sunK: 1 },
  dunes: { moon: 0, stars: 0, cover: 0.6, cloud: [0.9, 0.86, 0.78], cloudLit: [1.35, 1.25, 1.08], sunK: 1 },
  frost: { moon: 0, stars: 0, cover: 0.52, cloud: [0.8, 0.86, 0.95], cloudLit: [1.3, 1.3, 1.34], sunK: 1 },
  springs: { moon: 0, stars: 0, cover: 0.45, cloud: [0.82, 0.86, 0.9], cloudLit: [1.3, 1.26, 1.18], sunK: 1 },
  space: { moon: 0, stars: 1, cover: 0.0, cloud: [0.1, 0.04, 0.08], cloudLit: [0.5, 0.2, 0.2], sunK: 0.6 },
  waterfall: { moon: 0, stars: 0, cover: 0.4, cloud: [0.84, 0.88, 0.92], cloudLit: [1.32, 1.28, 1.2], sunK: 1 },
  clearing: { moon: 0, stars: 0, cover: 0.3, cloud: [0.9, 0.84, 0.74], cloudLit: [1.35, 1.2, 0.95], sunK: 1 },
  volcano: { moon: 0, stars: 0, cover: 0.62, cloud: [0.12, 0.05, 0.04], cloudLit: [1.0, 0.32, 0.1], sunK: 0.7 },
  crypt: { moon: 0, stars: 0, cover: 0.55, cloud: [0.5, 0.44, 0.5], cloudLit: [1.4, 0.95, 0.62], sunK: 1 },
  ruins: { moon: 0, stars: 0, cover: 0.75, cloud: [0.78, 0.8, 0.8], cloudLit: [1.1, 1.08, 1.0], sunK: 0.8 },
};

export function skyMaterial(biome, { env = false } = {}) {
  const S = SKY[biome.id] || SKY.graveyard;
  const top = new THREE.Color(biome.sky[0]), hor = new THREE.Color(biome.sky[1]), fogc = new THREE.Color(biome.fog), sun = new THREE.Color(biome.sun);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: top }, hor: { value: hor }, fogc: { value: fogc }, sunCol: { value: sun }, sunDir: { value: SUN_DIR.clone() },
      uT: { value: 0 }, tNoise: { value: TX.macroNoise() }, uMoon: { value: S.moon }, uStars: { value: S.stars }, uCover: { value: S.cover },
      cloudCol: { value: new THREE.Color(...S.cloud) }, cloudLit: { value: new THREE.Color(...S.cloudLit) }, uSunK: { value: S.sunK }, uEnv: { value: env ? 1 : 0 },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      uniform vec3 top, hor, fogc, sunCol, sunDir, cloudCol, cloudLit;
      uniform float uT, uMoon, uStars, uCover, uSunK, uEnv;
      uniform sampler2D tNoise;
      varying vec3 vP;
      float h13(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      void main(){
        vec3 d = normalize(vP);
        float y = d.y;
        float yy = max(y, 0.0);
        vec3 c = mix(hor, top, pow(yy, 0.5));
        // low haze band blends into the fog colour so distant terrain meets the sky seamlessly
        c = mix(fogc, c, smoothstep(0.0, 0.2, y));
        c = mix(c, fogc * 0.7, smoothstep(0.0, -0.25, y));
        float sd = max(dot(d, sunDir), 0.0);
        float skyLum = (uEnv > 0.5) ? 0.6 : 1.0;
        // sun / moon
        vec3 glow = sunCol * (pow(sd, 6.0) * 0.18 + pow(sd, 40.0) * 0.45 * uSunK) * (1.0 - uMoon * 0.6);
        c += glow * smoothstep(-0.1, 0.2, y);
        float disc = smoothstep(0.9993 - uMoon * 0.0004, 0.9996 - uMoon * 0.0003, sd);
        vec3 discCol = mix(sunCol * 14.0, vec3(0.75, 0.82, 1.0) * 2.2, uMoon);
        // moon craters via noise
        float cr = texture2D(tNoise, d.xz * 9.0 + 0.1).g;
        discCol *= mix(1.0, 0.72 + cr * 0.4, uMoon);
        c = mix(c, discCol, disc * smoothstep(-0.03, 0.06, y));
        if (uEnv < 0.5 && y > -0.02) {
          // stars with twinkle
          if (uStars > 0.5) {
            vec3 q = d * 260.0; vec3 cell = floor(q); float hs = h13(cell); vec3 f = fract(q) - 0.5;
            float sz = 0.1 + 0.2 * h13(cell + 7.7);
            float star = step(0.9965, hs) * smoothstep(sz, 0.0, length(f)) * (0.55 + 0.45 * sin(uT * (1.5 + hs * 40.0) + hs * 99.0));
            c += vec3(0.85, 0.9, 1.0) * star * 1.6 * smoothstep(0.08, 0.5, y) * (1.0 - uMoon * 0.0);
          }
          // clouds
          vec2 cp = d.xz / (y + 0.14) * 0.42 + vec2(uT * 0.0045, uT * 0.0017);
          float n = texture2D(tNoise, cp * 0.55).r * 0.5 + texture2D(tNoise, cp * 1.4 + 0.3).g * 0.3 + texture2D(tNoise, cp * 3.3 + 0.7).b * 0.2;
          float dens = smoothstep(uCover, uCover + 0.26, n);
          float lit = smoothstep(uCover + 0.3, uCover, n) ;
          vec3 cc = mix(cloudCol, cloudLit, clamp(lit * 0.55 + pow(sd, 3.0) * 0.9, 0.0, 1.0));
          cc += sunCol * pow(sd, 8.0) * (1.0 - dens * 0.5) * 0.9;
          c = mix(c, cc, dens * smoothstep(0.015, 0.28, y) * 0.92);
        }
        gl_FragColor = vec4(c * skyLum, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  return mat;
}

// Image-based lighting from the biome sky: ambient + reflections (wet ground, ice, metals) match the scene.
export function makeSkyEnv(renderer, biome) {
  const pm = new THREE.PMREMGenerator(renderer);
  const scene = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), skyMaterial(biome, { env: true }));
  scene.add(dome);
  const rt = pm.fromScene(scene, 0.02);
  dome.geometry.dispose(); dome.material.dispose();
  pm.dispose();
  return rt;
}

// Per-biome grade: exposure, env strength, vignette, saturation, tint.
const GRADE = {
  graveyard: { exp: 1.18, env: 0.9, vig: 0.55, sat: 1.0, tint: [0.97, 0.98, 1.05], bloom: 0.5 },
  forest: { exp: 1.22, env: 0.9, vig: 0.55, sat: 1.08, tint: [0.97, 1.03, 0.98], bloom: 0.5 },
  desert: { exp: 0.9, env: 0.75, vig: 0.38, sat: 1.12, tint: [1.04, 1.0, 0.94], bloom: 0.38 },
  frozen: { exp: 0.92, env: 0.8, vig: 0.38, sat: 1.0, tint: [0.98, 1.0, 1.05], bloom: 0.38 },
  volcanic: { exp: 1.45, env: 1.0, vig: 0.62, sat: 1.1, tint: [1.05, 0.98, 0.95], bloom: 0.6 },
  abyss: { exp: 1.5, env: 1.25, vig: 0.6, sat: 1.1, tint: [1.0, 0.97, 1.06], bloom: 0.6 },
  crypt: { exp: 0.98, env: 0.85, vig: 0.4, sat: 1.1, tint: [1.02, 1.0, 0.97], bloom: 0.4 },
  meadow: { exp: 0.95, env: 0.8, vig: 0.32, sat: 1.12, tint: [1.02, 1.02, 0.98], bloom: 0.34 },
  dunes: { exp: 0.84, env: 0.8, vig: 0.3, sat: 1.2, tint: [1.03, 1.0, 0.95], bloom: 0.28 },
  frost: { exp: 0.84, env: 0.85, vig: 0.28, sat: 1.1, tint: [0.99, 1.0, 1.04], bloom: 0.3 },
  springs: { exp: 0.96, env: 0.85, vig: 0.3, sat: 1.18, tint: [1.02, 1.03, 0.98], bloom: 0.4 },
  space: { exp: 1.35, env: 1.1, vig: 0.6, sat: 0.95, tint: [0.98, 1.0, 1.04], bloom: 0.6 }, // cool and grey: the Moon (Nutty 2026-11-05: too brown)
};

// OutputPass with the grade folded in (vignette, saturation, tint run in linear HDR just before tone mapping),
// so the grade costs no extra full-screen pass.
export function makeGradePass() {
  const p = new OutputPass();
  p.uniforms.uVig = { value: 0.5 };
  p.uniforms.uSat = { value: 1 };
  p.uniforms.uTint = { value: new THREE.Vector3(1, 1, 1) };
  p.material.fragmentShader = OutputShader.fragmentShader
    .replace('uniform sampler2D tDiffuse;', 'uniform sampler2D tDiffuse; uniform float uVig, uSat; uniform vec3 uTint;')
    .replace('gl_FragColor = texture2D( tDiffuse, vUv );', `gl_FragColor = texture2D( tDiffuse, vUv );
			{
				vec2 gp = vUv - 0.5; gp.x *= 1.1;
				float gv = 1.0 - uVig * smoothstep( 0.25, 0.95, length( gp ) * 1.35 );
				float gl = dot( gl_FragColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
				gl_FragColor.rgb = mix( vec3( gl ), gl_FragColor.rgb, uSat ) * uTint * gv;
			}`);
  p.material.needsUpdate = true;
  return p;
}

// Called by Game.loadRound after it applies the biome's fog/sun/hemisphere values.
export function applyBiomeLook(game, b) {
  const G = GRADE[b.id] || GRADE.graveyard;
  game.renderer.toneMappingExposure = G.exp;
  if (game.skyEnv) game.skyEnv.dispose();
  game.skyEnv = makeSkyEnv(game.renderer, b);
  game.scene.environment = game.skyEnv.texture;
  game.scene.environmentIntensity = G.env * 0.95;
  game.hemi.intensity = b.hemiI * 1.15;
  if (game.gradePass) {
    const u = game.gradePass.uniforms;
    u.uVig.value = G.vig; u.uSat.value = G.sat; u.uTint.value.set(G.tint[0], G.tint[1], G.tint[2]);
  }
  if (game.bloom) game.bloom.strength = G.bloom;
}

// Composer with MSAA on the scene target (the composer otherwise renders without any antialiasing).
export function buildComposer(game, { EffectComposer, RenderPass, UnrealBloomPass }) {
  const q = game.q;
  const c = new EffectComposer(game.renderer);
  game.renderPass = new RenderPass(game.scene, game.camera);
  c.addPass(game.renderPass);
  const div = q === 2 ? 2 : 3;
  game.bloom = new UnrealBloomPass(new THREE.Vector2(game.vw() / div, game.vh() / div), 0.5, 0.6, 0.85);
  // One broken pixel (not-a-number or infinitely bright) used to be smeared by the bloom into a huge black square.
  // The bloom's first step now throws such pixels away and caps the brightness it will spread.
  { const hp = game.bloom.materialHighPassFilter, a = 'vec4 texel = texture2D( tDiffuse, vUv );';
    if (hp && hp.fragmentShader.includes(a)) { hp.fragmentShader = hp.fragmentShader.replace(a, a + ' if ( ! ( texel.r + texel.g + texel.b < 1.0e6 ) || ! ( texel.r + texel.g + texel.b > -1.0 ) ) texel = vec4( 0.0, 0.0, 0.0, 1.0 ); texel.rgb = min( texel.rgb, vec3( 48.0 ) );'); hp.needsUpdate = true; } }
  c.addPass(game.bloom);
  game.gradePass = makeGradePass();
  c.addPass(game.gradePass);
  game.gradePass.needsSwap = false; // it draws to the screen: swapping would send every other frame's scene into the target without MSAA
  const gl = game.renderer.getContext();
  const maxS = game.renderer.capabilities.maxSamples || 0;
  if (maxS > 0 && game.renderer.extensions.has('EXT_color_buffer_float')) {
    c.renderTarget2.samples = Math.min(maxS, q >= 2 ? 4 : 2);
  }
  return c;
}

// Some built props (ice shards, obelisks, far-away enemy models) carried zero-length normals. A zero normal shades
// as not-a-number, which the bloom then smears into a huge black square. Give every such vertex its face's normal.
const _healed = new WeakSet();
export function healNormals(root) {
  let fixed = 0;
  root.traverse((m) => {
    const g = m.geometry;
    if (!g || _healed.has(g) || !g.attributes || !g.attributes.normal || !g.attributes.position) return;
    _healed.add(g);
    const N = g.attributes.normal, P = g.attributes.position, idx = g.index ? g.index.array : null;
    if (N.isInterleavedBufferAttribute || N.normalized) return;
    const na = N.array;
    let bad = null;
    for (let i = 0; i < N.count; i++) { const x = na[i * 3], y = na[i * 3 + 1], z = na[i * 3 + 2]; if (!(x * x + y * y + z * z > 1e-4)) (bad = bad || new Set()).add(i); }
    if (!bad) return;
    const tri = idx ? idx.length : P.count;
    for (let t = 0; t + 2 < tri; t += 3) {
      const a = idx ? idx[t] : t, b = idx ? idx[t + 1] : t + 1, c = idx ? idx[t + 2] : t + 2;
      if (!bad.has(a) && !bad.has(b) && !bad.has(c)) continue;
      const ax = P.getX(a), ay = P.getY(a), az = P.getZ(a);
      const ux = P.getX(b) - ax, uy = P.getY(b) - ay, uz = P.getZ(b) - az, vx = P.getX(c) - ax, vy = P.getY(c) - ay, vz = P.getZ(c) - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      if (l > 1e-12) { nx /= l; ny /= l; nz /= l; } else { nx = 0; ny = 1; nz = 0; }
      for (const i of [a, b, c]) if (bad.has(i)) { na[i * 3] = nx; na[i * 3 + 1] = ny; na[i * 3 + 2] = nz; bad.delete(i); fixed++; }
    }
    for (const i of bad) { na[i * 3] = 0; na[i * 3 + 1] = 1; na[i * 3 + 2] = 0; fixed++; }
    N.needsUpdate = true;
  });
  return fixed;
}
