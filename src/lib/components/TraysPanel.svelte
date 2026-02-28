<script lang="ts">
	import {
		Input,
		FormControl,
		Spacer,
		Hr,
		Select,
		Link,
		IconButton,
		Icon,
		ColorPicker,
		ColorPickerSwatch,
		Popover
	} from '@tableslayer/ui';
	import { IconX, IconPlus, IconMenu } from '@tabler/icons-svelte';
	import type { Box, Tray } from '$lib/types/project';
	import type { CounterTrayParams, EdgeOrientation } from '$lib/models/counterTray';
	import { getTrayDimensions } from '$lib/models/box';
	import { getProject, getCumulativeTrayLetter, moveTray } from '$lib/stores/project.svelte';

	interface Props {
		selectedBox: Box | null;
		selectedTray: Tray | null;
		onSelectTray: (tray: Tray) => void;
		onAddTray: (boxId: string) => void;
		onDeleteTray: (boxId: string, trayId: string) => void;
		onUpdateTray: (updates: Partial<Omit<Tray, 'id'>>) => void;
		onUpdateParams: (params: CounterTrayParams) => void;
		hideList?: boolean;
	}

	let {
		selectedBox,
		selectedTray,
		onSelectTray,
		onAddTray,
		onDeleteTray,
		onUpdateTray,
		onUpdateParams,
		hideList = false
	}: Props = $props();

	// Get current box index for cumulative tray letters
	let currentBoxIdx = $derived.by(() => {
		const project = getProject();
		if (!selectedBox) return 0;
		return project.boxes.findIndex((b) => b.id === selectedBox.id);
	});

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

	let shapeOptions = $derived(
		selectedTray?.params.customShapes.map((s) => `custom:${s.name}`) ?? []
	);

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

	// Get the tray letter based on cumulative position across all boxes
	let trayLetter = $derived.by(() => {
		const project = getProject();
		if (!selectedBox || !selectedTray) return 'A';
		const boxIdx = project.boxes.findIndex((b) => b.id === selectedBox.id);
		const trayIdx = selectedBox.trays.findIndex((t) => t.id === selectedTray.id);
		if (boxIdx < 0 || trayIdx < 0) return 'A';
		return getCumulativeTrayLetter(project.boxes, boxIdx, trayIdx);
	});

	// Get combined stack reference (top-loaded first, then edge-loaded)
	function getStackRef(type: 'top' | 'edge', index: number): string {
		if (!selectedTray) return '';
		const topCount = selectedTray.params.topLoadedStacks.length;
		const stackNum = type === 'top' ? index + 1 : topCount + index + 1;
		return `${trayLetter}${stackNum}`;
	}

	function updateParam<K extends keyof CounterTrayParams>(key: K, value: CounterTrayParams[K]) {
		if (selectedTray) {
			onUpdateParams({ ...selectedTray.params, [key]: value });
		}
	}

	// Compute minimum tray width for display
	let minTrayWidth = $derived.by(() => {
		if (!selectedTray) return 0;
		// Use trayWidthOverride=0 to get the auto-calculated width
		const paramsWithoutOverride = { ...selectedTray.params, trayWidthOverride: 0 };
		return getTrayDimensions(paramsWithoutOverride).width;
	});

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
			topLoadedStacks: [...selectedTray.params.topLoadedStacks, ['custom:Square', 10, undefined]]
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
				['custom:Square', 10, 'lengthwise', undefined]
			]
		});
	}

	function removeEdgeLoadedStack(index: number) {
		if (!selectedTray) return;
		const newStacks = selectedTray.params.edgeLoadedStacks.filter((_, i) => i !== index);
		onUpdateParams({ ...selectedTray.params, edgeLoadedStacks: newStacks });
	}

	// Debounced color update to avoid excessive saves during color picker drag
	let colorUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
	function handleColorUpdate(hex: string) {
		if (colorUpdateTimeout) {
			clearTimeout(colorUpdateTimeout);
		}
		colorUpdateTimeout = setTimeout(() => {
			onUpdateTray({ color: hex });
			colorUpdateTimeout = null;
		}, 150);
	}
</script>

