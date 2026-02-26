import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';
import type { Box, Tray } from '$lib/types/project';
import type { CounterTrayParams } from './counterTray';

const { cylinder } = jscad.primitives;
const { subtract } = jscad.booleans;
const { translate } = jscad.transforms;
const { hull } = jscad.hulls;

export interface TrayDimensions {
	width: number; // X dimension
	depth: number; // Y dimension
	height: number; // Z dimension
}

export interface TrayPlacement {
	tray: Tray;
	dimensions: TrayDimensions;
	x: number;
	y: number;
}

export interface BoxMinimumDimensions {
	minWidth: number; // Minimum exterior X
	minDepth: number; // Minimum exterior Y
	minHeight: number; // Minimum exterior Z
}

export interface ValidationResult {
	valid: boolean;
	errors: string[];
	minimums: BoxMinimumDimensions;
}

export interface TraySpacerInfo {
	trayId: string;
	placement: TrayPlacement;
	floorSpacerHeight: number; // Additional solid material under tray floor
}

// Calculate tray dimensions from params (same logic as counterTray.ts)
export function getTrayDimensions(params: CounterTrayParams): TrayDimensions {
	const {
		squareWidth,
		squareLength,
		hexFlatToFlat: hexFlatToFlatBase,
		circleDiameter: circleDiameterBase,
		triangleSide: triangleSideBase,
		counterThickness,
		hexPointyTop,
		clearance,
		wallThickness,
		floorThickness,
		rimHeight,
		trayWidthOverride,
		topLoadedStacks,
		edgeLoadedStacks,
		customShapes
	} = params;

	// Use topLoadedStacks (renamed from stacks)
	const stacks = topLoadedStacks || [];

	// Pocket dimensions per shape
	const squarePocketWidth = squareWidth + clearance * 2;
	const squarePocketLength = squareLength + clearance * 2;

	const hexFlatToFlat = hexFlatToFlatBase + clearance * 2;
	const hexPointToPoint = hexFlatToFlat / Math.cos(Math.PI / 6);
	const hexPocketWidth = hexPointyTop ? hexFlatToFlat : hexPointToPoint;
	const hexPocketLength = hexPointyTop ? hexPointToPoint : hexFlatToFlat;

	const circleDiameter = circleDiameterBase + clearance * 2;
	const circlePocketWidth = circleDiameter;
	const circlePocketLength = circleDiameter;

	// Triangle: equilateral, side length is the base (X), height is side * sqrt(3)/2 (Y)
	const triangleSide = triangleSideBase + clearance * 2;
	const triangleHeight = triangleSide * (Math.sqrt(3) / 2);
	const trianglePocketWidth = triangleSide;
	const trianglePocketLength = triangleHeight;

	// Helper to get custom shape by name from 'custom:ShapeName' reference
	const getCustomShape = (shapeRef: string) => {
		if (!shapeRef.startsWith('custom:')) return null;
		const name = shapeRef.substring(7);
		return customShapes?.find((s) => s.name === name) || null;
	};

	// Get effective dimensions for custom shapes based on their base shape
	// Returns [width, length] accounting for hex point-to-point calculations
	const getCustomEffectiveDims = (
		custom: NonNullable<ReturnType<typeof getCustomShape>>
	): [number, number] => {
		const baseShape = custom.baseShape ?? 'rectangle';
		if (baseShape === 'hex') {
			// width stores flat-to-flat, calculate point-to-point
			const flatToFlat = custom.width;
			const pointToPoint = flatToFlat / Math.cos(Math.PI / 6);
			// Use global hexPointyTop to determine orientation
			const w = hexPointyTop ? flatToFlat : pointToPoint;
			const l = hexPointyTop ? pointToPoint : flatToFlat;
			return [w, l];
		}
		if (baseShape === 'triangle') {
			// width stores side length, height = side * sqrt(3)/2
			const side = custom.width;
			const height = side * (Math.sqrt(3) / 2);
			return [side, height]; // Base (X) x Height (Y)
		}
		if (baseShape === 'circle' || baseShape === 'square') {
			// Both dimensions are equal (diameter or size)
			return [custom.width, custom.width];
		}
		// Rectangle: use width and length directly
		return [custom.width, custom.length];
	};

	// For top-loaded/crosswise custom shapes: LONGER side = width (X), SHORTER side = length (Y)
	const getPocketWidth = (shape: string): number => {
		if (shape === 'square') return squarePocketWidth;
		if (shape === 'hex') return hexPocketWidth;
		if (shape === 'triangle') return trianglePocketWidth;
		const custom = getCustomShape(shape);
		if (custom) {
			const [w, l] = getCustomEffectiveDims(custom);
			return Math.max(w, l) + clearance * 2; // Longer side along X (parallel to tray width)
		}
		return circlePocketWidth;
	};

	const getPocketLength = (shape: string): number => {
		if (shape === 'square') return squarePocketLength;
		if (shape === 'hex') return hexPocketLength;
		if (shape === 'triangle') return trianglePocketLength;
		const custom = getCustomShape(shape);
		if (custom) {
			const [w, l] = getCustomEffectiveDims(custom);
			return Math.min(w, l) + clearance * 2; // Shorter side along Y
		}
		return circlePocketLength;
	};

	// For lengthwise edge-loaded: longest dimension runs perpendicular to tray (along Y)
	// This prevents the slot from receding too far into the tray depth
	const getPocketLengthLengthwise = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (custom) {
			const [w, l] = getCustomEffectiveDims(custom);
			return Math.max(w, l) + clearance * 2; // Longer side along Y (perpendicular to tray width)
		}
		return getPocketLength(shape);
	};

	// For lengthwise custom shapes: shorter dimension is height (longer runs along Y)
	const getStandingHeightLengthwise = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (custom) {
			const [w, l] = getCustomEffectiveDims(custom);
			return Math.min(w, l); // Shorter side is height
		}
		return getCounterStandingHeight(shape);
	};

	// For crosswise custom shapes: shorter dimension is height (longer runs along X)
	const getStandingHeightCrosswise = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (custom) {
			const [w, l] = getCustomEffectiveDims(custom);
			return Math.min(w, l); // Shorter side is height
		}
		return getCounterStandingHeight(shape);
	};

	// Get actual counter dimensions (without clearance) for standing height
	const getCounterWidth = (shape: string): number => {
		if (shape === 'square') return squareWidth;
		if (shape === 'hex')
			return hexPointyTop ? hexFlatToFlatBase : hexFlatToFlatBase / Math.cos(Math.PI / 6);
		if (shape === 'triangle') return triangleSideBase;
		const custom = getCustomShape(shape);
		if (custom) {
			const [w, l] = getCustomEffectiveDims(custom);
			return Math.max(w, l); // Longer side along X
		}
		return circleDiameterBase;
	};

	const getCounterLength = (shape: string): number => {
		if (shape === 'square') return squareLength;
		if (shape === 'hex')
			return hexPointyTop ? hexFlatToFlatBase / Math.cos(Math.PI / 6) : hexFlatToFlatBase;
		if (shape === 'triangle') return triangleSideBase * (Math.sqrt(3) / 2);
		const custom = getCustomShape(shape);
		if (custom) {
			const [w, l] = getCustomEffectiveDims(custom);
			return Math.min(w, l); // Shorter side along Y
		}
		return circleDiameterBase;
	};

	// Get counter standing height (for edge-loaded stacks) - uses actual counter size, not pocket size
	const getCounterStandingHeight = (shape: string): number =>
		Math.max(getCounterWidth(shape), getCounterLength(shape));

	// === TOP-LOADED STACK PLACEMENTS (greedy bin-packing) ===
	interface TopLoadedPlacement {
		shapeRef: string;
		count: number;
		pocketWidth: number;
		pocketLength: number;
		rowAssignment: 'front' | 'back';
		xPosition: number;
	}

	// Sort top-loaded stacks by area (largest first for better packing)
	const sortedStacks = [...stacks]
		.map((s, i) => ({ stack: s, originalIndex: i }))
		.sort((a, b) => {
			const areaA = getPocketWidth(a.stack[0]) * getPocketLength(a.stack[0]);
			const areaB = getPocketWidth(b.stack[0]) * getPocketLength(b.stack[0]);
			return areaB - areaA; // Largest first
		});

	const topLoadedPlacements: TopLoadedPlacement[] = [];

	// Track max top-loaded stack height
	let maxStackHeight = 0;
	for (const { stack } of sortedStacks) {
		const stackHeight = stack[1] * counterThickness;
		maxStackHeight = Math.max(maxStackHeight, stackHeight);
	}

	// Edge-loaded stack calculations
	let maxEdgeLoadedHeight = 0;
	let crosswiseMaxDepth = 0;

	// Cutout ratio/max for half-sphere cutouts (same as counterTray.ts defaults)
	const cutoutRatio = 0.3;
	const cutoutMax = 12;

	// Track lengthwise and crosswise slots
	interface LengthwiseSlot {
		slotDepth: number;
		slotWidth: number;
		rowAssignment?: 'front' | 'back';
	}
	interface CrosswiseSlot {
		slotWidth: number;
		slotDepth: number;
		rowAssignment?: 'front' | 'back';
	}
	const lengthwiseSlots: LengthwiseSlot[] = [];
	const crosswiseSlots: CrosswiseSlot[] = [];

	if (edgeLoadedStacks && edgeLoadedStacks.length > 0) {
		for (const stack of edgeLoadedStacks) {
			const counterSpan = stack[1] * counterThickness + (stack[1] - 1) * clearance;
			const orientation = stack[2] || 'lengthwise';

			if (orientation === 'lengthwise') {
				// For custom shapes: longer side along Y (perpendicular to tray), shorter side is height
				const standingHeight = getStandingHeightLengthwise(stack[0]);
				maxEdgeLoadedHeight = Math.max(maxEdgeLoadedHeight, standingHeight);
				const slotDepthDim = getPocketLengthLengthwise(stack[0]);
				lengthwiseSlots.push({ slotDepth: slotDepthDim, slotWidth: counterSpan });
			} else {
				// For custom shapes: longer side along X (parallel to tray width), shorter side is height
				const standingHeight = getStandingHeightCrosswise(stack[0]);
				maxEdgeLoadedHeight = Math.max(maxEdgeLoadedHeight, standingHeight);
				const slotWidthDim = getPocketWidth(stack[0]); // Longer side along X
				crosswiseMaxDepth = Math.max(crosswiseMaxDepth, counterSpan);
				crosswiseSlots.push({ slotWidth: slotWidthDim, slotDepth: counterSpan });
			}
		}
	}

	// === GREEDY BIN-PACKING FOR LENGTHWISE SLOTS ===
	// Adjacent slots share a half-cylinder cutout; first slot uses wall cutout (no left space needed)
	let frontRowX = wallThickness;
	let backRowX = wallThickness;

	for (const slot of lengthwiseSlots) {
		const cutoutRadius = Math.min(cutoutMax, slot.slotDepth * cutoutRatio);

		if (frontRowX <= backRowX) {
			slot.rowAssignment = 'front';
			frontRowX += slot.slotWidth + cutoutRadius + wallThickness;
		} else {
			slot.rowAssignment = 'back';
			backRowX += slot.slotWidth + cutoutRadius + wallThickness;
		}
	}

	// Calculate effective row depths (including lengthwise) - needed before crosswise bin-packing
	let effectiveFrontRowDepth = 0;
	let effectiveBackRowDepth = 0;
	for (const slot of lengthwiseSlots) {
		if (slot.rowAssignment === 'front') {
			effectiveFrontRowDepth = Math.max(effectiveFrontRowDepth, slot.slotDepth);
		} else {
			effectiveBackRowDepth = Math.max(effectiveBackRowDepth, slot.slotDepth);
		}
	}

	// === CROSSWISE SLOT BIN-PACKING ===
	// Try to pair crosswise slots into columns (one at front, one at back) when they fit
	interface CrosswiseColumn {
		frontSlot: CrosswiseSlot | null;
		backSlot: CrosswiseSlot | null;
		columnWidth: number;
	}
	const crosswiseColumns: CrosswiseColumn[] = [];

	// Sort crosswise by slotDepth (largest first) to improve packing
	const sortedCrosswiseSlots = [...crosswiseSlots].sort((a, b) => b.slotDepth - a.slotDepth);

	// Assign each crosswise slot to a column
	for (const slot of sortedCrosswiseSlots) {
		let placed = false;

		// Try to fit in an existing column's back position
		for (const col of crosswiseColumns) {
			if (col.backSlot === null && col.frontSlot) {
				// Check if combined depth fits
				const combinedDepth = col.frontSlot.slotDepth + wallThickness + slot.slotDepth;
				const availableDepth = effectiveFrontRowDepth + wallThickness + effectiveBackRowDepth;

				if (combinedDepth <= availableDepth || availableDepth === 0) {
					col.backSlot = slot;
					col.columnWidth = Math.max(col.columnWidth, slot.slotWidth);
					slot.rowAssignment = 'back';
					placed = true;
					break;
				}
			}
		}

		if (!placed) {
			crosswiseColumns.push({
				frontSlot: slot,
				backSlot: null,
				columnWidth: slot.slotWidth
			});
			slot.rowAssignment = 'front';
		}
	}

	// Calculate crosswise total width from columns
	let crosswiseX = Math.max(frontRowX, backRowX);
	for (const col of crosswiseColumns) {
		crosswiseX += col.columnWidth + wallThickness;
	}

	// Use the maximum of top-loaded and edge-loaded heights
	const finalMaxStackHeight = Math.max(maxStackHeight, maxEdgeLoadedHeight);

	// X offset where top-loaded stacks begin (after all edge-loaded)
	const edgeLoadedEndX = crosswiseSlots.length > 0 ? crosswiseX : Math.max(frontRowX, backRowX);
	const hasEdgeLoaded = edgeLoadedStacks && edgeLoadedStacks.length > 0;
	let topLoadedFrontX = hasEdgeLoaded ? edgeLoadedEndX : wallThickness;
	let topLoadedBackX = hasEdgeLoaded ? edgeLoadedEndX : wallThickness;

	// Greedy bin-packing for top-loaded stacks
	for (const { stack } of sortedStacks) {
		const [shapeRef, count] = stack;
		const pw = getPocketWidth(shapeRef);
		const pl = getPocketLength(shapeRef);

		// Assign to row with less current X (greedy approach)
		if (topLoadedFrontX <= topLoadedBackX) {
			topLoadedPlacements.push({
				shapeRef,
				count,
				pocketWidth: pw,
				pocketLength: pl,
				rowAssignment: 'front',
				xPosition: topLoadedFrontX
			});
			topLoadedFrontX += pw + wallThickness;
		} else {
			topLoadedPlacements.push({
				shapeRef,
				count,
				pocketWidth: pw,
				pocketLength: pl,
				rowAssignment: 'back',
				xPosition: topLoadedBackX
			});
			topLoadedBackX += pw + wallThickness;
		}
	}

	// Update effective row depths to include top-loaded stacks
	for (const placement of topLoadedPlacements) {
		if (placement.rowAssignment === 'front') {
			effectiveFrontRowDepth = Math.max(effectiveFrontRowDepth, placement.pocketLength);
		} else {
			effectiveBackRowDepth = Math.max(effectiveBackRowDepth, placement.pocketLength);
		}
	}

	// Tray length (X dimension)
	const topLoadedEndX = Math.max(topLoadedFrontX, topLoadedBackX);
	const trayWidthAuto = topLoadedPlacements.length > 0 ? topLoadedEndX : edgeLoadedEndX;
	const trayWidth = trayWidthOverride > 0 ? trayWidthOverride : trayWidthAuto;

	// Tray width (Y dimension) - always 2 rows
	const topLoadedTotalDepth =
		effectiveFrontRowDepth +
		(effectiveBackRowDepth > 0 ? wallThickness + effectiveBackRowDepth : 0);
	const trayDepthAuto = topLoadedTotalDepth > 0 ? topLoadedTotalDepth : crosswiseMaxDepth;
	const trayDepth = wallThickness + trayDepthAuto + wallThickness;

	const trayHeight = floorThickness + finalMaxStackHeight + rimHeight;

	return {
		width: trayWidth, // X
		depth: trayDepth, // Y
		height: trayHeight // Z
	};
}

