import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** OrbitControls plus smooth cinematic fly-to transitions between views. */
export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, dom);
    const c = this.controls;
    c.enableDamping = true;
    c.dampingFactor = 0.06;
    c.rotateSpeed = 0.55;
    c.zoomSpeed = 0.7;
    c.enablePan = false;
    c.minPolarAngle = 0.15;
    c.maxPolarAngle = Math.PI * 0.485;
    c.autoRotateSpeed = 0.35;
    this.tween = null;
    this.limits = { overview: [7, 34], focus: [3.2, 14] };
    this.setLimits('overview');
  }

  setLimits(mode) {
    const [min, max] = this.limits[mode];
    this.controls.minDistance = min;
    this.controls.maxDistance = max;
  }

  jumpTo(pos, target) {
    this.tween = null;
    this.camera.position.copy(pos);
    this.controls.target.copy(target);
    this.controls.enabled = true;
    this.controls.update();
  }

  #clearInertia() {
    const c = this.controls;
    c._sphericalDelta?.set(0, 0, 0);
    c._panOffset?.set(0, 0, 0);
    if (c._scale !== undefined) c._scale = 1;
  }

  flyTo(pos, target, { duration = 2.2, arc = 1.5, onDone } = {}) {
    this.#clearInertia();
    this.tween = {
      p0: this.camera.position.clone(),
      t0: this.controls.target.clone(),
      p1: pos.clone(),
      t1: target.clone(),
      k: 0,
      duration,
      arc,
      onDone,
    };
    this.controls.enabled = false;
    this.controls.autoRotate = false;
  }

  get busy() {
    return this.tween !== null;
  }

  /** Stop a flight where it is and hand control back to the user. */
  cancel() {
    if (!this.tween) return;
    const done = this.tween.onDone;
    this.tween = null;
    done?.();
    this.#clearInertia();
    this.controls.enabled = true;
    this.controls.update();
  }

  /**
   * Idle recomposition around the current target, in spherical terms only: azimuth and target
   * are never touched, so the orbit keeps its own constant speed.
   *  - A view higher than `trigger` drifts down to `elevation`, and a distance well outside a dead
   *    zone around `radius` drifts back to it. Each correction latches when it starts and runs to
   *    its goal; both are rate-limited (about the orbit's own pace) and slow near the goal.
   *  - Once nothing is correcting, a very slow breathing in elevation and distance fades in around
   *    wherever the camera sits (two unrelated slow periods each, so it never reads as a loop).
   */
  recompose(dt, { trigger, elevation, radius, deadZone, elevRate, radiusRate, breathElev, breathRadius }) {
    const r = (this._recomp ??= { elev: false, dist: false, ve: 0, vr: 0, w: 0, t: this._breathT ?? 0, be: 0, br: 0 });
    const c = this.controls;
    this._off ??= new THREE.Vector3();
    this._sph ??= new THREE.Spherical();
    this._sph.setFromVector3(this._off.subVectors(this.camera.position, c.target));
    const sp = this._sph;
    const elevNow = Math.PI / 2 - sp.phi;
    if (elevNow > trigger) r.elev = true;
    if (Math.abs(Math.log(sp.radius / radius)) > deadZone) r.dist = true;

    // recovery: speed eases in and out; it is proportional to the error near the goal and capped
    const ease = 1 - Math.exp(-dt / 1.5);
    const errE = r.elev ? elevNow - elevation : 0;
    r.ve += (Math.sign(errE) * Math.min(elevRate, Math.abs(errE) * 0.35) - r.ve) * ease;
    sp.phi += r.ve * dt;
    if (r.elev && Math.abs(errE) < 0.003) r.elev = false;
    const errR = r.dist ? Math.log(radius / sp.radius) : 0;
    r.vr += (Math.sign(errR) * Math.min(radiusRate, Math.abs(errR) * 0.3) - r.vr) * ease;
    sp.radius *= Math.exp(r.vr * dt);
    if (r.dist && Math.abs(errR) < 0.003) r.dist = false;

    // breathing: in only while settled; applied as the change in its offset, so it never jumps
    const settled = !r.elev && !r.dist && Math.abs(r.ve) < 0.002 && Math.abs(r.vr) < 0.002;
    r.w += ((settled ? 1 : 0) - r.w) * (1 - Math.exp(-dt / 4));
    r.t += dt;
    this._breathT = r.t;
    const tau = Math.PI * 2;
    const be = r.w * breathElev * (0.65 * Math.sin((tau * r.t) / 27) + 0.35 * Math.sin((tau * r.t) / 41 + 1.3));
    const br = r.w * breathRadius * (0.6 * Math.sin((tau * r.t) / 33 + 2.0) + 0.4 * Math.sin((tau * r.t) / 52 + 0.4));
    // breathing never lifts the view toward the overhead trigger
    const headroom = trigger - 0.01 - (Math.PI / 2 - sp.phi);
    sp.phi -= Math.min(be - r.be, Math.max(headroom, 0));
    sp.radius *= Math.exp(br - r.br);
    r.be = be;
    r.br = br;

    sp.makeSafe();
    this.camera.position.copy(c.target).add(this._off.setFromSpherical(sp));
  }

  /** Stop any idle recomposition where it is (the user is back in control, or the view changed). */
  endRecompose() {
    this._recomp = null;
  }

  update(dt) {
    const tw = this.tween;
    if (tw) {
      tw.k = Math.min(tw.k + dt / tw.duration, 1);
      const e = easeInOutCubic(tw.k);
      // blend in cylindrical coordinates around the sanctum centre for a sweeping move
      const a0 = Math.atan2(tw.p0.x, tw.p0.z), a1 = Math.atan2(tw.p1.x, tw.p1.z);
      let da = a1 - a0;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      const r0 = Math.hypot(tw.p0.x, tw.p0.z), r1 = Math.hypot(tw.p1.x, tw.p1.z);
      const useCyl = r0 > 2 && r1 > 2;
      if (useCyl) {
        const a = a0 + da * e;
        const r = THREE.MathUtils.lerp(r0, r1, e);
        this.camera.position.set(Math.sin(a) * r, THREE.MathUtils.lerp(tw.p0.y, tw.p1.y, e), Math.cos(a) * r);
      } else {
        this.camera.position.lerpVectors(tw.p0, tw.p1, e);
      }
      this.camera.position.y += Math.sin(e * Math.PI) * tw.arc;
      this.controls.target.lerpVectors(tw.t0, tw.t1, e);
      this.camera.lookAt(this.controls.target);
      if (tw.k >= 1) {
        this.tween = null;
        tw.onDone?.(); // may change zoom limits — must run before the controls clamp
        this.#clearInertia();
        this.controls.enabled = true;
        this.controls.update();
      }
      return;
    }
    this.controls.update(dt);
  }
}
