import * as THREE from 'three';
import { SCREEN_GLSL, PHOSPHOR_GLSL as PH, CrossingObject, buildCrossingGeometry } from './ProjectsScreen.js';
import { Portal, poseFrom, hermite } from './ProjectsPortal.js';
import { CERAMIC, METAL, DARK, VERMILION, ramp, pulse, portalMap4, screenLabel, screenPlane } from './ProjectsKit.js';

// The projects the console works on. Each brings a physical artifact in the machine's common
// material language (light ceramic, dark metal, one vermilion accent, ~1 unit), a scene for the
// screen's interior, and an authored timeline. TowerLogic exercises the spatial portals; Mosaic the
// screen crossing. Timelines run on a project-local clock `t` handed in by the console.

// =====================================================================================================
// TowerLogic: screenshot → detection → game state → candidate placements scored → one decision.
// A two-lane arena (river, two bridges, three towers a side), abstract tracked pieces, and the analysis
// built over them. No game characters or assets: only the structure the vision system reasons about.
// =====================================================================================================

// the arena's lanes run along its local z, so it crosses the glass lane-first
const ARENA_PARTS = [
  { type: 'rbox', size: [0.78, 0.06, 1.3, 0.015], pos: [0, 0, 0], color: CERAMIC },
  { type: 'box', size: [0.8, 0.026, 0.08], pos: [0, 0.033, 0], color: METAL },
  { type: 'box', size: [0.13, 0.04, 0.13], pos: [0.2, 0.05, 0], color: CERAMIC },
  { type: 'box', size: [0.13, 0.04, 0.13], pos: [-0.2, 0.05, 0], color: CERAMIC },
  { type: 'box', size: [0.016, 0.008, 0.46], pos: [0.2, 0.033, 0.33], color: DARK },
  { type: 'box', size: [0.016, 0.008, 0.46], pos: [-0.2, 0.033, 0.33], color: DARK },
  { type: 'box', size: [0.016, 0.008, 0.46], pos: [0.2, 0.033, -0.33], color: DARK },
  { type: 'box', size: [0.016, 0.008, 0.46], pos: [-0.2, 0.033, -0.33], color: DARK },
  { type: 'cyl', size: [0.05, 0.056, 0.12, 14], pos: [0.2, 0.09, -0.42], color: CERAMIC },
  { type: 'cyl', size: [0.05, 0.056, 0.12, 14], pos: [-0.2, 0.09, -0.42], color: CERAMIC },
  { type: 'rbox', size: [0.13, 0.17, 0.13, 0.012], pos: [0, 0.115, -0.56], color: CERAMIC },
  { type: 'cyl', size: [0.05, 0.056, 0.12, 14], pos: [0.2, 0.09, 0.42], color: METAL },
  { type: 'cyl', size: [0.05, 0.056, 0.12, 14], pos: [-0.2, 0.09, 0.42], color: METAL },
  { type: 'rbox', size: [0.13, 0.17, 0.13, 0.012], pos: [0, 0.115, 0.56], color: METAL },
  // the decision: a vermilion placement marker
  { type: 'cyl', size: [0.0, 0.034, 0.075, 4], pos: [0.2, 0.07, -0.18], color: VERMILION },
  { type: 'node', size: [0.034], pos: [0.2, 0.066, 0.24], color: METAL },
];
const PIECE_PARTS = [
  { type: 'node', size: [0.052], pos: [0, 0, 0], color: DARK },
  { type: 'box', size: [0.05, 0.016, 0.05], pos: [0, 0.048, 0], color: CERAMIC },
];
const PIECE_LANE = new THREE.Vector3(-0.2, 0.085, 0); // the tracked piece's lane, arena space

export class TowerLogicWork {
  constructor(host) {
    this.host = host;
    const { ctx, scr } = host;
    this.name = 'towerlogic';
    this.length = 50;
    this.lamp = 0;
    const arenaGeo = buildCrossingGeometry(ARENA_PARTS, { samples: 1300, seed: 21 });
    this.arena = new CrossingObject(ctx, scr, arenaGeo, { roughness: 0.45, metalness: 0.1, grid: 0.07 });
    const pieceGeo = buildCrossingGeometry(PIECE_PARTS, { samples: 260, seed: 5 });
    // the tracked piece is drawn up to three times: before the entry portal, inside the screen, and
    // out of the exit portal; the portal planes split it so it is only ever whole once
    this.piece = ['in', 'room', 'out'].map(() => new CrossingObject(ctx, scr, pieceGeo, { roughness: 0.4, metalness: 0.3, grid: 0.05, tracker: true }));
    for (const o of [this.arena, ...this.piece]) {
      o.group.matrixAutoUpdate = false;
      host.group.add(o.group);
    }
    this.arenaKeys = this.#arenaKeys(host);

    // the portal pair, attached to the console, and their partners inside the screen
    const m = (x, y, z) => new THREE.Vector3(x, y, z);
    this.A = host.addPortal(new Portal(scr, { rx: 0.3, ry: 0.28 }), m(-1.82, 1.92, 0.62), m(1, 0, 0));
    this.B = host.addPortal(new Portal(scr, { rx: 0.3, ry: 0.28 }), m(2.45, 2.55, 1.4), m(-0.86, -0.39, -0.34));
    this.VA = host.addScreenPortal(new Portal(scr, { rx: 0.3, ry: 0.28, masked: true }), m(-1.35, -0.3, -2.0), m(1, 0, 0));
    this.VB = host.addScreenPortal(new Portal(scr, { rx: 0.3, ry: 0.28, masked: true }), m(1.35, -0.15, -2.4), m(-1, 0, 0));
    this.roomMid = m(0.0, -0.5, -3.7);
    this.#buildScene(host);
    this._m = new THREE.Matrix4();
    this._m2 = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._plane = new THREE.Plane();
    this.focus = new THREE.Vector3();
  }

