/**
 * Unified Editor Snapping Utility
 * Handles grid snapping, face-to-face snapping, and overlap detection
 * Used by both box layout editor and layer layout editor
 */

import type { SnapGuide, SnapResult, SnappableItem } from '$lib/types/editor';

// Snap thresholds
const GRID_SIZE = 1; // 1mm grid
const FACE_SNAP_THRESHOLD = 5; // 5mm threshold for face-to-face snapping
// Tolerance for overlap detection - accounts for minor placement discrepancies
const OVERLAP_EPSILON = 0.1;

/**
 * Apply snapping to a position
 * Face-to-face snapping takes precedence over grid snapping
 */
export function snapItemPosition(
  movingItem: SnappableItem,
  newX: number,
  newY: number,
  otherItems: SnappableItem[],
  boundsWidth: number,
  boundsDepth: number
): SnapResult {
  const guides: SnapGuide[] = [];

  // Calculate edges of moving item at proposed position
  const movingLeft = newX;
  const movingRight = newX + movingItem.width;
  const movingFront = newY;
  const movingBack = newY + movingItem.depth;

  let snappedX = newX;
  let snappedY = newY;
  let xSnapped = false;
  let ySnapped = false;

  // Try face-to-face snapping first (higher priority)
  for (const other of otherItems) {
    if (other.id === movingItem.id) continue;

    const otherLeft = other.x;
    const otherRight = other.x + other.width;
    const otherFront = other.y;
    const otherBack = other.y + other.depth;

    // X-axis face snapping
    if (!xSnapped) {
      // Snap moving right edge to other left edge
      if (Math.abs(movingRight - otherLeft) < FACE_SNAP_THRESHOLD) {
        snappedX = otherLeft - movingItem.width;
        xSnapped = true;
        const guideY = Math.min(movingFront, otherFront);
        const guideEndY = Math.max(movingBack, otherBack);
        guides.push({
          type: 'vertical',
          position: otherLeft,
          start: guideY,
          end: guideEndY
        });
      }
      // Snap moving left edge to other right edge
      else if (Math.abs(movingLeft - otherRight) < FACE_SNAP_THRESHOLD) {
        snappedX = otherRight;
        xSnapped = true;
        const guideY = Math.min(movingFront, otherFront);
        const guideEndY = Math.max(movingBack, otherBack);
        guides.push({
          type: 'vertical',
          position: otherRight,
          start: guideY,
          end: guideEndY
        });
      }
      // Snap moving left to other left (alignment)
      else if (Math.abs(movingLeft - otherLeft) < FACE_SNAP_THRESHOLD) {
        snappedX = otherLeft;
        xSnapped = true;
        guides.push({
          type: 'vertical',
          position: otherLeft,
          start: Math.min(movingFront, otherFront),
          end: Math.max(movingBack, otherBack)
        });
      }
      // Snap moving right to other right (alignment)
      else if (Math.abs(movingRight - otherRight) < FACE_SNAP_THRESHOLD) {
        snappedX = otherRight - movingItem.width;
        xSnapped = true;
        guides.push({
          type: 'vertical',
          position: otherRight,
          start: Math.min(movingFront, otherFront),
          end: Math.max(movingBack, otherBack)
        });
      }
    }

    // Y-axis face snapping
    if (!ySnapped) {
      // Snap moving back edge to other front edge
      if (Math.abs(movingBack - otherFront) < FACE_SNAP_THRESHOLD) {
        snappedY = otherFront - movingItem.depth;
        ySnapped = true;
        const guideX = Math.min(movingLeft, otherLeft);
        const guideEndX = Math.max(movingRight, otherRight);
        guides.push({
          type: 'horizontal',
          position: otherFront,
          start: guideX,
          end: guideEndX
        });
      }
      // Snap moving front edge to other back edge
      else if (Math.abs(movingFront - otherBack) < FACE_SNAP_THRESHOLD) {
        snappedY = otherBack;
        ySnapped = true;
        const guideX = Math.min(movingLeft, otherLeft);
        const guideEndX = Math.max(movingRight, otherRight);
        guides.push({
          type: 'horizontal',
          position: otherBack,
          start: guideX,
          end: guideEndX
        });
      }
      // Snap moving front to other front (alignment)
      else if (Math.abs(movingFront - otherFront) < FACE_SNAP_THRESHOLD) {
        snappedY = otherFront;
        ySnapped = true;
        guides.push({
          type: 'horizontal',
          position: otherFront,
          start: Math.min(movingLeft, otherLeft),
          end: Math.max(movingRight, otherRight)
        });
      }
      // Snap moving back to other back (alignment)
      else if (Math.abs(movingBack - otherBack) < FACE_SNAP_THRESHOLD) {
        snappedY = otherBack - movingItem.depth;
        ySnapped = true;
        guides.push({
          type: 'horizontal',
          position: otherBack,
          start: Math.min(movingLeft, otherLeft),
          end: Math.max(movingBack, otherBack)
        });
      }
    }
  }

  // Apply grid snapping if face snap didn't trigger
  if (!xSnapped) {
    snappedX = Math.round(snappedX / GRID_SIZE) * GRID_SIZE;
  }
  if (!ySnapped) {
    snappedY = Math.round(snappedY / GRID_SIZE) * GRID_SIZE;
  }

  // Constrain to bounds
  snappedX = Math.max(0, Math.min(snappedX, boundsWidth - movingItem.width));
  snappedY = Math.max(0, Math.min(snappedY, boundsDepth - movingItem.depth));

  return { x: snappedX, y: snappedY, guides };
}

