import type { Project, Box, LidParams, Tray, CounterShape, CardSize } from '$lib/types/project';
import { defaultLidParams } from '$lib/models/lid';
import {
	defaultParams,
	DEFAULT_SHAPE_IDS,
	DEFAULT_CARD_SIZE_IDS,
	type CounterTrayParams,
	type TopLoadedStackDef,
	type EdgeLoadedStackDef
} from '$lib/models/counterTray';
import {
	TRAY_COLORS,
	DEFAULT_COUNTER_SHAPES,
	DEFAULT_CARD_SIZES
} from '$lib/stores/project.svelte';
const STORAGE_KEY = 'counter-tray-project';

function generateId(): string {
	return Math.random().toString(36).substring(2, 9);
}

export function saveProject(project: Project): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
	} catch (e) {
		console.error('Failed to save project:', e);
	}
}

// Merge stored lidParams with defaults to handle missing fields from older saves
function migrateLidParams(stored: Partial<LidParams> | undefined): LidParams {
	return {
		...defaultLidParams,
		...stored
	};
}

// Old format params that may be present in legacy data
interface LegacyTrayParams {
	squareWidth?: number;
	squareLength?: number;
	hexFlatToFlat?: number;
	circleDiameter?: number;
	triangleSide?: number;
	triangleCornerRadius?: number;
	hexPointyTop?: boolean;
	stacks?: [string, number][];
	customShapes?: LegacyCustomShape[];
	customCardSizes?: LegacyCardSize[];
}

interface LegacyCustomShape {
	name: string;
	baseShape: 'rectangle' | 'square' | 'circle' | 'hex' | 'triangle';
	width: number;
	length: number;
	cornerRadius?: number;
	pointyTop?: boolean;
}

interface LegacyCardSize {
	name: string;
	width: number;
	length: number;
	thickness: number;
}

// Legacy card tray params
interface LegacyCardTrayParams {
	cardSizeName?: string;
	cardSizeId?: string;
}

// Legacy cup tray params (old format with individual cup dimensions)
interface LegacyCupTrayParams {
	cupWidth?: number;
	cupDepth?: number;
	cupHeight?: number;
	rows?: number;
	columns?: number;
	wallThickness?: number;
	floorThickness?: number;
	cornerRadius?: number;
}

// Legacy card divider stack
interface LegacyCardDividerStack {
	cardSizeName?: string;
	cardSizeId?: string;
	count: number;
	label?: string;
}

// Build a mapping from old shape names (custom:Name) to new IDs
function buildShapeIdMapping(counterShapes: CounterShape[]): Map<string, string> {
	const mapping = new Map<string, string>();
	for (const shape of counterShapes) {
		mapping.set(`custom:${shape.name}`, shape.id);
		mapping.set(shape.name, shape.id);
	}
	// Add mappings for old basic shape names
	mapping.set('square', DEFAULT_SHAPE_IDS.square);
	mapping.set('hex', DEFAULT_SHAPE_IDS.hex);
	mapping.set('circle', DEFAULT_SHAPE_IDS.circle);
	mapping.set('triangle', DEFAULT_SHAPE_IDS.triangle);
	return mapping;
}

// Build a mapping from old card size names to new IDs
function buildCardSizeIdMapping(cardSizes: CardSize[]): Map<string, string> {
	const mapping = new Map<string, string>();
	for (const cardSize of cardSizes) {
		mapping.set(cardSize.name, cardSize.id);
	}
	return mapping;
}

// Extract counter shapes from old format (stored in counter tray params)
function extractCounterShapesFromLegacy(boxes: Box[]): CounterShape[] {
	for (const box of boxes) {
		for (const tray of box.trays) {
			const legacyParams = (tray as { params?: LegacyTrayParams }).params;
			if (legacyParams?.customShapes && legacyParams.customShapes.length > 0) {
				return legacyParams.customShapes.map((shape) => ({
					id: generateId(),
					name: shape.name,
					baseShape: shape.baseShape,
					width: shape.width,
					length: shape.length,
					cornerRadius: shape.cornerRadius,
					pointyTop: shape.pointyTop
				}));
			}
		}
	}
	// Return defaults if no legacy shapes found
	return DEFAULT_COUNTER_SHAPES.map((s) => ({ ...s }));
}

