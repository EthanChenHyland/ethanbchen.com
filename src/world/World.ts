// The render loop, focus logic and adaptive quality follow the structure of 4elements' Opus 5.5
// App.js (MIT, see THIRD_PARTY_NOTICES.md); the scene, views and page integration are this site's own.
import * as THREE from 'three';
import { FrameBudget, TIERS, type Tier } from '../quality';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CameraRig, type View } from './CameraRig';
import { PostFX } from './PostFX';
import { City } from './city';
import { Mosaic } from './mosaic';
import { Piano, type Note } from './piano';
import { Chess, Frog, Notebooks, addStill } from './props';
import { PromptOff } from './promptoff';
import { Room } from './room';
import { type Ctx, type Piece, v3 } from './shared';
import { TowerLogic } from './towerlogic';

export type FocusId = 'overview' | 'contact' | string;

interface Shot { c: THREE.Vector3; az: number; el: number; dist: number; sx: number; sy: number }

// Each shot frames a piece so it sits beside the chapter text: right of centre on wide screens,
// above centre on tall ones where the text panel takes the lower half.
const SHOTS: Record<string, { wide: Shot; tall: Shot; dim: number }> = {
  overview: { wide: { c: v3(1.45, 0.48, -0.3), az: -0.04, el: 0.23, dist: 6.0, sx: 0.8, sy: -0.1 }, tall: { c: v3(0.55, 0.3, -0.1), az: 0, el: 0.6, dist: 7.6, sx: 0, sy: 0.9 }, dim: 1 },
  city: { wide: { c: v3(0.75, 0.32, -0.55), az: -0.12, el: 0.6, dist: 3.2, sx: 0.7, sy: 0 }, tall: { c: v3(0.75, 0.32, -0.55), az: 0.12, el: 0.7, dist: 3.6, sx: 0, sy: 0.75 }, dim: 0.9 },
  promptoff: { wide: { c: v3(2.1, 0.2, -1.2), az: 0.5, el: 0.62, dist: 2.3, sx: 0.55, sy: 0 }, tall: { c: v3(2.05, 0.25, -1.15), az: 0.3, el: 0.45, dist: 2.7, sx: 0, sy: 0.55 }, dim: 0.85 },
  towerlogic: { wide: { c: v3(3.2, 0.86, -0.72), az: -0.55, el: 0.08, dist: 2.45, sx: 0.62, sy: 0 }, tall: { c: v3(3.2, 0.86, -0.72), az: -0.55, el: 0.12, dist: 3.4, sx: 0, sy: 0.32 }, dim: 0.75 },
  piano: { wide: { c: v3(1.95, 0.12, 0.42), az: -0.1, el: 0.72, dist: 2.05, sx: 0.65, sy: 0 }, tall: { c: v3(1.95, 0.12, 0.42), az: -0.1, el: 0.8, dist: 3.1, sx: 0, sy: 0.6 }, dim: 0.85 },
  mosaic: { wide: { c: v3(0.1, 0.02, 0.88), az: 0.0, el: 1.0, dist: 1.6, sx: 0.55, sy: 0 }, tall: { c: v3(0.1, 0.02, 0.88), az: 0, el: 1.1, dist: 2.4, sx: 0, sy: 0.5 }, dim: 0.85 },
  lab: { wide: { c: v3(3.75, 0.14, 0.1), az: -0.65, el: 0.35, dist: 1.4, sx: 0.45, sy: 0 }, tall: { c: v3(3.75, 0.14, 0.1), az: -0.65, el: 0.4, dist: 2, sx: 0, sy: 0.4 }, dim: 0.85 },
  chess: { wide: { c: v3(-1.6, 0.05, 0.8), az: 0.2, el: 0.85, dist: 1.4, sx: 0.4, sy: 0 }, tall: { c: v3(-1.6, 0.05, 0.8), az: 0.2, el: 0.9, dist: 2, sx: 0, sy: 0.4 }, dim: 0.85 },
  contact: { wide: { c: v3(0.72, 0.12, 1.08), az: -0.25, el: 0.32, dist: 1.25, sx: 0.42, sy: -0.12 }, tall: { c: v3(0.72, 0.12, 1.08), az: 0.38, el: 0.35, dist: 1.5, sx: 0, sy: 0.3 }, dim: 0.12 },
};

function viewFrom(s: Shot): View {
  const dir = v3(Math.sin(s.az) * Math.cos(s.el), Math.sin(s.el), Math.cos(s.az) * Math.cos(s.el));
  const forward = dir.clone().negate();
  const right = new THREE.Vector3().crossVectors(forward, THREE.Object3D.DEFAULT_UP).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  // look at a point beside the subject, so the subject lands off-centre
  const target = s.c.clone().addScaledVector(right, -s.sx).addScaledVector(up, -s.sy);
  return { pos: target.clone().addScaledVector(dir, s.dist), target };
}

