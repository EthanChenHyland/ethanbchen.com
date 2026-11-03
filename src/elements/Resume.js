import * as THREE from 'three';
import { patchMaterial } from '../gl/patch.js';
import { worldPosVaryingVertex } from '../gl/glsl.js';
import { mulberry32, noise1 } from '../gl/noise.js';
import { createPedestal } from '../world/Platform.js';
import { stationPosition } from '../config.js';

const FOLIO_Y = 3.2; // centre of the sheet above the floor
const COLS = 6;
const ROWS = 10;
// Miura-ori unit: parallelogram with sides A (along a row) and B (across rows) at sector angle GAMMA.
const GAMMA = THREE.MathUtils.degToRad(65);
const B = 0.45;
const A = 1.1 * B;
const BC = B * Math.cos(GAMMA);
const BS = B * Math.sin(GAMMA);
const FLAT_W = COLS * A + BC;
const FLAT_H = ROWS * BS;
const VOL_HALF = new THREE.Vector3(2.5, 2.7, 2.5);
const STYLUS_SCALE = 1.5; // the probe has to read from across the platform

// Printed layout in flat page coordinates (0..1): 28 body rows (a heading, five
// lines and a gap per section) plus three header lines. Each line is written,
// and later fades, on its own.
const BODY_TOP = 0.805;
const ROW_H = 0.0255;
const LINES = 31; // 0..27 body, 28 name, 29 contact, 30 rule
const X0 = 0.1;

/**
 * Rigid Miura fold of the sheet for fold amount f (0 flat → 1 fully collapsed).
 * Every row is the same zigzag in x–z; consecutive rows are shifted by ±q in x
 * and r in y, which keeps each parallelogram face rigid and planar.
 */
function miura(f) {
  const p = A * (1 - f * (1 - Math.cos(GAMMA)));
  const h = Math.sqrt(Math.max(A * A - p * p, 0));
  const q = (A * B * Math.cos(GAMMA)) / p;
  const r = Math.sqrt(Math.max(B * B - q * q, 0));
  return { p, h, q, r };
}

const lineY = (i) => (i < 28 ? BODY_TOP - (i + 0.5) * ROW_H : [0.9015, 0.862, 0.8375][i - 28]);
const smooth = (t) => t * t * (3 - 2 * t);

const PAPER_GLSL = /* glsl */ `
uniform float uGlow;
uniform float uInkGain;
uniform vec3 uLightW;
uniform vec3 uLightCol;
uniform sampler2D uNoise2D;
uniform float uLineEnd[${LINES}];
uniform float uLineInk[${LINES}];
uniform float uLineW[${LINES}];
varying vec2 vPage;
varying vec2 vFace;
varying vec3 vWPos;
float bar(vec2 uv, float y0, float y1, float x1) {
  vec2 aa = fwidth(uv) * 1.2;
  float v = smoothstep(y0 - aa.y, y0 + aa.y, uv.y) * (1.0 - smoothstep(y1 - aa.y, y1 + aa.y, uv.y));
  float u = smoothstep(${X0.toFixed(2)} - aa.x, ${X0.toFixed(2)} + aa.x, uv.x) * (1.0 - smoothstep(x1 - aa.x, x1 + aa.x, uv.x));
  return v * u;
}
// how much of line i is showing at x: written up to its end, then receding unevenly as its ink fades
float shown(int i, vec2 uv) {
  float aa = fwidth(uv.x) * 1.5;
  float written = 1.0 - smoothstep(uLineEnd[i] - aa, uLineEnd[i] + aa, uv.x);
  float n = texture(uNoise2D, uv * vec2(5.0, 9.0) + float(i) * 0.137).r;
  return written * smoothstep(n * 0.45, n * 0.45 + 0.3, uLineInk[i]);
}
float lineX1(int i) { return ${X0.toFixed(2)} + uLineW[i] * 0.8; }
// branch-free so derivatives stay valid
float inkMask(vec2 uv) {
  float m = bar(uv, 0.885, 0.918, lineX1(28)) * shown(28, uv);
  m = max(m, bar(uv, 0.858, 0.866, lineX1(29)) * 0.8 * shown(29, uv));
  m = max(m, bar(uv, 0.836, 0.839, lineX1(30)) * 0.7 * shown(30, uv));
  float row = floor((${BODY_TOP} - uv.y) / ${ROW_H});
  float inBody = step(0.0, row) * step(row, 27.5);
  int ri = int(clamp(row, 0.0, 27.0));
  float head = step(mod(row, 7.0), 0.5);
  float th = mix(0.17, 0.27, head);
  float y0 = ${BODY_TOP} - (row + 0.5 + th) * ${ROW_H};
  float y1 = ${BODY_TOP} - (row + 0.5 - th) * ${ROW_H};
  m = max(m, bar(uv, y0, y1, lineX1(ri)) * inBody * mix(0.85, 1.0, head) * shown(ri, uv));
  return m;
}
`;

