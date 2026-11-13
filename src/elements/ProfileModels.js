import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { FIGURE_SCALE } from './ProfileBody.js';
import openaiSvg from '../assets/ai-marks/openai.svg?raw';
import claudeSvg from '../assets/ai-marks/claude.svg?raw';
import geminiSvg from '../assets/ai-marks/gemini.svg?raw';
import grokSvg from '../assets/ai-marks/grok.svg?raw';
import deepseekSvg from '../assets/ai-marks/deepseek.svg?raw';
import qwenSvg from '../assets/ai-marks/qwen.svg?raw';
import mistralSvg from '../assets/ai-marks/mistral.svg?raw';
import glmSvg from '../assets/ai-marks/glm.svg?raw';
import kimiPng from '../assets/ai-marks/kimi.png';
import minimaxPng from '../assets/ai-marks/minimax.png';

// the real marks (first-party sources, see src/assets/ai-marks/SOURCES.md); `maxX` keeps only the
// symbol of a lockup (the wordmark is dropped)
const MARKS = {
  openai: { svg: openaiSvg, fillAll: true }, // its fill is set by a stylesheet, not on the path
  claude: { svg: claudeSvg },
  gemini: { svg: geminiSvg, clipShape: true }, // the sparkle is the clip shape of its gradient image
  grok: { svg: grokSvg, tile: true }, // drawn on an app-icon tile, which is dropped
  deepseek: { svg: deepseekSvg, maxX: 24 },
  qwen: { svg: qwenSvg, maxX: 21 },
  mistral: { svg: mistralSvg },
  glm: { svg: glmSvg, tile: true },
  kimi: { png: kimiPng },
  minimax: { png: minimaxPng },
};

/** A real mark as a thin extrusion of its own SVG geometry, centred, fitted to unit radius. */
function markGeometry(def) {
  const M = MARKS[def.id];
  const data = new SVGLoader().parse(M.svg);
  const vb = (M.svg.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 100 100').split(/[ ,]+/).map(Number);
  const parts = [];
  const brand = new THREE.Color(def.color);
  for (const path of data.paths) {
    const fill = path.userData?.style?.fill;
    if (M.clipShape ? fill !== 'none' : fill === 'none' && !M.fillAll) continue;
    for (const shape of path.toShapes(true)) {
      const pts = shape.getPoints(12);
      const bb = new THREE.Box2().setFromPoints(pts);
      const size = bb.getSize(new THREE.Vector2());
      // drop a background square (an app icon's tile) and anything beyond the symbol of a lockup
      if (M.tile && size.x > vb[2] * 0.88 && size.y > vb[3] * 0.88) continue;
      if (M.maxX !== undefined && bb.min.x > M.maxX) continue;
      const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(vb[2], vb[3]) * 0.045, bevelEnabled: false, curveSegments: 10 });
      // the mark's own colour (black or white marks take the brand's colour)
      const c = path.color && !(path.color.r === path.color.g && path.color.g === path.color.b) ? path.color : brand;
      const col = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < g.attributes.position.count; i++) col.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('brandColor', new THREE.BufferAttribute(col, 3));
      g.deleteAttribute('uv');
      parts.push(g);
    }
  }
  if (!parts.length) return new THREE.IcosahedronGeometry(0.3, 1);
  const geo = mergeGeometries(parts, false);
  geo.scale(1, -1, 1); // SVG's y runs down
  geo.computeBoundingBox();
  const b = geo.boundingBox, c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3());
  geo.translate(-c.x, -c.y, -c.z);
  const k = 2 / Math.max(sz.x, sz.y);
  geo.scale(k, k, k);
  geo.computeVertexNormals();
  return geo;
}

/** A material that is pale monochrome at rest and shows the mark's own colours as it comes forward. */
function markMaterial() {
  const mat = new THREE.MeshBasicMaterial({ color: 0xddd6ff, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  mat.userData.uBrand = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uBrand = mat.userData.uBrand;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 brandColor; varying vec3 vBrand;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBrand = brandColor;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uBrand; varying vec3 vBrand;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = min(vBrand, vec3(0.86)) * 1.1 * diffuseColor.rgb; // its own colours, always; brightness from the material');
  };
  mat.customProgramCacheKey = () => 'profile-mark';
  return mat;
}

/** A raster favicon mark (no first-party vector found): its light parts, as a thin plate. */
function rasterMark(url) {
  const tex = new THREE.TextureLoader().load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ color: 0xddd6ff, map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  mat.userData.uBrand = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uBrand = mat.userData.uBrand;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uBrand;').replace(
      '#include <map_fragment>',
      `vec4 tx = texture2D(map, vMapUv);
      float lum = dot(tx.rgb, vec3(0.333));
      // the mark's light strokes on its dark tile; at rest pale, forward in its own colours
      diffuseColor.a *= smoothstep(0.45, 0.8, lum) * tx.a;
      diffuseColor.rgb = tx.rgb * 1.15 * diffuseColor.rgb;`,
    );
  };
  mat.customProgramCacheKey = () => 'profile-mark-raster';
  return { geo: new THREE.PlaneGeometry(2, 2), mat };
}

// The figure's AI ecosystem: the models it actually works with, as an intelligence field around it.
//
// Not logos on discs: each model is a sculptural emblem drawn in thin luminous strokes (a custom
// sigil derived from its mark, not the mark itself), monochrome while it waits in the field, filled
// with its own colour only when it comes forward to the figure. Three tiers: primary presences are
// large and act; secondary ones are smaller and come forward less often; the deep field is glints
// that only now and then reveal who they are. The field sits behind and around the figure (the
// person stays in front), drifting on slow orbits. Rarely the whole field assembles into a crown behind
// the figure with its paths alight.

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp, smoothstep = THREE.MathUtils.smoothstep;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const S = FIGURE_SCALE;
export const CHEST_Y = 0.975 + 1.32 * S;

