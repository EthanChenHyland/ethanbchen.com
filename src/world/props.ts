import * as THREE from 'three';
import { type Ctx, type Piece, FONT, canvasTexture, hitBox, mat, v3 } from './shared';

// ---------- chess: FunChessEngine replaying one of its recorded self-play games ----------

interface Ply { fen: string; uci: string; san: string; search?: { score?: number; depth?: number } }
export interface ChessStatus { moveNumber: number; san: string; white: boolean; score: number | null; total: number; ply: number }

const SQ = 0.078;
const PROFILES: Record<string, [number, number][]> = {
  p: [[0.3, 0], [0.3, 0.08], [0.18, 0.14], [0.12, 0.38], [0.2, 0.44], [0.16, 0.52], [0.2, 0.62], [0.14, 0.74], [0, 0.78]],
  r: [[0.34, 0], [0.34, 0.1], [0.22, 0.18], [0.2, 0.7], [0.3, 0.74], [0.3, 0.92], [0.22, 0.92], [0.22, 0.86], [0, 0.86]],
  n: [[0.34, 0], [0.34, 0.1], [0.22, 0.2], [0.18, 0.45], [0.24, 0.5], [0, 0.5]],
  b: [[0.32, 0], [0.32, 0.1], [0.2, 0.18], [0.13, 0.6], [0.24, 0.66], [0.16, 0.72], [0.2, 0.9], [0.1, 1.04], [0.05, 1.08], [0, 1.08]],
  q: [[0.36, 0], [0.36, 0.1], [0.22, 0.2], [0.14, 0.8], [0.28, 0.9], [0.2, 0.98], [0.26, 1.16], [0.12, 1.2], [0, 1.24]],
  k: [[0.36, 0], [0.36, 0.1], [0.22, 0.2], [0.15, 0.86], [0.28, 0.94], [0.22, 1.02], [0.24, 1.16], [0, 1.18]],
};

function pieceGeometry(type: string): THREE.BufferGeometry {
  const pts = PROFILES[type].map(([x, y]) => new THREE.Vector2(x * SQ * 1.15, y * SQ * 1.15));
  const geo = new THREE.LatheGeometry(pts, 24);
  if (type === 'n' || type === 'k') {
    // a knight's head or the king's cross, merged by hand into one geometry
    const extra = type === 'n' ? new THREE.BoxGeometry(0.14 * SQ * 1.15 * 2, 0.5 * SQ * 1.15, 0.36 * SQ * 1.15) : new THREE.BoxGeometry(0.06 * SQ, 0.22 * SQ, 0.06 * SQ);
    if (type === 'n') { extra.rotateX(-0.45); extra.translate(0, 0.72 * SQ * 1.15, 0.05 * SQ); } else extra.translate(0, 1.28 * SQ * 1.15, 0);
    const merged = mergeTwo(geo.toNonIndexed(), extra.toNonIndexed());
    return merged;
  }
  return geo;
}

function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal']) {
    const A = a.getAttribute(name) as THREE.BufferAttribute, B = b.getAttribute(name) as THREE.BufferAttribute;
    const arr = new Float32Array(A.array.length + B.array.length);
    arr.set(A.array as Float32Array, 0);
    arr.set(B.array as Float32Array, A.array.length);
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  return out;
}