export class Resume {
  constructor(ctx, def) {
    this.def = def;
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'resume';
    stationPosition(def, this.group.position);
    this.rand = mulberry32(12);

    this.pedestal = createPedestal(ctx, def);
    this.group.add(this.pedestal.mesh);

    // the folio yaws and bobs (the stylus works in its frame); the dust volume stays upright
    this.folio = new THREE.Group();
    this.folio.position.y = FOLIO_Y;
    this.group.add(this.folio);

    this._grid = new Float32Array((COLS + 1) * (ROWS + 1) * 3);
    this.zMid = 0;
    this.#initLines();
    this.#buildSheet(ctx);
    this.#buildStylus();
    this.#buildVolume(ctx);
    this.#buildFibers(ctx);

    // support light behind the sheet keeps it sculptural and pools on the floor;
    // the stylus tip carries the moving key light
    this.fill = new THREE.PointLight(0xffc58c, 14, 22, 2);
    this.fill.position.set(0, -0.1, -1.6);
    this.folio.add(this.fill);

    this.hit = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 6.4, 16), new THREE.MeshBasicMaterial());
    this.hit.position.y = 3.2;
    this.hit.visible = false;
    this.hit.userData.elementId = def.id;
    this.group.add(this.hit);

    this.yaw = null;
    this._v = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._q = new THREE.Quaternion();
  }

  // ---------------------------------------------------------------- page & ink

  #initLines() {
    const rand = mulberry32(31);
    this.lineW = new Float32Array(LINES);
    for (let r = 0; r < 28; r++) {
      const k = r % 7;
      this.lineW[r] = k === 6 ? 0 : k === 0 ? 0.3 + 0.12 * rand() : 0.5 + 0.42 * rand();
    }
    this.lineW.set([0.58, 0.8, 1.0], 28);
    this.lineEnd = new Float32Array(LINES);
    this.lineInk = new Float32Array(LINES);
    this.lineFade = new Float32Array(LINES);
    // start mid-life: part of the page already written, at varying strength
    for (let i = 0; i < LINES; i++) {
      this.lineFade[i] = 0.012 + 0.028 * rand();
      if (this.lineW[i] > 0 && rand() < 0.55) {
        this.lineEnd[i] = X0 + this.lineW[i] * 0.8;
        this.lineInk[i] = 0.25 + 0.7 * rand();
      }
    }
  }

  #lineX1(i) {
    return X0 + this.lineW[i] * 0.8;
  }

  #buildSheet(ctx) {
    const faces = COLS * ROWS;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(faces * 6 * 3);
    const page = new Float32Array(faces * 6 * 2);
    const corner = new Float32Array(faces * 6 * 2);
    // two triangles per parallelogram, A B D / A D C, with flat-pattern page coordinates
    const quad = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
    let v = 0;
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        for (const [di, dj] of quad) {
          const gi = i + di, gj = j + dj;
          page.set([(gi * A + (gj % 2) * BC) / FLAT_W, (gj * BS) / FLAT_H], v * 2);
          corner.set([di, dj], v * 2);
          v++;
        }
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(pos.length), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aPage', new THREE.BufferAttribute(page, 2));
    geo.setAttribute('aFace', new THREE.BufferAttribute(corner, 2));

    this.paperU = {
      uGlow: { value: 1 },
      uInkGain: { value: 0.8 },
      uLightW: { value: new THREE.Vector3() },
      uLightCol: { value: new THREE.Color(0xffc58c) },
      uNoise2D: { value: ctx.noise2D },
      uLineEnd: { value: this.lineEnd },
      uLineInk: { value: this.lineInk },
      uLineW: { value: this.lineW },
    };
    const mat = new THREE.MeshStandardMaterial({ color: '#e4d9c6', roughness: 0.86, metalness: 0, side: THREE.DoubleSide });
    patchMaterial(mat, {
      key: 'resume-paper',
      uniforms: this.paperU,
      vertexHeader: 'attribute vec2 aPage; attribute vec2 aFace; varying vec2 vPage; varying vec2 vFace; varying vec3 vWPos;',
      vertex: { begin_vertex: `#include <begin_vertex>\nvPage = aPage; vFace = aFace;\n${worldPosVaryingVertex}` },
      fragmentHeader: PAPER_GLSL,
      fragment: {
        color_fragment: /* glsl */ `
          #include <color_fragment>
          {
            vec4 fib = texture(uNoise2D, vPage * vec2(3.1, 4.0));
            vec4 fib2 = texture(uNoise2D, vPage * vec2(17.0, 22.0) + 0.3);
            diffuseColor.rgb *= 0.9 + 0.08 * fib.r + 0.06 * fib2.g;
            float edge = min(min(vFace.x, 1.0 - vFace.x), min(vFace.y, 1.0 - vFace.y));
            diffuseColor.rgb *= mix(0.8, 1.0, smoothstep(0.0, 0.06, edge));   // pressed creases
            if (gl_FrontFacing) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.028, 0.027), inkMask(vPage) * uInkGain);
            else diffuseColor.rgb *= vec3(0.97, 0.94, 0.88);
          }`,
        emissivemap_fragment: /* glsl */ `
          {
            // the support light behind the sheet shines through the faces turned away from it
            vec3 nW = inverseTransformDirection(normal, viewMatrix);
            vec3 toL = uLightW - vWPos;
            float d2 = dot(toL, toL);
            float ndl = dot(nW, toL * inversesqrt(d2));
            float atten = 1.0 / (1.0 + d2 * 1.1);
            totalEmissiveRadiance += uLightCol * diffuseColor.rgb * (0.03 + max(-ndl, 0.0) * 0.9) * atten * uGlow;
          }`,
      },
    });
    this.sheet = new THREE.Mesh(geo, mat);
    this.sheet.castShadow = true;
    this.sheet.receiveShadow = true;
    this.sheet.frustumCulled = false;
    this.folio.add(this.sheet);
  }

  // ---------------------------------------------------------------- stylus

  /** Machined writing probe: a needle tip at the origin, body along +Y. */
  #buildStylus() {
    const prof = [
      [0, 0], [0.004, 0.012], [0.011, 0.07], [0.017, 0.1], [0.024, 0.165], [0.024, 0.2], [0.032, 0.21],
      [0.032, 0.262], [0.026, 0.272], [0.026, 0.64], [0.03, 0.65], [0.03, 1.07], [0.035, 1.08], [0.035, 1.16],
      [0.022, 1.21], [0.0, 1.23],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const geo = new THREE.LatheGeometry(prof, 32);
    const mat = new THREE.MeshStandardMaterial({ color: '#b6b9bd', metalness: 0.95, roughness: 0.26 });
    patchMaterial(mat, {
      key: 'resume-stylus',
      vertexHeader: 'varying vec3 vSP;',
      vertex: { begin_vertex: '#include <begin_vertex>\nvSP = position;' },
      fragmentHeader: 'varying vec3 vSP; uniform float uTipGlow;',
      uniforms: { uTipGlow: { value: 1 } },
      fragment: {
        roughnessmap_fragment: /* glsl */ `
          float roughnessFactor = roughness;
          {
            // knurled grip, a darker anodised body section
            float grip = step(0.272, vSP.y) * step(vSP.y, 0.64);
            float knurl = step(0.0, sin(atan(vSP.z, vSP.x) * 40.0 + vSP.y * 260.0)) * step(0.0, sin(atan(vSP.z, vSP.x) * 40.0 - vSP.y * 260.0));
            diffuseColor.rgb *= mix(1.0, 0.45 + 0.25 * knurl, grip);
            roughnessFactor = mix(roughnessFactor, 0.5, grip);
            float body = step(0.65, vSP.y) * step(vSP.y, 1.07);
            diffuseColor.rgb *= mix(1.0, 0.32, body);
          }`,
        emissivemap_fragment: /* glsl */ `
          // warm signal ring at the collar
          totalEmissiveRadiance += vec3(1.0, 0.72, 0.42) * (step(0.232, vSP.y) * step(vSP.y, 0.242)) * 3.0 * uTipGlow;`,
      },
    });
    this.stylusMat = mat;
    this.stylus = new THREE.Mesh(geo, mat);
    this.stylus.scale.setScalar(STYLUS_SCALE);
    this.stylus.castShadow = true;
    this.folio.add(this.stylus);

    this.tipMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.78, 0.5).multiplyScalar(8), toneMapped: true });
    this.tip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), this.tipMat);
    this.stylus.add(this.tip);

    // the moving key light rides just off the tip, on the writing side
    this.light = new THREE.PointLight(0xffc896, 12, 14, 2);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(512, 512);
    this.light.shadow.camera.near = 0.05;
    this.light.shadow.camera.far = 6;
    this.light.shadow.bias = -0.002;
    this.light.shadow.normalBias = 0.02;
    this.folio.add(this.light);

    this.tipPos = new THREE.Vector3();
    this.tipDir = new THREE.Vector3(0, 1, 0.4).normalize();
    this.mode = 'start';
    this.line = 0;
    this.writeX = X0;
    this.trip = null;
  }

  /** Point and front normal on the folded sheet at page coordinates (u, v), in folio space. */
  #surface(u, v, outP, outN) {
    const g = this._grid;
    const jf = THREE.MathUtils.clamp((v * FLAT_H) / BS, 0, ROWS - 1e-4);
    const j = Math.floor(jf), t = jf - j;
    const xoff = THREE.MathUtils.lerp((j % 2) * BC, ((j + 1) % 2) * BC, t);
    const fi = THREE.MathUtils.clamp((u * FLAT_W - xoff) / A, 0, COLS - 1e-4);
    const i = Math.floor(fi), s = fi - i;
    const k = (jj, ii) => (jj * (COLS + 1) + ii) * 3;
    const a = k(j, i), b = k(j, i + 1), c = k(j + 1, i), d = k(j + 1, i + 1);
    for (let e = 0; e < 3; e++) {
      const bottom = g[a + e] + (g[b + e] - g[a + e]) * s;
      const top = g[c + e] + (g[d + e] - g[c + e]) * s;
      outP.setComponent(e, bottom + (top - bottom) * t - (e === 2 ? this.zMid : 0));
    }
    const ux = g[b] - g[a], uy = g[b + 1] - g[a + 1], uz = g[b + 2] - g[a + 2];
    const wx = g[c] - g[a], wy = g[c + 1] - g[a + 1], wz = g[c + 2] - g[a + 2];
    outN.set(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx).normalize();
  }

  /** Choose a faded line to write next, away from the current one. */
  #pickLine() {
    const cands = [];
    for (let i = 0; i < LINES; i++) if (this.lineW[i] > 0 && i !== this.line) cands.push(i);
    cands.sort((x, y) => this.lineInk[x] - this.lineInk[y]);
    const pool = cands.slice(0, 6).filter((i) => Math.abs(lineY(i) - lineY(this.line)) > 0.15);
    return (pool.length ? pool : cands)[Math.floor(this.rand() * Math.min(pool.length || cands.length, 6))];
  }

  /** Start a flight from the current tip position to a page point (or a fixed folio-space point). */
  #fly(to, { duration, wide = true, next }) {
    const side = this.rand() < 0.5 ? -1 : 1;
    this.trip = { from: this.tipPos.clone(), fromN: this._lastN?.clone() ?? new THREE.Vector3(0, 0, 1), to, k: 0, duration, wide, side, next };
    this.mode = 'fly';
  }

  #startLine(i) {
    this.line = i;
    this.writeX = X0;
    this.lineEnd[i] = X0;
    this.lineInk[i] = 1;
  }

  #stepStylus(dt, time, hk, focused) {
    const P = this._p, N = this._n;
    const speed = 1 + 0.6 * hk;
    let pen = 0; // 1 while the tip is on the paper

    const finishing = ['final', 'parked'].includes(this.mode) || (this.mode === 'fly' && ['final', 'parked'].includes(this.trip.next));
    if (focused && !finishing) {
      this.#fly({ u: 0.12, v: 0.93 }, { duration: 0.75, wide: false, next: 'final' });
    } else if (!focused && ['final', 'parked'].includes(this.mode)) {
      this.mode = 'idle';
    } else if (!focused && this.mode === 'fly' && this.trip.next !== 'write') {
      this.trip.next = 'write';
      this.trip.to = { line: this.#pickLine() };
    }

    if (this.mode === 'start' || this.mode === 'idle') {
      const i = this.#pickLine();
      if (this.mode === 'start') {
        this.#surface(X0, lineY(i), P, N);
        this.tipPos.copy(P).addScaledVector(N, 0.4);
        this._lastN = N.clone();
      }
      this.#fly({ line: i }, { duration: 2.2, next: 'write' });
    }

    if (this.mode === 'write') {
      this.writeX = Math.min(this.writeX + dt * 0.16 * speed, this.#lineX1(this.line));
      this.lineEnd[this.line] = this.writeX;
      this.lineInk[this.line] = 1;
      this.#surface(this.writeX, lineY(this.line), P, N);
      const jitter = 0.004 * Math.sin(time * 37.0) + 0.003 * Math.sin(time * 23.0);
      this.tipPos.copy(P).addScaledVector(N, 0.012 + jitter);
      this._lastN = N.clone();
      pen = 1;
      if (this.writeX >= this.#lineX1(this.line)) {
        // a short hop to the next line in the section, or lift off and travel elsewhere
        const below = this.line + 1;
        if (this.line < 27 && this.lineW[below] > 0 && this.rand() < 0.55) {
          this.#fly({ line: below }, { duration: 0.6, wide: false, next: 'write' });
        } else {
          this.#fly({ line: this.#pickLine() }, { duration: (2.0 + this.rand() * 0.9) / speed, next: 'write' });
        }
      }
    }

    if (this.mode === 'final') {
      // the closing pass: a fast zigzag down the page that resolves every line it passes
      this.finalK = Math.min(1, (this.finalK ?? 0) + dt / 1.5);
      const k = this.finalK;
      const v = 0.93 - k * 0.86;
      const u = 0.14 + 0.74 * (0.5 - 0.5 * Math.cos(k * Math.PI * 9));
      this.#surface(u, v, P, N);
      this.tipPos.copy(P).addScaledVector(N, 0.015);
      this._lastN = N.clone();
      pen = 1;
      for (let i = 0; i < LINES; i++) {
        if (this.lineW[i] > 0 && lineY(i) > v) {
          this.lineEnd[i] = this.#lineX1(i);
          this.lineInk[i] = Math.min(1, this.lineInk[i] + dt * 3);
        }
      }
      if (k >= 1) {
        this.finalK = 0;
        this.#fly({ park: true }, { duration: 0.9, wide: false, next: 'parked' });
      }
    }

    if (this.mode === 'parked') {
      this.#surface(0.97, 0.99, P, N);
      this.tipPos.copy(P).addScaledVector(N, 0.16).add(this._v.set(0.06, 0.12, 0));
    }

    if (this.mode === 'fly') {
      const tr = this.trip;
      tr.k = Math.min(1, tr.k + dt / tr.duration);
      const e = smooth(tr.k);
      // the destination is evaluated live: the sheet keeps moving while the stylus travels
      const to = this._v;
      const toN = N;
      if (tr.to.park) {
        this.#surface(0.97, 0.99, to, toN);
        to.addScaledVector(toN, 0.16).add(this._d.set(0.06, 0.12, 0));
      } else {
        const tu = tr.to.line !== undefined ? X0 : tr.to.u;
        const tv = tr.to.line !== undefined ? lineY(tr.to.line) : tr.to.v;
        this.#surface(tu, tv, to, toN);
        to.addScaledVector(toN, 0.012);
      }
      const lift = tr.wide ? 1.0 : 0.3;
      const swing = tr.wide ? 1.5 : 0;
      const c1 = tr.from.clone().addScaledVector(tr.fromN, lift).add(this._d.set(tr.side * swing, 0.5 * lift, 0));
      const c2 = to.clone().addScaledVector(toN, lift).add(this._d.set(tr.side * swing * 0.8, 0.7 * lift, 0));
      const u1 = 1 - e;
      this.tipPos
        .copy(tr.from).multiplyScalar(u1 * u1 * u1)
        .addScaledVector(c1, 3 * u1 * u1 * e)
        .addScaledVector(c2, 3 * u1 * e * e)
        .addScaledVector(to, e * e * e);
      this._lastN = toN.clone().lerp(tr.fromN, 1 - e).normalize();
      if (tr.k >= 1) {
        this.trip = null;
        if (tr.next === 'write') this.#startLine(tr.to.line);
        if (tr.next === 'final') this.finalK = 0;
        this.mode = tr.next;
      }
    }

    // body leans back from the paper and up; while travelling it trails its motion
    const n = this._lastN ?? N;
    const target = this._d.copy(n).multiplyScalar(0.55).add(this._v.set(0.22, 0.8, 0));
    if (this.mode === 'parked') target.set(0.15, 1, 0.12);
    target.normalize();
    this.tipDir.lerp(target, Math.min(1, dt * 5)).normalize();
    this.stylus.position.copy(this.tipPos);
    this.stylus.quaternion.setFromUnitVectors(this._v.set(0, 1, 0), this.tipDir);
    return pen;
  }

  // ---------------------------------------------------------------- atmosphere

  /** Dust hanging in the stylus light: the fire's ray-marched volume, re-densified around the tip. */
  #buildVolume(ctx) {
    const steps = ctx.quality.volumeSteps;
    const geo = new THREE.BoxGeometry(VOL_HALF.x * 2, VOL_HALF.y * 2, VOL_HALF.z * 2);
    this.volMat = new THREE.ShaderMaterial({
      uniforms: {
        uNoise: { value: ctx.noise3D },
        uTime: ctx.uniforms.uTime,
        uIntensity: { value: 1.0 },
        uTip: { value: new THREE.Vector3() },
        uCamLocal: { value: new THREE.Vector3() },
        uBoxMin: { value: VOL_HALF.clone().negate() },
        uBoxMax: { value: VOL_HALF.clone() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vLocal;
        void main() {
          vLocal = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler3D uNoise;
        uniform float uTime;
        uniform float uIntensity;
        uniform vec3 uTip;
        uniform vec3 uCamLocal;
        uniform vec3 uBoxMin;
        uniform vec3 uBoxMax;
        varying vec3 vLocal;
        #define STEPS ${steps}
        vec2 boxHit(vec3 ro, vec3 rd) {
          vec3 inv = 1.0 / rd;
          vec3 t0 = (uBoxMin - ro) * inv;
          vec3 t1 = (uBoxMax - ro) * inv;
          vec3 tmin = min(t0, t1), tmax = max(t0, t1);
          return vec2(max(max(max(tmin.x, tmin.y), tmin.z), 0.0), min(min(tmax.x, tmax.y), tmax.z));
        }
        float dens(vec3 p) {
          vec3 q = p / vec3(1.6, 2.0, 1.6);
          vec3 tq = p - uTip;
          float n = texture(uNoise, p * 0.3 + vec3(0.0, -uTime * 0.025, uTime * 0.012)).r;
          float n2 = texture(uNoise, p * 0.85 + vec3(uTime * 0.018, -uTime * 0.04, 0.0)).g;
          float dust = smoothstep(0.4, 0.9, n * 0.7 + n2 * 0.45);
          return exp(-dot(q, q) * 2.4) * (0.08 + dust) * 0.35 + exp(-dot(tq, tq) * 6.0) * (0.15 + dust) * 0.6;
        }
        float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
        void main() {
          bool inside = all(greaterThan(uCamLocal, uBoxMin)) && all(lessThan(uCamLocal, uBoxMax));
          if (gl_FrontFacing == inside) discard;
          vec3 ro = uCamLocal;
          vec3 rd = normalize(vLocal - ro);
          vec2 th = boxHit(ro, rd);
          if (th.y <= th.x) discard;
          float dt = (th.y - th.x) / float(STEPS);
          float t = th.x + dt * ign(gl_FragCoord.xy);
          float acc = 0.0;
          for (int i = 0; i < STEPS; i++) {
            acc += dens(ro + rd * t) * dt;
            t += dt;
          }
          gl_FragColor = vec4(vec3(1.0, 0.8, 0.58) * acc * 0.12 * uIntensity, 0.0);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.volume = new THREE.Mesh(geo, this.volMat);
    this.volume.position.y = FOLIO_Y;
    this.volume.renderOrder = 10;
    this.volume.frustumCulled = false;
    this.group.add(this.volume);
  }

  /** Paper fibres kicked up where the stylus writes (the fire's embers, slowed, cooled and born at the tip). */
  #buildFibers(ctx) {
    const count = ctx.quality.fibers;
    this.fib = {
      count,
      pos: new Float32Array(count * 3),
      vel: new Float32Array(count * 3),
      age: new Float32Array(count).fill(1e3),
      life: new Float32Array(count).fill(1),
      alpha: new Float32Array(count),
      size: new Float32Array(count),
      next: 0,
      acc: 0,
    };
    for (let i = 0; i < count; i++) this.fib.size[i] = 0.012 + this.rand() * 0.022;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.fib.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.fib.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.fib.size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: ctx.uniforms.uPointScale },
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        attribute float aSize;
        uniform float uScale;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = max(aSize * uScale / -mv.z, 1.2);
          vAlpha = aAlpha;
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          float core = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
          core *= core;
          gl_FragColor = vec4(vec3(1.0, 0.84, 0.62) * 3.5 * core * vAlpha, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.fibers = new THREE.Points(geo, mat);
    this.fibers.frustumCulled = false;
    this.fibers.renderOrder = 12;
    this.group.add(this.fibers);
  }

  #stepFibers(dt, time, rate, origin) {
    const f = this.fib;
    f.acc += rate * dt;
    while (f.acc >= 1) {
      f.acc -= 1;
      const i = f.next;
      f.next = (f.next + 1) % f.count;
      f.age[i] = 0;
      f.life[i] = 1.8 + this.rand() * 2.6;
      f.pos.set([origin.x + (this.rand() - 0.5) * 0.06, origin.y + (this.rand() - 0.5) * 0.06, origin.z + (this.rand() - 0.5) * 0.06], i * 3);
      const a = this.rand() * Math.PI * 2;
      const sp = 0.05 + this.rand() * 0.2;
      f.vel.set([Math.cos(a) * sp, 0.08 + this.rand() * 0.18, Math.sin(a) * sp], i * 3);
    }
    for (let i = 0; i < f.count; i++) {
      f.age[i] += dt;
      const k = f.age[i] / f.life[i];
      if (k >= 1) {
        f.alpha[i] = 0;
        continue;
      }
      const o = i * 3;
      f.vel[o] += Math.sin(time * 1.3 + i) * 0.02 * dt;
      f.vel[o + 2] += Math.cos(time * 1.1 + i * 1.7) * 0.02 * dt;
      f.vel[o + 1] += 0.03 * dt;
      for (let e = 0; e < 3; e++) {
        f.vel[o + e] *= 1 - 0.6 * dt;
        f.pos[o + e] += f.vel[o + e] * dt;
      }
      f.alpha[i] = Math.min(1, k * 8) * (1 - k) * (0.6 + 0.4 * Math.sin(time * 2.3 + i));
    }
    this.fibers.geometry.attributes.position.needsUpdate = true;
    this.fibers.geometry.attributes.aAlpha.needsUpdate = true;
  }

  // ---------------------------------------------------------------- fold

  /** Fold the sheet, curl it around its vertical axis, and write flat-shaded faces. */
  #shape(fold, curl) {
    const { p, h, q, r } = miura(fold);
    const g = this._grid;
    const w = COLS * p + q;
    const cx = w / 2, cy = (ROWS * r) / 2;
    const R = curl > 1e-3 ? w / curl : 0;
    let zSum = 0;
    for (let j = 0; j <= ROWS; j++) {
      for (let i = 0; i <= COLS; i++) {
        let x = i * p + (j % 2) * q - cx;
        let z = (i % 2) * h - h / 2;
        if (R) {
          const a = x / R;
          z += R * (1 - Math.cos(a));
          x = R * Math.sin(a);
        }
        const k = (j * (COLS + 1) + i) * 3;
        g[k] = x;
        g[k + 1] = j * r - cy;
        g[k + 2] = z;
        zSum += z;
      }
    }
    this.zMid = zSum / ((COLS + 1) * (ROWS + 1));
    const pos = this.sheet.geometry.attributes.position;
    const nrm = this.sheet.geometry.attributes.normal;
    const P = pos.array, N = nrm.array;
    const quad = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
    let v = 0;
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        for (const [di, dj] of quad) {
          const k = ((j + dj) * (COLS + 1) + i + di) * 3;
          P[v * 3] = g[k];
          P[v * 3 + 1] = g[k + 1];
          P[v * 3 + 2] = g[k + 2] - this.zMid;
          v++;
        }
        // one normal per triangle (the curl bends faces slightly out of plane)
        for (let t = v - 6; t < v; t += 3) {
          const ax = P[t * 3], ay = P[t * 3 + 1], az = P[t * 3 + 2];
          const ux = P[t * 3 + 3] - ax, uy = P[t * 3 + 4] - ay, uz = P[t * 3 + 5] - az;
          const wx = P[t * 3 + 6] - ax, wy = P[t * 3 + 7] - ay, wz = P[t * 3 + 8] - az;
          let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
          const l = Math.hypot(nx, ny, nz) || 1;
          nx /= l; ny /= l; nz /= l;
          for (let c = t * 3; c < (t + 3) * 3; c += 3) {
            N[c] = nx;
            N[c + 1] = ny;
            N[c + 2] = nz;
          }
        }
      }
    }
    pos.needsUpdate = true;
    nrm.needsUpdate = true;
  }

  update(time, dt, camera) {
    const hk = this.hoverK ?? 0;
    const fk = smooth(THREE.MathUtils.clamp(this.focusK ?? 0, 0, 1));
    const focused = this.ctx.app.focused === this.def.id;

    // about 60% open at rest, 75% on hover, flat when focused
    const idleFold = 0.42 + 0.05 * Math.sin(time * 0.47) + 0.025 * Math.sin(time * 1.13 + 1.3) - 0.17 * hk;
    this.#shape(THREE.MathUtils.lerp(idleFold, 0.002, fk), THREE.MathUtils.lerp(1.0, 0.0, fk));

    // the printed side keeps turning toward the viewer with a slow sway; once focused it squares up
    this.group.worldToLocal(this._v.copy(camera.position));
    const target = Math.atan2(this._v.x, this._v.z) + (1 - fk) * 0.3 * Math.sin(time * 0.19);
    if (this.yaw === null) this.yaw = target;
    let d = (target - this.yaw) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * (0.35 + 2.5 * fk));
    this.folio.rotation.y = this.yaw;
    this.folio.rotation.x = (1 - fk) * Math.sin(time * 0.37) * 0.05 - fk * 0.04;
    this.folio.position.y = FOLIO_Y + Math.sin(time * 0.7) * 0.06 * (1 - fk * 0.6);
    this.folio.updateMatrixWorld();

    // older writing recedes unevenly; nothing fades while the page is being read
    const fade = 1 - fk;
    for (let i = 0; i < LINES; i++) {
      if (!(this.mode === 'write' && i === this.line)) this.lineInk[i] = Math.max(0, this.lineInk[i] - this.lineFade[i] * dt * fade);
    }

    const pen = this.#stepStylus(dt, time, hk, focused);
    const parked = this.mode === 'parked' ? 1 : 0;
    const flick = 0.92 + 0.08 * (noise1(time * 6.3, 2) - 0.5) * 2;
    const tipGlow = parked ? 0.25 + 0.1 * Math.sin(time * 1.6) : (0.75 + 0.25 * pen) * (1 + 0.3 * hk) * flick;
    this.tipMat.color.setRGB(1.0, 0.78, 0.5).multiplyScalar(2 + 5 * tipGlow);
    this.stylusMat.userData.shader?.uniforms.uTipGlow && (this.stylusMat.userData.shader.uniforms.uTipGlow.value = tipGlow);
    // key light rides just off the tip, on the writing side of the paper
    const n = this._lastN ?? this._n;
    this.light.position.copy(this.tipPos).addScaledVector(n, 0.5).addScaledVector(this.tipDir, 0.1);
    this.light.intensity = 4.5 * tipGlow;

    const breathe = 0.97 + 0.03 * (noise1(time * 0.9, 3) - 0.5) * 2;
    this.fill.intensity = THREE.MathUtils.lerp(20, 24, fk) * breathe;
    this.paperU.uGlow.value = THREE.MathUtils.lerp(1.4 + 0.5 * hk, 1.3, fk) * breathe;
    this.paperU.uInkGain.value = THREE.MathUtils.lerp(0.78 + 0.17 * hk, 1.0, fk);
    this.fill.getWorldPosition(this.paperU.uLightW.value);

    // fibres and dust gather around the tip
    const tipW = this.stylus.localToWorld(this._v.set(0, 0, 0));
    this.group.worldToLocal(tipW);
    this.#stepFibers(dt, time, (pen ? 26 : 5) * (1 + 1.2 * hk) * (1 - 0.8 * parked), tipW);
    this.volMat.uniforms.uTip.value.copy(tipW).y -= FOLIO_Y;
    this.volMat.uniforms.uIntensity.value = (1.0 + 0.25 * hk) * (1 - 0.5 * fk) * breathe;
    this.volume.worldToLocal(this.volMat.uniforms.uCamLocal.value.copy(camera.position));
  }
}
