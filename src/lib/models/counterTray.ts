import jscad from '@jscad/modeling';

const { cuboid, cylinder, roundedCuboid, sphere } = jscad.primitives;
const { subtract, union, intersect } = jscad.booleans;
const { translate, rotateY, rotateZ, rotateX } = jscad.transforms;

// Edge-loaded stack orientation
export type EdgeOrientation = 'lengthwise' | 'crosswise' | 'auto';

// Edge-loaded stack definition: [shape, count, orientation?]
export type EdgeLoadedStackDef = [string, number, EdgeOrientation?];

export interface CounterTrayParams {
	squareWidth: number;
	squareLength: number;
	hexFlatToFlat: number;
	circleDiameter: number;
	counterThickness: number;
	hexPointyTop: boolean;
	clearance: number;
	wallThickness: number;
	floorThickness: number;
	rimHeight: number;
	cutoutRatio: number;
	cutoutMax: number;
	trayLengthOverride: number;
	extraTrayCols: number;
	extraTrayRows: number;
	topLoadedStacks: [string, number][];
	edgeLoadedStacks: EdgeLoadedStackDef[];
	printBedSize: number;
}

export const defaultParams: CounterTrayParams = {
	squareWidth: 15.9,
	squareLength: 15.9,
	hexFlatToFlat: 15.9,
	circleDiameter: 15.9,
	counterThickness: 1.3,
	hexPointyTop: false,
	clearance: 0.3,
	wallThickness: 2.0,
	floorThickness: 2.0,
	rimHeight: 2.0,
	cutoutRatio: 0.3,
	cutoutMax: 12,
	trayLengthOverride: 0,
	extraTrayCols: 1,
	extraTrayRows: 1,
	topLoadedStacks: [
		['square', 12],
		['square', 8],
		['hex', 15],
		['square', 6],
		['hex', 10],
		['circle', 20]
	],
	edgeLoadedStacks: [],
	printBedSize: 256
};

// Helper: sum array elements up to index (inclusive)
const sumTo = (arr: number[], idx: number): number =>
	arr.slice(0, idx + 1).reduce((a, b) => a + b, 0);

// Counter preview data for visualization
export interface CounterStack {
	shape: 'square' | 'hex' | 'circle';
	x: number;           // Center X position in tray (or slot start X for edge-loaded)
	y: number;           // Center Y position in tray (or slot start Y for edge-loaded)
	z: number;           // Bottom Z position of stack
	width: number;       // Counter width (X dimension when flat)
	length: number;      // Counter length (Y dimension when flat)
	thickness: number;   // Single counter thickness
	count: number;       // Number of counters in stack
	hexPointyTop: boolean;
	color: string;       // Random color for this stack
	// Edge-loaded stack fields
	isEdgeLoaded?: boolean;
	edgeOrientation?: 'lengthwise' | 'crosswise';
	slotWidth?: number;  // X dimension of the slot
	slotDepth?: number;  // Y dimension of the slot
}

// Generate random pastel colors for counter stacks
function generateStackColor(index: number): string {
	const hue = (index * 137.508) % 360; // Golden angle for good distribution
	return `hsl(${hue}, 70%, 60%)`;
}

