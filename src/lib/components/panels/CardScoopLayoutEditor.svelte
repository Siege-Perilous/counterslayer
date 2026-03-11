<script lang="ts">
  import { IconButton, Icon, Spacer } from '@tableslayer/ui';
  import { IconRowInsertBottom, IconColumnInsertRight, IconX } from '@tabler/icons-svelte';
  import type { CardScoopLayout, LegacyCardScoopLayout, CellId } from '$lib/types/cardScoopLayout';
  import {
    addColumn,
    addRow,
    deleteCell,
    countCells,
    getAllCellIds,
    getCellPosition,
    ensureGridLayout
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

  // Ensure we have a grid layout
  let gridLayout = $derived(ensureGridLayout(layout));

  // Selected cell state
  let selectedCellId = $state<CellId | null>(null);

  // Ensure selection is valid when layout changes
  $effect(() => {
    const cellIds = getAllCellIds(gridLayout);
    if (selectedCellId && !cellIds.includes(selectedCellId)) {
      // Selected cell no longer exists, select first cell or null
      selectedCellId = cellIds[0] ?? null;
    } else if (!selectedCellId && cellIds.length > 0) {
      // No selection but cells exist, select first
      selectedCellId = cellIds[0];
    }
  });

  // Derived state for UI
  let canDelete = $derived(countCells(gridLayout) > 1 && selectedCellId !== null);

  // Get selected cell position for context-aware operations
  let selectedPosition = $derived(selectedCellId ? getCellPosition(gridLayout, selectedCellId) : null);

  function handleSelectCell(id: CellId) {
    selectedCellId = id;
  }

  function handleAddColumn() {
    // Add column after the selected cell's column (or at the end if nothing selected)
    const colIndex = selectedPosition?.col ?? -1;
    const newLayout = addColumn(gridLayout, colIndex);
    onUpdateLayout(newLayout);
  }

  function handleAddRow() {
    // Add row after the selected cell's row (or at the end if nothing selected)
    const rowIndex = selectedPosition?.row ?? -1;
    const newLayout = addRow(gridLayout, rowIndex);
    onUpdateLayout(newLayout);
  }

  function handleDeleteCell() {
    if (!selectedCellId || !canDelete) return;
    const newLayout = deleteCell(gridLayout, selectedCellId);
    if (newLayout) {
      onUpdateLayout(newLayout);
      selectedCellId = null;
    }
  }
</script>

<div class="cardScoopLayoutEditor">
  <div class="cardScoopLayoutEditor__toolbar">
    <span class="cardScoopLayoutEditor__hint">Add rows or columns, delete selected</span>
    <div class="cardScoopLayoutEditor__toolbarButtons">
      <IconButton variant="ghost" onclick={handleAddColumn} title="Add column">
        <Icon Icon={IconColumnInsertRight} size="1.25rem" />
      </IconButton>
      <IconButton variant="ghost" onclick={handleAddRow} title="Add row">
        <Icon Icon={IconRowInsertBottom} size="1.25rem" />
      </IconButton>
      <IconButton variant="ghost" onclick={handleDeleteCell} disabled={!canDelete} title="Delete selected cell">
        <Icon Icon={IconX} size="1.25rem" />
      </IconButton>
    </div>
  </div>

  <Spacer size="0.5rem" />

  <CardScoopLayoutPreview
    layout={gridLayout}
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
