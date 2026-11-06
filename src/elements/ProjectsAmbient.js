import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SCREEN_GLSL, PHOSPHOR_GLSL as PH } from './ProjectsScreen.js';
import { Portal, hermite } from './ProjectsPortal.js';
import { pulse, clippedMaterial } from './ProjectsKit.js';
import { mulberry32 } from '../gl/noise.js';

// The console's ambient portal life: between and around the projects, small apertures keep opening
// all over the machine and in the air near it, so the station is never entirely still. Most are
// quiet (a remnant that half-opens and closes, a row of tiny apertures, a cut at the screen's edge);
// some carry a small bead along a chain of them (out of the chassis, into the air, down onto the
// head, out of the back), redirect it, drop it from the screen's digital floor onto the deck, or
// throw it from the air into the glass. One act at a time; the director keeps away from the deck and
// the front while a project is out there, and from all physical travel while the frog is out.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const hashL = (i) => { const r = Math.sin(i * 127.1 + 11.7) * 43758.5453; return r - Math.floor(r); };
const DECK = 1.56;
const BEAD_R = 0.038;

// The portal pool. Each act places the portals it uses (only while they are closed).
const POOL = {
  airA: ['machine', { rx: 0.26, ry: 0.2, shape: 'ellipse', tier: 'micro' }],
  airB: ['machine', { rx: 0.24, ry: 0.18, shape: 'ellipse', tier: 'micro' }],
  rectA: ['machine', { rx: 0.12, ry: 0.09, shape: 'rect', tier: 'micro' }],
  rectB: ['machine', { rx: 0.12, ry: 0.09, shape: 'rect', tier: 'micro' }],
  slitA: ['machine', { rx: 0.14, ry: 0.035, shape: 'slit', tier: 'micro' }],
  hRect: ['head', { rx: 0.12, ry: 0.09, shape: 'rect', tier: 'micro' }],
  hTop: ['head', { rx: 0.09, ry: 0.07, shape: 'rect', tier: 'micro' }],
  hSlit: ['head', { rx: 0.3, ry: 0.045, shape: 'slit', tier: 'micro' }],
  tiny0: ['head', { rx: 0.05, ry: 0.05, shape: 'round', tier: 'micro' }],
  tiny1: ['head', { rx: 0.05, ry: 0.05, shape: 'round', tier: 'micro' }],
  tiny2: ['head', { rx: 0.05, ry: 0.05, shape: 'round', tier: 'micro' }],
  sRound: ['screen', { rx: 0.13, ry: 0.13, shape: 'round', tier: 'micro', masked: true }],
  sEll: ['screen', { rx: 0.14, ry: 0.11, shape: 'ellipse', tier: 'micro', masked: true }],
  sSlit: ['screen', { rx: 0.16, ry: 0.04, shape: 'slit', tier: 'micro', masked: true }],
  hRect2: ['head', { rx: 0.11, ry: 0.09, shape: 'rect', tier: 'micro' }],
  sEll2: ['screen', { rx: 0.13, ry: 0.11, shape: 'ellipse', tier: 'micro', masked: true }],
  // the continuous loops: a slit crawling along the chassis, apertures deep in the screen
  crawl: ['head', { rx: 0.16, ry: 0.03, shape: 'slit', tier: 'micro' }],
  deep: ['screen', { rx: 0.12, ry: 0.12, shape: 'round', tier: 'micro', masked: true }],
  deep2: ['screen', { rx: 0.09, ry: 0.06, shape: 'ellipse', tier: 'micro', masked: true }],
  // the aperture that answers a hover: at the screen corner nearest the viewer
  ack: ['screen', { rx: 0.11, ry: 0.11, shape: 'round', tier: 'micro', masked: true }],
};
const LOOPS = new Set(['crawl', 'deep', 'deep2', 'ack']);
const BAY_X = -1.965; // in front of the bay window on the head's left face

// Acts. place: [portal, position, normal (the portal's front)] in its parent's space.
// open: [portal, a, b, c, d, peak] (a pulse). legs: a bead's path; an end at a portal means leaving
// it (start) or entering it (end), along its normal; an end at a point is in machine or screen space.
const REMNANT_SPOTS = [
  ['hRect', V(1.752, 0.35, -0.2), V(1, 0, 0)],
  ['hSlit', V(0.45, 0.15, -0.59), V(0, 0, -1)],
  ['airA', V(2.55, 3.7, -0.45), V(-0.95, 0, 0.3)],
  ['airB', V(-2.5, 3.2, 0.3), V(0.9, 0, 0.4)],
  ['rectA', V(-0.755, 2.55, -0.56), V(-1, 0, 0)],
  ['hTop', V(0.75, 1.215, -0.25), V(0, 1, 0)],
];
const TINY_SETS = [
  [[V(1.752, -0.55, -0.35), V(1, 0, 0)], [V(1.752, -0.15, 0.05), V(1, 0, 0)], [V(1.752, 0.7, -0.42), V(1, 0, 0)]],
  [[V(-0.9, -0.5, -0.59), V(0, 0, -1)], [V(0.0, 0.6, -0.59), V(0, 0, -1)], [V(0.95, -0.2, -0.59), V(0, 0, -1)]],
];

