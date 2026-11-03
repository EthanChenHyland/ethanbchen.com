// Destination glyphs, defined once as straight strokes on a 24 × 24 grid (y down), so the
// same mark renders as inline SVG in the interface and as a distance field on the floor.

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
};

/** SVG path data for a stroke glyph. */
export function glyphPath(id) {
  return GLYPH_STROKES[id].map(([x1, y1, x2, y2]) => `M${x1} ${y1}L${x2} ${y2}`).join('');
}

/**
 * GLSL for `float <name>(vec2 q, float s)`: unsigned distance to the glyph in floor units,
 * where s matches the size the triangle glyphs are drawn at (half their width), and +q.y is
 * the glyph's top. Needs sdSeg.
 */
export function glyphGLSL(id, name) {
  const segs = GLYPH_STROKES[id].map(([x1, y1, x2, y2]) => `  d = min(d, sdSeg(g, vec2(${x1.toFixed(1)}, ${y1.toFixed(1)}), vec2(${x2.toFixed(1)}, ${y2.toFixed(1)})));`).join('\n');
  return /* glsl */ `
float ${name}(vec2 q, float s) {
  vec2 g = vec2(12.0 + q.x * 9.4 / s, 12.0 - q.y * 9.4 / s);
  float d = 1e9;
${segs}
  return d * s / 9.4;
}`;
}
