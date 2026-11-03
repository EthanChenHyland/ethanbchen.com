import * as THREE from 'three';
import { patchMaterial } from '../gl/patch.js';
import { worldPosVaryingVertex } from '../gl/glsl.js';
import { mulberry32, noise1 } from '../gl/noise.js';
import { createPedestal } from '../world/Platform.js';
import { stationPosition } from '../config.js';
import { PaperEcosystem, paperMaterial, STOCK } from './ResumePaper.js';

const FOLIO_Y = 3.75; // centre of the sheet above the floor
// The sheet: one large page in a shallow letter (Z) fold, with two soft creases at a
// third and two thirds of its height and a broad curl across its width.
const FLAT_W = 3.8;
const FLAT_H = 4.9;
const NX = 40;
const NY = 60;
const CREASE = [1 / 3, 2 / 3];
const VOL_HALF = new THREE.Vector3(2.9, 3.3, 2.9);
const STYLUS_SCALE = 1.7; // the probe has to read from across the platform

// Page layout in flat page coordinates (u right, v up, 0..1). The title, section headings
// and rules are permanent print; the body lines under each heading are written by the
// stylus and fade on their own. [length as a share of the text width, bold]
// Ordered like the real résumé; Experience carries the most weight, Skills closes with a
// denser, shorter block. `row` overrides the line spacing.
const SECTIONS = [
  { title: 'EDUCATION', lines: [[0.6, 1], [0.74, 0]] },
  { title: 'EXPERIENCE', lines: [[0.56, 1], [0.88, 0], [0.76, 0], [0.5, 1], [0.84, 0], [0.66, 0], [0.48, 1], [0.8, 0]] },
  { title: 'PROJECTS', lines: [[0.44, 1], [0.84, 0], [0.7, 0], [0.4, 1], [0.78, 0]] },
  { title: 'SKILLS', row: 0.021, lines: [[0.92, 0], [0.86, 0], [0.7, 0]] },
];
const X0 = 0.1;
const TEXT_W = 0.8;
const ROW_H = 0.026;
const TITLE = { v0: 0.905, v1: 0.952, rule: 0.887 };
const HEADS = [];
const LINE_Y = [], LINE_W = [], LINE_BOLD = [], LINE_SEC = [];
{
  let v = 0.85;
  SECTIONS.forEach((sec, si) => {
    HEADS.push({ title: sec.title, v });
    v -= 0.044;
    for (const [w, bold] of sec.lines) {
      LINE_Y.push(v);
      LINE_W.push(w);
      LINE_BOLD.push(bold);
      LINE_SEC.push(si);
      v -= sec.row ?? ROW_H;
    }
    v -= 0.028;
  });
}
const LINES = LINE_Y.length;
const lineY = (i) => LINE_Y[i];
const smooth = (t) => t * t * (3 - 2 * t);
const sstep = (a, b, x) => smooth(THREE.MathUtils.clamp((x - a) / (b - a), 0, 1));

