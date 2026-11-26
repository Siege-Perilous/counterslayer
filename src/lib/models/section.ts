/**
 * Section model - handles arrangement and height calculation for sections
 * A section contains boxes (with trays inside) and loose trays (not in boxes)
 */

import type {
  Box,
  CardSize,
  CounterShape,
  ManualBoxPlacement,
  ManualLooseTrayPlacement,
  Section,
  Standee,
  Tray
} from '#lib/types/project.js';
import { packItems, stackItemsVertically, type PackingItem } from '#lib/utils/binPacking.js';
import { getBoxExteriorDimensions, getSharedTrayHeight, getTrayDimensionsForTray } from './box';

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

export interface SectionArrangement {
  boxes: BoxPlacement[];
  looseTrays: LooseTrayPlacement[];
  sectionHeight: number;
  totalWidth: number;
  totalDepth: number;
}

/**
 * Calculate the height of a section
 * Section height = max of all box exterior heights and all loose tray content heights
 */
export function calculateSectionHeight(
  section: Section,
  options: {
    cardSizes: CardSize[];
    counterShapes: CounterShape[];
    standees?: Standee[];
  }
): number {
  const { cardSizes, counterShapes, standees = [] } = options;

  // Get all box exterior heights
  const boxHeights = section.boxes.map((box) => {
    const dims = getBoxExteriorDimensions(box, cardSizes, counterShapes, standees);
    return dims.height;
  });

  // Get all loose tray content heights (minimum required height)
  const looseTrayHeights = section.looseTrays.map((tray) => ({
    tray,
    height: getTrayDimensionsForTray(tray, cardSizes, counterShapes, standees).height
  }));

  // Section height = max of all items; auto-height trays follow the rest instead of setting it
  return getSharedTrayHeight(looseTrayHeights, boxHeights);
}

/**
 * Get dimensions of a box's exterior (including walls, floor, lid)
 * This is used for section-level arrangement
 */
export function getBoxDimensions(
  box: Box,
  cardSizes: CardSize[],
  counterShapes: CounterShape[],
  standees: Standee[] = []
): BoxDimensions {
  return getBoxExteriorDimensions(box, cardSizes, counterShapes, standees);
}

/**
 * Arrange boxes and loose trays within a section
 * Uses bin-packing similar to arrangeTrays but at the section level
 */
export function arrangeSectionContents(
  section: Section,
  options: {
    gameContainerWidth: number;
    gameContainerDepth: number;
    cardSizes: CardSize[];
    counterShapes: CounterShape[];
    standees?: Standee[];
    gap?: number;
  }
): SectionArrangement {
  const { cardSizes, counterShapes, standees = [] } = options;

  // Calculate section height first
  const sectionHeight = calculateSectionHeight(section, { cardSizes, counterShapes, standees });

  // If manual layout exists, use it
  if (section.manualLayout) {
    return arrangeSectionManual(section, sectionHeight, options);
  }

  // Auto-arrange using bin packing
  return arrangeSectionAuto(section, sectionHeight, options);
}

/**
 * Arrange section contents using manual placements
 */
