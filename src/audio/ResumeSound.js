/**
 * Resume's voice on its Soundscape bus: a self-writing document. Everything is procedural and
 * follows what is visibly happening at the station:
 *   - graphite on paper while the stylus is in contact (grain modulated at audio rate, shaped by
 *     stylus speed), a soft tap when it touches down and a small click when it lifts;
 *   - folding: a dry rub and crease texture while a piece folds or opens (the note becoming an
 *     aeroplane and back, the small letter), driven by how fast it is folding, with a crisp set
 *     when a fold closes and a soft settle when it lies open;
 *   - slips peeling off their margin and settling back, the aeroplane touching down;
 *   - the aeroplane in flight: thin air and an irregular paper flutter, at the aeroplane's
 *     position, from its speed, bank and distance;
 *   - crumpling and opening paper, driven by how fast each ball's crumple is changing;
 *   - while hovered, small rustles from the loose paper as it draws in, in proportion to how much
 *     of it is moving;
 *   - a very low paper-friction bed.
 * Focus calms the paper layer; the stylus stays clear.
 */
const WRITING = ['write', 'final', 'mark', 'note'];
// the aeroplane plays straight into the master (it is positioned by its own panner), so it
// takes the station's trim here
const AIR_TRIM = 0.8;
const GRAIN_GAIN = 6;

export class ResumeSound {
  constructor(ctx, out, { white, pink, brown }, master) {
    this.ctx = ctx;
    this.white = white;
    this.paper = this.#gain(1);
    this.paper.connect(out);
    this.taps = this.#gain(1);
    this.taps.connect(out);
    // paper grains are narrow filtered noise and lose most of their energy in the filter;
    // this stage brings them up to sit just under the writing (focus still calms them via paper)
    this.grains = this.#gain(GRAIN_GAIN);
    this.grains.connect(this.paper);

    // bed: faint paper friction, barely there
    this.bed = this.#gain(0.03);
    this.#loop(pink).connect(this.#filter('bandpass', 750, 0.5)).connect(this.#filter('lowpass', 2200, 0.5)).connect(this.bed).connect(out);
    this.#lfo(0.07, 0.012, this.bed.gain);

    // stylus scratch: noise band-passed into the graphite range, its amplitude driven by slow
    // noise so it reads as grain and drag rather than a steady hiss
    this.scratchBand = this.#filter('bandpass', 2600, 1.6);
    const grain = this.#gain(0.55);
    const grainMod = this.#gain(0.7);
    this.#loop(brown).connect(this.#filter('lowpass', 34, 0.7)).connect(grainMod).connect(grain.gain);
    this.scratch = this.#gain(0);
    this.#loop(white).connect(this.#filter('highpass', 1500, 0.7)).connect(this.scratchBand).connect(this.#filter('lowpass', 5200, 0.6)).connect(grain).connect(this.scratch).connect(out);

    // folding: a dry rub (paper sliding over itself) under crease grains (see tick)
    this.foldBand = this.#filter('bandpass', 1500, 0.9);
    this.foldRub = this.#gain(0);
    this.#loop(pink).connect(this.#filter('highpass', 500, 0.7)).connect(this.foldBand).connect(this.foldRub).connect(this.paper);
    this.folds = {};

    // aeroplane: thin air over a small sheet and an irregular paper flutter, on their own panner
    // so they sit where the aeroplane is rather than at the station
    this.airPan = ctx.createStereoPanner();
    this.airPan.connect(master);
    this.airOut = this.#gain(AIR_TRIM);
    this.airOut.connect(this.airPan);
    this.air = this.#gain(0);
    this.#loop(white).connect(this.#filter('highpass', 1800, 0.6)).connect(this.#filter('lowpass', 6500, 0.6)).connect(this.air).connect(this.airOut);
    this.flight = { level: 0, rate: 0, bank: 0 };

    // crumpling: a soft compressed-paper body under dense dry micro-creases (see tick)
    this.crumpleBody = this.#gain(0);
    this.#loop(pink).connect(this.#filter('bandpass', 1400, 0.7)).connect(this.crumpleBody).connect(this.paper);
    this.balls = [];

    // hover: rustles from the loose paper as it draws in (see tick)
    this.rustle = { hover: 0, activity: 0, base: 0, move: 0 };
    // ...and under them the movement of all of it at once while it reorganises: a soft rush of
    // paper through air and a layered sheet flutter, following how fast things are changing
    this.moveBand = this.#filter('bandpass', 1200, 0.5);
    this.moveRush = this.#gain(0);
    this.#loop(pink).connect(this.#filter('highpass', 300, 0.7)).connect(this.moveBand).connect(this.moveRush).connect(this.paper);
    const sheetMod = this.#gain(0.5);
    this.#loop(brown).connect(this.#filter('lowpass', 18, 0.7)).connect(this.#gain(0.9)).connect(sheetMod.gain);
    this.moveFlutter = this.#gain(0);
    this.#loop(white).connect(this.#filter('bandpass', 3400, 0.8)).connect(sheetMod).connect(this.moveFlutter).connect(this.paper);
    this.moving = new Map();

    this.prev = { pen: false, slips: [], flying: false, tip: null, t: 0 };
    this.speed = 0;
    this.pen = false;
    this.level = {};
  }

