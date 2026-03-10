/**
 * Shared types for layout editors (box and layer)
 */

// Snap guide for visual feedback during drag
export interface SnapGuide {
  type: 'vertical' | 'horizontal';
  position: number; // x for vertical, y for horizontal
  start: number;
  end: number;
}

// Result of snapping calculation
export interface SnapResult {
  x: number;
  y: number;
  guides: SnapGuide[];
}

// Generic item for snapping (pre-computed dimensions)
export interface SnappableItem {
  id: string;
  x: number;
  y: number;
  width: number; // effective (post-rotation)
  depth: number; // effective (post-rotation)
}

// Base placement interface shared by all editor placements
export interface BaseEditorPlacement {
  name: string;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  originalWidth: number;
  originalDepth: number;
  height: number;
}

// Compute effective dimensions based on rotation
export function getEffectiveDimensions(placement: { rotation: number; originalWidth: number; originalDepth: number }): {
  width: number;
  depth: number;
} {
  const swapped = placement.rotation === 90 || placement.rotation === 270;
  return {
    width: swapped ? placement.originalDepth : placement.originalWidth,
    depth: swapped ? placement.originalWidth : placement.originalDepth
  };
}
