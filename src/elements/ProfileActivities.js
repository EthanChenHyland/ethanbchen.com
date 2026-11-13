import * as THREE from 'three';
import { FIGURE_SCALE, BONE, BONES } from './ProfileBody.js';

// What the person behind the work actually does, from the résumés and repositories:
//
//   chess    quick chess (a national online ranking, the school chess club): a real position from
//            the GitHub profile's daily puzzle (White Qb3, Kf2; Black Kh1). The figure calculates,
//            candidate selves try Qg3 (stalemate) and Qb1+ (the king escapes), and it plays Qh3#,
//            fast, and taps the clock.
//   piano    piano and score/performance alignment (PianoMir): a curved key field forms round the
//            hands; a short phrase is played; the score and the performance align above the keys.
//   clarinet first-chair clarinet: an implied instrument of light from the mouth, a standing wave
//            in its bore, fingering rings, a pitch trace drawn from the bell.
//   models   LLM evaluation and multi-model work (Prompt-Off, Clarity, Codex): models come forward,
//            the same prompt goes to each, each answers in its own form, two are weighed, one chosen.
//
// Rare: the whole AI field assembles into a crown; the body passes fully into a constellation.

const S = FIGURE_SCALE;
const PLATE_Y = 0.975;
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp, smoothstep = THREE.MathUtils.smoothstep;
const ramp = (t, a, b) => smoothstep(t, a, b);
const pulse = (t, a, b, c, d) => smoothstep(t, a, b) * (1 - smoothstep(t, c, d));
const NB = BONES.length;
const REGION = {
  head: ['head', 'neck'],
  chest: ['chest', 'spine'],
  armL: ['clavL', 'upperArmL', 'foreArmL', 'handL', 'fingersL', 'tipsL', 'thumbL', 'indexL', 'indexTipL'],
  armR: ['clavR', 'upperArmR', 'foreArmR', 'handR', 'fingersR', 'tipsR', 'thumbR', 'indexR', 'indexTipR'],
  handL: ['foreArmL', 'handL', 'fingersL', 'tipsL', 'thumbL', 'indexL', 'indexTipL'],
  handR: ['foreArmR', 'handR', 'fingersR', 'tipsR', 'thumbR', 'indexR', 'indexTipR'],
  legs: ['pelvis', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'],
};
export const maskOf = (...regions) => {
  const m = new Float32Array(NB);
  for (const r of regions) for (const n of REGION[r] ?? [r]) m[BONE[n]] = 1;
  return m;
};

const LEN = { chess: 19, piano: 17, clarinet: 15, models: 18, crown: 12, phase: 9 };
// the order a whole-body phase travels: right hand, up the arm, the head, the left arm, then down
const BODY_CHAIN = ['indexTipR', 'tipsR', 'indexR', 'fingersR', 'thumbR', 'handR', 'foreArmR', 'upperArmR', 'clavR', 'chest', 'neck', 'head', 'spine', 'clavL', 'upperArmL', 'foreArmL', 'handL', 'fingersL', 'tipsL', 'thumbL', 'indexL', 'indexTipL', 'pelvis', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR'];

export class Activities {
  constructor(station, models) {
    this.st = station;
    this.models = models;
    this.group = new THREE.Group();
    this.group.name = 'profile-activities';
    this.#buildChess();
    this.#buildPiano();
    this.#buildClarinet();
    this.mode = null;
    this.t = 0;
    this.cycle = 0;
    this.nextAt = 4;
    this.lastRare = 0;
    this.frame = { pos: new THREE.Vector3(), yaw: 0 };
    this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.PROGRAM = ['chess', 'models', 'piano', 'models', 'chess', 'clarinet'];
    // activity geometry draws after the (transparent) body, so the body never paints over it
    this.group.traverse((o) => { if (o.isMesh || o.isLine || o.isInstancedMesh) o.renderOrder = 6; });
  }

  // ------------------------------------------------------------------ geometry
  #buildChess() {
    const g = (this.chess = { group: new THREE.Group() });
    this.group.add(g.group);
    const sq = 0.15;
    g.sq = sq;
    const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(sq * 0.94, 0.012, sq * 0.94), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.85, clearcoat: 1, emissive: 0x6a5cc0, emissiveIntensity: 0.25 }), 64);
    tiles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 64; i++) tiles.setColorAt(i, (Math.floor(i / 8) + i) % 2 ? new THREE.Color(0xe8e2f6) : new THREE.Color(0x3b3560));
    g.tiles = tiles;
    g.board = new THREE.Group();
    g.board.add(tiles);
    g.group.add(g.board);
    // pieces: lathe silhouettes (pearl for White, smoked glass for Black)
    const lathe = (pts) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 28);
    const queen = lathe([[0, 0], [0.034, 0], [0.034, 0.008], [0.022, 0.016], [0.014, 0.05], [0.012, 0.08], [0.024, 0.09], [0.016, 0.1], [0.022, 0.118], [0.006, 0.124], [0, 0.13]]);
    const king = lathe([[0, 0], [0.036, 0], [0.036, 0.008], [0.023, 0.017], [0.015, 0.055], [0.013, 0.086], [0.025, 0.096], [0.017, 0.11], [0.006, 0.118], [0, 0.12]]);
    const cross = new THREE.BoxGeometry(0.008, 0.034, 0.008).translate(0, 0.134, 0);
    const crossB = new THREE.BoxGeometry(0.024, 0.008, 0.008).translate(0, 0.138, 0);
    const white = new THREE.MeshPhysicalMaterial({ color: 0xf6f2ff, roughness: 0.22, clearcoat: 1, emissive: 0x8a7cff, emissiveIntensity: 0.15 });
    const black = new THREE.MeshPhysicalMaterial({ color: 0x241f3a, roughness: 0.15, metalness: 0.2, clearcoat: 1, transparent: true, opacity: 0.95, emissive: 0x2a2050, emissiveIntensity: 0.3 });
    const mk = (geo, mat, extra = []) => {
      const p = new THREE.Group();
      p.add(new THREE.Mesh(geo, mat), ...extra.map((e) => new THREE.Mesh(e, mat)));
      // a glowing ring under each piece, so it reads from a distance
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.04, 28), new THREE.MeshBasicMaterial({ color: mat === black ? 0xb9a8ff : 0xfff1dd, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.002;
      p.add(ring);
      p.scale.setScalar(2.7);
      g.board.add(p);
      return p;
    };
    g.wQ = mk(queen, white);
    g.wK = mk(king, white, [cross, crossB]);
    g.bK = mk(king, black, [cross, crossB]);
    g.blackMat = black;
    // candidate queens (translucent) and the lines of calculation
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0xcfc4ff, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending });
    g.cand = ['h3', 'g3', 'b1'].map((s) => ({ sq: s, m: mk(queen, ghostMat.clone()) }));
    g.lines = g.cand.map(() => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(33 * 3), 3));
      const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xd8ceff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      g.board.add(l);
      return l;
    });
    // the clock: two rings that deplete quickly (it is quick chess)
    g.clock = [0, 1].map((i) => {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.055, 0.07, 40, 1, 0, TAU), new THREE.MeshBasicMaterial({ color: i ? 0xffc89a : 0xd8ceff, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      g.board.add(r);
      return r;
    });
    g.group.visible = false;
  }

  #buildPiano() {
    const p = (this.piano = { group: new THREE.Group(), keys: [] });
    this.group.add(p.group);
    // seventeen keys on an arc round the front of the figure (white slats, raised black ones)
    const whiteMat = new THREE.MeshPhysicalMaterial({ color: 0xf3effa, roughness: 0.3, clearcoat: 1, transparent: true, opacity: 0.9, emissive: 0x8f80ff, emissiveIntensity: 0.0 });
    const blackMat = new THREE.MeshPhysicalMaterial({ color: 0x2a2444, roughness: 0.2, clearcoat: 1, transparent: true, opacity: 0.92, emissive: 0x8f80ff, emissiveIntensity: 0.0 });
    const pattern = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0]; // C .. B
    let w = 0;
    for (let i = 0; i < 17; i++) {
      const isB = pattern[i % 12] === 1;
      const geo = isB ? new THREE.BoxGeometry(0.065, 0.045, 0.26) : new THREE.BoxGeometry(0.118, 0.028, 0.42);
      // the player stands at -z: white key fronts toward them, black keys set back toward the far end
      geo.translate(0, 0, isB ? 0.08 : 0);
      const m = new THREE.Mesh(geo, (isB ? blackMat : whiteMat).clone());
      const slot = isB ? w - 0.5 : w;
      if (!isB) w++;
      p.keys.push({ m, isB, slot, down: 0, glow: 0, note: i });
      p.group.add(m);
    }
    p.nW = w;
    // harmonic arcs and timing traces rise from struck keys
    const N = 40;
    p.trails = Array.from({ length: 10 }, () => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xe6dcff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      l.frustumCulled = false;
      p.group.add(l);
      return { l, t0: -99, key: 0, N };
    });
    // score (pale) and performance (warm) ticks, aligning as the phrase goes on
    p.ticks = [0, 1].map((r) => {
      const m = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, 0.07, 0.012), new THREE.MeshBasicMaterial({ color: r ? 0xffc89a : 0xd8ceff, transparent: true, opacity: 0, depthWrite: false }), 12);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      p.group.add(m);
      return m;
    });
    // the fallboard: a curved bar of light behind the keys, so the arc reads as a keyboard
    p.fall = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 20 }, (_, i) => { const a = (i / 19 - 0.5) * 1.05; return new THREE.Vector3(Math.sin(a) * 1.5, 0, Math.cos(a) * 1.5); })), 40, 0.012, 6, false), new THREE.MeshBasicMaterial({ color: 0xd8ceff, transparent: true, opacity: 0.8, depthWrite: false }));
    p.group.add(p.fall);
    p.group.visible = false;
    // the phrase: [time, key, hand]: a rising figure then a chord, played with both hands
    p.phrase = [[3.0, 2, 'L'], [3.35, 6, 'L'], [3.7, 9, 'R'], [4.05, 13, 'R'], [4.6, 11, 'R'], [4.95, 9, 'R'], [5.4, 4, 'L'], [6.1, 7, 'L'], [6.45, 11, 'R'], [6.8, 14, 'R'], [7.5, 16, 'R'], [7.85, 14, 'R'], [8.4, 2, 'L'], [8.4, 9, 'R'], [9.3, 4, 'L'], [9.65, 7, 'L'], [10.0, 11, 'R'], [10.35, 14, 'R'], [11.2, 2, 'L'], [11.2, 6, 'L'], [11.2, 9, 'R'], [11.2, 13, 'R']];
  }

  #buildClarinet() {
    const c = (this.clar = { group: new THREE.Group() });
    this.group.add(c.group);
    // a stylised clarinet, recognisably one: dark body in joints, silver rings, a flared bell, a pale
    // mouthpiece; built down its own -y from the mouthpiece tip
    // grenadilla (near-black) body with nickel-silver keys: a recognisable clarinet, not a glowing tube
    // stage-lit grenadilla: dark but warm, with a soft glow so the long silhouette reads against the navy suit
    const dark = new THREE.MeshPhysicalMaterial({ color: 0x3a2f45, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.12, emissive: 0x4a3a66, emissiveIntensity: 0.6, transparent: true, depthWrite: true });
    const silver = new THREE.MeshPhysicalMaterial({ color: 0xeeeaf8, roughness: 0.15, metalness: 0.9, emissive: 0x9a90d8, emissiveIntensity: 0.7 });
    const pale = new THREE.MeshPhysicalMaterial({ color: 0xf2eefa, roughness: 0.3, clearcoat: 1 });
    c.body = new THREE.Group();
    let y = 0;
    const seg = (len, r0, r1, mat) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, 20), mat);
      m.position.y = -(y + len / 2);
      c.body.add(m);
      y += len;
      return m;
    };
    const ring = (r) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 6, 24), silver);
      m.rotation.x = Math.PI / 2;
      m.position.y = -y;
      c.body.add(m);
    };
    // mouthpiece (pale, tapering to the tip) with its metal ligature
    seg(0.12, 0.012, 0.03, pale);
    ring(0.031);
    ring(0.032);
    seg(0.1, 0.04, 0.04, dark);
    ring(0.042);
    // upper and lower joints at true proportion (a long slender body: ~66 cm overall at this scale)
    seg(0.58, 0.035, 0.035, dark);
    ring(0.039);
    seg(0.6, 0.036, 0.038, dark);
    ring(0.044);
    // the bell: a modest flare (a clarinet's, not a trumpet's) with a silver rim
    const bell = new THREE.Mesh(new THREE.LatheGeometry([[0.04, 0], [0.043, 0.07], [0.052, 0.14], [0.07, 0.2], [0.085, 0.24], [0.088, 0.25]].map(([r, h]) => new THREE.Vector2(r, -h)), 32), dark);
    bell.position.y = -y;
    c.body.add(bell);
    y += 0.25;
    ring(0.089);
    // key work: thin silver rods along the front of both joints, and ring keys round the tone holes
    for (const [y0, len] of [[0.27, 0.5], [0.87, 0.5]]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, len, 6), silver);
      rod.position.set(0.0, -(y0 + len / 2), 0.042);
      c.body.add(rod);
    }
    for (const yy of [0.36, 0.46, 0.56, 0.94, 1.04, 1.14]) {
      const rk = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.0035, 6, 16), silver);
      rk.position.set(0.0, -yy, 0.04);
      c.body.add(rk);
    }
    c.len = y;
    c.group.add(c.body);
    c.tube = c.body;
    c.rings = Array.from({ length: 7 }, () => {
      const r = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd9b0, transparent: true, depthWrite: false }));
      c.group.add(r);
      return r;
    });
    const N = 60;
    // the bore's standing wave as a luminous ribbon: its width is the pressure envelope, so the
    // nodes pinch and the antinodes swell (visible acoustics, not a plotted line)
    {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
      const idx = [];
      for (let j = 0; j < N - 1; j++) idx.push(j * 2, j * 2 + 1, j * 2 + 2, j * 2 + 1, j * 2 + 3, j * 2 + 2);
      g.setIndex(idx);
      c.wave = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      c.waveN = N;
    }
    c.wave.frustumCulled = false;
    c.pitchN = 90;
    c.pitch = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(c.pitchN * 3), 3)), new THREE.LineBasicMaterial({ color: 0xd8ceff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    c.pitch.frustumCulled = false;
    c.hist = [];
    this.group.add(c.wave, c.pitch);
    c.group.visible = c.wave.visible = c.pitch.visible = false;
    // the phrase: [start, pitch step (0..6), length]
    c.phrase = [[2.6, 0, 1.0], [3.7, 2, 0.6], [4.4, 4, 1.2], [5.8, 3, 0.5], [6.4, 5, 1.6], [8.2, 4, 0.7], [9.0, 2, 0.6], [9.7, 0, 2.0]];
  }

  // ------------------------------------------------------------------ helpers
  /** A station-frame point → the figure's frame (human units), for IK. */
  fig(v) {
    return new THREE.Vector3(v.x / S, (v.y - PLATE_Y) / S, v.z / S);
  }
  /** The work frame: in front of the figure, along where it faced when the activity began. */
  at(fwd, right, up) {
    const F = this.frame;
    return new THREE.Vector3(F.pos.x + Math.sin(F.yaw) * fwd - Math.cos(F.yaw) * right, up, F.pos.z + Math.cos(F.yaw) * fwd + Math.sin(F.yaw) * right);
  }

  start(kind, at = 0) {
    this.mode = kind;
    this.t = at;
    this._prev = at - 1e-3;
    const st = this.st.rig.stance();
    this.frame.pos.set(st.x * S, 0, st.z * S);
    this.frame.yaw = this.st.att.torso.v;
    this.variant = this.cycle;
  }

  /** Choose the next activity (or a rare event); `c` carries the interaction state. */
  #next(time, c) {
    if (c.review?.mode) return this.start(c.review.mode, c.review.at ?? 0);
    if (c.calm > 0.55 || c.hk > 0.6) return;
    if (time - this.lastRare > 150 && this.cycle > 3 && !c.focused) {
      this.lastRare = time;
      return this.start(this.cycle % 2 ? 'crown' : 'phase');
    }
    // only begin where the overview can see the person, standing still at its place
    const st = this.st, s = st.rig.stance();
    // and only if the orbit will keep it visible for the length of an activity (predicted)
    if (!c.focused && ((st.visibility?.home ?? 1) < 0.65 || st.rig.step || Math.hypot(s.x - st.home.x, s.z - st.home.z) > 0.06 || st.predictVisibility() < 0.6)) {
      this.nextAt = time + 0.8;
      this.waiting = (this.waiting ?? 0) + 1;
      return;
    }
    // never begin mid-turn: the feet plant for an activity, so they must already have arrived
    if (st.rig.seq || st.rig.step) {
      this.nextAt = time + 0.8;
      return;
    }
    const kind = this.PROGRAM[this.cycle++ % this.PROGRAM.length];
    this.start(kind);
  }

  // ------------------------------------------------------------------ update
  update(time, dt, c) {
    const out = { phase: new Float32Array(NB * 4), full: new THREE.Vector4(0, 0, 0, 0), arms: {}, sources: [], ghosts: [], attention: null };
    // behind a neighbour (overview), the activity holds rather than spend its big moments unseen
    const hidden = !c.focused && !c.review && (this.st.visibility?.home ?? 1) < 0.45;
    const rate = c.review?.freeze ? 0 : (1 - 0.9 * c.hk) * lerp(1, 0.35 + 0.65 * c.life, c.fk) * (hidden ? 0.2 : 1);
    // a fresh focus winds the activity down (its geometry fades; it resumes later)
    this.present = (this.present ?? 1) + (((c.calm > 0.6 || c.windDown) ? 0 : 1) - (this.present ?? 1)) * Math.min(1, dt * 1.6);
    if (!this.mode && c.hk > 0.4 && (c.wake ?? 0) > 0.5 && !c.focused) this.#teaser(time, dt, out, c);
    else this.#teaserOff();
    // review states: a pinned activity starts at once; a pinned still or phase state runs none
    if (c.review && !c.review.mode && (c.review.still || c.review.phase || c.review.quiet)) return out;
    if (!this.mode && (time > this.nextAt || (c.review?.mode && time > 0.3))) this.#next(time, c);
    if (this.mode) {
      this.t += dt * rate;
      const len = LEN[this.mode];
      if (this.t > len || (this.present < 0.02 && !c.review?.mode)) {
        this.#hideAll();
        this.models.releaseAll();
        this.models.crownGoal = 0;
        this.mode = null;
        this.nextAt = time + (c.review?.mode ? 1.2 : c.focused ? 7 : 4 + 3 * Math.random());
      } else {
        if (this.mode === 'chess') this.#chess(time, dt, out, c);
        else if (this.mode === 'piano') this.#piano(time, dt, out, c);
        else if (this.mode === 'clarinet') this.#clarinet(time, dt, out, c);
        else if (this.mode === 'models') this.#modelsMode(time, dt, out, c);
        else if (this.mode === 'crown') this.#crown(time, dt, out, c);
        else if (this.mode === 'phase') this.#fullPhase(time, dt, out, c);
      }
    }
    this._prev = this.t;
    return out;
  }

  /**
   * Small teasers of the interests while someone hovers (never a whole activity): a chess piece by
   * the hand, a few keys under a hand, a clarinet's standing wave at the chest, an echo behind the
   * head, a layer rolling down an arm. One at a time, every few seconds.
   */
  #teaser(time, dt, out, c) {
    const T = (this._tz ??= { next: time + 0.9, kind: null, t0: 0, n: 0 });
    if (!this._tg) this.#buildTeasers();
    const G = this._tg;
    if (!T.kind && time > T.next) {
      T.kind = ['chess', 'slice', 'piano', 'echo', 'clar'][T.n++ % 5];
      T.t0 = time;
      T.fired = false;
    }
    if (!T.kind) return;
    const x = time - T.t0, u = x / 2.1;
    if (u > 1) {
      T.kind = null;
      T.next = time + 1.4;
      this.#teaserOff();
      return;
    }
    const k = pulse(u, 0, 0.18, 0.72, 1);
    const st = this.st;
    if (T.kind === 'chess') {
      const p = st.bonePoint('indexR', [0, -0.01, 0.06]);
      G.piece.visible = true;
      G.piece.position.copy(p).add(new THREE.Vector3(0, 0.1 + 0.05 * u, 0));
      G.piece.scale.setScalar(2.7 * k);
      G.piece.rotation.y = time * 0.8;
    } else if (T.kind === 'piano') {
      const p = st.bonePoint('indexL', [0, -0.04, 0.02]);
      const yaw = st.att.torso.v;
      G.keys.visible = true;
      G.keys.position.copy(p).add(new THREE.Vector3(0, -0.1, 0));
      G.keys.rotation.set(0.2, yaw, 0, 'YXZ');
      G.keys.scale.setScalar(Math.max(0.001, k));
      G.keys.children.forEach((m, i) => (m.material.emissiveIntensity = Math.max(0, 1.2 * Math.exp(-Math.pow((u - 0.3 - i * 0.08) / 0.05, 2)))));
      if (!T.fired && u > 0.32) (T.fired = true), st.emit('piano-note', { key: 9 });
    } else if (T.kind === 'clar') {
      const p = st.bonePoint('chest', [0, 0.05, 0.16]);
      const r = new THREE.Vector3(Math.cos(st.att.torso.v), 0, -Math.sin(st.att.torso.v));
      const arr = G.wave.geometry.attributes.position.array;
      for (let i = 0; i < 40; i++) {
        const v = i / 39 - 0.5;
        const q = p.clone().addScaledVector(r, v * 0.7).add(new THREE.Vector3(0, 0.05 * Math.sin(v * Math.PI * 3) * Math.cos(time * 30), 0));
        arr.set([q.x, q.y, q.z], i * 3);
      }
      G.wave.geometry.attributes.position.needsUpdate = true;
      G.wave.visible = true;
      G.wave.material.opacity = 0.85 * k;
    } else if (T.kind === 'echo') out.ghosts.push({ kind: 'delay', delay: 0.3, k: 0.55 * k, mask: 'head' });
    else if (T.kind === 'slice') this.#front(out, ['clavL', 'upperArmL', 'foreArmL', 'handL', 'indexL', 'fingersL'], x, 0, 0.12, 'slice', 0.8);
  }

  #teaserOff() {
    if (!this._tg) return;
    this._tg.piece.visible = this._tg.keys.visible = this._tg.wave.visible = false;
  }

  #buildTeasers() {
    const G = (this._tg = {});
    const src = this.chess.wQ;
    G.piece = src.clone(true);
    G.piece.traverse((o) => o.isMesh && (o.material = new THREE.MeshPhysicalMaterial({ color: 0xf6f2ff, transparent: true, opacity: 0.75, emissive: 0x8a7cff, emissiveIntensity: 0.6, depthWrite: false })));
    G.keys = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const isB = i === 1 || i === 3;
      const m = new THREE.Mesh(isB ? new THREE.BoxGeometry(0.06, 0.04, 0.24).translate(0, 0.03, 0.08) : new THREE.BoxGeometry(0.105, 0.025, 0.38), new THREE.MeshPhysicalMaterial({ color: isB ? 0x2a2444 : 0xf3effa, emissive: 0x8f80ff, emissiveIntensity: 0, transparent: true, opacity: 0.85 }));
      m.position.x = (isB ? i - 0.5 : i) * 0.06 - 0.12;
      G.keys.add(m);
    }
    G.wave = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(120), 3)), new THREE.LineBasicMaterial({ color: 0xfff0e0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    G.wave.frustumCulled = false;
    for (const o of [G.piece, G.keys, G.wave]) {
      o.visible = false;
      o.traverse((q) => (q.renderOrder = 6));
      this.group.add(o);
    }
  }

  #hideAll() {
    this.chess.group.visible = this.piano.group.visible = this.clar.group.visible = this.clar.wave.visible = this.clar.pitch.visible = false;
    for (let i = 0; i < 3; i++) this.models.answer(i, null, this._v[0], 0), this.models.prompt(i, this._v[0], 0);
  }

  #cross(x) {
    return this._prev < x && this.t >= x;
  }

  #add(out, region, ph) {
    for (const n of REGION[region] ?? [region]) {
      const i = BONE[n] * 4;
      for (let k = 0; k < 4; k++) out.phase[i + k] = Math.max(out.phase[i + k], ph[k] ?? 0);
    }
  }

  // ------------------------------------------------------------------ chess
  #chess(time, dt, out, c) {
    const g = this.chess, t = this.t, st = this.st;
    const reach0 = (x) => pulse(x, 10.4, 11.2, 12.9, 13.8);
    const P = this.present;
    const show = pulse(t, 0.2, 1.6, 17.2, 18.8) * P;
    g.group.visible = show > 0.01;
    // the board: hip-high in front, tilted toward the viewer
    // floating off the body beside the right hand, lower-chest high, its near edge toward the figure:
    // forward while it studies, nearer the hand for the move, drifting out as it resolves
    const bStudy = this.at(1.0, 0.92, PLATE_Y + 1.12 * S), bNear = this.at(0.82, 0.74, PLATE_Y + 1.06 * S), bAway = this.at(1.55, 1.5, PLATE_Y + 1.4 * S);
    const centre = bStudy.clone().lerp(bNear, pulse(t, 9.8, 10.8, 13.4, 14.4)).lerp(bAway, ramp(t, 14.6, 18.0));
    g.board.position.copy(centre);
    g.board.rotation.set(0.42, this.frame.yaw - 0.78, 0, 'YXZ');
    // board-local → station-local, from this frame's transform (never a stale world matrix)
    g.board.updateMatrix();
    const bl = (v) => v.applyMatrix4(g.board.matrix);
    const sq = g.sq;
    // White plays from the figure's side: rank 1 nearest it, the a-file on its left (+x)
    const sqp = (n) => new THREE.Vector3((3.5 - 'abcdefgh'.indexOf(n[0])) * sq, 0.012, (+n[1] - 4.5) * sq);
    // tiles assemble (fly in from scatter) and disperse
    const m = new THREE.Matrix4();
    for (let i = 0; i < 64; i++) {
      const f = i % 8, r = Math.floor(i / 8);
      const s = ((i * 37) % 64) / 64;
      const k = clamp((show * 1.5 - s * 0.5), 0, 1);
      const e = k * k * (3 - 2 * k);
      const scat = new THREE.Vector3(Math.sin(i * 2.3) * 0.6, Math.cos(i * 1.7) * 0.5 + 0.3, Math.sin(i * 0.9) * 0.6);
      m.makeRotationFromEuler(new THREE.Euler((1 - e) * (i % 3), (1 - e) * i, 0)).scale(new THREE.Vector3(e, e, e)).setPosition(new THREE.Vector3((3.5 - f) * sq, 0, (r - 3.5) * sq).lerp(scat, 1 - e));
      g.tiles.setMatrixAt(i, m);
    }
    g.tiles.instanceMatrix.needsUpdate = true;
    g.tiles.material.opacity = 0.85 * show;
    // pieces
    // the pieces share the board's lifecycle: in with it, and out BEFORE the grid disperses (they
    // fragment into small information particles and shrink), never left floating after the board
    const pieceOut = 1 - ramp(t, 15.9, 16.9);
    const pieceIn = ramp(t, 1.0, 2.0) * P * pieceOut;
    if (st.fx && this.#cross(15.95)) for (const pc of [g.wK, g.wQ, g.bK]) if (pc.visible !== false) st.fx.burst(bl(pc.position.clone().add(new THREE.Vector3(0, 0.08, 0))), { n: 10, color: pc === g.bK ? 0x9a8cff : 0xe6dcff, speed: 0.35, up: 0.15, life: 1.1, size: 0.035, alpha: 0.7, drag: 2 });
    const place = (p, sqn, k, lift = 0) => {
      p.position.copy(sqp(sqn)).y += lift + (1 - k) * 0.3;
      p.scale.setScalar(2.7 * Math.max(0.001, k));
    };
    place(g.wK, 'f2', pieceIn);
    // the queen: picked up at 11.2, carried in an arc, set down on h3 at 12.6
    const carry = ramp(t, 11.3, 12.5);
    const qFrom = sqp('b3'), qTo = sqp('h3');
    if (t < 11.25) place(g.wQ, 'b3', pieceIn);
    else {
      g.wQ.position.copy(qFrom).lerp(qTo, carry);
      g.wQ.position.y = 0.012 + Math.sin(Math.PI * carry) * 0.13 + ramp(t, 11.0, 11.3) * (1 - carry) * 0.05;
      g.wQ.scale.setScalar(2.7 * Math.max(0.001, pieceOut * P));
    }
    // mate: the black king falls and dissolves
    const fall = ramp(t, 12.9, 13.7);
    place(g.bK, 'h1', pieceIn);
    g.bK.rotation.set(0, 0, -fall * 1.45);
    g.blackMat.opacity = 0.95 * (1 - ramp(t, 14.2, 15.4));
    // calculation: candidate queens and their lines (h3 mate, g3 stalemate, b1+ escapes)
    const calc = pulse(t, 3.0, 4.2, 10.6, 11.4) * P;
    const reject = [0, ramp(t, 7.6, 8.6), ramp(t, 6.2, 7.2)];
    g.cand.forEach((cnd, i) => {
      const k = calc * (1 - reject[i]) * (i === 0 ? 1 + 0.6 * ramp(t, 8.8, 10) : 1);
      cnd.m.visible = k > 0.01;
      cnd.m.position.copy(sqp(cnd.sq)).y += 0.02;
      cnd.m.scale.setScalar(2.7 * clamp(k, 0, 1.2));
      cnd.m.children[0].material.opacity = 0.42 * k;
      // its line: an arc from b3
      const arr = g.lines[i].geometry.attributes.position.array;
      const a = sqp('b3'), b = sqp(cnd.sq);
      const grow = ramp(t, 3.2 + i * 0.5, 4.4 + i * 0.5);
      for (let j = 0; j <= 32; j++) {
        const u = (j / 32) * grow;
        arr[j * 3] = lerp(a.x, b.x, u);
        arr[j * 3 + 1] = 0.03 + Math.sin(Math.PI * u) * (0.12 + 0.05 * i);
        arr[j * 3 + 2] = lerp(a.z, b.z, u);
      }
      g.lines[i].geometry.attributes.position.needsUpdate = true;
      g.lines[i].material.opacity = (i === 0 ? 1 : 0.7) * k;
    });
    // the thinking made visible: search branches go out from the queen and mostly collapse; the
    // refuted candidates fold back into it; the chosen square gets an evaluation pulse and its path
    // locks; the coordinate path is traced; at mate, one restrained flash
    const fx = st.fx, up = (v, h = 0.03) => v.add(new THREE.Vector3(0, h, 0));
    if (fx && calc > 0.3 && t < 10.2 && t - (this._br ?? -9) > 0.3) {
      this._br = t;
      const SQ = ['c4', 'd5', 'e6', 'a4', 'c2', 'd1', 'g3', 'e3', 'b5', 'f3', 'h3', 'b1', 'f7', 'd3', 'a2'];
      const target = SQ[(this._bn = (this._bn ?? 0) + 1) % SQ.length];
      const a0 = bl(up(sqp('b3'))), b0 = bl(up(sqp(target)));
      fx.arc(a0, b0, { lift: 0.12 + 0.07 * (this._bn % 3), life: 1.1, k: 0.55, color: 0xd8ceff });
      // the tree rises: a second ply branches from the candidate square, higher
      const SQ2 = ['f5', 'g6', 'c7', 'h5', 'e8', 'a6'];
      fx.arc(b0, bl(up(sqp(SQ2[this._bn % SQ2.length]))), { lift: 0.3, life: 1.0, k: 0.35, color: 0xb8acff });
      // the search escapes the board: a branch leaves and circles the head
      if (this._bn % 3 === 0) st.orbits?.launch('shard', b0, { anchor: 'head', r: 0.75, life: 5 });
      // the squares involved in the tactic pulse on the board
      const bn = new THREE.Vector3(0, 1, 0).applyQuaternion(g.board.quaternion);
      fx.ring(bl(up(sqp(target), 0.016)), { normal: bn, r0: 0.02, r1: 0.11, life: 0.7, k: 0.6, color: 0xcfc4ff });
    }
    // evaluation pressure: the chosen square glows harder as calculation converges
    if (fx && calc > 0.4 && t > 8.6 && t < 10.6 && t - (this._ev ?? -9) > 0.4) {
      this._ev = t;
      fx.ring(bl(up(sqp('h3'), 0.016)), { normal: new THREE.Vector3(0, 1, 0).applyQuaternion(g.board.quaternion), r0: 0.03, r1: 0.16, life: 0.8, k: 0.8, color: 0xffd9b0 });
      fx.glow(bl(up(sqp('h3'), 0.1)), 0xffd9b0, 0.5, 0.5);
    }
    if (fx) {
      for (const [x, sqn] of [[6.2, 'b1'], [7.6, 'g3']]) if (this.#cross(x)) fx.burst(bl(up(sqp(sqn), 0.06)), { n: 12, to: bl(up(sqp('b3'), 0.06)), drag: 2.5, color: 0x9a8cff, speed: 0.25, life: 0.9, size: 0.035 });
      if (this.#cross(8.8)) fx.burst(bl(up(sqp('h3'), 0.04)), { n: 18, ring: true, speed: 0.55, life: 0.9, color: 0xffd9b0, size: 0.04, drag: 2.2 });
      if (this.#cross(8.9)) fx.arc(bl(up(sqp('b3'))), bl(up(sqp('h3'))), { lift: 0.1, life: 3.8, k: 0.85, color: 0xffe6c8, packet: false, follow: () => [bl(up(sqp('b3'))), bl(up(sqp('h3')))] });
      if (this.#cross(9.4)) fx.arc(bl(up(sqp('b3'), 0.015)), bl(up(sqp('h3'), 0.015)), { straight: true, life: 2.6, k: 0.5, color: 0xd8ceff, follow: () => [bl(up(sqp('b3'), 0.015)), bl(up(sqp('h3'), 0.015))] });
      if (this.#cross(12.95)) {
        // mate: the line holds, the king falls, one radial shock across the board and beyond
        const bn = new THREE.Vector3(0, 1, 0).applyQuaternion(g.board.quaternion);
        fx.burst(bl(up(sqp('h1'), 0.12)), { n: 34, speed: 0.9, life: 1.1, color: 0xfff0e0, size: 0.055, drag: 2 });
        fx.ring(bl(up(sqp('h1'), 0.02)), { normal: bn, r0: 0.05, r1: 1.4, life: 1.3, k: 1.0, color: 0xfff0e0 });
        fx.ring(bl(up(sqp('h1'), 0.02)), { normal: bn, r0: 0.05, r1: 0.8, life: 1.0, k: 0.7, color: 0xffd9b0 });
        fx.glow(bl(up(sqp('h1'), 0.2)), 0xfff0e0, 1.0, 0.9);
      }
    }
    // clock rings deplete; the figure's hand taps after the move
    g.clock.forEach((r, i) => {
      r.position.copy(sqp(i ? 'h8' : 'a8')).add(new THREE.Vector3(i ? 0.22 : -0.22, 0.03, -0.12));
      r.rotation.x = -Math.PI / 2;
      const left = i ? 1 - ramp(t, 2, 12.6) * 0.62 : 1 - ramp(t, 12.8, 17) * 0.4;
      r.geometry.dispose();
      r.geometry = new THREE.RingGeometry(0.055, 0.07, 40, 1, Math.PI / 2, TAU * left);
      r.material.opacity = show * (i ? 0.9 : 0.6);
    });
    // the body: study, calculate (candidate selves reach), decide, play quickly, tap the clock
    const study = pulse(t, 1.6, 2.6, 13.2, 15.0);
    out.attention = { world: st.group.localToWorld(bl(sqp(t < 12.6 ? 'e3' : 'h2'))), k: 0.85 * study };
    out.headPitch = 0.12 * study;
    out.chestPitch = 0.06 * study;
    // the hips join the study (weight toward the board side, knees soft); the move shifts the
    // supporting leg, the torso's turn is countered by the pelvis
    out.weightBias = 0.35 * study + 0.45 * reach0(t);
    out.knees = 0.012 * study;
    out.pelvisYaw = -0.06 * reach0(t);
    // right hand: to the chin while calculating (not the Thinker: fingertips only, briefly), then the move
    const hand = 'R';
    const reach = pulse(t, 10.6, 11.2, 12.7, 13.3);
    // the wrist for a grasp from above: up and back toward the figure from the piece's crown, so the
    // fingers come down onto it (a hand's reach), palm toward the piece, thumb on the near side
    const toFig = (w) => { const v = new THREE.Vector3(this.frame.pos.x - w.x, 0, this.frame.pos.z - w.z); return v.lengthSq() > 1e-6 ? v.normalize() : v; };
    const wristFor = (w, up = 0.16, back = 0.24) => w.clone().addScaledVector(toFig(w), back).add(new THREE.Vector3(0, up, 0));
    const qWorld = bl(g.wQ.position.clone().add(new THREE.Vector3(0, 0.11, 0)));
    const tap = pulse(t, 12.9, 13.1, 13.3, 13.6);
    const clockW = bl(g.clock[1].position.clone().add(new THREE.Vector3(0, 0.02, 0)));
    const qWrist = wristFor(qWorld), cWrist = wristFor(clockW, 0.13, 0.3);
    const tgt = tap > 0.01 ? cWrist.lerp(qWrist, 1 - tap) : qWrist;
    const thinkHand = pulse(t, 4.0, 5.0, 8.6, 9.6);
    // the grasp closes on the queen while it is carried and opens as it is set down
    const grip = pulse(t, 11.0, 11.3, 12.45, 12.7);
    // the chosen move lights through the hand
    if (st.fx && grip > 0.3) st.fx.glow(qWorld, 0xffe6c8, 0.35 * grip, 0.3);
    if (reach + tap > 0.01) {
      out.arms[hand] = {
        ik: this.fig(tgt), ikK: Math.max(reach, tap) * P, ikW: 12,
        // a pinch from above for the piece; flat and downward for the clock
        // the grasp turns continuously into the flat clock tap (no switch)
        palm: [-0.3 + 0.2 * tap, -0.85 - 0.15 * tap, 0.4 - 0.3 * tap],
        fingers: null, fdown: 0.95 - 0.6 * tap,
        pole: [0.55, -1, -0.45],
        curl: lerp(0.3 + 0.35 * grip, 0.2, tap), index: lerp(0.25 + 0.35 * grip, 0.1, tap), thumb: 0.4 + 0.35 * grip, flex: 0,
      };
    } else if (thinkHand > 0.01) {
      // fingertips briefly to the chin: palm toward the face, forearm up, elbow down by the ribs
      const chin = st.bonePoint('head', [0, -0.27, 0.12]);
      out.arms[hand] = { ik: this.fig(chin), ikK: thinkHand * 0.85 * P, ikW: 9, palm: [-0.35, 0.15, -1], fingers: [-0.15, 1, 0.25], pole: [0.25, -1, 0.05], curl: 0.55, index: 0.35, thumb: 0.3, flex: 0 };
    }
    // candidate selves: two ghosts reach toward the rejected squares, then dissolve
    for (const [i, sqn, k0, k1] of [[1, 'g3', 4.6, 7.8], [2, 'b1', 4.9, 6.6]]) {
      const k = pulse(t, k0, k0 + 0.8, k1, k1 + 0.8) * P;
      if (k > 0.01) out.ghosts.push({ kind: 'pose', slot: i - 1, k: 0.78 * k * (t > k1 ? 0.6 + 0.4 * Math.sin(t * 40) ** 2 : 1), arm: 'R', target: this.fig(wristFor(bl(sqp(sqn).add(new THREE.Vector3(0, 0.12, 0))))), shift: (i === 1 ? 1 : -1) * 0.13 });
    }
    // phase: the head calculates in layers; the hand that plays charges
    this.#add(out, 'head', [0.25 * calc, 0.75 * pulse(t, 3.4, 4.4, 9.6, 10.8), 0, 0]);
    this.#add(out, 'handR', [0.45 * reach, 0, 0, 0]);
    // the decision travels from the head down the reaching arm (layers, briefly)
    this.#front(out, ['head', 'neck', 'clavR', 'upperArmR', 'foreArmR', 'handR', 'indexR'], t, 10.1, 0.09, 'slice', 0.7);
    // the rejected stalemate breaks into cells (on the candidate, read through the board)
    if (this.#cross(1.0)) this.st.emit('chess-assemble');
    if (this.#cross(3.3)) this.st.emit('chess-branch', { n: 3 });
    if (this.#cross(6.4)) this.st.emit('chess-reject', { k: 0 });
    if (this.#cross(7.8)) this.st.emit('chess-reject', { k: 1 });
    if (this.#cross(12.5)) this.st.emit('chess-move');
    if (this.#cross(13.0)) this.st.emit('chess-clock');
    if (this.#cross(13.2)) this.st.emit('chess-mate');
    // the influences: Order wins the decision (the stalemate was the impulsive line)
    out.decide = pulse(t, 5.0, 6.0, 9.6, 10.6);
    out.lean = t < 8.2 ? 0.6 : -0.8;
    out.merge = pulse(t, 13.2, 13.6, 14.4, 15.4);
  }

  // ------------------------------------------------------------------ piano
  #piano(time, dt, out, c) {
    const p = this.piano, t = this.t, st = this.st;
    const P = this.present;
    const show = pulse(t, 0.3, 1.8, 14.8, 16.6) * P;
    p.group.visible = show > 0.01;
    const R = 1.3, yK = PLATE_Y + 1.13 * S;
    const keyPos = (slot) => {
      const a = (slot - (p.nW - 1) / 2) * 0.1;
      return this.at(Math.cos(a) * R - 0.2, Math.sin(a) * R, yK);
    };
    // keys assemble from the centre outward
    p.keys.forEach((k, i) => {
      const e = clamp(show * 1.6 - Math.abs(k.slot - 4.5) * 0.08, 0, 1);
      const pos = keyPos(k.slot);
      k.m.position.copy(pos);
      k.m.position.y += (k.isB ? 0.035 : 0) - k.down * 0.045 + (1 - e) * 0.4;
      const a = (k.slot - (p.nW - 1) / 2) * 0.1;
      k.m.rotation.set(0.07 + k.down * 0.1, this.frame.yaw - a, 0, 'YXZ');
      k.m.scale.setScalar(Math.max(0.001, e));
      k.down = Math.max(0, k.down - dt * 5);
      k.glow = Math.max(0, k.glow - dt * 1.6);
      k.m.material.emissiveIntensity = 1.4 * k.glow;
      k.m.material.opacity = 0.9 * show;
    });
    // the fallboard follows the arc, just behind and above the keys
    const F = this.frame;
    p.fall.position.set(F.pos.x - Math.sin(F.yaw) * 0.2, yK + 0.07, F.pos.z - Math.cos(F.yaw) * 0.2);
    p.fall.rotation.set(0, F.yaw, 0);
    p.fall.scale.setScalar(Math.max(0.001, show) * (R + 0.2) / 1.5);
    p.fall.material.opacity = 0.8 * show;
    // the phrase: each note presses a key, lights it, sends up an arc and a timing trace
    const handAt = { L: null, R: null };
    for (const [nt, key, hand] of p.phrase) {
      if (this.#cross(nt)) {
        const k = p.keys[key];
        k.down = 1;
        k.glow = 1;
        const tr = p.trails.find((x) => time - x.t0 > 2.2) ?? p.trails[0];
        tr.t0 = time;
        tr.key = key;
        st.emit('piano-note', { key, hand });
      }
      // each hand heads for its next note a little early
      if (nt > t - 0.05 && !handAt[hand]) handAt[hand] = { key, nt };
    }
    for (const tr of p.trails) {
      const age = time - tr.t0, arr = tr.l.geometry.attributes.position.array;
      const k = p.keys[tr.key];
      const base = k.m.position;
      for (let j = 0; j < tr.N; j++) {
        const u = j / (tr.N - 1);
        // a harmonic arc: rises and curls, its height set by the key's pitch
        arr[j * 3] = base.x + Math.sin(u * Math.PI * 2 + tr.key) * 0.05 * u;
        arr[j * 3 + 1] = base.y + 0.04 + u * (0.9 + 0.08 * tr.key) * Math.min(1, age * 2.2);
        arr[j * 3 + 2] = base.z + Math.cos(u * Math.PI * 2 + tr.key) * 0.05 * u;
      }
      tr.l.geometry.attributes.position.needsUpdate = true;
      tr.l.material.opacity = Math.max(0, 1 - age / 2.2) * show;
    }
    // score and performance ticks above the keys: offset early, aligned by the end (PianoMir)
    const align = ramp(t, 3, 11.5);
    const m = new THREE.Matrix4();
    p.ticks.forEach((tk, r) => {
      for (let i = 0; i < 12; i++) {
        const slot = 1 + i * 0.75;
        const off = r ? (1 - align) * 0.35 * Math.sin(i * 2.1 + 0.5) : 0;
        const pos = keyPos(slot + off);
        pos.y += 0.62 + r * 0.08;
        pos.addScaledVector(new THREE.Vector3(Math.sin(F.yaw), 0, Math.cos(F.yaw)), 0.4);
        m.makeTranslation(pos.x, pos.y, pos.z);
        tk.setMatrixAt(i, m);
      }
      tk.instanceMatrix.needsUpdate = true;
      tk.material.opacity = show * pulse(t, 2.4, 3.2, 13.5, 15) * (r ? 0.9 : 0.7);
    });
    // hands: a pianist's hands. The wrist sits over the key fronts on the player's side, a hand's
    // reach short of the strike point; palms face the keys, fingers run along the keys and a little
    // inward (thumbs in), fingers fall from above. Each hand keeps its own time: it travels early to
    // its next note, rises off the keys in the longer gaps, and the two never mirror each other.
    const right = new THREE.Vector3(-Math.cos(F.yaw), 0, Math.sin(F.yaw));
    const play = pulse(t, 1.8, 2.8, 12.6, 13.8) * P;
    let lastHand = null, lastT = -9;
    for (const [nt, , hand] of p.phrase) if (nt <= t && nt > lastT) (lastT = nt), (lastHand = hand);
    for (const hand of ['L', 'R']) {
      if (play < 0.01) continue;
      const nx = handAt[hand];
      const k = nx ? p.keys[nx.key] : p.keys[hand === 'L' ? 4 : 11];
      const a = (k.slot - (p.nW - 1) / 2) * 0.1;
      const kf = new THREE.Vector3(Math.sin(F.yaw - a), 0, Math.cos(F.yaw - a));
      const pos = keyPos(k.slot);
      const press = nx ? Math.exp(-Math.pow((t - nx.nt) / 0.08, 2)) : 0;
      const gap = nx ? nx.nt - t : 2;
      const rise = smoothstep(gap, 0.3, 0.75); // off the keys between phrases
      const own = hand === 'L' ? Math.sin(time * 2.3) : Math.sin(time * 3.1 + 1.3);
      pos.addScaledVector(kf, k.isB ? -0.26 : -0.38);
      pos.y += 0.1 - 0.04 * press + 0.12 * rise + 0.01 * own;
      const sd = hand === 'L' ? 1 : -1;
      const fingers = kf.clone().addScaledVector(right, sd * 0.2).add(new THREE.Vector3(0, -0.2 - 0.12 * press + 0.15 * rise, 0));
      out.arms[hand] = {
        ik: this.fig(pos), ikK: play, ikW: 14, arc: 0.35,
        palm: [0, -1, 0], fingers: [fingers.x, fingers.y, fingers.z], abs: true,
        pole: [0.8, -1, -0.3],
        curl: 0.95 + 0.2 * press - 0.4 * rise, index: 0.8 + 0.4 * press - 0.45 * rise, thumb: 0.35, flex: 0,
      };
    }
    // attention: the hand that just played (a pianist watches the leaps, not a fixed point)
    const watch = p.phrase.find(([nt]) => nt > t);
    const wKey = watch ? p.keys[watch[1]] : p.keys[8];
    this._pw = (this._pw ?? keyPos(8)).lerp(keyPos(wKey.slot), Math.min(1, dt * 2.5));
    out.attention = { world: st.group.localToWorld(this._pw.clone()), k: 0.6 * pulse(t, 1.8, 2.6, 12.0, 13.5) };
    out.headPitch = 0.14 * pulse(t, 2, 3, 12, 13.5);
    out.chestPitch = 0.05 * play;
    // the body leans a little into whichever hand is working
    this._pl = (this._pl ?? 0) + ((lastHand === 'L' ? 1 : lastHand === 'R' ? -1 : 0) - (this._pl ?? 0)) * Math.min(1, dt * 1.6);
    // the rhythm: hands and forearms run slightly out of time with themselves (echoes)
    const echo = pulse(t, 3.2, 4.2, 11.5, 12.8) * P;
    if (echo > 0.01) {
      out.ghosts.push({ kind: 'delay', delay: 0.12, k: 0.55 * echo, mask: 'arms' });
      out.ghosts.push({ kind: 'delay', delay: 0.26, k: 0.3 * echo, mask: 'arms' });
    }
    this.#add(out, 'chest', [0.3 * echo, 0, 0, 0]);
    this.#add(out, 'handL', [0.6 * echo, 0, 0, 0]);
    this.#add(out, 'handR', [0.6 * echo, 0, 0, 0]);
    out.chestRoll = (0.035 * this._pl + 0.015 * Math.sin(time * 2.2) * echo) * play;
    // the lower body: weight drifts toward the working hand's side, the pelvis counters the
    // torso, the knees stay soft
    out.weightBias = -0.55 * this._pl * play;
    out.pelvisYaw = 0.05 * this._pl * play;
    out.knees = 0.014 * play;
  }

  // ------------------------------------------------------------------ clarinet
  #clarinet(time, dt, out, c) {
    const cl = this.clar, t = this.t, st = this.st;
    const P = this.present;
    const show = pulse(t, 0.6, 2.0, 12.6, 14.4) * P;
    cl.group.visible = cl.wave.visible = cl.pitch.visible = show > 0.01;
    // the instrument of light: from the mouth, down and forward
    // the mouth plane: the head bone's origin is at the neck joint, the mouth ~7 cm above it
    const lips = st.bonePoint('head', [0, 0.065, 0.095]);
    const fwd = new THREE.Vector3(Math.sin(st.att.torso.v), 0, Math.cos(st.att.torso.v));
    const playDir = fwd.clone().multiplyScalar(Math.cos(0.95)).add(new THREE.Vector3(0, -Math.sin(0.95), 0)).normalize(); // ~36° out from the body
    // prepare → lift → settle at the lips → play → lower: the instrument is first held across the
    // body (mouthpiece up at the left, angled down to the right), lifted to the mouth, and lowered
    // the same way at the end (a velocity-continuous smootherstep, never a jump); the hands carry it
    const sideR = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize(); // figure's right
    const liftK = THREE.MathUtils.smootherstep(pulse(t, 0.9, 2.3, 12.3, 13.9), 0, 1);
    const restP = st.bonePoint('chest', [0, -0.2, 0.3]).addScaledVector(sideR, -0.25);
    const restDir = sideR.clone().multiplyScalar(0.75).add(new THREE.Vector3(0, -0.55, 0)).addScaledVector(fwd, 0.2).normalize();
    const mouth = restP.lerp(lips, liftK);
    const dir = restDir.lerp(playDir, liftK).normalize();
    // the instrument: mouthpiece at the lips, the body down and forward, its front facing out
    const yAxis = dir.clone().negate();
    const zAxis = fwd.clone().addScaledVector(yAxis, -fwd.dot(yAxis)).normalize();
    const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis);
    cl.body.position.copy(mouth);
    cl.body.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
    cl.body.scale.setScalar(Math.max(0.001, THREE.MathUtils.smootherstep(show, 0, 1)));
    const bellP = mouth.clone().addScaledVector(dir, cl.len);
    // the phrase: which note sounds now
    let note = null;
    for (const [nt, step, len] of cl.phrase) {
      if (this.#cross(nt)) {
        st.emit('clar-note', { step, len });
        const fx = st.fx;
        if (fx) {
          const bp = mouth.clone().addScaledVector(dir, cl.len);
          for (let k = 0; k < 3; k++) fx.arc(bp, bp.clone().addScaledVector(fwd, 1.0 + 0.25 * k).add(new THREE.Vector3(0, 0.25 + 0.11 * step + 0.08 * k, 0)).addScaledVector(new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize(), (k - 1) * 0.18), { lift: 0.18 + 0.05 * k, life: len + 1.0, k: 0.55 - 0.12 * k, color: k ? 0xffd2a8 : 0xfff0e0 });
        }
      }
      if (t >= nt && t < nt + len) note = { step, u: (t - nt) / len };
    }
    // fingering: rings light by the note
    cl.rings.forEach((r, i) => {
      r.position.copy(mouth).addScaledVector(dir, 0.36 + i * 0.1 + (i > 2 ? 0.28 : 0)).addScaledVector(zAxis, 0.045);
      const closed = note ? i < 6 - note.step : false;
      r.material.opacity = show * (closed ? 0.7 : 0.12);
    });
    // the standing wave in the bore (odd harmonics: a clarinet's closed pipe)
    const arr = cl.wave.geometry.attributes.position.array, col = cl.wave.geometry.attributes.color.array;
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    // the envelope eases in with the breath and out with the release (never pops)
    this._cAmp = (this._cAmp ?? 0) + ((note ? 1 : 0) - (this._cAmp ?? 0)) * Math.min(1, dt * 5);
    const kTo = 1 + (note?.step ?? 0) * 0.35;
    this._cK = (this._cK ?? kTo) + (kTo - (this._cK ?? kTo)) * Math.min(1, dt * 6); // the mode glides between notes
    const NW = cl.waveN;
    for (let j = 0; j < NW; j++) {
      const u = j / (NW - 1);
      const env = Math.abs(Math.sin(u * Math.PI * (this._cK * 2 + 1) * 0.5));
      // inside the bore: a fine standing wave (the instrument's silhouette stays the read; the
      // spectacle radiates from the bell)
      const w = (0.003 + 0.02 * env * this._cAmp * (0.85 + 0.15 * Math.sin(time * 7))) * show;
      const c0 = mouth.clone().addScaledVector(dir, 0.1 + u * (cl.len - 0.2)).addScaledVector(zAxis, 0.07);
      const a = c0.clone().addScaledVector(side, w), b = c0.clone().addScaledVector(side, -w);
      arr.set([a.x, a.y, a.z, b.x, b.y, b.z], j * 6);
      const k = 0.4 * (0.25 + 0.75 * env) * (0.35 + 0.65 * this._cAmp) * show;
      col.set([k, k * 0.9, k * 0.78, k, k * 0.9, k * 0.78], j * 6);
    }
    cl.wave.geometry.attributes.position.needsUpdate = true;
    cl.wave.geometry.attributes.color.needsUpdate = true;
    // the pitch trace, drawn from the bell
    cl.hist.push(bellP.clone().add(new THREE.Vector3(0, 0.12 + (note ? note.step * 0.07 : -0.02), 0)));
    if (cl.hist.length > cl.pitchN) cl.hist.shift();
    const pa = cl.pitch.geometry.attributes.position.array;
    for (let j = 0; j < cl.pitchN; j++) {
      const h = cl.hist[Math.max(0, cl.hist.length - cl.pitchN + j)] ?? bellP;
      const age = (cl.pitchN - j) * 0.018;
      pa.set([h.x + fwd.x * age * 0.45 + side.x * age * 0.25, h.y + age * 0.12, h.z + fwd.z * age * 0.45 + side.z * age * 0.25], j * 3);
    }
    cl.pitch.geometry.attributes.position.needsUpdate = true;
    cl.pitch.material.opacity = 0; // the old pitch graph is retired (acoustic structure below)
    cl.pitch.visible = false;
    cl.bellP = bellP.clone();
    if (st.fx && note) {
      const fx = st.fx;
      // radiated sound: concentric rings leave the bell along its axis
      if (time - (this._bell ?? -9) > 0.32) {
        this._bell = time;
        fx.ring(bellP.clone().addScaledVector(dir, 0.04), { normal: dir, r0: 0.08, r1: 0.55 + 0.05 * note.step, life: 1.3, k: 0.7, color: 0xffe2c4 });
        fx.glow(bellP.clone().addScaledVector(dir, 0.35), 0xffd2a8, 0.2, 0.4);
      }
      // pressure nodes of the standing wave in the bore pulse in place
      if (time - (this._node ?? -9) > 0.22) {
        this._node = time;
        const nN = 2 + (note.step >> 1);
        for (let j = 1; j <= nN; j++) fx.burst(mouth.clone().addScaledVector(dir, 0.1 + (j / (nN + 0.5)) * (cl.len - 0.2)).addScaledVector(zAxis, 0.07), { n: 1, speed: 0.02, life: 0.45, size: 0.028, alpha: 0.5, color: 0xfff0e0 });
      }
      // the pitch as a spatial ribbon: each note's path curves out of the bell, its height the pitch
    }
    // breath: a fine stream into the mouthpiece while a note sounds (never smoke)
    if (st.fx && note && time - (this._br2 ?? -9) > 0.05) {
      this._br2 = time;
      st.fx.burst(mouth.clone().addScaledVector(dir, 0.05), { n: 1, dir, dirK: 0.95, speed: 0.9, life: 0.45, size: 0.022, alpha: 0.45, color: 0xffffff, drag: 0.5 });
    }
    // the body: both hands on the implied instrument, head inclined; breath lights the chest
    const hold = pulse(t, 0.6, 1.4, 13.6, 14.6) * P; // the hands hold it from preparation to the end
    // left hand on the upper joint, right hand on the lower, both just in front of the body
    // each hand wraps the instrument from its own side: the wrist beside and a little behind the
    // bore, the palm toward it (medial), the fingers running forward over the tone holes, thumbs
    // behind; forearms near neutral rotation, elbows relaxed by the ribs, shoulders down
    for (const [hand, along] of [['L', 0.47], ['R', 1.0]]) {
      const sd = hand === 'L' ? -1 : 1; // `side` points to the figure's right
      // the grip: the palm rests against the bore's side (its surface touching, not sunk in), knuckles
      // level with the bore's axis, so the two-segment fingers fold over the keywork with the
      // fingertips on its front, and the thumb stays behind; the wrist follows from the hand's length
      const fwdV = zAxis.clone().multiplyScalar(0.97).addScaledVector(dir, 0.2).normalize();
      const lift = note ? 0.004 * Math.sin(time * 9 + along * 7) : 0;
      const pos = mouth.clone().addScaledVector(dir, along).addScaledVector(side, sd * 0.09).addScaledVector(fwdV, -0.2);
      pos.y += lift;
      out.arms[hand] = {
        ik: this.fig(pos), ikK: hold, ikW: 10,
        palm: [-sd * side.x, -0.1, -sd * side.z], fingers: [fwdV.x, fwdV.y, fwdV.z], abs: true,
        pole: [0.25, -1, -0.1],
        // fingering: each hand's finger group presses and lifts with the phrase, out of step with the
        // other (left hand leads high notes, right hand the low), a few millimetres, never off the keys
        tip: 1.15 + (note ? 0.06 * Math.sin((note.u * 3 + (hand === 'L' ? 0.2 : 0.7)) * Math.PI) : 0),
        curl: 0.78 + (note ? 0.06 * Math.sin((note.u * 3 + (hand === 'L' ? 0 : 0.5)) * Math.PI) * (hand === 'L' ? (note.step > 2 ? 1 : 0.4) : (note.step > 2 ? 0.4 : 1)) : 0),
        index: 0.72 + (note ? 0.08 * Math.sin((note.u * 2 + (hand === 'L' ? 0.25 : 0.75)) * Math.PI) : 0),
        thumb: 0.6, flex: 0,
      };
    }
    out.headPitch = 0.16 * hold;
    const breath = note ? Math.sin(Math.PI * Math.min(1, note.u * 1.2)) : 0;
    this.#add(out, 'chest', [0.45 * breath * hold, 0, 0, 0]);
    out.knees = (0.008 + 0.005 * breath) * hold;
    out.weightBias = 0.18 * Math.sin(time * 0.37) * hold;
    out.chestPitch = -0.02 * breath * hold;
    this.#add(out, 'head', [0.25 * breath * hold, 0, 0, 0]);
    // sustained tones blur the arms into slow layers
    this.#add(out, 'armL', [0, 0.5 * pulse(t, 6.2, 7, 7.8, 8.6) * hold, 0, 0]);
    this.#add(out, 'armR', [0, 0.5 * pulse(t, 6.2, 7, 7.8, 8.6) * hold, 0, 0]);
    out.attention = { world: st.group.localToWorld(bellP.clone().addScaledVector(fwd, 1.2)), k: 0.35 * hold };
  }

  // ------------------------------------------------------------------ models
  #modelsMode(time, dt, out, c) {
    const t = this.t, st = this.st, M = this.models;
    const P = this.present;
    const sets = [['openai', 'claude', 'deepseek'], ['gemini', 'qwen', 'grok'], ['claude', 'kimi', 'mistral'], ['openai', 'gemini', 'qwen']];
    const set = sets[(this.variant >> 1) % sets.length];
    const winner = set[(this.variant + 1) % 3];
    // places in front: an arc at head height, left, centre, right of the viewer's view
    // never in front of the face: the centre one rides above the head, the others wide of the shoulders
    const place = (i) => this.at(i === 1 ? 1.0 : 1.3, (i - 1) * 1.45, PLATE_Y + (i === 1 ? 2.05 * S + 0.6 : 1.72 * S));
    const summon = pulse(t, 0.6, 2.4, 14.6, 16.2) * P;
    set.forEach((id, i) => {
      const keep = id === winner ? 1 : 1 - ramp(t, 12.0, 13.0);
      M.summon(id, place(i), summon * keep);
      M.by[id].spinGoal = pulse(t, 4.6 + i * 0.35, 5.0 + i * 0.35, 5.8 + i * 0.35, 6.4 + i * 0.35);
    });
    // the hand that offers (right) and the prompt formed in it, copied out to each model: the
    // forearm comes up, the palm turns up, the left arm stays easy
    const offer = pulse(t, 1.0, 2.2, 4.6, 5.8);
    const palm = st.bonePoint('indexR', [0, -0.03, 0.02]);
    if (offer > 0.01) out.arms.R = { ik: this.fig(this.at(0.62, 0.32, PLATE_Y + 1.12 * S)), ikK: offer * P, ikW: 9, palm: [0.2, 1, 0.15], fingers: [-0.25, 0.15, 1], pole: [0.4, -1, -0.2], curl: 0.12, index: 0.08, thumb: 0.4, flex: 0 };
    const formed = pulse(t, 2.0, 2.6, 3.3, 3.4);
    for (let i = 0; i < 3; i++) {
      const fly = ramp(t, 3.3 + i * 0.08, 4.5 + i * 0.08);
      const pos = palm.clone().add(new THREE.Vector3(0, 0.1, 0)).lerp(M.pos(set[i]) ?? palm, fly);
      pos.y += Math.sin(Math.PI * fly) * 0.3;
      M.prompt(i, pos, Math.max(formed, pulse(t, 3.3, 3.5, 4.4, 4.6)) * P);
    }
    if (this.#cross(3.3)) {
      st.emit('tokens-out', { n: 3 });
      // the prompt goes out to each model: an arc from the hand to its logo
      for (const id of set) st.fx?.arc(palm, M.pos(id) ?? palm, { lift: 0.5, life: 1.4, k: 0.8, color: 0xe6dcff, follow: () => [st.bonePoint('indexR', [0, -0.03, 0.02]), M.pos(id)] });
    }
    this._ans ??= [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    // answers: each model's own structure, between it and the figure
    const ans = pulse(t, 5.0, 6.2, 12.2, 13.4);
    // two are weighed in the hands (left and right), the third waits; then one is chosen
    const weigh = pulse(t, 7.8, 8.6, 11.6, 12.4);
    const hands = [st.bonePoint('indexL', [0, 0.06, 0.06]), st.bonePoint('indexR', [0, 0.06, 0.06])];
    set.forEach((id, i) => {
      const from = M.pos(id) ?? palm;
      let pos = from.clone().lerp(this.at(1.05, (i - 1) * 0.8, PLATE_Y + 1.65 * S), ramp(t, 5.4, 7.2));
      if (i !== 1) pos.lerp(hands[i === 0 ? 0 : 1], weigh);
      // the chosen answer flows into the head
      const head = st.bonePoint('head', [0, 0.06, 0.08]);
      if (id === winner) pos.lerp(head, ramp(t, 12.6, 14.0));
      const k = id === winner ? ans + pulse(t, 12.2, 12.6, 13.6, 14.2) : ans * (1 - ramp(t, 11.8, 12.6));
      M.answer(i, id, pos, clamp(k, 0, 1) * P, id === winner ? 1 - 0.6 * ramp(t, 12.6, 14) : 1);
      this._ans[i].copy(pos);
      const fx = st.fx, col = M.by[id]?.def.color ?? 0xd8ceff;
      if (fx) {
        // each answer stays linked to the model that made it
        if (k > 0.3 && t < 12.2 && t - (this._link?.[i] ?? -9) > 1.2) {
          (this._link ??= [])[i] = t;
          fx.arc(M.pos(id) ?? pos, pos, { lift: 0.2, life: 1.3, k: 0.55, color: col, follow: () => [M.pos(id), this._ans[i]] });
        }
        if (this.#cross(5.0 + i * 0.15)) fx.burst(M.pos(id) ?? pos, { n: 14, color: col, speed: 0.45, life: 1.0, size: 0.05, to: pos, drag: 2 });
        // the response streams: a continuous coloured flow from the model into its answer
        if (k > 0.3 && t < 12.2 && time - (this._strm?.[i] ?? -9) > 0.09) {
          (this._strm ??= [])[i] = time;
          fx.burst(M.pos(id) ?? pos, { n: 1, color: col, speed: 0.1, life: 0.9, size: 0.04, to: pos, drag: 3.5, alpha: 0.85 });
        }
        // rejected: dissolves into its own colour; chosen: streams into the figure
        if (id !== winner && this.#cross(12.2)) fx.burst(pos, { n: 22, color: col, speed: 0.5, life: 1.2, size: 0.045, up: -0.2 });
        if (id === winner && t > 12.6 && t < 14 && time - (this._ch ?? -9) > 0.06) {
          this._ch = time;
          fx.burst(pos, { n: 2, color: col, speed: 0.15, life: 0.8, size: 0.04, to: st.bonePoint('head', [0, 0.06, 0.04]), drag: 3 });
        }
      }
    });
    if (this.#cross(5.0)) st.emit('model-in', { id: set[0] }), st.emit('model-in', { id: set[1] }), st.emit('model-in', { id: set[2] });
    if (this.#cross(8.6)) st.emit('beat-start', { a: set[0], b: set[2] });
    if (this.#cross(12.2)) st.emit('beat-resolve', { winner });
    if (this.#cross(13.4)) st.emit('resolve');
    // the body compares. Not two arms held out: the left hand receives, low and near; the right one
    // weighs, higher and further out, bobbing as if feeling the weight; the head looks from one to the
    // other and the torso follows the look; the weight shifts toward the side being considered. Then
    // a stillness (the decision); the chosen answer's hand closes and draws in, the other opens and
    // lets go.
    const look = Math.sin((t - 8.0) * 1.25);
    const lookS = smoothstep(look, -0.35, 0.35) * 2 - 1; // +1 left hand, -1 right hand
    const still = pulse(t, 11.4, 11.7, 12.0, 12.3);
    const win = set.indexOf(winner), wSide = win === 0 ? 'L' : win === 2 ? 'R' : null;
    const after = ramp(t, 12.2, 12.9);
    if (weigh > 0.01) {
      for (const [hand, i] of [['L', 0], ['R', 2]]) {
        const sd = hand === 'L' ? -1 : 1;
        const attend = hand === 'L' ? Math.max(0, lookS) : Math.max(0, -lookS);
        const chosen = wSide === hand ? after : 0, dropped = wSide && wSide !== hand ? after : wSide ? 0 : after;
        const bob = (1 - still) * (hand === 'R' ? 0.06 * Math.sin(time * 2.1) : 0.025 * Math.sin(time * 1.4 + 1));
        let pos = hand === 'L' ? this.at(0.72, -0.42, PLATE_Y + 1.18 * S + bob) : this.at(1.0, 0.6, PLATE_Y + 1.36 * S + bob);
        pos.y += 0.06 * attend;
        // chosen: drawn in toward the sternum; let go: drops to the side
        pos = pos.lerp(this.at(0.45, sd * 0.12, PLATE_Y + 1.3 * S), 0.7 * chosen).lerp(this.at(0.3, sd * 0.45, PLATE_Y + 0.92 * S), 0.8 * dropped);
        out.arms[hand] = {
          ik: this.fig(pos), ikK: weigh * P * (1 - 0.85 * dropped) + 0.0001, ikW: 8,
          palm: [0.15 - 0.4 * dropped, 1 - 1.6 * dropped, 0.1], fingers: [-0.3, 0.1, 1],
          pole: [0.5 + 0.2 * attend, -1, -0.25],
          curl: 0.18 + 0.25 * attend + 0.4 * chosen - 0.1 * dropped, index: 0.12 + 0.2 * attend + 0.35 * chosen, thumb: 0.35 + 0.2 * chosen, flex: 0,
          // the shoulder over the considered output lifts a little; the other relaxes
          clav: 0.025 * attend - 0.02 * (1 - attend),
        };
      }
    }
    const tgt = weigh > 0.3 && after < 0.5 ? (lookS > 0 ? hands[0] : hands[1]) : (M.pos(set[1]) ?? palm);
    out.attention = { world: st.group.localToWorld(tgt.clone()), k: 0.85 * pulse(t, 0.6, 1.4, 13.6, 15.0) };
    out.chestRoll = 0.05 * weigh * lookS * (1 - still);
    out.torsoYaw = 0.12 * weigh * lookS * (1 - after);
    out.weightBias = -0.6 * weigh * lookS * (1 - still) * (1 - after);
    out.pelvisYaw = -0.05 * weigh * lookS * (1 - after);
    out.knees = 0.01 * weigh;
    // phasing: the head becomes a constellation as the answers arrive; the hands hold cells
    this.#front(out, ['indexR', 'handR', 'foreArmR', 'upperArmR', 'clavR', 'neck', 'head'], t, 5.2, 0.12, 'full', 0.9);
    this.#add(out, 'head', [0.5 * ans, 0.3 * ans, 0, 0.75 * pulse(t, 6.6, 7.4, 10.4, 12.4)]);
    this.#add(out, 'handL', [0.3 * weigh, 0, 0.55 * weigh, 0]);
    this.#add(out, 'handR', [0.3 * weigh, 0, 0.55 * weigh, 0]);
    this.#add(out, 'chest', [0.6 * pulse(t, 12.8, 13.6, 14.4, 15.8), 0, 0, 0]);
    out.decide = weigh;
    out.lean = lookS * 0.8 * (1 - still);
    // comparison: tension between the two weighed answers, passed back and forth
    if (st.fx && weigh > 0.5 && after < 0.1 && time - (this._cmp ?? -9) > 0.9) {
      this._cmp = time;
      const ab = (this._cmpN = (this._cmpN ?? 0) + 1) % 2 ? [0, 2] : [2, 0];
      st.fx.arc(this._ans[ab[0]], this._ans[ab[1]], { lift: 0.18, life: 0.9, k: 0.6, color: 0xffffff, follow: () => [this._ans[ab[0]], this._ans[ab[1]]] });
    }
    out.merge = pulse(t, 12.2, 12.8, 13.6, 14.6);
  }

  // ------------------------------------------------------------------ rare events
  #crown(time, dt, out, c) {
    // Profile's signature rare event, staged (never a switch):
    //  1 recognition 0.4-2 · 2 halo 1.6-3.2 · 3 identity split 3-4.2 · 4 constellation 4.2-6 (the
    //  red tie lingers as a thin red line) · 5 ribbons 5-8 · 6 stage 6-6.6 · 7 PROFILE parts in depth
    //  (from the body's phase) · 8 reflection disagrees (the shell lags with the selves) · 9 peak 8
    //  · 10 collapse 8.6-11, in reverse
    const t = this.t, M = this.models, st = this.st, P = this.present, fx = st.fx;
    M.crownGoal = (0.35 * ramp(t, 0.4, 2.0) + 0.65 * ramp(t, 1.6, 3.2)) * (1 - ramp(t, 8.8, 10.6)) * P;
    out.attention = { world: st.group.localToWorld(st.bonePoint('head', [0, 1.2, -0.4])), k: 0.6 * pulse(t, 1.0, 2.0, 6.5, 8.0) };
    const pick = ['claude', 'gemini', 'qwen', 'deepseek', 'grok', 'mistral'][this.cycle % 6];
    const down = pulse(t, 6.8, 7.8, 9.8, 10.8);
    // the chosen model descends to the open hand, out at the shoulder's side (never over the chest or tie)
    M.summon(pick, this.at(0.85, 1.15, PLATE_Y + 1.55 * S), down);
    if (down > 0.01) out.arms.R = { ik: this.fig(this.at(0.62, 0.42, PLATE_Y + 1.2 * S)), ikK: down * P, ikW: 8, palm: [0.15, 1, 0.1], fingers: [-0.25, 0.15, 1], pole: [0.4, -1, -0.2], curl: 0.15, index: 0.1, thumb: 0.4, flex: 0 };
    // identity split: temporal selves trail the figure, then fold back
    const split = pulse(t, 3.0, 4.2, 8.6, 10.2) * P;
    if (split > 0.01) out.ghosts.push({ kind: 'delay', delay: 0.28, k: 0.4 * split, mask: 'full' }, { kind: 'delay', delay: 0.6, k: 0.24 * split, mask: 'full' });
    // constellation: a phase front passes up the body and back (the suit opens to its edges, the tie last)
    if (t > 4.2 && t < 11) this.#front(out, BODY_CHAIN, t, 4.2, 0.09, 'full', 0.75 * P);
    this.#add(out, 'head', [0.35 * M.crown, 0.25 * M.crown, 0, 0]);
    this.#add(out, 'chest', [0.3 * M.crown, 0, 0, 0]);
    out.decide = 0.4 * M.crown;
    out.lean = Math.sin(time * 0.7);
    out.merge = pulse(t, 7.8, 8.2, 8.8, 9.8);
    if (this.#cross(0.5)) st.emit('crown');
    if (this.#cross(6.0) && fx) {
      // the stage answers: the floor field expands from the figure
      const s0 = st.rig.stance(), feet = new THREE.Vector3(s0.x * S, PLATE_Y + 0.012, s0.z * S);
      fx.ring(feet, { r0: 0.4, r1: 3.2, life: 2.2, k: 0.8 });
      fx.ring(feet, { r0: 0.3, r1: 2.4, life: 2.6, k: 0.5, color: 0xffd9b0 });
      st._bloomGoal = Math.max(st._bloomGoal ?? 0, 0.9);
    }
    if (this.#cross(8.0) && fx) {
      // the peak: everything aligns for a moment (a halo pulse, no white flash)
      const c0 = st.bonePoint('head', [0, 0.25, -0.1]);
      fx.ring(c0, { r0: 0.5, r1: 3.0, life: 1.8, k: 0.9, color: 0xe6dcff });
      st.label?.sweep?.(time);
    }
    // ribbons: the halo converses in sequence, each member answering in its colour
    if (fx && t > 5 && t < 8.6 && M.crown > 0.6 && time - (this._cr ?? -9) > 0.4) {
      this._cr = time;
      const ids = ['gemini', 'openai', 'claude', 'grok', 'qwen', 'deepseek'];
      const i = (this._crN = (this._crN ?? 0) + 1) % ids.length, a = M.by[ids[i]], b = M.by[ids[(i + 1) % ids.length]];
      if (a && b) {
        fx.arc(a.pos, b.pos, { lift: 0.3, life: 1.2, k: 0.9, color: a.def.color, follow: () => [a.pos, b.pos] });
        fx.burst(a.pos, { n: 8, color: a.def.color, speed: 0.5, life: 1.0, size: 0.05 });
      }
    }
    if (fx && M.crown > 0.5 && t > 1.6 && t < 8.6 && time - (this._halo ?? -9) > 1.3) {
      this._halo = time;
      const c0 = st.bonePoint('head', [0, 0.25, -0.1]);
      fx.ring(c0, { r0: 0.4, r1: 2.6, life: 2.2, k: 0.7, color: 0xe6dcff });
    }
  }

  /** A phase front travelling along a chain of bones: each bone goes through the profile in turn. */
  #front(out, chain, t, t0, step, profile = 'full', k = 1) {
    chain.forEach((n, i) => {
      const x = t - t0 - i * step;
      if (x < 0 || x > 3.4) return;
      const shear = ramp(x, 0, 0.45) * (1 - ramp(x, 2.0, 2.9));
      const info = profile === 'full' ? ramp(x, 0.55, 1.15) * (1 - ramp(x, 1.75, 2.4)) : 0;
      this.#add(out, n, [k * (0.3 * shear + 0.35 * info), k * 0.85 * shear * (1 - 0.4 * info), 0, k * 0.95 * info]);
    });
  }

  #fullPhase(time, dt, out, c) {
    const t = this.t;
    // the signature: a second self falls out of time (lag), then from the right hand through the
    // head to the left hand and down, the body shears into layers, the layers lose their surface
    // and become a constellation, and everything returns the way it came; the second self collapses
    const P = this.present;
    const lag = pulse(t, 0.2, 0.8, 5.6, 7.0) * P;
    if (lag > 0.01) out.ghosts.push({ kind: 'delay', delay: 0.22, k: 0.55 * lag, mask: 'full' }, { kind: 'delay', delay: 0.45, k: 0.3 * lag, mask: 'full' });
    this.#front(out, BODY_CHAIN, t, 0.9, 0.11, 'full', P);
    out.scatter = 0.4 * pulse(t, 2.6, 3.4, 4.0, 4.8);
    if (this.#cross(0.8)) this.st.emit('phase-out');
    if (this.#cross(6.0)) this.st.emit('phase-in');
  }
}
