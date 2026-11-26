import type { CupId, CupLayout, CupLayoutNode } from '#lib/types/cupLayout.js';
import { generateCupId, isCupLeaf, isCupSplit } from '#lib/types/cupLayout.js';
import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';
import { createHoneycombUnion, defaultHoneycombParams } from './honeycomb';
import { addLidFittings, createLidForDimensions, createLidRecess, defaultLidParams } from './lid';

const { cuboid, roundedCuboid, roundedRectangle } = jscad.primitives;
const { intersect, subtract, union } = jscad.booleans;
const { translate, mirrorY, scale } = jscad.transforms;
const { vectorText } = jscad.text;
const { path2 } = jscad.geometries;
const { expand } = jscad.expansions;
const { extrudeLinear } = jscad.extrusions;

// Cup tray parameters
export interface CupTrayParams {
  layout: CupLayout; // Split-based layout tree (replaces rows/columns)
  trayWidth: number; // Total tray X dimension in mm
  trayDepth: number; // Total tray Y dimension in mm
  cupCavityHeight: number | null; // Cup cavity Z dimension in mm, null = auto (calculated from box height)
  wallThickness: number; // Wall thickness in mm (default: 2.0)
  floorThickness: number; // Floor thickness in mm (default: 2.0)
  cornerRadius: number; // Corner radius in mm (default: 6)
  scoops?: boolean; // Rounded floor-to-wall transition (default: true). Off = flat floor, 90° walls
  lidEnabled?: boolean; // Tray has its own sliding lid, same design as a box lid (default: false)
  honeycombBottom?: boolean; // Honeycomb floor (default: false). Forces scoops off, no bottom emboss
  honeycombLid?: boolean; // Honeycomb lid top (default: false). No name on the lid
  lidEmboss?: boolean; // Engrave the tray name on the lid top (default: true)
}

// Outer wall thickness a lidded tray needs for the lid's recess and rails (same as a new box)
export const LID_OUTER_WALL = 3;

// Outer wall thickness. wallThickness always sets the dividers between cups; it also sets the
// outer wall unless the tray has a lid, which needs at least LID_OUTER_WALL.
export function getCupTrayOuterWall(params: CupTrayParams): number {
  return params.lidEnabled ? Math.max(params.wallThickness, LID_OUTER_WALL) : params.wallThickness;
}

// How far the lid's top plate sits above the tray body (0 without a lid)
export function getCupTrayLidRise(params: CupTrayParams): number {
  return params.lidEnabled ? getCupTrayOuterWall(params) : 0;
}

// Scoops are not possible on a honeycomb floor
export function cupTrayHasScoops(params: CupTrayParams): boolean {
  return (params.scoops ?? true) && !params.honeycombBottom;
}

// Cup cavity height: the explicit value, or (auto) whatever is left of targetHeight once the
// floor and lid are taken out, or the default when there is no height to fit
export function resolveCupCavityHeight(params: CupTrayParams, targetHeight?: number): number {
  return (
    params.cupCavityHeight ??
    (targetHeight ? targetHeight - params.floorThickness - getCupTrayLidRise(params) : DEFAULT_CUP_CAVITY_HEIGHT)
  );
}

// Cups for a tray's own params (see computeCupPositions)
export function computeCupTrayCups(params: CupTrayParams): ComputedCup[] {
  return computeCupPositions(
    params.layout,
    params.trayWidth,
    params.trayDepth,
    params.wallThickness,
    getCupTrayOuterWall(params)
  );
}

// Minimum cup size warning threshold (reduced from 30mm since custom layouts may intentionally have smaller cups)
export const MIN_CUP_SIZE = 20;

// Default cup cavity height when auto-calculated and no box context
export const DEFAULT_CUP_CAVITY_HEIGHT = 25;

// Default 3-cup layout: vertical split, then one side split horizontally
function createDefault3CupLayout(): CupLayout {
  return {
    root: {
      type: 'split',
      direction: 'vertical',
      ratio: 0.5,
      first: { type: 'cup', id: generateCupId() },
      second: {
        type: 'split',
        direction: 'horizontal',
        ratio: 0.5,
        first: { type: 'cup', id: generateCupId() },
        second: { type: 'cup', id: generateCupId() }
      }
    }
  };
}

