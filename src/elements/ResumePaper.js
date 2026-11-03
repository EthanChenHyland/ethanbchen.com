import * as THREE from 'three';
import { patchMaterial } from '../gl/patch.js';
import { Noise3, mulberry32 } from '../gl/noise.js';

const smooth = (t) => t * t * (3 - 2 * t);
const sstep = (a, b, x) => smooth(THREE.MathUtils.clamp((x - a) / (b - a), 0, 1));
// 0 → 1 between a and b, back to 0 between c and d
const swell = (x, a, b, c, d) => sstep(a, b, x) - sstep(c, d, x);
const noise = new Noise3(911);
const PLANE_LEN = 0.95;
// Clearances in the station frame. The page, at any yaw and flex, stays inside a vertical
// cylinder of radius SHEET_R between SHEET_Y0 and SHEET_Y1; loose paper stays outside it and
// inside CAP_R, which keeps it well clear of the neighbouring stations' artefacts.
const SHEET_R = 2.05;
const SHEET_Y0 = 1.15;
const SHEET_Y1 = 6.35;
const CAP_R = 4.6;
const GAP = 0.06;

// Paper stocks: résumé bone, grey annotation stock, warm note paper, darker scrap, tracing paper.
export const STOCK = {
  bone: '#e6dccb',
  grey: '#d4d2cb',
  warm: '#e2cf9e',
  scrap: '#b8ac97',
  tracing: '#e9eeee',
};

/**
 * Matte paper with optional ruled ink lines, a coloured band at one end, and one line
 * the stylus can write (uWrite: 0..1 along it, uWriteInk: its strength).
 */
export function paperMaterial(color, { lines = 0, band = 0, bandColor = '#000000', seed = 0, flat = false, opacity = 1 } = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.86,
    metalness: 0,
    side: THREE.DoubleSide,
    flatShading: flat,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  });
  // paper never goes fully black: a little of the station's warm light scatters through it
  mat.emissive = new THREE.Color(color).multiplyScalar(0.07);
  const uniforms = {
    uBand: { value: new THREE.Color(bandColor) },
    uBandW: { value: band },
    uLines: { value: lines },
    uSeed: { value: seed },
    uWrite: { value: 0 },
    uWriteInk: { value: 0 },
  };
  patchMaterial(mat, {
    key: 'resume-scrap',
    uniforms,
    vertexHeader: 'varying vec2 vSlipUv;',
    vertex: { begin_vertex: '#include <begin_vertex>\nvSlipUv = uv;' },
    fragmentHeader: 'uniform vec3 uBand; uniform float uBandW; uniform float uLines; uniform float uSeed; uniform float uWrite; uniform float uWriteInk; varying vec2 vSlipUv;',
    fragment: {
      color_fragment: /* glsl */ `
        #include <color_fragment>
        {
          vec2 aa = fwidth(vSlipUv) * 1.2;
          float band = smoothstep(1.0 - uBandW - aa.x, 1.0 - uBandW + aa.x, vSlipUv.x);
          diffuseColor.rgb = mix(diffuseColor.rgb, uBand, band * 0.92);
          float right = 1.0 - uBandW - 0.12;
          float ink = 0.0;
          for (int k = 0; k < 4; k++) {
            float fk = float(k);
            float y = 0.74 - fk * 0.17;
            float w = 0.12 + (right - 0.12) * (0.45 + 0.5 * fract(sin(fk * 12.9 + uSeed) * 437.5));
            float on = step(fk + 0.5, uLines);
            float v = 1.0 - smoothstep(0.032 - aa.y, 0.032 + aa.y, abs(vSlipUv.y - y));
            float u = smoothstep(0.12 - aa.x, 0.12 + aa.x, vSlipUv.x) * (1.0 - smoothstep(w - aa.x, w + aa.x, vSlipUv.x));
            ink = max(ink, v * u * on);
          }
          // the line the stylus writes
          float wv = 1.0 - smoothstep(0.03 - aa.y, 0.03 + aa.y, abs(vSlipUv.y - 0.36));
          float wu = smoothstep(0.15 - aa.x, 0.15 + aa.x, vSlipUv.x) * (1.0 - smoothstep(0.15 + 0.6 * uWrite - aa.x, 0.15 + 0.6 * uWrite + aa.x, vSlipUv.x));
          ink = max(ink, wv * wu * uWriteInk);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.04, 0.038, 0.036), ink * 0.85);
        }`,
    },
  });
  mat.userData.uniforms = uniforms;
  return mat;
}

