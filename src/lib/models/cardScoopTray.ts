import type { CellId, CardScoopLayout, CardScoopLayoutNode } from '$lib/types/cardScoopLayout';
import { generateCellId, isCellLeaf, isCellSplit, getAllCellIds } from '$lib/types/cardScoopLayout';
import type { CardSize } from '$lib/types/project';
import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';

const { cuboid, roundedCuboid, cylinder } = jscad.primitives;
const { subtract, union } = jscad.booleans;
const { translate, mirrorY, scale } = jscad.transforms;
const { vectorText } = jscad.text;
const { path2 } = jscad.geometries;
const { expand } = jscad.expansions;
const { extrudeLinear } = jscad.extrusions;

// Card scoop stack definition - links a cell to a card size and count
export interface CardScoopStack {
  id: string; // Unique stack ID
  cellId: CellId; // Links to cell in layout tree
  cardSizeId: string; // Reference to project.cardSizes[]
  count: number; // Number of cards in stack
  rotation: 0 | 90; // Card rotation in degrees (0 = card length along Y, 90 = card length along X)
}

// Card scoop tray parameters
export interface CardScoopTrayParams {
  layout: CardScoopLayout; // Split-based grid layout tree
  stacks: CardScoopStack[]; // Stack definitions per cell
  trayWidthOverride: number | null; // null = auto from cards
  trayDepthOverride: number | null; // null = auto from cards
  wallThickness: number;
  floorThickness: number;
  clearance: number; // Clearance around cards
  rimHeight: number; // Height above card stacks
}

// Default single cell layout
function createDefaultSingleCellLayout(): CardScoopLayout {
  return {
    root: { type: 'cell', id: generateCellId() }
  };
}

// Default parameters
export const defaultCardScoopTrayParams: CardScoopTrayParams = {
  layout: createDefaultSingleCellLayout(),
  stacks: [],
  trayWidthOverride: null,
  trayDepthOverride: null,
  wallThickness: 2.0,
  floorThickness: 2.0,
  clearance: 1.0,
  rimHeight: 3.0
};

// Create default params with initial stack
export function createDefaultCardScoopTrayParams(): CardScoopTrayParams {
  const layout = createDefaultSingleCellLayout();
  const cellIds = getAllCellIds(layout);
  return {
    ...defaultCardScoopTrayParams,
    layout,
    stacks: [
      {
        id: Math.random().toString(36).substring(2, 9),
        cellId: cellIds[0],
        cardSizeId: '', // Will be set to first available card size
        count: 30,
        rotation: 0
      }
    ]
  };
}

// Computed cell data for positioning
export interface ComputedCell {
  id: CellId;
  x: number; // Left edge in mm (relative to tray interior)
  y: number; // Front edge in mm
  width: number; // Cell width in mm
  depth: number; // Cell depth in mm
}

// Cell position data for visualization
export interface CardScoopCellPosition {
  id: CellId;
  refNumber: number; // 1-based reference number
  x: number; // Left edge X position
  y: number; // Front edge Y position
  z: number; // Bottom Z position
  width: number; // Cell width
  depth: number; // Cell depth
  height: number; // Cell cavity height
  cardSizeName?: string; // Card size name if stack assigned
  count?: number; // Card count if stack assigned
}

// Compute cell positions from layout tree (fixed 0.5 ratio)
export function computeCellPositions(
  layout: CardScoopLayout,
  trayWidth: number,
  trayDepth: number,
  wallThickness: number
): ComputedCell[] {
  const cells: ComputedCell[] = [];

  // Interior bounds (inside outer walls)
  const interiorX = wallThickness;
  const interiorY = wallThickness;
  const interiorWidth = trayWidth - 2 * wallThickness;
  const interiorDepth = trayDepth - 2 * wallThickness;

  function traverseNode(node: CardScoopLayoutNode, x: number, y: number, width: number, depth: number): void {
    if (isCellLeaf(node)) {
      cells.push({
        id: node.id,
        x,
        y,
        width,
        depth
      });
    } else if (isCellSplit(node)) {
      // Split at fixed 0.5 ratio
      const ratio = 0.5;

      if (node.direction === 'vertical') {
        // Left/right split
        const leftWidth = width * ratio - wallThickness / 2;
        const rightWidth = width * (1 - ratio) - wallThickness / 2;
        const rightX = x + leftWidth + wallThickness;

        traverseNode(node.first, x, y, leftWidth, depth);
        traverseNode(node.second, rightX, y, rightWidth, depth);
      } else {
        // Top/bottom split (horizontal)
        const bottomDepth = depth * ratio - wallThickness / 2;
        const topDepth = depth * (1 - ratio) - wallThickness / 2;
        const topY = y + bottomDepth + wallThickness;

        traverseNode(node.first, x, y, width, bottomDepth);
        traverseNode(node.second, x, topY, width, topDepth);
      }
    }
  }

  traverseNode(layout.root, interiorX, interiorY, interiorWidth, interiorDepth);

  return cells;
}

