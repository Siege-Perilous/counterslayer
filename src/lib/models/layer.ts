/**
 * Layer model - handles arrangement and height calculation for layers
 * A layer contains boxes (with trays inside) and loose trays (not in boxes)
 */

import type {
  Box,
  CardSize,
  CounterShape,
  Layer,
  ManualBoxPlacement,
  ManualLooseTrayPlacement,
  Tray
} from '$lib/types/project';
import { GuillotineBinPack, Rect } from 'rectangle-packer';
import { getBoxExteriorDimensions, getTrayDimensionsForTray } from './box';

export interface BoxDimensions {
  width: number;
  depth: number;
  height: number;
}

export interface BoxPlacement {
  box: Box;
  dimensions: BoxDimensions;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
}

export interface LooseTrayPlacement {
  tray: Tray;
  dimensions: { width: number; depth: number; height: number };
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
}

export interface LayerArrangement {
  boxes: BoxPlacement[];
  looseTrays: LooseTrayPlacement[];
  layerHeight: number;
  totalWidth: number;
  totalDepth: number;
}

/**
 * Calculate the height of a layer
 * Layer height = max of all box exterior heights and all loose tray content heights
 */
export function calculateLayerHeight(
  layer: Layer,
  options: {
    cardSizes: CardSize[];
    counterShapes: CounterShape[];
  }
): number {
  const { cardSizes, counterShapes } = options;

  // Get all box exterior heights
  const boxHeights = layer.boxes.map((box) => {
    const dims = getBoxExteriorDimensions(box, cardSizes, counterShapes);
    return dims.height;
  });

  // Get all loose tray content heights (minimum required height)
  const looseTrayHeights = layer.looseTrays.map((tray) => {
    const dims = getTrayDimensionsForTray(tray, cardSizes, counterShapes);
    return dims.height;
  });

  // Layer height = max of all items
  return Math.max(...boxHeights, ...looseTrayHeights, 0);
}

/**
 * Get dimensions of a box's exterior (including walls, floor, lid)
 * This is used for layer-level arrangement
 */
export function getBoxDimensions(
  box: Box,
  cardSizes: CardSize[],
  counterShapes: CounterShape[]
): BoxDimensions {
  return getBoxExteriorDimensions(box, cardSizes, counterShapes);
}

/**
 * Arrange boxes and loose trays within a layer
 * Uses bin-packing similar to arrangeTrays but at the layer level
 */
export function arrangeLayerContents(
  layer: Layer,
  options: {
    gameContainerWidth: number;
    gameContainerDepth: number;
    cardSizes: CardSize[];
    counterShapes: CounterShape[];
    gap?: number;
  }
): LayerArrangement {
  const { gameContainerWidth, gameContainerDepth, cardSizes, counterShapes, gap = 2 } = options;

  // Calculate layer height first
  const layerHeight = calculateLayerHeight(layer, { cardSizes, counterShapes });

  // If manual layout exists, use it
  if (layer.manualLayout) {
    return arrangeLayerManual(layer, layerHeight, options);
  }

  // Auto-arrange using bin packing
  return arrangeLayerAuto(layer, layerHeight, options);
}

/**
 * Arrange layer contents using manual placements
 */
