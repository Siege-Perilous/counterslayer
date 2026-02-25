<script lang="ts">
	import { PaneGroup, Pane, PaneResizer } from 'paneforge';
	import { Panel } from '@tableslayer/ui';
	import {
		getProject,
		getSelectedBox,
		getSelectedTray,
		selectBox,
		selectTray,
		addBox,
		deleteBox,
		addTray,
		deleteTray,
		updateBox,
		updateTray,
		updateTrayParams,
		type Box,
		type Tray
	} from '$lib/stores/project.svelte';
	import GlobalsPanel from './GlobalsPanel.svelte';
	import BoxesPanel from './BoxesPanel.svelte';
	import TraysPanel from './TraysPanel.svelte';
	import type { CounterTrayParams } from '$lib/models/counterTray';

	let project = $derived(getProject());
	let selectedBox = $derived(getSelectedBox());
	let selectedTray = $derived(getSelectedTray());

	function handleSelectBox(box: Box) {
		selectBox(box.id);
	}

	function handleSelectTray(tray: Tray) {
		selectTray(tray.id);
	}

	function handleAddBox() {
		addBox();
	}

	function handleDeleteBox(boxId: string) {
		if (confirm('Delete this box and all its trays?')) {
			deleteBox(boxId);
		}
	}

	function handleAddTray(boxId: string) {
		addTray(boxId);
	}

	function handleDeleteTray(boxId: string, trayId: string) {
		if (confirm('Delete this tray?')) {
			deleteTray(boxId, trayId);
		}
	}

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
</script>

<aside class="sidebar">
	<div style="height: 100%; width: 100%; overflow: hidden;">
		<PaneGroup direction="horizontal" style="height: 100%;">
			<!-- Globals Panel -->
			<Pane defaultSize={30} minSize={20} style="height: 100%; overflow: hidden;">
				<Panel class="sidebarPanel">
					<div class="panelHeader">
						<span class="sectionTitle" style="margin-bottom: 0;">Globals</span>
					</div>
					<div class="panelContent">
						{#if selectedTray}
							<GlobalsPanel params={selectedTray.params} onchange={handleParamsChange} />
						{:else}
							<div class="emptyState">
								<p class="emptyStateText">Select a tray to edit globals</p>
							</div>
						{/if}
					</div>
				</Panel>
			</Pane>

			<PaneResizer class="paneResizer paneResizer--horizontal">
				<div class="paneResizerHandle paneResizerHandle--horizontal"></div>
			</PaneResizer>

			<!-- Boxes Panel -->
			<Pane defaultSize={35} minSize={20} style="height: 100%; overflow: hidden;">
				<Panel class="sidebarPanel">
					<div class="panelContent">
						<BoxesPanel
							{project}
							{selectedBox}
							onSelectBox={handleSelectBox}
							onAddBox={handleAddBox}
							onDeleteBox={handleDeleteBox}
							onUpdateBox={handleBoxUpdate}
						/>
					</div>
				</Panel>
			</Pane>

			<PaneResizer class="paneResizer paneResizer--horizontal">
				<div class="paneResizerHandle paneResizerHandle--horizontal"></div>
			</PaneResizer>

			<!-- Trays Panel -->
			<Pane defaultSize={35} minSize={20}>
				<Panel class="sidebarPanel">
					<div class="panelContent">
						<TraysPanel
							{selectedBox}
							{selectedTray}
							onSelectTray={handleSelectTray}
							onAddTray={handleAddTray}
							onDeleteTray={handleDeleteTray}
							onUpdateTray={handleTrayUpdate}
							onUpdateParams={handleParamsChange}
						/>
					</div>
				</Panel>
			</Pane>
		</PaneGroup>
	</div>
</aside>

<style>
	.sidebar {
		height: 100%;
		width: 100%;
		background: var(--contrastEmpty);
		padding: 0 1rem 1rem 1rem;
	}

	:global(.sidebarPanel) {
		display: flex;
		height: 100%;
		flex-direction: column;
		overflow: hidden;
	}

	.panelHeader {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		background: var(--contrastLow);
	}

	.panelContent {
		flex: 1;
		overflow-y: auto;
	}

	.sectionTitle {
		margin-bottom: 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--fgMuted);
	}

	.emptyState {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		color: var(--fgMuted);
	}

	.emptyStateText {
		font-size: 0.875rem;
	}
</style>
