/**
 * Section Layout Snapping Utility
 * Wraps the shared editorSnapping utilities for section items (boxes + loose trays)
 */

import type { SnapResult, SnappableItem } from '#lib/types/editor.js';
import {
  checkItemOverlap,
  findAllOverlaps as findAllOverlapsBase,
  isWithinBounds as isWithinBoundsBase,
  snapItemPosition
} from './editorSnapping';

// Re-export types and the SnappableItem interface as SectionItemForSnapping for backwards compatibility
export type { SnapResult };
export type SectionItemForSnapping = SnappableItem;

/**
 * Apply snapping to a position for section items
 * Face-to-face snapping takes precedence over grid snapping
 */
export function snapSectionItemPosition(
  movingItem: SectionItemForSnapping,
  newX: number,
  newY: number,
  otherItems: SectionItemForSnapping[],
  boundsWidth: number,
  boundsDepth: number
): SnapResult {
  return snapItemPosition(movingItem, newX, newY, otherItems, boundsWidth, boundsDepth);
}

/**
 * Check if two section items overlap (AABB collision)
 */
export function checkSectionItemOverlap(item1: SectionItemForSnapping, item2: SectionItemForSnapping): boolean {
  return checkItemOverlap(item1, item2);
}

/**
 * Find all overlapping section item pairs
 * Returns array of overlapping item ID pairs
 */
export function findSectionOverlaps(items: SectionItemForSnapping[]): Array<[string, string]> {
  return findAllOverlapsBase(items);
}

/**
 * Check if a section item is within bounds
 */
export function isLayerItemWithinBounds(
  item: SectionItemForSnapping,
  boundsWidth: number,
  boundsDepth: number
): boolean {
  return isWithinBoundsBase(item, boundsWidth, boundsDepth);
}