// Default parameters
export const defaultCupTrayParams: CupTrayParams = {
  layout: createDefault3CupLayout(),
  trayWidth: 89,
  trayDepth: 89,
  cupCavityHeight: null, // Auto by default
  wallThickness: 2.0,
  floorThickness: 2.0,
  cornerRadius: 6,
  scoops: true,
  lidEnabled: false,
  honeycombBottom: false,
  honeycombLid: false,
  lidEmboss: true
};

// Cup position data for visualization
export interface CupPosition {
  id: CupId; // Unique cup identifier
  x: number; // Center X position
  y: number; // Center Y position
  z: number; // Bottom Z position
  width: number; // Cup width
  depth: number; // Cup depth
  height: number; // Cup height
  cornerRadius: number; // Corner radius in mm
}

// Computed cup data (intermediate calculation before final positioning)
export interface ComputedCup {
  id: CupId;
  x: number; // Left edge in mm (relative to tray interior)
  y: number; // Front edge in mm
  width: number; // Cup width in mm
  depth: number; // Cup depth in mm
}

// Compute cup positions from layout tree
export function computeCupPositions(
  layout: CupLayout,
  trayWidth: number,
  trayDepth: number,
  wallThickness: number,
  outerWallThickness: number = wallThickness
): ComputedCup[] {
  const cups: ComputedCup[] = [];

  // Interior bounds (inside outer walls)
  const interiorX = outerWallThickness;
  const interiorY = outerWallThickness;
  const interiorWidth = trayWidth - 2 * outerWallThickness;
  const interiorDepth = trayDepth - 2 * outerWallThickness;

  function traverseNode(node: CupLayoutNode, x: number, y: number, width: number, depth: number): void {
    if (isCupLeaf(node)) {
      // This is a cup - add it to the list
      cups.push({
        id: node.id,
        x,
        y,
        width,
        depth
      });
    } else if (isCupSplit(node)) {
      // Split this space into two children
      if (node.direction === 'vertical') {
        // Left/right split
        const leftWidth = width * node.ratio - wallThickness / 2;
        const rightWidth = width * (1 - node.ratio) - wallThickness / 2;
        const rightX = x + leftWidth + wallThickness;

        traverseNode(node.first, x, y, leftWidth, depth);
        traverseNode(node.second, rightX, y, rightWidth, depth);
      } else {
        // Top/bottom split (horizontal = top/bottom, "first" is top which is higher Y)
        const topDepth = depth * node.ratio - wallThickness / 2;
        const bottomDepth = depth * (1 - node.ratio) - wallThickness / 2;
        const bottomY = y + topDepth + wallThickness;

        traverseNode(node.first, x, y, width, topDepth);
        traverseNode(node.second, x, bottomY, width, bottomDepth);
      }
    }
  }

  traverseNode(layout.root, interiorX, interiorY, interiorWidth, interiorDepth);

  return cups;
}

// Get minimum cup dimensions from layout (for validation)
export function getMinCupDimensions(params: CupTrayParams): {
  minWidth: number;
  minDepth: number;
} {
  const cups = computeCupTrayCups(params);

  if (cups.length === 0) {
    return { minWidth: 0, minDepth: 0 };
  }

  let minWidth = Infinity;
  let minDepth = Infinity;

  for (const cup of cups) {
    minWidth = Math.min(minWidth, cup.width);
    minDepth = Math.min(minDepth, cup.depth);
  }

  return { minWidth, minDepth };
}

