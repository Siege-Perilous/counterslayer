<script lang="ts">
  import { Input, FormControl, Spacer, Select, Link, IconButton, Icon } from '@tableslayer/ui';
  import { IconX, IconMenu } from '@tabler/icons-svelte';
  import type { CounterTray } from '$lib/types/project';
  import type { CounterTrayParams, EdgeOrientation } from '$lib/models/counterTray';
  import { getTrayDimensions } from '$lib/models/box';
  import { getCounterShapes } from '$lib/stores/project.svelte';
  import { DEFAULT_SHAPE_IDS } from '$lib/models/counterTray';

  interface Props {
    tray: CounterTray;
    trayLetter: string;
    onUpdateParams: (params: CounterTrayParams) => void;
    actualHeight?: number;
    displayDimensions?: { width: number; depth: number; height: number } | null;
  }

  let { tray, trayLetter, onUpdateParams, actualHeight, displayDimensions }: Props = $props();

  // Drag and drop state
  let draggedIndex: number | null = $state(null);
  let draggedType: 'top' | 'edge' | null = $state(null);
  let dragOverIndex: number | null = $state(null);

  // Get shape options from project-level counterShapes
  let shapeOptions = $derived(getCounterShapes().map((s) => ({ id: s.id, name: s.name })));

  const orientationOptions: EdgeOrientation[] = ['lengthwise', 'crosswise'];

  // Compute minimum tray width for display
  let minTrayWidth = $derived.by(() => {
    const paramsWithoutOverride = { ...tray.params, trayWidthOverride: 0 };
    return getTrayDimensions(paramsWithoutOverride, getCounterShapes()).width;
  });

  // Compute dimensions, using actualHeight if provided (when tray expands to match box height)
  // If displayDimensions is provided (with rotation applied), use those for display
  let dimensions = $derived.by(() => {
    if (displayDimensions) {
      return displayDimensions;
    }
    const baseDims = getTrayDimensions(tray.params, getCounterShapes());
    return {
      ...baseDims,
      height: actualHeight && actualHeight > baseDims.height ? actualHeight : baseDims.height
    };
  });

  // Get combined stack reference (top-loaded first, then edge-loaded)
  function getStackRef(type: 'top' | 'edge', index: number): string {
    const topCount = tray.params.topLoadedStacks.length;
    const stackNum = type === 'top' ? index + 1 : topCount + index + 1;
    return `${trayLetter}${stackNum}`;
  }

  function updateParam<K extends keyof CounterTrayParams>(key: K, value: CounterTrayParams[K]) {
    onUpdateParams({ ...tray.params, [key]: value });
  }

  // Drag handlers
  function handleDragStart(e: DragEvent, index: number, type: 'top' | 'edge') {
    draggedIndex = index;
    draggedType = type;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', index.toString());
    }
  }

  function handleDragOver(e: DragEvent, index: number, type: 'top' | 'edge') {
    e.preventDefault();
    if (draggedType === type) {
      dragOverIndex = index;
    }
  }

  function handleDragEnd() {
    draggedIndex = null;
    draggedType = null;
    dragOverIndex = null;
  }

  function handleDrop(e: DragEvent, targetIndex: number, type: 'top' | 'edge') {
    e.preventDefault();
    if (draggedIndex === null || draggedType !== type) return;

    if (type === 'top') {
      const newStacks = [...tray.params.topLoadedStacks];
      const [removed] = newStacks.splice(draggedIndex, 1);
      newStacks.splice(targetIndex, 0, removed);
      onUpdateParams({ ...tray.params, topLoadedStacks: newStacks });
    } else {
      const newStacks = [...tray.params.edgeLoadedStacks];
      const [removed] = newStacks.splice(draggedIndex, 1);
      newStacks.splice(targetIndex, 0, removed);
      onUpdateParams({ ...tray.params, edgeLoadedStacks: newStacks });
    }

    handleDragEnd();
  }

  // Top-loaded stack handlers
  function updateTopLoadedStack(index: number, field: 'shape' | 'count' | 'label', value: string | number) {
    const newStacks = [...tray.params.topLoadedStacks];
    const current = newStacks[index];
    if (field === 'shape') {
      newStacks[index] = [value as string, current[1], current[2]];
    } else if (field === 'count') {
      newStacks[index] = [current[0], value as number, current[2]];
    } else {
      newStacks[index] = [current[0], current[1], (value as string) || undefined];
    }
    onUpdateParams({ ...tray.params, topLoadedStacks: newStacks });
  }

  function addTopLoadedStack() {
    const shapeId = getCounterShapes()[0]?.id ?? DEFAULT_SHAPE_IDS.square;
    onUpdateParams({
      ...tray.params,
      topLoadedStacks: [...tray.params.topLoadedStacks, [shapeId, 10, undefined]]
    });
  }

  function removeTopLoadedStack(index: number) {
    const newStacks = tray.params.topLoadedStacks.filter((_, i) => i !== index);
    onUpdateParams({ ...tray.params, topLoadedStacks: newStacks });
  }

  // Edge-loaded stack handlers
  function updateEdgeLoadedStack(
    index: number,
    field: 'shape' | 'count' | 'orientation' | 'label',
    value: string | number
  ) {
    const newStacks = [...tray.params.edgeLoadedStacks];
    const current = newStacks[index];
    if (field === 'shape') {
      newStacks[index] = [value as string, current[1], current[2], current[3]];
    } else if (field === 'count') {
      newStacks[index] = [current[0], value as number, current[2], current[3]];
    } else if (field === 'orientation') {
      newStacks[index] = [current[0], current[1], value as EdgeOrientation, current[3]];
    } else {
      newStacks[index] = [current[0], current[1], current[2], (value as string) || undefined];
    }
    onUpdateParams({ ...tray.params, edgeLoadedStacks: newStacks });
  }

  function addEdgeLoadedStack() {
    const shapeId = getCounterShapes()[0]?.id ?? DEFAULT_SHAPE_IDS.square;
    onUpdateParams({
      ...tray.params,
      edgeLoadedStacks: [...tray.params.edgeLoadedStacks, [shapeId, 10, 'lengthwise', undefined]]
    });
  }

  function removeEdgeLoadedStack(index: number) {
    const newStacks = tray.params.edgeLoadedStacks.filter((_, i) => i !== index);
    onUpdateParams({ ...tray.params, edgeLoadedStacks: newStacks });
  }