// Calculate counter positions for preview rendering
export function getCounterPositions(params: CounterTrayParams, targetHeight?: number): CounterStack[] {
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
		cutoutRatio,
		cutoutMax,
		topLoadedStacks,
		edgeLoadedStacks
	} = params;

	// Use topLoadedStacks (renamed from stacks)
	const stacks = topLoadedStacks;

	if ((!stacks || stacks.length === 0) && (!edgeLoadedStacks || edgeLoadedStacks.length === 0)) return [];

	// Pocket dimensions (same logic as createCounterTray)
	const squarePocketWidth = squareWidth + clearance * 2;
	const squarePocketLength = squareLength + clearance * 2;

	const hexFlatToFlat = hexFlatToFlatBase + clearance * 2;
	const hexPointToPoint = hexFlatToFlat / Math.cos(Math.PI / 6);
	const hexPocketWidth = hexPointyTop ? hexFlatToFlat : hexPointToPoint;
	const hexPocketLength = hexPointyTop ? hexPointToPoint : hexFlatToFlat;

	const circleDiameter = circleDiameterBase + clearance * 2;

	const getPocketWidth = (shape: string): number => {
		if (shape === 'square') return squarePocketWidth;
		if (shape === 'hex') return hexPocketWidth;
		return circleDiameter;
	};

	const getPocketLength = (shape: string): number => {
		if (shape === 'square') return squarePocketLength;
		if (shape === 'hex') return hexPocketLength;
		return circleDiameter;
	};

	const getMaxPocketDim = (shape: string): number =>
		Math.max(getPocketWidth(shape), getPocketLength(shape));

	// Get counter dimensions (without clearance) for visualization
	const getCounterWidth = (shape: string): number => {
		if (shape === 'square') return squareWidth;
		if (shape === 'hex') return hexPointyTop ? hexFlatToFlatBase : hexFlatToFlatBase / Math.cos(Math.PI / 6);
		return circleDiameterBase;
	};

	const getCounterLength = (shape: string): number => {
		if (shape === 'square') return squareLength;
		if (shape === 'hex') return hexPointyTop ? hexFlatToFlatBase / Math.cos(Math.PI / 6) : hexFlatToFlatBase;
		return circleDiameterBase;
	};

	// Standing height for edge-loaded counters (the larger of width/length)
	const getStandingHeight = (shape: string): number =>
		Math.max(getCounterWidth(shape), getCounterLength(shape));

	// Calculate edge-loaded slot dimensions
	interface EdgeLoadedSlot {
		shape: string;
		count: number;
		orientation: 'lengthwise' | 'crosswise';
		slotWidth: number;    // X dimension
		slotDepth: number;    // Y dimension
		standingHeight: number;
		originalIndex: number;
	}

	const edgeLoadedSlots: EdgeLoadedSlot[] = [];
	if (edgeLoadedStacks && edgeLoadedStacks.length > 0) {
		for (let i = 0; i < edgeLoadedStacks.length; i++) {
			const [shape, count, orientationPref] = edgeLoadedStacks[i];
			const pocketWidth = getPocketWidth(shape);
			const pocketLength = getPocketLength(shape);
			const standingHeight = getStandingHeight(shape);
			const counterSpan = count * counterThickness + (count - 1) * clearance;

			// Auto-determine orientation if needed
			let orientation: 'lengthwise' | 'crosswise';
			if (orientationPref === 'auto' || !orientationPref) {
				// Prefer lengthwise for most cases
				orientation = 'lengthwise';
			} else {
				orientation = orientationPref;
			}

			if (orientation === 'lengthwise') {
				// Lengthwise: counters stack along X (left to right), takes a row at front
				edgeLoadedSlots.push({
					shape,
					count,
					orientation,
					slotWidth: counterSpan,       // Counters stack along X (left to right)
					slotDepth: pocketLength,      // Counter dimension along Y (row depth)
					standingHeight,
					originalIndex: i
				});
			} else {
				// Crosswise: counters stack along Y (front to back), takes a column
				edgeLoadedSlots.push({
					shape,
					count,
					orientation,
					slotWidth: pocketLength,      // Counter dimension along X
					slotDepth: counterSpan,       // Counters stack along Y (front to back)
					standingHeight,
					originalIndex: i
				});
			}
		}
	}

	// Sort edge-loaded by slot size (largest first)
	edgeLoadedSlots.sort((a, b) => (b.slotWidth * b.slotDepth) - (a.slotWidth * a.slotDepth));

	// Sort top-loaded stacks (same as createCounterTray)
	const sortedStacks = stacks ? [...stacks].sort((a, b) => {
		const keyA = getMaxPocketDim(a[0]) * 10000 + a[1];
		const keyB = getMaxPocketDim(b[0]) * 10000 + b[1];
		return keyA - keyB;
	}) : [];

	// Always use 2 rows for top-loaded stacks
	const numColumns = Math.ceil(sortedStacks.length / 2);

	const getCount = (idx: number): number =>
		idx < sortedStacks.length ? sortedStacks[idx][1] : 0;
	const getPw = (idx: number): number =>
		idx < sortedStacks.length ? getPocketWidth(sortedStacks[idx][0]) : 0;
	const getPl = (idx: number): number =>
		idx < sortedStacks.length ? getPocketLength(sortedStacks[idx][0]) : 0;

	// Column widths for top-loaded (always 2 rows)
	const columnWidths: number[] = [];
	for (let col = 0; col < numColumns; col++) {
		const idx1 = col * 2;
		const idx2 = col * 2 + 1;
		columnWidths.push(Math.max(getPw(idx1), getPw(idx2)));
	}

	// Calculate cutout radius for lengthwise slots
	const getSlotCutoutRadius = (slot: EdgeLoadedSlot): number =>
		Math.min(cutoutMax, slot.slotDepth * cutoutRatio);

	// Row depths for top-loaded (always 2 rows)
	let frontRowDepth = 0;
	let backRowDepth = 0;
	for (let col = 0; col < numColumns; col++) {
		frontRowDepth = Math.max(frontRowDepth, getPl(col * 2));
		const idx2 = col * 2 + 1;
		if (idx2 < sortedStacks.length) {
			backRowDepth = Math.max(backRowDepth, getPl(idx2));
		}
	}

	// === GREEDY BIN-PACKING FOR EDGE-LOADED SLOTS ===
	const lengthwiseSlots = edgeLoadedSlots.filter(s => s.orientation === 'lengthwise');
	const crosswiseSlots = edgeLoadedSlots.filter(s => s.orientation === 'crosswise');

	// Track current X position for each row (greedy bin-packing)
	let frontRowX = wallThickness;
	let backRowX = wallThickness;

	// Assign lengthwise slots to rows using greedy approach (shortest row first)
	// Adjacent slots share a half-cylinder cutout; first slot uses wall cutout (no left space needed)
	for (const slot of lengthwiseSlots) {
		const cutoutRadius = getSlotCutoutRadius(slot);

		if (frontRowX <= backRowX) {
			(slot as EdgeLoadedSlot & { rowAssignment: string; xPosition: number }).rowAssignment = 'front';
			// First slot uses wall cutout (no left space needed)
			(slot as EdgeLoadedSlot & { xPosition: number }).xPosition = frontRowX;
			frontRowX += slot.slotWidth + cutoutRadius + wallThickness;
		} else {
			(slot as EdgeLoadedSlot & { rowAssignment: string; xPosition: number }).rowAssignment = 'back';
			(slot as EdgeLoadedSlot & { xPosition: number }).xPosition = backRowX;
			backRowX += slot.slotWidth + cutoutRadius + wallThickness;
		}
	}

	// Calculate effective row depths (including lengthwise slots) - needed before crosswise bin-packing
	let effectiveFrontRowDepth = frontRowDepth;
	let effectiveBackRowDepth = backRowDepth;
	for (const slot of lengthwiseSlots) {
		const assignment = (slot as EdgeLoadedSlot & { rowAssignment: string }).rowAssignment;
		if (assignment === 'front') {
			effectiveFrontRowDepth = Math.max(effectiveFrontRowDepth, slot.slotDepth);
		} else {
			effectiveBackRowDepth = Math.max(effectiveBackRowDepth, slot.slotDepth);
		}
	}

	// === CROSSWISE SLOT BIN-PACKING ===
	// Try to pair crosswise slots into columns (one at front, one at back) when they fit
	interface CrosswiseColumnPreview {
		frontSlot: EdgeLoadedSlot | null;
		backSlot: EdgeLoadedSlot | null;
		xPosition: number;
		columnWidth: number;
	}
	const crosswiseColumnsPreview: CrosswiseColumnPreview[] = [];

	// Sort crosswise by slotDepth (largest first) to improve packing
	const sortedCrosswiseSlotsPreview = [...crosswiseSlots].sort((a, b) => b.slotDepth - a.slotDepth);

	// Assign each crosswise slot to a column
	for (const slot of sortedCrosswiseSlotsPreview) {
		let placed = false;

		// Try to fit in an existing column's back position
		for (const col of crosswiseColumnsPreview) {
			if (col.backSlot === null && col.frontSlot) {
				// Check if combined depth fits
				const combinedDepth = col.frontSlot.slotDepth + wallThickness + slot.slotDepth;
				const availableDepth = effectiveFrontRowDepth + wallThickness + effectiveBackRowDepth;

				if (combinedDepth <= availableDepth || availableDepth === 0) {
					col.backSlot = slot;
					col.columnWidth = Math.max(col.columnWidth, slot.slotWidth);
					(slot as EdgeLoadedSlot & { rowAssignment: string }).rowAssignment = 'back';
					placed = true;
					break;
				}
			}
		}

		if (!placed) {
			crosswiseColumnsPreview.push({
				frontSlot: slot,
				backSlot: null,
				xPosition: 0,
				columnWidth: slot.slotWidth
			});
			(slot as EdgeLoadedSlot & { rowAssignment: string }).rowAssignment = 'front';
		}
	}

	// Assign X positions to crosswise columns
	let crosswiseX = Math.max(frontRowX, backRowX);
	for (const col of crosswiseColumnsPreview) {
		col.xPosition = crosswiseX;
		if (col.frontSlot) {
			(col.frontSlot as EdgeLoadedSlot & { xPosition: number }).xPosition = crosswiseX;
		}
		if (col.backSlot) {
			(col.backSlot as EdgeLoadedSlot & { xPosition: number }).xPosition = crosswiseX;
		}
		crosswiseX += col.columnWidth + wallThickness;
	}

	// Top-loaded stacks start after all edge-loaded
	const edgeLoadedEndX = crosswiseSlots.length > 0 ? crosswiseX : Math.max(frontRowX, backRowX);
	const topLoadedXStart = edgeLoadedSlots.length > 0 ? edgeLoadedEndX : wallThickness;

	const columnXOffset = (col: number): number => {
		if (col === 0) return topLoadedXStart;
		return topLoadedXStart + sumTo(columnWidths, col - 1) + col * wallThickness;
	};

	// Calculate tray height from top-loaded stacks (always 2 rows)
	const columnHeight = (col: number): number => {
		const idx1 = col * 2;
		const idx2 = col * 2 + 1;
		return Math.max(getCount(idx1), getCount(idx2)) * counterThickness;
	};

	let maxTopLoadedHeight = 0;
	for (let col = 0; col < numColumns; col++) {
		maxTopLoadedHeight = Math.max(maxTopLoadedHeight, columnHeight(col));
	}

	// Calculate max edge-loaded height
	let maxEdgeLoadedHeight = 0;
	for (const slot of edgeLoadedSlots) {
		maxEdgeLoadedHeight = Math.max(maxEdgeLoadedHeight, slot.standingHeight);
	}

	// Use the maximum height
	const maxStackHeight = Math.max(maxTopLoadedHeight, maxEdgeLoadedHeight);

	const baseTrayHeight = floorThickness + maxStackHeight + rimHeight;
	const trayHeight = targetHeight && targetHeight > baseTrayHeight ? targetHeight : baseTrayHeight;

	const counterStacks: CounterStack[] = [];

	// Top-loaded stacks start at front of tray
	const topLoadedYStart = wallThickness;

	// Y positions for front and back rows
	const frontRowYStart = wallThickness;
	const effectiveBackRowYStart = wallThickness + effectiveFrontRowDepth + wallThickness;

	// Add lengthwise edge-loaded stacks (using pre-calculated positions)
	for (let i = 0; i < lengthwiseSlots.length; i++) {
		const slot = lengthwiseSlots[i];
		const shape = slot.shape as 'square' | 'hex' | 'circle';
		const pocketFloorZ = trayHeight - rimHeight - slot.standingHeight;
		const rowAssignment = (slot as EdgeLoadedSlot & { rowAssignment: string }).rowAssignment;
		const slotXStart = (slot as EdgeLoadedSlot & { xPosition: number }).xPosition;
		const slotYStart = rowAssignment === 'front' ? frontRowYStart : effectiveBackRowYStart;

		counterStacks.push({
			shape,
			x: slotXStart,
			y: slotYStart,
			z: pocketFloorZ,
			width: getCounterWidth(shape),
			length: getCounterLength(shape),
			thickness: counterThickness,
			count: slot.count,
			hexPointyTop,
			color: generateStackColor(100 + i),
			isEdgeLoaded: true,
			edgeOrientation: 'lengthwise',
			slotWidth: slot.slotWidth,
			slotDepth: slot.slotDepth
		});
	}

	// Calculate tray width for back position calculation
	const topLoadedTotalDepthPreview = effectiveFrontRowDepth + (effectiveBackRowDepth > 0 ? wallThickness + effectiveBackRowDepth : 0);
	const trayWidthPreview = wallThickness + topLoadedTotalDepthPreview + wallThickness;

	// Add crosswise edge-loaded stacks (using pre-calculated positions and row assignments)
	for (let i = 0; i < crosswiseSlots.length; i++) {
		const slot = crosswiseSlots[i];
		const shape = slot.shape as 'square' | 'hex' | 'circle';
		const pocketFloorZ = trayHeight - rimHeight - slot.standingHeight;
		const slotXStart = (slot as EdgeLoadedSlot & { xPosition: number }).xPosition;
		const rowAssignment = (slot as EdgeLoadedSlot & { rowAssignment: string }).rowAssignment;

		// Calculate Y position based on row assignment
		let slotYStart: number;
		if (rowAssignment === 'back') {
			// Back position: align to back of tray
			slotYStart = trayWidthPreview - wallThickness - slot.slotDepth;
		} else {
			// Front position: start at front wall
			slotYStart = wallThickness;
		}

		counterStacks.push({
			shape,
			x: slotXStart,
			y: slotYStart,
			z: pocketFloorZ,
			width: getCounterWidth(shape),
			length: getCounterLength(shape),
			thickness: counterThickness,
			count: slot.count,
			hexPointyTop,
			color: generateStackColor(200 + i),
			isEdgeLoaded: true,
			edgeOrientation: 'crosswise',
			slotWidth: slot.slotWidth,
			slotDepth: slot.slotDepth
		});
	}

	// Add top-loaded stacks (always 2 rows)
	for (let col = 0; col < numColumns; col++) {
		const xOffset = columnXOffset(col);
		const colW = columnWidths[col];

		const idx1 = col * 2;
		const idx2 = col * 2 + 1;

		// Front row
		if (idx1 < sortedStacks.length) {
			const shape = sortedStacks[idx1][0] as 'square' | 'hex' | 'circle';
			const count = sortedStacks[idx1][1];
			const pw = getPocketWidth(shape);
			const pl = getPocketLength(shape);
			const pocketDepth = count * counterThickness;
			const pocketFloorZ = trayHeight - rimHeight - pocketDepth;

			const xCenter = xOffset + (colW - pw) / 2 + pw / 2;
			const yCenter = topLoadedYStart + pl / 2;

			counterStacks.push({
				shape,
				x: xCenter,
				y: yCenter,
				z: pocketFloorZ,
				width: getCounterWidth(shape),
				length: getCounterLength(shape),
				thickness: counterThickness,
				count,
				hexPointyTop,
				color: generateStackColor(idx1)
			});
		}

		// Back row
		if (idx2 < sortedStacks.length) {
			const shape = sortedStacks[idx2][0] as 'square' | 'hex' | 'circle';
			const count = sortedStacks[idx2][1];
			const pw = getPocketWidth(shape);
			const pl = getPocketLength(shape);
			const pocketDepth = count * counterThickness;
			const pocketFloorZ = trayHeight - rimHeight - pocketDepth;

			const xCenter = xOffset + (colW - pw) / 2 + pw / 2;
			const yCenter = effectiveBackRowYStart + (effectiveBackRowDepth - pl) + pl / 2;

			counterStacks.push({
				shape,
				x: xCenter,
				y: yCenter,
				z: pocketFloorZ,
				width: getCounterWidth(shape),
				length: getCounterLength(shape),
				thickness: counterThickness,
				count,
				hexPointyTop,
				color: generateStackColor(idx2)
			});
		}
	}

	return counterStacks;
}