function arrangeLayerManual(
  layer: Layer,
  layerHeight: number,
  options: {
    gameContainerWidth: number;
    gameContainerDepth: number;
    cardSizes: CardSize[];
    counterShapes: CounterShape[];
  }
): LayerArrangement {
  const { cardSizes, counterShapes } = options;
  const boxPlacements: BoxPlacement[] = [];
  const looseTrayPlacements: LooseTrayPlacement[] = [];

  // Place boxes from manual layout
  if (layer.manualLayout?.boxes) {
    for (const manual of layer.manualLayout.boxes) {
      const box = layer.boxes.find((b) => b.id === manual.boxId);
      if (!box) continue;

      const dims = getBoxDimensions(box, cardSizes, counterShapes);
      // Apply rotation: 90° and 270° swap width/depth
      // Use layerHeight for consistent layer stacking
      const swapDims = manual.rotation === 90 || manual.rotation === 270;
      const effectiveDims: BoxDimensions = swapDims
        ? { width: dims.depth, depth: dims.width, height: layerHeight }
        : { width: dims.width, depth: dims.depth, height: layerHeight };

      boxPlacements.push({
        box,
        dimensions: effectiveDims,
        x: manual.x,
        y: manual.y,
        rotation: manual.rotation
      });
    }
  }

  // Place loose trays from manual layout
  if (layer.manualLayout?.looseTrays) {
    for (const manual of layer.manualLayout.looseTrays) {
      const tray = layer.looseTrays.find((t) => t.id === manual.trayId);
      if (!tray) continue;

      const dims = getTrayDimensionsForTray(tray, cardSizes, counterShapes);
      // Apply rotation: 90° and 270° swap width/depth
      const swapDims = manual.rotation === 90 || manual.rotation === 270;
      const effectiveDims = swapDims
        ? { width: dims.depth, depth: dims.width, height: layerHeight }
        : { width: dims.width, depth: dims.depth, height: layerHeight };

      looseTrayPlacements.push({
        tray,
        dimensions: effectiveDims,
        x: manual.x,
        y: manual.y,
        rotation: manual.rotation
      });
    }
  }

  // Add any items not in manual layout using auto-arrangement
  const manualBoxIds = new Set(layer.manualLayout?.boxes?.map((m) => m.boxId) || []);
  const manualTrayIds = new Set(layer.manualLayout?.looseTrays?.map((m) => m.trayId) || []);

  const unplacedBoxes = layer.boxes.filter((b) => !manualBoxIds.has(b.id));
  const unplacedTrays = layer.looseTrays.filter((t) => !manualTrayIds.has(t.id));

  if (unplacedBoxes.length > 0 || unplacedTrays.length > 0) {
    // Find max Y of placed items
    let maxY = 0;
    for (const p of boxPlacements) {
      maxY = Math.max(maxY, p.y + p.dimensions.depth);
    }
    for (const p of looseTrayPlacements) {
      maxY = Math.max(maxY, p.y + p.dimensions.depth);
    }

    // Auto-arrange remaining items
    const tempLayer: Layer = {
      ...layer,
      boxes: unplacedBoxes,
      looseTrays: unplacedTrays,
      manualLayout: undefined
    };
    const autoArrangement = arrangeLayerAuto(tempLayer, layerHeight, options);

    // Offset and add to placements
    for (const p of autoArrangement.boxes) {
      boxPlacements.push({
        ...p,
        y: p.y + maxY
      });
    }
    for (const p of autoArrangement.looseTrays) {
      looseTrayPlacements.push({
        ...p,
        y: p.y + maxY
      });
    }
  }

  // Calculate total dimensions
  let totalWidth = 0;
  let totalDepth = 0;
  for (const p of boxPlacements) {
    totalWidth = Math.max(totalWidth, p.x + p.dimensions.width);
    totalDepth = Math.max(totalDepth, p.y + p.dimensions.depth);
  }
  for (const p of looseTrayPlacements) {
    totalWidth = Math.max(totalWidth, p.x + p.dimensions.width);
    totalDepth = Math.max(totalDepth, p.y + p.dimensions.depth);
  }

  return {
    boxes: boxPlacements,
    looseTrays: looseTrayPlacements,
    layerHeight,
    totalWidth,
    totalDepth
  };
}

// Item data for bin packing
interface LayerItemData {
  itemType: 'box' | 'looseTray';
  item: Box | Tray;
  width: number;  // Original width (without gap)
  depth: number;  // Original depth (without gap)
  height: number;
}

// Extended Rect class to store layer item data
class LayerPackRect extends Rect {
  itemData: LayerItemData;
  originalWidth: number;
  originalHeight: number;

