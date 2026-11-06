import * as THREE from 'three';
import { SCREEN_GLSL, BOUND_GLSL, PHOSPHOR_GLSL as PH } from './ProjectsScreen.js';
import { Portal } from './ProjectsPortal.js';
import { HOT, ramp, pulse, hash } from './ProjectsKit.js';

// Holographic type for the console: words built from small glass cells (a 5×7 dot-matrix, the
// console's own lettering), drawn as glass tiles with lit edges. A word can be assembled deep in the
// screen, come through the glass and stand in the station; cells inside the computer are drawn only
// through the glass, cells outside are ordinary objects, so a word can be half in, half out.
//  - Hologram: the large PROJECTS label of a showcase beat.
//  - TitleBeat: a project's name, shown briefly in front of the glass, then turned into that project's
//    own visual language (tiles, a detection grid, stack frames, a malfunction, sliced strips).

const FONT = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
};
const ADV = (ch) => (ch === ' ' ? 4 : 6);

/** Cells of the words, in cell units, centred: { x, y, row, line, letter, fx, r1..r4 }. */
function layout(lines) {
  const cells = [];
  let letter = 0;
  const n = lines.length;
  let cols = 0;
  lines.forEach((line, li) => {
    const chars = [...line];
    const width = chars.reduce((s, ch) => s + ADV(ch), 0) - 1;
    cols = Math.max(cols, width);
    let x = -width / 2;
    const ly = ((n - 1) / 2 - li) * 9;
    for (const ch of chars) {
      const g = FONT[ch];
      if (g) {
        let k = 0;
        for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
          if (g[r][c] !== '#') continue;
          cells.push({ x: x + c + 0.5, y: ly + 3 - r, row: r, line: li, letter, k: k++, lx: x + 2.5, ly });
        }
        letter++;
      }
      x += ADV(ch);
    }
  });
  // stroke ends (cells with at most one neighbour) are the ones that drift
  const key = (x, y) => `${x},${y}`;
  const at = new Set(cells.map((c) => key(c.x, c.y)));
  for (const c of cells) c.edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => at.has(key(c.x + dx, c.y + dy))).length <= 1;
  const minX = Math.min(...cells.map((c) => c.x)), maxX = Math.max(...cells.map((c) => c.x));
  cells.forEach((c, i) => {
    c.fx = (c.x - minX) / Math.max(maxX - minX, 1);
    c.r1 = hash(i * 1.37 + 0.5);
    c.r2 = hash(i * 2.11 + 7.3);
    c.r3 = hash(i * 3.71 + 1.9);
    c.r4 = hash(i * 5.13 + 4.4);
  });
  return { cells, cols, letters: letter, rows: n * 9 - 2 };
}

/** One word (or two lines) as instanced glass cells in the station's frame. */
export class HoloText {
  constructor(host, lines, { cell = 0.07, thick = 0.55 } = {}) {
    this.host = host;
    this.cell = cell;
    const L = layout(lines);
    Object.assign(this, { cells: L.cells, cols: L.cols, letters: L.letters, rows: L.rows });
    const N = (this.n = this.cells.length);
    // the first cell of each letter stands for the whole letter when a word collapses to blocks
    this.letterSize = Array.from({ length: L.letters }, (_, l) => this.cells.filter((c) => c.letter === l).length);
    const geo = new THREE.BoxGeometry(0.8, 0.8, thick);
    this.aA = new THREE.InstancedBufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage);
    this.aHot = new THREE.InstancedBufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aA', this.aA);
    geo.setAttribute('aHot', this.aHot);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...host.scr, uGain: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aA;
        attribute float aHot;
        varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying float vA; varying float vHot;
        void main() {
          vUv = uv; vA = aA; vHot = aHot;
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vW = w.xyz;
          vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        ${SCREEN_GLSL}
        ${BOUND_GLSL}
        uniform float uGain;
        varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying float vA; varying float vHot;
        void main() {
          if (vA < 0.003) discard;
          float fd, s;
          if (!scrBound(vW, fd, s)) discard;
          gl_FragDepth = fd;
          // glass: a lit edge round each face, a faint body, brighter at grazing angles
          vec2 e = min(vUv, 1.0 - vUv);
          float d = min(e.x, e.y);
          float rim = 1.0 - smoothstep(0.07, 0.07 + fwidth(d) * 1.5 + 0.02, d);
          float fr = pow(1.0 - abs(dot(normalize(vN), normalize(cameraPosition - vW))), 2.0);
          vec3 col = mix(${PH}, ${HOT}, vHot);
          vec3 c = col * (rim * 0.85 + 0.1 + 0.18 * fr);
          if (s > 0.0) c *= exp(-s * 0.12);
          gl_FragColor = vec4(c * vA * uGain, 1.0);
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, N);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 34;
    this.mesh.visible = false;
    host.group.add(this.mesh);
    this._m = new THREE.Matrix4();
    this._s = new THREE.Vector3();
  }

