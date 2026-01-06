import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';
import type { Box, LidParams } from '$lib/types/project';
import { arrangeTrays, getBoxInteriorDimensions } from './box';

const { cuboid } = jscad.primitives;
const { union } = jscad.booleans;

export const defaultLidParams: LidParams = {
	thickness: 2.0,        // Top plate thickness
	railHeight: 6.0,       // How deep the inner part drops into box
	railWidth: 0,          // Unused
	railInset: 0,          // Unused
	ledgeHeight: 0,        // Unused
	fingerNotchRadius: 0,  // Unused
	fingerNotchDepth: 0    // Unused
};

/**
 * Simple open-top box.
 * The lid will sit on top of the walls.
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

	// Exterior dimensions
	const extWidth = interior.width + wall * 2;
	const extDepth = interior.depth + wall * 2;
	const extHeight = interior.height + floor;

	// Outer solid
	const outer = cuboid({
		size: [extWidth, extDepth, extHeight],
		center: [extWidth / 2, extDepth / 2, extHeight / 2]
	});

	// Inner cavity (open top)
	const inner = cuboid({
		size: [interior.width, interior.depth, interior.height + 1],
		center: [extWidth / 2, extDepth / 2, floor + (interior.height + 1) / 2]
	});

	return jscad.booleans.subtract(outer, inner);
}

/**
 * Stepped lid:
 * - Top plate: covers entire box (exterior dimensions)
 * - Bottom plug: drops into the box (interior dimensions)
 *
 * Cross-section:
 *   ___________________
 *  |   top plate      |  <- exterior width, thickness
 *  |___|_________|____|
 *      |  plug   |       <- interior width, railHeight
 *      |_________|
 */
export function createLid(box: Box): Geom3 | null {
	const lp = box.lidParams;
	if (box.trays.length === 0) return null;

	const placements = arrangeTrays(box.trays);
	const interior = getBoxInteriorDimensions(placements, box.tolerance);

	if (interior.width <= 0 || interior.depth <= 0) {
		throw new Error(`Lid for "${box.name}": Invalid dimensions.`);
	}

	const wall = box.wallThickness;
	const clearance = 0.5; // Gap between plug and box walls

	// Exterior (matches box)
	const extWidth = interior.width + wall * 2;
	const extDepth = interior.depth + wall * 2;

	// Both layers are wall thickness tall
	const plateHeight = wall;
	const plugHeight = wall;

	// Top plate - covers the whole box (exterior size)
	const topPlate = cuboid({
		size: [extWidth, extDepth, plateHeight],
		center: [extWidth / 2, extDepth / 2, plateHeight / 2]
	});

	// Bottom plug - drops into the box opening (interior size minus clearance)
	const plugWidth = interior.width - clearance * 2;
	const plugDepth = interior.depth - clearance * 2;

	const bottomPlug = cuboid({
		size: [plugWidth, plugDepth, plugHeight],
		center: [extWidth / 2, extDepth / 2, plateHeight + plugHeight / 2]
	});

	return union(topPlate, bottomPlug);
}
