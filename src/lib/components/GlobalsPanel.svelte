<script lang="ts">
	import { Button, Input, InputCheckbox, FormControl, Spacer, Hr, Select, Link, IconButton, Icon } from '@tableslayer/ui';
	import { IconX } from '@tabler/icons-svelte';
	import type { CounterTrayParams, CustomShape, CustomBaseShape } from '$lib/models/counterTray';

	interface Props {
		params: CounterTrayParams;
		onchange: (params: CounterTrayParams) => void;
	}

	let { params, onchange }: Props = $props();

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
		const newName = `Custom ${params.customShapes.length + 1}`;
		onchange({
			...params,
			customShapes: [
				...params.customShapes,
				{ name: newName, baseShape: 'rectangle', width: 20, length: 30 }
			]
		});
	}

	function updateCustomShape(index: number, field: keyof CustomShape, value: string | number) {
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
				// For square, circle, hex: set length = width
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
				// For square, circle, hex: length = width
				newShapes[index] = { ...newShapes[index], width: value as number, length: value as number };
			} else {
				newShapes[index] = { ...newShapes[index], width: value as number };
			}
			onchange({ ...params, customShapes: newShapes });
			return;
		}

		newShapes[index] = { ...newShapes[index], [field]: value };
		onchange({ ...params, customShapes: newShapes });
	}

	function removeCustomShape(index: number) {
		const shapeName = params.customShapes[index].name;
		const shapeRef = `custom:${shapeName}`;
		onchange({
			...params,
			customShapes: params.customShapes.filter((_, i) => i !== index),
			topLoadedStacks: params.topLoadedStacks.map(([shape, count]) =>
				shape === shapeRef ? ['square', count] : [shape, count]
			),
			edgeLoadedStacks: params.edgeLoadedStacks.map(([shape, count, orient]) =>
				shape === shapeRef ? ['square', count, orient] : [shape, count, orient]
			)
		});
	}
</script>

<div class="globalsPanel">
	<section class="section">
		<h3 class="sectionTitle">Print Bed</h3>
		<FormControl label="Bed Size" name="printBedSize">
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
		<h3 class="sectionTitle">Simple Counters</h3>
		<Spacer size="0.5rem" />
		<div class="formGrid">
			<FormControl label="Square" name="squareWidth">
				{#snippet input({ inputProps })}
					<Input
						{...inputProps}
						type="number"
						step="0.1"
						value={params.squareWidth}
						onchange={(e) => {
							const val = parseFloat(e.currentTarget.value);
							onchange({ ...params, squareWidth: val, squareLength: val });
						}}
					/>
				{/snippet}
				{#snippet end()}mm{/snippet}
			</FormControl>
			<FormControl label="Hex (flat-to-flat)" name="hexFlatToFlat">
				{#snippet input({ inputProps })}
					<Input
						{...inputProps}
						type="number"
						step="0.1"
						value={params.hexFlatToFlat}
						onchange={(e) => updateParam('hexFlatToFlat', parseFloat(e.currentTarget.value))}
					/>
				{/snippet}
				{#snippet end()}mm{/snippet}
			</FormControl>
			<FormControl label="Circle Diameter" name="circleDiameter">
				{#snippet input({ inputProps })}
					<Input
						{...inputProps}
						type="number"
						step="0.1"
						value={params.circleDiameter}
						onchange={(e) => updateParam('circleDiameter', parseFloat(e.currentTarget.value))}
					/>
				{/snippet}
				{#snippet end()}mm{/snippet}
			</FormControl>
			<FormControl label="Triangle (side)" name="triangleSide">
				{#snippet input({ inputProps })}
					<Input
						{...inputProps}
						type="number"
						step="0.1"
						value={params.triangleSide}
						onchange={(e) => updateParam('triangleSide', parseFloat(e.currentTarget.value))}
					/>
				{/snippet}
				{#snippet end()}mm{/snippet}
			</FormControl>
			<FormControl label="Triangle Radius" name="triangleCornerRadius">
				{#snippet input({ inputProps })}
					<Input
						{...inputProps}
						type="number"
						step="0.1"
						min="0"
						value={params.triangleCornerRadius}
						onchange={(e) => updateParam('triangleCornerRadius', parseFloat(e.currentTarget.value))}
					/>
				{/snippet}
				{#snippet end()}mm{/snippet}
			</FormControl>
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
		</div>
		<Spacer size="0.5rem" />
		<InputCheckbox
			checked={params.hexPointyTop}
			onchange={(e) => updateParam('hexPointyTop', e.currentTarget.checked)}
			label="Hex Pointy Top"
		/>
	</section>

	<Hr />

	<section class="section">
		<h3 class="sectionTitle">Custom Counters</h3>
		<Spacer size="0.5rem" />
		<div class="customShapesList">
			{#each params.customShapes as shape, index (shape.name)}
				{@const baseShape = shape.baseShape ?? 'rectangle'}
				<div class="shapeCard">
					<div class="shapeCardHeader">
						<Input
							type="text"
							value={shape.name}
							onchange={(e) => updateCustomShape(index, 'name', e.currentTarget.value)}
							placeholder="Shape name"
							style="flex: 1;"
						/>
						<IconButton
							onclick={() => removeCustomShape(index)}
							title="Remove shape"
							variant="ghost"
							color="var(--fgMuted)"
						>
							<Icon Icon={IconX} color="var(--fgMuted)" />
						</IconButton>
					</div>
					<Spacer size="0.5rem" />
					<FormControl label="Base Shape" name="baseShape-{index}">
						{#snippet input({ inputProps })}
							<Select
								selected={[baseShape]}
								onSelectedChange={(selected) => updateCustomShape(index, 'baseShape', selected[0])}
								options={baseShapeOptions}
								{...inputProps}
							/>
						{/snippet}
					</FormControl>
					<Spacer size="0.5rem" />
					<div class="formGrid">
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
							<FormControl label="Size" name="size-{index}" class="formGrid__spanTwo">
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
							<FormControl label="Diameter" name="diameter-{index}" class="formGrid__spanTwo">
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
							<FormControl label="Flat-to-Flat" name="flatToFlat-{index}" class="formGrid__spanTwo">
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
						{:else if baseShape === 'triangle'}
							<FormControl label="Side" name="side-{index}" class="formGrid__spanTwo">
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
						{/if}
					</div>
				</div>
			{/each}
			<Link as="button" onclick={addCustomShape}>+ Add Custom Shape</Link>
		</div>
	</section>
</div>

<style>
	.globalsPanel {
		height: 100%;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.section {
		margin-bottom: 1rem;
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
		gap: 0.75rem;
	}

	.shapeCard {
		padding: 0.5rem;
		border-radius: var(--radius-2);
		background: var(--contrastLowest);
	}

	.shapeCardHeader {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

</style>
