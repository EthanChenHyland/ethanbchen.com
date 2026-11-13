import * as THREE from 'three';
import { createPedestal } from '../world/Platform.js';
import { PEDESTAL_TOP, stationPosition } from '../config.js';
import { buildBodyGeometry, buildStructureGeometry, BONE, BONES, HUMAN_HEIGHT, FIGURE_SCALE } from './ProfileBody.js';
import { createSkeleton, Rig, wrap, D } from './ProfileRig.js';
import { bodyMaterial, structureMaterial, Ghost, PoseHistory, Cloud, MATERIALS } from './ProfilePhase.js';
import { Models } from './ProfileModels.js';
import { Label } from './ProfileLabel.js';
import { Activities, maskOf } from './ProfileActivities.js';
import { Shell } from './ProfileShell.js';
import { FX } from './ProfileFX.js';
import { Orbits } from './ProfileOrbits.js';

// Profile: the person behind the work, alive in the hub.
//
// A luminous, stylised person (the profile icon grown into a full body) who actually does the things
// the person does: plays quick chess, plays piano and clarinet, works with many AI models, and
// passes between being a body and being information while it thinks (layers, cells, a
// constellation, echoes of itself, candidate selves). Around it, the models it works with form an
// intelligence field. It knows where the viewer is: the head turns
// first, the torso follows, the feet re-step; it never spins.

const S = FIGURE_SCALE;
const PLATE_Y = PEDESTAL_TOP + 0.025;
const clamp = THREE.MathUtils.clamp;
const smoothstep = THREE.MathUtils.smoothstep;
const lerp = THREE.MathUtils.lerp;
const pulseS = (t, a, b, c, d) => smoothstep(t, a, b) * (1 - smoothstep(t, c, d));
const driftCurve = (d, from, to, k) => smoothstep(d, from, from + 2) * Math.pow(clamp((d - from) / (to - from), 0, 1), k);
const NB = BONES.length;
const _tmpV = new THREE.Vector3(), _tmpV2 = new THREE.Vector3();
// the stage: a wider dark-glass plate over the pedestal, reaching toward the side the overview sees
// one canonical origin: the figure's focus home, the stage rings and the field centre sit on the
// pedestal's centre (the figure may still step aside in the overview to stay visible)
const STAGE = { x: 0, z: 0, r: 2.05 };
const _white = new THREE.Color(1, 1, 1);
/** Smooth irregular drift in -1..1: three unrelated sines, so nothing reads as a single oscillation. */
const wob = (t, a, b, c, s) => 0.5 * Math.sin(t * a + s) + 0.3 * Math.sin(t * b + s * 1.7) + 0.2 * Math.sin(t * c + s * 2.9);

// review states (?fstate=), with ?fmat=a|b|c for the material and ?flabel=a|b|c|d for the name
const STATES = {
  neutral: { still: true },
  // the primary quality test: no activities, no foreground models, no strong phasing
  'neutral-only': { quiet: true },
  hover: { hover: 1 },
  'focus-turn': {},
  'phase-echo': { still: true, gesture: true, phase: 'echo' },
  'phase-slice': { still: true, phase: 'slice' },
  'phase-const': { still: true, phase: 'const' },
  'phase-cell': { still: true, phase: 'cell' },
  'phase-combo': { still: true, gesture: true, phase: 'combo' },
  chess: { mode: 'chess' },
  'chess-setup': { mode: 'chess', at: 2.4, freeze: true },
  'chess-calc': { mode: 'chess', at: 5.6, freeze: true },
  'chess-move': { mode: 'chess', at: 11.9, freeze: true },
  piano: { mode: 'piano' },
  clarinet: { mode: 'clarinet' },
  models: { mode: 'models' },
  'ai-foreground': { mode: 'models', at: 3.8, freeze: true },
  'ai-compare': { mode: 'models', at: 9.6, freeze: true },
  'ai-full': { mode: 'crown', at: 3.0, freeze: true },
  crown: { mode: 'crown' },
  fullphase: { mode: 'phase' },
  life: { life: 0.8 },
};

