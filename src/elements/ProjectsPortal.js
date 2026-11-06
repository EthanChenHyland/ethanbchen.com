import * as THREE from 'three';
import { SCREEN_GLSL, PHOSPHOR_GLSL } from './ProjectsScreen.js';

// Spatial portals for the Projects console. An aperture opens as a thin horizontal cut that unfolds
// into an ellipse with a hot vermilion rim; through it you look down a receding tunnel of the
// machine's own lattice. A portal is a frame whose +Z is its front: whatever goes into one portal's
// front comes out of its partner's front, carried by the frame-to-frame transform, so speed and
// direction survive the jump. Portals can also live inside the screen (drawn only through the glass),
// which is how the world and the computer's interior are joined.

const RIM = 'vec3(1.0, 0.34, 0.18)';
const CORE = 'vec3(1.0, 0.82, 0.66)';
const R_PI = new THREE.Matrix4().makeRotationY(Math.PI);

export class Portal {
  /**
   * @param {object} scr screen uniforms (used when `masked`)
   * @param {{ rx: number, ry: number, masked?: boolean, shape?: string, tier?: string }} opts
   * shape: 'ellipse' (the standard transfer), 'rect' (a cut in a surface: chassis, deck), 'slit'
   * (a thin torn line, for drops and catches), 'round' (a small aperture for tiny things).
   * tier: 'micro' | 'normal' | 'major': how bright the rim and its light spill are.
   */
  constructor(scr, { rx, ry, masked = false, shape = 'ellipse', tier = 'normal' }) {
    this.group = new THREE.Group();
    this.open = 0;
    this.rx = rx;
    this.ry = ry;
    this.masked = masked;
    this.shape = shape;
    this.tier = { micro: 0.4, normal: 1, major: 1.7 }[tier];
    this.uniforms = {
      uOpen: { value: 0 },
      uR: { value: new THREE.Vector2(rx, ry) },
      uPT: { value: 0 },
      uTier: { value: this.tier },
      uN: { value: shape === 'rect' ? 7.0 : 2.0 },
      uTear: { value: shape === 'slit' ? 1.0 : 0.0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, ...(masked ? scr : {}) },
      defines: masked ? { MASKED: 1 } : {},
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      vertexShader: /* glsl */ `
        varying vec3 vL;
        varying vec3 vW;
        varying vec3 vCam;
        void main() {
          vL = position;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          vCam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        ${masked ? SCREEN_GLSL : ''}
        uniform float uOpen;
        uniform vec2 uR;
        uniform float uPT;
        uniform float uTier;
        uniform float uN;
        uniform float uTear;
        varying vec3 vL;
        varying vec3 vW;
        varying vec3 vCam;
        float line(float f, float w) { float d = min(f, 1.0 - f); return 1.0 - smoothstep(0.0, w + fwidth(f), d); }
        void main() {
          #ifdef MASKED
            float fd;
            if (!scrSee(vW, fd)) discard;
            gl_FragDepth = fd;
          #endif
          // a cut that first opens as a thin slit, then unfolds
          float wx = uR.x * smoothstep(0.0, 0.35, uOpen);
          float wy = uR.y * mix(0.015, 1.0, smoothstep(0.28, 1.0, uOpen));
          if (wx < 1e-3) discard;
          vec2 q = vL.xy / vec2(wx, wy);
          // a torn slit wavers along its length
          q.y += uTear * 0.35 * sin(vL.x * 37.0 + uPT * 3.0) * sin(vL.x * 11.0 - uPT * 1.7);
          float r = pow(pow(abs(q.x), uN) + pow(abs(q.y), uN), 1.0 / uN);
          float px = fwidth(r);
          float rimW = 0.05 + 0.06 * (1.0 - smoothstep(0.5, 1.0, uOpen));
          float rim = exp(-pow((r - 1.0) / (rimW + px), 2.0));
          float halo = exp(-max(r - 1.0, 0.0) * 9.0) * step(1.0, r);
          bool front = vCam.z > 0.0;
          vec3 col = vec3(0.0);
          float a = 0.0;
          if (r < 1.0 && front) {
            // the view down a tunnel of the machine's lattice (an elliptic cylinder behind the cut)
            vec3 d = normalize(vec3(vL.xy, 0.0) - vCam);
            vec2 o = vL.xy / vec2(wx, wy), d2 = d.xy / vec2(wx, wy);
            float A = dot(d2, d2), B = 2.0 * dot(o, d2), C = dot(o, o) - 1.0;
            float t = (-B + sqrt(max(B * B - 4.0 * A * C, 0.0))) / (2.0 * A + 1e-5);
            float h = min(-d.z * t, 12.0);
            vec3 hit = vec3(vL.xy, 0.0) + d * t;
            float ang = atan(hit.y / wy, hit.x / wx) / 6.2831853 + 0.5;
            float rings = line(fract(h / 0.24 + uPT * 0.9), 0.05);
            float ribs = line(fract(ang * 14.0), 0.035);
            float fade = exp(-h * 1.3);
            col = vec3(0.025, 0.006, 0.004) + (rings * 0.8 + ribs * 0.35) * fade * mix(${RIM}, ${PHOSPHOR_GLSL}, 0.45) * 0.9;
            col += ${CORE} * exp(-h * 0.35) * smoothstep(0.55, 0.0, r) * 0.08;
            a = 1.0 - smoothstep(1.0 - 2.0 * px, 1.0, r);
          }
          col += (mix(${RIM}, ${CORE}, rim * rim) * rim * (front ? 2.6 : 1.2) + ${RIM} * halo * 0.6) * (0.6 + 0.4 * uTier);
          gl_FragColor = vec4(col * smoothstep(0.0, 0.12, uOpen), a);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2.8, ry * 2.8), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 25;
    this.group.add(this.mesh);
    this.group.visible = false;
  }

  /** Openness 0..1 and the tunnel's pull phase. */
  set(open, phase) {
    this.open = open;
    this.uniforms.uOpen.value = open;
    this.uniforms.uPT.value = phase;
    this.group.visible = open > 0.001;
  }

  /** The plane of this portal in world space, normal pointing out of its front. */
  plane(out) {
    const m = this.group.matrixWorld;
    const n = new THREE.Vector3().setFromMatrixColumn(m, 2).normalize();
    return out.setFromNormalAndCoplanarPoint(n, new THREE.Vector3().setFromMatrixPosition(m));
  }
}

/** World transform that carries anything entering `from` (through its front) out of `to`'s front. */
export function portalMap(from, to, out) {
  return out.copy(to.matrixWorld).multiply(R_PI).multiply(new THREE.Matrix4().copy(from.matrixWorld).invert());
}

/** A world pose at `p` facing along velocity `v` (local −Z forward), with an optional roll. */
export function poseFrom(p, v, out, up = new THREE.Vector3(0, 1, 0)) {
  const t = p.clone().add(v.lengthSq() > 1e-8 ? v : new THREE.Vector3(0, 0, -1));
  if (Math.abs(v.clone().normalize().dot(up)) > 0.98) up = new THREE.Vector3(1, 0, 0);
  out.lookAt(p, t, up);
  return out.setPosition(p);
}

/** Cubic Hermite position and velocity between (p0, v0) and (p1, v1) over duration T at u ∈ [0, 1]. */
export function hermite(p0, v0, p1, v1, T, u, outP, outV) {
  const u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  outP.set(0, 0, 0).addScaledVector(p0, h00).addScaledVector(v0, h10 * T).addScaledVector(p1, h01).addScaledVector(v1, h11 * T);
  if (outV) {
    const d00 = 6 * u2 - 6 * u, d10 = 3 * u2 - 4 * u + 1, d01 = -6 * u2 + 6 * u, d11 = 3 * u2 - 2 * u;
    outV.set(0, 0, 0).addScaledVector(p0, d00 / T).addScaledVector(v0, d10).addScaledVector(p1, d01 / T).addScaledVector(v1, d11);
  }
  return outP;
}
