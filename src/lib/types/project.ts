import type { CounterTrayParams } from '$lib/models/counterTray';
import type { CardDrawTrayParams } from '$lib/models/cardTray';
import type { CardDividerTrayParams } from '$lib/models/cardDividerTray';

// Base shape types for counter shapes
export type CounterBaseShape = 'rectangle' | 'square' | 'circle' | 'hex' | 'triangle';

// Counter shape definition (global, referenced by ID)
export interface CounterShape {
	id: string;
	name: string;
	baseShape: CounterBaseShape;
	width: number;
	length: number;
	cornerRadius?: number; // For triangle shapes
	pointyTop?: boolean; // For hex shapes
}

// Card size definition (global, referenced by ID)
export interface CardSize {
	id: string;
	name: string;
	width: number; // Sleeved width in mm
	length: number; // Sleeved length in mm
	thickness: number; // Sleeved thickness in mm
}

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

// Card draw tray for drawing cards (face down, sloped floor, finger cutout)
export interface CardDrawTray extends BaseTray {
	type: 'cardDraw';
	params: CardDrawTrayParams;
}

// Card divider tray for card storage (cards standing on edge in multiple stacks)
export interface CardDividerTray extends BaseTray {
	type: 'cardDivider';
	params: CardDividerTrayParams;
}

// Legacy alias for backwards compatibility
export type CardTray = CardDrawTray;

// Discriminated union of all tray types
export type Tray = CounterTray | CardDrawTray | CardDividerTray;

// Type guards for tray types
export function isCounterTray(tray: Tray): tray is CounterTray {
	return tray.type === 'counter';
}

export function isCardDrawTray(tray: Tray): tray is CardDrawTray {
	return tray.type === 'cardDraw';
}

export function isCardDividerTray(tray: Tray): tray is CardDividerTray {
	return tray.type === 'cardDivider';
}

// Legacy alias - also matches old 'card' type for migration
export function isCardTray(tray: Tray): tray is CardDrawTray {
	return tray.type === 'cardDraw' || (tray as { type: string }).type === 'card';
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
	fillSolidEmpty?: boolean; // true = solid fill (default), false = walls only
}

export interface Project {
	boxes: Box[];
	counterShapes: CounterShape[];
	cardSizes: CardSize[];
	selectedBoxId: string | null;
	selectedTrayId: string | null;
}
