import {
	defaultParams,
	DEFAULT_SHAPE_IDS,
	DEFAULT_CARD_SIZE_IDS,
	type CounterTrayParams
} from '$lib/models/counterTray';
import { defaultCardDrawTrayParams, type CardDrawTrayParams } from '$lib/models/cardTray';
import {
	defaultCardDividerTrayParams,
	type CardDividerTrayParams
} from '$lib/models/cardDividerTray';
import { defaultLidParams } from '$lib/models/lid';
import { saveProject, loadProject, migrateProjectData } from '$lib/utils/storage';
import type {
	Tray,
	Box,
	Project,
	LidParams,
	CounterTray,
	CardDrawTray,
	CardDividerTray,
	CardTray,
	CounterShape,
	CardSize
} from '$lib/types/project';
import { isCounterTray, isCardTray, isCardDrawTray, isCardDividerTray } from '$lib/types/project';

export type {
	Tray,
	Box,
	Project,
	LidParams,
	CounterTray,
	CardDrawTray,
	CardDividerTray,
	CardTray,
	CounterShape,
	CardSize
};
export { isCounterTray, isCardTray, isCardDrawTray, isCardDividerTray };

// Default counter shapes (global)
export const DEFAULT_COUNTER_SHAPES: CounterShape[] = [
	{ id: DEFAULT_SHAPE_IDS.square, name: 'Square', baseShape: 'square', width: 15.9, length: 15.9 },
	{
		id: DEFAULT_SHAPE_IDS.hex,
		name: 'Hex',
		baseShape: 'hex',
		width: 15.9,
		length: 15.9,
		pointyTop: false
	},
	{
		id: DEFAULT_SHAPE_IDS.circle,
		name: 'Circle',
		baseShape: 'circle',
		width: 15.9,
		length: 15.9
	},
	{
		id: DEFAULT_SHAPE_IDS.triangle,
		name: 'Triangle',
		baseShape: 'triangle',
		width: 15.9,
		length: 15.9,
		cornerRadius: 1.5
	}
];

// Default card sizes (global)
export const DEFAULT_CARD_SIZES: CardSize[] = [
	{ id: DEFAULT_CARD_SIZE_IDS.standard, name: 'Standard', width: 66, length: 91, thickness: 0.5 },
	{
		id: DEFAULT_CARD_SIZE_IDS.miniAmerican,
		name: 'Mini American',
		width: 44,
		length: 66,
		thickness: 0.5
	},
	{
		id: DEFAULT_CARD_SIZE_IDS.miniEuropean,
		name: 'Mini European',
		width: 47,
		length: 71,
		thickness: 0.5
	},
	{ id: DEFAULT_CARD_SIZE_IDS.euro, name: 'Euro', width: 62, length: 95, thickness: 0.5 },
	{ id: DEFAULT_CARD_SIZE_IDS.japanese, name: 'Japanese', width: 62, length: 89, thickness: 0.5 },
	{ id: DEFAULT_CARD_SIZE_IDS.tarot, name: 'Tarot', width: 73, length: 123, thickness: 0.5 },
	{ id: DEFAULT_CARD_SIZE_IDS.square, name: 'Square', width: 73, length: 73, thickness: 0.5 }
];

function generateId(): string {
	return Math.random().toString(36).substring(2, 9);
}

/**
 * Generate a tray letter based on cumulative index across all boxes.
 * A-Z for first 26, then AA, BB, CC... for 26+
 */
export function getTrayLetter(index: number): string {
	if (index < 26) {
		return String.fromCharCode(65 + index);
	}
	// For 26+, use AA, BB, CC, etc.
	const letter = String.fromCharCode(65 + (index % 26));
	const repeat = Math.floor(index / 26) + 1;
	return letter.repeat(repeat);
}

/**
 * Get cumulative tray index across all boxes up to (but not including) the given box,
 * plus the tray index within that box.
 */