// Calculate tray dimensions from parameters
// resolvedCupCavityHeight is used when cupCavityHeight is null (auto mode)
export function getCupTrayDimensions(
  params: CupTrayParams,
  resolvedCupCavityHeight?: number
): {
  width: number;
  depth: number;
  height: number;
} {
  const { trayWidth, trayDepth, cupCavityHeight, floorThickness } = params;

  // Width and depth come directly from params
  const width = trayWidth;
  const depth = trayDepth;

  // Height calculation:
  // - If cupCavityHeight is a number, use it
  // - If null (auto), use resolvedCupCavityHeight or default to DEFAULT_CUP_CAVITY_HEIGHT
  // A lid's top plate sits above the body and counts toward the height
  const effectiveCupHeight = cupCavityHeight ?? resolvedCupCavityHeight ?? DEFAULT_CUP_CAVITY_HEIGHT;
  const height = floorThickness + effectiveCupHeight + getCupTrayLidRise(params);

  return { width, depth, height };
}

// Get cup positions for visualization
export function getCupPositions(
  params: CupTrayParams,
  targetHeight?: number,
  floorSpacerHeight?: number
): CupPosition[] {
  const { cornerRadius } = params;
  const spacerOffset = floorSpacerHeight ?? 0;

  const effectiveCupHeight = resolveCupCavityHeight(params, targetHeight);

  // Height of the tray body (without the lid's top plate)
  const lidRise = getCupTrayLidRise(params);
  const baseTrayHeight = getCupTrayDimensions(params, effectiveCupHeight).height - lidRise;
  const bodyTarget = targetHeight ? targetHeight - lidRise : 0;
  const trayHeight = bodyTarget > baseTrayHeight ? bodyTarget : baseTrayHeight;

  // Get computed cup positions from layout tree
  const computedCups = computeCupTrayCups(params);

  // Convert to CupPosition format (with center coordinates)
  return computedCups.map((cup) => ({
    id: cup.id,
    x: cup.x + cup.width / 2, // Convert to center
    y: cup.y + cup.depth / 2, // Convert to center
    z: trayHeight - effectiveCupHeight + spacerOffset,
    width: cup.width,
    depth: cup.depth,
    height: effectiveCupHeight,
    cornerRadius
  }));
}

