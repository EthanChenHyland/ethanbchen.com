import * as THREE from 'three';

// The orbital ecosystem: a living field of ideas, identities, interests and dimensional possibilities
// with the person as its centre of gravity. Original Profile objects (not logos) in several families,
// each one instanced draw:
//   memory nodes (linked pearl points) · decision shards (warm fragments) · thought frames (nested
//   wire frames) · phase fragments (slabs of the person's own geometry) · information capsules (with
//   trails) · harmonic loops (thin rings) · signal knots · large temporary structures (giant ellipses,
//   halo arcs)
// Every satellite has an ORBIT (anchor on the body, radius, eccentricity, plane, speed, phase); the
// orbit's targets change over time (new radius, plane, speed, direction, anchor) and the actual
// parameters follow on springs, so every lane change, plane change, acceleration or reversal is a
// continuous path. Satellites interact (crossings pulse, packets pass, clusters form and break), the
// station's states reshape the whole field (hover tightens and brightens it, a focus flight organises
// it, re-engagement collapses and re-forms it, the rare event throws it wide), and activities launch
// objects into it. All positions are station-local.

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp, smooth = THREE.MathUtils.smoothstep;
const rnd = (s) => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const ANCHORS = ['head', 'chest', 'pelvis', 'handL', 'handR', 'stage', 'spine', 'far'];
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

// family: count, geometry, base colour, size, radius band, speed band, anchors, trail
// readability reset: the ecosystem keeps only response capsules (launched by hover transfers,
// activities and the AI exchange, never idling), one quiet stage ring and its signal bead. The AI
// models themselves carry the orbit (ProfileModels); everything else that idled here was clutter.
const FAMILIES = [
  { id: 'capsule', n: 8, geo: () => new THREE.CapsuleGeometry(0.4, 1.2, 3, 8), color: 0x9fd8ff, size: 0.04, r: [0.7, 1.4], w: [1.2, 2.0], anchors: ['head', 'chest'], emissive: 1.4, trail: true, launchedOnly: true },
];

function frameGeometry() {
  // a nested wire rectangle (thin bars), as one solid geometry
  const parts = [];
  const bar = (w, h, x, y) => parts.push(new THREE.BoxGeometry(w, h, 0.02).translate(x, y, 0));
  for (const [s, o] of [[1, 0], [0.62, 0.0]]) {
    bar(1.4 * s, 0.025, 0, 0.5 * s + o); bar(1.4 * s, 0.025, 0, -0.5 * s + o);
    bar(0.025, 1.0 * s, 0.7 * s, o); bar(0.025, 1.0 * s, -0.7 * s, o);
  }
  return mergeGeos(parts);
}
function mergeGeos(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); const idx = []; let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    for (const i of g.index.array) idx.push(i + o);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setIndex(idx);
  return out;
}