// Extract card sizes from old format (stored in counter tray params)
function extractCardSizesFromLegacy(boxes: Box[]): CardSize[] {
	for (const box of boxes) {
		for (const tray of box.trays) {
			const legacyParams = (tray as { params?: LegacyTrayParams }).params;
			if (legacyParams?.customCardSizes && legacyParams.customCardSizes.length > 0) {
				return legacyParams.customCardSizes.map((cardSize) => ({
					id: generateId(),
					name: cardSize.name,
					width: cardSize.width,
					length: cardSize.length,
					thickness: cardSize.thickness
				}));
			}
		}
	}
	// Return defaults if no legacy card sizes found
	return DEFAULT_CARD_SIZES.map((s) => ({ ...s }));
}

// Migrate counter tray params to new format (remove customShapes/customCardSizes, update stack refs)
function migrateCounterTrayParams(
	params: CounterTrayParams & LegacyTrayParams,
	shapeIdMapping: Map<string, string>
): CounterTrayParams {
	const migrated = { ...defaultParams, ...params };

	// Handle migration from old 'stacks' field to 'topLoadedStacks'
	if (params.stacks && !params.topLoadedStacks) {
		migrated.topLoadedStacks = params.stacks as TopLoadedStackDef[];
	}

	// Ensure edgeLoadedStacks exists
	if (!migrated.edgeLoadedStacks) {
		migrated.edgeLoadedStacks = [];
	}

	// Update stack references from names to IDs
	migrated.topLoadedStacks = migrated.topLoadedStacks.map(([shapeRef, count, label]) => {
		const newId = shapeIdMapping.get(shapeRef) ?? shapeRef;
		return [newId, count, label] as TopLoadedStackDef;
	});

	migrated.edgeLoadedStacks = migrated.edgeLoadedStacks.map(([shapeRef, count, orient, label]) => {
		const newId = shapeIdMapping.get(shapeRef) ?? shapeRef;
		return [newId, count, orient, label] as EdgeLoadedStackDef;
	});

	// Remove old fields that are now at project level
	delete (migrated as LegacyTrayParams).customShapes;
	delete (migrated as LegacyTrayParams).customCardSizes;

	// Remove very old params
	delete (migrated as LegacyTrayParams).squareWidth;
	delete (migrated as LegacyTrayParams).squareLength;
	delete (migrated as LegacyTrayParams).hexFlatToFlat;
	delete (migrated as LegacyTrayParams).circleDiameter;
	delete (migrated as LegacyTrayParams).triangleSide;
	delete (migrated as LegacyTrayParams).triangleCornerRadius;
	delete (migrated as LegacyTrayParams).hexPointyTop;
	delete (migrated as LegacyTrayParams).stacks;

	// Remove deprecated extra tray params (now handled by cup trays)
	delete (migrated as { extraTrayCols?: number }).extraTrayCols;
	delete (migrated as { extraTrayRows?: number }).extraTrayRows;

	return migrated;
}

// Migrate card draw tray params to use cardSizeId
function migrateCardDrawTrayParams(
	params: LegacyCardTrayParams,
	cardSizeIdMapping: Map<string, string>
): { cardSizeId: string } {
	// If already has cardSizeId, keep it
	if (params.cardSizeId) {
		return { cardSizeId: params.cardSizeId };
	}
	// Migrate from cardSizeName
	if (params.cardSizeName) {
		const id = cardSizeIdMapping.get(params.cardSizeName);
		if (id) {
			return { cardSizeId: id };
		}
	}
	// Fallback to Standard
	return { cardSizeId: DEFAULT_CARD_SIZE_IDS.standard };
}

