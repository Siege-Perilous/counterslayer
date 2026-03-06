import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';

const { cuboid, roundedCuboid } = jscad.primitives;
const { subtract, union } = jscad.booleans;
const { translate, mirrorY, scale } = jscad.transforms;
const { vectorText } = jscad.text;
const { path2 } = jscad.geometries;
const { expand } = jscad.expansions;
const { extrudeLinear } = jscad.extrusions;

// Cup tray parameters
export interface CupTrayParams {
	rows: number; // Number of rows (default: 2)
	columns: number; // Number of columns (default: 2)
	trayWidth: number; // Total tray X dimension in mm
	trayDepth: number; // Total tray Y dimension in mm
	cupCavityHeight: number | null; // Cup cavity Z dimension in mm, null = auto (calculated from box height)
	wallThickness: number; // Wall thickness in mm (default: 3.0)
	floorThickness: number; // Floor thickness in mm (default: 2.0)
	cornerRadius: number; // Corner radius in mm (default: 6)
}

// Minimum cup size warning threshold
export const MIN_CUP_SIZE = 30;

// Default cup cavity height when auto-calculated and no box context
export const DEFAULT_CUP_CAVITY_HEIGHT = 25;

// Default parameters
export const defaultCupTrayParams: CupTrayParams = {
	rows: 2,
	columns: 2,
	trayWidth: 89, // Equivalent to old 2x40mm cups + 3x3mm walls
	trayDepth: 89,
	cupCavityHeight: null, // Auto by default
	wallThickness: 3.0,
	floorThickness: 2.0,
	cornerRadius: 6
};

// Cup position data for visualization
export interface CupPosition {
	row: number;
	column: number;
	x: number; // Center X position
	y: number; // Center Y position
	z: number; // Bottom Z position
	width: number; // Cup width
	depth: number; // Cup depth
	height: number; // Cup height
	cornerRadius: number; // Corner radius in mm
}

// Calculate individual cup dimensions from tray dimensions
export function getCupDimensions(params: CupTrayParams): {
	cupWidth: number;
	cupDepth: number;
} {
	const { trayWidth, trayDepth, rows, columns, wallThickness } = params;

	// cupWidth = (trayWidth - (columns + 1) * wallThickness) / columns
	const cupWidth = (trayWidth - (columns + 1) * wallThickness) / columns;

	// cupDepth = (trayDepth - (rows + 1) * wallThickness) / rows
	const cupDepth = (trayDepth - (rows + 1) * wallThickness) / rows;

	return { cupWidth, cupDepth };
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
	const { rows, columns, wallThickness, cornerRadius, floorThickness, cupCavityHeight } = params;
	const { cupWidth, cupDepth } = getCupDimensions(params);
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

	const positions: CupPosition[] = [];

	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < columns; col++) {
			// Calculate center position for this cup
			const x = wallThickness + col * (cupWidth + wallThickness) + cupWidth / 2;
			const y = wallThickness + row * (cupDepth + wallThickness) + cupDepth / 2;
			const z = trayHeight - effectiveCupHeight + spacerOffset;

			positions.push({
				row,
				column: col,
				x,
				y,
				z,
				width: cupWidth,
				depth: cupDepth,
				height: effectiveCupHeight,
				cornerRadius
			});
		}
	}

	return positions;
}

// Create cup tray geometry
export function createCupTray(
	params: CupTrayParams,
	trayName?: string,
	targetHeight?: number,
	floorSpacerHeight?: number
): Geom3 {
	const { rows, columns, wallThickness, cornerRadius, floorThickness, cupCavityHeight } = params;
	const { cupWidth, cupDepth } = getCupDimensions(params);

	const nameLabel = trayName ? `Tray "${trayName}"` : 'Tray';

	// Validate parameters
	if (rows < 1 || columns < 1) {
		throw new Error(`${nameLabel}: Must have at least 1 row and 1 column.`);
	}

	if (cupWidth <= 0 || cupDepth <= 0) {
		throw new Error(
			`${nameLabel}: Calculated cup dimensions must be greater than zero. Check tray width/depth vs wall thickness.`
		);
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

	// Create cup cavities
	const cupCuts: Geom3[] = [];

	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < columns; col++) {
			// Calculate center position for this cup
			const cupCenterX = wallThickness + col * (cupWidth + wallThickness) + cupWidth / 2;
			const cupCenterY = wallThickness + row * (cupDepth + wallThickness) + cupDepth / 2;
			const cupFloorZ = trayHeight - cupHeight;

			// Cup cavity height - extend above tray top by cornerRadius*2 so the
			// rounded top edge is completely outside the tray (only bottom rounds inside)
			const cavityHeight = cupHeight + cornerRadius * 2 + 1;

			// Simple rounded cuboid for the cup cavity
			// Bottom at cupFloorZ, top extends well above tray surface
			const cupCavity = translate(
				[cupCenterX, cupCenterY, cupFloorZ + cavityHeight / 2],
				roundedCuboid({
					size: [cupWidth, cupDepth, cavityHeight],
					roundRadius: cornerRadius,
					segments: 32,
					center: [0, 0, 0]
				})
			);

			cupCuts.push(cupCavity);
		}
	}

	let result = subtract(trayBody, ...cupCuts);

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

// Validate cup tray parameters and return warnings
export function validateCupTrayParams(params: CupTrayParams): string[] {
	const warnings: string[] = [];
	const { cupWidth, cupDepth } = getCupDimensions(params);

	if (cupWidth < MIN_CUP_SIZE) {
		warnings.push(
			`Calculated cup width (${cupWidth.toFixed(1)}mm) is below minimum (${MIN_CUP_SIZE}mm). Increase tray width or reduce columns.`
		);
	}

	if (cupDepth < MIN_CUP_SIZE) {
		warnings.push(
			`Calculated cup depth (${cupDepth.toFixed(1)}mm) is below minimum (${MIN_CUP_SIZE}mm). Increase tray depth or reduce rows.`
		);
	}

	if (cupWidth <= 0) {
		warnings.push(`Tray width is too small for the number of columns and wall thickness.`);
	}

	if (cupDepth <= 0) {
		warnings.push(`Tray depth is too small for the number of rows and wall thickness.`);
	}

	const maxRadius = Math.min(Math.max(cupWidth, 0), Math.max(cupDepth, 0)) / 2;
	if (params.cornerRadius < 0) {
		warnings.push(`Corner radius cannot be negative`);
	} else if (maxRadius > 0 && params.cornerRadius > maxRadius) {
		warnings.push(
			`Corner radius (${params.cornerRadius}mm) exceeds maximum (${maxRadius.toFixed(1)}mm)`
		);
	}

	return warnings;
}