// ------------------------------------------------------------------ registry
// `slot`: place in the field (angle round the figure's back, height above the chest, distance);
// `focus`: which influence it leans toward (dynamics only); `evidence`: why it is here.
export const MODELS = [
  { id: 'openai', name: 'ChatGPT', tier: 1, sigil: 'knot', color: '#e8e4f4', slot: [-1.05, 0.95, -0.55], evidence: 'WinCodex, chatgpt-web, Clarity smart model, cloudlinegpt' },
  { id: 'claude', name: 'Claude', tier: 1, sigil: 'spark', color: '#e07a55', slot: [1.15, 1.2, -0.9], evidence: 'Clarity (Anthropic); this hub is built with Claude Code' },
  { id: 'gemini', name: 'Gemini', tier: 1, sigil: 'star4', color: '#7aa2ff', slot: [-1.6, -0.2, -1.6], evidence: 'cloudlinegemini, Clarity' },
  { id: 'grok', name: 'Grok', tier: 1, sigil: 'slash', color: '#e8e4f4', slot: [1.7, 0.1, -1.9], evidence: 'grok-electron' },
  { id: 'deepseek', name: 'DeepSeek', tier: 2, sigil: 'whale', color: '#5a78ff', slot: [0.35, 2.0, -2.4], evidence: 'Clarity default fast model; open weights' },
  { id: 'qwen', name: 'Qwen', tier: 2, sigil: 'hexq', color: '#8a7cff', slot: [-2.2, 1.4, -2.8], evidence: 'open weights (local)' },
  { id: 'kimi', name: 'Kimi', tier: 2, sigil: 'kdot', color: '#f2f0ff', slot: [2.3, 1.6, -3.0], evidence: 'open weights; long context' },
  { id: 'mistral', name: 'Mistral', tier: 2, sigil: 'blocks', color: '#ff8a3c', slot: [-0.6, 2.4, -3.4], evidence: 'open weights' },
  { id: 'llama', name: 'Llama', tier: 3, sigil: 'ring', color: '#f2f0ff', slot: [-3.0, 0.6, -4.2], evidence: 'open weights (Ollama, local)' },
  { id: 'gemma', name: 'Gemma', tier: 3, sigil: 'star4', color: '#f2f0ff', slot: [3.1, 0.3, -4.0], evidence: 'open weights' },
  { id: 'glm', name: 'GLM', tier: 3, sigil: 'hex', color: '#f2f0ff', slot: [-1.4, 3.0, -4.6], evidence: 'open weights' },
  { id: 'minimax', name: 'MiniMax', tier: 3, sigil: 'wave', color: '#ff5f8f', slot: [1.8, 2.9, -4.4], evidence: 'Clarity provider' },
];
const SIZE = { 1: 0.44, 2: 0.31, 3: 0.15 };
// Each identity's own path round the whole person (no carousel): radius `r`, angular speed `w`, a
// vertical excursion `a` about a mid height `u` (above the chest, world units; the head is about +1,
// the hips -0.85), `nu` vertical swings per revolution (2 goes high and low within one pass behind
// the body), phase `ph`. The lower field below the hips is reached only by an occasional low pass.
const ORBIT = {
  openai: { r: 1.42, w: 0.135, u: 0.05, a: 1.0, nu: 1, ph: 0.4 },
  claude: { r: 1.52, w: 0.165, u: -0.1, a: 1.15, nu: 1, ph: 2.0 },
  gemini: { r: 1.36, w: 0.15, u: -0.35, a: 0.85, nu: 2, ph: -0.7 },
  grok: { r: 1.6, w: 0.12, u: 0.4, a: 0.95, nu: 1, ph: 1.1 },
  deepseek: { r: 2.35, w: 0.1, u: -0.45, a: 1.0, nu: 1, ph: 0.9 },
  qwen: { r: 2.1, w: 0.115, u: 0.7, a: 1.65, nu: 1, ph: 3.4 },
  kimi: { r: 2.7, w: 0.09, u: 0.1, a: 1.75, nu: 2, ph: 3.14 },
  mistral: { r: 2.5, w: 0.098, u: 0.2, a: 1.45, nu: 2, ph: 4.4 },
  llama: { r: 3.6, w: 0.05, u: -1.3, a: 1.0, nu: 1, ph: 1.6 },
  gemma: { r: 3.3, w: 0.058, u: 1.5, a: 1.2, nu: 1, ph: 5.1 },
  glm: { r: 3.75, w: 0.045, u: 0.2, a: 1.9, nu: 2, ph: 2.6 },
  minimax: { r: 3.45, w: 0.052, u: -0.5, a: 1.5, nu: 1, ph: 0.2 },
};
// the occasional passes through the lower field: a target height and the radius to pass at
const LOW_PASS = {
  hip: { u: -1.25, k: 1.3, min: 1.6, fold: 1, turn: 1.6, swing: 0.25 }, // a wide orbit at hip level
  thigh: { u: -2.0, k: 1.18, min: 1.6, fold: 0.85, turn: 1.8, swing: 0.3 }, // a dip toward the upper thigh, then rising again
  behind: { u: -2.05, k: 1.1, min: 2.3, fold: 1, turn: 1.2, swing: 0.35 }, // a crossing behind the legs
  pedestal: { u: -2.6, k: 1.2, min: 2.75, fold: 1, turn: 1.4, swing: 0.15 }, // a low ellipse round the pedestal
  arc: { u: -1.8, k: 1.15, min: 1.55, fold: 0.7, turn: 2.2, swing: 0.5 }, // from shoulder height into a low arc and back
  outer: { u: -1.95, k: 1.25, min: 1.75, fold: 0.2, turn: 0.5, swing: 0.2 }, // down past one outer thigh, on the viewer's side
  diag: { u: -1.75, k: 1.2, min: 1.75, fold: 1, turn: 2.4, swing: 1.05 }, // from the ankles up toward the far shoulder, behind the body
};
const LOW_ORDER = ['hip', 'behind', 'outer', 'pedestal', 'arc', 'thigh', 'behind', 'diag', 'outer'];
// the body as capsules (bone to bone, radius in human units), for keeping waiting logos clear of it
const BODY_SEGS = [['thighL', 'shinL', 0.09], ['shinL', 'footL', 0.066], ['thighR', 'shinR', 0.09], ['shinR', 'footR', 0.066], ['pelvis', 'chest', 0.16], ['chest', 'neck', 0.16], ['neck', 'head', 0.1], ['upperArmL', 'foreArmL', 0.06], ['foreArmL', 'handL', 0.05], ['handL', 'fingersL', 0.05], ['upperArmR', 'foreArmR', 0.06], ['foreArmR', 'handR', 0.05], ['handR', 'fingersR', 0.05]];

