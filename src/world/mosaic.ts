import * as THREE from 'three';
import { type Ctx, type Piece, hitBox, rng, v3 } from './shared';

export const MOSAIC_PHOTOS = [
  { src: '/media/nashville/nashville-skyline-at-night-i-65.jpg', w: 1000, h: 666 },
  { src: '/media/nashville/parthenon-in-nashville-2025.jpg', w: 1000, h: 750 },
  { src: '/media/nashville/tennessee-state-capitol-2009.jpg', w: 1000, h: 1000 },
  { src: '/media/nashville/rymanauditorium1.jpg', w: 841, h: 1000 },
  { src: '/media/nashville/kirkland-hall-at-vanderbilt-university.jpg', w: 927, h: 1000 },
  { src: '/media/nashville/nashville-skyline-2009.jpg', w: 1000, h: 625 },
];

interface Print { mesh: THREE.Mesh; loose: THREE.Matrix4; board: THREE.Matrix4 }

/**
 * Mosaic as prints on the desk. Loose, they lie where they were dropped; when the chapter is open
 * they slide into a collection, the way the app turns finds into a board.
 */
export class Mosaic implements Piece {
  readonly id = 'mosaic';
  readonly group = new THREE.Group();
  readonly hit: THREE.Mesh;
  readonly anchor = v3(0.1, 0.22, 0.85);
  private prints: Print[] = [];
  private k = 0;
  private target = 0;

  constructor(private ctx: Ctx, loader: THREE.TextureLoader) {
    const g = this.group;
    g.position.set(0.1, 0, 0.88);
    const r = rng(3);
    const paper = new THREE.MeshStandardMaterial({ color: 0xcfc8ba, roughness: 0.9 });
    const cols = 3;
    const cell = 0.3;
    MOSAIC_PHOTOS.forEach((photo, k) => {
      const aspect = photo.w / photo.h;
      const h = 0.2, w = Math.min(0.27, h * aspect);
      const tex = loader.load(photo.src);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const print = new THREE.Group();
      const border = new THREE.Mesh(new THREE.BoxGeometry(w + 0.024, 0.003, h + 0.024), paper);
      const image = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
      image.rotation.x = -Math.PI / 2;
      image.position.y = 0.0016;
      border.castShadow = border.receiveShadow = true;
      image.receiveShadow = true;
      print.add(border, image);
      g.add(print);
      const mesh = print as unknown as THREE.Mesh;
      const loose = new THREE.Matrix4().compose(
        v3((r() - 0.5) * 0.9, 0.003 + k * 0.0035, (r() - 0.5) * 0.36),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (r() - 0.5) * 1.4, 0)),
        v3(1, 1, 1),
      );
      const col = k % cols, row = Math.floor(k / cols);
      const board = new THREE.Matrix4().compose(
        v3((col - 1) * cell, 0.003, (row - 0.5) * 0.25),
        new THREE.Quaternion(),
        v3(1, 1, 1),
      );
      this.prints.push({ mesh, loose, board });
    });
    this.apply(0);
    this.hit = hitBox(this.id, 1.05, 0.2, 0.6, v3(0.1, 0.05, 0.88));
  }

  setActive(active: boolean) {
    this.target = active ? 1 : 0;
    if (!this.ctx.tier.motion) {
      this.k = this.target;
      this.apply(this.k);
    }
  }

  private apply(k: number) {
    const a = new THREE.Vector3(), b = new THREE.Vector3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), s = new THREE.Vector3();
    const e = k * k * (3 - 2 * k);
    for (const p of this.prints) {
      p.loose.decompose(a, qa, s);
      p.board.decompose(b, qb, s);
      p.mesh.position.lerpVectors(a, b, e);
      p.mesh.position.y += Math.sin(e * Math.PI) * 0.06; // lifted while it moves
      p.mesh.quaternion.slerpQuaternions(qa, qb, e);
    }
  }

  update(_time: number, dt: number) {
    if (Math.abs(this.k - this.target) < 0.001) return;
    this.k += Math.sign(this.target - this.k) * Math.min(Math.abs(this.target - this.k), dt * 0.9);
    this.apply(this.k);
  }
}
