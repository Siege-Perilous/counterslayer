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

// Clearance (mm) kept between opposing standees in the depth direction, on top of the geometric
// minimum, so staggered rows never touch.
const STANDEE_GAP = 2;

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
  // Slot vertical geometry (Z)
  axisZ: number; // figure centre height — the slot pivots about this so the base stays aligned
  slotBottomZ: number; // lowest Z the slot reaches (below the floor when it cuts all the way through)
  slotTopZ: number; // top of the slot (above the rim so it is open for inserting the standee)
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
  const slotWidth = standee.standeeThickness + 1;

  // Slots split across the two walls (left gets the extra one for odd counts).
  const leftRowCount = Math.ceil(count / 2);
  const rightRowCount = Math.floor(count / 2);
  const maxRowCount = Math.max(leftRowCount, rightRowCount, 1);

  // --- Height (Z) ---
  // The base lies on its side as a vertical disc (baseDiameter tall) and the figure (standeeWidth
  // tall) is centred on the disc centre. The figure axis is at floor + baseRadius.
  const spacerHeight = floorSpacerHeight ?? 0;
  const axisZ = floorThickness + baseRadius;
  const contentTopZ = Math.max(floorThickness + baseDiameter, axisZ + standeeWidth / 2);
  let trayHeight = contentTopZ + rimHeight + spacerHeight;
  if (targetHeight && targetHeight > trayHeight) {
    trayHeight = targetHeight;
  }

  // --- Slot vertical extent (Z) ---
  // The slot holds the figure (centred on the axis) and stays open at the top so the standee drops
  // in. It plunges only as deep as the figure reaches: if the figure bottom is at or below the
  // floor (standee as wide as / wider than the base) it cuts all the way through — extended a few
  // mm below the floor so the angled cut leaves no sliver; otherwise it stops at the figure bottom.
  const figureBottomZ = axisZ - standeeWidth / 2;
  const cutsThrough = figureBottomZ <= floorThickness;
  const slotBottomZ = cutsThrough ? floorThickness - 4 : figureBottomZ;
  const slotTopZ = trayHeight + 1;

  // --- Depth (Y): one slot per standee ---
  // Spacing must clear both the base discs (baseDiameter + 1) and the angled slots. A slot tilted
  // SLOT_ANGLE sweeps sideways (Y) above the figure axis (topSweep) and below it (botSweep). The
  // opposing row tilts the other way and is staggered by half a pitch, so each slot approaches the
  // next slot on the other wall on whichever side sweeps farther. The half-pitch must therefore
  // exceed that larger one-sided sweep plus the slot width and a clearance gap, otherwise the
  // staggered slots — and the standees in them — would touch.
  const topSweep = (Math.min(slotTopZ, trayHeight) - axisZ) * Math.tan(SLOT_ANGLE);
  const botSweep = (axisZ - floorThickness) * Math.tan(SLOT_ANGLE);
  const requiredStagger = 2 * Math.max(topSweep, botSweep) + slotWidth + STANDEE_GAP;
  const slotPitch = Math.max(baseDiameter + 1, 2 * requiredStagger);
  const staggerY = slotPitch / 2; // right wall offset so figures interleave

  // End margin so the end standees still slide in past the end walls. The base disc needs
  // baseRadius, and because the standee enters from the (tilted) top of the slot its base swings
  // toward the end by the slot's sweep before seating — so add that sweep on top of the radius.
  const endSweep = Math.max(topSweep, botSweep);
  const endMargin = wallThickness + clearance + baseRadius + endSweep;
  const firstSlotY = endMargin;
  const lastSlotY = endMargin + (maxRowCount - 1) * slotPitch + staggerY;
  const trayDepth = lastSlotY + baseRadius + endSweep + clearance + wallThickness;

  // --- Width (X) ---
  // The base is a thin vertical disc against the side wall, so the outer cavity only needs the base
  // thickness plus a little room (baseThickness + 5mm). The figure points inward across the inner
  // wall into the middle cavity. A lying standee's full length is baseThickness + standeeHeight, and
  // it must fit across its outer cavity plus the middle cavity (opposing rows interleave there).
  const standeeLength = standee.baseThickness + standeeHeight;
  const outerCavityWidth = standee.baseThickness + 5;
  const middleCavityWidth = Math.max(standeeLength + clearance - outerCavityWidth, outerCavityWidth);

  const leftWallX = wallThickness + outerCavityWidth;
  const rightWallX = leftWallX + innerWallThickness + middleCavityWidth;
  const trayWidth = rightWallX + innerWallThickness + outerCavityWidth + wallThickness;

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
    axisZ,
    slotBottomZ,
    slotTopZ,
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

  // === ANGLED SLOTS ===
  // Slot: a channel that pierces the wall across its thickness (X) so the standee figure can pass
  // through, narrow along the wall (Y = figure thickness + clearance). It is rotated SLOT_ANGLE
  // about the X axis so it runs diagonally on the wall's face — from lower on the wall up to the
  // top while moving along the wall's length (Y). This tilts the standee toward an end wall so it
  // resists falling out, while its base still sits flush at the side. The two walls tilt in
  // opposite directions and the rows are staggered so opposing standees interleave.
  //
  // The tilt PIVOTS ABOUT THE FIGURE AXIS (Z = floor + baseRadius), so the slot stays centred on
  // the standee's nominal Y at the figure's centre height — the cut reaches the right depth there
  // and the base stays aligned. The slot runs from slotBottomZ (the figure bottom, or below the
  // floor when it cuts all the way through) up to slotTopZ (above the rim, open for insertion).
  // Slots are cut from the walls ALONE and the walls are then unioned onto the box, so a full-depth
  // cut never touches the floor.
  const { axisZ, slotBottomZ, slotTopZ } = layout;
  const cos = Math.cos(SLOT_ANGLE);
  const lengthBelowAxis = (axisZ - slotBottomZ) / cos; // along the tilted bar, below the pivot
  const lengthAboveAxis = (slotTopZ - axisZ) / cos; // above the pivot
  const barLen = lengthBelowAxis + lengthAboveAxis;
  const barZShift = barLen / 2 - lengthBelowAxis; // moves the pivot to the bar's origin
  const slotThrough = innerWallThickness * 6; // generous so the angled cut always pierces fully
  const makeSlot = (centerX: number, centerY: number, angle: number): Geom3 => {
    let s: Geom3 = cuboid({ size: [slotThrough, layout.slotWidth, barLen] });
    s = translate([0, 0, barZShift], s); // figure axis now at the origin
    s = rotateX(angle, s); // pivot the tilt about the figure axis
    s = translate([centerX, centerY, axisZ], s);
    return s;
  };

  const buildWall = (frontFaceX: number, rowCount: number, angle: number, yOffset: number): Geom3 => {
    let wall = makeInnerWall(frontFaceX);
    const centerX = frontFaceX + innerWallThickness / 2;
    const slots: Geom3[] = [];
    for (let i = 0; i < rowCount; i++) {
      const y = layout.firstSlotY + yOffset + i * layout.slotPitch;
      slots.push(makeSlot(centerX, y, angle));
    }
    if (slots.length > 0) wall = subtract(wall, ...slots);
    return wall;
  };

  const leftWall = buildWall(leftWallX, layout.leftRowCount, SLOT_ANGLE, 0);
  const rightWall = buildWall(rightWallX, layout.rightRowCount, -SLOT_ANGLE, layout.staggerY);
  tray = union(tray, leftWall, rightWall);

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