export function getCumulativeTrayIndex(boxes: Box[], boxIndex: number, trayIndex: number): number {
	let cumulative = 0;
	for (let i = 0; i < boxIndex; i++) {
		cumulative += boxes[i].trays.length;
	}
	return cumulative + trayIndex;
}

/**
 * Get tray letter for a specific tray, cumulative across all boxes.
 */
export function getCumulativeTrayLetter(boxes: Box[], boxIndex: number, trayIndex: number): string {
	return getTrayLetter(getCumulativeTrayIndex(boxes, boxIndex, trayIndex));
}

// Color palette for trays
export const TRAY_COLORS = ['#c9503c', '#3d7a6a', '#d4956a', '#7c5c4a', '#a36b5a', '#5a7c6a'];

/**
 * Get the next color for a new tray based on total tray count across all boxes.
 */
function getNextTrayColor(boxes: Box[]): string {
	const totalTrays = boxes.reduce((sum, box) => sum + box.trays.length, 0);
	return TRAY_COLORS[totalTrays % TRAY_COLORS.length];
}

function createDefaultCounterTray(name: string, color: string): CounterTray {
	return {
		id: generateId(),
		type: 'counter',
		name,
		color,
		rotationOverride: 'auto',
		params: { ...defaultParams }
	};
}

function createDefaultCardDrawTray(name: string, color: string): CardDrawTray {
	return {
		id: generateId(),
		type: 'cardDraw',
		name,
		color,
		rotationOverride: 'auto',
		params: { ...defaultCardDrawTrayParams }
	};
}

function createDefaultCardDividerTray(name: string, color: string): CardDividerTray {
	return {
		id: generateId(),
		type: 'cardDivider',
		name,
		color,
		rotationOverride: 'auto',
		params: { ...defaultCardDividerTrayParams }
	};
}

// Legacy alias for backwards compatibility
function _createDefaultCardTray(name: string, color: string): CardDrawTray {
	return createDefaultCardDrawTray(name, color);
}

// Backwards compatibility alias
function createDefaultTray(name: string, color: string): CounterTray {
	return createDefaultCounterTray(name, color);
}

function createDefaultBox(name: string): Box {
	return {
		id: generateId(),
		name,
		trays: [],
		tolerance: 0.5,
		wallThickness: 3.0,
		floorThickness: 2.0,
		fillSolidEmpty: true,
		lidParams: { ...defaultLidParams }
	};
}

function createDefaultProject(): Project {
	const box = createDefaultBox('Box 1');
	const counterTray = createDefaultTray('Tray 1', TRAY_COLORS[0]);
	const cardDrawTray = createDefaultCardDrawTray('Card Draw', TRAY_COLORS[1]);
	// Set card draw tray to hold 25 cards
	cardDrawTray.params = { ...cardDrawTray.params, cardCount: 25 };
	box.trays.push(counterTray);
	box.trays.push(cardDrawTray);

	return {
		boxes: [box],
		counterShapes: DEFAULT_COUNTER_SHAPES.map((s) => ({ ...s })),
		cardSizes: DEFAULT_CARD_SIZES.map((s) => ({ ...s })),
		selectedBoxId: box.id,
		selectedTrayId: counterTray.id
	};
}

// Reactive state
let project = $state<Project>(createDefaultProject());

// Initialize from localStorage
export function initProject(): void {
	const saved = loadProject();
	if (saved) {
		project = saved;
	}
}

// Auto-save helper
function autosave(): void {
	saveProject(project);
}

// Getters
export function getProject(): Project {
	return project;
}

export function getBoxes(): Box[] {
	return project.boxes;
}

export function getSelectedBox(): Box | null {
	if (!project.selectedBoxId) return null;
	return project.boxes.find((b) => b.id === project.selectedBoxId) ?? null;
}

export function getSelectedTray(): Tray | null {
	const box = getSelectedBox();
	if (!box || !project.selectedTrayId) return null;
	return box.trays.find((t) => t.id === project.selectedTrayId) ?? null;
}

