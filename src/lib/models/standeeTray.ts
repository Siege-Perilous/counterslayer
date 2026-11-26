import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';

const { cuboid } = jscad.primitives;
const { subtract, union } = jscad.booleans;
const { translate, rotateX, scale, mirrorY } = jscad.transforms;
const { vectorText } = jscad.text;

// Import types from project
import type { Standee } from '#lib/types/project.js';
import { createStrokedText } from './strokedText';

// Slot angle limits, in degrees. The slots lean by the tray's slotAngle so the
// standees resist being jostled out. A steeper lean lowers a figure that is wider than its base (so
// the tray can be shallower) at the cost of length; past 45 degrees the slots become a hard overhang
// to print and awkward to slide a standee into.
export const DEFAULT_SLOT_ANGLE_DEG = 20;
export const MIN_SLOT_ANGLE_DEG = 0;
export const MAX_SLOT_ANGLE_DEG = 45;

// Gap (mm) between a base and the slotted wall next to it; the base sits against
// the far wall. Trays saved before this was a setting have no baseGap and use LEGACY_BASE_GAP.
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

// Gap (mm) left between opposing standees where they pass each other, which is also the thickness of
// the material left between their two slots. Trays without the param use the default.
export const DEFAULT_STANDEE_GAP = 2;

function getStandeeGap(params: StandeeTrayParams): number {
  return Number.isFinite(params.standeeGap) ? Math.max(0, params.standeeGap as number) : DEFAULT_STANDEE_GAP;
}

// How much of the slot's 1mm of spare width (mm) a figure is assumed to be able to use to stand off
// the slot's lean while it is being inserted. Half of it, so a slightly thick figure still goes in.
const SLOT_PIVOT_SLACK = 0.5;

// A manually set slot wall height never goes below this (mm).
const MIN_SLOT_WALL_HEIGHT = 1;

export interface StandeeTrayParams {
  standeeId: string; // Reference to a Standee by ID
  count: number; // Total number of standees stored (split evenly across the rows)
  // Number of side-by-side rows. Each row has bases down both sides with the figures slotted between;
  // neighbouring rows share a single dividing wall that both rows' bases sit against.
  rows: number;
  wallThickness: number; // Outer wall + floor wall thickness
  innerWallThickness: number; // Thickness of the two slotted walls
  // Height of the slotted walls above the floor the standees rest on. null/missing = auto: as tall
  // as the tray's own walls. A value is capped at that height.
  slotWallHeight?: number | null;
  floorThickness: number;
  clearance: number; // Tolerance around standees
  rimHeight: number; // Extra height above the tallest content
  baseGap: number; // Gap between each base and the slotted wall next to it
  standeeGap?: number; // Gap between opposing standees (the material between their slots); default DEFAULT_STANDEE_GAP
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
  slotWallHeight: null,
  floorThickness: 2.0,
  clearance: 0.5,
  rimHeight: 2.0,
  baseGap: DEFAULT_BASE_GAP,
  standeeGap: DEFAULT_STANDEE_GAP,
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

// One slotted wall standing on the floor of a row.
interface StandeeSlotWall {
  x0: number; // X extent
  x1: number;
  cutLeft: boolean; // carries slots at the left-hand standees' positions
  cutRight: boolean; // carries slots at the right-hand standees' positions
}

// One row of the tray: bases down both sides, with a slotted wall just inside each to hold the figures.
interface StandeeRowLayout {
  leftBoundX: number; // inner face of the wall the left bases sit against (outer wall or divider)
  rightBoundX: number; // inner face of the wall the right bases sit against
  slotWalls: StandeeSlotWall[];
  leftCount: number; // standees whose bases sit on the left
  rightCount: number; // standees whose bases sit on the right
}

// Shared layout math so dimensions and geometry stay in sync.
interface StandeeLayout {
  trayWidth: number;
  trayDepth: number;
  trayHeight: number;
  floorRefZ: number; // top of the (raised) solid floor the standees rest on
  innerWallTopZ: number; // top of the slotted walls, which run up from floorRefZ
  rows: StandeeRowLayout[];
  dividerXs: number[]; // front face X of each dividing wall between neighbouring rows
  firstSlotY: number; // Y of the first slot center
  slotPitch: number;
  staggerY: number; // Y offset applied to the right-hand standees' slots
  slotWidth: number;
  // Slot vertical geometry (Z)
  axisZ: number; // figure centre height — the slot pivots about this so the base stays aligned
  slotBottomZ: number; // lowest Z the slot reaches (below the floor when it cuts all the way through)
  slotTopZ: number; // top of the slot (above the rim so it is open for inserting the standee)
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
  // Within a row the standees split across the two sides (left gets the extra one for odd counts).
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
  // centre block, slots and the standee spacing below are all sized from this so they never change
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
  // floor, centre block, slots and figures — shifts up by this lift; the cavity above stays the
  // natural size and the slot spacing is unchanged (it uses differences that cancel the lift).
  const lift = trayHeight - naturalTrayHeight;
  const floorRefZ = floorThickness + lift; // top of the raised solid floor the standees rest on
  const axisZ = naturalAxisZ + lift;
  const rimZ = naturalTrayHeight + lift; // top of the outer walls' natural height
  // The slotted walls run up to the rim unless the tray sets a lower height. Lower walls still cradle
  // the bottom of each leaning figure in their slots while the rest of the standee stands clear and
  // is easy to grab.
  const fullSlotWallHeight = rimZ - floorRefZ;
  const slotWallHeight =
    params.slotWallHeight != null && Number.isFinite(params.slotWallHeight)
      ? Math.min(fullSlotWallHeight, Math.max(MIN_SLOT_WALL_HEIGHT, params.slotWallHeight))
      : fullSlotWallHeight;
  const innerWallTopZ = floorRefZ + slotWallHeight;

