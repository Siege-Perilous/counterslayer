<script lang="ts">
  import type { CardScoopLayout, CardScoopLayoutNode, CellId } from '$lib/types/cardScoopLayout';
  import { isCellLeaf, isCellSplit, getAllCellIds } from '$lib/types/cardScoopLayout';
  import type { CardScoopStack } from '$lib/models/cardScoopTray';
  import type { CardSize } from '$lib/types/project';
  import CardScoopCell from './CardScoopCell.svelte';

  interface Props {
    layout: CardScoopLayout;
    stacks: CardScoopStack[];
    cardSizes: CardSize[];
    selectedCellId: CellId | null;
    trayWidth: number; // Tray width in mm
    trayDepth: number; // Tray depth in mm
    onSelectCell: (id: CellId) => void;
  }

  let { layout, stacks, cardSizes, selectedCellId, trayWidth, trayDepth, onSelectCell }: Props = $props();

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
    x: number;
    y: number;
    width: number;
    height: number;
    cardSizeName?: string;
  }

  // Get all cell IDs in order for ref number calculation
  let allCellIds = $derived(getAllCellIds(layout));

  // Helper to get card size name for a cell
  function getCardSizeNameForCell(cellId: CellId): string | undefined {
    const stack = stacks.find((s) => s.cellId === cellId);
    if (!stack) return undefined;
    const cardSize = cardSizes.find((cs) => cs.id === stack.cardSizeId);
    return cardSize?.name;
  }

  // Compute rendered cells from layout tree (fixed 0.5 ratio)
  let renderedCells = $derived.by(() => {
    const cells: RenderedCell[] = [];

    if (containerWidth === 0 || containerHeight === 0) {
      return cells;
    }

    function traverse(
      node: CardScoopLayoutNode,
      x: number,
      y: number,
      width: number,
      height: number
    ): void {
      if (isCellLeaf(node)) {
        const refNumber = allCellIds.indexOf(node.id) + 1;
        cells.push({
          id: node.id,
          refNumber,
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(width),
          height: Math.round(height),
          cardSizeName: getCardSizeNameForCell(node.id)
        });
        return;
      }

      if (isCellSplit(node)) {
        // Fixed 0.5 ratio for card scoop
        const ratio = 0.5;

        if (node.direction === 'vertical') {
          // Left/right split
          const leftWidth = width * ratio - GAP_PX / 2;
          const rightWidth = width * (1 - ratio) - GAP_PX / 2;
          const rightX = x + leftWidth + GAP_PX;

          traverse(node.first, x, y, leftWidth, height);
          traverse(node.second, rightX, y, rightWidth, height);
        } else {
          // Top/bottom split
          const bottomHeight = height * ratio - GAP_PX / 2;
          const topHeight = height * (1 - ratio) - GAP_PX / 2;
          const topY = y + bottomHeight + GAP_PX;

          traverse(node.first, x, y, width, bottomHeight);
          traverse(node.second, x, topY, width, topHeight);
        }
      }
    }

    traverse(
      layout.root,
      EDGE_INSET,
      EDGE_INSET,
      containerWidth - 2 * EDGE_INSET,
      containerHeight - 2 * EDGE_INSET
    );

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