// Selection
export function selectBox(boxId: string): void {
	project.selectedBoxId = boxId;
	const box = project.boxes.find((b) => b.id === boxId);
	if (box && box.trays.length > 0) {
		project.selectedTrayId = box.trays[0].id;
	} else {
		project.selectedTrayId = null;
	}
	autosave();
}

export function selectTray(trayId: string): void {
	project.selectedTrayId = trayId;
	autosave();
}

// Box operations
export function addBox(trayType: TrayType = 'counter'): Box {
	const boxNumber = project.boxes.length + 1;
	const box = createDefaultBox(`Box ${boxNumber}`);
	const color = getNextTrayColor(project.boxes);

	let tray: Tray;
	if (trayType === 'cardDraw' || trayType === 'card') {
		tray = createDefaultCardDrawTray('Card Draw 1', color);
	} else if (trayType === 'cardDivider') {
		tray = createDefaultCardDividerTray('Card Divider 1', color);
	} else {
		tray = createDefaultCounterTray('Tray 1', color);
		// Inherit global params (including customShapes) from existing counter trays
		const globalParams = getGlobalParamsFromExisting();
		tray.params = { ...tray.params, ...globalParams };
	}

	box.trays.push(tray);
	project.boxes.push(box);
	project.selectedBoxId = box.id;
	project.selectedTrayId = tray.id;
	autosave();
	return box;
}

export function deleteBox(boxId: string): void {
	const index = project.boxes.findIndex((b) => b.id === boxId);
	if (index === -1) return;

	project.boxes.splice(index, 1);

	// Update selection
	if (project.selectedBoxId === boxId) {
		if (project.boxes.length > 0) {
			const newIndex = Math.min(index, project.boxes.length - 1);
			project.selectedBoxId = project.boxes[newIndex].id;
			project.selectedTrayId = project.boxes[newIndex].trays[0]?.id ?? null;
		} else {
			project.selectedBoxId = null;
			project.selectedTrayId = null;
		}
	}
	autosave();
}

export function updateBox(boxId: string, updates: Partial<Omit<Box, 'id' | 'trays'>>): void {
	const box = project.boxes.find((b) => b.id === boxId);
	if (box) {
		Object.assign(box, updates);
		autosave();
	}
}

// Global params that should be shared across counter trays
const GLOBAL_PARAM_KEYS: (keyof CounterTrayParams)[] = [
	'counterThickness',
	'clearance',
	'wallThickness',
	'floorThickness',
	'rimHeight',
	'cutoutRatio',
	'cutoutMax',
	'printBedSize'
];

// Get current global params from any existing counter tray
function getGlobalParamsFromExisting(): Partial<CounterTrayParams> {
	for (const box of project.boxes) {
		for (const tray of box.trays) {
			if (isCounterTray(tray)) {
				const existingParams = tray.params;
				const globalParams: Partial<CounterTrayParams> = {};
				for (const key of GLOBAL_PARAM_KEYS) {
					(globalParams as Record<string, unknown>)[key] = existingParams[key];
				}
				return globalParams;
			}
		}
	}
	return {};
}

// Tray type for addTray function
export type TrayType = 'counter' | 'cardDraw' | 'cardDivider' | 'card';

// Tray operations
export function addTray(boxId: string, trayType: TrayType = 'counter'): Tray | null {
	const box = project.boxes.find((b) => b.id === boxId);
	if (!box) return null;

	const trayNumber = box.trays.length + 1;
	const color = getNextTrayColor(project.boxes);

	let tray: Tray;
	if (trayType === 'cardDraw' || trayType === 'card') {
		tray = createDefaultCardDrawTray(`Card Draw ${trayNumber}`, color);
	} else if (trayType === 'cardDivider') {
		tray = createDefaultCardDividerTray(`Card Divider ${trayNumber}`, color);
	} else {
		tray = createDefaultCounterTray(`Tray ${trayNumber}`, color);
		// Inherit global params (including customShapes) from existing counter trays
		const globalParams = getGlobalParamsFromExisting();
		tray.params = { ...tray.params, ...globalParams };
	}

	box.trays.push(tray);
	project.selectedTrayId = tray.id;
	autosave();
	return tray;
}

