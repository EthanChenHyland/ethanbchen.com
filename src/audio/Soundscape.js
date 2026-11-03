import * as THREE from 'three';
import { ResumeSound } from './ResumeSound.js';

/**
 * Fully procedural ambience (no audio files): the self-writing
 * document at Resume (see ResumeSound), and for now the original water and earth
 * voices at the stations that still run those elements. Each station has its
 * own bus whose gain and stereo pan follow the camera.
 */
export class Soundscape {
  constructor(app) {
    this.app = app;
    this.ctx = null;
    this.enabled = false;
    this.timer = null;
    this._v = new THREE.Vector3();
    this._right = new THREE.Vector3();
  }

  async enable() {
    this.wanted = true;
    if (!this.ctx) this.#build();
    await this.ctx.resume();
    if (!this.wanted) return; // switched off again while resuming
    this.enabled = true;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0.85, now, 0.6);
    clearInterval(this.timer);
    this.timer = setInterval(() => this.#schedule(), 60);
  }

  disable() {
    this.wanted = false;
    this.enabled = false;
    clearInterval(this.timer);
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0, now, 0.15);
    // stop the audio graph entirely once faded, so "off" costs no CPU or battery
    setTimeout(() => {
      if (!this.wanted && this.ctx.state === 'running') this.ctx.suspend();
    }, 900);
  }

  #noise(kind, seconds = 4) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else {
        // pink (Paul Kellet)
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
    return buf;
  }

  #loop(buffer) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.loopStart = 0;
    src.start(0, Math.random() * buffer.duration);
    return src;
  }

  #filter(type, freq, Q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = Q;
    return f;
  }

  #gain(v) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  #lfo(freq, depth, target, type = 'sine') {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.#gain(depth);
    o.connect(g).connect(target);
    o.start();
    return o;
  }

  #build() {
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = this.#gain(0);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    this.white = this.#noise('white');
    const brown = this.#noise('brown');
    const pink = this.#noise('pink');

    this.bus = {};
    this.pan = {};
    for (const id of ['resume', 'experience', 'projects', 'profile']) {
      const g = this.#gain(0);
      const p = ctx.createStereoPanner();
      g.connect(p).connect(this.master);
      this.bus[id] = g;
      this.pan[id] = p;
    }

    // ---- resume: stylus on paper and the paper around it ----
    this.resume = new ResumeSound(ctx, this.bus.resume, { white: this.white, pink, brown }, this.master);

    // ---- projects (the console): silent until its own voice exists; Air's wind went with the vortex ----

    // ---- experience, still the water placeholder: babbling band-pass + scheduled droplet "bloops" ----
    this.babble = this.#filter('bandpass', 700, 3.5);
    const babbleGain = this.#gain(0.32);
    this.#loop(pink).connect(this.babble).connect(babbleGain).connect(this.bus.experience);
    this.drops = this.#gain(0.5);
    this.drops.connect(this.bus.experience);

    // ---- earth: deep rumble + occasional stone knocks ----
    const rumbleGain = this.#gain(0.9);
    this.#loop(brown).connect(this.#filter('lowpass', 95, 0.9)).connect(rumbleGain).connect(this.bus.profile);
    this.#lfo(0.06, 0.35, rumbleGain.gain);
    this.knocks = this.#gain(0.5);
    this.knocks.connect(this.bus.profile);

    // The original Opus hub drone (four oscillators at 55, 82.4, 110.3 and 164.8 Hz) is not built:
    // it read as a constant hum. The hub's ambience will be designed once all four stations exist.
  }

  #burst(out, when, { freq, type = 'highpass', Q = 0.7, amp, decay, dur = 0.12 }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const f = this.#filter(type, freq, Q);
    const g = this.#gain(0);
    src.connect(f).connect(g).connect(out);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(amp, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0008, when + decay);
    src.start(when, Math.random() * 3, dur);
    src.stop(when + dur + 0.05);
  }

  #schedule() {
    if (!this.enabled) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.05;
    this.resume.tick(t0);
    // water babble wanders
    this.babble.frequency.setTargetAtTime(350 + Math.random() * 900, t0, 0.04);
    if (Math.random() < 0.18) {
      const o = ctx.createOscillator();
      const g = this.#gain(0);
      const f0 = 480 + Math.random() * 700;
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(f0 * (1.6 + Math.random() * 0.6), t0 + 0.07);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.12, t0 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.11);
      o.connect(g).connect(this.drops);
      o.start(t0);
      o.stop(t0 + 0.14);
    }
    // earth knocks
    if (Math.random() < 0.025) {
      this.#burst(this.knocks, t0, { freq: 180 + Math.random() * 120, type: 'lowpass', Q: 2, amp: 0.8, decay: 0.16, dur: 0.2 });
    }
  }

  /** Mix buses from the camera's position relative to each element. */
  update(camera, elements, focused) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    this._right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    // Resume sits about 2 dB under its earlier level (0.9): present, not dominant
    const base = { resume: 0.72, experience: 0.85, projects: 0.75, profile: 0.8 };
    for (const el of elements) {
      const id = el.def.id;
      if (id === 'resume') this.resume.update(el, camera, this._right);
      el.group.getWorldPosition(this._v);
      this._v.y += 2.2;
      const d = this._v.distanceTo(camera.position);
      // Resume's writing is quiet by nature, so its falloff is gentler: still positional, but it
      // carries to the overview and fades out across the hub
      let g = id === 'resume' ? Math.pow(THREE.MathUtils.clamp(1.3 - d / 20, 0, 1), 1.6) : THREE.MathUtils.clamp(1.3 - d / 17, 0, 1) ** 2;
      g *= base[id] * (focused && focused !== id ? 0.55 : 1) * (id === 'resume' && focused === id ? 1.35 : 1);
      this.bus[id].gain.setTargetAtTime(g, now, 0.3);
      const dir = this._v.sub(camera.position).normalize();
      this.pan[id].pan.setTargetAtTime(THREE.MathUtils.clamp(dir.dot(this._right) * 0.85, -1, 1), now, 0.3);
    }
  }
}
