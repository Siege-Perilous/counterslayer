import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';
import type { Box, LidParams } from '$lib/types/project';
import { arrangeTrays, getBoxInteriorDimensions, calculateMinimumBoxDimensions } from './box';

const { cuboid, roundedCuboid, cylinder } = jscad.primitives;
const { subtract, union } = jscad.booleans;
const { translate, rotateX, rotateY, rotateZ, scale, mirrorX } = jscad.transforms;
const { hull } = jscad.hulls;
const { vectorText } = jscad.text;
const { path2 } = jscad.geometries;
const { expand } = jscad.expansions;
const { extrudeLinear } = jscad.extrusions;

export const defaultLidParams: LidParams = {
	thickness: 2.0,
	railHeight: 6.0,
	railWidth: 0,
	railInset: 0,
	ledgeHeight: 0,
	fingerNotchRadius: 0,
	fingerNotchDepth: 0,
	snapEnabled: true,
	snapBumpHeight: 0.4,
	snapBumpWidth: 4.0,
	railEngagement: 0.5,
	showName: true
};

/**
 * Box with recess cut from OUTSIDE of walls at top.
 * Interior height = tray height exactly.
 * Each tray gets its own form-fitting pocket.
 *
 * Cross-section:
 *        ___     ___
 *       |   |   |   |  <- inner wall (full height)
 *    ___|   |___|   |___  <- outer wall cut short (recess)
 *   |                   |
 *   |   [tray pockets]  |
 *   |___________________|  <- floor
 *
 *   The recess is on the OUTSIDE of the wall.
 */