export function deleteTray(boxId: string, trayId: string): void {
	const box = project.boxes.find((b) => b.id === boxId);
	if (!box) return;

	const index = box.trays.findIndex((t) => t.id === trayId);
	if (index === -1) return;

	box.trays.splice(index, 1);

	// Update selection
	if (project.selectedTrayId === trayId) {
		if (box.trays.length > 0) {
			const newIndex = Math.min(index, box.trays.length - 1);
			project.selectedTrayId = box.trays[newIndex].id;
		} else {
			project.selectedTrayId = null;
		}
	}
	autosave();
}

export function updateTray(trayId: string, updates: Partial<Omit<Tray, 'id'>>): void {
	for (const box of project.boxes) {
		const tray = box.trays.find((t) => t.id === trayId);
		if (tray) {
			Object.assign(tray, updates);
			autosave();
			return;
		}
	}
}

// Set tray rotation override ('auto' | 0 | 90)
export function setTrayRotation(trayId: string, rotation: 'auto' | 0 | 90): void {
	for (const box of project.boxes) {
		const tray = box.trays.find((t) => t.id === trayId);
		if (tray) {
			tray.rotationOverride = rotation;
			autosave();
			return;
		}
	}
}

// Update counter tray params
export function updateTrayParams(trayId: string, params: CounterTrayParams): void {
	for (const box of project.boxes) {
		const tray = box.trays.find((t) => t.id === trayId);
		if (tray && isCounterTray(tray)) {
			tray.params = params;
			autosave();
			return;
		}
	}
}

// Counter shape operations (global)
export function getCounterShapes(): CounterShape[] {
	return project.counterShapes;
}

export function getCounterShape(id: string): CounterShape | null {
	return project.counterShapes.find((s) => s.id === id) ?? null;
}

export function addCounterShape(shape: Omit<CounterShape, 'id'>): CounterShape {
	const newShape: CounterShape = { ...shape, id: generateId() };
	project.counterShapes.push(newShape);
	autosave();
	return newShape;
}

export function updateCounterShape(id: string, updates: Partial<Omit<CounterShape, 'id'>>): void {
	const shape = project.counterShapes.find((s) => s.id === id);
	if (shape) {
		Object.assign(shape, updates);
		autosave();
	}
}

export function deleteCounterShape(id: string): void {
	const index = project.counterShapes.findIndex((s) => s.id === id);
	if (index >= 0) {
		project.counterShapes.splice(index, 1);
		// Remove stacks referencing this shape from all counter trays
		for (const box of project.boxes) {
			for (const tray of box.trays) {
				if (isCounterTray(tray)) {
					tray.params.topLoadedStacks = tray.params.topLoadedStacks.filter(
						([shapeId]) => shapeId !== id
					);
					tray.params.edgeLoadedStacks = tray.params.edgeLoadedStacks.filter(
						([shapeId]) => shapeId !== id
					);
				}
			}
		}
		autosave();
	}
}

// Card size operations (global)
export function getCardSizes(): CardSize[] {
	return project.cardSizes;
}

export function getCardSize(id: string): CardSize | null {
	return project.cardSizes.find((s) => s.id === id) ?? null;
}

export function addCardSize(cardSize: Omit<CardSize, 'id'>): CardSize {
	const newCardSize: CardSize = { ...cardSize, id: generateId() };
	project.cardSizes.push(newCardSize);
	autosave();
	return newCardSize;
}