function arrangeSectionManual(
  section: Section,
  sectionHeight: number,
  options: {
    gameContainerWidth: number;
    gameContainerDepth: number;
    cardSizes: CardSize[];
    counterShapes: CounterShape[];
    standees?: Standee[];
  }
): SectionArrangement {
  const { cardSizes, counterShapes, standees = [] } = options;
  const boxPlacements: BoxPlacement[] = [];
  const looseTrayPlacements: LooseTrayPlacement[] = [];

  // Place boxes from manual layout
  if (section.manualLayout?.boxes) {
    for (const manual of section.manualLayout.boxes) {
      const box = section.boxes.find((b) => b.id === manual.boxId);
      if (!box) continue;

      const dims = getBoxDimensions(box, cardSizes, counterShapes, standees);
      // Apply rotation: 90° and 270° swap width/depth
      // Use sectionHeight for consistent section stacking
      const swapDims = manual.rotation === 90 || manual.rotation === 270;
      const effectiveDims: BoxDimensions = swapDims
        ? { width: dims.depth, depth: dims.width, height: sectionHeight }
        : { width: dims.width, depth: dims.depth, height: sectionHeight };

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
  if (section.manualLayout?.looseTrays) {
    for (const manual of section.manualLayout.looseTrays) {
      const tray = section.looseTrays.find((t) => t.id === manual.trayId);
      if (!tray) continue;

      const dims = getTrayDimensionsForTray(tray, cardSizes, counterShapes, standees);
      // Apply rotation: 90° and 270° swap width/depth
      const swapDims = manual.rotation === 90 || manual.rotation === 270;
      const effectiveDims = swapDims
        ? { width: dims.depth, depth: dims.width, height: sectionHeight }
        : { width: dims.width, depth: dims.depth, height: sectionHeight };

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
  const manualBoxIds = new Set(section.manualLayout?.boxes?.map((m) => m.boxId) || []);
  const manualTrayIds = new Set(section.manualLayout?.looseTrays?.map((m) => m.trayId) || []);

  const unplacedBoxes = section.boxes.filter((b) => !manualBoxIds.has(b.id));
  const unplacedTrays = section.looseTrays.filter((t) => !manualTrayIds.has(t.id));

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
    const tempSection: Section = {
      ...section,
      boxes: unplacedBoxes,
      looseTrays: unplacedTrays,
      manualLayout: undefined
    };
    const autoArrangement = arrangeSectionAuto(tempSection, sectionHeight, options);

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
    sectionHeight,
    totalWidth,
    totalDepth
  };
}

// Item data for section bin packing
interface SectionItemData {
  itemType: 'box' | 'looseTray';
  item: Box | Tray;
  originalWidth: number;
  originalDepth: number;
}

/**
 * Auto-arrange section contents using shared bin packing utility
 */
function arrangeSectionAuto(
  section: Section,
  sectionHeight: number,
  options: {
    gameContainerWidth: number;
    gameContainerDepth: number;
    cardSizes: CardSize[];
    counterShapes: CounterShape[];
    standees?: Standee[];
  }
): SectionArrangement {
  const { gameContainerWidth, gameContainerDepth, cardSizes, counterShapes, standees = [] } = options;

  if (section.boxes.length === 0 && section.looseTrays.length === 0) {
    return {
      boxes: [],
      looseTrays: [],
      sectionHeight: 0,
      totalWidth: 0,
      totalDepth: 0
    };
  }

  // Collect all items with their dimensions
  const packingItems: PackingItem<SectionItemData>[] = [];

  // Add boxes
  for (const box of section.boxes) {
    const dims = getBoxDimensions(box, cardSizes, counterShapes, standees);
    packingItems.push({
      data: { itemType: 'box', item: box, originalWidth: dims.width, originalDepth: dims.depth },
      width: dims.width,
      depth: dims.depth
    });
  }

  // Add loose trays
  for (const tray of section.looseTrays) {
    const dims = getTrayDimensionsForTray(tray, cardSizes, counterShapes, standees);
    packingItems.push({
      data: { itemType: 'looseTray', item: tray, originalWidth: dims.width, originalDepth: dims.depth },
      width: dims.width,
      depth: dims.depth
    });
  }

  // Try bin packing
  const packResult = packItems(packingItems, gameContainerWidth, gameContainerDepth);

  // Convert packing result to section placements
  const convertToPlacement = (result: typeof packResult) => {
    if (!result) return null;

    const boxPlacements: BoxPlacement[] = [];
    const looseTrayPlacements: LooseTrayPlacement[] = [];

    for (const packed of result.items) {
      const { data, x, y, width, depth, rotated } = packed;

      if (data.itemType === 'box') {
        boxPlacements.push({
          box: data.item as Box,
          dimensions: { width, depth, height: sectionHeight },
          x,
          y,
          rotation: rotated ? 90 : 0
        });
      } else {
        looseTrayPlacements.push({
          tray: data.item as Tray,
          dimensions: { width, depth, height: sectionHeight },
          x,
          y,
          rotation: rotated ? 90 : 0
        });
      }
    }

    return {
      boxes: boxPlacements,
      looseTrays: looseTrayPlacements,
      sectionHeight,
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
      sectionHeight,
      totalWidth: 0,
      totalDepth: 0
    }
  );
}

/**
 * Convert section arrangement to manual placements for saving
 */
export function arrangementToManualPlacements(arrangement: SectionArrangement): {
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