// Arrange trays in a box layout with bin-packing
// Smaller trays can share a row if their combined width fits within the max tray width
// If customBoxWidth is provided, use interior width (minus walls/tolerance) for packing
export function arrangeTrays(
	trays: Tray[],
	options?: { customBoxWidth?: number; wallThickness?: number; tolerance?: number }
): TrayPlacement[] {
	if (trays.length === 0) return [];

	// Calculate dimensions for all trays
	const trayDims = trays.map((tray) => ({
		tray,
		dimensions: getTrayDimensions(tray.params)
	}));

	// Sort by width (X dimension) descending so widest trays are first
	trayDims.sort((a, b) => b.dimensions.width - a.dimensions.width);

	// Use custom box interior width if provided, otherwise use widest tray
	const widestTrayWidth = trayDims[0].dimensions.width;
	let maxRowWidth = widestTrayWidth;

	if (options?.customBoxWidth) {
		const wallThickness = options.wallThickness ?? 3;
		const tolerance = options.tolerance ?? 0.5;
		const interiorWidth = options.customBoxWidth - wallThickness * 2 - tolerance * 2;
		maxRowWidth = Math.max(interiorWidth, widestTrayWidth);
	}

	// Track rows: each row has a Y position, current X fill, and max depth
	interface Row {
		y: number;
		currentX: number;
		depth: number;
	}
	const rows: Row[] = [];

	// Track which row each placement belongs to
	interface PlacementWithRow {
		tray: Tray;
		dimensions: TrayDimensions;
		x: number;
		rowIndex: number;
	}
	const placementsWithRow: PlacementWithRow[] = [];

	console.log(
		`\n=== arrangeTrays: ${trays.length} trays, maxRowWidth: ${maxRowWidth.toFixed(1)} ===`
	);

	for (const { tray, dimensions } of trayDims) {
		console.log(
			`Placing tray "${tray.name}": ${dimensions.width.toFixed(1)}w x ${dimensions.depth.toFixed(1)}d`
		);

		// Try to find an existing row where this tray fits
		let placed = false;
		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			if (row.currentX + dimensions.width <= maxRowWidth) {
				// Fits in this row
				const oldDepth = row.depth;
				placementsWithRow.push({
					tray,
					dimensions,
					x: row.currentX,
					rowIndex: i
				});
				row.currentX += dimensions.width;
				row.depth = Math.max(row.depth, dimensions.depth);
				console.log(`  -> Placed in row ${i} at x=${row.currentX - dimensions.width}`);
				if (row.depth !== oldDepth) {
					console.log(
						`  -> Row ${i} depth changed: ${oldDepth.toFixed(1)} -> ${row.depth.toFixed(1)}`
					);
				}
				placed = true;
				break;
			}
		}

		if (!placed) {
			// Create a new row (Y will be calculated after all placements)
			rows.push({
				y: 0, // Placeholder, will be recalculated
				currentX: dimensions.width,
				depth: dimensions.depth
			});
			placementsWithRow.push({
				tray,
				dimensions,
				x: 0,
				rowIndex: rows.length - 1
			});
			console.log(`  -> Created row ${rows.length - 1}, depth=${dimensions.depth.toFixed(1)}`);
		}
	}

	// Recalculate row Y positions based on actual final depths
	let currentY = 0;
	for (let i = 0; i < rows.length; i++) {
		rows[i].y = currentY;
		currentY += rows[i].depth;
	}

	// Build final placements with correct Y positions
	// For row 0 (against south box wall): push smaller trays to north edge of row
	// so the gap merges with the box wall instead of creating an internal wall
	const placements: TrayPlacement[] = placementsWithRow.map((p) => {
		const row = rows[p.rowIndex];
		let y = row.y;

		// First row: align to north edge (push away from south box wall)
		if (p.rowIndex === 0 && p.dimensions.depth < row.depth) {
			y = row.y + (row.depth - p.dimensions.depth);
			console.log(
				`  Pushing "${p.tray.name}" north in row 0: y=${y.toFixed(1)} (gap of ${(row.depth - p.dimensions.depth).toFixed(1)} at south)`
			);
		}

		return {
			tray: p.tray,
			dimensions: p.dimensions,
			x: p.x,
			y
		};
	});

	console.log(`\nFinal rows:`);
	for (let i = 0; i < rows.length; i++) {
		console.log(
			`  Row ${i}: y=${rows[i].y.toFixed(1)}, depth=${rows[i].depth.toFixed(1)}, fillX=${rows[i].currentX.toFixed(1)}`
		);
	}
	console.log(`\nPlacements:`);
	for (const p of placements) {
		console.log(
			`  ${p.tray.name}: (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) - ${p.dimensions.width.toFixed(1)}x${p.dimensions.depth.toFixed(1)}`
		);
	}

	return placements;
}