export function createBoxWithLidGrooves(box: Box): Geom3 | null {
	if (box.trays.length === 0) return null;

	const placements = arrangeTrays(box.trays);
	const interior = getBoxInteriorDimensions(placements, box.tolerance);

	if (interior.width <= 0 || interior.depth <= 0 || interior.height <= 0) {
		throw new Error(
			`Box "${box.name}": Invalid dimensions. Add counter stacks to trays.`
		);
	}

	const wall = box.wallThickness;
	const floor = box.floorThickness;
	const tolerance = box.tolerance;
	const recessDepth = wall; // How deep the lid lip goes

	// Calculate minimum (auto) dimensions
	const minimums = calculateMinimumBoxDimensions(box);

	// Box exterior dimensions (use custom if set, otherwise auto)
	const extWidth = box.customWidth ?? minimums.minWidth;
	const extDepth = box.customDepth ?? minimums.minDepth;
	const extHeight = box.customHeight ?? minimums.minHeight;

	// Calculate gaps for fill logic
	const widthGap = extWidth - minimums.minWidth;  // Extra space at east (high X)
	const depthGap = extDepth - minimums.minDepth;  // Extra space at north (high Y)
	const heightGap = extHeight - minimums.minHeight;  // Extra space above trays

	// Whether to fill gaps with solid material
	const fillSolid = box.fillSolidEmpty ?? false;

	// Inner wall dimensions (thinner wall that goes full height)
	const innerWallThickness = wall / 2;

	// 1. Create full box with thick walls
	const outerBox = cuboid({
		size: [extWidth, extDepth, extHeight],
		center: [extWidth / 2, extDepth / 2, extHeight / 2]
	});

	// 2. Create individual tray pockets instead of one big cavity
	// Each tray gets its own form-fitting pocket with tolerance
	const trayCavities: Geom3[] = [];
	const fillCells: Geom3[] = [];

	// Find the widest tray to calculate fill areas
	const maxTrayWidth = Math.max(...placements.map((p) => p.dimensions.width));

	// Actual interior height (accounts for custom height)
	const actualInteriorHeight = extHeight - floor;

	for (const placement of placements) {
		const pocketWidth = placement.dimensions.width + tolerance * 2;
		const pocketDepth = placement.dimensions.depth + tolerance * 2;
		// All pockets go to full interior height so trays sit flush at top
		const pocketHeight = actualInteriorHeight + 1;

		// Position pocket: wall offset plus the tray's position
		// Note: tolerance is already included in interior.width/depth, don't add it again here
		const pocketX = wall + placement.x;
		const pocketY = wall + placement.y;

		const cavity = cuboid({
			size: [pocketWidth, pocketDepth, pocketHeight],
			center: [
				pocketX + pocketWidth / 2,
				pocketY + pocketDepth / 2,
				floor + pocketHeight / 2
			]
		});
		trayCavities.push(cavity);

		// 2b. Create fill cell only if this tray ends the row AND there's space remaining
		// With bin-packing, we need to check if space to the right is actually empty
		const trayEndX = placement.x + placement.dimensions.width;
		const spaceRemaining = maxTrayWidth - trayEndX;

		// Check if any other tray occupies space to the right in the same row
		const hasNeighborToRight = placements.some(other =>
			other !== placement &&
			other.y === placement.y &&  // Same row (same Y position)
			other.x >= trayEndX  // To the right of this tray
		);

		if (spaceRemaining > wall && !hasNeighborToRight) {
			// Fill cell: X from (tray pocket end + wall) to (where widest pocket ends)
			const fillWidth = spaceRemaining - wall;
			const fillX = pocketX + pocketWidth + wall;
			// Inset Y to leave wall between fill cell and adjacent tray pocket
			const fillY = pocketY + wall;
			const fillDepth = pocketDepth - wall;
			const fillHeight = actualInteriorHeight + 1;

			const fillCell = translate(
				[fillX, fillY, floor],
				cuboid({
					size: [fillWidth, fillDepth, fillHeight],
					center: [fillWidth / 2, fillDepth / 2, fillHeight / 2]
				})
			);
			fillCells.push(fillCell);
		}
	}

	// 2c. Create gap fills for custom box dimensions
	// Trays are anchored to origin corner - gaps appear at east (high X) and north (high Y)
	const gapFills: Geom3[] = [];

	// The tray area ends at the auto-calculated box interior + wall
	const trayAreaEndX = minimums.minWidth - wall;  // Inner edge of east wall for auto-sized box
	const trayAreaEndY = minimums.minDepth - wall;  // Inner edge of north wall for auto-sized box
	const trayAreaHeight = interior.height;

	if (fillSolid) {
		// SOLID FILL MODE: Fill width/depth gaps with solid material
		// Height gaps are handled by floor spacers in trays, not ceiling fills

		// East gap (width gap at high X)
		if (widthGap > 0) {
			const eastFill = cuboid({
				size: [widthGap, extDepth - wall * 2, actualInteriorHeight],
				center: [
					trayAreaEndX + widthGap / 2,
					extDepth / 2,
					floor + actualInteriorHeight / 2
				]
			});
			gapFills.push(eastFill);
		}

		// North gap (depth gap at high Y) - don't overlap with east fill
		if (depthGap > 0) {
			const northFill = cuboid({
				size: [minimums.minWidth - wall * 2, depthGap, actualInteriorHeight],
				center: [
					(minimums.minWidth - wall * 2) / 2 + wall,
					trayAreaEndY + depthGap / 2,
					floor + actualInteriorHeight / 2
				]
			});
			gapFills.push(northFill);
		}
	} else {
		// MINIMAL WALLS MODE: Just add thin walls to keep trays snug

		// East wall (keeps trays from sliding toward high X)
		if (widthGap > wall) {
			const eastWall = cuboid({
				size: [wall, interior.depth, actualInteriorHeight],
				center: [
					wall + interior.width + wall / 2,  // Just past tray area
					wall + interior.depth / 2,
					floor + actualInteriorHeight / 2
				]
			});
			gapFills.push(eastWall);
		}

		// North wall (keeps trays from sliding toward high Y)
		if (depthGap > wall) {
			const northWall = cuboid({
				size: [interior.width, wall, actualInteriorHeight],
				center: [
					wall + interior.width / 2,
					wall + interior.depth + wall / 2,  // Just past tray area
					floor + actualInteriorHeight / 2
				]
			});
			gapFills.push(northWall);
		}
	}

	// 3. Cut recess on outside of walls at top
	// This removes the outer portion of the wall, leaving inner portion
	const recessWidth = extWidth + 1;
	const recessDepthY = extDepth + 1;
	const recessHeight = recessDepth;

	const outerRecess = cuboid({
		size: [recessWidth, recessDepthY, recessHeight],
		center: [extWidth / 2, extDepth / 2, extHeight - recessHeight / 2]
	});

	// Keep the inner wall portion (don't cut this part)
	// Position at origin corner where trays are anchored
	const innerWallKeepWidth = interior.width + innerWallThickness * 2;
	const innerWallKeepDepth = interior.depth + innerWallThickness * 2;
	const innerWallKeep = cuboid({
		size: [innerWallKeepWidth, innerWallKeepDepth, recessHeight + 1],
		center: [
			wall - innerWallThickness + innerWallKeepWidth / 2,
			wall - innerWallThickness + innerWallKeepDepth / 2,
			extHeight - recessHeight / 2
		]
	});

	// For sliding lid, extend the entry wall to full height (no recess on entry side)
	// Lid slides along the LONGEST dimension for better ergonomics
	const snapEnabled = box.lidParams?.snapEnabled ?? true;
	const slidesAlongX = extWidth > extDepth; // true if box is longer in X

	let recess;
	if (snapEnabled) {
		// Keep entry wall full height by not cutting recess there
		// Entry is at low X if sliding along X, low Y if sliding along Y
		const entryWallKeep = slidesAlongX
			? cuboid({
				size: [wall, extDepth + 1, recessHeight + 1],
				center: [wall / 2, extDepth / 2, extHeight - recessHeight / 2]
			})
			: cuboid({
				size: [extWidth + 1, wall, recessHeight + 1],
				center: [extWidth / 2, wall / 2, extHeight - recessHeight / 2]
			});
		recess = subtract(outerRecess, innerWallKeep, entryWallKeep);
	} else {
		recess = subtract(outerRecess, innerWallKeep);
	}

	// When fillSolid is true, don't subtract fillCells - leave them as solid material
	let result = fillSolid
		? subtract(outerBox, ...trayCavities, recess)
		: subtract(outerBox, ...trayCavities, ...fillCells, recess);

	// Add gap fills (solid pieces for custom box dimensions)
	if (gapFills.length > 0) {
		result = union(result, ...gapFills);
	}

	// 4. Add snap grooves if enabled
	// These are grooves cut into the outer surface of the inner wall
	// where the lid's rails slide into
	// Using simple rectangular grooves - the small overhang (~0.8mm) is acceptable
	const snapBumpHeight = box.lidParams?.snapBumpHeight ?? 0.4;
	const snapBumpWidth = box.lidParams?.snapBumpWidth ?? 4.0;
	const railEngagement = box.lidParams?.railEngagement ?? 0.5;

	if (snapEnabled && snapBumpHeight > 0) {
		// Groove depth must accommodate the rail which bridges clearance gap + extends into groove
		const clearance = 0.3; // Same as lid cavity clearance
		const grooveDepth = clearance + snapBumpHeight + 0.1;
		// Groove height uses railEngagement fraction of lip height (wall) for stronger hold
		const lipHeight = wall;
		const grooveHeight = lipHeight * railEngagement + 0.2;

		// Position groove at BOTTOM of recess area (more material above for strength)
		const notchZ = extHeight - wall + grooveHeight / 2;

		// Inner wall dimensions (same as innerWallKeep)
		const innerWallWidth = interior.width + innerWallThickness * 2;
		const innerWallDepth = interior.depth + innerWallThickness * 2;

		const grooves: Geom3[] = [];

		if (slidesAlongX) {
			// Lid slides along X: grooves on front, back, and right (NOT left = entry)
			// Right groove - runs full depth along right inner wall (exit side)
			const rightGroove = translate(
				[extWidth - wall / 2 - grooveDepth / 2, extDepth / 2, notchZ],
				cuboid({
					size: [grooveDepth, innerWallDepth, grooveHeight],
					center: [0, 0, 0]
				})
			);
			grooves.push(rightGroove);

			// Front and back grooves - run from entry to exit along X
			// Start at X = wall (not wall/2) to avoid cutting into entry wall area
			const sideGrooveLength = innerWallWidth - grooveDepth - wall / 2;
			const frontGroove = translate(
				[wall + sideGrooveLength / 2, wall / 2 + grooveDepth / 2, notchZ],
				cuboid({
					size: [sideGrooveLength, grooveDepth, grooveHeight],
					center: [0, 0, 0]
				})
			);
			grooves.push(frontGroove);

			const backGroove = translate(
				[wall + sideGrooveLength / 2, extDepth - wall / 2 - grooveDepth / 2, notchZ],
				cuboid({
					size: [sideGrooveLength, grooveDepth, grooveHeight],
					center: [0, 0, 0]
				})
			);
			grooves.push(backGroove);
		} else {
			// Lid slides along Y: grooves on left, right, and back (NOT front = entry)
			// Back groove - runs full width along back inner wall (exit side)
			const backGroove = translate(
				[extWidth / 2, extDepth - wall / 2 - grooveDepth / 2, notchZ],
				cuboid({
					size: [innerWallWidth, grooveDepth, grooveHeight],
					center: [0, 0, 0]
				})
			);
			grooves.push(backGroove);

			// Left and right grooves - run from entry to exit along Y
			// Start at Y = wall (not wall/2) to avoid cutting into entry wall area
			const sideGrooveLength = innerWallDepth - grooveDepth - wall / 2;
			const leftGroove = translate(
				[wall / 2 + grooveDepth / 2, wall + sideGrooveLength / 2, notchZ],
				cuboid({
					size: [grooveDepth, sideGrooveLength, grooveHeight],
					center: [0, 0, 0]
				})
			);
			grooves.push(leftGroove);

			const rightGroove = translate(
				[extWidth - wall / 2 - grooveDepth / 2, wall + sideGrooveLength / 2, notchZ],
				cuboid({
					size: [grooveDepth, sideGrooveLength, grooveHeight],
					center: [0, 0, 0]
				})
			);
			grooves.push(rightGroove);
		}

		result = subtract(result, ...grooves);

		// Add supports to eliminate groove ceiling overhang (makes printing without supports possible)
		// CHAMFER TECHNIQUE: Creates 45° chamfers for self-supporting overhangs
		const grooveTopZ = notchZ + grooveHeight / 2;
		const chamferSize = grooveDepth * Math.sqrt(2);

		if (slidesAlongX) {
			// Supports for grooves on front, back, right (slides along X)
			const sideGrooveLength = innerWallWidth - grooveDepth - wall / 2;

			const rightBlock = cuboid({
				size: [grooveDepth, innerWallDepth, grooveDepth],
				center: [extWidth - wall / 2 - grooveDepth / 2, extDepth / 2, grooveTopZ - grooveDepth / 2]
			});
			const frontBlock = cuboid({
				size: [sideGrooveLength + grooveDepth, grooveDepth, grooveDepth],
				center: [wall + (sideGrooveLength + grooveDepth) / 2, wall / 2 + grooveDepth / 2, grooveTopZ - grooveDepth / 2]
			});
			const backBlock = cuboid({
				size: [sideGrooveLength + grooveDepth, grooveDepth, grooveDepth],
				center: [wall + (sideGrooveLength + grooveDepth) / 2, extDepth - wall / 2 - grooveDepth / 2, grooveTopZ - grooveDepth / 2]
			});

			let supportBlock = union(rightBlock, frontBlock, backBlock);

			const rightCut = translate(
				[extWidth - wall / 2, extDepth / 2, grooveTopZ - grooveDepth],
				rotateY(Math.PI / 4, cuboid({
					size: [chamferSize, innerWallDepth + grooveDepth * 2, chamferSize],
					center: [0, 0, 0]
				}))
			);
			const frontCut = translate(
				[wall + (sideGrooveLength + grooveDepth) / 2, wall / 2, grooveTopZ - grooveDepth],
				rotateX(-Math.PI / 4, cuboid({
					size: [sideGrooveLength + grooveDepth * 2, chamferSize, chamferSize],
					center: [0, 0, 0]
				}))
			);
			const backCut = translate(
				[wall + (sideGrooveLength + grooveDepth) / 2, extDepth - wall / 2, grooveTopZ - grooveDepth],
				rotateX(Math.PI / 4, cuboid({
					size: [sideGrooveLength + grooveDepth * 2, chamferSize, chamferSize],
					center: [0, 0, 0]
				}))
			);

			supportBlock = subtract(supportBlock, rightCut, frontCut, backCut);
			result = union(result, supportBlock);
		} else {
			// Supports for grooves on left, right, back (slides along Y)
			const sideGrooveLength = innerWallDepth - grooveDepth - wall / 2;

			const backBlock = cuboid({
				size: [innerWallWidth, grooveDepth, grooveDepth],
				center: [extWidth / 2, extDepth - wall / 2 - grooveDepth / 2, grooveTopZ - grooveDepth / 2]
			});
			const leftBlock = cuboid({
				size: [grooveDepth, sideGrooveLength + grooveDepth, grooveDepth],
				center: [wall / 2 + grooveDepth / 2, wall + (sideGrooveLength + grooveDepth) / 2, grooveTopZ - grooveDepth / 2]
			});
			const rightBlock = cuboid({
				size: [grooveDepth, sideGrooveLength + grooveDepth, grooveDepth],
				center: [extWidth - wall / 2 - grooveDepth / 2, wall + (sideGrooveLength + grooveDepth) / 2, grooveTopZ - grooveDepth / 2]
			});

			let supportBlock = union(backBlock, leftBlock, rightBlock);

			const backCut = translate(
				[extWidth / 2, extDepth - wall / 2, grooveTopZ - grooveDepth],
				rotateX(Math.PI / 4, cuboid({
					size: [innerWallWidth + grooveDepth * 2, chamferSize, chamferSize],
					center: [0, 0, 0]
				}))
			);
			const leftCut = translate(
				[wall / 2, wall + (sideGrooveLength + grooveDepth) / 2, grooveTopZ - grooveDepth],
				rotateY(-Math.PI / 4, cuboid({
					size: [chamferSize, sideGrooveLength + grooveDepth * 2, chamferSize],
					center: [0, 0, 0]
				}))
			);
			const rightCut = translate(
				[extWidth - wall / 2, wall + (sideGrooveLength + grooveDepth) / 2, grooveTopZ - grooveDepth],
				rotateY(Math.PI / 4, cuboid({
					size: [chamferSize, sideGrooveLength + grooveDepth * 2, chamferSize],
					center: [0, 0, 0]
				}))
			);

			supportBlock = subtract(supportBlock, backCut, leftCut, rightCut);
			result = union(result, supportBlock);
		}

		// Add detent notch on entry wall - lid bump clicks into this
		const detentRadius = snapBumpHeight + 0.1;
		const detentLength = snapBumpWidth * 2;
		const detentNotch = slidesAlongX
			? translate(
				[wall / 2, extDepth / 2, extHeight],
				rotateX(Math.PI / 2, cylinder({
					radius: detentRadius,
					height: detentLength,
					segments: 32,
					center: [0, 0, 0]
				}))
			)
			: translate(
				[extWidth / 2, wall / 2, extHeight],
				rotateY(Math.PI / 2, cylinder({
					radius: detentRadius,
					height: detentLength,
					segments: 32,
					center: [0, 0, 0]
				}))
			);
		result = subtract(result, detentNotch);

		// Add grip lines near exit side (opposite entry)
		const gripLineDepth = 0.3;
		const gripLineWidth = 0.8;
		const gripLineSpacing = 2.5;
		const numGripLines = 5;
		const totalGripWidth = (numGripLines - 1) * gripLineSpacing;

		if (slidesAlongX) {
			// Grip lines on front/back walls near exit (high X)
			const gripStartX = extWidth - wall - 1 - totalGripWidth;
			for (let i = 0; i < numGripLines; i++) {
				const lineX = gripStartX + i * gripLineSpacing;
				const frontGrip = cuboid({
					size: [gripLineWidth, gripLineDepth, extHeight + 1],
					center: [lineX, gripLineDepth / 2, extHeight / 2]
				});
				const backGrip = cuboid({
					size: [gripLineWidth, gripLineDepth, extHeight + 1],
					center: [lineX, extDepth - gripLineDepth / 2, extHeight / 2]
				});
				result = subtract(result, frontGrip, backGrip);
			}
		} else {
			// Grip lines on left/right walls near exit (high Y)
			const gripStartY = extDepth - wall - 1 - totalGripWidth;
			for (let i = 0; i < numGripLines; i++) {
				const lineY = gripStartY + i * gripLineSpacing;
				const leftGrip = cuboid({
					size: [gripLineDepth, gripLineWidth, extHeight + 1],
					center: [gripLineDepth / 2, lineY, extHeight / 2]
				});
				const rightGrip = cuboid({
					size: [gripLineDepth, gripLineWidth, extHeight + 1],
					center: [extWidth - gripLineDepth / 2, lineY, extHeight / 2]
				});
				result = subtract(result, leftGrip, rightGrip);
			}
		}
	}

	// 5. Add poke holes at the center of each tray position for easy removal
	const POKE_HOLE_DIAMETER = 20;
	for (const p of placements) {
		// Calculate center of tray in box coordinates
		const centerX = wall + tolerance + p.x + p.dimensions.width / 2;
		const centerY = wall + tolerance + p.y + p.dimensions.depth / 2;

		const hole = translate(
			[centerX, centerY, floor / 2],
			cylinder({
				radius: POKE_HOLE_DIAMETER / 2,
				height: floor + 1,
				segments: 32
			})
		);
		result = subtract(result, hole);
	}

	return result;
}

