<script lang="ts">
	import { Button, Icon } from '@tableslayer/ui';
	import {
		IconRotate,
		IconRefresh,
		IconX,
		IconDeviceFloppy,
		IconGridDots
	} from '@tabler/icons-svelte';
	import { layoutEditorState, getSelectedPlacement } from '$lib/stores/layoutEditor.svelte';

	interface Props {
		onEnterEdit: () => void;
		onSave: () => void;
		onCancel: () => void;
		onResetAuto: () => void;
		onRotate: () => void;
		canEdit?: boolean; // If false, hide the Edit Layout button (e.g., only one tray)
	}

	let { onEnterEdit, onSave, onCancel, onResetAuto, onRotate, canEdit = true }: Props = $props();

	// Use $derived.by() to properly track reactive reads from store
	let isEditMode = $derived.by(() => layoutEditorState.isEditMode);
	let selectedPlacement = $derived.by(() => getSelectedPlacement());
</script>

{#if !isEditMode}
	<!-- Enter edit mode button (inline) - only show if more than one tray -->
	{#if canEdit}
		<Button onclick={onEnterEdit}>
			{#snippet start()}
				<Icon Icon={IconGridDots} />
			{/snippet}
			Edit layout
		</Button>
	{/if}
{:else}
	<!-- Edit mode toolbar (inline) -->
	<div class="editToolbar">
		<div class="toolbarSection">
			<Button variant="ghost" onclick={onResetAuto} title="Reset to automatic layout">
				{#snippet start()}
					<Icon Icon={IconRefresh} />
				{/snippet}
				Automatic Layout
			</Button>
		</div>
		<div class="toolbarSection">
			<Button variant="ghost" onclick={onCancel} title="Cancel changes">
				{#snippet start()}
					<Icon Icon={IconX} />
				{/snippet}
				Cancel
			</Button>
			<Button variant="special" onclick={onSave} title="Save layout">
				{#snippet start()}
					<Icon Icon={IconDeviceFloppy} />
				{/snippet}
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
			<Button size="sm" class="rotateButton" variant="link" onclick={onRotate} title="Rotate 90°">
				{#snippet start()}
					<Icon Icon={IconRotate} />
				{/snippet}
				Rotate
			</Button>
		</div>
	{/if}
{/if}

<style>
	.editToolbar {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.375rem 0.75rem;
		border-radius: var(--radius-2);
		background: var(--contrastLowest);
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
		padding: 0.375rem 0.5rem 0.375rem 0.375rem;
		background: var(--contrastLowest);
		border-radius: var(--radius-2);
		font-size: 0.875rem;
		color: var(--fgMuted);
		text-wrap: nowrap;
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
