// Card scoop layout types - column-based layout system
// Each column can have a different number of cells, centered vertically

export type CellId = string;

// Generate a unique cell ID
export function generateCellId(): CellId {
  return Math.random().toString(36).substring(2, 9);
}

// Column-based layout: columns[colIndex][cellIndex]
// Each column is a vertical stack of cells, centered within the tray depth
export interface CardScoopLayout {
  columns: CellId[][];
}

// Get layout dimensions
export function getLayoutDimensions(layout: CardScoopLayout): { numColumns: number; maxCellsPerColumn: number } {
  if (!layout.columns || !Array.isArray(layout.columns)) {
    return { numColumns: 0, maxCellsPerColumn: 0 };
  }
  const numColumns = layout.columns.length;
  const maxCellsPerColumn = Math.max(0, ...layout.columns.map((col) => col.length));
  return { numColumns, maxCellsPerColumn };
}

// Create a default single cell layout (1 column with 1 cell)
export function createDefaultCardScoopLayout(): CardScoopLayout {
  return {
    columns: [[generateCellId()]]
  };
}

// Get all cell IDs in column-major order (left-to-right, top-to-bottom within each column)
export function getAllCellIds(layout: CardScoopLayout): CellId[] {
  if (!layout.columns) return [];
  const ids: CellId[] = [];
  for (const column of layout.columns) {
    for (const cellId of column) {
      ids.push(cellId);
    }
  }
  return ids;
}

// Count total cells in layout
export function countCells(layout: CardScoopLayout): number {
  if (!layout.columns) return 0;
  return layout.columns.reduce((sum, col) => sum + col.length, 0);
}

// Get column and cell index for a cell
export function getCellPosition(
  layout: CardScoopLayout,
  cellId: CellId
): { colIndex: number; cellIndex: number } | null {
  if (!layout.columns) return null;
  for (let colIndex = 0; colIndex < layout.columns.length; colIndex++) {
    const column = layout.columns[colIndex];
    for (let cellIndex = 0; cellIndex < column.length; cellIndex++) {
      if (column[cellIndex] === cellId) {
        return { colIndex, cellIndex };
      }
    }
  }
  return null;
}

// Get the reference number for a cell (1-based index in column-major order)
export function getCellRefNumber(layout: CardScoopLayout, cellId: CellId): number {
  const allIds = getAllCellIds(layout);
  const index = allIds.indexOf(cellId);
  return index >= 0 ? index + 1 : 0;
}

// Add a cell to a column (vertically)
// Adds after the specified cell index, or at the end if -1
export function addCellToColumn(layout: CardScoopLayout, colIndex: number, afterCellIndex: number = -1): CardScoopLayout {
  if (!layout.columns || colIndex < 0 || colIndex >= layout.columns.length) {
    return layout;
  }

  const column = layout.columns[colIndex];
  const insertIndex = afterCellIndex < 0 ? column.length : afterCellIndex + 1;

  const newColumn = [...column];
  newColumn.splice(insertIndex, 0, generateCellId());

  const newColumns = [...layout.columns];
  newColumns[colIndex] = newColumn;

  return { columns: newColumns };
}

// Add a new column with a single cell (horizontally)
// Adds after the specified column index, or at the end if -1
export function addColumn(layout: CardScoopLayout, afterColIndex: number = -1): CardScoopLayout {
  if (!layout.columns) {
    return { columns: [[generateCellId()]] };
  }

  const insertIndex = afterColIndex < 0 ? layout.columns.length : afterColIndex + 1;

  const newColumns = [...layout.columns];
  newColumns.splice(insertIndex, 0, [generateCellId()]);

  return { columns: newColumns };
}

// Delete a cell from a column
// If the column becomes empty, removes the column
// Returns null if this would result in no cells
export function deleteCell(layout: CardScoopLayout, cellId: CellId): CardScoopLayout | null {
  const pos = getCellPosition(layout, cellId);
  if (!pos) return layout;

  const { colIndex, cellIndex } = pos;
  const column = layout.columns[colIndex];

  // If this is the only cell in the only column, can't delete
  if (layout.columns.length === 1 && column.length === 1) {
    return null;
  }

  // If this is the only cell in the column, remove the column
  if (column.length === 1) {
    const newColumns = [...layout.columns];
    newColumns.splice(colIndex, 1);
    return { columns: newColumns };
  }

  // Otherwise, just remove the cell from the column
  const newColumn = [...column];
  newColumn.splice(cellIndex, 1);

  const newColumns = [...layout.columns];
  newColumns[colIndex] = newColumn;

  return { columns: newColumns };
}

