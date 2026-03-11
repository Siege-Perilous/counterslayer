<script lang="ts">
  import { IconButton, Icon } from '@tableslayer/ui';
  import { IconRowInsertBottom, IconColumnInsertRight, IconX } from '@tabler/icons-svelte';
  import type { CardWellLayout, CellId } from '$lib/types/cardWellLayout';
  import {
    addCellToColumn,
    addColumn,
    deleteCell,
    countCells,
    getAllCellIds,
    getCellPosition
  } from '$lib/types/cardWellLayout';
  import type { CardWellStack } from '$lib/models/cardWellTray';
  import type { CardSize } from '$lib/types/project';
  import CardWellLayoutPreview from './CardWellLayoutPreview.svelte';

  interface Props {
    layout: CardWellLayout;
    stacks: CardWellStack[];
    cardSizes: CardSize[];
    trayLetter: string;
    trayWidth: number;
    trayDepth: number;
    clearance: number;
    wallThickness: number;
    onUpdateLayout: (layout: CardWellLayout) => void;
  }

  let { layout, stacks, cardSizes, trayLetter, trayWidth, trayDepth, clearance, wallThickness, onUpdateLayout }: Props =
    $props();

  // Selected cell state
  let selectedCellId = $state<CellId | null>(null);

  // Ensure selection is valid when layout changes
  $effect(() => {
    const cellIds = getAllCellIds(layout);
    if (selectedCellId && !cellIds.includes(selectedCellId)) {
      // Selected cell no longer exists, select first cell or null
      selectedCellId = cellIds[0] ?? null;
    } else if (!selectedCellId && cellIds.length > 0) {
      // No selection but cells exist, select first
      selectedCellId = cellIds[0];
    }
  });

  // Derived state for UI
  let canDelete = $derived(countCells(layout) > 1 && selectedCellId !== null);

  // Get selected cell position for context-aware operations
  let selectedPosition = $derived(selectedCellId ? getCellPosition(layout, selectedCellId) : null);

  function handleSelectCell(id: CellId) {
    selectedCellId = id;
  }

  function handleAddCellToColumn() {
    // Add a cell to the same column (vertically) after the selected cell
    if (!selectedPosition) {
      // No selection, add to first column
      const newLayout = addCellToColumn(layout, 0, -1);
      onUpdateLayout(newLayout);
      return;
    }
    const newLayout = addCellToColumn(layout, selectedPosition.colIndex, selectedPosition.cellIndex);
    onUpdateLayout(newLayout);
  }

  function handleAddColumn() {
    // Add a new column (horizontally) after the selected cell's column
    const colIndex = selectedPosition?.colIndex ?? -1;
    const newLayout = addColumn(layout, colIndex);
    onUpdateLayout(newLayout);
  }

  function handleDeleteCell() {
    if (!selectedCellId || !canDelete) return;
    const newLayout = deleteCell(layout, selectedCellId);
    if (newLayout) {
      onUpdateLayout(newLayout);
      selectedCellId = null;
    }
  }
</script>

<div class="cardWellLayoutEditor">
  <div class="cardWellLayoutEditor__toolbar">
    <span class="cardWellLayoutEditor__hint">Add cells to columns or add new columns</span>
    <div class="cardWellLayoutEditor__toolbarButtons">
      <IconButton variant="ghost" onclick={handleAddColumn} title="Add column (horizontal)">
        <Icon Icon={IconColumnInsertRight} size="1.25rem" />
      </IconButton>
      <IconButton variant="ghost" onclick={handleAddCellToColumn} title="Add cell to column (vertical)">
        <Icon Icon={IconRowInsertBottom} size="1.25rem" />
      </IconButton>
      <IconButton variant="ghost" onclick={handleDeleteCell} disabled={!canDelete} title="Delete selected cell">
        <Icon Icon={IconX} size="1.25rem" />
      </IconButton>
    </div>
  </div>

  <CardWellLayoutPreview
    {layout}
    {stacks}
    {cardSizes}
    {trayLetter}
    {selectedCellId}
    {trayWidth}
    {trayDepth}
    {clearance}
    {wallThickness}
    onSelectCell={handleSelectCell}
  />
</div>

<style>
  .cardWellLayoutEditor {
    display: flex;
    flex-direction: column;
  }

  .cardWellLayoutEditor__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .cardWellLayoutEditor__toolbarButtons {
    display: flex;
    gap: 0.25rem;
  }

  .cardWellLayoutEditor__hint {
    font-size: 0.7rem;
    color: var(--fgMuted);
    margin: 0;
  }
</style>