export class Chess implements Piece {
  readonly id = 'chess';
  readonly group = new THREE.Group();
  readonly hit: THREE.Mesh;
  readonly anchor = v3(-1.6, 0.25, 0.8);
  private geos: Record<string, THREE.BufferGeometry> = {};
  private whiteMat = mat.matte(0xe6dccb, 0.5);
  private blackMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.3, metalness: 0.2 });
  private pool: THREE.Mesh[] = [];
  private live = new Map<string, THREE.Mesh>();
  private plies: Ply[] = [];
  private ply = -1;
  private clock = 0;
  private anim: { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; k: number; captured?: THREE.Mesh } | null = null;
  onMove?: (status: ChessStatus) => void;

  constructor(private ctx: Ctx) {
    const g = this.group;
    g.position.set(-1.6, 0, 0.8);
    g.rotation.y = 0.18;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(SQ * 8 + 0.06, 0.03, SQ * 8 + 0.06), new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 0.5 }));
    frame.position.y = 0.015;
    frame.castShadow = frame.receiveShadow = true;
    g.add(frame);
    const squares = new THREE.InstancedMesh(new THREE.BoxGeometry(SQ, 0.004, SQ), new THREE.MeshStandardMaterial({ roughness: 0.45 }), 64);
    const light = new THREE.Color(0xc8b28e), dark = new THREE.Color(0x5b3f2a);
    const d = new THREE.Object3D();
    for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) {
      d.position.copy(this.squarePos(f, r));
      d.position.y = 0.032;
      d.updateMatrix();
      squares.setMatrixAt(f * 8 + r, d.matrix);
      squares.setColorAt(f * 8 + r, (f + r) % 2 ? light : dark);
    }
    squares.receiveShadow = true;
    g.add(squares);
    for (const t of 'prnbqk') this.geos[t] = pieceGeometry(t);
    this.sync('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    this.hit = hitBox(this.id, 0.78, 0.25, 0.78, v3(-1.6, 0.1, 0.8));
  }

  private squarePos(file: number, rank: number) {
    return v3((file - 3.5) * SQ, 0.034, (3.5 - rank) * SQ);
  }

  async load(url: string) {
    try {
      const data = (await (await fetch(url)).json()) as { moves: Ply[] };
      this.plies = data.moves;
    } catch {
      this.plies = [];
    }
  }

  fenAt(ply: number): string | null {
    return this.plies[ply]?.fen ?? null;
  }

  status(): ChessStatus | null {
    const p = this.plies[this.ply];
    if (!p) return null;
    return { moveNumber: Math.floor(this.ply / 2) + 1, san: p.san, white: this.ply % 2 === 0, score: p.search?.score ?? null, total: this.plies.length, ply: this.ply };
  }

  private take(type: string, white: boolean): THREE.Mesh {
    const mesh = this.pool.pop() ?? new THREE.Mesh();
    mesh.geometry = this.geos[type];
    mesh.material = white ? this.whiteMat : this.blackMat;
    mesh.castShadow = true;
    mesh.visible = true;
    mesh.rotation.y = type === 'n' ? (white ? Math.PI : 0) : 0;
    this.group.add(mesh);
    return mesh;
  }

  private sync(fen: string) {
    for (const m of this.live.values()) { m.visible = false; this.pool.push(m); }
    this.live.clear();
    const rows = fen.split(' ')[0].split('/');
    rows.forEach((row, i) => {
      let file = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) { file += Number(ch); continue; }
        const rank = 7 - i;
        const mesh = this.take(ch.toLowerCase(), ch === ch.toUpperCase());
        mesh.position.copy(this.squarePos(file, rank));
        this.live.set(`${file}${rank}`, mesh);
        file++;
      }
    });
  }

  private step() {
    if (!this.plies.length) return;
    this.ply++;
    if (this.ply >= this.plies.length) {
      this.ply = -1;
      this.sync('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      return;
    }
    const p = this.plies[this.ply];
    const ff = p.uci.charCodeAt(0) - 97, fr = Number(p.uci[1]) - 1, tf = p.uci.charCodeAt(2) - 97, tr = Number(p.uci[3]) - 1;
    const mesh = this.live.get(`${ff}${fr}`);
    if (!mesh || !this.ctx.tier.motion) {
      this.sync(p.fen);
    } else {
      this.anim = { mesh, from: mesh.position.clone(), to: this.squarePos(tf, tr), k: 0, captured: this.live.get(`${tf}${tr}`) };
    }
    this.onMove?.(this.status()!);
  }

  update(_time: number, dt: number) {
    if (this.anim) {
      const a = this.anim;
      a.k = Math.min(1, a.k + dt * 1.8);
      const e = a.k * a.k * (3 - 2 * a.k);
      a.mesh.position.lerpVectors(a.from, a.to, e);
      a.mesh.position.y += Math.sin(e * Math.PI) * 0.05;
      if (a.captured && e > 0.6) a.captured.visible = false;
      if (a.k >= 1) {
        this.anim = null;
        this.sync(this.plies[this.ply].fen);
      }
      return;
    }
    if (!this.ctx.tier.motion) return;
    this.clock += dt;
    const wait = this.ply === -1 ? 3.5 : this.ply === this.plies.length - 1 ? 5 : 2.6;
    if (this.clock > wait) {
      this.clock = 0;
      this.step();
    }
  }

  /** reduced motion: show a settled middlegame position instead of an empty opening */
  showStill(ply: number) {
    if (!this.plies.length) return;
    this.ply = Math.min(ply, this.plies.length - 1);
    this.sync(this.plies[this.ply].fen);
  }
}

