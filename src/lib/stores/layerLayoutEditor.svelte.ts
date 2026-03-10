/**
 * Layer Layout Editor State Store
 * Manages the state for manual box and loose tray arrangement within a layer
 */

import type { BoxPlacement, LooseTrayPlacement } from '$lib/models/layer';
import type { SnapGuide } from '$lib/types/editor';
import { getEffectiveDimensions as getEffectiveDimsBase } from '$lib/types/editor';
import type { ManualBoxPlacement, ManualLooseTrayPlacement } from '$lib/types/project';

// Re-export SnapGuide for backwards compatibility
export type { SnapGuide };

// Working placement for boxes during editing
export interface EditorBoxPlacement {
  boxId: string;
  name: string;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  // Original dimensions (before rotation)
  originalWidth: number;
  originalDepth: number;
  height: number;
}

// Working placement for loose trays during editing
export interface EditorLooseTrayPlacement {
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

// Computed dimensions based on rotation (uses shared implementation)
export function getEffectiveBoxDimensions(placement: EditorBoxPlacement): {
  width: number;
  depth: number;
} {
  return getEffectiveDimsBase(placement);
}

export function getEffectiveLooseTrayDimensions(placement: EditorLooseTrayPlacement): {
  width: number;
  depth: number;
} {
  return getEffectiveDimsBase(placement);
}

// Reactive state
let isEditMode = $state(false);
let selectedItemId = $state<string | null>(null);
let selectedItemType = $state<'box' | 'looseTray' | null>(null);
let workingBoxPlacements = $state<EditorBoxPlacement[]>([]);
let workingLooseTrayPlacements = $state<EditorLooseTrayPlacement[]>([]);
let originalBoxPlacements = $state<EditorBoxPlacement[]>([]); // For cancel/restore
let originalLooseTrayPlacements = $state<EditorLooseTrayPlacement[]>([]); // For cancel/restore
let gameContainerWidth = $state(256);
let gameContainerDepth = $state(256);

// Snap guides for visual feedback
let activeSnapGuides = $state<SnapGuide[]>([]);

// Drag state
export interface DragState {
  isDragging: boolean;
  hasMoved: boolean;
  itemId: string | null;
  itemType: 'box' | 'looseTray' | null;
  startX: number;
  startY: number;
  originalItemX: number;
  originalItemY: number;
}
let dragState = $state<DragState>({
  isDragging: false,
  hasMoved: false,
  itemId: null,
  itemType: null,
  startX: 0,
  startY: 0,
  originalItemX: 0,
  originalItemY: 0
});

// Reactive state object
export const layerLayoutEditorState = {
  get isEditMode() {
    return isEditMode;
  },
  get selectedItemId() {
    return selectedItemId;
  },
  get selectedItemType() {
    return selectedItemType;
  },
  get workingBoxPlacements() {
    return workingBoxPlacements;
  },
  get workingLooseTrayPlacements() {
    return workingLooseTrayPlacements;
  },
  get activeSnapGuides() {
    return activeSnapGuides;
  },
  get gameContainerWidth() {
    return gameContainerWidth;
  },
  get gameContainerDepth() {
    return gameContainerDepth;
  },
  get dragState() {
    return dragState;
  }
};

// Getter functions for non-reactive access
export function getIsEditMode(): boolean {
  return isEditMode;
}

export function getSelectedItemId(): string | null {
  return selectedItemId;
}

export function getSelectedItemType(): 'box' | 'looseTray' | null {
  return selectedItemType;
}

/**
 * Enter layer layout edit mode
 */
export function enterLayerEditMode(
  boxPlacements: BoxPlacement[],
  looseTrayPlacements: LooseTrayPlacement[],
  containerWidth: number,
  containerDepth: number
): void {
  // Convert to editor placements
  const editorBoxPlacements: EditorBoxPlacement[] = boxPlacements.map((p) => {
    const swapped = p.rotation === 90 || p.rotation === 270;
    return {
      boxId: p.box.id,
      name: p.box.name,
      x: p.x,
      y: p.y,
      rotation: p.rotation,
      originalWidth: swapped ? p.dimensions.depth : p.dimensions.width,
      originalDepth: swapped ? p.dimensions.width : p.dimensions.depth,
      height: p.dimensions.height
    };
  });

  const editorLooseTrayPlacements: EditorLooseTrayPlacement[] = looseTrayPlacements.map((p) => {
    const swapped = p.rotation === 90 || p.rotation === 270;
    return {
      trayId: p.tray.id,
      name: p.tray.name,
      color: p.tray.color || '#888888',
      x: p.x,
      y: p.y,
      rotation: p.rotation,
      originalWidth: swapped ? p.dimensions.depth : p.dimensions.width,
      originalDepth: swapped ? p.dimensions.width : p.dimensions.depth,
      height: p.dimensions.height
    };
  });

  workingBoxPlacements = editorBoxPlacements;
  workingLooseTrayPlacements = editorLooseTrayPlacements;
  originalBoxPlacements = JSON.parse(JSON.stringify(editorBoxPlacements));
  originalLooseTrayPlacements = JSON.parse(JSON.stringify(editorLooseTrayPlacements));
  gameContainerWidth = containerWidth;
  gameContainerDepth = containerDepth;
  isEditMode = true;
  selectedItemId = null;
  selectedItemType = null;
}

/**
 * Exit layer layout edit mode
 */
export function exitLayerEditMode(): void {
  isEditMode = false;
  selectedItemId = null;
  selectedItemType = null;
  workingBoxPlacements = [];
  workingLooseTrayPlacements = [];
  originalBoxPlacements = [];
  originalLooseTrayPlacements = [];
  activeSnapGuides = [];
  dragState = {
    isDragging: false,
    hasMoved: false,
    itemId: null,
    itemType: null,
    startX: 0,
    startY: 0,
    originalItemX: 0,
    originalItemY: 0
  };
}

/**
 * Cancel changes and restore original placements
 */
export function cancelLayerChanges(): void {
  workingBoxPlacements = JSON.parse(JSON.stringify(originalBoxPlacements));
  workingLooseTrayPlacements = JSON.parse(JSON.stringify(originalLooseTrayPlacements));
  selectedItemId = null;
  selectedItemType = null;
  activeSnapGuides = [];
}

/**
 * Select an item
 */
export function selectLayerItem(itemId: string, itemType: 'box' | 'looseTray'): void {
  selectedItemId = itemId;
  selectedItemType = itemType;
}

/**
 * Deselect any selected item
 */
export function deselectLayerItem(): void {
  selectedItemId = null;
  selectedItemType = null;
}

/**
 * Update a box position
 */
export function updateBoxPosition(boxId: string, x: number, y: number): void {
  const idx = workingBoxPlacements.findIndex((p) => p.boxId === boxId);
  if (idx !== -1) {
    workingBoxPlacements[idx].x = x;
    workingBoxPlacements[idx].y = y;
  }
}

/**
 * Update a loose tray position
 */
export function updateLooseTrayPosition(trayId: string, x: number, y: number): void {
  const idx = workingLooseTrayPlacements.findIndex((p) => p.trayId === trayId);
  if (idx !== -1) {
    workingLooseTrayPlacements[idx].x = x;
    workingLooseTrayPlacements[idx].y = y;
  }
}

/**
 * Rotate a box (90° clockwise)
 */
export function rotateBox(boxId: string): void {
  const idx = workingBoxPlacements.findIndex((p) => p.boxId === boxId);
  if (idx !== -1) {
    const current = workingBoxPlacements[idx].rotation;
    const newRotation = ((current + 90) % 360) as 0 | 90 | 180 | 270;
    workingBoxPlacements[idx].rotation = newRotation;
  }
}

/**
 * Rotate a loose tray (90° clockwise)
 */
export function rotateLooseTray(trayId: string): void {
  const idx = workingLooseTrayPlacements.findIndex((p) => p.trayId === trayId);
  if (idx !== -1) {
    const current = workingLooseTrayPlacements[idx].rotation;
    const newRotation = ((current + 90) % 360) as 0 | 90 | 180 | 270;
    workingLooseTrayPlacements[idx].rotation = newRotation;
  }
}

/**
 * Rotate the currently selected item
 */
export function rotateSelectedItem(): void {
  if (selectedItemId && selectedItemType === 'box') {
    rotateBox(selectedItemId);
  } else if (selectedItemId && selectedItemType === 'looseTray') {
    rotateLooseTray(selectedItemId);
  }
}

/**
 * Get manual placements for saving to project
 */
export function getManualLayerPlacements(): {
  boxes: ManualBoxPlacement[];
  looseTrays: ManualLooseTrayPlacement[];
} {
  const boxes: ManualBoxPlacement[] = workingBoxPlacements.map((p) => ({
    boxId: p.boxId,
    x: p.x,
    y: p.y,
    rotation: p.rotation
  }));

  const looseTrays: ManualLooseTrayPlacement[] = workingLooseTrayPlacements.map((p) => ({
    trayId: p.trayId,
    x: p.x,
    y: p.y,
    rotation: p.rotation
  }));

  return { boxes, looseTrays };
}

/**
 * Set snap guides
 */
export function setSnapGuides(guides: SnapGuide[]): void {
  activeSnapGuides = guides;
}

/**
 * Clear snap guides
 */
export function clearSnapGuides(): void {
  activeSnapGuides = [];
}

/**
 * Start dragging an item
 */
export function startDrag(itemId: string, itemType: 'box' | 'looseTray', startX: number, startY: number): void {
  let originalX = 0;
  let originalY = 0;

  if (itemType === 'box') {
    const placement = workingBoxPlacements.find((p) => p.boxId === itemId);
    if (placement) {
      originalX = placement.x;
      originalY = placement.y;
    }
  } else {
    const placement = workingLooseTrayPlacements.find((p) => p.trayId === itemId);
    if (placement) {
      originalX = placement.x;
      originalY = placement.y;
    }
  }

  dragState = {
    isDragging: true,
    hasMoved: false,
    itemId,
    itemType,
    startX,
    startY,
    originalItemX: originalX,
    originalItemY: originalY
  };

  selectLayerItem(itemId, itemType);
}

/**
 * Update drag position with bounds checking considering item dimensions
 */
export function updateDrag(currentX: number, currentY: number): void {
  if (!dragState.isDragging || !dragState.itemId) return;

  const deltaX = currentX - dragState.startX;
  const deltaY = currentY - dragState.startY;

  if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
    dragState.hasMoved = true;
  }