  #arenaKeys(host) {
    const k = host.key;
    const deck = host.deckPose(new THREE.Vector3(0, 0.03, 0.42), new THREE.Euler(0, Math.PI / 2, 0));
    return [
      k(0, 'screen', [-0.3, 0.25, -7.6], host.qOut),
      k(3.5, 'screen', host.onOut(-1.25), host.qOut),
      k(5.2, 'screen', host.onOut(-0.05), host.qOut),
      k(6.5, 'screen', host.onOut(1.65), host.qOut, { phys: true }),
      // in front of the deck first, then back onto it under the head (never through the frame)
      k(7.6, 'machine', [0, deck.p[1] + 0.22, 1.55], deck.q, { phys: true }),
      k(9.2, 'machine', deck.p, deck.q, { phys: true }),
      k(34, 'machine', deck.p, deck.q, { phys: true }),
      k(35.2, 'machine', [0, deck.p[1] + 0.22, 1.55], deck.q, { phys: true }),
      k(36.3, 'screen', host.onIn(-2.5), host.qIn),
      k(37.0, 'screen', host.onIn(-1.85), host.qIn),
      k(40.5, 'screen', host.onIn(-0.02), host.qIn),
      k(42.5, 'screen', host.onIn(0.06), host.qIn),
      k(45, 'screen', host.onIn(1.9), host.qIn),
      k(47.5, 'screen', [1.0, -0.3, -5.2], host.qIn),
      k(49.5, 'screen', [1.1, -0.35, -7.9], host.qIn, { hideAfter: true }),
      k(50, 'screen', [1.1, -0.35, -7.9], host.qIn),
    ];
  }

  #buildScene(host) {
    const { scr, screenFrame } = host;
    const g = (this.scene = new THREE.Group());
    screenFrame.add(g);
    this.label = screenLabel(scr, 'TOWERLOGIC   detect  ›  state  ›  policy');
    this.label.position.set(-0.85, 0.78, -0.55);
    // the analysed arena: a map laid back like a floor, deep in the screen
    this.map = screenPlane(scr, 2.6, 1.42, { uShow: { value: 0 }, uT: { value: 0 }, uPick: { value: new THREE.Vector2() } }, {
      header: /* glsl */ `
        uniform vec2 uPick;
        vec2 pieceAt(float k, float t) {
          float lane = mod(k, 2.0) < 1.0 ? 0.28 : -0.28;
          return vec2(-0.85 + mod(t * 0.09 + k * 0.53, 1.7), lane + 0.02 * sin(t * 0.7 + k));
        }`,
      main: /* glsl */ `
        // arena, river, bridges, lanes, towers
        col += ${PH} * rectD(m, vec2(0.0), vec2(1.02, 0.52), 0.004) * 0.5;
        col += ${PH} * (lineD(m.x, -0.05, 0.003) + lineD(m.x, 0.05, 0.003)) * 0.32;
        for (int b = 0; b < 2; b++) col += ${PH} * rectD(m, vec2(0.0, b == 0 ? 0.28 : -0.28), vec2(0.1, 0.06), 0.003) * 0.45;
        for (int b = 0; b < 2; b++) col += ${PH} * lineD(m.y, b == 0 ? 0.28 : -0.28, 0.002) * step(0.5, fract(m.x * 8.0)) * 0.12;
        for (int s = 0; s < 2; s++) {
          float sx = s == 0 ? -1.0 : 1.0;
          col += ${PH} * (rectD(m, vec2(sx * 0.72, 0.28), vec2(0.045), 0.003) + rectD(m, vec2(sx * 0.72, -0.28), vec2(0.045), 0.003)) * 0.6;
          col += ${PH} * rectD(m, vec2(sx * 0.9, 0.0), vec2(0.065), 0.004) * 0.7;
        }
        // placement scores over the right half, and the chosen cell
        vec2 cell = floor((m - vec2(0.1, -0.48)) / vec2(0.085, 0.16));
        if (m.x > 0.1 && m.x < 0.95 && abs(m.y) < 0.48) {
          float v = 0.5 + 0.5 * sin(cell.x * 1.3 + uT * 0.4) * cos(cell.y * 1.7 - uT * 0.33);
          col += ${PH} * pow(v, 3.0) * 0.16;
        }
        vec2 pc = vec2(0.1, -0.48) + (uPick + 0.5) * vec2(0.085, 0.16);
        float pickPulse = 0.6 + 0.4 * sin(uT * 4.0);
        col += vec3(1.0, 0.42, 0.26) * rectD(m, pc, vec2(0.0425, 0.08), 0.004) * 1.4 * pickPulse;
        col += vec3(1.0, 0.42, 0.26) * (lineD(m.x, pc.x, 0.0015) * step(abs(m.y - pc.y), 0.2) + lineD(m.y, pc.y, 0.0015) * step(abs(m.x - pc.x), 0.12)) * 0.5;
        // pieces, and detections that converge on them
        for (int i = 0; i < 4; i++) {
          float k = float(i);
          vec2 p = pieceAt(k, uT);
          col += ${PH} * aa(length(m - p) - 0.022) * 0.9;
          float c = smoothstep(0.0, 2.4, mod(uT * 0.8 + k * 1.3, 5.0));
          for (int j = 0; j < 3; j++) {
            vec2 o = (vec2(hash11(k * 7.0 + float(j)), hash11(k * 3.0 + float(j) * 5.0)) - 0.5) * 0.09 * (1.0 - c);
            float w = j == 0 ? 1.0 : 1.0 - c;
            col += ${PH} * rectD(m, p + o, vec2(0.065), 0.0025) * w * (0.35 + 0.5 * c);
          }
          for (int tk = 0; tk < 5; tk++) {
            float on = step(float(tk) + 0.5, c * 5.0);
            col += ${PH} * fillR(m, p + vec2(-0.05 + float(tk) * 0.025, 0.09), vec2(0.007, 0.012)) * on * 0.8;
          }
        }`,
    });
    this.map.position.set(0.1, -0.12, -2.7);
    this.map.rotation.x = -0.62;
    // the game-state vector the policy reads: 26 state values and 4 for the candidate action
    this.strip = screenPlane(scr, 1.7, 0.2, { uShow: { value: 0 }, uT: { value: 0 } }, {
      main: /* glsl */ `
        float i = floor((m.x + 0.85) / 1.7 * 31.0);
        float x0 = -0.85 + (i + 0.5) * 1.7 / 31.0;
        if (i != 26.0 && i >= 0.0 && i < 31.0) {
          float f = fract(uT * 0.7);
          float h = mix(hash11(i + floor(uT * 0.7) * 3.1), hash11(i + floor(uT * 0.7 + 1.0) * 3.1), smoothstep(0.0, 1.0, f));
          float top = -0.09 + 0.17 * (0.15 + 0.85 * h);
          float bar = fillR(m, vec2(x0, (top - 0.09) * 0.5), vec2(0.018, (top + 0.09) * 0.5));
          col += (i > 26.0 ? vec3(1.0, 0.42, 0.26) : ${PH}) * bar * 0.32;
        }
        col += ${PH} * lineD(m.y, -0.092, 0.0015) * 0.4;`,
    });
    this.strip.position.set(-0.18, -0.68, -1.25);
    g.add(this.label, this.map, this.strip);
    this.pickTimer = 0;
  }

  /** Sets everything for project time `t`; returns what the console should attend to. */
  update(t, time, dt, show) {
    const h = this.host;
    for (const m of [this.label, this.map, this.strip]) m.material.uniforms.uShow.value = show;
    this.map.material.uniforms.uT.value = time;
    this.strip.material.uniforms.uT.value = time;
    // a new decision every few seconds
    if (Math.floor(time / 3.2) !== this.pickTimer) {
      this.pickTimer = Math.floor(time / 3.2);
      const r = Math.sin(this.pickTimer * 12.9898) * 43758.5453;
      this.map.material.uniforms.uPick.value.set(Math.floor((r - Math.floor(r)) * 10), Math.floor(((r * 7.1) % 1 + 1) % 1 * 6));
    }
    if (t > this.length) {
      for (const o of [this.arena, ...this.piece]) o.group.visible = false;
      for (const p of [this.A, this.B, this.VA, this.VB]) p.set(0, 0);
      this._prevT = -1;
      return null;
    }

    // a fresh appearance: its first frame only places things and shows nothing (the arena starts
    // 7.6 deep in the screen, at the far end of its fade, so nothing visible is lost)
    if ((this._prevT ?? -1) < 0) {
      h.follow(this.arena, this.arenaKeys, t, time);
      for (const o of [this.arena, ...this.piece]) o.group.visible = false;
      this._prevT = t;
      return null;
    }
    // the arena
    const arenaOn = h.follow(this.arena, this.arenaKeys, t, time);
    let focus = null;
    if (t < 8.5 || (t > 34 && t < 45)) focus = this.arena.group.position;

    // the portal pair
    const pt = time;
    const oA = pulse(t, 22.4, 23.3, 24.4, 25.0), oB = pulse(t, 25.3, 26.1, 26.9, 27.5);
    this.A.set(oA, pt);
    this.VA.set(oA, pt);
    this.B.set(oB, pt);
    this.VB.set(oB, pt);

    // the tracked piece
    this.#piece(t, time, arenaOn);
    if (t > 20 && t < 29) focus = this.focus;
    const prev = this._prevT ?? -1, at = (x) => prev < x && t >= x;
    if (at(21.3) || at(26.9)) h.emit('tower-lock');
    if (at(24.0) || at(26.4)) h.emit('transit');
    if (at(27.6)) h.emit('land', { k: 0.4 });
    if (at(8.2)) h.emit('land', { k: 0.8 });
    if (at(22.4)) h.pulseCable(1);
    this._prevT = t;
    const portal = t > 21.5 && t < 28;
    return { focus, event: portal ? this.focus : null, activity: portal ? 1 : (t > 1 && t < 7) || (t > 37 && t < 44) ? 0.6 : 0.3, crossing: (t > 1 && t < 7) || (t > 37 && t < 44), lamp: this.lamp };
  }

  /** The piece resting on its lane, in the arena's frame, drawn by instance `o`. */
  #onArena(o, time) {
    const lane = this._p.copy(PIECE_LANE);
    lane.z = 0.22 + 0.13 * Math.sin(time * 0.55);
    o.group.matrix.copy(this.arena.group.matrix).multiply(this._m.makeTranslation(lane.x, lane.y, lane.z));
    o.group.visible = this.arena.group.visible;
    // forced: a group that was hidden does not refresh its world matrix on request
    o.group.matrixWorldNeedsUpdate = true;
    o.group.updateMatrixWorld(true);
    o.update(this.host.scr.uScrInv.value);
    o.uniforms.uPhys.value = this.arena.uniforms.uPhys.value;
    o.clip(0, null);
    o.clip(1, null);
  }

  #piece(t, time, arenaOn) {
    const h = this.host;
    const [pin, proom, pout] = this.piece;
    const V = 1.7; // travel speed through the portals
    const uA = 24.0, uB = 26.4;
    // detection: lock, lose confidence in transit, re-acquire
    const track = pulse(t, 20.0, 21.0, 28.6, 29.6);
    const conf = ramp(t, 21.0, 22.2) * (1 - 0.7 * pulse(t, 23.8, 24.2, 26.5, 27.3)) * (t > 24 && t < 26.6 ? 0.75 + 0.25 * Math.sign(Math.sin(time * 18)) : 1);
    for (const o of this.piece) {
      o.uniforms.uTrack.value = track;
      o.uniforms.uConf.value = conf;
    }
    const st = (portal) => h.portalFrame(portal, new THREE.Matrix4());
    const A = st(this.A), B = st(this.B), VA = st(this.VA), VB = st(this.VB);
    const col = (M, i) => new THREE.Vector3().setFromMatrixColumn(M, i);
    const nA = col(A, 2).normalize(), nB = col(B, 2).normalize(), nVA = col(VA, 2).normalize(), nVB = col(VB, 2).normalize();
    const cA = col(A, 3), cB = col(B, 3), cVA = col(VA, 3), cVB = col(VB, 3);

    // where the piece is before it runs: on its lane, riding the arena
    if (t < 21.5 || t >= 29) {
      this.#onArena(t < 21.5 ? pin : pout, time);
      (t < 21.5 ? pout : pin).group.visible = false;
      proom.group.visible = false;
      if (t >= 29 && !arenaOn) pout.group.visible = false;
      return;
    }
    // start: its lane position at the moment it breaks into a run
    const start = new THREE.Vector3(PIECE_LANE.x, PIECE_LANE.y, 0.22 + 0.13 * Math.sin(21.5 * 0.55)).applyMatrix4(this.arena.group.matrix);
    const laneDir = new THREE.Vector3(0, 0, -1).transformDirection(this.arena.group.matrix);
    const land = new THREE.Vector3(PIECE_LANE.x, PIECE_LANE.y, 0.52).applyMatrix4(this.arena.group.matrix);

    // pose along the whole run in its own frame: world (before A), room (between VA and VB), world (after B)
    const P = new THREE.Vector3(), Vv = new THREE.Vector3();
    const worldIn = (u, out) => {
      if (u <= uA) hermite(start, laneDir.clone().multiplyScalar(0.5), cA, nA.clone().multiplyScalar(-V), uA - 21.5, (u - 21.5) / (uA - 21.5), P, Vv);
      else P.copy(cA).addScaledVector(nA, -V * (u - uA)), Vv.copy(nA).multiplyScalar(-V);
      return poseFrom(P, Vv, out);
    };
    const roomMid = this.roomMid.clone().applyMatrix4(h.screenToStation);
    const midV = new THREE.Vector3(V, 0, 0).transformDirection(h.screenToStation).multiplyScalar(V);
    const tm = (uA + uB) / 2;
    const room = (u, out) => {
      if (u < uA) return out.copy(portalMap4(VA, A)).multiply(worldIn(u, new THREE.Matrix4()));
      if (u <= tm) hermite(cVA, nVA.clone().multiplyScalar(V), roomMid, midV, tm - uA, (u - uA) / (tm - uA), P, Vv);
      else if (u <= uB) hermite(roomMid, midV, cVB, nVB.clone().multiplyScalar(-V), uB - tm, (u - tm) / (uB - tm), P, Vv);
      else P.copy(cVB).addScaledVector(nVB, -V * (u - uB)), Vv.copy(nVB).multiplyScalar(-V);
      return poseFrom(P, Vv, out);
    };
    const worldOut = (u, out) => {
      if (u < uB) return out.copy(portalMap4(B, VB)).multiply(room(u, new THREE.Matrix4()));
      const uL = uB + 1.25;
      if (u <= uL) hermite(cB, nB.clone().multiplyScalar(V), land, new THREE.Vector3(0, -1.1, 0).addScaledVector(laneDir, 0.4), uL - uB, (u - uB) / (uL - uB), P, Vv);
      else {
        // landed: it settles back onto its lane and walks to where it belongs
        const rest = new THREE.Vector3(PIECE_LANE.x, PIECE_LANE.y, 0.22 + 0.13 * Math.sin(time * 0.55)).applyMatrix4(this.arena.group.matrix);
        P.lerpVectors(land, rest, ramp(u, uL, 29));
        Vv.copy(laneDir).multiplyScalar(0.001);
      }
      return poseFrom(P, Vv, out, new THREE.Vector3(0, 1, 0));
    };

    const margin = 0.35;
    pin.group.visible = t <= uA + margin;
    proom.group.visible = t >= uA - margin && t <= uB + margin;
    pout.group.visible = t >= uB - margin;
    if (pin.group.visible) worldIn(t, pin.group.matrix);
    if (proom.group.visible) room(t, proom.group.matrix);
    if (pout.group.visible) worldOut(t, pout.group.matrix);
    pin.uniforms.uPhys.value = 1;
    pout.uniforms.uPhys.value = 1;
    proom.uniforms.uPhys.value = 0;
    for (const o of this.piece) if (o.group.visible) o.update(h.scr.uScrInv.value);
    pin.clip(0, this.A.plane(this._plane));
    pin.clip(1, null);
    proom.clip(0, this.VA.plane(this._plane));
    proom.clip(1, this.VB.plane(this._plane));
    pout.clip(0, t < uB + 0.6 ? this.B.plane(this._plane) : null);
    pout.clip(1, null);
    // the console watches the piece wherever it is
    const shown = t < uA ? pin : t < uB ? proom : pout;
    this.focus.setFromMatrixPosition(shown.group.matrix);
  }
}

