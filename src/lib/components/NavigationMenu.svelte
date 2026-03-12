<script lang="ts">
  import { IconButton, Icon, ConfirmActionButton, Hr, Panel, Popover, Text } from '@tableslayer/ui';
  import { IconX, IconPackage, IconRuler, IconStack2 } from '@tabler/icons-svelte';
  import { computePosition, offset, flip, shift } from '@floating-ui/dom';
  import { tick } from 'svelte';
  import TrayTypePreview from './TrayTypePreview.svelte';
  import {
    getProject,
    getSelectedBox,
    getSelectedTray,
    getSelectedLayer,
    selectBox,
    selectTray,
    selectLayer,
    addBox,
    deleteBox,
    addTray,
    deleteTray,
    addLayer,
    deleteLayer,
    addLooseTray,
    deleteLooseTray,
    getTrayLetterById,
    isCardTray,
    isCardDividerTray,
    isCardWellTray,
    isCupTray,
    type Box,
    type Layer,
    type Tray,
    type TrayType
  } from '$lib/stores/project.svelte';
  import { countCups } from '$lib/types/cupLayout';
  import { countCells } from '$lib/types/cardWellLayout';

  type SelectionType = 'dimensions' | 'layer' | 'box' | 'tray';

  interface Props {
    selectionType: SelectionType;
    onSelectionChange: (type: SelectionType) => void;
    onExpandPanel: () => void;
    isMobile?: boolean;
  }

  let { selectionType, onSelectionChange, onExpandPanel, isMobile = false }: Props = $props();

  let project = $derived(getProject());
  let selectedLayer = $derived(getSelectedLayer());
  let selectedBox = $derived(getSelectedBox());
  let selectedTray = $derived(getSelectedTray());

  // Hover preview state
  let hoveredTrayType = $state<TrayType | null>(null);
  let hoverAnchorElement = $state<HTMLElement | null>(null);
  let previewElement = $state<HTMLElement | null>(null);
  let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
  let previewStyles = $state('');

  function handleTrayTypeHover(trayType: TrayType, element: HTMLElement) {
    hoverAnchorElement = element;
    if (hoverTimeout) clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => {
      hoveredTrayType = trayType;
    }, 150);
  }

  function handleTrayTypeLeave() {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    hoverTimeout = null;
    hoveredTrayType = null;
  }

  // Position the preview popover using floating-ui
  $effect(() => {
    if (hoverAnchorElement && hoveredTrayType && previewElement) {
      tick().then(async () => {
        if (!hoverAnchorElement || !previewElement) return;
        const result = await computePosition(hoverAnchorElement, previewElement, {
          placement: 'right',
          middleware: [offset(8), flip(), shift({ padding: 8 })]
        });
        previewStyles = `left: ${result.x}px; top: ${result.y}px;`;
      });
    }
  });

  function handleDimensionsClick() {
    onSelectionChange('dimensions');
    onExpandPanel();
  }

  function handleLayerClick(layer: Layer) {
    selectLayer(layer.id);
    onSelectionChange('layer');
    onExpandPanel();
  }

  function handleBoxClick(box: Box) {
    selectBox(box.id);
    onSelectionChange('box');
    onExpandPanel();
  }

  function handleTrayClick(tray: Tray, box: Box | null) {
    if (box) {
      selectBox(box.id);
    }
    selectTray(tray.id);
    onSelectionChange('tray');
    onExpandPanel();
  }

  function handleAddLayer() {
    addLayer();
    onSelectionChange('layer');
    onExpandPanel();
  }

  function handleAddBox(layerId: string, trayType: TrayType) {
    addBox(layerId, trayType);
    onSelectionChange('tray');
    onExpandPanel();
  }

  function handleAddTray(boxId: string, trayType: TrayType) {
    addTray(boxId, trayType);
    onSelectionChange('tray');
    onExpandPanel();
  }

  function handleAddLooseTray(layerId: string, trayType: TrayType) {
    addLooseTray(layerId, trayType);
    onSelectionChange('tray');
    onExpandPanel();
  }

  function handleDeleteLayer(layerId: string) {
    deleteLayer(layerId);
    // If we deleted the selected layer, switch to first layer
    if (selectedLayer?.id === layerId) {
      onSelectionChange('layer');
    }
  }

  function handleDeleteBox(boxId: string) {
    deleteBox(boxId);
    // If we deleted the selected box, switch to layer view
    if (selectedBox?.id === boxId) {
      onSelectionChange('layer');
    }
  }

  function handleDeleteTray(boxId: string | null, trayId: string) {
    if (boxId) {
      deleteTray(boxId, trayId);
    } else {
      deleteLooseTray(trayId);
    }
    // If we deleted the selected tray, switch to layer view
    if (selectedTray?.id === trayId) {
      onSelectionChange('layer');
    }
  }

  function getTrayStats(tray: Tray): {
    stacks: number;
    counters: number;
    isCardTray: boolean;
    isCardDivider: boolean;
    isCardWell: boolean;
    isCupTray: boolean;
  } {
    if (isCupTray(tray)) {
      const cupTotal = countCups(tray.params.layout);
      return {
        stacks: cupTotal,
        counters: cupTotal,
        isCardTray: false,
        isCardDivider: false,
        isCardWell: false,
        isCupTray: true
      };
    }
    if (isCardWellTray(tray)) {
      const cellTotal = countCells(tray.params.layout);
      const totalCards = tray.params.stacks.reduce((sum, s) => sum + s.count, 0);
      return {
        stacks: cellTotal,
        counters: totalCards,
        isCardTray: false,
        isCardDivider: false,
        isCardWell: true,
        isCupTray: false
      };
    }
    if (isCardDividerTray(tray)) {
      const totalCards = tray.params.stacks.reduce((sum, s) => sum + s.count, 0);
      return {
        stacks: tray.params.stacks.length,
        counters: totalCards,
        isCardTray: false,
        isCardDivider: true,
        isCardWell: false,
        isCupTray: false
      };
    }
    if (isCardTray(tray)) {
      return {
        stacks: 1,
        counters: tray.params.cardCount,
        isCardTray: true,
        isCardDivider: false,
        isCardWell: false,
        isCupTray: false
      };
    }
    const topCount = tray.params.topLoadedStacks.reduce((sum, s) => sum + s[1], 0);
    const edgeCount = tray.params.edgeLoadedStacks.reduce((sum, s) => sum + s[1], 0);
    return {
      stacks: tray.params.topLoadedStacks.length + tray.params.edgeLoadedStacks.length,
      counters: topCount + edgeCount,
      isCardTray: false,
      isCardDivider: false,
      isCardWell: false,
      isCupTray: false
    };
  }
