<script lang="ts">
	import type { Box } from '$lib/types/project';
	import { calculateMinimumBoxDimensions } from '$lib/models/box';

	interface Props {
		box: Box;
		onchange: (updates: Partial<Omit<Box, 'id' | 'trays'>>) => void;
	}

	let { box, onchange }: Props = $props();

	// Calculate minimum dimensions for display
	const minimums = $derived(calculateMinimumBoxDimensions(box));

	function handleNameChange(e: Event) {
		const input = e.target as HTMLInputElement;
		onchange({ name: input.value });
	}

	function handleToleranceChange(e: Event) {
		const input = e.target as HTMLInputElement;
		onchange({ tolerance: parseFloat(input.value) || 0.5 });
	}

	function handleWallThicknessChange(e: Event) {
		const input = e.target as HTMLInputElement;
		onchange({ wallThickness: parseFloat(input.value) || 2.0 });
	}

	function handleFloorThicknessChange(e: Event) {
		const input = e.target as HTMLInputElement;
		onchange({ floorThickness: parseFloat(input.value) || 2.0 });
	}

	function handleCustomWidthChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const value = input.value.trim();
		onchange({ customWidth: value ? parseFloat(value) : undefined });
	}

	function handleCustomDepthChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const value = input.value.trim();
		onchange({ customDepth: value ? parseFloat(value) : undefined });
	}

	function handleCustomHeightChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const value = input.value.trim();
		onchange({ customHeight: value ? parseFloat(value) : undefined });
	}

	function handleFillSolidEmptyChange(e: Event) {
		const input = e.target as HTMLInputElement;
		onchange({ fillSolidEmpty: input.checked });
	}
</script>

<div class="p-4">
	<h3 class="mb-3 text-sm font-medium text-gray-300">Box Settings</h3>

	<div class="space-y-3">
		<div>
			<label for="box-name" class="mb-1 block text-xs text-gray-400">Name</label>
			<input
				id="box-name"
				type="text"
				value={box.name}
				onchange={handleNameChange}
				class="w-full rounded bg-gray-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
			/>
		</div>

		<div>
			<label for="box-tolerance" class="mb-1 block text-xs text-gray-400">
				Tolerance (mm)
			</label>
			<input
				id="box-tolerance"
				type="number"
				step="0.1"
				min="0"
				value={box.tolerance}
				onchange={handleToleranceChange}
				class="w-full rounded bg-gray-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
			/>
			<p class="mt-0.5 text-xs text-gray-500">Gap between trays and box walls</p>
		</div>

		<div>
			<label for="box-wall" class="mb-1 block text-xs text-gray-400">
				Wall Thickness (mm)
			</label>
			<input
				id="box-wall"
				type="number"
				step="0.5"
				min="1"
				value={box.wallThickness}
				onchange={handleWallThicknessChange}
				class="w-full rounded bg-gray-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
			/>
		</div>

		<div>
			<label for="box-floor" class="mb-1 block text-xs text-gray-400">
				Floor Thickness (mm)
			</label>
			<input
				id="box-floor"
				type="number"
				step="0.5"
				min="1"
				value={box.floorThickness}
				onchange={handleFloorThicknessChange}
				class="w-full rounded bg-gray-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
			/>
		</div>
	</div>

	<!-- Custom Box Size Section -->
	<div class="mt-4 border-t border-gray-700 pt-4">
		<h4 class="mb-2 text-sm font-medium text-gray-300">Custom Box Size (exterior)</h4>
		<p class="mb-3 text-xs text-gray-500">
			Leave empty for auto-sizing. Measure your game box exterior.
		</p>

		<div class="space-y-2">
			<div>
				<label for="box-custom-width" class="mb-1 block text-xs text-gray-400">
					Width (mm) <span class="text-gray-500">min: {minimums.minWidth.toFixed(1)}</span>
				</label>
				<input
					id="box-custom-width"
					type="number"
					step="0.5"
					min={minimums.minWidth}
					value={box.customWidth ?? ''}
					onchange={handleCustomWidthChange}
					placeholder="Auto"
					class="w-full rounded bg-gray-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
				/>
			</div>

			<div>
				<label for="box-custom-depth" class="mb-1 block text-xs text-gray-400">
					Depth (mm) <span class="text-gray-500">min: {minimums.minDepth.toFixed(1)}</span>
				</label>
				<input
					id="box-custom-depth"
					type="number"
					step="0.5"
					min={minimums.minDepth}
					value={box.customDepth ?? ''}
					onchange={handleCustomDepthChange}
					placeholder="Auto"
					class="w-full rounded bg-gray-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
				/>
			</div>

			<div>
				<label for="box-custom-height" class="mb-1 block text-xs text-gray-400">
					Height (mm) <span class="text-gray-500">min: {minimums.minHeight.toFixed(1)}</span>
				</label>
				<input
					id="box-custom-height"
					type="number"
					step="0.5"
					min={minimums.minHeight}
					value={box.customHeight ?? ''}
					onchange={handleCustomHeightChange}
					placeholder="Auto"
					class="w-full rounded bg-gray-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
				/>
			</div>
		</div>

		<label class="mt-3 flex cursor-pointer items-center gap-2">
			<input
				type="checkbox"
				checked={box.fillSolidEmpty ?? false}
				onchange={handleFillSolidEmptyChange}
				class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
			/>
			<span class="text-xs text-gray-400">Fill empty space with solid material</span>
		</label>
	</div>
</div>
