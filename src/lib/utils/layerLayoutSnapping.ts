/**
 * Layer Layout Snapping Utility
 * Wraps the shared editorSnapping utilities for layer items (boxes + loose trays)
 */

import type { SnapResult, SnappableItem } from '$lib/types/editor';
import {
  checkItemOverlap,
  findAllOverlaps as findAllOverlapsBase,
  isWithinBounds as isWithinBoundsBase,
  snapItemPosition
} from './editorSnapping';

// Re-export types and the SnappableItem interface as LayerItemForSnapping for backwards compatibility
export type { SnapResult };
export type LayerItemForSnapping = SnappableItem;

/**
 * Apply snapping to a position for layer items
 * Face-to-face snapping takes precedence over grid snapping
 */
export function snapLayerItemPosition(
  movingItem: LayerItemForSnapping,
  newX: number,
  newY: number,
  otherItems: LayerItemForSnapping[],
  boundsWidth: number,
  boundsDepth: number
): SnapResult {
  return snapItemPosition(movingItem, newX, newY, otherItems, boundsWidth, boundsDepth);
}

/**
 * Check if two layer items overlap (AABB collision)
 */
export function checkLayerItemOverlap(item1: LayerItemForSnapping, item2: LayerItemForSnapping): boolean {
  return checkItemOverlap(item1, item2);
}

/**
 * Find all overlapping layer item pairs
 * Returns array of overlapping item ID pairs
 */
export function findLayerOverlaps(items: LayerItemForSnapping[]): Array<[string, string]> {
  return findAllOverlapsBase(items);
}

/**
 * Check if a layer item is within bounds
 */
export function isLayerItemWithinBounds(item: LayerItemForSnapping, boundsWidth: number, boundsDepth: number): boolean {
  return isWithinBoundsBase(item, boundsWidth, boundsDepth);
}
