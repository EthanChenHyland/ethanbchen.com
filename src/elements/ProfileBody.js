import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The Profile figure's body, built once at load from a signed distance field: a generic person, the
// profile icon (round head, sloping shoulders) grown into a full standing body. Simple forms only: no
// muscles, no joints, no face beyond a brow plane and a Cycladic nose ridge, which with the rounded
// occiput tell which way the head is turned.
//
// Units are human (1.8 tall, y up, facing +z, the figure's left at +x); the station scales it up.
// The field is meshed with surface nets, skinned to a 24-bone skeleton by the primitives it is made
// of (so a hand never takes weight from the thigh it hangs beside), and a second skinned mesh carries
// the body's internal structure (bones, tendons, joints) for the exposed state.

export const HUMAN_HEIGHT = 1.8;
// world units per human unit: a 1.8 figure stands 4.5 tall, its head clear of the neighbouring page's
// top from the canonical overview
export const FIGURE_SCALE = 2.5;

// bones: name, parent, bind position (human units)
const BONE_DEFS = [
  ['root', null, [0, 0, 0]],
  ['pelvis', 'root', [0, 0.97, 0]],
  ['spine', 'pelvis', [0, 1.1, 0]],
  ['chest', 'spine', [0, 1.28, 0]],
  ['neck', 'chest', [0, 1.47, -0.01]],
  ['head', 'neck', [0, 1.568, -0.005]], // set low enough that the head sits on the neck, not on a peg
];
const LIMBS = [
  ['clav', 'chest', [0.03, 1.44, -0.005]],
  ['upperArm', 'clav', [0.195, 1.415, 0]],
  ['foreArm', 'upperArm', [0.238, 1.145, -0.005]],
  ['hand', 'foreArm', [0.266, 0.885, 0.008]],
  ['fingers', 'hand', [0.271, 0.8, 0.008]],
  ['thumb', 'hand', [0.262, 0.862, 0.028]],
  ['index', 'hand', [0.272, 0.806, 0.03]],
  ['thigh', 'pelvis', [0.095, 0.94, 0]],
  ['shin', 'thigh', [0.102, 0.51, 0.012]],
  ['foot', 'shin', [0.108, 0.088, -0.008]],
  // one grouped distal knuckle for the finger block and the index (so a hand can wrap a thin object)
  ['tips', 'fingers', [0.2732, 0.752, 0.008]],
  ['indexTip', 'index', [0.2735, 0.76, 0.037]],
];
for (const [side, sx] of [['L', 1], ['R', -1]]) {
  for (const [n, p, [x, y, z]] of LIMBS) {
    const parent = ['chest', 'pelvis'].includes(p) ? p : p + side;
    BONE_DEFS.push([n + side, parent, [x * sx, y, z]]);
  }
}
export const BONES = BONE_DEFS.map(([name, parent, pos], i) => ({ name, parent, pos: new THREE.Vector3(...pos), index: i }));
export const BONE = Object.fromEntries(BONES.map((b) => [b.name, b.index]));