// Calculate box interior dimensions from tray placements
export function getBoxInteriorDimensions(
	placements: TrayPlacement[],
	tolerance: number
): TrayDimensions {
	if (placements.length === 0) {
		return { width: 0, depth: 0, height: 0 };
	}

	let maxX = 0;
	let maxY = 0;
	let maxHeight = 0;

	for (const p of placements) {
		maxX = Math.max(maxX, p.x + p.dimensions.width);
		maxY = Math.max(maxY, p.y + p.dimensions.depth);
		maxHeight = Math.max(maxHeight, p.dimensions.height);
	}

	// Add tolerance around all sides
	return {
		width: maxX + tolerance * 2,
		depth: maxY + tolerance * 2,
		height: maxHeight + tolerance
	};
}

// Corner radius for rounded boxes (proportional to wall thickness)
const getCornerRadius = (wallThickness: number): number => Math.max(wallThickness * 1.5, 3);

// Segment count for rounded corners (higher = smoother, but slower generation)
const CORNER_SEGMENTS = 64;

// Create a rounded rectangle outline using hull of cylinders at corners
function createRoundedBox(
	width: number,
	depth: number,
	height: number,
	cornerRadius: number,
	center: [number, number, number]
): Geom3 {
	const r = Math.min(cornerRadius, width / 2, depth / 2);
	const [cx, cy, cz] = center;

	// Create cylinders at 4 corners and hull them
	const corners = [
		translate(
			[cx - width / 2 + r, cy - depth / 2 + r, cz],
			cylinder({ radius: r, height, segments: CORNER_SEGMENTS })
		),
		translate(
			[cx + width / 2 - r, cy - depth / 2 + r, cz],
			cylinder({ radius: r, height, segments: CORNER_SEGMENTS })
		),
		translate(
			[cx - width / 2 + r, cy + depth / 2 - r, cz],
			cylinder({ radius: r, height, segments: CORNER_SEGMENTS })
		),
		translate(
			[cx + width / 2 - r, cy + depth / 2 - r, cz],
			cylinder({ radius: r, height, segments: CORNER_SEGMENTS })
		)
	];

	return hull(...corners);
}

