/**
 * Generic bin packing utility using Guillotine algorithm
 * Used by both box.ts (trays in boxes) and layer.ts (boxes/trays in layers)
 */

import { GuillotineBinPack, Rect } from 'rectangle-packer';

/**
 * Input item for bin packing
 */
export interface PackingItem<T> {
  data: T;
  width: number;
  depth: number;
}

/**
 * Result of packing an item
 */
export interface PackedItem<T> {
  data: T;
  x: number;
  y: number;
  width: number;
  depth: number;
  rotated: boolean;
}

/**
 * Result of bin packing operation
 */
export interface PackingResult<T> {
  items: PackedItem<T>[];
  totalWidth: number;
  totalDepth: number;
  area: number;
}

// Extended Rect class to store item data
class PackRect<T> extends Rect {
  itemData: T;
  originalWidth: number;
  originalHeight: number;

  constructor(item: PackingItem<T>) {
    super(0, 0, item.width, item.depth);
    this.itemData = item.data;
    this.originalWidth = item.width;
    this.originalHeight = item.depth;
  }
}

/**
 * Try packing with specific heuristics
 */
function tryPacking<T>(
  items: PackingItem<T>[],
  containerWidth: number,
  containerHeight: number,
  allowFlip: boolean,
  rectChoice: number,
  splitMethod: number
): PackingResult<T> | null {
  const packer = new GuillotineBinPack<PackRect<T>>(containerWidth, containerHeight, allowFlip);

  // Create fresh rect objects
  const rects = items.map((item) => new PackRect(item));

  // Insert all rectangles
  packer.InsertSizes(rects, true, rectChoice, splitMethod);

  // Check if all were placed
  if (packer.usedRectangles.length !== items.length) return null;

  // Verify no overlaps
  const OVERLAP_EPSILON = 0.01;
  for (let i = 0; i < packer.usedRectangles.length; i++) {
    for (let j = i + 1; j < packer.usedRectangles.length; j++) {
      const r1 = packer.usedRectangles[i];
      const r2 = packer.usedRectangles[j];
      const noOverlapX = r1.x + r1.width <= r2.x + OVERLAP_EPSILON || r2.x + r2.width <= r1.x + OVERLAP_EPSILON;
      const noOverlapY = r1.y + r1.height <= r2.y + OVERLAP_EPSILON || r2.y + r2.height <= r1.y + OVERLAP_EPSILON;
      if (!noOverlapX && !noOverlapY) {
        return null; // Overlap detected
      }
    }
  }

  // Verify fit within container
  let maxX = 0;
  let maxY = 0;
  for (const rect of packer.usedRectangles) {
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  if (maxX > containerWidth || maxY > containerHeight) return null;

  // Build result
  const packedItems: PackedItem<T>[] = [];

  for (const rect of packer.usedRectangles) {
    const packRect = rect as PackRect<T>;
    const wasRotated =
      Math.abs(rect.width - packRect.originalHeight) < 0.01 && Math.abs(rect.height - packRect.originalWidth) < 0.01;

    packedItems.push({
      data: packRect.itemData,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      depth: rect.height,
      rotated: wasRotated
    });
  }

  return {
    items: packedItems,
    totalWidth: maxX,
    totalDepth: maxY,
    area: maxX * maxY
  };
}

/**
 * Pack items into a container using Guillotine bin packing
 * Tries multiple heuristic combinations and returns the most compact result
 *
 * @param items - Items to pack, each with width, depth, and custom data
 * @param containerWidth - Width of the container
 * @param containerHeight - Height (depth) of the container
 * @returns Best packing result, or null if no valid packing found
 */
export function packItems<T>(
  items: PackingItem<T>[],
  containerWidth: number,
  containerHeight: number
): PackingResult<T> | null {
  if (items.length === 0) return null;

  // Sort by area (largest first) for better packing
  const sortedItems = [...items].sort((a, b) => b.width * b.depth - a.width * a.depth);

  // Try combinations of heuristics
  // RectChoice: 0=BestAreaFit, 1=BestShortSideFit, 2=BestLongSideFit
  // SplitMethod: 0-5 (all useful variants)
  const rectChoices = [0, 1, 2];
  const splitMethods = [0, 1, 2, 3, 4, 5];

  const results: PackingResult<T>[] = [];

  for (const allowFlip of [true, false]) {
    for (const rectChoice of rectChoices) {
      for (const splitMethod of splitMethods) {
        const result = tryPacking(sortedItems, containerWidth, containerHeight, allowFlip, rectChoice, splitMethod);
        if (result) {
          results.push(result);
        }
      }
    }
  }

  // Return the most compact result
  if (results.length > 0) {
    results.sort((a, b) => a.area - b.area);
    return results[0];
  }

  return null;
}

/**
 * Fallback: stack items vertically when bin packing fails
 */
export function stackItemsVertically<T>(items: PackingItem<T>[]): PackingResult<T> {
  const packedItems: PackedItem<T>[] = [];
  let y = 0;
  let maxWidth = 0;

  for (const item of items) {
    packedItems.push({
      data: item.data,
      x: 0,
      y,
      width: item.width,
      depth: item.depth,
      rotated: false
    });
    y += item.depth;
    maxWidth = Math.max(maxWidth, item.width);
  }

  return {
    items: packedItems,
    totalWidth: maxWidth,
    totalDepth: y,
    area: maxWidth * y
  };
}
