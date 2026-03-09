<script lang="ts">
  import { Panel, Title } from '@tableslayer/ui';
  import GlobalsPanel from './GlobalsPanel.svelte';
  import BoxesPanel from './BoxesPanel.svelte';
  import TraysPanel from './TraysPanel.svelte';
  import {
    getProject,
    getSelectedBox,
    getSelectedTray,
    updateBox,
    updateTray,
    updateTrayParams,
    updateCardTrayParams,
    updateCardDividerTrayParams,
    updateCupTrayParams,
    getCumulativeTrayLetter,
    isCounterTray,
    isCardTray,
    isCardDividerTray,
    isCupTray,
    getGlobalSettings,
    updateGlobalSettings,
    type Box,
    type Tray
  } from '$lib/stores/project.svelte';
  import type { CounterTrayParams } from '$lib/models/counterTray';
  import type { CardDrawTrayParams } from '$lib/models/cardTray';
  import type { CardDividerTrayParams } from '$lib/models/cardDividerTray';
  import type { CupTrayParams } from '$lib/models/cupTray';
  import { countCups } from '$lib/types/cupLayout';
  import { layoutEditorState } from '$lib/stores/layoutEditor.svelte';

  type SelectionType = 'dimensions' | 'box' | 'tray';

  interface Props {
    selectionType: SelectionType;
    isLayoutEditMode?: boolean;
    printBedSize?: number;
  }

  let { selectionType, isLayoutEditMode = false, printBedSize = 256 }: Props = $props();

  // Layout editor dimensions
  let interiorWidth = $derived(layoutEditorState.boundsWidth);
  let interiorDepth = $derived(layoutEditorState.boundsDepth);

  let project = $derived(getProject());
  let selectedBox = $derived(getSelectedBox());
  let selectedTray = $derived(getSelectedTray());

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

  function handleGlobalSettingsChange(updates: { printBedSize?: number }) {
    updateGlobalSettings(updates);
  }

  function handleCounterParamsChange(newParams: CounterTrayParams) {
    // Find any counter tray to update (for backwards compatibility with tray-specific params)
    for (const box of project.boxes) {
      for (const tray of box.trays) {
        if (isCounterTray(tray)) {
          updateTrayParams(tray.id, newParams);
          return;
        }
      }
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

    let letter = 'A';
    const project = getProject();
    if (selectedBox) {
      const boxIdx = project.boxes.findIndex((b) => b.id === selectedBox.id);
      const trayIdx = selectedBox.trays.findIndex((t) => t.id === tray.id);
      if (boxIdx >= 0 && trayIdx >= 0) {
        letter = getCumulativeTrayLetter(project.boxes, boxIdx, trayIdx);
      }
    }
    return { stacks, counters, letter, isCards, isCups };
  }

  let panelTitle = $derived.by(() => {
    switch (selectionType) {
      case 'dimensions':
        return 'Dimensions';
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
      {#if selectionType === 'box' && selectedBox}
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
              <span class="dimensionLabel">Print bed</span>
              <span class="dimensionValue">{printBedSize} × {printBedSize}mm</span>
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
      {:else if selectionType === 'box'}
        {#if selectedBox}
          <BoxesPanel
            {project}
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
        {#if selectedTray && selectedBox}
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
</style>
