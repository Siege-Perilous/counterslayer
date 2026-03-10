/**
 * Layout Snapping Utility (Box Layout Editor)
 * Wraps the shared editorSnapping utilities with box-specific types
 */

import type { EditorTrayPlacement } from '$lib/stores/layoutEditor.svelte';
import { getEffectiveDimensions } from '$lib/stores/layoutEditor.svelte';
import type { SnapResult, SnappableItem } from '$lib/types/editor';
import {
  checkItemOverlap,
  findAllOverlaps as findAllOverlapsBase,
  hasAnyOverlap as hasAnyOverlapBase,
  isValidPosition as isValidPositionBase,
  isWithinBounds as isWithinBoundsBase,
  snapItemPosition
} from './editorSnapping';

// Re-export types for backwards compatibility
export type { SnapResult };

// Convert EditorTrayPlacement to SnappableItem
function toSnappableItem(placement: EditorTrayPlacement): SnappableItem {
  const dims = getEffectiveDimensions(placement);
  return {
    id: placement.trayId,
    x: placement.x,
    y: placement.y,
    width: dims.width,
    depth: dims.depth
  };
}

/**
 * Apply snapping to a position
 * Face-to-face snapping takes precedence over grid snapping
 */
export function snapPosition(
  movingTray: EditorTrayPlacement,
  newX: number,
  newY: number,
  allPlacements: EditorTrayPlacement[],
  boundsWidth: number,
  boundsDepth: number = boundsWidth
): SnapResult {
  const movingItem = toSnappableItem({ ...movingTray, x: newX, y: newY });
  const otherItems = allPlacements.filter((p) => p.trayId !== movingTray.trayId).map(toSnappableItem);

  return snapItemPosition(movingItem, newX, newY, otherItems, boundsWidth, boundsDepth);
}

/**
 * Check if two placements overlap (AABB collision)
 */
export function checkOverlap(placement1: EditorTrayPlacement, placement2: EditorTrayPlacement): boolean {
  return checkItemOverlap(toSnappableItem(placement1), toSnappableItem(placement2));
}

/**
 * Check if a placement overlaps with any other placement
 */
export function hasAnyOverlap(placement: EditorTrayPlacement, allPlacements: EditorTrayPlacement[]): boolean {
  const item = toSnappableItem(placement);
  const allItems = allPlacements.map(toSnappableItem);
  return hasAnyOverlapBase(item, allItems);
}

/**
 * Check if any placements in the array overlap with each other
 * Returns array of overlapping tray ID pairs
 */
export function findAllOverlaps(placements: EditorTrayPlacement[]): Array<[string, string]> {
  const items = placements.map(toSnappableItem);
  return findAllOverlapsBase(items);
}

/**
 * Check if a placement is within interior bounds
 */
export function isWithinBounds(
  placement: EditorTrayPlacement,
  boundsWidth: number,
  boundsDepth: number = boundsWidth
): boolean {
  return isWithinBoundsBase(toSnappableItem(placement), boundsWidth, boundsDepth);
}

/**
 * Validate a proposed position (no overlaps, within bounds)
 */
export function isValidPosition(
  movingTray: EditorTrayPlacement,
  newX: number,
  newY: number,
  allPlacements: EditorTrayPlacement[],
  boundsWidth: number,
  boundsDepth: number = boundsWidth
): boolean {
  const testItem = toSnappableItem({ ...movingTray, x: newX, y: newY });
  const allItems = allPlacements.map(toSnappableItem);
  return isValidPositionBase(testItem, newX, newY, allItems, boundsWidth, boundsDepth);
}