export function createCounterTray(params: CounterTrayParams, trayName?: string, targetHeight?: number) {
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
		cutoutRatio,
		cutoutMax,
		trayLengthOverride,
		extraTrayCols,
		extraTrayRows,
		topLoadedStacks,
		edgeLoadedStacks
	} = params;

	// Use topLoadedStacks (renamed from stacks)
	const stacks = topLoadedStacks;

	const nameLabel = trayName ? `Tray "${trayName}"` : 'Tray';

	// Validate stacks - allow empty if there are edge-loaded stacks
	if ((!stacks || stacks.length === 0) && (!edgeLoadedStacks || edgeLoadedStacks.length === 0)) {
		throw new Error(`${nameLabel}: No counter stacks defined. Add at least one stack.`);
	}

	// Validate counter dimensions
	if (counterThickness <= 0) {
		throw new Error(`${nameLabel}: Counter thickness must be greater than zero.`);
	}

	// Pocket dimensions per shape (counter + clearance)
	const squarePocketWidth = squareWidth + clearance * 2;
	const squarePocketLength = squareLength + clearance * 2;

	const hexFlatToFlat = hexFlatToFlatBase + clearance * 2;
	const hexPointToPoint = hexFlatToFlat / Math.cos(Math.PI / 6);
	const hexPocketWidth = hexPointyTop ? hexFlatToFlat : hexPointToPoint;
	const hexPocketLength = hexPointyTop ? hexPointToPoint : hexFlatToFlat;

	const circleDiameter = circleDiameterBase + clearance * 2;
	const circlePocketWidth = circleDiameter;
	const circlePocketLength = circleDiameter;

	// Get pocket dimensions for a shape
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

	// Get actual counter dimensions (without clearance) for pocket depth calculations
	const getCounterWidth = (shape: string): number => {
		if (shape === 'square') return squareWidth;
		if (shape === 'hex') return hexPointyTop ? hexFlatToFlatBase : hexFlatToFlatBase / Math.cos(Math.PI / 6);
		return circleDiameterBase;
	};

	const getCounterLength = (shape: string): number => {
		if (shape === 'square') return squareLength;
		if (shape === 'hex') return hexPointyTop ? hexFlatToFlatBase / Math.cos(Math.PI / 6) : hexFlatToFlatBase;
		return circleDiameterBase;
	};

	// Standing height for edge-loaded counters (actual counter size, not pocket size)
	const getStandingHeight = (shape: string): number =>
		Math.max(getCounterWidth(shape), getCounterLength(shape));

	// Calculate edge-loaded slot dimensions
	interface EdgeLoadedSlot {
		shape: string;
		count: number;
		orientation: 'lengthwise' | 'crosswise';
		slotWidth: number;    // X dimension
		slotDepth: number;    // Y dimension
		standingHeight: number;
		originalIndex: number;
	}

	const edgeLoadedSlots: EdgeLoadedSlot[] = [];
	if (edgeLoadedStacks && edgeLoadedStacks.length > 0) {
		for (let i = 0; i < edgeLoadedStacks.length; i++) {
			const [shape, count, orientationPref] = edgeLoadedStacks[i];
			const pocketWidth = getPocketWidth(shape);
			const pocketLength = getPocketLength(shape);
			const standingHeight = getStandingHeight(shape);
			const counterSpan = count * counterThickness + (count - 1) * clearance;

			// Auto-determine orientation if needed
			let orientation: 'lengthwise' | 'crosswise';
			if (orientationPref === 'auto' || !orientationPref) {
				orientation = 'lengthwise';
			} else {
				orientation = orientationPref;
			}

			if (orientation === 'lengthwise') {
				// Lengthwise: counters stack along X (left to right), takes a row at front
				edgeLoadedSlots.push({
					shape,
					count,
					orientation,
					slotWidth: counterSpan,       // Counters stack along X (left to right)
					slotDepth: pocketLength,      // Counter dimension along Y (row depth)
					standingHeight,
					originalIndex: i
				});
			} else {
				// Crosswise: counters stack along Y (front to back), takes a column
				edgeLoadedSlots.push({
					shape,
					count,
					orientation,
					slotWidth: pocketLength,      // Counter dimension along X
					slotDepth: counterSpan,       // Counters stack along Y (front to back)
					standingHeight,
					originalIndex: i
				});
			}
		}
	}

	// Sort edge-loaded by slot size (largest first)
	edgeLoadedSlots.sort((a, b) => (b.slotWidth * b.slotDepth) - (a.slotWidth * a.slotDepth));

	// Sort top-loaded stacks by pocket size
	const sortedStacks = stacks ? [...stacks].sort((a, b) => {
		const keyA = getMaxPocketDim(a[0]) * 10000 + a[1];
		const keyB = getMaxPocketDim(b[0]) * 10000 + b[1];
		return keyA - keyB;
	}) : [];

	// Always use 2 rows for top-loaded stacks
	const numColumns = Math.ceil(sortedStacks.length / 2);

	// Helper functions for stack info
	const getCount = (idx: number): number =>
		idx < sortedStacks.length ? sortedStacks[idx][1] : 0;
	const getShape = (idx: number): string =>
		idx < sortedStacks.length ? sortedStacks[idx][0] : 'square';
	const getPw = (idx: number): number =>
		idx < sortedStacks.length ? getPocketWidth(sortedStacks[idx][0]) : 0;
	const getPl = (idx: number): number =>
		idx < sortedStacks.length ? getPocketLength(sortedStacks[idx][0]) : 0;

	// Column widths for top-loaded (always 2 rows)
	const columnWidths: number[] = [];
	for (let col = 0; col < numColumns; col++) {
		const idx1 = col * 2;
		const idx2 = col * 2 + 1;
		columnWidths.push(Math.max(getPw(idx1), getPw(idx2)));
	}

	// Calculate cutout radius for a slot (used for lengthwise half-sphere cutouts)
	const getSlotCutoutRadius = (slot: EdgeLoadedSlot): number =>
		Math.min(cutoutMax, slot.slotDepth * cutoutRatio);

	// Row depths for top-loaded (always 2 rows)
	let frontRowDepth = 0;
	let backRowDepth = 0;
	for (let col = 0; col < numColumns; col++) {
		frontRowDepth = Math.max(frontRowDepth, getPl(col * 2));
		const idx2 = col * 2 + 1;
		if (idx2 < sortedStacks.length) {
			backRowDepth = Math.max(backRowDepth, getPl(idx2));
		}
	}

	// Column heights (top-loaded) - always 2 rows
	const columnHeight = (col: number): number => {
		const idx1 = col * 2;
		const idx2 = col * 2 + 1;
		return Math.max(getCount(idx1), getCount(idx2)) * counterThickness;
	};

	// Max top-loaded stack height
	let maxTopLoadedHeight = 0;
	for (let col = 0; col < numColumns; col++) {
		maxTopLoadedHeight = Math.max(maxTopLoadedHeight, columnHeight(col));
	}

	// Max edge-loaded height
	let maxEdgeLoadedHeight = 0;
	for (const slot of edgeLoadedSlots) {
		maxEdgeLoadedHeight = Math.max(maxEdgeLoadedHeight, slot.standingHeight);
	}

	// Use maximum of both
	const maxStackHeight = Math.max(maxTopLoadedHeight, maxEdgeLoadedHeight);

	// === GREEDY BIN-PACKING FOR EDGE-LOADED SLOTS ===
	// 1. Place lengthwise slots first, using greedy assignment to row with shorter current X
	// 2. Place crosswise slots next (they span both rows)
	// 3. Top-loaded stacks go after all edge-loaded

	// Separate lengthwise and crosswise slots
	const lengthwiseSlots = edgeLoadedSlots.filter(s => s.orientation === 'lengthwise');
	const crosswiseSlots = edgeLoadedSlots.filter(s => s.orientation === 'crosswise');

	// Track current X position for each row (greedy bin-packing)
	// Also track slot count per row to know when to use quarter-sphere vs half-cylinder
	let frontRowX = wallThickness;
	let backRowX = wallThickness;
	let frontRowSlotCount = 0;
	let backRowSlotCount = 0;

	// Assign lengthwise slots to rows using greedy approach (shortest row first)
	// Adjacent slots share a half-cylinder cutout; first slot uses wall cutout (no internal space needed)
	for (const slot of lengthwiseSlots) {
		const cutoutRadius = getSlotCutoutRadius(slot);

		// Assign to row with shorter current X
		if (frontRowX <= backRowX) {
			(slot as EdgeLoadedSlot & { rowAssignment: string; xPosition: number }).rowAssignment = 'front';
			// First slot uses wall cutout (no left space needed); subsequent slots share half-cylinder
			(slot as EdgeLoadedSlot & { xPosition: number }).xPosition = frontRowX;
			// Reserve quarter-sphere space on right (will be replaced by half-cylinder if another slot follows)
			frontRowX += slot.slotWidth + cutoutRadius + wallThickness;
			frontRowSlotCount++;
		} else {
			(slot as EdgeLoadedSlot & { rowAssignment: string; xPosition: number }).rowAssignment = 'back';
			(slot as EdgeLoadedSlot & { xPosition: number }).xPosition = backRowX;
			backRowX += slot.slotWidth + cutoutRadius + wallThickness;
			backRowSlotCount++;
		}
	}

	// Calculate the maximum depth needed for each row (including lengthwise) - needed before crosswise bin-packing
	let effectiveFrontRowDepth = frontRowDepth;
	let effectiveBackRowDepth = backRowDepth;
	for (const slot of lengthwiseSlots) {
		const assignment = (slot as EdgeLoadedSlot & { rowAssignment: string }).rowAssignment;
		if (assignment === 'front') {
			effectiveFrontRowDepth = Math.max(effectiveFrontRowDepth, slot.slotDepth);
		} else {
			effectiveBackRowDepth = Math.max(effectiveBackRowDepth, slot.slotDepth);
		}
	}

	// After lengthwise, crosswise slots start at the max of both row X positions
	let crosswiseXStart = Math.max(frontRowX, backRowX);

	// === CROSSWISE SLOT BIN-PACKING ===
	// Try to pair crosswise slots into columns (one at front, one at back) when they fit
	// Track columns: each column has a front slot, optional back slot, and X position
	interface CrosswiseColumn {
		frontSlot: EdgeLoadedSlot | null;
		backSlot: EdgeLoadedSlot | null;
		xPosition: number;
		columnWidth: number;  // Max slotWidth of front/back
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
				// Check if combined depth fits (front + wall + back ≤ available depth)
				const combinedDepth = col.frontSlot.slotDepth + wallThickness + slot.slotDepth;
				const availableDepth = effectiveFrontRowDepth + wallThickness + effectiveBackRowDepth;

				if (combinedDepth <= availableDepth || availableDepth === 0) {
					col.backSlot = slot;
					col.columnWidth = Math.max(col.columnWidth, slot.slotWidth);
					(slot as EdgeLoadedSlot & { rowAssignment: string }).rowAssignment = 'back';
					placed = true;
					break;
				}
			}
		}

		if (!placed) {
			// Create new column with this slot at front
			crosswiseColumns.push({
				frontSlot: slot,
				backSlot: null,
				xPosition: 0,  // Will be assigned below
				columnWidth: slot.slotWidth
			});
			(slot as EdgeLoadedSlot & { rowAssignment: string }).rowAssignment = 'front';
		}
	}

	// Assign X positions to crosswise columns
	let crosswiseX = crosswiseXStart;
	for (const col of crosswiseColumns) {
		col.xPosition = crosswiseX;
		if (col.frontSlot) {
			(col.frontSlot as EdgeLoadedSlot & { xPosition: number }).xPosition = crosswiseX;
		}
		if (col.backSlot) {
			(col.backSlot as EdgeLoadedSlot & { xPosition: number }).xPosition = crosswiseX;
		}
		crosswiseX += col.columnWidth + wallThickness;
	}

	// Calculate crosswise max depth (for validation)
	let crosswiseMaxDepth = 0;
	for (const slot of crosswiseSlots) {
		crosswiseMaxDepth = Math.max(crosswiseMaxDepth, slot.slotDepth);
	}

	// Top-loaded stacks start after all edge-loaded
	const edgeLoadedEndX = crosswiseSlots.length > 0 ? crosswiseX : Math.max(frontRowX, backRowX);
	const topLoadedXStart = edgeLoadedSlots.length > 0 ? edgeLoadedEndX : wallThickness;

	// Column X offset for top-loaded
	const columnXOffset = (col: number): number => {
		if (col === 0) return topLoadedXStart;
		return topLoadedXStart + sumTo(columnWidths, col - 1) + col * wallThickness;
	};

	// Top-loaded X span (columns + internal walls + right wall)
	const topLoadedXSpan = numColumns > 0
		? sumTo(columnWidths, numColumns - 1) + numColumns * wallThickness
		: 0;

	// Tray length = edge-loaded width + top-loaded span
	const trayLengthAuto = topLoadedXStart + topLoadedXSpan;
	const trayLength = trayLengthOverride > 0 ? trayLengthOverride : trayLengthAuto;

	// Y positions for front and back rows
	const frontRowYStart = wallThickness;
	const topLoadedYStart = wallThickness;

	// Tray width (Y dimension) calculation - always 2 rows
	const topLoadedTotalDepth = effectiveFrontRowDepth + (effectiveBackRowDepth > 0 ? wallThickness + effectiveBackRowDepth : 0);

	// Validate crosswise stacks fit within the available Y space
	// Crosswise stacks must fit within the 2-row depth
	if (crosswiseMaxDepth > 0 && topLoadedTotalDepth > 0 && crosswiseMaxDepth > topLoadedTotalDepth) {
		throw new Error(
			`${nameLabel}: Crosswise edge-loaded stack has too many counters. ` +
			`Counter span (${crosswiseMaxDepth.toFixed(1)}mm) exceeds available depth (${topLoadedTotalDepth.toFixed(1)}mm). ` +
			`Reduce counter count or use lengthwise orientation.`
		);
	}

	// Tray width based on 2-row layout
	const trayWidthAuto = topLoadedTotalDepth > 0 ? topLoadedTotalDepth : crosswiseMaxDepth;
	const trayWidth = wallThickness + trayWidthAuto + wallThickness;

	// Base tray height from this tray's stacks
	const baseTrayHeight = floorThickness + maxStackHeight + rimHeight;
	// If targetHeight provided, use it (increases rim to match tallest tray in box)
	const trayHeight = targetHeight && targetHeight > baseTrayHeight ? targetHeight : baseTrayHeight;
	// Effective rim height may be taller to reach target
	const effectiveRimHeight = trayHeight - floorThickness - maxStackHeight;

	// Extra tray area
	const extraTrayLength = trayLength > trayLengthAuto ? trayLength - trayLengthAuto : 0;
	const extraTrayStartX = trayLengthAuto;
	const extraTrayInnerWidth = trayWidth - 2 * wallThickness;
	const extraTrayInnerLength = extraTrayLength - wallThickness;
	const extraTrayDepth = trayHeight - floorThickness;

	// Cutout radius for a shape
	const getCutoutRadius = (shape: string): number =>
		Math.min(cutoutMax, getPocketWidth(shape) * cutoutRatio);

	// Create pocket shape
	const createPocketShape = (shape: string, height: number) => {
		const pw = getPocketWidth(shape);
		const pl = getPocketLength(shape);

		if (shape === 'square') {
			return cuboid({ size: [pw, pl, height], center: [pw / 2, pl / 2, height / 2] });
		} else if (shape === 'hex') {
			const hex = cylinder({
				height,
				radius: hexPointToPoint / 2,
				segments: 6,
				center: [0, 0, height / 2]
			});
			const rotated = hexPointyTop ? rotateZ(Math.PI / 6, hex) : hex;
			return translate([pw / 2, pl / 2, 0], rotated);
		} else {
			// circle
			return translate(
				[pw / 2, pl / 2, 0],
				cylinder({
					height,
					radius: circleDiameter / 2,
					segments: 64,
					center: [0, 0, height / 2]
				})
			);
		}
	};

	// Create a pocket cutout
	const createPocket = (
		stackCount: number,
		shape: string,
		isFrontRow: boolean,
		colWidth: number,
		rowDepth: number
	) => {
		const pocketDepth = stackCount * counterThickness;
		// Use original rimHeight (not effectiveRimHeight) so pocket depth stays constant
		// regardless of tray height - taller trays just have more solid material below
		const pocketFloorZ = trayHeight - rimHeight - pocketDepth;

		const pw = getPocketWidth(shape);
		const pl = getPocketLength(shape);

		const xOffset = (colWidth - pw) / 2;
		const yOffset = isFrontRow ? 0 : rowDepth - pl;

		return translate(
			[xOffset, yOffset, pocketFloorZ],
			createPocketShape(shape, pocketDepth + rimHeight + 1)
		);
	};

	// Finger cutout (semi-cylinder for top-loaded stacks, vertical along Z)
	const createFingerCutout = (radius: number) => {
		return cylinder({
			height: trayHeight + 2,
			radius,
			segments: 64,
			center: [0, 0, trayHeight / 2]
		});
	};

	// Horizontal finger cutout (semi-cylinder along Y axis, for between adjacent lengthwise slots)
	// Scooped from the top surface, spanning the row depth
	const createHorizontalFingerCutout = (radius: number, rowDepth: number) => {
		// Create cylinder, then rotate to align along Y axis
		const cyl = cylinder({
			height: rowDepth + 2,
			radius,
			segments: 64,
			center: [0, 0, 0]
		});
		// Rotate around Y axis to align cylinder along Y, position at top surface
		return translate(
			[0, rowDepth / 2, trayHeight],
			rotateY(Math.PI / 2, cyl)
		);
	};

	// Half-sphere cutout for edge-loaded stacks (lengthwise orientation)
	// Creates a hemisphere scooped down from the top face at the end of a slot
	// The flat face is horizontal at the top surface
	const createHalfSphereCutout = (radius: number) => {
		// Create full sphere centered at origin
		const fullSphere = sphere({ radius, segments: 32, center: [0, 0, 0] });

		// Cut horizontally to get bottom hemisphere (the part that goes into the tray)
		const boxSize = radius * 2 + 2;
		const cutBox = cuboid({
			size: [boxSize, boxSize, boxSize],
			center: [0, 0, boxSize / 2]  // Remove top half, keep bottom half
		});

		const halfSphere = subtract(fullSphere, cutBox);

		// Position at tray top - sphere center at top surface so bottom half cuts into tray
		return translate([0, 0, trayHeight], halfSphere);
	};

	// Create edge-loaded pocket (rectangular slot for counters standing on edge)
	const createEdgeLoadedPocket = (
		slot: EdgeLoadedSlot,
		xPos: number,
		yPos: number
	) => {
		const pocketHeight = slot.standingHeight;
		const pocketFloorZ = trayHeight - rimHeight - pocketHeight;
		const pocketCutHeight = pocketHeight + rimHeight + 1;

		return translate(
			[xPos, yPos, pocketFloorZ],
			cuboid({
				size: [slot.slotWidth, slot.slotDepth, pocketCutHeight],
				center: [slot.slotWidth / 2, slot.slotDepth / 2, pocketCutHeight / 2]
			})
		);
	};

	// Scoopable cell - uses rounded cuboid for easy finger access
	const createScoopableCell = (width: number, length: number, depth: number) => {
		// Guard against invalid dimensions
		if (width <= 0 || length <= 0 || depth <= 0) {
			return cuboid({ size: [0.1, 0.1, 0.1], center: [0, 0, 0] });
		}

		// Round the bottom corners - radius limited to half the smallest dimension
		const roundRadius = Math.min(length / 2, depth / 2, width / 2, 8);

		return roundedCuboid({
			size: [width, length, depth + roundRadius], // Extra height so rounding is at bottom
			center: [width / 2, length / 2, (depth + roundRadius) / 2],
			roundRadius,
			segments: 32
		});
	};

	// Extra tray area cells
	const createExtraTrayArea = () => {
		if (extraTrayLength <= 0 || extraTrayInnerLength <= 0) return [];

		const totalColWalls = (extraTrayCols - 1) * wallThickness;
		const totalRowWalls = (extraTrayRows - 1) * wallThickness;
		const cellWidth = (extraTrayInnerLength - totalColWalls) / extraTrayCols;
		const cellLength = (extraTrayInnerWidth - totalRowWalls) / extraTrayRows;

		// Guard against invalid cell dimensions
		if (cellWidth <= 0 || cellLength <= 0) return [];

		const cells = [];
		for (let col = 0; col < extraTrayCols; col++) {
			for (let row = 0; row < extraTrayRows; row++) {
				const xPos = extraTrayStartX + col * (cellWidth + wallThickness);
				const yPos = wallThickness + row * (cellLength + wallThickness);

				cells.push(
					translate([xPos, yPos, floorThickness], createScoopableCell(cellWidth, cellLength, extraTrayDepth))
				);
			}
		}
		return cells;
	};

	// Build the tray
	const trayBody = cuboid({
		size: [trayLength, trayWidth, trayHeight],
		center: [trayLength / 2, trayWidth / 2, trayHeight / 2]
	});

	const pocketCuts = [];
	const fingerCuts = [];

	// Effective back row Y start (accounts for any expanded front row depth)
	const effectiveBackRowYStart = wallThickness + effectiveFrontRowDepth + wallThickness;

	// Edge-loaded pockets and cutholes
	// Group lengthwise slots by row for cutout optimization
	const frontRowSlots = lengthwiseSlots
		.filter(s => (s as EdgeLoadedSlot & { rowAssignment: string }).rowAssignment === 'front')
		.sort((a, b) => (a as EdgeLoadedSlot & { xPosition: number }).xPosition - (b as EdgeLoadedSlot & { xPosition: number }).xPosition);
	const backRowSlots = lengthwiseSlots
		.filter(s => (s as EdgeLoadedSlot & { rowAssignment: string }).rowAssignment === 'back')
		.sort((a, b) => (a as EdgeLoadedSlot & { xPosition: number }).xPosition - (b as EdgeLoadedSlot & { xPosition: number }).xPosition);

	// Process lengthwise slots with optimized cutouts
	// Adjacent slots share a half-cylinder cutout; outer edges get quarter-spheres or wall cutouts
	const processRowSlots = (slots: EdgeLoadedSlot[], yStart: number, rowDepth: number) => {
		for (let i = 0; i < slots.length; i++) {
			const slot = slots[i];
			const slotXStart = (slot as EdgeLoadedSlot & { xPosition: number }).xPosition;
			const cutoutRadius = getSlotCutoutRadius(slot);

			pocketCuts.push(createEdgeLoadedPocket(slot, slotXStart, yStart));

			// Left cutout: if first slot against wall, use vertical wall cutout; otherwise quarter-sphere
			if (i === 0) {
				// Check if slot is against the left wall (starts at wallThickness or very close)
				const isAgainstLeftWall = slotXStart <= wallThickness + cutoutRadius + 0.1;
				if (isAgainstLeftWall) {
					// Vertical half-cylinder at left tray edge (like top-loaded stacks)
					fingerCuts.push(
						translate(
							[0, yStart + rowDepth / 2, 0],
							createFingerCutout(cutoutRadius)
						)
					);
				} else {
					// Quarter-sphere at left edge of slot
					fingerCuts.push(
						translate(
							[slotXStart, yStart + slot.slotDepth / 2, 0],
							createHalfSphereCutout(cutoutRadius)
						)
					);
				}
			}

			// Right cutout: half-cylinder if there's a next slot, quarter-sphere if last
			if (i < slots.length - 1) {
				// Horizontal half-cylinder between this slot and next (spans full row depth)
				const betweenX = slotXStart + slot.slotWidth + cutoutRadius;
				fingerCuts.push(
					translate(
						[betweenX, yStart, 0],
						createHorizontalFingerCutout(cutoutRadius, rowDepth)
					)
				);
			} else {
				// Quarter-sphere at right edge of last slot
				fingerCuts.push(
					translate(
						[slotXStart + slot.slotWidth, yStart + slot.slotDepth / 2, 0],
						createHalfSphereCutout(cutoutRadius)
					)
				);
			}
		}
	};

	processRowSlots(frontRowSlots, frontRowYStart, effectiveFrontRowDepth);
	processRowSlots(backRowSlots, effectiveBackRowYStart, effectiveBackRowDepth);

	// Process crosswise slots (using pre-calculated positions and row assignments)
	for (const slot of crosswiseSlots) {
		const slotXStart = (slot as EdgeLoadedSlot & { xPosition: number }).xPosition;
		const rowAssignment = (slot as EdgeLoadedSlot & { rowAssignment: string }).rowAssignment;

		// Position based on row assignment
		let slotYStart: number;
		if (rowAssignment === 'back') {
			// Back position: align to back of tray (end at trayWidth - wallThickness)
			slotYStart = trayWidth - wallThickness - slot.slotDepth;
		} else {
			// Front position: start at front wall
			slotYStart = wallThickness;
		}

		pocketCuts.push(createEdgeLoadedPocket(slot, slotXStart, slotYStart));

		// Finger cutout at the tray edge nearest to this slot
		const cutoutRadius = Math.min(cutoutMax, slot.slotWidth * cutoutRatio);
		if (rowAssignment === 'back') {
			// Back slot: cutout at back edge
			fingerCuts.push(
				translate(
					[slotXStart + slot.slotWidth / 2, trayWidth, 0],
					createFingerCutout(cutoutRadius)
				)
			);
		} else {
			// Front slot: cutout at front edge
			fingerCuts.push(
				translate(
					[slotXStart + slot.slotWidth / 2, 0, 0],
					createFingerCutout(cutoutRadius)
				)
			);
		}
	}

	// Top-loaded pockets (always 2 rows)
	for (let col = 0; col < numColumns; col++) {
		const xOffset = columnXOffset(col);
		const colW = columnWidths[col];

		const idx1 = col * 2;
		const idx2 = col * 2 + 1;

		// Front row pocket
		if (idx1 < sortedStacks.length) {
			pocketCuts.push(
				translate(
					[xOffset, topLoadedYStart, 0],
					createPocket(getCount(idx1), getShape(idx1), true, colW, effectiveFrontRowDepth)
				)
			);
			// Finger cutout at tray front
			fingerCuts.push(
				translate([xOffset + colW / 2, 0, 0], createFingerCutout(getCutoutRadius(getShape(idx1))))
			);
		}

		// Back row pocket
		if (idx2 < sortedStacks.length) {
			pocketCuts.push(
				translate(
					[xOffset, effectiveBackRowYStart, 0],
					createPocket(getCount(idx2), getShape(idx2), false, colW, effectiveBackRowDepth)
				)
			);
			// Finger cutout at tray back
			fingerCuts.push(
				translate(
					[xOffset + colW / 2, trayWidth, 0],
					createFingerCutout(getCutoutRadius(getShape(idx2)))
				)
			);
		}
	}

	const extraCells = createExtraTrayArea();

	return subtract(trayBody, ...pocketCuts, ...fingerCuts, ...extraCells);
}
