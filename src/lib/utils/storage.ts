import type { Project, Box, LidParams, Tray } from '$lib/types/project';
import { defaultLidParams } from '$lib/models/lid';
import {
	defaultParams,
	type CounterTrayParams,
	type TopLoadedStackDef,
	type EdgeLoadedStackDef
} from '$lib/models/counterTray';

const STORAGE_KEY = 'counter-tray-project';

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

// Migrate tray params to handle stacks -> topLoadedStacks/edgeLoadedStacks rename
function migrateTrayParams(
	params: CounterTrayParams & { stacks?: [string, number][] }
): CounterTrayParams {
	const migrated = { ...defaultParams, ...params };

	// Handle migration from old 'stacks' field to 'topLoadedStacks'
	if (params.stacks && !params.topLoadedStacks) {
		migrated.topLoadedStacks = params.stacks;
		delete (migrated as { stacks?: [string, number][] }).stacks;
	}

	// Ensure edgeLoadedStacks exists
	if (!migrated.edgeLoadedStacks) {
		migrated.edgeLoadedStacks = [];
	}

	// Ensure customShapes exists
	if (!migrated.customShapes) {
		migrated.customShapes = [];
	}

	// Validate stack references - if custom:X references missing shape, fallback to 'square'
	// Also preserve optional label field
	migrated.topLoadedStacks = migrated.topLoadedStacks.map(([shape, count, label]) => {
		if (shape.startsWith('custom:')) {
			const name = shape.substring(7);
			if (!migrated.customShapes.some((s) => s.name === name)) {
				return ['square', count, label] as TopLoadedStackDef;
			}
		}
		return [shape, count, label] as TopLoadedStackDef;
	});

	migrated.edgeLoadedStacks = migrated.edgeLoadedStacks.map(([shape, count, orient, label]) => {
		if (shape.startsWith('custom:')) {
			const name = shape.substring(7);
			if (!migrated.customShapes.some((s) => s.name === name)) {
				return ['square', count, orient, label] as EdgeLoadedStackDef;
			}
		}
		return [shape, count, orient, label] as EdgeLoadedStackDef;
	});

	return migrated;
}

// Migrate a tray to ensure all fields have valid values
function migrateTray(tray: Tray): Tray {
	return {
		...tray,
		params: migrateTrayParams(tray.params)
	};
}

// Migrate a box to ensure all fields have valid values
function migrateBox(box: Box): Box {
	return {
		...box,
		trays: box.trays.map(migrateTray),
		lidParams: migrateLidParams(box.lidParams)
	};
}

// Migrate a full project to ensure all fields have valid values
export function migrateProjectData(project: Project): Project {
	return {
		...project,
		boxes: project.boxes.map(migrateBox)
	};
}

export function loadProject(): Project | null {
	try {
		const data = localStorage.getItem(STORAGE_KEY);
		if (data) {
			const project = JSON.parse(data) as Project;
			// Migrate boxes to ensure new fields have defaults
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