const ACTS = {
  remnant: { dur: 3.2, weight: 3, calm: true, build(rng) {
    const [p, pos, n] = REMNANT_SPOTS[Math.floor(rng() * REMNANT_SPOTS.length)];
    return { side: Math.abs(pos.x) > 0.5 ? Math.sign(pos.x) : 0, place: [[p, pos, n]], open: [[p, 0.2, 1.0, 2.2, 3.0, 0.32 + rng() * 0.25]], flicker: true };
  } },
  tiny: { dur: 3.0, weight: 2, calm: true, build(rng) {
    const k = Math.floor(rng() * TINY_SETS.length);
    const set = TINY_SETS[k];
    return {
      side: k === 0 ? 1 : 0,
      place: set.map(([pos, n], i) => [`tiny${i}`, pos, n]),
      open: [['tiny0', 0, 0.3, 0.9, 1.3, 1], ['tiny1', 0.45, 0.75, 1.4, 1.8, 1], ['tiny2', 0.9, 1.2, 2.0, 2.5, 1]],
    };
  } },
  edge: { dur: 3.6, weight: 2, calm: true, build(rng) {
    const s = rng() < 0.5 ? 1 : -1;
    return {
      place: [['sRound', V(1.4 * s, -0.86 * s, -0.03), V(0, 0, 1)]],
      open: [['sRound', 0.2, 0.7, 2.7, 3.3, 1]],
      legs: [{ t0: 0.6, t1: 2.6, space: 'screen', a: { p: V(0.2 * s, -0.25 * s, -1.8), in: 'screen' }, b: { portal: 'sRound', speed: 0.5 } }],
    };
  } },
  chain: { dur: 5.2, weight: 2, physical: true, build() {
    return {
      side: 1,
      place: [
        ['hRect', V(1.752, 0.35, -0.2), V(1, 0, 0)],
        ['airA', V(2.6, 3.7, -0.5), V(-0.6, 0.7, 0.5)],
        ['airB', V(-0.6, 6.2, -0.4), V(0, -1, 0)],
        ['hTop', V(0.75, 1.215, -0.25), V(0, 1, 0)],
        ['hSlit', V(0.45, 0.15, -0.59), V(0, 0, -1)],
        ['slitA', V(-1.4, 3.3, -1.7), V(0.75, 0.4, 0.5)],
      ],
      open: [['hRect', 0, 0.4, 0.8, 1.2, 1], ['airA', 1.0, 1.4, 1.9, 2.3, 1], ['airB', 1.2, 1.55, 2.0, 2.4, 1], ['hTop', 2.1, 2.45, 2.9, 3.3, 1], ['hSlit', 2.3, 2.6, 3.0, 3.4, 1], ['slitA', 3.4, 3.8, 4.3, 4.8, 1]],
      legs: [
        { t0: 0.45, t1: 1.55, a: { portal: 'hRect', speed: 1.4 }, b: { portal: 'airA', speed: 1.2 } },
        { t0: 1.55, t1: 2.6, a: { portal: 'airB', speed: 1.2 }, b: { portal: 'hTop', speed: 1.8 } },
        { t0: 2.62, t1: 4.0, a: { portal: 'hSlit', speed: 1.8 }, b: { portal: 'slitA', speed: 1.1 } },
      ],
    };
  } },
  redirect: { dur: 3.8, weight: 1.5, physical: true, deck: true, build() {
    return {
      side: -1,
      place: [
        ['slitA', V(-0.72, 2.6, 0.62), V(0, -1, 0)],
        ['rectA', V(-0.72, DECK + 0.004, 0.5), V(0, 1, 0)],
        ['airA', V(-2.3, 2.15, 0.95), V(-0.9, 0.05, 0.3)],
        ['rectB', V(-0.755, 2.4, -0.56), V(-1, 0, 0)],
      ],
      open: [['slitA', 0.0, 0.4, 0.7, 1.1, 1], ['rectA', 0.8, 1.05, 1.4, 1.8, 1], ['airA', 0.9, 1.2, 1.6, 2.0, 1], ['rectB', 2.4, 2.75, 3.1, 3.5, 1]],
      legs: [
        { t0: 0.45, t1: 1.25, a: { portal: 'slitA', speed: 0.6 }, b: { portal: 'rectA', speed: 2.2 } },
        { t0: 1.25, t1: 2.95, a: { portal: 'airA', speed: 1.6 }, b: { portal: 'rectB', speed: 1.0 } },
      ],
    };
  } },
  screenToAir: { dur: 4.2, weight: 1.5, physical: true, build() {
    return {
      side: -1,
      place: [
        ['sEll', V(-1.25, 0.1, -0.9), V(1, 0, 0)],
        ['airA', V(-2.45, 4.5, 0.85), V(-0.55, 0.15, 0.8)],
        ['airB', V(-2.6, 3.1, -0.4), V(0, 0.6, 0.8)],
      ],
      open: [['sEll', 0.0, 0.4, 1.9, 2.3, 1], ['airA', 1.4, 1.75, 2.2, 2.6, 1], ['airB', 2.9, 3.25, 3.7, 4.1, 1]],
      legs: [
        { t0: 0.3, t1: 1.9, space: 'screen', a: { p: V(0.7, 0.25, -2.4), in: 'screen' }, b: { portal: 'sEll', speed: 0.9 } },
        { t0: 1.9, t1: 3.6, a: { portal: 'airA', speed: 1.0 }, b: { portal: 'airB', speed: 1.0 } },
      ],
    };
  } },
  airToScreen: { dur: 3.6, weight: 1.5, physical: true, deck: true, build() {
    return {
      side: 1,
      place: [['airA', V(2.0, 4.6, 1.75), V(-0.85, -0.1, -0.5)]],
      open: [['airA', 0.0, 0.4, 0.8, 1.2, 1]],
      legs: [
        { t0: 0.5, t1: 1.6, a: { portal: 'airA', speed: 1.2 }, b: { p: V(0.9, 0.3, 0), in: 'screen', v: V(0, 0, -1.4), glass: true } },
        { t0: 1.6, t1: 3.3, space: 'screen', a: { p: V(0.9, 0.3, 0), in: 'screen', v: V(0, 0, -1.4) }, b: { p: V(0.2, -0.1, -3.2), in: 'screen' } },
      ],
    };
  } },
  fallDrop: { dur: 4.4, weight: 1.5, physical: true, deck: true, build() {
    const rest = (x, z) => V(x, DECK + BEAD_R, z);
    return {
      side: 1,
      place: [
        ['sSlit', V(0.7, -0.93, -0.9), V(0, 1, 0)],
        ['slitA', V(0.75, 2.6, 0.75), V(0, -1, 0)],
        ['rectA', V(0.32, DECK + 0.004, 0.5), V(0, 1, 0)],
      ],
      open: [['sSlit', 0.6, 0.95, 1.3, 1.7, 1], ['slitA', 0.9, 1.2, 1.5, 1.9, 1], ['rectA', 2.5, 2.9, 3.6, 4.0, 1]],
      legs: [
        { t0: 0.2, t1: 1.3, space: 'screen', a: { p: V(0.7, 0.6, -0.9), in: 'screen', v: V(0, 0, 0) }, b: { portal: 'sSlit', speed: 2.0 } },
        { t0: 1.3, t1: 1.72, a: { portal: 'slitA', speed: 2.0 }, b: { p: rest(0.75, 0.68), in: 'machine', v: V(0, -2.6, 0) } },
        { t0: 1.72, t1: 2.12, a: { p: rest(0.75, 0.68), in: 'machine', v: V(-0.3, 1.0, -0.2) }, b: { p: rest(0.62, 0.6), in: 'machine', v: V(-0.3, -1.0, -0.2) } },
        { t0: 2.12, t1: 2.36, a: { p: rest(0.62, 0.6), in: 'machine', v: V(-0.3, 0.45, -0.1) }, b: { p: rest(0.55, 0.57), in: 'machine', v: V(-0.3, -0.45, -0.1) } },
        { t0: 2.36, t1: 3.15, a: { p: rest(0.55, 0.57), in: 'machine', v: V(-0.25, 0, -0.07) }, b: { p: rest(0.32, 0.5), in: 'machine', v: V(0, 0, 0) } },
        { t0: 3.15, t1: 3.7, a: { p: rest(0.32, 0.5), in: 'machine', v: V(0, 0, 0) }, b: { p: V(0.32, DECK - 0.08, 0.5), in: 'machine', v: V(0, -0.5, 0) }, clip: 'rectA' },
      ],
    };
  } },
  ventSlit: { dur: 3.8, weight: 1.6, physical: true, shape: 'tile', build(rng) {
    const row = 2 + Math.floor(rng() * 6);
    const y = -0.82 + 0.18 * row + 0.09;
    return {
      backRow: row + 0.5,
      place: [['hSlit', V(0.0, y, -0.6), V(0, 0, -1)], ['rectB', V(0.3, 2.75, -0.87), V(0, 0.1, -1)]],
      open: [['hSlit', 0.0, 0.35, 0.9, 1.4, 1], ['rectB', 1.6, 2.0, 2.7, 3.2, 1]],
      legs: [{ t0: 0.4, t1: 2.5, a: { portal: 'hSlit', speed: 1.2 }, b: { portal: 'rectB', speed: 0.9 } }],
    };
  } },
  pairedFaces: { dur: 4.4, weight: 1.4, physical: true, build() {
    return {
      place: [
        ['airA', V(2.75, 4.4, 0.5), V(-0.8, -0.1, -0.55)],
        ['hRect', V(1.752, 0.0, -0.15), V(1, 0, 0)],
        ['hRect2', V(BAY_X, -0.15, -0.15), V(-1, 0, 0)],
        ['airB', V(-2.7, 3.7, 0.3), V(0.85, 0.2, -0.45)],
      ],
      open: [['airA', 0.0, 0.35, 0.8, 1.2, 1], ['hRect', 0.8, 1.1, 1.6, 2.0, 1], ['hRect2', 1.2, 1.5, 2.0, 2.4, 1], ['airB', 2.6, 2.95, 3.5, 3.9, 1]],
      legs: [
        { t0: 0.45, t1: 1.55, a: { portal: 'airA', speed: 1.3 }, b: { portal: 'hRect', speed: 1.3 } },
        { t0: 1.55, t1: 3.3, a: { portal: 'hRect2', speed: 1.3 }, b: { portal: 'airB', speed: 1.0 } },
      ],
    };
  } },
  screenChassisAir: { dur: 4.6, weight: 1.4, physical: true, side: 1, shape: 'tile', build() {
    return {
      side: 1,
      place: [
        ['sEll', V(1.3, 0.0, -0.9), V(-1, 0, 0)],
        ['hRect', V(1.752, -0.3, -0.25), V(1, 0, 0)],
        ['airA', V(2.6, 2.9, 0.9), V(-0.45, 0.6, -0.67)],
      ],
      open: [['sEll', 0.0, 0.4, 1.7, 2.1, 1], ['hRect', 1.4, 1.7, 2.2, 2.6, 1], ['airA', 2.8, 3.15, 3.7, 4.1, 1]],
      legs: [
        { t0: 0.3, t1: 1.8, space: 'screen', a: { p: V(-0.4, 0.2, -2.0), in: 'screen' }, b: { portal: 'sEll', speed: 0.9 } },
        { t0: 1.8, t1: 3.5, a: { portal: 'hRect', speed: 1.1 }, b: { portal: 'airA', speed: 1.0 } },
      ],
    };
  } },
  deckScreenTop: { dur: 5.6, weight: 1.2, physical: true, deck: true, build() {
    return {
      side: 1,
      place: [
        ['rectB', V(-0.42, DECK + 0.004, 0.52), V(0, 1, 0)],
        ['rectA', V(0.42, DECK + 0.004, 0.52), V(0, 1, 0)],
        ['sSlit', V(0.42, 0.93, -0.9), V(0, -1, 0)],
        ['hTop', V(0.42, 1.215, -0.25), V(0, 1, 0)],
        ['hRect', V(1.752, 0.1, -0.3), V(1, 0, 0)],
      ],
      open: [['rectB', 0.0, 0.3, 0.7, 1.1, 1], ['rectA', 0.6, 0.9, 1.4, 1.8, 1], ['sSlit', 2.2, 2.5, 3.0, 3.4, 1], ['hTop', 2.6, 2.9, 3.4, 3.8, 1], ['hRect', 3.9, 4.2, 4.8, 5.2, 1]],
      legs: [
        { t0: 0.4, t1: 1.3, a: { portal: 'rectB', speed: 1.8 }, b: { portal: 'rectA', speed: 1.8 } },
        { t0: 1.3, t1: 2.95, space: 'screen', a: { p: V(0.42, -0.92, -0.9), in: 'screen', v: V(0, 1.0, 0) }, b: { portal: 'sSlit', speed: 1.0 } },
        // up off the top, over the edge and back into the head through its own side
        { t0: 2.95, t1: 4.55, a: { portal: 'hTop', speed: 2.2 }, b: { portal: 'hRect', speed: 2.6 } },
      ],
    };
  } },
  rearScreenSide: { dur: 5.2, weight: 1.2, physical: true, shape: 'tile', build() {
    return {
      side: -1,
      place: [
        ['airB', V(0.5, 4.7, -1.75), V(0, -0.2, 1)],
        ['hSlit', V(0.2, 0.35, -0.6), V(0, 0, -1)],
        ['sEll', V(-1.3, 0.1, -0.9), V(1, 0, 0)],
        ['hRect2', V(BAY_X, 0.35, -0.2), V(-1, 0, 0)],
        ['airA', V(-2.75, 3.3, 0.8), V(0.75, 0.35, -0.55)],
      ],
      open: [['airB', 0.0, 0.35, 0.8, 1.2, 1], ['hSlit', 0.7, 1.0, 1.5, 1.9, 1], ['sEll', 2.2, 2.6, 3.2, 3.6, 1], ['hRect2', 2.8, 3.1, 3.6, 4.0, 1], ['airA', 4.0, 4.3, 4.8, 5.2, 1]],
      legs: [
        { t0: 0.4, t1: 1.3, a: { portal: 'airB', speed: 1.3 }, b: { portal: 'hSlit', speed: 1.3 } },
        { t0: 1.3, t1: 3.05, space: 'screen', a: { p: V(0.3, 0.2, -5.0), in: 'screen', v: V(0, 0, 1.5) }, b: { portal: 'sEll', speed: 0.9 } },
        { t0: 3.05, t1: 4.55, a: { portal: 'hRect2', speed: 1.1 }, b: { portal: 'airA', speed: 1.0 } },
      ],
    };
  } },
  split: { dur: 5.0, weight: 1.2, physical: true, build() {
    return {
      side: 1,
      place: [
        ['airA', V(2.7, 3.7, 0.7), V(-0.8, 0.25, -0.55)],
        ['hRect', V(1.752, -0.2, -0.2), V(1, 0, 0)],
        ['hRect2', V(BAY_X, -0.2, -0.2), V(-1, 0, 0)],
        ['airB', V(-2.6, 4.2, 0.5), V(0.8, -0.2, -0.55)],
      ],
      open: [['airA', 0.0, 0.35, 0.8, 1.2, 1], ['hRect', 0.8, 1.1, 3.1, 3.5, 0.85], ['hRect2', 0.9, 1.2, 3.2, 3.6, 0.85], ['airB', 3.6, 3.95, 4.4, 4.8, 1]],
      legs: [
        { t0: 0.45, t1: 1.35, a: { portal: 'airA', speed: 1.1 }, b: { portal: 'hRect', speed: 0.5 } },
        // held half-way: half of it on each side of the head
        { t0: 1.35, t1: 3.0, hold: true, a: { portal: 'hRect' }, b: { portal: 'hRect2' } },
        { t0: 3.0, t1: 4.3, a: { portal: 'hRect2', speed: 0.5 }, b: { portal: 'airB', speed: 1.0 } },
      ],
    };
  } },
  deckHop: { dur: 2.6, weight: 1, physical: true, deck: true, build(rng) {
    const s = rng() < 0.5 ? 1 : -1;
    return {
      place: [['rectA', V(-0.62 * s, DECK + 0.004, 0.55), V(0, 1, 0)], ['rectB', V(0.62 * s, DECK + 0.004, 0.55), V(0, 1, 0)]],
      open: [['rectA', 0.0, 0.35, 0.8, 1.2, 1], ['rectB', 1.0, 1.35, 1.9, 2.3, 1]],
      legs: [{ t0: 0.45, t1: 1.65, a: { portal: 'rectA', speed: 2.0 }, b: { portal: 'rectB', speed: 2.0 } }],
    };
  } },
};

