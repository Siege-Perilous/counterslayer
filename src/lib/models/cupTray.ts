import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';
import type { CupLayout, CupLayoutNode, CupId } from '$lib/types/cupLayout';
import { isCupLeaf, isCupSplit, generateCupId } from '$lib/types/cupLayout';

const { cuboid, roundedCuboid } = jscad.primitives;
const { subtract, union } = jscad.booleans;
const { translate, mirrorY, scale } = jscad.transforms;
const { vectorText } = jscad.text;
const { path2 } = jscad.geometries;
const { expand } = jscad.expansions;
const { extrudeLinear } = jscad.extrusions;

// Cup tray parameters
export interface CupTrayParams {
	layout: CupLayout; // Split-based layout tree (replaces rows/columns)
	trayWidth: number; // Total tray X dimension in mm
	trayDepth: number; // Total tray Y dimension in mm
	cupCavityHeight: number | null; // Cup cavity Z dimension in mm, null = auto (calculated from box height)
	wallThickness: number; // Wall thickness in mm (default: 2.0)
	floorThickness: number; // Floor thickness in mm (default: 2.0)
	cornerRadius: number; // Corner radius in mm (default: 6)
}

// Minimum cup size warning threshold (reduced from 30mm since custom layouts may intentionally have smaller cups)
export const MIN_CUP_SIZE = 20;

// Default cup cavity height when auto-calculated and no box context
export const DEFAULT_CUP_CAVITY_HEIGHT = 25;

// Default 3-cup layout: vertical split, then one side split horizontally
function createDefault3CupLayout(): CupLayout {
	return {
		root: {
			type: 'split',
			direction: 'vertical',
			ratio: 0.5,
			first: { type: 'cup', id: generateCupId() },
			second: {
				type: 'split',
				direction: 'horizontal',
				ratio: 0.5,
				first: { type: 'cup', id: generateCupId() },
				second: { type: 'cup', id: generateCupId() }
			}
		}
	};
}

// Default parameters
export const defaultCupTrayParams: CupTrayParams = {
	layout: createDefault3CupLayout(),
	trayWidth: 89,
	trayDepth: 89,
	cupCavityHeight: null, // Auto by default
	wallThickness: 2.0,
	floorThickness: 2.0,
	cornerRadius: 6
};

// Cup position data for visualization
export interface CupPosition {
	id: CupId; // Unique cup identifier
	x: number; // Center X position
	y: number; // Center Y position
	z: number; // Bottom Z position
	width: number; // Cup width
	depth: number; // Cup depth
	height: number; // Cup height
	cornerRadius: number; // Corner radius in mm
}

// Computed cup data (intermediate calculation before final positioning)
export interface ComputedCup {
	id: CupId;
	x: number; // Left edge in mm (relative to tray interior)
	y: number; // Front edge in mm
	width: number; // Cup width in mm
	depth: number; // Cup depth in mm
}

// Compute cup positions from layout tree
export function computeCupPositions(
	layout: CupLayout,
	trayWidth: number,
	trayDepth: number,
	wallThickness: number
): ComputedCup[] {
	const cups: ComputedCup[] = [];

	// Interior bounds (inside outer walls)
	const interiorX = wallThickness;
	const interiorY = wallThickness;
	const interiorWidth = trayWidth - 2 * wallThickness;
	const interiorDepth = trayDepth - 2 * wallThickness;

	function traverseNode(
		node: CupLayoutNode,
		x: number,
		y: number,
		width: number,
		depth: number
	): void {
		if (isCupLeaf(node)) {
			// This is a cup - add it to the list
			cups.push({
				id: node.id,
				x,
				y,
				width,
				depth
			});
		} else if (isCupSplit(node)) {
			// Split this space into two children
			if (node.direction === 'vertical') {
				// Left/right split
				const leftWidth = width * node.ratio - wallThickness / 2;
				const rightWidth = width * (1 - node.ratio) - wallThickness / 2;
				const rightX = x + leftWidth + wallThickness;

				traverseNode(node.first, x, y, leftWidth, depth);
				traverseNode(node.second, rightX, y, rightWidth, depth);
			} else {
				// Top/bottom split (horizontal = top/bottom, "first" is top which is higher Y)
				const topDepth = depth * node.ratio - wallThickness / 2;
				const bottomDepth = depth * (1 - node.ratio) - wallThickness / 2;
				const bottomY = y + topDepth + wallThickness;

				traverseNode(node.first, x, y, width, topDepth);
				traverseNode(node.second, x, bottomY, width, bottomDepth);
			}
		}
	}

	traverseNode(layout.root, interiorX, interiorY, interiorWidth, interiorDepth);

	return cups;
}

