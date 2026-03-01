import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';
import type { Box, LidParams } from '$lib/types/project';
import { arrangeTrays, getBoxInteriorDimensions, calculateMinimumBoxDimensions } from './box';

const { cuboid, cylinder } = jscad.primitives;
const { subtract, union } = jscad.booleans;
const { hull } = jscad.hulls;
const { translate, rotateX, rotateY, rotateZ, scale, mirrorX, mirrorY } = jscad.transforms;
const { vectorText } = jscad.text;
const { path2, geom2 } = jscad.geometries;
const { expand } = jscad.expansions;
const { extrudeLinear } = jscad.extrusions;

/**
 * Creates an asymmetric ramp wedge for the slide lock mechanism.
 * The ramp has a gentle entry slope and a steep exit slope.
 * Uses hull of small cylinders at triangle corners for reliable geometry.
 *
 * @param rampLengthIn - Length of the gentle entry slope (mm)
 * @param rampLengthOut - Length of the steep exit slope (mm)
 * @param rampHeight - Peak height of the ramp (mm)
 * @param rampDepth - Depth of the ramp (how far it protrudes) (mm)
 * @returns A 3D geometry of the ramp wedge, oriented with:
 *          - X axis: slide direction (gentle slope at low X, steep at high X)
 *          - Y axis: protrusion direction (ramp peaks toward +Y)
 *          - Z axis: vertical thickness
 */
