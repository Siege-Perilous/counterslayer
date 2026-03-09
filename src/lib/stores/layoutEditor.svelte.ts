/**
 * Layout Editor State Store
 * Manages the state for manual tray arrangement editing
 */

import type { TrayPlacement } from '$lib/models/box';
import type { ManualTrayPlacement } from '$lib/types/project';

// Working placement during editing (includes more info than saved placement)
export interface EditorTrayPlacement {
  trayId: string;
  name: string;
  color: string;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  // Original dimensions (before rotation)
  originalWidth: number;
  originalDepth: number;
  height: number;
}

// Computed dimensions based on rotation
export function getEffectiveDimensions(placement: EditorTrayPlacement): {
  width: number;
  depth: number;
} {
  const swapped = placement.rotation === 90 || placement.rotation === 270;
  return {
    width: swapped ? placement.originalDepth : placement.originalWidth,
    depth: swapped ? placement.originalWidth : placement.originalDepth
  };
}

// Reactive state
let isEditMode = $state(false);
let selectedTrayId = $state<string | null>(null);
let workingPlacements = $state<EditorTrayPlacement[]>([]);
let originalPlacements = $state<EditorTrayPlacement[]>([]); // For cancel/restore
let printBedSize = $state(256); // Legacy - use boundsWidth/boundsDepth instead
let boundsWidth = $state(256); // Interior width (box width minus walls)
let boundsDepth = $state(256); // Interior depth (box depth minus walls)

// Snap guides for visual feedback
export interface SnapGuide {
  type: 'vertical' | 'horizontal';
  position: number; // x for vertical, y for horizontal
  start: number;
  end: number;
}
let activeSnapGuides = $state<SnapGuide[]>([]);

// Drag state - stored here so it can be shared between different event systems
// (Threlte pointer events and DOM canvas events)
export interface DragState {
  isDragging: boolean;
  hasMoved: boolean; // True once the pointer has moved during drag
  trayId: string | null;
  startX: number;
  startY: number;
  originalTrayX: number;
  originalTrayY: number;
}
let dragState = $state<DragState>({
  isDragging: false,
  hasMoved: false,
  trayId: null,
  startX: 0,
  startY: 0,
  originalTrayX: 0,
  originalTrayY: 0
});

// Reactive state object - use this for $derived in components
// Getters on this object will be called reactively
export const layoutEditorState = {
  get isEditMode() {
    return isEditMode;
  },
  get selectedTrayId() {
    return selectedTrayId;
  },
  get workingPlacements() {
    return workingPlacements;
  },
  get activeSnapGuides() {
    return activeSnapGuides;
  },
  get printBedSize() {
    return printBedSize;
  },
  get boundsWidth() {
    return boundsWidth;
  },
  get boundsDepth() {
    return boundsDepth;
  },
  get dragState() {
    return dragState;
  }
};

// Legacy getters (for backwards compatibility, but prefer layoutEditorState)
export function getIsEditMode(): boolean {
  return isEditMode;
}

export function getSelectedTrayId(): string | null {
  return selectedTrayId;
}

export function getWorkingPlacements(): EditorTrayPlacement[] {
  return workingPlacements;
}

export function getActiveSnapGuides(): SnapGuide[] {
  return activeSnapGuides;
}

export function getPrintBedSize(): number {
  return printBedSize;
}

export function getBoundsWidth(): number {
  return boundsWidth;
}

export function getBoundsDepth(): number {
  return boundsDepth;
}

// Actions
export function enterEditMode(
  placements: TrayPlacement[],
  interiorWidth: number = 256,
  interiorDepth: number = 256
): void {
  // Convert TrayPlacement to EditorTrayPlacement
  workingPlacements = placements.map((p) => ({
    trayId: p.tray.id,
    name: p.tray.name,
    color: p.tray.color,
    x: p.x,
    y: p.y,
    rotation: p.rotated ? 90 : 0,
    originalWidth: p.rotated ? p.dimensions.depth : p.dimensions.width,
    originalDepth: p.rotated ? p.dimensions.width : p.dimensions.depth,
    height: p.dimensions.height
  }));
  // Deep copy for restore on cancel
  originalPlacements = JSON.parse(JSON.stringify(workingPlacements));
  // Set bounds for layout constraints (interior of box, not print bed)
  boundsWidth = interiorWidth;
  boundsDepth = interiorDepth;
  printBedSize = Math.max(interiorWidth, interiorDepth); // Legacy compatibility
  selectedTrayId = null;
  activeSnapGuides = [];
  isEditMode = true;
}

