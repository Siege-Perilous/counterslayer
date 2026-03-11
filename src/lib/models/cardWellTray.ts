import type { CardWellLayout, CellId } from '$lib/types/cardWellLayout';
import { createDefaultCardWellLayout, getAllCellIds, getLayoutDimensions } from '$lib/types/cardWellLayout';
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

// Card well stack definition - links a cell to a card size and count
export interface CardWellStack {
  id: string; // Unique stack ID
  cellId: CellId; // Links to cell in layout
  cardSizeId: string; // Reference to project.cardSizes[]
  count: number; // Number of cards in stack
  rotation: 0 | 90; // Card rotation in degrees (0 = card length along Y, 90 = card length along X)
}

// Card well tray parameters
export interface CardWellTrayParams {
  layout: CardWellLayout;
  stacks: CardWellStack[]; // Stack definitions per cell
  trayWidthOverride: number | null; // null = auto from cards
  trayDepthOverride: number | null; // null = auto from cards
  wallThickness: number;
  floorThickness: number;
  clearance: number; // Clearance around cards
  rimHeight: number; // Height above card stacks
}

// Default parameters
export const defaultCardWellTrayParams: CardWellTrayParams = {
  layout: createDefaultCardWellLayout(),
  stacks: [],
  trayWidthOverride: null,
  trayDepthOverride: null,
  wallThickness: 2.0,
  floorThickness: 2.0,
  clearance: 1.0,
  rimHeight: 3.0
};

