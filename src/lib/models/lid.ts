import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';
import type { Box, LidParams } from '$lib/types/project';
import { arrangeTrays, getBoxInteriorDimensions } from './box';

const { cuboid, roundedCuboid, cylinder } = jscad.primitives;
const { subtract, union } = jscad.booleans;
const { translate, rotateX, rotateY } = jscad.transforms;

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
	railEngagement: 0.5
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

	// Box exterior at the base
	const extWidth = interior.width + wall * 2;
	const extDepth = interior.depth + wall * 2;
	const extHeight = interior.height + floor; // No extra height - interior = tray height

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

	for (const placement of placements) {
		const pocketWidth = placement.dimensions.width + tolerance * 2;
		const pocketDepth = placement.dimensions.depth + tolerance * 2;
		// All pockets go to full interior height so trays sit flush at top
		const pocketHeight = interior.height + 1;

		// Position pocket: wall + tolerance offset, plus the tray's Y position
		const pocketX = wall + tolerance + placement.x;
		const pocketY = wall + tolerance + placement.y;

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
			const fillHeight = interior.height + 1;

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
	const innerWallKeep = cuboid({
		size: [interior.width + innerWallThickness * 2, interior.depth + innerWallThickness * 2, recessHeight + 1],
		center: [extWidth / 2, extDepth / 2, extHeight - recessHeight / 2]
	});

	// For sliding lid, extend the front outer wall to full height (no recess on entry side)
	const snapEnabled = box.lidParams?.snapEnabled ?? true;
	let recess;
	if (snapEnabled) {
		// Keep front wall full height by not cutting recess there
		// Subtract the front portion from the recess cut
		const frontWallKeep = cuboid({
			size: [extWidth + 1, wall, recessHeight + 1],
			center: [extWidth / 2, wall / 2, extHeight - recessHeight / 2]
		});
		recess = subtract(outerRecess, innerWallKeep, frontWallKeep);
	} else {
		recess = subtract(outerRecess, innerWallKeep);
	}

	let result = subtract(outerBox, ...trayCavities, ...fillCells, recess);

	// 4. Add snap grooves if enabled
	// These are grooves cut into the outer surface of the inner wall
	// where the lid's rails slide into
	const snapBumpHeight = box.lidParams?.snapBumpHeight ?? 0.4;
	const snapBumpWidth = box.lidParams?.snapBumpWidth ?? 4.0;
	const railEngagement = box.lidParams?.railEngagement ?? 0.5;

	if (snapEnabled && snapBumpHeight > 0) {
		// Groove depth slightly larger than bump height for easy sliding
		const grooveDepth = snapBumpHeight + 0.1;
		// Groove height uses railEngagement fraction of lip height (wall) for stronger hold
		const lipHeight = wall;
		const grooveHeight = lipHeight * railEngagement + 0.2;

		// Inner wall outer surfaces form a rectangle
		// Front (low Y) is entry side - no groove there
		// Position groove at BOTTOM of recess area (more material above for strength)
		const notchZ = extHeight - wall + grooveHeight / 2;

		// Inner wall dimensions (same as innerWallKeep)
		const innerWallWidth = interior.width + innerWallThickness * 2;
		const innerWallDepth = interior.depth + innerWallThickness * 2;

		const grooves: Geom3[] = [];

		// Back groove - runs full width along back inner wall
		const backGroove = translate(
			[extWidth / 2, extDepth - wall / 2 - grooveDepth / 2, notchZ],
			cuboid({
				size: [innerWallWidth, grooveDepth, grooveHeight],
				center: [0, 0, 0]
			})
		);
		grooves.push(backGroove);

		// Left groove - runs from front to back along left inner wall
		const sideGrooveLength = innerWallDepth - grooveDepth; // don't overlap with back
		const leftGroove = translate(
			[wall / 2 + grooveDepth / 2, wall / 2 + sideGrooveLength / 2, notchZ],
			cuboid({
				size: [grooveDepth, sideGrooveLength, grooveHeight],
				center: [0, 0, 0]
			})
		);
		grooves.push(leftGroove);

		// Right groove - runs from front to back along right inner wall
		const rightGroove = translate(
			[extWidth - wall / 2 - grooveDepth / 2, wall / 2 + sideGrooveLength / 2, notchZ],
			cuboid({
				size: [grooveDepth, sideGrooveLength, grooveHeight],
				center: [0, 0, 0]
			})
		);
		grooves.push(rightGroove);

		result = subtract(result, ...grooves);

		// Add detent notch on top of flush front wall - lid bump clicks into this
		// Half-cylinder groove running along X axis for smooth sliding engagement
		const detentRadius = snapBumpHeight + 0.1; // Slightly larger than bump for clearance
		const detentLength = snapBumpWidth * 2; // Wider for stability
		const detentNotch = translate(
			[extWidth / 2, wall / 2, extHeight],
			rotateY(Math.PI / 2, cylinder({
				radius: detentRadius,
				height: detentLength,
				segments: 32,
				center: [0, 0, 0]
			}))
		);
		result = subtract(result, detentNotch);
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

	// Lid exterior matches box exterior
	const extWidth = interior.width + wall * 2;
	const extDepth = interior.depth + wall * 2;

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

	const cavity = cuboid({
		size: [cavityWidth, cavityDepth, lipHeight + 1],
		center: [extWidth / 2, extDepth / 2, lidHeight - lipHeight / 2 + 0.5]
	});

	let lid = subtract(solid, cavity);

	// Remove front lip for sliding entry (if snap enabled)
	if (snapEnabled) {
		const frontLipCutout = cuboid({
			size: [cavityWidth, wall, lipHeight + 1],
			center: [extWidth / 2, wall / 2, lidHeight - lipHeight / 2 + 0.5]
		});
		lid = subtract(lid, frontLipCutout);

		// Cut notches from front corners of left/right walls
		// These would otherwise overlap with the box's full-height front wall
		const cornerCutoutLeft = cuboid({
			size: [wall, wall, lipHeight + 1],
			center: [wall / 2, wall / 2, lidHeight - lipHeight / 2 + 0.5]
		});
		const cornerCutoutRight = cuboid({
			size: [wall, wall, lipHeight + 1],
			center: [extWidth - wall / 2, wall / 2, lidHeight - lipHeight / 2 + 0.5]
		});
		lid = subtract(lid, cornerCutoutLeft, cornerCutoutRight);

		// Add grip lines on back of side walls to indicate pull direction
		const gripLineDepth = 0.3; // How deep the groove is
		const gripLineWidth = 0.8; // Width of each groove
		const gripLineSpacing = 2.5; // Space between grooves
		const numGripLines = 5;
		const totalGripWidth = (numGripLines - 1) * gripLineSpacing;
		const gripStartY = extDepth - wall - 1 - totalGripWidth; // Start from back

		for (let i = 0; i < numGripLines; i++) {
			const lineY = gripStartY + i * gripLineSpacing;

			// Left side grip lines (on outer X surface) - full height
			const leftGrip = cuboid({
				size: [gripLineDepth, gripLineWidth, lidHeight + 1],
				center: [gripLineDepth / 2, lineY, lidHeight / 2]
			});

			// Right side grip lines (on outer X surface) - full height
			const rightGrip = cuboid({
				size: [gripLineDepth, gripLineWidth, lidHeight + 1],
				center: [extWidth - gripLineDepth / 2, lineY, lidHeight / 2]
			});

			lid = subtract(lid, leftGrip, rightGrip);
		}
	}

	// 3. Add continuous U-shaped rail on 3 sides for sliding fit (not front/entry side)
	if (snapEnabled && snapBumpHeight > 0) {
		// Rail height uses railEngagement fraction of lip height for stronger hold
		const railHeight = lipHeight * railEngagement;
		// Position rail at BOTTOM of lip (opening edge) - more material above for strength
		const bumpZ = lidHeight - railHeight / 2;

		// Rail thickness must bridge the clearance gap AND extend into the groove
		const railThickness = clearance + snapBumpHeight;

		// Wall positions (inner surface of lid cavity)
		const lipThickness = (extWidth - cavityWidth) / 2; // thickness of lid lip walls
		const innerLeftX = lipThickness;
		const innerRightX = extWidth - lipThickness;
		const innerBackY = extDepth - lipThickness;

		const rails: Geom3[] = [];

		// Back rail - runs full width along back wall
		const backRail = translate(
			[extWidth / 2, innerBackY - railThickness / 2, bumpZ],
			cuboid({
				size: [cavityWidth, railThickness, railHeight],
				center: [0, 0, 0]
			})
		);
		rails.push(backRail);

		// Left rail - runs from after corner cutout to back wall
		// Start after the corner cutout (wall thickness from front)
		const railStartY = lipThickness + wall; // after corner cutout
		const leftRailLength = cavityDepth - railThickness - wall; // shortened to account for corner
		const leftRail = translate(
			[innerLeftX + railThickness / 2, railStartY + leftRailLength / 2, bumpZ],
			cuboid({
				size: [railThickness, leftRailLength, railHeight],
				center: [0, 0, 0]
			})
		);
		rails.push(leftRail);

		// Right rail - runs from after corner cutout to back wall
		const rightRail = translate(
			[innerRightX - railThickness / 2, railStartY + leftRailLength / 2, bumpZ],
			cuboid({
				size: [railThickness, leftRailLength, railHeight],
				center: [0, 0, 0]
			})
		);
		rails.push(rightRail);

		lid = union(lid, ...rails);

		// Add detent bump on underside of lid - clicks into notch on box's front wall
		// Half-cylinder ridge running along X axis for smooth sliding engagement
		// Center at surface level so only half protrudes
		const detentRadius = snapBumpHeight;
		const detentLength = snapBumpWidth * 2; // Match notch width for stability
		const topPlateInnerZ = lidHeight - lipHeight; // Inner surface of top plate

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

	return lid;
}
