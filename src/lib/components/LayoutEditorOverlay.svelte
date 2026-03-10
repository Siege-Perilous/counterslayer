<script lang="ts">
  /**
   * Box Layout Editor Overlay
   * Wraps the shared LayoutEditorToolbar with box-specific state
   */
  import LayoutEditorToolbar from './LayoutEditorToolbar.svelte';
  import { layoutEditorState, getSelectedPlacement, getEffectiveDimensions } from '$lib/stores/layoutEditor.svelte';

  interface Props {
    onEnterEdit: () => void;
    onSave: () => void;
    onCancel: () => void;
    onResetAuto: () => void;
    onRotate: () => void;
    canEdit?: boolean;
  }

  let { onEnterEdit, onSave, onCancel, onResetAuto, onRotate, canEdit = true }: Props = $props();

  let isEditMode = $derived.by(() => layoutEditorState.isEditMode);
  let selectedPlacement = $derived.by(() => getSelectedPlacement());
  let selectedDims = $derived.by(() => (selectedPlacement ? getEffectiveDimensions(selectedPlacement) : null));
</script>

<LayoutEditorToolbar
  {isEditMode}
  selectedItem={selectedPlacement}
  {selectedDims}
  {canEdit}
  {onEnterEdit}
  {onSave}
  {onCancel}
  {onResetAuto}
  {onRotate}
/>
