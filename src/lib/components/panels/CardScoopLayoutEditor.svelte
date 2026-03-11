<script lang="ts">
  import { IconButton, Icon, Spacer } from '@tableslayer/ui';
  import { IconLayoutAlignCenter, IconLayoutAlignMiddle, IconX } from '@tabler/icons-svelte';
  import type { CardScoopLayout, CellId } from '$lib/types/cardScoopLayout';
  import { splitCell, deleteCell, countCells, getAllCellIds } from '$lib/types/cardScoopLayout';
  import type { CardScoopStack } from '$lib/models/cardScoopTray';
  import type { CardSize } from '$lib/types/project';
  import CardScoopLayoutPreview from './CardScoopLayoutPreview.svelte';

  interface Props {
    layout: CardScoopLayout;
    stacks: CardScoopStack[];
    cardSizes: CardSize[];
    trayWidth: number;
    trayDepth: number;
    onUpdateLayout: (layout: CardScoopLayout) => void;
  }

  let { layout, stacks, cardSizes, trayWidth, trayDepth, onUpdateLayout }: Props = $props();

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

  function handleSelectCell(id: CellId) {
    selectedCellId = id;
  }

  function handleSplitVertical() {
    if (!selectedCellId) return;
    const newLayout = splitCell(layout, selectedCellId, 'vertical');
    onUpdateLayout(newLayout);
    // Selection will be cleared since the cell no longer exists
    selectedCellId = null;
  }

  function handleSplitHorizontal() {
    if (!selectedCellId) return;
    const newLayout = splitCell(layout, selectedCellId, 'horizontal');
    onUpdateLayout(newLayout);
    // Selection will be cleared since the cell no longer exists
    selectedCellId = null;
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

<div class="cardScoopLayoutEditor">
  <div class="cardScoopLayoutEditor__toolbar">
    <span class="cardScoopLayoutEditor__hint">Select cell, then split or delete</span>
    <div class="cardScoopLayoutEditor__toolbarButtons">
      <IconButton
        variant="ghost"
        onclick={handleSplitVertical}
        disabled={!selectedCellId}
        title="Split selected cell left/right"
      >
        <Icon Icon={IconLayoutAlignCenter} size="1.25rem" />
      </IconButton>
      <IconButton
        variant="ghost"
        onclick={handleSplitHorizontal}
        disabled={!selectedCellId}
        title="Split selected cell top/bottom"
      >
        <Icon Icon={IconLayoutAlignMiddle} size="1.25rem" />
      </IconButton>
      <IconButton variant="ghost" onclick={handleDeleteCell} disabled={!canDelete} title="Delete selected cell">
        <Icon Icon={IconX} size="1.25rem" />
      </IconButton>
    </div>
  </div>

  <Spacer size="0.5rem" />

  <CardScoopLayoutPreview
    {layout}
    {stacks}
    {cardSizes}
    {selectedCellId}
    {trayWidth}
    {trayDepth}
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
