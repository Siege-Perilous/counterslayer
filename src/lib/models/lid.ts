import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';
import type { Box, LidParams } from '$lib/types/project';
import { arrangeTrays, getBoxInteriorDimensions } from './box';

const { cuboid, roundedCuboid } = jscad.primitives;
const { subtract, union } = jscad.booleans;
const { translate } = jscad.transforms;

export const defaultLidParams: LidParams = {
	thickness: 2.0,
	railHeight: 6.0,
	railWidth: 0,
	railInset: 0,
	ledgeHeight: 0,
	fingerNotchRadius: 0,
	fingerNotchDepth: 0
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

	const recess = subtract(outerRecess, innerWallKeep);

	return subtract(outerBox, ...trayCavities, ...fillCells, recess);
}

/**
 * Lid is a shallow box - solid top with short walls.
 * Fits over the box's inner wall.
 *
 * Cross-section:
 *    ___________________
 *   |___________________|  <- solid top
 *   |   |           |   |  <- short walls (lip)
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

	return subtract(solid, cavity);
}
