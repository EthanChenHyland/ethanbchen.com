import * as THREE from 'three';
import { ELEMENTS, stationPosition } from './config.js';
import { createNoise3DTexture, createNoise2DTexture } from './gl/noise.js';
import { Sky } from './world/Sky.js';
import { Lighting } from './world/Lighting.js';
import { Platform } from './world/Platform.js';
import { Motes } from './world/Motes.js';
import { PostFX } from './fx/PostFX.js';
import { CameraRig } from './core/CameraRig.js';
import { Resume } from './elements/Resume.js';
import { Water } from './elements/Water.js';
import { Projects } from './elements/Projects.js';
import { Earth } from './elements/Earth.js';

// Resume replaces Fire and Projects (the Threshold Console) replaces Air; Experience and Profile
// still run the original Water and Earth elements as placeholders.
const ELEMENT_CLASSES = { resume: Resume, projects: Projects, experience: Water, profile: Earth };
const UP = new THREE.Vector3(0, 1, 0);

const QUALITY = {
  low: { dpr: 1.0, volumeSteps: 24, shadowSize: 1024, fibers: 160, grass: 1800, leaves: 1200, ribbons: 60 },
  medium: { dpr: 1.5, volumeSteps: 32, shadowSize: 2048, fibers: 260, grass: 2800, leaves: 1900, ribbons: 80 },
  high: { dpr: 2.0, volumeSteps: 40, shadowSize: 2048, fibers: 340, grass: 3800, leaves: 2600, ribbons: 110 },
};

export const OVERVIEW = {
  pos: new THREE.Vector3(0, 7.4, 16.8),
  target: new THREE.Vector3(0, 2.3, 0),
};

// Idle overview recomposition. The intro settles at OVERVIEW (about 17° above horizontal, 17.56
// from its target). A camera left higher than 38° up drifts down to 30°, the highest view at which
// the upright Resume page still reads as a standing document; a distance more than about ±16%
// off the overview's drifts back to it. Both move at about the orbit's own pace (it turns ~2°/s).
// Views inside those limits are left as placed, apart from a barely perceptible breathing.
const RECOMPOSE = {
  trigger: THREE.MathUtils.degToRad(38),
  elevation: THREE.MathUtils.degToRad(30),
  radius: OVERVIEW.pos.distanceTo(OVERVIEW.target),
  deadZone: 0.15,
  elevRate: THREE.MathUtils.degToRad(2), // per second, at most
  radiusRate: 0.045, // log-distance per second, at most
  // the idle orbit's slow cinematic breathing: about ±3.5° of elevation and ±6% of distance around
  // wherever the view sits, never above the trigger or below 9°
  breathElev: THREE.MathUtils.degToRad(3.5),
  breathRadius: 0.06,
  floor: THREE.MathUtils.degToRad(9),
};

// The same recomposition while a station is focused, around its own settled focus view: a camera
// left more than `trigger` above it, or well outside the dead zone in distance, drifts back to it.
// Resume: about 20° up, the standing page stops reading as a page. Projects (the console): the
// screen tilts back and stays readable to about 30° absolute, after which the brow covers it; its
// focus view is closer, and it reads well down to ~0.8× that distance, so its dead zone is a little
// wider. Profile and Experience (still placeholders) use a generic 22° limit.
// Every focused station breathes once its focus orbit runs. Resume only a little (its paper life
// reads the camera's own displacement, which this barely adds to); Profile and Experience are still
// placeholders and get a conservative generic breath.
const D = THREE.MathUtils.degToRad;
const FOCUS_RECOMPOSE = {
  resume: { trigger: D(20), breathElev: D(0.8), breathRadius: 0.022, floor: D(2.5) },
  profile: { trigger: D(22), deadZone: 0.18, breathElev: D(1.8), breathRadius: 0.045, floor: D(2.5) },
  experience: { trigger: D(22), deadZone: 0.18, breathElev: D(1.8), breathRadius: 0.045, floor: D(2.5) },
  // the console's focus orbit (radius ~10.4) would pass through Resume's page (8.5 away, at -90°
  // round the console) and Experience (180°): its idle orbit keeps to the arc between them, easing
  // to a stop and turning back at either end (azimuth round the station, from +z toward +x)
  projects: { trigger: D(24), deadZone: 0.2, breathElev: D(2.2), breathRadius: 0.05, floor: D(2), orbitWindow: [D(-62), D(150)] },
};

