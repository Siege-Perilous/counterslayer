<script lang="ts">
	import {
		Input,
		FormControl,
		Spacer,
		Hr,
		Select,
		IconButton,
		Icon,
		ColorPicker,
		ColorPickerSwatch,
		Popover
	} from '@tableslayer/ui';
	import { IconX, IconPlus } from '@tabler/icons-svelte';
	import type { Box, Tray } from '$lib/types/project';
	import {
		isCounterTray,
		isCardTray,
		isCardDividerTray,
		isCupTray,
		type CounterTray,
		type CardDrawTray,
		type CardDividerTray,
		type CupTray
	} from '$lib/types/project';
	import type { CounterTrayParams } from '$lib/models/counterTray';
	import type { CardDrawTrayParams } from '$lib/models/cardTray';
	import type { CardDividerTrayParams } from '$lib/models/cardDividerTray';
	import type { CupTrayParams } from '$lib/models/cupTray';
	import { getTrayDimensionsForTray } from '$lib/models/box';
	import {
		getProject,
		getCumulativeTrayLetter,
		moveTray,
		getCardSizes,
		getCounterShapes
	} from '$lib/stores/project.svelte';

	// Editor components
	import CounterTrayEditor from './panels/CounterTrayEditor.svelte';
	import CardDrawTrayEditor from './panels/CardDrawTrayEditor.svelte';
	import CardDividerTrayEditor from './panels/CardDividerTrayEditor.svelte';
	import CupTrayEditor from './panels/CupTrayEditor.svelte';

	interface Props {
		selectedBox: Box | null;
		selectedTray: Tray | null;
		onSelectTray: (tray: Tray) => void;
		onAddTray: (boxId: string) => void;
		onDeleteTray: (boxId: string, trayId: string) => void;
		onUpdateTray: (updates: Partial<Omit<Tray, 'id'>>) => void;
		onUpdateCounterParams?: (params: CounterTrayParams) => void;
		onUpdateCardParams?: (params: CardDrawTrayParams) => void;
		onUpdateCardDividerParams?: (params: CardDividerTrayParams) => void;
		onUpdateCupParams?: (params: CupTrayParams) => void;
		hideList?: boolean;
	}

	let {
		selectedBox,
		selectedTray,
		onSelectTray,
		onAddTray,
		onDeleteTray,
		onUpdateTray,
		onUpdateCounterParams,
		onUpdateCardParams,
		onUpdateCardDividerParams,
		onUpdateCupParams,
		hideList = false
	}: Props = $props();

	// Get current box index for cumulative tray letters
	let currentBoxIdx = $derived.by(() => {
		const project = getProject();
		if (!selectedBox) return 0;
		return project.boxes.findIndex((b) => b.id === selectedBox.id);
	});

	// Get the tray letter based on cumulative position across all boxes
	let trayLetter = $derived.by(() => {
		const project = getProject();
		if (!selectedBox || !selectedTray) return 'A';
		const boxIdx = project.boxes.findIndex((b) => b.id === selectedBox.id);
		const trayIdx = selectedBox.trays.findIndex((t) => t.id === selectedTray.id);
		if (boxIdx < 0 || trayIdx < 0) return 'A';
		return getCumulativeTrayLetter(project.boxes, boxIdx, trayIdx);
	});

	// Compute max tray height across all trays in the box (used for cup tray expansion)
	let maxTrayHeight = $derived.by(() => {
		if (!selectedBox) return 0;
		const cardSizes = getCardSizes();
		const counterShapes = getCounterShapes();
		return Math.max(
			...selectedBox.trays.map(
				(tray) => getTrayDimensionsForTray(tray, cardSizes, counterShapes).height
			),
			0
		);
	});

	function getTrayStats(tray: Tray): {
		stacks: number;
		counters: number;
		isCardTray: boolean;
		isCardDivider: boolean;
		isCupTray: boolean;
	} {
		if (isCupTray(tray)) {
			const cupCount = tray.params.rows * tray.params.columns;
			return {
				stacks: cupCount,
				counters: cupCount,
				isCardTray: false,
				isCardDivider: false,
				isCupTray: true
			};
		}
		if (isCardDividerTray(tray)) {
			const totalCards = tray.params.stacks.reduce((sum, s) => sum + s.count, 0);
			return {
				stacks: tray.params.stacks.length,
				counters: totalCards,
				isCardTray: false,
				isCardDivider: true,
				isCupTray: false
			};
		}
		if (isCardTray(tray)) {
			return {
				stacks: 1,
				counters: tray.params.cardCount,
				isCardTray: true,
				isCardDivider: false,
				isCupTray: false
			};
		}
		// Counter tray
		const topCount = tray.params.topLoadedStacks.reduce((sum, s) => sum + s[1], 0);
		const edgeCount = tray.params.edgeLoadedStacks.reduce((sum, s) => sum + s[1], 0);
		return {
			stacks: tray.params.topLoadedStacks.length + tray.params.edgeLoadedStacks.length,
			counters: topCount + edgeCount,
			isCardTray: false,
			isCardDivider: false,
			isCupTray: false
		};
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
						title="{tray.name}, tray {letter}, {stats.isCardTray
							? stats.counters + ' cards'
							: stats.isCardDivider
								? stats.counters + ' cards in ' + stats.stacks + ' stacks'
								: stats.isCupTray
									? stats.stacks + ' cups'
									: stats.counters + ' counters in ' + stats.stacks + ' stacks'}"
					>
						<span style="overflow: hidden; text-overflow: ellipsis;">{tray.name}</span>
						<span style="display: flex; align-items: center; gap: 0.25rem;">
							<span class="trayStats"
								>{letter}: {stats.isCardTray
									? stats.counters + ' cards'
									: stats.isCardDivider
										? stats.counters + ' cards/' + stats.stacks + 's'
										: stats.isCupTray
											? stats.stacks + ' cups'
											: stats.counters + 'c in ' + stats.stacks + 's'}</span
							>
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

			{#if isCounterTray(selectedTray) && onUpdateCounterParams}
				<CounterTrayEditor
					tray={selectedTray as CounterTray}
					{trayLetter}
					onUpdateParams={onUpdateCounterParams}
					actualHeight={maxTrayHeight}
				/>
			{:else if isCardDividerTray(selectedTray) && onUpdateCardDividerParams}
				<CardDividerTrayEditor
					tray={selectedTray as CardDividerTray}
					{trayLetter}
					onUpdateParams={onUpdateCardDividerParams}
					actualHeight={maxTrayHeight}
				/>
			{:else if isCardTray(selectedTray) && onUpdateCardParams}
				<CardDrawTrayEditor
					tray={selectedTray as CardDrawTray}
					onUpdateParams={onUpdateCardParams}
					actualHeight={maxTrayHeight}
				/>
			{:else if isCupTray(selectedTray) && onUpdateCupParams}
				<CupTrayEditor
					tray={selectedTray as CupTray}
					onUpdateParams={onUpdateCupParams}
					actualHeight={maxTrayHeight}
				/>
			{/if}
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

	.trayStats {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--fgMuted);
	}
</style>
