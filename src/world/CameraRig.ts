// Adapted from 4elements / apps/opus-5.5/src/core/CameraRig.js
// Copyright (c) 2026 ElementBench contributors. MIT License; full notice in THIRD_PARTY_NOTICES.md.
// Changes: TypeScript, a configurable pivot for the cylindrical blend, azimuth limits for a desk
// seen from the front, an idle sway instead of a full auto-orbit, and instant cuts for reduced motion.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface Tween {
  p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3;
  k: number; duration: number; arc: number; onDone?: () => void;
}

export interface View { pos: THREE.Vector3; target: THREE.Vector3 }

/** OrbitControls plus cinematic fly-to transitions between views. */
export class CameraRig {
  readonly controls: OrbitControls;
  private tween: Tween | null = null;
  /** centre of the cylindrical blend: flights sweep around the desk instead of cutting through it */
  pivot = new THREE.Vector3(0.4, 0, -0.3);
  private sway = 0;
  private swayAmp = 0;
  private home = 0;

  constructor(private camera: THREE.PerspectiveCamera, dom: HTMLElement, interactive: boolean) {
    const c = (this.controls = new OrbitControls(camera, dom));
    c.enableDamping = true;
    c.dampingFactor = 0.06;
    c.rotateSpeed = 0.45;
    c.enableZoom = false; // the wheel belongs to the page scroll
    c.enablePan = false;
    c.enableRotate = interactive;
    c.minPolarAngle = 0.55;
    c.maxPolarAngle = 1.38;
  }

  /** keep the orbit in front of the desk, around the current view's azimuth */
  limitAround(range: number) {
    const off = this.camera.position.clone().sub(this.controls.target);
    const az = Math.atan2(off.x, off.z);
    this.home = az;
    this.controls.minAzimuthAngle = az - range;
    this.controls.maxAzimuthAngle = az + range;
  }

  jumpTo(view: View) {
    this.tween = null;
    this.camera.position.copy(view.pos);
    this.controls.target.copy(view.target);
    this.controls.enabled = true;
    this.controls.update();
  }

  private clearInertia() {
    // OrbitControls keeps its pending deltas in private fields; reset them so a flight starts clean
    const c = this.controls as unknown as { _sphericalDelta?: THREE.Spherical; _panOffset?: THREE.Vector3; _scale?: number };
    c._sphericalDelta?.set(0, 0, 0);
    c._panOffset?.set(0, 0, 0);
    if (c._scale !== undefined) c._scale = 1;
  }

  flyTo(view: View, { duration = 2.2, arc = 0.6, onDone }: { duration?: number; arc?: number; onDone?: () => void } = {}) {
    this.clearInertia();
    this.controls.minAzimuthAngle = -Infinity;
    this.controls.maxAzimuthAngle = Infinity;
    this.tween = {
      p0: this.camera.position.clone(), t0: this.controls.target.clone(),
      p1: view.pos.clone(), t1: view.target.clone(),
      k: 0, duration, arc, onDone,
    };
    this.controls.enabled = false;
  }

  get busy() {
    return this.tween !== null;
  }

  /** stop a flight where it is and hand control back */
  cancel() {
    if (!this.tween) return;
    const done = this.tween.onDone;
    this.tween = null;
    done?.();
    this.clearInertia();
    this.controls.enabled = true;
    this.controls.update();
  }

  /** gentle idle drift: the camera breathes left and right instead of circling the desk */
  setSway(amount: number) {
    this.swayAmp = amount;
  }

  update(dt: number) {
    const tw = this.tween;
    if (tw) {
      tw.k = Math.min(tw.k + dt / tw.duration, 1);
      const e = easeInOutCubic(tw.k);
      const P = this.pivot;
      const a0 = Math.atan2(tw.p0.x - P.x, tw.p0.z - P.z), a1 = Math.atan2(tw.p1.x - P.x, tw.p1.z - P.z);
      let da = a1 - a0;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      const r0 = Math.hypot(tw.p0.x - P.x, tw.p0.z - P.z), r1 = Math.hypot(tw.p1.x - P.x, tw.p1.z - P.z);
      if (r0 > 1 && r1 > 1) {
        const a = a0 + da * e;
        const r = THREE.MathUtils.lerp(r0, r1, e);
        this.camera.position.set(P.x + Math.sin(a) * r, THREE.MathUtils.lerp(tw.p0.y, tw.p1.y, e), P.z + Math.cos(a) * r);
      } else {
        this.camera.position.lerpVectors(tw.p0, tw.p1, e);
      }
      this.camera.position.y += Math.sin(e * Math.PI) * tw.arc;
      this.controls.target.lerpVectors(tw.t0, tw.t1, e);
      this.camera.lookAt(this.controls.target);
      if (tw.k >= 1) {
        this.tween = null;
        tw.onDone?.();
        this.clearInertia();
        this.controls.enabled = true;
        this.controls.update();
      }
      return;
    }
    if (this.swayAmp > 0) {
      this.sway += dt;
      const c = this.controls;
      const want = this.home + Math.sin(this.sway * 0.16) * this.swayAmp;
      const off = this.camera.position.clone().sub(c.target);
      const az = Math.atan2(off.x, off.z);
      const step = (want - az) * Math.min(1, dt * 0.8);
      off.applyAxisAngle(THREE.Object3D.DEFAULT_UP, step);
      this.camera.position.copy(c.target).add(off);
    }
    this.controls.update(dt);
  }
}