export function exitEditMode(): void {
  isEditMode = false;
  selectedTrayId = null;
  workingPlacements = [];
  originalPlacements = [];
  activeSnapGuides = [];
}

export function selectTray(trayId: string | null): void {
  selectedTrayId = trayId;
}

// Drag operations
export function startDrag(
  trayId: string,
  startX: number,
  startY: number,
  originalTrayX: number,
  originalTrayY: number
): void {
  dragState = {
    isDragging: true,
    hasMoved: false,
    trayId,
    startX,
    startY,
    originalTrayX,
    originalTrayY
  };
}

export function markDragMoved(): void {
  if (dragState.isDragging && !dragState.hasMoved) {
    dragState = { ...dragState, hasMoved: true };
  }
}

export function endDrag(): void {
  dragState = {
    isDragging: false,
    hasMoved: false,
    trayId: null,
    startX: 0,
    startY: 0,
    originalTrayX: 0,
    originalTrayY: 0
  };
}

export function getDragState(): DragState {
  return dragState;
}

export function updateTrayPosition(trayId: string, x: number, y: number): void {
  const index = workingPlacements.findIndex((p) => p.trayId === trayId);
  if (index !== -1) {
    // Create a new array to ensure reactivity triggers
    workingPlacements = workingPlacements.map((p, i) => (i === index ? { ...p, x, y } : p));
  }
}

export function rotateTray(trayId: string): void {
  const index = workingPlacements.findIndex((p) => p.trayId === trayId);
  if (index !== -1) {
    const placement = workingPlacements[index];
    const newRotation = ((placement.rotation + 90) % 360) as 0 | 90 | 180 | 270;
    // Create a new array to ensure reactivity triggers in derived consumers
    workingPlacements = workingPlacements.map((p, i) => (i === index ? { ...p, rotation: newRotation } : p));
  }
}

export function setSnapGuides(guides: SnapGuide[]): void {
  activeSnapGuides = guides;
}

export function clearSnapGuides(): void {
  activeSnapGuides = [];
}

// Reset to auto bin-packing (clear manual layout)
export function resetToAuto(): void {
  // This will be handled by the component that calls clearManualLayout
  // and then re-enters edit mode with fresh auto placements
}

// Cancel changes and restore original positions
export function cancelChanges(): void {
  workingPlacements = JSON.parse(JSON.stringify(originalPlacements));
  selectedTrayId = null;
  activeSnapGuides = [];
}

// Convert working placements to ManualTrayPlacement for saving
// Normalizes positions so the bounding box starts at (0,0) - this ensures
// the box is sized to fit the trays tightly regardless of where they were
// positioned in the edit area
export function getManualPlacements(): ManualTrayPlacement[] {
  if (workingPlacements.length === 0) return [];

  // Find the minimum x and y positions
  let minX = Infinity;
  let minY = Infinity;
  for (const p of workingPlacements) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
  }

  // Shift all positions so minimum becomes 0
  return workingPlacements.map((p) => ({
    trayId: p.trayId,
    x: p.x - minX,
    y: p.y - minY,
    rotation: p.rotation
  }));
}

// Calculate bounding box of all trays (for box sizing)
export function calculateBoundingBox(): { width: number; depth: number; maxHeight: number } {
  let maxX = 0;
  let maxY = 0;
  let maxHeight = 0;

  for (const p of workingPlacements) {
    const dims = getEffectiveDimensions(p);
    maxX = Math.max(maxX, p.x + dims.width);
    maxY = Math.max(maxY, p.y + dims.depth);
    maxHeight = Math.max(maxHeight, p.height);
  }

  return { width: maxX, depth: maxY, maxHeight };
}

// Get the selected placement
export function getSelectedPlacement(): EditorTrayPlacement | null {
  if (!selectedTrayId) return null;
  return workingPlacements.find((p) => p.trayId === selectedTrayId) ?? null;
}
