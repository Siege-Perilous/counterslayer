<script lang="ts">
  import { IconButton, Icon, Spacer } from '@tableslayer/ui';
  import { IconRowInsertBottom, IconColumnInsertRight, IconX } from '@tabler/icons-svelte';
  import type { CardScoopLayout, LegacyCardScoopLayout, CellId } from '$lib/types/cardScoopLayout';
  import {
    addCellToColumn,
    addColumn,
    deleteCell,
    countCells,
    getAllCellIds,
    getCellPosition,
    ensureColumnLayout
  } from '$lib/types/cardScoopLayout';
  import type { CardScoopStack } from '$lib/models/cardScoopTray';
  import type { CardSize } from '$lib/types/project';
  import CardScoopLayoutPreview from './CardScoopLayoutPreview.svelte';

  interface Props {
    layout: CardScoopLayout | LegacyCardScoopLayout;
    stacks: CardScoopStack[];
    cardSizes: CardSize[];
    trayWidth: number;
    trayDepth: number;
    clearance: number;
    wallThickness: number;
    onUpdateLayout: (layout: CardScoopLayout) => void;
  }

  let { layout, stacks, cardSizes, trayWidth, trayDepth, clearance, wallThickness, onUpdateLayout }: Props = $props();

  // Ensure we have a column layout
  let columnLayout = $derived(ensureColumnLayout(layout));

  // Selected cell state
  let selectedCellId = $state<CellId | null>(null);

  // Ensure selection is valid when layout changes
  $effect(() => {
    const cellIds = getAllCellIds(columnLayout);
    if (selectedCellId && !cellIds.includes(selectedCellId)) {
      // Selected cell no longer exists, select first cell or null
      selectedCellId = cellIds[0] ?? null;
    } else if (!selectedCellId && cellIds.length > 0) {
      // No selection but cells exist, select first
      selectedCellId = cellIds[0];
    }
  });

  // Derived state for UI
  let canDelete = $derived(countCells(columnLayout) > 1 && selectedCellId !== null);

  // Get selected cell position for context-aware operations
  let selectedPosition = $derived(selectedCellId ? getCellPosition(columnLayout, selectedCellId) : null);

  function handleSelectCell(id: CellId) {
    selectedCellId = id;
  }

  function handleAddCellToColumn() {
    // Add a cell to the same column (vertically) after the selected cell
    if (!selectedPosition) {
      // No selection, add to first column
      const newLayout = addCellToColumn(columnLayout, 0, -1);
      onUpdateLayout(newLayout);
      return;
    }
    const newLayout = addCellToColumn(columnLayout, selectedPosition.colIndex, selectedPosition.cellIndex);
    onUpdateLayout(newLayout);
  }

  function handleAddColumn() {
    // Add a new column (horizontally) after the selected cell's column
    const colIndex = selectedPosition?.colIndex ?? -1;
    const newLayout = addColumn(columnLayout, colIndex);
    onUpdateLayout(newLayout);
  }

  function handleDeleteCell() {
    if (!selectedCellId || !canDelete) return;
    const newLayout = deleteCell(columnLayout, selectedCellId);
    if (newLayout) {
      onUpdateLayout(newLayout);
      selectedCellId = null;
    }
  }
</script>

<div class="cardScoopLayoutEditor">
  <div class="cardScoopLayoutEditor__toolbar">
    <span class="cardScoopLayoutEditor__hint">Add cells to columns or add new columns</span>
    <div class="cardScoopLayoutEditor__toolbarButtons">
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

  <Spacer size="0.5rem" />

  <CardScoopLayoutPreview
    layout={columnLayout}
    {stacks}
    {cardSizes}
    {selectedCellId}
    {trayWidth}
    {trayDepth}
    {clearance}
    {wallThickness}
    onSelectCell={handleSelectCell}
  />
</div>

<style>
  .cardScoopLayoutEditor {
    display: flex;
    flex-direction: column;
  }

  .cardScoopLayoutEditor__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .cardScoopLayoutEditor__toolbarButtons {
    display: flex;
    gap: 0.25rem;
  }

  .cardScoopLayoutEditor__hint {
    font-size: 0.7rem;
    color: var(--fgMuted);
    margin: 0;
  }
</style>