// ---------------------------------------------------------------- shapes that transform

/** A note that folds itself into a dart: the same eight points, flat or folded. */
function makePlane(len) {
  const W = 0.7;
  // flat card in x–z (x along its length, nose at x = 1), then the folded dart
  const flat = {
    A: [1, 0, W / 2], B: [1, 0, -W / 2], M1: [1, 0, 0], C: [0, 0, W / 2], D: [0, 0, -W / 2], M0: [0, 0, 0], E: [0, 0, 0.12], F: [0, 0, -0.12],
  };
  const fold = {
    A: [1, 0.004, 0.01], B: [1, 0.004, -0.01], M1: [1, -0.02, 0], C: [0, 0.06, 0.42], D: [0, 0.06, -0.42], M0: [0, -0.14, 0], E: [0, 0, 0.04], F: [0, 0, -0.04],
  };
  const tris = [['A', 'C', 'E'], ['A', 'E', 'M1'], ['M1', 'E', 'M0'], ['B', 'D', 'F'], ['B', 'F', 'M1'], ['M1', 'F', 'M0']];
  const names = tris.flat();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(names.length * 3), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(names.flatMap((n) => [flat[n][0], flat[n][2] / W + 0.5])), 2));
  const set = (k) => {
    const pa = geo.attributes.position;
    names.forEach((n, i) => {
      const a = flat[n], b = fold[n];
      pa.setXYZ(i, (a[0] + (b[0] - a[0]) * k) * len, (a[1] + (b[1] - a[1]) * k) * len, (a[2] + (b[2] - a[2]) * k) * len);
    });
    pa.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  };
  set(0);
  return { geo, set };
}

/** A square of paper that crumples into a ball and opens out again (0 open → 1 crumpled). */
function makeCrumple(size, seed) {
  const geo = new THREE.PlaneGeometry(size, size, 22, 22);
  geo.rotateX(-Math.PI / 2);
  const pa = geo.attributes.position;
  const n = pa.count;
  const open = new Float32Array(n * 3), ball = new Float32Array(n * 3);
  const uv = geo.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const u = uv.getX(i), w = uv.getY(i);
    // open: flat with crinkles left over from being crushed
    const cr = noise.ridged(u * 4 + seed, w * 4, seed, 3) - 0.5;
    open.set([pa.getX(i), cr * 0.035, pa.getZ(i)], i * 3);
    // ball: the sheet wrapped onto a lumpy, faceted sphere
    const th = u * Math.PI * 2, ph = 0.15 + w * (Math.PI - 0.3);
    v.set(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
    const r = size * 0.22 * (1 + 0.2 * (noise.ridged(v.x * 3.4 + seed, v.y * 3.4, v.z * 3.4, 3) - 0.5) + 0.1 * Math.abs(noise.noise(v.x * 9, v.y * 9 + seed, v.z * 9)));
    ball.set([v.x * r, v.y * r, v.z * r], i * 3);
  }
  const set = (k) => {
    const e = smooth(k);
    for (let i = 0; i < n * 3; i++) pa.array[i] = open[i] + (ball[i] - open[i]) * e;
    pa.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  };
  set(1);
  return { geo, set };
}

/** A long thin strip that curls up and straightens (0 straight → 1 curled). */
function makeStrip(len, width) {
  const geo = new THREE.PlaneGeometry(len, width, 48, 1);
  const pa = geo.attributes.position;
  const base = Float32Array.from(pa.array);
  const set = (c) => {
    const k = 0.05 + c * 7.5; // curvature
    for (let i = 0; i < pa.count; i++) {
      const s = base[i * 3] + len / 2; // 0..len from one end
      const yw = base[i * 3 + 1];
      const a = k * s;
      pa.setXYZ(i, Math.sin(a) / k - len / 2, (1 - Math.cos(a)) / k, yw + s * c * 0.12);
    }
    pa.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  };
  set(0.3);
  return { geo, set };
}

