import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SCREEN_GLSL, BOUND_GLSL, NO_CLIP, PHOSPHOR_GLSL as PH } from './ProjectsScreen.js';
import { Portal } from './ProjectsPortal.js';
import { HOT, ramp, pulse, hash, screenPlane, clippedMaterial, outOfGlass } from './ProjectsKit.js';

// Cameos: shorter works between the flagships, each with one idea of its own.
//  WinCodex — a legacy box is snapshotted; the snapshot goes into the screen, through a tunnel that
//    comes out behind the console's head (space that cannot be there), is patched on the way, lands
//    as a result beside the original, and is split by the conflict check: one half merges, the
//    conflicting half is dropped.
//  FunChessEngine — a search tree grows into the screen's depth, prunes, and its chosen line comes
//    out as a physical path of squares on the deck that an abstract piece moves along.
//  PianoMir — screen-only: note bars against a playhead, the recording's chroma, and the alignment
//    path walking the cost matrix, each at its own depth.
//  Clarity — screen-only: an overlay that separates into its structured layers and recombines.
// Micro cameos (screen-only, a few seconds): avoid.love, Nitro Notes, the Kitco scraper.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DECK = 1.56;
const ONE = new THREE.Vector3(1, 1, 1);

/** Colour-merged geometry from parts: [geometry, colour, matrix?]. */
function parts(list) {
  const geos = list.map(([g, color, m]) => {
    let geo = g.index ? g.toNonIndexed() : g;
    if (m) geo.applyMatrix4(m);
    const c = new THREE.Color(color);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(arr, i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    if (geo.attributes.uv) geo.deleteAttribute('uv');
    return geo;
  });
  return mergeGeometries(geos);
}
const T4 = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);

/** A lit physical mesh portals and the glass can cut. */
function physMesh(host, geo, key, opts = {}) {
  const mat = clippedMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.12, ...opts }, key, host.scr);
  const m = new THREE.Mesh(geo, mat);
  m.customDepthMaterial = mat.userData.depth;
  m.castShadow = true;
  m.receiveShadow = true;
  m.visible = false;
  host.group.add(m);
  return m;
}