// The idle orbit's own pace varies slowly (two long periods), so the exhibition camera lingers and
// moves on rather than turning like a turntable; Resume's focused orbit varies least.
function orbitPace(time, focused) {
  const base = focused ? 0.5 : 0.28;
  const depth = focused === 'resume' ? 0.12 : 0.3;
  return base * (1 + depth * (0.65 * Math.sin((time * Math.PI * 2) / 67) + 0.35 * Math.sin((time * Math.PI * 2) / 103 + 1.7)));
}

export class App {
  constructor(canvas, { onProgress } = {}) {
    this.canvas = canvas;
    this.params = new URLSearchParams(location.search);
    const qName = this.params.get('q') ?? 'high';
    this.quality = { name: qName, ...(QUALITY[qName] ?? QUALITY.high) };
    this.onProgress = onProgress ?? (() => {});
    this.focused = null;
    this.frames = 0;
    this.time = parseFloat(this.params.get('t') ?? '0');
    this.frozen = this.params.has('freeze');
    this.listeners = new Set();
    this.autoOrbit = true;
    this.idle = 0;
    this.hovered = null;
    this.fade = 0;
    this.introActive = false;
    this.sound = null;
  }

  /** Any user activity: stop the idle auto-orbit (and let the intro be skipped). */
  poke() {
    this.idle = 0;
    if (this.rig) this.rig.controls.autoRotate = false;
    if (this.introActive) {
      this.introActive = false;
      this.rig.cancel();
    }
  }

