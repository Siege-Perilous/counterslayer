<script lang="ts">
	import { IconButton, Icon, ConfirmActionButton, Hr, Panel, Popover, Text } from '@tableslayer/ui';
	import { IconX, IconPackage, IconRuler } from '@tabler/icons-svelte';
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
		getCumulativeTrayLetter,
		isCardTray,
		isCardDividerTray,
		isCupTray,
		type Box,
		type Tray,
		type TrayType
	} from '$lib/stores/project.svelte';
	import { countCups } from '$lib/types/cupLayout';

	type SelectionType = 'dimensions' | 'box' | 'tray';

	interface Props {
		selectionType: SelectionType;
		onSelectionChange: (type: SelectionType) => void;
		onExpandPanel: () => void;
		isMobile?: boolean;
	}

	let { selectionType, onSelectionChange, onExpandPanel, isMobile = false }: Props = $props();

	let project = $derived(getProject());
	let selectedBox = $derived(getSelectedBox());
	let selectedTray = $derived(getSelectedTray());

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

	function handleAddBox(trayType: TrayType) {
		addBox(trayType);
		onSelectionChange('tray');
		onExpandPanel();
	}

	function handleAddTray(boxId: string, trayType: TrayType) {
		addTray(boxId, trayType);
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

	function getTrayStats(tray: Tray): {
		stacks: number;
		counters: number;
		isCardTray: boolean;
		isCardDivider: boolean;
		isCupTray: boolean;
	} {
		if (isCupTray(tray)) {
			const cupTotal = countCups(tray.params.layout);
			return {
				stacks: cupTotal,
				counters: cupTotal,
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
</script>

<Panel class="navMenu {isMobile ? 'navMenu--mobile' : ''}">
	<!-- Dimensions (Globals) -->
	<button
		class="navItem navItem--dimensions {selectionType === 'dimensions' ? 'navItem--selected' : ''}"
		onclick={handleDimensionsClick}
	>
		<span class="navItemIcon">
			<Icon Icon={IconRuler} size="1rem" />
		</span>
		Dimensions
	</button>
	<Hr />

	<!-- Boxes and Trays -->
	<div class="navTree">
		{#each project.boxes as box, boxIdx (box.id)}
			{@const isBoxSelected = selectedBox?.id === box.id && selectionType === 'box'}

			<div class="navBoxGroup">
				<!-- Box Item -->
				<button
					class="navItem navItem--box {isBoxSelected ? 'navItem--selected' : ''}"
					onclick={() => handleBoxClick(box)}
				>
					<span class="navItemIcon">
						<Icon Icon={IconPackage} size="1rem" />
					</span>
					<span class="navItemLabel">
						{box.name}
					</span>
					{#if project.boxes.length > 1}
						<span
							class="navItemDelete"
							role="none"
							onclick={(e) => e.stopPropagation()}
							onkeydown={(e) => e.stopPropagation()}
						>
							<ConfirmActionButton
								action={() => handleDeleteBox(box.id)}
								actionButtonText="Delete box"
								positioning={{ placement: 'right' }}
								portal=".appContainer"
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
						</span>
					{/if}
				</button>

				<!-- Trays within Box -->
				<div class="navTrayList">
					{#each box.trays as tray, trayIdx (tray.id)}
						{@const isTraySelected =
							selectedTray?.id === tray.id &&
							selectedBox?.id === box.id &&
							selectionType === 'tray'}
						{@const letter = getCumulativeTrayLetter(project.boxes, boxIdx, trayIdx)}
						{@const stats = getTrayStats(tray)}

						<button
							class="navItem navItem--tray {isTraySelected ? 'navItem--selected' : ''}"
							onclick={() => handleTrayClick(tray, box)}
							title="{tray.name} ({letter}: {stats.isCardTray
								? stats.counters + ' cards'
								: stats.isCardDivider
									? stats.counters + ' cards/' + stats.stacks + 's'
									: stats.isCupTray
										? stats.stacks + ' cups'
										: stats.counters + 'c in ' + stats.stacks + 's'})"
						>
							<span class="navItemLabel">
								<span class="trayLetter">{letter}</span>
								{tray.name}
							</span>
							{#if box.trays.length > 1}
								<span
									class="navItemDelete"
									role="none"
									onclick={(e) => e.stopPropagation()}
									onkeydown={(e) => e.stopPropagation()}
								>
									<ConfirmActionButton
										action={() => handleDeleteTray(box.id, tray.id)}
										actionButtonText="Delete tray"
										positioning={{ placement: 'right' }}
										portal=".appContainer"
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
								</span>
							{/if}
						</button>
					{/each}

					<!-- Add Tray Button with Popover -->
					<Popover
						positioning={{ placement: 'right-start' }}
						portal=".appContainer"
						contentClass="trayTypePopover"
					>
						{#snippet trigger()}
							<button class="navItem navItem--add navItem--tray">
								<span class="addIcon">+</span>
								<span class="addLabel">Add tray</span>
							</button>
						{/snippet}
						{#snippet content({ contentProps })}
							<button
								class="trayTypeOption"
								onclick={() => {
									handleAddTray(box.id, 'counter');
									contentProps.close();
								}}
							>
								<Text weight={500}>Counters</Text>
								<Text size="0.75rem" color="var(--fgMuted)">Stacks of geometric tokens</Text>
							</button>
							<button
								class="trayTypeOption"
								onclick={() => {
									handleAddTray(box.id, 'cardDraw');
									contentProps.close();
								}}
							>
								<Text weight={500}>Card draw</Text>
								<Text size="0.75rem" color="var(--fgMuted)"
									>Single stack of cards, draw from top</Text
								>
							</button>
							<button
								class="trayTypeOption"
								onclick={() => {
									handleAddTray(box.id, 'cardDivider');
									contentProps.close();
								}}
							>
								<Text weight={500}>Card divider</Text>
								<Text size="0.75rem" color="var(--fgMuted)"
									>Divided stacks of cards, divided by walls</Text
								>
							</button>
							<button
								class="trayTypeOption"
								onclick={() => {
									handleAddTray(box.id, 'cup');
									contentProps.close();
								}}
							>
								<Text weight={500}>Cups</Text>
								<Text size="0.75rem" color="var(--fgMuted)">Segmented cups for loose ojbects</Text>
							</button>
						{/snippet}
					</Popover>
				</div>
				<Hr />
			</div>
		{/each}

		<!-- Add Box Button with Popover -->
		<Popover
			positioning={{ placement: 'right-start' }}
			portal=".appContainer"
			contentClass="trayTypePopover"
		>
			{#snippet trigger()}
				<button class="navItem navItem--add">
					<span class="addIcon">+</span>
					<span class="addLabel">Add box</span>
				</button>
			{/snippet}
			{#snippet content({ contentProps })}
				<button
					class="trayTypeOption"
					onclick={() => {
						handleAddBox('counter');
						contentProps.close();
					}}
				>
					<Text weight={500}>Counters</Text>
					<Text size="0.75rem" color="var(--fgMuted)">Stacks of geometric tokens</Text>
				</button>
				<button
					class="trayTypeOption"
					onclick={() => {
						handleAddBox('cardDraw');
						contentProps.close();
					}}
				>
					<Text weight={500}>Card draw</Text>
					<Text size="0.75rem" color="var(--fgMuted)">Single stack of cards, draw from top</Text>
				</button>
				<button
					class="trayTypeOption"
					onclick={() => {
						handleAddBox('cardDivider');
						contentProps.close();
					}}
				>
					<Text weight={500}>Card divider</Text>
					<Text size="0.75rem" color="var(--fgMuted)"
						>Divided stacks of cards, divided by walls</Text
					>
				</button>
				<button
					class="trayTypeOption"
					onclick={() => {
						handleAddBox('cup');
						contentProps.close();
					}}
				>
					<Text weight={500}>Cup tray</Text>
					<Text size="0.75rem" color="var(--fgMuted)">Bowl-shaped cups for dice and tokens</Text>
				</button>
			{/snippet}
		</Popover>
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
		padding: 0;
		min-width: 12rem;
		max-width: 16rem;
		max-height: calc(100vh - 8rem);
		overflow-y: auto;
	}

	.navItem {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 2rem;
		padding: 0 0.5rem;
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
		box-shadow: inset 3px 0 0 var(--fgPrimary);
	}

	.navItem--add {
		color: var(--fgMuted);
	}

	.navItem--add:hover {
		color: var(--fg);
	}

	.navItemIcon,
	.trayLetter,
	.addIcon {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 1rem;
		color: var(--fgMuted);
		font-family: var(--font-mono);
		font-size: 0.625rem;
	}

	.navItemIcon {
		width: 1.25rem;
	}

	.navItemLabel {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.navItemDelete {
		opacity: 0;
	}

	.navItem:hover .navItemDelete {
		opacity: 1;
	}

	.navTree {
		display: flex;
		flex-direction: column;
	}

	.navBoxGroup {
		display: flex;
		flex-direction: column;
	}

	.navTrayList {
		display: flex;
		flex-direction: column;

		.navItem {
			padding-left: 2rem;
		}
	}

	.addLabel {
		flex: 1;
	}

	/* Mobile styles - inline nav panel, not fixed */
	:global(.navMenu--mobile) {
		position: relative;
		top: auto;
		left: auto;
		max-width: none;
		max-height: none;
		border-radius: 0;
		overflow-y: auto;
		flex: 1;
		min-height: 0;
	}

	/* Tray type popover */
	:global(.popContent.trayTypePopover) {
		display: flex;
		flex-direction: column;
		min-width: 14rem;
		padding: 0 !important;
		background: var(--contrastLowest) !important;
	}

	:global(.trayTypeOption) {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 0;
		background: transparent;
		cursor: pointer;
		text-align: left;
		transition: background 0.15s ease;
	}

	:global(.trayTypeOption:not(:last-child)) {
		border-bottom: var(--borderThin);
	}

	:global(.trayTypeOption:hover) {
		background: var(--contrastLow);
	}
</style>
