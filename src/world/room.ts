import * as THREE from 'three';
import { type Ctx, hashGLSL, rng, canvasTexture, mat } from './shared';

/**
 * The room: a dark walnut desk, a desk lamp, and a window onto downtown Nashville at night.
 * The skyline is procedural; its one recognisable tower is the AT&T Building's twin spires.
 */
export class Room {
  readonly group = new THREE.Group();
  readonly lamp: THREE.SpotLight;
  private hemi: THREE.HemisphereLight;
  private moon: THREE.DirectionalLight;
  private bulb: THREE.MeshStandardMaterial;
  private skyMat: THREE.ShaderMaterial;
  private towersMat: THREE.ShaderMaterial;
  private base = { lamp: 0, hemi: 0, moon: 0 };

  constructor(ctx: Ctx) {
    const g = this.group;

    // desk: walnut grain drawn once onto a canvas
    const grain = canvasTexture(1024, 512, (c) => {
      c.fillStyle = '#3b2a1f';
      c.fillRect(0, 0, 1024, 512);
      const r = rng(7);
      for (let i = 0; i < 260; i++) {
        const y = r() * 512;
        c.strokeStyle = `rgba(${18 + r() * 20},${10 + r() * 12},${6 + r() * 8},${0.25 + r() * 0.35})`;
        c.lineWidth = 0.6 + r() * 2.4;
        c.beginPath();
        c.moveTo(0, y);
        for (let x = 0; x <= 1024; x += 64) c.lineTo(x, y + Math.sin(x * 0.006 + i) * (4 + r() * 10));
        c.stroke();
      }
    });
    grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
    const deskMat = new THREE.MeshStandardMaterial({ map: grain, roughness: 0.48, metalness: 0.05, color: 0x6b5545 });
    const desk = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.08, 3.1), deskMat);
    desk.position.set(0.3, -0.04, -0.1);
    desk.receiveShadow = true;
    g.add(desk);

    // desk mat under the keyboard area: a felt pad, one tone step lighter than the desk
    const pad = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.006, 1.05), mat.matte(0x17181a, 0.95));
    pad.position.set(1.7, 0.003, 0.55);
    pad.receiveShadow = true;
    g.add(pad);

    // wall with a window cut-out (four slabs around the opening)
    const wallMat = mat.matte(0x0d0e10, 0.95);
    const wall = (w: number, h: number, x: number, y: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), wallMat);
      m.position.set(x, y, -1.75);
      m.receiveShadow = true;
      g.add(m);
    };
    // opening: x -0.6..4.4, y 0.25..3.6
    wall(9, 6, 0.6, -2.75);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), mat.matte(0x070708, 1));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.78, 4);
    g.add(floor);
    wall(9, 2.4, 0.6, 4.8);
    wall(4.4, 4, -2.8, 1.9);
    wall(2.2, 4, 5.5, 1.9);
    const frameMat = mat.graphite();
    const mullion = (w: number, h: number, x: number, y: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), frameMat);
      m.position.set(x, y, -1.72);
      g.add(m);
    };
    mullion(5.0, 0.06, 1.9, 0.27);
    mullion(5.0, 0.06, 1.9, 3.58);
    mullion(0.06, 3.35, -0.58, 1.92);
    mullion(0.06, 3.35, 4.38, 1.92);
    mullion(0.04, 3.35, 1.9, 1.92);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.04, 0.28), frameMat);
    sill.position.set(1.9, 0.25, -1.6);
    g.add(sill);

    // sky: night blue with the city's sodium glow at the horizon
    this.skyMat = new THREE.ShaderMaterial({
      depthWrite: false,
      uniforms: { uDim: { value: 1 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uDim; varying vec2 vUv;
        void main(){
          vec3 top = vec3(0.012, 0.018, 0.035);
          vec3 mid = vec3(0.03, 0.045, 0.085);
          vec3 glow = vec3(0.075, 0.05, 0.04);
          float y = vUv.y;
          vec3 c = mix(glow, mid, smoothstep(0.02, 0.32, y));
          c = mix(c, top, smoothstep(0.3, 0.95, y));
          gl_FragColor = vec4(c * uDim, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(160, 60), this.skyMat);
    sky.position.set(4, 12, -60);
    g.add(sky);

    // skyline: instanced towers with lit windows computed in the shader
    const count = ctx.tier.skyline;
    const r = rng(42);
    const tower = new THREE.BoxGeometry(1, 1, 1);
    tower.translate(0, 0.5, 0);
    this.towersMat = new THREE.ShaderMaterial({
      uniforms: { uTime: ctx.uTime, uDim: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        varying vec3 vLocal; varying vec3 vScale; varying float vSeed; varying vec3 vN;
        void main(){
          vSeed = aSeed;
          vLocal = position;
          vScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vN = normal;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        ${hashGLSL}
        uniform float uTime; uniform float uDim;
        varying vec3 vLocal; varying vec3 vScale; varying float vSeed; varying vec3 vN;
        void main(){
          vec3 body = vec3(0.016, 0.019, 0.026);
          if (vN.y > 0.5) { gl_FragColor = vec4(body * uDim, 1.0); return; }
          vec2 face = abs(vN.x) > 0.5 ? vec2(vLocal.z * vScale.z, vLocal.y * vScale.y) : vec2(vLocal.x * vScale.x, vLocal.y * vScale.y);
          vec2 cell = floor(face * vec2(4.2, 5.0));
          vec2 f = fract(face * vec2(4.2, 5.0));
          float pane = step(0.22, f.x) * step(f.x, 0.78) * step(0.25, f.y) * step(f.y, 0.7);
          float h = hash13(vec3(cell, vSeed * 91.0));
          float on = step(0.8 - 0.06 * vSeed, h);
          // a few windows switch on and off over minutes, not seconds
          on *= step(0.04, fract(h * 13.0 + floor(uTime / 23.0 + h * 7.0) * 0.37));
          vec3 warm = mix(vec3(1.0, 0.62, 0.3), vec3(0.85, 0.9, 1.0), step(0.82, fract(h * 7.3)));
          float side = abs(vN.x) > 0.5 ? 0.55 : 1.0;
          vec3 c = body + warm * pane * on * 0.55 * side;
          gl_FragColor = vec4(c * uDim, 1.0);
        }`,
    });
    const towers = new THREE.InstancedMesh(tower, this.towersMat, count + 3);
    const seeds = new Float32Array(count + 3);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let i = 0;
    for (; i < count; i++) {
      const x = -14 + r() * 34;
      const z = -18 - r() * 26;
      const centre = Math.exp(-Math.pow((x - 4.5) / 6.5, 2));
      const h = 1.2 + r() * 3 + centre * (2 + r() * 8);
      const w = 0.8 + r() * 1.8;
      m.compose(new THREE.Vector3(x, -16, z), q, new THREE.Vector3(w, h + 3, 0.8 + r() * 1.6));
      towers.setMatrixAt(i, m);
      seeds[i] = r();
    }
    // AT&T Building: a slim slab rising to two spires
    const att = (x: number, y: number, z: number, w: number, h: number, d: number) => {
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(w, h, d));
      towers.setMatrixAt(i, m);
      seeds[i] = 0.4;
      i++;
    };
    att(2.6, -16, -26, 2.0, 15.6, 1.5);
    att(1.82, -0.5, -26, 0.16, 2.4, 0.16);
    att(3.38, -0.5, -26, 0.16, 2.4, 0.16);
    tower.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    g.add(towers);

    // aircraft beacons on the spires: the only red in the room
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3b2f });
    for (const x of [1.82, 3.38]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), beaconMat);
      b.position.set(x, 1.95, -26);
      b.userData.beacon = true;
      g.add(b);
    }
    this.beacons = g.children.filter((c) => c.userData.beacon) as THREE.Mesh[];

    // desk lamp: weighted base, two arms, a shade; the bulb is the room's main light
    const lamp = new THREE.Group();
    const metal = mat.darkMetal();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.05, 40), metal);
    base.position.y = 0.025;
    const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.25, 12), metal);
    arm1.position.set(0.18, 0.62, 0.05);
    arm1.rotation.z = -0.32;
    const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.1, 12), metal);
    arm2.position.set(0.72, 1.32, 0.18);
    arm2.rotation.set(0.25, 0, -1.15);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 40, 1, true), new THREE.MeshStandardMaterial({ color: 0x232426, roughness: 0.4, metalness: 0.8, side: THREE.DoubleSide }));
    shade.position.set(1.22, 1.45, 0.33);
    shade.rotation.set(0.35, 0, 0.55);
    this.bulb = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffd2a0, emissiveIntensity: 3.2 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 16), this.bulb);
    bulb.position.set(1.25, 1.36, 0.36);
    for (const part of [base, arm1, arm2, shade]) part.castShadow = true;
    lamp.add(base, arm1, arm2, shade, bulb);
    lamp.position.set(-2.2, 0, -0.95);
    g.add(lamp);

    this.lamp = new THREE.SpotLight(0xffc58f, 34, 9, 0.95, 0.65, 1.6);
    this.lamp.position.set(-0.95, 1.36, -0.6);
    this.lamp.target.position.set(0.5, 0, 0.35);
    if (ctx.tier.shadows) {
      this.lamp.castShadow = true;
      this.lamp.shadow.mapSize.set(ctx.tier.shadows, ctx.tier.shadows);
      this.lamp.shadow.bias = -0.0004;
      this.lamp.shadow.normalBias = 0.02;
      this.lamp.shadow.camera.near = 0.3;
      this.lamp.shadow.camera.far = 8;
    }
    g.add(this.lamp, this.lamp.target);

    // cool spill from the window and a faint fill so the shadows keep their shape
    this.moon = new THREE.DirectionalLight(0x7f9cd6, 0.35);
    this.moon.position.set(2.5, 3, -6);
    g.add(this.moon);
    this.hemi = new THREE.HemisphereLight(0x2c3346, 0x1a120c, 0.45);
    const fill = new THREE.PointLight(0xffb27a, 5, 7, 1.6);
    fill.position.set(1.8, 2.1, 1.4);
    g.add(fill);
    g.add(this.hemi);
    this.base = { lamp: this.lamp.intensity, hemi: this.hemi.intensity, moon: this.moon.intensity };
  }

  private beacons: THREE.Mesh[] = [];

  /** 1 = the room as normal; towards 0 the city and window fall dark and only the lamp remains */
  setDim(f: number) {
    this.hemi.intensity = this.base.hemi * (0.25 + 0.75 * f);
    this.moon.intensity = this.base.moon * f;
    this.lamp.intensity = this.base.lamp * (0.55 + 0.45 * f);
    this.skyMat.uniforms.uDim.value = 0.35 + 0.65 * f;
    this.towersMat.uniforms.uDim.value = 0.2 + 0.8 * f;
    this.bulb.emissiveIntensity = 3.2;
  }

  update(time: number) {
    const on = Math.sin(time * 2.4) > 0.6 ? 1 : 0.15;
    for (const b of this.beacons) (b.material as THREE.MeshBasicMaterial).color.setRGB(on, 0.23 * on, 0.18 * on);
  }
}
