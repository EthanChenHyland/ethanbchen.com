import * as THREE from 'three';
import { FIGURE_SCALE } from './ProfileBody.js';

// PROFILE, the station's name: four candidate treatments (?flabel=a|b|c|d), one life model.
//
//   a  header arc      a shallow arch of letters behind and above the shoulders
//   b  spine           a thin line of light beside the figure, letters suspended along it
//   c  fragments       letters suspended at different depths that only line up from the viewer
//   d  pedestal        letters standing round the front of the plate, facing out
//
// Every candidate shares `disorder` (letters drift from their places) and `glow`: idle keeps a
// little life, hover and focus resolve it, re-engagement scatters and rebuilds it.

const WORD = 'PROFILE';
const S = FIGURE_SCALE;
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function letterTexture(ch) {
  const c = document.createElement('canvas');
  c.width = 224;
  c.height = 192;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const draw = () => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.font = '600 132px Cinzel, "Trajan Pro", Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = 'rgba(190,170,255,0.9)';
    g.shadowBlur = 18;
    g.fillStyle = '#f4f0ff';
    g.fillText(ch, 112, 104);
    g.shadowBlur = 0;
    g.fillText(ch, 112, 104);
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.load('600 132px Cinzel').then(draw).catch(() => {});
  return tex;
}

