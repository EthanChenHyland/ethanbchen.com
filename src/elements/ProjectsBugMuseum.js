import * as THREE from 'three';
import { PHOSPHOR_GLSL as PH } from './ProjectsScreen.js';
import { Portal } from './ProjectsPortal.js';
import { HOT, ramp, pulse, hash, screenLabel, screenPlane, clippedMaterial, outOfGlass } from './ProjectsKit.js';

// BugMuseum: an interactive museum of software failures (wings of exhibits such as "The Fencepost",
// an off-by-one error, and "The Bottomless Staircase", a stack overflow), each with a deterministic
// simulation and a "break it" workbench.
//
// Here an exhibit escapes the machine and misbehaves in the station until the console catches it:
// the fence comes out with one rail too many, which hangs off the deck and glitches until a slit
// opens under it; the staircase keeps adding steps out of the screen, past the deck and the pedestal,
// until a portal intercepts the overflow and the rest is pulled back in.

const POSTS = [0.0, 0.4, 0.8, 1.2];
const RAILS = [0.2, 0.6, 1.0, 1.4]; // four rails for four posts: the last one has nowhere to go
const FENCE_Z = 0.76;
const STEPS = 16;
const OV = new THREE.Vector3(0.5, 0, 0.5); // where the overflowing counter stacks
const PITCH = 0.048;
const stepPos = (k) => new THREE.Vector3(0, 3.0 - k * 0.165, 1.25 + k * 0.14); // machine space

export class BugMuseumWork {
  constructor(host) {
    this.host = host;
    const { scr } = host;
    this.name = 'bugmuseum';
    this.length = 22;
    this.lamp = 4;
    const mk = (geo, color, n, key) => {
      const mat = clippedMaterial({ color, roughness: 0.4, metalness: 0.1 }, key, scr);
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.customDepthMaterial = mat.userData.depth;
      m.castShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.visible = false;
      host.group.add(m);
      return m;
    };
    this.posts = mk(new THREE.BoxGeometry(0.045, 0.26, 0.045), 0xcfc8bb, POSTS.length + 1, 'proj-bug-post');
    this.rails = mk(new THREE.BoxGeometry(0.4, 0.03, 0.026), 0x3a3c40, RAILS.length, 'proj-bug-rail');
    this.steps = mk(new THREE.BoxGeometry(0.36, 0.045, 0.16), 0xcfc8bb, STEPS, 'proj-bug-step');
    // Integer Overflow: a counting stack; Deadlock: two processes and the two locks they hold
    this.tiles = mk(new THREE.BoxGeometry(0.3, 0.044, 0.2), 0xcfc8bb, 9, 'proj-bug-tile');
    for (let k = 0; k < 9; k++) this.tiles.setColorAt(k, new THREE.Color(k === 8 ? 0xc4472f : 0xcfc8bb).lerp(new THREE.Color(0x9a958c), k < 8 ? k / 16 : 0));
    this.procs = mk(new THREE.BoxGeometry(0.16, 0.16, 0.16), 0xcfc8bb, 2, 'proj-bug-proc');
    this.procs.setColorAt(0, new THREE.Color(0xcfc8bb));
    this.procs.setColorAt(1, new THREE.Color(0x5a5d63));
    const lockMat = new THREE.MeshStandardMaterial({ color: 0x2a1410, emissive: 0xe3684d, emissiveIntensity: 1.6, roughness: 0.4 });
    this.locks = new THREE.InstancedMesh(new THREE.TorusGeometry(0.05, 0.012, 8, 24), lockMat, 2);
    this.locks.frustumCulled = false;
    this.locks.visible = false;
    this.locks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    host.group.add(this.locks);
    for (let k = 0; k < STEPS; k++) this.steps.setColorAt(k, new THREE.Color(k >= 12 ? 0xc4472f : 0xcfc8bb).lerp(new THREE.Color(0x9a958c), k < 12 ? k / 24 : 0));
    const m = (x, y, z) => new THREE.Vector3(x, y, z);
    // a slit under the dangling rail; a portal across the path of the falling overflow
    this.S = host.addPortal(new Portal(scr, { rx: 0.22, ry: 0.07, shape: 'slit' }), m(1.62, 1.18, FENCE_Z), m(0, 1, 0));
    this.C = host.addPortal(new Portal(scr, { rx: 0.34, ry: 0.3 }), m(0, 0.55, 3.55), m(0, 0.45, -0.89));
    this.W = host.addPortal(new Portal(scr, { rx: 0.06, ry: 0.13, shape: 'slit' }), m(OV.x + 0.27, 1.56 + 8 * PITCH + 0.03, OV.z), m(-1, 0, 0));
    this.D = host.addPortal(new Portal(scr, { rx: 0.19, ry: 0.14, shape: 'rect' }), m(OV.x, 1.564, OV.z), m(0, 1, 0));
    this.K = host.addPortal(new Portal(scr, { rx: 0.13, ry: 0.13, shape: 'rect', tier: 'micro' }), m(0.12, 1.564, 0.55), m(0, 1, 0));
    this.#buildScene(host);
    this._m = new THREE.Matrix4();
    this._prev = -1;
    this.focus = new THREE.Vector3();
  }

