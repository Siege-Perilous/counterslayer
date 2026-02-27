<script lang="ts">
	import {
		Button,
		IconButton,
		Icon,
		ConfirmActionButton,
		Hr,
		Spacer,
		Panel
	} from '@tableslayer/ui';
	import { IconX, IconPlus, IconChevronDown, IconChevronRight } from '@tabler/icons-svelte';
	import {
		getProject,
		getSelectedBox,
		getSelectedTray,
		selectBox,
		selectTray,
		addBox,
		deleteBox,
		addTray,
		deleteTray,
		type Box,
		type Tray
	} from '$lib/stores/project.svelte';

	type SelectionType = 'dimensions' | 'box' | 'tray';

	interface Props {
		selectionType: SelectionType;
		onSelectionChange: (type: SelectionType) => void;
		onExpandPanel: () => void;
	}

	let { selectionType, onSelectionChange, onExpandPanel }: Props = $props();

	let project = $derived(getProject());
	let selectedBox = $derived(getSelectedBox());
	let selectedTray = $derived(getSelectedTray());

	// Track which boxes are collapsed in the tree view
	let collapsedBoxes = $state<Set<string>>(new Set());

	function toggleBoxCollapse(boxId: string, e: Event) {
		e.stopPropagation();
		const newSet = new Set(collapsedBoxes);
		if (newSet.has(boxId)) {
			newSet.delete(boxId);
		} else {
			newSet.add(boxId);
		}
		collapsedBoxes = newSet;
	}

	function handleDimensionsClick() {
		onSelectionChange('dimensions');
		onExpandPanel();
	}

	function handleBoxClick(box: Box) {
		selectBox(box.id);
		onSelectionChange('box');
		onExpandPanel();
	}

	function handleTrayClick(tray: Tray, box: Box) {
		selectBox(box.id);
		selectTray(tray.id);
		onSelectionChange('tray');
		onExpandPanel();
	}

	function handleAddBox() {
		addBox();
		onSelectionChange('box');
		onExpandPanel();
	}

	function handleAddTray(boxId: string, e: Event) {
		e.stopPropagation();
		addTray(boxId);
		onSelectionChange('tray');
		onExpandPanel();
	}

	function handleDeleteBox(boxId: string) {
		deleteBox(boxId);
		// If we deleted the selected box, switch to dimensions
		if (selectedBox?.id === boxId) {
			onSelectionChange('dimensions');
		}
	}

	function handleDeleteTray(boxId: string, trayId: string) {
		deleteTray(boxId, trayId);
		// If we deleted the selected tray, switch to box view
		if (selectedTray?.id === trayId) {
			onSelectionChange('box');
		}
	}

	function getTrayStats(tray: Tray): { stacks: number; counters: number } {
		const topCount = tray.params.topLoadedStacks.reduce((sum, s) => sum + s[1], 0);
		const edgeCount = tray.params.edgeLoadedStacks.reduce((sum, s) => sum + s[1], 0);
		return {
			stacks: tray.params.topLoadedStacks.length + tray.params.edgeLoadedStacks.length,
			counters: topCount + edgeCount
		};
	}
</script>

