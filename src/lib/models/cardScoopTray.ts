import type { CellId, CardScoopLayout, LegacyCardScoopLayout } from '$lib/types/cardScoopLayout';
import {
  generateCellId,
  getAllCellIds,
  getGridDimensions,
  createDefaultCardScoopLayout,
  ensureGridLayout,
  isLegacyLayout
} from '$lib/types/cardScoopLayout';
import type { CardSize } from '$lib/types/project';
import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';

const { cuboid, cylinder } = jscad.primitives;
const { subtract, union } = jscad.booleans;
const { translate, mirrorY, scale } = jscad.transforms;
const { vectorText } = jscad.text;
const { path2 } = jscad.geometries;
const { expand } = jscad.expansions;
const { extrudeLinear } = jscad.extrusions;

// Card scoop stack definition - links a cell to a card size and count
export interface CardScoopStack {
  id: string; // Unique stack ID
  cellId: CellId; // Links to cell in layout grid
  cardSizeId: string; // Reference to project.cardSizes[]
  count: number; // Number of cards in stack
  rotation: 0 | 90; // Card rotation in degrees (0 = card length along Y, 90 = card length along X)
}

// Card scoop tray parameters
export interface CardScoopTrayParams {
  layout: CardScoopLayout | LegacyCardScoopLayout; // Grid-based layout (or legacy tree for migration)
  stacks: CardScoopStack[]; // Stack definitions per cell
  trayWidthOverride: number | null; // null = auto from cards
  trayDepthOverride: number | null; // null = auto from cards
  wallThickness: number;
  floorThickness: number;
  clearance: number; // Clearance around cards
  rimHeight: number; // Height above card stacks
}

// Default parameters
export const defaultCardScoopTrayParams: CardScoopTrayParams = {
  layout: createDefaultCardScoopLayout(),
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
  const layout = createDefaultCardScoopLayout();
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
  row: number; // Row index (0-based)
  col: number; // Column index (0-based)
  x: number; // Left edge in mm (relative to tray origin)
  y: number; // Front edge in mm
  width: number; // Cell width in mm
  depth: number; // Cell depth in mm
}

// Cell position data for visualization
export interface CardScoopCellPosition {
  id: CellId;
  refNumber: number; // 1-based reference number
  row: number; // Row index
  col: number; // Column index
  x: number; // Left edge X position
  y: number; // Front edge Y position
  z: number; // Bottom Z position
  width: number; // Cell width
  depth: number; // Cell depth
  height: number; // Cell cavity height
  cardSizeName?: string; // Card size name if stack assigned
  count?: number; // Card count if stack assigned
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

// Grid size info
export interface GridSizeInfo {
  columnWidths: number[]; // Width of each column (mm)
  rowDepths: number[]; // Depth of each row (mm)
  totalWidth: number; // Total interior width (mm)
  totalDepth: number; // Total interior depth (mm)
}

// Calculate grid dimensions based on actual card sizes in each cell
// Each column width = max(effective width of all cards in that column) + clearance*2
// Each row depth = max(effective depth of all cards in that row) + clearance*2
export function computeGridSizes(
  layout: CardScoopLayout | LegacyCardScoopLayout,
  stacks: CardScoopStack[],
  cardSizes: CardSize[],
  clearance: number,
  wallThickness: number
): GridSizeInfo {
  // Ensure we have a grid layout
  const gridLayout = ensureGridLayout(layout);
  const { numRows, numCols } = getGridDimensions(gridLayout);

  // Default card dimensions if no stack or card size found
  const defaultCardWidth = 63.5;
  const defaultCardLength = 88.9;

  // Initialize arrays to track max dimensions per column/row
  const columnWidths: number[] = new Array(numCols).fill(0);
  const rowDepths: number[] = new Array(numRows).fill(0);

  // Iterate through all cells to find max dimensions
  for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < numCols; col++) {
      const cellId = gridLayout.cells[row][col];
      const stack = stacks.find((s) => s.cellId === cellId);

      let effectiveWidth = defaultCardWidth;
      let effectiveDepth = defaultCardLength;

      if (stack) {
        const cardSize = getCardSize(cardSizes, stack.cardSizeId);
        if (cardSize) {
          const dims = getEffectiveCardDimensions(cardSize, stack.rotation ?? 0);
          effectiveWidth = dims.effectiveWidth;
          effectiveDepth = dims.effectiveDepth;
        }
      }

      // Cell size = card dimensions + clearance on each side
      const cellWidth = effectiveWidth + clearance * 2;
      const cellDepth = effectiveDepth + clearance * 2;

      // Update max for this column/row
      columnWidths[col] = Math.max(columnWidths[col], cellWidth);
      rowDepths[row] = Math.max(rowDepths[row], cellDepth);
    }
  }

  // Calculate totals (including walls between cells)
  const totalWidth =
    columnWidths.reduce((sum, w) => sum + w, 0) + (numCols > 1 ? (numCols - 1) * wallThickness : 0);
  const totalDepth = rowDepths.reduce((sum, d) => sum + d, 0) + (numRows > 1 ? (numRows - 1) * wallThickness : 0);

  return {
    columnWidths,
    rowDepths,
    totalWidth,
    totalDepth
  };
}

