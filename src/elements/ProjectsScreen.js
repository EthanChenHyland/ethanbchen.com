import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { patchMaterial } from '../gl/patch.js';
import { worldPosVaryingVertex } from '../gl/glsl.js';
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

/**
 * For things that move freely between the interior and the station (holograms, wires, beads): a
 * point is inside the computer only if it is behind the glass and within the glass's outline (the
 * glass plane itself runs on past the screen); only those points are drawn through the glass.
 * Returns false if the fragment must be discarded; `fd` is the depth to write, `s` the distance past
 * the glass (negative in front).
 */
export const BOUND_GLSL = /* glsl */ `
bool scrBound(vec3 w, out float fd, out float s) {
  fd = gl_FragCoord.z;
  vec3 sl = (uScrInv * vec4(w, 1.0)).xyz;
  s = -sl.z;
  bool inside = sl.z < 0.0 && sl.z > -9.0 && abs(sl.x) < uScrHalf.x + 0.15 && abs(sl.y) < uScrHalf.y + 0.15;
  if (!inside) { s = min(s, 0.0); return true; }
  return scrSee(w, fd);
}
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

/** The digital space behind the glass. Project scenes are added to it by the projects themselves. */
export function buildInterior(scr) {
  const g = new THREE.Group();
  g.name = 'projects-interior';
  g.add(interiorRoom(scr, 8));
  return g;
}

// ---- objects that cross the glass, and the portals ----

// Every object can be cut by up to two planes (a portal it is passing through keeps only the part on
// its side), and can be marked physical: then it is drawn as an ordinary object wherever it is.
// That matters because the glass plane runs on below the screen: the head leans back, so the deck in
// front of the console lies geometrically "behind" the glass and would otherwise be masked away.
export const CLIP_GLSL = /* glsl */ `
uniform vec4 uClip0;
uniform vec4 uClip1;
uniform float uPhys;
// distance to the nearest active cutting plane (an inactive plane is (0, 0, 0, 1))
float clipDist(vec3 w) { return min(dot(uClip0.xyz, w) + uClip0.w, dot(uClip1.xyz, w) + uClip1.w); }
float stageS(vec3 w) { return uPhys > 0.5 ? -1.0 : scrS(w); }
`;
export const NO_CLIP = new THREE.Vector4(0, 0, 0, 1);

const PART_GEO = {
  box: (s) => new THREE.BoxGeometry(s[0], s[1], s[2]),
  node: (s) => new THREE.IcosahedronGeometry(s[0], 0),
  cyl: (s) => new THREE.CylinderGeometry(s[0], s[1] ?? s[0], s[2], s[3] ?? 18),
  rbox: (s) => new RoundedBoxGeometry(s[0], s[1], s[2], 2, s[3] ?? 0.012),
};

/**
 * Geometry for an object built from simple parts: surface (with vertex colours), edges, and samples
 * of the surface. Built once and shared by every instance of the object.
 */
export function buildCrossingGeometry(parts, { samples = 1100, seed = 1 } = {}) {
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
  const solid = mergeGeometries(solids);
  solid.computeBoundingBox();
  solid.computeBoundingSphere();
  const sampler = new MeshSurfaceSampler(new THREE.Mesh(solid)).setRandomGenerator(mulberry32(seed)).build();
  const pos = new Float32Array(samples * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < samples; i++) {
    sampler.sample(v);
    v.toArray(pos, i * 3);
  }
  const points = new THREE.BufferGeometry();
  points.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return { solid, edges: mergeGeometries(edges), points, box: solid.boundingBox, radius: solid.boundingSphere.radius };
}

/** Corner brackets around a box plus a row of confidence ticks above it: a detection frame. */
function trackerGeometry(box, pad = 0.06) {
  const lo = box.min.clone().subScalar(pad), hi = box.max.clone().addScalar(pad);
  const k = Math.min(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z) * 0.3;
  const pos = [], tick = [];
  for (const x of [lo.x, hi.x]) for (const y of [lo.y, hi.y]) for (const z of [lo.z, hi.z]) {
    const sx = x === lo.x ? 1 : -1, sy = y === lo.y ? 1 : -1, sz = z === lo.z ? 1 : -1;
    pos.push(x, y, z, x + sx * k, y, z, x, y, z, x, y + sy * k, z, x, y, z, x, y, z + sz * k);
    for (let i = 0; i < 6; i++) tick.push(-1);
  }
  // five confidence ticks standing on the top edge
  for (let i = 0; i < 5; i++) {
    const x = THREE.MathUtils.lerp(lo.x, hi.x, 0.2 + i * 0.15);
    pos.push(x, hi.y + 0.02, hi.z, x, hi.y + 0.065, hi.z);
    tick.push(i, i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aTick', new THREE.Float32BufferAttribute(tick, 1));
  return g;
}

/**
 * One drawn instance of a physical object, rendered three ways at once: its surface, its edges and
 * samples of its surface. Which of them shows at any point depends only on how far past the glass
 * that point is. Several instances can share one geometry (a portal draws an object on both sides).
 */
export class CrossingObject {
  constructor(ctx, scr, geo, { roughness = 0.6, metalness = 0.15, grid = 0.085, tracker = false } = {}) {
    this.geo = geo;
    this.radius = geo.radius;
    this.group = new THREE.Group();
    this.uniforms = {
      uObjS: { value: -10 },
      uClip0: { value: NO_CLIP.clone() },
      uClip1: { value: NO_CLIP.clone() },
      uPhys: { value: 0 },
      uConf: { value: 0 },
      uTrack: { value: 0 },
      uFlash: { value: 0 },
    };
    const shared = { ...scr, ...this.uniforms };
    this.solid = new THREE.Mesh(geo.solid, this.#solidMaterial(shared, roughness, metalness));
    this.solid.castShadow = true;
    this.solid.receiveShadow = true;
    this.solid.customDepthMaterial = this.#depthMaterial(shared);
    this.wire = new THREE.LineSegments(geo.edges, this.#wireMaterial(shared));
    this.points = new THREE.Points(geo.points, this.#pointsMaterial(shared, ctx, grid));
    for (const o of [this.solid, this.wire, this.points]) {
      o.frustumCulled = false;
      this.group.add(o);
    }
    if (tracker) {
      this.tracker = new THREE.LineSegments(trackerGeometry(geo.box), this.#trackerMaterial(shared));
      this.tracker.frustumCulled = false;
      this.group.add(this.tracker);
    }
    this.group.visible = false;
    this._v = new THREE.Vector3();
  }

  /** Keep only the side of `plane` (a THREE.Plane, world space) its normal points to; null clears. */
  clip(i, plane) {
    const u = this.uniforms[i ? 'uClip1' : 'uClip0'].value;
    if (plane) u.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    else u.copy(NO_CLIP);
  }

  #solidMaterial(u, roughness, metalness) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness });
    patchMaterial(mat, {
      key: 'proj-cross-solid',
      uniforms: u,
      vertexHeader: 'varying vec3 vWPos; varying vec3 vLoc; varying vec3 vLocN;',
      vertex: { begin_vertex: `#include <begin_vertex>\nvLoc = position; vLocN = objectNormal;\n${worldPosVaryingVertex}` },
      fragmentHeader: `${SCREEN_GLSL}\n${CLIP_GLSL}\nuniform float uObjS;\nuniform float uFlash;\nvarying vec3 vWPos; varying vec3 vLoc; varying vec3 vLocN;`,
      fragment: {
        clipping_planes_fragment: /* glsl */ `
          #include <clipping_planes_fragment>
          float cd = clipDist(vWPos);
          if (cd < 0.0) discard;
          float sP = stageS(vWPos);
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
          // where the glass, or a portal, cuts the object: a bright section line
          float cut = (1.0 - smoothstep(0.004, 0.02, -sP)) * (1.0 - slice) * step(uPhys, 0.5);
          float pcut = 1.0 - smoothstep(0.004, 0.03, cd);`,
        color_fragment: `#include <color_fragment>\ndiffuseColor.rgb *= (1.0 - seam * 0.75) * (1.0 - slice * 0.9) * (1.0 - cut) * (1.0 - pcut);`,
        emissivemap_fragment: `#include <emissivemap_fragment>\ntotalEmissiveRadiance += ${PH} * (seam * (0.2 + 1.4 * segK * segK) + slice * 0.9 + cut * 1.7) + vec3(1.0, 0.45, 0.28) * (pcut * 2.2 + uFlash * 0.9);`,
      },
    });
    return mat;
  }

  #depthMaterial(u) {
    // the shadow comes only from the part still in the world
    const mat = new THREE.MeshDepthMaterial();
    patchMaterial(mat, {
      key: 'proj-cross-depth',
      uniforms: { uScrInv: u.uScrInv, uClip0: u.uClip0, uClip1: u.uClip1, uPhys: u.uPhys },
      vertexHeader: 'varying vec3 vWPos;',
      vertex: { begin_vertex: `#include <begin_vertex>\n${worldPosVaryingVertex}` },
      fragmentHeader: 'uniform mat4 uScrInv; uniform vec4 uClip0; uniform vec4 uClip1; uniform float uPhys; varying vec3 vWPos;',
      fragment: {
        clipping_planes_fragment: `#include <clipping_planes_fragment>
          if (min(dot(uClip0.xyz, vWPos) + uClip0.w, dot(uClip1.xyz, vWPos) + uClip1.w) < 0.0) discard;
          if (uPhys < 0.5 && -(uScrInv * vec4(vWPos, 1.0)).z > 0.0) discard;`,
      },
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
        ${CLIP_GLSL}
        varying vec3 vW;
        void main() {
          if (clipDist(vW) < 0.0) discard;
          float s = stageS(vW);
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

  #pointsMaterial(u, ctx, grid) {
    return new THREE.ShaderMaterial({
      uniforms: { ...u, uScale: ctx.uniforms.uPointScale, uGrid: { value: grid } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        ${SCREEN_GLSL}
        ${CLIP_GLSL}
        uniform float uScale;
        uniform float uGrid;
        varying vec3 vW;
        varying float vA;
        varying float vQ;
        void main() {
          float s0 = stageS((modelMatrix * vec4(position, 1.0)).xyz);
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
        ${CLIP_GLSL}
        varying vec3 vW;
        varying float vA;
        varying float vQ;
        void main() {
          if (clipDist(vW) < 0.0) discard;
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

  #trackerMaterial(u) {
    // a detection frame: visible wherever the object is, physical or inside the screen
    return new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aTick;
        varying vec3 vW;
        varying float vTick;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vW = wp.xyz; vTick = aTick;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        ${SCREEN_GLSL}
        ${CLIP_GLSL}
        uniform float uConf;
        uniform float uTrack;
        varying vec3 vW;
        varying float vTick;
        void main() {
          if (uTrack < 0.01 || clipDist(vW) < 0.0) discard;
          float fd = gl_FragCoord.z;
          if (stageS(vW) > 0.0 && !scrSee(vW, fd)) discard;
          gl_FragDepth = fd;
          // corner brackets always; ticks light up to the current confidence
          float on = vTick < 0.0 ? 1.0 : step(vTick + 0.5, uConf * 5.0);
          vec3 col = mix(vec3(1.0, 0.42, 0.26), ${PH}, smoothstep(0.6, 1.0, uConf));
          gl_FragColor = vec4(col * on * uTrack * (vTick < 0.0 ? 1.9 : 2.2), 1.0);
        }`,
    });
  }

  /** Call after the object's transform changes; `scrInv` maps world to screen space. */
  update(scrInv) {
    this.group.getWorldPosition(this._v).applyMatrix4(scrInv);
    this.uniforms.uObjS.value = -this._v.z;
  }

  /** Signed distance of the object's centre past the glass (negative: in front). */
  get centreS() {
    return this.uniforms.uObjS.value;
  }
}

/** The phosphor colour as a GLSL vec3 literal. */
export const PHOSPHOR_GLSL = PH;
