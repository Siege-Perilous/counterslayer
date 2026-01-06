import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';
import type { Box, Tray } from '$lib/types/project';
import type { CounterTrayParams } from './counterTray';

const { cuboid, cylinder, roundedCuboid } = jscad.primitives;
const { subtract, union, intersect } = jscad.booleans;
const { translate, rotateX } = jscad.transforms;
const { hull } = jscad.hulls;

export interface TrayDimensions {
	width: number;  // X dimension
	depth: number;  // Y dimension
	height: number; // Z dimension
}

export interface TrayPlacement {
	tray: Tray;
	dimensions: TrayDimensions;
	x: number;
	y: number;
}

// Calculate tray dimensions from params (same logic as counterTray.ts)
export function getTrayDimensions(params: CounterTrayParams): TrayDimensions {
	const {
		squareWidth,
		squareLength,
		hexFlatToFlat: hexFlatToFlatBase,
		circleDiameter: circleDiameterBase,
		counterThickness,
		hexPointyTop,
		clearance,
		wallThickness,
		floorThickness,
		rimHeight,
		trayLengthOverride,
		stacks
	} = params;

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

	const getPocketWidth = (shape: string): number => {
		if (shape === 'square') return squarePocketWidth;
		if (shape === 'hex') return hexPocketWidth;
		return circlePocketWidth;
	};

	const getPocketLength = (shape: string): number => {
		if (shape === 'square') return squarePocketLength;
		if (shape === 'hex') return hexPocketLength;
		return circlePocketLength;
	};

	const getMaxPocketDim = (shape: string): number =>
		Math.max(getPocketWidth(shape), getPocketLength(shape));

	// Sort stacks by pocket size
	const sortedStacks = [...stacks].sort((a, b) => {
		const keyA = getMaxPocketDim(a[0]) * 10000 + a[1];
		const keyB = getMaxPocketDim(b[0]) * 10000 + b[1];
		return keyA - keyB;
	});

	const numColumns = Math.ceil(sortedStacks.length / 2);

	const getCount = (idx: number): number =>
		idx < sortedStacks.length ? sortedStacks[idx][1] : 0;
	const getPw = (idx: number): number =>
		idx < sortedStacks.length ? getPocketWidth(sortedStacks[idx][0]) : 0;
	const getPl = (idx: number): number =>
		idx < sortedStacks.length ? getPocketLength(sortedStacks[idx][0]) : 0;

	// Column widths
	const columnWidths: number[] = [];
	for (let col = 0; col < numColumns; col++) {
		const idx1 = col * 2;
		const idx2 = col * 2 + 1;
		columnWidths.push(Math.max(getPw(idx1), getPw(idx2)));
	}

	// Row depths
	let frontRowDepth = 0;
	let backRowDepth = 0;
	for (let col = 0; col < numColumns; col++) {
		frontRowDepth = Math.max(frontRowDepth, getPl(col * 2));
		const idx2 = col * 2 + 1;
		if (idx2 < sortedStacks.length) {
			backRowDepth = Math.max(backRowDepth, getPl(idx2));
		}
	}

	// Column heights
	const columnHeight = (col: number): number => {
		const idx1 = col * 2;
		const idx2 = col * 2 + 1;
		return Math.max(getCount(idx1), getCount(idx2)) * counterThickness;
	};

	let maxStackHeight = 0;
	for (let col = 0; col < numColumns; col++) {
		maxStackHeight = Math.max(maxStackHeight, columnHeight(col));
	}

	// Tray dimensions
	const sumTo = (arr: number[], idx: number): number =>
		arr.slice(0, idx + 1).reduce((a, b) => a + b, 0);

	const trayLengthAuto =
		sumTo(columnWidths, numColumns - 1) + (numColumns + 1) * wallThickness;
	const trayLength = trayLengthOverride > 0 ? trayLengthOverride : trayLengthAuto;
	const trayWidth =
		wallThickness + frontRowDepth + wallThickness + backRowDepth + wallThickness;
	const trayHeight = floorThickness + maxStackHeight + rimHeight;

	return {
		width: trayLength,  // X
		depth: trayWidth,   // Y
		height: trayHeight  // Z
	};
}