export class Ambient {
  constructor(host) {
    this.host = host;
    const { scr } = host;
    this.portals = {};
    for (const [name, [parent, opts]] of Object.entries(POOL)) {
      const p = new Portal(scr, opts);
      p.ambient = true;
      if (parent === 'screen') host.addScreenPortal(p, V(0, 0, -1), V(0, 0, 1));
      else if (parent === 'head') host.addHeadPortal(p, V(0, 0, 0), V(0, 0, 1));
      else host.addPortal(p, V(0, 0, 0), V(0, 0, 1));
      this.portals[name] = p;
    }
    // the bead: drawn twice while it passes through an aperture (the part on each side)
    const geo = (this.beadGeo = new RoundedBoxGeometry(BEAD_R * 2, BEAD_R * 2, BEAD_R * 2, 2, 0.012));
    // a fragment of a project: a small flat tile
    this.tileGeo = new RoundedBoxGeometry(0.1, 0.1, 0.018, 2, 0.006);
    this.beads = [0, 1].map((i) => {
      const mat = clippedMaterial({ color: 0xcfc8bb, roughness: 0.35, metalness: 0.1, emissive: 0xe3684d, emissiveIntensity: 0.55 }, `proj-amb-bead${i}`, scr);
      const m = new THREE.Mesh(geo, mat);
      m.customDepthMaterial = mat.userData.depth;
      m.castShadow = true;
      m.visible = false;
      host.group.add(m);
      return m;
    });
    // the same bead inside the screen: a phosphor point with a short trail
    const N = 6;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    pg.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(N), 1));
    this.dot = new THREE.Points(pg, new THREE.ShaderMaterial({
      uniforms: { ...scr, uScale: host.ctx.uniforms.uPointScale },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uScale; attribute float aA; varying vec3 vW; varying float vA; void main(){ vA = aA; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; gl_Position = projectionMatrix * mv; gl_PointSize = aA > 0.01 ? max(0.07 * uScale / -mv.z, 1.5) : 0.0; }`,
      fragmentShader: /* glsl */ `
        ${SCREEN_GLSL}
        varying vec3 vW; varying float vA;
        void main() {
          float fd; if (vA < 0.01 || !scrSee(vW, fd)) discard; gl_FragDepth = fd;
          vec2 c = abs(gl_PointCoord - 0.5) * 2.0;
          float a = 1.0 - smoothstep(0.35, 1.0, max(c.x, c.y));
          gl_FragColor = vec4(mix(${PH}, vec3(1.0, 0.45, 0.28), 0.4) * a * vA * 1.2, 1.0);
        }`,
    }));
    this.dot.frustumCulled = false;
    this.dot.visible = false;
    host.group.add(this.dot);
    this.rng = mulberry32(71);
    this.act = null;
    this.nextAt = 3;
    this.last = null;
    this.focus = new THREE.Vector3();
    this.count = {};
    this._m = new THREE.Matrix4();
    this._plane = new THREE.Plane();
    this._trail = [];
  }

  #choose(time, { calm, majorBusy, microBusy }, force = null) {
    const ok = Object.entries(ACTS).filter(([name, a]) => {
      if (force) return name === force;
      if (name === this.last) return false;
      if (calm > 0.5) return a.calm;
      if (a.physical && microBusy) return false;
      if (a.deck && majorBusy) return false;
      return true;
    });
    const total = ok.reduce((s, [, a]) => s + a.weight, 0);
    let r = this.rng() * total;
    const [name, def] = ok.find(([, a]) => (r -= a.weight) <= 0) ?? ok[0];
    const spec = def.build(this.rng);
    // acts happen on the side of the console that faces the viewer: mirror one authored for the
    // other side (positive camRel turns the -X side, the bay, toward the camera)
    const forced = this.host.ctx.app.params.get('pambside');
    // mostly on the side the viewer can see, but not always: the turning console reveals the rest
    const seen = (this.host.motion?.camRel ?? 0) > 0 ? -1 : 1;
    const visible = forced ? Math.sign(parseFloat(forced)) : this.rng() < 0.62 ? seen : -seen;
    spec.side ??= def.side;
    if (spec.side && spec.side !== visible) {
      const mx = (v) => v && v.set(-v.x, v.y, v.z);
      for (const [, pos, n] of spec.place ?? []) mx(pos), mx(n);
      for (const l of spec.legs ?? []) for (const e of [l.a, l.b]) if (e.p) mx(e.p), mx(e.v);
      // the head's left face carries the machinery bay, whose window stands proud of it: an
      // aperture on that side opens in the bay's window instead
      for (const [p, pos] of spec.place ?? []) {
        if (POOL[p][0] !== 'head') continue;
        if (pos.x < -1.7 && Math.abs(pos.y) < 0.9 && pos.z > -0.5) pos.x = BAY_X;
        else if (pos.x > 1.9) pos.x = 1.752; // the right face has no bay
      }
    }
    this.beads.forEach((b) => (b.geometry = (spec.shape ?? def.shape) === 'tile' ? this.tileGeo : this.beadGeo));
    this.host.backRow = spec.backRow ?? 4.5;
    for (const [p, pos, n] of spec.place ?? []) {
      const portal = this.portals[p];
      portal.group.position.copy(pos);
      portal.group.quaternion.setFromUnitVectors(V(0, 0, 1), n.clone().normalize());
    }
    this.last = name;
    this.count[name] = (this.count[name] ?? 0) + 1;
    this.host.emit('ambient-act', { name });
    return { name, def, spec, t0: time };
  }

  /** A leg end in the station's frame: position and velocity (a portal end leaves or enters it). */
  #end(e, start, outP, outV) {
    const h = this.host;
    if (e.portal) {
      const F = h.portalFrame(this.portals[e.portal], this._m);
      outP.setFromMatrixPosition(F);
      outV.setFromMatrixColumn(F, 2).normalize().multiplyScalar(start ? e.speed : -e.speed);
      return;
    }
    const M = e.in === 'screen' ? h.screenToStation : h.machine.matrix;
    outP.copy(e.p).applyMatrix4(M);
    outV.copy(e.v ?? V(0, 0, 0)).transformDirection(M).multiplyScalar((e.v ?? V(0, 0, 0)).length() * (e.in === 'screen' ? 1.12 : 1));
  }

  #legAt(leg, tau, outP) {
    const p0 = (this._p0 ??= V(0, 0, 0)), v0 = (this._v0 ??= V(0, 0, 0)), p1 = (this._p1 ??= V(0, 0, 0)), v1 = (this._v1 ??= V(0, 0, 0));
    this.#end(leg.a, true, p0, v0);
    this.#end(leg.b, false, p1, v1);
    const T = leg.t1 - leg.t0;
    if (tau < leg.t0) return outP.copy(p0).addScaledVector(v0, tau - leg.t0);
    if (tau > leg.t1) return outP.copy(p1).addScaledVector(v1, tau - leg.t1);
    return hermite(p0, v0, p1, v1, T, (tau - leg.t0) / T, outP);
  }

  /**
   * The continuous low-level loops, independent of the acts and of each other (13 s, 9 s, 15.5 s):
   * a narrow slit that crawls along a chassis edge (the top, the right face, between the vent rows),
   * and apertures that open and drift deep inside the screen.
   */
  /** A hover: the aperture at the screen corner nearest the viewer opens briefly, like a glance. */
  ack(time) {
    this.ackAt = time;
    const s = (this.host.motion?.camRel ?? 0) > 0 ? 1 : -1;
    this.portals.ack.group.position.set(1.38 * -s, 0.84, -0.04);
  }

  /** Focus or re-engagement: whatever transfer is under way resolves, and the next waits a little. */
  resolve(time) {
    if (this.act && this.fade === undefined) this.fade = 1;
    this.nextAt = Math.max(this.nextAt, time + 2.2);
  }

  #loops(time) {
    const P = this.portals;
    P.ack._want = pulse(time - (this.ackAt ?? -9), 0, 0.18, 0.7, 1.1);
    const kC = Math.floor(time / 13), uC = time - kC * 13;
    const path = Math.floor(hashL(kC) * 3);
    const v = THREE.MathUtils.smoothstep(uC, 0.3, 6.3);
    const cr = P.crawl;
    if (path === 0) cr.group.position.set(-1.4 + 2.8 * v, 1.215, -0.35), cr.group.quaternion.setFromUnitVectors(V(0, 0, 1), V(0, 1, 0));
    else if (path === 1) cr.group.position.set(1.752, -0.9 + 1.8 * v, -0.3), cr.group.quaternion.setFromUnitVectors(V(0, 0, 1), V(1, 0, 0));
    else {
      const row = 1 + Math.floor(hashL(kC + 3) * 7);
      cr.group.position.set(1.2 - 2.4 * v, -0.82 + 0.18 * row + 0.09, -0.6);
      cr.group.quaternion.setFromUnitVectors(V(0, 0, 1), V(0, 0, -1));
      if (cr.open > 0.05) (this.host.backRow = row + 0.5), (this.crawlBack = true);
    }
    if (path !== 2) this.crawlBack = false;
    const q = 1 - 0.75 * (this.calmK ?? 0);
    cr._want = 0.42 * pulse(uC, 0, 0.5, 5.0, 5.6) * q;
    const kD = Math.floor(time / 9), uD = time - kD * 9;
    if (uD < 0.05 || !this._deepAt || this._deepAt !== kD) {
      this._deepAt = kD;
      P.deep.group.position.set((hashL(kD) - 0.5) * 2.2, (hashL(kD + 1) - 0.5) * 1.2, -1.5 - hashL(kD + 2) * 3);
    }
    P.deep._want = 0.65 * pulse(uD, 0, 0.6, 2.8, 3.5) * q;
    const kE = Math.floor(time / 15.5), uE = time - kE * 15.5;
    P.deep2.group.position.set((hashL(kE + 9) - 0.5) * 2.4, (hashL(kE + 4) - 0.5) * 1.1, -2.0 - uE * 0.25);
    P.deep2.group.rotation.y = (hashL(kE) - 0.5) * 1.2;
    P.deep2._want = 0.55 * pulse(uE, 3.0, 3.8, 8.0, 8.8) * q;
  }

  #clipPlane(name) {
    return this.portals[name].plane(this._plane);
  }

  update(time, dt, flags) {
    const h = this.host;
    // debug: pin one act at one moment (?pamb=chain&pambt=1.5)
    const P = h.ctx.app.params;
    const force = P.get('pamb');
    if (force && ACTS[force]) {
      if (this.act?.name !== force) this.act = this.#choose(time, flags, force);
      this.act.t0 = time - parseFloat(P.get('pambt') ?? '1');
    } else if (!this.act && time >= this.nextAt) this.act = this.#choose(time, flags);
    const A = this.act;
    for (const [n, p] of Object.entries(this.portals)) if (!LOOPS.has(n)) p._want = 0;
    this.calmK = flags.calm ?? 0;
    this.#loops(time);
    this.beads.forEach((b) => (b.visible = false));
    let dotOn = false, physical = false;
    if (A) {
      const tau = time - A.t0;
      const { spec } = A;
      for (const [p, a, b, c, d, peak] of spec.open ?? []) {
        let k = pulse(tau, a, b, c, d) * peak * (this.fade ?? 1);
        if (spec.flicker) k *= 0.78 + 0.22 * Math.sin(time * 17.0) * Math.sin(time * 5.3);
        this.portals[p]._want = Math.max(this.portals[p]._want, k);
      }
      const legs = spec.legs ?? [];
      const cur = legs.find((l) => tau >= l.t0 && tau <= l.t1);
      // heard: the bead passing through an aperture (once per crossing)
      const ci = cur ? legs.indexOf(cur) : -1;
      if (ci > 0 && ci !== this._legIdx && legs[ci - 1].b.portal && this.fade === undefined) this.host.emit('amb-transit');
      this._legIdx = ci;
      // the bead
      const G = 0.15;
      const draw = (mesh, leg, clipA, clipB) => {
        mesh.visible = true;
        this.#legAt(leg, tau, mesh.position);
        mesh.rotation.set(time * 2.1, time * 1.3, 0);
        const mat = mesh.material.userData;
        mat.clip(0, clipA ? this.#clipPlane(clipA) : null);
        mat.clip(1, clipB ? this.#clipPlane(clipB) : null);
        mat.glass(!!leg.b.glass);
      };
      if (cur?.hold) {
        // held half-way through: one half at each aperture
        [cur.a.portal, cur.b.portal].forEach((name, i) => {
          const b = this.beads[i];
          b.visible = true;
          b.position.setFromMatrixPosition(this.host.portalFrame(this.portals[name], this._m));
          b.position.addScaledVector(V(0, 0, 0).setFromMatrixColumn(this._m, 2).normalize(), i ? 0.004 : -0.004);
          b.rotation.set(0.6, time * 0.4, 0);
          const u = b.material.userData;
          u.clip(0, this.#clipPlane(name));
          u.clip(1, null);
          u.glass(false);
        });
        physical = true;
      } else if (cur && cur.space !== 'screen') {
        draw(this.beads[0], cur, cur.a.portal && tau < cur.t0 + G ? cur.a.portal : null, cur.b.portal ? cur.b.portal : cur.clip ?? null);
        physical = true;
      }
      // the other side of an aperture it is passing through
      const tail = legs.find((l) => !l.hold && l.space !== 'screen' && (l.b.portal || l.b.glass) && tau > l.t1 && tau < l.t1 + G && !legs.some((m) => m.hold && Math.abs(m.t0 - l.t1) < 1e-3));
      const head = legs.find((l) => !l.hold && l.space !== 'screen' && l.a.portal && tau < l.t0 && tau > l.t0 - G && !legs.some((m) => m.hold && Math.abs(m.t1 - l.t0) < 1e-3));
      const ghost = cur?.hold ? null : tail ?? head;
      if (ghost) draw(this.beads[1], ghost, tail ? tail.b.portal ?? null : null, head ? head.a.portal : null);
      // inside the screen
      const sLeg = legs.find((l) => l.space === 'screen' && tau >= l.t0 - 0.05 && tau <= l.t1);
      if (sLeg) {
        dotOn = true;
        const pos = this.dot.geometry.attributes.position, al = this.dot.geometry.attributes.aA;
        const p = (this._dp ??= V(0, 0, 0));
        for (let i = 0; i < pos.count; i++) {
          const ti = Math.max(sLeg.t0, tau - i * 0.035);
          this.#legAt(sLeg, ti, p);
          pos.setXYZ(i, p.x, p.y, p.z);
          const fadeEnd = sLeg.b.portal ? 1 : 1 - pulse(tau, sLeg.t1 - 0.6, sLeg.t1, 99, 100);
          al.setX(i, (i === 0 ? 1 : 0.5 * (1 - i / pos.count)) * fadeEnd * (tau < sLeg.t0 ? 0 : 1));
        }
        pos.needsUpdate = al.needsUpdate = true;
      }
      if (cur && cur.space !== 'screen' && !cur.hold) this.focus.copy(this.beads[0].position);
      // an act being resolved closes its apertures over half a second, then ends
      if (this.fade !== undefined) {
        this.fade -= dt / 0.5;
        this.beads.forEach((b) => (b.visible = false));
        this.dot.visible = false;
        if (this.fade <= 0) (this.fade = undefined), (A.t0 = -1e9);
      }
      if (tau > A.def.dur) {
        this.act = null;
        this.nextAt = time + 0.4 + this.rng() * 1.1 + 3 * (flags.calm ?? 0);
      }
    }
    this.dot.visible = dotOn && this.fade === undefined;
    for (const p of Object.values(this.portals)) p.set(p._want, time);
    this.physical = physical;
    return { activity: A ? 0.22 : 0, focus: physical ? this.focus : null, name: A?.name ?? null };
  }
}
