<script lang="ts">
	import { Panel, Title } from '@tableslayer/ui';
	import GlobalsPanel from './GlobalsPanel.svelte';
	import BoxesPanel from './BoxesPanel.svelte';
	import TraysPanel from './TraysPanel.svelte';
	import {
		getProject,
		getSelectedBox,
		getSelectedTray,
		updateBox,
		updateTray,
		updateTrayParams,
		getCumulativeTrayLetter,
		type Box,
		type Tray
	} from '$lib/stores/project.svelte';
	import type { CounterTrayParams } from '$lib/models/counterTray';

	type SelectionType = 'dimensions' | 'box' | 'tray';

	interface Props {
		selectionType: SelectionType;
	}

	let { selectionType }: Props = $props();

	let project = $derived(getProject());
	let selectedBox = $derived(getSelectedBox());
	let selectedTray = $derived(getSelectedTray());

	function handleBoxUpdate(updates: Partial<Omit<Box, 'id' | 'trays'>>) {
		if (selectedBox) {
			updateBox(selectedBox.id, updates);
		}
	}

	function handleTrayUpdate(updates: Partial<Omit<Tray, 'id'>>) {
		if (selectedTray) {
			updateTray(selectedTray.id, updates);
		}
	}

	function handleParamsChange(newParams: CounterTrayParams) {
		if (selectedTray) {
			updateTrayParams(selectedTray.id, newParams);
		}
	}

	// Get tray stats for display
	function getTrayStats(tray: Tray): { stacks: number; counters: number; letter: string } {
		const topCount = tray.params.topLoadedStacks.reduce((sum, s) => sum + s[1], 0);
		const edgeCount = tray.params.edgeLoadedStacks.reduce((sum, s) => sum + s[1], 0);
		let letter = 'A';
		const project = getProject();
		if (selectedBox) {
			const boxIdx = project.boxes.findIndex((b) => b.id === selectedBox.id);
			const trayIdx = selectedBox.trays.findIndex((t) => t.id === tray.id);
			if (boxIdx >= 0 && trayIdx >= 0) {
				letter = getCumulativeTrayLetter(project.boxes, boxIdx, trayIdx);
			}
		}
		return {
			stacks: tray.params.topLoadedStacks.length + tray.params.edgeLoadedStacks.length,
			counters: topCount + edgeCount,
			letter
		};
	}

	let panelTitle = $derived.by(() => {
		switch (selectionType) {
			case 'dimensions':
				return 'Dimensions';
			case 'box':
				return selectedBox?.name ?? 'Box';
			case 'tray':
				return selectedTray?.name ?? 'Tray';
		}
	});
</script>

<aside class="editorPanel">
	<Panel class="editorPanelInner">
		<!-- Header -->
		<div class="panelHeader">
			<Title as="h2" size="sm">
				{panelTitle}
			</Title>
			{#if selectionType === 'box' && selectedBox}
				<span class="headerStats"
					>{selectedBox.trays.length} {selectedBox.trays.length === 1 ? 'tray' : 'trays'}</span
				>
			{:else if selectionType === 'tray' && selectedTray}
				{@const stats = getTrayStats(selectedTray)}
				<span class="headerStats">{stats.counters} counters in {stats.stacks} stacks</span>
			{/if}
		</div>
		<!-- Content -->
		<div class="panelContent">
			{#if selectionType === 'dimensions'}
				{#if selectedTray}
					<GlobalsPanel params={selectedTray.params} onchange={handleParamsChange} />
				{:else}
					<div class="emptyState">
						<p>No tray selected to edit globals</p>
					</div>
				{/if}
			{:else if selectionType === 'box'}
				{#if selectedBox}
					<BoxesPanel
						{project}
						{selectedBox}
						onSelectBox={() => {}}
						onAddBox={() => {}}
						onDeleteBox={() => {}}
						onUpdateBox={handleBoxUpdate}
						hideList={true}
					/>
				{:else}
					<div class="emptyState">
						<p>No box selected</p>
					</div>
				{/if}
			{:else if selectionType === 'tray'}
				{#if selectedTray && selectedBox}
					<TraysPanel
						{selectedBox}
						{selectedTray}
						onSelectTray={() => {}}
						onAddTray={() => {}}
						onDeleteTray={() => {}}
						onUpdateTray={handleTrayUpdate}
						onUpdateParams={handleParamsChange}
						hideList={true}
					/>
				{:else}
					<div class="emptyState">
						<p>No tray selected</p>
					</div>
				{/if}
			{/if}
		</div>
	</Panel>
</aside>

<style>
	.editorPanel {
		height: 100%;
		background: var(--contrastEmpty);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	:global(.editorPanelInner) {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
		margin: 1rem;
		margin-left: 0;
		margin-right: 0.75rem;
	}

	.panelHeader {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		border-bottom: var(--borderThin);
		flex-shrink: 0;
	}

	.panelContent {
		flex: 1;
		overflow-y: auto;
	}

	.emptyState {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem 1rem;
		color: var(--fgMuted);
		font-size: 0.875rem;
	}

	.headerStats {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--fgMuted);
	}
</style>
