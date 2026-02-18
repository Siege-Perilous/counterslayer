<script lang="ts">
	import { browser } from '$app/environment';
	import { PaneGroup, Pane, PaneResizer } from 'paneforge';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import {
		createCounterTray,
		getCounterPositions,
		type CounterStack
	} from '$lib/models/counterTray';
	import { createBoxWithLidGrooves, createLid } from '$lib/models/lid';
	import {
		arrangeTrays,
		validateCustomDimensions,
		calculateTraySpacers,
		type TrayPlacement
	} from '$lib/models/box';
	import { jscadToBufferGeometry } from '$lib/utils/jscadToThree';
	import { exportStl } from '$lib/utils/exportStl';
	import { exportPdfReference } from '$lib/utils/pdfGenerator';
	import {
		initProject,
		getSelectedTray,
		getSelectedBox,
		getProject,
		importProject,
		resetProject
	} from '$lib/stores/project.svelte';
	import type { Project } from '$lib/types/project';
	import type { BufferGeometry } from 'three';
	import type { Geom3 } from '@jscad/modeling/src/geometries/types';

	type ViewMode = 'tray' | 'all' | 'exploded';

	interface TrayGeometryData {
		trayId: string;
		name: string;
		geometry: BufferGeometry;
		jscadGeom: Geom3;
		placement: TrayPlacement;
		counterStacks: CounterStack[];
	}

	let viewMode = $state<ViewMode>('tray');
	let selectedTrayGeometry = $state<BufferGeometry | null>(null);
	let selectedTrayCounters = $state<CounterStack[]>([]);
	let allTrayGeometries = $state<TrayGeometryData[]>([]);
	let boxGeometry = $state<BufferGeometry | null>(null);
	let lidGeometry = $state<BufferGeometry | null>(null);
	let jscadSelectedTray = $state<Geom3 | null>(null);
	let jscadBox = $state<Geom3 | null>(null);
	let jscadLid = $state<Geom3 | null>(null);
	let generating = $state(false);
	let error = $state('');
	let jsonFileInput = $state<HTMLInputElement | null>(null);
	let explosionAmount = $state(0);
	let showCounters = $state(false);
	let menuOpen = $state(false);

	// Initialize project from localStorage
	$effect(() => {
		if (browser) {
			initProject();
		}
	});

	let selectedTray = $derived(getSelectedTray());
	let selectedBox = $derived(getSelectedBox());
	let printBedSize = $derived(selectedTray?.params.printBedSize ?? 256);

	// Compute which geometries to show based on view mode
	let visibleGeometries = $derived.by(() => {
		const result: {
			tray: BufferGeometry | null;
			allTrays: TrayGeometryData[];
			box: BufferGeometry | null;
			lid: BufferGeometry | null;
			exploded: boolean;
			showAllTrays: boolean;
		} = {
			tray: null,
			allTrays: [],
			box: null,
			lid: null,
			exploded: false,
			showAllTrays: false
		};

		switch (viewMode) {
			case 'tray':
				result.tray = selectedTrayGeometry;
				break;
			case 'all':
				result.allTrays = allTrayGeometries;
				result.box = boxGeometry;
				result.lid = lidGeometry;
				result.showAllTrays = true;
				break;
			case 'exploded':
				result.allTrays = allTrayGeometries;
				result.box = boxGeometry;
				result.lid = lidGeometry;
				result.exploded = true;
				result.showAllTrays = true;
				break;
		}
		return result;
	});

	async function regenerate() {
		if (!browser) return;

		const box = getSelectedBox();
		const tray = getSelectedTray();

		if (!box || !tray) {
			error = 'No box or tray selected';
			return;
		}

		generating = true;
		error = '';

		await new Promise((resolve) => setTimeout(resolve, 10));

		try {
			// Validate custom dimensions before generation
			const validation = validateCustomDimensions(box);
			if (!validation.valid) {
				error = validation.errors.join('; ');
				generating = false;
				return;
			}

			// Generate all trays with their placements
			const placements = arrangeTrays(box.trays);

			// Calculate floor spacers for each tray (for custom box height)
			const spacerInfo = calculateTraySpacers(box);

			// Calculate max height so all trays are normalized to box interior height
			const maxHeight = Math.max(...placements.map((p) => p.dimensions.height));

			// Find spacer for selected tray
			const selectedSpacer = spacerInfo.find((s) => s.trayId === tray.id);
			const selectedSpacerHeight = selectedSpacer?.floorSpacerHeight ?? 0;

			// Generate selected tray at box height (all trays in a box share the same height)
			jscadSelectedTray = createCounterTray(
				tray.params,
				tray.name,
				maxHeight,
				selectedSpacerHeight
			);
			selectedTrayGeometry = jscadToBufferGeometry(jscadSelectedTray);
			selectedTrayCounters = getCounterPositions(tray.params, maxHeight, selectedSpacerHeight);

			// Generate all trays at box height with floor spacers
			allTrayGeometries = placements.map((placement) => {
				const spacer = spacerInfo.find((s) => s.trayId === placement.tray.id);
				const spacerHeight = spacer?.floorSpacerHeight ?? 0;
				const jscadGeom = createCounterTray(
					placement.tray.params,
					placement.tray.name,
					maxHeight,
					spacerHeight
				);
				return {
					trayId: placement.tray.id,
					name: placement.tray.name,
					geometry: jscadToBufferGeometry(jscadGeom),
					jscadGeom,
					placement,
					counterStacks: getCounterPositions(placement.tray.params, maxHeight, spacerHeight)
				};
			});

			// Generate box with lid grooves
			jscadBox = createBoxWithLidGrooves(box);
			boxGeometry = jscadBox ? jscadToBufferGeometry(jscadBox) : null;

			// Generate lid
			jscadLid = createLid(box);
			lidGeometry = jscadLid ? jscadToBufferGeometry(jscadLid) : null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
			console.error('Generation error:', e);
		} finally {
			generating = false;
		}
	}

	function handleExport() {
		if (!jscadSelectedTray) return;

		const tray = getSelectedTray();
		const filename = `${tray?.name.toLowerCase().replace(/\s+/g, '-') ?? 'tray'}.stl`;

		exportStl(jscadSelectedTray, filename);
	}

	async function handleExportAll() {
		const box = getSelectedBox();
		if (!box) return;

		const baseName = box.name.toLowerCase().replace(/\s+/g, '-');

		// Export box
		if (jscadBox) {
			exportStl(jscadBox, `${baseName}-box.stl`);
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		// Export lid
		if (jscadLid) {
			exportStl(jscadLid, `${baseName}-lid.stl`);
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		// Export all trays
		for (const trayData of allTrayGeometries) {
			const trayName = trayData.name.toLowerCase().replace(/\s+/g, '-');
			exportStl(trayData.jscadGeom, `${baseName}-${trayName}.stl`);
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}

	async function handleExportPdf() {
		const project = getProject();
		if (project.boxes.length === 0) return;
		await exportPdfReference(project);
	}

	function handleExportJson() {
		const project = getProject();
		const json = JSON.stringify(project, null, 2);
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'counter-tray-project.json';
		a.click();
		URL.revokeObjectURL(url);
	}

	async function handleImportJson(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		try {
			const text = await file.text();
			const data = JSON.parse(text) as Project;
			importProject(data);
			error = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to import JSON';
			console.error('Import JSON error:', e);
		}

		input.value = '';
	}

	// Generate on mount and when tray/box changes
	$effect(() => {
		if (browser && selectedTray && selectedBox) {
			regenerate();
		}
	});

	function handleReset() {
		if (confirm('Reset project to defaults? This will delete all boxes and trays.')) {
			resetProject();
		}
	}

	const viewModes: { mode: ViewMode; label: string }[] = [
		{ mode: 'tray', label: 'Current tray' },
		{ mode: 'all', label: 'Boxed' },
		{ mode: 'exploded', label: 'Exploded' }
	];
</script>

<svelte:head>
	<title>Counter Tray Generator</title>
</svelte:head>

<div class="flex h-screen flex-col bg-gray-900 text-white">
	<!-- Header -->
	<div class="flex items-center gap-1 border-b border-gray-700 px-3 py-2 text-sm text-gray-400">
		<h1 class="contents">Boardgame Slayer</h1> by
		<a href="https://davesnider.com" target="_blank" rel="noopener noreferrer" class="cursor-pointer text-blue-400 hover:text-blue-300">Dave Snider</a>.
		<a href="https://youtube.com" target="_blank" rel="noopener noreferrer" class="cursor-pointer text-blue-400 hover:text-blue-300">Tutorial</a>
	</div>
	<PaneGroup direction="vertical" class="min-h-0 flex-1">
		<!-- Preview Pane -->
		<Pane defaultSize={60} minSize={30} class="h-full overflow-hidden">
			<main class="relative h-full">
				{#if browser}
					{#await import('$lib/components/TrayViewer.svelte') then { default: TrayViewer }}
						<TrayViewer
							geometry={visibleGeometries.tray}
							allTrays={visibleGeometries.allTrays}
							boxGeometry={visibleGeometries.box}
							lidGeometry={visibleGeometries.lid}
							{printBedSize}
							exploded={visibleGeometries.exploded}
							showAllTrays={visibleGeometries.showAllTrays}
							boxWallThickness={selectedBox?.wallThickness ?? 3}
							boxTolerance={selectedBox?.tolerance ?? 0.5}
							boxFloorThickness={selectedBox?.floorThickness ?? 2}
							{explosionAmount}
							{showCounters}
							{selectedTrayCounters}
						/>
					{/await}
				{/if}

				{#if generating}
					<div class="absolute inset-0 flex items-center justify-center bg-black/50">
						<div class="text-lg">Generating geometry...</div>
					</div>
				{/if}

				<!-- View mode buttons -->
				<div class="absolute top-4 left-1/2 flex -translate-x-1/2 items-center gap-4">
					<div class="flex gap-1 rounded bg-gray-800 p-1">
						{#each viewModes as { mode, label } (mode)}
							<button
								onclick={() => (viewMode = mode)}
								class="cursor-pointer rounded px-3 py-1.5 text-sm font-medium transition {viewMode === mode
									? 'bg-blue-600 text-white'
									: 'text-gray-300 hover:bg-gray-700'}"
							>
								{label}
							</button>
						{/each}
					</div>
					{#if viewMode === 'exploded'}
						<div class="flex items-center gap-2 rounded bg-gray-800 px-3 py-1.5">
							<span class="text-xs text-gray-400">Explode</span>
							<input
								type="range"
								min="0"
								max="100"
								bind:value={explosionAmount}
								class="h-1 w-24 cursor-pointer appearance-none rounded-lg bg-gray-600"
							/>
						</div>
					{/if}
				</div>

				<!-- Bottom toolbar -->
				<div class="absolute right-4 bottom-4 left-4 flex items-center justify-between">
					<button
						onclick={regenerate}
						disabled={generating}
						class="cursor-pointer rounded bg-blue-600 px-3 py-2 text-sm font-medium transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{generating ? 'Generating...' : 'Regenerate'}
					</button>
					<div class="relative">
						<button
							onclick={() => (menuOpen = !menuOpen)}
							class="flex cursor-pointer items-center gap-2 rounded bg-green-600 px-3 py-2 text-sm font-medium transition hover:bg-green-700"
						>
							Import / Export
							<svg class="h-4 w-4 transition-transform {menuOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
							</svg>
						</button>
						{#if menuOpen}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="fixed inset-0 z-40"
								onclick={() => (menuOpen = false)}
								onkeydown={(e) => e.key === 'Escape' && (menuOpen = false)}
							></div>
							<div class="absolute bottom-full right-0 z-50 mb-2 w-52 rounded bg-gray-800 py-1 shadow-lg">
									<label class="flex w-full cursor-pointer items-center gap-2 whitespace-nowrap px-4 py-2 text-sm hover:bg-gray-700">
										<input
											type="checkbox"
											bind:checked={showCounters}
											class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600"
										/>
										Show counter preview
									</label>
									<div class="my-1 border-t border-gray-600"></div>
									<button
										onclick={() => {
											handleExport();
											menuOpen = false;
										}}
										disabled={generating || !jscadSelectedTray}
										class="w-full cursor-pointer px-4 py-2 text-left text-sm hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
									>
										Export tray STL
									</button>
									<button
										onclick={() => {
											handleExportAll();
											menuOpen = false;
										}}
										disabled={generating || (!jscadBox && !jscadLid && allTrayGeometries.length === 0)}
										class="w-full cursor-pointer px-4 py-2 text-left text-sm hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
									>
										Export all STLs
									</button>
									<button
										onclick={() => {
											handleExportPdf();
											menuOpen = false;
										}}
										disabled={getProject().boxes.length === 0}
										class="w-full cursor-pointer px-4 py-2 text-left text-sm hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
									>
										PDF reference
									</button>
									<div class="my-1 border-t border-gray-600"></div>
									<input
										bind:this={jsonFileInput}
										type="file"
										accept=".json"
										onchange={handleImportJson}
										class="hidden"
									/>
									<button
										onclick={() => {
											jsonFileInput?.click();
											menuOpen = false;
										}}
										class="w-full cursor-pointer px-4 py-2 text-left text-sm hover:bg-gray-700"
									>
										Import project JSON
									</button>
									<button
										onclick={() => {
											handleExportJson();
											menuOpen = false;
										}}
										class="w-full cursor-pointer px-4 py-2 text-left text-sm hover:bg-gray-700"
									>
										Export project JSON
									</button>
									<div class="my-1 border-t border-gray-600"></div>
									<button
										onclick={() => {
											handleReset();
											menuOpen = false;
										}}
										class="w-full cursor-pointer px-4 py-2 text-left text-sm text-red-400 hover:bg-gray-700"
									>
										Clear current project
									</button>
								</div>
							{/if}
					</div>
				</div>

				{#if error}
					<div
						class="absolute top-16 left-1/2 -translate-x-1/2 rounded bg-red-900 px-4 py-2 text-sm text-red-200"
					>
						{error}
					</div>
				{/if}
			</main>
		</Pane>

		<PaneResizer
			class="group relative flex h-1.5 items-center justify-center bg-gray-700 hover:bg-gray-600"
		>
			<div class="h-0.5 w-12 rounded-full bg-gray-500 group-hover:bg-gray-400"></div>
		</PaneResizer>

		<!-- Controls Pane -->
		<Pane defaultSize={40} minSize={20} class="h-full overflow-hidden">
			<div class="h-full">
				<Sidebar />
			</div>
		</Pane>
	</PaneGroup>
</div>
