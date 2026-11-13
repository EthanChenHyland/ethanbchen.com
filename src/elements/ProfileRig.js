import * as THREE from 'three';
import { BONES, BONE } from './ProfileBody.js';

// The figure's skeleton and its pose solver. Everything here is in human units in the figure's own
// frame (y up, ground at 0). The pose is a small set of parameters: the feet (planted, or swinging
// during a step), weight and pelvis, a twist distributed up the spine, head, and per-arm angles. Legs
// are solved by two-bone IK to the planted feet, so the body turns by stepping, never by spinning.

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = THREE.MathUtils.clamp;
const smooth = (x) => x * x * x * (x * (x * 6 - 15) + 10);
const D = THREE.MathUtils.degToRad;
const UP = new THREE.Vector3(0, 1, 0);

export const STANCE = { half: 0.088, freeFwd: 0.1, freeOut: 0.036, toe: D(7), freeToe: D(21) };

export function createSkeleton() {
  const bones = BONES.map((b) => {
    const bone = new THREE.Bone();
    bone.name = b.name;
    return bone;
  });
  BONES.forEach((b, i) => {
    if (b.parent) {
      const p = BONES[BONE[b.parent]];
      bones[BONE[b.parent]].add(bones[i]);
      bones[i].position.copy(b.pos).sub(p.pos);
    } else bones[i].position.copy(b.pos);
  });
  // inverses from the bind pose in the skeleton's own space (before it is attached anywhere)
  bones[0].updateMatrixWorld(true);
  return { bones, skeleton: new THREE.Skeleton(bones), root: bones[0] };
}

// FK angles; `ik` (a target in figure space, human units) with weight `ikK` overrides the shoulder and
// elbow so the hand can reach a real point (a chess piece, a key)
const armPose = () => ({ swing: 0.04, abd: 0.06, twist: 0, elbow: 0.14, foreTwist: 0.0, flex: 0.06, dev: 0, curl: 0.22, index: null, thumb: 0.15, clav: 0, ik: null, ikK: 0 });

/** Pose parameters, set each frame by the station, solved into the skeleton by `Rig.solve`. */
export function makePose() {
  return {
    pelvisY: 0, // extra lowering (breathing bob, knee softness)
    pelvisFwd: 0.004,
    spine: { yaw: 0, pitch: 0.01, roll: 0 },
    chest: { yaw: 0, pitch: -0.012, roll: 0 },
    neck: { yaw: 0, pitch: 0.02, roll: 0 },
    head: { yaw: 0, pitch: 0.02, roll: 0 },
    arm: { L: armPose(), R: armPose() },
  };
}

export class Rig {
  constructor(skel) {
    this.bones = skel.bones;
    this.pose = makePose();
    const p = (n) => BONES[BONE[n]].pos;
    this.L1 = p('shinL').distanceTo(p('thighL'));
    this.L2 = p('footL').distanceTo(p('shinL'));
    this.ankleH = p('footL').y;
    this.hipY = p('thighL').y - p('pelvis').y;
    this.hipX = p('thighL').x;
    // feet: ankle position on the ground plane (x, z) and yaw (heading of the foot)
    this.feet = {
      L: { x: STANCE.half, z: 0, yaw: STANCE.toe, lift: 0, pitch: 0 },
      R: { x: -STANCE.half, z: 0.0, yaw: -STANCE.toe, lift: 0, pitch: 0 },
    };
    this.weight = { side: 'R', amt: 1 }; // contrapposto: weight on the right leg
    this.wAmt = 1;
    this.shift = 0; // 0..1 extra weight over the stance foot during a step
    this.step = null;
    this.last = 'L';
    this.cool = 0;
    this.events = [];
    this.pelvisPos = new THREE.Vector3();
    this.bodyYaw = 0;
    this._q = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
    this._m = new THREE.Matrix4();
    this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this._e = new THREE.Euler();
    this.place(0, 0, 0);
  }

