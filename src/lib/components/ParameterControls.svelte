<script lang="ts">
	import type { CounterTrayParams, EdgeOrientation, CustomShape } from '$lib/models/counterTray';

	interface Props {
		params: CounterTrayParams;
		onchange: (params: CounterTrayParams) => void;
		trayName?: string;
		onTrayNameChange?: (name: string) => void;
	}

	let { params, onchange, trayName, onTrayNameChange }: Props = $props();

	// Shape options: built-in + custom shapes
	const builtinShapes = ['square', 'hex', 'circle'] as const;
	let shapeOptions = $derived([
		...builtinShapes,
		...params.customShapes.map(s => `custom:${s.name}`)
	]);

	const orientationOptions: EdgeOrientation[] = ['lengthwise', 'crosswise'];

	// Get display name for a shape reference
	function getShapeDisplayName(shapeRef: string): string {
		if (shapeRef.startsWith('custom:')) {
			return shapeRef.substring(7);
		}
		return shapeRef;
	}

	function updateParam<K extends keyof CounterTrayParams>(key: K, value: CounterTrayParams[K]) {
		onchange({ ...params, [key]: value });
	}

	// Custom shape handlers
	function addCustomShape() {
		const newName = `Custom ${params.customShapes.length + 1}`;
		onchange({
			...params,
			customShapes: [...params.customShapes, { name: newName, width: 20, length: 30 }]
		});
	}

	function updateCustomShape(index: number, field: keyof CustomShape, value: string | number) {
		const newShapes = [...params.customShapes];
		if (field === 'name') {
			const newName = value as string;
			// Validate uniqueness
			if (newShapes.some((s, i) => i !== index && s.name === newName)) {
				return; // Reject duplicate names
			}
			// Update stack references if name changed
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
						shape === `custom:${oldName}` ? [`custom:${newName}`, count, orient] : [shape, count, orient]
					)
				});
				return;
			}
		}
		newShapes[index] = { ...newShapes[index], [field]: value };
		onchange({ ...params, customShapes: newShapes });
	}

	function removeCustomShape(index: number) {
		const shapeName = params.customShapes[index].name;
		const shapeRef = `custom:${shapeName}`;

		// Convert stacks using this shape to 'square' fallback
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

	// Top-loaded stack handlers
	function updateTopLoadedStack(index: number, field: 'shape' | 'count', value: string | number) {
		const newStacks = [...params.topLoadedStacks];
		if (field === 'shape') {
			newStacks[index] = [value as string, newStacks[index][1]];
		} else {
			newStacks[index] = [newStacks[index][0], value as number];
		}
		onchange({ ...params, topLoadedStacks: newStacks });
	}

	function addTopLoadedStack() {
		onchange({ ...params, topLoadedStacks: [...params.topLoadedStacks, ['square', 10]] });
	}

	function removeTopLoadedStack(index: number) {
		const newStacks = params.topLoadedStacks.filter((_, i) => i !== index);
		onchange({ ...params, topLoadedStacks: newStacks });
	}

	// Edge-loaded stack handlers
	function updateEdgeLoadedStack(index: number, field: 'shape' | 'count' | 'orientation', value: string | number) {
		const newStacks = [...params.edgeLoadedStacks];
		const current = newStacks[index];
		if (field === 'shape') {
			newStacks[index] = [value as string, current[1], current[2]];
		} else if (field === 'count') {
			newStacks[index] = [current[0], value as number, current[2]];
		} else {
			newStacks[index] = [current[0], current[1], value as EdgeOrientation];
		}
		onchange({ ...params, edgeLoadedStacks: newStacks });
	}

	function addEdgeLoadedStack() {
		onchange({ ...params, edgeLoadedStacks: [...params.edgeLoadedStacks, ['square', 10, 'lengthwise']] });
	}

	function removeEdgeLoadedStack(index: number) {
		const newStacks = params.edgeLoadedStacks.filter((_, i) => i !== index);
		onchange({ ...params, edgeLoadedStacks: newStacks });
	}
</script>

<div class="space-y-6 overflow-y-auto p-4">
	{#if trayName !== undefined && onTrayNameChange}
		<section>
			<h3 class="mb-3 border-b border-gray-700 pb-1 text-sm font-semibold text-gray-300">
				Tray Name
			</h3>
			<label class="block">
				<span class="text-xs text-gray-400">Name (shown on tray bottom and box floor)</span>
				<input
					type="text"
					value={trayName}
					onchange={(e) => onTrayNameChange(e.currentTarget.value)}
					class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
				/>
			</label>
		</section>
	{/if}

	<section>
		<h3 class="mb-3 border-b border-gray-700 pb-1 text-sm font-semibold text-gray-300">
			Counter Dimensions
		</h3>
		<div class="grid grid-cols-2 gap-3">
			<label class="block">
				<span class="text-xs text-gray-400">Square Width</span>
				<input
					type="number"
					step="0.1"
					value={params.squareWidth}
					onchange={(e) => updateParam('squareWidth', parseFloat(e.currentTarget.value))}
					class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-xs text-gray-400">Square Length</span>
				<input
					type="number"
					step="0.1"
					value={params.squareLength}
					onchange={(e) => updateParam('squareLength', parseFloat(e.currentTarget.value))}
					class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-xs text-gray-400">Hex Flat-to-Flat</span>
				<input
					type="number"
					step="0.1"
					value={params.hexFlatToFlat}
					onchange={(e) => updateParam('hexFlatToFlat', parseFloat(e.currentTarget.value))}
					class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-xs text-gray-400">Circle Diameter</span>
				<input
					type="number"
					step="0.1"
					value={params.circleDiameter}
					onchange={(e) => updateParam('circleDiameter', parseFloat(e.currentTarget.value))}
					class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-xs text-gray-400">Counter Thickness</span>
				<input
					type="number"
					step="0.1"
					value={params.counterThickness}
					onchange={(e) => updateParam('counterThickness', parseFloat(e.currentTarget.value))}
					class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
				/>
			</label>
			<label class="flex items-center gap-2 pt-5">
				<input
					type="checkbox"
					checked={params.hexPointyTop}
					onchange={(e) => updateParam('hexPointyTop', e.currentTarget.checked)}
					class="rounded border-gray-600 bg-gray-700"
				/>
				<span class="text-xs text-gray-400">Hex Pointy Top</span>
			</label>
		</div>
	</section>

	<section>
		<h3 class="mb-3 border-b border-gray-700 pb-1 text-sm font-semibold text-gray-300">
			Custom Shapes
		</h3>
		<p class="mb-2 text-xs text-gray-500">Define custom rectangular counter sizes</p>
		<div class="space-y-2">
			{#each params.customShapes as shape, index}
				<div class="rounded bg-gray-750 p-2">
					<div class="mb-2 flex items-center gap-2">
						<input
							type="text"
							value={shape.name}
							onchange={(e) => updateCustomShape(index, 'name', e.currentTarget.value)}
							placeholder="Shape name"
							class="flex-1 rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
						/>
						<button
							onclick={() => removeCustomShape(index)}
							class="rounded px-2 py-1 text-red-400 hover:bg-red-900/30"
							title="Remove shape"
						>
							&times;
						</button>
					</div>
					<div class="grid grid-cols-2 gap-2">
						<label class="block">
							<span class="text-xs text-gray-400">Width (mm)</span>
							<input
								type="number"
								step="0.1"
								min="1"
								value={shape.width}
								onchange={(e) => updateCustomShape(index, 'width', parseFloat(e.currentTarget.value))}
								class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
							/>
						</label>
						<label class="block">
							<span class="text-xs text-gray-400">Length (mm)</span>
							<input
								type="number"
								step="0.1"
								min="1"
								value={shape.length}
								onchange={(e) => updateCustomShape(index, 'length', parseFloat(e.currentTarget.value))}
								class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
							/>
						</label>
					</div>
				</div>
			{/each}
			<button
				onclick={addCustomShape}
				class="w-full rounded border border-dashed border-gray-600 px-2 py-1 text-sm text-gray-400 hover:border-gray-500 hover:text-gray-300"
			>
				+ Add Custom Shape
			</button>
		</div>
	</section>

	<section>
		<h3 class="mb-3 border-b border-gray-700 pb-1 text-sm font-semibold text-gray-300">
			Tray Settings
		</h3>
		<div class="grid grid-cols-2 gap-3">
			<label class="block">
				<span class="text-xs text-gray-400">Clearance</span>
				<input
					type="number"
					step="0.1"
					value={params.clearance}
					onchange={(e) => updateParam('clearance', parseFloat(e.currentTarget.value))}
					class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-xs text-gray-400">Wall Thickness</span>
				<input
					type="number"
					step="0.1"
					value={params.wallThickness}
					onchange={(e) => updateParam('wallThickness', parseFloat(e.currentTarget.value))}
					class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-xs text-gray-400">Floor Thickness</span>
				<input
					type="number"
					step="0.1"
					value={params.floorThickness}
					onchange={(e) => updateParam('floorThickness', parseFloat(e.currentTarget.value))}
					class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-xs text-gray-400">Rim Height</span>
				<input
					type="number"
					step="0.1"
					value={params.rimHeight}
					onchange={(e) => updateParam('rimHeight', parseFloat(e.currentTarget.value))}
					class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-xs text-gray-400">Cutout Ratio</span>
				<input
					type="number"
					step="0.05"
					min="0"
					max="1"
					value={params.cutoutRatio}
					onchange={(e) => updateParam('cutoutRatio', parseFloat(e.currentTarget.value))}
					class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-xs text-gray-400">Cutout Max</span>
				<input
					type="number"
					step="1"
					value={params.cutoutMax}
					onchange={(e) => updateParam('cutoutMax', parseFloat(e.currentTarget.value))}
					class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
				/>
			</label>
		</div>
	</section>

	<section>
		<h3 class="mb-3 border-b border-gray-700 pb-1 text-sm font-semibold text-gray-300">
			Tray Override
		</h3>
		<div class="grid grid-cols-2 gap-3">
			<label class="block col-span-2">
				<span class="text-xs text-gray-400">Length Override (0 = auto)</span>
				<input
					type="number"
					step="1"
					value={params.trayLengthOverride}
					onchange={(e) => updateParam('trayLengthOverride', parseFloat(e.currentTarget.value))}
					class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-xs text-gray-400">Extra Cols</span>
				<input
					type="number"
					step="1"
					min="1"
					value={params.extraTrayCols}
					onchange={(e) => updateParam('extraTrayCols', parseInt(e.currentTarget.value))}
					class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-xs text-gray-400">Extra Rows</span>
				<input
					type="number"
					step="1"
					min="1"
					value={params.extraTrayRows}
					onchange={(e) => updateParam('extraTrayRows', parseInt(e.currentTarget.value))}
					class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
				/>
			</label>
		</div>
	</section>

	<section>
		<h3 class="mb-3 border-b border-gray-700 pb-1 text-sm font-semibold text-gray-300">
			Preview
		</h3>
		<div class="grid grid-cols-2 gap-3">
			<label class="block col-span-2">
				<span class="text-xs text-gray-400">Print Bed Size (mm)</span>
				<input
					type="number"
					step="1"
					min="100"
					value={params.printBedSize}
					onchange={(e) => updateParam('printBedSize', parseInt(e.currentTarget.value))}
					class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
				/>
			</label>
		</div>
	</section>

	<section>
		<h3 class="mb-3 border-b border-gray-700 pb-1 text-sm font-semibold text-gray-300">
			Top-Loaded Stacks
		</h3>
		<p class="mb-2 text-xs text-gray-500">Counters stacked vertically, picked from above</p>
		<div class="space-y-2">
			{#each params.topLoadedStacks as stack, index}
				<div class="flex items-center gap-2">
					<select
						value={stack[0]}
						onchange={(e) => updateTopLoadedStack(index, 'shape', e.currentTarget.value)}
						class="flex-1 rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
					>
						{#each shapeOptions as shapeOpt}
							<option value={shapeOpt}>{getShapeDisplayName(shapeOpt)}</option>
						{/each}
					</select>
					<input
						type="number"
						min="1"
						value={stack[1]}
						onchange={(e) => updateTopLoadedStack(index, 'count', parseInt(e.currentTarget.value))}
						class="w-16 rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
					/>
					<button
						onclick={() => removeTopLoadedStack(index)}
						class="rounded px-2 py-1 text-red-400 hover:bg-red-900/30"
						title="Remove stack"
					>
						&times;
					</button>
				</div>
			{/each}
			<button
				onclick={addTopLoadedStack}
				class="w-full rounded border border-dashed border-gray-600 px-2 py-1 text-sm text-gray-400 hover:border-gray-500 hover:text-gray-300"
			>
				+ Add Top-Loaded Stack
			</button>
		</div>
	</section>

	<section>
		<h3 class="mb-3 border-b border-gray-700 pb-1 text-sm font-semibold text-gray-300">
			Edge-Loaded Stacks
		</h3>
		<p class="mb-2 text-xs text-gray-500">Counters standing on edge, like books on a shelf</p>
		<div class="space-y-2">
			{#each params.edgeLoadedStacks as stack, index}
				<div class="flex items-center gap-2">
					<select
						value={stack[0]}
						onchange={(e) => updateEdgeLoadedStack(index, 'shape', e.currentTarget.value)}
						class="flex-1 rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
					>
						{#each shapeOptions as shapeOpt}
							<option value={shapeOpt}>{getShapeDisplayName(shapeOpt)}</option>
						{/each}
					</select>
					<input
						type="number"
						min="1"
						value={stack[1]}
						onchange={(e) => updateEdgeLoadedStack(index, 'count', parseInt(e.currentTarget.value))}
						class="w-16 rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
					/>
					<select
						value={stack[2] ?? 'lengthwise'}
						onchange={(e) => updateEdgeLoadedStack(index, 'orientation', e.currentTarget.value)}
						class="w-24 rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
						title="Orientation"
					>
						{#each orientationOptions as orientation}
							<option value={orientation}>{orientation}</option>
						{/each}
					</select>
					<button
						onclick={() => removeEdgeLoadedStack(index)}
						class="rounded px-2 py-1 text-red-400 hover:bg-red-900/30"
						title="Remove stack"
					>
						&times;
					</button>
				</div>
			{/each}
			<button
				onclick={addEdgeLoadedStack}
				class="w-full rounded border border-dashed border-gray-600 px-2 py-1 text-sm text-gray-400 hover:border-gray-500 hover:text-gray-300"
			>
				+ Add Edge-Loaded Stack
			</button>
		</div>
	</section>
</div>
