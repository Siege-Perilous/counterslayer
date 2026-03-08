<script lang="ts">
	import { IconButton, Icon, Spacer } from '@tableslayer/ui';
	import { IconLayoutAlignCenter, IconLayoutAlignMiddle, IconX } from '@tabler/icons-svelte';
	import type { CupLayout, CupId } from '$lib/types/cupLayout';
	import {
		splitCup,
		deleteCup,
		updateSplitRatioByPath,
		countCups,
		getAllCupIds
	} from '$lib/types/cupLayout';
	import CupLayoutPreview from './CupLayoutPreview.svelte';

	interface Props {
		layout: CupLayout;
		trayWidth: number;
		trayDepth: number;
		onUpdateLayout: (layout: CupLayout) => void;
	}

	let { layout, trayWidth, trayDepth, onUpdateLayout }: Props = $props();

	// Selected cup state
	let selectedCupId = $state<CupId | null>(null);

	// Ensure selection is valid when layout changes
	$effect(() => {
		const cupIds = getAllCupIds(layout);
		if (selectedCupId && !cupIds.includes(selectedCupId)) {
			// Selected cup no longer exists, select first cup or null
			selectedCupId = cupIds[0] ?? null;
		} else if (!selectedCupId && cupIds.length > 0) {
			// No selection but cups exist, select first
			selectedCupId = cupIds[0];
		}
	});

	// Derived state for UI
	let canDelete = $derived(countCups(layout) > 1 && selectedCupId !== null);

	function handleSelectCup(id: CupId) {
		selectedCupId = id;
	}

	function handleSplitVertical() {
		if (!selectedCupId) return;
		const newLayout = splitCup(layout, selectedCupId, 'vertical');
		onUpdateLayout(newLayout);
		// Selection will be cleared since the cup no longer exists
		selectedCupId = null;
	}

	function handleSplitHorizontal() {
		if (!selectedCupId) return;
		const newLayout = splitCup(layout, selectedCupId, 'horizontal');
		onUpdateLayout(newLayout);
		// Selection will be cleared since the cup no longer exists
		selectedCupId = null;
	}

	function handleDeleteCup() {
		if (!selectedCupId || !canDelete) return;
		const newLayout = deleteCup(layout, selectedCupId);
		if (newLayout) {
			onUpdateLayout(newLayout);
			selectedCupId = null;
		}
	}

	function handleUpdateRatio(splitPath: string, newRatio: number) {
		const newLayout = updateSplitRatioByPath(layout, splitPath, newRatio);
		onUpdateLayout(newLayout);
	}
</script>

<div class="cupLayoutEditor">
	<div class="cupLayoutEditor__toolbar">
		<span class="cupLayoutEditor__hint">Select cup, drag border to resize</span>
		<div class="cupLayoutEditor__toolbarButtons">
			<IconButton
				variant="ghost"
				onclick={handleSplitVertical}
				disabled={!selectedCupId}
				title="Split selected cup left/right"
			>
				<Icon Icon={IconLayoutAlignCenter} size="1.25rem" />
			</IconButton>
			<IconButton
				variant="ghost"
				onclick={handleSplitHorizontal}
				disabled={!selectedCupId}
				title="Split selected cup top/bottom"
			>
				<Icon Icon={IconLayoutAlignMiddle} size="1.25rem" />
			</IconButton>
			<IconButton
				variant="ghost"
				onclick={handleDeleteCup}
				disabled={!canDelete}
				title="Delete selected cup"
			>
				<Icon Icon={IconX} size="1.25rem" />
			</IconButton>
		</div>
	</div>

	<Spacer size="0.5rem" />

	<CupLayoutPreview
		{layout}
		{selectedCupId}
		{trayWidth}
		{trayDepth}
		onSelectCup={handleSelectCup}
		onUpdateRatio={handleUpdateRatio}
	/>
</div>

<style>
	.cupLayoutEditor {
		display: flex;
		flex-direction: column;
	}

	.cupLayoutEditor__toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.cupLayoutEditor__toolbarButtons {
		display: flex;
		gap: 0.25rem;
	}

	.cupLayoutEditor__hint {
		font-size: 0.7rem;
		color: var(--fgMuted);
		margin: 0;
	}
</style>