/**
 * Check if two items overlap (AABB collision)
 */
export function checkItemOverlap(item1: SnappableItem, item2: SnappableItem): boolean {
  const left1 = item1.x;
  const right1 = item1.x + item1.width;
  const front1 = item1.y;
  const back1 = item1.y + item1.depth;

  const left2 = item2.x;
  const right2 = item2.x + item2.width;
  const front2 = item2.y;
  const back2 = item2.y + item2.depth;

  // Check for non-overlap (if any is true, no overlap)
  const noOverlapX = right1 <= left2 + OVERLAP_EPSILON || right2 <= left1 + OVERLAP_EPSILON;
  const noOverlapY = back1 <= front2 + OVERLAP_EPSILON || back2 <= front1 + OVERLAP_EPSILON;

  if (noOverlapX || noOverlapY) return false;

  return true;
}

/**
 * Check if an item overlaps with any other item
 */
export function hasAnyOverlap(item: SnappableItem, allItems: SnappableItem[]): boolean {
  for (const other of allItems) {
    if (other.id === item.id) continue;
    if (checkItemOverlap(item, other)) return true;
  }
  return false;
}

/**
 * Find all overlapping item pairs
 * Returns array of overlapping item ID pairs
 */
export function findAllOverlaps(items: SnappableItem[]): Array<[string, string]> {
  const overlaps: Array<[string, string]> = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (checkItemOverlap(items[i], items[j])) {
        overlaps.push([items[i].id, items[j].id]);
      }
    }
  }
  return overlaps;
}

/**
 * Check if an item is within bounds
 */
export function isWithinBounds(item: SnappableItem, boundsWidth: number, boundsDepth: number): boolean {
  return item.x >= 0 && item.y >= 0 && item.x + item.width <= boundsWidth && item.y + item.depth <= boundsDepth;
}

/**
 * Validate a proposed position (no overlaps, within bounds)
 */
export function isValidPosition(
  movingItem: SnappableItem,
  newX: number,
  newY: number,
  allItems: SnappableItem[],
  boundsWidth: number,
  boundsDepth: number
): boolean {
  // Create a temporary item with the new position
  const testItem: SnappableItem = {
    ...movingItem,
    x: newX,
    y: newY
  };

  // Check bounds
  if (!isWithinBounds(testItem, boundsWidth, boundsDepth)) {
    return false;
  }

  // Check overlaps
  if (hasAnyOverlap(testItem, allItems)) {
    return false;
  }

  return true;
}
