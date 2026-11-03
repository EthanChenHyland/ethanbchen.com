import * as THREE from 'three';
import { patchMaterial } from '../gl/patch.js';
import { hashGLSL, worldPosVaryingVertex } from '../gl/glsl.js';
import { mulberry32, noise1 } from '../gl/noise.js';
import { createPedestal } from '../world/Platform.js';
import { stationPosition } from '../config.js';

const FOLIO_Y = 2.62; // centre of the sheet above the floor
const COLS = 8;
const ROWS = 10;
// Miura-ori unit: parallelogram with sides A (along a row) and B (across rows) at sector angle GAMMA.
const GAMMA = THREE.MathUtils.degToRad(65);
const B = 0.3;
const A = 0.82 * B;
const FLAT_W = COLS * A + B * Math.cos(GAMMA);
const FLAT_H = ROWS * B * Math.sin(GAMMA);
const VOL_HALF = new THREE.Vector3(1.6, 1.9, 1.6);

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

// Ruled "printed" layout on the front of the page, in flat page coordinates (0..1).
const PAPER_GLSL = /* glsl */ `
uniform float uTime;
uniform float uReveal;
uniform float uGlow;
uniform vec3 uLightW;
uniform vec3 uLightCol;
uniform sampler2D uNoise2D;
varying vec2 vPage;
varying vec2 vFace;
varying vec3 vWPos;
${hashGLSL}
float bar(vec2 uv, float y0, float y1, float x1) {
  vec2 aa = fwidth(uv) * 1.2;
  float v = smoothstep(y0 - aa.y, y0 + aa.y, uv.y) * (1.0 - smoothstep(y1 - aa.y, y1 + aa.y, uv.y));
  float u = smoothstep(0.1 - aa.x, 0.1 + aa.x, uv.x) * (1.0 - smoothstep(x1 - aa.x, x1 + aa.x, uv.x));
  return v * u;
}
float inkMask(vec2 uv) {
  float m = bar(uv, 0.885, 0.918, 0.56);              // name
  m = max(m, bar(uv, 0.858, 0.866, 0.74) * 0.7);      // contact line
  m = max(m, bar(uv, 0.836, 0.839, 0.9) * 0.6);       // rule
  // body: four sections of a heading and four lines (branch-free so derivatives stay valid)
  float rowH = 0.0255;
  float row = floor((0.805 - uv.y) / rowH);
  float inBody = step(0.0, row) * step(row, 27.5);
  float k = mod(row, 7.0);
  float head = step(k, 0.5);
  float blank = step(5.5, k);
  float w = mix(0.5 + 0.4 * hash11(row * 7.7 + 1.0), 0.3 + 0.1 * hash11(row * 3.1), head);
  float th = mix(0.16, 0.26, head);
  float y0 = 0.805 - (row + 0.5 + th) * rowH;
  float y1 = 0.805 - (row + 0.5 - th) * rowH;
  m = max(m, bar(uv, y0, y1, 0.1 + w * 0.8) * inBody * (1.0 - blank) * mix(0.55, 0.9, head));
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

    // the folio yaws and bobs; the light volume stays upright around it
    this.folio = new THREE.Group();
    this.folio.position.y = FOLIO_Y;
    this.group.add(this.folio);

    this.#buildSheet(ctx);
    this.#buildVolume(ctx);
    this.#buildFibers(ctx);

    // the station's warm key light sits behind the sheet (the folio keeps its printed
    // side to the viewer): it pools on the floor like the fire did and shines through the paper
    this.light = new THREE.PointLight(0xffc58c, 40, 22, 2);
    this.light.position.set(0, -0.1, -1.1);
    this.folio.add(this.light);

    this.hit = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 5.2, 16), new THREE.MeshBasicMaterial());
    this.hit.position.y = 2.6;
    this.hit.visible = false;
    this.hit.userData.elementId = def.id;
    this.group.add(this.hit);

    this.yaw = null;
    this._v = new THREE.Vector3();
    this._grid = new Float32Array((COLS + 1) * (ROWS + 1) * 3);
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
          page.set([(gi * A + (gj % 2) * B * Math.cos(GAMMA)) / FLAT_W, (gj * B * Math.sin(GAMMA)) / FLAT_H], v * 2);
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
      uTime: ctx.uniforms.uTime,
      uReveal: { value: 0 },
      uGlow: { value: 1 },
      uLightW: { value: new THREE.Vector3() }, // where the glow comes from: just behind the middle of the sheet
      uLightCol: { value: new THREE.Color(0xffd2a1) },
      uNoise2D: { value: ctx.noise2D },
    };
    const mat = new THREE.MeshStandardMaterial({ color: '#cfc6b5', roughness: 0.84, metalness: 0, side: THREE.DoubleSide });
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
            diffuseColor.rgb *= mix(0.86, 1.0, smoothstep(0.0, 0.07, edge));   // pressed creases
            // the print only resolves as the page opens; folded, it would alias into stripes
            if (gl_FrontFacing) diffuseColor.rgb *= 1.0 - 0.72 * inkMask(vPage) * smoothstep(0.15, 0.85, uReveal);
            else diffuseColor.rgb *= vec3(0.97, 0.94, 0.88);
          }`,
        emissivemap_fragment: /* glsl */ `
          {
            // light from the lamp inside the fold glows through the thin paper
            vec3 nW = inverseTransformDirection(normal, viewMatrix);
            vec3 toL = uLightW - vWPos;
            float d2 = dot(toL, toL);
            float ndl = dot(nW, toL * inversesqrt(d2));
            float atten = 1.0 / (1.0 + d2 * 1.1);
            // light behind the sheet shines through the faces turned away from it
            totalEmissiveRadiance += uLightCol * diffuseColor.rgb * (0.04 + max(-ndl, 0.0) * 0.9) * atten * uGlow;
            // printed lines light up top to bottom as the page opens
            if (gl_FrontFacing) {
              float front = 1.05 - uReveal * 1.25;
              float lit = smoothstep(front - 0.02, front + 0.12, vPage.y);
              float scan = exp(-pow((vPage.y - front) * 22.0, 2.0)) * step(0.02, uReveal) * (1.0 - smoothstep(0.85, 1.0, uReveal));
              totalEmissiveRadiance += vec3(1.0, 0.78, 0.5) * inkMask(vPage) * (lit * 0.06 + scan * 0.5) * uReveal;
            }
          }`,
      },
    });
    this.sheet = new THREE.Mesh(geo, mat);
    this.sheet.castShadow = true;
    this.sheet.receiveShadow = true;
    this.sheet.frustumCulled = false;
    this.folio.add(this.sheet);
  }

  /** Dust hanging in the lamplight: the fire's ray-marched volume, re-densified as a soft halo. */
  #buildVolume(ctx) {
    const steps = ctx.quality.volumeSteps;
    const geo = new THREE.BoxGeometry(VOL_HALF.x * 2, VOL_HALF.y * 2, VOL_HALF.z * 2);
    this.volMat = new THREE.ShaderMaterial({
      uniforms: {
        uNoise: { value: ctx.noise3D },
        uTime: ctx.uniforms.uTime,
        uIntensity: { value: 1.0 },
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
          vec3 q = p / vec3(1.15, 1.5, 1.15);
          float fall = exp(-dot(q, q) * 2.4);
          float n = texture(uNoise, p * 0.3 + vec3(0.0, -uTime * 0.025, uTime * 0.012)).r;
          float n2 = texture(uNoise, p * 0.85 + vec3(uTime * 0.018, -uTime * 0.04, 0.0)).g;
          return fall * (0.18 + smoothstep(0.4, 0.9, n * 0.7 + n2 * 0.45));
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
          vec3 col = vec3(1.0, 0.8, 0.58) * acc * 0.16 * uIntensity;
          gl_FragColor = vec4(col, 0.0);
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

  /** Paper fibres lifted by the lamp's warmth (the fire's GPU embers, slowed and cooled). */
  #buildFibers(ctx) {
    const count = ctx.quality.fibers;
    const rand = mulberry32(77);
    const geo = new THREE.BufferGeometry();
    const rnd = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) rnd.set([rand(), rand(), rand(), rand()], i * 4);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
    this.fiberU = { uTime: ctx.uniforms.uTime, uScale: ctx.uniforms.uPointScale, uNoise: { value: ctx.noise3D }, uBoost: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.fiberU,
      vertexShader: /* glsl */ `
        attribute vec4 aRand;
        uniform float uTime;
        uniform float uScale;
        uniform sampler3D uNoise;
        varying float vAlpha;
        void main() {
          float life = mix(6.0, 11.0, aRand.y);
          float age = mod(uTime * (0.8 + 0.3 * aRand.z) + aRand.x * 53.0, life);
          float k = age / life;
          float ang = aRand.x * 6.2831853 * 5.0;
          float rad = 0.25 + sqrt(aRand.w) * 1.05;
          vec3 p = vec3(cos(ang) * rad, -1.0 + aRand.z * 0.8, sin(ang) * rad);
          p.y += age * (0.16 + aRand.z * 0.16);
          vec3 turb = texture(uNoise, vec3(p.x * 0.3 + aRand.x, p.y * 0.2 - uTime * 0.05, p.z * 0.3 + aRand.y)).rga - 0.5;
          p += turb * 0.9 * k;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = max(mix(0.014, 0.034, aRand.w * aRand.z) * uScale / -mv.z, 1.2);
          vAlpha = smoothstep(0.0, 0.15, k) * (1.0 - smoothstep(0.55, 1.0, k));
          vAlpha *= 0.6 + 0.4 * sin(uTime * 2.1 + aRand.x * 80.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uBoost;
        varying float vAlpha;
        void main() {
          float core = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
          core *= core;
          gl_FragColor = vec4(vec3(1.0, 0.84, 0.62) * 4.0 * uBoost * core * vAlpha, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.fibers = new THREE.Points(geo, mat);
    this.fibers.position.y = FOLIO_Y;
    this.fibers.frustumCulled = false;
    this.fibers.renderOrder = 12;
    this.group.add(this.fibers);
  }

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
    const zMid = zSum / ((COLS + 1) * (ROWS + 1));
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
          P[v * 3 + 2] = g[k + 2] - zMid;
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
    const fk = THREE.MathUtils.smoothstep(this.focusK ?? 0, 0, 1);

    // closed and breathing at rest, eases open on hover, lies open when focused
    const idleFold = 0.7 + 0.05 * Math.sin(time * 0.55) - 0.16 * hk;
    this.#shape(THREE.MathUtils.lerp(idleFold, 0.002, fk), THREE.MathUtils.lerp(1.5, 0.0, fk));

    // the hollow of the fold keeps turning toward the viewer with a slow sway (a sheet
    // seen edge-on is a sliver); once focused, the page squares up to the camera
    this.group.worldToLocal(this._v.copy(camera.position));
    const target = Math.atan2(this._v.x, this._v.z) + (1 - fk) * 0.5 * Math.sin(time * 0.21);
    if (this.yaw === null) this.yaw = target;
    let d = (target - this.yaw) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * (0.5 + 2.5 * fk));
    this.folio.rotation.y = this.yaw;
    this.folio.rotation.x = (1 - fk) * Math.sin(time * 0.37) * 0.06 - fk * 0.05;
    this.folio.position.y = FOLIO_Y + Math.sin(time * 0.7) * 0.06 * (1 - fk * 0.6);

    const breathe = 0.97 + 0.03 * (noise1(time * 0.9, 3) - 0.5) * 2;
    this.light.intensity = 40 * (1 + 0.2 * hk + 0.15 * fk) * breathe;
    this.paperU.uReveal.value = fk;
    this.paperU.uGlow.value = THREE.MathUtils.lerp(4.0 + 1.0 * hk, 2.2, fk) * breathe;
    this.folio.localToWorld(this.paperU.uLightW.value.set(0, -0.05, THREE.MathUtils.lerp(-0.35, -0.9, fk)));
    this.volMat.uniforms.uIntensity.value = (1.0 + 0.4 * hk - 0.3 * fk) * breathe;
    this.volume.worldToLocal(this.volMat.uniforms.uCamLocal.value.copy(camera.position));
    this.fiberU.uBoost.value = 1 + 0.6 * hk + 0.4 * fk;
  }
}