/**
 * Create a snap bump - a half-cylinder that protrudes from the lid wall.
 * The bump has a gentle ramp on entry side for easier snapping.
 */
function createSnapBump(
	bumpHeight: number,
	bumpWidth: number,
	lipHeight: number
): Geom3 {
	// Half-cylinder bump rotated to lie along the wall
	// Height of cylinder = width of bump along the wall
	const bump = cylinder({
		radius: bumpHeight,
		height: bumpWidth,
		segments: 16
	});
	// Rotate so cylinder axis is along X (bump protrudes in Y)
	return rotateY(Math.PI / 2, bump);
}

/**
 * Lid is a shallow box - solid top with short walls.
 * Fits over the box's inner wall.
 * Includes optional snap-lock bumps for secure closure.
 *
 * Cross-section:
 *    ___________________
 *   |___________________|  <- solid top
 *   |   |     ●     |   |  <- short walls (lip) with snap bump
 *   |___|           |___|
 *       (open here)
 */
export function createLid(box: Box): Geom3 | null {
	if (box.trays.length === 0) return null;

	const placements = arrangeTrays(box.trays);
	const interior = getBoxInteriorDimensions(placements, box.tolerance);

	if (interior.width <= 0 || interior.depth <= 0) {
		throw new Error(`Lid for "${box.name}": Invalid dimensions.`);
	}

	const wall = box.wallThickness;
	const clearance = 0.3;
	const innerWallThickness = wall / 2;

	// Snap-lock parameters (with defaults for backwards compatibility)
	const snapEnabled = box.lidParams?.snapEnabled ?? true;
	const snapBumpHeight = box.lidParams?.snapBumpHeight ?? 0.4;
	const snapBumpWidth = box.lidParams?.snapBumpWidth ?? 4.0;
	const railEngagement = box.lidParams?.railEngagement ?? 0.5;

	// Calculate minimum (auto) dimensions
	const minimums = calculateMinimumBoxDimensions(box);

	// Lid exterior matches box exterior (uses custom dimensions if set)
	const extWidth = box.customWidth ?? minimums.minWidth;
	const extDepth = box.customDepth ?? minimums.minDepth;

	// Total lid height = 2× wall thickness
	const lidHeight = wall * 2;
	const lipHeight = wall; // Walls go down 1× wall thickness

	// 1. Solid block (exterior size, full lid height)
	// Flat side at Z=0 for printing
	const solid = cuboid({
		size: [extWidth, extDepth, lidHeight],
		center: [extWidth / 2, extDepth / 2, lidHeight / 2]
	});

	// 2. Subtract cavity from TOP (matches box's inner wall size + clearance)
	// This leaves the flat plate at bottom and short walls around the edges
	const cavityWidth = interior.width + innerWallThickness * 2 + clearance * 2;
	const cavityDepth = interior.depth + innerWallThickness * 2 + clearance * 2;

	// Position cavity at origin corner to match box's inner wall
	const cavityCenterX = wall - innerWallThickness - clearance + cavityWidth / 2;
	const cavityCenterY = wall - innerWallThickness - clearance + cavityDepth / 2;

	const cavity = cuboid({
		size: [cavityWidth, cavityDepth, lipHeight + 1],
		center: [cavityCenterX, cavityCenterY, lidHeight - lipHeight / 2 + 0.5]
	});

	let lid = subtract(solid, cavity);

	// Lid slides along the LONGEST dimension for better ergonomics
	const slidesAlongX = extWidth > extDepth;

	// Remove entry lip for sliding entry (if snap enabled)
	if (snapEnabled) {
		if (slidesAlongX) {
			// Entry at low X (left side)
			const entryLipCutout = cuboid({
				size: [wall, cavityDepth, lipHeight + 1],
				center: [wall / 2, extDepth / 2, lidHeight - lipHeight / 2 + 0.5]
			});
			lid = subtract(lid, entryLipCutout);

			// Cut notches from entry corners of front/back walls
			const cornerCutoutFront = cuboid({
				size: [wall, wall, lipHeight + 1],
				center: [wall / 2, wall / 2, lidHeight - lipHeight / 2 + 0.5]
			});
			const cornerCutoutBack = cuboid({
				size: [wall, wall, lipHeight + 1],
				center: [wall / 2, extDepth - wall / 2, lidHeight - lipHeight / 2 + 0.5]
			});
			lid = subtract(lid, cornerCutoutFront, cornerCutoutBack);

			// Grip lines on front/back walls near exit (high X)
			const gripLineDepth = 0.3;
			const gripLineWidth = 0.8;
			const gripLineSpacing = 2.5;
			const numGripLines = 5;
			const totalGripWidth = (numGripLines - 1) * gripLineSpacing;
			const gripStartX = extWidth - wall - 1 - totalGripWidth;

			for (let i = 0; i < numGripLines; i++) {
				const lineX = gripStartX + i * gripLineSpacing;
				const frontGrip = cuboid({
					size: [gripLineWidth, gripLineDepth, lidHeight + 1],
					center: [lineX, gripLineDepth / 2, lidHeight / 2]
				});
				const backGrip = cuboid({
					size: [gripLineWidth, gripLineDepth, lidHeight + 1],
					center: [lineX, extDepth - gripLineDepth / 2, lidHeight / 2]
				});
				lid = subtract(lid, frontGrip, backGrip);
			}
		} else {
			// Entry at low Y (front side)
			const entryLipCutout = cuboid({
				size: [cavityWidth, wall, lipHeight + 1],
				center: [extWidth / 2, wall / 2, lidHeight - lipHeight / 2 + 0.5]
			});
			lid = subtract(lid, entryLipCutout);

			// Cut notches from entry corners of left/right walls
			const cornerCutoutLeft = cuboid({
				size: [wall, wall, lipHeight + 1],
				center: [wall / 2, wall / 2, lidHeight - lipHeight / 2 + 0.5]
			});
			const cornerCutoutRight = cuboid({
				size: [wall, wall, lipHeight + 1],
				center: [extWidth - wall / 2, wall / 2, lidHeight - lipHeight / 2 + 0.5]
			});
			lid = subtract(lid, cornerCutoutLeft, cornerCutoutRight);

			// Grip lines on left/right walls near exit (high Y)
			const gripLineDepth = 0.3;
			const gripLineWidth = 0.8;
			const gripLineSpacing = 2.5;
			const numGripLines = 5;
			const totalGripWidth = (numGripLines - 1) * gripLineSpacing;
			const gripStartY = extDepth - wall - 1 - totalGripWidth;

			for (let i = 0; i < numGripLines; i++) {
				const lineY = gripStartY + i * gripLineSpacing;
				const leftGrip = cuboid({
					size: [gripLineDepth, gripLineWidth, lidHeight + 1],
					center: [gripLineDepth / 2, lineY, lidHeight / 2]
				});
				const rightGrip = cuboid({
					size: [gripLineDepth, gripLineWidth, lidHeight + 1],
					center: [extWidth - gripLineDepth / 2, lineY, lidHeight / 2]
				});
				lid = subtract(lid, leftGrip, rightGrip);
			}
		}
	}

	// 3. Add continuous U-shaped rail on 3 sides for sliding fit (not entry side)
	// Rails are designed with 45° chamfered bottoms to be self-supporting when printing
	if (snapEnabled && snapBumpHeight > 0) {
		const railHeight = lipHeight * railEngagement;
		const topZ = lidHeight;
		const bottomZ = lidHeight - railHeight;
		const railThickness = clearance + snapBumpHeight * 1.5;
		const chamferSize = railThickness * Math.sqrt(2);

		const lipThicknessX = (extWidth - cavityWidth) / 2;
		const lipThicknessY = (extDepth - cavityDepth) / 2;
		const innerLeftX = lipThicknessX;
		const innerRightX = extWidth - lipThicknessX;
		const innerFrontY = lipThicknessY;
		const innerBackY = extDepth - lipThicknessY;

		if (slidesAlongX) {
			// Rails on front, back, and right (NOT left = entry)
			const railStartX = lipThicknessX + wall; // after corner cutout
			const totalRailLength = cavityWidth - railThickness - wall;
			const sideRailLength = totalRailLength + railThickness;
			const sideRailCenterX = railStartX + sideRailLength / 2;

			// Right rail (exit side) - full depth
			const rightRailBlock = cuboid({
				size: [railThickness, innerBackY - innerFrontY + railThickness * 2, railHeight],
				center: [innerRightX - railThickness / 2, extDepth / 2, topZ - railHeight / 2]
			});

			// Front and back rails - from entry to exit
			const frontRailBlock = cuboid({
				size: [sideRailLength, railThickness, railHeight],
				center: [sideRailCenterX, innerFrontY + railThickness / 2, topZ - railHeight / 2]
			});
			const backRailBlock = cuboid({
				size: [sideRailLength, railThickness, railHeight],
				center: [sideRailCenterX, innerBackY - railThickness / 2, topZ - railHeight / 2]
			});

			// Chamfer cuts
			const rightCut = translate(
				[innerRightX - railThickness, extDepth / 2, bottomZ],
				rotateY(Math.PI / 4, cuboid({
					size: [chamferSize, innerBackY - innerFrontY + railThickness * 4, chamferSize],
					center: [0, 0, 0]
				}))
			);
			const frontCut = translate(
				[sideRailCenterX, innerFrontY + railThickness, bottomZ],
				rotateX(-Math.PI / 4, cuboid({
					size: [sideRailLength + railThickness * 2, chamferSize, chamferSize],
					center: [0, 0, 0]
				}))
			);
			const backCut = translate(
				[sideRailCenterX, innerBackY - railThickness, bottomZ],
				rotateX(Math.PI / 4, cuboid({
					size: [sideRailLength + railThickness * 2, chamferSize, chamferSize],
					center: [0, 0, 0]
				}))
			);

			const rightRailChamfered = subtract(rightRailBlock, rightCut);
			const frontRailChamfered = subtract(frontRailBlock, frontCut);
			const backRailChamfered = subtract(backRailBlock, backCut);

			lid = union(lid, union(rightRailChamfered, frontRailChamfered, backRailChamfered));

			// Detent bump at entry (low X)
			const detentRadius = snapBumpHeight;
			const detentLength = snapBumpWidth * 2;
			const topPlateInnerZ = lidHeight - lipHeight;
			const detentBump = translate(
				[wall / 2, extDepth / 2, topPlateInnerZ],
				rotateX(Math.PI / 2, cylinder({
					radius: detentRadius,
					height: detentLength,
					segments: 32,
					center: [0, 0, 0]
				}))
			);
			lid = union(lid, detentBump);
		} else {
			// Rails on left, right, and back (NOT front = entry)
			const railStartY = lipThicknessY + wall;
			const totalRailLength = cavityDepth - railThickness - wall;
			const sideRailLength = totalRailLength + railThickness;
			const sideRailCenterY = railStartY + sideRailLength / 2;

			// Back rail (exit side) - full width
			const backRailBlock = cuboid({
				size: [innerRightX - innerLeftX + railThickness * 2, railThickness, railHeight],
				center: [extWidth / 2, innerBackY - railThickness / 2, topZ - railHeight / 2]
			});

			// Left and right rails - from entry to exit
			const leftRailBlock = cuboid({
				size: [railThickness, sideRailLength, railHeight],
				center: [innerLeftX + railThickness / 2, sideRailCenterY, topZ - railHeight / 2]
			});
			const rightRailBlock = cuboid({
				size: [railThickness, sideRailLength, railHeight],
				center: [innerRightX - railThickness / 2, sideRailCenterY, topZ - railHeight / 2]
			});

			// Chamfer cuts
			const backCut = translate(
				[extWidth / 2, innerBackY - railThickness, bottomZ],
				rotateX(Math.PI / 4, cuboid({
					size: [innerRightX - innerLeftX + railThickness * 4, chamferSize, chamferSize],
					center: [0, 0, 0]
				}))
			);
			const leftCut = translate(
				[innerLeftX + railThickness, sideRailCenterY, bottomZ],
				rotateY(-Math.PI / 4, cuboid({
					size: [chamferSize, sideRailLength + railThickness * 2, chamferSize],
					center: [0, 0, 0]
				}))
			);
			const rightCut = translate(
				[innerRightX - railThickness, sideRailCenterY, bottomZ],
				rotateY(Math.PI / 4, cuboid({
					size: [chamferSize, sideRailLength + railThickness * 2, chamferSize],
					center: [0, 0, 0]
				}))
			);

			const backRailChamfered = subtract(backRailBlock, backCut);
			const leftRailChamfered = subtract(leftRailBlock, leftCut);
			const rightRailChamfered = subtract(rightRailBlock, rightCut);

			lid = union(lid, union(backRailChamfered, leftRailChamfered, rightRailChamfered));

			// Detent bump at entry (low Y)
			const detentRadius = snapBumpHeight;
			const detentLength = snapBumpWidth * 2;
			const topPlateInnerZ = lidHeight - lipHeight;
			const detentBump = translate(
				[extWidth / 2, wall / 2, topPlateInnerZ],
				rotateY(Math.PI / 2, cylinder({
					radius: detentRadius,
					height: detentLength,
					segments: 32,
					center: [0, 0, 0]
				}))
			);
			lid = union(lid, detentBump);
		}
	}

	// 4. Emboss box name on lid top if enabled
	const showName = box.lidParams?.showName ?? true;
	if (showName && box.name && box.name.trim().length > 0) {
		const textDepth = 0.6; // How deep the text is recessed
		const strokeWidth = 1.4; // Width of the text strokes (thicker = bolder)
		const textHeight = 8; // Font height in mm
		const margin = wall * 2; // Margin from edges

		// Determine if text should be rotated to read along the longest dimension
		const rotateText = extDepth > extWidth;

		// Get text outlines (uppercase renders better with vector font)
		const textSegments = vectorText({ height: textHeight, align: 'center' }, box.name.trim().toUpperCase());

		if (textSegments.length > 0) {
			// Convert segments to path2, expand to give stroke width, and extrude
			const textShapes: Geom3[] = [];
			for (const segment of textSegments) {
				if (segment.length >= 2) {
					const pathObj = path2.fromPoints({ closed: false }, segment);
					const expanded = expand({ delta: strokeWidth / 2, corners: 'round', segments: 64 }, pathObj);
					const extruded = extrudeLinear({ height: textDepth + 0.1 }, expanded);
					textShapes.push(extruded);
				}
			}

			if (textShapes.length > 0) {
				// Calculate text bounds to center it
				let minX = Infinity, maxX = -Infinity;
				let minY = Infinity, maxY = -Infinity;
				for (const segment of textSegments) {
					for (const point of segment) {
						minX = Math.min(minX, point[0]);
						maxX = Math.max(maxX, point[0]);
						minY = Math.min(minY, point[1]);
						maxY = Math.max(maxY, point[1]);
					}
				}
				const textWidth = maxX - minX + strokeWidth;
				const textHeightY = maxY - minY + strokeWidth;

				// Available space depends on orientation
				const availableLong = (rotateText ? extDepth : extWidth) - margin * 2;
				const availableShort = (rotateText ? extWidth : extDepth) - margin * 2;

				// Scale to fit: text width goes along long dimension, text height along short
				const scaleLong = Math.min(1, availableLong / textWidth);
				const scaleShort = Math.min(1, availableShort / textHeightY);
				const textScale = Math.min(scaleLong, scaleShort);

				// Center position on lid top
				const centerX = extWidth / 2;
				const centerY = extDepth / 2;
				const textCenterX = (minX + maxX) / 2;
				const textCenterY = (minY + maxY) / 2;

				// Combine all text shapes and position them
				// Mirror in X because lid top is at Z=0 (print surface faces up when in use)
				let combinedText: Geom3 = union(...textShapes);
				combinedText = mirrorX(combinedText); // Mirror horizontally

				// If lid is longer in Y, rotate text 90° to read along Y axis
				if (rotateText) {
					combinedText = rotateZ(Math.PI / 2, combinedText);
					// After rotation: old X becomes Y, old Y becomes -X
					const positionedText = translate(
						[centerX + textCenterY * textScale, centerY + textCenterX * textScale, -0.1],
						scale([textScale, textScale, 1], combinedText)
					);
					lid = subtract(lid, positionedText);
				} else {
					const positionedText = translate(
						[centerX + textCenterX * textScale, centerY - textCenterY * textScale, -0.1],
						scale([textScale, textScale, 1], combinedText)
					);
					lid = subtract(lid, positionedText);
				}
			}
		}
	}

	return lid;
}
