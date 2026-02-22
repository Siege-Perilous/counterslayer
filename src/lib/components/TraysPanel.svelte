<script lang="ts">
	import type { Box, Tray } from '$lib/types/project';
	import type { CounterTrayParams, EdgeOrientation } from '$lib/models/counterTray';

	interface Props {
		selectedBox: Box | null;
		selectedTray: Tray | null;
		onSelectTray: (tray: Tray) => void;
		onAddTray: (boxId: string) => void;
		onDeleteTray: (boxId: string, trayId: string) => void;
		onUpdateTray: (updates: Partial<Omit<Tray, 'id'>>) => void;
		onUpdateParams: (params: CounterTrayParams) => void;
	}

	let {
		selectedBox,
		selectedTray,
		onSelectTray,
		onAddTray,
		onDeleteTray,
		onUpdateTray,
		onUpdateParams
	}: Props = $props();

	// Drag and drop state
	let draggedIndex: number | null = $state(null);
	let draggedType: 'top' | 'edge' | null = $state(null);
	let dragOverIndex: number | null = $state(null);

	function handleDragStart(e: DragEvent, index: number, type: 'top' | 'edge') {
		draggedIndex = index;
		draggedType = type;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', index.toString());
		}
	}

	function handleDragOver(e: DragEvent, index: number, type: 'top' | 'edge') {
		e.preventDefault();
		if (draggedType === type) {
			dragOverIndex = index;
		}
	}

	function handleDragEnd() {
		draggedIndex = null;
		draggedType = null;
		dragOverIndex = null;
	}

	function handleDrop(e: DragEvent, targetIndex: number, type: 'top' | 'edge') {
		e.preventDefault();
		if (draggedIndex === null || draggedType !== type || !selectedTray) return;

		if (type === 'top') {
			const newStacks = [...selectedTray.params.topLoadedStacks];
			const [removed] = newStacks.splice(draggedIndex, 1);
			newStacks.splice(targetIndex, 0, removed);
			onUpdateParams({ ...selectedTray.params, topLoadedStacks: newStacks });
		} else {
			const newStacks = [...selectedTray.params.edgeLoadedStacks];
			const [removed] = newStacks.splice(draggedIndex, 1);
			newStacks.splice(targetIndex, 0, removed);
			onUpdateParams({ ...selectedTray.params, edgeLoadedStacks: newStacks });
		}

		handleDragEnd();
	}

	const builtinShapes = ['square', 'hex', 'circle', 'triangle'] as const;
	let shapeOptions = $derived([
		...builtinShapes,
		...(selectedTray?.params.customShapes.map((s) => `custom:${s.name}`) ?? [])
	]);

	const orientationOptions: EdgeOrientation[] = ['lengthwise', 'crosswise'];

	function getTrayStats(tray: Tray): { stacks: number; counters: number } {
		const topCount = tray.params.topLoadedStacks.reduce((sum, s) => sum + s[1], 0);
		const edgeCount = tray.params.edgeLoadedStacks.reduce((sum, s) => sum + s[1], 0);
		return {
			stacks: tray.params.topLoadedStacks.length + tray.params.edgeLoadedStacks.length,
			counters: topCount + edgeCount
		};
	}

	function getShapeDisplayName(shapeRef: string): string {
		if (shapeRef.startsWith('custom:')) {
			return shapeRef.substring(7);
		}
		return shapeRef;
	}

	function updateParam<K extends keyof CounterTrayParams>(key: K, value: CounterTrayParams[K]) {
		if (selectedTray) {
			onUpdateParams({ ...selectedTray.params, [key]: value });
		}
	}

	// Top-loaded stack handlers
	function updateTopLoadedStack(
		index: number,
		field: 'shape' | 'count' | 'label',
		value: string | number
	) {
		if (!selectedTray) return;
		const newStacks = [...selectedTray.params.topLoadedStacks];
		const current = newStacks[index];
		if (field === 'shape') {
			newStacks[index] = [value as string, current[1], current[2]];
		} else if (field === 'count') {
			newStacks[index] = [current[0], value as number, current[2]];
		} else {
			newStacks[index] = [current[0], current[1], (value as string) || undefined];
		}
		onUpdateParams({ ...selectedTray.params, topLoadedStacks: newStacks });
	}

	function addTopLoadedStack() {
		if (!selectedTray) return;
		onUpdateParams({
			...selectedTray.params,
			topLoadedStacks: [...selectedTray.params.topLoadedStacks, ['square', 10, undefined]]
		});
	}

	function removeTopLoadedStack(index: number) {
		if (!selectedTray) return;
		const newStacks = selectedTray.params.topLoadedStacks.filter((_, i) => i !== index);
		onUpdateParams({ ...selectedTray.params, topLoadedStacks: newStacks });
	}

	// Edge-loaded stack handlers
	function updateEdgeLoadedStack(
		index: number,
		field: 'shape' | 'count' | 'orientation' | 'label',
		value: string | number
	) {
		if (!selectedTray) return;
		const newStacks = [...selectedTray.params.edgeLoadedStacks];
		const current = newStacks[index];
		if (field === 'shape') {
			newStacks[index] = [value as string, current[1], current[2], current[3]];
		} else if (field === 'count') {
			newStacks[index] = [current[0], value as number, current[2], current[3]];
		} else if (field === 'orientation') {
			newStacks[index] = [current[0], current[1], value as EdgeOrientation, current[3]];
		} else {
			newStacks[index] = [current[0], current[1], current[2], (value as string) || undefined];
		}
		onUpdateParams({ ...selectedTray.params, edgeLoadedStacks: newStacks });
	}

	function addEdgeLoadedStack() {
		if (!selectedTray) return;
		onUpdateParams({
			...selectedTray.params,
			edgeLoadedStacks: [
				...selectedTray.params.edgeLoadedStacks,
				['square', 10, 'lengthwise', undefined]
			]
		});
	}

	function removeEdgeLoadedStack(index: number) {
		if (!selectedTray) return;
		const newStacks = selectedTray.params.edgeLoadedStacks.filter((_, i) => i !== index);
		onUpdateParams({ ...selectedTray.params, edgeLoadedStacks: newStacks });
	}