  /** Put the figure standing at (x, z) facing `yaw`, in its contrapposto stance, without stepping. */
  place(x, z, yaw) {
    const free = this.weight.side === 'R' ? 'L' : 'R';
    for (const side of ['L', 'R']) Object.assign(this.feet[side], this.#slot(side, side === free, x, z, yaw), { lift: 0, pitch: 0 });
    this.step = null;
    this.bodyYaw = yaw;
  }

  /** Where a foot stands for a body at (x, z) facing yaw: the free foot a little forward and out. */
  #slot(side, free, x, z, yaw) {
    const s = side === 'L' ? 1 : -1;
    const half = STANCE.half + (free ? STANCE.freeOut : 0);
    const fwd = free ? STANCE.freeFwd : -0.012;
    const lx = Math.cos(yaw), lz = -Math.sin(yaw); // the figure's left
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const toe = s * (free ? STANCE.freeToe : STANCE.toe);
    // `ox`, `oz`: this foot's offset from its plain stance slot, so the body centre can be recovered
    const ox = s * (half - STANCE.half) * lx + (fwd + 0.012) * fx, oz = s * (half - STANCE.half) * lz + (fwd + 0.012) * fz;
    return { x: x + s * half * lx + fwd * fx, z: z + s * half * lz + fwd * fz, yaw: yaw + toe, toe, ox, oz };
  }

  /** The body's heading from its feet (toe-out removed) and where it stands. */
  stance() {
    const { L, R } = this.feet;
    // each foot's own toe-out (recorded when it was placed) is removed before averaging
    const yl = L.yaw - (L.toe ?? STANCE.toe), yr = R.yaw - (R.toe ?? -STANCE.toe);
    const yaw = Math.atan2(Math.sin(yl) + Math.sin(yr), Math.cos(yl) + Math.cos(yr));
    // the centre the slots were placed round (each foot's contrapposto offset removed)
    return { yaw, x: (L.x - (L.ox ?? 0) + R.x - (R.ox ?? 0)) / 2, z: (L.z - (L.oz ?? 0) + R.z - (R.oz ?? 0)) / 2 };
  }

  /**
   * Ask the feet to bring the body to face `yaw` standing near (x, z). A step starts only when the
   * twist or distance is beyond `tol` (radians) / `posTol`; `pace` > 1 steps faster (a flight).
   */
  want(yaw, x, z, { tol = D(52), posTol = 0.07, pace = 1, settle = D(14), open = D(72), close = D(48) } = {}) {
    this.goal = { yaw, x, z, tol, posTol, pace, settle, open, close };
  }

