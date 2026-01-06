import type { Project, Box, LidParams } from '$lib/types/project';
import { defaultLidParams } from '$lib/models/lid';

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

// Migrate a box to ensure all fields have valid values
function migrateBox(box: Box): Box {
	return {
		...box,
		lidParams: migrateLidParams(box.lidParams)
	};
}

export function loadProject(): Project | null {
	try {
		const data = localStorage.getItem(STORAGE_KEY);
		if (data) {
			const project = JSON.parse(data) as Project;
			// Migrate boxes to ensure new fields have defaults
			project.boxes = project.boxes.map(migrateBox);
			return project;
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
