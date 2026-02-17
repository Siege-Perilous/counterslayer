<script lang="ts">
	import { PaneGroup, Pane, PaneResizer } from 'paneforge';
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

<aside class="h-full w-full bg-gray-800">
	<!-- Resizable Panels -->
	<div class="h-full w-full overflow-hidden">
		<PaneGroup direction="horizontal" class="h-full">
			<!-- Globals Panel -->
			<Pane defaultSize={30} minSize={20} class="h-full overflow-hidden">
				<div class="flex h-full flex-col border-r border-gray-700">
					<div
						class="bg-gray-750 flex items-center justify-between border-b border-gray-600 px-3 py-1.5"
					>
						<span class="text-xs font-semibold tracking-wide text-gray-300 uppercase">Globals</span>
					</div>
					<div class="flex-1 overflow-y-auto">
						{#if selectedTray}
							<GlobalsPanel params={selectedTray.params} onchange={handleParamsChange} />
						{:else}
							<div class="p-3 text-center text-xs text-gray-500">Select a tray to edit globals</div>
						{/if}
					</div>
				</div>
			</Pane>

			<PaneResizer
				class="group relative flex w-1.5 items-center justify-center bg-gray-700 hover:bg-gray-600"
			>
				<div class="h-8 w-0.5 rounded-full bg-gray-500 group-hover:bg-gray-400"></div>
			</PaneResizer>

			<!-- Boxes Panel -->
			<Pane defaultSize={35} minSize={20} class="h-full overflow-hidden">
				<div class="flex h-full flex-col border-r border-gray-700">
					<div
						class="bg-gray-750 flex items-center justify-between border-b border-gray-600 px-3 py-1.5"
					>
						<span class="text-xs font-semibold tracking-wide text-gray-300 uppercase">Boxes</span>
					</div>
					<div class="flex-1 overflow-hidden">
						<BoxesPanel
							{project}
							{selectedBox}
							onSelectBox={handleSelectBox}
							onAddBox={handleAddBox}
							onDeleteBox={handleDeleteBox}
							onUpdateBox={handleBoxUpdate}
						/>
					</div>
				</div>
			</Pane>

			<PaneResizer
				class="group relative flex w-1.5 items-center justify-center bg-gray-700 hover:bg-gray-600"
			>
				<div class="h-8 w-0.5 rounded-full bg-gray-500 group-hover:bg-gray-400"></div>
			</PaneResizer>

			<!-- Trays Panel -->
			<Pane defaultSize={35} minSize={20} class="h-full overflow-hidden">
				<div class="flex h-full flex-col">
					<div
						class="bg-gray-750 flex items-center justify-between border-b border-gray-600 px-3 py-1.5"
					>
						<span class="text-xs font-semibold tracking-wide text-gray-300 uppercase">
							Trays {#if selectedBox}within {selectedBox.name}{/if}
						</span>
					</div>
					<div class="flex-1 overflow-hidden">
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
				</div>
			</Pane>
		</PaneGroup>
	</div>
</aside>
