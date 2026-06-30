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
  floorRefZ: number; // top of the (raised) solid floor the standees rest on
  innerWallTopZ: number; // top of the inner walls/slots (the rim); the walls run up from floorRefZ
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
  // tall) is centred on the disc centre. The figure axis sits a base-radius above whatever floor the
  // standees rest on.
  const spacerHeight = floorSpacerHeight ?? 0;
  // Natural height the standee + rim need on their own (measured from a floor at floorThickness). The
  // inner walls, slots and the standee spacing below are all sized from this so they never change
  // when the box stretches the tray taller — otherwise the slot sweep (and therefore the tray depth)
  // would grow with the box height and overflow the footprint the packer reserved.
  const naturalAxisZ = floorThickness + baseRadius;
  const contentTopZ = Math.max(floorThickness + baseDiameter, naturalAxisZ + standeeWidth / 2);
  const naturalTrayHeight = contentTopZ + rimHeight;
  // Outer tray height: raise the rim to the box/layer height (targetHeight), then add any floor
  // spacer — same order as the counter tray so the box's height normalisation lines up.
  const trayHeightWithoutSpacer = targetHeight && targetHeight > naturalTrayHeight ? targetHeight : naturalTrayHeight;
  const trayHeight = trayHeightWithoutSpacer + spacerHeight;
  // When the tray is stretched taller, raise the floor with a solid spacer (like the counter tray)
  // so the standees sit up near the rim rather than buried at the bottom. The whole standee layout —
  // floor, inner walls, slots and figures — shifts up by this lift; the cavity above stays the
  // natural size and the slot spacing is unchanged (it uses differences that cancel the lift).
  const lift = trayHeight - naturalTrayHeight;
  const floorRefZ = floorThickness + lift; // top of the raised solid floor the standees rest on
  const axisZ = naturalAxisZ + lift;
  const innerWallTopZ = naturalTrayHeight + lift; // inner walls run from the raised floor to the rim

  // --- Slot vertical extent (Z) ---
  // The slot holds the figure (centred on the axis) and stays open at the top of the inner wall so
  // the standee drops in. It plunges only as deep as the figure reaches: if the figure bottom is at
  // or below the (raised) floor the standee is as wide as / wider than the base, so it cuts all the
  // way through — extended a few mm below the floor so the angled cut leaves no sliver; otherwise it
  // stops at the figure bottom.
  const figureBottomZ = axisZ - standeeWidth / 2;
  const cutsThrough = figureBottomZ <= floorRefZ;
  const slotBottomZ = cutsThrough ? floorRefZ - 4 : figureBottomZ;
  const slotTopZ = innerWallTopZ + 1;

  // --- Depth (Y): one slot per standee ---
  // Both inner walls tilt their slots the SAME direction, so the standees on the two walls run
  // parallel rather than converging like a herringbone — which lets the row pitch be set by the base
  // discs (the widest part) instead of the slot's sideways sweep, packing the tray much shorter than
  // opposed slots would. The right row is then offset by HALF a pitch so its standees sit centred
  // between the left row's, so each reads clearly from above instead of hiding behind its neighbour.
  // The pitch is floored at twice the parallel-figure clearance so that half-pitch offset always
  // keeps opposing figures apart. topSweep/botSweep (the slot's sideways sweep above/below the figure
  // axis) are still used for the end margins below.
  const topSweep = (innerWallTopZ - axisZ) * Math.tan(SLOT_ANGLE);
  const botSweep = (axisZ - floorRefZ) * Math.tan(SLOT_ANGLE);
  const figureClearance = slotWidth + STANDEE_GAP; // min offset for opposing parallel figures to clear
  const slotPitch = Math.max(baseDiameter + 1, 2 * figureClearance);
  const staggerY = slotPitch / 2; // half-pitch so the right row centres between the left row's standees

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
    floorRefZ,
    innerWallTopZ,
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

