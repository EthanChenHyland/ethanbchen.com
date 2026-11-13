import * as THREE from 'three';
import { BONES } from './ProfileBody.js';
import { createSkeleton, Rig } from './ProfileRig.js';

// The figure's material and its phasing grammar: how a person made of light passes between being a
// body and being information. Every state is driven per bone (so it starts where the activity is)
// plus a few moving sources and a whole-body term for the rare full phase.
//
//   charge     the material lights from inside, with faint flowing light paths
//   slice      the body separates into thin parallel layers that slide past each other
//   cells      a region becomes an ordered field of luminous cells that lag and rearrange
//   dissolve   a region becomes a constellation of linked points, then reconstructs
//   ghosts     other versions of the body: delayed (temporal echoes) or posed (candidate selves)
//   expose     (minor) the outer form thins to show the structure inside

const NB = BONES.length;

// three light material candidates (?fmat=a|b|c), all readable against the night without effects
export const MATERIALS = {
  // A: pearl ceramic: warm-white glaze, a lilac sheen, a faint nacre shift at grazing angles
  a: { name: 'pearl ceramic', color: 0xe9e3ec, roughness: 0.34, metalness: 0.0, clearcoat: 0.7, clearcoatRoughness: 0.18, sheen: 0.7, sheenColor: 0xc9b9ff, sheenRoughness: 0.45, rim: [0.62, 0.55, 0.95], rimK: 0.22, inner: 0.0, nacre: 0.12 },
  // B: frosted translucent lilac-white: light seems to come from within the form
  b: { name: 'frosted lilac-white', color: 0xdcd4f2, roughness: 0.62, metalness: 0.0, clearcoat: 0.25, clearcoatRoughness: 0.5, sheen: 0.4, sheenColor: 0xd8ccff, sheenRoughness: 0.7, rim: [0.74, 0.66, 1.0], rimK: 0.42, inner: 0.16, nacre: 0.0 },
  // C: soft ivory-silver synthetic: a quiet satin metal, cooler edges
  c: { name: 'ivory silver', color: 0xe6e1d8, roughness: 0.3, metalness: 0.55, clearcoat: 0.4, clearcoatRoughness: 0.25, sheen: 0.0, sheenColor: 0xffffff, sheenRoughness: 0.5, rim: [0.6, 0.62, 0.86], rimK: 0.18, inner: 0.0, nacre: 0.0 },
};

const FIELD_HEADER = /* glsl */ `
  uniform vec4 uPhase[${NB}];
  uniform float uExpose[${NB}];
  uniform vec4 uFull;
  uniform vec4 uSrc[3];
  uniform vec2 uSrcK[3];
  uniform vec4 uScan;
  uniform vec3 uSliceDir;
  uniform vec3 uSliceDepth;
  uniform float uTime;
  varying vec4 vPh;
  varying float vExpose;
  varying vec3 vWorld;
  varying float vSlabY;
  varying float vFace;
  varying float vCov;
  attribute float covered;`;

