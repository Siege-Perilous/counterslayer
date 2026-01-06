<script lang="ts">
	import { browser } from '$app/environment';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import { createCounterTray } from '$lib/models/counterTray';
	import { createBoxWithLidGrooves, createLid } from '$lib/models/lid';
	import { arrangeTrays, type TrayPlacement } from '$lib/models/box';
	import { jscadToBufferGeometry } from '$lib/utils/jscadToThree';
	import { exportStl } from '$lib/utils/exportStl';
	import { importStlFromFile } from '$lib/utils/importStl';
	import { initProject, getSelectedTray, getSelectedBox } from '$lib/stores/project.svelte';
	import type { BufferGeometry } from 'three';
	import type { Geom3 } from '@jscad/modeling/src/geometries/types';

	type ViewMode = 'tray' | 'box' | 'lid' | 'all' | 'exploded';

	interface TrayGeometryData {
		trayId: string;
		name: string;
		geometry: BufferGeometry;
		jscadGeom: Geom3;
		placement: TrayPlacement;
	}

	let viewMode = $state<ViewMode>('tray');
	let selectedTrayGeometry = $state<BufferGeometry | null>(null);
	let allTrayGeometries = $state<TrayGeometryData[]>([]);
	let boxGeometry = $state<BufferGeometry | null>(null);
	let lidGeometry = $state<BufferGeometry | null>(null);
	let jscadSelectedTray = $state<Geom3 | null>(null);
	let jscadBox = $state<Geom3 | null>(null);
	let jscadLid = $state<Geom3 | null>(null);
	let importedGeometry = $state<BufferGeometry | null>(null);
	let importedFileName = $state<string | null>(null);
	let generating = $state(false);
	let error = $state('');
	let fileInput: HTMLInputElement;

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
			case 'box':
				result.box = boxGeometry;
				break;
			case 'lid':
				result.lid = lidGeometry;
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
			// Generate all trays with their placements
			const placements = arrangeTrays(box.trays);

			// Calculate max height so all trays are normalized to box interior height
			const maxHeight = Math.max(...placements.map((p) => p.dimensions.height));

			// Generate selected tray at box height (all trays in a box share the same height)
			jscadSelectedTray = createCounterTray(tray.params, tray.name, maxHeight);
			selectedTrayGeometry = jscadToBufferGeometry(jscadSelectedTray);

			// Generate all trays at box height
			allTrayGeometries = placements.map((placement) => {
				const jscadGeom = createCounterTray(placement.tray.params, placement.tray.name, maxHeight);
				return {
					trayId: placement.tray.id,
					name: placement.tray.name,
					geometry: jscadToBufferGeometry(jscadGeom),
					jscadGeom,
					placement
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
		const geom = viewMode === 'box' ? jscadBox : viewMode === 'lid' ? jscadLid : jscadSelectedTray;
		if (!geom) return;

		const box = getSelectedBox();
		const tray = getSelectedTray();
		const baseName = box?.name.toLowerCase().replace(/\s+/g, '-') ?? 'export';

		let filename: string;
		switch (viewMode) {
			case 'box':
				filename = `${baseName}-box.stl`;
				break;
			case 'lid':
				filename = `${baseName}-lid.stl`;
				break;
			default:
				filename = `${tray?.name.toLowerCase().replace(/\s+/g, '-') ?? 'tray'}.stl`;
		}

		exportStl(geom, filename);
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

	async function handleImport(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		try {
			importedGeometry = await importStlFromFile(file);
			importedFileName = file.name;
			error = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to import STL';
			console.error('Import error:', e);
		}

		input.value = '';
	}

	function clearImport() {
		importedGeometry = null;
		importedFileName = null;
	}

	// Generate on mount and when tray/box changes
	$effect(() => {
		if (browser && selectedTray && selectedBox) {
			regenerate();
		}
	});

	const viewModes: { mode: ViewMode; label: string }[] = [
		{ mode: 'tray', label: 'Tray' },
		{ mode: 'box', label: 'Box' },
		{ mode: 'lid', label: 'Lid' },
		{ mode: 'all', label: 'All' },
		{ mode: 'exploded', label: 'Exploded' }
	];
</script>

<svelte:head>
	<title>Counter Tray Generator</title>
</svelte:head>

<div class="flex h-screen bg-gray-900 text-white">
	<Sidebar onRegenerate={regenerate} {generating} />

	<!-- Viewer -->
	<main class="relative flex-1">
		{#if browser}
			{#await import('$lib/components/TrayViewer.svelte') then { default: TrayViewer }}
				<TrayViewer
					geometry={visibleGeometries.tray}
					allTrays={visibleGeometries.allTrays}
					boxGeometry={visibleGeometries.box}
					lidGeometry={visibleGeometries.lid}
					{importedGeometry}
					{printBedSize}
					exploded={visibleGeometries.exploded}
					showAllTrays={visibleGeometries.showAllTrays}
					boxWallThickness={selectedBox?.wallThickness ?? 3}
					boxTolerance={selectedBox?.tolerance ?? 0.5}
					boxFloorThickness={selectedBox?.floorThickness ?? 2}
				/>
			{/await}
		{/if}

		{#if generating}
			<div class="absolute inset-0 flex items-center justify-center bg-black/50">
				<div class="text-lg">Generating geometry...</div>
			</div>
		{/if}

		<!-- View mode buttons -->
		<div class="absolute top-4 left-1/2 -translate-x-1/2 flex gap-1 rounded bg-gray-800 p-1">
			{#each viewModes as { mode, label }}
				<button
					onclick={() => (viewMode = mode)}
					class="rounded px-3 py-1.5 text-sm font-medium transition {viewMode === mode
						? 'bg-blue-600 text-white'
						: 'text-gray-300 hover:bg-gray-700'}"
				>
					{label}
				</button>
			{/each}
		</div>

		<!-- Bottom toolbar -->
		<div class="absolute bottom-4 left-4 right-4 flex items-center justify-between">
			<div class="flex gap-2">
				<input
					bind:this={fileInput}
					type="file"
					accept=".stl"
					onchange={handleImport}
					class="hidden"
				/>
				{#if importedFileName}
					<div class="flex items-center gap-2 rounded bg-gray-800 px-3 py-2 text-sm">
						<span class="text-orange-400">{importedFileName}</span>
						<button onclick={clearImport} class="text-gray-400 hover:text-white">&times;</button>
					</div>
				{:else}
					<button
						onclick={() => fileInput.click()}
						class="rounded bg-gray-700 px-3 py-2 text-sm hover:bg-gray-600"
					>
						Import Reference STL
					</button>
				{/if}
			</div>

			<div class="flex gap-2">
				<button
					onclick={handleExport}
					disabled={generating || (viewMode === 'box' ? !jscadBox : viewMode === 'lid' ? !jscadLid : !jscadSelectedTray)}
					class="rounded bg-green-600 px-4 py-2 font-medium transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Export {viewMode === 'box' ? 'Box' : viewMode === 'lid' ? 'Lid' : 'Tray'} STL
				</button>
				<button
					onclick={handleExportAll}
					disabled={generating || (!jscadBox && !jscadLid && allTrayGeometries.length === 0)}
					class="rounded bg-purple-600 px-4 py-2 font-medium transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Export All
				</button>
			</div>
		</div>

		{#if error}
			<div class="absolute top-16 left-1/2 -translate-x-1/2 rounded bg-red-900 px-4 py-2 text-sm text-red-200">
				{error}
			</div>
		{/if}
	</main>
</div>