<Panel class="navMenu">
	<!-- Dimensions (Globals) -->
	<button
		class="navItem {selectionType === 'dimensions' ? 'navItem--selected' : ''}"
		onclick={handleDimensionsClick}
	>
		Dimensions
	</button>
	<Hr />

	<!-- Boxes and Trays -->
	<div class="navTree">
		{#each project.boxes as box (box.id)}
			{@const isBoxSelected = selectedBox?.id === box.id && selectionType === 'box'}
			{@const isCollapsed = collapsedBoxes.has(box.id)}

			<div class="navBoxGroup">
				<!-- Box Item -->
				<div class="navItem navItem--box {isBoxSelected ? 'navItem--selected' : ''}">
					<button
						class="navItemCollapse"
						onclick={(e) => toggleBoxCollapse(box.id, e)}
						title={isCollapsed ? 'Expand' : 'Collapse'}
					>
						<Icon Icon={isCollapsed ? IconChevronRight : IconChevronDown} size="1rem" />
					</button>
					<button class="navItemLabel" onclick={() => handleBoxClick(box)}>
						{box.name}
					</button>
					{#if project.boxes.length > 1}
						<ConfirmActionButton
							action={() => handleDeleteBox(box.id)}
							actionButtonText="Delete box"
							positioning={{ placement: 'right' }}
						>
							{#snippet trigger({ triggerProps })}
								<IconButton {...triggerProps} size="sm" variant="ghost" title="Delete box">
									<Icon Icon={IconX} size="1rem" color="var(--fgMuted)" />
								</IconButton>
							{/snippet}
							{#snippet actionMessage()}
								<p>Delete this box and all its trays?</p>
							{/snippet}
						</ConfirmActionButton>
					{/if}
				</div>

				<!-- Trays within Box -->
				{#if !isCollapsed}
					<div class="navTrayList">
						{#each box.trays as tray, trayIdx (tray.id)}
							{@const isTraySelected =
								selectedTray?.id === tray.id &&
								selectedBox?.id === box.id &&
								selectionType === 'tray'}
							{@const letter = String.fromCharCode(65 + trayIdx)}
							{@const stats = getTrayStats(tray)}

							<div class="navItem navItem--tray {isTraySelected ? 'navItem--selected' : ''}">
								<button
									class="navItemLabel"
									onclick={() => handleTrayClick(tray, box)}
									title="{tray.name} ({letter}: {stats.counters}c in {stats.stacks}s)"
								>
									<span class="trayLetter">{letter}</span>
									{tray.name}
								</button>
								{#if box.trays.length > 1}
									<ConfirmActionButton
										action={() => handleDeleteTray(box.id, tray.id)}
										actionButtonText="Delete tray"
										positioning={{ placement: 'right' }}
									>
										{#snippet trigger({ triggerProps })}
											<IconButton {...triggerProps} size="sm" variant="ghost" title="Delete tray">
												<Icon Icon={IconX} size="1rem" color="var(--fgMuted)" />
											</IconButton>
										{/snippet}
										{#snippet actionMessage()}
											<p>Delete this tray?</p>
										{/snippet}
									</ConfirmActionButton>
								{/if}
							</div>
						{/each}

						<!-- Add Tray Button -->
						<Button variant="link" size="sm" onclick={(e) => handleAddTray(box.id, e)}>
							{#snippet start()}
								<Icon Icon={IconPlus} size="1rem" />
							{/snippet}
							Add tray
						</Button>
					</div>
				{/if}
			</div>
		{/each}

		<!-- Add Box Button -->
		<Button variant="link" size="sm" onclick={handleAddBox}>
			{#snippet start()}
				<Icon Icon={IconPlus} size="1rem" />
			{/snippet}
			Add box
		</Button>
	</div>
</Panel>

<style>
	:global(.navMenu) {
		position: fixed;
		top: 4rem;
		left: 1.5rem;
		z-index: 100;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.5rem;
		min-width: 12rem;
		max-width: 16rem;
		max-height: calc(100vh - 8rem);
		overflow-y: auto;
	}

	.navItem {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		border-radius: var(--radius-2);
		font-size: 0.875rem;
		background: transparent;
		border: none;
		color: var(--fg);
		cursor: pointer;
		text-align: left;
		width: 100%;
	}

	.navItem:hover {
		background: var(--contrastLow);
	}

	.navItem--selected {
		background: var(--contrastMedium);
		font-weight: 600;
	}

	.navItem--dimensions {
		padding: 0.5rem;
		font-weight: 600;
		text-transform: uppercase;
		font-size: 0.75rem;
		letter-spacing: 0.05em;
		color: var(--fgMuted);
	}

	.navItem--dimensions.navItem--selected {
		color: var(--fgPrimary);
	}

	.navTree {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.navBoxGroup {
		display: flex;
		flex-direction: column;
	}

	.navItem--box {
		font-weight: 500;
	}

	.navItemCollapse {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--fgMuted);
		width: 1.25rem;
		height: 1.25rem;
		flex-shrink: 0;
	}

	.navItemCollapse:hover {
		color: var(--fg);
	}

	.navItemLabel {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0;
		background: none;
		border: none;
		cursor: pointer;
		color: inherit;
		font: inherit;
		text-align: left;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.navTrayList {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;

		.navItem {
			padding-left: 2rem;
		}
	}

	.navItem--tray {
		font-size: 0.8125rem;
	}

	.trayLetter {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		color: var(--fgMuted);
		width: 1rem;
		flex-shrink: 0;
	}

	.navAddBoxWrapper {
		margin-top: 0.5rem;
		padding-top: 0.5rem;
		border-top: var(--borderThin);
	}

	/* Mobile styles */
	@media (max-width: 768px) {
		.navMenu {
			position: fixed;
			top: auto;
			bottom: 0;
			left: 0;
			right: 0;
			max-width: none;
			max-height: 40vh;
			border-radius: var(--radius-2) var(--radius-2) 0 0;
			border-bottom: none;
		}
	}
</style>