export class Profile {
  constructor(ctx, def) {
    this.def = def;
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'profile';
    stationPosition(def, this.group.position);
    const P = ctx.app.params;
    const fs = P.get('fstate');
    this.review = STATES[fs] ? { name: fs, ...STATES[fs] } : null;
    if (this.review && P.has('ft')) this.review.at = parseFloat(P.get('ft'));
    if (this.review && P.has('ffz')) this.review.freeze = true;
    this.matKind = MATERIALS[P.get('fmat')] ? P.get('fmat') : 'a';
    this.events = [];

    this.pedestal = createPedestal(ctx, def);
    this.group.add(this.pedestal.mesh);
    this.#buildStage();
    this.#buildFigure();
    this.shell = new Shell(this);
    this.fx = new FX(this, ctx);
    this.group.add(this.fx.group);
    this.orbits = new Orbits(this);
    this.group.add(this.orbits.group);
    this.#buildField();
    this.models = new Models(this, ctx);
    this.group.add(this.models.group);
    this.label = new Label(this, ['a', 'b', 'c', 'd'].includes(P.get('flabel')) ? P.get('flabel') : 'b');
    this.group.add(this.label.group);
    this.acts = new Activities(this, this.models);
    this.group.add(this.acts.group);

    // the station's one light: a soft key on the viewer's side
    // the key light's reach stops above the stage: on the glossy floor it used to leave a specular
    // hot spot that bloomed white when a flight's camera angle met it
    this.key = new THREE.PointLight(0xe6defa, 4, 3.4, 1.6);
    this.group.add(this.key);

    this.hit = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 1.7, 5.8, 16), new THREE.MeshBasicMaterial());
    this.hit.position.y = 3.0;
    this.hit.visible = false;
    this.hit.userData.elementId = def.id;
    this.group.add(this.hit);

    this.#initState();
  }

  // ------------------------------------------------------------------ build
  #buildStage() {
    // dark glass, reflective, a fine ring of light at its rim and a second engraved ring inside
    const geo = new THREE.CylinderGeometry(STAGE.r, STAGE.r - 0.03, 0.04, 128, 1, false);
    geo.translate(STAGE.x, PEDESTAL_TOP + 0.005, STAGE.z);
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x0a0912, roughness: 0.12, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.3 });
    this.stage = new THREE.Mesh(geo, mat);
    this.stage.receiveShadow = true;
    this.group.add(this.stage);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xb8acf0, transparent: true, opacity: 0.32, depthWrite: false });
    for (const [r0, r1, o] of [[STAGE.r - 0.02, STAGE.r + 0.004, 0.42], [1.52, 1.528, 0.16]]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 160), ringMat.clone());
      ring.material.opacity = o;
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(STAGE.x, PLATE_Y + 0.002, STAGE.z);
      this.group.add(ring);
    }
  }

  /**
   * The stage as a field the person makes: a low violet under-light that follows them, a thin
   * elliptical trace round them, and their reflection in the glass (it lags when they phase).
   */
  #buildField() {
    const glowMat = new THREE.ShaderMaterial({
      // the same draw also carries the two small stage responses: a glow under the bearing foot, and
      // the colour of a model passing low, reflected on the floor (all clipped to the stage)
      uniforms: { uK: { value: 0.6 }, uC: { value: new THREE.Vector2() }, uFoot: { value: new THREE.Vector3() }, uAi: { value: new THREE.Vector3() }, uAiC: { value: new THREE.Color() }, uR: { value: STAGE.r - 0.06 } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      // the centre is held soft: if it is ever uncovered (the feet usually hide it) it must not bloom
      fragmentShader: `uniform float uK, uR; uniform vec2 uC; uniform vec3 uFoot, uAi, uAiC; varying vec2 vP;
        float g(vec2 d, float s) { return exp(-dot(d, d) / (s * s)); }
        void main() {
          float r = length(vP) / 1.7;
          float a = pow(max(0.0, 1.0 - r), 2.2) * (0.5 + 0.5 * smoothstep(0.0, 0.4, r)) * uK;
          vec3 c = vec3(0.42, 0.34, 0.85) * a;
          vec2 sp = vec2(vP.x + uC.x, uC.y - vP.y);
          c += vec3(0.5, 0.44, 0.95) * uFoot.z * g(sp - uFoot.xy, 0.34);
          c += uAiC * uAi.z * g(sp - uAi.xy, 0.62);
          c *= 1.0 - smoothstep(uR - 0.12, uR, length(sp));
          gl_FragColor = vec4(c, 1.0);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.underLight = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), glowMat);
    this.underLight.rotation.x = -Math.PI / 2;
    this.underLight.renderOrder = 1;
    this.group.add(this.underLight);
    const pts = Array.from({ length: 97 }, (_, i) => {
      const a = (i / 96) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * 1.05, 0, Math.sin(a) * 0.72);
    });
    this.trace = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xcfc4ff, transparent: true, opacity: 0.35, depthWrite: false }));
    this.group.add(this.trace);
    // the reflection: the body mirrored in the stage plane, worn on the shell's (possibly lagging)
    // skeleton, fading with depth below the glass and clipped to the stage
    const mirror = new THREE.Group();
    mirror.matrixAutoUpdate = false;
    mirror.matrix.makeTranslation(0, PLATE_Y, 0).multiply(new THREE.Matrix4().makeScale(1, -1, 1)).multiply(new THREE.Matrix4().makeTranslation(0, -PLATE_Y, 0));
    this.group.add(mirror);
    const holder = new THREE.Group();
    holder.position.y = PLATE_Y;
    holder.scale.setScalar(S);
    mirror.add(holder);
    const refMat = new THREE.ShaderMaterial({
      uniforms: { uPlane: { value: PLATE_Y }, uStage: { value: new THREE.Vector3() }, uK: { value: 0.62 } },
      vertexShader: `#include <common>
        #include <skinning_pars_vertex>
        attribute float garment;
        varying vec3 vW; varying vec3 vN; varying vec3 vV; flat varying float vG;
        void main() {
          vG = garment;
          #include <beginnormal_vertex>
          #include <skinbase_vertex>
          #include <skinnormal_vertex>
          #include <begin_vertex>
          #include <skinning_vertex>
          vec4 w = modelMatrix * vec4(transformed, 1.0);
          vW = w.xyz;
          vec4 mv = viewMatrix * w;
          vV = -mv.xyz; vN = normalMatrix * objectNormal;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform float uPlane; uniform vec3 uStage; uniform float uK;
        varying vec3 vW; varying vec3 vN; varying vec3 vV; flat varying float vG;
        void main() {
          if (length(vW.xz - uStage.xz) > uStage.y) discard;
          float depth = uPlane - vW.y;
          float fade = exp(-depth * 0.62) * smoothstep(0.0, 0.05, depth);
          float rim = pow(clamp(1.0 - abs(dot(normalize(vN + 1e-6), normalize(vV + 1e-6))), 0.0, 1.0), 1.5);
          vec3 c = vG < 0.5 || (vG > 2.5 && vG < 3.5) ? vec3(0.22, 0.24, 0.48) : vG < 1.5 ? vec3(0.9, 0.88, 0.95) : vG < 2.5 ? vec3(0.9, 0.12, 0.16) : vec3(0.12, 0.12, 0.2);
          gl_FragColor = vec4(c * (0.4 + 0.6 * rim) * fade * uK, 1.0);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.reflection = new THREE.SkinnedMesh(this.shell.geo, refMat);
    this.reflection.frustumCulled = false;
    this.reflection.renderOrder = 1;
    holder.add(this.reflection);
    this.reflection.bindMode = 'detached';
    this.reflection.bind(this.shell.skel.skeleton, new THREE.Matrix4());
    this.group.updateMatrixWorld(true);
    this.reflection.bindMatrixInverse.copy(this.figure.matrixWorld).invert();
  }

  #buildFigure() {
    this.figure = new THREE.Group();
    this.figure.position.y = PLATE_Y;
    this.figure.scale.setScalar(S);
    this.group.add(this.figure);
    const skel = createSkeleton();
    this.skel = skel;
    this.figure.add(skel.root);
    this.rig = new Rig(skel);

    this.uni = {
      uPhase: { value: new Float32Array(NB * 4) },
      uExpose: { value: new Float32Array(NB) },
      uFull: { value: new THREE.Vector4(0, 0, 0, 0) },
      uSrc: { value: [new THREE.Vector4(0, -99, 0, 1), new THREE.Vector4(0, -99, 0, 1), new THREE.Vector4(0, -99, 0, 1)] },
      uSrcK: { value: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()] },
      uScan: { value: new THREE.Vector4(0, 0.35, 0, 0) },
      uSliceDir: { value: new THREE.Vector3(1, 0, 0) },
      uSliceDepth: { value: new THREE.Vector3(0, 0, 1) },
      uTime: this.ctx.uniforms.uTime,
      uNoise3D: { value: this.ctx.noise3D },
      uReveal: { value: 0 },
    };
    const geo = buildBodyGeometry();
    this.buildMs = geo.userData.buildMs;
    const body = new THREE.SkinnedMesh(geo, bodyMaterial(this.uni, this.matKind));
    body.castShadow = false; // a coarse proxy casts (see below)
    body.receiveShadow = true;
    body.frustumCulled = false;
    body.renderOrder = 2;
    this.figure.add(body);
    body.bind(skel.skeleton, new THREE.Matrix4());
    this.body = body;

    const pgeo = buildBodyGeometry(0.02);
    this.proxyGeo = pgeo;
    const proxy = new THREE.SkinnedMesh(pgeo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    proxy.castShadow = true;
    proxy.frustumCulled = false;
    this.figure.add(proxy);
    proxy.bind(skel.skeleton, new THREE.Matrix4());
    this.shadowProxy = proxy;

    const structure = new THREE.SkinnedMesh(buildStructureGeometry(), structureMaterial(this.uni));
    structure.frustumCulled = false;
    structure.renderOrder = 1;
    this.figure.add(structure);
    structure.bind(skel.skeleton, new THREE.Matrix4());
    this.structure = structure;

    // other versions of the body: two posed (candidate selves) and three delayed (echoes)
    this.ghosts = {
      pose: [new Ghost(this.figure, pgeo, 0xd6ccff), new Ghost(this.figure, pgeo, 0xffd2b8)],
      delay: [new Ghost(this.figure, pgeo, 0xcfc4ff), new Ghost(this.figure, pgeo, 0xb8b0ff), new Ghost(this.figure, pgeo, 0xa9a0f0)],
    };
    this.history = new PoseHistory(skel.bones);
    this.cloud = new Cloud(this, geo, skel.skeleton);
    this.masks = { arms: maskOf('armL', 'armR'), full: new Float32Array(NB).fill(1), upper: maskOf('head', 'chest', 'armL', 'armR'), head: maskOf('head') };
  }

  // ------------------------------------------------------------------ state
  #initState() {
    const sp = (v) => ({ v, vel: 0 });
    this.att = { gaze: sp(0), pitch: sp(0), torso: sp(0) };
    this.phase = new Float32Array(NB * 4);
    this.expose = new Float32Array(NB);
    this.full = new THREE.Vector4(0, 0, 0, 0);
    this.life = 0;
    this.pulse = 0;
    this.calm = 0;
    this.drift = 0;
    this.order = 0;
    this.breathPh = 0;
    this.home = { x: STAGE.x / S, z: STAGE.z / S };
    this.homeAt = -99;
    this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this._ray = new THREE.Ray();
    this._m = new THREE.Matrix4();
    this.scan = { y: 0, dir: 0, t: 99, amp: 0 };
    const app = this.ctx.app;
    this.group.updateMatrixWorld(true);
    const cam = app.params.get('focus') === this.def.id ? app.focusView(this.def.id).pos : new THREE.Vector3(0, 7.4, 16.8);
    const h = this.#human(cam, new THREE.Vector3());
    if (!this.review?.still) this.#chooseHome(cam, true);
    const yaw = Math.atan2(h.x - this.home.x, h.z - this.home.z);
    this.rig.place(this.home.x, this.home.z, yaw);
    this.att.gaze.v = this.att.torso.v = yaw;
    this.rig.solve();
  }

  #human(world, out) {
    this.figure.updateMatrixWorld(true);
    return this.figure.worldToLocal(out.copy(world));
  }

  #step(s, goal, w, dt) {
    s.vel += (w * w * (goal - s.v) - 2 * w * s.vel) * dt;
    s.v += s.vel * dt;
  }

  /** A point on a bone (human-unit offset), in the station frame. */
  bonePoint(name, off) {
    const p = new THREE.Vector3(...off);
    this.skel.bones[BONE[name]].localToWorld(p);
    return this.group.worldToLocal(p);
  }

  // ------------------------------------------------------------------ occlusion-aware standing
  /**
   * Where on the stage to stand so the viewer sees a person: points on a figure at each candidate
   * spot are tested against the neighbouring artifacts (Resume's page exactly, others roughly). The
   * stage centre is preferred; the figure moves only when that clearly helps (with hysteresis).
   */
  #chooseHome(cam, force = false) {
    const app = this.ctx.app;
    const occ = this.#occluders();
    const cx = STAGE.x / S, cz = STAGE.z / S;
    const spots = [{ x: cx, z: cz }];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      for (const r of [0.18, 0.32]) spots.push({ x: cx + Math.sin(a) * r, z: cz + Math.cos(a) * r });
    }
    const score = (sp) => this.#score(cam, sp, occ);
    const cur = score(this.home);
    const centre = score({ x: cx, z: cz });
    let best = { x: cx, z: cz }, bestS = centre;
    for (const sp of spots) {
      const s = score(sp) - 0.1 * Math.hypot(sp.x - cx, sp.z - cz);
      if (s > bestS + 0.02) (best = sp), (bestS = s);
    }
    this.visibility = { home: cur, centre, best: bestS };
    const now = app.time;
    const gap = app.rig?.busy || now - (this._landedAt ?? -99) < 4 ? 1.2 : 6;
    const atCentre = Math.hypot(this.home.x - cx, this.home.z - cz) < 0.01;
    if (force || (cur < 0.72 && bestS > cur + 0.18 && now - this.homeAt > gap) || (centre > 0.92 && !atCentre && now - this.homeAt > 8)) {
      const next = centre > 0.92 ? { x: cx, z: cz } : best;
      if (next.x !== this.home.x || next.z !== this.home.z) (this.home = next), (this.homeAt = now);
    }
  }

  /** Weighted fraction of a figure standing at `sp` that `cam` can see past the neighbours. */
  #score(cam, sp, occ = this.#occluders()) {
    const camH = this.#human(cam, new THREE.Vector3());
    const yaw = Math.atan2(camH.x - sp.x, camH.z - sp.z);
    const lx = Math.cos(yaw), lz = -Math.sin(yaw);
    const pts = [[0, 1.7, 3], [0, 1.52, 2], [0.19, 1.42, 1.4], [-0.19, 1.42, 1.4], [0, 1.25, 1.4], [0.26, 0.86, 1], [-0.26, 0.86, 1], [0, 0.95, 1], [0.1, 0.5, 0.8], [-0.1, 0.5, 0.8], [0, 0.1, 0.4]];
    let vis = 0, tot = 0;
    const p = new THREE.Vector3();
    for (const [u, y, w] of pts) {
      p.set(sp.x + u * lx, y, sp.z + u * lz);
      this.figure.localToWorld(p);
      tot += w;
      if (!this.#blocked(cam, p, occ)) vis += w;
    }
    return vis / tot;
  }

  #occluders() {
    if (this._occ) return this._occ;
    const app = this.ctx.app;
    const list = [];
    for (const el of app.elements ?? []) {
      if (el === this) continue;
      if (el.sheet) {
        el.sheet.geometry.computeBoundingBox();
        list.push({ obj: el.sheet, box: el.sheet.geometry.boundingBox.clone().expandByScalar(0.05) });
      } else list.push({ obj: el.group, box: new THREE.Box3(new THREE.Vector3(-1.3, 0.9, -1.3), new THREE.Vector3(1.3, 5.2, 1.3)) });
    }
    if (app.elements?.length >= 4) this._occ = list;
    return list;
  }

  blocked(cam, p) {
    return this.#blocked(cam, p, this.#occluders());
  }

  #blocked(cam, p, occ) {
    const dir = this._v[2].subVectors(p, cam);
    const len = dir.length();
    dir.divideScalar(len);
    for (const o of occ) {
      o.obj.updateWorldMatrix(true, false);
      const inv = this._m.copy(o.obj.matrixWorld).invert();
      this._ray.set(this._v[3].copy(cam), dir).applyMatrix4(inv);
      const hit = this._ray.intersectBox(o.box, this._v[3]);
      if (hit) {
        hit.applyMatrix4(o.obj.matrixWorld);
        if (hit.distanceTo(cam) < len - 0.05) return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------------ interaction (Resume's model)
  #interaction(time, dt, camera) {
    const app = this.ctx.app, rig = app.rig;
    const focused = app.focused === this.def.id;
    const fk = this.focusK ?? 0, hk = this.hoverK ?? 0;
    let drift = 0;
    if (focused && !rig.busy && fk > 0.98) {
      const off = (this._att2 ??= new THREE.Vector3()).subVectors(camera.position, rig.controls.target).normalize();
      if (!this.focusDir) this.focusDir = off.clone();
      drift = THREE.MathUtils.radToDeg(this.focusDir.angleTo(off));
    } else if (!focused) this.focusDir = null;
    this.drift = drift;
    const lifeGoal = this.review?.life ?? driftCurve(drift, 5, 35, 0.7);
    this.life += (lifeGoal - this.life) * Math.min(1, dt * 1.5);
    if (this.pulseHold > 0) {
      this.pulseHold -= dt;
      this.pulse += (this.pulseAmp - this.pulse) * Math.min(1, dt * 7);
    } else this.pulse *= Math.exp(-dt / 0.9);
    if (!focused) this.pulse = Math.min(this.pulse, 1) * Math.exp(-dt * 3);
    this.calm = fk * (1 - this.life);
    const rising = hk > (this._hkPrev ?? 0) + 1e-4, falling = hk < (this._hkPrev ?? 0) - 1e-4;
    this._hkPrev = hk;
    if (hk < 0.04) this._hoverArmed = true;
    if (rising && hk > 0.12 && this._hoverArmed && time - (this._hoverAt ?? -9) > 0.8) {
      this._hoverArmed = false;
      this._hoverAt = time;
      this._acked = true;
      this.emit('hover-ack');
      this.models.perturb(time);
      this.scan = { y: PLATE_Y, dir: 1, t: 0, dur: 0.9, delay: 0.05, amp: 0.7 };
      this.label.sweep(time);
    }
    if (this._acked && falling && hk < 0.5) {
      this._acked = false;
      this.emit('hover-release');
    }
    if (focused && !this._wasFocused) {
      this._arrived = false;
      this.emit('activate', { dur: rig.tween?.duration ?? 2.4 });
      this.scan = { y: PLATE_Y, dir: 1, t: 0, dur: rig.tween?.duration ?? 2.4, delay: 0.45 * (rig.tween?.duration ?? 2.4), amp: 1 };
    }
    if (focused && !this._arrived && !rig.busy && fk > 0.9) {
      this._arrived = true;
      this.emit('settle');
      // arrival: a brief calm lock: the spine comes true, one soft ring, a soft light
      this.label.sweep(time);
      const sst = this.rig.stance();
      // the arrival breathes: no spectacle here, only a faint settle on the stage
      this.fx?.ring(new THREE.Vector3(sst.x * S, PLATE_Y + 0.01, sst.z * S), { r0: 0.3, r1: 1.1, life: 2.2, k: 0.22 });
    }
    if (!focused && this._wasFocused) this.emit('release');
    this._wasFocused = focused;
  }

  /** Reselected while focused: a graded, non-stacking re-acquisition alongside the reframe. */
  onReframe() {
    const amp = driftCurve(this.drift ?? 0, 4, 30, 0.6);
    if (amp < 0.02) {
      // a tiny re-select: a small acknowledgement only (the spine comes true), no spectacle
      this.emit('reselect-small');
      this.label.sweep(this.ctx.app.time);
      return;
    }
    if (this.pulse >= 0.35 * amp) return;
    const time = this.ctx.app.time;
    this.pulseAmp = amp;
    this.pulseHold = 0.35;
    this.emit('reengage', { amp });
    this.scan = { y: PLATE_Y + 4.4, dir: -1, t: 0, dur: 1.5, delay: 0.05, amp: 0.35 + 0.65 * amp };
    this.models.perturb(time);
    this.label.rebuild(time, amp);
    this.models.tighten(amp, time);
    this.#reengageFx(amp);
    this.orbits.collapse(amp);
  }

  /** Picking: a cheap test of the visible person (capsules along the body) and the spine. */
  pickVisible(ray) {
    const seg = (a, b, r) => {
      const A = this.group.localToWorld(a), B = this.group.localToWorld(b);
      const P = new THREE.Vector3(), Q = new THREE.Vector3();
      const d2 = ray.ray.distanceSqToSegment(A, B, P, Q);
      return d2 < r * r ? ray.ray.origin.distanceTo(P) : null;
    };
    const bp = (n, o = [0, 0, 0]) => this.bonePoint(n, o);
    let best = null;
    const take = (d) => { if (d != null && (best === null || d < best)) best = d; };
    take(seg(bp('head', [0, 0.1, 0]), bp('pelvis'), 0.55));
    take(seg(bp('pelvis'), new THREE.Vector3(this.rig.pelvisPos.x * S, PLATE_Y, this.rig.pelvisPos.z * S), 0.42));
    for (const sd of ['L', 'R']) take(seg(bp('upperArm' + sd), bp('hand' + sd), 0.22));
    const sp = this.label.spine?.position;
    if (sp) take(seg(sp.clone().setY(sp.y - 1.9), sp.clone().setY(sp.y + 1.9), 0.3));
    return best;
  }

  /** The pelvis clear zone, seen from the camera: lines fade where they would cross it. */
  #clearUpdate(camera) {
    const C = (this._clC ??= new THREE.Vector3()).copy(camera.position);
    this.group.worldToLocal(C);
    this._clP = this.bonePoint('pelvis', [0, -0.1, 0.02]);
    const n = (this._clN ??= new THREE.Vector3()).subVectors(this._clP, C);
    this._clL = n.length() || 1;
    n.divideScalar(this._clL);
  }

  /** 0 inside the clear zone (in projection), 1 outside it. */
  clearK(v) {
    if (!this._clP) return 1;
    const C = this._clC, n = this._clN, x = v.x - C.x, y = v.y - C.y, z = v.z - C.z, t = x * n.x + y * n.y + z * n.z;
    if (t < 0.1) return 1;
    const d = Math.hypot(x - n.x * t, y - n.y * t, z - n.z * t) / (t / this._clL);
    return smoothstep(d, 0.38, 0.66);
  }

  /** A point behind the hips (from the viewer), for routing a line round them. */
  clearBehind(dist) {
    const h = Math.hypot(this._clN.x, this._clN.z) || 1;
    return new THREE.Vector3(this._clP.x + (this._clN.x / h) * dist, this._clP.y + 0.25, this._clP.z + (this._clN.z / h) * dist);
  }

  emit(type, data = {}) {
    if (this.events.length < 64) this.events.push({ type, ...data });
    this.#fxEvent(type, data);
  }

  // ------------------------------------------------------------------ update
  update(time, dt, camera) {
    this._now = time;
    const app = this.ctx.app;
    const R = this.review;
    if (R?.hover) this.hoverK = R.hover;
    this.#interaction(time, dt, camera);
    const hk = this.hoverK ?? 0, fk = this.focusK ?? 0;
    // attention when hovered: it wakes fast (about 150 ms) and relaxes over about a second
    const wakeGoal = hk > 0.05 ? 1 : 0;
    this.wake = (this.wake ?? 0) + (wakeGoal - (this.wake ?? 0)) * Math.min(1, dt * (wakeGoal > (this.wake ?? 0) ? 9 : 1.4));
    const order = Math.max(0.28 * Math.min(1, 2 * hk), this.calm, 0.9 * this.pulse);
    this.order = order;

    let flying = app.rig.busy && app.rig.tween;
    let refCam = flying ? app.rig.tween.p1 : camera.position;
    let toFocus = flying && app.focused === this.def.id;
    if (R?.name === 'focus-turn' && time > 1.5) {
      refCam = (this._fv ??= app.focusView(this.def.id).pos);
      flying = toFocus = time < 4.2;
      if (!this._turnAt) (this._turnAt = time), (this.scan = { y: PLATE_Y, dir: 1, t: 0, dur: 2.4, delay: 1.1, amp: 1 }), this.emit('activate', { dur: 2.4 });
    }
    if (!R?.still && !app.focused && (time - (this._homeCheck ?? -9) > 0.5 || (flying && !this._wasFlying))) {
      this._homeCheck = time;
      this.#chooseHome(refCam, flying && !this._wasFlying);
    }
    const cx = STAGE.x / S, cz = STAGE.z / S;
    if (app.focused === this.def.id && (this.home.x !== cx || this.home.z !== cz) && (flying || fk > 0.5)) (this.home = { x: cx, z: cz }), (this.homeAt = time);
    if (this._wasFlying && !flying) this._landedAt = time;
    this._wasFlying = !!flying;
    this.refCam = refCam;
    this.#clearUpdate(camera);

    const c = { refCam, order, hk, fk, calm: this.calm, life: this.life, focused: app.focused === this.def.id, flying, review: R, windDown: toFocus, wake: this.wake ?? 0, camNow: camera.position };
    const m = this.acts.update(time, dt, c);
    this.#reviewPhase(time, m);
    this.#micro(time, dt, m, c);
    this.models.update(time, dt, { ...c, decide: m.decide ?? 0, lean: m.lean ?? 0, merge: m.merge ?? 0 });
    this.#layers(time, dt, m, c, camera);
    this.#attention(time, dt, refCam, m, { hk, fk, flying, toFocus });
    this.#fields(time, dt, m);
    this.#body(time, dt, m);
    this.rig.update(dt);
    for (const e of this.rig.events) this.emit(e.type, e);
    this.rig.events.length = 0;
    this.rig.solve();
    this.history.push(time);
    this.#ghosts(time, dt, m);
    // the shell stays behind while the inner self shifts (a lag), then catches up; it opens with
    // the body's phase and closes after it
    const lagGoal = Math.max(0, ...(m.ghosts ?? []).filter((g) => g.kind === 'delay').map((g) => g.k)) * (1 - 0.85 * order);
    this.shellLag = (this.shellLag ?? 0) + (lagGoal - (this.shellLag ?? 0)) * Math.min(1, dt * 2);
    this.shell.uni.uBreath.value = this.breath ?? 0;
    this.shell.update(dt, this.phase, this.history.at(time - 0.24 * this.shellLag), Math.min(1, this.full.w * 0.9), this.wake ?? 0);
    // while the suit trails (a lag) the inner person shows through where it has moved
    this.uni.uReveal.value = Math.min(1, this.shellLag * 0.55 + this.full.w);
    const sst = this.rig.stance();
    // the light and the trace follow the visible body (the pelvis), not the stance target, which
    // leads the body during a step and used to leave the disc's bare centre blooming beside it
    const pvv = this.rig.pelvisPos;
    this.underLight.position.set(pvv.x * S, PLATE_Y + 0.006, pvv.z * S);
    // the hit volume follows the person (and the spine beside it), wherever the figure has stepped
    // to stay visible, so pointing at the visible figure selects Profile
    const sp = this.label.spine?.position;
    this.hit.position.x += ((sp ? (sst.x * S + sp.x) / 2 : sst.x * S) - this.hit.position.x) * Math.min(1, dt * 3);
    this.hit.position.z += ((sp ? (sst.z * S + sp.z) / 2 : sst.z * S) - this.hit.position.z) * Math.min(1, dt * 3);
    const wk = this.wake ?? 0;
    // capped: the lit disc can swell but never spike (seen at a grazing angle it used to bloom out)
    this.underLight.material.uniforms.uK.value = Math.min(1.05, 0.5 + 0.25 * order + 0.4 * this.full.w + 0.06 * Math.sin(time * 0.6) + 0.22 * wk + (this._stageExtra ?? 0));
    {
      // the stage answers the body: a small glow under the bearing foot, swelling when light arrives
      // down a leg; and whichever model passes low tints the floor beneath it, faintly
      const U = this.underLight.material.uniforms, wSn = this.rig.wS ?? 1;
      U.uC.value.set(pvv.x * S, pvv.z * S);
      const bf = this.rig.feet[wSn >= 0 ? 'R' : 'L'], seam = this._seamFoot ?? 0;
      this._footX = (this._footX ?? bf.x * S) + (bf.x * S - (this._footX ?? bf.x * S)) * Math.min(1, dt * 2.5);
      this._footZ = (this._footZ ?? bf.z * S) + (bf.z * S - (this._footZ ?? bf.z * S)) * Math.min(1, dt * 2.5);
      U.uFoot.value.set(this._footX, this._footZ, 0.12 + 0.15 * Math.abs(wSn) + 0.5 * seam + 0.1 * wk);
      // the lowest model passing tints the floor beneath it, and grazes the nearer trouser leg
      let lp = null;
      for (const a of this.models._low?.active ?? []) if (!lp || a.p.pos.y < lp.p.pos.y) lp = a;
      if (lp) {
        U.uAi.value.set(lp.p.pos.x, lp.p.pos.z, 0.42 * lp.env * (1 - smoothstep(lp.p.pos.y, 2.4, 4.6)));
        U.uAiC.value.copy(lp.p.brand);
        const G = this.shell.uni.uGraze.value, q = (this._gv ??= new THREE.Vector3()).copy(lp.p.pos);
        this.figure.worldToLocal(this.group.localToWorld(q));
        G.set(q.x, q.y, q.z, 0.6 * lp.env);
        this.shell.uni.uGrazeC.value.copy(lp.p.brand);
      } else (U.uAi.value.z = 0), (this.shell.uni.uGraze.value.w = 0);
    }
    this.trace.position.set(pvv.x * S, PLATE_Y + 0.004, pvv.z * S);
    this.trace.rotation.y = this.att.torso.v + Math.PI / 2;
    this.trace.material.opacity = 0.22 + 0.2 * order + 0.25 * Math.max(this.full.y, this.full.w) + 0.25 * wk * (0.75 + 0.25 * Math.sin(time * 2.2));
    this.reflection.material.uniforms.uK.value = 0.62 + 0.25 * wk + 0.25 * (this._bloom ?? 0);
    this.reflection.material.uniforms.uStage.value.set(this.group.position.x + STAGE.x, STAGE.r - 0.05, this.group.position.z + STAGE.z);
    this.#trackCamera(dt, camera);
    this.cloud.update(time, dt, this.phase, this.full, { rearrange: m.rearrange ?? 0, scatter: m.scatter ?? 0 });
    let sl = 0, inf = 0;
    for (let i = 0; i < NB; i++) (sl = Math.max(sl, this.phase[i * 4 + 1])), (inf = Math.max(inf, this.phase[i * 4 + 3]));
    c.ph = { lag: this.shellLag ?? 0, slice: Math.max(sl, this.full.y), info: Math.max(inf, this.full.w) };
    c.tier = this.tier ?? 0.15;
    this.label.update(time, dt, c);

    // layers slide across the viewer's view (and a little in depth)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const back = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    this.uni.uSliceDir.value.copy(right);
    this.uni.uSliceDepth.value.copy(back);

    const h = this.#human(refCam, this._v[0]);
    const st = this.rig.stance();
    const a = Math.atan2(h.x - st.x, h.z - st.z);
    this.key.position.set((st.x + Math.sin(a + 0.5) * 0.8) * S, PLATE_Y + 2.05 * S, (st.z + Math.cos(a + 0.5) * 0.8) * S);
    this.key.intensity = 3.2 + 1 * order;
  }

  /**
   * Effects by layer, for the attention states. Idle: rare, asynchronous small events. Hover: the
   * AI field answers (response pulses, a message arc now and then), a faint afterimage follows the
   * notice, the suit's edge pulses. Activities and the rare events drive their own effects.
   */
  #layers(time, dt, m, c, camera) {
    const fx = this.fx, M = this.models, wk = this.wake ?? 0;
    const qg = this.group.getWorldQuaternion(this._qg ??= new THREE.Quaternion());
    const camQuat = (this._cq ??= new THREE.Quaternion()).copy(qg).invert().multiply(camera.quaternion);
    const mode = this.acts.mode;
    this._aiK = (this._aiK ?? 0) + ((mode === 'models' || mode === 'crown' ? 1 : 0) - (this._aiK ?? 0)) * Math.min(1, dt * 1.5);
    // ---- the spectacle tier: rest < hover < focused idle (by drift) < activity < rare event
    const rare = mode === 'crown' || mode === 'phase';
    // tiers: rest 0.18, hover 0.46, flight 0.55, arrival a calm 0.28, focused idle 0.35-0.65 with
    // drift, activity 0.8, rare 1.0, large re-engagement a swell; the tier itself is a spring, so no
    // brightness anywhere jumps when the state changes
    let goalT = 0.18;
    if (wk > 0.05 && !c.focused) goalT = Math.max(goalT, 0.18 + 0.28 * wk);
    if (c.flying && c.windDown) goalT = Math.max(goalT, 0.55);
    if (c.focused && !c.flying) goalT = Math.max(goalT, (this.life ?? 0) < 0.02 ? 0.28 : 0.35 + 0.3 * (this.life ?? 0));
    if (mode) goalT = Math.max(goalT, rare ? 1 : 0.8);
    goalT = Math.max(goalT, 0.4 + 0.6 * (this._burstT ?? 0));
    this._burstT = Math.max(0, (this._burstT ?? 0) - dt * 0.6);
    const wT = 3, dT = Math.min(dt, 1 / 30);
    this._tierV = (this._tierV ?? 0) + (wT * wT * (goalT - (this.tier ?? goalT)) - 2 * wT * (this._tierV ?? 0)) * dT;
    this.tier = (this.tier ?? goalT) + this._tierV * dT;
    const tier = this.tier;
    fx.update(time, dt, { wake: wk, camQuat, aiMode: this._aiK, tier, head: this.bonePoint('head', [0, 0.06, 0]) });
    // the orbital ecosystem: the person is its centre of gravity; the station's state reshapes it
    this.orbits.update(time, dt, { tier, wake: wk, focused: c.focused, flying: c.flying, windDown: c.windDown, life: this.life ?? 0, rare, camNow: c.camNow });
    const awake = M.list.filter((p) => (p.awake ?? 0) > 0.35 && p.mesh.visible);
    const head = () => this.bonePoint('head', [0, 0.08, 0.02]);
    const sst = this.rig.stance();
    const feet = new THREE.Vector3(sst.x * S, PLATE_Y + 0.01, sst.z * S);
    const fwd = new THREE.Vector3(Math.sin(this.att.torso.v), 0, Math.cos(this.att.torso.v));
    // the stage's bloom (decays): hover, arrival and re-engagement swell the under-light
    this._bloomGoal = Math.max(0, (this._bloomGoal ?? 0) - dt * 0.8);
    this._bloom = (this._bloom ?? 0) + ((this._bloomGoal ?? 0) - (this._bloom ?? 0)) * Math.min(1, dt * ((this._bloomGoal ?? 0) > (this._bloom ?? 0) ? 4 : 1.2));
    // ---- hover: recognition, then a state that keeps evolving
    const hovering = wk > 0.5 && !c.focused && mode !== 'models' && mode !== 'crown';
    if (hovering && !this._hovFx) {
      this._hovFx = time;
      this._hovStep = 0;
      for (const p of awake) fx.burst(p.pos, { n: 12, color: p.def.color, speed: 0.6, life: 1.3, size: 0.06, alpha: 0.9 });
      fx.ring(feet, { r0: 0.3, r1: 2.3, life: 1.4, k: 0.9 });
      fx.ring(feet, { r0: 0.2, r1: 1.6, life: 1.8, k: 0.5, color: 0xffd9b0 });
      fx.glow(head(), 0xe6dcff, 0.9, 1.2);
      this.#lowEvent(time, wk, 'wrap');
      this.#seamStart(time);
      this._afterUntil = time + 1.1;
      this._nextHoverArc = time + 0.6;
      this._bloomGoal = 1;
      this.shell.glint(1);
    }
    if (!hovering && wk < 0.2) this._hovFx = null;
    if (time < (this._afterUntil ?? 0)) (m.ghosts ??= []).push({ kind: 'delay', delay: 0.16, k: 0.32 * (this._afterUntil - time), mask: 'full' });
    if (hovering) {
      // messages between the woken models (or a model and the figure), quicker as it goes on
      if (time > (this._nextHoverArc ?? 0) && awake.length) {
        this._nextHoverArc = time + 1.3 + 0.9 * ((time * 0.618) % 1);
        this._hn = (this._hn ?? 0) + 1;
        const a = awake[this._hn % awake.length], b = awake[(this._hn + 1) % awake.length];
        if (this._hn % 3 === 2 || a === b) fx.arc(a.pos, head(), { color: a.def.color, lift: 0.35, life: 1.4, k: 0.85, follow: () => [a.pos, head()] });
        else {
          fx.arc(a.pos, b.pos, { color: a.def.color, lift: 0.45, life: 1.5, k: 0.8, follow: () => [a.pos, b.pos] });
          fx.burst(b.pos, { n: 6, color: b.def.color, speed: 0.4, life: 1.0, size: 0.05, alpha: 0.85 });
        }
        fx.glow(a.pos, a.def.color, 0.5, 0.8);
      }
      // the arc of a sustained hover (timings vary): models reposition, an interest teaser plays
      // (the activities run those), a dimensional event, then the identity field answers; repeat
      const h = time - this._hovFx;
      // the beats drift from cycle to cycle (never an obvious fixed interval)
      const cy = this._hovCycle ?? 0;
      const beats = [2.2 + 0.7 * ((cy * 0.618) % 1), 7.6 + 1.6 * ((cy * 0.382) % 1), 11.0 + 1.2 * ((cy * 0.7) % 1)];
      const cyc = 11.5 + 2.5 * ((this._hovCycle ?? 0) % 2);
      const hc = h > 2 ? 2 + ((h - 2) % cyc) : h;
      if (hc < (this._hcPrev ?? 0)) (this._hovStep = 0), (this._hovCycle = (this._hovCycle ?? 0) + 1);
      this._hcPrev = hc;
      if (this._hovStep < beats.length && hc > beats[this._hovStep]) {
        const b = this._hovStep++;
        if (b === 0) {
          M.perturb(time);
          // a transfer through the person: a model reaches the hand, light runs up the arm, the head
          // flickers into constellation, and the output leaves behind the head into an orbit
          const src = awake[0];
          if (src) {
            const hand = () => this.bonePoint('indexR', [0, -0.02, 0.02]);
            fx.arc(src.pos, hand(), { color: src.def.color, lift: 0.35, life: 1.2, k: 0.9, follow: () => [src.pos, hand()] });
            this._xfer = { t: time, color: src.def.color };
          }
        }
        if (b === 1) {
          // a dimensional event: an afterimage peels off and the phase wave climbs the body
          this._afterUntil = time + 1.3;
          this.scan = { y: PLATE_Y, dir: 1, t: 0, dur: 1.2, delay: 0, amp: 0.6 };
          this.emit('hover-pulse', { k: 0.6 });
        }
        if (b === 2) {
          // the identity field answers: every woken model reaches the figure, the spine sweeps
          for (const p of awake.slice(0, 4)) fx.arc(p.pos, head(), { color: p.def.color, lift: 0.3, life: 1.6, k: 0.75, follow: () => [p.pos, head()] });
          this.label.sweep(time);
          fx.ring(feet, { r0: 0.4, r1: 2.0, life: 1.6, k: 0.6 });
          this.emit('hover-pulse', { k: 0.8 });
        }
      }
    }
    // the suit's edge: a band of light climbing the lapels while attended or flying in
    this.shell.uni.uEdge.value = hovering || wk > 0.05 || (c.flying && c.windDown) ? ((time * (c.flying ? 0.8 : 0.45)) % 1.4) - 0.2 : -1;
    // ---- idle (and focused idle, richer with drift): rare, small, asynchronous events
    const focusedIdle = c.focused && !c.flying && !mode;
    const idleOK = (!mode && wk < 0.05 && !c.flying && !c.focused) || focusedIdle;
    const life = focusedIdle ? this.life ?? 0 : 0;
    if (idleOK && !this.review?.still && time > (this._idleFx ?? 4)) {
      // temporal richness, spatial restraint: one small event at a time, but often
      this._idleFx = time + lerp(3.2, 2.2, life) + 2.3 * ((time * 0.377) % 1);
      const kinds = ['arc', 'harmonic', 'square', 'spine', 'tie', 'echo', 'arm', 'head', 'candidate', 'hands'];
      const kind = kinds[(this._idleN = (this._idleN ?? 0) + 1) % kinds.length];
      const sc = 0.7 + 0.6 * life;
      if (kind === 'arc' && awake.length > 1) fx.arc(awake[0].pos, awake[1].pos, { color: awake[0].def.color, lift: 0.4, life: 2.4, k: 0.4 * sc, follow: () => [awake[0].pos, awake[1].pos] });
      if (kind === 'harmonic') {
        const hp = this.bonePoint(this._idleN % 2 ? 'handL' : 'handR', [0, -0.06, 0]);
        fx.arc(hp, hp.clone().add(new THREE.Vector3(0, 0.75, 0)).addScaledVector(fwd, 0.25), { lift: 0.14, life: 2.0, k: 0.45 * sc, color: 0xe6dcff });
      }
      if (kind === 'square') {
        const cx = feet.x + fwd.x * 0.8, cz = feet.z + fwd.z * 0.8, y = PLATE_Y + 0.95 * S, hh = 0.075;
        const r = new THREE.Vector3(fwd.z, 0, -fwd.x);
        const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => new THREE.Vector3(cx, y, cz).addScaledVector(r, u * hh).addScaledVector(fwd, v * hh));
        for (let i = 0; i < 4; i++) fx.arc(pts[i], pts[(i + 1) % 4], { straight: true, life: 2.2, k: 0.5 * sc, packet: false, color: 0xd8ceff });
      }
      if (kind === 'spine') (this.label.nudge?.(time), this.emit('idle-profile'));
      if (kind === 'tie') (this.shell.kick(0.7), this.shell.glint(0.7));
      if (kind === 'echo') this._echoUntil = time + 1.4;
      if (kind === 'arm') this._armFlowAt = time;
      if (kind === 'head') this._headFlick = time;
      if (kind === 'candidate') {
        // one chess candidate path ghosts across empty space in front
        const a = feet.clone().addScaledVector(fwd, 0.7).setY(PLATE_Y + 1.0 * S), b = a.clone().addScaledVector(new THREE.Vector3(fwd.z, 0, -fwd.x), 0.6).addScaledVector(fwd, 0.3);
        fx.arc(a, b, { lift: 0.22, life: 2.0, k: 0.45 * sc, color: 0xffe6c8 });
      }
      if (kind === 'hands') fx.arc(this.bonePoint('handL', [0, -0.06, 0]), this.bonePoint('handR', [0, -0.06, 0]), { lift: 0.35, life: 2.0, k: 0.45 * sc, color: 0xe6dcff, follow: () => [this.bonePoint('handL', [0, -0.06, 0]), this.bonePoint('handR', [0, -0.06, 0])] });
      if (life > 0.55 && this._idleN % 3 === 0) this.emit('micro', { k: 0.4 + 0.4 * life });
    }
    // the lower half has its own sequence: one event at a time, often (temporal density, never a web)
    if (!mode && !c.flying && !this.review?.still && time > (this._lowFx ?? 3)) {
      this._lowFx = time + lerp(2.4 + 1.7 * ((time * 0.521) % 1), 1.4, wk);
      this.#lowEvent(time, wk);
    }
    {
      // pearl light begins at the torso, travels the hip and the outer seam of one leg and goes into
      // the stage (or, every third time, comes back up)
      const u = clamp((time - (this._seamAt ?? -9)) / 3.0, 0, 1), up = this._seamUp;
      const e = u * u * (3 - 2 * u), k = Math.sin(Math.PI * u) ** 2 * (1.5 + 0.7 * wk) * (mode ? 0 : 1);
      this.shell.uni.uSeam.value.set(this._seamSide ?? 1, up ? lerp(0.12, 1.05, e) : lerp(1.38, 0.12, e), k);
      const near = up ? 1 - u : u;
      this._seamFoot = u < 1 ? smoothstep(near, 0.55, 0.9) * Math.sin(Math.PI * u) : 0;
      if (!up && u > 0.8 && u < 1 && !this._seamOut) {
        // it leaves the ankle across the stage and rises again behind the leg
        this._seamOut = true;
        const f = this.rig.feet[this._seamSide > 0 ? 'L' : 'R'], at = this.#around(this._clC, f.x * S, f.z * S);
        const s = this._seamSide > 0 ? 1 : -1;
        fx.curve([at(s * 0.9, 0.2, PLATE_Y + 0.04), at(s * 1.5, 0.95, PLATE_Y + 0.04), at(s * 2.3, 1.15, PLATE_Y + 0.35), at(s * 2.9, 0.75, PLATE_Y + 1.5)], { life: 1.7, k: 0.95, color: this._seamHex ?? 0xe6dcff });
      }
    }
    if (time < (this._echoUntil ?? 0)) (m.ghosts ??= []).push({ kind: 'delay', delay: 0.3, k: 0.4 * Math.sin(Math.PI * (1 - (this._echoUntil - time) / 1.4)), mask: 'arms' });
    if (time - (this._armFlowAt ?? -9) < 1.2) {
      // pearl light flows down one arm
      const u = (time - this._armFlowAt) / 1.2, sd = this._idleN % 2 ? 'L' : 'R';
      ['upperArm', 'foreArm', 'hand'].forEach((n, i) => {
        const k = Math.max(0, Math.sin(Math.PI * clamp(u * 2 - i * 0.35, 0, 1)));
        m.phase[BONE[n + sd] * 4] = Math.max(m.phase[BONE[n + sd] * 4], 0.7 * k);
      });
    }
    if (this._xfer) {
      const u = time - this._xfer.t;
      if (u > 0.9 && !this._xfer.arm) (this._xfer.arm = true), (this._armFlowAt = time), (this._idleN = 2), fx.burst(this.bonePoint('indexR', [0, 0, 0]), { n: 10, color: this._xfer.color, speed: 0.25, life: 0.8, size: 0.035, to: this.bonePoint('handR', [0, 0, 0]), drag: 3 });
      if (u > 1.8 && !this._xfer.head) (this._xfer.head = true), (this._headFlick = time);
      if (u > 2.5) {
        this.orbits.launch('capsule', this.bonePoint('head', [0, 0.05, -0.12]), { color: this._xfer.color, anchor: 'head', life: 8 });
        this._xfer = null;
      }
    }
    if (time - (this._headFlick ?? -9) < 0.9) {
      const u = (time - this._headFlick) / 0.9, i = BONE.head * 4;
      m.phase[i + 2] = Math.max(m.phase[i + 2], 0.45 * Math.sin(Math.PI * u));
    }
    // ---- re-engagement collapse: temporal copies fold back inward (graded)
    if (time < (this._collapseUntil ?? 0)) {
      const u = 1 - (this._collapseUntil - time) / 0.9;
      (m.ghosts ??= []).push({ kind: 'delay', delay: 0.35 * (1 - u), k: 0.55 * (this._collapseAmp ?? 0) * (1 - u), mask: 'full' });
    }
    // the stage answers the tier and the bloom
    this._stageExtra = 0.2 * this._bloom + 0.15 * (tier - 0.15);
  }

  #seamStart(time, color) {
    this._seamAt = time;
    this._seamN = (this._seamN ?? 0) + 1;
    this._seamUp = this._seamN % 3 === 0;
    this._seamOut = false;
    this._seamSide = (this.rig.wS ?? 1) >= 0 ? -1 : 1; // the bearing leg (+x is the figure's left)
    this._seamHex = color ?? 0xe6dcff;
    this.shell.uni.uSeamC.value.set(this._seamHex).lerp(_white, 0.45).multiplyScalar(0.95);
    this.emit('idle-seam');
  }

  /** Points round a vertical axis at (ox, oz), angles measured from the viewer's side of it. */
  #around(C, ox, oz) {
    const phi = Math.atan2(C.x - ox, C.z - oz);
    return (az, r, y) => new THREE.Vector3(ox + Math.sin(phi + az) * r, y, oz + Math.cos(phi + az) * r);
  }

  /** One event of the lower field; every line goes round the body or behind it, never across it. */
  #lowEvent(time, wk, force) {
    const fx = this.fx, K = ['seam', 'calf', 'wrap', 'skim', 'knee', 'seam', 'rise', 'calf', 'skim', 'wrap', 'knee'];
    const kind = force ?? K[(this._lowN = (this._lowN ?? 0) + 1) % K.length];
    const pv = this.rig.pelvisPos, cx = pv.x * S, cz = pv.z * S, C = this._clC, side = (this._lowN ?? 1) % 2 ? 1 : -1, Y = PLATE_Y;
    let lp = null;
    for (const a of this.models._low?.active ?? []) if (!lp || a.env > lp.env) lp = a;
    const col = lp?.p.def.color ?? 0xe6dcff, k = 0.95 + 0.4 * wk;
    const at = this.#around(C, cx, cz);
    const phi = Math.atan2(C.x - cx, C.z - cz), lat = (f) => ((f.x * S - cx) * Math.cos(phi) - (f.z * S - cz) * Math.sin(phi) >= 0 ? 1 : -1);
    const sweep = (a0, a1, rs, ys, o) => fx.curve(rs.map((r, i) => at(side * lerp(a0, a1, i / (rs.length - 1)), r, Y + ys[i])), o);
    if (kind === 'seam') this.#seamStart(time, col);
    if (kind === 'wrap') {
      // one large hairline: behind the shoulder, round the outer hip, behind the calf, across the stage, up again
      sweep(1.75, Math.PI + 1.6, [1.15, 1.25, 1.1, 1.05, 1.75, 1.5, 1.35], [3.7, 2.7, 1.6, 0.8, 0.12, 0.7, 1.9], { life: 3.6, k: 0.85 * (1 + wk * 0.4), color: col });
      this.emit('idle-wrap');
    }
    if (kind === 'rise') sweep(1.35, Math.PI + 1.25, [0.95, 1.0, 1.05, 1.1, 1.0], [0.35, 1.1, 2.0, 3.0, 3.9], { life: 2.7, k, color: col }); // ankle toward the far shoulder
    if (kind === 'skim') {
      sweep(0.4, 2.9, [1.85, 1.85, 1.85, 1.75, 1.0, 0.8], [0.04, 0.04, 0.04, 0.08, 0.8, 1.7], { life: 2.5, k, color: col }); // along the stage, then up behind the calf
      this.emit('idle-stage');
    }
    if (kind === 'calf' || kind === 'knee') {
      // a segment of halo round one leg only, on its outer side and behind it
      const f = this.rig.feet[side > 0 ? 'L' : 'R'], s = lat(f), a2 = this.#around(C, f.x * S, f.z * S);
      const y0 = kind === 'calf' ? 1.0 : 1.4, r = kind === 'calf' ? 0.5 : 0.42, end = kind === 'calf' ? 2.9 : 2.2;
      fx.curve([0, 1, 2, 3, 4].map((i) => a2(s * lerp(0.9, end, i / 4), r, Y + y0 - 0.06 * i)), { life: 1.9, k: k * 0.85, color: col, packet: false });
      fx.burst(a2(s * 1.4, r + 0.05, Y + y0 - 0.25), { n: 7, color: col, speed: 0.1, life: 1.7, size: 0.028, alpha: 0.55, up: 0.2, drag: 1.5 });
    }
  }

  /** Re-engagement (graded by drift): copies collapse, the field reorganises, the stage contracts. */
  #reengageFx(amp) {
    const fx = this.fx, time = this._now ?? 0;
    if (!fx) return;
    const sst = this.rig.stance();
    const feet = new THREE.Vector3(sst.x * S, PLATE_Y + 0.01, sst.z * S);
    const head = this.bonePoint('head', [0, 0.08, 0.02]);
    this._burstT = Math.max(this._burstT ?? 0, amp);
    this._bloomGoal = Math.max(this._bloomGoal ?? 0, amp);
    if (amp > 0.25) {
      this._collapseUntil = time + 0.9;
      this._collapseAmp = amp;
      fx.ring(feet, { r0: 2.4, r1: 0.35, life: 0.9, k: 0.9 * amp });
      for (const p of this.models.list.filter((q) => (q.awake ?? 0) > 0.3 && q.mesh.visible).slice(0, Math.round(2 + 4 * amp))) fx.arc(p.pos, head, { color: p.def.color, lift: 0.4, life: 1.2, k: 0.9, follow: () => [p.pos, this.bonePoint('head', [0, 0.08, 0.02])] });
      this.shell.kick(amp);
      this.shell.glint(amp);
      fx.glow(head, 0xe6dcff, amp, 1.0);
    }
    if (amp > 0.6) fx.burst(head.clone().add(new THREE.Vector3(0, 0.35, 0)), { n: Math.round(18 * amp), color: 0xe6dcff, speed: 0.9, life: 1.2, size: 0.04, drag: 2.5, alpha: 0.6 });
  }

  /** Effects that answer events (the same events the sound hears). */
  #fxEvent(type, data) {
    const fx = this.fx;
    if (!fx) return;
    if (type === 'phase-in' || type === 'resolve') {
      // reconstruction: sparks gather onto the body as it closes
      for (const n of ['head', 'chest', 'handL', 'handR', 'spine', 'shinL', 'shinR']) {
        const p = this.bonePoint(n, [0, 0, 0]);
        fx.burst(p.clone().add(new THREE.Vector3(0, 0.2, 0)), { n: 6, color: 0xeee8ff, speed: 0.9, life: 0.9, size: 0.04, to: p, drag: 3 });
      }
    }
    if (type === 'hover-ack') this.label.sweep?.(this._now ?? 0);
    // focus: the hero beat: the stage field contracts toward the figure in two rings, the spectacle
    // swells through the flight (the suit's edge light runs while flying in) and calms on arrival
    if (type === 'activate') {
      // they contract onto where the figure WILL stand (the focus stage centre: it steps there during
      // the flight), and resolve before collapsing to a point (no bright spot on the floor)
      const dest = new THREE.Vector3(STAGE.x, PLATE_Y + 0.01, STAGE.z);
      fx.ring(dest, { r0: 2.6, r1: 0.75, life: (data.dur ?? 2.4) * 0.7, k: 0.7 });
      fx.ring(dest, { r0: 2.0, r1: 0.6, life: (data.dur ?? 2.4) * 0.9, k: 0.45, color: 0xffd9b0 });
      this._burstT = Math.max(this._burstT ?? 0, 0.6);
      this.shell.glint(0.8);
    }
    // piano: each note's energy rises from its key; the left hand's low, wide and warm, the right
    // hand's narrow, quick and cool
    if (type === 'piano-note') {
      const k = this.acts.piano?.keys[data.key];
      if (k) {
        const L = data.hand === 'L';
        const kp = k.m.position.clone().add(new THREE.Vector3(0, 0.06, 0));
        fx.burst(kp, L ? { n: 8, color: 0xffc89a, speed: 0.22, up: 0.45, life: 1.9, size: 0.055, dir: new THREE.Vector3(0, 1, 0), dirK: 0.5, drag: 1.5 } : { n: 7, color: 0xcfe0ff, speed: 0.15, up: 1.4, life: 1.2, size: 0.036, dir: new THREE.Vector3(0, 1, 0), dirK: 0.9, drag: 1 });
        // each hand's harmonic language: the left's broad warm arcs reach up the keyboard slowly,
        // the right's thin cool traces are quick and high
        const keys = this.acts.piano.keys, to = keys[Math.min(keys.length - 1, data.key + (L ? 5 : 3))].m.position.clone().add(new THREE.Vector3(0, 0.06, 0));
        fx.arc(kp, to, L ? { lift: 0.55, life: 2.4, k: 0.6, color: 0xffc89a } : { lift: 0.3, life: 1.1, k: 0.65, color: 0xcfe0ff });
        // an interval: when the other hand sounded within a beat, their harmonics cross above the keys
        const other = this._pianoLast?.[L ? 'R' : 'L'];
        if (other && (this._now ?? 0) - other.t < 0.45) {
          fx.arc(kp, other.p, { lift: 0.45, life: 1.6, k: 0.7, color: 0xffe6f0 });
          fx.ring(kp.clone().lerp(other.p, 0.5).add(new THREE.Vector3(0, 0.35, 0)), { r0: 0.05, r1: 0.45, life: 1.0, k: 0.6, color: 0xffe6f0 });
        }
        (this._pianoLast ??= {})[L ? 'L' : 'R'] = { t: this._now ?? 0, p: kp };
        // the resonance escapes the keyboard: it wraps the torso and joins a body orbit
        if (((this._pn = (this._pn ?? 0) + 1) % 2) === 0) this.orbits.launch('capsule', kp, { color: L ? 0xffc89a : 0xcfe0ff, anchor: 'chest', r: L ? 1.4 : 0.9, life: 7 });
        fx.glow(kp.clone().add(new THREE.Vector3(0, 0.25, 0)), L ? 0xffc89a : 0xcfe0ff, 0.45, 0.35);
      }
    }
    // clarinet: harmonics leave the bell as a ring
    if (type === 'clar-note' && this.acts.clar?.bellP) this.orbits.launch('loop', this.acts.clar.bellP, { anchor: 'chest', life: 6 });
    if (type === 'model-in') {
      const P = this.models.pos(data.id);
      if (P) this.orbits.launch('capsule', P, { color: this.models.by[data.id]?.def.color, anchor: 'head', life: 7 });
    }
    if (type === 'clar-note' && this.acts.clar?.bellP) fx.burst(this.acts.clar.bellP, { n: 14, ring: true, speed: 0.42, up: 0.08, life: 1.3, color: 0xffe2c4, size: 0.035, drag: 1.4 });
  }

  /**
   * Small life when no activity runs: a glance at another station, a hand opening or settling, the
   * shoulders settling, the weight changing legs, a brief phase artifact. Rare and unhurried; the
   * figure is mostly, confidently still.
   */
  #micro(time, dt, m, c) {
    const R = this.review;
    if (this.acts.mode || R?.phase || R?.gesture || c.flying) {
      this._micro = null;
      return;
    }
    const M = (this._micro ??= { next: time + 3, kind: null, t0: 0, dur: 0, n: 0 });
    if (!M.kind && time > M.next && c.hk < 0.3) {
      const kinds = ['glance', 'hand', 'settle', 'weight', 'glance', 'flicker', 'hand'];
      M.kind = kinds[M.n++ % kinds.length];
      M.t0 = time;
      M.dur = { glance: 2.4, hand: 2.2, settle: 1.6, weight: 2.5, flicker: 1.1 }[M.kind];
      if (M.kind === 'glance') {
        const others = this.ctx.app.elements.filter((e) => e !== this);
        if (!others.length) M.kind = 'hand';
        else M.target = others[M.n % others.length].group.position.clone().setY(3.4);
      }
      if (M.kind === 'weight' && !R?.still) this.rig.weight.side = this.rig.weight.side === 'R' ? 'L' : 'R';
      M.side = M.n % 2 ? 'L' : 'R';
    }
    if (!M.kind) return;
    const u = (time - M.t0) / M.dur;
    if (u > 1) {
      M.kind = null;
      M.next = time + 6 + 7 * ((M.n * 0.618) % 1);
      return;
    }
    const k = pulseS(u, 0, 0.25, 0.7, 1) * (1 - c.calm) * (1 - c.hk);
    if (M.kind === 'glance' && M.target) m.attention = { world: M.target, k: 0.75 * k };
    if (M.kind === 'hand') m.arms[M.side] = { curl: 0.1 + 0.3 * (1 - k), thumb: 0.35, foreTwist: 0.15 + 0.5 * k, flex: 0.12 - 0.15 * k };
    if (M.kind === 'settle') m.clavLift = 0.05 * Math.sin(Math.PI * u) * (1 - c.calm);
    if (M.kind === 'flicker') {
      for (const n of ['hand' + M.side, 'fingers' + M.side, 'tips' + M.side, 'index' + M.side, 'indexTip' + M.side, 'foreArm' + M.side]) {
        const i = BONE[n] * 4;
        m.phase[i + 1] = Math.max(m.phase[i + 1], 0.55 * Math.sin(Math.PI * u) * (1 - c.calm));
      }
    }
  }

  /** How fast the overview camera is orbiting (signed, rad/s round the target), for prediction. */
  #trackCamera(dt, camera) {
    const t = this.ctx.app.rig.controls.target;
    const az = Math.atan2(camera.position.x - t.x, camera.position.z - t.z);
    if (this._camAz !== undefined && dt > 0) {
      const v = wrap(az - this._camAz) / dt;
      this.camAzVel = (this.camAzVel ?? 0) + (v - (this.camAzVel ?? 0)) * Math.min(1, dt * 0.8);
    }
    this._camAz = az;
  }

  /**
   * How visible the person will be over the next `ahead` seconds if the idle orbit continues:
   * the camera is turned round its target at its current rate and the standing spot is scored.
   */
  predictVisibility(ahead = [0, 4, 8, 13]) {
    const app = this.ctx.app, cam = app.camera.position, t = app.rig.controls.target;
    const off = new THREE.Vector3().subVectors(cam, t);
    let worst = 1;
    for (const s of ahead) {
      const p = off.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (this.camAzVel ?? 0) * s).add(t);
      worst = Math.min(worst, this.#score(p, this.home));
    }
    return worst;
  }

  /** Review states for the phasing grammar (fixed, deterministic). */
  #reviewPhase(time, m) {
    const R = this.review;
    if (!R?.phase) return;
    const add = (region, v) => {
      for (const n of { head: ['head', 'neck'], chest: ['chest', 'spine'], armL: ['clavL', 'upperArmL', 'foreArmL', 'handL', 'fingersL', 'thumbL', 'indexL'], armR: ['clavR', 'upperArmR', 'foreArmR', 'handR', 'fingersR', 'thumbR', 'indexR'], handR: ['foreArmR', 'handR', 'fingersR', 'thumbR', 'indexR'] }[region]) {
        const i = BONE[n] * 4;
        for (let k = 0; k < 4; k++) m.phase[i + k] = Math.max(m.phase[i + k], v[k]);
      }
    };
    const P = R.phase;
    if (P === 'echo') m.ghosts.push({ kind: 'delay', delay: 0.16, k: 0.5, mask: 'full' }, { kind: 'delay', delay: 0.34, k: 0.32, mask: 'full' }, { kind: 'delay', delay: 0.55, k: 0.2, mask: 'full' });
    if (P === 'slice') for (const r of ['head', 'chest', 'armL', 'armR']) add(r, [0.25, 0.95, 0, 0]);
    if (P === 'const') for (const r of ['head', 'chest', 'armL', 'armR']) add(r, [0.2, 0, 0, 0.96]);
    if (P === 'cell') for (const r of ['chest', 'armL', 'armR']) add(r, [0.2, 0, 0.96, 0]);
    if (P === 'combo') {
      add('head', [0.4, 0, 0, 0.85]);
      add('armL', [0.3, 0.85, 0, 0]);
      add('handR', [0.5, 0, 0.9, 0]);
      add('chest', [0.5, 0, 0, 0]);
      m.ghosts.push({ kind: 'delay', delay: 0.18, k: 0.4, mask: 'arms' }, { kind: 'delay', delay: 0.36, k: 0.22, mask: 'arms' });
    }
    if (R.gesture) {
      const u = Math.sin(time * 2.1);
      m.arms.L = { swing: 0.5 + 0.4 * u, abd: 0.35, elbow: 0.7 - 0.3 * u, foreTwist: -0.8, curl: 0.2, thumb: 0.3 };
      m.arms.R = { swing: 0.3 - 0.25 * u, abd: 0.25 + 0.15 * u, elbow: 0.4, curl: 0.3, thumb: 0.2 };
    }
  }

  /** Gaze, head, torso and the feet's goal (the presentation hierarchy). */
  #attention(time, dt, refCam, m, { hk, fk, flying, toFocus }) {
    const st = this.rig.stance();
    const pv = this.rig.pelvisPos;
    const head = this._v[1].set(pv.x, 1.69, pv.z);
    const cam = this.#human(refCam, this._v[0]);
    const camYaw = Math.atan2(cam.x - head.x, cam.z - head.z);
    const camPitch = -Math.atan2(cam.y - head.y, Math.hypot(cam.x - head.x, cam.z - head.z));
    let yaw = camYaw, pitch = camPitch;
    const take = m.attention ? m.attention.k * (1 - 0.85 * hk) * (1 - 0.8 * this.calm) * (toFocus ? 0 : 1) : 0;
    if (take > 0.001) {
      const t = this.#human(m.attention.world, this._v[2]);
      const ty = Math.atan2(t.x - head.x, t.z - head.z);
      const tp = -Math.atan2(t.y - head.y, Math.hypot(t.x - head.x, t.z - head.z));
      yaw = camYaw + wrap(ty - camYaw) * take;
      pitch = lerp(camPitch, tp, take);
    }
    const wHead = flying ? 9 : 4.2 + 5 * hk + 6 * this.pulse;
    const g = this.att.gaze;
    this.#step(g, g.v + wrap(yaw - g.v), wHead, dt);
    this.#step(this.att.pitch, clamp(pitch, -D(26), D(26)), wHead * 0.8, dt);
    const B = st.yaw;
    const torsoGoal = B + clamp(wrap(g.v - B) * lerp(0.62, 0.9, this.wake ?? 0), -D(36), D(40));
    const t = this.att.torso;
    this.#step(t, t.v + wrap(torsoGoal - t.v), flying ? 3.6 : 1.9 + 1.6 * hk, dt);
    const home = this.home;
    const opt = toFocus ? { tol: D(18), settle: D(7), pace: 2.35, posTol: 0.05, open: D(120), close: D(120) } : hk > 0.3 ? { tol: D(40), settle: D(12), pace: 1.1 } : this.calm > 0.5 ? { tol: D(30), settle: D(8), pace: 1 } : { tol: D(52), settle: D(16), pace: 0.95 };
    // while the hands work (board, keys, instrument, the AI comparison) the stance is fixed: the goal
    // is wherever the feet already are, so no step can begin; the weight moves through the ankles,
    // knees, pelvis and torso instead (a flight to focus still turns the figure)
    // (a turn already under way gets the opening moment to finish, so a stride is never cut short)
    const planted = ['chess', 'piano', 'clarinet', 'models'].includes(this.acts.mode) && !toFocus && !(this.rig.seq && this.acts.t < 2.5);
    if (this.review?.still || planted) this.rig.want(B, st.x, st.z, { tol: 9 });
    else this.rig.want(camYaw + wrap(yaw - camYaw) * 0.4, home.x, home.z, opt);
  }

  /** Phase states per bone (eased), from the activity and the interaction state. */
  #fields(time, dt, m) {
    // a faint wandering charge at the head when nothing else is happening
    m.phase[BONE.head * 4] = Math.max(m.phase[BONE.head * 4], 0.08 + 0.06 * Math.sin(time * 0.31));
    // attention resolves the body: hover and a fresh focus pull it back toward its stable form
    const resolve = 1 - 0.8 * this.order;
    let change = 0, open = 0;
    for (let i = 0; i < NB * 4; i++) {
      const goal = m.phase[i] * (i % 4 === 0 ? 0.45 + 0.55 * resolve : resolve);
      const v0 = this.phase[i];
      const rate = goal > v0 ? 2.4 : 1.2;
      this.phase[i] += (goal - v0) * Math.min(1, dt * rate);
      change += Math.abs(this.phase[i] - v0);
      if (i % 4) open = Math.max(open, this.phase[i]);
    }
    this.uni.uPhase.value.set(this.phase);
    const f = m.full;
    this.full.x += (f.x * resolve - this.full.x) * Math.min(1, dt * 2);
    for (const k of ['y', 'z', 'w']) this.full[k] += (f[k] * resolve - this.full[k]) * Math.min(1, dt * 2.6);
    this.uni.uFull.value.copy(this.full);
    open = Math.max(open, this.full.y, this.full.z, this.full.w);
    // the voice hears how fast the body is visibly changing, and how much of it is still a body
    const act = change / Math.max(dt, 1e-3) / 6 + 0.6 * this.uni.uScan.value.z;
    this.soundState = { activity: (this.soundState?.activity ?? 0) * 0.9 + 0.1 * act, solid: 1 - open, wake: this.wake ?? 0, focus: this.focusK ?? 0, life: this.life ?? 0 };
    const src = m.sources ?? [];
    for (let i = 0; i < 3; i++) {
      const s = src[i];
      if (s) this.uni.uSrc.value[i].set(s.pos.x + this.group.position.x, s.pos.y + this.group.position.y, s.pos.z + this.group.position.z, s.r), this.uni.uSrcK.value[i].set(s.h * resolve, s.e * resolve);
      else this.uni.uSrcK.value[i].set(0, 0);
    }
    // the scan: a sweep of light up the body on arrival, down it on re-engagement
    const sc = this.scan;
    if (sc.t < (sc.dur ?? 1) + (sc.delay ?? 0) + 0.6) {
      sc.t += dt;
      const u = clamp((sc.t - (sc.delay ?? 0)) / (sc.dur ?? 1), 0, 1);
      const y0 = PLATE_Y - 0.3, y1 = PLATE_Y + HUMAN_HEIGHT * S + 0.3;
      const y = sc.dir > 0 ? lerp(y0, y1, u) : lerp(y1, y0, u);
      const env = pulseS(u, 0, 0.08, 0.9, 1.0001) * sc.amp;
      this.uni.uScan.value.set(y, 0.3, 0.9 * env, 0.45 * env);
    } else this.uni.uScan.value.set(0, 0.3, 0, 0);
  }

  /** Echoes replay the body a moment ago; candidate selves are posed copies reaching elsewhere. */
  #ghosts(time, dt, m) {
    const want = { pose: [null, null], delay: [null, null, null] };
    let di = 0;
    for (const g of m.ghosts ?? []) {
      if (g.kind === 'pose') want.pose[g.slot] = g;
      else if (di < 3) want.delay[di++] = g;
    }
    const supp = 1 - 0.85 * this.order;
    this.ghosts.delay.forEach((G, i) => {
      const g = want.delay[i];
      G.kk = (G.kk ?? 0) + ((g ? g.k * supp : 0) - (G.kk ?? 0)) * Math.min(1, dt * 3);
      G.set(G.kk, g ? this.masks[g.mask] ?? this.masks.full : null);
      if (G.kk > 0.003) {
        G.copy(this.history.at(time - (g?.delay ?? G.lastDelay ?? 0.2)));
        // echoes are also a little displaced in space (the body slightly out of register with itself)
        const r = this.uni.uSliceDir.value;
        G.skel.root.position.addScaledVector(r, (i + 1) * 0.03 * (i % 2 ? -1 : 1));
        G.skel.root.updateMatrixWorld(true);
      }
      if (g) G.lastDelay = g.delay;
    });
    this.ghosts.pose.forEach((G, i) => {
      const g = want.pose[i];
      G.kk = (G.kk ?? 0) + ((g ? g.k * supp : 0) - (G.kk ?? 0)) * Math.min(1, dt * 2.5);
      G.set(G.kk, this.masks.full);
      if (G.kk < 0.003) return;
      if (g) G.last = g;
      const L = G.last;
      // the candidate self: the same body, standing a little aside, reaching for another square
      const r = G.rig;
      for (const side of ['L', 'R']) Object.assign(r.feet[side], this.rig.feet[side]);
      const st = this.rig.stance();
      const lx = Math.cos(st.yaw), lz = -Math.sin(st.yaw);
      // the candidate self emerges from the body and separates as it gains weight, then returns
      const sep = L.shift * THREE.MathUtils.smoothstep(G.kk / Math.max(0.01, L.k ?? 0.78), 0, 1);
      for (const side of ['L', 'R']) (r.feet[side].x += lx * sep), (r.feet[side].z += lz * sep);
      r.weight = { ...this.rig.weight };
      r.wSide = this.rig.wSide;
      r.shift = this.rig.shift;
      r.pose = structuredClone(this.rig.pose);
      r.pose.arm[L.arm].ik = L.target.clone().add(new THREE.Vector3(lx * sep, 0, lz * sep));
      r.pose.arm[L.arm].ikK = 1;
      Object.assign(r.pose.arm[L.arm], { palm: L.palm ?? [-0.3, -0.85, 0.4], fingers: null, fdown: 0.9, abs: false, pole: L.pole ?? [0.5, -1, -0.4], curl: 0.3, index: 0.25, thumb: 0.45 });
      r.pose.head.pitch += 0.1;
      r.solve();
    });
  }

  /** A critically damped spring on a named channel: every posture value moves with continuous velocity. */
  #cd(k, goal, w, dt) {
    const L = (this._cdS ??= {}), c = (L[k] ??= { x: goal, v: 0 }), d = Math.min(dt, 1 / 30);
    c.v += (w * w * (goal - c.x) - 2 * w * c.v) * d;
    c.x += c.v * d;
    return c.x;
  }

  /** Breathing, weight and arms: the body's own small life, and what an activity asks of it. */
  #body(time, dt, m) {
    const P = this.rig.pose;
    const st = this.rig.stance();
    this.breathPh += (dt * Math.PI * 2) / (5.2 + 0.6 * Math.sin(time * 0.043) + 0.3 * Math.sin(time * 0.11));
    const br = Math.sin(this.breathPh);
    this.breath = br;
    const wk0 = this.wake ?? 0;
    // the living layer, whole-body and continuous: separate slow rhythms that are correlated through
    // the skeleton (never one sinusoid on every part). It yields to an activity, never resets
    const actK = this.#cd('act', this.acts.mode ? 1 : 0, 2.5, dt);
    const live = 1 - 0.5 * actK;
    const sway = wob(time, 0.37, 0.61, 1.03, 1.3), nod = wob(time, 0.29, 0.53, 0.83, 4.1), twist = wob(time, 0.23, 0.47, 0.71, 2.2), soft = wob(time, 0.19, 0.41, 0.77, 5);
    // irregular attention: a small glance every few seconds, led by the head and passed down the body
    if (time > (this._glAt ?? 2)) {
      this._glAt = time + 2.4 + 4.2 * Math.random();
      this._glY = (Math.random() - 0.5) * D(10);
      this._glP = (Math.random() - 0.5) * D(4.5);
    }
    const gK = live * (1 - 0.55 * wk0) * (this.review?.still ? 0 : 1);
    const g0 = this.#cd('g0', (this._glY ?? 0) * gK, 4.2, dt), g1 = this.#cd('g1', g0, 3.0, dt), g2 = this.#cd('g2', g1, 2.2, dt), g3 = this.#cd('g3', g2, 1.6, dt);
    const gp0 = this.#cd('gp0', (this._glP ?? 0) * gK, 3.6, dt), gp1 = this.#cd('gp1', gp0, 2.4, dt);
    P.pelvisY = 0.004 + 0.0025 * (1 - br) * 0.5 + 0.0016 * (0.5 + 0.5 * soft) + 0.0014 * Math.min(1, Math.abs(g3) / D(5));
    const tw = wrap(this.att.torso.v - st.yaw);
    // the head never swings through the back: beyond its range it holds on the side it was on, and a
    // change of side is a turn of the head (with a planted stance and the camera orbiting behind, the
    // wrap at 180° used to snap it across in one frame)
    const rawHd = wrap(this.att.gaze.v - this.att.torso.v);
    if (Math.abs(rawHd) < D(100)) this._hdS = Math.sign(rawHd) || 1;
    const hdGoal = Math.abs(rawHd) < D(100) ? clamp(rawHd, -D(74), D(74)) : (this._hdS ?? 1) * D(74);
    const hd = this.#cd('hd', hdGoal, Math.abs(hdGoal - (this._cdS?.hd?.x ?? hdGoal)) > D(25) ? 3.5 : 16, dt);
    P.spine.yaw = 0.34 * tw + D(0.25) * twist * live + 0.06 * g2;
    P.chest.yaw = 0.5 * tw + D(0.55) * twist * live + 0.16 * g2;
    P.neck.yaw = 0.34 * hd + 0.3 * g1;
    P.head.yaw = 0.66 * hd + 0.5 * g0;
    const pt = this.att.pitch.v;
    const hp = this.#cd('hp', m.headPitch ?? 0, 5, dt), cp = this.#cd('cp', m.chestPitch ?? 0, 4, dt);
    // a breath lifts the chest and carries the neck a little; the head stays level against it
    P.neck.pitch = 0.07 + 0.4 * pt + 0.008 * br + 0.4 * gp1 - D(0.15) * nod * live;
    P.head.pitch = 0.6 * pt + hp + 0.6 * gp0 - 0.005 * br;
    const wS = this.rig.wS ?? 1;
    // engaged: the head carried slightly forward and tilted toward the free side
    const headDrift = Math.sin(time * 0.17);
    P.head.roll = 0.02 * headDrift - wS * 0.05 + (m.headRoll ?? 0) - D(0.25) * sway * live;
    P.neck.roll = 0.01 * headDrift - D(0.12) * sway * live;
    P.chest.pitch = -0.018 - 0.014 * br + cp + D(0.35) * nod * live;
    P.spine.pitch = 0.01 + 0.5 * cp - 0.004 * br - D(0.2) * nod * live;
    P.pelvisPitch = D(0.25) * nod * live + 0.0025 * br;
    // peering: leaning out round a neighbour that hides the figure, head kept nearly upright
    const cx = STAGE.x / S, cz = STAGE.z / S;
    const off = { x: this.home.x - cx, z: this.home.z - cz }, lx = Math.cos(st.yaw), lz = -Math.sin(st.yaw);
    const lat = off.x * lx + off.z * lz;
    const blockedK = this.visibility ? smoothstep(1 - this.visibility.centre, 0.35, 0.8) : 0;
    const lean = -Math.sign(lat) * smoothstep(Math.abs(lat), 0.1, 0.3) * blockedK * D(7) * (1 - (this.focusK ?? 0));
    this.lean = this.#cd('lean', lean, 1.8, dt);
    const cr = this.#cd('cr', m.chestRoll ?? 0, 6, dt);
    P.spine.roll = 0.45 * this.lean + D(0.25) * sway * live;
    const ty = this.#cd('ty', m.torsoYaw ?? 0, 4.4, dt);
    P.spine.yaw += 0.4 * ty;
    P.chest.yaw += 0.6 * ty;
    P.chest.roll = cr + 0.55 * this.lean + D(0.5) * sway * live + 0.006 * headDrift;
    P.head.roll += -0.55 * this.lean;
    // the lower body: an activity can lean the weight toward one leg, turn the pelvis against the
    // torso (counterbalance) and soften the knees. At rest the weight wanders slowly through the
    // stance (one leg, neutral, the other, neutral): the feet stay planted, the pelvis, knees and
    // ankles carry it, and the head and shoulders answer through the existing counterbalance
    const wc = 0.72 * Math.sin(time * 0.24 + 0.6) + 0.28 * Math.sin(time * 0.097 + 2);
    this.rig.relax = this.#cd('relax', lerp(0.62, 1, actK), 1.6, dt);
    this.rig.wBias = this.#cd('wb', m.weightBias ?? 0, 4.4, dt) + 0.46 * wc * (1 - actK) + 0.04 * (g3 / D(5)) * live;
    P.pelvisYawExtra = this.#cd('py', m.pelvisYaw ?? 0, 5, dt) - D(0.22) * twist * live - 0.05 * g3;
    P.pelvisY += this.#cd('kn', Math.max(m.knees ?? 0, !this.acts.mode ? 0.007 * wk0 : 0), 4, dt);
    // arms: springs (a slight overshoot and settle, never linear); a reach recruits the body: the
    // torso turns and leans toward the target, the clavicle lifts before the hand arrives
    this._armV ??= { L: {}, R: {} };
    let reachYaw = 0, reachLean = 0;
    for (const side of ['L', 'R']) {
      const a = P.arm[side], g = m.arms?.[side], V = this._armV[side];
      const s = side === 'L' ? 1 : -1;
      const open = clamp(0.5 - 0.5 * s * -wS, 0, 1);
      // the arms hang from a living body: the shoulders breathe and settle unevenly, the hands trail the
      // torso's turn, and elbow, wrist and fingers keep a tiny irregular passive motion of their own
      const sd = s * 1.7 + 3;
      const rest = {
        swing: 0.02 + 0.17 * open + 0.015 * Math.sin(time * 0.29 + s) + 0.012 * wob(time, 0.43, 0.67, 1.1, sd) + s * 0.18 * g2,
        abd: 0.06 + 0.15 * open + 0.008 * br + 0.006 * wob(time, 0.31, 0.59, 0.97, sd + 1),
        twist: 0.05 + 0.12 * open,
        elbow: 0.14 + 0.5 * open + 0.03 * Math.sin(time * 0.21 + s * 2) + 0.022 * wob(time, 0.39, 0.73, 1.21, sd + 2),
        foreTwist: 0.1 + 0.45 * open + 0.035 * wob(time, 0.27, 0.51, 0.89, sd + 3),
        flex: 0.08 + 0.1 * open + 0.05 * wob(time, 0.47, 0.83, 1.37, sd + 4),
        dev: 0.025 * wob(time, 0.35, 0.69, 1.13, sd + 5),
        curl: 0.46 - 0.26 * open - (this.wake ?? 0) * (0.1 + 0.05 * Math.sin(time * 0.9 + s)) + 0.05 * wob(time, 0.53, 0.97, 1.61, sd + 6),
        thumb: 0.2 + 0.12 * open + 0.06 * (this.wake ?? 0) + 0.03 * wob(time, 0.41, 0.79, 1.29, sd + 7),
        clav: 0.016 * br + 0.007 * wob(time, s > 0 ? 0.33 : 0.27, 0.63, 1.07, sd + 8) + (m.clavLift ?? 0) - 0.02 * (1 - open) + 0.015 * (this.wake ?? 0),
      };
      const w = 6.5, z = 0.72;
      for (const key in rest) {
        const goal = g?.[key] ?? rest[key];
        V[key] = (V[key] ?? 0) + (w * w * (goal - a[key]) - 2 * z * w * (V[key] ?? 0)) * dt;
        a[key] += V[key] * dt;
      }
      a.index = g?.index !== undefined ? (a.index ?? a.curl) + (g.index - (a.index ?? a.curl)) * Math.min(1, dt * 7) : null;
      // (the index finger drifts a little apart from the others at rest)
      if (g?.index === undefined && !g?.ik && a.ikK < 0.1) a.index = a.curl + 0.035 * wob(time, 0.61, 1.01, 1.57, sd + 9);
      a.tip = g?.tip !== undefined ? (a.tip ?? a.curl * 0.8) + (g.tip - (a.tip ?? a.curl * 0.8)) * Math.min(1, dt * 7) : a.tip === null || a.tip === undefined ? null : Math.abs(a.tip - a.curl * 0.8) < 0.02 ? null : a.tip + (a.curl * 0.8 - a.tip) * Math.min(1, dt * 5);
      // the elbow's pole, the palm and the fingers are smoothed (never switched): no IK branch flip,
      // no wrist snap when an activity changes its intent
      const sm = (cur, goal, k) => (cur ? cur.map((v, i) => v + (goal[i] - v) * Math.min(1, dt * k)) : goal.slice());
      if (g?.pole) a.pole = sm(a.pole, g.pole, 5);
      else if (!g?.ik && a.ikK < 0.02) a.pole = null;
      // the wrist travels to its target on a stiff spring (never an IK snap when the target hops)
      if (g?.ik) {
        if (!a.ik || a.ikK < 0.02) { a.ik = g.ik.clone(); a._ikV = new THREE.Vector3(); }
        const wI = g.ikW ?? 16, zI = 0.82, dI = Math.min(dt, 1 / 30);
        // a travelling wrist arcs up over its path (a pianist's lateral leap), never teleports
        const goal = _tmpV2.copy(g.ik);
        if (g.arc) goal.y += Math.min(0.06, a.ik.distanceTo(g.ik) * g.arc);
        a._ikV.addScaledVector(_tmpV.subVectors(goal, a.ik), wI * wI * dI).multiplyScalar(Math.max(0, 1 - 2 * zI * wI * dI));
        a.ik.addScaledVector(a._ikV, dI);
      }
      // the hand's orientation intents (palm normal, finger direction), held while the IK fades out
      if (g?.palm) {
        if (a.abs !== undefined && a.abs !== !!g.abs) (a.palm = null), (a.fingers = null);
        a.palm = sm(a.palm, g.palm, 8);
        a.fingers = g.fingers ? sm(a.fingers, g.fingers, 8) : null;
        a.abs = !!g.abs;
        a.fdown = (a.fdown ?? 0) + ((g.fdown ?? 0) - (a.fdown ?? 0)) * Math.min(1, dt * 8);
      }
      else if (!g?.ik && a.ikK < 0.02) { a.palm = null; a.fingers = null; }
      // the IK's weight is a critically damped spring: an arm eases into and out of a reach with
      // continuous velocity (no sudden start when an activity begins or ends)
      {
        const goalK = g?.ik ? g.ikK : 0, wK = 7, dK = Math.min(dt, 1 / 30);
        a._ikKV = (a._ikKV ?? 0) + (wK * wK * (goalK - a.ikK) - 2 * wK * (a._ikKV ?? 0)) * dK;
        a.ikK = clamp(a.ikK + a._ikKV * dK, 0, 1);
      }
      if (a.ik && a.ikK > 0.05) {
        const dx = a.ik.x - st.x, dz = a.ik.z - st.z;
        reachYaw += clamp(wrap(Math.atan2(dx, dz) - st.yaw), -0.9, 0.9) * 0.22 * a.ikK;
        reachLean += clamp(Math.hypot(dx, dz) - 0.3, 0, 0.5) * 0.22 * a.ikK;
        a.clav += 0.05 * a.ikK;
      }
    }
    const ry = this.#cd('ry', reachYaw, 6, dt), rl = this.#cd('rl', reachLean, 6, dt);
    P.spine.yaw += 0.4 * ry;
    P.chest.yaw += 0.6 * ry;
    P.spine.pitch += 0.45 * rl;
    P.chest.pitch += 0.55 * rl;
    // a reach goes all the way down: the pelvis counters the torso's turn, the knees give a little
    P.pelvisYawExtra -= 0.2 * ry;
    P.pelvisY += 0.012 * Math.min(1, rl / 0.1);
    this.rig.wBias += clamp(0.22 * ry, -0.12, 0.12);
  }

  stats() {
    const tri = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
    return {
      material: this.matKind,
      label: this.label.kind,
      bodyTris: tri(this.body.geometry),
      proxyTris: tri(this.proxyGeo),
      structureTris: tri(this.structure.geometry),
      ghostsVisible: [...this.ghosts.pose, ...this.ghosts.delay].filter((g) => g.mesh.visible).length,
      cloudActive: this.cloud.active,
      cells: this.cloud.cells.count,
      bones: NB,
      buildMs: Math.round(this.buildMs),
      models: this.models.stats(),
      mode: this.acts.mode,
    };
  }
}