// Diameter of poke holes for pushing trays out from below
const POKE_HOLE_DIAMETER = 15;

// Create box geometry with rounded corners
export function createBox(box: Box): Geom3 | null {
	if (box.trays.length === 0) return null;

	const placements = arrangeTrays(box.trays, {
		customBoxWidth: box.customWidth,
		wallThickness: box.wallThickness,
		tolerance: box.tolerance
	});
	const interior = getBoxInteriorDimensions(placements, box.tolerance);

	// Box exterior dimensions
	const exteriorWidth = interior.width + box.wallThickness * 2;
	const exteriorDepth = interior.depth + box.wallThickness * 2;
	const exteriorHeight = interior.height + box.floorThickness;

	const cornerRadius = getCornerRadius(box.wallThickness);
	const innerCornerRadius = Math.max(cornerRadius - box.wallThickness, 1);

	// Create outer shell with rounded corners
	const outer = createRoundedBox(exteriorWidth, exteriorDepth, exteriorHeight, cornerRadius, [
		exteriorWidth / 2,
		exteriorDepth / 2,
		exteriorHeight / 2
	]);

	// Create interior cavity with rounded corners
	const inner = translate(
		[box.wallThickness, box.wallThickness, box.floorThickness],
		createRoundedBox(interior.width, interior.depth, interior.height + 1, innerCornerRadius, [
			interior.width / 2,
			interior.depth / 2,
			(interior.height + 1) / 2
		])
	);

	let result = subtract(outer, inner);

	// Create poke holes at the center of each tray position
	for (const p of placements) {
		// Calculate center of tray in box coordinates
		// Tray positions are relative to interior, add wall thickness and tolerance offset
		const centerX = box.wallThickness + box.tolerance + p.x + p.dimensions.width / 2;
		const centerY = box.wallThickness + box.tolerance + p.y + p.dimensions.depth / 2;

		const hole = translate(
			[centerX, centerY, box.floorThickness / 2],
			cylinder({
				radius: POKE_HOLE_DIAMETER / 2,
				height: box.floorThickness + 1,
				segments: 32
			})
		);
		result = subtract(result, hole);
	}

	return result;
}