// Migrate cup tray params from old format (cupWidth/cupDepth/cupHeight) to new format (trayWidth/trayDepth/cupCavityHeight)
function migrateCupTrayParams(params: LegacyCupTrayParams): {
	trayWidth: number;
	trayDepth: number;
	cupCavityHeight: number | null;
	rows: number;
	columns: number;
	wallThickness: number;
	floorThickness: number;
	cornerRadius: number;
} {
	const rows = params.rows ?? 2;
	const columns = params.columns ?? 2;
	const wallThickness = params.wallThickness ?? 3.0;
	const floorThickness = params.floorThickness ?? 2.0;
	const cornerRadius = params.cornerRadius ?? 6;

	// Check if already in new format (has trayWidth)
	if ('trayWidth' in params) {
		return params as ReturnType<typeof migrateCupTrayParams>;
	}

	// Convert old cup dimensions to tray dimensions
	const cupWidth = params.cupWidth ?? 40;
	const cupDepth = params.cupDepth ?? 40;
	const cupHeight = params.cupHeight ?? 25;

	// Calculate tray dimensions from cup dimensions
	// trayWidth = wall + (columns * cupWidth) + ((columns - 1) * wall) + wall
	const trayWidth =
		wallThickness + columns * cupWidth + (columns - 1) * wallThickness + wallThickness;
	const trayDepth = wallThickness + rows * cupDepth + (rows - 1) * wallThickness + wallThickness;

	return {
		trayWidth,
		trayDepth,
		cupCavityHeight: cupHeight, // Preserve explicit height from old format
		rows,
		columns,
		wallThickness,
		floorThickness,
		cornerRadius
	};
}

// Migrate card divider stacks to use cardSizeId
function migrateCardDividerStacks(
	stacks: LegacyCardDividerStack[],
	cardSizeIdMapping: Map<string, string>
): Array<{ cardSizeId: string; count: number; label?: string }> {
	return stacks.map((stack) => {
		// If already has cardSizeId, keep it
		if (stack.cardSizeId) {
			return { cardSizeId: stack.cardSizeId, count: stack.count, label: stack.label };
		}
		// Migrate from cardSizeName
		if (stack.cardSizeName) {
			const id = cardSizeIdMapping.get(stack.cardSizeName);
			if (id) {
				return { cardSizeId: id, count: stack.count, label: stack.label };
			}
		}
		// Fallback to Standard
		return { cardSizeId: DEFAULT_CARD_SIZE_IDS.standard, count: stack.count, label: stack.label };
	});
}

// Migrate a tray to ensure all fields have valid values
function migrateTray(
	tray: Tray,
	cumulativeIndex: number,
	shapeIdMapping: Map<string, string>,
	cardSizeIdMapping: Map<string, string>
): Tray {
	const trayType = (tray as { type?: string }).type;
	const color = tray.color || TRAY_COLORS[cumulativeIndex % TRAY_COLORS.length];

	if (trayType === 'card' || trayType === 'cardDraw') {
		// Card draw tray - migrate params
		const legacyParams = (tray as { params: LegacyCardTrayParams }).params;
		const migratedCardParams = migrateCardDrawTrayParams(legacyParams, cardSizeIdMapping);
		return {
			...tray,
			type: 'cardDraw',
			color,
			params: { ...legacyParams, ...migratedCardParams }
		} as Tray;
	}

	if (trayType === 'cardDivider') {
		// Card divider tray - migrate stacks
		const params = (tray as { params: { stacks: LegacyCardDividerStack[] } }).params;
		const migratedStacks = migrateCardDividerStacks(params.stacks, cardSizeIdMapping);
		return {
			...tray,
			type: 'cardDivider',
			color,
			params: { ...params, stacks: migratedStacks }
		} as Tray;
	}

	if (trayType === 'cup') {
		const legacyParams = (tray as { params: LegacyCupTrayParams }).params;
		return {
			...tray,
			type: 'cup',
			color,
			params: migrateCupTrayParams(legacyParams)
		} as Tray;
	}

	// Counter tray (either explicit or migrated from old format)
	return {
		...tray,
		type: 'counter',
		color,
		params: migrateCounterTrayParams(
			(tray as { params: CounterTrayParams & LegacyTrayParams }).params,
			shapeIdMapping
		)
	} as Tray;
}

