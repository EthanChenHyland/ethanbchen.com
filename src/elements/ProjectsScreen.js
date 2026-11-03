import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { patchMaterial } from '../gl/patch.js';
import { hashGLSL, worldPosVaryingVertex } from '../gl/glsl.js';
import { mulberry32 } from '../gl/noise.js';

// The Projects screen is a boundary between the station and a digital space far deeper than the
// chassis around it. Anything past the glass is drawn only where the view ray actually passes
// through the glass, and its depth is written just behind the glass, so the world outside treats
// the interior as an image on the screen while the interior still sorts itself correctly. Seen
// from the side or the back nothing inside exists.

// warm white with a vermilion cast (linear)
export const PHOSPHOR = new THREE.Vector3(1.0, 0.7, 0.52);

// How an object is represented, as a function of its distance past the glass (world units). One
// function of position drives every representation, in both directions: going in, an object is
// segmented, sliced, reduced to edges, then to samples that settle onto a lattice; coming out, the
// same stages run backwards.
export const STAGE = {
  seg: 0.3, // segmentation seams grow over the last stretch before the glass
  contour: 0.2, // contour slices replace the surface, then end
  wireIn: 0.04,
  wireOut: 0.46,
  ptsIn: 0.24,
  quantA: 0.44, // samples start settling onto the lattice
  quantB: 0.68,
  fadeA: 6.4, // the far end of the digital space swallows what reaches it
  fadeB: 7.7,
};

export const SCREEN_GLSL = /* glsl */ `
uniform mat4 uScrInv;
uniform mat4 uScrMat;
uniform vec2 uScrHalf;
uniform float uScrR;
uniform mat4 uProj;
// distance past the glass
float scrS(vec3 wp) { return -(uScrInv * vec4(wp, 1.0)).z; }
// For a point past the glass: is it seen through the (rounded) glass, and at what depth should
// it be written so that everything outside the screen treats it as lying on the glass?
bool scrSee(vec3 wp, out float depth) {
  depth = 1.0;
  vec3 c = (uScrInv * vec4(cameraPosition, 1.0)).xyz;
  vec3 p = (uScrInv * vec4(wp, 1.0)).xyz;
  if (c.z <= 0.0 || p.z >= 0.0) return false;
  vec2 x = mix(c.xy, p.xy, c.z / (c.z - p.z));
  vec2 q = abs(x) - (uScrHalf - uScrR);
  if (length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) > uScrR) return false;
  vec3 xw = (uScrMat * vec4(x, 0.0, 1.0)).xyz;
  // a few millimetres behind the glass, ordered by true depth
  vec3 f = xw + normalize(wp - cameraPosition) * (0.003 + 0.004 * -p.z);
  vec4 cp = uProj * viewMatrix * vec4(f, 1.0);
  depth = 0.5 + 0.5 * cp.z / cp.w;
  return true;
}
// the far end of the digital space
float scrFar(float s) { return 1.0 - smoothstep(${STAGE.fadeA.toFixed(2)}, ${STAGE.fadeB.toFixed(2)}, s); }
`;

const PH = `vec3(${PHOSPHOR.toArray().map((v) => v.toFixed(3)).join(', ')})`;

/** Uniforms shared by everything that lives behind (or crosses) the glass. */
export function makeScreenUniforms(camera, half, radius) {
  return {
    uScrInv: { value: new THREE.Matrix4() },
    uScrMat: { value: new THREE.Matrix4() },
    uScrHalf: { value: half.clone() },
    uScrR: { value: radius },
    uProj: { value: camera.projectionMatrix },
  };
}

// ---- the digital space ----