// Calculate minimum required exterior dimensions for a box
export function calculateMinimumBoxDimensions(box: Box): BoxMinimumDimensions {
	if (box.trays.length === 0) {
		return { minWidth: 0, minDepth: 0, minHeight: 0 };
	}

	const placements = arrangeTrays(box.trays, {
		customBoxWidth: box.customWidth,
		wallThickness: box.wallThickness,
		tolerance: box.tolerance
	});
	const interior = getBoxInteriorDimensions(placements, box.tolerance);

	return {
		minWidth: interior.width + box.wallThickness * 2,
		minDepth: interior.depth + box.wallThickness * 2,
		minHeight: interior.height + box.floorThickness
	};
}

// Validate custom dimensions against minimum requirements
export function validateCustomDimensions(box: Box): ValidationResult {
	const minimums = calculateMinimumBoxDimensions(box);
	const errors: string[] = [];

	if (box.customWidth !== undefined && box.customWidth < minimums.minWidth) {
		errors.push(
			`Custom width (${box.customWidth.toFixed(1)}mm) is smaller than minimum required (${minimums.minWidth.toFixed(1)}mm)`
		);
	}
	if (box.customDepth !== undefined && box.customDepth < minimums.minDepth) {
		errors.push(
			`Custom depth (${box.customDepth.toFixed(1)}mm) is smaller than minimum required (${minimums.minDepth.toFixed(1)}mm)`
		);
	}
	if (box.customBoxHeight !== undefined && box.customBoxHeight < minimums.minHeight) {
		errors.push(
			`Custom height (${box.customBoxHeight.toFixed(1)}mm) is smaller than minimum required (${minimums.minHeight.toFixed(1)}mm)`
		);
	}

	return {
		valid: errors.length === 0,
		errors,
		minimums
	};
}

