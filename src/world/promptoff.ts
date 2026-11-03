import * as THREE from 'three';
import { FINDINGS, type FieldResult } from '../content';
import { type Ctx, type Piece, FONT, MONO, canvasTexture, hitBox, mat, v3 } from './shared';

// Synthetic, non-clinical text in the shape of a challenge report (never one of the event's reports).
const REPORT = [
  'SYNTHETIC KNEE MRI REPORT · PRACTICE SET',
  '',
  'Findings: Complete disruption of the anterior',
  'cruciate ligament fibres with bone bruising.',
  'Medial collateral ligament is intact.',
  'Signal in the posterior horn of the medial',
  'meniscus may represent a tear versus',
  'degeneration. No fracture. Moderate joint',
  'effusion. Cartilage not assessed.',
];
const OUTPUT = [
  '{',
  '  "acl_tear": "present",',
  '  "mcl_injury": "absent",',
  '  "meniscus_tear": "uncertain",',
  '  "fracture": "absent",',
  '  "osteoarthritis": "not_reported",',
  '  "effusion": "present"',
  '}',
];

/**
 * The Great Prompt-Off as a machine: a report printer feeding paper past a scoring screen.
 * The paper carries a synthetic report and the structured output the scorer reads; the screen
 * shows whatever result the chapter's scorer demo last computed.
 */
export class PromptOff implements Piece {
  readonly id = 'promptoff';
  readonly group = new THREE.Group();
  readonly hit: THREE.Mesh;
  readonly anchor = v3(2.0, 0.62, -1.2);
  private paperTex: THREE.CanvasTexture;
  private screen: THREE.CanvasTexture;
  private screenCanvas: HTMLCanvasElement;
  private lamp: THREE.MeshStandardMaterial;
  private active = false;

  constructor(private ctx: Ctx) {
    const g = this.group;
    g.position.set(2.0, 0, -1.28);
    g.rotation.y = 0.2;

    const metal = mat.darkMetal();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.3, 0.46), metal);
    body.position.y = 0.15;
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 0.22), mat.graphite());
    top.position.set(0, 0.33, -0.12);
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.56, 24), mat.matte(0x111111, 0.6));
    roller.rotation.z = Math.PI / 2;
    roller.position.set(0, 0.33, 0.05);
    this.roller = roller;
    for (const part of [body, top, roller]) part.castShadow = part.receiveShadow = true;
    g.add(body, top, roller);

    // indicator lamp that blinks while printing
    this.lamp = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffb75a, emissiveIntensity: 1 });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 10), this.lamp);
    led.position.set(0.25, 0.25, 0.232);
    g.add(led);
    // the machine's own work light, so it reads away from the desk lamp
    const work = new THREE.PointLight(0xffd7a8, 0.5, 1.2, 2);
    work.position.set(0, 0.7, 0.45);
    g.add(work);

    // the paper strip follows a path: out of the slot, over the roller, down and along the desk
    this.paperTex = canvasTexture(512, 1024, (c) => {
      c.fillStyle = '#efe8d8';
      c.fillRect(0, 0, 512, 1024);
      c.fillStyle = '#2a2722';
      let y = 60;
      c.font = `600 22px ${FONT}`;
      c.fillText(REPORT[0], 34, y);
      c.font = `400 21px ${FONT}`;
      for (const line of REPORT.slice(2)) { y += 34; c.fillText(line, 34, y); }
      y += 54;
      c.fillStyle = '#7c776c';
      c.fillRect(34, y - 20, 444, 3);
      c.fillStyle = '#2a2722';
      c.font = `500 20px ${MONO}`;
      for (const line of OUTPUT) { y += 32; c.fillText(line, 34, y); }
      y += 60;
      c.font = `400 18px ${FONT}`;
      c.fillStyle = '#7c776c';
      c.fillText('labels: present · absent · uncertain · not_reported', 34, y);
    });
    this.paperTex.wrapT = THREE.RepeatWrapping;
    const path: [number, number][] = [[0.36, -0.1], [0.375, 0.0], [0.372, 0.07], [0.352, 0.12], [0.322, 0.2], [0.29, 0.25], [0.2, 0.27], [0.1, 0.29], [0.03, 0.33], [0.004, 0.42], [0.004, 0.58]];
    this.paper = new THREE.Mesh(stripGeometry(path, 0.4), new THREE.MeshStandardMaterial({ map: this.paperTex, color: 0xcfc6b4, roughness: 0.95, side: THREE.DoubleSide }));
    this.paper.castShadow = true;
    this.paper.receiveShadow = true;
    g.add(this.paper);

    // scoring screen on its own stand, angled towards the operator
    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = 384;
    this.screenCanvas.height = 288;
    this.screen = new THREE.CanvasTexture(this.screenCanvas);
    this.screen.colorSpace = THREE.SRGBColorSpace;
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.33, 0.2), metal);
    housing.position.set(0.6, 0.165, 0.08);
    housing.castShadow = true;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.285), new THREE.MeshBasicMaterial({ map: this.screen, toneMapped: false }));
    face.position.set(0.6, 0.17, 0.181);
    g.add(housing, face);
    this.drawScore(null);

    this.hit = hitBox(this.id, 1.25, 0.7, 1.1, v3(2.0, 0.3, -1.05));
  }

  private roller: THREE.Mesh;
  private paper: THREE.Mesh;

  /** draw the demo's latest per-field result; null shows the six fields waiting */
  drawScore(results: FieldResult[] | null) {
    const c = this.screenCanvas.getContext('2d')!;
    c.fillStyle = '#0d100c';
    c.fillRect(0, 0, 384, 288);
    c.font = `600 22px ${FONT}`;
    c.fillStyle = '#efe8d8';
    const correct = results ? results.filter((r) => r.ok).length : null;
    c.fillText(correct === null ? 'Six findings' : `${correct} of 6 fields`, 22, 40);
    c.font = `400 17px ${MONO}`;
    FINDINGS.forEach((field, k) => {
      const r = results?.[k];
      c.fillStyle = r ? (r.ok ? '#c5f04e' : '#ff8a6b') : '#8f8a7e';
      c.fillText(`${field}  ${r ? (r.ok ? 'match' : 'miss') : ''}`, 22, 82 + k * 32);
    });
    this.screen.needsUpdate = true;
  }

  setActive(active: boolean) {
    this.active = active;
  }

  update(time: number, dt: number) {
    if (!this.ctx.tier.motion) return;
    const rate = this.active ? 0.05 : 0.018;
    this.paperTex.offset.y += dt * rate;
    this.roller.rotation.x -= dt * rate * 40;
    this.lamp.emissiveIntensity = Math.sin(time * 6) > 0 ? 1.4 : 0.2;
  }
}

/** A ribbon of given width along a 2D path in the (y, z) plane. UV v runs along the path. */
function stripGeometry(path: [number, number][], width: number): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let length = 0;
  const lens = [0];
  for (let k = 1; k < path.length; k++) {
    length += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
    lens.push(length);
  }
  path.forEach(([y, z], k) => {
    pos.push(-width / 2, y, z, width / 2, y, z);
    const v = 1 - lens[k] / 1.05; // the texture is about a metre of paper
    uv.push(0, v, 1, v);
    if (k) {
      const a = (k - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
