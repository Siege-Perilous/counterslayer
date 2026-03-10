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
  originalWidth: number;  // Width passed to Rect (with gap)
  originalHeight: number; // Depth passed to Rect (with gap)

  constructor(itemData: LayerItemData, gap: number) {
    super(0, 0, itemData.width + gap, itemData.depth + gap);
    this.itemData = itemData;
    this.originalWidth = itemData.width + gap;
    this.originalHeight = itemData.depth + gap;
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

  // Create rect objects for packing
  const rects = itemsData.map((data) => new LayerPackRect(data, gap));

  // Create bin packer with game container dimensions, allow flipping
  const packer = new GuillotineBinPack<LayerPackRect>(gameContainerWidth, gameContainerDepth, true);

  // Insert all rectangles using best short side fit heuristic with longer leftover axis split
  // RectBestShortSideFit = 1 - minimizes wasted space on shorter side
  // SplitLongerLeftoverAxis = 1 - keeps better-shaped remaining rectangles
  packer.InsertSizes(rects, true, 1, 1);

  // Build placements from packer results
  const boxPlacements: BoxPlacement[] = [];
  const looseTrayPlacements: LooseTrayPlacement[] = [];

  for (const rect of packer.usedRectangles) {
    const data = rect.itemData;
    // Check if rotated by comparing dimensions
    const wasRotated =
      Math.abs(rect.width - rect.originalHeight) < 0.01 &&
      Math.abs(rect.height - rect.originalWidth) < 0.01;

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

  // Handle any items that weren't placed (fallback - stack vertically)
  const placedIds = new Set([
    ...boxPlacements.map((p) => p.box.id),
    ...looseTrayPlacements.map((p) => p.tray.id)
  ]);

  let fallbackY = 0;
  for (const p of [...boxPlacements, ...looseTrayPlacements]) {
    fallbackY = Math.max(fallbackY, p.y + p.dimensions.depth + gap);
  }

  for (const box of layer.boxes) {
    if (!placedIds.has(box.id)) {
      const dims = getBoxDimensions(box, cardSizes, counterShapes);
      boxPlacements.push({
        box,
        dimensions: { width: dims.width, depth: dims.depth, height: layerHeight },
        x: 0,
        y: fallbackY,
        rotation: 0
      });
      fallbackY += dims.depth + gap;
    }
  }

  for (const tray of layer.looseTrays) {
    if (!placedIds.has(tray.id)) {
      const dims = getTrayDimensionsForTray(tray, cardSizes, counterShapes);
      looseTrayPlacements.push({
        tray,
        dimensions: { width: dims.width, depth: dims.depth, height: layerHeight },
        x: 0,
        y: fallbackY,
        rotation: 0
      });
      fallbackY += dims.depth + gap;
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