// Calculate floor spacer heights for each tray to fill height gaps
export function calculateTraySpacers(box: Box): TraySpacerInfo[] {
	if (box.trays.length === 0) return [];

	const placements = arrangeTrays(box.trays, {
		customBoxWidth: box.customWidth,
		wallThickness: box.wallThickness,
		tolerance: box.tolerance
	});
	const minimums = calculateMinimumBoxDimensions(box);

	// Target exterior height (custom or auto)
	const targetExteriorHeight = box.customBoxHeight ?? minimums.minHeight;
	const extraHeight = Math.max(0, targetExteriorHeight - minimums.minHeight);

	// Each tray gets the same floor spacer (keeps all trays flush at top)
	return placements.map((placement) => ({
		trayId: placement.tray.id,
		placement,
		floorSpacerHeight: extraHeight
	}));
}

// Get box exterior dimensions (uses custom dimensions when set)
export function getBoxDimensions(box: Box): TrayDimensions | null {
	if (box.trays.length === 0) return null;

	const minimums = calculateMinimumBoxDimensions(box);

	return {
		width: box.customWidth ?? minimums.minWidth,
		depth: box.customDepth ?? minimums.minDepth,
		height: box.customBoxHeight ?? minimums.minHeight
	};
}

// Get lid height for a box (lid thickness is 2x wall thickness)
export function getLidHeight(box: Box): number {
	return box.wallThickness * 2;
}

// Get total assembled height (box + lid)
export function getTotalAssembledHeight(box: Box): number | null {
	const dims = getBoxDimensions(box);
	if (!dims) return null;
	return dims.height + getLidHeight(box);
}

// Calculate minimum total height (minimum box height + lid height)
export function calculateMinimumTotalHeight(box: Box): number {
	const minimums = calculateMinimumBoxDimensions(box);
	return minimums.minHeight + getLidHeight(box);
}