</script>

<div class="flex h-full flex-col overflow-hidden">
	<!-- Tray List -->
	{#if selectedBox}
		<div class="border-b border-gray-700 p-2">
			<div class="mb-2 flex items-center justify-between px-1">
				<span class="text-xs font-semibold tracking-wide text-gray-400 uppercase">Trays</span>
				<button
					onclick={() => onAddTray(selectedBox.id)}
					class="rounded bg-gray-700 px-2 py-0.5 text-xs hover:bg-gray-600"
				>
					+ New
				</button>
			</div>
			<div class="max-h-24 space-y-1 overflow-y-auto">
				{#each selectedBox.trays as tray (tray.id)}
					{@const stats = getTrayStats(tray)}
					<div
						class="flex cursor-pointer items-center justify-between rounded px-2 py-1 text-sm {selectedTray?.id ===
						tray.id
							? 'bg-blue-600'
							: 'hover:bg-gray-700'}"
						onclick={() => onSelectTray(tray)}
						role="button"
						tabindex="0"
						onkeydown={(e) => e.key === 'Enter' && onSelectTray(tray)}
					>
						<span class="truncate">{tray.name}</span>
						<span class="flex items-center gap-1">
							<span class="text-xs text-gray-400">{stats.counters} in {stats.stacks}</span>
							{#if selectedBox.trays.length > 1}
								<button
									onclick={(e) => {
										e.stopPropagation();
										onDeleteTray(selectedBox.id, tray.id);
									}}
									class="rounded px-1 text-xs text-gray-400 hover:bg-red-600 hover:text-white"
									title="Delete tray"
								>
									&times;
								</button>
							{/if}
						</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Tray Settings -->
	{#if selectedTray}
		<div class="flex-1 space-y-4 overflow-y-auto p-3">
			<!-- Name -->
			<label class="block">
				<span class="mb-1 block text-xs text-gray-400">Name</span>
				<input
					type="text"
					value={selectedTray.name}
					onchange={(e) => onUpdateTray({ name: (e.currentTarget as HTMLInputElement).value })}
					class="w-full rounded bg-gray-700 px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500 focus:outline-none"
				/>
			</label>

			<!-- Tray Settings -->
			<section>
				<h3 class="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">Settings</h3>
				<div class="grid grid-cols-2 gap-2">
					<label class="block">
						<span class="text-xs text-gray-400">Clearance</span>
						<input
							type="number"
							step="0.1"
							value={selectedTray.params.clearance}
							onchange={(e) => updateParam('clearance', parseFloat(e.currentTarget.value))}
							class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
						/>
					</label>
					<label class="block">
						<span class="text-xs text-gray-400">Wall</span>
						<input
							type="number"
							step="0.1"
							value={selectedTray.params.wallThickness}
							onchange={(e) => updateParam('wallThickness', parseFloat(e.currentTarget.value))}
							class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
						/>
					</label>
					<label class="block">
						<span class="text-xs text-gray-400">Floor</span>
						<input
							type="number"
							step="0.1"
							value={selectedTray.params.floorThickness}
							onchange={(e) => updateParam('floorThickness', parseFloat(e.currentTarget.value))}
							class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
						/>
					</label>
					<label class="block">
						<span class="text-xs text-gray-400">Rim</span>
						<input
							type="number"
							step="0.1"
							value={selectedTray.params.rimHeight}
							onchange={(e) => updateParam('rimHeight', parseFloat(e.currentTarget.value))}
							class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
						/>
					</label>
					<label class="block">
						<span class="text-xs text-gray-400">Cutout %</span>
						<input
							type="number"
							step="0.05"
							min="0"
							max="1"
							value={selectedTray.params.cutoutRatio}
							onchange={(e) => updateParam('cutoutRatio', parseFloat(e.currentTarget.value))}
							class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
						/>
					</label>
					<label class="block">
						<span class="text-xs text-gray-400">Cutout Max</span>
						<input
							type="number"
							step="1"
							value={selectedTray.params.cutoutMax}
							onchange={(e) => updateParam('cutoutMax', parseFloat(e.currentTarget.value))}
							class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
						/>
					</label>
				</div>
			</section>

			<!-- Tray Override -->
			<section>
				<h3 class="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">Override</h3>
				<div class="grid grid-cols-2 gap-2">
					<label class="col-span-2 block">
						<span class="text-xs text-gray-400">Length (0 = auto)</span>
						<input
							type="number"
							step="1"
							value={selectedTray.params.trayLengthOverride}
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
							value={selectedTray.params.extraTrayCols}
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
							value={selectedTray.params.extraTrayRows}
							onchange={(e) => updateParam('extraTrayRows', parseInt(e.currentTarget.value))}
							class="mt-1 block w-full rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
						/>
					</label>
				</div>
			</section>

			<!-- Top-Loaded Stacks -->
			<section>
				<h3 class="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">
					Top-Loaded Stacks
				</h3>
				<div class="space-y-1">
					{#each selectedTray.params.topLoadedStacks as stack, index (index)}
						<div
							class="flex items-center gap-1 rounded {dragOverIndex === index &&
							draggedType === 'top'
								? 'bg-blue-900/30'
								: ''}"
							role="listitem"
							ondragover={(e) => handleDragOver(e, index, 'top')}
							ondrop={(e) => handleDrop(e, index, 'top')}
						>
							<span
								class="cursor-grab px-1 text-gray-500 hover:text-gray-300"
								title="Drag to reorder"
								draggable="true"
								ondragstart={(e) => handleDragStart(e, index, 'top')}
								ondragend={handleDragEnd}
								role="button"
								tabindex="0"
							>
								&#x2630;
							</span>
							<input
								type="text"
								placeholder="Label"
								value={stack[2] ?? ''}
								onchange={(e) => updateTopLoadedStack(index, 'label', e.currentTarget.value)}
								class="flex-1 rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
								title="Optional label for organization"
							/>
							<select
								value={stack[0]}
								onchange={(e) => updateTopLoadedStack(index, 'shape', e.currentTarget.value)}
								class="w-16 rounded border-gray-600 bg-gray-700 px-1 py-1 text-sm"
							>
								{#each shapeOptions as shapeOpt (shapeOpt)}
									<option value={shapeOpt}>{getShapeDisplayName(shapeOpt)}</option>
								{/each}
							</select>
							<input
								type="number"
								min="1"
								value={stack[1]}
								onchange={(e) =>
									updateTopLoadedStack(index, 'count', parseInt(e.currentTarget.value))}
								class="w-14 rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
							/>
							<button
								onclick={() => removeTopLoadedStack(index)}
								class="rounded px-1.5 py-1 text-red-400 hover:bg-red-900/30"
							>
								&times;
							</button>
						</div>
					{/each}
					<button
						onclick={addTopLoadedStack}
						class="w-full rounded border border-dashed border-gray-600 px-2 py-1 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-300"
					>
						+ Add Stack
					</button>
				</div>
			</section>

			<!-- Edge-Loaded Stacks -->
			<section>
				<h3 class="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">
					Edge-Loaded Stacks
				</h3>
				<div class="space-y-1">
					{#each selectedTray.params.edgeLoadedStacks as stack, index (index)}
						<div
							class="flex items-center gap-1 rounded {dragOverIndex === index &&
							draggedType === 'edge'
								? 'bg-blue-900/30'
								: ''}"
							role="listitem"
							ondragover={(e) => handleDragOver(e, index, 'edge')}
							ondrop={(e) => handleDrop(e, index, 'edge')}
						>
							<span
								class="cursor-grab px-1 text-gray-500 hover:text-gray-300"
								title="Drag to reorder"
								draggable="true"
								ondragstart={(e) => handleDragStart(e, index, 'edge')}
								ondragend={handleDragEnd}
								role="button"
								tabindex="0"
							>
								&#x2630;
							</span>
							<input
								type="text"
								placeholder="Label"
								value={stack[3] ?? ''}
								onchange={(e) => updateEdgeLoadedStack(index, 'label', e.currentTarget.value)}
								class="flex-1 rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
								title="Optional label for organization"
							/>
							<select
								value={stack[0]}
								onchange={(e) => updateEdgeLoadedStack(index, 'shape', e.currentTarget.value)}
								class="w-16 rounded border-gray-600 bg-gray-700 px-1 py-1 text-sm"
							>
								{#each shapeOptions as shapeOpt (shapeOpt)}
									<option value={shapeOpt}>{getShapeDisplayName(shapeOpt)}</option>
								{/each}
							</select>
							<input
								type="number"
								min="1"
								value={stack[1]}
								onchange={(e) =>
									updateEdgeLoadedStack(index, 'count', parseInt(e.currentTarget.value))}
								class="w-12 rounded border-gray-600 bg-gray-700 px-2 py-1 text-sm"
							/>
							<select
								value={stack[2] ?? 'lengthwise'}
								onchange={(e) => updateEdgeLoadedStack(index, 'orientation', e.currentTarget.value)}
								class="w-20 rounded border-gray-600 bg-gray-700 px-1 py-1 text-xs"
							>
								{#each orientationOptions as orientation (orientation)}
									<option value={orientation}>{orientation.slice(0, 6)}</option>
								{/each}
							</select>
							<button
								onclick={() => removeEdgeLoadedStack(index)}
								class="rounded px-1.5 py-1 text-red-400 hover:bg-red-900/30"
							>
								&times;
							</button>
						</div>
					{/each}
					<button
						onclick={addEdgeLoadedStack}
						class="w-full rounded border border-dashed border-gray-600 px-2 py-1 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-300"
					>
						+ Add Stack
					</button>
				</div>
			</section>
		</div>
	{:else}
		<div class="flex flex-1 items-center justify-center p-4 text-gray-500">
			<p class="text-sm">No tray selected</p>
		</div>
	{/if}
</div>