// =====================================================================================================
// Mosaic: visual discovery and collection. Pins are found, collected and arranged: scattered tiles
// arrive through a portal (discovery), cross into the machine (collect), Tidy into a masonry wall with
// alignment guides and Shuffle (arrange), and a finished 2×2 collection comes back out. One last tile
// is repinned from the wall into the collection, its provenance threaded back to where it came from.
// =====================================================================================================

const TILE_COLORS = ['#7f93c9', '#c9a46a', '#8fae94', '#c98d86', '#9da7ff', '#d9d2c7', '#857f77'];
// the wall in the screen is quieter than the physical pins: muted, with Mosaic's lavender kept for a few
const WALL_COLORS = ['#8b909b', '#a39b88', '#8e998f', '#a19290', '#b2ada3', '#7f7a73'];
const LAVENDER = new Set([4, 13, 22]);
const PIN_PARTS = [
  { type: 'rbox', size: [0.2, 0.022, 0.28, 0.008], pos: [-0.12, 0.08, 0.5], rot: [0.4, 0.3, 0.2], color: TILE_COLORS[0] },
  { type: 'rbox', size: [0.26, 0.022, 0.17, 0.008], pos: [0.2, -0.07, 0.22], rot: [-0.5, 0.8, 0.1], color: TILE_COLORS[1] },
  { type: 'rbox', size: [0.2, 0.022, 0.2, 0.008], pos: [-0.22, -0.13, -0.06], rot: [1.1, 0.2, -0.4], color: TILE_COLORS[2] },
  { type: 'rbox', size: [0.16, 0.022, 0.25, 0.008], pos: [0.16, 0.16, -0.32], rot: [0.2, -0.6, 0.9], color: TILE_COLORS[3] },
  { type: 'rbox', size: [0.24, 0.022, 0.16, 0.008], pos: [-0.05, 0.02, -0.62], rot: [-0.8, 0.4, 0.3], color: TILE_COLORS[4] },
  { type: 'rbox', size: [0.18, 0.022, 0.18, 0.008], pos: [0.26, 0.04, 0.68], rot: [0.6, 1.2, -0.2], color: TILE_COLORS[5] },
  { type: 'rbox', size: [0.22, 0.022, 0.3, 0.008], pos: [-0.28, 0.22, 0.15], rot: [-0.3, -0.2, 1.3], color: TILE_COLORS[6] },
];
// a collection: four tiles on a ceramic plate (2×2, after Mosaic's mark); the fourth slot arrives last
const BOARD_PARTS = [
  { type: 'rbox', size: [0.68, 0.04, 0.68, 0.014], pos: [0, 0, 0], color: CERAMIC },
  { type: 'rbox', size: [0.27, 0.03, 0.27, 0.01], pos: [-0.155, 0.033, -0.155], color: TILE_COLORS[0] },
  { type: 'rbox', size: [0.27, 0.03, 0.27, 0.01], pos: [0.155, 0.033, -0.155], color: TILE_COLORS[5] },
  { type: 'rbox', size: [0.27, 0.03, 0.27, 0.01], pos: [-0.155, 0.033, 0.155], color: TILE_COLORS[2] },
  { type: 'box', size: [0.28, 0.006, 0.28], pos: [0.155, 0.022, 0.155], color: METAL },
  { type: 'box', size: [0.6, 0.016, 0.018], pos: [0, 0.028, -0.322], color: METAL },
  { type: 'box', size: [0.46, 0.26, 0.035], pos: [0, -0.15, -0.2], rot: [-0.95, 0, 0], color: METAL },
];
const LAST_PARTS = [{ type: 'rbox', size: [0.27, 0.03, 0.27, 0.01], pos: [0, 0, 0], color: VERMILION }];
const LAST_SLOT = new THREE.Vector3(0.155, 0.033, 0.155); // board space
const COLUMN_X = [-1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2];
const COLUMN_SHUFFLE = [3, 5, 0, 6, 1, 2, 4]; // where each main-wall column moves in a Shuffle
// the alternate cycle: a different permutation, the wave running the other way, deeper lifts
const COLUMN_SHUFFLE_B = [6, 4, 5, 1, 0, 3, 2];

