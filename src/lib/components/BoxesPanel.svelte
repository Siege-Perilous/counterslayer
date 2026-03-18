<script lang="ts">
  import { Input, InputCheckbox, FormControl, Spacer, Hr, IconButton, Icon, Select, Text } from '@tableslayer/ui';
  import { IconX, IconPlus } from '@tabler/icons-svelte';
  import type { Box } from '$lib/types/project';
  import { getAllBoxes, getProject, moveBoxToLayer } from '$lib/stores/project.svelte';
  import { calculateMinimumBoxDimensions, getLidHeight } from '$lib/models/box';
  import { calculateLayerHeight } from '$lib/models/layer';
  import { getCardSizes, getCounterShapes } from '$lib/stores/project.svelte';

  interface Props {
    selectedBox: Box | null;
    onSelectBox: (box: Box) => void;
    onAddBox: () => void;
    onDeleteBox: (boxId: string) => void;
    onUpdateBox: (updates: Partial<Omit<Box, 'id' | 'trays'>>) => void;
    hideList?: boolean;
  }

  let { selectedBox, onSelectBox, onAddBox, onDeleteBox, onUpdateBox, hideList = false }: Props = $props();

  // Get all boxes from all layers
  const allBoxes = $derived(getAllBoxes());

  // Get layer options for move dropdown (includes "New Layer" option)
  const layerOptions = $derived.by(() => {
    const project = getProject();
    const options = project.layers.map((layer) => ({
      value: layer.id,
      label: layer.name
    }));
    // Always add "New Layer" option
    options.push({
      value: 'new',
      label: '+ New Layer'
    });
    return options;
  });

  // Get current layer for the selected box
  const currentLayerId = $derived.by(() => {
    if (!selectedBox) return '';
    const project = getProject();
    for (const layer of project.layers) {
      if (layer.boxes.some((b) => b.id === selectedBox.id)) {
        return layer.id;
      }
    }
    return '';
  });

  // Handle layer change (can be existing layer ID or 'new')
  function handleLayerChange(layerId: string) {
    if (!selectedBox) return;
    // Allow 'new' or a different layer
    if (layerId !== 'new' && layerId === currentLayerId) return;
    moveBoxToLayer(selectedBox.id, layerId);
  }

  // Get global card sizes and counter shapes (shared across all boxes)
  const customCardSizes = $derived(getCardSizes());
  const customCounterShapes = $derived(getCounterShapes());

  const minimums = $derived(
    selectedBox
      ? calculateMinimumBoxDimensions(selectedBox, customCardSizes, customCounterShapes)
      : { minWidth: 0, minDepth: 0, minHeight: 0 }
  );

  // Lid height for total height calculations
  const lidHeight = $derived(selectedBox ? getLidHeight(selectedBox) : 0);

  // Minimum total height (box + lid) for display
  const minTotalHeight = $derived(minimums.minHeight + lidHeight);

  // Display value for height input: convert box height to total height
  const displayTotalHeight = $derived(
    selectedBox?.customBoxHeight !== undefined ? selectedBox.customBoxHeight + lidHeight : undefined
  );

  // Get the layer height for the selected box's layer
  const layerHeight = $derived.by(() => {
    if (!selectedBox) return 0;
    const project = getProject();
    for (const layer of project.layers) {
      if (layer.boxes.some((b) => b.id === selectedBox.id)) {
        return calculateLayerHeight(layer, {
          cardSizes: customCardSizes,
          counterShapes: customCounterShapes
        });
      }
    }
    return 0;
  });

  // Natural box height (without layer adjustment)
  const naturalBoxHeight = $derived(selectedBox ? (selectedBox.customBoxHeight ?? minimums.minHeight) + lidHeight : 0);

  // Actual box dimensions (custom or auto-calculated)
  // Height is adjusted to match layer height when box is in a layer with taller items
  const boxDimensions = $derived(
    selectedBox
      ? {
          width: selectedBox.customWidth ?? minimums.minWidth,
          depth: selectedBox.customDepth ?? minimums.minDepth,
          height: layerHeight > 0 ? Math.max(naturalBoxHeight, layerHeight) : naturalBoxHeight
        }
      : null
  );
</script>

