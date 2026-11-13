/**
 * Profile's voice (vertical slice): harmonic, never mechanical. Everything is additive: a tone is a
 * stack of partials over one root. The body's state is its timbre: solid steel sounds with the full
 * harmonic series (struck, felt-hammered, piano-like); where it opens to its structure only the odd
 * partials remain, the hollow, clarinet-like colour. Attention is tuning: hover glides a detuned
 * chord into tune, arrival resolves, a comparison beats until one answer resolves it.
 *
 * Every sound has a visible cause: the morph voice follows the visible change of the body's fields,
 * the cues follow the figure's interaction states, the exchange follows the tokens and the model
 * bodies. No melody, no loops, no beeps. The root is a parameter so a later global mix can re-key it.
 */
// levels set against Resume at an equal 12-unit distance (A-weighted short-term loudness)
export const MIX = { morph: 0.5, cue: 3.0, exchange: 2.0, step: 0.8, idle: 0.14 };
const ROOT = 146.83; // D3
const RATIO = { openai: 1, claude: 5 / 4, grok: 3 / 2, deepseek: 15 / 8, gemini: 9 / 8, qwen: 5 / 3, kimi: 4 / 3, mistral: 2, minimax: 7 / 4 };

export class ProfileSound {
  constructor(ctx, out, idleOut = out) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(out);
    this.g = {};
    for (const [k, v] of Object.entries(MIX)) {
      const g = ctx.createGain();
      g.gain.value = v;
      g.connect(this.out);
      this.g[k] = g;
    }
    // the morph voice: ten partials of the root, even ones gated by how solid the body is
    this.morphGain = ctx.createGain();
    this.morphGain.gain.value = 0;
    this.morphGain.connect(this.g.morph);
    this.partials = [];
    for (let k = 1; k <= 10; k++) {
      const o = ctx.createOscillator();
      o.frequency.value = ROOT * k;
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(g).connect(this.morphGain);
      o.start();
      this.partials.push({ k, o, g });
    }
    this._solid = 1;
    this.voices = 0;
    // the atmosphere has its own path: the station's bus falls silent at the overview's distance
    this.g.idle.disconnect();
    this.g.idle.connect(idleOut);
    this.#buildIdle();
  }

  /**
   * The idle atmosphere: never an oscillator held on a note. Four bands of filtered air, each with a
   * centre frequency that keeps wandering, its own breathing, stereo drift and long silences; one of
   * them runs through a slowly sweeping comb (a soft phase resonance). Over that, sparse glassy
   * partials that are never the same twice, and quiet pass-bys when the visible field does something.
   */
  #buildIdle() {
    const ctx = this.ctx, len = (ctx.sampleRate * 6) | 0, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.idleBuf = buf;
    this.idleBus = ctx.createGain();
    this.idleBus.gain.value = 0;
    this.idleBus.connect(this.g.idle);
    this.idleGoal = 0;
    this.nextGlass = 0;
    this._idleT = 0;
    const spec = [{ lo: 2300, hi: 4300, q: 9, level: 0.75 }, { lo: 4700, hi: 8400, q: 5, level: 0.5 }, { lo: 9000, hi: 13500, q: 2.5, level: 0.22 }, { lo: 850, hi: 1900, q: 1.4, level: 0.16, comb: true }];
    this.idleBands = spec.map((b, i) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = b.q;
      f.frequency.value = Math.sqrt(b.lo * b.hi);
      const g = ctx.createGain();
      g.gain.value = 0;
      const pan = ctx.createStereoPanner();
      src.connect(f).connect(g);
      if (b.comb) {
        const dl = ctx.createDelay(0.03), lfo = ctx.createOscillator(), depth = ctx.createGain();
        dl.delayTime.value = 0.008;
        lfo.frequency.value = 0.07;
        depth.gain.value = 0.0055;
        lfo.connect(depth).connect(dl.delayTime);
        lfo.start();
        f.connect(dl).connect(g);
      }
      g.connect(pan).connect(this.idleBus);
      src.start(0, i * 1.37);
      return { ...b, f, g, pan, on: i < 2, nextF: 0, nextG: 2 + i * 3, seed: i * 2.3 + 0.7 };
    });
  }

  /** How present the idle atmosphere is: `focused` is the focused station id (or null). */
  presence(focused) {
    this.idleGoal = focused === 'profile' ? 0.55 : focused ? 0 : 0.35;
  }

  #idleTick(now) {
    for (const b of this.idleBands) {
      if (now > b.nextF) {
        const u = Math.random();
        b.f.frequency.setTargetAtTime(b.lo * Math.pow(b.hi / b.lo, u), now, 2.2 + Math.random() * 3.5);
        b.nextF = now + 3.5 + Math.random() * 8;
      }
      if (now > b.nextG) {
        b.on = !b.on;
        b.nextG = now + (b.on ? 5 + Math.random() * 10 : 2.5 + Math.random() * 7);
      }
      const breath = 0.5 + 0.3 * Math.sin(now * (0.37 + b.seed * 0.05) + b.seed) + 0.2 * Math.sin(now * (0.83 + b.seed * 0.07) + b.seed * 2.1);
      b.g.gain.setTargetAtTime(b.on ? b.level * breath * (1 + 1.2 * (this._lift ?? 0)) : 0, now, b.on ? 1.5 : 2.2);
      b.pan.pan.setTargetAtTime(0.85 * Math.sin(now * (0.11 + b.seed * 0.02) + b.seed * 1.7), now, 1.2);
    }
    this._lift = Math.max(0, (this._lift ?? 0) - 0.09);
    if (now > this.nextGlass) {
      this.nextGlass = now + 2.6 + Math.random() * 7;
      if (this.idleGoal > 0.01) this.#glass(now + 0.05);
    }
  }

  /** One glassy cluster: an unrepeated pitch, inharmonic partials, a slow bloom and drift, placed in space. */
  #glass(t, k = 1, pitch = null) {
    if (this.voices > 40) return;
    const ctx = this.ctx, f0 = pitch ?? ROOT * [8, 9, 10, 12, 13.5, 15, 16, 18, 20][Math.floor(Math.random() * 9)] * Math.pow(2, (Math.random() - 0.5) / 18);
    const dur = 3 + Math.random() * 3, env = ctx.createGain(), pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime((Math.random() - 0.5) * 1.5, t);
    pan.pan.linearRampToValueAtTime((Math.random() - 0.5) * 1.5, t + dur);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.02 * k, t + 0.5 + Math.random() * 0.9);
    env.gain.setTargetAtTime(0, t + 1.5, dur / 4);
    env.connect(pan).connect(this.idleBus);
    this.voices++;
    [1, 1.0035, 2.71, 5.18].forEach((r, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(f0 * r, t);
      o.frequency.exponentialRampToValueAtTime(f0 * r * (1 + (Math.random() - 0.5) * 0.012), t + dur);
      g.gain.value = [1, 0.7, 0.28, 0.1][i];
      o.connect(g).connect(env);
      o.start(t);
      o.stop(t + dur * 1.5);
      if (i === 0) o.onended = () => ((this.voices--), env.disconnect(), pan.disconnect());
    });
  }

  /** Air moving past: a filtered sweep crossing the stereo field, for a model passing or a line of light. */
  #pass(t, { from = -0.8, to = 0.8, dur = 2.2, k = 1, f0 = 1400, f1 = 4600 }) {
    if (this.voices > 40) return;
    const ctx = this.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), pan = ctx.createStereoPanner();
    src.buffer = this.idleBuf;
    f.type = 'bandpass';
    f.Q.value = 4;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.55);
    f.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.9 * k, t + dur * 0.5);
    g.gain.linearRampToValueAtTime(0, t + dur);
    pan.pan.setValueAtTime(from, t);
    pan.pan.linearRampToValueAtTime(to, t + dur);
    src.connect(f).connect(g).connect(pan).connect(this.idleBus);
    this.voices++;
    src.onended = () => ((this.voices--), pan.disconnect());
    src.start(t, Math.random() * 4, dur + 0.05);
  }

  /**
   * One additive tone: `f` Hz, partial amplitudes falling as 1/k^tilt, even partials scaled by
   * `solid` (0 hollow → 1 full), optional glide from `from`, felt-hammer attack (high partials decay
   * faster). Returns nothing; voices free themselves.
   */
  #tone(when, f, { dur = 1.5, amp = 0.1, solid = 1, solidTo = null, from = null, glide = 0.3, attack = 0.008, n = 7, tilt = 1.2, out = this.g.cue, detune = 0 }) {
    if (this.voices > 40) return;
    const ctx = this.ctx;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(amp, when + attack);
    env.gain.setTargetAtTime(0, when + attack, dur / 4);
    env.connect(out);
    this.voices++;
    for (let k = 1; k <= n; k++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const even = k % 2 === 0;
      const base = 1 / Math.pow(k, tilt);
      const s0 = even ? solid : 1;
      g.gain.setValueAtTime(base * s0, when);
      if (solidTo !== null && even) g.gain.linearRampToValueAtTime(base * solidTo, when + dur * 0.6);
      // a felt hammer: the upper partials die away sooner
      g.gain.setTargetAtTime(base * 0.0001, when + attack, dur / (1 + k * 0.45));
      o.frequency.setValueAtTime((from ?? f) * k, when);
      if (from) o.frequency.exponentialRampToValueAtTime(f * k, when + glide);
      o.detune.value = detune;
      o.connect(g).connect(env);
      o.start(when);
      o.stop(when + dur * 1.6 + 0.1);
      if (k === 1) o.onended = () => (this.voices--, env.disconnect());
    }
  }

  #cents(c) {
    return Math.pow(2, c / 1200);
  }

  /** Continuous morph voice from the body's visible change; then the events of this frame. */
  update(el) {
    const ctx = this.ctx, now = ctx.currentTime;
    const s = el.soundState ?? { activity: 0, solid: 1 };
    this._solid += (s.solid - this._solid) * 0.1;
    // the atmosphere sits under whatever the station is doing, and is gone when another station is focused
    const ig = this.idleGoal * (el.acts?.mode ? 0.45 : 1);
    this.idleBus.gain.setTargetAtTime(ig, now, ig > this.idleBus.gain.value ? 1.1 : 0.32);
    if (now - this._idleT > 0.28) (this._idleT = now), this.#idleTick(now);
    // the field: a quiet harmonic bed (never silence when the station is alive), a little more
    // while attended or focused, and the body's visible change on top
    // no persistent drone: the bed sounds only while the station is actually being attended (hover);
    // at rest and in focused idle there is silence between events
    const bed = 0.05 * (s.wake ?? 0) * (1 - (s.focus ?? 0));
    this.morphGain.gain.setTargetAtTime(Math.min(0.17, bed + s.activity * 0.05), now, 0.35);
    for (const p of this.partials) {
      const even = p.k % 2 === 0;
      // while attended the upper partials shimmer slowly (an evolving bed, not a loop)
      const shimmer = p.k > 3 ? 1 + 0.6 * (s.wake ?? 0) * Math.sin(now * (0.21 + 0.07 * p.k) + p.k * 1.7) : 1;
      p.g.gain.setTargetAtTime((1 / Math.pow(p.k, 1.15)) * (even ? this._solid : 1) * (p.k > 6 ? 0.5 : 1) * shimmer, now, 0.2);
    }
    for (const e of el.events ?? []) this.#event(now + 0.02, e);
    if (el.events) el.events.length = 0;
  }

  #event(t, e) {
    const R = ROOT;
    switch (e.type) {
      case 'hover-ack': {
        // a detuned chord glides into tune: attention arriving
        [1, 3 / 2, 2, 5 / 2].forEach((r, i) => this.#tone(t + i * 0.025, R * 2 * r, { from: R * 2 * r * this.#cents((i % 2 ? 1 : -1) * (35 + 12 * i)), glide: 0.34, dur: 1.7, amp: 0.058, solid: 0.35, solidTo: 1, attack: 0.03 }));
        break;
      }
      case 'idle-pass': {
        const c = e.p?._lf?.[0] ?? (Math.random() - 0.5) * 2, pan = Math.max(-0.9, Math.min(0.9, c));
        this.#pass(t, { from: pan, to: -pan * 0.7, dur: 2.4 + Math.random() * 1.2, k: 1 });
        break;
      }
      case 'idle-seam':
        this.#pass(t, { from: 0.25, to: -0.25, dur: 2.6, k: 0.7, f0: 6500, f1: 3000 });
        this.#glass(t + 2.2, 0.5, ROOT * 8);
        break;
      case 'idle-wrap':
        this.#pass(t, { from: -0.85, to: 0.85, dur: 3.4, k: 1.1, f0: 1100, f1: 3800 });
        break;
      case 'idle-stage':
        this.#pass(t, { from: 0.5, to: -0.6, dur: 2.0, k: 0.6, f0: 900, f1: 2400 });
        break;
      case 'idle-bead':
        this.#glass(t, 0.4);
        break;
      case 'idle-profile':
        this._lift = 1;
        break;
      case 'reselect-small':
        // a tiny re-select: one quiet, clean partial (acknowledged, not celebrated)
        this.#tone(t, R * 4, { dur: 0.7, amp: 0.009, solid: 1, attack: 0.01, n: 4 });
        break;
      case 'hover-pulse':
        // the sustained hover's evolving moments: a soft tuned shimmer
        [2, 3, 4].forEach((r, i) => this.#tone(t + i * 0.07, R * r, { from: R * r * this.#cents(12), glide: 0.4, dur: 1.4, amp: 0.016 * (e.k ?? 0.6), solid: 0.3, solidTo: 1, attack: 0.08 }));
        break;
      case 'micro':
        this.#tone(t, R * 5, { dur: 1.0, amp: 0.008 * (e.k ?? 0.5), solid: 0.2, attack: 0.05, n: 4 });
        break;
      case 'hover-release':
        this.#tone(t, R * 2, { from: R * 2 * this.#cents(10), glide: 0.6, dur: 1.2, amp: 0.022, solid: 1, solidTo: 0, attack: 0.05 });
        break;
      case 'activate': {
        // one felt-struck low note, then the series fills as the scan rises
        this.#tone(t, R, { dur: 3.4, amp: 0.22, solid: 1, attack: 0.006, n: 9 });
        const dur = e.dur ?? 2.4;
        [3 / 2, 2, 5 / 2, 3].forEach((r, i) => this.#tone(t + 0.45 * dur + (i * 0.5 * dur) / 4, R * r, { dur: 1.8, amp: 0.05, solid: 0.2, solidTo: 1, attack: 0.12 }));
        // a harmonic field rises through the flight and is resolved by the arrival ('settle')
        [1, 3 / 2, 2].forEach((r, i) => this.#tone(t + 0.1, R * r * 2, { from: R * r * 2 * this.#cents(-20), glide: dur, dur: dur + 0.4, amp: 0.022, solid: 0.3, solidTo: 1, attack: dur * 0.8 }));
        break;
      }
      case 'settle':
        [1, 5 / 4, 3 / 2, 2].forEach((r, i) => this.#tone(t + i * 0.04, R * r, { dur: 3.4, amp: 0.032, solid: 1, attack: 0.1 }));
        break;
      case 'release':
        this.#tone(t, R, { from: R * this.#cents(-6), glide: 0.8, dur: 2.2, amp: 0.05, solid: 1, solidTo: 0, attack: 0.06 });
        break;
      case 'reengage': {
        const a = e.amp ?? 0.5;
        [1, 3 / 2, 2].forEach((r, i) => this.#tone(t + i * 0.03, R * 2 * r, { from: R * 2 * r * this.#cents((i % 2 ? 1 : -1) * (15 + 55 * a)), glide: 0.25 + 0.35 * a, dur: 1.4 + a, amp: 0.012 + 0.024 * a, solid: 0.4, solidTo: 1, attack: 0.03 }));
        break;
      }
      case 'step':
        this.#tone(t, 55, { dur: 0.22, amp: 0.05 * (e.w ?? 0.6), n: 3, tilt: 1.8, attack: 0.004, out: this.g.step });
        break;
      case 'tokens-out':
        // the prompt leaves in a measured rhythm: hollow notes, groups of three
        for (let i = 0; i < 9; i++) this.#tone(t + Math.floor(i / 3) * 0.75 + (i % 3) * 0.16, R * 4 * [1, 9 / 8, 5 / 4][i % 3], { dur: 0.6, amp: 0.026, solid: 0, attack: 0.01, n: 5, out: this.g.exchange });
        break;
      case 'model-in':
        this.#tone(t, R * 2 * (RATIO[e.id] ?? 1), { dur: 2.2, amp: 0.12, solid: 0.3, solidTo: 1, attack: 0.05, out: this.g.exchange });
        break;
      case 'tokens-back':
        for (let i = 0; i < 9; i++) this.#tone(t + Math.floor(i / 3) * 0.68 + (i % 3) * 0.15, R * 4 * [5 / 4, 9 / 8, 1][i % 3] * (1 - i * 0.012), { dur: 0.7, amp: 0.026, solid: i / 9, attack: 0.01, n: 5, out: this.g.exchange });
        break;
      case 'beat-start': {
        // two answers, a few hertz apart: they beat while the figure weighs them
        const f = R * 2 * 3 / 2;
        this.#tone(t, f, { dur: 4.6, amp: 0.05, solid: 0.6, attack: 0.3, out: this.g.exchange });
        this.#tone(t, f + 2.6, { dur: 4.6, amp: 0.05, solid: 0.6, attack: 0.3, out: this.g.exchange });
        break;
      }
      case 'beat-resolve':
        this.#tone(t, R * 3, { dur: 2.6, amp: 0.13, solid: 1, attack: 0.04, out: this.g.exchange });
        this.#tone(t + 0.05, R * 2, { dur: 2.8, amp: 0.055, solid: 1, attack: 0.06, out: this.g.exchange });
        break;
      // ---- activities: chess (branches, a rejected line, the move, the clock, the mate)
      case 'chess-assemble':
        [1, 3 / 2, 2].forEach((r, i) => this.#tone(t + i * 0.09, R * 2 * r, { dur: 0.9, amp: 0.06, solid: 0.5, solidTo: 1, attack: 0.02, out: this.g.exchange }));
        break;
      case 'chess-branch':
        [5 / 4, 3 / 2, 15 / 8].forEach((r, i) => this.#tone(t + i * 0.5, R * 2 * r, { dur: 2.4, amp: 0.095, solid: 0.3, attack: 0.15, out: this.g.exchange }));
        break;
      case 'chess-reject':
        this.#tone(t, R * 2 * (e.k ? 15 / 8 : 3 / 2), { from: R * 2 * (e.k ? 15 / 8 : 3 / 2), dur: 1.1, amp: 0.062, solid: 1, solidTo: 0, attack: 0.01, out: this.g.exchange });
        break;
      case 'chess-move':
        this.#tone(t, R * 2, { dur: 0.6, amp: 0.34, n: 5, tilt: 1.5, attack: 0.003, out: this.g.cue });
        break;
      case 'chess-clock':
        this.#tone(t, R * 6, { dur: 0.14, amp: 0.07, n: 3, tilt: 2, attack: 0.002, out: this.g.cue });
        break;
      case 'chess-mate':
        [1, 5 / 4, 3 / 2, 2].forEach((r, i) => this.#tone(t + 0.12 + i * 0.03, R * r, { dur: 2.8, amp: 0.1, solid: 1, attack: 0.04, out: this.g.exchange }));
        this.#tone(t + 0.1, R / 2, { dur: 3.6, amp: 0.11, solid: 1, attack: 0.02, n: 8 });
        break;
      // ---- music: the piano's own notes (felt hammer, full series), the clarinet's (odd harmonics)
      case 'piano-note': {
        const f = 261.63 * Math.pow(2, (e.key ?? 0) / 12);
        this.#tone(t, f, { dur: 1.9, amp: 0.09, solid: 1, attack: 0.004, n: 8, tilt: 1.35, out: this.g.cue });
        break;
      }
      case 'clar-note': {
        const f = 293.66 * Math.pow(2, [0, 2, 4, 5, 7, 9, 11][e.step ?? 0] / 12);
        this.#tone(t, f, { from: f * this.#cents(-12), glide: 0.08, dur: (e.len ?? 1) + 0.6, amp: 0.13, solid: 0.04, attack: 0.07, n: 9, tilt: 1.05, out: this.g.cue });
        // the breath and the bore's resonance above it
        this.#tone(t, f * 3, { dur: (e.len ?? 1) + 0.3, amp: 0.028, solid: 0, attack: 0.12, n: 4, tilt: 0.8, out: this.g.exchange });
        break;
      }
      // ---- the AI field assembling; the body passing into information and back
      case 'crown':
        Object.values(RATIO).slice(0, 6).forEach((r, i) => this.#tone(t + i * 0.18, R * r, { dur: 5, amp: 0.07, solid: 0.6, solidTo: 1, attack: 0.7, out: this.g.exchange }));
        // the rare event blooms: the low root and its fifth under the crown
        this.#tone(t + 0.2, R / 2, { dur: 6.5, amp: 0.34, solid: 1, attack: 0.45, n: 9 });
        this.#tone(t + 0.3, (R * 3) / 4, { dur: 6, amp: 0.14, solid: 1, attack: 0.6, n: 7 });
        break;
      case 'phase-out':
        this.#tone(t, R, { from: R * this.#cents(4), glide: 1.4, dur: 3.2, amp: 0.095, solid: 1, solidTo: 0, attack: 0.3, out: this.g.exchange });
        break;
      case 'phase-in':
        [1, 3 / 2, 2, 5 / 2].forEach((r, i) => this.#tone(t + i * 0.06, R * r, { dur: 2.6, amp: 0.065, solid: 0.2, solidTo: 1, attack: 0.25, out: this.g.exchange }));
        break;
      case 'resolve':
        [1, 3 / 2, 2].forEach((r, i) => this.#tone(t + i * 0.05, R * r, { dur: 2.6, amp: 0.045, solid: 1, attack: 0.2, out: this.g.exchange }));
        break;
    }
  }
}
