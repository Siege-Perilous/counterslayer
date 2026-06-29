<script lang="ts">
  import { Input, FormControl, Spacer, Select } from '@tableslayer/ui';
  import type { StandeeTray } from '$lib/types/project';
  import { type StandeeTrayParams, getStandeeTrayDimensions } from '$lib/models/standeeTray';
  import { getStandees } from '$lib/stores/project.svelte';

  interface Props {
    tray: StandeeTray;
    onUpdateParams: (params: StandeeTrayParams) => void;
    actualHeight?: number;
    displayDimensions?: { width: number; depth: number; height: number } | null;
  }

  let { tray, onUpdateParams, actualHeight, displayDimensions }: Props = $props();

  let standees = $derived(getStandees());
  let selectedStandee = $derived(standees.find((s) => s.id === tray.params.standeeId));

  // Compute dimensions, using actualHeight if provided (when tray expands to match box height)
  // If displayDimensions is provided (with rotation applied), use those for display
  let dimensions = $derived.by(() => {
    if (displayDimensions) {
      return displayDimensions;
    }
    const baseDims = getStandeeTrayDimensions(tray.params, getStandees());
    return {
      ...baseDims,
      height: actualHeight && actualHeight > baseDims.height ? actualHeight : baseDims.height
    };
  });

  function updateParam<K extends keyof StandeeTrayParams>(key: K, value: StandeeTrayParams[K]) {
    onUpdateParams({ ...tray.params, [key]: value });
  }
</script>

<div class="panelFormSection">
  <section class="section">
    <h3 class="sectionTitle">Standee</h3>
    <Spacer size="0.5rem" />
    <FormControl label="Standee type" name="standeeId">
      {#snippet input({ inputProps })}
        <Select
          {...inputProps}
          selected={[tray.params.standeeId]}
          options={standees.map((s) => ({
            value: s.id,
            label: `${s.name} (${(s.baseRadius * 2).toFixed(0)}mm base)`
          }))}
          onSelectedChange={(selected) => {
            if (selected[0]) {
              updateParam('standeeId', selected[0]);
            }
          }}
        />
      {/snippet}
    </FormControl>
    {#if selectedStandee}
      <Spacer size="0.25rem" />
      <p class="standeeInfo">
        {selectedStandee.standeeWidth}mm × {selectedStandee.standeeHeight}mm figure, {(
          selectedStandee.baseRadius * 2
        ).toFixed(0)}mm base
      </p>
    {/if}
  </section>

  <Spacer size="0.5rem" />

  <section class="section">
    <h3 class="sectionTitle">Standee Count</h3>
    <Spacer size="0.5rem" />
    <FormControl label="Number of standees" name="count">
      {#snippet input({ inputProps })}
        <Input
          {...inputProps}
          type="number"
          step="1"
          min="1"
          value={tray.params.count}
          onchange={(e) => updateParam('count', parseInt(e.currentTarget.value))}
        />
      {/snippet}
    </FormControl>
    <Spacer size="0.25rem" />
    <p class="standeeInfo">Split evenly across two opposing slotted walls.</p>
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
      <FormControl label="Inner wall" name="innerWallThickness">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="number"
            step="0.1"
            value={tray.params.innerWallThickness}
            onchange={(e) => updateParam('innerWallThickness', parseFloat(e.currentTarget.value))}
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
      <FormControl label="Rim height" name="rimHeight">
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

  .standeeInfo {
    font-size: 0.75rem;
    color: var(--fgMuted);
    margin: 0;
  }

  .dimensionsInfo {
    font-size: 0.75rem;
    color: var(--fgMuted);
    margin: 0;
  }
</style>