const FIELD_MAIN = /* glsl */ `
  #include <skinning_vertex>
  {
    ivec4 bi = ivec4(skinIndex);
    vec4 ph = uPhase[bi.x] * skinWeight.x + uPhase[bi.y] * skinWeight.y + uPhase[bi.z] * skinWeight.z + uPhase[bi.w] * skinWeight.w + uFull;
    float e = uExpose[bi.x] * skinWeight.x + uExpose[bi.y] * skinWeight.y + uExpose[bi.z] * skinWeight.z + uExpose[bi.w] * skinWeight.w;
    vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
    for (int i = 0; i < 3; i++) {
      vec3 d = wp - uSrc[i].xyz;
      float f = exp(-dot(d, d) / (uSrc[i].w * uSrc[i].w));
      ph.x += uSrcK[i].x * f;
      e += uSrcK[i].y * f;
    }
    float sb = exp(-(((wp.y - uScan.x) / uScan.y)*((wp.y - uScan.x) / uScan.y)));
    ph.x += uScan.z * sb;
    ph.y += uScan.w * sb;
    // layers: slabs of the body slide sideways (and a little in depth) at their own speeds
    vSlabY = transformed.y;
    float slab = floor(transformed.y / 0.036);
    float hs = fract(sin(slab * 12.9898) * 43758.5453);
    float sl = clamp(ph.y, 0.0, 1.0);
    // adjacent layers out of register: a wave travelling up through them, a little individual drift
    float wave = sin(uTime * 1.25 - slab * 0.42);
    float sh = (0.7 * wave + 0.3 * (hs - 0.5) * 2.0 * sin(uTime * (0.6 + 1.5 * hs) + hs * 6.283)) * 0.065 * sl;
    transformed += uSliceDir * sh + uSliceDepth * sh * 0.7;
    // the face plane (the flat facet of the head) glows faintly and slides first when the head phases
    vFace = smoothstep(0.55, 0.92, dot(normal, normalize(vec3(0.0, -0.15, 1.0)))) * smoothstep(1.583, 1.623, position.y) * step(position.y, 1.763) * smoothstep(0.0, 0.05, position.z);
    vCov = covered;
    transformed += uSliceDir * vFace * clamp(ph.y + ph.w, 0.0, 1.0) * 0.03 * sin(uTime * 1.7);
    vPh = ph;
    vExpose = e;
    vWorld = wp;
  }`;

