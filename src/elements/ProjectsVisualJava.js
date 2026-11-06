import * as THREE from 'three';
import { PHOSPHOR_GLSL as PH, CrossingObject, buildCrossingGeometry } from './ProjectsScreen.js';
import { Portal, hermite } from './ProjectsPortal.js';
import { CERAMIC, DARK, VERMILION, HOT, ramp, pulse, portalMap4, screenLabel, screenPlane, lineMaterial, boxEdges, Thread } from './ProjectsKit.js';

// Visual Java (GGJavaEZ): a Java IDE whose real program execution builds a navigable 3D runtime world:
// stack frames and heap objects as geometry, references between them, finished calls greying out in
// place, and a recorded trace you can scrub back through.
//
// Here the screen runs such a program: frames push onto a stack, objects appear on the heap, references
// link them, a timeline playhead advances. One heap object steps out of the screen through a portal
// and hangs beside the machine, its reference still threaded through the portal back to the frame
// that holds it, while the program keeps running and mutating it. Then it goes home. In the rare
// variant the trace rewinds: everything, physical and digital, runs backwards for a while.

const HEAP_PARTS = [
  { type: 'rbox', size: [0.44, 0.3, 0.3, 0.02], pos: [0, 0, 0], color: CERAMIC },
  { type: 'box', size: [0.452, 0.07, 0.312], pos: [0, 0.12, 0], color: DARK },
  { type: 'box', size: [0.3, 0.035, 0.312], pos: [0.0, -0.02, 0], color: VERMILION },
  { type: 'box', size: [0.3, 0.035, 0.312], pos: [0.0, -0.09, 0], color: '#9a958c' },
];
// the program: frames (stack, screen space) and heap objects; times are on the program clock
const FRAMES = [
  { name: 'main()', at: 0.6, done: 27.5 },
  { name: 'build()', at: 2.0, done: 8.5 },
  { name: 'link()', at: 3.4, done: 7.6 },
  { name: 'mutate()', at: 12.0, done: 18.4 },
  { name: 'render()', at: 19.2, done: 24.5 },
];
const HEAP = [
  { at: 2.4, pos: [0.55, 0.32, -2.6] },
  { at: 3.6, pos: [1.05, -0.08, -2.9] }, // the one that steps out
  { at: 5.0, pos: [0.5, -0.42, -2.4] },
];
const OUT = 1;

export class VisualJavaWork {
  constructor(host) {
    this.host = host;
    const { ctx, scr } = host;
    this.name = 'visualjava';
    this.length = 30;
    this.lamp = 3;
    const geo = buildCrossingGeometry(HEAP_PARTS, { samples: 700, seed: 51 });
    this.obj = ['room', 'out'].map(() => new CrossingObject(ctx, scr, geo, { roughness: 0.4, metalness: 0.1, grid: 0.05 }));
    for (const o of this.obj) {
      o.group.matrixAutoUpdate = false;
      host.group.add(o.group);
    }
    const m = (x, y, z) => new THREE.Vector3(x, y, z);
    this.VR = host.addScreenPortal(new Portal(scr, { rx: 0.3, ry: 0.26, masked: true }), m(1.5, -0.08, -2.2), m(-1, 0, 0));
    this.R = host.addPortal(new Portal(scr, { rx: 0.3, ry: 0.26 }), m(2.32, 3.5, 1.05), m(0.55, -0.1, 0.83));
    this.hang = m(2.8, 3.42, 1.75); // machine space
    this.ref = new Thread(host, { color: PH, bend: 0.1 });
    this.#buildScene(host);
    this._plane = new THREE.Plane();
    this._prev = -1;
    this.focus = new THREE.Vector3();
  }

  lengthFor(variant) {
    return variant === 'rewind' ? 36 : this.length;
  }