  // --- Slot vertical extent (Z) ---
  // The slot holds the figure (centred on the axis) and stays open at the top of the slotted wall so
  // the standee drops in. It plunges only as deep as the (tilted) figure reaches, plus a little so
  // the figure never bottoms out in the slot and rides high: if that reaches the (raised) floor the
  // figure is resting on it, so the slot cuts all the way through — extended a few mm below the floor
  // so the angled cut leaves no sliver; otherwise it stops just under the figure bottom.
  const slotBottomClearance = 0.5;
  const figureBottomZ = axisZ - figureHalfHeight - slotBottomClearance;
  const cutsThrough = figureBottomZ <= floorRefZ + 1e-6;
  const slotBottomZ = cutsThrough ? floorRefZ - 4 : figureBottomZ;
  // The slot's end is square to its lean, so overshoot the wall top by enough that its low corner clears.
  const slotTopZ = innerWallTopZ + 1 + slotWidth;

  // --- Depth (Y): one slot per standee ---
  // The slots for both sides tilt the SAME direction, so the standees from the two sides run
  // parallel rather than converging like a herringbone — which lets the row pitch be set by the base
  // discs (the widest part) instead of the slot's sideways sweep, packing the tray much shorter than
  // opposed slots would. The right side's slots are then offset from the left side's by only as much
  // as opposing figures need to pass each other (they overlap in the middle of the row), not by half a
  // pitch: whatever the offset is, the right side's last slot overhangs the left side's by that much,
  // so a smaller offset is a shorter tray. The figures end up in uneven pairs rather than evenly
  // interleaved. The pitch is floored at twice that offset so a figure also clears the opposing
  // figure on its other side.
  // The tray's standee gap is the space between those passing figures — and so the thickness of the
  // material left between their two slots. A wider gap is sturdier for a slightly longer tray.
  const figureClearance = slotWidth + getStandeeGap(params); // between opposing parallel figures' centres
  // That clearance is across the leaning figures, so it takes more room along the wall as they lean.
  const minFigureOffset = figureClearance / Math.cos(slotAngle);
  const slotPitch = Math.max(baseDiameter + 1, 2 * minFigureOffset);
  const staggerY = minFigureOffset;

