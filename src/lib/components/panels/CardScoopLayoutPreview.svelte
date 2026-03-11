<script lang="ts">
  import type { CardScoopLayout, LegacyCardScoopLayout, CellId } from '$lib/types/cardScoopLayout';
  import { getAllCellIds, getGridDimensions, ensureGridLayout } from '$lib/types/cardScoopLayout';
  import type { CardScoopStack } from '$lib/models/cardScoopTray';
  import { computeGridSizes } from '$lib/models/cardScoopTray';
  import type { CardSize } from '$lib/types/project';
  import CardScoopCell from './CardScoopCell.svelte';

  interface Props {
    layout: CardScoopLayout | LegacyCardScoopLayout;
    stacks: CardScoopStack[];
    cardSizes: CardSize[];
    selectedCellId: CellId | null;
    trayWidth: number; // Tray width in mm
    trayDepth: number; // Tray depth in mm
    clearance: number; // Clearance in mm
    wallThickness: number; // Wall thickness in mm
    onSelectCell: (id: CellId) => void;
  }

  let {
    layout,
    stacks,
    cardSizes,
    selectedCellId,
    trayWidth,
    trayDepth,
    clearance,
    wallThickness,
    onSelectCell
  }: Props = $props();

  // Track container dimensions
  let containerWidth = $state(0);
  let containerHeight = $state(0);

  // Calculate max preview width to fit within 500x500 while maintaining aspect ratio
  const MAX_PREVIEW_SIZE = 500;
  let previewMaxWidth = $derived(
    trayWidth >= trayDepth ? MAX_PREVIEW_SIZE : MAX_PREVIEW_SIZE * (trayWidth / trayDepth)
  );

  // Fixed pixel gap between cells (representing wall thickness)
  const GAP_PX = 8;
  // Inset from container edges
  const EDGE_INSET = 1;

  // Data structure for rendered cells
  interface RenderedCell {
    id: CellId;
    refNumber: number;
    row: number;
    col: number;
    x: number;
    y: number;
    width: number;
    height: number;
    cardSizeName?: string;
  }

  // Ensure we have a grid layout
  let gridLayout = $derived(ensureGridLayout(layout));

  // Get all cell IDs in order for ref number calculation
  let allCellIds = $derived(getAllCellIds(gridLayout));

  // Helper to get card size name for a cell
  function getCardSizeNameForCell(cellId: CellId): string | undefined {
    const stack = stacks.find((s) => s.cellId === cellId);
    if (!stack) return undefined;
    const cardSize = cardSizes.find((cs) => cs.id === stack.cardSizeId);
    return cardSize?.name;
  }

  // Compute rendered cells from grid layout based on actual card dimensions
  let renderedCells = $derived.by(() => {
    const cells: RenderedCell[] = [];

    if (containerWidth === 0 || containerHeight === 0) {
      return cells;
    }

    const { numRows, numCols } = getGridDimensions(gridLayout);
    if (numRows === 0 || numCols === 0) {
      return cells;
    }

    // Get grid sizes in mm
    const gridSizes = computeGridSizes(gridLayout, stacks, cardSizes, clearance, wallThickness);

    // Calculate total interior size in mm (for scaling)
    const interiorWidthMM = gridSizes.totalWidth;
    const interiorDepthMM = gridSizes.totalDepth;

    // Available pixel space (accounting for edge insets and gaps)
    const availableWidth = containerWidth - 2 * EDGE_INSET;
    const availableHeight = containerHeight - 2 * EDGE_INSET;

    // Calculate pixel positions for each column and row
    // We need to map mm positions to pixel positions proportionally
    const scaleX = availableWidth / interiorWidthMM;
    const scaleY = availableHeight / interiorDepthMM;

    // Calculate cumulative mm positions
    const columnXmm: number[] = [0];
    for (let col = 1; col < numCols; col++) {
      columnXmm[col] = columnXmm[col - 1] + gridSizes.columnWidths[col - 1] + wallThickness;
    }

    const rowYmm: number[] = [0];
    for (let row = 1; row < numRows; row++) {
      rowYmm[row] = rowYmm[row - 1] + gridSizes.rowDepths[row - 1] + wallThickness;
    }

    // Create rendered cells
    for (let row = 0; row < numRows; row++) {
      for (let col = 0; col < numCols; col++) {
        const cellId = gridLayout.cells[row][col];
        const refNumber = allCellIds.indexOf(cellId) + 1;

        // Convert mm to pixels
        const x = EDGE_INSET + columnXmm[col] * scaleX;
        const y = EDGE_INSET + rowYmm[row] * scaleY;
        const width = gridSizes.columnWidths[col] * scaleX;
        const height = gridSizes.rowDepths[row] * scaleY;

        cells.push({
          id: cellId,
          refNumber,
          row,
          col,
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(width),
          height: Math.round(height),
          cardSizeName: getCardSizeNameForCell(cellId)
        });
      }
    }

    return cells;
  });
</script>

<div
  class="cardScoopLayoutPreview"
  style="aspect-ratio: {trayWidth} / {trayDepth}; max-width: {previewMaxWidth}px;"
  bind:clientWidth={containerWidth}
  bind:clientHeight={containerHeight}
>
  {#each renderedCells as cell (cell.id)}
    <CardScoopCell
      id={cell.id}
      refNumber={cell.refNumber}
      x={cell.x}
      y={cell.y}
      width={cell.width}
      height={cell.height}
      selected={selectedCellId === cell.id}
      cardSizeName={cell.cardSizeName}
      onSelect={onSelectCell}
    />
  {/each}
</div>

<style>
  .cardScoopLayoutPreview {
    position: relative;
    width: 100%;
    overflow: hidden;
  }
</style>
