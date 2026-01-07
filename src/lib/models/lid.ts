import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';
import type { Box, LidParams } from '$lib/types/project';
import { arrangeTrays, getBoxInteriorDimensions } from './box';

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
		// Start at Y = wall (not wall/2) to avoid cutting into front wall area
		const sideGrooveLength = innerWallDepth - grooveDepth - wall / 2; // don't overlap with front or back
		const leftGroove = translate(
			[wall / 2 + grooveDepth / 2, wall + sideGrooveLength / 2, notchZ],
			cuboid({
				size: [grooveDepth, sideGrooveLength, grooveHeight],
				center: [0, 0, 0]
			})
		);
		grooves.push(leftGroove);

		// Right groove - runs from front to back along right inner wall
		const rightGroove = translate(
			[extWidth - wall / 2 - grooveDepth / 2, wall + sideGrooveLength / 2, notchZ],
			cuboid({
				size: [grooveDepth, sideGrooveLength, grooveHeight],
				center: [0, 0, 0]
			})
		);
		grooves.push(rightGroove);

		result = subtract(result, ...grooves);

		// Add supports to eliminate groove ceiling overhang (makes printing without supports possible)
		//
		// CHAMFER TECHNIQUE: Creating 45° chamfers for self-supporting overhangs
		// ======================================================================
		// 1. Create rectangular blocks that fill the areas needing chamfers
		//    - Blocks can overlap at corners - union handles this cleanly
		//    - Size the blocks to cover the full depth/height of the chamfer area
		//
		// 2. Subtract rotated cuboids to cut the 45° slopes
		//    - Rotate the cutting cuboid 45° (Math.PI/4) around the appropriate axis:
		//      * rotateX for chamfers facing -Y or +Y (back/front walls)
		//      * rotateY for chamfers facing -X or +X (left/right walls)
		//    - Size the cutter: chamferSize = depth * Math.sqrt(2) for the rotated dimensions
		//    - Position the cutter at the edge where the slope should start
		//
		// This technique avoids complex triangular hull() geometry and handles corners
		// automatically through the union of overlapping blocks.
		// ======================================================================
		const grooveTopZ = notchZ + grooveHeight / 2;
		const chamferSize = grooveDepth * Math.sqrt(2); // diagonal of the chamfer square

		// Rectangular support blocks (will overlap at corners - that's fine)
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

		// Union the blocks
		let supportBlock = union(backBlock, leftBlock, rightBlock);

		// Cut 45° chamfers using rotated cuboids
		// Back chamfer - rotated around X axis
		const backCut = translate(
			[extWidth / 2, extDepth - wall / 2, grooveTopZ - grooveDepth],
			rotateX(Math.PI / 4, cuboid({
				size: [innerWallWidth + grooveDepth * 2, chamferSize, chamferSize],
				center: [0, 0, 0]
			}))
		);

		// Left chamfer - rotated around Y axis
		const leftCut = translate(
			[wall / 2, wall + (sideGrooveLength + grooveDepth) / 2, grooveTopZ - grooveDepth],
			rotateY(-Math.PI / 4, cuboid({
				size: [chamferSize, sideGrooveLength + grooveDepth * 2, chamferSize],
				center: [0, 0, 0]
			}))
		);

		// Right chamfer - rotated around Y axis
		const rightCut = translate(
			[extWidth - wall / 2, wall + (sideGrooveLength + grooveDepth) / 2, grooveTopZ - grooveDepth],
			rotateY(Math.PI / 4, cuboid({
				size: [chamferSize, sideGrooveLength + grooveDepth * 2, chamferSize],
				center: [0, 0, 0]
			}))
		);

		supportBlock = subtract(supportBlock, backCut, leftCut, rightCut);
		result = union(result, supportBlock);

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

		// Add grip lines on back of side walls to match lid grip lines
		// These create a continuous tactile feature when lid is attached
		const gripLineDepth = 0.3; // Same as lid
		const gripLineWidth = 0.8; // Same as lid
		const gripLineSpacing = 2.5; // Same as lid
		const numGripLines = 5;
		const totalGripWidth = (numGripLines - 1) * gripLineSpacing;
		const gripStartY = extDepth - wall - 1 - totalGripWidth; // Same positioning as lid

		for (let i = 0; i < numGripLines; i++) {
			const lineY = gripStartY + i * gripLineSpacing;

			// Left side grip lines (on outer X surface) - full box height
			const leftGrip = cuboid({
				size: [gripLineDepth, gripLineWidth, extHeight + 1],
				center: [gripLineDepth / 2, lineY, extHeight / 2]
			});

			// Right side grip lines (on outer X surface) - full box height
			const rightGrip = cuboid({
				size: [gripLineDepth, gripLineWidth, extHeight + 1],
				center: [extWidth - gripLineDepth / 2, lineY, extHeight / 2]
			});

			result = subtract(result, leftGrip, rightGrip);
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
	// Rails are designed with 45° chamfered bottoms to be self-supporting when printing
	//
	// CHAMFER TECHNIQUE: Same as box groove supports - rectangular blocks + rotated cuboid cuts
	// See createBoxWithLidGrooves() for detailed documentation of this technique.
	if (snapEnabled && snapBumpHeight > 0) {
		// Rail height uses railEngagement fraction of lip height for stronger hold
		const railHeight = lipHeight * railEngagement;
		// Position rail at BOTTOM of lip (opening edge) - more material above for strength
		const topZ = lidHeight; // Top of rail (flush with lip top)
		const bottomZ = lidHeight - railHeight; // Bottom of rail

		// Rail thickness must bridge the clearance gap AND extend into the groove
		// Extra protrusion needed because chamfer reduces effective engagement at bottom
		const railThickness = clearance + snapBumpHeight * 1.5;
		const chamferSize = railThickness * Math.sqrt(2); // diagonal for rotated cut

		// Wall positions (inner surface of lid cavity)
		const lipThickness = (extWidth - cavityWidth) / 2; // thickness of lid lip walls
		const innerLeftX = lipThickness;
		const innerRightX = extWidth - lipThickness;
		const innerBackY = extDepth - lipThickness;

		// Left/right rail positioning
		const railStartY = lipThickness + wall; // after corner cutout
		const totalRailLength = cavityDepth - railThickness - wall;
		const taperLength = Math.min(5, totalRailLength / 3);

		// Rectangular rail blocks - full length including taper area, overlap at corners
		const sideRailLength = totalRailLength + railThickness; // full length to back
		const sideRailCenterY = railStartY + sideRailLength / 2;

		// Back rail extends full width including past side rail positions
		const backRailBlock = cuboid({
			size: [innerRightX - innerLeftX + railThickness * 2, railThickness, railHeight],
			center: [extWidth / 2, innerBackY - railThickness / 2, topZ - railHeight / 2]
		});

		// Side rails - full length from railStartY to back, overlapping with back rail
		const leftRailBlock = cuboid({
			size: [railThickness, sideRailLength, railHeight],
			center: [innerLeftX + railThickness / 2, sideRailCenterY, topZ - railHeight / 2]
		});

		const rightRailBlock = cuboid({
			size: [railThickness, sideRailLength, railHeight],
			center: [innerRightX - railThickness / 2, sideRailCenterY, topZ - railHeight / 2]
		});

		// Cut 45° chamfers on each rail piece BEFORE unioning
		// IMPORTANT: Apply cuts to separate pieces first, then union - this prevents
		// manifold errors that occur when overlapping rotated cuts intersect

		// Back chamfer - applied to back rail only
		const backCut = translate(
			[extWidth / 2, innerBackY - railThickness, bottomZ],
			rotateX(Math.PI / 4, cuboid({
				size: [innerRightX - innerLeftX + railThickness * 4, chamferSize, chamferSize],
				center: [0, 0, 0]
			}))
		);
		const backRailChamfered = subtract(backRailBlock, backCut);

		// Left chamfer - applied to left rail only
		const leftCut = translate(
			[innerLeftX + railThickness, sideRailCenterY, bottomZ],
			rotateY(-Math.PI / 4, cuboid({
				size: [chamferSize, sideRailLength + railThickness * 2, chamferSize],
				center: [0, 0, 0]
			}))
		);
		const leftRailChamfered = subtract(leftRailBlock, leftCut);

		// Right chamfer - applied to right rail only
		const rightCut = translate(
			[innerRightX - railThickness, sideRailCenterY, bottomZ],
			rotateY(Math.PI / 4, cuboid({
				size: [chamferSize, sideRailLength + railThickness * 2, chamferSize],
				center: [0, 0, 0]
			}))
		);
		const rightRailChamfered = subtract(rightRailBlock, rightCut);

		// Union the chamfered pieces
		const railBlock = union(backRailChamfered, leftRailChamfered, rightRailChamfered);

		lid = union(lid, railBlock);

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
