import * as THREE from 'three';
import { hashGLSL } from '../gl/glsl.js';
import { patchMaterial } from '../gl/patch.js';
import { worldPosVaryingVertex } from '../gl/glsl.js';
import { SCREEN_GLSL, CLIP_GLSL, NO_CLIP, PHOSPHOR_GLSL as PH } from './ProjectsScreen.js';

// Shared building blocks for the Projects console's works: the common material language, timing
// helpers, things drawn inside the screen (planes, labels, lines), clippable physical meshes, and
// the portal transform.

export const CERAMIC = '#cfc8bb';
export const METAL = '#3a3c40';
export const DARK = '#232529';
export const VERMILION = '#c4472f';
export const HOT = 'vec3(1.0, 0.42, 0.26)'; // the vermilion as light

export const smooth = THREE.MathUtils.smoothstep;
export const ramp = (t, a, b) => smooth(t, a, b);
export const pulse = (t, a, b, c, d) => ramp(t, a, b) * (1 - ramp(t, c, d));
export const hash = (i) => { const r = Math.sin(i * 91.17 + 3.1) * 43758.5453; return r - Math.floor(r); };

/** Station-space portal transform: enter `from` (matrix), leave `to` (matrix). */
export function portalMap4(to, from) {
  return new THREE.Matrix4().copy(to).multiply(new THREE.Matrix4().makeRotationY(Math.PI)).multiply(new THREE.Matrix4().copy(from).invert());
}

/**
 * Something coming out of the glass: straight out along the screen's normal, clear of the bezel's
 * recess and brow; down in front of the screen; then on to its destination (never through the frame). `from` is screen space (x, y, behind the glass);
 * `to` is station space. Returns the station-space position at progress k (0..1).
 */
export function outOfGlass(from, to, k, screenToStation, out = new THREE.Vector3(), direct = false) {
  const a = new THREE.Vector3(from[0], from[1], from[2]).applyMatrix4(screenToStation);
  const b = new THREE.Vector3(from[0], from[1], 0.85).applyMatrix4(screenToStation);
  const c = new THREE.Vector3(from[0], -1.6, 0.85).applyMatrix4(screenToStation);
  if (k < 0.3) return out.lerpVectors(a, b, smooth(k, 0, 0.3));
  if (direct) return out.lerpVectors(b, to, smooth(k, 0.3, 1)); // for things that stay in front of the screen
  if (k < 0.6) return out.lerpVectors(b, c, smooth(k, 0.3, 0.6));
  return out.lerpVectors(c, to, smooth(k, 0.6, 1));
}

/** A small text label floating in the screen. */
export function screenLabel(scr, text, w = 1.15) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 64;
  const g = c.getContext('2d');
  g.font = '500 30px ui-monospace, "SF Mono", Menlo, monospace';
  g.fillStyle = '#fff';
  g.textBaseline = 'middle';
  g.fillText(text, 6, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...scr, uTex: { value: tex }, uShow: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vW; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      ${SCREEN_GLSL}
      uniform sampler2D uTex; uniform float uShow;
      varying vec3 vW; varying vec2 vUv;
      void main() {
        float fd; if (uShow < 0.01 || !scrSee(vW, fd)) discard; gl_FragDepth = fd;
        float a = texture2D(uTex, vUv).a;
        gl_FragColor = vec4(${PH} * a * 0.55 * uShow, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 16), mat);
  m.frustumCulled = false;
  return m;
}

