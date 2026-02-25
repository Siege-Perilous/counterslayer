<script lang="ts">
	import { Input, FormControl, Spacer, Hr, Select, Link, IconButton, Icon } from '@tableslayer/ui';
	import { IconX, IconPlus, IconMenu } from '@tabler/icons-svelte';
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

<div class="traysPanel">
	<!-- Tray List -->
	{#if selectedBox}
		<div class="panelList">
			<div class="panelListHeader">
				<span class="panelListTitle">
					Trays {#if selectedBox}within {selectedBox.name}{/if}
				</span>

				<IconButton
					onclick={() => onAddTray(selectedBox.id)}
					title="Delete box and all its trays"
					size="sm"
					variant="ghost"
				>
					<Icon Icon={IconPlus} />
				</IconButton>
			</div>
			<div class="panelListItems">
				{#each selectedBox.trays as tray (tray.id)}
					{@const stats = getTrayStats(tray)}
					<div
						class="listItem {selectedTray?.id === tray.id ? 'listItem--selected' : ''}"
						onclick={() => onSelectTray(tray)}
						role="button"
						tabindex="0"
						onkeydown={(e) => e.key === 'Enter' && onSelectTray(tray)}
					>
						<span style="overflow: hidden; text-overflow: ellipsis;">{tray.name}</span>
						<span style="display: flex; align-items: center; gap: 0.25rem;">
							<span style="font-size: 0.75rem; color: var(--fgMuted);"
								>{stats.counters} in {stats.stacks}</span
							>
							{#if selectedBox.trays.length > 1}
								<IconButton
									onclick={(e) => {
										e.stopPropagation();
										onDeleteTray(selectedBox.id, tray.id);
									}}
									title="Delete tray"
									size="sm"
									variant="ghost"
								>
									<Icon color="var(--fgMuted)" Icon={IconX} />
								</IconButton>
							{/if}
						</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Tray Settings -->
	{#if selectedTray}
		<div class="panelForm">
			<!-- Name -->
			<FormControl label="Name" name="trayName">
				{#snippet input({ inputProps })}
					<Input
						{...inputProps}
						type="text"
						value={selectedTray.name}
						onchange={(e) => onUpdateTray({ name: (e.currentTarget as HTMLInputElement).value })}
					/>
				{/snippet}
			</FormControl>

			<Spacer size="0.75rem" />
			<Hr />
			<Spacer size="0.75rem" />

			<!-- Tray Settings -->
			<section class="section">
				<h3 class="sectionTitle">Settings</h3>
				<Spacer size="0.5rem" />
				<div class="formGrid">
					<FormControl label="Clearance" name="clearance">
						{#snippet input({ inputProps })}
							<Input
								{...inputProps}
								type="number"
								step="0.1"
								value={selectedTray.params.clearance}
								onchange={(e) => updateParam('clearance', parseFloat(e.currentTarget.value))}
							/>
						{/snippet}
						{#snippet end()}mm{/snippet}
					</FormControl>
					<FormControl label="Wall" name="wallThickness">
						{#snippet input({ inputProps })}
							<Input
								{...inputProps}
								type="number"
								step="0.1"
								value={selectedTray.params.wallThickness}
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
								value={selectedTray.params.floorThickness}
								onchange={(e) => updateParam('floorThickness', parseFloat(e.currentTarget.value))}
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
								value={selectedTray.params.rimHeight}
								onchange={(e) => updateParam('rimHeight', parseFloat(e.currentTarget.value))}
							/>
						{/snippet}
						{#snippet end()}mm{/snippet}
					</FormControl>
					<FormControl label="Cutout %" name="cutoutRatio">
						{#snippet input({ inputProps })}
							<Input
								{...inputProps}
								type="number"
								step="0.05"
								min="0"
								max="1"
								value={selectedTray.params.cutoutRatio}
								onchange={(e) => updateParam('cutoutRatio', parseFloat(e.currentTarget.value))}
							/>
						{/snippet}
					</FormControl>
					<FormControl label="Cutout max" name="cutoutMax">
						{#snippet input({ inputProps })}
							<Input
								{...inputProps}
								type="number"
								step="1"
								value={selectedTray.params.cutoutMax}
								onchange={(e) => updateParam('cutoutMax', parseFloat(e.currentTarget.value))}
							/>
						{/snippet}
						{#snippet end()}mm{/snippet}
					</FormControl>
				</div>
			</section>

			<Spacer size="0.5rem" />

			<!-- Tray Override -->
			<section class="section">
				<h3 class="sectionTitle">Custom length</h3>
				<Spacer size="0.5rem" />
				<div class="formGrid">
					<FormControl
						label="Tray length (0 = auto)"
						name="trayLengthOverride"
						class="formGrid__spanTwo"
					>
						{#snippet input({ inputProps })}
							<Input
								{...inputProps}
								type="number"
								step="1"
								value={selectedTray.params.trayLengthOverride}
								onchange={(e) =>
									updateParam('trayLengthOverride', parseFloat(e.currentTarget.value))}
							/>
						{/snippet}
						{#snippet end()}mm{/snippet}
					</FormControl>
					<FormControl label="Extra cols" name="extraTrayCols">
						{#snippet input({ inputProps })}
							<Input
								{...inputProps}
								type="number"
								step="1"
								min="1"
								value={selectedTray.params.extraTrayCols}
								onchange={(e) => updateParam('extraTrayCols', parseInt(e.currentTarget.value))}
							/>
						{/snippet}
					</FormControl>
					<FormControl label="Extra rows" name="extraTrayRows">
						{#snippet input({ inputProps })}
							<Input
								{...inputProps}
								type="number"
								step="1"
								min="1"
								value={selectedTray.params.extraTrayRows}
								onchange={(e) => updateParam('extraTrayRows', parseInt(e.currentTarget.value))}
							/>
						{/snippet}
					</FormControl>
				</div>
			</section>

			<Spacer size="0.5rem" />

			<!-- Top-Loaded Stacks -->
			<section class="section">
				<h3 class="sectionTitle">Top-Loaded Stacks</h3>
				<Spacer size="0.5rem" />
				<div class="stackList">
					{#each selectedTray.params.topLoadedStacks as stack, index (index)}
						<div
							class="stackRow {dragOverIndex === index && draggedType === 'top'
								? 'stackRow--dragover'
								: ''}"
							role="listitem"
							ondragover={(e) => handleDragOver(e, index, 'top')}
							ondrop={(e) => handleDrop(e, index, 'top')}
						>
							<span
								class="dragHandle"
								title="Drag to reorder"
								draggable="true"
								ondragstart={(e) => handleDragStart(e, index, 'top')}
								ondragend={handleDragEnd}
								role="button"
								tabindex="0"
							>
								<Icon Icon={IconMenu} size="sm" color="var(--fgMuted)" />
							</span>
							<Input
								type="text"
								placeholder="Label"
								value={stack[2] ?? ''}
								onchange={(e) => updateTopLoadedStack(index, 'label', e.currentTarget.value)}
								style="flex: 1; min-width: 0;"
							/>
							<div class="stackSelect">
								<Select
									selected={[stack[0]]}
									options={shapeOptions.map((s) => ({ value: s, label: getShapeDisplayName(s) }))}
									onSelectedChange={(selected) => updateTopLoadedStack(index, 'shape', selected[0])}
								/>
							</div>
							<Input
								type="number"
								min="1"
								value={stack[1]}
								onchange={(e) =>
									updateTopLoadedStack(index, 'count', parseInt(e.currentTarget.value))}
								style="width: 3.5rem;"
							/>
							<IconButton
								variant="ghost"
								onclick={() => removeTopLoadedStack(index)}
								title="Remove stack"
								color="var(--fgMuted)"
							>
								<Icon Icon={IconX} color="var(--fgMuted)" />
							</IconButton>
						</div>
					{/each}
					<Link as="button" onclick={addTopLoadedStack}>+ Add Stack</Link>
				</div>
			</section>

			<Spacer size="0.5rem" />

			<!-- Edge-Loaded Stacks -->
			<section class="section">
				<h3 class="sectionTitle">Edge-Loaded Stacks</h3>
				<Spacer size="0.5rem" />
				<div class="stackList">
					{#each selectedTray.params.edgeLoadedStacks as stack, index (index)}
						<div
							class="stackRow {dragOverIndex === index && draggedType === 'edge'
								? 'stackRow--dragover'
								: ''}"
							role="listitem"
							ondragover={(e) => handleDragOver(e, index, 'edge')}
							ondrop={(e) => handleDrop(e, index, 'edge')}
						>
							<span
								class="dragHandle"
								title="Drag to reorder"
								draggable="true"
								ondragstart={(e) => handleDragStart(e, index, 'edge')}
								ondragend={handleDragEnd}
								role="button"
								tabindex="0"
							>
								<Icon Icon={IconMenu2} size="sm" color="var(--fgMuted)" />
							</span>
							<Input
								type="text"
								placeholder="Label"
								value={stack[3] ?? ''}
								onchange={(e) => updateEdgeLoadedStack(index, 'label', e.currentTarget.value)}
								style="flex: 1; min-width: 0;"
							/>
							<div class="stackSelect">
								<Select
									selected={[stack[0]]}
									options={shapeOptions.map((s) => ({ value: s, label: getShapeDisplayName(s) }))}
									onSelectedChange={(selected) =>
										updateEdgeLoadedStack(index, 'shape', selected[0])}
								/>
							</div>
							<Input
								type="number"
								min="1"
								value={stack[1]}
								onchange={(e) =>
									updateEdgeLoadedStack(index, 'count', parseInt(e.currentTarget.value))}
								style="width: 3rem;"
							/>
							<div class="stackSelectSmall">
								<Select
									selected={[stack[2] ?? 'lengthwise']}
									options={orientationOptions.map((o) => ({ value: o, label: o.slice(0, 6) }))}
									onSelectedChange={(selected) =>
										updateEdgeLoadedStack(index, 'orientation', selected[0])}
								/>
							</div>
							<IconButton
								onclick={() => removeEdgeLoadedStack(index)}
								title="Remove stack"
								variant="ghost"
							>
								<Icon Icon={IconX} color="var(--fgMuted)" />
							</IconButton>
						</div>
					{/each}
					<Link as="button" onclick={addEdgeLoadedStack}>+ Add Stack</Link>
				</div>
			</section>
		</div>
	{:else}
		<div class="emptyState">
			<p class="emptyStateText">No tray selected</p>
		</div>
	{/if}
</div>

<style>
	.traysPanel {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	.panelList {
		padding: 0.5rem;
		border-bottom: var(--borderThin);
		background: var(--contrastLow);
	}

	.panelListHeader {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 0.25rem;
		margin-bottom: 0.5rem;
	}

	.panelListTitle {
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--fgMuted);
	}

	.panelListItems {
		max-height: 10rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.listItem {
		display: flex;
		cursor: pointer;
		align-items: center;
		justify-content: space-between;
		padding: 0.25rem;
		border-radius: var(--radius-2);
		font-size: 0.875rem;
	}

	.listItem:hover {
		background: var(--contrastMedium);
	}

	.listItem--selected {
		color: var(--fgPrimary);
		font-weight: 600;
	}

	.panelForm {
		flex: 1;
		overflow-y: auto;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
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
	}

	.dragHandle {
		display: flex;
		align-items: center;
		cursor: grab;
		color: var(--fgMuted);
		width: 2rem;
		padding: 0 0.5rem;
	}

	.stackRow:has(.dragHandle:hover) {
		border: dashed 1px var(--fgPrimary);
		background: var(--contrastEmpty);
	}

	.dragHandle:hover {
		color: var(--fg);
	}

	.stackSelect {
		width: 7rem;
		flex-shrink: 0;
	}

	.stackSelectSmall {
		width: 6rem;
		flex-shrink: 0;
	}

	.emptyState {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		color: var(--fgMuted);
	}

	.emptyStateText {
		font-size: 0.875rem;
	}
</style>