/** A small letter-folded page whose two outer panels close over the middle (0 open → 1 closed). */
function makeMiniPage(w, h) {
  const geo = new THREE.PlaneGeometry(w, h, 4, 12);
  const pa = geo.attributes.position;
  const base = Float32Array.from(pa.array);
  const y1 = -h / 6, y2 = h / 6;
  const set = (c) => {
    const A = c * Math.PI * 0.93;
    for (let i = 0; i < pa.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1];
      if (y > y2) {
        const d = y - y2;
        pa.setXYZ(i, x, y2 + d * Math.cos(A), d * Math.sin(A) + 0.004);
      } else if (y < y1) {
        const d = y1 - y;
        pa.setXYZ(i, x, y1 - d * Math.cos(A), d * Math.sin(A) + 0.008);
      } else pa.setXYZ(i, x, y, 0);
    }
    pa.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  };
  set(0);
  return { geo, set };
}

/** An irregular torn scrap. */
function makeScrap(w, h, seed) {
  const rand = mulberry32(seed);
  const shape = new THREE.Shape();
  const N = 11;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = 0.78 + rand() * 0.3;
    const x = Math.cos(a) * (w / 2) * r, y = Math.sin(a) * (h / 2) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
    // a ragged tear between corners
    shape.lineTo(x + (rand() - 0.5) * w * 0.08, y + (rand() - 0.5) * h * 0.08);
  }
  const geo = new THREE.ShapeGeometry(shape);
  const pa = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pa.count; i++) {
    uv.setXY(i, pa.getX(i) / w + 0.5, pa.getY(i) / h + 0.5);
    pa.setZ(i, 0.03 * Math.sin(pa.getX(i) * 7 + seed));
  }
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------- the ecosystem

/**
 * Loose paper around the Resume station, in the station group's frame. Every piece runs
 * its own long cycle, so the system never visibly repeats:
 *   - a note docked at the page's lower right margin is written on, folds itself into a
 *     paper aeroplane, flies a long banking loop around the station, lands and unfolds;
 *   - two crumpled balls orbit at different heights, open out into creased sheets, and crumple again;
 *   - two tracing-paper strips drift high, curling and straightening;
 *   - a small letter-folded page opens and closes as it circles;
 *   - two torn scraps tumble through the stylus light.
 * Hover pulls everything closer and steadier; focus clears the space in front of the page.
 */
export class PaperEcosystem {
  constructor(host) {
    this.host = host;
    this.group = new THREE.Group();
    this.group.name = 'resume-paper';
    host.group.add(this.group);
    const add = (geo, mat) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.group.add(m);
      return m;
    };

    const plane = makePlane(PLANE_LEN);
    this.plane = { ...plane, mesh: add(plane.geo, paperMaterial(STOCK.grey, { lines: 1, seed: 3 })), period: 36, phase: 0.62, writable: false, cycle: -1, held: 0, hold: false };
    this.balls = [
      { ...makeCrumple(1.25, 3), period: 47, phase: 0.1, r: 2.9, y: 1.9, w: 0.085, a0: 0.4, bob: 0.35 },
      { ...makeCrumple(1.05, 9), period: 58, phase: 0.6, r: 3.0, y: 5.4, w: -0.06, a0: 2.6, bob: 0.4 },
    ];
    this.balls.forEach((b, i) => (b.mesh = add(b.geo, paperMaterial(i ? '#efe7d8' : '#ebe8e1', { flat: true, lines: 2, seed: 11 + i }))));
    this.strips = [
      { ...makeStrip(2.3, 0.18), period: 21, phase: 0.2, r: 3.3, y: 6.9, w: 0.07, a0: 1.2 },
      // its lane sits out past the margin tabs and below the aeroplane's
      { ...makeStrip(1.8, 0.15), period: 27, phase: 0.7, r: 3.8, y: 3.0, w: -0.05, a0: 4.0 },
    ];
    this.strips.forEach((s) => (s.mesh = add(s.geo, paperMaterial(STOCK.tracing, { opacity: 0.55 }))));
    this.mini = { ...makeMiniPage(0.8, 1.05), period: 31, phase: 0.4, r: 3.0, y: 4.4, w: 0.05, a0: 3.4 };
    this.mini.mesh = add(this.mini.geo, paperMaterial(STOCK.bone, { lines: 4, seed: 5 }));
    this.scraps = [
      { r: 3.7, y: 2.4, w: 0.07, a0: 5.0, spin: [0.5, 0.3, 0.7] },
      { r: 2.9, y: 6.0, w: -0.09, a0: 0.9, spin: [0.3, 0.6, 0.4] },
    ];
    this.scraps.forEach((s, i) => (s.mesh = add(makeScrap(0.72 - i * 0.16, 0.52, 17 + i), paperMaterial(i ? STOCK.warm : STOCK.scrap, { lines: 1 + i, seed: 21 + i }))));

