import * as THREE from 'three';
import { PHOSPHOR_GLSL as PH, CrossingObject, buildCrossingGeometry } from './ProjectsScreen.js';
import { Portal, poseFrom, hermite } from './ProjectsPortal.js';
import { CERAMIC, METAL, DARK, VERMILION, HOT, ramp, pulse, portalMap4, screenLabel, screenPlane, clippedMaterial, outOfGlass } from './ProjectsKit.js';

// Great Prompt-Off: a live prompt-engineering challenge. A prompt is run over reports and must return
// six findings, each exactly one of four labels; scoring is strict against an answer key. Practice
// runs on public reports; the final is one locked submission against hidden ones.
//
// Here: a scoring tray (six rows × four label positions) comes out of the machine; extracted tokens
// slide out of the glass into its rows, one in the wrong position (strict: it stays wrong); hidden
// reports stream through the air into a slit in the floor that seals behind them; one submission
// token goes into the machine; and the final result falls through the digital floor and drops out
// of a portal above the deck. No scans, no medical imagery: prompt → structured extraction → score.

// rows along local z (it crosses lane-first), the four label positions along x
const ROWS = 6;
const COLS = [-0.21, -0.07, 0.07, 0.21];
const rowZ = (i) => -0.4 + i * 0.16;
const TRAY_PARTS = [
  { type: 'rbox', size: [0.62, 0.05, 0.98, 0.014], pos: [0, 0, 0], color: CERAMIC },
  ...Array.from({ length: ROWS }, (_, i) => COLS.map((x) => ({ type: 'cyl', size: [0.036, 0.036, 0.012, 16], pos: [x, 0.03, rowZ(i)], color: METAL }))).flat(),
  // the four labels, marked along the head of the tray: present, absent, uncertain, not reported
  { type: 'box', size: [0.05, 0.05, 0.02], pos: [COLS[0], 0.05, -0.47], color: DARK },
  { type: 'box', size: [0.05, 0.015, 0.02], pos: [COLS[1], 0.033, -0.47], color: DARK },
  { type: 'box', size: [0.05, 0.03, 0.02], pos: [COLS[2], 0.04, -0.47], color: DARK },
  { type: 'box', size: [0.05, 0.004, 0.05], pos: [COLS[3], 0.028, -0.47], color: METAL },
  { type: 'box', size: [0.58, 0.012, 0.012], pos: [0, 0.03, 0.46], color: VERMILION },
];
const TOKEN_PARTS = [{ type: 'cyl', size: [0.05, 0.05, 0.03, 20], pos: [0, 0, 0], color: VERMILION }];
const RESULT_PARTS = [
  { type: 'rbox', size: [0.12, 0.07, 0.56, 0.012], pos: [0, 0, 0], color: CERAMIC },
  { type: 'box', size: [0.05, 0.02, 0.44], pos: [0, 0.042, -0.04], color: VERMILION }, // the score: 5 of 6
  ...Array.from({ length: 6 }, (_, i) => ({ type: 'box', size: [0.1, 0.012, 0.008], pos: [0, 0.04, -0.25 + i * 0.1], color: DARK })),
];
const KEY = [0, 1, 1, 2, 0, 3]; // the answer key
const GOT = [0, 1, 1, 1, 0, 3]; // what the prompt extracted: row 3 says "absent" for "uncertain"
const HIDDEN = 45;