// ---------------------------------------------------------------- distance primitives
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const smin = (a, b, k) => {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
function sdEllipsoid(px, py, pz, c, r) {
  const x = (px - c.x) / r.x, y = (py - c.y) / r.y, z = (pz - c.z) / r.z;
  const k0 = Math.hypot(x, y, z);
  const k1 = Math.hypot(x / r.x, y / r.y, z / r.z);
  return k1 < 1e-9 ? -Math.min(r.x, r.y, r.z) : (k0 * (k0 - 1)) / k1;
}
// round cone (iq): a capsule whose radius goes from r1 at a to r2 at b
function sdRoundCone(px, py, pz, a, b, r1, r2) {
  const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pax = px - a.x, pay = py - a.y, paz = pz - a.z;
  const y = pax * bax + pay * bay + paz * baz, z = y - l2;
  const qx = pax * l2 - bax * y, qy = pay * l2 - bay * y, qz = paz * l2 - baz * y;
  const x2 = qx * qx + qy * qy + qz * qz, y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
// parameter along a segment, for weighting toward the next or previous bone near a joint
function segT(px, py, pz, a, b) {
  const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z;
  const t = ((px - a.x) * bax + (py - a.y) * bay + (pz - a.z) * baz) / (bax * bax + bay * bay + baz * baz);
  return Math.min(1, Math.max(0, t));
}

// Each primitive belongs to a group (how it blends) and to bones (how it moves). Limb primitives
// are defined for the left side (+x) and mirrored. `child`/`parent` blend weight across a joint.
const P = [];
// a plane through the face, tilted 13° downward, `d` in front of the face mass centre
function facePlane(d) {
  const n = new THREE.Vector3(0, -0.22, 0.975).normalize();
  return [n.x, n.y, n.z, n.dot(new THREE.Vector3(0, 1.634, 0.026)) + d];
}
const ell = (group, c, r, bone, extra = {}) => P.push({ kind: 'e', group, c, r, bone, ...extra });
const cone = (group, a, b, r1, r2, bone, extra = {}) => P.push({ kind: 'c', group, a, b, r1, r2, bone, ...extra });

// A sculptural pictogram of a person: the profile icon's round head and sloping shoulders, a clean
// torso block, strong simple limbs, readable hands. Nothing tries to imitate flesh.
//
// head: a near-spherical cranium; in front of it a narrower face mass cut flat by a plane tilted a
// little downward (the face plane, which catches light differently from the cranium, so the head's
// direction reads from anywhere); a restrained nose wedge on that plane; the face mass's lower edge
// is the jaw and chin. No eyes, no mouth.
// the head is entirely smooth and faceless: a round cranium and a softly forward lower face; its
// direction reads from the shape and from a faint inner glow on the front (no nose, no facets)
ell('head', v3(0, 1.701, -0.012), v3(0.098, 0.104, 0.1), 'head');
ell('head', v3(0, 1.648, 0.022), v3(0.076, 0.082, 0.078), 'head');
// a neck that belongs to the body: tapering from a wide base into the skull, not a column
cone('neck', v3(0, 1.43, -0.022), v3(0, 1.6, -0.006), 0.07, 0.05, 'neck', { parentBone: 'chest', parentBlend: 0.35, childBone: 'head', childBlend: 0.4 });
cone('neck', v3(0, 1.44, -0.026), v3(0, 1.505, -0.02), 0.088, 0.068, 'neck', { parentBone: 'chest', parentBlend: 0.5 });
// torso: one clean block from the shoulder line to the hips (no chest modelling)
ell('torso', v3(0, 1.318, -0.004), v3(0.158, 0.17, 0.1), 'chest', { lower: 'spine' });
ell('torso', v3(0, 1.4, -0.01), v3(0.17, 0.07, 0.086), 'chest');
ell('torso', v3(0, 1.13, 0.0), v3(0.13, 0.13, 0.086), 'spine', { lower: 'pelvis', upper: 'chest' });
ell('torso', v3(0, 0.975, 0.0), v3(0.152, 0.104, 0.1), 'pelvis');
// shoulders: the icon's slope from the neck into a rounded cap (left, mirrored)
cone('torso', v3(0.035, 1.472, -0.012), v3(0.18, 1.428, -0.004), 0.062, 0.058, 'clavL', { mirror: true, parentBone: 'chest', parentBlend: 0.6 });
// the trapezius: the slope from the neck's base down into the shoulder (no flat shoulder line)
cone('torso', v3(0.03, 1.53, -0.026), v3(0.15, 1.45, -0.01), 0.035, 0.045, 'chest', { mirror: true, parentBone: 'neck', parentBlend: 0.35, child: 'clavL' });
ell('arm', v3(0.196, 1.402, 0.0), v3(0.063, 0.066, 0.06), 'upperArmL', { mirror: true, alt: 'clavL', altW: 0.35 });
// arms (left, mirrored): even, strong, wrists not pinched
cone('arm', v3(0.196, 1.402, 0), v3(0.238, 1.145, -0.005), 0.056, 0.045, 'upperArmL', { mirror: true, child: 'foreArmL' });
cone('arm', v3(0.238, 1.145, -0.005), v3(0.266, 0.89, 0.008), 0.044, 0.036, 'foreArmL', { mirror: true, parent: 'upperArmL', child: 'handL' });
// hands: a little larger than life, simple: palm, index, a finger block, thumb
ell('hand', v3(0.27, 0.838, 0.012), v3(0.024, 0.058, 0.047), 'handL', { mirror: true, alt: 'foreArmL', altW: 0.15 });
cone('hand', v3(0.272, 0.796, 0.034), v3(0.2735, 0.76, 0.037), 0.0152, 0.0142, 'indexL', { mirror: true, parent: 'handL' });
cone('hand', v3(0.2735, 0.76, 0.037), v3(0.275, 0.714, 0.04), 0.0142, 0.0128, 'indexTipL', { mirror: true, parent: 'indexL' });
cone('hand', v3(0.272, 0.794, 0.008), v3(0.2732, 0.752, 0.008), 0.0162, 0.0152, 'fingersL', { mirror: true, parent: 'handL' });
cone('hand', v3(0.2732, 0.752, 0.008), v3(0.275, 0.708, 0.009), 0.0152, 0.0138, 'tipsL', { mirror: true, parent: 'fingersL' });
cone('hand', v3(0.271, 0.796, -0.018), v3(0.272, 0.756, -0.0195), 0.015, 0.0138, 'fingersL', { mirror: true, parent: 'handL' });
cone('hand', v3(0.272, 0.756, -0.0195), v3(0.273, 0.722, -0.021), 0.0138, 0.0126, 'tipsL', { mirror: true, parent: 'fingersL' });
cone('hand', v3(0.262, 0.866, 0.026), v3(0.268, 0.796, 0.062), 0.016, 0.0135, 'thumbL', { mirror: true, parent: 'handL' });
// legs (left, mirrored): strong, simple, ankles not pinched
cone('leg', v3(0.092, 0.965, 0.0), v3(0.102, 0.51, 0.012), 0.096, 0.066, 'thighL', { mirror: true, parentBone: 'pelvis', parentBlend: 0.5, child: 'shinL' });
cone('leg', v3(0.102, 0.51, 0.012), v3(0.108, 0.098, -0.008), 0.063, 0.046, 'shinL', { mirror: true, parent: 'thighL', child: 'footL' });
ell('foot', v3(0.11, 0.04, 0.046), v3(0.05, 0.043, 0.122), 'footL', { mirror: true, floor: true });
ell('foot', v3(0.108, 0.05, -0.028), v3(0.046, 0.05, 0.048), 'footL', { mirror: true, floor: true });

/**
 * The top edge of the shirt collar round the neck: highest at the nape, lower at the sides, dropping
 * to the throat. The jacket stops just under it, and the bare neck is visible only above it.
 */
export function collarLine(x, z) {
  const nz = z + 0.02, c = nz / (Math.hypot(x, nz) || 1e-6); // +1 at the throat, -1 at the nape
  return 1.553 + 0.011 * THREE.MathUtils.smoothstep(-c, 0, 1) - 0.042 * THREE.MathUtils.smoothstep(c, 0.3, 1);
}

for (const p of P) {
  // bounding box (left/centre version), padded
  const b = new THREE.Box3();
  if (p.kind === 'e') b.setFromCenterAndSize(p.c, p.r.clone().multiplyScalar(2));
  else b.setFromPoints([p.a, p.b]).expandByScalar(Math.max(p.r1, p.r2));
  p.box = b.expandByScalar(0.07);
}

function primDist(p, x, y, z) {
  let d = p.kind === 'e' ? sdEllipsoid(x, y, z, p.c, p.r) : sdRoundCone(x, y, z, p.a, p.b, p.r1, p.r2);
  if (p.floor) d = Math.max(d, -y);
  if (p.cut) d = Math.max(d, p.cut[0] * x + p.cut[1] * y + p.cut[2] * z - p.cut[3]);
  return d;
}
// boxes as flat arrays [minx, miny, minz, maxx, maxy, maxz]: this runs about two million times
const flat = (b) => [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z];
function boxDist(b, x, y, z) {
  const dx = Math.max(b[0] - x, 0, x - b[3]), dy = Math.max(b[1] - y, 0, y - b[4]), dz = Math.max(b[2] - z, 0, z - b[5]);
  return Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.07;
}
const inBox = (b, x, y, z) => x >= b[0] && x <= b[3] && y >= b[1] && y <= b[4] && z >= b[2] && z <= b[5];
for (const p of P) p.fb = flat(p.box);
const GROUPS = ['head', 'neck', 'torso', 'arm', 'hand', 'leg', 'foot'];
const byGroup = Object.fromEntries(GROUPS.map((g) => [g, P.filter((p) => p.group === g)]));
const groupBox = Object.fromEntries(GROUPS.map((g) => [g, flat(byGroup[g].reduce((b, p) => b.union(p.box), new THREE.Box3()))]));

function groupDist(g, x, y, z, k) {
  const gb = groupBox[g];
  if (!inBox(gb, x, y, z)) return boxDist(gb, x, y, z);
  let d = 1e9;
  const list = byGroup[g];
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    d = smin(d, inBox(p.fb, x, y, z) ? primDist(p, x, y, z) : boxDist(p.fb, x, y, z), k);
  }
  return d;
}

/** The whole body's distance at a point (human units). */
export function bodySDF(x, y, z) {
  const ax = Math.abs(x); // limbs are mirrored
  const head = smin(groupDist('head', x, y, z, 0.022), groupDist('neck', x, y, z, 0.01), 0.04);
  const torso = groupDist('torso', ax, y, z, 0.045);
  let d = smin(torso, head, 0.035);
  // legs blend into the pelvis
  const leg = smin(groupDist('leg', ax, y, z, 0.035), groupDist('foot', ax, y, z, 0.02), 0.03);
  d = smin(d, leg, 0.05);
  // arms blend into the shoulder only: below the armpit the arm meets the body with a crease
  const hand = groupDist('hand', ax, y, z, 0.008);
  const arm = smin(groupDist('arm', ax, y, z, 0.02), hand, 0.014);
  const k = 0.036 * THREE.MathUtils.smoothstep(y, 1.33, 1.43) + 0.002;
  return smin(d, arm, k);
}

// ---------------------------------------------------------------- surface nets
function surfaceNets(f, min, max, h) {
  const nx = Math.ceil((max.x - min.x) / h) + 1, ny = Math.ceil((max.y - min.y) / h) + 1, nz = Math.ceil((max.z - min.z) / h) + 1;
  const field = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  // a coarse pass first: far from the surface only the sign matters, so the fine grid is evaluated
  // only in a shell around it
  const C = 4, H = h * C;
  const cx = Math.ceil((nx - 1) / C) + 1, cy = Math.ceil((ny - 1) / C) + 1, cz = Math.ceil((nz - 1) / C) + 1;
  const coarse = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) coarse[i + cx * (j + cy * k)] = f(min.x + i * H, min.y + j * H, min.z + k * H);
  const shell = H * 1.9;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const dc = coarse[Math.round(i / C) + cx * (Math.round(j / C) + cy * Math.round(k / C))];
    field[id(i, j, k)] = Math.abs(dc) > shell ? dc : f(min.x + i * h, min.y + j * h, min.z + k * h);
  }
  const cell = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cid = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      v[c] = field[id(i + corners[c][0], j + corners[c][1], k + corners[c][2])];
      if (v[c] < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      sx += corners[a][0] + t * (corners[b][0] - corners[a][0]);
      sy += corners[a][1] + t * (corners[b][1] - corners[a][1]);
      sz += corners[a][2] + t * (corners[b][2] - corners[a][2]);
      n++;
    }
    cell[cid(i, j, k)] = pos.length / 3;
    pos.push(min.x + (i + sx / n) * h, min.y + (j + sy / n) * h, min.z + (k + sz / n) * h);
  }
  // one quad per sign-changing grid edge, between the four cells around it
  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, b, c, d);
    else idx.push(a, b, c, b, d, c);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const s0 = field[id(i, j, k)] < 0;
    if (s0 !== field[id(i + 1, j, k)] < 0) quad(cell[cid(i, j - 1, k - 1)], cell[cid(i, j, k - 1)], cell[cid(i, j - 1, k)], cell[cid(i, j, k)], !s0);
    if (s0 !== field[id(i, j + 1, k)] < 0) quad(cell[cid(i - 1, j, k - 1)], cell[cid(i - 1, j, k)], cell[cid(i, j, k - 1)], cell[cid(i, j, k)], !s0);
    if (s0 !== field[id(i, j, k + 1)] < 0) quad(cell[cid(i - 1, j - 1, k)], cell[cid(i, j - 1, k)], cell[cid(i - 1, j, k)], cell[cid(i, j, k)], !s0);
  }
  return { pos, idx };
}