/** The body's material: a light physical surface with the phasing grammar in its shader. */
export function bodyMaterial(uni, kind = 'a') {
  const M = MATERIALS[kind] ?? MATERIALS.a;
  const mat = new THREE.MeshPhysicalMaterial({
    color: M.color,
    roughness: M.roughness,
    metalness: M.metalness,
    clearcoat: M.clearcoat,
    clearcoatRoughness: M.clearcoatRoughness,
    sheen: M.sheen,
    sheenColor: new THREE.Color(M.sheenColor),
    sheenRoughness: M.sheenRoughness,
    envMapIntensity: 1.2,
    transparent: true,
  });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${FIELD_HEADER}`).replace('#include <skinning_vertex>', FIELD_MAIN);
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec4 vPh;
        varying float vExpose;
        varying vec3 vWorld;
        varying float vSlabY;
        varying float vFace;
        varying float vCov;
        uniform float uReveal;
        uniform float uTime;
        uniform sampler3D uNoise3D;
        // charge: the inner light, lilac at first, warm white at its brightest
        vec3 chargeCol(float c) { return mix(vec3(0.62, 0.52, 1.0), vec3(1.0, 0.86, 0.66), smoothstep(0.55, 1.0, c)); }`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        /* glsl */ `#include <clipping_planes_fragment>
        float slK = clamp(vPh.y, 0.0, 1.0);
        float slF = fract(vSlabY / 0.036);
        if (slK > 0.04 && slF < 0.17 * slK) discard;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        vec3 vd = normalize(vViewPosition);
        float ndv = clamp(abs(dot(normal, vd)), 0.0, 1.0);
        float rim = pow(clamp(1.0 - ndv, 0.0, 1.0), 2.6);
        totalEmissiveRadiance += vec3(${M.rim.join(', ')}) * rim * ${M.rimK.toFixed(3)};
        // light from the stage below: undersides (the jaw, the arms) are never left in a dark crease
        vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
        totalEmissiveRadiance += vec3(0.5, 0.44, 0.82) * smoothstep(-0.05, -0.75, nW.y) * 0.32;
        // the face: an inset plane of faint inner light (front unmistakable, no features)
        totalEmissiveRadiance += vec3(0.7, 0.62, 1.0) * vFace * (0.26 + 0.25 * clamp(vPh.x + vPh.w, 0.0, 1.0));
        // always: faint lines of light flowing slowly over the surface (a made, living thing)
        float flowN = texture(uNoise3D, vWorld * vec3(0.55, 0.22, 0.55) + vec3(0.0, -uTime * 0.035, 0.0)).r;
        float flow = smoothstep(0.03, 0.0, 0.5 - abs(fract(flowN * 7.0) - 0.5));
        totalEmissiveRadiance += vec3(0.68, 0.6, 1.0) * flow * 0.16 * (0.5 + 0.5 * ndv);
        // inner light (frosted): brightest where the form is thin to the eye
        totalEmissiveRadiance += vec3(0.7, 0.62, 1.0) * ${M.inner.toFixed(3)} * (0.35 + 0.65 * pow(clamp(1.0 - ndv, 0.0, 1.0), 1.4));
        // nacre (pearl): a faint lilac-to-peach shift with angle
        totalEmissiveRadiance += mix(vec3(0.55, 0.5, 0.9), vec3(0.95, 0.7, 0.6), ndv) * ${M.nacre.toFixed(3)} * rim;
        float ch = clamp(vPh.x, 0.0, 1.3);
        float paths = texture(uNoise3D, vWorld * 0.9 + vec3(0.0, uTime * 0.12, 0.0)).r;
        float vein = smoothstep(0.035, 0.0, abs(paths - 0.5)) * smoothstep(0.08, 0.5, ch);
        totalEmissiveRadiance += chargeCol(ch) * (0.55 * ch * ch + 1.4 * vein * ch);
        // slab edges catch light as the layers part
        totalEmissiveRadiance += vec3(0.78, 0.7, 1.0) * smoothstep(0.24 * slK, 0.17 * slK, slF) * slK * 1.1;
        totalEmissiveRadiance += vec3(0.5, 0.45, 0.9) * slK * 0.12;`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        float ex = clamp(vExpose, 0.0, 1.0);
        // the body gives way where it becomes cells or a constellation (and thins where exposed)
        float away = clamp(max(vPh.w, vPh.z * 0.9), 0.0, 1.0);
        float alpha = (1.0 - away) * mix(1.0, 0.12 + 0.7 * rim, ex * 0.9);
        // under the clothes the body exists only when a phase reveals it (no bleed-through when solid)
        float reveal = clamp(max(max(vPh.y * 0.12, vPh.w * 1.4), uReveal), 0.0, 1.0); // slices stay inside the suit (the suit slices itself); only its opening reveals the body
        alpha *= mix(1.0, reveal, vCov);
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(outgoingLight, alpha);`,
      );
  };
  mat.customProgramCacheKey = () => `profile-body-${kind}`;
  return mat;
}

/** The internal structure (minor state): thin lines seen where the body is exposed. */
export function structureMaterial(uni) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${FIELD_HEADER}`).replace('#include <skinning_vertex>', FIELD_MAIN);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vPh;\nvarying float vExpose;').replace(
      '#include <opaque_fragment>',
      `float ex = smoothstep(0.1, 0.8, vExpose);
      gl_FragColor = vec4(vec3(0.62, 0.55, 1.0) * ex * 0.8, ex);`,
    );
  };
  mat.customProgramCacheKey = () => 'profile-structure';
  return mat;
}