// Helper to get card size by ID
function getCardSize(cardSizes: CardSize[], cardSizeId: string): CardSize | undefined {
  return cardSizes.find((s) => s.id === cardSizeId);
}

// Get effective card dimensions based on rotation
// rotation 0: card width along X, card length along Y
// rotation 90: card length along X, card width along Y
function getEffectiveCardDimensions(
  cardSize: CardSize,
  rotation: 0 | 90
): { effectiveWidth: number; effectiveDepth: number } {
  if (rotation === 90) {
    return { effectiveWidth: cardSize.length, effectiveDepth: cardSize.width };
  }
  return { effectiveWidth: cardSize.width, effectiveDepth: cardSize.length };
}

// Calculate layout factors - how many cells in each direction
// Returns the maximum number of cells along width and depth based on split structure
function getLayoutFactors(layout: CardScoopLayout): { widthFactor: number; depthFactor: number } {
  function traverse(node: CardScoopLayoutNode): { widthFactor: number; depthFactor: number } {
    if (isCellLeaf(node)) {
      return { widthFactor: 1, depthFactor: 1 };
    }
    if (isCellSplit(node)) {
      const first = traverse(node.first);
      const second = traverse(node.second);

      if (node.direction === 'vertical') {
        // Vertical split = cells side by side (adds to width)
        return {
          widthFactor: first.widthFactor + second.widthFactor,
          depthFactor: Math.max(first.depthFactor, second.depthFactor)
        };
      } else {
        // Horizontal split = cells stacked front to back (adds to depth)
        return {
          widthFactor: Math.max(first.widthFactor, second.widthFactor),
          depthFactor: first.depthFactor + second.depthFactor
        };
      }
    }
    return { widthFactor: 1, depthFactor: 1 };
  }

  return traverse(layout.root);
}

// Calculate tray dimensions from parameters and card sizes
export function getCardScoopTrayDimensions(
  params: CardScoopTrayParams,
  cardSizes: CardSize[]
): {
  width: number;
  depth: number;
  height: number;
} {
  const { layout, stacks, wallThickness, floorThickness, clearance, rimHeight, trayWidthOverride, trayDepthOverride } =
    params;

  // Get layout factors to know how many cells in each direction
  const { widthFactor, depthFactor } = getLayoutFactors(layout);

  // Calculate auto dimensions from cards (accounting for rotation)
  let maxEffectiveWidth = 0;
  let maxEffectiveDepth = 0;
  let maxStackHeight = 0;

  for (const stack of stacks) {
    const cardSize = getCardSize(cardSizes, stack.cardSizeId);
    if (cardSize) {
      const { effectiveWidth, effectiveDepth } = getEffectiveCardDimensions(cardSize, stack.rotation ?? 0);
      maxEffectiveWidth = Math.max(maxEffectiveWidth, effectiveWidth);
      maxEffectiveDepth = Math.max(maxEffectiveDepth, effectiveDepth);
      // Stack height = count * thickness (cards lying flat)
      const stackHeight = stack.count * cardSize.thickness;
      maxStackHeight = Math.max(maxStackHeight, stackHeight);
    }
  }

  // Default minimum dimensions if no stacks
  if (maxEffectiveWidth === 0) maxEffectiveWidth = 63.5; // Standard card width
  if (maxEffectiveDepth === 0) maxEffectiveDepth = 88.9; // Standard card length

  // Auto width: (card width + clearance) * number of cells wide + walls between + outer walls
  // For N cells wide: N * (cardWidth + clearance*2) + (N-1) * wallThickness + 2 * wallThickness
  const cellWidth = maxEffectiveWidth + clearance * 2;
  const autoWidth = widthFactor * cellWidth + (widthFactor - 1) * wallThickness + 2 * wallThickness;

  // Auto depth: (card length + clearance) * number of cells deep + walls between + outer walls
  const cellDepth = maxEffectiveDepth + clearance * 2;
  const autoDepth = depthFactor * cellDepth + (depthFactor - 1) * wallThickness + 2 * wallThickness;

  // Height: floor + tallest stack + rim (cards lying flat, so height = count * thickness)
  const height = floorThickness + maxStackHeight + rimHeight;

  return {
    width: trayWidthOverride ?? autoWidth,
    depth: trayDepthOverride ?? autoDepth,
    height: Math.max(height, floorThickness + rimHeight + 10) // Minimum height
  };
}

