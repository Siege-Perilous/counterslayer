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