// Compute cell positions from grid layout
export function computeCellPositions(
  layout: CardScoopLayout | LegacyCardScoopLayout,
  stacks: CardScoopStack[],
  cardSizes: CardSize[],
  wallThickness: number,
  clearance: number
): ComputedCell[] {
  const cells: ComputedCell[] = [];
  // Ensure we have a grid layout
  const gridLayout = ensureGridLayout(layout);
  const { numRows, numCols } = getGridDimensions(gridLayout);
  const gridSizes = computeGridSizes(gridLayout, stacks, cardSizes, clearance, wallThickness);

  // Calculate cumulative positions for each column and row
  const columnX: number[] = [wallThickness]; // Start after outer wall
  for (let col = 1; col < numCols; col++) {
    columnX[col] = columnX[col - 1] + gridSizes.columnWidths[col - 1] + wallThickness;
  }

  const rowY: number[] = [wallThickness]; // Start after outer wall
  for (let row = 1; row < numRows; row++) {
    rowY[row] = rowY[row - 1] + gridSizes.rowDepths[row - 1] + wallThickness;
  }

  // Create computed cells
  for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < numCols; col++) {
      const cellId = gridLayout.cells[row][col];
      cells.push({
        id: cellId,
        row,
        col,
        x: columnX[col],
        y: rowY[row],
        width: gridSizes.columnWidths[col],
        depth: gridSizes.rowDepths[row]
      });
    }
  }

  return cells;
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
  const { stacks, wallThickness, floorThickness, clearance, rimHeight, trayWidthOverride, trayDepthOverride } = params;

  // Ensure we have a grid layout
  const layout = ensureGridLayout(params.layout);

  // Compute grid sizes based on card dimensions
  const gridSizes = computeGridSizes(layout, stacks, cardSizes, clearance, wallThickness);

  // Auto dimensions: interior (computed from cards) + outer walls
  const autoWidth = gridSizes.totalWidth + 2 * wallThickness;
  const autoDepth = gridSizes.totalDepth + 2 * wallThickness;

  // Calculate max stack height
  let maxStackHeight = 0;
  for (const stack of stacks) {
    const cardSize = getCardSize(cardSizes, stack.cardSizeId);
    if (cardSize) {
      const stackHeight = stack.count * cardSize.thickness;
      maxStackHeight = Math.max(maxStackHeight, stackHeight);
    }
  }

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

  // Ensure we have a grid layout
  const layout = ensureGridLayout(params.layout);

  const computedCells = computeCellPositions(layout, params.stacks, cardSizes, params.wallThickness, params.clearance);

  const cellIds = getAllCellIds(layout);

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
      row: cell.row,
      col: cell.col,
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

  // Ensure we have a grid layout
  const layout = ensureGridLayout(params.layout);

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
  const computedCells = computeCellPositions(layout, params.stacks, cardSizes, wallThickness, clearance);

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

    // Hard-edged cutout for cards (no rounded corners)
    const cellCavity = translate(
      [centerX, centerY, cellFloorZ + cavityHeight / 2],
      cuboid({
        size: [cavityWidth, cavityDepth, cavityHeight],
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
  layout: CardScoopLayout | LegacyCardScoopLayout,
  defaultCardSizeId?: string
): CardScoopStack[] {
  // Ensure we have a grid layout for getting cell IDs
  const gridLayout = ensureGridLayout(layout);
  const validCellIds = getAllCellIds(gridLayout);
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

// Re-export for convenience
export { ensureGridLayout, isLegacyLayout };
