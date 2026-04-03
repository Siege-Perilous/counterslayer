<script lang="ts">
  import { Panel, Title, Input, FormControl, Spacer, Text } from '@tableslayer/ui';
  import GlobalsPanel from './GlobalsPanel.svelte';
  import BoxesPanel from './BoxesPanel.svelte';
  import TraysPanel from './TraysPanel.svelte';
  import {
    getProject,
    getSelectedBox,
    getSelectedTray,
    getSelectedLayer,
    updateBox,
    updateTray,
    updateTrayParams,
    updateCardTrayParams,
    updateCardDividerTrayParams,
    updateCardWellTrayParams,
    updateCupTrayParams,
    updateLayer,
    getTrayLetterById,
    isCounterTray,
    isCardTray,
    isCardDividerTray,
    isCardWellTray,
    isCupTray,
    getGlobalSettings,
    updateGlobalSettings,
    type Box,
    type Layer,
    type Tray
  } from '$lib/stores/project.svelte';
  import type { CounterTrayParams } from '$lib/models/counterTray';
  import type { CardDrawTrayParams } from '$lib/models/cardTray';
  import type { CardDividerTrayParams } from '$lib/models/cardDividerTray';
  import type { CardWellTrayParams } from '$lib/models/cardWellTray';
  import type { CupTrayParams } from '$lib/models/cupTray';
  import { countCups } from '$lib/types/cupLayout';
  import { countCells } from '$lib/types/cardWellLayout';
  import { layoutEditorState } from '$lib/stores/layoutEditor.svelte';
  import { getTrayDimensionsForTray } from '$lib/models/box';
  import { getBoxDimensions, calculateLayerHeight } from '$lib/models/layer';

  type SelectionType = 'dimensions' | 'layer' | 'box' | 'tray';

  interface Props {
    selectionType: SelectionType;
    isLayoutEditMode?: boolean;
    gameContainerWidth?: number;
    gameContainerDepth?: number;
  }

  let { selectionType, isLayoutEditMode = false, gameContainerWidth = 256, gameContainerDepth = 256 }: Props = $props();

  // Layout editor dimensions
  let interiorWidth = $derived(layoutEditorState.boundsWidth);
  let interiorDepth = $derived(layoutEditorState.boundsDepth);

  let project = $derived(getProject());
  let selectedLayer = $derived(getSelectedLayer());
  let selectedBox = $derived(getSelectedBox());
  let selectedTray = $derived(getSelectedTray());

  function handleLayerUpdate(updates: Partial<Omit<Layer, 'id' | 'boxes' | 'looseTrays'>>) {
    if (selectedLayer) {
      updateLayer(selectedLayer.id, updates);
    }
  }

  function handleBoxUpdate(updates: Partial<Omit<Box, 'id' | 'trays'>>) {
    if (selectedBox) {
      updateBox(selectedBox.id, updates);
    }
  }

  function handleTrayUpdate(updates: Partial<Omit<Tray, 'id'>>) {
    if (selectedTray) {
      updateTray(selectedTray.id, updates);
    }
  }

  // Get global settings from project store
  let globalSettings = $derived(getGlobalSettings());

  function handleGlobalSettingsChange(updates: { gameContainerWidth?: number; gameContainerDepth?: number }) {
    updateGlobalSettings(updates);
  }

  function handleCounterParamsChange(newParams: CounterTrayParams) {
    if (selectedTray && isCounterTray(selectedTray)) {
      updateTrayParams(selectedTray.id, newParams);
    }
  }

  function handleCardParamsChange(newParams: CardDrawTrayParams) {
    if (selectedTray && isCardTray(selectedTray)) {
      updateCardTrayParams(selectedTray.id, newParams);
    }
  }

  function handleCardDividerParamsChange(newParams: CardDividerTrayParams) {
    if (selectedTray && isCardDividerTray(selectedTray)) {
      updateCardDividerTrayParams(selectedTray.id, newParams);
    }
  }

  function handleCupParamsChange(newParams: CupTrayParams) {
    if (selectedTray && isCupTray(selectedTray)) {
      updateCupTrayParams(selectedTray.id, newParams);
    }
  }

  function handleCardWellParamsChange(newParams: CardWellTrayParams) {
    if (selectedTray && isCardWellTray(selectedTray)) {
      updateCardWellTrayParams(selectedTray.id, newParams);
    }
  }

  // Get tray stats for display
  function getTrayStats(tray: Tray): {
    stacks: number;
    counters: number;
    letter: string;
    isCards: boolean;
    isCups: boolean;
  } {
    let stacks = 0;
    let counters = 0;
    let isCards = false;
    let isCups = false;

    if (isCupTray(tray)) {
      stacks = countCups(tray.params.layout);
      counters = stacks;
      isCups = true;
    } else if (isCardWellTray(tray)) {
      stacks = countCells(tray.params.layout);
      counters = tray.params.stacks.reduce((sum, s) => sum + s.count, 0);
      isCards = true;
    } else if (isCardDividerTray(tray)) {
      stacks = tray.params.stacks.length;
      counters = tray.params.stacks.reduce((sum, s) => sum + s.count, 0);
      isCards = true;
    } else if (isCounterTray(tray)) {
      const topCount = tray.params.topLoadedStacks.reduce((sum, s) => sum + s[1], 0);
      const edgeCount = tray.params.edgeLoadedStacks.reduce((sum, s) => sum + s[1], 0);
      stacks = tray.params.topLoadedStacks.length + tray.params.edgeLoadedStacks.length;
      counters = topCount + edgeCount;
    } else if (isCardTray(tray)) {
      stacks = 1;
      counters = tray.params.cardCount;
      isCards = true;
    }

    const project = getProject();
    let letter = getTrayLetterById(project.layers, tray.id);
    if (!letter) {
      letter = 'A';
    }
    return { stacks, counters, letter, isCards, isCups };
  }

  let panelTitle = $derived.by(() => {
    switch (selectionType) {
      case 'dimensions':
        return 'Dimensions';
      case 'layer':
        return selectedLayer?.name ?? 'Layer';
      case 'box':
        return selectedBox?.name ?? 'Box';
      case 'tray':
        return selectedTray?.name ?? 'Tray';
    }
  });
