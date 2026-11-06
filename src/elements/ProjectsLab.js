import * as THREE from 'three';
import { SCREEN_GLSL, PHOSPHOR_GLSL as PH } from './ProjectsScreen.js';
import { Portal } from './ProjectsPortal.js';
import { HOT, ramp, pulse, hash, screenLabel, screenPlane, phosphorText } from './ProjectsKit.js';

// The console's background: whatever else it is always working on. Far behind the active project,
// dim, a rotating laboratory of smaller software runs as screen-only systems (cameos); small processes
// drift through the middle depths; now and then a tiny aperture opens inside the screen itself. And,
// rarely, the frog (from the GitHub profile) visits: it hops about inside the machine, comes out
// through an aperture in the chassis where there is no room for one, sits on the deck to watch, and
// hops back in through the glass to pick what comes next. Everything here is quieter than the
// foreground: depth over density.

const CAMEOS = [
  {
    // WinCodex: a Windows 7 client snapshots a project, a remote backend runs the agent, changes come
    // back and are applied after conflict checks
    label: 'WINCODEX   snapshot  ›  remote  ›  apply',
    main: /* glsl */ `
      col += ${PH} * rectD(m, vec2(-0.55, 0.0), vec2(0.18, 0.14), 0.003) * 0.7;
      col += ${PH} * rectD(m, vec2(0.5, 0.0), vec2(0.28, 0.22), 0.003) * 0.7;
      col += ${PH} * (lineD(m.y, 0.04, 0.002) + lineD(m.y, -0.04, 0.002)) * step(-0.37, m.x) * step(m.x, 0.22) * 0.4;
      float a = fract(uT * 0.25);
      col += ${PH} * fillR(m, vec2(mix(-0.37, 0.22, a), 0.04), vec2(0.03, 0.012));
      col += ${HOT} * fillR(m, vec2(mix(0.22, -0.37, fract(uT * 0.25 + 0.5)), -0.04), vec2(0.03, 0.012));
      col += ${PH} * step(0.5, fract(uT * 0.5)) * segD(m, vec2(-0.62, -0.02), vec2(-0.58, -0.06), 0.004) * 0.8;`,
  },
  {
    // PianoMir: a known score aligned against a recording; the alignment path walks the cost matrix
    label: 'PIANOMIR   score  ↔  audio alignment',
    main: /* glsl */ `
      vec2 g = (m + vec2(0.4, 0.4)) / 0.8;
      if (g.x > 0.0 && g.x < 1.0 && g.y > 0.0 && g.y < 1.0) {
        vec2 c = floor(g * 14.0);
        float cost = abs(c.x - c.y + 1.5 * sin(c.x * 0.6)) / 14.0;
        col += ${PH} * (1.0 - cost) * (1.0 - cost) * 0.12;
        float k = floor(fract(uT * 0.08) * 14.0);
        float onPath = step(abs(c.y - floor(c.x - 1.5 * sin(c.x * 0.6) * 0.0)), 0.5) * step(c.x, k);
        col += ${HOT} * onPath * 0.5;
      }
      for (int i = 0; i < 10; i++) col += ${PH} * fillR(m, vec2(-0.4 + float(i) * 0.09, 0.52 + 0.04 * hash11(float(i))), vec2(0.035, 0.008)) * 0.5;`,
  },
  {
    // FunChessEngine: an original engine searching a position; branches expand, pruned ones fade
    label: 'FUNCHESSENGINE   search  ›  evaluate  ›  move',
    main: /* glsl */ `
      col += ${PH} * rectD(m, vec2(-0.6, 0.0), vec2(0.2), 0.003) * 0.5;
      for (int i = 0; i < 4; i++) col += ${PH} * lineD(m.x, -0.8 + float(i) * 0.1, 0.0015) * step(abs(m.y), 0.2) * 0.15;
      vec2 root = vec2(-0.25, 0.0);
      float grow = fract(uT * 0.12);
      for (int i = 0; i < 5; i++) {
        vec2 a = root + vec2(0.25, (float(i) - 2.0) * 0.16);
        float pr = step(0.55, hash11(float(i) * 3.3 + floor(uT * 0.12)));
        col += ${PH} * segD(m, root, a, 0.002) * smoothstep(0.0, 0.2, grow) * (0.7 - 0.5 * pr);
        for (int j = 0; j < 3; j++) {
          vec2 b = a + vec2(0.25, (float(j) - 1.0) * 0.05);
          col += (pr > 0.5 ? ${PH} * 0.15 : ${PH} * 0.5) * segD(m, a, b, 0.0015) * smoothstep(0.3, 0.6, grow);
        }
      }`,
  },
  {
    // Clarity: listens, transcribes, and suggests an answer, in an overlay
    label: 'CLARITY   listen  ›  transcribe  ›  answer',
    main: /* glsl */ `
      float w = 0.06 * sin(m.x * 40.0 + uT * 6.0) * sin(m.x * 7.0 - uT * 2.0);
      col += ${PH} * lineD(m.y - 0.3, w, 0.003) * step(abs(m.x), 0.6) * 0.6;
      for (int i = 0; i < 4; i++) {
        float on = step(float(i), mod(uT * 0.8, 6.0));
        col += ${PH} * fillR(m, vec2(-0.6 + 0.3 * hash11(float(i)), 0.05 - float(i) * 0.08), vec2(0.18 + 0.2 * hash11(float(i) + 3.0), 0.01)) * on * 0.4;
      }
      col += ${HOT} * rectD(m, vec2(0.35, -0.3), vec2(0.25, 0.1), 0.003) * step(4.0, mod(uT * 0.8, 6.0)) * 0.7;`,
  },
];

