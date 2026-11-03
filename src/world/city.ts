import * as THREE from 'three';
import { type Ctx, type Piece, hitBox, hashGLSL, mat, patchMaterial, rng, v3 } from './shared';

export type Policy = 'housing' | 'transit' | 'parks';
type LotKind = 'empty' | 'home' | 'office' | 'station' | 'park' | 'capitol';

interface Lot { i: number; x: number; z: number; kind: LotKind; height: number; growth: number; built: number }

const CELL = 0.105;
const RADIUS = 0.84;
const TOP = 0.15;

/**
 * City Settlers as a miniature: a grid city on a turntable with the Cumberland bending through it.
 * It idles like the game does: one lot at a time goes up under the crane, and the policy the visitor
 * picks decides what the next lot becomes. Amber pulses are the shared resources moving on the roads.
 */
export class City implements Piece {
  readonly id = 'city';
  readonly group = new THREE.Group();
  readonly hit: THREE.Mesh;
  readonly anchor = v3(0.75, 0.82, -0.55);
  policy: Policy = 'housing';
  private lots: Lot[] = [];
  private buildings: THREE.InstancedMesh;
  private trees: THREE.InstancedMesh;
  private pulses: THREE.InstancedMesh;
  private pulseState: { axis: 0 | 1; line: number; t: number; speed: number }[] = [];
  private roads: number[] = [];
  private crane = new THREE.Group();
  private building: Lot | null = null;
  private wait = 1.5;
  private order = 0;
  private dummy = new THREE.Object3D();
  private pulseMat: THREE.MeshBasicMaterial;
  private active = false;
  onChange?: () => void;