  intro() {
    this.introActive = true;
    this.fade = 1;
    this.rig.jumpTo(new THREE.Vector3(-21, 15, 27), new THREE.Vector3(0, 3.2, 0));
    this.rig.flyTo(OVERVIEW.pos, OVERVIEW.target, {
      duration: 6.0,
      arc: 0,
      onDone: () => (this.introActive = false),
    });
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(evt) {
    for (const fn of this.listeners) fn(evt);
  }

  async init() {
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.quality.dpr);
    renderer.setPixelRatio(this.dpr);
    // refraction through water doesn't need a full-resolution copy of the scene
    renderer.transmissionResolutionScale = 0.6;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x1d2233, 0.0115);
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 900);
    this.camera = camera;

    await this.#progress('Weaving noise', 0.1);
    const noise3D = createNoise3DTexture(64);
    await this.#progress('Weaving noise', 0.3);
    const noise2D = createNoise2DTexture(256);

    this.uniforms = {
      uTime: { value: this.time },
      uPixelRatio: { value: this.dpr },
      uPointScale: { value: 1000 },
      uStGlow: { value: [0, 0, 0, 0] },
    };
    this.ctx = { renderer, scene, camera, noise3D, noise2D, uniforms: this.uniforms, quality: this.quality, app: this };

    await this.#progress('Laying the platform', 0.4);
    const bare = this.params.has('bare'); // debug: element only, no world
    this.sky = new Sky(this.ctx);
    if (!bare) scene.add(this.sky.group);
    this.lighting = new Lighting(this.ctx);
    scene.add(this.lighting.group);
    this.platform = new Platform(this.ctx);
    if (!bare) scene.add(this.platform.group);
    this.motes = new Motes(this.ctx);
    if (!bare) scene.add(this.motes.points);

    const only = this.params.get('only');
    this.elements = [];
    let p = 0.5;
    for (const def of ELEMENTS) {
      if (only && only !== def.id) continue;
      await this.#progress(`Building ${def.name.toLowerCase()}`, p);
      p += 0.1;
      const el = new ELEMENT_CLASSES[def.id](this.ctx, def);
      el.def = def;
      // eased 0..1 hover and focus amounts, for stations that respond to them
      el.hoverK = 0;
      el.focusK = 0;
      scene.add(el.group);
      this.elements.push(el);
    }
    this.hitTargets = this.elements.map((e) => e.hit);

    this.post = new PostFX(this.ctx);
    this.rig = new CameraRig(camera, this.canvas);

    this.#resize();
    window.addEventListener('resize', () => this.#resize());

    // initial view
    const focus = this.params.get('focus');
    if (focus && this.elements.find((e) => e.def.id === focus)) {
      const v = this.focusView(focus);
      this.rig.jumpTo(v.pos, v.target);
      this.rig.setLimits('focus');
      this.focused = focus;
      this.elements.find((e) => e.def.id === focus).focusK = 1;
    } else if (this.params.has('cam')) {
      const c = this.params.get('cam').split(',').map(Number);
      const t = (this.params.get('tgt') ?? '0,1.5,0').split(',').map(Number);
      this.rig.jumpTo(new THREE.Vector3(...c), new THREE.Vector3(...t));
    } else if (this.params.has('nointro')) {
      this.rig.jumpTo(OVERVIEW.pos, OVERVIEW.target);
    } else {
      this.rig.jumpTo(OVERVIEW.pos, OVERVIEW.target);
      this.wantsIntro = true;
    }

    await this.#progress('Compiling shaders', 0.9);
    try {
      await renderer.compileAsync(scene, camera);
    } catch (e) {
      console.warn('compileAsync failed', e);
    }
    this.#adaptive = { acc: 0, n: 0, cooldown: 3 };
    this.last = performance.now();
    if (this.wantsIntro) this.intro();
    renderer.setAnimationLoop(() => this.#tick());
    await this.#progress('Ready', 1);
    window.__app = this;
  }

  async #progress(label, value) {
    this.onProgress(label, value);
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  }

  #adaptive;

  #resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the composition on narrow (portrait) screens
    this.camera.fov = w / h < 1 ? 58 : 40;
    this.camera.updateProjectionMatrix();
    this.post.setSize(w, h, this.dpr);
    this.uniforms.uPixelRatio.value = this.dpr;
    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    this.uniforms.uPointScale.value = (h * this.dpr) / (2 * Math.tan(fovRad / 2));
  }

  /**
   * A focused station whose idle orbit must keep to an arc (see FOCUS_RECOMPOSE): returns the orbit's
   * signed pace factor, which eases through zero to turn back at either end of the arc, and heads
   * back into it if the user has left the view outside. Manual control is never constrained.
   */
  #orbitWindow(c, dt) {
    const win = FOCUS_RECOMPOSE[this.focused]?.orbitWindow;
    const o = (this._orbitW ??= { dir: 1, k: 1, sign: -1, az: null, id: null, dwell: 0 });
    if (o.id !== this.focused) Object.assign(o, { dir: 0, k: 1, az: null, id: this.focused, dwell: 0 });
    if (!win || !c.autoRotate || this.rig.busy) {
      o.az = null;
      return win ? o.k : 1;
    }
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const off = (this._owOff ??= new THREE.Vector3());
    off.subVectors(this.camera.position, c.target);
    const az = Math.atan2(off.x, off.z);
    const vel = o.az === null ? 0 : wrap(az - o.az);
    o.az = az;
    // learn which way a positive pace turns the azimuth
    if (Math.abs(vel) > 1e-5 && Math.abs(o.k) > 0.2) o.sign = Math.sign(vel) * Math.sign(o.k);
    const mid = (win[0] + win[1]) / 2, half = (win[1] - win[0]) / 2;
    const rel = wrap(az - mid);
    // direction of travel in azimuth: kept, or (first time, or left outside the arc) toward its middle
    if (o.dir === 0) o.dir = Math.abs(rel) > half - 0.05 ? -Math.sign(rel) : Math.sign(vel) || o.sign;
    if (Math.abs(rel) > half) o.dir = -Math.sign(rel);
    // how much arc is left ahead: the pace eases out over the last ~28° (a long soft deceleration),
    // rests almost still at the apex for about a second, then accelerates away the other way
    const ahead = o.dir > 0 ? half - rel : half + rel;
    const D = THREE.MathUtils.degToRad;
    const ease = THREE.MathUtils.smoothstep(ahead, D(1.5), D(28));
    if (ahead < D(3) && Math.abs(o.k) < 0.06) {
      o.dwell += dt;
      if (o.dwell > 1.1) (o.dir = -o.dir), (o.dwell = 0);
    } else o.dwell = 0;
    const want = o.dir * o.sign * ease;
    o.k += (want - o.k) * Math.min(1, dt * 1.1);
    return o.k;
  }

  /** Recomposition settings for a focused station, referenced to its own settled focus view. */
  #focusRecompose(id) {
    this._focusRecomp ??= {};
    return (this._focusRecomp[id] ??= (() => {
      const v = this.focusView(id);
      const radius = v.pos.distanceTo(v.target);
      const elevation = Math.asin((v.pos.y - v.target.y) / radius);
      const own = FOCUS_RECOMPOSE[id];
      return { ...RECOMPOSE, deadZone: own.deadZone ?? RECOMPOSE.deadZone, elevation, radius, trigger: elevation + own.trigger, breathElev: own.breathElev ?? 0, breathRadius: own.breathRadius ?? 0, floor: own.floor ?? 0.05 };
    })());
  }

  focusView(id) {
    const def = ELEMENTS.find((d) => d.id === id);
    const S = stationPosition(def);
    const v = def.view;
    // camera outside the ring looking in: the sanctum and the other elements form the backdrop
    const dir = new THREE.Vector3(S.x, 0, S.z).normalize().applyAxisAngle(UP, v.swing);
    const pos = S.clone().addScaledVector(dir, v.distance);
    pos.y = v.height;
    const target = S.clone();
    target.y = v.targetY;
    return { pos, target };
  }

  focus(id) {
    this.introActive = false; // a new flight supersedes the intro
    if (id === 'all') id = null;
    const same = id === this.focused; // re-selecting the current view resets the framing
    if (id) {
      // re-selecting the focused station reframes it; let the station respond to the attention too
      if (same) this.elements.find((e) => e.def.id === id)?.onReframe?.();
      const v = this.focusView(id);
      this.rig.setLimits('focus');
      this.rig.flyTo(v.pos, v.target, { duration: same ? 1.4 : 2.4, arc: same ? 0.3 : this.focused ? 2.2 : 1.2 });
      this.focused = id;
    } else {
      this.rig.setLimits('overview');
      this.rig.flyTo(OVERVIEW.pos, OVERVIEW.target, {
        duration: same ? 1.6 : 2.4,
        arc: same ? 0.4 : 1.5,
      });
      this.focused = null;
    }
    this.emit({ type: 'focus', id: this.focused, same });
  }

  pick(ndc) {
    this._ray ??= new THREE.Raycaster();
    this._ray.setFromCamera(ndc, this.camera);
    const hit = this._ray.intersectObjects(this.hitTargets, false)[0];
    return hit ? hit.object.userData.elementId : null;
  }

  #tick() {
    const now = performance.now();
    const rawDt = (now - this.last) / 1000;
    this.last = now;
    const dt = Math.min(rawDt, 1 / 20);
    if (!this.frozen) this.time += dt;
    this.uniforms.uTime.value = this.time;

    // a pixel-ratio change from #adapt is applied here, before this frame renders:
    // resizing the canvas after drawing clears the frame the browser is about to show
    if (this.pendingResize) {
      this.pendingResize = false;
      this.#resize();
    }

    this.idle += dt;
    const c = this.rig.controls;
    if (this.autoOrbit && this.idle > 7 && !this.rig.busy && !c.autoRotate) c.autoRotate = true;
    if (!this.autoOrbit) c.autoRotate = false;
    c.autoRotateSpeed = orbitPace(this.time, this.focused) * this.#orbitWindow(c, dt);
    // a camera left looking almost straight down spirals back to a readable height, but only while
    // the idle overview orbit runs (any input stops auto-rotate, and with it this)
    if (c.autoRotate && !this.focused && !this.rig.busy && !this.introActive) this.rig.recompose(dt, RECOMPOSE);
    else if (c.autoRotate && FOCUS_RECOMPOSE[this.focused] && !this.rig.busy) this.rig.recompose(dt, this.#focusRecompose(this.focused));
    else this.rig.endRecompose();
    this.fade = Math.max(0, this.fade - dt * 0.55);
    this.post.finish.uniforms.uFade.value = this.fade * this.fade;

    this.rig.update(dt);
    this.sky.update(this.camera);
    this.platform.update(this.time);
    this.motes.update(this.time);

    // station highlight (hover + focus)
    const glow = this.uniforms.uStGlow.value;
    ELEMENTS.forEach((d, i) => {
      const target = d.id === this.focused ? 1 : d.id === this.hovered ? 0.6 : 0;
      glow[i] += (target - glow[i]) * Math.min(1, dt * 4);
    });
    for (const el of this.elements) {
      const u = el.pedestal?.material.userData.uniforms;
      if (u) u.uGlow.value = glow[ELEMENTS.indexOf(el.def)];
      const id = el.def.id;
      el.hoverK += ((id === this.hovered && id !== this.focused ? 1 : 0) - el.hoverK) * Math.min(1, dt * 3);
      // slower than the glow so a station's focus change plays out across the camera flight
      el.focusK += ((id === this.focused ? 1 : 0) - el.focusK) * Math.min(1, dt * 1.4);
    }

    // heat haze only follows a station that provides a source; the pass itself always runs
    let hazy = null;
    for (const el of this.elements) {
      el.update(this.time, dt, this.camera);
      if (el.hazeBase) hazy = el;
    }
    if (hazy) this.post.setHazeSource(hazy.hazeBase, hazy.hazeTop, 1.0);
    else this.post.setHazeSource(this._zero ??= new THREE.Vector3(), this._zero, 0);

    this.sound?.update(this.camera, this.elements, this.focused);
    this.post.render(this.time, dt);
    this.frames++;
    window.__frames = this.frames;
    this.#adapt(rawDt);
    this.emit({ type: 'frame', dt: rawDt });
  }

  #adapt(rawDt) {
    if (this.params.has('noadapt')) return;
    const a = this.#adaptive;
    // hitches from hidden tabs, sleep or window drags say nothing about GPU load
    if (rawDt > 0.1 || document.hidden) {
      a.acc = 0;
      a.n = 0;
      a.cooldown = Math.max(a.cooldown, 1);
      return;
    }
    if (a.cooldown > 0) {
      a.cooldown -= rawDt;
      return;
    }
    a.acc += rawDt;
    a.n++;
    if (a.n >= 90) {
      const avg = a.acc / a.n;
      a.acc = 0;
      a.n = 0;
      if (avg > 1 / 48 && this.dpr > 1.0) {
        this.dpr = Math.max(1.0, this.dpr - 0.25);
        this.pendingResize = true;
        a.cooldown = 2;
        console.info(`[elements] frame time ${(avg * 1000).toFixed(1)}ms → pixel ratio ${this.dpr}`);
      }
    }
  }
}
