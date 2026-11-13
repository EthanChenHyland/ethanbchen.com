import * as THREE from 'three';
import { BONES, bodySDF, collarLine, groupDist, meshFromSDF, smin } from './ProfileBody.js';
import { createSkeleton } from './ProfileRig.js';

// The outer self: a complete, slim midnight tuxedo worn over the pearl digital person.
// One skinned mesh (one draw), built from distance fields around the body and tagged per vertex:
//   0 jacket (full sleeves)   1 white shirt front and collar   2 red tie   3 trousers   4 dress shoes
// It has its own skeleton, so it can trail the inner person (a lag); it keeps broad planes while the
// body slices finely; in the information state it opens to its edges, the red tie last; it closes
// after the body has reformed.

const NB = BONES.length;
const CHEST = BONES.findIndex((b) => b.name === 'chest');
const slab = (y, a, b) => Math.max(a - y, y - b);
const smooth = THREE.MathUtils.smoothstep;
const smax = (a, b, k) => -smin(-a, -b, k);
const KNOT_Y = 1.478; // the tie's knot sits in the collar's opening

/** The open V of the jacket, where the shirt and tie show. */
function vNeck(x, y, z, depth = 1.2) {
  const hw = 0.07 * smooth(y, depth, 1.47) + 0.004;
  return Math.max(Math.abs(x) - hw, 0.012 - z, depth - y);
}

/** Each garment's distance at a point; the tuxedo is their union. */
function garments(x, y, z) {
  const ax = Math.abs(x);
  const b = bodySDF(x, y, z);
  // jacket: fitted, a touch fuller across the shoulders, sleeves to the wrist, hem below the hip
  // (the hem flares a touch, so it clearly overhangs the trousers instead of meshing into them)
  const t = 0.0065 + 0.0015 * smooth(y, 1.3, 1.42) + 0.0035 * (1 - smooth(y, 0.9, 0.95));
  // it follows the body's own slope up to the collar (no flat cut across the shoulders); where it
  // stops and the shirt begins is drawn per pixel, so the cloth is one continuous surface (two nearly
  // coincident surfaces meshed into torn edges)
  const yc = collarLine(x, z), neck = groupDist('neck', x, y, z, 0.01);
  let jacket = Math.max(b - t, y - yc + 0.004);
  jacket = smax(jacket, 0.9 - y, 0.008);
  jacket = Math.max(jacket, -vNeck(x, y, z));
  // the collar: one band round the neck with a rounded lip, flowing out of the jacket
  const band = Math.max(smax(neck - 0.02, y - yc, 0.009), 1.44 - y);
  const shirtFront = Math.max(b - t + 0.0002, vNeck(x, y, z) - 0.012, y - yc + 0.004, 1.14 - y);
  jacket = smin(jacket, band, 0.012);
  const shirt = Math.min(shirtFront, band);
  // the tie: a knot at the collar and a blade down the shirt front, widening, then pointed
  const w = y > 1.44 ? 0.017 : THREE.MathUtils.lerp(0.033, 0.017, smooth(y, 1.24, 1.44)) * smooth(y, 1.17, 1.235);
  const blade = Math.max(b - 0.012, ax - w, slab(y, 1.17, 1.475), -z);
  const kx = x / 0.021, ky = (y - KNOT_Y) / 0.017, kz = (z - 0.07) / 0.03;
  const knot = (Math.hypot(kx, ky, kz) - 1) * 0.017;
  const tie = Math.min(blade, Math.max(knot, 0.03 - z));
  // trousers: each leg from the hip to the instep, a little room (not leggings), and the seat
  const leg = groupDist('leg', ax, y, z, 0.035);
  const hip = groupDist('torso', ax, y, z, 0.045);
  // under the jacket they stay thin (the jacket always covers them there); below it they have room
  const tt = THREE.MathUtils.lerp(0.013, 0.002, smooth(y, 0.85, 0.89));
  let trousers = Math.min(Math.max(leg - tt, slab(y, 0.105, 0.99)), smax(Math.max(hip - 0.002, y - 1.0, ax - 0.17), 0.84 - y, 0.03));
  // the legs are separate surfaces below a rounded crotch: a mesh bridging the two thighs stretched
  // into a web of torn strips as soon as the stance opened
  trousers = smax(trousers, -Math.max(ax - 0.015, y - 0.862), 0.022);
  // dress shoes: the foot, a little fuller, flat on the floor
  const foot = groupDist('foot', ax, y, z, 0.02);
  const shoes = Math.max(foot - 0.011, y - 0.12, -y);
  return [jacket, shirt, tie, trousers, shoes];
}