/** A tapering room behind the glass: dark walls, a sparse measuring lattice, receding edges. */
function interiorRoom(scr, depth) {
  const f = [1.62, 1.12]; // a little larger than the glass so oblique views never see past it
  const b = [3.4, 2.3];
  const z0 = -0.02, z1 = -depth;
  const P = (sx, sy, front) => (front ? [sx * f[0], sy * f[1], z0] : [sx * b[0], sy * b[1], z1]);
  const quads = [
    // [corner a, b, c, d] counter-clockwise as seen from inside, + face id
    [P(-1, -1, 1), P(-1, -1, 0), P(-1, 1, 0), P(-1, 1, 1), 0], // left
    [P(1, -1, 0), P(1, -1, 1), P(1, 1, 1), P(1, 1, 0), 0], // right
    [P(-1, -1, 0), P(-1, -1, 1), P(1, -1, 1), P(1, -1, 0), 1], // floor
    [P(-1, 1, 1), P(-1, 1, 0), P(1, 1, 0), P(1, 1, 1), 1], // ceiling
    [P(-1, -1, 0), P(1, -1, 0), P(1, 1, 0), P(-1, 1, 0), 2], // back
  ];
  const pos = [], uv = [], face = [];
  for (const [a, bb, c, d, id] of quads) {
    for (const [p, u] of [[a, [0, 0]], [bb, [1, 0]], [c, [1, 1]], [a, [0, 0]], [c, [1, 1]], [d, [0, 1]]]) {
      pos.push(...p);
      uv.push(...u);
      face.push(id);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aFace', new THREE.Float32BufferAttribute(face, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...scr },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float aFace;
      varying vec3 vW;
      varying vec3 vL;
      varying vec2 vUv;
      varying float vFace;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz; vL = position; vUv = uv; vFace = aFace;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      ${SCREEN_GLSL}
      varying vec3 vW;
      varying vec3 vL;
      varying vec2 vUv;
      varying float vFace;
      void main() {
        float fd;
        if (!scrSee(vW, fd)) discard;
        gl_FragDepth = fd;
        float s = -vL.z;
        float k = s / ${depth.toFixed(1)};
        vec3 col = mix(vec3(0.010, 0.012, 0.022), vec3(0.002, 0.003, 0.006), smoothstep(0.0, 0.85, k));
        // the four edges running away from the glass
        vec2 e = min(vUv, 1.0 - vUv);
        float edgeU = vFace < 1.5 ? e.y : e.x;
        float ew = fwidth(edgeU);
        float edge = 1.0 - smoothstep(ew * 0.6, ew * 1.8, edgeU);
        if (vFace > 1.5) edge = 0.0;
        // a sparse lattice of dots on the walls
        vec2 g = vFace < 0.5 ? vL.zy : vFace < 1.5 ? vL.xz : vL.xy;
        vec2 cell = abs(fract(g / 0.5) - 0.5) * 0.5;
        float dotw = fwidth(g.x) * 1.4 + 0.004;
        float dots = 1.0 - smoothstep(dotw, dotw * 1.8, length(cell));
        float fade = exp(-s * 0.22);
        col += ${PH} * (edge * 0.09 + dots * 0.03) * fade;
        // a faint warmth far down the room
        if (vFace > 1.5) col += ${PH} * 0.012 * smoothstep(0.75, 0.0, length(vUv - 0.5));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

/** A software window frame floating in the digital space; the front one holds code and a caret. */
function interiorWindow(scr, uTime, { w, h, code = 0, glow = 1 }) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...scr, uTime, uSize: { value: new THREE.Vector2(w, h) }, uCode: { value: code }, uGlow: { value: glow } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec3 vW;
      varying vec2 vUv;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz; vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      ${SCREEN_GLSL}
      ${hashGLSL}
      uniform float uTime;
      uniform vec2 uSize;
      uniform float uCode;
      uniform float uGlow;
      varying vec3 vW;
      varying vec2 vUv;
      float box(vec2 p, vec2 lo, vec2 hi) {
        vec2 aa = fwidth(p) * 0.75;
        vec2 a = smoothstep(lo - aa, lo + aa, p) * (1.0 - smoothstep(hi - aa, hi + aa, p));
        return a.x * a.y;
      }
      void main() {
        float fd;
        if (!scrSee(vW, fd)) discard;
        gl_FragDepth = fd;
        vec2 p = vUv * uSize;
        vec2 d = min(p, uSize - p);
        float t = 0.012;
        vec2 aa = fwidth(p);
        float frame = 1.0 - smoothstep(t, t + aa.x * 1.5, min(d.x, d.y));
        float bar = 0.085;
        float title = box(p, vec2(0.0, uSize.y - bar), uSize);
        float rule = box(p, vec2(0.0, uSize.y - bar - t), vec2(uSize.x, uSize.y - bar));
        float knobs = 0.0;
        for (int i = 0; i < 3; i++) {
          vec2 c = vec2(0.06 + float(i) * 0.05, uSize.y - bar * 0.5);
          knobs += 1.0 - smoothstep(0.012, 0.012 + aa.x * 1.5, length(p - c));
        }
        float a = frame * 0.45 + title * 0.05 + rule * 0.3 + knobs * 0.3;
        if (uCode > 0.5) {
          // short indented lines of code and a blinking caret after the last one
          float lh = 0.07;
          float row = floor((uSize.y - bar - 0.05 - p.y) / lh);
          float yIn = fract((uSize.y - bar - 0.05 - p.y) / lh);
          if (row >= 0.0 && row < 7.0) {
            float ind = floor(hash11(row * 7.1) * 3.0) * 0.06;
            float len = 0.18 + hash11(row * 3.3 + 1.0) * (uSize.x - 0.42 - ind);
            if (row == 6.0) len = 0.22;
            float on = box(vec2(p.x, yIn), vec2(0.08 + ind, 0.32), vec2(0.08 + ind + len, 0.62));
            a += on * 0.32;
            if (row == 6.0) {
              float caret = box(vec2(p.x, yIn), vec2(0.1 + ind + len, 0.18), vec2(0.122 + ind + len, 0.86));
              a += caret * step(0.5, fract(uTime * 0.9)) * 1.4;
            }
          }
        }
        float s = scrS(vW);
        a *= uGlow * exp(-s * 0.12) * scrFar(s);
        if (a < 0.002) discard;
        gl_FragColor = vec4(${PH} * a, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.frustumCulled = false;
  return mesh;
}

/** Everything behind the glass: the room and a few windows at increasing depth. */
export function buildInterior(scr, uTime) {
  const g = new THREE.Group();
  g.name = 'projects-interior';
  g.add(interiorRoom(scr, 8));
  const wins = [
    { x: -0.86, y: -0.46, z: -0.42, w: 1.0, h: 0.62, code: 1, glow: 0.75 },
    { x: 0.95, y: 0.42, z: -1.9, w: 1.5, h: 0.95, glow: 0.42 },
    { x: -1.1, y: 0.55, z: -3.6, w: 2.0, h: 1.25, glow: 0.34 },
    { x: 0.6, y: -0.35, z: -5.8, w: 2.6, h: 1.6, glow: 0.3 },
  ];
  for (const o of wins) {
    const m = interiorWindow(scr, uTime, o);
    m.position.set(o.x, o.y, o.z);
    g.add(m);
  }
  return g;
}

// ---- objects that cross the glass ----

const PART_GEO = {
  box: (s) => new THREE.BoxGeometry(s[0], s[1], s[2]),
  node: (s) => new THREE.IcosahedronGeometry(s[0], 0),
};

/**
 * A physical object built from simple parts, drawn three ways at once: its surface, its edges and
 * samples of its surface. Which of them shows at any point depends only on how far past the glass
 * that point is.
 */
export class CrossingObject {
  constructor(ctx, scr, { parts, roughness = 0.6, metalness = 0.15, samples = 1100, grid = 0.085, seed = 1 }) {
    this.group = new THREE.Group();
    this.uniforms = { uObjS: { value: -10 } };
    const solids = [], edges = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
    for (const p of parts) {
      let geo = PART_GEO[p.type](p.size);
      if (geo.index) geo = geo.toNonIndexed();
      e.set(...(p.rot ?? [0, 0, 0]));
      m.compose(new THREE.Vector3(...p.pos), q.setFromEuler(e), one);
      const col = new THREE.Color(p.color);
      const n = geo.attributes.position.count;
      const c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.toArray(c, i * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
      geo.deleteAttribute('uv');
      geo.applyMatrix4(m);
      solids.push(geo);
      const eg = new THREE.EdgesGeometry(PART_GEO[p.type](p.size), 25);
      eg.applyMatrix4(m);
      edges.push(eg);
    }
    const solidGeo = mergeGeometries(solids);
    const edgeGeo = mergeGeometries(edges);

    const shared = { ...scr, ...this.uniforms };
    this.solid = new THREE.Mesh(solidGeo, this.#solidMaterial(shared, roughness, metalness));
    this.solid.castShadow = true;
    this.solid.receiveShadow = true;
    this.solid.customDepthMaterial = this.#depthMaterial(shared);
    this.wire = new THREE.LineSegments(edgeGeo, this.#wireMaterial(shared));
    this.points = new THREE.Points(this.#sample(solidGeo, samples, seed), this.#pointsMaterial(shared, ctx, grid));
    for (const o of [this.solid, this.wire, this.points]) {
      o.frustumCulled = false;
      this.group.add(o);
    }
    this._v = new THREE.Vector3();
  }

  #solidMaterial(u, roughness, metalness) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness });
    patchMaterial(mat, {
      key: 'proj-cross-solid',
      uniforms: u,
      vertexHeader: 'varying vec3 vWPos; varying vec3 vLoc; varying vec3 vLocN;',
      vertex: { begin_vertex: `#include <begin_vertex>\nvLoc = position; vLocN = objectNormal;\n${worldPosVaryingVertex}` },
      fragmentHeader: `${SCREEN_GLSL}\nuniform float uObjS;\nvarying vec3 vWPos; varying vec3 vLoc; varying vec3 vLocN;`,
      fragment: {
        clipping_planes_fragment: /* glsl */ `
          #include <clipping_planes_fragment>
          float sP = scrS(vWPos);
          float fdP = gl_FragCoord.z;
          float slice = 0.0;
          if (sP > 0.0) {
            // past the glass the surface survives only as thin contour slices across the object
            if (sP > ${STAGE.contour.toFixed(3)} || !scrSee(vWPos, fdP)) discard;
            float rel = (sP - uObjS) / 0.05;
            float w = mix(0.4, 0.12, sP / ${STAGE.contour.toFixed(3)});
            if (abs(fract(rel) - 0.5) > w * 0.5) discard;
            slice = 1.0;
          }
          gl_FragDepth = fdP;
          // approaching the glass, the surface is parsed into cells: seams along a lattice
          float segK = smoothstep(-${STAGE.seg.toFixed(3)}, -0.02, sP) * (1.0 - slice);
          vec3 gl3 = vLoc / 0.15;
          vec3 near = (0.5 - abs(fract(gl3) - 0.5)) / max(fwidth(gl3), vec3(1e-4));
          near += step(0.6, abs(normalize(vLocN))) * 1e4;
          float seam = (1.0 - smoothstep(0.6, 1.7, min(min(near.x, near.y), near.z))) * segK;
          // where the glass cuts the object, a bright section line
          float cut = (1.0 - smoothstep(0.004, 0.02, -sP)) * (1.0 - slice);`,
        color_fragment: `#include <color_fragment>\ndiffuseColor.rgb *= (1.0 - seam * 0.75) * (1.0 - slice * 0.9) * (1.0 - cut);`,
        emissivemap_fragment: `#include <emissivemap_fragment>\ntotalEmissiveRadiance += ${PH} * (seam * (0.2 + 1.4 * segK * segK) + slice * 0.9 + cut * 1.7);`,
      },
    });
    return mat;
  }

  #depthMaterial(u) {
    // the shadow comes only from the part still in the world
    const mat = new THREE.MeshDepthMaterial();
    patchMaterial(mat, {
      key: 'proj-cross-depth',
      uniforms: { uScrInv: u.uScrInv },
      vertexHeader: 'varying vec3 vWPos;',
      vertex: { begin_vertex: `#include <begin_vertex>\n${worldPosVaryingVertex}` },
      fragmentHeader: 'uniform mat4 uScrInv; varying vec3 vWPos;',
      fragment: { clipping_planes_fragment: '#include <clipping_planes_fragment>\nif (-(uScrInv * vec4(vWPos, 1.0)).z > 0.0) discard;' },
    });
    return mat;
  }

  #wireMaterial(u) {
    return new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec3 vW;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vW = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        ${SCREEN_GLSL}
        varying vec3 vW;
        void main() {
          float s = scrS(vW);
          float a = smoothstep(${STAGE.wireIn.toFixed(3)}, ${(STAGE.wireIn + 0.12).toFixed(3)}, s)
                  * (1.0 - smoothstep(${(STAGE.wireOut - 0.14).toFixed(3)}, ${(STAGE.wireOut + 0.1).toFixed(3)}, s));
          if (a < 0.003) discard;
          float fd;
          if (!scrSee(vW, fd)) discard;
          gl_FragDepth = fd;
          gl_FragColor = vec4(${PH} * a * 0.85, 1.0);
        }`,
    });
  }

  #sample(geo, count, seed) {
    const sampler = new MeshSurfaceSampler(new THREE.Mesh(geo)).setRandomGenerator(mulberry32(seed)).build();
    const pos = new Float32Array(count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      sampler.sample(v);
      v.toArray(pos, i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }

  #pointsMaterial(u, ctx, grid) {
    return new THREE.ShaderMaterial({
      uniforms: { ...u, uScale: ctx.uniforms.uPointScale, uGrid: { value: grid } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        ${SCREEN_GLSL}
        uniform float uScale;
        uniform float uGrid;
        varying vec3 vW;
        varying float vA;
        varying float vQ;
        void main() {
          float s0 = scrS((modelMatrix * vec4(position, 1.0)).xyz);
          // deeper in, samples settle onto a lattice in the object's own frame
          vQ = smoothstep(${STAGE.quantA.toFixed(3)}, ${STAGE.quantB.toFixed(3)}, s0);
          vec3 lp = mix(position, (floor(position / uGrid) + 0.5) * uGrid, vQ);
          vec4 wp = modelMatrix * vec4(lp, 1.0);
          vW = wp.xyz;
          vA = smoothstep(${STAGE.ptsIn.toFixed(3)}, ${(STAGE.ptsIn + 0.16).toFixed(3)}, s0) * scrFar(s0);
          vec4 mv = viewMatrix * wp;
          gl_Position = projectionMatrix * mv;
          gl_PointSize = vA > 0.002 ? max(mix(0.02, 0.042, vQ) * uScale / -mv.z, 1.0) : 0.0;
        }`,
      fragmentShader: /* glsl */ `
        ${SCREEN_GLSL}
        varying vec3 vW;
        varying float vA;
        varying float vQ;
        void main() {
          vec2 c = abs(gl_PointCoord - 0.5) * 2.0;
          float d = mix(length(c), max(c.x, c.y), vQ);
          float shape = 1.0 - smoothstep(mix(0.3, 0.7, vQ), 1.0, d);
          float fd;
          if (shape < 0.01 || !scrSee(vW, fd)) discard;
          gl_FragDepth = fd;
          float s = scrS(vW);
          gl_FragColor = vec4(${PH} * shape * vA * mix(0.75, 0.32, vQ) * exp(-s * 0.05), 1.0);
        }`,
    });
  }

  /** Call after the object's transform changes; `scrInv` maps world to screen space. */
  update(scrInv) {
    this.group.getWorldPosition(this._v).applyMatrix4(scrInv);
    this.uniforms.uObjS.value = -this._v.z;
  }
}

// An unresolved assembly: blocks, rods and nodes that do not agree with one another.
// Its long axis runs along z (it crosses the glass along it), drawn out a little.
const stretch = (parts, k) => parts.map((p) => ({ ...p, pos: [p.pos[0], p.pos[1], p.pos[2] * k] }));
export const PROBLEM_PARTS = stretch([
  { type: 'box', size: [0.42, 0.3, 0.5], pos: [-0.15, 0.05, 0.36], rot: [0.3, 0.5, 0.1], color: '#a8a39a' },
  { type: 'box', size: [0.3, 0.36, 0.34], pos: [0.22, -0.12, 0.06], rot: [-0.4, 0.2, 0.6], color: '#4d5560' },
  { type: 'box', size: [0.5, 0.16, 0.28], pos: [0.04, 0.2, -0.3], rot: [0.2, -0.7, 0.3], color: '#6a6763' },
  { type: 'box', size: [0.22, 0.22, 0.22], pos: [-0.3, -0.18, -0.22], rot: [0.8, 0.3, 0.2], color: '#a8a39a' },
  { type: 'box', size: [0.34, 0.12, 0.4], pos: [0.26, 0.22, 0.44], rot: [-0.2, 0.9, -0.3], color: '#4d5560' },
  { type: 'box', size: [0.18, 0.3, 0.18], pos: [0.0, -0.25, -0.55], rot: [0.5, 0.1, 0.9], color: '#6a6763' },
  { type: 'box', size: [0.035, 0.035, 1.1], pos: [0.05, 0.0, 0.0], rot: [0.25, 0.35, 0.0], color: '#8a8e93' },
  { type: 'box', size: [0.035, 0.035, 0.8], pos: [-0.1, 0.1, -0.1], rot: [1.1, 0.2, 0.4], color: '#8a8e93' },
  { type: 'box', size: [0.035, 0.035, 0.7], pos: [0.2, -0.05, -0.35], rot: [0.3, -0.9, 1.2], color: '#8a8e93' },
  { type: 'node', size: [0.09], pos: [-0.33, 0.28, -0.05], color: '#a8a39a' },
  { type: 'node', size: [0.08], pos: [0.34, -0.28, 0.3], color: '#4d5560' },
  { type: 'node', size: [0.085], pos: [0.15, 0.33, -0.55], color: '#a8a39a' },
], 1.25);

// The same vocabulary resolved: blocks on a common grid, straight rails, nodes at their ends.
export const RESOLVED_PARTS = [
  { type: 'box', size: [0.8, 0.06, 1.1], pos: [0, -0.2, 0], color: '#b8b1a4' },
  { type: 'box', size: [0.3, 0.2, 0.3], pos: [-0.2, -0.07, -0.36], color: '#b8b1a4' },
  { type: 'box', size: [0.3, 0.32, 0.3], pos: [0.2, -0.01, -0.36], color: '#b8b1a4' },
  { type: 'box', size: [0.3, 0.26, 0.3], pos: [-0.2, -0.04, 0.0], color: '#b8b1a4' },
  { type: 'box', size: [0.3, 0.14, 0.3], pos: [0.2, -0.1, 0.0], color: '#b8b1a4' },
  { type: 'box', size: [0.3, 0.38, 0.3], pos: [-0.2, 0.02, 0.36], color: '#b8b1a4' },
  { type: 'box', size: [0.3, 0.2, 0.3], pos: [0.2, -0.07, 0.36], color: '#c4472f' },
  { type: 'box', size: [0.035, 0.035, 1.1], pos: [-0.43, -0.15, 0], color: '#3a3c40' },
  { type: 'box', size: [0.035, 0.035, 1.1], pos: [0.43, -0.15, 0], color: '#3a3c40' },
  { type: 'node', size: [0.06], pos: [-0.43, -0.15, -0.58], color: '#b8b1a4' },
  { type: 'node', size: [0.06], pos: [0.43, -0.15, 0.58], color: '#b8b1a4' },
];