  set(i, p, q, sx, sy, sz, a, hot) {
    this._m.compose(p, q, this._s.set(sx, sy, sz));
    this.mesh.setMatrixAt(i, this._m);
    // a stretched cell has longer lit edges: keep its brightness about the same
    const c = this.cell * 1.2;
    const st = Math.max(sx, sy, sz) / (Math.min(sx, sy, sz) + 1e-6);
    this.aA.array[i] = a / (1 + 0.22 * Math.max(0, Math.max(sx, sy, sz) / c - 1)) / (1 + 0.05 * Math.max(0, st - 4));
    this.aHot.array[i] = hot;
  }

  commit(visible) {
    this.mesh.visible = visible;
    if (!visible) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aA.needsUpdate = true;
    this.aHot.needsUpdate = true;
  }

  /** Station-space bounds of the cells currently shown, for collision audits. */
  get shown() {
    return this.mesh.visible;
  }
}

/** A pose: position, orientation, scale (station frame). */
class Frame {
  constructor() {
    this.p = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.s = 1;
  }
  lerp(a, b, u) {
    this.p.lerpVectors(a.p, b.p, u);
    this.q.slerpQuaternions(a.q, b.q, u);
    this.s = a.s + (b.s - a.s) * u;
    return this;
  }
  /** From a screen-local point, at `scale` × the screen's own scale. */
  screen(host, x, y, z, scale = 1) {
    host.screenToStation.decompose(this.p, this.q, (Frame._s ??= new THREE.Vector3()));
    this.s = Frame._s.x * scale;
    this.p.set(x, y, z).applyMatrix4(host.screenToStation);
    return this;
  }
  /** A cell offset (cell units × cell) carried into the station. */
  apply(v, cell, out) {
    return out.copy(v).multiplyScalar(cell * this.s).applyQuaternion(this.q).add(this.p);
  }
}

const sm = (t, a, b) => ramp(t, a, b);
const E = new THREE.Euler();
const Q1 = new THREE.Quaternion();
const QI = new THREE.Quaternion();
const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();

/**
 * The PROJECTS hologram. Over about 16.6 s: its cells gather into the word deep in the screen; it
 * comes through the glass a letter at a time; expands and rises to hover above and beside the
 * console, turned to whoever is watching; drifts; then breaks apart, or is pulled back into a portal.
 */
export class Hologram {
  constructor(host) {
    this.host = host;
    this.text = new HoloText(host, ['PROJECTS'], { cell: 0.082, thick: 0.6 });
    this.length = 16.6;
    this.pull = new Portal(host.scr, { rx: 0.42, ry: 0.34, tier: 'normal' });
    host.group.add(this.pull.group);
    host.portals.push(this.pull);
    this.D = new Frame();
    this.F = new Frame();
    this.H = new Frame();
    this.f = new Frame();
    this.focus = new THREE.Vector3();
    this._prev = -1;
    this._p = new THREE.Vector3();
    this._yaw = null;
  }

