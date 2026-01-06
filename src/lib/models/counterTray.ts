import jscad from '@jscad/modeling';

const { cuboid, cylinder } = jscad.primitives;
const { subtract, union } = jscad.booleans;
const { translate, rotateY, rotateZ } = jscad.transforms;

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
	stacks: [string, number][];
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
	stacks: [
		['square', 12],
		['square', 8],
		['hex', 15],
		['square', 6],
		['hex', 10],
		['circle', 20]
	],
	printBedSize: 256
};

// Helper: sum array elements up to index (inclusive)
const sumTo = (arr: number[], idx: number): number =>
	arr.slice(0, idx + 1).reduce((a, b) => a + b, 0);

export function createCounterTray(params: CounterTrayParams, trayName?: string) {
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
		stacks
	} = params;

	const nameLabel = trayName ? `Tray "${trayName}"` : 'Tray';

	// Validate stacks
	if (!stacks || stacks.length === 0) {
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

	// Sort stacks by pocket size
	const sortedStacks = [...stacks].sort((a, b) => {
		const keyA = getMaxPocketDim(a[0]) * 10000 + a[1];
		const keyB = getMaxPocketDim(b[0]) * 10000 + b[1];
		return keyA - keyB;
	});

	// Number of columns (2 stacks per column)
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

	// Column widths
	const columnWidths: number[] = [];
	for (let col = 0; col < numColumns; col++) {
		const idx1 = col * 2;
		const idx2 = col * 2 + 1;
		columnWidths.push(Math.max(getPw(idx1), getPw(idx2)));
	}

	// Column X offset
	const columnXOffset = (col: number): number => {
		if (col === 0) return wallThickness;
		return wallThickness + sumTo(columnWidths, col - 1) + col * wallThickness;
	};

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

	// Max stack height
	let maxStackHeight = 0;
	for (let col = 0; col < numColumns; col++) {
		maxStackHeight = Math.max(maxStackHeight, columnHeight(col));
	}

	// Tray dimensions
	const trayLengthAuto =
		sumTo(columnWidths, numColumns - 1) + (numColumns + 1) * wallThickness;
	const trayLength = trayLengthOverride > 0 ? trayLengthOverride : trayLengthAuto;
	const trayWidth =
		wallThickness + frontRowDepth + wallThickness + backRowDepth + wallThickness;
	const trayHeight = floorThickness + maxStackHeight + rimHeight;

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
					segments: 32,
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

	// Finger cutout
	const createFingerCutout = (radius: number) => {
		return cylinder({
			height: trayHeight + 2,
			radius,
			segments: 32,
			center: [0, 0, trayHeight / 2]
		});
	};

	// Scoopable cell
	const createScoopableCell = (width: number, length: number, depth: number) => {
		const scoopRadius = length / 2;

		const mainPocket = translate(
			[width / 2, length / 2, scoopRadius + (depth - scoopRadius + 1) / 2],
			cuboid({ size: [width, length, depth - scoopRadius + 1] })
		);

		const scoopCylinder = translate(
			[width / 2, length / 2, scoopRadius],
			rotateY(
				Math.PI / 2,
				cylinder({ height: width, radius: scoopRadius, segments: 32, center: [0, 0, 0] })
			)
		);

		return union(mainPocket, scoopCylinder);
	};

	// Extra tray area cells
	const createExtraTrayArea = () => {
		if (extraTrayLength <= 0) return [];

		const totalColWalls = (extraTrayCols - 1) * wallThickness;
		const totalRowWalls = (extraTrayRows - 1) * wallThickness;
		const cellWidth = (extraTrayInnerLength - totalColWalls) / extraTrayCols;
		const cellLength = (extraTrayInnerWidth - totalRowWalls) / extraTrayRows;

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

	for (let col = 0; col < numColumns; col++) {
		const idx1 = col * 2;
		const idx2 = col * 2 + 1;
		const xOffset = columnXOffset(col);
		const colW = columnWidths[col];

		// Front row pocket
		if (idx1 < sortedStacks.length) {
			pocketCuts.push(
				translate(
					[xOffset, wallThickness, 0],
					createPocket(getCount(idx1), getShape(idx1), true, colW, frontRowDepth)
				)
			);
			// Finger cutout
			fingerCuts.push(
				translate([xOffset + colW / 2, 0, 0], createFingerCutout(getCutoutRadius(getShape(idx1))))
			);
		}

		// Back row pocket
		if (idx2 < sortedStacks.length) {
			pocketCuts.push(
				translate(
					[xOffset, wallThickness + frontRowDepth + wallThickness, 0],
					createPocket(getCount(idx2), getShape(idx2), false, colW, backRowDepth)
				)
			);
			// Finger cutout
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
