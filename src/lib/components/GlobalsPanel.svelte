<script lang="ts">
  import {
    Input,
    InputCheckbox,
    FormControl,
    Spacer,
    Hr,
    Select,
    Link,
    Icon,
    Panel,
    Button,
    ConfirmActionButton,
    Text
  } from '@tableslayer/ui';
  import { IconSquare, IconCircle, IconHexagon, IconTriangle, IconRectangle, IconCards } from '@tabler/icons-svelte';
  import type { CounterShape, CounterBaseShape, CardSize } from '$lib/types/project';
  import {
    getProject,
    isCounterTray,
    isCardDrawTray,
    isCardDividerTray,
    getCounterShapes,
    getCardSizes,
    addCounterShape,
    updateCounterShape,
    deleteCounterShape,
    addCardSize,
    updateCardSize,
    deleteCardSize,
    DEFAULT_COUNTER_THICKNESS
  } from '$lib/stores/project.svelte';

  interface Props {
    globalSettings: { printBedSize: number };
    onGlobalSettingsChange: (updates: { printBedSize?: number }) => void;
  }

  let { globalSettings, onGlobalSettingsChange }: Props = $props();

  // Track which counter is expanded (null = none)
  let expandedIndex: number | null = $state(null);
  // Track which card size is expanded (null = none)
  let expandedCardIndex: number | null = $state(null);

  // Get shapes and card sizes from project level
  let counterShapes = $derived(getCounterShapes());
  let cardSizes = $derived(getCardSizes());

  // Get the shape icon component for a base shape
  function getShapeIcon(baseShape: CounterBaseShape) {
    switch (baseShape) {
      case 'square':
        return IconSquare;
      case 'circle':
        return IconCircle;
      case 'hex':
        return IconHexagon;
      case 'triangle':
        return IconTriangle;
      case 'rectangle':
      default:
        return IconRectangle;
    }
  }

  // Calculate icon scale relative to max size (with clamping)
  function getRelativeIconScale(shape: CounterShape): number {
    const maxWidth = Math.max(...counterShapes.map((s) => Math.max(s.width, s.length)));
    const shapeSize = Math.max(shape.width, shape.length);
    const minScale = 0.6;
    const maxScale = 1.4;
    const ratio = maxWidth > 0 ? shapeSize / maxWidth : 1;
    return minScale + ratio * (maxScale - minScale);
  }

  // Get display size string for a shape
  function getSizeDisplay(shape: CounterShape): string {
    const baseShape = shape.baseShape ?? 'rectangle';
    if (baseShape === 'rectangle') {
      return `${shape.width} × ${shape.length}`;
    }
    return `${shape.width}`;
  }

  const baseShapeOptions: { value: CounterBaseShape; label: string }[] = [
    { value: 'rectangle', label: 'Rectangle' },
    { value: 'square', label: 'Square' },
    { value: 'circle', label: 'Circle' },
    { value: 'hex', label: 'Hex' },
    { value: 'triangle', label: 'Triangle' }
  ];

  // Custom shape handlers - now using project-level store functions
  function handleAddShape() {
    const newName = `Custom ${counterShapes.length + 1}`;
    const newShape = addCounterShape({
      name: newName,
      baseShape: 'rectangle',
      width: 20,
      length: 30,
      thickness: DEFAULT_COUNTER_THICKNESS
    });
    // Find the index of the newly added shape
    const newIndex = getCounterShapes().findIndex((s) => s.id === newShape.id);
    expandedIndex = newIndex;
  }

  function handleUpdateShape(
    shapeId: string,
    field: keyof CounterShape | 'cornerRadius' | 'pointyTop',
    value: string | number | boolean
  ) {
    const shape = counterShapes.find((s) => s.id === shapeId);
    if (!shape) return;

    if (field === 'name') {
      const newName = value as string;
      // Don't allow duplicate names
      if (counterShapes.some((s) => s.id !== shapeId && s.name === newName)) {
        return;
      }
      updateCounterShape(shapeId, { name: newName });
      return;
    }

    // Handle baseShape changes - sync length to width for non-rectangle shapes
    if (field === 'baseShape') {
      const baseShape = value as CounterBaseShape;
      if (baseShape !== 'rectangle') {
        updateCounterShape(shapeId, { baseShape, length: shape.width });
      } else {
        updateCounterShape(shapeId, { baseShape });
      }
      return;
    }

    // Handle width changes for non-rectangle shapes - sync length
    if (field === 'width') {
      const baseShape = shape.baseShape ?? 'rectangle';
      if (baseShape !== 'rectangle') {
        updateCounterShape(shapeId, { width: value as number, length: value as number });
      } else {
        updateCounterShape(shapeId, { width: value as number });
      }
      return;
    }

    // Handle other fields
    updateCounterShape(shapeId, { [field]: value });
  }

  // Count stacks using a given shape across ALL counter trays in the project
  function countStacksUsingShape(shapeId: string): number {
    const project = getProject();
    let count = 0;

    for (const box of project.boxes) {
      for (const tray of box.trays) {
        if (isCounterTray(tray)) {
          count += tray.params.topLoadedStacks.filter((stack) => stack[0] === shapeId).length;
          count += tray.params.edgeLoadedStacks.filter((stack) => stack[0] === shapeId).length;
        }
      }
    }

    return count;
  }

  function handleRemoveShape(shapeId: string) {
    deleteCounterShape(shapeId);
    expandedIndex = null;
  }

  // Card size handlers - now using project-level store functions
  function handleAddCardSize() {
    const newName = `Custom Card ${cardSizes.length + 1}`;
    const newCardSize = addCardSize({
      name: newName,
      width: 66,
      length: 91,
      thickness: 0.5
    });
    // Find the index of the newly added card size
    const newIndex = getCardSizes().findIndex((s) => s.id === newCardSize.id);
    expandedCardIndex = newIndex;
  }

  function handleUpdateCardSize(cardSizeId: string, field: keyof CardSize, value: string | number) {
    if (field === 'name') {
      const newName = value as string;
      // Don't allow duplicate names
      if (cardSizes.some((s) => s.id !== cardSizeId && s.name === newName)) {
        return;
      }
    }
    updateCardSize(cardSizeId, { [field]: value });
  }

  // Count card trays using a given card size
  function countTraysUsingCardSize(cardSizeId: string): number {
    const project = getProject();
    let count = 0;

    for (const box of project.boxes) {
      for (const tray of box.trays) {
        if (isCardDrawTray(tray)) {
          if (tray.params.cardSizeId === cardSizeId) {
            count++;
          }
        }
        if (isCardDividerTray(tray)) {
          count += tray.params.stacks.filter((s) => s.cardSizeId === cardSizeId).length;
        }
      }
    }

    return count;
  }

  function handleRemoveCardSize(cardSizeId: string) {
    deleteCardSize(cardSizeId);
    expandedCardIndex = null;
  }