export class MosaicWork {
  constructor(host) {
    this.host = host;
    const { ctx, scr } = host;
    this.name = 'mosaic';
    this.length = 54;
    this.lamp = 1;
    this.pins = new CrossingObject(ctx, scr, buildCrossingGeometry(PIN_PARTS, { samples: 1100, seed: 31 }), { roughness: 0.3, metalness: 0.05, grid: 0.06 });
    this.board = new CrossingObject(ctx, scr, buildCrossingGeometry(BOARD_PARTS, { samples: 1000, seed: 33 }), { roughness: 0.32, metalness: 0.05, grid: 0.06 });
    this.last = new CrossingObject(ctx, scr, buildCrossingGeometry(LAST_PARTS, { samples: 220, seed: 35 }), { roughness: 0.25, metalness: 0.0, grid: 0.05 });
    for (const o of [this.pins, this.board, this.last]) {
      o.group.matrixAutoUpdate = false;
      host.group.add(o.group);
    }
    const m = (x, y, z) => new THREE.Vector3(x, y, z);
    // discovery arrives through a portal up and to the left of the head
    const waitS = m(-2.9, -0.45, 2.35);
    const pS = m(-3.75, -0.2, 2.1);
    this.P = host.addPortal(new Portal(scr, { rx: 0.34, ry: 0.3 }), host.screenToMachine(pS), host.screenDirToMachine(waitS.clone().sub(pS)));
    // the repin portal opens under the head's right overhang, facing the collection on the deck
    this.C = host.addPortal(new Portal(scr, { rx: 0.22, ry: 0.22 }), m(1.55, 2.32, 1.15), m(-0.85, -0.35, -0.4));
    this.VC = host.addScreenPortal(new Portal(scr, { rx: 0.22, ry: 0.22, masked: true }), m(1.35, 0.05, -2.3), m(-1, 0, 0));
    this.pinKeys = this.#pinKeys(host, waitS);
    this.boardKeys = this.#boardKeys(host);
    this.#buildScene(host);
    this.#buildThread(host);
    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._plane = new THREE.Plane();
    this.focus = new THREE.Vector3();
  }