</script>

<Panel class="navMenu {isMobile ? 'navMenu--mobile' : ''}">
  <!-- Dimensions (Globals) -->
  <button
    class="navItem navItem--dimensions {selectionType === 'dimensions' ? 'navItem--selected' : ''}"
    onclick={handleDimensionsClick}
  >
    <span class="navItemIcon">
      <Icon Icon={IconRuler} size="1rem" />
    </span>
    Project & dimensions
  </button>
  <Hr />

  <!-- Layers, Boxes, and Trays -->
  <div class="navTree">
    {#each project.layers as layer (layer.id)}
      {@const isLayerSelected = selectedLayer?.id === layer.id && selectionType === 'layer'}
      {@const totalItems = layer.boxes.length + layer.looseTrays.length}

      <div class="navLayerGroup">
        <!-- Layer Item -->
        <button
          class="navItem navItem--layer {isLayerSelected ? 'navItem--selected' : ''}"
          onclick={() => handleLayerClick(layer)}
        >
          <span class="navItemIcon">
            <Icon Icon={IconStack2} size="1rem" />
          </span>
          <span class="navItemLabel">
            {layer.name}
          </span>
          {#if project.layers.length > 1}
            <span
              class="navItemDelete"
              role="none"
              onclick={(e) => e.stopPropagation()}
              onkeydown={(e) => e.stopPropagation()}
            >
              <ConfirmActionButton
                action={() => handleDeleteLayer(layer.id)}
                actionButtonText="Delete layer"
                positioning={{ placement: 'right' }}
                portal=".appContainer"
              >
                {#snippet trigger({ triggerProps })}
                  <IconButton {...triggerProps} size="sm" variant="ghost" title="Delete layer">
                    <Icon Icon={IconX} size="1rem" color="var(--fgMuted)" />
                  </IconButton>
                {/snippet}
                {#snippet actionMessage()}
                  <p>Delete this layer and all its contents?</p>
                {/snippet}
              </ConfirmActionButton>
            </span>
          {/if}
        </button>

        <!-- Content within Layer -->
        <div class="navLayerContent">
          <!-- Boxes within Layer -->
          {#each layer.boxes as box (box.id)}
            {@const isBoxSelected = selectedBox?.id === box.id && selectionType === 'box'}

            <div class="navBoxGroup">
              <!-- Box Item -->
              <button
                class="navItem navItem--box {isBoxSelected ? 'navItem--selected' : ''}"
                onclick={() => handleBoxClick(box)}
              >
                <span class="navItemIcon">
                  <Icon Icon={IconPackage} size="1rem" />
                </span>
                <span class="navItemLabel">
                  {box.name}
                </span>
                {#if totalItems > 1}
                  <span
                    class="navItemDelete"
                    role="none"
                    onclick={(e) => e.stopPropagation()}
                    onkeydown={(e) => e.stopPropagation()}
                  >
                    <ConfirmActionButton
                      action={() => handleDeleteBox(box.id)}
                      actionButtonText="Delete box"
                      positioning={{ placement: 'right' }}
                      portal=".appContainer"
                    >
                      {#snippet trigger({ triggerProps })}
                        <IconButton {...triggerProps} size="sm" variant="ghost" title="Delete box">
                          <Icon Icon={IconX} size="1rem" color="var(--fgMuted)" />
                        </IconButton>
                      {/snippet}
                      {#snippet actionMessage()}
                        <p>Delete this box and all its trays?</p>
                      {/snippet}
                    </ConfirmActionButton>
                  </span>
                {/if}
              </button>

              <!-- Trays within Box -->
              <div class="navTrayList">
                {#each box.trays as tray (tray.id)}
                  {@const isTraySelected = selectedTray?.id === tray.id && selectionType === 'tray'}
                  {@const letter = getTrayLetterById(project.layers, tray.id)}
                  {@const stats = getTrayStats(tray)}

                  <button
                    class="navItem navItem--tray {isTraySelected ? 'navItem--selected' : ''}"
                    onclick={() => handleTrayClick(tray, box)}
                    title="{tray.name} ({letter}: {stats.isCardTray
                      ? stats.counters + ' cards'
                      : stats.isCardDivider
                        ? stats.counters + ' cards/' + stats.stacks + 's'
                        : stats.isCardWell
                          ? stats.counters + ' cards/' + stats.stacks + 'c'
                          : stats.isCupTray
                            ? stats.stacks + ' cups'
                            : stats.counters + 'c in ' + stats.stacks + 's'})"
                  >
                    <span class="navItemLabel">
                      <span class="trayLetter">{letter}</span>
                      {tray.name}
                    </span>
                    <span
                      class="navItemDelete"
                      role="none"
                      onclick={(e) => e.stopPropagation()}
                      onkeydown={(e) => e.stopPropagation()}
                    >
                      <ConfirmActionButton
                        action={() => handleDeleteTray(box.id, tray.id)}
                        actionButtonText="Delete tray"
                        positioning={{ placement: 'right' }}
                        portal=".appContainer"
                      >
                        {#snippet trigger({ triggerProps })}
                          <IconButton {...triggerProps} size="sm" variant="ghost" title="Delete tray">
                            <Icon Icon={IconX} size="1rem" color="var(--fgMuted)" />
                          </IconButton>
                        {/snippet}
                        {#snippet actionMessage()}
                          <p>Delete this tray?</p>
                        {/snippet}
                      </ConfirmActionButton>
                    </span>
                  </button>
                {/each}

                <!-- Add Tray Button with Popover -->
                <Popover
                  positioning={{ placement: 'right-start' }}
                  portal=".appContainer"
                  contentClass="trayTypePopover"
                >
                  {#snippet trigger()}
                    <button class="navItem navItem--add navItem--tray">
                      <span class="addIcon">+</span>
                      <span class="addLabel">Add tray</span>
                    </button>
                  {/snippet}
                  {#snippet content({ contentProps })}
                    <button
                      class="trayTypeOption"
                      onclick={() => {
                        handleAddTray(box.id, 'counter');
                        contentProps.close();
                      }}
                      onmouseenter={(e) => handleTrayTypeHover('counter', e.currentTarget)}
                      onmouseleave={handleTrayTypeLeave}
                    >
                      <Text weight={500}>Counters</Text>
                      <Text size="0.75rem" color="var(--fgMuted)">Stacks of geometric tokens</Text>
                    </button>
                    <button
                      class="trayTypeOption"
                      onclick={() => {
                        handleAddTray(box.id, 'cardDraw');
                        contentProps.close();
                      }}
                      onmouseenter={(e) => handleTrayTypeHover('cardDraw', e.currentTarget)}
                      onmouseleave={handleTrayTypeLeave}
                    >
                      <Text weight={500}>Card draw</Text>
                      <Text size="0.75rem" color="var(--fgMuted)">Single stack of cards, draw from top</Text>
                    </button>
                    <button
                      class="trayTypeOption"
                      onclick={() => {
                        handleAddTray(box.id, 'cardDivider');
                        contentProps.close();
                      }}
                      onmouseenter={(e) => handleTrayTypeHover('cardDivider', e.currentTarget)}
                      onmouseleave={handleTrayTypeLeave}
                    >
                      <Text weight={500}>Card divider</Text>
                      <Text size="0.75rem" color="var(--fgMuted)">Divided stacks of cards, divided by walls</Text>
                    </button>
                    <button
                      class="trayTypeOption"
                      onclick={() => {
                        handleAddTray(box.id, 'cardWell');
                        contentProps.close();
                      }}
                      onmouseenter={(e) => handleTrayTypeHover('cardWell', e.currentTarget)}
                      onmouseleave={handleTrayTypeLeave}
                    >
                      <Text weight={500}>Card well</Text>
                      <Text size="0.75rem" color="var(--fgMuted)">Flat stacks of cards</Text>
                    </button>
                    <button
                      class="trayTypeOption"
                      onclick={() => {
                        handleAddTray(box.id, 'cup');
                        contentProps.close();
                      }}
                      onmouseenter={(e) => handleTrayTypeHover('cup', e.currentTarget)}
                      onmouseleave={handleTrayTypeLeave}
                    >
                      <Text weight={500}>Cups</Text>
                      <Text size="0.75rem" color="var(--fgMuted)">Segmented cups for loose objects</Text>
                    </button>
                  {/snippet}
                </Popover>
              </div>
            </div>
          {/each}

          <!-- Loose Trays within Layer -->
          {#each layer.looseTrays as tray (tray.id)}
            {@const isTraySelected = selectedTray?.id === tray.id && selectionType === 'tray'}
            {@const letter = getTrayLetterById(project.layers, tray.id)}
            {@const stats = getTrayStats(tray)}

            <button
              class="navItem navItem--looseTray {isTraySelected ? 'navItem--selected' : ''}"
              onclick={() => handleTrayClick(tray, null)}
              title="{tray.name} (Loose {letter}: {stats.isCardTray
                ? stats.counters + ' cards'
                : stats.isCardDivider
                  ? stats.counters + ' cards/' + stats.stacks + 's'
                  : stats.isCardWell
                    ? stats.counters + ' cards/' + stats.stacks + 'c'
                    : stats.isCupTray
                      ? stats.stacks + ' cups'
                      : stats.counters + 'c in ' + stats.stacks + 's'})"
            >
              <span class="navItemLabel">
                <span class="trayLetter">{letter}</span>
                {tray.name}
                <span class="looseBadge">loose</span>
              </span>
              {#if totalItems > 1}
                <span
                  class="navItemDelete"
                  role="none"
                  onclick={(e) => e.stopPropagation()}
                  onkeydown={(e) => e.stopPropagation()}
                >
                  <ConfirmActionButton
                    action={() => handleDeleteTray(null, tray.id)}
                    actionButtonText="Delete tray"
                    positioning={{ placement: 'right' }}
                    portal=".appContainer"
                  >
                    {#snippet trigger({ triggerProps })}
                      <IconButton {...triggerProps} size="sm" variant="ghost" title="Delete tray">
                        <Icon Icon={IconX} size="1rem" color="var(--fgMuted)" />
                      </IconButton>
                    {/snippet}
                    {#snippet actionMessage()}
                      <p>Delete this loose tray?</p>
                    {/snippet}
                  </ConfirmActionButton>
                </span>
              {/if}
            </button>
          {/each}

          <!-- Add Box Button with Popover -->
          <Popover positioning={{ placement: 'right-start' }} portal=".appContainer" contentClass="trayTypePopover">
            {#snippet trigger()}
              <button class="navItem navItem--add navItem--box">
                <span class="addIcon">+</span>
                <span class="addLabel">Add box</span>
              </button>
            {/snippet}
            {#snippet content({ contentProps })}
              <button
                class="trayTypeOption"
                onclick={() => {
                  handleAddBox(layer.id, 'counter');
                  contentProps.close();
                }}
                onmouseenter={(e) => handleTrayTypeHover('counter', e.currentTarget)}
                onmouseleave={handleTrayTypeLeave}
              >
                <Text weight={500}>Counters</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Stacks of geometric tokens</Text>
              </button>
              <button
                class="trayTypeOption"
                onclick={() => {
                  handleAddBox(layer.id, 'cardDraw');
                  contentProps.close();
                }}
                onmouseenter={(e) => handleTrayTypeHover('cardDraw', e.currentTarget)}
                onmouseleave={handleTrayTypeLeave}
              >
                <Text weight={500}>Card draw</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Single stack of cards, draw from top</Text>
              </button>
              <button
                class="trayTypeOption"
                onclick={() => {
                  handleAddBox(layer.id, 'cardDivider');
                  contentProps.close();
                }}
                onmouseenter={(e) => handleTrayTypeHover('cardDivider', e.currentTarget)}
                onmouseleave={handleTrayTypeLeave}
              >
                <Text weight={500}>Card divider</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Divided stacks of cards, divided by walls</Text>
              </button>
              <button
                class="trayTypeOption"
                onclick={() => {
                  handleAddBox(layer.id, 'cardWell');
                  contentProps.close();
                }}
                onmouseenter={(e) => handleTrayTypeHover('cardWell', e.currentTarget)}
                onmouseleave={handleTrayTypeLeave}
              >
                <Text weight={500}>Card well</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Flat stacks of cards</Text>
              </button>
              <button
                class="trayTypeOption"
                onclick={() => {
                  handleAddBox(layer.id, 'cup');
                  contentProps.close();
                }}
                onmouseenter={(e) => handleTrayTypeHover('cup', e.currentTarget)}
                onmouseleave={handleTrayTypeLeave}
              >
                <Text weight={500}>Cup tray</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Bowl-shaped cups for dice and tokens</Text>
              </button>
            {/snippet}
          </Popover>

          <!-- Add Loose Tray Button with Popover -->
          <Popover positioning={{ placement: 'right-start' }} portal=".appContainer" contentClass="trayTypePopover">
            {#snippet trigger()}
              <button class="navItem navItem--add navItem--looseTray">
                <span class="addIcon">+</span>
                <span class="addLabel">Add loose tray</span>
              </button>
            {/snippet}
            {#snippet content({ contentProps })}
              <button
                class="trayTypeOption"
                onclick={() => {
                  handleAddLooseTray(layer.id, 'counter');
                  contentProps.close();
                }}
                onmouseenter={(e) => handleTrayTypeHover('counter', e.currentTarget)}
                onmouseleave={handleTrayTypeLeave}
              >
                <Text weight={500}>Counters</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Stacks of geometric tokens</Text>
              </button>
              <button
                class="trayTypeOption"
                onclick={() => {
                  handleAddLooseTray(layer.id, 'cardDraw');
                  contentProps.close();
                }}
                onmouseenter={(e) => handleTrayTypeHover('cardDraw', e.currentTarget)}
                onmouseleave={handleTrayTypeLeave}
              >
                <Text weight={500}>Card draw</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Single stack of cards, draw from top</Text>
              </button>
              <button
                class="trayTypeOption"
                onclick={() => {
                  handleAddLooseTray(layer.id, 'cardDivider');
                  contentProps.close();
                }}
                onmouseenter={(e) => handleTrayTypeHover('cardDivider', e.currentTarget)}
                onmouseleave={handleTrayTypeLeave}
              >
                <Text weight={500}>Card divider</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Divided stacks of cards, divided by walls</Text>
              </button>
              <button
                class="trayTypeOption"
                onclick={() => {
                  handleAddLooseTray(layer.id, 'cardWell');
                  contentProps.close();
                }}
                onmouseenter={(e) => handleTrayTypeHover('cardWell', e.currentTarget)}
                onmouseleave={handleTrayTypeLeave}
              >
                <Text weight={500}>Card well</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Flat stacks of cards</Text>
              </button>
              <button
                class="trayTypeOption"
                onclick={() => {
                  handleAddLooseTray(layer.id, 'cup');
                  contentProps.close();
                }}
                onmouseenter={(e) => handleTrayTypeHover('cup', e.currentTarget)}
                onmouseleave={handleTrayTypeLeave}
              >
                <Text weight={500}>Cup tray</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Bowl-shaped cups for dice and tokens</Text>
              </button>
            {/snippet}
          </Popover>
        </div>
        <Hr />
      </div>
    {/each}

    <!-- Add Layer Button -->
    <button class="navItem navItem--add" onclick={handleAddLayer}>
      <span class="addIcon">+</span>
      <span class="addLabel">Add layer</span>
    </button>
  </div>
</Panel>

<!-- Tray type preview popover -->
{#if hoveredTrayType && hoverAnchorElement}
  <div bind:this={previewElement} class="popContent trayTypePreviewPopover" style={previewStyles}>
    <TrayTypePreview trayType={hoveredTrayType} />
  </div>
{/if}

<style>
  :global(.navMenu) {
    position: fixed;
    top: 4rem;
    left: 1.5rem;
    z-index: 100;
    display: flex;
    flex-direction: column;
    padding: 0;
    min-width: 12rem;
    max-width: 16rem;
    max-height: calc(100vh - 8rem);
    overflow-y: auto;
  }

  .navItem {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2rem;
    padding: 0 0.5rem;
    font-size: 0.875rem;
    background: transparent;
    border: none;
    color: var(--fg);
    cursor: pointer;
    text-align: left;
    width: 100%;
  }

  .navItem:hover {
    background: var(--contrastLow);
  }

  .navItem--selected {
    background: var(--contrastMedium);
    box-shadow: inset 3px 0 0 var(--fgPrimary);
  }

  .navItem--add {
    color: var(--fgMuted);
  }

  .navItem--add:hover {
    color: var(--fg);
  }

  .navItemIcon,
  .trayLetter,
  .addIcon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1rem;
    color: var(--fgMuted);
    font-family: var(--font-mono);
    font-size: 0.625rem;
  }

  .navItemIcon {
    width: 1.25rem;
  }

  .navItemLabel {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .navItemDelete {
    opacity: 0;
  }

  .navItem:hover .navItemDelete {
    opacity: 1;
  }

  .navTree {
    display: flex;
    flex-direction: column;
  }

  .navLayerGroup {
    display: flex;
    flex-direction: column;
  }

  .navLayerContent {
    display: flex;
    flex-direction: column;

    .navItem--box,
    .navItem--looseTray {
      padding-left: 1.5rem;
    }

    .navItem--add.navItem--box,
    .navItem--add.navItem--looseTray {
      padding-left: 1.5rem;
    }
  }

  .navBoxGroup {
    display: flex;
    flex-direction: column;
  }

  .navTrayList {
    display: flex;
    flex-direction: column;

    .navItem {
      padding-left: 3rem;
    }
  }

  .looseBadge {
    font-size: 0.625rem;
    padding: 0.125rem 0.25rem;
    background: var(--contrastLow);
    border-radius: 2px;
    color: var(--fgMuted);
    margin-left: 0.25rem;
  }

  .addLabel {
    flex: 1;
  }

  /* Mobile styles - inline nav panel, not fixed */
  :global(.navMenu--mobile) {
    position: relative;
    top: auto;
    left: auto;
    max-width: none;
    max-height: none;
    border-radius: 0;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  /* Tray type popover */
  :global(.popContent.trayTypePopover) {
    display: flex;
    flex-direction: column;
    min-width: 14rem;
    padding: 0 !important;
    background: var(--contrastLowest) !important;
  }

  :global(.trayTypeOption) {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
  }

  :global(.trayTypeOption:not(:last-child)) {
    border-bottom: var(--borderThin);
  }

  :global(.trayTypeOption:hover) {
    background: var(--contrastLow);
  }

  :global(.trayTypePreviewPopover) {
    position: fixed;
    z-index: 1100;
    pointer-events: none;
    background: var(--contrastLowest);
    border: var(--borderThin);
    overflow: hidden;
  }
</style>