// Get cell positions for visualization
export function getCardScoopCellPositions(
  params: CardScoopTrayParams,
  cardSizes: CardSize[],
  targetHeight?: number,
  floorSpacerHeight?: number
): CardScoopCellPosition[] {
  const dims = getCardScoopTrayDimensions(params, cardSizes);
  const spacerOffset = floorSpacerHeight ?? 0;
  const trayHeight = targetHeight && targetHeight > dims.height ? targetHeight : dims.height;

  const computedCells = computeCellPositions(params.layout, dims.width, dims.depth, params.wallThickness);

  const cellIds = getAllCellIds(params.layout);

  return computedCells.map((cell) => {
    const refNumber = cellIds.indexOf(cell.id) + 1;
    const stack = params.stacks.find((s) => s.cellId === cell.id);
    const cardSize = stack ? getCardSize(cardSizes, stack.cardSizeId) : undefined;

    // Calculate cell cavity height
    let cavityHeight = trayHeight - params.floorThickness;
    if (stack && cardSize) {
      cavityHeight = stack.count * cardSize.thickness + params.rimHeight;
    }

    return {
      id: cell.id,
      refNumber,
      x: cell.x,
      y: cell.y,
      z: params.floorThickness + spacerOffset,
      width: cell.width,
      depth: cell.depth,
      height: cavityHeight,
      cardSizeName: cardSize?.name,
      count: stack?.count
    };
  });
}