</script>

<aside class="editorPanel">
  <Panel class="editorPanelInner">
    <!-- Header -->
    <div class="panelHeader">
      <Title as="h2" size="sm">
        {panelTitle}
      </Title>
      {#if selectionType === 'layer' && selectedLayer}
        {@const boxCount = selectedLayer.boxes.length}
        {@const looseCount = selectedLayer.looseTrays.length}
        <span class="headerStats">{boxCount} {boxCount === 1 ? 'box' : 'boxes'}, {looseCount} loose</span>
      {:else if selectionType === 'box' && selectedBox}
        <span class="headerStats">{selectedBox.trays.length} {selectedBox.trays.length === 1 ? 'tray' : 'trays'}</span>
      {:else if selectionType === 'tray' && selectedTray}
        {@const stats = getTrayStats(selectedTray)}
        <span class="headerStats">
          {stats.isCups
            ? `${stats.stacks} cups`
            : `${stats.counters} ${stats.isCards ? 'cards' : 'counters'} in ${stats.stacks} stacks`}
        </span>
      {/if}
    </div>
    <!-- Content -->
    <div class="panelContent">
      {#if isLayoutEditMode}
        <div class="layoutEditMessage">
          <p class="hint">Drag trays to reposition. Save or cancel to continue editing.</p>
          <div class="dimensionsInfo">
            <div class="dimensionRow">
              <span class="dimensionLabel">Game container</span>
              <span class="dimensionValue">{gameContainerWidth} × {gameContainerDepth}mm</span>
            </div>
            {#if selectedBox}
              <div class="dimensionRow">
                <span class="dimensionLabel">Wall + tolerance</span>
                <span class="dimensionValue">{selectedBox.wallThickness + selectedBox.tolerance}mm</span>
              </div>
            {/if}
            <div class="dimensionRow highlight">
              <span class="dimensionLabel">Interior cavity max</span>
              <span class="dimensionValue">{interiorWidth.toFixed(0)} × {interiorDepth.toFixed(0)}mm</span>
            </div>
          </div>
        </div>
      {:else if selectionType === 'dimensions'}
        <GlobalsPanel {globalSettings} onGlobalSettingsChange={handleGlobalSettingsChange} />
      {:else if selectionType === 'layer'}
        {#if selectedLayer}
          {@const cardSizes = project.cardSizes ?? []}
          {@const counterShapes = project.counterShapes ?? []}
          {@const layerHeight = calculateLayerHeight(selectedLayer, { cardSizes, counterShapes })}
          <div class="layerSettings">
            <div class="panelFormSection">
              <FormControl label="Layer name" name="layerName">
                {#snippet input({ inputProps })}
                  <Input
                    {...inputProps}
                    type="text"
                    value={selectedLayer.name}
                    onchange={(e) => handleLayerUpdate({ name: (e.target as HTMLInputElement).value })}
                  />
                {/snippet}
              </FormControl>
              <Spacer size="1rem" />
              <Text size="0.875rem" color="fgMuted">
                A <Text as="span" size="0.875rem" weight={600}>layer</Text>
                represents a horizontal slice of your game container. When editing in the layout editor, you can drag and
                drop boxes and trays to visualize them within a layer, but this has no impact on the print.
              </Text>
              <Spacer size="1rem" />
              <Text size="0.875rem" color="fgMuted">
                All boxes and loose trays in a layer are normalized to be the same height as the tallest tray. Trays
                within a box will simlarly normalize to make sure the contents don't spill. If you are targeting
                specific heights for a layer or box, please edit the stacks and heights individually in their child
                trays.
              </Text>
              <Spacer size="1rem" />
              <div class="layerContents">
                <span class="contentsLabel">Layer content dimensions</span>
                <div class="contentsTree">
                  {#each selectedLayer.boxes as box (box.id)}
                    {@const boxDims = getBoxDimensions(box, cardSizes, counterShapes)}
                    {@const boxInteriorHeight = layerHeight - box.floorThickness}
                    <div class="treeItem treeItem--box">
                      <span class="treeItemName">{box.name}</span>
                      <span class="treeItemDims">
                        {boxDims.width.toFixed(0)} × {boxDims.depth.toFixed(0)} × {layerHeight.toFixed(0)}
                      </span>
                    </div>
                    {#each box.trays as tray (tray.id)}
                      {@const trayDims = getTrayDimensionsForTray(tray, cardSizes, counterShapes)}
                      <div class="treeItem treeItem--tray treeItem--nested">
                        <span class="treeItemName">{tray.name}</span>
                        <span class="treeItemDims">
                          {trayDims.width.toFixed(0)} × {trayDims.depth.toFixed(0)} × {boxInteriorHeight.toFixed(0)}
                        </span>
                      </div>
                    {/each}
                  {/each}
                  {#each selectedLayer.looseTrays as tray (tray.id)}
                    {@const trayDims = getTrayDimensionsForTray(tray, cardSizes, counterShapes)}
                    <div class="treeItem treeItem--looseTray">
                      <span class="treeItemName">{tray.name}</span>
                      <span class="treeItemDims">
                        {trayDims.width.toFixed(0)} × {trayDims.depth.toFixed(0)} × {layerHeight.toFixed(0)}
                      </span>
                    </div>
                  {/each}
                  {#if selectedLayer.boxes.length === 0 && selectedLayer.looseTrays.length === 0}
                    <div class="treeEmpty">No items in layer</div>
                  {/if}
                </div>
              </div>
            </div>
          </div>
        {:else}
          <div class="emptyState">
            <p>No layer selected</p>
          </div>
        {/if}
      {:else if selectionType === 'box'}
        {#if selectedBox}
          <BoxesPanel
            {selectedBox}
            onSelectBox={() => {}}
            onAddBox={() => {}}
            onDeleteBox={() => {}}
            onUpdateBox={handleBoxUpdate}
            hideList={true}
          />
        {:else}
          <div class="emptyState">
            <p>No box selected</p>
          </div>
        {/if}
      {:else if selectionType === 'tray'}
        {#if selectedTray}
          <TraysPanel
            {selectedBox}
            {selectedTray}
            onSelectTray={() => {}}
            onAddTray={() => {}}
            onDeleteTray={() => {}}
            onUpdateTray={handleTrayUpdate}
            onUpdateCounterParams={handleCounterParamsChange}
            onUpdateCardParams={handleCardParamsChange}
            onUpdateCardDividerParams={handleCardDividerParamsChange}
            onUpdateCardWellParams={handleCardWellParamsChange}
            onUpdateCupParams={handleCupParamsChange}
            hideList={true}
          />
        {:else}
          <div class="emptyState">
            <p>No tray selected</p>
          </div>
        {/if}
      {/if}
    </div>
  </Panel>
</aside>

<style>
  .editorPanel {
    height: 100%;
    background: var(--contrastEmpty);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  :global(.editorPanelInner) {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    margin: 1rem;
    margin-left: 0;
    margin-right: 0.75rem;
  }

  .panelHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border-bottom: var(--borderThin);
    flex-shrink: 0;
  }

  .panelContent {
    flex: 1;
    overflow-y: auto;
  }

  .emptyState {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
    color: var(--fgMuted);
    font-size: 0.875rem;
  }

  .layoutEditMessage {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
  }

  .layoutEditMessage .hint {
    font-size: 0.75rem;
    color: var(--fgMuted);
  }

  .dimensionsInfo {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-top: 0.75rem;
    background: var(--contrastLowest);
    border-radius: var(--radius-2);
  }

  .dimensionRow {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.75rem;
  }

  .dimensionRow.highlight {
    padding-top: 0.5rem;
    margin-top: 0.25rem;
    border-top: var(--borderThin);
  }

  .dimensionLabel {
    color: var(--fgMuted);
  }

  .dimensionValue {
    font-family: var(--font-mono);
    color: var(--fg);
  }

  .dimensionRow.highlight .dimensionValue {
    font-weight: 600;
  }

  .headerStats {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--fgMuted);
  }

  .layerSettings {
    padding: 0.75rem 0;
  }

  .panelFormSection {
    padding: 0 0.75rem;
  }

  .layerContents {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .contentsLabel {
    font-size: 0.75rem;
    color: var(--fgMuted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .contentsTree {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    background: var(--contrastLowest);
    border-radius: var(--radius-2);
  }

  .treeItem {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.75rem;
    padding: 0.25rem 0;
    border-radius: var(--radius-1);
  }

  .treeItem--box {
    font-weight: 600;
  }

  .treeItem--nested {
    margin-left: 1rem;
    background: transparent;
    border-left: 2px solid var(--borderColor);
  }

  .treeItem--looseTray {
    background: transparent;
  }

  .treeItemName {
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .treeItemDims {
    font-family: var(--font-mono);
    color: var(--fgMuted);
    font-size: 0.6875rem;
    flex-shrink: 0;
    margin-left: 0.5rem;
  }

  .treeEmpty {
    font-size: 0.75rem;
    color: var(--fgMuted);
    font-style: italic;
    padding: 0.5rem;
  }
</style>
