import jscad from '@jscad/modeling';

const { cuboid, cylinder, roundedCuboid, sphere, circle, rectangle } = jscad.primitives;
const { subtract, union } = jscad.booleans;
const { translate, rotateX, rotateY, rotateZ, scale, mirrorY } = jscad.transforms;
const { hull } = jscad.hulls;
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

// Base shape types for custom shapes
export type CustomBaseShape = 'rectangle' | 'square' | 'circle' | 'hex' | 'triangle';

// Custom shape definition
export interface CustomShape {
	name: string; // Unique identifier, e.g., "Large Card"
	baseShape: CustomBaseShape; // The underlying shape type
	width: number; // For rectangle: width. For square/circle/hex: the single dimension (size/diameter/flat-to-flat)
	length: number; // For rectangle: length. For square/circle/hex: same as width (auto-set)
	cornerRadius?: number; // For triangle shapes: rounded corner radius
	pointyTop?: boolean; // For hex shapes: pointy top orientation
}

export interface CounterTrayParams {
	counterThickness: number;
	clearance: number;
	wallThickness: number;
	floorThickness: number;
	rimHeight: number;
	cutoutRatio: number;
	cutoutMax: number;
	trayWidthOverride: number;
	extraTrayCols: number;
	extraTrayRows: number;
	topLoadedStacks: TopLoadedStackDef[];
	edgeLoadedStacks: EdgeLoadedStackDef[];
	customShapes: CustomShape[];
	printBedSize: number;
}

export const defaultParams: CounterTrayParams = {
	counterThickness: 1.3,
	clearance: 0.3,
	wallThickness: 2.0,
	floorThickness: 2.0,
	rimHeight: 2.0,
	cutoutRatio: 0.35,
	cutoutMax: 12,
	trayWidthOverride: 0,
	extraTrayCols: 1,
	extraTrayRows: 1,
	topLoadedStacks: [
		['custom:Square', 12],
		['custom:Hex', 10],
		['custom:Circle', 8],
		['custom:Triangle', 6]
	],
	edgeLoadedStacks: [
		['custom:Triangle', 10, 'lengthwise'],
		['custom:Triangle', 10, 'crosswise'],
		['custom:Circle', 8, 'lengthwise'],
		['custom:Circle', 8, 'crosswise'],
		['custom:Hex', 6, 'lengthwise'],
		['custom:Hex', 6, 'crosswise'],
		['custom:Square', 4, 'lengthwise'],
		['custom:Square', 4, 'crosswise']
	],
	customShapes: [
		{ name: 'Square', baseShape: 'square', width: 15.9, length: 15.9 },
		{ name: 'Hex', baseShape: 'hex', width: 15.9, length: 15.9, pointyTop: false },
		{ name: 'Circle', baseShape: 'circle', width: 15.9, length: 15.9 },
		{ name: 'Triangle', baseShape: 'triangle', width: 15.9, length: 15.9, cornerRadius: 1.5 }
	],
	printBedSize: 256
};

// Counter preview data for visualization
export interface CounterStack {
	shape: 'square' | 'hex' | 'circle' | 'triangle' | 'custom';
	customShapeName?: string; // Only set when shape === 'custom'
	customBaseShape?: CustomBaseShape; // The base shape type when shape === 'custom'
	x: number; // Center X position in tray (or slot start X for edge-loaded)
	y: number; // Center Y position in tray (or slot start Y for edge-loaded)
	z: number; // Bottom Z position of stack
	width: number; // Counter width (X dimension when flat)
	length: number; // Counter length (Y dimension when flat)
	thickness: number; // Single counter thickness
	count: number; // Number of counters in stack
	hexPointyTop: boolean;
	color: string; // Random color for this stack
	label?: string; // User-provided label for this stack
	// Edge-loaded stack fields
	isEdgeLoaded?: boolean;
	edgeOrientation?: 'lengthwise' | 'crosswise';
	slotWidth?: number; // X dimension of the slot
	slotDepth?: number; // Y dimension of the slot
}

