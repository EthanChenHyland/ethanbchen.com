import * as THREE from 'three';

/**
 * The Projects console's voice (first pass, not yet mixed by ear). Everything heard has a visible
 * cause: continuous layers follow what the console is visibly doing (its motors, its fan while busy,
 * a crossing at the glass, portals held open), and events follow the moments the works report
 * (a portal opening, a token seated, a bug escaping). The machine has its own small vocabulary of
 * tones; none of them imitates a desktop notification.
 *
 * Tuning: every sound goes through one of the groups in MIX; each group is a gain into the station's
 * bus. Adjust there first, then per-sound gains below.
 */
export const MIX = {
  // hierarchy: the machine bed stays quiet; the computer's beeps and project actions are clearly
  // audible; a normal portal is prominent; a major portal or rare event is the strongest
  bed: 0.3, // fan and the low machine body, only while it works
  beeps: 1.0, // the machine's tones: chirps, acknowledgements, lamps, processing
  mechanics: 0.95, // motors, relays, turntable detents, cable, landings
  crossing: 0.8, // the glass boundary while something crosses it
  portal: 5.0, // openings, transits, closings (works' portals)
  project: 1.05, // each project's own small signature
  rare: 2.4, // the big moments: a seal, a rewind, a bug getting loose
  holo: 0.6, // the PROJECTS sign (restrained) and the title beats
  ambient: 0.8, // the ambient apertures and what passes through them
};

// level of the interaction cues against the machine's own sounds
const CUE = { 'hover-ack': 9, 'hover-release': 2, 'hover-tick': 4.5, activate: 5.5, settle: 2.4, reengage: 2.2, release: 3, 'amb-transit': 2.5 };
// the quiet mechanical presence while hovered (Resume keeps its paper softly moving while hovered)
const HOVER_BED = 0.45;

// the machine's scale: tones are chosen from these ratios over a base
const BASE = 392;
const SCALE = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2, 3];

export class ProjectsSound {
  constructor(ctx, out, { white, pink, brown }) {
    this.ctx = ctx;
    this.white = white;
    this.g = {};
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(out);
    for (const [k, v] of Object.entries(MIX)) {
      const g = ctx.createGain();
      g.gain.value = v;
      g.connect(this.out);
      this.g[k] = g;
    }
    // fan: pink noise, low-passed, up while the machine is busy
    this.fan = this.#loop(pink, this.#filter('lowpass', 850, 0.7), this.g.bed);
    // motors: a filtered saw whose level and pitch follow how fast the console and its head turn
    this.servo = ctx.createOscillator();
    this.servo.type = 'sawtooth';
    this.servo.frequency.value = 70;
    this.servoGain = ctx.createGain();
    this.servoGain.gain.value = 0;
    this.servo.connect(this.#filter('bandpass', 320, 2.2)).connect(this.servoGain).connect(this.g.mechanics);
    this.servo.start();
    // the glass while something crosses it: grainy band noise and two faint glass partials
    this.crossBand = this.#filter('bandpass', 1800, 1.4);
    this.crossNoise = this.#loop(white, this.crossBand, this.g.crossing);
    this.glass = [1180, 1771].map((f) => {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(g).connect(this.g.crossing);
      o.start();
      return g;
    });
    // an aperture held open hums, lower for larger ones
    this.humBand = this.#filter('bandpass', 160, 6);
    this.hum = this.#loop(brown, this.humBand, this.g.portal);
    // hovered: a soft servo-and-relay bed, held while someone looks at the machine
    this.hoverBand = this.#filter('bandpass', 1300, 3);
    this.hoverBed = this.#loop(pink, this.hoverBand, this.g.mechanics);
    this._crossPhase = 0;
  }

  #filter(type, freq, Q = 1) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = Q;
    return f;
  }

