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
	railInset: number;      // Channel width (outer wall to inner rail)
	ledgeHeight: number;    // Height of outer wall before step-in
	fingerNotchRadius: number;
	fingerNotchDepth: number;
	// Snap-lock parameters
	snapEnabled: boolean;      // Enable snap-lock mechanism
	snapBumpHeight: number;    // How far bump protrudes (0.4-0.5mm typical)
	snapBumpWidth: number;     // Width of bump along wall (3-5mm typical)
}

export interface Box {
	id: string;
	name: string;
	trays: Tray[];
	tolerance: number;
	wallThickness: number;
	floorThickness: number;
	lidParams: LidParams;
}

export interface Project {
	boxes: Box[];
	selectedBoxId: string | null;
	selectedTrayId: string | null;
}