  #pinKeys(host, waitS) {
    const k = host.key;
    return [
      k(0, this.P.group, [0, 0, -0.75], 'spin', { hideAfter: true }),
      k(3.0, this.P.group, [0, 0, -0.75], 'spin'),
      k(6.2, 'screen', waitS.toArray(), 'spin'),
      k(8, 'screen', waitS.toArray(), 'spin'),
      k(11, 'screen', host.onIn(-1.55), host.qIn),
      k(15, 'screen', host.onIn(-0.02), host.qIn),
      k(17, 'screen', host.onIn(0.06), host.qIn),
      k(19.5, 'screen', host.onIn(1.9), host.qIn),
      k(21.5, 'screen', [1.0, -0.3, -5.2], host.qIn),
      k(23.5, 'screen', [1.1, -0.35, -7.9], host.qIn, { hideAfter: true }),
      k(54, 'screen', [1.1, -0.35, -7.9], host.qIn),
    ];
  }

  #boardKeys(host) {
    const k = host.key;
    this.deck = host.deckPose(new THREE.Vector3(0.05, 0.415, 0.42), new THREE.Euler(0.9, 0, 0));
    return [
      k(26, 'screen', [-0.6, 0.35, -7.8], host.qOut),
      k(29.5, 'screen', host.onOut(-1.1), host.qOut),
      k(31.2, 'screen', host.onOut(-0.05), host.qOut),
      k(32.4, 'screen', host.onOut(1.3), host.qOut, { phys: true }),
      k(33.4, 'machine', [0.05, this.deck.p[1] + 0.12, 1.55], this.deck.q, { phys: true }),
      k(34.8, 'machine', this.deck.p, this.deck.q, { phys: true }),
      k(46, 'machine', this.deck.p, this.deck.q, { phys: true }),
      k(46.9, 'machine', [0.05, this.deck.p[1] + 0.12, 1.55], this.deck.q, { phys: true }),
      k(47.8, 'screen', host.onIn(-2.4), host.qIn),
      k(48.6, 'screen', host.onIn(-1.55), host.qIn),
      k(50.5, 'screen', host.onIn(0.4), host.qIn),
      k(52.5, 'screen', [1.0, -0.3, -5.2], host.qIn),
      k(53.8, 'screen', [1.1, -0.35, -7.9], host.qIn, { hideAfter: true }),
      k(54, 'screen', [1.1, -0.35, -7.9], host.qIn),
    ];
  }

  #buildScene(host) {
    const { scr, screenFrame } = host;
    const g = (this.scene = new THREE.Group());
    screenFrame.add(g);
    this.label = screenLabel(scr, 'MOSAIC   discover  ›  collect  ›  arrange');
    this.label.position.set(-0.85, 0.78, -0.55);
    g.add(this.label);

    // the wall: masonry columns on three depths; each tile also has a scattered position
    const rnd = (i) => { const r = Math.sin(i * 91.17 + 3.1) * 43758.5453; return r - Math.floor(r); };
    const tiles = [];
    const addColumn = (x, z, top, n, wScale, seed) => {
      let y = top;
      for (let j = 0; j < n; j++) {
        const i = tiles.length;
        const aspect = [1.35, 0.75, 1.0, 1.55, 0.85][(seed + j * 3) % 5];
        const w = 0.34 * wScale, hgt = w * aspect;
        tiles.push({ slot: new THREE.Vector3(x, y - hgt / 2, z), w, h: hgt, col: new THREE.Color(LAVENDER.has(i) ? TILE_COLORS[4] : WALL_COLORS[(seed + j * 2) % WALL_COLORS.length]),
          scatter: new THREE.Vector3((rnd(i) - 0.5) * 4.2, (rnd(i + 50) - 0.5) * 2.2, -1.6 - rnd(i + 99) * 5.0) });
        y -= hgt + 0.05;
      }
    };
    COLUMN_X.forEach((x, c) => addColumn(x, -2.9, 0.92 - (c % 3) * 0.12, 4, 1, c * 2));
    [-1.55, 1.55].forEach((x, c) => addColumn(x, -1.7, 0.55 - c * 0.25, 1, 0.75, 7 + c));
    [-1.8, -0.9, 0.0, 0.9, 1.8].forEach((x, c) => addColumn(x, -4.8, 1.5, 3, 1.6, 11 + c));
    this.tiles = tiles;
    // the tile that will be repinned: one on the main wall, the size of the collection's slot
    // (screen space is the head's, scaled 1.12)
    this.sel = 9;
    tiles[this.sel].w = tiles[this.sel].h = 0.27 / 1.12;
    const n = tiles.length;
    const plane = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry().copy(plane);
    geo.instanceCount = n;
    const col = new Float32Array(n * 3), size = new Float32Array(n * 2), sel = new Float32Array(n);
    tiles.forEach((tl, i) => {
      tl.col.toArray(col, i * 3);
      size.set([tl.w, tl.h], i * 2);
      sel[i] = i === this.sel ? 1 : 0;
    });
    geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 2));
    geo.setAttribute('aSel', new THREE.InstancedBufferAttribute(sel, 1));
    // how present each tile is: only a few stand out while scattered; all of them once tidied
    this.vis = new THREE.InstancedBufferAttribute(new Float32Array(n).fill(1), 1);
    this.vis.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aVis', this.vis);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...scr, uShow: { value: 0 }, uHi: { value: 0 }, uSelClip: { value: new THREE.Vector4(0, 0, 0, 1) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec3 aCol; attribute vec2 aSize; attribute float aSel; attribute float aVis;
        varying vec3 vW; varying vec2 vP; varying vec3 vCol; varying vec2 vSize; varying float vSel; varying float vVis;
        void main() {
          vVis = aVis;
          vec3 p = vec3(position.xy * aSize, 0.0);
          vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
          vW = w.xyz; vP = position.xy * aSize; vCol = aCol; vSize = aSize; vSel = aSel;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        ${SCREEN_GLSL}
        uniform float uShow; uniform float uHi; uniform vec4 uSelClip;
        varying vec3 vW; varying vec2 vP; varying vec3 vCol; varying vec2 vSize; varying float vSel; varying float vVis;
        void main() {
          if (vVis < 0.01) discard;
          if (vSel > 0.5 && dot(uSelClip.xyz, vW) + uSelClip.w < 0.0) discard;
          float fd; if (uShow < 0.01 || !scrSee(vW, fd)) discard; gl_FragDepth = fd;
          float r = 0.025;
          vec2 q = abs(vP) - (vSize * 0.5 - r);
          float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
          float px = fwidth(d);
          if (d > px) discard;
          float edge = 1.0 - smoothstep(0.0, px * 1.5, abs(d + 0.006) - 0.004);
          float fill = 1.0 - smoothstep(-px, px, d);
          vec3 c = (vCol * vCol * fill * 0.1 + ${PH} * edge * 0.28) * vVis;
          c += vec3(1.0, 0.42, 0.26) * edge * vSel * uHi * 1.6;
          float s = scrS(vW);
          gl_FragColor = vec4(c * uShow * exp(-s * 0.1), 1.0);
        }`,
    });
    this.wall = new THREE.InstancedMesh(geo, mat, n);
    this.wall.frustumCulled = false;
    this.wall.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    g.add(this.wall);
    // alignment guides on the main wall while tiles snap into their columns
    this.guides = screenPlane(scr, 3.0, 2.1, { uShow: { value: 0 }, uT: { value: 0 } }, {
      main: /* glsl */ `
        for (int c = 0; c < 7; c++) {
          float x = -1.2 + float(c) * 0.4;
          col += ${PH} * (lineD(m.x, x - 0.17, 0.0012) + lineD(m.x, x + 0.17, 0.0012)) * 0.22 * step(0.5, fract(m.y * 14.0));
        }
        col += vec3(1.0, 0.42, 0.26) * lineD(m.y, 0.92, 0.0015) * 0.25;`,
    });
    this.guides.position.set(0, 0, -2.92);
    g.add(this.guides);
    this.cVC = new THREE.Vector3();
  }

  #buildThread(host) {
    // provenance: a thin line from the repinned tile back through the portal to the slot it left
    const mk = (masked) => {
      const n = 40;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const mat = new THREE.ShaderMaterial({
        uniforms: { ...this.host.scr, uA: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        defines: masked ? { MASKED: 1 } : {},
        vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: /* glsl */ `
          ${SCREEN_GLSL}
          uniform float uA; varying vec3 vW;
          void main() {
            float fd = gl_FragCoord.z;
            #ifdef MASKED
              if (!scrSee(vW, fd)) discard;
            #endif
            gl_FragDepth = fd;
            gl_FragColor = vec4(mix(vec3(1.0, 0.42, 0.26), ${PH}, 0.35) * uA * 1.4, 1.0);
          }`,
      });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.visible = false;
      return line;
    };
    this.threadWorld = mk(false);
    this.threadRoom = mk(true);
    this.host.group.add(this.threadWorld);
    this.scene.add(this.threadRoom);
  }

  /** The repinned tile, screen space: pulled from its slot, through the portal at speed. */
  #pulled(t) {
    const tl = this.tiles[this.sel];
    const v = new THREE.Vector3(0.9, 0, 0);
    const P = new THREE.Vector3();
    if (t <= 37.2) hermite(tl.slot, new THREE.Vector3(), this.cVC, v, 2.2, Math.max(0, (t - 35) / 2.2), P);
    else P.copy(this.cVC).addScaledVector(v, t - 37.2);
    return P;
  }

  /** Layout of the wall at time `t`: scattered → Tidy into masonry → a Shuffle wave → settled. */
  #layout(t, time) {
    const m = this._m, q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const n = this.tiles.length;
    for (let i = 0; i < n; i++) {
      const tl = this.tiles[i];
      // Tidy: each tile snaps in turn, left to right, lifting forward a little on the way so no two
      // tiles ever share a plane while moving
      const k0 = 19 + (tl.slot.x + 1.8) * 0.9 + (i % 4) * 0.25;
      const tidy = ramp(t, k0, k0 + 1.6);
      // across first, then back into the wall: a tile is over its own slot before it reaches the
      // wall's plane, so it never slides across a neighbour that is already in place
      const across = ramp(tidy, 0, 0.75);
      p.set(
        THREE.MathUtils.lerp(tl.scatter.x, tl.slot.x, across),
        THREE.MathUtils.lerp(tl.scatter.y, tl.slot.y, across),
        THREE.MathUtils.lerp(tl.scatter.z, tl.slot.z, tidy) + Math.sin(tidy * Math.PI) * (0.3 + i * 0.023),
      );
      // drifting while scattered
      p.x += (1 - tidy) * Math.sin(time * 0.3 + i) * 0.08;
      p.y += (1 - tidy) * Math.cos(time * 0.25 + i * 1.7) * 0.06;
      // Shuffle: the main wall's columns trade places in a wave, each column at its own depth, so
      // tiles never pass through one another and every tile keeps its column's width
      if (i < 28) {
        const c = Math.floor(i / 4);
        const alt = this.variant === 'rows';
        const cDst = (alt ? COLUMN_SHUFFLE_B : COLUMN_SHUFFLE)[c];
        const w0 = 25 + (alt ? 6 - c : c) * 0.12; // every column has left its slot before any column lands
        const sh = ramp(t, w0, w0 + 1.3) * (1 - ramp(t, 32.5 + c * 0.2, 34.2 + c * 0.2));
        p.x += (COLUMN_X[cDst] - COLUMN_X[c]) * ramp(sh, 0.18, 0.82);
        // each column rises to its own depth, moves across only once it is there, then settles
        p.z += ramp(sh, 0, 0.18) * (1 - ramp(sh, 0.82, 1)) * (0.25 + (alt ? 6 - c : c) * 0.16);
      }
      // the repinned tile is pulled forward, toward its portal
      if (i === this.sel && t > 35) p.copy(this.#pulled(t));
      m.compose(p, q, s);
      this.wall.setMatrixAt(i, m);
      this.vis.setX(i, (i % 3 === 0 ? 0.85 : 0.12) * (1 - tidy) + tidy * (tl.slot.z < -4 ? 0.5 : 1));
    }
    this.wall.instanceMatrix.needsUpdate = true;
    this.vis.needsUpdate = true;
  }

  update(t, time, dt, show, variant) {
    this.variant = variant;
    const h = this.host;
    for (const mm of [this.label]) mm.material.uniforms.uShow.value = show;
    this.wall.material.uniforms.uShow.value = show;
    this.guides.material.uniforms.uShow.value = show * pulse(t, 19.5, 21, 25, 27);
    this.wall.material.uniforms.uHi.value = pulse(t, 34, 34.6, 37.6, 38.2);
    if (t > this.length) {
      for (const o of [this.pins, this.board, this.last]) o.group.visible = false;
      for (const p of [this.P, this.C, this.VC]) p.set(0, 0);
      this.threadWorld.visible = this.threadRoom.visible = false;
      this._prevT = -1;
      return null;
    }
    this.VC.group.updateWorldMatrix(true, false);
    this.cVC.copy(this.VC.group.position);
    this.#layout(t, time);

    // discovery: the scattered pins come through a portal
    this.P.set(pulse(t, 3.0, 3.9, 6.4, 7.2), time); // not before 3 s: the start of a work is screen-only
    h.follow(this.pins, this.pinKeys, t, time);
    this.pins.clip(0, t < 6.0 ? this.P.plane(this._plane) : null);

    // the collection
    const boardOn = h.follow(this.board, this.boardKeys, t, time);

    // the repin: a wall tile leaves through a portal and completes the collection
    this.#repin(t, time, boardOn);

    let focus = null;
    if (t < 15) focus = this.pins.group.position;
    else if (t > 26 && t < 35) focus = this.board.group.position;
    else if (t > 36 && t < 41) focus = this.focus;
    const prev = this._prevT ?? -1, at = (x) => prev < x && t >= x;
    for (let c = 0; c < 7; c++) if (at(20.6 + c * 0.36 * 2.5)) h.emit('snap');
    if (at(25.2) || at(32.6)) h.emit('shuffle');
    if (at(37.2)) h.emit('transit');
    if (at(40.4)) h.emit('land', { k: 0.5 });
    if (at(34.6)) h.emit('land', { k: 0.7 });
    if (at(3.2) || at(36.3)) h.pulseCable(1);
    this._prevT = t;
    const busy = (t > 19 && t < 28) || (t > 34 && t < 41);
    return { focus, event: t > 36 && t < 41 ? this.focus : null, activity: t > 36 && t < 41 ? 0.95 : busy ? 0.6 : 0.3, crossing: (t > 11 && t < 19) || (t > 28 && t < 33) || t > 47, tint: TILE_COLORS[4], lamp: this.lamp };
  }

  #repin(t, time, boardOn) {
    const h = this.host;
    const o = this.last;
    const oC = pulse(t, 36.0, 36.9, 38.4, 39.1);
    this.C.set(oC, time);
    this.VC.set(oC, time);
    const VCm = h.portalFrame(this.VC, new THREE.Matrix4());
    const Cm = h.portalFrame(this.C, new THREE.Matrix4());
    const slotM = new THREE.Matrix4().copy(this.board.group.matrix).multiply(new THREE.Matrix4().makeTranslation(LAST_SLOT.x, LAST_SLOT.y, LAST_SLOT.z));
    const wallM = new THREE.Matrix4();
    this.wall.getMatrixAt(this.sel, wallM);
    // the tile's current place on the wall, in the station's frame (it faces the viewer: a quad in xy)
    const tileRoom = new THREE.Matrix4().multiplyMatrices(h.screenToStation, wallM).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    {
      const tp = new THREE.Vector3(), tq = new THREE.Quaternion(), ts = new THREE.Vector3();
      tileRoom.decompose(tp, tq, ts);
      tileRoom.compose(tp, tq, ts.set(1, 1, 1));
    }
    const uIn = 37.2; // the moment the tile reaches the portal inside the screen
    const VCplaneW = this.VC.plane(this._plane);
    this.wall.material.uniforms.uSelClip.value.set(VCplaneW.normal.x, VCplaneW.normal.y, VCplaneW.normal.z, VCplaneW.constant);
    if (t < uIn - 0.3 || (!boardOn && t > 40)) {
      // not yet repinned (or the collection has gone back in with it)
      if (t > 40 && boardOn) this.#onBoard(o, slotM);
      else o.group.visible = false;
      this.#thread(0);
      return;
    }
    if (t >= 40.4) {
      this.#onBoard(o, slotM);
      this.#thread(1 - ramp(t, 40.4, 42.2), slotM, Cm);
      return;
    }
    // through the portal: the wall tile, carried from the screen's portal to the world's
    const pS = new THREE.Vector3(), vS = new THREE.Vector3();
    const map = portalMap4(Cm, VCm);
    // the tile's pose in the room at any moment (its wall pose, without the head's scale), carried out
    const roomAt = (w) => new THREE.Matrix4().compose(this.#pulled(w).applyMatrix4(h.screenToStation), new THREE.Quaternion().setFromRotationMatrix(tileRoom), new THREE.Vector3(1, 1, 1));
    const u0 = uIn + 0.25;
    if (t < u0) {
      o.group.matrix.copy(map).multiply(roomAt(t));
    } else {
      const uL = uIn + 1.8;
      const land = new THREE.Vector3().setFromMatrixPosition(slotM);
      const landQ = new THREE.Quaternion().setFromRotationMatrix(slotM);
      if (t < uL) {
        const p0 = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(map).multiply(roomAt(u0)));
        const p1 = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(map).multiply(roomAt(u0 + 0.01)));
        const v0 = p1.sub(p0).multiplyScalar(100);
        hermite(p0, v0, land.clone().add(new THREE.Vector3(0, 0.08, 0.05)), new THREE.Vector3(0, -0.35, 0), uL - u0, (t - u0) / (uL - u0), pS, vS);
        const k = ramp(t, u0, uL);
        const q0 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().copy(map).multiply(roomAt(u0)));
        o.group.matrix.compose(pS, q0.slerp(landQ, k), new THREE.Vector3(1, 1, 1));
      } else {
        const k = ramp(t, uL, 40.4);
        pS.copy(land).add(new THREE.Vector3(0, 0.08, 0.05).multiplyScalar(1 - k));
        o.group.matrix.compose(pS, landQ, new THREE.Vector3(1, 1, 1));
      }
    }
    o.group.visible = true;
    o.uniforms.uPhys.value = 1;
    o.clip(0, t < uIn + 0.6 ? this.C.plane(this._plane) : null);
    this.focus.setFromMatrixPosition(o.group.matrix);
    this.#thread(1, o.group.matrix, Cm, tileRoom);
  }

  #onBoard(o, slotM) {
    o.group.matrix.copy(slotM);
    o.group.visible = this.board.group.visible;
    o.uniforms.uPhys.value = this.board.uniforms.uPhys.value;
    o.clip(0, null);
  }

  /** The provenance thread: tile → world portal, and screen portal → the slot it left. */
  #thread(a, tileM, Cm) {
    const on = a > 0.002;
    this.threadWorld.visible = this.threadRoom.visible = on;
    if (!on) return;
    const h = this.host;
    const tile = new THREE.Vector3().setFromMatrixPosition(tileM);
    const cC = new THREE.Vector3().setFromMatrixPosition(Cm);
    const slot = this.tiles[this.sel].slot.clone(); // screen space
    const vc = this.cVC.clone();
    // retracting: the far (origin) end runs back toward the tile
    const fill = (line, from, to, bend, k) => {
      const pos = line.geometry.attributes.position;
      const n = pos.count;
      for (let i = 0; i < n; i++) {
        const u = (i / (n - 1)) * k;
        const p = new THREE.Vector3().lerpVectors(from, to, u);
        p.y += Math.sin(u * Math.PI) * bend;
        pos.setXYZ(i, p.x, p.y, p.z);
      }
      pos.needsUpdate = true;
    };
    const kWorld = THREE.MathUtils.clamp(a * 2, 0, 1);
    const kRoom = THREE.MathUtils.clamp(a * 2 - 1, 0, 1);
    fill(this.threadWorld, tile, cC, 0.06, kWorld);
    fill(this.threadRoom, vc, slot, 0.12, kRoom);
    this.threadWorld.material.uniforms.uA.value = Math.min(1, a * 3);
    this.threadRoom.material.uniforms.uA.value = Math.min(1, a * 3);
    this.threadRoom.visible = kRoom > 0.01;
    void h;
  }
}