/** A text sprite drawn as phosphor (used for the ASCII frog); masked inside the screen if asked. */
export function phosphorText(scr, lines, { w = 0.5, masked = true } = {}) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  const draw = (rows) => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.font = '600 40px ui-monospace, "SF Mono", Menlo, monospace';
    g.fillStyle = '#fff';
    g.textBaseline = 'top';
    rows.forEach((r, i) => g.fillText(r, 16, 12 + i * 46));
    tex.needsUpdate = true;
  };
  draw(lines);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...scr, uTex: { value: tex }, uShow: { value: 0 } },
    defines: masked ? { MASKED: 1 } : {},
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vW; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      ${SCREEN_GLSL}
      uniform sampler2D uTex; uniform float uShow;
      varying vec3 vW; varying vec2 vUv;
      void main() {
        float fd = gl_FragCoord.z;
        #ifdef MASKED
          if (!scrSee(vW, fd)) discard;
        #endif
        if (uShow < 0.01) discard;
        gl_FragDepth = fd;
        float a = texture2D(uTex, vUv).a;
        gl_FragColor = vec4(mix(${PH}, vec3(0.75, 1.0, 0.62), 0.35) * a * 1.4 * uShow, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 2), mat);
  m.frustumCulled = false;
  m.userData.draw = draw;
  return m;
}

/** A procedural phosphor drawing on a plane in the screen's interior. */
export function screenPlane(scr, w, h, uniforms, body) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...scr, ...uniforms, uSize: { value: new THREE.Vector2(w, h) } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vW; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      ${SCREEN_GLSL}
      ${hashGLSL}
      uniform vec2 uSize; uniform float uShow; uniform float uT;
      varying vec3 vW; varying vec2 vUv;
      float aa(float d) { return 1.0 - smoothstep(0.0, fwidth(d) * 1.2 + 0.0015, d); }
      float lineD(float v, float at, float w) { return aa(abs(v - at) - w); }
      float rectD(vec2 p, vec2 c, vec2 hs, float w) { vec2 q = abs(p - c) - hs; return aa(abs(max(q.x, q.y)) - w); }
      float fillR(vec2 p, vec2 c, vec2 hs) { vec2 q = abs(p - c) - hs; return aa(max(q.x, q.y)); }
      float segD(vec2 p, vec2 a, vec2 b, float w) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return aa(length(pa - ba * h) - w); }
      ${body.header ?? ''}
      void main() {
        float fd; if (uShow < 0.01 || !scrSee(vW, fd)) discard; gl_FragDepth = fd;
        vec2 m = (vUv - 0.5) * uSize;
        vec3 col = vec3(0.0);
        ${body.main}
        float s = scrS(vW);
        gl_FragColor = vec4(col * uShow * exp(-s * 0.08), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.frustumCulled = false;
  return mesh;
}

/** Phosphor line material for things drawn inside the screen (or, unmasked, outside it). */
export function lineMaterial(scr, { color = PH, masked = true, gain = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...scr, uA: { value: 0 } },
    defines: masked ? { MASKED: 1 } : {},
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      ${SCREEN_GLSL}
      uniform float uA; varying vec3 vW;
      void main() {
        float fd = gl_FragCoord.z;
        #ifdef MASKED
          if (!scrSee(vW, fd)) discard;
        #endif
        if (uA < 0.002) discard;
        gl_FragDepth = fd;
        float s = scrS(vW);
        gl_FragColor = vec4(${color} * uA * ${gain.toFixed(2)} * (s > 0.0 ? exp(-s * 0.08) : 1.0), 1.0);
      }`,
  });
}

/** Box outlines for screen-world structures (a LineSegments of unit boxes, placed per item). */
export function boxEdges() {
  return new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
}

/**
 * A lit physical material that portal planes (and the glass) can cut: for instanced swarms such as
 * the hidden reports or a runaway staircase. Two planes, as CLIP_GLSL; a hot line where it is cut.
 */
export function clippedMaterial(opts, key, scr) {
  const mat = new THREE.MeshStandardMaterial(opts);
  const u = {
    uClip0: { value: NO_CLIP.clone() },
    uClip1: { value: NO_CLIP.clone() },
    uGlassCut: { value: 0 },
    uScrInv: scr.uScrInv,
    uScrHalf: scr.uScrHalf,
  };
  // the glass cut is bounded: only what is behind the glass and inside its outline is inside the
  // computer (the glass plane itself runs on in front of the deck)
  const GLSL = `
    uniform vec4 uClip0; uniform vec4 uClip1; uniform float uGlassCut; uniform mat4 uScrInv; uniform vec2 uScrHalf;
    varying vec3 vWPos;
    float glassDist(vec3 w) {
      vec3 sl = (uScrInv * vec4(w, 1.0)).xyz;
      bool inside = abs(sl.x) < uScrHalf.x + 0.12 && abs(sl.y) < uScrHalf.y + 0.12 && sl.z > -3.0;
      return uGlassCut > 0.5 && inside ? sl.z : 1.0;
    }`;
  patchMaterial(mat, {
    key,
    uniforms: u,
    vertexHeader: 'varying vec3 vWPos;',
    vertex: { begin_vertex: `#include <begin_vertex>\n${worldPosVaryingVertex}` },
    fragmentHeader: GLSL,
    fragment: {
      clipping_planes_fragment: `#include <clipping_planes_fragment>
        float cdK = min(min(dot(uClip0.xyz, vWPos) + uClip0.w, dot(uClip1.xyz, vWPos) + uClip1.w), glassDist(vWPos));
        if (cdK < 0.0) discard;
        float pcutK = 1.0 - smoothstep(0.004, 0.03, cdK);`,
      emissivemap_fragment: '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.45, 0.28) * pcutK * 2.0;',
    },
  });
  mat.userData.clip = (i, plane) => {
    const v = u[i ? 'uClip1' : 'uClip0'].value;
    if (plane) v.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    else v.copy(NO_CLIP);
  };
  mat.userData.glass = (on) => (u.uGlassCut.value = on ? 1 : 0);
  mat.userData.u = u; // for audits
  const depth = new THREE.MeshDepthMaterial();
  patchMaterial(depth, {
    key: `${key}-depth`,
    uniforms: u,
    vertexHeader: 'varying vec3 vWPos;',
    vertex: { begin_vertex: `#include <begin_vertex>\n${worldPosVaryingVertex}` },
    fragmentHeader: GLSL,
    fragment: { clipping_planes_fragment: '#include <clipping_planes_fragment>\nif (min(min(dot(uClip0.xyz, vWPos) + uClip0.w, dot(uClip1.xyz, vWPos) + uClip1.w), glassDist(vWPos)) < 0.0) discard;' },
  });
  mat.userData.depth = depth;
  return mat;
}

