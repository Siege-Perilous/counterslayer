<script lang="ts">
  import {
    Input,
    InputCheckbox,
    FormControl,
    Spacer,
    Hr,
    Select,
    IconButton,
    Icon,
    ColorPicker,
    ColorPickerSwatch,
    Popover,
    Text
  } from '@tableslayer/ui';
  import { IconX, IconPlus } from '@tabler/icons-svelte';
  import type { Box, Tray } from '#lib/types/project.js';
  import {
    isCounterTray,
    isCardTray,
    isCardDividerTray,
    isCardWellTray,
    isCupTray,
    isReservedTray,
    isStandeeTray,
    type CounterTray,
    type CardDrawTray,
    type CardDividerTray,
    type CardWellTray,
    type CupTray,
    type ReservedTray,
    type StandeeTray
  } from '#lib/types/project.js';
  import type { CounterTrayParams } from '#lib/models/counterTray.js';
  import type { CardDrawTrayParams } from '#lib/models/cardTray.js';
  import type { CardDividerTrayParams } from '#lib/models/cardDividerTray.js';
  import type { CardWellTrayParams } from '#lib/models/cardWellTray.js';
  import { cupTrayHasScoops, getCupTrayOuterWall, type CupTrayParams } from '#lib/models/cupTray.js';
  import type { ReservedSpaceParams } from '#lib/models/reservedSpace.js';
  import type { StandeeTrayParams } from '#lib/models/standeeTray.js';
  import { countCups } from '#lib/types/cupLayout.js';
  import { countCells } from '#lib/types/cardWellLayout.js';
  import { getTrayDimensionsForTray, arrangeTrays } from '#lib/models/box.js';
  import { calculateSectionHeight } from '#lib/models/section.js';
  import {
    getProject,
    getTrayLetterById,
    moveTray,
    moveTrayToLoose,
    getCardSizes,
    getCounterShapes
  } from '#lib/stores/project.svelte.js';

  // Editor components
  import CounterTrayEditor from './panels/CounterTrayEditor.svelte';
  import CardDrawTrayEditor from './panels/CardDrawTrayEditor.svelte';
  import CardDividerTrayEditor from './panels/CardDividerTrayEditor.svelte';
  import CardWellTrayEditor from './panels/CardWellTrayEditor.svelte';
  import CupTrayEditor from './panels/CupTrayEditor.svelte';
  import ReservedSpaceEditor from './panels/ReservedSpaceEditor.svelte';
  import StandeeTrayEditor from './panels/StandeeTrayEditor.svelte';

  interface Props {
    selectedBox: Box | null;
    selectedTray: Tray | null;
    onSelectTray: (tray: Tray) => void;
    onAddTray: (boxId: string) => void;
    onDeleteTray: (boxId: string, trayId: string) => void;
    onUpdateTray: (updates: Partial<Omit<Tray, 'id'>>) => void;
    onUpdateCounterParams?: (params: CounterTrayParams) => void;
    onUpdateCardParams?: (params: CardDrawTrayParams) => void;
    onUpdateCardDividerParams?: (params: CardDividerTrayParams) => void;
    onUpdateCardWellParams?: (params: CardWellTrayParams) => void;
    onUpdateCupParams?: (params: CupTrayParams) => void;
    onUpdateStandeeParams?: (params: StandeeTrayParams) => void;
    onUpdateReservedParams?: (params: ReservedSpaceParams) => void;
    hideList?: boolean;
  }

  let {
    selectedBox,
    selectedTray,
    onSelectTray,
    onAddTray,
    onDeleteTray,
    onUpdateTray,
    onUpdateCounterParams,
    onUpdateCardParams,
    onUpdateCardDividerParams,
    onUpdateCardWellParams,
    onUpdateCupParams,
    onUpdateStandeeParams,
    onUpdateReservedParams,
    hideList = false
  }: Props = $props();

  // Get the tray letter based on cumulative position across all sections
  let trayLetter = $derived.by(() => {
    const project = getProject();
    if (!selectedTray) return 'A';
    return getTrayLetterById(project.sections, selectedTray.id) || 'A';
  });

  // Build move destination options: all boxes + loose tray options per section
  let moveDestinations = $derived.by(() => {
    const project = getProject();
    const options: { value: string; label: string; group?: string }[] = [];

    // A reserved space sits directly in a section, never in a box
    const reserved = selectedTray !== null && isReservedTray(selectedTray);

    for (const section of project.sections) {
      if (reserved) {
        options.push({ value: `loose:${section.id}`, label: section.name });
        continue;
      }
      // Add boxes in this section
      for (const box of section.boxes) {
        options.push({
          value: `box:${box.id}`,
          label: box.name,
          group: section.name
        });
      }
      // Add loose tray option for this section
      options.push({
        value: `loose:${section.id}`,
        label: `Loose in ${section.name}`,
        group: section.name
      });
    }

    return options;
  });

  // Get current tray location for the select
  let currentTrayLocation = $derived.by(() => {
    if (!selectedTray) return '';
    if (selectedBox) {
      return `box:${selectedBox.id}`;
    }
    // Check if it's a loose tray
    const project = getProject();
    for (const section of project.sections) {
      if (section.looseTrays.some((t) => t.id === selectedTray.id)) {
        return `loose:${section.id}`;
      }
    }
    return '';
  });

  // Height of the section holding the selected reserved space (it is drawn at that height)
  let reservedSectionHeight = $derived.by(() => {
    if (!selectedTray || !isReservedTray(selectedTray)) return undefined;
    const project = getProject();
    const section = project.sections.find((s) => s.looseTrays.some((t) => t.id === selectedTray.id));
    if (!section) return undefined;
    return calculateSectionHeight(section, {
      cardSizes: getCardSizes(),
      counterShapes: getCounterShapes(),
      standees: project.standees ?? []
    });
  });

  // Handle move destination change
  function handleMoveDestination(value: string) {
    if (!selectedTray || !value) return;
    const [type, id] = value.split(':');

    if (type === 'box' && id !== selectedBox?.id) {
      moveTray(selectedTray.id, id);
    } else if (type === 'loose') {
      moveTrayToLoose(selectedTray.id, id);
    }
  }

  // Find the section containing the selected box
  const selectedBoxSection = $derived.by(() => {
    if (!selectedBox) return null;
    const project = getProject();
    return project.sections.find((section) => section.boxes.some((b) => b.id === selectedBox.id)) ?? null;
  });

  // Calculate section-adjusted tray height
  // The selected tray when it is a cup tray, for its scoop / honeycomb / lid options
  let cupOptions = $derived(selectedTray && isCupTray(selectedTray) ? selectedTray : null);

  // Trays expand to fill the box interior, which may be taller than natural to match section height
  let maxTrayHeight = $derived.by(() => {
    if (!selectedBox) return 0;
    const cardSizes = getCardSizes();
    const counterShapes = getCounterShapes();

    // Get natural max tray height
    const naturalMaxHeight = Math.max(
      ...selectedBox.trays.map((tray) => getTrayDimensionsForTray(tray, cardSizes, counterShapes).height),
      0
    );

    // If box is in a section, calculate section-adjusted height
    if (selectedBoxSection) {
      const sectionHeight = calculateSectionHeight(selectedBoxSection, {
        cardSizes,
        counterShapes,
        standees: getProject().standees ?? []
      });
      // Only lid thickness (flat top) sticks above box, not full lid height
      const lidThickness = selectedBox.lidParams?.thickness ?? 2;
      const floorThickness = selectedBox.floorThickness;
      // Required tray height to fill box interior when box is adjusted to section height
      const requiredTrayHeight = sectionHeight - lidThickness - floorThickness;
      return Math.max(naturalMaxHeight, requiredTrayHeight);
    }

    return naturalMaxHeight;
  });

  // Compute rotated dimensions for the selected tray (accounting for layout rotation)
  let selectedTrayDimensions = $derived.by(() => {
    if (!selectedBox || !selectedTray) return null;
    const cardSizes = getCardSizes();
    const counterShapes = getCounterShapes();
    const placements = arrangeTrays(selectedBox.trays, {
      customBoxWidth: selectedBox.customWidth,
      wallThickness: selectedBox.wallThickness,
      tolerance: selectedBox.tolerance,
      cardSizes,
      counterShapes,
      manualLayout: selectedBox.manualLayout
    });
    const placement = placements.find((p) => p.tray.id === selectedTray.id);
    if (!placement) return null;
    // Use placement dimensions (already rotated) but override height with maxTrayHeight if larger
    return {
      width: placement.dimensions.width,
      depth: placement.dimensions.depth,
      height: maxTrayHeight > placement.dimensions.height ? maxTrayHeight : placement.dimensions.height
    };
  });

  function getTrayStats(tray: Tray): {
    stacks: number;
    counters: number;
    isCardTray: boolean;
    isCardDivider: boolean;
    isCardWell: boolean;
    isCupTray: boolean;
    isStandee: boolean;
  } {
    if (isStandeeTray(tray)) {
      return {
        stacks: 1,
        counters: tray.params.count,
        isCardTray: false,
        isCardDivider: false,
        isCardWell: false,
        isCupTray: false,
        isStandee: true
      };
    }
    if (isCupTray(tray)) {
      const cupTotal = countCups(tray.params.layout);
      return {
        stacks: cupTotal,
        counters: cupTotal,
        isCardTray: false,
        isCardDivider: false,
        isCardWell: false,
        isCupTray: true,
        isStandee: false
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
        isCupTray: false,
        isStandee: false
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
        isCupTray: false,
        isStandee: false
      };
    }
    if (isCardTray(tray)) {
      return {
        stacks: 1,
        counters: tray.params.cardCount,
        isCardTray: true,
        isCardDivider: false,
        isCardWell: false,
        isCupTray: false,
        isStandee: false
      };
    }
    // Counter tray
    if (!isCounterTray(tray)) {
      return {
        stacks: 0,
        counters: 0,
        isCardTray: false,
        isCardDivider: false,
        isCardWell: false,
        isCupTray: false,
        isStandee: false
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
      isCupTray: false,
      isStandee: false
    };
  }

  // Debounced color update to avoid excessive saves during color picker drag
  let colorUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
  function handleColorUpdate(hex: string) {
    if (colorUpdateTimeout) {
      clearTimeout(colorUpdateTimeout);
    }
    colorUpdateTimeout = setTimeout(() => {
      onUpdateTray({ color: hex });
      colorUpdateTimeout = null;
    }, 150);
  }
</script>

<div class="traysPanel">
  <!-- Tray List -->
  {#if selectedBox && !hideList}
    <div class="panelList">
      <div class="panelListHeader">
        <span class="panelListTitle">
          Trays {#if selectedBox}within {selectedBox.name}{/if}
        </span>

        <IconButton onclick={() => onAddTray(selectedBox.id)} title="Add new tray to box" size="sm" variant="ghost">
          <Icon Icon={IconPlus} />
        </IconButton>
      </div>
      <div class="panelListItems">
        {#each selectedBox.trays as tray, _trayIdx (tray.id)}
          {@const stats = getTrayStats(tray)}
          {@const letter = getTrayLetterById(getProject().sections, tray.id)}
          <div
            class="listItem {selectedTray?.id === tray.id ? 'listItem--selected' : ''}"
            onclick={() => onSelectTray(tray)}
            role="button"
            tabindex="0"
            onkeydown={(e) => e.key === 'Enter' && onSelectTray(tray)}
            title="{tray.name}, tray {letter}, {stats.isCardTray
              ? stats.counters + ' cards'
              : stats.isCardDivider
                ? stats.counters + ' cards in ' + stats.stacks + ' stacks'
                : stats.isCardWell
                  ? stats.counters + ' cards in ' + stats.stacks + ' cells'
                  : stats.isCupTray
                    ? stats.stacks + ' cups'
                    : stats.isStandee
                      ? stats.counters + ' standees'
                      : stats.counters + ' counters in ' + stats.stacks + ' stacks'}"
          >
            <span style="overflow: hidden; text-overflow: ellipsis;">{tray.name}</span>
            <span style="display: flex; align-items: center; gap: 0.25rem;">
              <span class="trayStats">
                {letter}: {stats.isCardTray
                  ? stats.counters + ' cards'
                  : stats.isCardDivider
                    ? stats.counters + ' cards/' + stats.stacks + 's'
                    : stats.isCardWell
                      ? stats.counters + ' cards/' + stats.stacks + 'c'
                      : stats.isCupTray
                        ? stats.stacks + ' cups'
                        : stats.isStandee
                          ? stats.counters + ' standees'
                          : stats.counters + 'c in ' + stats.stacks + 's'}
              </span>
              <IconButton
                onclick={(e: MouseEvent) => {
                  e.stopPropagation();
                  onDeleteTray(selectedBox.id, tray.id);
                }}
                title="Delete tray"
                size="sm"
                variant="ghost"
              >
                <Icon color="var(--fgMuted)" Icon={IconX} />
              </IconButton>
            </span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Tray Settings -->
  {#if selectedTray}
    <div class="panelForm">
      <div class="panelFormSection">
        <!-- Name -->
        <FormControl label="Name" name="trayName">
          {#snippet input({ inputProps })}
            <Input
              {...inputProps}
              type="text"
              value={selectedTray.name}
              onchange={(e) => onUpdateTray({ name: (e.currentTarget as HTMLInputElement).value })}
            />
          {/snippet}
        </FormControl>

        <Spacer size="1rem" />

        <!-- Move to Box/Section -->
        <FormControl label="Location" name="moveToLocation">
          {#snippet input({ inputProps })}
            <Select
              {...inputProps}
              selected={currentTrayLocation ? [currentTrayLocation] : []}
              options={moveDestinations}
              onSelectedChange={(selected) => {
                if (selected[0]) {
                  handleMoveDestination(selected[0]);
                }
              }}
            />
          {/snippet}
        </FormControl>

        <Spacer size="1rem" />

        {#if !isReservedTray(selectedTray)}
          <!-- Color -->
          <FormControl label="Color" name="trayColor">
            {#snippet start()}
              <Popover>
                {#snippet trigger()}
                  <ColorPickerSwatch color={selectedTray.color} />
                {/snippet}
                {#snippet content()}
                  <ColorPicker
                    showOpacity={false}
                    hex={selectedTray.color}
                    onUpdate={(colorData) => handleColorUpdate(colorData.hex)}
                  />
                {/snippet}
              </Popover>
            {/snippet}
            {#snippet input({ inputProps })}
              <Input
                {...inputProps}
                value={selectedTray.color}
                oninput={(e) => handleColorUpdate(e.currentTarget.value)}
              />
            {/snippet}
          </FormControl>

          <Spacer size="1rem" />

          <!-- Emboss Name -->
          {#if cupOptions && onUpdateCupParams}
            {@const cup = cupOptions}
            {@const updateCup = onUpdateCupParams}
            {@const honeycombBottom = cup.params.honeycombBottom ?? false}
            {@const lidEnabled = cup.params.lidEnabled ?? false}
            {@const honeycombLid = lidEnabled && (cup.params.honeycombLid ?? false)}
            <!-- Cup tray: bottom options, then lid options -->
            <InputCheckbox
              label="Honeycomb bottom"
              checked={honeycombBottom}
              onchange={(e) => updateCup({ ...cup.params, honeycombBottom: e.currentTarget.checked })}
            />
            <Spacer size="0.5rem" />
            <span class={honeycombBottom ? 'disabledOption' : ''}>
              <InputCheckbox
                label="Scooped bottoms"
                checked={cupTrayHasScoops(cup.params)}
                disabled={honeycombBottom}
                onchange={(e) => updateCup({ ...cup.params, scoops: e.currentTarget.checked })}
              />
            </span>
            <Spacer size="0.5rem" />
            <span class={honeycombBottom ? 'disabledOption' : ''}>
              <InputCheckbox
                label="Emboss name on tray bottom"
                checked={!honeycombBottom && (selectedTray.showEmboss ?? true)}
                disabled={honeycombBottom}
                onchange={(e) => onUpdateTray({ showEmboss: e.currentTarget.checked })}
              />
            </span>
            <Spacer size="0.5rem" />
            <InputCheckbox
              label="Lid"
              checked={lidEnabled}
              onchange={(e) => updateCup({ ...cup.params, lidEnabled: e.currentTarget.checked })}
            />
            <Spacer size="0.5rem" />
            <span class={lidEnabled ? '' : 'disabledOption'}>
              <InputCheckbox
                label="Honeycomb lid"
                checked={honeycombLid}
                disabled={!lidEnabled}
                onchange={(e) => updateCup({ ...cup.params, honeycombLid: e.currentTarget.checked })}
              />
            </span>
            <Spacer size="0.5rem" />
            <span class={lidEnabled && !honeycombLid ? '' : 'disabledOption'}>
              <InputCheckbox
                label="Emboss name on tray lid"
                checked={lidEnabled && !honeycombLid && (cup.params.lidEmboss ?? true)}
                disabled={!lidEnabled || honeycombLid}
                onchange={(e) => updateCup({ ...cup.params, lidEmboss: e.currentTarget.checked })}
              />
            </span>
            {#if lidEnabled && getCupTrayOuterWall(cup.params) > cup.params.wallThickness}
              <Spacer size="0.5rem" />
              <Text color="var(--fgMuted)" size="0.875rem">
                The lid's rails need a {getCupTrayOuterWall(cup.params)} mm outer wall. The wall setting still applies between
                cups.
              </Text>
            {/if}
          {:else}
            <InputCheckbox
              label="Emboss name on tray bottom"
              checked={selectedTray.showEmboss ?? true}
              onchange={(e) => onUpdateTray({ showEmboss: e.currentTarget.checked })}
            />
          {/if}
        {/if}
      </div>

      <Hr />

      {#if isCounterTray(selectedTray) && onUpdateCounterParams}
        <CounterTrayEditor
          tray={selectedTray as CounterTray}
          {trayLetter}
          onUpdateParams={onUpdateCounterParams}
          actualHeight={maxTrayHeight}
          displayDimensions={selectedTrayDimensions}
        />
      {:else if isCardDividerTray(selectedTray) && onUpdateCardDividerParams}
        <CardDividerTrayEditor
          tray={selectedTray as CardDividerTray}
          {trayLetter}
          onUpdateParams={onUpdateCardDividerParams}
          {onUpdateTray}
          actualHeight={maxTrayHeight}
          displayDimensions={selectedTrayDimensions}
        />
      {:else if isCardTray(selectedTray) && onUpdateCardParams}
        <CardDrawTrayEditor
          tray={selectedTray as CardDrawTray}
          onUpdateParams={onUpdateCardParams}
          actualHeight={maxTrayHeight}
          displayDimensions={selectedTrayDimensions}
        />
      {:else if isCardWellTray(selectedTray) && onUpdateCardWellParams}
        <CardWellTrayEditor
          tray={selectedTray as CardWellTray}
          {trayLetter}
          onUpdateParams={onUpdateCardWellParams}
          actualHeight={maxTrayHeight}
          displayDimensions={selectedTrayDimensions}
        />
      {:else if isCupTray(selectedTray) && onUpdateCupParams}
        <CupTrayEditor
          tray={selectedTray as CupTray}
          onUpdateParams={onUpdateCupParams}
          actualHeight={maxTrayHeight}
          displayDimensions={selectedTrayDimensions}
        />
      {:else if isReservedTray(selectedTray) && onUpdateReservedParams}
        <ReservedSpaceEditor
          tray={selectedTray as ReservedTray}
          onUpdateParams={onUpdateReservedParams}
          sectionHeight={reservedSectionHeight}
        />
      {:else if isStandeeTray(selectedTray) && onUpdateStandeeParams}
        <StandeeTrayEditor
          tray={selectedTray as StandeeTray}
          onUpdateParams={onUpdateStandeeParams}
          actualHeight={maxTrayHeight}
          displayDimensions={selectedTrayDimensions}
        />
      {/if}
    </div>
  {:else}
    <div class="emptyState">
      <p class="emptyStateText">No tray selected</p>
    </div>
  {/if}
</div>

<style>
  .traysPanel {
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

  .trayStats {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--fgMuted);
  }

  .disabledOption {
    text-decoration: line-through;
    opacity: 0.6;
  }
</style>
