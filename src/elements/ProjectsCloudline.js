import * as THREE from 'three';
import { PHOSPHOR_GLSL as PH } from './ProjectsScreen.js';
import { Portal } from './ProjectsPortal.js';
import { HOT, ramp, pulse, screenPlane, clippedMaterial } from './ProjectsKit.js';

// Cloudline: a cozy 3D railway game, a vintage tram driven between floating seaside islands.
//
// In the screen, small islands float and a tram crosses between them on its line. Then the line
// itself comes out of the glass: two rails and their sleepers lay themselves out in front of the
// console, curve down to its waist and run once right round it (behind it, past the cable), and the
// tram follows, round the turning machine, until an aperture in the air takes it back into the
// screen; the rails retract after it. Everything is in the console's own frame, so the loop turns
// with the machine.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const RING_Y = 2.2;
const RING_R = 1.95; // clear of the rear block, the spine and the cable
const GAUGE = 0.11;

export class CloudlineWork {
  constructor(host) {
    this.host = host;
    this.name = 'cloudline';
    this.length = 26;
    this.lamp = 3;
    const { scr } = host;
    // the islands and the line, inside the screen
    this.scene = screenPlane(scr, 2.6, 1.3, { uShow: { value: 0 }, uT: { value: 0 }, uP: { value: 0 } }, {
      header: 'uniform float uP;',
      main: /* glsl */ `
        // islands: soft ellipses with flat tops, a line strung between them
        for (int i = 0; i < 4; i++) {
          vec2 c = vec2(-0.9 + float(i) * 0.6, -0.15 + 0.12 * sin(float(i) * 2.1) + 0.02 * sin(uT * 0.6 + float(i)));
          vec2 d = (m - c) / vec2(0.2, 0.07);
          float isl = 1.0 - smoothstep(0.9, 1.05, length(d)) ;
          col += ${PH} * isl * 0.1 * step(m.y, c.y + 0.02);
          col += ${PH} * (1.0 - smoothstep(0.0, 0.006, abs(length(d) - 1.0) * 0.07)) * 0.45;
        }
        float lineY = -0.12 + 0.06 * sin(m.x * 2.3);
        col += ${PH} * lineD(m.y, lineY, 0.002) * step(abs(m.x), 1.15) * 0.6;
        // the tram on its line
        float tx = -1.1 + mod(uP * 0.35, 2.2);
        col += ${HOT} * fillR(m, vec2(tx, -0.12 + 0.06 * sin(tx * 2.3) + 0.03), vec2(0.05, 0.022)) * step(uP, 6.5);
        // the tram back home after its trip round the console
        float tb = -0.6 + (uP - 17.2) * 0.25;
        col += ${HOT} * fillR(m, vec2(tb, -0.12 + 0.06 * sin(tb * 2.3) + 0.03), vec2(0.05, 0.022)) * step(17.2, uP) * step(uP, 22.0);`,
    });
    this.scene.position.set(0, 0.05, -1.4);
    host.screenFrame.add(this.scene);
    // the line out of the glass: front, down to the waist, once round, ending at the return aperture
    const pts = [];
    pts.push(V(0.42, 3.62, 0.55), V(0.48, 3.4, 1.15), V(0.4, 2.9, 1.75), V(0.15, RING_Y + 0.12, RING_R + 0.05));
    for (let i = 1; i <= 15; i++) {
      const a = (i / 16) * Math.PI * 2;
      pts.push(V(Math.sin(a) * RING_R, RING_Y + 0.05 * Math.sin(a * 2), Math.cos(a) * RING_R));
    }
    pts.push(V(-0.55, RING_Y + 0.12, RING_R - 0.05), V(-0.95, 2.75, 1.55));
    this.path = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    this.pathLength = this.path.getLength();
    const mkRail = (side) => {
      const off = [];
      const N = 400;
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const p = this.path.getPointAt(u), tg = this.path.getTangentAt(u);
        const sideV = new THREE.Vector3().crossVectors(tg, V(0, 1, 0)).normalize();
        off.push(p.addScaledVector(sideV, (side * GAUGE) / 2));
      }
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(off), N, 0.013, 6);
      const mat = clippedMaterial({ color: 0x9a948a, roughness: 0.3, metalness: 0.85 }, `proj-cl-rail${side}`, scr);
      const m = new THREE.Mesh(geo, mat);
      m.customDepthMaterial = mat.userData.depth;
      m.castShadow = true;
      m.visible = false;
      m.frustumCulled = false;
      host.machine.add(m);
      return m;
    };
    this.rails = [mkRail(-1), mkRail(1)];
    this.railSegs = 400;
    // sleepers
    const NS = 120;
    const sMat = clippedMaterial({ color: 0x3a3c40, roughness: 0.5, metalness: 0.4 }, 'proj-cl-sleeper', scr);
    this.sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(GAUGE * 1.6, 0.012, 0.03), sMat, NS);
    this.sleepers.customDepthMaterial = sMat.userData.depth;
    this.sleepers.frustumCulled = false;
    this.sleepers.visible = false;
    this.sleepers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    host.machine.add(this.sleepers);
    this.sleeperAt = Array.from({ length: NS }, (_, i) => {
      const u = (i + 0.5) / NS;
      const p = this.path.getPointAt(u).add(V(0, -0.01, 0));
      const tg = this.path.getTangentAt(u);
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(V(0, 0, 0), tg, V(0, 1, 0)));
      return { u, p, q };
    });
    // the tram: a cream car with a vermilion band and a pantograph
    const car = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.07, 0.16), clippedMaterial({ color: 0xd9d1c2, roughness: 0.45, metalness: 0.1 }, 'proj-cl-car', scr));
    body.position.y = 0.05;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.077, 0.016, 0.162), clippedMaterial({ color: 0xc4472f, roughness: 0.4, emissive: 0xe3684d, emissiveIntensity: 0.6 }, 'proj-cl-band', scr));
    band.position.y = 0.04;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.14), clippedMaterial({ color: 0x3a3c40, roughness: 0.4, metalness: 0.6 }, 'proj-cl-roof', scr));
    roof.position.y = 0.091;
    car.add(body, band, roof);
    car.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.customDepthMaterial = o.material.userData.depth;
    });
    car.scale.setScalar(1.6);
    car.visible = false;
    host.machine.add(car);
    this.car = car;
    this.carMats = [body.material, band.material, roof.material];
    this.allMats = [...this.rails.map((r) => r.material), sMat, ...this.carMats];
    // the return: an aperture in the air at the end of the line, and its partner inside the screen
    this.P = host.addPortal(new Portal(scr, { rx: 0.17, ry: 0.15 }), V(-0.95, 2.75, 1.55), this.path.getTangentAt(1).clone().negate());
    this.Pin = host.addScreenPortal(new Portal(scr, { rx: 0.14, ry: 0.12, masked: true }), V(-0.6, -0.1, -1.35), V(1, 0, 0.2));
    this.focus = new THREE.Vector3();
    this._prev = -1;
  }

  lengthFor() {
    return this.length;
  }

  physicalNow() {
    return this._t > 4.4 && this._t < 22.2;
  }

  update(t, time, dt, show) {
    const h = this.host;
    this._t = t;
    const live = t <= this.length;
    this.scene.material.uniforms.uShow.value = live ? show * (1 - ramp(t, 24.5, 26)) : 0;
    this.scene.material.uniforms.uT.value = time;
    this.scene.material.uniforms.uP.value = Math.min(t, 30);
    if (!live) {
      this.rails.forEach((r) => (r.visible = false));
      this.sleepers.visible = this.car.visible = false;
      this.P.set(0, 0);
      this.Pin.set(0, 0);
      this._prev = -1;
      return null;
    }
    // the rails lay out of the glass, then retract after the tram has gone home
    const lay = ramp(t, 4.5, 7.6), back = ramp(t, 18.4, 22.0);
    const from = back, to = lay;
    const segs = this.railSegs;
    const idx = (u) => Math.floor(u * segs) * 6 * 6; // radial segments 6, two triangles
    for (const r of this.rails) {
      r.visible = to > from + 0.002;
      r.geometry.setDrawRange(idx(from), Math.max(0, idx(to) - idx(from)));
    }
    this.allMats.forEach((m) => m.userData.glass(true));
    this.sleepers.visible = to > from + 0.002;
    const M = new THREE.Matrix4(), zero = V(0, 0, 0), one = V(1, 1, 1);
    this.sleeperAt.forEach((s, i) => {
      const on = s.u > from && s.u < to;
      M.compose(s.p, s.q, on ? one : zero);
      this.sleepers.setMatrixAt(i, M);
    });
    this.sleepers.instanceMatrix.needsUpdate = true;
    // the tram: out of the glass, round the console, into the aperture
    const ride = THREE.MathUtils.clamp((t - 7.0) / 9.6, 0, 1);
    const u = ride < 0.12 ? (ride / 0.12) ** 2 * 0.06 : 0.06 + (ride - 0.12) / 0.88 * 0.97;
    const onLine = t > 7.0 && t < 17.0;
    this.car.visible = onLine;
    if (onLine) {
      const uu = Math.min(u, 1.02);
      const p = this.path.getPointAt(Math.min(uu, 1));
      const tg = this.path.getTangentAt(Math.min(uu, 1));
      if (uu > 1) p.addScaledVector(tg, (uu - 1) * this.pathLength);
      this.car.position.copy(p);
      this.car.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(V(0, 0, 0), tg, V(0, 1, 0)));
      // only near the end of the line is the aperture's plane in the way (it is an infinite plane)
      const plane = uu > 0.93 ? this.P.plane(new THREE.Plane()) : null;
      this.carMats.forEach((m) => (m.userData.clip(0, plane), m.userData.clip(1, null)));
      this.focus.copy(p).applyMatrix4(h.machine.matrix);
    }
    this.P.set(pulse(t, 15.6, 16.2, 17.2, 17.8), time);
    this.Pin.set(pulse(t, 16.4, 16.9, 17.6, 18.1), time);
    // heard: the line laid, the tram's departure, its wheels over the joints, its return
    const c = (x) => this._prev < x && t >= x;
    if (c(4.6)) h.emit('cl-lay');
    if (c(7.0)) h.emit('cl-depart');
    if (onLine && Math.floor(t * 2.6) !== Math.floor(this._prev * 2.6)) h.emit('cl-joint');
    if (c(16.5)) h.emit('transit');
    if (c(17.2)) h.emit('cl-arrive');
    if (c(18.5)) h.emit('cl-retract');
    this._prev = t;
    const out = t > 4.5 && t < 22;
    return { focus: onLine ? this.focus : null, event: t > 8.5 && t < 15.5 ? this.focus : null, activity: out ? 0.7 : 0.35, crossing: (t > 4.5 && t < 7.6) || (t > 18.4 && t < 22), lamp: this.lamp };
  }
}
