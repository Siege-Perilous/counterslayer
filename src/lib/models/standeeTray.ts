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
import type { Standee } from '#lib/types/project.js';

// Slot angle limits, in degrees. The slots on both inner walls lean by the tray's slotAngle so the
// standees resist being jostled out. A steeper lean lowers a figure that is wider than its base (so
// the tray can be shallower) at the cost of length; past 45 degrees the slots become a hard overhang
// to print and awkward to slide a standee into.
export const DEFAULT_SLOT_ANGLE_DEG = 20;
export const MIN_SLOT_ANGLE_DEG = 0;
export const MAX_SLOT_ANGLE_DEG = 45;

// Gap (mm) between a base and the slotted inner wall next to it; the base sits against the far wall. Trays saved before this
// was a setting were built with LEGACY_BASE_GAP, so a tray without the param keeps that size.
export const DEFAULT_BASE_GAP = 1;
export const LEGACY_BASE_GAP = 5;

function getBaseGap(params: StandeeTrayParams): number {
  return Number.isFinite(params.baseGap) ? Math.max(0, params.baseGap) : LEGACY_BASE_GAP;
}

// The tray's slot angle in radians, clamped to the supported range (older trays have no slotAngle).
function getSlotAngle(params: StandeeTrayParams): number {
  const deg = Number.isFinite(params.slotAngle) ? params.slotAngle : DEFAULT_SLOT_ANGLE_DEG;
  return (Math.min(MAX_SLOT_ANGLE_DEG, Math.max(MIN_SLOT_ANGLE_DEG, deg)) * Math.PI) / 180;
}

// Clearance (mm) kept between opposing standees in the depth direction, on top of the geometric
// minimum, so staggered rows never touch.
const STANDEE_GAP = 2;

export interface StandeeTrayParams {
  standeeId: string; // Reference to a Standee by ID
  count: number; // Total number of standees stored (split evenly across the rows)
  // Number of side-by-side rows. Each row is a full pair of opposing slotted walls; neighbouring rows
  // share a single dividing wall that both rows' bases sit against.
  rows: number;
  wallThickness: number; // Outer wall + floor wall thickness
  innerWallThickness: number; // Thickness of the two slotted inner walls
  floorThickness: number;
  clearance: number; // Tolerance around standees
  rimHeight: number; // Extra height above the tallest content
  baseGap: number; // Gap between each base and the slotted inner wall next to it
  slotAngle: number; // Lean of the slots, in degrees (clamped to MIN/MAX_SLOT_ANGLE_DEG)
  trayWidthOverride: number | null; // null = auto from standees; acts as a minimum, content is centred
  trayDepthOverride: number | null; // null = auto from standees; acts as a minimum, content is centred
}

