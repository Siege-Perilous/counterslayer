<script lang="ts">
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
		updateTrayParams,
		type Box,
		type Tray
	} from '$lib/stores/project.svelte';
	import ParameterControls from './ParameterControls.svelte';
	import BoxControls from './BoxControls.svelte';
	import type { CounterTrayParams } from '$lib/models/counterTray';

	interface Props {
		onRegenerate: () => void;
		generating: boolean;
	}

	let { onRegenerate, generating }: Props = $props();

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

	function handleParamsChange(newParams: CounterTrayParams) {
		if (selectedTray) {
			updateTrayParams(selectedTray.id, newParams);
		}
	}
</script>

<aside class="flex w-80 flex-col border-r border-gray-700 bg-gray-800">
	<header class="border-b border-gray-700 p-4">
		<h1 class="text-lg font-bold">Counter Tray Generator</h1>
		<p class="text-xs text-gray-400">Parametric wargame counter trays</p>
	</header>

	<!-- Box/Tray Navigation -->
	<div class="border-b border-gray-700 p-2">
		<div class="mb-2 flex items-center justify-between px-2">
			<span class="text-xs font-medium uppercase text-gray-400">Boxes</span>
			<button
				onclick={handleAddBox}
				class="rounded bg-gray-700 px-2 py-1 text-xs hover:bg-gray-600"
			>
				+ New Box
			</button>
		</div>

		<div class="max-h-48 space-y-1 overflow-y-auto">
			{#each project.boxes as box (box.id)}
				<div class="rounded bg-gray-750">
					<!-- Box header -->
					<div
						class="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 {selectedBox?.id === box.id ? 'bg-blue-600' : 'hover:bg-gray-700'}"
						onclick={() => handleSelectBox(box)}
						role="button"
						tabindex="0"
						onkeydown={(e) => e.key === 'Enter' && handleSelectBox(box)}
					>
						<span class="text-sm font-medium">{box.name}</span>
						<div class="flex gap-1">
							<button
								onclick={(e) => { e.stopPropagation(); handleAddTray(box.id); }}
								class="rounded px-1.5 text-xs text-gray-400 hover:bg-gray-600 hover:text-white"
								title="Add tray"
							>
								+
							</button>
							{#if project.boxes.length > 1}
								<button
									onclick={(e) => { e.stopPropagation(); handleDeleteBox(box.id); }}
									class="rounded px-1.5 text-xs text-gray-400 hover:bg-red-600 hover:text-white"
									title="Delete box"
								>
									&times;
								</button>
							{/if}
						</div>
					</div>

					<!-- Trays list -->
					{#if selectedBox?.id === box.id}
						<div class="border-t border-gray-700 py-1 pl-4">
							{#each box.trays as tray (tray.id)}
								<div
									class="flex cursor-pointer items-center justify-between rounded px-2 py-1 text-sm {selectedTray?.id === tray.id ? 'bg-gray-600' : 'hover:bg-gray-700'}"
									onclick={() => handleSelectTray(tray)}
									role="button"
									tabindex="0"
									onkeydown={(e) => e.key === 'Enter' && handleSelectTray(tray)}
								>
									<span>{tray.name}</span>
									{#if box.trays.length > 1}
										<button
											onclick={(e) => { e.stopPropagation(); handleDeleteTray(box.id, tray.id); }}
											class="rounded px-1.5 text-xs text-gray-400 hover:bg-red-600 hover:text-white"
											title="Delete tray"
										>
											&times;
										</button>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>

	<!-- Box/Tray Settings -->
	<div class="flex-1 overflow-y-auto">
		{#if selectedBox && selectedTray}
			<div class="border-b border-gray-700">
				<BoxControls box={selectedBox} onchange={handleBoxUpdate} />
			</div>
			<ParameterControls params={selectedTray.params} onchange={handleParamsChange} />
		{:else if selectedBox}
			<BoxControls box={selectedBox} onchange={handleBoxUpdate} />
		{:else}
			<div class="p-4 text-center text-gray-400">
				<p>No box selected</p>
			</div>
		{/if}
	</div>

	<!-- Action buttons -->
	<footer class="space-y-2 border-t border-gray-700 p-4">
		<button
			onclick={onRegenerate}
			disabled={generating}
			class="w-full rounded bg-blue-600 px-4 py-2 font-medium transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
		>
			{generating ? 'Generating...' : 'Regenerate'}
		</button>
	</footer>
</aside>
