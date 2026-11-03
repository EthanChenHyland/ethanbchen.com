import * as THREE from 'three';
import { isBlackKey, pitchName } from '../content';
import { type Ctx, type Piece, FONT, hitBox, mat, v3 } from './shared';

export interface Note { start: number; duration: number; pitch: number; hand: number }

const LOW = 41, HIGH = 84; // F2..C6 covers the Minuet's G2..B5
const WHITE_W = 0.074;
const RW = 1024, RH = 192;

/**
 * Piano MIR on the desk: a keyboard whose display strip runs the real Minuet in G note data with
 * an analysis head. When the chapter plays the recording, keys go down from the same note list the
 * project scores performances against.
 */
export class Piano implements Piece {
  readonly id = 'piano';
  readonly group = new THREE.Group();
  readonly hit: THREE.Mesh;
  readonly anchor = v3(1.95, 0.45, 0.42);
  private notes: Note[] = [];
  private keys = new Map<number, { mesh: THREE.InstancedMesh; index: number; x: number; black: boolean }>();
  private white: THREE.InstancedMesh;
  private black: THREE.InstancedMesh;
  private pressed = new Set<number>();
  private roll: HTMLCanvasElement;
  private rollTex: THREE.CanvasTexture;
  private dummy = new THREE.Object3D();
  /** external clock in seconds (the audio element); null when not playing */
  time: number | null = null;
  private idleTime = 0;
  private taps = new Map<number, number>();
  private last = -1;

  constructor(private ctx: Ctx) {
    const g = this.group;
    g.position.set(1.95, 0, 0.5);
    g.rotation.y = -0.1;

    let whites = 0, blacks = 0;
    for (let p = LOW; p <= HIGH; p++) {
      if (isBlackKey(p)) blacks++;
      else whites++;
    }
    const width = whites * WHITE_W;
    const caseMesh = new THREE.Mesh(new THREE.BoxGeometry(width + 0.12, 0.06, 0.36), mat.graphite());
    caseMesh.position.set(0, 0.03, -0.02);
    const back = new THREE.Mesh(new THREE.BoxGeometry(width + 0.12, 0.05, 0.1), mat.graphite());
    back.position.set(0, 0.085, -0.15);
    caseMesh.castShadow = back.castShadow = true;
    caseMesh.receiveShadow = true;
    g.add(caseMesh, back);

    const whiteGeo = new THREE.BoxGeometry(WHITE_W * 0.94, 0.02, 0.24);
    whiteGeo.translate(0, 0, 0.12);
    const blackGeo = new THREE.BoxGeometry(WHITE_W * 0.55, 0.026, 0.15);
    blackGeo.translate(0, 0, 0.075);
    this.white = new THREE.InstancedMesh(whiteGeo, mat.matte(0xe9e4da, 0.45), whites);
    this.black = new THREE.InstancedMesh(blackGeo, mat.matte(0x0d0d0e, 0.35), blacks);
    this.white.castShadow = this.black.castShadow = true;
    this.white.receiveShadow = true;
    let wi = 0, bi = 0, wx = -width / 2 + WHITE_W / 2;
    for (let p = LOW; p <= HIGH; p++) {
      if (isBlackKey(p)) {
        this.keys.set(p, { mesh: this.black, index: bi++, x: wx - WHITE_W / 2, black: true });
      } else {
        this.keys.set(p, { mesh: this.white, index: wi++, x: wx, black: false });
        wx += WHITE_W;
      }
    }
    for (const p of this.keys.keys()) this.writeKey(p, 0);
    g.add(this.white, this.black);

    // the display strip: a piano roll of the score with an analysis head
    this.roll = document.createElement('canvas');
    this.roll.width = RW;
    this.roll.height = RH;
    this.rollTex = new THREE.CanvasTexture(this.roll);
    this.rollTex.colorSpace = THREE.SRGBColorSpace;
    const stand = new THREE.Mesh(new THREE.BoxGeometry(width * 0.72, 0.19, 0.02), mat.graphite());
    stand.position.set(0, 0.2, -0.19);
    stand.rotation.x = -0.18;
    const display = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.7, 0.17), new THREE.MeshBasicMaterial({ map: this.rollTex, toneMapped: false }));
    display.position.set(0, 0.2, -0.178);
    display.rotation.x = -0.18;
    g.add(stand, display);

    this.hit = hitBox(this.id, width + 0.2, 0.45, 0.6, v3(1.95, 0.15, 0.48));
  }

  /** press one key briefly, for the computer-keyboard easter egg */
  tap(pitch: number) {
    this.taps.set(pitch, 0.35);
  }

  setNotes(notes: Note[]) {
    this.notes = notes;
    this.drawRoll(0);
  }

  private writeKey(pitch: number, depth: number) {
    const key = this.keys.get(pitch);
    if (!key) return;
    const d = this.dummy;
    d.position.set(key.x, key.black ? 0.085 : 0.07, key.black ? -0.15 : -0.155);
    d.rotation.set(depth * 0.07, 0, 0);
    d.updateMatrix();
    key.mesh.setMatrixAt(key.index, d.matrix);
    key.mesh.instanceMatrix.needsUpdate = true;
  }

  private drawRoll(t: number) {
    const c = this.roll.getContext('2d')!;
    c.fillStyle = '#07090b';
    c.fillRect(0, 0, RW, RH);
    const span = 6; // seconds visible
    const headX = RW * 0.3;
    const px = RW / span;
    const y = (p: number) => RH - 14 - ((p - LOW) / (HIGH - LOW)) * (RH - 28);
    for (const n of this.notes) {
      const x0 = headX + (n.start - t) * px;
      const x1 = x0 + n.duration * px;
      if (x1 < 0 || x0 > RW) continue;
      const on = t >= n.start && t < n.start + n.duration;
      c.fillStyle = on ? '#ffffff' : n.hand ? '#5c8aa0' : '#9fd0e8';
      c.fillRect(x0, y(n.pitch) - 3, Math.max(3, x1 - x0 - 2), 6);
    }
    c.fillStyle = 'rgba(159,208,232,0.9)';
    c.fillRect(headX - 1, 0, 2, RH);
    c.font = `500 20px ${FONT}`;
    c.fillStyle = '#c9e6f2';
    const sounding = this.notes.filter((n) => t >= n.start && t < n.start + n.duration).map((n) => pitchName(n.pitch));
    c.fillText(sounding.length ? sounding.join('  ') : 'Minuet in G, BWV Anh. 114', 22, 30);
    this.rollTex.needsUpdate = true;
  }

  update(_time: number, dt: number) {
    const playing = this.time !== null;
    let t: number;
    if (playing) t = this.time!;
    else if (this.ctx.tier.motion) {
      // between plays the strip drifts slowly through the opening bars without pressing keys
      this.idleTime = (this.idleTime + dt * 0.35) % 9.6;
      t = this.idleTime;
    } else t = 0.2;
    const now = new Set<number>();
    if (playing) for (const n of this.notes) if (t >= n.start && t < n.start + n.duration) now.add(n.pitch);
    for (const [p, left] of this.taps) {
      if (left <= 0) this.taps.delete(p);
      else { this.taps.set(p, left - dt); now.add(p); }
    }
    for (const p of this.pressed) if (!now.has(p)) this.writeKey(p, 0);
    for (const p of now) if (!this.pressed.has(p)) this.writeKey(p, 1);
    this.pressed = now;
    const frame = Math.round(t * 30);
    if (frame !== this.last) {
      this.last = frame;
      this.drawRoll(t);
    }
  }
}
