<script lang="ts">
  /**
   * Project Layout Panel
   * Side panel shown while arranging sections in the game container: exact X/Y/Z for the
   * selected section, rotate and drop, and the list of layout problems.
   */
  import { Button, FormControl, Input, Spacer, Text } from '@tableslayer/ui';
  import {
    dropLayoutSection,
    moveLayoutSection,
    setLayoutSectionHeight,
    projectLayoutEditorState,
    rotateSelectedLayoutSection,
    selectLayoutSection
  } from '#lib/stores/projectLayoutEditor.svelte.js';

  let layout = $derived(projectLayoutEditorState.layout);
  let selected = $derived(
    layout?.sections.find((s) => s.sectionId === projectLayoutEditorState.selectedSectionId) ?? null
  );
  let issues = $derived(layout?.issues ?? []);
  let selectedIds = $derived(projectLayoutEditorState.selectedSectionIds);

  function round(value: number): number {
    return Math.round(value * 10) / 10;
  }

  function handleMove(axis: 'x' | 'y', raw: string) {
    const value = parseFloat(raw);
    if (!selected || Number.isNaN(value)) return;
    moveLayoutSection(selected.sectionId, axis === 'x' ? value : selected.x, axis === 'y' ? value : selected.y);
  }

  function handleLift(raw: string) {
    const value = parseFloat(raw);
    if (!selected || Number.isNaN(value)) return;
    setLayoutSectionHeight(selected.sectionId, value);
  }
</script>

<div class="projectLayoutPanel">
  <Text size="0.875rem" color="var(--fgMuted)">
    Drag a section to slide it around the game container. Select one to show its arrows, and drag an arrow to move along
    that direction only: red for left and right, green for front and back, blue for up and down. Lift a section past the
    one above to swap their order. Shift+click to select several sections and move them together. This layout shows how
    everything packs into the box; it does not change what is printed.
  </Text>
  <Spacer size="1rem" />

  <div class="projectLayoutPanel__sections">
    {#each layout?.sections ?? [] as section (section.sectionId)}
      <button
        type="button"
        class="projectLayoutPanel__section"
        class:projectLayoutPanel__section--selected={selectedIds.includes(section.sectionId)}
        onclick={(e) => selectLayoutSection(section.sectionId, e.shiftKey)}
      >
        <span class="projectLayoutPanel__sectionName">{section.name}</span>
        <span class="projectLayoutPanel__sectionInfo">
          {round(section.z)}–{round(section.z + section.height)}mm{section.floating ? ', floating' : ''}
        </span>
      </button>
    {/each}
  </div>

  {#if selected && selectedIds.length > 1}
    <Spacer size="1rem" />
    <Text size="0.875rem" color="var(--fgMuted)">
      {selectedIds.length} sections selected. Dragging or lifting one moves them all together. Select a single section to
      set its exact position.
    </Text>
  {:else if selected}
    <Spacer size="1rem" />
    <h3 class="projectLayoutPanel__title">{selected.name}</h3>
    <div class="projectLayoutPanel__inputs">
      <FormControl label="X" name="sectionX">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="number"
            step="1"
            value={round(selected.x)}
            onchange={(e) => handleMove('x', e.currentTarget.value)}
          />
        {/snippet}
        {#snippet end()}mm{/snippet}
      </FormControl>
      <FormControl label="Y" name="sectionY">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="number"
            step="1"
            value={round(selected.y)}
            onchange={(e) => handleMove('y', e.currentTarget.value)}
          />
        {/snippet}
        {#snippet end()}mm{/snippet}
      </FormControl>
      <FormControl label="Z" name="sectionZ">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="number"
            step="1"
            min="0"
            value={round(selected.z)}
            onchange={(e) => handleLift(e.currentTarget.value)}
          />
        {/snippet}
        {#snippet end()}mm{/snippet}
      </FormControl>
    </div>
    <Spacer size="0.5rem" />
    <Text size="0.875rem" color="var(--fgMuted)">
      {round(selected.world.width)} × {round(selected.world.depth)} × {round(selected.height)}mm, turned {selected.rotation}°.
      {selected.floating ? 'Floating: nothing is directly underneath.' : 'Resting on what is underneath.'}
    </Text>
    <Spacer size="0.75rem" />
    <div class="projectLayoutPanel__actions">
      <Button onclick={rotateSelectedLayoutSection}>Rotate 90°</Button>
      {#if selected.floating}
        <Button onclick={() => dropLayoutSection(selected.sectionId)}>Drop onto support</Button>
      {/if}
    </div>
  {:else}
    <Spacer size="1rem" />
    <Text size="0.875rem" color="var(--fgMuted)">Select a section to set its exact position.</Text>
  {/if}

  {#if issues.length > 0}
    <Spacer size="1.25rem" />
    <h3 class="projectLayoutPanel__title">Layout check</h3>
    <ul class="projectLayoutPanel__issues">
      {#each issues as issue, index (index)}
        <li>
          <button
            type="button"
            class="projectLayoutPanel__issue"
            class:projectLayoutPanel__issue--error={issue.severity === 'error'}
            onclick={() => selectLayoutSection(issue.sectionId)}
          >
            <span class="projectLayoutPanel__issueDot"></span>
            {issue.message}
          </button>
        </li>
      {/each}
    </ul>
    {#if issues.some((issue) => issue.severity === 'error')}
      <Text size="0.875rem" color="var(--fgMuted)">Overlapping sections must be separated before saving.</Text>
    {/if}
  {/if}
</div>

<style>
  .projectLayoutPanel {
    padding: 0.75rem;
  }

  .projectLayoutPanel__title {
    margin-bottom: 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--fgMuted);
  }

  .projectLayoutPanel__sections {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .projectLayoutPanel__section {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    padding: 0.375rem 0.5rem;
    border: none;
    border-radius: var(--radius-2);
    background: none;
    color: var(--fg);
    font: inherit;
    font-size: 0.875rem;
    text-align: left;
    cursor: pointer;
  }

  .projectLayoutPanel__section:hover {
    background: var(--contrastLowest);
  }

  .projectLayoutPanel__section--selected {
    background: var(--contrastLow);
  }

  .projectLayoutPanel__sectionInfo {
    flex: none;
    font-size: 0.75rem;
    color: var(--fgMuted);
  }

  .projectLayoutPanel__inputs {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.75rem;
  }

  .projectLayoutPanel__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .projectLayoutPanel__issues {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0 0 0.5rem;
    padding: 0;
    list-style: none;
  }

  .projectLayoutPanel__issue {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    width: 100%;
    padding: 0.25rem 0;
    border: none;
    background: none;
    color: var(--fg);
    font: inherit;
    font-size: 0.875rem;
    text-align: left;
    cursor: pointer;
  }

  .projectLayoutPanel__issue:hover {
    text-decoration: underline;
  }

  .projectLayoutPanel__issueDot {
    flex: none;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: #ffb020;
  }

  .projectLayoutPanel__issue--error .projectLayoutPanel__issueDot {
    background: #ff3b30;
  }
</style>
