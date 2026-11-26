import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';

const { circle } = jscad.primitives;
const { union } = jscad.booleans;
const { translate } = jscad.transforms;
const { extrudeLinear } = jscad.extrusions;
const { hull } = jscad.hulls;

/**
 * Turn vectorText() stroke paths into one solid for engraving: every stroke segment becomes a
 * round-ended capsule, the capsules are merged into a single 2D outline, and that outline is
 * extruded once (z = 0 to height).
 *
 * Returns an array holding the one solid (empty when there is nothing to draw) so it drops into
 * code that unions a list of text shapes.
 *
 * Why not expand() each path and union the extrusions: offsetting a whole curved path
 * self-intersects on tight glyphs (comma, 8, &), and unioning many overlapping extrusions leaves
 * gaps and slivers. Both show up in slicers as non-manifold edges. Capsules are convex, so the
 * 2D union is reliable and the single extrusion has clean walls.
 */
export function createStrokedText(segments: number[][][], strokeWidth: number, height: number): Geom3[] {
  const dot = circle({ radius: strokeWidth / 2, segments: 24 });
  const capsules = [];
  for (const segment of segments) {
    for (let i = 0; i < segment.length - 1; i++) {
      const [ax, ay] = segment[i];
      const [bx, by] = segment[i + 1];
      if (Math.hypot(ax - bx, ay - by) < 1e-6) continue;
      capsules.push(hull(translate([ax, ay, 0], dot), translate([bx, by, 0], dot)));
    }
  }
  if (capsules.length === 0) return [];
  return [extrudeLinear({ height }, union(...capsules))];
}
