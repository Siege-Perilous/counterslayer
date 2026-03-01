import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';

const { cuboid, cylinder } = jscad.primitives;
const { subtract, union } = jscad.booleans;
const { translate, rotateY } = jscad.transforms;
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
	// 4% slope - runs full width of tray
	const slopePercent = 0.04;
	const slopeRise = trayDepth * slopePercent;

	// Back edge - thin strip at floor level (full tray width)
	const wedgeBack = translate(
		[trayWidth / 2, trayDepth - wallThickness, floorThickness + 0.05],
		cuboid({ size: [trayWidth, 0.1, 0.1] })
	);

	// Front edge - solid block from floor to slope height (full tray width)
	const wedgeFront = translate(
		[trayWidth / 2, 0, floorThickness + slopeRise / 2],
		cuboid({ size: [trayWidth, 0.1, slopeRise] })
	);

	// Create solid wedge using hull (added after cutouts)
	const slopeWedge = hull(wedgeFront, wedgeBack);

	// === FRONT FINGER CUTOUT ===
	// Rounded rectangle cutout - straight sides with rounded back corners
	const cutoutWidth = trayWidth * (2 / 3);
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

	// === SIDE WALL CUTOUTS ===
	// Cutout through side walls only, centered on length, 33% of tray length
	const sideSlotLength = trayDepth * (1 / 3);
	const sideSlotHeight = trayHeight - floorThickness;

	// Left wall cutout
	const leftWallCutout = translate(
		[wallThickness / 2, trayDepth / 2, floorThickness + sideSlotHeight / 2],
		cuboid({ size: [wallThickness + 0.2, sideSlotLength, sideSlotHeight] })
	);

	// Right wall cutout
	const rightWallCutout = translate(
		[trayWidth - wallThickness / 2, trayDepth / 2, floorThickness + sideSlotHeight / 2],
		cuboid({ size: [wallThickness + 0.2, sideSlotLength, sideSlotHeight] })
	);

	tray = subtract(tray, leftWallCutout, rightWallCutout);

	// Add wedge after side wall cutouts so it's not removed by them
	tray = union(tray, slopeWedge);

	// Subtract finger cutout after wedge so it cuts through wedge too
	tray = subtract(tray, fingerCutout);

	// === MAGNET HOLES ===
	// 4 cylinder cutouts at bottom corners of side walls
	const magnetDiameter = 6.1;
	const magnetRadius = magnetDiameter / 2;
	const magnetDepth = 3.1;
	const magnetInset = 2; // 2mm from corner edges

	// Cylinder oriented along X axis (into side walls)
	const magnetHole = rotateY(
		Math.PI / 2,
		cylinder({ radius: magnetRadius, height: magnetDepth * 2, segments: 32 })
	);

	// Y and Z positions for hole centers (1mm + radius from edges)
	const magnetY_front = magnetInset + magnetRadius;
	const magnetY_back = trayDepth - magnetInset - magnetRadius;
	const magnetZ = magnetInset + magnetRadius;

	// Left wall holes (at X = 0)
	const leftFrontMagnet = translate([0, magnetY_front, magnetZ], magnetHole);
	const leftBackMagnet = translate([0, magnetY_back, magnetZ], magnetHole);

	// Right wall holes (at X = trayWidth)
	const rightFrontMagnet = translate([trayWidth, magnetY_front, magnetZ], magnetHole);
	const rightBackMagnet = translate([trayWidth, magnetY_back, magnetZ], magnetHole);

	tray = subtract(tray, leftFrontMagnet, leftBackMagnet, rightFrontMagnet, rightBackMagnet);

	return tray;
}
