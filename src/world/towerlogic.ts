import * as THREE from 'three';
import { type Ctx, type Piece, FONT, hitBox, mat, rng, v3 } from './shared';

export type Stage = 'pixels' | 'perception' | 'state' | 'decision';
export const STAGES: Stage[] = ['pixels', 'perception', 'state', 'decision'];

interface Unit { x: number; y: number; vx: number; vy: number; side: 0 | 1; kind: string }

const W = 640, H = 400;
// arena in screen pixels: a portrait field with a river across the middle (drawn sideways here)
const AX = 150, AY = 20, AW = 340, AH = 300;
const CARDS = ['knight', 'archers', 'giant', 'fireball'];

/**
 * TowerLogic on a monitor. A small arena simulation is drawn every frame and then annotated the
 * way the real pipeline sees it: raw pixels, detections, the normalised state vector, then the
 * scored candidate placements and the chosen card. It is a drawing of the method, not the bot.
 */
export class TowerLogic implements Piece {
  readonly id = 'towerlogic';
  readonly group = new THREE.Group();
  readonly hit: THREE.Mesh;
  readonly anchor = v3(3.2, 1.32, -0.72);
  stage: Stage = 'perception';
  private auto = true;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private units: Unit[] = [];
  private clock = 0;
  private redraw = 0;
  private autoClock = 0;
  private r = rng(5);
  private choice = { x: 0.5, y: 0.7, card: 0 };

