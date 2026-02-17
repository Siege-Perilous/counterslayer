<script lang="ts">
	import type { CounterTrayParams, CustomShape } from '$lib/models/counterTray';

	interface Props {
		params: CounterTrayParams;
		onchange: (params: CounterTrayParams) => void;
	}

	let { params, onchange }: Props = $props();

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

<div class="h-full space-y-4 overflow-y-auto p-3">
	<section>
		<h3 class="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">Print Bed</h3>
		<label class="block">
			<span class="text-xs text-gray-400">Bed Size (mm)</span>
			<input
				type="number"
				step="1"
				min="100"
				value={params.printBedSize}
				onchange={(e) => updateParam('printBedSize', parseInt(e.currentTarget.value))}
				class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
			/>
		</label>
	</section>

	<section>
		<h3 class="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">
			Counter Dimensions
		</h3>
		<div class="grid grid-cols-2 gap-2">
			<label class="block">
				<span class="text-xs text-gray-400">Square W</span>
				<input
					type="number"
					step="0.1"
					value={params.squareWidth}
					onchange={(e) => updateParam('squareWidth', parseFloat(e.currentTarget.value))}
					class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-xs text-gray-400">Square L</span>
				<input
					type="number"
					step="0.1"
					value={params.squareLength}
					onchange={(e) => updateParam('squareLength', parseFloat(e.currentTarget.value))}
					class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-xs text-gray-400">Hex F-to-F</span>
				<input
					type="number"
					step="0.1"
					value={params.hexFlatToFlat}
					onchange={(e) => updateParam('hexFlatToFlat', parseFloat(e.currentTarget.value))}
					class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-xs text-gray-400">Circle Dia</span>
				<input
					type="number"
					step="0.1"
					value={params.circleDiameter}
					onchange={(e) => updateParam('circleDiameter', parseFloat(e.currentTarget.value))}
					class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-xs text-gray-400">Thickness</span>
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
				<span class="text-xs text-gray-400">Hex Pointy</span>
			</label>
		</div>
	</section>

	<section>
		<h3 class="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">
			Custom Counters
		</h3>
		<div class="space-y-2">
			{#each params.customShapes as shape, index (shape.name)}
				<div class="bg-gray-750 rounded p-2">
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
							<span class="text-xs text-gray-400">Width</span>
							<input
								type="number"
								step="0.1"
								min="1"
								value={shape.width}
								onchange={(e) =>
									updateCustomShape(index, 'width', parseFloat(e.currentTarget.value))}
								class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
							/>
						</label>
						<label class="block">
							<span class="text-xs text-gray-400">Length</span>
							<input
								type="number"
								step="0.1"
								min="1"
								value={shape.length}
								onchange={(e) =>
									updateCustomShape(index, 'length', parseFloat(e.currentTarget.value))}
								class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
							/>
						</label>
					</div>
				</div>
			{/each}
			<button
				onclick={addCustomShape}
				class="w-full rounded border border-dashed border-gray-600 px-2 py-1 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-300"
			>
				+ Add Custom Shape
			</button>
		</div>
	</section>
</div>
