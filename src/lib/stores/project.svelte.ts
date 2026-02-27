import { defaultParams, type CounterTrayParams } from '$lib/models/counterTray';
import { defaultLidParams } from '$lib/models/lid';
import { saveProject, loadProject, migrateProjectData } from '$lib/utils/storage';
import type { Tray, Box, Project, LidParams } from '$lib/types/project';
import { SvelteMap } from 'svelte/reactivity';

export type { Tray, Box, Project, LidParams };

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

function createDefaultTray(name: string): Tray {
	return {
		id: generateId(),
		name,
		params: { ...defaultParams }
	};
}

function createDefaultBox(name: string): Box {
	return {
		id: generateId(),
		name,
		trays: [],
		tolerance: 0.5,
		wallThickness: 3.0,
		floorThickness: 2.0,
		lidParams: { ...defaultLidParams }
	};
}

function createDefaultProject(): Project {
	const box = createDefaultBox('Box 1');
	const tray = createDefaultTray('Tray 1');
	box.trays.push(tray);

	return {
		boxes: [box],
		selectedBoxId: box.id,
		selectedTrayId: tray.id
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
export function addBox(): Box {
	const boxNumber = project.boxes.length + 1;
	const box = createDefaultBox(`Box ${boxNumber}`);
	const tray = createDefaultTray('Tray 1');
	// Inherit global params (including customShapes) from existing trays
	const globalParams = getGlobalParamsFromExisting();
	tray.params = { ...tray.params, ...globalParams };
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

// Get current global params from any existing tray
function getGlobalParamsFromExisting(): Partial<CounterTrayParams> {
	for (const box of project.boxes) {
		if (box.trays.length > 0) {
			const existingParams = box.trays[0].params;
			const globalParams: Partial<CounterTrayParams> = {};
			for (const key of GLOBAL_PARAM_KEYS) {
				(globalParams as Record<string, unknown>)[key] = existingParams[key];
			}
			return globalParams;
		}
	}
	return {};
}

// Tray operations
export function addTray(boxId: string): Tray | null {
	const box = project.boxes.find((b) => b.id === boxId);
	if (!box) return null;

	const trayNumber = box.trays.length + 1;
	const tray = createDefaultTray(`Tray ${trayNumber}`);
	// Inherit global params (including customShapes) from existing trays
	const globalParams = getGlobalParamsFromExisting();
	tray.params = { ...tray.params, ...globalParams };
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

// Global params that should be shared across all trays when changed
const GLOBAL_PARAM_KEYS: (keyof CounterTrayParams)[] = [
	'printBedSize',
	'counterThickness',
	'customShapes'
];

export function updateTrayParams(trayId: string, params: CounterTrayParams): void {
	// Find the tray being updated to get its old params
	let oldParams: CounterTrayParams | null = null;
	for (const box of project.boxes) {
		const tray = box.trays.find((t) => t.id === trayId);
		if (tray) {
			oldParams = tray.params;
			break;
		}
	}

	if (!oldParams) return;

	// Detect which global params changed
	const changedGlobals: Partial<CounterTrayParams> = {};
	for (const key of GLOBAL_PARAM_KEYS) {
		const oldVal = oldParams[key];
		const newVal = params[key];
		// Deep compare for arrays (customShapes)
		const changed = Array.isArray(oldVal)
			? JSON.stringify(oldVal) !== JSON.stringify(newVal)
			: oldVal !== newVal;
		if (changed) {
			(changedGlobals as Record<string, unknown>)[key] = newVal;
		}
	}

	// Update the target tray with full new params
	for (const box of project.boxes) {
		const tray = box.trays.find((t) => t.id === trayId);
		if (tray) {
			tray.params = params;
			break;
		}
	}

	// Propagate changed global params to all other trays
	if (Object.keys(changedGlobals).length > 0) {
		// Detect shape renames by comparing old and new customShapes
		const shapeRenames = new SvelteMap<string, string>(); // oldName -> newName
		if (changedGlobals.customShapes && oldParams.customShapes) {
			const newShapes = changedGlobals.customShapes as typeof oldParams.customShapes;
			// Match shapes by index (shapes are edited in place, not reordered)
			for (let i = 0; i < Math.min(oldParams.customShapes.length, newShapes.length); i++) {
				const oldName = oldParams.customShapes[i].name;
				const newName = newShapes[i].name;
				if (oldName !== newName) {
					shapeRenames.set(oldName, newName);
				}
			}
		}

		for (const box of project.boxes) {
			for (const tray of box.trays) {
				if (tray.id !== trayId) {
					let updatedParams = { ...tray.params, ...changedGlobals };

					// Update stack references if shapes were renamed
					if (shapeRenames.size > 0) {
						updatedParams = {
							...updatedParams,
							topLoadedStacks: updatedParams.topLoadedStacks.map(([shape, count]) => {
								for (const [oldName, newName] of shapeRenames) {
									if (shape === `custom:${oldName}`) {
										return [
											`custom:${newName}`,
											count
										] as (typeof updatedParams.topLoadedStacks)[0];
									}
								}
								return [shape, count] as (typeof updatedParams.topLoadedStacks)[0];
							}),
							edgeLoadedStacks: updatedParams.edgeLoadedStacks.map(([shape, count, orient]) => {
								for (const [oldName, newName] of shapeRenames) {
									if (shape === `custom:${oldName}`) {
										return [
											`custom:${newName}`,
											count,
											orient
										] as (typeof updatedParams.edgeLoadedStacks)[0];
									}
								}
								return [shape, count, orient] as (typeof updatedParams.edgeLoadedStacks)[0];
							})
						};
					}

					tray.params = updatedParams;
				}
			}
		}
	}

	autosave();
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
