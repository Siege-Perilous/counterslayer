<script lang="ts">
	import { Input, FormControl, Spacer, Select } from '@tableslayer/ui';
	import type { CardDrawTray } from '$lib/types/project';
	import { type CardDrawTrayParams, getCardDrawTrayDimensions } from '$lib/models/cardTray';
	import { getCardSizes } from '$lib/stores/project.svelte';

	interface Props {
		tray: CardDrawTray;
		onUpdateParams: (params: CardDrawTrayParams) => void;
		actualHeight?: number;
	}

	let { tray, onUpdateParams, actualHeight }: Props = $props();

	let cardSizes = $derived(getCardSizes());
	let selectedCardSize = $derived(cardSizes.find((s) => s.id === tray.params.cardSizeId));

	// Compute dimensions, using actualHeight if provided (when tray expands to match box height)
	let dimensions = $derived.by(() => {
		const baseDims = getCardDrawTrayDimensions(tray.params, getCardSizes());
		return {
			...baseDims,
			height: actualHeight && actualHeight > baseDims.height ? actualHeight : baseDims.height
		};
	});

	function updateParam<K extends keyof CardDrawTrayParams>(key: K, value: CardDrawTrayParams[K]) {
		onUpdateParams({ ...tray.params, [key]: value });
	}
</script>

<div class="panelFormSection">
	<section class="section">
		<h3 class="sectionTitle">Card Size</h3>
		<Spacer size="0.5rem" />
		<FormControl label="Card size" name="cardSizeId">
			{#snippet input({ inputProps })}
				<Select
					{...inputProps}
					selected={[tray.params.cardSizeId]}
					options={cardSizes.map((s) => ({
						value: s.id,
						label: `${s.name} (${s.width}×${s.length}mm)`
					}))}
					onSelectedChange={(selected) => {
						if (selected[0]) {
							updateParam('cardSizeId', selected[0]);
						}
					}}
				/>
			{/snippet}
		</FormControl>
		{#if selectedCardSize}
			<Spacer size="0.25rem" />
			<p class="cardSizeInfo">
				{selectedCardSize.width}mm × {selectedCardSize.length}mm, {selectedCardSize.thickness}mm
				thick (sleeved)
			</p>
		{/if}
	</section>

	<Spacer size="0.5rem" />

	<section class="section">
		<h3 class="sectionTitle">Card Stack</h3>
		<Spacer size="0.5rem" />
		<FormControl label="Card count" name="cardCount">
			{#snippet input({ inputProps })}
				<Input
					{...inputProps}
					type="number"
					step="1"
					min="1"
					value={tray.params.cardCount}
					onchange={(e) => updateParam('cardCount', parseInt(e.currentTarget.value))}
				/>
			{/snippet}
		</FormControl>
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
			<FormControl label="Clearance" name="clearance">
				{#snippet input({ inputProps })}
					<Input
						{...inputProps}
						type="number"
						step="0.1"
						value={tray.params.clearance}
						onchange={(e) => updateParam('clearance', parseFloat(e.currentTarget.value))}
					/>
				{/snippet}
				{#snippet end()}mm{/snippet}
			</FormControl>
			<FormControl label="Slope angle" name="floorSlopeAngle">
				{#snippet input({ inputProps })}
					<Input
						{...inputProps}
						type="number"
						step="1"
						min="0"
						max="30"
						value={tray.params.floorSlopeAngle}
						onchange={(e) => updateParam('floorSlopeAngle', parseInt(e.currentTarget.value))}
					/>
				{/snippet}
				{#snippet end()}°{/snippet}
			</FormControl>
		</div>
	</section>

	<Spacer size="0.5rem" />

	<section class="section">
		<h3 class="sectionTitle">Magnet Holes</h3>
		<Spacer size="0.5rem" />
		<div class="formGrid">
			<FormControl label="Diameter" name="magnetHoleDiameter">
				{#snippet input({ inputProps })}
					<Input
						{...inputProps}
						type="number"
						step="0.5"
						value={tray.params.magnetHoleDiameter}
						onchange={(e) => updateParam('magnetHoleDiameter', parseFloat(e.currentTarget.value))}
					/>
				{/snippet}
				{#snippet end()}mm{/snippet}
			</FormControl>
			<FormControl label="Depth" name="magnetHoleDepth">
				{#snippet input({ inputProps })}
					<Input
						{...inputProps}
						type="number"
						step="0.1"
						value={tray.params.magnetHoleDepth}
						onchange={(e) => updateParam('magnetHoleDepth', parseFloat(e.currentTarget.value))}
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

	.cardSizeInfo {
		font-size: 0.75rem;
		color: var(--fgMuted);
		margin: 0;
	}

	.dimensionsInfo {
		font-size: 0.75rem;
		color: var(--fgMuted);
		margin: 0;
	}
</style>
