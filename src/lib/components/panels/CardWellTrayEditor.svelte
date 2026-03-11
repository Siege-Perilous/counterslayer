<script lang="ts">
  import { Input, FormControl, Spacer, Select, IconButton, Icon } from '@tableslayer/ui';
  import { IconRotate2 } from '@tabler/icons-svelte';
  import type { CardWellTray } from '$lib/types/project';
  import { type CardWellTrayParams, getCardWellTrayDimensions, syncStacksWithLayout } from '$lib/models/cardWellTray';
  import { getAllCellIds, type CardWellLayout } from '$lib/types/cardWellLayout';
  import { getCardSizes } from '$lib/stores/project.svelte';
  import CardWellLayoutEditor from './CardWellLayoutEditor.svelte';

  interface Props {
    tray: CardWellTray;
    trayLetter: string;
    onUpdateParams: (params: CardWellTrayParams) => void;
    actualHeight?: number;
    displayDimensions?: { width: number; depth: number; height: number } | null;
  }

  let { tray, trayLetter, onUpdateParams, actualHeight, displayDimensions }: Props = $props();

  // Get available cell IDs from layout
  let cellIds = $derived(getAllCellIds(tray.params.layout));

  // Get default card size ID for new stacks
  let defaultCardSizeId = $derived(getCardSizes()[0]?.id ?? '');

  // Compute dimensions
  let dimensions = $derived.by(() => {
    if (displayDimensions) {
      return displayDimensions;
    }
    const baseDims = getCardWellTrayDimensions(tray.params, getCardSizes());
    return {
      ...baseDims,
      height: actualHeight && actualHeight > baseDims.height ? actualHeight : baseDims.height
    };
  });

  function updateParam<K extends keyof CardWellTrayParams>(key: K, value: CardWellTrayParams[K]) {
    onUpdateParams({ ...tray.params, [key]: value });
  }

  // Layout update handler - syncs stacks when layout changes (adds/removes as needed)
  function handleLayoutUpdate(layout: CardWellLayout) {
    const syncedStacks = syncStacksWithLayout(tray.params.stacks, layout, defaultCardSizeId);
    onUpdateParams({ ...tray.params, layout, stacks: syncedStacks });
  }

  // Stack handlers
  function updateStack(index: number, field: 'cardSizeId' | 'count' | 'rotation', value: string | number) {
    const newStacks = [...tray.params.stacks];
    const current = newStacks[index];
    if (field === 'cardSizeId') {
      newStacks[index] = { ...current, cardSizeId: value as string };
    } else if (field === 'count') {
      newStacks[index] = { ...current, count: value as number };
    } else if (field === 'rotation') {
      newStacks[index] = { ...current, rotation: value as 0 | 90 };
    }
    onUpdateParams({ ...tray.params, stacks: newStacks });
  }

  // Toggle rotation between 0 and 90
  function toggleRotation(index: number) {
    const current = tray.params.stacks[index];
    const newRotation = (current.rotation ?? 0) === 0 ? 90 : 0;
    updateStack(index, 'rotation', newRotation);
  }

  // Get ref number for a cell ID (1-based)
  function getCellRefNumber(cellId: string): number {
    return cellIds.indexOf(cellId) + 1;
  }

  // Sort stacks by cell reference number for display
  let sortedStacks = $derived(
    [...tray.params.stacks].sort((a, b) => getCellRefNumber(a.cellId) - getCellRefNumber(b.cellId))
  );
</script>