// Create cup tray geometry
export function createCupTray(
  params: CupTrayParams,
  trayName?: string,
  targetHeight?: number,
  floorSpacerHeight?: number,
  showEmboss: boolean = true
): Geom3 {
  const { wallThickness, cornerRadius } = params;
  const outerWall = getCupTrayOuterWall(params);
  const lidRise = getCupTrayLidRise(params);
  const scoops = cupTrayHasScoops(params);
  const honeycombBottom = params.honeycombBottom ?? false;

  const nameLabel = trayName ? `Tray "${trayName}"` : 'Tray';

  // Get computed cup positions from layout tree
  const computedCups = computeCupTrayCups(params);

  // Validate that we have at least one cup
  if (computedCups.length === 0) {
    throw new Error(`${nameLabel}: Layout must contain at least one cup.`);
  }

  // Check for cups with invalid dimensions
  for (const cup of computedCups) {
    if (cup.width <= 0 || cup.depth <= 0) {
      throw new Error(
        `${nameLabel}: Cup dimensions must be greater than zero. Check tray width/depth vs wall thickness.`
      );
    }
  }

  const cupHeight = resolveCupCavityHeight(params, targetHeight);

  if (cupHeight <= 0) {
    throw new Error(`${nameLabel}: Cup cavity height must be greater than zero.`);
  }

  // trayHeight is the body only: a lid's top plate sits lidRise above it, inside targetHeight
  const dims = getCupTrayDimensions(params, cupHeight);
  const baseTrayHeight = dims.height - lidRise;
  const bodyTarget = targetHeight ? targetHeight - lidRise : 0;
  const spacerHeight = floorSpacerHeight ?? 0;
  const trayHeight = (bodyTarget > baseTrayHeight ? bodyTarget : baseTrayHeight) + spacerHeight;

  const trayWidth = dims.width;
  const trayDepth = dims.depth;

  // Create tray body
  const trayBody = cuboid({
    size: [trayWidth, trayDepth, trayHeight],
    center: [trayWidth / 2, trayDepth / 2, trayHeight / 2]
  });

  // Create cup cavities from computed positions
  const cupCuts: Geom3[] = [];
  const cupFloorZ = trayHeight - cupHeight;

  for (const cup of computedCups) {
    // Calculate center position for this cup
    const cupCenterX = cup.x + cup.width / 2;
    const cupCenterY = cup.y + cup.depth / 2;

    // Determine corner radius for this cup - constrain to half the smallest dimension
    const maxRadius = Math.min(cup.width, cup.depth) / 2;
    const effectiveCornerRadius = Math.min(cornerRadius, maxRadius);

    if (!scoops) {
      // Flat floor meeting the walls at 90°; the corner radius only rounds the upright corners
      const cavityHeight = cupHeight + 1;
      const uprightRadius = Math.min(effectiveCornerRadius, maxRadius - 0.01);
      const cupCavity =
        uprightRadius > 0.01
          ? translate(
              [cupCenterX, cupCenterY, cupFloorZ],
              extrudeLinear(
                { height: cavityHeight },
                roundedRectangle({ size: [cup.width, cup.depth], roundRadius: uprightRadius, segments: 32 })
              )
            )
          : cuboid({
              size: [cup.width, cup.depth, cavityHeight],
              center: [cupCenterX, cupCenterY, cupFloorZ + cavityHeight / 2]
            });
      cupCuts.push(cupCavity);
      continue;
    }

    // Cup cavity height - extend above tray top by cornerRadius*2 so the
    // rounded top edge is completely outside the tray (only bottom rounds inside)
    const cavityHeight = cupHeight + effectiveCornerRadius * 2 + 1;

    // Simple rounded cuboid for the cup cavity
    // Bottom at cupFloorZ, top extends well above tray surface
    const cupCavity = translate(
      [cupCenterX, cupCenterY, cupFloorZ + cavityHeight / 2],
      roundedCuboid({
        size: [cup.width, cup.depth, cavityHeight],
        roundRadius: effectiveCornerRadius,
        segments: 32,
        center: [0, 0, 0]
      })
    );

    cupCuts.push(cupCavity);
  }

  let result = subtract(trayBody, ...cupCuts);

  // Sliding lid: recess the outer wall and add the rail grooves, lock and grip lines
  if (params.lidEnabled) {
    const lidFit = {
      extWidth: trayWidth,
      extDepth: trayDepth,
      extHeight: trayHeight,
      wall: outerWall,
      lidParams: defaultLidParams
    };
    result = addLidFittings(subtract(result, createLidRecess(lidFit)), lidFit);
  }

  // Honeycomb floor: hexes through the solid floor, kept inside each cup so every wall
  // stands on a solid strip
  if (honeycombBottom) {
    const honeycomb = createHoneycombUnion(trayWidth, trayDepth, cupFloorZ, {
      ...defaultHoneycombParams,
      borderOffset: outerWall
    });
    if (honeycomb) {
      const ledge = 1;
      const cupFloors = computedCups
        .filter((cup) => cup.width > ledge * 2 && cup.depth > ledge * 2)
        .map((cup) =>
          cuboid({
            size: [cup.width - ledge * 2, cup.depth - ledge * 2, cupFloorZ + 4],
            center: [cup.x + cup.width / 2, cup.y + cup.depth / 2, cupFloorZ / 2]
          })
        );
      if (cupFloors.length > 0) {
        result = subtract(result, intersect(honeycomb, union(...cupFloors)));
      }
    }
  }

  // Emboss tray name on bottom (Z=0 face); a honeycomb floor leaves nowhere to put it
  if (showEmboss && !honeycombBottom && trayName && trayName.trim().length > 0) {
    const textDepth = 0.6;
    const strokeWidth = 1.2;
    const textHeightParam = 6;
    const margin = wallThickness * 2;

    const textSegments = vectorText({ height: textHeightParam, align: 'center' }, trayName.trim().toUpperCase());

    if (textSegments.length > 0) {
      const textShapes: ReturnType<typeof extrudeLinear>[] = [];
      for (const segment of textSegments) {
        if (segment.length >= 2) {
          const pathObj = path2.fromPoints({ closed: false }, segment);
          const expanded = expand({ delta: strokeWidth / 2, corners: 'round', segments: 32 }, pathObj);
          const extruded = extrudeLinear({ height: textDepth + 0.1 }, expanded);
          textShapes.push(extruded);
        }
      }

      if (textShapes.length > 0) {
        let minX = Infinity,
          maxX = -Infinity;
        let minY = Infinity,
          maxY = -Infinity;
        for (const segment of textSegments) {
          for (const point of segment) {
            minX = Math.min(minX, point[0]);
            maxX = Math.max(maxX, point[0]);
            minY = Math.min(minY, point[1]);
            maxY = Math.max(maxY, point[1]);
          }
        }
        const textWidthCalc = maxX - minX + strokeWidth;
        const textHeightY = maxY - minY + strokeWidth;

        // Fit text along tray width (X axis)
        const availableWidth = trayWidth - margin * 2;
        const availableDepth = trayDepth - margin * 2;
        const scaleX = Math.min(1, availableWidth / textWidthCalc);
        const scaleY = Math.min(1, availableDepth / textHeightY);
        const textScale = Math.min(scaleX, scaleY);

        const centerX = trayWidth / 2;
        const centerY = trayDepth / 2;
        const textCenterX = (minX + maxX) / 2;
        const textCenterY = (minY + maxY) / 2;

        let combinedText = union(...textShapes);
        // Mirror Y so text reads correctly when tray is flipped
        combinedText = mirrorY(combinedText);

        const positionedText = translate(
          [centerX - textCenterX * textScale, centerY + textCenterY * textScale, -0.1],
          scale([textScale, textScale, 1], combinedText)
        );
        result = subtract(result, positionedText);
      }
    }
  }

  return result;
}

