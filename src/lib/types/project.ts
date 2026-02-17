import type { CounterTrayParams } from '$lib/models/counterTray';

export interface Tray {
	id: string;
	name: string;
	params: CounterTrayParams;
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
	customHeight?: number; // Exterior Z dimension
	// Gap-filling behavior
	fillSolidEmpty?: boolean; // false = walls only (default), true = solid fill
}

export interface Project {
	boxes: Box[];
	selectedBoxId: string | null;
	selectedTrayId: string | null;
}
