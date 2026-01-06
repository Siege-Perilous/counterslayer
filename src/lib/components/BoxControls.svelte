<script lang="ts">
	import type { Box } from '$lib/types/project';

	interface Props {
		box: Box;
		onchange: (updates: Partial<Omit<Box, 'id' | 'trays'>>) => void;
	}

	let { box, onchange }: Props = $props();

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
</div>