export class Label {
  constructor(station, kind = 'b') {
    this.st = station;
    this.kind = kind;
    this.group = new THREE.Group();
    this.group.name = 'profile-label';
    const h = { a: 0.36, b: 0.36, c: 0.4, d: 0.3 }[kind] ?? 0.36;
    this.h = h;
    this.letters = [...WORD].map((ch, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(h * 1.17, h), new THREE.MeshBasicMaterial({ map: letterTexture(ch), transparent: true, depthWrite: false, opacity: 1 }));
      m.renderOrder = 9; // letters paint last: no passing line or arc can strike through a glyph
      this.group.add(m);
      return { m, i, seed: ((i * 7919) % 101) / 101, pos: new THREE.Vector3(), init: false };
    });
    if (kind === 'b') this.#buildSpine();
    this.yaw = null;
    this.side = 1;
    this.disorder = 1;
    this.burstAt = -99;
    this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.centre = new THREE.Vector3();
  }

  /**
   * The identity spine, built as an artifact: a slim machined rail behind a smoked violet glass
   * backbone (three segments that register), pale side rails, upper and lower caps, a hexagonal foot
   * standing on the stage with a trace running into it, a mount and registration ticks for every
   * letter, and a light core inside the rail. Depth-separated: rail at the back, glass, then the
   * letters, then the ticks; nothing opaque stands in front of a letter.
   */
  #buildSpine() {
    const sp = (this.spine = new THREE.Group());
    const lineMat = (this.spineMat = new THREE.MeshBasicMaterial({ color: 0xd9d0ff, transparent: true, opacity: 0.7, depthWrite: false }));
    const metal = (this.metalMat = new THREE.MeshPhysicalMaterial({ color: 0xd6d0ec, metalness: 0.85, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2, emissive: 0x3a2f78, emissiveIntensity: 0.45 }));
    const glass = (this.glassMat = new THREE.MeshPhysicalMaterial({ color: 0x5a46a8, roughness: 0.1, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, emissive: 0x2a1f66, emissiveIntensity: 0.6 }));
    const add = (geo, mat, x, y, z, ro = 4) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.renderOrder = ro; sp.add(m); return m; };
    // the rail (back plane) and its light core
    // the rail runs between the letters, never through them: each glyph sits in a gap, held by its
    // mount below; nominal glyph centres (spine-local y) and their half-heights
    const GY = [0, 1, 2, 3, 4, 5, 6].map((i) => (3 - i) * 0.43 - 0.1), GH = 0.15;
    this.GY = GY;
    // (the metal rail is gone: the light core is the only rail, and it goes dark under each glyph)
    this.core = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uBase: { value: 0.35 }, uPulse: { value: -1 }, uSweep: { value: -1 }, uModes: { value: new THREE.Vector4() }, uPhase: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec2 vUv; uniform float uTime, uBase, uPulse, uSweep, uPhase; uniform vec4 uModes;
        void main(){
          float y = vUv.y, x = abs(vUv.x - 0.5) * 2.0;
          // gaps at the glyphs: the light passes behind each letter, never across it
          float ly = (y - 0.5) * 3.7, gap = 1.0;
          for (int i = 0; i < 7; i++) gap *= smoothstep(0.12, 0.17, abs(ly - (float(3 - i) * 0.43 - 0.1)));
          float k = uBase * (0.85 + 0.15 * sin(y * 40.0 - uTime * 1.3));
          k += 1.4 * exp(-(((y - uPulse) / 0.03)*((y - uPulse) / 0.03)));                    // the travelling pulse
          k += 2.2 * exp(-(((y - uSweep) / 0.06)*((y - uSweep) / 0.06)));                    // the hover sweep, bottom to top
          // the mode, as a quality of light: calculation steps, rhythm, a standing wave, messages
          float seg = floor(y * 14.0), stepI = mod(floor(uTime * 2.6), 14.0);
          k += uModes.x * 1.2 * step(abs(seg - stepI), 0.5) * step(0.15, fract(y * 14.0)) ;
          k += uModes.y * 1.1 * pow(max(0.0, sin((y * 5.0 - uTime * 2.86) * 6.2832)), 10.0);
          k += uModes.z * 0.9 * abs(sin(y * 3.14159 * 5.0)) * (0.55 + 0.45 * cos(uTime * 5.0));
          for (int i = 0; i < 4; i++) k += uModes.w * 1.3 * exp(-(((y - fract(uTime * 0.22 + float(i) * 0.27)) / 0.012)*((y - fract(uTime * 0.22 + float(i) * 0.27)) / 0.012)));
          k *= 1.0 - 0.6 * uPhase * step(0.5, fract(y * 9.0 + uTime));
          float edge = 1.0 - smoothstep(0.4, 1.0, x);
          gl_FragColor = vec4(vec3(0.85, 0.8, 1.0) * k * edge * gap, 1.0);
        }`,
    });
    add(new THREE.PlaneGeometry(0.014, 3.7), this.core, 0, 0, -0.045, 5);
    // an inner, volume-like glow behind the glass (soft, wider than the rail, never over a glyph's
    // stroke because the letters draw last)
    this.haloMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uK: { value: 0.2 }, uTime: { value: 0 }, uSweep: { value: -1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec2 vUv; uniform float uK, uTime, uSweep;
        void main(){ float x = abs(vUv.x - 0.5) * 2.0; float y = vUv.y;
          float a = pow(max(0.0, 1.0 - x), 2.4) * smoothstep(0.0, 0.08, y) * smoothstep(1.0, 0.9, y);
          a *= 0.75 + 0.25 * sin(y * 9.0 - uTime * 0.8);
          a += 1.4 * exp(-(((y - uSweep) / 0.07)*((y - uSweep) / 0.07))) * pow(max(0.0, 1.0 - x), 1.5);
          gl_FragColor = vec4(vec3(0.55, 0.45, 1.0) * a * uK, 1.0); }`,
    });
    add(new THREE.PlaneGeometry(0.75, 3.5), this.haloMat, 0, -0.08, -0.035, 3);
    // the glass backbone: three registering segments, with their edges drawn
    // the glass body: at rest ONE continuous pane. It is built as three abutting slabs (so a phase can
    // part them into depth layers), each only a front and a back face: no top or bottom faces and
    // no drawn edges, which used to read as horizontal cuts through the letters
    this.segGlass = glass.clone();
    this.segGlass.opacity = 0;
    this.pane = new THREE.Group();
    for (const z of [0.008, -0.008]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 3.14), glass);
      m.position.z = z;
      m.renderOrder = 4;
      this.pane.add(m);
    }
    this.pane.position.set(0, -0.07, -0.02);
    sp.add(this.pane);
    this.segs = [[-1.64, -0.745], [-0.745, 0.545], [0.545, 1.5]].map(([y0, y1]) => {
      const g = new THREE.Group();
      const h = y1 - y0;
      for (const z of [0.008, -0.008]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, h), this.segGlass);
        m.position.z = z;
        m.renderOrder = 4;
        g.add(m);
      }
      g.position.set(0, (y0 + y1) / 2, -0.02);
      sp.add(g);
      return { g, y: (y0 + y1) / 2 };
    });
    // a darker smoked back plate behind the rail: a second layer of glass, real depth
    this.backMat = new THREE.MeshPhysicalMaterial({ color: 0x2a2150, roughness: 0.2, clearcoat: 1, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, emissive: 0x1a1240, emissiveIntensity: 0.4 });
    add(new THREE.PlaneGeometry(0.26, 3.2), this.backMat, 0, -0.07, -0.1, 3);
    // the glass's long edges: fine vertical highlights only (precision-fit, nothing horizontal)
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.004, 3.14, 0.004), lineMat, sx * 0.17, -0.07, -0.012, 5);
    // side rails
    this.rails = [-1, 1].map((sx) => add(new THREE.BoxGeometry(0.009, 3.2, 0.009), metal, sx * 0.235, -0.08, -0.045));
    // caps, with an inset light line; small wings that extend when the station is attended
    for (const [y, w, hh, d] of [[1.56, 0.32, 0.04, 0.08], [-1.7, 0.36, 0.05, 0.09]]) {
      add(new THREE.BoxGeometry(w, hh, d), metal, 0, y, -0.03);
      add(new THREE.BoxGeometry(w - 0.06, 0.008, 0.002), lineMat, 0, y, -0.03 + d / 2 + 0.002, 5);
    }
    this.wings = [];
    for (const y of [1.56, -1.7]) for (const sx of [-1, 1]) {
      const m = add(new THREE.BoxGeometry(0.1, 0.01, 0.01), lineMat, sx * 0.22, y, -0.03, 5);
      m.userData.sx = sx;
      this.wings.push(m);
    }
    // the finial: the rail runs on above the cap to a small machined bracket
    for (const [w, h, x, yy] of [[0.12, 0.006, 0, 1.95], [0.006, 0.05, -0.06, 1.925], [0.006, 0.05, 0.06, 1.925], [0.05, 0.006, 0, 1.75]]) add(new THREE.BoxGeometry(w, h, 0.018), lineMat, x, yy, -0.06, 5);
    // the foot: a hexagonal machined block standing on the stage, a ring round it, and a trace
    // running across the floor into the figure's stage
    add(new THREE.CylinderGeometry(0.075, 0.11, 0.12, 6), metal, 0, -1.89, -0.05);
    const ring = add(new THREE.RingGeometry(0.13, 0.145, 6), lineMat, 0, -1.945, -0.05, 5);
    ring.rotation.x = -Math.PI / 2;
    this.trace = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)), new THREE.LineBasicMaterial({ color: 0xcfc4ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.trace.frustumCulled = false;
    this.trace.renderOrder = 5;
    sp.add(this.trace);
    // the pulse bead
    this.pulseBead = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.pulseBead.renderOrder = 5;
    sp.add(this.pulseBead);
    this.pulseY = 0;
    this.sweepAt = -99;
    this.modes = new THREE.Vector4();
    this.group.add(sp);
  }

  /** Hover: a sweep of light climbs the rail and the parts come true. */
  sweep(time) {
    this.sweepAt = time;
  }

  /** An idle registration shift: the parts slip a little and settle back. */
  nudge(time) {
    this.burstAt = time;
    this.burstAmp = 0.12;
  }

  /** Re-engagement: scatter a little and rebuild. */
  rebuild(time, amp = 1) {
    this.burstAt = time;
    this.burstAmp = amp;
    this.sweepAt = time;
  }

  #updateSpine(time, dt, c, ord, fwd, right) {
    const sp = this.spine, wk = c.wake ?? 0, ph = c.ph ?? { lag: 0, slice: 0, info: 0 };
    sp.position.copy(this.centre).addScaledVector(right, this.sideK * 1.4).addScaledVector(fwd, -0.3);
    sp.position.y = 0.975 + 1.95;
    sp.rotation.set(0, this.yaw, 0.006 * Math.sin(time * 0.3) * (1 - ord) * (1 - wk));
    // registration: at rest the parts sit a hair out of true, drifting; attention aligns them; a
    // phase parts them into depth layers; a re-engagement knocks them out and they flow back
    const burst = (this.burstAmp ?? 0) * Math.max(0, 1 - (time - this.burstAt) / 1.2);
    const mis = 0.012 * (1 - ord) * (1 - wk) * (c.life ?? 1) + 0.05 * burst;
    this.segs.forEach((S0, i) => {
      const g = S0.g;
      // the glass stays one pane at rest (no jog at its joints); only a phase or a re-engagement
      // knock parts it, and it flows back
      const knock = 0.04 * burst;
      const gx = knock * Math.sin(i * 2.1 + 0.5) + 0.05 * ph.lag * (i - 1);
      const gz = -0.02 + knock * Math.cos(i * 1.3) + (i - 1) * 0.15 * ph.slice;
      g.position.x += (gx - g.position.x) * Math.min(1, dt * 4);
      g.position.z += (gz - g.position.z) * Math.min(1, dt * 4);
    });
    this.rails.forEach((r, i) => (r.position.z = -0.045 + (i ? 1 : -1) * 0.1 * ph.slice));
    // glass: smoky at rest, its depth visible when attended; the whole artifact rises with the
    // station's spectacle tier (rest → hover → focus → activity → rare)
    const tier = c.tier ?? 0.15;
    this.glassMat.opacity = 0.13 + 0.1 * wk + 0.05 * ord + 0.08 * tier;
    // one continuous pane at rest; a phase (or a knock) hands over to the three parting segments
    const partK = clamp(Math.max(ph.slice * 1.5, ph.lag, burst * 2), 0, 1);
    this.segGlass.opacity = this.glassMat.opacity * partK;
    this.segGlass.emissiveIntensity = this.glassMat.emissiveIntensity;
    this.pane.children.forEach((m) => (m.visible = partK < 0.99));
    this._paneK = 1 - partK;
    this.glassMat.opacity *= this._paneK; // the pane fades as the segments take over (never doubled)
    this.glassMat.emissiveIntensity = 0.22 + 0.4 * wk + 0.75 * tier; // calm smoked glass at rest, alive when attended
    this.metalMat.emissiveIntensity = 0.3 + 0.4 * wk + 0.2 * ord + 0.6 * tier;
    this.spineMat.opacity = Math.min(1, 0.42 + 0.22 * ord + 0.25 * wk + 0.35 * tier + 0.06 * Math.sin(time * 0.9) ** 2);
    this.haloMat.uniforms.uK.value = 0.12 + 0.5 * tier + 0.25 * wk;
    this.haloMat.uniforms.uTime.value = time;
    this.haloMat.uniforms.uSweep.value = (time - this.sweepAt) / 0.9;
    // focus: the caps' wings extend a little
    this.wings.forEach((w) => (w.position.x = w.userData.sx * (0.22 + 0.06 * ord)));
    // the floor trace: from the foot across the stage toward the figure
    const tp = this.trace.geometry.attributes.position.array;
    const toFig = new THREE.Vector3(-this.sideK * 1.4, 0, 0.3).multiplyScalar(0.62);
    tp.set([0, -1.945, -0.05, toFig.x, -1.945, toFig.z], 0);
    this.trace.geometry.attributes.position.needsUpdate = true;
    this.trace.material.opacity = 0.3 + 0.4 * wk + 0.15 * ord;
    // the light core: a pulse travels up (quicker when attended); hover sends a sweep; modes
    this.pulseY = (this.pulseY + dt * (0.18 + 0.5 * wk)) % 1;
    const U = this.core.uniforms;
    U.uTime.value = time;
    U.uBase.value = 0.3 + 0.3 * wk + 0.15 * ord + 0.45 * tier;
    U.uPulse.value = this.pulseY;
    U.uSweep.value = (time - this.sweepAt) / 0.9;
    const mode = this.st.acts?.mode;
    const goal = [mode === 'chess', mode === 'piano', mode === 'clarinet', mode === 'models' || mode === 'crown'].map(Number);
    this.modes.set(...this.modes.toArray().map((v, i) => v + (goal[i] - v) * Math.min(1, dt * 1.5)));
    U.uModes.value.copy(this.modes);
    U.uPhase.value = Math.max(ph.slice, ph.info);
    this.pulseBead.position.set(0, -1.9 + 3.8 * this.pulseY, -0.03);
    const by = -1.9 + 3.8 * this.pulseY;
    const bGap = Math.min(...this.GY.map((g) => THREE.MathUtils.smoothstep(Math.abs(by - g), 0.12, 0.18)));
    this.pulseBead.material.opacity = (0.3 + 0.6 * wk) * Math.sin(Math.PI * this.pulseY) * bGap;
  }

  update(time, dt, c) {
    const st = this.st;
    const s = st.rig.stance();
    const fx = s.x * S, fz = s.z * S;
    // the anchor keeps up with the person (quickly in a flight or a step), so the spine never ends up
    // overlapping a figure that has stepped across the stage
    if (!this._init) (this._init = true), this.centre.set(fx, this.centre.y, fz); // first frame: already in place
    const kC = c.flying || st.rig.step ? 6 : 1.6;
    this.centre.x += (fx - this.centre.x) * Math.min(1, dt * kC);
    this.centre.z += (fz - this.centre.z) * Math.min(1, dt * kC);
    // the live camera, not a flight's destination: the spine never swings across the body mid-flight
    const cam = st.group.worldToLocal(this._v[0].copy(c.camNow ?? c.refCam)).clone();
    const camAz = Math.atan2(cam.x - this.centre.x, cam.z - this.centre.z);
    // it keeps up with the live camera (fast in a flight) so it never swings across the body
    this.yaw = this.yaw === null ? camAz : this.yaw + clamp(wrap(camAz - this.yaw) * Math.min(1, dt * (c.flying ? 5 : 1.6)), -dt * (c.flying ? 4 : 0.5), dt * (c.flying ? 4 : 0.5));
    const ord = clamp(c.order, 0, 1);
    // disorder: a little life at rest, none when attended, a burst on re-engagement
    const burst = (this.burstAmp ?? 0) * Math.max(0, 1 - (time - this.burstAt) / 1.6);
    const rest = 0.06 * c.life * (1 - ord) * (1 - (c.wake ?? 0));
    const goal = Math.max(burst * 1.4, rest * (1 - 0.92 * ord));
    this.disorder += (goal - this.disorder) * Math.min(1, dt * (goal > this.disorder ? 6 : 1.4));
    const glow = 0.86 + 0.25 * ord + 0.2 * (c.wake ?? 0);
    const fwd = this._v[1].set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = this._v[2].set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); // viewer's right
    const n = this.letters.length;
    // the side for the monolith: away from a neighbour that would hide it (checked now and then)
    if (this.kind === 'b' && time - (this._sideAt ?? -9) > 0.7) {
      this._sideAt = time;
      const test = (sd) => {
        let vis = 0;
        for (const y of [1.8, 3.0, 4.2]) {
          const p = new THREE.Vector3().copy(this.centre).addScaledVector(right, sd * 1.4).setY(y);
          if (!st.blocked(c.refCam, st.group.localToWorld(p))) vis++;
        }
        return vis;
      };
      const a = test(this.side), b = test(-this.side);
      if (b > a + 1) this.side = -this.side;
    }
    this.sideK = (this.sideK ?? this.side) + (this.side - (this.sideK ?? this.side)) * Math.min(1, dt * 1.2);
    for (const L of this.letters) {
      const u = (L.i - (n - 1) / 2) / ((n - 1) / 2); // -1..1
      const t = this._v[0];
      let depth = 0;
      if (this.kind === 'a') {
        // a shallow arch behind the shoulders, wider than the head
        const a = u * 0.62;
        t.copy(this.centre).addScaledVector(right, Math.sin(a) * 2.25).addScaledVector(fwd, -0.9 - (1 - Math.cos(a)) * 1.2);
        t.y = 0.975 + 2.33 * S + 0.38 - 0.42 * u * u;
      } else if (this.kind === 'b') {
        // suspended along the spine, a little in front of it, each at its own small depth
        // closer to the person and lower; it phases with them: a lag makes the letters trail, layers
        // part them in depth, the information state thins them
        const ph = c.ph ?? { lag: 0, slice: 0, info: 0 };
        t.copy(this.centre).addScaledVector(right, this.sideK * (1.4 + 0.035 * L.i * ph.lag) + 0.02).addScaledVector(fwd, -0.3 + 0.07 + 0.05 * ((L.i % 3) - 1) + (L.i % 2 ? 0.16 : -0.16) * ph.slice);
        t.y = 0.975 + 1.85 + (n - 1 - L.i - (n - 1) / 2) * 0.43;
        L.lag = ph.lag;
        L.info = ph.info;
      } else if (this.kind === 'c') {
        // the word as a line to the viewer's side of the head; each letter sits at its own depth on
        // the line of sight so that only from here do they align
        const base = new THREE.Vector3().copy(this.centre).addScaledVector(right, 1.0 + u * 1.25).addScaledVector(fwd, -0.4);
        base.y = 0.975 + 2.05 * S;
        depth = (L.seed - 0.5) * 2.2 * (1 + 2.5 * this.disorder);
        const toCam = new THREE.Vector3().subVectors(cam, base);
        const dist = toCam.length();
        toCam.normalize();
        t.copy(base).addScaledVector(toCam, depth);
        L.scale = (dist - depth) / dist;
      } else {
        // round the front of the plate, standing on it
        const a = u * 0.78;
        t.copy(new THREE.Vector3(0, 0, 0)).addScaledVector(right, Math.sin(a) * 1.62).addScaledVector(fwd, Math.cos(a) * 1.62);
        t.y = 0.975 + this.h * 0.55;
      }
      // drift: letters leave their places a little, and come back
      const d = this.disorder;
      if (this.kind !== 'c') {
        t.x += Math.sin(time * (0.7 + L.seed) + L.seed * 20) * 0.22 * d;
        t.y += Math.cos(time * (0.5 + L.seed) + L.seed * 11) * 0.16 * d;
        t.z += Math.sin(time * (0.6 + L.seed * 0.8) + L.seed * 7) * 0.22 * d;
      }
      if (!L.init) L.pos.copy(t), (L.init = true);
      L.pos.lerp(t, Math.min(1, dt * (3 + 4 * L.seed) * (1 - 0.7 * (L.lag ?? 0) * (L.i / 6))));
      L.m.position.copy(L.pos);
      // letters face the camera that is actually looking (never the flight's destination), so they
      // never turn edge-on mid-flight
      L.m.lookAt(c.camNow ?? c.refCam);
      if (this.kind === 'd') L.m.rotation.set(0, Math.atan2(L.pos.x, L.pos.z), 0);
      L.m.scale.setScalar(L.scale ?? 1);
      L.m.material.opacity = glow * (0.86 + 0.14 * Math.sin(time * 1.7 + L.seed * 9)) * (1 - 0.35 * d) * (1 - 0.45 * (L.info ?? 0) * (0.5 + 0.5 * Math.sin(time * 13 + L.i)));
    }
    if (this.spine) this.#updateSpine(time, dt, c, ord, fwd, right);
  }
}