// ---------- the frog ----------

export class Frog implements Piece {
  readonly id = 'frog';
  readonly group = new THREE.Group();
  readonly hit: THREE.Mesh;
  readonly anchor = v3(0.72, 0.3, 1.08);
  private pupils: THREE.Mesh[] = [];
  private body = new THREE.Group();
  private hop = 0;
  private blink = 3;
  private look = 0;
  lookAt = 0;

  constructor(private ctx: Ctx) {
    const g = this.group;
    g.position.set(0.72, 0, 1.08);
    g.rotation.y = -0.15;
    const skin = new THREE.MeshStandardMaterial({ color: 0x86b03e, roughness: 0.55 });
    const belly = mat.matte(0xc9c79a, 0.7);
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.1, 28, 20), skin);
    torso.scale.set(1.05, 0.72, 1);
    torso.position.y = 0.07;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 28, 20), skin);
    head.scale.set(1.25, 0.72, 1);
    head.position.set(0, 0.12, 0.06);
    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 14), belly);
    chin.scale.set(1.3, 0.55, 1);
    chin.position.set(0, 0.085, 0.085);
    this.body.add(torso, head, chin);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 14), skin);
      eye.position.set(side * 0.05, 0.165, 0.065);
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), mat.matte(0xe8e2c8, 0.4));
      white.position.set(side * 0.052, 0.172, 0.078);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 10), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.15 }));
      pupil.position.set(side * 0.054, 0.174, 0.094);
      this.pupils.push(pupil);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), skin);
      foot.scale.set(1.3, 0.35, 1.6);
      foot.position.set(side * 0.06, 0.01, 0.1);
      const thigh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 18, 12), skin);
      thigh.scale.set(0.8, 0.7, 1.3);
      thigh.position.set(side * 0.09, 0.04, -0.02);
      this.body.add(eye, white, pupil, foot, thigh);
    }
    this.body.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    g.add(this.body);
    this.hit = hitBox(this.id, 0.3, 0.3, 0.3, v3(0.72, 0.12, 1.08));
  }

  jump() {
    if (this.hop <= 0) this.hop = 1;
  }

  update(_time: number, dt: number) {
    if (!this.ctx.tier.motion) return;
    this.blink -= dt;
    const closed = this.blink < 0.12;
    for (const p of this.pupils) p.scale.y = closed ? 0.15 : 1;
    if (this.blink < 0) this.blink = 2.5 + Math.random() * 4;
    this.look += (this.lookAt - this.look) * Math.min(1, dt * 3);
    this.body.rotation.y = this.look * 0.6;
    if (this.hop > 0) {
      this.hop = Math.max(0, this.hop - dt * 1.6);
      const t = 1 - this.hop;
      this.body.position.y = Math.sin(t * Math.PI) * 0.12;
      this.body.scale.y = 1 - Math.sin(t * Math.PI * 2) * 0.08;
    }
  }
}

