<script lang="ts">
	import type { CounterTrayParams } from '$lib/models/counterTray';

	interface Props {
		params: CounterTrayParams;
		onchange: (params: CounterTrayParams) => void;
	}

	let { params, onchange }: Props = $props();

	const shapeOptions = ['square', 'hex', 'circle'] as const;

	function updateParam<K extends keyof CounterTrayParams>(key: K, value: CounterTrayParams[K]) {
		onchange({ ...params, [key]: value });
	}

	function updateStack(index: number, field: 'shape' | 'count', value: string | number) {
		const newStacks = [...params.stacks];
		if (field === 'shape') {
			newStacks[index] = [value as string, newStacks[index][1]];
		} else {
			newStacks[index] = [newStacks[index][0], value as number];
		}
		onchange({ ...params, stacks: newStacks });
	}

	function addStack() {
		onchange({ ...params, stacks: [...params.stacks, ['square', 10]] });
	}

	function removeStack(index: number) {
		const newStacks = params.stacks.filter((_, i) => i !== index);
		onchange({ ...params, stacks: newStacks });
	}
</script>

<div class="space-y-6 overflow-y-auto p-4">
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
			Stacks
		</h3>
		<div class="space-y-2">
			{#each params.stacks as stack, index}
				<div class="flex items-center gap-2">
					<select
						value={stack[0]}
						onchange={(e) => updateStack(index, 'shape', e.currentTarget.value)}
						class="flex-1 rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
					>
						{#each shapeOptions as shape}
							<option value={shape}>{shape}</option>
						{/each}
					</select>
					<input
						type="number"
						min="1"
						value={stack[1]}
						onchange={(e) => updateStack(index, 'count', parseInt(e.currentTarget.value))}
						class="w-16 rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
					/>
					<button
						onclick={() => removeStack(index)}
						class="rounded px-2 py-1 text-red-400 hover:bg-red-900/30"
						title="Remove stack"
					>
						&times;
					</button>
				</div>
			{/each}
			<button
				onclick={addStack}
				class="w-full rounded border border-dashed border-gray-600 px-2 py-1 text-sm text-gray-400 hover:border-gray-500 hover:text-gray-300"
			>
				+ Add Stack
			</button>
		</div>
	</section>
</div>