// Get minimum cup dimensions from layout (for validation)
export function getMinCupDimensions(params: CupTrayParams): {
	minWidth: number;
	minDepth: number;
} {
	const cups = computeCupPositions(
		params.layout,
		params.trayWidth,
		params.trayDepth,
		params.wallThickness
	);

	if (cups.length === 0) {
		return { minWidth: 0, minDepth: 0 };
	}

	let minWidth = Infinity;
	let minDepth = Infinity;

	for (const cup of cups) {
		minWidth = Math.min(minWidth, cup.width);
		minDepth = Math.min(minDepth, cup.depth);
	}

	return { minWidth, minDepth };
}

// Calculate tray dimensions from parameters
// resolvedCupCavityHeight is used when cupCavityHeight is null (auto mode)
export function getCupTrayDimensions(
	params: CupTrayParams,
	resolvedCupCavityHeight?: number
): {
	width: number;
	depth: number;
	height: number;
} {
	const { trayWidth, trayDepth, cupCavityHeight, floorThickness } = params;

	// Width and depth come directly from params
	const width = trayWidth;
	const depth = trayDepth;

	// Height calculation:
	// - If cupCavityHeight is a number, use it
	// - If null (auto), use resolvedCupCavityHeight or default to DEFAULT_CUP_CAVITY_HEIGHT
	const effectiveCupHeight =
		cupCavityHeight ?? resolvedCupCavityHeight ?? DEFAULT_CUP_CAVITY_HEIGHT;
	const height = floorThickness + effectiveCupHeight;

	return { width, depth, height };
}

// Get cup positions for visualization
export function getCupPositions(
	params: CupTrayParams,
	targetHeight?: number,
	floorSpacerHeight?: number
): CupPosition[] {
	const { wallThickness, cornerRadius, floorThickness, cupCavityHeight } = params;
	const spacerOffset = floorSpacerHeight ?? 0;

	// Resolve cup cavity height:
	// - If explicit value, use it
	// - If auto (null) and targetHeight provided, use targetHeight - floorThickness
	// - Otherwise default to DEFAULT_CUP_CAVITY_HEIGHT
	const effectiveCupHeight =
		cupCavityHeight ?? (targetHeight ? targetHeight - floorThickness : DEFAULT_CUP_CAVITY_HEIGHT);

	const dims = getCupTrayDimensions(params, effectiveCupHeight);
	const baseTrayHeight = dims.height;
	const trayHeight = targetHeight && targetHeight > baseTrayHeight ? targetHeight : baseTrayHeight;

	// Get computed cup positions from layout tree
	const computedCups = computeCupPositions(
		params.layout,
		params.trayWidth,
		params.trayDepth,
		wallThickness
	);

	// Convert to CupPosition format (with center coordinates)
	return computedCups.map((cup) => ({
		id: cup.id,
		x: cup.x + cup.width / 2, // Convert to center
		y: cup.y + cup.depth / 2, // Convert to center
		z: trayHeight - effectiveCupHeight + spacerOffset,
		width: cup.width,
		depth: cup.depth,
		height: effectiveCupHeight,
		cornerRadius
	}));
}