  /** Program clock for wall clock `t`: straight through, or with a rewind in the middle. */
  #clock(t, variant) {
    if (variant !== 'rewind') return { u: t, rewinding: false };
    if (t < 16) return { u: t, rewinding: false };
    if (t < 22) return { u: 16 - (t - 16) * (11 / 6), rewinding: true }; // 16 → 5
    return { u: 5 + (t - 22) * (25 / 14), rewinding: false }; // 5 → 30, replayed briskly
  }

  #buildScene(host) {
    const { scr, screenFrame } = host;
    const g = (this.scene = new THREE.Group());
    screenFrame.add(g);
    this.label = screenLabel(scr, 'VISUAL JAVA   stack  ›  heap  ›  trace');
    this.label.position.set(-0.85, 0.78, -0.55);
    g.add(this.label);
    // frames and heap objects drawn as phosphor boxes
    const edges = boxEdges();
    this.frames = FRAMES.map((f, i) => {
      const box = new THREE.LineSegments(edges, lineMaterial(scr));
      box.scale.set(0.72, 0.2, 0.36);
      box.frustumCulled = false;
      const lab = screenLabel(scr, f.name, 0.6);
      lab.position.set(0.06, 0, 0.19);
      lab.scale.setScalar(0.62);
      box.userData.label = lab;
      g.add(box, lab);
      return box;
    });
    this.heap = HEAP.map(() => {
      const box = new THREE.LineSegments(edges, lineMaterial(scr));
      box.scale.set(0.44 / 1.12, 0.3 / 1.12, 0.3 / 1.12);
      box.frustumCulled = false;
      g.add(box);
      return box;
    });
    // references: frame → heap object curves
    this.refs = HEAP.map(() => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
      const l = new THREE.Line(geo, lineMaterial(scr, { color: `mix(${PH}, ${HOT}, 0.3)` }));
      l.frustumCulled = false;
      g.add(l);
      return l;
    });
    // the timeline under it all
    this.timeline = screenPlane(scr, 2.4, 0.16, { uShow: { value: 0 }, uT: { value: 0 }, uU: { value: 0 }, uRew: { value: 0 } }, {
      header: 'uniform float uU; uniform float uRew;',
      main: /* glsl */ `
        col += ${PH} * lineD(m.y, 0.0, 0.002) * 0.4;
        for (int i = 0; i < 24; i++) {
          float x = -1.1 + float(i) * 0.095;
          col += (mod(float(i), 5.0) == 2.0 ? ${HOT} : ${PH}) * aa(length(m - vec2(x, 0.0)) - 0.011) * (0.25 + 0.55 * step(x, -1.15 + uU / 30.0 * 2.3));
        }
        float px = -1.15 + uU / 30.0 * 2.3;
        col += mix(${PH}, ${HOT}, uRew) * fillR(m, vec2(px, 0.0), vec2(0.006, 0.06)) * 1.4;`,
    });
    this.timeline.position.set(0, -0.86, -1.1);
    g.add(this.timeline);
  }

  #crossed(at, u) {
    return this._prevU < at && u >= at;
  }

  update(t, time, dt, show, variant) {
    const h = this.host;
    const live = t <= this.lengthFor(variant);
    const { u, rewinding } = live ? this.#clock(t, variant) : { u: 0, rewinding: false };
    const sh = live ? show : 0;
    this.label.material.uniforms.uShow.value = sh;
    this.timeline.material.uniforms.uShow.value = sh;
    this.timeline.material.uniforms.uU.value = u;
    this.timeline.material.uniforms.uRew.value = rewinding ? 1 : 0;
    this.#program(u, sh, rewinding);
    if (!live) {
      for (const o of this.obj) o.group.visible = false;
      this.R.set(0, 0);
      this.VR.set(0, 0);
      this.ref.hide();
      this._prevU = -1;
      return null;
    }
    this.#escape(u, time);
    // sounds
    if (this._prevU !== undefined && this._prevU >= 0) {
      for (const f of FRAMES) {
        if (this.#crossed(f.at, u)) h.emit('vj-push');
        if (this.#crossed(f.done, u)) h.emit('vj-pop');
      }
      for (const at of [13.2, 15.6, 17.4]) if (this.#crossed(at, u)) h.emit('vj-mutate');
      if (this.#crossed(9.0, u)) h.pulseCable(1);
    }
    if (rewinding && !this._rew) h.emit('vj-rewind');
    this._rew = rewinding;
    this._prevU = u;
    const out = this.obj[1].group.visible;
    return {
      focus: out ? this.focus : null,
      event: u > 8.4 && u < 11 ? this.focus : null,
      activity: rewinding ? 1 : u > 8 && u < 22 ? 0.75 : 0.4,
      tint: rewinding ? '#ff7a55' : null,
      lamp: this.lamp,
    };
  }

  /** The program in the screen at program time u. */
  #program(u, show, rewinding) {
    const h = this.host;
    // stack: frames push from the bottom; finished ones grey out in place, then pop
    let level = 0;
    this.frames.forEach((box, i) => {
      const f = FRAMES[i];
      const on = show * ramp(u, f.at, f.at + 0.4) * (1 - ramp(u, f.done + 1.4, f.done + 1.8));
      const done = ramp(u, f.done, f.done + 0.4);
      box.visible = box.userData.label.visible = on > 0.01;
      const y = -0.5 + level * 0.25;
      if (on > 0.01) level++;
      box.position.set(-0.95, y, -1.9);
      box.userData.label.position.set(-0.95 + 0.06, y, -1.9 + 0.19);
      box.material.uniforms.uA.value = on * (1 - 0.6 * done) * (rewinding ? 1.2 : 0.8);
      box.userData.label.material.uniforms.uShow.value = on * (1 - 0.6 * done);
    });
    // heap objects, and the references held by the frames
    const out = this.obj[1].group.visible && !this.obj[0].group.visible;
    this.heap.forEach((box, i) => {
      const o = HEAP[i];
      const a = show * ramp(u, o.at, o.at + 0.5);
      box.visible = a > 0.01 && !(i === OUT && out);
      box.position.set(...o.pos);
      if (i === OUT && this.roomPos) box.position.copy(this.roomPos);
      box.rotation.set(0, -0.2, 0);
      box.material.uniforms.uA.value = a * 0.9;
      const line = this.refs[i];
      const from = new THREE.Vector3(-0.6, -0.5 + Math.min(i, 2) * 0.25, -1.9);
      const to = box.position.clone();
      const pos = line.geometry.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const s = k / (pos.count - 1);
        const p = new THREE.Vector3().lerpVectors(from, to, s);
        p.z -= Math.sin(s * Math.PI) * 0.4;
        pos.setXYZ(k, p.x, p.y, p.z);
      }
      pos.needsUpdate = true;
      line.visible = a > 0.01 && !(i === OUT && out);
      line.material.uniforms.uA.value = a * 0.55;
      if (i === OUT) this.refFrom = from;
    });
    void h;
  }

  /** The heap object steps out through the portal pair and comes back (driven by program time u). */
  #escape(u, time) {
    const h = this.host;
    const [room, out] = this.obj;
    const oR = pulse(u, 7.8, 8.7, 20.4, 21.2);
    // while it is out, the portal stays a little open: its reference runs through it
    const hold = u > 8.7 && u < 20.4 ? 0.55 : 1;
    this.R.set(oR * hold + oR * (1 - hold) * 0.0, time);
    this.VR.set(oR * hold, time);
    const VRm = h.portalFrame(this.VR, new THREE.Matrix4()), Rm = h.portalFrame(this.R, new THREE.Matrix4());
    const cVR = new THREE.Vector3().setFromMatrixPosition(VRm), nVR = new THREE.Vector3().setFromMatrixColumn(VRm, 2).normalize();
    const cR = new THREE.Vector3().setFromMatrixPosition(Rm), nR = new THREE.Vector3().setFromMatrixColumn(Rm, 2).normalize();
    const home = new THREE.Vector3(...HEAP[OUT].pos).applyMatrix4(h.screenToStation);
    const hang = this.hang.clone().applyMatrix4(h.machine.matrix);
    const V = 1.2;
    const qScreen = new THREE.Quaternion().setFromRotationMatrix(h.screenToStation);
    const uA = 9.0, uB = 20.0; // through the portal, out and back
    const P = new THREE.Vector3(), Vv = new THREE.Vector3();
    // in the room: from home toward the portal, and back again
    const roomPose = (w, m4) => {
      const P = new THREE.Vector3(), Vv = new THREE.Vector3(); // its own: worldPose calls it mid-computation
      if (w <= uA) hermite(home, new THREE.Vector3(), cVR, nVR.clone().multiplyScalar(-V), uA - 6.0, Math.max(0, (w - 6.0) / (uA - 6.0)), P, Vv);
      else if (w >= uB + 0.9) hermite(cVR, nVR.clone().multiplyScalar(V), home, new THREE.Vector3(), 2.4, Math.min(1, (w - uB - 0.9) / 2.4), P, Vv);
      else if (w < uA + 0.5) P.copy(cVR).addScaledVector(nVR, -V * (w - uA));
      else P.copy(cVR).addScaledVector(nVR, -V * Math.max(0, uB + 0.9 - w));
      return m4.compose(P, qScreen, new THREE.Vector3(1, 1, 1));
    };
    // in the world: out of the portal to where it hangs, turning slowly; and back in
    const spin = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2 * Math.sin(time * 0.4), time * 0.35, 0.1));
    const worldPose = (w, m4) => {
      if (w < uA) return m4.copy(portalMap4(Rm, VRm)).multiply(roomPose(w, new THREE.Matrix4()));
      if (w > uB + 0.9) return m4.copy(portalMap4(Rm, VRm)).multiply(roomPose(w, new THREE.Matrix4()));
      if (w < uA + 1.4) hermite(cR, nR.clone().multiplyScalar(V), hang, new THREE.Vector3(), 1.4, (w - uA) / 1.4, P, Vv);
      else if (w > uB - 0.5) hermite(hang, new THREE.Vector3(), cR, nR.clone().multiplyScalar(-V), 1.4, Math.min(1, (w - uB + 0.5) / 1.4), P, Vv);
      else P.copy(hang).add(new THREE.Vector3(0, Math.sin(time * 0.8) * 0.03, 0));
      const q0 = new THREE.Quaternion().setFromRotationMatrix(portalMap4(Rm, VRm).multiply(roomPose(uA, new THREE.Matrix4())));
      const k = ramp(w, uA, uA + 1.4) * (1 - ramp(w, uB - 0.5, uB + 0.9));
      return m4.compose(P, q0.slerp(spin, k), new THREE.Vector3(1, 1, 1));
    };
    room.group.visible = u > 6.0 && u < uA + 0.35 || (u > uB + 0.55 && u < uB + 3.3);
    out.group.visible = u > uA - 0.35 && u < uB + 1.25;
    if (room.group.visible) roomPose(u, room.group.matrix);
    if (out.group.visible) worldPose(u, out.group.matrix);
    this.roomPos = u > 6.0 && u < uB + 3.3 ? new THREE.Vector3().setFromMatrixPosition(room.group.matrix).applyMatrix4(new THREE.Matrix4().copy(h.screenToStation).invert()) : null;
    room.uniforms.uPhys.value = 0;
    room.clip(0, this.VR.plane(this._plane));
    out.uniforms.uPhys.value = 1;
    out.clip(0, this.R.plane(this._plane));
    // mutations: the program writes to the object while it hangs outside
    const flash = [13.2, 15.6, 17.4].reduce((m, a) => Math.max(m, pulse(u, a, a + 0.08, a + 0.25, a + 0.6)), 0);
    out.uniforms.uFlash.value = flash;
    this.focus.setFromMatrixPosition(out.group.matrix);
    // the reference: from the frame that holds it, through the portal, to the object
    const refA = out.group.visible && u > uA + 0.3 && u < uB + 0.6 ? 1 : 0;
    this._refA = THREE.MathUtils.lerp(this._refA ?? 0, refA, 0.2);
    if (this._refA > 0.01 && this.refFrom) {
      this.ref.set(this._refA, this.focus.clone(), cR, this.VR.group.position.clone(), this.refFrom);
    } else this.ref.hide();
  }
}