const PAPER_GLSL = /* glsl */ `
uniform float uGlow;
uniform float uInkGain;
uniform float uCrease;
uniform sampler2D uTitle;
uniform vec4 uMark[4]; // x0, y, x end so far, ink
uniform vec3 uLightW;
uniform vec3 uLightCol;
uniform sampler2D uNoise2D;
uniform float uLineEnd[${LINES}];
uniform float uLineInk[${LINES}];
uniform float uLineW[${LINES}];
uniform float uLineY[${LINES}];
uniform float uLineBold[${LINES}];
varying vec2 vPage;
varying vec3 vWPos;
// body lines: each written up to its end; as its ink fades it recedes from that end, softly
float inkMask(vec2 uv) {
  vec2 aa = fwidth(uv) * 1.2;
  float n0 = texture(uNoise2D, uv * vec2(5.0, 9.0)).r;
  float left = smoothstep(${X0.toFixed(2)} - aa.x, ${X0.toFixed(2)} + aa.x, uv.x);
  float m = 0.0;
  for (int i = 0; i < ${LINES}; i++) {
    float th = mix(0.16, 0.3, uLineBold[i]) * ${ROW_H};
    float v = 1.0 - smoothstep(th - aa.y, th + aa.y, abs(uv.y - uLineY[i]));
    float x1 = ${X0.toFixed(2)} + uLineW[i] * ${TEXT_W};
    float u = left * (1.0 - smoothstep(x1 - aa.x, x1 + aa.x, uv.x));
    float n = fract(n0 + float(i) * 0.618);
    float lead = ${X0.toFixed(2)} + (uLineEnd[i] - ${X0.toFixed(2)}) * clamp(uLineInk[i] * 1.25, 0.0, 1.0) + (n - 0.5) * 0.012;
    float written = 1.0 - smoothstep(lead - 0.012 - aa.x, lead + aa.x, uv.x);
    float ink = step(0.001, uLineInk[i]) * mix(0.6, 1.0, uLineInk[i]);
    m = max(m, v * u * written * ink * mix(0.82, 1.0, uLineBold[i]));
  }
  return m;
}
// underlines the stylus adds while the page is being read
float markMask(vec2 uv) {
  vec2 maa = fwidth(uv) * 1.2;
  float m = 0.0;
  for (int k = 0; k < 4; k++) {
    vec4 mk = uMark[k];
    float mv = 1.0 - smoothstep(0.0026 - maa.y, 0.0026 + maa.y, abs(uv.y - mk.y));
    float mu = smoothstep(mk.x - maa.x, mk.x + maa.x, uv.x) * (1.0 - smoothstep(mk.z - maa.x, mk.z + maa.x, uv.x));
    m = max(m, mv * mu * mk.w);
  }
  return m;
}
// the permanent print: title, section headings and rules
float titleMask(vec2 uv) {
  return texture(uTitle, uv).a;
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

    // per-frame shape of the sheet, shared by the mesh and the stylus
    this.prof = { y: new Float32Array(NY + 1), z: new Float32Array(NY + 1) };
    this.sh = { curl: 0.7, flex: 1, time: 0, pu: 0.5, pv: 0.5, press: 0, yMid: 0, zMid: 0 };
    this.#initLines();
    this.marks = [0, 1, 2, 3].map(() => new THREE.Vector4(0, -1, 0, 0));
    this.markSlot = 0;
    this.#buildSheet(ctx);
    this.#buildStylus();
    this.#buildVolume(ctx);
    this.#buildFibers(ctx);
    this.#buildSlips();
    this.paper = new PaperEcosystem(this);
    this.tipGroup = new THREE.Vector3(0, FOLIO_Y, 0);
    this.stylusMid = new THREE.Vector3(0, FOLIO_Y, 0);
    this.stylusEnd = new THREE.Vector3(0, FOLIO_Y, 0);
    this._cam = new THREE.Vector3();

    // support light behind the sheet keeps it sculptural and pools on the floor;
    // the stylus tip carries the moving key light
    this.fill = new THREE.PointLight(0xffc58c, 14, 22, 2);
    // far enough back (and low) that the back of the page is lit, not burnt
    this.fill.position.set(0, -0.9, -2.9);
    this.folio.add(this.fill);

    this.hit = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 7.4, 16), new THREE.MeshBasicMaterial());
    this.hit.position.y = 3.7;
    this.hit.visible = false;
    this.hit.userData.elementId = def.id;
    this.group.add(this.hit);

    this.yaw = null;
    this.life = 0;
    this.pulse = 0;
    this.pulseHold = 0;
    this.drift = 0;
    this.focusDir = null;
    this._att = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._q = new THREE.Quaternion();
  }

  // ---------------------------------------------------------------- page & ink

  #initLines() {
    const rand = mulberry32(31);
    this.lineW = new Float32Array(LINE_W);
    this.lineEnd = new Float32Array(LINES);
    this.lineInk = new Float32Array(LINES);
    this.lineFade = new Float32Array(LINES);
    // start mid-life: part of the page already written, at varying strength
    for (let i = 0; i < LINES; i++) {
      this.lineFade[i] = 0.012 + 0.028 * rand();
      if (this.lineW[i] > 0 && rand() < 0.55) {
        this.lineEnd[i] = X0 + this.lineW[i] * TEXT_W;
        this.lineInk[i] = 0.25 + 0.7 * rand();
      }
    }
  }

  #lineX1(i) {
    return X0 + this.lineW[i] * TEXT_W;
  }

  #buildSheet(ctx) {
    const geo = new THREE.BufferGeometry();
    const page = new Float32Array((NX + 1) * (NY + 1) * 2);
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) page.set([i / NX, j / NY], (j * (NX + 1) + i) * 2);
    const index = [];
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const a = j * (NX + 1) + i, b = a + NX + 1;
        index.push(a, a + 1, b + 1, a, b + 1, b);
      }
    }
    geo.setIndex(index);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((NX + 1) * (NY + 1) * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array((NX + 1) * (NY + 1) * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aPage', new THREE.BufferAttribute(page, 2));

    this.paperU = {
      uGlow: { value: 1 },
      uInkGain: { value: 0.8 },
      uCrease: { value: 1 },
      uTitle: { value: this.#printTexture() },
      uMark: { value: this.marks },
      uLightW: { value: new THREE.Vector3() },
      uLightCol: { value: new THREE.Color(0xffc58c) },
      uNoise2D: { value: ctx.noise2D },
      uLineEnd: { value: this.lineEnd },
      uLineInk: { value: this.lineInk },
      uLineW: { value: this.lineW },
      uLineY: { value: LINE_Y },
      uLineBold: { value: LINE_BOLD },
    };
    const mat = new THREE.MeshStandardMaterial({ color: '#e4d9c6', roughness: 0.86, metalness: 0, side: THREE.DoubleSide });
    patchMaterial(mat, {
      key: 'resume-paper',
      uniforms: this.paperU,
      vertexHeader: 'attribute vec2 aPage; varying vec2 vPage; varying vec3 vWPos;',
      vertex: { begin_vertex: `#include <begin_vertex>\nvPage = aPage;\n${worldPosVaryingVertex}` },
      fragmentHeader: PAPER_GLSL,
      fragment: {
        color_fragment: /* glsl */ `
          #include <color_fragment>
          {
            vec4 fib = texture(uNoise2D, vPage * vec2(3.1, 4.0));
            vec4 fib2 = texture(uNoise2D, vPage * vec2(17.0, 22.0) + 0.3);
            diffuseColor.rgb *= 0.9 + 0.08 * fib.r + 0.06 * fib2.g;
            // two pressed creases, fading as the page flattens
            float cr = exp(-pow((vPage.y - ${CREASE[0].toFixed(4)}) / 0.006, 2.0)) + exp(-pow((vPage.y - ${CREASE[1].toFixed(4)}) / 0.006, 2.0));
            diffuseColor.rgb *= 1.0 - 0.14 * cr * uCrease;
            if (gl_FrontFacing) {
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.028, 0.027), inkMask(vPage) * uInkGain);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.025, 0.024, 0.023), titleMask(vPage) * 0.94);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.19, 0.07), markMask(vPage) * 0.9);
            }
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

  /** The page's permanent print, drawn once into a page-sized texture: a centred title, section headings, rules. */
  #printTexture() {
    const W = 1536, H = Math.round((1536 * FLAT_H) / FLAT_W);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 8;
    const font = (px, weight = 600) => `${weight} ${px}px "Inter Variable", Inter, system-ui, sans-serif`;
    // tracked capitals; x is the left edge, or the centre when centred
    const tracked = (g, text, x, baseline, px, track, centred, weight) => {
      g.font = font(px, weight);
      const widths = [...text].map((ch) => g.measureText(ch).width);
      const total = widths.reduce((a, b) => a + b, 0) + track * px * (text.length - 1);
      let cx = centred ? x - total / 2 : x;
      [...text].forEach((ch, k) => {
        g.fillText(ch, cx, baseline);
        cx += widths[k] + track * px;
      });
    };
    const y = (v) => (1 - v) * H;
    const draw = () => {
      const g = canvas.getContext('2d');
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#000';
      g.textBaseline = 'alphabetic';
      const titlePx = ((TITLE.v1 - TITLE.v0) * H) / 0.727; // Inter's cap height
      tracked(g, 'RESUME', W / 2, y(TITLE.v0), titlePx, 0.32, true);
      g.fillRect(X0 * W, y(TITLE.rule), TEXT_W * W, 2.5);
      // section headings: bold, about half the title's cap height, well above the body bars
      const headPx = (0.021 * H) / 0.727;
      for (const h of HEADS) {
        tracked(g, h.title, X0 * W, y(h.v), headPx, 0.18, false, 700);
        g.fillRect(X0 * W, y(h.v - 0.011), TEXT_W * W, 1.5);
      }
      tex.needsUpdate = true;
    };
    draw();
    Promise.all([document.fonts?.load(font(64)), document.fonts?.load(font(64, 700))]).then(draw, () => {});
    return tex;
  }

  /**
   * A few loose pieces of the same document: index tabs on the right edge, an annotation
   * slip on the left, a small card at the foot. Each one, on its own slow cycle, peels off
   * its margin, drifts beside or behind the sheet, and settles back.
   */
  #buildSlips() {
    const tab = { w: 0.6, h: 0.26, band: 0.36, lines: 1 };
    this.slips = [
      { ...tab, u: 1, v: 0.76, ox: 1, oy: 0, z: -0.03, rot: 0, color: '#e6dccb', bandColor: '#b98b4e', period: 19, phase: 0.1, drift: [2.35, 1.06, 0.1] },
      { ...tab, u: 1, v: 0.5, ox: 1, oy: 0, z: -0.03, rot: 0, color: '#e6dccb', bandColor: '#3a3836', period: 26, phase: 0.55, drift: [2.6, 0.3, -0.2] },
      { ...tab, u: 1, v: 0.27, ox: 1, oy: 0, z: -0.03, rot: 0, color: '#e6dccb', bandColor: '#9a4a35', period: 33, phase: 0.8, drift: [2.3, -0.47, 0.15] },
      { w: 0.82, h: 0.54, band: 0, lines: 3, u: 0, v: 0.6, ox: -1, oy: 0, z: 0.03, rot: -0.1, color: STOCK.warm, bandColor: '#000000', period: 23, phase: 0.35, drift: [-2.45, 0.45, 0.0] },
      { w: 0.74, h: 0.44, band: 0.12, lines: 2, u: 0, v: 0.2, ox: -1, oy: 0, z: -0.03, rot: 0.05, color: '#d4d2cb', bandColor: '#3a3836', period: 41, phase: 0.2, drift: [-2.25, -1.45, 0.1] },
    ];
    const overlap = 0.1; // how far each piece tucks under or over the page
    this.slips.forEach((d, i) => {
      const geo = new THREE.PlaneGeometry(d.w, d.h, 10, 2);
      const pa = geo.attributes.position;
      // a slight natural bow, away from the page whichever side of it the slip sits
      for (let k = 0; k < pa.count; k++) pa.setZ(k, Math.sign(d.z) * 0.05 * (pa.getX(k) / d.w) ** 2);
      geo.computeVertexNormals();
      const mat = paperMaterial(d.color, { lines: d.lines, band: d.band, bandColor: d.bandColor, seed: i * 7.31 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.folio.add(mesh);
      d.mesh = mesh;
      d.shift = new THREE.Vector2(d.ox * (d.w / 2 - overlap), d.oy * (d.h / 2 - overlap));
      d.drift = new THREE.Vector3(...d.drift).multiplyScalar(1.18);
      // tabs sit with their coloured end outward
      d.flip = d.ox < 0 ? Math.PI : 0;
    });
    this._T = new THREE.Vector3();
    this._Bv = new THREE.Vector3();
    this._m4 = new THREE.Matrix4();
    this._qa = new THREE.Quaternion();
    this._qb = new THREE.Quaternion();
    this._qc = new THREE.Quaternion();
    this._e = new THREE.Euler();
  }

  #stepSlips(time, dt, hk, fk) {
    const P = this._p, N = this._n, T = this._T, Bv = this._Bv;
    // loose paper this frame, in the folio's frame, for the slips to give way to
    const toFolio = (this._toFolio ??= new THREE.Matrix4()).copy(this.folio.matrix).invert();
    const pp = this.paper;
    const loose = [pp.mini.mesh, ...pp.balls.map((b) => b.mesh), ...pp.strips.map((x) => x.mesh), ...pp.scraps.map((x) => x.mesh), ...(pp.plane.flying ? [pp.plane.mesh] : [])].map((m, i) => {
      const L = ((this._loose ??= [])[i] ??= { p: new THREE.Vector3(), r: 0 });
      // the bounding sphere's own centre: curled strips and folded pieces are not centred on their origin
      const bs = m.geometry.boundingSphere ?? (m.geometry.computeBoundingSphere(), m.geometry.boundingSphere);
      m.updateMatrix();
      L.p.copy(bs.center).applyMatrix4(m.matrix).applyMatrix4(toFolio);
      L.r = bs.radius;
      return L;
    });
    this.slips.forEach((d, i) => {
      // its own slow cycle: on the margin, peel away, drift, return
      const ph = (time / d.period + d.phase) % 1;
      let a = sstep(0.12, 0.3, ph) - sstep(0.62, 0.82, ph);
      a *= 1 - 0.55 * hk;
      // while the page is being read, the annotation slip alone lifts now and then
      const read = i === 3 ? 0.18 * (sstep(0, 0.15, (time / 13) % 1) - sstep(0.35, 0.5, (time / 13) % 1)) : 0;
      a = THREE.MathUtils.lerp(a, read, fk * (1 - 0.4 * this.life));
      // re-engagement: every slip lifts a little off its margin, then settles
      a = Math.min(1, a + 0.22 * this.pulse);
      d.a = a;

      // attached pose: on the page surface at its margin, in the page's own frame
      const e = 0.01;
      this.#point(d.u + e, d.v, T);
      this.#point(d.u - e, d.v, P);
      T.sub(P).normalize();
      this.#point(d.u, Math.min(d.v + e, 1), Bv);
      this.#point(d.u, Math.max(d.v - e, 0), P);
      Bv.sub(P).normalize();
      N.crossVectors(T, Bv).normalize();
      Bv.crossVectors(N, T);
      this.#point(d.u, d.v, P);
      const attached = this._v.copy(P).addScaledVector(T, d.shift.x).addScaledVector(Bv, d.shift.y).addScaledVector(N, d.z);
      this._m4.makeBasis(T, Bv, N);
      this._qa.setFromRotationMatrix(this._m4).multiply(this._qc.setFromAxisAngle(this._d.set(0, 0, 1), d.rot + d.flip));

      // drift pose: beside or behind the sheet, tumbling slowly
      const s = i * 1.7;
      const drift = this._d.copy(d.drift).add(this._p.set(0.25 * Math.sin(time * 0.37 + s), 0.3 * Math.sin(time * 0.29 + s * 2), 0.25 * Math.sin(time * 0.41 + s * 3)));
      this._qb.copy(this._qa).multiply(this._qc.setFromEuler(this._e.set(0.5 * Math.sin(time * 0.4 + s), 0.6 * Math.sin(time * 0.23 + s) + 0.4, 0.3 * Math.sin(time * 0.31 + s))));

      // it peels first (its free edge lifts about the page edge), arcs out on its own side of
      // the page, and only tumbles once it is clear
      const pk = smooth(a);
      const out = Math.sign(d.z);
      d.mesh.position.copy(attached).lerp(drift, pk).addScaledVector(N, out * 0.4 * Math.sin(Math.PI * pk));
      d.mesh.quaternion.slerpQuaternions(this._qa, this._qb, sstep(0.15, 0.75, a));
      // the lift and the stylus flutter hinge on the page edge and only ever open outward
      const near = Math.exp(-d.mesh.position.distanceToSquared(this.tipPos) * 3);
      const lift = Math.sin(Math.min(a * 2.5, 1) * Math.PI) * 0.45 + near * 0.12 * (0.5 + 0.5 * Math.sin(time * 13 + i));
      const hinge = this._qc.setFromAxisAngle(Bv, -d.ox * out * lift);
      const pivot = P.addScaledVector(N, d.z);
      d.mesh.position.sub(pivot).applyQuaternion(this._q.copy(hinge).slerp((this._qId ??= new THREE.Quaternion()), pk)).add(pivot);
      d.mesh.quaternion.premultiply(hinge);
      // a slip gives way to the stylus body and to passing loose paper (eased, so it bends its
      // path rather than jumps): fully while drifting, a little while on its margin
      const rs = Math.hypot(d.w, d.h) * 0.5;
      const give = sstep(0.02, 0.2, a);
      const push = (this._push ??= new THREE.Vector3()).set(0, 0, 0);
      const sa = this.tipPos, sb = this._T.copy(this.tipDir).multiplyScalar(1.2 * STYLUS_SCALE);
      const k = THREE.MathUtils.clamp(this._Bv.subVectors(d.mesh.position, sa).dot(sb) / sb.lengthSq(), 0, 1);
      const away = this._Bv.sub(sb.multiplyScalar(k));
      let dist = away.length();
      if (dist < rs + 0.08 && dist > 1e-4) push.addScaledVector(away, ((rs + 0.08 - dist) / dist) * (0.5 + 0.5 * give));
      for (const L of loose) {
        away.subVectors(d.mesh.position, L.p);
        dist = away.length();
        const need = rs + L.r + 0.03;
        if (dist < need && dist > 1e-4) push.addScaledVector(away, ((need - dist) / dist) * (0.5 + 0.5 * give));
      }
      (d.avoid ??= new THREE.Vector3()).lerp(push, Math.min(1, dt * 6));
      d.mesh.position.add(d.avoid);
    });
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

    this.tipMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.78, 0.5).multiplyScalar(3), toneMapped: true });
    this.tip = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), this.tipMat);
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

  /** Point on the sheet at page coordinates (u, v), in folio space. */
  #point(u, v, out) {
    const sh = this.sh, { y, z } = this.prof;
    const jf = THREE.MathUtils.clamp(v, 0, 1) * NY;
    const j = Math.min(Math.floor(jf), NY - 1), t = jf - j;
    const x0 = (u - 0.5) * FLAT_W;
    let px = x0, pz = 0;
    if (sh.curl > 1e-3) {
      // broad curl across the width, edges toward the viewer
      const R = FLAT_W / sh.curl;
      px = R * Math.sin(x0 / R);
      pz = R * (1 - Math.cos(x0 / R));
    }
    const tm = sh.time;
    // slow flex, a little edge movement, and a soft give under the stylus
    pz += sh.flex * (0.07 * Math.sin(tm * 0.6) * Math.sin(Math.PI * u) * (v - 0.5) + 0.03 * Math.sin(tm * 0.43 + u * 2.0) * Math.sin(Math.PI * v));
    pz += sh.flex * 0.025 * Math.sin(tm * 1.7 + v * 6.0) * (sstep(0.85, 1, u) - sstep(0.15, 0, u) * 0.7);
    const du = (u - sh.pu) * FLAT_W, dv = (v - sh.pv) * FLAT_H;
    pz -= sh.press * 0.035 * Math.exp(-(du * du + dv * dv) / 0.12);
    return out.set(px, y[j] + (y[j + 1] - y[j]) * t - sh.yMid, pz + z[j] + (z[j + 1] - z[j]) * t - sh.zMid);
  }

  /** Point, page-right and page-up tangents, and front normal at (u, v), in folio space. */
  pageFrame(u, v, outP, outT, outB, outN) {
    const e = 0.01;
    this.#point(u + e, v, outT);
    this.#point(u - e, v, outP);
    outT.sub(outP).normalize();
    this.#point(u, Math.min(v + e, 1), outB);
    this.#point(u, Math.max(v - e, 0), outP);
    outB.sub(outP).normalize();
    outN.crossVectors(outT, outB).normalize();
    outB.crossVectors(outN, outT);
    this.#point(u, v, outP);
  }

  /** Point and front normal at page coordinates (u, v): the stylus guide surface. */
  #surface(u, v, outP, outN) {
    const e = 0.01;
    const a = this.#point(u + e, v, (this._sa ??= new THREE.Vector3()));
    const b = this.#point(u - e, v, (this._sb ??= new THREE.Vector3()));
    const c = this.#point(u, v + e, (this._sc ??= new THREE.Vector3()));
    const d = this.#point(u, v - e, (this._sd ??= new THREE.Vector3()));
    outN.crossVectors(a.sub(b), c.sub(d)).normalize();
    this.#point(u, v, outP);
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

    const finishing = ['final', 'parked', 'mark'].includes(this.mode) || (this.mode === 'fly' && ['final', 'parked', 'mark'].includes(this.trip.next));
    if (focused && !finishing) {
      this.#fly({ u: 0.12, v: 0.93 }, { duration: 0.75, wide: false, next: 'final' });
    } else if (!focused && ['final', 'parked', 'mark'].includes(this.mode)) {
      this.mode = 'idle';
    } else if (!focused && this.mode === 'fly' && ['final', 'parked', 'mark'].includes(this.trip.next)) {
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

    if (this.mode === 'write' && !focused && this.paper.plane.writable && this.paper.plane.cycle !== this.noteCycle && this.writeX > X0 + 0.08) {
      this.noteCycle = this.paper.plane.cycle;
      this.#fly({ note: true }, { duration: 1.5, next: 'note' });
    }

    if (this.mode === 'write') {
      this.writeX = Math.min(this.writeX + dt * 0.16 * speed, this.#lineX1(this.line));
      this.lineEnd[this.line] = this.writeX;
      this.lineInk[this.line] = 1;
      this.#surface(this.writeX, lineY(this.line), P, N);
      this.tipPos.copy(P).addScaledVector(N, 0.012);
      this.sh.pu = this.writeX;
      this.sh.pv = lineY(this.line);
      this._lastN = N.clone();
      pen = 1;
      if (this.writeX >= this.#lineX1(this.line)) {
        // a short hop to the next line in the section, or lift off and travel elsewhere
        const below = this.line + 1;
        if (below < LINES && LINE_SEC[below] === LINE_SEC[this.line] && this.rand() < 0.55) {
          this.#fly({ line: below }, { duration: 0.6, wide: false, next: 'write' });
        } else {
          this.#fly({ line: this.#pickLine() }, { duration: (2.0 + this.rand() * 0.9) / speed, next: 'write' });
        }
      }
    }

    if (this.mode === 'note') {
      // a short line on the docked note; it leaves for its flight with the writing on it
      this.noteT = Math.min(1, this.noteT + dt / 1.8);
      this.paper.noteFrame(this.noteT, P, N);
      this.tipPos.copy(P).addScaledVector(N, 0.01);
      this._lastN = N.clone();
      this.paper.setNoteInk(this.noteT);
      pen = 1;
      this.paper.plane.hold = this.noteT < 1 && !focused;
      if (this.noteT >= 1 || focused) {
        this.paper.plane.hold = false;
        this.#fly({ line: this.#pickLine() }, { duration: 2.2, next: 'write' });
      }
    }

    if (this.mode === 'final') {
      // the closing pass: one smooth serpentine stroke down the page that resolves every line it passes
      this.finalK = Math.min(1, (this.finalK ?? 0) + dt / 1.6);
      const k = smooth(this.finalK);
      const v = 0.93 - k * 0.86;
      const u = 0.5 - 0.36 * Math.cos(k * Math.PI * 5);
      this.sh.pu = u;
      this.sh.pv = v;
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
      if (this.finalK >= 1) {
        this.finalK = 0;
        this.#fly({ park: true }, { duration: 0.9, wide: false, next: 'parked' });
      }
    }

    if (this.mode === 'parked') {
      this.#surface(0.99, 0.985, P, N);
      this.tipPos.copy(P).addScaledVector(N, 0.05).add(this._v.set(0.05, 0.04, 0));
      // the page is being read: now and then lift off and underline something, then park again
      this.parkT = (this.parkT ?? 0) + dt;
      if (focused && this.parkT > (this.parkWait ?? 4)) {
        let i;
        do i = Math.floor(this.rand() * LINES);
        while (LINE_BOLD[i]);
        const y = lineY(i) - ROW_H * 0.4;
        const x0 = X0 + 0.01;
        this.markSlot = (this.markSlot + 1) % 4;
        this.marks[this.markSlot].set(x0, y, x0, 1);
        this.markEnd = X0 + this.lineW[i] * TEXT_W * (0.35 + 0.5 * this.rand());
        this.#fly({ u: x0, v: y }, { duration: 1.4, wide: false, next: 'mark' });
      }
    }

    if (this.mode === 'mark') {
      const mk = this.marks[this.markSlot];
      this.writeX = Math.min(this.writeX + dt * 0.09, this.markEnd);
      mk.z = this.writeX;
      mk.w = 1;
      this.#surface(this.writeX, mk.y, P, N);
      this.tipPos.copy(P).addScaledVector(N, 0.012);
      this._lastN = N.clone();
      this.sh.pu = this.writeX;
      this.sh.pv = mk.y;
      pen = 1;
      if (this.writeX >= this.markEnd) {
        this.parkT = 0;
        this.parkWait = 5 + this.rand() * 5;
        this.#fly({ park: true }, { duration: 1.6, wide: false, next: 'parked' });
      }
    }

    if (this.mode === 'fly') {
      const tr = this.trip;
      tr.k = Math.min(1, tr.k + dt / tr.duration);
      const e = smooth(tr.k);
      // the destination is evaluated live: the sheet keeps moving while the stylus travels
      const to = this._v;
      const toN = N;
      if (tr.to.note) {
        this.paper.noteFrame(0, to, toN);
        to.addScaledVector(toN, 0.01);
      } else if (tr.to.park) {
        this.#surface(0.99, 0.985, to, toN);
        to.addScaledVector(toN, 0.05).add(this._d.set(0.05, 0.04, 0));
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
        if (tr.next === 'mark') this.writeX = tr.to.u;
        if (tr.next === 'note') this.noteT = 0;
        if (tr.next === 'parked') this.parkT = 0;
        this.mode = tr.next;
      }
    }

    // body leans back from the paper and up; while travelling it trails its motion
    const n = this._lastN ?? N;
    const target = this._d.copy(n).multiplyScalar(0.55).add(this._v.set(0.22, 0.8, 0));
    if (this.mode === 'parked') target.set(1, 0.45, 0.25); // laid back along the page's right edge
    target.normalize();
    this.tipDir.lerp(target, Math.min(1, dt * 5)).normalize();
    this.stylus.position.copy(this.tipPos);
    this.stylus.quaternion.setFromUnitVectors(this._v.set(0, 1, 0), this.tipDir);
    return pen;
  }

  // ---------------------------------------------------------------- attention

  /**
   * Focused-idle life: once the focused view has settled, how far the camera has since wandered
   * from that composition (its idle orbit, or the user's own orbit) brings some paper activity
   * back. While a reframe flight returns it, drift reads as zero and the life eases away.
   */
  #stepAttention(dt, camera, focused, fk) {
    const rig = this.ctx.app.rig;
    let drift = 0;
    if (focused && !rig.busy && fk > 0.98) {
      const off = this._att.subVectors(camera.position, rig.controls.target).normalize();
      if (!this.focusDir) this.focusDir = off.clone();
      drift = THREE.MathUtils.radToDeg(this.focusDir.angleTo(off));
    } else if (!focused) this.focusDir = null;
    this.drift = drift;
    this.life += (sstep(12, 45, drift) - this.life) * Math.min(1, dt * 0.4);
    // one retriggerable envelope: a quick rise, a short hold, a soft decay
    if (this.pulseHold > 0) {
      this.pulseHold -= dt;
      this.pulse += (1 - this.pulse) * Math.min(1, dt * 7);
    } else this.pulse *= Math.exp(-dt / 0.9);
    if (!focused) this.pulse = Math.min(this.pulse, 1) * Math.exp(-dt * 3);
  }

  /**
   * The focused page was selected again, and the camera is reframing it. If the view had wandered
   * well away first, the paper wakes for a moment alongside the reframe and settles as the
   * composition returns. A pulse still under way is not stacked.
   */
  onReframe() {
    if (this.drift < 25 || this.life < 0.45 || this.pulse >= 0.35) return;
    this.pulseHold = 0.35;
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
          return exp(-dot(q, q) * 2.4) * (0.08 + dust) * 0.35 + exp(-dot(tq, tq) * 12.0) * (0.15 + dust) * 0.2;
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

  /** Shape the sheet for this frame: a shallow Z fold down its height plus curl and flex. */
  #deform(fold, curl, flex, time) {
    const sh = this.sh;
    sh.curl = curl;
    sh.flex = flex;
    sh.time = time;
    // bend angle along the height: +fold, -fold, +fold across the three panels, eased over soft creases
    const { y, z } = this.prof;
    const ds = FLAT_H / NY;
    let yy = 0, zz = 0, zSum = 0;
    for (let j = 0; j <= NY; j++) {
      const v = j / NY;
      y[j] = yy;
      z[j] = zz;
      zSum += zz;
      const sgn = 1 - 2 * sstep(CREASE[0] - 0.03, CREASE[0] + 0.03, v) + 2 * sstep(CREASE[1] - 0.03, CREASE[1] + 0.03, v);
      yy += Math.cos(fold * sgn) * ds;
      zz += Math.sin(fold * sgn) * ds;
    }
    sh.yMid = y[NY] / 2;
    const R = curl > 1e-3 ? FLAT_W / curl : 0;
    sh.zMid = zSum / (NY + 1) + (R ? R - ((2 * R * R) / FLAT_W) * Math.sin(curl / 2) : 0);

    const pos = this.sheet.geometry.attributes.position;
    const p = this._v;
    for (let j = 0; j <= NY; j++) {
      for (let i = 0; i <= NX; i++) {
        this.#point(i / NX, j / NY, p);
        pos.setXYZ(j * (NX + 1) + i, p.x, p.y, p.z);
      }
    }
    pos.needsUpdate = true;
    this.sheet.geometry.computeVertexNormals();
  }

  update(time, dt, camera) {
    const hk = this.hoverK ?? 0;
    const fk = smooth(THREE.MathUtils.clamp(this.focusK ?? 0, 0, 1));
    const focused = this.ctx.app.focused === this.def.id;

    // a shallow letter fold and broad curl at rest, a little flatter on hover, nearly flat when focused
    const idleFold = 0.36 + 0.04 * Math.sin(time * 0.47) + 0.02 * Math.sin(time * 1.13 + 1.3) - 0.14 * hk;
    const idleCurl = 0.75 + 0.08 * Math.sin(time * 0.31 + 0.7) - 0.2 * hk;
    const pressTo = (['write', 'final', 'mark'].includes(this.mode) ? 1 : 0) * (1 - 0.5 * fk);
    this.sh.press += (pressTo - this.sh.press) * Math.min(1, dt * 4);
    this.#deform(THREE.MathUtils.lerp(idleFold, 0.012, fk), THREE.MathUtils.lerp(idleCurl, 0.18, fk), 1 - 0.8 * fk, time);

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

    this.#stepAttention(dt, camera, focused, fk);
    this.group.worldToLocal(this._cam.copy(camera.position));
    this.paper.update(time, dt, { hk, fk, tip: this.tipGroup, camera: this._cam, stylusMid: this.stylusMid, stylusEnd: this.stylusEnd, slips: this.slips, life: this.life, pulse: this.pulse });
    const pen = this.#stepStylus(dt, time, hk, focused);
    this.#stepSlips(time, dt, hk, fk);
    for (const mk of this.marks) if (!(this.mode === 'mark' && mk === this.marks[this.markSlot])) mk.w = Math.max(0, mk.w - dt * 0.025);
    const parked = this.mode === 'parked' ? 1 : 0;
    const flick = 0.92 + 0.08 * (noise1(time * 6.3, 2) - 0.5) * 2;
    const tipGlow = parked ? 0.25 + 0.1 * Math.sin(time * 1.6) : (0.75 + 0.25 * pen) * (1 + 0.15 * hk) * (1 - 0.35 * fk) * flick;
    this.tipMat.color.setRGB(1.0, 0.8, 0.56).multiplyScalar(1.4 + 2.2 * tipGlow);
    this.stylusMat.userData.shader?.uniforms.uTipGlow && (this.stylusMat.userData.shader.uniforms.uTipGlow.value = tipGlow);
    // key light rides just off the tip, on the writing side of the paper
    const n = this._lastN ?? this._n;
    this.light.position.copy(this.tipPos).addScaledVector(n, 0.55).addScaledVector(this.tipDir, 0.1);
    this.light.intensity = 1.6 * tipGlow;

    const breathe = 0.97 + 0.03 * (noise1(time * 0.9, 3) - 0.5) * 2;
    this.fill.intensity = THREE.MathUtils.lerp(22, 26, fk) * breathe;
    this.paperU.uGlow.value = THREE.MathUtils.lerp(2.6 + 0.8 * hk, 2.3, fk) * breathe;
    this.paperU.uInkGain.value = THREE.MathUtils.lerp(0.78 + 0.17 * hk, 1.0, fk);
    this.paperU.uCrease.value = THREE.MathUtils.lerp(1, 0.25, fk);
    this.fill.getWorldPosition(this.paperU.uLightW.value);

    // fibres and dust gather around the tip
    const tipW = this.stylus.localToWorld(this._v.set(0, 0, 0));
    this.group.worldToLocal(tipW);
    this.tipGroup.copy(tipW);
    // the middle of the stylus body, for the loose paper to steer around
    this.stylusMid.copy(this.tipPos).addScaledVector(this.tipDir, 0.6 * STYLUS_SCALE).applyMatrix4(this.folio.matrix);
    this.stylusEnd.copy(this.tipPos).addScaledVector(this.tipDir, 1.15 * STYLUS_SCALE).applyMatrix4(this.folio.matrix);
    this.#stepFibers(dt, time, (pen ? 26 : 5) * (1 + 1.2 * hk) * (1 - 0.8 * parked), tipW);
    this.volMat.uniforms.uTip.value.copy(tipW).y -= FOLIO_Y;
    this.volMat.uniforms.uIntensity.value = (1.0 + 0.25 * hk) * (1 - 0.5 * fk) * breathe;
    this.volume.worldToLocal(this.volMat.uniforms.uCamLocal.value.copy(camera.position));
  }
}