// Create cup tray geometry
export function createCupTray(
	params: CupTrayParams,
	trayName?: string,
	targetHeight?: number,
	floorSpacerHeight?: number,
	showEmboss: boolean = true
): Geom3 {
	const { wallThickness, cornerRadius, floorThickness, cupCavityHeight } = params;

	const nameLabel = trayName ? `Tray "${trayName}"` : 'Tray';

	// Get computed cup positions from layout tree
	const computedCups = computeCupPositions(
		params.layout,
		params.trayWidth,
		params.trayDepth,
		wallThickness
	);

	// Validate that we have at least one cup
	if (computedCups.length === 0) {
		throw new Error(`${nameLabel}: Layout must contain at least one cup.`);
	}

	// Check for cups with invalid dimensions
	for (const cup of computedCups) {
		if (cup.width <= 0 || cup.depth <= 0) {
			throw new Error(
				`${nameLabel}: Cup dimensions must be greater than zero. Check tray width/depth vs wall thickness.`
			);
		}
	}

	// Resolve cup cavity height:
	// - If explicit value, use it
	// - If auto (null) and targetHeight provided, use targetHeight - floorThickness
	// - Otherwise default to DEFAULT_CUP_CAVITY_HEIGHT
	const cupHeight =
		cupCavityHeight ?? (targetHeight ? targetHeight - floorThickness : DEFAULT_CUP_CAVITY_HEIGHT);

	if (cupHeight <= 0) {
		throw new Error(`${nameLabel}: Cup cavity height must be greater than zero.`);
	}

	const dims = getCupTrayDimensions(params, cupHeight);
	const baseTrayHeight = dims.height;
	const spacerHeight = floorSpacerHeight ?? 0;
	const trayHeight =
		(targetHeight && targetHeight > baseTrayHeight ? targetHeight : baseTrayHeight) + spacerHeight;

	const trayWidth = dims.width;
	const trayDepth = dims.depth;

	// Create tray body
	const trayBody = cuboid({
		size: [trayWidth, trayDepth, trayHeight],
		center: [trayWidth / 2, trayDepth / 2, trayHeight / 2]
	});

	// Create cup cavities from computed positions
	const cupCuts: Geom3[] = [];
	const cupFloorZ = trayHeight - cupHeight;

	for (const cup of computedCups) {
		// Calculate center position for this cup
		const cupCenterX = cup.x + cup.width / 2;
		const cupCenterY = cup.y + cup.depth / 2;

		// Determine corner radius for this cup - constrain to half the smallest dimension
		const maxRadius = Math.min(cup.width, cup.depth) / 2;
		const effectiveCornerRadius = Math.min(cornerRadius, maxRadius);

		// Cup cavity height - extend above tray top by cornerRadius*2 so the
		// rounded top edge is completely outside the tray (only bottom rounds inside)
		const cavityHeight = cupHeight + effectiveCornerRadius * 2 + 1;

		// Simple rounded cuboid for the cup cavity
		// Bottom at cupFloorZ, top extends well above tray surface
		const cupCavity = translate(
			[cupCenterX, cupCenterY, cupFloorZ + cavityHeight / 2],
			roundedCuboid({
				size: [cup.width, cup.depth, cavityHeight],
				roundRadius: effectiveCornerRadius,
				segments: 32,
				center: [0, 0, 0]
			})
		);

		cupCuts.push(cupCavity);
	}

	let result = subtract(trayBody, ...cupCuts);

	// Emboss tray name on bottom (Z=0 face)
	if (showEmboss && trayName && trayName.trim().length > 0) {
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

// Validate cup tray parameters and return warnings
export function validateCupTrayParams(params: CupTrayParams): string[] {
	const warnings: string[] = [];
	const { minWidth, minDepth } = getMinCupDimensions(params);

	if (minWidth < MIN_CUP_SIZE) {
		warnings.push(
			`Smallest cup width (${minWidth.toFixed(1)}mm) is below minimum (${MIN_CUP_SIZE}mm). Increase tray size or adjust layout.`
		);
	}

	if (minDepth < MIN_CUP_SIZE) {
		warnings.push(
			`Smallest cup depth (${minDepth.toFixed(1)}mm) is below minimum (${MIN_CUP_SIZE}mm). Increase tray size or adjust layout.`
		);
	}

	if (minWidth <= 0) {
		warnings.push(`Tray width is too small for the current layout and wall thickness.`);
	}

	if (minDepth <= 0) {
		warnings.push(`Tray depth is too small for the current layout and wall thickness.`);
	}

	const maxRadius = Math.min(Math.max(minWidth, 0), Math.max(minDepth, 0)) / 2;
	if (params.cornerRadius < 0) {
		warnings.push(`Corner radius cannot be negative`);
	} else if (maxRadius > 0 && params.cornerRadius > maxRadius) {
		warnings.push(
			`Corner radius (${params.cornerRadius}mm) exceeds maximum for smallest cup (${maxRadius.toFixed(1)}mm)`
		);
	}

	return warnings;
}