// ------------------------------------------------------------------ sigils as polylines (unit radius)
function sigilLines(kind) {
  const L = [];
  const arc = (cx, cy, r, a0, a1, n = 24) => Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  const stadium = (w, l, ox, rot) => {
    const pts = [];
    const r = w / 2;
    for (const [cy, a0] of [[l / 2 - r, 0], [-l / 2 + r, Math.PI]]) for (let i = 0; i <= 10; i++) {
      const a = a0 + (i / 10) * Math.PI;
      pts.push([ox + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    pts.push(pts[0]);
    return pts.map(([x, y]) => [x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot)]);
  };
  switch (kind) {
    case 'knot':
      for (let i = 0; i < 6; i++) L.push(stadium(0.3, 0.8, 0.2, (i * Math.PI) / 3));
      break;
    case 'spark':
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + 0.08 * Math.sin(i * 2.7), l = i % 2 ? 0.68 : 0.98;
        L.push([[0.16 * Math.cos(a), 0.16 * Math.sin(a)], [l * Math.cos(a), l * Math.sin(a)]]);
      }
      break;
    case 'star4': {
      // a four-pointed sparkle: sharp tips, concave sides
      const pts = [];
      for (let k = 0; k < 4; k++) {
        const a = (k * TAU) / 4 + Math.PI / 2;
        for (let i = 0; i < 12; i++) {
          const u = i / 12, b = a + u * (TAU / 4);
          const r = 0.16 + 0.84 * Math.pow(Math.abs(Math.cos(u * Math.PI)), 5);
          pts.push([r * Math.cos(b), r * Math.sin(b)]);
        }
      }
      pts.push(pts[0]);
      L.push(pts);
      break;
    }
    case 'slash':
      L.push(arc(0, 0, 0.66, -0.35, 4.3, 32));
      L.push([[-0.82, -0.9], [0.9, 0.92]]);
      break;
    case 'whale': {
      const bez = (p0, p1, p2, p3, n = 20) => Array.from({ length: n + 1 }, (_, i) => {
        const t = i / n, u = 1 - t;
        return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]);
      });
      L.push([...bez([-0.9, -0.05], [-0.7, -0.75], [0.55, -0.75], [0.8, 0.05]), ...bez([0.8, 0.05], [0.55, -0.2], [0.05, -0.3], [-0.4, 0.12]).slice(1)]);
      L.push(bez([0.72, 0.0], [0.85, 0.5], [0.6, 0.75], [0.45, 0.8], 12));
      L.push(bez([0.75, 0.05], [1.0, 0.35], [1.0, 0.6], [0.98, 0.72], 12));
      L.push(arc(-0.38, -0.25, 0.07, 0, TAU, 10));
      break;
    }
    case 'hexq': {
      const h = Array.from({ length: 7 }, (_, i) => [0.72 * Math.cos((i * TAU) / 6 + Math.PI / 6), 0.72 * Math.sin((i * TAU) / 6 + Math.PI / 6)]);
      L.push(h);
      L.push(Array.from({ length: 7 }, (_, i) => [0.36 * Math.cos((i * TAU) / 6), 0.36 * Math.sin((i * TAU) / 6)]));
      L.push([[0.45, -0.45], [0.95, -0.95]]);
      break;
    }
    case 'kdot':
      L.push([[-0.55, -0.85], [-0.55, 0.85]]);
      L.push([[0.5, 0.85], [-0.5, 0.0], [0.6, -0.85]]);
      L.push(arc(0.78, 0.62, 0.11, 0, TAU, 12));
      break;
    case 'blocks': {
      // a stepped M of square cells
      const cells = [[-2, 2], [2, 2], [-2, 1], [-1, 1], [1, 1], [2, 1], [-2, 0], [0, 0], [2, 0], [-2, -1], [2, -1], [-2, -2], [2, -2]];
      const c = 0.36;
      for (const [x, y] of cells) {
        const x0 = x * c - c * 0.42, y0 = y * c - c * 0.42, w = c * 0.84;
        L.push([[x0, y0], [x0 + w, y0], [x0 + w, y0 + w], [x0, y0 + w], [x0, y0]]);
      }
      break;
    }
    case 'wave':
      L.push(arc(0, 0, 0.8, 0, TAU, 36));
      L.push(Array.from({ length: 25 }, (_, i) => [-0.7 + (1.4 * i) / 24, 0.28 * Math.sin((i / 24) * TAU * 1.5)]));
      break;
    case 'hex':
      L.push(Array.from({ length: 7 }, (_, i) => [0.8 * Math.cos((i * TAU) / 6), 0.8 * Math.sin((i * TAU) / 6)]));
      break;
    default:
      L.push(arc(0, 0, 0.7, 0, TAU, 28));
      L.push(arc(0, 0, 0.12, 0, TAU, 10));
  }
  return L;
}

/** A sigil as a small wire construction: the strokes on two layers, joined by short rods. */
function emblemGeometry(kind, radius = 0.026) {
  const parts = [];
  for (const [layer, z, r] of [[0, 0.09, radius], [1, -0.09, radius * 0.6]]) {
    sigilLines(kind).forEach((pts) => {
      const curve = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x * (layer ? 0.94 : 1), y * (layer ? 0.94 : 1), z)), false, 'catmullrom', 0.2);
      const g = new THREE.TubeGeometry(curve, Math.max(6, Math.ceil(curve.getLength() * 26)), r, 5, false);
      g.deleteAttribute('uv');
      parts.push(g);
      if (layer === 0) {
        // rods between the layers at the stroke's ends and middle
        for (const t of [0, 0.5, 1]) {
          const p = curve.getPoint(t);
          const rod = new THREE.CylinderGeometry(radius * 0.45, radius * 0.45, 0.18, 4);
          rod.rotateX(Math.PI / 2);
          rod.translate(p.x * 0.97, p.y * 0.97, 0);
          rod.deleteAttribute('uv');
          parts.push(rod);
        }
      }
    });
  }
  return mergeGeometries(parts, false);
}

// response structures: each model answers with its own geometry (points of a small instanced form)
const RESPONSE = {
  openai: (i, n, t) => { const a = (i / n) * TAU + t * 0.6; const r = 0.32 + 0.05 * (i % 2); return [r * Math.cos(a), r * Math.sin(a), 0.05 * Math.sin(a * 3)]; },
  claude: (i, n, t) => { const a = (Math.floor(i / 3) / (n / 3)) * TAU; const r = 0.12 + 0.13 * (i % 3) + 0.04 * Math.sin(t * 3 + i); return [r * Math.cos(a), r * Math.sin(a), 0]; },
  gemini: (i, n, t) => { const a = (i / n) * TAU; const r = 0.12 + 0.3 * Math.abs(Math.cos(2 * a)) ** 2; return [r * Math.cos(a + t * 0.3), r * Math.sin(a + t * 0.3), 0]; },
  grok: (i, n, t) => { const a = i * 0.62 + t * 1.4; const r = 0.05 + 0.017 * i; return [r * Math.cos(a), r * Math.sin(a), 0.01 * i - 0.12]; },
  deepseek: (i, n, t) => { const x = -0.45 + (0.9 * i) / n; return [x, 0.14 * Math.sin(x * 9 + t * 3), 0]; },
  qwen: (i, n) => { const q = i % 5, r = Math.floor(i / 5); return [(q - 2) * 0.13 + (r % 2) * 0.065, (r - 2) * 0.11, 0]; },
  kimi: (i, n, t) => { const u = i / n; return [-0.6 + 1.2 * u, 0.06 * Math.sin(u * 20 + t * 2), 0.05 * Math.cos(u * 14)]; },
  mistral: (i) => { const c = i % 4, r = Math.floor(i / 4); return [(c - 1.5) * 0.12, (r - 2) * 0.12, 0]; },
};

