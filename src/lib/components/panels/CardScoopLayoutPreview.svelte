<script lang="ts">
  import type { CardScoopLayout, LegacyCardScoopLayout, CellId } from '$lib/types/cardScoopLayout';
  import { getAllCellIds, getLayoutDimensions, ensureColumnLayout } from '$lib/types/cardScoopLayout';
  import type { CardScoopStack } from '$lib/models/cardScoopTray';
  import { computeLayoutSizes } from '$lib/models/cardScoopTray';
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

  // Inset from container edges
  const EDGE_INSET = 1;

  // Data structure for rendered cells
  interface RenderedCell {
    id: CellId;
    refNumber: number;
    colIndex: number;
    cellIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
    cardSizeName?: string;
  }

  // Ensure we have a column layout
  let columnLayout = $derived(ensureColumnLayout(layout));

  // Get all cell IDs in order for ref number calculation
  let allCellIds = $derived(getAllCellIds(columnLayout));

  // Helper to get card size name for a cell
  function getCardSizeNameForCell(cellId: CellId): string | undefined {
    const stack = stacks.find((s) => s.cellId === cellId);
    if (!stack) return undefined;
    const cardSize = cardSizes.find((cs) => cs.id === stack.cardSizeId);
    return cardSize?.name;
  }

  // Compute rendered cells from column layout with vertical centering
  let renderedCells = $derived.by(() => {
    const cells: RenderedCell[] = [];

    if (containerWidth === 0 || containerHeight === 0) {
      return cells;
    }

    const { numColumns } = getLayoutDimensions(columnLayout);
    if (numColumns === 0) {
      return cells;
    }

    // Get layout sizes in mm
    const layoutSizes = computeLayoutSizes(columnLayout, stacks, cardSizes, clearance, wallThickness);

    // Available pixel space
    const availableWidth = containerWidth - 2 * EDGE_INSET;
    const availableHeight = containerHeight - 2 * EDGE_INSET;

    // Scale factors
    const scaleX = availableWidth / (layoutSizes.totalWidth + 2 * wallThickness);
    const scaleY = availableHeight / (layoutSizes.maxColumnDepth + 2 * wallThickness);

    // Calculate pixel positions for each column
    let currentX = wallThickness; // Start after outer wall (in mm)

    for (let colIndex = 0; colIndex < columnLayout.columns.length; colIndex++) {
      const column = columnLayout.columns[colIndex];
      const columnInfo = layoutSizes.columns[colIndex];

      // Calculate vertical centering offset for this column
      const columnTotalDepth = columnInfo.totalDepth;
      const verticalOffset = (layoutSizes.maxColumnDepth - columnTotalDepth) / 2;

      // Calculate Y position for each cell in the column
      let currentY = wallThickness + verticalOffset; // Start after outer wall + centering offset

      for (let cellIndex = 0; cellIndex < column.length; cellIndex++) {
        const cellId = column[cellIndex];
        const cellDepth = columnInfo.cellDepths[cellIndex];
        const refNumber = allCellIds.indexOf(cellId) + 1;

        // Convert mm to pixels
        const x = EDGE_INSET + currentX * scaleX;
        const y = EDGE_INSET + currentY * scaleY;
        const width = columnInfo.width * scaleX;
        const height = cellDepth * scaleY;

        cells.push({
          id: cellId,
          refNumber,
          colIndex,
          cellIndex,
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(width),
          height: Math.round(height),
          cardSizeName: getCardSizeNameForCell(cellId)
        });

        currentY += cellDepth + wallThickness;
      }

      currentX += columnInfo.width + wallThickness;
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
