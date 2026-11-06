import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { patchMaterial } from '../gl/patch.js';
import { createPedestal } from '../world/Platform.js';
import { stationPosition } from '../config.js';
import { mulberry32 } from '../gl/noise.js';
import { PHOSPHOR, makeScreenUniforms, buildInterior } from './ProjectsScreen.js';
import { TowerLogicWork, MosaicWork } from './ProjectsWorks.js';
import { PromptOffWork } from './ProjectsPromptOff.js';
import { VisualJavaWork } from './ProjectsVisualJava.js';
import { BugMuseumWork } from './ProjectsBugMuseum.js';
import { Lab } from './ProjectsLab.js';
import { Schedule, PROJECTS, defFor } from './ProjectsSchedule.js';
import { ShowcaseWork, TitleBeat } from './ProjectsHolo.js';
import { Ambient } from './ProjectsAmbient.js';
import { WinCodexWork, ChessWork, PianoMirWork, ClarityWork, MicroWork } from './ProjectsCameos.js';
import { CloudlineWork } from './ProjectsCloudline.js';

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

// chassis treatments (?pmat=a|b|c): a warm graphite ceramic, a smoked titanium, and the hybrid in use
const MATERIALS = {
  a: {
    shell: { color: 0x77726c, roughness: 0.55, metalness: 0.15, envMapIntensity: 1.3 },
    structure: { color: 0x3a3938, roughness: 0.42, metalness: 0.55, envMapIntensity: 1.3 },
    bezel: { color: 0x101113, roughness: 0.4, metalness: 0.5, envMapIntensity: 1.0 },
  },
  b: {
    shell: { color: 0x6a6d73, roughness: 0.32, metalness: 0.75, envMapIntensity: 1.7 },
    structure: { color: 0x383b41, roughness: 0.3, metalness: 0.85, envMapIntensity: 1.5 },
    bezel: { color: 0x0f1012, roughness: 0.35, metalness: 0.6, envMapIntensity: 1.0 },
  },
  c: {
    shell: { color: 0x7b766f, roughness: 0.48, metalness: 0.25, envMapIntensity: 1.5 },
    structure: { color: 0x34363b, roughness: 0.34, metalness: 0.75, envMapIntensity: 1.5 },
    bezel: { color: 0x0e0f11, roughness: 0.38, metalness: 0.5, envMapIntensity: 1.0 },
  },
};

// Debug: freeze the console on a named moment (?pstate=…), or lock one work (?proj=tower|mosaic|
// promptoff|vj|bug|frog, with ?pvar=variant) and pin its clock (?pt=seconds).
const STATES = {
  'tower-idle': ['towerlogic', 14],
  'tower-portal-in': ['towerlogic', 23.95],
  'tower-portal': ['towerlogic', 25.0],
  'tower-portal-out': ['towerlogic', 26.55],
  'tower-cross': ['towerlogic', 40.0],
  'mosaic-idle': ['mosaic', 6.5],
  'mosaic-discover': ['mosaic', 5.0],
  'mosaic-cross': ['mosaic', 14.6],
  'mosaic-tidy': ['mosaic', 21.5],
  'mosaic-shuffle': ['mosaic', 26.6],
  'mosaic-prov': ['mosaic', 37.6],
  'mosaic-collection': ['mosaic', 42.5],
  'promptoff-extract': ['promptoff', 11.2],
  'promptoff-score': ['promptoff', 18],
  'promptoff-seal': ['promptoff', 24.5],
  'promptoff-sealed': ['promptoff', 27.6],
  'promptoff-submit': ['promptoff', 31],
  'promptoff-drop': ['promptoff', 41.7],
  'promptoff-result': ['promptoff', 45],
  'vj-run': ['visualjava', 6],
  'vj-out': ['visualjava', 9.6],
  'vj-hang': ['visualjava', 14],
  'vj-return': ['visualjava', 21.5],
  'vj-rewind': ['visualjava', 19, 'rewind'],
  'bug-fence': ['bugmuseum', 11, 'fence'],
  'bug-fence-catch': ['bugmuseum', 15.2, 'fence'],
  'bug-stairs': ['bugmuseum', 10, 'stairs'],
  'bug-stairs-catch': ['bugmuseum', 13.5, 'stairs'],
  'holo-assemble': ['showcase', 4.0],
  'holo-cross': ['showcase', 6.3],
  'holo-expand': ['showcase', 8.2],
  'holo-hover': ['showcase', 11.0],
  'holo-break': ['showcase', 16.2],
  'holo-pull': ['showcase', 16.6, 'pull'],
  'title-tower': ['towerlogic', 2.0],
  'title-tower-out': ['towerlogic', 4.4],
  'title-mosaic': ['mosaic', 2.0],
  'title-mosaic-out': ['mosaic', 4.3],
  'title-promptoff': ['promptoff', 2.0],
  'title-vj': ['visualjava', 2.0],
  'title-vj-out': ['visualjava', 4.6],
  'title-bug': ['bugmuseum', 2.0, 'fence'],
  'title-bug-out': ['bugmuseum', 3.9, 'fence'],
  'wc-rise': ['wincodex', 1.6],
  'wc-tunnel': ['wincodex', 4.3],
  'wc-emerge': ['wincodex', 5.4],
  'wc-arc': ['wincodex', 6.6],
  'wc-conflict': ['wincodex', 9.2],
  'wc-merge': ['wincodex', 10.3],
  'chess-tree': ['chess', 5.0],
  'chess-line': ['chess', 6.6],
  'chess-path': ['chess', 8.5],
  'chess-move': ['chess', 9.3],
  'pianomir': ['pianomir', 5.0],
  'clarity-split': ['clarity', 4.5],
  'micro-avoid': ['micro', 3.0, 'avoid'],
  'micro-notes': ['micro', 3.5, 'notes'],
  'micro-kitco': ['micro', 3.6, 'kitco'],
  'cl-island': ['cloudline', 3.0],
  'cl-lay': ['cloudline', 6.4],
  'cl-ride': ['cloudline', 9.5],
  'cl-rear': ['cloudline', 12.0],
  'cl-return': ['cloudline', 16.4],
  'bug-overflow': ['bugmuseum', 6.5, 'overflow'],
  'bug-overflow-wrap': ['bugmuseum', 9.6, 'overflow'],
  'bug-deadlock': ['bugmuseum', 9.5, 'deadlock'],
  'bug-deadlock-break': ['bugmuseum', 14.0, 'deadlock'],
  'mosaic-rows': ['mosaic', 26.6, 'rows'],
  'po-strict': ['promptoff', 17.2, 'strict'],
  'micro-hub': ['micro', 3.4, 'hub'],
  'micro-profile': ['micro', 3.8, 'profile'],
  'title-cloudline-out': ['cloudline', 4.4],
  'frog-deep': ['frog', 2.5],
  'frog-out': ['frog', 6.0],
  'frog-deck': ['frog', 8.5],
};
const ALIASES = {
  tower: 'towerlogic', towerlogic: 'towerlogic', mosaic: 'mosaic', promptoff: 'promptoff', vj: 'visualjava', visualjava: 'visualjava', bug: 'bugmuseum', bugmuseum: 'bugmuseum', frog: 'frog',
  showcase: 'showcase', holo: 'showcase', cloudline: 'cloudline', wincodex: 'wincodex', chess: 'chess', pianomir: 'pianomir', clarity: 'clarity', micro: 'micro',
};