export function updateCardSize(id: string, updates: Partial<Omit<CardSize, 'id'>>): void {
	const cardSize = project.cardSizes.find((s) => s.id === id);
	if (cardSize) {
		Object.assign(cardSize, updates);
		autosave();
	}
}

export function deleteCardSize(id: string): void {
	const index = project.cardSizes.findIndex((s) => s.id === id);
	if (index >= 0) {
		project.cardSizes.splice(index, 1);
		// Note: We don't auto-delete card trays using this size - let them show an error
		autosave();
	}
}

// Update card draw tray params
export function updateCardDrawTrayParams(trayId: string, params: CardDrawTrayParams): void {
	for (const box of project.boxes) {
		const tray = box.trays.find((t) => t.id === trayId);
		if (tray && isCardDrawTray(tray)) {
			tray.params = params;
			autosave();
			return;
		}
	}
}

// Legacy alias for backwards compatibility
export const updateCardTrayParams = updateCardDrawTrayParams;

// Update card divider tray params
export function updateCardDividerTrayParams(trayId: string, params: CardDividerTrayParams): void {
	for (const box of project.boxes) {
		const tray = box.trays.find((t) => t.id === trayId);
		if (tray && isCardDividerTray(tray)) {
			tray.params = params;
			autosave();
			return;
		}
	}
}

// Reset project
export function resetProject(): void {
	project = createDefaultProject();
	autosave();
}

// Move a tray to a different box (or create a new box)
export function moveTray(trayId: string, targetBoxId: string | 'new'): void {
	// Find the tray and its current box
	let sourceTray: Tray | null = null;
	let sourceBox: Box | null = null;
	let sourceIndex = -1;

	for (const box of project.boxes) {
		const trayIndex = box.trays.findIndex((t) => t.id === trayId);
		if (trayIndex !== -1) {
			sourceTray = box.trays[trayIndex];
			sourceBox = box;
			sourceIndex = trayIndex;
			break;
		}
	}

	if (!sourceTray || !sourceBox) return;

	// Determine target box
	let targetBox: Box;
	if (targetBoxId === 'new') {
		// Create a new box
		const boxNumber = project.boxes.length + 1;
		targetBox = {
			id: generateId(),
			name: `Box ${boxNumber}`,
			trays: [],
			tolerance: sourceBox.tolerance,
			wallThickness: sourceBox.wallThickness,
			floorThickness: sourceBox.floorThickness,
			lidParams: { ...sourceBox.lidParams }
		};
		project.boxes.push(targetBox);
	} else {
		const found = project.boxes.find((b) => b.id === targetBoxId);
		if (!found || found.id === sourceBox.id) return; // Can't move to same box
		targetBox = found;
	}

	// Remove from source box
	sourceBox.trays.splice(sourceIndex, 1);

	// Add to target box
	targetBox.trays.push(sourceTray);

	// Update selection to follow the moved tray
	project.selectedBoxId = targetBox.id;
	project.selectedTrayId = sourceTray.id;

	// If source box is now empty, we might want to select the target anyway (already done)
	// But we should also handle if the user was viewing a different tray in source box

	autosave();
}

// Import project from JSON data
export function importProject(data: Project): void {
	// Run migrations to ensure all fields have proper defaults (handles older exported files)
	project = migrateProjectData(data);
	// Ensure selection is valid
	if (project.boxes.length > 0) {
		const selectedBox = project.boxes.find((b) => b.id === project.selectedBoxId);
		if (!selectedBox) {
			project.selectedBoxId = project.boxes[0].id;
		}
		const box = project.boxes.find((b) => b.id === project.selectedBoxId);
		if (box && box.trays.length > 0) {
			const selectedTray = box.trays.find((t) => t.id === project.selectedTrayId);
			if (!selectedTray) {
				project.selectedTrayId = box.trays[0].id;
			}
		} else {
			project.selectedTrayId = null;
		}
	} else {
		project.selectedBoxId = null;
		project.selectedTrayId = null;
	}
	autosave();
}
