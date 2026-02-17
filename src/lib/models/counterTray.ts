import jscad from '@jscad/modeling';

const { cuboid, cylinder, roundedCuboid, sphere } = jscad.primitives;
const { subtract, union, intersect } = jscad.booleans;
const { translate, rotateY, rotateZ, rotateX, scale, mirrorY } = jscad.transforms;
const { vectorText } = jscad.text;
const { path2 } = jscad.geometries;
const { expand } = jscad.expansions;
const { extrudeLinear } = jscad.extrusions;

// Edge-loaded stack orientation
export type EdgeOrientation = 'lengthwise' | 'crosswise';

// Top-loaded stack definition: [shape, count, label?]
export type TopLoadedStackDef = [string, number, string?];

// Edge-loaded stack definition: [shape, count, orientation?, label?]
export type EdgeLoadedStackDef = [string, number, EdgeOrientation?, string?];

// Custom shape definition
export interface CustomShape {
	name: string;    // Unique identifier, e.g., "Large Card"
	width: number;   // X dimension (mm)
	length: number;  // Y dimension (mm)
}

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
	topLoadedStacks: TopLoadedStackDef[];
	edgeLoadedStacks: EdgeLoadedStackDef[];
	customShapes: CustomShape[];
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
	customShapes: [],
	printBedSize: 256
};

// Helper: sum array elements up to index (inclusive)
const sumTo = (arr: number[], idx: number): number =>
	arr.slice(0, idx + 1).reduce((a, b) => a + b, 0);

// Counter preview data for visualization
export interface CounterStack {
	shape: 'square' | 'hex' | 'circle' | 'custom';
	customShapeName?: string;  // Only set when shape === 'custom'
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
export function getCounterPositions(params: CounterTrayParams, targetHeight?: number, floorSpacerHeight?: number): CounterStack[] {
	const spacerOffset = floorSpacerHeight ?? 0;
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
		edgeLoadedStacks,
		customShapes
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

	// Helper to get custom shape by name from 'custom:ShapeName' reference
	const getCustomShape = (shapeRef: string): CustomShape | null => {
		if (!shapeRef.startsWith('custom:')) return null;
		const name = shapeRef.substring(7);
		return customShapes?.find(s => s.name === name) || null;
	};

	// Pocket width (X dimension) - for top-loaded/crosswise, use LONGER side (parallel to tray length)
	const getPocketWidth = (shape: string): number => {
		if (shape === 'square') return squarePocketWidth;
		if (shape === 'hex') return hexPocketWidth;
		const custom = getCustomShape(shape);
		if (custom) {
			// For top-loaded/crosswise: longer side along X (parallel to tray length)
			const w = custom.width + clearance * 2;
			const l = custom.length + clearance * 2;
			return Math.max(w, l);
		}
		return circleDiameter;
	};

	// Pocket length (Y dimension) - for top-loaded/crosswise, use SHORTER side
	const getPocketLength = (shape: string): number => {
		if (shape === 'square') return squarePocketLength;
		if (shape === 'hex') return hexPocketLength;
		const custom = getCustomShape(shape);
		if (custom) {
			// For top-loaded/crosswise: shorter side along Y
			const w = custom.width + clearance * 2;
			const l = custom.length + clearance * 2;
			return Math.min(w, l);
		}
		return circleDiameter;
	};

	// For lengthwise edge-loaded: longest dimension runs perpendicular to tray (along Y)
	// This prevents the slot from receding too far into the tray depth
	const getPocketWidthLengthwise = (shape: string): number => {
		// Not used for lengthwise - slot width is counter span, not pocket dimension
		return getPocketWidth(shape);
	};

	const getPocketLengthLengthwise = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (custom) {
			const w = custom.width + clearance * 2;
			const l = custom.length + clearance * 2;
			return Math.max(w, l);  // Longer side along Y (perpendicular to tray length)
		}
		return getPocketLength(shape);
	};

