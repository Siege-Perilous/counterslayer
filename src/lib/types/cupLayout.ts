// Cup layout types for split-based cup tray layout system

export type CupId = string;

// Generate a unique cup ID
export function generateCupId(): CupId {
  return Math.random().toString(36).substring(2, 9);
}

// Leaf node = actual cup
export interface CupLeaf {
  type: 'cup';
  id: CupId;
}

// Split node = divides space into two children
export interface CupSplit {
  type: 'split';
  direction: 'horizontal' | 'vertical'; // horizontal = top/bottom, vertical = left/right
  ratio: number; // 0.0-1.0, position of divider (e.g., 0.5 = even split)
  first: CupLayoutNode; // left or top
  second: CupLayoutNode; // right or bottom
}

export type CupLayoutNode = CupLeaf | CupSplit;

export interface CupLayout {
  root: CupLayoutNode;
}

// Helper to check if a node is a leaf (cup)
export function isCupLeaf(node: CupLayoutNode): node is CupLeaf {
  return node.type === 'cup';
}

// Helper to check if a node is a split
export function isCupSplit(node: CupLayoutNode): node is CupSplit {
  return node.type === 'split';
}

// Create a default single cup layout
export function createDefaultCupLayout(): CupLayout {
  return {
    root: { type: 'cup', id: generateCupId() }
  };
}

// Split a cup into two cups
export function splitCup(layout: CupLayout, cupId: CupId, direction: 'horizontal' | 'vertical'): CupLayout {
  function splitNode(node: CupLayoutNode): CupLayoutNode {
    if (isCupLeaf(node)) {
      if (node.id === cupId) {
        // Split this cup
        return {
          type: 'split',
          direction,
          ratio: 0.5,
          first: { type: 'cup', id: generateCupId() },
          second: { type: 'cup', id: generateCupId() }
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

// Delete a cup (merges with sibling)
export function deleteCup(layout: CupLayout, cupId: CupId): CupLayout | null {
  // Can't delete if it's the only cup (root is a leaf)
  if (isCupLeaf(layout.root)) {
    return null;
  }

  function deleteFromNode(node: CupLayoutNode, _parent: CupSplit | null): CupLayoutNode | null {
    if (isCupLeaf(node)) {
      if (node.id === cupId) {
        // This cup should be deleted - return null to signal deletion
        return null;
      }
      return node;
    }

    // Check if either child is the cup to delete
    const firstResult = deleteFromNode(node.first, node);
    const secondResult = deleteFromNode(node.second, node);

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

  const newRoot = deleteFromNode(layout.root, null);
  if (newRoot === null) {
    return null;
  }

  return { root: newRoot };
}

// Update the ratio of a split containing a specific cup
export function updateSplitRatio(layout: CupLayout, cupId: CupId, newRatio: number): CupLayout {
  // Clamp ratio to valid range
  const clampedRatio = Math.max(0.15, Math.min(0.85, newRatio));

  function findAndUpdateSplit(node: CupLayoutNode): CupLayoutNode {
    if (isCupLeaf(node)) {
      return node;
    }

    // Check if this split contains the cup as first or second child
    const firstContainsCup = containsCup(node.first, cupId);
    const secondContainsCup = containsCup(node.second, cupId);

    if (firstContainsCup || secondContainsCup) {
      // Check if direct child
      if ((isCupLeaf(node.first) && node.first.id === cupId) || (isCupLeaf(node.second) && node.second.id === cupId)) {
        // This is the parent split, update ratio
        return {
          ...node,
          ratio: clampedRatio
        };
      }
    }

    // Recursively update children
    return {
      ...node,
      first: findAndUpdateSplit(node.first),
      second: findAndUpdateSplit(node.second)
    };
  }

  return { root: findAndUpdateSplit(layout.root) };
}

// Find the parent split of a cup and update its ratio
export function updateParentSplitRatio(layout: CupLayout, cupId: CupId, newRatio: number): CupLayout {
  const clampedRatio = Math.max(0.15, Math.min(0.85, newRatio));

  function updateNode(node: CupLayoutNode): CupLayoutNode {
    if (isCupLeaf(node)) {
      return node;
    }

    // Check if either direct child is the target cup
    if ((isCupLeaf(node.first) && node.first.id === cupId) || (isCupLeaf(node.second) && node.second.id === cupId)) {
      return { ...node, ratio: clampedRatio };
    }

    // Recurse
    return {
      ...node,
      first: updateNode(node.first),
      second: updateNode(node.second)
    };
  }

  return { root: updateNode(layout.root) };
}

// Check if a node (or its descendants) contains a specific cup
function containsCup(node: CupLayoutNode, cupId: CupId): boolean {
  if (isCupLeaf(node)) {
    return node.id === cupId;
  }
  return containsCup(node.first, cupId) || containsCup(node.second, cupId);
}

// Update a split by its path in the tree (e.g., "root", "root-L", "root-L-T")
export function updateSplitRatioByPath(layout: CupLayout, path: string, newRatio: number): CupLayout {
  const clampedRatio = Math.max(0.15, Math.min(0.85, newRatio));

  function updateNode(node: CupLayoutNode, currentPath: string): CupLayoutNode {
    if (isCupLeaf(node)) {
      return node;
    }

    // Check if this is the target split
    if (currentPath === path) {
      return { ...node, ratio: clampedRatio };
    }

    // Recurse into children
    return {
      ...node,
      first: updateNode(node.first, `${currentPath}-L`),
      second: updateNode(node.second, `${currentPath}-R`)
    };
  }

  return { root: updateNode(layout.root, 'root') };
}

// Get all cup IDs from a layout
export function getAllCupIds(layout: CupLayout): CupId[] {
  const ids: CupId[] = [];

  function collectIds(node: CupLayoutNode): void {
    if (isCupLeaf(node)) {
      ids.push(node.id);
    } else {
      collectIds(node.first);
      collectIds(node.second);
    }
  }

  collectIds(layout.root);
  return ids;
}

// Count total cups in layout
export function countCups(layout: CupLayout): number {
  function count(node: CupLayoutNode): number {
    if (isCupLeaf(node)) {
      return 1;
    }
    return count(node.first) + count(node.second);
  }
  return count(layout.root);
}

// Convert a rows × columns grid to equivalent split layout
export function gridToSplitLayout(rows: number, columns: number): CupLayout {
  if (rows < 1 || columns < 1) {
    return createDefaultCupLayout();
  }

  if (rows === 1 && columns === 1) {
    return createDefaultCupLayout();
  }

  // Build a balanced binary tree that represents the grid
  // Strategy: split horizontally into rows first, then split each row vertically into columns

  function buildRow(numColumns: number): CupLayoutNode {
    if (numColumns === 1) {
      return { type: 'cup', id: generateCupId() };
    }
    // Split roughly in half
    const leftCols = Math.floor(numColumns / 2);
    const rightCols = numColumns - leftCols;
    return {
      type: 'split',
      direction: 'vertical',
      ratio: leftCols / numColumns,
      first: buildRow(leftCols),
      second: buildRow(rightCols)
    };
  }

  function buildRows(numRows: number): CupLayoutNode {
    if (numRows === 1) {
      return buildRow(columns);
    }
    // Split roughly in half
    const topRows = Math.floor(numRows / 2);
    const bottomRows = numRows - topRows;
    return {
      type: 'split',
      direction: 'horizontal',
      ratio: topRows / numRows,
      first: buildRows(topRows),
      second: buildRows(bottomRows)
    };
  }

  return { root: buildRows(rows) };
}
