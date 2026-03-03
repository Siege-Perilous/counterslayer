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
	cupWidth: number; // Cup X dimension in mm (default: 40)
	cupDepth: number; // Cup Y dimension in mm (default: 40)
	cupHeight: number; // Cup Z dimension in mm (default: 25)
	wallThickness: number; // Wall thickness in mm (default: 3.0)
	floorThickness: number; // Floor thickness in mm (default: 2.0)
	cornerRadius: number; // Corner radius in mm (default: 6)
}

// Minimum cup size warning threshold
export const MIN_CUP_SIZE = 30;

// Default parameters
export const defaultCupTrayParams: CupTrayParams = {
	rows: 2,
	columns: 2,
	cupWidth: 40,
	cupDepth: 40,
	cupHeight: 25,
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

// Calculate tray dimensions from parameters
export function getCupTrayDimensions(params: CupTrayParams): {
	width: number;
	depth: number;
	height: number;
} {
	const { rows, columns, cupWidth, cupDepth, cupHeight, wallThickness, floorThickness } = params;

	// Dimension calculation:
	// width = wall + (columns × cupWidth) + ((columns-1) × wall) + wall
	// depth = wall + (rows × cupDepth) + ((rows-1) × wall) + wall
	// height = floor + cupHeight

	const width = wallThickness + columns * cupWidth + (columns - 1) * wallThickness + wallThickness;
	const depth = wallThickness + rows * cupDepth + (rows - 1) * wallThickness + wallThickness;
	const height = floorThickness + cupHeight;

	return { width, depth, height };
}

// Get cup positions for visualization
export function getCupPositions(
	params: CupTrayParams,
	targetHeight?: number,
	floorSpacerHeight?: number
): CupPosition[] {
	const { rows, columns, cupWidth, cupDepth, cupHeight, wallThickness, cornerRadius } = params;
	const spacerOffset = floorSpacerHeight ?? 0;

	const dims = getCupTrayDimensions(params);
	const baseTrayHeight = dims.height;
	const trayHeight = targetHeight && targetHeight > baseTrayHeight ? targetHeight : baseTrayHeight;

	const positions: CupPosition[] = [];

	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < columns; col++) {
			// Calculate center position for this cup
			const x = wallThickness + col * (cupWidth + wallThickness) + cupWidth / 2;
			const y = wallThickness + row * (cupDepth + wallThickness) + cupDepth / 2;
			const z = trayHeight - cupHeight + spacerOffset;

			positions.push({
				row,
				column: col,
				x,
				y,
				z,
				width: cupWidth,
				depth: cupDepth,
				height: cupHeight,
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
	const { rows, columns, cupWidth, cupDepth, cupHeight, wallThickness, cornerRadius } = params;

	const nameLabel = trayName ? `Tray "${trayName}"` : 'Tray';

	// Validate parameters
	if (rows < 1 || columns < 1) {
		throw new Error(`${nameLabel}: Must have at least 1 row and 1 column.`);
	}

	if (cupWidth <= 0 || cupDepth <= 0 || cupHeight <= 0) {
		throw new Error(`${nameLabel}: Cup dimensions must be greater than zero.`);
	}

	const dims = getCupTrayDimensions(params);
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

	if (params.cupWidth < MIN_CUP_SIZE) {
		warnings.push(
			`Cup width (${params.cupWidth}mm) is below minimum recommended size (${MIN_CUP_SIZE}mm)`
		);
	}

	if (params.cupDepth < MIN_CUP_SIZE) {
		warnings.push(
			`Cup depth (${params.cupDepth}mm) is below minimum recommended size (${MIN_CUP_SIZE}mm)`
		);
	}

	const maxRadius = Math.min(params.cupWidth, params.cupDepth) / 2;
	if (params.cornerRadius < 0) {
		warnings.push(`Corner radius cannot be negative`);
	} else if (params.cornerRadius > maxRadius) {
		warnings.push(`Corner radius (${params.cornerRadius}mm) exceeds maximum (${maxRadius}mm)`);
	}

	return warnings;
}