  #buildScene(host) {
    const { scr, screenFrame } = host;
    const g = (this.scene = new THREE.Group());
    screenFrame.add(g);
    this.labels = {
      fence: screenLabel(scr, 'BUGMUSEUM   gallery A1  ·  the fencepost'),
      stairs: screenLabel(scr, 'BUGMUSEUM   gallery C1  ·  the bottomless staircase'),
    };
    for (const l of Object.values(this.labels)) {
      l.position.set(-0.85, 0.78, -0.55);
      g.add(l);
    }
    this.plate = screenPlane(scr, 2.4, 1.3, { uShow: { value: 0 }, uT: { value: 0 }, uP: { value: 0 }, uVar: { value: 0 } }, {
      header: 'uniform float uP; uniform float uVar;',
      main: /* glsl */ `
        if (uVar < 0.5) {
          // n posts need n - 1 rails: the exhibit counts them, and one too many
          for (int i = 0; i < 4; i++) col += ${PH} * fillR(m, vec2(-0.6 + float(i) * 0.4, -0.1), vec2(0.012, 0.16)) * 0.7;
          for (int i = 0; i < 4; i++) {
            vec2 c = vec2(-0.4 + float(i) * 0.4, -0.02);
            col += (i == 3 ? ${HOT} : ${PH}) * rectD(m, c, vec2(0.19, 0.012), 0.002) * (i == 3 ? 0.9 + 0.6 * step(0.5, fract(uT * 3.0)) : 0.6);
          }
          for (int i = 0; i < 5; i++) col += ${PH} * fillR(m, vec2(-0.6 + float(i) * 0.4, -0.36), vec2(0.01, 0.01)) * 0.6;
          col += ${HOT} * rectD(m, vec2(1.0, -0.36), vec2(0.03), 0.003) * (0.5 + 0.5 * step(0.5, fract(uT * 2.0)));
        } else if (uVar > 2.5) {
          // two processes, two locks, each waiting for the other: a cycle
          float dl = smoothstep(6.5, 7.5, uP) * (1.0 - smoothstep(13.5, 14.5, uP));
          col += ${PH} * rectD(m, vec2(-0.45, 0.0), vec2(0.12), 0.003) * 0.7;
          col += ${PH} * rectD(m, vec2(0.45, 0.0), vec2(0.12), 0.003) * 0.7 * (1.0 - smoothstep(13.5, 14.2, uP));
          col += ${HOT} * (1.0 - smoothstep(0.0, 0.006, abs(length(m - vec2(0.0, 0.28)) - 0.06))) * (0.6 + 0.6 * dl * step(0.5, fract(uT * 1.5)));
          col += ${HOT} * (1.0 - smoothstep(0.0, 0.006, abs(length(m - vec2(0.0, -0.28)) - 0.06))) * (0.6 + 0.6 * dl * step(0.5, fract(uT * 1.5 + 0.5)));
          col += ${PH} * (segD(m, vec2(-0.33, 0.06), vec2(-0.06, 0.26), 0.003) + segD(m, vec2(0.06, 0.26), vec2(0.33, 0.06), 0.003) + segD(m, vec2(0.33, -0.06), vec2(0.06, -0.26), 0.003) + segD(m, vec2(-0.06, -0.26), vec2(-0.33, -0.06), 0.003)) * (0.3 + 0.7 * dl);
        } else if (uVar > 1.5) {
          // a counter that runs past its largest value and wraps to its most negative
          float n = clamp((uP - 3.0) / 0.55, 0.0, 8.0);
          float wrapped = smoothstep(9.2, 9.5, uP) * (1.0 - smoothstep(14.0, 15.0, uP));
          for (int i = 0; i < 8; i++) col += (i == 7 ? ${HOT} : ${PH}) * fillR(m, vec2(-0.2, -0.35 + float(i) * 0.09), vec2(0.18, 0.03)) * step(float(i) + 0.5, n) * (0.4 + 0.3 * (1.0 - wrapped));
          col += ${HOT} * fillR(m, vec2(-0.2, -0.44), vec2(0.18, 0.03)) * wrapped * (0.7 + 0.5 * step(0.5, fract(uT * 3.0)));
          col += ${PH} * rectD(m, vec2(-0.2, -0.04), vec2(0.22, 0.38), 0.002) * 0.5;
          col += ${HOT} * segD(m, vec2(0.12, 0.32), vec2(0.12, -0.44), 0.003) * wrapped * 0.8;
        } else {
          // the stack grows a frame per step and never returns
          float depth = clamp((uP - 3.0) / 0.5, 0.0, 16.0) * (1.0 - smoothstep(14.0, 21.0, uP));
          for (int i = 0; i < 16; i++) {
            vec2 c = vec2(-0.75 + float(i) * 0.09, 0.35 - float(i) * 0.05);
            float on = step(float(i), depth);
            col += (i >= 12 ? ${HOT} : ${PH}) * rectD(m, c, vec2(0.08, 0.018), 0.002) * on * 0.7;
          }
          col += ${PH} * fillR(m, vec2(0.75, -0.5 + depth * 0.03), vec2(0.03, depth * 0.03)) * 0.5;
          col += ${HOT} * rectD(m, vec2(0.75, -0.02), vec2(0.06, 0.5), 0.002) * smoothstep(9.0, 10.0, uP) * 0.6;
        }`,
    });
    this.plate.position.set(0, -0.05, -2.3);
    g.add(this.plate);
  }

  lengthFor() {
    return this.length;
  }

  update(t, time, dt, show, variant = 'fence') {
    const h = this.host;
    const live = t <= this.length;
    const sh = live ? show : 0;
    this.labels.fence.material.uniforms.uShow.value = variant === 'fence' ? sh : 0;
    this.labels.stairs.material.uniforms.uShow.value = variant === 'stairs' ? sh : 0;
    this.plate.material.uniforms.uShow.value = sh;
    this.plate.material.uniforms.uT.value = time;
    this.plate.material.uniforms.uP.value = Math.min(t, 30);
    this.plate.material.uniforms.uVar.value = { fence: 0, stairs: 1, overflow: 2, deadlock: 3 }[variant] ?? 0;
    if (!live) {
      this.posts.visible = this.rails.visible = this.steps.visible = this.tiles.visible = this.procs.visible = this.locks.visible = false;
      for (const p of [this.S, this.C, this.W, this.D, this.K]) p.set(0, 0);
      this._prev = -1;
      return null;
    }
    // (the glass cuts whatever is still coming out of, or going back into, the screen)
    for (const m of [this.posts, this.rails, this.steps, this.tiles, this.procs]) m.visible = false;
    this.locks.visible = false;
    for (const p of [this.S, this.C, this.W, this.D, this.K]) p.set(0, 0);
    const out = variant === 'stairs' ? this.#stairs(t, time) : variant === 'overflow' ? this.#overflow(t, time) : variant === 'deadlock' ? this.#deadlock(t, time) : this.#fence(t, time);
    this._prev = t;
    return { ...out, lamp: this.lamp };
  }

  #crossed(at, t) {
    return this._prev < at && t >= at;
  }

  /** Pose (station space) of something sliding out of the glass to `dst` (machine space) between t0 and t1; reversed after r0..r1. */
  #slide(from, dst, t, t0, t1, r0, r1, direct = false) {
    const h = this.host;
    const b = dst.clone().applyMatrix4(h.machine.matrix);
    const k = ramp(t, t0, t1) * (1 - ramp(t, r0, r1));
    return { p: outOfGlass(from, b, k, h.screenToStation, new THREE.Vector3(), direct), k };
  }

  #fence(t, time) {
    const h = this.host;
    this.steps.visible = false;
    this.C.set(0, 0);
    this.posts.visible = this.rails.visible = t > 2.8 && t < 21.5;
    for (const m of [this.posts, this.rails]) {
      m.material.userData.glass(true);
      m.material.userData.clip(0, null);
      m.material.userData.clip(1, null);
    }
    const qM = new THREE.Quaternion().setFromRotationMatrix(h.machine.matrix), one = new THREE.Vector3(1, 1, 1);
    // pieces come out in order, post, rail, post, rail …, and go back in reverse
    const order = [];
    POSTS.forEach((_, i) => {
      order.push(['post', i]);
      order.push(['rail', i]);
    });
    order.forEach(([kind, i], j) => {
      const t0 = 3.0 + j * 0.4, r0 = 20.2 - j * 0.38;
      const dst = kind === 'post' ? new THREE.Vector3(POSTS[i], 1.56 + 0.13, FENCE_Z) : new THREE.Vector3(RAILS[i], 1.56 + 0.17, FENCE_Z);
      const from = [-0.55 + j * 0.13, -0.45, -0.14];
      const { p } = this.#slide(from, dst, t, t0, t0 + 0.75, r0, r0 + 0.75);
      let q = qM.clone();
      if (kind === 'rail' && i === 3) {
        // the extra rail: hanging off the last post, sagging, glitching; then dropped through a slit
        const pivot = new THREE.Vector3(POSTS[3], 1.56 + 0.17, FENCE_Z).applyMatrix4(h.machine.matrix);
        const outward = new THREE.Vector3(1, 0, 0).applyQuaternion(qM);
        const sag = -0.42 * ramp(t, 7.0, 8.2) + 0.12 * Math.sin(time * 9.0) * pulse(t, 8, 9, 13, 14);
        const glitch = Math.sin(time * 37) > 0.93 && t > 8 && t < 14 ? 0.06 : 0;
        const dir = new THREE.Vector3(Math.cos(sag), Math.sin(sag), 0).applyQuaternion(qM);
        if (t > 7) p.copy(pivot).addScaledVector(dir, 0.2).add(new THREE.Vector3(0, glitch, 0));
        q = qM.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, sag)));
        if (t > 14.6) {
          const f = ramp(t, 14.6, 15.4);
          p.y -= f * f * 0.9;
          p.addScaledVector(outward, f * 0.18);
          q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -f * 1.2)));
        }
        this.focus.copy(p);
      }
      this._m.compose(p, q, one);
      (kind === 'post' ? this.posts : this.rails).setMatrixAt(i, this._m);
    });
    // a ghost fifth post flickers where it "should" have been
    const ghost = t > 8 && t < 14 && Math.sin(time * 23) > 0.6;
    this._m.compose(new THREE.Vector3(1.6, 1.56 + 0.13, FENCE_Z).applyMatrix4(h.machine.matrix), qM, ghost ? one : new THREE.Vector3(0, 0, 0));
    this.posts.setMatrixAt(4, this._m);
    this.posts.instanceMatrix.needsUpdate = true;
    this.rails.instanceMatrix.needsUpdate = true;
    // the catch
    this.S.set(pulse(t, 13.8, 14.4, 15.6, 16.1), time);
    if (t > 14.4 && t < 16) this.rails.material.userData.clip(1, this.S.plane(new THREE.Plane()));
    if (this.#crossed(7.2, t)) h.emit('bug-error');
    if (this.#crossed(10.6, t)) h.emit('bug-error');
    if (this.#crossed(15.0, t)) h.emit('bug-caught');
    if (Math.sin(time * 37) > 0.93 && t > 8 && t < 14 && !this._g) h.emit('bug-glitch');
    this._g = Math.sin(time * 37) > 0.93;
    const broken = t > 7 && t < 15.5;
    return { focus: t > 3 && t < 16 ? this.focus : null, event: broken ? this.focus : null, activity: broken ? 0.9 : 0.4, alarm: broken, crossing: t > 3 && t < 6.6 };
  }

  /** Integer Overflow: the count stacks up out of the glass; one more wraps round to the bottom. */
  #overflow(t, time) {
    const h = this.host;
    this.tiles.visible = t > 2.8 && t < 21.5;
    const mat = this.tiles.material.userData;
    mat.glass(true);
    mat.clip(0, this.W.plane(new THREE.Plane()));
    mat.clip(1, this.D.plane(new THREE.Plane()));
    const qM = new THREE.Quaternion().setFromRotationMatrix(h.machine.matrix), one = new THREE.Vector3(1, 1, 1);
    const emerge = ramp(t, 9.2, 10.2);
    const lift = emerge * PITCH;
    const glitch = t > 10.2 && t < 14 && Math.sin(time * 31) > 0.9 ? 0.012 : 0;
    for (let j = 0; j < 9; j++) {
      let p;
      if (j < 8) {
        const t0 = 3.0 + j * 0.55, r0 = 14.2 + (7 - j) * 0.45;
        const dst = new THREE.Vector3(OV.x, 1.56 + PITCH * (j + 0.5) + lift, OV.z);
        // down in front of the frame's lower lip, never straight through it
        ({ p } = this.#slide([-0.5 + j * 0.12, -0.5, -0.12], dst, t, t0, t0 + 0.9, r0, r0 + 0.8));
        p.x += glitch * (j % 2 ? 1 : -1);
      } else {
        // the one too many: out to the top, sideways into the slit, back in under the stack
        const top = new THREE.Vector3(OV.x, 1.56 + PITCH * 8.5 + 0.004, OV.z);
        if (t < 8.4) ({ p } = this.#slide([0.3, -0.45, -0.12], top, t, 7.6, 8.4, 99, 100));
        else if (t < 9.2) p = top.clone().add(new THREE.Vector3(0.48 * ramp(t, 8.4, 9.15), 0, 0)).applyMatrix4(h.machine.matrix);
        else if (t < 16.0) p = new THREE.Vector3(OV.x, 1.56 - PITCH * 0.5 + PITCH * emerge, OV.z).applyMatrix4(h.machine.matrix);
        else ({ p } = this.#slide([0.3, -0.45, -0.12], new THREE.Vector3(OV.x, 1.56 + PITCH * 0.5, OV.z), t, 0, 0.01, 17.6, 18.3));
        if (t > 8.4 && t < 9.2 && t < 16) this.focus.copy(p);
        p.y += t > 10.2 && t < 14 ? glitch : 0;
      }
      this._m.compose(p, qM, t < 7.6 && j === 8 ? new THREE.Vector3(0, 0, 0) : one);
      this.tiles.setMatrixAt(j, this._m);
    }
    this.tiles.instanceMatrix.needsUpdate = true;
    this.W.set(pulse(t, 8.0, 8.4, 9.0, 9.4), time);
    this.D.set(pulse(t, 8.9, 9.2, 10.0, 10.4), time);
    for (let j = 0; j < 9; j++) if (this.#crossed(3.7 + j * 0.55, t) && j < 8) this.host.emit('bug-step', { k: j });
    if (this.#crossed(9.2, t)) this.host.emit('bug-error');
    if (this.#crossed(14.2, t)) this.host.emit('bug-caught');
    if (glitch && !this._g) this.host.emit('bug-glitch');
    this._g = !!glitch;
    if (t < 8.4) this.focus.copy(new THREE.Vector3(OV.x, 1.56 + PITCH * 4, OV.z).applyMatrix4(h.machine.matrix));
    const broken = t > 9.2 && t < 14.2;
    return { focus: t > 3 && t < 19 ? this.focus : null, event: broken ? this.focus : null, activity: broken ? 0.95 : 0.5, alarm: broken, crossing: (t > 3 && t < 8.4) || (t > 14.2 && t < 18.4) };
  }

  /** Deadlock: two processes each hold the lock the other wants, and stop, nose to nose. */
  #deadlock(t, time) {
    const h = this.host;
    this.procs.visible = t > 2.8 && t < 20.5;
    this.locks.visible = t > 3.9 && t < 20.5;
    const mat = this.procs.material.userData;
    mat.glass(true);
    mat.clip(0, this.K.plane(new THREE.Plane()));
    mat.clip(1, null);
    const M = h.machine.matrix;
    const qM = new THREE.Quaternion().setFromRotationMatrix(M), one = new THREE.Vector3(1, 1, 1);
    const Y = 1.56 + 0.081;
    const stuck = t > 7.2 && t < 13.5;
    const jit = stuck ? 0.01 * Math.sin(time * 9) : 0;
    const approach = ramp(t, 5.6, 7.2);
    const finish = ramp(t, 14.6, 15.6);
    // A (left) and B (right); B is dropped through the deck to break the cycle
    const ax = -0.45 + 0.33 * approach + 0.55 * finish + jit, bx = 0.45 - 0.33 * approach - jit;
    const drop = ramp(t, 13.6, 14.4);
    const posA = this.#slide([-0.5, -0.5, -0.12], new THREE.Vector3(ax, Y, 0.55), t, 3.0, 3.8, 17.4, 18.2).p;
    const posB = this.#slide([0.5, -0.5, -0.12], new THREE.Vector3(bx, Y - drop * 0.2, 0.55), t, 3.2, 4.0, 99, 100).p;
    this._m.compose(posA, qM, one);
    this.procs.setMatrixAt(0, this._m);
    this._m.compose(posB, qM, t > 14.5 ? new THREE.Vector3(0, 0, 0) : one);
    this.procs.setMatrixAt(1, this._m);
    this.procs.instanceMatrix.needsUpdate = true;
    // the locks: each held above its process, reaching for the other; then both go with A
    const up = new THREE.Vector3(0, 0.15, 0).applyQuaternion(qM);
    const l1 = posA.clone().add(up), l2 = posB.clone().add(up);
    if (stuck) {
      const sway = 0.03 * Math.sin(time * 2.2);
      l1.add(new THREE.Vector3(0.035 + sway, 0, 0).applyQuaternion(qM));
      l2.add(new THREE.Vector3(-0.035 + sway, 0, 0).applyQuaternion(qM));
    }
    if (t > 13.9) l2.lerp(posA.clone().add(up).add(new THREE.Vector3(0, 0.08, 0)), ramp(t, 13.9, 14.8));
    const lockIn = (t0) => ramp(t, t0, t0 + 0.6) * (1 - ramp(t, 16.9, 17.4));
    const qL = qM.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, time * 0.8, 0)));
    const sc = (k) => new THREE.Vector3(k, k, k);
    this._m.compose(l1, qL, sc(Math.max(lockIn(4.0), 1e-3)));
    this.locks.setMatrixAt(0, this._m);
    this._m.compose(l2, qL, sc(Math.max(lockIn(4.4), 1e-3)));
    this.locks.setMatrixAt(1, this._m);
    this.locks.instanceMatrix.needsUpdate = true;
    this.locks.material.emissiveIntensity = 1.2 + (stuck ? 1.4 * (0.5 + 0.5 * Math.sin(time * 6)) : 0);
    this.K.set(pulse(t, 13.3, 13.7, 14.5, 15.0), time);
    this.focus.copy(posA).lerp(posB, 0.5);
    if (this.#crossed(7.2, t)) this.host.emit('bug-error');
    if (stuck && Math.floor(time * 1.5) !== this._dk) this.host.emit('bug-glitch');
    this._dk = Math.floor(time * 1.5);
    if (this.#crossed(13.9, t)) this.host.emit('bug-caught');
    return { focus: t > 3 && t < 18 ? this.focus : null, event: stuck ? this.focus : null, activity: stuck ? 0.95 : 0.5, alarm: stuck, crossing: (t > 3 && t < 4.6) || (t > 17.4 && t < 18.4) };
  }

  #stairs(t, time) {
    const h = this.host;
    this.posts.visible = this.rails.visible = false;
    this.S.set(0, 0);
    this.steps.visible = t > 2.8 && t < 21.5;
    this.steps.material.userData.glass(true);
    this.steps.material.userData.clip(0, null);
    this.steps.material.userData.clip(1, null);
    const qM = new THREE.Quaternion().setFromRotationMatrix(h.machine.matrix);
    for (let k = 0; k < STEPS; k++) {
      const t0 = 3.0 + k * 0.5;
      const r0 = 14.6 + (11 - k) * 0.5;
      const sc = 1 - k * 0.018;
      let { p } = this.#slide([0, -0.55, -0.13], stepPos(k), t, t0, t0 + 0.6, k < 12 ? r0 : 99, k < 12 ? r0 + 0.6 : 100, true);
      let q = qM.clone();
      if (k >= 12) {
        // the overflow breaks away and falls; a portal opens across its path and takes it
        const f0 = 11.6 + (k - 12) * 0.28;
        const f = ramp(t, f0, f0 + 0.9);
        const cC = new THREE.Vector3().setFromMatrixPosition(h.portalFrame(this.C, new THREE.Matrix4()));
        const nC = new THREE.Vector3().setFromMatrixColumn(h.portalFrame(this.C, new THREE.Matrix4()), 2).normalize();
        p = p.clone().lerp(cC.clone().addScaledVector(nC, -0.3), f * f);
        q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(f * 1.4 * (hash(k) - 0.5), 0, f * 0.8)));
        if (k === 12) this.focus.copy(p);
      } else if (k === Math.min(11, Math.floor((t - 3) / 0.5))) this.focus.copy(p);
      this._m.compose(p, q, new THREE.Vector3(sc, 1, sc));
      this.steps.setMatrixAt(k, this._m);
    }
    this.steps.instanceMatrix.needsUpdate = true;
    this.steps.instanceColor.needsUpdate = true;
    this.C.set(pulse(t, 11.4, 12.0, 13.9, 14.4), time);
    if (t > 11.6 && t < 14.4) this.steps.material.userData.clip(1, this.C.plane(new THREE.Plane()));
    for (let k = 0; k < STEPS; k++) if (this.#crossed(3.0 + k * 0.5 + 0.6, t)) h.emit('bug-step', { k });
    if (this.#crossed(9.5, t)) h.emit('bug-error');
    if (this.#crossed(12.2, t)) h.emit('bug-caught');
    const broken = t > 8.5 && t < 14;
    return { focus: t > 3 && t < 21 ? this.focus : null, event: broken ? this.focus : null, activity: broken ? 0.95 : 0.5, alarm: broken, crossing: (t > 3 && t < 11) || t > 14.6 };
  }
}