export interface WorldEvents { onFrame?: (dt: number) => void; onProgress?: (loaded: number, total: number) => void }

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(34, 1, 0.05, 200);
  readonly rig: CameraRig;
  tier: Tier;
  private post: PostFX | null = null;
  private ctx: Ctx;
  private room!: Room;
  city!: City;
  promptoff!: PromptOff;
  towerlogic!: TowerLogic;
  piano!: Piano;
  mosaic!: Mosaic;
  chess!: Chess;
  frog!: Frog;
  private pieces: Piece[] = [];
  private hits: THREE.Object3D[] = [];
  focused: FocusId = 'overview';
  private time = 0;
  private last = performance.now();
  private running = false;
  private budget = new FrameBudget();
  private dpr = 1;
  private dim = 1;
  private dimTarget = 1;
  private idle = 0;
  private needsRender = true;
  private ray = new THREE.Raycaster();
  private tall = false;
  private interactive: boolean;

  constructor(private canvas: HTMLCanvasElement, tier: Tier, readonly events: WorldEvents = {}) {
    this.tier = tier;
    this.interactive = matchMedia('(pointer: fine)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !tier.bloom, powerPreference: 'high-performance', stencil: false, alpha: false });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = tier.shadows > 0;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.dpr = Math.min(window.devicePixelRatio || 1, tier.dpr);
    this.renderer.setPixelRatio(this.dpr);
    this.scene.background = new THREE.Color(0x050608);
    this.scene.fog = new THREE.Fog(0x050608, 9, 80);
    // a dim studio environment so metal reads as metal instead of black
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.16;
    pmrem.dispose();
    this.ctx = { renderer: this.renderer, scene: this.scene, camera: this.camera, tier, uTime: { value: 0 } };
    this.rig = new CameraRig(this.camera, canvas, this.interactive);
    this.rig.controls.addEventListener('start', () => this.poke());
    this.rig.controls.addEventListener('change', () => (this.needsRender = true));
  }

  async init() {
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => this.events.onProgress?.(loaded, total + 2);
    const loader = new THREE.TextureLoader(manager);
    const ctx = this.ctx;
    this.room = new Room(ctx);
    this.scene.add(this.room.group);
    this.city = new City(ctx);
    this.promptoff = new PromptOff(ctx);
    this.towerlogic = new TowerLogic(ctx);
    this.piano = new Piano(ctx);
    this.mosaic = new Mosaic(ctx, loader);
    this.chess = new Chess(ctx);
    this.frog = new Frog(ctx);
    const books = new Notebooks();
    this.pieces = [this.city, this.promptoff, this.towerlogic, this.piano, this.mosaic, this.chess, this.frog, books];
    for (const p of this.pieces) {
      this.scene.add(p.group);
      this.scene.add(p.hit);
      this.hits.push(p.hit);
    }
    addStill(this.scene);

    const [notes] = await Promise.all([
      fetch('/data/minuet-full-notes.json').then((r) => r.json() as Promise<{ notes: Note[] }>).then((d) => d.notes).catch(() => [] as Note[]),
      this.chess.load('/github/chess-demo.json'),
    ]);
    this.piano.setNotes(notes);
    if (!this.tier.motion) this.chess.showStill(17);
    this.events.onProgress?.(1, 1);

    this.post = new PostFX(this.renderer, this.scene, this.camera, this.tier.bloom);
    this.resize();
    this.rig.jumpTo(this.view('overview'));
    this.rig.limitAround(0.38);
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch (e) {
      console.warn('compileAsync failed', e);
    }
    window.addEventListener('resize', this.onResize);
  }

  private onResize = () => {
    const wasTall = this.tall;
    this.resize();
    if (wasTall !== this.tall && !this.rig.busy) this.rig.jumpTo(this.view(this.focused));
    this.needsRender = true;
  };

  private resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.tall = w / h < 0.9;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = this.tall ? 48 : 34;
    this.camera.updateProjectionMatrix();
    this.post?.setSize(w, h, this.dpr);
  }

  view(id: FocusId): View {
    const shot = SHOTS[id] ?? SHOTS.overview;
    return viewFrom(this.tall ? shot.tall : shot.wide);
  }

  /** fly to a piece, the overview or the closing shot; instant when motion is reduced */
  focus(id: FocusId, { instant = false } = {}) {
    if (!(id in SHOTS)) id = 'overview';
    const previous = this.focused;
    this.focused = id;
    for (const p of this.pieces) p.setActive?.(p.id === id);
    this.dimTarget = SHOTS[id].dim;
    const v = this.view(id);
    this.rig.setSway(0);
    if (instant || !this.tier.motion) {
      this.rig.jumpTo(v);
      this.dim = this.dimTarget;
      this.rig.limitAround(id === 'overview' ? 0.38 : 0.22);
    } else {
      const far = previous === 'overview' || id === 'overview';
      this.rig.flyTo(v, { duration: far ? 2.1 : 1.7, arc: far ? 0.35 : 0.25, onDone: () => this.rig.limitAround(id === 'overview' ? 0.38 : 0.22) });
    }
    this.needsRender = true;
  }

  poke() {
    this.idle = 0;
    this.rig.setSway(0);
    if (this.rig.busy && this.focused === 'overview') this.rig.cancel();
  }

  /** id of the piece under a viewport point, or null */
  pick(clientX: number, clientY: number): string | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hit = this.ray.intersectObjects(this.hits, false)[0];
    return hit ? (hit.object.userData.pieceId as string) : null;
  }

  /** viewport position of a piece's label anchor */
  project(id: string): { x: number; y: number; visible: boolean } {
    const p = this.pieces.find((piece) => piece.id === id);
    if (!p) return { x: 0, y: 0, visible: false };
    const v = p.anchor.clone().project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-v.y * 0.5 + 0.5) * rect.height, visible: v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 };
  }

  /** dev helper for framing: world.tune('overview', { el: 0.3 }) */
  tune(id: string, patch: Partial<Shot>) {
    const shot = SHOTS[id];
    if (!shot) return;
    Object.assign(this.tall ? shot.tall : shot.wide, patch);
    this.rig.jumpTo(this.view(id));
    this.needsRender = true;
  }

  invalidate() {
    this.needsRender = true;
  }

  setRunning(on: boolean) {
    if (on === this.running) return;
    this.running = on;
    this.last = performance.now();
    this.renderer.setAnimationLoop(on ? () => this.tick() : null);
  }

  private tick() {
    const now = performance.now();
    const rawDt = (now - this.last) / 1000;
    if (this.tier.fps && rawDt < 1 / this.tier.fps - 0.002) return;
    this.last = now;
    const dt = Math.min(rawDt, 1 / 20);
    const moving = this.tier.motion;
    if (moving) this.time += dt;
    this.ctx.uTime.value = this.time;

    this.idle += dt;
    if (moving && this.idle > 6 && !this.rig.busy && this.interactive) this.rig.setSway(this.focused === 'overview' ? 0.2 : 0.08);
    this.dim += (this.dimTarget - this.dim) * Math.min(1, dt * 1.6);
    this.room.setDim(this.dim);
    const flying = this.rig.busy;
    this.rig.update(dt);

    if (moving || flying) {
      this.room.update(this.time);
      for (const p of this.pieces) p.update(this.time, dt);
      this.needsRender = true;
    } else {
      // the piano follows audio even with reduced motion: that is the visitor's own action
      if (this.piano.time !== null) { this.piano.update(this.time, dt); this.needsRender = true; }
    }
    if (this.needsRender || Math.abs(this.dim - this.dimTarget) > 0.002) {
      this.needsRender = false;
      if (this.post) this.post.render(this.time, dt);
      else this.renderer.render(this.scene, this.camera);
    }
    this.events.onFrame?.(rawDt);
    this.adapt(rawDt);
  }

  private adapt(rawDt: number) {
    if (!this.tier.motion || new URLSearchParams(location.search).has('noadapt')) return;
    const verdict = this.budget.sample(rawDt, document.hidden, this.tier.fps ? 1 / (this.tier.fps - 4) : 1 / 45);
    if (verdict === 'dpr' && this.dpr > 1) {
      this.dpr = Math.max(1, this.dpr - 0.25);
      this.resize();
    } else if (verdict === 'tier' || (verdict === 'dpr' && this.dpr <= 1)) {
      // still slow at the lowest pixel ratio: drop the expensive effects and keep the scene
      this.post?.setBloom(false);
      this.renderer.shadowMap.enabled = false;
      this.tier = { ...TIERS.low, motion: this.tier.motion };
      this.ctx.tier = this.tier;
      this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
    }
  }

  dispose() {
    this.setRunning(false);
    window.removeEventListener('resize', this.onResize);
    this.rig.controls.dispose();
    this.post?.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => x.dispose());
    });
    this.renderer.dispose();
  }
}