// Create default params with initial stack
export function createDefaultCardWellTrayParams(): CardWellTrayParams {
  const layout = createDefaultCardWellLayout();
  const cellIds = getAllCellIds(layout);
  return {
    ...defaultCardWellTrayParams,
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
  colIndex: number; // Column index (0-based)
  cellIndex: number; // Cell index within column (0-based)
  x: number; // Left edge in mm (relative to tray origin)
  y: number; // Front edge in mm
  width: number; // Cell width in mm
  depth: number; // Cell depth in mm
}

// Cell position data for visualization
export interface CardWellCellPosition {
  id: CellId;
  refNumber: number; // 1-based reference number
  colIndex: number; // Column index
  cellIndex: number; // Cell index within column
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

// Column size info
interface ColumnSizeInfo {
  width: number; // Width of this column (max cell width)
  cellDepths: number[]; // Depth of each cell in this column
  totalDepth: number; // Total depth of cells + walls between them
}

// Layout size info
export interface LayoutSizeInfo {
  columns: ColumnSizeInfo[];
  totalWidth: number; // Total interior width (sum of column widths + walls)
  maxColumnDepth: number; // Max column depth (determines tray depth)
}

// Calculate layout dimensions based on actual card sizes in each cell
export function computeLayoutSizes(
  layout: CardWellLayout,
  stacks: CardWellStack[],
  cardSizes: CardSize[],
  clearance: number,
  wallThickness: number
): LayoutSizeInfo {
  const { numColumns } = getLayoutDimensions(layout);

  // Default card dimensions if no stack or card size found
  const defaultCardWidth = 63.5;
  const defaultCardLength = 88.9;

  const columns: ColumnSizeInfo[] = [];

  for (let colIndex = 0; colIndex < numColumns; colIndex++) {
    const column = layout.columns[colIndex];
    let maxWidth = 0;
    const cellDepths: number[] = [];

    for (const cellId of column) {
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

      maxWidth = Math.max(maxWidth, cellWidth);
      cellDepths.push(cellDepth);
    }

    // Total depth = sum of cell depths + walls between cells
    const totalDepth =
      cellDepths.reduce((sum, d) => sum + d, 0) + (cellDepths.length > 1 ? (cellDepths.length - 1) * wallThickness : 0);

    columns.push({
      width: maxWidth,
      cellDepths,
      totalDepth
    });
  }

  // Total width = sum of column widths + walls between columns
  const totalWidth =
    columns.reduce((sum, col) => sum + col.width, 0) + (numColumns > 1 ? (numColumns - 1) * wallThickness : 0);

  // Max column depth determines tray depth
  const maxColumnDepth = Math.max(0, ...columns.map((col) => col.totalDepth));

  return {
    columns,
    totalWidth,
    maxColumnDepth
  };
}

// Compute cell positions from column layout with vertical centering
export function computeCellPositions(
  layout: CardWellLayout,
  stacks: CardWellStack[],
  cardSizes: CardSize[],
  wallThickness: number,
  clearance: number
): ComputedCell[] {
  const cells: ComputedCell[] = [];

  const layoutSizes = computeLayoutSizes(layout, stacks, cardSizes, clearance, wallThickness);

  // Calculate X position for each column
  let currentX = wallThickness; // Start after outer wall

  for (let colIndex = 0; colIndex < layout.columns.length; colIndex++) {
    const column = layout.columns[colIndex];
    const columnInfo = layoutSizes.columns[colIndex];

    // Calculate vertical centering offset for this column
    const columnTotalDepth = columnInfo.totalDepth;
    const verticalOffset = (layoutSizes.maxColumnDepth - columnTotalDepth) / 2;

    // Calculate Y position for each cell in the column
    let currentY = wallThickness + verticalOffset; // Start after outer wall + centering offset

    for (let cellIndex = 0; cellIndex < column.length; cellIndex++) {
      const cellId = column[cellIndex];
      const cellDepth = columnInfo.cellDepths[cellIndex];

      cells.push({
        id: cellId,
        colIndex,
        cellIndex,
        x: currentX,
        y: currentY,
        width: columnInfo.width,
        depth: cellDepth
      });

      currentY += cellDepth + wallThickness;
    }

    currentX += columnInfo.width + wallThickness;
  }

  return cells;
}

// Calculate tray dimensions from parameters and card sizes
export function getCardWellTrayDimensions(
  params: CardWellTrayParams,
  cardSizes: CardSize[]
): {
  width: number;
  depth: number;
  height: number;
} {
  const { stacks, wallThickness, floorThickness, clearance, rimHeight, trayWidthOverride, trayDepthOverride } = params;

  // Compute layout sizes based on card dimensions
  const layoutSizes = computeLayoutSizes(params.layout, stacks, cardSizes, clearance, wallThickness);

  // Auto dimensions: interior + outer walls
  const autoWidth = layoutSizes.totalWidth + 2 * wallThickness;
  const autoDepth = layoutSizes.maxColumnDepth + 2 * wallThickness;

  // Calculate max stack height
  let maxStackHeight = 0;
  for (const stack of stacks) {
    const cardSize = getCardSize(cardSizes, stack.cardSizeId);
    if (cardSize) {
      const stackHeight = stack.count * cardSize.thickness;
      maxStackHeight = Math.max(maxStackHeight, stackHeight);
    }
  }

  // Height: floor + tallest stack + rim
  const height = floorThickness + maxStackHeight + rimHeight;

  return {
    width: trayWidthOverride ?? autoWidth,
    depth: trayDepthOverride ?? autoDepth,
    height: Math.max(height, floorThickness + rimHeight + 10) // Minimum height
  };
}

// Get cell positions for visualization
export function getCardWellCellPositions(
  params: CardWellTrayParams,
  cardSizes: CardSize[],
  targetHeight?: number,
  floorSpacerHeight?: number
): CardWellCellPosition[] {
  const dims = getCardWellTrayDimensions(params, cardSizes);
  const spacerOffset = floorSpacerHeight ?? 0;
  const trayHeight = targetHeight && targetHeight > dims.height ? targetHeight : dims.height;

  // When tray height is increased, floor is raised to keep cards at proper level
  const heightIncrease = targetHeight && targetHeight > dims.height ? targetHeight - dims.height : 0;
  const baseFloorZ = params.floorThickness + spacerOffset + heightIncrease;

  const computedCells = computeCellPositions(
    params.layout,
    params.stacks,
    cardSizes,
    params.wallThickness,
    params.clearance
  );

  const cellIds = getAllCellIds(params.layout);

  return computedCells.map((cell) => {
    const refNumber = cellIds.indexOf(cell.id) + 1;
    const stack = params.stacks.find((s) => s.cellId === cell.id);
    const cardSize = stack ? getCardSize(cardSizes, stack.cardSizeId) : undefined;

    // Calculate cell cavity height
    let cavityHeight = trayHeight - baseFloorZ;
    if (stack && cardSize) {
      cavityHeight = stack.count * cardSize.thickness + params.rimHeight;
    }

    return {
      id: cell.id,
      refNumber,
      colIndex: cell.colIndex,
      cellIndex: cell.cellIndex,
      x: cell.x,
      y: cell.y,
      z: baseFloorZ,
      width: cell.width,
      depth: cell.depth,
      height: cavityHeight,
      cardSizeName: cardSize?.name,
      count: stack?.count
    };
  });
}

// Create card well tray geometry
export function createCardWellTray(
  params: CardWellTrayParams,
  cardSizes: CardSize[],
  trayName?: string,
  targetHeight?: number,
  floorSpacerHeight?: number,
  showEmboss: boolean = true
): Geom3 {
  const { wallThickness, floorThickness, clearance } = params;
  const nameLabel = trayName ? `Tray "${trayName}"` : 'Tray';

  const dims = getCardWellTrayDimensions(params, cardSizes);
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
  const computedCells = computeCellPositions(params.layout, params.stacks, cardSizes, wallThickness, clearance);

  // Create cell cavities, finger holes, and wall cutouts
  const cellCuts: Geom3[] = [];
  const fingerHoleCuts: Geom3[] = [];
  const wallCutouts: Geom3[] = [];

  // When tray height is increased (e.g., to match layer height), raise the floor
  // so cards remain at the proper level relative to the top of the tray
  const heightIncrease = targetHeight && targetHeight > dims.height ? targetHeight - dims.height : 0;
  const baseFloorZ = floorThickness + spacerHeight + heightIncrease;

  // Calculate max stack height to normalize floor levels
  let maxStackHeight = 0;
  for (const stack of params.stacks) {
    const cardSize = getCardSize(cardSizes, stack.cardSizeId);
    if (cardSize) {
      const stackHeight = stack.count * cardSize.thickness;
      maxStackHeight = Math.max(maxStackHeight, stackHeight);
    }
  }

  // Finger hole sizing
  const fingerHoleRatio = 0.35;
  const fingerHoleMax = 15;

  for (const cell of computedCells) {
    // Get stack for this cell to determine cavity dimensions
    const stack = params.stacks.find((s) => s.cellId === cell.id);
    const cardSize = stack ? getCardSize(cardSizes, stack.cardSizeId) : undefined;

    // Calculate cavity dimensions
    let cavityWidth = cell.width;
    let cavityDepth = cell.depth;
    let floorRaise = 0; // How much to raise the floor for shorter stacks

    if (stack && cardSize) {
      const { effectiveWidth, effectiveDepth } = getEffectiveCardDimensions(cardSize, stack.rotation ?? 0);
      cavityWidth = Math.min(cell.width, effectiveWidth + clearance * 2);
      cavityDepth = Math.min(cell.depth, effectiveDepth + clearance * 2);

      // Raise floor for shorter stacks so all card tops are at same level
      const thisStackHeight = stack.count * cardSize.thickness;
      floorRaise = maxStackHeight - thisStackHeight;
    }

    const cellFloorZ = baseFloorZ + floorRaise;
    const cavityHeight = trayHeight - cellFloorZ + 1;

    const centerX = cell.x + cell.width / 2;
    const centerY = cell.y + cell.depth / 2;

    // Hard-edged cutout for cards
    const cellCavity = translate(
      [centerX, centerY, cellFloorZ + cavityHeight / 2],
      cuboid({
        size: [cavityWidth, cavityDepth, cavityHeight],
        center: [0, 0, 0]
      })
    );

    cellCuts.push(cellCavity);

    // Create finger hole in the floor
    const smallerDimension = Math.min(cavityWidth, cavityDepth);
    const fingerHoleRadius = Math.min(fingerHoleMax, smallerDimension * fingerHoleRatio);

    if (fingerHoleRadius >= 5) {
      // Finger hole goes through the floor (including any raised floor section)
      const fingerHoleHeight = cellFloorZ + 2;
      const fingerHole = translate(
        [centerX, centerY, 0],
        cylinder({
          radius: fingerHoleRadius,
          height: fingerHoleHeight,
          segments: 32,
          center: [0, 0, fingerHoleHeight / 2 - 1]
        })
      );
      fingerHoleCuts.push(fingerHole);
    }

    // Wall cutouts - only on OUTER walls where the CAVITY actually touches the outer wall
    // The cavity may be smaller than the cell (if cards in same column have different sizes)
    // Interior walls between cells/columns do NOT get cutouts
    if (stack && cardSize) {
      const { effectiveWidth, effectiveDepth } = getEffectiveCardDimensions(cardSize, stack.rotation ?? 0);

      const cutoutHeight = trayHeight - cellFloorZ + 1;
      const cutoutZ = cellFloorZ + cutoutHeight / 2;
      const tolerance = 0.01;

      // Calculate cavity position (cavity is centered within cell)
      const cavityWidthCalc = effectiveWidth + clearance * 2;
      const cavityDepthCalc = effectiveDepth + clearance * 2;
      const cavityOffsetX = (cell.width - cavityWidthCalc) / 2;
      const cavityOffsetY = (cell.depth - cavityDepthCalc) / 2;
      const cavityLeft = cell.x + cavityOffsetX;
      const cavityRight = cavityLeft + cavityWidthCalc;
      const cavityFront = cell.y + cavityOffsetY;
      const cavityBack = cavityFront + cavityDepthCalc;

      // Check if CAVITY touches each outer wall (not just the cell)
      const cavityTouchesLeftWall = Math.abs(cavityLeft - wallThickness) < tolerance;
      const cavityTouchesRightWall = Math.abs(cavityRight + wallThickness - trayWidth) < tolerance;
      const cavityTouchesFrontWall = Math.abs(cavityFront - wallThickness) < tolerance;
      const cavityTouchesBackWall = Math.abs(cavityBack + wallThickness - trayDepth) < tolerance;

      const isFirstColumn = cell.colIndex === 0;
      const isLastColumn = cell.colIndex === params.layout.columns.length - 1;

      // Left outer wall - only if cavity touches the left wall
      if (isFirstColumn && cavityTouchesLeftWall) {
        const cutoutWidth = effectiveDepth / 2; // Half the card depth (Y dimension)
        const leftCutout = translate(
          [wallThickness / 2, centerY, cutoutZ],
          cuboid({
            size: [wallThickness + 2, cutoutWidth, cutoutHeight],
            center: [0, 0, 0]
          })
        );
        wallCutouts.push(leftCutout);
      }

      // Right outer wall - only if cavity touches the right wall
      if (isLastColumn && cavityTouchesRightWall) {
        const cutoutWidth = effectiveDepth / 2;
        const rightCutout = translate(
          [trayWidth - wallThickness / 2, centerY, cutoutZ],
          cuboid({
            size: [wallThickness + 2, cutoutWidth, cutoutHeight],
            center: [0, 0, 0]
          })
        );
        wallCutouts.push(rightCutout);
      }

      // Front outer wall - only if cavity touches the front wall
      if (cavityTouchesFrontWall) {
        const cutoutWidth = effectiveWidth / 2; // Half the card width (X dimension)
        const frontCutout = translate(
          [centerX, wallThickness / 2, cutoutZ],
          cuboid({
            size: [cutoutWidth, wallThickness + 2, cutoutHeight],
            center: [0, 0, 0]
          })
        );
        wallCutouts.push(frontCutout);
      }

      // Back outer wall - only if cavity touches the back wall
      if (cavityTouchesBackWall) {
        const cutoutWidth = effectiveWidth / 2;
        const backCutout = translate(
          [centerX, trayDepth - wallThickness / 2, cutoutZ],
          cuboid({
            size: [cutoutWidth, wallThickness + 2, cutoutHeight],
            center: [0, 0, 0]
          })
        );
        wallCutouts.push(backCutout);
      }
    }
  }

  let result = cellCuts.length > 0 ? subtract(trayBody, ...cellCuts) : trayBody;

  if (fingerHoleCuts.length > 0) {
    result = subtract(result, ...fingerHoleCuts);
  }

  if (wallCutouts.length > 0) {
    result = subtract(result, ...wallCutouts);
  }

  // Emboss tray name on bottom
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

// Card stack position for visualization (flat cards in wells)
export interface CardWellStackPosition {
  x: number; // Center X position
  y: number; // Center Y position
  z: number; // Bottom Z position (on floor)
  width: number; // Card width (after rotation)
  length: number; // Card length (after rotation)
  thickness: number; // Card thickness
  count: number; // Number of cards
  label: string; // Card size name
  // For sleeved card rendering
  innerWidth?: number;
  innerLength?: number;
}

// Get card positions for visualization (preview counters)
export function getCardWellPositions(
  params: CardWellTrayParams,
  cardSizes: CardSize[],
  targetHeight?: number,
  spacerHeight?: number
): CardWellStackPosition[] {
  const dims = getCardWellTrayDimensions(params, cardSizes);
  const spacerOffset = spacerHeight ?? 0;

  // When tray height is increased, floor is raised to keep cards at proper level
  const heightIncrease = targetHeight && targetHeight > dims.height ? targetHeight - dims.height : 0;
  const baseFloorZ = params.floorThickness + spacerOffset + heightIncrease;

  // Calculate max stack height to normalize floor levels (same as in createCardWellTray)
  let maxStackHeight = 0;
  for (const stack of params.stacks) {
    const cardSize = getCardSize(cardSizes, stack.cardSizeId);
    if (cardSize) {
      const stackHeight = stack.count * cardSize.thickness;
      maxStackHeight = Math.max(maxStackHeight, stackHeight);
    }
  }

  const computedCells = computeCellPositions(
    params.layout,
    params.stacks,
    cardSizes,
    params.wallThickness,
    params.clearance
  );

  const positions: CardWellStackPosition[] = [];

  for (const cell of computedCells) {
    const stack = params.stacks.find((s) => s.cellId === cell.id);
    if (!stack) continue;

    const cardSize = getCardSize(cardSizes, stack.cardSizeId);
    if (!cardSize) continue;

    const { effectiveWidth, effectiveDepth } = getEffectiveCardDimensions(cardSize, stack.rotation ?? 0);

    // Calculate floor raise for shorter stacks (so all card tops are at same level)
    const thisStackHeight = stack.count * cardSize.thickness;
    const floorRaise = maxStackHeight - thisStackHeight;
    const cellFloorZ = baseFloorZ + floorRaise;

    // Calculate cavity position (centered within cell)
    const cavityWidth = Math.min(cell.width, effectiveWidth + params.clearance * 2);
    const cavityDepth = Math.min(cell.depth, effectiveDepth + params.clearance * 2);
    const cavityOffsetX = (cell.width - cavityWidth) / 2;
    const cavityOffsetY = (cell.depth - cavityDepth) / 2;

    // Card center position
    const centerX = cell.x + cavityOffsetX + cavityWidth / 2;
    const centerY = cell.y + cavityOffsetY + cavityDepth / 2;

    positions.push({
      x: centerX,
      y: centerY,
      z: cellFloorZ,
      width: effectiveWidth,
      length: effectiveDepth,
      thickness: cardSize.thickness,
      count: stack.count,
      label: cardSize.name,
      // Inner card dimensions for sleeved rendering (assume 3mm sleeve margin)
      innerWidth: Math.max(effectiveWidth - 3, effectiveWidth * 0.95),
      innerLength: Math.max(effectiveDepth - 3, effectiveDepth * 0.95)
    });
  }

  return positions;
}

// Sync stacks with layout - remove stacks for deleted cells, add stacks for new cells
export function syncStacksWithLayout(
  stacks: CardWellStack[],
  layout: CardWellLayout,
  defaultCardSizeId?: string
): CardWellStack[] {
  const validCellIds = getAllCellIds(layout);
  const validCellIdSet = new Set(validCellIds);
  const existingCellIds = new Set(stacks.map((s) => s.cellId));

  // Keep existing stacks that still have valid cells
  const keptStacks = stacks.filter((stack) => validCellIdSet.has(stack.cellId));

  // Add new stacks for cells that don't have one
  const newStacks: CardWellStack[] = [];
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