// ---------------------------------------------------------------- skin weights
const boneOf = (name, sx) => BONE[sx < 0 ? name.replace(/L$/, 'R') : name];

/** Bone weights for a point from the primitives nearest to it (top four, normalised). */
function skinAt(x, y, z, kw = 0.011) {
  const sx = x < 0 ? -1 : 1, ax = Math.abs(x);
  const ds = P.map((p) => {
    const px = p.mirror || p.group === 'torso' ? ax : x;
    return primDist(p, px, y, z);
  });
  const dmin = Math.min(...ds);
  const acc = new Map();
  const add = (b, w) => b !== undefined && acc.set(b, (acc.get(b) ?? 0) + w);
  P.forEach((p, i) => {
    const w = Math.exp(-Math.max(0, ds[i] - dmin) / kw);
    if (w < 1e-3) return;
    const px = p.mirror || p.group === 'torso' ? ax : x;
    const main = boneOf(p.bone, sx);
    if (p.kind === 'c' && (p.child || p.parent || p.childBone || p.parentBone)) {
      const t = segT(px, y, z, p.a, p.b);
      const toChild = p.child ? 0.5 * THREE.MathUtils.smoothstep(t, 0.72, 1) : p.childBone ? p.childBlend * THREE.MathUtils.smoothstep(t, 0.55, 1) : 0;
      const toParent = p.parent ? 0.5 * (1 - THREE.MathUtils.smoothstep(t, 0, 0.28)) : p.parentBone ? p.parentBlend * (1 - THREE.MathUtils.smoothstep(t, 0, 0.45)) : 0;
      add(main, w * (1 - toChild - toParent));
      if (toChild) add(p.child ? boneOf(p.child, sx) : BONE[p.childBone], w * toChild);
      if (toParent) add(p.parent ? boneOf(p.parent, sx) : BONE[p.parentBone], w * toParent);
    } else if (p.lower || p.upper) {
      // a torso segment hands over to its neighbours toward its ends
      const u = (y - p.c.y) / p.r.y;
      const lo = p.lower ? 0.45 * THREE.MathUtils.smoothstep(-u, 0.2, 1) : 0, hi = p.upper ? 0.45 * THREE.MathUtils.smoothstep(u, 0.2, 1) : 0;
      add(main, w * (1 - lo - hi));
      if (lo) add(BONE[p.lower], w * lo);
      if (hi) add(BONE[p.upper], w * hi);
    } else if (p.alt) {
      add(main, w * (1 - p.altW));
      add(boneOf(p.alt, sx), w * p.altW);
    } else add(main, w);
  });
  const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = top.reduce((s, [, w]) => s + w, 0);
  while (top.length < 4) top.push([0, 0]);
  return top.map(([b, w]) => [b, w / sum]);
}

