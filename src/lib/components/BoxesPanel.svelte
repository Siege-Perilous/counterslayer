<script lang="ts">
	import type { Box, Project } from '$lib/types/project';
	import { calculateMinimumBoxDimensions } from '$lib/models/box';

	interface Props {
		project: Project;
		selectedBox: Box | null;
		onSelectBox: (box: Box) => void;
		onAddBox: () => void;
		onDeleteBox: (boxId: string) => void;
		onUpdateBox: (updates: Partial<Omit<Box, 'id' | 'trays'>>) => void;
	}

	let { project, selectedBox, onSelectBox, onAddBox, onDeleteBox, onUpdateBox }: Props = $props();

	const minimums = $derived(selectedBox ? calculateMinimumBoxDimensions(selectedBox) : { minWidth: 0, minDepth: 0, minHeight: 0 });
</script>

<div class="flex h-full flex-col overflow-hidden">
	<!-- Box List -->
	<div class="border-b border-gray-700 p-2">
		<div class="mb-2 flex items-center justify-between px-1">
			<span class="text-xs font-semibold uppercase tracking-wide text-gray-400">Boxes</span>
			<button
				onclick={onAddBox}
				class="rounded bg-gray-700 px-2 py-0.5 text-xs hover:bg-gray-600"
			>
				+ New
			</button>
		</div>
		<div class="max-h-24 space-y-1 overflow-y-auto">
			{#each project.boxes as box (box.id)}
				<div
					class="flex cursor-pointer items-center justify-between rounded px-2 py-1 text-sm {selectedBox?.id === box.id ? 'bg-blue-600' : 'hover:bg-gray-700'}"
					onclick={() => onSelectBox(box)}
					role="button"
					tabindex="0"
					onkeydown={(e) => e.key === 'Enter' && onSelectBox(box)}
				>
					<span class="truncate">{box.name}</span>
					{#if project.boxes.length > 1}
						<button
							onclick={(e) => { e.stopPropagation(); onDeleteBox(box.id); }}
							class="ml-2 rounded px-1 text-xs text-gray-400 hover:bg-red-600 hover:text-white"
							title="Delete box"
						>
							&times;
						</button>
					{/if}
				</div>
			{/each}
		</div>
	</div>

	<!-- Box Settings -->
	{#if selectedBox}
		<div class="flex-1 space-y-3 overflow-y-auto p-3">
			<div>
				<label for="box-name" class="mb-1 block text-xs text-gray-400">Name</label>
				<input
					id="box-name"
					type="text"
					value={selectedBox.name}
					onchange={(e) => onUpdateBox({ name: (e.target as HTMLInputElement).value })}
					class="w-full rounded bg-gray-700 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
				/>
			</div>

			<div class="grid grid-cols-2 gap-2">
				<div>
					<label for="box-tolerance" class="mb-1 block text-xs text-gray-400">Tolerance</label>
					<input
						id="box-tolerance"
						type="number"
						step="0.1"
						min="0"
						value={selectedBox.tolerance}
						onchange={(e) => onUpdateBox({ tolerance: parseFloat((e.target as HTMLInputElement).value) || 0.5 })}
						class="w-full rounded bg-gray-700 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label for="box-wall" class="mb-1 block text-xs text-gray-400">Wall</label>
					<input
						id="box-wall"
						type="number"
						step="0.5"
						min="1"
						value={selectedBox.wallThickness}
						onchange={(e) => onUpdateBox({ wallThickness: parseFloat((e.target as HTMLInputElement).value) || 2.0 })}
						class="w-full rounded bg-gray-700 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
					/>
				</div>
				<div class="col-span-2">
					<label for="box-floor" class="mb-1 block text-xs text-gray-400">Floor Thickness</label>
					<input
						id="box-floor"
						type="number"
						step="0.5"
						min="1"
						value={selectedBox.floorThickness}
						onchange={(e) => onUpdateBox({ floorThickness: parseFloat((e.target as HTMLInputElement).value) || 2.0 })}
						class="w-full rounded bg-gray-700 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
					/>
				</div>
			</div>

			<!-- Custom Size -->
			<div class="border-t border-gray-700 pt-3">
				<h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Custom Size</h4>
				<p class="mb-2 text-xs text-gray-500">Leave empty for auto-sizing.</p>
				<div class="space-y-2">
					<div>
						<label for="box-width" class="mb-1 block text-xs text-gray-400">
							Width <span class="text-gray-500">min: {minimums.minWidth.toFixed(1)}</span>
						</label>
						<input
							id="box-width"
							type="number"
							step="0.5"
							min={minimums.minWidth}
							value={selectedBox.customWidth ?? ''}
							onchange={(e) => {
								const v = (e.target as HTMLInputElement).value.trim();
								onUpdateBox({ customWidth: v ? parseFloat(v) : undefined });
							}}
							placeholder="Auto"
							class="w-full rounded bg-gray-700 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label for="box-depth" class="mb-1 block text-xs text-gray-400">
							Depth <span class="text-gray-500">min: {minimums.minDepth.toFixed(1)}</span>
						</label>
						<input
							id="box-depth"
							type="number"
							step="0.5"
							min={minimums.minDepth}
							value={selectedBox.customDepth ?? ''}
							onchange={(e) => {
								const v = (e.target as HTMLInputElement).value.trim();
								onUpdateBox({ customDepth: v ? parseFloat(v) : undefined });
							}}
							placeholder="Auto"
							class="w-full rounded bg-gray-700 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label for="box-height" class="mb-1 block text-xs text-gray-400">
							Height <span class="text-gray-500">min: {minimums.minHeight.toFixed(1)}</span>
						</label>
						<input
							id="box-height"
							type="number"
							step="0.5"
							min={minimums.minHeight}
							value={selectedBox.customHeight ?? ''}
							onchange={(e) => {
								const v = (e.target as HTMLInputElement).value.trim();
								onUpdateBox({ customHeight: v ? parseFloat(v) : undefined });
							}}
							placeholder="Auto"
							class="w-full rounded bg-gray-700 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
						/>
					</div>
				</div>

				<label class="mt-2 flex cursor-pointer items-center gap-2">
					<input
						type="checkbox"
						checked={selectedBox.fillSolidEmpty ?? false}
						onchange={(e) => onUpdateBox({ fillSolidEmpty: (e.target as HTMLInputElement).checked })}
						class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
					/>
					<span class="text-xs text-gray-400">Fill empty space solid</span>
				</label>
			</div>
		</div>
	{:else}
		<div class="flex flex-1 items-center justify-center p-4 text-gray-500">
			<p class="text-sm">No box selected</p>
		</div>
	{/if}
</div>