// One placed standee for the 3D content preview: a round base disc against a side wall with a
// rectangular figure perpendicular to it, leaning by the slot angle. Positions are in the model's
// Z-up coordinates (x = width, y = depth, z = height).
export interface StandeePosition {
  x: number; // base disc centre (against the side wall)
  y: number; // slot position along the depth
  z: number; // figure axis height (disc centre)
  figureDir: number; // +1 / -1: the X direction the figure points (toward the centre)
  tilt: number; // signed lean angle (radians)
  baseRadius: number;
  baseThickness: number;
  figureWidth: number; // standee width (vertical extent)
  figureLength: number; // standee height (length the figure reaches inward)
  figureThickness: number;
}

export function getStandeePositions(
  params: StandeeTrayParams,
  standees: Standee[],
  targetHeight?: number,
  floorSpacerHeight?: number
): StandeePosition[] {
  const standee = getStandee(params.standeeId, standees);
  const layout = computeLayout(params, standee, targetHeight, floorSpacerHeight);
  const { wallThickness } = params;
  const { baseRadius, baseThickness, standeeWidth, standeeHeight, standeeThickness } = standee;

  // Base disc sits flush against the side wall in the outer cavity.
  const leftX = wallThickness + baseThickness / 2;
  const rightX = layout.trayWidth - wallThickness - baseThickness / 2;

  const common = {
    z: layout.axisZ,
    baseRadius,
    baseThickness,
    figureWidth: standeeWidth,
    figureLength: standeeHeight,
    figureThickness: standeeThickness
  };

  const positions: StandeePosition[] = [];
  for (let i = 0; i < layout.leftRowCount; i++) {
    positions.push({
      ...common,
      x: leftX,
      y: layout.firstSlotY + i * layout.slotPitch,
      figureDir: 1,
      tilt: SLOT_ANGLE
    });
  }
  for (let i = 0; i < layout.rightRowCount; i++) {
    positions.push({
      ...common,
      x: rightX,
      y: layout.firstSlotY + layout.staggerY + i * layout.slotPitch,
      figureDir: -1,
      tilt: SLOT_ANGLE // same slant as the left row (figureDir still points inward from the right wall)
    });
  }
  return positions;
}

export function createStandeeTray(
  params: StandeeTrayParams,
  standees: Standee[],
  trayName?: string,
  targetHeight?: number,
  floorSpacerHeight?: number,
  showEmboss: boolean = true
): Geom3 {
  const { wallThickness, innerWallThickness } = params;
  const standee = getStandee(params.standeeId, standees);
  const layout = computeLayout(params, standee, targetHeight, floorSpacerHeight);

  const { trayWidth, trayDepth, trayHeight, floorRefZ, innerWallTopZ, leftWallX, rightWallX } = layout;
  // The cavity (and the inner walls) start at floorRefZ, which is raised above the real floor when
  // the tray is stretched taller — leaving a solid spacer below so the standees sit near the rim.
  const cavityHeight = trayHeight - floorRefZ;
  const innerWallHeight = innerWallTopZ - floorRefZ;

  // === OPEN-TOP BOX (floor + 4 outer walls) ===
  const outerBox = translate(
    [trayWidth / 2, trayDepth / 2, trayHeight / 2],
    cuboid({ size: [trayWidth, trayDepth, trayHeight] })
  );
  const innerCavity = translate(
    [trayWidth / 2, trayDepth / 2, floorRefZ + cavityHeight / 2 + 0.1],
    cuboid({ size: [trayWidth - wallThickness * 2, trayDepth - wallThickness * 2, cavityHeight + 0.2] })
  );
  let tray = subtract(outerBox, innerCavity);

  // === TWO INNER WALLS spanning the depth ===
  const innerCavityDepth = trayDepth - wallThickness * 2;
  const makeInnerWall = (frontFaceX: number): Geom3 =>
    translate(
      [frontFaceX + innerWallThickness / 2, trayDepth / 2, floorRefZ + innerWallHeight / 2],
      cuboid({ size: [innerWallThickness, innerCavityDepth, innerWallHeight] })
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

  // Both walls tilt the same way (SLOT_ANGLE), so the standees all slant in one direction; the right
  // row is just nudged by staggerY so its figures interleave with the left row's in the middle.
  const leftWall = buildWall(leftWallX, layout.leftRowCount, SLOT_ANGLE, 0);
  const rightWall = buildWall(rightWallX, layout.rightRowCount, SLOT_ANGLE, layout.staggerY);
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