// Migrate a box to ensure all fields have valid values
function migrateBox(
	box: Box,
	cumulativeStartIndex: number,
	shapeIdMapping: Map<string, string>,
	cardSizeIdMapping: Map<string, string>
): Box {
	return {
		...box,
		trays: box.trays.map((tray, idx) =>
			migrateTray(tray, cumulativeStartIndex + idx, shapeIdMapping, cardSizeIdMapping)
		),
		lidParams: migrateLidParams(box.lidParams)
	};
}

// Migrate a full project to ensure all fields have valid values
export function migrateProjectData(project: Project): Project {
	// Check if project already has new format (counterShapes/cardSizes at project level)
	const hasNewFormat =
		Array.isArray((project as { counterShapes?: unknown }).counterShapes) &&
		Array.isArray((project as { cardSizes?: unknown }).cardSizes);

	let counterShapes: CounterShape[];
	let cardSizes: CardSize[];

	if (hasNewFormat) {
		// Already migrated, just ensure arrays are valid
		counterShapes = (project as { counterShapes: CounterShape[] }).counterShapes;
		cardSizes = (project as { cardSizes: CardSize[] }).cardSizes;

		// Ensure all shapes/sizes have IDs
		counterShapes = counterShapes.map((s) => (s.id ? s : { ...s, id: generateId() }));
		cardSizes = cardSizes.map((s) => (s.id ? s : { ...s, id: generateId() }));
	} else {
		// Legacy format - extract from counter tray params
		counterShapes = extractCounterShapesFromLegacy(project.boxes);
		cardSizes = extractCardSizesFromLegacy(project.boxes);
	}

	// Build ID mappings for migration
	const shapeIdMapping = buildShapeIdMapping(counterShapes);
	const cardSizeIdMapping = buildCardSizeIdMapping(cardSizes);

	// Migrate boxes
	let cumulativeIndex = 0;
	const migratedBoxes = project.boxes.map((box) => {
		const migratedBox = migrateBox(box, cumulativeIndex, shapeIdMapping, cardSizeIdMapping);
		cumulativeIndex += box.trays.length;
		return migratedBox;
	});

	return {
		...project,
		boxes: migratedBoxes,
		counterShapes,
		cardSizes
	};
}

export function loadProject(): Project | null {
	try {
		const data = localStorage.getItem(STORAGE_KEY);
		if (data) {
			const project = JSON.parse(data) as Project;
			// Migrate to new format
			return migrateProjectData(project);
		}
	} catch (e) {
		console.error('Failed to load project:', e);
	}
	return null;
}

export function clearProject(): void {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch (e) {
		console.error('Failed to clear project:', e);
	}
}

/**
 * Export project to JSON string.
 * Use for file downloads or clipboard operations.
 */
export function exportProjectToJson(project: Project): string {
	return JSON.stringify(project, null, 2);
}

/**
 * Import project from JSON string.
 * Handles migration from older formats automatically.
 * @throws {Error} if JSON is invalid
 */
export function importProjectFromJson(json: string): Project {
	const data = JSON.parse(json) as Project;
	return migrateProjectData(data);
}

// Re-export save manager functions for unified API
export {
	scheduleSave,
	saveNow,
	batchUpdates,
	flushPendingSave,
	hasPendingSave
} from '$lib/stores/saveManager';