</script>

<div class="globalsPanel">
  <section class="section">
    <h3 class="sectionTitle">Print Bed</h3>
    <FormControl label="Bed size" name="printBedSize">
      {#snippet input({ inputProps })}
        <Input
          {...inputProps}
          type="number"
          step="1"
          min="100"
          value={globalSettings.printBedSize}
          onchange={(e) => onGlobalSettingsChange({ printBedSize: parseInt(e.currentTarget.value) })}
        />
      {/snippet}
      {#snippet end()}mm{/snippet}
    </FormControl>
  </section>

  <Hr />

  <section class="section">
    <h3 class="sectionTitle">Counters</h3>
    <Spacer size="0.5rem" />
    <div class="customShapesList">
      {#each counterShapes as shape, index (shape.id)}
        {@const baseShape = shape.baseShape ?? 'rectangle'}
        {@const isExpanded = expandedIndex === index}
        {#if isExpanded}
          <!-- Expanded view: full form in Panel -->
          <Panel class="shapePanel">
            <div class="shapePanelContent">
              <div class="shapeFormGrid">
                <FormControl label="Name" name="name-{index}">
                  {#snippet input({ inputProps })}
                    <Input
                      {...inputProps}
                      type="text"
                      value={shape.name}
                      onchange={(e) => handleUpdateShape(shape.id, 'name', e.currentTarget.value)}
                      placeholder="Name"
                    />
                  {/snippet}
                </FormControl>
                <FormControl label="Shape" name="baseShape-{index}">
                  {#snippet input({ inputProps })}
                    <Select
                      selected={[baseShape]}
                      onSelectedChange={(selected) => handleUpdateShape(shape.id, 'baseShape', selected[0])}
                      options={baseShapeOptions}
                      {...inputProps}
                    />
                  {/snippet}
                </FormControl>
                <FormControl label="Thickness" name="thickness-{index}">
                  {#snippet input({ inputProps })}
                    <Input
                      {...inputProps}
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={shape.thickness}
                      onchange={(e) => handleUpdateShape(shape.id, 'thickness', parseFloat(e.currentTarget.value))}
                    />
                  {/snippet}
                  {#snippet end()}mm{/snippet}
                </FormControl>
                {#if baseShape === 'rectangle'}
                  <FormControl label="Width" name="width-{index}">
                    {#snippet input({ inputProps })}
                      <Input
                        {...inputProps}
                        type="number"
                        step="0.1"
                        min="1"
                        value={shape.width}
                        onchange={(e) => handleUpdateShape(shape.id, 'width', parseFloat(e.currentTarget.value))}
                      />
                    {/snippet}
                    {#snippet end()}mm{/snippet}
                  </FormControl>
                  <FormControl label="Length" name="length-{index}">
                    {#snippet input({ inputProps })}
                      <Input
                        {...inputProps}
                        type="number"
                        step="0.1"
                        min="1"
                        value={shape.length}
                        onchange={(e) => handleUpdateShape(shape.id, 'length', parseFloat(e.currentTarget.value))}
                      />
                    {/snippet}
                    {#snippet end()}mm{/snippet}
                  </FormControl>
                {:else if baseShape === 'square'}
                  <FormControl label="Size" name="size-{index}">
                    {#snippet input({ inputProps })}
                      <Input
                        {...inputProps}
                        type="number"
                        step="0.1"
                        min="1"
                        value={shape.width}
                        onchange={(e) => handleUpdateShape(shape.id, 'width', parseFloat(e.currentTarget.value))}
                      />
                    {/snippet}
                    {#snippet end()}mm{/snippet}
                  </FormControl>
                {:else if baseShape === 'circle'}
                  <FormControl label="Diameter" name="diameter-{index}">
                    {#snippet input({ inputProps })}
                      <Input
                        {...inputProps}
                        type="number"
                        step="0.1"
                        min="1"
                        value={shape.width}
                        onchange={(e) => handleUpdateShape(shape.id, 'width', parseFloat(e.currentTarget.value))}
                      />
                    {/snippet}
                    {#snippet end()}mm{/snippet}
                  </FormControl>
                {:else if baseShape === 'hex'}
                  <FormControl label="Flat-to-flat" name="flatToFlat-{index}">
                    {#snippet input({ inputProps })}
                      <Input
                        {...inputProps}
                        type="number"
                        step="0.1"
                        min="1"
                        value={shape.width}
                        onchange={(e) => handleUpdateShape(shape.id, 'width', parseFloat(e.currentTarget.value))}
                      />
                    {/snippet}
                    {#snippet end()}mm{/snippet}
                  </FormControl>
                  <InputCheckbox
                    checked={shape.pointyTop ?? false}
                    onchange={(e) => handleUpdateShape(shape.id, 'pointyTop', e.currentTarget.checked ? 1 : 0)}
                    label="Pointy top"
                  />
                {:else if baseShape === 'triangle'}
                  <FormControl label="Side" name="side-{index}">
                    {#snippet input({ inputProps })}
                      <Input
                        {...inputProps}
                        type="number"
                        step="0.1"
                        min="1"
                        value={shape.width}
                        onchange={(e) => handleUpdateShape(shape.id, 'width', parseFloat(e.currentTarget.value))}
                      />
                    {/snippet}
                    {#snippet end()}mm{/snippet}
                  </FormControl>
                  <FormControl label="Radius" name="cornerRadius-{index}">
                    {#snippet input({ inputProps })}
                      <Input
                        {...inputProps}
                        type="number"
                        step="0.1"
                        min="0"
                        value={shape.cornerRadius ?? 1.5}
                        onchange={(e) => handleUpdateShape(shape.id, 'cornerRadius', parseFloat(e.currentTarget.value))}
                      />
                    {/snippet}
                    {#snippet end()}mm{/snippet}
                  </FormControl>
                {/if}
              </div>
            </div>
            <Hr />
            {@const stackCount = countStacksUsingShape(shape.id)}
            <div class="shapePanelActions">
              <Button size="sm" onclick={() => (expandedIndex = null)}>Save</Button>
              <ConfirmActionButton action={() => handleRemoveShape(shape.id)} actionButtonText="Delete counter">
                {#snippet trigger({ triggerProps })}
                  <Button {...triggerProps} size="sm" variant="ghost">Delete</Button>
                {/snippet}
                {#snippet actionMessage()}
                  <div style="max-width: 15rem;">
                    <Text weight={600} color="var(--fgDanger)">Warning</Text>
                    <Spacer size="0.5rem" />
                    {#if stackCount > 0}
                      <Text size="0.875rem">
                        Deleting the "{shape.name}" counter will also remove
                        <Text as="span" color="var(--fgDanger)">
                          {stackCount}
                          stack{stackCount === 1 ? '' : 's'}
                        </Text> using it.
                      </Text>
                    {:else}
                      <Text size="0.875rem">Delete the "{shape.name}" counter?</Text>
                    {/if}
                    <Spacer size="0.5rem" />
                  </div>
                {/snippet}
              </ConfirmActionButton>
            </div>
          </Panel>
        {:else}
          {@const iconScale = getRelativeIconScale(shape)}
          <div class="shapeCard">
            <!-- Collapsed view: compact summary -->
            <button class="shapeSummary" onclick={() => (expandedIndex = index)} title="Click to edit {shape.name}">
              <span class="shapeIcon" style="transform: scale({iconScale}); --stroke-width: {2 / iconScale};">
                <Icon Icon={getShapeIcon(baseShape)} size={16} />
              </span>
              <span class="shapeName">{shape.name}</span>
              <span class="shapeSize">{getSizeDisplay(shape)} mm</span>
            </button>
          </div>
        {/if}
      {/each}
    </div>
    <Spacer />
    <Link as="button" onclick={handleAddShape}>+ New counter</Link>
  </section>

  <Hr />

  <section class="section">
    <h3 class="sectionTitle">Card Sizes (Sleeved)</h3>
    <Spacer size="0.5rem" />
    <div class="customShapesList">
      {#each cardSizes as cardSize, index (cardSize.id)}
        {@const isExpanded = expandedCardIndex === index}
        {#if isExpanded}
          <!-- Expanded view: full form in Panel -->
          <Panel class="shapePanel">
            <div class="shapePanelContent">
              <div class="shapeFormGrid">
                <FormControl label="Name" name="cardName-{index}">
                  {#snippet input({ inputProps })}
                    <Input
                      {...inputProps}
                      type="text"
                      value={cardSize.name}
                      onchange={(e) => handleUpdateCardSize(cardSize.id, 'name', e.currentTarget.value)}
                      placeholder="Name"
                    />
                  {/snippet}
                </FormControl>
                <FormControl label="Width" name="cardWidth-{index}">
                  {#snippet input({ inputProps })}
                    <Input
                      {...inputProps}
                      type="number"
                      step="0.5"
                      min="10"
                      value={cardSize.width}
                      onchange={(e) => handleUpdateCardSize(cardSize.id, 'width', parseFloat(e.currentTarget.value))}
                    />
                  {/snippet}
                  {#snippet end()}mm{/snippet}
                </FormControl>
                <FormControl label="Length" name="cardLength-{index}">
                  {#snippet input({ inputProps })}
                    <Input
                      {...inputProps}
                      type="number"
                      step="0.5"
                      min="10"
                      value={cardSize.length}
                      onchange={(e) => handleUpdateCardSize(cardSize.id, 'length', parseFloat(e.currentTarget.value))}
                    />
                  {/snippet}
                  {#snippet end()}mm{/snippet}
                </FormControl>
                <FormControl label="Thickness" name="cardThickness-{index}">
                  {#snippet input({ inputProps })}
                    <Input
                      {...inputProps}
                      type="number"
                      step="0.05"
                      min="0.1"
                      value={cardSize.thickness}
                      onchange={(e) =>
                        handleUpdateCardSize(cardSize.id, 'thickness', parseFloat(e.currentTarget.value))}
                    />
                  {/snippet}
                  {#snippet end()}mm{/snippet}
                </FormControl>
              </div>
            </div>
            <Hr />
            {@const trayCount = countTraysUsingCardSize(cardSize.id)}
            <div class="shapePanelActions">
              <Button size="sm" onclick={() => (expandedCardIndex = null)}>Save</Button>
              <ConfirmActionButton action={() => handleRemoveCardSize(cardSize.id)} actionButtonText="Delete card size">
                {#snippet trigger({ triggerProps })}
                  <Button {...triggerProps} size="sm" variant="ghost">Delete</Button>
                {/snippet}
                {#snippet actionMessage()}
                  <div style="max-width: 15rem;">
                    <Text weight={600} color="var(--fgDanger)">Warning</Text>
                    <Spacer size="0.5rem" />
                    {#if trayCount > 0}
                      <Text size="0.875rem">
                        Deleting "{cardSize.name}" will affect
                        <Text as="span" color="var(--fgDanger)">
                          {trayCount}
                          card tray{trayCount === 1 ? '' : 's'}
                        </Text> using it.
                      </Text>
                    {:else}
                      <Text size="0.875rem">Delete the "{cardSize.name}" card size?</Text>
                    {/if}
                    <Spacer size="0.5rem" />
                  </div>
                {/snippet}
              </ConfirmActionButton>
            </div>
          </Panel>
        {:else}
          <div class="shapeCard">
            <!-- Collapsed view: compact summary -->
            <button
              class="shapeSummary"
              onclick={() => (expandedCardIndex = index)}
              title="Click to edit {cardSize.name}"
            >
              <span class="shapeIcon">
                <Icon Icon={IconCards} size={16} />
              </span>
              <span class="shapeName">{cardSize.name}</span>
              <span class="shapeSize">{cardSize.width}×{cardSize.length} mm</span>
            </button>
          </div>
        {/if}
      {/each}
    </div>
    <Spacer />
    <Link as="button" onclick={handleAddCardSize}>+ New card size</Link>
  </section>

  <Hr />
</div>

<style>
  .globalsPanel {
    height: 100%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0.75rem 0;
  }

  .section {
    padding: 0 0.75rem;
  }

  .sectionTitle {
    margin-bottom: 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--fgMuted);
  }

  .customShapesList {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .shapeCard {
    border-radius: var(--radius-2);
    background: var(--contrastLowest);
    overflow: hidden;
  }

  :global(.panel.shapePanel) {
    padding: 0;
    background: var(--contrastLow) !important;
  }

  .shapePanelContent {
    padding: 0.75rem;
  }

  .shapeFormGrid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    gap: 0.75rem;
  }

  .shapePanelActions {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem;
  }

  .shapeSummary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    font: inherit;
    color: inherit;
  }

  .shapeSummary:hover {
    background: var(--contrastLow);
  }

  .shapeIcon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    color: var(--fgMuted);
  }

  .shapeIcon :global(svg) {
    stroke-width: var(--stroke-width, 2);
  }

  .shapeName {
    flex: 1;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .shapeSize {
    font-size: 0.75rem;
    color: var(--fgMuted);
    font-family: var(--font-mono);
  }
</style>
