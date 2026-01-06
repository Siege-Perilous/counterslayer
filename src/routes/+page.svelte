<script lang="ts">
	import { browser } from '$app/environment';
	import ParameterControls from '$lib/components/ParameterControls.svelte';
	import { createCounterTray, defaultParams, type CounterTrayParams } from '$lib/models/counterTray';
	import { jscadToBufferGeometry } from '$lib/utils/jscadToThree';
	import { exportStl } from '$lib/utils/exportStl';
	import type { BufferGeometry } from 'three';
	import type { Geom3 } from '@jscad/modeling/src/geometries/types';

	let params = $state<CounterTrayParams>({ ...defaultParams });
	let geometry = $state<BufferGeometry | null>(null);
	let jscadGeometry = $state<Geom3 | null>(null);
	let generating = $state(false);
	let error = $state('');

	async function regenerate() {
		if (!browser) return;

		generating = true;
		error = '';

		// Use setTimeout to allow UI to update before heavy computation
		await new Promise((resolve) => setTimeout(resolve, 10));

		try {
			jscadGeometry = createCounterTray(params);
			geometry = jscadToBufferGeometry(jscadGeometry);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
			console.error('Generation error:', e);
		} finally {
			generating = false;
		}
	}

	function handleExport() {
		if (jscadGeometry) {
			exportStl(jscadGeometry, 'counter-tray.stl');
		}
	}

	// Generate on mount
	$effect(() => {
		if (browser && !geometry) {
			regenerate();
		}
	});

	function handleParamsChange(newParams: CounterTrayParams) {
		params = newParams;
	}
</script>

<svelte:head>
	<title>Counter Tray Generator</title>
</svelte:head>

<div class="flex h-screen bg-gray-900 text-white">
	<!-- Sidebar -->
	<aside class="flex w-80 flex-col border-r border-gray-700 bg-gray-800">
		<header class="border-b border-gray-700 p-4">
			<h1 class="text-lg font-bold">Counter Tray Generator</h1>
			<p class="text-xs text-gray-400">Parametric wargame counter trays</p>
		</header>

		<div class="flex-1 overflow-y-auto">
			<ParameterControls {params} onchange={handleParamsChange} />
		</div>

		<footer class="space-y-2 border-t border-gray-700 p-4">
			<button
				onclick={regenerate}
				disabled={generating}
				class="w-full rounded bg-blue-600 px-4 py-2 font-medium transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{generating ? 'Generating...' : 'Regenerate'}
			</button>
			<button
				onclick={handleExport}
				disabled={generating || !jscadGeometry}
				class="w-full rounded bg-green-600 px-4 py-2 font-medium transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
			>
				Export STL
			</button>
			{#if error}
				<p class="mt-2 text-xs text-red-400">{error}</p>
			{/if}
		</footer>
	</aside>

	<!-- Viewer -->
	<main class="relative flex-1">
		{#if browser}
			{#await import('$lib/components/TrayViewer.svelte') then { default: TrayViewer }}
				<TrayViewer {geometry} printBedSize={params.printBedSize} />
			{/await}
		{/if}

		{#if generating}
			<div class="absolute inset-0 flex items-center justify-center bg-black/50">
				<div class="text-lg">Generating geometry...</div>
			</div>
		{/if}
	</main>
</div>