// ---------- the lab: a stack of notebooks, one per side project ----------

export const LAB_SPINES = ['Clarity', 'WinCodex', 'FunChessEngine', 'avoid.love', 'Wifi Concierge'];

export class Notebooks implements Piece {
  readonly id = 'lab';
  readonly group = new THREE.Group();
  readonly hit: THREE.Mesh;
  readonly anchor = v3(3.75, 0.4, 0.1);

  constructor() {
    const g = this.group;
    g.position.set(3.75, 0, 0.1);
    g.rotation.y = -0.65;
    const covers = [0x2b3a2f, 0x1f2a3a, 0x3a2a22, 0x4a1d1d, 0x2c3c45];
    let y = 0;
    LAB_SPINES.forEach((title, k) => {
      const h = 0.045 + (k % 2) * 0.01;
      const spine = canvasTexture(512, 64, (c) => {
        c.fillStyle = `#${covers[k].toString(16).padStart(6, '0')}`;
        c.fillRect(0, 0, 512, 64);
        c.fillStyle = '#e9e1cf';
        c.font = `500 30px ${FONT}`;
        c.fillText(title, 24, 43);
      });
      const side = new THREE.MeshStandardMaterial({ color: covers[k], roughness: 0.7 });
      const pages = mat.matte(0xd9d1bf, 0.9);
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.36, h, 0.26), [pages, side, side, side, new THREE.MeshStandardMaterial({ map: spine, roughness: 0.7 }), side]);
      book.position.set((k % 3 - 1) * 0.012, y + h / 2, ((k * 7) % 3 - 1) * 0.01);
      book.rotation.y = ((k * 5) % 4 - 1.5) * 0.05;
      book.castShadow = book.receiveShadow = true;
      g.add(book);
      y += h;
    });
    this.hit = hitBox(this.id, 0.45, 0.35, 0.4, v3(3.75, 0.14, 0.1));
  }

  update() {}
}

/** Vanderbilt black-and-gold mug and a pair of headphones: not clickable, just the desk being a desk. */
export function addStill(scene: THREE.Object3D) {
  const mug = new THREE.Group();
  const label = canvasTexture(512, 128, (c) => {
    c.fillStyle = '#121212';
    c.fillRect(0, 0, 512, 128);
    c.fillStyle = '#c9a54a';
    c.font = `600 96px ${FONT}`;
    c.fillText('V', 214, 100);
  });
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.052, 0.12, 32, 1, true), new THREE.MeshStandardMaterial({ map: label, roughness: 0.35, side: THREE.DoubleSide }));
  outer.position.y = 0.06;
  outer.rotation.y = -1.9;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.052, 32), mat.matte(0x121212, 0.4));
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = 0.004;
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.05, 32), mat.matte(0x1d120a, 0.2));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.1;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.008, 10, 24, Math.PI), mat.matte(0x121212, 0.35));
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(0.055, 0.06, 0);
  for (const p of [outer, handle]) p.castShadow = true;
  mug.add(outer, bottom, coffee, handle);
  mug.position.set(3.3, 0, 0.78);
  scene.add(mug);

  const phones = new THREE.Group();
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 10, 40, Math.PI), mat.matte(0x18181a, 0.5));
  band.rotation.x = -Math.PI / 2 + 0.25;
  band.position.y = 0.03;
  phones.add(band);
  for (const side of [-1, 1]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.035, 28), mat.matte(0x202022, 0.45));
    cup.rotation.z = Math.PI / 2;
    cup.position.set(side * 0.11, 0.035, 0);
    cup.castShadow = true;
    phones.add(cup);
  }
  phones.position.set(-0.6, 0, 0.3);
  phones.rotation.y = 0.9;
  scene.add(phones);
}