</script>

<div class="panelFormSection">
  <!-- Top-Loaded Stacks -->
  <section class="section">
    <h3 class="sectionTitle">Top-Loaded Stacks</h3>
    <Spacer size="0.5rem" />
    <div class="stackList">
      {#each tray.params.topLoadedStacks as stack, index (index)}
        <div
          class="stackRow {draggedIndex === index && draggedType === 'top'
            ? 'stackRow--dragging'
            : ''} {dragOverIndex === index && draggedType === 'top' && draggedIndex !== index
            ? 'stackRow--dragover'
            : ''}"
          role="listitem"
          ondragover={(e) => handleDragOver(e, index, 'top')}
          ondrop={(e) => handleDrop(e, index, 'top')}
        >
          <span
            class="dragHandle"
            title="Drag to reorder"
            draggable="true"
            ondragstart={(e) => handleDragStart(e, index, 'top')}
            ondragend={handleDragEnd}
            role="button"
            tabindex="0"
          >
            <Icon Icon={IconMenu} size="1rem" color="var(--fgMuted)" />
          </span>
          <div class="stackLabelInput">
            <span class="stackRef">{getStackRef('top', index)}</span>
            <Input
              type="text"
              placeholder="Label"
              value={stack[2] ?? ''}
              onchange={(e) => updateTopLoadedStack(index, 'label', e.currentTarget.value)}
            />
          </div>
          <div class="stackSelect">
            <Select
              selected={[stack[0]]}
              options={shapeOptions.map((s) => ({
                value: s.id,
                label: s.name
              }))}
              onSelectedChange={(selected) => updateTopLoadedStack(index, 'shape', selected[0])}
            />
          </div>
          <Input
            type="number"
            min="1"
            value={stack[1]}
            onchange={(e) => updateTopLoadedStack(index, 'count', parseInt(e.currentTarget.value))}
            style="width: 3.5rem;"
          />
          <IconButton
            variant="ghost"
            onclick={() => removeTopLoadedStack(index)}
            title="Remove stack"
            color="var(--fgMuted)"
          >
            <Icon Icon={IconX} color="var(--fgMuted)" />
          </IconButton>
        </div>
      {/each}
      <Spacer size="0.5rem" />
      <Link as="button" onclick={addTopLoadedStack}>Add top-loaded stack</Link>
    </div>
  </section>

  <Spacer size="0.5rem" />

  <!-- Edge-Loaded Stacks -->
  <section class="section">
    <h3 class="sectionTitle">Edge-Loaded Stacks</h3>
    <Spacer size="0.5rem" />
    <div class="stackList">
      {#each tray.params.edgeLoadedStacks as stack, index (index)}
        <div
          class="stackRow {draggedIndex === index && draggedType === 'edge'
            ? 'stackRow--dragging'
            : ''} {dragOverIndex === index && draggedType === 'edge' && draggedIndex !== index
            ? 'stackRow--dragover'
            : ''}"
          role="listitem"
          ondragover={(e) => handleDragOver(e, index, 'edge')}
          ondrop={(e) => handleDrop(e, index, 'edge')}
        >
          <span
            class="dragHandle"
            title="Drag to reorder"
            draggable="true"
            ondragstart={(e) => handleDragStart(e, index, 'edge')}
            ondragend={handleDragEnd}
            role="button"
            tabindex="0"
          >
            <Icon Icon={IconMenu} size="sm" color="var(--fgMuted)" />
          </span>
          <div class="stackLabelInput">
            <span class="stackRef">{getStackRef('edge', index)}</span>
            <Input
              type="text"
              placeholder="Label"
              value={stack[3] ?? ''}
              onchange={(e) => updateEdgeLoadedStack(index, 'label', e.currentTarget.value)}
            />
          </div>
          <div class="stackSelect">
            <Select
              selected={[stack[0]]}
              options={shapeOptions.map((s) => ({
                value: s.id,
                label: s.name
              }))}
              onSelectedChange={(selected) => updateEdgeLoadedStack(index, 'shape', selected[0])}
            />
          </div>
          <Input
            type="number"
            min="1"
            value={stack[1]}
            onchange={(e) => updateEdgeLoadedStack(index, 'count', parseInt(e.currentTarget.value))}
            style="width: 3rem;"
          />
          <div class="stackSelectSmall">
            <Select
              selected={[stack[2] ?? 'lengthwise']}
              options={orientationOptions.map((o) => ({ value: o, label: o.slice(0, 6) }))}
              onSelectedChange={(selected) => updateEdgeLoadedStack(index, 'orientation', selected[0])}
            />
          </div>
          <IconButton onclick={() => removeEdgeLoadedStack(index)} title="Remove stack" variant="ghost">
            <Icon Icon={IconX} color="var(--fgMuted)" />
          </IconButton>
        </div>
      {/each}
      <Spacer size="0.5rem" />
      <Link as="button" onclick={addEdgeLoadedStack}>Add edge-loaded stack</Link>
    </div>
  </section>