/**
 * A line threaded through a portal: one part in the world (station space) from an object to a
 * portal, one part in the screen (screen space) from the portal's partner to its origin. Used for
 * Mosaic's provenance and Visual Java's references.
 */
export class Thread {
  constructor(host, { color = HOT, bend = 0.08 } = {}) {
    this.host = host;
    this.bend = bend;
    const mk = (masked) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(40 * 3), 3));
      const line = new THREE.Line(geo, lineMaterial(host.scr, { color: `mix(${color}, ${PH}, 0.35)`, masked, gain: 1.4 }));
      line.frustumCulled = false;
      line.visible = false;
      return line;
    };
    this.world = mk(false);
    this.room = mk(true);
    host.group.add(this.world);
    host.screenFrame.add(this.room);
  }

  static #fill(line, from, to, bend, k) {
    const pos = line.geometry.attributes.position;
    const n = pos.count;
    const p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * k;
      p.lerpVectors(from, to, u);
      p.y += Math.sin(u * Math.PI) * bend;
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    pos.needsUpdate = true;
  }

  /** a: overall amount (retracts from the screen end first); positions in their own spaces. */
  set(a, objStation, portalStation, portalScreen, originScreen) {
    const on = a > 0.002;
    this.world.visible = on;
    this.room.visible = on && a > 0.5;
    if (!on) return;
    const kWorld = THREE.MathUtils.clamp(a * 2, 0, 1), kRoom = THREE.MathUtils.clamp(a * 2 - 1, 0, 1);
    Thread.#fill(this.world, objStation, portalStation, this.bend * 0.6, kWorld);
    Thread.#fill(this.room, portalScreen, originScreen, this.bend, kRoom);
    this.world.material.uniforms.uA.value = Math.min(1, a * 3);
    this.room.material.uniforms.uA.value = Math.min(1, a * 3);
  }

  hide() {
    this.world.visible = this.room.visible = false;
  }
}