  constructor(private ctx: Ctx) {
    const g = this.group;
    g.position.set(3.2, 0, -0.72);
    g.rotation.y = -0.55;
    const metal = mat.darkMetal();
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.025, 0.26), metal);
    foot.position.y = 0.0125;
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.48, 0.04), metal);
    neck.position.set(0, 0.26, -0.06);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.8, 0.05), mat.graphite());
    bezel.position.set(0, 0.86, 0);
    for (const part of [foot, neck, bezel]) part.castShadow = part.receiveShadow = true;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.16, 0.725), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    screen.position.set(0, 0.86, 0.026);
    g.add(foot, neck, bezel, screen);

    // a soft wash of screen light on the desk in front of the monitor
    const glow = new THREE.PointLight(0x9fbfd0, 0.6, 1.6, 2);
    glow.position.set(0, 0.8, 0.35);
    g.add(glow);

    for (let k = 0; k < 9; k++) this.spawn(k % 2 as 0 | 1);
    this.draw();
    this.hit = hitBox(this.id, 1.3, 1.25, 0.6, v3(3.2, 0.75, -0.72));
  }

  private spawn(side: 0 | 1) {
    const lane = this.r() < 0.5 ? 0.27 : 0.73;
    const kinds = ['knight', 'archer', 'giant', 'goblin'];
    this.units.push({
      x: lane + (this.r() - 0.5) * 0.08, y: side ? 0.15 + this.r() * 0.2 : 0.65 + this.r() * 0.2,
      vx: 0, vy: (side ? 1 : -1) * (0.03 + this.r() * 0.03), side, kind: kinds[Math.floor(this.r() * kinds.length)],
    });
  }

  private manualStage: Stage = 'perception';

  setStage(stage: Stage, manual = true) {
    this.stage = stage;
    if (manual) {
      this.auto = false;
      this.manualStage = stage;
    }
    this.draw();
  }

  setActive(active: boolean) {
    // in its chapter the monitor holds the stage the visitor picked; elsewhere it cycles
    this.auto = !active;
    if (active) this.setStage(this.manualStage, false);
  }

  /** the 30-value input: 26 state values from the field + 4 for the hand */
  private stateVector(): number[] {
    const v: number[] = [];
    const lanes = [0.27, 0.73];
    for (const side of [0, 1]) for (const lane of lanes) {
      const near = this.units.filter((u) => u.side === side && Math.abs(u.x - lane) < 0.15);
      v.push(Math.min(1, near.length / 4));
      v.push(near.length ? near.reduce((s, u) => s + u.y, 0) / near.length : 0);
      v.push(near.length ? Math.min(...near.map((u) => Math.abs(u.y - 0.5))) * 2 : 1);
    }
    for (let k = 0; k < 6; k++) v.push(1); // tower health: nothing in this sketch damages them
    for (let k = 0; k < 8; k++) {
      // occupancy of eight bands down the field
      const inBand = this.units.filter((u) => Math.floor(u.y * 8) === k).length;
      v.push(Math.min(1, inBand / 3));
    }
    for (let k = 0; k < 4; k++) v.push(k === this.choice.card ? 1 : 0.25);
    return v;
  }

  private draw() {
    const c = this.g;
    c.fillStyle = '#08090a';
    c.fillRect(0, 0, W, H);
    // the arena
    c.fillStyle = '#3f5034';
    c.fillRect(AX, AY, AW, AH);
    c.fillStyle = '#4a5d3c';
    for (let k = 0; k < 10; k++) if (k % 2) c.fillRect(AX, AY + (k * AH) / 10, AW, AH / 10);
    c.fillStyle = '#2b5f78';
    c.fillRect(AX, AY + AH * 0.47, AW, AH * 0.06);
    c.fillStyle = '#6b5a45';
    for (const lane of [0.27, 0.73]) c.fillRect(AX + lane * AW - 14, AY + AH * 0.46, 28, AH * 0.08);
    const towers = [[0.27, 0.12, 1], [0.73, 0.12, 1], [0.5, 0.04, 1], [0.27, 0.88, 0], [0.73, 0.88, 0], [0.5, 0.96, 0]];
    for (const [x, y, side] of towers) {
      c.fillStyle = side ? '#7a3b33' : '#355c86';
      c.fillRect(AX + x * AW - 16, AY + y * AH - 12, 32, 24);
    }
    for (const u of this.units) {
      c.fillStyle = u.side ? '#d06a55' : '#7fb1e0';
      c.beginPath();
      c.arc(AX + u.x * AW, AY + u.y * AH, u.kind === 'giant' ? 9 : 6, 0, Math.PI * 2);
      c.fill();
    }
    // hand of four cards under the arena
    CARDS.forEach((name, k) => {
      c.fillStyle = k === this.choice.card && this.stage === 'decision' ? '#c5f04e' : '#2a2c2f';
      c.fillRect(AX + k * 86, AY + AH + 14, 78, 52);
      c.fillStyle = k === this.choice.card && this.stage === 'decision' ? '#10120c' : '#c8c3b8';
      c.font = `500 15px ${FONT}`;
      c.fillText(name, AX + k * 86 + 8, AY + AH + 46);
    });

    const accent = '#c5f04e';
    if (this.stage === 'perception' || this.stage === 'state' || this.stage === 'decision') {
      c.strokeStyle = accent;
      c.lineWidth = 2;
      c.font = `500 13px ${FONT}`;
      c.fillStyle = accent;
      const labelled: [number, number][] = [];
      for (const u of this.units) {
        const s = u.kind === 'giant' ? 13 : 10;
        const x = AX + u.x * AW, y = AY + u.y * AH;
        c.strokeRect(x - s, y - s, s * 2, s * 2);
        // one class label per crowd, so the names stay readable
        if (this.stage === 'perception' && labelled.every(([lx, ly]) => Math.hypot(lx - x, ly - y) > 46)) {
          c.fillText(u.kind, x + s + 3, y + 4);
          labelled.push([x, y]);
        }
      }
      if (this.stage === 'perception') {
        for (const [x, y] of towers) c.strokeRect(AX + x * AW - 19, AY + y * AH - 15, 38, 30);
      }
    }
    // the side panel says which stage is on screen in plain words
    c.fillStyle = '#efe8d8';
    c.font = `600 20px ${FONT}`;
    const titles: Record<Stage, string> = { pixels: 'Screenshot', perception: 'Detections', state: 'Game state', decision: 'Decision' };
    c.fillText(titles[this.stage], 20, 44);
    c.font = `400 14px ${FONT}`;
    c.fillStyle = '#9b968b';
    const notes: Record<Stage, string[]> = {
      pixels: ['ADB frame from', 'the emulator'],
      perception: ['ONNX field detector', 'hand-card classifier'],
      state: ['26 field values', '+ 4 for the hand'],
      decision: ['policy scores', 'each placement'],
    };
    notes[this.stage].forEach((line, k) => c.fillText(line, 20, 72 + k * 20));

    if (this.stage === 'state') {
      const v = this.stateVector();
      const bw = 108 / 6;
      v.forEach((value, k) => {
        const col = k % 6, row = Math.floor(k / 6);
        c.fillStyle = k >= 26 ? '#efe8d8' : accent;
        c.globalAlpha = 0.25 + value * 0.75;
        c.fillRect(20 + col * bw, 130 + row * (bw + 2), bw - 3, bw - 1);
      });
      c.globalAlpha = 1;
      c.fillStyle = '#9b968b';
      c.fillText('30-value input', 20, 250);
    }
    if (this.stage === 'decision') {
      const r = rng(Math.floor(this.clock));
      for (let k = 0; k < 7; k++) {
        const x = 0.15 + r() * 0.7, y = 0.58 + r() * 0.34, s = r();
        c.strokeStyle = `rgba(197,240,78,${0.25 + s * 0.5})`;
        c.beginPath();
        c.arc(AX + x * AW, AY + y * AH, 4 + s * 10, 0, Math.PI * 2);
        c.stroke();
      }
      const px = AX + this.choice.x * AW, py = AY + this.choice.y * AH;
      c.strokeStyle = accent;
      c.lineWidth = 2.5;
      c.beginPath();
      c.arc(px, py, 16, 0, Math.PI * 2);
      c.moveTo(px - 26, py); c.lineTo(px + 26, py);
      c.moveTo(px, py - 26); c.lineTo(px, py + 26);
      c.stroke();
      c.fillStyle = '#efe8d8';
      c.fillText(`play ${CARDS[this.choice.card]}`, 20, 140);
      c.fillStyle = '#9b968b';
      c.fillText('or log it as a dry run', 20, 160);
    }
    this.tex.needsUpdate = true;
  }

  update(_time: number, dt: number) {
    if (!this.ctx.tier.motion) return;
    this.clock += dt;
    for (const u of this.units) {
      u.y += u.vy * dt;
      if (Math.abs(u.y - 0.5) < 0.04) u.x += ((u.x < 0.5 ? 0.27 : 0.73) - u.x) * dt * 2; // cross at the bridge
    }
    this.units = this.units.filter((u) => u.y > 0.06 && u.y < 0.94);
    while (this.units.length < 9) this.spawn(this.r() < 0.5 ? 0 : 1);
    if (this.auto) {
      this.autoClock += dt;
      if (this.autoClock > 3.2) {
        this.autoClock = 0;
        this.stage = STAGES[(STAGES.indexOf(this.stage) + 1) % STAGES.length];
        if (this.stage === 'decision') this.choice = { x: 0.2 + this.r() * 0.6, y: 0.62 + this.r() * 0.25, card: Math.floor(this.r() * 4) };
      }
    } else if (this.stage === 'decision' && Math.floor(this.clock / 2.5) !== Math.floor((this.clock - dt) / 2.5)) {
      this.choice = { x: 0.2 + this.r() * 0.6, y: 0.62 + this.r() * 0.25, card: Math.floor(this.r() * 4) };
    }
    this.redraw -= dt;
    if (this.redraw <= 0) {
      this.redraw = 1 / 15;
      this.draw();
    }
  }
}