function writeSkin(geo) {
  const p = geo.attributes.position;
  const si = new Uint16Array(p.count * 4), sw = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) {
    skinAt(p.getX(i), p.getY(i), p.getZ(i)).forEach(([b, w], k) => {
      si[i * 4 + k] = b;
      sw[i * 4 + k] = w;
    });
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
}

/** The body surface in human units, with normals and skin weights. */
export function buildBodyGeometry(h = 0.0085) {
  const t0 = performance.now();
  const { pos, idx } = surfaceNets(bodySDF, v3(-0.4, -0.012, -0.16), v3(0.4, 1.83, 0.2), h);
  // project each vertex onto the surface (one Newton step) and take the field's gradient as normal
  const nrm = new Float32Array(pos.length);
  const e = 0.0015;
  for (let i = 0; i < pos.length; i += 3) {
    let [x, y, z] = [pos[i], pos[i + 1], pos[i + 2]];
    for (let it = 0; it < 2; it++) {
      const d = bodySDF(x, y, z);
      const gx = bodySDF(x + e, y, z) - bodySDF(x - e, y, z), gy = bodySDF(x, y + e, z) - bodySDF(x, y - e, z), gz = bodySDF(x, y, z + e) - bodySDF(x, y, z - e);
      const g = Math.hypot(gx, gy, gz) / (2 * e) || 1;
      const nx = gx / (2 * e) / g, ny = gy / (2 * e) / g, nz = gz / (2 * e) / g;
      x -= (d * nx) / g;
      y -= (d * ny) / g;
      z -= (d * nz) / g;
      if (it === 1) (nrm[i] = nx), (nrm[i + 1] = ny), (nrm[i + 2] = nz);
    }
    pos[i] = x;
    pos[i + 1] = y;
    pos[i + 2] = z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  writeSkin(geo);
  // which vertices the clothes cover (everything but the head, the top of the neck and the hands)
  const cov = new Float32Array(geo.attributes.position.count);
  const SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight, PP = geo.attributes.position;
  const handBones = new Set(['handL', 'handR', 'fingersL', 'fingersR', 'thumbL', 'thumbR', 'indexL', 'indexR', 'tipsL', 'tipsR', 'indexTipL', 'indexTipR'].map((n) => BONE[n]));
  for (let i = 0; i < cov.length; i++) {
    let hand = 0;
    for (let k = 0; k < 4; k++) if (handBones.has(SI.getComponent(i, k))) hand += SW.getComponent(i, k);
    const y = PP.getY(i), x = PP.getX(i), z = PP.getZ(i);
    // the neck stays fully solid until it is inside the collar (the mask never cuts it above the
    // collar, which left a dark band); what lies out on the shoulders is under the jacket
    const yc = collarLine(x, z), onNeck = 1 - THREE.MathUtils.smoothstep(Math.hypot(x, z + 0.02), 0.09, 0.106);
    const head = Math.max(THREE.MathUtils.smoothstep(y, yc - 0.03, yc - 0.012) * onNeck, THREE.MathUtils.smoothstep(y, 1.575, 1.6));
    cov[i] = Math.max(0, 1 - Math.max(head, THREE.MathUtils.smoothstep(hand, 0.35, 0.7)));
  }
  geo.setAttribute('covered', new THREE.BufferAttribute(cov, 1));
  geo.computeBoundingSphere();
  geo.userData.buildMs = performance.now() - t0;
  return geo;
}

// ---------------------------------------------------------------- internal structure
// Polylines inside the body (human units, left side mirrored): bones, tendons, and a few arcs for
// the ribs, pelvis and skull. Seen only where the body is exposed.
function structureLines() {
  const L = [];
  const both = (pts) => {
    L.push(pts.map((p) => v3(...p)));
    L.push(pts.map(([x, y, z]) => v3(-x, y, z)));
  };
  const one = (pts) => L.push(pts.map((p) => v3(...p)));
  const arc = (cx, cy, cz, rx, ry, rz, a0, a1, n, plane = 'xz') => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      if (plane === 'xz') pts.push([cx + rx * Math.sin(a), cy + ry * Math.cos(a), cz + rz * Math.cos(a)]);
      else if (plane === 'yz') pts.push([cx, cy + ry * Math.sin(a), cz + rz * Math.cos(a)]);
      else pts.push([cx + rx * Math.sin(a), cy + ry * Math.cos(a), cz]);
    }
    return pts;
  };
  // spine and skull
  one([[0, 0.96, -0.055], [0, 1.08, -0.07], [0, 1.24, -0.066], [0, 1.4, -0.05], [0, 1.52, -0.026], [0, 1.575, -0.02]]);
  for (const k of [-0.55, 0, 0.55]) {
    const pts = [];
    for (let i = 0; i <= 22; i++) {
      const a = -Math.PI * 0.62 + (i / 22) * Math.PI * 1.45;
      pts.push([0.07 * Math.sin(k) * Math.cos(a), 1.674 + 0.088 * Math.sin(a), -0.012 + 0.08 * Math.cos(k) * Math.cos(a)]);
    }
    one(pts);
  }
  one(arc(0, 1.686, 0.0, 0.07, 0, 0.08, -Math.PI * 0.62, Math.PI * 0.62, 16).map(([x, , z]) => [x, 1.686, z]));
  one(arc(0, 1.629, 0.02, 0.05, 0, 0.055, -Math.PI * 0.55, Math.PI * 0.55, 14).map(([x, , z]) => [x, 1.614, z]));
  // ribs: arcs from the spine round to the sternum
  for (const [y, s] of [[1.36, 0.84], [1.29, 0.88], [1.22, 0.84]]) {
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const a = Math.PI * (0.06 + 0.86 * (i / 14));
      pts.push([0.148 * s * Math.sin(a), y - 0.05 * Math.sin(a * 0.5), -0.098 * s * Math.cos(a) + 0.004]);
    }
    both(pts);
  }
  one([[0, 1.385, 0.084], [0, 1.3, 0.093], [0, 1.215, 0.086]]);
  // pelvis
  both([[0.0, 0.92, 0.074], [0.06, 0.95, 0.066], [0.118, 0.995, 0.02], [0.12, 1.0, -0.035], [0.05, 0.99, -0.07], [0.0, 0.98, -0.075]]);
  // neck tendons and clavicles
  both([[0.052, 1.619, -0.035], [0.035, 1.54, 0.015], [0.014, 1.455, 0.05]]);
  both([[0.018, 1.438, 0.058], [0.1, 1.45, 0.035], [0.172, 1.432, 0.0]]);
  // arm: humerus, biceps, radius and ulna, tendons to the fingers, thumb
  both([[0.19, 1.405, 0.0], [0.214, 1.27, -0.003], [0.237, 1.148, -0.005]]);
  both([[0.205, 1.36, 0.028], [0.222, 1.25, 0.032], [0.236, 1.165, 0.024]]);
  both([[0.245, 1.14, 0.012], [0.256, 1.01, 0.018], [0.27, 0.888, 0.018]]);
  both([[0.232, 1.14, -0.016], [0.247, 1.01, -0.01], [0.262, 0.888, -0.004]]);
  for (const z of [0.03, 0.008, -0.014]) both([[0.247, 1.05, z * 0.5], [0.262, 0.93, z * 0.7], [0.27, 0.86, z * 0.95], [0.272, 0.8, z], [0.274, 0.74, z * 1.08]]);
  both([[0.264, 0.892, 0.012], [0.263, 0.862, 0.026], [0.266, 0.83, 0.042], [0.268, 0.808, 0.052]]);
  // leg: femur with its neck, quadriceps over the knee, tibia and fibula, achilles, the foot's fan
  both([[0.055, 0.955, 0.0], [0.098, 0.93, 0.0], [0.1, 0.72, 0.008], [0.102, 0.515, 0.012]]);
  both([[0.098, 0.66, 0.05], [0.103, 0.52, 0.058], [0.105, 0.43, 0.042]]);
  both([[0.104, 0.5, 0.026], [0.106, 0.3, 0.018], [0.109, 0.1, 0.004]]);
  both([[0.12, 0.49, -0.012], [0.122, 0.3, -0.02], [0.123, 0.11, -0.016]]);
  both([[0.106, 0.3, -0.05], [0.107, 0.16, -0.045], [0.108, 0.05, -0.058]]);
  for (const x of [0.092, 0.11, 0.128]) both([[0.109, 0.075, -0.004], [x, 0.04, 0.08], [x, 0.022, 0.148]]);
  return L;
}