<div class="traysPanel">
	<!-- Tray List -->
	{#if selectedBox && !hideList}
		<div class="panelList">
			<div class="panelListHeader">
				<span class="panelListTitle">
					Trays {#if selectedBox}within {selectedBox.name}{/if}
				</span>

				<IconButton
					onclick={() => onAddTray(selectedBox.id)}
					title="Add new tray to box"
					size="sm"
					variant="ghost"
				>
					<Icon Icon={IconPlus} />
				</IconButton>
			</div>
			<div class="panelListItems">
				{#each selectedBox.trays as tray, trayIdx (tray.id)}
					{@const stats = getTrayStats(tray)}
					{@const letter = getCumulativeTrayLetter(getProject().boxes, currentBoxIdx, trayIdx)}
					<div
						class="listItem {selectedTray?.id === tray.id ? 'listItem--selected' : ''}"
						onclick={() => onSelectTray(tray)}
						role="button"
						tabindex="0"
						onkeydown={(e) => e.key === 'Enter' && onSelectTray(tray)}
						title="{tray.name}, tray {letter}, {stats.counters} counters in {stats.stacks} stacks"
					>
						<span style="overflow: hidden; text-overflow: ellipsis;">{tray.name}</span>
						<span style="display: flex; align-items: center; gap: 0.25rem;">
							<span class="trayStats">{letter}: {stats.counters}c in {stats.stacks}s</span>
							{#if selectedBox.trays.length > 1}
								<IconButton
									onclick={(e: MouseEvent) => {
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
			<div class="panelFormSection">
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

				<Spacer size="1rem" />

				<!-- Move to Box -->
				<FormControl label="Box" name="moveToBox">
					{#snippet input({ inputProps })}
						<Select
							{...inputProps}
							selected={selectedBox ? [selectedBox.id] : []}
							options={[
								...getProject().boxes.map((box) => ({ value: box.id, label: box.name })),
								{ value: 'new', label: 'Create new box' }
							]}
							onSelectedChange={(selected) => {
								if (selected[0] && selectedTray && selected[0] !== selectedBox?.id) {
									moveTray(selectedTray.id, selected[0]);
								}
							}}
						/>
					{/snippet}
				</FormControl>

				<Spacer size="1rem" />

				<!-- Color -->
				<FormControl label="Color" name="trayColor">
					{#snippet start()}
						<Popover>
							{#snippet trigger()}
								<ColorPickerSwatch color={selectedTray.color} />
							{/snippet}
							{#snippet content()}
								<ColorPicker
									showOpacity={false}
									hex={selectedTray.color}
									onUpdate={(colorData) => handleColorUpdate(colorData.hex)}
								/>
							{/snippet}
						</Popover>
					{/snippet}
					{#snippet input({ inputProps })}
						<Input
							{...inputProps}
							value={selectedTray.color}
							oninput={(e) => handleColorUpdate(e.currentTarget.value)}
						/>
					{/snippet}
				</FormControl>
			</div>

			<Hr />

			<div class="panelFormSection">
				<!-- Top-Loaded Stacks -->
				<section class="section">
					<h3 class="sectionTitle">Top-Loaded Stacks</h3>
					<Spacer size="0.5rem" />
					<div class="stackList">
						{#each selectedTray.params.topLoadedStacks as stack, index (index)}
							<div
								class="stackRow {draggedIndex === index && draggedType === 'top'
									? 'stackRow--dragging'
									: ''} {dragOverIndex === index && draggedType === 'top' && draggedIndex !== index
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
									<Icon Icon={IconMenu} size="1rem" color="var(--fgMuted)" />
								</span>
								<div class="stackLabelInput">
									<span class="stackRef">{getStackRef('top', index)}</span>
									<Input
										type="text"
										placeholder="Label"
										value={stack[2] ?? ''}
										onchange={(e) => updateTopLoadedStack(index, 'label', e.currentTarget.value)}
									/>
								</div>
								<div class="stackSelect">
									<Select
										selected={[stack[0]]}
										options={shapeOptions.map((s) => ({ value: s, label: getShapeDisplayName(s) }))}
										onSelectedChange={(selected) =>
											updateTopLoadedStack(index, 'shape', selected[0])}
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
						<Spacer size="0.5rem" />
						<Link as="button" onclick={addTopLoadedStack}>Add top-loaded stack</Link>
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
								class="stackRow {draggedIndex === index && draggedType === 'edge'
									? 'stackRow--dragging'
									: ''} {dragOverIndex === index && draggedType === 'edge' && draggedIndex !== index
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
									<Icon Icon={IconMenu} size="sm" color="var(--fgMuted)" />
								</span>
								<div class="stackLabelInput">
									<span class="stackRef">{getStackRef('edge', index)}</span>
									<Input
										type="text"
										placeholder="Label"
										value={stack[3] ?? ''}
										onchange={(e) => updateEdgeLoadedStack(index, 'label', e.currentTarget.value)}
									/>
								</div>
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
						<Spacer size="0.5rem" />
						<Link as="button" onclick={addEdgeLoadedStack}>Add edge-loaded stack</Link>
					</div>
				</section>
			</div>

			<Hr />

			<div class="panelFormSection">
				<!-- Tray Settings -->
				<section class="section">
					<h3 class="sectionTitle">Tray Settings</h3>
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

				<!-- Custom Width -->
				<section class="section">
					<h3 class="sectionTitle">Custom width</h3>
					<Spacer size="0.5rem" />
					<div class="formGrid">
						<FormControl
							label="Tray width (min: {minTrayWidth.toFixed(1)})"
							name="trayWidthOverride"
							class="formGrid__spanTwo"
						>
							{#snippet input({ inputProps })}
								<Input
									{...inputProps}
									type="number"
									step="1"
									placeholder="Auto"
									value={selectedTray.params.trayWidthOverride || ''}
									onchange={(e) => {
										const val = e.currentTarget.value;
										updateParam('trayWidthOverride', val === '' ? 0 : parseFloat(val));
									}}
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
			</div>
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
		padding: 0.75rem 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.panelFormSection {
		padding: 0 0.75rem;
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
		position: relative;
	}

	.stackRow--dragging {
		opacity: 0.4;
		background: var(--contrastLow);
	}

	.stackRow--dragover::before {
		content: '';
		position: absolute;
		top: -2px;
		left: 0;
		right: 0;
		height: 2px;
		background: var(--fgPrimary);
		border-radius: 1px;
	}

	.dragHandle {
		display: flex;
		cursor: grab;
		color: var(--fgMuted);
		width: 1rem;
		min-width: 1rem;
		min-height: 2rem;
		padding: 0.5rem;
	}

	.dragHandle:active {
		cursor: grabbing;
	}

	.stackRow:has(.dragHandle:hover) {
		border: dashed 1px var(--contrastLow);
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

	.stackLabelInput {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
		min-width: 0;
	}

	.stackRef {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		color: var(--fgMuted);
		width: 1.75rem;
		text-align: right;
		flex-shrink: 0;
	}

	.trayStats {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--fgMuted);
	}
</style>