  /** Where it hovers: above the head, a little toward the viewer, turned to face them. */
  #hover(time, dt) {
    const h = this.host;
    const H = this.H;
    // closer views (focus) see less above the head: lower and a little smaller there
    const fk = h.focusK ?? 0;
    H.p.set(0, 6.45 - 0.55 * fk, 0.55).applyMatrix4(h.machine.matrix);
    const cam = h.group.worldToLocal(V1.copy(h.ctx.camera.position));
    const dx = cam.x - H.p.x, dz = cam.z - H.p.z;
    const want = Math.atan2(dx, dz);
    if (this._yaw === null) this._yaw = want;
    const d = Math.atan2(Math.sin(want - this._yaw), Math.cos(want - this._yaw));
    this._yaw += d * Math.min(1, dt * 1.2);
    // toward the viewer, and (in the overview) toward the sanctum's centre, so the station at the
    // edge of the wide view keeps its label inside the frame
    H.p.x += Math.sin(this._yaw) * 0.55;
    H.p.z += Math.cos(this._yaw) * 0.55;
    const c = V2.set(-h.group.position.x, 0, -h.group.position.z).normalize();
    H.p.addScaledVector(c, 1.1 * (1 - fk));
    const pitch = -Math.atan2(cam.y - H.p.y, Math.hypot(dx, dz)) * 0.5;
    H.q.setFromEuler(E.set(pitch, this._yaw + Math.sin(time * 0.31) * 0.05, 0, 'YXZ'));
    H.p.y += Math.sin(time * 0.9) * 0.035;
    H.s = 1 - 0.22 * fk;
  }

  /** On the way up it swings out toward the viewer, clear of the brow. */
  #rise(f, k) {
    const b = Math.sin(k * Math.PI);
    f.p.y += b * 0.25;
    f.p.addScaledVector(V1.set(0, 0, 1).applyQuaternion(this.H.q), b * 0.55);
  }

  update(t, time, dt, variant = 'break') {
    const h = this.host;
    const T = this.text;
    if (!(t >= 0 && t < this.length)) {
      T.commit(false);
      this.pull.set(0, 0);
      this._prev = -1;
      return null;
    }
    this.D.screen(h, 0, 0.06, -2.4, 0.46);
    this.F.screen(h, 0, 0.12, 1.0, 0.6);
    this.#hover(time, dt);
    const pull = variant === 'pull';
    // the portal that takes it back, just past its far end, facing it
    const side = V2.set(1, 0, 0).applyQuaternion(this.H.q);
    const half = (T.cols / 2) * T.cell * this.H.s;
    const pc = this._p.copy(this.H.p).addScaledVector(side, half + 0.5);
    if (pull) {
      this.pull.group.position.copy(pc);
      this.pull.group.quaternion.setFromUnitVectors(V1.set(0, 0, 1), side.clone().negate());
      this.pull.set(pulse(t, 12.4, 13.1, 15.9, 16.5), time);
    } else this.pull.set(0, 0);
    const c0 = T.cell;
    const off = new THREE.Vector3();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    T.cells.forEach((c, i) => {
      let a = 1, hot = 0, sc = 1;
      off.set(c.x, c.y, 0);
      q.identity();
      const f = this.f;
      if (t < 2.9) {
        // gathering, deep in the screen
        const k = sm(t, 0.15 + c.r1 * 0.5 + c.fx * 0.5, 1.75 + c.r1 * 0.5 + c.fx * 0.5);
        off.x += (c.r2 - 0.5) * 26 * (1 - k);
        off.y += (c.r3 - 0.5) * 14 * (1 - k);
        off.z -= c.r4 * 30 * (1 - k);
        Q1.setFromEuler(E.set(c.r2 * 6, c.r3 * 6, c.r4 * 6));
        q.slerpQuaternions(Q1, QI, k);
        a = sm(t, 0, 0.7) * (0.25 + 0.75 * k);
        f.lerp(this.D, this.D, 0);
      } else if (t < 4.9 + 0.8) {
        // through the glass, letter by letter
        const k = sm(t, 2.9 + c.fx * 0.8, 4.0 + c.fx * 0.8);
        f.lerp(this.D, this.F, k);
        const z = -2.4 + (0.62 + 2.4) * k;
        hot = Math.exp(-((z / 0.2) ** 2)) * 0.9;
        if (t > 4.9) {
          const k2 = sm(t, 4.9 + c.fx * 0.25, 6.7 + c.fx * 0.25);
          if (k >= 1) f.lerp(this.F, this.H, k2), this.#rise(f, k2), off.multiplyScalar(1 + 0.3 * Math.sin(k2 * Math.PI));
        }
      } else if (t < 7.2) {
        // expanding, and up to where it hovers
        const k2 = sm(t, 4.9 + c.fx * 0.25, 6.7 + c.fx * 0.25);
        f.lerp(this.F, this.H, k2);
        this.#rise(f, k2);
        off.multiplyScalar(1 + 0.3 * Math.sin(k2 * Math.PI));
      } else {
        f.lerp(this.H, this.H, 0);
        // a vermilion scan passes along it now and then
        const scan = (a0, a1) => Math.exp(-(((c.fx - (sm(t, a0, a1) * 1.4 - 0.2)) / 0.07) ** 2)) * pulse(t, a0, a0 + 0.2, a1 - 0.2, a1);
        hot = 0.75 * Math.max(scan(8.0, 9.6), scan(10.9, 12.2));
        a = 0.88 + 0.12 * Math.sin(time * 6.0 + i * 1.7);
        if (!pull && t > 12.6) {
          // breaking apart
          const k = sm(t, 12.6 + c.r1 * 0.7, 15.4 + c.r1 * 0.7);
          // outward, upward and toward the viewer: never back into the console
          V1.set(c.x / 12 + (c.r2 - 0.5) * 2, c.y / 6 + 0.4 + (c.r3 - 0.3) * 1.6, 0.4 + c.r4 * 1.6).normalize();
          off.addScaledVector(V1, 34 * k * k);
          Q1.setFromEuler(E.set(k * 4 * c.r2, k * 5 * c.r3, k * 3 * c.r4));
          q.copy(Q1);
          a *= 1 - sm(k, 0.25, 1);
          hot = Math.max(hot, pulse(t, 12.5, 12.8, 13.1, 13.6) * 0.8);
        }
      }
      f.apply(off, c0, p);
      if (pull && t > 12.6) {
        // streaming into the portal, the far end of the word last
        const ord = 1 - c.fx;
        const k = sm(t, 12.9 + ord * 1.7 + c.r1 * 0.3, 13.7 + ord * 1.7 + c.r1 * 0.3);
        V1.copy(pc).addScaledVector(V2.set(0, 1, 0), (c.r2 - 0.5) * 0.12 * (1 - k));
        p.lerp(V1, k * k * (3 - 2 * k));
        p.y += Math.sin(k * Math.PI) * 0.12 * (c.r3 - 0.5);
        sc = 1 - 0.85 * k;
        a *= 1 - sm(k, 0.8, 1);
        hot = Math.max(hot, k * 0.6);
      }
      q.premultiply(f.q);
      const s = c0 * f.s * sc;
      T.set(i, p, q, s, s, s, a, hot);
    });
    T.commit(true);
    // heard: gathering, the crossing, the expansion, the end
    const cross = (at) => this._prev < at && t >= at;
    if (cross(0.2)) h.emit('holo-assemble');
    if (cross(2.9)) h.emit('holo-cross');
    if (cross(4.9)) h.emit('holo-expand');
    if (cross(12.6)) h.emit(pull ? 'holo-pull' : 'holo-break');
    this._prev = t;
    const out = t > 4.9 && t < 13.5;
    if (out) this.focus.copy(this.H.p);
    return { focus: out ? this.focus : null, activity: 0.4, crossing: t > 2.9 && t < 5.0 };
  }

  /**
   * The persistent station sign. After its first emergence the word stays above the console and
   * keeps rebuilding itself through independent loops of different lengths, so the combination
   * takes very long to repeat:
   *  edge drift (23 s) — stroke-end cells wander off and come back;
   *  reconstruction wave (37 s) — a front passes along the word, each cell flipping as it is rebuilt;
   *  letter break / reform (17 s) — part of one letter comes apart while another re-pixelates;
   *  portal transit (71 s) — a few cells leave through a tiny aperture and return through another;
   *  edge scan (29 s) — a vermilion scan; row misalignment (47 s) — rows slip and resolve;
   *  and a slow luminance modulation under all of it.
   * The word stays readable most of the time; `disrupted` reports the share of displaced cells.
   */
  persist(time, dt, { title = false, order = 0 } = {}) {
    const h = this.host;
    const T = this.text;
    this._born ??= h.ctx.app.params.has('psign') ? time - 8 : time; // ?psign: start already settled (review)
    const age = time - this._born;
    if (age < 7.3) return this.update(age, time, dt, 'break');
    this.pull.set(0, 0);
    this.#hover(time, dt);
    const f = this.H;
    const N = T.letters;
    const TAU = Math.PI * 2;
    const frac = (x) => x - Math.floor(x);
    // letter break / reform
    const kL = Math.floor(time / 17), tL = time - kL * 17;
    const L1 = Math.floor(hash(kL * 3.1) * N), L2 = (L1 + 3 + Math.floor(hash(kL + 7.7) * 3)) % N;
    const eBreak = pulse(tL, 1.0, 2.6, 5.4, 7.6), ePix = pulse(tL, 6.0, 7.0, 10.0, 12.0);
    // reconstruction wave: a 6 s pass every 37 s
    const uW = (time % 37) / 6;
    const wx = uW < 1 ? uW * 1.3 - 0.15 : -9;
    // portal transit: an 8 s window every 71 s
    const kP = Math.floor(time / 71), tP = time - kP * 71;
    const LP = Math.floor(hash(kP * 5.3 + 1) * N);
    // while ordered (hover, a fresh focus, a re-engagement) no cells leave through the apertures
    // tidies as fast as the console turns to the viewer; lets go more slowly
    this._ord = (this._ord ?? 0) + (order - (this._ord ?? 0)) * Math.min(1, dt * (order > (this._ord ?? 0) ? 6 : 2));
    const ord = this._ord;
    const portalOn = tP > 4 && tP < 13 && ord < 0.5;
    // misalignment: 4 s every 47 s
    const eMis = pulse(time % 47, 20, 20.8, 23, 24);
    // edge scan: 2.6 s every 29 s
    const uS = (time % 29) / 2.6;
    const scanX = uS < 1 ? uS * 1.4 - 0.2 : -9;
    // the two apertures, past the ends of the word
    const side = V2.set(1, 0, 0).applyQuaternion(f.q);
    const half = (T.cols / 2) * T.cell * f.s;
    this.ap ??= [0, 1].map(() => {
      const p = new Portal(h.scr, { rx: 0.07, ry: 0.07, shape: 'round', tier: 'micro' });
      p.ambient = true;
      p.holo = true;
      h.group.add(p.group);
      h.portals.push(p);
      return p;
    });
    const pa = this._pa ??= new THREE.Vector3(), pb = this._pb2 ??= new THREE.Vector3();
    pa.copy(f.p).addScaledVector(side, -half - 0.25).y += 0.18;
    pb.copy(f.p).addScaledVector(side, half + 0.25).y -= 0.12;
    this.ap.forEach((p, i) => {
      p.group.position.copy(i ? pb : pa);
      p.group.quaternion.setFromUnitVectors(V1.set(0, 0, 1), side.clone().multiplyScalar(i ? -1 : 1));
      p.set(portalOn ? pulse(tP, i ? 6.0 : 4.0, i ? 6.5 : 4.5, i ? 11.5 : 9.5, i ? 12.6 : 10.6) : 0, time);
    });
    const off = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Quaternion();
    let moved = 0;
    // quieter while a title plays, and only a faint presence while another station is focused
    const other = h.ctx.app.focused && h.ctx.app.focused !== 'projects' ? 1 : 0;
    this._other = (this._other ?? 0) + (other - (this._other ?? 0)) * Math.min(1, dt * 1.5);
    const gain = (title ? 0.55 : 1) * (1 - 0.72 * this._other);
    T.cells.forEach((c, i) => {
      off.set(c.x, c.y, 0);
      q.identity();
      let a = (0.84 + 0.1 * Math.sin(time * 0.7 + c.fx * 3) + 0.05 * Math.sin(time * 2.3 + i)) * gain;
      let hot = 0, sc = 1, disp = 0;
      if (c.edge && c.r4 < 0.6) {
        const d = Math.max(0, Math.sin(TAU * (time / 23 + c.r1))) ** 10;
        off.x += (c.r2 - 0.5) * 2.4 * d;
        off.y += (c.r3 - 0.3) * 2.0 * d;
        off.z += c.r4 * 1.6 * d;
        disp = Math.max(disp, 1.6 * d);
      }
      const band = Math.exp(-(((c.fx - wx) / 0.05) ** 2));
      if (band > 0.01) {
        q.setFromEuler(E.set(0, Math.PI * Math.min(1, band * 1.2), 0));
        off.z += band * 0.9;
        hot = Math.max(hot, band * 0.55);
      }
      if (c.letter === L1 && c.r1 < 0.45 && eBreak > 0) {
        off.x += (c.r2 - 0.5) * 3.2 * eBreak;
        off.y += (c.r3 - 0.5) * 2.6 * eBreak;
        off.z += (c.r4 + 0.2) * 2.4 * eBreak;
        q.setFromEuler(E.set(eBreak * c.r2 * 3, eBreak * c.r3 * 3, 0));
        a *= 1 - 0.3 * eBreak;
        hot = Math.max(hot, 0.3 * eBreak);
        disp = Math.max(disp, 3 * eBreak);
      }
      if (c.letter === L2 && ePix > 0) {
        const tick = Math.floor(time * 10);
        off.x += Math.round((hash(i + tick) - 0.5) * 2) * 0.5 * ePix;
        off.y += Math.round((hash(i * 1.3 + tick) - 0.5) * 2) * 0.5 * ePix;
        sc = 1 - 0.4 * ePix;
        disp = Math.max(disp, 0.5 * ePix);
      }
      if (eMis > 0) {
        off.x += (c.row % 2 ? 1 : -1) * 0.55 * eMis * (c.line % 2 ? -1 : 1);
        disp = Math.max(disp, 0.55 * eMis);
      }
      hot = Math.max(hot, 0.7 * Math.exp(-(((c.fx - scanX) / 0.07) ** 2)));
      // order pulls every cell back toward its place
      if (ord > 0.001) {
        off.x = c.x + (off.x - c.x) * (1 - ord);
        off.y = c.y + (off.y - c.y) * (1 - ord);
        off.z *= 1 - ord;
        q.slerp(QI, ord);
        sc += (1 - sc) * ord;
        disp *= 1 - ord;
      }
      // a reconstruction pass (activation, re-engagement): a quick front that flips each cell into place
      const wa = time - (this.waveAt ?? -99);
      if (wa > 0 && wa < 1.3) {
        const band2 = Math.exp(-(((c.fx - (wa / 1.3) * 1.3 + 0.15) / 0.06) ** 2));
        q.multiply(Q1.setFromEuler(E.set(0, Math.PI * band2, 0)));
        hot = Math.max(hot, 0.8 * band2);
      }
      f.apply(off, T.cell, p);
      // a few cells of one letter leave through one aperture and come back through the other
      if (portalOn && c.letter === LP && c.k < 7) {
        const j = c.k * 0.18;
        const out = ramp(tP, 4.5 + j, 6.0 + j), back = ramp(tP, 6.6 + j, 8.6 + j);
        if (out > 0 && back <= 0) p.lerp(pa, out * out), (sc *= 1 - 0.85 * out), (disp = 9);
        if (out >= 1 && back <= 0) sc = 0;
        if (back > 0) {
          const home = p.clone();
          p.copy(pb).lerp(home, back * (2 - back));
          sc *= 0.15 + 0.85 * back;
          disp = back < 1 ? 9 : disp;
        }
        hot = Math.max(hot, 0.6 * pulse(tP, 4.5 + j, 5.0 + j, 8.0 + j, 8.8 + j));
      }
      if (disp > 0.6) moved++;
      q.premultiply(f.q);
      const s2 = T.cell * f.s * sc;
      T.set(i, p, q, s2, s2, s2, a, hot);
    });
    T.mesh.material.uniforms.uGain.value = 0.8;
    T.commit(true);
    this.disrupted = moved / T.n;
    this.reconstructing = moved / T.n > 0.03;
    // heard, quietly: a break, a re-pixelation, the wave, cells through the apertures
    const cross = (x, prev, now) => prev < x && now >= x;
    const pl = this._pt ?? time;
    if (cross(1.0, (pl - kL * 17), tL)) h.emit('holo-break-letter');
    if (cross(6.0, (pl - kL * 17), tL)) h.emit('holo-pixel');
    if (cross(0.02, ((pl % 37) / 6), uW)) h.emit('holo-wave');
    if (cross(4.6, pl - kP * 71, tP)) h.emit('holo-portal');
    if (cross(6.7, pl - kP * 71, tP)) h.emit('holo-portal', { back: true });
    this._pt = time;
    this._prev = 99;
    return null;
  }

  /** Whether any of it is outside the computer (for the one-physical-event rule). */
  get outside() {
    return this.text.mesh.visible && this._prev > 3.2;
  }
}