// Generate harmonious colors for counter stacks (warm earth tones matching primary red)
function generateStackColor(index: number): string {
	// Warm palette hues: reds, oranges, browns, and complementary teals
	const warmHues = [15, 25, 35, 160, 170, 30, 20, 165, 40, 155];
	const hue = warmHues[index % warmHues.length];
	const saturation = 50 + (index % 3) * 10; // 50-70%
	const lightness = 45 + (index % 4) * 5; // 45-60%
	return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

// Calculate counter positions for preview rendering
export function getCounterPositions(
	params: CounterTrayParams,
	targetHeight?: number,
	floorSpacerHeight?: number
): CounterStack[] {
	const spacerOffset = floorSpacerHeight ?? 0;
	const {
		counterThickness,
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

	if ((!stacks || stacks.length === 0) && (!edgeLoadedStacks || edgeLoadedStacks.length === 0))
		return [];

	// Helper to get custom shape by name from 'custom:ShapeName' reference
	const getCustomShape = (shapeRef: string): CustomShape | null => {
		if (!shapeRef.startsWith('custom:')) return null;
		const name = shapeRef.substring(7);
		return customShapes?.find((s) => s.name === name) || null;
	};

	// Get effective dimensions for custom shapes based on their base shape
	// Returns [width, length] accounting for hex point-to-point calculations
	const getCustomEffectiveDims = (custom: CustomShape): [number, number] => {
		const baseShape = custom.baseShape ?? 'rectangle';
		if (baseShape === 'hex') {
			// width stores flat-to-flat, calculate point-to-point
			const flatToFlat = custom.width;
			const pointToPoint = flatToFlat / Math.cos(Math.PI / 6);
			// Use shape's pointyTop setting
			const hexPointyTop = custom.pointyTop ?? false;
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

	// Pocket width (X dimension) - for top-loaded/crosswise, use LONGER side (parallel to tray width)
	const getPocketWidth = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (!custom) throw new Error(`Unknown shape: ${shape}`);
		const [w, l] = getCustomEffectiveDims(custom);
		// For top-loaded/crosswise: longer side along X (parallel to tray width)
		return Math.max(w, l) + clearance * 2;
	};

	// Pocket length (Y dimension) - for top-loaded/crosswise, use SHORTER side
	const getPocketLength = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (!custom) throw new Error(`Unknown shape: ${shape}`);
		const [w, l] = getCustomEffectiveDims(custom);
		// For top-loaded/crosswise: shorter side along Y
		return Math.min(w, l) + clearance * 2;
	};

	// For lengthwise edge-loaded: longest dimension runs perpendicular to tray (along Y)
	// This prevents the slot from receding too far into the tray depth
	const getPocketLengthLengthwise = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (!custom) throw new Error(`Unknown shape: ${shape}`);
		const [w, l] = getCustomEffectiveDims(custom);
		return Math.max(w, l) + clearance * 2; // Longer side along Y (perpendicular to tray width)
	};

	// Get counter dimensions (without clearance) for visualization
	const getCounterWidth = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (!custom) throw new Error(`Unknown shape: ${shape}`);
		const [w, l] = getCustomEffectiveDims(custom);
		return Math.max(w, l); // Longer side along X for top-loaded/crosswise
	};

	const getCounterLength = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (!custom) throw new Error(`Unknown shape: ${shape}`);
		const [w, l] = getCustomEffectiveDims(custom);
		return Math.min(w, l); // Shorter side along Y for top-loaded/crosswise
	};

	// Lengthwise variants for counter dimensions
	// For lengthwise custom shapes: shorter side = standing height, longer side along Y
	const getCounterWidthLengthwise = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (!custom) throw new Error(`Unknown shape: ${shape}`);
		const [w, l] = getCustomEffectiveDims(custom);
		return Math.min(w, l); // Shorter side (standing height)
	};

	const getCounterLengthLengthwise = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (!custom) throw new Error(`Unknown shape: ${shape}`);
		const [w, l] = getCustomEffectiveDims(custom);
		return Math.max(w, l); // Longer side along Y
	};

	// Standing height for edge-loaded counters
	// For triangles standing with point down, height is the triangle's geometric height
	const getStandingHeight = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (!custom) throw new Error(`Unknown shape: ${shape}`);
		if (custom.baseShape === 'triangle') {
			return custom.width * (Math.sqrt(3) / 2); // Triangle geometric height
		}
		const [w, l] = getCustomEffectiveDims(custom);
		return Math.max(w, l);
	};

	// For lengthwise custom shapes: shorter dimension is height (longer runs along Y)
	const getStandingHeightLengthwise = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (!custom) throw new Error(`Unknown shape: ${shape}`);
		if (custom.baseShape === 'triangle') {
			return custom.width * (Math.sqrt(3) / 2); // Triangle geometric height
		}
		const [w, l] = getCustomEffectiveDims(custom);
		return Math.min(w, l); // Shorter side is height
	};

	// For crosswise custom shapes: shorter dimension is height (longer runs along X)
	const getStandingHeightCrosswise = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (!custom) throw new Error(`Unknown shape: ${shape}`);
		if (custom.baseShape === 'triangle') {
			return custom.width * (Math.sqrt(3) / 2); // Triangle geometric height
		}
		const [w, l] = getCustomEffectiveDims(custom);
		return Math.min(w, l); // Shorter side is height
	};

	// Parse shape reference to get shape type, custom name, and base shape
	const parseShapeRef = (
		shapeRef: string
	): {
		shapeType: 'square' | 'hex' | 'circle' | 'triangle' | 'custom';
		customName?: string;
		customBaseShape?: CustomBaseShape;
	} => {
		if (shapeRef.startsWith('custom:')) {
			const customName = shapeRef.substring(7);
			const customShape = getCustomShape(shapeRef);
			return {
				shapeType: 'custom',
				customName,
				customBaseShape: customShape?.baseShape ?? 'rectangle'
			};
		}
		return { shapeType: shapeRef as 'square' | 'hex' | 'circle' | 'triangle' };
	};

	// Calculate edge-loaded slot dimensions
	interface EdgeLoadedSlot {
		shape: string;
		count: number;
		orientation: 'lengthwise' | 'crosswise';
		slotWidth: number; // X dimension
		slotDepth: number; // Y dimension
		standingHeight: number;
		originalIndex: number;
		label?: string;
	}

	const edgeLoadedSlots: EdgeLoadedSlot[] = [];
	if (edgeLoadedStacks && edgeLoadedStacks.length > 0) {
		for (let i = 0; i < edgeLoadedStacks.length; i++) {
			const [shape, count, orientationPref, label] = edgeLoadedStacks[i];
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
					slotWidth: counterSpan, // Counters stack along X (left to right)
					slotDepth: slotDepthDim, // Counter dimension along Y (row depth)
					standingHeight,
					originalIndex: i,
					label
				});
			} else {
				// Crosswise: counters stack along Y (front to back), takes a column
				// For custom shapes: longer side along X (parallel to tray width), shorter side is height
				const slotWidthDim = getPocketWidth(shape); // Longer side along X
				const standingHeight = getStandingHeightCrosswise(shape);
				edgeLoadedSlots.push({
					shape,
					count,
					orientation,
					slotWidth: slotWidthDim, // Counter dimension along X (longer side)
					slotDepth: counterSpan, // Counters stack along Y (front to back)
					standingHeight,
					originalIndex: i,
					label
				});
			}
		}
	}

	// Sort edge-loaded by slot size (largest first)
	edgeLoadedSlots.sort((a, b) => b.slotWidth * b.slotDepth - a.slotWidth * a.slotDepth);

	// === TOP-LOADED STACK PLACEMENTS (greedy bin-packing) ===
	interface TopLoadedPlacement {
		shapeRef: string;
		count: number;
		pocketWidth: number;
		pocketLength: number;
		rowAssignment: 'front' | 'back';
		xPosition: number;
		originalIndex: number;
		label?: string;
	}

	// Sort top-loaded stacks by area (largest first for better packing)
	const sortedStacks = stacks
		? [...stacks]
				.map((s, i) => ({ stack: s, originalIndex: i }))
				.sort((a, b) => {
					const areaA = getPocketWidth(a.stack[0]) * getPocketLength(a.stack[0]);
					const areaB = getPocketWidth(b.stack[0]) * getPocketLength(b.stack[0]);
					return areaB - areaA; // Largest first
				})
		: [];

	const topLoadedPlacements: TopLoadedPlacement[] = [];

	// Calculate cutout radius for lengthwise slots
	const getSlotCutoutRadius = (slot: EdgeLoadedSlot): number =>
		Math.min(cutoutMax, slot.slotDepth * cutoutRatio);

	// === GREEDY BIN-PACKING FOR EDGE-LOADED SLOTS ===
	const lengthwiseSlots = edgeLoadedSlots.filter((s) => s.orientation === 'lengthwise');
	const crosswiseSlots = edgeLoadedSlots.filter((s) => s.orientation === 'crosswise');

	// Track current X position for each row (greedy bin-packing)
	let frontRowX = wallThickness;
	let backRowX = wallThickness;

	// Assign lengthwise slots to rows using greedy approach (shortest row first)
	// Adjacent slots share a half-cylinder cutout; first slot uses wall cutout (no left space needed)
	for (const slot of lengthwiseSlots) {
		const cutoutRadius = getSlotCutoutRadius(slot);

		if (frontRowX <= backRowX) {
			(slot as EdgeLoadedSlot & { rowAssignment: string; xPosition: number }).rowAssignment =
				'front';
			// First slot uses wall cutout (no left space needed)
			(slot as EdgeLoadedSlot & { xPosition: number }).xPosition = frontRowX;
			frontRowX += slot.slotWidth + cutoutRadius + wallThickness;
		} else {
			(slot as EdgeLoadedSlot & { rowAssignment: string; xPosition: number }).rowAssignment =
				'back';
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
		const [shapeRef, count, label] = stack;
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
				originalIndex,
				label
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
				originalIndex,
				label
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
		const { shapeType, customName, customBaseShape } = parseShapeRef(slot.shape);
		const pocketFloorZ = trayHeight - rimHeight - slot.standingHeight;
		const rowAssignment = (slot as EdgeLoadedSlot & { rowAssignment: string }).rowAssignment;
		const slotXStart = (slot as EdgeLoadedSlot & { xPosition: number }).xPosition;
		// Center slot within row depth so it aligns with shared cutouts
		const rowYStart = rowAssignment === 'front' ? frontRowYStart : effectiveBackRowYStart;
		const rowDepth = rowAssignment === 'front' ? effectiveFrontRowDepth : effectiveBackRowDepth;
		const slotYStart = rowYStart + (rowDepth - slot.slotDepth) / 2;

		const customShape = getCustomShape(slot.shape);
		counterStacks.push({
			shape: shapeType,
			customShapeName: customName,
			customBaseShape,
			x: slotXStart,
			y: slotYStart,
			z: pocketFloorZ + spacerOffset,
			width: getCounterWidthLengthwise(slot.shape),
			length: getCounterLengthLengthwise(slot.shape),
			thickness: counterThickness,
			count: slot.count,
			hexPointyTop: customShape?.pointyTop ?? false,
			color: generateStackColor(100 + i),
			label: slot.label,
			isEdgeLoaded: true,
			edgeOrientation: 'lengthwise',
			slotWidth: slot.slotWidth,
			slotDepth: slot.slotDepth
		});
	}

	// Calculate tray width for back position calculation
	const topLoadedTotalDepthPreview =
		effectiveFrontRowDepth +
		(effectiveBackRowDepth > 0 ? wallThickness + effectiveBackRowDepth : 0);
	const trayDepthPreview = wallThickness + topLoadedTotalDepthPreview + wallThickness;

	// Add crosswise edge-loaded stacks (using pre-calculated positions and row assignments)
	for (let i = 0; i < crosswiseSlots.length; i++) {
		const slot = crosswiseSlots[i];
		const { shapeType, customName, customBaseShape } = parseShapeRef(slot.shape);
		const pocketFloorZ = trayHeight - rimHeight - slot.standingHeight;
		const slotXStart = (slot as EdgeLoadedSlot & { xPosition: number }).xPosition;
		const rowAssignment = (slot as EdgeLoadedSlot & { rowAssignment: string }).rowAssignment;

		// Calculate Y position based on row assignment
		let slotYStart: number;
		if (rowAssignment === 'back') {
			// Back position: align to back of tray
			slotYStart = trayDepthPreview - wallThickness - slot.slotDepth;
		} else {
			// Front position: start at front wall
			slotYStart = wallThickness;
		}

		// For crosswise custom shapes: width=shorter (standing height), length=longer (horizontal X dim)
		const custom = getCustomShape(slot.shape);
		let counterWidth: number;
		let counterLength: number;
		if (custom) {
			const [w, l] = getCustomEffectiveDims(custom);
			counterWidth = Math.min(w, l);
			counterLength = Math.max(w, l);
		} else {
			counterWidth = getCounterWidth(slot.shape);
			counterLength = getCounterLength(slot.shape);
		}

		counterStacks.push({
			shape: shapeType,
			customShapeName: customName,
			customBaseShape,
			x: slotXStart,
			y: slotYStart,
			z: pocketFloorZ + spacerOffset,
			width: counterWidth,
			length: counterLength,
			thickness: counterThickness,
			count: slot.count,
			hexPointyTop: custom?.pointyTop ?? false,
			color: generateStackColor(200 + i),
			label: slot.label,
			isEdgeLoaded: true,
			edgeOrientation: 'crosswise',
			slotWidth: slot.slotWidth,
			slotDepth: slot.slotDepth
		});
	}

	// Add top-loaded stacks (using greedy bin-packing placements)
	for (const placement of topLoadedPlacements) {
		const { shapeType, customName, customBaseShape } = parseShapeRef(placement.shapeRef);
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
			yCenter =
				effectiveBackRowYStart +
				(effectiveBackRowDepth - placement.pocketLength) +
				placement.pocketLength / 2;
		}

		const customShape = getCustomShape(placement.shapeRef);
		counterStacks.push({
			shape: shapeType,
			customShapeName: customName,
			customBaseShape,
			x: xCenter,
			y: yCenter,
			z: pocketFloorZ + spacerOffset,
			width: getCounterWidth(placement.shapeRef),
			length: getCounterLength(placement.shapeRef),
			thickness: counterThickness,
			count: placement.count,
			hexPointyTop: customShape?.pointyTop ?? false,
			color: generateStackColor(placement.originalIndex),
			label: placement.label
		});
	}

	return counterStacks;
}