  #gain(v) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  #filter(type, freq, Q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = Q;
    return f;
  }

  #loop(buffer) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.start(0, Math.random() * buffer.duration);
    return src;
  }

  #lfo(freq, depth, target) {
    const o = this.ctx.createOscillator();
    o.frequency.value = freq;
    const g = this.#gain(depth);
    o.connect(g).connect(target);
    o.start();
  }

  /** A short filtered noise grain with a click-free attack. */
  #grain(out, when, { freq, type = 'bandpass', Q = 1, amp, attack = 0.003, decay }) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.white;
    const f = this.#filter(type, freq, Q);
    const g = this.#gain(0);
    src.connect(f).connect(g).connect(out);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(Math.min(amp, 0.12), when + attack);
    g.gain.exponentialRampToValueAtTime(0.0003, when + attack + decay);
    src.start(when, Math.random() * 3);
    src.stop(when + attack + decay + 0.05);
  }

  #r(a, b) {
    return a + Math.random() * (b - a);
  }

  // ---- events

  #contact(t) {
    this.#grain(this.taps, t, { freq: this.#r(900, 1300), Q: 1.4, amp: 0.07, decay: 0.035 });
    this.#grain(this.taps, t, { freq: this.#r(4200, 5200), type: 'highpass', amp: 0.025, decay: 0.012 });
  }

  #lift(t) {
    this.#grain(this.taps, t, { freq: this.#r(2400, 3100), Q: 3, amp: 0.035, decay: 0.018 });
  }

  #peel(t) {
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.#grain(this.grains, t + i * this.#r(0.04, 0.07), { freq: this.#r(1800, 3600), Q: 0.9, amp: this.#r(0.025, 0.05), attack: 0.006, decay: this.#r(0.04, 0.08) });
  }

  #settle(t) {
    this.#grain(this.grains, t, { freq: 1100, type: 'lowpass', amp: 0.045, decay: 0.03 });
    this.#grain(this.grains, t + 0.01, { freq: 2600, Q: 1.2, amp: 0.015, decay: 0.03 });
  }

  /** A fold closing: a faint crisp edge over a small pressed tap. */
  #foldSet(t, energy) {
    this.#grain(this.grains, t, { freq: this.#r(3600, 4600), Q: 2.4, amp: 0.03 * energy, attack: 0.001, decay: 0.012 });
    this.#grain(this.grains, t + 0.004, { freq: 800, type: 'lowpass', amp: 0.028 * energy, attack: 0.002, decay: 0.035 });
  }

  /** A fold lying open: softer, a little longer, more rustle than snap. */
  #foldOpen(t, energy) {
    this.#grain(this.grains, t, { freq: 1100, type: 'lowpass', amp: 0.02 * energy, attack: 0.008, decay: 0.06 });
    this.#grain(this.grains, t + 0.02, { freq: this.#r(1600, 2200), Q: 0.8, amp: 0.012 * energy, attack: 0.02, decay: 0.12 });
  }

  /** Follow one folding piece (0 open → 1 folded): rub and creases while it moves, a set or a settle when it stops. */
  #trackFold(key, v, dt, t) {
    const f = (this.folds[key] ??= { v, rate: 0, dir: 0, peak: 0 });
    const vel = (v - f.v) / dt;
    f.rate += (Math.abs(vel) - f.rate) * 0.25;
    if (Math.abs(vel) > 1e-3) f.dir = Math.sign(vel);
    f.peak = Math.max(f.peak * 0.995, f.rate);
    const energy = 0.6 + 0.4 * Math.min(f.peak / 0.5, 1);
    if (f.v < 0.97 && v >= 0.97) this.#foldSet(t, energy);
    if (f.v > 0.03 && v <= 0.03) this.#foldOpen(t, energy);
    f.v = v;
  }

  /** Every scheduler tick (60 ms): creases, flutter and rustle at the rate things are moving, and grain in the scratch. */
  tick(t0) {
    // folding: tighter, sharper, denser creases closing; softer, wider, sparser opening
    for (const f of Object.values(this.folds)) {
      if (f.rate < 0.02) continue;
      const closing = f.dir > 0;
      const n = Math.floor(f.rate * (closing ? 70 : 45) * 0.06 + Math.random());
      const e = 1.6 * (0.5 + 0.5 * Math.min(f.rate / 0.5, 1));
      for (let i = 0; i < n; i++) {
        const at = t0 + Math.random() * 0.06;
        if (closing) this.#grain(this.grains, at, { freq: this.#r(2200, 4200), Q: 1.6, amp: this.#r(0.012, 0.03) * e, attack: 0.001, decay: this.#r(0.006, 0.018) });
        else this.#grain(this.grains, at, { freq: this.#r(1500, 3000), Q: 0.9, amp: this.#r(0.008, 0.02) * e, attack: 0.004, decay: this.#r(0.02, 0.05) });
      }
    }

    // each ball: creases in proportion to how fast it is crumpling; opening is sparser, softer, lower
    for (const b of this.balls) {
      const closing = b.dir > 0;
      // many small creases rather than a few loud ones: the texture without the spikes
      const n = Math.floor(b.rate * (closing ? 300 : 190) * 0.06 + Math.random());
      const loud = 2.2 * (0.5 + 0.5 * Math.min(b.rate / 0.35, 1)) * b.near * (closing ? 1 : 0.65);
      for (let i = 0; i < n; i++) {
        const at = t0 + Math.random() * 0.06;
        this.#grain(this.grains, at, { freq: this.#r(closing ? 2200 : 1700, closing ? 6000 : 4200), Q: 0.9, amp: this.#r(0.012, 0.04) * loud, attack: 0.004, decay: this.#r(0.008, 0.03) });
        if (Math.random() < 0.15) this.#grain(this.grains, at, { freq: this.#r(900, 1500), Q: 0.8, amp: 0.02 * loud, attack: 0.004, decay: 0.04 });
      }
    }

    // aeroplane flutter: irregular light ticks of the sheet in the airstream, denser with speed,
    // a little stronger when banked
    const fl = this.flight;
    if (fl.level > 0.002) {
      const n = Math.floor(fl.rate * 0.06 + Math.random());
      for (let i = 0; i < n; i++) {
        this.#grain(this.airOut, t0 + Math.random() * 0.06, { freq: this.#r(2600, 5200), Q: 1.3, amp: fl.level * this.#r(0.5, 1) * (1 + 0.8 * fl.bank), attack: 0.001, decay: this.#r(0.005, 0.014) });
      }
    }

    // hover: brushing, edge flutters, ticks and slides from the paper drawing in, at a rate that
    // follows how much of it is moving; scheduled as separate events, so it fades in and out
    // with the hover and nothing is cut off
    const rs = this.rustle;
    const lambda = rs.hover * (2.5 + 9 * rs.activity);
    let n = 0;
    for (let p = lambda * 0.06; p > 0; p -= 1) if (Math.random() < Math.min(p, 1)) n++;
    for (let i = 0; i < n; i++) {
      const at = t0 + Math.random() * 0.06;
      // sits roughly 10–15 dB under the writing
      const a = 0.55 * rs.hover * (0.6 + 0.4 * rs.activity);
      const kind = Math.random();
      if (kind < 0.35) this.#grain(this.grains, at, { freq: this.#r(1000, 2400), Q: 0.7, amp: this.#r(0.008, 0.018) * a, attack: this.#r(0.01, 0.03), decay: this.#r(0.06, 0.14) });
      else if (kind < 0.6) {
        for (let k = 0; k < 3; k++) this.#grain(this.grains, at + k * this.#r(0.018, 0.03), { freq: this.#r(3000, 5000), Q: 1.4, amp: this.#r(0.005, 0.012) * a, attack: 0.001, decay: 0.008 });
      } else if (kind < 0.85) this.#grain(this.grains, at, { freq: this.#r(4000, 6500), type: 'highpass', amp: this.#r(0.004, 0.01) * a, attack: 0.001, decay: 0.006 });
      else this.#grain(this.grains, at, { freq: this.#r(1300, 2000), Q: 0.6, amp: this.#r(0.006, 0.012) * a, attack: 0.04, decay: this.#r(0.18, 0.3) });
    }
    // edge flicks riding on the reorganisation
    const flicks = Math.floor(rs.move * 28 * 0.06 + Math.random());
    for (let i = 0; i < flicks; i++) this.#grain(this.grains, t0 + Math.random() * 0.06, { freq: this.#r(2800, 5200), Q: 1.3, amp: this.#r(0.008, 0.02) * rs.move, attack: 0.001, decay: this.#r(0.006, 0.016) });
    // now and then, when much of the paper moves together, a slightly fuller rustle
    if (rs.hover > 0.5 && rs.activity > 0.5 && Math.random() < 0.02) {
      for (let k = 0; k < 4; k++) this.#grain(this.grains, t0 + k * this.#r(0.03, 0.06), { freq: this.#r(1500, 3200), Q: 0.8, amp: this.#r(0.015, 0.025) * rs.hover, attack: 0.008, decay: this.#r(0.05, 0.1) });
    }

    if (!this.pen) return;
    this.scratchBand.frequency.setTargetAtTime(2300 + 1100 * this.speed + this.#r(-250, 250), t0, 0.03);
    if (Math.random() < 0.18) this.#grain(this.taps, t0 + Math.random() * 0.05, { freq: this.#r(3500, 5500), Q: 2, amp: this.#r(0.008, 0.018), decay: 0.01 });
  }

  /** Every frame: follow the station's state and fire the sounds of what just happened. */
  update(el, camera, right) {
    const now = this.ctx.currentTime;
    const t = now + 0.02;
    const p = this.prev;
    const fk = el.focusK ?? 0;
    const dtf = Math.max(now - (p.frameT ?? now), 1e-3);
    p.frameT = now;

    // stylus: contact, speed, lift
    const pen = WRITING.includes(el.mode);
    if (p.tip && now > p.t) {
      const v = el.tipPos.distanceTo(p.tip) / (now - p.t);
      this.speed += (Math.min(v / 0.6, 1) - this.speed) * 0.2;
    }
    p.tip = (p.tip ?? el.tipPos.clone()).copy(el.tipPos);
    p.t = now;
    if (pen && !p.pen) this.#contact(t);
    if (!pen && p.pen) this.#lift(t);
    p.pen = this.pen = pen;
    // focused on the page, the writing is at its most intimate
    const scratch = pen ? (0.18 + 0.26 * this.speed) * (1 + 0.15 * fk) : 0;
    this.scratch.gain.setTargetAtTime(scratch, now, pen ? 0.025 : 0.05);

    // the paper layer quietens while the page is being read
    this.paper.gain.setTargetAtTime(1 - 0.65 * fk, now, 0.4);
    this.bed.gain.setTargetAtTime(0.03 * (1 - 0.4 * fk), now, 0.6);

    // slips peel off their margin and settle back
    el.slips?.forEach((s, i) => {
      const a = s.a ?? 0, was = p.slips[i] ?? a;
      if (was < 0.06 && a >= 0.06) this.#peel(t);
      if (was > 0.04 && a <= 0.04) this.#settle(t);
      p.slips[i] = a;
    });

    const paper = el.paper;
    if (!paper) return;
    const pl = paper.plane;

    // folding pieces: the note folding into an aeroplane and opening again, the small letter
    this.#trackFold('plane', pl.fold ?? 0, dtf, t);
    this.#trackFold('letter', paper.mini.k ?? 1, dtf, t);
    let rub = 0, closing = 0;
    for (const f of Object.values(this.folds)) {
      const r = Math.min(f.rate / 0.5, 1) * (f.dir > 0 ? 1 : 0.7);
      rub += r;
      if (f.dir > 0) closing += r;
    }
    this.foldRub.gain.setTargetAtTime(0.5 * Math.min(rub, 1), now, 0.08);
    this.foldBand.frequency.setTargetAtTime(closing > rub * 0.5 ? 1900 : 1250, now, 0.1);
    if (p.flying && !pl.flying) this.#settle(t);
    p.flying = pl.flying;

    // crumpled balls: follow how fast each one is crumpling or opening, and how near it is
    let body = 0;
    paper.balls.forEach((b, i) => {
      const k = b.k ?? 1;
      const s = (this.balls[i] ??= { k, rate: 0, dir: 0, near: 0 });
      const v = (k - s.k) / dtf;
      s.k = k;
      s.rate += (Math.abs(v) - s.rate) * 0.15;
      if (Math.abs(v) > 1e-4) s.dir = Math.sign(v);
      const dist = b.mesh.getWorldPosition((this._w ??= b.mesh.position.clone())).distanceTo(camera.position);
      s.near = Math.pow(Math.max(0, 1 - dist / 24), 1.2);
      body += Math.min(s.rate / 0.35, 1) * s.near * (s.dir > 0 ? 1 : 0.6);
    });
    this.crumpleBody.gain.setTargetAtTime(1.14 * Math.min(body, 1), now, 0.12);

    // the aeroplane: a small sheet moving through air, louder only when fast and close
    const pw = pl.mesh.getWorldPosition((this._pw ??= pl.mesh.position.clone()));
    const toPlane = (this._tp ??= pw.clone()).subVectors(pw, camera.position);
    const pd = toPlane.length();
    toPlane.divideScalar(pd || 1);
    const speedN = Math.min((pl.speed ?? 0) / 1.8, 1);
    const near = Math.pow(Math.max(0, 1 - pd / 13), 2.2);
    const airLevel = pl.flying ? Math.pow(speedN, 1.5) * near * (1 - 0.5 * fk) : 0;
    // about +3.5 dB at 6 units, +5.5 dB at 4, more right alongside; nothing added far away
    const presence = 1 + 2 * near;
    this.air.gain.setTargetAtTime(0.07 * airLevel * presence, now, 0.12);
    this.flight.level = 0.05 * airLevel * presence;
    this.flight.rate = 10 + 26 * speedN;
    this.flight.bank = Math.min(Math.abs(pl.roll ?? 0) / 0.5, 1);
    this.airPan.pan.setTargetAtTime(Math.max(-1, Math.min(1, toPlane.dot(right) * 0.9)), now, 0.1);

    // hover: how much loose paper is moving right now (smoothed), and how hovered the station is
    let moved = 0, count = 0;
    const track = (m) => {
      const q = this.moving.get(m) ?? m.position.clone();
      moved += Math.min(q.distanceTo(m.position) / dtf / 0.6, 1);
      count++;
      this.moving.set(m, q.copy(m.position));
    };
    for (const b of paper.balls) track(b.mesh);
    for (const s of paper.strips) track(s.mesh);
    for (const s of paper.scraps) track(s.mesh);
    track(paper.mini.mesh);
    el.slips?.forEach((s) => track(s.mesh));
    this.rustle.activity += ((count ? moved / count : 0) * 1.6 - this.rustle.activity) * Math.min(1, dtf * 2);
    this.rustle.activity = Math.min(this.rustle.activity, 1);
    const hk = el.hoverK ?? 0;
    // reorganisation: how fast the hover state is changing (it drives the pull-in and the release),
    // plus loose-paper movement above its recent baseline; gathering in is fuller than letting go
    const hv = (hk - (p.hk ?? hk)) / dtf;
    p.hk = hk;
    if (p.baseSet) this.rustle.base += (this.rustle.activity - this.rustle.base) * Math.min(1, dtf * 0.25);
    else (this.rustle.base = this.rustle.activity), (p.baseSet = true);
    // the extra paper movement only counts around a hover change, so ordinary drifting never
    // sounds like a reorganisation
    const change = Math.min(1, Math.abs(hv) / 2.2);
    this.rustle.trans = Math.max((this.rustle.trans ?? 0) * Math.exp(-dtf / 1.2), change);
    const excess = Math.max(0, this.rustle.activity - this.rustle.base - 0.05) * this.rustle.trans;
    const move = Math.min(1, Math.max(change, excess * 2.5)) * (hv < -0.05 ? 0.6 : 1) * (1 - fk);
    // quick to rise, slower to settle
    this.rustle.move += (move - this.rustle.move) * Math.min(1, dtf * (move > this.rustle.move ? 8 : 2.2));
    const mv = this.rustle.move;
    this.moveRush.gain.setTargetAtTime(0.55 * mv, now, 0.05);
    this.moveFlutter.gain.setTargetAtTime(0.27 * mv, now, 0.05);
    this.moveBand.frequency.setTargetAtTime(900 + 700 * mv, now, 0.1);
    this.rustle.hover = hk;

    this.level = { air: airLevel, crumple: body, rub, hover: this.rustle.hover, activity: this.rustle.activity, move: this.rustle.move };
  }
}