const JOINTS = [
  [0, 1.45, -0.03], [0, 1.574, -0.012], [0.19, 1.41, 0], [0.238, 1.145, -0.005], [0.266, 0.886, 0.008],
  [0.096, 0.935, 0], [0.103, 0.51, 0.014], [0.108, 0.09, -0.006], [0, 1.0, -0.06],
];

/** Bones, tendons and joints as thin skinned tubes (human units). */
export function buildStructureGeometry(radius = 0.0019) {
  const parts = [];
  for (const pts of structureLines()) {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const len = curve.getLength();
    parts.push(new THREE.TubeGeometry(curve, Math.max(4, Math.ceil(len / 0.012)), radius, 4, false));
  }
  for (const [x, y, z] of JOINTS) {
    for (const sx of x ? [1, -1] : [1]) {
      const g = new THREE.SphereGeometry(radius * 2.4, 6, 4);
      g.translate(x * sx, y, z);
      parts.push(g);
    }
  }
  const geo = mergeGeometries(parts.map((g) => (g.deleteAttribute('uv'), g)), false);
  writeSkin(geo);
  geo.computeBoundingSphere();
  return geo;
}

export { groupDist, smin };

/** A skinned surface from any distance field (the outer shell); `weightFn` may override weights. */
export function meshFromSDF(f, min, max, h, weightFn = null, attrFn = null) {
  const { pos, idx } = surfaceNets(f, min, max, h);
  const nrm = new Float32Array(pos.length);
  const e = 0.0015;
  for (let i = 0; i < pos.length; i += 3) {
    let [x, y, z] = [pos[i], pos[i + 1], pos[i + 2]];
    const d = f(x, y, z);
    const gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
    const g = Math.hypot(gx, gy, gz) || 1;
    const nx = gx / g, ny = gy / g, nz = gz / g;
    const gl = g / (2 * e);
    pos[i] = x - (d * nx) / gl;
    pos[i + 1] = y - (d * ny) / gl;
    pos[i + 2] = z - (d * nz) / gl;
    nrm[i] = nx;
    nrm[i + 1] = ny;
    nrm[i + 2] = nz;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  const n = pos.length / 3;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const w = weightFn?.(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]) ?? skinAt(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    w.forEach(([b, v], k) => ((si[i * 4 + k] = b), (sw[i * 4 + k] = v)));
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  if (attrFn) {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = attrFn(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    geo.setAttribute('garment', new THREE.BufferAttribute(a, 1));
  }
  geo.computeBoundingSphere();
  return geo;
}