  #loop(buffer, filter, dest) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(filter).connect(g).connect(dest);
    src.start(0, Math.random() * 2);
    return g;
  }

  /** A short tone: freq (Hz), optional glide to `to`, envelope attack/decay, into a group. */
  #tone(at, freq, { to = freq, dur = 0.12, gain = 0.2, attack = 0.004, type = 'sine', group = 'beeps' } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (to !== freq) o.frequency.exponentialRampToValueAtTime(to, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain * (this._cue ?? 1), at + attack);
    g.gain.exponentialRampToValueAtTime(0.0005, at + dur);
    o.connect(g).connect(this.g[group]);
    this.#track(o, g);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  /** Every one-shot source is counted until it ends, so a build-up of nodes shows in audits. */
  #track(src, ...chain) {
    this.live = (this.live ?? 0) + 1;
    this.peakLive = Math.max(this.peakLive ?? 0, this.live);
    this.made = (this.made ?? 0) + 1;
    src.onended = () => {
      this.live--;
      src.disconnect();
      for (const n of chain) n.disconnect();
    };
  }

  /** A filtered noise burst, optionally sweeping its band to `to`. */
  #noise(at, freq, { to = freq, Q = 1.2, type = 'bandpass', dur = 0.08, gain = 0.3, attack = 0.002, group = 'mechanics' } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const f = this.#filter(type, freq, Q);
    if (to !== freq) f.frequency.exponentialRampToValueAtTime(to, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain * (this._cue ?? 1), at + attack);
    g.gain.exponentialRampToValueAtTime(0.0005, at + dur);
    src.connect(f).connect(g).connect(this.g[group]);
    this.#track(src, f, g);
    src.start(at, Math.random() * 2, dur + 0.1);
  }

  #note(i) {
    return BASE * SCALE[((i % SCALE.length) + SCALE.length) % SCALE.length];
  }

  /** Continuous layers from the console's visible state; then the events it reported this frame. */
  update(el) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const act = el.activity ?? 0;
    this.fan.gain.setTargetAtTime(0.02 + 0.13 * act, now, 0.4);
    // the turntable's steady turn is silent (a constant motor would be a drone); what is heard is
    // the motors working: speeding up, slowing, the head moving
    const dev = Math.abs((el.yaw?.vel ?? 0) - (el.spinVel ?? 0));
    const speed = dev * 1.6 + Math.abs(el.headYaw?.vel ?? 0) * 0.6 + Math.abs(el.headPitch?.vel ?? 0) * 0.4;
    this.servoGain.gain.setTargetAtTime(THREE.MathUtils.clamp(speed * 1.6, 0, 0.18), now, 0.08);
    this.servo.frequency.setTargetAtTime(62 + speed * 260, now, 0.1);
    const cross = el.crossingK ?? 0;
    this._crossPhase += 0.016;
    this.crossNoise.gain.setTargetAtTime(cross * 0.09, now, 0.15);
    this.crossBand.frequency.setTargetAtTime(1400 + 900 * Math.sin(this._crossPhase * 0.7), now, 0.2);
    this.glass.forEach((g, i) => g.gain.setTargetAtTime(cross * (i ? 0.006 : 0.01), now, 0.2));
    // only the works' own apertures hum: the ambient ones are almost always open somewhere
    const open = (el.openPortals ?? []).filter((p) => !p.masked && !p.ambient);
    const hold = open.reduce((s, p) => s + p.open * p.tier, 0);
    this.hum.gain.setTargetAtTime(Math.min(0.5, hold * 0.22), now, 0.12);
    const big = open[0];
    if (big) this.humBand.frequency.setTargetAtTime(210 / Math.max(0.4, big.tier) - 40 * big.rx, now, 0.2);
    // portal openings and closings, seen by the console
    for (const p of el.portals ?? []) {
      const was = p._wasOpen ?? 0;
      if (was < 0.05 && p.open >= 0.05) (p.ambient ? this.#ambientOpen(now, p) : this.#portalOpen(now, p.tier, p.rx));
      if (was > 0.3 && p.open <= 0.3 && p._peak > 0.6) (p.ambient ? this.#ambientClose(now, p) : this.#portalClose(now, p.tier));
      p._peak = p.open < 0.05 ? 0 : Math.max(p._peak ?? 0, p.open);
      p._wasOpen = p.open;
    }
    // a fresh focus calms the console's project and portal voices (as Resume's paper layer calms);
    // its own beeps and mechanics stay clear, so the interaction cues still read
    const calm = el.calm ?? 0;
    const hk = el.hoverK ?? 0;
    this.hoverBed.gain.setTargetAtTime(HOVER_BED * hk * hk, now, 0.12);
    this.hoverBand.frequency.setTargetAtTime(1100 + 400 * Math.sin(now * 2.3), now, 0.2);
    for (const k of ['portal', 'project', 'ambient', 'crossing', 'bed']) this.g[k].gain.setTargetAtTime(MIX[k] * (1 - 0.5 * calm), now, 0.6);
    const events = el.events ?? [];
    for (const e of events) this.#event(now + 0.02, e);
    events.length = 0;
  }

  #portalOpen(at, tier, size) {
    // pressure, the electrical lock, the aperture's ring, and a shimmer as the material phases;
    // larger apertures are lower and longer; no two quite alike
    const j = 0.92 + Math.random() * 0.16;
    const f0 = (330 / Math.max(tier, 0.4) - 80 * size) * j;
    const big = tier > 1.2;
    this.#noise(at, 140 * j, { to: 760, type: 'lowpass', Q: 0.8, dur: 0.38 + 0.2 * tier, attack: 0.2, gain: 0.32 * tier, group: 'portal' });
    if (big) {
      // a major aperture is a cinematic event: a long low swell under the opening
      this.#tone(at, 46, { to: 70, dur: 1.4, attack: 0.3, gain: 0.32, group: 'portal' });
      this.#noise(at, 120, { to: 900, type: 'lowpass', Q: 0.8, dur: 1.6, attack: 0.5, gain: 0.3, group: 'portal' });
      this.#tone(at + 0.25, 92, { to: 138, dur: 1.3, attack: 0.4, gain: 0.08, type: 'triangle', group: 'portal' });
    }
    this.#noise(at + 0.21, 3400 * j, { Q: 5, dur: 0.025, gain: 0.5 * tier, group: 'portal' });
    this.#noise(at + 0.235, 5200 * j, { Q: 8, dur: 0.015, gain: 0.25 * tier, group: 'portal' });
    this.#tone(at + 0.22, f0, { dur: 0.8 + 0.5 * tier, gain: 0.09 * tier, group: 'portal' });
    this.#tone(at + 0.22, f0 * 1.5, { dur: 0.6, gain: 0.045 * tier, group: 'portal' });
    this.#tone(at + 0.25, f0 * 2.01, { to: f0 * 2.4, dur: 0.5, gain: 0.025 * tier, type: 'triangle', group: 'portal' });
    for (let i = 0; i < 4; i++) this.#tone(at + 0.3 + i * 0.07, f0 * (3 + i * 0.5) * j, { dur: 0.12, gain: 0.012 * tier, group: 'portal' });
  }

  #portalClose(at, tier) {
    // collapse, the snap shut, and a short ringing remnant
    this.#noise(at, 1000, { to: 140, Q: 1.4, dur: 0.4, gain: 0.3 * tier, group: 'portal' });
    this.#noise(at + 0.32, 2600, { Q: 5, dur: 0.025, gain: 0.35 * tier, group: 'portal' });
    this.#tone(at + 0.34, 520 / Math.max(tier, 0.5), { to: 380 / Math.max(tier, 0.5), dur: 0.9, gain: 0.025 * tier, group: 'portal' });
  }

  /** The alignment that carries the activation through the flight (one at a time, never stacked). */
  #alignStart(at, dur) {
    this.#alignEnd(at, 0.05);
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(this.#note(0) / 2, at);
    o.frequency.exponentialRampToValueAtTime(this.#note(4) / 2, at + dur);
    const n = ctx.createBufferSource();
    n.buffer = this.white;
    n.loop = true;
    const f = this.#filter('bandpass', 300, 2.2);
    f.frequency.setValueAtTime(300, at);
    f.frequency.exponentialRampToValueAtTime(1100, at + dur);
    const g = ctx.createGain(), gn = ctx.createGain();
    const k = CUE.activate;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.035 * k, at + 0.3);
    gn.gain.setValueAtTime(0, at);
    gn.gain.linearRampToValueAtTime(0.05 * k, at + 0.3);
    o.connect(g).connect(this.g.mechanics);
    n.connect(f).connect(gn).connect(this.g.mechanics);
    this.#track(o, g);
    this.#track(n, f, gn);
    o.start(at);
    n.start(at, Math.random() * 2);
    // if the flight never arrives, it lets go by itself
    const end = at + dur + 2.5;
    g.gain.setTargetAtTime(0, end - 0.6, 0.2);
    gn.gain.setTargetAtTime(0, end - 0.6, 0.2);
    o.stop(end);
    n.stop(end);
    this.align = { o, n, g, gn };
  }

  #alignEnd(at, release) {
    const A = this.align;
    if (!A) return;
    this.align = null;
    for (const g of [A.g, A.gn]) {
      g.gain.cancelScheduledValues(at);
      g.gain.setTargetAtTime(0, at, release / 3);
    }
    try {
      A.o.stop(at + release + 0.1);
      A.n.stop(at + release + 0.1);
    } catch {
      // already stopped
    }
  }

  /** The ambient apertures: small, and each shape has its own sound. */
  #ambientOpen(at, p) {
    const g = 'ambient';
    const j = 0.9 + Math.random() * 0.2;
    if (p.holo) {
      // the sign's own tiny apertures: a spatial tick
      this.#tone(at, 3200 * j, { to: 3900 * j, dur: 0.05, gain: 0.012, group: 'holo' });
      return;
    }
    switch (p.shape) {
      case 'rect': // a cut in a panel: a latch, a thin crack, a short low ring
        this.#noise(at, 2400 * j, { Q: 5, dur: 0.02, gain: 0.28, group: g });
        this.#noise(at + 0.03, 6000 * j, { Q: 9, dur: 0.01, gain: 0.12, group: g });
        this.#tone(at + 0.02, (180 - 200 * p.rx) * j, { dur: 0.4, gain: 0.05, group: g });
        break;
      case 'slit': // torn: a short sweep of noise along it, and a crackle
        this.#noise(at, 700 * j, { to: 2800, Q: 2.5, dur: 0.24, attack: 0.08, gain: 0.13, group: g });
        for (let i = 0; i < 3; i++) this.#noise(at + 0.05 + i * 0.05, 4500 + i * 400, { Q: 10, dur: 0.008, gain: 0.07, group: g });
        break;
      case 'round': // a tiny aperture: a chirp
        this.#tone(at, 2600 * j, { to: 3300 * j, dur: 0.07, gain: 0.03, group: g });
        this.#tone(at + 0.05, 3900 * j, { dur: 0.04, gain: 0.012, group: g });
        break;
      default:
        this.#noise(at, 200 * j, { to: 650, type: 'lowpass', Q: 0.7, dur: 0.28, attack: 0.15, gain: 0.13, group: g });
        this.#noise(at + 0.16, 3000 * j, { Q: 6, dur: 0.015, gain: 0.12, group: g });
        this.#tone(at + 0.17, (300 - 120 * p.rx) * j, { dur: 0.55, gain: 0.04, group: g });
    }
  }

  #ambientClose(at, p) {
    if (p.shape === 'round' || p.holo) return;
    this.#noise(at, 1200, { to: 300, Q: 1.4, dur: 0.2, gain: 0.08, group: 'ambient' });
    this.#tone(at + 0.15, 900 + 300 * Math.random(), { to: 700, dur: 0.3, gain: 0.008, group: 'ambient' });
  }

  #event(at, e) {
    // the interaction cues sit forward of the machine's own chatter (tune here)
    this._cue = CUE[e.type] ?? 1;
    try {
      this.#eventInner(at, e);
    } finally {
      this._cue = 1;
    }
  }

  #eventInner(at, e) {
    switch (e.type) {
      case 'transit':
        // the Doppler of something passing through, its phase shift, and its arrival on the far side
        this.#noise(at, 380, { to: 2600, Q: 1.8, dur: 0.2, attack: 0.13, gain: 0.4, group: 'portal' });
        this.#noise(at + 0.18, 2600, { to: 260, Q: 1.8, dur: 0.34, gain: 0.3, group: 'portal' });
        this.#tone(at + 0.16, 880, { to: 440, dur: 0.28, gain: 0.04, type: 'triangle', group: 'portal' });
        this.#tone(at + 0.42, 98, { to: 70, dur: 0.22, gain: 0.18, group: 'portal' });
        break;
      case 'portal-seal':
        this.#noise(at, 2600, { Q: 6, dur: 0.04, gain: 0.5, group: 'rare' });
        this.#tone(at, 55, { to: 42, dur: 0.6, gain: 0.35, group: 'rare' });
        this.#tone(at + 0.02, 988, { dur: 0.9, gain: 0.05, group: 'rare' });
        break;
      case 'micro-portal':
        this.#tone(at, 2200, { to: 2600, dur: 0.18, gain: 0.025, group: 'portal' });
        break;
      case 'cable':
        this.#tone(at, 58, { to: 44, dur: 0.28, gain: 0.18 * (e.k ?? 1), group: 'mechanics' });
        this.#noise(at, 300, { to: 120, type: 'lowpass', Q: 0.7, dur: 0.4, attack: 0.05, gain: 0.08, group: 'mechanics' });
        break;
      case 'lamp':
        this.#tone(at, this.#note(e.i ?? 0) * 4, { dur: 0.05, gain: 0.02, group: 'beeps' });
        break;
      case 'land':
        this.#tone(at, 95, { to: 60, dur: 0.18, gain: 0.25 * (e.k ?? 1), group: 'mechanics' });
        this.#noise(at, 1800, { Q: 1.5, dur: 0.04, gain: 0.15, group: 'mechanics' });
        break;
      case 'acknowledge':
        this.#tone(at, this.#note(2) * 2, { dur: 0.07, gain: 0.07 });
        this.#tone(at + 0.08, this.#note(4) * 2, { dur: 0.1, gain: 0.06 });
        break;
      case 'focus':
        [0, 2, 4].forEach((n, i) => this.#tone(at + i * 0.06, this.#note(n) * 2, { dur: 0.09, gain: 0.05 }));
        break;
      // TowerLogic: acquisition ticks
      case 'tower-lock':
        for (let i = 0; i < 3; i++) this.#noise(at + i * 0.05, 2600 + i * 300, { Q: 6, dur: 0.012, gain: 0.25, group: 'project' });
        this.#tone(at + 0.16, this.#note(5) * 2, { dur: 0.08, gain: 0.05, group: 'project' });
        break;
      // Mosaic: tiles snapping into place
      case 'snap':
        this.#noise(at, 1300 + Math.random() * 500, { Q: 3, dur: 0.02, gain: 0.18, group: 'project' });
        break;
      case 'shuffle':
        for (let i = 0; i < 7; i++) this.#noise(at + i * 0.12, 1000 + i * 120, { Q: 3, dur: 0.02, gain: 0.12, group: 'project' });
        break;
      // Prompt-Off: placing, confirming, rejecting
      case 'po-place':
        this.#noise(at, 2100, { Q: 4, dur: 0.02, gain: 0.2, group: 'project' });
        this.#tone(at + 0.01, this.#note(e.row ?? 0) * 2, { dur: 0.06, gain: 0.04, group: 'project' });
        break;
      case 'po-confirm':
        this.#tone(at, this.#note(3) * 2, { dur: 0.06, gain: 0.05, group: 'project' });
        this.#tone(at + 0.06, this.#note(5) * 2, { dur: 0.09, gain: 0.05, group: 'project' });
        break;
      case 'po-reject':
        this.#tone(at, 440, { to: 330, dur: 0.22, gain: 0.06, type: 'triangle', group: 'project' });
        this.#tone(at, 466, { to: 349, dur: 0.22, gain: 0.05, type: 'triangle', group: 'project' });
        break;
      case 'po-stream':
        this.#noise(at, 900, { to: 300, Q: 0.9, dur: 5.2, attack: 0.6, gain: 0.07, group: 'project' });
        break;
      case 'po-score':
        for (let i = 0; i < 6; i++) this.#tone(at + i * 0.09, this.#note(i) * 2, { dur: 0.08, gain: 0.04, group: 'project' });
        break;
      // Visual Java: the stack and the trace
      case 'vj-push':
        this.#tone(at, 520, { to: 700, dur: 0.08, gain: 0.05, group: 'project' });
        break;
      case 'vj-pop':
        this.#tone(at, 700, { to: 520, dur: 0.08, gain: 0.04, group: 'project' });
        break;
      case 'vj-mutate':
        this.#noise(at, 2800, { Q: 5, dur: 0.015, gain: 0.18, group: 'project' });
        this.#noise(at + 0.06, 2800, { Q: 5, dur: 0.015, gain: 0.14, group: 'project' });
        break;
      case 'vj-rewind':
        this.#noise(at, 3000, { to: 200, Q: 1.5, dur: 1.8, attack: 0.1, gain: 0.12, group: 'rare' });
        this.#tone(at, 900, { to: 180, dur: 1.8, gain: 0.05, type: 'triangle', group: 'rare' });
        break;
      // BugMuseum: controlled failure
      case 'bug-error': {
        const o = this.ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = 110;
        const am = this.ctx.createOscillator();
        am.frequency.value = 31;
        const amG = this.ctx.createGain();
        amG.gain.value = 0.5;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.05, at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0005, at + 0.45);
        am.connect(amG).connect(g.gain);
        o.connect(this.#filter('lowpass', 1400, 0.8)).connect(g).connect(this.g.rare);
        o.start(at);
        am.start(at);
        o.stop(at + 0.5);
        am.stop(at + 0.5);
        break;
      }
      case 'bug-glitch':
        this.#tone(at, 2200 + Math.random() * 800, { dur: 0.03, gain: 0.03, type: 'square', group: 'project' });
        break;
      case 'bug-step':
        this.#noise(at, 1500 - (e.k ?? 0) * 60, { Q: 3, dur: 0.025, gain: 0.14, group: 'project' });
        break;
      case 'bug-caught':
        this.#noise(at, 1800, { to: 180, Q: 1.2, dur: 0.5, gain: 0.2, group: 'rare' });
        this.#tone(at + 0.45, this.#note(4) * 2, { dur: 0.1, gain: 0.05, group: 'beeps' });
        break;
      // the frog
      case 'frog-hop':
        this.#tone(at, 1500, { to: 2300, dur: 0.06, gain: 0.025, group: 'beeps' });
        break;
      // the PROJECTS hologram
      case 'holo-assemble':
        // glass partials gathering, one after another
        for (let i = 0; i < 7; i++) this.#tone(at + i * 0.22 + Math.random() * 0.05, this.#note(i + 2) * 4, { dur: 0.9, attack: 0.25, gain: 0.012, group: 'holo' });
        this.#noise(at, 4000, { to: 2200, Q: 3, dur: 2.2, attack: 1.2, gain: 0.02, group: 'holo' });
        break;
      case 'holo-cross':
        this.#noise(at, 500, { to: 2600, Q: 2, dur: 1.8, attack: 0.9, gain: 0.05, group: 'holo' });
        this.#tone(at + 0.4, 1180, { dur: 1.6, attack: 0.5, gain: 0.012, group: 'holo' });
        this.#tone(at + 0.6, 1771, { dur: 1.4, attack: 0.5, gain: 0.008, group: 'holo' });
        break;
      case 'holo-expand':
        this.#tone(at, 98, { to: 147, dur: 2.0, attack: 0.6, gain: 0.08, group: 'holo' });
        this.#tone(at + 0.1, 196, { to: 294, dur: 1.8, attack: 0.6, gain: 0.025, group: 'holo' });
        this.#noise(at, 150, { to: 500, type: 'lowpass', Q: 0.7, dur: 1.8, attack: 0.8, gain: 0.06, group: 'holo' });
        break;
      case 'holo-break':
        for (let i = 0; i < 10; i++) this.#tone(at + i * 0.13 + Math.random() * 0.06, this.#note(Math.floor(Math.random() * 9)) * 4, { dur: 0.25, gain: 0.012, group: 'holo' });
        this.#noise(at, 3000, { to: 900, Q: 1.5, dur: 1.4, attack: 0.05, gain: 0.04, group: 'holo' });
        break;
      case 'holo-pull':
        this.#noise(at, 2600, { to: 180, Q: 1.6, dur: 2.2, attack: 0.3, gain: 0.08, group: 'holo' });
        this.#tone(at + 0.3, 600, { to: 120, dur: 1.9, attack: 0.3, gain: 0.03, type: 'triangle', group: 'holo' });
        break;
      // title beats
      case 'title-in':
        this.#tone(at, this.#note(0) * 2, { dur: 0.5, attack: 0.08, gain: e.small ? 0.012 : 0.025, group: 'holo' });
        if (!e.small) this.#tone(at + 0.12, this.#note(4) * 2, { dur: 0.6, attack: 0.08, gain: 0.02, group: 'holo' });
        break;
      case 'title-out':
        switch (e.mode) {
          case 'grid':
            for (let i = 0; i < 3; i++) this.#noise(at + 0.2 + i * 0.12, 2400 + i * 200, { Q: 6, dur: 0.012, gain: 0.12, group: 'holo' });
            break;
          case 'tiles':
            for (let i = 0; i < 6; i++) this.#noise(at + 0.15 + i * 0.09 + Math.random() * 0.04, 1300 + Math.random() * 500, { Q: 3, dur: 0.02, gain: 0.08, group: 'holo' });
            break;
          case 'extrude':
            this.#tone(at, 300, { to: 620, dur: 0.9, attack: 0.3, gain: 0.02, group: 'holo' });
            break;
          case 'glitch':
            for (let i = 0; i < 5; i++) this.#tone(at + i * 0.11, 1800 + Math.random() * 1200, { dur: 0.03, gain: 0.015, type: 'square', group: 'holo' });
            break;
          case 'slices':
            this.#noise(at + 0.1, 600, { to: 2000, Q: 1.5, dur: 0.3, gain: 0.04, group: 'holo' });
            this.#noise(at + 0.45, 2000, { to: 500, Q: 1.5, dur: 0.35, gain: 0.04, group: 'holo' });
            break;
          default:
            this.#tone(at, this.#note(4) * 2, { to: this.#note(2) * 2, dur: 0.6, gain: 0.008, group: 'holo' });
        }
        break;
      // WinCodex
      case 'wc-rise':
        this.#tone(at, 70, { to: 110, dur: 0.9, attack: 0.2, gain: 0.08, group: 'mechanics' });
        this.#noise(at, 400, { to: 900, type: 'lowpass', dur: 0.9, attack: 0.3, gain: 0.05, group: 'mechanics' });
        break;
      case 'wc-snapshot':
        this.#noise(at, 3200, { Q: 5, dur: 0.02, gain: 0.2, group: 'project' });
        this.#tone(at + 0.02, 880, { dur: 0.12, gain: 0.03, group: 'project' });
        break;
      case 'wc-emerge':
        this.#tone(at, 240, { to: 480, dur: 0.4, gain: 0.025, type: 'triangle', group: 'project' });
        break;
      case 'wc-conflict':
        this.#tone(at, 330, { to: 262, dur: 0.3, gain: 0.05, type: 'triangle', group: 'project' });
        this.#tone(at, 349, { to: 277, dur: 0.3, gain: 0.04, type: 'triangle', group: 'project' });
        break;
      case 'wc-merge':
        this.#tone(at, this.#note(2) * 2, { dur: 0.08, gain: 0.04, group: 'project' });
        this.#tone(at + 0.07, this.#note(4) * 2, { dur: 0.12, gain: 0.04, group: 'project' });
        break;
      case 'wc-drop':
        this.#noise(at, 1600, { to: 200, Q: 1.3, dur: 0.6, gain: 0.08, group: 'project' });
        break;
      case 'wc-sink':
        this.#tone(at, 110, { to: 60, dur: 1.4, attack: 0.2, gain: 0.07, group: 'mechanics' });
        break;
      // FunChessEngine
      case 'chess-expand':
        this.#tone(at, this.#note(e.d ?? 0) * 4, { dur: 0.06, gain: 0.015, group: 'project' });
        break;
      case 'chess-prune':
        this.#noise(at, 2000, { to: 500, Q: 1.2, dur: 0.5, gain: 0.03, group: 'project' });
        break;
      case 'chess-line':
        this.#tone(at, this.#note(5) * 2, { dur: 0.3, gain: 0.035, group: 'project' });
        break;
      case 'chess-move':
        this.#noise(at, 900, { Q: 3, dur: 0.03, gain: 0.22, group: 'project' });
        this.#tone(at, 220, { dur: 0.06, gain: 0.05, group: 'project' });
        break;
      // PianoMir: each note bar as it reaches the playhead
      case 'pm-note':
        this.#tone(at, this.#note(e.row ?? 0), { dur: 0.35 + (e.len ?? 0.2), attack: 0.006, gain: 0.03, type: 'triangle', group: 'project' });
        break;
      // Clarity
      case 'clarity-split':
        for (let i = 0; i < 4; i++) this.#tone(at + i * 0.18, this.#note(i * 2) * 2, { dur: 0.1, gain: 0.02, group: 'project' });
        break;
      case 'clarity-merge':
        for (let i = 0; i < 4; i++) this.#tone(at + i * 0.14, this.#note(6 - i * 2) * 2, { dur: 0.1, gain: 0.018, group: 'project' });
        break;
      // micro cameos
      case 'micro-tick':
        this.#noise(at, 2600, { Q: 6, dur: 0.012, gain: 0.08, group: 'project' });
        break;
      case 'micro-meet':
        this.#tone(at, this.#note(2) * 2, { to: this.#note(3) * 2, dur: 0.5, gain: 0.02, group: 'project' });
        this.#tone(at, this.#note(4) * 2, { to: this.#note(3) * 2, dur: 0.5, gain: 0.02, group: 'project' });
        break;
      // the machine's own language
      case 'project-start': {
        // a computer acknowledgement as a work begins: rising chirps, longer for larger works
        const n = { flagship: 4, featured: 3, cameo: 2, micro: 2 }[e.tier] ?? 2;
        for (let i = 0; i < n; i++) this.#tone(at + i * 0.07, this.#note([0, 2, 4, 6][i]) * 4, { dur: 0.06, gain: 0.06, type: 'square', group: 'beeps' });
        this.#tone(at + n * 0.07, this.#note(4) * 2, { dur: 0.25, gain: 0.05, group: 'beeps' });
        break;
      }
      case 'detent':
        this.#noise(at, e.major ? 1500 : 2100, { Q: 3, dur: 0.018, gain: e.major ? 0.16 : 0.09, group: 'mechanics' });
        if (e.major) this.#tone(at, 140, { to: 110, dur: 0.12, gain: 0.07, group: 'mechanics' });
        break;
      case 'relay':
        this.#noise(at, 3000, { Q: 4, dur: 0.008, gain: 0.14, group: 'mechanics' });
        this.#noise(at + 0.025, 2300, { Q: 4, dur: 0.008, gain: 0.09, group: 'mechanics' });
        break;
      // the PROJECTS sign, restrained
      case 'holo-break-letter':
        for (let i = 0; i < 4; i++) this.#tone(at + i * 0.05 + Math.random() * 0.02, this.#note(5 + i) * 4, { dur: 0.04, gain: 0.01, group: 'holo' });
        break;
      case 'holo-pixel':
        for (let i = 0; i < 6; i++) this.#noise(at + i * 0.09, 3800 + Math.random() * 1500, { Q: 9, dur: 0.008, gain: 0.03, group: 'holo' });
        break;
      case 'holo-wave':
        this.#tone(at, 1400, { to: 2100, dur: 1.2, attack: 0.4, gain: 0.006, group: 'holo' });
        break;
      case 'holo-portal':
        this.#tone(at, e.back ? 3600 : 2900, { to: e.back ? 2800 : 3700, dur: 0.09, gain: 0.014, group: 'holo' });
        break;
      // Cloudline
      case 'cl-lay':
        for (let i = 0; i < 10; i++) this.#noise(at + i * 0.28, 1700 - i * 60, { Q: 4, dur: 0.02, gain: 0.12, group: 'project' });
        break;
      case 'cl-depart':
        this.#tone(at, 988, { dur: 0.7, gain: 0.05, group: 'project' });
        this.#tone(at + 0.18, 1319, { dur: 0.9, gain: 0.045, group: 'project' });
        break;
      case 'cl-joint':
        this.#noise(at, 1300, { Q: 3, dur: 0.012, gain: 0.07, group: 'project' });
        this.#noise(at + 0.07, 1250, { Q: 3, dur: 0.012, gain: 0.06, group: 'project' });
        break;
      case 'cl-arrive':
        this.#tone(at, 1319, { dur: 0.6, gain: 0.04, group: 'project' });
        this.#tone(at + 0.15, 988, { dur: 0.8, gain: 0.04, group: 'project' });
        break;
      case 'cl-retract':
        this.#noise(at, 900, { to: 2600, Q: 2, dur: 1.6, attack: 0.3, gain: 0.06, group: 'project' });
        break;
      case 'po-strict':
        this.#tone(at, 110, { to: 82, dur: 0.35, gain: 0.12, type: 'square', group: 'rare' });
        this.#noise(at + 0.02, 1900, { Q: 2, dur: 0.06, gain: 0.3, group: 'rare' });
        break;
      // interaction cues (Resume's philosophy: immediate, caused, graded, gated; not its sounds)
      case 'hover-ack':
        // a servo nudge, a relay, and the machine's two-note "I see you"
        this.#noise(at, 450, { to: 1500, Q: 2.5, dur: 0.3, attack: 0.04, gain: 0.12, group: 'mechanics' });
        this.#noise(at + 0.04, 3000, { Q: 4, dur: 0.008, gain: 0.16, group: 'mechanics' });
        this.#tone(at + 0.07, this.#note(2) * 4, { dur: 0.07, gain: 0.07, type: 'square', group: 'beeps' });
        this.#tone(at + 0.15, this.#note(6) * 4, { dur: 0.14, gain: 0.06, group: 'beeps' });
        break;
      case 'hover-tick':
        this.#tone(at, this.#note(5) * 8, { dur: 0.025, gain: 0.012, group: 'beeps' });
        break;
      case 'hover-release':
        this.#tone(at, this.#note(6) * 4, { to: this.#note(3) * 4, dur: 0.16, gain: 0.025, group: 'beeps' });
        break;
      case 'activate':
        // one sequence with the settle: the machine wakes (relays, a rising confirmation, the
        // phosphor), then a sustained alignment glides through the camera's flight and resolves
        // into the lock when it arrives
        for (let i = 0; i < 3; i++) this.#noise(at + i * 0.06, 2800 - i * 300, { Q: 5, dur: 0.01, gain: 0.2, group: 'mechanics' });
        [0, 2, 4, 7].forEach((n, i) => this.#tone(at + 0.12 + i * 0.075, this.#note(n) * 2, { dur: 0.12, gain: 0.07, group: 'beeps' }));
        this.#noise(at + 0.4, 6000, { to: 3500, Q: 3, dur: 0.8, attack: 0.3, gain: 0.025, group: 'beeps' });
        this.#alignStart(at + 0.1, e.dur ?? 2.4);
        break;
      case 'settle':
        // the lock: the alignment resolves into a thump, a click and the tone it was heading for
        this.#alignEnd(at, 0.12);
        this.#tone(at, 92, { to: 64, dur: 0.3, gain: 0.16, group: 'mechanics' });
        this.#noise(at + 0.01, 2200, { Q: 5, dur: 0.012, gain: 0.2, group: 'mechanics' });
        this.#tone(at + 0.03, this.#note(4) * 2, { dur: 1.4, gain: 0.04, group: 'beeps' });
        this.#tone(at + 0.03, this.#note(4), { dur: 1.0, gain: 0.025, group: 'beeps' });
        break;
      case 'reengage': {
        // graded by how far the view had wandered: a chirp; then relay and servo; then a re-lock
        const a = e.amp ?? 0.5;
        this.#tone(at, this.#note(4) * 4, { dur: 0.06, gain: 0.03 + 0.04 * a, type: 'square', group: 'beeps' });
        if (a > 0.3) {
          this.#tone(at + 0.08, this.#note(7) * 4, { dur: 0.1, gain: 0.05 * a, group: 'beeps' });
          this.#noise(at + 0.04, 3000, { Q: 4, dur: 0.008, gain: 0.15 * a, group: 'mechanics' });
          this.#noise(at, 400, { to: 1100, Q: 2, dur: 0.4, attack: 0.1, gain: 0.12 * a, group: 'mechanics' });
        }
        if (a > 0.7) {
          this.#tone(at + 0.42, 92, { to: 64, dur: 0.28, gain: 0.14 * a, group: 'mechanics' });
          this.#tone(at + 0.45, this.#note(4) * 2, { dur: 0.9, gain: 0.035 * a, group: 'beeps' });
        }
        break;
      }
      case 'amb-transit':
        // a small thing passing through a small aperture: a light rush and a tick
        this.#noise(at, 900, { to: 3200, Q: 2.2, dur: 0.18, attack: 0.05, gain: 0.12, group: 'ambient' });
        this.#noise(at + 0.08, 4200, { Q: 8, dur: 0.01, gain: 0.07, group: 'ambient' });
        break;
      case 'release':
        this.#alignEnd(at, 0.3);
        this.#tone(at, this.#note(4) * 2, { to: this.#note(0) * 2, dur: 0.35, gain: 0.04, group: 'beeps' });
        this.#noise(at, 900, { to: 300, Q: 1.6, dur: 0.6, attack: 0.1, gain: 0.08, group: 'mechanics' });
        break;
      default:
        break;
    }
  }
}