function createRampWedge(
	rampLengthIn: number,
	rampLengthOut: number,
	rampHeight: number,
	rampDepth: number
): Geom3 {
	// Create wedge using hull of cylinders at the 6 corners of a triangular prism
	// Triangle profile: gentle slope from X=0 to peak at X=rampLengthIn, steep drop to X=totalLength
	// Protrusion is in +Y direction, thickness in Z
	const r = 0.01; // Tiny radius for corner cylinders
	const totalLength = rampLengthIn + rampLengthOut;
	const thickness = rampDepth; // Z thickness of the ramp

	// Bottom face (Z=0) - base of triangle extruded
	const bottom1 = translate([0, 0, 0], cylinder({ radius: r, height: r, segments: 8 }));
	const bottom2 = translate([totalLength, 0, 0], cylinder({ radius: r, height: r, segments: 8 }));
	const bottom3 = translate([0, 0, thickness], cylinder({ radius: r, height: r, segments: 8 }));
	const bottom4 = translate([totalLength, 0, thickness], cylinder({ radius: r, height: r, segments: 8 }));

	// Peak edge (at Y=rampHeight) - the ridge of the wedge
	const peak1 = translate([rampLengthIn, rampHeight, 0], cylinder({ radius: r, height: r, segments: 8 }));
	const peak2 = translate([rampLengthIn, rampHeight, thickness], cylinder({ radius: r, height: r, segments: 8 }));

	return hull(bottom1, bottom2, bottom3, bottom4, peak1, peak2);
}

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
	showName: true,
	// Ramp lock defaults (enabled by default for smoother operation)
	rampLockEnabled: true,
	rampHeight: 0.5,
	rampLengthIn: 4.0,
	rampLengthOut: 1.5
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

	const placements = arrangeTrays(box.trays, {
		customBoxWidth: box.customWidth,
		wallThickness: box.wallThickness,
		tolerance: box.tolerance
	});
	const interior = getBoxInteriorDimensions(placements, box.tolerance);

	if (interior.width <= 0 || interior.depth <= 0 || interior.height <= 0) {
		throw new Error(`Box "${box.name}": Invalid dimensions. Add counter stacks to trays.`);
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
	const extHeight = box.customBoxHeight ?? minimums.minHeight;

	// Calculate gaps for fill logic
	const widthGap = extWidth - minimums.minWidth; // Extra space at east (high X)
	const depthGap = extDepth - minimums.minDepth; // Extra space at north (high Y)

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
	const backWalls: Geom3[] = []; // Walls at back of shorter trays in mixed-depth rows

	// Find the widest tray to calculate fill areas
	const maxTrayWidth = Math.max(...placements.map((p) => p.dimensions.width));

	// Actual interior height (accounts for custom height)
	const actualInteriorHeight = extHeight - floor;

	// Group placements by row (same Y position) - needed for fill cell wall calculations
	const rowMap = new Map<number, typeof placements>();
	for (const p of placements) {
		const row = rowMap.get(p.y) || [];
		row.push(p);
		rowMap.set(p.y, row);
	}
	const sortedRowYs = Array.from(rowMap.keys()).sort((a, b) => a - b);

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
			center: [pocketX + pocketWidth / 2, pocketY + pocketDepth / 2, floor + pocketHeight / 2]
		});
		trayCavities.push(cavity);

		// 2b. Create fill cell only if this tray ends the row AND there's space remaining
		// With bin-packing, we need to check if space to the right is actually empty
		const trayEndX = placement.x + placement.dimensions.width;
		const spaceRemaining = maxTrayWidth - trayEndX;

		// Check if any other tray occupies space to the right in the same row
		const hasNeighborToRight = placements.some(
			(other) =>
				other !== placement &&
				other.y === placement.y && // Same row (same Y position)
				other.x >= trayEndX // To the right of this tray
		);

		if (spaceRemaining > wall && !hasNeighborToRight) {
			/*
			 * FILL CELL WALL LOGIC - IMPORTANT DOCUMENTATION
			 * ================================================
			 * Fill cells represent empty space to the right of trays that don't span the full row width.
			 * Unlike tray pockets which can overlap at row boundaries (trays share dividing walls),
			 * fill cells need explicit walls separating them from adjacent rows.
			 *
			 * KEY CONCEPTS:
			 * 1. Pockets overlap by tolerance*2 at row boundaries - this is intentional for tray fit
			 * 2. Fill cells must NOT overlap with pockets - they need walls between them
			 * 3. Fill-to-fill boundaries also need walls, but only ONE fill should create the offset
			 *
			 * WALL CREATION STRATEGY:
			 * - FRONT offset (fillY): Only when previous row has POCKET at this X range
			 *   - If prev has pocket: pocket extends tolerance*2 into this row, need wall gap
			 *   - If prev has only fill: no offset needed, prev fill's back offset creates the wall
			 *
			 * - BACK offset (fillEnd): Only when next row has POCKET at this X range
			 *   - If next has pocket: end early to leave wall before pocket
			 *   - If next has only fill: extend to pocketEnd (next fill's front offset creates wall)
			 *
			 * BRIDGE LOGIC:
			 * When a fill cell's X range partially overlaps with next row pockets:
			 * - Main fill gets back offset (for the pocket-adjacent region)
			 * - Bridge extends the fill in the non-pocket region (to match pocket boundaries)
			 * This prevents steps in the wall between different X regions.
			 *
			 * EXAMPLE (the problematic case this solves):
			 * Row 1: [Tray 2 pocket X:0-104][fill:Tray 2 X:107-145]
			 * Row 2: [Tray 3 pocket X:0-64][Tray 4 pocket X:63-124][fill:Tray 4 X:127-145]
			 *
			 * At X:107-124: fill:Tray 2 meets pocket:Tray 4 → fill needs back offset
			 * At X:127-145: fill:Tray 2 meets fill:Tray 4 → fill extends to pocketEnd (bridge)
			 *
			 * Without bridge: step in wall between X:107-124 and X:127-145
			 * With bridge: consistent wall position across entire fill width
			 */

			// Fill cell: X from (tray pocket end + wall) to (where widest pocket ends)
			const fillWidth = spaceRemaining - wall;
			const fillX = pocketX + pocketWidth + wall;
			const fillXEnd = fillX + fillWidth;
			const fillHeight = actualInteriorHeight + 1;

			// Check if previous row has POCKETS at this fill cell's X range
			const prevRowY = sortedRowYs.filter((y) => y < placement.y).pop();
			const prevRowTrays = prevRowY !== undefined ? rowMap.get(prevRowY) || [] : [];
			const prevRowPocketOverlap = prevRowTrays.some((t) => {
				const trayXStart = wall + t.x;
				const trayXEnd = trayXStart + t.dimensions.width + tolerance * 2;
				return trayXEnd > fillX && trayXStart < fillXEnd;
			});

			// Fill cell Y position:
			// - If prev row has POCKET at this X range: front offset (pocket extends into this row)
			// - If prev row has only FILL at this X range: no front offset (start at same Y as pocket)
			const fillY = prevRowPocketOverlap
				? pocketY + tolerance * 2 + wall // Front offset: wall from prev pocket
				: pocketY; // No front offset: wall from prev fill's back offset

			// Find next row boundary and check if it has pockets at this X range
			const nextRowY = sortedRowYs.find((y) => y > placement.y);
			const nextRowStart = nextRowY !== undefined ? wall + nextRowY : null;
			const nextRowTrays = nextRowY !== undefined ? rowMap.get(nextRowY) || [] : [];
			const nextRowPocketOverlap = nextRowTrays.some((t) => {
				const trayXStart = wall + t.x;
				const trayXEnd = trayXStart + t.dimensions.width + tolerance * 2;
				return trayXEnd > fillX && trayXStart < fillXEnd;
			});

			// Fill cell depth calculation:
			// - If next row has POCKET at this X range: need back offset (leave wall before pocket)
			// - If next row has only FILL at this X range: extend to pocketEnd (avoid step with next fill)
			let targetFillEnd: number;
			if (nextRowPocketOverlap && nextRowStart !== null) {
				// Back offset: leave wall before next row's pocket
				targetFillEnd = nextRowStart - wall;

				// When fill has partial pocket overlap, add bridge for the non-overlapping region
				// to avoid steps between fill-to-fill boundaries
				let maxPocketXEnd = fillX;
				for (const t of nextRowTrays) {
					const trayXStart = wall + t.x;
					const trayXEnd = trayXStart + t.dimensions.width + tolerance * 2;
					if (trayXEnd > fillX && trayXStart < fillXEnd) {
						maxPocketXEnd = Math.max(maxPocketXEnd, trayXEnd);
					}
				}

				// If there's a region at the end not covered by next pockets, add bridge
				if (maxPocketXEnd < fillXEnd) {
					const bridgeXStart = maxPocketXEnd;
					const bridgeWidth = fillXEnd - bridgeXStart;
					const bridgeY = fillY;
					const bridgeEnd = targetFillEnd; // Same Y as main fill (with back offset) for consistent wall
					const bridgeDepth = bridgeEnd - bridgeY;

					if (bridgeWidth > 0 && bridgeDepth > 0) {
						const bridge = translate(
							[bridgeXStart, bridgeY, floor],
							cuboid({
								size: [bridgeWidth, bridgeDepth, fillHeight],
								center: [bridgeWidth / 2, bridgeDepth / 2, fillHeight / 2]
							})
						);
						fillCells.push(bridge);
					}
				}
			} else {
				// No back offset: extend to match pocket (next row's fill will have front offset)
				targetFillEnd = pocketY + pocketDepth;
			}
			const fillDepth = targetFillEnd - fillY;

			if (fillDepth > 0) {
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
	}

	// 2c. Create gap fills for custom box dimensions
	// Trays are anchored to origin corner - gaps appear at east (high X) and north (high Y)
	const gapFills: Geom3[] = [];

	// The tray area ends at the auto-calculated box interior + wall
	const trayAreaEndX = minimums.minWidth - wall; // Inner edge of east wall for auto-sized box
	const trayAreaEndY = minimums.minDepth - wall; // Inner edge of north wall for auto-sized box

	if (fillSolid) {
		// SOLID FILL MODE: Fill width/depth gaps with solid material
		// Height gaps are handled by floor spacers in trays, not ceiling fills

		// East gap (width gap at high X)
		if (widthGap > 0) {
			const eastFill = cuboid({
				size: [widthGap, extDepth - wall * 2, actualInteriorHeight],
				center: [trayAreaEndX + widthGap / 2, extDepth / 2, floor + actualInteriorHeight / 2]
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
		// MINIMAL WALLS MODE: Carve out gap areas and add thin walls to keep trays snug
		// The outer box is full custom size, so we need to carve cavities for the gap areas

		// East gap cavity (carve out the space beyond tray area at high X)
		if (widthGap > wall) {
			// Cavity starts after the thin wall, extends to inner edge of outer wall
			const eastCavity = cuboid({
				size: [widthGap - wall, extDepth - wall * 2, actualInteriorHeight + 1],
				center: [
					wall + interior.width + wall + (widthGap - wall) / 2,
					extDepth / 2,
					floor + actualInteriorHeight / 2
				]
			});
			fillCells.push(eastCavity);

			// East wall (keeps trays from sliding toward high X)
			const eastWall = cuboid({
				size: [wall, interior.depth, actualInteriorHeight],
				center: [
					wall + interior.width + wall / 2, // Just past tray area
					wall + interior.depth / 2,
					floor + actualInteriorHeight / 2
				]
			});
			gapFills.push(eastWall);
		}

		// North gap cavity (carve out the space beyond tray area at high Y)
		if (depthGap > wall) {
			// Cavity starts after the thin wall, extends to inner edge of outer wall
			const northCavity = cuboid({
				size: [minimums.minWidth - wall * 2, depthGap - wall, actualInteriorHeight + 1],
				center: [
					(minimums.minWidth - wall * 2) / 2 + wall,
					wall + interior.depth + wall + (depthGap - wall) / 2,
					floor + actualInteriorHeight / 2
				]
			});
			fillCells.push(northCavity);

			// North wall (keeps trays from sliding toward high Y)
			const northWall = cuboid({
				size: [interior.width, wall, actualInteriorHeight],
				center: [
					wall + interior.width / 2,
					wall + interior.depth + wall / 2, // Just past tray area
					floor + actualInteriorHeight / 2
				]
			});
			gapFills.push(northWall);
		}

		// Corner cavity (where east and north gaps meet)
		if (widthGap > wall && depthGap > wall) {
			const cornerCavity = cuboid({
				size: [widthGap - wall, depthGap - wall, actualInteriorHeight + 1],
				center: [
					wall + interior.width + wall + (widthGap - wall) / 2,
					wall + interior.depth + wall + (depthGap - wall) / 2,
					floor + actualInteriorHeight / 2
				]
			});
			fillCells.push(cornerCavity);
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
	// Use actual box interior (custom exterior minus walls), not just tray area
	const actualInteriorWidth = extWidth - wall * 2;
	const actualInteriorDepth = extDepth - wall * 2;
	const innerWallKeepWidth = actualInteriorWidth + innerWallThickness * 2;
	const innerWallKeepDepth = actualInteriorDepth + innerWallThickness * 2;
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

	// Add back walls for shorter trays in mixed-depth rows
	if (backWalls.length > 0) {
		result = union(result, ...backWalls);
	}

	// 4. Add snap grooves if enabled
	// These are grooves cut into the outer surface of the inner wall
	// where the lid's rails slide into
	// Using simple rectangular grooves - the small overhang (~0.8mm) is acceptable
	const snapBumpHeight = box.lidParams?.snapBumpHeight ?? 0.4;
	const snapBumpWidth = box.lidParams?.snapBumpWidth ?? 4.0;
	const railEngagement = box.lidParams?.railEngagement ?? 0.5;

	// Ramp lock parameters
	const rampLockEnabled = box.lidParams?.rampLockEnabled ?? true;
	const rampHeight = box.lidParams?.rampHeight ?? 0.5;
	const rampLengthIn = box.lidParams?.rampLengthIn ?? 4.0;
	const rampLengthOut = box.lidParams?.rampLengthOut ?? 1.5;

	if (snapEnabled && snapBumpHeight > 0) {
		// Groove depth must accommodate the rail which bridges clearance gap + extends into groove
		const clearance = 0.3; // Same as lid cavity clearance
		const grooveDepth = clearance + snapBumpHeight + 0.1;
		// Groove height uses railEngagement fraction of lip height (wall) for stronger hold
		const lipHeight = wall;
		const grooveHeight = lipHeight * railEngagement + 0.2;

		// Position groove at BOTTOM of recess area (more material above for strength)
		const notchZ = extHeight - wall + grooveHeight / 2;

		// Inner wall dimensions - use actual box interior, not just tray area
		const innerWallWidth = actualInteriorWidth + innerWallThickness * 2;
		const innerWallDepth = actualInteriorDepth + innerWallThickness * 2;

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
				center: [
					wall + (sideGrooveLength + grooveDepth) / 2,
					wall / 2 + grooveDepth / 2,
					grooveTopZ - grooveDepth / 2
				]
			});
			const backBlock = cuboid({
				size: [sideGrooveLength + grooveDepth, grooveDepth, grooveDepth],
				center: [
					wall + (sideGrooveLength + grooveDepth) / 2,
					extDepth - wall / 2 - grooveDepth / 2,
					grooveTopZ - grooveDepth / 2
				]
			});

			let supportBlock = union(rightBlock, frontBlock, backBlock);

			const rightCut = translate(
				[extWidth - wall / 2, extDepth / 2, grooveTopZ - grooveDepth],
				rotateY(
					Math.PI / 4,
					cuboid({
						size: [chamferSize, innerWallDepth + grooveDepth * 2, chamferSize],
						center: [0, 0, 0]
					})
				)
			);
			const frontCut = translate(
				[wall + (sideGrooveLength + grooveDepth) / 2, wall / 2, grooveTopZ - grooveDepth],
				rotateX(
					-Math.PI / 4,
					cuboid({
						size: [sideGrooveLength + grooveDepth * 2, chamferSize, chamferSize],
						center: [0, 0, 0]
					})
				)
			);
			const backCut = translate(
				[
					wall + (sideGrooveLength + grooveDepth) / 2,
					extDepth - wall / 2,
					grooveTopZ - grooveDepth
				],
				rotateX(
					Math.PI / 4,
					cuboid({
						size: [sideGrooveLength + grooveDepth * 2, chamferSize, chamferSize],
						center: [0, 0, 0]
					})
				)
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
				center: [
					wall / 2 + grooveDepth / 2,
					wall + (sideGrooveLength + grooveDepth) / 2,
					grooveTopZ - grooveDepth / 2
				]
			});
			const rightBlock = cuboid({
				size: [grooveDepth, sideGrooveLength + grooveDepth, grooveDepth],
				center: [
					extWidth - wall / 2 - grooveDepth / 2,
					wall + (sideGrooveLength + grooveDepth) / 2,
					grooveTopZ - grooveDepth / 2
				]
			});

			let supportBlock = union(backBlock, leftBlock, rightBlock);

			const backCut = translate(
				[extWidth / 2, extDepth - wall / 2, grooveTopZ - grooveDepth],
				rotateX(
					Math.PI / 4,
					cuboid({
						size: [innerWallWidth + grooveDepth * 2, chamferSize, chamferSize],
						center: [0, 0, 0]
					})
				)
			);
			const leftCut = translate(
				[wall / 2, wall + (sideGrooveLength + grooveDepth) / 2, grooveTopZ - grooveDepth],
				rotateY(
					-Math.PI / 4,
					cuboid({
						size: [chamferSize, sideGrooveLength + grooveDepth * 2, chamferSize],
						center: [0, 0, 0]
					})
				)
			);
			const rightCut = translate(
				[
					extWidth - wall / 2,
					wall + (sideGrooveLength + grooveDepth) / 2,
					grooveTopZ - grooveDepth
				],
				rotateY(
					Math.PI / 4,
					cuboid({
						size: [chamferSize, sideGrooveLength + grooveDepth * 2, chamferSize],
						center: [0, 0, 0]
					})
				)
			);

			supportBlock = subtract(supportBlock, backCut, leftCut, rightCut);
			result = union(result, supportBlock);
		}

		// Lock mechanism: either ramp lock or cylindrical detent notch
		if (rampLockEnabled) {
			// Ramp lock: add opposing ramps on groove walls near EXIT
			// These mesh with the lid rail ramps when lid is closed
			//
			// Box groove ramps are OPPOSITE to lid rail ramps:
			// - Steep slope faces entry, gentle slope faces exit
			// - This creates resistance when pulling lid out
			//
			const rampTotalLength = rampLengthIn + rampLengthOut;
			const rampThickness = grooveHeight * 0.8;
			// Position ramp at BOTTOM of groove channel (same approach for both X and Y slide)
			const grooveBottomZ = notchZ - grooveHeight / 2;

			if (slidesAlongX) {
				// Ramps on front and back groove walls, near ENTRY (low X)
				// Position at ENTRY end: start 2mm after the entry corner
				// The ramps lock the lid in place when pulled toward the opening
				const rampStartX = wall + 2;

				// Front groove ramp - positioned at INNER edge of groove, protrudes toward -Y (INTO the groove)
				// Swap rampLengthOut/In so steep slope faces opening (low X), gentle slope faces interior
				// Use mirrorY to flip protrusion from +Y to -Y, ramp extends upward in +Z
				const frontGrooveRamp = createRampWedge(rampLengthOut, rampLengthIn, rampHeight, rampThickness);
				const frontGrooveRampMirrored = mirrorY(frontGrooveRamp);
				const frontGrooveRampPositioned = translate(
					[rampStartX, wall / 2 + grooveDepth, grooveBottomZ],
					frontGrooveRampMirrored
				);

				// Back groove ramp - positioned at INNER edge of groove, protrudes toward +Y (INTO the groove)
				// No mirror needed - original wedge protrudes in +Y
				const backGrooveRamp = createRampWedge(rampLengthOut, rampLengthIn, rampHeight, rampThickness);
				const backGrooveRampPositioned = translate(
					[rampStartX, extDepth - wall / 2 - grooveDepth, grooveBottomZ],
					backGrooveRamp
				);

				result = union(result, frontGrooveRampPositioned, backGrooveRampPositioned);
			} else {
				// Ramps on left and right groove walls, near ENTRY (low Y)
				// Position at ENTRY end: start 2mm after the entry corner
				const rampStartY = wall + 2;
				// Position ramp at bottom of groove channel
				const rampZYslide = notchZ - grooveHeight / 2;

				// Left groove ramp - positioned at INNER edge of groove, protrudes toward -X (INTO the groove)
				const leftGrooveRamp = createRampWedge(rampLengthOut, rampLengthIn, rampHeight, rampThickness);
				const leftGrooveRampRotated = rotateZ(Math.PI / 2, leftGrooveRamp);
				const leftGrooveRampPositioned = translate(
					[wall / 2 + grooveDepth, rampStartY, rampZYslide],
					leftGrooveRampRotated
				);

				// Right groove ramp - positioned at INNER edge of groove, protrudes toward +X (INTO the groove)
				const rightGrooveRamp = createRampWedge(rampLengthOut, rampLengthIn, rampHeight, rampThickness);
				const rightGrooveRampRotated = rotateZ(Math.PI / 2, mirrorY(rightGrooveRamp));
				const rightGrooveRampPositioned = translate(
					[extWidth - wall / 2 - grooveDepth, rampStartY, rampZYslide],
					rightGrooveRampRotated
				);

				result = union(result, leftGrooveRampPositioned, rightGrooveRampPositioned);
			}
		} else {
			// Cylindrical detent notch at entry wall - legacy behavior
			const detentRadius = snapBumpHeight + 0.1;
			const detentLength = snapBumpWidth * 2;
			const detentNotch = slidesAlongX
				? translate(
						[wall / 2, extDepth / 2, extHeight],
						rotateX(
							Math.PI / 2,
							cylinder({
								radius: detentRadius,
								height: detentLength,
								segments: 32,
								center: [0, 0, 0]
							})
						)
					)
				: translate(
						[extWidth / 2, wall / 2, extHeight],
						rotateY(
							Math.PI / 2,
							cylinder({
								radius: detentRadius,
								height: detentLength,
								segments: 32,
								center: [0, 0, 0]
							})
						)
					);
			result = subtract(result, detentNotch);
		}

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
	// Also add tray name labels to the left of each hole
	const POKE_HOLE_DIAMETER = 20;
	const labelTextDepth = 0.6;
	const labelStrokeWidth = 1.0;
	const labelTextHeight = 5;

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

		// Add tray name label to the left of the hole
		if (p.tray.name && p.tray.name.trim().length > 0) {
			const textSegments = vectorText(
				{ height: labelTextHeight, align: 'center' },
				p.tray.name.trim().toUpperCase()
			);

			if (textSegments.length > 0) {
				const textShapes: Geom3[] = [];
				for (const segment of textSegments) {
					if (segment.length >= 2) {
						const pathObj = path2.fromPoints({ closed: false }, segment);
						const expanded = expand(
							{ delta: labelStrokeWidth / 2, corners: 'round', segments: 32 },
							pathObj
						);
						const extruded = extrudeLinear({ height: labelTextDepth + 0.1 }, expanded);
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
					const textWidthCalc = maxX - minX + labelStrokeWidth;
					const textHeightY = maxY - minY + labelStrokeWidth;

					// Available space to the left of the hole
					const holeLeftEdge = centerX - POKE_HOLE_DIAMETER / 2;
					const trayLeftEdge = wall + tolerance + p.x;
					const availableWidth = holeLeftEdge - trayLeftEdge - wall;

					if (availableWidth > 10) {
						// Scale text to fit
						const textScale = Math.min(
							1,
							Math.min(
								availableWidth / textWidthCalc,
								(p.dimensions.depth - wall * 2) / textHeightY
							)
						);
						const textCenterX = (minX + maxX) / 2;
						const textCenterY = (minY + maxY) / 2;

						// Position text centered in the space left of the hole
						const labelX = trayLeftEdge + availableWidth / 2;
						const labelY = centerY;

						const combinedText: Geom3 = union(...textShapes);

						// Position on inner floor surface (Z = floor), cutting down into the floor
						const positionedText = translate(
							[
								labelX - textCenterX * textScale,
								labelY - textCenterY * textScale,
								floor - labelTextDepth
							],
							scale([textScale, textScale, 1], combinedText)
						);
						result = subtract(result, positionedText);
					}
				}
			}
		}
	}

	return result;
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

	const placements = arrangeTrays(box.trays, {
		customBoxWidth: box.customWidth,
		wallThickness: box.wallThickness,
		tolerance: box.tolerance
	});
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

	// Ramp lock parameters
	const rampLockEnabled = box.lidParams?.rampLockEnabled ?? true;
	const rampHeight = box.lidParams?.rampHeight ?? 0.5;
	const rampLengthIn = box.lidParams?.rampLengthIn ?? 4.0;
	const rampLengthOut = box.lidParams?.rampLengthOut ?? 1.5;

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
	// Use actual box interior (custom exterior minus walls), not just tray area
	const actualInteriorWidth = extWidth - wall * 2;
	const actualInteriorDepth = extDepth - wall * 2;
	const cavityWidth = actualInteriorWidth + innerWallThickness * 2 + clearance * 2;
	const cavityDepth = actualInteriorDepth + innerWallThickness * 2 + clearance * 2;

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
				rotateY(
					Math.PI / 4,
					cuboid({
						size: [chamferSize, innerBackY - innerFrontY + railThickness * 4, chamferSize],
						center: [0, 0, 0]
					})
				)
			);
			const frontCut = translate(
				[sideRailCenterX, innerFrontY + railThickness, bottomZ],
				rotateX(
					-Math.PI / 4,
					cuboid({
						size: [sideRailLength + railThickness * 2, chamferSize, chamferSize],
						center: [0, 0, 0]
					})
				)
			);
			const backCut = translate(
				[sideRailCenterX, innerBackY - railThickness, bottomZ],
				rotateX(
					Math.PI / 4,
					cuboid({
						size: [sideRailLength + railThickness * 2, chamferSize, chamferSize],
						center: [0, 0, 0]
					})
				)
			);

			const rightRailChamfered = subtract(rightRailBlock, rightCut);
			const frontRailChamfered = subtract(frontRailBlock, frontCut);
			const backRailChamfered = subtract(backRailBlock, backCut);

			lid = union(lid, union(rightRailChamfered, frontRailChamfered, backRailChamfered));

			// Lock mechanism: either ramp lock or cylindrical detent
			if (rampLockEnabled) {
				// Ramp lock: CUTOUTS on front and back rails near ENTRY (low X)
				// The box has ramp bumps protruding outward from the groove walls.
				// The lid rails need matching cutouts that mesh with those bumps.
				//
				// X-slide: entry at low X (where there's no rail), exit at high X
				// Front rail outer face at innerFrontY, back rail outer face at innerBackY
				//
				const rampTotalLength = rampLengthIn + rampLengthOut;
				// Cutout extends through the rail thickness
				const rampThickness = railThickness + 0.2; // Slightly larger to ensure clean cut
				// Position cutout at TOP of rail (Z=topZ in lid coords = bottom when lid is flipped onto box)
				// The wedge extends from rampZ to rampZ+rampThickness, so position it so top edge is at topZ
				const rampZ = topZ - rampThickness;

				// ENTRY is at low X (left). Position cutout to align with box's ramp.
				// Box ramp is at wall + 2, so lid cutout should be at same X position
				const rampX = lipThicknessX + wall + 2;

				// Front rail cutout - peak points outward (-Y), flat side inward (+Y toward center)
				// Base at inner edge (innerFrontY + railThickness), peak cuts into rail toward outer edge
				const frontCutout = createRampWedge(rampLengthOut, rampLengthIn, rampHeight, rampThickness);
				const frontCutoutFlipped = mirrorY(frontCutout);
				const frontCutoutPositioned = translate(
					[rampX, innerFrontY + railThickness, rampZ],
					frontCutoutFlipped
				);

				// Back rail cutout - peak points outward (+Y), flat side inward (-Y toward center)
				// Base at inner edge (innerBackY - railThickness), peak cuts into rail toward outer edge
				const backCutout = createRampWedge(rampLengthOut, rampLengthIn, rampHeight, rampThickness);
				const backCutoutPositioned = translate(
					[rampX, innerBackY - railThickness, rampZ],
					backCutout
				);

				lid = subtract(lid, frontCutoutPositioned, backCutoutPositioned);

				// Triangular lead-in at the END of the rail (entry side)
				// This chamfers the bottom-inner corner so lid can ride up the box's ramp
				// Triangle cuts from INNER FACE of rail (toward center of lid)
				const leadInLength = rampHeight * 4; // Length along X
				const leadInDepth = rampHeight; // Depth into rail (Y direction) - keep small

				// Front rail: inner face is at Y = innerFrontY + railThickness
				// Triangle in X-Y plane, cutting from inner face toward outer
				const frontLeadIn = hull(
					// Inner face points (triangle)
					cylinder({ radius: 0.01, height: 0.01, center: [railStartX, innerFrontY + railThickness, bottomZ], segments: 8 }),
					cylinder({ radius: 0.01, height: 0.01, center: [railStartX + leadInLength, innerFrontY + railThickness, bottomZ], segments: 8 }),
					cylinder({ radius: 0.01, height: 0.01, center: [railStartX, innerFrontY + railThickness - leadInDepth, bottomZ], segments: 8 }),
					// Extend up through rail height
					cylinder({ radius: 0.01, height: 0.01, center: [railStartX, innerFrontY + railThickness, topZ], segments: 8 }),
					cylinder({ radius: 0.01, height: 0.01, center: [railStartX + leadInLength, innerFrontY + railThickness, topZ], segments: 8 }),
					cylinder({ radius: 0.01, height: 0.01, center: [railStartX, innerFrontY + railThickness - leadInDepth, topZ], segments: 8 })
				);

				// Back rail: inner face is at Y = innerBackY - railThickness
				const backLeadIn = hull(
					// Inner face points (triangle)
					cylinder({ radius: 0.01, height: 0.01, center: [railStartX, innerBackY - railThickness, bottomZ], segments: 8 }),
					cylinder({ radius: 0.01, height: 0.01, center: [railStartX + leadInLength, innerBackY - railThickness, bottomZ], segments: 8 }),
					cylinder({ radius: 0.01, height: 0.01, center: [railStartX, innerBackY - railThickness + leadInDepth, bottomZ], segments: 8 }),
					// Extend up through rail height
					cylinder({ radius: 0.01, height: 0.01, center: [railStartX, innerBackY - railThickness, topZ], segments: 8 }),
					cylinder({ radius: 0.01, height: 0.01, center: [railStartX + leadInLength, innerBackY - railThickness, topZ], segments: 8 }),
					cylinder({ radius: 0.01, height: 0.01, center: [railStartX, innerBackY - railThickness + leadInDepth, topZ], segments: 8 })
				);

				lid = subtract(lid, frontLeadIn, backLeadIn);
			} else {
				// Cylindrical detent bump at entry (low X) - legacy behavior
				const detentRadius = snapBumpHeight;
				const detentLength = snapBumpWidth * 2;
				const topPlateInnerZ = lidHeight - lipHeight;
				const detentBump = translate(
					[wall / 2, extDepth / 2, topPlateInnerZ],
					rotateX(
						Math.PI / 2,
						cylinder({
							radius: detentRadius,
							height: detentLength,
							segments: 32,
							center: [0, 0, 0]
						})
					)
				);
				lid = union(lid, detentBump);
			}
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
				rotateX(
					Math.PI / 4,
					cuboid({
						size: [innerRightX - innerLeftX + railThickness * 4, chamferSize, chamferSize],
						center: [0, 0, 0]
					})
				)
			);
			const leftCut = translate(
				[innerLeftX + railThickness, sideRailCenterY, bottomZ],
				rotateY(
					-Math.PI / 4,
					cuboid({
						size: [chamferSize, sideRailLength + railThickness * 2, chamferSize],
						center: [0, 0, 0]
					})
				)
			);
			const rightCut = translate(
				[innerRightX - railThickness, sideRailCenterY, bottomZ],
				rotateY(
					Math.PI / 4,
					cuboid({
						size: [chamferSize, sideRailLength + railThickness * 2, chamferSize],
						center: [0, 0, 0]
					})
				)
			);

			const backRailChamfered = subtract(backRailBlock, backCut);
			const leftRailChamfered = subtract(leftRailBlock, leftCut);
			const rightRailChamfered = subtract(rightRailBlock, rightCut);

			lid = union(lid, union(backRailChamfered, leftRailChamfered, rightRailChamfered));

			// Lock mechanism: either ramp lock or cylindrical detent
			if (rampLockEnabled) {
				// Ramp lock: CUTOUTS on left and right rails near ENTRY (low Y)
				// The box has ramp bumps protruding outward from the groove walls.
				// The lid rails need matching cutouts that mesh with those bumps.
				//
				// Y-slide: entry at low Y, exit at high Y
				// Left rail inner face at innerLeftX + railThickness
				// Right rail inner face at innerRightX - railThickness
				//
				const rampTotalLength = rampLengthIn + rampLengthOut;
				// Cutout extends through the rail thickness
				const rampCutThickness = railThickness + 0.2;
				// Position cutout at TOP of rail (bottom when lid is flipped onto box)
				const rampZ = topZ - rampCutThickness;

				// ENTRY is at low Y (front). Position cutout to align with box's ramp.
				const rampY = lipThicknessY + wall + 2;

				// Left rail cutout - cuts from inner face toward outer (-X direction)
				// rotateZ(PI/2): ramp extends along +Y, peak toward -X
				const leftCutout = createRampWedge(rampLengthOut, rampLengthIn, rampHeight, rampCutThickness);
				const leftCutoutRotated = rotateZ(Math.PI / 2, leftCutout);
				const leftCutoutPositioned = translate(
					[innerLeftX + railThickness, rampY, rampZ],
					leftCutoutRotated
				);

				// Right rail cutout - cuts from inner face toward outer (+X direction)
				// mirrorY then rotateZ(PI/2): ramp extends along +Y, peak toward +X
				const rightCutout = createRampWedge(rampLengthOut, rampLengthIn, rampHeight, rampCutThickness);
				const rightCutoutRotated = rotateZ(Math.PI / 2, mirrorY(rightCutout));
				const rightCutoutPositioned = translate(
					[innerRightX - railThickness, rampY, rampZ],
					rightCutoutRotated
				);

				lid = subtract(lid, leftCutoutPositioned, rightCutoutPositioned);

				// Triangular lead-in at the END of the rail (entry side)
				// This chamfers the inner corner so lid can ride up the box's ramp
				const leadInLength = rampHeight * 4; // Length along Y
				const leadInDepth = rampHeight; // Depth into rail (X direction)

				// Left rail lead-in: inner face at innerLeftX + railThickness
				const leftLeadIn = hull(
					cylinder({ radius: 0.01, height: 0.01, center: [innerLeftX + railThickness, railStartY, bottomZ], segments: 8 }),
					cylinder({ radius: 0.01, height: 0.01, center: [innerLeftX + railThickness, railStartY + leadInLength, bottomZ], segments: 8 }),
					cylinder({ radius: 0.01, height: 0.01, center: [innerLeftX + railThickness - leadInDepth, railStartY, bottomZ], segments: 8 }),
					cylinder({ radius: 0.01, height: 0.01, center: [innerLeftX + railThickness, railStartY, topZ], segments: 8 }),
					cylinder({ radius: 0.01, height: 0.01, center: [innerLeftX + railThickness, railStartY + leadInLength, topZ], segments: 8 }),
					cylinder({ radius: 0.01, height: 0.01, center: [innerLeftX + railThickness - leadInDepth, railStartY, topZ], segments: 8 })
				);

				// Right rail lead-in: inner face at innerRightX - railThickness
				const rightLeadIn = hull(
					cylinder({ radius: 0.01, height: 0.01, center: [innerRightX - railThickness, railStartY, bottomZ], segments: 8 }),
					cylinder({ radius: 0.01, height: 0.01, center: [innerRightX - railThickness, railStartY + leadInLength, bottomZ], segments: 8 }),
					cylinder({ radius: 0.01, height: 0.01, center: [innerRightX - railThickness + leadInDepth, railStartY, bottomZ], segments: 8 }),
					cylinder({ radius: 0.01, height: 0.01, center: [innerRightX - railThickness, railStartY, topZ], segments: 8 }),
					cylinder({ radius: 0.01, height: 0.01, center: [innerRightX - railThickness, railStartY + leadInLength, topZ], segments: 8 }),
					cylinder({ radius: 0.01, height: 0.01, center: [innerRightX - railThickness + leadInDepth, railStartY, topZ], segments: 8 })
				);

				lid = subtract(lid, leftLeadIn, rightLeadIn);
			} else {
				// Cylindrical detent bump at entry (low Y) - legacy behavior
				const detentRadius = snapBumpHeight;
				const detentLength = snapBumpWidth * 2;
				const topPlateInnerZ = lidHeight - lipHeight;
				const detentBump = translate(
					[extWidth / 2, wall / 2, topPlateInnerZ],
					rotateY(
						Math.PI / 2,
						cylinder({
							radius: detentRadius,
							height: detentLength,
							segments: 32,
							center: [0, 0, 0]
						})
					)
				);
				lid = union(lid, detentBump);
			}
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
		const textSegments = vectorText(
			{ height: textHeight, align: 'center' },
			box.name.trim().toUpperCase()
		);

		if (textSegments.length > 0) {
			// Convert segments to path2, expand to give stroke width, and extrude
			const textShapes: Geom3[] = [];
			for (const segment of textSegments) {
				if (segment.length >= 2) {
					const pathObj = path2.fromPoints({ closed: false }, segment);
					const expanded = expand(
						{ delta: strokeWidth / 2, corners: 'round', segments: 64 },
						pathObj
					);
					const extruded = extrudeLinear({ height: textDepth + 0.1 }, expanded);
					textShapes.push(extruded);
				}
			}

			if (textShapes.length > 0) {
				// Calculate text bounds to center it
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
				// Match the same orientation as the poke hole tray labels inside the box
				let combinedText: Geom3 = union(...textShapes);
				combinedText = mirrorY(combinedText); // Flip letters right-side up

				// If lid is longer in Y, rotate text 90° to read along Y axis
				if (rotateText) {
					combinedText = rotateZ(Math.PI / 2, combinedText);
					// After mirrorY + rotateZ: center at (textCenterY, textCenterX)
					const positionedText = translate(
						[centerX - textCenterY * textScale, centerY - textCenterX * textScale, -0.1],
						scale([textScale, textScale, 1], combinedText)
					);
					lid = subtract(lid, positionedText);
				} else {
					const positionedText = translate(
						[centerX - textCenterX * textScale, centerY + textCenterY * textScale, -0.1],
						scale([textScale, textScale, 1], combinedText)
					);
					lid = subtract(lid, positionedText);
				}
			}
		}
	}

	return lid;
}
