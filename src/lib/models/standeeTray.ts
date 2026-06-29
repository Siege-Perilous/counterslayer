import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';

const { cuboid } = jscad.primitives;
const { subtract, union } = jscad.booleans;
const { translate, rotateX, scale, mirrorY } = jscad.transforms;
const { vectorText } = jscad.text;
const { path2 } = jscad.geometries;
const { expand } = jscad.expansions;
const { extrudeLinear } = jscad.extrusions;

// Import types from project
import type { Standee } from '$lib/types/project';

// Angle of the slot fan, in degrees. Slots on the two inner walls tilt in
// opposite directions by this amount so opposing standees interlock and resist
// being jostled out.
const SLOT_ANGLE_DEG = 20;
const SLOT_ANGLE = (SLOT_ANGLE_DEG * Math.PI) / 180;

export interface StandeeTrayParams {
  standeeId: string; // Reference to a Standee by ID
  count: number; // Total number of standees stored (split across the two walls)
  wallThickness: number; // Outer wall + floor wall thickness
  innerWallThickness: number; // Thickness of the two slotted inner walls
  floorThickness: number;
  clearance: number; // Tolerance around standees
  rimHeight: number; // Extra height above the tallest content
}

export const defaultStandeeTrayParams: StandeeTrayParams = {
  standeeId: '', // Filled in with the first available standee at creation time
  count: 12,
  wallThickness: 2.0,
  innerWallThickness: 2.0,
  floorThickness: 2.0,
  clearance: 0.5,
  rimHeight: 2.0
};

// Helper to get a standee from the global standees by ID.
// Falls back to matching by name, then first available, then a minimal default.
export function getStandee(standeeId: string, standees: Standee[]): Standee {
  let standee = standees.find((s) => s.id === standeeId);
  if (standee) return standee;

  standee = standees.find((s) => s.name === standeeId);
  if (standee) {
    console.warn(`Standee ID "${standeeId}" not found, matched by name instead`);
    return standee;
  }

  if (standees.length > 0) {
    console.warn(`Standee "${standeeId}" not found by ID or name, using first available standee`);
    return standees[0];
  }

  return {
    id: 'default',
    name: 'Default',
    baseRadius: 9,
    baseThickness: 3,
    standeeHeight: 40,
    standeeWidth: 25,
    standeeThickness: 1.5
  };
}

// Shared layout math so dimensions and geometry stay in sync.
interface StandeeLayout {
  trayWidth: number;
  trayDepth: number;
  trayHeight: number;
  // X positions (front face of each inner wall)
  leftWallX: number;
  rightWallX: number;
  innerWallThickness: number;
  // Slot rows
  leftRowCount: number;
  rightRowCount: number;
  firstSlotY: number; // Y of the first slot center
  slotPitch: number;
  staggerY: number; // Y offset applied to the right wall's slots
  slotWidth: number;
  outerCavityWidth: number;
  middleCavityWidth: number;
  baseRadius: number;
  baseDiameter: number;
}

function computeLayout(
  params: StandeeTrayParams,
  standee: Standee,
  targetHeight?: number,
  floorSpacerHeight?: number
): StandeeLayout {
  const { wallThickness, innerWallThickness, floorThickness, clearance, rimHeight } = params;
  const count = Math.max(0, Math.floor(params.count));

  const { baseRadius, standeeHeight, standeeWidth } = standee;
  const baseDiameter = baseRadius * 2;

  // Slots split across the two walls (left gets the extra one for odd counts).
  const leftRowCount = Math.ceil(count / 2);
  const rightRowCount = Math.floor(count / 2);
  const maxRowCount = Math.max(leftRowCount, rightRowCount, 1);

  // Along depth (Y): one slot per standee, spaced by base diameter + 1mm.
  const slotPitch = baseDiameter + 1;
  const slotWidth = standee.standeeThickness + 1;
  const staggerY = slotPitch / 2; // right wall offset so figures interleave

  // Margin so the base disc (radius baseRadius) clears the front/back walls.
  const endMargin = wallThickness + baseRadius + clearance;
  const firstSlotY = endMargin;
  const lastSlotY = endMargin + (maxRowCount - 1) * slotPitch + staggerY;
  const trayDepth = lastSlotY + baseRadius + clearance + wallThickness;

  // Across width (X): outer cavity holds the base; drop-in clearance requires the
  // inner wall to sit at least baseRadius + 1mm from the outer wall.
  const outerCavityWidth = baseRadius + 1 + clearance;

  // Horizontal reach of the figure (tilted SLOT_ANGLE off the wall normal).
  const figureXReach = standeeHeight * Math.cos(SLOT_ANGLE);

  const leftWallX = wallThickness + outerCavityWidth;
  // Left figure tip lands inside the middle cavity, just short of the right wall.
  const leftTipX = wallThickness + figureXReach;
  const rightWallX = Math.max(leftTipX + clearance, leftWallX + innerWallThickness + clearance);
  const middleCavityWidth = rightWallX - (leftWallX + innerWallThickness);
  const trayWidth = rightWallX + innerWallThickness + outerCavityWidth + wallThickness;

  // Height: the vertical base disc (baseDiameter tall, resting on the floor) and the
  // figure (standeeWidth tall, centered on the disc center) both stand vertically.
  const spacerHeight = floorSpacerHeight ?? 0;
  const baseCenterZ = floorThickness + baseRadius;
  const contentTopZ = Math.max(floorThickness + baseDiameter, baseCenterZ + standeeWidth / 2);
  let trayHeight = contentTopZ + rimHeight + spacerHeight;
  if (targetHeight && targetHeight > trayHeight) {
    trayHeight = targetHeight;
  }

  return {
    trayWidth,
    trayDepth,
    trayHeight,
    leftWallX,
    rightWallX,
    innerWallThickness,
    leftRowCount,
    rightRowCount,
    firstSlotY,
    slotPitch,
    staggerY,
    slotWidth,
    outerCavityWidth,
    middleCavityWidth,
    baseRadius,
    baseDiameter
  };
}