/** A ghost body: translucent, rim-lit, masked per bone; delayed (echo) or posed (candidate). */
function ghostMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uMask: { value: new Float32Array(NB).fill(1) }, uK: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      uniform float uMask[${NB}];
      varying float vM; varying vec3 vN; varying vec3 vV;
      void main() {
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        ivec4 bi = ivec4(skinIndex);
        vM = uMask[bi.x] * skinWeight.x + uMask[bi.y] * skinWeight.y + uMask[bi.z] * skinWeight.z + uMask[bi.w] * skinWeight.w;
        vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
        vV = -mv.xyz; vN = normalMatrix * objectNormal;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uK; uniform vec3 uColor;
      varying float vM; varying vec3 vN; varying vec3 vV;
      void main() {
        // clamped and NaN-safe: |dot| can exceed 1 by rounding when a surface faces the camera exactly;
        // pow() of the slightly negative base was NaN, and bloom spread that one pixel into a frame-wide flash
        float ndv = clamp(abs(dot(normalize(vN + 1e-6), normalize(vV + 1e-6))), 0.0, 1.0);
        float rim = pow(1.0 - ndv, 2.2);
        float a = clamp(uK * vM * (0.16 + 0.95 * rim), 0.0, 4.0);
        if (!(a >= 0.003)) discard;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

export class Ghost {
  constructor(parent, geo, color = 0xcfc4ff) {
    this.skel = createSkeleton();
    this.rig = new Rig(this.skel);
    this.mesh = new THREE.SkinnedMesh(geo, ghostMaterial(color));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    parent.add(this.skel.root);
    parent.add(this.mesh);
    this.mesh.bind(this.skel.skeleton, new THREE.Matrix4());
    this.mesh.visible = false;
    this.k = 0;
  }
  set(k, mask = null) {
    this.k = k;
    this.mesh.visible = k > 0.003;
    this.mesh.material.uniforms.uK.value = k;
    if (mask) this.mesh.material.uniforms.uMask.value.set(mask);
  }
  /** Copy a recorded pose (local transforms of every bone). */
  copy(frame) {
    const B = this.skel.bones;
    for (let i = 0; i < B.length; i++) {
      B[i].quaternion.fromArray(frame.q, i * 4);
      B[i].position.fromArray(frame.p, i * 3);
    }
    B[0].updateMatrixWorld(true);
  }
}

/** Records the figure's pose every frame so echoes can replay it a moment later. */
export class PoseHistory {
  constructor(bones, seconds = 1.6) {
    this.bones = bones;
    this.frames = [];
    this.keep = seconds;
  }
  push(time) {
    const B = this.bones;
    const f = this.frames.length > 140 ? this.frames.shift() : { q: new Float32Array(B.length * 4), p: new Float32Array(B.length * 3) };
    for (let i = 0; i < B.length; i++) {
      B[i].quaternion.toArray(f.q, i * 4);
      B[i].position.toArray(f.p, i * 3);
    }
    f.t = time;
    this.frames.push(f);
  }
  at(time) {
    const F = this.frames;
    for (let i = F.length - 1; i >= 0; i--) if (F[i].t <= time) return F[i];
    return F[0];
  }
}

// ------------------------------------------------------------------ CPU-skinned point cloud
/**
 * Points sampled on the body surface, skinned on the CPU each frame (cheap at this count). They
 * carry the constellation (points and links) and the cells (an instanced field of small cubes).
 */
export class Cloud {
  constructor(station, geo, skeleton, { count = 1500, cells = 640 } = {}) {
    this.st = station;
    this.skeleton = skeleton;
    const P = geo.attributes.position, SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight;
    const N = Math.min(count, P.count);
    this.n = N;
    this.bind = new Float32Array(N * 3);
    this.si = new Uint16Array(N * 4);
    this.sw = new Float32Array(N * 4);
    this.dom = new Uint16Array(N);
    this.seed = new Float32Array(N);
    const stride = P.count / N;
    for (let k = 0; k < N; k++) {
      const i = Math.floor(k * stride + (k * 7919) % Math.max(1, Math.floor(stride)));
      this.bind.set([P.getX(i), P.getY(i), P.getZ(i)], k * 3);
      let best = 0;
      for (let j = 0; j < 4; j++) {
        this.si[k * 4 + j] = SI.getComponent(i, j);
        this.sw[k * 4 + j] = SW.getComponent(i, j);
        if (SW.getComponent(i, j) > SW.getComponent(i, best)) best = j;
      }
      this.dom[k] = SI.getComponent(i, best);
      this.seed[k] = ((k * 2654435761) % 1000) / 1000;
    }
    this.world = new Float32Array(N * 3);
    // which points lie on the face plane (they dissolve first)
    const NR = geo.attributes.normal;
    this.face = new Uint8Array(N);
    const fn = new THREE.Vector3(0, -0.22, 0.975).normalize();
    for (let k = 0; k < N; k++) {
      const i = Math.floor(k * stride + (k * 7919) % Math.max(1, Math.floor(stride)));
      const y = this.bind[k * 3 + 1], z = this.bind[k * 3 + 2];
      this.face[k] = y > 1.568 && y < 1.733 && z > 0.03 && NR.getX(i) * fn.x + NR.getY(i) * fn.y + NR.getZ(i) * fn.z > 0.93 ? 1 : 0;
    }
    // links: each point to its nearest neighbour (bind pose), for the constellation's lines
    const pairs = [];
    for (let a = 0; a < N; a++) {
      let bj = -1, bd = 0.0035;
      for (let b = a + 1; b < Math.min(N, a + 60); b++) {
        const dx = this.bind[a * 3] - this.bind[b * 3], dy = this.bind[a * 3 + 1] - this.bind[b * 3 + 1], dz = this.bind[a * 3 + 2] - this.bind[b * 3 + 2];
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bd) (bd = d), (bj = b);
      }
      if (bj >= 0) pairs.push(a, bj);
    }
    this.pairs = new Uint32Array(pairs);
    // constellation: points
    const pg = new THREE.BufferGeometry();
    this.pPos = new Float32Array(N * 3);
    this.pK = new Float32Array(N);
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    pg.setAttribute('aK', new THREE.BufferAttribute(this.pK, 1));
    this.points = new THREE.Points(
      pg,
      new THREE.ShaderMaterial({
        uniforms: { uScale: station.ctx.uniforms.uPointScale },
        vertexShader: `attribute float aK; varying float vK; uniform float uScale;
          void main(){ vK = aK; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aK > 0.01 ? uScale * 0.034 * (0.5 + 0.5 * aK) / -mv.z : 0.0; }`,
        fragmentShader: `varying float vK; void main(){ float r = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, r); a = a * a; gl_FragColor = vec4(mix(vec3(0.7,0.62,1.0), vec3(1.0,0.95,0.9), a) * a * vK * 1.4, 1.0); }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    station.group.add(this.points);
    const lg = new THREE.BufferGeometry();
    this.lPos = new Float32Array((this.pairs.length / 2) * 6);
    this.lK = new Float32Array((this.pairs.length / 2) * 2);
    lg.setAttribute('position', new THREE.BufferAttribute(this.lPos, 3));
    lg.setAttribute('aK', new THREE.BufferAttribute(this.lK, 1));
    this.links = new THREE.LineSegments(
      lg,
      new THREE.ShaderMaterial({
        vertexShader: 'attribute float aK; varying float vK; void main(){ vK = aK; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'varying float vK; void main(){ gl_FragColor = vec4(vec3(0.66,0.6,1.0) * vK * 0.55, 1.0); }',
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.links.frustumCulled = false;
    station.group.add(this.links);
    // the constellation's structure: bright anchor nodes at the joints, spokes from the surface
    // points to their joint (so it reads as a person made of connected information)
    const B = skeleton.bones.length;
    const ag = new THREE.BufferGeometry();
    this.aPos = new Float32Array(B * 3);
    this.aK = new Float32Array(B);
    ag.setAttribute('position', new THREE.BufferAttribute(this.aPos, 3));
    ag.setAttribute('aK', new THREE.BufferAttribute(this.aK, 1));
    this.anchors = new THREE.Points(ag, this.points.material.clone());
    this.anchors.material.uniforms.uScale = station.ctx.uniforms.uPointScale;
    this.anchors.material.vertexShader = this.anchors.material.vertexShader.replace('0.034', '0.09');
    this.anchors.frustumCulled = false;
    station.group.add(this.anchors);
    this.spokeIdx = [];
    for (let k = 0; k < N; k += 4) this.spokeIdx.push(k);
    const sg = new THREE.BufferGeometry();
    this.sPos = new Float32Array(this.spokeIdx.length * 6);
    this.sK = new Float32Array(this.spokeIdx.length * 2);
    sg.setAttribute('position', new THREE.BufferAttribute(this.sPos, 3));
    sg.setAttribute('aK', new THREE.BufferAttribute(this.sK, 1));
    this.spokes = new THREE.LineSegments(sg, this.links.material);
    this.spokes.frustumCulled = false;
    station.group.add(this.spokes);
    // cells: an instanced field of small luminous cubes
    this.cellN = Math.min(cells, N);
    this.cellIdx = new Uint32Array(this.cellN).map((_, i) => Math.floor((i * N) / this.cellN));
    const cm = new THREE.MeshStandardMaterial({ color: 0xf2eefc, roughness: 0.35, metalness: 0.1, emissive: 0x9d8cff, emissiveIntensity: 0.55, transparent: true, opacity: 0.92 });
    this.cells = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), cm, this.cellN);
    this.cells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.cells.frustumCulled = false;
    this.cells.count = 0;
    station.group.add(this.cells);
    this.cellPos = new Float32Array(this.cellN * 3);
    this.cellInit = false;
    this._m = new THREE.Matrix4();
    this._mats = [];
    this.active = false;
  }

  /** Skin the sampled points (world space) from the current bone matrices. */
  #skin() {
    const sk = this.skeleton, B = sk.bones;
    if (!this._mats.length) for (let i = 0; i < B.length; i++) this._mats.push(new THREE.Matrix4());
    for (let i = 0; i < B.length; i++) this._mats[i].multiplyMatrices(B[i].matrixWorld, sk.boneInverses[i]);
    const v = new THREE.Vector3(), acc = new THREE.Vector3();
    for (let k = 0; k < this.n; k++) {
      acc.set(0, 0, 0);
      for (let j = 0; j < 4; j++) {
        const w = this.sw[k * 4 + j];
        if (w < 1e-4) continue;
        v.fromArray(this.bind, k * 3).applyMatrix4(this._mats[this.si[k * 4 + j]]);
        acc.addScaledVector(v, w);
      }
      acc.toArray(this.world, k * 3);
    }
  }

  /**
   * `phase`: per-bone vec4 array (charge, slice, cells, dissolve); `full`: whole-body term;
   * `rearrange`: 0..1, how far cells wander from their places; `scatter`: how far points drift.
   */
  update(time, dt, phase, full, { rearrange = 0, scatter = 0 } = {}) {
    let any = full.z > 0.01 || full.w > 0.01;
    for (let i = 0; i < NB && !any; i++) any = phase[i * 4 + 2] > 0.01 || phase[i * 4 + 3] > 0.01;
    this.active = any;
    this.points.visible = this.links.visible = this.anchors.visible = this.spokes.visible = any;
    if (!any) {
      this.cells.count = 0;
      this.cellInit = false;
      return;
    }
    this.#skin();
    const o = this.st.group.position;
    // constellation points: brightness from the dissolve weight, drifting outward as it rises
    for (let k = 0; k < this.n; k++) {
      let d = Math.min(1, phase[this.dom[k] * 4 + 3] + full.w);
      if (this.face[k]) d = Math.min(1, d * 1.7 + (d > 0.03 ? 0.15 : 0));
      const s = this.seed[k];
      const drift = d * d * (0.05 + 0.32 * scatter) * (0.4 + s);
      const ang = s * 40 + time * (0.3 + s);
      this.pPos[k * 3] = this.world[k * 3] - o.x + Math.cos(ang) * drift;
      this.pPos[k * 3 + 1] = this.world[k * 3 + 1] - o.y + Math.sin(ang * 1.3) * drift * 0.7 + drift * 0.3;
      this.pPos[k * 3 + 2] = this.world[k * 3 + 2] - o.z + Math.sin(ang) * drift;
      this.pK[k] = smooth(d) * (0.55 + 0.45 * Math.sin(time * (2 + 3 * s) + s * 9) ** 2);
    }
    for (let i = 0, l = 0; i < this.pairs.length; i += 2, l++) {
      const a = this.pairs[i], b = this.pairs[i + 1];
      this.lPos.set([this.pPos[a * 3], this.pPos[a * 3 + 1], this.pPos[a * 3 + 2], this.pPos[b * 3], this.pPos[b * 3 + 1], this.pPos[b * 3 + 2]], l * 6);
      const k = Math.min(this.pK[a], this.pK[b]);
      this.lK[l * 2] = this.lK[l * 2 + 1] = k;
    }
    // anchors at the joints, spokes to them with a pulse travelling inward
    const Bn = this.skeleton.bones;
    const jp = this._jp ??= new THREE.Vector3();
    for (let i = 0; i < Bn.length; i++) {
      Bn[i].getWorldPosition(jp);
      this.aPos.set([jp.x - o.x, jp.y - o.y, jp.z - o.z], i * 3);
      this.aK[i] = smooth(Math.min(1, phase[i * 4 + 3] + full.w)) * (0.8 + 0.2 * Math.sin(time * 2.3 + i));
    }
    this.spokeIdx.forEach((k, j) => {
      const b = this.dom[k];
      this.sPos.set([this.pPos[k * 3], this.pPos[k * 3 + 1], this.pPos[k * 3 + 2], this.aPos[b * 3], this.aPos[b * 3 + 1], this.aPos[b * 3 + 2]], j * 6);
      const pulse = 0.35 + 0.65 * Math.max(0, Math.sin(time * 3.1 - k * 0.7));
      this.sK[j * 2] = this.pK[k] * 0.55 * pulse;
      this.sK[j * 2 + 1] = this.pK[k] * 0.9 * pulse;
    });
    this.anchors.geometry.attributes.position.needsUpdate = this.anchors.geometry.attributes.aK.needsUpdate = true;
    this.spokes.geometry.attributes.position.needsUpdate = this.spokes.geometry.attributes.aK.needsUpdate = true;
    this.points.geometry.attributes.position.needsUpdate = this.points.geometry.attributes.aK.needsUpdate = true;
    this.links.geometry.attributes.position.needsUpdate = this.links.geometry.attributes.aK.needsUpdate = true;
    // cells: snapped to a grid, following with a lag, wandering when rearranged
    const G = 0.085;
    let n = 0;
    const m = this._m;
    for (let c = 0; c < this.cellN; c++) {
      const k = this.cellIdx[c];
      const w = Math.min(1, phase[this.dom[k] * 4 + 2] + full.z);
      const s = this.seed[k];
      let x = this.world[k * 3] - o.x, y = this.world[k * 3 + 1] - o.y, z = this.world[k * 3 + 2] - o.z;
      x = Math.round(x / G) * G;
      y = Math.round(y / G) * G;
      z = Math.round(z / G) * G;
      const wander = rearrange * (0.15 + 0.5 * s);
      x += Math.round(Math.sin(time * 0.7 + s * 30) * wander / G) * G;
      y += Math.round(Math.cos(time * 0.5 + s * 17) * wander / G) * G;
      if (!this.cellInit) this.cellPos.set([x, y, z], c * 3);
      const lag = Math.min(1, dt * (3 + 6 * s));
      this.cellPos[c * 3] += (x - this.cellPos[c * 3]) * lag;
      this.cellPos[c * 3 + 1] += (y - this.cellPos[c * 3 + 1]) * lag;
      this.cellPos[c * 3 + 2] += (z - this.cellPos[c * 3 + 2]) * lag;
      if (w < 0.03) continue;
      const sz = G * 0.86 * smooth(Math.min(1, w * 1.3 - s * 0.3 + 0.3));
      if (sz <= 0.002) continue;
      m.makeScale(sz, sz, sz).setPosition(this.cellPos[c * 3], this.cellPos[c * 3 + 1], this.cellPos[c * 3 + 2]);
      this.cells.setMatrixAt(n++, m);
    }
    this.cellInit = true;
    this.cells.count = n;
    this.cells.instanceMatrix.needsUpdate = true;
  }
}

const smooth = (x) => {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
};