  // End margins so the end standees still slide in past the end walls. Every slot leans the same
  // way — its top toward the front (y = 0) — so a standee always travels down its slot from the front
  // side of where it ends up seated. The two ends therefore need different room:
  //  - FRONT: the figure's bottom edge meets its slot at the slotted wall's top, and the standee
  //    then works its way down to seated. It does not have to be at the full lean the moment it
  //    enters: the slot is wider than the figure, so with little of the figure engaged it can stand
  //    nearer upright and tip over into the lean as it goes deeper. It pivots about the slot mouth,
  //    so the nearer the wall top is to the disc's centre height the less the disc swings forward.
  //    The margin is the furthest forward any part of the disc below the rim gets on the way down.
  //  - BACK: nothing approaches from that side, so the seated standee just has to fit — the base
  //    radius, or the leaning figure's own reach along the wall if that is larger.
  const figureReachY = (standeeWidth / 2) * Math.sin(slotAngle) + (standee.standeeThickness / 2) * Math.cos(slotAngle);
  const cosA = Math.cos(slotAngle);
  const sinA = Math.sin(slotAngle);
  const rimAboveAxis = rimZ - axisZ;
  const mouthAlongSlot = (innerWallTopZ - axisZ) / cosA; // slot mouth, measured up the slot from the axis
  const engagedMax = Math.max(0, standeeWidth / 2 + mouthAlongSlot); // figure in its slot when seated
  let entryReach = baseRadius; // seated
  const ENTRY_STEPS = 60;
  for (let step = 0; step < ENTRY_STEPS; step++) {
    const engaged = (engagedMax * step) / ENTRY_STEPS; // length of figure below the slot mouth
    // How far short of the full lean the figure can stand with this much of it in the slot.
    const play = engaged > SLOT_PIVOT_SLACK ? Math.asin(SLOT_PIVOT_SLACK / engaged) : Math.PI / 2;
    const lean = Math.max(0, slotAngle - play);
    const aboveMouth = standeeWidth / 2 - engaged; // disc centre, measured up the figure from the mouth
    const forward = mouthAlongSlot * sinA + aboveMouth * Math.sin(lean);
    const aboveRim = mouthAlongSlot * cosA + aboveMouth * Math.cos(lean) - rimAboveAxis;
    if (aboveRim >= baseRadius) continue; // whole disc still above the rim
    const halfChord = aboveRim <= 0 ? baseRadius : Math.sqrt(baseRadius ** 2 - aboveRim ** 2);
    entryReach = Math.max(entryReach, forward + halfChord);
  }
  const frontMargin = wallThickness + clearance + Math.max(entryReach, figureReachY);
  const backMargin = wallThickness + clearance + Math.max(baseRadius, figureReachY);
  const naturalFirstSlotY = frontMargin;
  // The last slot is whichever side's final slot reaches furthest: the left side's sit on whole
  // pitches, the right side's the stagger later. Measuring the slots that actually exist (rather
  // than assuming a full right side) means an odd count doesn't reserve room for a missing standee.
  const slotSpan = Math.max(
    0,
    ...rowCounts.map((r) =>
      Math.max((r.leftCount - 1) * slotPitch, r.rightCount > 0 ? (r.rightCount - 1) * slotPitch + staggerY : 0)
    )
  );
  const autoDepth = frontMargin + slotSpan + backMargin;

  // --- Width (X) ---
  // The base is a thin vertical disc against the side wall; its slotted wall stands the tray's base
  // gap further in. The figure points inward through that wall and across the row. Each slotted wall
  // also carries channels for the OPPOSING figures, so a tip is free to pass through the far slotted
  // wall and only has to stop `clearance` short of the bases on the other side. The row is therefore
  // one lying standee (baseThickness + standeeHeight) plus the opposing base, whatever the base gap:
  // a larger gap just moves the two slotted walls toward the middle. Only when the gap is so large
  // that the walls would run into each other does the row grow to fit them.
  const standeeLength = standee.baseThickness + standeeHeight;
  const outerCavityWidth = standee.baseThickness + getBaseGap(params);
  const rowUnitWidth = Math.max(
    standeeLength + clearance + standee.baseThickness,
    (outerCavityWidth + innerWallThickness) * 2
  );
  // Rows repeat that unit across the width, separated by a single dividing wall (as thick as an outer
  // wall) that the bases on both sides sit against — one wall where separate trays would need two.
  const autoWidth = wallThickness * 2 + rowCount * rowUnitWidth + (rowCount - 1) * wallThickness;

