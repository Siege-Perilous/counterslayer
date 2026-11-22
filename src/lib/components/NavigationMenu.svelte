<script lang="ts">
  import { IconButton, Icon, ConfirmActionButton, Hr, Panel, Popover, Text, addToast } from '@tableslayer/ui';
  import { IconX, IconPackage, IconRuler, IconStack2 } from '@tabler/icons-svelte';
  import { computePosition, offset, flip, shift } from '@floating-ui/dom';
  import { tick } from 'svelte';
  import TrayTypePreview from './TrayTypePreview.svelte';
  import {
    getProject,
    getSelectedBox,
    getSelectedTray,
    getSelectedSection,
    selectBox,
    selectTray,
    selectSection,
    addBox,
    deleteBox,
    addTray,
    deleteTray,
    addSection,
    deleteSection,
    addLooseTray,
    deleteLooseTray,
    getTrayLetterById,
    isCounterTray,
    isCardTray,
    isCardDividerTray,
    isCardWellTray,
    isCupTray,
    isStandeeTray,
    isReservedTray,
    type Box,
    type Section,
    type Tray,
    type TrayType
  } from '#lib/stores/project.svelte.js';
  import { countCups } from '#lib/types/cupLayout.js';
  import { countCells } from '#lib/types/cardWellLayout.js';

  type SelectionType = 'dimensions' | 'section' | 'box' | 'tray';

  interface Props {
    selectionType: SelectionType;
    onSelectionChange: (type: SelectionType) => void;
    onExpandPanel: () => void;
    isMobile?: boolean;
    // Sections with a project layout problem: section id -> worst severity
    sectionIssues?: Record<string, 'error' | 'warning'>;
  }

  let { selectionType, onSelectionChange, onExpandPanel, isMobile = false, sectionIssues = {} }: Props = $props();

  let project = $derived(getProject());
  let selectedSection = $derived(getSelectedSection());
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

  function handleSectionClick(section: Section) {
    selectSection(section.id);
    onSelectionChange('section');
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

  function handleAddSection() {
    addSection();
    onSelectionChange('section');
    onExpandPanel();
  }

  function handleAddBox(sectionId: string, trayType: TrayType) {
    addBox(sectionId, trayType);
    onSelectionChange('tray');
    onExpandPanel();
  }

  function handleAddTray(boxId: string, trayType: TrayType) {
    addTray(boxId, trayType);
    onSelectionChange('tray');
    onExpandPanel();
  }

  function handleAddLooseTray(sectionId: string, trayType: TrayType) {
    addLooseTray(sectionId, trayType);
    onSelectionChange('tray');
    onExpandPanel();
  }

  function handleDeleteSection(sectionId: string, sectionName: string) {
    deleteSection(sectionId);
    addToast({ data: { title: 'Section deleted', body: `"${sectionName}" has been deleted`, type: 'success' } });
    // If we deleted the selected section, switch to first section
    if (selectedSection?.id === sectionId) {
      onSelectionChange('section');
    }
  }

  function handleDeleteBox(boxId: string, boxName: string) {
    deleteBox(boxId);
    addToast({ data: { title: 'Box deleted', body: `"${boxName}" has been deleted`, type: 'success' } });
    // If we deleted the selected box, switch to section view
    if (selectedBox?.id === boxId) {
      onSelectionChange('section');
    }
  }

  function handleDeleteTray(boxId: string | null, trayId: string, trayName: string) {
    if (boxId) {
      deleteTray(boxId, trayId);
    } else {
      deleteLooseTray(trayId);
    }
    addToast({ data: { title: 'Tray deleted', body: `"${trayName}" has been deleted`, type: 'success' } });
    // If we deleted the selected tray, switch to section view
    if (selectedTray?.id === trayId) {
      onSelectionChange('section');
    }
  }

  function looseTrayStatsLabel(stats: ReturnType<typeof getTrayStats>): string {
    if (stats.isCardTray) return `${stats.counters} cards`;
    if (stats.isCardDivider) return `${stats.counters} cards/${stats.stacks}s`;
    if (stats.isCardWell) return `${stats.counters} cards/${stats.stacks}c`;
    if (stats.isCupTray) return `${stats.stacks} cups`;
    return `${stats.counters}c in ${stats.stacks}s`;
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
    if (isStandeeTray(tray)) {
      return {
        stacks: 1,
        counters: tray.params.count,
        isCardTray: false,
        isCardDivider: false,
        isCardWell: false,
        isCupTray: false
      };
    }
    if (!isCounterTray(tray)) {
      return {
        stacks: 0,
        counters: 0,
        isCardTray: false,
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

  <!-- Sections, Boxes, and Trays -->
  <div class="navTree">
    {#each project.sections as section (section.id)}
      {@const isSectionSelected = selectedSection?.id === section.id && selectionType === 'section'}
      {@const totalItems = section.boxes.length + section.looseTrays.length}

      <div class="navSectionGroup">
        <!-- Section Item -->
        <button
          class="navItem navItem--section {isSectionSelected ? 'navItem--selected' : ''}"
          onclick={() => handleSectionClick(section)}
        >
          <span class="navItemIcon">
            <Icon Icon={IconStack2} size="1rem" />
          </span>
          <span class="navItemLabel">
            {section.name}
            {#if sectionIssues[section.id]}
              <span
                class="navMenu__issueDot"
                class:navMenu__issueDot--error={sectionIssues[section.id] === 'error'}
                title="This section has a layout warning. See Project & dimensions."
              ></span>
            {/if}
          </span>
          {#if project.sections.length > 1}
            <span
              class="navItemDelete"
              role="none"
              onclick={(e) => e.stopPropagation()}
              onkeydown={(e) => e.stopPropagation()}
            >
              <ConfirmActionButton
                action={() => handleDeleteSection(section.id, section.name)}
                actionButtonText="Delete section"
                positioning={{ placement: 'right' }}
                portal=".appContainer"
              >
                {#snippet trigger({ triggerProps })}
                  <IconButton {...triggerProps} size="sm" variant="ghost" title="Delete section">
                    <Icon Icon={IconX} size="1rem" color="var(--fgMuted)" />
                  </IconButton>
                {/snippet}
                {#snippet actionMessage()}
                  <p>Delete this section and all its contents?</p>
                {/snippet}
              </ConfirmActionButton>
            </span>
          {/if}
        </button>

        <!-- Content within Section -->
        <div class="navSectionContent">
          <!-- Boxes within Section -->
          {#each section.boxes as box (box.id)}
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
                      action={() => handleDeleteBox(box.id, box.name)}
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
                  {@const letter = getTrayLetterById(project.sections, tray.id)}
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
                        action={() => handleDeleteTray(box.id, tray.id, tray.name)}
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
                    <button
                      class="trayTypeOption"
                      onclick={() => {
                        handleAddTray(box.id, 'standee');
                        contentProps.close();
                      }}
                      onmouseenter={(e) => handleTrayTypeHover('standee', e.currentTarget)}
                      onmouseleave={handleTrayTypeLeave}
                    >
                      <Text weight={500}>Standees</Text>
                      <Text size="0.75rem" color="var(--fgMuted)">Slotted tray for vertical standees</Text>
                    </button>
                  {/snippet}
                </Popover>
              </div>
            </div>
          {/each}

          <!-- Loose Trays within Section -->
          {#each section.looseTrays as tray (tray.id)}
            {@const isTraySelected = selectedTray?.id === tray.id && selectionType === 'tray'}
            {@const letter = getTrayLetterById(project.sections, tray.id)}
            {@const stats = getTrayStats(tray)}

            {@const reserved = isReservedTray(tray)}

            <button
              class="navItem navItem--looseTray {isTraySelected ? 'navItem--selected' : ''}"
              onclick={() => handleTrayClick(tray, null)}
              title={reserved
                ? `${tray.name} (Reserved space, not printed)`
                : `${tray.name} (Loose ${letter}: ${looseTrayStatsLabel(stats)})`}
            >
              <span class="navItemLabel">
                {#if reserved}
                  <span class="trayLetter"></span>
                  {tray.name}
                  <span class="looseBadge">reserved</span>
                {:else}
                  <span class="trayLetter">{letter}</span>
                  {tray.name}
                  <span class="looseBadge">loose</span>
                {/if}
              </span>
              {#if totalItems > 1}
                <span
                  class="navItemDelete"
                  role="none"
                  onclick={(e) => e.stopPropagation()}
                  onkeydown={(e) => e.stopPropagation()}
                >
                  <ConfirmActionButton
                    action={() => handleDeleteTray(null, tray.id, tray.name)}
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
                      <p>{reserved ? 'Delete this reserved space?' : 'Delete this loose tray?'}</p>
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
                  handleAddBox(section.id, 'counter');
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
                  handleAddBox(section.id, 'cardDraw');
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
                  handleAddBox(section.id, 'cardDivider');
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
                  handleAddBox(section.id, 'cardWell');
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
                  handleAddBox(section.id, 'cup');
                  contentProps.close();
                }}
                onmouseenter={(e) => handleTrayTypeHover('cup', e.currentTarget)}
                onmouseleave={handleTrayTypeLeave}
              >
                <Text weight={500}>Cup tray</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Bowl-shaped cups for dice and tokens</Text>
              </button>
              <button
                class="trayTypeOption"
                onclick={() => {
                  handleAddBox(section.id, 'standee');
                  contentProps.close();
                }}
                onmouseenter={(e) => handleTrayTypeHover('standee', e.currentTarget)}
                onmouseleave={handleTrayTypeLeave}
              >
                <Text weight={500}>Standees</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Slotted tray for vertical standees</Text>
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
                  handleAddLooseTray(section.id, 'counter');
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
                  handleAddLooseTray(section.id, 'cardDraw');
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
                  handleAddLooseTray(section.id, 'cardDivider');
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
                  handleAddLooseTray(section.id, 'cardWell');
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
                  handleAddLooseTray(section.id, 'cup');
                  contentProps.close();
                }}
                onmouseenter={(e) => handleTrayTypeHover('cup', e.currentTarget)}
                onmouseleave={handleTrayTypeLeave}
              >
                <Text weight={500}>Cup tray</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Bowl-shaped cups for dice and tokens</Text>
              </button>
              <button
                class="trayTypeOption"
                onclick={() => {
                  handleAddLooseTray(section.id, 'standee');
                  contentProps.close();
                }}
                onmouseenter={(e) => handleTrayTypeHover('standee', e.currentTarget)}
                onmouseleave={handleTrayTypeLeave}
              >
                <Text weight={500}>Standees</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Slotted tray for vertical standees</Text>
              </button>
            {/snippet}
          </Popover>

          <!-- Add Reserved Space Button -->
          <button
            class="navItem navItem--add navItem--looseTray"
            onclick={() => handleAddLooseTray(section.id, 'reserved')}
            onmouseenter={(e) => handleTrayTypeHover('reserved', e.currentTarget)}
            onmouseleave={handleTrayTypeLeave}
            title="A block for game parts you are not printing, such as boards and rulebooks"
          >
            <span class="addIcon">+</span>
            <span class="addLabel">Add reserved space</span>
          </button>
        </div>
        <Hr />
      </div>
    {/each}

    <!-- Add Section Button -->
    <button class="navItem navItem--add" onclick={handleAddSection}>
      <span class="addIcon">+</span>
      <span class="addLabel">Add section</span>
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

  .navMenu__issueDot {
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    margin-left: 0.375rem;
    border-radius: 50%;
    background: #ffb020;
  }

  .navMenu__issueDot--error {
    background: #ff3b30;
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

  .navSectionGroup {
    display: flex;
    flex-direction: column;
  }

  .navSectionContent {
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
