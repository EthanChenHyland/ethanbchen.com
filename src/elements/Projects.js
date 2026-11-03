import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { patchMaterial } from '../gl/patch.js';
import { createPedestal } from '../world/Platform.js';
import { stationPosition } from '../config.js';
import { mulberry32 } from '../gl/noise.js';
import { PHOSPHOR, makeScreenUniforms, buildInterior, CrossingObject, PROBLEM_PARTS, RESOLVED_PARTS } from './ProjectsScreen.js';

// Projects — the Threshold Console: a monumental terminal whose screen is the boundary between the
// station and software, where things that were built cross between digital and physical space.
// The project content is still a placeholder: one test object going in and a resolved one out.
// The console is mechanically alive: it settles into new orientations on its pedestal, its head
// follows what arrives and who is looking, and it squares up when it is the subject.

const deg = THREE.MathUtils.degToRad;
const YAW = deg(14); // rest orientation: the overview sees its depth, the focus view its face
const TILT = deg(-10); // the head leans back
const HEAD = new THREE.Vector3(0, 4.1, 0.24); // centre of the head, machine space
const JOINT = new THREE.Vector3(0, 3.5, -0.52); // where the head swivels on the spine, machine space
const HEAD_SCALE = 1.12;
const FACE_Z = 0.3; // front of the solid head body, head space (well behind the glass)
const SCREEN = { w: 3.0, h: 1.96, r: 0.05, y: 0, z: FACE_Z + 0.13 }; // the glass, head space
const DECK_Y = 1.56;
const CYCLE = 84;

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** A box with flat 45° chamfers on every edge, centred on the origin. */
function chamferBox(w, h, d, c) {
  const x = w / 2 - c, y = h / 2 - c;
  const sh = new THREE.Shape();
  sh.moveTo(-x + c, -y);
  sh.lineTo(x - c, -y);
  sh.lineTo(x, -y + c);
  sh.lineTo(x, y - c);
  sh.lineTo(x - c, y);
  sh.lineTo(-x + c, y);
  sh.lineTo(-x, y - c);
  sh.lineTo(-x, -y + c);
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: d - 2 * c, bevelEnabled: true, bevelThickness: c, bevelSize: c, bevelSegments: 1 });
  geo.translate(0, 0, -(d / 2 - c));
  return geo;
}

/** A flat frame (outer and hole as rounded rectangles) extruded `d` forward from z = 0. */
function frameGeo(ow, oh, or, iw, ih, ir, d, c) {
  const outer = roundedRect(ow - 2 * c, oh - 2 * c, Math.max(or - c, 0.01));
  outer.holes.push(roundedRect(iw + 2 * c, ih + 2 * c, ir + c));
  const geo = new THREE.ExtrudeGeometry(outer, { depth: d - 2 * c, bevelEnabled: true, bevelThickness: c, bevelSize: c, bevelSegments: 1, curveSegments: 8 });
  geo.translate(0, 0, c);
  return geo;
}

