<script lang="ts">
  /**
   * Layer Layout Editor Overlay
   * Wraps the shared LayoutEditorToolbar with layer-specific state
   */
  import LayoutEditorToolbar from './LayoutEditorToolbar.svelte';
  import {
    layerLayoutEditorState,
    getSelectedPlacement,
    getEffectiveBoxDimensions,
    getEffectiveLooseTrayDimensions
  } from '$lib/stores/layerLayoutEditor.svelte';

  interface Props {
    onEnterEdit: () => void;
    onSave: () => void;
    onCancel: () => void;
    onResetAuto: () => void;
    onRotate: () => void;
    canEdit?: boolean;
  }

  let { onEnterEdit, onSave, onCancel, onResetAuto, onRotate, canEdit = true }: Props = $props();

  let isEditMode = $derived.by(() => layerLayoutEditorState.isEditMode);
  let selectedPlacement = $derived.by(() => getSelectedPlacement());
  let selectedItemType = $derived.by(() => layerLayoutEditorState.selectedItemType);

  let selectedDims = $derived.by(() => {
    if (!selectedPlacement) return null;
    if (selectedItemType === 'box') {
      return getEffectiveBoxDimensions(selectedPlacement as Parameters<typeof getEffectiveBoxDimensions>[0]);
    }
    return getEffectiveLooseTrayDimensions(selectedPlacement as Parameters<typeof getEffectiveLooseTrayDimensions>[0]);
  });

  let itemTypeLabel = $derived(
    selectedItemType === 'box' ? 'Box' : selectedItemType === 'looseTray' ? 'Tray' : undefined
  );
</script>

<LayoutEditorToolbar
  {isEditMode}
  selectedItem={selectedPlacement}
  {selectedDims}
  {itemTypeLabel}
  {canEdit}
  {onEnterEdit}
  {onSave}
  {onCancel}
  {onResetAuto}
  {onRotate}
/>
