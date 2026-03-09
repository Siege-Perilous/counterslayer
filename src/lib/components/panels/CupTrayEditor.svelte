<script lang="ts">
  import { Input, FormControl, Spacer } from '@tableslayer/ui';
  import type { CupTray } from '$lib/types/project';
  import type { CupLayout } from '$lib/types/cupLayout';
  import { countCups } from '$lib/types/cupLayout';
  import {
    type CupTrayParams,
    getCupTrayDimensions,
    validateCupTrayParams,
    DEFAULT_CUP_CAVITY_HEIGHT
  } from '$lib/models/cupTray';
  import CupLayoutEditor from './CupLayoutEditor.svelte';

  interface Props {
    tray: CupTray;
    onUpdateParams: (params: CupTrayParams) => void;
    actualHeight?: number;
    displayDimensions?: { width: number; depth: number; height: number } | null;
  }

  let { tray, onUpdateParams, actualHeight, displayDimensions }: Props = $props();

  // Cup count for display
  let cupCount = $derived(countCups(tray.params.layout));

  // Compute auto cup cavity height (used when cupCavityHeight is null)
  let autoCupCavityHeight = $derived.by(() => {
    if (actualHeight) {
      return actualHeight - tray.params.floorThickness;
    }
    return DEFAULT_CUP_CAVITY_HEIGHT;
  });

  // Effective height for display calculations
  let effectiveCupCavityHeight = $derived(tray.params.cupCavityHeight ?? autoCupCavityHeight);

  // Compute tray dimensions
  // If displayDimensions is provided (with rotation applied), use those for display
  let dimensions = $derived.by(() => {
    if (displayDimensions) {
      return displayDimensions;
    }
    const baseDims = getCupTrayDimensions(tray.params, effectiveCupCavityHeight);
    return {
      ...baseDims,
      height: actualHeight && actualHeight > baseDims.height ? actualHeight : baseDims.height
    };
  });

  // Compute validation warnings
  let warnings = $derived.by(() => {
    return validateCupTrayParams(tray.params);
  });

  function updateParam<K extends keyof CupTrayParams>(key: K, value: CupTrayParams[K]) {
    onUpdateParams({ ...tray.params, [key]: value });
  }

  function handleLayoutUpdate(layout: CupLayout) {
    updateParam('layout', layout);
  }

  function handleCupCavityHeightChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const value = input.value.trim();
    if (value === '') {
      updateParam('cupCavityHeight', null);
    } else {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        updateParam('cupCavityHeight', num);
      }
    }
  }
</script>

<div class="panelFormSection">
  <!-- Tray Dimensions (Primary Controls) -->
  <section class="section">
    <div class="sectionHeader">
      <h3 class="sectionTitle">Tray Dimensions</h3>
      <span class="dimensionsInfo">
        {dimensions.width.toFixed(1)} &times; {dimensions.depth.toFixed(1)} &times; {dimensions.height.toFixed(1)} mm
      </span>
    </div>
    <Spacer size="0.5rem" />
    <div class="formGrid">
      <FormControl label="Width" name="trayWidth">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="number"
            step="1"
            min="20"
            value={tray.params.trayWidth}
            onchange={(e) => updateParam('trayWidth', parseFloat(e.currentTarget.value))}
          />
        {/snippet}
        {#snippet end()}mm{/snippet}
      </FormControl>
      <FormControl label="Depth" name="trayDepth">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="number"
            step="1"
            min="20"
            value={tray.params.trayDepth}
            onchange={(e) => updateParam('trayDepth', parseFloat(e.currentTarget.value))}
          />
        {/snippet}
        {#snippet end()}mm{/snippet}
      </FormControl>
    </div>
  </section>

  <Spacer size="0.5rem" />

  <!-- Cup Layout -->
  <section class="section">
    <div class="sectionHeader">
      <h3 class="sectionTitle">Cup Layout</h3>
      <span class="calculatedInfo">
        {cupCount} cup{cupCount !== 1 ? 's' : ''}
      </span>
    </div>
    <Spacer size="0.5rem" />
    <CupLayoutEditor
      layout={tray.params.layout}
      trayWidth={tray.params.trayWidth}
      trayDepth={tray.params.trayDepth}
      onUpdateLayout={handleLayoutUpdate}
    />
    {#if warnings.length > 0}
      <Spacer size="0.5rem" />
      {#each warnings as warning, i (i)}
        <p class="warningText">{warning}</p>
      {/each}
    {/if}
  </section>

  <Spacer size="0.5rem" />

  <!-- Cup Cavity and Wall Settings -->
  <section class="section">
    <div class="formGrid">
      <FormControl label="Cavity height" name="cupCavityHeight">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="number"
            step="1"
            min="10"
            placeholder="Auto"
            value={tray.params.cupCavityHeight ?? ''}
            onchange={handleCupCavityHeightChange}
          />
        {/snippet}
        {#snippet end()}mm{/snippet}
      </FormControl>
      <FormControl label="Corner radius" name="cornerRadius">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="number"
            step="1"
            min="0"
            max="20"
            value={tray.params.cornerRadius}
            onchange={(e) => updateParam('cornerRadius', parseFloat(e.currentTarget.value))}
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

  .dimensionsInfo {
    font-size: 0.75rem;
    color: var(--fgMuted);
    margin: 0;
  }

  .calculatedInfo {
    font-size: 0.75rem;
    color: var(--fgMuted);
    margin: 0;
  }

  .warningText {
    font-size: 0.75rem;
    color: var(--fgDanger);
    margin: 0;
  }

  .warningText + .warningText {
    margin-top: 0.25rem;
  }
</style>
