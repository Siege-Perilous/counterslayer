<script lang="ts">
	import {
		Input,
		InputCheckbox,
		FormControl,
		Spacer,
		Hr,
		Select,
		Link,
		Icon,
		Panel,
		Button,
		ConfirmActionButton
	} from '@tableslayer/ui';
	import {
		IconX,
		IconSquare,
		IconCircle,
		IconHexagon,
		IconTriangle,
		IconRectangle
	} from '@tabler/icons-svelte';
	import type { CounterTrayParams, CustomShape, CustomBaseShape } from '$lib/models/counterTray';

	interface Props {
		params: CounterTrayParams;
		onchange: (params: CounterTrayParams) => void;
	}

	let { params, onchange }: Props = $props();

	// Track which counter is expanded (null = none)
	let expandedIndex: number | null = $state(null);

	// Get the shape icon component for a base shape
	function getShapeIcon(baseShape: CustomBaseShape) {
		switch (baseShape) {
			case 'square':
				return IconSquare;
			case 'circle':
				return IconCircle;
			case 'hex':
				return IconHexagon;
			case 'triangle':
				return IconTriangle;
			case 'rectangle':
			default:
				return IconRectangle;
		}
	}

	// Calculate icon scale relative to max size (with clamping)
	function getRelativeIconScale(shape: CustomShape): number {
		const maxWidth = Math.max(...params.customShapes.map((s) => Math.max(s.width, s.length)));
		const shapeSize = Math.max(shape.width, shape.length);
		const minScale = 0.6;
		const maxScale = 1.4;
		const ratio = maxWidth > 0 ? shapeSize / maxWidth : 1;
		return minScale + ratio * (maxScale - minScale);
	}

	// Get display size string for a shape
	function getSizeDisplay(shape: CustomShape): string {
		const baseShape = shape.baseShape ?? 'rectangle';
		if (baseShape === 'rectangle') {
			return `${shape.width} × ${shape.length}`;
		}
		return `${shape.width}`;
	}

	const baseShapeOptions: { value: CustomBaseShape; label: string }[] = [
		{ value: 'rectangle', label: 'Rectangle' },
		{ value: 'square', label: 'Square' },
		{ value: 'circle', label: 'Circle' },
		{ value: 'hex', label: 'Hex' },
		{ value: 'triangle', label: 'Triangle' }
	];

	function updateParam<K extends keyof CounterTrayParams>(key: K, value: CounterTrayParams[K]) {
		onchange({ ...params, [key]: value });
	}

	// Custom shape handlers
	function addCustomShape() {
		const newIndex = params.customShapes.length;
		const newName = `Custom ${newIndex + 1}`;
		onchange({
			...params,
			customShapes: [
				...params.customShapes,
				{ name: newName, baseShape: 'rectangle', width: 20, length: 30 }
			]
		});
		expandedIndex = newIndex;
	}

	function updateCustomShape(
		index: number,
		field: keyof CustomShape | 'cornerRadius' | 'pointyTop',
		value: string | number | boolean
	) {
		const newShapes = [...params.customShapes];
		if (field === 'name') {
			const newName = value as string;
			if (newShapes.some((s, i) => i !== index && s.name === newName)) {
				return;
			}
			const oldName = newShapes[index].name;
			if (oldName !== newName) {
				newShapes[index] = { ...newShapes[index], name: newName };
				onchange({
					...params,
					customShapes: newShapes,
					topLoadedStacks: params.topLoadedStacks.map(([shape, count]) =>
						shape === `custom:${oldName}` ? [`custom:${newName}`, count] : [shape, count]
					),
					edgeLoadedStacks: params.edgeLoadedStacks.map(([shape, count, orient]) =>
						shape === `custom:${oldName}`
							? [`custom:${newName}`, count, orient]
							: [shape, count, orient]
					)
				});
				return;
			}
		}

		// Handle baseShape changes - sync length to width for non-rectangle shapes
		if (field === 'baseShape') {
			const baseShape = value as CustomBaseShape;
			if (baseShape !== 'rectangle') {
				// For square, circle, hex, triangle: set length = width
				newShapes[index] = { ...newShapes[index], baseShape, length: newShapes[index].width };
			} else {
				newShapes[index] = { ...newShapes[index], baseShape };
			}
			onchange({ ...params, customShapes: newShapes });
			return;
		}

		// Handle width changes for non-rectangle shapes - sync length
		if (field === 'width') {
			const shape = newShapes[index];
			const baseShape = shape.baseShape ?? 'rectangle';
			if (baseShape !== 'rectangle') {
				// For square, circle, hex, triangle: length = width
				newShapes[index] = { ...newShapes[index], width: value as number, length: value as number };
			} else {
				newShapes[index] = { ...newShapes[index], width: value as number };
			}
			onchange({ ...params, customShapes: newShapes });
			return;
		}

		// Handle cornerRadius for triangles
		if (field === 'cornerRadius') {
			newShapes[index] = { ...newShapes[index], cornerRadius: value as number };
			onchange({ ...params, customShapes: newShapes });
			return;
		}

		// Handle pointyTop for hexes
		if (field === 'pointyTop') {
			newShapes[index] = { ...newShapes[index], pointyTop: Boolean(value) };
			onchange({ ...params, customShapes: newShapes });
			return;
		}

		newShapes[index] = { ...newShapes[index], [field]: value };
		onchange({ ...params, customShapes: newShapes });
	}

	// Count stacks using a given shape
	function countStacksUsingShape(shapeName: string): number {
		const shapeRef = `custom:${shapeName}`;
		const topCount = params.topLoadedStacks.filter(([shape]) => shape === shapeRef).length;
		const edgeCount = params.edgeLoadedStacks.filter(([shape]) => shape === shapeRef).length;
		return topCount + edgeCount;
	}

	function removeCustomShape(index: number) {
		const shapeName = params.customShapes[index].name;
		const shapeRef = `custom:${shapeName}`;
		onchange({
			...params,
			customShapes: params.customShapes.filter((_, i) => i !== index),
			topLoadedStacks: params.topLoadedStacks.filter(([shape]) => shape !== shapeRef),
			edgeLoadedStacks: params.edgeLoadedStacks.filter(([shape]) => shape !== shapeRef)
		});
		// Collapse the expanded view after delete
		expandedIndex = null;
	}
