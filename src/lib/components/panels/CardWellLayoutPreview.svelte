<script lang="ts">
  import type { CardWellLayout, CellId } from '$lib/types/cardWellLayout';
  import { getAllCellIds, getLayoutDimensions } from '$lib/types/cardWellLayout';
  import type { CardWellStack } from '$lib/models/cardWellTray';
  import { computeLayoutSizes } from '$lib/models/cardWellTray';
  import type { CardSize } from '$lib/types/project';
  import CardWellCell from './CardWellCell.svelte';

  interface Props {
    layout: CardWellLayout;
    stacks: CardWellStack[];
    cardSizes: CardSize[];
    trayLetter: string;
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
    trayLetter,
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
    // Actual card cavity dimensions (may be smaller than cell if column has larger cards)
    cavityWidth: number;
    cavityHeight: number;
    cardSizeName?: string;
  }

  // Get all cell IDs in order for ref number calculation
  let allCellIds = $derived(getAllCellIds(layout));

  // Helper to get card size for a cell
  function getCardSizeForCell(cellId: CellId): CardSize | undefined {
    const stack = stacks.find((s) => s.cellId === cellId);
    if (!stack) return undefined;
    return cardSizes.find((cs) => cs.id === stack.cardSizeId);
  }

  // Helper to get stack for a cell
  function getStackForCell(cellId: CellId) {
    return stacks.find((s) => s.cellId === cellId);
  }

  // Compute rendered cells from column layout with vertical centering
  let renderedCells = $derived.by(() => {
    const cells: RenderedCell[] = [];

    if (containerWidth === 0 || containerHeight === 0) {
      return cells;
    }

    const { numColumns } = getLayoutDimensions(layout);
    if (numColumns === 0) {
      return cells;
    }

    // Get layout sizes in mm
    const layoutSizes = computeLayoutSizes(layout, stacks, cardSizes, clearance, wallThickness);

    // Available pixel space
    const availableWidth = containerWidth - 2 * EDGE_INSET;
    const availableHeight = containerHeight - 2 * EDGE_INSET;

    // Scale factors
    const scaleX = availableWidth / (layoutSizes.totalWidth + 2 * wallThickness);
    const scaleY = availableHeight / (layoutSizes.maxColumnDepth + 2 * wallThickness);

    // Calculate pixel positions for each column
    let currentX = wallThickness; // Start after outer wall (in mm)

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
        const refNumber = allCellIds.indexOf(cellId) + 1;

        // Convert mm to pixels
        const x = EDGE_INSET + currentX * scaleX;
        const y = EDGE_INSET + currentY * scaleY;
        const width = columnInfo.width * scaleX;
        const height = cellDepth * scaleY;

        // Calculate actual cavity dimensions based on card size
        const cardSize = getCardSizeForCell(cellId);
        const stack = getStackForCell(cellId);
        let cavityWidthMm = columnInfo.width; // Default to full cell width
        let cavityDepthMm = cellDepth; // Default to full cell depth

        if (cardSize && stack) {
          // Get effective dimensions based on rotation
          const rotation = stack.rotation ?? 0;
          const effectiveWidth = rotation === 90 ? cardSize.length : cardSize.width;
          const effectiveDepth = rotation === 90 ? cardSize.width : cardSize.length;
          cavityWidthMm = effectiveWidth + clearance * 2;
          cavityDepthMm = effectiveDepth + clearance * 2;
        }

        const cavityWidth = cavityWidthMm * scaleX;
        const cavityHeight = cavityDepthMm * scaleY;

        cells.push({
          id: cellId,
          refNumber,
          colIndex,
          cellIndex,
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(width),
          height: Math.round(height),
          cavityWidth: Math.round(cavityWidth),
          cavityHeight: Math.round(cavityHeight),
          cardSizeName: cardSize?.name
        });

        currentY += cellDepth + wallThickness;
      }

      currentX += columnInfo.width + wallThickness;
    }

    return cells;
  });
</script>

<div
  class="cardWellLayoutPreview"
  style="aspect-ratio: {trayWidth} / {trayDepth}; max-width: {previewMaxWidth}px;"
  bind:clientWidth={containerWidth}
  bind:clientHeight={containerHeight}
>
  {#each renderedCells as cell (cell.id)}
    <CardWellCell
      id={cell.id}
      {trayLetter}
      refNumber={cell.refNumber}
      x={cell.x}
      y={cell.y}
      width={cell.width}
      height={cell.height}
      cavityWidth={cell.cavityWidth}
      cavityHeight={cell.cavityHeight}
      selected={selectedCellId === cell.id}
      cardSizeName={cell.cardSizeName}
      onSelect={onSelectCell}
    />
  {/each}
</div>

<style>
  .cardWellLayoutPreview {
    position: relative;
    width: 100%;
    overflow: hidden;
  }
</style>
