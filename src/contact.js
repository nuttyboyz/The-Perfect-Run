// Contact shadows: the soft dark patch a body presses into the ground right under its feet.
//
// The sun's shadow map only reaches so far (perf.js PERF.mobShadow, and on the lowest tiers it does not cast from
// enemies at all), so past that every enemy stood on the ground without touching it: bodies looked pasted onto the
// map instead of standing on it. This lays one soft disc under each body instead. It is a single instanced draw
// call for the whole crowd, it needs no shadow map, and each disc carries its own strength, so it fades in over the
// last few metres of the real shadow's reach and you cannot see where one takes over from the other.
//
// A body in the air gets a wider, fainter patch the higher it is, which is how a real shadow behaves and is what
// makes a leap, a flight or a hurled body read as being off the ground.
import * as THREE from 'three';

const MAX = 192;

const VERT = `
attribute float aStr;
varying vec2 vUv;
varying float vStr;
void main() {
  vUv = uv;
  vStr = aStr;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}`;

// Black, with only its transparency shaped: over normal blending that darkens the ground by exactly vStr in the
// middle and by nothing at the rim, so the edge of the disc can never be made out.
const FRAG = `
varying vec2 vUv;
varying float vStr;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = 1.0 - smoothstep(0.12, 0.98, d);
  a = a * sqrt(a); // a broad dark core under the feet that trails off softly to nothing at the rim
  gl_FragColor = vec4(0.0, 0.0, 0.0, a * vStr);
  if (gl_FragColor.a < 0.004) discard;
}`;

export class ContactShadows {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2); // lying flat
    this.str = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    geo.setAttribute('aStr', this.str);
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.NormalBlending });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1; // first of the see-through things, so anything drawn on the ground goes over it
    this.mesh.noSolid = true; // never a thing to walk into or shoot
    this.mesh.count = 0;
    this.mesh.matrixAutoUpdate = false;
    scene.add(this.mesh);
    this.o = new THREE.Object3D();
    this.n = 0;
  }

  begin() { this.n = 0; }

  // x, z where the body stands; gy the ground under it; y how far it is off that ground; r its footprint;
  // k how much of the patch to show (1 nothing else is drawing it, 0 the sun's own shadow has it).
  add(x, gy, z, y, r, k) {
    if (this.n >= MAX || k <= 0.02) return;
    const air = y > 0 ? y : 0;
    const spread = 1 + Math.min(1.4, air * 0.22); // higher up, wider and fainter
    const s = Math.max(0.5, r * 3.4) * spread;
    const o = this.o;
    o.position.set(x, gy + 0.035, z);
    o.scale.set(s, 1, s);
    o.updateMatrix();
    this.mesh.setMatrixAt(this.n, o.matrix);
    this.str.setX(this.n, Math.min(0.55, (0.5 * k) / spread));
    this.n++;
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.str.needsUpdate = true;
  }

  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); }
}