/** Lines that can be anywhere: drawn through the glass while inside the computer, as objects outside. */
function wireMaterial(scr) {
  return new THREE.ShaderMaterial({
    uniforms: { ...scr, uA: { value: 0 }, uHot: { value: 0 }, uClip0: { value: NO_CLIP.clone() } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec3 vW; varying vec3 vL; void main(){ vL = position; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */ `
      ${SCREEN_GLSL}
      ${BOUND_GLSL}
      uniform float uA; uniform float uHot; uniform vec4 uClip0;
      varying vec3 vW; varying vec3 vL;
      void main() {
        if (uA < 0.003 || dot(uClip0.xyz, vW) + uClip0.w < 0.0) discard;
        float fd, s;
        if (!scrBound(vW, fd, s)) discard;
        gl_FragDepth = fd;
        float patchK = step(0.0, vL.x) * step(-0.02, vL.y);
        vec3 col = mix(${PH}, ${HOT}, uHot * patchK);
        gl_FragColor = vec4(col * uA * 1.4 * (s > 0.0 ? exp(-s * 0.1) : 1.0), 1.0);
      }`,
  });
}

/** Phosphor lines (or points) inside the screen with per-vertex alpha and heat. */
function dataMaterial(scr, ctx, points = false) {
  return new THREE.ShaderMaterial({
    uniforms: { ...scr, uShow: { value: 0 }, uScale: ctx.uniforms.uPointScale },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uScale; attribute float aA; attribute float aHot;
      varying vec3 vW; varying float vA; varying float vHot;
      void main() {
        vA = aA; vHot = aHot;
        vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        vec4 mv = viewMatrix * w; gl_Position = projectionMatrix * mv;
        ${points ? 'gl_PointSize = aA > 0.01 ? max(0.06 * uScale / -mv.z, 1.5) : 0.0;' : ''}
      }`,
    fragmentShader: /* glsl */ `
      ${SCREEN_GLSL}
      uniform float uShow; varying vec3 vW; varying float vA; varying float vHot;
      void main() {
        float fd; if (vA * uShow < 0.004 || !scrSee(vW, fd)) discard; gl_FragDepth = fd;
        float a = 1.0;
        ${points ? 'vec2 c = abs(gl_PointCoord - 0.5) * 2.0; a = 1.0 - smoothstep(0.4, 1.0, max(c.x, c.y));' : ''}
        float s = scrS(vW);
        gl_FragColor = vec4(mix(${PH}, ${HOT}, vHot) * a * vA * uShow * (0.8 + 0.6 * vHot) * exp(-s * 0.06), 1.0);
      }`,
  });
}

class CameoBase {
  constructor(host, name, length) {
    this.host = host;
    this.name = name;
    this.length = length;
    this.lamp = 5;
    this._prev = -1;
  }
  lengthFor() {
    return this.length;
  }
  crossed(at, t) {
    return this._prev < at && t >= at;
  }
  physicalNow() {
    return false;
  }
}

// ---------------------------------------------------------------- WinCodex

export class WinCodexWork extends CameoBase {
  constructor(host) {
    super(host, 'wincodex', 14);
    const { scr } = host;
    // a beige legacy tower: drive bay, slot, a power lamp
    const W = 0.26, H = 0.21, D = 0.22;
    const box = parts([
      [new RoundedBoxGeometry(W, H, D, 2, 0.02), 0xb7b0a1],
      [new THREE.BoxGeometry(W * 0.7, 0.03, 0.01), 0x2a2b2e, T4(0, 0.045, D / 2 + 0.002)],
      [new THREE.BoxGeometry(W * 0.4, 0.008, 0.01), 0x2a2b2e, T4(-0.03, -0.01, D / 2 + 0.002)],
      [new THREE.BoxGeometry(0.018, 0.018, 0.01), 0x6b6f63, T4(0.09, -0.07, D / 2 + 0.002)],
    ]);
    this.box = physMesh(host, box, 'proj-wc-box');
    // the patch it receives: a vermilion strip across the top
    this.stripe = physMesh(host, parts([[new THREE.BoxGeometry(W * 0.92, 0.012, D * 0.5), 0xc4472f, T4(0, H / 2 + 0.004, 0.03)]]), 'proj-wc-stripe', { emissive: 0xe3684d, emissiveIntensity: 0.8 });
    // the patched result, as two halves (the conflict check splits it)
    const half = (side) => parts([
      [new RoundedBoxGeometry(W / 2, H, D, 2, 0.015), 0xb7b0a1],
      [new THREE.BoxGeometry(W / 2 * 0.92, 0.012, D * 0.5), 0xc4472f, T4(0, H / 2 + 0.004, 0.03)],
      [new THREE.BoxGeometry(0.004, H * 0.9, D * 0.9), 0xe3684d, T4(-side * W / 4, 0, 0)],
    ]);
    this.halves = [-1, 1].map((s, i) => physMesh(host, half(s), `proj-wc-half${i}`, { emissive: 0xe3684d, emissiveIntensity: 0 }));
    // the snapshot: a wire copy, drawn wherever it is
    const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(W * 1.08, H * 1.08, D * 1.08));
    const extra = new THREE.BufferGeometry().setFromPoints([V(-W * 0.38, H * 0.25, D * 0.54), V(W * 0.38, H * 0.25, D * 0.54), V(-W * 0.38, -0.01, D * 0.54), V(W * 0.1, -0.01, D * 0.54)]);
    this.wires = [0, 1].map(() => {
      const l = new THREE.LineSegments(mergeGeometries([eg, extra]), wireMaterial(scr));
      l.frustumCulled = false;
      l.visible = false;
      host.group.add(l);
      return l;
    });
    this.H = H;
    // the deck opening, the conflict drop, the tunnel in the screen and its impossible exit
    this.Dk = host.addPortal(new Portal(scr, { rx: 0.2, ry: 0.17, shape: 'rect' }), V(0.66, DECK + 0.004, 0.5), V(0, 1, 0));
    this.Sx = host.addPortal(new Portal(scr, { rx: 0.12, ry: 0.15, shape: 'rect', tier: 'micro' }), V(0.135, DECK + 0.004, 0.55), V(0, 1, 0));
    this.T = host.addScreenPortal(new Portal(scr, { rx: 0.24, ry: 0.2, masked: true }), V(-0.5, 0.15, -2.6), V(0, 0, 1));
    this.R = host.addPortal(new Portal(scr, { rx: 0.26, ry: 0.22, tier: 'normal' }), V(0, 6.0, -1.15), V(0, 0.35, 1));
    this.focus = new THREE.Vector3();
    this._plane = new THREE.Plane();
    this._m = new THREE.Matrix4();
  }

  physicalNow() {
    return this._t > 0.3 && this._t < 13.7;
  }

  #hide() {
    this.box.visible = this.stripe.visible = false;
    this.halves.forEach((h) => (h.visible = false));
    this.wires.forEach((w) => (w.visible = false));
    for (const p of [this.Dk, this.Sx, this.T, this.R]) p.set(0, 0);
  }

  update(t, time, dt, show) {
    const h = this.host;
    this._t = t;
    if (!(t <= this.length)) {
      this.#hide();
      this._prev = -1;
      return null;
    }
    const M = h.machine.matrix;
    const qM = new THREE.Quaternion().setFromRotationMatrix(M);
    const at = (x, y, z) => V(x, y, z).applyMatrix4(M);
    const rest = this.H / 2 + 0.002;
    const homeX = 0.66, landX = 0.2, Z = 0.5;
    // portals
    this.Dk.set(Math.max(pulse(t, 0, 0.5, 1.9, 2.4), pulse(t, 11.2, 11.7, 13.3, 13.8)), time);
    this.Sx.set(pulse(t, 9.8, 10.2, 11.0, 11.4), time);
    this.T.set(pulse(t, 3.9, 4.3, 4.9, 5.3), time);
    this.R.set(pulse(t, 4.4, 4.8, 5.7, 6.1), time);
    const dkPlane = this.Dk.plane(new THREE.Plane());
    // the original: up out of the deck, and at the end back down into it
    const rise = ramp(t, 0.5, 1.8), sink = ramp(t, 11.5, 13.3);
    const y = DECK - 0.16 + (rest + 0.16) * rise - (rest + 0.2) * sink;
    const showBox = t > 0.4 && t < 13.6;
    this.box.visible = this.stripe.visible = showBox;
    this.box.position.copy(at(homeX, y, Z));
    this.box.quaternion.copy(qM);
    this.stripe.position.copy(this.box.position);
    this.stripe.quaternion.copy(qM);
    this.stripe.visible = showBox && t > 10.5;
    for (const m of [this.box, this.stripe]) {
      m.material.userData.clip(0, dkPlane);
      m.material.userData.clip(1, null);
      m.material.userData.glass(false);
    }
    // the snapshot flash
    this.box.material.emissive?.set(0xe3684d);
    this.box.material.emissiveIntensity = 1.4 * pulse(t, 2.0, 2.15, 2.3, 2.6) + 1.2 * pulse(t, 10.4, 10.55, 10.7, 11.0);
    // the snapshot's route: up off the box, in through the glass, deep to the tunnel …
    const [wA, wB] = this.wires;
    wA.visible = wB.visible = false;
    const T0 = h.portalFrame(this.T, this._m).clone();
    const tPos = new THREE.Vector3().setFromMatrixPosition(T0);
    const toScr = (x, y, z) => V(x, y, z).applyMatrix4(h.screenToStation);
    if (t > 2.1 && t < 4.75) {
      const k = ramp(t, 2.4, 4.7);
      // forward off the deck, up in front of the frame's lower lip, then in through the glass
      const curve = new THREE.CatmullRomCurve3([at(homeX, DECK + rest + 0.012, Z), at(0.62, 2.3, 1.4), toScr(0.38, -0.5, 0.8), toScr(0.3, -0.35, 0.12), toScr(0.1, -0.1, -1.2), tPos]);
      wA.visible = true;
      wA.position.copy(curve.getPoint(k));
      wA.quaternion.copy(qM);
      wA.material.uniforms.uA.value = ramp(t, 2.1, 2.3);
      wA.material.uniforms.uHot.value = 0;
      const c = this.T.plane(this._plane);
      wA.material.uniforms.uClip0.value.set(c.normal.x, c.normal.y, c.normal.z, c.constant);
    }
    // … and out of the head's back, over the top, patched on the way, down to the deck
    if (t > 4.6 && t < 8.4) {
      const R0 = h.portalFrame(this.R, this._m).clone();
      const rPos = new THREE.Vector3().setFromMatrixPosition(R0);
      const rN = new THREE.Vector3().setFromMatrixColumn(R0, 2).normalize();
      const k = ramp(t, 4.75, 8.0);
      const curve = new THREE.CatmullRomCurve3([rPos.clone().addScaledVector(rN, -0.15), rPos, at(0.08, 6.2, 0.5), at(0.18, 5.15, 1.85), at(0.2, 2.6, 1.55), at(landX, DECK + rest + 0.012, Z)]);
      wB.visible = true;
      wB.position.copy(curve.getPoint(0.04 + 0.96 * k));
      wB.quaternion.copy(qM);
      wB.material.uniforms.uA.value = 1 - ramp(t, 8.0, 8.35);
      wB.material.uniforms.uHot.value = ramp(t, 5.6, 6.8);
      const c = this.R.plane(this._plane);
      wB.material.uniforms.uClip0.value.set(c.normal.x, c.normal.y, c.normal.z, c.constant);
      this.focus.copy(wB.position);
    }
    // the result, split by the conflict check
    const [hl, hr] = this.halves;
    const res = t > 8.0 && t < 11.6;
    hl.visible = res;
    hr.visible = res && t < 10.6;
    if (res) {
      const sep = 0.035 * pulse(t, 8.6, 9.0, 9.4, 9.6) + 0.035 * ramp(t, 9.5, 9.7);
      const W4 = 0.065;
      // the conflicting half flashes and drops through the deck
      const drop = ramp(t, 10.3, 11.1);
      hl.position.copy(at(landX - W4 - sep, DECK + rest - drop * (this.H + 0.06), Z));
      // the accepted half slides into the original
      const slide = ramp(t, 9.6, 10.55);
      hr.position.copy(at(landX + W4 + sep + (homeX - landX - W4) * slide, DECK + rest, Z));
      hl.quaternion.copy(qM);
      hr.quaternion.copy(qM);
      const flash = pulse(t, 8.0, 8.05, 8.2, 8.6);
      hl.material.emissiveIntensity = 1.5 * flash + (t > 9.4 ? 1.2 * (0.5 + 0.5 * Math.sin(time * 18)) : 0) * (1 - drop);
      hr.material.emissiveIntensity = 1.5 * flash + 0.8 * pulse(t, 8.6, 8.9, 9.3, 9.6);
      hl.material.userData.clip(0, this.Sx.plane(new THREE.Plane()));
      hr.material.userData.clip(0, null);
      for (const m of [hl, hr]) m.material.userData.glass(false);
      this.focus.copy(t < 10 ? hr.position : hl.position);
    } else if (t < 4.6) this.focus.copy(t < 2.4 ? this.box.position : wA.position);
    else if (t > 11.6) this.focus.copy(this.box.position);
    // heard
    const c = (x) => this.crossed(x, t);
    if (c(0.55)) h.emit('wc-rise');
    if (c(2.05)) h.emit('wc-snapshot');
    if (c(4.6)) h.emit('transit');
    if (c(4.8)) h.emit('wc-emerge');
    if (c(8.0)) h.emit('land', { k: 0.6 });
    if (c(8.65)) h.emit('wc-conflict');
    if (c(10.45)) h.emit('wc-merge');
    if (c(10.4)) h.emit('wc-drop');
    if (c(11.55)) h.emit('wc-sink');
    this._prev = t;
    const busy = t > 0.4 && t < 13.5;
    return { focus: busy ? this.focus : null, event: t > 8.5 && t < 11.2 ? this.focus : null, activity: busy ? 0.7 : 0.3, crossing: (t > 2.6 && t < 3.6), lamp: this.lamp };
  }
}

// ---------------------------------------------------------------- FunChessEngine

const TREE = (() => {
  // a fixed little search tree: root, 4 replies, 3, 2, 2; the principal variation is a chain of indices
  const nodes = [{ d: 0, p: -1, x: 0, y: 0 }];
  const branch = [4, 3, 2, 2];
  let level = [0];
  for (let d = 0; d < branch.length; d++) {
    const next = [];
    level.forEach((pi, j) => {
      for (let b = 0; b < branch[d]; b++) {
        const spread = 0.55 / (d + 1);
        const par = nodes[pi];
        const k = b - (branch[d] - 1) / 2;
        nodes.push({ d: d + 1, p: pi, x: par.x + k * spread * (d % 2 ? 0.5 : 1), y: par.y + k * spread * (d % 2 ? 1 : 0.45) + (hash(nodes.length) - 0.5) * 0.05 });
        next.push(nodes.length - 1);
      }
    });
    level = next;
  }
  // the chosen line: the second reply, then its first, …
  const pv = [0];
  let cur = 0;
  for (const pick of [1, 0, 1, 0]) {
    const kids = nodes.map((n, i) => (n.p === cur ? i : -1)).filter((i) => i >= 0);
    cur = kids[Math.min(pick, kids.length - 1)];
    pv.push(cur);
  }
  return { nodes, pv: new Set(pv), pvList: pv };
})();

export class ChessWork extends CameoBase {
  constructor(host) {
    super(host, 'chess', 14);
    const { scr, ctx } = host;
    const g = (this.scene = new THREE.Group());
    host.screenFrame.add(g);
    // the position being searched, at the front
    this.board = screenPlane(scr, 0.62, 0.62, { uShow: { value: 0 }, uT: { value: 0 } }, {
      main: /* glsl */ `
        vec2 c = floor((m + 0.31) / 0.0775);
        float dark = mod(c.x + c.y, 2.0);
        col += ${PH} * (0.04 + 0.05 * dark) * step(abs(m.x), 0.31) * step(abs(m.y), 0.31);
        col += ${PH} * rectD(m, vec2(0.0), vec2(0.31), 0.002) * 0.5;
        for (int i = 0; i < 7; i++) {
          vec2 q = (vec2(floor(hash11(float(i) * 3.7) * 8.0), floor(hash11(float(i) * 5.1 + 2.0) * 8.0)) + 0.5) * 0.0775 - 0.31;
          col += ${PH} * (1.0 - smoothstep(0.012, 0.02, length(m - q))) * 0.8;
        }
        col += ${HOT} * (1.0 - smoothstep(0.014, 0.024, length(m - vec2(0.0387, -0.1163)))) * 1.2;`,
    });
    this.board.position.set(-0.85, -0.3, -0.35);
    g.add(this.board);
    // the tree, growing into the depth
    const N = TREE.nodes.length;
    const pos = new Float32Array(N * 3), lpos = new Float32Array((N - 1) * 6);
    const root = V(-0.85, -0.3, -0.45);
    const P = (n) => V(root.x + 0.55 + n.d * 0.32 + n.x * 0.6, root.y + 0.3 + n.y * 0.9, root.z - n.d * 0.85);
    TREE.nodes.forEach((n, i) => {
      n.pos = P(n);
      n.pos.toArray(pos, i * 3);
    });
    TREE.nodes[0].pos.copy(root);
    root.toArray(pos, 0);
    TREE.nodes.slice(1).forEach((n, j) => {
      TREE.nodes[n.p].pos.toArray(lpos, j * 6);
      n.pos.toArray(lpos, j * 6 + 3);
    });
    const mk = (arr, count, points) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      geo.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(count), 1));
      geo.setAttribute('aHot', new THREE.BufferAttribute(new Float32Array(count), 1));
      const o = points ? new THREE.Points(geo, dataMaterial(scr, ctx, true)) : new THREE.LineSegments(geo, dataMaterial(scr, ctx));
      o.frustumCulled = false;
      g.add(o);
      return o;
    };
    this.nodes = mk(pos, N, true);
    this.edges = mk(lpos, (N - 1) * 2, false);
    // the chosen line as a physical path: squares on the deck, and a piece that walks it
    const sq = new RoundedBoxGeometry(0.17, 0.018, 0.17, 2, 0.005);
    const sqMat = clippedMaterial({ color: 0x3a3c40, roughness: 0.35, metalness: 0.6, emissive: 0xe3684d, emissiveIntensity: 0.25 }, 'proj-chess-sq', scr);
    this.squares = new THREE.InstancedMesh(sq, sqMat, 3);
    this.squares.customDepthMaterial = sqMat.userData.depth;
    this.squares.receiveShadow = true;
    this.squares.castShadow = true;
    this.squares.frustumCulled = false;
    this.squares.visible = false;
    this.squares.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    host.group.add(this.squares);
    const piece = parts([
      [new THREE.CylinderGeometry(0.05, 0.058, 0.03, 24), 0xcfc8bb, T4(0, 0.015, 0)],
      [new THREE.CylinderGeometry(0.022, 0.034, 0.075, 20), 0xcfc8bb, T4(0, 0.067, 0)],
      [new THREE.SphereGeometry(0.032, 18, 12), 0xcfc8bb, T4(0, 0.12, 0)],
      [new THREE.TorusGeometry(0.03, 0.005, 6, 20).rotateX(Math.PI / 2), 0xc4472f, T4(0, 0.03, 0)],
    ]);
    this.piece = physMesh(host, piece, 'proj-chess-piece');
    this.SQ = [V(-0.42, DECK + 0.009, 0.62), V(-0.2, DECK + 0.009, 0.5), V(0.02, DECK + 0.009, 0.62)];
    this.focus = new THREE.Vector3();
    this._m = new THREE.Matrix4();
  }

  physicalNow() {
    return this._t > 7.0 && this._t < 13.6;
  }

  update(t, time, dt, show) {
    const h = this.host;
    this._t = t;
    const live = t <= this.length;
    const sh = live ? show : 0;
    this.board.material.uniforms.uShow.value = sh * (1 - 0.4 * ramp(t, 6, 8));
    this.nodes.material.uniforms.uShow.value = sh;
    this.edges.material.uniforms.uShow.value = sh;
    if (!live) {
      this.squares.visible = this.piece.visible = false;
      this._prev = -1;
      return null;
    }
    // the search: depth by depth; then pruning; then the chosen line burns
    const grow = (d) => ramp(t, 0.8 + d * 1.0, 1.6 + d * 1.0);
    const prune = ramp(t, 5.4, 6.4), pvHot = ramp(t, 5.9, 6.8);
    const fadeAll = 1 - ramp(t, 12.0, 13.6);
    const na = this.nodes.geometry.attributes.aA, nh = this.nodes.geometry.attributes.aHot;
    const ea = this.edges.geometry.attributes.aA, eh = this.edges.geometry.attributes.aHot;
    TREE.nodes.forEach((n, i) => {
      const on = TREE.pv.has(i);
      const a = grow(n.d) * (on ? 1 : 1 - 0.8 * prune) * fadeAll;
      na.setX(i, a);
      nh.setX(i, on ? pvHot : 0);
      if (i > 0) {
        const j = i - 1;
        const ae = grow(n.d - 0.3) * (on ? 1 : 1 - 0.85 * prune) * fadeAll * 0.8;
        ea.setX(j * 2, ae);
        ea.setX(j * 2 + 1, ae);
        eh.setX(j * 2, on ? pvHot : 0);
        eh.setX(j * 2 + 1, on ? pvHot : 0);
      }
    });
    na.needsUpdate = nh.needsUpdate = ea.needsUpdate = eh.needsUpdate = true;
    // the path comes out of the glass and lies down on the deck; the piece follows and walks it
    const M = h.machine.matrix;
    const qM = new THREE.Quaternion().setFromRotationMatrix(M);
    const st = (v) => v.clone().applyMatrix4(M);
    const vis = t > 6.9 && t < 13.7;
    this.squares.visible = this.piece.visible = vis;
    if (vis) {
      const pvPts = TREE.pvList.slice(1, 4).map((i) => TREE.nodes[i].pos);
      for (let i = 0; i < 3; i++) {
        const k = ramp(t, 7.0 + i * 0.35, 7.9 + i * 0.35) * (1 - ramp(t, 11.6 + (2 - i) * 0.3, 12.5 + (2 - i) * 0.3));
        const from = [pvPts[i].x * 0.6, -0.55 + i * 0.05, -0.12];
        const p = outOfGlass(from, st(this.SQ[i]), k, h.screenToStation, new THREE.Vector3());
        const tilt = (1 - k) * 0.9;
        this._m.compose(p, qM.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, 0))), k > 0.001 ? ONE : new THREE.Vector3(0, 0, 0));
        this.squares.setMatrixAt(i, this._m);
      }
      this.squares.instanceMatrix.needsUpdate = true;
      this.squares.material.userData.glass(true);
      this.squares.material.userData.clip(0, null);
      this.squares.material.userData.clip(1, null);
      this.squares.material.emissiveIntensity = 0.25 + 0.9 * pulse(t, 9.0, 9.1, 9.3, 9.7) + 0.9 * pulse(t, 9.9, 10.0, 10.2, 10.6);
      // the piece: out to the first square, two moves along the line, back in
      const k = ramp(t, 8.0, 8.9) * (1 - ramp(t, 11.2, 12.1));
      const top = (i) => st(this.SQ[i]).add(V(0, 0.009, 0).applyQuaternion(qM));
      let p = outOfGlass([-0.2, -0.5, -0.12], top(0), k, h.screenToStation, new THREE.Vector3());
      const hop = (t0, a, b) => {
        const u = ramp(t, t0, t0 + 0.6);
        const q = new THREE.Vector3().lerpVectors(top(a), top(b), u);
        q.y += Math.sin(u * Math.PI) * 0.18;
        return { q, u };
      };
      if (t > 9.0 && t < 11.2) {
        const h1 = hop(9.0, 0, 1), h2 = hop(9.9, 1, 2);
        p = t < 9.9 ? h1.q : h2.q;
        if (t > 10.5) p = top(2);
      }
      if (t >= 11.2) p = outOfGlass([-0.2, -0.5, -0.12], top(2), k, h.screenToStation, new THREE.Vector3());
      this.piece.position.copy(p);
      this.piece.quaternion.copy(qM);
      this.piece.material.userData.glass(true);
      this.piece.material.userData.clip(0, null);
      this.piece.material.userData.clip(1, null);
      this.focus.copy(p);
    }
    const c = (x) => this.crossed(x, t);
    for (let d = 0; d < 5; d++) if (c(0.8 + d * 1.0)) h.emit('chess-expand', { d });
    if (c(5.4)) h.emit('chess-prune');
    if (c(5.9)) h.emit('chess-line');
    if (c(8.85)) h.emit('land', { k: 0.4 });
    if (c(9.55)) h.emit('chess-move', { i: 0 });
    if (c(10.45)) h.emit('chess-move', { i: 1 });
    this._prev = t;
    return { focus: vis ? this.focus : null, event: t > 8.8 && t < 10.8 ? this.focus : null, activity: vis ? 0.6 : 0.45, crossing: (t > 7 && t < 8.9) || (t > 11.2 && t < 12.6), lamp: this.lamp };
  }
}

// ---------------------------------------------------------------- PianoMir

const NOTES = Array.from({ length: 18 }, (_, i) => ({ at: 0.9 + i * 0.36 + (i % 3 === 2 ? 0.12 : 0), len: 0.18 + 0.3 * hash(i * 2.3), row: Math.floor(hash(i * 1.7 + 4) * 7) }));

export class PianoMirWork extends CameoBase {
  constructor(host) {
    super(host, 'pianomir', 9.5);
    const { scr } = host;
    const g = (this.scene = new THREE.Group());
    host.screenFrame.add(g);
    const notes = NOTES.map((n) => `vec3(${n.at.toFixed(2)}, ${n.len.toFixed(2)}, ${n.row.toFixed(1)})`).join(', ');
    // front: the score as note bars sliding to a playhead
    this.roll = screenPlane(scr, 2.5, 0.5, { uShow: { value: 0 }, uT: { value: 0 }, uP: { value: 0 } }, {
      header: `uniform float uP; const vec3 N[18] = vec3[18](${notes});`,
      main: /* glsl */ `
        float head = -0.6;
        col += ${HOT} * lineD(m.x, head, 0.002) * step(abs(m.y), 0.22) * 0.8;
        for (int i = 0; i < 18; i++) {
          vec3 n = N[i];
          float x0 = head + (n.x - uP) * 0.9;
          vec2 c = vec2(x0 + n.y * 0.45, -0.18 + n.z * 0.06);
          float played = step(n.x, uP);
          col += mix(${PH} * 0.55, ${HOT} * 1.1, played * step(uP, n.x + n.y + 0.25)) * fillR(m, c, vec2(n.y * 0.45, 0.018)) * (0.5 + 0.5 * played);
        }`,
    });
    this.roll.position.set(0, 0.48, -0.5);
    // middle: the recording's chroma, revealed as it is heard
    this.chroma = screenPlane(scr, 2.4, 0.8, { uShow: { value: 0 }, uT: { value: 0 }, uP: { value: 0 } }, {
      header: 'uniform float uP;',
      main: /* glsl */ `
        vec2 g = (m + vec2(1.2, 0.4)) / vec2(2.4, 0.8);
        vec2 c = floor(g * vec2(48.0, 12.0));
        float v = hash11(c.x * 0.37 + c.y * 7.1) * 0.5 + 0.5 * step(0.8, hash11(c.x * 1.3 + c.y * 2.9));
        float shown = step(g.x, uP / 8.0);
        col += ${PH} * v * v * 0.28 * shown;
        col += ${HOT} * v * step(0.92, v) * 0.35 * shown;`,
    });
    this.chroma.position.set(0, -0.2, -1.5);
    // deep: the cost matrix and the alignment path walking it
    this.align = screenPlane(scr, 1.5, 1.5, { uShow: { value: 0 }, uT: { value: 0 }, uP: { value: 0 } }, {
      header: 'uniform float uP;',
      main: /* glsl */ `
        vec2 g = (m + 0.7) / 1.4;
        if (g.x > 0.0 && g.x < 1.0 && g.y > 0.0 && g.y < 1.0) {
          vec2 c = floor(g * 20.0);
          float pathY = floor(c.x + 1.2 * sin(c.x * 0.35));
          float cost = clamp(abs(c.y - pathY) / 8.0, 0.0, 1.0);
          col += ${PH} * (1.0 - cost) * (1.0 - cost) * 0.18;
          float on = step(abs(c.y - pathY), 0.5) * step(c.x, uP / 8.0 * 20.0);
          col += ${HOT} * on * 0.8;
        }
        col += ${PH} * rectD(m, vec2(0.0), vec2(0.7), 0.002) * 0.4;`,
    });
    this.align.position.set(0.95, 0.05, -3.0);
    g.add(this.roll, this.chroma, this.align);
    this._played = new Set();
  }

  update(t, time, dt, show) {
    const live = t <= this.length;
    const sh = live ? show * (1 - ramp(t, this.length - 0.8, this.length)) : 0;
    const P = Math.max(0, t - 0.6);
    for (const [pl, k] of [[this.roll, 1], [this.chroma, ramp(t, 0.6, 1.4)], [this.align, ramp(t, 1.0, 2.0)]]) {
      pl.material.uniforms.uShow.value = sh * k;
      pl.material.uniforms.uT.value = time;
      pl.material.uniforms.uP.value = P;
    }
    if (!live) {
      this._prev = -1;
      this._played.clear();
      return null;
    }
    // each note is heard as it reaches the playhead
    NOTES.forEach((n, i) => {
      if (this._prev - 0.6 < n.at && P >= n.at && show > 0.5) this.host.emit('pm-note', { row: n.row, len: n.len });
    });
    this._prev = t;
    return { activity: 0.45, lamp: this.lamp };
  }
}

// ---------------------------------------------------------------- Clarity

const CLARITY_LAYERS = [
  // the screen it reads: a window with code
  `col += ${PH} * rectD(m, vec2(0.0), vec2(0.62, 0.36), 0.002) * 0.55;
   col += ${PH} * fillR(m, vec2(0.0, 0.33), vec2(0.62, 0.03)) * 0.12;
   for (int i = 0; i < 7; i++) col += ${PH} * fillR(m, vec2(-0.5 + 0.18 * hash11(float(i)) + 0.25, 0.2 - float(i) * 0.07), vec2(0.12 + 0.25 * hash11(float(i) + 4.0), 0.008)) * 0.35;`,
  // what it hears: the waveform and the transcript
  `float w = 0.05 * sin(m.x * 38.0 + uT * 6.0) * sin(m.x * 6.0 - uT * 2.0);
   col += ${PH} * lineD(m.y - 0.24, w, 0.003) * step(abs(m.x), 0.55) * 0.7;
   for (int i = 0; i < 3; i++) col += ${PH} * fillR(m, vec2(-0.1 + 0.1 * hash11(float(i) + 9.0), 0.0 - float(i) * 0.08), vec2(0.42 - 0.1 * float(i), 0.009)) * 0.45;`,
  // context it has: the résumé and the job, as two cards
  `col += ${PH} * rectD(m, vec2(-0.3, 0.0), vec2(0.2, 0.26), 0.002) * 0.5;
   col += ${PH} * rectD(m, vec2(0.3, 0.0), vec2(0.2, 0.26), 0.002) * 0.5;
   for (int i = 0; i < 4; i++) { col += ${PH} * fillR(m, vec2(-0.3, 0.15 - float(i) * 0.08), vec2(0.14, 0.007)) * 0.3; col += ${PH} * fillR(m, vec2(0.3, 0.15 - float(i) * 0.08), vec2(0.12, 0.007)) * 0.3; }`,
  // the answer it suggests
  `col += ${HOT} * rectD(m, vec2(0.0), vec2(0.5, 0.18), 0.003) * 0.9;
   for (int i = 0; i < 3; i++) col += ${HOT} * fillR(m, vec2(-0.05, 0.08 - float(i) * 0.07), vec2(0.38 - 0.08 * float(i), 0.009)) * 0.6 * step(float(i) * 0.5, uT - uT0);`,
];

export class ClarityWork extends CameoBase {
  constructor(host) {
    super(host, 'clarity', 9);
    const { scr } = host;
    const g = (this.scene = new THREE.Group());
    host.screenFrame.add(g);
    this.layers = CLARITY_LAYERS.map((main) => {
      const pl = screenPlane(scr, 1.4, 0.85, { uShow: { value: 0 }, uT: { value: 0 }, uT0: { value: 0 } }, { header: 'uniform float uT0;', main });
      g.add(pl);
      return pl;
    });
  }

  update(t, time, dt, show) {
    const live = t <= this.length;
    const sh = live ? show * (1 - ramp(t, this.length - 0.8, this.length)) : 0;
    // one overlay, then its layers separate into depth, hold, and close up again
    const sep = ramp(t, 1.6, 3.6) * (1 - ramp(t, 6.2, 7.8));
    this.layers.forEach((pl, i) => {
      const u = pl.material.uniforms;
      u.uShow.value = sh * ramp(t, 0.2 + i * 0.25, 0.8 + i * 0.25);
      u.uT.value = time;
      u.uT0.value = time - Math.max(0, t - 2.5);
      pl.position.set((i - 1.5) * 0.3 * sep, 0.05 + (i - 1.5) * -0.06 * sep, -0.55 - i * 0.7 * sep - i * 0.004);
      pl.rotation.y = 0.32 * sep;
    });
    if (!live) {
      this._prev = -1;
      return null;
    }
    if (this.crossed(1.6, t)) this.host.emit('clarity-split');
    if (this.crossed(6.2, t)) this.host.emit('clarity-merge');
    this._prev = t;
    return { activity: 0.4, lamp: this.lamp };
  }
}

// ---------------------------------------------------------------- micro cameos

const MICRO = {
  // avoid.love: two points that keep avoiding each other, and fail
  avoid: /* glsl */ `
    float k = clamp((uP - 3.6) / 0.9, 0.0, 1.0);
    for (int j = 0; j < 14; j++) {
      float tt = uP - float(j) * 0.06;
      float r = mix(0.32 + 0.08 * sin(tt * 2.3), 0.0, clamp((tt - 3.6) / 0.9, 0.0, 1.0));
      vec2 a = vec2(cos(tt * 1.7), sin(tt * 2.1)) * r;
      vec2 b = -a + vec2(0.03 * sin(tt * 5.0), 0.0);
      float fade = (j == 0 ? 1.0 : 0.25 * (1.0 - float(j) / 14.0));
      col += ${PH} * (1.0 - smoothstep(0.012, 0.022, length(m - a))) * fade;
      col += ${HOT} * (1.0 - smoothstep(0.012, 0.022, length(m - b))) * fade;
    }
    col += ${HOT} * (1.0 - smoothstep(0.0, 0.02, abs(length(m) - k * 0.35))) * k * (1.0 - k) * 2.0;`,
  // Nitro Notes: a checklist that ticks itself off, fast; then a search sweeps it
  notes: /* glsl */ `
    for (int i = 0; i < 6; i++) {
      float y = 0.3 - float(i) * 0.12;
      float done = step(0.6 + float(i) * 0.45, uP);
      col += ${PH} * rectD(m, vec2(-0.45, y), vec2(0.025), 0.002) * 0.7;
      col += ${HOT} * fillR(m, vec2(-0.45, y), vec2(0.016)) * done;
      col += ${PH} * fillR(m, vec2(-0.1 + 0.1 * hash11(float(i)), y), vec2(0.25 + 0.1 * hash11(float(i) + 2.0), 0.008)) * (0.55 - 0.3 * done);
    }
    float sweep = 0.36 - clamp((uP - 3.4) / 1.2, 0.0, 1.0) * 0.8;
    col += ${PH} * fillR(m, vec2(0.0, sweep), vec2(0.6, 0.05)) * 0.08 * step(3.4, uP);`,
  // the Kitco scraper: a price trace, sampled at intervals into rows of a table
  kitco: /* glsl */ `
    float x = m.x;
    float price = 0.08 * sin(x * 9.0) + 0.05 * sin(x * 23.0 + 1.0) + 0.15;
    float drawn = step(x, -0.6 + uP * 0.32);
    col += ${PH} * lineD(m.y, price, 0.003) * step(abs(x), 0.6) * drawn * 0.8;
    for (int i = 0; i < 8; i++) {
      float sx = -0.55 + float(i) * 0.15;
      float got = step(-0.6 + uP * 0.32, sx) < 0.5 ? 1.0 : 0.0;
      float py = 0.08 * sin(sx * 9.0) + 0.05 * sin(sx * 23.0 + 1.0) + 0.15;
      col += ${HOT} * (1.0 - smoothstep(0.008, 0.016, length(m - vec2(sx, py)))) * got;
      col += ${PH} * fillR(m, vec2(-0.2, -0.12 - float(i) * 0.045), vec2(0.35, 0.007)) * got * 0.45;
    }`,
};

// ethanbchen.com: this site, seen from inside its own console — four stations on a ring, the
// sanctum's lines between them, a camera orbit sweeping round, and in the front-right station a
// console with a tiny screen
MICRO.hub = /* glsl */ `
  vec2 q = m * vec2(1.0, 2.2);
  float ring = 1.0 - smoothstep(0.0, 0.006, abs(length(q) - 0.42));
  col += ${PH} * ring * 0.45;
  col += ${PH} * (1.0 - smoothstep(0.0, 0.004, abs(length(q) - 0.18))) * 0.35;
  for (int i = 0; i < 4; i++) {
    float a = 0.785 + float(i) * 1.5708;
    vec2 c = vec2(sin(a), cos(a)) * 0.42;
    col += (i == 0 ? ${HOT} : ${PH}) * (1.0 - smoothstep(0.03, 0.045, length(q - c))) * (i == 0 ? 1.0 : 0.6);
    col += ${PH} * segD(q, c * 0.43, c, 0.002) * 0.25;
  }
  float ca = uP * 0.9;
  vec2 cam = vec2(sin(ca), cos(ca)) * 0.6;
  col += ${PH} * (1.0 - smoothstep(0.012, 0.022, length(q - cam))) * 0.8;
  col += ${PH} * segD(q, cam, cam * 0.15, 0.0015) * 0.12;
  // the console in its station, and on its screen a still smaller ring
  vec2 sc = vec2(0.42 * 0.707, 0.42 * 0.707) + vec2(0.0, 0.07);
  col += ${HOT} * rectD(q, sc, vec2(0.03, 0.02), 0.002) * 0.9;
  col += ${HOT} * (1.0 - smoothstep(0.0, 0.002, abs(length(q - sc) - 0.009))) * step(1.5, uP);`;
// the GitHub profile's activity: a year of days filling in week by week, its streak lighting up
MICRO.profile = /* glsl */ `
  vec2 g = (m + vec2(0.7, 0.2)) / vec2(1.4, 0.4);
  if (g.x > 0.0 && g.x < 1.0 && g.y > 0.0 && g.y < 1.0) {
    vec2 c = floor(g * vec2(52.0, 7.0));
    vec2 f = fract(g * vec2(52.0, 7.0));
    float day = c.x * 7.0 + (6.0 - c.y);
    float v = hash11(day * 0.73);
    v = v * v * (0.5 + 0.5 * sin(c.x * 0.4));
    float shown = step(c.x, uP * 12.0);
    float box = step(0.15, f.x) * step(f.x, 0.85) * step(0.15, f.y) * step(f.y, 0.85);
    float streak = step(30.0, c.x) * step(c.x, 41.0) * step(3.0, uP);
    col += mix(${PH} * (0.04 + 0.5 * v), ${HOT} * 0.9, streak * step(0.25, v)) * box * shown;
  }
  col += ${PH} * lineD(m.y, -0.32, 0.002) * step(abs(m.x), 0.7) * 0.3;`;

export class MicroWork extends CameoBase {
  constructor(host) {
    super(host, 'micro', 5.5);
    const { scr } = host;
    this.planes = Object.fromEntries(Object.entries(MICRO).map(([k, main]) => {
      const pl = screenPlane(scr, 1.6, 1.0, { uShow: { value: 0 }, uT: { value: 0 }, uP: { value: 0 } }, { header: 'uniform float uP;', main });
      pl.position.set(0, -0.12, -1.0);
      host.screenFrame.add(pl);
      return [k, pl];
    }));
  }

  update(t, time, dt, show, variant = 'avoid') {
    const live = t <= this.length;
    for (const [k, pl] of Object.entries(this.planes)) {
      const u = pl.material.uniforms;
      u.uShow.value = live && k === variant ? show * ramp(t, 0.3, 0.9) * (1 - ramp(t, this.length - 0.7, this.length)) : 0;
      u.uT.value = time;
      u.uP.value = Math.max(0, t - 0.5);
    }
    if (!live) {
      this._prev = -1;
      return null;
    }
    if (variant === 'notes') for (let i = 0; i < 6; i++) if (this.crossed(1.1 + i * 0.45, t)) this.host.emit('micro-tick', { i });
    if (variant === 'avoid' && this.crossed(4.6, t)) this.host.emit('micro-meet');
    if (variant === 'hub' && this.crossed(2.0, t)) this.host.emit('micro-meet');
    if (variant === 'profile') for (let i = 0; i < 5; i++) if (this.crossed(0.5 + i * 0.85, t)) this.host.emit('micro-tick', { i });
    if (variant === 'kitco') for (let i = 0; i < 8; i++) if (this.crossed(0.5 + (0.05 + i * 0.15) / 0.32 + 0.0, t)) this.host.emit('micro-tick', { i });
    this._prev = t;
    return { activity: 0.3, lamp: this.lamp };
  }
}