<div class="panelFormSection">
  <section class="section">
    <h3 class="sectionTitle">Layout</h3>
    <CardWellLayoutEditor
      layout={tray.params.layout}
      stacks={tray.params.stacks}
      cardSizes={getCardSizes()}
      {trayLetter}
      trayWidth={dimensions.width}
      trayDepth={dimensions.depth}
      clearance={tray.params.clearance}
      wallThickness={tray.params.wallThickness}
      onUpdateLayout={handleLayoutUpdate}
    />
  </section>

  <Spacer size="0.5rem" />

  <section class="section">
    <h3 class="sectionTitle">Card Stacks</h3>
    <Spacer size="0.5rem" />
    <div class="stackList">
      {#each sortedStacks as stack (stack.id)}
        {@const stackIndex = tray.params.stacks.findIndex((s) => s.id === stack.id)}
        {@const rotation = stack.rotation ?? 0}
        <div class="stackRow">
          <span class="cellRef">{trayLetter}{getCellRefNumber(stack.cellId)}</span>
          <div class="stackCardSelect">
            <Select
              selected={[stack.cardSizeId]}
              options={getCardSizes().map((s) => ({
                value: s.id,
                label: s.name
              }))}
              onSelectedChange={(selected) => updateStack(stackIndex, 'cardSizeId', selected[0])}
            />
          </div>
          <Input
            type="number"
            min="1"
            value={stack.count}
            onchange={(e) => updateStack(stackIndex, 'count', parseInt(e.currentTarget.value))}
            style="width: 3.5rem;"
          />
          <IconButton
            variant="ghost"
            onclick={() => toggleRotation(stackIndex)}
            title={rotation === 0 ? 'Rotate 90°' : 'Rotate 0°'}
            color={rotation === 90 ? 'var(--fg)' : 'var(--fgMuted)'}
          >
            <Icon Icon={IconRotate2} color={rotation === 90 ? 'var(--fg)' : 'var(--fgMuted)'} />
          </IconButton>
        </div>
      {/each}
    </div>
  </section>

  <Spacer size="0.5rem" />

  <section class="section">
    <div class="sectionHeader">
      <h3 class="sectionTitle">Tray Settings</h3>
      {#if dimensions}
        <span class="dimensionsInfo">
          {dimensions.width.toFixed(1)} × {dimensions.depth.toFixed(1)} × {dimensions.height.toFixed(1)} mm
        </span>
      {/if}
    </div>
    <Spacer size="0.5rem" />
    <div class="formGrid">
      <FormControl label="Wall" name="wallThickness">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="number"
            step="0.1"
            value={tray.params.wallThickness}
            onchange={(e) => updateParam('wallThickness', parseFloat(e.currentTarget.value))}
          />
        {/snippet}
        {#snippet end()}mm{/snippet}
      </FormControl>
      <FormControl label="Floor" name="floorThickness">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="number"
            step="0.1"
            value={tray.params.floorThickness}
            onchange={(e) => updateParam('floorThickness', parseFloat(e.currentTarget.value))}
          />
        {/snippet}
        {#snippet end()}mm{/snippet}
      </FormControl>
      <FormControl label="Clearance" name="clearance">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="number"
            step="0.1"
            value={tray.params.clearance}
            onchange={(e) => updateParam('clearance', parseFloat(e.currentTarget.value))}
          />
        {/snippet}
        {#snippet end()}mm{/snippet}
      </FormControl>
      <FormControl label="Rim" name="rimHeight">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="number"
            step="0.1"
            value={tray.params.rimHeight}
            onchange={(e) => updateParam('rimHeight', parseFloat(e.currentTarget.value))}
          />
        {/snippet}
        {#snippet end()}mm{/snippet}
      </FormControl>
    </div>
  </section>
</div>

<style>
  .panelFormSection {
    padding: 0 0.75rem;
  }

  .section {
    margin-bottom: 1rem;
  }

  .sectionHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .sectionTitle {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--fgMuted);
  }

  .sectionHeader .sectionTitle {
    margin-bottom: 0;
  }

  .formGrid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .stackList {
    display: flex;
    flex-direction: column;
  }

  .stackRow {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0;
  }

  .cellRef {
    width: 2rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--fgMuted);
    flex-shrink: 0;
  }

  .stackCardSelect {
    flex: 1;
    min-width: 0;
  }

  .dimensionsInfo {
    font-size: 0.75rem;
    color: var(--fgMuted);
    margin: 0;
  }
</style>