// The presentation pose: the console's face a little off the camera (12°), its bay side toward the
// viewer. The turntable's excursions from that pose come in turn (degrees off it): the bay, the
// right side and cable, toward the rear-left, the bay again, the right, toward the rear-right.
const PRESENT = THREE.MathUtils.degToRad(12);
const EXCURSIONS = [44, -52, 64, -46, 56, -66].map((d) => THREE.MathUtils.degToRad(d));
const pulseS = (t, a, b, c, d) => THREE.MathUtils.smoothstep(t, a, b) * (1 - THREE.MathUtils.smoothstep(t, c, d));
// Resume's drift response: nothing for the first few degrees, then rising to full by `to`
const driftCurve = (d, from, to, k) => THREE.MathUtils.smoothstep(d, from, from + 2) * Math.pow(THREE.MathUtils.clamp((d - from) / (to - from), 0, 1), k);
// moments on the screen that run on through the hardware (signal strength)
const PROPAGATE = { 'title-in': 1, transit: 1, land: 0.7, 'wc-snapshot': 0.8, 'chess-line': 0.8, 'po-score': 1, 'vj-mutate': 0.6, 'bug-error': 1, 'holo-wave': 0.5, 'project-start': 1, 'cl-depart': 0.8 };


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
    const P = ctx.app.params;
    const preset = STATES[P.get('pstate')];
    const lock = preset?.[0] ?? ALIASES[P.get('proj')] ?? null;
    this.lockFrog = lock === 'frog';
    this.lockProject = this.lockFrog ? null : lock;
    this.lockVariant = preset?.[2] ?? P.get('pvar') ?? undefined;
    this.pin = preset ? preset[1] : P.has('pt') ? parseFloat(P.get('pt')) : null;

    this.pedestal = createPedestal(ctx, def);
    this.group.add(this.pedestal.mesh);

    this.machine = new THREE.Group();
    this.machine.rotation.y = YAW;
    this.group.add(this.machine);

    this.#materials();
    this.#buildBase();
    this.#buildHead(ctx);
    this.#buildCable();
    this.#buildTech();
    this.#initMotion();
    this.#buildWorks();

    this.hit = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 1.7, 5.0, 16), new THREE.MeshBasicMaterial());
    this.hit.position.y = 3.0;
    this.hit.visible = false;
    this.hit.userData.elementId = def.id;
    this.group.add(this.hit);
  }

  #materials() {
    // charcoal ceramic-coated aluminium: satin, faintly warm
    // value hierarchy: a mid-dark shell, darker structure, near-black only for the bezel, the foot and
    // the deepest recesses; the red light describes the form rather than carrying it alone
    const T = MATERIALS[this.ctx.app.params.get('pmat') ?? 'c'] ?? MATERIALS.c;
    this.ceramic = new THREE.MeshStandardMaterial(T.shell);
    this.metal = new THREE.MeshStandardMaterial(T.structure);
    this.bezel = new THREE.MeshStandardMaterial(T.bezel);
    this.resin = new THREE.MeshStandardMaterial({ color: 0x1d1b19, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.42, envMapIntensity: 0.7 });
    // the station's red: light from inside the machine that shows its construction
    const glow = (k, color = 0x1a0a07) => new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: 0xe3684d, emissiveIntensity: k });
    this.seamGlow = glow(2.0);
    this.trimGlow = glow(1.6);
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
    this.#plinth(2.3, -0.72, 0.83, 0.34, 0.94, 1.1, this.bezel);
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
      const l = this.#mesh(lg, this.lampOff.clone(), this.machine, false);
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
    const inner = this.#mesh(frameGeo(3.2, 2.14, 0.07, SCREEN.w, SCREEN.h, SCREEN.r, 0.17, 0.015), this.bezel, head);
    inner.position.z = FACE_Z;
    // a brow over the screen: the silhouette's signature, and it shades the glass
    const brow = this.#mesh(chamferBox(3.56, 0.17, 0.5, 0.05), this.ceramic, head);
    brow.position.set(0, 1.24 - 0.085, FACE_Z + 0.3);
    // heat slots across the back, warm from inside
    // each slot is lit on its own, so the back can breathe, chase and answer what happens there
    this.vents = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff }), 10);
    for (let i = 0; i < 10; i++) {
      this.vents.setMatrixAt(i, new THREE.Matrix4().makeTranslation(0, -0.82 + i * 0.18, FACE_Z - 0.875));
      this.vents.setColorAt(i, new THREE.Color(0x2a0d08));
    }
    this.vents.frustumCulled = false;
    head.add(this.vents);

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
    // relays that click when the machine switches, and a lamp per row that follows the work
    this.relays = [];
    this.glints = new THREE.InstancedMesh(new THREE.SphereGeometry(0.016, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), 6);
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 2; j++) {
        const r = this.#mesh(relayGeo, j ? this.metal : cream, bay, false);
        r.position.set(-0.11 + j * 0.22, -0.62 + i * 0.25, 0.07);
        const c = this.#mesh(coilGeo, copper, bay, false);
        c.position.set(-0.11 + j * 0.22, -0.62 + i * 0.25 + 0.1, 0.06);
        c.rotation.z = Math.PI / 2;
        this.relays.push({ r, c, z: 0.07, k: 0 });
      }
      this.glints.setMatrixAt(i, new THREE.Matrix4().makeTranslation(0.2, -0.62 + i * 0.25, 0.12));
      this.glints.setColorAt(i, new THREE.Color(0x401208));
    }
    this.glints.frustumCulled = false;
    bay.add(this.glints);

    // the glass and what lies behind it
    const sf = (this.screenFrame = new THREE.Group());
    sf.position.set(0, SCREEN.y, SCREEN.z);
    head.add(sf);
    this.scr = makeScreenUniforms(ctx.camera, new THREE.Vector2(SCREEN.w / 2, SCREEN.h / 2), SCREEN.r);
    sf.add(buildInterior(this.scr));

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
    const under = (this.underLight = new THREE.SpotLight(0xe3684d, 3.4, 4.2, 0.95, 0.85, 2));
    under.position.set(0, 2.55, 0.78);
    under.target.position.set(0, 0.9, 1.25);
    this.machine.add(under, under.target);
  }

  #buildCable() {
    // braided: two helical strands woven over each other
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.62, metalness: 0.2 });
    // activity runs down the cable as a travelling band of light (phase 0 at the head, 1 at the floor)
    this.cablePulse = { uPulse: { value: -1 }, uPulseK: { value: 0 } };
    patchMaterial(mat, {
      key: 'proj-cable',
      uniforms: this.cablePulse,
      vertexHeader: 'varying vec2 vCuv;',
      vertex: { begin_vertex: '#include <begin_vertex>\nvCuv = uv;' },
      fragmentHeader: 'varying vec2 vCuv; uniform float uPulse; uniform float uPulseK;',
      fragment: {
        color_fragment: `#include <color_fragment>
          float L = 4.2 / 0.045;
          float a = sin((vCuv.x * L + vCuv.y * 8.0) * 3.14159);
          float b = sin((vCuv.x * L - vCuv.y * 8.0) * 3.14159);
          float over = step(0.0, sin(vCuv.x * L * 3.14159 * 0.5 + vCuv.y * 25.13));
          float weave = mix(a, b, over);
          diffuseColor.rgb *= 0.75 + 0.45 * smoothstep(-0.2, 0.9, weave);`,
        roughnessmap_fragment: '#include <roughnessmap_fragment>\nroughnessFactor = 0.48 + 0.2 * (1.0 - smoothstep(-0.2, 0.9, weave));',
        emissivemap_fragment: '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.36, 0.2) * uPulseK * exp(-pow((vCuv.x - uPulse) / 0.05, 2.0)) * (0.6 + 0.4 * smoothstep(-0.2, 0.9, weave)) * 2.2;',
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

  #buildTech() {
    // the turntable the console turns on: a dark ring with indexed ticks, and one fixed index mark
    // on the pedestal, so the rotation reads as a mechanism
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.39, 96).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.35, metalness: 0.7 }));
    ring.position.y = 0.958;
    ring.receiveShadow = true;
    this.machine.add(ring);
    const tick = new THREE.BoxGeometry(0.012, 0.004, 0.07);
    this.ticks = new THREE.InstancedMesh(tick, new THREE.MeshBasicMaterial({ color: 0xffffff }), 48);
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const m = new THREE.Matrix4().makeRotationY(a).setPosition(Math.sin(a) * 1.33, 0.961, Math.cos(a) * 1.33);
      this.ticks.setMatrixAt(i, m);
      this.ticks.setColorAt(i, new THREE.Color(i % 12 === 0 ? 0x8a3322 : 0x2a1310));
    }
    this.machine.add(this.ticks);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.09), new THREE.MeshBasicMaterial({ color: 0xff6a48 }));
    mark.position.set(0, 0.962, 1.43);
    this.group.add(mark);
    this.indexMark = mark;
    // status column on the back of the spine: what the machine is doing, readable from behind
    this.leds = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.028, 0.012), new THREE.MeshBasicMaterial({ color: 0xffffff }), 8);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Matrix4().makeRotationX(TILT * 0.5).setPosition(0.48, 2.42 + i * 0.13, -0.855 - (2.42 + i * 0.13 - 2.95) * Math.tan(-TILT * 0.5));
      this.leds.setMatrixAt(i, m);
      this.leds.setColorAt(i, new THREE.Color(0x200a07));
    }
    this.leds.frustumCulled = false;
    this.machine.add(this.leds);
    // a signal that runs from the screen through the hardware: seam, bay, spine, vents, cable
    this.signal = [];
    this._col = new THREE.Color();
  }

  /** Something on the screen reaches into the machine: a flash that travels through its hardware. */
  propagate(k = 1) {
    if (this.signal.length < 6) this.signal.push({ t: 0, k });
  }

  // ---- the projects ----

  #buildWorks() {
    // crossing paths through the glass (screen space): objects go in obliquely, left to right, so
    // the whole sequence of stages lies across the screen; results come out toward the deck
    const along = (v) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), v);
    const dIn = new THREE.Vector3(0.74, -0.06, -0.67).normalize();
    const pIn = new THREE.Vector3(-0.5, -0.02, 0);
    const dOut = new THREE.Vector3(0.5, -0.36, 0.79).normalize();
    const pOut = new THREE.Vector3(0.35, -0.3, 0);
    this.qIn = along(dIn.clone().negate());
    this.qOut = along(dOut);
    this.onIn = (k) => pIn.clone().addScaledVector(dIn, k).toArray();
    this.onOut = (k) => pOut.clone().addScaledVector(dOut, k).toArray();
    this.key = (t, space, p, q, extra) => ({ t, space, p: new THREE.Vector3(...p), q, ...extra });
    this.deckPose = (p, e) => ({ p: [p.x, DECK_Y + p.y, p.z], q: new THREE.Quaternion().setFromEuler(e) });
    // frames as they are at rest, for placing things at build time
    this.machine.updateMatrixWorld(true);
    this._sfInMachine = new THREE.Matrix4().copy(this.machine.matrixWorld).invert().multiply(this.screenFrame.matrixWorld);
    this.screenToMachine = (v) => v.clone().applyMatrix4(this._sfInMachine);
    this.screenDirToMachine = (v) => v.clone().transformDirection(this._sfInMachine);
    this.screenToStation = new THREE.Matrix4();
    this._groupInv = new THREE.Matrix4();
    this.portals = [];
    this.events = []; // sound events for the soundscape: { type, ...data }, drained each frame
    this.works = [
      new TowerLogicWork(this), new MosaicWork(this), new PromptOffWork(this), new VisualJavaWork(this), new BugMuseumWork(this),
      new WinCodexWork(this), new ChessWork(this), new PianoMirWork(this), new ClarityWork(this), new MicroWork(this), new CloudlineWork(this),
      new ShowcaseWork(this),
    ];
    // the works' own captions are retired: each work is named by its title beat instead
    for (const w of this.works) {
      if (w.label) w.label.visible = false;
      for (const l of Object.values(w.labels ?? {})) l.visible = false;
    }
    this.titles = {};
    for (const [key, d] of Object.entries(PROJECTS)) if (d.title) this.titles[key] = new TitleBeat(this, d.title, d.mode, { small: d.small });
    this.lab = new Lab(this);
    this.ambient = new Ambient(this);
    this.schedule = new Schedule(this.works);
    this._pa = new THREE.Vector3();
    this._pb = new THREE.Vector3();
    this._qa = new THREE.Quaternion();
    this._qb = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._sm = new THREE.Matrix4();
    // two lights follow whichever world portals are open: a brief vermilion spill
    this.portalLights = [0, 1].map(() => {
      const l = new THREE.PointLight(0xff5a36, 0, 3.2, 2);
      this.group.add(l);
      return l;
    });
  }

  /** A portal on the console, at `pos` (machine space) facing along `normal`. */
  addPortal(portal, pos, normal) {
    portal.group.position.copy(pos);
    portal.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
    this.machine.add(portal.group);
    this.portals.push(portal);
    return portal;
  }

  /** A portal on the head itself (head space): an aperture where there should be no room for one. */
  addHeadPortal(portal, pos, normal) {
    portal.group.position.copy(pos);
    portal.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
    this.head.add(portal.group);
    this.portals.push(portal);
    return portal;
  }

  /** Something visible happened that should be heard. */
  emit(type, data = {}) {
    if (this.events.length < 64) this.events.push({ type, ...data });
    if (PROPAGATE[type]) this.propagate(PROPAGATE[type]);
  }

  /** Send a pulse of light down the cable (the console reaching into the floor). */
  pulseCable(strength = 1) {
    this._pulses ??= [];
    this._pulses.push({ t: 0, k: strength });
    this.emit('cable', { k: strength });
  }

  /** A portal inside the screen's interior (screen space); drawn only through the glass. */
  addScreenPortal(portal, pos, normal) {
    portal.group.position.copy(pos);
    portal.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
    this.screenFrame.add(portal.group);
    return portal;
  }

  /** An object's matrix in the station's frame, as of this frame. */
  stationMatrix(obj, out) {
    return out.multiplyMatrices(this._groupInv, obj.matrixWorld);
  }

  /**
   * A portal's frame in the station's frame, without scale: portals inside the screen inherit the
   * head's scale, and a frame-to-frame transform must carry objects through at their true size.
   */
  portalFrame(portal, out) {
    this.stationMatrix(portal.group, out).decompose(this._fp ??= new THREE.Vector3(), this._fq ??= new THREE.Quaternion(), this._fs ??= new THREE.Vector3());
    return out.compose(this._fp, this._fq, this._one ??= new THREE.Vector3(1, 1, 1));
  }

  #spin(t, q) {
    return q.setFromEuler(this._e.set(t * 0.07, t * 0.11 + 1.0, t * 0.05));
  }

  /** A key's position and orientation in the station's frame, as of this frame. */
  #resolve(k, time, p, q) {
    p.copy(k.p);
    if (k.q === 'spin') this.#spin(time, q);
    else q.copy(k.q);
    if (k.space === 'station') return;
    const M = k.space === 'screen' ? this.screenToStation : k.space === 'machine' ? this.machine.matrix : this.stationMatrix(k.space, this._sm);
    p.applyMatrix4(M);
    if (k.q !== 'spin') q.premultiply(this._qtmp.setFromRotationMatrix(M));
  }

  /**
   * Place an object along its keys at project time `t`; hidden outside them. A segment whose first
   * key is marked `phys` draws the object as purely physical; so does being wholly in front of the
   * glass (where both ways of drawing agree). Returns whether the object is shown.
   */
  follow(obj, keys, t, time) {
    const g = obj.group;
    let i = keys.length - 2;
    while (i > 0 && keys[i].t > t) i--;
    const a = keys[i], b = keys[i + 1];
    if (t < keys[0].t || t > keys[keys.length - 1].t || (a.hideAfter && t > a.t)) {
      g.visible = false;
      return false;
    }
    g.visible = true;
    const u = THREE.MathUtils.smoothstep(t, a.t, b.t);
    this.#resolve(a, time, this._pa, this._qa);
    this.#resolve(b, time, this._pb, this._qb);
    g.position.lerpVectors(this._pa, this._pb, u);
    g.quaternion.slerpQuaternions(this._qa, this._qb, u);
    // a held object is never perfectly still (one resting on the deck is)
    if (a.p.equals(b.p) && a.space === b.space && !a.phys) g.position.y += Math.sin(time * 0.8) * 0.03;
    g.updateMatrix();
    g.updateMatrixWorld();
    obj.update(this.scr.uScrInv.value);
    obj.uniforms.uPhys.value = a.phys || obj.centreS < -(obj.radius + 0.05) ? 1 : 0;
    return true;
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

  #motion(time, dt, camera, incoming, event, clean) {
    const hk = this.hoverK, fk = this.focusK;
    const app = this.ctx.app;
    const camAz = this.#azimuth(camera.position);
    if (this.focusAz === null) this.focusAz = this.#azimuth(app.focusView(this.def.id).pos);
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const clamp = THREE.MathUtils.clamp;
    // direction of a world point from the head's joint, in the console's own frame
    const fromJoint = (w) => this.machine.worldToLocal(this._c.copy(w)).sub(JOINT);
    // manual input: the camera is the user's; the console keeps presenting itself to it, calmly
    const user = (app.idle ?? 99) < 2.5;
    const still = app.params.has('pstill');
    const life = this.life ?? 0;

    // Viewer-aware presentation (the console's version of Resume's folio, which turns its printed
    // face to the camera with a slow sway). The turntable carries the whole console toward a
    // presentation pose relative to where the camera actually is: a three-quarter view, the bay side
    // a little toward the viewer, never a flat billboard. Around that pose the turntable keeps its
    // own life: a slow sway, and now and then a longer excursion that shows a side or the rear
    // machinery before coming back. A climactic project event turns that event toward the viewer.
    // Hover tightens toward the viewer; focus squares up; focused, life returns with the camera's
    // drift (as Resume's paper does), but the screen stays presented.
    // The camera azimuth is followed through a low-pass, so small camera motions are not chased;
    // during a flight to this station the console already turns to where the camera will arrive.
    // during any flight the console presents itself to where the camera will arrive
    const flying = app.rig.busy && app.rig.tween;
    const camRef = flying ? this.#azimuth(app.rig.tween.p1) : camAz;
    this._camS = this._camS === undefined ? camRef : this._camS + wrap(camRef - this._camS) * Math.min(1, dt * (flying ? 3 : 0.8));
    // the presentation angle, unwrapped, following the smoothed camera
    this._P = this._P === undefined ? this.yaw.v : this._P + wrap(this._camS - this._P);
    // a three-quarter pose: 14° in the overview, 7° on hover or in a fresh focus, opening a little
    // (to 10°) as focused life returns
    const bias = THREE.MathUtils.lerp(PRESENT, deg(7), Math.max(hk, fk)) + deg(3) * fk * life;
    // how free the turntable is: full in overview idle, almost none on hover or in a fresh focus,
    // returning in focus with the camera's drift (but never far: presentation dominates)
    const freedom = still ? 0 : (1 - 0.85 * hk) * THREE.MathUtils.lerp(1, 0.06 + 0.6 * life, fk) * (user ? 0.7 : 1);
    const TAU = Math.PI * 2;
    const sway = deg(9) * (0.65 * Math.sin((TAU * time) / 41) + 0.35 * Math.sin((TAU * time) / 67 + 1.3));
    // excursions: one every 80 s, a deliberate reveal of a side or toward the rear and straight back
    // (5.5 s out, half a second held, 5.5 s back); in focus only a hint of one
    const kX = Math.floor(time / 80), uX = time - kX * 80;
    const reach = EXCURSIONS[((kX % EXCURSIONS.length) + EXCURSIONS.length) % EXCURSIONS.length];
    const env = pulseS(uX, 22, 27.5, 28, 33.5);
    const exc = reach * env * (fk > 0.5 ? 0.18 : 1);
    // a climactic event biases the pose toward showing it (at most 18°): the body supplements, the
    // head and the event's own placement do the rest
    this._evK = THREE.MathUtils.lerp(this._evK ?? 0, event ? 1 : 0, Math.min(1, dt * 0.9));
    if (event) {
      const e = this.machine.worldToLocal(this._c.copy(event));
      this._evOff = clamp(wrap(-Math.atan2(e.x, e.z) - bias), -deg(18), deg(18));
    }
    const evBias = (this._evOff ?? 0) * this._evK * 0.6 * (1 - hk) * (1 - fk * (1 - life));
    this.spinVel = this._P - (this._lastP ?? this._P);
    this.spinVel /= Math.max(dt, 1e-3);
    this._lastP = this._P;
    // the spring below trails a moving camera; a small lead (from how fast the presentation angle is
    // moving) cancels that steady lag, so "elegant lag" stays a few degrees, not ten
    this._vS = THREE.MathUtils.lerp(this._vS ?? 0, this.spinVel, Math.min(1, dt * 1.5));
    const lead = flying ? 0 : clamp(this._vS * 1.4, -deg(8), deg(8));
    const target = still ? YAW : this._P + bias + freedom * (sway + exc) + evBias + lead;
    // the turntable's speed is capped: elegant lag rather than chasing. About 5°/s in the overview
    // (enough for the idle orbit), up to 16°/s while an excursion is deliberately showing a side,
    // 14°/s on hover, 16°/s in focus, fast only while the camera is flying to it
    // (a large way off, as just after a flight, it catches up faster, but never above 14°/s)
    const err = Math.abs(target - (this._T ?? target));
    const cap = app.rig.busy ? deg(60) : Math.max(deg(5 + 11 * env * freedom), deg(14) * hk, deg(16) * fk, Math.min(deg(14), 0.35 * err));
    this._T = this._T === undefined ? target : this._T + clamp(target - this._T, -cap * dt, cap * dt);
    const w = (0.9 + 0.7 * hk + 1.2 * fk * (1 - 0.5 * life)) * (user ? 0.7 : 1) * (app.rig.busy ? 1.6 : 1);
    this.#step(this.yaw, this._T, w, dt);
    // and never faster than the cap, whatever the spring would like
    this.yaw.vel = clamp(this.yaw.vel, -cap * 1.15, cap * 1.15);
    const pres = this._P + bias, hoverBias = 0;
    this.machine.rotation.y = this.yaw.v;

    // the head follows what the console is working on, and acknowledges whoever hovers; with
    // nothing to follow it drifts a little on its own
    let hy = Math.sin(time * 0.071) * deg(2.5), hp = Math.sin(time * 0.053 + 1.0) * deg(1.2);
    if (incoming) {
      const d = fromJoint(incoming);
      hy = clamp(Math.atan2(d.x, Math.max(d.z, 0.4)), -deg(11), deg(11));
      hp = clamp(Math.atan2(d.y, Math.hypot(d.x, Math.max(d.z, 0.4))) * 0.5, -deg(7), deg(6));
    }
    const lookCam = clamp(wrap(camAz - this.yaw.v), -deg(11), deg(11));
    hy = THREE.MathUtils.lerp(hy, lookCam, hk);
    hy *= 1 - fk * (1 - 0.5 * life);
    hp *= 1 - fk * (1 - 0.5 * life);
    this.#step(this.headYaw, hy, 1.6, dt);
    this.#step(this.headPitch, hp, 1.6, dt);
    this.joint.rotation.set(-this.headPitch.v, this.headYaw.v, 0, 'YXZ');
    this.motion = { yaw: this.yaw.v, head: this.headYaw.v, pitch: this.headPitch.v, pres, target, ev: evBias, hover: hoverBias, camRel: wrap(this.yaw.v - camAz), exc: freedom * exc, freedom, user, w: freedom, omega: this.yaw.vel };
  }

  /** What is running now: the schedule, or a single work locked for review (?proj / ?pstate). */
  #running(time) {
    if (this.lockProject) {
      const work = this.works.find((x) => x.name === this.lockProject);
      const length = work.lengthFor?.(this.lockVariant) ?? work.length;
      return [{ item: { work, variant: this.lockVariant, overlap: 0, def: defFor(work.name, this.lockVariant) }, t: this.pin ?? time % length, show: 1, primary: true }];
    }
    return this.schedule.at((this.progT ?? time) + 4);
  }

  /**
   * The console's attention, after Resume's: once a focused view has settled, how far the camera has
   * since wandered from it (`drift`, degrees) brings life back (`life`, 0..1: nothing within 5°, full
   * by 35°); a fresh focus is calm (`calm`); reselecting it gives a graded, non-stacking pulse.
   * Then the cues a viewer gets: hover acknowledged (and released), the click activating the
   * machine, its arrival settling, and its release on the way back to the overview.
   */
  #interaction(time, dt, camera) {
    const app = this.ctx.app, rig = app.rig;
    const focused = app.focused === this.def.id;
    const fk = this.focusK ?? 0, hk = this.hoverK ?? 0;
    let drift = 0;
    if (focused && !rig.busy && fk > 0.98) {
      const off = (this._att2 ??= new THREE.Vector3()).subVectors(camera.position, rig.controls.target).normalize();
      if (!this.focusDir) this.focusDir = off.clone();
      drift = THREE.MathUtils.radToDeg(this.focusDir.angleTo(off));
    } else if (!focused) this.focusDir = null;
    this.drift = drift;
    this.life = (this.life ?? 0) + (driftCurve(drift, 5, 35, 0.7) - (this.life ?? 0)) * Math.min(1, dt * 1.5);
    this.pulse ??= 0;
    if (this.pulseHold > 0) {
      this.pulseHold -= dt;
      this.pulse += (this.pulseAmp - this.pulse) * Math.min(1, dt * 7);
    } else this.pulse *= Math.exp(-dt / 0.9);
    if (!focused) this.pulse = Math.min(this.pulse, 1) * Math.exp(-dt * 3);
    this.calm = fk * (1 - this.life);
    // hover: acknowledged once on the way in (armed again only once it has properly left), a quiet
    // tick now and then while held, a small release on the way out
    const rising = hk > (this._hkPrev ?? 0) + 1e-4, falling = hk < (this._hkPrev ?? 0) - 1e-4;
    this._hkPrev = hk;
    // re-armed only once the hover has fully gone; acknowledged early on a rising hover (so it reads
    // as the machine noticing); released once it is clearly falling
    if (hk < 0.04) this._hoverArmed = true;
    if (rising && hk > 0.12 && this._hoverArmed && time - (this._hoverAt ?? -9) > 0.8) {
      this._hoverArmed = false;
      this._hoverAt = time;
      this._acked = true;
      this.emit('hover-ack');
      this.propagate(0.7);
      this.ambient.ack(time);
    }
    if (this._acked && falling && hk < 0.5) {
      this._acked = false;
      this.emit('hover-release');
    }
    if (hk > 0.7 && time - (this._tickAt ?? 0) > 1.15) (this._tickAt = time), this.emit('hover-tick');
    // focus: activation on the click, a settle once the camera has arrived, release on leaving
    if (focused && !this._wasFocused) {
      this._arrived = false;
      this.activateAt = time;
      this.emit('activate', { dur: rig.tween?.duration ?? 2.4 });
      this.propagate(1.3);
      this.ambient.resolve(time);
      this.sign.holo.waveAt = time + 0.3;
    }
    if (focused && !this._arrived && !rig.busy && fk > 0.9) {
      this._arrived = true;
      this.emit('settle');
    }
    if (!focused && this._wasFocused) {
      this.emit('release');
      this.propagate(0.5);
    }
    this._wasFocused = focused;
  }

  /**
   * Reselected while focused: the camera reframes, and the console acknowledges in proportion to how
   * far the view had wandered (nothing within 4°, full by 30°); a pulse under way is not stacked.
   */
  onReframe() {
    const amp = driftCurve(this.drift ?? 0, 4, 30, 0.6);
    if (amp < 0.02 || this.pulse >= 0.35 * amp) return;
    this.pulseAmp = amp;
    this.pulseHold = 0.35;
    this.emit('reengage', { amp });
    this.propagate(0.4 + 0.9 * amp);
    if (amp > 0.3) this.ambient.resolve(this.ctx.app.time);
    this.sign.holo.waveAt = this.ctx.app.time;
  }

  /** Works whose objects are out in the station right now (at most one at a time). */
  physicalWorks() {
    return this.works.filter((w) => {
      if (w.physicalNow) return w.physicalNow();
      const objs = [];
      for (const k of ['arena', 'pins', 'board', 'last', 'tray', 'token']) if (w[k]?.uniforms) objs.push(w[k]);
      for (const k of ['piece', 'obj', 'result']) if (Array.isArray(w[k])) objs.push(...w[k]);
      if (objs.some((o) => o.group.visible && (o.uniforms.uPhys.value > 0.5 || o.centreS < 0))) return true;
      return ['chips', 'blocks', 'posts', 'rails', 'steps'].some((k) => w[k]?.visible);
    });
  }

  /** Whether the deck and the space in front of the screen stay free of project events for a while. */
  #deckFree(time) {
    const free = (name, variant, t) => {
      const d = defFor(name, variant);
      if (d.screenOnly) return true;
      return (d.free?.[variant ?? 'default'] ?? d.free?.default ?? []).some(([a, b]) => t >= a && t <= b);
    };
    for (const ahead of [0, 2.5, 5.5]) {
      const rs = this.lockProject ? this.#running(time).map((r) => ({ ...r, t: r.t + ahead })) : this.schedule.at(time + 4 + ahead);
      if (!rs.every((r) => free(r.item.work.name, r.item.variant, r.t))) return false;
    }
    return true;
  }

  update(time, dt, camera) {
    this._qtmp ??= new THREE.Quaternion();
    this.sign ??= this.works.find((w) => w.name === 'showcase');
    this.#interaction(time, dt, camera);
    // the program's own clock runs slower while a fresh focus is calm (jumps of the clock pass through)
    const dT = time - (this._lastTime ?? time);
    this._lastTime = time;
    this.progT = (this.progT ?? time) + (Math.abs(dT) > 1 ? dT : dT * (1 - 0.6 * this.calm));
    const running = this.#running(time);
    const showcase = running.some((r) => r.item.work.name === 'showcase' && r.t < r.item.work.length - 1.5);
    // the focus of the moment, from last frame's placement (the console looks where things are)
    this.#motion(time, dt, camera, this.attention ?? null, this.eventAt ?? null, showcase);

    this.group.updateMatrixWorld(true);
    this._groupInv.copy(this.group.matrixWorld).invert();
    this.screenToStation.multiplyMatrices(this._groupInv, this.screenFrame.matrixWorld);
    this.scr.uScrMat.value.copy(this.screenFrame.matrixWorld);
    this.scr.uScrInv.value.copy(this.screenFrame.matrixWorld).invert();

    let state = null;
    for (const w of this.works) {
      const r = running.filter((x) => x.item.work === w).sort((a, b) => a.t - b.t)[0];
      if (r) {
        const st = w.update(r.t, time, dt, r.show, r.item.variant);
        if (r.primary || !state) state = st ?? state;
      } else w.update(Infinity, time, dt, 0);
    }
    // title beats: a project's name as it begins, once the entry before it has finished
    const titled = new Set();
    for (const r of running) {
      const key = r.item.work.name === 'micro' ? `micro:${r.item.variant ?? 'avoid'}` : r.item.work.name;
      const title = this.titles[key];
      if (!title || titled.has(key)) continue;
      if (title.update(r.t - (r.item.overlap ?? 0) - 0.3, time)) titled.add(key);
    }
    for (const [key, title] of Object.entries(this.titles)) if (!titled.has(key)) title.update(-1, time);
    this.titleOn = [...titled][0] ?? null;
    // the PROJECTS sign: always there, rebuilding itself (a showcase replays its full emergence)
    this.sign = this.works.find((w) => w.name === 'showcase');
    // order: cleaner on hover, converging through the flight in, clearest in a fresh focus and as a
    // re-engagement reassembles it; disruption comes back with the camera's drift
    const order = Math.max(0.6 * Math.min(1, 2 * (this.hoverK ?? 0)), this.calm, 0.9 * this.pulse);
    if (!this.sign.running) this.sign.holo.persist(time, dt, { title: !!this.titleOn, order });
    // the background laboratory and the frog run on their own clocks
    const lab = this.lab.update(time, dt, { lockFrog: this.lockFrog, pin: this.lockFrog ? this.pin : null, quiet: this.focusK });
    if (lab?.focus && !state?.event) state = { ...(state ?? {}), focus: lab.focus, activity: Math.max(state?.activity ?? 0, 0.3) };
    // the ambient portal life: calm during a showcase; off the deck while a project uses it; no
    // physical travel while the frog is out (one project event and one small one at a time)
    this.majorNow = this.physicalWorks().map((w) => w.name);
    const amb = this.ambient.update(time, dt, {
      calm: Math.max(this.calm, 0.7 * (this.hoverK ?? 0)),
      majorBusy: this.majorNow.length > 0 || !this.#deckFree(time),
      microBusy: this.lab.frogBusy(time, 6) || this.lab.frogOut.visible,
    });
    if (amb.focus && !state?.focus) state = { ...(state ?? {}), focus: amb.focus };
    const cur = running.find((r) => r.primary);
    const curKey = cur ? `${cur.item.work.name}:${cur.item.variant ?? ''}` : null;
    if (curKey !== this._curKey && cur) this.emit('project-start', { name: cur.item.work.name, tier: cur.item.def?.tier });
    this._curKey = curKey;
    this.current = cur?.item.work.name ?? null;
    // an aperture at the back lights the vents around it
    const AP = this.ambient.portals;
    this.backFlash = Math.max(AP.hSlit.group.position.z < -0.5 ? AP.hSlit.open : 0, this.ambient.crawlBack ? AP.crawl.open * 0.8 : 0);

    const toWorld = (v) => (v ? (this._att ??= new THREE.Vector3()).copy(v).applyMatrix4(this.group.matrixWorld) : null);
    this.attention = toWorld(state?.focus);
    this.eventAt = state?.event ? (this._evt ??= new THREE.Vector3()).copy(state.event).applyMatrix4(this.group.matrixWorld) : null;

    // the machine's own activity: what the works report, and any portal it holds open
    const open = this.portals.filter((p) => p.open > 0.01).sort((a, b) => b.open * b.tier - a.open * a.tier);
    const portalAct = open.reduce((m, p) => Math.max(m, p.open * Math.min(1, p.tier)), 0);
    const want = Math.max(state?.activity ?? 0.15, portalAct, state?.crossing ? 0.6 : 0, amb.activity) * (1 - 0.55 * this.calm);
    this.activity = THREE.MathUtils.lerp(this.activity ?? 0, want, Math.min(1, dt * 2.5));
    this.#signals(time, dt, state);

    // light: the screen brightens a little while something crosses it and takes a faint cast from
    // the project on it; open portals spill vermilion by their tier
    const base = this._spotBase ??= this.screenLight.color.clone();
    this._cross = THREE.MathUtils.lerp(this._cross ?? 0, state?.crossing ? 1 : 0, Math.min(1, dt * 2));
    this.crossingK = this._cross;
    this.screenLight.intensity = 7 * (1 + 0.45 * this._cross);
    this.screenLight.color.copy(base).lerp(this._tint ??= new THREE.Color(), state?.tint ? 0.14 : 0);
    if (state?.tint) this._tint.set(state.tint);
    this.portalLights.forEach((l, i) => {
      const p = open[i];
      l.intensity = p ? 3.0 * p.open * p.tier * p.tier : 0;
      l.distance = p ? 2.2 + 1.6 * p.tier : 3;
      if (p) l.position.setFromMatrixPosition(this.stationMatrix(p.group, this._sm));
    });
    this.openPortals = open;
    // anything open anywhere, including the apertures inside the screen (for the activity report)
    this.anyPortalOpen = open.length > 0 || this.lab.micro.open > 0.05 || Object.values(this.ambient.portals).some((p) => p.open > 0.05) || this.works.some((w) => ['T', 'VA', 'VB', 'VC', 'VD', 'VR', 'P'].some((k) => w[k]?.open > 0.05));
    if (this.events.length > 48) this.events.splice(0, this.events.length - 48); // nobody is listening
  }

  /** Bay, lamps and cable follow the machine's activity. */
  #signals(time, dt, state) {
    const a = this.activity;
    this.bayGlow.emissiveIntensity = 0.45 + 1.9 * a * (0.8 + 0.2 * Math.sin(time * 23) * Math.sin(time * 7.3));
    // the active work's lamp is lit; busy moments chase along the row
    const lamp = state?.lamp ?? this.works.find((w) => w.name === this.current)?.lamp ?? -1;
    const chase = a > 0.55 && !state?.alarm ? Math.floor(time * 9) % 6 : -1;
    // something has escaped: every lamp blinks together
    const alarm = state?.alarm && Math.floor(time * 4) % 2 === 0;
    this.lamps.forEach((l, i) => {
      const target = alarm ? 2.6 : i === lamp ? 3.0 : i === chase ? 1.6 : 0.16;
      l.material.emissiveIntensity += (target - l.material.emissiveIntensity) * Math.min(1, dt * 10);
    });
    if (chase >= 0 && chase !== this._lastChase) this.emit('lamp', { i: chase });
    this._lastChase = chase;
    // pulses down the cable: on demand, and now and then while the machine is busy
    this._pulseTimer = (this._pulseTimer ?? 0) - dt * (0.2 + a);
    if (this._pulseTimer <= 0 && a > 0.35) {
      this.pulseCable(0.6 + 0.4 * a);
      this._pulseTimer = 2.2 + Math.abs(Math.sin(time * 1.7)) * 2;
    }
    this._pulses = (this._pulses ?? []).filter((p) => (p.t += dt / 0.9) < 1.2);
    const p = this._pulses[0];
    this.cablePulse.uPulse.value = p ? p.t : -1;
    this.cablePulse.uPulseK.value = p ? p.k * (1 - Math.max(0, p.t - 1) * 5) : 0;
    this.#hardware(time, dt, state, lamp);
  }

  /**
   * The hardware answers what the machine is doing, on every side: a signal from the screen runs
   * through seam, bay, spine and vents into the cable; the vents breathe and chase while it works and
   * flare when an aperture opens at the back; the spine's status column shows the running work;
   * relays click; the turntable's ticks light as they pass the fixed index mark.
   */
  #hardware(time, dt, state, lamp) {
    const a = this.activity;
    const C = this._col;
    const hot = (k) => C.setRGB(1.0 * k, 0.42 * k, 0.26 * k);
    // the travelling signal
    let seamF = 0, bayF = -1, ledF = -1, ventF = -1;
    this.signal = this.signal.filter((sg) => {
      sg.t += dt;
      const t = sg.t;
      seamF = Math.max(seamF, sg.k * Math.exp(-(((t - 0.08) / 0.12) ** 2)));
      if (t > 0.12 && t < 0.55) bayF = Math.floor(((t - 0.12) / 0.43) * 6);
      if (t > 0.35 && t < 0.95) ledF = 7 - Math.floor(((t - 0.35) / 0.6) * 8);
      if (t > 0.6 && t < 1.25) ventF = (t - 0.6) / 0.65;
      if (t > 1.0 && !sg.cable) (sg.cable = true), this.pulseCable(0.8 * sg.k);
      if (t > 0.15 && !sg.relay) (sg.relay = true), this.#click(Math.floor(this.rand() * this.relays.length));
      return t < 1.6;
    });
    this.seamGlow.emissiveIntensity = 2.0 * (0.9 + 0.1 * Math.sin(time * 0.9)) + 2.6 * seamF;
    // the back: breathing, a slow upward chase while busy, the signal's sweep, and a flare when an
    // aperture opens there
    const back = this.backFlash ?? 0;
    for (let i = 0; i < 10; i++) {
      let k = 0.12 + 0.05 * Math.sin(time * 0.6 + i * 0.5);
      if (a > 0.45) k += 0.5 * (a - 0.45) * Math.max(0, Math.cos(((i / 10 - ((time * 0.35) % 1)) * Math.PI * 2)) ** 6);
      if (ventF >= 0) k += 1.4 * Math.exp(-((((i / 9) - ventF) / 0.12) ** 2));
      k += 1.6 * back * Math.exp(-(((i - (this.backRow ?? 4.5)) / 1.4) ** 2));
      this.vents.setColorAt(i, hot(k));
    }
    this.vents.instanceColor.needsUpdate = true;
    const act = time - (this.activateAt ?? -9); // since the click that activated the console
    // the bay's row lamps follow the running work and the signal
    for (let i = 0; i < 6; i++) {
      let k = 0.25 + (i === lamp ? 1.4 : 0) + 0.3 * a * (Math.sin(time * 5.3 + i * 1.9) > 0.6 ? 1 : 0) + 0.9 * (this.hoverK ?? 0) * (Math.sin(time * 6 - i * 0.9) > 0.3 ? 1 : 0);
      if (act > 0 && act < 1.4) k += 2 * (1 - THREE.MathUtils.smoothstep(act, 0.6, 1.4));
      if (bayF === i) k += 3;
      this.glints.setColorAt(i, hot(k));
    }
    this.glints.instanceColor.needsUpdate = true;
    // the spine's status column: the running work as a code, a heartbeat, and the signal's chase;
    // activation fills the column from the bottom, then lets it settle
    const code = (lamp + 2) * 37;
    for (let i = 0; i < 8; i++) {
      let k = 0.08;
      if (act > 0 && act < 1.6) k += 2.2 * THREE.MathUtils.smoothstep(act, i * 0.09, i * 0.09 + 0.12) * (1 - THREE.MathUtils.smoothstep(act, 1.0, 1.6));
      if (i < 6 && (code >> i) & 1) k = 0.9;
      if (i === 7) k = 0.3 + 0.9 * Math.max(0, Math.sin(time * 2.4)) ** 8;
      if (ledF === i) k += 2.6;
      this.leds.setColorAt(i, hot(k));
    }
    this.leds.instanceColor.needsUpdate = true;
    // relays settle after a click
    for (const r of this.relays) {
      if (r.k < 0.001) continue;
      r.k *= Math.exp(-dt * 18);
      r.r.position.z = r.z + 0.009 * r.k;
    }
    // the turntable: ticks light as they pass the index mark; every quarter turn is a detent
    for (let i = 0; i < 48; i++) {
      const ang = Math.atan2(Math.sin((i / 48) * Math.PI * 2 + this.yaw.v), Math.cos((i / 48) * Math.PI * 2 + this.yaw.v));
      const k = (i % 12 === 0 ? 0.45 : 0.12) + 2.2 * Math.exp(-((ang / 0.035) ** 2));
      this.ticks.setColorAt(i, hot(k));
    }
    this.ticks.instanceColor.needsUpdate = true;
    const quarter = Math.floor(this.yaw.v / (Math.PI / 6));
    if (this._quarter !== undefined && quarter !== this._quarter) this.emit('detent', { major: quarter % 3 === 0 });
    this._quarter = quarter;
  }

  #click(i) {
    const r = this.relays[i];
    if (!r) return;
    r.k = 1;
    this.emit('relay', { i });
  }
}