export const defaultStandeeTrayParams: StandeeTrayParams = {
  standeeId: '', // Filled in with the first available standee at creation time
  count: 12,
  rows: 1,
  wallThickness: 2.0,
  innerWallThickness: 2.0,
  floorThickness: 2.0,
  clearance: 0.5,
  rimHeight: 2.0,
  baseGap: DEFAULT_BASE_GAP,
  slotAngle: DEFAULT_SLOT_ANGLE_DEG,
  trayWidthOverride: null,
  trayDepthOverride: null
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

// One row of the tray: a pair of opposing slotted inner walls with a base cavity on either side.
interface StandeeRowLayout {
  leftBoundX: number; // inner face of the wall the left bases sit against (outer wall or divider)
  rightBoundX: number; // inner face of the wall the right bases sit against
  // X positions (front face of each inner wall). Each is anchored to its own side of the row, so a
  // custom width grows the middle cavity between them.
  leftWallX: number;
  rightWallX: number;
  leftCount: number; // standees slotted into the left inner wall
  rightCount: number; // standees slotted into the right inner wall
}

// Shared layout math so dimensions and geometry stay in sync.
interface StandeeLayout {
  trayWidth: number;
  trayDepth: number;
  trayHeight: number;
  floorRefZ: number; // top of the (raised) solid floor the standees rest on
  innerWallTopZ: number; // top of the inner walls/slots (the rim); the walls run up from floorRefZ
  rows: StandeeRowLayout[];
  dividerXs: number[]; // front face X of each dividing wall between neighbouring rows
  innerWallThickness: number;
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
  slotAngle: number; // lean of the slots and standees, in radians
}

function computeLayout(
  params: StandeeTrayParams,
  standee: Standee,
  targetHeight?: number,
  floorSpacerHeight?: number
): StandeeLayout {
  const { wallThickness, innerWallThickness, floorThickness, clearance, rimHeight } = params;
  const count = Math.max(0, Math.floor(params.count));
  const slotAngle = getSlotAngle(params);

  const { baseRadius, standeeHeight, standeeWidth } = standee;
  const baseDiameter = baseRadius * 2;
  const slotWidth = standee.standeeThickness + 1;

  // Standees are dealt out as evenly as possible across the rows (earlier rows take the remainder),
  // which keeps the fullest row — the one that sets the tray depth — as short as it can be. Never
  // more rows than standees: an empty row would only waste width.
  const rowCount = Math.max(1, Math.min(Math.floor(params.rows) || 1, count));
  const perRow = Math.floor(count / rowCount);
  const remainder = count % rowCount;
  // Within a row the slots split across the two walls (left gets the extra one for odd counts).
  const rowCounts = Array.from({ length: rowCount }, (_, i) => {
    const n = perRow + (i < remainder ? 1 : 0);
    return { leftCount: Math.ceil(n / 2), rightCount: Math.floor(n / 2) };
  });

  // --- Height (Z) ---
  // The base lies on its side as a vertical disc (baseDiameter tall) with the figure centred on the
  // disc centre. The figure leans by the slot angle, so it stands shorter than its full width:
  // standeeWidth * cos(angle), plus the little its thickness adds once tilted. The standee rests on
  // whichever reaches lower — the disc, or (when the figure is the taller of the two) the figure's
  // bottom edge, which then holds the disc up off the floor. Either way the figure axis sits that
  // half-height above the floor and the content tops out the same half-height above the axis.
  const figureHalfHeight = (standeeWidth * Math.cos(slotAngle) + standee.standeeThickness * Math.sin(slotAngle)) / 2;
  const contentHalfHeight = Math.max(baseRadius, figureHalfHeight);
  const spacerHeight = floorSpacerHeight ?? 0;
  // Natural height the standee + rim need on their own (measured from a floor at floorThickness). The
  // inner walls, slots and the standee spacing below are all sized from this so they never change
  // when the box stretches the tray taller — otherwise the slot sweep (and therefore the tray depth)
  // would grow with the box height and overflow the footprint the packer reserved.
  const naturalAxisZ = floorThickness + contentHalfHeight;
  const contentTopZ = naturalAxisZ + contentHalfHeight;
  const naturalTrayHeight = contentTopZ + rimHeight;
  // Outer tray height: raise the rim to the box/section height (targetHeight), then add any floor
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
  // the standee drops in. It plunges only as deep as the (tilted) figure reaches, plus a little so
  // the figure never bottoms out in the slot and rides high: if that reaches the (raised) floor the
  // figure is resting on it, so the slot cuts all the way through — extended a few mm below the floor
  // so the angled cut leaves no sliver; otherwise it stops just under the figure bottom.
  const slotBottomClearance = 0.5;
  const figureBottomZ = axisZ - figureHalfHeight - slotBottomClearance;
  const cutsThrough = figureBottomZ <= floorRefZ + 1e-6;
  const slotBottomZ = cutsThrough ? floorRefZ - 4 : figureBottomZ;
  // The slot's end is square to its lean, so overshoot the rim by enough that its low corner clears.
  const slotTopZ = innerWallTopZ + 1 + slotWidth;

  // --- Depth (Y): one slot per standee ---
  // Both inner walls tilt their slots the SAME direction, so the standees on the two walls run
  // parallel rather than converging like a herringbone — which lets the row pitch be set by the base
  // discs (the widest part) instead of the slot's sideways sweep, packing the tray much shorter than
  // opposed slots would. The right wall's slots are then offset from the left wall's by only as much
  // as opposing figures need to pass each other (they overlap in the middle cavity), not by half a
  // pitch: whatever the offset is, the right wall's last slot overhangs the left wall's by that much,
  // so a smaller offset is a shorter tray. The figures end up in uneven pairs rather than evenly
  // interleaved. The pitch is floored at twice that offset so a figure also clears the opposing
  // figure on its other side.
  const figureClearance = slotWidth + STANDEE_GAP; // min gap between opposing parallel figures' centres
  // That clearance is across the leaning figures, so it takes more room along the wall as they lean.
  const minFigureOffset = figureClearance / Math.cos(slotAngle);
  const slotPitch = Math.max(baseDiameter + 1, 2 * minFigureOffset);
  const staggerY = minFigureOffset;

  // End margins so the end standees still slide in past the end walls. Every slot leans the same
  // way — its top toward the front (y = 0) — so a standee always travels down its slot from the front
  // side of where it ends up seated. The two ends therefore need different room:
  //  - FRONT: as the base comes down over the rim it is still offset toward the front. The slot's
  //    sideways travel between the figure axis and the rim (topSweep) puts the disc centre that far
  //    forward, and the part of the disc dipping below the rim at that moment reaches a further
  //    baseRadius / cos(angle) — more than the bare radius, because the disc is still partly above
  //    the rim at its furthest point.
  //  - BACK: nothing approaches from that side, so the seated standee just has to fit — the base
  //    radius, or the leaning figure's own reach along the wall if that is larger.
  const figureReachY = (standeeWidth / 2) * Math.sin(slotAngle) + (standee.standeeThickness / 2) * Math.cos(slotAngle);
  const topSweep = (innerWallTopZ - axisZ) * Math.tan(slotAngle);
  const entryReach = topSweep + baseRadius / Math.cos(slotAngle);
  const frontMargin = wallThickness + clearance + Math.max(entryReach, figureReachY);
  const backMargin = wallThickness + clearance + Math.max(baseRadius, figureReachY);
  const naturalFirstSlotY = frontMargin;
  // The last slot is whichever wall's final slot reaches furthest: the left wall's sit on whole
  // pitches, the right wall's the stagger later. Measuring the slots that actually exist (rather
  // than assuming a full right wall) means an odd count doesn't reserve room for a missing standee.
  const slotSpan = Math.max(
    0,
    ...rowCounts.map((r) =>
      Math.max((r.leftCount - 1) * slotPitch, r.rightCount > 0 ? (r.rightCount - 1) * slotPitch + staggerY : 0)
    )
  );
  const autoDepth = frontMargin + slotSpan + backMargin;

  // --- Width (X) ---
  // The base is a thin vertical disc against the side wall, so the outer cavity only needs the base
  // thickness plus a little room (the tray's base gap). The figure points inward across the inner
  // wall into the middle cavity. A lying standee's full length is baseThickness + standeeHeight, and
  // it must fit across its outer cavity plus the middle cavity (opposing rows interleave there).
  const standeeLength = standee.baseThickness + standeeHeight;
  const outerCavityWidth = standee.baseThickness + getBaseGap(params);
  const middleCavityWidth = Math.max(standeeLength + clearance - outerCavityWidth, outerCavityWidth);

  // Rows repeat that unit across the width, separated by a single dividing wall (as thick as an outer
  // wall) that the bases on both sides sit against — one wall where separate trays would need two.
  const rowUnitWidth = outerCavityWidth * 2 + innerWallThickness * 2 + middleCavityWidth;
  const autoWidth = wallThickness * 2 + rowCount * rowUnitWidth + (rowCount - 1) * wallThickness;

  // --- Custom width / length override ---
  // Each override is a minimum; values below the auto size are ignored. Widening keeps the outer
  // walls and the outer cavities (where the bases sit) the size auto fit made them — only the MIDDLE
  // cavities grow (the extra is shared equally between the rows), so opposing standees spread apart.
  // Lengthening centres the slots along the depth. The outer-wall thickness never changes.
  const trayWidth = params.trayWidthOverride != null ? Math.max(params.trayWidthOverride, autoWidth) : autoWidth;
  const trayDepth = params.trayDepthOverride != null ? Math.max(params.trayDepthOverride, autoDepth) : autoDepth;
  const rowWidth = rowUnitWidth + (trayWidth - autoWidth) / rowCount;
  const rows: StandeeRowLayout[] = rowCounts.map((counts, i) => {
    const leftBoundX = wallThickness + i * (rowWidth + wallThickness);
    const rightBoundX = leftBoundX + rowWidth;
    return {
      ...counts,
      leftBoundX,
      rightBoundX,
      leftWallX: leftBoundX + outerCavityWidth,
      rightWallX: rightBoundX - outerCavityWidth - innerWallThickness
    };
  });
  const dividerXs = rows.slice(0, -1).map((r) => r.rightBoundX);
  // Centre the slot row along the (possibly longer) depth.
  const firstSlotY = naturalFirstSlotY + (trayDepth - autoDepth) / 2;

  return {
    trayWidth,
    trayDepth,
    trayHeight,
    floorRefZ,
    innerWallTopZ,
    rows,
    dividerXs,
    innerWallThickness,
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
    baseDiameter,
    slotAngle
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
  const { baseRadius, baseThickness, standeeWidth, standeeHeight, standeeThickness } = standee;

  const common = {
    z: layout.axisZ,
    baseRadius,
    baseThickness,
    figureWidth: standeeWidth,
    figureLength: standeeHeight,
    figureThickness: standeeThickness
  };

  const positions: StandeePosition[] = [];
  for (const row of layout.rows) {
    // Base disc sits flush against the wall bounding its side of the row (an outer wall or a divider).
    const leftX = row.leftBoundX + baseThickness / 2;
    const rightX = row.rightBoundX - baseThickness / 2;
    for (let i = 0; i < row.leftCount; i++) {
      positions.push({
        ...common,
        x: leftX,
        y: layout.firstSlotY + i * layout.slotPitch,
        figureDir: 1,
        tilt: layout.slotAngle
      });
    }
    for (let i = 0; i < row.rightCount; i++) {
      positions.push({
        ...common,
        x: rightX,
        y: layout.firstSlotY + layout.staggerY + i * layout.slotPitch,
        figureDir: -1,
        tilt: layout.slotAngle // same slant as the left wall (figureDir still points inward from the right)
      });
    }
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

  const { trayWidth, trayDepth, trayHeight, floorRefZ, innerWallTopZ } = layout;
  // The cavity (and the inner walls) start at floorRefZ, which is raised above the real floor when
  // the tray is stretched taller — leaving a solid spacer below so the standees sit near the rim.
  const cavityHeight = trayHeight - floorRefZ;
  const innerWallHeight = innerWallTopZ - floorRefZ;
  // The cavity spans the whole interior (only the outer walls stay solid). A custom width just makes
  // the middle cavity wider; a custom length just makes the cavity longer.
  const innerCavityDepth = trayDepth - wallThickness * 2;

  // === OPEN-TOP BOX (floor + 4 outer walls) ===
  const outerBox = translate(
    [trayWidth / 2, trayDepth / 2, trayHeight / 2],
    cuboid({ size: [trayWidth, trayDepth, trayHeight] })
  );
  const innerCavity = translate(
    [trayWidth / 2, trayDepth / 2, floorRefZ + cavityHeight / 2 + 0.1],
    cuboid({ size: [trayWidth - wallThickness * 2, innerCavityDepth, cavityHeight + 0.2] })
  );
  let tray = subtract(outerBox, innerCavity);

  // === TWO INNER WALLS PER ROW spanning the depth ===
  const makeInnerWall = (frontFaceX: number): Geom3 =>
    translate(
      [frontFaceX + innerWallThickness / 2, trayDepth / 2, floorRefZ + innerWallHeight / 2],
      cuboid({ size: [innerWallThickness, innerCavityDepth, innerWallHeight] })
    );

  // === ANGLED SLOTS ===
  // Slot: a channel that pierces the wall across its thickness (X) so the standee figure can pass
  // through, narrow along the wall (Y = figure thickness + clearance). It is rotated by the slot angle
  // about the X axis so it runs diagonally on the wall's face — from lower on the wall up to the
  // top while moving along the wall's length (Y). This tilts the standee toward an end wall so it
  // resists falling out, while its base still sits flush at the side. The two walls tilt in
  // opposite directions and the rows are staggered so opposing standees interleave.
  //
  // The tilt PIVOTS ABOUT THE FIGURE AXIS (axisZ), so the slot stays centred on
  // the standee's nominal Y at the figure's centre height — the cut reaches the right depth there
  // and the base stays aligned. The slot runs from slotBottomZ (the figure bottom, or below the
  // floor when it cuts all the way through) up to slotTopZ (above the rim, open for insertion).
  // Slots are cut from the walls ALONE and the walls are then unioned onto the box, so a full-depth
  // cut never touches the floor.
  const { axisZ, slotBottomZ, slotTopZ } = layout;
  const cos = Math.cos(layout.slotAngle);
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

  // Both walls tilt the same way, so the standees all slant in one direction; the right
  // row is just nudged by staggerY so its figures interleave with the left row's in the middle.
  const walls: Geom3[] = [];
  for (const row of layout.rows) {
    walls.push(buildWall(row.leftWallX, row.leftCount, layout.slotAngle, 0));
    walls.push(buildWall(row.rightWallX, row.rightCount, layout.slotAngle, layout.staggerY));
  }
  // Solid dividing walls between neighbouring rows, full height like the outer walls.
  for (const dividerX of layout.dividerXs) {
    walls.push(
      translate(
        [dividerX + wallThickness / 2, trayDepth / 2, floorRefZ + cavityHeight / 2],
        cuboid({ size: [wallThickness, innerCavityDepth, cavityHeight] })
      )
    );
  }
  tray = union(tray, ...walls);

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
