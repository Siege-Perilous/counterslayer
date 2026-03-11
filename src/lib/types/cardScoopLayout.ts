// Card scoop layout types - simple grid-based layout system
// Each cell is sized by its card stack, rows share depth, columns share width

export type CellId = string;

// Generate a unique cell ID
export function generateCellId(): CellId {
  return Math.random().toString(36).substring(2, 9);
}

// Grid-based layout: cells[rowIndex][colIndex]
// All rows have the same number of columns (regular grid)
export interface CardScoopLayout {
  cells: CellId[][];
}

// Get grid dimensions
export function getGridDimensions(layout: CardScoopLayout): { numRows: number; numCols: number } {
  if (!layout.cells || !Array.isArray(layout.cells)) {
    return { numRows: 0, numCols: 0 };
  }
  const numRows = layout.cells.length;
  const numCols = numRows > 0 ? layout.cells[0].length : 0;
  return { numRows, numCols };
}

// Create a default single cell layout (1x1 grid)
export function createDefaultCardScoopLayout(): CardScoopLayout {
  return {
    cells: [[generateCellId()]]
  };
}

// Get all cell IDs in row-major order (top-to-bottom, left-to-right)
export function getAllCellIds(layout: CardScoopLayout): CellId[] {
  const ids: CellId[] = [];
  for (const row of layout.cells) {
    for (const cellId of row) {
      ids.push(cellId);
    }
  }
  return ids;
}

// Count total cells in layout
export function countCells(layout: CardScoopLayout): number {
  const { numRows, numCols } = getGridDimensions(layout);
  return numRows * numCols;
}

// Get row and column index for a cell
export function getCellPosition(layout: CardScoopLayout, cellId: CellId): { row: number; col: number } | null {
  for (let row = 0; row < layout.cells.length; row++) {
    for (let col = 0; col < layout.cells[row].length; col++) {
      if (layout.cells[row][col] === cellId) {
        return { row, col };
      }
    }
  }
  return null;
}

// Get the reference number for a cell (1-based index in row-major order)
export function getCellRefNumber(layout: CardScoopLayout, cellId: CellId): number {
  const allIds = getAllCellIds(layout);
  const index = allIds.indexOf(cellId);
  return index >= 0 ? index + 1 : 0;
}

// Add a column to the right of the specified column index
// If colIndex is -1, adds to the far right
export function addColumn(layout: CardScoopLayout, afterColIndex: number = -1): CardScoopLayout {
  const { numCols } = getGridDimensions(layout);
  const insertIndex = afterColIndex < 0 ? numCols : afterColIndex + 1;

  const newCells = layout.cells.map((row) => {
    const newRow = [...row];
    newRow.splice(insertIndex, 0, generateCellId());
    return newRow;
  });

  return { cells: newCells };
}

// Add a row below the specified row index
// If rowIndex is -1, adds to the bottom
export function addRow(layout: CardScoopLayout, afterRowIndex: number = -1): CardScoopLayout {
  const { numRows, numCols } = getGridDimensions(layout);
  const insertIndex = afterRowIndex < 0 ? numRows : afterRowIndex + 1;

  // Create new row with same number of columns
  const newRow: CellId[] = [];
  for (let i = 0; i < numCols; i++) {
    newRow.push(generateCellId());
  }

  const newCells = [...layout.cells];
  newCells.splice(insertIndex, 0, newRow);

  return { cells: newCells };
}

// Delete a column at the specified index
// Returns null if this would result in 0 columns
export function deleteColumn(layout: CardScoopLayout, colIndex: number): CardScoopLayout | null {
  const { numCols } = getGridDimensions(layout);
  if (numCols <= 1) {
    return null; // Can't delete the last column
  }

  const newCells = layout.cells.map((row) => {
    const newRow = [...row];
    newRow.splice(colIndex, 1);
    return newRow;
  });

  return { cells: newCells };
}

// Delete a row at the specified index
// Returns null if this would result in 0 rows
export function deleteRow(layout: CardScoopLayout, rowIndex: number): CardScoopLayout | null {
  const { numRows } = getGridDimensions(layout);
  if (numRows <= 1) {
    return null; // Can't delete the last row
  }

  const newCells = [...layout.cells];
  newCells.splice(rowIndex, 1);

  return { cells: newCells };
}