export class PromptOffWork {
  constructor(host) {
    this.host = host;
    const { ctx, scr } = host;
    this.name = 'promptoff';
    this.length = 52;
    this.lamp = 2;
    this.tray = new CrossingObject(ctx, scr, buildCrossingGeometry(TRAY_PARTS, { samples: 1100, seed: 41 }), { roughness: 0.4, metalness: 0.05, grid: 0.06 });
    this.token = new CrossingObject(ctx, scr, buildCrossingGeometry(TOKEN_PARTS, { samples: 200, seed: 43 }), { roughness: 0.25, grid: 0.03 });
    const resultGeo = buildCrossingGeometry(RESULT_PARTS, { samples: 420, seed: 45 });
    this.result = ['room', 'out'].map(() => new CrossingObject(ctx, scr, resultGeo, { roughness: 0.35, grid: 0.04 }));
    for (const o of [this.tray, this.token, ...this.result]) {
      o.group.matrixAutoUpdate = false;
      host.group.add(o.group);
    }
    // extracted label tokens (physical, cut by the glass as they slide out of it)
    this.chipMat = clippedMaterial({ color: 0xe6dfd2, roughness: 0.3, metalness: 0.0 }, 'proj-po-chip', scr);
    this.chips = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.018, 18), this.chipMat, ROWS);
    this.chips.customDepthMaterial = this.chipMat.userData.depth;
    this.chips.castShadow = true;
    this.chips.frustumCulled = false;
    this.chips.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < ROWS; i++) this.chips.setColorAt(i, new THREE.Color(0xe6dfd2));
    host.group.add(this.chips);
    // the strict mismatch: a ring at the position the key wanted
    this.keyRing = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.006, 8, 24), new THREE.MeshStandardMaterial({ color: 0x2a1410, emissive: 0xe3684d, emissiveIntensity: 2.2 }));
    this.keyRing.rotation.x = Math.PI / 2;
    this.keyRing.matrixAutoUpdate = false;
    host.group.add(this.keyRing);
    // the hidden reports
    this.blockMat = clippedMaterial({ color: 0x8c8780, roughness: 0.38, metalness: 0.35 }, 'proj-po-block', scr);
    this.blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.18, 0.025), this.blockMat, HIDDEN); // upright slabs: readable from the side
    this.blocks.customDepthMaterial = this.blockMat.userData.depth;
    this.blocks.castShadow = true;
    this.blocks.frustumCulled = false;
    this.blocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    host.group.add(this.blocks);

    const m = (x, y, z) => new THREE.Vector3(x, y, z);
    // the hidden set leaves the machine in the air above-left and goes down into the floor, which seals
    this.H = host.addPortal(new Portal(scr, { rx: 0.2, ry: 0.13, shape: 'rect' }), m(-2.05, 3.15, 1.45), m(0, -1, 0.25));
    this.F = host.addPortal(new Portal(scr, { rx: 0.24, ry: 0.06, shape: 'slit' }), m(-2.05, 0.015, 1.62), m(0, 1, 0));
    // the result: through the screen room's floor, out above the deck
    this.VD = host.addScreenPortal(new Portal(scr, { rx: 0.2, ry: 0.2, masked: true }), m(0.25, -1.25, -2.4), m(0, 1, 0));
    this.D = host.addPortal(new Portal(scr, { rx: 0.2, ry: 0.2, tier: 'major' }), m(0.05, 2.5, 0.45), m(0, -1, 0));
    this.trayKeys = this.#trayKeys(host);
    this.tokenKeys = this.#tokenKeys(host);
    this.#buildScene(host);
    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._plane = new THREE.Plane();
    this._prev = -1;
    this.focus = new THREE.Vector3();
  }

  #trayKeys(host) {
    const k = host.key;
    const deck = host.deckPose(new THREE.Vector3(0, 0.025, 0.42), new THREE.Euler(0, Math.PI / 2, 0));
    this.deck = deck;
    const front = [0, deck.p[1] + 0.2, 1.55];
    return [
      k(0, 'screen', [-0.3, 0.25, -7.6], host.qOut),
      k(3.4, 'screen', host.onOut(-1.2), host.qOut),
      k(5.0, 'screen', host.onOut(-0.05), host.qOut),
      k(6.2, 'screen', host.onOut(1.65), host.qOut, { phys: true }),
      k(7.0, 'machine', front, deck.q, { phys: true }),
      k(7.8, 'machine', deck.p, deck.q, { phys: true }),
      k(48, 'machine', deck.p, deck.q, { phys: true }),
      k(48.8, 'machine', front, deck.q, { phys: true }),
      k(49.6, 'screen', host.onIn(-2.4), host.qIn),
      k(50.4, 'screen', host.onIn(-1.6), host.qIn),
      k(51.6, 'screen', host.onIn(0.5), host.qIn, { hideAfter: true }),
      k(52, 'screen', host.onIn(0.5), host.qIn),
    ];
  }

  #tokenKeys(host) {
    // the submission: one token lifts off the tray and goes in through the glass
    const k = host.key;
    return [
      k(28.6, 'machine', [0.36, this.deck.p[1] + 0.06, 0.62], new THREE.Quaternion(), { phys: true }),
      k(29.6, 'machine', [0.2, 2.2, 1.6], new THREE.Quaternion(), { phys: true }),
      k(30.4, 'screen', host.onIn(-1.2), host.qIn),
      k(32.4, 'screen', host.onIn(0.6), host.qIn),
      k(34.0, 'screen', [0.4, -0.2, -4.6], host.qIn, { hideAfter: true }),
      k(34.2, 'screen', [0.4, -0.2, -4.6], host.qIn),
    ];
  }

  #buildScene(host) {
    const { scr, screenFrame } = host;
    const g = (this.scene = new THREE.Group());
    screenFrame.add(g);
    this.label = screenLabel(scr, 'GREAT PROMPT-OFF   prompt  ›  extract  ›  score');
    this.label.position.set(-0.85, 0.78, -0.55);
    const key = `const int KEY[6] = int[6](${KEY.join(',')}); const int GOT[6] = int[6](${GOT.join(',')});`;
    this.panel = screenPlane(scr, 2.6, 1.5, { uShow: { value: 0 }, uT: { value: 0 }, uP: { value: 0 } }, {
      header: /* glsl */ `
        uniform float uP; // project clock
        ${key}`,
      main: /* glsl */ `
        // left: a report as strata, read by a beam that pulls out six tokens
        vec2 rc = vec2(-0.92, 0.05);
        for (int i = 0; i < 9; i++) col += ${PH} * fillR(m, rc + vec2(0.0, 0.32 - float(i) * 0.08), vec2(0.22 - 0.04 * hash11(float(i) * 3.7), 0.006)) * 0.28;
        col += ${PH} * rectD(m, rc, vec2(0.3, 0.42), 0.003) * 0.4;
        float beam = rc.y + 0.36 - fract(uP * 0.35) * 0.72;
        col += vec3(1.0, 0.42, 0.26) * lineD(m.y, beam, 0.003) * step(abs(m.x - rc.x), 0.3) * smoothstep(7.0, 8.0, uP) * (1.0 - smoothstep(15.0, 16.0, uP));
        // centre: the schema: six findings × four labels
        vec2 gc = vec2(0.05, 0.0);
        for (int r = 0; r < 6; r++) {
          float y = 0.3 - float(r) * 0.12;
          for (int c = 0; c < 4; c++) {
            vec2 p = gc + vec2(-0.27 + float(c) * 0.18, y);
            col += ${PH} * rectD(m, p, vec2(0.06, 0.04), 0.0025) * 0.35;
            // extracted label lands
            float landed = smoothstep(8.4 + float(r) * 1.1, 8.8 + float(r) * 1.1, uP);
            if (c == GOT[r]) col += ${PH} * fillR(m, p, vec2(0.035, 0.022)) * landed * 0.7;
            // strict scoring: correct rows tick, the wrong one is marked, and where the key wanted it
            float scored = smoothstep(15.5 + float(r) * 0.35, 15.8 + float(r) * 0.35, uP);
            if (c == KEY[r] && GOT[r] != KEY[r]) col += vec3(1.0, 0.42, 0.26) * rectD(m, p, vec2(0.07, 0.05), 0.004) * scored * 1.3;
          }
          float scoredR = smoothstep(15.5 + float(r) * 0.35, 15.8 + float(r) * 0.35, uP);
          vec2 mk = gc + vec2(0.48, y);
          col += (GOT[r] == KEY[r] ? ${PH} : vec3(1.0, 0.42, 0.26)) * (GOT[r] == KEY[r] ? segD(m, mk + vec2(-0.03, 0.0), mk + vec2(-0.01, -0.02), 0.004) + segD(m, mk + vec2(-0.01, -0.02), mk + vec2(0.03, 0.025), 0.004)
                    : segD(m, mk + vec2(-0.025, -0.025), mk + vec2(0.025, 0.025), 0.004) + segD(m, mk + vec2(-0.025, 0.025), mk + vec2(0.025, -0.025), 0.004)) * scoredR * 0.9;
        }
        // practice attempts used, then the locked final
        for (int i = 0; i < 3; i++) col += ${PH} * fillR(m, vec2(-0.27 + float(i) * 0.06, -0.52), vec2(0.02, 0.012)) * smoothstep(16.0 + float(i) * 1.6, 16.3 + float(i) * 1.6, uP) * 0.8;
        col += vec3(1.0, 0.42, 0.26) * rectD(m, vec2(0.1, -0.52), vec2(0.12, 0.022), 0.003) * smoothstep(27.0, 27.6, uP);
        // right: the hidden set scored inside, 45 results, then the leaderboard
        vec2 hc = vec2(0.86, 0.12);
        for (int i = 0; i < 45; i++) {
          vec2 p = hc + vec2(-0.2 + float(i % 9) * 0.05, 0.12 - float(i / 9) * 0.06);
          float on = smoothstep(33.5 + float(i) * 0.09, 33.6 + float(i) * 0.09, uP);
          float ok = step(0.2, hash11(float(i) * 1.37));
          col += mix(vec3(1.0, 0.42, 0.26), ${PH}, ok) * aa(length(m - p) - 0.012) * (0.15 + 0.7 * on);
        }
        for (int i = 0; i < 6; i++) {
          float h = 0.05 + 0.25 * hash11(float(i) * 5.1 + 2.0) * smoothstep(36.0, 39.0, uP);
          col += (i == 2 ? vec3(1.0, 0.42, 0.26) : ${PH}) * fillR(m, hc + vec2(-0.2 + float(i) * 0.08, -0.45 + h * 0.5), vec2(0.022, h * 0.5)) * 0.32;
        }`,
    });
    this.panel.position.set(0, 0.0, -2.2);
    g.add(this.label, this.panel);
  }

  #crossed(at, t) {
    return this._prev < at && t >= at;
  }

  update(t, time, dt, show, variant) {
    const h = this.host;
    this.variant = variant;
    this.label.material.uniforms.uShow.value = show;
    this.panel.material.uniforms.uShow.value = show;
    this.panel.material.uniforms.uT.value = time;
    this.panel.material.uniforms.uP.value = Math.min(t, 60);
    if (t > this.length) {
      for (const o of [this.tray, this.token, ...this.result]) o.group.visible = false;
      this.chips.visible = this.blocks.visible = this.keyRing.visible = false;
      for (const p of [this.H, this.F, this.VD, this.D]) p.set(0, 0);
      this._prev = -1;
      return null;
    }
    const trayOn = h.follow(this.tray, this.trayKeys, t, time);
    this.#chips(t, trayOn);
    this.#hidden(t, time);
    h.follow(this.token, this.tokenKeys, t, time);
    this.#result(t, time, trayOn);

    // sounds, at the moments they happen
    for (let i = 0; i < ROWS; i++) if (this.#crossed(9.2 + i * 1.1, t)) h.emit('po-place', { row: i });
    for (let i = 0; i < ROWS; i++) if (this.#crossed(15.65 + i * 0.35, t)) h.emit(GOT[i] === KEY[i] ? 'po-confirm' : 'po-reject', { row: i });
    if (variant === 'strict' && this.#crossed(17.75, t)) h.emit('po-strict');
    if (this.#crossed(22.2, t)) h.emit('po-stream');
    if (this.#crossed(27.4, t)) h.emit('portal-seal', { tier: 1.7 });
    if (this.#crossed(33.5, t)) h.emit('po-score');
    if (this.#crossed(42.5, t)) h.emit('land', { k: 1 });
    if (this.#crossed(8, t) || this.#crossed(28.6, t)) h.pulseCable(1);
    this._prev = t;

    let focus = null, event = null;
    if (t < 8 || t > 47) focus = this.tray.group.position;
    else if (t < 15) focus = this.chipFocus;
    else if (t > 21.5 && t < 28) (focus = this.blockFocus), (event = this.blockFocus);
    else if (t > 28.6 && t < 33) focus = this.token.group.position;
    else if (t > 40 && t < 43.5) (focus = this.focus), (event = this.focus);
    const busy = (t > 8 && t < 15) || (t > 21.5 && t < 28) || (t > 33 && t < 43.5);
    return { focus, event, activity: busy ? 0.85 : 0.35, crossing: (t > 1 && t < 6.5) || (t > 29.8 && t < 33) || t > 49.4, lamp: this.lamp };
  }

  #chips(t, trayOn) {
    const h = this.host;
    // the tokens ride the tray to the end; the glass cuts them as it goes back in
    const show = trayOn && t > 8;
    this.chips.visible = show;
    this.keyRing.visible = show && t > 16.6 && t < 49.4;
    if (!show) return;
    // they slide out of the glass, cut by it, and arc down into their rows
    this.chipMat.userData.glass(true);
    const trayM = this.tray.group.matrix;
    const q = new THREE.Quaternion().setFromRotationMatrix(trayM), one = new THREE.Vector3(1, 1, 1);
    const P = new THREE.Vector3();
    this.chipFocus ??= new THREE.Vector3();
    for (let i = 0; i < ROWS; i++) {
      const t0 = 8.2 + i * 1.1;
      const seat = new THREE.Vector3(COLS[GOT[i]], 0.045, rowZ(i)).applyMatrix4(trayM);
      outOfGlass([-0.45 + i * 0.18, -0.45, -0.12], seat, ramp(t, t0, t0 + 1.2), h.screenToStation, P);
      if (i === Math.min(ROWS - 1, Math.max(0, Math.floor((t - 8.2) / 1.1)))) this.chipFocus.copy(P);
      let qq = q;
      // the strict variant: the mismatched token is thrown up off the tray, spins, and slams back
      if (this.variant === 'strict' && i === 3) {
        const j = ramp(t, 16.6, 17.9);
        P.y += Math.sin(j * Math.PI) * 0.32;
        qq = q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(j * Math.PI * 2, 0, j * Math.PI)));
        if (j > 0 && j < 1) this.chipFocus.copy(P);
      }
      this._m.compose(P, qq, one);
      this.chips.setMatrixAt(i, this._m);
      // the strict reject: the wrong token goes vermilion, and a ring marks where the key wanted it
      if (i === 3) this.chips.setColorAt(i, new THREE.Color(0xe6dfd2).lerp(new THREE.Color(0xc4472f), ramp(t, 16.6, 17.0)));
    }
    this.chips.instanceMatrix.needsUpdate = true;
    this.chips.instanceColor.needsUpdate = true;
    const r = 3;
    this.keyRing.matrix.compose(new THREE.Vector3(COLS[KEY[r]], 0.045, rowZ(r)).applyMatrix4(trayM), q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))), one);
  }

  #hidden(t, time) {
    // forty-five hidden reports leave through the air and fall into the floor, which seals
    this.H.set(pulse(t, 21.0, 21.8, 26.9, 27.4), time);
    const seal = pulse(t, 21.3, 22.0, 27.3, 27.6);
    this.F.set(seal, time);
    this.F.uniforms.uTier.value = 1 + 0.9 * pulse(t, 27.0, 27.3, 27.4, 27.8);
    const on = t > 21.5 && t < 27.6;
    this.blocks.visible = on;
    if (!on) return;
    const h = this.host;
    this.blockMat.userData.clip(0, this.H.plane(this._plane));
    this.blockMat.userData.clip(1, this.F.plane(new THREE.Plane()));
    const Hm = h.portalFrame(this.H, new THREE.Matrix4()), Fm = h.portalFrame(this.F, new THREE.Matrix4());
    const top = new THREE.Vector3().setFromMatrixPosition(Hm), bot = new THREE.Vector3().setFromMatrixPosition(Fm);
    const nH = new THREE.Vector3().setFromMatrixColumn(Hm, 2).normalize();
    const q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3();
    this.blockFocus ??= new THREE.Vector3();
    this.blockFocus.lerpVectors(top, bot, 0.5);
    for (let i = 0; i < HIDDEN; i++) {
      const t0 = 21.9 + i * 0.105;
      const u = (t - t0) / 1.0;
      if (u < -0.1 || u > 1.15) {
        this._m.makeScale(0, 0, 0);
      } else {
        // out of the upper cut, falling faster, down through the slit
        const s = Math.max(u, -0.1);
        P.copy(top).addScaledVector(nH, -0.12 + 0.12 * Math.min(1, (s + 0.1) * 6));
        P.lerp(bot.clone().add(new THREE.Vector3(0, -0.25, 0)), Math.min(1, Math.max(0, s) * Math.max(0, s)));
        q.setFromEuler(new THREE.Euler(0.25 * Math.sin(i + s * 3), i * 0.7 + s * 2.5, 0.2 * Math.cos(i * 1.3 + s * 2)));
        this._m.compose(P, q, one);
      }
      this.blocks.setMatrixAt(i, this._m);
    }
    this.blocks.instanceMatrix.needsUpdate = true;
  }

  #result(t, time, trayOn) {
    // the score falls inside the machine, through the floor of the digital room, and drops out of
    // a portal above the deck onto the tray
    const h = this.host;
    const [room, out] = this.result;
    const oD = pulse(t, 40.4, 41.0, 41.9, 42.4);
    this.VD.set(oD, time);
    this.D.set(oD, time);
    const VDm = h.portalFrame(this.VD, new THREE.Matrix4()), Dm = h.portalFrame(this.D, new THREE.Matrix4());
    const cVD = new THREE.Vector3().setFromMatrixPosition(VDm);
    const nVD = new THREE.Vector3().setFromMatrixColumn(VDm, 2).normalize();
    const trayM = this.tray.group.matrix;
    const seat = new THREE.Vector3(0, 0.08, 0.02).applyMatrix4(trayM);
    const seatQ = new THREE.Quaternion().setFromRotationMatrix(trayM);
    const uIn = 41.3; // reaching the room's floor
    const start = new THREE.Vector3(0.25, 0.55, -2.4).applyMatrix4(h.screenToStation);
    const fallV = 1.9;
    const P = new THREE.Vector3(), V = new THREE.Vector3();
    const roomPose = (u, out) => {
      const P = new THREE.Vector3(), V = new THREE.Vector3(); // its own: the exit pose calls it mid-computation
      if (u <= uIn) hermite(start, nVD.clone().multiplyScalar(-0.2), cVD, nVD.clone().multiplyScalar(-fallV), uIn - 38.6, (u - 38.6) / (uIn - 38.6), P, V);
      else P.copy(cVD).addScaledVector(nVD, -fallV * (u - uIn)), V.copy(nVD).multiplyScalar(-fallV);
      out.compose(P, new THREE.Quaternion().setFromRotationMatrix(h.screenToStation), new THREE.Vector3(1, 1, 1));
      return out;
    };
    room.group.visible = t > 38.6 && t < uIn + 0.3;
    out.group.visible = (t > uIn - 0.3 && t < 48.6 && trayOn) || (t > uIn - 0.3 && t < 43);
    if (room.group.visible) roomPose(t, room.group.matrix);
    room.uniforms.uPhys.value = 0;
    room.clip(0, this.VD.plane(this._plane));
    if (out.group.visible) {
      const map = portalMap4(Dm, VDm);
      if (t < uIn) out.group.matrix.copy(map).multiply(roomPose(t, new THREE.Matrix4()));
      else {
        const cD = new THREE.Vector3().setFromMatrixPosition(Dm), nD = new THREE.Vector3().setFromMatrixColumn(Dm, 2).normalize();
        const uL = uIn + 0.55;
        if (t < uL) hermite(cD, nD.clone().multiplyScalar(fallV), seat, new THREE.Vector3(0, -1.2, 0), uL - uIn, (t - uIn) / (uL - uIn), P, V);
        else P.copy(seat);
        const q0 = new THREE.Quaternion().setFromRotationMatrix(map.multiply(roomPose(uIn, new THREE.Matrix4())));
        out.group.matrix.compose(P, q0.slerp(seatQ, ramp(t, uIn, uL + 0.4)), new THREE.Vector3(1, 1, 1));
        if (t > 44) out.group.matrix.copy(trayM).multiply(new THREE.Matrix4().makeTranslation(0, 0.08, 0.02));
      }
      out.uniforms.uPhys.value = t > 44 ? this.tray.uniforms.uPhys.value : 1;
      out.clip(0, t < uIn + 0.5 ? this.D.plane(this._plane) : null);
      this.focus.setFromMatrixPosition(out.group.matrix);
    }
  }
}