</script>

<div class="globalsPanel">
	<section class="section">
		<h3 class="sectionTitle">Print Bed</h3>
		<FormControl label="Bed size" name="printBedSize">
			{#snippet input({ inputProps })}
				<Input
					{...inputProps}
					type="number"
					step="1"
					min="100"
					value={params.printBedSize}
					onchange={(e) => updateParam('printBedSize', parseInt(e.currentTarget.value))}
				/>
			{/snippet}
			{#snippet end()}mm{/snippet}
		</FormControl>
	</section>

	<Hr />

	<section class="section">
		<h3 class="sectionTitle">Counter Settings</h3>
		<Spacer size="0.5rem" />
		<FormControl label="Thickness" name="counterThickness">
			{#snippet input({ inputProps })}
				<Input
					{...inputProps}
					type="number"
					step="0.1"
					value={params.counterThickness}
					onchange={(e) => updateParam('counterThickness', parseFloat(e.currentTarget.value))}
				/>
			{/snippet}
			{#snippet end()}mm{/snippet}
		</FormControl>
	</section>

	<Hr />

	<section class="section">
		<h3 class="sectionTitle">Counters</h3>
		<Spacer size="0.5rem" />
		<div class="customShapesList">
			{#each params.customShapes as shape, index (shape.name)}
				{@const baseShape = shape.baseShape ?? 'rectangle'}
				{@const isExpanded = expandedIndex === index}
				{#if isExpanded}
					<!-- Expanded view: full form in Panel -->
					<Panel class="shapePanel">
						<div class="shapePanelContent">
							<div class="shapeFormGrid">
								<FormControl label="Name" name="name-{index}">
									{#snippet input({ inputProps })}
										<Input
											{...inputProps}
											type="text"
											value={shape.name}
											onchange={(e) => updateCustomShape(index, 'name', e.currentTarget.value)}
											placeholder="Name"
										/>
									{/snippet}
								</FormControl>
								<FormControl label="Shape" name="baseShape-{index}">
									{#snippet input({ inputProps })}
										<Select
											selected={[baseShape]}
											onSelectedChange={(selected) =>
												updateCustomShape(index, 'baseShape', selected[0])}
											options={baseShapeOptions}
											{...inputProps}
										/>
									{/snippet}
								</FormControl>
								{#if baseShape === 'rectangle'}
									<FormControl label="Width" name="width-{index}">
										{#snippet input({ inputProps })}
											<Input
												{...inputProps}
												type="number"
												step="0.1"
												min="1"
												value={shape.width}
												onchange={(e) =>
													updateCustomShape(index, 'width', parseFloat(e.currentTarget.value))}
											/>
										{/snippet}
										{#snippet end()}mm{/snippet}
									</FormControl>
									<FormControl label="Length" name="length-{index}">
										{#snippet input({ inputProps })}
											<Input
												{...inputProps}
												type="number"
												step="0.1"
												min="1"
												value={shape.length}
												onchange={(e) =>
													updateCustomShape(index, 'length', parseFloat(e.currentTarget.value))}
											/>
										{/snippet}
										{#snippet end()}mm{/snippet}
									</FormControl>
								{:else if baseShape === 'square'}
									<FormControl label="Size" name="size-{index}">
										{#snippet input({ inputProps })}
											<Input
												{...inputProps}
												type="number"
												step="0.1"
												min="1"
												value={shape.width}
												onchange={(e) =>
													updateCustomShape(index, 'width', parseFloat(e.currentTarget.value))}
											/>
										{/snippet}
										{#snippet end()}mm{/snippet}
									</FormControl>
								{:else if baseShape === 'circle'}
									<FormControl label="Diameter" name="diameter-{index}">
										{#snippet input({ inputProps })}
											<Input
												{...inputProps}
												type="number"
												step="0.1"
												min="1"
												value={shape.width}
												onchange={(e) =>
													updateCustomShape(index, 'width', parseFloat(e.currentTarget.value))}
											/>
										{/snippet}
										{#snippet end()}mm{/snippet}
									</FormControl>
								{:else if baseShape === 'hex'}
									<FormControl label="Flat-to-flat" name="flatToFlat-{index}">
										{#snippet input({ inputProps })}
											<Input
												{...inputProps}
												type="number"
												step="0.1"
												min="1"
												value={shape.width}
												onchange={(e) =>
													updateCustomShape(index, 'width', parseFloat(e.currentTarget.value))}
											/>
										{/snippet}
										{#snippet end()}mm{/snippet}
									</FormControl>
									<InputCheckbox
										checked={shape.pointyTop ?? false}
										onchange={(e) =>
											updateCustomShape(index, 'pointyTop', e.currentTarget.checked ? 1 : 0)}
										label="Pointy top"
									/>
								{:else if baseShape === 'triangle'}
									<FormControl label="Side" name="side-{index}">
										{#snippet input({ inputProps })}
											<Input
												{...inputProps}
												type="number"
												step="0.1"
												min="1"
												value={shape.width}
												onchange={(e) =>
													updateCustomShape(index, 'width', parseFloat(e.currentTarget.value))}
											/>
										{/snippet}
										{#snippet end()}mm{/snippet}
									</FormControl>
									<FormControl label="Radius" name="cornerRadius-{index}">
										{#snippet input({ inputProps })}
											<Input
												{...inputProps}
												type="number"
												step="0.1"
												min="0"
												value={shape.cornerRadius ?? 1.5}
												onchange={(e) =>
													updateCustomShape(
														index,
														'cornerRadius',
														parseFloat(e.currentTarget.value)
													)}
											/>
										{/snippet}
										{#snippet end()}mm{/snippet}
									</FormControl>
								{/if}
							</div>
						</div>
						<Hr />
						{@const stackCount = countStacksUsingShape(shape.name)}
						<div class="shapePanelActions">
							<Button size="sm" onclick={() => (expandedIndex = null)}>Save</Button>
							<ConfirmActionButton
								action={() => removeCustomShape(index)}
								actionButtonText="Delete counter"
							>
								{#snippet trigger({ triggerProps })}
									<Button {...triggerProps} size="sm" variant="ghost">Delete</Button>
								{/snippet}
								{#snippet actionMessage()}
									{#if stackCount > 0}
										<p>
											This will delete the "{shape.name}" counter and remove {stackCount} stack{stackCount ===
											1
												? ''
												: 's'} using it.
										</p>
									{:else}
										<p>Delete the "{shape.name}" counter?</p>
									{/if}
								{/snippet}
							</ConfirmActionButton>
						</div>
					</Panel>
				{:else}
					{@const iconScale = getRelativeIconScale(shape)}
					<div class="shapeCard">
						<!-- Collapsed view: compact summary -->
						<button
							class="shapeSummary"
							onclick={() => (expandedIndex = index)}
							title="Click to edit {shape.name}"
						>
							<span
								class="shapeIcon"
								style="transform: scale({iconScale}); --stroke-width: {2 / iconScale};"
							>
								<Icon Icon={getShapeIcon(baseShape)} size={16} />
							</span>
							<span class="shapeName">{shape.name}</span>
							<span class="shapeSize">{getSizeDisplay(shape)} mm</span>
						</button>
					</div>
				{/if}
			{/each}
		</div>
		<Spacer />
		<Link as="button" onclick={addCustomShape}>+ New counter</Link>
	</section>

	<Hr />
</div>

<style>
	.globalsPanel {
		height: 100%;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 0.75rem 0;
	}

	.section {
		padding: 0 0.75rem;
	}

	.sectionTitle {
		margin-bottom: 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--fgMuted);
	}

	.formGrid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	:global(.formGrid__spanTwo) {
		grid-column: span 2;
	}

	.customShapesList {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.shapeCard {
		border-radius: var(--radius-2);
		background: var(--contrastLowest);
		overflow: hidden;
	}

	:global(.panel.shapePanel) {
		padding: 0;
		background: var(--contrastLow) !important;
	}

	.shapePanelContent {
		padding: 0.75rem;
	}

	.shapeFormGrid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
		gap: 0.75rem;
	}

	.shapePanelActions {
		display: flex;
		gap: 0.5rem;
		padding: 0.75rem;
	}

	.shapeSummary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem;
		border: none;
		background: transparent;
		cursor: pointer;
		text-align: left;
		font: inherit;
		color: inherit;
	}

	.shapeSummary:hover {
		background: var(--contrastLow);
	}

	.shapeIcon {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		color: var(--fgMuted);
	}

	.shapeIcon :global(svg) {
		stroke-width: var(--stroke-width, 2);
	}

	.shapeName {
		flex: 1;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.shapeSize {
		font-size: 0.75rem;
		color: var(--fgMuted);
		font-family: var(--font-mono);
	}
</style>
