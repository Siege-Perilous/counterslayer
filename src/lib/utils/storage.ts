import type { Project, Box, LidParams, Tray } from '$lib/types/project';
import { defaultLidParams } from '$lib/models/lid';
import {
	defaultParams,
	type CounterTrayParams,
	type TopLoadedStackDef,
	type EdgeLoadedStackDef
} from '$lib/models/counterTray';
import { TRAY_COLORS } from '$lib/stores/project.svelte';

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
}

// Migrate tray params to handle:
// 1. stacks -> topLoadedStacks/edgeLoadedStacks rename
// 2. simple counters -> custom shapes migration
function migrateTrayParams(params: CounterTrayParams & LegacyTrayParams): CounterTrayParams {
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

	// Detect old format: has squareWidth but customShapes don't include default shapes
	const hasOldFormat = params.squareWidth !== undefined;
	const hasDefaultShapes = migrated.customShapes.some((s) =>
		['Square', 'Hex', 'Circle', 'Triangle'].includes(s.name)
	);

	if (hasOldFormat && !hasDefaultShapes) {
		// Create custom shapes from old params
		const defaultShapes = [
			{
				name: 'Square',
				baseShape: 'square' as const,
				width: params.squareWidth ?? 15.9,
				length: params.squareWidth ?? 15.9
			},
			{
				name: 'Hex',
				baseShape: 'hex' as const,
				width: params.hexFlatToFlat ?? 15.9,
				length: params.hexFlatToFlat ?? 15.9,
				pointyTop: params.hexPointyTop ?? false
			},
			{
				name: 'Circle',
				baseShape: 'circle' as const,
				width: params.circleDiameter ?? 15.9,
				length: params.circleDiameter ?? 15.9
			},
			{
				name: 'Triangle',
				baseShape: 'triangle' as const,
				width: params.triangleSide ?? 15.9,
				length: params.triangleSide ?? 15.9,
				cornerRadius: params.triangleCornerRadius ?? 1.5
			}
		];

		// Prepend default shapes (user's custom shapes come after)
		migrated.customShapes = [...defaultShapes, ...migrated.customShapes];

		// Update stack references from 'square' to 'custom:Square', etc.
		const shapeMapping: Record<string, string> = {
			square: 'custom:Square',
			hex: 'custom:Hex',
			circle: 'custom:Circle',
			triangle: 'custom:Triangle'
		};

		migrated.topLoadedStacks = migrated.topLoadedStacks.map(([shape, count, label]) => {
			const newShape = shapeMapping[shape] ?? shape;
			return [newShape, count, label] as TopLoadedStackDef;
		});

		migrated.edgeLoadedStacks = migrated.edgeLoadedStacks.map(([shape, count, orient, label]) => {
			const newShape = shapeMapping[shape] ?? shape;
			return [newShape, count, orient, label] as EdgeLoadedStackDef;
		});
	}

	// Validate stack references - if custom:X references missing shape, fallback to 'custom:Square'
	// Also preserve optional label field
	migrated.topLoadedStacks = migrated.topLoadedStacks.map(([shape, count, label]) => {
		if (shape.startsWith('custom:')) {
			const name = shape.substring(7);
			if (!migrated.customShapes.some((s) => s.name === name)) {
				return ['custom:Square', count, label] as TopLoadedStackDef;
			}
		}
		return [shape, count, label] as TopLoadedStackDef;
	});

	migrated.edgeLoadedStacks = migrated.edgeLoadedStacks.map(([shape, count, orient, label]) => {
		if (shape.startsWith('custom:')) {
			const name = shape.substring(7);
			if (!migrated.customShapes.some((s) => s.name === name)) {
				return ['custom:Square', count, orient, label] as EdgeLoadedStackDef;
			}
		}
		return [shape, count, orient, label] as EdgeLoadedStackDef;
	});

	// Migrate global hexPointyTop to per-shape pointyTop for existing hex shapes
	if (params.hexPointyTop !== undefined) {
		migrated.customShapes = migrated.customShapes.map((shape) => {
			if (shape.baseShape === 'hex' && shape.pointyTop === undefined) {
				return { ...shape, pointyTop: params.hexPointyTop };
			}
			return shape;
		});
	}

	// Remove old params that are no longer used
	delete (migrated as LegacyTrayParams).squareWidth;
	delete (migrated as LegacyTrayParams).squareLength;
	delete (migrated as LegacyTrayParams).hexFlatToFlat;
	delete (migrated as LegacyTrayParams).circleDiameter;
	delete (migrated as LegacyTrayParams).triangleSide;
	delete (migrated as LegacyTrayParams).triangleCornerRadius;
	delete (migrated as LegacyTrayParams).hexPointyTop;

	return migrated;
}

// Migrate a tray to ensure all fields have valid values
function migrateTray(tray: Tray, cumulativeIndex: number): Tray {
	return {
		...tray,
		// Assign color if missing (for old data)
		color: tray.color || TRAY_COLORS[cumulativeIndex % TRAY_COLORS.length],
		params: migrateTrayParams(tray.params)
	};
}

// Migrate a box to ensure all fields have valid values
function migrateBox(box: Box, cumulativeStartIndex: number): Box {
	return {
		...box,
		trays: box.trays.map((tray, idx) => migrateTray(tray, cumulativeStartIndex + idx)),
		lidParams: migrateLidParams(box.lidParams)
	};
}

// Migrate a full project to ensure all fields have valid values
export function migrateProjectData(project: Project): Project {
	let cumulativeIndex = 0;
	const migratedBoxes = project.boxes.map((box) => {
		const migratedBox = migrateBox(box, cumulativeIndex);
		cumulativeIndex += box.trays.length;
		return migratedBox;
	});
	return {
		...project,
		boxes: migratedBoxes
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
