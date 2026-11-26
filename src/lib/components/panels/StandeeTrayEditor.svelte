<script lang="ts">
  import { Input, FormControl, Spacer, Select } from '@tableslayer/ui';
  import type { StandeeTray } from '#lib/types/project.js';
  import {
    type StandeeTrayParams,
    getStandeeTrayDimensions,
    DEFAULT_SLOT_ANGLE_DEG,
    DEFAULT_STANDEE_GAP,
    LEGACY_BASE_GAP,
    MIN_SLOT_ANGLE_DEG,
    MAX_SLOT_ANGLE_DEG
  } from '#lib/models/standeeTray.js';
  import { getStandees } from '#lib/stores/project.svelte.js';

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

  // Auto dimensions (ignoring overrides) - used as placeholders / minimums for the width & depth inputs
  let autoDimensions = $derived(
    getStandeeTrayDimensions({ ...tray.params, trayWidthOverride: null, trayDepthOverride: null }, getStandees())
  );

  // Auto slot wall height: as tall as the tray's own walls, measured from the floor
  let autoSlotWallHeight = $derived(autoDimensions.height - tray.params.floorThickness);

  function updateParam<K extends keyof StandeeTrayParams>(key: K, value: StandeeTrayParams[K]) {
    onUpdateParams({ ...tray.params, [key]: value });
  }

  // Whole-number inputs (count, rows): ignore blank/invalid entries and never go below 1
  function updateCount(key: 'count' | 'rows', raw: string) {
    const parsed = parseInt(raw);
    if (!Number.isNaN(parsed)) updateParam(key, Math.max(1, parsed));
  }

  // Describes how the standees are dealt across the rows, mirroring the tray's layout
  let rowSummary = $derived.by(() => {
    const count = Math.max(0, Math.floor(tray.params.count));
    const rows = Math.max(1, Math.min(Math.floor(tray.params.rows) || 1, count));
    const walls = 'split across two opposing slotted walls';
    if (rows === 1) return `One row, ${walls}.`;
    const perRow = Math.floor(count / rows);
    const size = count % rows === 0 ? `${perRow}` : `${perRow}–${perRow + 1}`;
    return `${rows} rows of ${size}, each ${walls}. Neighbouring rows share one wall.`;
  });

  // Base gap: the gap between each base and its slotted wall. Ignore blank/invalid entries, never negative
  function updateBaseGap(raw: string) {
    const parsed = parseFloat(raw);
    if (!Number.isNaN(parsed)) updateParam('baseGap', Math.max(0, parsed));
  }

  // Standee gap: space between opposing standees (the material between their slots). Blank/invalid resets
  // to the default, never negative
  function updateStandeeGap(raw: string) {
    const parsed = parseFloat(raw);
    updateParam('standeeGap', Number.isNaN(parsed) ? DEFAULT_STANDEE_GAP : Math.max(0, parsed));
  }

  // Slot angle: blank/invalid resets to the default, otherwise clamp to the supported range
  function updateSlotAngle(raw: string) {
    const parsed = parseFloat(raw);
    const angle = Number.isNaN(parsed) ? DEFAULT_SLOT_ANGLE_DEG : parsed;
    updateParam('slotAngle', Math.min(MAX_SLOT_ANGLE_DEG, Math.max(MIN_SLOT_ANGLE_DEG, angle)));
  }

  // Width/depth/slot wall height overrides: blank = auto, otherwise the value (clamped at generation)
  function updateSizeOverride(key: 'trayWidthOverride' | 'trayDepthOverride' | 'slotWallHeight', raw: string) {
    const trimmed = raw.trim();
    const parsed = parseFloat(trimmed);
    updateParam(key, trimmed === '' || Number.isNaN(parsed) ? null : parsed);
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
    <div class="formGrid">
      <FormControl label="Number of standees" name="count">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="number"
            step="1"
            min="1"
            value={tray.params.count}
            onchange={(e) => updateCount('count', e.currentTarget.value)}
          />
        {/snippet}
      </FormControl>
      <FormControl label="Rows" name="rows">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="number"
            step="1"
            min="1"
            value={tray.params.rows ?? 1}
            onchange={(e) => updateCount('rows', e.currentTarget.value)}
          />
        {/snippet}
      </FormControl>
    </div>
    <Spacer size="0.25rem" />
    <p class="standeeInfo">{rowSummary}</p>
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
      <div class="slotGroup">
        <p class="slotGroup__help">
          Slots are the angled cuts that hold each figure. Base gap moves the slot walls away from the bases. Spread
          widens the strip between opposing standees.
        </p>
        <div class="formGrid">
          <FormControl label="Slot wall" name="innerWallThickness">
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
          <FormControl label="Slot wall height" name="slotWallHeight">
            {#snippet input({ inputProps })}
              <Input
                {...inputProps}
                type="number"
                step="0.1"
                min="1"
                placeholder={`Auto (${autoSlotWallHeight.toFixed(1)})`}
                value={tray.params.slotWallHeight ?? ''}
                onchange={(e) => updateSizeOverride('slotWallHeight', e.currentTarget.value)}
              />
            {/snippet}
            {#snippet end()}mm{/snippet}
          </FormControl>
          <FormControl label="Slot wall base gap" name="baseGap">
            {#snippet input({ inputProps })}
              <Input
                {...inputProps}
                type="number"
                step="0.1"
                min="0"
                value={tray.params.baseGap ?? LEGACY_BASE_GAP}
                onchange={(e) => updateBaseGap(e.currentTarget.value)}
              />
            {/snippet}
            {#snippet end()}mm{/snippet}
          </FormControl>
          <FormControl label="Slot spread" name="standeeGap">
            {#snippet input({ inputProps })}
              <Input
                {...inputProps}
                type="number"
                step="0.1"
                min="0"
                value={tray.params.standeeGap ?? DEFAULT_STANDEE_GAP}
                onchange={(e) => updateStandeeGap(e.currentTarget.value)}
              />
            {/snippet}
            {#snippet end()}mm{/snippet}
          </FormControl>
          <FormControl label="Slot angle" name="slotAngle">
            {#snippet input({ inputProps })}
              <Input
                {...inputProps}
                type="number"
                step="1"
                min={MIN_SLOT_ANGLE_DEG}
                max={MAX_SLOT_ANGLE_DEG}
                value={tray.params.slotAngle ?? DEFAULT_SLOT_ANGLE_DEG}
                onchange={(e) => updateSlotAngle(e.currentTarget.value)}
              />
            {/snippet}
            {#snippet end()}°{/snippet}
          </FormControl>
        </div>
      </div>
      <FormControl label="Width" name="trayWidthOverride">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="number"
            step="0.1"
            placeholder={`Auto (${autoDimensions.width.toFixed(1)})`}
            value={tray.params.trayWidthOverride ?? ''}
            onchange={(e) => updateSizeOverride('trayWidthOverride', e.currentTarget.value)}
          />
        {/snippet}
        {#snippet end()}mm{/snippet}
      </FormControl>
      <FormControl label="Length" name="trayDepthOverride">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="number"
            step="0.1"
            placeholder={`Auto (${autoDimensions.depth.toFixed(1)})`}
            value={tray.params.trayDepthOverride ?? ''}
            onchange={(e) => updateSizeOverride('trayDepthOverride', e.currentTarget.value)}
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

  .slotGroup {
    grid-column: 1 / -1;
    padding: 1rem 0;
    border-top: var(--borderThin);
    border-bottom: var(--borderThin);
  }

  .slotGroup__help {
    margin: 0 0 0.75rem;
    font-size: 0.75rem;
    color: var(--fgMuted);
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