// Delete a cell - removes the row or column that contains it
// Prefers removing column if both row and column have only 1 cell
// Returns null if this is the last cell
export function deleteCell(layout: CardScoopLayout, cellId: CellId): CardScoopLayout | null {
  const pos = getCellPosition(layout, cellId);
  if (!pos) return layout;

  const { numRows, numCols } = getGridDimensions(layout);

  // Can't delete the last cell
  if (numRows === 1 && numCols === 1) {
    return null;
  }

  // If only one column, delete the row
  if (numCols === 1) {
    return deleteRow(layout, pos.row);
  }

  // If only one row, delete the column
  if (numRows === 1) {
    return deleteColumn(layout, pos.col);
  }

  // Multiple rows and columns - prefer deleting column
  return deleteColumn(layout, pos.col);
}

// ============================================
// Legacy binary tree types and migration
// ============================================

// Legacy leaf node
export interface CellLeaf {
  type: 'cell';
  id: CellId;
}

// Legacy split node
export interface CellSplit {
  type: 'split';
  direction: 'horizontal' | 'vertical';
  first: CardScoopLayoutNode;
  second: CardScoopLayoutNode;
}

export type CardScoopLayoutNode = CellLeaf | CellSplit;

// Legacy layout structure
export interface LegacyCardScoopLayout {
  root: CardScoopLayoutNode;
}

// Check if a node is a leaf
export function isCellLeaf(node: CardScoopLayoutNode): node is CellLeaf {
  return node.type === 'cell';
}

// Check if a node is a split
export function isCellSplit(node: CardScoopLayoutNode): node is CellSplit {
  return node.type === 'split';
}

// Check if a layout is in the legacy format
export function isLegacyLayout(layout: CardScoopLayout | LegacyCardScoopLayout): layout is LegacyCardScoopLayout {
  return 'root' in layout && !('cells' in layout);
}

// Migrate legacy binary tree layout to grid layout
// Attempts to flatten the tree into a sensible grid
export function migrateLegacyLayout(legacy: LegacyCardScoopLayout): CardScoopLayout {
  // Collect all cells and try to determine grid structure
  const allCells: CellId[] = [];

  function collectCells(node: CardScoopLayoutNode): void {
    if (isCellLeaf(node)) {
      allCells.push(node.id);
    } else {
      collectCells(node.first);
      collectCells(node.second);
    }
  }

  collectCells(legacy.root);

  // Try to determine a reasonable grid layout based on the tree structure
  const gridInfo = analyzeTreeStructure(legacy.root);

  // Create the grid
  const cells: CellId[][] = [];
  let cellIndex = 0;

  for (let row = 0; row < gridInfo.rows; row++) {
    const rowCells: CellId[] = [];
    for (let col = 0; col < gridInfo.cols; col++) {
      if (cellIndex < allCells.length) {
        rowCells.push(allCells[cellIndex++]);
      } else {
        // Fill with new cells if we don't have enough
        rowCells.push(generateCellId());
      }
    }
    cells.push(rowCells);
  }

  return { cells };
}

// Analyze tree structure to determine best grid dimensions
function analyzeTreeStructure(node: CardScoopLayoutNode): { rows: number; cols: number } {
  if (isCellLeaf(node)) {
    return { rows: 1, cols: 1 };
  }

  const first = analyzeTreeStructure(node.first);
  const second = analyzeTreeStructure(node.second);

  if (node.direction === 'vertical') {
    // Left/right split - cells are side by side (adds columns)
    return {
      rows: Math.max(first.rows, second.rows),
      cols: first.cols + second.cols
    };
  } else {
    // Top/bottom split - cells are stacked (adds rows)
    return {
      rows: first.rows + second.rows,
      cols: Math.max(first.cols, second.cols)
    };
  }
}

// Auto-migrate layout if needed
export function ensureGridLayout(layout: CardScoopLayout | LegacyCardScoopLayout): CardScoopLayout {
  if (isLegacyLayout(layout)) {
    return migrateLegacyLayout(layout);
  }
  return layout;
}