  constructor(itemData: LayerItemData) {
    // Don't add gap to dimensions - pack with exact sizes like box.ts does
    super(0, 0, itemData.width, itemData.depth);
    this.itemData = itemData;
    this.originalWidth = itemData.width;
    this.originalHeight = itemData.depth;
  }
}

/**
 * Auto-arrange layer contents using bin packing
 */
function arrangeLayerAuto(
  layer: Layer,
  layerHeight: number,
  options: {
    gameContainerWidth: number;
    gameContainerDepth: number;
    cardSizes: CardSize[];
    counterShapes: CounterShape[];
    gap?: number;
  }
): LayerArrangement {
  const { gameContainerWidth, gameContainerDepth, cardSizes, counterShapes, gap = 2 } = options;

  if (layer.boxes.length === 0 && layer.looseTrays.length === 0) {
    return {
      boxes: [],
      looseTrays: [],
      layerHeight: 0,
      totalWidth: 0,
      totalDepth: 0
    };
  }

  // Collect all items with their dimensions
  const itemsData: LayerItemData[] = [];

  // Add boxes
  for (const box of layer.boxes) {
    const dims = getBoxDimensions(box, cardSizes, counterShapes);
    itemsData.push({
      itemType: 'box',
      item: box,
      width: dims.width,
      depth: dims.depth,
      height: dims.height
    });
  }

  // Add loose trays
  for (const tray of layer.looseTrays) {
    const dims = getTrayDimensionsForTray(tray, cardSizes, counterShapes);
    itemsData.push({
      itemType: 'looseTray',
      item: tray,
      width: dims.width,
      depth: dims.depth,
      height: dims.height
    });
  }

  // Sort by area (largest first) for better packing
  itemsData.sort((a, b) => (b.width * b.depth) - (a.width * a.depth));

  // Try packing with specific heuristics (matches box.ts approach)
  const tryPacking = (
    allowFlip: boolean,
    rectChoice: number,
    splitMethod: number
  ): { boxes: BoxPlacement[]; looseTrays: LooseTrayPlacement[] } | null => {
    const packer = new GuillotineBinPack<LayerPackRect>(gameContainerWidth, gameContainerDepth, allowFlip);

    // Create fresh rect objects for each attempt
    const rects = itemsData.map((data) => new LayerPackRect(data));

    // Insert all rectangles
    packer.InsertSizes(rects, true, rectChoice, splitMethod);

    // Check if all were placed
    if (packer.usedRectangles.length !== itemsData.length) return null;

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
    if (maxX > gameContainerWidth || maxY > gameContainerDepth) return null;

    // Build placements
    const boxPlacements: BoxPlacement[] = [];
    const looseTrayPlacements: LooseTrayPlacement[] = [];

    for (const rect of packer.usedRectangles) {
      const data = (rect as LayerPackRect).itemData;
      const originalWidth = (rect as LayerPackRect).originalWidth;
      const originalHeight = (rect as LayerPackRect).originalHeight;

      const wasRotated =
        Math.abs(rect.width - originalHeight) < 0.01 &&
        Math.abs(rect.height - originalWidth) < 0.01;

      if (data.itemType === 'box') {
        const box = data.item as Box;
        boxPlacements.push({
          box,
          dimensions: wasRotated
            ? { width: data.depth, depth: data.width, height: layerHeight }
            : { width: data.width, depth: data.depth, height: layerHeight },
          x: rect.x,
          y: rect.y,
          rotation: wasRotated ? 90 : 0
        });
      } else {
        const tray = data.item as Tray;
        looseTrayPlacements.push({
          tray,
          dimensions: wasRotated
            ? { width: data.depth, depth: data.width, height: layerHeight }
            : { width: data.width, depth: data.depth, height: layerHeight },
          x: rect.x,
          y: rect.y,
          rotation: wasRotated ? 90 : 0
        });
      }
    }

    return { boxes: boxPlacements, looseTrays: looseTrayPlacements };
  };

  // Try combinations of heuristics (same as box.ts)
  // RectChoice: 0=BestAreaFit, 1=BestShortSideFit, 2=BestLongSideFit
  // SplitMethod: 0-5 (all useful variants)
  const rectChoices = [0, 1, 2];
  const splitMethods = [0, 1, 2, 3, 4, 5];

  interface PackResult {
    boxes: BoxPlacement[];
    looseTrays: LooseTrayPlacement[];
    area: number;
  }

  const results: PackResult[] = [];

  for (const allowFlip of [true, false]) {
    for (const rectChoice of rectChoices) {
      for (const splitMethod of splitMethods) {
        const result = tryPacking(allowFlip, rectChoice, splitMethod);
        if (result) {
          let maxX = 0;
          let maxY = 0;
          for (const p of [...result.boxes, ...result.looseTrays]) {
            maxX = Math.max(maxX, p.x + p.dimensions.width);
            maxY = Math.max(maxY, p.y + p.dimensions.depth);
          }
          results.push({ ...result, area: maxX * maxY });
        }
      }
    }
  }

  // If we found valid results, return the most compact one
  if (results.length > 0) {
    results.sort((a, b) => a.area - b.area);
    const best = results[0];

    // Calculate total dimensions
    let totalWidth = 0;
    let totalDepth = 0;
    for (const p of [...best.boxes, ...best.looseTrays]) {
      totalWidth = Math.max(totalWidth, p.x + p.dimensions.width);
      totalDepth = Math.max(totalDepth, p.y + p.dimensions.depth);
    }

    return {
      boxes: best.boxes,
      looseTrays: best.looseTrays,
      layerHeight,
      totalWidth,
      totalDepth
    };
  }

  // Fallback: stack vertically (items don't fit within constraints)
  const boxPlacements: BoxPlacement[] = [];
  const looseTrayPlacements: LooseTrayPlacement[] = [];
  let y = 0;

  for (const data of itemsData) {
    if (data.itemType === 'box') {
      boxPlacements.push({
        box: data.item as Box,
        dimensions: { width: data.width, depth: data.depth, height: layerHeight },
        x: 0,
        y,
        rotation: 0
      });
    } else {
      looseTrayPlacements.push({
        tray: data.item as Tray,
        dimensions: { width: data.width, depth: data.depth, height: layerHeight },
        x: 0,
        y,
        rotation: 0
      });
    }
    y += data.depth;
  }

  // Calculate total dimensions
  let totalWidth = 0;
  let totalDepth = 0;
  for (const p of boxPlacements) {
    totalWidth = Math.max(totalWidth, p.x + p.dimensions.width);
    totalDepth = Math.max(totalDepth, p.y + p.dimensions.depth);
  }
  for (const p of looseTrayPlacements) {
    totalWidth = Math.max(totalWidth, p.x + p.dimensions.width);
    totalDepth = Math.max(totalDepth, p.y + p.dimensions.depth);
  }

  return {
    boxes: boxPlacements,
    looseTrays: looseTrayPlacements,
    layerHeight,
    totalWidth,
    totalDepth
  };
}

/**
 * Convert layer arrangement to manual placements for saving
 */
export function arrangementToManualPlacements(arrangement: LayerArrangement): {
  boxes: ManualBoxPlacement[];
  looseTrays: ManualLooseTrayPlacement[];
} {
  const boxes: ManualBoxPlacement[] = arrangement.boxes.map((p) => ({
    boxId: p.box.id,
    x: p.x,
    y: p.y,
    rotation: p.rotation
  }));

  const looseTrays: ManualLooseTrayPlacement[] = arrangement.looseTrays.map((p) => ({
    trayId: p.tray.id,
    x: p.x,
    y: p.y,
    rotation: p.rotation
  }));

  return { boxes, looseTrays };
}
