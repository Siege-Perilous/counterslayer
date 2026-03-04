<script lang="ts">
	import { Button, Icon } from '@tableslayer/ui';
	import {
		IconRotate,
		IconRefresh,
		IconX,
		IconDeviceFloppy,
		IconGridDots
	} from '@tabler/icons-svelte';
	import {
		layoutEditorState,
		rotateTray,
		getSelectedPlacement
	} from '$lib/stores/layoutEditor.svelte';

	interface Props {
		onEnterEdit: () => void;
		onSave: () => void;
		onCancel: () => void;
		onResetAuto: () => void;
		onRotate: () => void;
	}

	let { onEnterEdit, onSave, onCancel, onResetAuto, onRotate }: Props = $props();

	// Use $derived.by() to properly track reactive reads from store
	let isEditMode = $derived.by(() => layoutEditorState.isEditMode);
	let selectedTrayId = $derived.by(() => layoutEditorState.selectedTrayId);
	let selectedPlacement = $derived.by(() => getSelectedPlacement());

	// Debug: log when selectedTrayId changes
	$effect(() => {
		console.log('[LayoutEditorOverlay] selectedTrayId:', selectedTrayId, 'isEditMode:', isEditMode);
	});
</script>

{#if !isEditMode}
	<!-- Enter edit mode button (inline) -->
	<Button variant="special" onclick={onEnterEdit}>
		<Icon Icon={IconGridDots} />
		Edit Layout
	</Button>
{:else}
	<!-- Edit mode toolbar (inline) -->
	<div class="editToolbar">
		<div class="toolbarSection">
			<Button
				variant="ghost"
				onclick={onRotate}
				title="Rotate 90°"
			>
				<Icon Icon={IconRotate} />
				Rotate 90°
			</Button>
			<Button variant="ghost" onclick={onResetAuto} title="Reset to automatic layout">
				<Icon Icon={IconRefresh} />
				Reset Auto
			</Button>
		</div>
		<div class="toolbarSection">
			<Button variant="ghost" onclick={onCancel} title="Cancel changes">
				<Icon Icon={IconX} />
				Cancel
			</Button>
			<Button variant="primary" onclick={onSave} title="Save layout">
				<Icon Icon={IconDeviceFloppy} />
				Save
			</Button>
		</div>
	</div>

	{#if selectedPlacement}
		<div class="selectionInfo">
			<span class="selectionName">{selectedPlacement.name}</span>
			<span class="selectionDims">
				{selectedPlacement.rotation === 90 || selectedPlacement.rotation === 270
					? `${selectedPlacement.originalDepth.toFixed(0)} × ${selectedPlacement.originalWidth.toFixed(0)}`
					: `${selectedPlacement.originalWidth.toFixed(0)} × ${selectedPlacement.originalDepth.toFixed(0)}`}mm
			</span>
			<span class="selectionRotation">{selectedPlacement.rotation}°</span>
		</div>
	{/if}
{/if}

<style>
	.editToolbar {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.toolbarSection {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.toolbarSection:not(:last-child) {
		padding-right: 1rem;
		border-right: var(--borderThin);
	}

	.selectionInfo {
		position: absolute;
		top: 3.5rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.75rem;
		background: var(--contrastLowest);
		border-radius: var(--radius-2);
		font-size: 0.75rem;
		color: var(--fgMuted);
		pointer-events: none;
	}

	.selectionName {
		font-weight: 500;
		color: var(--fg);
	}

	.selectionDims {
		color: var(--fgMuted);
	}

	.selectionRotation {
		padding: 0.125rem 0.375rem;
		background: var(--contrastLow);
		border-radius: var(--radius-1);
		font-size: 0.625rem;
	}
</style>
