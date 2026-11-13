// Destination glyphs, defined once on a 24 × 24 grid (y down), so the same mark renders as inline
// SVG in the interface and as a distance field on the floor. A stroke is a straight segment
// [x1, y1, x2, y2], a circular arc { arc: [cx, cy, r, a0, a1] } (degrees, clockwise on screen from
// a0 to a1), or a small point { dot: [x, y, r] }.

export const GLYPH_STROKES = {
  // Resume: the page with two written lines, and the stylus coming in to finish the second
  resume: [
    [5, 3, 16, 3],
    [16, 3, 16, 21],
    [16, 21, 5, 21],
    [5, 21, 5, 3],
    [8, 8.5, 13, 8.5],
    [8, 12.5, 11.6, 12.5],
    [20.6, 4.4, 12.2, 12.8],
  ],
  // Profile: a faceless head whose outline is open where a single point is in orbit, the shoulders
  // parting either side of a vertical identity axis (the digital person, its AI field, its spine)
  profile: [
    { arc: [12, 7.3, 3.5, -40, 250] },
    { dot: [17.4, 4.0, 0.45] },
    [10.1, 12.9, 5.4, 16.4],
    [5.4, 16.4, 5.4, 21],
    [13.9, 12.9, 18.6, 16.4],
    [18.6, 16.4, 18.6, 21],
    [12, 13.6, 12, 21],
  ],
  // Projects: the Threshold Console's screen, wide and open on one side, with a built object
  // halfway through it (a thing crossing from the machine into the world)
  projects: [
    [15.6, 8, 15.6, 5.2],
    [15.6, 5.2, 2.8, 5.2],
    [2.8, 5.2, 2.8, 18.4],
    [2.8, 18.4, 15.6, 18.4],
    [15.6, 18.4, 15.6, 16],
    [12.2, 9.8, 16.6, 7.6],
    [16.6, 7.6, 21, 9.8],
    [21, 9.8, 21, 14.2],
    [21, 14.2, 16.6, 16.4],
    [16.6, 16.4, 12.2, 14.2],
    [12.2, 14.2, 12.2, 9.8],
    [12.2, 9.8, 16.6, 12],
    [16.6, 12, 21, 9.8],
    [16.6, 12, 16.6, 16.4],
  ],
};

const f = (v) => +v.toFixed(3);
const onArc = (cx, cy, r, a) => [f(cx + r * Math.cos((a * Math.PI) / 180)), f(cy + r * Math.sin((a * Math.PI) / 180))];
/** SVG path data for an arc from a0 to a1 (degrees, clockwise on screen). */
function arcPath(cx, cy, r, a0, a1) {
  const [x0, y0] = onArc(cx, cy, r, a0), [x1, y1] = onArc(cx, cy, r, a1);
  return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

/** SVG path data for a stroke glyph. */
export function glyphPath(id) {
  return GLYPH_STROKES[id]
    .map((s) => {
      if (s.arc) return arcPath(...s.arc);
      if (s.dot) {
        const [x, y, r] = s.dot;
        return `M${f(x - r)} ${y}A${r} ${r} 0 1 1 ${f(x + r)} ${y}A${r} ${r} 0 1 1 ${f(x - r)} ${y}`;
      }
      const [x1, y1, x2, y2] = s;
      return `M${x1} ${y1}L${x2} ${y2}`;
    })
    .join('');
}

/**
 * GLSL for `float <name>(vec2 q, float s)`: unsigned distance to the glyph in floor units,
 * where s matches the size the triangle glyphs are drawn at (half their width), and +q.y is
 * the glyph's top. Needs sdSeg.
 */
export function glyphGLSL(id, name) {
  const v = (x, y) => `vec2(${x.toFixed(3)}, ${y.toFixed(3)})`;
  const segs = GLYPH_STROKES[id]
    .map((s) => {
      if (s.arc) {
        const [cx, cy, r, a0, a1] = s.arc, rad = Math.PI / 180;
        return `  d = min(d, ${name}Arc(g, ${v(cx, cy)}, ${r.toFixed(3)}, ${(a0 * rad).toFixed(4)}, ${((a1 - a0) * rad).toFixed(4)}));`;
      }
      if (s.dot) return `  d = min(d, max(length(g - ${v(s.dot[0], s.dot[1])}) - ${s.dot[2].toFixed(3)}, 0.0));`;
      const [x1, y1, x2, y2] = s;
      return `  d = min(d, sdSeg(g, ${v(x1, y1)}, ${v(x2, y2)}));`;
    })
    .join('\n');
  const arcs = GLYPH_STROKES[id].some((s) => s.arc);
  return /* glsl */ `${arcs ? `
// distance to a circular arc from angle a0 sweeping \`span\` (radians, y down like the grid)
float ${name}Arc(vec2 g, vec2 c, float r, float a0, float span) {
  vec2 d = g - c;
  float t = mod(atan(d.y, d.x) - a0, 6.2831853);
  if (t <= span) return abs(length(d) - r);
  vec2 p0 = c + r * vec2(cos(a0), sin(a0)), p1 = c + r * vec2(cos(a0 + span), sin(a0 + span));
  return min(length(g - p0), length(g - p1));
}` : ''}
float ${name}(vec2 q, float s) {
  vec2 g = vec2(12.0 + q.x * 9.4 / s, 12.0 - q.y * 9.4 / s);
  float d = 1e9;
${segs}
  return d * s / 9.4;
}`;
}
