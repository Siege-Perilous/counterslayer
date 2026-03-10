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
import { packItems, stackItemsVertically, type PackingItem } from '$lib/utils/binPacking';
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
export function getBoxDimensions(box: Box, cardSizes: CardSize[], counterShapes: CounterShape[]): BoxDimensions {
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
  const { cardSizes, counterShapes } = options;

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

// Item data for layer bin packing
interface LayerItemData {
  itemType: 'box' | 'looseTray';
  item: Box | Tray;
  originalWidth: number;
  originalDepth: number;
}

/**
 * Auto-arrange layer contents using shared bin packing utility
 */
function arrangeLayerAuto(
  layer: Layer,
  layerHeight: number,
  options: {
    gameContainerWidth: number;
    gameContainerDepth: number;
    cardSizes: CardSize[];
    counterShapes: CounterShape[];
  }
): LayerArrangement {
  const { gameContainerWidth, gameContainerDepth, cardSizes, counterShapes } = options;

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
  const packingItems: PackingItem<LayerItemData>[] = [];

  // Add boxes
  for (const box of layer.boxes) {
    const dims = getBoxDimensions(box, cardSizes, counterShapes);
    packingItems.push({
      data: { itemType: 'box', item: box, originalWidth: dims.width, originalDepth: dims.depth },
      width: dims.width,
      depth: dims.depth
    });
  }

  // Add loose trays
  for (const tray of layer.looseTrays) {
    const dims = getTrayDimensionsForTray(tray, cardSizes, counterShapes);
    packingItems.push({
      data: { itemType: 'looseTray', item: tray, originalWidth: dims.width, originalDepth: dims.depth },
      width: dims.width,
      depth: dims.depth
    });
  }

  // Try bin packing
  const packResult = packItems(packingItems, gameContainerWidth, gameContainerDepth);

  // Convert packing result to layer placements
  const convertToPlacement = (result: typeof packResult) => {
    if (!result) return null;

    const boxPlacements: BoxPlacement[] = [];
    const looseTrayPlacements: LooseTrayPlacement[] = [];

    for (const packed of result.items) {
      const { data, x, y, width, depth, rotated } = packed;

      if (data.itemType === 'box') {
        boxPlacements.push({
          box: data.item as Box,
          dimensions: { width, depth, height: layerHeight },
          x,
          y,
          rotation: rotated ? 90 : 0
        });
      } else {
        looseTrayPlacements.push({
          tray: data.item as Tray,
          dimensions: { width, depth, height: layerHeight },
          x,
          y,
          rotation: rotated ? 90 : 0
        });
      }
    }

    return {
      boxes: boxPlacements,
      looseTrays: looseTrayPlacements,
      layerHeight,
      totalWidth: result.totalWidth,
      totalDepth: result.totalDepth
    };
  };

  // Use packing result if successful
  const placement = convertToPlacement(packResult);
  if (placement) return placement;

  // Fallback: stack vertically
  const fallback = stackItemsVertically(packingItems);
  const fallbackPlacement = convertToPlacement(fallback);
  return (
    fallbackPlacement || {
      boxes: [],
      looseTrays: [],
      layerHeight,
      totalWidth: 0,
      totalDepth: 0
    }
  );
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