<div class="boxesPanel">
  <!-- Box List -->
  {#if !hideList}
    <div class="panelList">
      <div class="panelListHeader">
        <span class="panelListTitle">Boxes</span>
        <IconButton onclick={onAddBox} title="Add new box" size="sm" variant="ghost">
          <Icon Icon={IconPlus} />
        </IconButton>
      </div>
      <div class="panelListItems">
        {#each allBoxes as box (box.id)}
          <div
            class="listItem {selectedBox?.id === box.id ? 'listItem--selected' : ''}"
            onclick={() => onSelectBox(box)}
            role="button"
            tabindex="0"
            onkeydown={(e) => e.key === 'Enter' && onSelectBox(box)}
          >
            <span style="overflow: hidden; text-overflow: ellipsis;">{box.name}</span>
            {#if allBoxes.length > 1}
              <IconButton
                onclick={(e: MouseEvent) => {
                  e.stopPropagation();
                  onDeleteBox(box.id);
                }}
                title="Delete box"
                size="sm"
                variant="ghost"
              >
                <Icon color="var(--fgMuted)" Icon={IconX} />
              </IconButton>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Box Settings -->
  {#if selectedBox}
    <div class="panelForm">
      <div class="panelFormSection">
        <FormControl label="Name" name="boxName">
          {#snippet input({ inputProps })}
            <Input
              {...inputProps}
              type="text"
              value={selectedBox.name}
              onchange={(e) => onUpdateBox({ name: (e.target as HTMLInputElement).value })}
            />
          {/snippet}
        </FormControl>

        <Spacer size="0.75rem" />

        <!-- Move to Layer -->
        <FormControl label="Layer" name="moveToLayer">
          {#snippet input({ inputProps })}
            <Select
              {...inputProps}
              selected={currentLayerId ? [currentLayerId] : []}
              options={layerOptions}
              onSelectedChange={(selected) => {
                if (selected[0]) {
                  handleLayerChange(selected[0]);
                }
              }}
            />
          {/snippet}
        </FormControl>

        <Spacer size="0.75rem" />

        <div class="formGrid">
          <FormControl label="Tolerance" name="tolerance">
            {#snippet input({ inputProps })}
              <Input
                {...inputProps}
                type="number"
                step="0.1"
                min="0"
                value={selectedBox.tolerance}
                onchange={(e) =>
                  onUpdateBox({
                    tolerance: parseFloat((e.target as HTMLInputElement).value) || 0.5
                  })}
              />
            {/snippet}
            {#snippet end()}mm{/snippet}
          </FormControl>
          <FormControl label="Wall" name="wallThickness">
            {#snippet input({ inputProps })}
              <Input
                {...inputProps}
                type="number"
                step="0.5"
                min="1"
                value={selectedBox.wallThickness}
                onchange={(e) =>
                  onUpdateBox({
                    wallThickness: parseFloat((e.target as HTMLInputElement).value) || 2.0
                  })}
              />
            {/snippet}
            {#snippet end()}mm{/snippet}
          </FormControl>
          <FormControl label="Floor" name="floorThickness" class="formGrid__spanTwo">
            {#snippet input({ inputProps })}
              <Input
                {...inputProps}
                type="number"
                step="0.5"
                min="1"
                value={selectedBox.floorThickness}
                onchange={(e) =>
                  onUpdateBox({
                    floorThickness: parseFloat((e.target as HTMLInputElement).value) || 2.0
                  })}
              />
            {/snippet}
            {#snippet end()}mm{/snippet}
          </FormControl>
        </div>
      </div>

      <Hr />

      <div class="panelFormSection">
        <!-- Box Size -->
        <div class="sectionHeader">
          <h4 class="sectionTitle">Box Size</h4>
          {#if boxDimensions}
            <span class="dimensionsInfo">
              {boxDimensions.width.toFixed(1)} × {boxDimensions.depth.toFixed(1)} × {boxDimensions.height.toFixed(1)} mm
            </span>
          {/if}
        </div>
        <Spacer size="0.5rem" />

        <div class="formGrid">
          <FormControl label="Width (min: {minimums.minWidth.toFixed(1)})" name="customWidth">
            {#snippet input({ inputProps })}
              <Input
                {...inputProps}
                type="number"
                step="0.5"
                min={minimums.minWidth}
                value={selectedBox.customWidth ?? ''}
                onchange={(e) => {
                  const v = (e.target as HTMLInputElement).value.trim();
                  onUpdateBox({ customWidth: v ? parseFloat(v) : undefined });
                }}
                placeholder="Auto"
              />
            {/snippet}
            {#snippet end()}mm{/snippet}
          </FormControl>
          <FormControl label="Depth (min: {minimums.minDepth.toFixed(1)})" name="customDepth">
            {#snippet input({ inputProps })}
              <Input
                {...inputProps}
                type="number"
                step="0.5"
                min={minimums.minDepth}
                value={selectedBox.customDepth ?? ''}
                onchange={(e) => {
                  const v = (e.target as HTMLInputElement).value.trim();
                  onUpdateBox({ customDepth: v ? parseFloat(v) : undefined });
                }}
                placeholder="Auto"
              />
            {/snippet}
            {#snippet end()}mm{/snippet}
          </FormControl>
          <FormControl
            label="Total Height (min: {minTotalHeight.toFixed(1)})"
            name="customBoxHeight"
            class="formGrid__spanTwo"
          >
            {#snippet input({ inputProps })}
              <Input
                {...inputProps}
                type="number"
                step="0.5"
                min={minTotalHeight}
                value={displayTotalHeight ?? ''}
                onchange={(e) => {
                  const v = (e.target as HTMLInputElement).value.trim();
                  // Convert total height to box-only height by subtracting lid
                  const boxHeight = v ? parseFloat(v) - lidHeight : undefined;
                  onUpdateBox({ customBoxHeight: boxHeight });
                }}
                placeholder="Auto"
              />
            {/snippet}
            {#snippet end()}mm{/snippet}
          </FormControl>
        </div>
      </div>

      <Hr />

      <div class="panelFormSection">
        <div class="sectionHeader">
          <h4 class="sectionTitle">Print options</h4>
        </div>
        <Spacer size="0.5rem" />
        <InputCheckbox
          checked={selectedBox.fillSolidEmpty ?? false}
          onchange={(e) => onUpdateBox({ fillSolidEmpty: (e.target as HTMLInputElement).checked })}
          label="Fill empty space solid"
        />
        <Spacer size="0.5rem" />
        <InputCheckbox
          checked={selectedBox.lidParams?.honeycombEnabled ?? false}
          onchange={(e) => {
            const enabled = (e.target as HTMLInputElement).checked;
            onUpdateBox({
              lidParams: {
                ...selectedBox.lidParams,
                honeycombEnabled: enabled,
                // Turn off emboss when honeycomb is enabled
                showName: enabled ? false : (selectedBox.lidParams?.showName ?? true)
              }
            });
          }}
          label="Honeycomb for lid and box bottom"
        />
        <Spacer size="0.5rem" />
        <span class={selectedBox.lidParams?.honeycombEnabled ? 'disabledOption' : ''}>
          <InputCheckbox
            checked={!selectedBox.lidParams?.honeycombEnabled && (selectedBox.lidParams?.showName ?? true)}
            disabled={selectedBox.lidParams?.honeycombEnabled ?? false}
            onchange={(e) =>
              onUpdateBox({
                lidParams: {
                  ...selectedBox.lidParams,
                  showName: (e.target as HTMLInputElement).checked
                }
              })}
            label="Emboss name on lid top"
          />
        </span>
        {#if selectedBox.lidParams?.honeycombEnabled}
          <Spacer size="0.5rem" />
          <Text color="var(--fgMuted)" size="0.875rem">
            Text embossing is disabled when honeycomb pattern is enabled
          </Text>
        {/if}
      </div>
    </div>
  {:else}
    <div class="emptyState">
      <p class="emptyStateText">No box selected</p>
    </div>
  {/if}
</div>

<style>
  .boxesPanel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .panelList {
    padding: 0.5rem;
    border-bottom: var(--borderThin);
    background: var(--contrastLow);
  }

  .panelListHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0.25rem;
    margin-bottom: 0.5rem;
  }

  .panelListTitle {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--fgMuted);
  }

  .panelListItems {
    max-height: 10rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .listItem {
    display: flex;
    cursor: pointer;
    align-items: center;
    justify-content: space-between;
    padding: 0.25rem;
    border-radius: var(--radius-2);
    font-size: 0.875rem;
  }

  .listItem:hover {
    background: var(--contrastMedium);
  }

  .listItem--selected {
    color: var(--fgPrimary);
    font-weight: 600;
  }

  .panelForm {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .panelFormSection {
    padding: 0 0.75rem;
  }

  .formGrid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  :global(.formGrid__spanTwo) {
    grid-column: span 2;
  }

  .sectionHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .sectionTitle {
    margin-bottom: 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--fgMuted);
  }

  .sectionHeader .sectionTitle {
    margin-bottom: 0;
  }

  .dimensionsInfo {
    font-size: 0.75rem;
    color: var(--fgMuted);
    margin: 0;
  }

  .emptyState {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    color: var(--fgMuted);
  }

  .emptyStateText {
    font-size: 0.875rem;
  }

  .disabledOption {
    text-decoration: line-through;
    opacity: 0.6;
  }
</style>