  // --- Custom width / length override ---
  // Each override is a minimum; values below the auto size are ignored. Widening keeps the outer
  // walls the size auto fit made them — the rows grow (the extra is shared equally between them), so
  // opposing standees spread apart. The slotted walls stay the base gap from their bases.
  // Lengthening centres the slots along the depth. The outer-wall thickness never changes.
  const trayWidth = params.trayWidthOverride != null ? Math.max(params.trayWidthOverride, autoWidth) : autoWidth;
  const trayDepth = params.trayDepthOverride != null ? Math.max(params.trayDepthOverride, autoDepth) : autoDepth;
  const rowWidth = rowUnitWidth + (trayWidth - autoWidth) / rowCount;
  // A figure's tip (plus clearance) reaches this far from the wall its base sits against. The far
  // slotted wall only needs channels if the tips get that far — a custom width can spread the walls
  // far enough apart that they don't.
  const tipsReachFarWall = standeeLength + clearance > rowWidth - outerCavityWidth - innerWallThickness + 1e-6;
  const rows: StandeeRowLayout[] = rowCounts.map((counts, i) => {
    const leftBoundX = wallThickness + i * (rowWidth + wallThickness);
    const rightBoundX = leftBoundX + rowWidth;
    const leftWallX = leftBoundX + outerCavityWidth;
    const rightWallX = rightBoundX - outerCavityWidth - innerWallThickness;
    const slotWalls: StandeeSlotWall[] = [
      { x0: leftWallX, x1: leftWallX + innerWallThickness, cutLeft: true, cutRight: tipsReachFarWall },
      { x0: rightWallX, x1: rightWallX + innerWallThickness, cutLeft: tipsReachFarWall, cutRight: true }
    ];
    return { ...counts, leftBoundX, rightBoundX, slotWalls };
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
    firstSlotY,
    slotPitch,
    staggerY,
    slotWidth,
    axisZ,
    slotBottomZ,
    slotTopZ,
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
        tilt: layout.slotAngle // same slant as the left side (figureDir still points inward from the right)
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
  const { wallThickness } = params;
  const standee = getStandee(params.standeeId, standees);
  const layout = computeLayout(params, standee, targetHeight, floorSpacerHeight);

  const { trayWidth, trayDepth, trayHeight, floorRefZ, innerWallTopZ } = layout;
  // The cavity (and the slotted walls) start at floorRefZ, which is raised above the real floor when
  // the tray is stretched taller — leaving a solid spacer below so the standees sit near the rim.
  const cavityHeight = trayHeight - floorRefZ;
  const slotWallHeight = innerWallTopZ - floorRefZ;
  // The cavity spans the whole interior (only the outer walls stay solid); a custom length just makes
  // it longer.
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

  // === ANGLED SLOTS ===
  // Each row has two thin slotted walls running the full depth, one just inside each side's bases. A
  // slot is cut right across a wall (X) for a figure to pass through, narrow along it (Y = figure thickness + clearance), and rotated by the slot angle about the X axis
  // so it leans along the depth — tilting the standee toward an end wall so it resists falling out,
  // while its base still sits flush at the side. All slots lean the same way and the right-hand
  // standees' slots are staggered so opposing figures pass each other. A wall also gets the same cut at
  // the opposing figures' positions when their tips reach it.
  //
  // The tilt PIVOTS ABOUT THE FIGURE AXIS (axisZ), so the slot stays centred on
  // the standee's nominal Y at the figure's centre height — the cut reaches the right depth there
  // and the base stays aligned. The slot runs from slotBottomZ (the figure bottom, or below the
  // floor when it cuts all the way through) up to slotTopZ (above the wall, open for insertion).
  // Slots are cut from the walls ALONE and the walls are then unioned onto the box, so a full-depth
  // cut never touches the floor.
  const { axisZ, slotBottomZ, slotTopZ } = layout;
  const cos = Math.cos(layout.slotAngle);
  const lengthBelowAxis = (axisZ - slotBottomZ) / cos; // along the tilted bar, below the pivot
  const lengthAboveAxis = (slotTopZ - axisZ) / cos; // above the pivot
  const barLen = lengthBelowAxis + lengthAboveAxis;
  const barZShift = barLen / 2 - lengthBelowAxis; // moves the pivot to the bar's origin
  const makeSlot = (centerX: number, lengthX: number, centerY: number): Geom3 => {
    let s: Geom3 = cuboid({ size: [lengthX, layout.slotWidth, barLen] });
    s = translate([0, 0, barZShift], s); // figure axis now at the origin
    s = rotateX(layout.slotAngle, s); // pivot the tilt about the figure axis
    s = translate([centerX, centerY, axisZ], s);
    return s;
  };

  const walls: Geom3[] = [];
  for (const row of layout.rows) {
    for (const wall of row.slotWalls) {
      const wallWidth = wall.x1 - wall.x0;
      const centerX = wall.x0 + wallWidth / 2;
      let solid: Geom3 = translate(
        [centerX, trayDepth / 2, floorRefZ + slotWallHeight / 2],
        cuboid({ size: [wallWidth, innerCavityDepth, slotWallHeight] })
      );
      const slotLength = wallWidth + 10; // generous so the angled cut always pierces fully
      const slots: Geom3[] = [];
      if (wall.cutLeft) {
        for (let i = 0; i < row.leftCount; i++) {
          slots.push(makeSlot(centerX, slotLength, layout.firstSlotY + i * layout.slotPitch));
        }
      }
      if (wall.cutRight) {
        for (let i = 0; i < row.rightCount; i++) {
          slots.push(makeSlot(centerX, slotLength, layout.firstSlotY + layout.staggerY + i * layout.slotPitch));
        }
      }
      if (slots.length > 0) solid = subtract(solid, ...slots);
      walls.push(solid);
    }
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
      const textShapes = createStrokedText(textSegments, strokeWidth, textDepth + 0.1);

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