// Create card scoop tray geometry
export function createCardScoopTray(
  params: CardScoopTrayParams,
  cardSizes: CardSize[],
  trayName?: string,
  targetHeight?: number,
  floorSpacerHeight?: number,
  showEmboss: boolean = true
): Geom3 {
  const { wallThickness, floorThickness, clearance } = params;
  const nameLabel = trayName ? `Tray "${trayName}"` : 'Tray';

  const dims = getCardScoopTrayDimensions(params, cardSizes);
  const spacerHeight = floorSpacerHeight ?? 0;
  const trayHeight = (targetHeight && targetHeight > dims.height ? targetHeight : dims.height) + spacerHeight;

  const trayWidth = dims.width;
  const trayDepth = dims.depth;

  // Validate dimensions
  if (trayWidth <= 0 || trayDepth <= 0 || trayHeight <= 0) {
    throw new Error(`${nameLabel}: Invalid tray dimensions.`);
  }

  // Create tray body
  const trayBody = cuboid({
    size: [trayWidth, trayDepth, trayHeight],
    center: [trayWidth / 2, trayDepth / 2, trayHeight / 2]
  });

  // Get computed cell positions
  const computedCells = computeCellPositions(params.layout, trayWidth, trayDepth, wallThickness);

  // Create cell cavities and finger holes
  const cellCuts: Geom3[] = [];
  const fingerHoleCuts: Geom3[] = [];
  const cellFloorZ = floorThickness + spacerHeight;

  // Finger hole sizing (similar to counterTray cutout sizing)
  const fingerHoleRatio = 0.35; // Ratio of smaller card dimension
  const fingerHoleMax = 15; // Maximum finger hole radius

  for (const cell of computedCells) {
    // Get stack for this cell to determine cavity dimensions
    const stack = params.stacks.find((s) => s.cellId === cell.id);
    const cardSize = stack ? getCardSize(cardSizes, stack.cardSizeId) : undefined;

    // Calculate cavity dimensions
    // Use actual card dimensions + clearance (with rotation), or full cell if no stack
    let cavityWidth = cell.width;
    let cavityDepth = cell.depth;

    if (stack && cardSize) {
      // Get effective dimensions based on rotation
      const { effectiveWidth, effectiveDepth } = getEffectiveCardDimensions(cardSize, stack.rotation ?? 0);
      // Use card dimensions + clearance, but don't exceed cell bounds
      cavityWidth = Math.min(cell.width, effectiveWidth + clearance * 2);
      cavityDepth = Math.min(cell.depth, effectiveDepth + clearance * 2);
    }

    const cavityHeight = trayHeight - cellFloorZ + 1; // Extend above top

    const centerX = cell.x + cell.width / 2;
    const centerY = cell.y + cell.depth / 2;

    // Simple rounded cutout for the cell
    const cornerRadius = Math.min(2, cavityWidth / 4, cavityDepth / 4);

    const cellCavity = translate(
      [centerX, centerY, cellFloorZ + cavityHeight / 2],
      roundedCuboid({
        size: [cavityWidth, cavityDepth, cavityHeight],
        roundRadius: cornerRadius,
        segments: 16,
        center: [0, 0, 0]
      })
    );

    cellCuts.push(cellCavity);

    // Create finger hole in the floor of the cell
    // Size based on smaller dimension of the cavity
    const smallerDimension = Math.min(cavityWidth, cavityDepth);
    const fingerHoleRadius = Math.min(fingerHoleMax, smallerDimension * fingerHoleRatio);

    // Only create finger hole if there's enough space
    if (fingerHoleRadius >= 5) {
      const fingerHole = translate(
        [centerX, centerY, 0],
        cylinder({
          radius: fingerHoleRadius,
          height: floorThickness + spacerHeight + 2, // Go through the floor
          segments: 32,
          center: [0, 0, (floorThickness + spacerHeight + 2) / 2 - 1]
        })
      );
      fingerHoleCuts.push(fingerHole);
    }
  }

  let result = cellCuts.length > 0 ? subtract(trayBody, ...cellCuts) : trayBody;

  // Subtract finger holes
  if (fingerHoleCuts.length > 0) {
    result = subtract(result, ...fingerHoleCuts);
  }

  // Emboss tray name on bottom (Z=0 face)
  if (showEmboss && trayName && trayName.trim().length > 0) {
    const textDepth = 0.6;
    const strokeWidth = 1.2;
    const textHeightParam = 6;
    const margin = wallThickness * 2;

    const textSegments = vectorText({ height: textHeightParam, align: 'center' }, trayName.trim().toUpperCase());

    if (textSegments.length > 0) {
      const textShapes: ReturnType<typeof extrudeLinear>[] = [];
      for (const segment of textSegments) {
        if (segment.length >= 2) {
          const pathObj = path2.fromPoints({ closed: false }, segment);
          const expanded = expand({ delta: strokeWidth / 2, corners: 'round', segments: 32 }, pathObj);
          const extruded = extrudeLinear({ height: textDepth + 0.1 }, expanded);
          textShapes.push(extruded);
        }
      }

      if (textShapes.length > 0) {
        let minX = Infinity,
          maxX = -Infinity;
        let minY = Infinity,
          maxY = -Infinity;
        for (const segment of textSegments) {
          for (const point of segment) {
            minX = Math.min(minX, point[0]);
            maxX = Math.max(maxX, point[0]);
            minY = Math.min(minY, point[1]);
            maxY = Math.max(maxY, point[1]);
          }
        }
        const textWidthCalc = maxX - minX + strokeWidth;
        const textHeightY = maxY - minY + strokeWidth;

        const availableWidth = trayWidth - margin * 2;
        const availableDepth = trayDepth - margin * 2;
        const scaleX = Math.min(1, availableWidth / textWidthCalc);
        const scaleY = Math.min(1, availableDepth / textHeightY);
        const textScale = Math.min(scaleX, scaleY);

        const centerX = trayWidth / 2;
        const centerY = trayDepth / 2;
        const textCenterX = (minX + maxX) / 2;
        const textCenterY = (minY + maxY) / 2;

        let combinedText = union(...textShapes);
        combinedText = mirrorY(combinedText);

        const positionedText = translate(
          [centerX - textCenterX * textScale, centerY + textCenterY * textScale, -0.1],
          scale([textScale, textScale, 1], combinedText)
        );
        result = subtract(result, positionedText);
      }
    }
  }

  return result;
}

// Sync stacks with layout - remove stacks for deleted cells, add stacks for new cells
export function syncStacksWithLayout(
  stacks: CardScoopStack[],
  layout: CardScoopLayout,
  defaultCardSizeId?: string
): CardScoopStack[] {
  const validCellIds = getAllCellIds(layout);
  const validCellIdSet = new Set(validCellIds);
  const existingCellIds = new Set(stacks.map((s) => s.cellId));

  // Keep existing stacks that still have valid cells
  const keptStacks = stacks.filter((stack) => validCellIdSet.has(stack.cellId));

  // Add new stacks for cells that don't have one
  const newStacks: CardScoopStack[] = [];
  for (const cellId of validCellIds) {
    if (!existingCellIds.has(cellId)) {
      newStacks.push({
        id: Math.random().toString(36).substring(2, 9),
        cellId,
        cardSizeId: defaultCardSizeId ?? '',
        count: 30,
        rotation: 0
      });
    }
  }

  return [...keptStacks, ...newStacks];
}
