<script lang="ts">
	import { Input, InputCheckbox, FormControl, Spacer, Hr, IconButton, Icon } from '@tableslayer/ui';
	import { IconX, IconPlus } from '@tabler/icons-svelte';
	import type { Box, Project } from '$lib/types/project';
	import { calculateMinimumBoxDimensions, getLidHeight } from '$lib/models/box';

	interface Props {
		project: Project;
		selectedBox: Box | null;
		onSelectBox: (box: Box) => void;
		onAddBox: () => void;
		onDeleteBox: (boxId: string) => void;
		onUpdateBox: (updates: Partial<Omit<Box, 'id' | 'trays'>>) => void;
		hideList?: boolean;
	}

	let {
		project,
		selectedBox,
		onSelectBox,
		onAddBox,
		onDeleteBox,
		onUpdateBox,
		hideList = false
	}: Props = $props();

	const minimums = $derived(
		selectedBox
			? calculateMinimumBoxDimensions(selectedBox)
			: { minWidth: 0, minDepth: 0, minHeight: 0 }
	);

	// Lid height for total height calculations
	const lidHeight = $derived(selectedBox ? getLidHeight(selectedBox) : 0);

	// Minimum total height (box + lid) for display
	const minTotalHeight = $derived(minimums.minHeight + lidHeight);

	// Display value for height input: convert box height to total height
	const displayTotalHeight = $derived(
		selectedBox?.customBoxHeight !== undefined ? selectedBox.customBoxHeight + lidHeight : undefined
	);
</script>

<div class="boxesPanel">
	<!-- Box List -->
	{#if !hideList}
		<div class="panelList">
			<div class="panelListHeader">
				<span class="panelListTitle">Boxes</span>
				<IconButton onclick={onAddBox} title="Add new box" size="sm" variant="ghost">
					<Icon Icon={IconPlus} />
				</IconButton>
			</div>
			<div class="panelListItems">
				{#each project.boxes as box (box.id)}
					<div
						class="listItem {selectedBox?.id === box.id ? 'listItem--selected' : ''}"
						onclick={() => onSelectBox(box)}
						role="button"
						tabindex="0"
						onkeydown={(e) => e.key === 'Enter' && onSelectBox(box)}
					>
						<span style="overflow: hidden; text-overflow: ellipsis;">{box.name}</span>
						{#if project.boxes.length > 1}
							<IconButton
								onclick={(e: MouseEvent) => {
									e.stopPropagation();
									onDeleteBox(box.id);
								}}
								title="Delete box"
								size="sm"
								variant="ghost"
							>
								<Icon color="var(--fgMuted)" Icon={IconX} />
							</IconButton>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Box Settings -->
	{#if selectedBox}
		<div class="panelForm">
			<div class="panelFormSection">
				<FormControl label="Name" name="boxName">
					{#snippet input({ inputProps })}
						<Input
							{...inputProps}
							type="text"
							value={selectedBox.name}
							onchange={(e) => onUpdateBox({ name: (e.target as HTMLInputElement).value })}
						/>
					{/snippet}
				</FormControl>

				<Spacer size="0.75rem" />

				<div class="formGrid">
					<FormControl label="Tolerance" name="tolerance">
						{#snippet input({ inputProps })}
							<Input
								{...inputProps}
								type="number"
								step="0.1"
								min="0"
								value={selectedBox.tolerance}
								onchange={(e) =>
									onUpdateBox({
										tolerance: parseFloat((e.target as HTMLInputElement).value) || 0.5
									})}
							/>
						{/snippet}
						{#snippet end()}mm{/snippet}
					</FormControl>
					<FormControl label="Wall" name="wallThickness">
						{#snippet input({ inputProps })}
							<Input
								{...inputProps}
								type="number"
								step="0.5"
								min="1"
								value={selectedBox.wallThickness}
								onchange={(e) =>
									onUpdateBox({
										wallThickness: parseFloat((e.target as HTMLInputElement).value) || 2.0
									})}
							/>
						{/snippet}
						{#snippet end()}mm{/snippet}
					</FormControl>
					<FormControl label="Floor" name="floorThickness" class="formGrid__spanTwo">
						{#snippet input({ inputProps })}
							<Input
								{...inputProps}
								type="number"
								step="0.5"
								min="1"
								value={selectedBox.floorThickness}
								onchange={(e) =>
									onUpdateBox({
										floorThickness: parseFloat((e.target as HTMLInputElement).value) || 2.0
									})}
							/>
						{/snippet}
						{#snippet end()}mm{/snippet}
					</FormControl>
				</div>
			</div>

			<Hr />

			<div class="panelFormSection">
				<!-- Custom Size -->
				<h4 class="sectionTitle">Custom Size</h4>
				<p class="sectionHint">Leave empty for auto-sizing.</p>
				<Spacer size="0.5rem" />

				<div class="formGrid">
					<FormControl label="Width (min: {minimums.minWidth.toFixed(1)})" name="customWidth">
						{#snippet input({ inputProps })}
							<Input
								{...inputProps}
								type="number"
								step="0.5"
								min={minimums.minWidth}
								value={selectedBox.customWidth ?? ''}
								onchange={(e) => {
									const v = (e.target as HTMLInputElement).value.trim();
									onUpdateBox({ customWidth: v ? parseFloat(v) : undefined });
								}}
								placeholder="Auto"
							/>
						{/snippet}
						{#snippet end()}mm{/snippet}
					</FormControl>
					<FormControl label="Depth (min: {minimums.minDepth.toFixed(1)})" name="customDepth">
						{#snippet input({ inputProps })}
							<Input
								{...inputProps}
								type="number"
								step="0.5"
								min={minimums.minDepth}
								value={selectedBox.customDepth ?? ''}
								onchange={(e) => {
									const v = (e.target as HTMLInputElement).value.trim();
									onUpdateBox({ customDepth: v ? parseFloat(v) : undefined });
								}}
								placeholder="Auto"
							/>
						{/snippet}
						{#snippet end()}mm{/snippet}
					</FormControl>
					<FormControl
						label="Total Height (min: {minTotalHeight.toFixed(1)})"
						name="customBoxHeight"
						class="formGrid__spanTwo"
					>
						{#snippet input({ inputProps })}
							<Input
								{...inputProps}
								type="number"
								step="0.5"
								min={minTotalHeight}
								value={displayTotalHeight ?? ''}
								onchange={(e) => {
									const v = (e.target as HTMLInputElement).value.trim();
									// Convert total height to box-only height by subtracting lid
									const boxHeight = v ? parseFloat(v) - lidHeight : undefined;
									onUpdateBox({ customBoxHeight: boxHeight });
								}}
								placeholder="Auto"
							/>
						{/snippet}
						{#snippet end()}mm{/snippet}
					</FormControl>
				</div>

				<Spacer size="0.5rem" />
				<InputCheckbox
					checked={selectedBox.fillSolidEmpty ?? false}
					onchange={(e) => onUpdateBox({ fillSolidEmpty: (e.target as HTMLInputElement).checked })}
					label="Fill empty space solid"
				/>
			</div>
		</div>
	{:else}
		<div class="emptyState">
			<p class="emptyStateText">No box selected</p>
		</div>
	{/if}
</div>

<style>
	.boxesPanel {
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

	.formGrid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	:global(.formGrid__spanTwo) {
		grid-column: span 2;
	}

	.sectionTitle {
		margin-bottom: 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--fgMuted);
	}

	.sectionHint {
		font-size: 0.75rem;
		color: var(--fgMuted);
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