</div>

<div class="panelFormSection">
  <!-- Tray Settings -->
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
      <FormControl label="Cutout %" name="cutoutRatio">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={tray.params.cutoutRatio}
            onchange={(e) => updateParam('cutoutRatio', parseFloat(e.currentTarget.value))}
          />
        {/snippet}
      </FormControl>
      <FormControl label="Cutout max" name="cutoutMax">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="number"
            step="1"
            value={tray.params.cutoutMax}
            onchange={(e) => updateParam('cutoutMax', parseFloat(e.currentTarget.value))}
          />
        {/snippet}
        {#snippet end()}mm{/snippet}
      </FormControl>
    </div>
  </section>

  <Spacer size="0.5rem" />

  <!-- Custom Width -->
  <section class="section">
    <h3 class="sectionTitle">Custom width</h3>
    <Spacer size="0.5rem" />
    <div class="formGrid">
      <FormControl
        label="Tray width (min: {minTrayWidth.toFixed(1)})"
        name="trayWidthOverride"
        class="formGrid__spanTwo"
      >
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="number"
            step="1"
            placeholder="Auto"
            value={tray.params.trayWidthOverride || ''}
            onchange={(e) => {
              const val = e.currentTarget.value;
              updateParam('trayWidthOverride', val === '' ? 0 : parseFloat(val));
            }}
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

  .formGrid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  :global(.formGrid__spanTwo) {
    grid-column: span 2;
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
    border-radius: var(--radius-2);
    border: solid 1px transparent;
    position: relative;
  }

  .stackRow--dragging {
    opacity: 0.4;
    background: var(--contrastLow);
  }

  .stackRow--dragover::before {
    content: '';
    position: absolute;
    top: -2px;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--fgPrimary);
    border-radius: 1px;
  }

  .dragHandle {
    display: flex;
    cursor: grab;
    color: var(--fgMuted);
    width: 1rem;
    min-width: 1rem;
    min-height: 2rem;
    padding: 0.5rem;
  }

  .dragHandle:active {
    cursor: grabbing;
  }

  .stackRow:has(.dragHandle:hover) {
    border: dashed 1px var(--contrastLow);
    background: var(--contrastEmpty);
  }

  .dragHandle:hover {
    color: var(--fg);
  }

  .stackSelect {
    width: 7rem;
    flex-shrink: 0;
  }

  .stackSelectSmall {
    width: 6rem;
    flex-shrink: 0;
  }

  .stackLabelInput {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
  }

  .stackRef {
    font-family: var(--font-mono);
    font-size: 0.625rem;
    color: var(--fgMuted);
    width: 1.75rem;
    text-align: right;
    flex-shrink: 0;
  }

  .dimensionsInfo {
    font-size: 0.75rem;
    color: var(--fgMuted);
    margin: 0;
  }
</style>