  const newX = dragState.originalItemX + deltaX;
  const newY = dragState.originalItemY + deltaY;

  // Get item dimensions for proper bounds clamping
  let itemWidth = 0;
  let itemDepth = 0;

  if (dragState.itemType === 'box') {
    const placement = workingBoxPlacements.find((p) => p.boxId === dragState.itemId);
    if (placement) {
      const dims = getEffectiveBoxDimensions(placement);
      itemWidth = dims.width;
      itemDepth = dims.depth;
    }
  } else {
    const placement = workingLooseTrayPlacements.find((p) => p.trayId === dragState.itemId);
    if (placement) {
      const dims = getEffectiveLooseTrayDimensions(placement);
      itemWidth = dims.width;
      itemDepth = dims.depth;
    }
  }

  // Clamp to bounds - ensure item stays fully within container
  const clampedX = Math.max(0, Math.min(newX, gameContainerWidth - itemWidth));
  const clampedY = Math.max(0, Math.min(newY, gameContainerDepth - itemDepth));

  if (dragState.itemType === 'box') {
    updateBoxPosition(dragState.itemId, clampedX, clampedY);
  } else {
    updateLooseTrayPosition(dragState.itemId, clampedX, clampedY);
  }
}

/**
 * End drag
 */
export function endDrag(): void {
  dragState = {
    isDragging: false,
    hasMoved: false,
    itemId: null,
    itemType: null,
    startX: 0,
    startY: 0,
    originalItemX: 0,
    originalItemY: 0
  };
  clearSnapGuides();
}

/**
 * Get the currently selected placement (for UI display)
 */
export function getSelectedPlacement(): EditorBoxPlacement | EditorLooseTrayPlacement | null {
  if (!selectedItemId || !selectedItemType) return null;
  if (selectedItemType === 'box') {
    return workingBoxPlacements.find((p) => p.boxId === selectedItemId) ?? null;
  }
  return workingLooseTrayPlacements.find((p) => p.trayId === selectedItemId) ?? null;
}