    this._v = new THREE.Vector3();
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this._bv = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this.camDir = new THREE.Vector3(0, 0, 1);
    this.pulse = 0;
  }

  /** Orbit point in the station frame, drawn in a little by hover and moved out of the page's way by focus. */
  #orbit(out, r, y, angle, hk, fk, swell = 1) {
    // a re-engagement pulse breathes compact pieces outward; long strips only curl (see update)
    const rr = r * (1 - 0.08 * hk) * (1 + 0.07 * this.pulse * swell);
    out.set(Math.cos(angle) * rr, y, Math.sin(angle) * rr);
    return this.#clear(out, fk);
  }

  /**
   * While focused, anything on the camera's side of the page rises out of the shot (and a little
   * outward); pieces behind the page stay where they are. Smooth in angle, so nothing jumps, and
   * it moves around the page rather than through it.
   */
  #clear(p, fk) {
    if (fk <= 0) return p;
    const h = Math.hypot(p.x, p.z) || 1;
    const front = sstep(-0.25, 0.6, (p.x * this.camDir.x + p.z * this.camDir.z) / h);
    p.y += fk * front * 3.6;
    const grow = 1 + fk * front * 0.15;
    p.x *= grow;
    p.z *= grow;
    return p;
  }

  /** Tumble at `amount` of each piece's rates. The phase is integrated, so a change of amount (hover, focus) changes speed, never the angle. */
  #tumble(mesh, time, rates, amount) {
    const u = mesh.userData;
    u.tt = (u.tt ?? time) + (time - (u.tLast ?? time)) * amount;
    u.tLast = time;
    const kick = this.pulse * 0.35; // re-engagement: each piece twists a little and settles
    this._e.set(u.tt * rates[0] + kick, u.tt * rates[1] + rates[2] + kick * 0.6, u.tt * rates[2] - kick * 0.8);
    mesh.quaternion.setFromEuler(this._e);
  }

  /** The plane's docked pose, in the station frame: a note tucked half under the page's lower right corner. */
  #dock(outP, outQ) {
    const h = this.host;
    const standoff = 0.014 + 0.17 * (this.plane.fold ?? 0);
    h.pageFrame(1.0, 0.1, outP, this._t, this._bv, this._n);
    outP.addScaledVector(this._t, PLANE_LEN * 0.5 - 0.1).addScaledVector(this._bv, -0.12).addScaledVector(this._n, standoff);
    // local x → page right, local y (the card's normal) → page front
    this._m.makeBasis(this._t, this._n, this._a.crossVectors(this._t, this._n));
    outQ.setFromRotationMatrix(this._m);
    outP.applyMatrix4(h.folio.matrix);
    outQ.premultiply(h.folio.quaternion);
  }

  /** Point on the docked note's writing line (t: 0..1), in folio space, with its normal. */
  noteFrame(t, outP, outN) {
    const m = this.plane.mesh;
    m.updateMatrix();
    outP.set(PLANE_LEN * (0.15 + 0.6 * t), 0.006, PLANE_LEN * 0.7 * (0.36 - 0.5)).applyMatrix4(m.matrix).applyMatrix4(this._m.copy(this.host.folio.matrix).invert());
    outN.set(0, 1, 0).applyQuaternion(m.quaternion).applyQuaternion(this._q2.copy(this.host.folio.quaternion).invert());
  }

  setNoteInk(progress) {
    const u = this.plane.mesh.material.userData.uniforms;
    u.uWrite.value = progress;
    u.uWriteInk.value = 1;
  }

  /**
   * Keep loose paper from passing through anything: outside the page's cylinder, inside the cap,
   * above the floor, and clear of the stylus, the slips, the docked note and each other. Higher
   * priority pieces (earlier in the list) hold their path; later ones give way. Positions come
   * from smooth paths and the corrections grow from zero, so nothing jumps.
   */
  #resolve(obstacles, dt) {
    const items = [];
    const P = this.plane;
    const sphere = (m) => m.geometry.boundingSphere ?? (m.geometry.computeBoundingSphere(), m.geometry.boundingSphere);
    const rad = (m, k = 1) => sphere(m).radius * k;
    // each piece is kept apart by its bounding sphere's true centre: the aeroplane is built from its
    // tail and a curled strip's centre moves off its origin, so the origin alone can be half a body away
    const item = (m, extra = {}) => ({ p: m.position, o: sphere(m).center.clone().applyQuaternion(m.quaternion), r: rad(m), ...extra });
    if (P.flying) items.push(item(P.mesh, { plane: true }));
    else {
      const it = item(P.mesh);
      obstacles.push({ p: it.p.clone().add(it.o), r: it.r });
    }
    for (const B of this.balls) items.push(item(B.mesh));
    items.push(item(this.mini.mesh));
    // strips are long: three quarters of their sphere is enough against compact pieces, but the
    // aeroplane is kept clear of the whole of it
    for (const S of this.strips) items.push(item(S.mesh, { r: rad(S.mesh, 0.75), rFull: rad(S.mesh) }));
    for (const S of this.scraps) items.push(item(S.mesh));
    const c = (a, out) => out.copy(a.p).add(a.o);
    const ca = (this._ca ??= new THREE.Vector3()), cb = (this._cb ??= new THREE.Vector3());
    // corrections are eased in (about 0.2 s), so a piece meeting another bends its path smoothly
    // instead of kinking; record each piece's unresolved position first
    for (const a of items) a.raw = (a.rawV ??= new THREE.Vector3()).copy(a.p);
    const d = this._v;
    const push = (a, q, rq) => {
      d.subVectors(c(a, ca), q);
      const dist = d.length();
      const min = a.r + rq + GAP;
      if (dist >= min) return;
      if (dist < 1e-4) d.set(0, 1, 0);
      else d.divideScalar(dist);
      a.p.addScaledVector(d, min - Math.max(dist, 0));
    };
    for (let pass = 0; pass < 2; pass++) {
      items.forEach((a, i) => {
        for (const o of obstacles) push(a, o.p, o.r);
        for (let j = 0; j < i; j++) push(a, c(items[j], cb), items[j].r);
        c(a, ca);
        const h = Math.hypot(ca.x, ca.z) || 1e-4;
        // the aeroplane's own path already leaves and lands radially at the page edge
        const inBand = ca.y > SHEET_Y0 - a.r && ca.y < SHEET_Y1 + a.r;
        const lo = !a.plane && inBand ? SHEET_R + a.r : 0;
        const hi = CAP_R - a.r * 0.5;
        const target = THREE.MathUtils.clamp(h, lo, hi);
        if (target !== h) {
          a.p.x += ca.x * (target / h - 1);
          a.p.z += ca.z * (target / h - 1);
        }
        a.p.y += Math.max(0, a.r + 0.15 - ca.y);
      });
    }
    for (const a of items) {
      const o = (this._offsets ??= new Map()).get(a.p) ?? new THREE.Vector3();
      this._offsets.set(a.p, o.lerp(d.subVectors(a.p, a.raw), Math.min(1, dt * 5)));
      a.p.copy(a.raw).add(o);
    }
    // whatever the easing has not yet cleared from a higher-priority piece (the aeroplane above all,
    // which moves fastest) is cleared now; the overlap only ever grows from zero, so this stays
    // continuous, a gentle bump rather than a jump
    items.forEach((a, i) => {
      let moved = false;
      // the slips, stylus and docked note too (not for the aeroplane: its own path keeps it clear,
      // and a hard push near the dock would kink its landing)
      if (!a.plane) {
        for (const o of obstacles) {
          d.subVectors(c(a, ca), o.p);
          const dist = d.length(), min = a.r + o.r + GAP;
          if (dist < min && dist > 1e-4) {
            a.p.addScaledVector(d, (min - dist) / dist);
            moved = true;
          }
        }
      }
      for (let j = 0; j < i; j++) {
        d.subVectors(c(a, ca), c(items[j], cb));
        const dist = d.length(), min = (items[j].plane ? a.rFull ?? a.r : a.r) + items[j].r + GAP;
        if (dist < min && dist > 1e-4) {
          a.p.addScaledVector(d, (min - dist) / dist);
          moved = true;
        }
      }
      if (moved) this._offsets.get(a.p).subVectors(a.p, a.raw);
    });
  }

  update(time, dt, { hk, fk, tip, camera, stylusMid, stylusEnd, slips, life = 0, pulse = 0 }) {
    // focused-idle life lets some of the focused calm go (activity only: what clears the page from
    // the camera still follows fk in full); a re-engagement pulse wakes everything briefly
    this.pulse = pulse;
    const fa = fk * (1 - 0.45 * life);
    const steady = (1 - 0.6 * hk) * (1 - 0.75 * fa) * (1 + 0.8 * pulse);
    this.camDir.copy(camera).setY(0).normalize();
    const flutter = (mesh, i) => {
      const near = Math.exp(-mesh.position.distanceToSquared(tip) * 1.5);
      if (near > 0.01) mesh.quaternion.multiply(this._q.setFromAxisAngle(this._a.set(1, 0, 0), near * 0.35 * Math.sin(time * 15 + i)));
    };

    // ---- the aeroplane
    {
      const P = this.plane;
      // while the stylus is writing on it the note stays docked: its cycle waits
      if (P.hold) P.held += dt;
      const pt = (time - P.held) / P.period + P.phase;
      const ph = pt % 1;
      const cycle = Math.floor(pt);
      P.writable = (ph > 0.02 && ph < 0.14 && fk < 0.05) || P.hold;
      const foldAt = (q) => swell(q, 0.15, 0.24, 0.86, 0.94);
      const flyAt = (q) => swell(q, 0.18, 0.3, 0.8, 0.92) * (1 - fk * (q > 0.9 || q < 0.18 ? 1 : 0));
      const fold = foldAt(ph);
      const fly = flyAt(ph);
      P.set(fold);
      P.fold = fold;
      P.ph = ph;
      // ink written while docked fades on the way round
      const u = P.mesh.material.userData.uniforms;
      if (cycle !== P.cycle && ph < 0.03) {
        P.cycle = cycle;
        u.uWriteInk.value = 0;
      }
      if (ph > 0.3) u.uWriteInk.value = Math.max(0, u.uWriteInk.value - dt * 0.12);

      const dockP = (P._dockP ??= new THREE.Vector3()), dockQ = (P._dockQ ??= new THREE.Quaternion());
      this.#dock(dockP, dockQ);
      // one loop around the station in the outer lane: it leaves its dock straight out from the
      // page edge, circles (passing behind the page and in front of it), and comes straight back in.
      // Every ramp is a smoothstep, so position and velocity are continuous throughout.
      const rd = Math.hypot(dockP.x, dockP.z), td = Math.atan2(dockP.z, dockP.x), yd = dockP.y;
      const pp = (P._pp ??= new THREE.Vector3());
      const at = (q, out) => {
        const ss = THREE.MathUtils.clamp((q - 0.2) / 0.68, 0, 1);
        // long, gentle launch and landing ramps: it eases out, then climbs; it comes down while
        // still circling, so the last approach to the dock is a level glide, not a dive
        const w = sstep(0, 0.27, ss) - sstep(0.73, 1, ss);
        const wy = sstep(0.05, 0.3, ss) - sstep(0.62, 0.88, ss);
        const ang = td + sstep(0.12, 0.88, ss) * Math.PI * 2;
        const r = THREE.MathUtils.lerp(rd, 3.95 + 0.45 * Math.sin(ss * Math.PI * 4 + 1.0), w);
        const y = THREE.MathUtils.lerp(yd, 4.75 + 1.0 * Math.sin(ss * Math.PI * 2 + 0.4) - 0.4 * Math.cos(ss * Math.PI * 4), wy);
        this.#clear(pp.set(Math.cos(ang) * r, y, Math.sin(ang) * r), fk * w);
        return out.copy(dockP).lerp(pp, smooth(flyAt(q)));
      };
      // sample the actual motion a moment either side: velocity for the nose, acceleration for the bank
      const H = 0.12;
      const h = H / P.period;
      const p0 = at(ph - h, (P._p0 ??= new THREE.Vector3()));
      const p2 = at(ph + h, (P._p2 ??= new THREE.Vector3()));
      const pos = at(ph, P.mesh.position);
      const vel = (P.vel ??= new THREE.Vector3()).subVectors(p2, p0).divideScalar(2 * H);
      const acc = this._a.copy(p2).add(p0).addScaledVector(pos, -2).divideScalar(H * H);
      const speed = vel.length();
      P.speed = speed;
      const fwd = (P.fwd ??= new THREE.Vector3(1, 0, 0));
      if (speed > 1e-3) fwd.copy(vel).divideScalar(speed);
      const side = this._bv.crossVectors(this._n.set(0, 1, 0), fwd);
      if (side.lengthSq() < 1e-6) side.set(0, 0, 1);
      side.normalize(); // the plane's left
      const up = this._n.crossVectors(fwd, side);
      this._m.makeBasis(fwd, up, this._t.copy(side).negate());
      this._q.setFromRotationMatrix(this._m);
      // bank into the turn from the sideways acceleration, eased so it builds and releases
      const flightW = sstep(0.04, 0.45, speed) * smooth(fly);
      const bankTo = THREE.MathUtils.clamp(-acc.dot(side) * 0.35, -0.7, 0.7) * flightW;
      P.roll = (P.roll ?? 0) + (bankTo - (P.roll ?? 0)) * Math.min(1, dt * 3);
      this._q.multiply(this._q2.setFromAxisAngle(this._a.set(1, 0, 0), P.roll));
      // docked it sits exactly on the page; in flight it follows its motion with a short lag
      if (fly < 0.02) P.mesh.quaternion.copy(dockQ);
      else P.mesh.quaternion.slerp(this._q2.slerpQuaternions(dockQ, this._q, flightW), Math.min(1, dt * 6));
      P.flying = fly > 0.02;
      flutter(P.mesh, 0);
    }

    // ---- crumpled balls: orbit, open into creased sheets, crumple again
    this.balls.forEach((B, i) => {
      const ph = (time / B.period + B.phase) % 1;
      const openK = swell(ph, 0.5, 0.62, 0.82, 0.94);
      B.set((B.k = 1 - 0.88 * openK * (1 - fa)));
      const ang = B.a0 + time * B.w;
      const y = THREE.MathUtils.lerp(B.y + B.bob * Math.sin(time * 0.4 + i * 2), 1.5 + i * 0.5, fk * 0.6);
      this.#orbit(B.mesh.position, B.r, y, ang, hk, fk);
      this.#tumble(B.mesh, time, [0.31 + i * 0.1, 0.23, 0.17 + i * 0.07], steady * (0.25 + 0.75 * (1 - openK)));
      flutter(B.mesh, i + 1);
    });

    // ---- tracing-paper strips: drift high, curl and straighten
    this.strips.forEach((S, i) => {
      const ph = (time / S.period + S.phase) % 1;
      S.set(Math.min(1, 0.12 + 0.85 * swell(ph, 0.08, 0.36, 0.58, 0.88) + 0.25 * pulse));
      this.#orbit(S.mesh.position, S.r, S.y + 0.4 * Math.sin(time * 0.3 + i * 3), S.a0 + time * S.w, hk, fk, 0);
      this.#tumble(S.mesh, time, [0.12, 0.2 + i * 0.05, 0.09], steady);
      flutter(S.mesh, i + 3);
    });

    // ---- the small letter: opens as it circles, closes again
    {
      const M = this.mini;
      const ph = (time / M.period + M.phase) % 1;
      M.set((M.k = 1 - swell(ph, 0.2, 0.38, 0.62, 0.8) * (1 - fa)));
      this.#orbit(M.mesh.position, M.r, M.y + 0.6 * Math.sin(time * 0.27), M.a0 + time * M.w, hk, fk);
      this.#tumble(M.mesh, time, [0.1, 0.16, 0.13], steady);
      flutter(M.mesh, 5);
    }

    // ---- torn scraps: wide, slow orbits that pass in front of and behind the page (resolved below)
    this.scraps.forEach((S, i) => {
      this.#orbit(S.mesh.position, S.r, S.y + 0.5 * Math.sin(time * 0.35 + i), S.a0 + time * S.w, hk, fk);
      this.#tumble(S.mesh, time, S.spin, steady);
      flutter(S.mesh, i + 6);
    });

    // ---- keep everything clear of the stylus, the slips and each other
    const obstacles = [{ p: tip, r: 0.16 }, { p: stylusMid, r: 0.2 }, { p: stylusEnd, r: 0.16 }];
    for (const sl of slips) {
      const q = (sl._world ??= new THREE.Vector3()).copy(sl.mesh.position).applyMatrix4(this.host.folio.matrix);
      obstacles.push({ p: q, r: (sl.mesh.geometry.boundingSphere ?? (sl.mesh.geometry.computeBoundingSphere(), sl.mesh.geometry.boundingSphere)).radius });
    }
    this.#resolve(obstacles, dt);
  }
}