// ------------------------------------------------------------------ an emblem in the field
class Presence {
  constructor(def, group, pointScale) {
    this.def = def;
    this.size = SIZE[def.tier];
    const M = MARKS[def.id];
    if (M?.svg) {
      this.geo = markGeometry(def);
      this.mat = markMaterial();
    } else if (M?.png) {
      const r = rasterMark(M.png);
      this.geo = r.geo;
      this.mat = r.mat;
    } else {
      // no first-party mark found: an unlabelled point of the deep field
      this.geo = new THREE.IcosahedronGeometry(0.22, 1);
      this.mat = new THREE.MeshBasicMaterial({ color: 0x9a94c8, transparent: true, depthWrite: false });
      this.mat.userData.uBrand = { value: 0 };
    }
    this.mono = new THREE.Color('#ddd6ff');
    this.brand = new THREE.Color(def.color);
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.renderOrder = 4;
    group.add(this.mesh);
    // a luminous outline of the mark's own edges (vector strokes with depth)
    if (M?.svg) {
      this.edges = new THREE.LineSegments(new THREE.EdgesGeometry(this.geo, 30), new THREE.LineBasicMaterial({ color: 0xece6ff, transparent: true, opacity: 0.6, depthWrite: false }));
      this.mesh.add(this.edges);
    }
    this.disc = { material: { opacity: 0 } };
    this.pos = new THREE.Vector3();
    this.home = new THREE.Vector3();
    this.fg = 0;
    this.fgGoal = 0;
    this.anchor = new THREE.Vector3();
    this.reveal = def.tier === 3 ? 0 : 1;
    this.phase = Math.random() * TAU;
    this.spin = 0;
    this.pull = 0; // leaning of the field during a decision (-1 .. +1)
  }
}

export class Models {
  constructor(station, ctx) {
    this.st = station;
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'profile-models';
    this.list = MODELS.map((d) => new Presence(d, this.group, ctx.uniforms.uPointScale));
    this.by = Object.fromEntries(this.list.map((p) => [p.def.id, p]));
    // nothing is drawn before its first valid update (no startup garbage)
    for (const p of this.list) p.mesh.visible = false;
    this.yaw = null;
    this.centre = new THREE.Vector3(0, CHEST_Y, 0);
    this.crown = 0;
    this.crownGoal = 0;
    this.decide = 0;
    this.lean = 0;
    this.perturbAt = -99;
    this.#buildPaths();
    this.#buildResponses();
    this.#buildNames();
    this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this._q = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
  }