// Create the tray's sliding lid (null when the tray has no lid). Printed top-face down, like a
// box lid. The name goes on the lid top (lidEmboss) unless the lid is honeycomb.
export function createCupTrayLid(params: CupTrayParams, trayName?: string): Geom3 | null {
  if (!params.lidEnabled) return null;
  const honeycombLid = params.honeycombLid ?? false;
  const showEmboss = params.lidEmboss ?? true;
  return createLidForDimensions({
    extWidth: params.trayWidth,
    extDepth: params.trayDepth,
    wall: getCupTrayOuterWall(params),
    lidParams: { ...defaultLidParams, honeycombEnabled: honeycombLid, showName: showEmboss && !honeycombLid },
    name: trayName
  });
}

// Validate cup tray parameters and return warnings
export function validateCupTrayParams(params: CupTrayParams): string[] {
  const warnings: string[] = [];
  const { minWidth, minDepth } = getMinCupDimensions(params);

  if (minWidth < MIN_CUP_SIZE) {
    warnings.push(
      `Smallest cup width (${minWidth.toFixed(1)}mm) is below minimum (${MIN_CUP_SIZE}mm). Increase tray size or adjust layout.`
    );
  }

  if (minDepth < MIN_CUP_SIZE) {
    warnings.push(
      `Smallest cup depth (${minDepth.toFixed(1)}mm) is below minimum (${MIN_CUP_SIZE}mm). Increase tray size or adjust layout.`
    );
  }

  if (minWidth <= 0) {
    warnings.push(`Tray width is too small for the current layout and wall thickness.`);
  }

  if (minDepth <= 0) {
    warnings.push(`Tray depth is too small for the current layout and wall thickness.`);
  }

  const maxRadius = Math.min(Math.max(minWidth, 0), Math.max(minDepth, 0)) / 2;
  if (params.cornerRadius < 0) {
    warnings.push(`Corner radius cannot be negative`);
  } else if (maxRadius > 0 && params.cornerRadius > maxRadius) {
    warnings.push(
      `Corner radius (${params.cornerRadius}mm) exceeds maximum for smallest cup (${maxRadius.toFixed(1)}mm)`
    );
  }

  return warnings;
}