  #plan() {
    const g = this.goal;
    if (!g || this.step || this.cool > 0) return;
    const st = this.stance();
    const eYaw = wrap(g.yaw - st.yaw);
    const dx = g.x - st.x, dz = g.z - st.z, ePos = Math.hypot(dx, dz);
    // a sequence, once begun, continues until the body is close (`settle`); it begins only past `tol`
    const go = this.seq ? Math.abs(eYaw) > g.settle || ePos > 0.035 : Math.abs(eYaw) > g.tol || ePos > g.posTol;
    if (!go) {
      if (this.seq) (this.seq = false), (this.seqSteps = 0);
      return;
    }
    this.seq = true;
    // which foot: the one on the side of the turn opens first, then they alternate
    const turnSide = eYaw > 0 ? 'L' : 'R';
    let side;
    const firstOfSeq = !this.seqSteps;
    this.seqSteps = (this.seqSteps ?? 0) + 1;
    if (Math.abs(eYaw) > D(10)) side = this.last === turnSide ? (turnSide === 'L' ? 'R' : 'L') : turnSide;
    else if (firstOfSeq) {
      // moving: lead with the foot on the side of travel, then the feet alternate
      const lx = Math.cos(st.yaw), lz = -Math.sin(st.yaw);
      const lat = dx * lx + dz * lz;
      side = Math.abs(lat) > 0.02 ? (lat > 0 ? 'L' : 'R') : this.last === 'L' ? 'R' : 'L';
    } else side = this.last === 'L' ? 'R' : 'L';
    const stanceSide = side === 'L' ? 'R' : 'L';
    // the heading this step reaches (an opening foot turns up to 70°, a closing one completes)
    const opening = side === turnSide && Math.abs(eYaw) > D(10);
    // a pivot: the opening foot turns furthest, the closing foot completes (a flight allows more)
    const lim = opening ? g.open : g.close;
    const turn = clamp(eYaw, -lim, lim);
    const nyaw = st.yaw + turn;
    const k = Math.min(1, 0.2 / Math.max(ePos, 1e-6));
    const nx = st.x + dx * k, nz = st.z + dz * k;
    // the closing foot lands free (contrapposto); an opening foot lands in a plain stance slot
    const finalStep = Math.abs(eYaw - turn) < g.settle && ePos * (1 - k) < 0.035;
    const free = !opening || finalStep;
    let tgt = this.#slot(side, free, nx, nz, nyaw);
    // keep the stride natural: never more than 0.42 from the stance foot, never crossing it
    const s = this.feet[stanceSide];
    const ddx = tgt.x - s.x, ddz = tgt.z - s.z, dd = Math.hypot(ddx, ddz);
    if (dd > 0.42) (tgt.x = s.x + (ddx * 0.42) / dd), (tgt.z = s.z + (ddz * 0.42) / dd);
    if (dd < 0.13) {
      const lx = Math.cos(nyaw) * (side === 'L' ? 1 : -1), lz = -Math.sin(nyaw) * (side === 'L' ? 1 : -1);
      (tgt.x = s.x + lx * 0.15), (tgt.z = s.z + lz * 0.15);
    }
    const f = this.feet[side];
    const dist = Math.hypot(tgt.x - f.x, tgt.z - f.z), dyaw = Math.abs(wrap(tgt.yaw - f.yaw));
    const pace = g.pace;
    this.step = {
      side,
      stanceSide,
      from: { x: f.x, z: f.z, yaw: f.yaw, toe: f.toe, ox: f.ox, oz: f.oz },
      to: tgt,
      t: 0,
      shift: 0.3 / pace,
      swing: (0.36 + 0.55 * dist + 0.18 * dyaw) / pace,
      settle: 0.16 / pace,
      height: 0.035 + 0.09 * Math.min(dist, 0.3),
      final: finalStep,
    };
  }

  update(dt) {
    this._dt = dt;
    this.cool = Math.max(0, this.cool - dt);
    this.#plan();
    const st = this.step;
    // weight: over the stance foot during a step, back to the rest leg after
    let wSide = this.weight.side, wAmt = 1;
    if (st) {
      st.t += dt;
      const { shift, swing, settle } = st;
      wSide = st.stanceSide;
      if (st.t < shift) {
        this.shift = smooth(st.t / shift);
      } else if (st.t < shift + swing) {
        this.shift = 1;
        const u = (st.t - shift) / swing, e = smooth(u);
        const f = this.feet[st.side];
        f.x = THREE.MathUtils.lerp(st.from.x, st.to.x, e);
        f.z = THREE.MathUtils.lerp(st.from.z, st.to.z, e);
        f.yaw = st.from.yaw + wrap(st.to.yaw - st.from.yaw) * e;
        f.toe = THREE.MathUtils.lerp(st.from.toe ?? 0, st.to.toe, e);
        f.ox = THREE.MathUtils.lerp(st.from.ox ?? 0, st.to.ox, e);
        f.oz = THREE.MathUtils.lerp(st.from.oz ?? 0, st.to.oz, e);
        f.lift = Math.sin(Math.PI * Math.min(1, u * 1.08)) * st.height * (u < 0.93 ? 1 : 1);
        f.pitch = -0.32 * Math.sin(Math.PI * u) + 0.12 * Math.max(0, 1 - u * 4);
        if (!st.planted && u > 0.97) {
          st.planted = true;
          this.events.push({ type: 'step', side: st.side, w: Math.min(1, 0.4 + st.height * 6) });
        }
      } else {
        const f = this.feet[st.side];
        Object.assign(f, { x: st.to.x, z: st.to.z, yaw: st.to.yaw, toe: st.to.toe, ox: st.to.ox, oz: st.to.oz, lift: 0, pitch: 0 });
        // the weight passes to the planted foot, which now bears it (the other becomes free)
        this.shift = 1 - smooth(Math.min(1, (st.t - shift - swing) / settle));
        if (st.t >= shift + swing + settle) {
          this.last = st.side;
          // the foot that just moved is the free one, unless it was an opening step
          this.weight.side = st.final ? st.stanceSide : st.side;
          this.step = null;
          this.cool = 0.05;
        }
      }
    } else this.shift = Math.max(0, this.shift - dt * 3);
    this.wSide = wSide;
    this.wAmt = wAmt;
    // the weight is a spring (velocity-continuous): an activity can bias it toward one leg
    const goalS = clamp((wSide === 'R' ? 1 : -1) * (this.relax ?? 1) + (this.wBias ?? 0), -1, 1);
    if (this.wS === undefined) (this.wS = goalS), (this._wSV = 0);
    const ww = st ? 7 : 2.6, dW = Math.min(dt, 1 / 30);
    this._wSV += (ww * ww * (goalS - this.wS) - 2 * ww * this._wSV) * dW;
    this.wS += this._wSV * dW;
  }

  /** Solve the pose into the bones. `breath` (0..1) and `sway` (lateral drift) are small extras. */
  solve() {
    const P = this.pose, B = this.bones, b = (n) => B[BONE[n]];
    const [q0, q1, q2, q3] = this._q;
    const [v0, v1, v2, v3, v4] = this._v;
    const { L, R } = this.feet;
    const st = this.stance();
    this.bodyYaw = st.yaw;
    // pelvis: between the feet, drawn over the weight-bearing foot
    // the weight, continuous (-1 left leg .. +1 right leg): the pelvis rides over the bearing foot
    const wS = this.wS ?? 1;
    const u = (wS + 1) / 2;
    const wfx = THREE.MathUtils.lerp(L.x, R.x, u), wfz = THREE.MathUtils.lerp(L.z, R.z, u);
    // how far the pelvis rides over the bearing foot: a spring, never a switch (a step beginning or
    // ending used to jump the pelvis sideways in one frame)
    const overGoal = (this.step ? 0 : 0.5) * Math.abs(wS) + 0.58 * this.shift;
    if (this._over === undefined) (this._over = overGoal), (this._overV = 0);
    {
      const wO = 9, dO = Math.min(this._dt ?? 1 / 60, 1 / 30);
      this._overV += (wO * wO * (overGoal - this._over) - 2 * wO * this._overV) * dO;
      this._over += this._overV * dO;
    }
    const over = this._over;
    const cx = THREE.MathUtils.lerp(st.x, wfx, over), cz = THREE.MathUtils.lerp(st.z, wfz, over);
    const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
    const pelvis = b('pelvis');
    const contra = 1;
    // contrapposto: the free hip drops, the pelvis turns a little toward the free leg; the shoulders
    // answer the other way (see the spine and chest below)
    const pelvisYaw = st.yaw + (P.pelvisYawExtra ?? 0) + wS * D(7);
    const roll = -wS * D(7);
    this.contraYaw = wS * D(7);
    pelvis.quaternion.setFromEuler(this._e.set(D(1.5) + (P.pelvisPitch ?? 0), pelvisYaw, roll, 'YXZ'));
    // height: the legs must reach both ankles; soft knees otherwise
    const base = BONES[BONE.pelvis].pos.y - 0.012 - P.pelvisY;
    let py = base;
    for (const side of ['L', 'R']) {
      const f = this.feet[side];
      const s = side === 'L' ? 1 : -1;
      // the hip's offset rotated with the pelvis (approximately: yaw and roll)
      v0.set(s * this.hipX, this.hipY, 0).applyQuaternion(pelvis.quaternion);
      const hx = cx + P.pelvisFwd * fx + v0.x, hz = cz + P.pelvisFwd * fz + v0.z;
      const ay = this.ankleH + f.lift;
      const dxz = Math.hypot(f.x - hx, f.z - hz);
      const reach = this.L1 + this.L2 - 0.006;
      const maxY = ay + Math.sqrt(Math.max(0, reach * reach - dxz * dxz)) - v0.y;
      if (!(f.lift > 0)) py = Math.min(py, maxY);
    }
    pelvis.position.set(cx + P.pelvisFwd * fx, py, cz + P.pelvisFwd * fz);
    this.pelvisPos.copy(pelvis.position);
    // spine, chest, neck, head: local yaw/pitch/roll (shoulders counter the pelvis tilt)
    const setL = (n, r, extraRoll = 0) => b(n).quaternion.setFromEuler(this._e.set(r.pitch, r.yaw, r.roll + extraRoll, 'YXZ'));
    const cy = this.contraYaw ?? 0;
    b('spine').quaternion.setFromEuler(this._e.set(P.spine.pitch, P.spine.yaw - cy * 0.9, P.spine.roll - roll * 0.5, 'YXZ'));
    b('chest').quaternion.setFromEuler(this._e.set(P.chest.pitch, P.chest.yaw - cy * 0.9, P.chest.roll - roll * 0.8 * contra, 'YXZ'));
    setL('neck', P.neck);
    setL('head', P.head, roll * 0.2);
    // arms
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1, a = P.arm[side];
      b('clav' + side).quaternion.setFromEuler(this._e.set(0, 0, s * a.clav, 'XYZ'));
      b('upperArm' + side).quaternion.setFromEuler(this._e.set(-a.swing, s * a.twist, s * a.abd, 'ZXY'));
      b('foreArm' + side).quaternion.setFromEuler(this._e.set(-a.elbow, s * a.foreTwist, 0, 'XYZ'));
      b('hand' + side).quaternion.setFromEuler(this._e.set(a.dev, 0, -s * a.flex, 'XYZ'));
      b('fingers' + side).quaternion.setFromEuler(this._e.set(0, 0, -s * a.curl, 'XYZ'));
      b('index' + side).quaternion.setFromEuler(this._e.set(0, 0, -s * (a.index ?? a.curl), 'XYZ'));
      // the distal knuckle follows the curl unless a grip sets it (a rounder, more readable hand)
      b('tips' + side).quaternion.setFromEuler(this._e.set(0, 0, -s * (a.tip ?? a.curl * 0.8), 'XYZ'));
      b('indexTip' + side).quaternion.setFromEuler(this._e.set(0, 0, -s * (a.tip ?? (a.index ?? a.curl) * 0.8), 'XYZ'));
      b('thumb' + side).quaternion.setFromEuler(this._e.set(-a.thumb * 0.4, 0, -s * a.thumb, 'XYZ'));
    }
    // legs: two-bone IK from the hips to the planted (or swinging) ankles, knees toward the toes
    // (the root bone is the identity, so the pelvis's local rotation is its rotation in figure space)
    q0.copy(pelvis.quaternion);
    for (const side of ['L', 'R']) {
      const f = this.feet[side];
      const thigh = b('thigh' + side), shin = b('shin' + side), foot = b('foot' + side);
      const hip = v0.copy(thigh.position).applyQuaternion(q0).add(pelvis.position);
      const ankle = v1.set(f.x, this.ankleH + f.lift, f.z);
      const toA = v2.subVectors(ankle, hip);
      let d = toA.length();
      d = clamp(d, Math.abs(this.L1 - this.L2) + 1e-3, this.L1 + this.L2 - 1e-4);
      toA.normalize();
      const pole = v3.set(Math.sin(f.yaw), 0, Math.cos(f.yaw));
      pole.addScaledVector(toA, -pole.dot(toA)).normalize();
      const a = (d * d + this.L1 * this.L1 - this.L2 * this.L2) / (2 * d);
      const h = Math.sqrt(Math.max(0, this.L1 * this.L1 - a * a));
      const knee = v4.copy(hip).addScaledVector(toA, a).addScaledVector(pole, h);
      const ankleP = v1.copy(hip).addScaledVector(toA, d);
      // world rotations from frames: bind (down, +z) → (bone direction, pole)
      const qThigh = frameQuat(q1, v2.subVectors(knee, hip), pole);
      const qShin = frameQuat(q2, v2.subVectors(ankleP, knee), pole);
      thigh.quaternion.copy(q0).invert().multiply(qThigh);
      shin.quaternion.copy(qThigh).invert().multiply(qShin);
      // the foot: its own yaw and pitch, in world, relative to the shin
      q3.setFromEuler(this._e.set(f.pitch, f.yaw, 0, 'YXZ'));
      foot.quaternion.copy(qShin).invert().multiply(q3);
    }
    this.bones[0].updateMatrixWorld(true);
    for (const side of ['L', 'R']) {
      if (P.arm[side].ik && P.arm[side].ikK > 0.001) this.#armIK(side, P.arm[side]);
      else if (this._phi) this._phi[side] = null; // disengaged: the next reach takes no twist from the last
    }
  }

  /**
   * Two-bone IK for an arm toward `a.ik` (figure space), blended by `a.ikK`. Four separate intents:
   *   ik      the wrist's position
   *   pole    where the elbow points (body frame, x mirrored per side)
   *   palm    the palm's normal (body frame, x mirrored; e.g. [0,-1,0] palm down)
   *   fingers the fingers' direction (body frame, x mirrored)
   * The upper arm's roll follows the elbow's hinge plane (never a fixed forward, which degenerates
   * when the forearm points forward); the forearm takes the pro/supination (±95° about neutral,
   * thumb up); the wrist takes only what is left, within its range (flexion, deviation).
   */
  #armIK(side, a) {
    const B = this.bones, b = (n) => B[BONE[n]];
    const s = side === 'L' ? 1 : -1;
    const up = b('upperArm' + side), fore = b('foreArm' + side), clav = b('clav' + side), hand = b('hand' + side);
    const toRoot = this._m.copy(B[0].matrixWorld).invert();
    const sh = this._v[0].setFromMatrixPosition(up.matrixWorld).applyMatrix4(toRoot);
    const L1 = BONES[BONE['foreArm' + side]].pos.distanceTo(BONES[BONE['upperArm' + side]].pos);
    const L2 = BONES[BONE['hand' + side]].pos.distanceTo(BONES[BONE['foreArm' + side]].pos);
    const t = this._v[1].copy(a.ik).sub(sh);
    // never fully straight (no hyperextension): a few degrees of bend always remain
    let d = clamp(t.length(), 0.05, (L1 + L2) * 0.985);
    t.normalize();
    const yaw = this.bodyYaw;
    const bodyVec = (v, out) => out.set(s * v[0], v[1], v[2]).applyAxisAngle(UP, yaw);
    const pole = a.pole ? bodyVec(a.pole, this._v[2]) : bodyVec([0.55, -1, -0.25], this._v[2]);
    pole.addScaledVector(t, -pole.dot(t)).normalize();
    const ca = (d * d + L1 * L1 - L2 * L2) / (2 * d);
    const h = Math.sqrt(Math.max(0, L1 * L1 - ca * ca));
    const elbow = this._v[3].copy(sh).addScaledVector(t, ca).addScaledVector(pole, h);
    const wrist = this._v[4].copy(sh).addScaledVector(t, d);
    const dUp = _a.subVectors(elbow, sh).normalize();
    const dFore = _b.subVectors(wrist, elbow).normalize();
    // the upper arm: the forearm folds toward its +z (FK convention), so +z is the forearm's
    // component across the upper arm; the elbow's own direction steadies it when nearly straight
    const zUp = _c.copy(dFore).addScaledVector(dUp, -dFore.dot(dUp)).addScaledVector(pole, -0.08);
    // each bone's actual bind direction (the bind arm is slightly abducted: assuming straight down
    // left every reach ~7 cm short and outward, e.g. the clarinet's right hand beside its joint)
    const bUp = _bu.subVectors(BONES[BONE['foreArm' + side]].pos, BONES[BONE['upperArm' + side]].pos);
    const bFore = _bf.subVectors(BONES[BONE['hand' + side]].pos, BONES[BONE['foreArm' + side]].pos);
    const qUp = frameQuatB(_q[0], dUp, zUp, bUp);
    // the forearm, untwisted: the same hinge axis as the upper arm (palm medial, thumb up)
    const xHinge = _d.set(1, 0, 0).applyQuaternion(qUp);
    const zF = _e2.crossVectors(xHinge, _f.copy(dFore).negate());
    const qFore = frameQuatB(_q[1], dFore, zF, bFore);
    let qHand = null;
    if (a.palm) {
      // pro/supination: turn the forearm so its palm side faces the wanted palm direction
      const n = (a.abs ? _g.fromArray(a.palm) : bodyVec(a.palm, _g)).normalize();
      const nP = _h.copy(n).addScaledVector(dFore, -n.dot(dFore));
      if (nP.lengthSq() > 1e-6) {
        nP.normalize();
        const cur = _i.copy(xHinge).multiplyScalar(-s);
        let phi = Math.atan2(_j.crossVectors(cur, nP).dot(dFore), cur.dot(nP));
        // continuity: never jump through ±180° between frames (no branch flip); stay in range. A new
        // reach starts from its own twist, and the twist can only ever turn at a limited rate
        this._phi ??= { L: null, R: null };
        const prevPhi = this._phi[side];
        phi = clamp(prevPhi === null ? phi : prevPhi + clamp(wrap(phi - prevPhi), -0.3, 0.3), -1.65, 1.65);
        this._phi[side] = phi;
        qFore.premultiply(_q[2].setFromAxisAngle(dFore, phi));
      }
      // the hand: palm normal and finger direction, as a frame (x = -s·palm, y = -fingers)
      // fingers: an explicit direction, or onward from the forearm, tipped down by `fdown`
      const f = a.fingers ? (a.abs ? _k.fromArray(a.fingers) : bodyVec(a.fingers, _k)) : _k.copy(dFore).add(_l.set(0, -(a.fdown ?? 0), 0));
      f.addScaledVector(n, -f.dot(n)).normalize();
      const x = _l.copy(n).multiplyScalar(-s), y = _m2.copy(f).negate(), z = _n.crossVectors(x, y);
      _M.makeBasis(x, y, z);
      qHand = _q[3].setFromRotationMatrix(_M);
    }
    const qClav = new THREE.Quaternion();
    clav.matrixWorld.decompose(this._v[0], qClav, this._v[1]);
    const qRoot = new THREE.Quaternion();
    B[0].matrixWorld.decompose(this._v[0], qRoot, this._v[1]);
    qClav.premultiply(qRoot.invert());
    const lUp = qClav.clone().invert().multiply(qUp);
    const lFore = qUp.clone().invert().multiply(qFore);
    up.quaternion.slerp(lUp, a.ikK);
    fore.quaternion.slerp(lFore, a.ikK);
    if (qHand) {
      // what is left for the wrist, inside its range: flexion/extension, a little deviation, no twist
      const lHand = qFore.clone().invert().multiply(qHand);
      const e = this._e.setFromQuaternion(lHand, 'XYZ');
      e.set(clamp(e.x, -0.5, 0.5), clamp(e.y, -0.25, 0.25), clamp(e.z, -1.05, 1.05), 'XYZ');
      hand.quaternion.slerp(_q[4].setFromEuler(e), a.ikK);
    }
    up.updateMatrixWorld(true);
  }

  /** Where a bone is and which way the palm faces (root space), for audits. */
  handFrame(side) {
    const B = this.bones, h = B[BONE['hand' + side]], s = side === 'L' ? 1 : -1;
    const toRoot = this._m.copy(B[0].matrixWorld).invert();
    const m = new THREE.Matrix4().multiplyMatrices(toRoot, h.matrixWorld);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    return {
      pos: new THREE.Vector3().setFromMatrixPosition(m),
      palm: new THREE.Vector3(-s, 0, 0).applyQuaternion(q),
      fingers: new THREE.Vector3(0, -1, 0).applyQuaternion(q),
      thumb: new THREE.Vector3(0, 0, 1).applyQuaternion(q),
    };
  }
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e2 = new THREE.Vector3(), _f = new THREE.Vector3(), _g = new THREE.Vector3(), _h = new THREE.Vector3(), _i = new THREE.Vector3(), _j = new THREE.Vector3(), _k = new THREE.Vector3(), _l = new THREE.Vector3(), _m2 = new THREE.Vector3(), _n = new THREE.Vector3();
const _q = [0, 1, 2, 3, 4].map(() => new THREE.Quaternion());
const _M = new THREE.Matrix4();
const _fx = new THREE.Vector3(), _fy = new THREE.Vector3(), _fz = new THREE.Vector3(), _fm = new THREE.Matrix4();
const _bu = new THREE.Vector3(), _bf = new THREE.Vector3(), _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion();
/** Like frameQuat, but for a bone whose bind direction is `bind` (not exactly straight down): the
 *  rotation that carries the bind frame (bind direction, forward) onto (dir, fwd). */
function frameQuatB(out, dir, fwd, bind) {
  const yb = _fy.copy(bind).normalize().negate();
  const zb = _fz.set(0, 0, 1).addScaledVector(yb, -yb.z).normalize();
  const xb = _fx.crossVectors(yb, zb);
  _bm.makeBasis(xb, yb, zb);
  _bq.setFromRotationMatrix(_bm).invert(); // bind frame -> canonical
  frameQuat(out, dir, fwd); // canonical (straight down) -> target
  return out.multiply(_bq);
}
/** The world rotation taking a bind bone (pointing down, forward +z) to `dir` with forward `fwd`. */
function frameQuat(out, dir, fwd) {
  _fy.copy(dir).normalize().negate(); // bind bones point down: their "up" axis is -dir
  _fz.copy(fwd).addScaledVector(_fy, -fwd.dot(_fy)).normalize();
  _fx.crossVectors(_fy, _fz);
  _fm.makeBasis(_fx, _fy, _fz);
  return out.setFromRotationMatrix(_fm);
}

export { wrap, smooth, D, UP };