  #buildPaths() {
    // each presence's slow path, drawn faintly; alight when the field assembles
    const N = 96;
    this.paths = this.list.filter((p) => p.def.tier < 3).map((p) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      const line = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: 0xb9adff, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }));
      line.frustumCulled = false;
      this.group.add(line);
      return { p, line, N };
    });
  }

  #buildResponses() {
    // up to three answers at once, each a small structure of instanced crystals in its model's form
    const geo = new THREE.OctahedronGeometry(0.045, 0);
    this.responses = [0, 1, 2].map(() => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false }), 24);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      this.group.add(m);
      return { m, id: null, k: 0, pos: new THREE.Vector3(), scale: 1 };
    });
    // the prompt: one small object the figure sends out (and copies of it)
    this.prompts = [0, 1, 2].map(() => {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 0), new THREE.MeshBasicMaterial({ color: 0xfff4e6, transparent: true, depthWrite: false }));
      m.visible = false;
      this.group.add(m);
      return m;
    });
  }

  #buildNames() {
    const mk = (text) => {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 96;
      const g = c.getContext('2d');
      g.font = '500 50px "Inter Variable", Inter, system-ui, sans-serif';
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if ('letterSpacing' in g) g.letterSpacing = '14px';
      g.fillText(text.toUpperCase(), 256, 50);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    for (const p of this.list) {
      p.label = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.116), new THREE.MeshBasicMaterial({ map: mk(p.def.name), transparent: true, opacity: 0, depthWrite: false, color: 0xe2dcff }));
      p.label.visible = false;
      this.group.add(p.label);
    }
  }

  // ------------------------------------------------------------------ control (used by activities)
  /** Bring a model forward to a place (station frame); `k` 0..1. */
  summon(id, place, k = 1) {
    const p = this.by[id];
    if (!p) return;
    p.fgGoal = k;
    p.anchor.copy(place);
  }
  release(id) {
    if (this.by[id]) this.by[id].fgGoal = 0;
  }
  releaseAll() {
    for (const p of this.list) p.fgGoal = 0;
  }
  pos(id) {
    return this.by[id]?.pos;
  }
  /** Show model `id`'s answer as its structure at `pos`, scale `s`, strength `k` (slot 0..2). */
  answer(slot, id, pos, k, s = 1) {
    const r = this.responses[slot];
    r.id = id;
    r.k = k;
    r.pos.copy(pos);
    r.scale = s;
  }
  prompt(i, pos, k) {
    const m = this.prompts[i];
    m.visible = k > 0.01;
    m.position.copy(pos);
    m.scale.setScalar(0.4 + 0.6 * k);
    m.material.opacity = k;
  }
  /** Re-engagement: the lanes tighten toward the figure (graded by drift), then reopen. */
  tighten(amp, time) {
    this._laneGoal = Math.max(this._laneGoal ?? 0, amp);
    this._laneUntil = time + 0.8;
  }

  perturb(time) {
    this.perturbAt = time;
  }

  // ------------------------------------------------------------------ update
  update(time, dt, c) {
    const st = this.st;
    const chest = st.bonePoint('chest', [0, 0.04, 0]);
    this.centre.x += (chest.x - this.centre.x) * Math.min(1, dt * 1.4);
    this.centre.z += (chest.z - this.centre.z) * Math.min(1, dt * 1.4);
    // the field faces where the figure presents (its torso), slowly
    const ty = st.att.torso.v;
    this.yaw = this.yaw === null ? ty : this.yaw + wrap(ty - this.yaw) * Math.min(1, dt * 0.45);
    const fwd = this._v[0].set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const left = this._v[1].set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const cam = st.group.worldToLocal(this._v[2].copy(c.refCam)).clone();
    const ord = clamp(c.order, 0, 1);
    this.crown += (this.crownGoal - this.crown) * Math.min(1, dt * 0.9);
    this.decide += ((c.decide ?? 0) - this.decide) * Math.min(1, dt * 2);
    this.lean += ((c.lean ?? 0) - this.lean) * Math.min(1, dt * 1.5);
    const pert = Math.exp(-(time - this.perturbAt) / 0.4);
    // calm (hover, fresh focus) draws the field in, small and ordered; life lets it range wider
    const spread = lerp(1, 0.78, ord) * (1 + 0.12 * c.life);
    const cr = this.crown;
    // which presences are awake: a small rotating constellation (never the whole checklist), every
    // model's turn coming round; the crown wakes six; anything brought forward is awake
    // every identity leads a set in turn over a long idle (ChatGPT never leads; no one dominates)
    const SETS = [['claude', 'qwen', 'openai'], ['grok', 'kimi', 'deepseek'], ['gemini', 'mistral', 'glm'], ['deepseek', 'claude', 'minimax'], ['qwen', 'gemini', 'grok'], ['mistral', 'openai', 'kimi'], ['kimi', 'glm', 'claude'], ['glm', 'deepseek', 'gemini'], ['minimax', 'grok', 'qwen']];
    const CROWN = ['gemini', 'openai', 'claude', 'grok', 'qwen', 'deepseek'];
    const T = 21, ph = time / T + 0.37, si = Math.floor(ph) % SETS.length, fr = ph - Math.floor(ph);
    const fade = smoothstep(fr, 0, 0.14) * (1 - smoothstep(fr, 0.86, 1));
    // the field's two state blends, both velocity-continuous springs: hover biases the orbit planes
    // toward the viewer; a re-engagement tightens the lanes, then lets them reopen
    {
      const dS = Math.min(dt, 1 / 30), wT = 3.2, wL = 3.6;
      if (time > (this._laneUntil ?? -1)) this._laneGoal = 0;
      const tG = c.focused ? 0 : c.wake ?? 0;
      this._tiltV = (this._tiltV ?? 0) + (wT * wT * (tG - (this._tilt ?? 0)) - 2 * wT * (this._tiltV ?? 0)) * dS;
      this._tilt = (this._tilt ?? 0) + this._tiltV * dS;
      this._laneV = (this._laneV ?? 0) + (wL * wL * ((this._laneGoal ?? 0) - (this._lane ?? 0)) - 2 * wL * (this._laneV ?? 0)) * dS;
      this._lane = (this._lane ?? 0) + this._laneV * dS;
    }
    const tilt = this._tilt ?? 0, lane = clamp(this._lane ?? 0, 0, 1);
    const W = [1, 0.8, 0.6];
    this.#lowPass(time, c, ord);
    // the head stays readable: identities around it share that space rather than pile up in it
    let headLoad = 0;
    for (const p of this.list) headLoad += (p._zone ?? 0) * (p.awake ?? 0);
    for (const p of this.list) {
      const id = p.def.id;
      const j = SETS[si].indexOf(id);
      let awake = j >= 0 ? W[j] * fade : 0;
      awake = lerp(awake, CROWN.includes(id) ? 1 : 0, cr);
      const wake = c.wake ?? 0;
      if (j >= 0) awake = Math.max(awake, (j === 0 ? 1 : 0.8) * wake);
      else awake = Math.max(awake, 0.12 * wake);
      // the other primaries stay faintly present (3-5 readable identities at any moment)
      if (j < 0 && p.def.tier === 1) awake = Math.max(awake, 0.24);
      // hover: the models on the viewer's side become somewhat more present
      if (p.def.tier < 3) awake = Math.max(awake, Math.min(1, awake + 0.16 * tilt * (p._frontK ?? 0)));
      // a model on a low pass is seen doing it
      if (p._low) awake = Math.max(awake, (p.def.tier < 3 ? 0.85 : 0.6) * p._low.env);
      const hy = p.pos.y - this.centre.y, hr = Math.hypot(p.pos.x - this.centre.x, p.pos.z - this.centre.z);
      p._zone = smoothstep(hy, 0.2, 0.65) * (1 - smoothstep(hy, 1.5, 2.1)) * (1 - smoothstep(hr, 1.7, 2.4));
      if (j !== 0) awake *= lerp(1, 1 / (1 + 2.4 * Math.max(0, headLoad - p._zone * (p.awake ?? 0))), p._zone * (1 - cr) * (1 - (c.wake ?? 0)));
      awake = Math.max(awake, p.fg);
      p.awake = (p.awake ?? awake) + (awake - (p.awake ?? awake)) * Math.min(1, dt * 1.2);
      const [L0, U0, F0] = p.def.slot;
      // a slow swing round the vertical axis through the chest: primaries travel furthest, passing
      // the shoulders and coming round toward the viewer's side; the deep field barely moves
      // a real orbit round the person: each model has its own radius, height, inclined plane and
      // speed (slow celestial mechanics: a primary goes round in ~40 s); primaries close round the
      // shoulders, the second ring deeper, the far field slow and distant. They pass behind the body
      // and round its sides (the avoidance field keeps them off the face, tie and PROFILE word)
      const mi = MODELS.indexOf(p.def), o = ORBIT[id];
      const dirW = mi % 4 === 3 ? -1 : 1;
      p.orbTh ??= mi * 2.399 + 0.5; // spread round the person from the first frame (golden angle)
      // identities in the same part of the field ease apart along their orbits: no bunching on one side
      let apart = 0;
      if (p.def.tier < 3) for (const q of this.list) {
        if (q === p || q.def.tier > 2 || q.orbTh === undefined) continue;
        const dTh = wrap(p.orbTh - q.orbTh);
        if (Math.abs(dTh) < 1.15) apart += Math.sin((dTh * Math.PI) / 1.15) * (1 - smoothstep(Math.abs((p._u ?? 0) - (q._u ?? 0)), 0.7, 1.6));
      }
      p.orbTh += dt * 0.09 * apart * (1 - cr);
      // hover quickens the near models, focused drift brings the orbit back to life; a body on a real
      // orbit is not uniform either, so it hurries through one side of its path
      p.orbTh += dt * o.w * dirW * (1 + 0.28 * Math.cos(p.orbTh + o.ph)) * (1 + (p._low ? LOW_PASS[p._low.style].turn * p._low.env : 0)) * (1 - 0.55 * ord) * (1 + (p.def.tier === 1 ? 0.5 : 0.25) * (c.wake ?? 0)) * (1 + 0.35 * (c.life ?? 0)) * (1 + 0.4 * Math.abs(this.decide));
      // the lane itself evolves: radius and eccentricity breathe on each model's own slow period
      const low = p._low ?? null, lowK = low ? low.env : 0, LP = low ? LOW_PASS[low.style] : null;
      const rBase = o.r * (1 + 0.13 * Math.sin(time * (0.07 + 0.013 * mi) + p.phase));
      const rLow = LP ? Math.max(o.r * LP.k, LP.min) : rBase;
      const tierR = lerp(rBase, rLow, lowK) * (1 - 0.08 * tilt) * (1 - (p.def.tier === 1 ? 0.26 : p.def.tier === 2 ? 0.2 : 0.08) * lane);
      const ecc = 0.86 + 0.1 * Math.sin(time * (0.05 + 0.009 * mi) + 2.1 * p.phase);
      const fRaw = tierR * ecc * Math.sin(p.orbTh) * (1 - 0.2 * tilt);
      // (a low pass keeps to the sides and behind the legs: never hovering in front of them)
      let l = tierR * Math.cos(p.orbTh) + 0.1 * tierR * Math.sin(time * 0.031 + mi), f = lerp(fRaw, -Math.abs(fRaw) * 0.9, lowK * (LP?.fold ?? 0));
      // the height: a large excursion on the model's own rhythm, its node drifting slowly
      const uBase = o.u + o.a * (1 - 0.7 * lane) * Math.sin(p.orbTh * o.nu + o.ph + time * 0.013 * (mi % 2 ? 1 : -1)) + 0.22 * Math.sin(time * (0.11 + 0.017 * mi) + p.phase);
      let u = LP ? lerp(uBase, Math.max(-2.9, LP.u + LP.swing * Math.sin(low.x * TAU - Math.PI / 2)), lowK) : uBase;
      p._lf = [Math.cos(p.orbTh), Math.sin(p.orbTh), uBase];
      p._u = uBase;
      // hover: the plane leans a little toward the viewer (the near side lifts); depth is kept
      u += 0.16 * tilt * (f / tierR);
      p._frontK = clamp(f / tierR, 0, 1);
      // the crown: six in a wide arc behind and above the shoulders, the rest far back as points
      const ci = CROWN.indexOf(id);
      if (cr > 0.001) {
        const ca = (ci - 2.5) * 0.46;
        const cl = ci >= 0 ? Math.sin(ca) * 2.55 : L0 * 1.25, cu = ci >= 0 ? 2.25 + 0.55 * Math.cos(ca * 1.25) : U0 + 1.0, cf = ci >= 0 ? -Math.cos(ca) * 1.35 - 0.5 : F0 * 1.3;
        l = lerp(l, cl, cr);
        u = lerp(u, cu, cr);
        f = lerp(f, cf, cr);
      }
      p.home.copy(this.centre).addScaledVector(left, l * spread).addScaledVector(fwd, f * spread);
      p.home.y += u * spread;
      // attended: the first of the set comes in to shoulder height; the other two exchange places
      const wk = c.wake ?? 0;
      if (wk > 0.01 && j === 0) {
        // beside the shoulder on the viewer's open side (away from the PROFILE spine), never over the head
        const toCam = this._v[3].set(cam.x - this.centre.x, 0, cam.z - this.centre.z).normalize();
        const scrL = this._v[4].crossVectors(toCam, THREE.Object3D.DEFAULT_UP);
        p.home.lerp(new THREE.Vector3().copy(this.centre).addScaledVector(scrL, 1.3).addScaledVector(toCam, 0.3).add(new THREE.Vector3(0, 0.45, 0)), 0.92 * wk);
      }
      if (wk > 0.01 && (j === 1 || j === 2)) {
        this._hoverT = (this._hoverT ?? 0) + (j === 1 ? dt * wk : 0);
        const other = this.by[SETS[si][j === 1 ? 2 : 1]];
        const sw = (0.5 - 0.5 * Math.cos(this._hoverT * 0.7)) * wk;
        if (other?._homePrev) p.home.lerp(other._homePrev, sw);
      }
      p._homePrev = (p._homePrev ?? new THREE.Vector3()).copy(p.home);
      // the field leans a little with a decision
      p.home.addScaledVector(left, -this.lean * Math.abs(this.decide) * (p.def.tier === 3 ? 0.25 : 0.5));
      p.home.y += pert * 0.12 * Math.sin(time * 21 + p.phase * 5);
      p.fg += (p.fgGoal - p.fg) * Math.min(1, dt * 1.7);
      const fgk = THREE.MathUtils.smootherstep(p.fg, 0, 1);
      p.pos.copy(p.home).lerp(p.anchor, fgk);
      p.pos.y += Math.sin(Math.PI * fgk) * 0.25;
      // the final position is a critically damped spring: lane swaps, set changes, spacing pushes
      // and summons are all velocity-continuous (no teleport, no instant lane change)
      if (!p._sp) (p._sp = p.pos.clone()), (p._sv = new THREE.Vector3());
      {
        const wP = 4.2 + 2.5 * fgk, dP = Math.min(dt, 1 / 30);
        p._sv.addScaledVector(this._v[3].subVectors(p.pos, p._sp), wP * wP * dP).addScaledVector(p._sv, -2 * wP * dP);
        p._sp.addScaledVector(p._sv, dP);
        p.pos.copy(p._sp);
      }
      // camera-aware framing: a logo drifting toward the frame's edge (close cameras) is drawn
      // back toward the figure, smoothly in proportion to how far out it is
      const camO = this.ctx.app?.camera;
      if (camO) {
        const w = st.group.localToWorld(this._v[4].copy(p.pos)).project(camO);
        const ox = Math.max(0, Math.abs(w.x) - 0.8), oy = Math.max(0, Math.abs(w.y) - 0.78);
        if (Number.isFinite(w.x) && Number.isFinite(w.y) && ox + oy > 0 && w.z < 1) p.pos.lerp(this.centre, Math.min(0.45, (ox + oy) * 1.4));
      }
      // a waiting logo keeps clear of the actual limbs and torso, wherever they are (an arm reaching
      // out, a leg), pushed straight out from the nearest bone; and it stays off the line from the
      // viewer to the head, however it travels (all of this feeds the smoothed offset below)
      if (fgk < 0.4) {
        if (this._bodyT !== time) {
          this._bodyT = time;
          this._body = BODY_SEGS.map(([a, b, r]) => [st.bonePoint(a, [0, 0, 0]), st.bonePoint(b, b === 'head' ? [0, 0.12, 0] : [0, 0, 0]), r * S]);
        }
        const clear = p.mesh.scale.x * 0.62 + 0.11, wB = 1 - smoothstep(fgk, 0.05, 0.4);
        // a floor on the distance from the body's axis (a smooth maximum): the orbit itself, and the
        // pull back into frame at close cameras, can never bring a waiting logo in among the limbs
        {
          const ax = this._body[4][0], dx = p.pos.x - ax.x, dz = p.pos.z - ax.z, rr = Math.hypot(dx, dz), fl = 1.14 + p.mesh.scale.x * 0.62;
          if (rr > 1e-3) {
            const k = 0.35, h = Math.max(k - Math.abs(rr - fl), 0) / k, m = Math.max(rr, fl) + h * h * k * 0.25, g = 1 + ((m / rr) - 1) * wB;
            p.pos.x = ax.x + dx * g;
            p.pos.z = ax.z + dz * g;
          }
        }
        // the head and the shirt front stay in view: a logo between them and the viewer arcs round
        // the line of sight (radially, so it curves over, under or past with no change of side)
        if (this._viewT !== time) (this._viewT = time), (this._view = [[st.bonePoint('head', [0, 0.11, 0]), 0.34], [st.bonePoint('chest', [0, 0.02, 0.08]), 0.5], [st.bonePoint('pelvis', [0, -0.1, 0.02]), 0.42], [st.bonePoint('pelvis', [0, -0.3, 0.02]), 0.55], [st.bonePoint('pelvis', [0, -0.52, 0.02]), 0.55], [st.bonePoint('pelvis', [0, -0.76, 0.02]), 0.55]]);
        for (const [H, rad] of this._view) {
          const ab = this._v[3].subVectors(cam, H), ap = this._v[4].subVectors(p.pos, H);
          const rawT = ap.dot(ab) / Math.max(ab.lengthSq(), 1e-6), t = clamp(rawT, 0, 0.96);
          if (rawT <= -0.06) continue; // (behind it: hidden by the body anyway)
          ap.addScaledVector(ab, -t);
          const d = ap.length(), need = rad * (1 - t) + p.mesh.scale.x * 0.75 + 0.06;
          if (d < need && d > 1e-4) p.pos.addScaledVector(ap, ((need - d) / d) * wB * smoothstep(rawT, -0.06, 0.02));
        }
        // the PROFILE column, the same way (the line of sight to the column at the logo's own height)
        const sp = st.label?.spine;
        if (sp) {
          const H = (this._colP ??= new THREE.Vector3()).set(sp.position.x, clamp(p.pos.y, sp.position.y - 1.95, sp.position.y + 1.95), sp.position.z);
          const ab = this._v[3].subVectors(cam, H), ap = this._v[4].subVectors(p.pos, H);
          const rawT = ap.dot(ab) / Math.max(ab.lengthSq(), 1e-6), t = clamp(rawT, 0, 0.96);
          if (rawT > -0.06) {
            ap.addScaledVector(ab, -t);
            ap.y = 0; // across the column only: it is tall
            const d = ap.length(), need = 0.3 * (1 - t) + p.mesh.scale.x * 0.75 + 0.06;
            if (d < need && d > 1e-4) p.pos.addScaledVector(ap, ((need - d) / d) * wB * smoothstep(rawT, -0.06, 0.02));
          }
        }
        // (the body comes last: nothing above may push a logo back into a limb)
        for (const [A, B, r] of this._body) {
          const ab = this._v[3].subVectors(B, A), ap = this._v[4].subVectors(p.pos, A);
          const t = clamp(ap.dot(ab) / Math.max(ab.lengthSq(), 1e-6), 0, 1);
          ap.addScaledVector(ab, -t); // from the closest point on the bone to the logo
          const d = ap.length(), need = r + clear;
          if (d < need && d > 1e-4) p.pos.addScaledVector(ap, ((need - d) / d) * wB);
        }
      }
      // the avoidance offset is itself velocity-continuous: the reference camera jumps to the
      // destination view the moment a flight begins, and the sideways push must not jump with it
      {
        const goal = this._v[3].subVectors(p.pos, p._sp);
        if ([goal.x, goal.y, goal.z].every(Number.isFinite)) {
          if (!p._av) (p._av = goal.clone()), (p._avV = new THREE.Vector3());
          const wA = 7, dA = Math.min(dt, 1 / 30);
          p._avV.addScaledVector(goal.sub(p._av), wA * wA * dA).addScaledVector(p._avV, -2 * wA * dA);
          p._av.addScaledVector(p._avV, dA);
          p.pos.copy(p._sp).add(p._av);
        }
      }
      // validity contract: a presence is drawn only from a finite transform. Any non-finite input
      // (e.g. the intro's first frames, before the camera reference settles) falls back to its slot
      // and resets its spring; and nothing is shown before its first valid update
      if (![p.pos.x, p.pos.y, p.pos.z].every(Number.isFinite)) {
        p.pos.copy(Number.isFinite(p.home.x) ? p.home : this.centre);
        p._sp?.copy(p.pos);
        p._sv?.set(0, 0, 0);
        p._av?.set(0, 0, 0);
        p._avV?.set(0, 0, 0);
      }
      p._valid = true;
      p.mesh.visible = true;
      p.mesh.position.copy(p.pos);
      // orientation: a three-quarter turn while it waits (its depth shows); presenting square to the
      // viewer as it comes forward or wakes in the crown
      // the target orientation is built on a scratch object, then the mark turns toward it smoothly
      // (continuous angular motion, no snap); a non-finite camera reference never reaches the mark
      const O = (this._o ??= new THREE.Object3D());
      if ([cam.x, cam.y, cam.z].every(Number.isFinite) && cam.distanceToSquared(p.pos) > 1e-8) {
        this._m.lookAt(cam, p.pos, THREE.Object3D.DEFAULT_UP);
        O.quaternion.setFromRotationMatrix(this._m);
      } else O.quaternion.copy(p.mesh.quaternion);
      p.spin += dt * (0.25 + 5 * (p.spinGoal ?? 0));
      const oblique = (1 - fgk) * (1 - 0.75 * cr) * (1 - 0.6 * ord) * (1 - (j === 0 ? 0.85 : 0.3) * (c.wake ?? 0)) * (0.62 + 0.22 * Math.sin(time * 0.17 + p.phase)) * (MODELS.indexOf(p.def) % 2 ? 1 : -1);
      O.rotateY(oblique);
      O.rotateX(0.18 * Math.sin(time * 0.13 + p.phase) * (1 - fgk));
      O.rotateZ(0.08 * Math.sin(p.spin) + (p.spinGoal ?? 0) * p.spin * 0.2);
      if ([O.quaternion.x, O.quaternion.y, O.quaternion.z, O.quaternion.w].every(Number.isFinite)) {
        if (!p._oriented) (p.mesh.quaternion.copy(O.quaternion), (p._oriented = true));
        else p.mesh.quaternion.slerp(O.quaternion, Math.min(1, dt * 7));
      }
      const aw = p.awake;
      p.mesh.scale.setScalar(p.size * (p.def.id === 'openai' ? 0.7 : 1) * (0.42 + 0.58 * aw) * (1 + 0.35 * fgk) * (1 + 0.04 * Math.sin(time * 1.3 + p.phase)));
      const white = p.def.color.toLowerCase() === '#f2f0ff';
      // always in its own colours; nearer, more awake ones are brighter (never desaturated)
      p.mat.color.setScalar(Math.min(1, 0.55 + 0.3 * aw + 0.15 * fgk + 0.2 * (p.spinGoal ?? 0)) * (id === 'openai' ? 0.82 : 1)); // the white mark reads loudest on the dark: keep it a peer
      p.mat.opacity = (0.07 + 0.88 * aw) * (1 - 0.25 * ord * (1 - fgk));
      if (p.edges) p.edges.material.opacity = (0.05 + 0.25 * aw) * (1 - 0.6 * fgk);
      const nm = fgk * smoothstep(c.fk, 0.5, 0.95);
      p.label.visible = nm > 0.02;
      if (p.label.visible) {
        p.label.material.opacity = nm * 0.85;
        p.label.position.copy(p.pos).y -= p.size * 1.6 * (1 + 0.6 * fgk) * 0.8;
        p.label.lookAt(c.refCam);
      }
    }
    // paths: only the awake presences leave a faint trace of their arc
    for (const P of this.paths) {
      const arr = P.line.geometry.attributes.position.array;
      const p = P.p;
      const [L0, U0, F0] = p.def.slot;
      const amp = p.def.tier === 1 ? 0.62 : 0.32;
      for (let i = 0; i < P.N; i++) {
        const sw = amp * Math.sin((i / P.N) * TAU);
        const l = L0 * Math.cos(sw) - F0 * Math.sin(sw), f = L0 * Math.sin(sw) + F0 * Math.cos(sw);
        const v = (this._pv ??= new THREE.Vector3()).copy(this.centre).addScaledVector(left, l * spread).addScaledVector(fwd, f * spread);
        arr[i * 3] = v.x;
        arr[i * 3 + 1] = this.centre.y + U0 * spread;
        arr[i * 3 + 2] = v.z;
      }
      P.line.geometry.attributes.position.needsUpdate = true;
      P.line.material.opacity = (0.18 * cr * (p.awake ?? 0) + 0.18 * (c.wake ?? 0) * (p.awake ?? 0)) * (1 - p.fg) * (1 - cr * 0.4);
    }
    const m = this._m; // (was defined by the removed influences block; the answers use it)
    // answers
    const q = new THREE.Quaternion().setFromRotationMatrix(this._m.lookAt(cam, this.centre, THREE.Object3D.DEFAULT_UP));
    for (const r of this.responses) {
      const fn = RESPONSE[r.id];
      if (!fn || r.k < 0.01) {
        r.m.count = 0;
        continue;
      }
      const n = 20;
      const p = this.by[r.id];
      r.m.material.color.copy(p.brand).lerp(new THREE.Color(1, 1, 1), 0.35);
      r.m.material.opacity = r.k;
      for (let i = 0; i < n; i++) {
        const [x, y, z] = fn(i, n, time);
        const v = new THREE.Vector3(x, y, z).multiplyScalar(r.scale * (0.6 + 0.4 * r.k)).applyQuaternion(q).add(r.pos);
        m.makeRotationFromEuler(new THREE.Euler(time + i, i, time * 0.7)).scale(new THREE.Vector3(1, 1, 1).multiplyScalar(r.k)).setPosition(v);
        r.m.setMatrixAt(i, m);
      }
      r.m.count = n;
      r.m.instanceMatrix.needsUpdate = true;
    }
  }

  /** Models take slow passes through the lower field, one or two at a time; hover brings more. */
  #lowPass(time, c, ord) {
    const L = (this._low ??= { at: 2.5, active: [], n: 0, recent: [] });
    L.active = L.active.filter((a) => {
      const x = (time - a.t0) / a.dur;
      if (x >= 1 || (a.p.fgGoal > 0.05 && a.env < 0.02)) return void (a.p._low = null), false;
      a.x = x;
      a.env = Math.sin(Math.PI * x) ** 2; // zero velocity at both ends
      return true;
    });
    const wake = c.wake ?? 0;
    if (L.active.length >= (wake > 0.5 ? 4 : 3) || time < L.at || this.crownGoal > 0.05 || ord > 0.6) return;
    const style = LOW_ORDER[L.n % LOW_ORDER.length];
    let best = null, bs = -Infinity;
    for (const p of this.list) {
      if (p._low || p.fgGoal > 0.05 || p.fg > 0.05 || !p._lf || L.recent.includes(p.def.id)) continue;
      if (style === 'behind' ? p.def.tier === 1 : p.def.tier === 3) continue;
      if (p.def.id === 'openai' && style !== 'arc') continue;
      const [cl, cf, cu] = p._lf;
      // a behind-pass starts behind; an arc starts high (so it also clears the head area); the
      // others start out at the side, where the descent reads and nothing crosses the body
      const score = style === 'behind' ? -cf : style === 'arc' || style === 'diag' ? cu - 0.5 * cf : Math.abs(cl) - Math.max(0, cf);
      if (score > bs) (bs = score), (best = p);
    }
    L.n++;
    if (!best) return void (L.at = time + 0.6);
    L.recent.push(best.def.id);
    if (L.recent.length > 4) L.recent.shift();
    const dur = lerp(8.2, 5.5, wake) + (L.n % 3) * 0.6;
    best._low = { p: best, style, t0: time, dur, env: 0, x: 0 };
    L.active.push(best._low);
    L.at = time + lerp(2.0 + 1.2 * ((time * 0.377) % 1), 0.9, wake);
    this.st.emit('idle-pass', { p: best });
  }

  stats() {
    return { presences: this.list.length, drawCalls: this.list.length * 2 + this.paths.length + 2 + 3 + 3 };
  }
}