export class Orbits {
  constructor(station) {
    this.st = station;
    this.group = new THREE.Group();
    this.group.name = 'profile-orbits';
    this.sats = [];
    this.fams = FAMILIES.map((F, fi) => {
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.2, emissive: new THREE.Color(F.color), emissiveIntensity: F.emissive * 0.6 });
      const mesh = new THREE.InstancedMesh(F.geo(), mat, F.n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(F.n * 3).fill(1), 3);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      for (let i = 0; i < F.n; i++) this.sats.push(this.#makeSat(F, fi, i));
      return { F, mesh, mat };
    });
    this.#buildLines();
    this.#buildStage();
    this.events = { next: 3, cross: new Map() };
    this.mode = { tighten: 0, organise: 0, collapse: 0, wide: 0, bright: 0 };
    this._anchor = {};
  }

  #makeSat(F, fi, i) {
    const s = rnd(fi * 31 + i * 7.3);
    const o = {
      F, fi, i, seed: s,
      // current orbit (physical) and its target (logical); the current one follows on springs
      cur: { r: lerp(F.r[0], F.r[1], s), e: 0.15 * rnd(s + 1), w: lerp(F.w[0], F.w[1], rnd(s + 2)) * (rnd(s + 3) > 0.3 ? 1 : -1), tilt: (rnd(s + 4) - 0.5) * 2.2, yaw: rnd(s + 5) * TAU, y: (rnd(s + 6) - 0.5) * 0.6 },
      vel: { r: 0, e: 0, w: 0, tilt: 0, yaw: 0, y: 0 },
      th: rnd(s + 7) * TAU,
      anchor: F.anchors[i % F.anchors.length],
      anchorK: 1, prevAnchor: null, // anchor blend (an orbit can migrate from one body anchor to another)
      pos: new THREE.Vector3(), prev: new THREE.Vector3(), life: 1, scale: 0, spin: rnd(s + 8) * TAU,
      capture: null, // an activity's launch: the object travels from a point into its orbit
      trail: F.trail ? [] : null,
    };
    o.tgt = { ...o.cur };
    return o;
  }

  #buildLines() {
    // trails (capsules and launched objects), node links, orbit tracks: one LineSegments each
    const mk = (n) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 6), 3).setUsage(THREE.DynamicDrawUsage));
      const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      l.frustumCulled = false;
      l.renderOrder = 6;
      this.group.add(l);
      return l;
    };
    this.TL = 12; // short trails only
    this.trails = mk(16 * this.TL);
    this.links = mk(40);
    this.TRK = 72;
    this.tracks = mk(4 * this.TRK);
  }

  #buildStage() {
    // the stage's own orbital language: thin rings turning at different speeds (one slightly tilted)
    // and a signal bead racing round them
    this.stageRings = [2.15].map((r, i) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.006, 4, 160), new THREE.MeshBasicMaterial({ color: 0xcfc4ff, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.renderOrder = 1;
      this.group.add(m);
      return { m, r, w: [0.07, -0.045, 0.03][i], tilt: [0, 0.035, -0.02][i] };
    });
    this.bead = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.group.add(this.bead);
    this.beadA = 0;
    this.beadRun = 0;
  }

  /** An activity or event launches an object of `fam` from `pos` into an orbit about `anchor`. */
  launch(fam, pos, { color = null, anchor = 'chest', r = null, w = null, life = 9 } = {}) {
    const list = this.sats.filter((o) => o.F.id === fam && !o.capture);
    if (!list.length) return;
    const o = list[(this._li = (this._li ?? 0) + 1) % list.length];
    o.capture = { from: pos.clone(), t: 0, dur: 1.4, color: color ? new THREE.Color(color) : null, until: life };
    this.#setAnchor(o, anchor);
    if (r != null) o.tgt.r = r;
    if (w != null) o.tgt.w = w;
    if (o.trail) o.trail.length = 0;
  }

  /** Re-engagement: the field bends toward the figure, tightens, then re-forms (graded). */
  collapse(amp) { this.mode.collapse = Math.max(this.mode.collapse, amp); }

  #setAnchor(o, a) {
    if (o.anchor === a) return;
    o.prevAnchor = o.anchor;
    o.anchor = a;
    o.anchorK = 0;
  }

  #anchorPos(name, out) {
    const st = this.st, S = 2.5;
    const A = this._anchor;
    if (!A[name]) {
      if (name === 'stage') { const s = st.rig.stance(); A[name] = new THREE.Vector3(s.x * S, 0.975 + 0.35, s.z * S); }
      else if (name === 'far') { const s = st.rig.stance(); A[name] = new THREE.Vector3(s.x * S, 0.975 + 2.6 * S * 0.5, s.z * S).addScaledVector(this._fwd, -1.6); }
      else if (name === 'spine') A[name] = st.label?.spine ? st.label.spine.position.clone() : st.bonePoint('chest', [0, 0, 0]);
      else A[name] = st.bonePoint(name, name === 'head' ? [0, 0.06, 0] : [0, 0, 0]);
    }
    return out.copy(A[name]);
  }

  update(time, dt, c) {
    const st = this.st, d = Math.min(dt, 1 / 30);
    this._anchor = {};
    this._fwd = new THREE.Vector3(Math.sin(st.att.torso.v), 0, Math.cos(st.att.torso.v));
    const tier = c.tier ?? 0.18, wk = c.wake ?? 0;
    // the station's state reshapes the whole field (all eased)
    const M = this.mode;
    const ease = (k, g, r) => (M[k] += (g - M[k]) * Math.min(1, dt * r));
    ease('tighten', wk * (c.focused ? 0 : 1), 2.5);
    ease('organise', c.flying && c.windDown ? 1 : c.focused && (c.life ?? 0) < 0.15 ? 0.45 : 0, 1.6);
    ease('wide', c.rare ? 1 : 0, 0.8);
    ease('bright', Math.max(wk, c.rare ? 1 : 0, tier), 2);
    M.collapse = Math.max(0, M.collapse - dt * 0.55);
    const radiusK = (1 - 0.22 * M.tighten - 0.2 * M.organise) * (1 + 0.55 * M.wide) * (1 - 0.55 * smooth(M.collapse, 0, 1));
    const speedK = (1 + 0.35 * M.tighten + 0.6 * M.wide) * (1 - 0.3 * M.organise) * (0.85 + 0.3 * tier);
    // evolve: every few seconds some orbits get new targets (radius, plane, speed, direction,
    // anchor); quicker when attended or in the rare event
    if (time > this.events.next) {
      this.events.next = time + lerp(2.2, 0.8, Math.max(wk, M.wide)) + rnd(time) * 1.5;
      const k = Math.floor(rnd(time * 1.3) * this.sats.length);
      for (let j = 0; j < 3 + Math.round(4 * M.wide); j++) {
        const o = this.sats[(k + j * 7) % this.sats.length];
        const F = o.F, s = rnd(time + j * 3.1);
        o.tgt.r = lerp(F.r[0], F.r[1], s);
        o.tgt.tilt = (rnd(s + 1) - 0.5) * 2.4;
        o.tgt.yaw += (rnd(s + 2) - 0.5) * 2;
        o.tgt.e = 0.3 * rnd(s + 3);
        o.tgt.y = (rnd(s + 4) - 0.5) * 0.7;
        o.tgt.w = lerp(F.w[0], F.w[1], rnd(s + 5)) * (rnd(s + 6) > 0.2 ? Math.sign(o.cur.w || 1) : -Math.sign(o.cur.w || 1)); // sometimes reverses (smoothly, through zero)
        if (!F.giant && rnd(s + 7) > 0.65) this.#setAnchor(o, F.anchors[Math.floor(rnd(s + 8) * F.anchors.length)]);
      }
      // a cluster: a few nodes synchronise into one tight orbit for a while, then split again
      if (rnd(time * 2.7) > 0.6) {
        const yaw = rnd(time) * TAU, tilt = (rnd(time + 1) - 0.5) * 1.6;
        this.sats.filter((o) => o.F.id === 'node').slice(0, 5).forEach((o, i) => Object.assign(o.tgt, { r: 0.8, tilt, yaw, e: 0.05, w: 0.9, y: 0.1 * i }));
      }
    }
    const sp = (o, key, w = 2.2) => {
      const x = o.cur[key], g = o.tgt[key];
      o.vel[key] += (w * w * (g - x) - 2 * w * o.vel[key]) * d;
      o.cur[key] = x + o.vel[key] * d;
    };
    // giants: occasional large structures (a few seconds, then dissolve), always in the rare event
    const giants = this.sats.filter((o) => o.F.giant);
    giants.forEach((o, i) => {
      // at rest one large structure now and then; on hover a second; all in the rare event
      const slot = (time + i * 11) % 34 < 9;
      o.giantGoal = 0 && M.wide > 0.3 ? 1 : slot && (i === 0 || (i === 1 && M.tighten > 0.4)) ? 1 : 0;
      o.giantK = (o.giantK ?? 0) + (o.giantGoal - (o.giantK ?? 0)) * Math.min(1, dt * 0.7);
    });
    const P = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3();
    const camLocal = st.group.worldToLocal(c.camNow.clone());
    for (const o of this.sats) {
      const F = o.F;
      for (const k of ['r', 'e', 'w', 'tilt', 'yaw', 'y']) sp(o, k, k === 'w' ? 1.4 : 1.8);
      o.th += o.cur.w * speedK * dt;
      o.spin += dt * (0.6 + Math.abs(o.cur.w));
      // anchor blend: an orbit migrating between body anchors travels continuously
      o.anchorK = Math.min(1, o.anchorK + dt * 0.5);
      this.#anchorPos(o.anchor, A);
      if (o.prevAnchor && o.anchorK < 1) A.lerp(this.#anchorPos(o.prevAnchor, B), 1 - smooth(o.anchorK, 0, 1));
      A.y += o.cur.y;
      // the orbit: an ellipse in a tilted plane
      const r = (F.giant ? 0 : o.cur.r) * radiusK;
      P.set(Math.cos(o.th) * r * (1 + o.cur.e), 0, Math.sin(o.th) * r * (1 - o.cur.e));
      _q.setFromAxisAngle(UP, o.cur.yaw);
      P.applyAxisAngle(_w.set(1, 0, 0), o.cur.tilt).applyQuaternion(_q);
      const target = A.add(P);
      // a launched object travels from where it was launched into its orbit (a continuous capture)
      if (o.capture) {
        o.capture.t += dt;
        const u = smooth(o.capture.t / o.capture.dur, 0, 1);
        target.lerp(o.capture.from, 1 - u);
        o.capture.until -= dt;
        if (o.capture.until <= 0) o.capture = null;
      }
      o.prev.copy(o.pos);
      if (!o.init) (o.pos.copy(target), (o.init = true));
      o.pos.copy(target);
      // presence: families have resting visibility by tier; capsules shed motes when they turn hard
      const base = F.launchedOnly ? (o.capture ? smooth(o.capture.until, 0, 1.2) : 0) : 0.65 + 0.35 * tier;
      o.scale += (base - o.scale) * Math.min(1, dt * 2);
      const speed = o.pos.distanceTo(o.prev) / Math.max(dt, 1e-3);
      if (F.trail && st.fx && speed > 3.5 && time - (o.shed ?? -9) > 0.12 && tier > 0.3) {
        o.shed = time;
        st.fx.burst(o.pos, { n: 1, color: o.capture?.color ?? F.color, speed: 0.2, life: 0.5, size: 0.025, alpha: 0.6 });
      }
      // foreground safety: an object passing very near the camera fades rather than filling the frame
      o.nearK = smooth(o.pos.distanceTo(camLocal), 0.9, 2.4);
    }
    this.#interactions(time, dt, c);
    this.#draw(time, dt, c, tier);
    this.#stage(time, dt, c, tier);
  }

  #interactions(time, dt, c) {
    const st = this.st, fx = st.fx;
    if (!fx) return;
    // crossings: two capsules (or a capsule and a shard) passing close produce a small pulse
    const caps = this.sats.filter((o) => o.F.id === 'capsule' || o.F.id === 'shard');
    for (let i = 0; i < caps.length; i++)
      for (let j = i + 1; j < caps.length; j++) {
        const a = caps[i], b = caps[j], key = i * 64 + j;
        const near = a.pos.distanceToSquared(b.pos) < 0.04;
        if (near && !this.events.cross.get(key) && time - (this._lastCross ?? -9) > 0.35) {
          this._lastCross = time;
          const m = a.pos.clone().lerp(b.pos, 0.5);
          fx.ring(m, { normal: a.pos.clone().sub(a.prev).normalize(), r0: 0.02, r1: 0.22, life: 0.6, k: 0.7, color: 0xe6dcff });
          fx.burst(m, { n: 4, color: 0xffffff, speed: 0.3, life: 0.5, size: 0.025, alpha: 0.7 });
        }
        this.events.cross.set(key, near);
      }
    // packets: now and then a capsule leaves one model for another (data passing between identities)
    const M = st.models;
    if ((c.wake ?? 0) > 0.5 || this.mode.wide > 0.3) if (time - (this._pk ?? -9) > lerp(4.5, 1.8, Math.max(c.wake ?? 0, this.mode.wide)) && M) {
      this._pk = time;
      const aw = M.list.filter((p) => (p.awake ?? 0) > 0.3 && p.mesh.visible);
      if (aw.length > 1) {
        const a = aw[Math.floor(rnd(time) * aw.length)], b = aw[Math.floor(rnd(time + 1) * aw.length)];
        if (a !== b) {
          fx.arc(a.pos, b.pos, { color: a.def.color, lift: 0.3, life: 1.2, k: 0.55, follow: () => [a.pos, b.pos] });
          this.launch('capsule', a.pos, { color: a.def.color, anchor: rnd(time + 2) > 0.5 ? 'head' : 'chest', life: 6 });
        }
      }
    }
  }

  #draw(time, dt, c, tier) {
    const S = _s;
    // the PROFILE artifact's screen position: line-like rings fade where they cross it
    const spP = this.st.label?.spine?.position;
    const cam = this.st.group.worldToLocal(c.camNow.clone());
    // instances
    let fi = 0;
    for (const { F, mesh } of this.fams) {
      let i = 0;
      for (const o of this.sats) {
        if (o.F !== F) continue;
        const sc = F.size * o.scale * o.nearK * (F.giant ? 1 + 0.4 * this.mode.wide : 1);
        if (F.ring) {
          // rings orient by their own plane (a harmonic loop round the head, a giant tilted ellipse)
          _q.setFromAxisAngle(UP, o.cur.yaw).multiply(new THREE.Quaternion().setFromAxisAngle(_w.set(1, 0, 0), Math.PI / 2 + o.cur.tilt + 0.3 * Math.sin(time * 0.1 + o.seed * 9)));
          const R = F.giant ? F.size * (0.85 + 0.25 * o.seed) * (1 + 0.4 * this.mode.wide) : (0.45 + o.cur.r) * (1 + 0.5 * this.mode.wide);
          _m.compose(o.pos, _q, S.set(R, R * (1 - 0.35 * o.cur.e), R).multiplyScalar(F.giant ? o.giantK : o.scale));
        } else {
          _q.setFromEuler(new THREE.Euler(o.spin, o.spin * 0.7, o.spin * 0.3));
          _m.compose(o.pos, _q, S.set(sc, sc, sc));
        }
        mesh.setMatrixAt(i, _m);
        let k = (o.capture?.color ? 1.6 : 1) * (0.55 + 0.6 * this.mode.bright);
        if (F.ring && spP) {
          // how much of the ring's disc lies between the camera and the spine: dim the whole ring a
          // little while it overlaps the artifact in view
          const toS = _v.copy(spP).sub(cam).normalize(), toR = _w.copy(o.pos).sub(cam).normalize();
          const R = F.giant ? F.size : 0.45 + o.cur.r;
          const ang = Math.acos(clamp(toS.dot(toR), -1, 1)), span = Math.atan2(R, cam.distanceTo(o.pos));
          k *= 1 - 0.6 * smooth(span - ang, -0.1, 0.25);
        }
        _c.copy(o.capture?.color ?? _c.set(0xffffff)).multiplyScalar(k);
        mesh.setColorAt(i, _c);
        i++;
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      this.fams[fi].mat.emissiveIntensity = F.emissive * (0.35 + 0.65 * this.mode.bright);
      fi++;
    }
    // trails: capsules leave 3D trails that fade, brighter when attended
    const T = this.trails.geometry.attributes, tp = T.position.array, tc = T.color.array;
    let ti = 0;
    for (const o of this.sats) {
      if (!o.trail) continue;
      o.trail.unshift(o.pos.clone());
      if (o.trail.length > this.TL) o.trail.pop();
      const col = _c.copy(o.capture?.color ?? new THREE.Color(o.F.color));
      for (let j = 0; j < this.TL - 1 && ti < 16 * this.TL; j++, ti++) {
        const a = o.trail[Math.min(j, o.trail.length - 1)], b = o.trail[Math.min(j + 1, o.trail.length - 1)];
        tp.set([a.x, a.y, a.z, b.x, b.y, b.z], ti * 6);
        const f = (1 - j / (this.TL - 1)) ** 1.6 * (0.25 + 0.75 * this.mode.bright) * o.nearK * o.scale * (this.st.clearK ? this.st.clearK(a) : 1);
        tc.set([col.r * f, col.g * f, col.b * f, col.r * f * 0.8, col.g * f * 0.8, col.b * f * 0.8], ti * 6);
      }
    }
    tc.fill(0, ti * 6);
    T.position.needsUpdate = T.color.needsUpdate = true;
    // links between memory nodes (a small moving graph)
    const L = this.links.geometry.attributes, lp = L.position.array, lc = L.color.array;
    const nodes = this.sats.filter((o) => o.F.id === 'node');
    let li = 0;
    for (let i = 0; i < nodes.length && li < 40; i++)
      for (let j = i + 1; j < nodes.length && li < 40; j++) {
        const dd = nodes[i].pos.distanceTo(nodes[j].pos);
        if (dd > 0.55) continue;
        const f = (1 - dd / 0.55) * (0.25 + 0.6 * this.mode.bright) * nodes[i].nearK;
        lp.set([...nodes[i].pos.toArray(), ...nodes[j].pos.toArray()], li * 6);
        lc.set([0.8 * f, 0.76 * f, f, 0.8 * f, 0.76 * f, f], li * 6);
        li++;
      }
    lc.fill(0, li * 6);
    L.position.needsUpdate = L.color.needsUpdate = true;
    // orbit tracks: on hover (and in the rare event) the main lanes become visible
    const K = this.tracks.geometry.attributes, kp = K.position.array, kc = K.color.array;
    const show = 0; // lane tracks retired (thin-line clutter)
    const lanes = this.sats.filter((o) => o.F.id === 'capsule' || o.F.id === 'knot').slice(0, 4);
    const A = new THREE.Vector3(), P = new THREE.Vector3();
    lanes.forEach((o, li2) => {
      this.#anchorPos(o.anchor, A); A.y += o.cur.y;
      const r = o.cur.r * (1 - 0.22 * this.mode.tighten) * (1 + 0.55 * this.mode.wide);
      _q.setFromAxisAngle(UP, o.cur.yaw);
      for (let j = 0; j < this.TRK; j++) {
        const pts = [j, j + 1].map((k) => {
          const th = (k / this.TRK) * TAU;
          P.set(Math.cos(th) * r * (1 + o.cur.e), 0, Math.sin(th) * r * (1 - o.cur.e)).applyAxisAngle(_w.set(1, 0, 0), o.cur.tilt).applyQuaternion(_q);
          return P.clone().add(A);
        });
        const idx = (li2 * this.TRK + j) * 6;
        kp.set([...pts[0].toArray(), ...pts[1].toArray()], idx);
        // brighter just ahead of the object (the lane is being travelled)
        const ahead = ((((j / this.TRK) * TAU - (o.th % TAU)) % TAU) + TAU) % TAU;
        const f = show * 0.35 * (0.35 + 0.65 * Math.exp(-ahead * 1.2));
        kc.set([0.75 * f, 0.7 * f, f, 0.75 * f, 0.7 * f, f], idx);
      }
    });
    K.position.needsUpdate = K.color.needsUpdate = true;
  }

  #stage(time, dt, c, tier) {
    // the stage's rings sit on the pedestal's centre (the canonical origin), not on the figure
    const st = this.st;
    const cx = 0, cz = 0;
    for (const R of this.stageRings) {
      R.m.position.set(cx, 0.975 + 0.012, cz);
      R.m.rotation.set(-Math.PI / 2 + R.tilt * (1 + this.mode.wide), 0, (R.a = (R.a ?? 0) + R.w * dt * (1 + this.mode.tighten + this.mode.wide)));
      R.m.scale.setScalar(1 - 0.12 * smooth(this.mode.collapse, 0, 1) + 0.15 * this.mode.wide);
      R.m.material.opacity = (0.14 + 0.22 * tier + 0.2 * this.mode.tighten) * (0.85 + 0.15 * Math.sin(time * 0.8 + R.r));
    }
    // the signal bead races round the outer ring now and then, then climbs the PROFILE spine
    this.beadRun = Math.max(0, this.beadRun - dt);
    if (this.beadRun <= 0 && rnd(Math.floor(time / 9)) > 0.4 && (time % 9) < dt * 2) (this.beadRun = 2.4), st.emit('idle-bead');
    const run = this.beadRun > 0 ? 1 - this.beadRun / 2.4 : 0;
    const R = 2.15 * (1 - 0.12 * smooth(this.mode.collapse, 0, 1));
    this.beadA += dt * (0.5 + 6.7 * (this.beadRun > 0 ? 1 : 0));
    this.bead.position.set(cx + Math.cos(this.beadA) * R, 0.975 + 0.03, cz + Math.sin(this.beadA) * R);
    this.bead.material.opacity = this.beadRun > 0 ? Math.sin(Math.PI * run) : 0.3 + 0.2 * tier;
    if (this.beadRun > 0 && run > 0.92 && !this._beadSent) (this._beadSent = true), st.label?.sweep?.(time);
    if (this.beadRun <= 0) this._beadSent = false;
  }
}
