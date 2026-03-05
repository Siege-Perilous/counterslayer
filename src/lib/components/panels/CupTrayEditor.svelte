<script lang="ts">
	import { Input, FormControl, Spacer } from '@tableslayer/ui';
	import type { CupTray } from '$lib/types/project';
	import {
		type CupTrayParams,
		getCupTrayDimensions,
		validateCupTrayParams
	} from '$lib/models/cupTray';

	interface Props {
		tray: CupTray;
		onUpdateParams: (params: CupTrayParams) => void;
	}

	let { tray, onUpdateParams }: Props = $props();

	// Compute dimensions
	let dimensions = $derived.by(() => {
		return getCupTrayDimensions(tray.params);
	});

	// Compute validation warnings
	let warnings = $derived.by(() => {
		return validateCupTrayParams(tray.params);
	});

	function updateParam<K extends keyof CupTrayParams>(key: K, value: CupTrayParams[K]) {
		onUpdateParams({ ...tray.params, [key]: value });
	}
</script>

<div class="panelFormSection">
	{#if warnings.length > 0}
		{#each warnings as warning, i (i)}
			<p class="warningText">{warning}</p>
		{/each}
		<Spacer size="0.5rem" />
	{/if}

	<section class="section">
		<h3 class="sectionTitle">Grid Layout</h3>
		<Spacer size="0.5rem" />
		<div class="formGrid">
			<FormControl label="Columns" name="columns">
				{#snippet input({ inputProps })}
					<Input
						{...inputProps}
						type="number"
						step="1"
						min="1"
						value={tray.params.columns}
						onchange={(e) => updateParam('columns', parseInt(e.currentTarget.value))}
					/>
				{/snippet}
			</FormControl>
			<FormControl label="Rows" name="rows">
				{#snippet input({ inputProps })}
					<Input
						{...inputProps}
						type="number"
						step="1"
						min="1"
						value={tray.params.rows}
						onchange={(e) => updateParam('rows', parseInt(e.currentTarget.value))}
					/>
				{/snippet}
			</FormControl>
		</div>
	</section>

	<Spacer size="0.5rem" />

	<section class="section">
		<h3 class="sectionTitle">Cup Size</h3>
		<Spacer size="0.5rem" />
		<div class="formGrid">
			<FormControl label="Cup width" name="cupWidth">
				{#snippet input({ inputProps })}
					<Input
						{...inputProps}
						type="number"
						step="1"
						min="10"
						value={tray.params.cupWidth}
						onchange={(e) => updateParam('cupWidth', parseFloat(e.currentTarget.value))}
					/>
				{/snippet}
				{#snippet end()}mm{/snippet}
			</FormControl>
			<FormControl label="Cup depth" name="cupDepth">
				{#snippet input({ inputProps })}
					<Input
						{...inputProps}
						type="number"
						step="1"
						min="10"
						value={tray.params.cupDepth}
						onchange={(e) => updateParam('cupDepth', parseFloat(e.currentTarget.value))}
					/>
				{/snippet}
				{#snippet end()}mm{/snippet}
			</FormControl>
			<FormControl label="Cup height" name="cupHeight">
				{#snippet input({ inputProps })}
					<Input
						{...inputProps}
						type="number"
						step="1"
						min="10"
						value={tray.params.cupHeight}
						onchange={(e) => updateParam('cupHeight', parseFloat(e.currentTarget.value))}
					/>
				{/snippet}
				{#snippet end()}mm{/snippet}
			</FormControl>
			<FormControl label="Corner radius" name="cornerRadius">
				{#snippet input({ inputProps })}
					<Input
						{...inputProps}
						type="number"
						step="1"
						min="0"
						max="20"
						value={tray.params.cornerRadius}
						onchange={(e) => updateParam('cornerRadius', parseFloat(e.currentTarget.value))}
					/>
				{/snippet}
				{#snippet end()}mm{/snippet}
			</FormControl>
		</div>
	</section>

	<Spacer size="0.5rem" />

	<section class="section">
		<div class="sectionHeader">
			<h3 class="sectionTitle">Tray Settings</h3>
			{#if dimensions}
				<span class="dimensionsInfo">
					{dimensions.width.toFixed(1)} × {dimensions.depth.toFixed(1)} × {dimensions.height.toFixed(
						1
					)} mm
				</span>
			{/if}
		</div>
		<Spacer size="0.5rem" />
		<div class="formGrid">
			<FormControl label="Wall" name="wallThickness">
				{#snippet input({ inputProps })}
					<Input
						{...inputProps}
						type="number"
						step="0.1"
						value={tray.params.wallThickness}
						onchange={(e) => updateParam('wallThickness', parseFloat(e.currentTarget.value))}
					/>
				{/snippet}
				{#snippet end()}mm{/snippet}
			</FormControl>
			<FormControl label="Floor" name="floorThickness">
				{#snippet input({ inputProps })}
					<Input
						{...inputProps}
						type="number"
						step="0.1"
						value={tray.params.floorThickness}
						onchange={(e) => updateParam('floorThickness', parseFloat(e.currentTarget.value))}
					/>
				{/snippet}
				{#snippet end()}mm{/snippet}
			</FormControl>
		</div>
	</section>
</div>

<style>
	.panelFormSection {
		padding: 0 0.75rem;
	}

	.section {
		margin-bottom: 1rem;
	}

	.sectionHeader {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.sectionTitle {
		margin-bottom: 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--fgMuted);
	}

	.sectionHeader .sectionTitle {
		margin-bottom: 0;
	}

	.formGrid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.dimensionsInfo {
		font-size: 0.75rem;
		color: var(--fgMuted);
		margin: 0;
	}

	.warningText {
		font-size: 0.75rem;
		color: var(--fgDanger);
		margin: 0;
	}

	.warningText + .warningText {
		margin-top: 0.25rem;
	}
</style>