const tuxedo = (x, y, z) => Math.min(...garments(x, y, z));
const whichGarment = (x, y, z) => {
  const g = garments(x, y, z);
  let k = 0;
  for (let i = 1; i < g.length; i++) if (g[i] < g[k] - 1e-4) k = i;
  return k;
};

export const SHELLS = { a: 'midnight tuxedo' };

export class Shell {
  constructor(station) {
    this.kind = 'a';
    const t0 = performance.now();
    this.geo = meshFromSDF(tuxedo, new THREE.Vector3(-0.42, -0.02, -0.22), new THREE.Vector3(0.42, 1.6, 0.26), 0.0095, null, whichGarment);
    this.buildMs = performance.now() - t0;
    this.skel = createSkeleton();
    station.figure.add(this.skel.root);
    this.uni = {
      uSPhase: { value: new Float32Array(NB * 4) },
      uSliceDir: station.uni.uSliceDir,
      uSliceDepth: station.uni.uSliceDepth,
      uTime: station.uni.uTime,
      uOpenAll: { value: 0 },
      uWake: { value: 0 }, // attention (hover): the edges and the tie catch more light
      uEdge: { value: -1 },
      uGlint: { value: 0 }, // a controlled red glint along the tie (hover, re-engagement) // a band of light climbing the suit's edges (0..1 up the figure)
      uTie: { value: new THREE.Vector3() }, // the tie's lag and swing (figure space)
      uBreath: { value: 0 }, // the chest's rise and fall on the shirt and jacket front
      uSeam: { value: new THREE.Vector3() }, // light on a trouser seam: side, height, strength
      uSeamC: { value: new THREE.Color(0.72, 0.66, 1.0) },
      uGraze: { value: new THREE.Vector4() }, // a low model grazing the leg: figure-space position, strength
      uGrazeC: { value: new THREE.Color() },
    };
    this.mesh = new THREE.SkinnedMesh(this.geo, this.#material());
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.receiveShadow = true;
    station.figure.add(this.mesh);
    this.mesh.bind(this.skel.skeleton, new THREE.Matrix4());
    this.phase = new Float32Array(NB * 4);
  }

  #material() {
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.05, clearcoat: 0.4, clearcoatRoughness: 0.3, sheen: 0.6, sheenColor: new THREE.Color(0x8f80e0), sheenRoughness: 0.45, transparent: true, envMapIntensity: 1.2 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uni);
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform vec4 uSPhase[${NB}];
          uniform vec3 uSliceDir; uniform vec3 uSliceDepth; uniform float uTime; uniform vec3 uTie; uniform float uBreath; uniform vec3 uSeam; uniform vec4 uGraze;
          attribute float garment;
          varying float vSeam; varying float vGraze; varying float vLeg;
          varying vec4 vSPh; varying float vCap; varying float vSlabY; varying vec3 vGw; varying vec3 vRest;`,
        )
        .replace(
          '#include <skinning_vertex>',
          `#include <skinning_vertex>
          {
            ivec4 bi = ivec4(skinIndex);
            vec4 ph = uSPhase[bi.x] * skinWeight.x + uSPhase[bi.y] * skinWeight.y + uSPhase[bi.z] * skinWeight.z + uSPhase[bi.w] * skinWeight.w;
            vSlabY = transformed.y;
            vRest = position;
            float slab = floor(transformed.y / 0.07);
            float sh = sin(uTime * 0.55 - slab * 0.6) * 0.045 * clamp(ph.y, 0.0, 1.0);
            transformed += uSliceDir * sh + uSliceDepth * sh * 0.5;
            // the tie hangs from its knot: below it, it lags and swings a little (the tip most)
            float tieV = 1.0 - step(0.5, abs(garment - 2.0));
            float hang = clamp((1.475 - position.y) / 0.31, 0.0, 1.0);
            transformed += uTie * tieV * hang * hang;
            // a breath swells the front of the chest by a couple of millimetres; the tie rides on it
            float swell = smoothstep(1.16, 1.34, position.y) * (1.0 - smoothstep(1.4, 1.5, position.y)) * smoothstep(-0.02, 0.06, position.z) * (1.0 - smoothstep(0.12, 0.17, abs(position.x)));
            transformed.z += uBreath * 0.0028 * swell;
            // the outer seam of the trousers (only where a light is travelling)
            float tr = 1.0 - step(0.5, abs(garment - 3.0));
            float seamOn = tr + (1.0 - step(0.5, garment)) * smoothstep(0.9, 0.95, position.y); // trousers, then up the jacket's side
            float sy = (position.y - uSeam.y) / 0.14;
            vLeg = tr;
            vSeam = seamOn * smoothstep(0.35, 0.9, normal.x * uSeam.x) * exp(-sy * sy) * uSeam.z;
            // a passing model's colour grazes the leg nearest to it (trousers and shoes only)
            vec3 gd = transformed - uGraze.xyz;
            vGraze = uGraze.w * exp(-dot(gd, gd) / 0.07) * step(2.5, garment);
            vSPh = ph;
            // cut faces only where the garments are actually cut (hem, jacket top, trouser hem), never
            // the shoulders' upper surfaces (darkening those read as separate armour pieces)
            float cutPlane = max(1.0 - smoothstep(0.0, 0.014, abs(position.y - 0.9)), 1.0 - smoothstep(0.0, 0.014, abs(position.y - 0.105)));
            vCap = smoothstep(0.82, 0.97, abs(normal.y)) * cutPlane;
            // one-hot garment weights (shirt, tie, shoe), interpolated and thresholded: clean boundaries
            vGw = vec3(1.0 - step(0.5, abs(garment - 1.0)), 1.0 - step(0.5, abs(garment - 2.0)), step(3.5, garment));
          }`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vSeam; varying float vGraze; varying float vLeg; uniform float uTime; uniform vec3 uGrazeC; uniform vec3 uSeamC; varying vec4 vSPh; varying float vCap; varying float vSlabY; varying vec3 vGw; varying vec3 vRest;\nuniform float uOpenAll; uniform float uWake; uniform float uEdge; uniform float uGlint;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          // midnight navy (jacket, trousers), white shirt, deep red tie, dark polished shoes
          // the shirt's V and the tie are drawn analytically per pixel from the bind-pose position
          // (anti-aliased): their edges are crisp, never stepped by the mesh's triangles
          float gx = vRest.x, gy = vRest.y, gz = vRest.z, fw = max(fwidth(gx), 1e-4);
          float tw = gy > 1.44 ? 0.017 : mix(0.033, 0.017, smoothstep(1.24, 1.44, gy)) * smoothstep(1.17, 1.235, gy);
          float blade = smoothstep(-fw, fw, tw - abs(gx)) * smoothstep(1.168, 1.175, gy) * (1.0 - smoothstep(1.472, 1.478, gy)) * step(0.02, gz);
          float kd = length(vec3(gx / 0.021, (gy - 1.478) / 0.017, (gz - 0.07) / 0.03));
          float knot = (1.0 - smoothstep(0.96, 1.04, kd)) * step(0.03, gz);
          float isTie = max(blade, knot) * (1.0 - smoothstep(0.42, 0.58, vGw.z));
          float hw = 0.07 * smoothstep(1.2, 1.47, gy) + 0.004;
          float front = smoothstep(-fw, fw, hw - 0.002 - abs(gx)) * step(1.2, gy) * (1.0 - step(1.57, gy)) * step(0.012, gz);
          // the collar's line (see collarLine): the white band above it, the jacket below
          float nz = gz + 0.02, nr = length(vec2(gx, nz)), nc = nz / max(nr, 1e-5);
          float yc = 1.553 + 0.011 * smoothstep(0.0, 1.0, -nc) - 0.042 * smoothstep(0.3, 1.0, nc);
          float fy = max(fwidth(gy), 1e-4);
          float collar = smoothstep(yc - 0.016 - fy, yc - 0.016 + fy, gy) * (1.0 - smoothstep(0.094, 0.1, nr));
          float isShirt = max(front, collar) * (1.0 - isTie);
          // the collar's two leaves, drawn: a soft fold from the knot out to each point and back up
          float ax = abs(gx);
          vec2 pk = vec2(ax, gy), k0 = vec2(0.018, 1.468), k1 = vec2(0.058, 1.432), k2 = vec2(0.09, 1.505);
          vec2 e0 = k1 - k0, e1 = k2 - k1;
          float d0 = length(pk - k0 - e0 * clamp(dot(pk - k0, e0) / dot(e0, e0), 0.0, 1.0));
          float d1 = length(pk - k1 - e1 * clamp(dot(pk - k1, e1) / dot(e1, e1), 0.0, 1.0));
          float leaf = (1.0 - smoothstep(0.0012, 0.0052, min(d0, d1))) * step(0.012, gz) * front;
          float isShoe = smoothstep(0.42, 0.58, vGw.z);
          vec3 col = vec3(0.028, 0.034, 0.075);
          col = mix(col, vec3(0.78, 0.77, 0.82) * (1.0 - 0.42 * leaf), isShirt);
          col = mix(col, vec3(0.42, 0.03, 0.06), isTie);
          col = mix(col, vec3(0.012, 0.012, 0.018), isShoe);
          diffuseColor.rgb = col;`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.62, isShirt);
          roughnessFactor = mix(roughnessFactor, 0.32, isTie);
          roughnessFactor = mix(roughnessFactor, 0.16, isShoe);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          vec3 vd = normalize(vViewPosition);
          float rim = pow(1.0 - clamp(abs(dot(normal, vd)), 0.0, 1.0), 2.4);
          // the layers keep the suit as broad planes; the information state opens it (the tie last)
          float open = clamp(max(vSPh.w * 1.1, vSPh.y * 0.12) + uOpenAll, 0.0, 1.0) * (1.0 - 0.75 * isTie);
          vec3 edge = mix(vec3(0.5, 0.46, 0.95), vec3(1.0, 0.3, 0.32), isTie);
          totalEmissiveRadiance += edge * rim * (0.1 + 0.18 * uWake + 1.3 * open) * (1.0 - isShirt * 0.6);
          // attended: a band of light climbs the edges (lapels, sleeves, hems)
          totalEmissiveRadiance += vec3(0.62, 0.56, 1.0) * rim * exp(-(((vSlabY / 1.62 - uEdge) / 0.035)*((vSlabY / 1.62 - uEdge) / 0.035))) * 0.9 * (1.0 - isShirt);
          // the shirt gets a little of the stage's light; the tie a small highlight when attended
          totalEmissiveRadiance += vec3(0.16, 0.15, 0.2) * isShirt;
          totalEmissiveRadiance += uSeamC * vSeam;
          // the legs carry a faint living edge: light travels slowly down them, stronger toward the feet
          float legK = vLeg * (0.45 + 0.55 * smoothstep(0.95, 0.15, vSlabY));
          float legW = 0.5 + 0.5 * sin(vSlabY * 9.0 + uTime * 0.85 + 2.0 * sign(vRest.x));
          totalEmissiveRadiance += vec3(0.46, 0.4, 0.98) * rim * legK * (0.26 + 0.42 * legW * legW + 0.3 * uWake);
          totalEmissiveRadiance += uGrazeC * vGraze * (0.1 + 1.5 * rim);
          totalEmissiveRadiance += vec3(0.5, 0.05, 0.08) * isTie * (0.12 + 0.35 * uWake);
          // the glint travels down the tie (a red light trace, then gone)
          totalEmissiveRadiance += vec3(1.0, 0.18, 0.2) * isTie * uGlint * exp(-(((vSlabY - (1.46 - 0.32 * (1.0 - uGlint))) / 0.05)*((vSlabY - (1.46 - 0.32 * (1.0 - uGlint))) / 0.05))) * 1.6;
          // cut faces (hems, cuffs, the inside of the clothes) light only when the suit opens
          totalEmissiveRadiance += vec3(0.6, 0.55, 1.0) * vCap * 1.1 * open * (1.0 - isShoe);
          diffuseColor.rgb *= 1.0 - 0.85 * vCap * (1.0 - open) * (1.0 - isShirt);
          vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          totalEmissiveRadiance += vec3(0.07, 0.06, 0.14) * smoothstep(-0.05, -0.75, nW.y) * (1.0 - vCap);
          float slF = fract(vSlabY / 0.07);
          totalEmissiveRadiance += vec3(0.6, 0.55, 1.0) * smoothstep(0.08, 0.0, slF) * clamp(vSPh.y, 0.0, 1.0) * 0.8;`,
        )
        .replace(
          '#include <opaque_fragment>',
          `float a = 1.0 - 0.92 * open * (1.0 - 0.75 * max(rim, vCap));
          if (a < 0.02) discard;
          gl_FragColor = vec4(outgoingLight, a);`,
        );
    };
    mat.customProgramCacheKey = () => 'profile-tuxedo';
    return mat;
  }

  /** A red glint that runs down the tie (k 0..1). */
  glint(k = 1) {
    this._glintGoal = Math.max(this._glintGoal ?? 0, k);
  }

  /** A small impulse to the tie (a temporal echo of a movement). */
  kick(k = 1) {
    this._tieV = (this._tieV ?? new THREE.Vector3()).add(new THREE.Vector3(0.05 * k, 0, 0.03 * k));
  }

  update(dt, bodyPhase, frame, open = 0, wake = 0) {
    for (let i = 0; i < NB * 4; i++) {
      const g = bodyPhase[i];
      this.phase[i] += (g - this.phase[i]) * Math.min(1, dt * (g > this.phase[i] ? 1.3 : 0.75));
    }
    this.uni.uSPhase.value.set(this.phase);
    this.uni.uOpenAll.value = open;
    this.uni.uWake.value = wake;
    // the glint rises over a few frames (never pops on) and runs down as it fades
    this._glintGoal = Math.max(0, (this._glintGoal ?? 0) - dt * 1.4);
    this._glint = (this._glint ?? 0) + (this._glintGoal - (this._glint ?? 0)) * Math.min(1, dt * ((this._glintGoal > (this._glint ?? 0)) ? 9 : 3));
    this.uni.uGlint.value = this._glint;
    const B = this.skel.bones;
    for (let i = 0; i < B.length; i++) {
      B[i].quaternion.fromArray(frame.q, i * 4);
      B[i].position.fromArray(frame.p, i * 3);
    }
    B[0].updateMatrixWorld(true);
    // the tie: a damped pendulum driven by the chest's acceleration (lags, swings, settles); a
    // couple of centimetres at most, never floppy
    const fig = this.skel.root.parent;
    const chest = this._cp ??= new THREE.Vector3();
    const prev = (this._cpPrev ??= new THREE.Vector3()).copy(chest);
    chest.setFromMatrixPosition(B[CHEST].matrixWorld);
    fig.worldToLocal(chest);
    const d = Math.max(1e-3, Math.min(dt, 1 / 20));
    const vel = (this._cvel ??= new THREE.Vector3());
    const v1 = new THREE.Vector3().subVectors(chest, prev).divideScalar(d);
    const acc = new THREE.Vector3().subVectors(v1, vel).divideScalar(d);
    if (!this._tieInit) (this._tieInit = true), acc.set(0, 0, 0);
    vel.copy(v1);
    const X = this.uni.uTie.value, V = (this._tieV ??= new THREE.Vector3());
    const w = 9, z = 0.32;
    V.addScaledVector(X, -w * w * d).addScaledVector(V, -2 * z * w * d).addScaledVector(acc.clampLength(0, 6), -d);
    X.addScaledVector(V, d).clampLength(0, 0.022);
    X.y = Math.min(0, X.y) * 0.3;
  }
}