/**
 * A project's name for a moment in front of the glass, then turned into the project itself:
 *  grid (TowerLogic) — the letters fall flat into a detection grid inside the screen;
 *  tiles (Mosaic) — they break into separate tiles that regroup as a tile wall;
 *  extrude (Visual Java) — they extrude into the screen and collapse into a stack of frames;
 *  glitch (BugMuseum) — rows slip, cells flicker and drop out, some fall;
 *  slices (Prompt-Off) — the rows slide apart into strips that drop into the screen;
 *  fade — a small name that simply recedes (cameos).
 */
export class TitleBeat {
  constructor(host, lines, mode, { small = false } = {}) {
    this.host = host;
    this.mode = mode;
    this.small = small;
    const probe = layout(lines);
    const cell = small ? 0.034 : Math.min(0.056, 2.5 / probe.cols);
    this.text = new HoloText(host, lines, { cell, thick: 0.7 });
    this.text.mesh.material.uniforms.uGain.value = 0.85;
    this.length = small ? 3.8 : 5.8;
    this.T = new Frame();
    this._prev = -1;
    // high in the screen, clear of the lower path every work uses to come out of the glass
    this.y = small ? 0.58 : lines.length > 1 ? 0.5 : 0.52;
  }

  update(t, time) {
    const h = this.host;
    const T = this.text;
    if (!(t >= 0 && t < this.length)) {
      T.commit(false);
      this._prev = -1;
      return false;
    }
    const C = T.cell;
    // every other appearance gathers from scattered cells instead of sliding through the glass
    if (this._prev < 0 || t < this._prev - 0.5) this.count = (this.count ?? -1) + 1;
    const alt = this.count % 2 === 1;
    const fr = this.T.screen(h, 0, 0, 0, 1);
    const L = new THREE.Vector3();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const small = this.small;
    const tIn = small ? 0.8 : 1.2, tHold = small ? 2.0 : 3.0, tEnd = this.length;
    const zF = 0.1; // just proud of the glass, inside the bezel's recess
    T.cells.forEach((c, i) => {
      let a = 1, hot = 0, sx = 1, sy = 1, sz = 1;
      L.set(c.x * C, this.y + c.y * C, zF);
      q.identity();
      // in through the glass
      const k = alt ? sm(t, c.r1 * tIn * 0.5, tIn * 0.55 + c.r1 * tIn * 0.5) : sm(t, c.fx * tIn * 0.45, tIn * 0.6 + c.fx * tIn * 0.45);
      L.z = -0.9 + (zF + 0.9) * k;
      if (alt) (L.x += (c.r2 - 0.5) * 0.9 * (1 - k)), (L.y += (c.r3 - 0.5) * 0.6 * (1 - k));
      a = sm(k, 0, 0.35);
      hot = Math.exp(-((L.z / 0.12) ** 2)) * 0.8;
      if (t > tIn && t < tHold) {
        const s0 = tIn + 0.2, s1 = tHold - 0.3;
        hot = 0.7 * Math.exp(-(((c.fx - (sm(t, s0, s1) * 1.4 - 0.2)) / 0.08) ** 2)) * pulse(t, s0, s0 + 0.2, s1 - 0.2, s1);
        L.y += Math.sin(time * 1.1) * 0.006;
      }
      if (t >= tHold) {
        const u = (st) => sm(t, tHold + st, tEnd - 0.9 + st * 0.3);
        const end = 1 - sm(t, tEnd - 0.7, tEnd);
        switch (this.mode) {
          case 'grid': {
            // fall flat, spread into a regular grid on the screen's floor, recede
            const v = u(c.fx * 0.4 + c.row * 0.05);
            const gz = -0.25 - (c.row + 7 * c.line) * C * 1.5;
            L.set(c.x * C * (1 + 0.15 * v), this.y + c.y * C + (-0.62 - this.y - c.y * C) * v, zF + (gz - zF) * v);
            L.z -= sm(t, tEnd - 1.5, tEnd) * 1.2;
            q.setFromEuler(E.set(-Math.PI / 2 * v, 0, 0));
            sx = sy = 1 + 0.25 * v;
            sz = 1 - 0.75 * v;
            hot = (c.fx < 0.06 || c.fx > 0.94) && v > 0.5 ? 0.9 : hot * (1 - v);
            // dimmer while turning (seen edge-on, a row of cells piles up) and once flat
            a = end * (1 - 0.6 * v) * (1 - 0.55 * Math.sin(v * Math.PI));
            break;
          }
          case 'tiles': {
            const v = u(c.r1 * 0.6);
            const W = 16, Hn = Math.ceil(T.n / W);
            const gx = i % W, gy = Math.floor(i / W);
            const tx = (gx - (W - 1) / 2) * C * 1.9, ty = ((Hn - 1) / 2 - gy) * C * 1.9;
            const bul = Math.sin(v * Math.PI);
            L.set(c.x * C + (tx - c.x * C) * v + (c.r2 - 0.5) * 0.5 * bul, this.y + c.y * C + (ty - this.y - c.y * C) * v + (c.r3 - 0.5) * 0.35 * bul, zF + (-1.4 - zF) * v + 0.25 * bul);
            q.setFromEuler(E.set(bul * (c.r2 - 0.5) * 3, bul * (c.r3 - 0.5) * 3, bul * (c.r4 - 0.5) * 2));
            sx = sy = 1 + 0.8 * v;
            sz = 1 - 0.6 * v;
            hot = c.r4 < 0.08 ? 0.7 * v : hot * (1 - v);
            a = end;
            break;
          }
          case 'extrude': {
            // into the screen, longer and longer; then each letter becomes one frame of a stack
            const v1 = u(c.fx * 0.3) , v2 = sm(t, tHold + 1.0, tEnd - 0.6);
            sz = 1 + 7 * v1;
            L.z = zF + (-0.55 - zF) * v1;
            const n = T.letters;
            const fx0 = -0.55, fy = ((n - 1) / 2 - c.letter) * C * 2.4;
            L.x += (c.lx * C - L.x) * v2;
            L.y += (c.ly * C + this.y - L.y) * v2;
            L.x += (fx0 - c.lx * C) * sm(v2, 0.4, 1);
            L.y += (fy - c.ly * C - this.y) * sm(v2, 0.4, 1);
            L.z += -0.5 * sm(v2, 0.4, 1);
            const rep = c.k === 0;
            sx = 1 + (rep ? 4.6 : 0) * v2;
            sy = 1 + (rep ? 0.6 : 0) * v2;
            a = end * (rep ? 1 : 1 - sm(v2, 0.2, 0.7));
            hot = rep && c.letter === n - 1 ? 0.8 * v2 : hot * (1 - v1);
            break;
          }
          case 'glitch': {
            const v = sm(t, tHold, tHold + 0.6);
            const tick = Math.floor(time * 12);
            const shift = (hash(c.row * 13 + c.line * 7 + tick) - 0.5) * C * 6 * v * (hash(tick + c.row) > 0.55 ? 1 : 0);
            L.x += shift;
            if (hash(i * 0.73 + tick * 1.31) < 0.18 * v) a = 0.15;
            hot = hash(i + tick * 0.7) < 0.2 * v ? 1 : hot;
            const fall = c.r1 < 0.28 ? Math.max(0, t - (tHold + 0.4 + c.r2 * 0.9)) : 0;
            L.y -= 1.6 * fall * fall;
            if (fall > 0) a *= 1 - sm(fall, 0.2, 0.9);
            const back = sm(t, tHold + 1.1 + c.r3 * 0.4, tEnd - 0.3);
            L.z += (-1.3 - zF) * back;
            a *= end;
            break;
          }
          case 'slices': {
            const v = u(c.row * 0.04);
            L.x += (c.row % 2 ? 1 : -1) * sm(v, 0, 0.5) * C * 3.5;
            L.z += (-1.6 - zF) * sm(v, 0.35, 1) * (0.8 + 0.2 * c.r1);
            L.y -= sm(v, 0.35, 1) * 0.25;
            hot = c.row === 3 && v > 0.1 && v < 0.8 ? 0.5 : hot * (1 - v);
            a = end * (1 - 0.6 * sm(v, 0.3, 1));
            break;
          }
          case 'rails': {
            // two rows stretch into rails; the rest leaves along them, like a tram pulling out
            const v = u(c.fx * 0.3);
            const rail = c.row === 2 || c.row === 4;
            if (rail) (sx = 1 + 1.6 * v), (L.y += (c.row === 2 ? 0.03 : -0.03) * v);
            L.x -= v * v * 0.35;
            L.z += (-1.4 - zF) * sm(v, 0.25, 1);
            a = end * (rail ? 1 : 1 - sm(v, 0.1, 0.6));
            hot = rail && v > 0.2 ? 0.4 : hot * (1 - v);
            break;
          }
          default: {
            const v = u(c.fx * 0.4);
            L.z += (-1.0 - zF) * v;
            a = end * (1 - sm(v, 0.5, 1));
          }
        }
      }
      fr.p.set(L.x, L.y, L.z).applyMatrix4(h.screenToStation);
      p.copy(fr.p);
      q.premultiply(fr.q);
      const s = C * fr.s;
      T.set(i, p, q, s * sx, s * sy, s * sz, a, hot);
    });
    T.commit(true);
    const cross = (at) => this._prev < at && t >= at;
    if (cross(0.05)) h.emit('title-in', { small });
    if (cross(tHold)) h.emit('title-out', { mode: this.mode, small });
    this._prev = t;
    return true;
  }
}

/**
 * The showcase beat as a schedulable work: the console first settles into a clean pose and the
 * ambient portals calm (2.5 s), then the PROJECTS hologram plays.
 */
export class ShowcaseWork {
  constructor(host) {
    this.host = host;
    this.name = 'showcase';
    this.length = 19.4;
    this.lamp = -1;
    this.holo = new Hologram(host);
  }

  lengthFor() {
    return this.length;
  }

  physicalNow() {
    return this.running && this.holo.outside;
  }

  update(t, time, dt, show, variant) {
    // when not running, the sign belongs to the console's persistent loop (Projects drives it)
    this.running = t <= this.length;
    if (!this.running) return null;
    const st = this.holo.update(t - 2.5, time, dt, variant ?? 'break');
    return { ...(st ?? {}), showcase: true, activity: st?.activity ?? 0.15 };
  }
}