export class Projects {
  constructor(ctx, def) {
    this.def = def;
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'projects';
    stationPosition(def, this.group.position);
    const pin = ctx.app.params.get('pcyc'); // debug: pin the demonstration cycle (seconds)
    this.pin = pin === null ? null : parseFloat(pin);

    this.pedestal = createPedestal(ctx, def);
    this.group.add(this.pedestal.mesh);

    this.machine = new THREE.Group();
    this.machine.rotation.y = YAW;
    this.group.add(this.machine);

    this.#materials();
    this.#buildBase();
    this.#buildHead(ctx);
    this.#buildCable();
    this.#buildCrossing(ctx);
    this.#initMotion();

    this.hit = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 1.7, 5.0, 16), new THREE.MeshBasicMaterial());
    this.hit.position.y = 3.0;
    this.hit.visible = false;
    this.hit.userData.elementId = def.id;
    this.group.add(this.hit);
  }

  #materials() {
    // charcoal ceramic-coated aluminium: satin, faintly warm
    this.ceramic = new THREE.MeshStandardMaterial({ color: 0x55565e, roughness: 0.36, metalness: 0.35, envMapIntensity: 1.9 });
    this.metal = new THREE.MeshStandardMaterial({ color: 0x1b1c20, roughness: 0.3, metalness: 0.85, envMapIntensity: 1.5 });
    this.resin = new THREE.MeshStandardMaterial({ color: 0x1d1b19, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.42, envMapIntensity: 0.7 });
    // the station's red: light from inside the machine that shows its construction
    const glow = (k, color = 0x1a0a07) => new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: 0xe3684d, emissiveIntensity: k });
    this.seamGlow = glow(2.6);
    this.trimGlow = glow(2.0);
    this.ventGlow = glow(0.22, 0x0c0605);
    this.bayGlow = glow(0.7, 0x0c0605);
    this.collarGlow = glow(0.7, 0x5a2016);
    this.lampOff = glow(0.18, 0x2a1410);
    this.lampOn = glow(3.0, 0x2a1410);
  }

  #mesh(geo, mat, parent, shadow = true) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  /** A slab with an octagonal plan (x, z) from y0 to y1; plan corners cut by `cut`. */
  #plinth(w, z0, z1, cut, y0, y1, mat, c = 0.04) {
    const x = w / 2;
    // shape y is −z once the extrusion is stood upright
    const pts = [[-x + cut, z1], [x - cut, z1], [x, z1 - cut], [x, z0 + cut], [x - cut, z0], [-x + cut, z0], [-x, z0 + cut], [-x, z1 - cut]];
    const sh = new THREE.Shape(pts.map(([px, pz]) => new THREE.Vector2(px, -pz)));
    const geo = new THREE.ExtrudeGeometry(sh, { depth: y1 - y0 - 2 * c, bevelEnabled: true, bevelThickness: c, bevelSize: c, bevelSegments: 1 });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, y0 + c, 0);
    return this.#mesh(geo, mat, this.machine);
  }

  #buildBase() {
    // an octagonal plinth that sits inside the round pedestal: a low deck in front where results
    // land, and a rear block that carries the neck
    this.#plinth(2.5, -0.82, 0.93, 0.38, 1.07, DECK_Y, this.ceramic);
    this.#plinth(2.2, -0.82, -0.08, 0.2, DECK_Y - 0.05, 2.25, this.ceramic);
    // an inset dark foot: the console stands on a shadow line, lit red from within
    this.#plinth(2.3, -0.72, 0.83, 0.34, 0.94, 1.1, this.metal);
    this.#plinth(2.38, -0.77, 0.88, 0.36, 1.03, 1.07, this.seamGlow, 0.005).castShadow = false;

    // a lit line along the front edge of the deck, and where the deck meets the rear block
    const trim = this.#mesh(new THREE.BoxGeometry(1.7, 0.022, 0.022), this.trimGlow, this.machine, false);
    trim.position.set(0, DECK_Y - 0.09, 0.981);
    const seam = this.#mesh(new THREE.BoxGeometry(1.86, 0.016, 0.02), this.seamGlow, this.machine, false);
    seam.position.set(0, DECK_Y + 0.012, -0.035);

    // machine status lamps along the front, one per role; quiet unless a role is active
    this.lamps = [];
    const lg = new THREE.CylinderGeometry(0.032, 0.032, 0.03, 20);
    lg.rotateX(Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const l = this.#mesh(lg, i === 2 ? this.lampOn : this.lampOff, this.machine, false);
      l.position.set(-0.325 + i * 0.13, 1.3, 0.975);
      this.lamps.push(l);
    }

    // a short, thick spine at the back: the head cantilevers forward from it over the deck
    const spine = this.#mesh(chamferBox(1.5, 1.7, 0.58, 0.06), this.metal, this.machine);
    spine.position.set(0, 2.95, -0.56);
    spine.rotation.x = TILT * 0.5;
  }

  #buildHead(ctx) {
    // the head swivels and nods on a joint at the top of the spine
    const joint = (this.joint = new THREE.Group());
    joint.position.copy(JOINT);
    this.machine.add(joint);
    const head = (this.head = new THREE.Group());
    head.position.copy(HEAD).sub(JOINT);
    head.rotation.x = TILT;
    head.scale.setScalar(HEAD_SCALE);
    joint.add(head);
    // a seam of light between the front frame and the body traces the head's silhouette
    const ring = this.#mesh(frameGeo(3.535, 2.455, 0.085, 3.47, 2.39, 0.06, 0.014, 0.002), this.seamGlow, head, false);
    ring.position.z = FACE_Z - 0.016;

    // solid body; its front face sits well behind the glass so the image always covers it
    const body = this.#mesh(chamferBox(3.5, 2.42, 0.86, 0.07), this.ceramic, head);
    body.position.set(0, 0, FACE_Z - 0.43);
    // a stepped frame draws the eye down into the screen
    const outer = this.#mesh(frameGeo(3.56, 2.48, 0.09, 3.16, 2.1, 0.07, 0.32, 0.04), this.ceramic, head);
    outer.position.z = FACE_Z;
    const inner = this.#mesh(frameGeo(3.2, 2.14, 0.07, SCREEN.w, SCREEN.h, SCREEN.r, 0.17, 0.015), this.metal, head);
    inner.position.z = FACE_Z;
    // a brow over the screen: the silhouette's signature, and it shades the glass
    const brow = this.#mesh(chamferBox(3.56, 0.17, 0.5, 0.05), this.ceramic, head);
    brow.position.set(0, 1.24 - 0.085, FACE_Z + 0.3);
    // heat slots across the back, warm from inside
    const slot = new THREE.BoxGeometry(2.6, 0.03, 0.03);
    for (let i = 0; i < 10; i++) {
      const sl = this.#mesh(slot, this.ventGlow, head, false);
      sl.position.set(0, -0.82 + i * 0.18, FACE_Z - 0.875);
    }

    // a machinery bay on the side facing the platform: relays behind a smoked resin window
    const bay = new THREE.Group();
    bay.position.set(-1.75, -0.08, FACE_Z - 0.44);
    bay.rotation.y = -Math.PI / 2;
    head.add(bay);
    this.#mesh(frameGeo(0.66, 1.8, 0.05, 0.52, 1.64, 0.03, 0.2, 0.02), this.ceramic, bay);
    // the bay is backlit, so the relays read as silhouettes against the machine's own light
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 1.66), this.bayGlow);
    back.position.z = 0.012;
    bay.add(back);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 1.66), this.resin);
    win.position.z = 0.17;
    bay.add(win);
    const relayGeo = new RoundedBoxGeometry(0.15, 0.17, 0.1, 2, 0.015);
    const coilGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.12, 14);
    const cream = new THREE.MeshStandardMaterial({ color: 0x8f877a, roughness: 0.5 });
    const copper = new THREE.MeshStandardMaterial({ color: 0x8a4a2a, roughness: 0.35, metalness: 0.9 });
    const glint = new THREE.MeshStandardMaterial({ color: 0x220c08, emissive: 0xe3684d, emissiveIntensity: 3.2 });
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 2; j++) {
        const r = this.#mesh(relayGeo, j ? this.metal : cream, bay, false);
        r.position.set(-0.11 + j * 0.22, -0.62 + i * 0.25, 0.07);
        const c = this.#mesh(coilGeo, copper, bay, false);
        c.position.set(-0.11 + j * 0.22, -0.62 + i * 0.25 + 0.1, 0.06);
        c.rotation.z = Math.PI / 2;
      }
      const g = this.#mesh(new THREE.SphereGeometry(0.014, 8, 6), glint, bay, false);
      g.position.set(0.2, -0.62 + i * 0.25, 0.12);
    }

    // the glass and what lies behind it
    const sf = (this.screenFrame = new THREE.Group());
    sf.position.set(0, SCREEN.y, SCREEN.z);
    head.add(sf);
    this.scr = makeScreenUniforms(ctx.camera, new THREE.Vector2(SCREEN.w / 2, SCREEN.h / 2), SCREEN.r);
    sf.add(buildInterior(this.scr, ctx.uniforms.uTime));

    // black glass: reflections only, added over the image behind it
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x000000, roughness: 0.04, metalness: 0.0, envMapIntensity: 2.4,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const P = PHOSPHOR.toArray().map((v) => v.toFixed(3)).join(', ');
    patchMaterial(glassMat, {
      key: 'proj-glass',
      vertexHeader: 'varying vec2 vSP;',
      vertex: { begin_vertex: '#include <begin_vertex>\nvSP = position.xy;' },
      fragmentHeader: 'varying vec2 vSP;',
      fragment: {
        emissivemap_fragment: `#include <emissivemap_fragment>
          vec2 q = abs(vSP) / vec2(${(SCREEN.w / 2).toFixed(3)}, ${(SCREEN.h / 2).toFixed(3)});
          totalEmissiveRadiance += vec3(${P}) * (0.004 + 0.012 * smoothstep(0.7, 1.0, max(q.x, q.y)));`,
      },
    });
    const glass = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(SCREEN.w, SCREEN.h, SCREEN.r), 10), glassMat);
    glass.renderOrder = 30;
    sf.add(glass);

    // the screen lights what is in front of it
    const spot = (this.screenLight = new THREE.SpotLight(new THREE.Color(...PHOSPHOR.toArray()), 7, 10, 1.15, 0.95, 2));
    spot.position.set(0, 0, -0.55);
    spot.target.position.set(0, -2.4, 3.2);
    sf.add(spot, spot.target);

    // red underglow from the head's lower edge, down onto the deck, its front and the pedestal
    const under = (this.underLight = new THREE.SpotLight(0xe3684d, 4.5, 4.2, 0.95, 0.85, 2));
    under.position.set(0, 2.55, 0.78);
    under.target.position.set(0, 0.9, 1.25);
    this.machine.add(under, under.target);
  }

  #buildCable() {
    // braided: two helical strands woven over each other
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.62, metalness: 0.2 });
    patchMaterial(mat, {
      key: 'proj-cable',
      vertexHeader: 'varying vec2 vCuv;',
      vertex: { begin_vertex: '#include <begin_vertex>\nvCuv = uv;' },
      fragmentHeader: 'varying vec2 vCuv;',
      fragment: {
        color_fragment: `#include <color_fragment>
          float L = 4.2 / 0.045;
          float a = sin((vCuv.x * L + vCuv.y * 8.0) * 3.14159);
          float b = sin((vCuv.x * L - vCuv.y * 8.0) * 3.14159);
          float over = step(0.0, sin(vCuv.x * L * 3.14159 * 0.5 + vCuv.y * 25.13));
          float weave = mix(a, b, over);
          diffuseColor.rgb *= 0.75 + 0.45 * smoothstep(-0.2, 0.9, weave);`,
        roughnessmap_fragment: '#include <roughnessmap_fragment>\nroughnessFactor = 0.48 + 0.2 * (1.0 - smoothstep(-0.2, 0.9, weave));',
      },
    });
    const pts = [
      [0.5, 3.35, -0.84], [0.72, 3.1, -1.32], [0.88, 2.2, -1.5], [0.78, 1.32, -1.28], [0.62, 0.92, -1.04],
    ].map((p) => new THREE.Vector3(...p));
    const curve = new THREE.CatmullRomCurve3(pts);
    this.#mesh(new THREE.TubeGeometry(curve, 90, 0.065, 14), mat, this.machine);
    const collar = this.#mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.07, 24), this.collarGlow, this.machine);
    collar.position.set(0.62, 0.99, -1.04);
  }

  #buildCrossing(ctx) {
    this.input = new CrossingObject(ctx, this.scr, { parts: PROBLEM_PARTS, roughness: 0.62, metalness: 0.25, seed: 3 });
    this.output = new CrossingObject(ctx, this.scr, { parts: RESOLVED_PARTS, roughness: 0.34, metalness: 0.05, samples: 1000, seed: 9 });
    // the objects live in the station's frame; keys are written in whichever frame they belong to
    // (the screen, the machine, the station) and resolved every frame, so a crossing follows the
    // glass while the console and its head move
    this.group.add(this.input.group, this.output.group);

    const key = (t, space, p, q, extra) => ({ t, space, p: new THREE.Vector3(...p), q, ...extra });
    const along = (v) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), v);
    // Objects cross the glass obliquely, so the whole sequence of stages is laid out across the
    // screen instead of hiding behind the part still outside.
    const dIn = new THREE.Vector3(0.74, -0.06, -0.67).normalize(); // into the screen, left to right
    const qIn = along(dIn.clone().negate()); // the problem's leading end (local −z) goes first
    const pIn = new THREE.Vector3(-0.5, -0.02, 0); // where its centre meets the glass
    const onIn = (k) => pIn.clone().addScaledVector(dIn, k).toArray();
    const dOut = new THREE.Vector3(0.5, -0.36, 0.79).normalize(); // out of the screen, toward the deck
    const qOut = along(dOut);
    const pOut = new THREE.Vector3(0.35, -0.3, 0);
    const onOut = (k) => pOut.clone().addScaledVector(dOut, k).toArray();
    const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
    const wait = [-2.55, 3.55, 2.4]; // front left of the console, in the station's frame
    const rest = [0.05, DECK_Y + 0.235, 0.42];
    // a demonstration sequence only: the real scheduler comes later
    this.inKeys = [
      key(0, 'station', wait, 'spin'),
      key(6, 'station', wait, 'spin'),
      key(11, 'screen', onIn(-1.5), qIn),
      key(19, 'screen', onIn(-0.02), qIn),
      key(24, 'screen', onIn(0.06), qIn),
      key(30, 'screen', onIn(1.9), qIn),
      key(35, 'screen', [1.0, -0.3, -5.2], qIn),
      key(38, 'screen', [1.1, -0.35, -7.9], qIn, { hideAfter: true }),
      key(76, 'station', [-9, 7, 6], 'spin'),
      key(84, 'station', wait, 'spin'),
    ];
    this.outKeys = [
      key(36, 'screen', [-0.6, 0.35, -7.8], qOut),
      key(44, 'screen', onOut(-1.2), qOut),
      key(48, 'screen', onOut(-0.06), qOut),
      key(52, 'screen', onOut(0.02), qOut),
      key(56, 'screen', onOut(1.4), qOut),
      key(60, 'machine', rest, flat),
      key(70, 'machine', rest, flat),
      key(80, 'station', [8.5, 8, 9], 'spin', { hideAfter: true }),
    ];
    this._pa = new THREE.Vector3();
    this._pb = new THREE.Vector3();
    this._qa = new THREE.Quaternion();
    this._qb = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._toStation = { screen: new THREE.Matrix4(), machine: new THREE.Matrix4() };
    this._qToStation = { screen: new THREE.Quaternion(), machine: new THREE.Quaternion() };
    this._inv = new THREE.Matrix4();
  }

  #spin(t, q) {
    return q.setFromEuler(this._e.set(t * 0.07, t * 0.11 + 1.0, t * 0.05));
  }

  /** A key's position and orientation in the station's frame, as of this frame. */
  #resolve(k, time, p, q) {
    p.copy(k.p);
    if (k.q === 'spin') this.#spin(time, q);
    else q.copy(k.q);
    if (k.space !== 'station') {
      p.applyMatrix4(this._toStation[k.space]);
      if (k.q !== 'spin') q.premultiply(this._qToStation[k.space]);
    }
  }

  /** Place an object along its keys at cycle time `t`; hidden outside them. */
  #follow(obj, keys, t, time) {
    const g = obj.group;
    let i = keys.length - 2;
    while (i > 0 && keys[i].t > t) i--;
    const a = keys[i], b = keys[i + 1];
    if (t < keys[0].t || t > keys[keys.length - 1].t || (a.hideAfter && t > a.t)) {
      g.visible = false;
      return null;
    }
    g.visible = true;
    const u = THREE.MathUtils.smoothstep(t, a.t, b.t);
    this.#resolve(a, time, this._pa, this._qa);
    this.#resolve(b, time, this._pb, this._qb);
    g.position.lerpVectors(this._pa, this._pb, u);
    g.quaternion.slerpQuaternions(this._qa, this._qb, u);
    // a held object is never perfectly still
    if (a.p.equals(b.p)) g.position.y += Math.sin(time * 0.8) * 0.03;
    return a;
  }

  // ---- the console's own motion ----

  #initMotion() {
    const spring = (v) => ({ v, vel: 0 });
    this.yaw = spring(YAW);
    this.headYaw = spring(0);
    this.headPitch = spring(0);
    this.yawGoal = YAW;
    this.restUntil = 6;
    this.rand = mulberry32(45);
    this._c = new THREE.Vector3();
    this._o = new THREE.Vector3();
    // the canonical focus camera, seen from the station
    this.focusAz = null;
  }

  /** Critically damped approach of `s` to `goal` at natural frequency `w` (rad/s). */
  #step(s, goal, w, dt) {
    s.vel += (w * w * (goal - s.v) - 2 * w * s.vel) * dt;
    s.v += s.vel * dt;
  }

  #azimuth(worldPos) {
    this.group.worldToLocal(this._c.copy(worldPos));
    return Math.atan2(this._c.x, this._c.z);
  }

  #motion(time, dt, camera, incoming) {
    const hk = this.hoverK, fk = this.focusK;
    const camAz = this.#azimuth(camera.position);
    if (this.focusAz === null) this.focusAz = this.#azimuth(this.ctx.app.focusView(this.def.id).pos);
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

    // long rests, then a slow re-orientation of 5–15°, biased toward keeping a useful
    // three-quarter view for whoever is watching
    if (time > this.restUntil && fk < 0.05) {
      const want = THREE.MathUtils.clamp(wrap(camAz + deg(32)), deg(-12), deg(38));
      let goal = THREE.MathUtils.lerp(YAW, want, 0.45) + (this.rand() - 0.5) * deg(10);
      const d = goal - this.yawGoal;
      if (Math.abs(d) < deg(5)) goal = this.yawGoal + Math.sign(d || 1) * deg(5 + this.rand() * 4);
      this.yawGoal = THREE.MathUtils.clamp(goal, this.yawGoal - deg(15), this.yawGoal + deg(15));
      this.restUntil = time + 9 + this.rand() * 12;
    }
    // focus squares the console up to its canonical view; hover turns it a little toward the viewer
    let goal = THREE.MathUtils.lerp(this.yawGoal, this.focusAz - deg(8), fk);
    goal += THREE.MathUtils.clamp(wrap(camAz - this.yaw.v), -deg(5), deg(5)) * hk * (1 - fk);
    this.#step(this.yaw, goal, 0.9 + 1.2 * fk, dt);
    this.machine.rotation.y = this.yaw.v;

    // the head follows what arrives, and acknowledges whoever hovers
    let hy = 0, hp = 0;
    if (incoming) {
      this.joint.getWorldPosition(this._o);
      const az = this.#azimuth(incoming) - this.yaw.v;
      hy = THREE.MathUtils.clamp(wrap(az), -deg(9), deg(9));
      this.group.worldToLocal(this._c.copy(incoming));
      this.group.worldToLocal(this._o);
      hp = THREE.MathUtils.clamp(Math.atan2(this._c.y - this._o.y - 0.6, 3) * 0.6, -deg(5), deg(4));
    }
    const lookCam = THREE.MathUtils.clamp(wrap(camAz - this.yaw.v), -deg(11), deg(11));
    hy = THREE.MathUtils.lerp(hy, lookCam, hk);
    hy *= 1 - fk;
    hp *= 1 - fk;
    this.#step(this.headYaw, hy, 1.6, dt);
    this.#step(this.headPitch, hp, 1.6, dt);
    this.joint.rotation.set(-this.headPitch.v, this.headYaw.v, 0, 'YXZ');
  }

  update(time, dt, camera) {
    const t = this.pin ?? (time + 8) % CYCLE;
    // the incoming object is whatever approaches the glass from outside
    const inKey = this.inKeys.findLast((k) => k.t <= t);
    const incoming = inKey && inKey.t < 19 && this.input.group.visible ? this.input.group.getWorldPosition(this._p ??= new THREE.Vector3()) : null;
    this.#motion(time, dt, camera, incoming);

    this.group.updateMatrixWorld(true);
    this._inv.copy(this.group.matrixWorld).invert();
    this._toStation.screen.multiplyMatrices(this._inv, this.screenFrame.matrixWorld);
    this._toStation.machine.copy(this.machine.matrix);
    for (const k of ['screen', 'machine']) this._qToStation[k].setFromRotationMatrix(this._toStation[k]);
    this.scr.uScrMat.value.copy(this.screenFrame.matrixWorld);
    this.scr.uScrInv.value.copy(this.screenFrame.matrixWorld).invert();

    this.#follow(this.input, this.inKeys, t, time);
    this.#follow(this.output, this.outKeys, t, time);
    for (const o of [this.input, this.output]) {
      o.group.updateWorldMatrix(false, false);
      o.update(this.scr.uScrInv.value);
    }
  }
}
