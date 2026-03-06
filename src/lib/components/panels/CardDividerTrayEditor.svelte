<script lang="ts">
	import { Input, FormControl, Spacer, Select, Link, IconButton, Icon } from '@tableslayer/ui';
	import { IconX, IconMenu } from '@tabler/icons-svelte';
	import type { CardDividerTray } from '$lib/types/project';
	import {
		type CardDividerTrayParams,
		getCardDividerTrayDimensions
	} from '$lib/models/cardDividerTray';
	import { getCardSizes } from '$lib/stores/project.svelte';
	import { DEFAULT_CARD_SIZE_IDS } from '$lib/models/counterTray';

	interface Props {
		tray: CardDividerTray;
		trayLetter: string;
		onUpdateParams: (params: CardDividerTrayParams) => void;
		actualHeight?: number;
	}

	let { tray, trayLetter, onUpdateParams, actualHeight }: Props = $props();

	// Drag and drop state
	let draggedIndex: number | null = $state(null);
	let dragOverIndex: number | null = $state(null);

	// Compute dimensions, using actualHeight if provided (when tray expands to match box height)
	let dimensions = $derived.by(() => {
		const baseDims = getCardDividerTrayDimensions(tray.params, getCardSizes());
		return {
			...baseDims,
			height: actualHeight && actualHeight > baseDims.height ? actualHeight : baseDims.height
		};
	});

	function updateParam<K extends keyof CardDividerTrayParams>(
		key: K,
		value: CardDividerTrayParams[K]
	) {
		onUpdateParams({ ...tray.params, [key]: value });
	}

	// Drag handlers
	function handleDragStart(e: DragEvent, index: number) {
		draggedIndex = index;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', index.toString());
		}
	}

	function handleDragOver(e: DragEvent, index: number) {
		e.preventDefault();
		dragOverIndex = index;
	}

	function handleDragEnd() {
		draggedIndex = null;
		dragOverIndex = null;
	}

	function handleDrop(e: DragEvent, targetIndex: number) {
		e.preventDefault();
		if (draggedIndex === null) return;

		const newStacks = [...tray.params.stacks];
		const [removed] = newStacks.splice(draggedIndex, 1);
		newStacks.splice(targetIndex, 0, removed);
		onUpdateParams({ ...tray.params, stacks: newStacks });

		handleDragEnd();
	}

	// Stack handlers
	function updateStack(
		index: number,
		field: 'cardSizeId' | 'count' | 'label',
		value: string | number
	) {
		const newStacks = [...tray.params.stacks];
		const current = newStacks[index];
		if (field === 'cardSizeId') {
			newStacks[index] = { ...current, cardSizeId: value as string };
		} else if (field === 'count') {
			newStacks[index] = { ...current, count: value as number };
		} else {
			newStacks[index] = { ...current, label: (value as string) || undefined };
		}
		onUpdateParams({ ...tray.params, stacks: newStacks });
	}

	function addStack() {
		const cardSizeId = getCardSizes()[0]?.id ?? DEFAULT_CARD_SIZE_IDS.standard;
		onUpdateParams({
			...tray.params,
			stacks: [...tray.params.stacks, { cardSizeId, count: 30, label: undefined }]
		});
	}

	function removeStack(index: number) {
		const newStacks = tray.params.stacks.filter((_, i) => i !== index);
		onUpdateParams({ ...tray.params, stacks: newStacks });
	}
</script>

