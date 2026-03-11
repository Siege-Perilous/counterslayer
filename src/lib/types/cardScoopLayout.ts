// Card scoop layout types for split-based grid layout system
// Similar to cup layout but with fixed 0.5 ratio (no draggable dividers)

export type CellId = string;

// Generate a unique cell ID
export function generateCellId(): CellId {
  return Math.random().toString(36).substring(2, 9);
}

// Leaf node = actual cell that can hold a card stack
export interface CellLeaf {
  type: 'cell';
  id: CellId;
}

// Split node = divides space into two children at fixed 0.5 ratio
export interface CellSplit {
  type: 'split';
  direction: 'horizontal' | 'vertical'; // horizontal = top/bottom, vertical = left/right
  first: CardScoopLayoutNode; // left or bottom
  second: CardScoopLayoutNode; // right or top
}

export type CardScoopLayoutNode = CellLeaf | CellSplit;

export interface CardScoopLayout {
  root: CardScoopLayoutNode;
}

// Helper to check if a node is a leaf (cell)
export function isCellLeaf(node: CardScoopLayoutNode): node is CellLeaf {
  return node.type === 'cell';
}

// Helper to check if a node is a split
export function isCellSplit(node: CardScoopLayoutNode): node is CellSplit {
  return node.type === 'split';
}

// Create a default single cell layout
export function createDefaultCardScoopLayout(): CardScoopLayout {
  return {
    root: { type: 'cell', id: generateCellId() }
  };
}

// Split a cell into two cells (always at 0.5 ratio)
export function splitCell(
  layout: CardScoopLayout,
  cellId: CellId,
  direction: 'horizontal' | 'vertical'
): CardScoopLayout {
  function splitNode(node: CardScoopLayoutNode): CardScoopLayoutNode {
    if (isCellLeaf(node)) {
      if (node.id === cellId) {
        // Split this cell
        return {
          type: 'split',
          direction,
          first: { type: 'cell', id: generateCellId() },
          second: { type: 'cell', id: generateCellId() }
        };
      }
      return node;
    }
    // Recursively search in split children
    return {
      ...node,
      first: splitNode(node.first),
      second: splitNode(node.second)
    };
  }

  return { root: splitNode(layout.root) };
}

// Delete a cell (merges with sibling)
export function deleteCell(layout: CardScoopLayout, cellId: CellId): CardScoopLayout | null {
  // Can't delete if it's the only cell (root is a leaf)
  if (isCellLeaf(layout.root)) {
    return null;
  }

  function deleteFromNode(node: CardScoopLayoutNode): CardScoopLayoutNode | null {
    if (isCellLeaf(node)) {
      if (node.id === cellId) {
        // This cell should be deleted - return null to signal deletion
        return null;
      }
      return node;
    }

    // Check if either child is the cell to delete
    const firstResult = deleteFromNode(node.first);
    const secondResult = deleteFromNode(node.second);

    if (firstResult === null) {
      // First child was deleted, return second child (sibling absorbs space)
      return node.second;
    }
    if (secondResult === null) {
      // Second child was deleted, return first child
      return node.first;
    }

    // Neither was deleted directly at this level, but tree may have changed
    return {
      ...node,
      first: firstResult,
      second: secondResult
    };
  }

  const newRoot = deleteFromNode(layout.root);
  if (newRoot === null) {
    return null;
  }

  return { root: newRoot };
}

// Get all cell IDs from a layout (depth-first traversal order)
export function getAllCellIds(layout: CardScoopLayout): CellId[] {
  const ids: CellId[] = [];

  function collectIds(node: CardScoopLayoutNode): void {
    if (isCellLeaf(node)) {
      ids.push(node.id);
    } else {
      collectIds(node.first);
      collectIds(node.second);
    }
  }

  collectIds(layout.root);
  return ids;
}

// Count total cells in layout
export function countCells(layout: CardScoopLayout): number {
  function count(node: CardScoopLayoutNode): number {
    if (isCellLeaf(node)) {
      return 1;
    }
    return count(node.first) + count(node.second);
  }
  return count(layout.root);
}

// Get the reference number for a cell (1-based index in depth-first order)
export function getCellRefNumber(layout: CardScoopLayout, cellId: CellId): number {
  const allIds = getAllCellIds(layout);
  const index = allIds.indexOf(cellId);
  return index >= 0 ? index + 1 : 0;
}
