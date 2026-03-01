import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';

const { cuboid, cylinder } = jscad.primitives;
const { subtract, union } = jscad.booleans;
const { translate } = jscad.transforms;
const { hull } = jscad.hulls;

// Card size preset definition
export interface CardSize {
	name: string;
	width: number;
	length: number;
	isCustom?: boolean;
}

// Card size presets (sleeved dimensions)
export const CARD_SIZE_PRESETS: CardSize[] = [
	{ name: 'Standard (Sleeved)', width: 66, length: 91 },
	{ name: 'Mini American (Sleeved)', width: 44, length: 66 },
	{ name: 'Mini European (Sleeved)', width: 47, length: 71 },
	{ name: 'Euro Standard (Sleeved)', width: 62, length: 95 },
	{ name: 'Japanese (Sleeved)', width: 62, length: 89 },
	{ name: 'Tarot (Sleeved)', width: 73, length: 123 },
	{ name: 'Square (Sleeved)', width: 73, length: 73 },
	{ name: 'Custom', width: 66, length: 91, isCustom: true }
];

export interface CardTrayParams {
	cardWidth: number;
	cardLength: number;
	cardThickness: number;
	cardCount: number;
	wallThickness: number;
	floorThickness: number;
	clearance: number;
	floorSlopeAngle: number;
	magnetHoleDiameter: number;
	magnetHoleDepth: number;
	cardSizePreset: string;
}

export const defaultCardTrayParams: CardTrayParams = {
	cardWidth: 66,
	cardLength: 91,
	cardThickness: 0.5,
	cardCount: 50,
	wallThickness: 4.0,
	floorThickness: 4.0,
	clearance: 1.5,
	floorSlopeAngle: 5,
	magnetHoleDiameter: 3.0,
	magnetHoleDepth: 2.5,
	cardSizePreset: 'Standard (Sleeved)'
};

export interface CardStack {
	x: number;
	y: number;
	z: number;
	width: number;
	length: number;
	thickness: number;
	count: number;
	color: string;
}

export function getCardTrayDimensions(params: CardTrayParams): {
	width: number;
	depth: number;
	height: number;
} {
	const {
		cardWidth,
		cardLength,
		cardThickness,
		cardCount,
		wallThickness,
		floorThickness,
		clearance,
		floorSlopeAngle
	} = params;

	const interiorWidth = cardWidth + clearance * 2;
	const interiorLength = cardLength + clearance * 2;
	const stackHeight = cardCount * cardThickness;
	const slopeRad = (floorSlopeAngle * Math.PI) / 180;
	const slopeRise = interiorLength * Math.tan(slopeRad);

	const width = interiorWidth + wallThickness * 2;
	const depth = interiorLength + wallThickness * 2;
	const height = floorThickness + slopeRise + stackHeight + 5;

	return { width, depth, height };
}

export function getCardPositions(
	params: CardTrayParams,
	_targetHeight?: number,
	_spacerHeight?: number
): CardStack[] {
	const { cardWidth, cardLength, cardThickness, cardCount, wallThickness, clearance, floorThickness } = params;

	return [{
		x: wallThickness + clearance + cardWidth / 2,
		y: wallThickness + clearance + cardLength / 2,
		z: floorThickness,
		width: cardWidth,
		length: cardLength,
		thickness: cardThickness,
		count: cardCount,
		color: '#4a90a4'
	}];
}

export function createCardTray(
	params: CardTrayParams,
	_trayName?: string,
	targetHeight?: number,
	floorSpacerHeight?: number
): Geom3 {
	const {
		cardWidth,
		cardLength,
		cardThickness,
		cardCount,
		wallThickness,
		floorThickness,
		clearance
	} = params;

	// Calculate interior dimensions (space for cards)
	const interiorWidth = cardWidth + clearance * 2;
	const interiorLength = cardLength + clearance * 2;
	const stackHeight = cardCount * cardThickness;

	// Calculate exterior dimensions
	const trayWidth = interiorWidth + wallThickness * 2;
	const trayDepth = interiorLength + wallThickness * 2;

	// Calculate height (floor + card stack + some headroom)
	const spacerHeight = floorSpacerHeight ?? 0;
	let trayHeight = floorThickness + stackHeight + 5 + spacerHeight;
	if (targetHeight && targetHeight > trayHeight) {
		trayHeight = targetHeight;
	}

	const wallHeight = trayHeight - floorThickness;

	// === OPEN-TOP BOX WITH OPEN FRONT ===
	// Outer solid box
	const outerBox = translate(
		[trayWidth / 2, trayDepth / 2, trayHeight / 2],
		cuboid({ size: [trayWidth, trayDepth, trayHeight] })
	);

	// Inner cavity - extends to front edge (Y=0) to remove front wall
	// Cavity sits above the floor
	const innerCavity = translate(
		[trayWidth / 2, (trayDepth - wallThickness) / 2, floorThickness + wallHeight / 2 + 0.1],
		cuboid({ size: [interiorWidth, interiorLength + wallThickness, wallHeight + 0.2] })
	);

	// Subtract cavity from outer box
	let tray = subtract(outerBox, innerCavity);

	// === SLOPED FLOOR WEDGE ===
	// 4% slope
	const slopePercent = 0.04;
	const slopeRise = trayDepth * slopePercent;

	// Back edge - thin strip at floor level
	const wedgeBack = translate(
		[trayWidth / 2, trayDepth - wallThickness, floorThickness + 0.05],
		cuboid({ size: [interiorWidth, 0.1, 0.1] })
	);

	// Front edge - solid block from floor to slope height, extends to front of model (Y=0)
	const wedgeFront = translate(
		[trayWidth / 2, 0, floorThickness + slopeRise / 2],
		cuboid({ size: [interiorWidth, 0.1, slopeRise] })
	);

	// Create solid wedge using hull
	const slopeWedge = hull(wedgeFront, wedgeBack);

	// Add wedge to tray
	tray = union(tray, slopeWedge);

	// === FRONT FINGER CUTOUT ===
	// Rounded rectangle cutout - straight sides with rounded back corners
	const cutoutWidth = trayWidth / 2;
	const cutoutDepth = cutoutWidth / 2;
	const cutoutHeight = trayHeight * 2;
	const cornerRadius = 8;

	// Front edge - thin slice at Y=0
	const cutoutFront = translate(
		[trayWidth / 2, 0, floorThickness + slopeRise],
		cuboid({ size: [cutoutWidth, 0.1, cutoutHeight] })
	);

	// Back corners - two cylinders for rounded corners
	const backLeftCorner = translate(
		[trayWidth / 2 - cutoutWidth / 2 + cornerRadius, cutoutDepth - cornerRadius, floorThickness + slopeRise],
		cylinder({ radius: cornerRadius, height: cutoutHeight, segments: 32 })
	);

	const backRightCorner = translate(
		[trayWidth / 2 + cutoutWidth / 2 - cornerRadius, cutoutDepth - cornerRadius, floorThickness + slopeRise],
		cylinder({ radius: cornerRadius, height: cutoutHeight, segments: 32 })
	);

	const fingerCutout = hull(cutoutFront, backLeftCorner, backRightCorner);
	tray = subtract(tray, fingerCutout);

	return tray;
}