// Delete an entire column
// Returns null if this is the last column
export function deleteColumn(layout: CardScoopLayout, colIndex: number): CardScoopLayout | null {
  if (!layout.columns || layout.columns.length <= 1) {
    return null;
  }

  const newColumns = [...layout.columns];
  newColumns.splice(colIndex, 1);

  return { columns: newColumns };
}

// ============================================
// Legacy layout types and migration
// ============================================

// Legacy leaf node (from binary tree layout)
export interface CellLeaf {
  type: 'cell';
  id: CellId;
}

// Legacy split node (from binary tree layout)
export interface CellSplit {
  type: 'split';
  direction: 'horizontal' | 'vertical';
  first: CardScoopLayoutNode;
  second: CardScoopLayoutNode;
}

export type CardScoopLayoutNode = CellLeaf | CellSplit;

// Legacy binary tree layout
export interface LegacyTreeLayout {
  root: CardScoopLayoutNode;
}

// Legacy grid layout (cells[][])
export interface LegacyGridLayout {
  cells: CellId[][];
}

// Union of all legacy types
export type LegacyCardScoopLayout = LegacyTreeLayout | LegacyGridLayout;

// Check if a node is a leaf
export function isCellLeaf(node: CardScoopLayoutNode): node is CellLeaf {
  return node.type === 'cell';
}

// Check if a node is a split
export function isCellSplit(node: CardScoopLayoutNode): node is CellSplit {
  return node.type === 'split';
}

// Check if a layout is in the current column format
export function isColumnLayout(layout: CardScoopLayout | LegacyCardScoopLayout): layout is CardScoopLayout {
  return 'columns' in layout && Array.isArray(layout.columns);
}

// Check if a layout is in the legacy tree format
export function isLegacyTreeLayout(layout: CardScoopLayout | LegacyCardScoopLayout): layout is LegacyTreeLayout {
  return 'root' in layout;
}

// Check if a layout is in the legacy grid format
export function isLegacyGridLayout(layout: CardScoopLayout | LegacyCardScoopLayout): layout is LegacyGridLayout {
  return 'cells' in layout && Array.isArray(layout.cells);
}

// Migrate legacy tree layout to column layout
function migrateTreeLayout(legacy: LegacyTreeLayout): CardScoopLayout {
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

  // Put all cells in a single column for simplicity
  // User can reorganize as needed
  return { columns: [allCells] };
}

// Migrate legacy grid layout to column layout
function migrateGridLayout(legacy: LegacyGridLayout): CardScoopLayout {
  const numRows = legacy.cells.length;
  const numCols = numRows > 0 ? legacy.cells[0].length : 0;

  // Convert row-major grid to column-major
  const columns: CellId[][] = [];
  for (let col = 0; col < numCols; col++) {
    const column: CellId[] = [];
    for (let row = 0; row < numRows; row++) {
      if (legacy.cells[row] && legacy.cells[row][col]) {
        column.push(legacy.cells[row][col]);
      }
    }
    if (column.length > 0) {
      columns.push(column);
    }
  }

  return { columns: columns.length > 0 ? columns : [[generateCellId()]] };
}

// Auto-migrate layout if needed
export function ensureColumnLayout(layout: CardScoopLayout | LegacyCardScoopLayout): CardScoopLayout {
  if (isColumnLayout(layout)) {
    return layout;
  }
  if (isLegacyTreeLayout(layout)) {
    return migrateTreeLayout(layout);
  }
  if (isLegacyGridLayout(layout)) {
    return migrateGridLayout(layout);
  }
  // Fallback
  return createDefaultCardScoopLayout();
}

// Backwards compatibility aliases
export { ensureColumnLayout as ensureGridLayout };
