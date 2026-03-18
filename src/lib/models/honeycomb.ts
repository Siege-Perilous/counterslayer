/**
 * Shared honeycomb/grid pattern utilities for lid and box infill.
 * Based on Red Blob Games hex grid math: https://www.redblobgames.com/grids/hexagons/
 */

import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';

const { cuboid, cylinder } = jscad.primitives;
const { intersect, subtract, union } = jscad.booleans;
const { translate, rotateZ } = jscad.transforms;

export interface HoneycombParams {
  hexSize: number; // Circumradius of hexagons in mm
  wallThickness: number; // Wall thickness between hexagons
  borderOffset: number; // Solid border width from edges
}

// Circular exclusion zone (e.g., around poke holes)
export interface HoneycombExclusion {
  x: number;
  y: number;
  radius: number;
}

export const defaultHoneycombParams: HoneycombParams = {
  hexSize: 5,
  wallThickness: 1.2,
  borderOffset: 3
};

/**
 * Creates a honeycomb pattern of hexagonal cutouts.
 * Uses pointy-top hexagons in a proper interlocking grid.
 *
 * @param width - Total width of the area (X)
 * @param depth - Total depth of the area (Y)
 * @param cutDepth - How deep to cut (full plate thickness)
 * @param params - Honeycomb parameters
 * @param exclusions - Optional circular exclusion zones (e.g., poke holes)
 * @returns Array of hexagonal cutouts clipped to the active area
 */
export function createHoneycombCutouts(
  width: number,
  depth: number,
  cutDepth: number,
  params: HoneycombParams = defaultHoneycombParams,
  exclusions: HoneycombExclusion[] = []
): Geom3[] {
  const { hexSize, wallThickness, borderOffset } = params;
  const cutouts: Geom3[] = [];

  // The cut radius is reduced to leave walls between hexes
  const cutRadius = hexSize - wallThickness / 2;
  if (cutRadius <= 0) return cutouts;

  // Pointy-top hex grid spacing (from Red Blob Games)
  const horizSpacing = Math.sqrt(3) * hexSize;
  const vertSpacing = 1.5 * hexSize;
  const rowOffset = (Math.sqrt(3) / 2) * hexSize; // Odd row X offset

  // Active area for honeycomb (inside the border)
  const activeMinX = borderOffset;
  const activeMaxX = width - borderOffset;
  const activeMinY = borderOffset;
  const activeMaxY = depth - borderOffset;

  if (activeMinX >= activeMaxX || activeMinY >= activeMaxY) return cutouts;

  // Clipping box to enforce the border
  const activeWidth = activeMaxX - activeMinX;
  const activeHeight = activeMaxY - activeMinY;
  const cutHeight = cutDepth + 1;

  let clipRegion: Geom3 = cuboid({
    size: [activeWidth, activeHeight, cutHeight + 2],
    center: [activeMinX + activeWidth / 2, activeMinY + activeHeight / 2, cutHeight / 2 - 0.5]
  });

  // Subtract exclusion zones from the clipping region (with border offset)
  for (const exc of exclusions) {
    const exclusionRadius = exc.radius + borderOffset;
    const exclusionCylinder = translate(
      [exc.x, exc.y, cutHeight / 2 - 0.5],
      cylinder({
        radius: exclusionRadius,
        height: cutHeight + 4,
        segments: 32
      })
    );
    clipRegion = subtract(clipRegion, exclusionCylinder);
  }

  // Extend grid beyond active area so partial hexes appear at edges
  const gridMinX = activeMinX - cutRadius;
  const gridMaxX = activeMaxX + cutRadius;
  const gridMinY = activeMinY - cutRadius;
  const gridMaxY = activeMaxY + cutRadius;

  const gridWidth = gridMaxX - gridMinX;
  const gridHeight = gridMaxY - gridMinY;

  const cols = Math.floor(gridWidth / horizSpacing) + 2;
  const rows = Math.floor(gridHeight / vertSpacing) + 2;

  // Center the grid within the extended area
  const actualWidth = (cols - 1) * horizSpacing;
  const actualHeight = (rows - 1) * vertSpacing;
  const startX = gridMinX + (gridWidth - actualWidth) / 2;
  const startY = gridMinY + (gridHeight - actualHeight) / 2;

  for (let row = 0; row < rows; row++) {
    const isOddRow = row % 2 === 1;
    const xOffset = isOddRow ? rowOffset : 0;
    const y = startY + row * vertSpacing;

    for (let col = 0; col < cols; col++) {
      const x = startX + col * horizSpacing + xOffset;

      // Include hex if ANY part of it intersects the active area
      const hexMinX = x - cutRadius;
      const hexMaxX = x + cutRadius;
      const hexMinY = y - cutRadius;
      const hexMaxY = y + cutRadius;

      const intersectsActive =
        hexMaxX > activeMinX && hexMinX < activeMaxX && hexMaxY > activeMinY && hexMinY < activeMaxY;

      if (!intersectsActive) continue;

      // Check if hex is fully inside the active area (no clipping needed)
      const fullyInside =
        hexMinX >= activeMinX && hexMaxX <= activeMaxX && hexMinY >= activeMinY && hexMaxY <= activeMaxY;

      // For exclusions, check if hex is near any exclusion zone
      const nearExclusion = exclusions.some((exc) => {
        const dx = x - exc.x;
        const dy = y - exc.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist < exc.radius + borderOffset + cutRadius;
      });

      // Create pointy-top hex by rotating 30° (π/6 radians)
      let hex: Geom3 = rotateZ(
        Math.PI / 6,
        cylinder({
          radius: cutRadius,
          height: cutHeight,
          segments: 6,
          center: [0, 0, cutHeight / 2]
        })
      );
      hex = translate([x, y, -0.5], hex);

      // Only clip hexes at edges or near exclusions - interior hexes don't need expensive CSG
      if (!fullyInside || nearExclusion) {
        hex = intersect(hex, clipRegion);
      }

      cutouts.push(hex);
    }
  }

  return cutouts;
}

/**
 * Creates a honeycomb pattern as a single unioned geometry.
 * More efficient than createHoneycombCutouts when subtracting from a complex shape.
 *
 * @param width - Total width of the area (X)
 * @param depth - Total depth of the area (Y)
 * @param cutDepth - How deep to cut (full plate thickness)
 * @param params - Honeycomb parameters
 * @param exclusions - Optional circular exclusion zones (e.g., poke holes)
 * @returns Single unioned geometry of all hexagonal cutouts, or null if no cutouts
 */
export function createHoneycombUnion(
  width: number,
  depth: number,
  cutDepth: number,
  params: HoneycombParams = defaultHoneycombParams,
  exclusions: HoneycombExclusion[] = []
): Geom3 | null {
  const cutouts = createHoneycombCutouts(width, depth, cutDepth, params, exclusions);
  if (cutouts.length === 0) return null;
  if (cutouts.length === 1) return cutouts[0];
  return union(cutouts);
}