	const getMaxPocketDim = (shape: string): number =>
		Math.max(getPocketWidth(shape), getPocketLength(shape));

	// Get counter dimensions (without clearance) for visualization
	const getCounterWidth = (shape: string): number => {
		if (shape === 'square') return squareWidth;
		if (shape === 'hex') return hexPointyTop ? hexFlatToFlatBase : hexFlatToFlatBase / Math.cos(Math.PI / 6);
		const custom = getCustomShape(shape);
		if (custom) {
			return Math.max(custom.width, custom.length);  // Longer side along X for top-loaded/crosswise
		}
		return circleDiameterBase;
	};

	const getCounterLength = (shape: string): number => {
		if (shape === 'square') return squareLength;
		if (shape === 'hex') return hexPointyTop ? hexFlatToFlatBase / Math.cos(Math.PI / 6) : hexFlatToFlatBase;
		const custom = getCustomShape(shape);
		if (custom) {
			return Math.min(custom.width, custom.length);  // Shorter side along Y for top-loaded/crosswise
		}
		return circleDiameterBase;
	};

	// Lengthwise variants for counter dimensions
	// For lengthwise custom shapes: shorter side = standing height, longer side along Y
	const getCounterWidthLengthwise = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (custom) {
			return Math.min(custom.width, custom.length);  // Shorter side (standing height)
		}
		return getCounterWidth(shape);
	};

	const getCounterLengthLengthwise = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (custom) {
			return Math.max(custom.width, custom.length);  // Longer side along Y
		}
		return getCounterLength(shape);
	};

	// Standing height for edge-loaded counters
	// For crosswise: uses longer dimension as height
	const getStandingHeight = (shape: string): number =>
		Math.max(getCounterWidth(shape), getCounterLength(shape));

	// For lengthwise custom shapes: shorter dimension is height (longer runs along Y)
	const getStandingHeightLengthwise = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (custom) {
			return Math.min(custom.width, custom.length);  // Shorter side is height
		}
		return getStandingHeight(shape);
	};

	// For crosswise custom shapes: shorter dimension is height (longer runs along X)
	const getStandingHeightCrosswise = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (custom) {
			return Math.min(custom.width, custom.length);  // Shorter side is height
		}
		return getStandingHeight(shape);
	};

	// Parse shape reference to get shape type and custom name
	const parseShapeRef = (shapeRef: string): { shapeType: 'square' | 'hex' | 'circle' | 'custom'; customName?: string } => {
		if (shapeRef.startsWith('custom:')) {
			return { shapeType: 'custom', customName: shapeRef.substring(7) };
		}
		return { shapeType: shapeRef as 'square' | 'hex' | 'circle' };
	};

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
			const counterSpan = count * counterThickness + (count - 1) * clearance;

			// Default to lengthwise if not specified
			const orientation: 'lengthwise' | 'crosswise' = orientationPref || 'lengthwise';

			if (orientation === 'lengthwise') {
				// Lengthwise: counters stack along X (left to right), takes a row at front
				// For custom shapes: longer side along Y (perpendicular to tray), shorter side is height
				const slotDepthDim = getPocketLengthLengthwise(shape);
				const standingHeight = getStandingHeightLengthwise(shape);
				edgeLoadedSlots.push({
					shape,
					count,
					orientation,
					slotWidth: counterSpan,       // Counters stack along X (left to right)
					slotDepth: slotDepthDim,      // Counter dimension along Y (row depth)
					standingHeight,
					originalIndex: i
				});
			} else {
				// Crosswise: counters stack along Y (front to back), takes a column
				// For custom shapes: longer side along X (parallel to tray length), shorter side is height
				const slotWidthDim = getPocketWidth(shape);  // Longer side along X
				const standingHeight = getStandingHeightCrosswise(shape);
				edgeLoadedSlots.push({
					shape,
					count,
					orientation,
					slotWidth: slotWidthDim,      // Counter dimension along X (longer side)
					slotDepth: counterSpan,       // Counters stack along Y (front to back)
					standingHeight,
					originalIndex: i
				});
			}
		}
	}

	// Sort edge-loaded by slot size (largest first)
	edgeLoadedSlots.sort((a, b) => (b.slotWidth * b.slotDepth) - (a.slotWidth * a.slotDepth));

	// === TOP-LOADED STACK PLACEMENTS (greedy bin-packing) ===
	interface TopLoadedPlacement {
		shapeRef: string;
		count: number;
		pocketWidth: number;
		pocketLength: number;
		rowAssignment: 'front' | 'back';
		xPosition: number;
		originalIndex: number;
	}

	// Sort top-loaded stacks by area (largest first for better packing)
	const sortedStacks = stacks ? [...stacks].map((s, i) => ({ stack: s, originalIndex: i }))
		.sort((a, b) => {
			const areaA = getPocketWidth(a.stack[0]) * getPocketLength(a.stack[0]);
			const areaB = getPocketWidth(b.stack[0]) * getPocketLength(b.stack[0]);
			return areaB - areaA; // Largest first
		}) : [];

	const topLoadedPlacements: TopLoadedPlacement[] = [];

	// Calculate cutout radius for lengthwise slots
	const getSlotCutoutRadius = (slot: EdgeLoadedSlot): number =>
		Math.min(cutoutMax, slot.slotDepth * cutoutRatio);

	// Calculate cutout radius for top-loaded stacks
	const getTopLoadedCutoutRadius = (shapeRef: string): number =>
		Math.min(cutoutMax, getPocketLength(shapeRef) * cutoutRatio);

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

	// Calculate effective row depths (starting from lengthwise slots, then adding crosswise and top-loaded)
	let effectiveFrontRowDepth = 0;
	let effectiveBackRowDepth = 0;
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
	let topLoadedFrontX = edgeLoadedSlots.length > 0 ? edgeLoadedEndX : wallThickness;
	let topLoadedBackX = edgeLoadedSlots.length > 0 ? edgeLoadedEndX : wallThickness;

	// Greedy bin-packing for top-loaded stacks
	for (const { stack, originalIndex } of sortedStacks) {
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
				xPosition: topLoadedFrontX,
				originalIndex
			});
			topLoadedFrontX += pw + wallThickness;
		} else {
			topLoadedPlacements.push({
				shapeRef,
				count,
				pocketWidth: pw,
				pocketLength: pl,
				rowAssignment: 'back',
				xPosition: topLoadedBackX,
				originalIndex
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

	// Calculate tray height from top-loaded stacks
	let maxTopLoadedHeight = 0;
	for (const placement of topLoadedPlacements) {
		const stackHeight = placement.count * counterThickness;
		maxTopLoadedHeight = Math.max(maxTopLoadedHeight, stackHeight);
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
		const { shapeType, customName } = parseShapeRef(slot.shape);
		const pocketFloorZ = trayHeight - rimHeight - slot.standingHeight;
		const rowAssignment = (slot as EdgeLoadedSlot & { rowAssignment: string }).rowAssignment;
		const slotXStart = (slot as EdgeLoadedSlot & { xPosition: number }).xPosition;
		const slotYStart = rowAssignment === 'front' ? frontRowYStart : effectiveBackRowYStart;

		counterStacks.push({
			shape: shapeType,
			customShapeName: customName,
			x: slotXStart,
			y: slotYStart,
			z: pocketFloorZ + spacerOffset,
			width: getCounterWidthLengthwise(slot.shape),
			length: getCounterLengthLengthwise(slot.shape),
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
		const { shapeType, customName } = parseShapeRef(slot.shape);
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

		// For crosswise custom shapes: width=shorter (standing height), length=longer (horizontal X dim)
		const custom = getCustomShape(slot.shape);
		const counterWidth = custom ? Math.min(custom.width, custom.length) : getCounterWidth(slot.shape);
		const counterLength = custom ? Math.max(custom.width, custom.length) : getCounterLength(slot.shape);

		counterStacks.push({
			shape: shapeType,
			customShapeName: customName,
			x: slotXStart,
			y: slotYStart,
			z: pocketFloorZ + spacerOffset,
			width: counterWidth,
			length: counterLength,
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

	// Add top-loaded stacks (using greedy bin-packing placements)
	for (const placement of topLoadedPlacements) {
		const { shapeType, customName } = parseShapeRef(placement.shapeRef);
		const pocketDepth = placement.count * counterThickness;
		const pocketFloorZ = trayHeight - rimHeight - pocketDepth;

		// X center is at the middle of the pocket
		const xCenter = placement.xPosition + placement.pocketWidth / 2;

		// Y position depends on row assignment
		let yCenter: number;
		if (placement.rowAssignment === 'front') {
			// Front row: align to front wall
			yCenter = topLoadedYStart + placement.pocketLength / 2;
		} else {
			// Back row: align to back wall
			yCenter = effectiveBackRowYStart + (effectiveBackRowDepth - placement.pocketLength) + placement.pocketLength / 2;
		}

		counterStacks.push({
			shape: shapeType,
			customShapeName: customName,
			x: xCenter,
			y: yCenter,
			z: pocketFloorZ + spacerOffset,
			width: getCounterWidth(placement.shapeRef),
			length: getCounterLength(placement.shapeRef),
			thickness: counterThickness,
			count: placement.count,
			hexPointyTop,
			color: generateStackColor(placement.originalIndex)
		});
	}

	return counterStacks;
}

export function createCounterTray(params: CounterTrayParams, trayName?: string, targetHeight?: number, floorSpacerHeight?: number) {
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
		edgeLoadedStacks,
		customShapes
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

	// Helper to get custom shape by name from 'custom:ShapeName' reference
	const getCustomShape = (shapeRef: string): CustomShape | null => {
		if (!shapeRef.startsWith('custom:')) return null;
		const name = shapeRef.substring(7);
		return customShapes?.find(s => s.name === name) || null;
	};

	// Get pocket dimensions for a shape
	// For top-loaded/crosswise custom shapes: LONGER side = width (X), SHORTER side = length (Y)
	const getPocketWidth = (shape: string): number => {
		if (shape === 'square') return squarePocketWidth;
		if (shape === 'hex') return hexPocketWidth;
		const custom = getCustomShape(shape);
		if (custom) {
			const w = custom.width + clearance * 2;
			const l = custom.length + clearance * 2;
			return Math.max(w, l);  // Longer side along X (parallel to tray length)
		}
		return circlePocketWidth;
	};

	const getPocketLength = (shape: string): number => {
		if (shape === 'square') return squarePocketLength;
		if (shape === 'hex') return hexPocketLength;
		const custom = getCustomShape(shape);
		if (custom) {
			const w = custom.width + clearance * 2;
			const l = custom.length + clearance * 2;
			return Math.min(w, l);  // Shorter side along Y
		}
		return circlePocketLength;
	};

	// For lengthwise edge-loaded: longest dimension runs perpendicular to tray (along Y)
	// This prevents the slot from receding too far into the tray depth
	const getPocketWidthLengthwise = (shape: string): number => {
		// Not used for lengthwise - slot width is counter span, not pocket dimension
		return getPocketWidth(shape);
	};

	const getPocketLengthLengthwise = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (custom) {
			const w = custom.width + clearance * 2;
			const l = custom.length + clearance * 2;
			return Math.max(w, l);  // Longer side along Y (perpendicular to tray length)
		}
		return getPocketLength(shape);
	};

	const getMaxPocketDim = (shape: string): number =>
		Math.max(getPocketWidth(shape), getPocketLength(shape));

	// Get actual counter dimensions (without clearance) for pocket depth calculations
	const getCounterWidth = (shape: string): number => {
		if (shape === 'square') return squareWidth;
		if (shape === 'hex') return hexPointyTop ? hexFlatToFlatBase : hexFlatToFlatBase / Math.cos(Math.PI / 6);
		const custom = getCustomShape(shape);
		if (custom) {
			return Math.max(custom.width, custom.length);  // Longer side along X
		}
		return circleDiameterBase;
	};

	const getCounterLength = (shape: string): number => {
		if (shape === 'square') return squareLength;
		if (shape === 'hex') return hexPointyTop ? hexFlatToFlatBase / Math.cos(Math.PI / 6) : hexFlatToFlatBase;
		const custom = getCustomShape(shape);
		if (custom) {
			return Math.min(custom.width, custom.length);  // Shorter side along Y
		}
		return circleDiameterBase;
	};

	// Standing height for edge-loaded counters (actual counter size, not pocket size)
	const getStandingHeight = (shape: string): number =>
		Math.max(getCounterWidth(shape), getCounterLength(shape));

	// For lengthwise custom shapes: shorter dimension is height (longer runs along Y)
	const getStandingHeightLengthwise = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (custom) {
			return Math.min(custom.width, custom.length);  // Shorter side is height
		}
		return getStandingHeight(shape);
	};

	// For crosswise custom shapes: shorter dimension is height (longer runs along X)
	const getStandingHeightCrosswise = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (custom) {
			return Math.min(custom.width, custom.length);  // Shorter side is height
		}
		return getStandingHeight(shape);
	};

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
			const counterSpan = count * counterThickness + (count - 1) * clearance;

			// Default to lengthwise if not specified
			const orientation: 'lengthwise' | 'crosswise' = orientationPref || 'lengthwise';

			if (orientation === 'lengthwise') {
				// Lengthwise: counters stack along X (left to right), takes a row at front
				// For custom shapes: longer side along Y (perpendicular to tray), shorter side is height
				const slotDepthDim = getPocketLengthLengthwise(shape);
				const standingHeight = getStandingHeightLengthwise(shape);
				edgeLoadedSlots.push({
					shape,
					count,
					orientation,
					slotWidth: counterSpan,       // Counters stack along X (left to right)
					slotDepth: slotDepthDim,      // Counter dimension along Y (row depth)
					standingHeight,
					originalIndex: i
				});
			} else {
				// Crosswise: counters stack along Y (front to back), takes a column
				// For custom shapes: longer side along X (parallel to tray length), shorter side is height
				const slotWidthDim = getPocketWidth(shape);  // Longer side along X
				const standingHeight = getStandingHeightCrosswise(shape);
				edgeLoadedSlots.push({
					shape,
					count,
					orientation,
					slotWidth: slotWidthDim,      // Counter dimension along X (longer side)
					slotDepth: counterSpan,       // Counters stack along Y (front to back)
					standingHeight,
					originalIndex: i
				});
			}
		}
	}

	// Sort edge-loaded by slot size (largest first)
	edgeLoadedSlots.sort((a, b) => (b.slotWidth * b.slotDepth) - (a.slotWidth * a.slotDepth));

	// === TOP-LOADED STACK PLACEMENTS (greedy bin-packing) ===
	interface TopLoadedPlacement {
		shapeRef: string;
		count: number;
		pocketWidth: number;
		pocketLength: number;
		rowAssignment: 'front' | 'back';
		xPosition: number;
		originalIndex: number;
	}

	// Sort top-loaded stacks by area (largest first for better packing)
	const sortedStacks = stacks ? [...stacks].map((s, i) => ({ stack: s, originalIndex: i }))
		.sort((a, b) => {
			const areaA = getPocketWidth(a.stack[0]) * getPocketLength(a.stack[0]);
			const areaB = getPocketWidth(b.stack[0]) * getPocketLength(b.stack[0]);
			return areaB - areaA; // Largest first
		}) : [];

	const topLoadedPlacements: TopLoadedPlacement[] = [];

	// Calculate cutout radius for a slot (used for lengthwise half-sphere cutouts)
	const getSlotCutoutRadius = (slot: EdgeLoadedSlot): number =>
		Math.min(cutoutMax, slot.slotDepth * cutoutRatio);

	// Calculate cutout radius for top-loaded stacks
	const getTopLoadedCutoutRadius = (shapeRef: string): number =>
		Math.min(cutoutMax, getPocketLength(shapeRef) * cutoutRatio);

	// Max edge-loaded height (calculated before placements)
	let maxEdgeLoadedHeight = 0;
	for (const slot of edgeLoadedSlots) {
		maxEdgeLoadedHeight = Math.max(maxEdgeLoadedHeight, slot.standingHeight);
	}

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
	let effectiveFrontRowDepth = 0;
	let effectiveBackRowDepth = 0;
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
	let topLoadedFrontX = edgeLoadedSlots.length > 0 ? edgeLoadedEndX : wallThickness;
	let topLoadedBackX = edgeLoadedSlots.length > 0 ? edgeLoadedEndX : wallThickness;

	// Greedy bin-packing for top-loaded stacks
	for (const { stack, originalIndex } of sortedStacks) {
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
				xPosition: topLoadedFrontX,
				originalIndex
			});
			topLoadedFrontX += pw + wallThickness;
		} else {
			topLoadedPlacements.push({
				shapeRef,
				count,
				pocketWidth: pw,
				pocketLength: pl,
				rowAssignment: 'back',
				xPosition: topLoadedBackX,
				originalIndex
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

	// Calculate max top-loaded stack height from placements
	let maxTopLoadedHeight = 0;
	for (const placement of topLoadedPlacements) {
		const stackHeight = placement.count * counterThickness;
		maxTopLoadedHeight = Math.max(maxTopLoadedHeight, stackHeight);
	}

	// Use maximum of both for tray height
	const maxStackHeight = Math.max(maxTopLoadedHeight, maxEdgeLoadedHeight);

	// Calculate tray length from placements
	const topLoadedEndX = Math.max(topLoadedFrontX, topLoadedBackX);
	const trayLengthAuto = topLoadedPlacements.length > 0 ? topLoadedEndX : edgeLoadedEndX;
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
	const trayHeightWithoutSpacer = targetHeight && targetHeight > baseTrayHeight ? targetHeight : baseTrayHeight;
	// Total tray height including floor spacer (if any)
	const spacerHeight = floorSpacerHeight ?? 0;
	const trayHeight = trayHeightWithoutSpacer + spacerHeight;
	// Effective rim height may be taller to reach target
	const effectiveRimHeight = trayHeightWithoutSpacer - floorThickness - maxStackHeight;

	// Extra tray area
	const extraTrayLength = trayLength > trayLengthAuto ? trayLength - trayLengthAuto : 0;
	const extraTrayStartX = trayLengthAuto;
	const extraTrayInnerWidth = trayWidth - 2 * wallThickness;
	const extraTrayInnerLength = extraTrayLength - wallThickness;
	// Extra tray depth should not include the spacer - it's the usable depth from the tray surface
	const extraTrayDepth = trayHeightWithoutSpacer - floorThickness;

	// Cutout radius for a shape
	const getCutoutRadius = (shape: string): number =>
		Math.min(cutoutMax, getPocketWidth(shape) * cutoutRatio);

	// Create pocket shape
	const createPocketShape = (shape: string, height: number) => {
		const pw = getPocketWidth(shape);
		const pl = getPocketLength(shape);

		// Custom shapes are rectangular, use cuboid like square
		if (shape === 'square' || shape.startsWith('custom:')) {
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
					translate([xPos, yPos, spacerHeight + floorThickness], createScoopableCell(cellWidth, cellLength, extraTrayDepth))
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

	// Top-loaded pockets (using greedy bin-packing placements)
	for (const placement of topLoadedPlacements) {
		const pocketDepth = placement.count * counterThickness;
		// Use original rimHeight (not effectiveRimHeight) so pocket depth stays constant
		const pocketFloorZ = trayHeight - rimHeight - pocketDepth;

		// Create pocket shape for this placement
		const pocketShape = createPocketShape(placement.shapeRef, pocketDepth + rimHeight + 1);

		// Calculate Y offset based on row assignment
		const isFrontRow = placement.rowAssignment === 'front';
		const rowDepth = isFrontRow ? effectiveFrontRowDepth : effectiveBackRowDepth;
		const yOffset = isFrontRow ? 0 : rowDepth - placement.pocketLength;
		const yStart = isFrontRow ? topLoadedYStart : effectiveBackRowYStart;

		// Center the pocket within the column width (which equals pocket width for greedy packing)
		const xOffset = 0;

		pocketCuts.push(
			translate(
				[placement.xPosition + xOffset, yStart + yOffset, pocketFloorZ],
				pocketShape
			)
		);

		// Finger cutout at the tray edge
		const cutoutRadius = getTopLoadedCutoutRadius(placement.shapeRef);
		const xCenter = placement.xPosition + placement.pocketWidth / 2;
		if (isFrontRow) {
			// Front row: cutout at tray front
			fingerCuts.push(
				translate([xCenter, 0, 0], createFingerCutout(cutoutRadius))
			);
		} else {
			// Back row: cutout at tray back
			fingerCuts.push(
				translate([xCenter, trayWidth, 0], createFingerCutout(cutoutRadius))
			);
		}
	}

	const extraCells = createExtraTrayArea();

	// The tray body now includes the spacer height, and pockets are cut at the correct Z positions
	let result = subtract(trayBody, ...pocketCuts, ...fingerCuts, ...extraCells);

	// Emboss tray name on bottom (Z=0 face)
	if (trayName && trayName.trim().length > 0) {
		const textDepth = 0.6;
		const strokeWidth = 1.2;
		const textHeightParam = 6;
		const margin = wallThickness * 2;

		const textSegments = vectorText({ height: textHeightParam, align: 'center' }, trayName.trim().toUpperCase());

		if (textSegments.length > 0) {
			const textShapes: ReturnType<typeof extrudeLinear>[] = [];
			for (const segment of textSegments) {
				if (segment.length >= 2) {
					const pathObj = path2.fromPoints({ closed: false }, segment);
					const expanded = expand({ delta: strokeWidth / 2, corners: 'round', segments: 32 }, pathObj);
					const extruded = extrudeLinear({ height: textDepth + 0.1 }, expanded);
					textShapes.push(extruded);
				}
			}

			if (textShapes.length > 0) {
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
				const textWidthCalc = maxX - minX + strokeWidth;
				const textHeightY = maxY - minY + strokeWidth;

				// Fit text along tray length (X axis)
				const availableWidth = trayLength - margin * 2;
				const availableDepth = trayWidth - margin * 2;
				const scaleX = Math.min(1, availableWidth / textWidthCalc);
				const scaleY = Math.min(1, availableDepth / textHeightY);
				const textScale = Math.min(scaleX, scaleY);

				const centerX = trayLength / 2;
				const centerY = trayWidth / 2;
				const textCenterX = (minX + maxX) / 2;
				const textCenterY = (minY + maxY) / 2;

				let combinedText = union(...textShapes);
				// Mirror Y so text reads correctly when tray is flipped
				combinedText = mirrorY(combinedText);

				const positionedText = translate(
					[centerX - textCenterX * textScale, centerY + textCenterY * textScale, -0.1],
					scale([textScale, textScale, 1], combinedText)
				);
				result = subtract(result, positionedText);
			}
		}
	}

	return result;
}