export function createCounterTray(
	params: CounterTrayParams,
	trayName?: string,
	targetHeight?: number,
	floorSpacerHeight?: number
) {
	const {
		counterThickness,
		clearance,
		wallThickness,
		floorThickness,
		rimHeight,
		cutoutRatio,
		cutoutMax,
		trayWidthOverride,
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

	// Helper to get custom shape by name from 'custom:ShapeName' reference
	const getCustomShape = (shapeRef: string): CustomShape | null => {
		if (!shapeRef.startsWith('custom:')) return null;
		const name = shapeRef.substring(7);
		return customShapes?.find((s) => s.name === name) || null;
	};

	// Get effective dimensions for custom shapes based on their base shape
	// Returns [width, length] accounting for hex point-to-point calculations
	const getCustomEffectiveDims = (custom: CustomShape): [number, number] => {
		const baseShape = custom.baseShape ?? 'rectangle';
		if (baseShape === 'hex') {
			// width stores flat-to-flat, calculate point-to-point
			const flatToFlat = custom.width;
			const pointToPoint = flatToFlat / Math.cos(Math.PI / 6);
			// Use shape's pointyTop setting
			const hexPointyTop = custom.pointyTop ?? false;
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

	// Get pocket dimensions for a shape
	// For top-loaded/crosswise custom shapes: LONGER side = width (X), SHORTER side = length (Y)
	const getPocketWidth = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (!custom) throw new Error(`Unknown shape: ${shape}`);
		const [w, l] = getCustomEffectiveDims(custom);
		return Math.max(w, l) + clearance * 2; // Longer side along X (parallel to tray width)
	};

	const getPocketLength = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (!custom) throw new Error(`Unknown shape: ${shape}`);
		const [w, l] = getCustomEffectiveDims(custom);
		return Math.min(w, l) + clearance * 2; // Shorter side along Y
	};

	// For lengthwise edge-loaded: longest dimension runs perpendicular to tray (along Y)
	// This prevents the slot from receding too far into the tray depth
	const getPocketLengthLengthwise = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (!custom) throw new Error(`Unknown shape: ${shape}`);
		const [w, l] = getCustomEffectiveDims(custom);
		return Math.max(w, l) + clearance * 2; // Longer side along Y (perpendicular to tray width)
	};

	// Get actual counter dimensions (without clearance) for pocket depth calculations
	const getCounterWidth = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (!custom) throw new Error(`Unknown shape: ${shape}`);
		const [w, l] = getCustomEffectiveDims(custom);
		return Math.max(w, l); // Longer side along X
	};

	const getCounterLength = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (!custom) throw new Error(`Unknown shape: ${shape}`);
		const [w, l] = getCustomEffectiveDims(custom);
		return Math.min(w, l); // Shorter side along Y
	};

	// Standing height for edge-loaded counters (actual counter size, not pocket size)
	// For triangles standing with point down, height is the triangle's geometric height
	const getStandingHeight = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (!custom) throw new Error(`Unknown shape: ${shape}`);
		if (custom.baseShape === 'triangle') {
			return custom.width * (Math.sqrt(3) / 2); // Triangle geometric height
		}
		const [w, l] = getCustomEffectiveDims(custom);
		return Math.max(w, l);
	};

	// For lengthwise custom shapes: shorter dimension is height (longer runs along Y)
	const getStandingHeightLengthwise = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (!custom) throw new Error(`Unknown shape: ${shape}`);
		if (custom.baseShape === 'triangle') {
			return custom.width * (Math.sqrt(3) / 2); // Triangle geometric height
		}
		const [w, l] = getCustomEffectiveDims(custom);
		return Math.min(w, l); // Shorter side is height
	};

	// For crosswise custom shapes: shorter dimension is height (longer runs along X)
	const getStandingHeightCrosswise = (shape: string): number => {
		const custom = getCustomShape(shape);
		if (!custom) throw new Error(`Unknown shape: ${shape}`);
		if (custom.baseShape === 'triangle') {
			return custom.width * (Math.sqrt(3) / 2); // Triangle geometric height
		}
		const [w, l] = getCustomEffectiveDims(custom);
		return Math.min(w, l); // Shorter side is height
	};

	// Calculate edge-loaded slot dimensions
	interface EdgeLoadedSlot {
		shape: string;
		count: number;
		orientation: 'lengthwise' | 'crosswise';
		slotWidth: number; // X dimension
		slotDepth: number; // Y dimension
		standingHeight: number;
		originalIndex: number;
		label?: string;
	}

	const edgeLoadedSlots: EdgeLoadedSlot[] = [];
	if (edgeLoadedStacks && edgeLoadedStacks.length > 0) {
		for (let i = 0; i < edgeLoadedStacks.length; i++) {
			const [shape, count, orientationPref, label] = edgeLoadedStacks[i];
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
					slotWidth: counterSpan, // Counters stack along X (left to right)
					slotDepth: slotDepthDim, // Counter dimension along Y (row depth)
					standingHeight,
					originalIndex: i,
					label
				});
			} else {
				// Crosswise: counters stack along Y (front to back), takes a column
				// For custom shapes: longer side along X (parallel to tray width), shorter side is height
				const slotWidthDim = getPocketWidth(shape); // Longer side along X
				const standingHeight = getStandingHeightCrosswise(shape);
				edgeLoadedSlots.push({
					shape,
					count,
					orientation,
					slotWidth: slotWidthDim, // Counter dimension along X (longer side)
					slotDepth: counterSpan, // Counters stack along Y (front to back)
					standingHeight,
					originalIndex: i,
					label
				});
			}
		}
	}

	// Sort edge-loaded by slot size (largest first)
	edgeLoadedSlots.sort((a, b) => b.slotWidth * b.slotDepth - a.slotWidth * a.slotDepth);

	// === TOP-LOADED STACK PLACEMENTS (greedy bin-packing) ===
	interface TopLoadedPlacement {
		shapeRef: string;
		count: number;
		pocketWidth: number;
		pocketLength: number;
		rowAssignment: 'front' | 'back';
		xPosition: number;
		originalIndex: number;
		label?: string;
	}

	// Sort top-loaded stacks by area (largest first for better packing)
	const sortedStacks = stacks
		? [...stacks]
				.map((s, i) => ({ stack: s, originalIndex: i }))
				.sort((a, b) => {
					const areaA = getPocketWidth(a.stack[0]) * getPocketLength(a.stack[0]);
					const areaB = getPocketWidth(b.stack[0]) * getPocketLength(b.stack[0]);
					return areaB - areaA; // Largest first
				})
		: [];

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
	const lengthwiseSlots = edgeLoadedSlots.filter((s) => s.orientation === 'lengthwise');
	const crosswiseSlots = edgeLoadedSlots.filter((s) => s.orientation === 'crosswise');

	// Track current X position for each row (greedy bin-packing)
	let frontRowX = wallThickness;
	let backRowX = wallThickness;

	// Assign lengthwise slots to rows using greedy approach (shortest row first)
	// Adjacent slots share a half-cylinder cutout; first slot uses wall cutout (no internal space needed)
	for (const slot of lengthwiseSlots) {
		const cutoutRadius = getSlotCutoutRadius(slot);

		// Assign to row with shorter current X
		if (frontRowX <= backRowX) {
			(slot as EdgeLoadedSlot & { rowAssignment: string; xPosition: number }).rowAssignment =
				'front';
			// First slot uses wall cutout (no left space needed); subsequent slots share half-cylinder
			(slot as EdgeLoadedSlot & { xPosition: number }).xPosition = frontRowX;
			// Reserve quarter-sphere space on right (will be replaced by half-cylinder if another slot follows)
			frontRowX += slot.slotWidth + cutoutRadius + wallThickness;
		} else {
			(slot as EdgeLoadedSlot & { rowAssignment: string; xPosition: number }).rowAssignment =
				'back';
			(slot as EdgeLoadedSlot & { xPosition: number }).xPosition = backRowX;
			backRowX += slot.slotWidth + cutoutRadius + wallThickness;
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
	const crosswiseXStart = Math.max(frontRowX, backRowX);

	// === CROSSWISE SLOT BIN-PACKING ===
	// Try to pair crosswise slots into columns (one at front, one at back) when they fit
	// Track columns: each column has a front slot, optional back slot, and X position
	interface CrosswiseColumn {
		frontSlot: EdgeLoadedSlot | null;
		backSlot: EdgeLoadedSlot | null;
		xPosition: number;
		columnWidth: number; // Max slotWidth of front/back
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
				xPosition: 0, // Will be assigned below
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
		const [shapeRef, count, label] = stack;
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
				originalIndex,
				label
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
				originalIndex,
				label
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

	// Calculate tray width from placements
	const topLoadedEndX = Math.max(topLoadedFrontX, topLoadedBackX);
	const trayWidthAuto = topLoadedPlacements.length > 0 ? topLoadedEndX : edgeLoadedEndX;
	const trayWidth = trayWidthOverride > 0 ? trayWidthOverride : trayWidthAuto;

	// Y positions for front and back rows
	const frontRowYStart = wallThickness;
	const topLoadedYStart = wallThickness;

	// Tray width (Y dimension) calculation - always 2 rows
	const topLoadedTotalDepth =
		effectiveFrontRowDepth +
		(effectiveBackRowDepth > 0 ? wallThickness + effectiveBackRowDepth : 0);

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
	const trayDepthAuto = topLoadedTotalDepth > 0 ? topLoadedTotalDepth : crosswiseMaxDepth;
	const trayDepth = wallThickness + trayDepthAuto + wallThickness;

	// Base tray height from this tray's stacks
	const baseTrayHeight = floorThickness + maxStackHeight + rimHeight;
	// If targetHeight provided, use it (increases rim to match tallest tray in box)
	const trayHeightWithoutSpacer =
		targetHeight && targetHeight > baseTrayHeight ? targetHeight : baseTrayHeight;
	// Total tray height including floor spacer (if any)
	const spacerHeight = floorSpacerHeight ?? 0;
	const trayHeight = trayHeightWithoutSpacer + spacerHeight;
	// Extra tray area
	const extraTrayLength = trayWidth > trayWidthAuto ? trayWidth - trayWidthAuto : 0;
	const extraTrayStartX = trayWidthAuto;
	const extraTrayInnerWidth = trayDepth - 2 * wallThickness;
	const extraTrayInnerLength = extraTrayLength - wallThickness;
	// Extra tray depth should not include the spacer - it's the usable depth from the tray surface
	const extraTrayDepth = trayHeightWithoutSpacer - floorThickness;

	// Create pocket shape
	const createPocketShape = (shape: string, height: number) => {
		const custom = getCustomShape(shape);
		if (!custom) throw new Error(`Unknown shape: ${shape}`);

		const pw = getPocketWidth(shape);
		const pl = getPocketLength(shape);
		const baseShape = custom.baseShape ?? 'rectangle';

		// Helper to create equilateral triangle prism with rounded corners (base along X, point towards +Y)
		const createTrianglePrism = (side: number, h: number, cornerRadius: number) => {
			// Use hull of three 2D circles at triangle vertices, then extrude
			const r = cornerRadius;
			const triHeight = side * (Math.sqrt(3) / 2);
			// Inset vertices so the rounded shape has correct overall dimensions
			const insetX = side / 2 - r;
			const insetYBottom = -triHeight / 2 + r;
			const insetYTop = triHeight / 2 - r * 2; // Top point needs more inset

			const corners2D = [
				translate([-insetX, insetYBottom, 0], circle({ radius: r, segments: 16 })),
				translate([insetX, insetYBottom, 0], circle({ radius: r, segments: 16 })),
				translate([0, insetYTop, 0], circle({ radius: r, segments: 16 }))
			];
			const roundedTriangle2D = hull(...corners2D);
			return extrudeLinear({ height: h }, roundedTriangle2D);
		};

		if (baseShape === 'hex') {
			// Hex: calculate point-to-point from flat-to-flat
			const flatToFlat = custom.width + clearance * 2;
			const pointToPoint = flatToFlat / Math.cos(Math.PI / 6);
			const hex = cylinder({
				height,
				radius: pointToPoint / 2,
				segments: 6,
				center: [0, 0, height / 2]
			});
			const hexPointyTop = custom.pointyTop ?? false;
			const rotated = hexPointyTop ? rotateZ(Math.PI / 6, hex) : hex;
			return translate([pw / 2, pl / 2, 0], rotated);
		} else if (baseShape === 'triangle') {
			// Triangle: use width as side length
			const side = custom.width + clearance * 2;
			const cornerRadius = custom.cornerRadius ?? 1.5;
			const tri = createTrianglePrism(side, height, cornerRadius);
			return translate([pw / 2, pl / 2, 0], tri);
		} else if (baseShape === 'circle') {
			// Circle: use width as diameter
			const diameter = custom.width + clearance * 2;
			return translate(
				[pw / 2, pl / 2, 0],
				cylinder({
					height,
					radius: diameter / 2,
					segments: 64,
					center: [0, 0, height / 2]
				})
			);
		} else {
			// Rectangle or square: use cuboid
			return cuboid({ size: [pw, pl, height], center: [pw / 2, pl / 2, height / 2] });
		}
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
		return translate([0, rowDepth / 2, trayHeight], rotateY(Math.PI / 2, cyl));
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
			center: [0, 0, boxSize / 2] // Remove top half, keep bottom half
		});

		const halfSphere = subtract(fullSphere, cutBox);

		// Position at tray top - sphere center at top surface so bottom half cuts into tray
		return translate([0, 0, trayHeight], halfSphere);
	};

	// Create edge-loaded pocket (slot for counters standing on edge)
	// For triangles: creates a triangular prism with point facing down
	const createEdgeLoadedPocket = (slot: EdgeLoadedSlot, xPos: number, yPos: number) => {
		const pocketHeight = slot.standingHeight;
		const pocketFloorZ = trayHeight - rimHeight - pocketHeight;
		const pocketCutHeight = pocketHeight + rimHeight + 1;

		const custom = getCustomShape(slot.shape);
		if (!custom) throw new Error(`Unknown shape: ${slot.shape}`);

		const isTriangle = custom.baseShape === 'triangle';

		if (isTriangle) {
			// Get the triangle side length (with clearance)
			const side = custom.width + clearance * 2;
			const triHeight = side * (Math.sqrt(3) / 2);
			const r = custom.cornerRadius ?? 1.5;

			// Create triangle with point facing DOWN (-Z) and flat side UP
			// For edge-loaded: only round the bottom point, keep top corners sharp for clean cut

			// Bottom point gets rounded, top corners are sharp (tiny radius for hull)
			const tinyR = 0.01; // Essentially a point
			const insetYBottom = -triHeight / 2 + r * 2; // Point (bottom) - inset for rounding
			const topY = triHeight / 2; // Top corners at full height (no inset)

			// Create 2D triangle: rounded bottom point, sharp top corners
			const corners2D = [
				translate([0, insetYBottom, 0], circle({ radius: r, segments: 16 })), // Rounded bottom point
				translate([-side / 2, topY, 0], circle({ radius: tinyR, segments: 4 })), // Sharp top left
				translate([side / 2, topY, 0], circle({ radius: tinyR, segments: 4 })) // Sharp top right
			];
			const roundedTriangle2D = hull(...corners2D);

			// Position cutout so bottom aligns with pocketFloorZ (where preview counter sits)
			// Triangle 2D shape has bottom at (-triHeight/2 + r) relative to center
			const triCenterZ = pocketFloorZ + triHeight / 2 - r;

			// Add rectangle on top to extend through tray top surface (like circle and hex)
			const topExtent = trayHeight + 1 - (triCenterZ + triHeight / 2);
			const rect2D = rectangle({
				size: [side, topExtent],
				center: [0, triHeight / 2 + topExtent / 2]
			});
			const combinedTriangle2D = union(roundedTriangle2D, rect2D);

			if (slot.orientation === 'crosswise') {
				// Crosswise: extrude along slotDepth (Y direction), counters stack front-to-back
				const extruded = extrudeLinear({ height: slot.slotDepth }, combinedTriangle2D);
				// Rotate so: point at -Z, base at +Z, extrusion along Y
				const rotated = rotateX(Math.PI / 2, translate([0, 0, -slot.slotDepth / 2], extruded));
				return translate(
					[xPos + slot.slotWidth / 2, yPos + slot.slotDepth / 2, triCenterZ],
					rotated
				);
			} else {
				// Lengthwise: extrude along slotWidth (X direction), counters stack left-to-right
				const extruded = extrudeLinear({ height: slot.slotWidth }, combinedTriangle2D);
				// Rotate so: point at -Z, base at +Z, extrusion along X
				const rotated = rotateZ(
					-Math.PI / 2,
					rotateX(Math.PI / 2, translate([0, 0, -slot.slotWidth / 2], extruded))
				);
				return translate(
					[xPos + slot.slotWidth / 2, yPos + slot.slotDepth / 2, triCenterZ],
					rotated
				);
			}
		}

		const isCircle = custom.baseShape === 'circle';

		if (isCircle) {
			// Get the circle diameter (with clearance)
			const diameter = custom.width + clearance * 2;
			const radius = diameter / 2;

			// Position cutout so bottom aligns with pocketFloorZ (where preview counter sits)
			const shapeCenterZ = pocketFloorZ + radius;

			// Create shape with semicircular bottom and flat top for easy loading
			// Union of: circle (for bottom half) + rectangle (for top half with straight sides)
			// Rectangle must extend high enough to cut through tray top
			const topExtent = trayHeight + 1 - shapeCenterZ;
			const circle2D = circle({ radius, segments: 64 });
			const rect2D = rectangle({ size: [diameter, topExtent], center: [0, topExtent / 2] });
			const combinedShape2D = union(circle2D, rect2D);

			if (slot.orientation === 'crosswise') {
				// Crosswise: extrude along slotDepth (Y direction), counters stack front-to-back
				const extruded = extrudeLinear({ height: slot.slotDepth }, combinedShape2D);
				// Rotate so: semicircle at bottom (-Z), flat top at +Z, extrusion along Y
				const rotated = rotateX(Math.PI / 2, translate([0, 0, -slot.slotDepth / 2], extruded));
				return translate(
					[xPos + slot.slotWidth / 2, yPos + slot.slotDepth / 2, shapeCenterZ],
					rotated
				);
			} else {
				// Lengthwise: extrude along slotWidth (X direction), counters stack left-to-right
				const extruded = extrudeLinear({ height: slot.slotWidth }, combinedShape2D);
				// Rotate so: semicircle at bottom (-Z), flat top at +Z, extrusion along X
				const rotated = rotateZ(
					-Math.PI / 2,
					rotateX(Math.PI / 2, translate([0, 0, -slot.slotWidth / 2], extruded))
				);
				return translate(
					[xPos + slot.slotWidth / 2, yPos + slot.slotDepth / 2, shapeCenterZ],
					rotated
				);
			}
		}

		const isHex = custom.baseShape === 'hex';

		if (isHex) {
			// Get the hex flat-to-flat dimension (with clearance)
			const flatToFlat = custom.width + clearance * 2;
			const pointToPoint = flatToFlat / Math.cos(Math.PI / 6);
			const radius = pointToPoint / 2;

			// Position cutout so bottom aligns with pocketFloorZ (where preview counter sits)
			// Hex vertex is at bottom after rotateZ(π/6), so offset by pointToPoint/2
			const shapeCenterZ = pocketFloorZ + pointToPoint / 2;

			// Create shape with hex bottom (flat side down) and flat top for easy loading
			// 2D hex with 6 segments, rotated π/6 so flat edge is at bottom
			const hex2D = rotateZ(Math.PI / 6, circle({ radius, segments: 6 }));
			// Rectangle covers top half (from center to top), must extend to cut through tray top
			// Width must match hex width at the flat edge (flatToFlat, not pointToPoint)
			const topExtent = trayHeight + 1 - shapeCenterZ;
			const rect2D = rectangle({ size: [flatToFlat, topExtent], center: [0, topExtent / 2] });
			const combinedShape2D = union(hex2D, rect2D);

			if (slot.orientation === 'crosswise') {
				// Crosswise: extrude along slotDepth (Y direction), counters stack front-to-back
				const extruded = extrudeLinear({ height: slot.slotDepth }, combinedShape2D);
				// Rotate so: hex bottom at -Z, flat top at +Z, extrusion along Y
				const rotated = rotateX(Math.PI / 2, translate([0, 0, -slot.slotDepth / 2], extruded));
				return translate(
					[xPos + slot.slotWidth / 2, yPos + slot.slotDepth / 2, shapeCenterZ],
					rotated
				);
			} else {
				// Lengthwise: extrude along slotWidth (X direction), counters stack left-to-right
				const extruded = extrudeLinear({ height: slot.slotWidth }, combinedShape2D);
				// Rotate so: hex bottom at -Z, flat top at +Z, extrusion along X
				const rotated = rotateZ(
					-Math.PI / 2,
					rotateX(Math.PI / 2, translate([0, 0, -slot.slotWidth / 2], extruded))
				);
				return translate(
					[xPos + slot.slotWidth / 2, yPos + slot.slotDepth / 2, shapeCenterZ],
					rotated
				);
			}
		}

		// Default: rectangular slot
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
					translate(
						[xPos, yPos, spacerHeight + floorThickness],
						createScoopableCell(cellWidth, cellLength, extraTrayDepth)
					)
				);
			}
		}
		return cells;
	};

	// Build the tray
	const trayBody = cuboid({
		size: [trayWidth, trayDepth, trayHeight],
		center: [trayWidth / 2, trayDepth / 2, trayHeight / 2]
	});

	const pocketCuts = [];
	const fingerCuts = [];

	// Effective back row Y start (accounts for any expanded front row depth)
	const effectiveBackRowYStart = wallThickness + effectiveFrontRowDepth + wallThickness;

	// Edge-loaded pockets and cutholes
	// Group lengthwise slots by row for cutout optimization
	const frontRowSlots = lengthwiseSlots
		.filter((s) => (s as EdgeLoadedSlot & { rowAssignment: string }).rowAssignment === 'front')
		.sort(
			(a, b) =>
				(a as EdgeLoadedSlot & { xPosition: number }).xPosition -
				(b as EdgeLoadedSlot & { xPosition: number }).xPosition
		);
	const backRowSlots = lengthwiseSlots
		.filter((s) => (s as EdgeLoadedSlot & { rowAssignment: string }).rowAssignment === 'back')
		.sort(
			(a, b) =>
				(a as EdgeLoadedSlot & { xPosition: number }).xPosition -
				(b as EdgeLoadedSlot & { xPosition: number }).xPosition
		);

	// Process lengthwise slots with optimized cutouts
	// Adjacent slots share a half-cylinder cutout; outer edges get quarter-spheres or wall cutouts
	const processRowSlots = (slots: EdgeLoadedSlot[], yStart: number, rowDepth: number) => {
		for (let i = 0; i < slots.length; i++) {
			const slot = slots[i];
			const slotXStart = (slot as EdgeLoadedSlot & { xPosition: number }).xPosition;
			const cutoutRadius = getSlotCutoutRadius(slot);

			// Center slot within row depth so shared cutouts align
			const centeredYStart = yStart + (rowDepth - slot.slotDepth) / 2;

			pocketCuts.push(createEdgeLoadedPocket(slot, slotXStart, centeredYStart));

			// Left cutout: if first slot against wall, use vertical wall cutout; otherwise quarter-sphere
			if (i === 0) {
				// Check if slot is against the left wall (starts at wallThickness or very close)
				const isAgainstLeftWall = slotXStart <= wallThickness + cutoutRadius + 0.1;
				if (isAgainstLeftWall) {
					// Vertical half-cylinder at left tray edge (like top-loaded stacks)
					fingerCuts.push(
						translate([0, yStart + rowDepth / 2, 0], createFingerCutout(cutoutRadius))
					);
				} else {
					// Quarter-sphere at left edge of slot (centered with slot)
					fingerCuts.push(
						translate(
							[slotXStart, centeredYStart + slot.slotDepth / 2, 0],
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
					translate([betweenX, yStart, 0], createHorizontalFingerCutout(cutoutRadius, rowDepth))
				);
			} else {
				// Quarter-sphere at right edge of last slot (centered with slot)
				fingerCuts.push(
					translate(
						[slotXStart + slot.slotWidth, centeredYStart + slot.slotDepth / 2, 0],
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
			// Back position: align to back of tray (end at trayDepth - wallThickness)
			slotYStart = trayDepth - wallThickness - slot.slotDepth;
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
				translate([slotXStart + slot.slotWidth / 2, trayDepth, 0], createFingerCutout(cutoutRadius))
			);
		} else {
			// Front slot: cutout at front edge
			fingerCuts.push(
				translate([slotXStart + slot.slotWidth / 2, 0, 0], createFingerCutout(cutoutRadius))
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
			translate([placement.xPosition + xOffset, yStart + yOffset, pocketFloorZ], pocketShape)
		);

		// Finger cutout at the tray edge
		const cutoutRadius = getTopLoadedCutoutRadius(placement.shapeRef);
		const xCenter = placement.xPosition + placement.pocketWidth / 2;
		if (isFrontRow) {
			// Front row: cutout at tray front
			fingerCuts.push(translate([xCenter, 0, 0], createFingerCutout(cutoutRadius)));
		} else {
			// Back row: cutout at tray back
			fingerCuts.push(translate([xCenter, trayDepth, 0], createFingerCutout(cutoutRadius)));
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

		const textSegments = vectorText(
			{ height: textHeightParam, align: 'center' },
			trayName.trim().toUpperCase()
		);

		if (textSegments.length > 0) {
			const textShapes: ReturnType<typeof extrudeLinear>[] = [];
			for (const segment of textSegments) {
				if (segment.length >= 2) {
					const pathObj = path2.fromPoints({ closed: false }, segment);
					const expanded = expand(
						{ delta: strokeWidth / 2, corners: 'round', segments: 32 },
						pathObj
					);
					const extruded = extrudeLinear({ height: textDepth + 0.1 }, expanded);
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
				const textWidthCalc = maxX - minX + strokeWidth;
				const textHeightY = maxY - minY + strokeWidth;

				// Fit text along tray width (X axis)
				const availableWidth = trayWidth - margin * 2;
				const availableDepth = trayDepth - margin * 2;
				const scaleX = Math.min(1, availableWidth / textWidthCalc);
				const scaleY = Math.min(1, availableDepth / textHeightY);
				const textScale = Math.min(scaleX, scaleY);

				const centerX = trayWidth / 2;
				const centerY = trayDepth / 2;
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