const FROG_SIT = ['  @..@  ', ' (----) ', '( >__< )', ' ^^  ^^ '];
const FROG_LEAP = ['  @..@  ', ' (----) ', '/( __ )\\', '  /  \\  '];
const FROG_PERIOD = 150;
const FROG_OFFSET = 52;
const FROG_LENGTH = 14;

export class Lab {
  constructor(host) {
    this.host = host;
    const { scr, screenFrame } = host;
    const g = (this.group = new THREE.Group());
    screenFrame.add(g);
    // the laboratory: cameos far back, one at a time, cross-fading
    this.cameos = CAMEOS.map((c, i) => {
      const plane = screenPlane(scr, 1.7, 1.2, { uShow: { value: 0 }, uT: { value: 0 } }, { main: c.main });
      plane.position.set(i % 2 ? 1.05 : -0.95, 0.12, -6.2);
      // (no caption: the deep layer is texture; each cameo is named when it runs in the foreground)
      const label = screenLabel(scr, c.label, 1.0);
      label.position.set(plane.position.x - 0.25, 0.72, -6.2);
      label.visible = false;
      g.add(plane, label);
      return { plane, label };
    });
    // background processes: small packets drifting along lanes in the middle depths
    const N = 22;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.packets = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: { ...scr, uScale: host.ctx.uniforms.uPointScale, uShow: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uScale; varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; gl_Position = projectionMatrix * mv; gl_PointSize = max(0.035 * uScale / -mv.z, 1.0); }`,
      fragmentShader: /* glsl */ `
        ${SCREEN_GLSL}
        uniform float uShow; varying vec3 vW;
        void main() {
          float fd; if (!scrSee(vW, fd)) discard; gl_FragDepth = fd;
          vec2 c = abs(gl_PointCoord - 0.5) * 2.0;
          float a = 1.0 - smoothstep(0.5, 1.0, max(c.x, c.y));
          float s = scrS(vW);
          gl_FragColor = vec4(${PH} * a * 0.45 * uShow * exp(-s * 0.15), 1.0);
        }`,
    }));
    this.packets.frustumCulled = false;
    g.add(this.packets);
    this.lanes = Array.from({ length: N }, (_, i) => ({
      y: (hash(i) - 0.5) * 1.6, z: -3.2 - hash(i + 9) * 2.6, speed: 0.15 + hash(i + 4) * 0.35, phase: hash(i + 7), dir: i % 2 ? 1 : -1,
    }));
    // a tiny aperture inside the screen, now and then, that one packet goes through
    this.micro = host.addScreenPortal(new Portal(scr, { rx: 0.09, ry: 0.09, shape: 'round', tier: 'micro', masked: true }), new THREE.Vector3(0.6, 0.3, -3.6), new THREE.Vector3(0, 0, 1));
    // the frog: drawn inside the screen, or out in the station; and its way out of the chassis
    this.frogIn = phosphorText(scr, FROG_SIT, { w: 0.6, masked: true });
    this.frogOut = phosphorText(scr, FROG_SIT, { w: 0.46, masked: false });
    this.frogOut.material.uniforms.uTex = this.frogIn.material.uniforms.uTex;
    g.add(this.frogIn);
    host.group.add(this.frogOut);
    this.frogRoom = host.addScreenPortal(new Portal(scr, { rx: 0.1, ry: 0.1, shape: 'round', tier: 'micro', masked: true }), new THREE.Vector3(-1.38, 0.32, -1.3), new THREE.Vector3(1, 0, 0));
    this.frogHatch = host.addHeadPortal(new Portal(scr, { rx: 0.09, ry: 0.09, shape: 'round', tier: 'micro' }), new THREE.Vector3(-1.795, 0.62, -0.05), new THREE.Vector3(-1, 0, 0));
    this.frogFocus = new THREE.Vector3();
    this._prevF = -1;
  }

  /** Whether the frog is out in the station now or will be within `horizon` seconds. */
  frogBusy(time, horizon = 0) {
    if (this._lockFrog) return true;
    const f = ((time - FROG_OFFSET) % FROG_PERIOD + FROG_PERIOD) % FROG_PERIOD;
    const a = 4.3, b = 11.4;
    for (const g of [f, f - FROG_PERIOD]) if (g + horizon >= a && g <= b) return true;
    return false;
  }

  update(time, dt, { lockFrog, pin, quiet }) {
    this._lockFrog = lockFrog;
    const h = this.host;
    // cameos: 20 s each with cross-fades; dim
    const slot = time / 20;
    this.cameos.forEach((c, i) => {
      const d = ((slot - i) % CAMEOS.length + CAMEOS.length) % CAMEOS.length;
      const k = ramp(d, 0, 0.15) * (1 - ramp(d, 0.85, 1.0));
      c.plane.material.uniforms.uShow.value = k * 0.32;
      c.plane.material.uniforms.uT.value = time;
      c.label.material.uniforms.uShow.value = k * 0.45;
    });
    // packets
    const pos = this.packets.geometry.attributes.position;
    this.lanes.forEach((l, i) => {
      const x = (((l.phase + time * l.speed * l.dir) % 1) + 1) % 1;
      pos.setXYZ(i, -1.8 + x * 3.6, l.y + Math.sin(time * 0.7 + i) * 0.03, l.z);
    });
    pos.needsUpdate = true;
    // a micro aperture inside the screen every 11 s, somewhere new each time
    const mi = Math.floor(time / 11), mt = time - mi * 11;
    if (mi !== this._mi) {
      this._mi = mi;
      this.micro.group.position.set((hash(mi) - 0.5) * 2.4, (hash(mi + 3) - 0.5) * 1.2, -2.6 - hash(mi + 5) * 2);
      h.emit('micro-portal', { tier: 0.4 });
    }
    this.micro.set(pulse(mt, 0.2, 0.6, 1.6, 2.0), time);
    // the frog
    const f = lockFrog ? pin ?? (time % FROG_LENGTH) : ((time - FROG_OFFSET) % FROG_PERIOD + FROG_PERIOD) % FROG_PERIOD;
    const visiting = f < FROG_LENGTH && quiet < 0.5;
    return visiting ? this.#frog(f, time) : this.#frogAway();
  }

  #frogAway() {
    this.frogIn.material.uniforms.uShow.value = 0;
    this.frogOut.visible = false;
    this.frogRoom.set(0, 0);
    this.frogHatch.set(0, 0);
    this._prevF = -1;
    return null;
  }

  #frog(f, time) {
    const h = this.host;
    // hops: parabolic arcs between perches; the leap frame while airborne
    const hop = (t0, a, b, height = 0.25, dur = 0.55) => {
      const u = THREE.MathUtils.clamp((f - t0) / dur, 0, 1);
      const p = new THREE.Vector3().lerpVectors(a, b, u);
      p.y += Math.sin(u * Math.PI) * height;
      return { p, air: u > 0 && u < 1 };
    };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    let inside = true, p, air = false, scale = 1;
    // inside the screen: forward through the depths, toward the little aperture
    const perches = [V(-0.2, -0.45, -4.2), V(0.6, -0.3, -3.3), V(-0.4, -0.15, -2.4), V(-1.2, 0.2, -1.4)];
    if (f < 4.6) {
      const i = Math.min(2, Math.floor(f / 1.5));
      ({ p, air } = hop(i * 1.5 + 0.6, perches[i], perches[i + 1]));
      if (f < 0.6) p = perches[0];
      if (f > 3.6) ({ p, air } = hop(3.6, perches[3], V(-1.38, 0.32, -1.3), 0.15, 0.6)), (scale = 1 - ramp(f, 4.0, 4.25));
    } else if (f < 10.0) {
      // out of the chassis, onto the deck, and it sits and watches
      inside = false;
      const hatch = h.portalFrame(this.frogHatch, new THREE.Matrix4());
      const out = new THREE.Vector3().setFromMatrixPosition(hatch).add(new THREE.Vector3().setFromMatrixColumn(hatch, 2).normalize().multiplyScalar(0.12));
      const deck = V(-0.85, 1.56 + 0.11, 0.62).applyMatrix4(h.machine.matrix);
      if (f < 5.0) (p = out), (scale = ramp(f, 4.6, 4.9));
      else ({ p, air } = hop(5.0, out, deck, 0.35, 0.7));
      if (f > 5.7) p = deck.clone().add(V(0, Math.abs(Math.sin(f * 2.2)) < 0.08 ? 0.01 : 0, 0));
    } else {
      // back in through the glass, and up to the label of whatever comes next
      const deck = V(-0.85, 1.56 + 0.11, 0.62).applyMatrix4(h.machine.matrix);
      const glass = V(-0.6, -0.55, 0.2).applyMatrix4(h.screenToStation);
      if (f < 11.2) (inside = false), ({ p, air } = hop(10.0, deck, glass, 0.45, 1.2));
      else {
        const a = V(-0.6, -0.55, -0.3), b = V(-1.3, 0.78, -0.55);
        ({ p, air } = hop(11.5, a, b, 0.3, 1.0));
        if (f < 11.5) p = a;
        scale = 1 - ramp(f, 13.2, 13.9);
      }
    }
    const tex = air ? FROG_LEAP : FROG_SIT;
    if (tex !== this._frame) {
      this.frogIn.userData.draw(tex);
      this._frame = tex;
    }
    // hops are heard; the aperture in the chassis opens for it
    if (air && !this._air) h.emit('frog-hop', { out: !inside });
    this._air = air;
    this.frogRoom.set(pulse(f, 3.4, 3.7, 4.2, 4.5), time);
    this.frogHatch.set(pulse(f, 4.3, 4.6, 5.0, 5.4), time);
    if (this._prevF < 4.45 && f >= 4.45) h.emit('micro-portal', { tier: 0.4 });
    this._prevF = f;
    this.frogIn.material.uniforms.uShow.value = inside ? scale : 0;
    this.frogOut.visible = !inside;
    this.frogOut.material.uniforms.uShow.value = inside ? 0 : scale;
    if (inside) {
      this.frogIn.position.copy(p);
      this.frogIn.scale.setScalar(Math.max(scale, 0.001));
      return null;
    }
    this.frogOut.position.copy(p);
    this.frogOut.scale.setScalar(Math.max(scale, 0.001));
    this.frogOut.lookAt(this.frogOut.getWorldPosition(new THREE.Vector3()).add(h.ctx.camera.getWorldDirection(new THREE.Vector3()).negate()));
    this.frogFocus.copy(p);
    return { focus: this.frogFocus };
  }
}
