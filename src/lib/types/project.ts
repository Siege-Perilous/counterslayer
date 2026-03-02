import type { CounterTrayParams } from '$lib/models/counterTray';
import type { CardTrayParams } from '$lib/models/cardTray';

// Base tray interface shared by all tray types
interface BaseTray {
	id: string;
	name: string;
	color: string;
	rotationOverride?: 'auto' | 0 | 90; // User can force rotation: 'auto' = algorithm decides, 0 = no rotation, 90 = rotated
}

// Counter tray for cardboard counter tokens
export interface CounterTray extends BaseTray {
	type: 'counter';
	params: CounterTrayParams;
}

// Card tray for playing cards
export interface CardTray extends BaseTray {
	type: 'card';
	params: CardTrayParams;
}

// Discriminated union of all tray types
export type Tray = CounterTray | CardTray;

// Type guards for tray types
export function isCounterTray(tray: Tray): tray is CounterTray {
	return tray.type === 'counter';
}

export function isCardTray(tray: Tray): tray is CardTray {
	return tray.type === 'card';
}

export interface LidParams {
	thickness: number;
	railHeight: number;
	railWidth: number;
	railInset: number; // Channel width (outer wall to inner rail)
	ledgeHeight: number; // Height of outer wall before step-in
	fingerNotchRadius: number;
	fingerNotchDepth: number;
	// Snap-lock parameters
	snapEnabled: boolean; // Enable snap-lock mechanism
	snapBumpHeight: number; // How far bump protrudes (0.4-0.5mm typical)
	snapBumpWidth: number; // Width of bump along wall (3-5mm typical)
	railEngagement: number; // Fraction of lip height used for rail (0.0-1.0, default 0.5)
	// Ramp lock parameters (replaces cylindrical snap bump when enabled)
	rampLockEnabled: boolean; // Use ramp lock instead of cylindrical snap bump
	rampHeight: number; // Peak height in mm (default: 0.5)
	rampLengthIn: number; // Entry slope length in mm (default: 4, longer = easier slide-in)
	rampLengthOut: number; // Exit slope length in mm (default: 1.5, shorter = harder to remove)
	// Text embossing
	showName: boolean; // Emboss box name on lid top (default true)
}

export interface Box {
	id: string;
	name: string;
	trays: Tray[];
	tolerance: number;
	wallThickness: number;
	floorThickness: number;
	lidParams: LidParams;
	// Custom exterior dimensions (undefined = auto-size)
	customWidth?: number; // Exterior X dimension
	customDepth?: number; // Exterior Y dimension
	customBoxHeight?: number; // Exterior Z dimension (box only, excludes lid; UI shows total height)
	// Gap-filling behavior
	fillSolidEmpty?: boolean; // false = walls only (default), true = solid fill
}

export interface Project {
	boxes: Box[];
	selectedBoxId: string | null;
	selectedTrayId: string | null;
}