// Arrange trays in a box layout with bin-packing
// Smaller trays can share a row if their combined width fits within the max tray width
export function arrangeTrays(trays: Tray[]): TrayPlacement[] {
	if (trays.length === 0) return [];

	// Calculate dimensions for all trays
	const trayDims = trays.map(tray => ({
		tray,
		dimensions: getTrayDimensions(tray.params)
	}));

	// Sort by width (X dimension) descending so widest trays are first
	trayDims.sort((a, b) => b.dimensions.width - a.dimensions.width);

	// The widest tray determines the max row width
	const maxRowWidth = trayDims[0].dimensions.width;

	// Track rows: each row has a Y position, current X fill, and max depth
	interface Row {
		y: number;
		currentX: number;
		depth: number;
	}
	const rows: Row[] = [];

	const placements: TrayPlacement[] = [];

	for (const { tray, dimensions } of trayDims) {
		// Try to find an existing row where this tray fits
		let placed = false;
		for (const row of rows) {
			if (row.currentX + dimensions.width <= maxRowWidth) {
				// Fits in this row
				placements.push({
					tray,
					dimensions,
					x: row.currentX,
					y: row.y
				});
				row.currentX += dimensions.width;
				row.depth = Math.max(row.depth, dimensions.depth);
				placed = true;
				break;
			}
		}

		if (!placed) {
			// Create a new row
			const newY = rows.length === 0 ? 0 : rows.reduce((sum, r) => sum + r.depth, 0);
			rows.push({
				y: newY,
				currentX: dimensions.width,
				depth: dimensions.depth
			});
			placements.push({
				tray,
				dimensions,
				x: 0,
				y: newY
			});
		}
	}

	return placements;
}

// Calculate box interior dimensions from tray placements
export function getBoxInteriorDimensions(placements: TrayPlacement[], tolerance: number): TrayDimensions {
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
		translate([cx - width / 2 + r, cy - depth / 2 + r, cz], cylinder({ radius: r, height, segments: 32 })),
		translate([cx + width / 2 - r, cy - depth / 2 + r, cz], cylinder({ radius: r, height, segments: 32 })),
		translate([cx - width / 2 + r, cy + depth / 2 - r, cz], cylinder({ radius: r, height, segments: 32 })),
		translate([cx + width / 2 - r, cy + depth / 2 - r, cz], cylinder({ radius: r, height, segments: 32 })),
	];

	return hull(...corners);
}

// Create box geometry with rounded corners
export function createBox(box: Box): Geom3 | null {
	if (box.trays.length === 0) return null;

	const placements = arrangeTrays(box.trays);
	const interior = getBoxInteriorDimensions(placements, box.tolerance);

	// Box exterior dimensions
	const exteriorWidth = interior.width + box.wallThickness * 2;
	const exteriorDepth = interior.depth + box.wallThickness * 2;
	const exteriorHeight = interior.height + box.floorThickness;

	const cornerRadius = getCornerRadius(box.wallThickness);
	const innerCornerRadius = Math.max(cornerRadius - box.wallThickness, 1);

	// Create outer shell with rounded corners
	const outer = createRoundedBox(
		exteriorWidth,
		exteriorDepth,
		exteriorHeight,
		cornerRadius,
		[exteriorWidth / 2, exteriorDepth / 2, exteriorHeight / 2]
	);

	// Create interior cavity with rounded corners
	const inner = translate(
		[box.wallThickness, box.wallThickness, box.floorThickness],
		createRoundedBox(
			interior.width,
			interior.depth,
			interior.height + 1,
			innerCornerRadius,
			[interior.width / 2, interior.depth / 2, (interior.height + 1) / 2]
		)
	);

	return subtract(outer, inner);
}

// Get box exterior dimensions
export function getBoxDimensions(box: Box): TrayDimensions | null {
	if (box.trays.length === 0) return null;

	const placements = arrangeTrays(box.trays);
	const interior = getBoxInteriorDimensions(placements, box.tolerance);

	return {
		width: interior.width + box.wallThickness * 2,
		depth: interior.depth + box.wallThickness * 2,
		height: interior.height + box.floorThickness
	};
}