<div class="panelFormSection">
	<section class="section">
		<h3 class="sectionTitle">Layout</h3>
		<Spacer size="0.5rem" />
		<FormControl label="Card orientation" name="cardOrientation">
			{#snippet input({ inputProps })}
				<Select
					{...inputProps}
					selected={[tray.params.orientation]}
					options={[
						{ value: 'vertical', label: 'Vertical (tall cards)' },
						{ value: 'horizontal', label: 'Horizontal (wide cards)' }
					]}
					onSelectedChange={(selected) => {
						if (selected[0]) {
							updateParam('orientation', selected[0] as 'vertical' | 'horizontal');
						}
					}}
				/>
			{/snippet}
		</FormControl>
		<Spacer size="1rem" />
		<FormControl label="Stack arrangement" name="stackDirection">
			{#snippet input({ inputProps })}
				<Select
					{...inputProps}
					selected={[tray.params.stackDirection]}
					options={[
						{ value: 'sideBySide', label: 'Side by side' },
						{ value: 'frontToBack', label: 'Front to back' }
					]}
					onSelectedChange={(selected) => {
						if (selected[0]) {
							updateParam('stackDirection', selected[0] as 'sideBySide' | 'frontToBack');
						}
					}}
				/>
			{/snippet}
		</FormControl>
	</section>

	<Spacer size="0.5rem" />

	<section class="section">
		<h3 class="sectionTitle">Card Stacks</h3>
		<Spacer size="0.5rem" />
		<div class="stackList">
			{#each tray.params.stacks as stack, index (index)}
				<div
					class="stackRow {draggedIndex === index ? 'stackRow--dragging' : ''} {dragOverIndex ===
						index && draggedIndex !== index
						? 'stackRow--dragover'
						: ''}"
					role="listitem"
					ondragover={(e) => handleDragOver(e, index)}
					ondrop={(e) => handleDrop(e, index)}
				>
					<span
						class="dragHandle"
						title="Drag to reorder"
						draggable="true"
						ondragstart={(e) => handleDragStart(e, index)}
						ondragend={handleDragEnd}
						role="button"
						tabindex="0"
					>
						<Icon Icon={IconMenu} size="1rem" color="var(--fgMuted)" />
					</span>
					<div class="stackLabelInput">
						<span class="stackRef">{trayLetter}{index + 1}</span>
						<Input
							type="text"
							placeholder="Label"
							value={stack.label ?? ''}
							onchange={(e) => updateStack(index, 'label', e.currentTarget.value)}
						/>
					</div>
					<div class="stackSelect">
						<Select
							selected={[stack.cardSizeId]}
							options={getCardSizes().map((s) => ({
								value: s.id,
								label: s.name
							}))}
							onSelectedChange={(selected) => updateStack(index, 'cardSizeId', selected[0])}
						/>
					</div>
					<Input
						type="number"
						min="1"
						value={stack.count}
						onchange={(e) => updateStack(index, 'count', parseInt(e.currentTarget.value))}
						style="width: 3.5rem;"
					/>
					<IconButton
						variant="ghost"
						onclick={() => removeStack(index)}
						title="Remove stack"
						color="var(--fgMuted)"
					>
						<Icon Icon={IconX} color="var(--fgMuted)" />
					</IconButton>
				</div>
			{/each}
			<Spacer size="0.5rem" />
			<Link as="button" onclick={addStack}>Add card stack</Link>
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
			<FormControl label="Rim" name="rimHeight">
				{#snippet input({ inputProps })}
					<Input
						{...inputProps}
						type="number"
						step="0.1"
						value={tray.params.rimHeight}
						onchange={(e) => updateParam('rimHeight', parseFloat(e.currentTarget.value))}
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

	.stackList {
		display: flex;
		flex-direction: column;
	}

	.stackRow {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0;
		border-radius: var(--radius-2);
		border: solid 1px transparent;
		position: relative;
	}

	.stackRow--dragging {
		opacity: 0.4;
		background: var(--contrastLow);
	}

	.stackRow--dragover::before {
		content: '';
		position: absolute;
		top: -2px;
		left: 0;
		right: 0;
		height: 2px;
		background: var(--fgPrimary);
		border-radius: 1px;
	}

	.dragHandle {
		display: flex;
		cursor: grab;
		color: var(--fgMuted);
		width: 1rem;
		min-width: 1rem;
		min-height: 2rem;
		padding: 0.5rem;
	}

	.dragHandle:active {
		cursor: grabbing;
	}

	.stackRow:has(.dragHandle:hover) {
		border: dashed 1px var(--contrastLow);
		background: var(--contrastEmpty);
	}

	.dragHandle:hover {
		color: var(--fg);
	}

	.stackSelect {
		width: 7rem;
		flex-shrink: 0;
	}

	.stackLabelInput {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
		min-width: 0;
	}

	.stackRef {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		color: var(--fgMuted);
		width: 1.75rem;
		text-align: right;
		flex-shrink: 0;
	}

	.dimensionsInfo {
		font-size: 0.75rem;
		color: var(--fgMuted);
		margin: 0;
	}
</style>