  constructor(private ctx: Ctx) {
    const g = this.group;
    g.position.set(0.75, 0, -0.55);
    const r = rng(11);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.97, 1.0, TOP - 0.01, 72), mat.darkMetal());
    base.position.y = (TOP - 0.01) / 2;
    base.castShadow = base.receiveShadow = true;
    const ground = new THREE.Mesh(new THREE.CylinderGeometry(RADIUS + 0.06, RADIUS + 0.06, 0.012, 72), mat.matte(0x1c1f1a, 0.9));
    ground.position.y = TOP - 0.004;
    ground.receiveShadow = true;
    g.add(base, ground);

    // the grid: roads every fourth row and column, the river where the sine says so
    const n = Math.ceil(RADIUS / CELL);
    const roadTiles: THREE.Vector3[] = [];
    const waterTiles: THREE.Vector3[] = [];
    for (let a = -n; a <= n; a++) {
      for (let b = -n; b <= n; b++) {
        const x = a * CELL, z = b * CELL;
        if (Math.hypot(x, z) > RADIUS) continue;
        const riverZ = 0.22 * Math.sin(x * 3.1 + 0.6) + 0.12;
        if (Math.abs(z - riverZ) < 0.085) { waterTiles.push(v3(x, z, 0)); continue; }
        if (a % 4 === 0 || b % 4 === 0) { roadTiles.push(v3(x, z, 0)); if (a % 4 === 0 && !this.roads.includes(x)) this.roads.push(x); continue; }
        const downtown = Math.exp(-((x + 0.2) ** 2 + (z + 0.25) ** 2) / 0.12);
        const lot: Lot = { i: this.lots.length, x, z, kind: 'empty', height: 0, growth: 1, built: 0 };
        const roll = r();
        if (roll < 0.22) lot.kind = 'empty';
        else if (roll < 0.33) lot.kind = 'park';
        else lot.kind = downtown > 0.35 && r() < 0.75 ? 'office' : 'home';
        lot.height = lot.kind === 'office' ? 0.12 + downtown * (0.25 + r() * 0.35) : 0.04 + r() * 0.08 + downtown * 0.08;
        this.lots.push(lot);
      }
    }
    // the capitol on its hill, nearest the north edge of downtown
    const capitol = this.lots.reduce((best, lot) => (Math.hypot(lot.x + 0.45, lot.z + 0.55) < Math.hypot(best.x + 0.45, best.z + 0.55) ? lot : best));
    capitol.kind = 'capitol';
    capitol.height = 0.07;

    const tile = (tiles: THREE.Vector3[], color: number, y: number, emissive = 0) => {
      const geo = new THREE.BoxGeometry(CELL * 0.98, 0.008, CELL * 0.98);
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, emissive, emissiveIntensity: emissive ? 0.35 : 0 });
      const mesh = new THREE.InstancedMesh(geo, m, tiles.length);
      tiles.forEach((t, k) => {
        this.dummy.position.set(t.x, y, t.y);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(k, this.dummy.matrix);
      });
      mesh.receiveShadow = true;
      g.add(mesh);
    };
    tile(roadTiles, 0x2c2e31, TOP + 0.004);
    tile(waterTiles, 0x0d2233, TOP + 0.001, 0x0b2a45);

    // buildings: one instanced box, windows drawn in the fragment shader from local coordinates
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const warm = new Float32Array(this.lots.length);
    const seed = new Float32Array(this.lots.length);
    this.lots.forEach((lot, k) => { warm[k] = lot.kind === 'office' ? 0 : 1; seed[k] = r(); });
    box.setAttribute('aWarm', new THREE.InstancedBufferAttribute(warm, 1));
    box.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    const buildingMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.7, metalness: 0.1 }), {
      uniforms: { uTime: ctx.uTime },
      vertexHeader: 'attribute float aWarm; attribute float aSeed; varying vec3 vL; varying vec3 vS; varying float vWarm; varying float vSeedB; varying vec3 vNl;',
      vertex: {
        begin_vertex: `vec3 transformed = vec3(position); vL = position; vNl = normal; vWarm = aWarm; vSeedB = aSeed;
          vS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));`,
      },
      fragmentHeader: `uniform float uTime; varying vec3 vL; varying vec3 vS; varying float vWarm; varying float vSeedB; varying vec3 vNl; ${hashGLSL}`,
      fragment: {
        emissivemap_fragment: `
          if (vNl.y < 0.5) {
            vec2 face = abs(vNl.x) > 0.5 ? vec2((vL.z + 0.5) * vS.z, vL.y * vS.y) : vec2((vL.x + 0.5) * vS.x, vL.y * vS.y);
            vec2 grid = face * vec2(70.0, 62.0);
            vec2 f = fract(grid);
            float pane = step(0.3, f.x) * step(f.x, 0.75) * step(0.3, f.y) * step(f.y, 0.72) * step(0.012, vL.y * vS.y);
            float h = hash13(vec3(floor(grid), vSeedB * 57.0));
            float on = step(0.45, h);
            vec3 wc = mix(vec3(0.75, 0.86, 1.0), vec3(1.0, 0.7, 0.38), vWarm);
            totalEmissiveRadiance += wc * pane * on * 1.6;
          }`,
      },
    });
    this.buildings = new THREE.InstancedMesh(box, buildingMat, this.lots.length);
    this.buildings.castShadow = this.buildings.receiveShadow = true;
    g.add(this.buildings);

    // trees: three per park lot
    const cone = new THREE.ConeGeometry(0.022, 0.07, 6);
    cone.translate(0, 0.035, 0);
    this.trees = new THREE.InstancedMesh(cone, mat.matte(0x31482a, 0.9), this.lots.length * 3);
    this.trees.castShadow = true;
    g.add(this.trees);

    // the capitol: a pale body and its tower, a fixed landmark
    const stone = mat.matte(0xb9b2a6, 0.7);
    const cap = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.09), stone);
    body.position.y = 0.03;
    const towerBase = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.035), stone);
    towerBase.position.y = 0.095;
    const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.05, 10), stone);
    cupola.position.y = 0.155;
    for (const part of [body, towerBase, cupola]) part.castShadow = true;
    cap.add(body, towerBase, cupola);
    cap.position.set(capitol.x, TOP, capitol.z);
    g.add(cap);

    // the crane: mast and jib, moved to whichever lot is going up
    const craneMat = mat.matte(0xd9a441, 0.5);
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.42, 0.012), craneMat);
    mast.position.y = 0.21;
    const jib = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.01, 0.01), craneMat);
    jib.position.set(0.07, 0.41, 0);
    const cable = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.16, 0.002), craneMat);
    cable.position.set(0.15, 0.33, 0);
    this.crane.add(mast, jib, cable);
    this.crane.visible = false;
    g.add(this.crane);

    // resource pulses travelling the roads
    this.pulseMat = new THREE.MeshBasicMaterial({ color: 0xffb75a });
    const pulseCount = Math.round(36 * ctx.tier.cityDetail);
    this.pulses = new THREE.InstancedMesh(new THREE.SphereGeometry(0.011, 8, 6), this.pulseMat, pulseCount);
    for (let k = 0; k < pulseCount; k++) {
      this.pulseState.push({ axis: (k % 2) as 0 | 1, line: this.roads[k % this.roads.length], t: r() * 2 - 1, speed: (0.08 + r() * 0.1) * (r() < 0.5 ? 1 : -1) });
    }
    g.add(this.pulses);

    // drop part of the city on weaker tiers by leaving lots empty
    for (const lot of this.lots) if (lot.kind !== 'capitol' && r() > ctx.tier.cityDetail) lot.kind = 'empty';
    this.lots.forEach((lot) => this.writeLot(lot));

    this.hit = hitBox(this.id, 2.0, 1.0, 2.0, v3(0.75, 0.45, -0.55));
  }

  /** what the sketch currently holds, for the chapter's caption */
  stats() {
    let homes = 0, parks = 0, stations = 0;
    for (const lot of this.lots) {
      if (lot.kind === 'home') homes++;
      else if (lot.kind === 'park') parks++;
      else if (lot.kind === 'station') stations++;
    }
    return { homes, parks, stations };
  }

  setPolicy(p: Policy) {
    this.policy = p;
    this.pulseMat.color.set(p === 'transit' ? 0xc5f04e : p === 'parks' ? 0x9fd38a : 0xffb75a);
    this.wait = Math.min(this.wait, 0.2);
  }

  setActive(active: boolean) {
    this.active = active;
  }

  private writeLot(lot: Lot) {
    const d = this.dummy;
    const showBuilding = lot.kind === 'home' || lot.kind === 'office' || lot.kind === 'station';
    const h = Math.max(0.0001, lot.height * (lot.kind === 'station' ? 1 : lot.growth));
    const w = lot.kind === 'station' ? CELL * 0.86 : CELL * (lot.kind === 'office' ? 0.72 : 0.62);
    d.position.set(lot.x, TOP, lot.z);
    d.rotation.set(0, 0, 0);
    d.scale.set(showBuilding ? w : 0.0001, showBuilding ? h : 0.0001, showBuilding ? w * (lot.kind === 'station' ? 0.4 : 1) : 0.0001);
    d.updateMatrix();
    this.buildings.setMatrixAt(lot.i, d.matrix);
    this.buildings.instanceMatrix.needsUpdate = true;
    for (let k = 0; k < 3; k++) {
      const on = lot.kind === 'park';
      const ox = (k - 1) * 0.03, oz = ((k * 37) % 3 - 1) * 0.025;
      d.position.set(lot.x + ox, TOP, lot.z + oz);
      const s = on ? 0.8 + ((lot.i * 7 + k) % 5) * 0.12 : 0.0001;
      d.scale.set(s, s * lot.growth, s);
      d.updateMatrix();
      this.trees.setMatrixAt(lot.i * 3 + k, d.matrix);
    }
    this.trees.instanceMatrix.needsUpdate = true;
  }

  private startNext() {
    let empties = this.lots.filter((l) => l.kind === 'empty');
    if (!empties.length) {
      // the map is full: clear the oldest lot so the city keeps growing
      const oldest = this.lots.filter((l) => l.kind !== 'capitol' && l.kind !== 'office').sort((a, b) => a.built - b.built)[0];
      oldest.kind = 'empty';
      this.writeLot(oldest);
      empties = [oldest];
    }
    // build outward from downtown so the city reads as growing
    empties.sort((a, b) => Math.hypot(a.x + 0.2, a.z + 0.25) - Math.hypot(b.x + 0.2, b.z + 0.25));
    const lot = empties[Math.floor(Math.random() * Math.min(6, empties.length))];
    lot.kind = this.policy === 'housing' ? 'home' : this.policy === 'transit' ? 'station' : 'park';
    lot.height = lot.kind === 'home' ? 0.1 + Math.random() * 0.16 : lot.kind === 'station' ? 0.03 : 0;
    lot.growth = 0;
    lot.built = ++this.order;
    this.building = lot;
    this.crane.position.set(lot.x - 0.06, TOP, lot.z - 0.05);
    this.crane.visible = lot.kind !== 'park';
  }

  update(time: number, dt: number) {
    if (!this.ctx.tier.motion) return;
    const speed = this.active ? 1.6 : 1;
    if (this.building) {
      const lot = this.building;
      lot.growth = Math.min(1, lot.growth + dt * 0.28 * speed);
      this.writeLot(lot);
      this.crane.rotation.y = Math.sin(time * 0.6) * 0.5;
      if (lot.growth >= 1) {
        this.building = null;
        this.crane.visible = false;
        this.wait = 1.2;
        this.onChange?.();
      }
    } else {
      this.wait -= dt * speed;
      if (this.wait <= 0) this.startNext();
    }
    const d = this.dummy;
    const boost = this.policy === 'transit' ? 1.8 : 1;
    this.pulseState.forEach((p, k) => {
      p.t += p.speed * dt * boost;
      if (p.t > 1) p.t = -1;
      if (p.t < -1) p.t = 1;
      const along = p.t * RADIUS;
      const x = p.axis === 0 ? p.line : along;
      const z = p.axis === 0 ? along : p.line;
      const inside = Math.hypot(x, z) < RADIUS - 0.02;
      d.position.set(x, TOP + 0.02, z);
      d.scale.setScalar(inside ? 1 : 0.0001);
      d.updateMatrix();
      this.pulses.setMatrixAt(k, d.matrix);
    });
    this.pulses.instanceMatrix.needsUpdate = true;
  }
}