export function getStandeeTrayDimensions(
  params: StandeeTrayParams,
  standees: Standee[]
): {
  width: number;
  depth: number;
  height: number;
} {
  const standee = getStandee(params.standeeId, standees);
  const layout = computeLayout(params, standee);
  return { width: layout.trayWidth, depth: layout.trayDepth, height: layout.trayHeight };
}

export function createStandeeTray(
  params: StandeeTrayParams,
  standees: Standee[],
  trayName?: string,
  targetHeight?: number,
  floorSpacerHeight?: number,
  showEmboss: boolean = true
): Geom3 {
  const { wallThickness, innerWallThickness, floorThickness } = params;
  const standee = getStandee(params.standeeId, standees);
  const layout = computeLayout(params, standee, targetHeight, floorSpacerHeight);

  const { trayWidth, trayDepth, trayHeight, leftWallX, rightWallX } = layout;
  const wallHeight = trayHeight - floorThickness;

  // === OPEN-TOP BOX (floor + 4 outer walls) ===
  const outerBox = translate(
    [trayWidth / 2, trayDepth / 2, trayHeight / 2],
    cuboid({ size: [trayWidth, trayDepth, trayHeight] })
  );
  const innerCavity = translate(
    [trayWidth / 2, trayDepth / 2, floorThickness + wallHeight / 2 + 0.1],
    cuboid({ size: [trayWidth - wallThickness * 2, trayDepth - wallThickness * 2, wallHeight + 0.2] })
  );
  let tray = subtract(outerBox, innerCavity);

  // === TWO INNER WALLS spanning the depth ===
  const innerCavityDepth = trayDepth - wallThickness * 2;
  const makeInnerWall = (frontFaceX: number): Geom3 =>
    translate(
      [frontFaceX + innerWallThickness / 2, trayDepth / 2, floorThickness + wallHeight / 2],
      cuboid({ size: [innerWallThickness, innerCavityDepth, wallHeight] })
    );
  tray = union(tray, makeInnerWall(leftWallX), makeInnerWall(rightWallX));

  // === ANGLED SLOTS cut into each inner wall ===
  // Slot: a channel that pierces the wall across its thickness (X) so the standee figure can pass
  // through, narrow along the wall (Y = figure thickness + clearance). It is rotated SLOT_ANGLE
  // about the X axis so it runs diagonally on the wall's face — from the bottom of the wall up to
  // the top while moving along the wall's length (Y). This tilts the standee toward an end wall so
  // it resists falling out, while its base still sits flush at the side. The two walls tilt in
  // opposite directions and the rows are staggered so opposing standees interleave. The slot is
  // tall (open at the top so the standee drops in) and raised so it never cuts through the floor.
  const slotHeight = wallHeight + 6;
  const slotThrough = innerWallThickness * 4; // pierces the full wall thickness
  // Raise the slot so its lowest (tilted) corner sits just above the floor.
  const centerZ =
    floorThickness + 0.5 + (slotHeight / 2) * Math.cos(SLOT_ANGLE) + (layout.slotWidth / 2) * Math.sin(SLOT_ANGLE);
  const makeSlot = (centerX: number, centerY: number, angle: number): Geom3 =>
    translate(
      [centerX, centerY, centerZ],
      rotateX(angle, cuboid({ size: [slotThrough, layout.slotWidth, slotHeight] }))
    );

  const slots: Geom3[] = [];
  for (let i = 0; i < layout.leftRowCount; i++) {
    const y = layout.firstSlotY + i * layout.slotPitch;
    slots.push(makeSlot(leftWallX + innerWallThickness / 2, y, SLOT_ANGLE));
  }
  for (let i = 0; i < layout.rightRowCount; i++) {
    const y = layout.firstSlotY + layout.staggerY + i * layout.slotPitch;
    slots.push(makeSlot(rightWallX + innerWallThickness / 2, y, -SLOT_ANGLE));
  }
  if (slots.length > 0) {
    tray = subtract(tray, ...slots);
  }

  // === EMBOSS TRAY NAME ON BOTTOM ===
  if (showEmboss && trayName && trayName.trim().length > 0) {
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
        combinedText = mirrorY(combinedText);

        const positionedText = translate(
          [centerX - textCenterX * textScale, centerY + textCenterY * textScale, -0.1],
          scale([textScale, textScale, 1], combinedText)
        );
        tray = subtract(tray, positionedText);
      }
    }
  }

  return tray;
}
