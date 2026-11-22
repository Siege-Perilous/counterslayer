<script lang="ts">
  /**
   * Project Layout Editor Overlay
   * Wraps the shared LayoutEditorToolbar with project-layout state (whole sections in the game
   * container) and shows how many layout problems there are.
   */
  import LayoutEditorToolbar from './LayoutEditorToolbar.svelte';
  import { projectLayoutEditorState } from '#lib/stores/projectLayoutEditor.svelte.js';
  import type { LayoutIssue } from '#lib/models/projectLayout.js';

  interface Props {
    onEnterEdit: () => void;
    onSave: () => void;
    onCancel: () => void;
    onResetAuto: () => void;
    onRotate: () => void;
    canEdit?: boolean;
    // Problems in the layout currently shown (saved layout, or the working one while editing)
    issues?: LayoutIssue[];
  }

  let { onEnterEdit, onSave, onCancel, onResetAuto, onRotate, canEdit = true, issues = [] }: Props = $props();

  let isEditMode = $derived(projectLayoutEditorState.isEditMode);
  let selectedSection = $derived(
    projectLayoutEditorState.layout?.sections.find((s) => s.sectionId === projectLayoutEditorState.selectedSectionId) ??
      null
  );
  let selectedItem = $derived(
    selectedSection ? { name: selectedSection.name, rotation: selectedSection.rotation } : null
  );
  let selectedDims = $derived(
    selectedSection ? { width: selectedSection.world.width, depth: selectedSection.world.depth } : null
  );

  let errorCount = $derived(issues.filter((issue) => issue.severity === 'error').length);
  let warningCount = $derived(issues.length - errorCount);
</script>

<LayoutEditorToolbar
  {isEditMode}
  {selectedItem}
  {selectedDims}
  itemTypeLabel="Section"
  {canEdit}
  {onEnterEdit}
  {onSave}
  {onCancel}
  {onResetAuto}
  {onRotate}
/>

{#if issues.length > 0}
  <span
    class="projectLayoutEditorOverlay__badge"
    class:projectLayoutEditorOverlay__badge--error={errorCount > 0}
    title={issues.map((issue) => issue.message).join('\n')}
  >
    {#if errorCount > 0}
      {errorCount} {errorCount === 1 ? 'overlap' : 'overlaps'}{warningCount > 0 ? `, ${warningCount} more` : ''}
    {:else}
      {warningCount} {warningCount === 1 ? 'warning' : 'warnings'}
    {/if}
  </span>
{/if}

<style>
  .projectLayoutEditorOverlay__badge {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius-2);
    background: #ffb020;
    color: #1a1a1a;
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .projectLayoutEditorOverlay__badge--error {
    background: #ff3b30;
    color: #ffffff;
  }
</style>
